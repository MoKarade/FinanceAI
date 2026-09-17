// tests/services/fx/provenance.test.ts
//
// [FX-TAUX-JAMAIS-ARRIVES] La provenance du taux de change, et la décision d'écriture.
//
// CE QUE CE FICHIER DÉFEND, et pourquoi ça vaut un fichier : l'état RÉEL de Marc a été mesuré le
// 2026-09-16 (via le serveur MCP, instantané Drive) — ses douze positions sont en USD ou en EUR,
// AUCUNE en CAD, et les facteurs appliqués valaient 1,4000 et 1,4700 au dix-millième, soit
// `DEFAULT_FX_RATES` au caractère près. Toute la valeur de ses placements reposait sur un chiffre
// écrit en dur, et rien ne pouvait le faire changer : la lecture automatique ne tourne qu'au
// démarrage, et sa condition d'écriture ne regardait QUE la valeur.

import { describe, it, expect } from 'vitest';
import {
    fxSourceEffective, fxCauseEffective, fxFaitAutorite, libelleSourceFx, messageCauseFx,
    decisionEcritureFx, DELAI_RAFRAICHISSEMENT_FX_MS,
    type LectureFx,
} from '../../../services/fx/provenance';

const lecture = (p: Partial<LectureFx> = {}): LectureFx => ({
    USD: 1.38, EUR: 1.45, lastFetched: 1_000_000, source: 'api', cause: 'ok', attemptAt: 1_000_000,
    ...p,
});

describe('fxSourceEffective — rétrocompatibilité', () => {
    it('lit le champ explicite quand il est présent et valide', () => {
        expect(fxSourceEffective({ fxRatesSource: 'manuel' })).toBe('manuel');
        expect(fxSourceEffective({ fxRatesSource: 'api' })).toBe('api');
        expect(fxSourceEffective({ fxRatesSource: 'repli' })).toBe('repli');
    });

    it('retombe sur l\'ANCIENNE lecture quand le champ est absent — un état d\'avant ce lot', () => {
        // ⚠️ C'est la propriété qui rend le champ additif SÛR : sans elle, tout état écrit avant ce
        // lot serait classé « je ne sais pas » et perdrait la conversion de ses avoirs étrangers.
        expect(fxSourceEffective({ fxRatesEstimated: true })).toBe('repli');
        expect(fxSourceEffective({ fxRatesEstimated: false })).toBe('api');
        expect(fxSourceEffective({ fxRates: { lastFetched: 0 } })).toBe('repli');
        expect(fxSourceEffective({ fxRates: { lastFetched: 12345 } })).toBe('api');
        expect(fxSourceEffective(undefined)).toBe('repli');
    });

    it('REFUSE une valeur inconnue venue du Drive plutôt que de la propager', () => {
        // L'état vient d'un blob que rien ne valide (aucun schéma Zod sur ce champ additif).
        expect(fxSourceEffective({ fxRatesSource: 'bidon', fxRatesEstimated: true })).toBe('repli');
        expect(fxSourceEffective({ fxRatesSource: 'API' })).toBe('repli'); // la casse n'est pas tolérée
    });
});

describe('fxCauseEffective', () => {
    it('valide la valeur et retombe sur « jamais tenté »', () => {
        expect(fxCauseEffective({ fxLastAttemptCause: 'reseau' })).toBe('reseau');
        expect(fxCauseEffective({ fxLastAttemptCause: 'inventé' })).toBe('jamais-tente');
        expect(fxCauseEffective(undefined)).toBe('jamais-tente');
    });
});

describe('fxFaitAutorite — qui a le droit d\'écrire un total de compte', () => {
    it('un taux de marché ET un taux saisi par Marc convertissent ; le repli en dur, non', () => {
        // ⚠️ C'EST LA RAISON D'ÊTRE des trois valeurs. Un booléen forcerait à ranger « manuel » avec
        // l'un des deux : avec `api` il passerait pour une lecture de marché, avec `repli` il ne
        // convertirait pas — donc le recours demandé par Marc serait sans effet.
        expect(fxFaitAutorite('api')).toBe(true);
        expect(fxFaitAutorite('manuel')).toBe(true);
        expect(fxFaitAutorite('repli')).toBe(false);
    });
});

describe('libellés', () => {
    it('nomme la provenance sans jamais dire « Banque du Canada » pour un repli', () => {
        // Le diagnostic technique affirmait « (BdC, …) » quelle que soit la provenance : il
        // attribuait le littéral du dépôt à la Banque du Canada, dans la page où on vient
        // justement chercher la vérité.
        expect(libelleSourceFx('api')).toContain('Banque du Canada');
        expect(libelleSourceFx('manuel')).not.toContain('Banque du Canada');
        expect(libelleSourceFx('repli')).not.toContain('Banque du Canada');
    });

    it('aucun message ne PROMET que ça se réglera tout seul', () => {
        // `UN-MESSAGE-QUI-PROMET-UNE-RESOLUTION-AUTOMATIQUE-EST-UNE-AFFIRMATION-SUR-L-AVENIR` :
        // avant ce lot la lecture ne tournait qu'une fois au démarrage, donc « réessaie plus tard »
        // aurait été faux pour TOUTES les causes à la fois.
        const causes = ['ok', 'partiel', 'reseau', 'http', 'reponse-illisible', 'manuel', 'jamais-tente'] as const;
        for (const c of causes) {
            const m = messageCauseFx(c);
            expect(m.length).toBeGreaterThan(10);
            expect(m.toLowerCase()).not.toMatch(/automatiquement|réessaie plus tard|prochain démarrage/);
        }
    });
});

describe('decisionEcritureFx — LE défaut mesuré', () => {
    const etat = {
        fxRates: { USD: 1.38, EUR: 1.45, lastFetched: 1_000_000 },
        fxRatesSource: 'api',
        fxLastAttemptCause: 'ok',
        fxLastAttemptAt: 1_000_000,
    };

    it('écrit TOUT quand une valeur a changé (le SEUL cas que l\'ancienne condition couvrait)', () => {
        expect(decisionEcritureFx(etat, lecture({ USD: 1.39 }))).toBe('tout');
        expect(decisionEcritureFx(etat, lecture({ EUR: 1.46 }))).toBe('tout');
    });

    it('N\'ÉCRIT RIEN quand rien n\'a bougé et que la lecture est récente', () => {
        // Contrôle négatif : sans lui, on pousserait l'état entier vers le Drive à chaque démarrage.
        expect(decisionEcritureFx(etat, lecture({ lastFetched: 1_000_001, attemptAt: 1_000_001 }))).toBe('rien');
    });

    it('⚠️ écrit quand la VALEUR est identique mais que la lecture a VIEILLI — le défaut', () => {
        // La Banque du Canada ne publie qu'un jour OUVRÉ : « même taux qu'hier » est le cas normal.
        // L'ancienne condition (`USD !== USD || EUR !== EUR`) ne rafraîchissait alors ni la
        // fraîcheur, ni la cause, ni la date de tentative — sur une donnée pourtant à jour.
        const plusTard = 1_000_000 + DELAI_RAFRAICHISSEMENT_FX_MS + 1;
        expect(decisionEcritureFx(etat, lecture({ lastFetched: plusTard, attemptAt: plusTard }))).toBe('tout');
    });

    it('écrit quand la PROVENANCE change, à valeur identique', () => {
        const manuel = { ...etat, fxRatesSource: 'manuel', fxLastAttemptCause: 'manuel' };
        // ⚠️ Une lecture `api` a AUTORITÉ, donc elle a le droit de remplacer une saisie manuelle :
        // c'est le sens de la reprise en main quand la Banque du Canada répond à nouveau.
        expect(decisionEcritureFx(manuel, lecture({ source: 'api' }))).toBe('tout');
    });

    it('écrit quand la CAUSE change, à valeur et provenance identiques', () => {
        expect(decisionEcritureFx(etat, lecture({ cause: 'partiel' }))).toBe('tout');
    });

    it('écrit sur un état VIDE (premier démarrage)', () => {
        expect(decisionEcritureFx(undefined, lecture())).toBe('tout');
        expect(decisionEcritureFx({}, lecture())).toBe('tout');
    });
});

// ⚠️⚠️ CE BLOC DÉFEND LE RECOURS LUI-MÊME, et il a fallu une MESURE pour le voir.
//
// Marc saisit son taux à la main précisément parce que la Banque du Canada ne répond pas. À la
// réouverture suivante, le démarrage rappelle `fetchFxRates` : elle échoue encore (même panne) et
// rend le repli en dur `1,40`. Les valeurs DIFFÉRANT de sa saisie `1,3650`, l'ancienne condition
// écrivait — et la saisie disparaissait. Le recours que tout ce lot existe pour offrir n'aurait
// vécu que le temps d'UNE session, et rien n'aurait été rouge.
//
// La règle est posée sur l'AUTORITÉ, pas sur le mot « manuel » : un taux `api` déjà persisté subit
// exactement le même sort quand le cache local a été vidé.
describe('⚠️ une lecture SANS autorité ne remplace JAMAIS un taux qui en a', () => {
    const apresSaisie = {
        fxRates: { USD: 1.3650, EUR: 1.5520, lastFetched: 0 },
        fxRatesEstimated: true,
        fxRatesSource: 'manuel',
        fxLastAttemptCause: 'manuel',
        fxLastAttemptAt: 1_000,
    };
    const repli = lecture({ USD: 1.40, EUR: 1.47, lastFetched: 0, source: 'repli', cause: 'reseau', attemptAt: 2_000 });

    it('le repli ne fait que poser le DIAGNOSTIC — les taux de Marc sont conservés', () => {
        expect(decisionEcritureFx(apresSaisie, repli)).toBe('diagnostic');
    });

    it('même protection pour un taux `api` persisté quand le cache local a été vidé', () => {
        const persisteApi = {
            fxRates: { USD: 1.3845, EUR: 1.4512, lastFetched: 1_700_000_000 },
            fxRatesEstimated: false,
            fxRatesSource: 'api',
            fxLastAttemptCause: 'ok',
            fxLastAttemptAt: 1_700_000_000,
        };
        expect(decisionEcritureFx(persisteApi, repli)).toBe('diagnostic');
    });

    it('CONTRÔLE NÉGATIF — quand l\'état n\'a PAS d\'autorité, le repli écrit normalement', () => {
        // Sans ce cas, « le repli n'écrase rien » serait indiscernable de « le repli n'écrit jamais »,
        // et un premier démarrage hors ligne ne poserait aucun taux du tout.
        const sansAutorite = { fxRates: { USD: 1.30, EUR: 1.40, lastFetched: 0 }, fxRatesEstimated: true };
        expect(decisionEcritureFx(sansAutorite, repli)).toBe('tout');
    });

    it('et le diagnostic ne se réécrit pas en boucle quand il n\'apprend rien', () => {
        // Deuxième démarrage de suite, même panne, même instant : plus rien à dire.
        const dejaVu = { ...apresSaisie, fxLastAttemptCause: 'reseau', fxLastAttemptAt: 2_000 };
        expect(decisionEcritureFx(dejaVu, repli)).toBe('rien');
    });
});

// ⚠️⚠️ CE BLOC DÉFEND UNE RÉGRESSION QUE J'AVAIS INTRODUITE, et qu'un test EXISTANT a trouvée.
//
// Mon premier jet écrivait `fxRatesSource: 'repli'` dans l'état PAR DÉFAUT, au motif qu'une
// provenance explicite vaut mieux qu'une absence. Or `merge` de zustand superpose le blob persisté
// sur cet objet CLÉ PAR CLÉ : un blob écrit AVANT ce lot ne porte pas la clé, elle serait donc
// restée à `'repli'` alors que l'utilisateur a de VRAIS taux. Son compte courtier en devise
// étrangère aurait cessé d'être converti le jour du déploiement — l'exact contraire du lot.
//
// La leçon n'est pas « ne pas poser de valeur par défaut » mais : **une valeur posée dans l'objet
// que `merge` prend pour BASE ne peut pas être contredite par un état ancien, elle le recouvre.**
describe('rétrocompatibilité de l\'état PERSISTÉ — le piège du défaut qui recouvre', () => {
    it('l\'état par défaut ne DÉCLARE PAS la provenance (sinon il recouvre les blobs anciens)', async () => {
        const { buildDefaultAppState } = await import('../../../mcp/state/appStateDefaults');
        const { initialState } = await import('../../../store/etatParDefaut');
        // La clé doit être ABSENTE, pas juste `undefined` à la lecture : c'est la présence de la
        // clé dans la base de `merge` qui décide.
        expect(Object.prototype.hasOwnProperty.call(buildDefaultAppState(), 'fxRatesSource')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(initialState, 'fxRatesSource')).toBe(false);
        // Et l'état NEUF reste bien « repli » — via `fxRatesEstimated`, qui suffit.
        expect(fxSourceEffective(buildDefaultAppState())).toBe('repli');
    });

    it('un état d\'AVANT ce lot, avec de VRAIS taux, reste « api » après fusion sur les défauts', async () => {
        const { buildDefaultAppState } = await import('../../../mcp/state/appStateDefaults');
        // Ce que `merge` produit : les défauts, recouverts clé par clé par le blob ancien.
        const ancien = { fxRates: { USD: 1.3845, EUR: 1.4512, CAD: 1, lastFetched: 1_700_000_000 }, fxRatesEstimated: false };
        const fusionne = { ...buildDefaultAppState(), ...ancien };
        expect(fxSourceEffective(fusionne)).toBe('api');
        expect(fxFaitAutorite(fxSourceEffective(fusionne))).toBe(true);
    });
});

// [FX-OBSERVATION-COHORTE] La DATE de l'observation : elle vit à côté des taux, donc elle subit
// exactement les deux mêmes pièges — le défaut qui recouvre, et le champ qu'un appelant oublie.
describe('la date d\'observation suit la provenance, par CONSTRUCTION', () => {
    it('elle est ABSENTE des défauts (même raison que la provenance)', async () => {
        const { buildDefaultAppState } = await import('../../../mcp/state/appStateDefaults');
        const { initialState } = await import('../../../store/etatParDefaut');
        expect(Object.prototype.hasOwnProperty.call(buildDefaultAppState(), 'fxObservationDate')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(initialState, 'fxObservationDate')).toBe(false);
    });

    it('elle est déclarée TEXTUELLE et PERSISTÉE (sinon la réhydratation VIDE l\'app)', async () => {
        // Incident du 2026-09-01, trois vagues : une clé textuelle persistée absente de la liste
        // fait lever `merge`, donc l'app s'ouvre vide avec un blob pourtant intact.
        const { CHAMPS_TEXTE } = await import('../../../services/verifierTypesRestaures');
        expect(CHAMPS_TEXTE).toContain('fxObservationDate');
    });

    it('⚠️ un taux SAISI ou de REPLI efface la date : il n\'a aucune observation derrière lui', async () => {
        const { useFinanceStore } = await import('../../../store/useFinanceStore');
        const set = useFinanceStore.setState;

        set({ fxObservationDate: '2026-09-16', fxRatesSource: 'api' });
        useFinanceStore.getState().updateFxRates({
            USD: 1.365, EUR: 1.6, CAD: 1, source: 'manuel', cause: 'manuel', attemptAt: 1,
        });
        expect(useFinanceStore.getState().fxObservationDate).toBeUndefined();

        set({ fxObservationDate: '2026-09-16', fxRatesSource: 'api' });
        useFinanceStore.getState().updateFxRates({
            USD: 1.4, EUR: 1.47, CAD: 1, source: 'repli', cause: 'reseau', attemptAt: 2,
        });
        expect(useFinanceStore.getState().fxObservationDate).toBeUndefined();
    });

    it('une lecture « api » la pose, et un appelant qui ne parle PAS de provenance ne l\'efface pas', async () => {
        const { useFinanceStore } = await import('../../../store/useFinanceStore');
        useFinanceStore.getState().updateFxRates({
            USD: 1.3947, EUR: 1.6073, CAD: 1, source: 'api', cause: 'ok', attemptAt: 3,
            observationDate: '2026-09-16',
        });
        expect(useFinanceStore.getState().fxObservationDate).toBe('2026-09-16');

        // Appelant à l'ANCIENNE signature (aucun `source`) et taux INCHANGÉS : l'existant reste.
        useFinanceStore.getState().updateFxRates({ USD: 1.3947, EUR: 1.6073, CAD: 1 });
        expect(useFinanceStore.getState().fxObservationDate).toBe('2026-09-16');

        // ⚠️ …mais si ce même appelant CHANGE les taux, la date ne les décrit plus : elle tombe.
        // Trouvé par la revue du 2026-09-17, contre un commentaire qui promettait le contraire.
        useFinanceStore.getState().updateFxRates({ USD: 1.55, EUR: 1.80, CAD: 1 });
        expect(useFinanceStore.getState().fxObservationDate).toBeUndefined();
    });
});
