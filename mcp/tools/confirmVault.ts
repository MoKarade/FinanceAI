// mcp/tools/confirmVault.ts
//
// [MCP-CONFIRM-TOKEN] Jeton de confirmation À DEUX TEMPS, lié CÔTÉ SERVEUR, pour les outils d'ÉCRITURE
// du connecteur claude.ai. Avant : un booléen `confirm:true` fourni par le MODÈLE — un modèle piégé par
// un document (injection indirecte) l'envoyait dès le 1er appel, sans aperçu. Maintenant : l'écriture
// exige un jeton que SEUL le serveur émet, en réponse à un aperçu, et qui est :
//   - à USAGE UNIQUE (brûlé dès qu'il est présenté, même s'il est refusé) ;
//   - court (5 min) ;
//   - lié à la SESSION (une instance de coffre par session MCP + l'identifiant de session dans le MAC),
//     à l'OUTIL, aux ARGUMENTS exacts (empreinte canonique) ET aux CHANGEMENTS calculés (si l'état a
//     bougé entre l'aperçu et la confirmation, les changements diffèrent → refus, nouvel aperçu).
//
// Stockage : MÉMOIRE DU PROCESSUS, sans base. Le serveur Cloud Run n'a pas de stockage propre (l'état
// financier vit sur Drive) ; le jeton vaut 5 min ; un redémarrage ou une bascule d'instance PERD les
// jetons en attente → l'utilisateur refait simplement un aperçu (échec sûr, jamais une écriture non voulue).
// Le HMAC (clé aléatoire par processus, jamais persistée) empêche de fabriquer un jeton ; la table des
// nonces empêche de le rejouer. Instance min=0/multi-instances : chaque session tombe sur UNE instance
// pour ses appels dans la pratique ; sinon l'échec sûr ci-dessus s'applique.
//
// ⚠️ LIMITE ASSUMÉE : ce jeton prouve « aperçu émis, mêmes arguments, une seule fois, peu de temps
// avant » ; il ne prouve PAS qu'un humain a lu l'aperçu. Un modèle malveillant peut rappeler tout de
// suite avec le jeton. Le second temps est donc AUSSI un second appel d'outil d'écriture visible par
// l'utilisateur dans claude.ai (approbation par appel, annotations readOnlyHint:false). Sauvegarde
// horodatée avant chaque écriture = filet.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CONFIRM_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 100;

/** Sérialisation canonique (clés triées, récursif) : même empreinte quel que soit l'ordre des clés. */
export function canonicalJson(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
    if (v !== null && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
            .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return JSON.stringify(String(v));
    return JSON.stringify(v) ?? 'null';
}

export const digest = (v: unknown): string => createHash('sha256').update(canonicalJson(v)).digest('hex');

/** Ce à quoi un jeton est lié. */
export interface ConfirmBinding {
    scope: string;        // identifiant de session MCP (ou « local » en stdio)
    tool: string;
    argsHash: string;     // empreinte des arguments SANS le jeton
    changesHash: string;  // empreinte des changements calculés à l'aperçu
}

export type ConfirmVerdict = 'ok' | 'invalide' | 'inconnu_ou_rejoue' | 'expire' | 'different';

export interface ConfirmVault {
    issue(b: ConfirmBinding): { token: string; expiresInSec: number };
    /** Consomme (brûle) le jeton présenté. Un seul essai par jeton, succès ou échec. */
    consume(token: string, b: ConfirmBinding): ConfirmVerdict;
}

export function createConfirmVault(opts?: { now?: () => number; ttlMs?: number; secret?: Buffer }): ConfirmVault {
    const now = opts?.now ?? (() => Date.now());
    const ttl = opts?.ttlMs ?? CONFIRM_TTL_MS;
    const secret = opts?.secret ?? randomBytes(32);
    const pending = new Map<string, number>(); // nonce → échéance

    const mac = (nonce: string, exp: number, b: ConfirmBinding): string =>
        createHmac('sha256', secret)
            .update([nonce, exp, b.scope, b.tool, b.argsHash, b.changesHash].join('|'))
            .digest('hex');

    const prune = (): void => {
        const t = now();
        for (const [n, exp] of pending) if (exp <= t) pending.delete(n);
        // Plafond dur : on évince les plus anciens (Map garde l'ordre d'insertion).
        while (pending.size >= MAX_PENDING) {
            const oldest = pending.keys().next().value;
            if (oldest === undefined) break;
            pending.delete(oldest);
        }
    };

    return {
        issue(b) {
            prune();
            const nonce = randomBytes(16).toString('hex');
            const exp = now() + ttl;
            pending.set(nonce, exp);
            return { token: `${nonce}.${mac(nonce, exp, b)}`, expiresInSec: Math.floor(ttl / 1000) };
        },
        consume(token, b) {
            const m = /^([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(token);
            if (!m) return 'invalide';
            const [, nonce, given] = m;
            const exp = pending.get(nonce);
            if (exp === undefined) return 'inconnu_ou_rejoue';
            pending.delete(nonce); // brûlé quoi qu'il arrive
            if (now() > exp) return 'expire';
            const a = Buffer.from(given, 'hex');
            const e = Buffer.from(mac(nonce, exp, b), 'hex');
            return a.length === e.length && timingSafeEqual(a, e) ? 'ok' : 'different';
        },
    };
}
