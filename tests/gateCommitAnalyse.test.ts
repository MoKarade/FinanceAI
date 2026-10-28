// tests/gateCommitAnalyse.test.ts
//
// [GATE-COMMIT-ANALYSE] Le hook `commit-gate.mjs` ne doit réagir qu'à un VRAI `git commit`, et calculer les
// fichiers que ce commit embarquera même quand un `git add` le précède dans la même commande (l'index est
// alors encore vide quand le hook s'exécute). Toute incertitude → suite complète (défaut sûr).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { analyseCommande, fichiersAttendus, toucheLeGate, estConfigGlobale, finDeSortie } from '../scripts/hooks/lib/analyseCommande.mjs';

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
  it('les redirections ne sont pas des arguments (2>&1, > f, 2>/dev/null)', () => {
    const r = a('git add a.ts 2>&1 | grep -v x; git commit -m y > out.txt 2>/dev/null');
    expect(r).toMatchObject({ estCommit: true, incertain: false });
    expect(r.chemins).toEqual(['a.ts']);
  });
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
  it('entrée non textuelle → jamais « pas un commit »', () => {
    for (const x of [undefined, null, 42, {}, ['git', 'commit']]) {
      const r = a(x as never);
      expect(r.estCommit && r.incertain).toBe(true);
    }
  });
  it('commande vide ou sans rapport avec git : rien à garder', () => {
    expect(a('').estCommit).toBe(false);
    expect(a('   ').estCommit).toBe(false);
    expect(a('npm run build').estCommit).toBe(false);
  });
});

// [revue pole-securite #1070] Table d'ATTAQUE : chaque forme qui peut lancer un commit sans que le texte
// brut ressemble à `git commit` doit répondre estCommit (incertain ou non) — JAMAIS « pas un commit ».
describe('analyseCommande — table d’attaque (fail-open interdit)', () => {
  const attaques = [
    'git com""mit -m x',
    'git "com"mit -m x',
    'git com\\mit -m x',
    "g''it commit -m x",
    'bash -c "git commit -m x"',
    "sh -c 'git commit -m x'",
    'eval "git commit -m x"',
    'env git commit -m x',
    'env GIT_AUTHOR_NAME=x git commit -m y',
    'sudo git commit -m x',
    'nice git commit -m x',
    'nohup git commit -m x',
    'timeout 5 git commit -m x',
    'echo x | xargs git commit -m',
    'find . -maxdepth 0 -exec git commit -m x {} +',
    '/usr/bin/git commit -m x',
    '"C:/Program Files/Git/cmd/git.exe" commit -m x',
    'GIT commit -m x',
    'C=commit; git $C -m x',
    'git $(echo commit) -m x',
    'G=git; $G commit -m x',
    'git -c alias.x=commit x -m y',
    'git ci -m x',
    'git -c x=y commit -m z',
    "python -c 'import os; os.system(\"git commit -m x\")'",
  ];
  it.each(attaques)('%s', (c) => {
    const r = a(c);
    expect(r.estCommit).toBe(true);
  });

  const shq = (x: string) => `'${x.split("'").join("'\\''")}'`;
  const hostiles = ['a&b', '$(x)', '-x', 'a\nb', "it's", 'a;b', 'a|b', 'a`b`', 'a>b', '%PATH%', 'a^b', 'a!b', 'a"b'];
  it.each(hostiles)('chemin hostile refusé (incertain) : %j', (chemin) => {
    for (const c of [`git add -- ${shq(chemin)} && git commit -m x`, `git commit -m x -- ${shq(chemin)}`]) {
      const r = a(c);
      expect(r.estCommit).toBe(true);
      expect(r.incertain).toBe(true);
      expect(r.chemins).not.toContain(chemin);
    }
  });

  it('git add avec un chemin sain reste NON incertain', () => {
    const r = a('git add services/x.ts && git commit -m x');
    expect(r.incertain).toBe(false);
  });
  it('des commandes git sans rapport avec le commit ne déclenchent rien', () => {
    for (const c of ['git status', 'git push -u origin b', 'git diff --stat', 'git log --oneline -3', 'git fetch origin main', 'git checkout -b x', 'node --check scripts/hooks/commit-gate.mjs && git diff --stat']) {
      expect(a(c).estCommit).toBe(false);
    }
  });
});

describe('finDeSortie — erreur d’origine plafonnée', () => {
  it('garde les 200 dernières lignes', () => {
    const t = Array.from({ length: 500 }, (_, i) => `l${i}`).join('\n');
    const r = finDeSortie(t).split('\n');
    expect(r).toHaveLength(200);
    expect(r[199]).toBe('l499');
  });
  it('plafonne à 20 ko même sur une seule très longue ligne', () => {
    expect(finDeSortie('x'.repeat(100_000)).length).toBe(20 * 1024);
  });
});

describe('estConfigGlobale — ce qui impose la suite complète', () => {
  it.each(['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', 'vitest.config.ts', 'components/a.css', 'index.html', 'tailwind.config.js'])('%s', (f) => {
    expect(estConfigGlobale(f)).toBe(true);
  });
  it.each(['services/a.ts', 'scripts/hooks/x.mjs', '.github/workflows/ci.yml', 'docs/a.md', 'tests/a.test.ts'])('%s : ciblable', (f) => {
    expect(estConfigGlobale(f)).toBe(false);
  });
});

describe('toucheLeGate — liste blanche des fichiers sans effet', () => {
  it('docs et markdown seuls : ne touchent pas le gate', () => {
    expect(toucheLeGate(['HANDOVER.md', 'docs/a.txt', 'docs/x/y.png'])).toBe(false);
  });
  it('tout le reste compte, y compris config, lockfile, css, scripts .mjs', () => {
    for (const f of ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', 'vitest.config.ts', 'a.css', 'scripts/hooks/x.mjs', '.github/workflows/ci.yml', 'services/a.ts']) {
      expect(toucheLeGate(['README.md', f])).toBe(true);
    }
  });
  it('liste vide = inconnu = suite complète', () => {
    expect(toucheLeGate([])).toBe(true);
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
  it('une entrée illisible BLOQUE (fail-closed), avec un message', () => {
    const r = spawnSync(process.execPath, [hook], { input: 'pas du json', encoding: 'utf8', timeout: 20_000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/illisible/);
  });
  it('un appel sans commande (autre outil) sort avec 0', () => {
    const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_input: {} }), encoding: 'utf8', timeout: 20_000 });
    expect(r.status).toBe(0);
  });
});
