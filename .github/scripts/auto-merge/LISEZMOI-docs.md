# Documents protégés : options `chemins_ajouts_seulement` et `chemins_contenu_surveille`

Module : `docsAjoutsSeulement.mjs` (décision pure, statique, aucun code de la PR exécuté). Appelé par `armer.mjs` **après**
`peutArmer`. Les deux options se placent dans `auto-merge.json` (lu sur la branche de base, jamais dans la PR) ; les noms sont
figés : ils seront portés tels quels dans le modèle de l'Atelier.

## Les deux options

| Option | Effet sur un fichier listé |
|---|---|
| `chemins_ajouts_seulement` | Règle **stricte** : aucune ligne existante ne change. Toute ligne supprimée ou réécrite est refusée. Pour les documents que les agents relisent comme des règles (leçons, conventions). |
| `chemins_contenu_surveille` | Mêmes contrôles sur les lignes **ajoutées**, mais supprimer ou réécrire une ligne est admis (cocher, archiver, corriger). Pour les journaux et l'état (backlog, handover, changelog). |

Valeur : liste de motifs glob (`**` traverse les dossiers, `*` non ; comparaison sans casse, séparateurs `/`). Option absente =
liste vide. Une valeur qui n'est pas une liste de textes fait échouer `armer.mjs` (échec fermé). Un fichier présent dans les deux
listes reste **strict**. Les deux listes vides : le module ne refuse rien (le reste de la décision est inchangé).

## Contrôles sur les lignes ajoutées (les deux options)

- URL : `http(s)://`, `ftp://`, `file://`, `javascript:`, `www.`.
- Commande exécutable : entre backticks (`curl`, `wget`, `iex`, `Invoke-*`, `rm`, `del`, `sh -c`, `bash -c`, `node -e`,
  `powershell`, `sudo`, `git push`…), dans un bloc de code ajouté, ou après `$` / `PS>`.
- Plafond : 200 lignes ajoutées par PR, tous fichiers listés confondus (`PLAFOND_LIGNES_AJOUTEES`).
- Fichier supprimé, renommé (depuis ou vers un fichier listé), ou diff absent (trop gros) : refusé.

## Codes de raison (fixes)

`docsModifies` renvoie un code, jamais un texte de la PR. `controleDocs` y ajoute la raison constante
`attestation de pole-securite requise (document surveillé)` (`RAISON_DOC`) ; le résumé du run affiche
`code=<code> ; <RAISON_DOC>`.

| Code | Cas |
|---|---|
| `doc_ligne_reecrite` | ligne existante supprimée ou réécrite (option stricte seulement) |
| `doc_url_ajoutee` | URL dans une ligne ajoutée |
| `doc_commande_ajoutee` | commande exécutable dans une ligne ajoutée |
| `doc_plafond` | plus de 200 lignes ajoutées |
| `doc_supprime` | fichier listé supprimé |
| `doc_renomme` | fichier listé renommé |
| `doc_diff_illisible` | patch absent (diff trop gros ou illisible) |
| `doc_liste_illisible` | liste des fichiers de la PR illisible |

## Attestation

Un refus est **attestable** comme un chemin sensible : `controleDocs(fichiers, listes, attester)` rend `null` si `attester()`
répond exactement `true` (revue de pole-securite sur le SHA exact). Vérificateur absent, exception ou autre valeur : refus
(échec fermé). Tant que `attestationValide` du modèle n'est pas dans la copie, `armer.mjs` passe `() => false`.

## Limites connues

Détecteur statique : une consigne en prose, sans URL ni commande, passe (d'où la revue hebdomadaire, ADR 0024). Un bloc de code
dont l'ouverture est dans le contexte non modifié n'est pas reconnu comme bloc ; ses lignes restent soumises aux règles URL et
commande entre backticks.
