// tests/services/personaActifQuiDecaisse.test.ts
//
// [PERSONA-ACTIF-QUI-DECAISSE] — le persona « Gilles, 71 ans » existe pour COUVRIR un chemin du
// moteur qu'aucun autre persona n'exerçait : la déclaration de décembre d'un ménage ACTIF qui
// retire du REER (minimum FERR dès 72 ans, retraits d'appoint) ET détient du non-enregistré.
// Mesuré au lot 87 : 0 occurrence sur 7 personas × 40 ans — deux défauts money-critical y ont
// vécu sans qu'aucun golden ne bouge.
//
// La preuve est une OBSERVATION, pas une reconstruction : on espionne les arguments reçus par
// `processDecemberTaxFiling` (le vrai module, appelé par le vrai moteur, nourri par le vrai
// constructeur de paramètres). Les sept autres personas sont le CONTRÔLE NÉGATIF — sans lui,
// « le chemin est exercé » ne dirait pas « c'est ce persona qui l'exerce »
// (`UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE`).

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { DecemberContext } from '../../services/projection/taxDecember';

vi.mock('../../services/projection/taxDecember', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../services/projection/taxDecember')>();
    return { ...mod, processDecemberTaxFiling: vi.fn(mod.processDecemberTaxFiling) };
});

import { processDecemberTaxFiling } from '../../services/projection/taxDecember';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { normalizeAppState } from '../../mcp/state/loadAppState';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { calculateFutureProjection } from '../../services/projection';

// Horloge GELÉE : les personas génèrent des données relatives à `new Date()` (cf. testPersonas.test.ts).
beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});
afterAll(() => {
    vi.useRealTimers();
});

const PERSONA_CIBLE = 'gilles-actif-decaisse';
const spy = vi.mocked(processDecemberTaxFiling);

interface Releve {
    /** Décembres traversés (tous scénarios confondus) — anti-vacuité du balayage. */
    decembres: number;
    /** ANNÉES distinctes où un décembre voit le ménage ACTIF, retirant du REER et détenant du
     *  non-enregistré. ⚠️ Des années, pas des appels : depuis le lot 198, `calculateFutureProjection`
     *  lance un SECOND scénario (la sensibilité à l'épargne, `savingsSensitivity`), et un compteur
     *  d'appels a doublé (4 → 8) sans que rien du persona n'ait changé. Une garde qui compte les
     *  appels d'un module partagé compte les RUNS, pas le fait qu'elle défend
     *  (`UNE-GARDE-ANCRE-LE-FAIT-JAMAIS-LA-FORME-QU-AVAIT-LE-CODE`). */
    actifQuiDecaisse: number;
}

function relever(personaId: string): Releve {
    const persona = TEST_PERSONAS.find((p) => p.id === personaId)!;
    const state = normalizeAppState(persona.build());
    const params = buildSimulationParamsFromState(state, { startYear: 2026, startMonth: 0 });
    spy.mockClear();
    calculateFutureProjection(params);
    let decembres = 0;
    const annees = new Set<number>();
    for (const call of spy.mock.calls) {
        const [currentMonthIndex, ctx] = call as unknown as [number, DecemberContext];
        if (currentMonthIndex !== 11 || ctx.m === 0) continue;
        decembres++;
        if (!ctx.isRetired && ctx.accRetraitsReerYear > 0 && ctx.nonReg > 0) annees.add(ctx.loopYear);
    }
    return { decembres, actifQuiDecaisse: annees.size };
}

describe('[PERSONA-ACTIF-QUI-DECAISSE] « Gilles, 71 ans » exerce le décembre « actif + retraits REER + non-enregistré »', () => {
    it('le persona cible est enregistré (anti-vacuité du contrôle négatif)', () => {
        expect(TEST_PERSONAS.map((p) => p.id)).toContain(PERSONA_CIBLE);
    });

    it('Gilles traverse ce chemin à CHAQUE décembre actif après 72 ans (72 à 75 : quatre), sur la stratégie de base', () => {
        const r = relever(PERSONA_CIBLE);
        expect(r.decembres).toBeGreaterThan(0); // le moteur a bien atteint décembre
        // Mesuré 2026-09-05 (horizon 40 ans) : 4 ANNÉES, 2027 à 2030 — les années
        // des 72, 73, 74 et 75 ans, c'est-à-dire CHAQUE année active à partir du premier minimum
        // FERR (72) et jusqu'à l'arrêt de travail (targetAge 76). Épinglé EXACT, pas borné : un
        // 5e décembre voudrait dire que la retraite a reculé ou que le FERR a avancé — les deux
        // se lisent, ils ne se re-basent pas. Perturbations mesurées : targetAge 76 → 71 (retraité
        // dès le départ) → 0 ; condition lue sans `!isRetired` → 21 ici et 15 chez couple-confort
        // (le contrôle rougit) ; condition `nonReg > 1e9` → 0.
        // ⚠️ Retirer le compte non-enregistré (`gi-a3`) est une perturbation MUETTE (toujours 4) :
        // le minimum FERR dépasse le déficit et le surplus, une fois le CELI plein, est investi en
        // non-enregistré par la cascade — la fixture atteint la condition par un autre chemin. Ce
        // n'est pas une faiblesse de la garde, c'est ce que la fixture SUPPOSE, écrit ici pour que
        // personne ne « corrige » la garde en la croyant aveugle au non-enregistré.
        expect(r.actifQuiDecaisse).toBe(4);
    });

    it('CONTRÔLE NÉGATIF — aucun des sept autres personas ne l\'exerce (0, comme au lot 87)', () => {
        const autres = TEST_PERSONAS.filter((p) => p.id !== PERSONA_CIBLE);
        expect(autres).toHaveLength(7);
        for (const p of autres) {
            const r = relever(p.id);
            expect(r.decembres, `${p.id} : décembres traversés`).toBeGreaterThan(0);
            expect(r.actifQuiDecaisse, `${p.id} : actif + retraits REER + non-enregistré`).toBe(0);
        }
    });
});
