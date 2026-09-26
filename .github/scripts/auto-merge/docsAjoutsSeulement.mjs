// docsAjoutsSeulement.mjs — les documents que les agents relisent au démarrage ne se réécrivent pas en silence.
//
// Risque visé : injection PERSISTANTE. Une « leçon » (ou une ligne de HANDOVER) écrite par un agent piégé est relue puis appliquée par
// tous les suivants. Les documents listés dans `chemins_ajouts_seulement` (auto-merge.json, lu sur main) n'admettent donc, sans validation
// de Marc, que des lignes AJOUTÉES saines. Décision PURE et STATIQUE sur le patch fourni par l'API GitHub : aucun code n'est exécuté.
//
// Refus (raison lisible, une ligne) si, sur un fichier listé :
//   - il est supprimé, renommé, ou son patch est absent (diff trop gros / illisible) ;
//   - une ligne existante est supprimée ou réécrite (toute ligne « - » du patch) ;
//   - une ligne AJOUTÉE contient une URL (http(s)://, ftp://, file://, javascript:, www.) ;
//   - une ligne AJOUTÉE porte une commande exécutable : entre backticks, ou dans un bloc de code ajouté (``` … ```), ou après « $ » / « PS> » ;
//   - le total des lignes ajoutées, tous fichiers listés confondus, dépasse PLAFOND_LIGNES_AJOUTEES.
// Limite connue : un bloc de code dont l'ouverture est dans le contexte (non modifié) n'est pas vu comme bloc ; ses lignes restent soumises
// aux règles URL et backticks.
// Ce module ne peut que DURCIR : aucune configuration ne l'assouplit (un fichier listé est toujours examiné).

import { normaliser, correspond } from "./autoMerge.mjs";

export const PLAFOND_LIGNES_AJOUTEES = 200;

/** Commandes et interpréteurs dont la présence dans du code ajouté exige un humain. */
const COMMANDE = /(?:^|[\s;&|(])(?:curl|wget|iex|invoke-\w+|rm|del|rmdir|sh|bash|zsh|node|python3?|powershell|pwsh|cmd|eval|exec|sudo|chmod|nc|ssh|scp|git\s+(?:push|reset|rm|clean))(?=$|[\s;&|)])/i;
const COMMANDE_AVEC_OPTION = /(?:sh|bash|zsh|cmd)\s+-c\b|node\s+-e\b|invoke-\w+|powershell|pwsh/i;
const URL = /(?:https?|ftp|file):\/\/|javascript:|\bwww\./i;

const court = (t) => String(t).replace(/[\u0000-\u001f\u007f`]+/g, " ").slice(0, 120);

/** Une ligne ajoutée porte-t-elle une commande dans un span entre backticks ? */
function commandeEntreBackticks(ligne) {
  for (const m of ligne.matchAll(/`([^`]+)`/g)) {
    if (COMMANDE.test(m[1]) || COMMANDE_AVEC_OPTION.test(m[1])) return true;
  }
  return false;
}

/**
 * @param {(string|object)[]} fichiers  fichiers de la PR : {path, previous_filename, status, patch}
 * @param {string[]} motifs  `chemins_ajouts_seulement` (motifs glob)
 * @returns {string|null} raison du refus, ou null si tout est admis
 */
export function docsModifies(fichiers, motifs) {
  if (!Array.isArray(motifs) || motifs.length === 0) return null;
  if (!Array.isArray(fichiers)) return "liste des fichiers illisible";
  let ajoutees = 0;
  for (const f of fichiers) {
    if (!f || typeof f !== "object") continue;
    const chemin = normaliser(f.path ?? f.filename);
    const avant = f.previous_filename === undefined || f.previous_filename === null ? null : normaliser(f.previous_filename);
    const vise = (c) => c !== null && correspond(c, motifs);
    if (!vise(chemin) && !vise(avant)) continue;
    const nom = court(vise(chemin) ? (f.path ?? f.filename) : f.previous_filename);
    if (f.status === "removed") return `document protégé supprimé (${nom}) : validation de Marc requise`;
    if (f.status === "renamed") return `document protégé renommé (${nom}) : validation de Marc requise`;
    if (typeof f.patch !== "string") return `diff du document protégé illisible (${nom}) : validation de Marc requise`;
    let dansBloc = false;
    for (const brute of f.patch.split("\n")) {
      const ligneBrute = brute.replace(/\r$/, "");
      // Le patch de l'API GitHub commence à « @@ » : il n'a PAS d'en-têtes `---` / `+++`. Une ligne supprimée dont le texte commence par
      // « -- » (séparateur de tableau markdown…) s'écrit donc « --- » et doit compter comme suppression.
      if (ligneBrute.startsWith("@@") || ligneBrute.startsWith("\\")) continue;
      const signe = ligneBrute[0];
      if (signe === "-") return `ligne supprimée ou réécrite dans ${nom} : ajouts seulement, validation de Marc requise`;
      if (signe !== "+") continue;
      const ligne = ligneBrute.slice(1);
      ajoutees++;
      if (URL.test(ligne)) return `URL ajoutée dans ${nom} : validation de Marc requise`;
      if (/^\s*(?:```|~~~)/.test(ligne)) { dansBloc = !dansBloc; continue; }
      const enCommande = commandeEntreBackticks(ligne)
        || (/^\s*(?:\$|PS>)\s+\S/.test(ligne) && (COMMANDE.test(ligne) || COMMANDE_AVEC_OPTION.test(ligne)))
        || (dansBloc && (COMMANDE.test(ligne) || COMMANDE_AVEC_OPTION.test(ligne)));
      if (enCommande) {
        return `commande exécutable ajoutée dans ${nom} : validation de Marc requise`;
      }
    }
  }
  if (ajoutees > PLAFOND_LIGNES_AJOUTEES) return `${ajoutees} lignes ajoutées aux documents protégés (plafond ${PLAFOND_LIGNES_AJOUTEES}) : validation de Marc requise`;
  return null;
}
