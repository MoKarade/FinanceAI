# Copies du modèle auto-merge (Atelier)

Profil : complet

Généré par `node modeles/auto-merge/verifier-copies.mjs --ecrire-copies .` : ne pas modifier à la main. Chaque ligne atteste qu'une copie était FIDÈLE au modèle à la version indiquée ;
`node modeles/auto-merge/verifier-copies.mjs .` la revérifie contre le manifeste de l'Atelier.

| chemin | sha256 (fins de ligne LF) | version du modèle |
|---|---|---|
| modeles/auto-merge/autoMerge.mjs | 49a15a70311a89341baeb90600eae2efb16c717be6efef29ce717a82e7384ee5 | 1.9.1 |
| modeles/auto-merge/autoMerge.d.mts | f8cd284186d1d51da4bc05fcf6b5b276228eb32e8ea6c26c658e5924d7e9f7b7 | 1.9.1 |
| modeles/auto-merge/chemins-interdits-base.json | ee2b611dc507134eb36f297f48f6e06dff02f1ab75b5295502f12ea94eff9327 | 1.9.1 |
| modeles/auto-merge/fusionner.mjs | 5fff63540802fe9f15afc26b68004d3ff978ff7425eb6fb7e9bcbc91c3bd2186 | 1.9.1 |
| modeles/auto-merge/armer.mjs | 46119ae1f787807bde310df46971f4d8f6c0633823f67c6e67892d16bc9e2902 | 1.9.1 |
| modeles/auto-merge/codes-raison.mjs | 4ec6274146cb00cf038691ccdaa53417f557992a55e9ad1fbf8267ddffbe16c6 | 1.9.1 |
| modeles/auto-merge/verifier-copies.mjs | f4344c70efbb59abf8ac8adbe3c66a2a05984860a9e5ada42b2d24d8f9e1ee85 | 1.9.1 |
| modeles/auto-merge/surblocage.mjs | dff24d5293c6fec61566e914343b325b81e4daad14f2ededcc20806b86e3fcc5 | 1.9.1 |
| modeles/auto-merge/LISEZMOI.md | 8a245763655ca36978ce4f579a9ebcd19b4bac089351dff4fd1889eba566718c | 1.9.1 |

`.github/workflows/armement-auto-merge.yml` est sorti de ce tableau depuis `[DOCS-PROTECTION]` (2026-09-28, PR docs-protection-v3) : il est
ADAPTÉ d'une ligne (couche « documents protégés »), donc plus une copie exacte. Voir écart 5.

## Source et méthode

- Kit d'auto-merge de l'Atelier **1.9.1**, tag git **`kit-1.9.1`** (commit `df55f4c`), resynchronisé depuis **1.9.0** (tag `kit-1.9.0`, commit `a17b41d`) : à la resynchro, seuls `verifier-copies.mjs` et `LISEZMOI.md` avaient changé côté modèle (`node modeles/auto-merge/verifier-copies.mjs . --manifeste …` : 10 fichiers `OK` contre 1.9.1, y compris `armement-auto-merge.yml` alors copié tel quel). Depuis `[DOCS-PROTECTION]` (2026-09-28), `armement-auto-merge.yml` est ADAPTÉ (écart 5) et sort du tableau : **9 fichiers** y restent, tous en 1.9.1.
- Ce tableau est produit avec la fonction `formaterCopies` du kit, sur ces 9 fichiers (plus `armement-auto-merge.yml`, adapté, déclaré à part) : `--ecrire-copies` refuse d'écrire tant que les 6 fichiers « hors lot » (écart 1) diffèrent ou manquent (comportement voulu : jamais d'attestation d'une copie infidèle). Il remplace celui de la version 1.6.0 (commit `f8e2177`).
- **Profils (nouveau en 1.9.1)** : le kit expose désormais `--profil prive` (dépôt privé sans protection de branche : retire `.github/workflows/armement-auto-merge.yml`, `fusionner.mjs` fusionne sans lui). FinanceAI reste au profil **`complet`** par défaut (armement natif conservé, voir écart 5) : ce lot ne l'adopte pas.

## Écarts FinanceAI (déclarés un à un)

1. **Hors lot, non copiés** (donc `verifier-copies.mjs .` signale 6 écarts, attendus) : `scripts/hooks/commit-gate.mjs` et `scripts/hooks/lib/analyseCommande.mjs` (DIFFÉRENTS du kit, volontairement : durcissements FinanceAI #1070, #1071, GATE-SCAN-GUARDS ; resynchronisation à part) ; `.github/workflows/ci-reutilisable.yml`, `.github/ci/voie-rapide.mjs`, `.github/ci/verifier-longueur.mjs`, `.github/ci/generer-index.mjs` (gabarits de CI communs, non adoptés).
2. **`chemins-interdits-base.json` : copie EXACTE**, aucune adaptation ; pas de surcouche `chemins-interdits-atelier.json` (Atelier seulement, jamais copiée).
3. **`.github/auto-merge.json` (adapté, jamais comparé)** : `controles_requis` = les 6 contrôles de la protection de `main` ; `chemins_interdits` = `**/.env*`, `**/*.pem` et **`passerelle/tunnel.yml`** (config du tunnel qui expose le MCP : NON attestable) ; `chemins_label_validation` = `api/**`, `mcp/**`, `services/secureKeyStore.ts`, `vite.config.ts`, `index.html`, `vercel.json` et **`**/settings*.json`** (la base ne connaît que `settings.json` et `.claude/settings*` ; attestable) ; **`carence_dependabot_jours` = 3** (décision de Marc : Dependabot re-fusionné automatiquement après 3 jours) ; `branche_base` = `main`.
4. **Attestation de pole-securite : CONFIGURÉE** (`ci: configure l'attestation de pole-securite`, PR #1086, fusionnée le 2026-09-27). `securite_login` = `atelier-securite-marc[bot]`, `securite_user_id` = `334232309` (App GitHub dédiée, revues `user.type === "Bot"`). Les chemins sensibles et les documents protégés (écart 10) sont donc réellement attestables (revue APPROVED sur le SHA exact de la PR), plus seulement bloqués par défaut. `validation-marc` reste informatif (comportement du kit).
5. **Workflow d'armement ADAPTÉ d'UNE ligne** (`[DOCS-PROTECTION]`, 2026-09-28) : `.github/workflows/armement-auto-merge.yml` = `gabarit-armement.yml` du kit (SHA-256 `455d424b79b2b4d102cf07fccf3a6bb226d5c4c06b6f1bdbc81c8dc76109b32c`, INCHANGÉ), avec `run: node modeles/auto-merge/armer.mjs` remplacé par `run: node modeles/auto-merge/armer-docs.mjs` (couche « documents protégés », ADR 0024, AVANT l'`armer.mjs` du modèle qui reste une copie exacte intacte — les deux doivent dire oui). SHA-256 adapté : `49b3e0aae1054bf0268e9012911bfae806567fa2c4b761b697c7fa0446f5fd72`. Rien d'autre n'est modifié. Sorti du tableau ci-dessus (n'est plus une copie exacte) ; un test vérifie que la SEULE différence avec le gabarit est cette ligne.
6. **Workflow de fusion événementielle ADAPTÉ de DEUX valeurs** : `.github/workflows/auto-merge.yml` = `gabarit-auto-merge-evenementiel.yml` (SHA-256 du kit `545bab9e1f29574a62480c948a3df1ca85e98615af657c0440087b73bd5a42d1`), avec (a) `workflows: [ci]` remplacé par `workflows: [CI]` (le workflow de FinanceAI s'appelle `CI` ; GitHub est sensible à la casse) et (b) `node-version: "24"` remplacé par `node-version-file: '.nvmrc'` (garde `tests/nodeVersionDeclared.test.ts` : la version de Node est déclarée UNE fois, dans `.nvmrc` = 24) ; SHA-256 ici `b6b0373b279e2643ff52b00c26b5533186a31a2ae6730424e39fed0a9d8f7c13`.  Hors du tableau (n'est plus identique). Rien d'autre n'est modifié : runner GitHub-hosted (dépôt PUBLIC : ne jamais définir `AUTOMERGE_RUNNER`), arrêt d'urgence `AUTOMERGE_OFF`.
7. **ESLint** : les 7 copies exécutables du kit sont ignorées dans `eslint.config.js` par une liste NOMINATIVE (pas le glob) ; copies à empreinte épinglée : les retoucher (même pour le lint) casserait l'attestation ci-dessus. Depuis `[DOCS-PROTECTION]`, un second bloc de la config LINT explicitement `armer-docs.mjs`, `docsAjoutsSeulement.mjs` et `tests/helpers/*.mjs` (fichiers PROPRES à FinanceAI, hors modèle, pas d'empreinte épinglée) : règles sobres (`no-undef`, `no-var` en erreur ; le reste en avertissement).
8. **Non copiés** : `gabarit-appelant.yml`, `ignore-command.mjs`, `couts/*`, `docs/correspondance.md`, `claude-md/CLAUDE.md` (gabarits d'autres lots), `GRILLE-RELECTURE.md`, dossier `tests/` du kit (`node --test`), `auto-merge.json` d'exemple.
9. **`.github/dependabot.yml`** : seul le commentaire d'en-tête change (Dependabot est fusionné par `auto-merge.yml`).
10. **Couche « documents protégés » (ADR 0024, hors modèle Atelier, pas dans le tableau)** : `modeles/auto-merge/armer-docs.mjs` (point d'entrée du workflow adapté, écart 5), `modeles/auto-merge/docsAjoutsSeulement.mjs` (décision pure et statique) et `modeles/auto-merge/LISEZMOI-docs.md` sont propres à FinanceAI, jamais comparés au manifeste de l'Atelier. Configuration : `.github/auto-merge.json` ajoute `chemins_ajouts_seulement` (`docs/claude/lecons.md`, `docs/CONVENTIONS.md` — ligne existante jamais réécrite) et `chemins_contenu_surveille` (`BACKLOG.md`, `HANDOVER.md`, `CHANGELOG.md` — cocher/archiver admis) ; `chemins_label_validation` (écart 3) reçoit `CLAUDE.md` et les 13 `docs/claude/*.md` sauf `lecons.md`. À retirer dès qu'atelier-chef porte cette couche au modèle commun (vérifier avant : le lot pourrait déjà être publié).
