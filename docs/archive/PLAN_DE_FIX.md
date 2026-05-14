# Plan de fix detaille FinanceAI

> Suite a `AUDIT_REPORT.md`. Plan d'execution priorise. Chaque fix = 1 commit separe sur la meme branche `claude/analyze-finance-app-CtLvs`.

## Conventions

- Chaque entree : `[ID] Description` + fichier:ligne + commande/diff cle + check de validation.
- Ordre : P0 critique -> P1 haut -> P2 moyen -> Backlog (P3).
- Tag de commit : `fix(scope):` pour bug, `refactor(scope):` pour cleanup, `chore(scope):` pour infra.

---

## Phase A — Infra qualite (P0, ~2h)

### A1. CI GitHub Actions
**Fichier nouveau** : `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push: { branches: ['**'] }
  pull_request: { branches: ['main', 'master'] }
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

**Check** : push -> verifier que l'onglet Actions GitHub montre le pipeline vert.

### A2. Pre-build Netlify avec typecheck + tests
**Fichier** : `netlify.toml:2`

```toml
# Avant :
command = "npm run build"
# Apres :
command = "npm run typecheck && npm run test && npm run build"
```

**Check** : prochain deploy Netlify echoue si tsc ou tests cassent.

### A3. Config ESLint v9
**Fichier nouveau** : `eslint.config.js`

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['dist/**', 'node_modules/**', '**/*.d.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
```

**Check** : `npm run lint` retourne 0 ou liste raisonnable de warnings.

---

## Phase B — Bugs critiques (P0, ~1h)

### B1. Fix AiAssistant : prop `realEstateGoal` (singulier)
**Fichier** : `App.tsx:565` (passage de la prop)

```tsx
// Avant :
realEstateGoals={state.realEstateGoals}
// Apres :
realEstateGoal={state.realEstateGoals[0]}
```

**Verification croisee** : `components/AiAssistant.tsx:12` declare bien `realEstateGoal: RealEstateGoal` (singulier). Le typecheck devrait detecter avec `strict: true` mais pas avec la config actuelle.

**Check** : ouvrir AiAssistant, envoyer un message, voir si Gemini repond intelligemment au contexte immobilier.

### B2. Fix modele Gemini inexistant
**Fichier** : `components/AiAssistant.tsx:102`

```tsx
// Avant :
const model = 'gemini-3-flash-preview';
// Apres :
const model = 'gemini-2.0-flash';
```

**Check** : envoyer un message, recevoir une vraie reponse.

### B3. Onboarding : corriger promesse mensongere sur la privacy
**Fichier** : `components/Onboarding.tsx:97`

```tsx
// Avant :
"Donnees locales — rien n'est envoye sur nos serveurs"
// Apres :
"Donnees stockees localement. Si tu actives Gemini, certaines donnees anonymisees épongées sont envoyées a Google AI Studio (payees, montants arrondis a 100$)."
```

Et sur les 2 liens externes (`Onboarding.tsx:209, 216`) : `rel="noopener noreferrer"` au lieu de `rel="noreferrer"` seul.

**Check** : relire le bandeau a l'onboarding.

### B4. Retirer onglet GOALS (mort)
**Fichiers** :
- `types.ts` : retirer `GOALS = 'GOALS'` de l'enum `Tab`
- `App.tsx:21` : retirer `import { Goals }`
- `App.tsx:500-509` : retirer tout le bloc `{activeTab === Tab.GOALS && <Goals ... />}`
- `App.tsx:62` : retirer la ligne `[Tab.GOALS]: 'Objectifs'`
- `components/Goals.tsx` : supprimer
- `components/Layout.tsx` : retirer Goals du menu de navigation s'il y est

**Check** : aucune reference a `Tab.GOALS` apres modification. Le typecheck doit passer.

---

## Phase C — Securite cles API + dependances (P0, ~1.5h)

### C1. Exclure `apiKeys` du persist Zustand
**Fichier** : `store/useFinanceStore.ts:184-194`

```ts
// Ajouter partialize dans persist :
persist((set) => ({...}), {
  name: 'financeai-storage',
  partialize: (state) => {
    const { apiKeys, ...persistable } = state;
    return persistable;
  },
})
```

Les cles seront demandees a chaque session. Pas ideal UX mais securisant.

**Alternative ulterieure (P2)** : chiffrer le bloc `apiKeys` avec passphrase via primitive AES-GCM de `services/cloudBackup.ts`.

**Check** : F12 -> Application -> Local Storage : la cle `financeai-storage` ne contient plus `apiKeys`.

### C2. crypto.randomUUID au lieu de Math.random pour IDs
**Fichiers** : `store/useFinanceStore.ts:21`, `services/gemini.ts:275` (fallback).

```ts
// Avant :
id: Math.random().toString(36).substr(2, 9)
// Apres :
id: crypto.randomUUID()
```

**Check** : pas de regression sur creation de transactions/goals.

### C3. Validation Zod du restore JSON
**Fichier** : `components/Settings.tsx:188-200` (handleRestore).

Definir un schema Zod :

```ts
import { z } from 'zod';

const BackupSchema = z.object({
  version: z.literal('3.0').optional(),
  transactions: z.array(z.any()).optional(),
  config: z.object({}).passthrough().optional(),
  budgetItems: z.array(z.any()).optional(),
  // ...autres champs
}).strict();
```

Dans `handleRestore` :
```ts
const parsed = BackupSchema.safeParse(JSON.parse(text));
if (!parsed.success) {
  showToast('Fichier de backup invalide.', 'error');
  return;
}
if (!window.confirm('Restaurer ecrasera toutes vos donnees actuelles. Continuer ?')) return;
```

**Check** : un JSON malicieux (`{ "hax": true }`) est refuse au lieu d'effacer le localStorage.

---

## Phase D — UX et code mort (P1, ~3h)

### D1. Retirer state setMode mort dans RealEstate
**Fichier** : `components/RealEstate.tsx`

Chercher `const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('MANUAL');` et le `useEffect([price, mode])` associe.

Deux options :
- (a) Ajouter un bouton dans l'UI pour basculer entre AUTO et MANUAL
- (b) Retirer le state et garder MANUAL par defaut

Recommande : (b) car le user ne l'a jamais vu, on simplifie.

### D2. Cabler `onSyncLunchMoney` dans Transactions
**Fichier** : `components/Transactions.tsx` (recoit `onSyncLunchMoney` + `isSyncing`).

Ajouter un bouton dans la barre d'actions :
```tsx
<button onClick={onSyncLunchMoney} disabled={isSyncing} className="...">
  {isSyncing ? 'Sync...' : 'Sync LunchMoney'}
</button>
```

### D3. Dashboard customStart/customEnd morts
**Fichier** : `components/Dashboard.tsx`

Deux options :
- (a) Ajouter le bouton `CUSTOM` dans les boutons de range, exposer les inputs date
- (b) Retirer les states morts

Recommande : (a) car la logique est deja la.

### D4. Retirer handlers morts dans App.tsx
**Fichier** : `App.tsx`

Retirer ces fonctions et leurs bodies (jamais appelees) :
- `handleRestoreTransaction` (lignes ~322)
- `handleSaveFutureConfig` (~333)
- `handleUpdateTransaction` (~358)
- `handleClearAllData` (~364) — sauf si Settings le consomme via prop
- `handleDeleteTransaction` (~313)

**Check** : typecheck passe + 60 lignes en moins.

### D5. Cleanup props inutilisees dans App.tsx -> Goals
**Fichier** : `App.tsx:500-509`. Apres B4, le bloc Goals est retire.

### D6. Settings.tsx import path correct
**Fichier** : `components/Settings.tsx`

```ts
// Avant :
import { calculateFiscalReport, calculateGrossFromNet } from '../utils/tax';
// Apres :
import { calculateFiscalReport, calculateGrossFromNet } from '../services/tax';
```

### D7. Retirer jsPDF import inutile dans TaxCenter
**Fichier** : `components/TaxCenter.tsx`

```ts
// A retirer (jamais utilise) :
import { jsPDF } from 'jspdf';
```

### D8. Retirer props mortes dans Planning, Settings, Investments
- `Planning.tsx` : retirer `setBudgetItems`, `config` du PlanningProps
- `Settings.tsx` : retirer `setBudgetItems`, `setAssets`, `setSavingsGoals`, `setTravelGoals`, `setDebts` (verifier qu'ils ne sont pas utilises)
- `Investments.tsx` : marquer les props "compat heritee" obsoletes ou retirer

**Attention** : tracer dans App.tsx les passages de props correspondants. Verifier le typecheck apres chaque modification.

---

## Phase E — Performance bundle (P1, ~3h)

### E1. Bouger ASSET_META hors d'Investments
**Fichiers** :
- Creer `constants/assetMeta.ts` (ou ajouter a `constants.ts`).
- Deplacer la table `ASSET_META` de `components/Investments.tsx`.
- Mettre a jour les imports : `components/Dashboard.tsx:31` et `components/Investments.tsx`.

**Check** : Dashboard ne tire plus tout Investments dans son bundle. Verifiable via bundle analyzer.

### E2. Lazy-loader les onglets lourds
**Fichier** : `App.tsx:1-23`

```tsx
import React, { Suspense } from 'react';
import { LoadingSpinner } from './components/ui/LoadingSpinner'; // a creer si absent

const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Investments = React.lazy(() => import('./components/Investments').then(m => ({ default: m.Investments })));
const Budget = React.lazy(() => import('./components/Budget').then(m => ({ default: m.Budget })));
const RealEstate = React.lazy(() => import('./components/RealEstate').then(m => ({ default: m.RealEstate })));
const LifeEvents = React.lazy(() => import('./components/LifeEvents').then(m => ({ default: m.LifeEvents })));
const FutureProjection = React.lazy(() => import('./components/FutureProjection').then(m => ({ default: m.FutureProjection })));
const ChildPlanning = React.lazy(() => import('./components/ChildPlanning').then(m => ({ default: m.ChildPlanning })));
const Retirement = React.lazy(() => import('./components/Retirement').then(m => ({ default: m.Retirement })));
const TaxCenter = React.lazy(() => import('./components/TaxCenter').then(m => ({ default: m.TaxCenter })));
// Garder Layout, Onboarding statiques (toujours montes)
```

Wrapper le children de Layout :
```tsx
<Layout ...>
  <Suspense fallback={<div className="p-8 text-gray-400">Chargement...</div>}>
    {activeTab === Tab.DASHBOARD && <Dashboard ... />}
    {/* ... */}
  </Suspense>
</Layout>
```

**Check** : Network tab navigateur, voir les chunks separes a la navigation. Bundle initial 30-40% plus petit.

### E3. vite.config.ts : manualChunks + sourcemap
**Fichier** : `vite.config.ts`

```ts
build: {
  sourcemap: 'hidden',
  chunkSizeWarningLimit: 800,
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'recharts': ['recharts'],
        'ai-vendor': ['@google/genai'],
        'pdf-vendor': ['jspdf', 'html2canvas'],
      },
    },
  },
},
```

**Check** : `npm run build` montre des chunks separes < 800 kB.

### E4. Retirer importmap esm.sh + Tailwind CDN (RISQUE)
**Fichiers** : `index.html`, `netlify.toml`, `package.json`

Etapes :
1. Verifier que toutes les libs externes (`react`, `recharts`, `@google/genai`, `framer-motion`, `lucide-react`, `i18next`, `zustand`) sont bien en `dependencies` du `package.json`.
2. Retirer le `<script type="importmap">` de `index.html`.
3. Retirer le `<script src="https://cdn.tailwindcss.com">` + bloc de config inline.
4. Installer Tailwind v3 en build-time :
   ```
   npm install -D tailwindcss@3 postcss autoprefixer
   npx tailwindcss init -p
   ```
5. Configurer `tailwind.config.js` avec les contenus appropries (`content: ['./index.html', './src/**/*.{ts,tsx}']`).
6. Importer Tailwind dans `index.css` :
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```
7. Mettre a jour `netlify.toml` CSP : retirer `https://cdn.tailwindcss.com`, `https://esm.sh`, `https://cdn.jsdelivr.net` de `script-src`. Idealement retirer aussi `unsafe-inline` et `unsafe-eval`.

**Check** : `npm run build` produit un bundle complet auto-suffisant, l'app fonctionne sans dependre de CDN externes.

**RISQUE** : peut casser le style (Tailwind CDN scan le DOM en runtime, Tailwind build-time purge selon le `content`). Tester chaque onglet visuellement.

**Decision recommandee** : commencer par sortir l'importmap (libs JS), garder Tailwind CDN pour un commit ulterieur dedie.

---

## Phase F — Finitions UX (P1-P2, ~2h)

### F1. Externaliser noms Marc/Anna hardcodes
**Fichier** : `components/FutureProjection.tsx` ExpertTooltip

Lire les noms depuis `config.users[0].name` et `config.users[1]?.name` au lieu de `IncomeMarc` / `IncomeAnna`.

### F2. Externaliser URL Drive personnel TaxCenter
**Fichier** : `components/TaxCenter.tsx:18`

```ts
// Avant :
const DRIVE_FOLDER_URL = "https://drive.google.com/drive/u/0/folders/1mBg...";
// Apres :
// Soit retirer le bouton, soit ajouter une config utilisateur dans Settings.
```

### F3. Standardiser sur ConfirmModal
Remplacer `window.confirm()` par `ConfirmModal` dans :
- `components/ChildPlanning.tsx` (suppression enfant)
- `components/LifeEvents.tsx` (suppression evenement)
- `components/Settings.tsx` (restore confirm)
- `components/AiAssistant.tsx` (effacer conversation — pas critique)

Verifier que `components/ui/ConfirmModal.tsx` existe et est reutilisable.

### F4. Suppressions sans confirm a corriger
Ajouter ConfirmModal pour :
- `components/DebtManager.tsx` (suppression dette)
- `components/Planning.tsx` (suppression goal)
- `components/Investments.tsx` (reset rebalancing)
- `components/RealEstate.tsx` (suppression propriete)

### F5. Persister les etats locaux critiques
- `Retirement.tsx` `currentAge` -> stocker dans `state.config.users[0].age` au store
- `ChildPlanning.tsx` choix de vie par enfant -> ajouter aux `ChildGoal` du store
- `RealEstate.tsx` taxes/chauffage/condo -> ajouter au `RealEstateGoal` du store
- `Investments.tsx` `targetModel` -> ajouter au store ou a `InvestmentAccount`

---

## Backlog P2/P3 (apres ce sprint)

- **Brancher cloudBackup dans Settings** : bouton "Exporter sauvegarde chiffree (passphrase)" + "Importer".
- **ErrorBoundary** par tab pour eviter ecran blanc global sur exception.
- **Migrer `utils/useFutureSimulation.ts` -> `services/projection.ts`** physiquement.
- **Tests sur le moteur projection** (au moins 10 tests de non-regression).
- **Tests de composants RTL** sur Layout, Transactions, RealEstate.
- **Test E2E Playwright** : onboarding -> ajout tx -> Dashboard.
- **Mettre a jour les baremes fiscaux 2026**.
- **Splitter les composants > 800 lignes** en hooks.
- **AbortController dans App.tsx loadData**.
- **Slices Zustand + selecteurs**.
- **Mini-proxy Netlify pour remplacer api.allorigins.win**.
- **Validation Zod sur les reponses LLM Gemini**.
- **`safeNumber(value, min, max, fallback)` helper anti-DOS**.
- **Mobile responsive serieux sur Transactions**.
- **Conversation persistee dans AiAssistant**.
- **Faux terminal SystemView -> vrais logs operationnels OU page de docs reelle**.

---

## Order d'execution recommande

1. **A1, A2, A3** (CI + Netlify + ESLint) — debloque tout.
2. **B1, B2** (AiAssistant) — 5 min, fix critique.
3. **B3** (Onboarding) — 30 min, conformite Loi 25.
4. **B4** (Goals) — 30 min, gros clean visible.
5. **C1** (Zustand persist apiKeys) — 30 min, securite critique.
6. **C2** (crypto.randomUUID) — 15 min.
7. **C3** (Zod restore) — 2h, securite.
8. **D1, D3, D4, D6, D7** (code mort App.tsx + cleanup imports) — 1h.
9. **D2** (sync LunchMoney) — 30 min.
10. **D8** (props mortes) — 1h.
11. **E1** (ASSET_META) — 30 min.
12. **E3** (vite.config manualChunks) — 30 min.
13. **E2** (lazy-loader) — 2h.
14. **F1, F2** (hardcoding) — 1h.
15. **F3, F4** (ConfirmModal) — 1h.
16. **E4** (importmap + Tailwind) — sprint dedie ulterieur.
17. **F5** (persister states) — sprint dedie ulterieur.

**Total realiste pour P0 + P1 partiel** : 1-2 jours de focus.

---

## Validation finale (avant merge)

- [ ] `npm run typecheck` exit 0
- [ ] `npm run test` 46/46 OK
- [ ] `npm run lint` warnings seulement (pas d'errors)
- [ ] `npm run build` exit 0 avec warning chunk si E2/E3 pas faits
- [ ] CI GitHub Actions vert sur le push
- [ ] Deploy Netlify reussi
- [ ] Test manuel : naviguer dans les 17 onglets restants (GOALS retire), aucun ecran blanc
- [ ] AiAssistant : envoyer un message, recevoir une vraie reponse Gemini
- [ ] Onboarding : nouveau localStorage clear -> revoir le bandeau correct
- [ ] F12 -> Local Storage : pas de `apiKeys` dans `financeai-storage`
