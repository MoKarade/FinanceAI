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
