/**
 * [HEALTH-CORRUPTION-INDISTINGUABLE-D-UNE-ABSENCE] (c) — une RÉCIDIVE redevient audible.
 *
 * ⚠️ LE DÉFAUT. `logErrorThrottled` gardait ses signatures dans un `Set` JAMAIS purgé côté
 * navigateur. Une corruption qui apparaît, disparaît, puis revient plus tard dans la MÊME session
 * — un onglet ouvert des jours, le mode d'usage normal ici — était journalisée une fois, puis
 * muette pour toujours. Le serveur MCP n'avait pas le problème : il appelle `__resetErrorThrottle()`
 * à chaque requête. Le navigateur n'avait aucun équivalent de « nouvelle occasion ».
 *
 * ⚠️ LES DEUX SENS COMPTENT AUTANT. Le throttle existe pour absorber une RAFALE (mesuré :
 * 10 000 appels en 2,7 ms sur `assetValueCad`) — le supprimer thrasherait `localStorage` en
 * hot-path. La garde vérifie donc les deux : muet pendant la fenêtre, parlant après. Tester
 * seulement « ça reparle » laisserait passer la suppression pure du throttle.
 *
 * ⚠️ HORLOGE : faux timers OBLIGATOIRES. Le code lit `Date.now()` ; une garde qui attendrait
 * vraiment 60 s serait une bombe de lenteur, et une garde qui figerait une date pendant que le code
 * lit l'horloge en serait une autre (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`, version temps).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    logErrorThrottled, getErrors, clearErrors, __resetErrorThrottle, THROTTLE_REARM_WINDOW_MS,
} from '../../services/errorLogger';

const SIGNATURE = 'test:recidive';
const entree = () => ({
    // `ErrorSource` est une union FERMÉE (`services/errorLogger.ts`) : 'engine' n'en fait pas
    // partie, et mon premier jet l'avait inventé. Vitest ne typecheck pas — c'est `tsc` qui l'a
    // attrapé, au gate. D'où la règle appliquée depuis : les vérifs ciblées incluent `typecheck`
    // APRÈS la DERNIÈRE édition, pas avant.
    source: 'projection' as const, severity: 'warning' as const,
    message: 'donnée corrompue', context: {},
});
const combien = () => getErrors().filter(e => e.message === 'donnée corrompue').length;

describe('[HEALTH-CORRUPTION…] (c) le throttle se RÉARME après sa fenêtre', () => {
    beforeEach(() => { vi.useFakeTimers(); clearErrors(); __resetErrorThrottle(); });
    afterEach(() => { vi.useRealTimers(); clearErrors(); __resetErrorThrottle(); });

    it('une RAFALE reste absorbée : le throttle n\'est pas supprimé', () => {
        for (let i = 0; i < 500; i++) logErrorThrottled(SIGNATURE, entree());
        expect(combien(), 'la rafale doit rester une seule entrée').toBe(1);
    });

    it('juste AVANT la fin de la fenêtre : toujours muet', () => {
        logErrorThrottled(SIGNATURE, entree());
        vi.advanceTimersByTime(THROTTLE_REARM_WINDOW_MS - 1);
        logErrorThrottled(SIGNATURE, entree());
        expect(combien()).toBe(1);
    });

    it('APRÈS la fenêtre : la récidive est journalisée', () => {
        logErrorThrottled(SIGNATURE, entree());
        vi.advanceTimersByTime(THROTTLE_REARM_WINDOW_MS);
        logErrorThrottled(SIGNATURE, entree());
        expect(combien(), 'une récidive tardive doit redevenir audible').toBe(2);
    });

    it('deux signatures DIFFÉRENTES ne se throttlent pas l\'une l\'autre', () => {
        // Anti-vacuité : sans ce cas, un throttle global (une seule entrée pour tout) passerait
        // les trois cas ci-dessus.
        logErrorThrottled('sig:a', entree());
        logErrorThrottled('sig:b', entree());
        expect(combien()).toBe(2);
    });
});
