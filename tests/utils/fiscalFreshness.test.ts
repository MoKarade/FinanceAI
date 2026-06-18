// tests/utils/fiscalFreshness.test.ts
//
// [HARDEN-FISCAL-TIMEBOMB] — garde-fou de fraîcheur des valeurs fiscales.
//
// Deux niveaux :
//   1. Tests UNITAIRES du helper pur (`assessFiscalFreshness`) sur du markdown SYNTHÉTIQUE +
//      un `now` injecté. C'est la PREUVE DE DISCRIMINATION : une date périmée fait passer
//      `isExpired` à true (le test « live » échouerait alors). Aucun couplage à l'horloge réelle.
//   2. Le test « live » lit le VRAI docs/FISCAL_REFERENCE.md avec l'horloge réelle et applique
//      la bombe : warn à 12 mois, échec dur à 18 mois (relatif à la dernière vérif, jamais calendaire).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    assessFiscalFreshness,
    parseLatestFiscalVerification,
    monthsBetween,
    FISCAL_FRESHNESS_WARN_MONTHS,
    FISCAL_FRESHNESS_FAIL_MONTHS,
    type FiscalFreshness,
} from '../../utils/fiscalFreshness';

const at = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe('[FISCAL-TIMEBOMB] parsing de la date de vérification', () => {
    it('extrait la date « Dernière vérification » malgré le gras markdown et le « : »', () => {
        const md = '> **Année de base** : **2026**. **Dernière vérification** : 2026-06-11 (notes…)';
        expect(parseLatestFiscalVerification(md)?.toISOString().slice(0, 10)).toBe('2026-06-11');
    });

    it('prend la date la PLUS RÉCENTE quand un ré-audit postérieur existe', () => {
        const md = [
            '**Dernière vérification** : 2026-06-11',
            '**Ré-audité 2026-06-17** (audit complet)',
        ].join('\n');
        expect(parseLatestFiscalVerification(md)?.toISOString().slice(0, 10)).toBe('2026-06-17');
    });

    it('retourne null si aucun marqueur daté (contrat de fraîcheur cassé)', () => {
        expect(parseLatestFiscalVerification('# Doc sans date de vérification')).toBeNull();
    });

    it('ne capte PAS une date ISO noyée dans une phrase non marquée (anti-désarmement silencieux)', () => {
        // La fenêtre ancrée courte interdit de « glisser » du mot-clé jusqu'à une date lointaine.
        const md = "La dernière vérification par l'organisme externe a porté sur l'exercice 2025-01-01 environ.";
        expect(parseLatestFiscalVerification(md)).toBeNull();
    });

    it('ignore une date qui passe la regex mais est calendairement invalide (2026-13-45)', () => {
        // `new Date('2026-13-45')` → NaN, filtré par le guard Number.isNaN (pas retenu comme « frais »).
        expect(parseLatestFiscalVerification('**Dernière vérification** : 2026-13-45')).toBeNull();
    });
});

describe('[FISCAL-TIMEBOMB] calcul des mois écoulés', () => {
    it('compte des mois ENTIERS (le jour du mois compte)', () => {
        expect(monthsBetween(at('2026-06-17'), at('2026-06-18'))).toBe(0);
        expect(monthsBetween(at('2026-06-17'), at('2026-07-16'))).toBe(0); // pas encore 1 mois plein
        expect(monthsBetween(at('2026-06-17'), at('2026-07-17'))).toBe(1);
        expect(monthsBetween(at('2025-01-15'), at('2026-07-15'))).toBe(18);
    });
});

describe('[FISCAL-TIMEBOMB] évaluation de fraîcheur (DISCRIMINANT)', () => {
    const fresh = '**Dernière vérification** : 2026-06-17';

    it('fraîche (même mois) → ni stale ni expirée', () => {
        const f: FiscalFreshness = assessFiscalFreshness(fresh, at('2026-06-18'));
        expect(f.monthsElapsed).toBe(0);
        expect(f.isStale).toBe(false);
        expect(f.isExpired).toBe(false);
    });

    it('PÉRIMÉE (> 18 mois) → isExpired=true : c’est ce cas que le test live attrape', () => {
        // 20 mois après la dernière vérif → la bombe DOIT s’armer.
        const f = assessFiscalFreshness(fresh, at('2028-02-18'));
        expect(f.monthsElapsed).toBeGreaterThan(FISCAL_FRESHNESS_FAIL_MONTHS);
        expect(f.isExpired).toBe(true);
    });

    it('zone d’avertissement (entre 12 et 18 mois) → stale mais pas encore expirée', () => {
        const f = assessFiscalFreshness(fresh, at('2027-08-18')); // ~14 mois
        expect(f.monthsElapsed).toBeGreaterThan(FISCAL_FRESHNESS_WARN_MONTHS);
        expect(f.monthsElapsed).toBeLessThanOrEqual(FISCAL_FRESHNESS_FAIL_MONTHS);
        expect(f.isStale).toBe(true);
        expect(f.isExpired).toBe(false);
    });

    it('date introuvable → traitée comme périmée (échec bruyant, pas de désamorçage silencieux)', () => {
        const f = assessFiscalFreshness('aucune date ici', at('2026-06-18'));
        expect(f.latestVerification).toBeNull();
        expect(f.monthsElapsed).toBeNull();
        expect(f.isExpired).toBe(true);
    });
});

describe('[FISCAL-TIMEBOMB] bombe LIVE sur le vrai docs/FISCAL_REFERENCE.md', () => {
    // ⚠️ Ces deux tests dépendent VOLONTAIREMENT de `new Date()` (horloge réelle) : c'est LA bombe.
    // Ne PAS « réparer » en mockant l'horloge — l'échec à 18 mois EST le signal voulu (re-vérifier la
    // fiscalité). La logique de seuil est prouvée séparément par les tests unitaires à `now` injecté.
    // Vitest tourne depuis la racine du projet (cwd) — idiome robuste vs `import.meta.url`
    // qui n'est PAS de scheme `file://` après transformation Vite.
    const readDoc = (): string =>
        readFileSync(resolve(process.cwd(), 'docs/FISCAL_REFERENCE.md'), 'utf-8');

    it('une date de vérification est bien présente et parseable', () => {
        const f = assessFiscalFreshness(readDoc(), new Date());
        expect(
            f.latestVerification,
            'aucune date « Dernière vérification »/« Ré-audité » trouvée dans docs/FISCAL_REFERENCE.md — le contrat de fraîcheur est cassé.',
        ).not.toBeNull();
    });

    it(`la fiscalité a été vérifiée il y a ≤ ${FISCAL_FRESHNESS_FAIL_MONTHS} mois (sinon : re-vérifier ARC/Revenu Québec + bumper la date)`, () => {
        const f = assessFiscalFreshness(readDoc(), new Date());
        if (f.isStale && !f.isExpired) {
            // Nudge non bloquant : on est dans la fenêtre 12–18 mois.
            console.warn(
                `[FISCAL-TIMEBOMB] docs/FISCAL_REFERENCE.md vérifié il y a ${f.monthsElapsed} mois ` +
                `(> ${FISCAL_FRESHNESS_WARN_MONTHS}). Re-vérifier les valeurs fiscales et mettre à jour la date.`,
            );
        }
        expect(
            f.monthsElapsed,
            `Fiscalité PÉRIMÉE (${f.monthsElapsed} mois depuis la dernière vérif, seuil ${FISCAL_FRESHNESS_FAIL_MONTHS}). ` +
            `Re-vérifier les constantes vs ARC/Revenu Québec, puis mettre à jour « Dernière vérification » dans docs/FISCAL_REFERENCE.md.`,
        ).not.toBeNull();
        expect(f.isExpired, 'voir message ci-dessus').toBe(false);
    });

    it('verrouille la cohérence des seuils (WARN < FAIL)', () => {
        expect(FISCAL_FRESHNESS_WARN_MONTHS).toBeLessThan(FISCAL_FRESHNESS_FAIL_MONTHS);
    });
});
