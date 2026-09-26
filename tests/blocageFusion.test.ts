// tests/blocageFusion.test.ts
//
// [GARDE-BLOCAGE-FUSION] Le workflow « Fusion automatique » ne doit JAMAIS armer l'auto-fusion d'une PR qui touche un
// chemin sensible (hooks de l'agence, .github, réglages, commit-gate, .claude, CODEOWNERS, modeles/, et — pour FinanceAI
// — le relais IA, l'authentification, vercel.json), ni d'une PR étiquetée validation-marc ou en brouillon.
// La décision est celle du modèle de l'Atelier (`peutArmer`), copiée dans .github/scripts/auto-merge/ ; le workflow
// est un `pull_request_target` (lu sur `main`, jamais dans la PR). Ce fichier fige les deux : la décision (table
// d'attaque) et le gabarit du workflow (grille de relecture sécurité A1-A9, lue comme DONNÉE).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { peutArmer, CHEMINS_INTERDITS } from '../.github/scripts/auto-merge/autoMerge.mjs';

const RACINE = resolve(__dirname, '..');
const lit = (p: string) => readFileSync(resolve(RACINE, p), 'utf8');
const config = JSON.parse(lit('.github/auto-merge.json'));
const SHA = 'a'.repeat(40);

const pr = (fichiers: string[], over: Record<string, unknown> = {}) => ({
    state: 'OPEN', isDraft: false, isCrossRepository: false, labels: [], headRefOid: SHA, baseRefName: 'main',
    fichiers: fichiers.map((path) => ({ path, status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b' })),
    ...over,
});

describe('peutArmer — chemins sensibles : jamais armée', () => {
    const sensibles = [
        // liste commune de l'Atelier
        'scripts/hooks/commit-gate.mjs', 'scripts/hooks/lib/analyseCommande.mjs', '.github/workflows/ci.yml',
        '.github/workflows/fusion-auto.yml', '.github/auto-merge.json', '.github/scripts/auto-merge/autoMerge.mjs',
        '.claude/settings.json', '.claude/agents/architect.md', '.claude/settings.local.json', 'CODEOWNERS', '.github/CODEOWNERS',
        'modeles/auto-merge/autoMerge.mjs', 'passerelle/tunnel.yml', '.husky/pre-commit', '.gitattributes',
        'scripts/commit-gate.mjs', 'outils/commit-gate/x.mjs',
        // propres à FinanceAI (auto-merge.json : chemins_label_validation)
        'api/auth/callback.ts', 'api/_lib/session.ts', 'api/_lib/sessionStore.ts', 'api/_lib/garde.ts', 'api/_lib/relay.ts', 'vercel.json',
        // variantes de casse, séparateurs Windows, chemins déguisés
        'Scripts/Hooks/x.mjs', '.GITHUB/workflows/x.yml', 'scripts\\hooks\\x.mjs', './.github/workflows/x.yml',
    ];
    it.each(sensibles)('%s', (f) => {
        const d = peutArmer(pr([f]), config);
        expect(d.armer, d.raison).toBe(false);
    });

    it('un renommage depuis un chemin sensible compte (ancien nom) ; une suppression aussi', () => {
        const renomme = pr(['docs/x.md']);
        renomme.fichiers[0] = { path: 'docs/x.md', status: 'renamed', previous_filename: '.github/workflows/ci.yml' } as never;
        expect(peutArmer(renomme, config).armer).toBe(false);
        const supprime = pr(['.claude/agents/architect.md']);
        supprime.fichiers[0].status = 'removed';
        expect(peutArmer(supprime, config).armer).toBe(false);
    });

    it('un fichier sensible NOYÉ dans une grosse PR bloque toute la PR', () => {
        const banals = Array.from({ length: 50 }, (_, i) => `services/x${i}.ts`);
        expect(peutArmer(pr([...banals, 'api/_lib/relay.ts']), config).armer).toBe(false);
    });

    it('les chemins « label validation » demandent l\'étiquette validation-marc', () => {
        const d = peutArmer(pr(['api/_lib/relay.ts']), config);
        expect(d.etiqueter).toContain('validation-marc');
        expect(d.raison).toContain('api/_lib/relay.ts');
    });
});

describe('peutArmer — le code ordinaire de l\'app reste automatique (pas de sur-blocage)', () => {
    const ordinaires = [
        'services/projection.ts', 'components/TaxCenter.tsx', 'tests/x.test.ts', 'docs/CONVENTIONS.md', 'HANDOVER.md', 'package.json',
        // ⚠️ dossiers REACT nommés « hooks » et écran Réglages de l'app : pas des hooks de l'agence
        'hooks/useAiChat.ts', 'hooks/useFocusTrap.ts', 'components/Settings.tsx', 'components/settings/BackupPanel.tsx',
        'components/settings/sections/UsersCard.tsx', 'api/_lib/autreChose.ts', 'api/claude/v1/messages.ts',
    ];
    it.each(ordinaires)('%s', (f) => {
        const d = peutArmer(pr([f]), config);
        expect(d.armer, d.raison).toBe(true);
    });
});

describe('peutArmer — étiquettes, brouillon, fork, état', () => {
    it('validation-marc et do-not-merge bloquent', () => {
        for (const nom of ['validation-marc', 'do-not-merge']) {
            expect(peutArmer(pr(['services/a.ts'], { labels: [{ name: nom }] }), config).armer, nom).toBe(false);
        }
    });
    it('brouillon, fork : non ; champ absent : non (échec fermé)', () => {
        expect(peutArmer(pr(['services/a.ts'], { isDraft: true }), config).armer).toBe(false);
        expect(peutArmer(pr(['services/a.ts'], { isCrossRepository: true }), config).armer).toBe(false);
        const sansFork = pr(['services/a.ts']) as Record<string, unknown>;
        delete sansFork.isCrossRepository;
        expect(peutArmer(sansFork, config).armer).toBe(false);
    });
    it('liste de fichiers absente ou vide : non', () => {
        expect(peutArmer({ ...pr([]), fichiers: undefined }, config).armer).toBe(false);
        expect(peutArmer(pr([]), config).armer).toBe(false);
    });
    it('configuration invalide : non (rien ne s\'arme)', () => {
        expect(peutArmer(pr(['services/a.ts']), { ...config, controles_requis: [] }).armer).toBe(false);
        expect(peutArmer(pr(['services/a.ts']), null).armer).toBe(false);
    });
    it('la configuration peut AJOUTER des chemins interdits, jamais en retirer', () => {
        expect(peutArmer(pr(['scripts/hooks/x.mjs']), { ...config, chemins_interdits: [], chemins_label_validation: [] }).armer).toBe(false);
    });
});

describe('liste de chemins : les hooks React ne sont PAS interdits, ceux de l\'agence oui', () => {
    it('adaptation FinanceAI documentée dans le fichier', () => {
        const brut = JSON.parse(lit('.github/scripts/auto-merge/chemins-interdits.json'));
        expect(brut._note).toContain('hooks REACT');
        expect(CHEMINS_INTERDITS).toContain('scripts/hooks/**');
        expect(CHEMINS_INTERDITS).toContain('.claude/**');
        expect(CHEMINS_INTERDITS).toContain('.github/**');
        expect(CHEMINS_INTERDITS).not.toContain('hooks/**');
        expect(CHEMINS_INTERDITS).not.toContain('**/settings*');
    });
});

describe('workflow fusion-auto.yml — grille de relecture sécurité (lue comme donnée)', () => {
    const yml = lit('.github/workflows/fusion-auto.yml');
    const code = yml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

    it('A1/A2 pull_request_target ; un seul checkout, de la BASE (jamais la tête de la PR) ; script lu depuis la base', () => {
        expect(code).toMatch(/^on:\s*\n\s+pull_request_target:/m);
        expect(code).not.toMatch(/^\s+pull_request:/m);
        expect(code.match(/actions\/checkout@/g)).toHaveLength(1);
        expect(code).not.toMatch(/ref:\s*\$\{\{\s*github\.(event\.pull_request\.head|head_ref)/);
        // `head.sha` n'apparaît que comme VALEUR d'une variable d'environnement validée (40 hexadécimaux) par armer.mjs.
        expect(code).not.toMatch(/head\.ref|refs\/pull/);
        expect([...code.matchAll(/^\s*\S+:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/gm)]).toHaveLength(1);
        expect(code).toMatch(/^\s+SHA:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/m);
        expect(code).toContain('persist-credentials: false');
        expect(code).toContain('node .github/scripts/auto-merge/armer.mjs');
    });
    it('A3 pas de fork', () => {
        expect(code).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    });
    it('A4 permissions vides au niveau global ; écriture sur le SEUL job', () => {
        expect(code).toMatch(/^permissions: \{\}\s*$/m);
        expect(code.match(/contents: write/g)).toHaveLength(1);
        expect(code.match(/pull-requests: write/g)).toHaveLength(1);
    });
    it('A5 aucun texte de la PR (titre, corps, branche, message) dans le workflow', () => {
        expect(code).not.toMatch(/github\.event\.pull_request\.(title|body)|head_ref|github\.event\.head_commit|github\.event\.pull_request\.head\.label/);
        // ${{ }} : seuls le numéro, le SHA, le dépôt et le jeton
        const expressions = [...code.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
        const permises = new Set(['github.event.pull_request.number', 'github.event.pull_request.head.sha', 'github.repository', 'github.token']);
        for (const e of expressions) expect(permises.has(e), `expression non autorisée : ${e}`).toBe(true);
    });
    it('A6 toutes les actions épinglées par SHA de commit', () => {
        const usages = [...code.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
        expect(usages.length).toBeGreaterThan(0);
        for (const u of usages) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
    });
    it('A7 aucun secret', () => {
        expect(code).not.toMatch(/secrets\./);
    });
    it('A9 types d\'événements : un label, un brouillon ou une poussée réévalue', () => {
        for (const t of ['opened', 'reopened', 'ready_for_review', 'synchronize', 'labeled', 'unlabeled', 'edited', 'converted_to_draft']) {
            expect(code, t).toContain(t);
        }
    });
    it('le script échoue FERMÉ : toute erreur désarme', () => {
        const s = lit('.github/scripts/auto-merge/armer.mjs');
        expect(s).toMatch(/catch \(e\) \{\s*desarmer\(\);/);
        expect(s).toContain('process.exit(1)');
        expect(s).toContain('peutArmer');
        expect(s).toMatch(/headRefOid !== SHA/);
    });
});

describe('copies de modèles : identiques à la source de l\'Atelier (contrôle si le dépôt Atelier est présent)', () => {
    const SOURCE = 'C:/dev/atelier/modeles/auto-merge';
    const sha = (t: string) => createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex');
    it.skipIf(!existsSync(`${SOURCE}/autoMerge.mjs`))('autoMerge.mjs et autoMerge.d.mts sont des copies EXACTES', () => {
        for (const f of ['autoMerge.mjs', 'autoMerge.d.mts']) {
            expect(sha(readFileSync(`${SOURCE}/${f}`, 'utf8')), f).toBe(sha(lit(`.github/scripts/auto-merge/${f}`)));
        }
    });
    it('la liste des copies jointe existe et couvre chaque fichier copié', () => {
        const liste = lit('.github/scripts/auto-merge/COPIES.md');
        for (const f of ['autoMerge.mjs', 'autoMerge.d.mts', 'chemins-interdits.json', 'armer.mjs']) expect(liste, f).toContain(f);
    });
});
