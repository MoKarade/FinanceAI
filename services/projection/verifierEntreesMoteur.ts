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
// PÉRIMÈTRE — ce module vérifie ce que `buildSimulationParams` LIT et PRODUIT, pas l'état entier.
// Étendre la vérification à tout l'objet refuserait la projection pour un champ décoratif (un point
// d'historique de prix, par exemple), ce qui serait pire que le défaut. Les autres surfaces ont
// leurs propres gardes (`assetFxGuard`, les durcissements `HARDEN-*-NAN`).

/** Un champ d'entrée inexploitable, avec de quoi le dire à l'utilisateur ET le retrouver dans le code. */
export interface EntreeRefusee {
    /** Chemin technique, pour le journal et les tests (ex. `config.users[0].netSalary`). */
    readonly chemin: string;
    /** Phrase montrée à l'utilisateur, qui NOMME la personne et le champ. */
    readonly libelle: string;
    /** La valeur fautive, telle quelle — `Infinity`, `-Infinity` ou `NaN`. */
    readonly valeur: number;
}

/** Ce que la garde inspecte chez chaque utilisateur, avec le nom montré à l'écran. */
const CHAMPS_UTILISATEUR = [
    { cle: 'netSalary', nom: 'le salaire net' },
    { cle: 'grossSalary', nom: 'le salaire brut' },
    { cle: 'salary', nom: 'le salaire (champ historique)' },
] as const;

const estNonFini = (v: unknown): v is number => typeof v === 'number' && !Number.isFinite(v);

/**
 * « Marc » si l'utilisateur est nommé, « du profil 2 » sinon — jamais un index technique nu.
 *
 * ⚠️ Rend la forme DÉJÀ ÉLIDÉE, parce que les libellés l'insèrent après « de » : sans ça on lisait
 * « le salaire net **de le profil 1** est illisible » (finding panel #764). Un nom propre garde
 * « de Marc » ; un rang devient « du profil 1 ».
 */
const nommer = (u: { name?: unknown } | undefined, index: number): string => {
    const nom = typeof u?.name === 'string' ? u.name.trim() : '';
    return nom !== '' ? `de ${nom}` : `du profil ${index + 1}`;
};

/**
 * Relève les entrées numériques inexploitables à la frontière du moteur.
 *
 * Rendre un tableau VIDE signifie « rien à refuser » — c'est le cas nominal, vérifié sur les sept
 * personas du dépôt (aucun ne produit de valeur non finie). Un tableau non vide doit EMPÊCHER le
 * calcul : une projection sur une entrée illisible est un chiffre faux et crédible.
 */
export function verifierEntreesMoteur(params: {
    config?: { users?: ReadonlyArray<unknown> } | null;
    budgetItems?: ReadonlyArray<unknown> | null;
    /** Termes que `computeCashLedgerDetailed` a ÉCARTÉS du solde de départ — voir plus bas. */
    termesFautifsCash?: ReadonlyArray<{ origine: string; cle: string; valeur: unknown }> | null;
    baseNetAnnual?: number;
    baseGrossAnnual?: number;
    baseMonthlyExpenses?: number;
    calculatedStartingCash?: number;
    currentRentExpense?: number;
}): EntreeRefusee[] {
    const refus: EntreeRefusee[] = [];

    const users = params.config?.users ?? [];
    users.forEach((brut, i) => {
        const u = brut as Record<string, unknown> | undefined;
        for (const { cle, nom } of CHAMPS_UTILISATEUR) {
            const v = u?.[cle];
            if (estNonFini(v)) {
                refus.push({
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
    (params.budgetItems ?? []).forEach((brut, i) => {
        const item = brut as Record<string, unknown> | undefined;
        if (estNonFini(item?.target)) {
            const nom = typeof item?.name === 'string' && item.name.trim() !== '' ? item.name.trim() : `n° ${i + 1}`;
            refus.push({
                chemin: `budgetItems[${i}].target`,
                libelle: `le montant du poste « ${nom} » est illisible`,
                valeur: item!.target as number,
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
    for (const t of params.termesFautifsCash ?? []) {
        refus.push({
            chemin: `${t.origine}.${t.cle}`,
            libelle: t.origine === 'transaction'
                ? `le montant d'une transaction est illisible (${t.cle})`
                : `le solde du compte ${t.cle} est illisible`,
            valeur: typeof t.valeur === 'number' ? t.valeur : Number.NaN,
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
        if (estNonFini(v)) refus.push({ chemin: d.cle, libelle: `${d.nom} ${accord}`, valeur: v });
    }

    return refus;
}

/**
 * Phrase unique à montrer, qui NOMME les champs. Les champs dérivés sont OMIS quand une cause
 * utilisateur est déjà nommée : dire à la fois « le salaire net de Marc est illisible » et « le
 * revenu net annuel du ménage est illisible » désignerait deux fois la même erreur, et enverrait
 * corriger un champ qui n'existe pas dans le formulaire.
 */
export function messageDeRefus(refus: ReadonlyArray<EntreeRefusee>): string {
    if (refus.length === 0) return '';
    const causes = refus.filter((r) => r.chemin.startsWith('config.users'));
    const aMontrer = causes.length > 0 ? causes : refus;
    const liste = aMontrer.map((r) => r.libelle);
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
