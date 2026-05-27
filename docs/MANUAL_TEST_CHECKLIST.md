# Checklist de tests manuels — FinanceAI

> **Source unique** des tests manuels à exécuter à chaque livraison majeure.
> **Mise à jour** : à chaque nouveau fix ou feature, ajouter une entrée dans la section pertinente.
> Cible : ~160-200 tests couvrant chaque onglet, exécutables en ~45 min.

## Procédure standard

1. **Pré-requis**
   - Build prod fraîche déployée sur https://www.hubperso.com (ou preview Vercel)
   - Navigateur Chrome/Firefox récent, console DevTools ouverte (F12)
   - Aucun bouton manuel "Effacer données" cliqué avant le test

2. **Activer le mode test**
   - Onglet **Configuration → Mode test → Activer**
   - Vérifier : banner orange en haut « 🧪 MODE TEST — données fictives… » visible
   - Vérifier : aucun crash dans la console (rouge = bug)

3. **Exécuter chaque section ci-dessous dans l'ordre**
   - Cocher chaque ligne quand validée
   - Toute valeur affichée doit correspondre à `EXPECTED` (tolérance ±2 % sauf indication)
   - Toute erreur console = bug à reporter

4. **Désactiver le mode test à la fin**
   - Onglet Configuration → Mode test → Désactiver
   - Vérifier que les vraies données sont restaurées intactes

## Fixtures de référence

Couple **Alex + Sam** (mode test, `services/testFixtures.ts`) :

| Donnée | Valeur attendue |
|---|---|
| Revenus bruts annuels couple | **164 400 $** (Alex 92 400 + Sam 72 000) |
| Revenus nets mensuels couple | **9 510 $** |
| Patrimoine total (Net Worth) | **~88 220 $** (cash 8.5k + portfolio ~62k + immo equity ~85k − dettes ~21k − reste maison hypo) |
| Actifs investis | 5 (VFV.TO 240 parts, VEQT.TO 90, XEQT.TO 180, AAPL 30, BTC-CAD 0.15) |
| Transactions | 68 sur ~12 mois |
| Dettes | 2 (Visa 2 800 $ @ 19,9 % • Auto 18 500 $ @ 6,5 %) |
| Immobilier | 450 000 $ valeur • 360 000 $ hypothèque (LTV 80 %) |
| Enfant | 1 (Léa, née 2022-06-15) |
| Voyages | 2 (Italie + Japon) |
| Rénovations | 1 |
| Retraite cible | 60 ans • 5 500 $/mois |

---

## Section 1 — Dashboard (Accueil)

| # | Test | Attendu |
|---|------|---------|
| 1.1 | KPI **Patrimoine total** affiché | ~88 220 $ (privacy off) |
| 1.2 | KPI **Revenus mensuels** | ~9 510 $ net |
| 1.3 | KPI **Dépenses mensuelles** | cohérent avec onglet Budget |
| 1.4 | KPI **Épargne mensuelle** | > 0 $ (positif) |
| 1.5 | Graph **Évolution détaillée** affiche ≥ 4 points sur range 1M | OK depuis fix 2026-05-21 |
| 1.6 | Range selector 1M/3M/YTD/1Y/CUSTOM tous cliquables, aucun crash | OK |
| 1.7 | Range 1Y affiche ≥ 50 points (≈ hebdomadaires) | OK |
| 1.8 | Toggle "Total" superpose ligne agrégée | OK |
| 1.9 | Toggle individuel CELI/REER/NonReg/Crypto masque/affiche la série | Persist localStorage |
| 1.10 | Card **Actifs individuels** liste les 5 fixtures | VFV.TO, VEQT.TO, XEQT.TO, AAPL, BTC-CAD |
| 1.11 | Card **Allocation par compte** total CELI/REER/Non-Enr/Crypto > 0 | Aucun 0 $ |
| 1.12 | Card **Revenus passifs** affiche dividendes des actifs | Si applicable, sinon "Aucun" sans crash |
| 1.13 | Bouton "Mode privé" masque les chiffres (blur) | Réversible |
| 1.14 | i18n FR par défaut, libellés sans clé non-traduite (ex: `dashboard.foo`) | Aucun |
| 1.15 | **Health Indicator** FIRE progress = pourcentage cohérent avec Future | OK depuis migration 2026-05-21 |
| 1.16 | **Graph Évolution** affiche des courbes RÉELLES (volatilité Yahoo, pas droite linéaire) | OK depuis CSV 2026-05-21 |
| 1.17 | Hover BTC-CAD : oscillation visible entre ~89k et ~107k$ sur 2 ans | OK (vraies valeurs Yahoo) |
| 1.18 | Hover AAPL : ~190 → ~305 USD × 1.37 = ~260 → ~418 CAD | Conversion fixe documentée |

## Section 2 — Investissements

| # | Test | Attendu |
|---|------|---------|
| 2.1 | Vue d'ensemble : **5 actifs** affichés | OK |
| 2.2 | **Performance globale** non vide (% ou $) | Non `NaN` ni `Infinity` |
| 2.3 | **Score de portefeuille** entre 0 et 100 | OK |
| 2.4 | Graph **Allocation géographique** sectorielle non vide | ≥ 1 secteur |
| 2.5 | Graph **Allocation par classe d'actif** non vide | OK |
| 2.6 | Cliquer un actif ouvre détail avec historique prix | OK |
| 2.7 | Form "Ajouter actif" s'ouvre/se ferme sans crash | OK |
| 2.8 | Tri par perf, par valeur, par symbole fonctionne | OK |
| 2.9 | Si clé Finnhub manquante : message clair, pas de crash | OK |

## Section 3 — Budget (inclut abonnements/récurrents)

| # | Test | Attendu |
|---|------|---------|
| 3.1 | **Revenu brut mensuel** | ~13 700 $ (164 400 / 12) |
| 3.2 | **Revenu net mensuel** | ~9 510 $ |
| 3.3 | **Total budget mensuel** sommes des catégories | > 0, cohérent |
| 3.4 | **Économies mensuelles calculées** | net − dépenses, peut être négatif |
| 3.5 | Aucun champ "tax annuel" affiché en mensuel par erreur | Bug historique : impôts en monthly seulement |
| 3.6 | Ajout/édition d'une catégorie persiste après reload | OK |
| 3.7 | Drag&drop catégories réordonne sans perte | OK |
| 3.8 | Sous-onglet **Abonnements** (ex-Planning) accessible depuis Budget | OK — G22-N3 : Planning fusionné |
| 3.9 | Sous-onglet Abonnements : **total fixe mensuel** ~3 484 $, **5 abonnements** listés | OK |
| 3.10 | Sous-onglet Abonnements : calendrier des paiements par jour du mois visible | OK |
| 3.11 | Sous-onglet Abonnements : ajout récurrent persiste | OK |

## Section 4 — Transactions

| # | Test | Attendu |
|---|------|---------|
| 4.1 | **68 transactions** listées | OK |
| 4.2 | Tri par date, montant, payee fonctionne | OK |
| 4.3 | Filtre par catégorie, compte, date | OK |
| 4.4 | Recherche texte (payee, note) | OK |
| 4.5 | Édition catégorie sur une transaction persiste | OK |
| 4.6 | Bulk action catégorisation Claude (si clé présente) | Pas de crash si clé absente |
| 4.7 | Import CSV / export | OK |

## Section 5 — Impôts (TaxCenter)

| # | Test | Attendu |
|---|------|---------|
| 5.1 | **Revenu brut annuel** | 164 400 $ (PAS 13 700 — bug fixé 2026-05-21) |
| 5.2 | **Impôt total** estimation | ~38 619 $ |
| 5.3 | **Taux moyen** | ~23,5 % |
| 5.4 | **Taux marginal** | ~36,1 % (PAS 0,4 % — bug fixé 2026-05-21) |
| 5.5 | Tranches fiscales visibles : fédérales + Québec | OK |
| 5.6 | Optimiseur REER affiche recommandation | OK |
| 5.7 | Crédits CIVTÉ/Solidarité visibles si applicable | OK |

## Section 6 — Futur (projection)

| # | Test | Attendu |
|---|------|---------|
| 6.1 | KPI **FIRE** | ~1 689 k$ |
| 6.2 | KPI **Patrimoine final** | > 0 $, format "1.6M$" ou "450k$" (PAS "0.0M$" — bug fixé 2026-05-21) |
| 6.3 | **7 cards scénarios** affichent un Patrimoine M$ ≠ 0,00 | OK depuis fix Math.round |
| 6.4 | Cliquer un scénario change le graph principal | OK |
| 6.5 | **Radio-group simulation** : option "Déterministe" affichée et sélectionnable par défaut | OK — G22 U3 (remplace l'ancien slider toggle) |
| 6.5.b | **Radio-group simulation** : option "Monte Carlo" sélectionnable, active le cône P10-P90 | OK |
| 6.5.c | Basculer Déterministe ↔ Monte Carlo sans crash, courbes cohérentes | OK |
| 6.6 | Hover graph → **tooltip taille fixe** (320 px largeur) | Ne s'étend plus selon contenu |
| 6.7 | Tooltip en retraite affiche ligne **"Décaissement portfolio"** | > 0 $ pendant phase de décumulation |
| 6.8 | Tooltip événements alignés avec **icônes** colonne fixe `w-5` | selon type d'événement |
| 6.9 | Événements **Voyage Italie / Japon** visibles aux dates prévues | OK |
| 6.10 | Événement **Rénovation** visible | OK |
| 6.11 | Événement **Naissance enfant** + cadeau voiture 18 ans visible | OK depuis refactor childCosts.ts 2026-05-21 |
| 6.11.b | Coût enfant Future **converge** avec onglet Enfant | OK source unique childCosts |
| 6.12 | Dette Visa 2 800 $ **s'éteint** dans les 12-18 mois projetés | OK depuis fix effectiveMinimum |
| 6.13 | Dette Auto 18 500 $ **s'éteint** en ~5 ans | OK |
| 6.14 | Graph étalé jusqu'à age 95 (lifeExpectancy) | OK |
| 6.15 | Ligne pension RRQ visible après 65 ans | OK |
| 6.16 | Pas de NaN dans aucune card scénario | OK |
| 6.17 | Sous-onglet **Explications** accessible (3e onglet du bandeau Graphique/Paramètres/Explications) | OK — G22-F1 |
| 6.18 | Explications : drill-down **année 2026** s'ouvre, affiche comptes (CELI, REER, Liquidités, etc.) | Données réelles moteur, pas de 0 global |
| 6.19 | Explications : drill-down **mois** à l'intérieur d'une année affiche flux (cotisation, croissance, retrait) | OK |
| 6.20 | Explications : **barre de recherche** filtre les libellés visibles | OK |
| 6.21 | Explications : section **Méthodologie** affiche les 6 questions/réponses | RAP, CELIAPP, Monte Carlo, impôts, ordre de retrait |
| 6.22 | Explications : aucune valeur affichée n'est `NaN` ni `0 $` global si la projection a tourné | Critique |

## Section 6b — Optimiseur de stratégie (Futur → Paramètres)

| # | Test | Attendu |
|---|------|---------|
| 6b.1 | Sous-onglet **Paramètres** contient le panneau "Optimiseur de stratégie" | Visible après scroll |
| 6b.2 | Section **Composer l'espace de recherche** affiche des leviers cochables | OK — LEVER_LIBRARY |
| 6b.3 | Cocher 0 levier → compteur de configs = 0, bouton "Lancer" désactivé | OK |
| 6b.4 | Cocher 1 levier (ex : taux d'épargne) → compteur affiche N configs et temps estimé | > 0 configs, format "~X s" ou "~X min" |
| 6b.5 | Sélectionner un **objectif** (Équilibre / Patrimoine max / Impôts min / FIRE rapide) sans crash | OK |
| 6b.6 | Cliquer **Lancer la recherche** → barre de progression visible, compteur "X / Y" s'incrémente | OK |
| 6b.7 | Cliquer **Annuler** pendant la recherche → arrêt propre, retour à l'état "idle" | OK — SEARCH_CANCELLED |
| 6b.8 | Recherche terminée → tableau de résultats trié par score du meilleur au moins bon | OK |
| 6b.9 | Changer **l'objectif après la recherche** → tri change sans recalcul moteur | OK — rankConfigResults en mémoire |
| 6b.10 | Panneau **Verdict** affiche la stratégie gagnante avec score global et sous-scores | OK — explainWinner |
| 6b.11 | Bouton **Appliquer la stratégie gagnante** applique les paramètres et le bouton passe "Appliqué" | OK — applyConfigToSettings |
| 6b.12 | Après application → sous-onglet Graphique reflète la nouvelle configuration | Recalcul déclenché |
| 6b.13 | Avertissement visible si configCount > 300 (seuil WARN_THRESHOLD) | OK |
| 6b.14 | Pas de crash si projectionParams incomplets (âge manquant, etc.) | Fallback ou erreur claire |

## Section 7 — Retraite

| # | Test | Attendu |
|---|------|---------|
| 7.1 | KPI **Capital à la retraite** > 0 $ | OK |
| 7.2 | KPI **Pic patrimoine** ≥ Capital retraite | OK |
| 7.3 | KPI **Héritage** affiché (positif ou "Épuisé ⚠️") | OK |
| 7.4 | **Goal seeker** : changer age cible recalcule le capital | OK |
| 7.5 | **Asset Location Card** affiche split CELI/REER/NonReg/Crypto | OK |
| 7.6 | **Capitaux actuels** = somme cohérente avec Investments | OK |
| 7.7 | Graph accumulation/épuisement visible | OK |
| 7.8 | Chiffres **alignés avec Future** | OK depuis fix savingsGoals/financialGoals + refactor lastProjection 2026-05-21 |
| 7.10 | Ouvrir Future, changer scénario → ouvrir Retraite : **les chiffres reflètent le scénario sélectionné** | OK depuis 2026-05-21 |
| 7.11 | Ouvrir Retraite **sans avoir ouvert Future** d'abord → fallback worker local calcule | OK |
| 7.12 | KPI Capital retraite = `chartData.find(p.age >= targetAge).NetWorth` | OK (test Vitest #7.1) |
| 7.9 | Slider lifeExpectancy 80-100 ans réactif | OK |

## Section 8 — Immobilier

| # | Test | Attendu |
|---|------|---------|
| 8.1 | **Mensualité hypo** affichée | ~2 401 $ |
| 8.2 | **Solde hypothèque** | 360 000 $ |
| 8.3 | **LTV** | 80 % |
| 8.4 | **Valeur estimée** | 450 000 $ |
| 8.5 | Ajouter une RealEstateGoal persiste | OK |
| 8.6 | Calcul équité dans le temps non négatif au démarrage | OK |

## Section 9 — Enfant

| # | Test | Attendu |
|---|------|---------|
| 9.1 | **Léa (test)** visible, **PAS de crash ErrorBoundary** | OK depuis fix Bar→ComposedChart 2026-05-21 |
| 9.2 | Card "Coût total" non vide | OK |
| 9.3 | Sélecteurs daycareType / schoolType / universityType / carGift réactifs | OK |
| 9.4 | Graph REEE Solde + Subventions visible | ComposedChart au lieu de AreaChart |
| 9.5 | Coût enfant **aligné avec Future** | À valider après refactor childrenReee |
| 9.6 | Coût parental leave > 0 si paramétré | OK |
| 9.7 | Suppression enfant via modal de confirmation | OK |
| 9.8 | Changer **schoolType=Privée** → coût total de Léa augmente | Privée 6k/an vs Publique 500/an |
| 9.9 | Changer **universityType=uni_etranger** → coût total grimpe | 35k×4 = 140k vs uni_local 20k |
| 9.10 | Changer **carGift=neuve** → +25k$ à 18 ans visible Future | Avant le fix : aucun impact |
| 9.11 | Changer **daycareType=parent_foyer** → garderie 0$ mais perte salaire ~1700$ | OK |
| 9.12 | Graph **costTimeline** : changer schoolType=privée → bars Garde/École plus hautes 5-17 ans | OK depuis migration 2026-05-21 (utilise getAnnualChildCost source unique) |
| 9.13 | Changer universityType=etranger → spike années 18-21 dans timeline | OK |
| 9.14 | Changer carGift=neuve → pic année 18 +25k$ | OK |
| 9.15 | totalCost timeline cohérent avec Future (même formules tranches d'âge) | OK convergence garantie |

## Section 10 — Projets de vie

| # | Test | Attendu |
|---|------|---------|
| 10.1 | **Italie + Japon** voyages visibles | OK |
| 10.2 | **Rénovation** visible | OK |
| 10.3 | Ajout LifeEvent KRACH/HERITAGE persiste | OK |
| 10.4 | Date / coût / icon par event | OK |
| 10.5 | Suppression via modal confirmation | OK |

## Section 11 — Dettes

| # | Test | Attendu |
|---|------|---------|
| 11.1 | **2 dettes** listées, plus de "NaN $/mois" | OK depuis fix fixtures 2026-05-21 |
| 11.2 | **Total paiement min mensuel** ~675 $ | OK |
| 11.3 | **Liberté financière** estimée en mois/années, pas "0.1 ans" | OK |
| 11.4 | Avalanche vs Snowball comparaison | OK |
| 11.5 | Ajout d'une dette persiste | OK |
| 11.6 | Suppression d'une dette via modal | OK |
| 11.7 | Carte de crédit à intérêts ≥ minimumPayment **s'éteint quand même** | Garde-fou effectiveMinimum |

## Section 12 — Planning / Abonnements (fusionné dans Budget)

> Depuis G22-N3, le contenu Planning est intégré comme sous-onglet dans Budget.
> Les tests ci-dessous sont désormais couverts par Section 3 (tests 3.8 à 3.11).
> Cette section reste en référence pour l'historique.

| # | Test | Attendu |
|---|------|---------|
| 12.1 | Onglet "Planning" autonome n'existe plus dans la navigation | Absent — contenu déplacé dans Budget |
| 12.2 | Budget → Abonnements : **Total fixe mensuel** ~3 484 $ | OK (voir 3.9) |
| 12.3 | Budget → Abonnements : **5 abonnements** listés | OK (voir 3.9) |
| 12.4 | Budget → Abonnements : calendrier des paiements visible | OK (voir 3.10) |

## Section 13 — Documents

| # | Test | Attendu |
|---|------|---------|
| 13.1 | Zone upload visible | OK |
| 13.2 | Drag & drop fichier ouvre prompt | OK |
| 13.3 | Aucune connexion réseau si pas de fichier déposé | OK |

## Section 14 — Data (legacy)

> Cet onglet n'est plus exposé dans la navigation principale depuis G22.
> Les tests ci-dessous conservent leur historique mais ne s'appliquent plus.

| # | Test | Attendu |
|---|------|---------|
| 14.1 | Onglet "Data" absent de la navigation principale | OK — retiré G22 |
| 14.2 | Aucune régression sur les données (le contenu a migré dans Settings) | OK |
| 14.3 | Pas d'appel réseau bloquant à l'import | OK |

## Section 15 — Paramètres (ex-Configuration, refonte G22-N4)

> Depuis G22-N4, Configuration est renommé "Paramètres" et restructuré en 6 sous-onglets :
> Profil | Comptes & soldes | Patrimoine | Clés API | Sauvegarde | Système & diagnostics.

| # | Test | Attendu |
|---|------|---------|
| 15.1 | Sous-onglets **Profil / Comptes & soldes / Patrimoine / Clés API / Sauvegarde / Système & diagnostics** tous accessibles | OK — G22-N4 |
| 15.2 | **Profil** : utilisateur 1 + utilisateur 2 éditables | OK |
| 15.3 | **Profil** : card Mode test — Activer/Désactiver fonctionnent | OK |
| 15.4 | **Profil** : bouton "Relancer le tutoriel" déclenche le GuidedTour | OK — G22-F4 |
| 15.5 | **Comptes & soldes** : soldes initiaux CELI/REER/NonReg/Crypto modifiables | OK |
| 15.6 | **Clés API** : champs Anthropic / Finnhub masqués (type password) | OK |
| 15.7 | **Clés API** : clés NON exposées en clair dans localStorage (coffre IndexedDB) | OK depuis Sprint 1 C5 |
| 15.8 | **Sauvegarde** : Export JSON ne contient pas les apiKeys | OK |
| 15.9 | **Sauvegarde** : import CSV bancaire fonctionne | OK |
| 15.10 | **Système & diagnostics** : version build affichée | OK |
| 15.11 | **Système & diagnostics** : bouton "Effacer toutes les données" demande confirmation 2-step | Sinon = bug |
| 15.12 | **Système & diagnostics** : stats stockage localStorage visibles | OK |
| 15.13 | Onglet "Système" autonome absent de la navigation principale | OK — G22-N5 : fusionné dans Paramètres |
| 15.14 | Toggle Privacy Mode global accessible depuis Paramètres | OK |

## Section 16 — Système & diagnostics (fusionné dans Paramètres)

> Depuis G22-N5, SystemView n'est plus un onglet top-level.
> Son contenu est dans Paramètres → Système & diagnostics (voir Section 15, tests 15.10-15.12).

| # | Test | Attendu |
|---|------|---------|
| 16.1 | Onglet "Système" absent de la navigation top-level | OK — G22-N5 |
| 16.2 | Paramètres → Système & diagnostics : version build affichée | OK (voir 15.10) |
| 16.3 | Paramètres → Système & diagnostics : confirmation 2-step pour effacement | OK (voir 15.11) |
| 16.4 | Paramètres → Système & diagnostics : stats stockage visibles | OK (voir 15.12) |

## Section 17 — Assistant (IA Claude)

| # | Test | Attendu |
|---|------|---------|
| 17.1 | Chat input réactif | OK |
| 17.2 | Sans clé Anthropic : message clair "configurez votre clé" | OK |
| 17.3 | Avec clé : réponse en streaming sans crash | OK |
| 17.4 | Boutons rapides (suggestions) cliquables | OK |
| 17.5 | Memory facts encadrés `<memory>...</memory>` (pas de prompt injection) | Sprint 1 C4 |
| 17.6 | Sanitization context errorLogger : aucun amount/payee en clair | Sprint 3 SH5 |

## Section 18a — Tutoriel guidé (GuidedTour, G22-F4)

| # | Test | Attendu |
|---|------|---------|
| 18a.1 | **Premier lancement** (localStorage `app_onboarding_done` absent) → tutoriel démarre automatiquement après l'onboarding | GuidedTour overlay visible |
| 18a.2 | Tutoriel : **15 étapes** numérotées, barre de progression visible | "Étape 1 / 15" → "Étape 15 / 15" |
| 18a.3 | Étape 1 : carte centrée "Bienvenue" (pas d'onglet ouvert) | OK — tab: null |
| 18a.4 | Étape 2 (Dashboard) → onglet Dashboard ouvert automatiquement | OK |
| 18a.5 | Chaque étape ouvre l'onglet correspondant (Transactions, Budget, Dettes, Investissements, Futur, Immobilier, Enfant, Projets de vie, Retraite, Impôts, Paramètres, Assistant, puis carte finale) | OK — TOUR_STEPS |
| 18a.6 | Spotlight (surbrillance) visible autour de l'item de navigation actif | box-shadow géant |
| 18a.7 | Sur mobile (sidebar masquée) : fallback carte centrée sans crash | OK — ancre null si DOMRect vide |
| 18a.8 | Bouton **Suivant** avance d'une étape | OK |
| 18a.9 | Bouton **Précédent** recule d'une étape (invisible à l'étape 1) | OK |
| 18a.10 | Touche **→** (flèche droite) avance d'une étape | OK |
| 18a.11 | Touche **←** (flèche gauche) recule d'une étape | OK |
| 18a.12 | Bouton **Passer ✕** ou touche **Échap** ferme le tutoriel proprement | markTourSeen() appelé |
| 18a.13 | Dernière étape : bouton "Suivant" devient "Terminer" | isLast = true |
| 18a.14 | Après clôture : relancer via **Paramètres → Profil → Relancer le tutoriel** | startGuidedTour() déclenche TOUR_EVENT |
| 18a.15 | Tutoriel déjà vu : ne redémarre **pas** automatiquement au rechargement | localStorage flag posé |
| 18a.16 | Tutoriel accessible au clavier (Tab/Enter sur boutons Suivant/Passer) | OK a11y |

## Section 18 — Cross-cutting (transverse)

| # | Test | Attendu |
|---|------|---------|
| 18.1 | **PWA installable** (icône dans la barre d'URL) | OK depuis fix vite mode production |
| 18.2 | **ServiceWorker enregistré** (DevTools → Application → SW) | OK |
| 18.3 | **CSP stricte** : aucune erreur `'unsafe-inline'` console | Sprint 3 SH2 |
| 18.4 | **Sourcemaps absentes** en prod (`.js.map` 404) | Sprint 3 SH6 |
| 18.5 | **Finnhub** : clé en header `X-Finnhub-Token`, pas en URL | Sprint 3 SH4 |
| 18.6 | Privacy blur (`.privacy-blur`) actif en mode privé partout | OK |
| 18.7 | Toggle dark/light theme (si supporté) sans crash | OK |
| 18.8 | Navigation au clavier (Tab/Enter/Esc) fonctionne sur modaux | a11y |
| 18.9 | Aucun `console.error` rouge dans toute la session | Critical |
| 18.10 | Aucun warning React Hooks order | OK |
| 18.11 | **Keyboard shortcuts** : Alt+1 → Dashboard, Alt+2 → Transactions, Alt+3 → Budget, Alt+4 → Dettes, Alt+5 → Investissements, Alt+6 → Futur, Alt+7 → Retraite, Alt+8 → Impôts, Alt+9 → Assistant | G22-N3 : Alt+4 = Dettes (plus Planning) |
| 18.12 | Alt+N dans un input texte **ne déclenche pas** la navigation | OK |
| 18.13 | **PWA install banner** custom (bas écran emerald) apparaît si non installée | OK |
| 18.14 | Bouton "Plus tard" dismiss le banner pour **30 jours** (localStorage) | OK |
| 18.15 | Banner ne réapparaît PAS si app déjà installée (`display-mode: standalone`) | OK |
| 18.16 | **SW cache CSV** : DevTools → Application → Cache `financeai-v2` contient portfolio-history.csv | OK |
| 18.17 | Mode offline (DevTools → Network → Offline) → mode test charge quand même | CSV cached |

## Section 20 — Mode strict (empty states transverses)

| # | Test | Attendu |
|---|------|---------|
| 20.1 | **Mode test désactivé + projection jamais calculée** → Retraite affiche `ProjectionRequired` | Card amber "Projection nécessaire" + CTA |
| 20.2 | Idem → Dashboard "Indicateur Futur" affiche inline `ProjectionRequired` au lieu d'inventer | OK |
| 20.3 | Idem → Investments Card "Portefeuille projeté" affiche `ProjectionRequired` (block) | OK |
| 20.4 | Idem → Budget "Impact à long terme" affiche `ProjectionRequired` | OK |
| 20.5 | Idem → RealEstate badge "Équité projetée" affiche `ProjectionRequired` inline | OK |
| 20.6 | Idem → Planning "Latte Factor" affiche `ProjectionRequired` (pas plus de × 10 × 1.4 fake) | OK |
| 20.7 | Idem → ChildPlanning graph REEE affiche `ProjectionRequired` (pas de formule locale) | OK |
| 20.8 | Idem → HealthIndicator ligne FIRE affiche "Projection requise — ouvrir Future" | OK |
| 20.9 | Bouton "Ouvrir Future →" dans tous les empty states fonctionne | OK navigation |
| 20.10 | Aucun composant en mode strict n'affiche `0,00 $` / `NaN` / formule fake | Critique |

## Section 21 — Centralisation (convergence inter-onglets)

| # | Test | Attendu |
|---|------|---------|
| 21.1 | Ouvrir Future avec scénario "Liberté 55" → Retraite badge "Scénario actif : Liberté 55" | OK |
| 21.2 | Changer scénario Future → HealthIndicator FIRE se met à jour sans reload | OK |
| 21.3 | Toggle Monte Carlo dans Future → Retraite reflète automatiquement | OK |
| 21.4 | Patrimoine Future = NetWorth dernier point chartData (±5% impôts latents) | OK convergence |
| 21.5 | Taux marginal Future tooltip = `marginalTaxRate` chartData | OK |
| 21.6 | Mortgage restant Future = `mortgageRemainingMonths` (estimation linéaire) | OK |
| 21.7 | REEE Future = ChildPlanning Solde REEE année correspondante | OK depuis pension split |
| 21.8 | Liquidity runway Dashboard = `chartData[0].liquidityRunway` mois courant | OK |
| 21.9 | `realNetWorth` ≠ `NetWorth` après 20+ ans d'inflation | OK déflation |
| 21.10 | Pension RRQ/PSV/Privée séparées dans chartData après 65 ans (sum ≈ IncomeRetirement ±5%) | OK |
| 21.11 | DividendIncome `chartData[0]` ≈ NonReg × yield × 30% / 12 | OK |
| 21.12 | reeeContribCum plafonné à 50 000$ par enfant (limite ARC) | OK |

## Section 22 — Auth / Sécurité (post Cloudflare Access)

| # | Test | Attendu |
|---|------|---------|
| 22.1 | Accès www.hubperso.com sans session → redirige Cloudflare Access (Google OAuth) | OK |
| 22.2 | Login Google non autorisé → "Access denied" Cloudflare | OK |
| 22.3 | Session valide → app charge en < 3 s | OK |
| 22.4 | Header `Cf-Access-Authenticated-User-Email` présent (DevTools Network) | OK |
| 22.5 | Logout via `/cdn-cgi/access/logout` redirige propre | OK |
| 22.6 | MFA Google requis à la connexion | OK |
| 22.7 | Validation clé Anthropic : format `sk-ant-...` warning visuel | OK depuis 2026-05-21 |
| 22.8 | Validation clé Finnhub : alphanum ≥ 15 chars warning si non-conforme | OK |
| 22.9 | **V1 fix** : pas de `app_api_keys` en clair dans localStorage (purge auto au boot) | OK depuis 2026-05-21 |

## Section 19 — Régressions critiques (à vérifier après chaque fix majeur)

| # | Test | Attendu |
|---|------|---------|
| 19.1 | **Désactiver mode test** restaure les vraies données | snapshot intact |
| 19.2 | Reload navigateur conserve les vraies données | persist Zustand |
| 19.3 | Reload en mode test conserve mode test actif | flag persisté |
| 19.4 | Export → effacer → Import : aucune perte | round-trip |
| 19.5 | Backup chiffré round-trip avec mot de passe | AES-256-GCM |
| 19.6 | Multi-tab : changement dans tab A reflété tab B après reload | OK |

---

## Comment ajouter un test

Quand on livre un fix ou une feature :

1. **Identifier l'onglet** concerné → section pertinente (1-17) ou 18/19 si transverse/régression
2. **Ajouter une ligne** au tableau avec :
   - Numéro suivant (ex: `6.17`)
   - Description **courte et testable** (verbe d'action + critère mesurable)
   - Attendu **précis** (valeur exacte, fourchette, comportement booléen)
3. **Si bug historique** : référencer la date de fix entre parenthèses (`OK depuis fix YYYY-MM-DD`)
4. **Commit** avec le fix : `docs(tests): ajoute test 6.17 pour <fix>`

## Cible de couverture

| Onglet | # tests actuels | Cible |
|---|---|---|
| Dashboard | 18 | 18-22 |
| Investissements | 9 | 10-15 |
| Budget (+ abonnements) | 11 | 12-15 |
| Transactions | 7 | 8-10 |
| Impôts | 7 | 8-10 |
| Futur — graphique + paramètres | 22 | 22-28 |
| Futur — Optimiseur (G21) | 14 | 14-16 |
| Futur — Explications (G22-F1) | 6 | 6-8 |
| Retraite | 9 | 10-12 |
| Immobilier | 6 | 8 |
| Enfant | 15 | 15-18 |
| Projets vie | 5 | 6-8 |
| Dettes | 7 | 8 |
| Planning (fusionné Budget) | 4 | — (voir Budget) |
| Documents | 3 | 4-5 |
| Data (retiré G22) | 3 | — |
| Paramètres (ex-Config + Système) | 14 | 14-18 |
| Assistant | 6 | 7-10 |
| Tutoriel guidé (G22-F4) | 16 | 16-18 |
| Cross-cutting | 17 | 18-22 |
| Mode strict | 10 | 10-12 |
| Centralisation | 12 | 12-15 |
| Auth / Sécurité | 9 | 9-12 |
| Régressions | 6 | 8-10 |
| **Total** | **~195** | **200-250** |

## Historique

| Date | Tests ajoutés | Fix concerné |
|---|---|---|
| 2026-05-21 | Création initiale (131 tests) | Sprint mode test + 5 fixes session |
| 2026-05-21 | +6 tests (6.11.b + 9.8/9/10/11 + Future events) | Refactor childCosts.ts source unique |
| 2026-05-21 | +3 tests (7.10/11/12) | Refactor centralisation calculs (Retraite ← lastProjection) |
| 2026-05-21 | +10 tests Vitest automatisés (`projection.convergence.test.ts`) | Convergence Future ↔ UI |
| 2026-05-21 | +4 tests (1.15-1.18) | CSV Yahoo Finance réel pour mode test |
| 2026-05-21 | +4 tests (9.12-9.15) | Migration ChildPlanning costTimeline source unique |
| 2026-05-21 | +6 tests Vitest convergence (Sprint 1A/1E) | HealthIndicator + ChildPlanning migrés |
| 2026-05-21 | +32 tests manuels (Sections 18.11-18.17, 20, 21, 22) | Mode strict + Centralisation + Auth + raccourcis |
| 2026-05-21 | Cible 160-200 : 163 tests | Voir détail dans sections |
| 2026-05-27 | +14 tests Section 6b (Optimiseur G21) | StrategyOptimizerPanel, LEVER_LIBRARY, rankConfigResults, bouton Annuler, Appliquer |
| 2026-05-27 | +6 tests Section 6 (Explications G22-F1, radio-group Monte Carlo) | ProjectionExplains, radio-group simulation (déterministe/MC) |
| 2026-05-27 | +4 tests Section 3 (Budget sous-onglet Abonnements G22-N3) | BudgetWorkspace remplace Planning onglet séparé |
| 2026-05-27 | +14 tests Section 15 (Paramètres refonte G22-N4, sous-onglets) | Settings 6 sous-onglets, Système fusionné |
| 2026-05-27 | +16 tests Section 18a (GuidedTour G22-F4) | GuidedTour : 15 étapes, spotlight, clavier, relance |
| 2026-05-27 | Sections 12/14/16 archivées (onglets supprimés G22) | Planning, Data, Système supprimés navigation top-level |
| 2026-05-27 | Total recompté : ~195 tests manuels | Voir tableau couverture |
