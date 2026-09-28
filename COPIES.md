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
| .github/workflows/armement-auto-merge.yml | 455d424b79b2b4d102cf07fccf3a6bb226d5c4c06b6f1bdbc81c8dc76109b32c | 1.9.1 |
| modeles/auto-merge/LISEZMOI.md | 8a245763655ca36978ce4f579a9ebcd19b4bac089351dff4fd1889eba566718c | 1.9.1 |

## Source et méthode

- Kit d'auto-merge de l'Atelier **1.9.1**, tag git **`kit-1.9.1`** (commit `df55f4c`), resynchronisé depuis **1.9.0** (tag `kit-1.9.0`, commit `a17b41d`) : seuls `verifier-copies.mjs` et `LISEZMOI.md` ont changé côté modèle (2 des 10 empreintes ci-dessus) ; les 8 autres sont identiques depuis la mise en place 1.9.0. Empreintes lues dans `git show kit-1.9.1:modeles/manifeste.json` ; `verifier-copies.mjs . --manifeste …` : les 10 fichiers ci-dessus sont `OK` contre 1.9.1.
- Ce tableau est produit avec la fonction `formaterCopies` du kit, sur ces 10 fichiers seulement : `--ecrire-copies` refuse d'écrire tant que les 6 fichiers « hors lot » (écart 1) diffèrent ou manquent (comportement voulu : jamais d'attestation d'une copie infidèle). Il remplace celui de la version 1.6.0 (commit `f8e2177`).
- **Profils (nouveau en 1.9.1)** : le kit expose désormais `--profil prive` (dépôt privé sans protection de branche : retire `.github/workflows/armement-auto-merge.yml`, `fusionner.mjs` fusionne sans lui). FinanceAI reste au profil **`complet`** par défaut (armement natif conservé, voir écart 5) : ce lot ne l'adopte pas.

## Écarts FinanceAI (déclarés un à un)

1. **Hors lot, non copiés** (donc `verifier-copies.mjs .` signale 6 écarts, attendus) : `scripts/hooks/commit-gate.mjs` et `scripts/hooks/lib/analyseCommande.mjs` (DIFFÉRENTS du kit, volontairement : durcissements FinanceAI #1070, #1071, GATE-SCAN-GUARDS ; resynchronisation à part) ; `.github/workflows/ci-reutilisable.yml`, `.github/ci/voie-rapide.mjs`, `.github/ci/verifier-longueur.mjs`, `.github/ci/generer-index.mjs` (gabarits de CI communs, non adoptés).
2. **`chemins-interdits-base.json` : copie EXACTE**, aucune adaptation ; pas de surcouche `chemins-interdits-atelier.json` (Atelier seulement, jamais copiée).
3. **`.github/auto-merge.json` (adapté, jamais comparé)** : `controles_requis` = les 6 contrôles de la protection de `main` ; `chemins_interdits` = `**/.env*`, `**/*.pem` et **`passerelle/tunnel.yml`** (config du tunnel qui expose le MCP : NON attestable) ; `chemins_label_validation` = `api/**`, `mcp/**`, `services/secureKeyStore.ts`, `vite.config.ts`, `index.html`, `vercel.json` et **`**/settings*.json`** (la base ne connaît que `settings.json` et `.claude/settings*` ; attestable) ; **`carence_dependabot_jours` = 3** (décision de Marc : Dependabot re-fusionné automatiquement après 3 jours) ; `branche_base` = `main`.
4. **Attestation de pole-securite : non configurée.** `securite_login` et `securite_user_id` sont ABSENTS : aucune attestation n'est possible, les chemins sensibles restent bloqués (échec fermé). L'App d'attestation existe côté Atelier ; pole-securite ouvrira ensuite une PR de 2 lignes (login `<slug>[bot]` ET identifiant numérique, obligatoire pour une App). `validation-marc` est informatif (comportement du kit).
5. **Workflow d'armement** : `.github/workflows/armement-auto-merge.yml` = `gabarit-armement.yml` copié tel quel (dans le tableau). Le kit 1.9.0 laisse Dependabot au workflow de fusion : l'armement ne l'arme pas.
6. **Workflow de fusion événementielle ADAPTÉ de DEUX valeurs** : `.github/workflows/auto-merge.yml` = `gabarit-auto-merge-evenementiel.yml` (SHA-256 du kit `545bab9e1f29574a62480c948a3df1ca85e98615af657c0440087b73bd5a42d1`), avec (a) `workflows: [ci]` remplacé par `workflows: [CI]` (le workflow de FinanceAI s'appelle `CI` ; GitHub est sensible à la casse) et (b) `node-version: "24"` remplacé par `node-version-file: '.nvmrc'` (garde `tests/nodeVersionDeclared.test.ts` : la version de Node est déclarée UNE fois, dans `.nvmrc` = 24) ; SHA-256 ici `b6b0373b279e2643ff52b00c26b5533186a31a2ae6730424e39fed0a9d8f7c13`.  Hors du tableau (n'est plus identique). Rien d'autre n'est modifié : runner GitHub-hosted (dépôt PUBLIC : ne jamais définir `AUTOMERGE_RUNNER`), arrêt d'urgence `AUTOMERGE_OFF`.
7. **ESLint** : les 7 copies exécutables du kit sont ignorées dans `eslint.config.js` par une liste NOMINATIVE (pas le glob) ; copies à empreinte épinglée : les retoucher (même pour le lint) casserait l'attestation ci-dessus. (La config lint ne cible d'ailleurs que `**/*.{ts,tsx}` : les `.mjs` n'y sont pas analysés.)
8. **Non copiés** : `gabarit-appelant.yml`, `ignore-command.mjs`, `couts/*`, `docs/correspondance.md`, `claude-md/CLAUDE.md` (gabarits d'autres lots), `GRILLE-RELECTURE.md`, dossier `tests/` du kit (`node --test`), `auto-merge.json` d'exemple.
9. **`.github/dependabot.yml`** : seul le commentaire d'en-tête change (Dependabot est fusionné par `auto-merge.yml`).
