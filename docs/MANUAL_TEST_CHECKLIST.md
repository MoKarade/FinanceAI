# Checklist de tests manuels — FinanceAI

> **Source unique** des tests manuels à exécuter à chaque livraison majeure.
> **Mise à jour** : à chaque nouveau fix ou feature, ajouter une entrée dans la section pertinente.
> Cible : ~100 tests couvrant chaque onglet, exécutables en ~30 min.

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

## Section 3 — Budget

| # | Test | Attendu |
|---|------|---------|
| 3.1 | **Revenu brut mensuel** | ~13 700 $ (164 400 / 12) |
| 3.2 | **Revenu net mensuel** | ~9 510 $ |
| 3.3 | **Total budget mensuel** sommes des catégories | > 0, cohérent |
| 3.4 | **Économies mensuelles calculées** | net − dépenses, peut être négatif |
| 3.5 | Aucun champ "tax annuel" affiché en mensuel par erreur | Bug historique : impôts en monthly seulement |
| 3.6 | Ajout/édition d'une catégorie persiste après reload | OK |
| 3.7 | Drag&drop catégories réordonne sans perte | OK |

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

## Section 6 — Future (projection)

| # | Test | Attendu |
|---|------|---------|
| 6.1 | KPI **FIRE** | ~1 689 k$ |
| 6.2 | KPI **Patrimoine final** | > 0 $, format "1.6M$" ou "450k$" (PAS "0.0M$" — bug fixé 2026-05-21) |
| 6.3 | **7 cards scénarios** affichent un Patrimoine M$ ≠ 0,00 | OK depuis fix Math.round |
| 6.4 | Cliquer un scénario change le graph principal | OK |
| 6.5 | Slider Monte Carlo activé/désactivé sans crash | OK |
| 6.6 | Hover graph → **tooltip taille fixe** (320 px largeur) | Ne s'étend plus selon contenu |
| 6.7 | Tooltip en retraite affiche ligne **"Décaissement portfolio"** | > 0 $ pendant phase de décumulation |
| 6.8 | Tooltip événements alignés avec **icônes** colonne fixe `w-5` | ✈️🏠🚗🔨🩺🎁🏛️💰 selon type |
| 6.9 | Événements **Voyage Italie / Japon** visibles aux dates prévues | OK |
| 6.10 | Événement **Rénovation** visible | OK |
| 6.11 | Événement **Naissance enfant** ou coût enfant visible | À valider après refactor childrenReee |
| 6.12 | Dette Visa 2 800 $ **s'éteint** dans les 12-18 mois projetés | OK depuis fix effectiveMinimum |
| 6.13 | Dette Auto 18 500 $ **s'éteint** en ~5 ans | OK |
| 6.14 | Graph étalé jusqu'à age 95 (lifeExpectancy) | OK |
| 6.15 | Ligne pension RRQ visible après 65 ans | OK |
| 6.16 | Pas de NaN dans aucune card scénario | OK |

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
| 7.8 | Chiffres **alignés avec Future** | Convergence améliorée depuis fix savingsGoals/financialGoals |
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

## Section 12 — Planning (récurrents)

| # | Test | Attendu |
|---|------|---------|
| 12.1 | **Total fixe mensuel** ~3 484 $ | OK |
| 12.2 | **5 abonnements** listés | OK |
| 12.3 | Calendrier des paiements par jour du mois visible | OK |
| 12.4 | Ajout récurrent persiste | OK |

## Section 13 — Documents

| # | Test | Attendu |
|---|------|---------|
| 13.1 | Zone upload visible | OK |
| 13.2 | Drag & drop fichier ouvre prompt | OK |
| 13.3 | Aucune connexion réseau si pas de fichier déposé | OK |

## Section 14 — Data (legacy)

| # | Test | Attendu |
|---|------|---------|
| 14.1 | Onglet ouvrable sans crash | OK |
| 14.2 | Si Google Sheet non configuré : empty state honnête | Pas de "données fictives" |
| 14.3 | Pas d'appel réseau bloquant | OK |

## Section 15 — Configuration

| # | Test | Attendu |
|---|------|---------|
| 15.1 | Profil utilisateur 1 + utilisateur 2 éditables | OK |
| 15.2 | Champs **apiKey Anthropic / Finnhub** masqués (password) | OK |
| 15.3 | Clés **NON commit en backup par défaut** | OK depuis Sprint 1 C5 |
| 15.4 | Export JSON contient pas les apiKeys | OK |
| 15.5 | Card **Mode test** : Activer/Désactiver fonctionnent | OK |
| 15.6 | Slider ProjectionConfig réactif | OK |
| 15.7 | Toggle Privacy Mode global | OK |

## Section 16 — Système

| # | Test | Attendu |
|---|------|---------|
| 16.1 | Onglet ouvrable | OK |
| 16.2 | Version build affichée | OK |
| 16.3 | Bouton "Effacer toutes les données" demande **confirmation 2-step** | Sinon = bug |
| 16.4 | Stats stockage localStorage visibles | OK |

## Section 17 — Assistant (IA Claude)

| # | Test | Attendu |
|---|------|---------|
| 17.1 | Chat input réactif | OK |
| 17.2 | Sans clé Anthropic : message clair "configurez votre clé" | OK |
| 17.3 | Avec clé : réponse en streaming sans crash | OK |
| 17.4 | Boutons rapides (suggestions) cliquables | OK |
| 17.5 | Memory facts encadrés `<memory>...</memory>` (pas de prompt injection) | Sprint 1 C4 |
| 17.6 | Sanitization context errorLogger : aucun amount/payee en clair | Sprint 3 SH5 |

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
| Dashboard | 14 | 15-20 |
| Investissements | 9 | 10-15 |
| Budget | 7 | 8-10 |
| Transactions | 7 | 8-10 |
| Impôts | 7 | 8-10 |
| Future | 16 | 18-22 |
| Retraite | 9 | 10-12 |
| Immobilier | 6 | 8 |
| Enfant | 7 | 10 |
| Projets vie | 5 | 6-8 |
| Dettes | 7 | 8 |
| Planning | 4 | 5-6 |
| Documents | 3 | 4-5 |
| Data | 3 | 3-5 |
| Configuration | 7 | 8-10 |
| Système | 4 | 5-6 |
| Assistant | 6 | 7-10 |
| Cross-cutting | 10 | 12-15 |
| Régressions | 6 | 8-10 |
| **Total** | **131** | **160-200** |

## Historique

| Date | Tests ajoutés | Fix concerné |
|---|---|---|
| 2026-05-21 | Création initiale (131 tests) | Sprint mode test + 5 fixes session |
