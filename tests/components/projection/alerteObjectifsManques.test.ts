// tests/components/projection/alerteObjectifsManques.test.ts
// [ENG-GOALSHORTFALLS-EXPOSE] La dérivation PURE du bandeau « objectif non financé ».
import { describe, it, expect } from 'vitest';
import { construireAlerteObjectifsManques } from '../../../components/projection/alerteObjectifsManques';

describe('[ENG-GOALSHORTFALLS-EXPOSE] construireAlerteObjectifsManques', () => {
    it('champ absent (gel d\'avant PV-11, scénario réduit) → null, jamais un 0 $ crédible', () => {
        expect(construireAlerteObjectifsManques(undefined)).toBeNull();
        expect(construireAlerteObjectifsManques(null)).toBeNull();
    });

    it('aucun objectif touché → null (l\'absence de problème n\'est pas un état à afficher)', () => {
        expect(construireAlerteObjectifsManques({ count: 0, total: 0 })).toBeNull();
        // ⚠️ Fixture qui isole la garde du COMPTE : total > 1 $ pour que la garde du montant ne
        // puisse pas rattraper un count 0 — sinon la perturber resterait vert (mesuré : retirer
        // `count <= 0` était MUET sur {0, 0}, la garde voisine saturait la contrainte).
        expect(construireAlerteObjectifsManques({ count: 0, total: 500 })).toBeNull();
    });

    it('entrées sales → null (count non fini, total non fini, manque sous le dollar)', () => {
        expect(construireAlerteObjectifsManques({ count: Number.NaN, total: 5_000 })).toBeNull();
        expect(construireAlerteObjectifsManques({ count: 2, total: Number.NaN })).toBeNull();
        // count > 0 mais manque arrondi à 0 $ : « il a manqué 0 $ » n'alerte de rien.
        expect(construireAlerteObjectifsManques({ count: 1, total: 0 })).toBeNull();
    });

    it('un objectif → singulier, montant porté en DONNÉE (jamais interpolé dans la phrase)', () => {
        const a = construireAlerteObjectifsManques({ count: 1, total: 12_500 });
        expect(a).not.toBeNull();
        expect(a!.libelle).toBe('Un objectif n\'a pas pu être financé en entier');
        expect(a!.montant).toBe(12_500);
        // Le libellé ne contient AUCUN chiffre : le montant reste un nœud masquable au rendu.
        expect(a!.libelle).not.toMatch(/\d/);
    });

    it('plusieurs objectifs → pluriel avec le compte', () => {
        const a = construireAlerteObjectifsManques({ count: 3, total: 40_000 });
        expect(a!.libelle).toBe('3 objectifs n\'ont pas pu être financés en entier');
        expect(a!.count).toBe(3);
    });
});
