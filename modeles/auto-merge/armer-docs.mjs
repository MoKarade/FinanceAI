// armer-docs.mjs — POINT D'ENTRÉE de l'armement chez FinanceAI : la couche « documents protégés » (docsAjoutsSeulement.mjs) PUIS l'armement du modèle.
//
// Pourquoi un point d'entrée à part : modeles/auto-merge/armer.mjs est une copie EXACTE du modèle Atelier (empreinte épinglée dans COPIES.md) ; il
// appelle `peutArmer` en interne et n'offre aucun crochet pour une règle de l'app. Cette couche s'exécute donc AVANT lui, sur la même liste de
// fichiers de la PR, et le modèle reste intact. Les DEUX doivent dire oui pour armer : ici un refus désarme et s'arrête ; sinon on passe la main
// à `armer` du modèle (qui applique peutArmer, les revues, le brouillon, etc.).
//
// Un refus de document est ATTESTABLE comme un chemin sensible : `attestationValide` du modèle (compte dédié `securite_login`, SHA EXACT de la PR,
// revue APPROVED). Sans `securite_login` (cas actuel) : aucune attestation possible, le refus tient (échec fermé).
// Résumé du run : ligne FIXE « code=<code> ; <raison constante> », jamais un texte de la PR.
//
// Lancé par .github/workflows/armement-auto-merge.yml (base de la PR, jamais son code). Mêmes variables que armer.mjs : REPO, NUMERO, SHA, ACTION, AUTOMERGE_OFF.
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { armer } from "./armer.mjs";
import { attestationValide } from "./autoMerge.mjs";
import { ghReel, lireRevues, sansRisque } from "./fusionner.mjs";
import { controleDocs, RAISON_DOC } from "./docsAjoutsSeulement.mjs";

const RE_NUMERO = /^[1-9][0-9]{0,8}$/;
const RE_SHA = /^[0-9a-f]{40}$/;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const listeDeTextes = (config, cle) => {
  const l = config[cle] ?? [];
  if (!Array.isArray(l) || !l.every((m) => typeof m === "string" && m.trim() !== "")) throw new Error(`${cle} : liste de motifs attendue`);
  return l;
};

/**
 * @returns {Promise<{etat: string, raison: string, code?: string}>}
 * @throws si une lecture échoue (après tentative de désarmement) : le job échoue, visiblement
 */
export async function armerAvecDocs({ gh, config, env, ecrire = () => {}, attente = pause }) {
  const numero = String(env.NUMERO ?? "");
  const repo = env.REPO;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !RE_NUMERO.test(numero)) throw new Error("REPO ou numéro de PR invalide");

  const listes = { ajoutsSeulement: listeDeTextes(config, "chemins_ajouts_seulement"), contenuSurveille: listeDeTextes(config, "chemins_contenu_surveille") };
  if (listes.ajoutsSeulement.length === 0 && listes.contenuSurveille.length === 0) return armer({ gh, config, env, ecrire, attente });

  const desarmer = () => {
    try { gh(["pr", "merge", numero, "--repo", repo, "--disable-auto"]); } catch (e) { if (!/not enabled|not.*auto/i.test(String(e.message))) throw e; }
  };
  try {
    const vue = JSON.parse(gh(["pr", "view", numero, "--repo", repo, "--json", "state,headRefOid"]));
    if (vue.state !== "OPEN") return armer({ gh, config, env, ecrire, attente });        // le modèle écrit « rien à faire »
    const sha = String(vue.headRefOid ?? "");
    if (!RE_SHA.test(sha)) throw new Error("SHA invalide");
    const brut = gh(["api", "--paginate", `repos/${repo}/pulls/${numero}/files`, "--jq",
      ".[] | {path: .filename, previous_filename: .previous_filename, status: .status, patch: .patch}"]);
    const fichiers = brut.split("\n").filter((l) => l !== "").map((l) => {
      const f = JSON.parse(l);
      if (f.previous_filename === null || f.previous_filename === undefined) delete f.previous_filename;
      if (f.patch === null) delete f.patch;
      return f;
    });
    // revues lues seulement si un compte dédié est configuré, et seulement si un refus est en jeu (sinon rien à attester)
    const refus = controleDocs(fichiers, listes, undefined);
    if (refus === null) return armer({ gh, config, env, ecrire, attente });
    const reviews = config.securite_login ? await lireRevues(gh, repo, numero, attente) : [];
    const decision = controleDocs(fichiers, listes, () => attestationValide(reviews, { login: config.securite_login, sha, userId: config.securite_user_id }));
    if (decision === null) return armer({ gh, config, env, ecrire, attente });           // attesté sur ce SHA exact : le modèle décide du reste
    desarmer();
    ecrire(`- PR #${numero} : NON armée (désarmée si elle l'était) — code=${decision.code} ; ${decision.raison}`);
    return { etat: "desarme", raison: decision.raison, code: decision.code };
  } catch (e) {
    try { desarmer(); } catch { /* le job échoue de toute façon */ }
    throw e;
  }
}

async function main() {
  const config = JSON.parse(readFileSync(process.env.AUTOMERGE_CONFIG || ".github/auto-merge.json", "utf8"));
  const resume = process.env.GITHUB_STEP_SUMMARY;
  const lignes = [];
  await armerAvecDocs({ gh: ghReel, config, ecrire: (l) => lignes.push(l), env: {
    REPO: process.env.REPO, NUMERO: process.env.NUMERO, SHA: process.env.SHA, ACTION: process.env.ACTION, AUTOMERGE_OFF: process.env.AUTOMERGE_OFF } });
  for (const l of ["### Armement de l'auto-fusion", ...lignes]) { console.log(l); if (resume) appendFileSync(resume, `${l}\n`); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.log(`::error::${sansRisque(e.message, 200)}`); process.exit(1); });
}
export { RAISON_DOC };
