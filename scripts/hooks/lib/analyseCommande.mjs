// scripts/hooks/lib/analyseCommande.mjs
//
// [GATE-COMMIT-ANALYSE] Analyse (pure, sans effet de bord) de la commande Bash reçue par le hook
// `commit-gate.mjs`, pour répondre à deux questions :
//   1. La commande LANCE-t-elle vraiment un `git commit` ? (et pas seulement : « elle contient ce texte »)
//   2. Quels fichiers ce commit embarquera-t-il, y compris quand un `git add` le précède dans la MÊME
//      commande (l'index est alors encore vide au moment où le hook s'exécute) ?
//
// ⚠️ POURQUOI UN MODULE À PART : `commit-gate.mjs` lit stdin au chargement ; l'importer dans un test bloque
// (même raison que `testsHomonymes.mjs`).
//
// ⚠️ DÉFAUT SÛR : dès que l'analyse n'est pas sûre (guillemet non fermé, heredoc sans fin, `cd`, `git -C`,
// `git reset` avant le commit, `git add -p`, substitution bizarre…), le résultat est `incertain: true` et
// le hook lance la suite complète — exactement ce que faisait l'ancien hook.
//
// Le découpage suit la grammaire shell utile ici : segments séparés par `&&` `||` `;` `|` `&` et retours
// ligne ; le contenu des chaînes ('…', "…"), des heredocs (<<EOF) et des commentaires n'est JAMAIS pris
// pour une commande ; `$(…)` et `(…)` sont analysés (une commande y tourne réellement).

const MOTS_DE_TETE = new Set(['{', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time', 'exec', 'command']);
// Sous-commandes git qui modifient l'index de façon non prévisible ici → on ne devine pas.
const GIT_MUTE_INDEX = new Set(['reset', 'restore', 'checkout', 'switch', 'rm', 'mv', 'stash', 'apply', 'merge', 'cherry-pick', 'rebase', 'revert', 'pull', 'am', 'clean']);
// Options de `git commit` qui consomment le mot suivant.
const COMMIT_OPTION_AVEC_VALEUR = new Set(['-m', '-F', '-C', '-c', '-t', '--message', '--file', '--author', '--date', '--reuse-message', '--reedit-message', '--template', '--cleanup', '--trailer', '--fixup', '--squash', '--pathspec-from-file']);
const COMMIT_COURT_AVEC_VALEUR = 'mFCct';
// Options de `git` (avant la sous-commande) qui consomment le mot suivant.
const GIT_OPTION_AVEC_VALEUR = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

class Incertain extends Error {}

/** Lit une liste de commandes jusqu'à `fermeur` (')' pour `$(…)`, '`' pour un backtick, ou fin de chaîne). */
function lireListe(s, debut, fermeur) {
  const segments = [];
  let mots = [];
  let mot = '';
  let motOuvert = false;
  let heredocs = []; // délimiteurs à consommer au prochain retour ligne
  let i = debut;

  const finMot = () => { if (motOuvert) { mots.push(mot); mot = ''; motOuvert = false; } };
  const finSegment = () => { finMot(); if (mots.length) segments.push(mots); mots = []; };
  const ajoute = (c) => { mot += c; motOuvert = true; };

  while (i < s.length) {
    const c = s[i];
    if (fermeur && c === fermeur) { finSegment(); return { segments, i: i + 1 }; }
    if (c === ' ' || c === '\t' || c === '\r') { finMot(); i++; continue; }
    if (c === '\n') {
      finSegment(); i++;
      for (const h of heredocs) { i = sauteHeredoc(s, i, h); }
      heredocs = [];
      continue;
    }
    if (c === '\\') {
      if (s[i + 1] === '\n') { i += 2; continue; }
      if (i + 1 >= s.length) throw new Incertain('backslash final');
      ajoute(s[i + 1]); i += 2; continue;
    }
    if (c === '#' && !motOuvert) { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === "'") {
      const fin = s.indexOf("'", i + 1);
      if (fin < 0) throw new Incertain("guillemet simple non fermé");
      mot += s.slice(i + 1, fin); motOuvert = true; i = fin + 1; continue;
    }
    if (c === '"') { const r = lireDouble(s, i + 1); segments.push(...r.segments); mot += r.texte; motOuvert = true; i = r.i; continue; }
    if (c === '`') { const r = lireListe(s, i + 1, '`'); segments.push(...r.segments); ajoute('`'); i = r.i; continue; }
    if (c === '$' && s[i + 1] === '(') { const r = lireListe(s, i + 2, ')'); segments.push(...r.segments); ajoute('$()'); i = r.i; continue; }
    if (c === '<' && s[i + 1] === '<' && s[i + 2] !== '<') {
      const m = /^<<-?[ \t]*(?:'([^']*)'|"([^"]*)"|([A-Za-z0-9_]+))/.exec(s.slice(i));
      if (!m) throw new Incertain('heredoc illisible');
      heredocs.push({ mot: m[1] ?? m[2] ?? m[3], tiret: s[i + 2] === '-' });
      i += m[0].length; continue;
    }
    if (c === '&' && s[i + 1] === '&') { finSegment(); i += 2; continue; }
    if (c === '|' && s[i + 1] === '|') { finSegment(); i += 2; continue; }
    if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')') { finSegment(); i++; continue; }
    ajoute(c); i++;
  }
  if (fermeur) throw new Incertain(`« ${fermeur} » non fermé`);
  finSegment();
  return { segments, i };
}

/** Contenu d'une chaîne "…" : les `$(…)` et backticks y sont exécutés, le reste est du texte. */
function lireDouble(s, debut) {
  const segments = [];
  let texte = '';
  let i = debut;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') return { segments, texte, i: i + 1 };
    if (c === '\\') { texte += s[i + 1] ?? ''; i += 2; continue; }
    if (c === '$' && s[i + 1] === '(') { const r = lireListe(s, i + 2, ')'); segments.push(...r.segments); texte += '$()'; i = r.i; continue; }
    if (c === '`') { const r = lireListe(s, i + 1, '`'); segments.push(...r.segments); texte += '`'; i = r.i; continue; }
    texte += c; i++;
  }
  throw new Incertain('guillemet double non fermé');
}

/** Avance après le corps d'un heredoc (jusqu'à la ligne qui vaut le délimiteur). */
function sauteHeredoc(s, debut, { mot, tiret }) {
  let i = debut;
  while (i <= s.length) {
    let fin = s.indexOf('\n', i);
    if (fin < 0) fin = s.length;
    let ligne = s.slice(i, fin).replace(/\r$/, '');
    if (tiret) ligne = ligne.replace(/^\t+/, '');
    if (ligne === mot) return Math.min(fin + 1, s.length);
    if (fin >= s.length) break;
    i = fin + 1;
  }
  throw new Incertain('heredoc sans fin');
}

/** Retire les préfixes sans effet (VAR=x, `!`, `command`…) et rend [outil, ...args]. */
function commande(mots) {
  let k = 0;
  while (k < mots.length && (MOTS_DE_TETE.has(mots[k]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[k]))) k++;
  return mots.slice(k);
}

/**
 * @typedef {object} AnalyseCommande
 * @property {boolean} estCommit       la commande lance au moins un `git commit`
 * @property {boolean} incertain       analyse non sûre → le hook doit lancer la suite complète
 * @property {string}  [raison]        pourquoi (diagnostic)
 * @property {boolean} index           l'index courant fait partie des fichiers attendus
 * @property {string[]} chemins        chemins nommés (git add X, git commit X) à résoudre par `git status`
 * @property {boolean} tousChangements `git add -A` / `.` : tout ce que `git status` liste
 * @property {boolean} suivisSeulement `git add -u` : les fichiers déjà suivis modifiés
 * @property {boolean} commitTout      `git commit -a` : fichiers suivis modifiés
 * @property {boolean} amend           `--amend` : les fichiers du dernier commit sont aussi embarqués
 */

/** @returns {AnalyseCommande} */
export function analyseCommande(cmd) {
  const vide = { estCommit: false, incertain: false, index: false, chemins: [], tousChangements: false, suivisSeulement: false, commitTout: false, amend: false };
  if (typeof cmd !== 'string' || !/commit/.test(cmd)) return vide;
  const mentionne = /\bgit\b[\s\S]*\bcommit\b/.test(cmd);

  let segments;
  try { segments = lireListe(cmd, 0, null).segments; }
  catch (e) {
    if (!(e instanceof Incertain)) throw e;
    // Illisible : on ne bloque que si le texte évoque réellement `git … commit` ; sinon rien à garder.
    return mentionne ? { ...vide, estCommit: true, incertain: true, raison: e.message, index: true } : vide;
  }

  const r = { ...vide, chemins: [] };
  const incertain = (raison) => { r.incertain = true; r.raison ??= raison; };

  for (const seg of segments) {
    const c = commande(seg);
    if (c.length === 0) continue;
    const outil = c[0];
    if (outil === 'cd' || outil === 'pushd' || outil === 'popd') { if (!r.estCommit) r.aChangeDeDossier = true; continue; }
    if (outil !== 'git') continue;

    // Options globales de git, puis sous-commande.
    let k = 1;
    while (k < c.length && c[k].startsWith('-')) {
      if (c[k] === '-C' || c[k].startsWith('--git-dir') || c[k].startsWith('--work-tree')) incertain('git -C / --git-dir : autre dépôt');
      k += GIT_OPTION_AVEC_VALEUR.has(c[k]) ? 2 : 1;
    }
    const sous = c[k];
    const args = c.slice(k + 1);

    if (sous === 'add') {
      for (let a = 0; a < args.length; a++) {
        const x = args[a];
        if (x === '--') { for (const p of args.slice(a + 1)) ajouteChemin(r, p); break; }
        if (x === '-A' || x === '--all') r.tousChangements = true;
        else if (x === '-u' || x === '--update') r.suivisSeulement = true;
        else if (x === '-p' || x === '--patch' || x === '-i' || x === '--interactive' || x === '-e' || x === '--edit') incertain('git add interactif');
        else if (x.startsWith('--pathspec-from-file')) incertain('git add --pathspec-from-file');
        else if (x.startsWith('-')) continue;
        else ajouteChemin(r, x);
      }
      continue;
    }
    if (sous === 'commit') {
      r.estCommit = true;
      r.index = true;
      for (let a = 0; a < args.length; a++) {
        const x = args[a];
        if (x === '--') { for (const p of args.slice(a + 1)) ajouteChemin(r, p); break; }
        if (x === '--all') r.commitTout = true;
        else if (x === '--amend') r.amend = true;
        else if (x.startsWith('--pathspec-from-file')) incertain('git commit --pathspec-from-file');
        else if (x.startsWith('--')) { if (COMMIT_OPTION_AVEC_VALEUR.has(x)) a++; }
        else if (/^-[A-Za-z]+/.test(x)) {
          // Groupe d'options courtes : -a, -am, -sa… ; une lettre à valeur consomme le reste du groupe.
          let prendSuivant = false;
          for (let ch = 1; ch < x.length; ch++) {
            const l = x[ch];
            if (l === 'a') r.commitTout = true;
            if (COMMIT_COURT_AVEC_VALEUR.includes(l)) { prendSuivant = ch === x.length - 1; break; }
          }
          if (prendSuivant) a++;
        } else ajouteChemin(r, x); // `git commit fichier` : commit --only
      }
      if (r.aChangeDeDossier) incertain('cd avant le commit');
      continue;
    }
    if (GIT_MUTE_INDEX.has(sous) && !r.estCommit) incertain(`git ${sous} avant le commit`);
  }
  delete r.aChangeDeDossier;

  // `cd` avant un commit rencontré plus tard ; et texte évoquant un commit que l'analyse n'a pas retrouvé
  // dans un segment exécuté = faux positif assumé (echo, heredoc, rapport…) → rien à garder.
  if (!r.estCommit) return { ...vide };
  if (r.incertain) r.index = true;
  return r;
}

function ajouteChemin(r, p) {
  if (p === '.' || p === './') { r.tousChangements = true; return; }
  r.chemins.push(p);
}

/**
 * Fichiers attendus, à partir de l'analyse et d'un accès git injecté (testable sans dépôt).
 * `git` expose : index(), suivisModifies(), dernierCommit(), status({chemins?, sansNonSuivis?}).
 * @returns {string[] | null} null = impossible de savoir → suite complète.
 */
export function fichiersAttendus(analyse, git) {
  if (!analyse.estCommit || analyse.incertain) return null;
  const out = new Set();
  const ajoute = (liste) => { for (const f of liste) out.add(f); };
  try {
    if (analyse.index) ajoute(git.index());
    if (analyse.commitTout) ajoute(git.suivisModifies());
    if (analyse.amend) ajoute(git.dernierCommit());
    if (analyse.tousChangements) ajoute(git.status({}));
    if (analyse.suivisSeulement) ajoute(git.status({ sansNonSuivis: true }));
    if (analyse.chemins.length) ajoute(git.status({ chemins: analyse.chemins }));
  } catch { return null; }
  return [...out];
}
