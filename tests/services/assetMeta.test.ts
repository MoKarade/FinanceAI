// tests/services/assetMeta.test.ts
//
// [INVEST-ALLOC-GEO-SECTOR] Résolution secteur/région (source unique des donuts Investissements) :
// le bug « tout en Autre » venait d'un lookup statique keyé préfixe place (« TSX:XXX ») face à des
// symboles réels suffixe (« XXX.TO ») + d'une table figée à 13 titres.

import { describe, it, expect } from 'vitest';
import { lookupSeedMeta, resolveAssetMeta } from '../../services/assetMeta';

describe('lookupSeedMeta (matching normalisé préfixe↔suffixe)', () => {
    it('clé exacte du seed (format préfixe place)', () => {
        expect(lookupSeedMeta('TSX:XAW')?.sector).toBe('Index');
    });
    it('[Bug signalé] symbole réel SUFFIXE matche le seed préfixe : XAW.TO → TSX:XAW', () => {
        // Avant : ASSET_META['XAW.TO'] === undefined → « Autre »/« Autre » même pour un titre du seed.
        expect(lookupSeedMeta('XAW.TO')?.sector).toBe('Index');
        expect(lookupSeedMeta('XAW.TO')?.region).toBe('Global');
        expect(lookupSeedMeta('MSFT')?.region).toBe('USA'); // NASDAQ:MSFT → MSFT
    });
    it('symbole inconnu → undefined (pas de valeur inventée)', () => {
        expect(lookupSeedMeta('INCONNU.XX')).toBeUndefined();
        expect(lookupSeedMeta('')).toBeUndefined();
    });
});

describe('resolveAssetMeta (priorités)', () => {
    it('1. champs PERSISTÉS de l\'actif priment (édition inline/auto-populate)', () => {
        const m = resolveAssetMeta({ symbol: 'XAW.TO', name: 'x', sector: 'Technologie', region: 'Asie', currentPrice: 1 });
        expect(m).toMatchObject({ sector: 'Technologie', region: 'Asie', source: 'asset' });
    });
    it('1b. champ PARTIEL : sector saisi seul → region complétée par le seed', () => {
        const m = resolveAssetMeta({ symbol: 'XAW.TO', name: 'x', sector: 'Technologie', currentPrice: 1 });
        expect(m.sector).toBe('Technologie');
        expect(m.region).toBe('Global'); // du seed TSX:XAW
    });
    it('2. seed normalisé quand aucun champ', () => {
        const m = resolveAssetMeta({ symbol: 'ZSP.TO', name: 'x', currentPrice: 1 });
        expect(m).toMatchObject({ sector: 'Index', region: 'USA', source: 'seed' });
    });
    it('2b. titre hors seed : pas de sur-matching entre places (même ticker, autre bourse)', () => {
        const m = resolveAssetMeta({ symbol: 'ZLIM.PA', name: 'x', currentPrice: 1 });
        expect(m).toMatchObject({ sector: 'Autre', region: 'Autre', source: 'unknown' });
    });
    it('3. crypto connue → Crypto/Global par construction', () => {
        const m = resolveAssetMeta({ symbol: 'BTC-CAD', name: 'x', currentPrice: 1 });
        expect(m).toMatchObject({ sector: 'Crypto', region: 'Global', source: 'crypto' });
    });
    it('4. inconnu → Autre/Autre honnête (éditable), source unknown', () => {
        const m = resolveAssetMeta({ symbol: 'ZZZZ.XX', name: 'Mystère', currentPrice: 1 });
        expect(m).toMatchObject({ sector: 'Autre', region: 'Autre', source: 'unknown', name: 'Mystère' });
    });
});
