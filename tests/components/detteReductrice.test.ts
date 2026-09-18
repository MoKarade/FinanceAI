/**
 * [INFOBULLE-DETTE-NW-NON-FINI] `detteReductrice` — la dette qui tire le patrimoine net SOUS la
 * somme des actifs affichés, testée CHEZ ELLE.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE, et c'est une affirmation FAUSSE que j'avais écrite : le test de
 * rendu du panneau (`tests/components/future/panneauRecomposition.test.tsx`) disait
 * « `detteReductrice` est déjà testée chez elle ». Mesuré par la revue : **aucun fichier de
 * `tests/` n'importait `futureDetail/comptes`** — il n'existait aucun test unitaire de cette
 * fonction, et le seul garant était un test de RENDU, qui ne peut pas explorer les cas limites de
 * la dérivation sans monter un composant entier. Une phrase de couverture se vérifie comme un
 * chiffre : le commentaire est corrigé là-bas, et la couverture qu'il annonçait existe ici.
 *
 * Ce que la fonction promet : `NetWorth = Σ(actifs affichés) − dette`, donc
 * `dette = max(0, Σ actifs − NetWorth)` — et `null` dès que cette identité ne peut PAS être
 * calculée honnêtement.
 */
import { describe, it, expect } from 'vitest';
import { detteReductrice } from '../../components/projection/futureDetail/comptes';

const CLES = ['Liquidites', 'CELI', 'REER', 'NonReg'] as const;

describe('[INFOBULLE-DETTE-NW-NON-FINI] detteReductrice — la dérivation', () => {
    it('rend Σ actifs − valeur nette', () => {
        expect(detteReductrice({ Liquidites: 12_000, CELI: 90_000, REER: 210_000, NonReg: 45_000, NetWorth: 310_000 }, CLES)).toBe(47_000);
    });

    it('rend 0 quand la valeur nette couvre les actifs (pas de dette)', () => {
        expect(detteReductrice({ CELI: 100_000, NetWorth: 100_000 }, CLES)).toBe(0);
    });

    it('ne rend JAMAIS de négatif : une valeur nette supérieure aux actifs affichés est bornée à 0', () => {
        // Cas réel : un actif que la liste n'affiche pas (immobilier hors des clés passées).
        expect(detteReductrice({ CELI: 100_000, NetWorth: 400_000 }, CLES)).toBe(0);
    });

    it('une clé ABSENTE est légitime — « pas de compte de ce type », pas « donnée perdue »', () => {
        // ⚠️ `REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION` : refuser ici ferait crier l'écran sur le cas
        // NOMINAL de quiconque n'a pas de crypto. Même résultat qu'avec la clé à zéro.
        expect(detteReductrice({ CELI: 90_000, NetWorth: 50_000 }, CLES)).toBe(40_000);
        expect(detteReductrice({ CELI: 90_000, Liquidites: 0, REER: 0, NonReg: 0, NetWorth: 50_000 }, CLES)).toBe(40_000);
    });

    /**
     * ⚠️ LE CAS QUI COÛTAIT DE L'ARGENT. Avant le correctif, `Number(point.NetWorth) || 0` rabattait
     * un non-fini sur ZÉRO — et la soustraction rendait alors la somme TOTALE des actifs, affichée
     * sous le libellé « Dettes (hors hypothèque) ». Un montant faux et parfaitement crédible, sans
     * trace, dans les deux surfaces qui appellent cette fonction.
     */
    it.each([
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['-Infinity', Number.NEGATIVE_INFINITY],
        ['absente', undefined],
        ['une chaîne', 'beaucoup'],
    ])('valeur nette %s : REFUS (null), jamais la somme des actifs', (_nom, nw) => {
        expect(detteReductrice({ Liquidites: 12_000, CELI: 90_000, NetWorth: nw }, CLES)).toBeNull();
    });

    /**
     * ⚠️ L'AUTRE MOITIÉ, et elle va dans le SENS INVERSE — c'est celle qu'on oublie. Une clé d'actif
     * PRÉSENTE mais non finie rend la somme AMPUTÉE, donc la dette SURÉVALUÉE du montant du compte
     * illisible : ici 210 000 $ de REER perdus feraient annoncer 257 000 $ de dette au lieu de
     * 47 000 $.
     */
    it.each([
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['une chaîne', 'beaucoup'],
    ])('un COMPTE %s : REFUS (null), jamais une dette gonflée du compte perdu', (_nom, reer) => {
        expect(detteReductrice({ Liquidites: 12_000, CELI: 90_000, REER: reer, NonReg: 45_000, NetWorth: 310_000 }, CLES)).toBeNull();
    });

    // ⚠️ ANTI-VACUITÉ des deux blocs ci-dessus : sans ce contrôle, un `null` rendu pour TOUTE entrée
    // (une fonction cassée en amont) les laisserait tous verts. Le cas sain doit rester un NOMBRE.
    it('le cas sain reste un nombre — les refus ci-dessus ne sont pas un « null » universel', () => {
        const sain = detteReductrice({ Liquidites: 12_000, CELI: 90_000, REER: 210_000, NonReg: 45_000, NetWorth: 310_000 }, CLES);
        expect(typeof sain).toBe('number');
        expect(sain).toBeGreaterThan(0);
    });

    it('aucune clé d’actif à sommer : la dette est l’opposé borné de la valeur nette', () => {
        // Contrat explicite plutôt que comportement subi : avec une liste VIDE, Σ actifs = 0.
        expect(detteReductrice({ NetWorth: -5_000 }, [])).toBe(5_000);
        expect(detteReductrice({ NetWorth: 5_000 }, [])).toBe(0);
    });
});
