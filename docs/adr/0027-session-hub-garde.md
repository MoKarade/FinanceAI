# ADR — La session du hub protège finance.hubperso.com, en remplacement de Cloudflare Access (Marc, reco B, 2026-10-28)

**Statut** : accepté, code livré (FinanceAI#1159, brouillon puis fusion par Mergify quand la route du hub est en ligne). Remplace
[0022](0022-cloudflare-access-mur-api.md) (Cloudflare Access ne fut jamais mis en service : pas de mur, mode observation).

## Contexte

Depuis 0022, le relais Claude et les proxys Yahoo/Fintable vérifient un jeton Cloudflare Access qui n'a jamais existé en
production : l'API répondait en « observation » à tout le monde. Le reste de l'écosystème (CarAI, BatchChef, JobAI, MemoryAI)
est déjà privé par la session du hub (cookie partagé `.hubperso.com`, connexion et autorisation centralisées dans le hub).
FinanceAI est une SPA Vite : pas d'Auth.js, pas de `AUTH_SECRET`. La vérification locale d'une session signée (clé publique du
hub, `AUTHORIZED_EMAIL`) demandait deux variables Vercel que le PC ne peut pas poser et que le hub n'émet pas encore (cookie ES256 = phase 2).

## Décision

1. **Le hub répond, FinanceAI ne vérifie rien lui-même.** Le hub expose `GET /api/session/moi` (Hubperso#601, nouveau fichier,
   hors middleware du hub : il lit la session lui-même) : `200 {"proprietaire": true|false}` ou `401`. Il n'est jamais mis en cache.
2. **`api/_lib/accesHub.ts`** transmet au hub (`https://www.hubperso.com`, jamais l'apex qui redirige : `fetch` perd le cookie
   à une redirection d'origine différente) SEULEMENT les cookies de session du hub (`__Secure-hub.session`,
   `__Secure-authjs.session-token[.N]`), `redirect:'manual'`, délai 4 s. `proprietaire:true` = ouvert ; `false` = 403 ; 401 = pas de
   session ; tout le reste (panne, redirection, réponse hors contrat) = 503. **Échec fermé, aucun mode observation, aucune variable
   qui coupe le contrôle.** Un « oui » est gardé 60 s par isolat, propre à son cookie (empreinte SHA-256) ; un refus n'est JAMAIS mis en cache et efface un « oui » périmé.
3. **`middleware.ts`** (Routing Middleware Vercel, Edge, sans `matcher`) met toute la surface derrière ce contrôle : page sans
   session → 302 vers `hubperso.com/login?callbackUrl=…` ; `/api/*` et méthodes non-GET → 401 JSON (jamais une redirection que `fetch` suivrait) ;
   autre courriel → 403 sans redirection (elle bouclerait). Exceptions, écrites dans le code et testées : `/api/sante` (sonde de fumée) et, en GET/HEAD par chemin exact, le manifeste PWA et ses icônes (FinanceAI#39, ils ne contiennent aucune donnée). La sonde de session expirée de l'app lit `/robots.txt`, qui reste protégé.
4. Le relais et les proxys **revérifient** (défense en profondeur : une fonction appelée hors du middleware refuse aussi).
5. **Aucun secret, aucune variable à poser.** `HUB_URL` (https seulement) ne sert qu'à la destination de la connexion.
6. Retirés : `jose`/JWT Cloudflare, `CF_ACCESS_*`, la confiance en `cf-connecting-ip` (falsifiable hors Cloudflare : l'IP de débit vient de `x-vercel-forwarded-for`).

## Conséquences

- (+) FinanceAI est fermée aux autres, dès le déploiement, sans geste de Marc ; une seule règle d'accès pour tout l'écosystème.
- (+) Rien à renouveler (pas de clé publique à pivoter) ; la révocation côté hub joue en 60 s au plus.
- (−) Chaque requête sans « oui » en mémoire coûte un aller-retour vers le hub (≤ 4 s) ; hub en panne = FinanceAI fermée (voulu).
- (−) Le hub devient indispensable à l'ouverture de l'app : `/api/sante` reste la seule route de données qui répond sans lui (le manifeste et les icônes, statiques, aussi).
- Retour arrière : `git revert` de la PR (le mur disparaît, l'API redevient ouverte comme avant ; le relais exige toujours une clé Anthropic valide).
- Piste séparée : faire lire cette route par `api/_lib/lia.ts` pour que LIA fonctionne dans FinanceAI.
