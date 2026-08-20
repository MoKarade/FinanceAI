# ADR — Suppressions via MCP/IA : `delete_item` (actif / dette / objectif), transactions DIFFÉRÉES (`MCP-DIRECT-EDIT` Lots 4-5, 2026-07-29)

**Contexte** : Marc veut « changer tout avec MCP juste en le demandant », avec confirmation. Les lots 1-3
couvrent cash/budget/objectifs en upsert. Restent la « vente totale d'un titre » (Lot 4) et la
suppression (Lot 5) — des gestes DESTRUCTIFS, jusqu'ici réservés à l'UI.

**Décision** :
1. **Un seul tool `delete_item`** (`entity: 'asset' | 'debt' | 'savings_goal'` + `name`), confirmation à
   2 temps STRICTE (aperçu obligatoire ; `confirm:true` requis pour écrire), sauvegarde horodatée AVANT
   (comme toute écriture `runApply`), correspondance par nom/symbole NORMALISÉ exact (casse/accents) —
   jamais de fuzzy sur un geste destructif. Ambiguïté (2 noms équivalents) → erreur, pas de choix
   silencieux.
2. **« J'ai tout vendu mes X » = SUPPRESSION de l'actif**, PAS `quantity: 0`. Preuve
   (`reconstructPortfolioHistory.ts:62-67,106,142`) : `holdingsAt` compte les `purchases` même à
   quantité 0 → un actif « vendu » à quantité 0 garderait sa valeur dans la courbe d'historique À VIE
   (surfaces divergentes : liste à 0 $, courbe pleine). Le modèle de données n'a PAS de registre de
   ventes ; la suppression est le geste EXACT de l'UI (`Investments.handleDeleteAsset`). Le produit de
   la vente entre par les VRAIES transactions bancaires (import relevé) — rien à créditer à la main.
3. **Transactions : DIFFÉRÉ** (pas de `delete_transaction`). Le cash est DÉRIVÉ des transactions
   (`computeStartingCash`) : une suppression IA changerait le solde ET le budget réel en silence, et le
   chemin sûr existant (marquer `isDuplicate`/`isTransfer`) a une sémantique métier que l'IA ne doit pas
   deviner. À réévaluer sur un besoin concret de Marc.

**Pourquoi** : le danger d'une suppression IA n'est pas l'écriture (backup + confirmation) mais la
CIBLE ambigüe et les effets dérivés invisibles. Le périmètre retenu (3 entités à effets directs,
correspondance exacte, aperçu qui liste ce qui disparaît + les effets : NW qui monte à la suppression
d'une dette, courbe d'historique qui perd l'actif, décaissement d'objectif annulé) rend le geste
prévisible et réversible (Réglages → Sauvegarde → Restaurer).

**Trade-offs** : supprimer un actif retire AUSSI sa contribution PASSÉE à la courbe d'historique
(pas de « détenu jusqu'à hier » sans registre de ventes — documenté dans l'aperçu). Un
`sell_asset(date)` fidèle exigerait un modèle de ventes (purchases négatifs + stats DCA revues) →
ticket séparé si le besoin réel apparaît.

**Alternatives rejetées** : `quantity: 0` (courbe fausse à vie, cf. point 2) ; purchases négatifs
(casse potentiellement `computePurchaseStats`/DCA sans audit dédié) ; un tool par entité (3 surfaces
de description pour le même contrat de confirmation).
