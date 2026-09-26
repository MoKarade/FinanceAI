// tests/blocageFusion.test.ts
//
// [GARDE-BLOCAGE-FUSION] Le workflow « Fusion automatique » ne doit JAMAIS armer l'auto-fusion d'une PR qui touche un
// chemin sensible (hooks de l'agence, .github, réglages, commit-gate, .claude, CODEOWNERS, modeles/, et — pour FinanceAI
// — le relais IA, l'authentification, vercel.json), ni d'une PR étiquetée validation-marc ou en brouillon.
// La décision est celle du modèle de l'Atelier 1.6.0 (`peutArmer`), copiée dans modeles/auto-merge/ ; le workflow
// est un `pull_request_target` (lu sur `main`, jamais dans la PR). Ce fichier fige les deux : la décision (table
// d'attaque) et le gabarit du workflow (grille de relecture sécurité A1-A9, lue comme DONNÉE).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Le modèle tourne dans NODE (voir tests/helpers/peutArmerNode.mjs : Vite ne sait pas charger sa surcouche facultative absente).
interface Decision { armer: boolean; raison: string; etiqueter: string[] }
const executer = (pr: unknown, config: unknown): { decision: Decision; chemins: string[] } =>
    JSON.parse(execFileSync('node', [resolve(__dirname, 'helpers/peutArmerNode.mjs')], { input: JSON.stringify({ pr, config }), encoding: 'utf8' }));
const peutArmer = (pr: unknown, config: unknown): Decision => executer(pr, config).decision;
const CHEMINS_INTERDITS: string[] = executer({}, {}).chemins;

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
        '.github/workflows/armement-auto-merge.yml', '.github/auto-merge.json', 'modeles/auto-merge/armer.mjs',
        '.claude/settings.json', '.claude/agents/architect.md', '.claude/settings.local.json', 'CODEOWNERS', '.github/CODEOWNERS',
        'modeles/auto-merge/autoMerge.mjs', '.husky/pre-commit', '.gitattributes',
        'scripts/commit-gate.mjs', 'outils/commit-gate/x.mjs',
        // propres à FinanceAI (auto-merge.json : chemins_label_validation)
        'api/auth/callback.ts', 'api/_lib/session.ts', 'api/_lib/sessionStore.ts', 'api/_lib/garde.ts', 'api/_lib/relay.ts', 'vercel.json',
        'api/_lib/autreChose.ts', 'api/claude/v1/messages.ts', 'mcp/http.ts', 'mcp/tools/getTaxSituation.spec.ts',
        'services/secureKeyStore.ts', 'vite.config.ts', 'index.html',
        // réglages : tout fichier settings*.json, à toute profondeur (settings.json : base du modèle ; le reste : chemins_label_validation de FinanceAI)
        'settings.json', 'config/settings.prod.json', 'a/b/settings.local.json',
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
        'components/settings/sections/UsersCard.tsx', 'services/secureKeyStoreHelper.ts', 'src/index.html.ts',
    ];
    it.each(ordinaires)('%s', (f) => {
        const d = peutArmer(pr([f]), config);
        expect(d.armer, d.raison).toBe(true);
    });
});

describe('peutArmer — étiquettes, brouillon, fork, état', () => {
    it('do-not-merge BLOQUE (frein manuel), quel que soit le fichier ; il bloque aussi malgré une attestation valide', () => {
        const d = peutArmer(pr(['services/a.ts'], { labels: [{ name: 'do-not-merge' }] }), config);
        expect(d.armer).toBe(false);
        expect(d.raison).toContain('do-not-merge');
        expect(peutArmer(pr(['docs/x.md'], { labels: [{ name: 'do-not-merge' }] }), config).armer).toBe(false);
        const cfg = { ...config, securite_login: 'compte-securite' };
        const revue = { state: 'APPROVED', commit_id: SHA, user: { login: 'compte-securite', id: 1 }, submitted_at: '2026-09-26T10:00:00Z' };
        expect(peutArmer(pr(['api/_lib/relay.ts'], { labels: [{ name: 'do-not-merge' }], reviews: [revue] }), cfg).armer).toBe(false);
        // anti-vacuité : sans le label, le même fichier ordinaire s'arme
        expect(peutArmer(pr(['services/a.ts']), config).armer).toBe(true);
    });
    it('validation-marc est INFORMATIF depuis le modèle 1.6.0 (décision de Marc : seule l\'attestation débloque un chemin sensible, le label ne bloque plus)', () => {
        expect(peutArmer(pr(['services/a.ts'], { labels: [{ name: 'validation-marc' }] }), config).armer).toBe(true);
        // …mais un chemin sensible reste bloqué avec ou sans le label : ce n'est pas lui qui protège
        expect(peutArmer(pr(['api/_lib/relay.ts'], { labels: [{ name: 'validation-marc' }] }), config).armer).toBe(false);
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
    it('la base 1.6.0 est étroite : hooks/ et components/settings/ (UI de l\'app) n\'y sont pas', () => {
        const brut = JSON.parse(lit('modeles/auto-merge/chemins-interdits-base.json'));
        expect(brut._doc).toContain('components/settings/');
        expect(CHEMINS_INTERDITS).toContain('**/scripts/hooks/**');
        expect(CHEMINS_INTERDITS).toContain('.claude/**');
        expect(CHEMINS_INTERDITS).toContain('.github/**');
        expect(CHEMINS_INTERDITS).not.toContain('hooks/**');
        expect(CHEMINS_INTERDITS).not.toContain('**/settings*');
    });

    // Anti-vacuité : si la liste de la base perd une famille de chemins d'agent, la garde ne protège plus rien sans que le reste de la
    // suite s'en aperçoive. Chaque famille doit rester REPRÉSENTÉE (motif exact) ET bloquer un fichier réel, sans l'aide de la config.
    it('la base garde chaque famille de chemins d\'agent (motif présent ET fichier bloqué)', () => {
        const famille: Array<[string, string]> = [
            ['**/scripts/hooks/**', 'scripts/hooks/commit-gate.mjs'],
            ['.claude/**', '.claude/settings.json'],
            ['.github/**', '.github/workflows/ci.yml'],
            ['**/commit-gate*', 'outils/commit-gate.mjs'],
            ['CODEOWNERS', 'CODEOWNERS'],
            ['modeles/**', 'modeles/auto-merge/autoMerge.mjs'],
            ['CLAUDE.md', 'CLAUDE.md'],
        ];
        for (const [motif, exemple] of famille) {
            expect(CHEMINS_INTERDITS, `motif perdu : ${motif}`).toContain(motif);
            expect(peutArmer(pr([exemple]), { ...config, chemins_interdits: [], chemins_label_validation: [] }).armer, exemple).toBe(false);
        }
    });

    it('la config FinanceAI garde ses chemins sensibles propres (label validation-marc), settings*.json compris', () => {
        for (const m of ['api/**', 'mcp/**', 'services/secureKeyStore.ts', 'vite.config.ts', 'index.html', 'vercel.json', '**/settings*.json']) {
            expect(config.chemins_label_validation, `chemin perdu : ${m}`).toContain(m);
        }
    });

    // La liste FIXE d'avant le resync (.github/scripts/auto-merge/chemins-interdits.json, 894324cd), figée ICI comme donnée : chaque motif doit
    // rester couvert par base ∪ config. Un motif qui disparaît sans être couvert (cas de passerelle/tunnel.yml, absent de la base 1.6.0) fait
    // échouer ce test ; un écart voulu se DÉCLARE dans COPIES.md ET se code ici.
    const ANCIENNE_LISTE_FIXE = [
        'scripts/hooks/**', '.github/**', '**/commit-gate*', '**/commit-gate*/**', 'passerelle/tunnel.yml', '.claude/**', '.husky/**', 'CODEOWNERS',
        '**/CODEOWNERS', '.github/CODEOWNERS', 'modeles/**', 'auto-merge.json', '**/auto-merge.json', 'chemins-interdits.json',
        '**/chemins-interdits.json', '.gitattributes', '**/settings*.json',
    ];
    const exempleDe = (motif: string) => motif.replace(/\*\*\//g, 'x/y/').replace(/\/\*\*/g, '/x/y/z.ext').replace(/\*/g, 'x');

    it('aucun chemin de l\'ancienne liste fixe ne perd sa protection (base ∪ config) : un exemple de CHAQUE motif reste non armable', () => {
        expect(ANCIENNE_LISTE_FIXE).toHaveLength(17);
        for (const motif of ANCIENNE_LISTE_FIXE) {
            const d = peutArmer(pr([exempleDe(motif)]), config);
            expect(d.armer, `motif de l'ancienne liste devenu armable : ${motif} (${exempleDe(motif)})`).toBe(false);
        }
        // anti-vacuité : le même exemple hors liste EST armable (le test ne passe pas parce que tout est bloqué)
        expect(peutArmer(pr(['services/a.ts']), config).armer).toBe(true);
    });

    it('passerelle/tunnel.yml (tunnel qui expose le MCP) : chemin interdit NON attestable — même une revue valide ne le lève pas', () => {
        expect(config.chemins_interdits).toContain('passerelle/tunnel.yml');
        const cfg = { ...config, securite_login: 'compte-securite' };
        const d = peutArmer(pr(['passerelle/tunnel.yml'], { reviews: [revue()] }), cfg);
        expect(d.armer).toBe(false);
        expect(d.raison).toContain('chemin interdit par auto-merge.json');
    });

    it('aucune attestation configurée : securite_login et securite_user_id sont ABSENTS (échec fermé, chemins sensibles bloqués)', () => {
        expect(config).not.toHaveProperty('securite_login');
        expect(config).not.toHaveProperty('securite_user_id');
        expect(config).not.toHaveProperty('chemins_attestables');
    });

    // FIXTURE de revues (données de test), jamais un vérificateur de substitution : c'est `attestationValide` du modèle qui juge.
    const revue = (over: Record<string, unknown> = {}) => ({ state: 'APPROVED', commit_id: SHA, user: { login: 'compte-securite', id: 1 }, submitted_at: '2026-09-26T10:00:00Z', ...over });

    it('sans compte configuré, une revue APPROVED sur le bon SHA ne lève RIEN', () => {
        for (const f of ['api/_lib/relay.ts', 'vercel.json', '.github/workflows/ci.yml', 'x/settings.local.json']) {
            const d = peutArmer(pr([f], { reviews: [revue()] }), config);
            expect(d.armer, f).toBe(false);
        }
    });

    it('avec un compte configuré (variante de test, PAS la config réelle) : la revue lève un chemin sensible ; ancien SHA, autre compte, revue non approuvée, aucune revue : refus', () => {
        const cfg = { ...config, securite_login: 'compte-securite' };
        expect(peutArmer(pr(['api/_lib/relay.ts'], { reviews: [revue()] }), cfg).armer).toBe(true);
        expect(peutArmer(pr(['api/_lib/relay.ts'], { reviews: [revue({ commit_id: 'b'.repeat(40) })] }), cfg).armer).toBe(false);
        expect(peutArmer(pr(['api/_lib/relay.ts'], { reviews: [revue({ user: { login: 'autre', id: 2 } })] }), cfg).armer).toBe(false);
        expect(peutArmer(pr(['api/_lib/relay.ts'], { reviews: [revue({ state: 'COMMENTED' })] }), cfg).armer).toBe(false);
        expect(peutArmer(pr(['api/_lib/relay.ts']), cfg).armer).toBe(false);
    });
});

describe('workflow armement-auto-merge.yml — grille de relecture sécurité (lue comme donnée)', () => {
    const yml = lit('.github/workflows/armement-auto-merge.yml');
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
        expect(code).toContain('node modeles/auto-merge/armer.mjs');
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
        const permises = new Set([
            'github.event.pull_request.number', 'github.event.pull_request.head.sha', 'github.repository', 'github.token',
            // gabarit 1.6.0 : numéro saisi à la main (validé par armer.mjs), SHA de base, nom de l'événement, variables de dépôt
            'github.event.pull_request.number || inputs.pr', 'github.event.pull_request.base.sha || github.sha', 'github.event.action || github.event_name',
            'vars.AUTOMERGE_OFF', 'fromJSON(vars.ARMEMENT_RUNNER || \'"ubuntu-latest"\')',
        ]);
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
        const s = lit('modeles/auto-merge/armer.mjs');
        expect(s).toMatch(/catch \(e\) \{\s*\/\/ ÉCHEC FERMÉ[^\n]*\n\s*try \{ desarmer\(/);
        expect(s).toContain('peutArmer');
        expect(s).toMatch(/pr\.headRefOid !== sha/);
        expect(code).toMatch(/if: failure\(\)/);
    });
    it('A16 jamais pull_request_review ; lancement manuel seulement sur la branche par défaut', () => {
        expect(code).not.toMatch(/pull_request_review/);
        expect(code).toContain('workflow_dispatch');
        expect(code).toContain("github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
    });
    it('un seul mécanisme : l\'ancien workflow et l\'ancien dossier .github/scripts/auto-merge n\'existent plus', () => {
        expect(existsSync(resolve(RACINE, '.github/workflows/fusion-auto.yml'))).toBe(false);
        expect(existsSync(resolve(RACINE, '.github/scripts/auto-merge'))).toBe(false);
    });
});

describe('copies du modèle 1.6.0 : COPIES.md atteste des copies FIDÈLES (hermétique, sans dépendre du checkout de l\'Atelier)', () => {
    const sha = (t: string) => createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex');
    const liste = lit('COPIES.md');
    const lignes = [...liste.matchAll(/^\| (\S+) \| ([0-9a-f]{64}) \| (\S+) \|$/gm)].map((m) => ({ chemin: m[1], sha: m[2], version: m[3] }));
    const ATTENDUS = [
        'modeles/auto-merge/autoMerge.mjs', 'modeles/auto-merge/autoMerge.d.mts', 'modeles/auto-merge/chemins-interdits-base.json',
        'modeles/auto-merge/fusionner.mjs', 'modeles/auto-merge/armer.mjs', 'modeles/auto-merge/verifier-copies.mjs',
        'modeles/auto-merge/surblocage.mjs', '.github/workflows/armement-auto-merge.yml', 'modeles/auto-merge/LISEZMOI.md',
    ];
    it('anti-vacuité : COPIES.md liste exactement les 9 fichiers du lot, tous en 1.6.0', () => {
        expect(lignes.map((l) => l.chemin).sort()).toEqual([...ATTENDUS].sort());
        for (const l of lignes) expect(l.version, l.chemin).toBe('1.6.0');
    });
    it.each(ATTENDUS)('%s : l\'empreinte de COPIES.md est celle du fichier (copie non retouchée)', (chemin) => {
        const l = lignes.find((x) => x.chemin === chemin);
        expect(l, chemin).toBeDefined();
        expect(sha(lit(chemin)), chemin).toBe(l!.sha);
    });
    it('la source (commit f8e2177) et chaque écart FinanceAI sont déclarés', () => {
        expect(liste).toContain('f8e2177');
        for (const mot of ['commit-gate.mjs', 'analyseCommande.mjs', '**/settings*.json', 'securite_login', 'eslint-disable', 'fusion-auto.yml']) {
            expect(liste, `écart non déclaré : ${mot}`).toContain(mot);
        }
    });
});
