# Auth setup — Cloudflare Access + Google OAuth

> Documentation post-implémentation de [ADR 007](adr/007-auth-cloudflare-access.md).
> Setup réalisé et validé le **2026-05-22**. L'app `hubperso.com` est désormais
> protégée : seul `marc.richard4@gmail.com` peut y accéder, via Google OAuth.
>
> Ce doc contient la **config réelle qui fonctionne** + le **journal de debug**
> (toutes les erreurs rencontrées et leur cause). En cas de pépin futur, commence
> par la section « Dépannage ».

---

## 1. Architecture finale

```
hubperso.com (apex)
  · DNS Cloudflare, proxied (nuage orange)
  · Aucun mapping Vercel (l'apex ne sert jamais l'app directement)
  · Cloudflare Redirect Rule 301 → https://www.hubperso.com
        │
        ▼
www.hubperso.com (domaine canonique)
  · DNS Cloudflare, proxied (nuage orange)
  · Vercel : "Valid Configuration" (projet finance-ai)
  · Cloudflare Access — application Self-hosted "FinanceAI"
        policy : Allow si email == marc.richard4@gmail.com
        IdP    : Google OAuth
        session: 24h
        │
        ├─ pas de JWT valide → page login Cloudflare → Google OAuth
        └─ JWT valide        → forward vers l'origin Vercel
```

**Pourquoi `www` est canonique et pas l'apex** : Vercel ne gardait que
`www.hubperso.com` en « Valid Configuration ». L'apex `hubperso.com` pointait
vers une ancienne valeur invalide. Plutôt que de réparer l'apex côté Vercel, on
le traite comme une simple porte d'entrée qui redirige (301) vers `www`. Comme
`www` impose Access, toute requête finit authentifiée — l'apex ne peut pas servir
l'app par un chemin détourné.

---

## 2. Config de référence

Valeurs réelles de ce déploiement (à connaître pour tout dépannage) :

| Élément | Valeur |
|---------|--------|
| Account ID Cloudflare | `208ebb90ff33e8fca712cb5ff86868ba` |
| Team name Zero Trust | `hubperso` |
| Team domain | `hubperso.cloudflareaccess.com` |
| Callback URL OAuth | `https://hubperso.cloudflareaccess.com/cdn-cgi/access/callback` |
| Nameservers (auto, Cloudflare Registrar) | `elsa.ns.cloudflare.com`, `michael.ns.cloudflare.com` |
| Projet Vercel | `finance-ai` |
| Domaine canonique | `www.hubperso.com` |
| Google Cloud — projet | `financeai-497112` |
| Google OAuth — App ID | le **Client ID** (`…apps.googleusercontent.com`), PAS l'ID de projet |
| Access — email autorisé | `marc.richard4@gmail.com` |
| Access — durée de session | 24 h |

> Le domaine a été acheté **chez Cloudflare Registrar** → les nameservers sont
> déjà Cloudflare automatiquement. Aucun changement de NS chez un registrar tiers
> n'a été nécessaire.

---

## 3. Procédure (ordre réel)

### Étape A — Identity Provider Google dans Zero Trust

1. Zero Trust → **Settings → Authentication → Login methods → Add new → Google**
2. Le **callback URL** est affiché en haut de la popup :
   `https://hubperso.cloudflareaccess.com/cdn-cgi/access/callback` — le copier.

### Étape B — OAuth client dans Google Cloud Console

1. `console.cloud.google.com` → projet `financeai-497112`
2. **OAuth consent screen** : External, app name `FinanceAI`, support email
   `marc.richard4@gmail.com`, scopes `userinfo.email` + `userinfo.profile` +
   `openid`. En mode « Testing » → ajouter `marc.richard4@gmail.com` en **Test user**.
3. **Credentials → Create OAuth client ID → Web application** :
   - Authorized redirect URI : le callback URL de l'étape A (exact, sans slash final)
4. Copier le **Client ID** (`…apps.googleusercontent.com`) et le **Client secret**.

### Étape C — Brancher Google dans Cloudflare

1. Retour Zero Trust → Google IdP :
   - **App ID** = Client ID Google (le long, pas l'ID de projet)
   - **Client secret** = le secret Google
   - **Email claim** : laisser vide (ou `email`), surtout PAS une adresse
2. Save → **Test** → doit aboutir à un login Google réussi.

### Étape D — DNS de l'apex et de www (Cloudflare)

1. Le record `www` doit être **Proxied** (nuage orange) — sinon Access ne peut
   pas l'intercepter.
2. L'apex `hubperso.com` : proxied aussi, mais pas besoin de pointer vers Vercel
   (voir étape F).

### Étape E — Application Access

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**
2. Application name `FinanceAI`, session 24h
3. **Application domain** : sélectionner `www.hubperso.com` **via le dropdown de
   zone** (ne pas taper en texte libre — sinon la zone n'est pas reconnue).
4. Policy : name `Marc only`, action **Allow**, Include → Emails →
   `marc.richard4@gmail.com`
5. Identity providers : cocher **Google** → Save.

### Étape F — Redirect apex → www

1. Cloudflare → **Rules → Redirect Rules → Create rule**
2. Quand `Hostname` equals `hubperso.com` → Static redirect →
   `https://www.hubperso.com` → **301**

### Étape G — Validation

- Fenêtre privée **fraîche** → `https://www.hubperso.com` → page login Cloudflare
- Login `marc.richard4@gmail.com` → app accessible
- `https://hubperso.com` → redirige vers `www` → login requis également
- Un autre Gmail → refusé (403)

---

## 4. Dépannage — journal des erreurs réelles

Toutes ces erreurs ont été rencontrées pendant le setup. Garde-les sous la main.

### `Error 401: invalid_client` (Google) — « The OAuth client was not found »

**Cause** : dans le champ **App ID** de Cloudflare, l'**ID de projet** Google
(`financeai-497112`) avait été collé au lieu du **Client ID** OAuth.
**Fix** : mettre le vrai Client ID (`…apps.googleusercontent.com`), trouvé dans
Google Cloud → APIs & Services → Credentials → OAuth 2.0 Client IDs.
Vérifier aussi que le redirect URI Google correspond exactement au callback
Cloudflare, et que l'email est en Test user si l'app est en mode Testing.

### `Error 1033` (Cloudflare) — première occurrence

**Cause** : l'application Access n'était pas encore créée. Le domaine passait par
Cloudflare mais aucune app ne le prenait en charge.
**Fix** : créer l'application Self-hosted (étape E).

### `404` sur `/cdn-cgi/access/login`

**Cause** : Access ne s'appliquait pas au hostname — le domaine de l'app n'était
pas lié à la zone Cloudflare (saisi en texte libre au lieu du dropdown de zone).
**Fix** : recréer l'app en **sélectionnant la zone dans le dropdown**. Vérifier
que la zone `hubperso.com` est **Active** (pas Pending) dans le dashboard.

### L'app s'ouvre sans demander de login

**Cause** : un cookie JWT Access valide était déjà présent (test Google réussi
plus tôt, session 24h).
**Fix** : tester dans une **fenêtre privée fraîche** (fermer/rouvrir). Si ça
demande le login en privé, Access fonctionne — c'était juste la session en cache.

### `Error 1033` (Cloudflare) — seconde occurrence, après login

**Cause** : Access interceptait bien (login affiché) mais l'origin était
injoignable. Le CNAME de l'apex `hubperso.com` pointait vers une ancienne valeur
invalide (Vercel affichait « Invalid Configuration » pour ce domaine).
**Fix** : ne plus servir l'app depuis l'apex — le rediriger vers `www` (étape F).

### `404: NOT_FOUND` avec un ID `yul1::…` (Vercel)

**Cause** : c'est une erreur **Vercel** (format d'ID de requête Vercel). Le
domaine demandé n'était plus associé au projet `finance-ai`. Seul
`www.hubperso.com` y restait en « Valid Configuration ».
**Fix** : utiliser `www.hubperso.com` comme domaine canonique ; l'apex redirige
vers lui via la Redirect Rule.

### `hubperso.com` (sans `https://`) bypasse l'auth

**Cause** : taper `hubperso.com` sans protocole → le navigateur tente
`http://hubperso.com` → redirection 307 vers `www` → quand `www` était encore en
DNS only, la requête contournait Access.
**Fix** : `www` en Proxied (étape D) + Redirect Rule sur l'apex (étape F). Une
fois `www` proxied ET protégé par Access, plus aucun chemin ne contourne l'auth.

---

## 5. Maintenance

### Ajouter une personne (ex. conjoint·e)

Zero Trust → Access → Applications → FinanceAI → policy `Marc only` → Include →
Emails → ajouter l'adresse. Aucune autre étape.

### Forcer une re-authentification

Réduire « Session Duration » de l'app, ou révoquer les sessions dans
Zero Trust → **Logs → Access** (révocation par utilisateur).

### Consulter les tentatives d'accès

Zero Trust → **Logs → Access** : chaque tentative (autorisée ou refusée), IP,
email, horodatage.

### Si la PWA ne s'installe plus après Access

Whitelister `/sw.js` et `/manifest.json` via une policy **Bypass** (ou un
Service Token) sur ces chemins. Non observé à ce jour — à surveiller.

### Mode bypass d'urgence

Si Access casse l'accès légitime, désactiver temporairement l'app dans
Zero Trust → Access → Applications → FinanceAI → désactiver, le temps de
diagnostiquer. Le DNS reste proxied, l'app redevient publique le temps du fix.

---

## 6. Limites connues

- **`dangerouslyAllowBrowser`** : la clé Anthropic est utilisée côté navigateur.
  Access bloque l'accès non-authentifié en amont, donc le risque XSS d'exfiltration
  est fortement réduit, mais pas nul. Voir A7 (backend proxy) dans
  [ACTIONS_MARC.md](ACTIONS_MARC.md).
- **localStorage en clair** : Access protège l'accès réseau, pas le vol de laptop
  déverrouillé. Voir A8 (chiffrement passphrase) / H1 dans l'ADR.
- **Apex non-protégé directement** : `hubperso.com` n'a pas d'app Access propre,
  il redirige vers `www`. Sûr tant que l'apex ne sert aucun contenu (pas de
  mapping Vercel + Redirect Rule). Si un jour l'apex sert l'app, il faudra une
  app Access dédiée sur l'apex aussi.
- **Clés API** : depuis 2026-05-25 elles sont **chiffrées au repos** (AES-256-GCM,
  clé non-extractible IndexedDB — `services/secureKeyStore.ts`). Protège contre une
  fuite at-rest, pas contre un XSS actif. A8 (passphrase) n'est donc plus prioritaire.

---

## 7. Donner l'accès à d'autres personnes (ajouter un user / rendre public)

> ⚠️ Ces opérations modifient des **contrôles d'accès** — Claude ne peut pas les
> faire à ta place. Tu les fais toi-même dans le dashboard Cloudflare. L'app est
> **local-first** : chaque visiteur a son propre stockage navigateur isolé, donc
> ouvrir l'accès **n'expose jamais tes données** (les autres arrivent sur une app
> vierge, leurs données restent chez eux).

### 7.1 Ajouter UN utilisateur (par email) — recommandé pour tester
1. **Cloudflare → Zero Trust → Access → Applications → FinanceAI → Edit**.
2. Onglet **Policies** → édite la policy `Allow`.
3. Dans **Include**, ajoute un bloc `Emails` (ou utilise `Emails` en liste) et mets
   l'adresse Gmail de la personne, à côté de `marc.richard4@gmail.com`.
   - Alternative plus large : `Include → Emails ending in → @ton-domaine.com`.
4. **Save**. La personne se connecte sur `www.hubperso.com` avec **son** Google →
   elle a sa propre app vierge. Aucun déploiement nécessaire.

### 7.2 Ouvrir au public
Deux variantes :
- **Public mais connecté (recommandé)** : policy `Allow` → `Include → Everyone`
  **en gardant l'IdP Google**. N'importe qui se connecte avec son Google ; tu gardes
  une identité par user (utile si on rebranche un jour le déverrouillage par login).
- **Public total (sans login)** : **supprime** l'application Access `FinanceAI`
  (Applications → … → Delete). Le site devient accessible à tous sans authentification.
  ⚠️ Dans ce cas il n'y a plus de gate Google ; garde la **CSP stricte** (déjà en place).

### 7.3 Avant d'ouvrir — checklist
- ✅ Isolation par navigateur (aucune fuite cross-user — confirmé par l'audit sécu).
- ✅ Aucun secret en dur dans le bundle (clés saisies par chaque user).
- ⏳ **Recommandé** (voir [BACKLOG.md](BACKLOG.md)) : consolider la persistance (dette),
  rendre le backup automatique, et ajouter un onboarding « tes données restent dans
  CE navigateur — fais une sauvegarde » pour gérer honnêtement la perte de données.

### 7.4 Personnaliser la page de connexion
- **Cloudflare → Zero Trust → Settings → Custom Pages** + onglet **Appearance** de
  l'app Access : logo, nom d'org, couleurs (HTML custom = Enterprise seulement).
- **Écran « Se connecter avec Google »** : Google Cloud Console → APIs & Services →
  OAuth consent screen (nom d'app, logo, email de support).
