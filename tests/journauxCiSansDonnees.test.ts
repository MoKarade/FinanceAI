// tests/journauxCiSansDonnees.test.ts
//
// [PTF-JOURNAL-PUBLIC] Les journaux GitHub Actions d'un dépôt PUBLIC sont publics. Le cron
// « Rafraîchir les prix » imprimait la réponse ENTIÈRE du serveur (`cat /tmp/refresh_out`), qui
// liste les symboles rafraîchis et sautés : la composition du portefeuille réel de Marc, publiée
// toutes les 6 h depuis des mois. Aucune garde ne regardait les workflows — la garde de
// confidentialité (tests/confidentialitePortefeuille.test.ts) lit les FICHIERS, pas ce que les
// jobs IMPRIMENT à l'exécution.
//
// Ce que la garde interdit : qu'un workflow imprime tel quel un corps de réponse ou un fichier
// temporaire (`cat /tmp/…`, `cat "$…"` sur une sortie de curl). Les workflows impriment un RÉSUMÉ
// filtré (`jq` avec des comptes), jamais la donnée.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOSSIER = resolve(__dirname, '../.github/workflows');

/** Lignes qui IMPRIMENT un fichier temporaire tel quel (commentaires YAML exclus). */
export const imprimeUnCorpsBrut = (contenu: string): number[] =>
    contenu.split('\n').flatMap((ligne, i) => {
        const code = ligne.replace(/(^|\s)#.*$/, '');
        return /\bcat\s+["']?\/tmp\//.test(code) ? [i + 1] : [];
    });

describe('[PTF-JOURNAL-PUBLIC] aucun workflow n\'imprime un corps de réponse brut', () => {
    it('balaie tous les workflows', () => {
        const fichiers = readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f));
        // Anti-vacuité : les deux crons qui appellent le serveur existent toujours.
        expect(fichiers).toContain('refresh-prices.yml');
        expect(fichiers).toContain('fintable-sync.yml');
        const fautes = fichiers.flatMap((f) =>
            imprimeUnCorpsBrut(readFileSync(resolve(DOSSIER, f), 'utf8')).map((l) => `${f}:${l}`));
        expect(fautes, `corps de réponse imprimé tel quel dans un journal PUBLIC :\n${fautes.join('\n')}`).toEqual([]);
    });

    it.each([
        ['le défaut d\'origine', '          cat /tmp/refresh_out; echo', [1]],
        ['avec guillemets', '  cat "/tmp/out.json"', [1]],
        ['un commentaire qui en parle', '  # on ne fait plus cat /tmp/refresh_out', []],
        ['le résumé filtré', "  jq -c '{ok}' /tmp/refresh_out", []],
    ])('détecteur : %s', (_nom, ligne, attendu) => {
        expect(imprimeUnCorpsBrut(ligne)).toEqual(attendu);
    });
});

// ── [PTF-JOURNAL-PUBLIC-ERREURS] LISTE BLANCHE des programmes jq des workflows ────────────────────
// Un message d'exception est du texte libre (l'erreur de `JSON.parse` de Node reproduit un morceau de
// l'entrée). Un détecteur de NOMS de champs libres serait contournable (`jq '.'`, `jq -c .`, `.[]`, `..`,
// `to_entries`, `tostring`, `@json`, `-r`…). On inverse : CHAQUE programme jq d'un workflow doit être ÉGAL
// (espaces normalisés) à un programme connu ci-dessous, dont chaque valeur imprimée est un booléen, un nombre
// ou un code d'une LISTE FERMÉE. Toute modification d'un filtre exige donc de modifier CE test, donc une revue.
// Un `jq` sans programme entre apostrophes (`jq -c . f`, `jq -f prog.jq`) est refusé d'office.

const normaliser = (p: string): string => p.replace(/\s+/g, ' ').trim();

export const PROGRAMMES_JQ_AUTORISES: Record<string, string[]> = {
    'fintable-sync.yml': [
        'def b: if type == "boolean" then . else null end; '
        + '{ok: (.ok | b), conflict: (.conflict | b), erreur_signalee: (.error != null)}',
    ],
    'refresh-prices.yml': [
        'def b: if type == "boolean" then . else null end; '
        + 'def code(liste): if . as $v | liste | index($v) then . else "autre" end; '
        + '{ok: (.ok | b), conflict: (.conflict | b), erreur_signalee: (.error != null), saved: (.saved | b), '
        + 'rafraichis: ((.refreshed // []) | length), inchanges: ((.unchanged // []) | length), '
        + 'sautes: ((.skipped // []) | map(.reason | code(["no-quote","invalid-price","currency-mismatch","error"])) '
        + '| group_by(.) | map({(.[0]): length}) | add), '
        + 'fx: {ecriture: (.fx.ecriture | code(["taux","diagnostic","aucune","echec"])), '
        + 'cause: (.fx.cause | code(["ok","partiel","perimee","reseau","http","reponse-illisible","manuel","jamais-tente"]))}}',
    ],
};

/** Ce qui, dans un workflow, n'est pas un programme jq autorisé (commentaires YAML exclus). */
export const jqNonAutorises = (contenu: string, autorises: string[]): string[] => {
    const code = contenu.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
    const nbJq = (code.match(/\bjq\b/g) ?? []).length;
    const programmes = [...code.matchAll(/\bjq\b[^'\n]*'([^']*)'/g)].map((m) => normaliser(m[1]));
    const permis = new Set(autorises.map(normaliser));
    const fautes = programmes.filter((p) => !permis.has(p));
    if (programmes.length !== nbJq) fautes.push(`${nbJq - programmes.length} appel(s) jq sans programme entre apostrophes`);
    return fautes;
};

describe('[PTF-JOURNAL-PUBLIC-ERREURS] aucun workflow n\'imprime le texte d\'une erreur serveur', () => {
    it('chaque programme jq de chaque workflow est sur la liste blanche', () => {
        const fichiers = readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f));
        // Anti-vacuité : les deux crons ont bien leur programme, et la liste ne mentionne aucun fichier disparu.
        for (const f of Object.keys(PROGRAMMES_JQ_AUTORISES)) expect(fichiers, `workflow disparu : ${f}`).toContain(f);
        const fautes = fichiers.flatMap((f) =>
            jqNonAutorises(readFileSync(resolve(DOSSIER, f), 'utf8'), PROGRAMMES_JQ_AUTORISES[f] ?? [])
                .map((p) => `${f} : ${p}`));
        expect(fautes, `jq non autorisé (journal PUBLIC) :\n${fautes.join('\n')}`).toEqual([]);
        // Chaque programme autorisé est réellement utilisé (une entrée périmée masquerait un retrait).
        for (const [f, liste] of Object.entries(PROGRAMMES_JQ_AUTORISES)) {
            const code = readFileSync(resolve(DOSSIER, f), 'utf8');
            for (const p of liste) expect(normaliser(code).includes(normaliser(p).slice(0, 40)), `entrée périmée : ${f}`).toBe(true);
        }
    });

    it.each([
        ['le défaut d\'origine', "jq -c '{ok, conflict, error}' /tmp/x"],
        ['le point seul, entre apostrophes', "jq '.' /tmp/x"],
        ['le point seul, sans apostrophes', 'jq -c . /tmp/x'],
        ['-r sur un champ libre', "jq -r '.error' /tmp/x"],
        ['itération', "jq -c '.[]' /tmp/x"],
        ['descente récursive', "jq '..' /tmp/x"],
        ['to_entries', "jq -c 'to_entries' /tmp/x"],
        ['tostring', "jq '.error | tostring' /tmp/x"],
        ['@json', "jq '@json' /tmp/x"],
        ['programme en fichier', 'jq -f prog.jq /tmp/x'],
        ['champ libre ajouté au bon programme', "jq -c 'def b: if type == \"boolean\" then . else null end; {ok: (.ok | b), message: .message}' /tmp/x"],
    ])('détecteur : %s → refusé', (_nom, ligne) => {
        expect(jqNonAutorises(ligne, PROGRAMMES_JQ_AUTORISES['fintable-sync.yml']).length).toBeGreaterThan(0);
    });

    it('le programme autorisé passe, avec d\'autres espaces ; un commentaire qui parle de jq est ignoré', () => {
        const [p] = PROGRAMMES_JQ_AUTORISES['fintable-sync.yml'];
        expect(jqNonAutorises(`  jq -c '${p.replace(/; /g, ';\n     ')}' /tmp/x`, [p])).toEqual([]);
        expect(jqNonAutorises("  # jq '.error' /tmp/x", [p])).toEqual([]);
    });
});
