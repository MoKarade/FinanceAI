# ADR — Rafraîchissement serveur autonome des prix (`HUB-REFRESH-CRON`, 2026-07-22)
**Statut** : accepté (Marc, 2026-07-22).

**Contexte** : l'app est 100 % navigateur ; elle SEULE poussait l'état (dont les cours de marché)
dans Drive. Onglet fermé = état figé partout, y compris le widget hub (« pas à jour sans ouvrir
l'app »). Le serveur MCP (Cloud Run) lit déjà Drive et a le refresh-token (Secret Manager), et le
moteur de prix `refreshAssetPrices`/`applyPricePatches` (services/priceRefresh) est partagé/pur.

**Décision** : exposer `POST /refresh` sur le serveur MCP (secret dédié `FINANCEAI_REFRESH_SECRET`,
Bearer, temps constant), déclenché par un **GitHub Actions planifié** (toutes les 6 h). Il lit
l'état (`getWithVersion`), rafraîchit les cours, `applyPricePatches`, et `save(next, version)` —
**écriture Drive avec garde OCC**. Ne touche QUE `currentPrice`/`priceUpdatedAt` ; les données
saisies sont intactes. Aucun changement de cours → aucune écriture. Clé Finnhub via env
(`FINANCEAI_FINNHUB_KEY`) pour rafraîchir aussi les actions (crypto CoinGecko marche sans clé).

**Pourquoi** : réutilise l'infra existante (Drive OAuth serveur + moteur de prix partagé) ; le
déclencheur externe contourne le scale-to-zero de Cloud Run ; GitHub Actions est gratuit et sans
la limite « 1×/jour » de Vercel Hobby (Marc : tout gratuit).

**Trade-offs** : introduit un ÉCRIVAIN serveur autonome (nuance le « 100 % navigateur, pas de
backend » — la source de vérité reste le blob Drive, le serveur n'en devient qu'un 2ᵉ écrivain,
borné aux cours). Risque d'écrasement écarté par l'OCC (un push app concurrent → conflit TYPÉ
`StateConflictError` → `200 { ok:false, conflict:true }` transitoire, réessai au tick). Erreurs
honnêtes : une panne RÉELLE (jeton révoqué, Drive KO, coffre chiffré) → `5xx`, le cron rougit et
alerte au lieu de rester vert sur des prix figés. Rafraîchit les PRIX, pas des saisies hors ligne.

**Alternatives rejetées** :
- (a) Vercel Cron → le front Vercel n'a PAS le token Drive (il vit sur Cloud Run) ; et Hobby = 1×/jour.
- (b) `setInterval` interne au serveur → Cloud Run dort sans trafic (scale-to-zero) → non fiable.
- (c) Rafraîchissement lecture-seule pour le seul widget hub → l'APP resterait figée (Marc veut tout, partout).
