import { describe, it, expect } from 'vitest';
import { reperesAges } from '../../../components/retirement/AccumulationDecaissement';
import { agesJalons } from '../../../components/retirement/FluxRetraite';

const plage = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('[S5-REFONTE-RETRAITE] repères d\'âge et jalons', () => {
    it('âges repères : de 10 en 10 depuis le premier, le dernier toujours, sans chevauchement', () => {
        expect(reperesAges(plage(35, 75))).toEqual([35, 45, 55, 65, 75]);
        expect(reperesAges(plage(35, 92))).toEqual([35, 45, 55, 65, 75, 92]);
        expect(reperesAges([60])).toEqual([60]);
        expect(reperesAges([])).toEqual([]);
    });

    it('jalons du flux : départ, 65 ans s\'il est entre les deux, dernière année', () => {
        expect(agesJalons(plage(60, 92))).toEqual([60, 65, 92]);
        // Retraite après 65 : un jalon au milieu à la place.
        expect(agesJalons(plage(67, 92))).toEqual([67, 80, 92]);
        expect(agesJalons(plage(66, 70))).toEqual([66, 70]);
        expect(agesJalons([])).toEqual([]);
    });
});
