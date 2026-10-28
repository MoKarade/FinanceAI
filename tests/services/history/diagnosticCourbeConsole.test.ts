// tests/services/history/diagnosticCourbeConsole.test.ts
//
// [COURBE-DIAGNOSTIC-CONSOLE] La commande de console rejoue le vrai diagnostic sur l'état du moment,
// sans le muter et sans rien révéler d'autre que dates, symboles et pourcentages. Données fictives.
import { describe, it, expect } from 'vitest';
import type { Asset } from '../../../types';
import { diagnostiquerCourbe } from '../../../services/history/diagnosticCourbe';
import { installerDiagnosticConsole } from '../../../services/history/diagnosticCourbeConsole';

const jour = (n: number): string => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

const actifFictif = (symbole: string, quantite: number, depart: number, pas: number): Asset => ({
    id: `id-${symbole}`, symbol: symbole, name: symbole, type: 'Stock', quantity: quantite, currency: 'CAD',
    history: Array.from({ length: 60 }, (_, i) => ({ date: jour(i), price: depart + i * pas })),
} as unknown as Asset);

type Cible = { financeaiDiagnosticCourbe?: () => Promise<unknown> };

describe('[COURBE-DIAGNOSTIC-CONSOLE] commande de console', () => {
    it('installe la commande, non énumérable (n’apparaît pas dans un dump de window)', () => {
        const cible: Cible = {};
        installerDiagnosticConsole(cible, () => ({ assets: [], fxRates: undefined }));
        expect(typeof cible.financeaiDiagnosticCourbe).toBe('function');
        expect(Object.keys(cible)).toEqual([]);
    });

    it('rend exactement le diagnostic du moteur sur l’état courant', async () => {
        const assets = [actifFictif('AAA', 3, 100, 1), actifFictif('BBB', 7, 50, 0.5)];
        const cible: Cible = {};
        installerDiagnosticConsole(cible, () => ({ assets, fxRates: undefined }));
        expect(await cible.financeaiDiagnosticCourbe!()).toEqual(diagnostiquerCourbe(assets, undefined));
    });

    it('relit l’état à CHAQUE appel (pas celui du démarrage)', async () => {
        let assets: Asset[] = [];
        const cible: Cible = {};
        installerDiagnosticConsole(cible, () => ({ assets, fxRates: undefined }));
        const avant = await cible.financeaiDiagnosticCourbe!();
        assets = [actifFictif('AAA', 3, 100, 1)];
        expect(await cible.financeaiDiagnosticCourbe!()).toEqual(diagnostiquerCourbe(assets, undefined));
        expect(avant).toEqual(diagnostiquerCourbe([], undefined));
    });

    it('ne mute pas l’état et ne laisse sortir ni quantité ni montant', async () => {
        const assets = [actifFictif('AAA', 12345, 987.65, 1)];
        const copie = JSON.stringify(assets);
        const cible: Cible = {};
        installerDiagnosticConsole(cible, () => ({ assets, fxRates: undefined }));
        const sortie = JSON.stringify(await cible.financeaiDiagnosticCourbe!());
        expect(JSON.stringify(assets)).toBe(copie);
        for (const interdit of ['12345', '987.65']) expect(sortie).not.toContain(interdit);
    });

    it('réinstaller remplace la commande sans erreur (rechargement à chaud)', () => {
        const cible: Cible = {};
        installerDiagnosticConsole(cible, () => ({ assets: [], fxRates: undefined }));
        expect(() => installerDiagnosticConsole(cible, () => ({ assets: [], fxRates: undefined }))).not.toThrow();
    });
});
