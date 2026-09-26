# Copies du modèle auto-merge (Atelier)

Généré par `node modeles/auto-merge/verifier-copies.mjs --ecrire-copies .` : ne pas modifier à la main. Chaque ligne atteste qu'une copie était FIDÈLE au modèle à la version indiquée ;
`node modeles/auto-merge/verifier-copies.mjs .` la revérifie contre le manifeste de l'Atelier.

| chemin | sha256 (fins de ligne LF) | version du modèle |
|---|---|---|
| modeles/auto-merge/autoMerge.mjs | 3af622aef81fc51b34d3c961f52a2db71fa241e99c385d29186a572aa09ec06d | 1.6.0 |
| modeles/auto-merge/autoMerge.d.mts | f8cd284186d1d51da4bc05fcf6b5b276228eb32e8ea6c26c658e5924d7e9f7b7 | 1.6.0 |
| modeles/auto-merge/chemins-interdits-base.json | ee2b611dc507134eb36f297f48f6e06dff02f1ab75b5295502f12ea94eff9327 | 1.6.0 |
| modeles/auto-merge/fusionner.mjs | 8b8e2d76907980b0a5c532e6b5b5c759ea781bbe3c8fdab96b17e9771622e491 | 1.6.0 |
| modeles/auto-merge/armer.mjs | 46119ae1f787807bde310df46971f4d8f6c0633823f67c6e67892d16bc9e2902 | 1.6.0 |
| modeles/auto-merge/verifier-copies.mjs | 2dca497376b6fd1bc8ce1d2bcc93ccb0154a400bb8fdcd9f425d8f330d408ff3 | 1.6.0 |
| modeles/auto-merge/surblocage.mjs | dff24d5293c6fec61566e914343b325b81e4daad14f2ededcc20806b86e3fcc5 | 1.6.0 |
| .github/workflows/armement-auto-merge.yml | 455d424b79b2b4d102cf07fccf3a6bb226d5c4c06b6f1bdbc81c8dc76109b32c | 1.6.0 |
| modeles/auto-merge/LISEZMOI.md | 989b2f25713e0575cf4736b867512a090a9de3e2d7df0e709b7c09f0846d8523 | 1.6.0 |

## Source et méthode

- Modèle **1.6.0**, commit `f8e2177` du dépôt atelier (PR atelier#39), extrait par `git archive` dans un dossier temporaire ; contrôlé contre `modeles/manifeste.json` de ce commit (`verifier-copies.mjs . --manifeste …` : les 9 fichiers ci-dessus sont `OK`).
- Ce tableau est produit avec la fonction `formaterCopies` du modèle, sur ces 9 fichiers seulement : `--ecrire-copies` refuse d'écrire tant que les 6 fichiers « hors lot » ci-dessous diffèrent ou manquent (comportement voulu du modèle : jamais d'attestation d'une copie infidèle). Une resynchronisation complète (version 1.7.1 + commit-gate) remplacera cette section.

## Écarts FinanceAI (déclarés un à un)

0. **Couverture de l'ancienne liste fixe** (`.github/scripts/auto-merge/chemins-interdits.json` de 894324cd, 17 motifs) par base ∪ config : chacun reste couvert, un test (`tests/blocageFusion.test.ts`, « aucun chemin de l'ancienne liste fixe ne perd sa protection ») échoue sinon. Deux motifs changent de catégorie : `passerelle/tunnel.yml` (config, non attestable) et `**/settings*.json` (`chemins_label_validation`, attestable). Ajoutés par la base : `CLAUDE.md`, `AGENTS.md`, `**/analyseCommande*`, `.claude/settings*`, `**/settings.json`.
1. **Hors lot, non copiés** (donc `verifier-copies.mjs .` signale 6 écarts, attendus) :
   - `scripts/hooks/commit-gate.mjs` et `scripts/hooks/lib/analyseCommande.mjs` : DIFFÉRENTS du modèle, volontairement. Ils portent les durcissements FinanceAI (#1070, #1071, GATE-SCAN-GUARDS) ; resynchronisation à part, après publication de la version commune.
   - `.github/workflows/ci-reutilisable.yml`, `.github/ci/voie-rapide.mjs`, `.github/ci/verifier-longueur.mjs`, `.github/ci/generer-index.mjs` : gabarits de CI communs (atelier#39), non adoptés dans ce lot.
2. **`chemins-interdits-base.json` : copie EXACTE**, aucune adaptation (la base 1.6.0 est étroite : `hooks/` et `components/settings/` n'y sont pas). Pas de surcouche `chemins-interdits-atelier.json` (Atelier seulement, jamais copiée).
3. **`.github/auto-merge.json` (adapté, jamais comparé)** : `controles_requis` = les 6 contrôles de la protection de `main` de FinanceAI ; `chemins_interdits` = `**/.env*`, `**/*.pem` et **`passerelle/tunnel.yml`** (écart nominal : config du tunnel qui expose le MCP FinanceAI ; la base 1.6.0 ne l'a pas, il était dans l'ancienne liste fixe ; placé en `chemins_interdits` = NON attestable, le plus sûr) ; `chemins_label_validation` = `api/**`, `mcp/**`, `services/secureKeyStore.ts`, `vite.config.ts`, `index.html`, `vercel.json` **et `**/settings*.json`** (écart nominal : la base ne connaît que `settings.json` et `.claude/settings*` ; les fichiers `settings.local.json`, `settings.prod.json`… restent hors auto-fusion ; placés ici plutôt que dans `chemins_interdits` pour rester attestables) ; `carence_dependabot_jours` = 0 ; `branche_base` = `main`.
4. **Attestation de pole-securite : non configurée.** `securite_login` et `securite_user_id` sont ABSENTS : aucune attestation n'est possible, les chemins sensibles restent bloqués (échec fermé). `validation-marc` est informatif (comportement du modèle), pas bloquant. Pas de `chemins_attestables`, pas de `frein_fusions_par_heure`.
5. **Workflow** : `.github/workflows/armement-auto-merge.yml` = gabarit copié tel quel (`gabarit-armement.yml`) ; l'ancien `.github/workflows/fusion-auto.yml` et l'ancien dossier `.github/scripts/auto-merge/` (armer BatchChef adapté, `chemins-interdits.json` adapté, `COPIES.md` local) sont SUPPRIMÉS : un seul emplacement, `modeles/auto-merge/`.
6. **ESLint** : `modeles/auto-merge/**` est ignoré dans `eslint.config.js` (copies à empreinte épinglée, jamais retouchées : la copie 1.6.0 contient une directive `eslint-disable no-control-regex` que la 1.7.1 retire).
7. **Non copiés** : `codes-raison.mjs` (gabarit, absent de la 1.6.0 copiable), `gabarit-auto-merge-evenementiel.yml`, dossier `tests/` du modèle (`node --test`), `GRILLE-RELECTURE.md`, `auto-merge.json` d'exemple.
