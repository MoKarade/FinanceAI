// services/verifierTypesRestaures.ts
//
// [BACKUP-SCHEMA-NON-TYPE] La garde de TYPE des DEUX entrées non validées de l'app.
//
// Le lot 38 a posé une garde de FINITUDE à la frontière du moteur : elle scanne intégralement les
// paramètres assemblés et refuse un `NaN` ou un `Infinity` en nommant le champ. Sa 4ᵉ passe a montré
// ce qu'elle ne peut pas voir : une CHAÎNE. `nonFinisRecursifs` teste `typeof === 'number'` et sort
// sur tout le reste, donc `"15000"` dans un montant traverse toute l'arithmétique sans jamais
// devenir non fini. MESURÉ, persona `couple-confort`, horizon 30 ans :
//
//   · une chaîne dans un montant de projet immobilier → patrimoine final **−52 %** (−3 095 835 $),
//     0 refus, 0 valeur non finie publiée sur 361 points ;
//   · `projection.inflationRate = "2"` → **−68 M$**, 0 refus, courbe lisse.
//
// ⚠️ IL Y A DEUX VECTEURS, ET LE TICKET N'EN NOMMAIT QU'UN. `buildBackupPayload`
// (`components/Settings.tsx`) n'exporte PAS `projection` : le canal à −68 M$ passe par le blob du
// store (`financeai-storage`, `createJSONStorage` = `JSON.parse` sans validation, persisté en
// localStorage ET poussé sur Drive). Durcir le backup seul l'aurait laissé grand ouvert.
//
// ⚠️ DÉCISIONS DE MARC (2026-08-29), qui fixent la forme de ce module :
//   · QUOI — **refuser et nommer le champ**, comme au lot 38. Jamais coercer `"15000"` en 15000 :
//     fabriquer une valeur plausible est ce que `no-fake-data` interdit, et une restauration
//     partielle produirait un état que personne n'a saisi.
//   · COMMENT — **lister les champs TEXTE**, pas les champs numériques. Les deux listes existent
//     (mesuré : 89 clés textuelles contre 213 champs numériques dans `types.ts`), mais elles
//     n'échouent pas dans le même sens, et c'est tout le critère retenu au lot 38 : le bon test
//     n'est pas « reste-t-il une liste ? » mais **« qu'est-ce que son oubli coûte ? »**.
//     Oublier un champ NUMÉRIQUE rouvre un canal money-critical EN SILENCE ; oublier un champ TEXTE
//     donne un faux refus BRUYANT, que le canari de `tests/services/verifierTypesRestaures.test.ts`
//     transforme en échec de CI avant qu'il n'atteigne qui que ce soit.
//
// ⚠️ CE QUE CE MODULE NE COUVRE PAS, et il faut le dire plutôt que de le laisser croire : le canal
// mesuré est la CHAÎNE, et c'est lui qui est fermé. Un booléen dans un champ monétaire
// (`true + 1 === 2`) passerait encore — le fermer demanderait une seconde liste, celle des champs
// booléens, qui n'a pas été mesurée. Consigné au BACKLOG plutôt que traité à la va-vite.

// ⚠️ COÛT, mesuré — et il est de nature OPPOSÉE à celui de la garde du moteur, qu'il ne faut pas
// confondre avec elle. Celle du lot 38 scanne les `SimulationParams`, un objet BORNÉ (149 nœuds, que
// le portefeuille grossisse ou non). Celle-ci scanne l'ÉTAT ENTIER, donc son coût est LINÉAIRE en
// nombre de transactions : 0,12 ms sur un ménage nominal, 6 ms à 5 000 transactions, 62 ms à 50 000.
//
// C'est acceptable parce que le moment n'est pas le même : elle tourne au BOOT (le `merge` de
// zustand), à chaque `persist.rehydrate()` — donc après un pull Drive — et à l'import d'un backup.
// Jamais dans une boucle de rendu ni à la frappe. Mais l'écrire « négligeable » sans le nombre
// serait la même approximation que « le coût ne grandit pas avec les données », corrigée au lot 38 :
// il grandit, simplement à un endroit où on peut le payer.

/** Un champ dont le TYPE est inexploitable, avec de quoi le nommer à l'écran ET le retrouver. */
export interface ChampMalType {
    /** Chemin technique complet, pour le journal et les tests (ex. `realEstateGoals[0].closingCosts`). */
    readonly chemin: string;
    /** La clé feuille — c'est elle qui décide, et c'est elle qu'on montre. */
    readonly cle: string;
    /** La valeur fautive TELLE QUELLE, jamais convertie (`no-fake-data` vaut dans un diagnostic). */
    readonly valeur: unknown;
}

/**
 * Les clés dont une valeur TEXTUELLE est légitime. Tout le reste doit être un nombre, un booléen,
 * un objet ou `null`.
 *
 * ⚠️ DÉRIVATION, parce qu'une liste de 89 noms écrite à la main serait une liste inventée : elle est
 * l'union de deux sources indépendantes —
 *   1. les champs de `types.ts` dont le type est textuel, alias de types résolus (85 noms). C'est le
 *      CONTRAT, donc une source non circulaire ;
 *   2. les clés portant réellement une chaîne dans les états du dépôt (34 noms, 7 personas + état
 *      initial du store). Quatre n'étaient PAS dans la première source, et c'est l'information la
 *      plus utile de la mesure : `anthropic` (clé d'un dictionnaire), `activeTab` et
 *      `projectionStatus` (état d'UI qu'un vieux backup peut porter), et `id` — dont
 *      `Transaction.id` est déclaré `number` alors que les fixtures produisent `'test-tx-1'`.
 *      Une liste tirée des seuls TYPES aurait donc refusé des données réelles.
 *
 * ⚠️ Aucune clé monétaire n'y figure, et ce n'est pas une intention mais une MESURE : sur les états
 * du dépôt, zéro clé porte à la fois une chaîne et un nombre (`amount`, `balance`, `target`,
 * `interestRate`… n'apparaissent jamais en texte). Sans cette vérification, une seule collision
 * aurait suffi à rendre la liste inopérante là où elle compte.
 */
const CHAMPS_TEXTE: ReadonlySet<string> = new Set([
    // ⚠️ TROISIÈME SOURCE, ajoutée après coup et c'est la plus instructive : les clés propres au
    // FORMAT DE BACKUP, qui n'existent dans aucun `AppState`. Les deux premières sources ne
    // couvraient qu'un des deux vecteurs — j'avais inventorié l'état du store et les types, jamais
    // un fichier de sauvegarde. Le premier test écrit sur un backup réaliste a refusé `version:
    // '3.2'`, un champ parfaitement légitime. C'est exactement le faux refus que cet arbitrage
    // accepte, et il a été attrapé par un test au lieu d'atteindre Marc — mais il rappelle qu'une
    // liste se dérive de CHAQUE surface qu'elle garde, pas de la plus familière.
    'version', 'gemini', 'lunchMoney',
    'accountName', 'accountType', 'acquisitionDate', 'actionPlan',
    'activeAiConversationId', 'activeTab', 'activitiesLevel', 'aiChatModel',
    'anthropic', 'apiKeys', 'appliedContributionOrder', 'appliedReturnProfile',
    'attachments', 'beneficiary', 'birthDate', 'carGift',
    'category', 'color', 'createdAt', 'currency',
    'cutoverDateUsed', 'date', 'dateBought', 'daycareType',
    'dbElectionType', 'deadline', 'debtsUpdated', 'description',
    'destination', 'dismissedSubscriptions', 'dividendFreq', 'error',
    'eventKind', 'expiryDate', 'extractedData', 'finnhub',
    'fintable', 'fintableRoles', 'frequency', 'historySymbol',
    'icon', 'id', 'image', 'industry',
    'insurer', 'kind', 'label', 'lastDate',
    'mimeType', 'model', 'municipality', 'name',
    'nature', 'nextDividendDate', 'notes', 'originalCategory',
    'owner', 'pattern', 'payee', 'priceHistory',
    'projectionStatus', 'propertyId', 'purchaseDate', 'rateProvider',
    'rationale', 'region', 'role', 'salarySource',
    'savingsMode', 'schoolType', 'sector', 'setupOptOut',
    'splitMode', 'startDate', 'status', 'symbol',
    'targetAccount', 'taxRegime', 'termEndDate', 'text',
    'timestamp', 'title', 'toolsUsed', 'type',
    'universityType', 'updatedAt', 'uploadedAt', 'warnings',
    'withdrawalStrategy',
]);

/**
 * Relève les valeurs textuelles présentes là où l'app attend autre chose qu'un texte.
 *
 * Rendre un tableau VIDE signifie « rien à refuser » — vérifié sur 39 états légitimes (l'état
 * initial du store, les 7 personas, 31 dégradations dont les générateurs de `0/0`).
 */
export function verifierTypesRestaures(racine: unknown): ChampMalType[] {
    const fautifs: ChampMalType[] = [];
    parcourir(racine, '', '', new WeakSet<object>(), fautifs);
    return fautifs;
}

function parcourir(
    noeud: unknown,
    chemin: string,
    cle: string,
    vus: WeakSet<object>,
    acc: ChampMalType[],
): void {
    if (typeof noeud === 'string') {
        if (!CHAMPS_TEXTE.has(cle)) acc.push({ chemin, cle, valeur: noeud });
        return;
    }
    if (noeud === null || typeof noeud !== 'object') return;
    if (vus.has(noeud)) return;   // un état persisté peut porter des références partagées
    vus.add(noeud);
    for (const [k, v] of Object.entries(noeud as Record<string, unknown>)) {
        // ⚠️ Un ÉLÉMENT DE TABLEAU hérite de la clé de son tableau : `travelGoals[0]` est un objet,
        // mais `tags: ['a', 'b']` doit voir ses éléments jugés sur `tags`, pas sur `0`. Sans ça,
        // toute chaîne dans un tableau serait refusée sous la clé `'0'`.
        const cleFille = Array.isArray(noeud) ? cle : k;
        parcourir(v, chemin ? `${chemin}.${k}` : k, cleFille, vus, acc);
    }
}

/**
 * Résumé TECHNIQUE des champs fautifs, pour un journal ou un message d'erreur — chemins compris.
 *
 * ⚠️ Distinct de `messageDeRefusTypes`, qui s'adresse à l'utilisateur et ne montre JAMAIS un chemin.
 * Les deux existent parce que les deux publics existent ; les confondre a déjà coûté un marqueur
 * technique affiché à l'écran (lot 38, `QUAND-LA-LISTE-BLANCHE-EST-LA-MAUVAISE-FORME`).
 */
export function resumeTechniqueDesFautifs(fautifs: ReadonlyArray<ChampMalType>): string {
    const cites = fautifs.slice(0, PLAFOND_CITATIONS).map((f) => f.chemin).join(', ');
    const reste = fautifs.length - PLAFOND_CITATIONS;
    return `${fautifs.length} champ(s) portent du texte là où un montant est attendu : ${cites}`
        + (reste > 0 ? ` … +${reste}` : '');
}

/** Au-delà, on compte au lieu d'énumérer : un journal illisible n'est pas lu. */
const PLAFOND_CITATIONS = 5;

/** Phrase montrée à l'utilisateur, qui NOMME les champs sans jamais exposer un chemin technique. */
export function messageDeRefusTypes(fautifs: ReadonlyArray<ChampMalType>): string {
    if (fautifs.length === 0) return '';
    // Dédup sur ce qui est MONTRÉ, pas sur le chemin : deux champs du même nom rendraient deux fois
    // la même phrase (le défaut corrigé au lot 38, `messageDeRefus`).
    const noms = [...new Set(fautifs.map((f) => f.cle))];
    const listeCourte = noms.slice(0, 3).join(', ');
    const reste = noms.length > 3 ? ` (et ${noms.length - 3} autre${noms.length - 3 > 1 ? 's' : ''})` : '';
    return `Restauration refusée : ${listeCourte}${reste} ${noms.length > 1 ? 'contiennent' : 'contient'} `
        + 'du texte là où un montant est attendu. Le fichier est probablement corrompu — rien n\'a été modifié.';
}
