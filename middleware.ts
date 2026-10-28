// middleware.ts — Routing Middleware de Vercel (runtime Edge), devant TOUT ce que sert finance.hubperso.com.
// [SESSION-HUB] 2026-10-28 (FinanceAI#1159, ADR 0023) : sans session du hub, rien n'est servi. La décision (et ses tests) vit
// dans `api/_lib/gardeSite.ts` (et `accesHub.ts`) ; ce fichier ne fait que la brancher. Les fonctions `api/` revérifient la session elles-mêmes.
//
// ⚠️ Pas de `matcher` : le middleware voit toutes les requêtes, et `/api/sante` est la seule exception, écrite DANS le code
// (testée). Un `matcher` qui exclurait des chemins les laisserait sans garde sans que rien ne le dise.
// ⚠️ Toute nouvelle route reste DERRIÈRE ce garde ; ne jamais lui ajouter d'exception « pour dépanner ».
import { next } from '@vercel/functions';
import { garderSite } from './api/_lib/gardeSite.js';

export default async function middleware(request: Request): Promise<Response> {
    const refus = await garderSite(request, (k) => process.env[k] || undefined);
    return refus ?? next();
}
