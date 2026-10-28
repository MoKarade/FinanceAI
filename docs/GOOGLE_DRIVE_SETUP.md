# GOOGLE_DRIVE_SETUP — créer le Client OAuth Google

> Procédure pour obtenir `VITE_GOOGLE_CLIENT_ID`. Ce **même** Client ID alimente DEUX choses :
> 1. la **sync Google Drive** (sauvegarde/restauration des données + clés API), et
> 2. le **gate de login in-app** (`VITE_GOOGLE_GATE`, remplace Cloudflare Access — cf `A_FAIRE_MOI` O1).
>
> Le Client ID est **PUBLIC** (pas un secret) : le flux est un token navigateur (Google Identity
> Services), il n'y a **pas de client secret** à protéger. Action **humaine** (Marc) : Claude ne peut
> pas créer le projet Google Cloud.

## Étapes (≈10 min)

1. **Projet** — [Google Cloud Console](https://console.cloud.google.com) → crée ou choisis un projet.
2. **API Drive** — APIs & Services → Library → active **Google Drive API**.
3. **OAuth consent screen** — type **External** ; nom d'app « FinanceAI » ; ajoute ton email en
   **Test user** (tant que l'app n'est pas « publiée », seuls les test users peuvent se connecter).
   **Scopes** : `.../auth/drive.appdata` (dossier privé de l'app — la sync) + `openid`, `email`,
   `profile` (identité pour le gate). Le scope `drive.appdata` est NON sensible (dossier caché propre
   à l'app) → pas de vérification Google lourde.
4. **Credentials** → Create credentials → **OAuth client ID** → type **Web application**.
   - **Authorized JavaScript origins** :
     - `https://TON-DOMAINE-PROD` (l'URL Vercel/le domaine custom)
     - `http://localhost:5173` (dev local Vite)
   - (Pas de « redirect URI » nécessaire : le flux token GIS utilise les origins, pas un redirect.)
5. **Copie le Client ID** (forme `xxxxx.apps.googleusercontent.com`).

## Activer dans l'app

| Variable | Rôle | Où |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | **Capacité** : permet la sync Drive ET arme le gate | Vercel env + `.env` local |
| `VITE_GOOGLE_GATE` | **Activation** : `1` bloque l'app derrière le login Google | Vercel env |

- `VITE_GOOGLE_CLIENT_ID` SEUL → la **sync Drive** marche, l'app reste ouverte (pas de gate).
- `VITE_GOOGLE_CLIENT_ID` **+** `VITE_GOOGLE_GATE=1` → **gate actif** (login obligatoire), prêt à
  remplacer Cloudflare. Découplage voulu : « déployer ≠ activer le blocage ».

Après mise à jour des variables → **redéploie** (Vercel).

## Valider

- Fenêtre privée neuve → prod → « Se connecter avec Google » → login → l'app se débloque + les données
  reviennent. **Trappe anti-lockout** : `?nogate=1` (ou « Continuer sans me connecter ») entre toujours
  dans l'app si Google tombe.

## Référence code
- `services/sync/authGate.ts` — logique pure du gate (capacité + activation + anti-lockout).
- `components/auth/LoginGate.tsx` — écran de login (enveloppe l'app dans `index.tsx`).
- `services/sync/syncOrchestrator.ts` — flux OAuth + pull/push Drive.
