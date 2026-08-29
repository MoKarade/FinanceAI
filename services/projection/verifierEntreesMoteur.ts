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

/** « Marc » si l'utilisateur est nommé, « le 2e profil » sinon — jamais un index technique nu. */
const nommer = (u: { name?: unknown } | undefined, index: number): string => {
    const nom = typeof u?.name === 'string' ? u.name.trim() : '';
    return nom !== '' ? nom : `le profil ${index + 1}`;
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
    baseNetAnnual?: number;
    baseGrossAnnual?: number;
    baseMonthlyExpenses?: number;
    calculatedStartingCash?: number;
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
                    libelle: `${nom} de ${nommer(u, i)} est illisible`,
                    valeur: v,
                });
            }
        }
    });

    // Les grandeurs PRODUITES : elles attrapent une corruption arrivée par un chemin que la boucle
    // ci-dessus ne couvre pas (un repli, un champ renommé), et elles sont ce que le moteur consomme.
    const derives = [
        { cle: 'baseNetAnnual', nom: 'le revenu net annuel du ménage' },
        { cle: 'baseGrossAnnual', nom: 'le revenu brut annuel du ménage' },
        { cle: 'baseMonthlyExpenses', nom: 'les dépenses mensuelles de base' },
        { cle: 'calculatedStartingCash', nom: 'le solde de départ' },
    ] as const;
    for (const { cle, nom } of derives) {
        const v = (params as Record<string, unknown>)[cle];
        if (estNonFini(v)) refus.push({ chemin: cle, libelle: `${nom} est illisible`, valeur: v });
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
