// mcp/tools/applyDebt.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — schéma + description VERBATIM de l'ancien tool,
// sans SDK MCP. Le spec ne PERSISTE pas : `toDocument` convertit seulement les args validés en
// DocumentPayload (la persistance = runApply côté serveur, applyDocument+confirmation côté app).
//
// [MCP-APPLY-DEBT] — tool d'ÉCRITURE : ajoute (ou met à jour, par nom) une dette RÉELLE dans l'état
// FinanceAI — prêt auto, carte de crédit, prêt perso… Demande Marc 2026-07-15.
// ⚠️ [DEBT-MCP-PARITE, 2026-08-21] Cette description affirmait « les dettes n'ont PAS de date de
// début » — FAUX depuis `[DETTE-DATES]` (2026-08-19) : `startDate`/`termEndDate` sont câblés dans
// le moteur et l'UI DebtManager. Réservé aux dettes DÉJÀ CONTRACTÉES (solde réel AUJOURD'HUI) ;
// `startDate` date un début PASSÉ ou SIGNÉ-mais-pas-encore-débuté, jamais un achat hypothétique
// (→ simulate_what_if).

import { z } from 'zod';
import { DEBT_KINDS } from '../../types';
import type { WriteToolSpec } from './_toolSpec';

// Leçon MCP-WHATIF : `.finite()` OBLIGATOIRE sur tout montant (Zod .positive()/.max() laissent
// passer Infinity) — et applyDebt re-garde côté métier (un appel direct du handler bypasse Zod).
const inputSchema = {
    name: z.string().min(1).max(120)
        .describe('Nom de la dette (ex. « Prêt auto Honda Civic »). ⚠️ Une dette EXISTANTE du même nom est ÉCRASÉE (mise à jour), pas dupliquée : pour une dette DIFFÉRENTE, choisis un nom distinctif (« Marge perso » vs « Marge auto »).'),
    balance: z.number().positive().finite().optional()
        .describe('Solde ACTUELLEMENT dû ($ CAD). REQUIS pour un ajout ; omissible en mise à jour partielle (le champ existant est conservé).'),
    interestRate: z.number().min(0).max(100).finite().optional()
        .describe("Taux d'intérêt annuel (%). Ex. 7.49. REQUIS pour un ajout ; omissible en mise à jour."),
    minimumPayment: z.number().min(0).finite().optional()
        .describe('Paiement mensuel (minimum ou régulier, $ CAD). REQUIS pour un ajout ; omissible en mise à jour.'),
    category: z.enum(['CreditCard', 'Car', 'Student', 'Personal', 'Other']).optional()
        .describe('Catégorie. Absente → inférée du nom (auto/études/carte), sinon Personal.'),
    amortizationYears: z.number().int().min(1).max(50).optional()
        .describe("Durée d'amortissement en années (prêt auto/perso à terme)."),
    rateProvider: z.string().max(80).optional()
        .describe('Institution prêteuse (optionnel, informatif).'),
    debtKind: z.enum(DEBT_KINDS).optional()
        .describe('Type précis de dette (mortgage/heloc/auto/auto-lease/student-federal/' +
            'student-quebec/credit-card/personal/margin/spouse-loan/other). Distingue notamment ' +
            "un BAIL auto (auto-lease, ne s'amortit pas) d'un PRÊT auto (auto, s'amortit) — les " +
            'confondre fausse la façon dont la dette est présentée. Absente → catégorie large ' +
            "(`category`) seulement, comme avant ce champ."),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe("Date de début du prêt ou du bail (YYYY-MM-DD). ⚠️ CONSÉQUENCE RÉELLE : le " +
            "graphe Futur ne montre cette dette dans le PASSÉ reconstruit qu'à partir de cette " +
            "date — ne fournis QUE la vraie date de signature/premier paiement, jamais une " +
            "estimation. Absente ⇒ la dette a toujours couru (comportement historique)."),
    termEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Fin du terme (échéance du bail, fin du prêt, renouvellement hypothécaire), ' +
            'YYYY-MM-DD. Après cette date, la projection cesse de payer la dette ; si un solde ' +
            'reste dû, il demeure au bilan (jamais effacé silencieusement). Absente ⇒ payée ' +
            "jusqu'à extinction."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args (une annotation élargirait le shape en ToolInputShape).
export const applyDebtSpec = {
    kind: 'write',
    name: 'apply_debt',
    description:
        "ÉCRIT dans l'état FinanceAI : ajoute une dette RÉELLE (prêt auto, carte de crédit, prêt " +
        'perso, marge…) ou MET À JOUR la dette existante du même nom — mise à jour PARTIELLE : ' +
        'seuls les champs fournis changent, jamais de doublon au retry. ⚠️ Même nom = ÉCRASEMENT ' +
        "(pas d'ajout) : une dette différente exige un nom distinctif. Une sauvegarde horodatée est " +
        "créée AVANT l'écriture (annulable). ⚠️ Réservé aux dettes DÉJÀ CONTRACTÉES (le solde " +
        "fourni doit être réel AUJOURD'HUI) : sans `startDate`, la projection sert la dette dès " +
        "MAINTENANT (paiements + intérêts immédiats, comportement historique) ; avec `startDate` " +
        'dans le futur (prêt signé mais premier paiement pas encore commencé), elle attend cette ' +
        'date. Pour un achat FUTUR ou hypothétique dont le solde/taux ne sont PAS encore connus ' +
        '(« si j\'achète une voiture demain ? »), utilise simulate_what_if à la place — sinon le ' +
        "patrimoine serait faussé avant l'événement. N'invente jamais de chiffres : ne renseigne " +
        "que ce que l'utilisateur a fourni.",
    inputSchema,
    toDocument: (args: Args) => ({ kind: 'debt', ...args }),
} satisfies WriteToolSpec<Args>;
