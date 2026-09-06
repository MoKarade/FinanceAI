// services/projection/w5Effects.ts
// Cycle 7 split: extraction des 6 conteneurs W5.x ajoutés au moteur en cycle 4.
// Chaque effet mute un état partagé via le mutateur W5Mutator (passé par réf).
//
// Pourquoi ce module : tous ces effets sont autonomes par rapport au reste du
// monolithe runScenario — ils lisent du contexte (mois, date, multiplicateur)
// et écrivent dans 4 cibles bien définies (monthlyIncome, monthlyExpenses,
// liquid, taxCurrentYear). Pas de dépendance sur growth/income/shortfall/etc.

import { rentalStateId } from './rentalMonth';
import type { InsurancePolicy, VehicleReplacement, MajorRenovation, CharitableGoal, RentalProperty, PrivateBusiness } from '../../types';
import { computeDonationCredit } from '../../utils/donationCredit';
import { formatCAD } from '../../utils/format';
import { montantsParProprietaireVides, ajouterParProprietaire, type MontantsParProprietaire } from './revenuGagnePartage';

export interface W5Context {
    m: number;
    currentMonthIndex: number;
    currentLoopDate: Date;
    startYear: number;
    startMonth: number;
    expenseMultiplier: number;
    /** [W5-RENTAL-INTERET-DPA] Intérêt hypothécaire du MOIS par immeuble locatif (clé `rentalStateId`,
     *  produit par `rentalInterestParImmeuble` sur l'état AVANT le mois locatif). Il est DÉDUIT de la
     *  base imposable du NOI (T4036, « intérêts et frais bancaires » — et T4040 : le revenu GAGNÉ
     *  est le revenu NET de location). Il ne touche PAS le flux de trésorerie : le service de dette
     *  sort déjà en dépense dans `processRentalMonth`. Absent → 0 (appelants historiques, tests
     *  unitaires) : NOI imposé brut, comme avant le lot 188. */
    rentalInterestMensuelParImmeuble?: Readonly<Record<string, number>>;
}

export interface W5Mutator {
    addExpense: (amount: number) => void;          // monthlyExpenses +=
    addIncome: (amount: number) => void;           // monthlyIncome +=
    subtractLiquid: (amount: number) => void;      // liquid -=
    addTaxRevenu: (amount: number) => void;        // taxCurrentYear.revenu +=
    addTaxGains: (amount: number) => void;         // taxCurrentYear.gains +=
    addTaxDivers: (amount: number) => void;        // taxCurrentYear.divers += (impôt « autres » : SURVIT à
                                                   // l'override 12-mois de `.revenu` en décembre, cf taxDecember)
    addDonationCredit: (amount: number) => void;   // taxCurrentYear.donCredit += (crédit-don POSITIF ; plafonné à
                                                   // l'impôt dû puis appliqué à `divers` en décembre — non remboursable)
    logFlow: (msg: string) => void;
    logLife: (msg: string) => void;
}

export interface W5Containers {
    insurancePolicies: InsurancePolicy[];
    vehicleReplacements: VehicleReplacement[];
    majorRenovations: MajorRenovation[];
    charitableGoals: CharitableGoal[];
    rentalProperties: RentalProperty[];
    privateBusinesses: PrivateBusiness[];
}

/** [FISC-RRSP-RENTAL-EARNED] Ce que l'appelant doit encore ROUTER après les effets : le NOI locatif
 *  MENSUEL par propriétaire, base du revenu gagné (droits REER). Rendu plutôt qu'écrit par le
 *  mutateur parce que sa destination dépend de la position dans la boucle (il est produit AVANT le
 *  bloc de janvier → tampon `grossIncomeEnAttenteByUser`, jamais l'accumulateur direct). Vaut zéro
 *  partout quand aucun revenu locatif n'a été publié ce mois-ci. */
interface W5Resultat {
    rentalNoiMensuelParProprietaire: MontantsParProprietaire;
}

/**
 * Applique les 6 effets W5.x sur l'état du mois courant.
 * Doit être appelé une fois par itération mensuelle.
 */
/**
 * [W5-PROXY-NON-SOURCE] Taux d'impôt FORFAITAIRES des flux W5 — **hypothèses de MODÈLE**, pas des
 * règles ARC/RQ. Ancrés et chiffrés dans `docs/FISCAL_REFERENCE.md` §6 « Proxys d'impôt W5 ».
 *
 * Le ticket demandait « nommer ou retirer » ; décision Marc `[W5-TAX-PROXY]` : GARDER le forfait et
 * le documenter. Ils sont donc NOMMÉS et EXPORTÉS — l'UI qui les annonce à l'utilisateur et la garde
 * qui vérifie la doc les IMPORTENT, au lieu de recopier deux chiffres qui dériveraient en silence.
 */
export const RENTAL_NOI_TAX_PROXY = 0.45;
export const CCPC_DIVIDEND_TAX_PROXY = 0.36;

export function applyW5Effects(
    ctx: W5Context,
    containers: W5Containers,
    state: W5Mutator,
): W5Resultat {
    const { m, currentMonthIndex, currentLoopDate, startYear, startMonth, expenseMultiplier } = ctx;

    // W5.4 — Primes d'assurance mensuelles (vie/invalidité/maladies graves/
    // soins LD/auto/habitation/responsabilité). Cesse à l'expiry pour les
    // polices temporaires.
    let insurancePremiumsMonthly = 0;
    for (const policy of containers.insurancePolicies) {
        if (policy.expiryDate) {
            const expiry = new Date(policy.expiryDate);
            if (currentLoopDate >= expiry) continue;
        }
        insurancePremiumsMonthly += (policy.monthlyPremium || 0);
    }
    if (insurancePremiumsMonthly > 0) {
        state.addExpense(insurancePremiumsMonthly * expenseMultiplier);
    }

    // W5.x — Véhicules cycliques.
    for (const v of containers.vehicleReplacements) {
        const cyclMonths = (v.cyclYears || 8) * 12;
        if (cyclMonths > 0 && m > 0 && m % cyclMonths === 0) {
            const cost = (v.costEstimate || 0) * expenseMultiplier;
            state.subtractLiquid(cost);
            state.logFlow(`🚗 Remplacement véhicule: -${formatCAD(Math.round(cost))}`);
        }
    }

    // W5.x — Rénovations majeures planifiées (date unique).
    for (const reno of containers.majorRenovations) {
        if (!reno.date) continue;
        const renoDate = new Date(reno.date);
        const renoMonthIdx = (renoDate.getFullYear() - startYear) * 12 + (renoDate.getMonth() - startMonth);
        if (renoMonthIdx === m) {
            const cost = (reno.cost || 0) * expenseMultiplier;
            state.subtractLiquid(cost);
            state.logLife(`🔨 Rénovation majeure: -${formatCAD(Math.round(cost))} (${reno.description || 'maison'})`);
        }
    }

    // W5.x — Dons charitables annuels.
    for (const charity of containers.charitableGoals) {
        const yearNow = startYear + Math.floor(m / 12);
        if (charity.startYear && yearNow < charity.startYear) continue;
        if (charity.endYear && yearNow > charity.endYear) continue;
        const annual = charity.annualAmount || 0;
        if (annual <= 0) continue;
        state.addExpense((annual / 12) * expenseMultiplier);
        // Crédit fiscal en janvier (annualisé). [FA-6] Crédit NON REMBOURSABLE par paliers (féd+QC,
        // FISCAL_REFERENCE §10) accumulé dans `donCredit` → décembre le PLAFONNE à l'impôt dû puis
        // l'applique à `divers` (qui SURVIT à l'override 12-mois de `.revenu`). Avant FA-6, le crédit
        // allait dans `.revenu`, jeté pour un salarié actif (le don n'avait alors AUCUN bénéfice fiscal).
        // Don de titres en nature : inclusion gain 0 % NON modélisée (pas de base de coût sur
        // CharitableGoal) → l'ancien `addTaxGains(-0,15·don)` (non sourcé) est retiré.
        if (currentMonthIndex === 0) {
            state.addDonationCredit(computeDonationCredit(annual));
        }
    }

    // W5.6 — Immeubles locatifs: NOI lissé.
    let rentalPropertyNoiMonthly = 0;
    // [W5-RENTAL-INTERET-DPA] Base IMPOSABLE du mois = NOI − intérêt hypothécaire du mois (T4036 :
    // les intérêts sur l'argent emprunté pour acheter l'immeuble se déduisent du revenu de location).
    // Deux grandeurs, deux registres : le NOI (trésorerie encaissée → `addIncome`) reste BRUT, la
    // base nette (→ `addTaxDivers` et revenu GAGNÉ par propriétaire) porte la déduction. Avant le
    // lot 188, le NOI était imposé brut au proxy alors que le service de dette sortait en dépense —
    // un bailleur levieré payait 45 % sur des intérêts qu'il ne gardait pas.
    let rentalNoiImposableMonthly = 0;
    // [FISC-RRSP-RENTAL-EARNED] La base IMPOSABLE, ventilée par PROPRIÉTAIRE : c'est la base du revenu
    // gagné (droits REER) de chaque conjoint. Base = ce que le moteur IMPOSE (le NOI net de vacance,
    // de charges ET d'intérêts — T4040 : « revenu NET de location »), donc une perte locative réduit le
    // revenu gagné — T4040, pertes en déduction.
    const noiParProprietaire = montantsParProprietaireVides();
    for (const rp of containers.rentalProperties) {
        const annualRent = (rp.monthlyRent || 0) * 12 * (1 - (rp.vacancyPct || 0) / 100);
        const annualExpenses = (rp.monthlyExpenses || 0) * 12;
        const noi = annualRent - annualExpenses;
        const interetBrut = ctx.rentalInterestMensuelParImmeuble?.[rentalStateId(rp)];
        const interetMensuel = Number.isFinite(interetBrut) ? Math.max(0, interetBrut as number) : 0;
        const noiImposableMensuel = noi / 12 - interetMensuel;
        rentalPropertyNoiMonthly += noi / 12;
        rentalNoiImposableMonthly += noiImposableMensuel;
        ajouterParProprietaire(noiParProprietaire, rp.owner, noiImposableMensuel);
    }
    let revenuGagneLocatif = montantsParProprietaireVides();
    // [NAN-INPUT-HARDENING] `!== 0` laisse passer NaN (`NaN !== 0` = true) → garde l'agrégat (un `noi` NaN
    // corromprait revenu + impôt locatif). (La branche business ci-dessous est déjà sûre : `NaN > 0` = false.)
    // [W5-RENTAL-INTERET-DPA] La porte s'ouvre aussi quand seule la base imposable est non nulle (NOI de
    // trésorerie exactement nul mais intérêts déductibles) : le registre fiscal ne dépend pas d'une
    // coïncidence du flux de trésorerie.
    if (Number.isFinite(rentalPropertyNoiMonthly) && Number.isFinite(rentalNoiImposableMonthly)
        && (rentalPropertyNoiMonthly !== 0 || rentalNoiImposableMonthly !== 0)) {
        state.addIncome(rentalPropertyNoiMonthly);
        // [FA-6] via `addTaxDivers` → l'impôt locatif SURVIT à l'écrasement de `.revenu` en décembre :
        // avant, le revenu locatif d'un bailleur ACTIF n'était PAS imposé (clobberé).
        // ⚠️ Le 0,45 est un PROXY de taux marginal, pas une règle fiscale — hypothèse de MODÈLE
        // désormais ANCRÉE : `docs/FISCAL_REFERENCE.md` §6 « Proxys d'impôt W5 » (décision Marc
        // `[W5-TAX-PROXY]` : garder le forfait, le documenter). Son sens d'erreur est MESURÉ et il
        // CHANGE DE SIGNE selon le revenu (~125-140 k$ selon le NOI — le seuil, le tableau et les
        // bandes du barème vivent dans la doc : ne RIEN recopier ici, un chiffre en commentaire
        // dérive comme un autre. Preuve : le « 145 k$ » qui vivait sur cette ligne, réfuté en revue,
        // a SURVÉCU à sa première correction parce qu'un `git checkout` de mesure l'a restauré).
        // ⚠️ PAS de `/ 12` ici — `rentalPropertyNoiMonthly` est DÉJÀ mensuel (construit `noi / 12`
        // quatre lignes plus haut), et `addTaxDivers` alimente un accumulateur ANNUEL à raison d'un
        // versement par mois. L'ancien `(mensuel × taux) / 12` cumulait donc sur l'année à
        // `mensuel × taux` = 1/12 de l'impôt : MESURÉ bout en bout, 1 125 $/an collectés sur
        // 30 000 $ de NOI au lieu de 13 500 $ — un taux EFFECTIF de 3,75 % pendant que la décision
        // Marc, la doc et l'écran annonçaient 45 %. Le défaut d'unité classique : traiter une
        // grandeur mensuelle comme annuelle parce que la ligne d'à côté divisait par 12.
        // [W5-RENTAL-INTERET-DPA] Le proxy s'applique à la base NETTE d'intérêts, pas au NOI encaissé.
        state.addTaxDivers(rentalNoiImposableMonthly * RENTAL_NOI_TAX_PROXY);
        // Revenu gagné publié EXACTEMENT quand le revenu l'est (même porte) : ce que le moteur
        // n'encaisse ni n'impose ne crée pas de droits.
        revenuGagneLocatif = noiParProprietaire;
    }

    // W5.7 — Entreprise privée (CCPC) : dividendes mensuels.
    let businessDividendMonthly = 0;
    for (const biz of containers.privateBusinesses) {
        if (biz.annualDividend && biz.annualDividend > 0) {
            businessDividendMonthly += (biz.annualDividend * (biz.ownershipPct || 100) / 100) / 12;
        }
    }
    if (businessDividendMonthly > 0) {
        state.addIncome(businessDividendMonthly);
        // [FA-6] via `addTaxDivers` → l'impôt sur dividende CCPC SURVIT à l'écrasement décembre (avant :
        // non imposé en année active).
        // ⚠️ Le 0,36 est un PROXY, ancré dans `docs/FISCAL_REFERENCE.md` §6 « Proxys d'impôt W5 ».
        // ⚠️ Le dépôt sait déjà faire le calcul EXACT : `utils/tax.ts` `calculateDividendTax` applique
        // la majoration (38 % déterminé / 15 % ordinaire) et les deux crédits d'impôt pour dividende,
        // dans le bon ordre vis-à-vis de l'abattement québécois. Ce forfait l'ignore, et MESURÉ il ne
        // vaut que pour un dividende ORDINAIRE à ~100 k$ de revenu : il sur-impose un dividende
        // DÉTERMINÉ de jusqu'à 7 606 $/an sur 30 k$. Remplacement suivi par `[W5-DIVIDENDE-PROXY-VS-MOTEUR]`
        // — hors périmètre ici, la décision Marc était de GARDER le forfait et de le documenter.
        // ⚠️ Même défaut d'unité que le locatif ci-dessus : `businessDividendMonthly` est déjà
        // mensuel, le `/ 12` ramenait le taux effectif à 3 % au lieu de 36 %.
        state.addTaxDivers(businessDividendMonthly * CCPC_DIVIDEND_TAX_PROXY);
    }

    return { rentalNoiMensuelParProprietaire: revenuGagneLocatif };
}

/**
 * Effets déterministes liés à l'âge: Sandwich generation (boomerang + caregiving)
 * et Snowbird (mois à l'étranger). Aucun tirage stochastique.
 */
export function applyAgeBasedExpenses(
    ctx: { age: number; currentMonthIndex: number; isRetired: boolean; expenseMultiplier: number },
    projection: {
        boomerangSupportMonthly?: number; boomerangStartAge?: number; boomerangDurationMonths?: number;
        caregivingMonthly?: number; caregivingStartAge?: number; caregivingDurationMonths?: number;
        snowbirdEnabled?: boolean; snowbirdMonthsPerYear?: number; snowbirdExtraMonthlyCost?: number;
    },
    state: { addExpense: (n: number) => void },
): void {
    const { age, currentMonthIndex, isRetired, expenseMultiplier } = ctx;

    // W3.5 — Boomerang
    const boomerangAmount = projection.boomerangSupportMonthly || 0;
    const boomerangStart = projection.boomerangStartAge ?? -1;
    const boomerangDuration = projection.boomerangDurationMonths ?? 0;
    if (boomerangAmount > 0 && boomerangStart >= 0 && age >= boomerangStart) {
        const monthsIntoBoomerang = (age - boomerangStart) * 12 + currentMonthIndex;
        if (monthsIntoBoomerang < boomerangDuration) {
            state.addExpense(boomerangAmount * expenseMultiplier);
        }
    }

    // W3.5 — Caregiving (parents âgés)
    const caregivingAmount = projection.caregivingMonthly || 0;
    const caregivingStart = projection.caregivingStartAge ?? -1;
    const caregivingDuration = projection.caregivingDurationMonths ?? 0;
    if (caregivingAmount > 0 && caregivingStart >= 0 && age >= caregivingStart) {
        const monthsIntoCare = (age - caregivingStart) * 12 + currentMonthIndex;
        if (monthsIntoCare < caregivingDuration) {
            state.addExpense(caregivingAmount * expenseMultiplier);
        }
    }

    // W4.7 — Snowbird
    if (projection.snowbirdEnabled && isRetired) {
        const monthsPerYear = projection.snowbirdMonthsPerYear ?? 5;
        const extraMonthlyCost = projection.snowbirdExtraMonthlyCost ?? 1500;
        state.addExpense((extraMonthlyCost * monthsPerYear / 12) * expenseMultiplier);
    }
}
