# FinanceAI — Handover (2026-05)

> **Document de référence unique** consolidant tout le travail réalisé,
> l'état du projet, ce qui est prévu, et les améliorations recommandées.
> Lire ce document en premier si tu reprends le projet.

---

## 1. État actuel du projet

| Indicateur | Valeur |
|---|---|
| Branche principale | `main` |
| Dernière PR mergée | **#82** (fix fiscaux §6.9 + §6.10) |
| Tests | **227/227 verts** (24 fichiers) |
| Typecheck | Clean en mode strict (`noImplicitAny`, `strictNullChecks`, `useUnknownInCatchVariables`) |
| Build | OK — bundle ~3.5 MB, gzipped ~830 KB |
| Déploiement | Vercel (auto par PR) + GitHub Pages (workflow `.github/workflows/deploy-pages.yml`) |
| Stack IA | `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5) — **Gemini retiré** |
| API banque | Era Context REST (`api.era.app`) avec 9 endpoints + cache TTL 1h |
| Schema store | **v3** (Zustand persist, migrations v1→v2→v3) |

L'app est **fonctionnelle de bout en bout**, déployée, et stable.
Tous les chantiers structurels sont terminés. Ce qui reste est du domain-specific
(Phase 6 tax features) ou des polish optionnels (Phase 5.3-5.5).

---

## 2. Ce qui a été fait — vue chronologique (25 PRs analysées)

### 2.1 Audit initial (PR #33)
- `5a6e4cd` : audit 360° complet par 30 agents — sortie `docs/AUDIT_REPORT.md`
  (maintenant supprimé, l'audit a été condensé dans `AUDIT_2026-05.md` puis ici)

### 2.2 Phase 1 — Fixes critiques (PR #34)
- `5ddab1b` : 14 fixes critiques sécurité + bugs fiscaux
  - F1 inclusion 66.67% gains capitaux annulée
  - F2 dividendes : `cidFedRate` paramétré par admissible/non-admissible
  - F3 `welcomeTax` cumulatif + paliers Montréal complets (jusqu'à 4%)
  - F4 prorata RRQ corrigé pour immigrants
  - F5 bonification PSV 75+ (+10% automatique)
  - F6 BPA × 0.15 fédéral, × 0.14 QC (taux ARC corrects)
  - F8 RRQ_RATE 0.063 → 0.064 (taux 2026)
  - F9 OAS clawback 90 997$ → 93 454$ (seuil 2026)
  - Sécurité S1-S3 : DOMPurify, export JSON sans apiKeys, PBKDF2 itérations renforcées

### 2.3 Phase 2 — Hygiène TypeScript + I/O (PRs #35-37)
- `2811a99` : Block A I/O hardening + Block B TS qualité partiel
- `342ce37` : TS strict partiel + RTL setup + premiers tests composant/store
- `4d0f25e` : `strictNullChecks` activé + tests Dashboard/Settings

### 2.4 Phase 3 — Refactoring structurel (PRs #38-43)
- `0ee2588` : extraction `BackupPanel` + `isPrivacyMode` dans store
- `f87dbde` : extraction `DividendPanel` (sous-composant Investments)
- `c5223d0` : extraction `BudgetGroupTable` + `BudgetAiModal`
- `f42449b` : extraction `ProjectionTooltip` + `ProjectionControls`
- `d5ea4f9` : extraction `PropertyConfigurator` + `MultiPropertyComparison`
- **Split `services/projection.ts`** : 3500 lignes → 1111 lignes orchestrateur + 31 sous-modules dans `services/projection/` (ADR-003)

### 2.5 Drawdown optimization + wiring cross-tab (PRs #44-49)
- `8f74f6a` : optimisation drawdown (PBMA bracket 0, bracket 1 fill, OAS clawback guard à 93 454$, capital loss bank) + wiring `savingsGoals` + `financialGoals`
- `4995517` : `store.lastProjection` exposé pour consommation cross-tab (Option A)
- `bdc8428` : Investments + Children consomment `lastProjection`
- `787c0a6` : Budget consomme `lastProjection` + tests régression `isActive`
- `1bca188` : tests d'intégration drawdown cascade
- `88b0f58` : RealEstate Buy vs Rent affiche le badge équité projeté

### 2.6 UI Refoundation — Phases A/B/C/D (PRs #50-66)

#### Phase A — Design tokens + primitives (PRs #50-53)
- `c63e6d4` (A1) : design tokens sémantiques (`primary`, `success`, `warning`, `danger`, `info`, `secondary`) + scale typo (`text-display`, `text-h1/h2`, `text-body`, `text-meta`, `text-tiny`) dans `tailwind.config.js` + `index.css`
- `d512341` (A2) : primitives `Button`, `Badge`, `SectionHeader` + tests RTL
- `7ac72ef` (A3) : primitives `KPIStat`, `StatGrid`, `CollapsibleSection`, `Pill`
- `da07d2b` (A4) : primitives `PageHeader`, `EmptyState`

#### Phase B — Navigation (PRs #60-61)
- `10e5742` (B1) : sidebar regroupée par intention (Argent / Plan / Objectifs / Outils)
- `6e822f3` (B2) : deep-link cross-tab via `pendingFocus` + `navigateWithFocus(tab, section)` + hook `usePendingFocus` + animation `animate-pulse-once`. 5 consumers branchés.

#### Phase C — Refonte de toutes les pages (PRs #54-59)
- `5e2255b` (C1) : FutureProjection — Hero KPI 4-strip (FIRE / Patrimoine / MC Success / FVI) + 4 CollapsibleSection (Macro / Variabilité / Stochastiques / Avancés)
- `46fa07a` (C2) : Dashboard — PageHeader + 4-KPI StatGrid
- `9f9b4d1` (C3) : Budget — PageHeader + 4-KPI strip + BudgetGroupTable extrait
- `6e1ecfa` (C4) : Investments — PageHeader + Badge santé + sous-composants
- `e07db07` (C5) : RealEstate — PageHeader + 4-KPI StatGrid
- `a68ee6c` (C6+C7) : Transactions, Retirement, TaxCenter, DebtManager, Travel, LifeEvents, Settings, Children — tous adoptent PageHeader

#### Phase D — Mobile + animations (PRs #62-63)
- `0215f36` : bottom nav `text-tiny`, drawer regroupé, touch targets ≥ 56px, `pb-safe` pour iOS, utilities `lift-on-hover` + `animate-pulse-once` + `touch-target`
- `aae3a0f` : tests RTL pages refondues + polish mobile 360px
- `28febeb` : primitives Modal + Tooltip + ConfirmModal refactorisé

#### Phase 3B/3C/3D/3E (PRs #64-66) — polish global
- `e0acb1a` : extraction `TabRouter` + `useDerivedFinancials` hook
- `b69df67` : sweep global `text-[9/10/11px]` → `text-tiny`/`text-meta` (audit §5.2 ✅)
- `bc13d6a` : Onboarding revu + audit performance

### 2.7 AI Assistant enrichi (PR #67)
- `377f6e9` : streaming + 4 prompts suggérés + projection context dans system prompt

### 2.8 Migration Gemini → Claude (PRs #68-73) — voir ADR-001
- `8590d1c` : plan détaillé Phase 4 publié
- `6026fa5` (A1) : `services/claude.ts` créé (550 lignes), schema store v2 ajoute `apiKeys.anthropic`
- `d67793c` (A2) : `AiAssistant` migré (streaming)
- `5a86922` (A3) : `BudgetAiModal` + `Transactions` catégorisation (Haiku 4.5 pour batch)
- `f344cfb` (A4) : `TaxCenter` Vision sur Sonnet 4.6
- `42696fb` (A5) : cleanup final, `services/gemini.ts` supprimé, `@google/genai` retiré, schema v3 (suppression `apiKeys.gemini`)
- `9e4b3a6` : fix `vite.config.ts` manualChunks (régression A5) — bundle `ai-vendor` 289 KB → **130 KB (-55%)**

### 2.9 Era Context — moteur de qualité IA (PRs #74-76) — voir ADR-002
- `5cac040` (B6+B7+B8) : `services/eraContext.ts` étendu (1 → 9 endpoints) + `services/aiOrchestrator.ts` (composer Era+Claude) + Era Context comme categorizer primaire dans Planning
- `d879e7f` : GitHub Pages workflow `.github/workflows/deploy-pages.yml` + `VITE_BASE_PATH` configurable
- `af1dffb` : widget `EraContextInsights` dans Dashboard (showcase Phase 4 B6+B7)

### 2.10 Compound stress scenarios (PRs #77-78)
- `5bd4402` : 2 nouveaux scénarios MC (5 → 7 au total)
  - `COMPOUND_STRESS` (« Tempête Parfaite ») : inflation 5%+, rendements anémiques, `ltcEnabled` forcé
  - `LATE_INHERITANCE` (« Héritage Tardif ») : 250k$ au mois 240 (vs 60 pour WINDFALL)
- `f3dd13b` : polish — grille 7 cartes responsive (`sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7`) + badge "Nouveau" sur compound stress

### 2.11 Polish UI Phase C — Investments standardisation (PR #79)
- `fd5485f` (C4 v2) : KPIStat/StatGrid dans card Portefeuille projeté + 3 CollapsibleSection (Allocation / Rééquilibrage / Portefeuille Détaillé)

### 2.12 A11y + docs cleanup (PR #80)
- `704a599` : skip link "Aller au contenu principal" + `<main id="main" tabIndex={-1}>` (audit §5.1 ✅) + réécriture `TYPECHECK_BACKLOG.md` (obsolète)

### 2.13 Documentation structurée (PR #81)
- `c804534` : CHANGELOG cycle 6 (entrée massive) + `docs/ARCHITECTURE.md` (210 lignes, vue d'ensemble) + 4 ADRs dans `docs/adr/`

### 2.14 Bugs fiscaux Phase 6 (PR #82)
- `3269aaa` : §6.9 REEE plafond lifetime 50 000$/bénéficiaire + §6.10 FHSA fermeture à 71 ans + 2 tests régression

---

## 3. État détaillé des audits

### 3.1 Bugs fiscaux (audit 2026-05 §Bugs fiscaux confirmés)

| # | Statut | Description |
|---|---|---|
| F1 | ✅ Fixé | Inclusion 66.67% gains capitaux >250k$ annulée |
| F2 | ✅ Fixé | Dividendes : `cidFedRate` paramétré (`eligible` / `nonEligible`) |
| F3 | ✅ Fixé | `welcomeTax` cumulatif + paliers MTL complets |
| F4 | ✅ Fixé | Prorata RRQ pour immigrants |
| F5 | ✅ Fixé | Bonification PSV 75+ (+10%) |
| F6 | ✅ Fixé | BPA × 0.15 fédéral, × 0.14 QC |
| F7 | ✅ Fixé | RRSP_ANNUAL_LIMITS[2026] = 33 810$ |
| F8 | ✅ Fixé | RRQ_RATE = 0.064 |
| F9 | ✅ Fixé | OAS_CLAWBACK_2026 = 93 454$ |
| F10 | ✅ Fixé | Paliers fédéraux + QC indexés |
| F11 | ⏳ | Deux sources de vérité RRQ_MPE — à vérifier |
| F12 | ⏳ | Retenue source REER QC : 5/10/15% combinés |
| F13 | ✅ Fixé | REEE plafond 50k$/bénéficiaire (PR #82) |
| F14 | ⏳ | SCHL prime hypothécaire (§6.5) |
| F15 | ⏳ | Stress test B-20 OSFI (§6.6) |
| F16 | ⏳ | FSS retraités (§6.1) |
| F17 | ⏳ | Crédits 65+ et revenu retraite QC (§6.2) |
| F18 | ⏳ | SRG (§6.3) |
| F19 | ⏳ | RAMQ médicaments (§6.4) |
| F20 | ⏳ | TPS/TVQ résidence neuve (§6.7) |
| F21 | ⏳ | Validation mise de fonds min + amortissement max (§6.8) |
| F22 | ⏳ | BPA fédéral/QC précision décimale |

### 3.2 Sécurité (audit §Sécurité)

| # | Statut | Description |
|---|---|---|
| S1 | ✅ | DOMPurify sur `dangerouslySetInnerHTML` LLM-content |
| S2 | ✅ | `handleExport` ne contient plus `apiKeys` |
| S3 | ✅ | PBKDF2 itérations renforcées |
| S4 | ⏳ | Prompt injection via noms de catégories — à sanitizer côté Claude (priorité basse, post-Gemini) |
| S5 | ⏳ | Auth MCP server (acceptable stdio local) |
| S6 | ✅ | Plus de `GEMINI_API_KEY` dans bundle |
| S7 | ⏳ | Fallback `document.write` dans PDF report |

### 3.3 Phase 5 (a11y + i18n)

| # | Statut | Description |
|---|---|---|
| 5.1 | ✅ | Skip link + `<main id="main">` |
| 5.2 | ✅ | 0 occurrence `text-[9-11px]` |
| 5.3 | ⏳ | i18n compléter (32 → ~260 clés/locale) |
| 5.4 | ⏳ | axe a11y CI script |
| 5.5 | ⏳ | Contrast AA check tokens |
| 5.6 | ✅ | CHANGELOG cycle 6 + ARCHITECTURE.md + 4 ADRs |

### 3.4 Phase 6 (manques fiscaux)

| # | Statut | Description |
|---|---|---|
| 6.1 | ⏳ | FSS retraités |
| 6.2 | ⏳ | Crédits 65+ et revenu retraite QC |
| 6.3 | ⏳ | SRG |
| 6.4 | ⏳ | RAMQ médicaments |
| 6.5 | ⏳ | SCHL prime hypothécaire |
| 6.6 | ⏳ | Stress test B-20 OSFI |
| 6.7 | ⏳ | TPS/TVQ résidence neuve |
| 6.8 | ⏳ | Mise de fonds min + amortissement max |
| 6.9 | ✅ | REEE plafond 50k$ lifetime (PR #82) |
| 6.10 | ✅ | FHSA fermeture 71 ans (PR #82) |
| 6.11 | 🚧 | Tests régression (2/N — pour 6.9 et 6.10) |

---

## 4. Ce qui est prévu pour la suite

### 4.1 Court terme — Phase 6 tax features (priorité haute, impact direct)

Items à fort impact $ qui restent **non-implémentés** :

| Item | Effort | Impact $ | Notes |
|---|---|---|---|
| §6.2 Crédits 65+ et revenu retraite QC | 4h | ~970$/personne/an | Crédits non remboursables QC — à ajouter dans `utils/tax.ts` `calculateFiscalReport` |
| §6.3 SRG (Supplément revenu garanti) | 6h | Variable, **crucial** pour scénarios faible revenu retraite | Logique de clawback complexe (table de revenu) |
| §6.4 RAMQ médicaments | 3h | ~744$/adulte/an | Prime annuelle indexée au revenu |
| §6.1 FSS retraités | 3h | Jusqu'à 1 000$/an | Contribution santé QC, > 65 ans |
| §6.5 SCHL prime hypothécaire | 4h | 2.8-4% du prêt | Automatique si mise de fonds < 20% |
| §6.6 Stress test B-20 OSFI | 3h | Validation OSFI | `max(contractRate + 2%, 5.25%)` |
| §6.7 TPS/TVQ résidence neuve | 4h | Remboursement partiel jusqu'à 450k$ | Logique de paliers |
| §6.8 Validation mise de fonds + amortissement max | 2h | Garde-fou réaliste | 5%/35 ans accepté actuellement sans contrainte |

**Ordre suggéré** : 6.2 → 6.4 → 6.6 → 6.8 → 6.1 → 6.5 → 6.7 → 6.3
(le plus de valeur unitaire en premier, SRG complexe en dernier)

### 4.2 Court terme — Polish a11y/UX (priorité moyenne)

| Item | Effort | Notes |
|---|---|---|
| §5.5 Contrast check AA tokens | 3h | Script qui calcule WCAG AA pour chaque combinaison token/background |
| §5.4 axe a11y CI script | 4h | Installer `vitest-axe`, audit auto sur 5 pages clés |
| Form primitives (Input/Select/Field) | 8h | Voir ADR-004 § "Conséquences ouvertes". 133 inputs inline à migrer |
| Mobile 360px validation manuelle | 1h | Le seul critère UI non coché — tester sur device réel |

### 4.3 Long terme — i18n + analytics (priorité basse)

| Item | Effort | Notes |
|---|---|---|
| §5.3 i18n compléter | 10h | 32 clés → ~260 clés. `i18next-scanner` pour auto-extraction |
| `<html lang>` dynamique | 30min | Synchroniser avec i18next (actuellement statique `fr`) |
| Analytics (privacy-friendly) | 6h | Compter usage des onglets, sans tracker tiers — Plausible/Umami self-hosted |
| Multi-utilisateurs (BFF) | 30h+ | Si évolution post mono-user — proxy IA, auth, billing partagé |

---

## 5. Actions recommandées

### 5.1 Immédiat (avant tout nouveau chantier)

1. **Vérifier visuellement les 7 scénarios MC** sur Vercel preview après PR #77/78.
   Confirmer que `COMPOUND_STRESS` et `LATE_INHERITANCE` affichent leur badge "Nouveau"
   correctement et que la grille `xl:grid-cols-7` tient sur un écran 1440px.

2. **Tester sur mobile 360px réel** (iPhone SE / Galaxy A entry-level).
   Le seul critère UI non validé manuellement.

3. **Run `npm run knip`** pour identifier les dead code / imports inutilisés
   (la commande est dans `package.json` mais pas exécutée régulièrement).

### 5.2 Hygiène continue

1. **Ne pas ajouter de `: any` implicite**. Annoter explicitement quand TS ne peut
   pas inférer. Préférer `unknown` à `any` pour index signatures.

2. **Tests d'abord** pour tout fix fiscal — l'audit a montré que beaucoup de bugs
   passaient inaperçus parce qu'aucun test ne validait la valeur de sortie.

3. **CI gate strict** : ne jamais merge avec typecheck ou tests rouges. Le
   workflow `.github/workflows/test.yml` (ou équivalent) doit bloquer le merge.

4. **Mettre à jour CHANGELOG.md à chaque PR significatif**. Le cycle 6 capture
   tout le travail récent — continuer ce pattern.

5. **Créer un ADR à chaque décision structurante** (cf `docs/adr/README.md` pour
   les critères). 6 mois plus tard, "pourquoi on a fait comme ça" est précieux.

### 5.3 Améliorations possibles

#### A. Refactoring qualité (impact moyen, effort moyen)

- **Form primitives** : `Input`, `Select`, `Field` (label + input + error). 133
  `<input>` / `<select>` inline dans `components/`. Pattern à dériver de
  l'existant `Button`/`Badge`.
- **Settings.tsx** reste un god component (1049 lignes). Split possible en
  `SettingsSection` × N (BackupPanel est déjà extrait, on peut continuer).
- **`services/projection.ts`** orchestrateur 1111 lignes. La boucle mensuelle
  est intrinsèquement complexe mais on pourrait extraire les 9 phases dans
  `services/projection/runScenarioMonthly.ts` pour réduire le bruit visuel.

#### B. Performance (impact bas, effort bas)

- **Lazy-load `recharts`** : 445 KB en bundle, chargé sur **toutes** les pages
  même celles sans chart. `React.lazy` autour des composants chart pourrait
  économiser ~100 KB sur première interaction.
- **Lazy-load `pdf-vendor`** (`jspdf` + `html2canvas`) : 594 KB chargés au boot
  pour une fonctionnalité utilisée uniquement dans TaxCenter export. Lazy-import
  dans la handler de bouton.
- **MC perf** : `new Date()` × 72 000 dans la boucle MC (audit Top25 #11). Cache
  la date courante par mois.

#### C. Robustesse (impact haut, effort bas)

- **AbortController** pour Era Context : déjà en place pour Era, à dupliquer
  pour Claude (timeout sur `chatStream`).
- **Validation Zod côté Claude** : les réponses structurées (catégorisation,
  payslip) doivent être Zod-validées pour catch les régressions de modèle.
  La structure existe (`services/claude.ts`) mais à vérifier sur tous les
  endpoints.
- **Test du Layout** : aucun test RTL pour `Layout.tsx`. Tester au minimum
  l'apparition du skip link au focus clavier.

#### D. UX (impact moyen, effort moyen)

- **Empty states partout** : 3 endroits en ont, 14+ pages n'en ont pas. Pattern
  `<EmptyState>` (primitive) est déjà disponible.
- **Skeleton loading** : `.skeleton-box` CSS existe mais utilisé inégalement.
  À brancher systématiquement pendant les loads (Dashboard chart, Investments
  history, etc.).
- **Command palette Cmd+K** (audit §4.5) : nav globale rapide. Effort modéré
  (~6h) mais transforme l'UX desktop.

#### E. Domaine fiscal (impact très haut, effort élevé)

- Implémenter les §6.1-6.8 dans l'ordre suggéré §4.1.
- Ajouter des tests régression par item (§6.11). 9h estimés pour ~25 tests.
- Considérer un mode "audit fiscal" qui présente toutes les hypothèses de calcul
  à l'utilisateur de manière transparente (le mode actuel est implicite).

---

## 6. Documents conservés et où trouver l'info

| Document | Contenu |
|---|---|
| `docs/HANDOVER.md` (CE document) | Vue d'ensemble + roadmap + recommandations |
| `docs/ARCHITECTURE.md` | Stack, topologie, store, pipeline IA, workflow |
| `docs/PROJECTION.md` | Détail du moteur (9 phases mensuelles, 7 scénarios, MC) |
| `docs/WIRING_NOTES.md` | Wirings inter-onglets (`lastProjection`, deep-links) |
| `docs/adr/` | 4 ADRs structurants (Claude migration, Era pattern, projection split, design system) |
| `CHANGELOG.md` | Historique versionné des releases |

Les autres docs ont été supprimés (voir §7).

---

## 7. Documents supprimés (cleanup 2026-05)

Pour réduire le bruit et éviter les sources de vérité divergentes :

| Document | Raison |
|---|---|
| `docs/AUDIT_2026-05.md` | Statut consolidé dans ce HANDOVER §3 |
| `docs/PLAN_PHASE_4.md` | Migration Claude+Era terminée — ADR-001 + ADR-002 résument |
| `docs/UI_REFOUNDATION_PLAN.md` | Toutes phases terminées — ADR-004 résume |
| `docs/TYPECHECK_BACKLOG.md` | Backlog résorbé — info captée dans ADR-003 |
| `docs/archive/AUDIT_REPORT.md` | Audit initial 30 agents — remplacé par AUDIT_2026-05 puis HANDOVER |
| `docs/archive/META_AUDIT.md` | Méta-audit — obsolète |
| `docs/archive/PLAN_DE_FIX.md` | Plan de fix initial — fixes exécutés et trackés en commits |
| `docs/archive/RAPPORT_FIXES.md` | Rapport de fixes — info dans CHANGELOG |
| `docs/archive/plan_mcp_financeai.md` | Plan MCP — code MCP existe dans `mcp/`, ce plan était un brouillon |

Toute info historique nécessaire est :
1. Soit dans les commits (`git log`)
2. Soit dans `CHANGELOG.md` (cycle 6 capture l'essentiel)
3. Soit dans les ADRs (`docs/adr/`)
4. Soit dans `docs/PROJECTION.md` / `docs/ARCHITECTURE.md`

---

## 8. Commandes utiles

```bash
# Setup
npm install

# Dev
npm run dev                  # localhost:3000

# Validation
npm run typecheck            # tsc --noEmit, doit rester clean
npm test                     # vitest, doit rester 227/227
npm run build                # vérifie le bundle prod
npm run lint                 # eslint .

# Outils
npm run knip                 # détecte exports/imports inutilisés
npm run mcp:dev              # lance le serveur MCP local
```

Workflow Git :
```bash
git checkout claude/analyze-finance-app-CtLvs
# modifier...
npm run typecheck && npm test -- --run && npm run build
git add . && git commit -m "feat/fix/chore: ..."
git push -u origin claude/analyze-finance-app-CtLvs
# → ouvrir PR (draft par défaut)
```

---

## 9. Contacts et liens

- **Repo** : https://github.com/MoKarade/FinanceAI
- **Vercel preview** : auto-déployé par PR (lien dans le commentaire bot)
- **GitHub Pages** : https://mokarade.github.io/FinanceAI/ (workflow `deploy-pages.yml`)
- **Anthropic API** : clé personnelle de l'utilisateur, stockée dans Zustand store (`apiKeys.anthropic`)
- **Era Context** : Bearer token utilisateur, stocké dans `apiKeys.eraContext`

---

> **Pour reprendre** : lire ce HANDOVER en entier, puis `ARCHITECTURE.md` et
> `PROJECTION.md` selon le besoin. Les ADRs documentent les choix
> structurants déjà faits — ne pas les refaire sans lire `docs/adr/`.
