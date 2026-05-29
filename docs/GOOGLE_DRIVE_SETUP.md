# Activer la sync Google Drive — procédure (à faire par Marc)

> La feature de synchronisation (`docs/GOOGLE_DRIVE_SYNC_DESIGN.md`) est **livrée mais inerte**
> tant que `VITE_GOOGLE_CLIENT_ID` n'est pas défini : la carte « Synchronisation Google Drive »
> reste masquée et aucun appel Google n'est fait. Ces étapes créent le Client ID OAuth requis.
>
> ⚠️ Ces actions touchent une console de credentials — **Claude ne peut pas les faire à ta place**.

---

## 1. Google Cloud Console (projet `financeai-497112`, déjà existant)

### A — Activer l'API Drive
1. `console.cloud.google.com` → projet **`financeai-497112`**.
2. **APIs & Services → Library** → chercher **Google Drive API** → **Enable**.

### B — Écran de consentement OAuth
1. **APIs & Services → OAuth consent screen**.
2. L'app existe déjà (créée pour Cloudflare Access). **Edit app** → onglet **Scopes** →
   **Add or remove scopes** → ajouter :
   - `.../auth/drive.appdata` (« See, edit, create, delete only its own configuration data »)
   - `.../auth/userinfo.email` (affiche le compte connecté)
3. En mode **Testing** : section **Test users** → vérifier que `marc.richard4@gmail.com` y est
   (sinon l'ajouter). En mode **Published** : rien à faire (mais Google peut exiger une revue
   pour `drive.appdata` si tu publies largement — pour un usage perso/restreint, garde Testing).

### C — Créer le Client ID OAuth « Web »
1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type : Web application**. Nom : `FinanceAI Drive Sync`.
3. **Authorized JavaScript origins** (PAS de redirect URI, PAS de secret) :
   - `https://www.hubperso.com`
   - `http://localhost:5173` (dev local Vite)
4. **Create** → copier le **Client ID** (`…apps.googleusercontent.com`). Il est **public**
   (pas de secret pour le flux token navigateur GIS).

---

## 2. Configurer la variable d'env

Le code lit `VITE_GOOGLE_CLIENT_ID` (cf `.env.example`).

- **Local** : créer `.env` à la racine → `VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com`.
- **Prod (Vercel)** : Project Settings → **Environment Variables** → ajouter
  `VITE_GOOGLE_CLIENT_ID` = le Client ID, pour **Production** (et Preview si voulu) → **Redeploy**.

Au prochain build, la carte « Synchronisation Google Drive » apparaît dans **Réglages → Système
→ Sauvegarde & données**.

---

## 3. Tester (de bout en bout)

1. Ouvre l'app → Réglages → la carte sync est visible → **Connecter Google Drive** → consentement
   Google (drive.appdata + email) → « Connecté : ton@email ».
2. **Sauvegarder maintenant** → un fichier `financeai-sync.json` est créé dans l'`appDataFolder`
   (invisible dans l'UI Drive, c'est normal).
3. **Navigation privée** → `www.hubperso.com` → login Cloudflare (Google) → app vide → la carte
   sync → **Connecter** → tes données sont **restaurées** (l'app recharge).

---

## 4. Limites connues / sécurité

- **Pas de chiffrement applicatif** (choix assumé) : le blob dans Drive est lisible via ton compte
  Google. Une passphrase optionnelle pourra être ajoutée plus tard (champ `enc` réservé).
- **Clés API non synchronisées** (volontaire — ce sont des credentials actifs). À ressaisir par
  appareil.
- **Multi-appareils concurrents** : la garde anti-perte gère les divergences au login (bandeau
  conflit). Pendant une même session, c'est last-write-wins.
- **Révoquer l'accès** : carte → **Déconnecter** (révoque le token + efface les métadonnées
  locales ; les données dans Drive restent — supprimables depuis
  myaccount.google.com → Données et confidentialité → Apps tierces, ou via un futur bouton).
