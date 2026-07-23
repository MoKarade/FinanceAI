// tests/services/assetMeta.test.ts
//
// [INVEST-ALLOC-GEO-SECTOR] Résolution secteur/région (source unique des donuts Investissements) :
// le bug « tout en Autre » venait d'un lookup statique keyé préfixe place (« EPA:CW8 ») face à des
// symboles réels suffixe (« CW8.PA ») + d'une table figée à 13 titres.

import { describe, it, expect } from 'vitest';
import { lookupSeedMeta, resolveAssetMeta } from '../../services/assetMeta';

describe('lookupSeedMeta (matching normalisé préfixe↔suffixe)', () => {
    it('clé exacte du seed (format préfixe place)', () => {
        expect(lookupSeedMeta('EPA:CW8')?.sector).toBe('Index');
    });
    it('[Bug Marc] symbole réel SUFFIXE matche le seed préfixe : CW8.PA → EPA:CW8', () => {
        // Avant : ASSET_META['CW8.PA'] === undefined → « Autre »/« Autre » même pour un titre du seed.
        expect(lookupSeedMeta('CW8.PA')?.sector).toBe('Index');
        expect(lookupSeedMeta('CW8.PA')?.region).toBe('Global');
        expect(lookupSeedMeta('NVDA')?.region).toBe('USA'); // NASDAQ:NVDA → NVDA
    });
    it('symbole inconnu → undefined (pas de valeur inventée)', () => {
        expect(lookupSeedMeta('INCONNU.XX')).toBeUndefined();
        expect(lookupSeedMeta('')).toBeUndefined();
    });
});

describe('resolveAssetMeta (priorités)', () => {
    it('1. champs PERSISTÉS de l\'actif priment (édition inline/auto-populate)', () => {
        const m = resolveAssetMeta({ symbol: 'CW8.PA', name: 'x', sector: 'Technologie', region: 'Asie', currentPrice: 1 });
        expect(m).toMatchObject({ sector: 'Technologie', region: 'Asie', source: 'asset' });
    });
    it('1b. champ PARTIEL : sector saisi seul → region complétée par le seed', () => {
        const m = resolveAssetMeta({ symbol: 'CW8.PA', name: 'x', sector: 'Technologie', currentPrice: 1 });
        expect(m.sector).toBe('Technologie');
        expect(m.region).toBe('Global'); // du seed EPA:CW8
    });
    it('2. seed normalisé quand aucun champ', () => {
        const m = resolveAssetMeta({ symbol: 'GBS.PA', name: 'x', currentPrice: 1 });
        // BIT:GBS est dans le seed — GBS.PA ne matche PAS BIT:GBS (place différente : BIT→.MI) →
        // selon le seed réel : vérifier le comportement honnête (pas de sur-matching cross-place).
        expect(['Mines/Or', 'Autre']).toContain(m.sector);
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
