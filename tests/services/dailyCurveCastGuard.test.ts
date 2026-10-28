// tests/services/dailyCurveCastGuard.test.ts
//
// [DETTE-CAST-DAILYCURVE] tsc garde prise sur les points de FUSION réel↔projeté de la courbe
// journalière — le terrain money-critical identifié dans CLAUDE.md. Le ticket comptait 17
// `as unknown as` (8 dans dailyCurve.ts, 9 dans FutureProjection.tsx) ; l'identité d'un point
// quotidien est désormais DÉCLARÉE sur `ProjectionChartPoint` (types.ts), et 15 casts sont
// RETIRÉS — prouvé par le typecheck ET l'empreinte des grandeurs publiées (identique à l'octet).
//
// Résiduel BORNÉ : les 2 casts des handlers recharts (`onMouseMove`/`onMouseLeave`) restent —
// typage TIERS qui ne porte pas `activePayload`, hors de notre contrôle. Une dette résiduelle se
// borne par un TEST, jamais par un commentaire : le compte refuse le 3e cast, et rougira AUSSI si
// les types recharts s'améliorent un jour (0 cast) — ce rouge-là dit « re-juge cette garde »,
// il ne se re-base pas mécaniquement.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripCommentsJsx } from '../../utils/stripComments';

const lireDecommente = (p: string): string => {
    const brut = readFileSync(p, 'utf8');
    const code = stripCommentsJsx(brut);
    // Anti-vacuité du décommentage (non-blancs — stripCommentsJsx BLANCHIT, la longueur ne bouge
    // pas). Seuil MESURÉ le 2026-09-04 : le plus petit fichier du périmètre (dailyRefine.ts) garde
    // 2 382 caractères de code — plancher à 1 000, marge ×2,4.
    expect(code.replace(/\s/g, '').length, `${p} : décommentage suspect`).toBeGreaterThan(1_000);
    return code;
};

describe('[DETTE-CAST-DAILYCURVE] la fusion réel↔projeté reste TYPÉE', () => {
    it('services/projection/dailyCurve.ts : ZÉRO `as unknown as` (les 8 du ticket sont retirés)', () => {
        const code = lireDecommente('services/projection/dailyCurve.ts');
        expect(code.match(/as unknown as/g) ?? []).toEqual([]);
    });

    it('services/projection/dailyLedger.ts, dailyRefine.ts : la chaîne quotidienne suit la même règle', () => {
        // dailyLedger garde SON unique cast au site de construction (documenté « double cast au
        // site de construction ») ? NON — mesuré le 2026-09-04 : il en reste UN (L~599), même
        // classe. Compte épinglé pour qu'un ajout soit une décision, et sa disparition un progrès
        // à re-juger (retirer la ligne, pas re-baser).
        const ledger = lireDecommente('services/projection/dailyLedger.ts');
        expect((ledger.match(/as unknown as/g) ?? []).length).toBeLessThanOrEqual(1);
        const refine = lireDecommente('services/projection/dailyRefine.ts');
        expect(refine.match(/as unknown as/g) ?? []).toEqual([]);
    });

    it('components/FutureProjection.tsx : exactement 2 casts, les handlers recharts (typage tiers)', () => {
        const code = lireDecommente('components/FutureProjection.tsx');
        const sites = code.match(/as unknown as/g) ?? [];
        expect(sites.length, 'un `as unknown as` est apparu ou a disparu — les 2 tolérés sont les handlers recharts (typage tiers) ; un 3e se refuse, un 0 se re-juge (types recharts améliorés ?)')
            .toBe(2);
        // Les deux tolérés sont bien les handlers du graphe, pas ailleurs. Le cast d'onMouseMove
        // vit sur la ligne de FERMETURE de sa lambda (plusieurs lignes plus bas que le nom) : on
        // vérifie donc que chaque occurrence a `onMouseMove={` ou `onMouseLeave={` dans la fenêtre
        // qui la PRÉCÈDE — sur source DÉCOMMENTÉE, donc jamais satisfait par un commentaire
        // (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
        // ⚠️ Fenêtre 2 000 : stripCommentsJsx BLANCHIT (les commentaires gardent leur LONGUEUR),
        // et la lambda porte ~900 caractères de commentaires — mesuré 2026-09-04, distance ~1 300.
        let idx = -1;
        while ((idx = code.indexOf('as unknown as', idx + 1)) !== -1) {
            const avant = code.slice(Math.max(0, idx - 2_000), idx);
            expect(/onMouseMove=\{|onMouseLeave=\{/.test(avant),
                `cast hors handler recharts vers l'offset ${idx} : …${code.slice(Math.max(0, idx - 60), idx + 30).trim()}…`).toBe(true);
        }
    });

    it('l\'identité quotidienne est DÉCLARÉE sur ProjectionChartPoint (le fait qui rend les casts inutiles)', () => {
        const types = lireDecommente('services/projection/types.ts');
        for (const champ of ['hostMonthIndex?', 'dayIso?', 'dayIsReal?', 'daySyncUnconfirmed?']) {
            expect(types.includes(champ), `${champ} a disparu de ProjectionChartPoint — les lecteurs re-casteraient`).toBe(true);
        }
    });
});
