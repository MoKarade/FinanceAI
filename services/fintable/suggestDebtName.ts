// services/fintable/suggestDebtName.ts
//
// [FINTABLE-DEBTNAME-AUTO] Choisir TOUT SEUL à quelle dette de FinanceAI correspond un compte
// Fintable de type carte de crédit.
//
// Pourquoi ce module existe (demande Marc, 2026-09-14 : « je veux pas avoir à donner exactement le
// nom dans dette, ça devrait être automatique ») : l'écran de configuration demandait le « nom EXACT
// de la dette telle qu'elle existe dans Réglages → Dettes », saisi À LA MAIN dans un champ texte
// libre. Un caractère de différence et `applyDebt` refuse la mise à jour (`debtKey` =
// `trim().toLowerCase()`, les ACCENTS comptent) — le solde de la carte cessait alors d'être
// rafraîchi, et le seul signal était un avertissement au fond du rapport de sync.
//
// ⚠️ MONEY-CRITICAL : un mauvais appariement n'est PAS un inconfort d'interface, c'est le solde
// d'une AUTRE dette écrasé par celui de la carte. D'où une suggestion DÉLIBÉRÉMENT timide — elle
// préfère ne rien proposer plutôt que de proposer au hasard :
//   - il faut au moins un mot SIGNIFICATIF en commun (les mots passe-partout d'un libellé bancaire
//     — « carte », « credit », « compte » — ne discriminent rien et sont écartés) ;
//   - une ÉGALITÉ de score entre deux dettes ne tranche pas : on rend `null` (ambigu ≠ probable) ;
//   - la suggestion reste VISIBLE dans la liste déroulante, donc corrigible d'un clic. Une valeur
//     devinée qui ne s'affiche nulle part serait exactement la donnée fabriquée qu'interdit le
//     principe no-fake-data.
//
// ⚠️ La valeur rendue est le nom EXACT tel qu'il est écrit dans `Debt.name` — jamais une version
// normalisée. C'est ce nom-là que `applyDebt` compare ; rendre la forme normalisée reconstruirait le
// défaut qu'on corrige, un cran plus bas.

import type { Debt } from '../../types';

/**
 * Forme comparable d'un nom : sans accents, en minuscules, ponctuation ramenée à des espaces.
 * ⚠️ Plus permissive que le `debtKey` d'`applyDebt` (qui, lui, garde les accents) — et c'est
 * voulu : ici on CHERCHE un candidat, là-bas on VÉRIFIE une égalité. Élargir la recherche est sans
 * risque tant que la valeur rendue est le nom d'origine.
 */
function normaliser(nom: string): string {
    return String(nom ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Mots qui n'identifient RIEN dans un libellé bancaire : ils apparaissent dans presque toutes les
 * dettes et dans presque tous les comptes. Les compter ferait apparier « Carte Desjardins » avec
 * « Carte Capital One » sur le seul mot « carte ».
 * ⚠️ Liste volontairement COURTE : chaque ajout retire du pouvoir discriminant à un vrai mot. Les
 * noms de banques et de réseaux (desjardins, visa, mastercard, bnc…) n'y sont PAS — ce sont eux qui
 * distinguent deux cartes l'une de l'autre.
 */
const MOTS_NON_DISCRIMINANTS = new Set([
    'carte', 'cartes', 'card', 'compte', 'account', 'credit', 'de', 'du', 'la', 'le', 'les',
    'et', 'and', 'the', 'my', 'ma', 'mon', 'mes',
]);

function motsSignifiants(nom: string): Set<string> {
    const mots = normaliser(nom).split(' ');
    return new Set(mots.filter((m) => m.length >= 3 && !MOTS_NON_DISCRIMINANTS.has(m)));
}

/**
 * Nom de la dette FinanceAI qui correspond le mieux au compte Fintable `libelleCompte`, ou `null`
 * quand rien n'est assez sûr pour être proposé.
 *
 * Ordre de décision — du plus certain au plus faible, et on s'arrête au premier qui tranche :
 *   1. égalité normalisée (« Mastercard Cash Back » ≡ « mastercard cash back ») ;
 *   2. une seule dette existe → c'est forcément elle ;
 *   3. plus grand nombre de mots signifiants en commun, à condition qu'il soit STRICTEMENT
 *      supérieur au deuxième (sinon c'est ambigu, et on ne devine pas).
 */
export function suggestDebtName(libelleCompte: string, debts: readonly Debt[] | undefined): string | null {
    const candidates = (debts ?? []).filter((d) => typeof d?.name === 'string' && d.name.trim() !== '');
    if (candidates.length === 0) return null;

    const cible = normaliser(libelleCompte);

    // 1. Égalité exacte (à la normalisation près) : aucune ambiguïté possible.
    const exact = candidates.find((d) => normaliser(d.name) === cible && cible !== '');
    if (exact) return exact.name;

    // 2. Une seule dette déclarée : il n'y a pas d'autre réponse possible.
    if (candidates.length === 1) return candidates[0].name;

    // 3. Recouvrement de mots signifiants.
    const motsCompte = motsSignifiants(libelleCompte);
    if (motsCompte.size === 0) return null;

    let meilleur: { nom: string; score: number } | null = null;
    let secondScore = 0;
    for (const d of candidates) {
        let score = 0;
        for (const mot of motsSignifiants(d.name)) if (motsCompte.has(mot)) score++;
        if (meilleur === null || score > meilleur.score) {
            if (meilleur !== null) secondScore = meilleur.score;
            meilleur = { nom: d.name, score };
        } else if (score > secondScore) {
            secondScore = score;
        }
    }

    // Aucun mot en commun, ou deux dettes à égalité : on ne propose RIEN plutôt qu'au hasard.
    if (meilleur === null || meilleur.score === 0 || meilleur.score === secondScore) return null;
    return meilleur.nom;
}

/**
 * Le `debtName` persisté désigne-t-il encore une dette EXISTANTE ?
 *
 * ⚠️ Comparaison alignée sur le `debtKey` d'`applyDocument/debt.ts` (`trim().toLowerCase()`, accents
 * SIGNIFICATIFS) : c'est lui qui décide si la mise à jour du solde passe ou est refusée. Une
 * comparaison plus permissive ici afficherait « ça correspond » sur un nom qu'`applyDebt` rejette —
 * un écran qui affirme plus que ce que sa source garantit.
 */
export function debtNameExiste(debtName: string, debts: readonly Debt[] | undefined): boolean {
    const cle = String(debtName ?? '').trim().toLowerCase();
    if (cle === '') return false;
    return (debts ?? []).some((d) => String(d?.name ?? '').trim().toLowerCase() === cle);
}
