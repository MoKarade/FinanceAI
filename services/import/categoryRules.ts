// services/import/categoryRules.ts
//
// [TX-CATEGORY-RULES] — catégorisation DÉTERMINISTE des transactions par règles sur le payee.
// Demande Marc 2026-07-15 (« les catégories des transactions sont très mal réglées ») : les
// règles couvrent ~88 % de son corpus réel (mesuré sur 1 995 transactions extraites de 37
// relevés Desjardins compte + MasterCard, 2025-01 → 2026-07) — gratuites, instantanées,
// reproductibles. L'IA (categorizeBatch, clé Anthropic) ne sert QU'EN SECOURS sur le reste.
//
// PRIORITÉ : premières règles gagnent (spécifique avant générique — ex. « Virement envoyé à
// /Loyer » doit tomber en Logement AVANT la règle Interac générique). Matching sur payee
// NORMALISÉ (accents strippés, MAJUSCULES) → les regex sont écrites SANS accents.
// Pur, zéro dépendance — utilisable par l'app (import CSV, bouton Classer) ET le MCP.

/** Jeu de catégories canonique produit par les règles (le Budget s'aligne dessus — Lot C). */
export const RULE_CATEGORIES = [
    'Salaire',
    'Revenus divers',
    'Logement',
    'Transfert',
    'Assurances',
    'Frais bancaires',
    'Épicerie',
    'Restaurants',
    'Transport',
    'Abonnements',
    'Santé',
    'Loisirs',
    'Magasinage',
    'Voyages',
    'Impôts',
    'Autre',
] as const;

export type RuleCategory = (typeof RULE_CATEGORIES)[number];

// ─── [MCP-CATEGORY-ALLOWLIST] Allowlist canonique de catégories (partagée) ───
// Une catégorie CANDIDATE issue d'un texte LIBRE écrit par l'IA (tool MCP apply_bank_statement,
// categorizeBatch) ne doit JAMAIS entrer verbatim dans les données : hors du jeu canonique, le
// rapprochement fuzzy partagé (réel/moyenne/grand livre) peut l'absorber sous un poste au nom
// englobant (« Sport » ⊂ « Tran-sport ») sans trace (finding silent-failure-hunter PR #501/#502).
// Helpers PURS consommés par mcp/ingest/applyDocument.ts ET services/claude.ts (une seule source,
// pas deux copies qui dérivent — leçon AITOOLS-SEC).

/** Clé de comparaison insensible casse/accents (« epicerie » ≡ « Épicerie »). */
export const categoryKey = (s: string): string =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Map clé normalisée → forme CANONIQUE. En cas de collision de clé, le DERNIER nom fourni gagne
 * (l'appelant place ses noms prioritaires en fin de liste — ex. applyDocument met les postes de
 * budget APRÈS RULE_CATEGORIES : le poste, cible réelle de réconciliation, impose sa casse).
 */
export function buildCategoryCanonicalMap(names: readonly string[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const raw of names) {
        const name = raw?.trim();
        if (name) m.set(categoryKey(name), name);
    }
    return m;
}

/**
 * Résout une catégorie candidate vers l'allowlist : canonique → forme canonique ; hors liste ou
 * absente → règles déterministes sur le payee, sinon `fallback`. `remapped` n'est vrai que pour
 * une candidate FOURNIE et hors liste (une absence n'est pas un remap — l'appelant COMPTE les
 * remaps et les signale, jamais une re-catégorisation silencieuse).
 */
export function resolveCandidateCategory(
    candidate: string | undefined | null,
    allowed: ReadonlyMap<string, string>,
    payee: string,
    fallback: string,
): { category: string; remapped: boolean } {
    const canonical = candidate ? allowed.get(categoryKey(candidate)) : undefined;
    if (canonical) return { category: canonical, remapped: false };
    return { category: ruleCategorize(payee) ?? fallback, remapped: !!candidate };
}

const normalizePayee = (s: string): string =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();

// (regex sur payee normalisé) → catégorie. Ordre = priorité.
const RULES: ReadonlyArray<readonly [RegExp, RuleCategory]> = [
    // — Revenus —
    [/\b(PAIE|PAYROLL)\b|SERVICE DE PAIE/, 'Salaire'],
    // « INTERET SUR/INTEREST ON » (formes réelles des relevés : « Intérêt sur ET », « Interest
    // on TS ») — jamais le mot NU : « FRAIS DE PROVISION INTERET » est une CHARGE, pas un revenu
    // (finding panel ; les intérêts facturés carte = « FRAIS DE CRÉDIT » → Frais bancaires).
    [/RISTOURNE|INTERET SUR|INTEREST ON|CREDIT REMISES|DEPOT DIRECT|TRANSFERT DE FONDS RECU/, 'Revenus divers'],
    [/VIREMENT INTERAC DE\b|E-TRANSFER.*(RECU|RECEIVED)/, 'Revenus divers'],
    // — Logement (AVANT les virements génériques : « Virement envoyé à … /Loyer ») —
    [/LOYER|HYDRO-?QUEBEC|ENERGIR|\bBAIL\b/, 'Logement'],
    // — Transferts internes / placements (mouvements, pas des dépenses) —
    [/DESJARDINS (REMISES|CASH ?BACK) ?MASTERCAR?D?|PAIEMENT CAISSE|AVANCE D.ARGENT/, 'Transfert'],
    [/VIREMENT - ACCESD|VIREMENT DISNAT|WEALTHSIMPLE|QUESTRADE|PLACEMENT \/|RETRAIT EPARGNE|VIREMENT EPARGNE|\/ CONJOINT/, 'Transfert'],
    // — Assurances / frais / impôts —
    // SAAQ AVANT le mot générique ASSURANCE : « SAAQ — Société de l'ASSURANCE automobile… »
    // est de l'immatriculation/permis (Transport), pas une prime (finding panel, ordre prouvé).
    [/\bSAAQ\b/, 'Transport'],
    [/ASSURANCE|DESJARDINS ASS|INTACT|BENEVA|\bSSQ\b/, 'Assurances'],
    [/FRAIS FIXES|FRAIS DE CREDIT|FIXED SERVICE|FRAIS D.UTILISATION|FRAIS AU GA|FRAIS GUICHET|FRAIS INTERAC/, 'Frais bancaires'],
    [/PAYEMENT IMPOT|IMPOT (FEDERAL|QUEBEC)|REVENU QUEBEC|AGENCE DU REVENU/, 'Impôts'],
    // — Interac sortant vers une PERSONNE : AVANT les règles MARCHANDES (finding panel : un
    // destinataire nommé Bell/Wendy/Brunet/Simons/Normandin matcherait sinon une enseigne →
    // « Abonnements »/« Restaurants »… en silence). Les cas spécifiques /Loyer et /Conjoint
    // sont interceptés PLUS HAUT (Logement, Transfert) — ici le générique.
    [/VIREMENT INTERAC A\b|VIREMENT ENVOYE A/, 'Autre'],
    // — Épicerie —
    [/\bIGA\b|\bMAXI\b|\bMETRO\b|PROVIGO|SUPER C|COSTCO WHOLESALE|WAL-?MART|FRUITERIE|PROVISION STE|\bPROVISIONS\b|MARCHE |EPICERIE|\bSAQ\b|SAQ\d|DEPANNEUR|ACCOMMODATION|ADONIS/, 'Épicerie'],
    // — Restaurants —
    [/TIM HORTONS|MCDONALD|UBEREATS|BRASSERI|MICROBRASSERI|RESTO|SUSHI|SUBWAY|\bA&W\b|PIZZ|POUTINE|ST-HUBERT|BURGER|WENDY|\bKFC\b|\bPFK\b|DOMINO|VALENTINE|NORMANDIN|ASHTON|TACO|SHAWARMA|\bCAFE\b|\bBAR\b|BISTRO|\bPUB\b|TAVERNE|\bGRILL\b|CANTINE|CREMERIE|FROMAGERIE/, 'Restaurants'],
    // — Transport —
    [/SONIC|PETRO-?CAN|\bESSO\b|SHELL|ULTRAMAR|COSTCO ESSENCE|COUCHE.?TARD|UBERTRIP|COMMUNAUTO|\bSTM\b|\bRTC\b|STATIONNEMENT|PARC INDIGO|PETROLES|AIR-SERV|\bCAA\b|GARAGE|PNEUS/, 'Transport'],
    // — Abonnements (télécom + numériques) —
    [/NETFLIX|CRUNCHYROLL|SPOTIFY|DISNEY|GOOGLE \*|CAPCUT|BOOSTEROID|VIRGIN PLUS|VIDEOTRON|\bBELL\b|\bTELUS\b|\bFIZZ\b|CLAUDE\.AI|OPENAI|WINDSURF|APPLE\.COM|AMAZON PRIME|YOUTUBE|TWITCH|PATREON|MICROSOFT|ADOBE|\bICLOUD\b/, 'Abonnements'],
    // — Santé —
    [/BRUNET|PHARMAPRIX|JEAN COUTU|UNIPRIX|ECONOFITNESS|\bGYM\b|CLINIQUE|DENTAIRE|OPTOMETR|PHYSIO|MASSOTHERAP/, 'Santé'],
    // — Loisirs —
    [/STEAM|PLAYSTATION|NINTENDO|CINEMA|CINEPLEX|VILLAGE VACANCES|VAPOSHOP|VAP BOUTIQUE|\bVAPE\b|SQDC|EMPORIUM|LIBRAIRIE|SPECTACLE|MUSEE|SEPAQ|PARC OMEGA|FESTIVAL|ARCADE|QUILLES|ESCALADE|GLISSADES/, 'Loisirs'],
    // — Magasinage —
    [/WINNERS|DOLLARAMA|CANADIAN TIRE|\bAMZN\b|AMAZON|BEST ?BUY|\bIKEA\b|SIMONS|SPORTS EXPERTS|DECATHLON|HOME DEPOT|\bRONA\b|BUREAU EN GROS|VILLAGE DES VALEURS|MICHAELS|FRIPERIE/, 'Magasinage'],
    // — Voyages —
    [/AIRBNB|AIR TRANSAT|AIR CANADA|HOTEL|EXPEDIA|BOOKING|\bFLAIR\b|PORTER|VIA RAIL/, 'Voyages'],
];

/**
 * Catégorise un payee par règles. `null` si aucune règle ne matche (→ candidat IA/`Uncategorized`).
 * Déterministe et pur : même entrée, même sortie, zéro réseau.
 */
export function ruleCategorize(payee: string): RuleCategory | null {
    if (!payee) return null;
    const p = normalizePayee(payee);
    for (const [rx, cat] of RULES) {
        if (rx.test(p)) return cat;
    }
    return null;
}
