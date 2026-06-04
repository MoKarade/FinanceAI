# Audit « AAA / entreprise à 1 000 milliards » — FinanceAI (2026-06-04)

> Demande de Marc : « grand nettoyage de tous les fichiers, niveau triple-A ». Décisions de cadrage :
> viser les **4 axes** (code/archi, design/UX, perf/robustesse, exactitude financière) · livraison en
> **PRs incrémentales par domaine** · moteur **améliorable avec garde-fous** (tests verts + liste des
> chiffres qui changent + demander avant tout changement de modélisation) · **raffiner l'identité
> actuelle** (sombre + emerald), pas de refonte visuelle risquée.
>
> Ce document a 3 parties : **(1)** catalogue de tout ce que fait l'app + une amélioration par item ;
> **(2)** parcours d'un utilisateur lambda + solutions ; **(3)** le backlog géant priorisé **par domaine**
> (chaque domaine = une PR). Compilé à partir de 4 audits parallèles (UI/copie, moteur, services/infra,
> flow/a11y/perf). Légende sévérité : **P0** bloquant/argent · **P1** fort impact · **P2** polish.

---

## PARTIE 1 — Catalogue : tout ce que fait l'app (+ 1 amélioration par item)

### 1.1 Onglets / pages
| Écran | Fichier (≈L) | Ce que ça fait / apprend / facilite | Amélioration AAA |
|---|---|---|---|
| Accueil/Dashboard | `Dashboard.tsx` (621) | Valeur nette, liquidités, épargne du mois, HealthIndicator, graphe patrimoine, KPIs, comparaison de titres, portefeuille projeté | Empty-state « premier lancement » dédié (au lieu de KPIs à 0 $ qui ressemblent à un bug) |
| Transactions | `Transactions.tsx` (729) | Import relevés, catégorisation IA par lot, wizard de classement, filtres, pagination, règles, export CSV | **Bouton « Importer un relevé » sur la page** (cf. P0 activation) + migrer le wizard sur la primitive `Modal` |
| Budget | `Budget.tsx` (892) | Enveloppes par catégorie, vues mois/trim/an, filtre par personne, inflation simulée, modal IA, objectifs d'épargne, abonnements | Extraire les hooks de calcul (dates/agrégats) du rendu ; empty-state « aucune transaction ce mois » |
| Investissements | `Investments.tsx` (**1154**) | Score de diversification, perf vs marché, allocation géo/sectorielle, rééquilibrage IA, portefeuille par compte fiscal, dividendes, NW par propriétaire, import courtier | Scinder (AllocationCard/RebalanceCard/HoldingsTable) + empty-state « ajoutez votre premier titre » |
| Futur/Projection | `FutureProjection.tsx` (969) + `services/projection/*` | Monte-Carlo, graphe empilé par compte, scénarios stochastiques, optimiseur, robustesse, asset location, plan d'action, zoom | Sous-onglet « Optimiseur » dédié (épurer le graphe) + état « calcul long » avec annulation |
| Dette | `DebtManager.tsx` (157) | Liste dettes, simulation avalanche, graphe d'extinction, intérêts totaux | Ajouter la méthode « boule de neige » (toggle) + date d'extinction en clair |
| Immobilier | `RealEstate.tsx` (616) | Multi-propriétés, comparaison, taxe de Bienvenue QC, projection d'équité | Empty-state réel (actuellement affiche un bien fictif `INITIAL_REAL_ESTATE_GOAL`) |
| Retraite | `Retirement.tsx` (552) | Objectif, goal-seek d'épargne, asset location, capital actuel, viz paliers, décaissement, RRQ/PSV | Lier le résultat goal-seek au bouton « appliquer » du budget |
| Enfant | `ChildPlanning.tsx` (533) | Coûts par choix de vie (garderie/école/uni/auto), REEE local vs projeté | Centraliser le formatage CAD (un `fmt` local dupliqué) |
| Impôts & Docs | `TaxCenter.tsx` (448) | Rapport fiscal, OCR de paie (Vision IA) → remplissage profil, simulation REER/FHSA, optim couple | État d'erreur d'upload (format/illisible) + preview de l'image scannée avant application |
| Projets de vie | `LifeProjects.tsx`→`Travel`+`LifeEvents` (325) | Voyages + événements (mariage/auto/réno/business/héritage…), coûts et conseils par type | Externaliser les `tips`/`breakdown` hardcodés en data (i18n) + corriger coquilles FR |
| Réglages | `Settings.tsx` (206)+`settings/*` | Profil, comptes, patrimoine étendu, clés API, sauvegarde/backup/Drive/connecteur, système/diagnostics, checklist de complétion | Composant `Input` commun avec validation + accents corrigés (« Clés API ») |
| Assistant IA | `AiAssistant.tsx` (367) | Chat streaming contextualisé, prompts suggérés, annulation | État « clé API manquante » avec CTA vers Réglages (échoue silencieusement aujourd'hui) |

### 1.2 Actions utilisateur (transversales)
- **Navigation** : sidebar accordéon (hover/focus), bottom-nav + drawer mobile, Command Palette (Cmd+K), Alt+1..9, deep-links cross-tab. → *Rendre Cmd+K découvrable (indice visuel) ; aujourd'hui invisible.*
- **Toggles** : mode privé (blur), mode test + persona, Couple⇄Individuel, masquer comptes, légende graphe, 10 scénarios stochastiques. → *Composant `Switch` unique (aujourd'hui boutons `aria-pressed` divers).*
- **Sliders** : paiement extra, inflation simulée, inflation par catégorie, horizon. → *Valeur live affichée de façon uniforme + `aria-valuetext`.*
- **Modales/formulaires** : ajout titre/dette/bien/enfant/événement, modales IA, ConfirmModal, détail Futur, comparaison titres, wizard. → *Converger sur la primitive `Modal` (2 patterns coexistent).*
- **Import/Export** : relevés bancaires, positions courtier, export CSV, backup/restore JSON, Drive sync. → *Composant `FileDrop` unifié (drag-drop + validation + erreurs).*
- **IA par lot** : catégorisation, justifications de rééquilibrage, analyse budget, analyse paie. → *Barre de progression + annulation cohérentes partout.*
- **Zoom/Pan** : `useTimeChartZoom` (déjà coalescé rAF). → *Bouton « réinitialiser le zoom » visible + hint.*

### 1.3 Le moteur financier (ce qu'il calcule / apprend)
Projection mensuelle (~80 champs/mois) · impôt fédéral+QC (paliers, BPA, abattement QC 16,5 %, crédits âge/pension) · RRQ/PSV/SRG (prorata, bonus 75+, split par conjoint) · décaissement en cascade (retenue REER 19/24/29 %) · décumulation (régularisation, meltdown REER, FERR 72+) · espaces REER/CELI/CELIAPP/REEE + subventions SCEE/IQEE · RAP · Monte-Carlo (P10/P50/P90, sequence-risk) · optimiseur de stratégie · impôt latent + succession. *Découpage `services/projection/` (~50 fichiers) exemplaire — c'est le modèle à appliquer aux vues monolithiques.*

### 1.4 Texte visible
PageHeader (cohérent, bon) · tooltips pédagogiques · états vides (`EmptyState`/`ProjectionRequired`/`MissingDataBanner`) · chargement (`Skeleton`/spinners/barres IA) · erreurs (`ErrorBoundary` FR + toasts `role=alert`) · onboarding 4 étapes + tour 15 étapes · bandeaux (consentement, backup, PWA). → *Audit accents/coquilles FR + passer les libellés en dur vers `locales/` (i18n).*

---

## PARTIE 2 — Parcours d'un utilisateur lambda (+ solutions)

**Boot** → gate Google **inerte par défaut** (pas de login en config standard) → `shouldShowOnboarding` vrai → onboarding plein écran.
**Onboarding (4 étapes)** : welcome → profil (prénom/âge/brut **annuel**/net **mensuel**/immigrant/couple) → clés API (Anthropic optionnelle) → soldes CELI/REER → « Lancer ». Puis **tour guidé 15 étapes** 700 ms après.
**Dashboard** : sans données, KPIs à 0 $, widgets en `ProjectionRequired`.
**Saisie** : c'est ici que ça casse (voir P0 ci-dessous).
**Premiers calculs** : onglet **Futur** = cœur ; Monte-Carlo en worker (~1,5-3 s) → publie `lastProjection` → débloque Dashboard/Retraite/Enfant.
**Retour quotidien** : onboarding court-circuité, navigation sidebar/Cmd+K/Alt, sync Drive silencieuse.

**Points de friction & solutions :**
- **[P0] Impasse d'import dans Transactions** — l'écran vide dit « Importez un CSV » (`Transactions.tsx:653`) mais aucun bouton d'import n'existe ; l'import n'est câblé que dans Réglages. → CTA « Importer un relevé » dans l'EmptyState **et** le PageHeader de Transactions + étape d'import optionnelle à l'onboarding.
- **[P1] Données factices par défaut** — `onComplete` injecte `INITIAL_BUDGET/PROJECTION/REAL_ESTATE_GOAL/CHILD_GOAL` → on ne distingue pas le vrai du faux. → Marquer « exemple » + « Remplacer par mes données », ou ne pas pré-remplir et montrer des empty-states.
- **[P1] Tour guidé aveugle sur mobile** — ancres `data-tour-id` seulement sur la sidebar desktop (`Layout.tsx:301,337`), `hidden md:flex` → spotlight à 0 sur mobile. → Ancres sur la bottom-nav/drawer + détection viewport.
- **[P1] 19 étapes cumulées (4 onboarding + 15 tour)** d'un coup. → Tour just-in-time/contextuel ou réduit à 4-5 étapes (Transactions→Budget→Futur).
- **[P2] Jargon non expliqué** (FIRE, FVI/Vitalité, CELIAPP, impôt latent, Smith, RAP, P10–P90, règle des 4 %). → Tooltips `?` au point d'usage (composant `Tooltip` existe) + guide accessible.
- **[P2] Avancement onboarding non persisté** (`step` en `useState`) — recharge = retour étape 1, champs perdus.
- **[P2] Incohérence de nommage** « Configuration » (sidebar) vs « Paramètres » (`TAB_LABELS`) ; `document.title` = « FinanceAI - Pro ».
- **[P2] Action « Synchroniser les données » factice** — `window.dispatchEvent(new Event('resize'))` (`App.tsx:274`) ne synchronise rien.

---

## PARTIE 3 — Backlog géant, par DOMAINE (= 1 PR par domaine)

### D1 — Exactitude financière (moteur) · **P0** · garde-fous obligatoires
> Règle : tests verts + liste de chaque chiffre qui change ; demander avant tout **changement de modélisation**.
- **CF-1** ✅ CORRIGÉ (création d'argent coussin, `cashflowAllocation` `Math.min`).
- **CF-3** ✅ CORRIGÉ 2026-06-04 (`cashflowAllocation.ts:306` `>= 40` → `>= 0.40`, seuil 40 %). AUTO_MARGINAL cotise REER-d'abord à taux marginal élevé. Zéro baseline déplacée (CELI/REER = même valeur nette). +1 test.
- **M-1** ✅ CORRIGÉ 2026-06-04 (`taxJanuary.ts:176` retrait du `/100`). Retenue FERR juste. Zéro baseline (réconciliée en décembre) ; stub de test corrigé à `0.30`.
- **CF-2** ✅ CORRIGÉ 2026-06-04 (`cashflowAllocation.ts` : liquide rétabli après dépense directe → conservation du plein déficit). Zéro baseline (chemin non atteint par les personas). Tests conservation MAJ.
- **M-2** ✅ CORRIGÉ 2026-06-04 (`estateCalculation.ts:127` retrait du `/N` sur la base → symétrie base/final). Impôt successoral couple plus juste. Zéro baseline ; +1 test couple.
- **M-8** ✅ CORRIGÉ 2026-06-04 (`taxApril.ts`) — confirmé : un remboursement d'impôt salarial était crédité au liquide ET réinvesti en nonReg (double-comptage = argent créé). Fix : retirer du liquide le montant réinvesti. Zéro baseline ; test de conservation MAJ (le total ajouté = le remboursement, pas le double).
- **M-3 / crédit garderie** (`childrenReee.ts:199-201`) — 🧭 **REVU 2026-06-04 : NE PAS appliquer tel quel.** `careMonthly *= 0.30` (net = 30 % du brut ⇔ crédit ~70 %) est en fait **réaliste pour le Québec** : le crédit d'impôt remboursable QC pour frais de garde est de **67–78 %** selon le revenu familial → net réel ≈ 22–33 % du brut. Le finding initial (et l'option soumise « crédit ~20-30 % ») supposait un crédit FAIBLE, ce qui est faux ici → « corriger » surévaluerait le coût de garde. **Reco : laisser tel quel**, ou (mieux, plus tard) rendre le crédit *income-tested* (78 % bas revenu → 67 % haut). **[décision Marc : confirmer]**
- **M-4** ✅ CORRIGÉ 2026-06-04 (crypto sans ACB) — ajout d'une dimension `cryptoACB` (init = valeur de départ, convention `nonRegACB`) câblée dans `cashflowAllocation` + `projection.ts` (vente shortfall + `withdrawFromAccount`) + `estateCalculation` + `latentTax` → on ne taxe que le GAIN crypto (valeur − coût de base), pas 100 % du produit. Zéro baseline persona déplacée (l'écart = croissance crypto only, sous tolérance). +5 tests (vente shortfall, estate, latent).
- **B-AUDIT-5 / SRG dans clawback PSV** (`retirementIncome.ts`, `taxDecember.ts:29`) — impact ~0 mais incorrect. **[PENDING]**
- **Tests money manquants** : `assetLocation.ts` (0 test), `taxJanuary` FERR (stub d'unité faux), conservation `taxApril`/`estateCalculation`, `applyDocument` valeurs aberrantes.
- *Améliorations modélisation (backlog futur)* : Monte-Carlo 100→500-1000 itérations ; EAP REEE taxé chez l'étudiant ; seuils 2027+ codés en dur (dette de maintenance) ; BPA fédéral dégressif haut-revenu.

### D2 — Activation & onboarding flow · **P1** (forte rétention)
- ✅ **[P0 flow] CTA import dans Transactions CORRIGÉ 2026-06-04** — bouton « 📥 Importer un relevé » dans l'en-tête + panneau `ImportBankStatement` réutilisé, auto-affiché quand il n'y a aucune transaction (fin de l'impasse). Câblé via la prop `onImport` (= `handleManualImport`). +3 tests. Reste ci-dessous.
- ✅ **Persistance de l'avancement onboarding CORRIGÉ 2026-06-04** — brouillon (étape + champs profil/soldes) persisté en localStorage, restauré au remontage, nettoyé à la fin. La **clé API est exclue** (secret jamais en clair). +2 tests.
- 🧭 **« Données factices par défaut » — REVU : largement un FAUX problème.** Vérifié : `INITIAL_BUDGET = []` (vide), `INITIAL_REAL_ESTATE_GOAL`/`INITIAL_CHILD_GOAL` ont `isActive: false` + zéros (le code dit « zéro données factices »), `INITIAL_PROJECTION` = défauts raisonnables. Rien de « fictif » n'est affiché → pas de badge « exemple » à poser. Le vrai sujet adjacent = **empty-states** (RealEstate montre un formulaire à zéros au lieu d'un état vide quand aucun projet actif) → voir ci-dessous.
- **Empty-states activation** : Dashboard « premier lancement » (au lieu de KPIs à 0 $) + RealEstate « aucun projet » (au lieu du formulaire à zéros) + Investments « aucun actif ». [PENDING]
- **Tour guidé mobile** : ⚠️ pas un simple ajout d'ancres — le `querySelector('[data-tour-id]')` trouve d'abord l'ancre **desktop** (`hidden md:flex` → `display:none`, rect 0) ; il faut que `GuidedTour` choisisse l'élément VISIBLE (et ouvre le drawer pour les onglets « Plus »). Changement de logique d'ancrage. [PENDING]
- Tour : réduction/just-in-time + focus-trap (cf. D6) · Glossaire au point d'usage (tooltips `?`). [PENDING]

### D3 — Design system & cohérence visuelle · **P1** · « raffiner l'existant »
- **Sprint tokens** : codemod `text-gray-*→ink-*`, `bg-emerald-*/amber-*→success/warning-*`, hex `bg-[#151922]→surface` (636 occurrences ad hoc ; pires : Retirement 47, AdvancedProjectionParams 31, Transactions 29, ChildPlanning 27).
- **Lint anti-ad-hoc** : règle ESLint interdisant couleurs hex / `text-gray-*` hors `index.css`/config.
- `Toast.tsx` : passer `bg-emerald-900/red-900/blue-900` → tokens `success/danger/info-bg`.
- Hiérarchie d'élévation unique (`surface` vs `#0B0E14` vs `black/30`).
- Échelle typo : éliminer `text-xs/sm/[10px]/[9px]` au profit de `tiny/meta/body`.
- `formatCAD` partout (supprimer les `toLocaleString` locaux dupliqués).
- Primitives unifiées : `Modal`, `FileDrop`, `Select`, `Switch`, `Slider`.

### D4 — Architecture & god-files · **P1**
- Scinder (ordre d'impact) : `Investments` (1154) → `FutureProjection` (969) → `Budget` (892) → `Transactions` (729) → `Dashboard` (621) → `RealEstate` (616) → `Retirement` (552) → `ChildPlanning` (533) ; aussi `FutureDetailModal` (544).
- **H2 — sélecteurs atomiques** : `App` re-render sur tout slice non-`lastProjection` + prop-drilling de tout l'`AppState` via `TabRouter`. Faire consommer le store directement par les pages (dette reconnue `App.tsx:47`).

### D5 — Robustesse & erreurs avalées · **P1** · règle « ne jamais avaler »
- **`App.tsx:236`** : échec d'hydratation des clés → `logError` (violation nette).
- **`projection.ts:1171` / `drawdownOptimizer.ts:40`** : `console.warn` sur projection vide → `logError`.
- **Race sync push-après-pull** (`syncOrchestrator.ts` + `App.tsx:102`) : sérialiser `schedulePush` derrière la décision + garantir clés API hydratées avant push (sinon `apiKeysEnc` perdu dans Drive).
- **`finnhub.ts`** : validation de schéma des réponses (Zod) + tests (0 test) + 401/403/429.
- **`backupAuto.ts` / `persistentCache.ts`** : pruning des backups manuels + purge des entrées de cache IndexedDB expirées (croissance non bornée).
- **`finance.ts:105`** : FX `0`/`NaN` retombe sur 1.40 sans distinction → logguer le cas corrompu.
- Contrats silencieux : `fetchUserIdentity` (`driveAppData.ts:175`) → logError.

### D6 — Accessibilité · **P1**
- **Double `<h1>`** : `Layout` (brand) + `PageHeader` → un seul `<h1>` par page.
- Sidebar hover-only : labels `opacity-0` focusables + `disabled` bloque l'accordéon clavier → rendre pilotable au clavier.
- `GuidedTour` : focus-trap + focus initial (a `aria-modal` mais focus reste derrière).
- **Graphes sans alternative textuelle** : table de données masquée/`aria` ou bouton « voir les données » sous chaque graphe (gros trou pour une app financière).
- Mode privé : le blur CSS laisse les valeurs lisibles par lecteur d'écran (fuite SR).
- Composant `Select` accessible commun ; cibles tactiles < 44 px (filtres/légende Futur) ; contraste `ink-500`/`text-gray-600` à mesurer.

### D7 — Performance · **P2** (sauf boot)
- **Boot** : `hydrateAssets` (`App.tsx:356`) boucle `await sleep(2500ms)` séquentiel par symbole sans cache → 10 actifs = 25 s ; sync (+2.5 s) et auto-backup (+2 s) se chevauchent → paralléliser/`requestIdleCallback`.
- Sélecteurs atomiques (cf. D4/H2) = le plus gros gain de fluidité de fond.
- God-components Futur/Investments : `useMemo` en cascade sur ~360 pts × 40 champs / tri de toutes les transactions.
- `Layout` `<style>` inline injecté à chaque render → CSS statique.

### D8 — Polish & finition · **P2**
- Empty/error states manquants : Investments (aucun actif), RealEstate (aucun bien), AiAssistant/TaxCenter (clé/upload).
- Nommage « Configuration » vs « Paramètres » ; `document.title` localisé.
- Action « Synchroniser » factice (`App.tsx:274`) → vrai déclenchement de sync ou retrait.
- Audit accents/coquilles FR ; i18n des libellés en dur (`locales/`).
- Animations de qualité (KPIs/cartes/transitions) sans toucher au graphe lourd (cf. backlog historique).

### D9 — Sécurité · **P1/P2**
- **`applyDocument.ts`** : bornes de plausibilité + confirmation sur deltas extrêmes (vecteur prompt-injection via pièce jointe lue par l'IA). **P1**
- `keyCipher.ts` : aligner PBKDF2 sur 600k (cohérence cloudBackup). **P2**
- `getRealEstateAdvice` / `getRealEstateAdvice` : passer par `safeJsonValidate` (regex gloutonne aujourd'hui). **P2**
- `claude.ts` : activer le **prompt caching** Anthropic sur le contexte fiscal QC (coût/latence). **P2**
- Finnhub clé en query string (risque résiduel, documenté).

---

## Ordre d'exécution recommandé (PRs incrémentales)
1. **D1 partiel — bugs d'unité money** (M-1 FERR, CF-3) : haute valeur, garde-fous, baselines vérifiées. *(décisions de modélisation D1 → en attente de Marc).*
2. **D2 — activation** (CTA import, données factices, glossaire) : débloque la rétention, quick wins.
3. **D5 — erreurs avalées + race sync** : sûreté des données (clés/Drive).
4. **D3 — design system** (tokens + lint) : cohérence visuelle, base du polish.
5. **D6 — a11y** (double h1, tour, tables de graphe).
6. **D4 — god-files + sélecteurs atomiques** (gros refactor, fait après stabilisation).
7. **D7/D8/D9** — perf boot, polish, sécurité.
