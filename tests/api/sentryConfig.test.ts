// [SENTRY-BRANCHER] Verrou du signalement des erreurs à Sentry (FinanceAI#1171).
//
// Trois promesses : (1) sans DSN rien ne part et le SDK n'est même pas chargé ; (2) même avec un DSN aucune
// donnée personnelle ne part, et le MESSAGE de l'erreur non plus (il peut porter un symbole boursier ou le
// texte d'une conversation financière) ; (3) un échec du signalement ne casse jamais la réponse.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { optionsSentry, retirerDonneesPersonnelles } from '../../api/_lib/sentryConfig';

const ROOT = resolve(__dirname, '../..');
const lire = (chemin: string): string => readFileSync(resolve(ROOT, chemin), 'utf8');

describe('optionsSentry', () => {
    it('est éteint sans DSN (absent, vide ou en blancs)', () => {
        for (const dsn of [undefined, '', '   ']) {
            const options = optionsSentry(dsn);
            expect(options.enabled, `dsn = ${JSON.stringify(dsn)}`).toBe(false);
            expect(options.dsn).toBeUndefined();
        }
    });

    it('est allumé avec un DSN, sans traces ni donnée personnelle par défaut', () => {
        const options = optionsSentry('  https://cle@exemple.invalid/1  ');
        expect(options.enabled).toBe(true);
        expect(options.dsn).toBe('https://cle@exemple.invalid/1');
        expect(options.sendDefaultPii).toBe(false);
        expect(options.tracesSampleRate).toBe(0);
    });
});

describe('retirerDonneesPersonnelles', () => {
    it('retire requête, utilisateur, extras, traces de console et nom de machine, garde le type et la pile', () => {
        const evenement = retirerDonneesPersonnelles({
            request: { url: 'https://exemple.invalid/api/yahoo/history?symbol=FICTIF', headers: { authorization: 'fictif' } },
            user: { ip_address: '203.0.113.7', email: 'fictif@exemple.invalid' },
            extra: { portefeuille: 'fictif' },
            breadcrumbs: [{ message: 'FICTIF 1234,56 $' }],
            server_name: 'machine-fictive',
            exception: { values: [{ type: 'TypeError', value: 'Cannot read FICTIF 1234,56 $' }] },
        } as Parameters<typeof retirerDonneesPersonnelles>[0]);
        expect(evenement).toEqual({ exception: { values: [{ type: 'TypeError', value: 'TypeError' }] } });
    });

    it('retire aussi le message libre et accepte un événement sans exception', () => {
        expect(retirerDonneesPersonnelles({ message: 'FICTIF 1234,56 $' })).toEqual({});
        expect(retirerDonneesPersonnelles({})).toEqual({});
    });

    it("donne 'Error' à une exception sans type, plutôt que de garder son message", () => {
        const evenement = retirerDonneesPersonnelles({ exception: { values: [{ value: 'secret fictif' }] } });
        expect(evenement.exception?.values?.[0]?.value).toBe('Error');
    });

    it('est bien branché dans les options (beforeSend)', () => {
        const options = optionsSentry('https://cle@exemple.invalid/1');
        expect(options.beforeSend({ user: { email: 'x' } } as never)).not.toHaveProperty('user');
    });
});

describe('signalerErreur', () => {
    const sdk = { init: vi.fn(), captureException: vi.fn(), flush: vi.fn() };

    beforeEach(() => {
        vi.resetModules();
        sdk.init.mockReset();
        sdk.captureException.mockReset();
        sdk.flush.mockReset().mockResolvedValue(true);
        vi.doMock('@sentry/node', () => sdk);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.doUnmock('@sentry/node');
        vi.restoreAllMocks();
    });

    it('sans DSN : ne charge pas le SDK et ne fait rien', async () => {
        vi.stubEnv('SENTRY_DSN', '');
        const { signalerErreur } = await import('../../api/_lib/sentry');
        await signalerErreur(new Error('x'), 'test');
        expect(sdk.init).not.toHaveBeenCalled();
        expect(sdk.captureException).not.toHaveBeenCalled();
    });

    it("avec un DSN : initialise par optionsSentry (intégrations coupées), capture, puis attend l'envoi", async () => {
        vi.stubEnv('SENTRY_DSN', 'https://cle@exemple.invalid/1');
        const { signalerErreur } = await import('../../api/_lib/sentry');
        const erreur = new TypeError('symbole fictif');
        await signalerErreur(erreur, 'relais-claude');
        await signalerErreur(erreur, 'relais-claude');
        expect(sdk.init).toHaveBeenCalledTimes(1);
        const options = sdk.init.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(options).toMatchObject({ dsn: 'https://cle@exemple.invalid/1', enabled: true, sendDefaultPii: false, tracesSampleRate: 0, defaultIntegrations: false });
        expect(typeof options.beforeSend).toBe('function');
        expect(sdk.captureException).toHaveBeenCalledWith(erreur, { tags: { source: 'relais-claude' } });
        expect(sdk.flush).toHaveBeenCalledTimes(2);
    });

    it("un échec de l'envoi ne lève pas et n'est tracé que par son nom", async () => {
        vi.stubEnv('SENTRY_DSN', 'https://cle@exemple.invalid/1');
        sdk.flush.mockRejectedValue(new RangeError('message fictif à ne pas tracer'));
        const trace = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { signalerErreur } = await import('../../api/_lib/sentry');
        await expect(signalerErreur(new Error('x'), 'test')).resolves.toBeUndefined();
        expect(trace).toHaveBeenCalledWith('[sentry] signalement impossible:', 'RangeError');
    });
});

describe('branchement', () => {
    const HANDLERS = ['api/claude/v1/messages.ts', 'api/yahoo/history.ts', 'api/yahoo/search.ts', 'api/proxy/fintable.ts'];

    it('aucun fichier ne réactive l\'envoi de données personnelles', () => {
        for (const chemin of ['api/_lib/sentryConfig.ts', 'api/_lib/sentry.ts', 'scripts/sentry-essai.mjs']) {
            expect(lire(chemin), chemin).not.toMatch(/sendDefaultPii\s*:\s*true/);
        }
    });

    it('le signalement et l\'essai passent par optionsSentry, jamais par un Sentry.init libre', () => {
        expect(lire('api/_lib/sentry.ts')).toMatch(/Sentry\.init\(\{\s*\.\.\.optionsSentry\(/);
        expect(lire('scripts/sentry-essai.mjs')).toMatch(/Sentry\.init\(\{\s*\.\.\.options,/);
        expect(lire('scripts/sentry-essai.mjs')).toMatch(/const options = optionsSentry\(/);
    });

    it('chaque fonction à ceinture finale signale l\'exception imprévue, après sa trace par nom', () => {
        for (const chemin of HANDLERS) {
            const source = lire(chemin);
            expect(source, chemin).toMatch(/import \{ signalerErreur \} from '[./]+\/_lib\/sentry\.js';/);
            expect(source, chemin).toMatch(/\.catch\(async \(e\) => \{[\s\S]*console\.error\([^)]*exception non prévue[\s\S]*await signalerErreur\(e, '[a-z-]+'\);/);
        }
    });

    it('le workflow d\'essai est manuel seulement, borné, et ne lit que le secret du dépôt', () => {
        const workflow = lire('.github/workflows/sentry-essai.yml');
        expect(workflow).toMatch(/^on:\s*\n\s+workflow_dispatch:\s*$/m);
        expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
        expect(workflow).toMatch(/timeout-minutes:\s*\d+/);
        expect(workflow).toMatch(/SENTRY_DSN:\s*\$\{\{\s*secrets\.SENTRY_DSN\s*\}\}/);
    });
});
