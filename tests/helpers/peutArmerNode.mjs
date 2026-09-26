// tests/helpers/peutArmerNode.mjs
//
// Exécute le modèle Atelier (modeles/auto-merge/autoMerge.mjs) dans NODE, hors de Vite : le module charge sa surcouche facultative
// `chemins-interdits-atelier.json` par un import dynamique qui échoue (ERR_MODULE_NOT_FOUND, rattrapé) dans une app où elle est absente, et
// Vite refuse ce fichier manquant à la transformation. La copie du modèle ne se retouche pas (empreinte épinglée, COPIES.md) : le test appelle
// donc Node tel que le workflow le fait. Entrée : JSON sur stdin { pr, config } ; sortie : JSON { decision, chemins }.
import { readFileSync } from "node:fs";
import { peutArmer, CHEMINS_INTERDITS } from "../../modeles/auto-merge/autoMerge.mjs";

const { pr, config } = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify({ decision: peutArmer(pr, config), chemins: [...CHEMINS_INTERDITS] }));
