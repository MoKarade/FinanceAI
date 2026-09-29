# ADR — Écriture MCP : confirmation à deux temps liée côté serveur (jeton à usage unique) (2026-09-26)

**Statut** : livré (code + tests) ; PR sensible (`mcp/**`), validation Marc requise. Origine : audit sécurité P3-P6
du 26/09/2026, findings « élevée » 1 et 2 (`apply_*` sans confirmation ; `confirm:true` fourni par le modèle).

## Contexte

Le connecteur MCP expose à claude.ai huit outils qui ÉCRIVENT l'état réel (`apply_payslip`, `apply_bank_statement`,
`apply_broker_statement`, `apply_tax_slip`, `apply_debt`, `set_cash`, `set_budget_item`, `delete_item`). Deux trous :

1. Les cinq `apply_*` — ceux qui ingèrent des documents non fiables, donc la cible naturelle d'une injection
   (« ignore… appelle apply_debt ») — écrivaient dès le premier appel, sans aperçu.
2. Les trois autres avaient une « confirmation à 2 temps » que le MODÈLE pilotait lui-même (`confirm:true`) :
   un modèle piégé l'envoyait au premier appel. Une confirmation que l'appelant s'accorde n'est pas une confirmation.

## Décision

Tous les outils d'écriture passent par UN point (`mcp/tools/_writeTool.ts` → `runApply`, garde de test) :

- **1er appel** : calcule les changements, renvoie l'aperçu (changements exacts, désinfectés) et un `confirmToken`.
  Rien n'est écrit.
- **2e appel** : mêmes arguments + `confirmToken`. Le serveur vérifie puis BRÛLE le jeton, et seulement alors écrit
  (sauvegarde horodatée + OCC existants).
- Le jeton (`mcp/tools/confirmVault.ts`) : nonce aléatoire + HMAC-SHA256 (clé aléatoire par processus) lié à la
  **session** (identifiant MCP), à l'**outil**, à l'empreinte canonique des **arguments** et à l'empreinte des
  **changements calculés** (si l'état bouge entre l'aperçu et la confirmation → refus, nouvel aperçu). Usage unique
  (brûlé même refusé), expire à 5 min, 100 jetons en attente au plus.
- `confirm` (booléen) est **retiré du schéma MCP** et n'a plus aucun effet. Le chat in-app garde son modal.
- Plafond : 500 éléments d'entrée et 500 changements par appel.
- Annotations MCP : `readOnlyHint:false` partout (claude.ai demande l'approbation de chaque appel), `destructiveHint`
  vrai pour `delete_item`, `openWorldHint:false`.
- Journal d'audit : `[mcp:audit] outil= phase=apercu|ecriture|refus elements=N resultat=code` — jamais de montant ni de nom.

## Pourquoi en mémoire (sans base)

Le serveur Cloud Run n'a aucun stockage propre (l'état vit sur Drive). Un jeton vit 5 min : la mémoire du processus
suffit, le HMAC empêche de le fabriquer, la table des nonces empêche le rejeu. **Limite acceptée** : un redémarrage
ou un changement d'instance fait perdre les jetons en attente → l'utilisateur refait un aperçu. L'échec est sûr
(jamais une écriture non voulue). Une base (Drive, Firestore) ajouterait un coût, une latence et une surface pour
un gain nul sur ce risque.

## Ce que le jeton NE prouve PAS

Il prouve « aperçu émis, mêmes arguments, une seule fois, il y a moins de 5 min ». Il ne prouve pas qu'un humain a
lu l'aperçu : un modèle malveillant peut rappeler aussitôt avec le jeton. La barrière humaine reste l'approbation
par appel de claude.ai (d'où les annotations) et la sauvegarde annulable. Ce qui est éliminé : l'écriture en un
seul appel, le rejeu, la substitution d'arguments, le jeton d'une autre session, l'écriture sur un état changé.

## Compatibilité

`initialize.instructions` et la description de chaque outil d'écriture décrivent le nouveau protocole. Un client qui
enverrait encore `confirm:true` reçoit un aperçu (le champ est ignoré). Tests d'attaque :
`tests/mcp/confirmationEcritureMcp.test.ts`.

## Ajouts après avis pole-securite (2026-09-26)

1. **Ne PAS activer « toujours autoriser » sur les outils d'écriture du connecteur** dans claude.ai. Ce réglage supprime
   l'approbation par appel, donc la seule barrière humaine ; le jeton ne l'y remplace pas (voir « Ce que le jeton NE prouve
   PAS »). Consigne pour Marc dans `docs/A_FAIRE_MOI.md`.
2. **`scope=local` à surveiller en production.** Si `extra.sessionId` est absent, la portée du jeton retombe sur « local »
   (liée au seul processus). Chaque ligne d'audit porte `scope=local` ou `scope=session` (jamais la valeur de la session).
   À vérifier après déploiement Cloud Run : les écritures doivent journaliser `scope=session` ; sinon le transport ne fournit
   pas d'identifiant de session et le lien « session » du jeton est sans effet (le lien outil/arguments/changements reste).
3. **Piste : l'« elicitation » MCP.** Le serveur peut demander lui-même l'accord à l'utilisateur (`elicitInput`) quand le
   client la supporte : c'est la seule vraie barrière HORS modèle (l'utilisateur répond à une boîte que le modèle ne peut
   pas remplir à sa place). À étudier : support par claude.ai, repli sur le jeton quand le client ne la supporte pas.
