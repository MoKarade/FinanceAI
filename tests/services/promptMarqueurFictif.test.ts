/**
 * @vitest-environment jsdom
 *
 * [SANDBOX-PROMPTS-MARQUER-CONTEXTE] (décision de Marc, 2026-09-22) — quand l'app tourne sur des
 * DONNÉES FICTIVES (mode test / bac à sable), le `system` envoyé au modèle DIT que les chiffres
 * sont un scénario hypothétique. Rien n'est refusé : on marque.
 *
 * Trois étages :
 *  1. le fragment pur (`marquerSystemFictif`, `utils/promptSafety.ts`) ;
 *  2. le comportement au point de contact SDK (`chat` réel, SDK simulé) : marqué en mode fictif,
 *     INTACT en mode réel ;
 *  3. la GARDE : l'inventaire des points de contact SDK est DÉRIVÉ du grep
 *     `messages.(create|stream)(` sur le code de production décommenté — un 6ᵉ site qui
 *     n'enveloppe pas son `system` dans `systemPourAppel(` rougit, sans liste écrite à la main.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { stripComments } from '../helpers/source';
import { toPosix } from '../helpers/toPosix';

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = { create: sdk.create };
    },
}));

import { marquerSystemFictif, DONNEES_FICTIVES_MARQUEUR } from '../../utils/promptSafety';
import { chat } from '../../services/claude';
import { useFinanceStore } from '../../store/useFinanceStore';

describe('marquerSystemFictif — fragment pur', () => {
    it('mode réel : rend le system tel quel (même référence), undefined compris', () => {
        const blocs = [{ type: 'text' as const, text: 'A' }];
        expect(marquerSystemFictif('abc', false)).toBe('abc');
        expect(marquerSystemFictif(undefined, false)).toBeUndefined();
        expect(marquerSystemFictif(blocs, false)).toBe(blocs);
    });

    it('mode fictif, chaîne : marqueur ajouté EN FIN, le préfixe reste en tête', () => {
        const out = marquerSystemFictif('PREFIXE', true);
        expect(out).toBe(`PREFIXE\n${DONNEES_FICTIVES_MARQUEUR}`);
    });

    it('mode fictif, sans system : le marqueur seul (un appel sans system reçoit le contexte)', () => {
        expect(marquerSystemFictif(undefined, true)).toBe(DONNEES_FICTIVES_MARQUEUR);
        expect(marquerSystemFictif('', true)).toBe(DONNEES_FICTIVES_MARQUEUR);
    });

    it('mode fictif, blocs : bloc ajouté EN DERNIER, le bloc caché reste intact, entrée non mutée', () => {
        const cache = { type: 'text' as const, text: 'ROLE', cache_control: { type: 'ephemeral' as const } };
        const entree = [cache];
        const out = marquerSystemFictif(entree, true);
        expect(out).toEqual([cache, { type: 'text', text: DONNEES_FICTIVES_MARQUEUR }]);
        expect(out[0]).toBe(cache);
        expect(entree).toHaveLength(1);
    });

    it('le marqueur dit « scénario hypothétique » et ne demande AUCUN refus', () => {
        expect(DONNEES_FICTIVES_MARQUEUR).toMatch(/SCÉNARIO HYPOTHÉTIQUE/);
        expect(DONNEES_FICTIVES_MARQUEUR).toMatch(/DONNÉES FICTIVES/);
        expect(DONNEES_FICTIVES_MARQUEUR).not.toMatch(/refuse/i);
    });
});

describe('chat() — le marqueur est posé au point de contact SDK', () => {
    beforeEach(() => {
        sdk.create.mockReset();
        sdk.create.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    });
    afterEach(() => {
        useFinanceStore.setState({ isTestMode: false });
    });

    it('données RÉELLES : le system de l\'appelant part INTACT', async () => {
        useFinanceStore.setState({ isTestMode: false });
        await chat([{ role: 'user', content: 'q' }], 'cle', { system: 'SYS' });
        expect(sdk.create.mock.calls[0][0].system).toBe('SYS');
    });

    it('données FICTIVES : le system de l\'appelant part AVEC le marqueur', async () => {
        useFinanceStore.setState({ isTestMode: true });
        await chat([{ role: 'user', content: 'q' }], 'cle', { system: 'SYS' });
        expect(sdk.create.mock.calls[0][0].system).toBe(`SYS\n${DONNEES_FICTIVES_MARQUEUR}`);
    });

    it('le mode est relu à CHAQUE appel (bascule entre deux appels)', async () => {
        useFinanceStore.setState({ isTestMode: true });
        await chat([{ role: 'user', content: 'q' }], 'cle', { system: 'SYS' });
        useFinanceStore.setState({ isTestMode: false });
        await chat([{ role: 'user', content: 'q' }], 'cle', { system: 'SYS' });
        expect(sdk.create.mock.calls[0][0].system).toContain(DONNEES_FICTIVES_MARQUEUR);
        expect(sdk.create.mock.calls[1][0].system).toBe('SYS');
    });
});

// ─── Garde : inventaire DÉRIVÉ des points de contact SDK ──────────────────────────────────────

const ROOT = process.cwd();
const SCAN_DIRS = ['services', 'hooks', 'components', 'api', 'mcp', 'utils', 'store'];
// `parse`/`countTokens` inclus : un futur appel par ces méthodes porte aussi un `system`.
const APPEL_SDK = /messages\s*(?:\.\s*(create|stream|parse|countTokens)|\[\s*['"`](create|stream|parse|countTokens)['"`]\s*\])\s*\(/g;
const SYSTEM_MARQUE = /\bsystem\s*:\s*systemPourAppel\s*\(/;

/**
 * Arguments de l'appel qui commence à `debut` (index de la parenthèse ouvrante) : jusqu'à la
 * parenthèse FERMANTE correspondante. Un `system: systemPourAppel(` qui suit l'appel, dans un autre
 * appel ou plus loin dans le fichier, ne peut donc plus « sauver » un site non marqué.
 * Parenthèses dans les chaînes : équilibrées en pratique ; un déséquilibre rend la fin du code
 * (le pire cas est alors un faux positif, jamais un faux négatif silencieux sur l'appel suivant
 * puisque chaque site est jugé sur SES arguments).
 */
function argumentsDeLAppel(code: string, debut: number): string {
    let profondeur = 0;
    for (let i = debut; i < code.length; i++) {
        if (code[i] === '(') profondeur++;
        else if (code[i] === ')' && --profondeur === 0) return code.slice(debut, i + 1);
    }
    return code.slice(debut);
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
    }
    return out;
}

/** Positions des appels SDK d'un code DÉCOMMENTÉ dont le `system` n'est pas enveloppé. */
function sitesSansMarqueur(code: string): { total: number; fautifs: number[] } {
    const appels = [...code.matchAll(APPEL_SDK)].map((m) => (m.index ?? 0) + m[0].length - 1);
    const fautifs = appels.filter((paren) => !SYSTEM_MARQUE.test(argumentsDeLAppel(code, paren)));
    return { total: appels.length, fautifs };
}

describe('[SANDBOX-PROMPTS-MARQUER-CONTEXTE] garde : tout point de contact SDK marque son system', () => {
    const fichiers = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));
    const scan = fichiers.map((f) => {
        const code = stripComments(readFileSync(f, 'utf8'));
        return { fichier: toPosix(relative(ROOT, f)), ...sitesSansMarqueur(code) };
    });

    it('le détecteur rougit sur un appel non enveloppé et passe sur un appel enveloppé (témoins)', () => {
        expect(sitesSansMarqueur('client.messages.create({ model: m, system: options.system, messages })').fautifs).toHaveLength(1);
        expect(sitesSansMarqueur('client.messages.stream({ model: m, system, messages })').fautifs).toHaveLength(1);
        expect(sitesSansMarqueur('client.messages.create({ model: m, messages })').fautifs).toHaveLength(1);
        expect(sitesSansMarqueur('client.messages.create({ system: systemPourAppel(s), messages })')).toEqual({ total: 1, fautifs: [] });
        // Deux appels : le 2ᵉ ne peut pas s'abriter derrière le marqueur du 1ᵉʳ.
        const deux = 'a.messages.create({ system: systemPourAppel(s) }); b.messages.create({ system: s })';
        expect(sitesSansMarqueur(deux).fautifs).toHaveLength(1);
        // …ni le 1ᵉʳ derrière celui du 2ᵉ (le DERNIER site d'un fichier n'est plus « sauvé » par la suite).
        const inverse = 'a.messages.create({ model: m }); b.messages.create({ system: systemPourAppel(s) })';
        expect(sitesSansMarqueur(inverse).fautifs).toHaveLength(1);
        // Autres méthodes et accès par crochets : vus aussi.
        expect(sitesSansMarqueur('client.messages.parse({ system: s })').fautifs).toHaveLength(1);
        expect(sitesSansMarqueur("client.messages['create']({ system: s })").fautifs).toHaveLength(1);
        // Parenthèses imbriquées dans les arguments : l'appel est lu jusqu'à SA parenthèse fermante.
        expect(sitesSansMarqueur('c.messages.stream({ model: f(x), system: systemPourAppel(g(y)) }, { signal })').fautifs).toHaveLength(0);
    });

    it('anti-vacuité : le balayage voit au moins les 5 points de contact mesurés (2026-09-29)', () => {
        expect(fichiers.length).toBeGreaterThanOrEqual(200);
        const total = scan.reduce((n, s) => n + s.total, 0);
        expect(total).toBeGreaterThanOrEqual(5);
    });

    it('AUCUN point de contact SDK de production n\'envoie un system sans marqueur', () => {
        const fautifs = scan.filter((s) => s.fautifs.length > 0).map((s) => `${s.fichier} (${s.fautifs.length})`);
        expect(fautifs, 'appel SDK sans `system: systemPourAppel(...)` — le marqueur de données fictives manquerait').toEqual([]);
    });
});
