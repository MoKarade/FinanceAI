# Changelog

Toutes les modifications notables apportées au projet sont documentées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

---

## [unreleased — cycle 17 : Refonte graphique « Google Finance » (zoom partout + Futur)] — 2026-05-22

> Refonte transverse des graphiques : zoom molette / pan / reset sur **tous** les
> onglets + refonte complète du graph Futur. Architecture réutilisable
> (`useTimeChartZoom` + `ZoomContainer`). Commits `53d1faf`, `22922de`, `25f0838`,
> `6da3869`, `9a058a3`, `7473809`, `486a324` (poussés sur main).

### Graph Futur (G2-G6, G3b)

- **G3** — sous-onglets 📈 Graphique / ⚙️ Paramètres (KPIs toujours visibles).
- **G4** — zoom molette + pan + double-clic reset + sélecteur de période
  (5/10/20/30 ans/Tout) ; remplace le `<Brush>`. Logique extraite dans le hook
  `useTimeChartZoom`, partagé avec `ZoomableTimeChart`.
- **G5** — un événement = une pastille emoji individuelle **cliquable** → fiche
  détail (date/âge/valeur nette). Dedup des labels répétés + plafond de densité
  échantillonné ; rendu via le prop `shape` du ReferenceDot (recharts v3 n'affiche
  pas `LabelList` dans `ReferenceDot`).
- **G6** — infobulle refondue : conteneur dégradé + accent + apparition animée,
  hero valeur nette, pastilles de couleur sur la répartition.
- **G2** — labels de lignes FIRE/Aujourd'hui en pastilles ancrées aux bords
  (`RefLineLabel`), plus de texte illisible par-dessus les aires.
- **G3b** — plein écran via la **Fullscreen API** (top layer du navigateur, échappe
  à l'ancêtre transformé qui piégeait `position:fixed`).

### Zoom sur tous les autres graphs (G7)

- Composant réutilisable `ZoomContainer` (ref + handlers + bouton « Vue complète » + hint).
- Zoom molette/pan/reset ajouté à : **Dette** (extinction), **Retraite**
  (accumulation + cashflow), **Enfant** (coûts par âge + REEE), **Immobilier**
  (Acheter-vs-Louer + comparaison multi-propriétés). Dashboard + Investissements
  avaient déjà la molette (`ZoomableTimeChart`) + leur propre sélecteur de période.

### Détail au clic + légende interactive (G9, G10)

- **G9 P1** — clic sur le graph Futur → modale détaillée (`FutureDetailModal`,
  `createPortal` vers `body`) : tous les comptes (valeur + variation), événement
  du point cliqué, et **drill-down par compte** (graph valeur au fil du temps
  avec zoom + sélecteur de période). Pastilles cliquables → même modale.
- **G9 P2** — distinction **apport vs gain** par compte (chips Apport/Gain dans
  l'infobulle et la modale). Données déjà émises par le moteur
  (`Contrib*`/`MarketGrowth*`/`NetTransfer*` dans `chartData`) → UI seule, aucune
  extension moteur.
- **G10** — **légende interactive** : chaque série (Cash/CELI/REER/REEE/Non-Enreg/
  Crypto/Équité Immo, Valeur Nette, Impôt Latent, Paiement Impôts, Monte Carlo,
  Événements/icônes, Objectif FIRE, Aujourd'hui) est un chip cliquable
  afficher/masquer ; swatch dont la **forme** reflète l'encodage (aire/ligne/barre/
  pointillé/point). Choix persisté en localStorage (`future:hiddenSeries:v1`,
  même convention que `dashboard:hiddenAccounts:v1`) + bouton « Tout réafficher ».
  Le chip Monte Carlo n'apparaît que si MC est activé.

### Clic partout + explications + infobulle v2 (G11, G12, G13)

- **G12** — clic **n'importe où** sur le graph Futur ouvre la modale détail (plus
  seulement les pastilles d'événement). Le mois cliqué est résolu par géométrie
  (X du clic vs grille cartésienne) → robuste au tactile et là où recharts ne
  déclenche pas son `onClick` interne. Glisser (pan) ≠ clic (seuil de distance).
- **G13** — dans le drill-down par compte : explication **mois par mois** du
  pourquoi ça monte/descend, à partir des composantes réelles du moteur
  (gain marché `MarketGrowthX` vs apport/retrait net `NetTransferX`) + section
  « Moments clés » (plus gros mouvements). La cause précise d'un retrait vient
  des **événements** du moteur (« Achat Immo », « Palier 14% », « FERR »…), pas
  d'une devinette — un retrait CELI peut financer un achat immo (RAP), pas
  forcément la retraite (no-fake-data).
- **G11** — infobulle au **survol** refondue en résumé concis (date, valeur nette,
  variation, apport-vs-gain, aperçu d'événement, « clique pour le détail »). Tout
  le détail exhaustif (chaque compte, flux, impôts, drill-down) est réservé au
  **clic** dans la modale. Règle le souci « infobulle trop longue pour sa taille ».

### Lisibilité + espace de cotisation (G14-G19)

- **G14** — l'infobulle au survol redonne le détail par compte (valeur + rendement
  du mois par compte) et les revenus/dépenses, en plus du hero valeur nette.
- **G15** — libellés clarifiés : « Gain marché » → « Rendement placements »,
  « Retrait » → « Retrait (argent sorti) », le gros chiffre est nommé « Variation »,
  + une ligne de légende expliquant Variation = rendement + dépôts − retraits.
- **G16** — icônes d'événements (retraits, achats…) sur chaque mini-graph de
  compte dans le drill-down, avec exclusion du bruit récurrent et plafond de densité.
- **G17** — Monte Carlo bien plus visible : tracé en cône d'incertitude
  (P10/P90 pointillés + médiane pleine) **par-dessus** la pile d'aires (il était
  occulté + à 5 % d'opacité). 
- **G18** — Monte Carlo confirmé déjà reproductible (RNG seedé
  `scenarioType-strategy-iteration`, aucun `Math.random`) : mêmes percentiles à
  chaque recalcul. La stabilité est désormais visible grâce à G17.
- **G19** — détail **par année de l'espace de cotisation gagné** (CELI/REER) dans
  le drill-down : dérivé par conservation depuis `CELIMax`/`REERMax` + cotisations
  (capture aussi le ré-ajout d'espace CELI après un retrait/RAP). Aucune extension moteur.
- **G20** — le **FHSA/CELIAPP** devient un compte first-class : présent dans le graphe
  principal (aire empilable + chip de légende), l'infobulle (valeur + rendement), la
  modale (compte + drill-down + moments + marqueurs) et la table d'espace de cotisation.
  Le moteur émet désormais `CELIAPPMax = fhsaRoom + celiapp` (additif, ne change pas la
  simulation). Note : il ne s'affiche que s'il est financé (achat immo futur).

### Optimiseur « meilleure façon » — Phase 1 (G21)

- **Sélecteur d'objectif** dans l'onglet Futur (Équilibré / Patrimoine max / Impôt
  minimum / FIRE le plus tôt), persisté en localStorage.
- **Recommandation auto** : l'app classe les 7 scénarios déjà calculés selon
  l'objectif et propose le meilleur (nom + patrimoine + impôt à vie + âge FIRE),
  avec un bouton « Appliquer cette stratégie ». Module pur `strategyRanking.ts`
  (testé, 6 cas) — réutilise les métriques déterministes par scénario, aucune
  relance de simulation. Phases 2-3 à venir (actions concrètes par année + vraie
  recherche multi-stratégies dans le moteur).

### Ligne de vie : passé réel + futur projeté (A1-A3)

- **A1** — `services/history/reconstructPortfolioHistory.ts` (pur, 5 tests) :
  valeur marché passée par compte = Σ détention(t) × prix(t) en CAD, avec
  indicateur de couverture (vrais prix vs estimé).
- **A2** — `hooks/usePastPortfolioHistory.ts` : récupère l'historique quotidien
  Finnhub (`getHistory`) par titre détenu pour peupler les prix, puis reconstruit.
  Mode test : utilise le `priceHistory` des fixtures.
- **A3** — le graphe Futur **préfixe le passé réel** (placements) avant le début
  de projection (monthIndex < 0), zone « Passé réel » ombrée, sans toucher au
  futur (événements, lignes, périodes intacts). N'affiche que les comptes de
  placement (pas de fausse valeur nette totale : cash/immo passé non reconstruit).
  Note d'honnêteté affichée (source + couverture). Le vrai passé s'affiche avec
  des titres datés + une clé Finnhub configurée.

### Affichage 3 couches : verdict + plan d'action (B1, C2)

- **B1** — bandeau « Verdict » (Couche 0) en haut du graphe : une phrase + un
  chiffre + une pastille (« En bonne voie — libre dès X ans · Y M$ à l'horizon »),
  lisible en 2 secondes. Le détail (stratégie, pourquoi) est en dessous.
- **C2** — panneau « Plan d'action » : ce que la stratégie te fait faire année
  par année (dépose 💰 / retire 🏧 par compte), dérivé de `NetTransfer<compte>`
  du scénario affiché (`services/projection/yearlyActions.ts`, testé). Prochaines
  années + « voir toutes les années ». Aucune règle inventée.

### Notes

- Qualité : `typecheck` 0 / `lint` 0 / **607 tests** verts à chaque palier, zoom
  vérifié en preview onglet par onglet.
- `RealEstate` : calcul Acheter-vs-Louer remonté d'une IIFE de rendu au niveau
  composant pour pouvoir brancher le hook.
- Warning dev-only recharts « duplicate key CELI/REER » sur les aires empilées :
  noté (G9), non-bloquant, absent du build prod.

---

## [unreleased — cycle 16 : Fix PWA inopérante en prod + locale aiOrchestrator] — 2026-05-21

> 2 PRs livrent le fix du bug PWA découvert lors de la validation finale
> du cycle 15 + un follow-up sur un test fragile aux locales.
> **PR #118 (PWA fix) mergée**, PR cycle-16-followups en cours.

### Bug PWA inopérante en prod (#118 — `ae8a6c5`)

Symptôme : sur https://www.hubperso.com, le service worker n'était pas
enregistré au boot, le cache `financeai-v2` restait vide. La PWA était
inopérante malgré les PRs #113 (PWA initial) et #116 (SW cache fix) du
cycle 15.

**Diagnostic en deux temps** (cf `docs/INVESTIGATION_PWA_VERCEL_2026-05-21.md`) :

1. **Bug build Vercel** : `import.meta.env.PROD` s'évaluait à `false`
   lors du build Vercel malgré le log `building for production`. Le bloc
   de registration SW dans `App.tsx:55-61` était dead-code-éliminé.
   Le bundle prod sur Vercel faisait 744 KB et ne contenait aucune
   référence à `sw.js` / `serviceWorker`, contre 528 KB pour mon build
   local correct (différentiel +216 KB / +40 % cohérent avec un build
   en mode dev).
2. **Bug séquencement React** : même avec le code SW présent dans le
   bundle, `useEffect` tourne après `window.load` (mount React arrive
   après l'event). Donc `window.addEventListener('load', ...)` attachait
   un listener à un event déjà fired → callback jamais exécuté →
   SW jamais registered.

### Fixes (#118)

- `package.json` : `"vite build"` → `"vite build --mode production"`.
  Effet primaire : Vite résout le mode comme `production` de manière
  non-ambiguë. Effet secondaire utile : le hash du commit change →
  Vercel ne peut PAS skipper le build via `Ignored Build Step:
  Automatic`.
- `App.tsx:54-71` : guard `document.readyState === 'complete'` avant
  d'attacher le listener. Si le DOM est déjà loaded au moment du
  effect (cas dominant en SPA React), register directement. Sinon
  fallback `addEventListener('load', ..., { once: true })`. Au passage,
  remplacement du `.catch(() => {})` silencieux par un `console.error`
  explicite (anti-pattern silent-failure-hunter).
- `docs/INVESTIGATION_PWA_VERCEL_2026-05-21.md` : 295 lignes de
  diagnostic complet (6 hypothèses testées et écartées, plan B archivé).

### Validation prod (post-merge `ae8a6c5`)

- Nouveau bundle `index-CviMRQ3u.js` (528 KB, contient `sw.js`)
- `navigator.serviceWorker.getRegistrations()` → 1 reg `activated`
- `caches.keys()` → `["financeai-v2"]` (16 entrées au 2e load)
- `navigator.serviceWorker.controller` non-null après navigation

### Hygiène : fix test fragile aux locales (`services/aiOrchestrator.ts`)

Bug latent découvert lors de la validation cycle 16 :
[tests/services/aiOrchestrator.test.ts:101](tests/services/aiOrchestrator.test.ts#L101)
attendait `'10,000'` mais `services/aiOrchestrator.ts:75-77` utilisait
`.toLocaleString()` **sans locale** → résultat dépendait du runtime :

- CI ubuntu-latest (`en_US.UTF-8`) → `'10,000'` → ✅ pass
- Node local `fr-CA` → `'10 000'` (espace insécable) → ❌ fail

Plus grave qu'un test fragile : le **system prompt envoyé à Claude
variait selon la locale browser de l'utilisateur**. Non-déterministe.

Fix : import de `formatNumber` depuis `utils/format` (centralisé fr-CA,
même convention que `formatCAD` etc.). 6 occurrences remplacées dans
`services/aiOrchestrator.ts`. Test mis à jour pour générer la chaîne
attendue via la même locale `fr-CA`.

### Méta cycle 16

- 2 PRs : #118 fix PWA + cycle-16-followups (locale + docs)
- Tests : 573 → 573 verts (1 test fail intermittent locale corrigé)
- 0 régression typecheck / build
- Bundle index passé de 744 KB → **528 KB** (économie réelle 216 KB
  gzip ~50 KB pour les utilisateurs prod)
- Apprentissages : silent catches sont des pièges même quand ils ne
  causent pas le bug actif ; séquencement React/DOM peut piéger les
  `window.load` listeners ; vérifier que le bundle prod contient ce
  qu'on croit avoir buildé.

---

## [unreleased — cycle 15 : P2 Mobile & a11y AAA COMPLÈTE (9/9 items)] — 2026-05-20/21

> Suite directe du cycle 14 (P1 livré). **8 PRs (#107 à #114)** livrent
> tout le plan P2 (`docs/PLAN_P2.md`) en ~7h effectif. **573/573 tests verts**.
> Estimation initiale 25-30h → révisée 14h après triage → livré 7h.
> La base était déjà solide après cycle 7.D + refonte v3.0.

### Plan P2 publié (#107)

`docs/PLAN_P2.md` (250 lignes) — triage du code existant qui révèle que la
base mobile/a11y est déjà solide (sidebar mobile, focus trap modal, 205
`aria-*`, script contrast, axe sur 6 primitives). 9 items priorisés en
4 phases d'exécution.

### Phase 1 : Quick wins (#108)

- **P2.2 Modal focus restore** : `components/ui/Modal.tsx` sauvegarde
  `document.activeElement` à l'ouverture, restaure à la fermeture (Escape /
  backdrop / X). Guard si l'élément a été détruit pendant l'ouverture.
  Bénéfice : keyboard users ne perdent plus le focus.
- **P2.3 Modal close hit area** : `w-8 h-8` → `w-11 h-11` (32 → 44px),
  WCAG 2.5.5 (Target Size). Bénéficie à tous les modals via la primitive.
- **P2.6 prefers-reduced-motion** : media query global dans `index.css`
  qui désactive animations/transitions longues + explicitement `aurora-blob`,
  `skeleton-box`, `lift-on-hover`. WCAG 2.3.3 (AAA).
- **P2.7 skip-to-main** : déjà implémenté (`Layout.tsx:117-123` depuis le
  cycle 5.1) — aucune action nécessaire.
- 3 nouveaux tests Modal (hit area, focus restore, no-crash si élément
  précédent détruit).

### Phase 2 : Audits → fixes

**P2.5 Contrast WCAG AA** (#109) :
- `scripts/check-contrast.ts` révèle 3 échecs critiques sur `ink-400`
  (#64748b ratio 3.30) et `ink-500` (#475569 ratio 2.07).
- Fix dans `tailwind.config.js` :
  - `ink-400` #64748b → **#8896a8** (ratio 5.21-6.42, passe AA normal)
  - `ink-500` #475569 → **#6a7689** (ratio 3.41-4.20, passe AA large)
- Avant : 38/48 conformes AA normal, 3 fails critiques.
- Après : 41/48 conformes AA normal, **0 fail critique**.
- 124+ usages `text-ink-400` bénéficient automatiquement.

**P2.4 Touch target audit** (#110) :
- 5 boutons icon-only sub-44px corrigés avec `.touch-target` utility
  (déjà définie `index.css`) ou bump explicite :
  1. Privacy toggle Layout : `w-9 h-9` → `w-11 h-11` + `focus-ring`
  2. Toast close ✕ : `p-0.5` (~20px) → `.touch-target` (44px)
  3. Documents delete 🗑️ : `p-1` (~24px) → `.touch-target` + `focus-within`
  4. Planning month arrows : `p-1 px-3` → `.touch-target` + `aria-label`
  5. Planning goal delete ✕ : aucune dimension → `.touch-target` + `aria-label`
- Checkboxes natifs (Transactions, Onboarding) reportés à P2.8.

### Phase 2 (suite) : Audits → fixes

**P2.8 Form labels audit** (#112) :
- 238 form elements audités à travers `components/`. **~35 inputs orphelins
  fixés** dans 9 fichiers via `aria-label` ou `htmlFor`+`id` binding.
- PatrimoineExtended.tsx (17 inputs immo/business/véhicules/rénovations/charité)
- Settings.tsx (10 inputs API keys/health/income — `htmlFor` + `aria-label`)
- DebtManager.tsx (5 inputs new debt form)
- Planning.tsx (4 inputs new goal)
- Investments.tsx (2 inputs rebalance + account type)
- BackupPanel.tsx (3 passphrase inputs)
- ChildPlanning.tsx, LifeEvents.tsx, PropertyConfigurator.tsx (1 chacun)
- Conforme WCAG 1.3.1 + 4.1.2.

### Phase 3 : Tests automatisés

**P2.1 Tests axe pages complètes** (#114) :
- Nouveau `tests/a11y/pages.axe.test.tsx` qui monte des pages complètes
  (vs primitives) avec stubs réseau et vérifie 0 violation a11y
  serious/critical via axe-core.
- 4 pages couvertes : Onboarding, SystemView, Dashboard (empty state),
  TaxBracketViz.
- Fixes au passage : 4 `<select>` orphelins dans ErrorLogViewer et
  AuditLogViewer → `aria-label` ajoutés.
- Pages complexes (Investments / TaxCenter / Retirement /
  FutureProjection / Settings) reportées à un follow-up futur (heavy
  lazy-loading + IA + extensive mocking requis).

### Phase 4 : PWA (optionnel)

**P2.9 PWA minimal** (#113) :
- `public/manifest.json` (name, theme `#10b981`, display standalone, `fr-CA`)
- `public/icon.svg` (512×512 maskable, logo "Fi" emerald)
- `public/sw.js` (cache-first sur `/assets/*` hashed, network-first sur
  le reste, skipWaiting + clientsClaim aggressive update)
- `index.html` : `<link rel="manifest">`, `<meta theme-color>`, meta tags
  Apple fullscreen
- `App.tsx` : register SW au boot en PROD seulement (Vite HMR en dev s'auto-gère)
- Compatible lazyWithRetry (P1.4) : on ne cache jamais index.html avec TTL long
- Limitations : pas de PNG fallback (Modern browsers acceptent SVG)

### Méta cycle 15

- **8 PRs** : #107 plan, #108 quick wins, #109 contrast, #110 touch targets,
  #111 docs intermédiaires, #112 form labels, #113 PWA, #114 axe pages
- Tests : 566 → **573** verts (+7 nouveaux : 3 Modal + 4 axe pages)
- 0 régression typecheck / build
- Bundle index inchangé (528 KB gzip 166 KB) ; PWA assets <5 KB ajoutés
- WCAG AA conformité atteinte (sub-ensemble AAA pour touch, focus, reduced-motion)

---

## [cycle 14 : P1 Production Readiness COMPLÈTE (7/7 items)] — 2026-05-20

> **Sprint d'une journée** post-refonte UI v3.0. 7 PRs (#99 à #105) livrent
> tout le plan `docs/PLAN_P1.md` (~35h estimés). **511 → 566 tests verts**.
> Contrainte cardinale respectée : **tout sur tiers gratuits**.

### P1.1 — Error logger local (#99)

- `services/errorLogger.ts` : rolling buffer 100 entrées en `localStorage`,
  helpers `logError` / `getErrors` / `filterErrors` / `clearErrors` /
  `exportErrorsAsJSON` / `getErrorStats`
- 7 sources (`ai | era | projection | ui | network | storage | unknown`),
  4 severities (`info | warning | error | critical`)
- `installGlobalErrorHandlers()` au boot dans `App.tsx` (capture
  `window.onerror` + `unhandledrejection`)
- `services/claude.ts` : `console.error` → `logError({source: 'ai', ...})`
  dans les 5 fonctions IA principales
- UI `components/system/ErrorLogViewer.tsx` dans onglet Système : table,
  filtres source/severity, export JSON, clear avec confirmation
- 10 tests unitaires

### P1.4 — CSV export + résilience chunk-load + cache headers (#100)

- `utils/csvExport.ts` : `escapeCsvField` / `toCSV<T>` / `downloadCSV` +
  helpers `exportTransactionsCSV` / `exportHoldingsCSV` / `exportBudgetCSV`
  conformes RFC 4180 (UTF-8 BOM, échappement `"` et `,`)
- 14 tests unitaires (edge cases : nulls, virgules, guillemets, newlines)
- **Fix critique chunk-load** : `utils/lazyWithRetry.tsx` wrap autour de
  `React.lazy` avec retry + reload one-shot via `sessionStorage` flag.
  Résout `TypeError: Failed to fetch dynamically imported module` après
  nouveau deploy.
- `netlify.toml` : cache headers `no-cache` pour `index.html`, `immutable`
  pour `/assets/*` — empêche le navigateur de garder un index.html stale
  qui pointe vers des chunks supprimés.

### P1.3 — Backup automatique IndexedDB (#101)

- `services/backupAuto.ts` : rolling 7-day backups dans IndexedDB
  (50MB+ vs 5MB localStorage), JSON sérialisé du state complet sauf
  `apiKeys` (sécurité)
- Debounce 2s au boot dans `App.tsx`, 1 backup quotidien max,
  garbage collection > 7 jours
- UI `components/settings/AutoBackupPanel.tsx` : liste, restore (avec
  confirmation + insurance backup pré-restore), delete
- Migration vers Schema v6 (`assets.purchases[]` DCA) couverte par les
  backups
- 12 tests unitaires (fake IDB via `fake-indexeddb`)

### P1.2 — Validation Zod end-to-end (#102)

- `services/eraContext.ts` : tous les `Schema.parse()` → `safeParse()` avec
  `logError({source: 'era', severity: 'warning', ...})` en cas d'échec
- Generic helper `eraRequest<T>(endpoint, schema, opts)` — DRY pour les
  9 endpoints
- `fetchTransactions` : pagination cursor-based résiliente (poursuit si
  une page est invalide, ne crash plus)
- `rememberFact` : ack response validation
- 8 tests unitaires couvrant : réponse OK, réponse invalide, réponse
  partiellement invalide (pagination), endpoint 500

### P1.7 — Audit log local (#103)

- `services/auditLog.ts` : rolling buffer 500 entrées en `localStorage`,
  helpers `logAudit` / `getAuditLog` / `filterAuditLog` / `clearAuditLog` /
  `getAuditStats` / `exportAuditLogAsJSON`
- 4 opérations (`add | remove | update | replace`), `countBefore`/`countAfter`
  optionnels pour traçabilité quantitative
- UI `components/system/AuditLogViewer.tsx` dans onglet Système (pattern
  identique à ErrorLogViewer) : table, filtres champ/opération, export, clear
- 8 tests unitaires (cap MAX_ENTRIES, filtres, stats, corruption recovery)
- **Wiring aux call-sites** reste optionnel — infrastructure prête mais
  `logAudit(...)` à appeler manuellement aux paths importants
  (import CSV, suppressions batch, etc.)

### P1.5 — PDF report complet (#104)

- Étend `services/pdfReport.ts` (jspdf, lazy 391 KB) avec 4 nouvelles pages :
  - **Fiscale** : fédéral, QC, RRQ, RQAP, AE, taux marginal/moyen par
    contribuable + totaux combinés (utilise `calculateFiscalReport`
    de `utils/tax.ts`)
  - **Holdings** : table par asset (symbole, qté, prix, compte) avec
    valeur CAD via `fxRates` et total
  - **Dettes** : table par dette (taux, paiement min, solde) avec
    estimation mois restants (formule amortissement avalanche)
  - **Goals** : liste objectifs actifs avec barre de progression et %
- 4 **builders purs** exportés et testables (`buildHoldingsRows` /
  `buildDebtsRows` / `buildGoalsRows` / `buildFiscalSummary`) — 16 tests
- `ReportData` étendu avec 4 champs optionnels — entrée historique
  `generateFinancialReport(data)` rétro-compatible
- Helper `ensureRoom()` pour pagination automatique des tables longues

### P1.6 — Lighthouse CI (#105)

- `.github/workflows/lighthouse.yml` : workflow **isolé** du CI critique
  (`ci.yml` inchangé), `treosh/lighthouse-ci-action@v12`
- `concurrency` + `cancel-in-progress` → pas de runs zombies
- `timeout-minutes: 10` + `continue-on-error: true` → ne bloque jamais
  le merge même si lighthouse fail/timeout
- `.lighthouserc.json` : 4 catégories (perf, a11y, best-practices, SEO)
  en **warn-only** initial (perf ≥0.5, a11y ≥0.85, BP ≥0.8, SEO ≥0.7)
- `staticDistDir: './dist'` → sert le build sans serveur externe
- Upload `temporary-public-storage` → lien rapport HTML dans logs du run
- `.gitignore` : exclut `.lighthouseci/` (artefacts locaux)

### Méta

- 511 → **566 tests verts** (+55, 50 fichiers)
- 0 régression typecheck/build
- Bundle index inchangé (528 KB gzip 166 KB), `pdf-vendor` 391 KB lazy
- Doc inventory mis à jour (`HANDOVER.md` §4.2, `PLAN_P1.md` clôturé)

---

## [cycle 13 : Refonte UI v3.0 COMPLÈTE (8 phases + cleanup + F.11)] — 2026-05-20

> Refonte massive selon le document directives `MAJ_FinanceAI.txt`. **10 PRs**
> (#86 à #95), 8 phases logiques (A → G + cleanup + F.11), **501 → 511 tests verts**.
> Store v4 → v6 avec migrations propres. 15+ nouveaux composants, 6 nouveaux
> services IA, fusion d'onglets, refonte navigation, indicateurs santé,
> IA partout. **100% gratuit** — Finnhub free, ta clé Anthropic perso, Era perso.

### Phase A (Fondations transverses) — PR #86

- Format `1 111,55 $` centralisé via `utils/format.ts` (formatCAD, formatNumber,
  formatPercent, formatSigned, formatDate, formatCompactCAD) — 23 tests unitaires
- Suppression du toggle FR/EN — locale `fr` verrouillée, paquet `en.json` retiré,
  dépendance `i18next-browser-languagedetector` retirée
- Version exacte injectée via Vite define (`__APP_VERSION__`, `__GIT_SHA__`,
  `__BUILD_DATE__`) — affichée dans la sidebar (tooltip date de build)
- Mode Couple = indicateur read-only global (`<CoupleModeBadge>`), source de
  vérité unique = `config.users[1].name` non vide

### Phase B (Navigation + sidebar refonte) — PR #86

- Sidebar cachée par défaut (rail 64px) + reveal au hover/focus (288px), transition
  fluide 200ms, respect motion-reduce
- Accordion par groupe (Argent / Plan / Objectifs / Outils) — chaque groupe
  toggleable au clic, aria-expanded propre
- Widget IA "Prochaine Meilleure Action" (`<NextBestAction>`) remplace le palier
  statique — Claude Haiku 4.5 + cache localStorage 1h
- Cleanup : boutons info ℹ️, Synchroniser 🔄, Rapport PDF retirés

### Phase C (Hub Configuration) — PR #87

- Onglet Configuration centralise : profil, retraite (âge, espérance de vie,
  revenus cibles), API keys, sauvegarde
- `<MissingDataBanner>` + `<MissingDataChecklist>` : 11 champs critiques
  déclarés, pattern de redirect cross-tab via `navigateWithFocus(tab, section)`
- `<PayslipUploadCard>` : extraction Vision Claude Sonnet auto-fill grossSalary/netSalary
- Era boot sync : pré-chauffe le cache `buildEnrichedContext` (1h TTL) au mount
- Migration store v4 → v5 : `retirementGoal.lifeExpectancy` (default 90)

### Phase D (Home tab refonte) — PRs #88 + #89

- KPI strip 5 cols : Net Worth, Variation, Active Income, Passive Income, Indicateur Futur
- `<ZoomableTimeChart>` : zoom molette + pan + multi-échelle dynamique (réutilisable Investments)
- Chips toggle multi-comptes + ligne Total overlay
- Stocks cliquables avec checkbox, multi-check → `<StockComparisonModal>` overlay
- Gain $/% depuis l'achat affiché si `Asset.buyPrice` connu (sinon CTA "Configurer")
- `<HealthIndicator>` : score 0-100 paramétrable (4 ratios : épargne, coussin, dette, FIRE)
- Suppression Cash/Saving/Dette/Jalons (vue allégée)

### Phase D' (Budget refonte) — PR #90

- Sync absolue catégories Budget↔Transactions : rename propagé, suppression réassigne à "Uncategorized"
- `<DualKPIStat>` : 4 tuiles Prévu/Réel (Budget / Revenus / Dépenses / Restant) avec écart % coloré
- Santé financière fiscale : `calculateFiscalReport` au lieu de Brut−Net (Fed/QC/RRQ/AE/RAMQ/FSS)
- Filtre Personne A/B/combiné (Pill) en mode couple
- Navigation périodes adjacentes (← Mai 26 → + bouton "Auj.")
- Diagnostic IA fluide (streaming via `chatStream`) au lieu de one-shot 30s

### Phase E (Investissement refonte) — PR #91

- 4 sous-onglets : Vue d'ensemble / Allocation / Rééquilibrage / Détail
- TimeRange global au sommet (affecte toutes les sections)
- StockChart utilise désormais `<ZoomableTimeChart>` (zoom molette, multi-échelle)
- Pies Geo/Sectorielles **interactives** : click → filtre stocks avec gains $/%
- Justifications IA des actions de rééquilibrage (`getRebalanceJustifications`)
- `<AddStockForm>` : ajout manuel avec validation Finnhub + suggestion prix historique
- Portefeuille projeté 2066 = copie exacte FUTUR (consume `lastProjection.chartData`)

### Phase F (Retraite + Immobilier + Enfant + Projets de vie) — PR #92

- Fusion Voyages + LifeEvents → onglet unifié "Projets de vie" (`Tab.LIFE_PROJECTS`)
- Indicateurs activation FUTUR uniformisés (RealEstate + ChildPlanning, mêmes badges)
- Rendement boursier Immobilier sync dynamique avec `projection.returnRate` global
  (coût d'opportunité Buy vs Rent toujours à jour)

### Phase G (Impôts + Documents) — PR #93

- Nouvel onglet **Documents** global (`Tab.DOCUMENTS`) : hub central PDF/Image
  avec catégories (PAYSLIP, T4, BANK_STATEMENT, etc.) et extraction IA Vision
  pour les fiches de paie
- `<CoupleOptimizationCard>` : 3 stratégies IA (Spousal RRSP, allocation CELI,
  pension splitting, transferts crédits) avec confidence + économie estimée $/an

### Cleanup final — PRs #94 + #95

- **E.8 DCA multi-achat** : type `Asset.purchases[]` + store v5→v6 + 4 helpers
  (`utils/assetPurchases.ts`, +10 tests) + UI stats DCA dans Portefeuille Détaillé
- **F.4 Asset Location développé** : score d'efficacité 0-100 live, pré-rempli
  depuis le store, synthèse 3 cards (CELI/REER/NonReg), perte annuelle estimée
- **F.8 Conseils IA Immobilier** : `<RealEstateAdviceCard>` 5 catégories
- **G.3 Tax brackets ultra-précis** : breakdown $ par tranche consommée, effective vs marginal
- **F.5 Extraction CurrentCapitalCard** : Retirement.tsx -23 lignes (partial)
- **F.11 ChildPlanning design pro** : tabs Pill-style cohérents, labels épurés
- **G.2** TaxCenter upload : orienté vers Documents global (`"Calcul rapide / Pour archiver → Documents"`)
- **G.5** Préparation architecturale Dettes/Planning → sous-onglets Transactions (commentaire seulement)
- **+19 tests** pour Documents, CoupleOptimization, assetPurchases (482 → 501 → 511 verts)

### Items volontairement différés (P0+P2+P3+P4+P5)

- E.2 Live prices intraday : nécessite WebSocket payant — current daily data acceptable
- F.5 deep refactor (38k → 20k via extraction multiple) : itératif
- P0 validation visuelle / mobile : à reprendre quand regressions identifiées
- Roadmap "10/10" détaillée : voir HANDOVER §4.4

---

## [unreleased — cycle 8 : Phase 7 + 7.G HIGH fixes + Phase 8 polish] — 2026-05-20

> Phase 7 : 22 sous-tâches (perf, a11y, i18n, market data Finnhub, schema v4,
> CommandPalette, Skeleton). Phase 7.G : 5 bugs HIGH de l'audit. Phase 8 :
> bundle, tests manquants, focus trap Modal, BudgetAiModal→Modal.
> Tests : 348 → 412 (+64). Branche `claude/analyze-finance-app-CtLvs`, PR #85.

### 🐛 §7.G — 5 HIGH findings de l'audit 2026-05

- **SRG double-count fix** (`retirementIncome.ts`) : `rrqMonthly` était déjà
  family-level (× `activeUsersCount`), puis `otherIncomeAnnualFamily` le
  multipliait à nouveau → GIS = $0 pour les couples ayant droit à $5k+/an.
  Fix : `otherIncomeAnnualFamily = (rrqMonthly + dbMonthly) * 12`,
  `otherIncomeAnnualPerAdult = family / max(1, activeUsersCount)`.
  3 tests de régression ajoutés.

- **apiKeys exclues du backup chiffré** (`BackupPanel.tsx`) : `doEncryptedExport`
  envoyait `buildPayload()` complet incluant les clés API. Fix : même
  destructuring que l'export JSON clair (`{ apiKeys: _stripped, ...rest }`).
  Ni le JSON clair ni le .bak ne contiennent maintenant de credentials.

- **RRSP cap desync** (`taxJanuary.ts`) : cap hardcodé à `33330` (faux pour 2026 :
  cap ARC officiel = `33810`). Fix : `RRSP_ANNUAL_LIMITS[nextLoopYear] ?? extrapolation`.
  Import `RRSP_ANNUAL_LIMITS` depuis `utils/tax`.

- **CSP** : `netlify.toml` retire `generativelanguage.googleapis.com` (Gemini
  retiré en PR #73), ajoute `api.anthropic.com` et `finnhub.io`. `index.html`
  ajoute `<meta http-equiv="Content-Security-Policy">` pour GitHub Pages.

- **README** : refonte complète — Gemini→Claude, 115→412 tests, 5→7 scénarios,
  architecture reflète l'état réel (aiOrchestrator, marketData/, schema v4).

### ⚡ Phase 8.A — Bundle + Perf

- `vite.config.ts` : `optimizeDeps.exclude: ['html2canvas']` + `external:
  ['html2canvas']` dans rollupOptions. Retire le define `GEMINI_API_KEY` (obsolète).
- `App.tsx` : `useFinanceStore(useShallow(s => s))` — shallow comparison
  prévient les cascade re-renders lors de mises à jour de slices non rendues
  (ex : `aiConversation`). `loadData` utilise `useFinanceStore.getState()`
  pour éviter les closures stale.

### ♿ Phase 8.C — Accessibilité

- `Modal.tsx` : focus trap complet Tab + Shift+Tab (wrap aux extrémités).
  `dialogRef` pointé sur `role="dialog"`, sélecteur FOCUSABLE couvre tous les
  éléments interactifs natifs.
- `BudgetAiModal.tsx` : remplace l'implémentation inline `<div>` custom par
  `<Modal>` — héritage automatique de `aria-modal`, `role="dialog"`,
  `aria-labelledby`, focus trap, Escape, scroll-lock.

### 🧪 Phase 8.B — Tests manquants

- `tests/utils/transactionParser.test.ts` (9 tests) : `markDuplicates` + `parseTransactions`
  — duplicate detection, score API vs manual, Interac, virement, CSV tab/semicolon.
- `tests/services/aiOrchestrator.test.ts` (8 tests) : `buildEnrichedContext` —
  token vide, parallel calls, graceful error, AbortSignal passthrough ;
  `renderEnrichedContext` — format cash-flow, memory facts.
- `tests/services/retirementIncome.test.ts` (3 tests) : régression SRG §7.G.

### 📚 Phase 8.E — Documentation

- `docs/HANDOVER.md §1` : mise à jour indicateurs (PR #85, 412 tests, schema v4,
  Finnhub, CSP, apiKeys backup fix).
- `CHANGELOG.md` : entrée cycle 8.
- `README.md` : refonte complète (voir §7.G ci-dessus).

---

## [unreleased — cycle 7 : Phase 6 fiscalité complète + flaky fix] — 2026-05-19

> Cycle dédié à la complétion de la Phase 6 fiscale (manques structurels
> identifiés par l'audit 2026-05). 8 items implémentés en suivant un
> protocole strict : impl → 4 agents review en parallèle → fix HIGH/MEDIUM
> → tests intégration → triple validation locale → commit + push.
> Tests : 243 → 348 (+105 nouveaux). Branche `claude/phase-6-tax-qc`.

### 💰 §6.2 — Crédits 65+ et revenu de retraite (fed + QC)

- **ARC ligne 30100** (Montant en raison de l'âge) : indexation 2026 = 2.0%,
  max 8 966$, seuil 46 432$, réduction 15%.
- **ARC ligne 31400** (Crédit pour revenu de pension) : 2 000$ fixe, restreint
  65+ (sauf invalidité non modélisée).
- **Revenu Québec ligne 361** (combinée) : crédit âge 3 986$ + revenu retraite
  3 058$, seuils familiaux 27 835$/45 270$ (single/couple), réduction 18.75%.
- Fonction `calculateAgeAndPensionCredits(opts, netTaxable, year)` avec guard
  NaN/Infinity, indexation seuils via `getIndexedBracketsForYear`.
- Intégration dans `calculateFiscalReport` (param `ageOpts` optionnel) +
  `taxDecember.ts` mode retraité + actif 65+ + `taxJanuary.ts` FERR margRate.
- 16 tests (12 baseline + 4 review-fixes : frontière 64/65, NaN, pension=0+65+,
  snapshot régression).
- Impact : ~970$/personne/an d'économie pour retraité 65+ sous seuils.

### 💊 §6.4 — RAMQ prime régime public d'assurance médicaments

- **Revenu Québec ligne 447 + Annexe K** : seuils 19 500$/31 610$ (single/couple),
  paliers 7.65%/3.84% (palier 1) + 11.48%/5.75% (palier 2), max 766$/adulte.
- Bonus seuils par enfant à charge (4 105$ / 12 110$ pour 1er, +3 790$ / +4 105$
  pour 2+).
- Fonction `calculateRamqPremium(income, opts, year)` avec exemption privée +
  indexation.
- Intégration dans `taxDecember.ts` modes retraité ET actif. `familyNetIncome`
  inclut REER déductions (mode actif) ou retraits REER + 50% gains capitaux
  (mode retraité).
- 18 tests dont 5 review-fixes (frontières seuils, childrenCount=1, frontière
  bracket1/bracket2, exempt + revenu élevé) + 3 intégration `processDecemberTaxFiling`.
- Impact : jusqu'à ~1 532$/an pour couple non-couvert privé.

### 🏦 §6.6 — Stress test OSFI B-20 hypothécaire

- **OSFI guideline B-20** : qualifying rate = max(contractRate + 2 pts, 5.25%),
  GDS ≤ 39%, TDS ≤ 44%.
- Fonctions `calculateB20QualifyingRate(rate)` + `calculateB20StressTest(input)`
  retournant `{qualifyingRate, qualifyingPmt, gds, tds, passes, failReason}`.
- Intégration dans `realEstateMonth.ts` au déclenchement de l'achat. Log warning
  dans `lifeEventLogs` si fail, n'empêche pas l'achat (informatif).
- Indexation des charges logement par inflation pour cohérence avec revenu nominal.
- 16 tests dont 4 review-fixes (amortization=0, frontière GDS 39%, snapshot
  qualifying PMT, contractRate=5.25%).
- Limitations documentées : `otherDebtMonthly = 0` (pas d'accès aux dettes via
  RealEstateCtx), composition mensuelle simple vs semi-annuelle canadienne.

### ✅ §6.8 — Validation SCHL mise de fonds + amortissement max

- **SCHL** : MDP min 5%/5%+10%/20% selon prix (≤500k/500k-1.5M/>1.5M).
  Amortissement max 25 ans (assuré std) ou 30 ans (1er acheteur OU résidence
  neuve depuis août 2024) ou 30 ans (conventionnel ≥20% MDP).
- Fonctions `calculateMinDownPayment(price)` + `validateMortgageParameters(input)`
  retournant `{valid, errors[], downPaymentRatio, minDownPayment, maxAmortizationAllowed, insured}`.
- Intégration : validation au mois d'achat avec warnings groupés (un seul message
  ciblé pour prix >1.5M$, pas de doublon).
- `RealEstateGoal` étendu avec `isFirstTimeBuyer?: boolean` et
  `isNewConstruction?: boolean`.
- Guard epsilon 1e-9 sur frontière MDP 20% (évite mauvaise classification à
  cause d'arrondi flottant).
- 19 tests dont 4 review-fixes (un seul message si prix>1.5M, frontière 1.5M
  exacte, MDP=20% exact, price=0 explicite).

### 🏥 §6.1 — FSS Fonds des services de santé

- **Revenu Québec ligne 446 + Annexe F** : seuils 18 130$/33 130$/63 060$/148 030$,
  paliers 0/1% × excès/150$ flat/150$ + 1%/1 000$ max.
- Fonction `calculateFSSPremium(netIncome, year)` avec indexation complète.
- Intégration `taxDecember.ts` mode retraité uniquement (salariés couverts par
  employeur). Revenu individuel = (pension + rentes + retraits + 50% gains
  capitaux) / activeUsersCount.
- Limitations documentées (audit silent-failure) : 1) actifs autonomes exclus
  (TODO `User.hasSelfEmployedIncome`), 2) revenu individuel approximé par
  moyenne familiale.
- 13 tests dont 3 intégration `processDecemberTaxFiling`.
- Impact : jusqu'à 1 000$/adulte/an pour retraités à revenu élevé.

### 🏠 §6.5 — SCHL prime d'assurance hypothécaire

- **SCHL primes 2026** par tranche LTV : 0.60%/1.70%/2.40%/2.80%/3.10%/4.00%
  (LTV ≤65/75/80/85/90/95%). Assurance non disponible si LTV > 95% ou prix > 1.5M$.
- Fonctions `calculateSchlPremiumRate(ltv)` + `calculateSchlPremium(input)`
  retournant `{ltv, rate, premium, required, available}`.
- Intégration `realEstateMonth.ts` : la prime est ajoutée au principal du prêt
  AVANT calcul du PMT, augmentant les paiements mensuels.
- 17 tests (tous les paliers + frontières + snapshot 5% MDP → 19 000$).

### 💰 §6.7 — TPS/TVQ remboursement résidence neuve

- **ARC RC4028** (TPS) : rebate 36% jusqu'à 350k$, décroissance linéaire à 0
  pour 450k$+.
- **Revenu Québec** (TVQ) : rebate 50% jusqu'à 200k$, décroissance à 0 pour 300k$+.
- Fonctions `calculateGstNewHomeRebate(price)`, `calculateQstNewHomeRebate(price)`,
  `calculateNewHomeRebateTotal(price, isNewConstruction)`.
- Intégration : si `goal.isNewConstruction`, rebate soustrait du `totalCashNeeded`
  à l'achat (modélisation simplifiée : net après remboursement).
- 13 tests (paliers TPS, paliers TVQ, combinaison, snapshot 300k$ → 5 400$).

### 🎁 §6.3 — SRG Supplément de revenu garanti

- **Service Canada Q1 2026** : max 1 105$/mois célibataire, 662$/mois couple/adulte,
  seuils revenu 22 512$/29 760$, clawback 50%.
- Fonction `calculateGISBenefit(otherIncomeAnnual, hasSpouseWithOAS, year)`.
- Intégration dans `retirementIncome.ts` : SRG ajouté au revenu de retraite
  mensuel si age ≥ psvStartAge ET psvMonthly > 0. otherIncome approximé par
  RRQ + DB annualisés.
- 9 tests (max célibataire/couple, clawback, annulation seuils, indexation).
- Limitation documentée : approximation `otherIncome = rrq + db` ignore retraits
  REER et gains capitaux (SRG potentiellement surestimé pour ces profils).
- Impact : crucial pour scénarios faible revenu retraite (jusqu'à 13 200$/an
  célibataire).

### 🐛 Fix flaky `RealEstateGoal isActive guard`

Test pré-existant qui échouait sur main depuis cycle 6 : `makeInactiveGoal`
omettait `totalClosingCosts`, ce qui rendait `totalCashNeeded = downPayment +
undefined + welcomeFees = NaN`. La cascade d'achat ne s'exécutait jamais
silencieusement, faisant converger active/inactive vers le même `estateNetWorth`.
Fix : ajout `totalClosingCosts: 5000` + fonds suffisants pour garantir l'achat
+ assertion renforcée (`diff > max(1, inactiveBase × 1%)` plutôt que `!==`).

### 🔬 Protocole agents review (multi-agents qualité par PR)

À partir de §6.2, chaque item §6.x déclenche un cycle :
1. Implémentation baseline + tests + triple validation.
2. Lancement de 4 agents en parallèle (typescript-reviewer, code-reviewer,
   silent-failure-hunter, tdd-guide) avec contexte ciblé.
3. Synthèse des findings (HIGH/MEDIUM/LOW + tests manquants).
4. Application des fixes critiques (HIGH systématique, MEDIUM selon impact).
5. Tests additionnels (snapshot régression, frontières exactes, intégration).
6. Triple validation finale + commit "review fixes" sur la même PR.

Résultat : 11 HIGH + 14 MEDIUM identifiés et résolus AVANT merge. Sans ce
protocole, les calculs fiscaux auraient des biais silencieux non détectables
par typecheck/tests baseline.

### 📚 Documentation

- `docs/PLAN_PHASE_6.md` (créé) : plan de match suivi PR par PR.
- `docs/HANDOVER.md` §3.4 : à mettre à jour après merge PR #84 (tous les ⏳ → ✅).
- Mémoire projet (`.claude/projects/.../memory/`) : 6 fichiers de mémoire
  pour Marc (profile, projet, workflow git, règles fiscales, état Phase 6,
  feedback agents).

### ✅ Tests

348/348 tests verts (vs 243 sur main avant ce cycle). Aucun flaky restant.
Typecheck strict clean en permanence. Build production : ~3.75s.

---

## [unreleased — cycle 6 : Claude+Era migration + UI refoundation + a11y polish] — 2026-05

> Le plus gros cycle depuis le lancement. Migration complète de la stack
> IA, refonte du design system, et toutes les pages standardisées sur un
> pattern uniforme.

### 🤖 Phase 4.A — Migration Gemini → Claude (5 PRs séquentielles)

- **`services/claude.ts`** créé (~550 lignes) : wrapper `@anthropic-ai/sdk`
  mirroring complet de l'ancienne surface Gemini.
  - `chat`, `chatStream` — équivalents `generateContent` + streaming
  - `categorizeBatch` — modèle `claude-haiku-4-5` (volume + vitesse)
  - `analyzeBudget`, `analyzePayslip`, `analyzeDocuments` — Sonnet 4.6
  - Préservation de `sanitizePayee`, `roundToHundred`, Zod schemas, `QUEBEC_FISCAL_CONTEXT`
  - `dangerouslyAllowBrowser: true` (app client-side, clé utilisateur)
- **Schema store v1 → v2 → v3** : ajout `apiKeys.anthropic` puis suppression
  `apiKeys.gemini`. Migration progressive sans casser les utilisateurs
  existants.
- **5 consumers migrés** : `AiAssistant`, `BudgetAiModal`, `Transactions`
  (catégorisation), `TaxCenter` (Vision), `Planning` (suggestions goals).
- **`services/gemini.ts` supprimé** + dépendance `@google/genai` retirée du
  `package.json`. Cleanup final dans la PR A5.
- **Bundle** : `ai-vendor` chunk 289 KB → 130 KB (**-55%** — Anthropic SDK
  plus léger).

### 🌐 Phase 4.B — Era Context comme moteur de qualité

- **`services/eraContext.ts`** étendu (1 endpoint → 9 endpoints) :
  - `getCashFlow`, `analyzeSpending`, `forecastSpending`, `getDailyFinancialSummary`
  - `rememberFact`, `recallHistory` (mémoire persistante)
  - `searchTransactions`, `listRecurringCharges`
  - Helper générique `eraRequest()` avec timeout, Bearer auth, validation Zod, cache TTL 1h
- **`services/aiOrchestrator.ts`** (nouveau, ~135 lignes) :
  - `buildEnrichedContext(token)` : Promise.all parallèle sur 4 endpoints
  - `renderEnrichedContext(ctx)` : format pour system prompt Claude
  - `maybeRememberFromMessage(msg, token)` : détecte "remember:"/"souviens-toi:"
- **`components/AiAssistant.tsx`** : court-circuit "remember:" + system
  prompt enrichi automatiquement avec insights Era Context.
- **`components/Planning.tsx`** : utilise `listRecurringCharges` Era Context
  comme primaire, Claude fallback (toast indique la source).
- **`components/dashboard/EraContextInsights.tsx`** (nouveau) : widget Dashboard
  qui montre cash-flow 90j + top catégorie 30j + prévision mois prochain +
  anomalies + mémoire. Silencieux si pas de token Era.

### 🎲 Phase 4 #4 — Nouveaux scénarios compound stress

2 scénarios MC supplémentaires (5 → 7 au total) :

- **`COMPOUND_STRESS`** (« Tempête Parfaite ») : empile inflation 5%+,
  rendements anémiques (CELI/REER 3%, NonReg 2%, cash 1%) ET force
  `ltcEnabled = true` via override scenario-local. Le pire du pire.
- **`LATE_INHERITANCE`** (« Héritage Tardif ») : injection de 250 000$ au
  mois 240 (an 20) au lieu de WINDFALL (mois 60). Teste le pont fiscal long.

UI : grille scenarios passe de `md:grid-cols-5` à `sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7`,
badge "Nouveau" sur les 2 ajouts.

### 🎨 Refonte UI complète (Phases A → D)

- **Phase A — Design tokens + primitives** :
  - `tailwind.config.js` : couleurs sémantiques (primary, success, warning,
    danger, info, secondary), scale typo cohérente (text-display/h1/h2/body/
    meta/tiny — fin des `text-[9-11px]` ad-hoc), border-radius `rounded-card`,
    focus utility `focus-ring`.
  - 14 primitives dans `components/ui/` : Button, Badge, Card, CollapsibleSection,
    KPIStat, StatGrid, PageHeader, Pill, SectionHeader, EmptyState, Modal,
    ConfirmModal, Toast, Tooltip, ErrorBoundary. Tests RTL pour chacune.
- **Phase B — Navigation** :
  - `Layout.tsx` regroupé en 4 groupes thématiques sidebar (Argent / Plan /
    Objectifs / Outils)
  - Deep-link cross-tab : `pendingFocus` dans le store + `navigateWithFocus(tab, section)`
    + hook `usePendingFocus` + animation `animate-pulse-once`
  - 5 consumers : Dashboard, Budget, Children, Investments, RealEstate
- **Phase C — Refonte des 9 pages** (C1 → C7) :
  - C1 FutureProjection : Hero KPI 4-strip (FIRE/Patrimoine/MC Success/FVI)
    + 4 CollapsibleSection (Macro / Variabilité / Stochastiques / Avancés)
  - C2 Dashboard : 4-KPI StatGrid + EraContextInsights widget + chart Brush
    multi-période + 3 cards segmentées
  - C3 Budget : 4-KPI StatGrid + `BudgetGroupTable` extrait + bandeau impact
    long terme cliquable (deep-link FutureProjection)
  - C4 Investments : KPIStat/StatGrid dans card Portefeuille projeté +
    3 CollapsibleSection (Allocation / Rééquilibrage / Portefeuille Détaillé)
  - C5 RealEstate : 4-KPI StatGrid + `PropertyConfigurator` + `MultiPropertyComparison`
    sous-composants
  - C6 Transactions : PageHeader uniformisé
  - C7 Retirement, TaxCenter, DebtManager, Travel, LifeEvents, Settings,
    Children avec PageHeader
- **Phase D — Mobile + animations** :
  - Bottom nav `text-tiny`, drawer regroupé, touch targets ≥ 56px, `pb-safe`
    pour iOS
  - Utilities `lift-on-hover`, `animate-pulse-once`, `touch-target`

### ♿ A11y — Audit Phase 5.1

- `components/Layout.tsx` : skip link "Aller au contenu principal" en
  premier focusable, devient visible au focus clavier
- `<main>` reçoit `id="main"` + `tabIndex={-1}` (target du skip link)
- `text-[9-11px]` bannis du codebase (0 occurrence)

### 📚 Documentation structurée

- **`docs/ARCHITECTURE.md`** (nouveau) : vue d'ensemble pour nouveaux
  contributeurs (stack, topologie, store, moteur projection, IA, tests,
  workflow contributeur)
- **`docs/adr/`** (nouveau dossier) : 4 ADRs courts
  - ADR-001 Migration Gemini → Claude
  - ADR-002 Era Context comme moteur de qualité
  - ADR-003 Split projection.ts modulaire (31 sous-modules)
  - ADR-004 Design system primitives custom (vs shadcn/Radix)
- **`docs/PROJECTION.md`** mis à jour : 7 scénarios documentés (Phase 4 #4),
  pipeline diagram à jour, count de tests (47 + 28)
- **`docs/UI_REFOUNDATION_PLAN.md`** : Phase A/B/C/D toutes marquées ✅ FAIT
  avec description précise de ce qui a atterri
- **`docs/WIRING_NOTES.md`** : section "UI Phase C terminée" + section
  "Phase 4 #4 Compound stress" + section "Deep-link cross-tab"
- **`docs/TYPECHECK_BACKLOG.md`** : entièrement réécrit (backlog résorbé,
  doc historique)
- **`docs/PLAN_PHASE_4.md`** (nouveau) : plan détaillé de la migration
  Claude + Era (référence historique)
- **`docs/AUDIT_2026-05.md`** §Phase 5 : colonne État ajoutée (5.1 ✅,
  5.2 ✅, 5.3-5.6 ⏳ non prioritaires)

### 🚀 Déploiement

- **GitHub Pages** : workflow `.github/workflows/deploy-pages.yml` créé,
  `VITE_BASE_PATH` configurable dans `vite.config.ts`
- **Vercel** : auto-detected, preview par PR

### ✅ Tests

225 tests verts (24 fichiers de test) tout au long du cycle. Aucune
régression introduite. Typecheck strict clean en permanence.

---

## [unreleased — cycle 5 : UI coverage 100% du moteur] — Branche `claude/analyze-finance-app-CtLvs`

### 🔍 Audit UI coverage par agent

Le moteur lit ~150 champs depuis SimulationParams + sous-types. L'audit a révélé que **~35% des champs effectivement utilisés** n'avaient aucun contrôle UI : leurs valeurs restaient figées sur les défauts.

### ⚙️ Nouveau composant : `AdvancedProjectionParams.tsx`

Panneau collapsible dans FutureProjection qui expose les paramètres jusque-là cachés :

**🔥 Stress Test (4 champs HIGH)** : enabled, year, drop, recovery + inflation shock — feature lue par moteur mais inaccessible.

**🎯 Optimisations fiscales (3 toggles HIGH)** :
- `useSmithManoeuvre` (hypothèque déductible)
- `optimizeSourceDeductions` (T1213)
- `vehicleReplacementEnabled` (auto-replace cyclique)

**🎲 Monte Carlo & Bootstrap** :
- `monteCarloIterations` (50-1000) — **désormais lu par le moteur** (était figé à 100)
- `bootstrapBlockSize`

**🎭 Détails événements stochastiques** (apparaissent quand le toggle correspondant est ON) :
- Divorce: probabilité annuelle, split %, pension alimentaire
- LTD: probabilité, % revenu maintenu, durée
- CI: probabilité, capital forfaitaire, dépenses additionnelles
- Héritage: montant attendu, âge attendu, incertitude, probabilité
- Perte d'emploi: probabilité, durée
- Survivant: % RRQ + % DB conservés

**🌴 Snowbird** : mois/an + surcoût mensuel
**🧒 Sandwich generation** : boomerang + caregiving (montant, âge début, durée)
**💰 Soldes initiaux manuels** : useManualBalances + 7 champs (CELI/REER/NonReg/Cash/Crypto/CELI room/REER room)
**📊 Rendements affinés** : crypto + cash (absents de la grille principale)

### 🧹 Cleanup

- Orphelins marqués `@deprecated` dans types.ts (scenarioB, scenarioBLabel)

---

## [unreleased — cycle 4 : ProjectionChartPoint + W5.x câblage] — Branche `claude/analyze-finance-app-CtLvs`

### 🎯 PR A — `ProjectionChartPoint` typé (TS reviewer quick win #1)

- Interface `ProjectionChartPoint` avec ~90 champs optionnels typés (NetWorth, IncomeMarc, CELI, REER, MarketGrowth*, etc.)
- `ProjectionResult.chartData: ProjectionChartPoint[]` (au lieu de `any[]`)
- ROI: élimine ~35 erreurs TS strict en cascade dans RealEstate/Investments/ChildPlanning

### 🔗 PR B — `RegisteredAccountType` unification finale

- `InvestmentAccount.type: 'CELI'|...` → `RegisteredAccountType` (élimine la 2e union divergente)

### 🔌 PR C — W5.x conteneurs câblés au moteur (cycle 4 intégration)

Les conteneurs capturés en UI depuis PR #16 mais ignorés du moteur sont maintenant **fonctionnels** :

- **W5.4 Assurances** : primes mensuelles ajoutées aux dépenses (avec respect `expiryDate` pour T10/T20/T30)
- **Véhicules cycliques** : `liquid -= cost` tous les N×12 mois
- **Rénovations majeures** : `liquid -= cost` à la date planifiée
- **Dons charitables** : `monthlyExpenses` + crédit fiscal 33% (`taxCurrentYear.revenu`) + bonus titres appréciés
- **W5.6 Immeubles locatifs** : NOI = `(rent×(1-vacancy) - expenses)` ajouté au revenu + imposable au marginal 45%

`SimulationParams` étendu, `Retirement.tsx` + `FutureProjection.tsx` passent les conteneurs via store.

5 tests régression W5.x ajoutés. Tests: **148/148**.

---

## [unreleased — cycle 2/3 fixes + architecture refactor + final agents review] — Branche `claude/analyze-finance-app-CtLvs`

### 🔍 Phase 4 — Re-run 3 agents post-refactor

3 agents relancés (code-reviewer, silent-failure-hunter, typescript-reviewer) ont vérifié les phases 1-3. Verdicts :
- **code-reviewer**: "Ship it" — 0 HIGH/CRITICAL. 1 LOW non-régression (array index keys in AssetLocationCard, anti-pattern pré-existant).
- **silent-failure**: 1 MEDIUM identifiée — Worker sans timeout/messageerror.
- **ts-reviewer**: ~40 erreurs strict éliminées par ProjectionResult, gain effectif 64 erreurs (vs 104 avant). Quick win RegisteredAccountType inutilisé.

### 🔧 Cycle 3 fixes additionnels

- **Worker timeout 30s + messageerror handler** : runAsync.ts cleanup unifié + détection mort automatique sur timeout/erreur (évite Promises pendantes indéfinies)
- **`Asset.accountType` câblé sur `RegisteredAccountType`** : unification du type partagé (préparation pour Retirement/FutureProjection/Investments)

---

## [unreleased — cycle 2/3 fixes + architecture refactor] — Branche `claude/analyze-finance-app-CtLvs`

### 🐛 Fixes post-merge PR #18 (cycle 2 multi-agents)

**Phase 1 — Findings restants des agents** :
- A: `HISTORICAL_RETURNS_US` mutation top-level retirée (effet de bord cross-test). CPI canadien lu via `canadianInflationFor()` à la demande.
- B: Tests comportementaux `useDebouncedMemo` avec `vi.useFakeTimers` (3 tests behavior).
- C: 2 `as any` Retirement.tsx retirés (`dbElectionType`, `dbSurvivorPct` désormais typés).
- D: `month1ActionPlan` typé `{ monthlyCashflow; strategy } | null` (élimine cascade strict).
- E: `goalSeekBusy` partagé entre 3 boutons → split en `busySavings`/`busyAge`/`busyDrawdown` (silent-failure: cliquer rapidement n'affiche plus de résultats croisés).
- F: **`ProjectionResult` interface exportée** + retour `calculateFutureProjection` typé. `runProjectionAsync` passe de `Promise<any>` à `Promise<ProjectionResult>`. ROI: élimine ~40 erreurs TS strict en cascade.

### 🏗️ Phase 2 — Architecture refactor (code-architect agent)

- `components/retirement/GoalSeekerCard.tsx` (124 lignes) — extraction Goal seeker + Drawdown optimizer + 3 busy flags + 2 results state local
- `components/retirement/AssetLocationCard.tsx` (91 lignes) — extraction holdings + analyse
- `components/Retirement.tsx` réduit **702 → 527 lignes (-25%)**
- Phase 2.1 (split `types.ts`) et 2.3 (split `projection.ts`) explicitement skip:
  - `types.ts` split: cosmétique single barrel file, risque > bénéfice
  - `projection.ts` split: ~2400 lignes, refactor majeur réservé à session dédiée

### 🎯 Phase 3 — Type tightening (type-design agent)

- Union stricte `Industry` (13 valeurs: tech/finance/health/public-sector/education/construction/retail/manufacturing/energy/transportation/agriculture/media/other) remplace `User.industry: string`
- Union `RegisteredAccountType` (CELI/CELIAPP/REER/NON-ENREG/CRYPTO/REEE/MARGE/AUTRE) — préparation unification 3 unions divergentes (Asset.accountType, InvestmentAccount.type, AccountType d'assetLocation)
- Settings UI: champ Industry passe d'input text à `<select>` avec les 13 valeurs

---

## [unreleased — post W1-W5] — Branche `claude/analyze-finance-app-CtLvs`

Bundle d'optimisations + nouvelle feature suite à l'analyse multi-agents du PR #16.

### ⚡ Performance (perf-optimizer agent #1 et #2)
- `utils/useDebouncedMemo.ts` (nouveau): hook React générique, debounce 300ms
- `Retirement.tsx` + `FutureProjection.tsx`: `useMemo` projection → `useDebouncedMemo`
- Gain estimé: -80% de recalculs pendant la saisie utilisateur
- **Web Worker câblé** dans FutureProjection pour MC (libère main thread 1.5-3s)
- Indicateur visuel ⏳ pendant calcul MC + bouton disabled

### 🧪 Couverture tests (silent-failure-hunter agent)
- 9 nouveaux tests Vitest pour les événements stochastiques (Divorce, LTD, CI, Inheritance, Survivor, Snowbird, Bootstrap, Replay 2008, US Withholding)
- 6 tests `assetLocation` (incl. cas allocation déjà optimale)
- Tests passent: 132 → 137/137

### 📊 Précision modélisation
- **Canadian CPI 1928-2024** (StatCan v41690973): le bootstrap historique utilise maintenant l'inflation canadienne au lieu d'US CPI (capture les divergences années 70-80, contrôles de prix Trudeau)
- 3 tests vérifiant les valeurs clés (1975-76, 2022 post-COVID, fallback)

### 🧭 Nouvelle feature: Asset Location Optimizer (L9)
- `services/projection/assetLocation.ts`: optimizeAssetLocation()
- Implémente la règle d'or canadienne (Canadian Couch Potato / PWL Capital)
- 7 classes d'actif × 3 comptes
- Calcule la perte annuelle ($) d'une mauvaise allocation
- UI dans Retirement: éditeur de holdings + bouton "Analyser"

---

## [unreleased — vague W1-W5] — Branche `claude/analyze-finance-app-CtLvs`

Bundle majeur ajoutant 11 nouvelles vagues d'améliorations identifiées lors de l'analyse de marché vs ProjectionLab, Pralana Gold, Snap Projections, Boldin, NaviPlan, etc.

### 🏗️ Fondations précision (W1)
- **W1.1** Web Worker scaffold pour MC hors thread principal (services/projection.worker.ts + runAsync.ts)
- **W1.2** Bootstrap historique S&P 500 1928-2024 (97 ans, source Damodaran NYU). Capture les vrais krachs.
- **W1.3** RRQ et PSV séparés (corrige L1: governmentPension × 0.65/0.35 obsolète)
- **W1.4** Scénario survivant après décès du conjoint (RRQ 60%, PSV cesse, DB selon election)
- **W1.5** Goal seeking inverse: trouve épargne nécessaire ou âge retraite minimum par dichotomie

### 💰 Optimisations fiscales (W2)
- **W2.6** Drawdown order optimizer: compare 5 stratégies, retourne la meilleure
- W2.1/W2.3/W2.7 capturés en config (flags, logique partielle)

### 🎲 Événements de vie stochastiques (W3)
- **W3.1** Divorce probabiliste (1.5%/an, split 50%, alimony)
- **W3.2** Invalidité longue durée (0.5%/an, 60% revenu pendant 24 mois)
- **W3.3** Maladie grave (0.3%/an, capital + dépenses)
- **W3.4** Héritage probabilisé (fenêtre ± uncertainty)
- **W3.5** Sandwich generation (boomerang kids + caregiving parents âgés)

### 📊 Visualisation et UX (W4)
- **W4.1** TaxBracketViz (fédéral + Québec avec marqueur revenu)
- **W4.5** Replay krach historique (1929/1973/2000/2008/2020/2022)
- **W4.7** Snowbird (4-6 mois US/Mexique)

### 📥 Capture variables (W5)
- **W5.1** Profil utilisateur enrichi (santé, carrière, identité, longévité)
- **W5.2** Bonus/RSU/Stock options/Side income/Périodicité paie
- **W5.3** Dettes étendues (kind, taux variable, limite, terme, déductible)
- **W5.4** InsurancePolicy (11 types de police)
- **W5.5** DB joint-life vs single-life avec %survivant
- **W5.6** RentalProperty (cap rate, vacancy, NOI, DPA)
- **W5.7** PrivateBusiness (CCPC, dividendes, BNR)
- **W5.x** Goals cycliques (véhicules, rénovations, dons charitables)

### 📚 Documentation
- `docs/PROJECTION.md` étendu (sections 7-11 ajoutées)
- Toutes les W-features documentées avec tables récapitulatives

---

## [PR #15 mergé] — Branche `claude/analyze-finance-app-CtLvs`

Bundle massif sur PR #15. Refactor profond du moteur de projection + nouvelles features de modélisation + correctifs de déterminisme.

### 🏗️ Refactor moteur de projection (D2.x)

#### D2.1 — Migration physique
- `utils/useFutureSimulation.ts` (1947 lignes) → `services/projection.ts`.
- Aucun consumer à mettre à jour (tous importaient déjà via `services/projection`).
- Import interne `./tax` ajusté en `../utils/tax`.

#### D2.2 — Extraction helpers purs
- Nouveau module `services/projection/helpers.ts`.
- Fonctions extraites : `mulberry32`, `gaussianRandom`, `applyShock`, `welcomeTax`, `ltcAnnualProbability`, `mortalityAnnualProbability`.
- Constantes extraites : `ASSET_VOLATILITY`, `MER`, `RRIF_RATES`.
- Bug latent documenté dans `welcomeTax` : paliers en `else if` (non-cumulatifs, faux fiscalement) — figé par tests régression.
- `applyShock` n'est plus redéfini 360× par scénario.
- 24 tests unitaires sur les helpers.

#### D2.3 — Correctifs déterminisme et nettoyage
- 🎯 **Graine Monte Carlo découplée du capital initial** (`scenario-strategy-iter` au lieu d'inclure `calculatedStartingCash`) — permet la comparaison équitable de stratégies.
- 🐛 Suppression de `new Date().getFullYear()` (rendait la simulation dépendante de l'horloge système).
- Suppression d'une fonction `logEvent` module-level shadow ée par sa version locale.
- Suppression de la double affectation de `monthlyExpenses` dans la phase retraite.
- **MC_ITERATIONS** : 50 → 100 (IC95% ≈ ±3 points vs ±7).

### ✨ Nouvelles features de modélisation

#### D2.4 — Pension à prestations déterminées (DB)
- 3 nouveaux champs dans `RetirementGoal` :
  - `dbPensionMonthly` — rente mensuelle couple
  - `dbPensionIndexationPct` — fraction d'IPC répercutée (0-100, défaut 100)
  - `dbPensionStartAge` — défaut = `targetAge`
- Pour les fonctionnaires (RREGOP, féd, profs, infirmières), c'est souvent le revenu de retraite #1.
- UI complète dans `Retirement.tsx`.

#### D2.5 — Smile Curve (dépenses retraite en U)
- Référence : étude CIBC "Spending in Retirement".
- Go-go (jusqu'à 74) : +15%, Slow-go (75-84) : base, No-go (85+) : -10%.
- Flag opt-in `useSmileCurve` dans `ProjectionConfig`.
- Toggle UI `😊 Smile Curve` dans `FutureProjection`.

#### D2.6 — Métrique Sequence Risk
- Nouvelles métriques dans `expertMetrics` :
  - `sequenceRiskPct` — % itérations MC où NW < 50% startNW dans la décennie critique [retraite-5, retraite+5]
  - `worstDecadeDrawdown` — pire chute relative
  - `criticalDecadeStartYear` / `criticalDecadeEndYear`
- Un krach durant cette fenêtre est ~10× plus destructeur qu'à 20 ans de retraite.

#### D2.7 — Withholding tax US 15% sur CELI
- Le CELI n'est PAS protégé par la convention fiscale Canada-US (le REER si).
- Nouveaux champs : `usEquityShareCeli` (0-100%), `usEquityDividendYield` (défaut 1.5%).
- Drag = share × yield × 15% appliqué sur `effectiveCeliRate`.
- UI : 2 sliders dans `FutureProjection`.

#### D2.8 — Mortalité stochastique + Soins longue durée (LTC)
- **LTC** : probabilités annuelles calibrées Stats Can/Genworth (1% à 65 → 25% à 90+). Coût mensuel paramétrable (2000-12000$). Une fois déclenché, persiste.
- **Mortalité** : tirage annuel selon table Stats Canada 2020-2022 (0.6% à 60 → 33% à 100). En mode MC + flag, la boucle `break` à la mort. `estateNetWorth` devient le patrimoine au décès.
- 2 toggles UI + slider coût LTC.

#### D2.9 — Inflation différenciée par poste
- Panier CPI Stats Canada 2023 (logement 30%, alim 17%, transport 15%, santé 5%, loisirs 6%, autres 27%).
- 6 sliders configurables.
- Le bonus santé après 75 ans s'applique désormais sur la part Santé uniquement.

#### D2.10 — Perte d'emploi stochastique
- Probabilité annuelle ~3% (Stats Can).
- Durée moyenne sans emploi : 6 mois (paramétrable).
- Pendant la période : salaire user1 = 55% (assurance-emploi).
- Toggle UI.

### 📚 Documentation

- ➕ **`docs/PROJECTION.md`** : documentation détaillée du moteur de projection (9 phases mensuelles, calendrier fiscal, déterminisme, cas-tests, limitations).
- ➕ **`CHANGELOG.md`** : ce fichier.
- 🗑️ **`CHANGELOG_COMPLET.md`** : supprimé (corrompu UTF-16, remplacé).
- 📦 Archivés dans `docs/archive/` :
  - `AUDIT_REPORT.md`
  - `META_AUDIT.md`
  - `PLAN_DE_FIX.md`
  - `RAPPORT_FIXES.md`
  - `plan_mcp_financeai.md`

### 🧪 Tests

- 79 → **115 tests** (toujours 100% pass).
- 6 fichiers de tests : `projection.test.ts`, `projection.helpers.test.ts`, `tax.test.ts`, `portfolio.test.ts`, `realEstate.test.ts`, `safeNumber.test.ts`.

---

## [Session précédente] — Mai 2026

### U-series — UI / UX
- **U1** : Conversation `AiAssistant` persistée dans le store (avec timestamps ISO).
- **U2** : Backup chiffré AES-256-GCM (PBKDF2 600k iters) dans Settings.
- **U3** : Vue mobile responsive pour `Transactions` (card layout en `<ul>` mobile).
- **U4** : `SystemView` — remplace faux terminal par diagnostic réel basé sur l'état.

### I-series — Infrastructure
- **I1** : Mini-proxy Netlify Function remplace `api.allorigins.win` (SSRF-safe).

### R-series — Robustesse
- **R1** : ErrorBoundary par onglet (reset via `resetKey`).
- **R2** : AbortController dans `loadData` pour éviter race conditions sur sync API.
- **R3** : Helper `safeNumber` anti-NaN/Infinity + 13 tests.

### T-series — Tests
- **T1** : Tests moteur projection + régression barèmes 2026.
- **T4** : Validation Zod des réponses Gemini LLM (4 schémas).

### D-series — Données
- **D1** : Mise à jour barèmes fiscaux 2026 (ARC + Revenu Québec).

### F-series — Persistance
- **F5a/b/c/d** : Persistance des états locaux dans le store (ChildGoal, RealEstateGoal, ProjectionConfig).

### Autres
- F3 : Remplacement de `window.confirm`/`prompt` par modal React dans Settings.
- Migration Lunch Money → Era Context (auth, schémas, CSP).

---

## [Historique plus ancien]

Voir `docs/archive/RAPPORT_FIXES.md` et `docs/archive/AUDIT_REPORT.md` pour les sessions de hardening initiales.
