# SESSION HANDOVER — pour le prochain Claude

> **À lire EN PREMIER si tu reprends FinanceAI.** Ce document remplace
> la lecture séquentielle de tous les autres. Pointeurs vers les détails
> à la fin.
>
> ## ⚡ BRIEF MARC 2026-06-10 — LE CHANTIER PRIORITAIRE (4 phases)
> Marc a livré un brief structurant (détail COMPLET dans `BACKLOG.md` § « BRIEF MARC 2026-06-10 ») :
> **Phase 1** bugs chunk périmé (✅ FAITE, mergée #238 → prod : [PH1-a] `lazyWithRetry` sur le dernier
> `React.lazy` nu + filet global `vite:preloadError` durci au panel — garde timestamp ≤ 1 reload/min,
> clear-au-mount supprimé ; analyse Cloudflare livrée, décision Marc = [PH1-b]/Q2) →
> **Phase 2** clé de voûte (état persistant inter-onglets, projection en Web Worker app-level, source
> unique Futur=Retraite, verrouillage de courbe + IndexedDB) → **Phase 3** onglet Profil (remplace
> Config/Profil, regroupe profil+retraite+profil détaillé, % complétion, purge des champs morts) →
> **Phase 4** refontes par onglet (Futur leviers-d'abord/annotations/plan d'action remonté ;
> Transactions ; Budget ; Investissement autocomplétion+dividendes ; Retraite).
> ⚠️ RÈGLES : plan-first OBLIGATOIRE sur Ph. 2/3/et CHAQUE onglet de Ph. 4 ; **JAMAIS passer à la
> phase suivante sans OK explicite de Marc** ; Q1/Q2 à poser (cf `A_FAIRE_MOI` O6) ; handover à jour
> après chaque phase.
>
> **Session 2026-06-18 — Garde-fou FISC-CONST-LINT (#364)** : `utils/fiscalConstantsGuard.ts` + `tests/fiscalConstants.guard.test.ts`
> (10 tests) : échec dur, auto-extraction des littéraux distinctifs non-collisionnables de `utils/tax.ts`/`services/realEstate.ts`
> + scan du codebase pour interdit. **A trouvé + corrigé 1 vraie fuite** : `32490` (RRSP 2025 recopié dans `setupSimulation.ts` sans
> le nommer) → constante nommée `RRSP_ANNUAL_LIMIT_FALLBACK` dans `tax.ts`. Scope sûr : ronds (`60000`) et taux 2-décimales (`0.5`)
> EXCLUS, strip des commentaires, échappatoire `// fiscal-const-ok`. Nouveaux LOW-tickets découverts (FISC-CONST-LINT-LIMITS,
> FISC-RRSP-PRE2010-FALLBACK). ~2159 tests verts (+ 10). Gates verts.
>
> **Session 2026-06-17 — AUDIT FINANCIER COMPLET + corrections (#318→#323)** : audit exhaustif du moteur
> (panel 5 agents + vérif empirique → rapport AAA `docs/AUDIT_FINANCIER_2026-06-17.md`, 5 diagrammes Mermaid).
> Verdict : **cœur money-critical AAA** (conservation prouvée ≤ 0,02 $ sur ~25 scénarios, fiscalité 0 écart,
> 0 échec silencieux) ; TOUS les findings PÉRIPHÉRIQUES (consommateurs UI/IA qui contournaient la source unique).
> Commande récurrente **`/audit-financier`** créée (cadence trimestre + release + période d'impôts). Corrigé :
> **#319** H1/H2 (NW présent UI/IA omettait les dettes + FX en dur → `computePresentNetWorth` SOURCE UNIQUE +
> garde keystone parité ; régression `availableCash` attrapée par le panel) · **#320** M2/M3 (DRY dividende/
> inclusion) · **#321** SEC-1 (anti-injection 2 surfaces LLM) · **#322** M5 (`DettesNonImmo` → NW reconstructible
> sous hypothèque, INV-9 étendu) + L4 (snapshot fréquence) + section BACKLOG « Durcissement structurel »
> (11 tickets Marc validés : 2 déjà faits, 3 partiels, 5 nouveaux) · **#323** M4 (viz fiscale NETTE de crédits) +
> AI-NBA-FX (FX réels). **Reste LOW** : L1/L2 (tests-guards), L3 (🧭 décision alias `services/tax.ts`),
> REEE-LITERALS (hygiène), M1 (⚠️ analyse double-comptage requise). Gates verts, ~2077 tests, 12 invariants conservation.
>
> **Session 2026-06-17 (suite) — Environnement d'agents + Accessibilité (Vague 2)** : mise en place de
> l'environnement d'agents (14 agents projet + orchestrateur routé à CHAQUE message via hook `UserPromptSubmit`)
> et de l'**Agent Control Center** (dashboard dev-only live `npm run acc`, auto-démarré au lancement d'un agent —
> PR #325→#334), puis reprise du backlog. **Vague 2 (accessibilité)** : `A11Y-TAXBRACKET` (#335,
> `TaxBracketViz` → `role="img"`+`aria-hidden`, `<ChartDataTable>` sr-only, `h4`→`h3`, `ink-500`→`ink-400`
> contraste VÉRIFIÉ) + `D6-HEADING` (#336, `CollapsibleSection` titre dans un vrai `<hN>` + prop `headingLevel`)
> LIVRÉS. Reste Vague 2 : `A11Y-INK500` (codemod CIBLÉ — ink-500 = disabled), `A11Y-D6-SR-2` ph.3,
> `A11Y-CHARTS` ph.2, `A11Y-MODAL-PRIVATE`, `D6-KBD`.
>
> **Session 2026-06-17 (suite²) — AUDIT UX externe VALIDÉ + backlog** : audit UX (rendu headless, 7 personas,
> 14 pages) reçu de Marc → **20 claims validés un par un** par panel de 5 agents (preuve `fichier:ligne`) →
> `docs/AUDIT_UX_2026-06-17.md`. Verdict : robustesse OK (0 plantage), cœur money-critical sain (les 2 « bugs de
> chiffres » = libellé `estateNetWorth` + persona insoutenable, PAS des erreurs de calcul). Vrais chantiers :
> **FMT-CURRENCY-UNIFY** (75 sites $ manuels), **IA dispersée** (14 dest., scores/holdings/complétude dupliqués),
> **PRIV-DISCRET-DOM** (mode discret floute sans masquer + hover révèle). Backlog rempli (§ « Audit UX 2026-06-17 »),
> dédupliqué, + 3 nouveaux points. **PM relancé pour l'ordre d'exécution.**
>
> **Session 2026-06-16/17 — Durcissement MONEY-CONSERVATION (#314 #315)** : 2 bugs de conservation de
> l'argent du moteur, trouvés via le résiduel `ΔNW − (épargne+croissance−impôt)`. **#314 [FISC-REER-WHT-DOUBLE]**
> (« le 50 000 au fisc » de Marc) : la retenue REER/FERR était comptée 2× (au retrait ET en avril) →
> sur-imposition ~retenue/an ; fix = retenue CONSERVÉE au liquide (acompte), retrait NW-neutre, débitée 1× en
> avril (INV-10/11). **#315 [FISC-BROKE-LIQUID-FLOOR]** : un retraité insolvable (tous comptes de décaissement
> épuisés, coussin `criticalThreshold` gardé) voyait sa dépense non couverte S'ÉVAPORER (ΔNW stable, +~3,7 k$/mois
> d'argent fantôme) ; fix (choix Marc = porter en dette) = `uncoveredShortfall` reporté en `liquidDebt` VISIBLE
> (INV-12, prouvé discriminant via `git stash`). Garde-fou `moneyConservation` = **12 invariants**. Leçons
> CLAUDE.md : résiduel de conservation comme ARBITRE (mesurer, pas raisonner) ; « pas de flux fantôme » étendu au
> shortfall mensuel insolvable ; piège race sonde-agent/`commit-gate`. Gates verts, ~2073 tests.
>
> **Session 2026-06-15 — Infra/hygiène (5 PR auto-mergées #288→#292)** : reprise sur un clone local
> **146 commits en retard** (fetch+ff → règle ajoutée à CLAUDE.md). #288 js-yaml → `npm audit` **0 vuln**.
> #289 règle « CLAUDE.md s'améliore à chaque push » **DURCIE** (obligatoire) + fetch-first à la reprise.
> #290 **hook `learn-on-push`** (PreToolUse : rappel « leçon→CLAUDE.md » sur chaque `git push`) + #291 fix
> de son faux positif (nom de branche en `-push`). #292 maj `A_FAIRE_MOI`. **Ménage : 23 branches mortes
> supprimées** (16 distantes + 7 locales) → `main` SEULE. ⚠️ **Auto-merge PROUVÉ bout-en-bout** (push→CI→
> squash-merge→suppression auto, zéro intervention) : les notes « auto-merge KO / required checks à activer »
> plus bas sont **PÉRIMÉES** (la ruleset `main` exige les 2 checks, ça marche). Stack : **Vite 8 (Rolldown)**,
> schema store **v7**.
>
> **Session 2026-06-15/16 — Review multi-agents + LOT HIGH FINANCIER BOUCLÉ (#295→#300)** : audit
> complet (12 agents, emphase financière) → 32 findings consignés au `BACKLOG.md` (§ « Review multi-agents
> 2026-06-15 »). **Lot HIGH financier #1-#6 entièrement traité** : 4 corrigés — #296 [FISC-RRQ-UNIT] (RRQ
> ×12, grossSalary mensuel÷MGA annuelle), #297 [FISC-SURVIVOR-DRAWDOWN] (survivant = 1 contribuable dans
> la cascade), #298 [FISC-LATENT-RE] (gain locatif latent au bilan successoral), #300 [FISC-WELCOME-UNIFY]
> (taxe de bienvenue UNIFIÉE par municipalité, source unique moteur+UI, repli Montréal, fin du bug C9) — et
> **2 FAUX POSITIFS écartés après vérif** : #2 FISC-MARGINAL-YEAR (revenu déjà déflaté), #5 FISC-ACB-RENO
> (rénos symétriques cost/value). ⚠️ Leçon clé ajoutée à CLAUDE.md : **« findings de review = hypothèses »**
> (33 % de faux positifs sur du code money-critical → VÉRIFIER avant de coder un fix). Restent MEDIUM/LOW au
> BACKLOG (FISC-TAXDEC-INCR, FISC-GOVPENSION-SCALE, FISC-RRQ-PRORATA, a11y…). Tous gates verts, 2048 tests.
>
> **▶ PHASE 2 (clé de voûte) TERMINÉE — 3/3 PR** (#240 #241 #242, détail BACKLOG) · **▶ PHASE 3 TERMINÉE
> (a/b/d) #244** : onglet PROFIL unifié (tout le setup user : identité, salaires, fiscal, répartition,
> détaillé, retraite via RetirementSettingsCard + RetirementIncomeCard extrait, enfants) + SetupHub en tête
> (% complétion global) ; éditeurs RETIRÉS de Impôts/Enfant/Budget/Config/Retraite (pointeur
> `ProfileFieldsMoved`) ; Retraite = résultats/analyses only. **PH3-c (purge champs détaillé morts) RESTE**
> (audit consigné au BACKLOG : 19 non consommés vs 5 ; purge soignée à part, tax-sensible).
>
> **Session 2026-06-12 (reprise) — GRIND autonome #267-275** (Marc « forcer basse-prio, ne pas s'arrêter ») :
> #267 SESSION_HANDOVER consolidé · **PH4-FUT « leviers-d'abord » BOUCLÉE** : #268 composeur de leviers
> REMONTÉ en amont (écran d'amorçage = `StrategyOptimizerPanel` obligatoire ; calcul-sur-clic via
> `revealedSig`/`applyAndReveal`, 2 `setAppState` BATCHÉS React 19) · #269 onglet « Paramètres »→« Hypothèses »
> + ordre de retrait AUTO (sélecteur retiré) · #270 annotations courbe (retraite/RRQ/PSV/épuisement compte) ·
> #271 docs (leçon git merge>reset). · **#272 tests Futur-critiques** : `applyAndReveal` (révélation sans
> flash = garde le batching) + `usePastPortfolioHistory` (mode test reconstruction directe, anti-fuite
> réel→test M3). · **#273 inflation 0 % respectée** (`?? 2.0` vs `|| 2.0`, famille PV-5 ; + cohérence
> moteur↔UI Retraite/Enfants) + re-scope FSS-PSV. · **#274 NPV estate** : estimés RRQ/PSV priment sur le
> split 65/35 (×N per-personne comme retirementIncome ; garde FA-5 verrouillée) — résout une divergence
> silencieuse estate↔revenu. · **#275 RRQ-PSV-MIN** : clamp `Math.max(0,…)` des estimés (retirementIncome
> + estateCalculation + `min={0}` UI ; un estimé négatif ne dégrade plus `total`/NPV en silence). Chaque
> lot : panel 3 agents (code-reviewer/silent-failure/projection-validator), suite verte (→**1996/1996**),
> zéro baseline. Confirmé : **le repo n'a aucun required check → `enable_pr_auto_merge` échoue « unstable »**
> → merge au vert via **timer court** (`sleep ~290` run_in_background, pattern documenté §auto-merge).
> **Lane fraîche épuisée → Marc a tranché « CONTINUER BAS-BRUIT »** : **#277** D6-SR-2 parité lecteur d'écran
> sur les sliders monétaires (helper `maskedSliderAria` + `aria-valuetext` ; étiquettes `privacy-blur`→
> `<PrivateAmount>` ; 0 privacy-blur restant dans les 2 fichiers) · **#278** CA-10 `usePwaInstallPrompt`
> (11 tests : recence de dismiss 30j, standalone, flux install) · **#279** noms accessibles `aria-label` sur
> les 5 sliders monétaires (WCAG 2.5.3/4.1.2) + constante partagée `MASKED_AMOUNT_LABEL` · **#280** [A11Y-SLIDERS]
> nom accessible (`aria-label` = texte visible) sur les **10 sliders taux/% de ProjectionControls** (dont la
> boucle inflation/poste) + PropertyConfigurator:172 ; test direct `ProjectionControls.a11y.test.tsx` · **#281**
> [A11Y-SLIDERS] **COMPLÉTÉ** — noms sur les 6 derniers sliders (RealEstate Rendement/Appréciation, DebtManager,
> TaxCenter REER/CELIAPP, ChildPlanning REEE) ; Budget déjà nommé, HealthIndicator déjà associé · **#282**
> [D6-SR-2] Retirement.tsx : les **13 montants** mono-valeur (3 KPIs + 10 tooltip) `privacy-blur`→`<PrivateAmount>`
> (ferme la fuite SR : le blur est CSS-only, un SR lisait les vrais montants en mode privé) · **#283** [D6-SR-2]
> **primitive `<PrivateBlock>` créée** (4 tests : aria-hidden conteneur + sr-only sibling, préserve le flex
> multi-spans là où PrivateAmount le casse) **+ Dashboard liste d'actifs migré**. Panel a11y-auditor à chaque
> lot UI. Suite → **~2024**.
> **▶ Reste = 🧭 FEU VERT MARC** : **[FSS-PSV]** (PSV DANS l'assiette FSS confirmé `taxDecember.ts:662` ;
> fix = câbler une PSV mensuelle au `ctx` + **transcrire la règle Annexe F dans FISCAL_REFERENCE D'ABORD**
> — money-critical, ne pas coder sur source non transcrite) · gros refactors CA-03/CA-06/CA-09 · P0 (proxy
> Anthropic / IndexedDB) · refontes **DESIGN** (Budget/Transactions/Retraite, irritants à cadrer).
> **Bas-bruit ENCORE dispo (prêt, mandat « continuer » de Marc)** : **[A11Y-SLIDERS] ✅ FAIT** · **D6-SR-2 :
> primitives `<PrivateAmount>`/`<PrivateBlock>` prêtes**, Retirement + Dashboard migrés → RESTE = **finition de masse**
> (~50 `privacy-blur` sur ~16 fichiers : ProjectionTooltip 13, ActionPlanDrilldown 6, RealEstate 4, etc. — mécanique,
> à faire par paquets de 1-2 fichiers ; outils prêts) · `analytics.ts` (trivial). DEAD-FLT-2/CA-01 = consommateurs
> VIVANTS → PAS du code mort. **Bas-bruit à fort signal épuisé ; reste = grind de masse D6-SR-2 OU item FEU VERT.**
> 🐛 **FIX 2026-06-12 (urgent Marc) — upload de DOCUMENTS PDF réparé** : `analyzePayslip` (services/claude.ts)
> envoyait TOUT fichier dans un bloc Anthropic `image` ET rejetait les non-images → tout PDF de bulletin/relevé
> échouait (« Analyse échouée ») alors que PayslipUploadCard + TaxCenter annoncent le PDF (`accept`+label). Correctif :
> helper pur exporté `buildPayslipFileBlock` → PDF en bloc `document` (base64 `application/pdf`), image en bloc `image`,
> throw sinon ; tests ajoutés. **Leçon : un PDF NE PASSE PAS dans un bloc `image` côté API Anthropic — bloc `document`
> obligatoire.** Validé typecheck + tests ; bout-en-bout réel (clé Anthropic + vrai PDF) reste à confirmer par Marc.
> 🆕 **FEATURE 2026-06-13 (Marc) — import de relevé PDF + auto-classification** : `ImportBankStatement` accepte
> désormais PDF/image (+ CSV). PDF → `analyzeBankStatement` (Claude Vision, bloc `document`) → tri chrono → CSV canonique
> (`extractedTxnsToCsv`) → MÊME pipeline que le CSV (parseBankCsv/fusion/dédup). Helper du fix PDF généralisé
> `buildPayslipFileBlock`→`buildVisionFileBlock`. Auto-catégorisation IA des nouvelles transactions à l'import (PDF+CSV,
> choix Marc) sur l'état FRAIS du store, lazy-import `claude.ts` (bundle boot préservé). CSV reste 100 % local ; le PDF
> est envoyé à Claude (consenti). Panel 4 agents → a11y status/alert + fix clobber appliqués. Bout-en-bout réel à confirmer.
> ⏸️ **Grind D6-SR-2 EN PAUSE** : ne pas relancer la finition de masse en pilote auto — DEMANDER la direction à Marc
> (Pause / grind D6-SR-2 / FSS-PSV / DESIGN). Outils (`PrivateAmount`/`PrivateBlock`) prêts pour reprise incrémentale.
>
> **Session 2026-06-11 (suite) — GRIND backlog (demande Marc « tout faire sans s'arrêter »)** :
> #243 PH2-d-1 (toast verrou irrécupérable) · #244 Phase 3 + **réduction docs 47→9** (HISTORIQUE.md
> consolidé) · #245 **[CPL-1]** (bug couple Marc : passage en couple GATÉ sur définition consciente du
> conjoint — formulaire + bypass sidebar fermé ; conjoint vide = zéro revenu fantôme, prouvé par test)
> + PH2-c-1 (dédup module fetch Finnhub durcie : par symbole+clé, retry, anti-fuite test) + PH2-c-2
> (ProjectionStaleBanner inter-onglets) + PH2-d-2 (tooltip verrou) + PH2-d-3 (aire CELIAPP) + SF-WARN ·
> #246 PH2-c-4 (parité directe du hook, 7 personas) + A11Y-LBL (18 labels) + DEAD-FLT (purge
> fetchLiveTotals inopérant) + primitive **PrivateAmount** · #247 : D6-SR
> (migration PrivateAmount : KPIStat levier + 21 sites — montants masqués aux SR en mode privé)
> + **PV-11** (goalShortfalls structuré, retraits goals aux séries withdrawal*, clamp liquid négatif ;
> validé projection-validator 1927/1927, réserve per-conjoint assumée → PV-11e).
> · **#248 FA-8** (lot fiscal : 2 vrais bugs — cap clawback PSV versée + assiette dividendes ; panel
> fiscal-accuracy AUCUN BLOQUANT ; 11 tests preuve-par-mutation) · **#249 PH3-c** (19 champs profil morts
> purgés, contre-audit complet, zéro migration — Phase 3 100 % TERMINÉE).
> **BACKLOG ACTIONNABLE VIDÉ** (10 PR mergées 2026-06-11). Restent : 🧭 décisions Marc (PH3-c-bis,
> PH1-b/Q2, FA-6, ITEM-2A/2C, P0-*) · suivis opportunistes (PV-11e test pinnant, D6-SR-2, DEAD-FLT-2,
> CA-xx) · **Phase 4 (refontes par onglet) : plan-first + OK Marc REQUIS par onglet.**
>
> **Session 2026-06-11 (suite 2) — PHASE 4 onglet FUTUR « leviers-d'abord » LIVRÉE** (5 PR) :
> #250 PH4-FUT-A (calcul-sur-clic : courbe+KPIs cachés tant que pas cliqué, signature `params` entier ;
> retrait des « plans » / 5 stratégies-types ; purge chaîne robustesse) · **4 nouveaux leviers de stratégie**
> (câblage partagé recherche↔courbe : StrategyConfig+LEVER_LIBRARY+applied*+configToEngine+runScenario) :
> #251 **profil de rendement** (conservateur/équilibré/agressif, presets) · #252 **fractionnement pension 65+**
> (ON/OFF, gate Phase 3 taxDecember) · #253 **taux d'épargne** (multiplicateur 0.9/1/1.2) · #254 **downsizing**
> immo retraite (vendre+racheter plus petit, libère 40% équité RP, exemption gain ARC). Chaque levier :
> non-régression bit-près + monotonie/effet + panel (fiscal-accuracy/projection-validator). Suivi : `[RE-GAIN]`
> (gain locatif non taxé, préexistant). ⚠️ Agents-panel s'orphelinent au resume → checks refaits à la main.
> **Phase 4 : onglet Futur TERMINÉ. Autres onglets (Transactions/Budget/Investissement/Retraite) : OK Marc requis par onglet.**
>
> **Session 2026-06-12 — GRIND MASSIF (~20 PR #250-266, demande Marc « forcer les basse-prio »)** :
> Phase 4 ONGLETS : Futur (#250 calcul-sur-clic gaté sur signature `params` + retrait des « plans » ; #251-254
> **4 LEVIERS** profil de rendement / fractionnement pension 65+ / taux d'épargne / downsizing) · Investissement
> (#255 autocomplétion Finnhub `searchSymbol` ; #256 allocation = portefeuille `assets` RÉEL + dividendes réels ;
> #259 4→3 pages) · Transactions (#257 tri colonnes) · Retraite (#258 invite `ProjectionRequired`, CSV déprécié
> retiré). · **RE-GAIN** #260 (vente immeuble LOCATIF → gain en capital imposé ; RP EXEMPTE) + #261 (succession,
> disposition réputée). · #263 **PV-6** (résiduel insolvable porté en dette `liquidDebt` au lieu d'absorbé) +
> **PH2-c-3** (calcul déterministe routé au Web Worker ; `useDebouncedMemo` purgé). · #264 **CA-02** (formatage →
> `formatCAD`). · #265/#266 **CA-04** (smoke tests des 8 composants money-critical sans test direct). Câblage
> leviers : StrategyConfig + LEVER_LIBRARY + applied* (ProjectionConfig) + configToEngine + runScenario (recherche
> ↔ courbe cohérentes). FISCAL_REFERENCE §8 (RE-GAIN) à jour. ⚠️ **Agents-panel s'orphelinent au resume** → checks
> refaits à la main (baselines + cohérence). **RESTE (FEU VERT MARC requis — gros/risqué)** : CA-03 (migration
> `utils/tax.ts` 820 l → `services/tax.ts`), CA-05 (découpe `Investments.tsx` 1187 l), P0 (proxy Anthropic /
> IndexedDB), DESIGN Budget + annotations Futur (routé `A_FAIRE_MOI`). **Non-tractables** : PV-11e (micro-effet
> non observable), DEAD-FLT-2 (`fetchPortfolioHistory` stub mais consommateurs VIVANTS → `StockComparisonModal`),
> CA-01 (`csvExport` en fait VIVANT, utilisé par Transactions).
>
> Session 2026-06-10 — **TOP 10 [UI-EPURE] COMPLET + 5 fiscaux MAJEURS + [UI-SCEN]**. Build/tsc/tests verts.
> - **Épuration UI (EP-1..EP-10)** — 4 PR (#225 EP-1/2, #226 EP-3/4/5, #227 EP-6/7/10, #228 EP-8) :
>   Futur/Paramètres « Risques & aléas » repliée + Card AI retirée ; Dashboard 5e KPI « Patrimoine projeté »
>   = source unique (`lastProjection.chartData`, mini-formulaire retiré) ; Investments donut santé +
>   projection par compte épurés ; Config SetupHub → ruban discret à 100 % ; ProjectionExplains méthodologie
>   sous « En savoir plus » ; Optimisation StressTest replié + **AssetLocationPanel SUPPRIMÉ** (doublon
>   Retraite) ; Retraite bloc pension DB replié. **no-silent-failure** : NetWorth non fini → `<ProjectionRequired>`
>   + `logError` (Dashboard/Investments). EP-9 = déjà satisfait (doublons retirés avant, CTA Futur fonctionnels).
> - **[UI-SCEN] (#223)** : `projection.withdrawalStrategy` = paramètre (sélecteur Paramètres), moteur 1 scénario
>   par défaut (suite moteur **82→33 s**), stress-tests à la demande (`StressTestPanel`), plans de base supprimés.
> - **Fiscal 5 MAJEURS (#221/#222)** : FA-1 assiette crédit pension (exclut RRQ/PSV) · FA-2 clawback PSV par
>   conjoint (seuil individuel) · FA-3 SRG non imposable + clawback complet · FA-4 CELI source unique ·
>   FA-5 NPV rentes succession ×N corrigé. `FISCAL_REFERENCE` §4/6/7 à jour.
> - **Gouvernance** : Action `backlog-autocheck` retirée (déjà) ; CLAUDE.md — règle auto-merge +
>   **force-push BLOQUÉ par le repo** → recovery « checkout branche distante + merge main + fast-forward »
>   (+ reconcile après CHAQUE squash-merge) documenté en § résilience cloud.
> - ⚠️ **Auto-merge KO** : le repo n'a **aucun required status check** → `enable_pr_auto_merge` échoue
>   (« unstable »). **À débloquer côté Marc** : Settings → Branches → required status checks (cf `A_FAIRE_MOI`).
>   Sinon chaque PR = re-check manuel. ⚠️ **Le webhook PR ne livre PAS le succès CI** (que les échecs +
>   commentaires) → pour merger sur vert sans auto-merge : `send_later` indispo ici → **réveil court en
>   arrière-plan** (`Bash run_in_background` `sleep ~210`) qui re-déclenche le check CI puis merge. Pas de
>   1 h d'attente, pas de `sleep` foreground (bloqué par le harness).
> - **Fix moteur/fiscal money-critical (suite, #229-#234)** : **PV-5** (champs `number` Retraite —
>   vide ⇒ `Number('')=0` persisté ⇒ pension DB « dès 0 an » ; garde `numOr`/`numOrUndef`) ·
>   **PV-1** (découvert de liquidités effacé par le clamp de croissance ⇒ patrimoine surévalué ;
>   sauvetage par cascade de vente, choix Marc) · **FA-9** (double indexation du SRG ⇒ max surévalué
>   ~49 % à 20 ans ; base réelle + nominalisation unique) · **FA-10** (impôt de décembre en survivorMode
>   sur 2 têtes ⇒ sous-imposition ; 1 contribuable) · **PV-2** (récolte de gains ignorait la banque de
>   pertes ; consomme `capitalLossBank` en premier, LIR 111(1)(b)) · **PV-10** (retrait NON-ENREG des
>   objectifs ne réalisait AUCUN gain ⇒ sous-imposition ; via `handleNonRegSale`). Chaque PR : panel
>   4 agents + FISCAL_REFERENCE à jour, suite ~1859 verte, zéro baseline.
> - **Règles Marc 2026-06-10** (CLAUDE.md) : **date+heure en tête de CHAQUE réponse** · **agents/timers
>   tués IMMÉDIATEMENT après usage** (plus de traînards « 160 h »).
> - **Reste ouvert (découvertes routées au BACKLOG)** : FA-6/7/8/11 (fiscal) · PV-3/4/7/8/9/11 (moteur :
>   crypto sans banque de pertes, TLH×ACB, gains invisibles au test SRG/clawback, métriques d'objectifs) ·
>   CA-01..10 (dette code) · [D6-SR] fuite SR mode privé. Auto-merge toujours KO (required checks à activer).
>
> Session 2026-06-09 — **14 PR mergées (#206-#217 + gouvernance)**. Tests **1782 verts / 154 fichiers**.
> - **Refonte Futur COMPLÈTE** : 4 sous-onglets (Graphique/Paramètres/Optimisation/Plan d'action)
>   + écran d'amorçage (#213) ; Robustesse+Optimiseur fusionnés en « Comparer les stratégies »
>   2 modes (#215) ; Plan d'action = checklist (case + montant + « Pourquoi ? » repliable,
>   `AdviceItem[]` structuré, zéro chiffre fiscal en dur) (#216) ; fix contraste onglets actifs (#215).
> - **Bug rentes bouclé** : début RRQ/PSV découplé de l'âge d'arrêt (moteur #210, RRQ→72) + UI âges
>   dans Retraite (#214). Fiscal : fractionnement pension 65+ (#211), récolte de gains (#212).
> - **Mode test réparé (#217)** : switch persona = base propre (zéro fuite inter-persona) ; mode test
>   PERSISTÉ (bannière survit au reload) ; push Drive toujours coupé en test ; `resetState` sort du
>   mode test ; `realDataSnapshot` typé `Omit<…,'apiKeys'>`.
> - **Gouvernance** : Action `backlog-autocheck` RETIRÉE (Claude coche le BACKLOG au merge) ;
>   CLAUDE.md § « Exécution cloud — résilience » (reverts conteneur → vérifier ancêtre origin/main,
>   CI muette = divergence, flake E2E = rerun) ; 14 branches mortes supprimées.
> - **Reste ouvert** : PR #150 dependabot (hono, sécu) ; P0 (proxy clé, IndexedDB, sync Drive réelle,
>   gate Google) ; [D6-SR] fuite SR mode privé.
>
> Session 2026-05-29 — **Feature Sync Google Drive** (livrée « dark », inerte sans `VITE_GOOGLE_CLIENT_ID`) :
> données dans le Drive de chaque user (appDataFolder), auto + garde anti-perte, pas de chiffrement
> applicatif (choix Marc), clés API synchronisées (sync v2, en clair). Code : `services/sync/*` + `services/googleDrive/*`
> + carte Réglages→Système. **Pour activer** : suivre `docs/GOOGLE_DRIVE_SETUP.md` (créer le Client ID
> OAuth + mettre `VITE_GOOGLE_CLIENT_ID`). Design : `docs/GOOGLE_DRIVE_SYNC_DESIGN.md`. Tests +53.
>
> Dernière session : 2026-05-28 — **Lot 1 (sécu) + Lot 2 (tests) + Audit multi-agents (Lot 3)** :
> - **Lot 1 — Sécurité & conformité** : backup auto chiffré AES-GCM (S-A), Google Consent Mode v2
>   pour GA4/Loi 25 (S-B), redaction PII errorLogger testée (S-C), anti-injection prompt partagé
>   `utils/promptSafety.ts` (S-D), quick-wins (S-E). ✅
> - **Lot 2 — Filet de tests moteur money-critical** : ~119 tests sur 11 modules sans test unitaire
>   direct (cloudBackup, taxJanuary, meltdownReer, monteCarlo, monthlyCalcs, etc.). ✅
> - **Audit 5 agents → corrections (Lot 3)** : aucun CRITICAL. Shippé en batches isolés (CI verte) :
>   F5/F7/F8/F6 (sécu), **F4** (retenue REER 21/26/30→19/24/29 % via `RRSP_WITHHOLDING_QC` — money fix),
>   **F1/F3** (silent-failures projection : stack worker préservée + `_hasError` lu → erreur honnête),
>   **F9/F10/F11** (perf : hoist `Math.pow`, Map O(1) tickFormatter, handlers pan stables). Rapport :
>   [AUDIT_2026-05-28.md](AUDIT_2026-05-28.md). Tier 🟢 (règles fiscales incertaines) **non modifié** sans source.
> Voir aussi [AUTH_SETUP.md](AUTH_SETUP.md), [SECURITY_STRATEGY.md](SECURITY_STRATEGY.md). Tests **1154/1154 verts** (106 fichiers).
>
> Session 2026-05-27 — **État production** (Cloudflare Access, clés chiffrées, CSV universel,
> CoinGecko/Finnhub, era retiré, G21 optimiseur, G22 UX, G23 a11y). Tests 732/732 alors.
>
> Session précédente : 2026-05-26 (G22) — refonte UX + navigation.
> Tests 742 → **732 verts** (delta : 2 fichiers test era retirés, compensé par test régression coussin).
>
> **Cycle 17-18 highlights** :
> - Mode test fixtures (couple Alex/Sam, 5 actifs réels Yahoo, REEE/dettes/immo)
> - 13 fixes bugs visibles (TaxCenter × 100, dettes infinies, Enfant crash, Math.round M$, etc.)
> - **Mode strict TOTAL** : 8 composants migrés vers `lastProjection.chartData`
> - **Centralisation Phase 3** : 9 nouveaux champs chartData (marginalTax,
>   reeeContribCum, DividendIncome, realNetWorth, etc.)
> - CSV Yahoo Finance authentique pour mode test (no-fake total)
> - Keyboard shortcuts Alt+1..9
> - 23 tests convergence Vitest (594→596 verts) + checklist 131 tests manuels
> - 8 nouveaux docs (BACKLOG, SECURITY_STRATEGY, CENTRALIZED_CALC_*,
>   PROJECTION_OUTPUT_SCHEMA, etc.)

> **Session 2026-06-19 — NW-PARITY-INVARIANT (#370)** (★ garde-fou keystone) : test-only, `tests/services/nwParity.test.ts` (5 tests). Cross-check NW présent (`computePresentNetWorth` UI) ≡ NW de départ moteur (cash + Σ buckets `derivePortfolioStartingBalances` − dettes) + end-to-end `chartData[0]` à flux nuls avec dettes. **Discriminant prouvé** : 3 scénarios (D1 celibataire, D2 couple 2 revenus, D3 couple asym dettes). Limite documentée : parité HORS immobilier. Panel 3 agents (code-reviewer/financial-integrity/silent-failure) APPROVE, 0 régression. Tests ~**2171/2171 verts**. Gates verts.
>
> **Session 2026-06-19 — FISC-RE-SALE-RESIDUAL (#368)** (money-critical) : vente immo quasi-underwater (hypo 95-100 %, frais 5 % > équité → `saleNet < 0`) : `addLiquid(Math.max(0, saleNet))` effaçait le déficit → patrimoine surévalué. Fix = `addLiquid(saleNet)` → déficit déduit ou porté en `liquidDebt` (PV-6). 2 tests discriminants (unitaire `monthlyEvents.test.ts` + end-to-end conservation). ΔNW = −5 % valeur prouvé. Panel 4 agents APPROVE, 0 régression. Tests ~**2166 verts**. Gates verts.
>
> **Session 2026-06-19 — FUZZ-ONETIME-FLOWS (#367)** : fuzz étendu à l'**ACHAT IMMOBILIER** (mise 5-50 % < prix, génère hypothèque ; mesuré 257/500 runs sous hypothèque) + **RÉNOVATION** majeure. Invariant ajouté : `DetteTotale ≥ DettesNonImmo` (hypothèque non double-comptée). **Test déterministe immo** : reconstruction NW sous prêt. Discrimination prouvée end-to-end (flip signe équité + drop liquidDebt → fuzz échoue). **PARTIEL** : reste vente immo / gain locatif / revenu locatif / équité négative / véhicule / héritage / REEE (suivi au BACKLOG). Tests ~**2164 verts**. Gates verts.
>
> **Session 2026-06-18 (suite) — HARDEN-FUZZING (#365)** : `tests/services/projection.fuzzConservation.test.ts`
> (2 tests : 1 fuzz 500 runs + 1 discriminant end-to-end) + dép dev `fast-check ^4.8.0` déjà en place. Fuzz des 12 invariants :
> reconstructabilité forme-bilan (`ΔNetWorth = Σactifs − dettes`), NetWorth toujours fini, INV-6 (pas de flux fantôme).
> Scénarios bornés (1-180 mois, couples/célibataires, revenus/immo/dettes aléa). Discrimination prouvée : revert TEMPORAIRE
> d'une garde → test échoue → revert annulé (pattern détaillé CLAUDE.md « Prouver un test discriminant »). Panel 4 agents
> (projection-validator/financial-integrity/silent-failure/code-reviewer) ; **résiduel max mesuré 0,02 $**. **Backlog autonome
> ÉPUISÉ** : restent suivis (FUZZ-ONETIME-FLOWS, DEP-UNDICI-VULN, FISC-CONST-LINT-LIMITS, FISC-RRSP-PRE2010-FALLBACK) +
> items 🧭/👤 Marc (FISC-WELCOME-2026, RECH-ACTION-UX, phases 2-4 brief). Tests ~**2163 verts**. Gates verts.
>
> **Session 2026-06-18 — Durcissement MONEY-CONSERVATION + correctifs métier + UX (12 PR #351→#363)** :
> **Lot HIGH fiscal/métier** — #352 [FISC-ESTATE-PENSION-NPV] (NPV rentes RRQ/PSV ×12 annualisée, bilan successoral ~375 k$ corrigés) · #354 [FISC-EVENT-INCOMELOSS] (perte d'emploi/sabbatique/accident : réduction revenu ménage appliquée par moteur ; défauts 100%/100%/50%, net+brut REER réduits, impôt décembre conservateur) · #355 [FINNHUB-MISMATCH][RECH-ACTION-UX] (Investissement : fallback gracieux symbole non-cotable, Escape ferme dropdown sans fermer modale) ; **Durcissement money** — #356 [HARDEN-NETWORTH-EXHAUSTIVE] (compile-guard `NET_WORTH_SIGN` dans `computeRawNetWorth`, test littéral vs Σ, zéro régression) · **#362 [ENG-LOOP-ORDER-TEST]** (test ordre boucle mensuelle : allocation AVANT croissance, 2 scénarios discriminants, inversion PROUVÉE à la main échoue test → attrape décalage rendement que les 12 invariants laissent passer) · **#363 [HARDEN-FISCAL-TIMEBOMB]** (garde de fraîcheur des valeurs fiscales : `utils/fiscalFreshness.ts` lit la date « Dernière vérification »/« Ré-audité » dans `FISCAL_REFERENCE.md`, warn @12 mois, fail @18 mois ; 13 tests discriminants) ; **Hygiène** — #351 [ENG-MONTHLYOUTPUT-TEST] (test monthlyOutput complet, seul module sans test) + #353 [BACKLOG] (cocher livrés, découvertes, router FISC-WELCOME-2026) ; **UX + infra** — #357 [DOCS-DISCIPLINE] (`documentation-manager` devient PROPRIÉTAIRE de SESSION_HANDOVER, dans le « Toujours » de /review-all + rappel hook → handover à jour à CHAQUE push) · #358 [PROJ-INSOLVENCY-BADGE] (onglet Futur : badge danger « Plan insoutenable — capital épuisé vers X ans » quand le NW projeté franchit 0 ; helper pur `utils/insolvency.ts`) ; **Robustesse** — #360 [ENG-ESTATE-ESTIMATE-FIN] (`fin()` à la SOURCE : un estimé de rente NaN ne zérote plus TOUT l'estate — dégradation gracieuse). Conservation prouvée : **12 invariants OK**. Moteur stable **~2149 tests**, typecheck strict, Vite clean. État prêt déploiement.
> ⚠️ **À FAIRE Marc** : `FISC-WELCOME-2026` (valeurs RQ 2026) · `RECH-ACTION-UX` (confirmer visuellement avec clé Finnhub, A_FAIRE_MOI O5). **Restes autonomes** : `FISC-CONST-LINT` (risque faux positifs) ; `HARDEN-FUZZING` (attend OK dép `fast-check`). **Déféré (décision design Marc)** : `A11Y-BADGE-PROMINENCE` (fond Badge ~1.1:1 < 3:1 WCAG 1.4.11 sur TOUS les variants ; contraste par teinte non automatisé par check-contrast).

---

## 1. État en une page

| Indicateur | Valeur |
|---|---|
| **Repo** | https://github.com/MoKarade/FinanceAI |
| **Branche principale** | `main` (seule branche — ménage 2026-06-15) |
| **Dernière PR mergée** | **#370** [NW-PARITY-INVARIANT] (garde-fou keystone parité NW présent ≡ départ moteur, 5 tests, 2026-06-19) |
| **App déployée** | https://www.hubperso.com (Vercel auto-deploy sur push `main`) |
| **Tests** | **~2171/2171 verts** (Vitest 4 ; `fileParallelism: false` ; 12 invariants money-conservation) |
| **Typecheck** | Clean en mode strict |
| **Build** | OK — **Vite 8 (Rolldown)** ; lazy-loading préservé (vendor react/recharts/ai/pdf) |
| **Schema store** | **v7** (Zustand persist, migrations v1→v7) |
| **Stack IA** | `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5) — Gemini retiré |
| **Banque** | CSV **+ import relevé PDF** (Claude Vision, #285) → pipeline `parseBankCsv` ; CSV 100 % local |
| **Crypto** | CoinGecko (gratuit, sans clé) |
| **Stock/ETF** | Finnhub REST (gratuit) |
| **Sécurité storage** | AES-256-GCM + IndexedDB non-extractible (`services/secureKeyStore.ts`) ; `npm audit` = **0** |
| **Auth** | **Gate Google in-app** (`LoginGate`+`authGate`, `VITE_GOOGLE_GATE=1`) — **Cloudflare RETIRÉ le 2026-06-16** (Access + proxy DNS). Gate SOFT (trappe `?nogate=1`) ; données privées par compte Google |
| **Lighthouse prod** | Performance 97 / A11y 100 / BP 100 / SEO 90 (dernière mesure connue) |
| **PWA** | manifest + SW v2 (precache résilient) — installable Chrome/Edge/Mobile |
| **WCAG** | AA conformant (sub-set AAA pour touch, focus, reduced-motion) |

(Lighthouse : dernière mesure connue ; re-run recommandé après une grosse livraison UI.)

---

## 2. Contraintes cardinales (NE PAS VIOLER)

1. **🔒 ZÉRO service payant** — user a explicitement refusé Finnhub paid,
   Sentry SaaS, GlitchTip backend, tout SaaS récurrent. Tout doit rester
   sur tiers gratuits (Vercel free, GitHub Actions free, IndexedDB browser,
   localStorage, Anthropic API clé perso de l'user, Era Context perso, Finnhub free).

2. **🔒 PAS de Google Sheet** — l'user a demandé suppression totale du
   Google Sheet legacy (cycle 14). Le fichier `netlify/functions/sheet-proxy.ts`
   a été supprimé, le CSP a été nettoyé de docs.google.com, `services/finance.ts`
   ne fait plus de fetch CSV. Ne PAS le réintroduire.

3. **🔒 Pas de demo data au boot** — l'user veut un état vide tant qu'il
   n'a pas saisi ses infos lui-même. Hook `useHasUserData` (`utils/useHasUserData.ts`)
   gate l'affichage des widgets d'actions/dashboard. NE PAS pré-remplir
   `constants.ts` avec des INITIAL_USERS / INITIAL_BUDGET non-vides.

4. **🔒 Tester sur hubperso.com** — l'user a précisé : « SI tu veux faire
   des tests directement sur l'app utilise hubperso.com ». L'app est aussi
   sur GitHub Pages mais hubperso.com est la prod canonique.

5. **Branches `claude/<slug>` — cycle AUTONOME** (changé depuis 2026-06) — Claude gère le cycle
   COMPLET : branche → commits gated → push → PR → **auto-merge squash** (GitHub merge dès CI verte)
   → sync. **Plus de gate humain, Claude merge lui-même.** Source de vérité : `CLAUDE.md` § Workflow.

---

## 3. Ce qui a été livré cette session (18 PRs)

### Phase 1 — Production Readiness (PRs #99-#105)

| PR | Item | Description |
|---|---|---|
| #99 | P1.1 errorLogger | Rolling buffer 100 entrées localStorage + global handlers + viewer dans Système |
| #100 | P1.4 CSV + chunkLoad | `utils/csvExport.ts` RFC 4180 + `lazyWithRetry` (fix chunk-load) + cache headers Netlify |
| #101 | P1.3 backupAuto | IndexedDB 7-day rolling backups + AutoBackupPanel UI |
| #102 | P1.2 zod safeParse | Toutes les `Schema.parse()` → `safeParse()` avec errorLogger |
| #103 | P1.7 audit log | Rolling 500 entrées + AuditLogViewer dans Système |
| #104 | P1.5 PDF complet | Patrimoine + **Fiscal** + **Holdings** + **Dettes** + **Goals** + Retraite + Budget (+16 tests builders purs) |
| #105 | P1.6 Lighthouse CI | Workflow `.github/workflows/lighthouse.yml` warn-only + continue-on-error |
| #106 | docs P1 | MAJ HANDOVER + CHANGELOG + PLAN_P1 |

### Phase 2 — Mobile & a11y AAA (PRs #107-#114)

| PR | Item | Description |
|---|---|---|
| #107 | P2 plan | `docs/PLAN_P2.md` — triage + 9 items chiffrés |
| #108 | P2 quick wins | Modal focus restore (P2.2) + close 44px (P2.3) + prefers-reduced-motion (P2.6) |
| #109 | P2.5 contrast | ink-400 #64748b→#8896a8, ink-500 #475569→#6a7689 (WCAG AA) |
| #110 | P2.4 touch targets | 5 boutons icon <44px corrigés (privacy toggle, toast, docs, planning) |
| #111 | docs intermédiaires | MAJ HANDOVER P2 6/9 |
| #112 | P2.8 form labels | ~35 inputs orphelins fixés (PatrimoineExtended 17, Settings 10, DebtManager 5, etc.) |
| #113 | P2.9 PWA | manifest.json + sw.js + icon.svg + register en PROD |
| #114 | P2.1 axe pages | 4 pages couvertes (Onboarding, SystemView, Dashboard, TaxBracketViz) |
| #115 | docs P2 final | MAJ HANDOVER + CHANGELOG + PLAN_P2 (clôturé 9/9) |

### Cycles 17-18 — Mode test + Centralisation + Strict mode (2026-05-21)

Direct merges sur main (pas de PRs numérotées — workflow accéléré avec
Marc validant en live).

**Mode test** :
- `services/testFixtures.ts` : couple Alex/Sam, 68 transactions, 5 actifs
  réels Yahoo (VFV.TO, VEQT.TO, XEQT.TO, AAPL, BTC-CAD), CSV historique
  100% authentique bundlé `services/data/test-portfolio-history.csv`
- Bouton Activer/Désactiver dans Configuration → TestModePanel
- Banner orange permanent en mode actif
- `enableTestMode` snapshot des vraies données pour restauration safe

**13 fixes bugs visibles** (cycle 17) :
- TaxCenter taux marginal × 100 (était décimal affiché tel quel)
- Future scénarios "0.0M$" (Math.round avant /1M)
- Enfant crash (Bar dans AreaChart → ComposedChart)
- Tooltip Future taille fixe + icônes alignées + ligne décaissement
- Extinction dettes (effectiveMinimum garde-fou)
- Retirement aligné avec Future (savingsGoals + financialGoals)
- Fixtures Debt/ChildGoal champs corrects
- Variation Dashboard 2 décimales partout
- Plus : tooltip décaissement portfolio en retraite (bug "60\$/mois")

**Mode strict TOTAL** (cycle 18) :
- 8 composants migrés : Retirement, Dashboard, Investments, Budget,
  RealEstate, Planning, ChildPlanning, HealthIndicator
- Composant partagé `components/ui/ProjectionRequired.tsx` (variants
  block + inline)
- Suppression de tous les fallbacks fake (formule 5% Dashboard, 25×
  HealthIndicator, ×10×1.4 Latte Factor Planning, projection REEE locale
  ChildPlanning)
- Convention "valeurs réelles ou rien" appliquée à fond

**Centralisation Phase 3 — 9 nouveaux champs `chartData`** :
- Tier 1 : `realNetWorth`, `liquidityRunway`, `mortgageRemainingMonths`
- Tier 2 : `reeeContribCum`, `reeeGrantsCum`
- Tier 3 : `DividendIncome`, `TaxableInvIncome`, `marginalTaxRate`, `effectiveTaxRate`
- Hook partagé `hooks/useProjectionSelector.ts` (3 variants)

**B1 décision UX** : Retirement reflète automatiquement le scénario actif
de Future (badge "Scénario actif : {strategyName}" dans subtitle).

**Q3 keyboard shortcuts** : Alt+1..9 pour switcher d'onglet.

**Tests** : 573 → 596 verts (+23 : 16 convergence + 5 nouveaux Tier 1-2
+ 2 nouveaux Tier 3). +131 tests manuels checklist.

### G21 — Optimiseur de stratégie (cycles post-#116)

- `services/projection/strategySearch.ts` : recherche automatique de la meilleure stratégie d'allocation parmi toutes les combinaisons
- `services/projection/drawdownOptimizer.ts` : optimisation du calendrier de décaissement
- `services/projection/strategyRanking.ts` / `strategyRobustness.ts` : classement et robustesse des stratégies
- Bouton « Annuler » dans l'UI FutureProjection pour interrompre le calcul long
- Bouton « Appliquer la stratégie gagnante » (bascule le scénario actif sur le résultat optimal)
- Budget adaptatif : watchdog 15 min, estimation ~8ms/sim
- `lastProjection.bestStrategyIdx` : index de la stratégie gagnante dans `allResults`

### G22 — Refonte UX (cycles post-G21)

| Item | Description |
|---|---|
| G22-N3 | Planning + Abonnements fusionnés dans Budget (sous-onglets via `BudgetWorkspace.tsx`) |
| G22-N4 | Settings.tsx découpé en sous-sections (`settings/sections/` : Profile, Accounts, Integrations, Patrimoine, Backup) |
| G22-N5 | Onglet Système fusionné dans Configuration (sous-onglet « Système & diagnostics ») |
| G22-F1 | `components/projection/ProjectionExplains.tsx` : explorateur data-driven des données de projection |
| G22-F4 | `components/tour/GuidedTour.tsx` : tutoriel guidé lancé après l'onboarding (relançable depuis Profil) |
| G22-B1 | Valeur nette complète dans FutureProjection (placements reconstruits + cash) |
| G22-B2 | Bascule directe Couple/Individuel depuis la sidebar |

### G23 — Qualité & purge (session 2026-05-27, 4 merges directs sur main)

| Commit | Description |
|---|---|
| `3167a55` | U3 radio-group MC (clavier natif) + U4 tooltip tous événements + DT4 split testFixtures (6 modules) + bug HealthIndicator/NextBestAction (coussin = 0) + lisibilité tax.ts/projection.ts + sécurité MEDIUM eraContext + 0 warning ESLint (484→0) + resync docs |
| `20abca8` | Retrait 4 fonctions IA mortes de services/claude.ts (getInvestmentAdvice, generateSmartGoals, analyzeBudgetAI, analyzeDocuments) + schémas Zod orphelins |
| `4af08b2` | Retrait COMPLET era Context (~1 224 lignes) : services/eraContext.ts, services/aiOrchestrator.ts, components/dashboard/EraContextInsights.tsx, clé apiKeys.eraContext. ADR 002 marqué SUPERSEDED |
| `6042fe9` | Purge résidus era (CSP index.html + netlify.toml, source log errorLogger) + code mort knip (53→36 unused exports : hasSeenTour, PLAN_LEVELS, annualToMonthly, getAssetMeta*, getDividends, clearApiKeys, loadApiKeys) |

Tests après session : **732 verts / 71 fichiers** (delta : 2 fichiers test era retirés, compensé par test de régression coussin).

### Phase 3 — Lighthouse prod fixes (PR #116)

| PR | Description |
|---|---|
| #116 | Card title h3→h2 (heading hierarchy) + CoupleModeBadge role="img" + SW cache.addAll → précache individuel (Vercel rewrite `/index.html` 404 swallowed) + cache v1→v2 |

### P2.7 skip-to-main : déjà fait au cycle 5.1 (Layout.tsx:117-123) — pas de PR nouvelle.

---

## 4. Ce qui a été validé manuellement par l'user

Validé sur hubperso.com lors de la dernière session :
- ✅ PWA install Chrome desktop + mobile (icône emerald "Fi")
- ✅ DevTools → Manifest chargé, theme `#10b981`
- ✅ SW registered, activated
- ✅ Offline test (page s'affiche)
- ✅ **Lighthouse desktop : 97/95/100/90** (avant PR #116) — A11y 100 attendu après
- ✅ A11y manual checks 5.1 à 5.7 tous OK (focus restore, hit area, contrast, touch, reduced-motion, skip-link, form labels)

**À valider encore** (après #116 mergé) :
- ✅ **Cache Storage `financeai-v2` peuplé** — Validé 2026-05-21 après PR #118 (cycle 16). 16 entrées au 2e load (HTML + assets/* hashés). Voir `docs/INVESTIGATION_PWA_VERCEL_2026-05-21.md` pour le diagnostic complet.
- 🔲 **Lighthouse A11y re-run pour confirmer 100**
- 🔲 **PDF complet (P1.5)** — l'user n'a pas encore testé Patrimoine + Fiscal + Holdings + Dettes + Goals dans un seul PDF
- ✅ **SW update test** — Validé 2026-05-21 : push PR #118 a triggered un nouveau build, SW v2 a remplacé l'ancien automatiquement (skipWaiting + clientsClaim).
- 🔲 **iOS Safari** (l'user n'a pas Safari)

---

## 5. Ce qui reste (roadmap "10/10")

| Priorité | Item | Effort | Notes |
|---|---|---|---|
| 🔴 | P3 Refactor god-components | 40h | Settings 1500+ lignes, Retirement 1000+ lignes, Investments. Le refactor le plus rentable car ces fichiers freinent toute évolution. |
| 🟠 | P4 Tests Playwright E2E + visual regression | 25h | Manque tests d'intégration full-flow (onboarding → ajout asset → projection → PDF). |
| 🟢 | P5 Era push / sync multi-device | 50-80h | Avancé : sync transactions cloud bidirectionnel via Era. **Touche backend** → vérifier que ça reste gratuit. |
| 🟡 | Form primitives `<Input>`/`<Select>`/`<Field>` | 8h | 133+ inputs inline non factorisés (ADR-004). À faire en même temps que P3 idéalement. |
| 🟡 | i18n compléter | 10h | 32 → ~260 clés si l'user veut réactiver EN/FR (cycle A a supprimé le toggle). |
| ⚪ | Brancher `logAudit()` aux call-sites | 2h | Infra prête depuis #103 mais les call-sites (import CSV, suppressions batch) ne logent pas. Quick win. |

### Suggestions ad-hoc

- **Lighthouse Performance** : 97 est excellent. Si tu veux le pousser à 100, vise les 239 KiB d'unused JS dans `index-*.js` (split Settings + Retirement + Investments en lazy chunks). Voir suggestion Lighthouse.
- **Forced reflow Recharts** : 46ms perdus dans recharts internals. Pas fixable côté FinanceAI sans forker recharts. Ignorer.

---

## 6. Comment travailler dans ce repo

### Setup
```bash
git clone https://github.com/MoKarade/FinanceAI.git
cd FinanceAI
npm ci   # package-lock.json EST committé (lockfile de référence ; après reprise si node_modules manque)
```

### Commandes utiles
```bash
npm run dev          # localhost:3000 — Vite HMR
npm test             # vitest run (suite complète)
npm run typecheck    # tsc --noEmit, strict
npm run build        # bundle prod (vérifie pas de regression de size)
npm run lint         # eslint
npm run knip         # détecter dead code
npx tsx scripts/check-contrast.ts  # audit WCAG AA contrast
```

### Workflow Git (cycle AUTONOME — détail dans `CLAUDE.md` § Workflow)
1. À la reprise : `git fetch origin main && git merge --ff-only origin/main` (le clone local peut être
   TRÈS en retard — vu 146 commits le 2026-06-15).
2. `git checkout -b claude/<slug>` depuis `main`.
3. Code + tests ; commit (le hook `commit-gate` relance typecheck+test+build si des `.ts/.tsx` sont stagés).
4. `git push -u origin claude/<slug>` (le hook `learn-on-push` rappelle « leçon → CLAUDE.md ? »).
5. `gh pr create` (ready) → `gh pr merge --auto --squash` : GitHub merge seul dès la CI verte.
6. Au point de contrôle : vérifier `merged`, puis `git checkout main` + ff + `git branch -D <slug>` (squash ⇒ `-D`).
7. **CLAUDE.md s'améliore à chaque push** : capturer la leçon dans la MÊME PR.

### Onglets actifs (Alt+1..9)

| Alt | Onglet | Notes |
|---|---|---|
| Alt+1 | Dashboard | |
| Alt+2 | Transactions | |
| Alt+3 | Budget | Inclut Planification et Abonnements (sous-onglets internes — G22-N3) |
| Alt+4 | Dettes | Ancien Alt+4 était Planning, maintenant fusionné dans Budget |
| Alt+5 | Investments | |
| Alt+6 | Future | Sous-onglet « Explications » (ProjectionExplains — G22-F1) |
| Alt+7 | Retraite | |
| Alt+8 | Impôts | |
| Alt+9 | Assistant | |

Onglets retirés : Planning (fusionné dans Budget — G22-N3), Système (fusionné dans Configuration — G22-N5).

### Architecture clés
- **Entry** : `index.tsx` → `App.tsx` (root) → `Layout.tsx` (sidebar + bottom nav)
- **Routing** : Tab enum dans `types.ts:1`, dispatch via `TabRouter.tsx`
- **State** : `store/useFinanceStore.ts` (Zustand v5 + persist localStorage)
- **State shape** : `AppState` dans `types.ts:638`
- **Projection moteur** : `services/projection.ts` (9 phases mensuelles, 7 scénarios) — voir `docs/PROJECTION.md`
- **Fiscal** : `utils/tax.ts` (barèmes 2026 fédéral + QC + RRQ + RQAP + AE)
- **PDF** : `services/pdfReport.ts` (jspdf lazy)
- **IA** : `services/claude.ts` (Anthropic SDK) — `aiOrchestrator.ts` et `eraContext.ts` supprimés (era retiré)
- **Market data** : `services/marketData/` (façade Finnhub)
- **Backup** : `services/backupAuto.ts` (IndexedDB rolling 7-day) + `services/cloudBackup.ts` (export chiffré)
- **Audit/logs** : `services/errorLogger.ts` + `services/auditLog.ts` (rolling localStorage)

### Composants UI primitives (`components/ui/`)
- `Button`, `Card` (title=h2), `Badge`, `KPIStat`, `PageHeader` (h1), `EmptyState`, `Skeleton`, `Modal` (focus-trap+restore), `Pill`, `Tooltip`, `Toast`, `ConfirmModal`, `CommandPalette` (Cmd+K), etc.

### A11y patterns en place
- `.focus-ring` (72 usages) → `:focus-visible:ring-2 ring-primary`
- `.touch-target` (`min-width/height: 44px`)
- `prefers-reduced-motion` global media query (`index.css`)
- Skip-to-main link (`Layout.tsx:117-123`)
- Modal focus-trap + focus-restore
- 205+ `aria-*` attributes
- WCAG AA tokens (`ink-400` #8896a8, `ink-500` #6a7689)

---

## 7. Docs à lire si besoin de plus

**Core actif (9 fichiers `docs/`)** — réduction 2026-06-11 (47→9, le reste fusionné dans HISTORIQUE) :
| Doc | Quand le lire |
|---|---|
| **`docs/BACKLOG.md`** | **Restant à faire — à lire EN PREMIER** |
| `docs/A_FAIRE_MOI.md` | Tâches HUMAINES (Marc) |
| `docs/FISCAL_REFERENCE.md` | Valeurs fiscales — SOURCE DE VÉRITÉ (datée + sourcée) |
| `docs/ARCHITECTURE.md` | Stack, topologie, store, pipeline IA |
| `docs/PROJECTION.md` | Moteur de projection (phases, scénarios, MC) |
| `docs/PROJECTION_OUTPUT_SCHEMA.md` | Champs de `lastProjection.chartData[i]` |
| `docs/VISION.md` | Où va le projet |
| **`docs/HISTORIQUE.md`** | **TOUT le reste fusionné** : snapshots, audits, designs LIVRÉS (auth Cloudflare, sync Drive, MCP, multiuser, sécurité), ADRs, plans finis, 131 tests manuels. Git garde le détail par fichier. |
| `CHANGELOG.md` | Historique versionné |

---

## 8. Recommandations immédiates pour le prochain Claude

### Si l'user veut continuer le sprint
1. **D'abord** : faire valider les 4 items manuels restants (§4 ci-dessus)
   en demandant `AskUserQuestion`. Ne pas coder à l'aveugle si la prod
   n'est pas validée.
2. **Si tout est vert** : proposer P3 plan (refactor Settings le plus
   gros gain) ou Form primitives (compatible avec P3).
3. **Si bugs trouvés** : fixer en priorité avant d'ouvrir un nouveau chantier.

### Si l'user veut une feature précise
1. Lire `docs/ARCHITECTURE.md` pour comprendre la stack et la topologie
2. Identifier le composant/service à toucher via `grep`/`find` (pas Read en aveugle)
3. Suivre le workflow Git de la section 6
4. Toujours respecter les 5 contraintes cardinales (§2)

### Sources potentielles d'erreur connues
- **vitest v4** (PR #98 dependabot) : `environmentMatchGlobs` retiré. Le `vitest.config.ts` utilise déjà `environment: 'jsdom'` globalement. Ne pas re-rajouter `environmentMatchGlobs`.
- **CI race condition** (Tests + Build duplicate runs) : push+PR sync déclenchent 2 jobs concurrents qui se battent sur npm install. Faux-positif si un fail en <60s — re-run le job ou merger quand même.
- **Recharts canvas warnings** dans tests : `HTMLCanvasElement.getContext` non implémenté dans jsdom. Ce sont des warnings, pas des échecs.

### Anti-patterns à éviter
- ❌ Ré-introduire Google Sheet / docs.google.com / fetchPortfolioHistory CSV
- ❌ Pré-remplir INITIAL_USERS avec des noms / salaires non-vides
- ❌ Push à `main` directement
- ❌ Merger ses propres PRs
- ❌ Ajouter une dépendance payante / SaaS récurrent
- ❌ Toucher au workflow `.github/workflows/ci.yml` sans précaution
  (vitest v4 incident — lighthouse a son propre workflow isolé pour ça)
- ❌ Rewrite massif sans plan (cycle 14 = plan P1 d'abord puis exécution)

---

## 9. Contact / contexte user

- **GitHub** : MoKarade
- **Email** : marc.richard4@gmail.com
- **Localisation** : Québec, Canada (l'app cible fiscalité QC/CA)
- **Langue** : français (FR uniquement depuis le cycle A — EN retiré)
- **Style** : direct, méthodique, valide en prod après merge, merge rapide
- **Préférence** : 1 PR par item, draft par défaut, descriptions PR détaillées
- **Test environnement** : hubperso.com (prod Vercel)

---

## 10. Mantra

> **Plan avant code. Tests avant push. Draft PR avant merge. User valide en prod.**

Si tu lis ça, prends 5 min pour relire les contraintes cardinales (§2) avant
de commencer. C'est la différence entre une session productive et un rollback.

Bonne session 👋
