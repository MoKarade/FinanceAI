# Activer la sync Google Drive — procédure (à faire par Marc)

> La feature de synchronisation (`docs/GOOGLE_DRIVE_SYNC_DESIGN.md`) est **livrée mais inerte**
> tant que `VITE_GOOGLE_CLIENT_ID` n'est pas défini : la carte « ☁️ Synchronisation Google Drive »
> (Réglages → Configuration → 💾 Sauvegarde) reste masquée et aucun appel Google n'est fait.
> Ces étapes créent le Client ID OAuth requis. Compte ~15 min.
>
> ⚠️ Ces actions touchent une console de credentials → **Claude ne peut pas les faire à ta place.**
>
> ✅ **Vérifié côté app (2026-05-29)** : carte + CSP + chargement Google Identity Services + init du
> flux OAuth fonctionnent (testé localement avec un faux Client ID → Google répond `invalid_client`,
> preuve que la chaîne marche ; avec le **vrai** Client ID → écran de consentement). Il ne reste donc
> que ces étapes Google Cloud + la variable d'env.

---

## 0. Mettre la console Google Cloud en français (recommandé)

Les menus de la console sont en anglais par défaut. Pour tout afficher en **français**, ouvre :
```
https://console.cloud.google.com/?hl=fr
```
(`hl` = langue d'affichage.) *Alternative permanente : myaccount.google.com → Infos perso →
Préférences générales pour le Web → Langue → Français.*

Les libellés ci-dessous sont donnés **en français (anglais entre parenthèses)** pour coller aux deux cas.

---

## 1. Google Cloud Console (projet `financeai-497112`, déjà existant)

> Le projet ET l'écran de consentement existent déjà (créés pour le login Cloudflare). Tu ne pars
> donc pas de zéro : tu **ajoutes** une permission + tu **crées une clé**.

### A — Choisir le projet
En haut, sélecteur de projet → **`financeai-497112`**.

### B — Activer l'API Google Drive
**API et services** (*APIs & Services*) → **Bibliothèque** (*Library*) → chercher **Google Drive API**
→ **Activer** (*Enable*). Si tu vois **Gérer** (*Manage*), c'est déjà activé → rien à faire.

### C — Ajouter la permission `drive.appdata` à l'écran de consentement
**API et services** → **Écran de consentement OAuth** (*OAuth consent screen*) → **Modifier l'application**
(*Edit app*) → section **Niveaux d'accès** / **Champs d'application** (*Scopes*) → **Ajouter ou supprimer
des niveaux d'accès** (*Add or remove scopes*) :
- filtre `drive.appdata` → coche `.../auth/drive.appdata`
- filtre `userinfo.email` → coche `.../auth/userinfo.email` (affiche le compte connecté)

→ **Mettre à jour** (*Update*) → **Enregistrer** (*Save*). Ça **ne casse pas** ton login Cloudflare
(lui ne demande que email/profil).

### D — Créer le Client ID (la « clé »)
> On crée une clé **séparée** de celle de Cloudflare, pour ne surtout pas toucher à ce qui gère ton login.

**API et services** → **Identifiants** (*Credentials*) → **Créer des identifiants** (*Create credentials*)
→ **ID client OAuth** (*OAuth client ID*) :
1. **Type d'application** (*Application type*) : **Application Web** (*Web application*).
2. **Nom** : `FinanceAI Drive Sync`.
3. **Origines JavaScript autorisées** (*Authorized JavaScript origins*) → **Ajouter un URI**, mettre
   **exactement** (sans slash final) :
   - `https://www.hubperso.com`
   - `http://localhost:5173`
   ⚠️ Bien dans **« Origines JavaScript autorisées »**, **PAS** dans « URI de redirection autorisés »
   (*Authorized redirect URIs*) → laisse cette section vide.
4. **Créer** (*Create*) → copier le **ID client** (`…apps.googleusercontent.com`). Pas besoin du
   « code secret du client » — le flux navigateur n'en utilise pas. L'ID client est **public**.

### E — T'ajouter comme utilisateur test (si mode « Test »)
**Écran de consentement OAuth** → **Audience** → si **État de publication** (*Publishing status*) =
**Test** (*Testing*) → **Utilisateurs tests** (*Test users*) → **Ajouter des utilisateurs** →
`marc.richard4@gmail.com` (+ conjoint·e si besoin). Si déjà **En production**, rien à faire.

---

## 2. Mettre la variable d'env dans Vercel + **redéployer** ⚠️

> Vercel reste en anglais (pas de version FR). Point le plus oublié : Vite « cuit » la variable au
> **build** → il FAUT redéployer après l'avoir ajoutée, sinon rien n'apparaît.

1. **vercel.com** → projet **finance-ai** → **Settings** → **Environment Variables** → **Add** :
   - **Key** : `VITE_GOOGLE_CLIENT_ID`
   - **Value** : l'ID client copié (étape D)
   - **Environments** : coche **Production** (et **Preview** pour tester avant la prod).
2. **Save** → onglet **Deployments** → dernier déploiement → **⋯** → **Redeploy**.

*(Local : créer un fichier `.env` à la racine avec `VITE_GOOGLE_CLIENT_ID=...`. `.env*` est gitignoré.)*

---

## 3. Tester (de bout en bout)

1. **www.hubperso.com** → **Réglages → Configuration → 💾 Sauvegarde** → la carte
   **« ☁️ Synchronisation Google Drive »** apparaît (sinon : variable mal écrite ou pas de redeploy).
2. **Connecter Google Drive** → consentement Google → « Connecté : ton email ».
3. **Sauvegarder maintenant** → crée `financeai-sync.json` dans le dossier `appDataFolder`
   (invisible dans l'UI Drive, c'est normal).
4. **Navigation privée** → www.hubperso.com → login Cloudflare → app vide → carte → **Connecter**
   → tes données sont **restaurées** (l'app recharge). ✅

---

## 4. Erreurs fréquentes

| Message / symptôme | Cause & solution |
|---|---|
| La carte n'apparaît pas | Variable absente/mal écrite, ou **pas de redéploiement**. |
| `Erreur 403 : access_denied` | Tu n'es pas dans les **Utilisateurs tests** (étape E), ou mauvais compte Google. |
| `invalid_client` / « OAuth client was not found » | Le `VITE_GOOGLE_CLIENT_ID` ne correspond pas au Client ID créé (faute de frappe). |
| `origin_mismatch` / « origine non autorisée » | L'URL des **Origines JavaScript** ne correspond pas **exactement** (scheme + domaine, sans slash final). |
| La popup Google se ferme aussitôt | Popups bloquées → autorise-les pour hubperso.com. |
| « token expiré » après ~1 semaine | Normal en mode **Test** (Google limite). Reclique **Connecter**, ou passe en **Production**. |

---

## 5. Limites connues / sécurité

- **Pas de chiffrement applicatif** (choix assumé) : le blob dans Drive est lisible via ton compte
  Google. Passphrase optionnelle (zéro-knowledge) possible plus tard (champ `enc` réservé).
- **Clés API synchronisées** (sync v2, en clair dans le blob) — tu les retrouves sur chaque appareil, sans ressaisie. Lisibles via ton compte Google (cohérent avec « pas de chiffrement »).
- **Multi-appareils concurrents** : garde anti-perte au login (bandeau conflit) ; pendant une session,
  last-write-wins.
- **Révoquer / supprimer** : carte → **Déconnecter** (révoque le token + efface les métadonnées
  locales, garde le fichier Drive) ; ou **« Supprimer mes données de Google Drive »** (lien rouge,
  confirmation en 2 clics) qui supprime le fichier de sync dans Drive puis déconnecte — tes données
  **sur l'appareil** sont conservées. (On peut aussi supprimer manuellement via myaccount.google.com
  → Données et confidentialité → Applications tierces.)
