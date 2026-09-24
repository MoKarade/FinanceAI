# ADR — Grand livre courtier et référentiel d'instruments : forme persistée (Lot 1a, 2026-09-24)

**Statut** : accepté et livré (schéma seulement — rien n'écrit encore dans ces champs).

## Contexte

La refonte du portefeuille (ADR 0019) remplace la liste des positions saisies (`assets`) par un
**grand livre d'événements** importé des relevés du courtier, plus un **référentiel d'instruments**
(ISIN → cotation). Avant d'écrire quoi que ce soit, les deux champs doivent exister dans l'état
persisté de TOUS les appareils (téléphone, PC, serveur MCP) : l'incident du 2026-09-01 a montré
qu'une clé textuelle inconnue de la garde de réhydratation (`verifierTypesRestaures`) fait échouer
`merge`, et l'app s'ouvre VIDE. D'où un lot qui déclare sans écrire, déployé AVANT l'import.

## Décision

1. **Deux champs additifs d'`AppState`** : `brokerLedger?: BrokerLedgerEvent[]` et
   `instruments?: BrokerInstrument[]`. Aucun bump de version (v7 reste v7), aucune migration.
2. **Tri-état** : `undefined` = jamais importé (les lecteurs retombent sur `assets`), `[]` = importé
   et vide. Aucun défaut ne pose `[]` — ni le store, ni le MCP, ni la restauration d'un backup.
3. **`undefined` EXPLICITE dans les deux littéraux de défaut** (`DEFAULT_APP_STATE`,
   `buildDefaultAppState`), comme les champs Fintable : `personaResetBase()` en dérive, donc le vrai
   grand livre est remis à zéro en démo persona (une clé absente ne le serait pas). Ce n'est pas une
   « valeur par défaut » au sens du piège `fxRatesSource` : JSON retire la clé du blob, et un blob
   qui la porte la recouvre.
4. **Tableau PLAT d'événements** portant chacun son `accountId` (`courtier-cad`, `courtier-usd`,
   `hors-courtier` — identifiants propres à l'app, jamais un numéro de compte). **Union discriminée**
   sur `kind` : un fractionnement n'a ni quantité ni prix (deux nombres `splitFrom`/`splitTo`), un
   achat a un prix ET un montant réglé, un dividende n'a pas de quantité — impossible à écrire
   autrement (`tests/types/grandLivreImpossibles.test.ts`, gardé par `tsc`).
5. **Un montant n'existe jamais sans sa devise** (`BrokerLedgerMoney { value, currency }`), valeur
   telle qu'imprimée, toujours positive, le sens porté par `kind`. Achat/vente : montant NET réglé,
   commission incluse, devise du compte. Dividende : BRUT, la retenue étrangère est un événement à part.
6. **Référentiel en tableau d'objets**, jamais un `Record` indexé par ISIN (ses valeurs seraient
   jugées sous une clé dynamique → refus → app vide). La place (`exchange`) reste du texte libre :
   une union fermée des places publierait où le portefeuille est coté.
7. **Formes imposées par la garde de dérivation** (elle lit des FORMES) : alias `typeof X[number]`
   sur des tableaux `as const` en ASCII sans accent, sous-objets en interfaces NOMMÉES, aucun `;`
   dans les commentaires du bloc. Trois clés textuelles neuves (`isin`, `exchange`, `controlSymbol`)
   entrent dans `CHAMPS_TEXTE` dans le même lot, avec des témoins nommés dans la garde.
8. **Le livre compte** : un appareil qui ne porte que lui n'est pas « vide » (`DATA_ARRAY_KEYS`), le
   modal de conflit de synchro affiche « N opération(s) de courtier » des deux côtés, la sauvegarde
   JSON l'exporte et le restaure, le nettoyeur d'artefacts de persona le filtre par `id`. Le modal
   compte aussi les instruments (le référentiel peut arriver seul).
9. **À la réhydratation, un champ tri-état vient du blob et de lui seul** (`CLES_TRI_ETAT` dans
   `store/optionsPersistance.ts`) : zustand fusionne avec l'état vivant, donc une clé absente du blob
   laisserait survivre le livre local à une restauration Drive.
10. **Aucun persona ne plante de référentiel** : `instruments` n'a pas d'`id`, le nettoyeur ne peut pas
   le filtrer ; la règle est tenue par `tests/services/personaSanitizer.test.ts`.

## Conséquences

- Les identifiants d'événements écrits par l'import (lot 1g) doivent être stables (réimport
  identique = mêmes id) et ne jamais coïncider avec un identifiant de persona (préfixes du registre
  `services/testPersonas/artifactIds.ts`).
- Après le déploiement de ce lot, chaque appareil doit être rouvert UNE fois avant le premier import
  (ADR 0019, Q21).

## Alternatives écartées

- **Réutiliser `investmentTransactions`** : champ sans lecteur, `[]` par défaut (donc « vide » au lieu
  de « jamais importé »), et forme libre qui ne rend impossible aucune erreur connue.
- **Comptes imbriqués et imports en ajout seul (bitemporels)** : plus riches, hors de ce que le Lot 1
  exige, et ajoutables plus tard sans migration.
- **Clé absente des défauts** (au lieu de `undefined` explicite) : ferait traverser la démo persona au
  vrai grand livre, et le rendrait invisible au chat de l'app.
