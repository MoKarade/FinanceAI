# ADR — Cloudflare Access devant finance.hubperso.com, jeton vérifié par l'API (Marc via pole-securite, 2026-09-25)

**Statut** : accepté, code livré (PR `[CF-ACCESS]`, brouillon, non auto-fusionnée : `api/**`, `vercel.json`) ; mise en service par Marc
(`docs/A_FAIRE_MOI.md` → `[CF-ACCESS-MISE-EN-SERVICE]`). Remplace en partie [0002](0002-app-personnelle-relais-byok.md) (accès
au relais) et [0021](0021-relais-sans-jeton-public.md) (freins sans authentification). Remplace le lot A « passkey » (abandonné, ~28 h).

## Contexte

Le relais Claude (BYOK) et les proxys Yahoo/Fintable étaient joignables par quiconque connaît l'adresse, y compris l'alias
`*.vercel.app`. Les freins de 0021 (Origin, débit, vérification de clé) limitent l'abus mais n'authentifient personne. Access
avait déjà été utilisé puis retiré le 2026-06-16 (bug « Failed to fetch chunk » sur session expirée ; client OAuth Google
partagé avec Access).

## Décision

1. **Cloudflare Access** (Zero Trust gratuit) devant `finance.hubperso.com` : code à usage unique par e-mail, une seule
   politique Allow (l'e-mail de Marc), session ~30 j.
2. **Le vrai mur est dans l'API** : `api/_lib/accessJwt.ts` vérifie `Cf-Access-Jwt-Assertion` avec `jose` (6.2.3, MIT, exact ;
   déjà dans l'arbre via le SDK MCP) : RS256 seulement, `iss` exact, `aud` = `CF_ACCESS_AUD`, `exp` obligatoire, `nbf`, clé par
   `kid` (cache 10 min, un rafraîchissement / 30 s au plus), e-mail = `CF_ACCESS_EMAIL`. Le relais Claude répond 401 en enveloppe
   Anthropic, les proxys en JSON. C'est ce contrôle qui ferme `*.vercel.app` pour l'API, redirection ou non.
3. **`CF_ACCESS_REQUIRED`** : valeur absente = **exiger** ; observation seulement si la valeur vaut exactement `0` (repli de
   mise en service et de retour arrière). Configuration incomplète + exigé = refus (échec fermé).
4. **Proxys en fonctions gardées** (`api/yahoo/history.ts`, `api/yahoo/search.ts`, `api/proxy/fintable.ts`) : les réécritures
   `vercel.json` vers des hôtes externes disparaissent. Yahoo est **gardé par le jeton** (pas seulement limité en débit) : le
   navigateur de Marc passe par Cloudflare, aucune perte d'usage. Listes blanches de paramètres, hôte amont fixe, GET seul, 15 s.
5. **`ipClient`** : `cf-connecting-ip` n'est crue que si le jeton est valide (sinon tous les clients partagent l'IP de l'edge
   Cloudflare pour le débit, et l'en-tête est falsifiable hors Cloudflare).
6. **`vercel.json`** : redirection 302 de l'hôte `*.vercel.app` vers `finance.hubperso.com` ; les prévisualisations `claude/*`
   restent désactivées.
7. **Client** : `utils/sessionAccess.ts` sonde `/icon.svg` en `redirect: 'manual'` au retour dans l'onglet (≥ 1 min) et au retour
   du réseau ; une redirection = session expirée → rechargement (1 par minute au plus). Le service worker ne met JAMAIS en cache
   une réponse redirigée, opaque ou non « basic » (le HTML de connexion Access aurait sinon remplacé l'app), ni `/api/*`.
   Manifest en `crossorigin="use-credentials"`.

## Conséquences

- (+) L'API n'est plus un relais/proxy public ; coût nul ; aucun code d'authentification maison.
- (−) Dépendance à Cloudflare (compte = racine de confiance, 2FA à confirmer) ; Vercel déconseille un proxy devant lui
  ([Probable] sans incident, mode Full strict obligatoire).
- (−) Sans `CF_ACCESS_REQUIRED=0` au premier déploiement, l'IA texte et les cours tombent : c'est voulu (échec fermé), et
  documenté en tête de la procédure de Marc.
- Résidu **non traité** : la clé Anthropic (BYOK) reste dans le navigateur (IndexedDB chiffré) : un XSS pourrait la lire. Lot B
  (clé serveur) : ~18-20 h et nouvelle exposition (clé payante côté serveur : plafond de dépense dur chez Anthropic obligatoire)
  — remis au BACKLOG en option, pas recommandé maintenant.
- À vérifier après mise en service (ne peut pas l'être d'ici) : Access répond-il 401 au lieu de 302 aux `fetch` ? le
  rewrite `→ fonction` conserve-t-il la chaîne de requête d'origine sur Vercel ? l'IP `cf-connecting-ip` arrive-t-elle bien ?
