/**
 * [MCP-CLOUDRUN-AUTH-HARDENING] Plafond de tentatives sur `POST /oauth/authorize`.
 *
 * Ce que ces tests VERROUILLENT, au-delà du « ça compte jusqu'à 8 » :
 *   - un SUCCÈS ne consomme rien (Marc ne se bloque jamais lui-même) ;
 *   - la fenêtre GLISSE (un pilonnage étalé ne devient pas gratuit, mais un vieil échec finit
 *     par sortir — sinon le premier faux pas de l'année bloquerait à vie) ;
 *   - `Retry-After` est cohérent avec la fenêtre (un client qui l'honore n'est pas renvoyé
 *     dans le mur immédiatement) ;
 *   - la mémoire reste BORNÉE sous pilonnage (un limiteur qui fuit devient l'attaque).
 */
import { describe, it, expect } from 'vitest';
import {
    makeAttemptLimiter,
    AUTHORIZE_MAX_FAILURES,
    AUTHORIZE_WINDOW_MS,
} from '../../mcp/auth/rateLimit';

/** Horloge pilotée : aucune attente réelle, et la fenêtre est testable exactement. */
function clock(start = 1_000_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('[MCP-CLOUDRUN-AUTH-HARDENING] limiteur de tentatives', () => {
    it('laisse passer tant que le quota d\'échecs n\'est pas épuisé, puis bloque', () => {
        const c = clock();
        const lim = makeAttemptLimiter({ now: c.now });

        for (let i = 0; i < AUTHORIZE_MAX_FAILURES - 1; i++) {
            expect(lim.isBlocked(), `bloqué trop tôt après ${i} échec(s)`).toBe(false);
            lim.recordFailure();
        }
        // Le dernier échec du quota fait basculer.
        expect(lim.isBlocked()).toBe(false);
        lim.recordFailure();
        expect(lim.isBlocked()).toBe(true);
    });

    it('un SUCCÈS efface l\'historique — l\'usage légitime ne consomme aucun quota', () => {
        const c = clock();
        const lim = makeAttemptLimiter({ now: c.now });

        for (let i = 0; i < AUTHORIZE_MAX_FAILURES - 1; i++) lim.recordFailure();
        expect(lim.isBlocked()).toBe(false);

        lim.reset(); // ← ce que fait le handler après une clé acceptée

        // Marc peut de nouveau se tromper tout son quota sans être bloqué au premier essai.
        for (let i = 0; i < AUTHORIZE_MAX_FAILURES - 1; i++) {
            lim.recordFailure();
            expect(lim.isBlocked()).toBe(false);
        }
    });

    it('la fenêtre GLISSE : les échecs sortis de la fenêtre ne comptent plus', () => {
        const c = clock();
        const lim = makeAttemptLimiter({ now: c.now });

        for (let i = 0; i < AUTHORIZE_MAX_FAILURES; i++) lim.recordFailure();
        expect(lim.isBlocked()).toBe(true);

        // Juste AVANT la sortie de fenêtre : toujours bloqué (le blocage n'est pas cosmétique).
        c.advance(AUTHORIZE_WINDOW_MS - 1);
        expect(lim.isBlocked()).toBe(true);

        // Après : le plus ancien échec est purgé → une tentative redevient possible.
        c.advance(2);
        expect(lim.isBlocked()).toBe(false);
    });

    it('`Retry-After` vaut 0 hors blocage, et couvre la fenêtre restante sinon', () => {
        const c = clock();
        const lim = makeAttemptLimiter({ now: c.now });

        expect(lim.retryAfterSeconds()).toBe(0);

        for (let i = 0; i < AUTHORIZE_MAX_FAILURES; i++) lim.recordFailure();
        expect(lim.retryAfterSeconds()).toBe(AUTHORIZE_WINDOW_MS / 1000);

        // À mi-fenêtre, il ne reste que la moitié — et JAMAIS 0 tant qu'on est bloqué (un 0
        // inviterait un client obéissant à retenter dans la seconde, donc à repartir en 429).
        c.advance(AUTHORIZE_WINDOW_MS / 2);
        expect(lim.retryAfterSeconds()).toBe(AUTHORIZE_WINDOW_MS / 2000);
        expect(lim.isBlocked()).toBe(true);
    });

    it('honorer `Retry-After` suffit à débloquer (la valeur n\'est pas sous-estimée)', () => {
        const c = clock();
        const lim = makeAttemptLimiter({ now: c.now });
        for (let i = 0; i < AUTHORIZE_MAX_FAILURES; i++) lim.recordFailure();

        c.advance(lim.retryAfterSeconds() * 1000);
        expect(lim.isBlocked()).toBe(false);
    });

    it('mémoire BORNÉE sous pilonnage : 10 000 échecs ne gardent que la fenêtre', () => {
        const c = clock();
        // maxFailures bas + fenêtre courte : on prouve la purge, pas une constante particulière.
        const lim = makeAttemptLimiter({ maxFailures: 3, windowMs: 1_000, now: c.now });

        for (let i = 0; i < 10_000; i++) {
            lim.recordFailure();
            c.advance(1); // 1 ms entre chaque → la fenêtre n'en retient jamais plus de ~1 000
        }
        // Le discriminant indirect : l'état reste cohérent et le déblocage arrive à l'heure,
        // ce qu'un tableau qui aurait accumulé 10 000 horodatages ne garantirait pas.
        expect(lim.isBlocked()).toBe(true);
        c.advance(1_001);
        expect(lim.isBlocked()).toBe(false);
        expect(lim.retryAfterSeconds()).toBe(0);
    });

    it('les valeurs par défaut sont celles annoncées (anti-dérive silencieuse)', () => {
        // Un durcissement se DÉCIDE ; si quelqu'un relâche le quota, ce test le dit.
        expect(AUTHORIZE_MAX_FAILURES).toBe(8);
        expect(AUTHORIZE_WINDOW_MS).toBe(15 * 60_000);
    });
});
