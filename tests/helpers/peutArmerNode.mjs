// tests/helpers/peutArmerNode.mjs
//
// Exécute le modèle Atelier (modeles/auto-merge/autoMerge.mjs) dans NODE, hors de Vite : le module charge sa surcouche facultative
// `chemins-interdits-atelier.json` par un import dynamique qui échoue (ERR_MODULE_NOT_FOUND, rattrapé) dans une app où elle est absente, et
// Vite refuse ce fichier manquant à la transformation. La copie du modèle ne se retouche pas (empreinte épinglée, COPIES.md) : le test appelle
// donc Node tel que le workflow le fait. Entrée : JSON sur stdin { pr, config } ; sortie : JSON { decision, chemins }.
import { readFileSync } from "node:fs";
import { peutArmer, decision, attestationValide, CHEMINS_INTERDITS } from "../../modeles/auto-merge/autoMerge.mjs";

// { pr, config }                  -> { decision: peutArmer(pr, config), chemins }
// { pr, config, contexte }        -> { decision: decision(pr, config, contexte), chemins }   (fusion événementielle : carence Dependabot, checks…)
// { attestation: {reviews, login, sha, userId} } -> { attestee }                              (VRAI attestationValide du kit)
const entree = JSON.parse(readFileSync(0, "utf8"));
if (entree.attestation) {
  const a = entree.attestation;
  process.stdout.write(JSON.stringify({ attestee: attestationValide(a.reviews, { login: a.login, sha: a.sha, userId: a.userId }) }));
} else {
  const { pr, config, contexte } = entree;
  const d = contexte ? decision(pr, config, contexte) : peutArmer(pr, config);
  process.stdout.write(JSON.stringify({ decision: d, chemins: [...CHEMINS_INTERDITS] }));
}
