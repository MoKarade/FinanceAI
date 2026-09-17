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
// ⚠️ [BACKUP-BOOLEEN-DANS-UN-MONTANT] (lot 199, 2026-09-06) Le second canal, resté ouvert jusque-là
// « parce que sa liste n'avait pas été mesurée », est fermé par le même arbitrage : un BOOLÉEN dans
// un champ monétaire (`true + 1 === 2`) traversait l'arithmétique comme une chaîne. MESURÉ sur
// `couple-confort`, horizon 40 ans, 0 refus à chaque fois :
//   · `config.users[0].netSalary = true` → patrimoine successoral **−91,9 %** (9,74 M$ → 0,79 M$) ;
//   · `budgetItems[0].target = false` → **−2,7 %** ; `debts[0].balance = true` → +0,2 %.
// La liste des champs BOOLÉENS (`CHAMPS_BOOLEENS`) se dérive comme celle des textes — du contrat
// (`types.ts`, 58 noms), du corps du store et des états mesurés — et son oubli coûte la même chose :
// un faux refus BRUYANT, attrapé par la garde de dérivation et le canari des huit personas.

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
interface ChampMalType {
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
 * du dépôt, `amount`, `balance`, `target`, `interestRate`… n'apparaissent jamais en texte.
 *
 * ⚠️⚠️ **CORRECTION DU 2026-09-01, et elle a coûté cher.** Cette phrase affirmait aussi que « zéro
 * clé porte à la fois une chaîne et un nombre ». C'est FAUX, et la mesure qui le disait ne portait
 * que sur les états DU DÉPÔT : `accountId` est un `number` dans `Transaction` et un `string` dans
 * `FintableBrokerBalance` comme dans les lots de titres. Aucun persona ne porte de données Fintable,
 * donc la collision était invisible à la mesure — et `accountId` manquait à cette liste.
 *
 * Conséquence VÉCUE : dès qu'un état persisté contenait un compte bancaire synchronisé, `merge`
 * levait, l'app se réhydratait VIDE à chaque lancement, et restaurer depuis Drive rejouait le même
 * refus (le pull appelle `persist.rehydrate()`). L'utilisateur voit « j'ai tout perdu » alors que le
 * blob est intact. **Un faux refus n'est pas « bruyant » quand il vide l'écran : il est
 * indiscernable d'une perte de données.** C'est l'arbitrage du 2026-08-29 qu'il faut relire à cette
 * lumière — il reste valable pour un montant, il ne l'était pas pour un identifiant.
 *
 * La liste ne se dérive donc plus des seuls états mesurés : `tests/services/verifierTypesRestaures.test.ts`
 * exige désormais que TOUT champ déclaré textuel dans `types.ts` y figure. Une surface que le dépôt
 * ne porte pas ne peut plus créer un refus.
 */
export const CHAMPS_TEXTE: ReadonlySet<string> = new Set([
    // ⚠️ TROISIÈME SOURCE, ajoutée après coup et c'est la plus instructive : les clés propres au
    // FORMAT DE BACKUP, qui n'existent dans aucun `AppState`. Les deux premières sources ne
    // couvraient qu'un des deux vecteurs — j'avais inventorié l'état du store et les types, jamais
    // un fichier de sauvegarde. Le premier test écrit sur un backup réaliste a refusé `version:
    // '3.2'`, un champ parfaitement légitime. C'est exactement le faux refus que cet arbitrage
    // accepte, et il a été attrapé par un test au lieu d'atteindre Marc — mais il rappelle qu'une
    // liste se dérive de CHAQUE surface qu'elle garde, pas de la plus familière.
    'version', 'gemini', 'lunchMoney',
    // ⚠️ Les trois clés de l'incident du 2026-09-01 : déclarées TEXTUELLES et PERSISTÉES, mais
    // absentes de la liste parce qu'aucun état du dépôt ne les portait. Chacune suffisait, à elle
    // seule, à vider l'app au lancement. Elles viennent de la surface que la dérivation d'origine
    // n'avait pas lue : l'état propre au STORE (au-delà d'`AppState`) et les données Fintable.
    'accountId', 'activeTestPersonaId', 'revealedProjectionSig',
    // ⚠️ DEUXIÈME VAGUE DU MÊME INCIDENT, quelques minutes plus tard : l'app de Marc s'est vidée à
    // nouveau, sur `fintableRoles.<compte>.debtName`. La garde de dérivation posée pour empêcher
    // exactement ça était AVEUGLE — son extracteur ancrait le nom du champ en début de LIGNE, et
    // `debtName` n'est déclaré que dans un littéral de type EN LIGNE :
    //     export type FintableAccountRoleConfig = … | { kind: 'debt'; debtName: string } | …
    // Le correctif qui compte n'est pas cette ligne-ci mais l'élargissement de l'extracteur (76 → 78
    // clés vues, zéro perdue) : un recenseur ancré sur la FORME du code ne couvre que les formes
    // qu'il a croisées en l'écrivant.
    'debtName',
    // ⚠️⚠️ TROISIÈME VAGUE DU MÊME INCIDENT (2026-09-17), et le trou était encore dans le RECENSEUR.
    // `paymentFrequency` (cadence des prélèvements d'une dette) est déclaré `paymentFrequency?:
    // PaymentFrequency` — un ALIAS NOMMÉ. L'extracteur ne reconnaissait que `string` et les unions
    // de littéraux écrites EN LIGNE, donc il ne l'a pas vu : la garde de dérivation est restée
    // VERTE pendant que Marc enregistrait « Hebdomadaire » sur son bail, ce qui aurait vidé son app
    // au rechargement suivant. Mesuré : NEUF champs de `types.ts` ne sont visibles QUE par un alias
    // (`accountType`, `aiChatModel`, `kind`, `model`, `municipality`, `owner`, `paymentFrequency`,
    // `taxRegime`, `type`) — huit y figuraient par ACCIDENT, via la source « états du dépôt ». Un
    // champ NEUF, qu'aucun état ne porte encore, n'a pas cette chance : c'est structurellement le
    // premier à tomber. Le correctif qui compte n'est donc pas cette ligne-ci mais la résolution des
    // alias dans l'extracteur de la garde de dérivation.
    'paymentFrequency',
    // [DETTE-SOLDE-INSTANTANE-FIGE] Date de l'instantané du solde d'une dette (YYYY-MM-DD).
    // Ajouté ICI, dans le MÊME lot que le champ — c'est précisément ce que les trois vagues ont
    // coûté : un champ textuel neuf qu'aucun état du dépôt ne porte encore est structurellement le
    // premier à faire lever `merge`, donc à vider l'écran. La garde de dérivation le voit (forme
    // `?: string`, la plus banale), mais on ne compte pas sur elle pour un champ qu'on introduit
    // soi-même : la liste se met à jour à l'écriture, la garde est le FILET.
    'balanceAsOf',
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
    // ⚠️⚠️ [FINTABLE-DISNAT-USD-SOLDE-IGNORE] `missingRate` : la devise d'un compte courtier dont le
    // taux manquait à l'écriture. Champ TEXTUEL et PERSISTÉ (`FintableBrokerBalance`), donc sans
    // cette entrée la première synchro portant un compte en devise étrangère ferait ÉCHOUER la
    // réhydratation et VIDERAIT l'app — l'incident du 2026-09-01, deux vagues
    // (`UN-FAUX-REFUS-QUI-VIDE-L-ECRAN-EST-INDISCERNABLE-D-UNE-PERTE-DE-DONNEES`).
    // C'est la garde de DÉRIVATION écrite après la seconde vague qui l'a attrapée ici, pas moi :
    // elle dérive la liste de `types.ts` au lieu des états observés, et c'est exactement le cas
    // qu'elle existe pour couvrir.
    'missingRate',
    // [FINTABLE-INVESTMENTS-MUET] `comptesSansPositions` (le tableau lui-même, dont la présence est
    // testée par clé) et `reason` (le motif lisible de chaque compte sans positions). `accountId` et
    // `label` figurent déjà plus bas. ⚠️ Ces trois clés arrivent dans un champ PERSISTÉ
    // (`FintableSyncReport`) : sans elles, la première synchro qui saute un compte rendrait la
    // réhydratation impossible et VIDERAIT l'écran de Marc — le mode de panne exact de l'incident du
    // 2026-09-01, attrapé ici par la garde de dérivation née de cet incident.
    'comptesSansPositions', 'reason',
    // ⚠️ [FX-TAUX-JAMAIS-ARRIVES] `fxRatesSource` (`'api' | 'manuel' | 'repli'`) et
    // `fxLastAttemptCause` (le résultat de la dernière lecture). Deux clés TEXTUELLES et PERSISTÉES
    // de plus, donc deux occasions de plus de vider l'app au lancement si on les oublie : c'est la
    // QUATRIÈME fois que ce lot-ci passe par là (`accountId`/`debtName`/`missingRate` avant elles).
    // La garde de dérivation les aurait attrapées — elles sont écrites ici AVANT qu'elle rougisse,
    // parce qu'un filet n'est pas une excuse pour sauter le geste qu'il rattrape.
    // ⚠️ [FX-OBSERVATION-COHORTE] `fxObservationDate` s'y ajoute (la date de l'observation BdC).
    'fxRatesSource', 'fxLastAttemptCause', 'fxObservationDate',
    // ⚠️ `observationDate` (sans préfixe) est le MÊME concept vu par la garde de dérivation : il
    // vit dans la SIGNATURE de `updateFxRates`, sur sa propre ligne, donc le filtre « la ligne
    // contient `=>` » ne le voit pas comme une méthode. Même situation que `estimated` dans
    // `CHAMPS_BOOLEENS`, et même réponse : on le DÉCLARE au lieu de le soustraire à sa garde en
    // recompactant la signature. Il est d'ailleurs persisté pour de vrai — le cache local
    // `fx_rates_cache` porte exactement cette clé (`ResultatTauxFx.observationDate`).
    'observationDate',
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
 * Les clés dont une valeur BOOLÉENNE est légitime. Tout le reste doit être un nombre, une chaîne
 * (si la clé est dans `CHAMPS_TEXTE`), un objet ou `null`.
 *
 * ⚠️ DÉRIVATION, même méthode que `CHAMPS_TEXTE` (une liste écrite à la main est une liste inventée) :
 *   1. les champs de `types.ts` déclarés `boolean` (58 noms, mesuré 2026-09-06) — le CONTRAT ;
 *   2. le corps persisté de `FinanceState` (`projectionRunMC`, `isProjectionLocked`, `isTestMode`) ;
 *   3. les clés portant réellement un booléen dans les états du dépôt (8 personas + état initial du
 *      store, 20 noms) — c'est là que sortent les clés d'un `Record` (les `setupOptOut.<page>` :
 *      `children`, `debts`, `lifeProjects`, `realEstate`), invisibles au scan des types, et
 *      `isPrivacyMode` (exclu de la persistance, mais un vieux blob peut le porter).
 * ⚠️ `debts` et `realEstate` sont AUSSI des clés de conteneur : un booléen À LA PLACE du tableau
 * `debts` passerait cette garde — même limite structurelle (clé par clé) que la liste des textes.
 */
export const CHAMPS_BOOLEENS: ReadonlySet<string> = new Set([
    // 1. types.ts
    'appliedAssetLocation', 'appliedDebtFirst', 'appliedDownsize', 'appliedGainHarvesting',
    'appliedPensionSplitting', 'appliedSkipRap', 'autoTarget', 'cashUpdated', 'ccpcSmallBizDeduction',
    'completed', 'criticalIllnessEnabled', 'divorceEnabled', 'donateAppreciatedSecurities',
    'enableRothLadder', 'enableSensitivityAnalysis', 'fxRatesEstimated', 'grossSalaryConfirmed',
    'hasChildren', 'hasOwnedPropertyLast4Years', 'hasPrivateDrugInsurance', 'inheritanceEnabled',
    'isActive', 'isAiProcessed', 'isDuplicate', 'isElectric', 'isFirstTimeBuyer', 'isImmigrant',
    'isInterestDeductible', 'isNewConstruction', 'isOwned', 'isPhasedRetirement', 'isPrimaryResidence',
    'isRented', 'isTransfer', 'isVariableRate', 'isVerified', 'jobLossEnabled', 'ltcEnabled',
    'ltdEnabled', 'modelSurvivor', 'optimizeSourceDeductions', 'phasedRetirementEnabled',
    'showTaxBracketBreakdown', 'snowbirdEnabled', 'stressTestEnabled', 'useHistoricalBootstrap',
    'useManualBalances', 'usePerCategoryInflation', 'usePortfolioRate', 'useReerToCeliLadder',
    'useSmileCurve', 'useSmithManoeuvre', 'useSpousalRrsp', 'useStochasticMortality', 'useTheoretical',
    'useWebWorker', 'vehicleReplacementEnabled', 'wasBackfill',
    // 2. corps du store
    'projectionRunMC', 'isProjectionLocked', 'isTestMode', 'isPrivacyMode',
    // ⚠️ [FX-TAUX-JAMAIS-ARRIVES] `estimated` est apparu ici SANS qu'aucun champ persisté ne soit
    // ajouté : il vit dans la SIGNATURE de `updateFxRates`, et il y vivait déjà — c'est sa mise en
    // forme sur plusieurs lignes qui l'a rendu visible à l'extracteur, jusque-là ancré sur des
    // formes qu'il avait croisées (même classe que l'incident `debtName`, deuxième vague du
    // 2026-09-01). La bonne réponse n'est PAS de remettre la signature sur une ligne pour le
    // cacher : un nom qu'on soustrait à sa garde reste un nom qu'elle devra reconnaître le jour où
    // il sera vraiment persisté. Et il l'est déjà ailleurs — le cache local `fx_rates_cache` porte
    // exactement cette clé.
    'estimated',
    // 3. états mesurés — les clés du Record `setupOptOut`
    'children', 'debts', 'lifeProjects', 'realEstate',
]);

/**
 * Relève les valeurs TEXTUELLES et BOOLÉENNES présentes là où l'app attend autre chose.
 *
 * Rendre un tableau VIDE signifie « rien à refuser » — vérifié sur 40 états légitimes (l'état
 * initial du store, les 8 personas, 31 dégradations dont les générateurs de `0/0`).
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
    if (typeof noeud === 'boolean') {
        if (!CHAMPS_BOOLEENS.has(cle)) acc.push({ chemin, cle, valeur: noeud });
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
    return `${fautifs.length} champ(s) portent du texte ou un booléen là où un montant est attendu : ${cites}`
        + (reste > 0 ? ` … +${reste}` : '');
}

/** Au-delà, on compte au lieu d'énumérer : un journal illisible n'est pas lu. */
const PLAFOND_CITATIONS = 5;

/**
 * Longueur d'affichage du diagnostic de réhydratation dans `SystemView`.
 *
 * ⚠️ MESURÉ pendant l'incident du 2026-09-01 : la ligne était tronquée à **80 caractères**, or le
 * seul préfixe (« Données persistées illisibles — N champ(s) portent du texte là où un montant est
 * attendu : ») en fait déjà 95. La coupe tombait donc EXACTEMENT avant les chemins — c'est-à-dire
 * avant la seule partie exploitable, dans l'écran même qu'on demande à l'utilisateur de consulter.
 *
 * Le message ne peut pas grandir sans borne : `PLAFOND_CITATIONS` limite déjà les chemins cités à
 * cinq. La troncature à 80 était donc une SECONDE borne, arbitraire, qui annulait la première.
 * Deux bornes sur la même grandeur, et c'est la plus bête qui gagne.
 */
export const LONGUEUR_MAX_DIAGNOSTIC = 400;

/** Phrase montrée à l'utilisateur, qui NOMME les champs sans jamais exposer un chemin technique. */
export function messageDeRefusTypes(fautifs: ReadonlyArray<ChampMalType>): string {
    if (fautifs.length === 0) return '';
    // Dédup sur ce qui est MONTRÉ, pas sur le chemin : deux champs du même nom rendraient deux fois
    // la même phrase (le défaut corrigé au lot 38, `messageDeRefus`).
    const noms = [...new Set(fautifs.map((f) => f.cle))];
    const listeCourte = noms.slice(0, 3).join(', ');
    const reste = noms.length > 3 ? ` (et ${noms.length - 3} autre${noms.length - 3 > 1 ? 's' : ''})` : '';
    return `Restauration refusée : ${listeCourte}${reste} ${noms.length > 1 ? 'contiennent' : 'contient'} `
        + 'du texte ou un booléen là où un montant est attendu. Le fichier est probablement corrompu — rien n\'a été modifié.';
}
