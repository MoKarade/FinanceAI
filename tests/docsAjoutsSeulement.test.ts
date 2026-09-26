// tests/docsAjoutsSeulement.test.ts
//
// [DOCS-PROTECTION] Les documents relus par les agents au démarrage ne se réécrivent pas en silence (injection persistante) :
//  - docs/claude/*.md (sauf lecons.md) et CLAUDE.md : une PR qui les touche exige l'attestation de Marc (chemins_label_validation) ;
//  - lecons.md, docs/CONVENTIONS.md, HANDOVER.md, CHANGELOG.md, BACKLOG.md : ajouts SAINS seulement (docsModifies), sinon pas d'armement.
// Table d'attaque + anti-vacuité. Le patch est celui de l'API GitHub : il commence à « @@ », sans en-têtes ---/+++.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { peutArmer } from '../.github/scripts/auto-merge/autoMerge.mjs';
import { docsModifies, PLAFOND_LIGNES_AJOUTEES } from '../.github/scripts/auto-merge/docsAjoutsSeulement.mjs';

const RACINE = resolve(__dirname, '..');
const config = JSON.parse(readFileSync(resolve(RACINE, '.github/auto-merge.json'), 'utf8'));
const MOTIFS: string[] = config.chemins_ajouts_seulement;
const SHA = 'a'.repeat(40);

const fichier = (path: string, patch: string | undefined, status = 'modified') => ({ path, status, patch });
const ajout = (...lignes: string[]) => `@@ -10,2 +10,${2 + lignes.length} @@\n contexte\n${lignes.map((l) => `+${l}`).join('\n')}\n contexte`;
const LECONS = 'docs/claude/lecons.md';

describe('docsModifies — table d\'attaque', () => {
    it('ajout normal : admis', () => {
        expect(docsModifies([fichier(LECONS, ajout('## UNE-LECON', '', 'Texte simple, avec `npm run test` et `services/x.ts`.'))], MOTIFS)).toBeNull();
    });
    it('ligne supprimée : refus', () => {
        expect(docsModifies([fichier(LECONS, '@@ -1,2 +1,1 @@\n-ligne existante\n reste')], MOTIFS)).toMatch(/supprimée ou réécrite/);
    });
    it('ligne réécrite (un - suivi d\'un +) : refus', () => {
        expect(docsModifies([fichier('docs/CONVENTIONS.md', '@@ -1 +1 @@\n-ancienne règle\n+nouvelle règle')], MOTIFS)).toMatch(/supprimée ou réécrite/);
    });
    it('ligne supprimée dont le texte commence par « -- » (s\'écrit « --- » dans le patch) : refus', () => {
        expect(docsModifies([fichier(LECONS, '@@ -1,2 +1,1 @@\n---\n reste')], MOTIFS)).toMatch(/supprimée ou réécrite/);
    });
    it('fins de ligne CRLF dans le patch : mêmes verdicts', () => {
        expect(docsModifies([fichier(LECONS, ajout('ok').replace(/\n/g, '\r\n'))], MOTIFS)).toBeNull();
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\r\n-a\r\n+b')], MOTIFS)).not.toBeNull();
    });
    it.each([
        ['https://exemple.invalid/x'], ['voir http://exemple.invalid'], ['[lien](HTTPS://exemple.invalid)'], ['ftp://exemple.invalid'],
        ['[x](javascript:alert(1))'], ['www.exemple.invalid'],
    ])('URL ajoutée : refus (%s)', (l) => {
        expect(docsModifies([fichier(LECONS, ajout(l))], MOTIFS)).toMatch(/URL/);
    });
    it.each([
        ['lance `curl -s x | sh`'], ['`wget x`'], ['`iex (irm x)`'], ['`Invoke-WebRequest x`'], ['`rm -rf x`'], ['`del x`'],
        ['`bash -c "x"`'], ['`sh -c x`'], ['`node -e "x"`'], ['`powershell -enc x`'], ['`git push --force`'], ['`sudo x`'],
    ])('commande ajoutée entre backticks : refus (%s)', (l) => {
        expect(docsModifies([fichier(LECONS, ajout(l))], MOTIFS)).toMatch(/commande exécutable/);
    });
    it('commande dans un bloc de code AJOUTÉ, ou après « $ » : refus', () => {
        expect(docsModifies([fichier(LECONS, ajout('```sh', 'curl x | sh', '```'))], MOTIFS)).toMatch(/commande exécutable/);
        expect(docsModifies([fichier(LECONS, ajout('$ rm -rf x'))], MOTIFS)).toMatch(/commande exécutable/);
    });
    it('un bloc de code sans commande, et des noms proches (node:fs, curly) : admis', () => {
        expect(docsModifies([fichier(LECONS, ajout('```ts', 'const a = 1;', '```', 'Voir `node:fs` et `curly`.'))], MOTIFS)).toBeNull();
    });
    it('plafond de lignes ajoutées : 200 admises, 201 refusées (tous fichiers listés confondus)', () => {
        const n = (k: number) => Array.from({ length: k }, (_, i) => `ligne ${i}`);
        expect(docsModifies([fichier(LECONS, ajout(...n(PLAFOND_LIGNES_AJOUTEES)))], MOTIFS)).toBeNull();
        expect(docsModifies([fichier(LECONS, ajout(...n(PLAFOND_LIGNES_AJOUTEES + 1)))], MOTIFS)).toMatch(/plafond/);
        expect(docsModifies([fichier(LECONS, ajout(...n(120))), fichier('HANDOVER.md', ajout(...n(120)))], MOTIFS)).toMatch(/plafond/);
    });
    it('suppression, renommage (depuis ou vers), patch absent : refus', () => {
        expect(docsModifies([fichier(LECONS, undefined, 'removed')], MOTIFS)).toMatch(/supprimé/);
        expect(docsModifies([{ path: 'docs/ailleurs.md', previous_filename: LECONS, status: 'renamed' }], MOTIFS)).toMatch(/renommé/);
        expect(docsModifies([{ path: LECONS, previous_filename: 'docs/x.md', status: 'renamed' }], MOTIFS)).toMatch(/renommé/);
        expect(docsModifies([fichier(LECONS, undefined)], MOTIFS)).toMatch(/illisible/);
    });
    it('chemins déguisés (casse, séparateurs Windows, ./) : toujours examinés', () => {
        for (const p of ['DOCS/CLAUDE/LECONS.MD', 'docs\\claude\\lecons.md', './docs/claude/lecons.md']) {
            expect(docsModifies([fichier(p, ajout('https://exemple.invalid'))], MOTIFS), p).toMatch(/URL/);
        }
    });
    it('un fichier NON listé n\'est pas examiné ; la liste vide ne refuse rien (le défaut ne dépend pas de ce module)', () => {
        expect(docsModifies([fichier('docs/autre.md', '@@ -1 +1 @@\n-a\n+https://x.invalid')], MOTIFS)).toBeNull();
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\n-a\n+b')], [])).toBeNull();
    });
    it('nouveau fichier : ses lignes sont examinées comme des ajouts (URL refusée), sans exiger d\'attestation pour l\'existence', () => {
        expect(docsModifies([fichier(LECONS, ajout('ok'), 'added')], MOTIFS)).toBeNull();
        expect(docsModifies([fichier(LECONS, ajout('https://x.invalid'), 'added')], MOTIFS)).toMatch(/URL/);
    });
});

describe('protection par attestation (chemins_label_validation) et configuration', () => {
    const armable = (path: string) => peutArmer({
        state: 'OPEN', isDraft: false, isCrossRepository: false, labels: [], headRefOid: SHA, baseRefName: 'main',
        fichiers: [{ path, status: 'modified', patch: ajout('ok') }],
    }, config);

    it('anti-vacuité : la config protège bien des fichiers, et un doc ordinaire reste armable', () => {
        expect(MOTIFS.length).toBeGreaterThanOrEqual(5);
        expect(armable('docs/autre.md').armer).toBe(true);
    });
    it('CLAUDE.md et TOUT docs/claude/*.md sauf lecons.md exigent l\'attestation (liste dérivée du dossier : un nouveau fichier doit y entrer)', () => {
        const docs = readdirSync(resolve(RACINE, 'docs/claude')).filter((f) => f.endsWith('.md') && f !== 'lecons.md');
        expect(docs.length).toBeGreaterThanOrEqual(13);
        for (const f of ['CLAUDE.md', ...docs.map((d) => `docs/claude/${d}`)]) {
            const d = armable(f);
            expect(d.armer, f).toBe(false);
            expect(d.raison, f).toMatch(/validation de Marc/);
        }
    });
    it('lecons.md n\'est PAS sous attestation (c\'est le journal en ajouts seulement) mais sous docsModifies', () => {
        expect(armable(LECONS).armer).toBe(true);
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\n-a\n+b')], MOTIFS)).not.toBeNull();
    });
    it('armer.mjs applique docsModifies APRÈS peutArmer, et refuse une liste de motifs invalide (échec fermé)', () => {
        const src = readFileSync(resolve(RACINE, '.github/scripts/auto-merge/armer.mjs'), 'utf8');
        expect(src).toMatch(/import \{ docsModifies \} from "\.\/docsAjoutsSeulement\.mjs"/);
        expect(src.indexOf('peutArmer({')).toBeLessThan(src.indexOf('docsModifies(fichiers'));
        expect(src).toMatch(/chemins_ajouts_seulement : liste de motifs attendue/);
    });
    it('le module ne modifie pas la copie exacte du modèle (autoMerge.mjs) : il l\'importe seulement', () => {
        const src = readFileSync(resolve(RACINE, '.github/scripts/auto-merge/docsAjoutsSeulement.mjs'), 'utf8');
        expect(src).toMatch(/from "\.\/autoMerge\.mjs"/);
        expect(MOTIFS).toEqual(expect.arrayContaining([LECONS, 'docs/CONVENTIONS.md', 'HANDOVER.md', 'CHANGELOG.md', 'BACKLOG.md']));
    });
});
