/**
 * [A11Y-PRIVACY-PDF-CONTRAT] L'export PDF REFUSE de générer quand le mode discret est actif.
 *
 * Décision de Marc (2026-08-17, `docs/decisions.md`). ⚠️ Le raisonnement, parce qu'il n'est pas
 * évident : un PDF **sort de l'app et survit au mode**. Le fichier ne sait pas qu'il a été produit
 * depuis un écran masqué. Générer en clair depuis un écran volontairement masqué est donc un piège
 * — l'utilisateur croit ses montants protégés alors qu'il vient d'en fabriquer une copie
 * permanente. Générer en « ••• » donnerait un rapport financier sans chiffres, donc rien.
 *
 * ⚠️ La garde vit AU SERVICE, pas au clic : une borne posée seulement dans `App.tsx` laisserait
 * passer tout futur appelant (autre bouton, raccourci, outil MCP, script). Même motif que
 * `clampSplitPct`, où la borne UI seule laissait passer un import de sauvegarde.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateFinancialReport, PdfRefusedPrivacyError } from '../../services/pdfReport';
import { useFinanceStore } from '../../store/useFinanceStore';

// jspdf est lourd et écrit un fichier : on le neutralise pour que le test porte UNIQUEMENT sur le
// contrat de refus. ⚠️ Le mock compte aussi ses appels — c'est lui qui prouve qu'AUCUN travail
// n'est fait quand le mode est actif (un refus tardif laisserait un PDF partiel derrière lui).
const jsPDFCtor = vi.fn();
vi.mock('jspdf', () => {
    // ⚠️ `pdfReport` lit `mod.jsPDF ?? mod.default` : le mock doit exposer LES DEUX, sinon il n'est
    // pas pris et le test mesure autre chose que ce qu'il croit (mon premier jet n'exposait que
    // `default` et le compteur restait à zéro — le test accusait la garde à tort).
    class FauxPdf {
        constructor() { jsPDFCtor(); }
        setFont() {} setFontSize() {} setTextColor() {} setFillColor() {} setDrawColor() {}
        rect() {} text() {} addPage() {} line() {} save() {} splitTextToSize() { return ['']; }
        internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getNumberOfPages: () => 1 };
        setPage() {}
    }
    return { __esModule: true, jsPDF: FauxPdf, default: FauxPdf };
});

const donnees = {
    netWorth: 100_000, monthlySavings: 1_000, monthlyIncome: 5_000, totalDebts: 0,
    celiBalance: 0, reerBalance: 0, investmentsTotal: 0, liquidityBalance: 0,
    budgetItems: [], fiscal: undefined, holdings: [], debtsDetail: [], goalsDetail: [],
    scenarios: [],
} as unknown as Parameters<typeof generateFinancialReport>[0];

beforeEach(() => {
    jsPDFCtor.mockClear();
    useFinanceStore.setState({ isPrivacyMode: false });
});

describe('[A11Y-PRIVACY-PDF-CONTRAT] refus en mode discret', () => {
    it('mode discret ACTIF → rejette avec une erreur TYPÉE', async () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        await expect(generateFinancialReport(donnees)).rejects.toBeInstanceOf(PdfRefusedPrivacyError);
    });

    it('le refus est IMMÉDIAT : aucun document n’est même commencé', async () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        await generateFinancialReport(donnees).catch(() => undefined);
        // Sans cette assertion, un refus tardif (au moment d'écrire le fichier) passerait le test
        // précédent tout en ayant construit le PDF entier en mémoire.
        expect(jsPDFCtor, 'refuser APRÈS avoir tout construit laisserait un PDF partiel').not.toHaveBeenCalled();
    });

    // ⚠️ Garde ANTI-SUR-CORRECTIF. Sans elle, on pourrait refuser TOUJOURS et rester vert : le test
    // ci-dessus ne distingue pas « refuse en mode discret » de « refuse tout le temps ».
    it('mode discret INACTIF → génère normalement', async () => {
        await expect(generateFinancialReport(donnees)).resolves.toBeUndefined();
        expect(jsPDFCtor).toHaveBeenCalled();
    });

    it('l’erreur porte un `name` STABLE, sur lequel l’appelant peut discriminer', () => {
        // L'appelant (`App.tsx`) teste `e.name` : si quelqu'un renomme la classe sans garder ce
        // `name`, le refus retomberait dans la branche « Erreur lors de la génération » et dirait
        // à Marc que ça a planté, là où il faut lui dire de désactiver le mode discret.
        expect(new PdfRefusedPrivacyError().name).toBe('PdfRefusedPrivacyError');
    });
});
