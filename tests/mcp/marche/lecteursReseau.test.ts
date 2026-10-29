import { describe, it, expect } from 'vitest';
import { creerLecteursReseau } from '../../../mcp/marche/lecteursReseau';

const CLE = 'cle-eodhd-temoin-9d41';

type Rep = { ok: boolean; status: number; json(): Promise<unknown> };
const rep = (corps: unknown, status = 200): Rep => ({ ok: status >= 200 && status < 300, status, json: async () => corps });

describe('[MARCHE-LECTEURS] lecteurs réseau', () => {
    it('EODHD : appelle l\'URL de clôtures avec la clé et lit le cours BRUT (close)', async () => {
        const urls: string[] = [];
        const l = creerLecteursReseau(CLE, async (u) => { urls.push(u); return rep([{ date: '2026-10-27', close: 10, adjusted_close: 9 }]); });
        const lu = await l.lireClotures('ABC.US', '2026-10-01', '2026-10-28');
        expect(lu).toEqual({ statut: 'ok', points: [['2026-10-27', 10]], ecartes: 0 });
        expect(urls[0]).toContain('/api/eod/ABC.US');
        expect(urls[0]).toContain(`api_token=${CLE}`);
    });

    it('BdC : appelle la SÉRIE de la devise (jamais le groupe) et lit les taux', async () => {
        const urls: string[] = [];
        const l = creerLecteursReseau(CLE, async (u) => { urls.push(u); return rep({ observations: [{ d: '2026-10-27', FXUSDCAD: { v: '1.4038' } }] }); });
        const lu = await l.lireTaux('USD', '2026-10-01', '2026-10-28');
        expect(lu).toEqual({ statut: 'ok', points: [['2026-10-27', 1.4038]], ecartes: 0 });
        expect(urls[0]).toContain('/observations/FXUSDCAD/json');
        expect(urls[0]).not.toContain(CLE);
    });

    it('HTTP en erreur : lève une cause FIXE, sans URL ni clé ni symbole', async () => {
        const l = creerLecteursReseau(CLE, async () => rep('Unauthenticated', 401));
        const err = await l.lireClotures('ABC.US', '2026-10-01', '2026-10-28').catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        const m = (err as Error).message;
        expect(m).toBe('source : HTTP 401');
        expect(m).not.toContain(CLE);
        expect(m).not.toContain('ABC');
    });

    it('réseau cassé (le fetch lève avec l\'URL dans son message) : cause fixe, l\'URL ne ressort pas', async () => {
        const l = creerLecteursReseau(CLE, async (u) => { throw new Error(`échec ${u}`); });
        const err = await l.lireClotures('ABC.US', '2026-10-01', '2026-10-28').catch((e: Error) => e);
        expect((err as Error).message).toBe('source injoignable ou trop lente');
        expect((err as Error).message).not.toContain(CLE);
    });

    it('réponse non JSON : cause fixe', async () => {
        const l = creerLecteursReseau(CLE, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError(CLE); } }));
        const err = await l.lireTaux('USD', '2026-10-01', '2026-10-28').catch((e: Error) => e);
        expect((err as Error).message).toBe('source : réponse non JSON');
    });

    it('une réponse 200 qui n\'a pas la forme attendue est rendue comme erreur de forme, pas comme des points', async () => {
        const l = creerLecteursReseau(CLE, async () => rep('Invalid API key'));
        const lu = await l.lireClotures('ABC.US', '2026-10-01', '2026-10-28');
        expect(lu.statut).toBe('erreur');
        expect(JSON.stringify(lu)).not.toContain('Invalid');
    });

    it('un symbole mal formé est refusé AVANT tout appel', async () => {
        let appele = false;
        const l = creerLecteursReseau(CLE, async () => { appele = true; return rep([]); });
        await expect(l.lireClotures('../etc', '2026-10-01', '2026-10-28')).rejects.toThrow();
        expect(appele).toBe(false);
    });
});
