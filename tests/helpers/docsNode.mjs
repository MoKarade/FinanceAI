// tests/helpers/docsNode.mjs
//
// Exécute la couche « documents protégés » (modeles/auto-merge/docsAjoutsSeulement.mjs et armer-docs.mjs) dans NODE, hors de Vite : ces
// modules importent le modèle Atelier (autoMerge.mjs), dont l'import dynamique de la surcouche facultative absente échoue sous Vite (voir
// tests/helpers/peutArmerNode.mjs). Entrée JSON sur stdin ; sortie JSON.
//   { mode: "docs", fichiers, listes, attestation? }   -> { code, decision, constantes }
//        attestation = { reviews, login, sha, userId? } : jugée par le VRAI `attestationValide` du modèle (jamais un substitut)
//   { mode: "armer", config, env, pr, fichiers, reviews } -> { resultat, appels, lignes }   (armerAvecDocs avec un `gh` de test)
import { readFileSync } from "node:fs";
import { attestationValide } from "../../modeles/auto-merge/autoMerge.mjs";
import { docsModifies, controleDocs, CODES, RAISON_DOC, PLAFOND_LIGNES_AJOUTEES } from "../../modeles/auto-merge/docsAjoutsSeulement.mjs";
import { armerAvecDocs } from "../../modeles/auto-merge/armer-docs.mjs";

const entree = JSON.parse(readFileSync(0, "utf8"));
const sortie = (o) => process.stdout.write(JSON.stringify(o));

if (entree.mode === "docs") {
  const a = entree.attestation;
  const attester = a ? () => attestationValide(a.reviews, { login: a.login, sha: a.sha, userId: a.userId }) : undefined;
  sortie({ code: docsModifies(entree.fichiers, entree.listes), decision: controleDocs(entree.fichiers, entree.listes, attester), constantes: { CODES, RAISON_DOC, PLAFOND_LIGNES_AJOUTEES } });
} else if (entree.mode === "armer") {
  const { config, env, pr, fichiers, reviews } = entree;
  const appels = [];
  const lignes = [];
  // `gh` de test : répond aux seules commandes que les deux armements émettent, note chacune, refuse tout le reste (échec fermé visible)
  const gh = (args) => {
    appels.push(args.join(" "));
    const [a, b] = args;
    if (a === "pr" && b === "view") return JSON.stringify(pr);
    if (a === "api" && args[2].endsWith("/files")) return fichiers.map((f) => JSON.stringify(f)).join("\n");
    if (a === "api" && args[2].endsWith("/reviews")) return (reviews ?? []).map((r) => JSON.stringify(r)).join("\n");
    if (a === "api") return "";                                                         // commentaires existants
    if (a === "pr" && ["merge", "edit", "comment"].includes(b)) return "";
    if (a === "label") return "";
    throw new Error(`commande inattendue : ${args.join(" ")}`);
  };
  let resultat, erreur = null;
  try { resultat = await armerAvecDocs({ gh, config, env, ecrire: (l) => lignes.push(l), attente: async () => {} }); } catch (e) { erreur = String(e.message); }
  sortie({ resultat, erreur, appels, lignes });
} else throw new Error("mode inconnu");
