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

/** Codes de refus : FIXES, jamais un texte de la PR (chemin, ligne, message) — ils finissent dans le résumé du run et dans un commentaire. */
export const CODES = Object.freeze({
  listeIllisible: "doc_liste_illisible",
  supprime: "doc_supprime",
  renomme: "doc_renomme",
  diffIllisible: "doc_diff_illisible",
  ligneReecrite: "doc_ligne_reecrite",
  urlAjoutee: "doc_url_ajoutee",
  commandeAjoutee: "doc_commande_ajoutee",
  plafond: "doc_plafond",
});
/** Raison affichée, IDENTIQUE pour tous les refus (le détail est dans le code) : elle ne cite rien de la PR. */
export const RAISON_DOC = "attestation de pole-securite requise (document surveillé)";

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
 * @param {{ajoutsSeulement?: string[], contenuSurveille?: string[]}} listes
 *   `chemins_ajouts_seulement` : règle stricte, aucune ligne existante ne change (leçons, CONVENTIONS) ;
 *   `chemins_contenu_surveille` : mêmes contrôles sur les lignes AJOUTÉES (URL, commande, plafond), mais supprimer ou réécrire une ligne est
 *   admis (cocher / archiver un item de BACKLOG, journaux datés)
 * @returns {string|null} code de refus (voir CODES), ou null si tout est admis
 */
export function docsModifies(fichiers, listes) {
  const strict = listes && Array.isArray(listes.ajoutsSeulement) ? listes.ajoutsSeulement : [];
  const surveille = listes && Array.isArray(listes.contenuSurveille) ? listes.contenuSurveille : [];
  if (strict.length === 0 && surveille.length === 0) return null;
  if (!Array.isArray(fichiers)) return CODES.listeIllisible;
  let ajoutees = 0;
  for (const f of fichiers) {
    if (!f || typeof f !== "object") continue;
    const chemin = normaliser(f.path ?? f.filename);
    const avant = f.previous_filename === undefined || f.previous_filename === null ? null : normaliser(f.previous_filename);
    const vise = (c) => c !== null && correspond(c, [...strict, ...surveille]);
    if (!vise(chemin) && !vise(avant)) continue;
    // un fichier de la liste STRICTE (sous son nom actuel ou l'ancien) reste strict, même s'il est aussi listé comme surveillé
    const ajoutsSeulement = (chemin !== null && correspond(chemin, strict)) || (avant !== null && correspond(avant, strict));
    if (f.status === "removed") return CODES.supprime;
    if (f.status === "renamed") return CODES.renomme;
    if (typeof f.patch !== "string") return CODES.diffIllisible;
    let dansBloc = false;
    for (const brute of f.patch.split("\n")) {
      const ligneBrute = brute.replace(/\r$/, "");
      // Le patch de l'API GitHub commence à « @@ » : il n'a PAS d'en-têtes `---` / `+++`. Une ligne supprimée dont le texte commence par
      // « -- » (séparateur de tableau markdown…) s'écrit donc « --- » et doit compter comme suppression.
      if (ligneBrute.startsWith("@@") || ligneBrute.startsWith("\\")) continue;
      const signe = ligneBrute[0];
      if (signe === "-") {
        if (!ajoutsSeulement) continue;   // document surveillé : cocher / archiver / corriger une ligne passe seul
        return CODES.ligneReecrite;
      }
      if (signe !== "+") continue;
      const ligne = ligneBrute.slice(1);
      ajoutees++;
      if (URL.test(ligne)) return CODES.urlAjoutee;
      if (/^\s*(?:```|~~~)/.test(ligne)) { dansBloc = !dansBloc; continue; }
      const enCommande = commandeEntreBackticks(ligne)
        || (/^\s*(?:\$|PS>)\s+\S/.test(ligne) && (COMMANDE.test(ligne) || COMMANDE_AVEC_OPTION.test(ligne)))
        || (dansBloc && (COMMANDE.test(ligne) || COMMANDE_AVEC_OPTION.test(ligne)));
      if (enCommande) {
        return CODES.commandeAjoutee;
      }
    }
  }
  if (ajoutees > PLAFOND_LIGNES_AJOUTEES) return CODES.plafond;
  return null;
}

/**
 * Décision complète : un refus de `docsModifies` est ATTESTABLE, comme un chemin sensible. `attester` est fourni par l'appelant : une fonction
 * qui répond vrai SEULEMENT si pole-securite a attesté CE commit (login/identifiant du compte dédié, SHA exact de la PR, revue APPROVED) ;
 * absente ou non fonctionnelle = aucune attestation possible (échec fermé). Ce module ne juge pas l'attestation, il ne fait que la demander.
 * @returns {null | {code: string, raison: string}}  null = rien à redire (ou attestation valide)
 */
export function controleDocs(fichiers, listes, attester) {
  const code = docsModifies(fichiers, listes);
  if (code === null) return null;
  let attestee = false;
  try { attestee = typeof attester === "function" && attester() === true; } catch { attestee = false; }
  return attestee ? null : { code, raison: RAISON_DOC };
}
