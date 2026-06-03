# RUNBOOK — Activation multi-utilisateurs (actions manuelles de Marc)

> **But** : la liste EXHAUSTIVE et ORDONNÉE de tout ce que TOI seul peux faire pour activer +
> valider le mode multi-utilisateurs. Le code est prêt et « dark » sur `main` (rien n'est actif tant
> que tu n'as pas posé les variables ci-dessous). Coche au fur et à mesure.
>
> **Détail des clics Google Cloud** : `docs/GOOGLE_DRIVE_SETUP.md` (je ne le duplique pas, j'y renvoie).
> **Décisions verrouillées** : `docs/MULTIUSER_PLAN.md` §1bis (hard gate, BYO clé, OAuth Test, cercle restreint).

---

## ⚠️ Règles d'or (à lire avant de commencer)

1. **Ordre impératif** : créer le Client ID → **prouver la sync** → activer le gate → **prouver le gate** → SEULEMENT ensuite retirer Cloudflare. Ne JAMAIS retirer Cloudflare avant que le gate soit prouvé (sinon app ouverte sans aucun contrôle).
2. **Tout est réversible par une variable** : vider `VITE_GOOGLE_GATE` (+ redéployer) → retour au comportement actuel. Vider `VITE_GOOGLE_CLIENT_ID` → sync inerte. Aucune action ci-dessous n'est destructive pour tes données.
3. **Trappe anti-lockout** : si jamais le login Google te bloque, ajoute `?nogate=1` à l'URL (ou clique « continuer sans me connecter ») → tu entres toujours.
4. **Chaque changement de variable Vercel exige un REDÉPLOIEMENT** (Vite injecte les `VITE_*` au build).

---

## PHASE 1 — Créer le Client ID OAuth (débloque tout)

- [ ] **1.1** Suivre `docs/GOOGLE_DRIVE_SETUP.md` §1 (A→E) : projet `financeai-497112` → activer l'API Drive → ajouter le scope `…/auth/drive.appdata` à l'écran de consentement → créer un **OAuth Client ID « Web »**.
  - **Origines JavaScript autorisées** : `https://www.hubperso.com` (+ `http://localhost:5173` pour le dev). Pas de redirect URI, pas de secret.
- [ ] **1.2** Écran de consentement en **mode Test** (décision D-4) → onglet **Utilisateurs test** : ajouter `marc.richard4@gmail.com` + les e-mails de ta bêta (cercle restreint, D-5). Limite ~100 users.
- [ ] **1.3** Copier le **Client ID** (public) → Vercel **Project Settings → Environment Variables** :
  - `VITE_GOOGLE_CLIENT_ID = <ton client id>` (Production + Preview).
  - (Local : le mettre aussi dans `.env`.)
- [ ] **1.4** **Redéployer** Vercel.
- **✅ Attendu** : la carte « ☁️ Synchronisation Google Drive » apparaît dans Réglages → Système (avant : masquée). `VITE_GOOGLE_GATE` reste **vide** à ce stade → aucun blocage de login encore.

---

## PHASE 2 — Prouver la sync EN RÉEL (toi, ~15 min)

> Toujours sans gate (`VITE_GOOGLE_GATE` vide). On valide la sauvegarde/restauration AVANT de bloquer quoi que ce soit. Cf aussi `GOOGLE_DRIVE_SETUP.md` §3.

- [ ] **2.1 Première sauvegarde** : sur ton appareil habituel, app avec tes vraies données → carte Sync → **Connecter Google Drive** (consentement) → **Sauvegarder maintenant** → toast « Sauvegardé ».
- [ ] **2.2 Restauration sur appareil/fenêtre neuve** (LE test clé) : ouvre l'app en **navigation privée** (ou autre appareil) → **Connecter Google Drive** → **toutes tes données reviennent** (patrimoine, comptes, budget, objectifs) **sans ré-onboarding** et **sans écrasement**.
- [ ] **2.3 Clés API restaurées** : après 2.2, vérifie que **l'Assistant IA répond** et que **les cours d'actions se chargent** → preuve que les clés Anthropic/Finnhub ont été restaurées (chiffrées) **sans les ressaisir**.
- [ ] **2.4 Pas de spinner figé** : après une restauration, la carte ne reste pas bloquée sur « Synchronisation… » (bug corrigé cette session — à confirmer en réel).
- [ ] **2.5 Mode test ne contamine pas Drive** : active le **mode test** (persona) → vérifie qu'une sauvegarde ne remplace PAS ta vraie sauvegarde Drive (le mode test n'est jamais synchronisé).
- [ ] **2.6 (multi-appareils)** : modifie sur l'appareil A, puis ouvre B → au login, soit B récupère la version la plus récente, soit un **bandeau de conflit** « garder cet appareil / garder Drive » s'affiche (jamais d'écrasement silencieux).
- **❗ Si un de ces tests échoue** : ne pas activer le gate. Note précisément le symptôme et redonne-le-moi — je diagnostique/corrige.

---

## PHASE 3 — Activer le HARD gate (login Google obligatoire)

> Décision D-1 = hard gate. Le code est prêt + testé, dark.

- [ ] **3.1** Vercel → Env Variables : `VITE_GOOGLE_GATE = 1` (Production ; et Preview si tu veux tester avant).
- [ ] **3.2** **Redéployer**.
- [ ] **3.3 Tester le gate** (navigation privée) : l'app **bloque sur un écran de login Google** tant que tu n'es pas connecté.
- [ ] **3.4 Tester l'anti-lockout** : ajoute `?nogate=1` à l'URL **ou** clique « continuer sans me connecter » → tu entres quand même (filet de sécurité, jamais enfermé dehors).
- [ ] **3.5 Tester l'isolation** : connecte-toi avec un **2ᵉ compte Google** (un testeur) → il ne voit **jamais** tes données (chaque compte a son propre dossier Drive caché). Reviens à ton compte → tes données sont là.
- **✅ Attendu** : double login transitoire (Cloudflare + gate Google) — normal tant que Cloudflare est encore là. On le retire en Phase 4.

---

## PHASE 4 — Retirer Cloudflare Access (UNIQUEMENT après Phase 3 réussie)

- [ ] **4.1** Confirmer que la Phase 3 est 100 % OK (gate bloque + anti-lockout marche + isolation OK).
- [ ] **4.2** Cloudflare **Zero Trust → Access → Applications → FinanceAI** → **Delete** (ou Disable).
- [ ] **4.3** Vérifier : un **seul** login Google (in-app) reste ; l'app est joignable par n'importe quel compte Google **autorisé** (tes testeurs), chacun isolé.
- **↩️ Rollback** : si problème, recrée l'application Cloudflare Access (ou remets l'allowlist), et/ou vide `VITE_GOOGLE_GATE`.

---

## PHASE 5 — (optionnel) Passphrase zéro-knowledge

> Pour qui veut un chiffrement E2E que même Google/nous ne pouvons pas lire. Opt-in, n'affecte personne d'autre.

- [ ] **5.1** Carte Sync → champ « Chiffrement par passphrase » → saisir une passphrase (min 12 car.).
- [ ] **5.2** ⚠️ **Avertissement critique** : si tu **oublies** cette passphrase, tes données dans Drive sont **DÉFINITIVEMENT irrécupérables** (c'est le principe du zéro-knowledge). Note-la dans ton gestionnaire de mots de passe.
- [ ] **5.3 Test** : « Sauvegarder » → ouvre en navigation privée → au pull, l'app **demande la passphrase** → la saisir → données restaurées. Mauvaise passphrase → message clair, **données locales intactes**.

---

## ANNEXE A — Ménage GitHub (1 clic chacun)

> Le sandbox de dev bloque la suppression de branches distantes (HTTP 403) — à faire par toi sur github.com.

- [ ] Supprimer les branches **mergées** (bouton « Delete branch » sur chaque PR) : `claude/audit-fixes` (#127), `claude/multiuser-epic1` (#129), `claude/retraite-tax-precise` (#128), `claude/sync-passphrase` (#130).
- [ ] Supprimer les branches **mergées/fermées** plus anciennes : `claude/post-main-salvage` (#126), `claude/peaceful-bell-YaBUD` (#124), `claude/e2e-refresh-screenshots` (#122), `claude/loving-faraday-r2GYW` (#123 fermé), `claude/jolly-davinci-PQpC1` (#125 fermé), `claude/runbook-multiuser` (cette PR, après merge).

## ANNEXE B — Autres actions (cf `docs/ACTIONS_MARC.md`)

- [ ] **A12 (P0)** — si la PWA est cassée derrière Access : bypass Cloudflare pour `/manifest.json` + `/sw.js` (devient sans objet une fois Cloudflare retiré, Phase 4).
- [ ] **A2** — rotation des clés API (Anthropic/Finnhub) si tu soupçonnes une exposition passée.
- [ ] **E2E baselines** (si le job E2E échoue un jour sur des screenshots) : GitHub → Actions → « Refresh Playwright screenshot baselines » → Run workflow (créé par #122).
- [ ] **Passage en Production OAuth** (plus tard, pour ouvrir large au-delà de ~100 testeurs) : écran de consentement → Publish ; vérification Google possible (scope `drive.appdata` sensible).

---

## Ce qui est DÉJÀ fait côté code (rien à faire pour toi)
Sync Drive + isolation par compte · clés API chiffrées (keyCipher) · hard gate + anti-lockout (dark) · passphrase optionnelle · garde anti-double-sync · restauration en place · mode test non synchronisé · taxation retraités corrigée · audit sécu/a11y/robustesse. `main` : 1535 tests verts, build OK.

> Quand tu auras fait la Phase 1, **redonne-moi la main** : on enchaîne la Phase 2 ensemble (je lis les symptômes, je corrige au besoin) jusqu'à ce que le multi-user soit prouvé en réel.
