/// <reference types="vite/client" />

// Variables d'env exposées au front (préfixe VITE_). VITE_GOOGLE_CLIENT_ID active la sync
// Google Drive (feature inerte si absent) — cf docs/GOOGLE_DRIVE_SYNC_DESIGN.md.
// VITE_GOOGLE_GATE (R2) active le login Google OBLIGATOIRE (gate qui remplace Cloudflare Access) :
// nécessite AUSSI un Client ID. Découplé du Client ID pour que « déployer ≠ activer ».
interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID?: string;
    readonly VITE_GOOGLE_GATE?: string;
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Phase A.4 — version exacte, injectée par Vite define au build.
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_DATE__: string;

// Support Vite ?raw imports pour CSV bundlés (mode test).
declare module '*.csv?raw' {
    const content: string;
    export default content;
}

