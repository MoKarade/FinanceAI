# Analyse complète de l'app — 2026-07-15

> Panel de 4 agents (dette technique, architecture, produit, sécurité/vie privée) sur `main`
> + mesures quantitatives. À comparer à la prochaine passe (comme l'audit financier).
> Findings actionnables routés au BACKLOG (§ « Analyse app 2026-07-15 »).

## Chiffres clés [mesurés]

| Métrique | Valeur |
|---|---|
| Code applicatif | ~53 200 lignes (.ts/.tsx hors tests) |
| Tests | ~32 400 lignes, 223 fichiers, 2 395 `it()` (~2 580 exécutés) — ratio tests/code 0,61 |
| Dépendances prod | **11** (dev : 28) — remarquablement sobre |
| TODO/FIXME dans le code | 2 (les deux documentés, moteur RAMQ/FSS) |
| God-files > 850 lignes | 7 : projection.ts 1 749 (assumé, orchestrateur), Budget.tsx 1 289, Investments.tsx 1 163, FutureProjection.tsx 1 051, claude.ts 918, tax.ts 895, syncOrchestrator.ts 892 |
| Vélocité | 65 commits / 30 jours |
| Sous-modules projection | 41 (la doc disait 31 — corrigée) |

## Verdict global

**Le cœur est sain et discipliné** : moteur de projection modulaire à source unique (`chartData`),
un seul point d'entrée pour l'app ET le MCP (zéro duplication de calcul $ trouvée dans `mcp/`),
store persist propre (denylist, migrations), 12+ invariants de conservation, sécurité au-dessus
du standard pour une app solo. **La dette vit autour du cœur** : la couche sync (siège des deux
incidents de juillet), deux god-components UI très actifs, et un déséquilibre d'investissement
produit (features couple/enfants/dons à valeur nulle pour l'utilisateur solo actuel pendant que
des bugs le touchant directement attendent).

## 1. Architecture — l'essentiel

- **Risque n° 1 : `services/sync/syncOrchestrator.ts`** (892 lignes, 23 exports : push, pull,
  conflit, passphrase, polling, suppression distante mêlés). Les deux incidents money-critical de
  juillet (perte 230 k$, fuite persona) sont nés dans ce périmètre ; chaque fix a été un patch
  DANS le fichier, jamais une redistribution. **Refactor le plus rentable du repo** : scission en
  4 modules (push / pull+conflit / cycle de vie / passphrase), `syncEngine.ts` (pur) inchangé,
  barrel de compat, discriminants sur les scénarios des 2 incidents. → `[ARCH-SYNC-SPLIT]`
- **Pattern « sections » prouvé** : Settings.tsx est passé de god-file à 207 lignes via
  `components/settings/sections/*`. À répliquer sur Budget.tsx (1 289) et Investments.tsx (1 163),
  les 2 onglets les plus actifs. → `[DETTE-GODFILE-BUDGET]`, `[DETTE-GODFILE-INVESTMENTS]`
- **H2 (sélecteurs atomiques) déclassé en MOYEN** : les 2 vraies sources de tempête de re-renders
  (lastProjection/projectionStatus) sont déjà exclues du selector App ; 53 composants lisent déjà
  le store en atomique. Reste un enjeu de PERF (prop-drilling TabRouter, 78 usages), pas de fiabilité.
  À migrer page par page, pas en big-bang.
- **Risque structurel MCP** : chaque nouveau tool qui somme des flux `chartData` peut retomber dans
  le piège MCP-RETIREMENT-VERDICT (champs de flux absents par design). Garde-fou générique à
  systématiser. → `[MCP-CHARTDATA-SUM-GUARD]`
- Frontières : OK globalement (calculs $ hors composants), deux voies de lecture du store
  coexistent (props vs direct) sans règle écrite — à documenter, pas à refactorer.

## 2. Dette technique — top findings (15 au total, détail BACKLOG)

- **HIGH `[DETTE-PDF-FX-BYPASS]`** : `services/pdfReport.ts:123` calcule `quantity × currentPrice × fx`
  à la main au lieu d'`assetValueCad` — même classe que l'incident FX des 230 k$ sous-affichés,
  dans le PDF remis à l'utilisateur, ET invisible du test-garde `assetFxGuard` (le mot « fx » sur
  la ligne suffit à le faire passer). Effort S. **À corriger en premier.**
- HIGH : les 3 god-components UI (Budget, Investments, FutureProjection) — cf. §1.
- MEDIUM : `services/claude.ts` = 8 features IA indépendantes en un fichier (split mécanique) ;
  6 `toLocaleString()` NUS (AiAssistant ×5, taxApril log — rendraient « NaN » au lieu de « — ») ;
  aucune primitive `Field/Input` (81 inputs inline, 40 dans AdvancedProjectionParams) ; thème
  tooltip Recharts dupliqué 14× avec 4 noirs différents ; `pickProvider` (routage Finnhub/CoinGecko)
  sans test ; pdfReport et realEstate à scinder (builders purs vs rendu/conseils).
- LOW : 4 lignes de code mort `_`-préfixé confirmées (Budget ×2, RealEstate, AiAssistant) ;
  2 TODO moteur (RAMQ/FSS enfants à charge + assurance médicaments — champs User additifs) ;
  `utils/tax.ts` 99 exports (split documentaire constantes/formules, avec prudence anti-duplication).

## 3. Produit — pour l'utilisateur réel (solo)

- **Déséquilibre d'investissement** : chantiers majeurs récents à valeur actuelle ≈ 0 pour un
  utilisateur SOLO de 26 ans (retraite per-conjoint, optimiseur de couple `[CIX]`, dons FA-6,
  enfants/REEE), pendant que des bugs à impact direct attendaient (`FISC-PAYROLL-BASE-INVEST`
  correspond quasi exactement à son profil salaire + gros non-enregistré). **Décision proposée :
  geler `[CIX]` et tout raffinement per-conjoint/dons tant que la situation ne change pas.**
- **Top 5 valeur** : 1) `FISC-PAYROLL-BASE-INVEST` (cotisations RRQ/RQAP/AE gonflées — le voit
  chaque jour) ; 2) `MCP-GET-HOLDINGS` (impossible de demander « qu'est-ce que je détiens » à
  claude.ai — trou sur l'interaction la plus fréquente, effort S) ; 3) `CELI-ASSET-NUDGE` +
  `ASSET-CURRENCY-BACKFILL` (CELI affiché 0 malgré cotisations ; même classe que l'incident FX) ;
  4) fermer `PERSONA-LEAK-ROOTCAUSE` + `MCP-WRITE-VERSION-TOKEN`/`SYNC-FETCH-TIMEOUT` (2 incidents
  de confiance en 3 semaines) ; 5) **rappel proactif « relevé de [mois] manquant »** (le rituel
  d'import mensuel n'a aucun filet — c'est ce qui a laissé la fuite persona invisible des semaines).
  → `[UX-STATEMENT-REMINDER]`
- Tension VISION↔réel assumée à surveiller : l'infra OAuth/Cloud Run dépasse le besoin strict d'un
  mono-utilisateur — geler le durcissement au niveau actuel sauf incident.
- Prix des titres EU (gros du portefeuille) non couverts par Finnhub gratuit — friction récurrente
  documentée, sans solution gratuite propre identifiée à date.

## 4. Sécurité / vie privée — posture

**Solide (à ne pas toucher)** : clés API chiffrées non-extractibles (état de l'art client-only) ;
OAuth 2.1 MCP complet (redirect_uri exact, PKCE re-vérifié, usage unique, timingSafeEqual) ;
CSP sans unsafe-inline script ; sanitisation LLM homogène (payees, noms, montants arrondis,
enveloppe anti-injection) ; scrub PII des logs ; scope Drive minimal ; droit à l'effacement réel.

**5 risques résiduels priorisés** :
1. **[MOYEN-ÉLEVÉ] Payload Drive EN CLAIR par défaut** (chiffré seulement si passphrase opt-in) —
   les clés API ont déjà un chiffrement NON-optionnel dérivé du `sub` Google : appliquer la même
   recette à tout le payload, zéro friction UX, passphrase = zéro-knowledge additionnel.
   → `[SEC-DRIVE-ENCRYPT-DEFAULT]`
2. **[MOYEN] Relevés envoyés en pleine fidélité à Claude Vision** (image brute : montants exacts,
   nom/adresse/n° de compte imprimés) sans consentement dédié ni clause anti-injection dans le
   prompt Vision (présente partout ailleurs). → `[SEC-VISION-CONSENT-INJECTION]`
3. **[MOYEN] `/oauth/authorize` sans rate-limit ni log des échecs** (brute-force silencieux de
   l'access key possible). → fusionné dans `[MCP-CLOUDRUN-AUTH-HARDENING]` existant.
4. [FAIBLE] Anti-rejeu OAuth en mémoire par instance (accepté mono-instance ; à revoir si scale-out).
5. [FAIBLE] `gtag.js` chargé avant consentement (ping IP même en denied) — injecter le script
   APRÈS le consentement pour la posture Loi 25 maximale. → `[SEC-GA-DEFER-CONSENT]`

## Plan recommandé (ordre)

1. `[DETTE-PDF-FX-BYPASS]` (S, bug $ visible) + `[MCP-GET-HOLDINGS]` (S, usage quotidien)
2. `[FISC-PAYROLL-BASE-INVEST]` (moteur, plan-first + discriminants)
3. `[SEC-DRIVE-ENCRYPT-DEFAULT]` (M, la donnée la plus sensible de l'app)
4. `[ARCH-SYNC-SPLIT]` (L, plan-first — AVANT tout nouveau chantier sync)
5. `[UX-STATEMENT-REMINDER]` + `[CELI-ASSET-NUDGE]` (confiance dans les chiffres quotidiens)
6. Éclatement Budget.tsx/Investments.tsx en sections (au fil des prochaines features, pas big-bang)
7. GELER : `[CIX]`, raffinements per-conjoint/dons, durcissement OAuth au-delà de l'existant,
   chasses d'affichage LOW sans impact patrimoine.
