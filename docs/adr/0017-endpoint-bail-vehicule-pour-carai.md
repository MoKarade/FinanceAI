# ADR — `GET /vehicule/bail` : FinanceAI publie le bail du véhicule à CarAI, sous un secret DÉDIÉ (Marc, 2026-09-15)

**Statut** : accepté et livré.

## Contexte

Marc, 2026-09-15 : « je veux aussi voir ce que j'ai payé par rapport au prix total du prêt […] regarde ces infos dans
financeai ». La demande vit dans **CarAI**, sur l'écran d'accueil, dans le bandeau « Bail ».

Le problème est un partage de connaissance, pas un calcul :

- **CarAI** connaît les TERMES du bail — date de signature, durée, kilométrage alloué, tarifs au kilomètre excédentaire
  (`lib/vehicle/lease.ts`, `TermesBail`). Elle ne connaît **aucun dollar** : ni mensualité, ni montant financé, ni solde.
- **FinanceAI** connaît les dollars : la dette « bZ » (solde 47 169 $, taux 0 %, versement mensuel) vit dans l'état.
- Le pont existant entre les deux, `GET /hub/summary`, **ne peut pas** porter ça : le contrat du hub plafonne à six
  métriques, et le bail d'une voiture n'a pas sa place sur la carte de FinanceAI. Le hub, lui, est **générique par le
  contrat** et ne connaît aucune app en particulier (principe non négociable de Hubperso) : y router une donnée
  « véhicule » serait la première exception, et les exceptions d'un routeur générique ne restent jamais seules.

Marc a par ailleurs demandé, le même jour, « que toutes les apps soient connectées entre elles, que hubperso fasse tout
connecter entre eux ». Cette décision-là **reste ouverte** et n'est pas préjugée ici : ce qui suit ouvre UN lien pour UN
besoin nommé, pas un maillage.

## Décision

**Un endpoint dédié, minuscule, gardé par un secret qui lui est propre.**

1. `GET /vehicule/bail` sur le serveur MCP auto-hébergé (`mcp/http.ts`), à côté de `/hub/summary`, `/refresh` et
   `/fintable-sync`. Il rend UNE dette : celle du véhicule. Pas le patrimoine, pas les autres dettes, pas les
   transactions — un endpoint qui rendrait « l'état » serait un second `/mcp` sans son OAuth.
2. **Secret DÉDIÉ `FINANCEAI_VEHICULE_TOKEN`**, distinct de `FINANCEAI_HUB_TOKEN`. Réutiliser le jeton du hub aurait
   épargné une variable à poser — mais il ouvre `/hub/summary`, donc la valeur nette, le cashflow et les liquidités.
   Le donner à CarAI pour qu'elle lise une mensualité, c'est lui donner tout le reste. Ce dépôt a déjà tranché
   exactement cet arbitrage entre `/refresh` et `/fintable-sync` (« secrets DISTINCTS — périmètres différents,
   rotation indépendante ») ; on suit le précédent plutôt que de le rejuger.
3. **La route n'existe QUE si le secret existe.** Sans lui : 404, comme n'importe quelle URL inconnue — plus discret
   qu'un 503 qui confirmerait le endpoint à qui le sonde. Même choix que `/hub/summary`.
4. **Le refus plutôt que le choix.** Deux dettes de véhicule ⇒ **409** nommant les candidates, jamais « la première ».
   Publier la mauvaise dette mettrait un montant faux et *crédible* sur l'écran d'accueil de CarAI.
   `FINANCEAI_VEHICULE_DETTE` (nom exact) est le moyen de trancher quand deux véhicules coexistent.
5. **Ce que l'état ne porte pas est `null` ET nommé** (`champsAbsents`). Un consommateur ne doit jamais avoir à deviner
   si un `null` veut dire « zéro » ou « je ne sais pas » — c'est `no-fake-data` appliqué à une frontière réseau.

## Pourquoi

- **Moindre privilège, et il se mesure** : le jeton de CarAI donne accès à une mensualité, un solde, un taux et deux
  dates. Pas à la valeur nette.
- **Le hub reste générique.** Aucun des trois dépôts ne gagne une connaissance de l'autre au-delà du strict nécessaire.
- **La sélection marche sur l'état RÉEL.** `kind: 'auto-lease'` serait le discriminant idéal — mais **aucun producteur
  ne l'écrit** : l'outil MCP `apply_debt` ne l'expose pas, et une dette saisie dans l'app peut n'avoir que sa
  `category`. La sélection retombe donc sur `category === 'Car'`, qui est le chemin réellement emprunté, et un test le
  verrouille (`UN-CHAMP-TYPE-SANS-PRODUCTEUR`).

## Trade-offs

- **Un geste manuel pour Marc, deux fois** : poser `FINANCEAI_VEHICULE_TOKEN` sur son PC (là où tourne le serveur) et
  la même valeur sur Vercel côté CarAI. Sans ça, la route n'existe pas et CarAI affiche « non configuré » — un état
  honnête, pas une panne.
- **Un redémarrage du serveur MCP** pour que la route existe : c'est le prix de tout changement de ce serveur, et il
  n'est pas propre à ce lot.
- **Un lien de plus dans l'écosystème.** Assumé, et borné à un cas nommé. Si Marc décide plus tard du maillage par le
  hub, cet endpoint se range dessous sans se contredire — il reste la source de la donnée.

## Alternatives rejetées

- **Publier le bail dans `/hub/summary`** (bloc `details` du contrat v1.3). Rejeté : la carte de FinanceAI parle
  d'argent global, et le hub ne relaie pas d'app à app. CarAI n'a d'ailleurs pas le jeton du hub pour FinanceAI.
- **Router par le hub** (`GET /api/vehicule/bail` côté Hubperso). Rejeté : violerait « le hub ne connaît AUCUNE app en
  particulier », et ferait du hub un point de passage critique pour une donnée d'affichage — alors qu'il est
  délibérément hors du chemin critique de l'autorisation (ADR 0001 du hub).
- **Réutiliser `FINANCEAI_HUB_TOKEN`.** Rejeté : voir la décision n° 2. Une variable économisée contre un périmètre
  multiplié n'est pas un bon échange.
- **Que CarAI saisisse la mensualité à la main.** Rejeté par la demande de Marc (« regarde ces infos dans financeai ») :
  une valeur recopiée diverge au premier changement, en silence, et c'est un montant.
