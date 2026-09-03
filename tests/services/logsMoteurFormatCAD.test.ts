/**
 * [FMT-TOLOCALESTRING-MONEY] Lot 101 — la garde COMPORTEMENTALE du passage à la source unique.
 *
 * ⚠️ Pourquoi elle existe. Le lot 101 a fait passer 65 chaînes de log du moteur de
 * `Math.round(x).toLocaleString('fr-CA') + ' $'` à `formatCAD(...)`. La suite complète est restée
 * VERTE — 5 316 tests, zéro rouge. Ce n'est PAS un feu vert, c'est un résultat à EXPLIQUER : ça
 * prouve qu'AUCUN test n'assertait le texte formaté de ces logs (le seul qui s'en approche,
 * `realEstate.test.ts`, ne vérifie que le début de la phrase, sans le montant). Un changement de
 * sortie que rien ne voit est exactement ce qu'il faut border avant, pas après
 * (« aucun golden n'a bougé est un résultat à EXPLIQUER »).
 *
 * ⚠️ Ce qu'elle N'AFFIRME PAS. Le gain « NaN devient — » n'est PAS prouvé ici : sur ce producteur,
 * `proj.inheritanceExpectedAmount || 0` rabat déjà un NaN sur 0 et la garde `amount <= 0` sort.
 * Le chemin non fini réellement ATTEIGNABLE est l'INFINI (`Infinity || 0` vaut `Infinity`, et
 * `Infinity <= 0` est faux) — c'est celui-là qui est testé, et lui seul. Publier l'autre serait
 * une affirmation d'atteignabilité non mesurée
 * (`UNE-AFFIRMATION-D-ATTEIGNABILITE-SE-MESURE-AVANT-D-ETRE-PUBLIEE`).
 */
import { describe, it, expect, vi } from 'vitest';
import { tryInheritance } from '../../services/projection/stochasticEvents';
import type { ProjectionConfig } from '../../types';

const proj = (o: Record<string, unknown>): ProjectionConfig => o as unknown as ProjectionConfig;
const mutator = () => ({ addLiquid: vi.fn(), addExpense: vi.fn(), logLife: vi.fn() });
const ctx = (rngVal: number, o: Record<string, unknown> = {}) => ({
    m: 12, currentMonthIndex: 0, age: 50, currentAge: 50,
    expenseMultiplier: 1, enableMonteCarlo: true, rng: () => rngVal, ...o,
});

const heritage = (montant: number): string => {
    const mut = mutator();
    const p = proj({
        inheritanceEnabled: true, inheritanceExpectedAtAge: 50, inheritanceUncertaintyYears: 0,
        inheritanceProbability: 1, inheritanceExpectedAmount: montant,
    });
    tryInheritance(ctx(0, { age: 50 }), p, false, mut);
    expect(mut.logLife, 'le producteur n\'a rien journalisé : la fixture ne déclenche pas')
        .toHaveBeenCalledTimes(1);
    return String(mut.logLife.mock.calls[0]?.[0] ?? '');
};

describe('[FMT-TOLOCALESTRING-MONEY] les logs du moteur passent par formatCAD', () => {
    it('un montant à décimales est arrondi au dollar (c\'était la 2e sortie changée du lot)', () => {
        // AVANT : `amount.toLocaleString('fr-CA')` — sans `Math.round`, et le défaut d'Intl est
        // maximumFractionDigits: 3 → « 12 345,67$ » s'affichait tel quel dans le journal.
        // APRÈS : formatCAD arrondit au dollar, comme partout ailleurs dans l'app.
        const msg = heritage(12345.67);
        expect(msg).toContain('12 346');
        expect(msg).not.toContain('345,67');
    });

    it('les milliers ET le signe de dollar sont séparés par une INSÉCABLE', () => {
        // ⚠️ L'ancien code posait une espace ORDINAIRE devant le « $ » (`…')} $`) ; `formatCAD`
        // pose U+00A0 des deux côtés. Un attendu écrit avec une espace ordinaire serait VACUEUX —
        // c'est le piège déjà payé par le dépôt sur `not.toContain('90 000')`.
        const msg = heritage(200000);
        expect(msg).toContain('200 000 $');
        expect(msg).not.toMatch(/200 000 \$/);
    });

    it('une valeur INFINIE devient « — » au lieu d\'un montant absurde', () => {
        // Chemin RÉELLEMENT atteignable : `Infinity || 0` vaut `Infinity` et passe la garde
        // `amount <= 0`. AVANT, le journal affichait « +∞$ » ; APRÈS, `formatCAD` rend « — ».
        const msg = heritage(Number.POSITIVE_INFINITY);
        expect(msg).toContain('—');
        expect(msg).not.toContain('∞');
    });

    it('le producteur n\'affiche plus AUCUN montant composé hors de la source unique', () => {
        // Contrôle d'anti-vacuité de la famille : le message porte bien un montant (sinon les
        // trois cas ci-dessus seraient satisfaits par un log vide).
        expect(heritage(200000)).toMatch(/\d/);
    });
});
