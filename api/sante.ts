// api/sante.ts — sonde de santé de la fonction Vercel (grille de conformité, ligne 9 ; test de fumée commun de MoKarade/.github).
// Chemin STATIQUE exact : Vercel ne route pas les attrape-tout sur ce projet Vite (cf tests/api/relayRouteStatique.test.ts).
// Ne lit rien, n'appelle personne : si elle répond, la plateforme sert bien les fonctions. Aucune donnée perso ni secret.

export const config = { runtime: 'nodejs' };

const ENTETES = { 'content-type': 'application/json', 'cache-control': 'no-store' } as const;

export function repondreSante(request: Request): Response {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(JSON.stringify({ error: 'Méthode non permise.' }), { status: 405, headers: { ...ENTETES, allow: 'GET, HEAD' } });
    }
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true }), { status: 200, headers: ENTETES });
}

export default {
    fetch(request: Request): Response {
        return repondreSante(request);
    },
};
