// services/projection/verifierEntreesMoteur.ts
//
// [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] La garde d'ENTRÉE du moteur de projection.
//
// Le vecteur : `JSON.parse` rend `Infinity` depuis un blob Drive ou un backup contenant `1e999`, et
// rien ne le rattrapait avant le moteur — `u?.netSalary || 0` ne filtre pas (`Infinity` est truthy,
// et `NaN` tombe silencieusement sur le repli). Le lot 30 avait neutralisé ce vecteur À L'AFFICHAGE
// de la carte Santé seulement ; la projection entière, elle, restait exposée.
//
// ⚠️ LES DEUX MODES DE PANNE SONT OPPOSÉS, et c'est le second qui est le plus grave — mesuré par
// `scripts/mesureFrontiereMoteur.ts` (committé, il fixe chaque paramètre du scénario) :
//
//   | donnée corrompue      | baseNetAnnual | non finis au 1er niveau |
//   |-----------------------|---------------|-------------------------|
//   | (sain)                | 115 200       | —                       |
//   | netSalary: Infinity   | Infinity      | baseNetAnnual, baseMonthlyExpenses (NaN) |
//   | netSalary: NaN        | **52 800**    | *aucun*                 |
//   | grossSalary: Infinity | 115 200       | baseGrossAnnual         |
//
// `Infinity` se PROPAGE et finit par se voir. `NaN` est ABSORBÉ par le `|| 0` : 62 400 $/an de
// salaire s'évaporent, aucun paramètre ne paraît anormal, et la projection reste lisse — 0 valeur
// non finie sur les 361 points de `chartData`. Rien ne crie, tout est faux.
//
// ⚠️ Un scan de PREMIER NIVEAU ment sur ce cas : `params.config === state.config` (passage par
// RÉFÉRENCE), donc `config.users[0].netSalary` vaut bien `NaN` DANS les paramètres. C'est pour ça
// que la vérification descend dans les utilisateurs au lieu de se contenter des champs plats.
//
// ⚠️ DÉCISIONS DE MARC (2026-08-29), qui fixent la forme de ce module :
//   · OÙ : ici, à la frontière `buildSimulationParams` — le point de passage UNIQUE de toutes les
//     entrées vers le moteur, donc une seule garde couvre saisie, restauration Drive, import et
//     mode test. Elle ne peut pas empêcher qu'un état corrompu soit PERSISTÉ, seulement qu'il
//     produise une projection ; c'est le compromis assumé.
//   · QUOI : REFUSER et NOMMER le champ. Pas de bornage (fabriquer une valeur plausible est
//     exactement ce que `no-fake-data` interdit), pas de trace silencieuse (le défaut a vécu
//     jusqu'ici précisément parce que rien ne le signalait).
//
// PÉRIMÈTRE — ce module scanne INTÉGRALEMENT les paramètres assemblés, et rien d'autre.
//
// ⚠️ La note qui tenait ici disait l'INVERSE : « ne pas étendre la vérification à tout l'objet, ça
// refuserait la projection pour un champ décoratif — un point d'historique de prix, par exemple ».
// Le raisonnement confondait les PARAMÈTRES et l'ÉTAT. Un point d'historique de prix n'est pas dans
// les paramètres : MESURÉ, l'objet remis au moteur compte 149 nœuds, et il en compte toujours 149
// avec 500 actifs et 5 000 transactions dans l'état — ces collections n'y entrent pas. Scanner tout
// l'objet est donc à la fois sûr et BORNÉ, alors que la liste blanche que cette note justifiait a
// laissé passer cinq canaux money-critical en trois passes (détail au filet récursif, plus bas).
// Ce qui reste hors périmètre, c'est l'ÉTAT : les autres surfaces ont leurs propres gardes
// (`assetFxGuard`, les durcissements `HARDEN-*-NAN`).
//
// ⚠️ Les deux risques de ce choix sont MESURÉS, pas supposés :
//   · FAUX REFUS — 39 états légitimes (l'état initial du store, les 7 personas, 31 dégradations :
//     salaires à 0, budget vide ou absent, aucun actif/compte/dette/immeuble, `projection` absente,
//     `years = 0`, et les générateurs de `0/0` — quantité 0 et prix 0, retraite = âge actuel,
//     historique vide, CAGR sur un seul point) : **zéro refus**.
//   · COÛT — ~24 µs par appel sur un ménage nominal (assiette de 149 nœuds), contre ~130 µs pour
//     l'assemblage qui l'appelle et 300 ms de debounce en amont.
//     ⚠️ Ce coût est INSENSIBLE aux collections lourdes — 500 actifs et 5 000 transactions le
//     laissent à 149 nœuds, parce qu'elles n'entrent pas dans les paramètres — mais il n'est PAS
//     constant : 40 dettes et 60 événements de vie le portent à 806 nœuds et ~92 µs. « Le coût ne
//     grandit pas avec les données » aurait donc été trop large ; ce qui tient, c'est qu'il reste
//     à trois ordres de grandeur sous le debounce. Aucune mémoïsation nécessaire — sa clé et son
//     invalidation coûteraient plus que le scan.
//
// Les deux mesures ci-dessus se re-dérivent par `scripts/mesureGardeFrontiere.ts` (committé), qui
// nomme chaque état testé — un chiffre cité dans le dépôt sans script est un chiffre invérifiable
// (`UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`).

/** Un champ d'entrée inexploitable, avec de quoi le dire à l'utilisateur ET le retrouver dans le code. */
export interface EntreeRefusee {
    /**
     * `cause` = un champ que l'utilisateur peut corriger dans un formulaire ; `derive` = une
     * grandeur calculée à partir de lui.
     *
     * ⚠️ Porté à la SOURCE, et pas déduit du préfixe du chemin comme au premier jet : ce filtre
     * (`chemin.startsWith('config.users')`) était juste tant que les salaires étaient les seules
     * causes, et il est devenu FAUX dès qu'on a ajouté les postes de budget et les soldes — il les
     * classait en dérivés, donc `messageDeRefus` les taisait quand un salaire était aussi fautif.
     * Marc aurait corrigé le salaire, relancé, et se serait fait refuser pour une cause que rien ne
     * lui avait nommée. Une heuristique de TEXTE sur une donnée qui peut porter le fait
     * structurellement (`TEXT-HEURISTIC-OVER-USER-TEXT`).
     */
    readonly role: 'cause' | 'derive';
    /** Chemin technique, pour le journal et les tests (ex. `config.users[0].netSalary`). */
    readonly chemin: string;
    /** Phrase montrée à l'utilisateur, qui NOMME la personne et le champ. */
    readonly libelle: string;
    /**
     * La valeur fautive TELLE QUELLE — `Infinity`, `NaN`, mais aussi une chaîne, un booléen ou un
     * objet quand c'est le TYPE qui est mauvais.
     *
     * ⚠️ Elle était typée `number` et un non-nombre y était converti en `NaN` : le journal exporté
     * envoyait alors Marc chercher un `NaN` là où la donnée est une chaîne — une valeur FABRIQUÉE
     * dans un flux de diagnostic, ce que `no-fake-data` vise aussi (finding 3e passe).
     */
    readonly valeur: unknown;
}

/** Ce que la garde inspecte chez chaque utilisateur, avec le nom montré à l'écran. */
const CHAMPS_UTILISATEUR = [
    { cle: 'netSalary', nom: 'le salaire net' },
    { cle: 'grossSalary', nom: 'le salaire brut' },
    { cle: 'salary', nom: 'le salaire (champ historique)' },
] as const;

const estNonFini = (v: unknown): v is number => typeof v === 'number' && !Number.isFinite(v);

/**
 * Une valeur MONÉTAIRE inexploitable : non finie, ou d'un type qui n'est pas un nombre.
 *
 * ⚠️ Pourquoi le TYPE compte autant que la finitude. Le vecteur décrit en tête de ce module est un
 * `JSON.parse` de blob Drive ou de backup, et le schéma de restauration valide `budgetItems` en
 * `z.array(z.unknown())` — aucune contrainte de forme. Une valeur y revient donc aussi bien en
 * `string` qu'en nombre, et `"1e999"` traverse l'arithmétique sans jamais devenir non finie :
 * MESURÉ, l'épargne mensuelle tombe à 0 et le patrimoine final à **−95 %**, sans un seul refus.
 * `estNonFini` seul ne pouvait pas le voir — même dégât que le `NaN` du salaire, autre type.
 *
 * ⚠️ `null` et `undefined` sont exclus ICI volontairement : « poste non budgété » est un état
 * légitime que le formulaire produit, et le refuser casserait l'app pour un cas nominal.
 *
 * ⚠️⚠️ Mais ATTENTION à ce que ça veut dire, parce que la première version de ce commentaire
 * affirmait plus : `null` est bien inoffensif (`acc + null` vaut `acc`), alors qu'un champ ABSENT
 * fait `acc + undefined` = `NaN` — donc la projection EST refusée, par le dérivé
 * `baseMonthlyExpenses`, avec un message qui ne nomme aucun champ corrigeable. Ce module n'y peut
 * rien seul : le refus est correct (la donnée est bien inexploitable), c'est le LIBELLÉ qui manque
 * de précision. Consigné plutôt que corrigé à la va-vite — le vrai correctif est de traiter
 * l'absence à la source, dans le schéma de restauration.
 */
const estMontantIllisible = (v: unknown): boolean =>
    v !== null && v !== undefined && (typeof v !== 'number' || !Number.isFinite(v));

/**
 * « Marc » si l'utilisateur est nommé, « du profil 2 » sinon — jamais un index technique nu.
 *
 * ⚠️ Rend la forme DÉJÀ ÉLIDÉE, parce que les libellés l'insèrent après « de » : sans ça on lisait
 * « le salaire net **de le profil 1** est illisible » (finding panel #764). Un nom propre garde
 * « de Marc » ; un rang devient « du profil 1 ».
 */
const nommer = (u: { name?: unknown } | undefined, index: number): string => {
    const nom = typeof u?.name === 'string' ? u.name.trim() : '';
    if (nom === '') return `du profil ${index + 1}`;
    // ⚠️ Élision devant une voyelle ou un `h` muet : « de Alex » se lit mal, et le premier correctif
    // d'élision ne traitait que le cas du rang (« de le profil 1 »). Un texte montré à Marc se relit
    // en entier, pas seulement sur la partie qu'on vient de corriger.
    return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
};

/**
 * Relève les entrées numériques inexploitables à la frontière du moteur.
 *
 * Rendre un tableau VIDE signifie « rien à refuser » — c'est le cas nominal, vérifié sur les sept
 * personas du dépôt (aucun ne produit de valeur non finie). Un tableau non vide doit EMPÊCHER le
 * calcul : une projection sur une entrée illisible est un chiffre faux et crédible.
 */
export function verifierEntreesMoteur(
    /**
     * Les paramètres ASSEMBLÉS — l'objet réellement remis au moteur, scanné intégralement.
     *
     * Typé en `Readonly<Record<string, unknown>>` et non en `SimulationParams` : la garde ne doit
     * rien savoir de la FORME des paramètres, sans quoi elle redeviendrait une liste à tenir à jour
     * — la faute même que cette version corrige. Les champs nommés ci-dessous sont lus par
     * indexation, avec leur type vérifié à l'usage.
     */
    params: Readonly<Record<string, unknown>>,
    /** Ce que la frontière SEULE connaît et qui ne voyage pas dans les paramètres. */
    contexte?: {
        budgetItems?: ReadonlyArray<unknown> | null;
        /** Termes que `computeCashLedgerDetailed` a ÉCARTÉS du solde de départ. */
        termesFautifsCash?: ReadonlyArray<{ origine: string; cle: string; valeur: unknown }> | null;
    },
): EntreeRefusee[] {
    const refus: EntreeRefusee[] = [];

    const users = (params.config as { users?: ReadonlyArray<unknown> } | undefined)?.users ?? [];
    users.forEach((brut, i) => {
        const u = brut as Record<string, unknown> | undefined;
        for (const { cle, nom } of CHAMPS_UTILISATEUR) {
            const v = u?.[cle];
            if (estMontantIllisible(v)) {
                refus.push({
                    role: 'cause',
                    chemin: `config.users[${i}].${cle}`,
                    libelle: `${nom} ${nommer(u, i)} est illisible`,
                    valeur: v,
                });
            }
        }
    });

    // ⚠️ LES POSTES DE BUDGET — le canal qui portait le PIRE écart mesuré, et que le premier jet de
    // ce module ne couvrait pas. `computeMonthlySavings` finit par `Math.max(0, revenus − dépenses)` :
    // un poste à `Infinity` donne `−Infinity`, que `Math.max` rabat sur **0**. Fini, crédible, et
    // faux. Mesuré : l'épargne mensuelle passe de 5 370 $ à 0 sans un seul non-fini nulle part.
    // C'est le mode « absorbé » de l'en-tête, par `Math.max` au lieu de `|| 0` — même mécanique,
    // écart bien plus grand. La frontière LIT ces postes (`computeCurrentRentExpense` et
    // `computeMonthlySavings`), donc ils sont dans son périmètre.
    (contexte?.budgetItems ?? []).forEach((brut, i) => {
        const item = brut as Record<string, unknown> | undefined;
        if (estMontantIllisible(item?.target)) {
            const nom = typeof item?.name === 'string' && item.name.trim() !== '' ? item.name.trim() : `n° ${i + 1}`;
            refus.push({
                role: 'cause',
                chemin: `budgetItems[${i}].target`,
                libelle: `le montant du poste « ${nom} » est illisible`,
                valeur: item!.target,
            });
        }
    });

    // ⚠️ LES TERMES ÉCARTÉS DU SOLDE DE DÉPART. `computeCashLedger` ÉCARTE les valeurs non finies et
    // rend toujours un total fini — donc le contrôle sur `calculatedStartingCash` plus bas ne peut
    // JAMAIS se déclencher : c'est une garde morte, gardée en ceinture mais qui ne protège rien.
    // La leçon `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL` du dépôt décrit exactement ça, et le
    // module concerné y répond déjà : `computeCashLedgerDetailed()` expose l'inventaire des termes
    // écartés PRÉCISÉMENT pour que l'appelant qui veut REFUSER le puisse. C'est cette porte-là qu'il
    // faut consommer — le total ne dit rien de ce qu'il a jeté.
    for (const t of contexte?.termesFautifsCash ?? []) {
        refus.push({
            role: 'cause',
            chemin: `${t.origine}.${t.cle}`,
            libelle: t.origine === 'transaction'
                ? `le montant d'une transaction est illisible (${t.cle})`
                : `le solde du compte ${t.cle} est illisible`,
            valeur: t.valeur,
        });
    }

    // Les grandeurs PRODUITES : elles attrapent une corruption arrivée par un chemin que la boucle
    // ci-dessus ne couvre pas (un repli, un champ renommé), et elles sont ce que le moteur consomme.
    // ⚠️ `pluriel` porte l'accord du verbe : « les dépenses mensuelles de base SONT illisibles ».
    // Un libellé montré à l'utilisateur se relit comme une phrase, pas comme une clé.
    const derives = [
        { cle: 'baseNetAnnual', nom: 'le revenu net annuel du ménage' },
        { cle: 'baseGrossAnnual', nom: 'le revenu brut annuel du ménage' },
        { cle: 'baseMonthlyExpenses', nom: 'les dépenses mensuelles de base', pluriel: true },
        // ⚠️ CEINTURE INATTEIGNABLE, gardée sciemment et annotée comme telle : `computeCashLedger`
        // écarte les non-finis en amont, donc ce contrôle ne peut pas tirer aujourd'hui. C'est
        // `termesFautifsCash` ci-dessus qui protège réellement ce canal. Le laisser sans cette note
        // le ferait passer pour une protection — un inventaire de gardes doit dire lesquelles sont
        // vivantes (`UNE-GARDE-QUI-NE-PEUT-PAS-TIRER-N-EST-PAS-UNE-PROTECTION`).
        { cle: 'calculatedStartingCash', nom: 'le solde de départ' },
        // ⚠️ Oublié au premier jet, et trouvé par le panel : `computeCurrentRentExpense` lit le
        // `target` d'un poste de budget SANS contrôle de finitude, et le résultat part dans les
        // paramètres deux lignes plus haut dans la même fonction. Mesuré avant correctif : un
        // « Logement » à `Infinity` donnait `currentRentExpense = Infinity` et ZÉRO refus, puis des
        // centaines de points non finis publiés. Le module se réclamait de « ce que la frontière
        // LIT et PRODUIT » — et en omettait un. Une liste d'inclusion se relit contre son propre
        // critère, pas contre l'intention qui l'a écrite (`CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG`).
        { cle: 'currentRentExpense', nom: 'le loyer ou la charge de logement' },
    ] as const;
    for (const d of derives) {
        const v = (params as Record<string, unknown>)[d.cle];
        const accord = 'pluriel' in d && d.pluriel ? 'sont illisibles' : 'est illisible';
        if (estNonFini(v)) refus.push({ role: 'derive', chemin: d.cle, libelle: `${d.nom} ${accord}`, valeur: v });
    }

    // ⚠️⚠️ LE FILET RÉCURSIF — et la raison pour laquelle il a fallu inverser la logique.
    //
    // Les listes ci-dessus énumèrent ce qu'on VÉRIFIE. Trois passes de panel ont montré, trois fois,
    // que cette énumération est incomplète : `currentRentExpense` (produit deux lignes plus haut),
    // puis les postes de budget, puis `liveCSVBalances` et les réglages de `projection` — tous
    // money-critical, tous oubliés, chacun mesuré à des écarts de −95 % à −99 %. C'est
    // `CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG` trois fois d'affilée : ce n'est plus une erreur,
    // c'est la preuve que la forme « liste blanche » ne convient pas ici.
    //
    // On scanne donc TOUT ce que la frontière produit, et on déclare ce qu'on EXCLUT. Le risque que
    // ça refuse un état légitime a été MESURÉ avant d'écrire une ligne : sur les sept personas, ce
    // scan récursif complet rend **zéro** valeur non finie. Les listes nommées restent au-dessus,
    // non par redondance mais parce qu'elles seules savent NOMMER le champ à l'utilisateur — le
    // filet, lui, dit seulement « quelque chose ne va pas, et voici où ».
    // ⚠️ Notation CANONIQUE avant de dédupliquer : le filet écrit `config.users.0.netSalary` là où
    // les listes nommées écrivent `config.users[0].netSalary`. Sans ça, le même champ est relevé
    // deux fois sous deux orthographes — et le message à l'écran le répète.
    const canonique = (c: string) => c.replace(/\.(\d+)(?=\.|$)/g, '[$1]');
    const dejaVu = new Set(refus.map((r) => canonique(r.chemin)));
    for (const [brut, valeur] of nonFinisRecursifs(params)) {
        const chemin = canonique(brut);
        if (dejaVu.has(chemin)) continue;
        dejaVu.add(chemin);
        // ⚠️ Le rôle se déduit de l'ORIGINE, pas d'un défaut. Le premier filet marquait tout en
        // `derive`, y compris `config.users[0].facteurEquivalence` — un champ de FORMULAIRE. Marc
        // aurait corrigé le salaire nommé, relancé, et se serait fait refuser pour une cause tue :
        // exactement le scénario que le champ `role` a été introduit pour empêcher, re-commis par
        // le mécanisme censé le respecter (finding 3e passe, #764).
        // ⚠️ JAMAIS le chemin technique dans le libellé : il est montré à l'écran sur toutes les
        // surfaces. Le chemin reste dans `chemin`, pour le journal et les tests.
        const c = CONTENEURS.find((x) => x.prefixe.test(chemin)) ?? CONTENEUR_INCONNU;
        refus.push({ role: c.role, chemin, libelle: c.libelle, valeur });
    }

    return refus;
}

/**
 * Ce que le filet DIT quand il attrape un champ qu'aucune liste nommée ne couvre : le CONTENEUR d'où
 * vient le chemin, en mots de l'écran.
 *
 * ⚠️ Le jet précédent tranchait en DEUX (`config.users|budgetItems` → « une valeur de ton profil »,
 * tout le reste → « un réglage de la projection »), et les deux moitiés étaient fausses :
 *   · `budgetItems` a QUITTÉ l'objet scanné pour voyager dans `contexte` — mesuré,
 *     `'budgetItems' in params` vaut `false`. Cette moitié de la condition était MORTE.
 *   · une dette, un projet immobilier ou un objectif de retraite illisible s'annonçait comme « un
 *     réglage de la projection » — factuellement FAUX, et l'utilisateur part corriger le mauvais
 *     écran. Un libellé qui nomme le mauvais endroit est pire qu'un libellé vague.
 *
 * ⚠️ Cette carte est une liste — mais PAS du même genre que celle qui a été retirée. Elle ne décide
 * pas ce qui est VÉRIFIÉ (le filet scanne tout, sans exception) ; elle décide seulement ce qu'on
 * SAIT DIRE. Un conteneur qui n'y figure pas est quand même refusé, avec `CONTENEUR_INCONNU`. Une
 * liste dont l'oubli dégrade le message ne peut pas rouvrir un canal money-critical ; c'est
 * exactement ce que la liste blanche d'avant ne garantissait pas.
 */
const CONTENEURS: ReadonlyArray<{ prefixe: RegExp; libelle: string; role: 'cause' | 'derive' }> = [
    { prefixe: /^config\.users\b/, libelle: 'une valeur de ton profil est illisible', role: 'cause' },
    { prefixe: /^config\b/, libelle: 'un réglage du partage de budget est illisible', role: 'cause' },
    { prefixe: /^projection\b/, libelle: 'un réglage de la projection est illisible', role: 'cause' },
    { prefixe: /^debts\b/, libelle: 'un montant de l\'une de tes dettes est illisible', role: 'cause' },
    { prefixe: /^realEstateGoals\b/, libelle: 'un montant de l\'un de tes projets immobiliers est illisible', role: 'cause' },
    { prefixe: /^rentalProperties\b/, libelle: 'un montant de l\'un de tes immeubles locatifs est illisible', role: 'cause' },
    { prefixe: /^retirementGoal\b/, libelle: 'un montant de ton objectif de retraite est illisible', role: 'cause' },
    { prefixe: /^childGoals\b/, libelle: 'un montant de l\'un de tes objectifs pour un enfant est illisible', role: 'cause' },
    { prefixe: /^travelGoals\b/, libelle: 'un montant de l\'un de tes voyages est illisible', role: 'cause' },
    { prefixe: /^lifeEvents\b/, libelle: 'un montant de l\'un de tes événements de vie est illisible', role: 'cause' },
    { prefixe: /^insurancePolicies\b/, libelle: 'un montant de l\'une de tes assurances est illisible', role: 'cause' },
    { prefixe: /^vehicleReplacements\b/, libelle: 'un montant de l\'un de tes remplacements de véhicule est illisible', role: 'cause' },
    { prefixe: /^majorRenovations\b/, libelle: 'un montant de l\'une de tes rénovations est illisible', role: 'cause' },
    { prefixe: /^charitableGoals\b/, libelle: 'un montant de l\'un de tes dons planifiés est illisible', role: 'cause' },
    { prefixe: /^privateBusinesses\b/, libelle: 'un montant de l\'une de tes entreprises est illisible', role: 'cause' },
    { prefixe: /^financialGoals\b/, libelle: 'un montant de l\'un de tes objectifs financiers est illisible', role: 'cause' },
    { prefixe: /^liveCSVBalances\b/, libelle: 'un solde importé est illisible', role: 'cause' },
];

/**
 * Le repli, et il est délibérément classé `cause`.
 *
 * ⚠️ `derive` est le rôle qui fait TAIRE un refus dès qu'une cause est nommée ailleurs
 * (`messageDeRefus`). Mettre un conteneur inconnu en `derive` reproduirait donc le scénario que le
 * champ `role` existe pour empêcher : corriger le salaire qu'on vous nomme, relancer, et se faire
 * refuser pour une cause que rien n'a nommée. Le défaut doit être bruyant, pas silencieux — le pire
 * cas est alors une phrase vague EN PLUS, jamais une erreur tue.
 */
const CONTENEUR_INCONNU = { libelle: 'une valeur de tes données est illisible', role: 'cause' } as const;

/**
 * Ce que le filet récursif NE relève PAS, chemin par chemin, avec la raison.
 *
 * ⚠️ Une exclusion se DÉCLARE et se MOTIVE ici, jamais en silence. Ce commentaire a lui-même porté
 * « AUCUNE exclusion pour l'instant » alors que la liste en contenait déjà une : une prose qui
 * décrit un filtre au lieu de le lire se périme au premier ajout, et se lit alors comme « tout est
 * couvert » (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`). Le contrôle du périmètre est la mesure de
 * faux refus en tête de module, pas la taille de cette liste.
 */
const EXCLUSIONS_DU_FILET: ReadonlyArray<{ chemin: RegExp; raison: string }> = [
    {
        chemin: /^entreesRefusees\b/,
        // ⚠️ CEINTURE INATTEIGNABLE, annotée comme telle : `buildSimulationParams` ajoute ce champ
        // APRÈS le scan, et la garde n'a qu'un appelant de production — le relevé ne peut donc pas
        // se retrouver dans l'objet scanné. Elle reste parce qu'un second appelant coûterait cher à
        // découvrir par ce chemin (la garde relèverait ses propres valeurs fautives recopiées), mais
        // une garde morte s'ANNOTE, sinon elle compte comme protection au prochain inventaire
        // (`UNE-GARDE-QUI-NE-PEUT-PAS-TIRER-N-EST-PAS-UNE-PROTECTION`). Le même piège a mordu
        // `scripts/mesureFrontiereMoteur.ts`, dont le scan se comptait lui-même.
        raison: 'le relevé lui-même, si jamais des paramètres déjà refusés repassaient par la garde',
    },
];

/** Tout nombre non fini atteignable depuis `racine`, avec son chemin — hors exclusions déclarées. */
function nonFinisRecursifs(
    racine: unknown,
    chemin = '',
    vus = new WeakSet<object>(),
    acc: Array<[string, number]> = [],
): Array<[string, number]> {
    if (typeof racine === 'number') {
        if (!Number.isFinite(racine) && !EXCLUSIONS_DU_FILET.some((e) => e.chemin.test(chemin))) {
            acc.push([chemin, racine]);
        }
        return acc;
    }
    if (racine === null || typeof racine !== 'object') return acc;
    if (vus.has(racine)) return acc;   // les params portent des références partagées (`config`)
    vus.add(racine);
    for (const [cle, val] of Object.entries(racine as Record<string, unknown>)) {
        nonFinisRecursifs(val, chemin ? `${chemin}.${cle}` : cle, vus, acc);
    }
    return acc;
}

/**
 * Phrase unique à montrer, qui NOMME les champs. Les champs dérivés sont OMIS quand une cause
 * utilisateur est déjà nommée : dire à la fois « le salaire net de Marc est illisible » et « le
 * revenu net annuel du ménage est illisible » désignerait deux fois la même erreur, et enverrait
 * corriger un champ qui n'existe pas dans le formulaire.
 */
export function messageDeRefus(refus: ReadonlyArray<EntreeRefusee>): string {
    if (refus.length === 0) return '';
    const causes = refus.filter((r) => r.role === 'cause');
    const aMontrer = causes.length > 0 ? causes : refus;
    // ⚠️ DÉDUPLICATION DES LIBELLÉS, et pas seulement des chemins. Deux champs distincts du même
    // conteneur rendent le MÊME libellé (c'est le principe de la carte : elle nomme le conteneur,
    // pas le champ) — sans ce `Set`, deux dettes illisibles donnaient « un montant de l'une de tes
    // dettes est illisible ET un montant de l'une de tes dettes est illisible ». La déduplication
    // des chemins, en amont, ne pouvait pas l'attraper : les chemins, eux, DIFFÈRENT.
    const liste = [...new Set(aMontrer.map((r) => r.libelle))];
    const enumeration = liste.length === 1
        ? liste[0]
        : `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}`;
    return `Projection impossible : ${enumeration}. Corrige la valeur pour relancer le calcul.`;
}


/** Signatures déjà journalisées — le throttle est intrinsèquement avec état, comme celui de
 *  `HARDEN-NETWORTH-NAN` dont ce module reprend le patron. */
const signaturesJournalisees = new Set<string>();

/** Test-only : remet à zéro le throttle (isolation entre tests). */
export function __resetJournalRefus(): void {
    signaturesJournalisees.clear();
}

/**
 * Journalise un refus, UNE fois par signature.
 *
 * ⚠️ Pourquoi une trace EN PLUS du message à l'écran, alors que le ticket disait « refuser plutôt
 * que tracer en silence » : les deux ne s'opposent pas. Ce qui était condamné, c'est la trace SEULE
 * — un défaut journalisé et invisible. Sans trace du tout, une corruption corrigée ou écrasée avant
 * que Marc n'ouvre l'écran concerné ne laisse rien à exporter, contrairement à toutes les autres
 * voies de corruption gardées du dépôt.
 *
 * Le throttle est indispensable : le refus est réévalué à chaque rendu tant que la donnée reste
 * illisible, donc sans lui une seule corruption remplirait le journal.
 */
export function journaliserRefus(refus: ReadonlyArray<EntreeRefusee> | undefined): void {
    if (!refus || refus.length === 0) return;
    const signature = refus.map((r) => `${r.chemin}=${r.valeur}`).sort().join('|');
    if (signaturesJournalisees.has(signature)) return;
    signaturesJournalisees.add(signature);
    void import('../errorLogger')
        .then(({ logError }) => logError({
            source: 'projection',
            severity: 'error',
            message: `Entrée moteur illisible — projection refusée : ${signature}`,
        }))
        .catch(() => { /* journal HS : ne jamais faire échouer le refus lui-même */ });
}
