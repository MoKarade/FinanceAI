/**
 * [FINTABLE-6] Le montant du courtier fait autorité — réconciliation par panier fiscal.
 *
 * Ce module est money-critical : il décide du TOTAL affiché pour les placements. Les tests
 * verrouillent surtout ce qui pourrait fabriquer une fausse donnée en silence (solde illisible
 * rabattu sur 0, régime deviné, graphie de régime divergente).
 */
import { describe, it, expect } from 'vitest';
import {
    reconcileBrokerBalances,
    toPersistableBrokerBalances,
    type ReconcilableRegime,
} from '../../../services/fintable/brokerBalances';
import type { FintableBrokerBalance, RegisteredAccountType } from '../../../types';

const AT = 1_770_000_000_000;

function bal(over: Partial<FintableBrokerBalance> = {}): FintableBrokerBalance {
    return { accountId: 'acc-1', label: 'Disnat L7B1', balanceCad: 100_000, taxRegime: 'NON-ENREG', at: AT, ...over };
}

describe('reconcileBrokerBalances — autorité + écart', () => {
    it('l\'écart matérialise la différence : Σ titres + écart == total courtier (reconstructible)', () => {
        const r = reconcileBrokerBalances([bal({ balanceCad: 152_340 })], { 'NON-ENREG': 148_900 });
        expect(r.regimes).toHaveLength(1);
        const [reg] = r.regimes;
        expect(reg.brokerTotalCad).toBe(152_340);
        expect(reg.holdingsValueCad).toBe(148_900);
        expect(reg.gapCad).toBeCloseTo(3_440, 6);
        // L'invariant qui justifie tout le design : rien d'inexpliqué à l'écran.
        expect(reg.holdingsValueCad + reg.gapCad).toBeCloseTo(reg.brokerTotalCad, 6);
        expect(r.brokerTotalCad).toBe(152_340);
    });

    it('agrège PLUSIEURS comptes du même régime (les titres ne portent pas d\'id de compte)', () => {
        const r = reconcileBrokerBalances(
            [
                bal({ accountId: 'a', label: 'Disnat L7B1', balanceCad: 100_000 }),
                bal({ accountId: 'b', label: 'Disnat L7A3', balanceCad: 50_000 }),
            ],
            { 'NON-ENREG': 140_000 },
        );
        expect(r.regimes).toHaveLength(1);
        expect(r.regimes[0].brokerTotalCad).toBe(150_000);
        expect(r.regimes[0].gapCad).toBe(10_000);
        expect(r.regimes[0].accountLabels).toEqual(['Disnat L7B1', 'Disnat L7A3']);
    });

    it('sépare les régimes et ne mélange JAMAIS les paniers fiscaux', () => {
        const r = reconcileBrokerBalances(
            [
                bal({ accountId: 'a', taxRegime: 'CELI', balanceCad: 40_000 }),
                bal({ accountId: 'b', taxRegime: 'REER', balanceCad: 90_000 }),
            ],
            { CELI: 39_000, REER: 91_000 },
        );
        expect(r.regimes.map((x) => x.regime)).toEqual(['CELI', 'REER']); // ordre FIXE, déterministe
        expect(r.regimes.find((x) => x.regime === 'CELI')?.gapCad).toBe(1_000);
        expect(r.regimes.find((x) => x.regime === 'REER')?.gapCad).toBe(-1_000);
        expect(r.totalGapCad).toBe(0);
    });

    it('un compte SANS régime déclaré est signalé, jamais rangé d\'office dans un panier', () => {
        const r = reconcileBrokerBalances(
            [bal({ taxRegime: undefined, label: 'Compte mystère' })],
            { 'NON-ENREG': 0 },
        );
        expect(r.regimes).toHaveLength(0); // ← surtout PAS rangé au hasard
        expect(r.unassignedAccountLabels).toEqual(['Compte mystère']);
        expect(r.brokerTotalCad).toBe(0);
    });

    it('un solde NON FINI est ignoré, jamais rabattu sur 0 (un 0 crédible effacerait le compte)', () => {
        const nan = bal({ balanceCad: Number.NaN });
        const inf = bal({ accountId: 'b', balanceCad: Number.POSITIVE_INFINITY });
        const r = reconcileBrokerBalances([nan, inf], { 'NON-ENREG': 10_000 });
        expect(r.regimes).toHaveLength(0);
        expect(r.brokerTotalCad).toBe(0);
        // Discriminant : si on rabattait sur 0, on aurait un régime avec un écart de −10 000 $
        // (« le courtier dit 0 »), c'est-à-dire un compte effacé du patrimoine sans un mot.
        expect(r.totalGapCad).not.toBe(-10_000);
    });

    it('aucun solde courtier → réconciliation vide (l\'app garde son calcul d\'avant)', () => {
        expect(reconcileBrokerBalances(undefined, { CELI: 5 }).regimes).toHaveLength(0);
        expect(reconcileBrokerBalances([], { CELI: 5 }).brokerTotalCad).toBe(0);
    });

    it('titres non finis ou absents en face → écart == total courtier (honnête, pas NaN)', () => {
        const r = reconcileBrokerBalances([bal({ balanceCad: 1_000 })], { 'NON-ENREG': Number.NaN });
        expect(r.regimes[0].holdingsValueCad).toBe(0);
        expect(r.regimes[0].gapCad).toBe(1_000);
        expect(Number.isFinite(r.totalGapCad)).toBe(true);
    });

    it('la fraîcheur d\'un panier est celle du compte le PLUS ANCIEN (pas la plus flatteuse)', () => {
        const vieux = AT - 14 * 86_400_000;
        const r = reconcileBrokerBalances(
            [bal({ accountId: 'a', at: AT }), bal({ accountId: 'b', at: vieux })],
            { 'NON-ENREG': 0 },
        );
        expect(r.regimes[0].observedAt).toBe(vieux);
    });

    // [finding financial-integrity, PR #534, MESURÉ] `bucket.observedAt || at` faisait qu'un compte
    // SANS horodatage s'effaçait au profit du voisin → le panier s'affichait « vu aujourd'hui »
    // alors qu'une part de son montant était d'âge inconnu. Sur-promesse de fraîcheur.
    it('un compte SANS horodatage rend la fraîcheur du panier INCONNUE (null), jamais « aujourd\'hui »', () => {
        const sansDate = { ...bal({ accountId: 'a' }), at: undefined } as unknown as FintableBrokerBalance;
        const r = reconcileBrokerBalances([sansDate, bal({ accountId: 'b', at: AT })], { 'NON-ENREG': 0 });
        expect(r.regimes[0].observedAt).toBeNull();
        // Discriminant : l'ancien code rendait AT (« à jour ») — la valeur la plus flatteuse.
        expect(r.regimes[0].observedAt).not.toBe(AT);
        // Le montant, lui, reste bien agrégé : on perd la date, pas l'argent.
        expect(r.regimes[0].brokerTotalCad).toBe(200_000);
    });

    // [finding silent-failure-hunter, PR #534] Un solde illisible dans un état Drive ancien/corrompu
    // (aucun schéma Zod ne valide ce champ additif) disparaissait du panier SANS aucune trace.
    it('un solde ILLISIBLE est listé dans `unreadableAccountLabels`, pas avalé en silence', () => {
        const corrompu = { ...bal({ label: 'Compte corrompu' }), balanceCad: null } as unknown as FintableBrokerBalance;
        const r = reconcileBrokerBalances([corrompu, bal({ accountId: 'b', balanceCad: 5_000 })], { 'NON-ENREG': 0 });
        expect(r.unreadableAccountLabels).toEqual(['Compte corrompu']);
        expect(r.brokerTotalCad).toBe(5_000); // le compte lisible passe normalement
    });
});

describe('toPersistableBrokerBalances — n\'émet que ce qui peut faire autorité', () => {
    const raw = (o: Partial<{ accountId: string; label: string; currency: string; balance: number | null; taxRegime: ReconcilableRegime }> = {}) => ({
        accountId: 'acc-1', label: 'Disnat', currency: 'CAD', balance: 1_000, ...o,
    });

    it('garde un solde CAD lisible, avec son horodatage et son régime', () => {
        const out = toPersistableBrokerBalances([raw({ taxRegime: 'CELI' })], AT);
        expect(out).toEqual([{ accountId: 'acc-1', label: 'Disnat', balanceCad: 1_000, taxRegime: 'CELI', at: AT }]);
    });

    it('ÉCARTE un solde absent (null) — jamais converti en 0', () => {
        expect(toPersistableBrokerBalances([raw({ balance: null })], AT)).toEqual([]);
    });

    // ── [FINTABLE-DISNAT-USD-SOLDE-IGNORE] TEST DE LIMITE **INVERSÉ** le 2026-09-16 ──────────────
    // Il affirmait « ÉCARTE une devise ≠ CAD » et c'était juste tant qu'aucune conversion n'existait.
    // Mais cet écartement se faisait AVANT la persistance, donc avant la seule liste qui recense les
    // comptes écartés : « Disnat (L7B1) » n'apparaissait ni réconcilié ni signalé sur l'écran
    // Investissements — ABSENT, ce qui est indiscernable d'un compte qui n'existe pas.
    // La limite est levée là où on peut la lever (taux connu → conversion) et RENDUE VISIBLE là où
    // on ne peut pas (taux absent → signal). Inversé au même endroit, jamais supprimé, pour que la
    // trace de la question survive (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).

    it('CONVERTIT une devise ≠ CAD quand le taux est connu (avant : le compte était jeté)', () => {
        const out = toPersistableBrokerBalances([raw({ currency: 'USD' })], AT, 'CAD', { USD: 1.37 });
        expect(out).toHaveLength(1);
        expect(out[0].balanceCad).toBeCloseTo(1_370, 6);
        // Aucun signal : le compte est une autorité normale, il n'a rien à annoncer.
        expect(out[0].missingRate).toBeUndefined();
    });

    it('taux ABSENT : le compte est ÉMIS avec `missingRate` — nommé, jamais converti au hasard', () => {
        // ⚠️ Le cœur de l'arbitrage : `toCurrencyFactor` replierait sur 1:1 et persisterait 1 000
        // « CAD » pour 1 000 USD — faux d'environ 30 %, et présenté comme le total du compte. Une
        // valeur fausse crédible est pire que l'omission qu'on corrige.
        const out = toPersistableBrokerBalances([raw({ currency: 'USD' })], AT, 'CAD', {});
        expect(out).toHaveLength(1);
        expect(out[0].missingRate).toBe('USD');
        // `balanceCad` ne signifie RIEN ici, et aucune somme ne doit le lire : c'est
        // `reconcileBrokerBalances` qui détourne l'entrée avant tout calcul (test ci-dessous).
        expect(out[0].balanceCad).toBe(0);
    });

    it('taux ABSENT : le compte est DÉTOURNÉ avant toute somme, pas compté pour 0 $', () => {
        // ⚠️ LA garde de l'ordre des vérifications. Si `missingRate` n'était pas testé EN PREMIER,
        // l'entrée descendrait jusqu'à la garde de finitude, passerait (0 est fini), et serait
        // additionnée à zéro dans son panier : le compte disparaîtrait du total sans laisser de
        // trace — exactement le défaut que la liste des écartés existe pour empêcher.
        const out = toPersistableBrokerBalances(
            [raw({ currency: 'USD', taxRegime: 'CELI' })], AT, 'CAD', {},
        );
        const reco = reconcileBrokerBalances(out, { CELI: 500 });
        expect(reco.missingRateAccountLabels).toEqual(['Disnat (USD)']);
        // Ni dans les régimes, ni dans les DEUX autres causes d'écartement : un diagnostic qui
        // nommerait la mauvaise cause enverrait corriger la mauvaise chose.
        expect(reco.regimes).toEqual([]);
        expect(reco.unreadableAccountLabels).toEqual([]);
        expect(reco.unassignedAccountLabels).toEqual([]);
        expect(reco.brokerTotalCad).toBe(0);
    });

    it('un taux ABERRANT (zéro, négatif, non fini) est traité comme ABSENT, jamais appliqué', () => {
        // Un taux 0 donnerait 0 $ — le « 0 crédible » que tout ce module refuse par conception.
        for (const taux of [0, -1.37, Number.NaN, Number.POSITIVE_INFINITY]) {
            const out = toPersistableBrokerBalances([raw({ currency: 'USD' })], AT, 'CAD', { USD: taux });
            expect(out[0]?.missingRate).toBe('USD');
        }
    });

    it('CONTRÔLE NÉGATIF : un compte déjà en CAD ne voit rien changer, taux ou pas', () => {
        // Sans lui, « la conversion marche » serait indiscernable de « tout passe par la conversion ».
        const sansTaux = toPersistableBrokerBalances([raw()], AT, 'CAD', {});
        const avecTaux = toPersistableBrokerBalances([raw()], AT, 'CAD', { USD: 1.37 });
        expect(sansTaux).toEqual([{ accountId: 'acc-1', label: 'Disnat', balanceCad: 1_000, at: AT }]);
        expect(avecTaux).toEqual(sansTaux);
    });

    it('garde le compte sans régime (affichable) mais SANS inventer de taxRegime', () => {
        const [out] = toPersistableBrokerBalances([raw()], AT);
        expect(out.balanceCad).toBe(1_000);
        expect('taxRegime' in out).toBe(false);
    });
});

describe('garde de parité : la graphie du régime ne doit JAMAIS diverger de l\'app', () => {
    it('ReconcilableRegime est un sous-ensemble EXACT de RegisteredAccountType', () => {
        // Verrou au COMPILE : si quelqu'un écrit 'NON_ENREGISTRE' (graphie parallèle) d'un côté,
        // cette affectation casse le typecheck — c'est le piège [[INVEST-ALLOC-GEO-SECTOR]] d'une
        // table de lookup dont la clé a dérivé, qui meurt en silence sans ce genre de garde.
        const regimes: ReconcilableRegime[] = ['CELI', 'REER', 'NON-ENREG'];
        const asAppTypes: RegisteredAccountType[] = regimes;
        expect(asAppTypes).toHaveLength(3);
        // Et le sens inverse : ces littéraux sont bien ceux que porte `Asset.accountType`.
        const fromApp: ReconcilableRegime[] = (['CELI', 'REER', 'NON-ENREG'] as RegisteredAccountType[])
            .filter((t): t is ReconcilableRegime => t === 'CELI' || t === 'REER' || t === 'NON-ENREG');
        expect(fromApp).toEqual(regimes);
    });
});

// ── [revue panel] Un REPLI EN DUR n'est pas un taux CONNU ───────────────────────────────────────
//
// ⚠️⚠️ Le défaut que ces gardes ferment est celui que l'en-tête du lot prétendait éviter, repayé un
// cran plus bas. `DEFAULT_FX_RATES` porte `USD: 1.40` (« approximation Q1 2026 ») et est TOUJOURS
// présent dans l'état, avec `fxRatesEstimated: true` pour le dire. Sans consulter ce drapeau, la
// conversion publiait 1,40 comme AUTORITÉ sur le total d'un compte — plus crédible que le repli 1:1
// qu'on avait su refuser, donc MOINS réfutable. Et la branche `missingRate` devenait quasi
// inatteignable pour USD/EUR, les deux seules devises étrangères du type : une garde qui ne peut
// presque pas tirer.

describe('[revue panel] un taux ESTIMÉ ne fait pas autorité sur un solde de courtier', () => {
    const rawUsd = { accountId: 'acc-1', label: 'Disnat', currency: 'USD', balance: 1_000 };

    it('taux ESTIMÉ → traité comme absent : le compte est NOMMÉ, jamais converti', () => {
        const out = toPersistableBrokerBalances([rawUsd], AT, 'CAD', { USD: 1.40 }, true);
        expect(out[0].missingRate).toBe('USD');
        expect(out[0].balanceCad).toBe(0);
    });

    it('taux RÉEL → converti, comme avant', () => {
        // Contrôle négatif du précédent : sans lui, un module qui refuserait TOUJOURS de convertir
        // passerait le test ci-dessus.
        const out = toPersistableBrokerBalances([rawUsd], AT, 'CAD', { USD: 1.40 }, false);
        expect(out[0].missingRate).toBeUndefined();
        expect(out[0].balanceCad).toBeCloseTo(1_400, 6);
    });

    it('un compte en CAD ne voit rien changer, estimé ou non', () => {
        // Le drapeau ne doit toucher QUE la conversion : un solde déjà dans la devise de base n'a
        // aucun taux à appliquer, donc aucune raison d'être écarté.
        const rawCad = { accountId: 'acc-1', label: 'Disnat', currency: 'CAD', balance: 1_000 };
        const estime = toPersistableBrokerBalances([rawCad], AT, 'CAD', { USD: 1.40 }, true);
        const reel = toPersistableBrokerBalances([rawCad], AT, 'CAD', { USD: 1.40 }, false);
        expect(estime).toEqual(reel);
        expect(estime[0].balanceCad).toBe(1_000);
        expect(estime[0].missingRate).toBeUndefined();
    });

    it('DÉBORDEMENT : le compte est ROUTÉ vers la liste, jamais abandonné sans trace', () => {
        // ⚠️ Un `continue` ici le ferait retomber dans le trou que ce lot vient de boucher : absent
        // des TROIS listes d'écartés, donc invisible — le défaut exact que `missingRateAccountLabels`
        // existe pour empêcher, réintroduit par sa propre réparation.
        const enorme = { accountId: 'acc-1', label: 'Disnat', currency: 'USD', balance: 1e308 };
        const out = toPersistableBrokerBalances([enorme], AT, 'CAD', { USD: 1e10 }, false);
        expect(out).toHaveLength(1);
        expect(out[0].missingRate).toBe('USD');
        const reco = reconcileBrokerBalances(out, {});
        expect(reco.missingRateAccountLabels).toEqual(['Disnat (USD)']);
    });
});

// ⚠️⚠️ [FINTABLE-AUTORITE-PARTIELLE] Les trois listes d'écartés existaient pour qu'« un compte ne
// disparaisse jamais en silence ». Il manquait la question suivante : QUEL PANIER un écarté
// ampute-t-il ? Tant que ces totaux ne servaient qu'à une carte d'écart, personne n'avait besoin de
// la réponse. Depuis que le mois 0 de la projection les consomme, un total amputé est un FAUX.
describe('incompleteRegimes / hasUnplaceableAccount — quel panier est amputé', () => {
    const brut = (o: Partial<FintableBrokerBalance> = {}): FintableBrokerBalance =>
        ({ accountId: 'x', label: 'Disnat', balanceCad: 30_000, taxRegime: 'NON-ENREG', at: AT, ...o });

    it('un compte écarté faute de TAUX marque son régime INCOMPLET quand un autre survit', () => {
        const r = reconcileBrokerBalances([
            brut({ accountId: 'cad', balanceCad: 30_000 }),
            brut({ accountId: 'usd', balanceCad: 0, missingRate: 'USD' }),
        ], { 'NON-ENREG': 231_882 });
        expect(r.regimes[0].brokerTotalCad).toBe(30_000);   // le total EST amputé…
        expect(r.incompleteRegimes).toEqual(['NON-ENREG']); // …et c'est DIT
        expect(r.hasUnplaceableAccount).toBe(false);
    });

    it('un solde ILLISIBLE marque aussi son régime incomplet', () => {
        const r = reconcileBrokerBalances([
            brut({ accountId: 'a', balanceCad: 30_000 }),
            brut({ accountId: 'b', balanceCad: Number.NaN }),
        ], { 'NON-ENREG': 100_000 });
        expect(r.incompleteRegimes).toEqual(['NON-ENREG']);
    });

    it('un compte SANS régime déclaré est « non plaçable » — il peut amputer n\'importe quel panier', () => {
        const r = reconcileBrokerBalances([
            brut({ accountId: 'a', balanceCad: 80_000 }),
            brut({ accountId: 'b', balanceCad: 60_000, taxRegime: undefined }),
        ], { 'NON-ENREG': 140_000 });
        expect(r.hasUnplaceableAccount).toBe(true);
    });

    it('CONTRÔLE NÉGATIF — aucun écarté : les deux signaux restent vides', () => {
        const r = reconcileBrokerBalances([brut()], { 'NON-ENREG': 30_000 });
        expect(r.incompleteRegimes).toEqual([]);
        expect(r.hasUnplaceableAccount).toBe(false);
    });

    it('CONTRÔLE NÉGATIF — TOUS les comptes du régime écartés : rien à refuser, rien à signaler', () => {
        // Le régime n'apparaît pas dans `regimes`, donc `appliquerAutoriteCourtier` ne peut rien
        // lui appliquer : le marquer « incomplet » ferait parler d'un panier qui n'existe pas.
        const r = reconcileBrokerBalances([brut({ balanceCad: 0, missingRate: 'USD' })], { 'NON-ENREG': 100_000 });
        expect(r.regimes).toEqual([]);
        expect(r.incompleteRegimes).toEqual([]);
        expect(r.missingRateAccountLabels).toHaveLength(1);
    });
});
