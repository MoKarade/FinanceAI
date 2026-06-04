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

const clientId = process.env.GOOGLE_DESKTOP_CLIENT_ID || process.argv[2];
const clientSecret = process.env.GOOGLE_DESKTOP_CLIENT_SECRET || process.argv[3];

if (!clientId || !clientSecret) {
    console.error('[mcp:auth] Identifiants OAuth « Desktop » manquants.');
    console.error('  GOOGLE_DESKTOP_CLIENT_ID=<id> GOOGLE_DESKTOP_CLIENT_SECRET=<secret> npm run mcp:auth');
    console.error('  (ou : npm run mcp:auth -- <client_id> <client_secret>)');
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
