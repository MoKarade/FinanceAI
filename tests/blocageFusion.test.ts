// tests/blocageFusion.test.ts
//
// [GARDE-BLOCAGE-FUSION] Le workflow « Fusion automatique » ne doit JAMAIS armer l'auto-fusion d'une PR qui touche un
// chemin sensible (hooks de l'agence, .github, réglages, commit-gate, .claude, CODEOWNERS, modeles/, et — pour FinanceAI
// — le relais IA, l'authentification, vercel.json), ni d'une PR étiquetée validation-marc ou en brouillon.
// La décision est celle du kit de l'Atelier 1.10.0, origin/main au commit 245364a (`peutArmer`, `decision`, inchangés côté FinanceAI : pas de frein visuel activé), copiée dans modeles/auto-merge/ ; le workflow
// est un `pull_request_target` (lu sur `main`, jamais dans la PR). Ce fichier fige les deux : la décision (table
// d'attaque) et le gabarit du workflow (grille de relecture sécurité A1-A9, lue comme DONNÉE).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Le modèle tourne dans NODE (voir tests/helpers/peutArmerNode.mjs : Vite ne sait pas charger sa surcouche facultative absente).
interface Decision { armer: boolean; raison: string; etiqueter: string[]; merger?: boolean }
const executer = (pr: unknown, config: unknown, contexte?: unknown): { decision: Decision; chemins: string[] } =>
    JSON.parse(execFileSync('node', [resolve(__dirname, 'helpers/peutArmerNode.mjs')], { input: JSON.stringify({ pr, config, contexte }), encoding: 'utf8' }));
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
    it('validation-marc est INFORMATIF depuis le kit 1.6.0 (décision de Marc : seule l\'attestation débloque un chemin sensible, le label ne bloque plus)', () => {
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
    it('la base du kit est étroite : hooks/ et components/settings/ (UI de l\'app) n\'y sont pas', () => {
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
    // rester couvert par base ∪ config. Un motif qui disparaît sans être couvert (cas de passerelle/tunnel.yml, absent de la base du kit) fait
    // échouer ce test ; un écart voulu se DÉCLARE dans COPIES.md ET se code ici.
    const ANCIENNE_LISTE_FIXE = [
        'scripts/hooks/**', '.github/**', '**/commit-gate*', '**/commit-gate*/**', 'passerelle/tunnel.yml', '.claude/**', '.husky/**', 'CODEOWNERS',
        '**/CODEOWNERS', '.github/CODEOWNERS', 'modeles/**', 'auto-merge.json', '**/auto-merge.json', 'chemins-interdits.json',
        '**/chemins-interdits.json', '.gitattributes', '**/settings*.json',
    ];
    const exempleDe = (motif: string) => motif.split('**/').join('x/y/').split('/**').join('/x/y/z.ext').split('*').join('x');

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

    it('securite_login est configuré via une GitHub App (login en [bot] ET identifiant numérique obligatoire) ; chemins_attestables absent', () => {
        expect(config.securite_login).toMatch(/^[A-Za-z0-9-]+\[bot\]$/);
        expect(Number.isInteger(config.securite_user_id) && config.securite_user_id > 0).toBe(true);
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
        // securite_user_id explicitement effacé : la config réelle en porte un (App [bot]) qui ne doit PAS interférer
        // avec ce scénario indépendant (compte simple, sans identifiant numérique exigé).
        const cfg = { ...config, securite_login: 'compte-securite', securite_user_id: undefined };
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
        expect(code).toContain('node modeles/auto-merge/armer-docs.mjs');
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
            // gabarit d'armement : numéro saisi à la main (validé par armer.mjs), SHA de base, nom de l'événement, variables de dépôt
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

describe('copies du kit 1.10.0 (origin/main de l\'Atelier, resynchronisé depuis 1.9.1) : COPIES.md atteste des copies FIDÈLES (hermétique, sans dépendre du checkout de l\'Atelier)', () => {
    const sha = (t: string) => createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex');
    const liste = lit('COPIES.md');
    const lignes = [...liste.matchAll(/^\| (\S+) \| ([0-9a-f]{64}) \| (\S+) \|$/gm)].map((m) => ({ chemin: m[1], sha: m[2], version: m[3] }));
    const ATTENDUS = [
        'modeles/auto-merge/autoMerge.mjs', 'modeles/auto-merge/autoMerge.d.mts', 'modeles/auto-merge/chemins-interdits-base.json',
        'modeles/auto-merge/fusionner.mjs', 'modeles/auto-merge/armer.mjs', 'modeles/auto-merge/labels.mjs', 'modeles/auto-merge/verifier-copies.mjs',
        'modeles/auto-merge/surblocage.mjs', 'modeles/auto-merge/codes-raison.mjs', 'modeles/auto-merge/LISEZMOI.md',
    ];
    it('anti-vacuité : COPIES.md liste exactement les 10 fichiers du lot, tous en 1.10.0 (armement-auto-merge.yml en est sorti : adapté, écart 5)', () => {
        expect(lignes.map((l) => l.chemin).sort()).toEqual([...ATTENDUS].sort());
        for (const l of lignes) expect(l.version, l.chemin).toBe('1.10.0');
    });
    it.each(ATTENDUS)('%s : l\'empreinte de COPIES.md est celle du fichier (copie non retouchée)', (chemin) => {
        const l = lignes.find((x) => x.chemin === chemin);
        expect(l, chemin).toBeDefined();
        expect(sha(lit(chemin)), chemin).toBe(l!.sha);
    });
    it('la source (kit 1.10.0, commit 245364a de l\'Atelier), le frein visuel non activé et chaque écart FinanceAI sont déclarés', () => {
        expect(liste).toContain('1.10.0');
        expect(liste).toContain('245364a');
        expect(liste).toContain('NON ACTIVÉ');
        // Frein visuel : décision de Marc en attente, la clé ne doit pas apparaître dans la config tant qu'elle n'est pas prise.
        expect(lit('.github/auto-merge.json')).not.toContain('chemins_validation_visuelle');
        for (const mot of ['commit-gate.mjs', 'analyseCommande.mjs', '**/settings*.json', 'securite_login', 'securite_user_id', 'passerelle/tunnel.yml', 'workflows: [CI]', 'auto-merge.yml', 'carence_dependabot_jours', 'dependabot.yml', 'armer-docs.mjs', 'docsAjoutsSeulement.mjs', 'ADR 0024', 'chemins_ajouts_seulement', 'chemins_contenu_surveille']) {
            expect(liste, `écart non déclaré : ${mot}`).toContain(mot);
        }
    });
});

// ── workflow d'armement (gabarit adapté d'UNE ligne : armer-docs.mjs avant armer.mjs), lu comme donnée ────────────────────────────────────
describe('workflow armement-auto-merge.yml (gabarit adapté : armer-docs.mjs) — la SEULE adaptation, empreintes déclarées', () => {
    const yml = lit('.github/workflows/armement-auto-merge.yml');

    it('l\'UNIQUE adaptation : armer-docs.mjs (couche documents protégés) à la place de armer.mjs', () => {
        expect(yml).toContain('run: node modeles/auto-merge/armer-docs.mjs');
        expect(yml).not.toContain('run: node modeles/auto-merge/armer.mjs');
        expect(existsSync(resolve(RACINE, 'modeles/auto-merge/armer-docs.mjs'))).toBe(true);
    });
    it('COPIES.md déclare les deux empreintes (gabarit du kit et adapté) et l\'adaptation est la SEULE ligne qui diffère', () => {
        const copies = lit('COPIES.md');
        const sha = (t: string) => createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex');
        expect(copies).toContain(sha(yml));
        expect(copies).toContain('455d424b79b2');
        const modele = yml.replace('run: node modeles/auto-merge/armer-docs.mjs', 'run: node modeles/auto-merge/armer.mjs');
        expect(sha(modele).startsWith('455d424b79b2')).toBe(true);
    });
});

// ── Dependabot : réarmé par la FUSION ÉVÉNEMENTIELLE (decision), après la carence de 3 jours ─────────────────────────────────────────────────────
describe('Dependabot : fusionné par le workflow événementiel (decision du kit), carence de 3 jours', () => {
    const MAINTENANT = '2026-09-27T12:00:00Z';
    const JOUR = 86_400_000;
    const creeIlYA = (jours: number) => new Date(Date.parse(MAINTENANT) - jours * JOUR).toISOString();
    const controles = config.controles_requis.map((name: string) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS', appId: 15368 }));
    const dependabot = (fichiers: string[], over: Record<string, unknown> = {}) => ({
        state: 'OPEN', isDraft: false, isCrossRepository: false, labels: [], mergeStateStatus: 'CLEAN', baseRefName: 'main', headRefOid: SHA,
        checks: controles, auteur: 'dependabot[bot]', dernierActeur: 'dependabot[bot]', creeLe: creeIlYA(4),
        fichiers: fichiers.map((path) => ({ path, status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b' })), ...over,
    });
    const decide = (pr: unknown, cfg: unknown = config): Decision & { merger: boolean } =>
        executer(pr, cfg, { shaAttendu: SHA, maintenant: MAINTENANT, env: {} }).decision as Decision & { merger: boolean };

    it('la carence est bien de 3 jours dans la config', () => {
        expect(config.carence_dependabot_jours).toBe(3);
    });
    it('PR Dependabot éligible (package.json, 4 jours, contrôles verts par GitHub Actions) : FUSIONNÉE', () => {
        const d = decide(dependabot(['package.json', 'package-lock.json']));
        expect(d.merger, d.raison).toBe(true);
    });
    it('avant la carence (2 jours) : refusée, la raison le dit ; à 3 jours pile : fusionnée', () => {
        const trop = decide(dependabot(['package.json'], { creeLe: creeIlYA(2) }));
        expect(trop.merger).toBe(false);
        expect(trop.raison).toContain('carence');
        expect(decide(dependabot(['package.json'], { creeLe: creeIlYA(3) })).merger).toBe(true);
    });
    it('PR Dependabot qui touche un chemin SENSIBLE : non fusionnée (api/, mcp/, .github/, settings, tunnel)', () => {
        for (const f of ['api/_lib/relay.ts', 'mcp/http.ts', '.github/workflows/ci.yml', 'x/settings.local.json', 'passerelle/tunnel.yml', 'vercel.json']) {
            const d = decide(dependabot(['package.json', f]));
            expect(d.merger, f).toBe(false);
        }
    });
    it('faux Dependabot, dernier push humain, label do-not-merge, contrôle rouge ou absent : jamais fusionnée', () => {
        expect(decide(dependabot(['package.json'], { auteur: 'dependabot-fake' })).merger).toBe(false);
        expect(decide(dependabot(['package.json'], { auteur: 'dependabot' })).merger).toBe(false);
        expect(decide(dependabot(['package.json'], { dernierActeur: 'MoKarade' })).merger).toBe(false);
        expect(decide(dependabot(['package.json'], { labels: [{ name: 'do-not-merge' }] })).merger).toBe(false);
        const rouge = controles.map((c: { name: string }, i: number) => (i === 0 ? { ...c, conclusion: 'FAILURE' } : c));
        expect(decide(dependabot(['package.json'], { checks: rouge })).merger).toBe(false);
        expect(decide(dependabot(['package.json'], { checks: controles.slice(1) })).merger).toBe(false);
        expect(decide(dependabot(['package.json'], { checks: controles.map((c: object) => ({ ...c, appId: 1 })) })).merger).toBe(false);
    });
    it('arrêt d\'urgence AUTOMERGE_OFF : aucune fusion, même éligible', () => {
        const d = executer(dependabot(['package.json']), config, { shaAttendu: SHA, maintenant: MAINTENANT, env: { AUTOMERGE_OFF: '1' } }).decision as Decision;
        expect(d.merger).toBe(false);
    });
    it('l\'armement natif LAISSE Dependabot à ce workflow (il ne l\'arme pas lui-même)', () => {
        const armer = readFileSync(resolve(RACINE, 'modeles/auto-merge/armer.mjs'), 'utf8');
        expect(armer).toMatch(/PR Dependabot : traitée par le workflow de fusion/);
    });
});

// ── attestation par l'App « <slug>[bot] » : fixture de revues, VRAI attestationValide ──────────────────────────────────────────────────────
describe('attestation par une GitHub App (securite_login « <slug>[bot] » + securite_user_id) — variante de test, la config réelle n\'en a pas', () => {
    const LOGIN_BOT = 'atelier-securite-marc[bot]';
    const ID_BOT = 334232309;
    const revue = (over: Record<string, unknown> = {}) => ({ state: 'APPROVED', commit_id: SHA, user: { login: LOGIN_BOT, id: ID_BOT, type: 'Bot' }, submitted_at: '2026-09-26T10:00:00Z', ...over });
    const att = (reviews: unknown, over: Record<string, unknown> = {}) =>
        (JSON.parse(execFileSync('node', [resolve(__dirname, 'helpers/peutArmerNode.mjs')], { input: JSON.stringify({ attestation: { reviews, login: LOGIN_BOT, sha: SHA, userId: ID_BOT, ...over } }), encoding: 'utf8' })) as { attestee: boolean }).attestee;

    it('revue APPROVED du compte bot, type Bot, bon identifiant, SHA exact : attestée', () => {
        expect(att([revue()])).toBe(true);
    });
    it('ancien SHA, mauvais identifiant numérique, type User, login humain voisin, COMMENTED, aucune revue, userId absent : PAS attestée', () => {
        expect(att([revue({ commit_id: 'c'.repeat(40) })])).toBe(false);
        expect(att([revue({ user: { login: LOGIN_BOT, id: 1, type: 'Bot' } })])).toBe(false);
        expect(att([revue({ user: { login: LOGIN_BOT, id: ID_BOT, type: 'User' } })])).toBe(false);
        expect(att([revue({ user: { login: 'atelier-securite-marc', id: ID_BOT, type: 'User' } })])).toBe(false);
        expect(att([revue({ state: 'COMMENTED' })])).toBe(false);
        expect(att([])).toBe(false);
        expect(att(null)).toBe(false);
        expect(att([revue()], { userId: undefined })).toBe(false);
    });
    it('la config réelle porte securite_login/securite_user_id, exactement le compte simulé dans ce fichier', () => {
        expect(config.securite_login).toBe(LOGIN_BOT);
        expect(config.securite_user_id).toBe(ID_BOT);
    });
});

// ── workflow de fusion événementielle (gabarit adapté), lu comme donnée ─────────────────────────────────────────────────────────────────────
describe('workflow auto-merge.yml (gabarit événementiel adapté : workflows: [CI]) — grille de relecture, lue comme donnée', () => {
    const yml = readFileSync(resolve(RACINE, '.github/workflows/auto-merge.yml'), 'utf8');
    const code = yml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

    it('l\'UNIQUE adaptation : le nom du workflow de CI (CI, avec la casse de ci.yml)', () => {
        expect(code).toMatch(/workflow_run:\s*\n\s+workflows: \[CI\]/);
        expect(readFileSync(resolve(RACINE, '.github/workflows/ci.yml'), 'utf8')).toMatch(/^name: CI\s*$/m);
        expect(code).not.toMatch(/workflows: \[ci\]/);
    });
    it('déclencheurs à garder : workflow_run, status, check_run, ready_for_review, workflow_dispatch pr, cron ; JAMAIS pull_request_review', () => {
        for (const t of ['workflow_run:', 'status:', 'check_run:', 'pull_request_target:', 'ready_for_review', 'workflow_dispatch:', 'schedule:']) expect(code, t).toContain(t);
        expect(code).not.toMatch(/pull_request_review/);
        expect(code).not.toMatch(/gh pr ready/);
    });
    it('permissions vides au niveau global ; un seul job ; un seul checkout, de la branche PAR DÉFAUT (jamais la tête de la PR) ; aucun secret', () => {
        expect(code).toMatch(/^permissions: \{\}\s*$/m);
        expect(code.match(/actions\/checkout@/g)).toHaveLength(1);
        expect(code).toContain('ref: ${{ github.event.repository.default_branch }}');
        expect(code).not.toMatch(/secrets\./);
        expect(code).not.toMatch(/ref:\s*\$\{\{\s*github\.(event\.pull_request\.head|head_ref)/);
    });
    it('actions épinglées par SHA de commit ; aucun texte de la PR (titre, corps) dans le workflow ; Node via .nvmrc (=24)', () => {
        const usages = [...code.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
        expect(usages.length).toBeGreaterThanOrEqual(2);
        for (const u of usages) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
        expect(code).not.toMatch(/github\.event\.pull_request\.(title|body)|head_commit/);
        expect(code).toContain("node-version-file: '.nvmrc'");
        expect(readFileSync(resolve(RACINE, '.nvmrc'), 'utf8').trim()).toBe('24');
        expect(code).toContain('node modeles/auto-merge/fusionner.mjs');
    });
    it('dépôt PUBLIC : pas de runner auto-hébergé (la condition du job refuse « self-hosted » hors dépôt privé)', () => {
        expect(code).toContain("(github.event.repository.private == true || !contains(vars.AUTOMERGE_RUNNER, 'self-hosted'))");
    });
    it('COPIES.md déclare les deux empreintes (gabarit du kit et adapté) et l\'adaptation est la SEULE ligne qui diffère', () => {
        const copies = readFileSync(resolve(RACINE, 'COPIES.md'), 'utf8');
        const sha = (t: string) => createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex');
        expect(copies).toContain(sha(yml));
        expect(copies).toContain('545bab9e1f29');
        const modele = yml.replace('workflows: [CI]', 'workflows: [ci]').replace("node-version-file: '.nvmrc'", 'node-version: "24"');
        expect(sha(modele).startsWith('545bab9e1f29')).toBe(true);
    });
});
