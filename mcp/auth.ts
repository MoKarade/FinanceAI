#!/usr/bin/env node
// mcp/auth.ts
// Autorisation unique du connecteur à accéder à TON Google Drive (Lot 3).
// Lancement : npm run mcp:auth   (identifiants du client OAuth « Desktop » via env ou arguments)
//
//   GOOGLE_DESKTOP_CLIENT_ID=xxx GOOGLE_DESKTOP_CLIENT_SECRET=yyy npm run mcp:auth
//   ou : npm run mcp:auth -- <client_id> <client_secret>
//
// Ouvre le consentement Google (scope drive.appdata), récupère un refresh token et le stocke en local.
// Ensuite le connecteur lit/écrit ton blob Drive sans interaction. Aucun serveur hébergé.

import { runLoopbackAuth } from './drive/loopbackAuth';
import { credentialsPath } from './drive/tokenStore';
import { resolveSharedClient } from './drive/sharedClient';

// Arguments explicites en priorité, sinon le client OAuth FinanceAI PARTAGÉ (env / connector-client.json)
// → l'utilisateur n'a RIEN à créer dans Google Cloud.
const shared = resolveSharedClient();
const clientId = process.argv[2] || shared?.clientId;
const clientSecret = process.argv[3] || shared?.clientSecret;

if (!clientId || !clientSecret) {
    console.error('[mcp:auth] Aucun client OAuth disponible.');
    console.error('  Soit le client FinanceAI partagé est absent (connector-client.json / env),');
    console.error('  soit fournis le tien : npm run mcp:auth -- <client_id> <client_secret>');
    process.exit(1);
}

runLoopbackAuth({ clientId, clientSecret })
    .then(() => {
        console.error(`\n[mcp:auth] OK — autorisation enregistrée (${credentialsPath()}).`);
        console.error('[mcp:auth] Le connecteur lira/écrira désormais ton Google Drive. Redémarre Claude Desktop.');
        process.exit(0);
    })
    .catch((e) => {
        console.error('\n[mcp:auth] Échec :', e instanceof Error ? e.message : String(e));
        process.exit(1);
    });
