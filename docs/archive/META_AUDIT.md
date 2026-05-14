# Meta-Audit FinanceAI — Vague 2 (4 agents ECC)

> Suite a `AUDIT_REPORT.md`, `PLAN_DE_FIX.md`, `RAPPORT_FIXES.md`. Cette vague utilise 4 agents specialises du repo `MoKarade/claude-config` (personas ECC : Everything Claude Code).
>
> Agents lances en parallele : `silent-failure-hunter`, `a11y-architect` (WCAG 2.2 AA), `typescript-reviewer`, `build-error-resolver` (via reproduction CI locale).

---

## TL;DR

Les 8 commits de la session 1 ont **introduit 1 regression de compilation TS critique** : `components/GuideModal.tsx:60` referencait encore `case Tab.GOALS:` apres la suppression de `Tab.GOALS` du Tab enum. Le typecheck CI/Netlify echouait, le repo ne deployait plus en prod. **Fix livre commit `9359310a`**.

En parallele, les 3 audits ECC ont leve **74 findings supplementaires** non couverts par la vague 1 :

- **silent-failure-hunter** : 47 findings (8 CRITIQUES, 14 HAUTS, 13 MOYENS, 12 BAS) — 7 patterns recurrents, dont la procedure de Restore qui peut perdre toutes les donnees, et 4 catch silencieux qui retournent `[]`/`null` indistinguables d'un succes.
- **a11y-architect WCAG 2.2 AA** : score **3/10**, 5 CRITIQUES + 8 HAUTS + 10 MOYENS + 6 BAS. 10 ADR-ACC (Decisions architecturales accessibilite). L'app est inutilisable au lecteur d'ecran.
- **typescript-reviewer** : verdict **Block** initial (a cause de GuideModal), 3 CRITIQUES + 12 HAUTS + 15 MOYENS. Score TS **5.5/10**. `tsconfig.json` n'a pas `strict: true`, `useFutureSimulation.ts` (1947 lignes) cumule 22 `any`.

**Note globale post-vague-2** : si les fixes critiques de cette vague sont appliques (GuideModal + handleRestore atomic + tsconfig strict + a11y quick wins), l'app peut passer de **6.4/10 a 7.5/10**. Sinon elle stagne ou regresse.

---

## Section 1 — Fix CI critique (deja livre)

### Commit `9359310a` — fix(GuideModal): retirer case Tab.GOALS

**Probleme** : la suppression de `Tab.GOALS` au commit `1345c9c7` n'a pas ete propagee a `components/GuideModal.tsx:60` qui contenait encore `case Tab.GOALS:` dans le `getContent()` switch. Le typecheck `tsc --noEmit` echouait avec `TS2339: Property 'GOALS' does not exist on type 'typeof Tab'`. La nouvelle CI Netlify (`typecheck && test && build`) refusait tout deploy.

**Fix** :
- Retire le case et son bloc objet (10 lignes) de GuideModal.tsx.
- Migre le contenu utile (Objectifs IA + Connexion Auto) vers `case Tab.FUTURE` qui est maintenant le hub des objectifs.
- Bonus a11y : `aria-label="Fermer le guide"` sur le bouton de fermeture (ADR-ACC-001).

**Verification** : apres ce commit, npm run typecheck doit passer. Le pipeline GitHub Actions doit etre vert.

---

## Section 2 — Audit Silent Failures (47 findings)

Persona ECC : `silent-failure-hunter` — zero tolerance pour les empty catch, swallowed errors, bad fallbacks, missing error propagation.

### CRITIQUES (8)

| # | Fichier:ligne | Issue | Impact |
|---|---|---|---|
| 1 | `App.tsx:157` | `catch { /* swallow */ }` dans hydrateAssets | Utilisateur croit que ses graphiques sont vides legitimement alors que l'API est down |
| 2 | `Settings.tsx:190` | `localStorage.clear()` AVANT le write des nouvelles valeurs | **Datapocalypse** : si une seule ligne setItem throw, perte irreversible de toutes les donnees |
| 3 | `Settings.tsx:224` | `catch (err) { showToast('Echec', 'error'); }` sans log | Impossible de diagnostiquer l'echec de restauration |
| 4 | `Retirement.tsx:83` | `catch (_) { }` | Projections retraite sur donnees corrompues silencieusement |
| 5 | `TaxCenter.tsx:55-101` | `analyzeSingleFile` throw apres 3 modeles, mais `handleFileDrop:125` n'a aucun try/catch | UI bloquee sur "Analyse en cours" eternelle, requiert reload |
| 6 | `TaxCenter.tsx:87` | `JSON.parse(response.text)` sans try/catch | False negatives masques quand Gemini retourne markdown |
| 7 | `lunchMoney.ts:60-63` | Aucun AbortController ni timeout sur la pagination | UI gelee 10+ minutes sur reseau lent |
| 8 | `useFinanceStore.ts:152-170` | Catch global retourne defaultState ; si le backup throw aussi (storage plein) = perte totale | Datapocalypse silencieuse, app vide au reload sans warning |

### Patterns recurrents (7 identifies)

1. **`return []` / `return null` sur catch silencieux** (7 occurrences). Le caller ne distingue pas "echec reseau" de "donnees vides legitimes". Fix : type Result `{ ok, value | error }`.
2. **Logs sans prefixe ni contexte** (15+). `console.error(e)` au lieu de `[ModuleName] action: error`. Impossible a grepper en prod.
3. **`useEffect` async sans cleanup** (7 occurrences : App, Dashboard, FutureProjection, Retirement, Investments, RealEstate, Onboarding). Race conditions + warnings React.
4. **Fallback "soft" sur API critiques** (FX rates, macro, marketData). Defaults silencieux — chiffres financiers suspects sans badge "stale".
5. **Re-throw sans `cause` (perte de stack)** (5 occurrences pdfReport, cloudBackup, TaxCenter). ES2022 `{ cause }` jamais utilise. Debug post-mortem impossible.
6. **`localStorage.setItem` non-defensif** (5 occurrences). QuotaExceeded sur Safari iOS (5MB) silencieux.
7. **`JSON.parse` sans validation Zod** (multiples). Risque prototype pollution `__proto__` `constructor`.

### Top 5 fixes prioritaires

1. **Atomiser `handleRestore`** (Settings.tsx:167-230) : snapshot avant clear, validation Zod, commit 2-phases. Evite la datapocalypse. **2h, P0**.
2. **Type Result partout** (`fetchPortfolioHistory`, `fetchFxRates`, `categorizeBatch`, etc.) : tous les downstream peuvent afficher "donnees stale". **4h, P1**.
3. **Banner global "Donnees corrompues"** dans useFinanceStore : `migrationFailed: boolean` + bandeau persistant. **1h, P0**.
4. **Try/catch + finally setIsAnalyzing(false)** dans TaxCenter.handleFileDrop. **30 min, P0**.
5. **Cleanup `useEffect` partout** : flag cancelled + AbortController. **2h, P1**.

---

## Section 3 — Audit Accessibilite WCAG 2.2 AA (Score 3/10)

Persona ECC : `a11y-architect` — POUR (Perceivable, Operable, Understandable, Robust).

### CRITIQUES (5)

| # | Issue | SC WCAG | Impact |
|---|---|---|---|
| C1 | `Toast.tsx:32-47` sans `role="status" aria-live="polite"` | SC 4.1.3 Status Messages | Lecteurs d'ecran ne savent jamais qu'une action a reussi/echoue (sync, restore, IA) |
| C2 | Toutes les modales (ConfirmModal, GuideModal, Onboarding, Wizard, AiAssistant) sans `role="dialog" aria-modal` ni focus trap | SC 2.4.3, SC 2.1.2 | Focus perdu, contenu page parent et modale entremeles, Escape ne ferme pas |
| C3 | Navigation principale en `<a href="#tab">` au lieu de `<button>` (Layout.tsx:204-244) | SC 4.1.2 Name/Role/Value | "Lien Dashboard" annonce mais c'est un changement de vue. Aucun `aria-current="page"` |
| C4 | Boutons emoji-only sans aria-label (~80 occurrences : Layout, AiAssistant, Budget, Transactions, Settings, LifeEvents, RealEstate) | SC 4.1.2, SC 1.1.1 | VoiceOver annonce "bouton, fusee" ou rien du tout |
| C5 | Sliders financiers sans `aria-label` ni `aria-valuetext` (RealEstate, FutureProjection, Budget) | SC 4.1.2, SC 1.3.1 | "Curseur, 450000" sans indication "dollars" ni contexte semantique |

### HAUTS (8)

- **H1** : `confirm()` natif bloquant restant dans Settings.tsx:175, LifeEvents.tsx:709, 735.
- **H2** : Inputs sans `<label htmlFor>` (Settings, Onboarding, RealEstate selects).
- **H3** : Navigation hash-based ne deplace JAMAIS le focus vers `<main>`. Skip link absent.
- **H4** : Target Size SC 2.5.8 insuffisant : boutons supprimer en `opacity-0 group-hover` (Budget.tsx:501, Transactions.tsx:380) inaccessibles mobile.
- **H5** : `outline: none` sans alternative `:focus-visible` (AiAssistant, Transactions, Settings inputs). Aucun focus indicator.
- **H6** : Drag-drop dans LifeEvents.tsx sans alternative single-pointer (SC 2.5.7 WCAG 2.2 AA).
- **H7** : `<span onClick>` ou `<div onClick>` interactif sans clavier (RealEstate.tsx:178, Layout.tsx:158, Settings.tsx:280).
- **H8** : Inputs number sans `inputMode="decimal"` ni `aria-describedby` pointant vers contraintes.

### Top 5 quick wins (60% des findings)

1. **`role="status" aria-live="polite"` au ToastContainer** — 5 lignes, debloque a11y de toutes les confirmations.
2. **Wrapper modales avec `role="dialog" aria-modal aria-labelledby`** + Escape handler global — hook `useDialog()` reutilisable.
3. **`aria-label` sur tous les emoji-only buttons** — composant `<IconButton emoji label />` qui force.
4. **Regle CSS globale `:focus-visible`** dans index.css (3 lignes) — repare SC 2.4.11 d'un coup.
5. **Remplacer `<a href="#tab">` par `<button aria-current>`** dans Layout.tsx.

### 10 ADR-ACC documentees

ADR-ACC-001 a 010 : decisions architecturales pour atteindre WCAG 2.2 AA. Documentees dans le rapport de l'agent (transcript), couvrent IconButton standardise, useDialog hook, skip link + main landmark, focus-visible global, AccessibleChart wrapper Recharts, Slider accessible, eliminer confirm() natif, sync `<html lang>` avec i18n, prefers-reduced-motion, audit Target Size 24x24 SC 2.5.8.

---

## Section 4 — Audit TypeScript Reviewer (Score 5.5/10)

Persona ECC : `typescript-reviewer` — type safety, async correctness, security, idiomatic patterns. Verdict initial **Block** a cause de GuideModal Tab.GOALS (maintenant fixe).

### CRITIQUES (3)

1. **`GuideModal.tsx:60` Tab.GOALS** — **FIXE commit `9359310a`**.
2. **`Settings.tsx:204` JSON.parse sans Zod + localStorage.clear() avant write** — datapocalypse possible. Schema Zod existe deja en deps. Backlog P0.
3. **`pdfReport.ts:264-300` `document.write` + `GuideModal.tsx:172` `dangerouslySetInnerHTML`** — risque XSS faible aujourd'hui (data numerique) mais anti-pattern. Sanitize via DOMPurify.

### HAUTS (12)

1. `useFutureSimulation.ts` cumule **22 `any`** sur 1947 lignes (6 annotations + 11 casts + 3 `any[]`). Le moteur central de projection bypass le type checker.
2. **`tsconfig.json` n'a PAS `strict: true`** — seul `noImplicitAny` actif. `strictNullChecks`, `useUnknownInCatchVariables` etc. tous OFF. Pour une app de finance c'est insuffisant.
3. `useFinanceStore.ts:177-181 partialize` utilise `as any` dispensable. Un futur ajout de champ volatile non detecte.
4. `migrateUserConfig(config: any): any` et `migrateBudgetItems((g: any))` bypass complet. Risque corruption silencieuse.
5. `Onboarding.tsx:36` `as [any, any]` cree un User incomplet (champs birthYear, hasOwnedPropertyLast4Years absents).
6. `App.tsx:119, :130` fire-and-forget sans cleanup AbortController. Race conditions sur change rapide cle API.
7. `App.tsx:147-152` boucle sequentielle `for...await` avec `setTimeout(2500)` = 50+ secondes de freeze pour 20 actifs. Fix : `Promise.allSettled`.
8. `AiAssistant.tsx:50-58` vs `gemini.ts:24-31` : **duplication `sanitizePayee` et `roundToHundred`**. Drift garanti. Extraire dans `services/sanitization.ts`.
9. `AiAssistant.tsx:68-72` : conversion FX **hardcodee** 1.38/1.50 au lieu de `state.fxRates`. Chiffres incoherents avec le reste de l'app.
10. `AiAssistant.tsx:148` catch generique "Verifie ta cle API" pour quota/rate limit. Utilisateur change inutilement sa cle.
11. `console.log` en production : lunchMoney.ts:28, finance.ts:159/184/257, pdfReport.ts:248. Leak comportemental si screen share.
12. `Onboarding.tsx:46` `data.apiKeys!.lunchMoney` non-null assertion apres optional chain. Redondant et trompeur.

### Top 10 issues prioritaires non couvertes par les fixes

1. **GuideModal Tab.GOALS** — FIXE.
2. **`tsconfig.json strict: true`** — P0 sprint dedie.
3. **22 `any` dans useFutureSimulation.ts** — P1 (refactor + tests).
4. **JSON.parse non valide dans Settings.tsx:204** — P0 (atomic + Zod).
5. **Settings.tsx:218-219 reecrit `lm_token`/`gemini_key` en clair** — P0 annule mon fix C1.
6. **App.tsx fire-and-forget effects sans AbortController** — P1 (5+ useEffect).
7. **App.tsx:147-152 sequentiel sur actifs** — P1 perf.
8. **AiAssistant.tsx:68 FX hardcodee** — P1 coherence.
9. **Duplication `sanitizePayee`** — P2 dette technique.
10. **Migration localStorage ne purge pas anciennes cles** — P1 securite.

### Anti-patterns recurrents (8 categories)

- `as any` pour ajouter proprietes runtime (11+ occurrences).
- `catch (e: any)` puis message generique (8+).
- Promesses fire-and-forget dans useEffect (4+).
- `.find(...) || defaultValue` au lieu de narrowing (multiples).
- `Math.max(0, ...)` partout pour cacher bugs de calcul.
- Mutable shared state au niveau module (services/finance.ts).
- Inline `<style>` avec template literal dans JSX (Layout.tsx:144-147).
- Type assertion `!` apres optional chain (App.tsx:373, Layout.tsx:84).

---

## Section 5 — Plan de remediation post-vague-2

### P0 immediats (~4h)

1. **Atomiser handleRestore + Zod schema** (silent #2 + TS #4) — Settings.tsx:167-230. Evite datapocalypse.
2. **Banner "Donnees corrompues"** (silent #8) — useFinanceStore expose `migrationFailed`.
3. **TaxCenter handleFileDrop try/catch + finally** (silent #5) — evite UI gelee.
4. **Toast `role="status" aria-live`** (a11y C1) — 5 lignes.
5. **Settings restore : exclure `lm_token` / `gemini_key`** (TS #5) — coherence avec fix C1 commit `e7aaad6f`.
6. **Activer `tsconfig.json strict: true`** (TS #2). Sera bruyant mais necessaire ; chaque erreur revelee est un bug.

### P1 (1-2 sprints)

7. Hook `useDialog()` + migrer 5 modales (a11y C2).
8. `<IconButton>` standardise (a11y C4) + migrer ~80 occurrences.
9. `aria-label` + `aria-valuetext` sur tous les sliders financiers (a11y C5).
10. Skip link + `<main tabIndex={-1}>` + focus mgmt sur change tab (a11y H3).
11. Type Result pour API silencieuses (silent pattern #1 + #4).
12. Cleanup `useEffect` partout avec flag cancelled / AbortController (silent #3).
13. Extraire `sanitizePayee` dans `services/sanitization.ts` (TS #8).
14. AiAssistant utilise `state.fxRates` au lieu de hardcode (TS #9).
15. Purger anciennes cles localStorage apres migration (TS #5).

### P2 (refactors structurels)

16. Splitter `useFutureSimulation.ts` (1947 lignes, 22 `any`) en hooks typeses + tests de non-regression.
17. Wrapper `<AccessibleChart>` Recharts + `<table sr-only>` resume.
18. CSS global `:focus-visible` + bannir `outline-none` sans alternative.
19. ErrorBoundary par tab.
20. Migration physique `utils/useFutureSimulation.ts` -> `services/projection.ts`.
21. Slices Zustand + selecteurs.
22. Tests RTL composants critiques + E2E Playwright.
23. Mettre a jour baremes fiscaux 2026.
24. `prefers-reduced-motion` global (a11y B2).
25. Eliminer `confirm()` natif (a11y H1) restant.

### P3 (continu)

- Logs structures `[Module] action: ...` avec contexte (silent pattern #2).
- `{ cause }` sur tous les re-throw ES2022 (silent pattern #5).
- `safeSetItem` partout (silent pattern #6).
- Validation Zod sur reponses LLM Gemini.
- Mobile responsive Transactions tableau.
- Conversation persistee AiAssistant.
- Synchroniser `<html lang>` avec i18n (a11y M9).
- `crypto.randomUUID()` complet au lieu de slice(0,9) dans gemini.ts.

---

## Section 6 — Synthese chiffree post-vague-2

### Findings cumules (vague 1 + vague 2)

- **Securite** : 2 critiques + 3 hauts (vague 1) + 0 nouveau critique vague 2 — dont **2 critiques fixes** (B1 AiAssistant prop, C1 apiKeys persist) + **1 critique introduit puis fixe** (GuideModal Tab.GOALS).
- **A11y** : 5 critiques + 8 hauts + 10 moyens + 6 bas (nouveau, non couvert vague 1).
- **Silent failures** : 8 critiques + 14 hauts + 13 moyens + 12 bas (nouveau).
- **TypeScript** : 3 critiques + 12 hauts + 15 moyens (nouveau).
- **UX completude** : 18 onglets audites vague 1, GOALS retire en vague 1.
- **Architecture/perf** : non re-audite vague 2.

### Note globale

| Axe | Vague 0 | Apres vague 1 (8 commits) | Apres GuideModal fix (vague 2) | Apres P0 vague 2 (estime) |
|---|---|---|---|---|
| Securite | 5/10 | 7/10 | 7/10 | 8/10 |
| Architecture | 6/10 | 6/10 | 6/10 | 6.5/10 |
| Performance | 4/10 | 4/10 | 4/10 | 4.5/10 |
| Tests | 5/10 | 6/10 | 6/10 | 6/10 |
| UX/Completude | 6/10 | 7/10 | 7/10 | 7.5/10 |
| Type safety | 7/10 | 7/10 | 7/10 (deploy debloque) | 8/10 (avec strict) |
| Maintenabilite | 5/10 | 6/10 | 6/10 | 6.5/10 |
| Documentation | 7/10 | 8/10 | 9/10 (3 rapports + plan) | 9/10 |
| **A11y** | 3/10 (decouvert) | 3/10 | 3/10 | 6/10 (apres quick wins) |
| **Silent failures** | non audite | non audite | revele 47 | 7/10 (apres top 5) |

**Note moyenne post-fix CI : ~6.5/10** (a confirmer apres P0 vague 2).

---

## Section 7 — Agents ECC utilises et disponibles

### Agents utilises (vagues 1+2)

1. `silent-failure-hunter` (vague 2)
2. `a11y-architect` (vague 2)
3. `typescript-reviewer` (vague 2)
4. `build-error-resolver` (vague 2 — indirectement via reproduction CI)

### Agents pertinents disponibles (non utilises) pour next sprints

- `architect` (6.3 KB) — architecture haut niveau, slices Zustand, MCP server design.
- `code-reviewer` (8.8 KB) — review general (complementaire a TS-reviewer).
- `code-architect` (1.5 KB) — design patterns.
- `code-explorer` (1.6 KB) — navigation rapide.
- `code-simplifier` (1.3 KB) — simplification post-fix.
- `chief-of-staff` (5.6 KB) — PM / coordination multi-agents.
- `database-reviewer` (4.3 KB) — N/A (pas de DB).
- `e2e-runner` (4.1 KB) — PARFAIT pour ajouter Playwright + scenario E2E onboarding -> Dashboard.
- `tdd-guide` (2.9 KB) — ajouter tests sur useFutureSimulation.
- `pr-test-analyzer` (946 B) — analyser tests dans une PR.
- `comment-analyzer` (1 KB) — review comments code (notre code en a peu).
- `doc-updater` (3.4 KB) — mettre a jour CHANGELOG_COMPLET.md, README.md.
- `docs-lookup` (3.6 KB) — recherche doc.
- `refactor-cleaner` (2.7 KB) — cleanup dette technique (knip / depcheck / ts-prune).
- `performance-optimizer` (12.5 KB) — perf detaillee (P1 lazy + manualChunks).
- `seo-specialist` (1.9 KB) — N/A (app privee).
- `type-design-analyzer` (896 B) — design des interfaces TS.
- `gan-evaluator` / `gan-generator` / `gan-planner` — approche GAN, utile pour iterer sur le moteur de projection.
- `harness-optimizer` (928 B) — optimisation des hooks de tests.
- `loop-operator` (922 B) — monitoring continu.
- `conversation-analyzer` (1.4 KB) — analyse des transcripts de cette session.
- `opensource-forker` / `packager` / `sanitizer` — si Marc veut publier FinanceAI en open-source.
- `planner` (7 KB) — planification long-terme.

### Agents non pertinents (autres langages)

`cpp-build-resolver`, `cpp-reviewer`, `csharp-reviewer`, `dart-build-resolver`, `flutter-reviewer`, `go-build-resolver`, `go-reviewer`, `java-build-resolver`, `java-reviewer`, `kotlin-build-resolver`, `kotlin-reviewer`, `python-reviewer`, `pytorch-build-resolver`, `rust-build-resolver`, `rust-reviewer`, `healthcare-reviewer`.

---

## Section 8 — Validation post-CI-fix

Avant le merge de cette branche sur main :

```bash
git pull
npm ci
npm run typecheck   # doit etre exit 0 (etait casse depuis le commit 1345c9c7)
npm run test        # 46/46 OK
npm run lint        # warnings seulement
npm run build       # exit 0
```

Le pipeline GitHub Actions doit passer au vert sur la branche `claude/analyze-finance-app-CtLvs`. Le deploy Netlify doit reussir.

Tests manuels post-deploy :
1. Ouvrir l'app et cliquer sur le bouton ! du Layout : la modale GuideModal doit afficher le contenu correct (pas de crash).
2. Cliquer sur l'onglet Future : verifier que le contenu "Objectifs IA + Connexion Auto" apparait dans le guide.
3. AiAssistant : envoyer une question immobiliere. Verifier que le contexte Gemini contient la propriete (pas `undefined`).

---

## Conclusion

La vague 2 a revele que **les fixes initiaux avaient introduit 1 regression critique** (TS2339 sur GuideModal). Sans la CI Netlify branchee au commit `3cd66cb8`, ce bug serait passe en prod silencieusement — le pipeline a fait son job en bloquant.

Les 3 audits ECC (silent-failure-hunter, a11y-architect, typescript-reviewer) ont leve **74 findings supplementaires** non couverts par la vague 1, dont :
- **datapocalypse possible** sur Settings restore,
- **score a11y catastrophique** 3/10 (l'app est inutilisable au lecteur d'ecran),
- **22 `any`** dans le moteur de projection central,
- **`tsconfig.json` non strict** qui masque des classes entieres de bugs.

Les 6 fixes P0 vague 2 (~4h de travail) peuvent porter la note globale de **6.4/10 a 7.5/10**. L'a11y reste le plus gros chantier (sprint dedie ~1 semaine).

**Recommandation immediate** : verifier que le commit `9359310a` debloque bien la CI, puis attaquer les P0 dans l'ordre du Section 5.
