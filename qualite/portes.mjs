#!/usr/bin/env node
// Portes qualité de l'Atelier — version commune à toutes les apps (source : dépôt atelier,
// modeles/qualite/portes.mjs ; pilote : BatchChef, S1). Ce qui change d'une app à l'autre vit
// dans qualite/seuils.json, bloc « config » — ce fichier-ci ne se modifie pas sur place.
//
// Lance chaque contrôle, mesure un chiffre, le compare au seuil de qualite/seuils.json.
// Principe du CLIQUET : les seuils figent l'état au jour de la mise en place. L'existant est
// toléré, mais rien ne peut reculer. Quand un chiffre s'améliore, `--maj` resserre le seuil —
// jamais l'inverse (sauf `--forcer`, décision explicite de Marc).
//
//   node qualite/portes.mjs             → toutes les portes rapides
//   node qualite/portes.mjs --mutation  → + lit le dernier rapport de mutation (npm run mutation)
//   node qualite/portes.mjs --seulement-mutation → juge uniquement le rapport de mutation (CI hebdo)
//   node qualite/portes.mjs --maj       → resserre les seuils sur les chiffres améliorés
//
// Trois modes réservés à la CI, qui répartissent le même travail sur plusieurs machines
// (FinanceAI#1181 : le contrôle « Qualité » passait de 10 à 13 min, presque tout en tests sous couverture
// exécutés en série). Ils ne retirent aucune mesure : la même comparaison au même cliquet a lieu, une fois, à la fin.
//   --statique           → typage, lint, code mort, architecture ; écrit qualite/mesures-statiques.json, ne juge pas
//   --tranche i/n        → la tranche i sur n des tests, sous couverture ; écrit .vitest-reports/blob-i-n.json, ne juge pas
//   --fusion <n> <dir> <fichier>  → fusionne les n tranches de <dir> (couverture comprise), lit <fichier> (mesures
//                          statiques) et juge. Il échoue si une tranche manque : jamais de verdict sur des tests absents.
//
// Écrit qualite/rapport.json (non versionné) : c'est ce que lit le cockpit de l'Atelier.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEUILS = join(RACINE, "qualite", "seuils.json");
const RAPPORT = join(RACINE, "qualite", "rapport.json");
const args = new Set(process.argv.slice(2));
const seuils = JSON.parse(readFileSync(SEUILS, "utf8"));
const config = seuils.config;

function lancer(commande) {
  const debut = Date.now();
  const r = spawnSync(commande, { cwd: RACINE, shell: true, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { code: r.status ?? 1, sortie: (r.stdout || "") + (r.stderr || ""), stdout: r.stdout || "", secondes: (Date.now() - debut) / 1000 };
}

function json(texte) {
  const debut = texte.search(/[[{]/);
  return JSON.parse(texte.slice(debut).replace(/^\uFEFF/, ""));
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 100);

// ---------------------------------------------------------------- mesures
const mesures = {};
const durees = {};

function typecheck() {
  const r = lancer("npx --no-install tsc --noEmit");
  mesures["typecheck.erreurs"] = (r.sortie.match(/error TS\d+/g) || []).length + (r.code && !/error TS/.test(r.sortie) ? 1 : 0);
  durees.typecheck = r.secondes;
}

function lint() {
  const r = lancer(`npx --no-install ${config.lint} -f json`);
  const res = json(r.stdout);
  mesures["lint.erreurs"] = res.reduce((s, f) => s + f.errorCount, 0);
  mesures["lint.avertissements"] = res.reduce((s, f) => s + f.warningCount, 0);
  durees.lint = r.secondes;
}

const OPTIONS_COUVERTURE = "--coverage --coverage.reportOnFailure=true";

// Lit ce que vitest vient d'écrire (rapport JSON des tests + résumé de couverture) et en tire les mesures.
function mesurerTestsEtCouverture(r) {
  const tests = JSON.parse(readFileSync(join(RACINE, "coverage", "tests.json"), "utf8"));
  mesures["tests.echecs"] = tests.numFailedTests + (tests.numRuntimeErrorTestSuites || 0) + (r.code && !tests.numFailedTests ? 1 : 0);
  mesures["tests.total"] = tests.numTotalTests;
  const resume = JSON.parse(readFileSync(join(RACINE, "coverage", "coverage-summary.json"), "utf8"));
  mesures["couverture.lignes_global"] = resume.total.lines.pct;
  mesures["couverture.branches_global"] = resume.total.branches.pct;
  // Le cœur métier (config.coeur) est la couverture qui compte le plus.
  const motif = new RegExp(config.coeur.motif);
  let couvertes = 0, total = 0;
  for (const [fichier, m] of Object.entries(resume)) {
    if (fichier === "total" || !motif.test(fichier)) continue;
    couvertes += m.lines.covered;
    total += m.lines.total;
  }
  mesures["couverture.lignes_coeur"] = pct(couvertes, total);
  durees.tests = r.secondes;
}

function testsEtCouverture() {
  const r = lancer(
    // reportOnFailure : sans lui, UN test rouge supprime tout le rapport de couverture (défaut Vitest).
    // vitest_args (config) : réglages propres à l'app, ex. un délai plus long sous instrumentation.
    `npx --no-install vitest run ${OPTIONS_COUVERTURE} --coverage.reporter=json-summary --coverage.reporter=text-summary ` +
      `--reporter=json --outputFile=coverage/tests.json ${config.vitest_args || ""}`,
  );
  mesurerTestsEtCouverture(r);
}

// CI : une tranche des tests, sous couverture, dans un « blob » que --fusion rassemblera. Ne juge rien : un test
// rouge ici met la tranche en rouge (code de sortie), mais le verdict du cliquet se rend après la fusion.
function tranche(indexSurTotal) {
  // --outputFile.blob : depuis vitest 5 le blob par défaut est `.vitest/blob/blob-i-n.json`, plus
  // `.vitest-reports/` que le workflow téléverse et que --fusion lit. On le force au bon endroit.
  const r = lancer(
    `npx --no-install vitest run --shard=${indexSurTotal} ${OPTIONS_COUVERTURE} ` +
      `--reporter=blob --reporter=dot --outputFile.blob=.vitest-reports/blob-${indexSurTotal.replace("/", "-")}.json ` +
      `${config.vitest_args || ""}`,
  );
  console.log(r.sortie.split("\n").slice(-60).join("\n"));
  console.log(`Tranche ${indexSurTotal} : ${Math.round(r.secondes)} s (code ${r.code}).`);
  process.exit(r.code);
}

// CI : fusionne les tranches. Refuse de juger si l'une manque, sinon des tests absents passeraient pour réussis.
function fusion(total, dossier) {
  const attendus = Array.from({ length: total }, (_, i) => `blob-${i + 1}-${total}.json`);
  const presents = existsSync(dossier) ? readdirSync(dossier) : [];
  const manquants = attendus.filter((f) => !presents.includes(f));
  const inattendus = presents.filter((f) => !attendus.includes(f));
  if (manquants.length || inattendus.length) {
    console.error(`FUSION IMPOSSIBLE — tranches manquantes : ${manquants.join(", ") || "aucune"} ; fichiers inattendus : ${inattendus.join(", ") || "aucun"}.`);
    process.exit(1);
  }
  const r = lancer(
    `npx --no-install vitest run --merge-reports=${dossier} --coverage.reportOnFailure=true --coverage ` +
      `--coverage.reporter=json-summary --coverage.reporter=text-summary --reporter=json --outputFile=coverage/tests.json`,
  );
  mesurerTestsEtCouverture(r);
}

function codeMort() {
  const r = lancer("npx --no-install knip --reporter json");
  const res = json(r.stdout);
  let n = 0;
  for (const i of res.issues) for (const v of Object.values(i)) if (Array.isArray(v)) n += v.length;
  mesures["code_mort.problemes"] = n;
  durees.code_mort = r.secondes;
}

function architecture() {
  const r = lancer(`npx --no-install depcruise ${config.archi.join(" ")} --output-type json`);
  const res = json(r.stdout);
  mesures["architecture.violations"] = res.summary.violations.filter((v) => v.rule.severity === "error").length;
  durees.architecture = r.secondes;
}

function mutation() {
  const f = join(RACINE, "reports", "mutation", "mutation.json");
  if (!existsSync(f)) {
    console.log("  (pas de rapport de mutation : lancer `npm run mutation` d'abord)");
    return;
  }
  const rapport = JSON.parse(readFileSync(f, "utf8"));
  let detectes = 0, nonDetectes = 0;
  for (const fichier of Object.values(rapport.files)) {
    for (const m of fichier.mutants) {
      if (m.status === "Killed" || m.status === "Timeout") detectes++;
      else if (m.status === "Survived" || m.status === "NoCoverage") nonDetectes++;
    }
  }
  mesures["mutation.score"] = pct(detectes, detectes + nonDetectes);
  mesures["mutation.survivants"] = nonDetectes;
}

// ---------------------------------------------------------------- comparaison
const LIBELLES = {
  "typecheck.erreurs": "Typage (erreurs)",
  "lint.erreurs": "Lint (erreurs)",
  "lint.avertissements": "Lint (avertissements)",
  "tests.echecs": "Tests en échec",
  "couverture.lignes_coeur": `Couverture ${config.coeur.libelle} (% lignes)`,
  "couverture.lignes_global": "Couverture globale (% lignes)",
  "couverture.branches_global": "Couverture globale (% branches)",
  "code_mort.problemes": "Code mort (exports/fichiers inutilisés)",
  "architecture.violations": "Règles d'architecture violées",
  "mutation.score": "Score de mutation (%)",
};
const TOLERANCE = 0.2; // points de % : bruit de mesure de la couverture

const MESURES_STATIQUES = join(RACINE, "qualite", "mesures-statiques.json");

function main() {
  const apres = (option, n) => {
    const i = process.argv.indexOf(option);
    return i < 0 ? undefined : process.argv.slice(i + 1, i + 1 + n);
  };
  const [trancheDemandee] = apres("--tranche", 1) ?? [];
  if (trancheDemandee) tranche(trancheDemandee);

  const demandeFusion = apres("--fusion", 3);
  const statique = args.has("--statique");
  let etapes = [typecheck, lint, testsEtCouverture, codeMort, architecture];
  if (args.has("--seulement-mutation")) etapes = [];
  else if (statique) etapes = [typecheck, lint, codeMort, architecture];
  else if (demandeFusion) etapes = [];
  for (const etape of etapes) {
    process.stdout.write(`… ${etape.name}\n`);
    etape();
  }
  if (statique) {
    writeFileSync(MESURES_STATIQUES, JSON.stringify({ mesures, durees }, null, 2));
    console.log(`Mesures statiques : ${JSON.stringify(mesures)} (${JSON.stringify(durees)})`);
    return;
  }
  if (demandeFusion) {
    const [total, dossier, fichierStatique] = demandeFusion;
    process.stdout.write("… fusion des tranches de tests\n");
    fusion(Number(total), dossier);
    durees.fusion_tests = durees.tests;
    delete durees.tests;
    const statiques = JSON.parse(readFileSync(fichierStatique, "utf8"));
    Object.assign(mesures, statiques.mesures);
    Object.assign(durees, statiques.durees);
  }
  if (args.has("--mutation") || args.has("--seulement-mutation")) mutation();

  const lignes = [];
  let recul = false;
  for (const [cle, libelle] of Object.entries(LIBELLES)) {
    if (!(cle in mesures)) continue;
    const s = seuils.portes[cle];
    const v = mesures[cle];
    let statut = "—";
    if (s && "max" in s) statut = v <= s.max ? "OK" : "RECUL";
    if (s && "min" in s) statut = v >= s.min - TOLERANCE ? "OK" : "RECUL";
    if (statut === "RECUL") recul = true;
    const cible = s ? ("max" in s ? `≤ ${s.max}` : `≥ ${s.min}`) : "(pas encore de seuil)";
    lignes.push({ cle, libelle, valeur: v, seuil: cible, statut });
  }

  console.log(`\nPortes qualité — ${config.app}`);
  for (const l of lignes) console.log(`  ${l.statut.padEnd(5)} ${l.libelle.padEnd(42)} ${String(l.valeur).padStart(7)}   seuil ${l.seuil}`);

  const commit = lancer("git rev-parse --short HEAD").stdout.trim();
  writeFileSync(RAPPORT, JSON.stringify({ app: config.app, date: new Date().toISOString(), commit, verdict: recul ? "RECUL" : "OK", portes: lignes, durees }, null, 2));

  if (args.has("--maj")) {
    let change = false;
    for (const l of lignes) {
      const s = seuils.portes[l.cle];
      if (!s) continue;
      if ("max" in s && (l.valeur < s.max || args.has("--forcer"))) { s.max = l.valeur; change = true; }
      if ("min" in s && (l.valeur > s.min || args.has("--forcer"))) { s.min = Math.floor(l.valeur * 10) / 10; change = true; }
    }
    if (change) {
      seuils.mis_a_jour = new Date().toISOString().slice(0, 10);
      writeFileSync(SEUILS, JSON.stringify(seuils, null, 2) + "\n");
      console.log("\nSeuils resserrés dans qualite/seuils.json (à committer).");
    }
  }

  if (recul) {
    console.log("\nVERDICT : RECUL — au moins un chiffre est moins bon que le seuil. Corriger avant de fusionner.");
    process.exit(1);
  }
  console.log("\nVERDICT : OK — aucune porte n'a reculé.");
}

main();
