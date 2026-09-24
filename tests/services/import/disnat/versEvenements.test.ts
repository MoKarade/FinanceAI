// tests/services/import/disnat/versEvenements.test.ts
//
// [PTF-L1F-PARSEUR-DISNAT] Relevé lu → événements du grand livre. La preuve qui compte est la
// TRAVERSÉE : les événements produits, rejoués par `etatDuLivreAu`, rendent les quantités et
// l'encaisse que le relevé IMPRIME — sans reconstruire aucun maillon dans le test.
import { describe, it, expect } from 'vitest';
import { lireReleveDisnat } from '../../../../services/import/disnat/lireReleveDisnat';
import { versEvenements, type Correspondances } from '../../../../services/import/disnat/versEvenements';
import { etatDuLivreAu } from '../../../../services/grandLivre/etatDuLivre';
import { LIGNES, ISIN, DEVISE } from './fixtureReleve';

const correspondances = (detenu: Record<string, number> = { ZZ0000000015: 6 }): Correspondances => ({
    isinDe: (d) => ISIN[d],
    deviseDe: (isin) => DEVISE[isin],
    detenuAvant: (_compte, isin) => detenu[isin] ?? 0,
});

describe('[PTF-L1F] traduction', () => {
    const releve = lireReleveDisnat(LIGNES);
    const { evenements, refus } = versEvenements(releve, correspondances());

    it('toutes les opérations sont traduites, aucun refus', () => {
        expect(refus).toEqual([]);
        expect(evenements).toHaveLength(12);
    });

    it('le signe devient un `kind`, les montants deviennent positifs, dans la devise du COMPTE', () => {
        const parId = Object.fromEntries(evenements.map((e) => [e.id, e]));
        expect(parId['disnat:2026-01-31:courtier-cad:3']).toMatchObject({ kind: 'frais', amount: { value: 600, currency: 'CAD' } });
        expect(parId['disnat:2026-01-31:courtier-cad:5']).toMatchObject({
            kind: 'achat', isin: 'ZZ0000000013', quantity: 100,
            price: { value: 12.3995, currency: 'CAD' }, amount: { value: 1239.95, currency: 'CAD' },
        });
        expect(parId['disnat:2026-01-31:courtier-cad:6']).toMatchObject({ kind: 'retenue-etrangere', isin: 'ZZ0000000014', amount: { value: 3.15, currency: 'CAD' } });
        expect(parId['disnat:2026-01-31:courtier-usd:5']).toMatchObject({ kind: 'vente', price: { value: 150, currency: 'USD' }, amount: { value: 1490.05, currency: 'USD' } });
    });

    it('le fractionnement imprimé en quantité REÇUE devient un ratio (6 détenus + 54 reçus = 6 → 60)', () => {
        expect(evenements.find((e) => e.kind === 'fractionnement')).toMatchObject({ splitFrom: 6, splitTo: 60, isin: 'ZZ0000000015' });
    });

    it('identifiants stables : relire et retraduire le même relevé donne les mêmes événements', () => {
        expect(versEvenements(lireReleveDisnat(LIGNES), correspondances()).evenements).toEqual(evenements);
    });

    it('TRAVERSÉE : rejoué par le grand livre, le compte USD rend les quantités et l\'encaisse imprimées', () => {
        const etat = etatDuLivreAu(evenements, releve.dateArrete)!;
        expect(etat.anomalies).toEqual([]);
        // KAPPA : 6 transférés, ×10 par le fractionnement, 10 vendus → 50, la quantité du relevé.
        expect(etat.positions['courtier-usd']).toEqual({ ZZ0000000015: 50 });
        const releveUsd = releve.comptes.find((c) => c.compte === 'courtier-usd')!;
        expect(releveUsd.positions.find((p) => p.libelle.startsWith('KAPPA'))!.quantite).toBe(50);
        expect(etat.especes['courtier-usd']).toEqual({ USD: releveUsd.soldeFermeture! - releveUsd.soldeOuverture! });
    });
});

describe('[PTF-L1F] refus : rien n\'est deviné', () => {
    it('un titre absent du référentiel est refusé, la ligne nommée', () => {
        const { refus } = versEvenements(lireReleveDisnat(LIGNES), { ...correspondances(), isinDe: (d) => (d === 'GAMMA SA' ? undefined : ISIN[d]) });
        expect(refus.map((r) => r.type)).toEqual(['titre-inconnu', 'titre-inconnu']);
    });

    it('un montant au signe contraire à sa sorte est refusé (jamais une valeur absolue)', () => {
        const lignes = LIGNES.map((l) => (l === '15/01/2026 15/01/2026 FRAIS TRANSFERT EUROCLEAR/INTL -600,00' ? '15/01/2026 15/01/2026 FRAIS TRANSFERT EUROCLEAR/INTL 600,00' : l));
        const { evenements, refus } = versEvenements(lireReleveDisnat(lignes), correspondances());
        expect(refus).toEqual([{ type: 'signe-inattendu', ligne: lignes.indexOf('15/01/2026 15/01/2026 FRAIS TRANSFERT EUROCLEAR/INTL 600,00') + 1 }]);
        expect(evenements.some((e) => e.kind === 'frais')).toBe(false);
    });

    it('un fractionnement sur une position nulle est refusé (le ratio serait inventé)', () => {
        const { refus } = versEvenements(lireReleveDisnat(LIGNES), correspondances({}));
        expect(refus.map((r) => r.type)).toEqual(['fractionnement-sans-position']);
    });

    it('un achat dont la devise de cotation est inconnue est refusé', () => {
        const { refus } = versEvenements(lireReleveDisnat(LIGNES), { ...correspondances(), deviseDe: () => undefined });
        expect(refus.map((r) => r.type)).toEqual(['devise-de-cotation-inconnue', 'devise-de-cotation-inconnue']);
    });

    it('un montant imprimé sur un fractionnement ou un transfert reçu est refusé, jamais jeté', () => {
        const frac = '22/01/2026 21/01/2026 FRACTIONNEMENT D\'ACTIONS 54 KAPPA CORP';
        const trsf = '14/01/2026 08/01/2026 TRANSFERT REÇU 180 ALPHA ASIE UCITS';
        const lignes = LIGNES.map((l) => (l === frac ? `${frac} 8,40` : l === trsf ? `${trsf} -25,00` : l));
        const { evenements, refus } = versEvenements(lireReleveDisnat(lignes), correspondances());
        expect(refus).toEqual([
            { type: 'montant-non-traduit', ligne: LIGNES.indexOf(trsf) + 1 },
            { type: 'montant-non-traduit', ligne: LIGNES.indexOf(frac) + 1 },
        ]);
        expect(evenements.some((e) => e.kind === 'fractionnement' || e.kind === 'transfert-entrant' && e.isin === 'ZZ0000000011')).toBe(false);
    });

    it('une opération inconnue est refusée', () => {
        const lignes = [...LIGNES];
        lignes.splice(LIGNES.indexOf('CONV. EN CAD @ 1.36340') + 1, 0, '26/01/2026 26/01/2026 ÉCHANGE DE TITRES 20 GAMMA SA');
        const { refus } = versEvenements(lireReleveDisnat(lignes), correspondances());
        expect(refus.map((r) => r.type)).toEqual(['operation-inconnue']);
    });
});
