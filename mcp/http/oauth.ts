// mcp/http/oauth.ts
// [GODFILE-MCPHTTP] Flux OAuth 2.1 du serveur HTTP MCP (découverte RFC 8414/9728,
// enregistrement dynamique, formulaire d'autorisation avec plafond de tentatives, échange de
// code/refresh). Extrait tel quel de `mcp/http.ts`. ⚠️ Le LIMITEUR reste construit par le
// serveur (un par process — sa mémoire EST la protection) et arrive ici en paramètre.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthError, type OAuthProvider } from '../auth/oauthProvider';
import type { AttemptLimiter } from '../auth/rateLimit';
import { readBody, sendJson } from './plomberie';

const escapeHtml = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const authorizeFormHtml = (q: Record<string, string>, error?: string): string => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>FinanceAI — autorisation</title>
<style>body{font-family:system-ui;max-width:26rem;margin:4rem auto;padding:0 1rem;background:#0f1115;color:#e8eaf0}
input,button{font-size:1rem;padding:.6rem;width:100%;box-sizing:border-box;border-radius:.5rem;border:1px solid #333}
button{background:#2563eb;color:#fff;border:0;margin-top:.75rem;cursor:pointer}.err{color:#f87171}</style></head>
<body><h1>FinanceAI MCP</h1>
<p>Claude demande l'accès à tes finances. Entre ta <strong>clé d'accès</strong> pour autoriser.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="POST" action="/oauth/authorize">
${['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'response_type']
.map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(q[k] ?? '')}">`).join('\n')}
<input type="password" name="access_key" placeholder="Clé d'accès" autofocus autocomplete="current-password">
<button type="submit">Autoriser</button></form></body></html>`;

export const handleOAuth = async (
    auth: OAuthProvider,
    limiter: AttemptLimiter,
    url: string,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> => {
    if (url === '/.well-known/oauth-authorization-server') {
        sendJson(res, 200, auth.authorizationServerMetadata());
        return true;
    }
    if (url === '/.well-known/oauth-protected-resource') {
        sendJson(res, 200, auth.protectedResourceMetadata());
        return true;
    }
    if (url === '/oauth/register' && req.method === 'POST') {
        let body: { redirect_uris?: string[] };
        try {
            body = JSON.parse(await readBody(req)) as { redirect_uris?: string[] };
        } catch {
            throw new OAuthError('invalid_request', 'Corps JSON invalide.');
        }
        sendJson(res, 201, auth.registerClient(body.redirect_uris ?? []));
        return true;
    }
    if (url === '/oauth/authorize' && req.method === 'GET') {
        const q = Object.fromEntries(new URL(req.url ?? '/', 'http://x').searchParams);
        auth.validateAuthorizeRequest(q);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(authorizeFormHtml(q));
        return true;
    }
    if (url === '/oauth/authorize' && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
        auth.validateAuthorizeRequest(form);
        // ⚠️ [MCP-CLOUDRUN-AUTH-HARDENING] Plafond AVANT toute comparaison de clé : c'est la
        // seule porte devinable du serveur (voir `mcp/auth/rateLimit.ts` pour le pourquoi du
        // compteur global et de la limite assumée en mémoire).
        if (limiter.isBlocked()) {
            const retryAfter = limiter.retryAfterSeconds();
            // ⚠️ [finding silent-failure-hunter, PR #566] Un blocage NON TRACÉ rend une attaque
            // invisible — et le runbook de rotation de clé (mcp/README.md) désigne justement
            // « une tentative suspecte dans les logs Cloud Run » comme son déclencheur. Sans
            // cette ligne, la doc décrivait un signal que le code ne produisait pas.
            console.error(
                `[FinanceAI MCP http] /oauth/authorize BLOQUÉ : quota d'échecs épuisé, `
                + `réessai dans ${retryAfter} s. Si ce n'est pas toi → runbook de rotation (mcp/README.md).`,
            );
            res.writeHead(429, {
                'Content-Type': 'text/html; charset=utf-8',
                'Retry-After': String(retryAfter),
            });
            res.end(authorizeFormHtml(
                form,
                `Trop de tentatives échouées. Réessaie dans ${Math.ceil(retryAfter / 60)} minute(s).`,
            ));
            return true;
        }
        let code: string;
        try {
            code = auth.authorize({
                clientId: form.client_id, redirectUri: form.redirect_uri,
                codeChallenge: form.code_challenge, accessKey: form.access_key ?? '',
            });
        } catch (err) {
            if (err instanceof OAuthError && err.code === 'access_denied') {
                limiter.recordFailure();
                // Tracé aussi : un pilonnage se voit à la RÉPÉTITION de cette ligne, pas
                // seulement au blocage final (qui n'arrive qu'au 8ᵉ échec).
                console.error('[FinanceAI MCP http] /oauth/authorize : clé d\'accès REFUSÉE.');
                res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(authorizeFormHtml(form, 'Clé d’accès invalide — réessaie.'));
                return true;
            }
            throw err;
        }
        // Succès : l'historique est effacé — l'usage légitime de Marc ne consomme aucun quota.
        limiter.reset();
        const target = new URL(form.redirect_uri);
        target.searchParams.set('code', code);
        if (form.state) target.searchParams.set('state', form.state);
        res.writeHead(302, { Location: target.toString() });
        res.end();
        return true;
    }
    if (url === '/oauth/token' && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
        if (form.grant_type === 'authorization_code') {
            sendJson(res, 200, auth.exchangeCode({
                code: form.code ?? '', clientId: form.client_id ?? '',
                clientSecret: form.client_secret, redirectUri: form.redirect_uri ?? '',
                codeVerifier: form.code_verifier ?? '',
            }));
        } else if (form.grant_type === 'refresh_token') {
            sendJson(res, 200, auth.refreshGrant({
                refreshToken: form.refresh_token ?? '', clientId: form.client_id ?? '',
                clientSecret: form.client_secret,
            }));
        } else {
            sendJson(res, 400, { error: 'unsupported_grant_type', error_description: 'authorization_code ou refresh_token.' });
        }
        return true;
    }
    return false;
};
