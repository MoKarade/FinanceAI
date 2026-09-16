// services/fintable/brokerBalances.ts
//
// [FINTABLE-6] Le montant du COURTIER fait autorité sur le total d'un compte de placement.
//
// Demande Marc (2026-07-30) : « je veux que dans investissements ça utilise exactement le montant
// que j'ai dans Fintable ». C'est la formalisation de la leçon [[ASSET-FX-DISPLAY]] — « l'arbitre
// est le COURTIER » — désormais lue automatiquement au lieu d'être constatée après coup.
//
// ⚠️ CONTRAINTE STRUCTURELLE : Fintable rend le TOTAL d'un compte, JAMAIS ses positions
// (FINTABLE-POSITIONS : Disnat hors SnapTrade, limite produit mesurée). Il y a donc presque
// toujours un écart entre ce total et la somme des titres saisis à la main. Choix Marc, en
// connaissance de cause : **autorité + ligne d'écart explicite** — le total affiché est celui du
// courtier, et la différence est MATÉRIALISÉE au lieu d'être noyée. C'est ce qui préserve la
// reconstructibilité exigée par la checklist VALIDATION FINANCIÈRE (« un patrimoine net affiché ne
// doit JAMAIS être inexpliqué par l'UI ») : Σ titres + écart == total courtier, par construction.
//
// ⚠️ GRANULARITÉ = LE RÉGIME FISCAL, PAS LE COMPTE. Les titres (`Asset`) ne portent pas d'id de
// compte courtier — seulement `accountType` (CELI/REER/NON-ENREG…). On ne PEUT donc pas réconcilier
// par compte : deux comptes non-enregistrés chez le même courtier sont indiscernables côté app.
// La réconciliation se fait par PANIER FISCAL (somme des comptes d'un régime vs somme des titres de
// ce régime). C'est la granularité que consomme aussi la projection — pas une approximation subie.
//
// Un compte dont le régime n'est pas déclaré est EXCLU de la réconciliation (et signalé) : ranger un
// écart dans le mauvais panier fausserait l'impôt de toute la projection, pas seulement un affichage.

import type { FintableBrokerBalance, RegisteredAccountType } from '../../types';

/** Régimes réconciliables. Sous-ensemble EXACT de `RegisteredAccountType` (zéro graphie parallèle). */
export type ReconcilableRegime = Extract<RegisteredAccountType, 'CELI' | 'REER' | 'NON-ENREG'>;

/** Réconciliation d'UN panier fiscal : ce que dit le courtier vs ce que disent les titres saisis. */
interface RegimeReconciliation {
    regime: ReconcilableRegime;
    /** Somme des soldes courtier des comptes de ce régime — fait AUTORITÉ. */
    brokerTotalCad: number;
    /** Somme des titres saisis rattachés à ce régime (déjà convertis en CAD par l'appelant). */
    holdingsValueCad: number;
    /** `brokerTotalCad − holdingsValueCad`. Positif = des avoirs non saisis ; négatif = sur-saisie. */
    gapCad: number;
    /** Libellés des comptes courtier agrégés ici (affichage : « Disnat L7B1 + Disnat L7A3 »). */
    accountLabels: string[];
    /**
     * Lecture la plus ANCIENNE du panier (epoch ms) — c'est elle qui borne la fraîcheur affichée.
     * `null` si AU MOINS un compte du panier n'a pas d'horodatage exploitable : mieux vaut ne rien
     * promettre que promettre « vu aujourd'hui » sur un panier dont une part est d'âge inconnu.
     */
    observedAt: number | null;
}

interface BrokerReconciliation {
    /** Un item par régime ayant au moins un compte courtier déclaré. Trié, déterministe. */
    regimes: RegimeReconciliation[];
    /** Comptes ignorés faute de régime déclaré — à SIGNALER, jamais à ranger d'office. */
    unassignedAccountLabels: string[];
    /**
     * Comptes écartés parce que leur solde persisté est ILLISIBLE (null/NaN dans un état Drive
     * ancien ou corrompu, qu'aucun schéma Zod ne valide). Sans cette liste, le `continue` les
     * faisait disparaître de la réconciliation SANS aucun signal — la « staleness silencieuse »
     * que ce projet s'est déjà prise plusieurs fois. Inatteignable via l'écrivain normal
     * (`toPersistableBrokerBalances` ne persiste que du fini), mais un état ne se suppose pas.
     */
    unreadableAccountLabels: string[];
    /**
     * [FINTABLE-DISNAT-USD-SOLDE-IGNORE] Comptes écartés faute de TAUX DE CHANGE — `« Disnat (L7B1) »
     * (USD)`. Troisième cause d'écartement, et la seule qui n'était recensée NULLE PART : le filtre
     * de devise vit dans `toPersistableBrokerBalances`, donc un cran AVANT la persistance, donc ces
     * comptes n'entraient jamais dans `balances` et ne pouvaient figurer ni ici ni dans
     * `unreadableAccountLabels`. La liste des écartés existait — elle connaissait deux causes sur
     * trois, et son compteur à zéro sur la troisième se lisait « rien à signaler »
     * (`CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG`).
     *
     * ⚠️ Le compte reste ÉCARTÉ, et c'est délibéré : convertir avec le repli 1:1 de
     * `toCurrencyFactor` donnerait 72 040 « CAD » pour 72 040 USD — une valeur fausse d'environ 30 %
     * présentée comme AUTORITÉ, donc pire que l'omission qu'on corrige
     * (`UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`). Un taux CONNU convertit ; un
     * taux absent écarte et le DIT.
     */
    missingRateAccountLabels: string[];
    /** Somme des soldes courtier de tous les régimes réconciliés. */
    brokerTotalCad: number;
    /** Somme des écarts. Peut être négatif. */
    totalGapCad: number;
}

const RECONCILABLE: readonly ReconcilableRegime[] = ['CELI', 'REER', 'NON-ENREG'];

function isReconcilable(v: unknown): v is ReconcilableRegime {
    return typeof v === 'string' && (RECONCILABLE as readonly string[]).includes(v);
}

/**
 * Réconcilie les soldes courtier avec la valeur des titres saisis, PAR RÉGIME FISCAL.
 *
 * @param balances       soldes lus chez le courtier (`AppState.fintableBrokerBalances`).
 * @param holdingsByRegime valeur CAD des titres saisis, par régime. L'appelant est responsable de
 *        la conversion FX (elle DOIT passer par `assetValueCad` — source unique, cf. garde
 *        `assetFxGuard`) : ce module ne fait aucune arithmétique de devise, il compare des CAD.
 *
 * Robustesse : un solde non fini est IGNORÉ (jamais rabattu sur 0 — un 0 crédible effacerait un
 * compte entier du patrimoine, cf. no-fake-data) ; une valeur de titres non finie est traitée comme
 * 0 titre saisi, ce qui rend l'écart == total courtier (honnête : « rien de saisi en face »).
 */
export function reconcileBrokerBalances(
    balances: readonly FintableBrokerBalance[] | undefined,
    holdingsByRegime: Readonly<Partial<Record<ReconcilableRegime, number>>>,
): BrokerReconciliation {
    const empty: BrokerReconciliation = {
        regimes: [], unassignedAccountLabels: [], unreadableAccountLabels: [],
        missingRateAccountLabels: [],
        brokerTotalCad: 0, totalGapCad: 0,
    };
    if (!Array.isArray(balances) || balances.length === 0) return empty;

    // `observedAt: number | null` — `null` = au moins un compte du panier sans horodatage lisible.
    const byRegime = new Map<ReconcilableRegime, { total: number; labels: string[]; observedAt: number | null }>();
    const unassignedAccountLabels: string[] = [];
    const unreadableAccountLabels: string[] = [];
    const missingRateAccountLabels: string[] = [];

    for (const b of balances) {
        // [FINTABLE-DISNAT-USD-SOLDE-IGNORE] EN PREMIER, avant toute autre garde. Une entrée
        // `missingRate` porte `balanceCad: 0` qui ne signifie RIEN : la laisser descendre la
        // classerait « solde lisible » et l'additionnerait à zéro dans son panier — un compte
        // effacé du total sans trace, exactement le défaut que la liste des écartés existe pour
        // empêcher. L'ordre des gardes EST le correctif.
        const missingRate = typeof b?.missingRate === 'string' ? b.missingRate.trim() : '';
        if (missingRate) {
            missingRateAccountLabels.push(`${String(b?.label ?? '(compte sans nom)')} (${missingRate})`);
            continue;
        }
        // Même garde null-explicite qu'à l'écriture : `balanceCad` est typé `number`, mais cet état
        // vient du Drive et n'est validé par AUCUN schéma Zod (champ additif) — une copie ancienne
        // ou corrompue peut porter un `null` que le typage ne voit pas (cf. carte UI durcie, PR #531).
        const rawBalance = b?.balanceCad as number | null | undefined;
        if (rawBalance === null || rawBalance === undefined || !Number.isFinite(Number(rawBalance))) {
            // Solde illisible → écarté, mais JAMAIS en silence : sans cette liste, un compte
            // disparaissait du panier sans trace (finding silent-failure-hunter, PR #534).
            unreadableAccountLabels.push(String(b?.label ?? '(compte sans nom)'));
            continue;
        }
        const amount = Number(rawBalance);
        if (!isReconcilable(b?.taxRegime)) {
            unassignedAccountLabels.push(String(b?.label ?? '(compte sans nom)'));
            continue;
        }
        const rawAt = b?.at as number | null | undefined;
        // `<= 0` traité comme INCONNU : `toPersistableBrokerBalances` encode précisément un
        // horodatage corrompu en 0 — l'accepter comme date valide afficherait « vu jamais » et,
        // via Math.min, contaminerait tout le panier (finding financial-integrity, panel #543).
        const at = rawAt === null || rawAt === undefined || !Number.isFinite(Number(rawAt)) || Number(rawAt) <= 0
            ? null
            : Number(rawAt);
        const bucket = byRegime.get(b.taxRegime);
        if (bucket === undefined) {
            byRegime.set(b.taxRegime, { total: amount, labels: [String(b.label ?? '')], observedAt: at });
        } else {
            bucket.total += amount;
            bucket.labels.push(String(b.label ?? ''));
            // La fraîcheur d'un panier vaut celle de son compte le PLUS ANCIEN : afficher la plus
            // récente laisserait croire à jour un panier dont la moitié date de deux semaines.
            // ⚠️ Un horodatage MANQUANT contamine à `null` (âge inconnu), il ne s'efface pas au
            // profit du voisin : `bucket.observedAt || at` promouvait « vu aujourd'hui » un panier
            // dont un compte n'avait aucune date (finding financial-integrity, PR #534, mesuré).
            bucket.observedAt = bucket.observedAt === null || at === null
                ? null
                : Math.min(bucket.observedAt, at);
        }
    }

    // Ordre FIXE (pas l'ordre d'arrivée des comptes) → rendu stable d'une passe à l'autre.
    const regimes: RegimeReconciliation[] = RECONCILABLE.flatMap((regime) => {
        const bucket = byRegime.get(regime);
        if (bucket === undefined) return [];
        const rawHoldings = Number(holdingsByRegime[regime]);
        const holdingsValueCad = Number.isFinite(rawHoldings) ? rawHoldings : 0;
        return [{
            regime,
            brokerTotalCad: bucket.total,
            holdingsValueCad,
            gapCad: bucket.total - holdingsValueCad,
            accountLabels: bucket.labels,
            observedAt: bucket.observedAt,
        }];
    });

    return {
        regimes,
        unassignedAccountLabels,
        unreadableAccountLabels,
        missingRateAccountLabels,
        brokerTotalCad: regimes.reduce((s, r) => s + r.brokerTotalCad, 0),
        totalGapCad: regimes.reduce((s, r) => s + r.gapCad, 0),
    };
}

/**
 * Convertit le rapport du mapper en soldes PERSISTABLES.
 *
 * N'émet QUE ce qui peut faire autorité : solde fini et devise de base. Le reste a déjà produit un
 * avertissement côté mapper — le ré-émettre ici en le rabattant sur 0 fabriquerait une fausse
 * donnée (le piège `Number('') === 0` de [[FINTABLE]], appliqué au patrimoine cette fois).
 */
export function toPersistableBrokerBalances(
    investmentBalances: readonly {
        accountId: string; label: string; currency: string;
        balance: number | null; taxRegime?: ReconcilableRegime;
    }[],
    at: number,
    baseCurrency = 'CAD',
    fxRates?: Record<string, number>,
): FintableBrokerBalance[] {
    const base = baseCurrency.toUpperCase();
    const stamp = Number.isFinite(at) ? at : 0;
    const out: FintableBrokerBalance[] = [];
    for (const b of investmentBalances) {
        // ⚠️ `Number(null) === 0` ET `Number('') === 0` : tester `Number.isFinite(Number(x))` NE
        // suffit PAS — un solde ABSENT deviendrait un 0 $ parfaitement crédible qui effacerait le
        // compte du patrimoine sans un mot. Le piège exact de [[FINTABLE]], attrapé ici par son
        // propre test. Donc : rejet EXPLICITE de null/undefined AVANT toute conversion.
        const rawBalance = b?.balance;
        if (rawBalance === null || rawBalance === undefined) continue;
        const amount = Number(rawBalance);
        if (!Number.isFinite(amount)) continue;
        // [FINTABLE-DISNAT-USD-SOLDE-IGNORE] Avant le 2026-09-16, ce `continue` jetait le compte en
        // devise étrangère — et le jetait AVANT la persistance, donc avant la seule liste qui
        // recense les écartés : « Disnat (L7B1) » n'apparaissait ni réconcilié, ni signalé, il était
        // simplement ABSENT de l'écran Investissements et de l'Accueil.
        //
        // ⚠️ La conversion N'EST PAS faite par `toCurrencyFactor` : ce helper replie sur 1:1 quand
        // le taux manque, ce qui est le bon comportement pour un AFFICHAGE d'actif (montrer quelque
        // chose + journaliser) et le pire pour une AUTORITÉ — 72 040 USD deviendraient 72 040 « CAD »,
        // faux d'environ 30 %, présentés comme le total du compte
        // (`UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`). On interroge donc le taux
        // EXPLICITEMENT, et son absence produit un signal, jamais un nombre.
        const devise = String(b?.currency ?? '').toUpperCase();
        let balanceCad = amount;
        let missingRate = '';
        if (devise && devise !== base) {
            const taux = fxRates?.[devise];
            if (typeof taux === 'number' && Number.isFinite(taux) && taux > 0) {
                balanceCad = amount * taux;
                // Un produit fini d'entrées finies peut déborder (`1e308 * 2`) : la garde vaut aussi
                // après la multiplication, sinon on persisterait `Infinity` comme une autorité.
                if (!Number.isFinite(balanceCad)) continue;
            } else {
                // Le compte est quand même ÉMIS — c'est tout l'objet du lot : il doit être NOMMÉ là
                // où Marc regarde ses placements. `balanceCad: 0` ne signifie rien et n'est jamais
                // lu : `reconcileBrokerBalances` détourne `missingRate` avant toute somme.
                balanceCad = 0;
                missingRate = devise;
            }
        }
        out.push({
            accountId: String(b.accountId),
            label: String(b.label ?? ''),
            balanceCad,
            ...(missingRate ? { missingRate } : {}),
            ...(isReconcilable(b.taxRegime) ? { taxRegime: b.taxRegime } : {}),
            at: stamp,
        });
    }
    return out;
}
