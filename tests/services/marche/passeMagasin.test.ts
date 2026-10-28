// tests/services/marche/passeMagasin.test.ts
//
// [PTF-L1C2-PASSE] La passe du magasin de marché : budget, rattrapage, essai à blanc, refus, rapport.
// Données SYNTHÉTIQUES (ISIN au préfixe non attribué `ZZ`, symboles et cours inventés). Aucun réseau :
// les lectures sont des doublures qui enregistrent leurs appels.
import { describe, it, expect } from 'vitest';
import type { LectureSerieSource, PointCoursLu } from '../../../services/marche/clientsMarche';
import { magasinVide, type DeviseTaux, type MagasinMarche, type PointTaux } from '../../../services/marche/magasinMarche';
import {
    executerPasseMagasin, type CibleCloture, type LecteursMarche, type OptionsPasse,
} from '../../../services/marche/passeMagasin';

// 2026-01-09 est un vendredi ; 2026-01-11 un dimanche.
const VENDREDI = '2026-01-09';
const DIMANCHE = '2026-01-11';
const MAJ = '2026-01-08T21:00:00.000Z';
const MAINTENANT = '2026-01-09T22:00:00.000Z';
const opts = (o: Partial<OptionsPasse> = {}): OptionsPasse => ({ aujourdhui: VENDREDI, maintenant: MAINTENANT, ...o });

// Un ISIN valide : 2 lettres + 9 alphanumériques + 1 chiffre.
const isinDe = (n: number): string => `ZZ${String(n).padStart(9, '0')}0`;
const titre = (n: number, devise: CibleCloture['devise'] = 'USD'): CibleCloture =>
    ({ isin: isinDe(n), symboleEodhd: `AAA${n}.US`, devise });

const ok = <P,>(points: P[], ecartes = 0): LectureSerieSource<P> => ({ statut: 'ok', points, ecartes });

interface Appels { clotures: Array<{ symbole: string; du: string; au: string }>; taux: Array<{ devise: DeviseTaux; du: string; au: string }> }

function lecteurs(
    clotures: (symbole: string, du: string, au: string) => Promise<LectureSerieSource<PointCoursLu>>,
    taux: (devise: DeviseTaux, du: string, au: string) => Promise<LectureSerieSource<PointTaux>> = async () => ok([]),
): { l: LecteursMarche; appels: Appels } {
    const appels: Appels = { clotures: [], taux: [] };
    return {
        appels,
        l: {
            lireClotures: (symbole, du, au) => { appels.clotures.push({ symbole, du, au }); return clotures(symbole, du, au); },
            lireTaux: (devise, du, au) => { appels.taux.push({ devise, du, au }); return taux(devise, du, au); },
        },
    };
}

const avecSerie = (n: number, points: MagasinMarche['clotures'][string]['points'], devise: CibleCloture['devise'] = 'USD'): MagasinMarche => ({
    ...magasinVide(MAJ),
    clotures: { [isinDe(n)]: { devise, points } },
});

function geler<T>(o: T): T {
    if (o !== null && typeof o === 'object') { Object.values(o).forEach(geler); Object.freeze(o); }
    return o;
}

describe('[PTF-L1C2] clôtures : rattrapage', () => {
    it('une série vide est lue depuis la limite de l’historique du plan, puis écrite avec la source eodhd', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-08', 100.5], ['2026-01-09', 101.25]]));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1)], l, opts());
        expect(appels.clotures).toEqual([{ symbole: 'AAA1.US', du: '2025-01-09', au: VENDREDI }]);
        expect(r.magasin.clotures[isinDe(1)]).toEqual({
            devise: 'USD', points: [['2026-01-08', 100.5, 'eodhd'], ['2026-01-09', 101.25, 'eodhd']],
        });
        expect(r.magasin.majLe).toBe(MAINTENANT);
        expect(r.modifie).toBe(true);
        expect(r.rapport.clotures).toMatchObject({ cibles: 1, appels: 1, ajouts: 2, revisions: 0 });
    });

    it('une série en retard est relue AU dernier point (recouvrement d’un jour) ; le recouvrement identique n’est pas compté', async () => {
        const m = avecSerie(1, [['2026-01-05', 100, 'eodhd'], ['2026-01-06', 101, 'eodhd']]);
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-06', 101], ['2026-01-07', 102], ['2026-01-08', 103]]));
        const r = await executerPasseMagasin(m, [titre(1)], l, opts());
        expect(appels.clotures[0]).toMatchObject({ du: '2026-01-06', au: VENDREDI });
        expect(r.magasin.clotures[isinDe(1)].points.map((p) => p[0])).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']);
        expect(r.rapport.clotures).toMatchObject({ ajouts: 2, revisions: 0 });
    });

    it('une révision de la source sur le jour de recouvrement est vue et comptée', async () => {
        const m = avecSerie(1, [['2026-01-08', 100, 'eodhd']]);
        const { l } = lecteurs(async () => ok<PointCoursLu>([['2026-01-08', 99.5], ['2026-01-09', 101]]));
        const r = await executerPasseMagasin(m, [titre(1)], l, opts());
        expect(r.rapport.clotures).toMatchObject({ ajouts: 1, revisions: 1 });
        expect(r.magasin.clotures[isinDe(1)].points[0]).toEqual(['2026-01-08', 99.5, 'eodhd']);
    });

    it('un point de secours est promu par le point officiel de la même date', async () => {
        const m = avecSerie(1, [['2026-01-08', 100, 'yahoo']]);
        const { l } = lecteurs(async () => ok<PointCoursLu>([['2026-01-08', 100.2]]));
        const r = await executerPasseMagasin(m, [titre(1)], l, opts());
        expect(r.rapport.clotures.promotions).toBe(1);
        expect(r.magasin.clotures[isinDe(1)].points[0]).toEqual(['2026-01-08', 100.2, 'eodhd']);
    });

    it('un week-end ne coûte aucun appel : aucune séance n’a pu paraître depuis le vendredi', async () => {
        const m = avecSerie(1, [['2026-01-09', 100, 'eodhd']]);
        const { l, appels } = lecteurs(async () => { throw new Error('ne doit pas être appelé'); });
        const r = await executerPasseMagasin(m, [titre(1)], l, opts({ aujourdhui: DIMANCHE }));
        expect(appels.clotures).toEqual([]);
        expect(r.rapport.clotures).toMatchObject({ sansBesoin: 1, appels: 0 });
        expect(r.modifie).toBe(false);
    });

    it('un historique plus vieux que le plan gratuit : la fenêtre est tronquée à la limite, et c’est compté', async () => {
        const m = avecSerie(1, [['2024-01-02', 90, 'eodhd']]);
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 101]]));
        const r = await executerPasseMagasin(m, [titre(1)], l, opts());
        expect(appels.clotures[0].du).toBe('2025-01-09');
        expect(r.rapport.clotures.fenetresTronquees).toBe(1);
    });

    it('les points datés d’après le jour de la passe sont écartés (une source ne publie pas le futur)', async () => {
        const { l } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 101], ['2026-01-12', 150]], 1));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1)], l, opts());
        expect(r.magasin.clotures[isinDe(1)].points).toEqual([['2026-01-09', 101, 'eodhd']]);
        expect(r.rapport.clotures.ecartes).toBe(2);
    });
});

describe('[PTF-L1C2] budget', () => {
    const m3: MagasinMarche = {
        ...magasinVide(MAJ),
        clotures: {
            [isinDe(1)]: { devise: 'USD', points: [['2026-01-08', 100, 'eodhd']] },   // retard 1 jour
            [isinDe(2)]: { devise: 'USD', points: [['2026-01-02', 100, 'eodhd']] },   // retard 7 jours
            [isinDe(3)]: { devise: 'USD', points: [['2026-01-05', 100, 'eodhd']] },   // retard 4 jours
        },
    };

    it('la série la plus en retard passe d’abord ; ce qui dépasse le budget est reporté et compté', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 101]]));
        const r = await executerPasseMagasin(m3, [titre(1), titre(2), titre(3)], l, opts({ budgetAppelsEodhd: 2 }));
        expect(appels.clotures.map((a) => a.symbole)).toEqual(['AAA2.US', 'AAA3.US']);
        expect(r.rapport.clotures).toMatchObject({ appels: 2, reportes: 1 });
    });

    it('une série jamais lue passe avant toutes les autres', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 101]]));
        await executerPasseMagasin(m3, [titre(1), titre(2), titre(4)], l, opts({ budgetAppelsEodhd: 1 }));
        expect(appels.clotures.map((a) => a.symbole)).toEqual(['AAA4.US']);
    });

    it('un budget de zéro n’appelle rien et reporte tout', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([]));
        const r = await executerPasseMagasin(m3, [titre(1), titre(2)], l, opts({ budgetAppelsEodhd: 0 }));
        expect(appels.clotures).toEqual([]);
        expect(r.rapport.clotures).toMatchObject({ appels: 0, reportes: 2 });
    });

    it('à retard égal, l’ordre est celui des ISIN (stable d’une passe à l’autre)', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([]));
        await executerPasseMagasin(magasinVide(MAJ), [titre(7), titre(3), titre(5)], l, opts({ budgetAppelsEodhd: 3 }));
        expect(appels.clotures.map((a) => a.symbole)).toEqual(['AAA3.US', 'AAA5.US', 'AAA7.US']);
    });
});

describe('[PTF-L1C2] cibles en double et points de secours', () => {
    it('un ISIN répété avec la même devise n’est lu et compté qu’une fois (le budget n’est pas dépensé deux fois)', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 101]]));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1), titre(1), titre(2)], l, opts({ budgetAppelsEodhd: 2 }));
        expect(appels.clotures.map((a) => a.symbole).sort()).toEqual(['AAA1.US', 'AAA2.US']);
        expect(r.rapport.clotures).toMatchObject({ cibles: 3, doublons: 1, appels: 2, reportes: 0 });
    });

    it('un ISIN donné avec deux devises est une entrée contradictoire : refusée en entier, aucun appel', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 101]]));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1, 'USD'), titre(1, 'EUR')], l, opts());
        expect(appels).toEqual({ clotures: [], taux: [] });
        expect(r.rapport.clotures).toMatchObject({ devisesEnConflit: 1, appels: 0 });
        expect(r.rapport.taux.appels).toBe(0);
    });

    it('un point de secours daté du jour est relu et promu même sans séance attendue', async () => {
        const m = avecSerie(1, [['2026-01-09', 100, 'yahoo']]);
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 100.2]]));
        const r = await executerPasseMagasin(m, [titre(1)], l, opts({ aujourdhui: DIMANCHE }));
        expect(appels.clotures[0]).toMatchObject({ du: '2026-01-09', au: DIMANCHE });
        expect(r.rapport.clotures.promotions).toBe(1);
        expect(r.magasin.clotures[isinDe(1)].points[0]).toEqual(['2026-01-09', 100.2, 'eodhd']);
    });

    it('la relecture part du plus ancien point de secours encore écrit', async () => {
        const m = avecSerie(1, [['2026-01-05', 100, 'yahoo'], ['2026-01-06', 101, 'eodhd'], ['2026-01-08', 102, 'eodhd']]);
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-05', 100.1]]));
        await executerPasseMagasin(m, [titre(1)], l, opts());
        expect(appels.clotures[0].du).toBe('2026-01-05');
    });
});

describe('[PTF-L1C2] essai à blanc', () => {
    it('rend le même plan qu’en vrai, sans appeler, sans rien changer', async () => {
        const m = avecSerie(1, [['2026-01-02', 100, 'eodhd']]);
        const { l, appels } = lecteurs(async () => { throw new Error('ne doit pas être appelé'); });
        const r = await executerPasseMagasin(m, [titre(1), titre(2)], l, opts({ essaiABlanc: true, budgetAppelsEodhd: 1 }));
        expect(appels).toEqual({ clotures: [], taux: [] });
        expect(r.rapport.essaiABlanc).toBe(true);
        expect(r.rapport.clotures).toMatchObject({ appels: 1, reportes: 1 });
        expect(r.rapport.taux.appels).toBe(1);
        expect(r.modifie).toBe(false);
        expect(r.magasin).toBe(m);
    });
});

describe('[PTF-L1C2] refus, jamais réparation', () => {
    it('une devise de cotation en conflit avec le magasin : aucun appel, série laissée telle quelle', async () => {
        const m = avecSerie(1, [['2026-01-02', 100, 'eodhd']], 'CAD');
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 5]]));
        const r = await executerPasseMagasin(m, [titre(1, 'USD')], l, opts());
        expect(appels.clotures).toEqual([]);
        expect(r.rapport.clotures.devisesEnConflit).toBe(1);
        expect(r.magasin).toBe(m);
    });

    it('une réponse illisible est comptée sans être citée, la série reste inchangée', async () => {
        const m = avecSerie(1, [['2026-01-02', 100, 'eodhd']]);
        const { l } = lecteurs(async () => ({ statut: 'erreur', forme: 'une chaîne (message d’erreur de la source ?)' }));
        const r = await executerPasseMagasin(m, [titre(1)], l, opts());
        expect(r.rapport.clotures.reponsesIllisibles).toBe(1);
        expect(r.modifie).toBe(false);
        expect(JSON.stringify(r.rapport)).not.toContain('message d’erreur');
    });

    it('un échec réseau sur un titre n’empêche pas les autres, et le message n’est pas repris', async () => {
        const { l } = lecteurs(async (symbole) => {
            if (symbole === 'AAA1.US') throw new Error('https://eodhd.com/api/eod/AAA1.US?api_token=SECRET');
            return ok<PointCoursLu>([['2026-01-09', 101]]);
        });
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1), titre(2)], l, opts());
        expect(r.rapport.clotures).toMatchObject({ echecsReseau: 1, ajouts: 1 });
        expect(Object.keys(r.magasin.clotures)).toEqual([isinDe(2)]);
        expect(JSON.stringify(r.rapport)).not.toContain('SECRET');
    });
});

describe('[PTF-L1C2] taux de la Banque du Canada', () => {
    it('une devise étrangère détenue demande ses taux ; le dollar canadien n’en demande pas', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([]), async () => ok<PointTaux>([['2026-01-08', 1.36], ['2026-01-09', 1.37]]));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1, 'USD'), titre(2, 'CAD')], l, opts());
        expect(appels.taux).toEqual([{ devise: 'USD', du: '2025-01-09', au: VENDREDI }]);
        expect(r.magasin.taux.USD).toEqual([['2026-01-08', 1.36], ['2026-01-09', 1.37]]);
        expect(r.rapport.taux).toMatchObject({ appels: 1, ajouts: 2 });
    });

    it('le début de l’historique des taux est réglable (le moteur de courbes en a besoin plus loin)', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([]));
        await executerPasseMagasin(magasinVide(MAJ), [titre(1, 'EUR')], l, opts({ debutTaux: '2020-01-02' }));
        expect(appels.taux[0]).toEqual({ devise: 'EUR', du: '2020-01-02', au: VENDREDI });
    });

    it('un taux déjà à jour pour le week-end n’est pas relu ; les taux ne coûtent pas de budget', async () => {
        const m: MagasinMarche = { ...magasinVide(MAJ), taux: { USD: [['2026-01-09', 1.37]] } };
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([]));
        const r = await executerPasseMagasin(m, [titre(1, 'USD')], l, opts({ aujourdhui: DIMANCHE, budgetAppelsEodhd: 0 }));
        expect(appels.taux).toEqual([]);
        expect(r.rapport.taux.sansBesoin).toBe(1);
    });

    it('les taux datés d’après le jour sont écartés, les révisions comptées', async () => {
        const m: MagasinMarche = { ...magasinVide(MAJ), taux: { USD: [['2026-01-08', 1.36]] } };
        const { l } = lecteurs(async () => ok<PointCoursLu>([]), async () => ok<PointTaux>([['2026-01-08', 1.365], ['2026-01-09', 1.37], ['2026-01-12', 9]]));
        const r = await executerPasseMagasin(m, [titre(1, 'USD')], l, opts());
        expect(r.magasin.taux.USD).toEqual([['2026-01-08', 1.365], ['2026-01-09', 1.37]]);
        expect(r.rapport.taux).toMatchObject({ ecartes: 1, revisions: 1, ajouts: 1 });
    });

    it('un début des taux postérieur au jour de la passe : rien à lire, aucun appel', async () => {
        const { l, appels } = lecteurs(async () => ok<PointCoursLu>([]));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1, 'USD')], l, opts({ debutTaux: '2026-02-01' }));
        expect(appels.taux).toEqual([]);
        expect(r.rapport.taux.sansBesoin).toBe(1);
    });

    it('une panne de la Banque du Canada est comptée et ne bloque pas les clôtures', async () => {
        const { l } = lecteurs(
            async () => ok<PointCoursLu>([['2026-01-09', 101]]),
            async () => { throw new Error('réseau'); },
        );
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1, 'USD')], l, opts());
        expect(r.rapport.taux.echecsReseau).toBe(1);
        expect(r.rapport.clotures.ajouts).toBe(1);
    });

    it('un taux illisible est compté, rien n’est écrit', async () => {
        const { l } = lecteurs(async () => ok<PointCoursLu>([]), async () => ({ statut: 'erreur', forme: 'un objet à 0 clé(s)' }));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1, 'USD')], l, opts());
        expect(r.rapport.taux.reponsesIllisibles).toBe(1);
        expect(r.magasin.taux).toEqual({});
    });
});

describe('[PTF-L1C2] idempotence et pureté', () => {
    it('rejouer la même passe ne change rien : même magasin, même majLe, rien d’écrit', async () => {
        const lecture = async () => ok<PointCoursLu>([['2026-01-08', 100.5], ['2026-01-09', 101.25]]);
        const premier = await executerPasseMagasin(magasinVide(MAJ), [titre(1)], lecteurs(lecture).l, opts());
        const second = await executerPasseMagasin(premier.magasin, [titre(1)], lecteurs(lecture).l, opts({ maintenant: '2026-01-09T23:00:00.000Z' }));
        expect(second.modifie).toBe(false);
        expect(second.magasin).toBe(premier.magasin);
        expect(second.magasin.majLe).toBe(MAINTENANT);
        expect(second.rapport.clotures).toMatchObject({ ajouts: 0, revisions: 0, promotions: 0 });
    });

    it('rejouer avec un appel EFFECTIF : la source rend les mêmes points, rien n’est compté ni réécrit', async () => {
        const lecture = async () => ok<PointCoursLu>([['2026-01-07', 99], ['2026-01-08', 100]]);
        const premier = await executerPasseMagasin(magasinVide(MAJ), [titre(1)], lecteurs(lecture).l, opts());
        const { l, appels } = lecteurs(lecture);
        const second = await executerPasseMagasin(premier.magasin, [titre(1)], l, opts({ maintenant: '2026-01-09T23:00:00.000Z' }));
        expect(appels.clotures).toHaveLength(1);
        expect(second.rapport.clotures).toMatchObject({ appels: 1, ajouts: 0, revisions: 0, promotions: 0, ignores: 0 });
        expect(second.modifie).toBe(false);
        expect(second.magasin).toBe(premier.magasin);
    });

    it('ne mute pas le magasin reçu (gelé en profondeur)', async () => {
        const m = geler(avecSerie(1, [['2026-01-08', 100, 'eodhd']]));
        const { l } = lecteurs(async () => ok<PointCoursLu>([['2026-01-08', 99], ['2026-01-09', 101]]), async () => ok<PointTaux>([['2026-01-09', 1.37]]));
        const r = await executerPasseMagasin(m, [titre(1)], l, opts());
        expect(r.modifie).toBe(true);
        expect(m.clotures[isinDe(1)].points).toEqual([['2026-01-08', 100, 'eodhd']]);
        expect(m.taux).toEqual({});
    });

    it('le rapport ne porte que des compteurs : ni ISIN, ni symbole, ni cours', async () => {
        const { l } = lecteurs(async () => ok<PointCoursLu>([['2026-01-09', 123.4567]]), async () => ok<PointTaux>([['2026-01-09', 1.3799]]));
        const r = await executerPasseMagasin(magasinVide(MAJ), [titre(1)], l, opts());
        const texte = JSON.stringify(r.rapport);
        for (const interdit of [isinDe(1), 'AAA1', '123.4567', '1.3799', 'eodhd.com']) expect(texte).not.toContain(interdit);
        for (const v of [...Object.values(r.rapport.clotures), ...Object.values(r.rapport.taux)]) expect(typeof v).toBe('number');
    });
});

describe('[PTF-L1C2] options invalides : erreur de l’appelant, pas une donnée', () => {
    const vide = lecteurs(async () => ok<PointCoursLu>([])).l;
    it.each([
        ['date du jour illisible', { aujourdhui: '2026-02-31' }],
        ['horodatage illisible', { maintenant: 'demain' }],
        ['horodatage sans heure (Date.parse l’accepte, majLe non)', { maintenant: '2026-01-09' }],
        ['budget négatif', { budgetAppelsEodhd: -1 }],
        ['budget non entier', { budgetAppelsEodhd: 1.5 }],
        ['fenêtre nulle', { fenetreMaxJours: 0 }],
        ['début des taux illisible', { debutTaux: 'hier' }],
    ] as Array<[string, Partial<OptionsPasse>]>)('%s', async (_nom, o) => {
        await expect(executerPasseMagasin(magasinVide(MAJ), [], vide, opts(o))).rejects.toThrow('passeMagasin');
    });
});
