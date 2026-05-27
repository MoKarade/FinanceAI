# FinanceAI — Guide utilisateur

> Bienvenue dans FinanceAI, ton planificateur financier personnel.
> Ce guide te montre comment configurer l'app et profiter de toutes les
> fonctionnalités en 5 minutes.

## Premier démarrage

### 1. Tutoriel guidé (automatique)

Au tout premier lancement, après avoir rempli le formulaire d'onboarding, un
tutoriel guidé démarre automatiquement. Il visite chaque onglet en 15 étapes,
affiche une bulle d'explication et met en surbrillance l'onglet actif.

- Navigation : boutons "Precedent" / "Suivant", ou fleches clavier (←/→)
- Fermeture a tout moment : bouton "Passer" ou touche Echap
- Pour relancer le tutoriel plus tard : Parametres → onglet Profil → "Relancer le tutoriel"

### 2. Configurer ton profil

Va dans **Parametres** (Alt+0 ou via le menu) et remplis l'onglet **Profil** :

- **Utilisateurs** : nom, age, salaire brut/net mensuel, contributions
  CELI/REER cumulees
- **Profil fiscal** : annee d'arrivee au Canada (pour calculs PSV), province
- **Objectif retraite** : age cible, revenu mensuel souhaite, esperance de vie

### 3. Tester sans risque : mode test

Avant d'entrer tes vraies donnees, **active le mode test** :

1. **Parametres → Profil → Mode test → Activer**
2. Un bandeau orange apparait en haut : tu es maintenant sur les fixtures
   fictives (couple Alex + Sam, 5 actifs reels Yahoo Finance, retraite a 60 ans)
3. Explore tous les onglets pour comprendre l'app
4. **Desactiver le mode test** restaure tes vraies donnees (snapshot automatique)

### 4. Importer tes donnees

| Source | Onglet | Comment |
|---|---|---|
| Transactions bancaires | Parametres → Sauvegarde → Importer un releve bancaire | Import CSV universel (100 % local) |
| Actifs investis | Investissements → Ajouter | Manuel ou import CSV |
| Salaire | Parametres → Profil → salaires | Manuel |
| Soldes initiaux | Parametres → Comptes & soldes | CELI, REER, NON-ENR, Crypto |

> **Sources de prix disponibles** :
> - **Crypto** : CoinGecko (gratuit, sans cle requise — BTC, ETH, SOL, etc.)
> - **Actions & ETF** : Finnhub (cle gratuite optionnelle pour les cours en direct)

## Comprendre chaque onglet

L'application comporte 9 onglets principaux navigables par raccourci clavier.

### Accueil / Dashboard (Alt+1)

Vue d'ensemble en temps reel :
- **Patrimoine total** = cash + portefeuille + immo − dettes
- **Variation globale** : % et $ sur la periode selectionnee (1M, 3M, 1Y, custom)
- **Evolution detaillee** : graph multi-comptes
- **Indicateur Futur** : projection a N annees (lit l'onglet Futur)
- **Health Score** : 4 ratios ponderes (epargne, coussin, dette, FIRE)

### Transactions (Alt+2)

Liste, filtre, categorisation Claude IA. Detection automatique des
abonnements recurrents.

### Budget (Alt+3)

Cibles mensuelles par categorie + split couple. Visualisation 50/30/20.

L'onglet Budget regroupe deux volets accessibles par sous-onglets internes :
- **Budget** : enveloppes de depenses et suivi mensuel par categorie
- **Abonnements** (anciennement "Planning") : recurrents fixes (factures,
  abonnements). Calendrier des paiements + "Latte Factor" projete via Futur

> L'onglet "Planning" n'existe plus comme onglet separe. Son contenu (recurrents,
> calendrier) est maintenant integre directement dans l'onglet Budget.

**Impact long terme** : lien direct vers Futur pour voir l'effet de
+100 $/mois d'epargne sur le patrimoine final.

### Dettes (Alt+4)

Listing + simulation extinction (Avalanche vs Snowball). Slider
"paiement supplementaire" pour voir l'impact sur la liberte financiere.

### Investissements (Alt+5)

Score de sante, performance vs marche, allocation geo/sectorielle,
Reequilibrage suggere, Calendrier de dividendes. **Portefeuille projete
a l'horizon retraite** (lit Futur).

### Futur (Alt+6) — onglet central

**A ouvrir EN PREMIER** car tous les autres onglets en dependent pour
les calculs long-terme.

L'onglet Futur est structure en trois sous-onglets :

#### Sous-onglet Graphique

- 7 scenarios pre-calcules (Base, FIRE, Liberte 55, Hyperinflation, etc.)
- **Monte Carlo** : radio-group "Deterministe / Monte Carlo" dans l'onglet
  Parametres. En mode Monte Carlo, la courbe affiche un cone P10-P90.
- **Courbe de vie** sur 60-80 ans avec tooltips detailles (revenu,
  depenses, retraits, evenements, impots)
- Zoom interactif sur n'importe quelle periode

#### Sous-onglet Parametres

Controles de simulation :
- Taux de rendement, inflation, horizon, epargne mensuelle
- Radio-group simulation : **Deterministe** (courbe unique, rapide) ou
  **Monte Carlo** (cone statistique, plus lent)
- **Optimiseur de strategie** (voir section ci-dessous)
- Panneaux avances : robustesse, localisation d'actifs

#### Sous-onglet Explications

Page "data-driven" qui explique mois par mois ce qui arrive a chaque
compte et pourquoi :
- Drill-down annee par annee (puis mois par mois) sur CELI, REER, Liquidites,
  NonReg, Crypto, REEE, Immobilier, Dettes
- Pour chaque compte : solde, cotisations, croissance marche, retraits, transferts
- Barre de recherche transverse (filtrer par mot-cle)
- Section methodologie : explications des concepts (RAP, CELIAPP, ordre
  de retrait, Monte Carlo, impots progressifs)

> Toutes les valeurs affichees dans Explications viennent du moteur de projection
> reel — aucun chiffre invente.

#### Optimiseur de strategie (dans Futur → Parametres)

L'optimiseur teste systematiquement des combinaisons de leviers financiers
et recommande la configuration gagnante selon ton objectif.

**Comment l'utiliser :**

1. Dans l'onglet Futur → sous-onglet Parametres, fais defiler jusqu'au panneau "Optimiseur"
2. **Compose ton espace de recherche** : coche les valeurs de leviers a explorer
   (taux d'epargne, allocation, age de retraite, ordre de retrait, etc.)
3. Le compteur affiche le nombre de configurations et le temps estime
4. Selectionne ton **objectif** :
   - *Equilibre* : meilleur compromis patrimoine / impots / securite
   - *Patrimoine max* : maximiser la valeur nette finale
   - *Impots min* : minimiser la charge fiscale totale
   - *FIRE rapide* : atteindre l'independance financiere le plus tot possible
5. Clique **Lancer la recherche** — un pool multi-worker calcule un Monte Carlo
   sur chaque configuration en parallele
6. Une barre de progression s'affiche ; clique **Annuler** pour stopper a tout moment
7. Les resultats s'affichent tries par score ; le panneau "Verdict" resume en
   une phrase la meilleure strategie
8. Clique **Appliquer la strategie gagnante** pour basculer les parametres Futur
   sur la configuration optimale

> Si le nombre de configurations depasse ~300, un avertissement s'affiche.
> Le budget de simulations est adaptatif : plus il y a de configs, moins
> d'iterations Monte Carlo par config (borne entre 60 et 400 iterations).

> **Mode strict** : si Futur n'a jamais tourne, les autres onglets
> affichent "Projection requise — ouvrir Futur". C'est volontaire :
> on ne veut pas inventer de chiffres.

### Retraite (Alt+7)

Capital a la retraite, pic patrimoine, heritage. Decumulation visuelle.
Goal Seeker pour ajuster age cible / epargne. **Synchronise avec Futur**
(reflete le scenario actif).

### Impots & Docs (Alt+8)

Calcul federal + Quebec sur tes revenus courants. Paliers progressifs,
taux marginal/moyen, optimiseur REER, comparaison couple vs solo.

### Assistant IA (Alt+9)

Chat avec Claude pour analyser ton patrimoine, optimiser, comparer
scenarios. Contexte automatique (anonymise en securite).

## Onglets additionnels (sans raccourci numerote)

Ces onglets sont accessibles via le menu lateral ou la Command Palette (Cmd+K) :

| Onglet | Contenu |
|---|---|
| Immobilier | Calculateur achat + amortissement. Comparaison Habiter vs Louer vs Investir. Multi-proprietes. |
| Enfant | Cout lifetime par enfant (CPE, ecole, universite, voiture). Projection REEE synchronisee avec Futur. |
| Projets de vie | Voyages, renos, achats, heritages, krach. Chaque evenement impacte la trajectoire projetee. |

## Parametres — sous-onglets

L'onglet Parametres (anciennement "Configuration" + "Systeme") regroupe
six sous-onglets :

| Sous-onglet | Contenu |
|---|---|
| **Profil** | Utilisateurs, objectifs retraite, mode test (activer/desactiver), tutoriel |
| **Comptes & soldes** | Soldes initiaux CELI/REER/NonReg/Crypto, configuration des comptes |
| **Patrimoine** | Donnees immobilieres et patrimoniales avancees |
| **Cles API** | Anthropic (Claude IA), Finnhub (cours en direct), Era Context (sync bancaire) |
| **Sauvegarde** | Export JSON chiffre, import, import CSV bancaire, auto-backup |
| **Systeme & diagnostics** | Stats stockage, logs erreurs, audit log, version build, effacement des donnees |

> L'onglet "Systeme" n'existe plus comme onglet separe. Son contenu
> (stats stockage, logs, version) est maintenant dans Parametres →
> Systeme & diagnostics.

## Raccourcis clavier

| Touche | Action |
|---|---|
| `Alt+1` | Dashboard |
| `Alt+2` | Transactions |
| `Alt+3` | Budget (inclut abonnements) |
| `Alt+4` | Dettes |
| `Alt+5` | Investissements |
| `Alt+6` | Futur |
| `Alt+7` | Retraite |
| `Alt+8` | Impots & Docs |
| `Alt+9` | Assistant IA |
| `Cmd+K` / `Ctrl+K` | Command palette (navigation rapide + actions) |
| `Esc` | Fermer modal / Arreter tutoriel |
| `←` / `→` | Navigation dans le tutoriel guide |
| `Tab` / `Shift+Tab` | Navigation focus |

> Alt+1 a Alt+9 ne se declenchent pas si le curseur est dans un champ texte.

## Confidentialite

- **100 % local** : tes donnees sont dans le `localStorage` de ton
  navigateur. Aucun serveur ne les voit (sauf si tu actives la sync Era).
- **Cles API** : stockees dans un coffre chiffre (AES-256-GCM + IndexedDB),
  rechargees automatiquement au demarrage. Jamais en clair dans localStorage.
- **Privacy Mode** : cache tous les montants avec `***` ou flou (pour
  screenshots, demos, ou utilisation en public).
- **Pas de tracking publicitaire** : seulement Google Analytics anonymise
  (page_view, pas de PII).

## Backups

3 mecanismes :

1. **Auto IndexedDB** : 1 backup par jour, rolling 7 derniers (transparent)
2. **Manuel JSON chiffre** : Parametres → Sauvegarde → Export → mot de passe →
   telecharge un `.json` chiffre AES-256-GCM. A garder en securite.
3. **Import** : Parametres → Sauvegarde → Import → JSON chiffre + mot de passe →
   ecrase les donnees actuelles (insurance backup cree d'abord).

## Installer comme app (PWA)

- **Desktop Chrome/Edge** : un bandeau "Installer FinanceAI" apparait
  en bas. Clique "Installer" → l'app a son propre icone dans la barre
  des taches.
- **iOS Safari** : Partager → "Sur l'ecran d'accueil"
- **Android Chrome** : menu → "Installer l'application"

Une fois installee, l'app fonctionne **offline** (cache assets +
historique portfolio).

## FAQ

### Je vois "Projection requise" partout, c'est normal ?

Oui. Tu n'as pas encore ouvert l'onglet **Futur**. Va-y, ajuste les
sliders (taux de rendement, annees, etc.) et la projection se calcule.
Tous les autres onglets utiliseront ces resultats automatiquement.

### L'optimiseur met longtemps a tourner, c'est normal ?

Oui. L'optimiseur lance un Monte Carlo sur chaque combinaison de leviers.
Le temps depend du nombre de configurations cochees et du nombre de coeurs
du processeur. Tu peux cliquer **Annuler** a tout moment pour stopper le calcul.

### Mes chiffres divergent entre Retraite et Futur, pourquoi ?

Ils ne devraient plus depuis le cycle 18 (centralisation). Si tu vois
une divergence, c'est un bug → reporter sur GitHub.

### Le mode test a efface mes donnees ?

Non — il les snapshote avant. **Desactiver** le mode test les restaure
intactes. Si la restauration echoue, ton dernier backup auto est
recuperable via Parametres → Systeme & diagnostics → Backups.

### Comment changer le scenario actif ?

Futur → bandeau scenarios en haut du graph. Cliquer une carte (Base,
Liberte 55, Hyperinflation, etc.). Le badge "Scenario actif" dans
Retraite reflete ton choix.

### Les cours des actions/crypto affichent toujours la meme valeur, c'est normal ?

- **Crypto (BTC, ETH, SOL, etc.)** : prix auto-mis a jour via CoinGecko (gratuit, aucune cle).
- **Actions/ETF** : prix via Finnhub (cle gratuite optionnelle), ou snapshot initial si Finnhub non configuree.
- **Mode test** : les prix sont les vraies valeurs Yahoo Finance historiques (snapshot 2024-05 → 2026-05).

### J'ai oublie mon mot de passe de backup chiffre

Aucune recuperation possible (chiffrement AES-256, PBKDF2 600k
iterations). C'est volontaire pour la securite. Toujours noter le mot
de passe dans un gestionnaire (Bitwarden, 1Password).

### L'app est-elle gratuite ?

Oui, FinanceAI est 100 % gratuit et open-source. Pas de freemium, pas
de publicite, pas de pousse-a-l'upgrade. Les API externes (Anthropic,
Finnhub, Era) sont optionnelles et utilisent tes propres cles.

## Support

- Issues GitHub : https://github.com/MoKarade/FinanceAI/issues
- Architecture detaillee : [docs/ARCHITECTURE.md](ARCHITECTURE.md)
- Roadmap : [docs/BACKLOG.md](BACKLOG.md)
- Tests : [docs/MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)
