// mcp/tools/getTaxSituation.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getTaxSituation.tool.ts. Parité app/MCP : tests/aiTools/registryParity.
// Lot 1 — situation fiscale RÉELLE : impôt courant + espace REER/CELI restant.

import { z } from 'zod';
import type { AppState, Transaction, User } from '../../types';
import { calculateFiscalReport, FHSA_ANNUAL_LIMIT_PER_USER } from '../../utils/tax';
import { computeMonthlyActualAverages } from '../../utils/budgetSync';
import { computeHistoricalContributionRoom } from '../../services/projection/setupSimulation';
import { computeAssetBreakdown } from '../../services/portfolio';
import { estimateTaxableInvestmentIncome } from '../../services/taxEstimate';
import { computeBaseGrossAnnual } from '../../services/projection/buildSimulationParams';
import { jsonContent, withState } from './_dataAware';
import type { ReadToolSpec } from './_toolSpec';

const inputSchema = {
    year: z.number().int().min(2024).max(2050).default(2026)
        .describe("Année d'imposition (défaut: 2026)."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args et le handler reste fortement typé (une annotation élargirait le shape).
export const getTaxSituationSpec = {
    kind: 'read',
    name: 'get_tax_situation',
    description:
        "Situation fiscale québécoise RÉELLE de l'utilisateur, dérivée de son état : impôt fédéral + " +
        'Québec estimé PAR CONTRIBUABLE puis sommé (fiscalité canadienne = individuelle, pas de ' +
        'déclaration conjointe), taux marginal par conjoint, cotisations RRQ/RQAP/AE, revenu net, ET ' +
        "l'espace de cotisation RESTANT REER et CELI du MÉNAGE (droits historiques cumulés moins " +
        'soldes actuels).',
    inputSchema,
    handler: async ({ year }, getState) => withState(getState, (state: AppState) => {
        const users = (state.config?.users ?? []) as unknown as User[];
        const activeUsers = users.filter((u) => u && (u.grossSalary || u.netSalary));
        const grossAnnual = computeBaseGrossAnnual(users);

        // [MCP-TAX-COUPLE] — impôt PAR CONJOINT puis sommé, comme le moteur (taxDecember.ts
        // calcule taxMarcReal et taxAnnaReal SÉPARÉMENT). L'ancien code sommait les 2 salaires
        // dans UN calculateFiscalReport (un seul BPA, un seul barème progressif) → ~+11 300 $/an
        // de sur-estimation pour un couple 60k/60k et un marginal de ménage (45,7 %) au lieu du
        // marginal individuel (36,1 %) — audit adversarial 2026-07-14, mesuré 3/3.
        // Chaque user est imposé sur SON brut annualisé avec SES déductions REER/CELIAPP.
        // NB : un user avec SEULEMENT netSalary (pas de brut) est dans activeUsers mais EXCLU
        // de perUserReports (brut inconnu → impôt incalculable, même convention gross-only que
        // computeBaseGrossAnnual/le moteur) → perUser.length peut être < activeUsers.length,
        // et ses rrspContributed/fhsaBalance ne déduisent RIEN (correct : une déduction ne
        // réduit que le revenu de SON titulaire — l'ancien code fusionné l'appliquait à tort
        // au revenu de l'autre conjoint).
        // [TAX-APP-MCP-BASE] même assiette que l'onglet Impôt : le revenu de placement imposable
        // (non-enreg/crypto, helper PARTAGÉ services/taxEstimate) s'ajoute au revenu imposable, réparti
        // par conjoint comme dans TaxCenter (÷ nombre de users, tuple [User,User] → ratio 1/2).
        // [FISC-PAYROLL-BASE-INVEST] mais l'assiette EMPLOI (RRQ/RQAP/AE) reste le SALAIRE seul (`g`)
        // — le placement ne cotise pas. NB (limite documentée, à traiter au BACKLOG [FISC-SOLO-INVEST-SPLIT])
        // : le split par longueur de tuple laisse la part d'un conjoint SANS brut (exclu de perUserReports,
        // ou payé en net seul) NON imposée — sous-imposition du placement d'un solo/mono-salarié.
        const taxableAddOn = estimateTaxableInvestmentIncome(
            (state.assets ?? []) as AppState['assets'],
            state.fxRates ?? {},
        );
        const splitRatio = users.length > 0 ? 1 / users.length : 1;
        // [TOOL-TAXSITUATION-FAKE-ZERO] ⚠️ Le ticket annonçait un « faux 0 $ » publié au modèle.
        // VÉRIFIÉ : c'est INEXACT ici — le `.filter(g > 0)` juste en dessous EXCLUT ces conjoints de
        // `perUserReports`, donc aucun 0 n'est publié. Le vrai défaut est l'inverse et il est plus
        // sournois : le conjoint DISPARAÎT du payload SANS TRACE. Or le system prompt déclare les
        // payloads d'outils « ta SEULE source de vérité chiffrée » — le modèle voit donc un ménage
        // à un seul contribuable et n'a aucun moyen de savoir qu'il en manque un.
        // Correctif : `perUserOmitted` ci-dessous nomme les exclus et la raison (patron déjà utilisé
        // par `describeFutureDetail`). On ne publie pas un chiffre faux, et on ne tait pas non plus
        // une absence.
        const perUserOmitted = activeUsers
            .filter((u) => !((u.grossSalary || 0) > 0))
            .map((u) => ({
                name: u.name || null,
                reason: 'brut annuel inconnu (seul un salaire NET est saisi) — impôt incalculable pour ce conjoint',
            }));
        const perUserReports = activeUsers
            .map((u) => ({ user: u, grossAnnual: (u.grossSalary || 0) * 12 }))
            .filter(({ grossAnnual: g }) => g > 0)
            .map(({ user: u, grossAnnual: g }) => {
                // Assiette IMPOSABLE = salaire + part de placement ; assiette EMPLOI = salaire (`g`).
                const taxableBase = g + taxableAddOn * splitRatio;
                return {
                    name: u.name || null,
                    grossAnnual: g,
                    taxableBase,
                    salarySource: u.salarySource,
                    report: calculateFiscalReport(
                        taxableBase,
                        // [MCP-TAX-FHSA-BALANCE] `fhsaBalance` est un SOLDE, pas une cotisation
                        // annuelle : clampé au plafond CELIAPP. Effet actuel nul (aucun écrivain ne
                        // peuple encore fhsaBalance) — ceinture pour le jour où un apply_* l'écrira.
                        u.rrspContributed || 0,
                        Math.min(u.fhsaBalance || 0, FHSA_ANNUAL_LIMIT_PER_USER),
                        year, true,
                        undefined, g,
                    ),
                };
            });

        // [TAX-REAL-SPENDING] mêmes moyennes que l'app (utils/budgetSync, source unique).
        const realAverages = computeMonthlyActualAverages((state.transactions ?? []) as Transaction[]);

        const sum = (f: (r: (typeof perUserReports)[number]) => number): number =>
            perUserReports.reduce((s, r) => s + f(r), 0);
        const totalTax = sum((r) => r.report.totalTax);
        // [code-reviewer] cohérence : totalTax/netIncome portent sur salaire+placement → le taux MOYEN
        // et la reconstructabilité doivent utiliser la MÊME assiette (sinon averageRatePct sur-estimé
        // et netIncome ≠ grossAnnualIncome − totalTax). taxableInvestmentIncome = part réellement imposée.
        const totalTaxableIncome = sum((r) => r.taxableBase);
        const taxedInvestmentIncome = Math.max(0, totalTaxableIncome - sum((r) => r.grossAnnual));
        // Marginal du ménage = celui du conjoint au revenu le plus élevé (JAMAIS le marginal du
        // total fusionné) ; le détail par conjoint est dans perUser.
        const topMarginal = perUserReports.reduce((m, r) => Math.max(m, r.report.marginalRate), 0);

        // Espace de cotisation : droits historiques cumulés − soldes actuels.
        // Aligne la sémantique du moteur (rrspRoom = totalHistoriqueREER − REER).
        // [MCP-NETINCOME-MISLEADING] Net SALARIAL encaissable = brut − impôt total − cotisations.
        // L'impôt dû au revenu de placement est retiré ici À DESSEIN : il se paie depuis la paie,
        // le portefeuille n'étant pas liquidé. C'est donc bien la trésorerie qui arrive au compte.
        const netSalaryAnnual = Math.max(0, grossAnnual - totalTax
            - sum((r) => r.report.rrq) - sum((r) => r.report.rqap) - sum((r) => r.report.ae));

        const room = computeHistoricalContributionRoom(activeUsers, grossAnnual, year);
        const breakdown = computeAssetBreakdown(state.assets ?? [], state.fxRates ?? {});
        const celiRoomRemaining = Math.max(0, room.totalHistoricalCeliRoom - breakdown.celi);
        const reerRoomRemaining = Math.max(0, room.totalHistoricalRrspRoom - breakdown.reer);

        return jsonContent({
            currency: 'CAD',
            year,
            grossAnnualIncome: Math.round(grossAnnual),
            // [TAX-APP-MCP-BASE] revenu de placement imposable estimé (non-enreg/crypto) inclus dans
            // l'assiette d'impôt → exposé pour que netIncome soit reconstructible.
            taxableInvestmentIncome: Math.round(taxedInvestmentIncome),
            taxFederal: Math.round(sum((r) => r.report.fedTax)),
            taxQuebec: Math.round(sum((r) => r.report.qcTax)),
            totalTax: Math.round(totalTax),
            marginalRatePct: Number((topMarginal * 100).toFixed(1)),
            // Taux MOYEN sur l'assiette imposable RÉELLE (salaire + placement), cohérent avec totalTax.
            averageRatePct: totalTaxableIncome > 0 ? Number(((totalTax / totalTaxableIncome) * 100).toFixed(1)) : 0,
            // ⚠️ [MCP-NETINCOME-MISLEADING] `netIncome` porte l'assiette IMPOSABLE (salaire +
            // rendement de placement ESTIMÉ) : il inclut donc un montant qui n'est JAMAIS encaissé
            // (le rendement n'est ni versé ni liquidé). Incident 2026-08-05 : ce champ m'a fait
            // annoncer à Marc un écart de revenu INEXISTANT — j'ai comparé `netIncome` (52 625 $,
            // dont 12 970 $ de rendement théorique) à ses dépôts de paie réels (39 848 $) et conclu
            // à tort que son salaire saisi était faux. Un agrégat crédible mais non étiqueté
            // fabrique de faux diagnostics : c'est le principe no-fake-data appliqué aux tools.
            netIncome: Math.round(sum((r) => r.report.netIncome)),
            // Ce qui tombe RÉELLEMENT au compte : le salaire brut moins TOUT ce qui est prélevé
            // (impôt du ménage — y compris la part due au placement, payée depuis le salaire
            // puisque le portefeuille n'est pas liquidé — et cotisations). Vérifiable contre le
            // relevé bancaire : sur le profil réel de Marc, 39 654 $ prédits vs 39 848 $ de dépôts
            // de paie mesurés sur 12 mois (écart 0,5 %).
            netSalaryIncome: Math.round(netSalaryAnnual),
            netSalaryMonthly: Math.round(netSalaryAnnual / 12),
            payrollDeductions: {
                rrq: Math.round(sum((r) => r.report.rrq)),
                rqap: Math.round(sum((r) => r.report.rqap)),
                ae: Math.round(sum((r) => r.report.ae)),
            },
            // Détail PAR CONTRIBUABLE (fiscalité individuelle) — c'est le marginal de CHAQUE
            // conjoint qui guide une décision REER, pas celui du ménage. [TAX-DETAIL] retenues
            // détaillées + provenance du salaire (fiche de paie = source unique, demande Marc).
            // [TOOL-TAXSITUATION-FAKE-ZERO] Conjoints ACTIFS mais absents de `perUser`, avec la
            // raison. Vide dans le cas courant ; jamais omis du payload, pour que l'absence du
            // tableau ne puisse pas être confondue avec « personne n'a été exclu ».
            perUserOmitted,
            perUser: perUserReports.map((r) => ({
                name: r.name,
                grossAnnual: Math.round(r.grossAnnual),
                totalTax: Math.round(r.report.totalTax),
                marginalRatePct: Number((r.report.marginalRate * 100).toFixed(1)),
                averageRatePct: Number(r.report.averageRate.toFixed(1)),
                netIncome: Math.round(r.report.netIncome),
                netMonthly: Math.round(r.report.netIncome / 12),
                withholdings: {
                    federal: Math.round(r.report.fedTax),
                    quebec: Math.round(r.report.qcTax),
                    rrq: Math.round(r.report.rrq),
                    rqap: Math.round(r.report.rqap),
                    ae: Math.round(r.report.ae),
                },
                salarySource: r.salarySource ?? null,
            })),
            // [TAX-REAL-SPENDING] Réel des transactions (mois pleins) — « ce que je gagne et
            // dépense » aussi côté connecteur, mêmes chiffres que l'app (source unique).
            realMonthlyAverages: {
                income: realAverages.incomeAvg,
                expenses: realAverages.expenseAvg,
                net: realAverages.incomeAvg - realAverages.expenseAvg,
                fullMonths: realAverages.fullMonths,
            },
            celiRoomRemaining: Math.round(celiRoomRemaining),
            reerRoomRemaining: Math.round(reerRoomRemaining),
            currentBalances: {
                celi: Math.round(breakdown.celi),
                reer: Math.round(breakdown.reer),
            },
            notes:
                // [MCP-TAX-FHSA-BALANCE] Ceinture SIGNALÉE (finding silent-failure #549) : si le
                // clamp CELIAPP engage réellement un jour, le dire dans les notes — un clamp muet
                // rendrait totalTax inexplicable depuis le solde réel.
                // Déclencheur = la MÊME population que le clamp (contribuables à salaire > 0,
                // cf perUserReports) — sinon un conjoint sans brut déclencherait la note sans
                // qu'aucun clamp n'ait engagé (finding financial-integrity #549).
                (activeUsers.some((u) => ((u.grossSalary || 0) * 12) > 0 && (u.fhsaBalance || 0) > FHSA_ANNUAL_LIMIT_PER_USER)
                    ? `⚠️ Un fhsaBalance dépasse le plafond annuel CELIAPP (${FHSA_ANNUAL_LIMIT_PER_USER} $) : ` +
                      "c'est un SOLDE, pas une cotisation de l'année — la déduction est clampée au plafond. "
                    : '') +
                'Impôt calculé PAR CONTRIBUABLE puis sommé (aucune fusion des revenus du couple). ' +
                "marginalRatePct = marginal du conjoint au plus haut revenu ; voir perUser pour chacun. " +
                'celiRoomRemaining/reerRoomRemaining sont des AGRÉGATS du ménage (somme des droits des ' +
                "2 comptes légaux distincts) — ne pas verser tout l'espace dans le compte d'UNE personne. " +
                "Assiette imposable = salaires bruts annualisés + revenu de placement IMPOSABLE ESTIMÉ du " +
                "non-enregistré/crypto (dividendes ~2 % + gains ~7 %×50 %, champ taxableInvestmentIncome) ; les " +
                "cotisations RRQ/RQAP/AE portent sur le SALAIRE seul. N'inclut pas : revenu locatif, tous les crédits. " +
                'perUser.withholdings = retenues détaillées ; perUser.salarySource = provenance du salaire ' +
                '(fiche de paie = source unique — null = saisie manuelle) ; realMonthlyAverages = réel des ' +
                'transactions (mois pleins, hors transferts), mêmes chiffres que l\'onglet Budget. ' +
                // [MCP-NETINCOME-MISLEADING] Avertissement EXPLICITE : sans lui, un lecteur (humain ou
                // IA) compare netIncome aux dépôts de paie réels et conclut à un faux écart de revenu.
                '⚠️ netIncome porte l\'assiette IMPOSABLE : il INCLUT le rendement de placement estimé, ' +
                'qui n\'est PAS encaissé. Pour ce qui tombe vraiment au compte (comparable aux dépôts de ' +
                'paie du relevé), utiliser netSalaryIncome / netSalaryMonthly — brut moins impôt total et ' +
                'cotisations. Ne JAMAIS comparer netIncome à des transactions bancaires.',
        });
    }),
} satisfies ReadToolSpec<Args>;
