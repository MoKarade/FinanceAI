// tests/services/import/disnat/lireReleveDisnat.test.ts
//
// [PTF-L1F-PARSEUR-DISNAT] Lecture d'un relevé Disnat. Données ENTIÈREMENT FICTIVES (voir
// `fixtureReleve.ts`) ; chaque cas nomme le piège de l'ancien parseur qu'il ferme.
import { describe, it, expect } from 'vitest';
import { lireReleveDisnat, type CompteReleve } from '../../../../services/import/disnat/lireReleveDisnat';
import { LIGNES } from './fixtureReleve';

const compte = (c: string): CompteReleve => {
    const r = lireReleveDisnat(LIGNES).comptes.find((x) => x.compte === c);
    if (!r) throw new Error(`compte ${c} absent`);
    return r;
};
/** Remplace la PREMIÈRE ligne qui vaut `avant` : une perturbation ciblée du relevé. */
const avec = (avant: string, apres: string | null): string[] => {
    const i = LIGNES.indexOf(avant);
    if (i < 0) throw new Error(`ligne absente de la fixture : ${avant}`);
    const out = [...LIGNES];
    if (apres === null) out.splice(i, 1); else out[i] = apres;
    return out;
};

describe('[PTF-L1F] relevé sain', () => {
    const r = lireReleveDisnat(LIGNES);

    it('date d\'arrêté, taux de la page 1, deux comptes, aucune anomalie', () => {
        expect(r.dateArrete).toBe('2026-01-31');
        expect(r.tauxUsdCad).toBe(1.35612);
        expect(r.comptes.map((c) => c.compte)).toEqual(['courtier-cad', 'courtier-usd']);
        expect(r.anomalies).toEqual([]);
    });

    it('soldes d\'ouverture et de fermeture, les deux lus (le recoupement de l\'encaisse en dépend)', () => {
        expect(compte('courtier-cad')).toMatchObject({ soldeOuverture: 1000, soldeFermeture: 419.5 });
        expect(compte('courtier-usd')).toMatchObject({ soldeOuverture: 0, soldeFermeture: 1499.74 });
    });

    it('activité : sortes, quantités, prix et montants signés, montants à milliers compris', () => {
        const ops = compte('courtier-cad').operations.map((o) => [o.sorte, o.quantite, o.prix, o.montant, o.description]);
        expect(ops).toEqual([
            ['transfert-recu', 180, undefined, undefined, 'ALPHA ASIE UCITS'],
            ['transfert-recu', 42, undefined, undefined, 'ALPHA MONDE UCITS'],
            ['frais', undefined, undefined, -600, 'TRANSFERT EUROCLEAR/INTL'],
            ['depot', undefined, undefined, 1250, 'REÇU D\'UNE CAISSE'],
            ['achat', 100, 12.3995, -1239.95, 'BETA CDR C$HDG'],
            ['impot-non-resident', 20, undefined, -3.15, 'GAMMA SA'],
            ['dividende', 20, undefined, 12.6, 'GAMMA SA'],
        ]);
        expect(compte('courtier-cad').operations[0]).toMatchObject({ dateTransaction: '2026-01-14', dateReglement: '2026-01-08' });
    });

    it('un SAUT DE PAGE au milieu de l\'activité n\'est pas la suite de l\'opération (piège de l\'ancien parseur)', () => {
        const achat = compte('courtier-cad').operations[4];
        expect(achat.suite).toEqual(['INTERNET DIRECT/STP']);
        // Contrôle : les deux opérations d'APRÈS le saut de page sont bien lues.
        expect(compte('courtier-cad').operations).toHaveLength(7);
    });

    it('la ligne « ENCAISSE » est lue et recoupe la fermeture (l\'ancien parseur la perdait)', () => {
        expect(compte('courtier-usd').encaisseDetail).toBe(1499.74);
        expect(compte('courtier-cad').encaisseDetail).toBeUndefined();
    });

    it('la conversion imprimée en suite est gardée avec son taux', () => {
        expect(compte('courtier-cad').operations[6]).toMatchObject({ sorte: 'dividende', tauxConversion: 1.3634, suite: ['CONV. EN CAD @ 1.36340'] });
    });

    it('positions : AUCUNE perdue après un « Total » de catégorie, AUCUNE lue deux fois sur la page « suite »', () => {
        expect(compte('courtier-cad').positions.map((p) => [p.libelle, p.quantite])).toEqual([
            ['ALPHA ASIE UCITS ALAS', 180],
            ['ALPHA MONDE UCITS', 42],
            ['GOLD LINGOTS ETC', 115],
            ['GAMMA SA GAMA', 20],
            ['BETA CDR C$HDG BETA', 100],
        ]);
        expect(compte('courtier-usd').positions.map((p) => [p.libelle, p.quantite])).toEqual([
            ['KAPPA CORP KAPA', 50],
            ['DELTA NOUVELLE EMISSION DLT', 10],
        ]);
    });

    it('la quantité qui COLLE à un coût à milliers est tranchée par le recoupement du coût comptable', () => {
        // « 42 1 011,2657 42 473,16 » : lu 1 011,2657 × 42 (et non 11,2657 × 1 ni un « 421 » quelconque).
        expect(compte('courtier-cad').positions[1]).toMatchObject({ quantite: 42, coutUnitaire: 1011.2657, coutComptable: 42473.16 });
    });

    it('indicateur ² imprimé sur la ligne d\'avant, prix « * », devise, coût « ND »', () => {
        const [asie, monde, gold] = compte('courtier-cad').positions;
        expect(asie).toMatchObject({ indicateur: 2, prixIncertain: true, devise: 'USD', prixMarche: 51.864, valeurMarchande: 12660.09 });
        expect(monde).toMatchObject({ indicateur: 2, prixIncertain: false, devise: 'CAD' });
        expect(gold.indicateur).toBeUndefined();
        const delta = compte('courtier-usd').positions[1];
        expect(delta.coutUnitaire).toBeUndefined();
        expect(delta.coutComptable).toBeUndefined();
    });
});

describe('[PTF-L1F] rien ne disparaît en silence', () => {
    it('un montant mal lu ne passe pas le recoupement de l\'encaisse', () => {
        const r = lireReleveDisnat(avec('25/01/2026 25/01/2026 DIVIDENDE 20 GAMMA SA 12,60', '25/01/2026 25/01/2026 DIVIDENDE 20 GAMMA SA 12,50'));
        expect(r.anomalies).toEqual([{ type: 'encaisse-non-recoupee', compte: 'courtier-cad' }]);
    });

    it('une ligne « ENCAISSE » qui ne vaut pas la fermeture est signalée', () => {
        const r = lireReleveDisnat(avec('ENCAISSE 1 499,74 1 499,74 0,59', 'ENCAISSE 1 499,74 1 409,74 0,59'));
        expect(r.anomalies).toEqual([{ type: 'encaisse-detail-non-recoupee', compte: 'courtier-usd' }]);
    });

    it('une ligne d\'activité PERDUE ne passe pas non plus', () => {
        const r = lireReleveDisnat(avec('20/01/2026 20/01/2026 RETENUE D\'IMPÔT 6 KAPPA CORP -1,71', null));
        expect(r.anomalies).toEqual([{ type: 'encaisse-non-recoupee', compte: 'courtier-usd' }]);
    });

    it('un coût comptable qui ne recoupe aucun découpage → refusé, jamais deviné', () => {
        const r = lireReleveDisnat(avec(
            'GAMMA SA GAMA 20 530,2730 10 605,46 488,1610 9 763,22 4,42 C',
            'GAMMA SA GAMA 20 530,2730 10 999,46 488,1610 9 763,22 4,42 C',
        ));
        expect(r.anomalies).toHaveLength(1);
        expect(r.anomalies[0].type).toBe('cout-non-recoupe');
        expect(compte('courtier-cad').positions).toHaveLength(5);
        expect(r.comptes[0].positions).toHaveLength(4);
    });

    it('une ligne de position illisible est nommée par son NUMÉRO, jamais par son texte', () => {
        const r = lireReleveDisnat(avec('KAPPA CORP KAPA 50 132,4590 6 622,95 142,7010 USD 9 675,99 4,38 C', 'KAPPA CORP KAPA 50 PRIX INCONNU X'));
        const ligne = LIGNES.indexOf('KAPPA CORP KAPA 50 132,4590 6 622,95 142,7010 USD 9 675,99 4,38 C') + 1;
        expect(r.anomalies).toEqual([{ type: 'ligne-illisible', ligne, section: 'positions' }]);
        expect(JSON.stringify(r.anomalies)).not.toMatch(/KAPPA/);
    });

    it('un compte d\'un AUTRE type n\'est pas deviné, et ses lignes ne se mêlent pas au suivant', () => {
        const r = lireReleveDisnat(avec('Profil de votre compte comptant USD - 0000000B1', 'Profil de votre compte REER - 0000000C1'));
        expect(r.comptes.map((c) => c.compte)).toEqual(['courtier-cad']);
        expect(r.anomalies[0].type).toBe('compte-inconnu');
    });

    it('un compte sans sa ligne de fin est signalé (sinon ses positions pourraient déborder sur le suivant)', () => {
        const r = lireReleveDisnat(avec('Valeur totale de votre compte comptant USD - 0000000B1 6 622,95 9 743,79 4,41', null));
        expect(r.anomalies).toEqual([{ type: 'compte-non-ferme', compte: 'courtier-usd' }]);
    });

    it('une opération inconnue est GARDÉE telle quelle (sorte nulle), jamais rapprochée d\'une connue', () => {
        const ligne = '26/01/2026 26/01/2026 ÉCHANGE DE TITRES 20 GAMMA SA';
        const lignes = [...LIGNES];
        lignes.splice(LIGNES.indexOf('CONV. EN CAD @ 1.36340') + 1, 0, ligne);
        const op = lireReleveDisnat(lignes).comptes[0].operations[7];
        expect(op).toMatchObject({ sorte: null, libelle: 'ÉCHANGE' });
    });

    it('sans date d\'arrêté, le relevé le dit', () => {
        expect(lireReleveDisnat(LIGNES.filter((l) => !l.startsWith('Au '))).anomalies).toContainEqual({ type: 'date-arrete-introuvable' });
    });
});
