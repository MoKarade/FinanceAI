// services/taxResidual.ts
//
// [ENG-NET-MODEL-RESIDUAL] Diagnostic « net déclaré vs net du modèle » — la moitié PROUVABLE du
// ticket (l'autre — réconcilier via un facteur calibré au boot — change les projections et reste
// une décision produit, routée).
//
// Le moteur encaisse chaque mois le `netSalary` SAISI ; l'impôt, lui, vient du MODÈLE. Pour la
// population « brut DÉDUIT » (grossSalary absent), le brut est obtenu en INVERSANT le calcul
// fiscal, donc le net du modèle redonne le net saisi PAR CONSTRUCTION (mesuré 2026-09-04 :
// −0,29 $ à 60 k$ de net, +0,77 $ à 120 k$ — cf FISCAL_REFERENCE §9, biais a annulé par
// [MIGRATE-GROSS-135]). Pour la population « brut SAISI », RIEN ne réconcilie les deux : l'écart
// mesure la distance entre la paie réelle et le modèle (RPP, assurances collectives, retenues
// d'employeur… ou une saisie périmée). Ce module CALCULE ce fait ; l'écran le MONTRE.
//
// ⚠️ Convention de signe : residuel = netModele − netDeclare. Négatif = le modèle rend MOINS de
// net que la paie déclarée (le moteur « perd » du net) ; positif = il en « crée ».
// ⚠️ La PAIRE (année, ageOpts) doit être celle du panneau appelant ([GROSSFROMNET-ANNEE-FIGEE],
// [GROSSFROMNET-CREDITS-65]) — c'est pourquoi les deux sont des ARGUMENTS, jamais relus ici.

import type { AgeCreditOptions } from './tax';
import { calculateFiscalReport } from './tax';

export interface NetModelResidual {
    /** Net annuel déclaré (netSalary × 12) — la grandeur que le moteur encaisse. */
    netDeclare: number;
    /** Net fiscal annuel du SALAIRE SEUL au brut saisi (assiette emploi = brut, aucun placement). */
    netModele: number;
    /** netModele − netDeclare (voir la convention de signe en tête). */
    residuel: number;
    /** |residuel| ≥ 1 % du net déclaré. Seuil MESURÉ (2026-09-04) : la population « brut déduit »
     *  reste sous 1 $ par construction, et une paie réelle diverge du modèle de quelques dixièmes
     *  de % à quelques % — sous 1 %, l'écart est du bruit de paie, pas un signal à afficher. */
    significatif: boolean;
}

/**
 * `null` quand il n'y a rien à diagnostiquer : brut NON saisi (déduit du net → écart nul par
 * construction, un « 0 $ » affiché serait du décor) ou net non déclaré (rien à comparer).
 * Les montants sont MENSUELS dans le store (convention §1) → ×12 ici.
 */
export function netModelResidual(
    u: { grossSalary?: number; netSalary?: number },
    annee: number,
    ageOpts: AgeCreditOptions | undefined,
): NetModelResidual | null {
    const monthlyGross = u.grossSalary || 0;
    const monthlyNet = u.netSalary || 0;
    if (!(monthlyGross > 0) || !(monthlyNet > 0)) return null;
    if (!Number.isFinite(monthlyGross) || !Number.isFinite(monthlyNet)) return null;

    const netDeclare = monthlyNet * 12;
    const gross = monthlyGross * 12;
    const netModele = calculateFiscalReport(gross, 0, 0, annee, true, ageOpts, gross).netIncome;
    const residuel = netModele - netDeclare;
    return {
        netDeclare,
        netModele,
        residuel,
        significatif: Math.abs(residuel) >= netDeclare * 0.01,
    };
}
