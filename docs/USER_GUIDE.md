# FinanceAI — Guide utilisateur

> Bienvenue dans FinanceAI, ton planificateur financier personnel.
> Ce guide te montre comment configurer l'app et profiter de toutes les
> fonctionnalités en 5 minutes.

## 🚀 Premier démarrage

### 1. Configurer ton profil

Va dans **Configuration** (Alt+0 ou via le menu) et remplis :

- **Utilisateurs** : nom, âge, salaire brut/net mensuel, contributions
  CELI/REER cumulées
- **Profil fiscal** : année d'arrivée au Canada (pour calculs PSV), province
- **Objectif retraite** : âge cible, revenu mensuel souhaité, espérance de vie

### 2. Tester sans risque : mode test

Avant d'entrer tes vraies données, **active le mode test** :

1. **Configuration → 🧪 Mode test → Activer**
2. Un bandeau orange apparaît en haut : tu es maintenant sur les fixtures
   fictives (couple Alex + Sam, 5 actifs réels Yahoo Finance, retraite à 60 ans)
3. Explore tous les onglets pour comprendre l'app
4. **Désactiver le mode test** restaure tes vraies données (snapshot automatique)

### 3. Importer tes données

| Source | Onglet | Comment |
|---|---|---|
| Transactions bancaires | Configuration → Importer un relevé bancaire | Import CSV universel (100 % local) |
| Actifs investis | Investments → ➕ Ajouter | Manuel ou import CSV |
| Salaire | Configuration → Profil → salaires | Manuel |
| Soldes initiaux | Configuration → Soldes initiaux | CELI, REER, NON-ENR, Crypto |

> **Nouvelles sources de prix** (2026-05-25) :
> - **Crypto** : CoinGecko (gratuit, sans clé requise — BTC, ETH, SOL, etc.)
> - **Actions & ETF** : Finnhub (clé gratuite optionnelle pour les cours en direct)

## 📊 Comprendre chaque onglet

### Accueil / Dashboard (Alt+1)

Vue d'ensemble en temps réel :
- **Patrimoine total** = cash + portefeuille + immo − dettes
- **Variation globale** : % et $ sur la période sélectionnée (1M, 3M, 1Y, custom)
- **Évolution détaillée** : graph multi-comptes
- **Indicateur Futur** : projection à N années (lit l'onglet Future)
- **Health Score** : 4 ratios pondérés (épargne, coussin, dette, FIRE)

### Transactions (Alt+2)

Liste, filtre, catégorisation Claude IA. Détection automatique des
abonnements récurrents.

### Budget (Alt+3)

Cibles mensuelles par catégorie + split couple. Visualisation 50/30/20.
**Impact long terme** : lien direct vers Future pour voir l'effet de
+100 $/mois d'épargne sur le patrimoine final.

### Planning (Alt+4)

Récurrents fixes (factures, abonnements). Calendrier des paiements +
"Latte Factor" projeté via Future.

### Investments (Alt+5)

Score de santé, performance vs marché, allocation géo/sectorielle,
Rééquilibrage suggéré, Calendrier de dividendes. **Portefeuille projeté
à l'horizon retraite** (lit Future).

### Future (Alt+6) — ⭐ ONGLET CENTRAL

**À ouvrir EN PREMIER** car tous les autres onglets en dépendent pour
les calculs long-terme.

- 7 scénarios pré-calculés (Base, FIRE, Liberté 55, Hyperinflation, etc.)
- **Monte Carlo** (100-1000 itérations) pour évaluer la robustesse
- **Goal Seeker** : "À combien dois-je épargner par mois pour FIRE à 55 ans ?"
- **Courbe de vie** sur 60-80 ans avec tooltips détaillés (revenu,
  dépenses, retraits, événements, impôts)

> **Mode strict** : si Future n'a jamais tourné, les autres onglets
> affichent "Projection requise — ouvrir Future". C'est volontaire :
> on ne veut pas inventer de chiffres.

### Retraite (Alt+7)

Capital à la retraite, pic patrimoine, héritage. Décumulation visuelle.
Goal Seeker pour ajuster age cible / épargne. **Synchronisé avec Future**
(reflète le scénario actif).

### Impôts (Alt+8)

Calcul fédéral + Québec sur tes revenus courants. Paliers progressifs,
taux marginal/moyen, optimiseur REER, comparaison couple vs solo.

### Immobilier

Calculateur d'achat + amortissement. Comparaison Habiter vs Louer vs
Investir en bourse sur 25 ans. Multi-propriétés supportées.

### Enfant

Coût lifetime par enfant selon choix UI (CPE/garde privée, école pub/
privée, université locale/étranger, voiture cadeau à 18 ans).
**Projection REEE** synchronisée avec Future (SCEE + IQEE cumulés).

### Projets de vie

Voyages, rénos, achats voitures, héritages, krach. Chaque événement a
une date + impact patrimoine projeté.

### Dettes

Listing + simulation extinction (Avalanche vs Snowball). Slider
"paiement supplémentaire" pour voir l'impact sur la liberté financière.

### Documents

Upload PDF/images (bulletins de paie, factures, etc.). OCR Claude IA
pour extraction automatique.

### Configuration

- Profils utilisateurs + objectifs
- **Mode test** (toggle)
- **Clés API optionnelles** :
  - Anthropic (Claude IA, analyse budget/assistant)
  - Finnhub (cotations actions/ETF en direct)
- **Import CSV** : relevés bancaires (toutes les banques, format universel)
- Privacy Mode (cacher les montants)
- Export/Import JSON chiffré (mot de passe)

### Système

Stats stockage, logs erreurs, audit log, version build.

### Assistant (Alt+9)

Chat avec Claude pour analyser ton patrimoine, optimiser, comparer
scénarios. Contexte automatique (anonymisé en sécurité).

## ⌨️ Raccourcis clavier

| Touche | Action |
|---|---|
| `Alt+1..9` | Switcher d'onglet |
| `Cmd+K` / `Ctrl+K` | Command palette (navigation rapide) |
| `Esc` | Fermer modal |
| `Tab` / `Shift+Tab` | Navigation focus |

## 🔒 Confidentialité

- **100 % local** : tes données sont dans le `localStorage` de ton
  navigateur. Aucun serveur ne les voit (sauf si tu actives la sync Era).
- **Clés API** : stockées localement, jamais commit, exclues des backups
  par défaut.
- **Privacy Mode** : cache tous les montants avec `***` ou flou (pour
  screenshots, démos, ou utilisation en public).
- **Pas de tracking publicitaire** : seulement Google Analytics anonymisé
  (page_view, pas de PII).

## 💾 Backups

3 mécanismes :

1. **Auto IndexedDB** : 1 backup par jour, rolling 7 derniers (transparent)
2. **Manuel JSON chiffré** : Configuration → Export → mot de passe →
  télécharge un `.json` chiffré AES-256-GCM. À garder en sécurité.
3. **Import** : Configuration → Import → JSON chiffré + mot de passe →
  écrase les données actuelles (insurance backup créé d'abord).

## 📱 Installer comme app (PWA)

- **Desktop Chrome/Edge** : un bandeau "Installer FinanceAI" apparaît
  en bas. Clique "Installer" → l'app a son propre icône dans la barre
  des tâches.
- **iOS Safari** : Partager → "Sur l'écran d'accueil"
- **Android Chrome** : ⋮ → "Installer l'application"

Une fois installée, l'app fonctionne **offline** (cache assets +
historique portfolio).

## 🆘 FAQ

### Je vois "Projection requise" partout, c'est normal ?

Oui ! Tu n'as pas encore ouvert l'onglet **Future**. Va y, ajuste les
sliders (taux de rendement, années, etc.) et la projection se calcule.
Tous les autres onglets utiliseront ces résultats automatiquement.

### Mes chiffres divergent entre Retraite et Future, pourquoi ?

Ils ne devraient plus depuis le cycle 18 (centralisation). Si tu vois
une divergence, c'est un bug → reporter sur GitHub.

### Le mode test a effacé mes données ?

Non — il les snapshote avant. **Désactiver** le mode test les restaure
intactes. Si la restauration échoue, ton dernier backup auto est
récupérable via Système → Backups.

### Comment changer le scénario actif ?

Future → bandeau scénarios en haut du graph. Cliquer une carte (Base,
Liberté 55, Hyperinflation, etc.). Le badge "Scénario actif" dans
Retraite reflète ton choix.

### Les cours des actions/crypto affichent toujours la même valeur, c'est normal ?

- **Crypto (BTC, ETH, SOL, etc.)** : prix auto-mis à jour via CoinGecko (gratuit, aucune clé).
- **Actions/ETF** : prix via Finnhub (clé gratuite optionnelle), ou snapshot initial si Finnhub non configurée.
- **Mode test** : les prix sont les vraies valeurs Yahoo Finance historiques (snapshot 2024-05 → 2026-05).

### J'ai oublié mon mot de passe de backup chiffré

Aucune récupération possible (chiffrement AES-256, PBKDF2 600k
itérations). C'est volontaire pour la sécurité. Toujours noter le mot
de passe dans un gestionnaire (Bitwarden, 1Password).

### L'app est-elle gratuite ?

Oui, FinanceAI est 100 % gratuit et open-source. Pas de freemium, pas
de publicité, pas de pousse-à-l'upgrade. Les API externes (Anthropic,
Finnhub, Era) sont optionnelles et utilisent tes propres clés.

## 📞 Support

- Issues GitHub : https://github.com/MoKarade/FinanceAI/issues
- Architecture détaillée : [docs/HANDOVER.md](HANDOVER.md)
- Roadmap : [docs/BACKLOG.md](BACKLOG.md)
- Tests : [docs/MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)
