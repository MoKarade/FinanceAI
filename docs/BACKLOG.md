# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/HISTORIQUE.md`](HISTORIQUE.md) (fusion de tous les snapshots/audits/designs livrés).
> Audit qualité détaillé : voir `docs/HISTORIQUE.md` (section `AAA_AUDIT_2026-06.md`).
> Actions humaines (Marc) : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).
>
> **Dernière mise à jour : 2026-07-06.** Tests : 2334 verts / 207 fichiers · tsc clean · build OK.
> **Dernière PR mergée : #425** (2026-06-26, WHT-DISPLAY-EXACT) — 111 commits depuis #315, audit financier complet 2026-06-23 résolu (6 lots), 5 sessions 06-19→06-26, retraite per-conjoint ✅.
> Restes uniquement : suivis LOW (DEP-UNDICI-VULN, FISC-CONST-LINT-LIMITS, FISC-RRSP-PRE2010-FALLBACK + suivi FUZZ-ONETIME-FLOWS) +
> blocages Marc (RECH-ACTION-UX confirmée visuellement, phases 2-4 brief plan-first, P0-*, design Budget/Transactions/Retraite).

## 🔎 Analyse app complète 2026-07-15 (panel 4 agents — rapport : `docs/ANALYSE_APP_2026-07-15.md`)
> Demande Marc : « une grosse analyse de l'app ». Détail, preuves fichier:ligne et plan d'ordre dans le rapport.

- **`[DETTE-PDF-FX-BYPASS]`** 🔴 HIGH (S) — `services/pdfReport.ts:123` : `quantity × currentPrice × fx` à la main
  au lieu d'`assetValueCad` (sans gardes NaN/devise), INVISIBLE du test-garde assetFxGuard (le mot « fx » sur la
  ligne suffit). Même classe que l'incident ASSET-FX-DISPLAY, dans le PDF remis à l'utilisateur. Fix : router par
  `assetValueCad` + renforcer le scan (interdire aussi `* fx` hors portfolio.ts).
- **`[ARCH-SYNC-SPLIT]`** 🟠 ÉLEVÉ (L, plan-first) — scinder `syncOrchestrator.ts` (892 l., 23 exports mêlés :
  push/pull/conflit/passphrase/polling/suppression — siège des 2 incidents de juillet) en 4 modules par
  responsabilité + barrel de compat ; discriminants sur les scénarios des 2 incidents. ADR complet dans le rapport.
  À faire AVANT tout nouveau chantier sync.
- **`[SEC-DRIVE-ENCRYPT-DEFAULT]`** 🟠 MOYEN-ÉLEVÉ (M) — payload Drive EN CLAIR par défaut (chiffré seulement si
  passphrase opt-in) alors que les clés API ont déjà un chiffrement NON-optionnel dérivé du `sub` Google
  (keyCipher). Appliquer la même recette à tout le payload (zéro friction, cross-device intact) ; passphrase =
  zéro-knowledge additionnel.
- **`[SEC-VISION-CONSENT-INJECTION]`** 🟡 MOYEN (S) — relevés envoyés en IMAGE BRUTE à Claude Vision (montants
  exacts, nom/adresse/n° compte imprimés) : ajouter la clause anti-injection au prompt Vision (absente, présente
  partout ailleurs) + consentement explicite ponctuel avant le 1er envoi (Loi 25).
- **`[MCP-CHARTDATA-SUM-GUARD]`** 🟡 MOYEN (M) — garde-fou générique : tout nouveau tool MCP qui SOMME des flux
  chartData retombe dans le piège MCP-RETIREMENT-VERDICT (décaissement non-enreg sans champ Retrait*) ; corrigé au
  cas par cas aujourd'hui, à systématiser (test/lint de convention sur mcp/tools/*).
- **`[UX-STATEMENT-REMINDER]`** 🟡 MOYEN (S) — rappel proactif « relevé de [mois] manquant » (généraliser la bannière
  budget) : le rituel d'import mensuel n'a aucun filet — c'est ce qui a laissé la fuite persona invisible des semaines.
- **`[DETTE-GODFILE-BUDGET]` / `[DETTE-GODFILE-INVESTMENTS]`** 🟡 MEDIUM (L, au fil de l'eau) — 1 289/1 163 lignes ;
  répliquer le pattern « sections » qui a réussi sur Settings (207 l.) ; extraire coupleAnalysis/fiscalBreakdown/
  alerts vers services/budgetAnalysis.ts (purs, testables) et DEFAULT_TARGET_MODEL/écarts vers services/.
- **`[DETTE-CLAUDE-SPLIT]`** 🟡 MEDIUM (M) — services/claude.ts = 8 features IA indépendantes (918 l.) → split
  mécanique services/claude/ + re-export (zéro breaking).
- **`[DETTE-TOLOCALESTRING-NU]`** 🟡 MEDIUM (S) — 6 `toLocaleString()` sans locale (AiAssistant ×5, taxApril:70) :
  rendraient « NaN » au lieu de « — » ; router par formatCAD/formatSigned (règle FMT-CURRENCY-UNIFY).
- **`[DETTE-TESTGAP-MARKETDATA]`** 🟡 MEDIUM (S) — `pickProvider` (routage Finnhub/CoinGecko) sans test : un bug de
  routage = prix jamais rafraîchi en silence.
- **`[DETTE-DEADCODE-2026-07]`** 🟢 LOW (S) — 4 locales `_`-préfixées mortes confirmées : Budget.tsx:193-194,
  RealEstate.tsx:79, AiAssistant.tsx:122. (Les `_` de runAsync/syncOrchestrator/usePastPortfolioHistory sont VIVANTS.)
- **`[DETTE-CHART-THEME-DUP]`** 🟢 LOW (S) — tooltip Recharts dupliqué 14× avec 4 fonds différents → constante
  partagée CHART_TOOLTIP_STYLE. · **`[DETTE-INPUT-PRIMITIVES]`** 🟢 LOW→M — 81 inputs inline sans primitive
  Field (40 dans AdvancedProjectionParams). · **`[SEC-GA-DEFER-CONSENT]`** 🟢 LOW (S) — injecter gtag.js APRÈS
  consentement. · **`[ENG-RAMQ-FIELDS]`** 🟢 LOW (M) — 2 TODO moteur (enfants à charge, assurance médicaments privée,
  champs User additifs).
- **DÉCISIONS DE GEL proposées (produit)** : `[CIX]` en entier + raffinements per-conjoint/dons + durcissement
  OAuth au-delà de l'existant + chasses d'affichage LOW sans impact patrimoine — tant que la situation de
  l'utilisateur (solo, 26 ans) ne change pas. La doc « 31 sous-modules projection » corrigée → 41.

## 🔴 Données de test dans les vraies données (2026-07-15) — incident « fausses transactions »
> Marc : « j'ai des fausses transactions sans doute des profils de test je veux plus que ça arrive jamais ».
> Constat (via MCP + code) : ~600 transactions du persona « Karim » (`persona-tx-*`) + objectif `kar-fg1`
> mélangés aux ~200 vraies transactions Desjardins ; [Probable] budgets `kar-b*` aussi. Fuite ANTÉRIEURE
> aux gardes actuelles (persona activé ~2026-06-07), chemin exact non identifiable a posteriori.

- **`[INCOME-PROVENANCE]` + `[TAX-DETAIL]`** ✅ **LIVRÉ 2026-07-15** (demande Marc : chaîne paie→Impôt→Santé,
  source unique) — salarySource estampillé (scan paie UI + apply_payslip MCP), bannière de provenance +
  détail des retenues (féd/QC/RRQ/RQAP/AE) + réel des transactions dans l'onglet Impôt ; get_tax_situation
  enrichi (withholdings/netMonthly/salarySource/realMonthlyAverages). MCP v0.7.1 → **redéploiement Cloud Run requis**.
- **`[BUDGET-MONTHLY-LEDGER]` + `[BUDGET-PAST-AVG]`** ✅ **LIVRÉ 2026-07-15** (demandes Marc : réel
  revenus+dépenses par mois ; budget du mois courant = moyenne de tout le passé ; tuiles Budget/Dépenses
  identiques dédupliquées ; « Revenus 0 » explicité — relevé de compte mensuel en retard sur la carte).
  Cibles `autoTarget` (champ additif) recalculées à chaque chargement ET en cours de session ; grand
  livre 12 mois avec bucket « Autres / non classées » (Σ lignes ≡ Total).
- **`[TX-CATEGORY-RULES]`** ✅ **LIVRÉ 2026-07-15** — règles déterministes de catégorisation (payees QC du corpus
  réel de Marc, ~88 % de couverture mesurée) branchées sur import CSV + bouton Auto-catégoriser (règles AVANT IA)
  + MCP apply_bank_statement + listes de catégories. Jeu canonique 16 catégories (`RULE_CATEGORIES`).
- **`[BUDGET-TX-CATEGORIES]`** ✅ **LIVRÉ 2026-07-15** (verbatim Marc : « seulement et exactement les meme
  catégories que dans transactions ») — sync auto Budget↔catégories observées (`utils/budgetSync.ts`, cible
  suggérée = médiane 6 mois ; retraits à la 1re passe du montage seulement) + table « Historique par catégorie »
  (12 mois, moyenne par mois actif).
- **`[PERSONA-PURGE]`** ✅ **LIVRÉ 2026-07-15** — registre d'ids d'artefacts (`testPersonas/artifactIds.ts`,
  parité fixtures↔registre verrouillée par test-scan) + sanitizer pur (`personaSanitizer.ts`) ancré à
  5 endroits : boot (self-heal + toast), sortie de mode test (snapshot), push Drive, pull Drive,
  restauration de backup. 22 tests (direction anti-faux-positif incluse). La purge des données de Marc
  s'exécute AUTOMATIQUEMENT au prochain chargement de l'app (Vercel déploie au merge).
- **`[PERSONA-LEAK-ROOTCAUSE]`** 🔍 LOW — chemin de fuite exact inconnu (antérieur aux gardes SYNC-ANTI-CLOBBER
  et shouldPush-test). Si récidive malgré PERSONA-PURGE (le log `purgePersonaArtifacts` en ferait foi), creuser :
  restauration d'un backup pris EN mode test avant #217, ou merge conflit Drive d'une époque sans garde.
- **`[FISC-PAYROLL-BASE-INVEST]`** 🔧 MEDIUM (finding panel TAX-DETAIL 2026-07-15, PRÉ-EXISTANT exposé par la
  nouvelle carte) — `calculateFiscalReport` calcule RRQ/RQAP/AE sur `grossIncome` TOTAL, or TaxCenter lui passe
  salaire + revenu de placement estimé (`uTotalTaxable`) : cotisations gonflées (+883 $ mesurés, salaire 50 k +
  200 k non-enreg) quand le salaire est SOUS les maximums (RRQ ~68,5 k, AE ~65,7 k, RQAP ~98 k). Fix : séparer
  l'assiette d'emploi (RRQ/RQAP/AE) de l'assiette imposable (paliers) — signature à 2 revenus. Corollaire
  `[TAX-APP-MCP-BASE]` : get_tax_situation calcule sur salaire SEUL (sans placement) → app ↔ MCP divergent pour
  un détenteur de non-enreg ; aligner les deux assiettes au même fix (+ repli net→brut côté MCP absent).
- **`[BACKUP-PROMISE-CATCH]`** 🔧 LOW (finding panel 2026-07-15) — `createBackupNow` fait `return new Promise(...)`
  DANS son try : un rejet ASYNC (tx.onerror IndexedDB, ex. quota) passe au caller sans être journalisé par son
  propre catch. Fix : `await` la promesse avant de la retourner (le catch interne loggue alors vraiment). Les
  call-sites critiques (purge boot) journalisent déjà côté appelant en attendant.
- **`[PURGE-TOAST-UX]`** 🎨 LOW (finding panel) — seuls le boot notifie par toast ; les purges au pull Drive /
  sortie de mode test ne sont visibles qu'en SystemView (logError). Si Marc veut la notification partout :
  abonnement générique aux entrées storage PERSONA-PURGE → toast. (`restoreBackup` recharge la page → toast inutile.)

## 🔴 Intégrité des données Drive + MCP (2026-07-14) — incident perte de 230k$ + audit 6 alertes
> Marc a perdu 230k$ de placements (reconnexion Drive → écrasement du local par une vieille copie). Récupéré
> via auto-backup IndexedDB. Audit adversarial (12 agents) des 6 alertes claude.ai : verdicts ci-dessous.
> ⚠️ **Les items MCP requièrent un REDÉPLOIEMENT Cloud Run** (`mcp/deploy.sh`) pour que Marc en profite.

- **`[SYNC-ANTI-CLOBBER]`** 🔧 ✅ **LIVRÉ (PR à venir, 2026-07-14)** — `decideOnLoad` sans `restoreIntent` (une seule
  garde anti-perte : local réel + Drive divergent → `conflict`, jamais d'écrasement auto) + `SyncConflictModal` global
  (résumé « cet appareil vs Drive ») + `SyncStatusBanner` (alerte déconnexion/erreur push) + `flushPush` au masquage
  d'onglet + gate HARD-block (`LoginGate`). Discriminant git-stash prouvé. **Marc : mettre `VITE_GOOGLE_GATE=1` sur Vercel.**
- **`[MCP-RETIREMENT-VERDICT]`** ✅ **LIVRÉ 2026-07-14 (PR MCP v0.6.0)** — `get_retirement_outlook` expose désormais le
  décaissement du portefeuille (`incomeSources.portfolioWithdrawals`, retraits REER/CELI + loyers, moyenne 1re année déflatée
  par point) et `meetsIncomeTarget` est basé sur la SOUTENABILITÉ du plan (`minNetWorth > 0` + MC ≥ 85 si demandé) — plus
  jamais « sous la cible » pour un plan autofinancé (MC 98 %). NB mesuré : le décaissement NON-ENREGISTRÉ n'a pas de champ
  moteur (`Retrait*`) → sommer les revenus sous-estime toujours (3 923 $ identifiables vs cible 5 500 $ sur un plan qui
  tient) → verdict = signal moteur, pas somme. Discriminant git-stash prouvé (DINK : false→true).
- **`[MCP-PAYSLIP-BACKUP]`** ✅ **LIVRÉ 2026-07-14** — `driveStateSource.saveState` : backup Drive horodaté
  (`financeai-sync.json.<ISO>.bak.json`, rolling 5, appDataFolder) AVANT tout écrasement, FAIL-CLOSED (backup impossible →
  write refusé) ; garde de concurrence (`updatedAt` a avancé depuis la lecture → refuse, rien d'écrasé, cache store invalidé
  → le retry relit du frais). `backupPath` désormais réel côté Drive (spec des apply_* tenue). Discriminant prouvé.
- **`[MCP-TAX-COUPLE]`** ✅ **LIVRÉ 2026-07-14** — `get_tax_situation` calcule PAR CONJOINT puis somme (aligné moteur
  `taxDecember.ts:369-395`) ; `marginalRatePct` = marginal du conjoint au plus haut revenu (jamais celui du total fusionné) ;
  détail `perUser`. Discriminant : couple 60/60 → ~22 k$/36,1 % (l'ancien code rendait 33 435 $/45,7 %). Solo inchangé (Marc).
- **`[MCP-STALE-FRESHNESS]`** ✅ **LIVRÉ 2026-07-14** — `mcp/state/freshness.ts` : la source Drive publie l'`updatedAt` du
  blob lu/écrit ; `withState` appose une note de fraîcheur à CHAQUE réponse (date + âge ; > 6 h → avertissement « possiblement
  périmées, ouvre l'app pour pousser »). Claude sait désormais quand la copie Drive est vieille.
- **`[PROJ-TAXPAID-LABEL]`** 🔶 **partiellement livré 2026-07-14** — surface MCP faite : `get_projection` ET `simulate_what_if`
  renomment le champ en `netTaxSettlements`/`netTaxSettlementsDelta` + note explicite (« PAS l'impôt total payé »). RESTE
  (moteur, non-money-critical) : renommer/documenter `totalTaxesPaid` côté `projection.ts:1444` et borner
  `taxLeakage`/`avgEfficiency` (`Math.max(0, …)`, monteCarlo.ts:106/137 — efficacité > 100 % possible avec un compteur
  négatif). ⚠️ touche des seuils de tests MC → re-baseliner prudemment.
- **`[ASSET-FX-DISPLAY]`** ✅ **LIVRÉ 2026-07-14 (PR FX)** — 6 surfaces UI sommaient `quantity × currentPrice` SANS
  conversion de devise (prix stockés en NATIF) → patrimoine SOUS-affiché de ~70 k$ (l'app disait 160 352 $, la vraie
  valeur CAD ≈ 230 k$ — le MCP avait raison, incident « je devrais pas avoir 230k » élucidé). Fix : source unique
  `assetValueCad` + 5 sites convertis (NetWorthByOwnerCard, Investments, Dashboard ×2, HealthIndicator,
  AssetLocationCard) + csvExport documenté natif-par-ligne + test-garde scan `assetFxGuard` (discriminant prouvé).
- **`[MCP-APPLY-DEBT]`** ✅ **LIVRÉ 2026-07-15 (demande Marc « rajouter des dettes avec mcp genre achat de voiture »)** —
  tool `apply_debt` (v0.7.0) : ajoute/met à jour PAR NOM une dette RÉELLE (update PARTIEL — champs $ optionnels en màj,
  requis à l'ajout ; idempotent au retry, jamais de doublon, description avertit « même nom = écrasement »),
  catégorie inférée du nom (auto→Car, études→Student, carte→CreditCard), bornes anti-injection D9 + gardes non-fini
  côté MÉTIER (bypass-Zod couvert, leçon MCP-WHATIF). ⚠️ Sémantique moteur documentée dans la description : dettes
  DÉJÀ CONTRACTÉES seulement (servies dès le mois 0) — achat FUTUR/hypothétique routé vers `simulate_what_if`
  (garde-fou [MCP-WHATIF-DATED-DEBT]). ⚠️ Redéploiement Cloud Run requis.
- **`[ASSET-CURRENCY-BACKFILL]`** 🔧 (résidu panel FX) — un actif LEGACY sans champ `currency` est traité 1:1 CAD
  (désormais JOURNALISÉ par `assetValueCad`, plus muet) ; le fix propre = backfill de migration (défaut assumé +
  documenté) OU invite UI à préciser la devise. Attendre de VOIR le log apparaître chez un utilisateur réel avant
  de migrer (peut ne concerner personne). Effort S.
- **`[PRICE-REFRESH-LIVE]`** ✅ **LIVRÉ 2026-07-14 (PR à venir)** — `services/priceRefresh.ts` : `refreshAssetPrices`
  (getQuote séquentiel espacé 2 500 ms ≈ 24/min, sous CoinGecko free ~30/min — jamais de Promise.all) + patches par
  symbole fusionnés sur l'état FRAIS (`applyPricePatches`, anti-course avec un pull Drive/édition). Gardes : prix natif
  only, devise protégée (quote ≠ devise stockée → skip), couverture HONNÊTE (no-quote/invalid-price listés, jamais de
  prix inventé). Câblage : refresh AU BOOT (après hydrateAssets, sauté en mode test) + bouton « Actualiser les cours »
  (Investissements → Détail, horodatage + toast récapitulatif). Champ additif `Asset.priceUpdatedAt` (zéro bump).
- **`[MCP-GET-HOLDINGS]`** 🔧 — aucun tool MCP ne LISTE les positions (symbole, qty, prix, devise, valeur CAD) :
  pendant l'incident FX, impossible d'identifier le « +70 k$ » en une question. Ajouter `get_holdings` (lecture
  seule, réutilise `assetValueCad`). Effort S, grande valeur diagnostique.
- **`[MCP-FRESHNESS-PRECISION]`** 🔧 — la note de fraîcheur arrondit à l'heure (« il y a 5 h » pour 4 h 40) ;
  afficher heures+minutes sous 48 h (retour claude.ai via Marc 2026-07-14). Trivial (humanAge, freshness.ts).
- **`[MCP-WRITE-VERSION-TOKEN]`** 🔧 (durcissement, panel 2026-07-14) — la garde de concurrence Drive (`lastSeenUpdatedAt`)
  est PROCESS-WIDE : elle protège contre l'app qui pousse entre lecture et écriture MCP (l'incident), mais DEUX tool-calls
  MCP concurrents (2 sessions du même user) dont les mutations partent du même cache peuvent encore se marcher dessus
  (fenêtre = durée d'un handler ; writes désormais sérialisés par mutex + refus journalisé). Vrai fix : jeton de version
  par appel plumbé via `StateStore.get()` → `{state, version}` et `save(next, expectedVersion)`. Effort M.
- **`[CELI-ASSET-NUDGE]`** 🔧 — l'app suit les virements CELI sortants mais pas le compte destinataire → CELI affiché 0 malgré
  ~24 k$ cotisés (patrimoine sous-estimé). Audit **CONFIRMED** (finding #6). Fix (produit, NO-fake-data : ne PAS dériver celi=Σvirements =
  coût, pas valeur marché) : NUDGE onboarding « tu vires vers ton CELI mais aucun avoir CELI saisi → ajoute-les ». Router UX.
- Note : `moteur-impot-couple-fusionne` audit **REFUTED** — le moteur impose déjà PAR conjoint (`taxDecember.ts:394-396`), aucun bug. (Correction d'une hypothèse antérieure.)
- **`[SYNC-FETCH-TIMEOUT]`** 🔧 (suivi panel SYNC-ANTI-CLOBBER) — les fetch Google/Drive (`services/googleDrive/driveAppData.ts`) n'ont AUCUN timeout/`AbortController` → un réseau « dégradé » (Google lent) peut faire pendre `fetchUserIdentity`/`readDrive` indéfiniment (mitigé côté UI par la trappe LoginGate à 10 s, mais la racine reste). + `fetch(..., {keepalive:true})` pour fiabiliser le push `flushPush` au `pagehide`. Effort M.
- **`[A11Y-CHECK-CONTRAST-DRIFT]`** 🔧 (dette outillage) — `scripts/check-contrast.ts` utilise des valeurs de tokens PÉRIMÉES (`surface #151922` au lieu de `#0E1014` ; `primary #10b981` = l'ancien vert au lieu de `#e6eaf2`) → il ne teste pas les vrais combos actuels (rose bannière, superpositions). Réaligner sur `tailwind.config.js`.
- **`[A11Y-GHOST-BUTTON-PROMINENCE]`** 🔧 (design-system) — le variant `ghost`/`outline` de `components/ui/Button.tsx` (`bg-white/5 border-white/10`, ~1,1-1,8:1) échoue WCAG 1.4.11 (prominence &lt; 3:1), utilisé dans ~28 fichiers. `GATE-CTA-CONTRAST` n'avait traité qu'un CTA primaire. Fix au niveau du design-system.
- **`[MCP-TAX-FHSA-BALANCE]`** 🔧 (pré-existant, trouvé par le panel 2026-07-14) — `getTaxSituation.tool.ts` passe `u.fhsaBalance`
  (un SOLDE) comme cotisation CELIAPP ANNUELLE à `calculateFiscalReport` → sur-déduit (sous-estime l'impôt) dès que le solde
  dépasse la cotisation de l'année. Antérieur au fix per-conjoint (l'ancien code sommait pareil). Fix : champ de cotisation
  annuelle dédié ou clamp au plafond CELIAPP annuel. + Limite documentée : un conjoint SANS salaire brut mais avec
  `rrspContributed > 0` n'a aucun bénéfice fiscal (correct — la déduction ne réduit que le revenu de SON titulaire ; l'ancien
  code l'appliquait à tort au revenu fusionné de l'autre).

## Convention (cochage par Claude au merge)
- Chaque item Claude-faisable porte un **`[ID]`** entre crochets. **Claude coche lui-même**
  l'item au moment du merge de la PR qui le livre (l'Action `backlog-autocheck` a été retirée —
  choix Marc, 2026-06-09).
- Claude édite ce fichier pour **cocher** (au merge) et **ajouter** des items (découvertes).
  Les blocages humains vont dans `A_FAIRE_MOI.md`.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier.
- Les **tests manuels** (section 👤 ci-dessous) n'ont PAS d'`[ID]` (à Marc).

---

## 🧭 Décisions & vision Marc — 2026-06-19 (batch de réponses)
> Marc a tranché un lot d'items en attente + livré sa vision Futur/Budget. Source de vérité ; les items
> individuels ci-dessous pointent ici. Quick-wins/closures appliqués cette session ; gros chantiers = plan-first.
>
> **➡️ FEUILLE DE ROUTE VALIDÉE & exécutée en autonomie : [`docs/PLAN_CHANTIERS_2026-06-19.md`](PLAN_CHANTIERS_2026-06-19.md)**
> (4 agents d'exploration → plans `fichier:ligne`, VALIDÉS par Marc 2026-06-19). Décisions verrouillées : **Q1 multi-courbes
> OUI** ; **FA-6** = fédéral **14 %** (≤200 $) / titres **inclusion 0 % sur tout le don** / QC **24 % fixe** ; couple = attribution
> **auto par défaut** (type de poste), éditable ; ordre = gains rapides UI → PH4 → money-critical. ★ **Surprise** : le verrouillage +
> persistance de courbe (Q1-A) est DÉJÀ construit à ~95 % (`lockedProjectionStore.ts` + store) → ne PAS reconstruire.

### Tranché (closures + go)
| Item | Décision Marc | Suite |
|---|---|---|
| `A11Y-BADGE-PROMINENCE` | **Option B — bordure renforcée** (fond inchangé, bordure ~0,55) | 🔧 PR à venir (appliquer aux 6 variants) |
| `LABEL-NW-SUCCESSORAL` | Reco acceptée : **libellés distincts** (« Patrimoine successoral, avec rentes » vs « Patrimoine projeté ») + **infobulle** expliquant l'écart | ✅ LIVRÉ (R1, 2026-06-19 — libellé + tooltip sur 5 sites, pas de moteur) |
| `FA-6` (dons charitables) | **(a) Modéliser proprement** (paliers fed+QC + inclusion 0 % titres) | 🔧 effort M, sourcé (voir item FA-6) |
| `PH3-c-bis` (`User.industry`) | **Supprimer** | ⚠️ migration schéma Zustand (prudence) |
| `ENG-TAX-NS` | **Garder l'alias** | ✅ clos, rien à coder |
| `H1` (chiffrement passphrase) | **Non** | ✅ clos, décliné |
| `B-AUDIT-5` (SRG dans clawback PSV) | Corriger | ✅ **DÉJÀ FAIT** (vérifié 2026-06-19) : `projection.ts:918/921/929` excluent déjà le SRG (`incomeRetirement − incomeRetirementGis`). Item périmé → clos. PAS de fake fix. |
| `ITEM-2C`, `Tables fiscales` | **Planifier** | plans ci-dessous |
| `NAV-CONSOLIDATE` | « on en parle après » | ⏸️ différé |

### ★ Q1 — Onglet Futur (vision détaillée, plan-first par sous-chantier)
- **Annotations sur la courbe** : âge de retraite ✅ · **chaque événement de vie** ✅ · **FIRE atteint** ✅.
  PAS : épuisement de compte ❌, ni RRQ/PSV/CELIAPP ❌ (déjà lisibles sur la courbe). **Clic sur une icône →
  description brève** de l'événement.
- **Infobulle** : tout voir (actuellement coupée + impossible à scroller car elle suit la souris) → la **figer/
  rendre scrollable** (ne plus suivre le curseur quand on veut lire). ✅ **LIVRÉ (R3, 2026-06-22)** : clic = FIGE
  l'infobulle (portail `position:fixed`, ancrée, scrollable, interactive) ; survol = suit la souris
  (`pointer-events:none`) ; Échap / clic-dehors libère ; coexistence avec la modale via bouton « Détail complet ».
  Hook `useChartTooltipPosition` (machine d'état) + utils purs `resolvePointFromClick`/`clampTooltipPosition`.
  - **Découvertes R3 (panel a11y, 2026-06-22) → follow-ups** :
    - `A11Y-CHART-KEYBOARD` — le graphe Futur est clic-only (conteneur `role="img"` `tabIndex=-1`, pastilles `tabIndex=-1`) :
      figer/ouvrir le détail au CLAVIER n'est pas possible (limite PRÉEXISTANTE, pas une régression R3 ; mitigée par
      l'alternative sr-only `ChartDataTable`). Chantier a11y dédié (clavier sur graphes Recharts).
    - `FIX-INK600-TOKEN` — ✅ **FAIT (2026-06-22)** : `text-ink-600` (inexistant, `ink` s'arrête à 500) remplacé par `ink-400`
      sur les **9 usages / 7 fichiers** (Dashboard, ActionPlanDrilldown ×2, FutureDetailModal ×2, ProjectionTooltip, NextBestAction,
      ZoomableTimeChart, ZoomContainer). `ink-400` mesuré AA normal (`check-contrast` : 5,84 surface / 5,21 highlight, ≥ 4,5). Pur CSS.
- **Densité au zoom (level-of-detail)** : dézoomé = peu d'icônes ; en zoomant, de plus en plus jusqu'à toutes.
  ✅ **FAIT (R4-P4, 2026-06-22)** : cap fixe baissé 40/24 → **24/16** (`MAX_LIFE_ICONS`/`MAX_FLOW_ICONS`). Le LOD « zoom = toutes »
  était déjà là (fenêtre zoomée < cap). ⚠️ La formule `(visMax−visMin)/6` du plan était à l'envers (rejetée) → cap fixe plus bas.
  **R4-P1 (boot-restore au mount)** : ✅ déjà en place (`App.tsx:72-96`, PH2-d), vérifié — aucun patch.
- **★ VERROUILLAGE + PERSISTANCE de la courbe** (clé de voûte Phase 2) : une fois leviers + courbe choisis, elle
  **reste affichée** en changeant de page ET **après déconnexion/reconnexion**, jusqu'à ce que Marc la change ou
  **compare** des courbes. → persistance (store + IndexedDB), pas un recalcul volatil.

### PH4 — par onglet (vision, plan-first)
- **Budget** : **parité catégories** (chaque catégorie de Transactions ↔ un poste Budget) ✅ **FAIT (PH4-A, 2026-06-22)** :
  règle unique `utils/budget.ts matchTransactionToCategory` (réels + tendances), section UI « Parité » (orphelins + postes jamais
  rapprochés). `totalSpent` préserve le « Total dépensé ». · meilleure répartition **envie/besoin** ✅ **FAIT (PH4-B, 2026-06-22)** :
  donut **réel** (dépenses rapprochées + épargne réelle) + table comparative **Réel · Cible · Idéal 50/30/20** (`computeGoldenSplit`,
  écart coloré ±2 pts). · **objectif d'épargne** + vue **réel vs objectif** ✅ **FAIT (PH4-C, 2026-06-22)** : `SavingsGoal.linkedBudgetCategoryName?`
  (lien par NOM vers une catégorie budget) → « Accumulé / cible / **Versé ce mois** » (`monthlyActualsMap`, dépense réelle du mois) ;
  lien éditable par objectif ; lien orphelin (catégorie renommée) → badge « ⚠ Lien invalide ». Migration : aucun code (champ optionnel additif).
  - [ ] **[PH4C-SAVINGS-NATURE]** 🔧 LOW — lier un objectif à une catégorie de **nature « Épargne »** affiche « Versé ce mois : 0 » en
    permanence (l'épargne est alimentée par VIREMENTS, exclus d'`actualsMap` comme dans la parité budget). Pistes : filtrer le dropdown
    aux catégories non-épargne, OU inclure les virements rapprochés pour ces postes. Découvert par `financial-integrity` (PH4-C). Pas un bug $.
  - [x] **[PH4D-WEIGHTS-STORE]** ✅ LOW (2026-06-22) — poids de l'`HealthIndicator` migrés vers le **store Zustand** :
    `AppState.healthWeights?` (additif, pas de v7→v8) + `utils/healthWeights.ts` (`DEFAULT_HEALTH_WEIGHTS` + `loadLegacyHealthWeights`
    qui lit l'ancienne clé à l'init du store ; le `merge` Zustand défaut garde la valeur initiale → poids user NON perdus). HealthIndicator
    lit/écrit le store (`setAppState`). 7 tests migration + tests composant adaptés. Panel APPROVE (logError sur corruption, `@deprecated` sur la clé).
  - [x] **[PH4D-BUDGET-RATIOS]** ✅ MEDIUM (2026-06-22) — 2 ratios budgétaires ajoutés à l'`HealthIndicator` : **adhérence au budget**
    (`computeBudgetParityScore`, dépenses réelles vs cibles du mois précédent, hors postes épargne) + **poids des abonnements**
    (`computeSubscriptionLoadScore`, coût mensuel des abos épinglés / revenu net, plafond 15 %). `HealthWeights` 4→6 (rétrocompat via
    `normalizeHealthWeights`). Correction de fond : `totalScore` exclut les métriques sans donnée (un 0 par absence ne tire plus le score).
    Revue adversariale (workflow, 5 dimensions) → 6 findings intégrés (épargne exclue, fréquence `monthlyExpenses`, masquage orphelins, a11y `—`).
  - [x] **[A11Y-HEALTH-RAW-INK500]** ✅ **FAIT (2026-07-07)** — `HealthIndicator.tsx` : **3** occurrences `text-ink-500`
    migrées vers `text-ink-400` (le `m.raw` de chaque métrique l.329 + les 2 voisines de même classe échouant AA trouvées à la
    lecture : `/ 100` l.306 et le poids `%` l.327). `check-contrast` confirme ink-400 = 5,21-6,42:1 (AA ✅) vs ink-500 = 3,41-4,20:1 (❌).
    Panel a11y-auditor + code-reviewer APPROVE. Pur CSS, zéro logique.
  - [x] **[PH4E-OWNER-EDIT]** ✅ LOW (2026-06-22) — **colonne « Conjoint »** dans le tableau Transactions (mode couple) : un `<select>`
    par ligne (Auto / prénom conjoint 0 / prénom conjoint 1) qui OVERRIDE `Transaction.ownerId` (`updateOwner`, `undefined` = AUTO).
    Table desktop (colonne conditionnelle) + carte mobile (ligne « Conjoint : »). `Transactions.tsx` lit `config` du store ; l'override
    alimente `resolveTransactionOwner`/`computeActualByOwner` (#398, déjà prouvé). 3 tests (solo absente, couple présente, change écrit/efface).
    **PH4-E complet.** Reste-note (`computeActualByOwner` garde `amount<0` interne) → non requis : seul site d'appel filtre déjà.
  - `BUDGET-KEY-WARNING` (découverte PH4-A, **pré-existant, LOW, non-fatal**) : la page Budget émet des warnings React « two children
    with the same key, `value` » (~32 en session, clé littérale `value`). ⚠️ **Hypothèse `nameKey` RÉFUTÉE** (testée 2026-06-23) :
    ajouter `nameKey="name"` aux `<Pie dataKey="value">` ne change RIEN — Recharts keye en interne sur le `dataKey`, pas le label.
    Sources « value » à l'écran : les 2 donuts (`<Pie dataKey="value">`) au montage + `<Bar dataKey="value">` (`BudgetGroupTable:254`,
    rendu seulement à l'expansion d'un poste). Vraie correction = inconnue (quirk interne Recharts sur la légende du Pie) → demande une
    investigation dédiée (essayer un `id` unique par `<Pie>`, ou supprimer/customiser `<Legend>`). Warning React dev, pas une erreur runtime.
  - [x] **[PLANNING-ANNUAL-SUB-12X]** ✅ **FAIT (2026-06-26)** — voir l.709 détail. Doublon fermé.
    « Fixe Mensuel »/« Coût Annuel ». Identique avant/après PH4-F (financial-integrity : pas une régression). Fix : utiliser
    `yearlyCost` pour l'annuel et normaliser le mensuel par `yearlyCost/12` plutôt que `averageAmount` brut.
  - `BUDGET-DONUT-SVG-ARIA` ✅ **FAIT (2026-06-23)** : les 2 donuts (théo + réel) enveloppent désormais `<ResponsiveContainer>`
    dans `<div aria-hidden="true">` → le `<svg>` Recharts n'est plus traversable par les SR (le nom accessible reste sur le
    `div role="img"`, les données dans le `ChartDataTable` sr-only). Contrastes du bloc PH4-B tous MESURÉS PASS (a11y-auditor).
  - `BUDGET-NATURE-FREEFORM` ✅ **FAIT (2026-06-23)** : les 56 items de fixtures (testBudget + 6 personas) avaient des natures
    LIBRES ('Logement', 'Alimentation', 'Épargne' accentué…) violant l'union typée → tout tombait dans « Envie » + CELI/REER
    (`'Épargne'`≠`'Epargne'`) comptaient comme DÉPENSES (groupement, `coupleAnalysis`, ET les dépenses envoyées à l'IA/Dashboard/
    NextBestAction qui testent `=== 'Epargne'` exact). Normalisés vers la classe 50/30/20 (`name` garde le détail). Panel
    financial-integrity + code-reviewer = CORRECTION confirmée, 0 régression (2285 tests verts). Donuts 50/30/20 montrent enfin
    Besoins ≠ 0 (Léa : 37 % théo / 51 % réel). Vérifié au preview.
  - `HEALTH-SAVINGS-RATE-DIVERGENCE` (découverte panel BUDGET-NATURE-FREEFORM, **pré-existant, à trancher**) :
    `components/dashboard/HealthIndicator.tsx:93` somme TOUS les postes (épargne incluse) dans `monthlyExpenses` → le **taux d'épargne**
    est sous-estimé, alors que `portfolio.computeMonthlyBudgetAggregates`, `useDerivedFinancials`, `NextBestAction` EXCLUENT
    `nature==='Epargne'`. Même divergence « 2 calculs sur la même donnée la traitent différemment » que la leçon PH4D-BUDGET-RATIOS.
    Fix = exclure l'épargne du `monthlyExpenses` du HealthIndicator (money-display → panel financial-integrity).
- **Santé financière** retravaillée · **mode couple** plus concret · **détail de ce que CHAQUE conjoint sort**
  comme argent.
- **Abonnements** : les voir (peut-être un onglet dédié avec les **dates** d'abonnement).
- **Personas de test** : tous retravaillés pour **marcher sur TOUTES les pages** (tous les critères cochés).
  ✅ **FAIT (R6, 2026-06-22)** : `isActive:true` sur les childGoals (coupleConfort/autonomeMono) + `setupOptOut` par persona
  (6 personas) + micro-actif CELI (lea/coupleDettes). Garde-fou `tests/components/setup/personaGates.test.ts` (7 personas ×
  pages data, source unique `PAGE_SETUP`+`REQUIREMENTS`). Actions/Assistant restent gated = clé API (par design).
  - `PERSONA-ASSET-PERF` (découverte R6, **pré-existant, hors scope**) : les actifs de TOUS les personas omettent
    `performance`/`currency` (le type `Asset` les exige, mais `TEST_ASSETS` + les inline trichent via `as unknown as Asset[]`)
    → `AiAssistant.tsx:83` rend `+undefined%` + tri NaN en mode test AVEC clé API. Fix propre = garder `(a.performance ?? 0)`
    côté AiAssistant et/ou compléter les actifs des personas. (Mes 2 micro-actifs R6 sont déjà complets.)

### Plan — `ITEM-2C` (gates de timing par conjoint, money-critical)
- **Problème** : FERR 72 / reset REER 71 / bonus PSV 75+ sont bloqués par un pool REER MÉNAGE + un âge principal
  unique (`taxJanuary.ts:173` `ctx.age>=72`, `ctx.age`=`users[0].age` projection.ts:177) → timing per-conjoint impossible.
  ⚙️ **Décisions Marc (2026-06-25)** : cadence phase-par-phase (OK entre chaque) ; clé de répartition REER par conjoint =
  `rrspContributed` historique [(a)] ; re-baselining golden en Phase 2 = OK (justifié vs ARC + discriminant).
- **Phase 0** ✅ **FAIT (2026-06-25)** : `tests/services/projection.item2c.golden.test.ts` — golden de caractérisation
  (5 scénarios : couple 70/64, 64/70, 70/70, solo 70, **76/64 PSV-bonus**) pinnant FERR + nw + tax. Ancres zéro-régression
  (equal/solo) + **signatures du bug NON-VACANTES** (`(70/64)≡(70/70)` ; `(64/70)` ferr=mois 96 — casseront au fix Phase 2).
  Panel projection-validator + code-reviewer ✅. ZÉRO changement moteur. ⚠️ Bonus PSV 75+ = MÊME bug structurel (borné).
- **Phase 1+2 FERR** ✅ **FAIT (2026-06-25, choix Marc « option 3 » = plomberie+flip 1 PR)** : `taxJanuary.ts` boucle sur
  `reerByUser` + âge par conjoint (chaque conjoint de 72+ convertit SA part au facteur RRIF de SON âge) ; `projection.ts`
  débite la part FERR de chaque conjoint dans le registre (qui passe de SHADOW à PILOTE). Défaut additif (âges égaux ⇒
  Σ=`reer×rate`, ancres golden equal/solo INCHANGÉES). Golden age-gap re-basés SCIEMMENT + preuves-de-fix (discriminant
  git-stash : 5/7 échouent sur l'ancien code). ⚠️ **Bug CRITIQUE trouvé au panel + corrigé** : flux fiscal FANTÔME au DÉCÈS
  (la part du défunt FERR-convertissait comme un mort de 100 ans → +63 k$ sur le survivant) → roulement REER conjugal
  `reerByUser=[Σ,0]` au `survivorMode`. Panel financial-integrity + projection-validator + silent-failure + code-reviewer ✅.
  Repli `birthYear` pour le conjoint sans `age` + 2 tests unitaires per-conjoint. Conservation 20/20.
- **Sous-phase PSV/RRQ per-conjoint** ✅ **FAIT (2026-06-25, plan-first OK Marc)** : `rrqMonthly`/`psvMonthly` (`retirementIncome.ts`)
  passés en SOMME per-conjoint — le DÉPART RRQ/PSV (`age_i >= startAge`) ET le bonus PSV 75+ sont évalués à l'âge de CHAQUE conjoint,
  sur SA part (`base/N × poids_i`). Modèle d'âge RELATIF `ctx.age + (âgeDépart_i − âgeDépart_0)` (symétrique âges égaux, golden inchangé,
  10 tests `retirementIncome` préservés — cf leçon CLAUDE.md). Mode SURVIVANT = modèle familial INCHANGÉ (per-conjoint au décès =
  raffinement à part) → zéro impact FISC-SURVIVOR. Golden : `couplePsvBonus` (76/64, bonus sur user1 seul) + `couplePsvStartGap` (66/63,
  PSV de user2 à SES 65) re-basés + preuve-de-fix `(66/63)≠(66/66)`. Discriminant git-stash (4/9). Conservation 20/20.
  **Panel 4 agents → 3 fixes intégrés** : (a) SRG gaté sur `psvMonthly > 0` (au lieu de l'âge user1) — un couple à écart d'âge où
  l'AÎNÉ touche la PSV mais user0 < 65 avait à tort un SRG nul (bug $ réel exposé par le per-conjoint) ; (b) repli `ctx.age` pour un
  conjoint sans age/birthYear (évite d'amputer sa rente en silence) ; (c) `returnProfile` PIN re-piné (−476 $ légitime, couple 35/33).
- **RESTE — reset REER 71 per-conjoint** : `rrspRoomDelta`/`rrspRoomReset` (`taxJanuary.ts`) restent sur l'âge user1 (impact $ ~nul
  pour les retraités sans cotisation). À traiter si besoin (faible priorité). + per-conjoint PSV/RRQ AU DÉCÈS (raffinement du modèle survivant).

### Plan — Tables fiscales « montant pour personne vivant seule » (QC TP-1.G)
- **Problème** : le montant pour personne vivant seule (crédit QC) est absent du code ET de `FISCAL_REFERENCE`.
- **Phase 0** : transcrire la grille TP-1.G **datée + sourcée** dans `FISCAL_REFERENCE.md` (jamais de chiffre deviné).
- **Phase 1** : appliquer le crédit aux ménages **1 adulte** (et la majoration applicable) dans `calculateFiscalReport` ;
  test discriminant (un single 65+ bas revenu voit le crédit) ; panel fiscal. Effort S/M une fois la grille fournie.

---

## 🎛️ Audit UX 2026-06-17 (VALIDÉ — voir `docs/AUDIT_UX_2026-06-17.md`)
> Audit externe (rendu headless, 7 personas, 14 pages) **validé claim par claim** par panel de 5 agents
> (preuve `fichier:ligne`). Robustesse app = 0 plantage. Cœur money-critical = sain (les 2 « bugs de chiffres »
> sont un libellé + un persona insoutenable, pas des erreurs de calcul). Vrais chantiers = formatage $,
> archi de l'info, mode discret. ⚠️ Verdict en tête de chaque item. 🧭 = décision Marc.

### 🔴 Présentation money-critical (valeurs justes, mais trompeuses)
- [x] **[FMT-CURRENCY-UNIFY]** ✅ MEDIUM (2026-06-17) — montants `$` formatés à la main (floats en-US, sans
  séparateur, décimales variables) routés par `formatCAD`/`formatSigned`/`formatCompactCAD`. **Part 1** (#338) :
  `DebtManager` + `BudgetGroupTable` + garde test discriminante (`/\d{4,}\$/` rejeté, prouvé via `git stash`).
  **Part 2** : `TaxCenter`, `Budget`, `Retirement`, `LifeEvents`, `Investments`, `Planning`, `DividendPanel`,
  `Transactions`, `Travel` (9 fichiers, ~50 sites ; signés via `formatSigned`, axes/KPI via `formatCompactCAD`).
  Laissés à dessein : `AiAssistant` (≈10 `toLocaleString` dans les PROMPTS LLM, pas de l'affichage), dates,
  export CSV, inputs éditables. Reste 0 `toLocaleString` monétaire hors prompt. Convention figée dans CLAUDE.md
  (« formatCAD = seul formateur $ »).
- [x] **[LABEL-NW-SUCCESSORAL]** ✅ MEDIUM (R1, 2026-06-19) — l'écart « projection Budget ≠ reste » est un **libellé**,
  pas un calcul : Budget affiche `estateNetWorth` (patrimoine **successoral**, net d'impôt au décès + NPV rentes,
  `estateCalculation.ts:195`) vs `chartData[dernier].NetWorth` ailleurs. Source unique RESPECTÉE. 🧭 Décision :
  soit Budget affiche aussi le NW fin-horizon (parité stricte), soit clarifier « successoral » vs « fin
  d'horizon » partout (libellés + infobulle). PAS un correctif moteur. ≠ `[NW-PARITY-INVARIANT]`.
  ✅ RÉSOLU (R1, décision Marc = clarifier) : « Patrimoine successoral, avec rentes » + tooltip (prop `tooltip` ajouté à `KPIStat`)
  sur 5 sites (FutureProjection KPI, Budget, StressTestPanel, GoalSeekerCard `title`, prompt AiAssistant). Fallback conditionné
  (libellé neutre « Patrimoine projeté » si `estateNetWorth`=0, sinon « avec rentes » mentirait). a11y durcie (`Tooltip` : `aria-describedby` sur l'enfant + Échap).
- [x] **[PROJ-INSOLVENCY-BADGE]** ✅ MEDIUM (PR #358, 2026-06-18) — onglet Futur : badge danger « Plan insoutenable —
  capital épuisé vers X ans » dès que le patrimoine net projeté franchit 0 (vs −1,88 M$ nu anxiogène). Helper pur
  `utils/insolvency.ts` `findInsolvencyPoint(chartData)` (1er point `NetWorth<0`, ignore le passé/NaN ; 7 tests) +
  `<Badge>` dans le `<PageHeader>` (wrap `role="status"` pour l'annonce SR). Métrique ≠ Retraite (`TotalCapital≤0`).
  Âge affiché en clair (cohérence Retraite, ≠ montant → non masqué en mode discret — finding code-reviewer). Plan
  solvable → aucun badge (empty state honnête). Panel code-reviewer + a11y-auditor.
- [x] **[A11Y-BADGE-PROMINENCE]** ✅ LOW (PR #375, 2026-06-19) — **Option B (décision Marc)** : bordure RENFORCÉE
  (fond `*-bg` inchangé à 0,10). `components/ui/Badge.tsx` : `border-*-border` (accent à 0,30) → `border-*-400/55`
  (accent saturé à 0,55) sur les 6 variants ; `border-white/10`→`/25` (neutral), `border-primary/30`→`/55` (primary).
  Badge-only : on ne touche PAS le token partagé `*-border` (utilisé par ProjectionControls/IntegrationsSection).
  Contraste badge↔page remonté (WCAG 1.4.11) ; texte déjà AA inchangé. Classes générées vérifiées (build propre).

### 🟠 Architecture de l'information
- [ ] **[IA-NAV-CONSOLIDATE]** 🧭 ⏳ ✅VÉRIDIQUE — **14 destinations** (Argent 3 · Plan 4 · Objectifs 3 · Outils 3
  + Config, `Layout.tsx:67-106`) ; recouvrements (Futur/Retraite/Prochaine-action = même projection) ; 2-4
  coquilles par persona. Cible : ~6 dest. (Accueil · Budget · Patrimoine · Futur · Impôts&Docs · Réglages).
  Gros chantier nav (routes, deep-links, tests) → **plan-first + OK Marc**.
- [x] **[IA-DEDUP-COMPLETUDE]** ✅ LOW (2026-06-17) — `<SetupHub />` retiré de `Profile.tsx` ; reste UNIQUEMENT
  dans Configuration (`Settings.tsx:166`). Profil = uniquement les champs à remplir (réversible : 1 import + 1 balise).
- [x] **[IA-ASSETLOC-PERSIST]** ✅ LOW (2026-06-17) — ⚠️ **finding RÉVISÉ après lecture du code** : l'éditeur
  de holdings (`AssetLocationCard`) n'est PAS un éditeur de portefeuille mais un **bac-à-sable what-if** (titre
  « Optimizer », bouton « ↺ Depuis portefeuille », recommandations live) → l'état local non persisté est VOULU.
  Le « fix read-only/persister » aurait CASSÉ l'outil. Vrai risque = CLARTÉ → note « Simulation : ne modifie pas
  ton portefeuille réel, édite-le dans Investissements ». (Discipline : vérifier AVANT de coder un « fix ».)
- [x] **[UI-SCORES-UNIFY]** ✅ MEDIUM (2026-06-17, choix Marc) — collision « deux Santé /100 » résolue :
  `HealthIndicator` « Santé financière /100 » (Accueil, agrège 4 ratios) = LE score global ; le badge
  Investissements « Santé /100 » (qui mesurait la diversification) renommé **« Diversification /100 »**
  (variable `healthScore`→`diversificationScore` + `title` « sous-mesure… le score global est sur l'Accueil »).
  `Efficacité fiscale /100` (AssetLocation) et `Complétude %` (SetupHub) sont déjà des sous-mesures sur des
  axes distincts → laissées. Pas de changement de formule.
- [ ] **[UI-TABS-RICH]** 🔧 ◑PARTIEL MEDIUM — généraliser le pattern sous-onglets (déjà sur Investissements ET
  Configuration) à **Retraite** (4 outils empilés `Retirement:199-230`) et **Profil** (long scroll). Plan-first.

### 🔒 Vie privée & sécurité
- [~] **[PRIV-DISCRET-DOM]** 🔧 ✅VRAI MEDIUM — **KEYSTONE LIVRÉ (2026-06-17, choix Marc = •••)** : les primitives
  `PrivateAmount` + `PrivateBlock` (+ `KPIStat`) MASQUENT désormais la valeur par « ••• » → la vraie valeur n'est
  **plus dans le DOM** en mode discret (fin de la fuite copier-coller/inspecteur/SR). **Survol-révèle RETIRÉ**
  (`.privacy-blur:hover` supprimé de `Layout.tsx`). **RESTE** = `[A11Y-D6-SR-2]` ph.3 : migrer les ~69 spots BRUTS
  `privacy-blur` restants → `PrivateAmount` (ils floutent encore, mais SANS survol-révèle) pour que TOUTE valeur
  masquée sorte du DOM. Les graphes (axes/tooltips Recharts) floutent encore (à traiter avec `[A11Y-CHARTS]`).
- [x] **[SEC-CSP-HEADER]** ✅ LOW (2026-06-17) — `frame-ancestors` retiré du `<meta>` CSP (`index.html`) :
  ignoré en meta par spec → ne servait qu'à émettre un warning console. Protection anti-clickjacking intacte
  via `vercel.json` (CSP HTTP `frame-ancestors 'none'` + `X-Frame-Options: DENY`, vérifié). Pas une faille.

### 🟡 Polish UI / onboarding / viz
- [ ] **[IA-NAV-LABELS]** 🔧 ✅VÉRIDIQUE MEDIUM — sidebar `w-16` par défaut, libellés `opacity-0`
  (`Layout.tsx:343`) ; icônes cryptiques (éclair/boussole/palmier). Un `title` existe mais labels invisibles
  par défaut → rendre les libellés visibles par défaut (ou rail plus large).
- [x] **[FMT-CASING-ACCOUNTTYPE]** ✅ **FERMÉ PÉRIMÉ (workflow backlog-verify 2026-06-26)** — re-confirme l'analyse #351 ci-dessous : bug THÉORIQUE (union stricte majuscules, tsc garantit la casse), 3 classifieurs distincts ≠ duplication → helper = anti-YAGNI. Historique conservé :
  casse incohérente `CRYPTO`(enum)
  /`Crypto`(clé chart), `NON-ENREG`/`NonReg`, mappée à la main (`Dashboard.tsx:290-291`) = **bug latent**.
  Une seule fonction `accountTypeToChartKey()`. (dedup CELI/REER déjà corrigé — `new Set`.) ⚠️ **Analyse
  2026-06-17** : le pattern `=== 'CRYPTO'`/`'NON-ENREG'` vit dans 3 fichiers (`Dashboard` chart-keys,
  `TaxCenter` + `AssetLocationCard` = traitement FISCAL, pas le même mapping) → extraction = refactor plus
  large que « LOW » (constante d'enum partagée + helper). À regrouper avec `DETTE-UI-PRIMITIVES`/un nettoyage
  enum dédié, pas en quick-win. ⚠️ **Vérif 2026-06-18 (PR #351) : le bug de CASSE est en fait THÉORIQUE** —
  `accountType: RegisteredAccountType` est une UNION STRICTE (`'CELI'|'CELIAPP'|'REER'|'NON-ENREG'|'CRYPTO'|'REEE'|
  'MARGE'|'AUTRE'`, tout en majuscules) → tsc garantit la casse, aucun `CRYPTO`/`Crypto` runtime possible. Et les
  3 sites sont des CLASSIFIEURS DISTINCTS (Dashboard keyToAccount, TaxCenter filtre non-enreg, AssetLocationCard
  3-buckets), pas une duplication réelle → un helper = abstraction spéculative (anti-YAGNI). **Déclassé.**
- [x] **[UI-TX-CLEANUP]** ✅ LOW (2026-06-17) — colonne **AUTO** auto-documentée : en-tête avec `title`
  explicite (code couleur vert ≥90 % / jaune ≥70 % / rouge <70 %) + glyphe `ⓘ` visible signalant l'info ;
  les pastilles gardent `title`/`aria-label` par ligne. Colonne TYPE = artefact data (laissée, non prioritaire).
- [x] **[GATE-CTA-CONTRAST]** ✅ LOW (2026-06-17) — MESURÉ : le TEXTE du CTA était déjà ~12:1 (description « gris
  foncé » de l'audit inexacte), MAIS le FOND `bg-primary/15` (#282B2F) vs page `bg-dark` (#07090D) ≈ 1,3:1 → le
  bouton ne RESSORTAIT pas (CTA fantôme). Fix on-brand : CTA **solide** `bg-primary text-dark` (prominent, ~14:1)
  + `focus-ring` ajouté (indicateur de focus manquant). Pas de vert introduit (cohérence palette).

### ✗ Faux (validés FAUX — impression seule, effort minimal / rien à coder)
- [ ] **[ONB-OVERLAY-SEQ]** 🔧 ✗FAUX→perception LOW — PAS 3 overlays simultanés (onboarding plein écran
  exclusif ; backup exige `hasData`). Mais tour (700 ms post-onboarding) + ConsentBanner **peuvent** coexister
  → option : ne pas auto-lancer le tour (cf `[ONB-TOUR-OPTIN]`) ou retarder le bandeau de consentement.
- [ ] **[ONB-TOUR-OPTIN]** 🔧 ✗FAUX→perception LOW — le tour 15 étapes se lance **après** l'onboarding (pas au
  1er écran ; bouton Passer présent). Perception : auto-lancement non sollicité → le rendre opt-in (bouton
  « Visite guidée »). Lié à `[IA-NAV-CONSOLIDATE]` (le tour est un symptôme de la nav éparpillée).
- [ ] **[NAV-IA-GATE-MSG]** 🔧 ✗FAUX→perception LOW — « Assistant IA » route correctement
  (`TabRouter:277-291`) ; l'auditeur a heurté `PageSetupGate` (profil non configuré). Perception « page
  cassée » → message clair « configure ton profil pour débloquer l'Assistant IA » sur la gate.
- **Rien à coder (validés FAUX, artefacts data)** : `GATE-VALUE-PROP` (value-prop déjà avant le bouton),
  `UI-DETTES-TITLE` (titre fixe « Gestion de la Dette »), `BUD-CATEG-DEFAULT` (`migrateBudgetItems` classe
  l'épargne correctement — données de test), `VIZ-LEGEND-DEDUP` `TOTAL PORTEFEUILLE ×5` (artefact CSV).

---

## 🚀 MCP FinanceAI → Cloud Run [⏳ gros chantier] (brief Marc 2026-06-16, RELANCÉ 2026-07-13)
> Le serveur MCP perso FinanceAI (finances : Drive/BigQuery, comptes CELI/REER/CELIAPP/REEE) tourne en
> local (stdio), token Google en **fichier**. **Symptôme** : `get_financial_overview` → `invalid_grant`
> (« Token has been expired or revoked ») alors que `ping` répond. **But** : serveur **distant** hébergé sur
> **Google Cloud Run**, stable, sécurisé, redéployé à chaque push. **Code : dossier `mcp/`.**
> ⚠️ **PLAN-FIRST** : phase 0 (explore + rapport) AVANT tout code ; **OK Marc requis avant la phase d'écriture.**
> ⚠️ **DEUX OAuth distincts** : **A** = serveur ↔ Google (lire les finances Drive/BigQuery — c'est CE token qui
> est mort, à persister hors disque + rafraîchir) ; **B** = Claude ↔ serveur (auth du connecteur — Bearer
> d'abord, architecture prête pour OAuth 2.1 plus tard). NE PAS les confondre.
>
> **RELANCE 2026-07-13 (choix Marc : claude.ai web/mobile direct)** — plan validé en 4 lots :
> Lot 1 `[MCP-WHATIF]` (tools what-if + séries, indépendant de l'hébergement) → Lot 2 `[MCP-CLOUDRUN-HTTP]`
> → Lot 3 `[MCP-CLOUDRUN-A]`+`[MCP-CLOUDRUN-B]` → Lot 4 `[MCP-CLOUDRUN-DEPLOY]` (+ MAJ carte « Connecter à
> Claude » de l'app, qui pointe vers un `.mcpb` jamais hébergé — rappel Marc 2026-07-13).
> ⚠️ **Phase 0 REFAITE 2026-07-13, correction au brief** : l'UI connecteurs custom de claude.ai n'a PAS de
> champ Bearer statique (OAuth 2.0 seulement : Authorization URL, Token URL, Client ID/Secret en advanced
> settings ; `static_headers` = bêta réservée aux orgs Team/Enterprise) → **Auth B = mini serveur OAuth 2.1
> mono-utilisateur (PKCE)**, pas un middleware Bearer. `[MCP-CLOUDRUN-ROOT]` (consentement en Production)
> = ✅ RÉGLÉ par Marc 2026-07-06. Marc a confirmé : PAS de passphrase sur le coffre (DriveStateSource OK).

- [x] **[MCP-CLOUDRUN-0]** ✅ **FAIT 2026-07-13** (phase 0 refaite : stack TS `@modelcontextprotocol/sdk`,
  entrée `mcp/stdio.ts`, 15 tools, token Drive en `~/.financeai-mcp/credentials.json` scope `drive.appdata`,
  flux `access_type=offline+prompt=consent` ; rapport livré à Marc en session, plan 4 lots OK). Détail original :
  langage/framework MCP (FastMCP Python ? `@modelcontextprotocol/sdk` TS ? autre ?) ; transport actuel +
  entrée du serveur ; où/comment le token Google est lu/écrit (fichier ? chemin ? lib OAuth ?) ; où vivent
  `client_id`/`client_secret` (clair ? `.env` ?) ; scopes Google + `access_type`/`prompt` ; **liste
  exhaustive des outils MCP exposés** (pour ne rien casser). → rapport court + plan → **attendre l'OK Marc**.
- [x] **[MCP-WHATIF]** ✅ **Lot 1 FAIT 2026-07-13 (PR de cette session)** — demande Marc : « si j'achète une
  voiture demain, comment ça affecte mes finances, avec des chiffres précis de l'app et des graphs, aucun
  chiffre inventé ». Nouveau tool data-aware `simulate_what_if` (`mcp/whatIf.ts` pur + `mcp/tools/
  simulateWhatIf.tool.ts`) : changements hypothétiques (achat ponctuel/financé, salaire, dépense récurrente,
  nouvelle dette, achat immobilier) traduits vers les VRAIES structures moteur (LifeEvent GROS_ACHAT, Debt,
  RealEstateGoal, users, calculatedMonthlySavings) → moteur roulé 2× (même `now`) → deltas à 1/2/5/10/20 ans
  + âge FIRE + impôts + hypothèses REMONTÉES (`assumptions`) + séries annuelles base/scénario pour graphs.
  + `get_projection` param `includeSeries` (série annuelle exacte). 20 tests (discriminants de MAGNITUDE
  économique : voiture 30 k$ → écart an 1 ∈ [−40k, −25k]). ⚠️ Piège évité : `totalClosingCosts` SANS taxe
  de bienvenue (le moteur ajoute `welcomeFees` lui-même, `realEstateMonth.ts:175` — l'inclure = double-comptage).
  **Panel 2026-07-13 (3 agents, findings MESURÉS et tous intégrés)** : mot réservé « vente » assaini (delta 0
  silencieux sinon) · `.finite()` + gardes `Number.isFinite` (Infinity passait Zod → impact fabriqué) · mois ISO
  construit comme le moteur (toISOString, pas composants locaux — fuseaux positifs décalaient d'un mois) ·
  changement daté hors horizon REJETÉ (avant : « succès » à effet nul) · financement différé REJETÉ (dettes sans
  date de début → −28 k$ quatre ans trop tôt) · mise de fonds > prix rejetée · hypothèses SCHL/retraite remontées.
- [ ] **[MCP-WHATIF-DATED-DEBT]** 🔧 LOW (suivi panel MCP-WHATIF 2026-07-13) — les dettes du moteur n'ont pas de
  date de DÉBUT (servies dès le mois 0) → le what-if rejette un achat FINANCÉ différé (`monthsFromNow > 1`).
  Pour le supporter : soit un champ `startDate?` sur `Debt` honoré par le moteur (plan-first, touche le moteur),
  soit une modélisation « flux de paiements » côté what-if. Décision Marc requise sur la sémantique.
- [ ] **[MCP-ENGINE-WARNINGS]** 🔧 LOW (suivi panel silent-failure 2026-07-13) — les `logErrorThrottled` du moteur
  (ex. « montant non fini → dépense ignorée ») partent dans un sink NAVIGATEUR (localStorage, no-op sous Node) →
  invisibles pour Claude côté MCP. Piste : `withState` collecte les logs moteur pendant le run et les remonte dans
  la réponse JSON (champ `engineWarnings`). Zéro impact app web.
- [ ] **[ENG-LIFEEVENT-VENTE-SUBSTRING]** 🔧 LOW (racine du finding « vente », pré-existant) — `applyLifeEvents`
  détecte une vente immobilière par SOUS-CHAÎNE `name.includes('vente')` : fragile pour tout producteur de
  LifeEvent non humain (MCP assainit déjà via `safeEngineName`). Piste : type d'événement EXPLICITE
  (`'VENTE_IMMO'` dans `LifeEventType`) + migration douce du fallback substring. Plan-first (touche le moteur).
- [x] **[MCP-CLOUDRUN-A]** ✅ **Lot 3 FAIT 2026-07-13** — `mcp/auth/credentialsBackend.ts` : backend
  d'identifiants FICHIER (local, inchangé) OU **Secret Manager** (`$FINANCEAI_GOOGLE_SECRET`) via metadata
  server + API REST (zéro dépendance npm) ; `save` réécrit une version (refresh token régénéré). `tokenProvider`
  prend le backend en injection + **`invalid_grant` traité** → message ACTIONNABLE (« Autorisation Google EXPIRÉE
  ou RÉVOQUÉE… reconnecte »). `bootstrap` sélectionne le backend selon l'env. 404 secret = « pas autorisé »
  (pas une panne). Test Secret Manager avec fetch simulé (round-trip base64, metadata absent → erreur claire).
- [x] **[MCP-CLOUDRUN-B]** ✅ **Lot 3 FAIT 2026-07-13** — `mcp/auth/oauthProvider.ts` : mini serveur OAuth 2.1
  MONO-USER **STATELESS** (Cloud Run scale-to-zero : rien en mémoire) — tokens = payload JSON signé HMAC-SHA256
  (`$FINANCEAI_OAUTH_SIGNING_KEY`), DCR sans base (client_secret = HMAC(client_id)), PKCE **S256 obligatoire**,
  redirect_uri sur allowlist (claude.ai/claude.com + loopback) lié au code, rotation du refresh (OAuth 2.1). La
  « porte » = **clé d'accès** unique (`$FINANCEAI_ACCESS_KEY`) constant-time sur une page HTML. Endpoints `/oauth/
  authorize` (form GET + POST), `/oauth/token`, `/oauth/register`, `/.well-known/oauth-authorization-server` +
  `/.well-known/oauth-protected-resource` (RFC 8414/9728) ; garde Bearer sur `/mcp` (toutes méthodes) → 401 +
  `WWW-Authenticate` pointant la découverte. Activé quand `SIGNING_KEY`+`ACCESS_KEY` présents (l'un sans l'autre
  = refus de démarrer). 21 unités OAuth + flux e2e HTTP complet (register→authorize→code→token PKCE→tools/call).
- [x] **[MCP-CLOUDRUN-HTTP]** ✅ **Lot 2 FAIT 2026-07-13** — `mcp/http.ts` (node:http pur, zéro dépendance
  ajoutée) : endpoint unique `/mcp` (POST/GET/DELETE, sessions `StreamableHTTPServerTransport` du SDK,
  `enableJsonResponse`, balayage sessions inactives 1 h, cap 32) + `/health` ; `$PORT` (Cloud Run) → `0.0.0.0`,
  local → `127.0.0.1` + anti-DNS-rebinding ; SIGTERM/SIGINT propres ; `mcp/bootstrap.ts` factorise la source
  d'état (partagée stdio/http) ; version 0.4.0→0.5.0. Le switch stdio|http = 2 entrées + scripts npm
  (`mcp:dev`/`mcp:http`) plutôt que `MCP_TRANSPORT` (plus simple, même effet). 9 tests e2e (vrai serveur,
  vrai protocole). ⚠️ SANS auth → ne pas exposer avant Lot 3 (A+B).
- [ ] **[MCP-CLOUDRUN-AUTH-HARDENING]** 🔧 CONDITIONS pré-exposition (panel sécurité Lot 3, 2026-07-13, à trancher
  au Lot 4) : (1) **rate-limit** sur `POST /oauth/authorize` (brute-force de la clé d'accès — Cloud Armor ou compteur) ;
  (2) `FINANCEAI_ACCESS_KEY` GÉNÉRÉE par `crypto.randomBytes` (documenté README, pas juste « ≥16 car. ») ; (3) single-use
  code + rotation refresh sont **best-effort mémoire** (mono-instance) → si multi-instance un jour, `jti` consommés dans
  un store partagé (Firestore/Memorystore TTL) ; kill-switch d'incident = rotation `FINANCEAI_OAUTH_SIGNING_KEY` (à
  documenter dans le runbook) ; (4) `min-instances 1` recommandé pour ne pas vider le set de `jti` à chaque cold-start.
- [x] **[MCP-CLOUDRUN-DEPLOY-LOGS]** ✅ RÉSOLU 2026-07-13 — l'email Drive est tronqué au domaine dans les logs
  (`bootstrap.describe()` : `…@domaine`), session-ids tronqués (Lot 2). Case cochée (panel a confirmé le code déjà en place).
- [ ] **[MCP-CLOUDRUN-DEPLOY-LOGS]** 🔧 CONDITION pré-déploiement (panel security-privacy 2026-07-13) : avant
  d'exposer les logs à Cloud Run, retirer/tronquer l'EMAIL Drive du log de démarrage (`bootstrap.describe()`)
  — les session-ids sont DÉJÀ tronqués à 8 caractères (fait au Lot 2). + MAJ carte « Connecter à Claude » de
  l'app (Réglages → Système) pour décrire le branchement claude.ai (rappel Marc 2026-07-13).
- [x] **[MCP-CLOUDRUN-DEPLOY]** ✅ **Lot 4 FAIT 2026-07-13** — `mcp/Dockerfile` (node:22-slim, copie mcp/services/
  utils/types/constants — fermeture d'import PROUVÉE minimale, USER node, `npx tsx mcp/http.ts`, EXPOSE 8080) +
  `.dockerignore` (exclut front/tests/secrets) + `mcp/deploy.sh` (`gcloud run deploy --source`, région Montréal,
  `--set-secrets` ×2 OAuth + `FINANCEAI_GOOGLE_SECRET` env, `min-instances 1`, 2 passes pour injecter
  `FINANCEAI_PUBLIC_URL`) + `.github/workflows/deploy-mcp.yml` (déploiement continu via WIF, garde `if
  vars.GCP_PROJECT_ID`) + README pas-à-pas GCP (clés `randomBytes`, 3 secrets, IAM secretAccessor, branchement
  claude.ai) + carte « Connecter à Claude » (`ClaudeConnectorCard.tsx`) gagne une section web/mobile
  (`VITE_MCP_SERVER_URL`). **Actions Marc restantes** (dans A_FAIRE_MOI) : créer projet GCP + 3 secrets + IAM +
  lancer `deploy.sh` + coller l'URL dans claude.ai. **Spec d'origine ci-dessous (référence) :**
- **[MCP-CLOUDRUN-DEPLOY — spec]** Dockerfile (EXPOSE 8080, démarre sur `PORT`) +
  endpoint `/health` → 200 ; `deploy.sh` (`gcloud run deploy`, région **northamerica-northeast1**,
  `--min-instances 0`, `--set-secrets` ×3) ; workflow **GitHub Actions** (`google-github-actions/deploy-cloudrun`)
  qui redéploie sur push `main` ; README (créer les 3 secrets, publier l'OAuth consent en Production, déployer,
  brancher le déploiement continu, brancher Claude : Settings → Connectors → custom connector URL
  `https://…run.app/mcp` + clé Bearer en advanced settings, retrait de l'ancien MCP local).
- **Critères d'acceptation** : `docker build` + `docker run -e PORT=8080` démarre en HTTP local ; appel MCP
  GET/POST `/mcp` répond, **sans Bearer → 401** ; token lu depuis Secret Manager (jamais fichier ; `grep` = 0
  secret clair) ; `get_financial_overview` OK une fois un refresh token valide en place ; **tous les outils MCP
  préexistants encore enregistrés** (lister avant/après) ; `/health` → 200 ; workflow Actions valide (dry-run).
- **Contraintes** : ne PAS renommer outils/signatures ; jamais de secret commité (vérifier `.gitignore`) ;
  petits commits atomiques + explication ; **branche, pas `main`** ; décision Marc (région/nom service/scopes)
  → demander au lieu de supposer.
- 🧭👤 **[MCP-CLOUDRUN-ROOT]** **CAUSE RACINE prioritaire (action Marc — Google Cloud Console)** : l'écran de
  consentement OAuth est probablement en mode **« Testing »** → le refresh token expire tous les **7 jours**
  (= la vraie cause du `invalid_grant`). **Publier l'app en Production** (OAuth consent screen). À rappeler
  comme étape OBLIGATOIRE dans le README. → aussi candidat à `A_FAIRE_MOI.md`.

## 💰 Audit money-critical 2026-06-16 (bug « -208 633 $/mois » — workflow + panel adversarial)
> Déclencheur : Marc voit un patrimoine net -193 398 $ / variation -208 633 $ avec revenu ~10,6 k$.
> Workflow multi-agents (12 finders + vérif adversariale 2 votes) → 9 bugs confirmés / 10 réfutés.
> **CLUSTER PATRIMOINE NET livré cette PR** (MONEY-PHANTOM). Reste à corriger (PRs ciblées, money-critical) :
- [x] **[MONEY-PHANTOM]** ✅ livré : découvert `liquidDebt` exposé+visible (modal « Dettes ») ;
  `rawNetWorth`/`prevNW`/succession soustraient activeDebts+smithDebt via source unique
  `computeRawNetWorth` ; `diffNW` exact ; garde NaN dette ; 9 invariants de conservation +
  checklist CLAUDE.md. (Cause racine = débit one-time réno/véhicule > actifs → dette invisible.)
- [x] **[FISC-REER-WHT-DOUBLE]** ✅ CRITICAL livré (2026-06-16) — **le « 50 000 au fisc » de Marc, CONFIRMÉ
  numériquement** : impôt cumulé d'un couple retraité (600 k$ REER) **266,6 k$ → 215,1 k$ sur 11 ans (−51 k$)**.
  Cause RÉELLE (≠ hypothèse du finding « net crédité ») : la retenue quittait le patrimoine au RETRAIT — le
  BRUT sort du REER et le crédit net est effacé par l'invariant **CF-2** de `cashflowAllocation.ts` — ET était
  re-débitée en avril via `.reer` → fuite ≈ retenue/mois (prouvée empiriquement : résiduel de conservation
  négatif chaque mois sur un retraité qui décaisse). Fix = retrait **NW-NEUTRE** : la retenue (acompte d'impôt)
  est CONSERVÉE au liquide jusqu'au règlement d'avril (`reerWithholdingPrepaid` réinjecté en CF-2 ; meltdown :
  `liquid += withholding`). FERR/immo créditaient déjà le brut = corrects (référence de cohérence). Garde
  permanente : **INV-10/INV-11** (`projection.moneyConservation.test.ts`) — conservation décaissement + meltdown,
  **DISCRIMINANTS prouvés** (échouent sur le code d'avant via `git stash`). Re-baseline `projection.survivor.test.ts`
  (le bug gonflait l'impôt du couple > celui du survivant). Panel : projection-validator + fiscal-accuracy (fix
  fiscalement CORRECT, palier 0 % désormais remboursé) + code-reviewer + silent-failure-hunter. ⚠️ LEÇON : le
  1er fix proposé (« shortfall -= brut ») NE conservait PAS (prouvé algébriquement + empiriquement) → c'est la
  CONSERVATION EMPIRIQUE (exécuter le moteur, mesurer ΔNW résiduel) qui a donné le vrai fix, pas l'analyse.
- [x] **[FISC-BROKE-LIQUID-FLOOR]** ✅ MEDIUM (livré 2026-06-17 ; découvert pendant FISC-REER-WHT-DOUBLE) —
  quand TOUS les actifs de décaissement sont épuisés (REER/CELI/nonReg/crypto = 0) mais qu'un coussin de liquidité
  protégé par `criticalThreshold` subsiste, un shortfall non couvert (`cashflowAllocation.ts:144-152`, branche `else`
  qui ne puise pas sous le seuil critique) ne puise PAS le coussin ET n'est PAS porté en `liquidDebt` (le rescue
  `projection.ts:~1309` ne s'arme que si liquide < 0). La dépense « s'évapore » : ΔNW ne baisse pas → résiduel de
  conservation = +shortfall/mois (mesuré ~+3,9 k$/mois sur un retraité à sec, après épuisement du REER). Peut-être
  un FLOOR voulu (éviter une spirale absurde une fois ruiné) MAIS viole la conservation. **Décision Marc = (b) porter
  en `liquidDebt`** (dette VISIBLE, coussin gardé). Fix : `cashflowAllocation.ts` expose `uncoveredShortfall` (résidu
  après cascade) ; `projection.ts` le porte en `liquidDebt` au site PRIMAIRE — zéro double-comptage avec le rescue
  PV-6 (ne s'arme que si liquid<0 ; après le primaire liquid reste au coussin ≥0, vérifié projection-validator +
  silent-failure-hunter). Garde : **INV-12** (`moneyConservation`), prouvé discriminant (résiduel 3496 $/mois sans le
  fix → ≈0 avec, via `git stash`). Chemin DISTINCT du fix REER (qui y était inerte ; INV-10/INV-11 = phase solvable).
### 🔬 Audit financier 2026-06-23 (findings vérifiés — `docs/AUDIT_FINANCIER_2026-06-23.md`)
> Cœur AAA CONFIRMÉ + élargi (conservation 29 scénarios résiduel ≤0,03 $, fiscalité 0 écart, FA-6 conforme). Findings de
> juin quasi tous FERMÉS. **Tout ci-dessous = PÉRIPHÉRIE** (durcissement défensif / affichage / sécurité au repos) — aucun
> n'altère la conservation ni un calcul fiscal du cœur. Lot 1 (sûr) d'abord, puis NaN-hardening (plan-first, touche le moteur).
- [x] **[NAN-INPUT-HARDENING]** ✅ **FAIT (2026-06-23, LOT 4)** — gardes `Number.isFinite` (rabattre sur 0/neutre) sur les VRAIS
  vecteurs : `retirementIncome.ts:173` (`?? 0`), `useDerivedFinancials.ts:51` (arith. nue), `monthlyEvents.ts:160` (`?? 0`),
  `w5Effects.ts:125` (rental `!== 0`), `helpers.ts:57+rateAnnual` (`NaN<=0`=false + taux NaN trouvé au panel), `portfolio.ts`
  (computeTotalDebt/AssetBreakdown/InvestmentsValue : `|| 0`→`Number.isFinite` pour Infinity). ⚠️ Faux positifs écartés (findings=hypothèses) :
  `portfolio:147` `||` rattrapait déjà NaN ; `taxDecember:600` DÉJÀ gardé ; `w5Effects:139` business sûr via `>0`. Tests discriminants
  (git-stash : échouent sans gardes) + **INV-8 corrigé** (était VACANT : `num()` sanitisait avant `isNaN`). Panel 4 agents ✅, conservation 19/19.
- [x] **[NAN-OBSERVABILITY]** ✅ **FAIT (2026-06-25)** — nouveau helper partagé `logErrorThrottled(signature, input)` (`errorLogger.ts`,
  1×/signature, calque le throttle de `computeRawNetWorth`) câblé aux 2 sites : `monthlyEvents.ts` (lifeEvent `impactAmount` non fini →
  `warning` throttlé par event id) et `useDerivedFinancials.ts` (actif valeur non finie → `warning` throttlé par `symbol`). 3 tests du throttle.
  Observabilité seule (la garde NaN prévient déjà la corruption). Conservation inchangée.
- [ ] **[NAN-MUTATOR-CENTRAL]** 🔧 LOW (suite LOT 4, panel projection-validator) — les 4 mutateurs nus (`addIncome`/`addExpense`/`addLiquid`/
  `subtractLiquid`, `projection.ts:717-754`) n'ont aucune garde centrale → des angles morts Infinity subsistent (`w5Effects:137` business,
  `stochasticEvents.ts:45/47/83`, `taxApril.ts:55`). Une garde unique dans ces 4 closures couvrirait tout en 1 endroit (vs gardes par-appelant).
  ⚠️ Infinity NON atteignable depuis le boundary UI (`parseFloat` rend NaN, jamais Infinity) → durcissement défensif, pas bug. Effort S.
  ⚠️ **Vérif workflow backlog-verify 2026-06-26 : VALIDE mais À DIFFÉRER** — `utils/numericInput.ts` `numOr`/`numOrUndef` (l.22/33) filtre déjà NaN
  **ET** Infinity via `Number.isFinite` au boundary → vecteur **inatteignable depuis la saisie** ⇒ valeur réelle FAIBLE (défensif pour futurs appelants/import JSON brut).
  Plan complet prêt en réserve (6 gardes `if (Number.isFinite(amt))` dans les closures `projection.ts:726-763` + test discriminant héritage=Infinity → NetWorth fini, étend INV-8 au chemin flux). À prendre seulement si un vecteur d'entrée non-UI apparaît.
- [x] **[WHT-DISPLAY-EXACT]** ✅ **FAIT (2026-06-26, panel financial-integrity + projection-validator + silent-failure + code-reviewer, tous APPROVE)** —
  `totalTaxesPaid` (compteur d'affichage) : (a) nouveau champ `CashflowState.rrspWithholdingMois` = SOMME des retenues PAR TIRAGE déjà
  calculées par la cascade `drawReer` (cumulé/mois, round-trip buildCashState/applyCashState, reset 0 chaque mois). `projection.ts` passe de
  `withholdingForGrossRRSP(retraitReerMois)` (recalcul sur le brut MENSUEL agrégé) à `rrspWithholdingMois` → exact au cent près ET aligné sur la
  retenue réellement provisionnée (`taxCurrentYear.reer`). (b) fonction locale `rrspWithholding` (cashflowAllocation) SUPPRIMÉE → source unique
  `withholdingForGrossRRSP` (refactor PUR, math identique). Découplage CF-2 : le restore du liquide utilise le DELTA de l'appel courant
  (`rrspWithholdingMois − rrspWithholdingAtStart`) pour rester correct au 2ᵉ appel (sauvetage de découvert PV-6). Mesuré (git-stash) :
  270 087 → 269 132 $ (−955 $, l'agrégat sur-estimait, barème non additif). Test discriminant unitaire (3 tirages palier 1, somme franchit le palier 2)
  prouvé RED→GREEN. Compteur de display/ranking, **aucun impact NW** ; conservation 12 invariants verte, suite 2330/2330.
- [ ] **[WHT-DISPLAY-MELTDOWN]** 🔧 LOW (découverte silent-failure-hunter, suite WHT-DISPLAY-EXACT 2026-06-26) — le compteur d'affichage
  `totalTaxesPaid` n'inclut PAS la retenue REER du **meltdown** (`meltResult.withholding`, `projection.ts:~1352`) : elle est bien provisionnée
  dans `taxCurrentYear.reer` (NW correct, conservation OK) mais le compteur de display sous-estime pour un user en stratégie `MELTDOWN_REER`.
  Pré-existant (l'ancien `withholdingForGrossRRSP(retraitReerMois)` ne l'incluait pas non plus — le meltdown n'alimente jamais `retraitReerMois`).
  Fix candidat : `rrspWithholdingMois += meltResult.withholding` à côté de `taxCurrentYear.reer += meltResult.withholding`. ⚠️ Change le ranking
  de stratégies + golden → discriminant `git-stash` + mesure OBLIGATOIRES. Aucun impact NW.
- [ ] **[FISC-REEE-AIP-MODEL]** 🔧 LOW (découverte financial-integrity, suite REEE-LITERALS 2026-06-26) — l'impôt PRA à la fermeture du REEE
  (`childrenReee.ts`, `REEE_AIP_TAX_RATE=0.20` × `reeeNewBalance`) frappe le SOLDE TOTAL à 25 ans, alors que l'impôt sur le Paiement de Revenu
  Accumulé officiel ne vise QUE la portion revenu accumulé (gains, pas les cotisations remboursées sans impôt) + une SURTAXE 20 % (12 % féd
  + 8 % QC) en SUS de l'impôt ordinaire. Approximation de modèle (déjà marquée comme telle). Raffiner = séparer cotisations/gains + modéliser
  la surtaxe. ⚠️ money-critical (touche `taxDiversAdd`) → discriminant + panel. Effort M.
- [x] **[TC-FX-HARDCODE]** ✅ **FAIT (2026-06-23, LOT 3)** — `TaxCenter.tsx` : FX USD/EUR via `useFinanceStore(s=>s.fxRates)` (helper
  `fxOf` + garde `Number.isFinite`, CAD=1) au lieu de `1.38` figé ; rendements `0.02`/`0.07` → constantes `EST_DIVIDEND_YIELD`/
  `EST_CAPITAL_GAINS_YIELD` ; `0.5` → `CAPITAL_GAINS_INCLUSION_STANDARD` ; garde `(qty||0)*(price||0)`. Panel financial-integrity ✅
  (sens FX correct, `taxableAddOn` confiné à l'affichage TaxCenter, zéro fuite vers le moteur source-unique).
- [x] **[SEC-PRIVACY-BLUR-INPUTS]** ✅ **FAIT (2026-06-23, LOT 2)** — nouveau `components/ui/PrivateNumberInput.tsx` (focus-to-edit :
  `•••` hors DOM en mode discret hors-focus, vrai `<input>` au clic/focus clavier, re-masque au blur ET si le mode discret est
  (ré)activé en cours d'édition). Appliqué à `BudgetGroupTable` (1 champ) + `RetirementIncomeCard` (2 champs). `id` propagé au
  bouton (label `htmlFor` préservé), `focus-ring` + `min-h-[24px]`, focus programmatique via ref. Panel a11y + security-privacy ✅.
- [x] **[SEC-PRIVACY-RETIREMENT-RRQ-PSV]** ✅ **FAIT (2026-06-23)** — `RetirementIncomeCard.tsx` : les 2 `<input>` `rrqEstimateMonthly`/
  `psvEstimateMonthly` (montants de rente = PII) migrés vers `<PrivateNumberInput>` (même pattern panel-approuvé que leurs 2 voisins) →
  masqués hors-focus en mode discret, valeur hors DOM. Clôt la découverte du LOT 2 (volet vie privée des champs éditables complet).
- [x] **[SEC-PBKDF2-DRIVE]** ✅ **FAIT (2026-06-23, LOT 1)** — `keyCipher.ts` : PBKDF2 600k (encrypt) + fallback legacy 100k
  (decrypt) pour les anciens blobs Drive. Garde « Web Crypto indisponible » avant la boucle. Test rétro-compat (blob 100k déchiffre).
- [x] **[M1-FISC-WHT-HARDCODE]** ✅ **FAIT (2026-06-23, LOT 6)** — `projection.ts:1428` : retenue REER du compteur `totalTaxesPaid`
  passe de `*0.15` figé à `withholdingForGrossRRSP(retraitReerMois).withholding` (tiered 19/24/29 % combiné QC, MÊME barème que le
  cashflow `rrspWithholding`). Non-double-compte VÉRIFIÉ par panel (financial-integrity + projection-validator + silent-failure-hunter) :
  c'est l'acompte que la réconciliation de décembre soustrait (`totalAnnualTax − taxCurrentYear.reer`) ; `taxOnRrif` séparé, base disjointe.
  Mesuré : totalTaxesPaid 211,6 k$ → 270,1 k$ sur un retraité décaissant ~9 k$/mois (discriminant git-stash, seuil 250 k$). A compressé
  l'écart du test survivor 3,77 %→2,21 % (artefact du biais 0,15) → seuil `projection.survivor.test.ts` re-calibré 0,03→0,015 + chiffres MAJ.
  Résiduels (display) → BACKLOG WHT-DISPLAY-EXACT.
- [x] **[M5-INV1-EXTEND]** ✅ **DÉJÀ COUVERT (constaté 2026-06-23, LOT 5)** — INV-9 (`projection.moneyConservation.test.ts:346-354`,
  ajouté à l'audit 2026-06-17) contient EXACTEMENT le gap visé : reconstructabilité sous hypothèque `NetWorth = Σactifs − DettesNonImmo`
  (<2 $) + discriminant `DetteTotale` (écart = solde hypothécaire > 1 k$). Pas de test dupliqué (leçon « vérifier avant de coder »).
- [x] **[HIST-NW-NO-DEBT]** ✅ **FAIT (2026-06-23, LOT 5)** — documenté les DEUX sites (`reconstructPortfolioHistory.ts:143` + le
  recompute d'affichage `FutureProjection.tsx:274`) : NW passé = placements (+cash+immo) SANS dettes, car l'app n'a pas l'historique
  des soldes de dette. Pas de rename (casserait les consommateurs `.NetWorth`). Question PRODUIT (disclaimer / approx dette courante)
  → `docs/A_FAIRE_MOI` HIST-NW-DEBT-DISCLAIMER.
- [x] **[SEC-LOG-DEBT-REGEX]** ✅ **FAIT (2026-06-23, LOT 1)** — `errorLogger.ts` : les termes financiers (amount/balance/debt/
  salary/income/expense/cost/price/net-worth) matchés en SUBSTRING (capte `liquidDebt`/`mortgageBalance`/`annualAmount`…) ; les
  termes ambigus (token/email/`fact`…) restent ANCRÉS (anti faux-positif `factor`). Tests : composés redactés + diagnostiques conservés.

### 🔬 Audit financier 2026-06-17 (findings vérifiés — `docs/AUDIT_FINANCIER_2026-06-17.md`)
> Cœur money-critical = AAA (conservation prouvée ≤0,02 $/~25 scénarios, fiscalité 0 écart). **Tous les findings
> ci-dessous sont à la PÉRIPHÉRIE** (consommateurs UI/IA/viz qui recalculent au lieu de la source unique) — aucun
> n'altère la VALEUR du patrimoine net. Lot d'implémentation : commencer par le keystone PUIS H1/H2 (test avant fix).
- [x] **[NW-PARITY-INVARIANT]** ✅ HIGH (★ garde-fou keystone, PR #370 2026-06-19) — SOURCE UNIQUE `computePresentNetWorth`
  (3 surfaces routent) + RESTE livré : `tests/services/nwParity.test.ts` cross-check le NW présent ≡ NW de DÉPART du moteur
  (`computeStartingCash` ≡ `computeCurrentLiquidity` par construction ; Σ 6 buckets `derivePortfolioStartingBalances` ≡
  `computeInvestmentsValue` — PAS « par construction » : 2 chemins de valorisation, vérifié) − dettes ; + end-to-end
  `chartData[0]` à flux nuls AVEC dettes (tolérance relative 0,1 %, le mois 0 applique un MER minime). Discriminant prouvé
  (D1 TOTAL double-compté, D2 dettes omises, D3 valorisation 2× → tous attrapés). **LIMITE documentée** : parité définie HORS
  immobilier (`computePresentNetWorth` exclut l'immo, le moteur l'inclut dans `chartData[0]`). Panel 3 agents APPROVE.
- [x] **[NW-UI-DEBT]** ✅ HIGH (livré PR audit) — `useDerivedFinancials.globalNetWorth` route vers `computePresentNetWorth`
  (soustrait les dettes). Avant : cash+investments SANS dettes → Dashboard gonflé.
- [x] **[AI-CTX-FX]** ✅ HIGH (livré PR audit) — `AiAssistant` : FX RÉELS (`fxRates`) + dettes soustraites via
  `computePresentNetWorth`/`computeInvestmentsValue` ; 1.38/1.50 en dur supprimés. Régression `TabRouter.availableCash`
  (dérivation `globalNetWorth − placements`) corrigée en passant (→ `currentLiquidity`).
- [x] **[FISC-DETTE-TOTALE-MORTGAGE]** (M5) ✅ MEDIUM (livré, décision Marc = champ additif) — champ `DettesNonImmo`
  (= activeDebts+liquidDebt+smithManoeuvre, SANS hypothèque) ajouté à `monthlyOutput` + `projection/types` →
  `NetWorth = Σactifs − DettesNonImmo` tient TOUJOURS (Immobilier = équité nette). INV-9 étendu : reconstructabilité
  via DettesNonImmo (< 2 $) + discriminant (DetteTotale NE reconstruit PAS sous hypothèque, écart = solde hypothécaire).
- [x] **[LLM-INJECT-PARITY]** (SEC-1) ✅ MEDIUM (livré) — `getCoupleOptimizationStrategies` + `getNextBestActions`
  neutralisent désormais les noms utilisateur (`sanitizePromptText`) et isolent les blocs de données en `<DONNEES>`
  (`wrapUserData`) — parité avec les 4 autres surfaces LLM. Le system prompt QUEBEC_FISCAL_CONTEXT isole déjà `<DONNEES>`.
- [x] **[FISC-WHT-HARDCODE]** ✅ **FAIT (2026-06-26, LOT 6/M1)** — `withholdingForGrossRRSP` tiered 19/24/29 % (barème tiers). Résiduel → [WHT-DISPLAY-EXACT] l.381 coché. Doublon fermé.
  DOUBLE-COMPTAGE dans ce compteur d'AFFICHAGE (`totalTaxesPaid`, PAS le NW). Augmenter le taux empirerait le double-compte.
  À FAIRE d'abord : vérifier empiriquement `totalTaxesPaid == Σ(sorties d'impôt réelles)` (cadre moneyConservation), puis
  corriger selon le résultat (retirer la ligne si double-compte, ou aligner sur la vraie retenue si complémentaire). Effort M.
- [x] **[FISC-DIV-SHARE-DRY]** (M2) ✅ MEDIUM (livré) — `NONREG_DIVIDEND_DISTRIBUTION_SHARE = 0.30` extraite dans
  `projection/helpers.ts`, consommée par `projection.ts` ET `taxDecember.ts` (source unique). Value-neutral.
- [x] **[FISC-INCLUSION-DRY]** (M3) ✅ MEDIUM (livré) — `projection.ts:1435` importe désormais
  `CAPITAL_GAINS_INCLUSION_STANDARD` (au lieu de `0.5` en dur). Value-neutral.
- [x] **[FISC-VIZ-CREDITS]** (M4) ✅ MEDIUM (livré, décision Marc) — `TaxBracketViz` : total + taux effectif (par
  juridiction ET combiné) tirés de `calculateFiscalReport` (NET, crédits BPA+abattement) ; barres + détail $ restent
  BRUTS (pédagogique, libellés « avant crédits »). Fin du total « exact » surévalué.
- [x] **[FISC-CONST-LINT]** ✅ MEDIUM (PR #364, 2026-06-18, garde-fou) — `utils/fiscalConstantsGuard.ts` +
  `tests/fiscalConstants.guard.test.ts` (10 tests, échec dur, choix Marc). Auto-extrait de `tax.ts`/`realEstate.ts` les littéraux
  DISTINCTIFS non-collisionnables (entiers ≥5 chiffres ≠ `…000` + taux 4 décimales) et échoue si l'un fuite hors source.
  Scope sûr : ronds (`60000`=60 s ms) et taux 2-décimales (`0.5`) EXCLUS. Strip des commentaires (numéros de ligne ARC ≠
  constantes). Échappatoire `// fiscal-const-ok`. **A trouvé une vraie fuite** : `setupSimulation.ts` recopiait `32490`
  (RRSP 2025) → nommé `RRSP_ANNUAL_LIMIT_FALLBACK` dans tax.ts (byte-identique, 180+ tests projection verts). Démo
  (`testBudget`) exclue. Ferme structurellement M1-M3.
- [ ] **[FISC-CONST-LINT-LIMITS]** 🔧 LOW (découverte #364) — limites connues du garde-fou, à garder en tête :
  (1) les **taux à 2-3 décimales** (`0.063` RRQ, `0.205`, `0.15` clawback, `0.18` REER) ne sont PAS bannissables sans
  faux positifs (omniprésents en ratios) → une recopie manuelle d'un tel taux passerait sous le radar. (2) Les **facteurs
  FERR** (`helpers.ts` `RRIF_RATES`, `0.0617`…) sont des constantes réglementaires hors `tax.ts`/`realEstate.ts`, donc non
  protégées par le scan. Aucune fuite aujourd'hui (vérifié). Étendre le scope = arbitrage faux-positifs à faire.
- [ ] **[FISC-RRSP-PRE2010-FALLBACK]** 🔧 LOW (découverte #364) — `setupSimulation.ts` applique
  `RRSP_ANNUAL_LIMIT_FALLBACK` (= plafond 2025, 32 490 $) aux années en sol canadien **avant 2010** (hors table). C'est
  ANACHRONIQUE (plafond réel ~16,5 k$ en 2005) → sur-estime les droits REER historiques des très vieux profils (mord
  seulement si salaire×0,18 > 32 490, càd salaires > ~180 k$). Pré-existant (non introduit par #364). Fix futur : étendre
  la table avant 2010 ou extrapoler à la baisse.
- [x] **[AI-SNAP-FREQ]** (L4) ✅ LOW (livré) — `monthlyExpenses` NORMALISÉ par fréquence + hors épargne :
  `financialSnapshot` via `computeMonthlyBudgetAggregates`, `NextBestAction` via `monthlyAmountFor` (excl. Epargne).
  Avant : Σ brute des cibles (poste annuel compté ×12) envoyée à l'IA/MCP. 29 tests verts.
- [x] **[AI-NBA-FX]** ✅ LOW (livré) — `NextBestAction` utilise désormais les `fxRates` RÉELS du store (avant : `{}`
  → actifs étrangers à 1:1). NW + ventilation CELI/REER envoyés à l'IA corrects. (DRY complet via `buildFinancialSnapshot`
  reste un nice-to-have séparé — duplication du snapshot inline, consigné.)
- [x] **[ENG-LOOP-ORDER-TEST]** (L1) ✅ LOW (PR #362, 2026-06-18) — `tests/services/projection.loopOrder.test.ts` : garde-fou
  de l'ordre boucle (allocation AVANT croissance). 2 scénarios : (1) actifs investis partis de 0 → croissance mois 1 > 0
  (la contribution du mois finance sa propre demi-mois de rendement) ; (2) contrôle sans contribution → croissance investie === 0.
  DISCRIMINANT PROUVÉ à la main : en simulant l'ordre inversé (croissance sur soldes PRÉ-allocation), le scénario 1 échoue
  (`expected 0 to be greater than 1000`). Attrape une inversion que les 12 invariants de conservation laissent passer (l'argent
  reste conservé, seul le rendement est décalé). Liquide exclu (démarre ≠ 0).
- [x] **[ENG-MONTHLYOUTPUT-TEST]** (L2) ✅ LOW (PR #351, 2026-06-18) — `tests/services/monthlyOutput.test.ts` : 19
  assertions sur `buildMonthlyDataPoint` (mode MC minimal + mappings dérivés DetteTotale/DettesNonImmo, diffNW,
  *Max, NetTransfer, CoastFIRE, AccruedTax, ExpenseInflation, reconstructabilité, gardes div-0/Infinity). Panel
  `code-reviewer` (arrondi IEEE-754 borderline corrigé + 4 mappings non couverts ajoutés).
- [x] **[ENG-TAX-NS]** ✅ DÉCISION Marc 2026-06-19 : **GARDER l'alias** `services/tax.ts` (`export *`). Pas de
  résorption. Clos (voir batch décisions 2026-06-19).
- [x] **[FISC-WELCOME-2026]** ✅ **FAIT (2026-07-07)** money-critical — `services/realEstate.ts` `WELCOME_TAX_QUEBEC` :
  barème « reste_qc » passé du millésime 2025 (58 900/290 000/552 300 + 4ᵉ tranche 2 %) au **barème de BASE 2026 à 3 tranches**
  (62 900 : 0,5 % / 315 000 : 1,0 % / >315 000 : 1,5 %). La 4ᵉ tranche à 2 % (sur-tranches municipales >500 k$) est RETIRÉE →
  limite assumée documentée (ville par ville, non modélisable sur le binaire montreal/reste_qc). Discriminant : 500 k$ = 5 610,50 $
  (avant : 5 755,50 $) + bornes exactes 62 900/315 000 testées. SOURCE : *Gazette officielle du Québec* 2025-06-07 nº 23 (indexation
  +2,3438 %). Panel `financial-integrity`. Montréal intact, invariant « montreal ≥ reste_qc » préservé.
- [x] **[TP1G-VIVANT-SEUL]** ✅ **FAIT (2026-07-07)** — `utils/tax.ts` : montant « personne vivant seule » (2 172 $)
  additionné à âge + revenu retraite AVANT la réduction UNIQUE 18,75 % au-delà du **seuil unique 42 955 $** (les paliers
  duaux 27 835/45 270 non sourcés sont ARCHIVÉS → touche aussi les couples, crédit ↓ léger dans la bande), conversion 14 %.
  Gate `!hasSpouse` = solo ET survivant (via `taxFilers`, aucun changement `taxDecember.ts`). Discriminant prouvé (zéro-out
  → 3 tests solo échouent) ; suite complète 2352 verts, 2 goldens ITEM-2C re-basés SCIEMMENT (solo −9 175 $ ; couple +9 $).
  Panel `financial-integrity` + `silent-failure-hunter`. Limites assumées (doc §4) : montant appliqué au bloc 65+ (solo <65
  non crédité) ; supplément monoparental 2 681 $ NON modélisé (exigerait `childrenCount`).
- [ ] **[FISC-LINE361-PERCONJOINT-REDUC]** 🔍 LOW money-critical (découverte `financial-integrity` TP1G 2026-07-07, PRÉ-EXISTANT) —
  la réduction 18,75 % de la ligne 361 QC est appliquée PAR CONJOINT en mode retraité couple (`taxDecember.ts:532` passe
  `familyIncome = taxableReal` TOTAL à CHAQUE appel, boucle n=2) → si l'Annexe B réduit le TOTAL combiné une SEULE fois,
  la réduction serait comptée 2× dans la bande de réduction PARTIELLE → léger sur-impôt couple. NON introduit par TP1G
  (code d'avant, non modifié). Vérifier la structure réelle de l'Annexe B (réduction sur le total ménage vs per-déclaration)
  AVANT de coder ; discriminant `git stash` + panel. Golden `coupleEqual` inchangé = crédit soit nul soit plein hors bande.
- [x] **[REEE-LITERALS]** ✅ **FAIT (2026-06-26)** — `services/projection/childrenReee.ts` : SCEE/IQEE/REEE extraits en
  constantes nommées+sourcées (`SCEE_GRANT_RATE`, `*_ANNUAL_GRANT_BASIC/CATCHUP`, `*_LIFETIME_GRANT_LIMIT`, `IQEE_*`,
  `REEE_LIFETIME_LIMIT_PER_BENEFICIARY`, `REEE_TARGET_ANNUAL_CONTRIB_*`, + `REEE_AIP_TAX_RATE` marqué « approximation modèle »),
  pointant vers `FISCAL_REFERENCE §REEE`. Refactor PUR (valeurs inchangées) : golden + conservation + suite byte-identiques. Aucun impact $.
- [ ] **[NW-ASSETBREAKDOWN-DRY]** 🔧 LOW (audit 2026-06-17, panel) — `utils/useDerivedFinancials.ts:45-66` :
  `assetBreakdown` ET `currentLiquidity` recalculent INLINE au lieu de `computeAssetBreakdown`/
  `computeCurrentLiquidity` (`services/portfolio.ts`). ⚠️ **Analyse 2026-06-18 (PR #351) : PAS un quick win.**
  `currentLiquidity` = router safe (logique identique). MAIS `assetBreakdown` = **3 deltas sémantiques** sur un
  agrégat partagé : (1) le local met crypto dans `nonReg` (else), le helper le SORT → `nonReg` baisserait pour
  `Retirement.currentNonReg` (TabRouter:236) + contexte NBA (App.tsx:569) ; (2) le local a `reee` HARDCODÉ à 0,
  consommé par `currentRESP` (ChildPlanning, TabRouter:213) → changerait ; (3) l'interface `DerivedFinancials`
  n'a pas de champ `crypto`. = classe « changer un agrégat partagé casse silencieusement les dérivations »
  (CLAUDE.md). **À RESCOPER** : vérifier chaque consommateur + décider crypto/reee délibérément (effort M, pas S).

### 🛡️ Durcissement structurel (brief Marc 2026-06-17, post-audit) — VALIDÉ + reformulé pour l'app
> Objectif Marc : rendre bugs math / blocages UI / corruptions de données structurellement impossibles. Statut vérifié
> contre le code actuel — certains tickets sont DÉJÀ faits (ne pas refaire), d'autres partiels. IDs reformulés pour FinanceAI.

**ÉPIC 1 — Noyau de calcul & preuve**
- [x] **[HARDEN-FUZZING]** ✅ HIGH (PR #365, 2026-06-18, ticket 1.1) — `tests/services/projection.fuzzConservation.test.ts`
  (fast-check `^4.8.0` dev). 500 scénarios aléatoires BORNÉS → par mois : reconstructabilité forme-BILAN
  `|NW − (Σactifs − DettesNonImmo)| ≤ 1 $` (PAS la forme dépistage, faux-positive sur flux one-time) + NetWorth fini
  (lecture STRICTE, pas de NaN silencé) + aucun actif (hors immo) négatif (INV-6). Seed FIXE (CI déterministe), timeout
  lié à NUM_RUNS, fast-check affiche contre-exemple + seed à l'échec. **Discrimination PROUVÉE end-to-end** (injection
  `+1000` au NW → fuzz échoue, counterexample minimal). Panel 4 agents (résiduel max MESURÉ 0,02 $, arbiter = `computeRawNetWorth`
  terme-pour-terme, chemins fiscaux exercés : REER 70 %, clawback PSV 10 %, insolvabilité 33 %). Complète les ~25 scénarios fixes.
- [~] **[FUZZ-ONETIME-FLOWS]** 🔧 MEDIUM ◑PARTIEL (PR #367, 2026-06-19) — le fuzz génère désormais l'**ACHAT IMMOBILIER**
  (mise 5-50 % < prix → hypothèque ; **mesuré 257/500 runs sous hypothèque**, écart max 886 k$) + **RÉNOVATION** majeure,
  et un invariant **`DetteTotale ≥ DettesNonImmo`** (hypothèque non double-comptée, écart = `mortgageBalance ≥ 0`). **Test
  déterministe immo** : reconstruction NW sous prêt. La reconstructabilité SOUS hypothèque (raison d'être de la forme-bilan,
  ex-`immoSeen=0/500`) est désormais fuzzée. Discrimination PROUVÉE end-to-end (flip signe équité + drop liquidDebt de
  DetteTotale → fuzz échoue). **RESTE (suivi)** : la VENTE immo / GAIN EN CAPITAL locatif (déclenché par lifeEvent « vente »
  — le fuzz achète et DÉTIENT), le REVENU LOCATIF (`rentalIncomeMonthly`), l'ÉQUITÉ NÉGATIVE (choc immo / immeuble sous l'eau),
  véhicule, héritage, REEE/childGoals.
- [x] **[DEP-UNDICI-VULN]** ✅ **RÉSOLU/PÉRIMÉ (constaté 2026-06-25)** — voir [DEP-UNDICI] : le lockfile est à `undici 7.28.0` (≥ fix),
  `npm audit` = **0 vulnérabilité**. Le `npm ls` à 7.25.0 = `node_modules` local périmé (pas réinstallé). Rien à coder.
- [x] **[HARDEN-NETWORTH-EXHAUSTIVE]** ✅ MEDIUM (PR #356, 2026-06-18, ticket 1.2) — garde anti MONEY-PHANTOM sur
  `NetWorthParts` (`services/projection/netWorth.ts`) : `export const NET_WORTH_SIGN: Record<keyof NetWorthParts, 1|-1>`
  → un champ ajouté à l'interface SANS signe casse le **typecheck** (prouvé). + test croisé « littéral == Σ signe×valeur »
  → un terme oublié dans la formule fait échouer le test (discriminant prouvé : retrait d'un terme → 3 tests rouges).
  ⚠️ La formule littérale `computeRawNetWorth` reste **byte-identique** (hot-path inchangé, zéro régression — conservation
  verte) : le sign-map est un filet compile-time + test, INERTE au runtime. Panel `projection-validator` : garde correcte.
- [ ] **[HARDEN-DECIMAL-STUDY]** 🔧 LOW/⏳ (nouveau, ticket 1.4, ÉTUDE) — PoC arithmétique exacte (centimes entiers OU
  `decimal.js`) sur un sous-module (impôts). ⚠️ Priorité BASSE : la dérive flottante est DÉJÀ bornée ≤ 0,02 $ sur ~25
  scénarios (invariants tolèrent < 2 $). Mesurer le coût Monte Carlo (480 mois × 100 iter) AVANT d'adopter. Ticket 1.3 =
  `[FISC-CONST-LINT]` ci-dessus (déjà au backlog).

**ÉPIC 2 — Exécution & UI**
- [~] **[HARDEN-MC-WORKER]** 🔧 MEDIUM (PARTIEL, ticket 2.1) — `services/projection.worker.ts` + `runProjectionAsync`
  (timeout 30 s) EXISTENT (W1.1). RESTE : vérifier/ajouter le **chunking** (lots 10-50 iter) + un **`onProgress(pct)`** pour
  la barre MC ; évaluer **Comlink** (non installé) pour des types bout-en-bout. DoD : 100 iter × 40 ans sans drop de frame.
- [~] **[HARDEN-SNAPSHOT-RACE]** 🔧 MEDIUM (PARTIEL, ticket 2.2) — le moteur est PUR (zéro mutation d'état partagé, vérifié
  audit) ; `structuredClone` existe déjà au store ; AbortController déjà sur les appels API (claude/finnhub). RESTE :
  garantir un snapshot immuable de l'input AVANT envoi Worker/IA + un AbortController sur le chemin Worker projection.

**ÉPIC 3 — Cycle de vie**
- [x] **[HARDEN-FISCAL-TIMEBOMB]** ✅ MEDIUM (PR #363, 2026-06-18, ticket 3.1) — `utils/fiscalFreshness.ts` (helper pur)
  + `tests/utils/fiscalFreshness.test.ts`. Lit la date « Dernière vérification »/« Ré-audité » la PLUS RÉCENTE de
  `FISCAL_REFERENCE.md` (regex tolérante au gras markdown) et mesure l'ancienneté RELATIVE (pas de `Date.now() < 2027`
  calendaire) : `console.warn` à 12 mois, **échec dur à 18 mois** (généreux → n'interrompt un travail non-fiscal qu'en
  cas de négligence profonde ; la cadence `/audit-financier` l'évite). Date introuvable ⇒ traité comme périmé (pas de
  désamorçage silencieux). Discrimination INTRINSÈQUE : test unitaire avec date périmée synthétique (`now` injecté) →
  `isExpired=true`. 11 tests. Réutilisable pour un futur « warning au build ».
- [x] **[HARDEN-ZUSTAND-MIGRATE]** ✅ DÉJÀ FAIT (ticket 3.2) — `persist` schema **v7** + `migratePersistedState` (v1→v7,
  optional chaining, fallback défaut + dump du localStorage corrompu) + tests `migratePersistedState.test`. Plus avancé
  que le ticket (v2). Rien à faire.

**ÉPIC 4 — Frontières & IA**
- [ ] **[HARDEN-ZOD-GATEKEEP]** 🔧 MEDIUM (nouveau, ticket 4.1) — Zod est utilisé (sorties LLM `safeJsonValidate`, backup)
  mais PAS en gatekeeping systématique des INPUTS UI. Ajouter des schémas stricts (`salary: z.number().min(0)`, `age:
  z.number().min(18).max(100)`…) aux actions Zustand / handlers → le moteur ne reçoit jamais NaN/Infinity/string (défense
  en profondeur en amont du garde NaN du moteur).
- [x] **[HARDEN-AI-CTX]** ✅ DÉJÀ FAIT (ticket 4.2, #319) — `AiAssistant` + Dashboard routent par `computePresentNetWorth`
  (FX réels `fxRates`, dettes soustraites). NB : le NW PRÉSENT utilise `computePresentNetWorth` (pendant de
  `computeRawNetWorth` qui sert le FUTUR/moteur) — garde de parité keystone dans `portfolio.test`.
- [~] **[HARDEN-SAFEBLOCK]** 🔧 LOW (PARTIEL, ticket 4.3, complète SEC-1 #321) — sanitizePromptText + wrapUserData LIVE sur
  toutes les surfaces LLM (l'attaque `</DONNEES>Ignore…` est déjà neutralisée par `neutralizeFrameTags`). RESTE :
  factoriser un helper unique `buildSafeUserBlock(text)` + imposer son usage (idéalement lint) pour qu'une FUTURE surface
  LLM ne puisse pas oublier la protection.


- [x] **[HARDEN-NETWORTH-NAN]** ✅ MEDIUM (PR #372, 2026-06-19) — `computeRawNetWorth` (SOURCE UNIQUE du patrimoine)
  n'avait AUCUNE garde `Number.isFinite` : un terme non fini (`liquid`/`reer` NaN) rendait TOUT le patrimoine NaN →
  graphe vide SANS `logError` (échec silencieux, dette préexistante). Fix : helper module-scope `sumNetWorthParts`
  (formule unique) ; total non fini → chemin lent qui rabat chaque terme fautif sur 0 (itère `NET_WORTH_SIGN`) +
  `logError(source:'projection', {offending})` **throttlé par signature** (hot-path MC, anti-flood localStorage) +
  recalcul. Chemin sain = 1 `Number.isFinite` (formule inchangée). Miroir runtime de `sumActiveDebts`. Discriminant
  prouvé (court-circuit → 4 tests échouent). Panel 3 agents APPROVE (1 finding redaction PII RÉFUTÉ : pattern ancré
  `^debt$` ≠ substring → clés `*Debt` non redactées). 6 tests ajoutés.
- [x] **[FISC-ESTATE-PENSION-NPV]** ✅ MEDIUM (PR #352, 2026-06-18) — NPV des rentes publiques (RRQ/PSV) au bilan
  successoral : montant MENSUEL × facteur d'annuité ANNUEL sans ×12 → ~12× sous-évaluée (~34 k$ au lieu de ~409 k$
  sur 1200 $/mois). Fix = annualiser ×12 avant le facteur (`estateCalculation.ts`). Test discriminant PROUVÉ
  (`git stash` → 6 tests échouent : 48 681 vs 584 180). Panel financial-integrity (×12 = bonne réannualisation,
  +0,67 % vs annuité mensuelle, zéro double-comptage) + projection-validator (12/12 conservation, appel post-sim).
  HYPER_INFLATION re-ciblé sur `finalNetWorth` (rentes indexées = couverture, estate nominal peut dépasser la base
  sous inflation — leçon CLAUDE.md). **Découverte** : 1 LOW silent-failure (voir [ENG-ESTATE-ESTIMATE-FIN] ci-dessous).
- [x] **[ENG-ESTATE-ESTIMATE-FIN]** ✅ LOW (PR #360, 2026-06-18) — `estateCalculation.ts` : `Math.max(0, fin(rrqEstimate
  Monthly))` (idem psv). Un estimé `NaN` zérotait SILENCIEUSEMENT TOUT l'`estateNetWorth` (le `fin()` de sortie
  absorbait le NaN propagé, effaçant même un `finalRawNetWorth` positif). Désormais le NaN est neutralisé à la SOURCE :
  sa rente → 0, l'autre rente + le reste du patrimoine calculent (dégradation gracieuse). Zéro changement sur les cas
  finis (`fin(x)=x`). Discriminant prouvé (`git stash` → NaN rrq zérotait l'estate). Panel silent-failure-hunter : fermé.
- [x] **[FISC-EVENT-INCOMELOSS]** ✅ MEDIUM (PR #354, 2026-06-18) — PERTE_EMPLOI/SABBATIQUE/ACCIDENT étaient un
  NO-OP (le moteur ne lisait que `impactAmount`, absent pour ces types) → une perte d'emploi de 6 mois était
  ignorée. Fix = `computeIncomeLossFactor` (`monthlyEvents.ts`) réduit le revenu MÉNAGE de `incomeLossPercent`%
  pendant `durationMonths` (sémantique Marc : % perdu + durée, défauts 100/100/50). UI dédoublée (% perdu +
  durée) + validation (refuse un événement inerte). Net + brut REER réduits ; **l'impôt salarial de décembre
  N'est PAS réduit** (biais conservateur, identique au chômage stochastique — vérifié empiriquement par le panel).
  Test discriminant prouvé (`git stash` → no-op → patrimoine identique). Conservation : +2 tests moneyConservation
  (50 % + 100 %). Panel 5 agents, tous findings intégrés. **Suite possible** : per-conjoint (sélecteur « qui »).
- [x] **[FISC-RE-SALE-RESIDUAL]** ✅ MEDIUM (PR #368, 2026-06-19) — vente immobilière quasi-underwater (hypo 95-100 %
  de la valeur, les 5 % de frais poussent `saleNet` < 0) : `addLiquid(Math.max(0, saleNet))` (`monthlyEvents.ts`)
  EFFAÇAIT le déficit (patrimoine surévalué de `|saleNet|`). Fix : `addLiquid(saleNet)` → le déficit est DÉDUIT
  (ponctionné du liquide, ou porté en `liquidDebt` visible via PV-6 si liquide épuisé). ΔNW = −5 % de la valeur
  (prouvé algébrique + empirique). Tests : unitaire (`monthlyEvents.test.ts` 50k→40k) + end-to-end conservation
  (`moneyConservation` ΔNW < −13k au mois de vente), DISCRIMINANTS prouvés via `git stash` (ancien −7965). Log
  corrigé (n'affiche plus « +0$ » sur un déficit). Panel 4 agents APPROVE (conservation prouvée, 0 régression).
- [x] **[FISC-RE-CAPITAL-LOSS]** ✅ MEDIUM (PR #371, 2026-06-19) — `monthlyEvents.ts` à la vente d'un LOCATIF sous coût :
  `gain = max(0, produit − coût)` + `if (gain > 0)` IGNORAIT silencieusement la perte en capital réalisée (avantage
  fiscal LIR 111(1)b perdu). Fix : nouveau helper SOURCE UNIQUE `applyCapitalDisposition(state, rawGain signé)` dans
  `portfolioOps.ts` (perte < 0 → banque ; gain ≥ 0 → nette la banque puis impose) ; `handleNonRegSale`/`handleCryptoSale`
  refactorés dessus (zéro duplication) ; mutator immo `realizeCapitalGain` → `realizeCapitalDisposition` (nom honnête,
  gère gain ET perte) + log de la perte. Discriminant prouvé (réintro `Math.max(0)` → test échoue). Panel + 12 invariants
  conservation verts.
- [ ] **[FISC-ASSETLOC-INTL]** 🔧 MEDIUM — asset-location : classe `international` jamais analysée →
  retenue étrangère 15 % en CELI/REER non comptée (`assetLocation.ts:104-132`) ; l'outil dit « optimal »
  alors qu'une perte existe (~375 $/an sur 100 k$ international en CELI). Fix non trivial (le patch naïf
  reste 0 : taxIdeal NonReg=marginalRate domine) — modéliser le coût de détention.
- [x] **[FISC-SRCDED-NOOP]** ✅ **RÉSOLU (2026-06-26, choix Marc) — par RETRAIT du code mort, pas par fix** :
  l'enquête a prouvé que les 2 bugs (ordre + unité) affectaient une valeur **DISCARDÉE** — `computeMonthlyWithholding`
  accumulait dans `taxCurrentYear.revenu`, **jamais appliqué au liquide** (`impotSalaireMois=0`), puis **écrasé par
  l'override de décembre** (V30) avant le règlement d'avril. Preuve : perturbation +999 999/mois → golden PINé +
  2331 tests d'intégration **byte-identiques** (seuls les 2 unitaires DE la fonction cassaient). Le flag T1213
  fonctionne via le chemin DÉCEMBRE (`taxDecember`, V49, correct). « Corriger » = zéro effet → fonction **retirée**
  (résout aussi PERF-WITHHOLDING + gain perf MC). Panel projection-validator (2329/2329) + financial-integrity + code-reviewer ✅.
- [x] **[A11Y-DANGER-300]** ✅ LOW (2026-06-17) — `text-danger-300` n'existait PAS dans `tailwind.config.js` (palette
  danger = 400/500/600 seulement) → couleur ignorée. 3 sites hors périmètre MONEY-PHANTOM :
  `ImportBankStatement.tsx:123`, `RealEstateAdviceCard.tsx:19`, `Transactions.tsx:439` (+ son hover no-op).
  Fix : → `text-danger-400`.
- [x] **[A11Y-MODAL-PRIVATE]** ✅ LOW (2026-06-17) — `FutureDetailModal` entièrement migré vers `<PrivateAmount>`
  (idiome `const blur` ×2 supprimé ; valeur nette, comptes, apports/gains, flux, moments-clés, espace cotisation
  enveloppés). En mode discret → ••• hors DOM. (Livré avec [A11Y-D6-SR-2] ph.3.)

## 🔎 Review multi-agents 2026-06-15 — risques confirmés (27 : 8 HIGH / 11 MEDIUM / 8 LOW)
> Audit complet (12 agents specialises, emphase financiere). Les **HIGH financiers #1-#6 sont en
> correction cette session**. Severite en tete de chaque item.

### Fiscal / moteur (money-critical)
- [x] **[FISC-RRQ-UNIT]** ✅ HIGH (#296, 2026-06-15) — `retirementIncome.ts:151` : `grossSalary` (mensuel) ÷ MGA annuelle → RRQ ~12× trop basse. Corrigé (×12) + test discriminant + panel projection-validator/fiscal-accuracy.
- [x] ~~**[FISC-MARGINAL-YEAR]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-15, projection-validator) — le finding supposait un revenu NOMINAL ; le moteur passe un revenu RÉEL déflaté (`monthlyCalcs.ts:92-110` : déflation revenu + ré-inflation du `totalTax`). `marginalRate` sur paliers 2026 est donc DÉJÀ correct ; propager `year` introduirait un bug (taux marginal décroissant + casse REER-first/goldens). **NE PAS corriger.**
- [x] **[FISC-WELCOME-UNIFY]** ✅ HIGH (2026-06-16) — taxe de bienvenue unifiée. Décision Marc : champ `RealEstateGoal.municipality` (`'montreal' | 'reste_qc'`, type `Municipality`) requis à la saisie (sélecteur `PropertyConfigurator`), PAS de défaut stocké ; non choisi ⇒ repli conservateur Montréal. SOURCE UNIQUE : `realEstate.ts:calculateWelcomeTax(price, municipality?)` porte les 2 barèmes (MTL 8 tranches→4% / reste QC 4 tranches→2%) ; `helpers.ts:welcomeTax` y délègue (fin du bug C9 « 3 implémentations divergentes »). Param MCP ajouté. Les 2 barèmes transcrits dans `FISCAL_REFERENCE §8`. Panel : fiscal-accuracy/projection-validator/code-reviewer/silent-failure-hunter/a11y-auditor → 0 CRITICAL/HIGH, 2048 tests verts. Restes LOW documentés : seuils provinciaux 2025 à réindexer 2026 ; municipalités hors MTL regroupées dans `reste_qc`.
- [x] **[FISC-SURVIVOR-DRAWDOWN]** ✅ HIGH (#297, 2026-06-15) — `cashflowAllocation.ts` : seuils survivant ×2 → `liveFilers=1` (cohérent taxFilers/oasBeneficiaries) + salaire du défunt exclu. Verdict NUANCE (qualité de stratégie, pas fuite fiscale). Panel projection-validator OK. NB : `meltdownReer.ts` a le même schéma (cible ×N) — voir [FISC-MELTDOWN-SURVIVOR] ci-dessous, opt-in MC, à faire si voulu.
- [x] ~~**[FISC-ACB-RENO]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-15, fiscal-accuracy) — prémisse fausse : les rénos n'augmentent PAS non plus `currentValue` dans le moteur (croît seulement par `propertyGrowthRate`). `cost` ET `currentValue` ignorent les rénos symétriquement → gain cohérent, pas de surimposition. ⚠️ Le fix suggéré (ajouter rénos à `cost` seul) serait NOCIF (sous-imposition). **NE PAS corriger.** (Sujet séparé hors scope : l'équité/net worth sous-estime les rénos capitalisées → [DETTE-RENO-EQUITY] à créer si voulu.)
- [x] **[FISC-LATENT-RE]** ✅ HIGH (#298, 2026-06-15) — `latentTax.ts` : `realEstateLatentGain` (×50%) ajouté à `totalTaxableLatent`, même Σ que le bilan successoral. Seul `ImpotLatent` d'affichage bouge. Panel projection-validator OK.
- [ ] **[FISC-TAXDEC-INCR]** 🔧 LOW (requalifié de MEDIUM, triage 2026-06-16 — `fixIsSafe:false`) — `taxDecember.ts:694-730` : 3 sous-claims RÉELS mais bornés. (a) crédit d'âge omis sur l'incrément gains/div → ne joue QUE dans la zone d'érosion du crédit (s'annule ailleurs comme le BPA), sous-imposition légère bornée. (b) gains+div empilés depuis la MÊME base (pas en cascade) → sous-imposition d'un retraité gros gains ET gros div franchissant un palier ensemble. (c) FSS sur revenu moyen du couple → **déjà documenté in situ** (taxDecember.ts:653-658, plafond 1 000 $/adulte). ⚠️ **DÉCISION Marc 2026-07-06 À CONFIRMER** — interprétation : OK pour COD ER le fix risqué, ou ok=statu quo / différé ? Avant tout code : clarifier l'intention (fix full vs stay différé + doc). En attente.
- [x] ~~**[FISC-GOVPENSION-SCALE]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-16, panel projection-validator + fiscal-accuracy + code-reviewer, unanime) — prémisse FAUSSE : `governmentPension` est un AGRÉGAT **MÉNAGE** (RRQ+PSV combinés des 2 conjoints), pas un per-personne. L'absence de ×N est VOULUE et cohérente sur 3 sites (`retirementIncome`, `estateCalculation:177-178`, `setupSimulation:114-118`) + documentée (utils/tax.ts:99, FISCAL_REFERENCE §6) + verrouillée par régression (`estateCalculation.test.ts:131`). Ajouter ×N = ré-introduire le bug FA-5 (couple double-compté) → **NE PAS corriger**. ✅ Corrections sûres faites (2026-06-16) : label UI clarifié « total ménage (couple combiné) » + typo « Etat→État » (`RetirementIncomeCard.tsx:26`) ; rename `rrqBaseIndiv/psvBaseIndiv → …Family` (`retirementIncome.ts`, le nom trompeur avait FABRIQUÉ le faux positif).
- [x] **[FISC-RRQ-PRORATA]** ✅ MEDIUM (2026-06-16) — prorata de résidence RRQ rendu PER-CONJOINT (`retirementIncome.ts`), mirroir de la PSV : `arrivalAge` via `getResidencyStartYear` (corrige aussi le gate `isImmigrant` manquant → RRQ désormais cohérente avec PSV/CELI/REER), poids RRQ = ratio gains/MGA × prorata résidence per-conjoint, split par poids. Couple non-immigrant ⇒ inchangé (zéro régression baseline ; état `canadaArrivalYear` sans `isImmigrant` inatteignable en prod). 3 tests discriminants (symétrie ordre-conjoints — VÉRIFIÉ échouant sur l'ancien code via stash). Triage adversarial : REAL_BUG confirmé (seul vrai bug sur 7 findings vérifiés).
- [x] ~~**[FISC-INFLATION-COUPLING]**~~ ❌ **DOUBLON de ITEM 2a (déjà rejeté Marc)** (triage 2026-06-16) — `tax.ts:673` indexe les paliers ×1,02/an pendant que le revenu est déflaté par `simInflation`. Le fix proposé (« indexer sur `simInflation` ») a été **prouvé numériquement PIRE** (simInflation 5 %/20 ans : ARC ~29 353 $ vs fix ~7 712 $ vs actuel ~22 313 $ — cf HISTORIQUE.md ITEM 2a). Cause : l'aller-retour déflate→impôt→réinflate est lossy (BPA/crédits en $ fixes). Le vrai correctif = impôt sur revenu NOMINAL + paliers indexés `simInflation` (supprime l'aller-retour) = chantier STRUCTUREL ~12 sites → **décision Marc + plan requis**. Documenté FISCAL_REFERENCE §9. **NE PAS appliquer le fix naïf.**
- [ ] **[FISC-SURVIVOR-CAP]** 🔧 LOW (triage 2026-06-16, différé) — `retirementIncome.ts:224` (survivorRrqFactor) : rente de survivant non plafonnée au max RRQ combiné. ⚠️ Cap naïf `Math.min(rrqMonthly, RRQ_MAX)` serait FAUX (un couple a droit à 2 rentes jusqu'au décès) ; le cap doit s'appliquer à la portion d'UN bénéficiaire (RRQ propre survivant + part défunt ≤ max), via `perUserRrqWeight`. Money-critical + peu d'impact → différé.
- [ ] **[FISC-RAP-REPAY]** 🔧 LOW (triage 2026-06-16, hypothèse DOCUMENTÉE, fix différé) — `realEstateMonth.ts:405-414` : remboursement RAP « toujours honoré » (versement manqué reporté en silence, pas d'inclusion ligne 12900 ; solde impayé pas porté au revenu de la déclaration finale). ✅ Limite consignée FISCAL_REFERENCE §9. Fix (inclusion au revenu + passif successoral) `fixIsSafe:false` (risque de double-comptage estate) → différé.
- [ ] **[FISC-CHILDCARE]** 🔧 LOW (triage 2026-06-16, hypothèse DOCUMENTÉE, fix différé) — `childrenReee.ts:199-201` : facteur de coût résiduel 30 % sur garde privée > 400 $/mois = HEURISTIQUE conservatrice, PAS le vrai régime (féd T778 ligne 21400 / QC crédit remboursable dégressif ~67-78 %). ✅ Consigné FISCAL_REFERENCE §9. Précision réelle (déduction/crédit exacts) = travail dédié → différé.
- [x] **[FISC-REEE-CONST]** ✅ LOW (2026-06-16) — valeurs REEE/SCEE/IQEE vérifiées EXACTES (SCEE 20 %/500/1000/7200 ; IQEE 10 %/250/500/3600 ; REEE 50 000 $/bénéficiaire) et **documentées** FISCAL_REFERENCE §7 (REEE — SCEE/IQEE). Reste optionnel : extraire les littéraux en constantes nommées dans `childrenReee.ts` (noté dans la doc, non urgent).
- [x] **[GUARD-NAN]** ✅ LOW (2026-06-16) — garde `Number.isFinite` en tête de `getMarginalRate` (`utils/tax.ts`) : un income non fini est rabattu sur 0 (1er palier, dégradation prévisible) au lieu du taux MAX silencieux. Sans dépendance (tax.ts reste pur, pas de logError importé).

### Accessibilite
- [x] **[A11Y-D6-SR-2]** ✅ HIGH (2026-06-17 — 3 phases livrées + keystone •••) — fuite : le mode privé est lu intégralement par les lecteurs d'écran (masquage CSS seul). **Phase 1 LIVRÉE** : dossier `projection/` migré (`ProjectionTooltip` 13, `ActionPlanDrilldown` 6, `StressTestPanel` 1, `StrategyOptimizerPanel` 3) → `<PrivateAmount>` ; primitives `PrivateAmount`/`PrivateBlock` dotées d'un prop `title` (conserve les infobulles natives). KPIStat était déjà correct. **Phase 2 LIVRÉE (2026-06-16, 5 fichiers div)** : `DividendPanel` 1, `Budget` 3, `Planning` 3, `ChildPlanning` 1, `Investments` 1 → `<PrivateAmount as="div">`. **Phase 3 LIVRÉE (2026-06-17, 16 instances migrées via agent + vérif suite complète)** : `FutureDetailModal` (idiome `const blur` ×2 supprimé), tables `<td>` (`RealEstate` 4 /`Transactions` 2 /`ImportBankStatement` 1 /`ImportBrokerPositions` 2 /`BudgetGroupTable` 2 → wrapper interne `<PrivateAmount>` dans le td). ⚠️ Les 3 `<input>` (`RetirementIncomeCard` ×2, `BudgetGroupTable` ×1) ne sont PAS wrappables par `<PrivateAmount>` (champ éditable) → approche dédiée ou hors scope. ⚠️ Finding a11y-auditor (phase 1) : les 3 infobulles `title` de `ProjectionTooltip` (l.106/119/122, « Écart… », « Dépôts… », « Rendement… ») sur un span au contenu aria-hidden ne sont PAS annoncées de façon fiable par les SR (limite PRÉEXISTANTE, pas une régression) → en phase 2, remplacer `title` par `aria-describedby`/`sr-only` pour que l'explication soit accessible.
- [x] **[A11Y-CHARTS]** ✅ HIGH (2026-06-17 — phases 1+2 COMPLÈTES) — graphes Recharts sans alternative textuelle
  (WCAG 1.1.1 A). **Phase 1** : primitif `<ChartDataTable>` (sr-only, caption + scope + échantillonnage ≤40 +
  mode privé) intégré dans `ZoomableTimeChart` (StockChart + DashboardEvolutionChart). **Phase 2 (3 lots, ~14
  graphes)** : LOT 1 `FutureProjection`/`Retirement` accumulation/`DebtManager` · LOT 2 `RealEstate` scénarios/
  `Investments` 2 donuts/`Budget` donut/`ChildPlanning` coût+REEE · LOT 3 `Retirement` cashflow/`DividendPanel`/
  `MultiPropertyComparison`/`LifeEvents`/`FutureDetailModal` drill-down. Tous → `<ChartDataTable>` sr-only +
  `role="img"` + **masquage privacy-aware** ($ → `Montant masqué` en mode discret ; `%` visibles). Garde-test
  (DebtManager). ⚠️ Seul l'amortissement RealEstate non câblé car DÉJÀ un `<table>` HTML accessible (correct).
- [ ] **[A11Y-INK500]** 🔧 LOW (EN COURS, par lots) — `ink-500` (#6a7689) sur du contenu actif (échec AA normal). Passer à `ink-400` (#8896a8, AA ✅ 5,21-6,42 cf check-contrast). **Avancement** : `TaxBracketViz.tsx` (4 occ., A11Y-TAXBRACKET) + **LOT 1 fait 2026-06-26** = 6 écrans quotidiens (Dashboard/Budget/BudgetGroupTable/Investments/Transactions/Planning), **43 occ. migrées** sur classification a11y-auditor par-occurrence ; **10 GARDÉES** à raison (icônes = seuil 3:1, séparateurs décoratifs, `ⓘ` aria-hidden, 1 cible inactive délibérée `timeView!==MONTH`). ⚠️ PAS un sed global aveugle. **LOT 2 fait 2026-06-26** = LifeEvents/RealEstate/FutureDetailModal/ChildPlanning/retirement(RetirementIncomeCard+AssetLocationCard), **37 occ. migrées** + **8 GARDÉES** (icônes, tabs inactifs, glyphes aria-hidden) ; code-reviewer a aussi corrigé LifeEvents:367 (texte d'empty-state → ink-400) + ajouté `aria-hidden` au `→` AssetLocationCard:215. **RESTE ~37 fichiers / ~105 occ.** (investments/*, projection/*, sidebar/*, setup/*, realestate/*, AdvancedProjectionParams…) → lots suivants.
- [x] **[A11Y-BUDGETTABLE-SELECT-KBD]** ✅ **FAIT (2026-07-07)** — `BudgetGroupTable.tsx` : `focus-within:opacity-100` sur le
  wrapper des `<select>` fréquence/type (l.147) + `focus:opacity-100` sur le bouton supprimer (l.225, `<td>` séparé) → révélés au
  focus clavier (avant : survol souris uniquement). Panel a11y-auditor APPROVE (anneau de focus natif visible, WCAG 2.4.7 OK) +
  code-reviewer (redondance `focus-visible` retirée). ⚠️ Note hors-scope (a11y-auditor) : `BudgetGroupTable:181` (`text-ink-500`
  sur l'input `target` en vue ≠ MONTH) échoue AA sur du texte actif — mais GARDÉ « à raison » au LOT 1 [A11Y-INK500] (« cible
  inactive délibérée ») ; à re-trancher dans le sweep [A11Y-INK500], pas ici.

### Echecs silencieux
- [x] **[SF-PDF]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : échec jsPDF routé vers `logError({source:'ui'})` (visible en prod via SystemView) ; repli print conservé.
- [x] **[SF-RESIDUS]** ✅ LOW (2026-06-16) — `StockComparisonModal.tsx:41` (→ network/warning), `FutureProjection.tsx:464` (→ ui/error, context = champs manquants, pas les objets financiers), `TaxCenter.tsx:89` (→ ai/error) routés vers `logError`. `syncOrchestrator.ts` était déjà propre (référence BACKLOG périmée).

### Tests / dette technique
- [x] **[TEST-PROJ-MODULES]** ✅ **PÉRIMÉ/COUVERT (constaté 2026-06-25)** — les 3 modules ONT des tests directs : `projection.assetLocation.test.ts`
  (8), `monthlyOutput.test.ts` (19), `strategyConfig.returnProfile.test.ts` + `strategyConfigRanking.test.ts` (22) = 49 tests. Item ajouté avant
  ces couvertures. (Leçon R2-FIRE : vérifier qu'une tâche n'est pas déjà faite avant de la coder.)
- [x] **[HEALTH-SAVINGS-RATE]** ✅ **FAIT (2026-06-25, reco PM)** — `HealthIndicator.tsx` : le taux d'épargne + le coussin d'urgence
  comptaient les postes ÉPARGNE comme des dépenses → taux ≈ 0 % pour un épargnant, coussin sous-estimé. Helper pur `monthlyConsumptionExpenses`
  (`healthRatios.ts`, exclut `isSavingsNature`, cohérent avec `computeBudgetParityScore`/`Budget.tsx`) + 4 tests. Panel financial-integrity + code-reviewer ✅.
- [x] **[HEALTH-SAVINGS-CONSISTENCY]** ✅ **FAIT (2026-06-26, choix Marc)** — `nature === 'Epargne'` STRICT remplacé par `isSavingsNature`
  (NFD) sur **5 surfaces / 6 sites** : `portfolio.ts:139` (IA/MCP), `NextBestAction.tsx:114`, `useDerivedFinancials.ts:37` (moteur),
  `buildSimulationParams.ts:231` (moteur MCP), + **5ᵉ surface trouvée par le panel** `Budget.tsx:105` (inflation sim) et `:306` (ventilation
  couple, UI-only). Une nature « Épargne » accentuée est désormais exclue des dépenses PARTOUT (avant : comptée en dépense → épargne sous-estimée
  → projection pessimiste). Test discriminant `healthSavingsConsistency.test.ts` (git-stash : 2500→3500 prouvé) + panel financial-integrity +
  projection-validator (conservation 20/20) + silent-failure ✅. `BudgetGroupTable`/`Budget:266,1010` laissés (groupement UI sur l'union typée, pas un calcul de dépense).
- [x] **[DETTE-PDF-FORMAT]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : `formatCAD` local retiré → importé de `utils/format` (source unique fr-CA ; bonus : valeurs non finies → '—' au lieu de « NaN $ »). Tests pdfReport/pdfScenarios verts.
- [x] **[DETTE-RE-SALE]** ✅ **FAIT (2026-07-07)** — `monthlyEvents.ts` : vente immo ciblée par `LifeEvent.propertyId`
  (champ additif optionnel, PAS de bump v7) au lieu du `find` premier-bien qui vendait la RP exemptée au lieu du locatif
  imposable (faussait le gain en capital de dizaines de k$). Fallback rétrocompat exact si `propertyId` absent ; fourni SANS
  match → aucune vente (jamais un AUTRE bien). Sélecteur UI (`LifeEvents`, affiché si ≥2 biens actifs, option « Auto »).
  4 tests discriminants (dont symétrie + no-match + fallback) + panel projection-validator (2352/2352, conservation 20/20)/silent-failure/code-reviewer.
- [ ] **[DETTE-RE-SALE-PURGE]** 🔧 LOW (suivi, panel silent-failure 2026-07-07) — supprimer un bien (`RealEstate.tsx doConfirmDeleteGoal`)
  ne purge pas `lifeEvents[].propertyId` qui le référence → vente orpheline. Mitigé : la vente orpheline est SIGNALÉE (`logFlow`
  « vente ignorée : bien introuvable »), pas silencieuse. Fix propre : avertir/purger à la suppression. Effort S.
  ⚠️ **DIFFÉRÉ (sweep 2026-07-07) — ambiguïté design money-adjacent** : purger `propertyId`→`undefined` re-cible l'événement sur le 1ᵉʳ bien à
  équité positive (ANNULE l'intention de [DETTE-RE-SALE] : ne pas vendre le mauvais bien) ; supprimer l'événement = destructif ; avertir = plus de
  câblage store→dialog. Re-cibler une vente = money-critical → mérite une décision délibérée (option A purge/B remove/C warn) + panel, pas un batch.
  État actuel déjà mitigé (logFlow). À trancher avec Marc.
- [x] **[DETTE-DEADCODE]** ✅ **FAIT (2026-06-26)** — RETIRÉ : `runBuyVsRent` (`realEstate.ts`, test-only, zéro call-site prod) + ses
  types `BuyVsRentInput`/`BuyVsRentYear` (servaient QUE lui) + son bloc de test + import ; `buildTestFixtures` (`testFixtures.ts`, wrapper
  de compat jamais appelé) + ses imports devenus inutilisés (le barrel `testFixtures` reste VIVANT : TestModePanel/Layout/PageSetupGate/
  usePortfolioHistory en consomment les re-exports). EXCLUS après vérif : `clearCredentials` (dans `mcp/` → règle « y toucher seulement sur
  demande ») ; façade `getProfile` (méthode du contrat `MarketDataProvider`, implémentée + testée → API délibérée, pas du cruft). Reste du
  bruit knip (GST/QST/SCHL, interfaces, constantes fiscales) NON purgé (règle CLAUDE.md). + **`_buyVsRentData`** (`RealEstate.tsx`, useMemo
  préfixé `_` jamais rendu — vraie courbe UI = `combinedData`) retiré (trouvé par le panel code-reviewer, même feature morte). 2 commentaires
  stale (`testFixtures.ts` en-tête, `coupleConfort.ts`) corrigés. typecheck + build + suite verts.
- [x] **[PLANNING-ANNUAL-SUB-12X]** ✅ **FAIT (2026-06-26)** — `Planning.tsx` : les KPI « Fixe mensuel »/« Coût annuel » sommaient
  `averageAmount` BRUT puis ×12 → un abo ANNUEL compté ×12. Fix : helpers purs `monthlyEquivalent`/`totalMonthlyCost`/`totalYearlyCost`
  (`utils/subscriptions.ts`) dérivés de `yearlyCost` (source de vérité annualisée) + gardes `Number.isFinite`. KPI + ligne d'affichage
  (`formatCAD(monthlyEquivalent(sub))` « /mois ») câblés. 6 tests dont discriminant (annuel : 130 ancien → 20 nouveau). Panel financial-integrity + code-reviewer.
  Follow-up → `PLANNING-ANNUAL-CALENDAR` (un abo ANNUEL apparaît sur le calendrier CHAQUE mois car le filtre ignore le mois ; + label « /an » explicite vs « /mois »).
- [x] **[HEALTH-SUB-DRY]** ✅ **FAIT (2026-07-07)** — `utils/healthRatios.ts:subscriptionsMonthlyCost` délègue au helper canonique
  `totalMonthlyCost` (`utils/subscriptions.ts`). Panel `financial-integrity` : golden santé NE PEUT PAS bouger (identité math `Σ(x/12)=(Σx)/12`,
  écart sous-ULP, `Math.round` sur métrique+score avant affichage) ; garde NaN préservée (par-item dans `totalYearlyCost`). code-reviewer : pas de cycle d'import. APPROVE.
- [x] **[PLANNING-ANNUAL-CALENDAR]** ✅ **FAIT (2026-07-07)** — helpers PURS `isAnnualSubscription` (discriminant ratio `yearlyCost/averageAmount`,
  seuil STRICT 2 = ~annuel ; plus fréquent → défaut mensuel = sur-affichage, jamais masquer une facture) + `subscriptionDueLabel` (`utils/subscriptions.ts`).
  `Planning.tsx` : calendrier filtre les annuels par mois d'échéance (`lastDate.getMonth() === date.getMonth()` de la cellule) ; liste affiche « Le X <mois> · annuel ».
  Panel `financial-integrity` (display seul, `dailyTotal` non consommé par un flux $ ; seuil 2 resserré depuis 6 sur son finding trimestriel) + code-reviewer
  (IIFE extraite en helper testable, double-espace corrigé) APPROVE. 6 tests neufs (seuil, trimestriel, label + date invalide).
  ⚠️ Limite : `RecurringItem` n'a pas de `frequency` → une cadence IA non standard (hebdo/trimestriel) tombe en mensuel (sur-affiché) ; un vrai champ `frequency` serait le fix complet (non requis).
- [ ] **[DETTE-GODFILES]** ⏳ — decouper par barrel : `utils/tax.ts`, `syncOrchestrator.ts`, `Investments.tsx`, `Budget.tsx`, `FutureProjection.tsx`.
- [ ] **[DETTE-UI-PRIMITIVES]** ⏳ — `components/ui/Input|Select|Field` sur les tokens existants ; migrer 16 fichiers a `<input>` inline.

### Performance
- [ ] **[PERF-BOOT]** 🔧 — `App.tsx:401` : `hydrateAssets` `sleep(2500)` sequentiel par actif → pool concurrent borne.
- [x] **[PERF-WITHHOLDING]** ✅ **RÉSOLU (2026-06-26) — par SUPPRESSION, pas mémoïsation** : `computeMonthlyWithholding`
  était du code mort (sortie écrasée par décembre, cf. FISC-SRCDED-NOOP) → retirée. On ne mémoïse pas du code mort, on
  le supprime (gain perf MC réel : 2× `calculateFiscalReport`/mois × chemins MC en moins, pour un résultat jeté).
- [x] **[PERF-BUNDLE]** ✅ **FAIT (2026-07-07)** — 2 des 3 `INEFFECTIVE_DYNAMIC_IMPORT` convertis en import STATIQUE (le module
  était DÉJÀ en boot, le dynamic import ne créait aucun chunk) : `lockedProjectionStore` (`App.tsx`, boot via le store) + `backupAuto`
  (`syncOrchestrator.ts`, boot via `App.tsx initAutoBackup`). Le 3ᵉ (`claude.ts`) est GARDÉ dynamique **à dessein** : ses consommateurs
  sont lazy (TabRouter) → le SDK Anthropic vit dans les chunks lazy, PAS en boot ; le rendre statique le tirerait en boot = régression
  (vérifié : boot 99,8 kB gzip inchangé, warnings 3→1). Panel code-reviewer + silent-failure-hunter. Zéro régression (branches d'erreur préservées).
- [x] **[PERF-MISSINGDATA]** ✅ **FAIT (2026-07-07)** — `components/ui/MissingDataBanner.tsx` (`MissingDataChecklist`) : le full-store
  `useFinanceStore()` remplacé par un sélecteur `useShallow` sur le tableau DÉRIVÉ des champs manquants → re-render seulement quand
  l'ENSEMBLE change (plus à chaque écriture du calcul MC). Panel code-reviewer + silent-failure-hunter. 20 tests verts.

### Securite (deja connu / Marc)
- [x] **[DEP-UNDICI]** ✅ **RÉSOLU/PÉRIMÉ (constaté 2026-06-25)** — le `package-lock.json` est DÉJÀ à `undici 7.28.0` (= le fix des 2 alertes
  Dependabot, plage vulnérable `>= 7.0.0, < 7.28.0`), `node_modules/undici` = 7.28.0, `npm audit` = **0 vulnérabilité** (dev + prod). Les
  entrées `undici-types` du lock sont un AUTRE package (types TS, non vulnérable). Plus aucune action — bump déjà appliqué au lock.
  - **Risque réel FAIBLE** : dev-only (jamais bundlé en prod ; pas de ProxyAgent SOCKS5 ni de cache HTTP partagé dans notre usage) — mais à patcher pour vider les alertes.
  - **Action = merger la PR Dependabot existante** [#366](https://github.com/MoKarade/FinanceAI/pull/366) (`build(deps-dev): bump undici 7.25.0→7.28.0`) une fois la CI verte → ferme les 2 alertes. Pur lockfile, zéro code.
  - **Cadence** (cf `rules/toolkit/dependency-management.md`) : revue Dependabot hebdo, patchs HIGH ≤ 7 j. Décision Marc : merger #366 maintenant ou l'inclure dans la prochaine revue de deps.
- [x] **[BACKUP-PASSPHRASE]** ✅ LOW (2026-06-17) — `BackupPanel.tsx` : TOUS les seuils (export/import, label, boutons) alignés sur `MIN_PASSPHRASE_LENGTH` (12, importé de `syncOrchestrator` comme `PassphraseGate`). Fin de l'incohérence export-12/import-8 (l'import acceptait des passphrases de 8).

---

## 🔬 Panel agents — validation Phase 5 (2026-06-17, findings sur #322-324 + surfaces touchées)
> Issus du test empirique du nouvel environnement d'agents (PR #325). Vrais findings sur du code DÉJÀ mergé
> (l'audit money-critical précédent visait le $, pas la résilience SDK / l'UX / la vie privée / l'a11y).
> Aucun CRITIQUE/ÉLEVÉ. Sévérité en tête.

### IA / SDK Anthropic (ai-reviewer)
- [x] **[NBA-CACHE-STALE]** ✅ MEDIUM (2026-06-17, BATCH2b) — `snapshotSig()` (netWorth arrondi + revenu + dépenses + nb dettes/objectifs + couple) stockée avec le cache ; `readCache(sig)` invalide si la signature diffère → plus de conseils basés sur un profil périmé. Rétro-compat : ancien cache sans `sig` valide par TTL, réécrit au 1er fetch.
- [x] **[AI-VISION-TIMEOUT]** ✅ MEDIUM (2026-06-17, BATCH2a) — `analyzePayslip` + `analyzeBankStatement` bornés par `makeTimeoutSignal(undefined, 90_000)` + `{ signal }` passé à `messages.create` + `cleanup()` → abort au timeout, fin du spinner infini.
- [ ] ~~**[AI-SNAPSHOT-DUP]** (fix d'origine)~~ ⚠️ **PRÉMISSE FAUSSE** (vérifié 2026-06-17, lecture du code) — les 2 `FinancialSnapshot` ne sont PAS identiques (`claude.ts` = `topDebts`/`activeGoals`/âges/soldes ; `financialSnapshot.ts` = `totalDebt`/`userCount`) et `buildFinancialSnapshot` n'est appelé par AUCUN runtime (def + tests + docs seulement). Le fix naïf (NextBestAction appelle `buildFinancialSnapshot`) serait FAUX (shapes incompatibles). **Résidu RÉEL restreint** : (a) collision de NOM entre 2 interfaces → en renommer une (`FinancialOverviewSnapshot` ?) ; (b) `buildFinancialSnapshot` = dead code → vérifier/supprimer (lié [CA-01]). NE PAS appliquer le fix d'origine.
- [x] **[AI-NBA-MODEL]** ✅ LOW (2026-06-17, BATCH2a) — `getNextBestActions` `temperature:0` (actions déterministes) + `impact_estimate` borné `.max(60)` Zod + disclaimer UI « Recommandations générées par IA — à valider ». Modèle gardé Haiku (suffisant + caché 1h). `safeParse` cosmétique NON fait (le `schema.parse` est dans un try/catch testé qui retourne null = correct ; le changer = risque pour 0 gain).

### Vie privée — Loi 25 / RGPD (security-privacy)
- [x] **[PRIV-NBA-CACHE]** ✅ MEDIUM (2026-06-17, BATCH2b) — `purgeCache()` appelé quand le profil est vidé / déconnecté (`!apiKey || !hasData`) → la PII dérivée (conseils IA) ne reste plus en clair dans localStorage après un reset/déconnexion (Loi 25). + invalidation par signature (cf NBA-CACHE-STALE) limite la fuite inter-profil. Chiffrement IDB du cache = optionnel (non fait : purge + sig suffisent pour le risque, conseils = dérivés bornés).
- [x] **[PRIV-AI-MINIMIZE]** ✅ LOW (2026-06-17, BATCH2a) — `deadline` tronquée à l'ANNÉE (`slice(0,4)`) avant envoi à Anthropic. ⚠️ Âge GARDÉ exact (décision) : matériellement utilisé pour les règles fiscales QC (RAP/CELIAPP, crédits 65+, conversion FERR à 71) → l'arrondir dégraderait le conseil. À rebander seulement si Marc préfère la confidentialité à la précision sur l'âge.

### Doc inline / a11y (code-reviewer, a11y-auditor)
- [x] **[DOC-L4-JSDOC]** ✅ LOW (2026-06-17) — `financialSnapshot.ts` JSDoc corrigé : dépenses NORMALISÉES (`computeMonthlyBudgetAggregates`, hors épargne) + NW via `computePresentNetWorth`. Fin de la fausse spec post-L4.
- [x] **[A11Y-TAXBRACKET]** ✅ MEDIUM (2026-06-17, Vague 2) — `TaxBracketViz.tsx` : (a) `role="img"` + `aria-label` (revenu+marginal) sur les barres, contenu visuel interne `aria-hidden` (lève l'ambiguïté inter-AT en plus du role), + `<ChartDataTable>` sr-only (ladder des paliers from→to + taux) par juridiction ; (b) `<h4>`→`<h3>` (la `Card` émet h2 → fin du saut) ; (c) 4× `ink-500`→`ink-400` — contraste VÉRIFIÉ empiriquement (`check-contrast` : ink-400 #8896a8 = 5,21-6,42 ✅ AA, ink-500 #6a7689 = 3,41-4,20 ❌ ; la numérotation ink va du CLAIR au foncé, donc ink-400 contraste PLUS sur fond sombre). Test `TaxBracketViz.a11y.test.tsx` (4 cas) + couvert par `pages.axe.test.tsx`. **Suivi LOW (optionnel)** : la table sr-only liste le ladder mais pas l'impôt $/palier (dispo via `<details>` natif accessible) ni un marqueur « tranche active » → enrichissement futur, PAS un échec WCAG (vérifié a11y-auditor).

---

## 🧱 BRIEF MARC 2026-06-10 — plan séquencé en 4 phases (PRIORITAIRE)
> Règles d'exécution (Marc) : **plan-first OBLIGATOIRE** sur les Phases 2, 3 et CHAQUE onglet de la
> Phase 4 (plan court : UI proposée, fichiers touchés, données nécessaires → validation Marc → code).
> **Ne JAMAIS passer à la phase suivante sans OK explicite de Marc.** Commits en français.
> `SESSION_HANDOVER.md` mis à jour après chaque phase.
> Questions à POSER (ne pas deviner) : **Q1** (avant PH4-FUT) — quoi annoter SUR la courbe
> (âge retraite ? épuisement d'un compte ? bascule de stratégie ?) · **Q2** (avant toute action
> Cloudflare) — confirmer que Cloudflare est bien devant Vercel.

### Phase 1 — BUGS (exécution immédiate, sans plan)
- [x] **[PH1-a]** 🔧 (livré) Erreur prod « Failed to fetch dynamically imported module
  DashboardEvolutionChart-[hash].js ». Cause code CONFIRMÉE : `Dashboard.tsx:5` était le SEUL
  `React.lazy` NU du codebase (tous les autres passent par `lazyWithRetry` P1.4 = retry 500 ms +
  1 reload gardé) → seul chunk sans filet sur hash périmé après deploy. Fix : (1) `lazyWithRetry`
  appliqué ; (2) filet GLOBAL `vite:preloadError` (`installPreloadErrorReload`, installé dans
  `index.tsx` avant le render) → intercepte racine ET dépendances préchargées des imports dynamiques.
  Revue (panel) → design durci : garde par **TIMESTAMP auto-expirant** (≤ 1 reload auto/min) au lieu
  du flag binaire + `clearChunkReloadFlag` au mount SUPPRIMÉ (il tournait avant la résolution des
  chunks du boot → un échec persistant bouclait reload→mount→clear→reload, en évinçant le journal
  d'erreurs) ; PAS de `preventDefault` (sinon les `import()` résolvent `undefined`) ; filtre
  `isChunkLoadError` (une erreur d'évaluation de module ne gaspille pas de reload) ; nom du chunk
  fautif persisté au log ; storage indispo → pas de reload. 7 tests. **Critères ✓** : plus aucun
  `React.lazy` nu ; boucle bornée structurellement ; ErrorBoundary en dernier recours. Audit cache
  fait : `vercel.json` DÉJÀ conforme (index.html `no-cache`, `/assets/*` `immutable`) ; `sw.js`
  DÉJÀ network-first `no-store` sur les navigations (2026-05-22) — rien à changer.
- [x] **[PH1-b]** ✅ **CADUC — Cloudflare retiré 2026-06-16** (Access + proxy DNS dé-proxifié). Auth = gate Google in-app. Fermé.
  CF d'un index.html périmé (CF ne cache pas le HTML par défaut et respecte le `no-cache` origine —
  à vérifier : Page Rule « Cache Everything » dans le dashboard CF). NE PAS retirer Cloudflare avant
  P0-AUTH (gate Google in-app) : c'est l'authentification de l'app. Étapes de retrait + pertes
  documentées dans `A_FAIRE_MOI`. **Décision Marc requise (Q2).**

### Phase 2 — CLÉ DE VOÛTE ⏳ (plan-first → OK Marc → code) — dépend de : rien (débloque PH4)
- [x] **[PH2-a]** ✅ mergé #240 — `runMC` persisté dans le store (le toggle MC ne se réinitialise
  plus inter-onglets ni au reload), worker projection NON terminé au démontage (singleton chaud
  réutilisé), repli sur `lastProjection` au remount → la courbe stockée s'affiche INSTANTANÉMENT
  (pas d'écran vide ni de reset des contrôles). Nuance assumée : le recalcul déterministe (~150 ms)
  re-tourne au retour mais est idempotent ET masqué par le repli ; le calcul MC lourd, lui, n'est PAS
  relancé (cf PH2-b). Hoist complet du moteur hors composant jugé non nécessaire (objectif UX atteint).
- [x] **[PH2-b]** ✅ mergé #240 — dédup des requêtes MC IDENTIQUES en vol (`runProjectionAsync`,
  Map `_inflight`, clé effective = signature params + `runMC`/`idx`/`types`) : quitter Futur pendant
  un MC puis revenir RE-RACCROCHE à la promesse déjà en vol (un seul calcul worker, pas de restart).
  Worker singleton conservé (plus de `terminate()` au démontage). Revu : code-reviewer (rien de
  bloquant), silent-failure (clean), projection-validator (1895 tests verts). `performance-optimizer`
  NON lancé — diff = orchestration pure (Map dédup + booléen store + repli), zéro calcul ajouté, deux
  effets perf POSITIFS (worker chaud + 0 calcul MC dupliqué) → l'agent n'aurait rien à signaler.
- [x] **[PH2-c]** ✅ mergé #241 — moteur de projection hoisté AU NIVEAU APP (`ProjectionEngine`
  headless + lazy, monté dans App) : calcule + publie `lastProjection`, source TOUJOURS peuplée quel
  que soit l'onglet (avant, seul Futur monté calculait → Dashboard/Retraite à `ProjectionRequired`).
  `hooks/useSimulationParams` partagé moteur↔Futur (params identiques, zéro divergence) ; Futur devient
  pur CONSOMMATEUR ; `projectionStatus` au store (transitoire, exclu persist+sélecteur App = anti-cascade).
  Garde no-fake-data (prérequis Futur). Revu par le panel complet (rien de bloquant, invariants OK,
  1900 tests). Suivis non bloquants → PH2-c-1..4 ci-dessous.
- [x] **[PH2-d]** ✅ mergé #242 — verrou de courbe : bouton dans Futur → snapshot du `ProjectionResult`
  COMPLET persisté CHIFFRÉ en IndexedDB DÉDIÉE (`services/lockedProjectionStore`, clé device secureKeyStore),
  restauré au boot jusqu'au déverrouillage. **Double courbe** (verrouillée figée + aperçu live) sur Futur
  ET Retraite. Côté Zustand : seul `isProjectionLocked` (booléen ADDITIF) persisté → **ZÉRO bump v7**, le
  blob vit en IDB (aucun risque de corruption schema). Panel complet (code-reviewer/silent-failure/security/
  a11y) : rien de bloquant. Suivis non bloquants → PH2-d-1..4 ci-dessous. **→ Phase 2 (clé de voûte) TERMINÉE.**

#### Suivis PH2-c (découverts à la revue panel PR #241 — non bloquants, le hoist est livré)
- [x] **[PH2-c-1]** ✅ — fetch Finnhub de `usePastPortfolioHistory` DÉDUPLIQUÉ AU NIVEAU MODULE
  (cache + signatures de lot + `useSyncExternalStore` partagés entre instances) : 1 seul fetch par lot
  quel que soit le nombre d'instances, résultat poussé à toutes (jonction passé↔futur cohérente), et un
  fetch en vol SURVIT au démontage d'une instance. Tests : 2 instances → 1 appel ; montage tardif →
  servi du cache (tests/hooks/usePastPortfolioHistory.dedup.test.tsx).
- [x] **[PH2-c-2]** ✅ — `ProjectionStaleBanner` (composant partagé, role=status) rendu dans Dashboard/
  Investissement/Budget/Retraite : bandeau discret quand `projectionStatus === 'error'` (« les chiffres
  affichés datent du dernier calcul réussi »). Câblé sur `projectionStatus === 'error'` dans Dashboard/Investissement/
  Budget/Retraite → bandeau discret « projection possiblement périmée (dernier recalcul échoué) » au-
  dessus de la courbe conservée. Aujourd'hui l'erreur n'est visible QUE sur Futur (pré-existant, mais
  PH2-c fournit enfin le véhicule `projectionStatus` pour corriger).
- [x] **[PH2-c-3]** ✅ (perf) Router le calcul DÉTERMINISTE dans le worker hors-Futur : en mode
  déterministe (runMC=false), le moteur app-level paie ~150 ms main-thread à chaque changement de
  params quel que soit l'onglet (atténué par debounce 300 ms ; défaut = MC déjà off-thread).
- [x] **[PH2-c-4]** ✅ — tests/hooks/useSimulationParams.parity.test.tsx : renderHook du hook RÉEL
  comparé à `buildSimulationParamsFromState` (même startYear/startMonth), pour CHAQUE persona (7/7).

#### Suivis PH2-d (découverts à la revue panel PR #242 — non bloquants, le verrou est livré)
- [x] **[PH2-d-1]** ✅ (Marc a tranché = AVERTIR) — `loadLockedProjection` retourne désormais un statut
  DISCRIMINÉ (`ok` / `empty` / `unreadable`) ; au boot, `unreadable` (entrée présente mais clé device
  disparue / blob altéré) → `showToast` « Ta courbe verrouillée n'a pas pu être restaurée… » (jumeau de
  `decrypt_failed`). `empty` (rien stocké OU erreur d'accès IDB transitoire) reste silencieux. Test verrou OK.
- [x] **[PH2-d-2]** ✅ — `ExpertTooltip` affiche le bloc « 🔒 Verrouillée » au survol (valeur figée +
  écart vs live, `privacy-blur`), conditionnel à `displayData.lockedNetWorth` (présent sous verrou).
- [x] **[PH2-d-3]** ✅ — aire CELIAPP ajoutée au stack Retraite + métrique verrouillée recomplétée (CELIAPP inclus) ; reste l'alternative texte SR (hors PH2-d, global). Ex-périmètre (pré-existant) Graphe Retraite : le stack d'aires VISIBLE omet CELIAPP (4 aires)
  alors que `TotalCapital` l'inclut (5) — d'où la métrique verrouillée alignée sur le stack (sans CELIAPP)
  en attendant. Ajouter l'aire CELIAPP au stack (+ légende native `iconType` reflétant le tireté) ;
  + à terme, alternative TEXTE/table SR aux graphes (manque global, hors PH2-d).
- [x] **[PH2-d-4]** ✅ — en-tête secureKeyStore mis à jour (3 payloads : clés API + backups + courbe verrouillée). (doc) En-tête `secureKeyStore.ts` : la clé de device chiffre désormais 3 payloads
  (clés API + backups + courbe verrouillée) — mettre à jour le commentaire.

#### Suivi PV-11 (validation projection-validator — réserve documentée)
- [ ] **[PV-11e]** 🧪 (réserve MOYEN du validator) — `withdrawalREER` du goalMutator alimente AUSSI
  `stepReerByUser` (attribution fiscale per-conjoint, taxDecember Phase 2 ACTIVE) : dans la fenêtre
  couple INÉGAL + goal REER + cotisation REER le MÊME mois, le registre per-conjoint bouge légèrement
  (micro-réalignement ASSUMÉ — plus correct : aligne le décrément sur la clé fiscale déjà utilisée).
  Baselines inchangées (1927/1927). À pinner par un test couple-inégal+goal-REER+cotisation simultanée.
  NOTE : goalShortfallTotal agrège des $ NOMINAUX d'années différentes (sémantique à documenter à l'UI).

### Phase 3 — MODÈLE DE DONNÉES + ONGLET PROFIL ⏳ (plan-first) — dépend de : OK Marc post-PH2
- [x] **[PH3-a]** ✅ (PR Phase 3) — onglet **Profil** unifié (`components/Profile.tsx` + Tab.PROFILE) qui
  COMPOSE tous les éditeurs de setup (UsersCard, UserConfigFields salary/fiscal/detailed/children,
  RepartitionField, RetirementSettingsCard, RetirementIncomeCard). Retirés de Config/Impôts/Budget/
  Enfant/Retraite → pointeur `ProfileFieldsMoved`. Mêmes clés store → zéro perte. **Critères ✓.**
- [x] **[PH3-b]** ✅ (PR Phase 3) — `SetupHub` rendu en tête de Profil : **% de complétion GLOBAL**
  (infos met/total + barre de progression) + par onglet « X/N » + quelle info manque + « Ouvrir »
  (navigateWithFocus). **Critères ✓.**
- [x] **[PH3-c]** ✅ (PR PH3-c) — 19 champs morts PURGÉS (contre-audit repo COMPLET : aucun consommateur ; types compagnons orphelins retirés ; UI detailed → « Carrière & rémunération variable ») ; 5 gardés commentés avec consommateur prouvé ; ZÉRO migration persist (résiduels inertes documentés). Découvertes → PH3-c-bis. Audit initial (2026-06-11) : NON consommés
  par `services/` (moteur) → gender, province, citizenship, maritalStatus, employmentType, yearsOfExperience,
  pensionPlan, promotionLikelihood5Y, healthRating, isSmoker, bmiCategory, chronicConditions, activityLevel,
  parentAgeAtDeath, bonusVolatilityPct, stockOptionsValue, commissionPctOfGross, cryptoStakingAnnual,
  payFrequency. CONSOMMÉS (garder) → industry, bonusPctOfGross, rsuVestingPerYear, rsuYearsRemaining,
  sideIncomeAnnual. ⚠️ **RESTE (soigné, séparé)** : vérifier consommateurs HORS `services/` (UI + surtout
  `province`/`maritalStatus` potentiellement fiscaux) + migration persist propre. Money/tax-sensible → pas à la va-vite.
- [x] **[PH3-d]** ✅ (PR Phase 3) — Retraite ne contient PLUS d'éditeur de profil/vie (« Parametres de Vie »
  + « Revenus & besoins » extraits → `RetirementIncomeCard` dans Profil) ; lecteurs/graphes conservés ;
  `lifeExpectancy` reste lu du store. **Critères ✓.**
- [x] **[A11Y-LBL]** ✅ — 18 associations posées : htmlFor/id sur RetirementIncomeCard (8),
  RetirementSettingsCard (5), UserConfigFields salary (2×idx), UsersCard nom/âge (2×idx) ;
  aria-label sur le select RepartitionField + l'input « Nom du profil ». Reste la dette
  hors-Profil (8/30 fichiers htmlFor) — opportuniste.
- [ ] **[DEAD-FLT-2]** 🧹 (suite #246) — purger toute la CHAÎNE du stub `fetchPortfolioHistory`
  (`services/finance.ts` return []) : consumers restants = StockComparisonModal (+ son
  `.catch(console.warn)` à router logError), `hooks/usePortfolioHistory`, `fetchAssetHistory`.
- [x] **[DEAD-FLT]** ✅ — bloc `fetchLiveTotals` purgé (45 lignes mortes : l'async ne tournait
  JAMAIS, stub `[]`) → `liveCSVBalances` est un simple useMemo des props (mêmes valeurs réelles
  qu'avant). Imports/destructures morts nettoyés (useState/useEffect/fetchPortfolioHistory/logError/
  RegisteredAccountType/assets).
- [x] **[SF-WARN]** ✅ — fetchLiveTotals (Retirement) + restore profils (UsersCard) routés vers logError (source network/storage). (revue #244, pré-existant) — `Retirement.tsx` fetchLiveTotals + `UsersCard.tsx`
  restore : `console.warn` sur de vrais échecs I/O → router vers `logError` (convention repo).
- [x] **[CPL-1]** ✅ (signalé Marc 2026-06-11) — switch individuel↔couple GATÉ : « + Ajouter conjoint »
  ouvre désormais un FORMULAIRE de définition (nom + âge REQUIS, salaire optionnel, bouton disabled sinon)
  + avertissement explicite « passer en couple change les calculs » — plus de placeholder silencieux
  (age 30/salaires 0). **Diagnostic calculs** (tests/services/coupleParity.test.ts) : en mode RÉEL, un
  conjoint vide = ZÉRO revenu fantôme (computeIncomeBaseline neutre — le ×1.35 ne s'applique qu'à un net
  non nul) ; la différence de courbes venait des RENTES D'ÉTAT/fiscalité du placeholder (PSV/SRG à ses
  65 ans, imposition 2 têtes) — effets LÉGITIMES pour un vrai conjoint même sans revenu → PAS de
  neutralisation moteur (elle fausserait les vrais couples), le gate UX est la correction. Le split
  théorique 55/45 (useTheoretical) documenté au test. ⚠️ Reste à VALIDER par Marc en visuel : créer un
  conjoint réel sans revenu DOIT changer les courbes (rentes d'État du conjoint) — c'est voulu.

#### Suivis PH3-c (découvertes du contre-audit)
- [~] **[PH3-c-bis]** PARTIEL — ✅ **`User.industry` PURGÉ** (PR R5/#377, 2026-06-19, décision Marc) : `type Industry` +
  champ `User.industry` + `<select>` `UserConfigFields` retirés ; zéro consommateur services/, zéro migration (politique PH3-c :
  résiduel persisté ignoré) ; typecheck clean, 0 ref résiduelle. **RESTE** : `ProjectionConfig.futureProvince/MoveYear` (W2.7,
  orphelins — auditer) · `rsuYearsRemaining` (consommé moteur mais SANS éditeur UI, défaut 99 ans — ajouter l'éditeur ou retirer du moteur).

#### Phase 4 — onglet FUTUR « leviers-d'abord » (en cours)
- [x] **[PH4-FUT-A]** ✅ (PR-A) — calcul-sur-clic + retrait des « plans ». La courbe ET le bandeau
  KPI ne s'affichent QUE sur clic « Calculer » (signe `params` ENTIER → aucune entrée ne met la courbe
  à jour en douce ; état « périmé » si une entrée change après calcul). Mode « Test rapide » (5
  stratégies-types / RobustnessPanel) RETIRÉ → l'Optimisation montre directement les leviers (recherche
  Monte-Carlo). Chaîne morte robustesse purgée (strategyRobustness.ts, runRobustnessRankingAsync,
  branche worker 'robustness'). Panel : code-reviewer (MAJEUR signature corrigé), silent-failure (RAS),
  a11y (propre, aria-busy ajouté).
- [x] **[PH4-FUT-B-1]** ✅ #251 — levier **Profil de rendement** (conservateur/équilibré/agressif → presets
  returnRates ; 'balanced' = inchangé, non-régression). Helper partagé recherche↔courbe. 20 tests, monotonie.
- [x] **[PH4-FUT-B-2]** ✅ (PR-B2) — levier **Fractionnement pension 65+** ON/OFF (gate la Phase 3 de
  taxDecember ; défaut actif = historique ; false = conservateur/légal). Panel fiscal-accuracy RAS, baselines
  intactes. Tests : unitaire (actif 20k < inactif 32,5k) + cohérence configToEngine + non-régression.
- [x] **[PH4-FUT-B-3]** ✅ (PR-B3) — levier **Taux d'épargne** (multiplicateur 0.9/1/1.2). Modèle :
  multiplie l'épargne RÉELLE positive (net−dépenses), réduit les dépenses d'autant (conservation revenu
  net, surplus investi) ; mode réel + épargne>0 seulement (déficit = inerte) ; défaut 1 = non-régression.
  Tests : non-régression bit-près + monotonie + déficit inerte + cohérence configToEngine. Baselines intactes.
- [x] **[PH4-FUT-B-4]** ✅ (PR-B4) — levier **Downsizing immo retraite** (choix Marc : vendre + racheter
  plus petit, à l'âge de retraite). Au mois de retraite, la résidence principale libère DOWNSIZE_RELEASE_PCT
  (40 %) de l'équité en placements, garde 60 % dans un bien payé cash (hypothèque 0) ; EXEMPTION gain
  résidence principale (ARC) ; gardes underwater/locataire/une-seule-fois. Tests unitaires (effet/non-rég/
  underwater/locataire) + baselines intactes. → **PH4-FUT-B COMPLET (4/4 leviers livrés #251-#254).**

#### Suivis fiscaux (découverts au panel PH4-FUT-B-4)
- [x] **[RE-GAIN]** ✅ mergé #260 (vente) + #261 (succession) — le gain en capital immobilier d'un **locatif**
  (≠ résidence principale) n'est PAS modélisé à la disposition : la vente générique
  (`monthlyEvents.ts` `name.includes('vente')`) libère le net SANS réaliser de gain imposable et SANS
  tester `isPrimaryResidence` ; à la succession (`estateCalculation.ts`) `realEstateEquity` entre sans
  impôt latent immobilier. Préexistant (hors PH4-FUT-B-4, qui borne correctement le downsizing à la RP).
  Fix : taxer le gain locatif (inclusion 50 %) à la vente/succession ; documenté FISCAL_REFERENCE §8.

- [x] **[PH4-FUT-TEST]** ✅ — test RTL du chemin `applyAndReveal` (Futur leviers-d'abord) :
  clic « Appliquer » → courbe révélée (strip KPI + « Ré-optimiser »), amorçage disparu, `isStale` reste
  faux (preuve du batching des 2 setAppState) + le geste coule au store (emergencyFundMonths/profil/rentes) ;
  2e test : « Ré-optimiser » re-cache la courbe. `tests/components/FutureProjection.applyReveal.test.tsx`.

### Phase 4 — REFONTES ⏳ (UN plan SÉPARÉ par onglet → OK Marc par onglet) — dépend de : PH2 (+PH3 pour FUT/RET)
- [x] **[PH4-FUT]** ✅ Refonte **Futur** « leviers-d'abord » LIVRÉE (#250 calcul-sur-clic+retrait plans ;
  #251-254 4 leviers ; #268 composeur EN AMONT ; #269 « Hypothèses »+ordre retrait AUTO ; #270 annotations
  courbe retraite/rentes/épuisement). Conseils déclinés mois→année = déjà ActionPlanDrilldown. Robustesse =
  l'optimiseur MC. RESTE optionnel : remonter un résumé « prochaines actions » sur la vue Projection (cadrage Marc).
  --- (ancien détail) leviers OBLIGATOIRES avant calcul (l'actuel contenu
  d'Optimisation remonte en amont) ; la courbe affichée = toujours la MEILLEURE selon les leviers ;
  après calcul, choix parmi les courbes retenues puis VERROUILLAGE (PH2-d) ; stratégie de retrait
  AUTO (retirée des paramètres) ; spécificités de la stratégie optimale en langage « qu'un enfant
  comprenne » + ANNOTÉES sur la courbe (**Q1 à poser avant de coder**) ; onglet Paramètres revu
  (moins de texte, previews d'effet, RENOMMÉ) ; « Robustesse » = levier du calcul de départ (retirée
  d'Optimisation) ; stress tests déplacés dans Paramètres ; Optimisation visible seulement à la 1re
  ouverture puis dépliable ; BEAUCOUP plus de leviers, calcul accéléré mais représentatif ; conseils
  du plan d'action REMONTÉS (pas enterrés en bas), clarifiés, déclinés mois/trimestre/semestre/année.
- [x] **[PH4-TX]** ✅ #257 — tri par date/marchand/montant/catégorie (en-têtes cliquables, aria-sort).
  🧭 Reste = refonte visuelle profonde (design → cadrage Marc).
- [ ] **[PH4-BUD]** 🧭 Refonte **Budget** complète — DESIGN, besoin du cadrage Marc (irritants concrets).
  Budget déjà sain techniquement (source unique lastProjection). Routé → `A_FAIRE_MOI`.
- [x] **[PH4-INV]** ✅ Refonte **Investissement** LIVRÉE — #255 autocomplétion à la frappe (Finnhub
  symbol search, debounce + anti-race) ; #256 allocation sur données RÉELLES (`assets`, plus le CSV
  déprécié) + dividendes réels (priorité `Asset.dividendYield/dividendFreq`) ; #259 moins de pages
  (4 → 3 sous-onglets, rééquilibrage fusionné dans l'allocation). 🧭 Reste = polish design (cadrage Marc).
- [x] **[PH4-RET]** ✅ #258 — courbes = source unique (acquis PH2-c) ; invite ProjectionRequired (CSV
  déprécié retiré). 🧭 Reste = lisibilité (design → cadrage Marc).

## 🚨 P0 — Bloquant pour un vrai produit multi-utilisateurs
> ⚠️ **Décision 2026-07-06 (Marc)** : app SOLO — multi-user REMISÉ indéfiniment (focus qualité AAA). Items P0 relus
> sous cet angle : **sync Drive + gate Google = multi-APPAREILS de Marc** (pas multi-user public). `docs/decisions.md`
> ADR-002, `docs/VISION.md` cap produit.

- [~] **[P0-PROXY]** 🔧 Proxy backend pour la clé Anthropic — **Phases 1-2 LIVRÉES dark-launch** (2026-07-06) :
  relais BYOK (clé chiffrée, Edge Vercel, anti-abus). **Code livré** : `api/_lib/relay.ts` (proxy cœur +
  allowlist modèles/clamp/no-store/annulation chaînée/zéro log), `api/claude/[...path].ts` (route Edge),
  middleware Vite (dev), makeClient switch kind text/vision, 13 tests. **RESTE** : (a) Marc pose 2 env Vercel
  (PROXY_ACCESS_TOKEN serveur + VITE_PROXY_ACCESS_TOKEN build) → redéploie ; (b) smoke test via flag
  VITE_CLAUDE_TRANSPORT=proxy basculable (défaut direct pour Vision, switch relais phase 4) ; (c) spike Vision
  (~13 Mo/90 s vs limites Edge ~10 Mo). *Cf* `A_FAIRE_MOI` O4.
- [ ] **[P0-IDB]** 🔧 Migrer la persistance `localStorage` → IndexedDB (quota ~5 Mo + parsing
  synchrone bloquant au boot). ⚠️ Migration du schéma persist v7 — vigilance corruption.
- [ ] **[P0-SYNC]** 👤 Prouver la sync Drive en réel : créer `VITE_GOOGLE_CLIENT_ID`, tester en
  fenêtre privée (cf `A_FAIRE_MOI` O3 + tests manuels ci-dessous).
- [x] **[P0-AUTH]** ✅ (2026-06-16) — **Cloudflare RETIRÉ de FinanceAI**, gate Google in-app actif. Marc a :
  créé l'OAuth client + posé `VITE_GOOGLE_CLIENT_ID`+`VITE_GOOGLE_GATE=1` (Vercel) + validé (login + données +
  anti-lockout + pas de re-login) + supprimé l'app Cloudflare Access + dé-proxifié apex/www (DNS only → Vercel).
  Piège rencontré : le client OAuth était PARTAGÉ avec CF Access (flux serveur, redirect_uri `cdn-cgi/access/callback`)
  → l'avoir retiré cassait le login CF (`redirect_uri_mismatch`) ; restauré le temps de valider, puis CF retiré.
- [x] **[CF-CODE]** ✅ (2026-06-16) — retrait code-side : CSP nettoyée (`cloudflareinsights` retiré de
  `vercel.json` + `index.html`) ; commentaires périmés MAJ (`secureKeyStore.ts` — la sécu ne repose plus sur CF
  Access, le gate est SOFT + clé par-appareil ; `App.tsx`, `lazyWithRetry.tsx`) ; docs MAJ (CLAUDE.md, A_FAIRE_MOI O1).
  **RESTE optionnel (durcissement gate, séparé)** : bouton « se déconnecter », sélecteur de compte
  `prompt:'select_account'` (aide [PROFIL-SWITCH]), indicateur de sync, client OAuth DÉDIÉ au gate (découpler de CF).

## 🆕 Signalements Marc (2026-06-16)
- [ ] **[PROFIL-SWITCH]** 🔧 HIGH (data-sensible) — le switch entre comptes/profils est compliqué et
  instable : (a) **fuite** — garde en mémoire des infos des profils de TEST après changement ;
  (b) choix de profil **pas assez explicite** (on ne voit pas clairement lequel/quel type est actif) ;
  (c) calculs **pas assez précis/sûrs** selon le profil actif ; (d) **mauvaise sauvegarde** des données.
  Plan : **reset COMPLET à chaque switch** (auditer `personaResetBase`/`personaReset` — visiblement laisse
  passer des données test ; cf #217 mode test persisté) ; **sélecteur explicite** (nom + type réel/test +
  bannière persistante du profil actif + confirmation au changement) ; **persistance isolée par profil**
  (clé storage par profil, pas d'écrasement croisé, vérif d'intégrité au chargement) ; garde-fou « quel
  profil/hypothèses alimentent ces chiffres ». ⚠️ Touche la persistance (schéma v7) → vigilance corruption,
  lié à [P0-IDB]. Plan-first + panel avant de coder (data-critical). *Cadrage à confirmer/préciser par Marc.*
- [~] **[RECH-ACTION-UX]** ◑ MEDIUM PARTIEL (PR #355, 2026-06-18) — (1) ✅ dropdown d'autocomplétion **agrandi**
  (`max-h-64`→`80`) ; (2) **cause la plus évidente corrigée + TESTÉE** : Escape fermait toute la modale (le `Modal`
  écoute Escape sur `document`) → désormais Escape ferme le DROPDOWN sans fermer la fenêtre (`stopPropagation` +
  `stopImmediatePropagation`, test composant prouve `onClose` non appelé). ⚠️ Le symptôme EXACT « sélectionner le
  prix fait quitter » n'a pas pu être reproduit en navigateur (le dropdown exige une clé Finnhub absente en dev) →
  **confirmation visuelle Marc requise** (routé `A_FAIRE_MOI`). Le fallback FINNHUB-MISMATCH ci-dessous améliore
  aussi le ressenti « sélection → coincé ».
- [x] **[FINNHUB-MISMATCH]** ✅ MEDIUM (PR #355, 2026-06-18) — l'autocomplétion Finnhub `/search` proposait des
  symboles que le `/quote` du forfait gratuit ne sait pas coter (TSX/étrangers) → erreur sèche « introuvable ».
  Fix : `selectSuggestion` bascule en **saisie manuelle pré-remplie** (symbole+nom) + notice informatif quand
  le symbole n'a pas de cours (`'no-quote'`). Panel : distinction `'no-quote'` (fallback) vs `'error'` réseau
  (erreur VISIBLE, pas de masquage silencieux — silent-failure-hunter HIGH intégré). 3 tests composant.

## 🧭 Décisions moteur (à trancher avec Marc — money-critical)
- [ ] **[ITEM-2A]** 🧭→🔧 **APPROCHE VALIDÉE PAR MARC (2026-06-16)** : entreprendre le refactor « impôt
  NOMINAL » (revenu nominal + paliers/BPA/crédits indexés par `simInflation`, supprime l'aller-retour
  déflate→impôt→réinflate lossy). **Phase 0 FAITE** (2026-06-16) : test de caractérisation
  `tests/services/tax.item2a.characterization.test.ts` qui PIN le comportement actuel (filet golden — ex.
  impôt 100 k$ : 25 510 $ en 2026 → 20 355 $ en 2046, dérive ~5,2 k$ du 1,02 en dur), zéro changement moteur.
  **RESTE** : **Phase 1** — paramétrer `getIndexedBracketsForYear(year, rate)` + threader le `rate` dans
  `calculateFiscalReport` ET ses sous-calculs indexés (BPA, `calculateAgeAndPensionCredits`, FSS, RAMQ),
  défaut 0,02 (additif, zéro régression) ; **Phase 2** — basculer les ~10 sites d'appel sur revenu nominal +
  `simInflation`, retirer les déflations (`monthlyCalcs.ts:92-110`, latentTax, retirementIncome, taxDecember…),
  **re-baser les golden Phase 0 + les baselines SCIEMMENT** (prouver le rapprochement vs ARC), panel
  fiscal-accuracy + projection-validator. ⚠️ Money-critical, plan-first à chaque phase, gate + panel.
- [x] **[ITEM-2C]** ✅ **PHASES 1+2 FAITES (2026-06-25 : FERR per-conjoint + PSV/RRQ per-conjoint)**. RESTES : reset REER 71 + per-conjoint PSV/RRQ AU DÉCÈS = **DÉCISION Marc 2026-07-06 : LAISSER EN LIMITE ASSUMÉE** (doc `FISCAL_REFERENCE §9` coté survivorMode, impact $ minimal). Clos.
- [x] **[B-AUDIT-5]** ✅ **DÉJÀ CORRIGÉ** (vérifié 2026-06-19, Marc avait dit « corriger »). Le SRG est DÉJÀ exclu
  de l'assiette du clawback PSV : `projection.ts:918` passe `incomeRetirement − incomeRetirementGis` à
  `computeOasClawback`, l.921 `v − gisShare` par conjoint, l.929 le cap `pensionPSV − incomeRetirementGis`
  (corrigé implicitement par FA-2/FA-3/FA-8). Le `incomeRetirement` AVEC SRG ne sert qu'au reset de janvier
  (l.945), pas au clawback. Item périmé → PAS de fake fix (un faux fix d'impôt = pire que le finding).
- [x] **[H1]** ❌ DÉCISION Marc 2026-06-19 : **PAS de chiffrement par passphrase** (risque recovery > valeur ;
  cascade IndexedDB chiffré suffit). Clos, décliné.

## 💰 Audit fiscal + moteur 2026-06-09 (3 agents : fiscal-accuracy, projection-validator, code-analyzer)
> 0 BLOCKER. Socle exact (barèmes/BPA/RRQ/RAMQ/FSS/FERR/retenues conformes au doc). Détails dans les
> rapports d'agents (session 2026-06-09). Chaque correctif fiscal = code + FISCAL_REFERENCE même PR.
- [x] **[FA-1]** (livré #221) Assiette du crédit pension (féd 31400 + QC 361) inclut RRQ/PSV à tort
  (`taxDecember.ts:362-364`) — ARC/RQ les EXCLUENT. Restreindre à DB + FERR 72+. **Non conservateur**
  (~250-680 $/an/personne 65+). Le plus systémique des findings.
- [x] **[FA-2]** (livré #222) Clawback PSV : revenu FAMILIAL comparé au seuil INDIVIDUEL (`taxDecember.ts:39-44`)
  → clawback fictif jusqu'à ~14 k$/an pour un couple 95-190 k$ (conservateur mais massif).
  Calculer par conjoint (les décompositions per-user existent) ou documenter en §9.
- [x] **[FA-3]** (livré #222) SRG : (a) imposé à tort (non imposable) ; (b) clawback ignore retraits REER/gains
  → SRG fictif jusqu'à ~13 k$/an en scénario FIRE bas revenu (`retirementIncome.ts:206-220`). **Non
  conservateur** (b).
- [x] **[FA-4]** (livré #221) CELI dupliqué : `taxJanuary.ts:89-92` recalcule 7000×inflation au lieu de lire
  `CELI_ANNUAL_LIMITS` (2027 : 7 000 vs 7 500 au doc). Brancher sur la source unique.
- [x] **[FA-5]** (livré #221) NPV rentes succession : `governmentPension × 0,65 × activeUsersCount`
  (`estateCalculation.ts:144-145`) alors que le moteur le traite déjà comme FAMILIAL → ×N en double,
  `estateNetWorth` couple gonflé de dizaines de k$.
- [x] **[FA-6]** ✅ **FAIT (2026-06-23)** — Dons charitables : crédit par PALIERS (`utils/donationCredit.ts`, féd 15/29 +
  QC 20/24 → 35 % / 53 %, FISCAL_REFERENCE §10 daté+sourcé) remplace le `33 %` plat ; volet titres `−0,15·don` (inventé) SUPPRIMÉ.
  ⚠️ **Découverte CRITIQUE en cadrant** : le crédit (et la taxe locative/CCPC) allait dans `taxCurrentYear.revenu`, **ÉCRASÉ en
  décembre année ACTIVE** (`taxDecember:406` `=` vs `+=` retraité) → un salarié actif donateur n'avait AUCUN bénéfice fiscal, et les
  loyers/dividendes CCPC d'un actif n'étaient PAS imposés. Fix = router les 3 ajustements W5 vers `divers` (jamais écrasé) via
  `addTaxDivers`. Panel financial-integrity + projection-validator = CORRECT, 0 régression, conservation 35/35, discriminant
  `git stash` prouvé. Découvertes routées ci-dessous (FA-6-CREDIT-CAP, W5-TAX-PROXY).
- [x] **[FA-6-CREDIT-CAP]** ✅ **FAIT (2026-06-23, même PR que FA-6)** — le crédit-don (non remboursable) est désormais PLAFONNÉ
  à l'impôt sur le revenu + gains de l'année. Champ séparé `taxCurrentYear.donCredit` (accumulé en janvier) → `taxDecember`
  le plafonne à `grossIncomeTax + max(0, gains)` puis l'applique à `divers` (RAMQ/FSS hors assiette). Un crédit non remboursable
  ne génère plus de remboursement net (donateur bas-revenu : crédit borné à son impôt) ; l'excédent est perdu (pas de report
  modélisé). Tests unitaires (revenu élevé = complet, revenu bas = plafonné, revenu nul = 0) + discriminant `git stash` (sans cap,
  les tests bas/nul échouent). Panel financial-integrity + projection-validator + silent-failure-hunter.
- [x] **[W5-TAX-PROXY]** ✅ **DÉCISION Marc 2026-07-06** : **(a) Garder les proxies plats** (0,45 locatif / 0,36 CCPC) documentés en tant qu'estimation de taux marginal QC. Ajouter une mention UI + source de taux marginal QC dans `FISCAL_REFERENCE.md` (rapide, honnête). Option (b) = modéliser l'impôt incrémental réel (exact, mais plan-first dédié, impact moteur). Choix : (a). Clos.
- [x] **[FA-7]** 🔧 (livré) §8 immobilier transcrit dans FISCAL_REFERENCE : B-20 (plancher 5,25 %,
  +2 pts, GDS 39/TDS 44), mise de fonds min + amortissements SCHL (30 ans FTB/neuve août 2024),
  primes SCHL par LTV (0,60→4,00 %), mutations QC 2025 (paliers + note Montréal non modélisé,
  à réindexer 2026), TPS/TVQ neuf (36 %/6 300 $ · 50 %/9 975 $, dégressifs), Smith/HELOC LTV 65 %
  + margin call. Découverte routée vers FA-8 : taux HELOC 5 %/an EN DUR (`realEstateMonth.ts:336`)
  — hypothèse de modèle à paramétrer.
- [x] **[FA-8]** ✅ mergé (PR FA-8) — lot mineurs fiscaux LIVRÉ (10 sous-items, 2 vrais bugs : cap clawback PSV versée + assiette dividendes ; panel fiscal-accuracy AUCUN BLOQUANT ; 11 tests dédiés, preuve par mutation). Restes requalifiés ci-dessous. Ex-périmètre. **LIVRÉ 2026-06-11 (10 sous-items, en attente de merge)** :
  taux clawback 15 % nommé+sourcé (`OAS_CLAWBACK_RATE`, utils/tax.ts) · **cap clawback = PSV
  réellement VERSÉE** (breakdown décembre hors SRG : facteur de report, bonus 75+, prorata
  résidence, survivant — couvre AUSSI « cap ignore prorata/`psvEstimateMonthly`/bonus 75+ » et le
  clawback fantôme avant `psvStartAge` ; `psvBasePension` = repli legacy) · prorata RRQ 39 ans /
  PSV 10-40 ans documentés (doc §6 + commentaires sourcés retirementIncome) · split 65/35 →
  constantes de MODÈLE `GOV_PENSION_*_SHARE` (3 sites unifiés : setupSimulation, retirementIncome,
  estateCalculation) + doc §6 · SystemView TAX_MODULE composé depuis `TAX_BASE_YEAR`/
  `FED_BRACKETS[0].label`/`BASIC_PERSONAL_AMOUNT_FED` · assiette dividendes ALIGNÉE gains
  (+`accRetraitsReerYear` dans `incomeForDiv`) + hypothèse « 30 % du rendement = dividendes »
  documentée §3 · retenue US 15 % sourcée (`US_DIVIDEND_WITHHOLDING_RATE`, convention Canada–É.-U.
  art. X(2)b)/XXI — 4 sites : assetLocation ×3 + glidepathRates) · **FSS réindexé barème 2026**
  (18 500/33 500/64 355/149 355, RQ+CFFP vérifié 2026-06-11 — le code portait le barème 2025 sous
  libellé 2026) · retenue FERR : `eligiblePensionIncome` = retraits REER/FERR N-1 par tête (aligné
  FA-1 ; impact chiffré NUL — `marginalRate` est bracket-only, documenté code+doc §7) ·
  `calculateCeliRoom` unifié sur l'extrapolation taxJanuary (`LAST_KNOWN_CELI_YEAR` exporté,
  fallback `|| 7500` figé supprimé).
  **RESTES (non couverts par le lot)** : ~~`setupSimulation.ts` `inflationRate || 2.0` masque le
  0 légitime (→ `??`)~~ ✅ FAIT (PR #273 — `?? 2.0`, le 0 % saisi est respecté ; 3 tests ; rayon
  baselines nul = aucun fixture à inflation 0 ; + 2 sites UI alignés : Retirement label, ChildPlanning
  coûts, sinon un scénario 0 % affichait/indexait 2 %) · ~~NPV estate lit `governmentPension` même quand `rrqEstimateMonthly` est
  fourni (divergence silencieuse)~~ ✅ FAIT (estateCalculation : les estimés RRQ/PSV priment, ×N
  per-personne comme retirementIncome ; repli 65/35 sans ×N préservé = garde FA-5 ; 5 tests) ·
  ~~**[RRQ-PSV-MIN]** inputs RRQ/PSV sans `min={0}` → un estimé NÉGATIF sous-estimerait en silence~~
  ✅ FAIT : clamp `Math.max(0, …)` dans retirementIncome ET estateCalculation (symétrique) + `min={0}`
  UI sur les 2 inputs ; test (négatif clampé == estimé 0). ·
  assiette clawback PSV/test SRG sans dividendes/intérêts non-reg
  (revenu net 23400 les inclut — sous-estime, borné au cap) · **[FSS-PSV]** 🔧 assiette FSS inclut la
  PSV — l'Annexe F la DÉDUIT (revendiqué sourcé 2026-06-11, page RQ « Cotisation des particuliers au
  FSS »). **Trace 2026-06-12** : confirmé que la PSV est DANS `incomeRetirementMonthly` (taxDecember.ts:662)
  donc bien dans l'assiette FSS ; SEUL le SRG en est retranché (`incomeRetirementGisMonthly`). Le fix
  exige (a) câbler un montant PSV mensuel familial dans le `ctx` de décembre (depuis le breakdown
  `computeRetirementIncome` — RRQ+PSV+DB par conjoint existe déjà, mais PAS la PSV isolée) puis le
  soustraire de l'assiette FSS comme le SRG ; (b) **transcrire d'abord la règle Annexe F dans
  FISCAL_REFERENCE** (actuellement ABSENTE : §FSS ne documente que l'exclusion SRG) — money-critical,
  ne pas implémenter sans source transcrite. PR dédiée. · lagged SRG déflaté du facteur du mois courant
  (~1 an d'écart, SRG légèrement surévalué) · `ghOtherNominal` (récolte de gains, retraité) inclut
  le SRG non imposable → palier visé trop petit (conservateur) · **dbMonthly quasi-nominal dans le
  revenu test SRG réel** (post-FA-9 : SRG coupé de plus en plus tôt pour un profil DB, conservateur
  mais amplitude ×1,49 à 20 ans — déflater la composante DB) · **plafonds ×N non survivor-aware**
  (découverte FA-10) : droits CELI/REER/CELIAPP continuent de s'accumuler pour le défunt
  (`projection.ts` fhsaRoom, `taxJanuary.ts:159`) — sous-imposition indirecte mineure · retenue FERR
  estimée sur 2 têtes en survivorMode (timing seulement, réconcilié en décembre) · taux HELOC
  5 %/an en dur (`realEstateMonth.ts:336`, découverte FA-7 — hypothèse de modèle à paramétrer) ·
  🧭 « montant pour personne vivant seule » QC (grille TP-1.G) absent code+doc — pertinent pour un
  survivant, NE PAS chiffrer sans source Revenu Québec.
- [x] **[FA-12]** 🔧 (livré) Test d'intégration survivorMode SEEDÉ (`projection.survivor.test.ts`,
  5 tests) via hook test-only `__runScenarioForTests`. Astuce clé : `replayHistoricalYear` override
  les taux APRÈS les tirages MC → runs modelSurvivor ON/OFF BIT-IDENTIQUES jusqu'au décès (crypto=0,
  tous les flags stochastiques off), la divergence NetWorth EST le décès. Conjoint 100 ans (p=0,33
  plafond), seed k=0 épinglé → décès au PREMIER janvier (mi=12). Contrats : divergence exactement à
  mi=12 · totalTaxesPaid survivant > base ×1,10 (FA-10, 1 contribuable — mesuré +55 %) · NW final
  survivant < base (PSV défunt cesse) · base identique ∀ seed (aucun tirage si OFF) · série complète
  (la sim continue). En MC le chartData est ALLÉGÉ ({NetWorth, monthIndex}) → assertions par agrégats.
  Si un changement moteur décale la consommation rng : re-scanner k=0..7 (procédure en tête du test).
- [x] **[FA-11]** 🔧 (résolu par DOCUMENTATION — l'option prévue au ticket) Discontinuité SRG au
  seuil documentée en limite assumée dans FISCAL_REFERENCE (§ SRG) : marche ~167 $/mois au seuil
  22 512 $, SRG surévalué (non conservateur) dans la bande ~18-22,5 k$, cause = top-up récupéré
  ~25 ¢/$ supplémentaires non modélisé. Les paramètres exacts du top-up ne sont publiés que via les
  TABLES trimestrielles Service Canada (pas de formule officielle) → les chiffrer sans source
  violerait la règle fiscale. Reste ouvert (🧭 si voulu) : transcrire les tables et modéliser la
  vraie courbe continue.
- [x] **[FA-9]** 🔧 (livré) **Double indexation du SRG** corrigée : `calculateGISBenefit` appelé
  SANS `year` (barème 2026 de base = base réelle, comme RRQ/PSV) contre le revenu test réel, puis
  nominalisation UNIQUE ×inflFactor. Avant : max+seuils ×1,02^Δ dedans PUIS ×inflFactor dehors →
  max surévalué ~49 % à 20 ans (~+6,5 k$/an fictifs) + seuils nominaux face à revenu réel.
  4 tests anti-régression (max simple-indexé, réel constant, seuil de coupure réel) +
  FISCAL_REFERENCE §6.3 note d'indexation. L'util garde son param `year` (usages nominaux hors moteur).
- [x] **[FA-10]** 🔧 (livré) Impôt de décembre en **survivorMode** : le revenu du survivant était
  réparti sur 2 têtes (barème progressif 2× à demi-revenu + crédits d'âge du défunt + fractionnement
  fictif + RAMQ/FSS ×2 = sous-imposition). Fix au call-site (pattern FA-2) : `taxFilers = survivorMode
  ? 1 : activeUsersCount`, `ageSpouse`/décompositions par conjoint coupés, DB AGRÉGÉE sur une tête
  (crédit pension complet), salaire du défunt à 0 dans la branche active de décembre. 4 tests de
  contrat (vrai barème progressif). Bonus : commentaire W1.4 INVERSÉ corrigé (survivant = user1,
  défunt = user2 — `activeIncome.ts:61` faisait foi).
- [x] **[PV-1]** 🔧 (livré — choix Marc : cascade de vente) Liquide négatif effacé silencieusement :
  les débits DIRECTS (impôt d'avril, véhicules/rénos W5, échéances d'objectifs) rendaient `liquid < 0`,
  clampé à 0 par `applyMidMonthGrowth` = dette effacée, patrimoine SURÉVALUÉ. Fix : sauvetage unique
  avant la croissance — découvert couvert par la MÊME cascade que le shortfall régulier (stratégie,
  retenue REER, PBMA/OAS) ; résiduel insolvable journalisé + compté (`shortfallMonths`). Tests de
  conservation (`projection.overdraft.test.ts`). Révélation : Karim (retraite 50, MCP 20 ans) était
  maintenu « solvable » par ~32 k$ d'impôts d'avril avalés → ruine honnête à l'an 20 (test MCP passé
  à 10 ans). Bonus : `get_projection` MCP — `finalNetWorthNominal` = NW brut (cohérent avec `real`),
  successoral exposé séparément (`estateNetWorth`, comme get_retirement_outlook). ⚠️ Sémantique :
  les mois de sauvetage comptent désormais dans `shortfallRate` (honnête — il a fallu vendre).
- [x] **[PV-6]** ✅ Résiduel insolvable = dette portée : quand la cascade du sauvetage PV-1 ne couvre
  pas tout (comptes épuisés / cap OAS), le résiduel est journalisé puis absorbé (convention CF-2 des
  shortfalls non couverts) → NW encore surévalué du résiduel dans les scénarios DÉJÀ en ruine. Modéliser
  un passif `liquidDebt` cumulé (affiché au bilan) si on veut un NW honnête en insolvabilité. Basse
  priorité (scénarios concernés déjà signalés par shortfallRate/successRate). (M)
- [x] **[PV-2]** 🔧 (livré) Récolte de gains ignorait `capitalLossBank` : la banque de pertes (TLH)
  est désormais consommée EN PREMIER (LIR 111(1)(b)) — part compensée = 0 $ d'impôt et HORS palier
  (step-up d'ACB gratuit), remplissage du palier sur le latent restant. `consumedLoss` retourné au
  caller (seule la part non compensée entre dans `accCapitalGainsYear`). 4 tests + FISCAL_REFERENCE §3.
- [x] **[PV-11]** ✅ mergé #247 — (a) métrique `goalShortfalls {count,total}` (hook onGoalShortfall,
  3 tests) ; (b) retraits de goals aux séries withdrawal* ; (c) `_label` retiré ; (d) docstring
  portfolioOps précisé. + clamp liquid négatif (un goal n'efface plus un découvert). Validé
  projection-validator (1927/1927, baselines intactes) ; réserve per-conjoint → PV-11e.
- [x] **[PV-7]** 🔧 (livré) Ventes de CRYPTO via `handleCryptoSale` (miroir de handleNonRegSale) :
  gain proportionnel + banque de pertes (LIR 111(1)(b)) + pertes banquées, aux 2 sites de vente en vie
  (cascade de shortfall `cashflowAllocation.ts`, goal-mutator `projection.ts`). Avant : gain BRUT
  (banque ignorée) et pertes JETÉES. 5 tests unitaires. (Estate latent : NonReg ET crypto ignorent la
  banque symétriquement — hors scope.) Reste le câblage caller de gainHarvesting non testé (cf PV-11).
- [x] **[PV-8]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — TLH fabriquait une perte à partir du seul
  rendement (`harvestedLoss = fakeSell × dropRate`), SANS regarder l'ACB : un titre en gain latent en
  année négative donnait une perte fictive qui gonflait `capitalLossBank` (et PV-2 transformait chaque $
  fabriqué en step-up d'ACB gratuit → sous-imposition des gains réels). Désormais borné par la perte
  LATENTE RÉELLE : `harvestedLoss = max(0, costBasisSold − fakeSell)` avec `costBasisSold = fakeSell ×
  (ACB/valeur)` = `0,5 × max(0, ACB − valeur)`, indépendant du taux ; gain latent → 0 récolte.
  Conservation `acbDelta = −L`. FISCAL_REFERENCE §3 : hypothèse « perte apparente » LIR 54/40(2)g)(i)
  levée (rachat fonds corrélé non identique). Tests réécrits (anti-fabrication, rate-indépendance,
  monotonie en profondeur de perte, conservation).
- [x] **[PV-9]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — gains en capital désormais inclus au test
  SRG ET au clawback PSV : le gain RÉALISÉ imposable (×0,5) entre dans le revenu net des deux tests.
  SRG → `prevYearCapitalGainsForGisNominal` (lag N-1, capturé en décembre avant reset, déflaté) ;
  clawback PSV → `accCapitalGainsYear` de l'année N passé à `computeOasClawback` (réparti également).
  Avant : exclus → un 65+ bas revenu avec gains/gainHarvesting voyait un SRG fictif (surévalué) et
  aucun clawback. Pas de double-comptage (N-1 vs N). 6 tests (SRG = REER ×0,5, clawback, gardes NaN).
  Reste hors test (FA-8) : dividendes/intérêts non-reg.
- [x] **[PV-10]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — goal-mutator NonReg : le retrait
  `'NON-ENREG'` des échéances d'objectifs passe par `handleNonRegSale` (ACB proportionnel, banque
  de pertes, gain → accCapitalGainsYear → imposé en décembre). Avant : ACB décrémenté du montant
  VENDU complet et AUCUN gain réalisé (jamais imposés + ACB faussé). Test d'intégration discriminant
  (delta TaxPaidGains avec/sans objectif — échec prouvé sans le fix). Bonus : logs d'objectifs
  HONNÊTES (montant TIRÉ + « visé X — fonds insuffisants », au lieu de la cible toujours affichée).
  Piège documenté : la room historique CELI/REER ignore `celiContributed` → fixture de test via
  `useManualBalances` + rooms 0.
- [x] **[PV-3]** 🔧 (livré) Fractionnement : l'assiette du crédit pension (féd 31400 / QC 361) SUIT
  désormais la pension transférée vers le récipiendaire (ARC : le bénéficiaire du fractionnement peut
  réclamer le crédit sur la pension reçue). `combinedTaxFor` prend l'assiette par appel ; la grille
  passe `{splittable[H]−tr, tr}`. Avant : assiette gelée pré-split → récipiendaire jamais crédité
  (conservateur). Test d'effet (impôt < assiette gelée, grille reproduite). FISCAL_REFERENCE §6.
- [x] **[PV-4]** 🔧 (livré) Tests des clamps hors-bornes `rrqStartAge`/`psvStartAge`
  (`retirementIncome.ts:184-185`) : 4 tests — 55→60 (rien à 59, identique à un 60 explicite),
  80→72 (facteur ×1,588 appliqué), PSV 60→65 (pas d'anticipation), PSV 80→70 (×1,36 vs 65).
- [x] **[PV-5]** 🔧 (livré) Champs `number` Retraite — saisie vide écrasée silencieusement (découverte EP-8) :
  `updateGoal('X', Number(e.target.value))` (`Retirement.tsx`) persistait `Number('')` = **0** (pas NaN ; et
  NaN sur saisie mi-frappe « - »/« 1e »). En projection (`retirementIncome.ts:203-208`) : `dbPensionStartAge`
  vidé ⇒ 0 ⇒ `age >= 0` toujours vrai ⇒ pension DB versée « dès 0 an » ; estimé RRQ/PSV vidé ⇒ 0 (≠ `undefined`)
  ⇒ le moteur ne retombe plus sur la rente agrégée (`!== undefined`, l.187-191). Fix : `utils/numericInput.ts`
  (`numOr` requis → repli valeur courante ; `numOrUndef` optionnel → `undefined`, jamais 0/NaN) appliqué aux
  10 `<input number>` + tests unitaires. Validé par projection-validator (1835/1835, invariants OK, 0 régression). (S/M)

## 🧽 Audit code 2026-06-09 (code-analyzer) — dette actionnable
- [~] **[CA-01]** PARTIEL — code mort utils/. ✅ **`safeNumber.ts` (30 l) SUPPRIMÉ** (PR #373, 2026-06-19) : util de
  coercition NaN jamais adopté (le moteur garde inline via `Number.isFinite`) → aucun consumer prod (grep : fichier +
  son test seulement), retiré avec son test. ⚠️ **`csvExport.ts` N'EST PAS mort** (affirmation d'origine périmée) : USÉ
  par `components/Transactions.tsx` (export CSV) → NE PAS supprimer. Reste à vérifier 1-à-1 (knip bruyant, pas en masse) :
  exports orphelins (addPurchase/removePurchase, formatMonthYear, `getHasUserDataSnapshot`). NB `formatCompactCAD` EST
  utilisé (axes/tooltips compacts, cf CLAUDE.md formatage) → pas mort. (S)
- [x] **[CA-02]** ✅ (helpers délèguent à formatCAD — source unique, format préservé) Unifier le formatage monétaire : 11 helpers locaux divergents (« 1 234$ » vs
  « 1 234,00 $ »…) → `formatCAD` de `utils/format.ts` ; résorber ~135 `toLocaleString`. (M)
- [ ] **[CA-03]** Finaliser la migration `utils/tax.ts` (820 l) → `services/tax.ts` (alias 5 l
  inachevé, ~20 imports directs restants). (S)
- [x] **[CA-04]** ✅ Smoke tests des 8 composants money-critical sans test direct (DebtManager,
  ChildPlanning, TaxCenter, RealEstate, Retirement, Investments, FutureProjection, AiAssistant) — rendent sans crash.
- [ ] **[CA-06]** Découper `FutureProjection.tsx` (1000 l) + centraliser ses 32 hex dans
  `chartColors`. (L)
- [ ] **[CA-07]** Tokens couleur : `constants/chartColors.ts` (source Recharts), 20 hex en className
  à bannir, 247 classes palette brute → tokens sémantiques. (Le « ~636 text-gray » du D3 est réglé :
  0 restant.) (M)
- [ ] **[CA-08]** Primitives `ui/Input`, `ui/Select`, `ui/Field` (label+erreur+aria) + migrer les
  hotspots (AdvancedProjectionParams 40 inputs, PatrimoineExtended 19, Onboarding 11,
  ProjectionControls 10). (M)
- [ ] **[CA-09]** Découper `services/pdfReport.ts` (847 l) et `services/claude.ts` (768 l) ; évaluer
  l'extractible restant de `projection.ts` (1387 l). (L)
- [x] **[CA-10]** ✅ (quasi complet) — `usePastPortfolioHistory` (dédup PH2-c-1 + `.modes` : mode test,
  anti-fuite réel→test M3, gardes) + **`usePwaInstallPrompt`** (`tests/hooks/usePwaInstallPrompt.test.ts`,
  11 cas : recence de dismiss 30j + garde `Number.isFinite`, standalone, flux beforeinstallprompt/
  promptInstall/appinstalled). `assetMeta` n'existe plus (module supprimé) ; `analytics.ts` = trivial
  (`trackPageView` 40 l, un seul wrapper) → test sans valeur, laissé. (S)

## 🧹 Grand nettoyage AAA — items ENCORE ouverts (réf. `AAA_AUDIT_2026-06.md`)
> D1 (money CF/M-*), D5 (robustesse), D6 (double-h1, focus tour), D9 (robustesse LLM/ingest) = ✅ **faits**
> (détail dans l'audit). Restent les gros chantiers à décision/risque :
- [ ] **[D3]** Design system : codemod des ~636 couleurs ad-hoc (`text-gray-*`, hex) → tokens
  (`ink-*`, `surface`, `success/warning`) + règle ESLint anti-régression. Raffine l'existant
  (dark + emerald), zéro changement d'apparence rendue.
- [ ] **[D4]** God-files : scinder par impact `Investments` (1154) → `FutureProjection` (969) →
  `Budget` (892) → `Transactions` (729) → `Dashboard` (621)… + **[D4-H2]** sélecteurs atomiques
  (App re-render sur tout slice non-`lastProjection` + prop-drilling via `TabRouter`).
- [x] **[D6-SR]** ✅ (gros du lot) — primitive `<PrivateAmount>` (aria-hidden + sr-only « Montant
  masqué » en mode privé, blur CSS inchangé, 4 tests) + MIGRATION : `KPIStat` (prop privacy → couvre
  TOUS les KPI), `DualKPIStat`, `CurrentCapitalCard` (6), + 13 sites one-liner via codemod conservateur
  (RealEstate, Investments, Dashboard, ChildPlanning, StressTestPanel, PropertyConfigurator,
  NetWorthByOwnerCard).
- [ ] **[D6-SR-2]** 🔧 (reste de migration, enrichi revue #247) — ~69 occurrences `privacy-blur`
  restantes : INPUTS (légitimes — un champ éditable doit rester utilisable par son utilisateur SR ;
  **SLIDERS ✅ FAIT** : helper partagé `maskedSliderAria(isPrivacyMode)` (`utils/privacyAria.ts`) +
  `aria-valuetext="Montant masqué"` sur les 5 sliders monétaires masqués — PropertyConfigurator
  prix/mise de fonds, ProjectionControls revenu/dépenses théoriques + plafond immo ; helper réutilisable
  pour les sliders restants ; ChildPlanning REEE NON masqué visuellement → pas de parité à corriger.
  **+ `aria-label` (nom accessible) sur ces 5 sliders** (leurs `<label>` ne sont pas associés) + constante
  partagée `MASKED_AMOUNT_LABEL` (DRY entre `privacyAria` et `PrivateAmount`)) +
  spans mono-valeur + MONTANTS ADJACENTS. **#282 Retirement (13 mono-valeur → PrivateAmount).** **#283 : primitive
  `<PrivateBlock>` CRÉÉE** (`components/ui/PrivateBlock.tsx` + 4 tests : aria-hidden sur le conteneur + `sr-only`
  sibling, SANS wrapper les enfants → préserve le flex multi-spans, là où PrivateAmount le casserait) **+ Dashboard
  liste d'actifs migré** (bloc diff+revenu → PrivateBlock ; bloc gain → PrivateAmount). RESTE = **finition de masse**
  (~50 `privacy-blur` sur ~16 fichiers ; les primitives PrivateAmount/PrivateBlock/KPIStat/Layout NE comptent PAS) :
  gros = `ProjectionTooltip` (13), `ActionPlanDrilldown` (6), `RealEstate` (4), `StrategyOptimizerPanel`/`Planning`/
  `Budget`/`BudgetGroupTable` (3 ch.), puis RetirementIncomeCard/FutureDetailModal/Transactions/Investments/
  StressTestPanel/ChildPlanning/etc. Outils prêts : mono-valeur → `<PrivateAmount>`, bloc multi-spans → `<PrivateBlock>`.
  Mécanique mais volumineux → à faire par paquets (1 fichier ou 2 / lot).
- [x] **[A11Y-SLIDERS]** ✅ COMPLET — nom accessible (WCAG 4.1.2/2.5.3) sur TOUS les sliders dont le `<label>`
  n'était pas associé. **ProjectionControls** (10 : Horizon, Inflation, Hausse salaire, CELI, NonReg/REER,
  Coussin, Inflation/poste ×6, Part actions US, Rendement div. US, Coût soins LD) + **PropertyConfigurator**
  (Prix, Mise de fonds, Plafond) + **RealEstate** (Rendement Boursier, Appréciation Immo) + **DebtManager**
  (Paiement suppl.) + **TaxCenter** (Cotisation REER, CELIAPP) + **ChildPlanning** (Cotisation REEE) — tous
  `aria-label` = texte visible. **Budget:622** avait déjà un nom ; **HealthIndicator:322** déjà associé via
  `htmlFor`/`id` (SKIP, corrects). Tests : `ProjectionControls.a11y` (13 sliders) + PropertyConfigurator (3) +
  DebtManager.smoke (1) + TaxCenter.smoke (2) ; RealEstate/ChildPlanning vérifiés statiquement (render =
  fixtures goal/enfant, disproportionné pour attribut statique). NB : `aria-label` partout (uniformité) ;
  `aria-labelledby` serait + robuste contre la dérive label↔aria si refonte un jour.
- [ ] **[D6-PRIV-MONTANTS]** 🔧 DECISION Marc 2026-07-06 : **OUI masquer au repose, révéler au focus** — incohérence produit :
  les montants $ des sliders REER/CELIAPP (TaxCenter), REEE (ChildPlanning) et paiement suppl. (DebtManager)
  s'affichent EN CLAIR en mode privé (pas de `<PrivateAmount>`), alors que prix immo, revenus/dépenses théoriques,
  mise de fonds y sont masqués. Solution : chaque slider → encapsuler la valeur numérique DANS un composant qui
  masque au blur/repose (par symétrie avec `<PrivateNumberInput>` — focus révèle, blur re-masque) ; l'input reste
  cliquable. Accessible : `aria-label` porte la vraie valeur SR-safe + le slider se focus normalement. Patches : `TaxCenter.tsx`,
  `ChildPlanning.tsx`, `DebtManager.tsx`. Effort S (3 fichiers, pattern clair). Priorité : post-D7-KBD (lot a11y).
- [ ] **[D7]** → Voir [PERF-BOOT] l.724 (doublon, même tâche, déféré provider-aware).
- [ ] **[D6-KBD]** Sidebar hover-only : labels `opacity-0` focusables + `disabled` bloque
  l'accordéon clavier → rendre pilotable au clavier.
- [x] **[D6-GRAPH]** ✅ **PARTIELLEMENT FAIT (A11Y-INK500 lots 1-2)** — tables de données `ChartDataTable` sr-only ajoutées aux 2 donuts Budget. Reste : graphes restants (projections, investissements) ; résiduel = accès clavier aux graphes.
- [ ] **[D6-HEADING]** `CollapsibleSection` émet son titre dans un `<div className="text-h2">` (pas
  un `<hN>`) → saut h1→h4 dans plusieurs onglets (sous-titres `<h4>`). Ajouter une prop `headingLevel`
  pour un vrai outline (h2/h3). Touche tout le codebase (a11y-auditor 2026-06-09).

## 🚀 [CIX] Couple/Individuel « 1000× » — grande initiative ⏳ (surtout ouverte)
> Fait : impôt par conjoint (revenu A1 + crédits B-AUDIT-3). Reste tout le reste.
- [ ] **[CIX-B]** FONDATION — propriété par personne : `owner` sur `Asset`/`Debt`/comptes +
  util `netWorthByOwner` + vue « Répartition par personne ». Additif, faible risque.
- [ ] **[CIX-A1B]** Impôt exact par conjoint **de bout en bout** (attribution rentes/retraits
  REER-FERR/DB/SRG par conjoint — exige des soldes REER/FERR par conjoint). Lourd, débloque le timing.
- [ ] **[CIX-A2]** Fractionnement du revenu de pension à la retraite (≤ 50 %).
- [ ] **[CIX-A3]** REER de conjoint (spousal RRSP) : cotiser au conjoint à plus bas revenu.
- [ ] **[CIX-A45]** Attribuer déductions au plus haut taux marginal + crédits transférables (frais
  médicaux, âge, conjoint).
- [ ] **[CIX-C]** Scénarios séparation (patrimoine familial QC) + décès (roulement REER/CELI,
  RRQ survivant 60 %, PSV cesse) + comparateur ensemble vs séparé.
- [ ] **[CIX-DE]** Optimiseur de couple (étend G21) + décaissement coordonné à 2 têtes (âges de
  retraite différents, demande RRQ/PSV optimale par personne).
- [ ] **[CIX-F]** Bascule couple↔individuel **sans perte** (mémoriser le conjoint) + avatars/couleurs.

## 🎨 Épuration UI — directives Marc 2026-06-09 (ordre validé)
> Ordre : [UI-SCEN] plans de base → [UI-EPURE] épuration → [U5] → lot a11y (D6) → [ICONS-FUT].
- [x] **[UI-SCEN]** (livré #223) Enlever les « plans de base » : `withdrawalStrategy` = paramètre
  (sélecteur dans Paramètres), moteur 1 scénario (suite moteur 82→33 s, slider déterministe ÷11),
  stress-tests à la demande dans Optimisation (`StressTestPanel`), cartes/badge/Verdict supprimés,
  optimiseur « Appliquer » → paramètre + âges de rentes #210.
- [x] **[UI-EPURE]** Audit visuel global de chaque onglet → **fait (code-analyzer 2026-06-09)**.
  Verdict : Futur→Paramètres = l'écran le plus chargé (« usine ») ; redondances chiffrées
  (patrimoine projeté à 4 endroits, score de santé à 3, renvois « → Futur » dans 6 onglets,
  `UserConfigFields` dans 4 onglets). TOP 10 ci-dessous ([EP-1] seul = ~80% du « moins chargé »).
- [x] **[EP-1]** 🔧 (livré #225) Futur/Paramètres : fusionner « Variabilité » + « Événements stochastiques » en
  une section « Risques & aléas » repliée (gate MC actif) ; 10 toggles stochastiques derrière un
  bouton « Activer des aléas… ». 4 sections → 2, ~20 contrôles visibles → ~8. (M) **Priorité Marc n°1.**
- [x] **[EP-2]** 🔧 (livré #225) Futur/Paramètres : retirer la Card AI note + les pros/cons DUPLIQUÉS (déjà sous
  le sélecteur de stratégie) → un seul bloc stratégie. (S)
- [x] **[EP-3]** 🔧 (livré #226) Dashboard : le 5e KPI « Indicateur Futur » → KPIStat simple « Patrimoine projeté »
  (dernier point lastProjection.chartData, source unique), mini-formulaire retiré. (S)
- [x] **[EP-4]** 🔧 (livré #226) Investments : donut « Score de Santé » retiré (doublon du badge header). (S)
- [x] **[EP-5]** 🔧 (livré #226) Investments : Card « Portefeuille projeté » condensée → patrimoine net projeté
  + lien « Détail par compte dans Futur ». (S)
- [x] **[EP-6]** 🔧 (livré) Configuration : `SetupHub` → ruban discret repliable quand complétude = 100 %,
  hub complet sinon. (M)
- [x] **[EP-7]** 🔧 (livré) Futur/Plan d'action : `ProjectionExplains` — méthodologie (6 Q&A) sous
  `CollapsibleSection` « En savoir plus » repliée par défaut. (M)
- [x] **[EP-8]** 🔧 (livré) Retirement : Card « Revenus & besoins » allégée — bloc « Pension d'employeur
  (DB) » sous `CollapsibleSection` (ouvert seulement si un montant DB existe déjà) ; Besoin + RRQ + PSV
  restent visibles ; champs DB détail toujours conditionnels au montant > 0. (M)
- [x] **[EP-9]** 🔧 (audit ⇒ déjà satisfait) Global : les vrais doublons décoratifs ont été retirés par
  les lots antérieurs (donut santé #226, badge « N événements actifs » #225). L'audit (Explore très
  complet) confirme que les 5 renvois « Futur » restants sont fonctionnels et contextuels (1/onglet :
  KPI Dashboard, bouton Placements, carte Budget, badge Immo, badge REEE) et que `<ProjectionRequired>`
  est un empty-state honnête à GARDER → aucun code à retirer (≤ 1 lien discret/page déjà respecté). (S)
- [x] **[EP-10]** 🔧 (livré) Futur/Optimisation : `StressTestPanel` replié par défaut, `StrategyComparePanel`
  ouvert ; `AssetLocationPanel` RETIRÉ (doublon de l'AssetLocationCard de Retraite, plus riche → fichier supprimé). (S)

## 🎨 P2 — UX & polish
- [ ] **[U5]** Export PNG du graphe « Évolution détaillée » (Dashboard).
- [ ] **[ICONS-FUT]** Icônes Futur exhaustives : une icône typée par événement moteur (transferts,
  hypothèque, ventes, RAP, REEE…) + **LOD/clustering** lié au zoom (`useTimeChartZoom`). Moyen-grand.
- [x] **[ANIM]** Animations de qualité partout (chargements, navigation, KPIs, modales/listes) en
  CSS/WAAPI (pas de framer-motion), compositor-friendly, `prefers-reduced-motion`. Grand, à phaser.
  ⚠️ Piège connu (`index.css:222`) : un wrapper `transform` casse `position:fixed` → animer en opacité
  pure ou via portails.
- [x] **[FUT-OPT]** Onglet Futur : optimisation déplacée dans le sous-onglet « Optimisation »
  (4 onglets Graphique/Paramètres/Optimisation/Plan d'action + écran d'amorçage, #213) ; Robustesse
  + Optimiseur fusionnés en un outil « Comparer les stratégies » 2 modes (#215).
- [x] **[RENTE-80]** Rente retraite « ~80 $ » : cause = rentes couplées à l'âge d'arrêt. Réglé par
  le découplage moteur (`rrqStartAge`/`psvStartAge`, RRQ jusqu'à 72, #210) + UI âge de début des
  rentes dans l'onglet Retraite (#214). 👤 À valider sur ton persona (tests manuels ci-dessous).

## 🛠️ Configuration & Système — retours Marc (2026-06-05)
- [x] **[CFG-PROFIL]** Onglet Configuration → Profil : **regrouper en UN seul ensemble cohérent**
  (Paramètres de retraite « hub central » + Configuration Utilisateurs/Salaires & Macro + Profils
  enregistrés + Mode de répartition) et **améliorer** la présentation.
- [x] **[CFG-COMPTES]** Onglet Configuration → Comptes : **regrouper** (Upload relevé de salaire IA +
  Soldes initiaux + Import CSV bancaire), **retirer le texte inutile**, améliorer.
- [x] **[CFG-SAUVE]** Onglet Sauvegarde : **en retirer le Mode test ET « Connecter à Claude »**
  (mauvais emplacement) → les déplacer (Mode test → Système/diagnostics ; Connecteur → sa propre carte).
- [x] **[SYS-REGROUP]** Refonte page **Système & diagnostics** : tout regrouper, plus simple et propre
  (diagnostics AVEC le journal d'erreurs).
- [x] **[SYS-ERRLOG]** Journal d'erreurs : bouton « Rafraîchir » présent (`ErrorLogViewer.tsx`,
  refreshKey). Vérifié 2026-06-09 — était livré mais jamais coché.
- [x] **[SYS-AUDIT]** Journal d'audit **toujours à 0** → brancher `logAudit()` aux call-sites
  (import CSV, suppressions en lot, restauration backup…). Infra prête depuis #103, jamais câblée.
- [x] **[SYS-WEB]** « Toile d'araignée » : **retirée** (option « la retirer si plus pertinente » —
  `SystemView.tsx:156`). Vérifié 2026-06-09.
- [x] **[SYS-VERSION]** Version & build : branché sur Vite define (`vite.config.ts:31-33` →
  `BUILD_INFO` SystemView), auto-tenu à jour à chaque build. Vérifié 2026-06-09.
- [x] **[NBA-PAGE]** « Prochaine action » : **sortir de la sidebar → page/onglet à part** (la sidebar
  ne devrait pas porter ce widget).

## ⚡🧪🔧 P2/P3 — Perf, tests, dette
- [ ] **[PERF-WK]** Profiler le worker projection (keystroke latency des sliders Futur).
- [ ] **[T3]** Couverture 64 → 80 % (composants lourds restants : Retirement/FutureProjection/ChildPlanning).
- [ ] **[T4]** Automatiser 20-30 tests manuels critiques en Playwright (depuis `MANUAL_TEST_CHECKLIST.md`).
- [ ] **[DT5]** Splitter le worker projection (projection / Monte Carlo / scénarios) si le moteur grossit.
- [ ] **[DT3]** Aligner totalement UI ↔ moteur `ChildPlanning` (cf B2).
- [ ] **[B3]** Early-exit de la bissection `findEarliestRetirementAge` (test ~30 s, pas critique).
- [ ] **[B4]** Audit des fichiers de test pour repérer les assertions obsolètes (structures internes changées).
- [ ] **[BIAIS-CAGR]** `startingBalancesFromHistory.ts` : le « rendement réel » compare 1er↔dernier
  point sans retirer les apports → surestime. Note UI ou exiger ≥ 3 ans.
- [ ] **[NONREG-LOSS]** `handleNonRegSale` ne modélise pas les pertes en capital NonReg (branche
  `capitalLossBank +=` inatteignable) → sous-estime l'efficacité fiscale en marché baissier.

## 🔭 Grosses initiatives — quasi terminées
- ✅ **Copilote d'argent** (onglet Futur, passé+présent+futur+optimiseur) : A1-A3, B1-B2, C1-C4
  **livrés**. Reste 👤 : valider le **passé réel** sur tes données + clé Finnhub.
- ✅ **Connecteur MCP** (Lots 0-3) : livré. Reste 👤 : héberger le `.mcpb` (cf `A_FAIRE_MOI` O2).
- ✅ Refonte graphs G1-G20, audit fiscal 2026, mode strict, centralisation : **livrés** (cf archive).

---

## 👤 Tests manuels en attente — SEULEMENT Marc (sans `[ID]`, jamais auto-cochés)
> Ce que Claude ne peut pas vérifier seul. Détail exhaustif : `docs/MANUAL_TEST_CHECKLIST.md`.

**Connecteur MCP (après hébergement du `.mcpb`)**
- [ ] Install 1 clic depuis la carte → Claude Desktop → « connecte mes finances » → vraies données.
- [ ] Auto-sync : appliquer une paie/un relevé dans Claude → rouvrir l'app → données à jour.

**Sync Drive (version fraîche : Unregister SW puis recharger)**
- [ ] Fenêtre privée → login Google → toutes les données reviennent (+ clés API).
- [ ] Reste connecté au refresh ; l'onboarding ne réapparaît pas ; « Dernière sync » se met à jour seule.
- [ ] Clés chiffrées : restauration sur un autre appareil ramène les clés (preuve que le `sub` déchiffre).

**Moteur / UX**
- [ ] Rentes (fix #210/#214) : sur ton profil, vérifier que RRQ/PSV démarrent aux âges choisis
  dans Retraite (indépendants de l'âge d'arrêt) et que le « ~80 $/mois » a disparu.
- [ ] Mode test (fix #217) : switch de persona → AUCUNE donnée de l'ancien ; reload → la bannière
  orange reste ; « Désactiver » → tes vraies données reviennent.
- [ ] Refonte Futur (#213-#216) : les 4 sous-onglets te conviennent ? L'écran « Calculer ma
  projection » au premier passage ? La checklist du Plan d'action (cases + « Pourquoi ? ») ?
- [ ] Zoom molette + pan fluides (60 fps) sur tous les onglets graphiques.
- [ ] Pendant un (re)calcul Futur → écran « Calcul de ta projection… » (pas l'ancienne courbe).
- [ ] Salaire saisi (Onboarding/scan paie/TaxCenter) → affiché **mensuel cohérent** partout.
- [ ] Scénario chômage/invalidité → **moins d'espace REER** cette année-là + patrimoine REER final ≤.

---

## Comment maintenir ce backlog
1. **Ajouter** un item découvert → `- [ ] **[ID]** description`.
2. **Cocher au merge** : Claude coche l'`[ID]` quand la PR qui le livre est mergée (+ réf PR).
3. Blocage humain → `A_FAIRE_MOI.md`. Audit large → `code-analyzer` (ajoute des items ici).
4. Priorité : **P0** → 🧭 décisions → grand nettoyage AAA → CIX → P2/P3 en rotation.
