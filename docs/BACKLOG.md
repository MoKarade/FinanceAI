# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/archive/BACKLOG_HISTORIQUE.md`](archive/BACKLOG_HISTORIQUE.md).
> Audit qualité détaillé (référence) : [`docs/AAA_AUDIT_2026-06.md`](AAA_AUDIT_2026-06.md).
> Actions humaines (Marc) : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).
>
> **Dernière mise à jour : 2026-06-09.** Tests : 1827 verts / 154 fichiers · tsc clean · build OK.

## Convention (cochage par Claude au merge)
- Chaque item Claude-faisable porte un **`[ID]`** entre crochets. **Claude coche lui-même**
  l'item au moment du merge de la PR qui le livre (l'Action `backlog-autocheck` a été retirée —
  choix Marc, 2026-06-09).
- Claude édite ce fichier pour **cocher** (au merge) et **ajouter** des items (découvertes).
  Les blocages humains vont dans `A_FAIRE_MOI.md`.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier.
- Les **tests manuels** (section 👤 ci-dessous) n'ont PAS d'`[ID]` (à Marc).

---

## 🚨 P0 — Bloquant pour un vrai produit multi-utilisateurs
- [ ] **[P0-PROXY]** 🔧 Proxy backend pour la clé Anthropic (H3) : `services/claude.ts` utilise
  `dangerouslyAllowBrowser` (clé exposée navigateur — OK solo, inacceptable pour des tiers).
  Cible Vercel Edge (free tier). Claude code le proxy ; déploiement + secret = Marc.
- [ ] **[P0-IDB]** 🔧 Migrer la persistance `localStorage` → IndexedDB (quota ~5 Mo + parsing
  synchrone bloquant au boot). ⚠️ Migration du schéma persist v7 — vigilance corruption.
- [ ] **[P0-SYNC]** 👤 Prouver la sync Drive en réel : créer `VITE_GOOGLE_CLIENT_ID`, tester en
  fenêtre privée (cf `A_FAIRE_MOI` O3 + tests manuels ci-dessous).
- [ ] **[P0-AUTH]** 👤 Sortir de Cloudflare Access → gate Google in-app (ADR 010, `A_FAIRE_MOI` O1).

## 🧭 Décisions moteur (à trancher avec Marc — money-critical)
- [ ] **[ITEM-2A]** Indexation des paliers vs déflation : le fix « indexer par `simInflation` » a été
  **investigué et rejeté** (aggrave le cas dominant). Correctif propre = impôt sur revenu NOMINAL
  + paliers indexés (~12 sites, rebless baselines). Garder tel quel ou entreprendre le refactor ?
- [ ] **[ITEM-2C]** Gates de *timing* par conjoint (FERR 72 / reset REER 71 / bonus PSV 75+) :
  bloqués structurellement (pool REER ménage + âge principal unique). Fix propre =
  `computeRetirementIncome` per-conjoint de bout en bout (lourd). À planifier ou laisser ?
- [ ] **[B-AUDIT-5]** SRG inclus dans le revenu du clawback PSV (incorrect, mais bénéficiaire SRG
  sous le seuil → impact pratique ~0). Corriger pour la propreté si on y touche.
- [ ] **[H1]** Chiffrement `localStorage` au repos par passphrase (faible valeur isolée ; cascade
  IndexedDB chiffré). Décision Marc (risque : passphrase oubliée → recovery).

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
- [ ] **[FA-6]** 🧭 Dons charitables : crédit 33 % + relief gains 15 % en dur non sourcés
  (`w5Effects.ts:98-101`). Sourcer au doc (vrai barème ~48-53 % > 200 $ ; don de titres = inclusion 0 %).
- [ ] **[FA-7]** 🔧 Transcrire le §8 immobilier dans FISCAL_REFERENCE (OSFI, SCHL, primes, TPS/TVQ
  neuf, taxes de bienvenue 2025/2026, HELOC 65 %) — valeurs déjà dans le code, doc en retard.
- [ ] **[FA-8]** 🔧 Lot mineurs fiscaux : taux clawback 0,15 nommé+sourcé · cap clawback sans facteur
  de report · prorata RRQ 39 ans / PSV 10-40 ans au doc · split 65/35 documenté · SystemView barèmes
  composés depuis les constantes (`SystemView.tsx:102`) · assiette dividendes vs gains cohérente ·
  retenue US 15 % sourcée · libellé FSS 2025/2026 · retenue FERR (`taxJanuary.ts:185`) passe encore
  le revenu TOTAL en `eligiblePensionIncome` (impact ≈0, réconcilié en décembre — aligner sur FA-1) ·
  `calculateCeliRoom` fallback `|| 7500` non indexé > 2030 (unifier avec l'extrapolation taxJanuary) ·
  `setupSimulation.ts:169` `inflationRate || 2.0` masque le 0 légitime (→ `??`) ·
  NPV estate lit `governmentPension` même quand `rrqEstimateMonthly` est fourni (divergence silencieuse) ·
  assiette clawback PSV sans gains/dividendes/intérêts non-reg (revenu net 23400 les inclut — sous-estime,
  borné au cap) · cap clawback ignore prorata résidence/`psvEstimateMonthly`/bonus 75+ (clawback fantôme
  possible pour immigrant 10/40) · assiette FSS inclut la PSV (l'Annexe F la déduit — à sourcer) ·
  lagged SRG déflaté du facteur du mois courant (~1 an d'écart, SRG légèrement surévalué) ·
  `ghOtherNominal` (récolte de gains, retraité) inclut le SRG non imposable → palier visé trop petit (conservateur) ·
  **dbMonthly quasi-nominal dans le revenu test SRG réel** (post-FA-9 : SRG coupé de plus en plus tôt
  pour un profil DB, conservateur mais amplitude ×1,49 à 20 ans — déflater la composante DB) ·
  **plafonds ×N non survivor-aware** (découverte FA-10) : droits CELI/REER/CELIAPP continuent de
  s'accumuler pour le défunt (`projection.ts` fhsaRoom, `taxJanuary.ts:159`) — sous-imposition
  indirecte mineure · retenue FERR estimée sur 2 têtes en survivorMode (timing seulement, réconcilié
  en décembre) · 🧭 « montant pour personne vivant seule » QC (grille TP-1.G) absent code+doc —
  pertinent pour un survivant, NE PAS chiffrer sans source Revenu Québec.
- [ ] **[FA-12]** 🔧 Test d'intégration survivorMode SEEDÉ (découverte code-reviewer FA-10) : aucun
  test n'exerce `runScenario` avec un décès du conjoint — la régression « quelqu'un retire un ternaire
  du call-site » ne serait attrapée par rien. Le rng est injecté (`buildSeededRng`) : forcer le décès
  en année 1 et asserter impôt décembre survivant > scénario sans `modelSurvivor`. (S)
- [ ] **[FA-11]** 🔧 SRG : discontinuité au seuil (découverte fiscal-accuracy FA-9) — le clawback
  linéaire 50 ¢ depuis 1 105 $ s'annulerait à 26 520 $ mais la coupure dure est à 22 512 $ →
  marche ~167 $/mois au seuil et SRG légèrement SURÉVALUÉ dans la bande haute (le vrai barème a une
  récupération additionnelle du top-up près du seuil). Pré-existant, non aggravé par FA-9. Modéliser
  le top-up (barème Service Canada) ou documenter en limite assumée §6.3. (S)
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
- [ ] **[PV-6]** 🔧 Résiduel insolvable = dette portée : quand la cascade du sauvetage PV-1 ne couvre
  pas tout (comptes épuisés / cap OAS), le résiduel est journalisé puis absorbé (convention CF-2 des
  shortfalls non couverts) → NW encore surévalué du résiduel dans les scénarios DÉJÀ en ruine. Modéliser
  un passif `liquidDebt` cumulé (affiché au bilan) si on veut un NW honnête en insolvabilité. Basse
  priorité (scénarios concernés déjà signalés par shortfallRate/successRate). (M)
- [x] **[PV-2]** 🔧 (livré) Récolte de gains ignorait `capitalLossBank` : la banque de pertes (TLH)
  est désormais consommée EN PREMIER (LIR 111(1)(b)) — part compensée = 0 $ d'impôt et HORS palier
  (step-up d'ACB gratuit), remplissage du palier sur le latent restant. `consumedLoss` retourné au
  caller (seule la part non compensée entre dans `accCapitalGainsYear`). 4 tests + FISCAL_REFERENCE §3.
- [ ] **[PV-11]** 🔧 Résiduels PV-10 (revue) : (a) shortfall d'OBJECTIF (drawn < visé) visible au
  log mais hors métriques — métrique dédiée (`goalShortfalls`/ratio financé), PAS shortfallMonths
  (sémantique différente) ; (b) retraits de goals absents des séries `withdrawal*` de chartData
  (sous-rapport pour les consommateurs « source unique ») ; (c) `_label` mort sur la closure
  handleNonRegSale (suggère un log inexistant) ; (d) commentaire trompeur portfolioOps.ts:25
  (« Pertes → bank » : branche inatteignable, cap min(1,…) — documenté en §3). (S)
- [x] **[PV-7]** 🔧 (livré) Ventes de CRYPTO via `handleCryptoSale` (miroir de handleNonRegSale) :
  gain proportionnel + banque de pertes (LIR 111(1)(b)) + pertes banquées, aux 2 sites de vente en vie
  (cascade de shortfall `cashflowAllocation.ts`, goal-mutator `projection.ts`). Avant : gain BRUT
  (banque ignorée) et pertes JETÉES. 5 tests unitaires. (Estate latent : NonReg ET crypto ignorent la
  banque symétriquement — hors scope.) Reste le câblage caller de gainHarvesting non testé (cf PV-11).
- [ ] **[PV-8]** 🔧 TLH fabrique des pertes SANS regarder l'ACB (`taxDecember.ts:107-112` :
  `harvestedLoss = fakeSell × dropRate`) : avec un gros gain latent, une vraie vente en année
  négative réaliserait un GAIN — banque surévaluée. PV-2 AMPLIFIE l'impact (chaque $ de perte
  fabriquée = 1 $ de step-up gratuit). Borner par `max(0, costBasis − fakeSell)` + documenter
  l'hypothèse « perte apparente » (LIR 54, rachat fonds corrélé non identique) en §3. (S/M)
- [ ] **[PV-9]** 🔧 Gains en capital INVISIBLES au test SRG et au clawback PSV (découverte
  fiscal-accuracy PV-2, pré-existant) : `prevYearOtherIncomeForGisNominal` (REER+loyers) et
  `computeOasClawback` n'incluent aucun gain imposable — or ils comptent dans le revenu net des
  deux tests, et le report 111(1)(b) ne les en retire PAS (déduction au revenu IMPOSABLE seulement).
  Un 65+ bas revenu avec gainHarvesting voit le levier « gratuit » alors qu'il coûterait des
  milliers de $ de SRG. Sœur de FA-8 (assiette clawback). (M)
- [x] **[PV-10]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — goal-mutator NonReg : le retrait
  `'NON-ENREG'` des échéances d'objectifs passe par `handleNonRegSale` (ACB proportionnel, banque
  de pertes, gain → accCapitalGainsYear → imposé en décembre). Avant : ACB décrémenté du montant
  VENDU complet et AUCUN gain réalisé (jamais imposés + ACB faussé). Test d'intégration discriminant
  (delta TaxPaidGains avec/sans objectif — échec prouvé sans le fix). Bonus : logs d'objectifs
  HONNÊTES (montant TIRÉ + « visé X — fonds insuffisants », au lieu de la cible toujours affichée).
  Piège documenté : la room historique CELI/REER ignore `celiContributed` → fixture de test via
  `useManualBalances` + rooms 0.
- [ ] **[PV-3]** 🔧 Fractionnement : le transfert n'alimente pas le crédit pension du RÉCIPIENDAIRE
  (ARC 31400 l'admet) — conservateur.
- [ ] **[PV-4]** 🔧 Tests des clamps hors-bornes `rrqStartAge` (55→60, 80→72) / `psvStartAge`.
- [x] **[PV-5]** 🔧 (livré) Champs `number` Retraite — saisie vide écrasée silencieusement (découverte EP-8) :
  `updateGoal('X', Number(e.target.value))` (`Retirement.tsx`) persistait `Number('')` = **0** (pas NaN ; et
  NaN sur saisie mi-frappe « - »/« 1e »). En projection (`retirementIncome.ts:203-208`) : `dbPensionStartAge`
  vidé ⇒ 0 ⇒ `age >= 0` toujours vrai ⇒ pension DB versée « dès 0 an » ; estimé RRQ/PSV vidé ⇒ 0 (≠ `undefined`)
  ⇒ le moteur ne retombe plus sur la rente agrégée (`!== undefined`, l.187-191). Fix : `utils/numericInput.ts`
  (`numOr` requis → repli valeur courante ; `numOrUndef` optionnel → `undefined`, jamais 0/NaN) appliqué aux
  10 `<input number>` + tests unitaires. Validé par projection-validator (1835/1835, invariants OK, 0 régression). (S/M)

## 🧽 Audit code 2026-06-09 (code-analyzer) — dette actionnable
- [ ] **[CA-01]** Code mort utils/ : `csvExport.ts` (109 l) + `safeNumber.ts` (30 l) entiers +
  exports orphelins (addPurchase/removePurchase, formatMonthYear, formatCompactCAD,
  getHasUserDataSnapshot). Confirmer via `npm run knip` avant suppression. (S)
- [ ] **[CA-02]** Unifier le formatage monétaire : 11 helpers locaux divergents (« 1 234$ » vs
  « 1 234,00 $ »…) → `formatCAD` de `utils/format.ts` ; résorber ~135 `toLocaleString`. (M)
- [ ] **[CA-03]** Finaliser la migration `utils/tax.ts` (820 l) → `services/tax.ts` (alias 5 l
  inachevé, ~20 imports directs restants). (S)
- [ ] **[CA-04]** Smoke tests composants money-critical sans test direct : Investments (1187 l),
  FutureProjection (1000), RealEstate, Retirement, TaxCenter, ChildPlanning, DebtManager, AiAssistant. (M)
- [ ] **[CA-05]** Découper `Investments.tsx` (1187 l, +33) sous `components/investments/`. (L)
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
- [ ] **[CA-10]** Tests manquants : `usePastPortfolioHistory` (alimente FutureProjection — priorité),
  assetMeta, analytics, usePwaInstallPrompt. (S)

## 🧹 Grand nettoyage AAA — items ENCORE ouverts (réf. `AAA_AUDIT_2026-06.md`)
> D1 (money CF/M-*), D5 (robustesse), D6 (double-h1, focus tour), D9 (robustesse LLM/ingest) = ✅ **faits**
> (détail dans l'audit). Restent les gros chantiers à décision/risque :
- [ ] **[D3]** Design system : codemod des ~636 couleurs ad-hoc (`text-gray-*`, hex) → tokens
  (`ink-*`, `surface`, `success/warning`) + règle ESLint anti-régression. Raffine l'existant
  (dark + emerald), zéro changement d'apparence rendue.
- [ ] **[D4]** God-files : scinder par impact `Investments` (1154) → `FutureProjection` (969) →
  `Budget` (892) → `Transactions` (729) → `Dashboard` (621)… + **[D4-H2]** sélecteurs atomiques
  (App re-render sur tout slice non-`lastProjection` + prop-drilling via `TabRouter`).
- [ ] **[D6-SR]** Mode privé : le flou CSS laisse les montants **lisibles par lecteur d'écran**
  (fuite). Masquer le TEXTE quand le mode privé est actif (comme les graphes font déjà `***`),
  pas seulement flouter. Touche KPI/cellules de tableau/inputs. (Re-confirmé par `a11y-auditor`
  2026-06-09 : systémique, AUCUN `privacy-blur` du codebase n'est masqué aux SR — ~50 occurrences,
  dont les nouveaux montants du `StressTestPanel`. Correctif cible : primitive `<PrivateAmount>`
  partagée avec `aria-hidden` + `sr-only` « montant masqué ».)
- [ ] **[D7]** Perf boot : `hydrateAssets` (`App.tsx`) boucle `await sleep(2500ms)` séquentiel par
  symbole → 10 actifs = ~25 s. Paralléliser + cacher, garde-fous anti-rate-limit. Plus gros gain
  de fluidité ressenti.
- [ ] **[D6-KBD]** Sidebar hover-only : labels `opacity-0` focusables + `disabled` bloque
  l'accordéon clavier → rendre pilotable au clavier.
- [ ] **[D6-GRAPH]** Graphes sans alternative textuelle : table de données masquée / bouton « voir
  les données » sous chaque graphe (a11y).
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
