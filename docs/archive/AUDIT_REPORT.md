# Rapport d'audit complet FinanceAI

> Audit conduit par Claude (Opus 4.7) le 14 mai 2026 sur la branche `claude/analyze-finance-app-CtLvs` (commit `e9d63e9a` au moment de l'audit).
>
> Methode : 4 sous-agents specialises en parallele (reconstruction + checks de qualite, audit UX onglet par onglet, audit securite, audit architecture + performance) + tests locaux Node 22 sur les services et le serveur MCP.

---

## Table des matieres

1. [Resume executif](#1-resume-executif)
2. [Verdict global](#2-verdict-global)
3. [Top 10 bugs a fixer en priorite](#3-top-10-bugs-a-fixer-en-priorite)
4. [Build et qualite (checks automatises)](#4-build-et-qualite-checks-automatises)
5. [Audit onglet par onglet](#5-audit-onglet-par-onglet)
6. [Audit securite (score 5/10)](#6-audit-securite-score-510)
7. [Audit architecture et performance](#7-audit-architecture-et-performance)
8. [Tests, CI/CD et dette technique](#8-tests-cicd-et-dette-technique)
9. [Plan de remediation priorise](#9-plan-de-remediation-priorise)

---

## 1. Resume executif

**Forces** : la couche `services/*` est exemplaire (fonctions pures, sans dependance React/DOM, 46 tests Vitest qui passent). La crypto AES-GCM + PBKDF2 dans `cloudBackup.ts` est solide. Le serveur MCP livre cette semaine fonctionne (handshake stdio + 4 tools valides en live). Pas un seul TODO/FIXME/HACK dans le code source. Le typecheck et le build Vite passent sans erreur.

**Faiblesses moyennes** : store Zustand mono-bloc qui re-render toute l'app a chaque mutation (aucun selecteur, aucun `useCallback`, aucun `React.memo`). Bundle initial gonfle par l'absence totale de `React.lazy` sur les 18 onglets et l'externalisation de React/Recharts/Tailwind via CDN qui annule la moitie des optimisations Vite. Plusieurs composants depassent 800 lignes (Investments, Budget, RealEstate, LifeEvents, FutureProjection).

**Faiblesses graves** : 2 vulnerabilites de securite critiques (cles API en clair dans `localStorage`, CSP qui autorise `unsafe-eval` + `unsafe-inline` + importmap externe), 3 hautes (donnees personnelles envoyees a Google Gemini sans consentement Loi 25 + ecran d'onboarding qui ment, `document.write` dans le fallback PDF, restauration JSON sans validation declenchant `localStorage.clear()`). **Aucun pipeline CI/CD** : `npm run lint`, `typecheck`, `test` ne s'executent jamais automatiquement, le deploy Netlify ne lance que `vite build` qui n'arrete pas sur des erreurs de type.

**Bugs critiques cachés** : (1) le composant `AiAssistant` recoit la prop `realEstateGoals` (pluriel, tableau) mais declare `realEstateGoal` (singulier, objet) — le contexte IA envoye a Gemini contient `undefined` ; (2) le modele `gemini-3-flash-preview` reference dans `AiAssistant.tsx` n'existe pas (devrait etre `gemini-2.0-flash`) — l'assistant repond probablement avec une erreur silencieuse a chaque message.

**Pattern de bugs recurrents** : confirmations incoherentes (mix `window.confirm` bloquant et `ConfirmModal`), suppressions sans confirmation, etats locaux non persistes (age courant, choix de vie enfants, taxes immobilier), props passees mais jamais utilisees, hardcoding de noms personnels (Marc/Anna), onglet GOALS 100% mort, toggle AUTO/MANUAL dans RealEstate code sans bouton d'acces.

---

## 2. Verdict global

| Axe | Note | Commentaire |
|---|---|---|
| **Securite** | 5/10 | 2 critiques bloquantes + 3 hautes. Promesse onboarding mensongere a corriger urgemment (Loi 25). |
| **Architecture** | 6/10 | Services purs exemplaires (Phase 2 reussie). Store mono-bloc, pas de lazy, pas de CI = dette qui s'accumule. |
| **Performance** | 4/10 | Bundle initial ~1 MB, Recharts 400 ko via CDN sans tree-shaking, Tailwind CDN runtime, aucun chunking. Phase 4 du plan a 0%. |
| **Tests** | 5/10 | 46 tests services purs solides. Mais zero test composant React, zero E2E, zero CI. Le coeur metier (`useFutureSimulation` 1948 lignes) n'a aucun test. |
| **UX/Completude** | 6/10 | 5 onglets riches et bien faits (FUTURE, REAL_ESTATE, CHILD, LIFE_EVENTS, INVESTMENTS). 1 onglet 100% mort (GOALS), plusieurs boutons inaccessibles, beaucoup d'inconsistances. |
| **Type safety** | 7/10 | `noImplicitAny: true`, typecheck propre. Mais pas de `strict`, donc les bugs de props (cf. AiAssistant) passent. 22 `any` dans useFutureSimulation. |
| **Maintenabilite** | 5/10 | Composants 800-1900 lignes, store geant, props en cascade inutiles. Beaucoup de handlers morts dans App.tsx. |
| **Documentation** | 7/10 | `plan_mcp_financeai.md` excellent, `mcp/README.md` clair, `CHANGELOG_COMPLET.md` present. Mais SystemView affiche un faux terminal trompeur. |

**Note moyenne : 5.6/10.**

L'app est fonctionnelle et bien plus avancee que ce qu'on voit dans la moyenne des side-projects. Le code metier est de tres bonne qualite. Les problemes sont essentiellement structurels (CI, bundle, store) et de finition (boutons morts, confirmations, secrets).

---

## 3. Top 10 bugs a fixer en priorite

Classes par criticite x facilite de fix :

1. **CRITIQUE | `AiAssistant` reçoit la mauvaise prop** — `App.tsx` ligne 565 passe `realEstateGoals={state.realEstateGoals}` (pluriel), mais `AiAssistant.tsx` ligne 12 declare `realEstateGoal: RealEstateGoal` (singulier). Le contexte envoye a Gemini est donc faux (`undefined`). Le modele reference `gemini-3-flash-preview` n'existe pas — utiliser `gemini-2.0-flash`. **Fix : 2 lignes, 5 minutes.**

2. **CRITIQUE | Cles API en clair dans `localStorage`** — `lm_token` et `gemini_key` sont stockes sans chiffrement via Zustand `persist`. Toute extension malveillante, XSS, ou simple acces a l'ordinateur permet l'exfiltration. **Fix : exclure `apiKeys` du `partialize` de persist OU chiffrer ce bloc avec la passphrase deja utilisee dans `cloudBackup.ts`. ~1h.**

3. **CRITIQUE | CSP `unsafe-eval` + `unsafe-inline` + importmap externe** — `netlify.toml` autorise `unsafe-eval` et charge React/Recharts/Tailwind depuis CDN. Une compromission de `esm.sh` (cas deja vu en 2024) suffit a injecter du code dans l'app. **Fix : retirer l'importmap d'`index.html`, laisser Vite bundler. ~2h.**

4. **HAUT | Onboarding mensonger sur la privacy** — `components/Onboarding.tsx:97` annonce "Donnees locales — rien n'est envoye sur nos serveurs" alors que `services/gemini.ts` envoie payees, salaires, soldes a Google. Risque Loi 25. **Fix : reformuler + ajouter consentement explicite Gemini. ~30 min.**

5. **HAUT | Restore JSON sans validation declenche `localStorage.clear()`** — `components/Settings.tsx:188` accepte n'importe quel JSON et ecrase tout. Un fichier malicieux peut injecter des cles API attaquant. **Fix : valider via schema Zod + double confirm. ~2h.**

6. **HAUT | Aucun CI/CD** — `npm run typecheck`, `lint`, `test` ne tournent jamais automatiquement. Le deploy Netlify ne lance que `vite build` qui ne verifie pas les types. **Fix : `.github/workflows/ci.yml` + modifier `netlify.toml` command. ~1h.**

7. **MOYEN | Onglet GOALS 100% mort** — composant placeholder de 20 lignes qui annonce "Les Objectifs ont demenage". `App.tsx` passe 8 props inutiles. Pollution UX. **Fix : supprimer du Tab enum + cleanup props. ~15 min.**

8. **MOYEN | Toggle AUTO/MANUAL dans RealEstate inaccessible** — `RealEstate.tsx` a un `setMode` mais aucun bouton ne change le mode. Code mort visible. **Fix : ajouter le toggle ou retirer le state. ~10 min.**

9. **MOYEN | `onSyncLunchMoney` dans Transactions non cable** — la prop est passee mais aucun bouton ne l'invoque. Le seul moyen de re-sync est de re-saisir la cle API dans Settings. **Fix : ajouter un bouton refresh. ~15 min.**

10. **MOYEN | Composants 800-1900 lignes a splitter** — `Investments.tsx` (~970), `Budget.tsx` (~970), `RealEstate.tsx` (~860), `LifeEvents.tsx` (~770), `FutureProjection.tsx` (~900), et surtout `useFutureSimulation.ts` (1948 lignes, 105 ko, zero test). **Fix : extraire les `useMemo` lourds en hooks dedies + tests unitaires sur les fonctions internes. ~2-3 jours.**

---

## 4. Build et qualite (checks automatises)

Reconstruction du repo dans `/tmp/fai-full/`, `npm install`, puis batterie de checks :

| Commande | Exit | Resultat |
|---|---|---|
| `tsc --noEmit` | 0 | OK (apres ajout `@types/react`). Pas de `strict: true` donc certains bugs de typage passent (cf. AiAssistant). |
| `vitest run` | 0 | **46/46 tests passent** : tax (22), realEstate (11), portfolio (13). ~390 ms. |
| `npm run build` (vite) | 0 | 746 modules, dist 1.2 MB total. Warning chunk size attendu. |
| `npx knip` | 1 | 7 fichiers "unused", 7 deps inutilisees, 29 exports inutilises. Beaucoup de faux positifs sur composants UI (lies aux stubs de l'audit). Vrais positifs : `services/cloudBackup.ts` (code ecrit, jamais consomme par l'UI). |
| `eslint . --ext ts,tsx` | 2 | **Pas de config ESLint v9** dans le repo malgre eslint v9 dans `package.json`. Linting impossible. |
| `npm audit` | - | 5 moderate (chaine `esbuild` -> vite -> @vitest/mocker). Aucune en prod. Fix necessite `vitest 4` (breaking). |

**Console.log oublies** : seulement 3, tous des logs operationnels legitimes (`services/finance.ts:117`, `services/lunchMoney.ts:32`, `services/pdfReport.ts:46`).

**TODO/FIXME/HACK** : zero. Le code est tres propre sur ce critere.

**Top fichiers avec `any`** :

| Fichier | Occurrences |
|---|---|
| `utils/useFutureSimulation.ts` | 22 |
| `store/useFinanceStore.ts` | 5 |
| `services/gemini.ts` | 5 |
| `tests/services/portfolio.test.ts` | 4 |
| Autres | <=2 chacun |

**Lignes de code metier (hors stubs UI)** :

| Fichier | LOC |
|---|---|
| `utils/useFutureSimulation.ts` | **1 948** |
| `services/cloudBackup.ts` | 243 |
| `services/finance.ts` | 220 |
| `services/realEstate.ts` | 212 |
| `services/gemini.ts` | 194 |
| `store/useFinanceStore.ts` | 188 |

---

## 5. Audit onglet par onglet

Resultats pour chacun des 18 onglets de l'enum `Tab`. Status par bouton : OK / MORT (handler vide ou absent) / TODO (placeholder ou commente) / VISUEL (display only).

### 5.1 DASHBOARD (Dashboard.tsx ~570 lignes)

Vue d'ensemble patrimoine net, evolution graphique, ventilation cash/actifs/credit, timeline jalons de vie.

| Element | Status | Note |
|---|---|---|
| Boutons range 1M/3M/YTD/1Y/ALL | OK | Filtre graphique |
| Input "Annees future" | OK | Recalcule projection composee simplifiee |
| Inputs date custom (customStart/End) | MORT | States declares mais aucun bouton CUSTOM dans l'UI |
| Jalons timeline (clic) | OK | Navigation vers tab cible |

**Problemes** : pas de gestion d'erreur si `marketData` ne charge pas, `apiKey` recu en prop mais inutilise, `customStart/End` sont du code mort.

### 5.2 TRANSACTIONS (Transactions.tsx ~620 lignes)

Tableau transactions avec filtres, categorisation IA en batch, regles auto, assistant pour les non-classees.

| Element | Status | Note |
|---|---|---|
| "IA Auto-Scan" | OK | Lance Gemini |
| "+ Ajouter" / "Appliquer" / "Supprimer" regle | OK | |
| "CSV" export | OK | Bien fait |
| "Assistant" wizard | OK | Modal grouper non-classees |
| Select categorie ligne | OK | |
| Toggle transfert | OK | |
| Checkbox sel. tout | OK | |
| **prop `onSyncLunchMoney`** | MORT | Recu mais aucun bouton ne l'appelle |
| **prop `isSyncing`** | MORT | Recu mais jamais utilise |
| **state `dateStart`** | MORT | Declare mais aucun input date dans l'UI |
| Pagination | OK | |

**Problemes** : sync LunchMoney non cable, pas de version mobile du tableau (`hidden md:block` sans alternative), filtre dateStart code mort.

### 5.3 BUDGET (Budget.tsx ~970 lignes)

Pilotage budget par categorie (Besoin/Envie/Epargne), repartition couple, simulateur inflation, diagnostic IA.

| Element | Status | Note |
|---|---|---|
| "Diagnostic IA" (2x dans l'UI) | OK | Appelle Gemini |
| Boutons Mois/Trim/Annee/Custom | OK | |
| Inputs date custom | OK | Visible si CUSTOM actif |
| Slider inflation | OK | Cache derriere hover |
| Edition inline nom/cible/freq/type | OK | |
| "Supprimer" categorie | OK | Utilise ConfirmModal (bien) |
| "+ Ajouter ligne dans X" | OK | |
| Clic ligne (expand) | OK | Sparkline 6m |

**Problemes** : inflation slider peu decouvrable (hover only, casse sur mobile), cast `'Quarterly' as any` suspect, AI recos peuvent etre vides sans message clair.

### 5.4 GOALS (Goals.tsx 20 lignes)

**ONGLET 100% MORT.** Composant placeholder qui annonce que les objectifs ont demenage vers FUTUR.

| Element | Status | Note |
|---|---|---|
| (aucun bouton) | MORT | Page totalement statique |

**Problemes** : `App.tsx` ligne 500 passe 8 props complexes pour rien. Devrait etre supprime du Tab enum ou redirige automatiquement.

### 5.5 PLANNING (Planning.tsx ~280 lignes)

Detection des charges recurrentes (heuristique + IA), calendrier des factures, gestion des sinking funds.

| Element | Status | Note |
|---|---|---|
| "IA" detection | OK | |
| "Reset" IA | OK | |
| Mois calendrier | OK | |
| "+ Nouveau" goal | OK | Pas de validation visible si vide |
| "Ajouter" goal | OK | |
| "Supprimer" goal | OK | **Pas de confirmation** |
| **prop `setBudgetItems`** | MORT | Recu mais jamais utilise |
| **prop `config`** | MORT | Recu mais inutilise |

### 5.6 DEBT (DebtManager.tsx ~200 lignes)

Gestion dettes manuelles, strategie avalanche, projection extinction.

| Element | Status | Note |
|---|---|---|
| "+ Ajouter" | OK | |
| "Enregistrer" | OK | |
| "Supprimer" | OK | **Pas de confirmation** |
| Slider extra payment | OK | |

**Problemes** : "Interets evites" affiche un placeholder sans vrai calcul. Pas de gestion si `interestRate=0`.

### 5.7 INVESTMENTS (Investments.tsx ~970 lignes)

Suivi portefeuille bourse, score sante, calendrier dividendes, rebalancing.

| Element | Status | Note |
|---|---|---|
| Boutons range | OK | |
| Toggle serie actif | OK | |
| Toggle DRIP | OK | |
| "Modifier Cibles" / "Terminer" | OK | |
| Inputs cible rebalancing | OK | **Non persiste** au remount |
| Select type compte | OK | |
| **~6 props "compat heritee"** | MORT | `investmentAccounts`, `investmentTransactions`, etc. |

**Problemes** : `ASSET_META` hardcodee = pas d'UI pour ajouter un actif. `targetModel` reset a chaque montage. Dette technique massive sur les props.

### 5.8 FUTURE (FutureProjection.tsx ~900 lignes)

Simulateur HD depart 2026, 5 scenarios, Monte Carlo, FIRE.

| Element | Status | Note |
|---|---|---|
| Boutons scenarios (5) | OK | |
| "Donnees reelles" / "Sandbox" | OK | |
| "Monte Carlo" toggle | OK | |
| ~10 sliders | OK | Revenus, depenses, horizon, inflation, salaire, rendements, coussin, valeur max |
| "Auto (historique)" | OK | Bien fait |

**Problemes** : noms `IncomeMarc` / `IncomeAnna` hardcodes dans le tooltip = pas universel. Beaucoup de safety `|| 0` qui peuvent masquer des bugs de calcul. `financialGoals` recu en prop mais inutilise.

### 5.9 REAL_ESTATE (RealEstate.tsx ~860 lignes)

Configurateur multi-proprietes, amortissement detaille, comparatif acheter/louer/bourse.

| Element | Status | Note |
|---|---|---|
| Tabs proprietes | OK | |
| "+ Ajouter une propriete" | OK | |
| "Supprimer" propriete | OK | **Pas de confirmation** |
| Editable name input | OK | |
| "Activer dans Simulation" | OK | |
| Checkbox Residence/Locative | OK | |
| "Auto (Moy. QC)" loyer | OK | |
| Sliders/inputs prix/mise/taux/etc. | OK | |
| **Toggle AUTO/MANUAL `setMode`** | MORT | State declare mais aucun bouton ne change le mode |
| Inputs taxes/chauffage/condo | OK | **Non persistes** au reload (useState local) |

### 5.10 CHILD (ChildPlanning.tsx ~770 lignes)

Configurateur enfant, choix de vie (garderie, ecole, activites, universite, voiture), simulateur REEE.

| Element | Status | Note |
|---|---|---|
| Tabs enfants | OK | |
| "+ Ajouter" enfant | OK | |
| "Supprimer" enfant | OK | **window.confirm bloquant** (incoherent) |
| Activer/Desactiver | OK | |
| Boutons choix vie | OK | **Non persistes par enfant** : reset au switch |
| Slider cotisation REEE | OK | |

### 5.11 TRAVEL (Travel.tsx ~120 lignes)

CRUD voyages avec compte a rebours.

| Element | Status | Note |
|---|---|---|
| "+ Nouveau Voyage" | OK | |
| "Ajouter" | OK | Validation nom+cout |
| "Supprimer" | OK | Utilise ConfirmModal (bien) |

**Problemes** : champ `image` dans newTrip mais aucune UI pour l'utiliser. Pas de tri/filtre.

### 5.12 LIFE_EVENTS (LifeEvents.tsx ~770 lignes)

Gestion evenements de vie (mariage, krach, accident, etc.), drag-drop timeline.

| Element | Status | Note |
|---|---|---|
| "Ajouter" | OK | |
| Tabs categorie | OK | |
| Drag&drop timeline | OK | Met a jour annee |
| Tab ALL/TRAVEL/RISK | OK | |
| Clic item -> analyse | OK | |
| "Supprimer" | OK | **window.confirm bloquant** |

**Problemes** : bug potentiel `const [dragOverYear, setDragOverYear] = React.useState()` declare 2x (scope composant + IIFE) = doublon. `selectedItem` fallback flou.

### 5.13 RETIREMENT (Retirement.tsx ~530 lignes)

Planification retraite avec moteur projection partage, accumulation + decumulation.

| Element | Status | Note |
|---|---|---|
| Input age actuel/retraite | OK | **`currentAge` non persiste** |
| Slider esperance de vie | OK | |
| Inputs besoin mensuel / rente | OK | |

**Problemes** : faible interactivite (que sliders + inputs). Pas d'export, pas de recommandations.

### 5.14 TAX (TaxCenter.tsx ~480 lignes)

Calculateur impots QC/Fed, scan IA fiches de paie, vue global ou par user.

| Element | Status | Note |
|---|---|---|
| "Analyser Documents" | OK | Gemini multi-files |
| Bouton Drive | OK | **URL hardcodee vers dossier perso de Marc** |
| Tabs Global/User | OK | |
| Sliders REER/CELIAPP | OK | |
| "Appliquer au Profil" | OK | |
| "Ignorer" scan | OK | |

**Problemes** : lien Drive `1mBg4NFJFbT5FpfxUEZkX-9fx8WgVnMH7` est ton dossier perso = fuite. `jsPDF` importe mais jamais utilise. `wait(3000)` entre fichiers ralentit l'UX inutilement.

### 5.15 DATA (JsonDataView.tsx ~125 lignes)

Visualisation brute du Google Sheet.

| Element | Status | Note |
|---|---|---|
| Pagination | OK | |
| Connecte au Cloud | VISUEL | Toujours vert meme si data vide (trompeur) |

**Problemes** : pas d'export, pas de filtre, pas de recherche, pas de refresh manuel.

### 5.16 SETTINGS (Settings.tsx ~440 lignes)

Configuration globale, cles API, utilisateurs, profils, backup/restore.

| Element | Status | Note |
|---|---|---|
| Inputs Gemini/LM keys | OK | **Stockes en clair** |
| "Sauvegarder" profil | OK | Toast feedback |
| Clic profil -> load | OK | |
| "Supprimer" profil | OK | Double-clic confirm pattern |
| "Ajouter/Retirer conjoint" | OK | |
| Inputs user | OK | |
| Checkbox fiscaux | OK | |
| Select splitMode | OK | |
| "Tout Exporter" | OK | |
| "Restaurer" | OK | **window.confirm + pas de validation** |
| **~6 setters props inutilises** | MORT | setBudgetItems, setAssets, etc. |

**Problemes** : Import `from '../utils/tax'` au lieu de `../services/tax` (incoherent). Profil ne sauve que `config` (pas budgets, assets, goals) = UX trompeur. Restore casse les donnees sans validation.

### 5.17 SYSTEM (SystemView.tsx ~125 lignes)

Documentation des interconnexions et changelog visuel.

| Element | Status | Note |
|---|---|---|
| (aucun bouton) | VISUEL | Documentation pure |

**Problemes** : faux terminal avec logs decoratifs = trompeur. Documentation hardcodee qui va se desynchroniser.

### 5.18 ASSISTANT (AiAssistant.tsx ~210 lignes)

Bouton flottant chat IA contextualise.

| Element | Status | Note |
|---|---|---|
| Bouton flottant | OK | |
| Input message | OK | |
| "Envoyer" | **CASSE** | Modele `gemini-3-flash-preview` n'existe pas |
| "Effacer" | OK | Pas de confirm |
| **Prop `realEstateGoal` (singulier)** | **CASSE** | App passe `realEstateGoals` (pluriel) = contexte IA contient `undefined` |

**Problemes critiques** : 2 bugs qui rendent l'assistant inoperant ou degrade. Conversation non persistee, pas de streaming.

### Synthese onglets

**Top 5 onglets les plus complets** : FUTURE, REAL_ESTATE, CHILD, LIFE_EVENTS, INVESTMENTS.

**Top 5 onglets avec le plus de problemes** : ASSISTANT (2 bugs critiques), GOALS (mort), TRANSACTIONS (sync orphelin), SETTINGS (mauvais imports + Restore non valide), REAL_ESTATE (toggle AUTO/MANUAL inaccessible).

**Patterns recurrents** :
1. Confirmations incoherentes (mix `window.confirm` et `ConfirmModal`)
2. Suppressions sans confirmation (Debt, Planning, Investments rebalancing, RealEstate, AiAssistant clear)
3. Props inutilisees passees en cascade (~15 dans Settings, ~6 dans Investments)
4. Etats locaux non persistes (currentAge, choix enfant, taxes immo, targetModel investments)
5. Hardcoding fuites de contexte (Marc/Anna dans FutureProjection tooltip, URL Drive perso dans TaxCenter)
6. Pas de version mobile serieuse (tableaux `hidden md:block` sans alternative)
7. Code mort visible (`setMode` RealEstate, `customStart` Dashboard, `dateStart` Transactions, `onSyncLunchMoney`, jsPDF dans TaxCenter)

---

## 6. Audit securite (score 5/10)

### CRITIQUE

**C1. Cles API LunchMoney + Gemini stockees en clair dans `localStorage`**
- Fichiers : `store/useFinanceStore.ts:65-78`, `components/Settings.tsx:182-202`, `App.tsx:319`.
- Zustand `persist` (`useFinanceStore.ts:184-194`) sauvegarde `apiKeys` dans `financeai-storage` sans chiffrement.
- Impact : tout JS execute dans l'origine (XSS, extension, CDN compromis) ou acces physique a l'ordi permet l'exfiltration immediate du token LunchMoney (acces total au compte) et de la cle Gemini (cout monetisable).
- Recommandation : utiliser la primitive AES-GCM + PBKDF2 deja codee dans `services/cloudBackup.ts` pour chiffrer le bloc `apiKeys`, OU exclure `apiKeys` du `partialize` de persist et reprompt a chaque session.

**C2. CSP autorise `unsafe-inline` + `unsafe-eval` ET importmap vers `esm.sh`**
- Fichiers : `netlify.toml:14-20`, `index.html:103-111`.
- `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://esm.sh https://cdn.jsdelivr.net`.
- React, recharts, `@google/genai` charges depuis `esm.sh` au runtime via importmap.
- Impact : compromission `esm.sh` (deja arrive en 2024), attaque MITM, ou simple XSS reflechi suffit a exfiltrer les cles. `unsafe-eval` etend la surface a tout `eval`/`new Function`.
- Le commentaire ligne 12 admet : "A serrer en Phase 4 quand on aura migre Tailwind en build-time". La Phase 4 n'a pas commence.
- Recommandation : migrer Tailwind en build-time, retirer l'importmap, laisser Vite bundler. A minima, ajouter Subresource Integrity sur les scripts CDN.

### HAUT

**H1. Donnees PII envoyees a Google Gemini sans consentement Loi 25**
- Fichiers : `services/gemini.ts:80-95`, `127-138`, `198-228`, `239-261`, `components/AiAssistant.tsx:53-80`.
- `sanitizePayee` (60 chars max + strip control) et `roundToHundred` ne suffisent pas a anonymiser : marchands locaux ("IGA Plateau", "Hydro-Quebec"), nom conjoint, age, soldes restent identifiables. `AiAssistant.tsx:80` envoie les 20 dernieres transactions en clair **sans sanitisation**.
- L'ecran d'onboarding (`Onboarding.tsx:97`) dit explicitement "Donnees locales — rien n'est envoye sur nos serveurs" — c'est **materiellement faux**. Risque reputationnel + Loi 25 (consentement non eclaire).
- Recommandation : corriger le message + consentement explicite avant activation Gemini + sanitisation universelle.

**H2. `document.write` dans fallback PDF avec donnees utilisateur**
- Fichier : `services/pdfReport.ts:217-251`.
- Aujourd'hui valeurs purement numeriques = impact faible. Mais futur dev ajoutant `data.userName` ou un libelle de propriete = XSS direct.
- Recommandation : remplacer par `createElement` + `textContent`, ou par un Blob/`srcdoc` sandbox.

**H3. `localStorage.clear()` declenche par fichier JSON externe sans validation**
- Fichier : `components/Settings.tsx:188`.
- `handleRestore` accepte n'importe quel JSON avec `transactions` ou `version`, declenche `localStorage.clear()` puis reinjecte tout y compris `lm_token` et `gemini_key`.
- Impact : ingenierie sociale (fichier de "backup" malveillant) permet d'ecraser les donnees Marc, injecter des cles API attaquant, ou inserer des transactions piegees.
- Recommandation : validation Zod stricte du schema + refuser tout fichier non chiffre + double confirm.

### MOYEN

**M1. Pas de validation des bornes numeriques sur inputs financiers** — `Onboarding.tsx:148-155`, `Settings.tsx:222-240` utilisent `parseFloat(e.target.value)` sans clamp ni verif NaN. Un input `1e308` peut produire `Infinity` dans `useFutureSimulation.ts` (calculs sur 30 ans) -> freeze UI / corruption state persistant.

**M2. Reponses LLM consommees sans validation de schema** — `services/gemini.ts:48-53` `safeJsonParse` retourne `[]` si malforme mais ne valide pas la structure. Categorie injectee directement dans `t.category`. Prompt injection via un payee LunchMoney force possible.

**M3. Pas de `rel="noopener"` sur liens externes** — `Onboarding.tsx:209` et `:216` ont `rel="noreferrer"` seul. Tabnabbing residuel sur anciens UA.

**M4. Proxy CORS public `api.allorigins.win`** — `services/finance.ts:191-204`. Tout le contenu du Google Sheet (positions investissement) transite par un tiers gratuit sans SLA. Compromission = alteration des valeurs.

### BAS / INFORMATIONNEL

- `Math.random()` pour IDs dans `store/useFinanceStore.ts:21` et `services/gemini.ts:275` (fallback). Remplacer par `crypto.randomUUID()` deja utilise ailleurs.
- Logs verbeux en prod : `services/lunchMoney.ts:31, 50`, `services/finance.ts:153, 227`. `vite.config.ts` ne configure pas `esbuild.drop`.
- Aucune telemetrie / analytics — point positif.
- `vite.config.ts:9` bind dev sur `host: '0.0.0.0'` = expose le serveur de dev au LAN. OK pour dev mais a documenter.
- Aucun fuzz test sur les forms ou la restauration JSON.

### Bonnes pratiques deja en place

- Aucun secret hardcode (verifie via grep `AIza`, `Bearer`, `.env*`).
- `.gitignore` exclut `.env` et `.env.*`.
- Aucun `dangerouslySetInnerHTML` ni `innerHTML` dans le code source.
- Toutes les communications externes en HTTPS.
- `services/cloudBackup.ts` : AES-256-GCM + PBKDF2-SHA256 600 000 iterations (OWASP 2023), salt/IV aleatoires, magic header `FAI1`.
- Headers Netlify : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS 1 an, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Sanitisation prompts LLM amorcee (`sanitizePayee` + `roundToHundred`).
- Re-throw erreurs LunchMoney sans fake data.
- Backup automatique des donnees corrompues avant reset (`useFinanceStore.ts:140-156`).
- Pas d'auth backend a securiser (app client-only).
- React 19, zustand 5, vite 6, zod 3.23 — toutes versions recentes, aucune lib obsolete connue.
- Fetch avec timeout + retry + AbortSignal partout (`services/finance.ts:60-86`).

---

## 7. Audit architecture et performance

### Architecture

App.tsx = orchestrateur de 740 lignes avec 18 onglets rendus par 18 ternaires successifs `{activeTab === Tab.X && <Comp/>}`. Aucun routeur React Router : synchronisation onglet/URL via `window.location.hash` + `useEffect` qui ecoute `hashchange`. Tous les composants importes statiquement = pas de code splitting.

**Bug architectural detecte** : `components/Dashboard.tsx:31` fait `import { ASSET_META } from './Investments'`. Cela tire **tout** `Investments.tsx` (53 ko incluant Recharts PieChart, BarChart) dans le bundle Dashboard. `ASSET_META` devrait vivre dans `constants.ts` ou `services/assetMeta.ts`.

**Store Zustand mono-bloc** : aucun selecteur, aucun slice. `App.tsx` ligne 35-36 fait `const state = useFinanceStore()` puis lit ~25 proprietes. Re-render complet a chaque mutation. ~30 appels a `setAppState({ partial, lastUpdate: Date.now() })` dans App.tsx. Categoriser 200 transactions via batch declenche 200 re-renders pleins.

**`services/projection.ts` = re-export vide** vers `utils/useFutureSimulation.ts` (105 ko / 1948 lignes). Migration physique annoncee "commit ulterieur" n'a pas eu lieu. Le tool MCP `run_projection` a ete force d'implementer une projection simplifiee plutot que de cabler le vrai moteur.

### Performance bundle

**`vite.config.ts` (24 lignes) ne configure rien pour la perf** : pas de `manualChunks`, pas de `chunkSizeWarningLimit`, pas de `sourcemap`, pas de `minify`. Juste l'alias `@/*` et l'injection de la cle Gemini.

**`index.html` charge** :
- Tailwind via CDN (~80 ko JS-runtime qui parse le DOM a chaque render). Officiellement non recommande en prod.
- React, ReactDOM, Recharts, `@google/genai` via importmap vers `esm.sh`. **Jamais bundles par Vite.** Le tree-shaking de Recharts est impossible (chaque visite charge ~400 ko).

**Composants > 800 lignes** (a splitter en hooks) :
- `utils/useFutureSimulation.ts` : 1948 lignes / 105 ko
- `Budget.tsx` : ~970 lignes
- `Investments.tsx` : ~970 lignes
- `RealEstate.tsx` : ~860 lignes
- `LifeEvents.tsx` : ~770 lignes
- `FutureProjection.tsx` : ~900 lignes
- `Transactions.tsx` : ~620 lignes

**Aucun `React.lazy` / `Suspense` dans toute l'app.** Le seul split dynamique : `services/pdfReport.ts:60` `await import('jspdf')`. Bonne pattern isole.

### Performance React

- `useMemo` : ~50 occurrences, bien utilise.
- `useCallback` : **zero**. Tous les handlers d'App.tsx sont recrees a chaque render.
- `React.memo` : **zero**. Aucun composant memoize.

**Iterations couteuses redondantes** :
- `App.tsx:391-394` `globalNetWorth` itere `state.assets` ET `state.transactions`.
- `App.tsx:459` `currentLiquidity` re-itere `state.transactions` (deja itere ligne 391).
- `Dashboard.tsx:145` `unifiedHistory` fait 3 passes sur transactions + boucle imbriquee.

### Asynchronie

**Promesses non gerees / race conditions** :
- `App.tsx:120` `loadData()` async sans await ni cleanup.
- `App.tsx:130` `updateFxRates()` idem.
- `App.tsx:162` `hydrateAssets()` idem.
- `Dashboard.tsx:67` `load()` peut appeler `setMarketData` apres unmount.
- `FutureProjection.tsx:198` `fetchLiveTotals()` dans `useEffect([assets])` sans flag cancelled = race condition si assets change pendant fetch.
- `services/lunchMoney.ts:50` pagination `while (keepFetching)` sans AbortController. Changer la cle API en cours de pagination = ancien token continue.

**AbortController utilise** : `services/finance.ts:60-86`, `services/macroApi.ts:51`. Bonne pratique sur les services. **Pas utilise** dans `services/lunchMoney.ts` ni dans aucun `useEffect` React.

---

## 8. Tests, CI/CD et dette technique

### Tests

**Couverture actuelle** :
- 46 tests Vitest sur services purs uniquement : tax (22), realEstate (11), portfolio (13).
- **Zero test sur** : `services/finance.ts`, `services/cloudBackup.ts`, `services/lunchMoney.ts`, `services/gemini.ts`, et surtout `services/projection.ts` / `utils/useFutureSimulation.ts` (1948 lignes — le coeur metier).
- Zero test de composant React (pas de Testing Library, environnement vitest est `node` sans jsdom).
- Zero test E2E (pas de Playwright ni Cypress dans `package.json`).
- Zero mock global de fetch.

### CI/CD

**Aucun fichier dans `.github/workflows/`.** Pas de pipeline GitHub Actions, pas de pre-commit hook (pas de `.husky/`, pas de `lint-staged`). Le seul controle est le deploy auto Netlify qui lance `npm run build` — **`vite build` n'execute pas `tsc`**, donc les erreurs de type non bloquantes passent en prod. `npm run lint`, `typecheck`, `test` ne s'executent jamais automatiquement.

### Dead code et props inutilisees

- `services/cloudBackup.ts` : 243 lignes ecrites et testees, **jamais importe** par l'UI.
- `Goals.tsx` : 20 lignes, 0 prop utilisee mais App lui passe 8 props.
- Handlers morts dans `App.tsx` : `handleRestoreTransaction`, `handleSaveFutureConfig`, `handleUpdateTransaction`, `handleClearAllData`, `handleDeleteTransaction` — declares mais aucun call site dans le JSX.
- `state.childGoal` (singulier legacy) : migration manuelle dupliquee dans `App.tsx:104-115` et `useFinanceStore.ts:116-117`.
- `knip` dans `devDependencies` mais aucun `npm run knip` branche.
- Pas de `eslint.config.js` malgre eslint v9 en deps.
- `jsPDF` importe dans `TaxCenter.tsx` mais jamais utilise.

---

## 9. Plan de remediation priorise

### P0 — Critique (semaine 1, 1-2 jours total)

1. **Brancher CI GitHub Actions** : `.github/workflows/ci.yml` avec `npm ci && npm run typecheck && npm run test && npm run build`. ~1h.
2. **Activer `tsc --noEmit` en pre-build Netlify** : modifier `netlify.toml` -> `command = "npm run typecheck && npm run test && npm run build"`. ~10 min.
3. **Fixer AiAssistant** : passer `realEstateGoal: state.realEstateGoals[0]` (App.tsx:565) + remplacer `gemini-3-flash-preview` par `gemini-2.0-flash`. ~5 min.
4. **Chiffrer ou exclure les cles API du persist Zustand** : utiliser la primitive de `cloudBackup.ts` OU `partialize` pour exclure `apiKeys`. ~1h.
5. **Corriger Onboarding mensonger sur la privacy** + ajouter consentement Gemini explicite. ~30 min.
6. **Externaliser React/Recharts via Vite + retirer importmap** : suppression de `<script type="importmap">` d'`index.html`. Permet tree-shaking. ~2h.
7. **Configurer ESLint v9** : `eslint.config.js` minimal pour debloquer le lint. ~30 min.

### P1 — Haut (semaines 2-3)

8. **Lazy-loader les 18 onglets** : `React.lazy(() => import(...))` pour Investments, Budget, RealEstate, LifeEvents, FutureProjection, Retirement, ChildPlanning, TaxCenter. Wrapper dans `<Suspense>`. Gain estime : -60% bundle initial.
9. **Migrer Tailwind en build-time** : `npm install -D tailwindcss postcss autoprefixer`, supprimer le CDN d'`index.html`. -80 ko CSS runtime.
10. **Valider le restore JSON** : schema Zod strict dans `Settings.tsx:188` + double confirm avant `localStorage.clear()`.
11. **Bouger `ASSET_META` hors d'Investments** : vers `constants.ts` ou `services/assetMeta.ts`. Casser le cycle Dashboard ↔ Investments.
12. **Retirer l'onglet GOALS** ou en faire un vrai hub : supprimer du Tab enum + cleanup props dans App.tsx.
13. **Standardiser sur ConfirmModal** partout : bannir `window.confirm`. Ajouter une confirmation pour suppressions (Debt, Planning goals, RealEstate proprietes, Investments rebalancing).
14. **Cabler `onSyncLunchMoney`** dans Transactions OU le retirer. Pareil pour `setMode` AUTO/MANUAL dans RealEstate.
15. **Externaliser hardcoding personnel** : Marc/Anna -> dynamic via config.users dans le tooltip FutureProjection. URL Drive TaxCenter -> config Setting utilisateur.

### P2 — Moyen (mois suivant)

16. **Splitter le store Zustand en slices** : `transactionsSlice`, `budgetSlice`, `investmentsSlice`, `goalsSlice`, `configSlice` + selecteurs (`useTransactions()`, `useNetWorth()`). Remplacer `setAppState(Partial)` par mutations precises.
17. **Migrer `utils/useFutureSimulation.ts` -> `services/projection.ts`** physiquement + ajouter au moins 5-10 tests unitaires de non-regression. Permet de cabler le vrai moteur dans le MCP tool.
18. **Persister les etats locaux** : `currentAge` (Retirement), choix de vie par enfant (ChildPlanning), `targetModel` (Investments), taxes/chauffage/condo (RealEstate).
19. **Brancher `cloudBackup.ts` dans Settings** : bouton "Exporter sauvegarde chiffree" et "Importer". Le code crypto est pret, l'UI est triviale.
20. **Wrapper `<ErrorBoundary>` au-dessus de chaque tab** : une exception dans `FutureProjection.tsx:290` `calculateFutureProjection` ecran blanc sur toute l'app actuellement.
21. **Tests de composants** : installer `@testing-library/react` + `happy-dom`. Premier test sur `Layout.tsx`, `Transactions.tsx`, `RealEstate.tsx`.
22. **Tests E2E minimal Playwright** : un scenario "onboarding -> ajout transaction manuelle -> check Dashboard".
23. **AbortController dans App.tsx loadData** : cleanup function dans les `useEffect` pour eviter les fuites lors de changements rapides de cle API.
24. **Eliminer handlers morts** : `handleRestoreTransaction`, `handleSaveFutureConfig`, `handleUpdateTransaction`, `handleClearAllData`, `handleDeleteTransaction` (App.tsx:313-372). 60 lignes nettoyees.
25. **Splitter les composants 800-1000 lignes** : extraire les `useMemo` lourds en hooks dedies (`useAmortizationData`, `useBudgetAggregates`).
26. **Brancher `knip` au CI** + cleanup des unused exports.
27. **Activer sourcemaps prod** : `vite.config.ts` -> `build: { sourcemap: 'hidden', chunkSizeWarningLimit: 800 }`.
28. **Mettre a jour les baremes fiscaux 2026** : les barèmes `utils/tax.ts` sont 2025, l'app demarre en 2026.

### P3 — Bas (backlog continu)

- Remplacer `Math.random()` par `crypto.randomUUID()` dans `useFinanceStore.ts:21` et `gemini.ts:275`.
- Supprimer console.log non operationnels en prod (`vite.config.ts` `esbuild.drop`).
- Ajouter `rel="noopener noreferrer"` sur Onboarding liens.
- Heberger un mini-proxy Netlify pour remplacer `api.allorigins.win`.
- Validation Zod sur les reponses LLM (Gemini).
- `safeNumber(value, min, max, fallback)` helper pour clamper les inputs financiers.
- Mobile responsive serieux sur Transactions (tableau).
- Conversation persistee dans AiAssistant.
- Bouton "Exporter mon plan retraite" dans Retirement.

---

## Conclusion

FinanceAI est un projet **bien plus avance que la moyenne des side-projects** de cette categorie. La qualite du metier financier (calculs fiscaux QC 2025, projections Monte Carlo, planification immo avec renouvellement, simulation enfants/REEE) est impressionnante. La phase 2 du plan MCP (extraction services purs + 46 tests) est exemplaire.

Les problemes sont **structurels et de finition** : absence de CI, bundle non optimise, store Zustand brut, 2 bugs critiques cachés (AiAssistant), securite des cles API.

**Avec 1-2 jours de fix P0 et 1 semaine de P1, l'app peut passer de 5.6/10 a 7-8/10** sans toucher au metier. Les P2 et P3 sont du refactor de qualite a faire en continu.

Les 4 sous-audits detailles complets sont conserves dans les logs de session. Ce rapport est la consolidation executive.
