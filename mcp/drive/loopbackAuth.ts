// mcp/drive/loopbackAuth.ts
//
// Lot 3 — flux OAuth INTERACTIF « installed app » (loopback 127.0.0.1) pour autoriser le connecteur
// une fois. Démarre un mini-serveur local, ouvre le navigateur sur le consentement Google, récupère le
// `code` sur la redirection, l'échange contre un refresh token, et le stocke localement (tokenStore).
// Tout reste sur la machine de Marc ; aucun serveur hébergé. (Nécessite son test en réel.)

import http from 'node:http';
import { exec } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { buildAuthUrl, exchangeCodeForTokens, DRIVE_SCOPES } from './oauth';
import { saveCredentials, credentialsPath } from './tokenStore';

function openBrowser(url: string): void {
    const cmd =
        process.platform === 'win32' ? `start "" "${url}"` :
        process.platform === 'darwin' ? `open "${url}"` :
        `xdg-open "${url}"`;
    exec(cmd, () => { /* best-effort : si ça échoue, l'URL est aussi imprimée dans le terminal */ });
}

function htmlPage(message: string): string {
    return `<!doctype html><html lang="fr"><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;background:#0b0b12;color:#eaeaf0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="max-width:480px;text-align:center;padding:24px"><h2 style="color:#8b8bff">FinanceAI · Connecteur</h2><p style="line-height:1.5">${message}</p></div></body></html>`;
}

/** Lance le consentement et stocke le refresh token. Résout quand l'autorisation est enregistrée. */
export function runLoopbackAuth(opts: { clientId: string; clientSecret: string }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let port = 0;
        let settled = false;
        const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

        const server = http.createServer((req, res) => {
            void (async () => {
                try {
                    const url = new URL(req.url || '/', 'http://127.0.0.1');
                    if (url.pathname !== '/') { res.writeHead(404); res.end(); return; }

                    const error = url.searchParams.get('error');
                    if (error) {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(htmlPage(`Autorisation refusée (${error}). Tu peux fermer cet onglet.`));
                        server.close();
                        finish(() => reject(new Error(`Consentement refusé : ${error}`)));
                        return;
                    }
                    const code = url.searchParams.get('code');
                    if (!code) { res.writeHead(400); res.end('Paramètre « code » manquant.'); return; }

                    const tokens = await exchangeCodeForTokens({
                        clientId: opts.clientId,
                        clientSecret: opts.clientSecret,
                        code,
                        redirectUri: `http://127.0.0.1:${port}`,
                    });
                    if (!tokens.refresh_token) {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(htmlPage("Aucun « refresh token » reçu (déjà consenti auparavant). Révoque l'accès de l'app dans ton compte Google, puis relance la commande."));
                        server.close();
                        finish(() => reject(new Error('Aucun refresh token reçu — révoque l\'accès puis relance.')));
                        return;
                    }
                    await saveCredentials({
                        clientId: opts.clientId,
                        clientSecret: opts.clientSecret,
                        refreshToken: tokens.refresh_token,
                        scope: tokens.scope,
                        obtainedAt: Date.now(),
                    });
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(htmlPage('Connecteur FinanceAI autorisé. Tu peux fermer cet onglet et revenir au terminal.'));
                    server.close();
                    finish(resolve);
                } catch (e) {
                    try { res.writeHead(500); res.end('Erreur interne.'); } catch { /* réponse déjà partie */ }
                    server.close();
                    finish(() => reject(e instanceof Error ? e : new Error(String(e))));
                }
            })();
        });

        server.on('error', (e) => finish(() => reject(e)));
        server.listen(0, '127.0.0.1', () => {
            port = (server.address() as AddressInfo).port;
            const authUrl = buildAuthUrl({ clientId: opts.clientId, redirectUri: `http://127.0.0.1:${port}`, scopes: DRIVE_SCOPES });
            console.error('\n[mcp:auth] Autorise le connecteur dans ton navigateur. Si l\'onglet ne s\'ouvre pas, copie cette URL :\n');
            console.error(authUrl + '\n');
            console.error(`[mcp:auth] (le refresh token sera stocké dans ${credentialsPath()})\n`);
            openBrowser(authUrl);
        });
    });
}
