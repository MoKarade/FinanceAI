# ADR — Quatre décisions de Marc (2026-08-17)

Prises en un batch, en réponse à mes questions de cadrage. Consignées ici parce que trois
d'entre elles CLOSENT des tickets ouverts depuis plusieurs sessions : sans trace, la prochaine
session les rouvrirait.

### Décision 1 — Export PDF en mode discret : REFUSER de générer

Le mode discret actif ⇒ l'export PDF ne produit PAS de fichier et explique pourquoi.

**Pourquoi.** Un PDF SORT de l'app et survit au mode : le fichier ne sait pas qu'il a été
généré depuis un écran masqué. Générer en clair depuis un écran volontairement masqué est un
piège (l'utilisateur croit ses montants protégés) ; générer avec les montants masqués produit
un rapport financier sans chiffres, donc inutile. Refuser est le seul comportement qui ne
trompe personne.
**Alternatives rejetées** : générer masqué (inutile) ; générer en clair avec avertissement
(l'écart entre écran et fichier reste implicite).

### Décision 2 — La dette dans le passé de la courbe : reste FIGÉE au niveau actuel

Confirmation de l'Option A. Aucun amortissement rétroactif, aucune saisie demandée à Marc.

⚠️ **Marc a signalé ce symptôme DEUX FOIS comme un bug** (patrimoine d'il y a cinq ans amputé
d'une dette contractée il y a six mois), puis a choisi le statu quo quand la question lui a été
posée explicitement, avec les trois options et leurs conséquences. C'est donc un **arbitrage
assumé**, pas un oubli : le coût de la saisie manuelle a été jugé supérieur au bénéfice.
⚠️ Conséquence pour la prochaine session : ce n'est PAS une régression à corriger si le
symptôme est re-signalé. Tout volet de `[PASSE-REEL-DETTE]` visant l'amortissement est CADUQUE.

#### ⚠️ PRÉCISION Marc du 2026-08-19 — l'EXTRACTION du contrat, elle, est VOULUE

La Décision 2 ci-dessus a failli faire fermer `[DEBT-FROM-CONTRACT]` comme caduc lors du ménage de
backlog. Question posée à Marc, réponse : **« oui on veut extraire »**. La décision est donc
précisée, pas renversée :

- ❌ **Reste caduc** : l'**amortissement rétroactif** (recalculer un solde décroissant mois par mois
  dans le passé). Le solde de dette du passé reste FIGÉ au niveau actuel.
- ❌ **Reste caduc** : demander une **saisie manuelle** à Marc (date de début, principal d'origine).
- ✅ **Est voulu** : **extraire ces champs du PDF du contrat** que Marc a déjà fourni. Lire un
  document n'est pas une saisie — c'était la demande d'origine de Marc le 2026-08-12 (« je t'ai
  donné le PDF du contrat, ça devrait être automatique »), et cette option n'était pas explicitement
  sur la table quand la Décision 2 a été tranchée.
- ✅ **Est voulu, par conséquence** : ne pas soustraire une dette AVANT sa date de début. C'est le
  symptôme que Marc a signalé deux fois (« ça me dit que j'ai la dette depuis des années mais c'est
  faux »), et c'est DISTINCT de l'amortissement — la dette reste à son niveau actuel sur toute la
  période où elle existe, elle est simplement absente avant.

Conséquence pour le BACKLOG : `[DEBT-FROM-CONTRACT]`, `[PASSE-REEL-DETTE-1]` (ne pas soustraire
avant la date de début), `[PASSE-REEL-DETTE-2]` (les champs `startDate`/`originalBalance`, remplis
par l'extraction et non par Marc) et `[PASSE-REEL-DETTE-3]` (l'import PDF les capte) restent
OUVERTS et VIVANTS. Seul un éventuel volet « amortissement rétroactif » serait à refuser.

### Décision 3 — La variabilité du jour : section REPLIABLE, FERMÉE par défaut

Pour `[PASSE-REEL-VARIATION-DU-JOUR]`, quand il sera codé.

⚠️ J'ai signalé le risque à Marc au moment de la question : une feature gatée par une
interaction se fait oublier (`UX-UNREACHABLE-FEATURE`, vécu deux fois dans la même journée).
Il a choisi fermée quand même, pour garder le panneau court. **Conséquences à respecter** : le
titre replié doit annoncer ce qu'il contient de façon autonome, et l'état ouvert/fermé mérite
d'être persisté pour que le choix de Marc ne soit pas à refaire à chaque ouverture.

### Décision 4 — `[REFONTE-NAV-L7]` est CADUQUE, remplacé par le découpage de Profil

Le Lot 7 disait « Réglages retravaillés en sections ». **Mesuré** : `components/Settings.tsx`
est déjà un orchestrateur léger de six sous-onglets (Profil · Comptes & soldes · Patrimoine ·
Clés API · Sauvegarde · Système & diagnostics), livré le 2026-07-31 par la PR #549 — donc AVANT
la rédaction du plan REFONTE-NAV, qui ne consacrait au Lot 7 qu'une ligne sans contenu.
Le seul volet vivant est celui que `[UI-TABS-RICH]` avait déjà réduit à « Profil » :
`components/Profile.tsx` monte `UsersCard` (338 lignes, le plus gros fichier du domaine) dans un
long scroll de cinq groupes.
**Découpage retenu par Marc** : Identité · Revenus · Profils enregistrés.
⚠️ Ces trois bacs ne couvrent PAS tout l'écran — **Retraite** et **Enfants** n'y entrent pas.
J'ajoute donc un 4e onglet plutôt que de les rétrograder sous « Revenus » (faux) ou de les
perdre (pire). Écart signalé à Marc, pas décidé en silence.

### Décision 5 — Garde des enfants après divorce : PARTAGÉE 50/50 (2026-08-17)

Réponse de Marc à la question routée dans `docs/A_FAIRE_MOI.md`. Débloque
`[ENG-DIVORCE-CHILDREN-REEE]`.

**Ce que ça fixe** : après un divorce, les **coûts d'enfants** et les **allocations familiales**
sont partagés **moitié-moitié**. C'est cohérent avec le régime canadien réel (en garde partagée,
l'ACE se divise 50/50 entre les deux parents).

⚠️ **Ce que ça NE fixait PAS** : le **REEE**. Son SOLDE suit déjà le partage PATRIMONIAL
(`reee *= keep`, `services/projection.ts`) — pas la garde. Les COTISATIONS futures étaient donc une
troisième question : garde (0,5), partage patrimonial (`keep`), ou entières ?

### Décision 5b — Cotisations REEE : elles suivent `keep` (2026-08-17)

Réponse de Marc le même jour, mot pour mot : « les cotisations REEE suivent keep, fais le correctif
complet ». La question ci-dessus est donc **tranchée** : les cotisations suivent le partage
**PATRIMONIAL**, comme le solde du régime — pas la garde des enfants.

**Implémentation** : `reeeContribShare` (cumulé au fil des divorces, `keep` étant multiplicatif) est
transmis à `processOneChild` et appliqué au MONTANT de cotisation, avant tout usage. ⚠️ Pas en
aval : la cotisation alimente cinq registres (liquidités, tracker à vie, subventions SCEE/IQEE,
solde, `contribREEE`) et n'en réduire qu'un aurait CRÉÉ de l'argent.

⚠️ **Ce que la première livraison affirmait sans le faire** : son commentaire disait que
`liquidDeltaReee` « suivait `keep` » alors qu'aucun facteur ne lui était appliqué. Finding de revue,
corrigé — et consigné ici parce qu'un commentaire faux sur du money-critical se propage.

### Décision 5c — La part de garde s'applique à la SOURCE, pas au résultat (2026-08-17)

Pas une décision de Marc mais une décision d'INGÉNIERIE, consignée parce qu'elle a coûté deux
défauts d'argent mesurés par deux agents indépendants.

Le premier jet appliquait `childCustodyShare` à quelques champs du RÉSULTAT de `processOneChild`.
Or chaque montant d'enfant alimente 3 à 5 registres, et partager le résultat oblige à se souvenir
de TOUS. Deux ont été oubliés : les allocations (encaissées à 100 %, publiées à 50 % — 75 957 $
d'écart sur le patrimoine final) et le décaissement REEE d'études (entier face à une dépense à
50 %). **Règle** : partager le MONTANT, jamais ses reflets. Tout dérivé suit alors par construction.
