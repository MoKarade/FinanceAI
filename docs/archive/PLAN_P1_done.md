# Plan P1 — Production Readiness ✅ TERMINÉ

> **Origine** : roadmap "10/10" proposée après livraison refonte UI v3.0.
> **Décision utilisateur** (2026-05-20) : commencer par **P1**, P0 différé.
> **Statut** : **7/7 items livrés** en une journée (2026-05-20), PRs #99 à #105.
> **Contrainte cardinale respectée** : **tout sur tiers gratuits**. Pas de
> backend tiers, pas de Sentry SaaS, pas de WebSocket payant.

---

## Vue d'ensemble — État final

P1 = ce qui transforme un projet hobby en app prête pour la prod **mono-utilisateur**, sans infrastructure externe payante.

| Item | Effort | Impact | Statut | PR |
|---|---|---|---|---|
| **P1.1** Error logger local self-contained | 4h | 🔴 critique | ✅ livré | #99 |
| **P1.2** Validation Zod end-to-end (AI + Era + store) | 6h | 🟠 important | ✅ livré | #102 |
| **P1.3** Backup automatique rolling (IndexedDB 7-day) | 6h | 🟠 important | ✅ livré | #101 |
| **P1.4** CSV export + lazyWithRetry + cache headers | 3h | 🟡 utile | ✅ livré | #100 |
| **P1.5** PDF export complet (patrimoine + fiscal + holdings + dettes + goals) | 8h | 🟠 important | ✅ livré | #104 |
| **P1.6** Lighthouse CI dans GitHub Actions | 2h | 🟡 utile | ✅ livré | #105 |
| **P1.7** Audit log localStorage (qui a changé quoi) | 6h | 🟢 nice-to-have | ✅ livré | #103 |
| **TOTAL** | **~35h** | | **7/7** | |

**Tests** : 511 → **566 verts** (50 fichiers), 0 régression. Build clean.
**Bundle** : index 528 KB gzip 166 KB, vendor jspdf 391 KB lazy-chargé.

### Note GlitchTip / Sentry

La roadmap initiale mentionnait GlitchTip (Sentry self-hosted gratuit) pour
l'error tracking. **Réinterprétation** : GlitchTip nécessite un backend
(PostgreSQL + Django). Pas viable pour une app 100% client. **Solution**
adoptée : **error logger local** dans localStorage avec UI d'export. Zéro
infrastructure.

---

## P1.1 — Error logger local (4h) ✅ livré (#99)

**Statut** : ✅ Livré. `services/errorLogger.ts` + global handlers + viewer.

### Architecture
- `services/errorLogger.ts` : rolling buffer 100 entrées en localStorage
- API : `logError({source, message, severity, error?, context?})`
- 7 sources : `ai | era | projection | ui | network | storage | unknown`
- 4 severities : `info | warning | error | critical`
- Helpers : `getErrors`, `filterErrors`, `clearErrors`, `getErrorStats`, `exportErrorsAsJSON`

### Intégration
- `App.tsx` : `installGlobalErrorHandlers()` au boot (capture `window.onerror` + `unhandledrejection`)
- `services/claude.ts` : remplacement de `console.error` par `logError({source: 'ai', ...})` dans 5 fonctions IA principales
- `services/eraContext.ts` : log warning structuré (Era a un fallback)

### UI
- Section dans `SystemView` : table des erreurs avec filtres + bouton export JSON + bouton clear

### Tests
- 10 tests unitaires couvrant : rolling buffer, filters, stats, corruption localStorage

---

## P1.2 — Validation Zod end-to-end (6h) ✅ livré (#102)

### Pourquoi
L'app reçoit des données de 3 sources externes :
1. **Anthropic Claude** (réponses JSON pour catégorisation, IA, etc.)
2. **Era Context** (transactions, cash flow, spending, etc.)
3. **localStorage** (rehydration au boot, peut être corrompue ou tampered)

Si une de ces sources renvoie un payload malformé (typo dans Claude, breaking change Era, user qui édite localStorage), l'app peut crasher silencieusement ou produire des calculs erronés.

### Plan
1. **Audit existant** : list tous les `JSON.parse` et `response.json()` dans le repo
2. **Schémas Zod** : compléter là où manque (déjà partiellement fait dans `services/claude.ts`)
3. **safeParse partout** au lieu de `parse` (catch les erreurs, log via P1.1)
4. **Fallback strategy** : pour chaque source, définir le comportement si payload invalide (skip, retry, default values)
5. **Tests** : 10+ tests vérifiant que payloads malformés ne crashent pas l'app

### Files à toucher
- `services/eraContext.ts` (8 endpoints, certains sans Zod)
- `services/claude.ts` (audit final, ajouter quelques manquants)
- `store/useFinanceStore.ts` (validation rehydration)
- `services/marketData/providers/finnhub.ts` (responses HTTP)

---

## P1.3 — Backup automatique rolling (6h) ✅ livré (#101)

### Pourquoi
Aujourd'hui : backup manuel via `BackupPanel` (export JSON / export chiffré).
Si l'utilisateur oublie de backup et perd son localStorage (cleanup browser,
nouvel ordi), tout est perdu.

### Plan
1. **IndexedDB** comme stockage de backups (plus large que localStorage, ~50MB)
2. **Schéma** : table `backups` avec `{id, timestamp, payload (compressed), size}`
3. **Trigger automatique** : 1 backup/jour, gardé 7 jours (rolling)
4. **UI** : section dans `SystemView` ou `BackupPanel` listant les backups locaux + bouton "Restaurer"
5. **Chiffrement optionnel** : si utilisateur a défini une passphrase, chiffre avec AES-GCM (réutilise `BackupPanel` existant)

### Files à créer
- `services/backupAuto.ts` (logique IndexedDB rolling)
- `components/settings/AutoBackupPanel.tsx` (UI)

### Tests
- 5-10 tests : rolling buffer 7-day, restauration, conflits version

---

## P1.4 — CSV export + résilience chunk-load (3h) ✅ livré (#100)

### Pourquoi
Pour analyse externe (Excel, comptable) ou archivage simple. Format universel.

### Plan
- `utils/csvExport.ts` : helper générique `toCSV(rows, columns)` avec escape RFC 4180
- 3 boutons d'export :
  - **Transactions** (date, payee, amount, category, account, isTransfer)
  - **Holdings** (symbol, name, quantity, price, value, accountType, dateBought, gainPct)
  - **Budget items** (name, nature, target, multiplier, frequency)
- Trigger : bouton dans la PageHeader de chaque onglet

### Files à créer
- `utils/csvExport.ts`
- `tests/utils/csvExport.test.ts`

### Tests
- 5 tests : escape (virgules, guillemets, newlines), header, empty rows

---

## P1.5 — PDF export complet (8h) ✅ livré (#104)

### Pourquoi
Aujourd'hui : `pdfReport.ts` existe mais minimaliste. Pour un app finance,
un rapport PDF mensuel/annuel propre est attendu.

### Plan
1. **Rapport patrimoine** : page de garde + summary KPIs + chart historique + breakdown comptes + holdings détaillés
2. **Rapport fiscal** : revenu brut/net + tax breakdown + tranches + suggestions IA
3. **Rapport budget** : budget vs réel + catégories + tendance mensuelle
4. **Style** : utiliser jspdf (déjà installé) + jspdf-autotable pour tables
5. **Trigger** : bouton "Export PDF" sur Dashboard, TaxCenter, Budget

### Files
- `services/pdfReport.ts` (existant — à enrichir massivement)
- `services/pdfTemplates/patrimoineReport.ts` (nouveau)
- `services/pdfTemplates/taxReport.ts` (nouveau)
- `services/pdfTemplates/budgetReport.ts` (nouveau)

### Tests
- Tests d'intégration : génère un PDF avec données fixtures, vérifie structure (taille, pages, contient titre)

---

## P1.6 — Lighthouse CI (2h) ✅ livré (#105)

### Pourquoi
Garde-fou perf/a11y/SEO automatique. Empêche les régressions silencieuses.

### Plan
- GitHub Action `lighthouse-ci.yml` qui run après build sur Vercel preview
- Cible : 90+ perf desktop, 95+ a11y, 90+ best practices
- Échec si régression > 5 points

### Files
- `.github/workflows/lighthouse-ci.yml`
- `lighthouserc.json` (config)

---

## P1.7 — Audit log (6h) ✅ livré (#103)

### Pourquoi
"Qui a changé quoi quand" — utile pour debug, ou si l'utilisateur se demande
pourquoi un chiffre a changé. Pattern de financial apps sérieux.

### Plan
1. **Middleware Zustand** : intercept tous les `setAppState` et log `{timestamp, field, oldValue, newValue}`
2. **Stockage** : rolling buffer 500 entrées dans localStorage
3. **UI** : section dans `SystemView` avec filtres par champ + date
4. **Export** : JSON pour partage/analyse

### Files
- `store/auditMiddleware.ts` (nouveau)
- `components/system/AuditLogViewer.tsx` (nouveau)

### Tests
- 5 tests : capture changes, rolling, filter, export

---

## Ordre d'exécution recommandé

1. **P1.1** Error logger (déjà démarré, finir) — **4h**
2. **P1.4** CSV export (quick win) — **3h**
3. **P1.2** Validation Zod end-to-end — **6h**
4. **P1.3** Backup auto rolling — **6h**
5. **P1.6** Lighthouse CI — **2h**
6. **P1.5** PDF export complet — **8h**
7. **P1.7** Audit log — **6h**

**Stratégie de PRs** : 1 PR par item (7 PRs), draft par défaut, validation incrémentale comme pour la refonte UI v3.0.

---

## Risques & points d'attention

1. **IndexedDB cross-browser** : Safari iOS a des quotas plus stricts, prévoir fallback localStorage
2. **PDF bundle size** : jspdf est gros (~400 KB) mais déjà chargé en lazy-load
3. **Zod end-to-end** : risque de breaking si schemas trop stricts — utiliser `.passthrough()` au besoin
4. **Lighthouse CI** : peut bloquer les PRs — calibrer les thresholds avec marge initiale (80+)

---

## Décisions ouvertes

- **Restauration backup** : confirmer écraser ou merger les données existantes ?
- **CSV format** : delimiter virgule (US) ou point-virgule (FR Excel) ? Default virgule, option pour ; 
- **PDF logo/branding** : ajouter le logo FinanceAI en watermark ? (couleur ?)
- **Audit log retention** : 500 entrées est-il assez ? Plus = stockage localStorage croît

---

> **Next step** : reprendre P1.1 errorLogger depuis le stash et finaliser l'intégration UI (section SystemView).
