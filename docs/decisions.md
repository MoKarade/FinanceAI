# Décisions d'architecture (ADR)

> Journal court des décisions structurantes. Format : Contexte / Décision / Pourquoi / Trade-offs / Alternatives
> rejetées. Les ADR livrés plus anciens sont consolidés dans `docs/HISTORIQUE.md`.

## ADR-002 — App PERSONNELLE (solo) et relais BYOK pour Claude (2026-07-06)
**Statut** : accepté (Marc, 2026-07-06).

**Contexte** : FinanceAI vise la qualité AAA d'un outil perso de retraite QC. Multi-utilisateurs / bêta
publique était un cap (VISION.md §2). Stockage privé (Google Drive) + auth Google in-app (2026-06-16)
débloquent le multi-appareil. Reste la **clé Anthropic** : exposée au navigateur (modèle solo) vs
proxy backend (multi-user, anti-abus). Une évaluation 2026-07-06 remet en question le multi-user.

**Décision** : **FinanceAI = app SOLO** (Marc remise le volet multi-utilisateurs public). Raison : une
app QC de retraite est un outil existentiel pour Marc ; faire de lui un produit grand public (+ bêta
de tests) retire du focus/risque sur la qualité AAA. Solution : **relais BYOK (Bring Your Own Key)
pour Claude** = proxy **Edge Vercel** (gratuit tier) qui relaie les appels Anthropic en **chiffrant le
token marcand à la clé de Marc (transitement sûr, pas d'exposition cloud)**. Token = secret Vercel
unique, antiabus par construction (l'appelant fournit sa clé). En solo, l'objection vie-privée du relais
tombe (serveur=Marc, données=Marc).

**Trade-offs** :
- ✅ **Gain** : zero clé client-side (inaccessible au navigateur), anti-abus, route unique pour l'IA.
- ⚠️ **Vision en direct** : Vision API ~13 Mo/requête > limites Edge (~10 Mo) → reste en direct pour l'instant (spike post-lancement).
- ⚠️ **Maintenance relais** : petit proxy à maintenir, mais code livré (Edge + middleware Vite).

**Alternatives rejetées** :
- (a) Multi-user public sans relais → risque clé client-side (phishing/malware cible clair).
- (b) Relais commercial (tierces clés) → hors-sujet pour un outil perso Marc.
- (c) Pas de relais (garder clé client) → acceptable seul, mais anti-pattern pour produit.

**Corollaire** : multi-appareil Marc + sync Drive MAINTENUS (`docs/VISION.md` principes #1+2) ;
gate Google in-app pour preuve de sync Drive (O3 Marc) ; multi-user grand public REMISÉ indefinitely.

---

## ADR-001 — Environnement d'agents de revue (2026-06-17)
**Statut** : accepté (Marc, 2026-06-17).

**Contexte** : dépôt solo React / Vite / TS, moteur fiscal money-critical, SDK Anthropic intégré. 9 agents
projet existants + ~184 globaux. Besoin d'un ensemble d'agents sans chevauchement, à **décision unique**
chacun, aligné sur le workflow plan-first.

**Décision** : flotte de **13 agents projet** (voir `docs/agents.md`) = 7 cœur (`architect`, `product-manager`,
`financial-integrity`, `security-privacy`, `code-reviewer`, `ai-reviewer`, `documentation-manager`) + 2
spécialistes money-critical gardés distincts (`projection-validator`, `silent-failure-hunter`) + 4 utilitaires
(`test-writer`, `performance-optimizer`, `a11y-auditor`, `code-analyzer`). Renommages :
`fiscal-accuracy` → `financial-integrity`, `security-reviewer` → `security-privacy`. Nouveaux : `ai-reviewer`,
`documentation-manager`, `architect`, `product-manager`. Modèles : **opus** (`financial-integrity`,
`projection-validator`), **haiku** (`documentation-manager`), **sonnet** (le reste). Commandes : `/new-feature`,
`/review-all` (enrichie : parallèle → trust-but-verify → GO/NO-GO), `/release-review`.

**Pourquoi** : la cible de 7 agents du cadrage initial n'était PAS un sur-ensemble des 9 agents existants ;
l'adopter telle quelle aurait supprimé des agents money-critical (`projection-validator`,
`silent-failure-hunter`, `test-writer`) sur lesquels repose la preuve AAA de l'audit du 2026-06-17. La
réconciliation garde la couverture money-critical tout en ajoutant le seul vrai manque (`ai-reviewer`, pour
les ~12 surfaces consommatrices du SDK).

**Trade-offs** : 13 agents > 7 (plus à entretenir), mitigé par la règle « les agents s'améliorent à chaque
push » et le routage par pertinence (on ne les lance jamais tous). `performance-optimizer` passé en on-demand
(la perf générale est absorbée par `code-reviewer`) pour réduire le chevauchement.

**Alternatives rejetées** :
- (a) remplacement strict par 7 → perte de couverture money-critical.
- (b) fusion de `projection-validator` dans `financial-integrity` → perte de la validation **systémique** des 12 invariants (la conservation de l'argent ≠ la justesse d'un calcul ponctuel).
- (c) injection de `FISCAL_REFERENCE.md` via un champ `skills` → **non supporté** par Claude Code (aucun agent, projet ou global, n'utilise un tel champ) ; l'agent `financial-integrity` LIT le doc au runtime, ce qui évite un snapshot périmé.
