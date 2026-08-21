// services/projection/debtSchedule.ts
//
// [DETTE-DATES] Une dette a un DÉBUT et une FIN — demande Marc 2026-08-19 (« pour la dette de ma
// voiture la date de début est le 20 juillet mais j'ai jamais pu définir le début ni la fin du
// bail »). Avant ce lot, le moteur servait TOUTE dette du mois 0 jusqu'à extinction, sans jamais
// regarder de calendrier : un prêt qui commence dans six mois grevait déjà le budget d'aujourd'hui,
// et un bail de 48 mois continuait d'être payé pendant trente ans.
//
// ⚠️ DÉCISION MARC (2026-08-19), au moment de choisir ce que la date de fin FAIT :
// « arrêter le paiement ET signaler si le solde n'est pas nul ». Le solde résiduel n'est donc
// **jamais remis à zéro en silence** — il reste au bilan, visible, avec une alerte. C'est la seule
// lecture compatible avec le no-fake-data : effacer une dette parce qu'une date est passée
// fabriquerait du patrimoine.
//
// ⚠️ Cas d'usage de Marc : un **BAIL** auto, pas un prêt. Un bail n'amortit rien — c'est un loyer
// mensuel sur un terme fixe, puis on rend l'auto (ou on la rachète). Le modèle « solde + taux +
// paiement minimum » lui va mal, et c'est précisément pourquoi le signalement compte : à la fin du
// terme, le « solde » d'un bail saisi comme une dette ordinaire ne tombera généralement PAS à zéro,
// et cet écart doit se voir plutôt que d'être absorbé.
//
// Fonctions PURES, sans dépendance au moteur : testables sur des dates, pas sur une projection.
// ⚠️ [finding silent-failure-hunter, revue #687] `sumNotYetStartedDebtsAt(Absolute)Month` journalise
// (`logError`) un solde de dette non fini plutôt que de le rabattre à 0 en silence — même patron que
// `sumActiveDebts` (services/projection.ts) et son miroir `computeRawNetWorth` (netWorth.ts), qui
// journalisent tous les deux le même genre de corruption. Cette journalisation est un SIDE-CHANNEL
// diagnostique (ne change jamais le résultat retourné) ; le chemin sain ne paie qu'un
// `Number.isFinite`, comme dans `netWorth.ts`.

import { logError } from '../errorLogger';

/** Ce que le moteur a besoin de savoir d'une dette pour décider de la servir ce mois-ci. */
export interface DebtDates {
    /** Début du prêt / du bail (YYYY-MM-DD). Absent ⇒ la dette a toujours couru. */
    startDate?: string;
    /** Fin du terme / du bail (YYYY-MM-DD). Absent ⇒ on paie jusqu'à extinction (comportement d'avant). */
    termEndDate?: string;
}

export type DebtPhase =
    /** Pas encore commencée : aucun paiement, aucun intérêt, elle n'est pas encore au bilan. */
    | 'a-venir'
    /** En cours : on la sert normalement. */
    | 'active'
    /** Terme échu : on cesse de payer. Le solde résiduel reste visible (jamais effacé). */
    | 'terminee';

/**
 * Le premier jour du mois `m` de la simulation, en UTC.
 *
 * ⚠️ On compare des MOIS, pas des jours. Marc a saisi « 20 juillet » : une dette qui commence le 20
 * d'un mois est due ce mois-là, pas le suivant — le moteur est mensuel, prétendre au jour près
 * serait une précision que le modèle n'a pas. Idem pour la fin : le dernier paiement tombe dans le
 * mois de la date de fin, celui-ci INCLUS.
 */
export function moisDeSimulation(startYear: number, startMonth: number, m: number): { annee: number; mois: number } {
    const total = startYear * 12 + startMonth + m;
    return { annee: Math.floor(total / 12), mois: total % 12 };
}

/** Convertit une date ISO en index de mois absolu (année × 12 + mois), ou `null` si illisible. */
export function moisAbsolu(dateIso: string | undefined): number | null {
    if (!dateIso) return null;
    const m = /^(\d{4})-(\d{2})/.exec(dateIso);
    if (!m) return null;
    const annee = Number(m[1]);
    const mois = Number(m[2]) - 1;
    if (!Number.isFinite(annee) || !Number.isFinite(mois) || mois < 0 || mois > 11) return null;
    return annee * 12 + mois;
}

/**
 * Dans quelle phase se trouve la dette au mois ABSOLU `courant` (année × 12 + mois, 0-indexé) ?
 * Noyau de `phaseDette` — extrait pour être appelable directement depuis un mois calendaire
 * (`moisAbsolu(dateIso)`) sans passer par `moisDeSimulation`, utile à un appelant qui raisonne déjà
 * en dates absolues plutôt qu'en index de simulation (ex. reconstruction du passé au jour).
 *
 * ⚠️ Une date ILLISIBLE est traitée comme ABSENTE (dette toujours active), jamais comme une
 * contrainte inventée : une saisie ratée ne doit pas faire disparaître une dette réelle du budget.
 * C'est le sens conservateur — on garde la dette, on ne l'efface pas.
 */
export function phaseDetteAuMoisAbsolu(dette: DebtDates, courant: number): DebtPhase {
    const debut = moisAbsolu(dette.startDate);
    if (debut !== null && courant < debut) return 'a-venir';

    const fin = moisAbsolu(dette.termEndDate);
    if (fin !== null && courant > fin) return 'terminee';

    return 'active';
}

/** Dans quelle phase se trouve la dette au mois `m` de la simulation ? Cf. `phaseDetteAuMoisAbsolu`
 *  pour la logique et sa note sur les dates illisibles. */
export function phaseDette(
    dette: DebtDates,
    startYear: number,
    startMonth: number,
    m: number,
): DebtPhase {
    const { annee, mois } = moisDeSimulation(startYear, startMonth, m);
    return phaseDetteAuMoisAbsolu(dette, annee * 12 + mois);
}

/** Ce qu'il faut connaître d'une dette pour la sommer dans un registre de patrimoine : ses dates
 *  (cf. `DebtDates`) et son solde ACTUEL. `id`/`name` sont optionnels — utilisés UNIQUEMENT comme
 *  contexte de diagnostic si le solde est corrompu (jamais lus pour le calcul lui-même). */
export interface DebtBalance extends DebtDates {
    balance: number;
    id?: string;
    name?: string;
}

/** Throttle du `logError` de solde de dette non fini : une signature (id de dette) par run, même
 *  patron que `netWorth.ts` — sans ça, `sumNotYetStartedDebtsAtAbsoluteMonth` est appelée jusqu'à
 *  `maxDays` fois/jour reconstruit (`dailyPastLedger.ts`), et journaliser à CHAQUE appel pour une
 *  même dette corrompue thrasherait le localStorage de `logError`. */
const loggedNonFiniteDebtSignatures = new Set<string>();

/** Test-only : remet à zéro le throttle ci-dessus (isolation entre tests, convention `__` du dépôt). */
export function __resetNonFiniteDebtSignatureLog(): void {
    loggedNonFiniteDebtSignatures.clear();
}

/**
 * Somme des soldes ACTUELS (bruts, `d.balance`) des dettes DÉJÀ ACTIVES AUJOURD'HUI (mois
 * `moisAujourdhui`) mais PAS ENCORE COMMENCÉES au mois ABSOLU `courant` — à SOUSTRAIRE d'un total
 * agrégé « aujourd'hui » (typiquement `chartData[0].DettesNonImmo`, déjà EXACT et déjà sanitisé par
 * le moteur) pour obtenir le total d'un mois PASSÉ où certaines dettes n'existaient pas encore.
 *
 * ⚠️ [CRITIQUE, revue #687 — trouvé indépendamment par financial-integrity ET code-reviewer,
 * MESURÉ] Le 1er jet excluait une dette dès que `phaseDetteAuMoisAbsolu(d, courant) === 'a-venir'`,
 * SANS vérifier qu'elle était déjà comptée dans `currentDebtNonImmo` en premier lieu. Or
 * `sumActiveDebts` du moteur (`services/projection.ts`) exclut DÉJÀ toute dette 'a-venir'
 * AUJOURD'HUI — une dette dont le `startDate` est encore dans le FUTUR (cas d'usage explicite de
 * `[DETTE-DATES]` : « un prêt signé dans six mois ») ne contribue JAMAIS à `currentDebtNonImmo`.
 * La retrancher quand même fabriquait du patrimoine négatif de dette = un NetWorth passé GONFLÉ du
 * solde entier de cette dette (mesuré : −22 000 $ sur un exemple). Le garde-fou : une dette n'est
 * incluse dans ce delta QUE si elle est déjà active/terminée AUJOURD'HUI (`moisAujourdhui`) — sinon
 * elle n'a jamais fait partie du total à corriger, et sa contribution correcte à TOUT mois passé
 * est 0, identique à sa contribution à `currentDebtNonImmo`.
 *
 * ⚠️ [ÉLEVÉ, mesuré] Même pour une dette CORRECTEMENT exclue, le delta utilise son solde BRUT
 * (`d.balance`) alors que `currentDebtNonImmo` porte le solde APRÈS le pas d'amortissement du mois 0
 * du moteur (voir plus bas) — la soustraction peut donc rendre `debtNonImmo` légèrement NÉGATIF
 * (mesuré : jusqu'à −4 651,67 $ sur un exemple à paiement élevé). L'appelant (`buildPastPrefix.ts`/
 * `dailyPastLedger.ts`) DOIT clamper le résultat à 0 (`Math.max(0, …)`) — une dette ne peut jamais
 * être négative, et `computeRawNetWorth` ne clampe pas ce terme lui-même.
 *
 * Pourquoi une SOUSTRACTION plutôt qu'une resommation complète : `chartData[0].DettesNonImmo`
 * n'est PAS la simple somme des `balance` bruts des dettes actives — le moteur a déjà appliqué son
 * propre pas d'amortissement du mois 0 (intérêt + paiement) AVANT de le publier. Resommer les
 * `balance` bruts pour TOUTES les dettes actives diverge donc de ce total de quelques dizaines à
 * quelques centaines de dollars (mesuré) — un écart qui casserait le raccord EXACT qu'Option A
 * garantit. En ne touchant qu'au DELTA des dettes EXCLUES (qui, avant ce lot, n'existaient dans
 * AUCUN total agrégé de toute façon), le cas « aucune dette datée » reste bit-identique à avant
 * (delta nul), et seule la correction visée (une dette pas encore commencée ne doit pas peser sur
 * le passé) introduit une approximation — bornée à la dette EFFECTIVEMENT gatée (borné par le clamp
 * ci-dessus), jamais aux autres.
 *
 * Même sanitisation à la frontière que `sumActiveDebts` du moteur (entrée nullish ignorée, solde
 * non fini rabattu à 0 plutôt que propagé en NaN) — ET même réflexe de traçabilité : un solde non
 * fini est JOURNALISÉ (`logError`, throttlé par dette), jamais avalé en silence (§1 no-fake-data :
 * un `0 $` crédible issu d'une corruption est pire qu'une trace honnête).
 */
export function sumNotYetStartedDebtsAtAbsoluteMonth(
    debts: ReadonlyArray<DebtBalance> | null | undefined,
    courant: number,
    moisAujourdhui: number,
): number {
    return (debts ?? []).filter(d => !!d).reduce((s, d) => {
        // Pas encore active AUJOURD'HUI ⇒ jamais dans currentDebtNonImmo ⇒ rien à en retrancher.
        if (phaseDetteAuMoisAbsolu(d, moisAujourdhui) === 'a-venir') return s;
        if (phaseDetteAuMoisAbsolu(d, courant) !== 'a-venir') return s;
        if (Number.isFinite(d.balance)) return s + d.balance;
        const signature = d.id ?? d.name ?? 'sans-identifiant';
        if (!loggedNonFiniteDebtSignatures.has(signature)) {
            loggedNonFiniteDebtSignatures.add(signature);
            logError({
                source: 'projection',
                severity: 'warning',
                message: 'sumNotYetStartedDebtsAtAbsoluteMonth : solde de dette non fini rabattu à 0 (passé reconstruit)',
                context: { id: d.id, name: d.name },
            });
        }
        return s;
    }, 0);
}

/** Comme `sumNotYetStartedDebtsAtAbsoluteMonth`, mais au mois `m` de la simulation plutôt qu'en
 *  mois absolu. « Aujourd'hui » == le mois 0 de la simulation, par construction de `buildPastPrefix`
 *  (mi &lt; 0 pour le passé, mi = 0 non calculé ici mais correspond au présent). */
export function sumNotYetStartedDebtsAtMonth(
    debts: ReadonlyArray<DebtBalance> | null | undefined,
    startYear: number,
    startMonth: number,
    m: number,
): number {
    const { annee, mois } = moisDeSimulation(startYear, startMonth, m);
    const moisAujourdhui = startYear * 12 + startMonth; // == moisDeSimulation(startYear, startMonth, 0)
    return sumNotYetStartedDebtsAtAbsoluteMonth(debts, annee * 12 + mois, moisAujourdhui);
}

/**
 * Le mois `m` est-il celui où le terme vient tout juste d'échoir ? Sert à n'émettre l'alerte
 * « solde non nul à la fin du terme » qu'UNE fois, au lieu de la répéter chaque mois pendant
 * vingt ans (une alerte permanente ne se lit plus comme une alerte —
 * cf. `EPURATION-SUPPRIME-LA-RESERVE`).
 */
export function estLePremierMoisApresLeTerme(
    dette: DebtDates,
    startYear: number,
    startMonth: number,
    m: number,
): boolean {
    const fin = moisAbsolu(dette.termEndDate);
    if (fin === null) return false;
    const { annee, mois } = moisDeSimulation(startYear, startMonth, m);
    return annee * 12 + mois === fin + 1;
}
