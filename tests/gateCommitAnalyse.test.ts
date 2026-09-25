// tests/gateCommitAnalyse.test.ts
//
// [GATE-COMMIT-ANALYSE] Le hook `commit-gate.mjs` ne doit réagir qu'à un VRAI `git commit`, et calculer les
// fichiers que ce commit embarquera même quand un `git add` le précède dans la même commande (l'index est
// alors encore vide quand le hook s'exécute). Toute incertitude → suite complète (défaut sûr).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { analyseCommande, fichiersAttendus } from '../scripts/hooks/lib/analyseCommande.mjs';

const a = (c: string) => analyseCommande(c);

describe('analyseCommande — faux positifs (le texte contient « git commit » sans le lancer)', () => {
  const faux = [
    'echo "git commit -m x"',
    "echo 'faire git commit ensuite'",
    'cat > rapport.md <<EOF\nOn a fait git commit puis push\nEOF',
    "cat <<'EOF' > r.md\nl'étape: git commit -am \"x\"\nEOF\nls",
    'git log --grep="git commit"',
    'printf "%s" "git add . && git commit"',
    '# git commit plus tard\nls',
    'gh pr create --title "fix" --body "après git commit"',
    'grep -rn "git commit" scripts/',
  ];
  it.each(faux)('ignore : %s', (c) => {
    const r = a(c);
    expect(r.estCommit).toBe(false);
    expect(r.incertain).toBe(false);
  });
});

describe('analyseCommande — vrais commits', () => {
  it('commit simple', () => {
    const r = a('git commit -m "[X] message"');
    expect(r).toMatchObject({ estCommit: true, incertain: false, index: true, commitTout: false, amend: false });
    expect(r.chemins).toEqual([]);
  });
  it('commit avec message contenant un heredoc et des guillemets imbriqués', () => {
    const c = 'git commit -m "$(cat <<\'EOF\'\nfix: l\'erreur "x" (y)\n\nEOF\n)"';
    const r = a(c);
    expect(r).toMatchObject({ estCommit: true, incertain: false });
  });
  it('commit précédé de variables d’environnement, ou après un && sans rapport', () => {
    expect(a('FOO=1 git commit -m x').estCommit).toBe(true);
    expect(a('npm run lint && git commit -m x').estCommit).toBe(true);
  });
  it('options globales de git', () => {
    expect(a('git -c user.name=x commit -m y').estCommit).toBe(true);
  });
  it('git add explicite puis commit', () => {
    const r = a('git add a.ts docs/b.md && git commit -m x');
    expect(r).toMatchObject({ estCommit: true, incertain: false, index: true, tousChangements: false });
    expect(r.chemins).toEqual(['a.ts', 'docs/b.md']);
  });
  it('git add -A / . / -u', () => {
    expect(a('git add -A && git commit -m x').tousChangements).toBe(true);
    expect(a('git add . ; git commit -m x').tousChangements).toBe(true);
    expect(a('git add -u\ngit commit -m x').suivisSeulement).toBe(true);
  });
  it('git add -- chemins après le double tiret', () => {
    expect(a('git add -f -- x.ts && git commit -m y').chemins).toEqual(['x.ts']);
  });
  it('commit -a, -am, --all', () => {
    expect(a('git commit -a -m x').commitTout).toBe(true);
    expect(a('git commit -am "x"').commitTout).toBe(true);
    expect(a('git commit --all -m x').commitTout).toBe(true);
    // « -m a » : la lettre `a` est la VALEUR du message, pas l'option -a.
    expect(a('git commit -m a').commitTout).toBe(false);
  });
  it('commit --amend', () => {
    expect(a('git commit --amend --no-edit').amend).toBe(true);
  });
  it('commit d’un chemin nommé', () => {
    expect(a('git commit -m x -- src/a.ts').chemins).toEqual(['src/a.ts']);
    expect(a('git commit src/a.ts -m x').chemins).toEqual(['src/a.ts']);
  });
  it('chaînes multiples : réunion des fichiers de chaque étape', () => {
    const r = a('git add a.ts && git commit -m 1 && git add b.md && git commit -m 2');
    expect(r.estCommit).toBe(true);
    expect(r.incertain).toBe(false);
    expect(r.chemins).toEqual(['a.ts', 'b.md']);
  });
  it('un commit dans une substitution ou un sous-shell est un vrai commit', () => {
    expect(a('(git add a.ts && git commit -m x)').estCommit).toBe(true);
    expect(a('echo $(git commit -m x)').estCommit).toBe(true);
  });
});

describe('analyseCommande — défaut sûr (incertain → suite complète)', () => {
  const douteux = [
    'git commit -m "non fermé',
    "git commit -m 'non fermé",
    'git add x && git commit -m "$(cat <<EOF\nsans fin\n)"',
    'cd ../autre && git add . && git commit -m x',
    'git -C ../autre commit -m x',
    'git add -p && git commit -m x',
    'git reset HEAD f.ts && git commit -m x',
    'git rm f.ts && git commit -m x',
  ];
  it.each(douteux)('incertain : %s', (c) => {
    const r = a(c);
    expect(r.estCommit).toBe(true);
    expect(r.incertain).toBe(true);
    expect(fichiersAttendus(r, {} as never)).toBeNull();
  });
  it('un texte non fermé qui ne parle pas de commit est ignoré', () => {
    expect(a('echo "commit').estCommit).toBe(false);
  });
  it('entrée non textuelle', () => {
    expect(a(undefined as never).estCommit).toBe(false);
  });
});

describe('fichiersAttendus', () => {
  const git = (over = {}) => ({
    index: () => ['idx.ts'],
    suivisModifies: () => ['suivi.ts'],
    dernierCommit: () => ['prec.ts'],
    status: ({ chemins, sansNonSuivis }: { chemins?: string[]; sansNonSuivis?: boolean }) =>
      chemins ? chemins.map(c => `st/${c}`) : sansNonSuivis ? ['u.ts'] : ['tout.ts', 'nouveau.md'],
    ...over,
  });

  it('commit simple : l’index seul', () => {
    expect(fichiersAttendus(a('git commit -m x'), git())).toEqual(['idx.ts']);
  });
  it('add explicite : l’index (vide avant exécution) + les chemins nommés', () => {
    const g = git({ index: () => [] });
    expect(fichiersAttendus(a('git add a.md && git commit -m x'), g)).toEqual(['st/a.md']);
  });
  it('add -A : tout ce que `git status` liste', () => {
    expect(fichiersAttendus(a('git add -A && git commit -m x'), git({ index: () => [] }))).toEqual(['tout.ts', 'nouveau.md']);
  });
  it('add -u : sans les fichiers non suivis', () => {
    expect(fichiersAttendus(a('git add -u && git commit -m x'), git({ index: () => [] }))).toEqual(['u.ts']);
  });
  it('commit -a : + fichiers suivis modifiés', () => {
    expect(fichiersAttendus(a('git commit -am x'), git())).toEqual(['idx.ts', 'suivi.ts']);
  });
  it('--amend : + fichiers du dernier commit', () => {
    expect(fichiersAttendus(a('git commit --amend --no-edit'), git())).toEqual(['idx.ts', 'prec.ts']);
  });
  it('pas de commit → null', () => {
    expect(fichiersAttendus(a('echo hi'), git())).toBeNull();
  });
  it('git en échec → null (suite complète)', () => {
    const g = git({ index: () => { throw new Error('boom'); } });
    expect(fichiersAttendus(a('git commit -m x'), g)).toBeNull();
  });
});

describe('commit-gate.mjs — bout en bout, sans dépôt ni suite lancée', () => {
  const hook = resolve(__dirname, '../scripts/hooks/commit-gate.mjs');
  const lance = (command: string) =>
    spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', timeout: 20_000 });

  it('un rapport qui cite « git commit » sort tout de suite avec 0, sans rien lancer', () => {
    const r = lance('cat > r.md <<EOF\nnous ferons git commit ensuite\nEOF');
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });
  it('une entrée illisible sort avec 0', () => {
    const r = spawnSync(process.execPath, [hook], { input: 'pas du json', encoding: 'utf8', timeout: 20_000 });
    expect(r.status).toBe(0);
  });
});
