# 🧠 CLAUDE_MEMORY — mémoire de session pour le prochain PC

> But : permettre à une **nouvelle session Claude** (sur l'autre PC de Marc) de reprendre
> immédiatement, sans re-explorer. GitHub = source de vérité unique entre les 2 PC, donc
> ce doc commité est le canal de mémoire inter-session (le `MEMORY.md` auto de Claude est
> local à chaque machine et ne traverse pas).
>
> **Dernière mise à jour : 2026-06-01.** Détail fin = `CHANGELOG.md` (haut = récent) et
> `docs/BACKLOG.md` (§ « Bugs audit 2026-06-01 » + checklist de tests manuels en tête).

---

## 1. Ce qu'est le projet

**FinanceAI** — planificateur de finances personnelles / retraite **québécois**. **Produit
MULTI-UTILISATEURS** (doit marcher pour d'autres gens, pas juste Marc).

- **Stack** : React 18/19 + TypeScript + Vite. **Aucun backend.** **Local-first** :
  données dans `localStorage` (Zustand `persist`, clé `financeai-storage`, version 7) +
  IndexedDB (clés API chiffrées, backups). Sync optionnelle **Google Drive** (`appDataFolder`).
- **Déployé** : Vercel → **www.hubperso.com**, derrière **Cloudflare Access** (Google OAuth + MFA).
- **Cœur** = moteur de simulation mois-par-mois sur 30-60 ans (fiscalité QC/Canada).

## 2. Règles de Marc (NON négociables)

- **Français** toujours. **Tutoie** Marc. Ton direct, technique.
- **PAS d'emojis dans le chat** sauf demande explicite (les docs/commits en contiennent, OK).
- **No fake data** : jamais de mockup hardcodé en prod, vraies sources ou empty states honnêtes.
- **Honnêteté money** : ne jamais bâcler le code d'impôt ; « sois réaliste » = ne pas rusher
  un refactor money-critical en fin de session longue.
- **Ne JAMAIS** accéder aux comptes de Marc (Google/Drive/Cloudflare/Vercel). Client ID Google
  = public, OK dans le code ; mais **jamais** de client secret / clé API en clair.
- **Git** : branche `claude/<slug>` → commit FR (`feat:`/`fix:`/…) → **merge --no-ff** sur main
  → push. **Jamais `--force` sur main, jamais `--no-verify`.** Stage des **fichiers précis**
  (pas `git add -A`). Attribution Claude désactivée (settings.json) → pas de `Co-Authored-By`.
- « **Claude fait le max** » : prendre l'initiative, livrer, pas juste poser des questions.

## 3. Environnement — PIÈGES (lire avant de lancer quoi que ce soit)

- **Node n'est PAS sur le PATH de bash.** Lancer lint/tests/build via **PowerShell** :
  `$env:PATH = "C:\Program Files\nodejs;$env:PATH"; npx vitest run <fichier>`
  (ou `& "C:\Program Files\nodejs\node.exe" ...`). **Pas via l'outil Bash.**
- **Suite Vitest** : `fileParallelism:false` → la suite **complète ≈ 330-390 s** (123 fichiers,
  ~1440 tests). Lancer un seul fichier pour itérer (~2 s).
- Avertissements `HTMLCanvasElement getContext()` en sortie de suite = **bruit jsdom** (recharts),
  PAS des échecs. Ignorer.
- **CI GitHub Actions** : après push, surveiller via
  `gh api "repos/MoKarade/FinanceAI/actions/runs?head_sha=$SHA" --jq '[.workflow_runs[]|select(.name=="CI")][0]|"\(.status)|\(.conclusion)"'`
  en boucle (lancer en arrière-plan). Workflows : **CI** (lint+tsc+tests+build+E2E, c'est le gate),
  **Lighthouse CI**, **CodeQL** (« Push on main »). Cible : `completed|success`.
- Workflow de validation avant commit : `npx tsc --noEmit` + `npx eslint <fichiers>` + `npx vitest run`.

## 4. Carte du code (où est quoi)

- **`services/projection/`** = moteur money-critical (le plus sensible) :
  - `projection.ts` — boucle mensuelle, orchestre tout. `age = currentAge + floor(m/12)` ;
    `spouseAge` dispo via `config.users[1].age + floor(m/12)`.
  - `activeIncome.ts` — revenu phase active (salaire, chômage AE 55 %, invalidité LTD 60 %,
    bonus/RSU/side). `accGrossAdd` → espace REER.
  - `taxDecember.ts` — régularisation fiscale de décembre (le fichier le plus dense). Helpers
    INJECTÉS : `{ calculateFiscalReport, getMarginalRate, calculateDividendTax }`.
  - `taxJanuary.ts` — reset janvier : nouvel espace REER (18 % du brut), FERR 72+, reset CELI/REER.
  - `retirementIncome.ts` — RRQ + PSV + SRG + DB pension.
  - `cashflowAllocation.ts` — allocation de l'excédent / cascade de retraits.
- **`utils/tax.ts`** — barème fiscal QC/Canada. `calculateFiscalReport(gross, rrsp, fhsa, year,
  skipBreakdown?, ageOpts?)` retourne `{ fedTax, qcTax, totalTax, netIncome, marginalRate, … }`.
  `totalTax` = fédéral abattu (16,5 %) + provincial.
- **`services/sync/`** — moteur Drive : `syncEngine.ts` (matrice `decideOnLoad`), `syncOrchestrator.ts`,
  `keyCipher.ts` (chiffre les clés API via clé dérivée du `sub` Google, sans passphrase).
- **`services/secureKeyStore.ts`** — clés API chiffrées (AES-GCM, IndexedDB, clé de device).
- **`services/errorLogger.ts`** — `logError({ source, severity?, message, error })`. `source` ∈
  `'ai'|'projection'|'ui'|'network'|'storage'|'unknown'`. **Utiliser ça, jamais `console.warn/error`**
  pour un vrai échec (règle « ne jamais avaler les erreurs »).
- **`tests/`** — Vitest. Pattern stub des helpers fiscaux : voir `tests/services/taxDecember.test.ts`
  (STUB_RATE=0.25 linéaire, STUB_MARGINAL=0.40). Pour tester un effet du barème réel (crédits,
  empilement), injecter les VRAIS helpers de `utils/tax`.

## 5. Invariants de sûreté pour refactorer le code money (IMPORTANT)

Deux propriétés ont permis de changer le moteur d'impôt SANS casser les baselines d'intégration :
- **Empilement progressif** (gains, B-AUDIT-2) : pour un montant qui reste DANS un palier, l'impôt
  incrémental `tax(revenu+x) − tax(revenu)` = `x × taux marginal` (identique au calcul plat). Seuls
  les montants qui FRANCHISSENT un palier changent. → tester le mécanisme avec un stub linéaire +
  la progressivité avec le barème réel séparément.
- **Per-conjoint** (crédits, B-AUDIT-3) : pour un couple de **même âge/revenu**, `taxMarc + taxAnna`
  == ancien `per-adulte × N`. Les tests d'intégration utilisent presque tous des couples de même âge
  → ils ne bougent pas. Vérifier toujours par la **suite complète**.
- Discipline : **systematic-debugging** (cause racine avant fix) + **TDD strict** (test RED d'abord) +
  **trust-but-verify** sur les findings d'agents (2 findings étaient surévalués/faux cette session).

## 6. Fait cette session (2026-06-01) — tout sur main, CI verte, zéro régression

1. **Sync Drive** durcie + restauration en place + **clés API chiffrées** (keyCipher, sans passphrase).
2. **Fix money** : sur-cotisation REER pendant chômage/invalidité (AE/invalidité ≠ « revenu gagné »).
3. **Audit complet 5 agents** (sécu/bugs/tests/échecs silencieux/complétude) + verdict de complétude.
4. **Sécurité C1** : injection de prompt dans `getRebalanceJustifications` (sanitize + `<DONNEES>`).
5. **B-AUDIT-1** : bonus/RSU stoppés pendant chômage/LTD (net + brut REER), side income conservé.
6. **B-AUDIT-2** : gains en capital imposés en **progressif empilé** (plus de taux marginal plat).
7. **B-AUDIT-3 (volet crédits)** : crédits d'âge/pension **par conjoint** (champ `ageSpouse`).
8. **B-AUDIT-4** : ratio RRQ indexé (salaire vs MGA → ratio stable).
9. **Lot échecs silencieux COMPLET** : SF-1 backupAuto, SF-2 market data (`providerError.ts`), SF-3 sync/IA.
- Tests : **~1440 verts** (123 fichiers), +~40 cette session.

## 7. Ce qui RESTE (par priorité) — voir BACKLOG pour le détail

**P0 — bloquant pour un vrai produit multi-utilisateurs (≈ 72 % seulement aujourd'hui ; ~90 % en solo) :**
1. **Prouver la sync Drive en réel** : créer le `VITE_GOOGLE_CLIENT_ID` (absent → sync inerte),
   tester en navigation privée sur version fraîche. **Action Marc + Claude.**
2. **Ouvrir Cloudflare Access** (actuellement verrouillé sur l'email de Marc) OU basculer sur le gate
   in-app. **Action Marc (Claude guide).**
3. **Proxy backend pour la clé Anthropic** : `services/claude.ts` utilise `dangerouslyAllowBrowser`
   (clé exposée côté navigateur — OK solo, inacceptable pour des tiers). Vercel Edge, free tier.

**P1 :** migrer persistance `localStorage` → IndexedDB (quota + boot non bloquant) · brancher l'E2E
Playwright en CI · finir B-AUDIT-3 (gates de **timing** par conjoint : FERR 72, reset REER 71, bonus
PSV 75+ — vraie 2e piste d'âge) · dividendes Non-Reg empilés (résiduel B-AUDIT-2).

**P2 :** impôt par conjoint complet (lourd) · refonte des god-files (Investments ~1120 l., FutureProjection)
· B-AUDIT-5 (SRG inclus dans le clawback PSV — confirmé mais impact pratique ~0).

## 8. Tâche en cours pour Marc (test manuel)

Marc teste la version fraîche (checklist vivante en tête de `docs/BACKLOG.md`, repeuplée à chaque cycle) :
sync, clés chiffrées, zoom, écran de chargement Futur, salaire mensuel, + les scénarios money corrigés
(chômage → moins d'espace REER ; gros gain → impôt progressif ; couple à âges décalés → crédits par conjoint).

## 9. Comment reprendre (nouvelle session)

1. `git pull` (sync entre PC).
2. Lire ce doc + le haut du `CHANGELOG.md` + la checklist en tête de `docs/BACKLOG.md`.
3. Demander à Marc quelle priorité attaquer (P0 sync/Cloudflare/proxy, ou suite B-AUDIT-3 timing, ou autre).
4. Toujours : branche → TDD → tsc+eslint+suite complète → commit FR → merge --no-ff → push → CI verte.
