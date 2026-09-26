# Copies de modèles contenues dans cette PR (liste jointe pour le contrôle de copie identique)

Source de vérité : dépôt Atelier, `modeles/auto-merge/`. Empreinte = SHA-256 du contenu en fins de ligne LF.

| Fichier copié (ici) | Source | Statut | SHA-256 |
|---|---|---|---|
| `autoMerge.mjs` | atelier/modeles/auto-merge/autoMerge.mjs | EXACTE (identique à la copie de BatchChef #128) | `98369e876b65fa5ce9b6f24714d37dc7c279a7164cbce80715d95cc78cdac88d` |
| `autoMerge.d.mts` | atelier/modeles/auto-merge/autoMerge.d.mts | EXACTE | `ba4146299c6c7413200139d5aaaeadf37d16061cb7c600d803ba67c5636b5065` |
| `chemins-interdits.json` | atelier/modeles/auto-merge/chemins-interdits.json | ADAPTÉE : entrées cockpit/* retirées ; hooks/**, **/hooks/**, **/settings*, **/settings*/** remplacées par **/settings.json et **/settings.local.json (hooks React et écran Réglages de l'app) | `503e569541971d992dcac75191ca806792942ab459c4e6929854e0e0d408df22` |
| `armer.mjs` | batchchef .github/scripts/auto-merge/armer.mjs (PR #128, relue par pole-securite) | ADAPTÉE : retrait du contrôle propre à BatchChef (scriptsBuild) | `61dff67880a5eabd4ad5a6809de2afbc8d02d6ad528a477c7fb51f9d94cc3a2c` |

Non copiés du modèle : `fusionner.mjs` (exécuteur de fusion de l'Atelier, non utilisé : FinanceAI fusionne par l'auto-fusion native de GitHub une fois armée), `auto-merge.json` du modèle (remplacé par `.github/auto-merge.json`, propre à FinanceAI, lu sur `main`), tests du modèle (remplacés par `tests/blocageFusion.test.ts`).
