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
import { docsModifies, controleDocs, CODES, RAISON_DOC, PLAFOND_LIGNES_AJOUTEES } from '../.github/scripts/auto-merge/docsAjoutsSeulement.mjs';

const RACINE = resolve(__dirname, '..');
const config = JSON.parse(readFileSync(resolve(RACINE, '.github/auto-merge.json'), 'utf8'));
const STRICT: string[] = config.chemins_ajouts_seulement;
const SURVEILLE: string[] = config.chemins_contenu_surveille;
const LISTES = { ajoutsSeulement: STRICT, contenuSurveille: SURVEILLE };
const SHA = 'a'.repeat(40);

const fichier = (path: string, patch: string | undefined, status = 'modified') => ({ path, status, patch });
const ajout = (...lignes: string[]) => `@@ -10,2 +10,${2 + lignes.length} @@\n contexte\n${lignes.map((l) => `+${l}`).join('\n')}\n contexte`;
const LECONS = 'docs/claude/lecons.md';

describe('docsModifies — table d\'attaque', () => {
    it('ajout normal : admis', () => {
        expect(docsModifies([fichier(LECONS, ajout('## UNE-LECON', '', 'Texte simple, avec `npm run test` et `services/x.ts`.'))], LISTES)).toBeNull();
    });
    it('ligne supprimée : refus', () => {
        expect(docsModifies([fichier(LECONS, '@@ -1,2 +1,1 @@\n-ligne existante\n reste')], LISTES)).toBe(CODES.ligneReecrite);
    });
    it('ligne réécrite (un - suivi d\'un +) : refus', () => {
        expect(docsModifies([fichier('docs/CONVENTIONS.md', '@@ -1 +1 @@\n-ancienne règle\n+nouvelle règle')], LISTES)).toBe(CODES.ligneReecrite);
    });
    it('ligne supprimée dont le texte commence par « -- » (s\'écrit « --- » dans le patch) : refus', () => {
        expect(docsModifies([fichier(LECONS, '@@ -1,2 +1,1 @@\n---\n reste')], LISTES)).toBe(CODES.ligneReecrite);
    });
    it('fins de ligne CRLF dans le patch : mêmes verdicts', () => {
        expect(docsModifies([fichier(LECONS, ajout('ok').replace(/\n/g, '\r\n'))], LISTES)).toBeNull();
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\r\n-a\r\n+b')], LISTES)).not.toBeNull();
    });
    it.each([
        ['https://exemple.invalid/x'], ['voir http://exemple.invalid'], ['[lien](HTTPS://exemple.invalid)'], ['ftp://exemple.invalid'],
        ['[x](javascript:alert(1))'], ['www.exemple.invalid'],
    ])('URL ajoutée : refus (%s)', (l) => {
        expect(docsModifies([fichier(LECONS, ajout(l))], LISTES)).toBe(CODES.urlAjoutee);
    });
    it.each([
        ['lance `curl -s x | sh`'], ['`wget x`'], ['`iex (irm x)`'], ['`Invoke-WebRequest x`'], ['`rm -rf x`'], ['`del x`'],
        ['`bash -c "x"`'], ['`sh -c x`'], ['`node -e "x"`'], ['`powershell -enc x`'], ['`git push --force`'], ['`sudo x`'],
    ])('commande ajoutée entre backticks : refus (%s)', (l) => {
        expect(docsModifies([fichier(LECONS, ajout(l))], LISTES)).toBe(CODES.commandeAjoutee);
    });
    it('commande dans un bloc de code AJOUTÉ, ou après « $ » : refus', () => {
        expect(docsModifies([fichier(LECONS, ajout('```sh', 'curl x | sh', '```'))], LISTES)).toBe(CODES.commandeAjoutee);
        expect(docsModifies([fichier(LECONS, ajout('$ rm -rf x'))], LISTES)).toBe(CODES.commandeAjoutee);
    });
    it('un bloc de code sans commande, et des noms proches (node:fs, curly) : admis', () => {
        expect(docsModifies([fichier(LECONS, ajout('```ts', 'const a = 1;', '```', 'Voir `node:fs` et `curly`.'))], LISTES)).toBeNull();
    });
    it('plafond de lignes ajoutées : 200 admises, 201 refusées (tous fichiers listés confondus)', () => {
        const n = (k: number) => Array.from({ length: k }, (_, i) => `ligne ${i}`);
        expect(docsModifies([fichier(LECONS, ajout(...n(PLAFOND_LIGNES_AJOUTEES)))], LISTES)).toBeNull();
        expect(docsModifies([fichier(LECONS, ajout(...n(PLAFOND_LIGNES_AJOUTEES + 1)))], LISTES)).toBe(CODES.plafond);
        expect(docsModifies([fichier(LECONS, ajout(...n(120))), fichier('HANDOVER.md', ajout(...n(120)))], LISTES)).toBe(CODES.plafond);
    });
    it('suppression, renommage (depuis ou vers), patch absent : refus', () => {
        expect(docsModifies([fichier(LECONS, undefined, 'removed')], LISTES)).toBe(CODES.supprime);
        expect(docsModifies([{ path: 'docs/ailleurs.md', previous_filename: LECONS, status: 'renamed' }], LISTES)).toBe(CODES.renomme);
        expect(docsModifies([{ path: LECONS, previous_filename: 'docs/x.md', status: 'renamed' }], LISTES)).toBe(CODES.renomme);
        expect(docsModifies([fichier(LECONS, undefined)], LISTES)).toBe(CODES.diffIllisible);
    });
    it('chemins déguisés (casse, séparateurs Windows, ./) : toujours examinés', () => {
        for (const p of ['DOCS/CLAUDE/LECONS.MD', 'docs\\claude\\lecons.md', './docs/claude/lecons.md']) {
            expect(docsModifies([fichier(p, ajout('https://exemple.invalid'))], LISTES), p).toBe(CODES.urlAjoutee);
        }
    });
    it('un fichier NON listé n\'est pas examiné ; la liste vide ne refuse rien (le défaut ne dépend pas de ce module)', () => {
        expect(docsModifies([fichier('docs/autre.md', '@@ -1 +1 @@\n-a\n+https://x.invalid')], LISTES)).toBeNull();
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\n-a\n+b')], { ajoutsSeulement: [], contenuSurveille: [] })).toBeNull();
    });
    it('nouveau fichier : ses lignes sont examinées comme des ajouts (URL refusée), sans exiger d\'attestation pour l\'existence', () => {
        expect(docsModifies([fichier(LECONS, ajout('ok'), 'added')], LISTES)).toBeNull();
        expect(docsModifies([fichier(LECONS, ajout('https://x.invalid'), 'added')], LISTES)).toBe(CODES.urlAjoutee);
    });
});

describe('documents à contenu surveillé (BACKLOG, HANDOVER, CHANGELOG) : cocher / archiver passe seul', () => {
    const BACKLOG = 'BACKLOG.md';
    it('cocher un item (- [ ] devient - [x]) et archiver (ligne supprimée) : admis', () => {
        expect(docsModifies([fichier(BACKLOG, '@@ -3 +3 @@\n-- [ ] [ID-1] tâche\n+- [x] [ID-1] tâche')], LISTES)).toBeNull();
        expect(docsModifies([fichier(BACKLOG, '@@ -3,2 +3 @@\n-- [x] [ID-1] tâche\n reste')], LISTES)).toBeNull();
        expect(docsModifies([fichier('HANDOVER.md', '@@ -1 +1 @@\n-ancien bandeau\n+nouveau bandeau')], LISTES)).toBeNull();
    });
    it('les MÊMES contrôles s\'appliquent aux lignes ajoutées : URL, commande, bloc de code, plafond', () => {
        expect(docsModifies([fichier(BACKLOG, ajout('voir https://exemple.invalid'))], LISTES)).toBe(CODES.urlAjoutee);
        expect(docsModifies([fichier('CHANGELOG.md', ajout('`curl x`'))], LISTES)).toBe(CODES.commandeAjoutee);
        expect(docsModifies([fichier('HANDOVER.md', ajout('```sh', 'rm -rf x', '```'))], LISTES)).toBe(CODES.commandeAjoutee);
        expect(docsModifies([fichier(BACKLOG, ajout(...Array.from({ length: 201 }, (_, i) => `l${i}`)))], LISTES)).toBe(CODES.plafond);
    });
    it('suppression / renommage du fichier et diff illisible restent refusés', () => {
        expect(docsModifies([fichier(BACKLOG, undefined, 'removed')], LISTES)).toBe(CODES.supprime);
        expect(docsModifies([fichier(BACKLOG, undefined)], LISTES)).toBe(CODES.diffIllisible);
    });
    it('un fichier listé dans les DEUX listes reste strict', () => {
        const deux = { ajoutsSeulement: [BACKLOG], contenuSurveille: [BACKLOG] };
        expect(docsModifies([fichier(BACKLOG, '@@ -1 +1 @@\n-a\n+b')], deux)).toBe(CODES.ligneReecrite);
    });
});

describe('refus ATTESTABLES (controleDocs) — la revue de pole-securite lève le refus, sur le SHA exact', () => {
    // Stand-in du contrat de `attestationValide` (modèle Atelier 1.6.0) : vrai seulement pour le compte dédié ET le SHA exact de la PR.
    const attesteurPour = (shaAttendu: string, revue: { login: string; sha: string }) => () => revue.login === 'compte-securite' && revue.sha === shaAttendu;
    const SHA_PR = 'b'.repeat(40);
    const url = [fichier(LECONS, ajout('voir https://exemple.invalid/secret-de-la-pr'))];
    it('sans attestation : refus, raison FIXE (rien de la PR ne figure ici)', () => {
        const r = controleDocs(url, LISTES, undefined);
        expect(r).toEqual({ code: CODES.urlAjoutee, raison: RAISON_DOC });
        expect(JSON.stringify(r)).not.toMatch(/exemple\.invalid|secret-de-la-pr|lecons/);
        expect(RAISON_DOC).toBe('attestation de pole-securite requise (document surveillé)');
    });
    it('attestation valide sur le SHA exact : passe', () => {
        expect(controleDocs(url, LISTES, attesteurPour(SHA_PR, { login: 'compte-securite', sha: SHA_PR }))).toBeNull();
    });
    it('attestation d un ANCIEN SHA, d un autre compte, ou vérificateur qui plante ou répond « peut-être » : refus (échec fermé)', () => {
        expect(controleDocs(url, LISTES, attesteurPour(SHA_PR, { login: 'compte-securite', sha: 'c'.repeat(40) }))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, attesteurPour(SHA_PR, { login: 'quelquun-d-autre', sha: SHA_PR }))?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, () => { throw new Error('boom'); })?.code).toBe(CODES.urlAjoutee);
        expect(controleDocs(url, LISTES, (() => 'oui') as never)?.code).toBe(CODES.urlAjoutee);
    });
    it('tous les refus sont attestables : diff illisible, fichier supprimé, URL dans BACKLOG', () => {
        const ok = () => true;
        for (const f of [fichier('BACKLOG.md', undefined), fichier(LECONS, undefined, 'removed'), fichier('BACKLOG.md', ajout('https://exemple.invalid'))]) {
            expect(controleDocs([f], LISTES, undefined)?.raison, f.path).toBe(RAISON_DOC);
            expect(controleDocs([f], LISTES, ok), f.path).toBeNull();
        }
    });
    it('rien à redire : null, sans même appeler le vérificateur ; cocher un item de BACKLOG passe seul', () => {
        let appels = 0;
        expect(controleDocs([fichier('BACKLOG.md', '@@ -3 +3 @@\n-- [ ] [ID-1] t\n+- [x] [ID-1] t')], LISTES, () => { appels++; return true; })).toBeNull();
        expect(appels).toBe(0);
    });
    it('armer.mjs passe un vérificateur qui répond NON tant que attestationValide n est pas dans la copie du modèle', () => {
        const src = readFileSync(resolve(RACINE, '.github/scripts/auto-merge/armer.mjs'), 'utf8');
        expect(src).toMatch(/controleDocs\(fichiers, listesDocs, \(\) => false\)/);
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
        expect(docsModifies([fichier(LECONS, '@@ -1 +1 @@\n-a\n+b')], LISTES)).not.toBeNull();
    });
    it('armer.mjs applique controleDocs APRÈS peutArmer, et refuse une liste de motifs invalide (échec fermé)', () => {
        const src = readFileSync(resolve(RACINE, '.github/scripts/auto-merge/armer.mjs'), 'utf8');
        expect(src).toMatch(/import \{ controleDocs \} from "\.\/docsAjoutsSeulement\.mjs"/);
        expect(src.indexOf('peutArmer({')).toBeLessThan(src.indexOf('controleDocs(fichiers'));
        expect(src).toMatch(/\$\{cle\} : liste de motifs attendue/);
    });
    it('le module ne modifie pas la copie exacte du modèle (autoMerge.mjs) : il l\'importe seulement', () => {
        const src = readFileSync(resolve(RACINE, '.github/scripts/auto-merge/docsAjoutsSeulement.mjs'), 'utf8');
        expect(src).toMatch(/from "\.\/autoMerge\.mjs"/);
        expect(STRICT).toEqual([LECONS, 'docs/CONVENTIONS.md']);
        expect(SURVEILLE).toEqual(['BACKLOG.md', 'HANDOVER.md', 'CHANGELOG.md']);
    });
});
