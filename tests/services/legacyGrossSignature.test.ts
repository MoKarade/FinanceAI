// [MIGRATE-GROSS-PROPOSER] Détection de la signature du brut fabriqué par l'ancien repli
// (`Math.round(net × 1,35)` MENSUEL, écrit par migrateUserConfig jusqu'au 2026-08-20) et brut
// de remplacement proposé. Décision de Marc (2026-09-03) : proposer, JAMAIS écrire seul.
import { describe, it, expect } from 'vitest';
import {
    hasLegacyGross135Signature,
    proposedGrossMonthlyFromNet,
    LEGACY_GROSS_FACTOR,
} from '../../services/legacyGrossSignature';
import { ageOptsForSalaryInversion, calculateFiscalReport } from '../../utils/tax';

describe('[MIGRATE-GROSS-PROPOSER] détection de la signature 1,35', () => {
    it('reconnaît EXACTEMENT ce que l\'ancien code écrivait : Math.round(net × 1,35)', () => {
        // 5 000 × 1,35 = 6 750 — le cas historique type.
        expect(hasLegacyGross135Signature({ netSalary: 5000, grossSalary: 6750 })).toBe(true);
        // Et un net qui force l'arrondi (4 001 × 1,35 = 5 401,35 → 5 401) : la signature est
        // celle de l'ÉCRITURE (arrondie), pas du produit exact.
        expect(hasLegacyGross135Signature({ netSalary: 4001, grossSalary: 5401 })).toBe(true);
    });

    it('égalité STRICTE au dollar : à 1 $ près, ce n\'est PAS la signature', () => {
        // Un seuil « à peu près 1,35× » multiplierait les faux positifs : l'ancien code écrivait
        // un arrondi exact, un brut saisi à la main qui s'en approche n'est pas suspect.
        expect(hasLegacyGross135Signature({ netSalary: 5000, grossSalary: 6751 })).toBe(false);
        expect(hasLegacyGross135Signature({ netSalary: 5000, grossSalary: 6749 })).toBe(false);
    });

    it('l\'utilisateur a confirmé → plus jamais d\'avis (un avertissement permanent est mort)', () => {
        expect(hasLegacyGross135Signature({ netSalary: 5000, grossSalary: 6750, grossSalaryConfirmed: true })).toBe(false);
    });

    it('un salaire estampillé fiche de paie ou MCP vient d\'un document réel → pas un fabriqué', () => {
        expect(hasLegacyGross135Signature({ netSalary: 5000, grossSalary: 6750, salarySource: { kind: 'payslip' } })).toBe(false);
        expect(hasLegacyGross135Signature({ netSalary: 5000, grossSalary: 6750, salarySource: { kind: 'mcp' } })).toBe(false);
        // « manual » n'innocente rien : c'est la valeur par défaut d'une saisie inconnue.
        expect(hasLegacyGross135Signature({ netSalary: 5000, grossSalary: 6750, salarySource: { kind: 'manual' } })).toBe(true);
    });

    it('même dérivation du net que l\'ancien fabricant : `netSalary || salary`', () => {
        // Une config assez vieille pour porter le brut fabriqué peut aussi porter l'ancien champ
        // `salary` — le fabricant lisait `u.netSalary || u.salary || 0`.
        expect(hasLegacyGross135Signature({ salary: 4000, grossSalary: 5400 })).toBe(true);
    });

    it('net ou brut absent/nul → pas de signature (rien à détecter)', () => {
        expect(hasLegacyGross135Signature({ netSalary: 0, grossSalary: 0 })).toBe(false);
        expect(hasLegacyGross135Signature({ grossSalary: 6750 })).toBe(false);
        expect(hasLegacyGross135Signature({ netSalary: 5000 })).toBe(false);
        expect(hasLegacyGross135Signature(undefined)).toBe(false);
    });
});

describe('[MIGRATE-GROSS-PROPOSER] brut proposé en remplacement', () => {
    it('le brut proposé, repassé au calcul fiscal, redonne le net saisi (la PROPRIÉTÉ, pas un nombre)', () => {
        const annee = 2026;
        const propose = proposedGrossMonthlyFromNet({ netSalary: 5000 }, annee, 1);
        const opts = ageOptsForSalaryInversion({}, annee, 1);
        const netRendu = calculateFiscalReport(propose * 12, 0, 0, annee, false, opts).netIncome;
        // Tolérance DÉRIVÉE, même raisonnement que migrateGrossFromNet.test : dichotomie < 1 $
        // annuel + arrondi au dollar MENSUEL (≤ 0,50 $ × 12 = 6 $ annualisé) → < 13 $.
        expect(Math.abs(netRendu - 5000 * 12)).toBeLessThan(13);
    });

    it('DISCRIMINE l\'ancien facteur plat : la proposition n\'est pas 1,35× le net', () => {
        // À 5 000 $ de net mensuel, le brut exact (mesuré ≈ 7 247 $/mois en 2026) est bien
        // au-dessus de la sécante 1,35 — c'est tout l'objet de la proposition. La comparaison est
        // relative au facteur, pas à un nombre figé (le brut déduit décroît avec l'indexation).
        const propose = proposedGrossMonthlyFromNet({ netSalary: 5000 }, 2026, 1);
        expect(propose).toBeGreaterThan(5000 * LEGACY_GROSS_FACTOR);
        expect(propose).not.toBe(Math.round(5000 * LEGACY_GROSS_FACTOR));
    });

    it('net nul ou absent → 0, jamais NaN', () => {
        expect(proposedGrossMonthlyFromNet({ netSalary: 0 }, 2026, 1)).toBe(0);
        expect(proposedGrossMonthlyFromNet(undefined, 2026, 1)).toBe(0);
    });
});
