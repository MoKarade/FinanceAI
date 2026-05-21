/// <reference types="vite/client" />

// Phase A.4 — version exacte, injectée par Vite define au build.
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_DATE__: string;

// Support Vite ?raw imports pour CSV bundlés (mode test).
declare module '*.csv?raw' {
    const content: string;
    export default content;
}

