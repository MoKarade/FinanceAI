/**
 * [FX-OBSERVATION-COHORTE] Choisir l'observation par la SÉRIE, jamais par un index.
 *
 * ⚠️ Ce fichier part de la réponse RÉELLE de la Banque du Canada (`tests/fixtures/bdcFxRatesDaily.json`,
 * récupérée par Marc dans son navigateur le 2026-09-16 — l'hôte est refusé au CONNECT depuis le
 * conteneur, cf. §6). C'est délibéré : les trois fixtures écrites À LA MAIN du dépôt encodaient la
 * forme qu'on CROYAIT avoir (`observations: [{ FXUSDCAD: … }]`), donc elles ne pouvaient que
 * confirmer l'erreur (`UNE-CAUSE-CLASSEE-PUIS-JETEE-EST-UNE-CAUSE-ABSENTE`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    lireSerieBdc, jourUtcDepuisD, AGE_MAX_OBSERVATION_JOURS,
} from '../../../services/fx/observationsBdc';

const reponseReelle = JSON.parse(
    readFileSync(resolve(__dirname, '../../fixtures/bdcFxRatesDaily.json'), 'utf-8'),
) as { observations: Record<string, unknown>[] };

/** Lendemain de l'observation vivante de la fixture — la fixture est datée, l'horloge doit l'être. */
const LENDEMAIN = new Date('2026-09-17T12:00:00Z').getTime();

describe('la fixture PIÈGE bien (anti-vacuité)', () => {
    // ⚠️ Sans ces deux assertions, tout le reste du fichier pourrait passer sur une réponse
    // ordinaire et ne rien prouver du défaut. Ce qu'elles figent est LE fait qui l'a causé.
    it('`observations[0]` ne porte NI USD NI EUR — c\'est une série ABANDONNÉE de 2019', () => {
        const premiere = reponseReelle.observations[0];
        expect(premiere.d).toBe('2019-12-31');
        expect(premiere.FXUSDCAD).toBeUndefined();
        expect(premiere.FXEURCAD).toBeUndefined();
        expect(premiere.FXVNDCAD).toBeDefined();
    });

    it('les séries vivantes existent, mais PLUS LOIN dans la liste', () => {
        const indexUsd = reponseReelle.observations.findIndex((o) => o.FXUSDCAD !== undefined);
        expect(indexUsd).toBeGreaterThan(0);
    });
});

describe('lecture par SÉRIE sur la réponse réelle', () => {
    it('rend les vrais taux du 2026-09-16, avec leur date', () => {
        const usd = lireSerieBdc(reponseReelle.observations, 'FXUSDCAD', LENDEMAIN);
        const eur = lireSerieBdc(reponseReelle.observations, 'FXEURCAD', LENDEMAIN);
        expect(usd).toEqual({ statut: 'ok', valeur: 1.3947, date: '2026-09-16', ageJours: 1 });
        expect(eur).toEqual({ statut: 'ok', valeur: 1.6073, date: '2026-09-16', ageJours: 1 });
    });

    it('⚠️ et surtout : ce ne sont PAS les valeurs de repli du dépôt', () => {
        // Le défaut servait 1,4000 / 1,4700 (`DEFAULT_FX_RATES`). L'écart EUR mesuré est de +9,34 %.
        // ⚠️ Écrit d'abord `expect(eur.statut === 'ok' && eur.valeur).not.toBe(1.47)` : VACUEUX —
        // dès que le statut n'est plus `'ok'`, l'expression vaut `false`, et `false !== 1.47` passe
        // toujours. Une régression qui change le STATUT serait donc invisible ici.
        const eur = lireSerieBdc(reponseReelle.observations, 'FXEURCAD', LENDEMAIN);
        expect(eur).toMatchObject({ statut: 'ok' });
        expect((eur as { valeur: number }).valeur).not.toBe(1.47);
        const usd = lireSerieBdc(reponseReelle.observations, 'FXUSDCAD', LENDEMAIN);
        expect(usd).toMatchObject({ statut: 'ok' });
        expect((usd as { valeur: number }).valeur).not.toBe(1.40);
    });

    it('une série ABANDONNÉE est refusée pour son ÂGE, pas lue comme le taux du jour', () => {
        const vnd = lireSerieBdc(reponseReelle.observations, 'FXVNDCAD', LENDEMAIN);
        expect(vnd.statut).toBe('perimee');
        expect(vnd.statut === 'perimee' && vnd.date).toBe('2019-12-31');
        expect(vnd.statut === 'perimee' && vnd.ageJours).toBeGreaterThan(AGE_MAX_OBSERVATION_JOURS);
    });

    it('une série que la réponse ne porte pas → `absente` (silence légitime)', () => {
        expect(lireSerieBdc(reponseReelle.observations, 'FXXXXCAD', LENDEMAIN)).toEqual({ statut: 'absente' });
    });
});

describe('cas limites', () => {
    const jour = '2026-09-16';

    it('prend la plus RÉCENTE des observations qui portent la série', () => {
        const obs = [
            { d: '2026-09-10', FXUSDCAD: { v: '1.3000' } },
            { d: '2026-09-16', FXUSDCAD: { v: '1.3947' } },
            { d: '2026-09-12', FXUSDCAD: { v: '1.3500' } },
        ];
        const r = lireSerieBdc(obs, 'FXUSDCAD', LENDEMAIN);
        expect(r.statut === 'ok' && r.valeur).toBe(1.3947);
        expect(r.statut === 'ok' && r.date).toBe('2026-09-16');
    });

    it('une valeur VIDE ce jour-là n\'est pas une anomalie : on retombe sur le jour précédent', () => {
        const obs = [
            { d: '2026-09-15', FXUSDCAD: { v: '1.3000' } },
            { d: '2026-09-16', FXUSDCAD: { v: '' } },
        ];
        const r = lireSerieBdc(obs, 'FXUSDCAD', LENDEMAIN);
        expect(r.statut === 'ok' && r.valeur).toBe(1.3);
    });

    it('une valeur PRÉSENTE mais illisible, sans repli plus ancien → `illisible`', () => {
        const r = lireSerieBdc([{ d: jour, FXUSDCAD: { v: 'abc' } }], 'FXUSDCAD', LENDEMAIN);
        expect(r).toEqual({ statut: 'illisible', brut: 'abc' });
    });

    it('zéro et négatif ne sont pas des taux', () => {
        expect(lireSerieBdc([{ d: jour, FXUSDCAD: { v: '0' } }], 'FXUSDCAD', LENDEMAIN).statut).toBe('illisible');
        expect(lireSerieBdc([{ d: jour, FXUSDCAD: { v: '-1.4' } }], 'FXUSDCAD', LENDEMAIN).statut).toBe('illisible');
    });

    it('⚠️ une observation NON DATABLE est refusée : sans date, « courant » ne veut rien dire', () => {
        expect(lireSerieBdc([{ FXUSDCAD: { v: '1.3947' } }], 'FXUSDCAD', LENDEMAIN).statut).toBe('illisible');
        expect(lireSerieBdc([{ d: 'hier', FXUSDCAD: { v: '1.3947' } }], 'FXUSDCAD', LENDEMAIN).statut).toBe('illisible');
    });

    it('une entrée qui n\'est pas une liste ne fait pas planter', () => {
        expect(lireSerieBdc(undefined, 'FXUSDCAD', LENDEMAIN).statut).toBe('absente');
        expect(lireSerieBdc({}, 'FXUSDCAD', LENDEMAIN).statut).toBe('absente');
        expect(lireSerieBdc([null, 3, 'x'], 'FXUSDCAD', LENDEMAIN).statut).toBe('absente');
    });

    it('⚠️ le seuil DÉPASSE strictement la plus longue interruption légitime (5 jours)', () => {
        // ⚠️ Perturbation MUETTE démasquée : le test de borne ci-dessous DÉRIVE ses dates du seuil,
        // donc il reste vert quelle que soit sa valeur — il défend le comportement à la frontière,
        // pas le choix du nombre. Rien n'épinglait donc le fait qui compte.
        // La Banque du Canada peut cesser de publier 5 jours d'affilée (mesuré sur onze fins
        // d'année : `2026-12-24 → 2026-12-29`, cas qui revient 7 fois sur 11). À 5, la marge est
        // NULLE (`5 > 5` est faux) : la moindre journée de plus ferait refuser un taux parfaitement
        // valide et replierait sur le littéral du dépôt — le défaut que ce lot vient de fermer.
        // On ancre la RELATION, jamais la valeur : monter le seuil reste libre, le descendre non.
        expect(AGE_MAX_OBSERVATION_JOURS).toBeGreaterThan(5);
    });

    it('le seuil d\'âge est une BORNE : à la limite on accepte, un jour de plus on refuse', () => {
        const base = Date.UTC(2026, 8, 16);
        const pile = base + AGE_MAX_OBSERVATION_JOURS * 86400000;
        const unDePlus = pile + 86400000;
        expect(lireSerieBdc([{ d: '2026-09-16', FXUSDCAD: { v: '1.39' } }], 'FXUSDCAD', pile).statut).toBe('ok');
        expect(lireSerieBdc([{ d: '2026-09-16', FXUSDCAD: { v: '1.39' } }], 'FXUSDCAD', unDePlus).statut).toBe('perimee');
    });
});

describe('les anomalies trouvées par le panel du 2026-09-17', () => {
    it('une observation PLUS RÉCENTE et illisible ne disparaît pas quand on retombe sur la veille', () => {
        // Le taux servi reste JUSTE — c'est précisément ce qui rendait l'anomalie invisible.
        const obs = [
            { d: '2026-09-15', FXUSDCAD: { v: '1.3900' } },
            { d: '2026-09-16', FXUSDCAD: { v: 'N/A' } },
        ];
        const r = lireSerieBdc(obs, 'FXUSDCAD', LENDEMAIN);
        expect(r).toMatchObject({ statut: 'ok', valeur: 1.39, date: '2026-09-15' });
        expect(r.statut === 'ok' && r.anomalie).toEqual({ brut: 'N/A', date: '2026-09-16' });
    });

    it('contrôle négatif : une anomalie PLUS ANCIENNE que la valeur retenue ne remonte pas', () => {
        const obs = [
            { d: '2026-09-15', FXUSDCAD: { v: 'N/A' } },
            { d: '2026-09-16', FXUSDCAD: { v: '1.3947' } },
        ];
        const r = lireSerieBdc(obs, 'FXUSDCAD', LENDEMAIN);
        expect(r).toMatchObject({ statut: 'ok', valeur: 1.3947 });
        expect(r.statut === 'ok' && r.anomalie).toBeUndefined();
    });

    it('⚠️ une observation datée dans le FUTUR ne passe pas pour fraîche', () => {
        // `Math.max(0, …)` rabattait son âge à 0, donc `'ok'`, sans la moindre trace.
        const dansUnMois = new Date(LENDEMAIN + 30 * 86400000).toISOString().slice(0, 10);
        const r = lireSerieBdc([{ d: dansUnMois, FXUSDCAD: { v: '9.99' } }], 'FXUSDCAD', LENDEMAIN);
        expect(r.statut).toBe('illisible');
    });

    it('…mais une horloge locale en retard de quelques heures reste ACCEPTÉE (tolérance d\'un jour)', () => {
        // Autour de minuit UTC, une horloge qui retarde rend l'observation du jour « future » de
        // quelques heures : la refuser priverait l'utilisateur d'un taux parfaitement valide.
        const presqueMinuit = Date.UTC(2026, 8, 16) - 3 * 3600000;
        const r = lireSerieBdc([{ d: '2026-09-16', FXUSDCAD: { v: '1.3947' } }], 'FXUSDCAD', presqueMinuit);
        expect(r).toMatchObject({ statut: 'ok', valeur: 1.3947 });
    });
});

describe('jourUtcDepuisD', () => {
    it('refuse une date IMPOSSIBLE que `Date.UTC` normaliserait en silence', () => {
        // 2026-02-31 deviendrait le 3 mars : un taux daté d'un jour qui n'existe pas.
        expect(jourUtcDepuisD('2026-02-31')).toBeNull();
        expect(jourUtcDepuisD('2026-13-01')).toBeNull();
        expect(jourUtcDepuisD('16/09/2026')).toBeNull();
        expect(jourUtcDepuisD(undefined)).toBeNull();
        expect(jourUtcDepuisD(20260916)).toBeNull();
    });

    it('⚠️ ne dépend d\'AUCUN fuseau — le conteneur tourne en UTC et ne peut pas le prouver seul', () => {
        // `UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC` : on balaie un fuseau de chaque
        // signe, et on exige la MÊME valeur. `new Date('2026-09-16')` local la ferait diverger.
        const attendu = Date.UTC(2026, 8, 16);
        const tzOrigine = process.env.TZ;
        for (const tz of ['UTC', 'America/Montreal', 'Australia/Sydney', 'Pacific/Kiritimati']) {
            process.env.TZ = tz;
            expect(jourUtcDepuisD('2026-09-16')).toBe(attendu);
        }
        process.env.TZ = tzOrigine;
    });
});

describe('la chaîne COMPLÈTE : la réponse réelle → les taux publiés', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* environnement sans Web Storage */ }
        vi.useFakeTimers();
        vi.setSystemTime(LENDEMAIN);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        try { localStorage.clear(); } catch { /* idem */ }
    });

    it('⚠️⚠️ la garde qui TRAVERSE : sur la vraie réponse, l\'app sert 1,3947 et 1,6073', async () => {
        // Avant ce lot, la MÊME réponse produisait 1,4000 / 1,4700 — le littéral du dépôt — avec
        // `source: 'repli'`. C'est l'assertion qui rougit si quelqu'un revient à `observations[0]`.
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, json: async () => reponseReelle,
        } as unknown as Response)));
        const { fetchFxRates } = await import('../../../services/finance');
        const r = await fetchFxRates({ force: true });
        expect(r.USD).toBe(1.3947);
        expect(r.EUR).toBe(1.6073);
        expect(r.source).toBe('api');
        expect(r.cause).toBe('ok');
        expect(r.estimated).toBe(false);
        expect(r.observationDate).toBe('2026-09-16');
    });

    it('une série FIGÉE donne `cause: perimee`, distincte de `partiel`', async () => {
        // Le diagnostic qui manquait : « au moins une série absente » a envoyé chercher la panne du
        // côté de la Banque du Canada, alors que la série était là, lisible, et vieille de 7 ans.
        const figee = {
            observations: [
                { d: '2019-12-31', FXUSDCAD: { v: '1.3000' } },
                { d: '2026-09-16', FXEURCAD: { v: '1.6073' } },
            ],
        };
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, json: async () => figee,
        } as unknown as Response)));
        const { fetchFxRates } = await import('../../../services/finance');
        const r = await fetchFxRates({ force: true });
        expect(r.cause).toBe('perimee');
        expect(r.source).toBe('repli');
        expect(r.USD).toBe(1.40);
        // ⚠️ Aucune date publiée : une seule série lue ne date pas la PAIRE affichée.
        expect(r.observationDate).toBeUndefined();
    });
});
