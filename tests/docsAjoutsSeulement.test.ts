// tests/docsAjoutsSeulement.test.ts
//
// [DOCS-PROTECTION] Les documents relus par les agents au démarrage ne se réécrivent pas en silence (injection persistante) :
//  - docs/claude/*.md (sauf lecons.md) et CLAUDE.md : une PR qui les touche exige l'attestation (chemins_label_validation) ;
//  - lecons.md, docs/CONVENTIONS.md : ajouts SAINS seulement ; HANDOVER.md, CHANGELOG.md, BACKLOG.md : lignes ajoutées saines, cocher/archiver admis.
// Le code testé (modeles/auto-merge/docsAjoutsSeulement.mjs, armer-docs.mjs) tourne dans NODE, avec le VRAI `attestationValide` du modèle et une FIXTURE de
// revues : jamais un vérificateur de substitution. Le patch est celui de l'API GitHub : il commence à « @@ », sans en-têtes ---/+++.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const RACINE = resolve(__dirname, '..');
const config = JSON.parse(readFileSync(resolve(RACINE, '.github/auto-merge.json'), 'utf8'));
const STRICT: string[] = config.chemins_ajouts_seulement;
const SURVEILLE: string[] = config.chemins_contenu_surveille;
const LISTES = { ajoutsSeulement: STRICT, contenuSurveille: SURVEILLE };
const SHA = 'b'.repeat(40);

const node = (script: string, entree: unknown) =>
    JSON.parse(execFileSync('node', [resolve(__dirname, 'helpers', script)], { input: JSON.stringify(entree), encoding: 'utf8' }));
interface Attestation { reviews: unknown; login: string; sha: string; userId?: number }
const docs = (fichiers: unknown, listes: unknown, attestation?: Attestation) => node('docsNode.mjs', { mode: 'docs', fichiers, listes, attestation });
const docsModifies = (fichiers: unknown, listes: unknown = LISTES): string | null => docs(fichiers, listes).code;
const controleDocs = (fichiers: unknown, listes: unknown = LISTES, attestation?: Attestation): { code: string; raison: string } | null => docs(fichiers, listes, attestation).decision;
const { CODES, RAISON_DOC, PLAFOND_LIGNES_AJOUTEES } = docs([], {}).constantes as { CODES: Record<string, string>; RAISON_DOC: string; PLAFOND_LIGNES_AJOUTEES: number };
const peutArmer = (pr: unknown, cfg: unknown): { armer: boolean; raison: string } => node('peutArmerNode.mjs', { pr, config: cfg }).decision;

const fichier = (path: string, patch: string | undefined, status = 'modified') => ({ path, status, patch });
const ajout = (...lignes: string[]) => `@@ -10,2 +10,${2 + lignes.length} @@\n contexte\n${lignes.map((l) => `+${l}`).join('\n')}\n contexte`;
const LECONS = 'docs/claude/lecons.md';

describe('docsModifies — table d\'attaque', () => {
    it('ajout normal : admis', () => {
        expect(docsModifies([fichier(LECONS, ajout('## UNE-LECON', '', 'Texte simple, avec `npm run test` et `services/x.ts`.'))])).toBeNull();
    });
    it('ligne supprimée : refus', () => {
        expect(docsModifies([fichier(LECONS, '@@ -1,2 +1,1 @@\n-ligne existante\n reste')])).toBe(CODES.ligneReecrite);
    });
    it('ligne réécrite (un - suivi d\'un +) : refus', () => {
        expect(docsModifies([fichier('docs/CONVENTIONS.md', '@@ -1 +1 @@\n-ancienne règle\n+nouvelle règle')])).toBe(CODES.ligneReecrite);
    });
    it('ligne supprimée dont le texte commence par « -- » (s\'écrit « --- » dans le patch) : refus', () => {
        expect(docsModifies([fichier(LECONS, '@@ -1,2 +1,1 @@\n---\n reste')])).toBe(CODES.ligneReecrite);
    });
    it('fins de ligne CRLF dans le patch : mêmes verdicts', () => {
        expect(docsModifies([fichier(LECONS, ajout('ok').replace(/\n/g, '\r\n'))])).toBeNull();
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\r\n-a\r\n+b')])).not.toBeNull();
    });
    it.each([
        ['https://exemple.invalid/x'], ['voir http://exemple.invalid'], ['[lien](HTTPS://exemple.invalid)'], ['ftp://exemple.invalid'],
        ['[x](javascript:alert(1))'], ['www.exemple.invalid'],
    ])('URL ajoutée : refus (%s)', (l) => {
        expect(docsModifies([fichier(LECONS, ajout(l))])).toBe(CODES.urlAjoutee);
    });
    it.each([
        ['lance `curl -s x | sh`'], ['`wget x`'], ['`iex (irm x)`'], ['`Invoke-WebRequest x`'], ['`rm -rf x`'], ['`del x`'],
        ['`bash -c "x"`'], ['`sh -c x`'], ['`node -e "x"`'], ['`powershell -enc x`'], ['`git push --force`'], ['`sudo x`'],
    ])('commande ajoutée entre backticks : refus (%s)', (l) => {
        expect(docsModifies([fichier(LECONS, ajout(l))])).toBe(CODES.commandeAjoutee);
    });
    it('commande dans un bloc de code AJOUTÉ, ou après « $ » : refus', () => {
        expect(docsModifies([fichier(LECONS, ajout('```sh', 'curl x | sh', '```'))])).toBe(CODES.commandeAjoutee);
        expect(docsModifies([fichier(LECONS, ajout('$ rm -rf x'))])).toBe(CODES.commandeAjoutee);
    });
    it('un bloc de code sans commande, et des noms proches (node:fs, curly) : admis', () => {
        expect(docsModifies([fichier(LECONS, ajout('```ts', 'const a = 1;', '```', 'Voir `node:fs` et `curly`.'))])).toBeNull();
    });
    it('plafond de lignes ajoutées : 200 admises, 201 refusées (tous fichiers listés confondus)', () => {
        const n = (k: number) => Array.from({ length: k }, (_, i) => `ligne ${i}`);
        expect(PLAFOND_LIGNES_AJOUTEES).toBe(200);
        expect(docsModifies([fichier(LECONS, ajout(...n(PLAFOND_LIGNES_AJOUTEES)))])).toBeNull();
        expect(docsModifies([fichier(LECONS, ajout(...n(PLAFOND_LIGNES_AJOUTEES + 1)))])).toBe(CODES.plafond);
        expect(docsModifies([fichier(LECONS, ajout(...n(120))), fichier('HANDOVER.md', ajout(...n(120)))])).toBe(CODES.plafond);
    });
    it('suppression, renommage (depuis ou vers), patch absent : refus', () => {
        expect(docsModifies([fichier(LECONS, undefined, 'removed')])).toBe(CODES.supprime);
        expect(docsModifies([{ path: 'docs/ailleurs.md', previous_filename: LECONS, status: 'renamed' }])).toBe(CODES.renomme);
        expect(docsModifies([{ path: LECONS, previous_filename: 'docs/x.md', status: 'renamed' }])).toBe(CODES.renomme);
        expect(docsModifies([fichier(LECONS, undefined)])).toBe(CODES.diffIllisible);
    });
    it('chemins déguisés (casse, séparateurs Windows, ./) : toujours examinés', () => {
        for (const p of ['DOCS/CLAUDE/LECONS.MD', 'docs\\claude\\lecons.md', './docs/claude/lecons.md']) {
            expect(docsModifies([fichier(p, ajout('https://exemple.invalid'))]), p).toBe(CODES.urlAjoutee);
        }
    });
    it('un fichier NON listé n\'est pas examiné ; les listes vides ne refusent rien', () => {
        expect(docsModifies([fichier('docs/autre.md', '@@ -1 +1 @@\n-a\n+https://x.invalid')])).toBeNull();
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\n-a\n+b')], { ajoutsSeulement: [], contenuSurveille: [] })).toBeNull();
    });
    it('nouveau fichier : ses lignes sont examinées comme des ajouts (URL refusée)', () => {
        expect(docsModifies([fichier(LECONS, ajout('ok'), 'added')])).toBeNull();
        expect(docsModifies([fichier(LECONS, ajout('https://x.invalid'), 'added')])).toBe(CODES.urlAjoutee);
    });
});

describe('documents à contenu surveillé (BACKLOG, HANDOVER, CHANGELOG) : cocher / archiver passe seul', () => {
    const BACKLOG = 'BACKLOG.md';
    it('cocher un item (- [ ] devient - [x]) et archiver (ligne supprimée) : admis', () => {
        expect(docsModifies([fichier(BACKLOG, '@@ -3 +3 @@\n-- [ ] [ID-1] tâche\n+- [x] [ID-1] tâche')])).toBeNull();
        expect(docsModifies([fichier(BACKLOG, '@@ -3,2 +3 @@\n-- [x] [ID-1] tâche\n reste')])).toBeNull();
        expect(docsModifies([fichier('HANDOVER.md', '@@ -1 +1 @@\n-ancien bandeau\n+nouveau bandeau')])).toBeNull();
    });
    it('les MÊMES contrôles s\'appliquent aux lignes ajoutées : URL, commande, bloc de code, plafond', () => {
        expect(docsModifies([fichier(BACKLOG, ajout('voir https://exemple.invalid'))])).toBe(CODES.urlAjoutee);
        expect(docsModifies([fichier('CHANGELOG.md', ajout('`curl x`'))])).toBe(CODES.commandeAjoutee);
        expect(docsModifies([fichier('HANDOVER.md', ajout('```sh', 'rm -rf x', '```'))])).toBe(CODES.commandeAjoutee);
        expect(docsModifies([fichier(BACKLOG, ajout(...Array.from({ length: 201 }, (_, i) => `l${i}`)))])).toBe(CODES.plafond);
    });
    it('suppression / renommage du fichier et diff illisible restent refusés', () => {
        expect(docsModifies([fichier(BACKLOG, undefined, 'removed')])).toBe(CODES.supprime);
        expect(docsModifies([fichier(BACKLOG, undefined)])).toBe(CODES.diffIllisible);
    });
    it('un fichier listé dans les DEUX listes reste strict', () => {
        const deux = { ajoutsSeulement: [BACKLOG], contenuSurveille: [BACKLOG] };
        expect(docsModifies([fichier(BACKLOG, '@@ -1 +1 @@\n-a\n+b')], deux)).toBe(CODES.ligneReecrite);
    });
});

describe('refus ATTESTABLES (controleDocs) — jugés par le VRAI attestationValide du modèle, sur une fixture de revues', () => {
    const revue = (over: Record<string, unknown> = {}) => ({ state: 'APPROVED', commit_id: SHA, user: { login: 'compte-securite', id: 1 }, submitted_at: '2026-09-26T10:00:00Z', ...over });
    const attestation = (reviews: unknown, over: Partial<Attestation> = {}): Attestation => ({ reviews, login: 'compte-securite', sha: SHA, ...over });
    const url = [fichier(LECONS, ajout('voir https://exemple.invalid/secret-de-la-pr'))];

    it('sans attestation : refus, raison FIXE (rien de la PR ne figure ici)', () => {
        const r = controleDocs(url);
        expect(r).toEqual({ code: CODES.urlAjoutee, raison: RAISON_DOC });
        expect(JSON.stringify(r)).not.toMatch(/exemple\.invalid|secret-de-la-pr|lecons/);
        expect(RAISON_DOC).toBe('attestation de pole-securite requise (document surveillé)');
    });
    it('attestation valide sur le SHA exact : passe', () => {
        expect(controleDocs(url, LISTES, attestation([revue()]))).toBeNull();
    });
    it('ancien SHA, autre compte, revue non approuvée, aucune revue, identifiant numérique différent, compte non configuré : refus', () => {
        expect(controleDocs(url, LISTES, attestation([revue({ commit_id: 'c'.repeat(40) })]))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, attestation([revue({ user: { login: 'quelquun-d-autre', id: 2 } })]))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, attestation([revue({ state: 'COMMENTED' })]))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, attestation([]))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, attestation(null))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, attestation([revue()], { userId: 99 }))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, attestation([revue()], { login: '' }))?.code).toBe(CODES.urlAjoutee);
    });
    it('tous les refus sont attestables : diff illisible, fichier supprimé, URL dans BACKLOG', () => {
        for (const f of [fichier('BACKLOG.md', undefined), fichier(LECONS, undefined, 'removed'), fichier('BACKLOG.md', ajout('https://exemple.invalid'))]) {
            expect(controleDocs([f])?.raison, f.path).toBe(RAISON_DOC);
            expect(controleDocs([f], LISTES, attestation([revue()])), f.path).toBeNull();
        }
    });
    it('rien à redire : null ; cocher un item de BACKLOG passe seul', () => {
        expect(controleDocs([fichier('BACKLOG.md', '@@ -3 +3 @@\n-- [ ] [ID-1] t\n+- [x] [ID-1] t')])).toBeNull();
    });
});

describe('armerAvecDocs (point d\'entrée) : la couche docs PUIS l\'armement du modèle, gh de test', () => {
    const ENV = { REPO: 'MoKarade/FinanceAI', NUMERO: '1081', SHA, ACTION: 'synchronize' };
    const PR = { state: 'OPEN', isDraft: false, isCrossRepository: false, labels: [], baseRefName: 'main', headRefOid: SHA, author: { login: 'MoKarade' }, autoMergeRequest: null };
    const revue = (over: Record<string, unknown> = {}) => ({ state: 'APPROVED', commit_id: SHA, user: { login: 'compte-securite', id: 1 }, submitted_at: '2026-09-26T10:00:00Z', ...over });
    const lancer = (fichiers: unknown[], over: { config?: unknown; reviews?: unknown[]; pr?: unknown } = {}) =>
        node('docsNode.mjs', { mode: 'armer', config: over.config ?? config, env: ENV, pr: over.pr ?? PR, fichiers, reviews: over.reviews ?? [] }) as
            { resultat?: { etat: string; raison: string; code?: string }; erreur: string | null; appels: string[]; lignes: string[] };
    const arme = (r: { appels: string[] }) => r.appels.some((a) => a.includes('--auto'));
    const desarme = (r: { appels: string[] }) => r.appels.some((a) => a.includes('--disable-auto'));
    const urlDansLecons = [fichier(LECONS, ajout('voir https://exemple.invalid/secret-de-la-pr'))];

    it('refus de document sans revue d\'attestation (même avec le compte réel configuré) : désarmée, JAMAIS armée, ligne de résumé FIXE sans texte de la PR', () => {
        const r = lancer(urlDansLecons);
        expect(arme(r)).toBe(false);
        expect(desarme(r)).toBe(true);
        expect(r.resultat).toMatchObject({ etat: 'desarme', code: CODES.urlAjoutee, raison: RAISON_DOC });
        expect(r.lignes).toEqual([`- PR #1081 : NON armée (désarmée si elle l'était) — code=${CODES.urlAjoutee} ; ${RAISON_DOC}`]);
        expect(JSON.stringify(r.lignes)).not.toMatch(/exemple\.invalid|lecons/);
    });
    it('document propre (cocher un item) : la main passe au modèle, qui ARME', () => {
        const r = lancer([fichier('BACKLOG.md', '@@ -3 +3 @@\n-- [ ] [ID-1] t\n+- [x] [ID-1] t')]);
        expect(arme(r)).toBe(true);
        expect(r.appels.find((a) => a.includes('--auto'))).toContain(`--match-head-commit ${SHA}`);
    });
    it('aucun document touché : le modèle arme un fichier ordinaire', () => {
        expect(arme(lancer([fichier('services/a.ts', ajout('ok'))]))).toBe(true);
    });
    it('avec un compte de test (variante du compte réel configuré) : revue APPROVED sur le SHA exact lève le refus, le modèle arme ; ancien SHA : reste désarmée', () => {
        const cfg = { ...config, securite_login: 'compte-securite', securite_user_id: 1 };
        expect(arme(lancer(urlDansLecons, { config: cfg, reviews: [revue()] }))).toBe(true);
        const ancien = lancer(urlDansLecons, { config: cfg, reviews: [revue({ commit_id: 'c'.repeat(40) })] });
        expect(arme(ancien)).toBe(false);
        expect(ancien.resultat?.code).toBe(CODES.urlAjoutee);
    });
    it('le refus du modèle reste entier : un chemin sensible n\'est pas armé même si la couche docs est satisfaite', () => {
        const r = lancer([fichier('api/_lib/relay.ts', ajout('ok'))]);
        expect(arme(r)).toBe(false);
    });
    it('échec fermé : une lecture qui plante désarme et fait échouer le job', () => {
        const r = lancer([{ path: 'x', status: 'modified', patch: '@@' }], { pr: { ...PR, headRefOid: 'pas-un-sha' } });
        expect(r.erreur).not.toBeNull();
        expect(arme(r)).toBe(false);
    });
    it('liste de motifs invalide dans la config : échec fermé', () => {
        const r = lancer(urlDansLecons, { config: { ...config, chemins_ajouts_seulement: 'docs/**' } });
        expect(r.erreur).toContain('chemins_ajouts_seulement : liste de motifs attendue');
        expect(arme(r)).toBe(false);
    });
});

describe('protection par attestation (chemins_label_validation) et configuration', () => {
    const armable = (path: string) => peutArmer({
        state: 'OPEN', isDraft: false, isCrossRepository: false, labels: [], headRefOid: SHA, baseRefName: 'main',
        fichiers: [{ path, status: 'modified', patch: ajout('ok') }],
    }, config);

    it('anti-vacuité : la config protège bien des fichiers, et un doc ordinaire reste armable', () => {
        expect(STRICT.length + SURVEILLE.length).toBeGreaterThanOrEqual(5);
        expect(armable('docs/autre.md').armer).toBe(true);
    });
    it('CLAUDE.md et TOUT docs/claude/*.md sauf lecons.md exigent l\'attestation (liste dérivée du dossier : un nouveau fichier doit y entrer)', () => {
        const fichiers = readdirSync(resolve(RACINE, 'docs/claude')).filter((f) => f.endsWith('.md') && f !== 'lecons.md');
        expect(fichiers.length).toBeGreaterThanOrEqual(13);
        for (const f of ['CLAUDE.md', ...fichiers.map((d) => `docs/claude/${d}`)]) {
            const d = armable(f);
            expect(d.armer, f).toBe(false);
        }
    });
    it('lecons.md n\'est PAS sous attestation (journal en ajouts seulement) mais sous la couche docs', () => {
        expect(armable(LECONS).armer).toBe(true);
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\n-a\n+b')])).not.toBeNull();
    });
    it('les listes de la config sont celles convenues', () => {
        expect(STRICT).toEqual([LECONS, 'docs/CONVENTIONS.md']);
        expect(SURVEILLE).toEqual(['BACKLOG.md', 'HANDOVER.md', 'CHANGELOG.md']);
    });
    it('les copies du modèle ne sont pas retouchées : la couche docs vit dans des fichiers À PART, hors COPIES.md', () => {
        const copies = readFileSync(resolve(RACINE, 'COPIES.md'), 'utf8');
        for (const nom of ['armer-docs.mjs', 'docsAjoutsSeulement.mjs', 'LISEZMOI-docs.md']) {
            expect(copies, nom).not.toMatch(new RegExp(`^\\| modeles/auto-merge/${nom.replace('.', '\\.')} \\|`, 'm'));
            expect(copies, `écart non déclaré : ${nom}`).toContain(nom);
        }
        const armerModele = readFileSync(resolve(RACINE, 'modeles/auto-merge/armer.mjs'), 'utf8');
        expect(armerModele).not.toContain('docsAjoutsSeulement');
    });
});
