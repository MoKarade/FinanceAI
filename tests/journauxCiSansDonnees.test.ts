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
