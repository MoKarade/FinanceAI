# Design — Sync Google Drive (données liées au compte Google)

> **Statut** : conçu + approuvé par Marc le 2026-05-29. Implémentation par batches (S1→S4).
> **Besoin** (mots de Marc) : « quand je me connecte avec mon compte Google, que ça sauvegarde
> mes données liées à mon compte, même si j'ouvre l'app dans une fenêtre de navigation privée. »

---

## 1. Tension de fond (pourquoi ça ne peut pas être 100 % local)

« Restaurer en navigation privée » implique un **stockage cloud** : l'incognito n'a aucune
donnée locale d'une session précédente. La feature ajoute donc nécessairement une copie en
ligne. On la traite comme un **backup auto qui se restaure tout seul**, cohérent avec la règle
« les données ne quittent jamais le PC sauf backup » — ici le backup vit dans **le Drive de
l'utilisateur**, pas sur notre infra.

## 2. Décisions (ADR condensé)

| # | Décision | Pourquoi | Alternatives rejetées |
|---|----------|----------|------------------------|
| D1 | **Stockage = Google Drive `appDataFolder`** (Drive de l'utilisateur) | Gratuit, zéro backend, on n'héberge rien, lié au compte Google par nature, idéal multi-utilisateurs | Cloudflare Worker+KV (backend à maintenir, on héberge les blobs) ; Firebase/Supabase (dépendance hors stack) |
| D2 | **Auth Drive = Google Identity Services in-app**, scope unique `drive.appdata` | Cloudflare Access ne fournit pas de token Drive ; `appdata` = accès au seul dossier caché de l'app, jamais au reste du Drive | Réutiliser le JWT Cloudflare (ne donne pas de scope Drive) |
| D3 | **Pas de chiffrement applicatif** (blob en clair dans appDataFolder) | Choix explicite de Marc : confort > zéro-knowledge. appDataFolder est privé au compte Google + à l'app | Passphrase E2E (AES-GCM/PBKDF2) — proposé et **écarté par Marc** ; passphrase optionnelle — écartée aussi |
| D4 | **Sync auto + garde anti-perte** | « Ça marche tout seul » sans risque d'écrasement de données financières | Manuel (risque d'oubli) ; auto silencieux last-write-wins (risque d'écrasement) |

> ⚠️ **Conséquence assumée de D3** : les données financières (patrimoine, comptes, transactions)
> sont lisibles par quiconque a accès au compte Google de l'utilisateur, et techniquement par
> Google. C'est un écart conscient à la règle « backup chiffré ». Une passphrase optionnelle
> pourra être ajoutée plus tard sans rien casser (le format du blob réserve un champ `enc`).

## 3. Architecture & flux

```
Cloudflare Access (Google OAuth)  ──>  app chargée (SPA Vercel)
        │ (identité d'accès, déjà là)
        ▼
GoogleDriveSyncCard : "Connecter Google Drive"
        │  Google Identity Services (token client, scope drive.appdata)
        ▼
  access_token Drive (en mémoire, refresh silencieux)
        │
        ├── PULL : GET appDataFolder/financeai-sync.json
        └── PUSH : PATCH/POST multipart (debounce ~8 s après changement)
```

- **Identité d'accès** : Cloudflare Access (inchangé). **Identité Drive** : login Google in-app
  séparé. L'utilisateur voit donc potentiellement 2 consentements Google (Access + Drive) — normal.
- **1 seul fichier** : `financeai-sync.json` dans `appDataFolder`.

## 4. Algorithme anti-perte (cœur sécurité)

Blob = enveloppe `{ schemaVersion, updatedAt: epochMs, deviceId, appVersion, enc: false, payload }`.
Local : `syncState` = `{ connectedEmail, lastSyncedAt, lastPulledUpdatedAt, lastLocalHash }`.

**Au login / connexion (décision pure `decideOnLoad`) :**

| Situation | Action |
|-----------|--------|
| Drive absent, local non-vide | `PUSH` (première sync) |
| Drive absent, local vide | `NOOP` (rien à faire) |
| Drive présent, local **vide** | `PULL` (restaure — incognito/nouvel appareil) |
| Drive présent, local non-vide, **gate** (`restoreIntent`) **et** appareil **jamais synchronisé** (`lastPulledUpdatedAt == 0` **et** `lastLocalHash == ''`) | `PULL` (restaure — login = « récupérer mon compte »; backup local avant écrasement) |
| Drive présent, local non-vide, `drive.updatedAt > lastPulledUpdatedAt` **et** local **inchangé** (`hash == lastLocalHash`) | `PULL` (Drive plus récent, local pas touché) |
| Drive présent, local non-vide, local **modifié** (`hash != lastLocalHash`) **et** Drive **aussi** avancé (`drive.updatedAt > lastPulledUpdatedAt`) | `CONFLICT` → bandeau « garder local / garder Drive » |
| Sinon (local en avance) | `PUSH` |

**`restoreIntent`** = login explicite **par le gate** (`connectAndSync` / `gateSilentResume`). Sur un
appareil jamais synchronisé, l'utilisateur s'est connecté pour **récupérer son compte** → Drive gagne,
même si le local n'est pas strictement vide (défaut du store / restes d'un test). Le **boot normal**
(`runBootSync`, `restoreIntent=false`) garde la garde stricte → `CONFLICT` plutôt qu'écraser. Sans cette
règle, le gate classait tout en conflit et affichait le local (bug Marc 2026-05-29).

**Hash de détection-de-changement = payload SEUL** (pas les clés API) : au gate les clés ne sont pas
encore hydratées, un hash incluant les clés serait instable selon le moment → `push` parasite effaçant
les clés dans Drive après un pull. Les clés restent incluses dans l'**enveloppe** poussée.

**Au changement (push) :** debounce ; **ne jamais pousser un payload vide** par-dessus un Drive
non-vide. Comme le login fait `PULL` d'abord, le cas « incognito vide → efface Drive » est
**structurellement impossible**.

**Règle d'or** : aucune écriture destructive sans soit (a) certitude que la cible est plus
ancienne, soit (b) choix explicite de l'utilisateur.

## 5. Ce qui est synchronisé

- Snapshot `financeai-storage` (même source que `backupAuto`) **moins `apiKeys`**.
- **Exclusion des clés API** (sécurité) : une clé Anthropic/Finnhub est un *credential actif*
  (risque de facture/abus). En clair dans Drive = pire que les données. Restent par-appareil
  (comportement actuel). L'utilisateur ré-entre ses clés sur chaque appareil.

## 6. Modules (fichiers petits, isolés, testables)

| Fichier | Rôle | Testé |
|---------|------|-------|
| `services/sync/syncTypes.ts` | types enveloppe + décisions | — |
| `services/sync/syncEngine.ts` | **fonctions pures** : `decideOnLoad`, `shouldPush`, `hashPayload`, build enveloppe | ✅ matrice de conflits |
| `services/sync/syncState.ts` | métadonnées locales (localStorage) | ✅ |
| `services/googleDrive/gisAuth.ts` | GIS token client (`drive.appdata`), refresh | ✅ (GIS mocké) |
| `services/googleDrive/driveAppData.ts` | REST find/create/read/write appData (fetch injectable) | ✅ (fetch mocké) |
| `services/sync/syncOrchestrator.ts` | colle décisions + IO + syncState (effets) | intégration légère |
| `components/settings/GoogleDriveSyncCard.tsx` | UI : connecter / statut / sync / restaurer / déconnecter / bandeau conflit | — |
| câblage `App.tsx` | pull au boot si connecté ; abonnement store → push debouncé | — |

## 7. Dépendance Marc (manuelle — je ne peux pas créer de credentials)

Dans **Google Cloud Console** (projet `financeai-497112` déjà existant) :
1. **Activer l'API Google Drive**.
2. **OAuth consent screen** : ajouter le scope `…/auth/drive.appdata` ; en mode Testing, ajouter
   `marc.richard4@gmail.com` en test user.
3. **Credentials → OAuth client ID → Web application** : *Authorized JavaScript origins* =
   `https://www.hubperso.com` (+ `http://localhost:5173` pour le dev). Pas de redirect URI ni de
   secret (le token client GIS du navigateur n'en utilise pas).
4. Copier le **Client ID** (public) → le mettre dans `VITE_GOOGLE_CLIENT_ID` (env Vercel + `.env` local).

Procédure pas-à-pas détaillée : `docs/GOOGLE_DRIVE_SETUP.md` (créé au batch S4).
**Tant que `VITE_GOOGLE_CLIENT_ID` est vide, la feature est inerte** (carte masquée/désactivée).

## 8. CSP & config

Ajouter (dans `index.html` **et** `netlify.toml`) :
- `script-src` : `https://accounts.google.com/gsi/client`
- `connect-src` : `https://www.googleapis.com https://accounts.google.com`
- `frame-src` : `https://accounts.google.com`

## 9. Ordre de build (batches, chacun : branche → tsc+eslint+Vitest → merge --no-ff → push → CI verte)

- **S1 — Cœur logique (pur, testé)** : `syncTypes`, `syncEngine` (matrice `decideOnLoad`/`shouldPush`/`hashPayload`), `syncState`. Filet de tests complet de la matrice de conflits. Zéro dépendance Google. *C'est la partie critique anti-perte → tests d'abord.*
- **S2 — Intégration Google** : `gisAuth` (token `drive.appdata`) + `driveAppData` (REST, fetch injectable). Tests fetch/GIS mockés.
- **S3 — Câblage + UI** : `syncOrchestrator`, `GoogleDriveSyncCard`, pull au boot, push debouncé, bandeau conflit, CSP, `VITE_GOOGLE_CLIENT_ID`. Feature inerte sans Client ID.
- **S4 — Docs** : `GOOGLE_DRIVE_SETUP.md` (steps Marc) + CHANGELOG + SESSION_HANDOVER + BACKLOG.

## 10. Tests

- **syncEngine** : chaque ligne de la matrice §4 (un test par cas) + hash stable + payload sans apiKeys.
- **driveAppData** : find (existe / absent → create), read, write multipart, erreurs HTTP (401 → refresh, 5xx → throw).
- **gisAuth** : init script, requestToken success/erreur, état non-connecté.
- Pas de test E2E réseau réel (Google) — validé manuellement par Marc une fois le Client ID en place.

## 11. Limites connues / backlog

- Pas de chiffrement applicatif (D3) → passphrase optionnelle en backlog (champ `enc` réservé).
- Conflit résolu par choix utilisateur (pas de merge granulaire) — suffisant pour un usage perso.
- Clés API non synchronisées (volontaire).
