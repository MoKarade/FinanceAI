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
import { fxFaitAutorite, fxSourceEffective, type EtatFxMinimal } from '../fx/provenance';

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
    /** Libellés des comptes courtier agrégés ici (affichage : « Disnat 0001 + Disnat 0002 »). */
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
     * [FINTABLE-DISNAT-USD-SOLDE-IGNORE] Comptes écartés faute de TAUX DE CHANGE — `« Disnat (0001) »
     * (USD)`. Troisième cause d'écartement, et la seule qui n'était recensée NULLE PART : le filtre
     * de devise vit dans `toPersistableBrokerBalances`, donc un cran AVANT la persistance, donc ces
     * comptes n'entraient jamais dans `balances` et ne pouvaient figurer ni ici ni dans
     * `unreadableAccountLabels`. La liste des écartés existait — elle connaissait deux causes sur
     * trois, et son compteur à zéro sur la troisième se lisait « rien à signaler »
     * (`CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG`).
     *
     * ⚠️ Le compte reste ÉCARTÉ, et c'est délibéré : convertir avec le repli 1:1 de
     * `toCurrencyFactor` donnerait N « CAD » pour N USD — une valeur fausse d'environ 30 %
     * présentée comme AUTORITÉ, donc pire que l'omission qu'on corrige
     * (`UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`). Un taux CONNU convertit ; un
     * taux absent écarte et le DIT.
     */
    missingRateAccountLabels: string[];
    /**
     * ⚠️⚠️ [FINTABLE-AUTORITE-PARTIELLE] Régimes dont AU MOINS UN compte a été écarté (taux inconnu
     * ou solde illisible) alors qu'un autre compte du MÊME régime a survécu.
     *
     * `brokerTotalCad` de ces régimes est alors un total AMPUTÉ : il fait autorité sur une PARTIE
     * du panier et se présente comme le tout. Tant que personne ne lisait ces totaux hors de la
     * carte d'écart, ça ne coûtait rien. Depuis que le mois 0 de la projection les consomme, un
     * panier partiel ÉCRASE la valeur reconstruite complète — mesuré sur la chaîne réelle :
     * un compte CAD + un compte USD écarté faute de taux (exactement l'état de Marc
     * quand ses taux viennent du repli) donne un mois 0 égal au **seul compte CAD** au lieu de la valeur complète.
     *
     * Le champ existe pour que `appliquerAutoriteCourtier` REFUSE ces régimes, au lieu de les
     * appliquer à moitié. Un total partiel n'est pas une autorité dégradée : c'est un faux.
     */
    incompleteRegimes: ReconcilableRegime[];
    /**
     * ⚠️ Au moins un compte écarté SANS régime exploitable — on ne peut donc pas savoir quel panier
     * il ampute. Tout le patrimoine de ce compte vit quelque part dans la reconstruction, et
     * n'importe quel panier peut être celui-là : aucune autorité n'est applicable.
     */
    hasUnplaceableAccount: boolean;
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
 * Taux courants dérivés de l'état, en UN seul endroit.
 *
 * ⚠️ La question n'est pas « `fxRatesEstimated` est-il vrai ? » mais « ce taux a-t-il le droit
 * d'écrire un total de compte ? » — et la réponse canonique du dépôt est `fxFaitAutorite`, qui
 * accepte aussi les taux SAISIS À LA MAIN par Marc. Lire le booléen directement aurait refusé sa
 * saisie, c'est-à-dire précisément le recours prévu quand la Banque du Canada ne répond pas.
 * ⚠️ Un helper plutôt que trois copies : les trois appelants auraient divergé
 * (`UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-UNIQUE-MANQUANTE`).
 */
export function tauxCourantsDepuisEtat(
    etat: (EtatFxMinimal & { fxRates?: Record<string, number> }) | undefined,
): TauxCourants {
    return {
        rates: etat?.fxRates,
        estimated: !fxFaitAutorite(fxSourceEffective(etat)),
    };
}

/** Taux COURANTS remis au lecteur — jamais ceux du moment de la synchro. */
export interface TauxCourants {
    rates: Record<string, number> | undefined;
    /**
     * `true` = les taux viennent de `DEFAULT_FX_RATES`, un repli EN DUR. Un taux estimé est traité
     * comme ABSENT : le compte est NOMMÉ mais jamais converti (`UN-REPLI-PLUS-CREDIBLE-EST-MOINS-REFUTABLE`
     * — 1,40 est plus crédible que 1:1, donc plus dangereux pour une autorité).
     */
    estimated: boolean;
    /** Devise de référence. `'CAD'` par défaut ; jamais devinée ailleurs. */
    baseCurrency?: string;
}

/** Ce que vaut une entrée courtier À LA LECTURE. */
export type SoldeCourtierRelu =
    | { statut: 'ok'; montantCad: number; reconverti: boolean }
    | { statut: 'taux-manquant'; devise: string }
    | { statut: 'illisible' };

/**
 * [FINTABLE-AUTORITE-PARTOUT étape 0] Relit une entrée courtier AU TAUX DU JOUR.
 *
 * ⚠️ LE DÉFAUT QUE ÇA CORRIGE. La conversion était faite à l'ÉCRITURE et persistée : un compte en
 * devise étrangère synchronisé pendant que les taux étaient au repli restait écarté
 * (`missingRate`) jusqu'à la synchro SUIVANTE, même une fois les vrais taux obtenus — et son
 * panier fiscal restait amputé, donc l'autorité courtier refusée en entier. Mesuré le 2026-09-17 :
 * ≈ 100 872 $ hors du panier NON-ENREG pour cette seule raison.
 *
 * ⚠️ L'ORDRE DES BRANCHES EST LE CORRECTIF. Le montant NATIF gagne sur tout le reste, y compris sur
 * un `missingRate` persisté : ce drapeau décrit ce qu'on savait AU MOMENT DE LA SYNCHRO, pas ce
 * qu'on sait maintenant. Le tester d'abord (comportement d'avant) rendrait la reconversion
 * inatteignable exactement dans le cas qui l'a motivée.
 *
 * ⚠️ Rétrocompatible par construction : une entrée écrite avant ce lot ne porte pas `amountNative`,
 * on retombe alors sur `balanceCad` et son `missingRate` — la valeur convertie à SA date. Ce n'est
 * pas idéal, c'est honnête : on n'a pas le montant natif, donc on ne peut rien reconvertir.
 */
export function relireSoldeCourtier(
    b: Partial<FintableBrokerBalance> | undefined,
    fx: TauxCourants,
): SoldeCourtierRelu {
    const base = String(fx?.baseCurrency ?? 'CAD').toUpperCase();
    const devise = String(b?.currency ?? '').trim().toUpperCase();
    const natif = Number(b?.amountNative);

    if (devise && Number.isFinite(natif)) {
        if (devise === base) return { statut: 'ok', montantCad: natif, reconverti: false };
        const taux = fx?.rates?.[devise];
        const utilisable = !fx?.estimated && typeof taux === 'number' && Number.isFinite(taux) && taux > 0;
        if (!utilisable) return { statut: 'taux-manquant', devise };
        const montantCad = natif * (taux as number);
        // Un produit fini d'entrées finies peut déborder : on ne publie pas un Infinity en autorité.
        if (!Number.isFinite(montantCad)) return { statut: 'taux-manquant', devise };
        return { statut: 'ok', montantCad, reconverti: true };
    }

    // ── Entrée ANCIENNE (pas de montant natif) : comportement d'avant, à l'identique.
    const missingRate = typeof b?.missingRate === 'string' ? b.missingRate.trim() : '';
    if (missingRate) return { statut: 'taux-manquant', devise: missingRate };
    const rawBalance = b?.balanceCad as number | null | undefined;
    if (rawBalance === null || rawBalance === undefined || !Number.isFinite(Number(rawBalance))) {
        return { statut: 'illisible' };
    }
    return { statut: 'ok', montantCad: Number(rawBalance), reconverti: false };
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
    /**
     * [FINTABLE-AUTORITE-PARTOUT étape 0] Taux COURANTS, pour reconvertir les montants natifs.
     * ⚠️ REQUIS : optionnel, un appelant l'aurait oublié et serait retombé sans bruit sur les
     * valeurs figées à la synchro — le défaut même que ce lot ferme. Le compilateur énumère.
     */
    fx: TauxCourants,
): BrokerReconciliation {
    const empty: BrokerReconciliation = {
        regimes: [], unassignedAccountLabels: [], unreadableAccountLabels: [],
        missingRateAccountLabels: [], incompleteRegimes: [], hasUnplaceableAccount: false,
        brokerTotalCad: 0, totalGapCad: 0,
    };
    if (!Array.isArray(balances) || balances.length === 0) return empty;

    // `observedAt: number | null` — `null` = au moins un compte du panier sans horodatage lisible.
    const byRegime = new Map<ReconcilableRegime, { total: number; labels: string[]; observedAt: number | null }>();
    const unassignedAccountLabels: string[] = [];
    const unreadableAccountLabels: string[] = [];
    const missingRateAccountLabels: string[] = [];
    // [FINTABLE-AUTORITE-PARTIELLE] On NOTE le régime de chaque compte écarté : c'est la seule
    // façon de savoir quel panier se retrouve amputé. Un écarté sans régime exploitable les
    // ampute tous potentiellement, d'où le drapeau séparé.
    const regimesAmputes = new Set<ReconcilableRegime>();
    let hasUnplaceableAccount = false;
    const noterEcarte = (b: { taxRegime?: unknown }) => {
        if (isReconcilable(b?.taxRegime)) regimesAmputes.add(b.taxRegime);
        else hasUnplaceableAccount = true;
    };

    for (const b of balances) {
        // [FINTABLE-DISNAT-USD-SOLDE-IGNORE] EN PREMIER, avant toute autre garde. Une entrée
        // `missingRate` porte `balanceCad: 0` qui ne signifie RIEN : la laisser descendre la
        // classerait « solde lisible » et l'additionnerait à zéro dans son panier — un compte
        // effacé du total sans trace, exactement le défaut que la liste des écartés existe pour
        // empêcher. L'ordre des gardes EST le correctif.
        // [FINTABLE-AUTORITE-PARTOUT étape 0] La lecture se fait AU TAUX DU JOUR (cf.
        // `relireSoldeCourtier`) : un compte écarté faute de taux à la synchro redevient
        // convertible dès que le vrai taux est connu, sans attendre la synchro suivante.
        const relu = relireSoldeCourtier(b, fx);
        if (relu.statut === 'taux-manquant') {
            missingRateAccountLabels.push(`${String(b?.label ?? '(compte sans nom)')} (${relu.devise})`);
            noterEcarte(b);
            continue;
        }
        if (relu.statut === 'illisible') {
            unreadableAccountLabels.push(String(b?.label ?? '(compte sans nom)'));
            noterEcarte(b);
            continue;
        }
        const amount = relu.montantCad;
        if (!isReconcilable(b?.taxRegime)) {
            unassignedAccountLabels.push(String(b?.label ?? '(compte sans nom)'));
            hasUnplaceableAccount = true;
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
        // Un régime n'est « incomplet » que s'il a AUSSI un compte retenu : quand tous ses comptes
        // sont écartés il n'apparaît pas dans `regimes`, donc il n'y a rien à refuser.
        incompleteRegimes: RECONCILABLE.filter((r) => regimesAmputes.has(r) && byRegime.has(r)),
        hasUnplaceableAccount,
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
    /**
     * ⚠️⚠️ [revue panel] `true` = les taux viennent de `DEFAULT_FX_RATES`, un REPLI EN DUR
     * (`USD: 1.40`, commenté « approximation Q1 2026 »), pas d'une lecture de marché.
     *
     * Sans ce paramètre, ce module traitait 1,40 comme un « taux connu » et publiait la conversion
     * comme AUTORITÉ sur le total du compte. C'est exactement le piège que l'en-tête de ce lot
     * prétend éviter (`UN-REPLI-BON-POUR-UN-AFFICHAGE-EST-LE-PIRE-POUR-UNE-AUTORITE`), repayé un
     * cran plus bas : ce n'est plus 1:1, c'est 1,40 — **plus crédible, donc moins réfutable**.
     * Et `fxRatesEstimated` existe précisément pour ça (`[FX-FALLBACK-SILENCIEUX]`), disponible aux
     * deux sites d'appel ; ne pas le consulter était le défaut, pas l'absence d'information.
     *
     * Un taux estimé est donc traité comme ABSENT : le compte est NOMMÉ (ce qui répond au besoin —
     * il n'est plus invisible) mais jamais converti. Un montant faux et crédible serait pire que
     * l'omission qu'on corrige.
     */
    fxRatesEstimated = false,
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
        // recense les écartés : « Disnat (0001) » n'apparaissait ni réconcilié, ni signalé, il était
        // simplement ABSENT de l'écran Investissements et de l'Accueil.
        //
        // ⚠️ La conversion N'EST PAS faite par `toCurrencyFactor` : ce helper replie sur 1:1 quand
        // le taux manque, ce qui est le bon comportement pour un AFFICHAGE d'actif (montrer quelque
        // chose + journaliser) et le pire pour une AUTORITÉ — N USD deviendraient N « CAD »,
        // faux d'environ 30 %, présentés comme le total du compte
        // (`UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`). On interroge donc le taux
        // EXPLICITEMENT, et son absence produit un signal, jamais un nombre.
        const devise = String(b?.currency ?? '').toUpperCase();
        let balanceCad = amount;
        let missingRate = '';
        if (devise && devise !== base) {
            const taux = fxRates?.[devise];
            const tauxUtilisable = !fxRatesEstimated
                && typeof taux === 'number' && Number.isFinite(taux) && taux > 0;
            if (tauxUtilisable) {
                balanceCad = amount * (taux as number);
                // Un produit fini d'entrées finies peut déborder (`1e308 * 2`).
                // ⚠️ [revue panel] Un `continue` ici ferait retomber le compte dans le trou que ce
                // lot vient de boucher : absent des TROIS listes, donc invisible sans trace. On le
                // route vers `missingRate` — on ne sait pas le convertir, c'est exactement ce que
                // cette liste veut dire.
                if (!Number.isFinite(balanceCad)) {
                    balanceCad = 0;
                    missingRate = devise;
                }
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
            // [FINTABLE-AUTORITE-PARTOUT étape 0] On persiste le FAIT (montant natif + devise) en
            // plus de son reflet daté. `balanceCad` reste écrit tel quel — il sert aux entrées
            // d'historique déjà en place et aux lecteurs qui ne savent pas reconvertir.
            // ⚠️ Écrit MÊME quand la conversion a réussi : sinon la reconversion ne serait possible
            // que pour les comptes qui ont échoué, et un taux corrigé après coup ne rattraperait
            // jamais un compte converti au mauvais taux.
            ...(Number.isFinite(amount) ? { amountNative: amount } : {}),
            ...(devise ? { currency: devise } : {}),
            ...(missingRate ? { missingRate } : {}),
            ...(isReconcilable(b.taxRegime) ? { taxRegime: b.taxRegime } : {}),
            at: stamp,
        });
    }
    return out;
}
