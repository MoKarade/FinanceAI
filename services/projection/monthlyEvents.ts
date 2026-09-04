// services/projection/monthlyEvents.ts
// Cycle 16: applyTravelExpenses + applyLifeEvents + computeStressTest.
// Trois helpers indépendants groupés car ils tournent tous au même moment
// du loop mensuel (après les dépenses enfants, avant shortfall).

import { formatCAD } from '../../utils/format';
import type { TravelGoal, LifeEvent, ProjectionConfig, FinancialGoal } from '../../types';
import { logErrorThrottled } from '../errorLogger';

// ── Voyages ──────────────────────────────────────────────────────────────────

export function applyTravelExpenses(
    travelGoals: TravelGoal[],
    currentIsoMonth: string,
    expenseMultiplier: number,
    state: { addExpense: (n: number) => void; logFlow: (s: string, day?: number) => void },
): void {
    for (const t of travelGoals) {
        // Defensive 2026-05-21 : skip si date manquante/invalide (crash Worker observé)
        if (!t.date || typeof t.date !== 'string') continue;
        if (t.date.startsWith(currentIsoMonth)) {
            const effectiveCost = (t.totalCost ?? 0) * expenseMultiplier;
            state.addExpense(effectiveCost);
            state.logFlow(`✈️ Voyage (${t.destination}): -${formatCAD(Math.round(effectiveCost))}`, dayOfIsoDate(t.date));
        }
    }
}

// ── Événements de vie ─────────────────────────────────────────────────────────

export interface PropertyStateMutable {
    isBought: boolean;
    mortgage: number;
    currentValue: number;
    isSold?: boolean;
    /** RE-GAIN — coût d'achat (ACB approximé = prix payé), pour le gain en capital à la disposition. */
    cost?: number;
    /** RE-GAIN — résidence principale (gain EXEMPT, LIR 40(2)b) vs locatif (gain imposable). */
    isPrimaryResidence?: boolean;
    /** DETTE-RE-SALE — id stable du RealEstateGoal (aligné `projection.ts` propertiesState) pour cibler
     *  la vente par `LifeEvent.propertyId`. Optionnel + explicitement typé (vs l'index catch-all `unknown`) :
     *  le moteur le fournit toujours (`projection.ts` propertiesState), absent ⇒ jamais ciblé (fallback). */
    id?: string;
    [key: string]: unknown;
}

export interface LifeEventMutator {
    shockPortfolio: (factor: number) => void;
    addLiquid: (amt: number) => void;
    addExpense: (amt: number) => void;
    adjustRealEstate: (equityDelta: number, mortgageDelta: number) => void;
    /** RE-GAIN / FISC-RE-CAPITAL-LOSS — comptabilise la disposition d'un IMMEUBLE LOCATIF avec le gain
     *  BRUT SIGNÉ (produit net 95 % − coût) : un GAIN (≥ 0) nette la banque de pertes puis alimente
     *  `accCapitalGainsYear` (50 % inclus en aval) ; une PERTE (< 0) est portée en banque de pertes
     *  (déductible des gains futurs, LIR 111(1)b) au lieu d'être silencieusement ignorée. Retourne le
     *  détail pour le logging. */
    realizeCapitalDisposition: (rawGain: number) => { bankedLoss: number; taxableGain: number };
    logLife: (msg: string, day?: number) => void;
    logFlow: (msg: string, day?: number) => void;
}

/**
 * [CHOMAGE-DEUX-MODELES] Part de la perte de revenu du mois attribuable aux SEULS événements
 * PERTE_EMPLOI (0 = aucune, 0,5 = la moitié du revenu perdue pour cause de perte d'emploi…).
 * Sert à verser la prestation d'assurance-emploi sur l'événement daté — l'AE ne couvre NI une
 * sabbatique (départ volontaire, inadmissible) NI un accident (régime maladie/LTD distinct,
 * hors de ce lot). Même base de date et mêmes gardes que `computeIncomeLossFactor` ci-dessous ;
 * composition multiplicative identique quand plusieurs événements se chevauchent.
 */
export function computePerteEmploiLossPct(lifeEvents: LifeEvent[], currentLoopDate: Date): number {
    const curIdx = currentLoopDate.getUTCFullYear() * 12 + currentLoopDate.getUTCMonth();
    if (!Number.isFinite(curIdx)) return 0;
    let factor = 1;
    for (const e of lifeEvents) {
        if (e.type !== 'PERTE_EMPLOI') continue;
        if (!e.date || typeof e.date !== 'string') continue;
        const [eyStr, emStr] = e.date.split('-');
        const startIdx = Number(eyStr) * 12 + (Number(emStr) - 1);
        if (!Number.isFinite(startIdx)) continue;
        const dur = Math.floor(e.durationMonths ?? 0);
        if (!(dur > 0)) continue;
        const offset = curIdx - startIdx;
        if (offset < 0 || offset >= dur) continue;
        const rawPct = e.incomeLossPercent;
        const lossPct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct as number)) : 0;
        factor *= (1 - lossPct / 100);
    }
    return 1 - Math.max(0, Math.min(1, factor));
}

/** [FISC-EVENT-INCOMELOSS] Types d'événements de vie qui réduisent le REVENU (pas une dépense) :
 *  perte d'emploi, année sabbatique, accident/maladie. Traités par `computeIncomeLossFactor` en
 *  phase active — exclus du chemin « dépense one-shot » d'`applyLifeEvents`. */
export const INCOME_LOSS_EVENT_TYPES: ReadonlySet<string> = new Set(['PERTE_EMPLOI', 'SABBATIQUE', 'ACCIDENT']);

/**
 * [FISC-EVENT-INCOMELOSS] Facteur multiplicatif (∈ [0, 1]) à appliquer au revenu MÉNAGE du mois
 * courant pour refléter les événements de perte de revenu datés saisis par l'utilisateur
 * (PERTE_EMPLOI / SABBATIQUE / ACCIDENT). Un événement est ACTIF si le mois courant tombe dans
 * `[date, date + durationMonths)`. Plusieurs événements actifs se composent multiplicativement.
 *
 * Base de date IDENTIQUE à `applyLifeEvents` (année-mois UTC via `toISOString`) → cohérence avec le
 * matching one-shot. Gardes « never trust » : `incomeLossPercent` non-fini (NaN d'un champ UI vidé,
 * absent) → 0 % (aucune réduction, jamais de NaN propagé) puis clamp [0, 100] ; `durationMonths` non-fini
 * ou ≤ 0 → événement ignoré.
 */
export function computeIncomeLossFactor(lifeEvents: LifeEvent[], currentLoopDate: Date): number {
    // [PERF-ENGINE-ISOSTRING-HOTLOOP] `toISOString().substring(0,7).split('-')` était exécuté à
    // CHAQUE mois, même sans aucun événement de perte de revenu — mesuré 1,096 µs/appel contre
    // 0,046 µs ici (~24×), soit ~500 ms sur une recherche de stratégie à 1 000 itérations.
    // ⚠️ Valeur STRICTEMENT identique : `toISOString()` rend l'année et le mois UTC, donc
    // `getUTCFullYear()`/`getUTCMonth()` lisent exactement les mêmes composants — la base UTC est
    // conservée (elle doit rester alignée sur `applyLifeEvents`, cf. en-tête ci-dessus). Ce qui
    // disparaît, c'est la construction de la chaîne et son reparsing, pas le fuseau.
    const curIdx = currentLoopDate.getUTCFullYear() * 12 + currentLoopDate.getUTCMonth();
    if (!Number.isFinite(curIdx)) return 1;

    let factor = 1;
    for (const e of lifeEvents) {
        if (!INCOME_LOSS_EVENT_TYPES.has(e.type)) continue;
        if (!e.date || typeof e.date !== 'string') continue;
        const [eyStr, emStr] = e.date.split('-');
        const startIdx = Number(eyStr) * 12 + (Number(emStr) - 1);
        if (!Number.isFinite(startIdx)) continue;
        const dur = Math.floor(e.durationMonths ?? 0);
        if (!(dur > 0)) continue; // NaN/0/négatif → !(… > 0) === true → ignoré
        const offset = curIdx - startIdx;
        if (offset < 0 || offset >= dur) continue;
        // `?? 0` ne couvre PAS NaN (un champ UI vidé → parseFloat('') === NaN) → garde Number.isFinite explicite.
        const rawPct = e.incomeLossPercent;
        const lossPct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct as number)) : 0;
        factor *= (1 - lossPct / 100);
    }
    return Math.max(0, Math.min(1, factor));
}


/** [FUTUR-DAILY-EVENTS] Jour du mois (1-31) d'une date saisie `YYYY-MM-DD` — `undefined` si la
 *  date n'a pas de composante jour valide (saisie `YYYY-MM`, corruption) : l'affichage posera
 *  alors l'événement au mois, jamais sur un jour inventé. */
function dayOfIsoDate(date: string): number | undefined {
    const m = /^\d{4}-\d{2}-(\d{2})/.exec(date);
    if (!m) return undefined;
    const day = Number(m[1]);
    return day >= 1 && day <= 31 ? day : undefined;
}

export function applyLifeEvents(
    lifeEvents: LifeEvent[],
    currentIsoMonth: string,
    expenseMultiplier: number,
    propertiesState: PropertyStateMutable[],
    state: LifeEventMutator,
): void {
    for (const e of lifeEvents) {
        // Defensive 2026-05-21 : skip si date manquante/invalide
        if (!e.date || typeof e.date !== 'string') continue;
        if (!e.date.startsWith(currentIsoMonth)) continue;
        // [FISC-EVENT-INCOMELOSS] perte de revenu = réduction du revenu en phase active
        // (computeIncomeLossFactor), PAS une dépense one-shot ici (impactAmount non collecté
        // pour ces types → addExpense(0) serait un faux flux de -0 $).
        if (INCOME_LOSS_EVENT_TYPES.has(e.type)) continue;

        if (e.type === 'KRACH') {
            const drop = 1 - ((e.impactPercent || 30) / 100);
            state.shockPortfolio(drop);
            state.logLife(`Krach (-${e.impactPercent}%) 📉`, dayOfIsoDate(e.date));
        } else if (e.type === 'HERITAGE') {
            // [ENG-HERITAGE-INFLOW] Un héritage/gain est une RENTRÉE d'argent, pas une dépense
            // (bug rapporté par Marc 2026-07-31 : le montant était débité par le chemin one-shot
            // ci-dessous, sans aucun moyen UI de l'inverser). Non imposable pour le bénéficiaire
            // au Canada (pas d'impôt successoral — le tip de l'UI l'affirme déjà) → +liquide,
            // investi ensuite par la cascade mensuelle. Indexé par `expenseMultiplier` (inflation
            // composée) comme tout montant saisi en dollars d'aujourd'hui (convention voyages/goals).
            // Testé AVANT vente : un héritage nommé « après vente de la maison » ne doit jamais
            // déclencher la vente d'un bien (même classe qu'ENG-LIFEEVENT-VENTE-SUBSTRING).
            const rawGain = (e.impactAmount ?? 0) * expenseMultiplier;
            if (!Number.isFinite(rawGain)) {
                logErrorThrottled(`lifeEvent-nan:${e.id}`, {
                    source: 'projection', severity: 'warning',
                    message: `Événement "${e.name}" : montant non fini → gain ignoré`,
                    context: { id: e.id, droppedValue: Number.isNaN(rawGain) ? 'NaN' : 'Infinity' },
                });
            }
            // Clamp ≥ 0 : un « héritage négatif » n'a pas de sens — la saisie d'une dépense passe
            // par les types de dépense, pas par un signe caché.
            const gain = Number.isFinite(rawGain) ? Math.max(0, rawGain) : 0;
            state.addLiquid(gain);
            state.logLife(`${e.name} 💰`, dayOfIsoDate(e.date));
            state.logFlow(`💰 Héritage/Gain (${e.name}): +${formatCAD(Math.round(gain))}`, dayOfIsoDate(e.date));
        } else {
            // [ENG-LIFEEVENT-VENTE-SUBSTRING] Sémantique explicite d'abord (`eventKind`) : 'VENTE_IMMO'
            // force la vente, 'NONE' la désarme ; absent → détection historique par sous-chaîne (« vente »
            // = mot réservé, rétrocompat exacte des événements UI existants).
            const isVente = e.eventKind === 'VENTE_IMMO'
                // `== null` (pas `=== undefined`) : un `null` issu d'un JSON tiers doit suivre le
                // chemin historique, pas désarmer la vente (F6 projection-validator).
                || (e.eventKind == null && !!e.name && e.name.toLowerCase().includes('vente'));
            if (isVente) {
                // `mortgage < currentValue` : équité positive requise. Cas-limite intentionnel : un bien TRULY
                // underwater (`mortgage >= currentValue`) n'est PAS vendu (on ne modélise pas la vente à perte
                // forcée). Une vente quasi-underwater (mortgage entre 95 % et 100 % de la valeur) PASSE ce filtre
                // mais a un `saleNet` négatif — d'où le fix FISC-RE-SALE-RESIDUAL ci-dessous.
                // DETTE-RE-SALE : cible le bien par `propertyId` si l'événement le fournit (l'UI le
                // renseigne via un sélecteur) — sinon fallback historique (PREMIER bien à équité positive,
                // rétrocompat exacte pour les événements sans propertyId). ⚠️ Un `propertyId` fourni SANS
                // match (bien inconnu/underwater/déjà vendu) ne vend RIEN : ne JAMAIS vendre silencieusement
                // un AUTRE bien que celui visé — c'est précisément la classe de bug corrigée ici (dans un
                // scénario à 2 biens, le `find` premier-bien vendait la résidence principale exemptée au lieu
                // du locatif imposable, faussant le gain en capital).
                const isSellable = (p: typeof propertiesState[number]) => p.isBought && p.mortgage < p.currentValue;
                const soldProp = e.propertyId
                    ? propertiesState.find(p => p.id === e.propertyId && isSellable(p))
                    : propertiesState.find(isSellable);
                if (soldProp) {
                    const saleNet = soldProp.currentValue * 0.95 - soldProp.mortgage;
                    // FISC-RE-SALE-RESIDUAL : PAS de `Math.max(0, …)`. Une vente quasi-underwater (hypothèque
                    // entre 95 % et 100 % de la valeur → les 5 % de frais poussent sous l'eau) produit un
                    // `saleNet` NÉGATIF : le déficit (frais > équité) doit être PORTÉ (il tombe dans le
                    // sauvetage PV-6 plus bas → couvert par actifs ou `liquidDebt` VISIBLE), pas EFFACÉ — sinon
                    // le patrimoine est surévalué de `|saleNet|` (l'argent du déficit s'évapore).
                    state.addLiquid(saleNet);
                    state.adjustRealEstate(
                        -(soldProp.currentValue - soldProp.mortgage),
                        -soldProp.mortgage,
                    );
                    // RE-GAIN / FISC-RE-CAPITAL-LOSS — disposition en capital : EXEMPTE pour la résidence
                    // principale (LIR 40(2)b) ; pour un LOCATIF, gain BRUT SIGNÉ = produit net (95 %) − coût.
                    // Coût absent → 0 (conservateur : tout le produit devient gain). Un produit SOUS le coût
                    // (vente à perte) donne un `rawGain` NÉGATIF : il doit être PORTÉ en banque de pertes
                    // (déductible des gains futurs), pas ignoré — d'où la suppression du `Math.max(0, …)`.
                    if (!soldProp.isPrimaryResidence) {
                        const rawGain = soldProp.currentValue * 0.95 - (soldProp.cost ?? 0);
                        const { bankedLoss, taxableGain } = state.realizeCapitalDisposition(rawGain);
                        if (taxableGain > 0) {
                            state.logFlow(`🏠 Gain en capital (locatif) réalisé : ${formatCAD(Math.round(taxableGain))} — 50 % imposable`, dayOfIsoDate(e.date));
                        } else if (bankedLoss > 0) {
                            state.logFlow(`🏠 Perte en capital (locatif) : ${formatCAD(Math.round(bankedLoss))} portée en banque de pertes (déductible des gains futurs)`, dayOfIsoDate(e.date));
                        }
                    }
                    soldProp.isBought = false;
                    soldProp.mortgage = 0;
                    soldProp.isSold = true;
                    state.logLife(saleNet >= 0
                        ? `🏠 Vente (net 95%): +${formatCAD(Math.round(saleNet))}`
                        // saleNet < 0 : les frais de 5 % dépassent l'équité → net négatif DÉDUIT du patrimoine
                        // (ponctionné du liquide, ou porté en dette si le liquide est épuisé — PV-6).
                        : `🏠 Vente (net 95%): −${formatCAD(Math.round(-saleNet))} (frais > équité)`, dayOfIsoDate(e.date));
                } else if (e.propertyId) {
                    // DETTE-RE-SALE / observabilité (panel silent-failure) : `propertyId` visait un bien
                    // introuvable / non vendable (supprimé du store, underwater, déjà vendu) → la vente
                    // planifiée ne se produit PAS. La rendre VISIBLE plutôt que l'avaler (même patron que
                    // NAN-OBSERVABILITY) : un no-op silencieux ressemblerait à « aucun événement ce mois ».
                    logErrorThrottled(`lifeEvent-nosell:${e.id}`, {
                        source: 'projection', severity: 'warning',
                        message: `Vente "${e.name}" ignorée : bien ciblé introuvable ou non vendable`,
                        context: { id: e.id, propertyId: e.propertyId },
                    });
                    state.logFlow(`🏠 Vente "${e.name}" ignorée : bien ciblé introuvable ou déjà vendu`, dayOfIsoDate(e.date));
                }
            } else {
                // [NAN-INPUT-HARDENING] `?? 0` ne rattrape pas NaN → garde l'agrégat (impactAmount d'un
                // lifeEvent saisi peut être NaN → addExpense(NaN) corromprait le flux en silence).
                const rawImpact = (e.impactAmount ?? 0) * expenseMultiplier;
                // [NAN-OBSERVABILITY] surface une dépense planifiée SILENCIEUSEMENT ignorée (throttlé par
                // événement : la boucle mensuelle × Monte-Carlo rejouerait le même log sinon).
                if (!Number.isFinite(rawImpact)) {
                    logErrorThrottled(`lifeEvent-nan:${e.id}`, {
                        source: 'projection', severity: 'warning',
                        message: `Événement "${e.name}" : montant non fini → dépense ignorée`,
                        // `droppedValue` = NATURE du non-fini (NaN/Infinity), pas le montant : un `impactAmount`
                        // brut serait redacté par `sanitizeContext` (match `amount`) → log inutile.
                        context: { id: e.id, droppedValue: Number.isNaN(rawImpact) ? 'NaN' : 'Infinity' },
                    });
                }
                const effectiveImpact = Number.isFinite(rawImpact) ? rawImpact : 0;
                state.addExpense(effectiveImpact);
                state.logLife(`${e.name} 💸`, dayOfIsoDate(e.date));
                state.logFlow(`🔔 Événement (${e.name}): -${formatCAD(Math.round(effectiveImpact))}`, dayOfIsoDate(e.date));
            }
        }
    }
}

// ── Objectifs (FinancialGoal) ─────────────────────────────────────────────────
// Wiring 2026-05: ce type de goal était déclaré en types mais jamais consommé
// par le moteur. Au mois du deadline, on retire le manque à combler
// (targetAmount − manualCurrentAmount) du compte ciblé.
// [NAV-REMOVE-OBJECTIFS-TAB] Le pendant `SavingsGoal` (cascade depuis liquide,
// sans compte cible) a été retiré du produit — UI ET moteur — décision Marc
// 2026-08-27. `GoalDeadlineMutator` reste partagé par `applyFinancialGoalDeadlines`.

export interface GoalDeadlineMutator {
    withdrawFromAccount: (account: 'CELI' | 'REER' | 'NON-ENREG' | 'CRYPTO' | 'LIQUID', amount: number) => number;
    addExpense: (amt: number) => void;
    logFlow: (msg: string) => void;
    /** [PV-11a] — remontée STRUCTURÉE d'un objectif partiellement financé (drawn < visé).
     *  Optionnel : les appelants hors-moteur (tests) peuvent l'omettre. */
    onGoalShortfall?: (goalName: string, asked: number, drawn: number) => void;
}

export function applyFinancialGoalDeadlines(
    financialGoals: FinancialGoal[],
    currentIsoMonth: string,
    expenseMultiplier: number,
    state: GoalDeadlineMutator,
): void {
    for (const g of financialGoals) {
        if (g.status === 'archived' || g.completed) continue;
        if (!g.deadline || !g.deadline.startsWith(currentIsoMonth)) continue;
        const need = Math.max(0, (g.targetAmount || 0) - (g.manualCurrentAmount || 0));
        if (need <= 0) continue;
        const effective = need * expenseMultiplier;
        const account = g.targetAccount || 'NON-ENREG';
        const drawn = state.withdrawFromAccount(account, effective);
        if (drawn > 0) state.addExpense(drawn);
        // [PV-10 suivi] log HONNÊTE : montant réellement tiré (pas la cible) + mention du manque.
        const isShort = effective - drawn > 0.5;
        if (isShort) state.onGoalShortfall?.(g.name || 'But financier', effective, drawn);
        const short = isShort ? ` (visé ${formatCAD(Math.round(effective))} — fonds insuffisants)` : '';
        state.logFlow(`🏆 But financier (${g.name}): -${formatCAD(Math.round(Math.max(0, drawn)))} depuis ${account}${short}`);
    }
}

// ── Stress test ───────────────────────────────────────────────────────────────

export interface StressTestResult {
    crashFactor: number;    // (1-drop) si mois du crash, sinon 1.0
    recoveryFactor: number; // (1+boost) si mois de reprise (sans crypto), sinon 1.0
    log: string | null;
}

/**
 * Calcule les facteurs de choc/reprise pour le mois courant.
 * Le caller applique crashFactor à CELI/REER/NonReg/Crypto,
 * et recoveryFactor à CELI/REER/NonReg uniquement.
 */
export function computeStressTest(
    proj: ProjectionConfig,
    m: number,
): StressTestResult {
    if (!proj.stressTestEnabled) return { crashFactor: 1, recoveryFactor: 1, log: null };

    const crashStartMonth = (proj.stressTestYear || 5) * 12;
    const recoveryMonths = proj.stressTestRecoveryMonths || 24;
    const drop = (proj.stressTestDrop || 30) / 100;

    if (m === crashStartMonth) {
        return {
            crashFactor: 1 - drop,
            recoveryFactor: 1,
            log: `📉 Choc Marché -${Math.round(drop * 100)}%`,
        };
    }
    if (m > crashStartMonth && m <= crashStartMonth + recoveryMonths) {
        return {
            crashFactor: 1,
            recoveryFactor: 1 + (drop / recoveryMonths) * 0.9,
            log: null,
        };
    }
    return { crashFactor: 1, recoveryFactor: 1, log: null };
}
