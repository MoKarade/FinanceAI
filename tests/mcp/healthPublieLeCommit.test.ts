/**
 * [MCP-VERSION-FIGEE] `GET /health` publie le COMMIT déployé, pas seulement une version figée.
 *
 * POURQUOI (2026-09-21) : `MCP_SERVER_VERSION` vaut `0.11.0` depuis le 2026-07-13 alors que
 * **351 commits** ont touché le serveur — chiffre imprimé par le workflow de déploiement
 * lui-même. `/health` répondait donc `0.11.0` quoi qu'il arrive : une version qui ne varie
 * plus ne dit pas quel code tourne, elle donne l'ILLUSION de le dire. Conséquence mesurée ce
 * jour-là : impossible de trancher entre « le déploiement n'a pas embarqué le nouveau code »
 * et « le consommateur regarde ailleurs », et deux diagnostics FAUX ont été publiés avant que
 * Marc ne tranche en regardant son écran.
 *
 * ⚠️ Ce que la garde défend est le FAIT (« /health sait dire quel commit il sert »), jamais la
 * forme du JSON : elle interroge `buildSha`, et vérifie séparément que la route l'expose.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSha } from '../../mcp/bootstrap';
import { readCodeOnly } from '../helpers/source';

const SHA_VALIDE = 'cb3cc75e7d76ec3e08dff5b5d97b291adac8675a';

describe('[MCP-VERSION-FIGEE] le serveur sait dire quel code il porte', () => {
    it('rend le commit quand le déploiement l’a posé', () => {
        expect(buildSha({ FINANCEAI_BUILD_SHA: SHA_VALIDE })).toBe(SHA_VALIDE);
        expect(buildSha({ FINANCEAI_BUILD_SHA: `  ${SHA_VALIDE}  ` })).toBe(SHA_VALIDE);
    });

    it('rend `null` plutôt qu’un repli CRÉDIBLE quand il ne sait pas', () => {
        // ⚠️ Le cœur du lot : « je ne sais pas » doit rester RECONNAISSABLE. Un repli sur
        // `MCP_SERVER_VERSION`, sur `'inconnu'` ou sur une valeur tronquée reproduirait
        // exactement le défaut qu'on corrige — un identifiant de build faux est PIRE
        // qu'absent, parce qu'il fait croire qu'on sait (`no-fake-data`).
        expect(buildSha({})).toBeNull();
        expect(buildSha({ FINANCEAI_BUILD_SHA: '' })).toBeNull();
        expect(buildSha({ FINANCEAI_BUILD_SHA: '   ' })).toBeNull();
        expect(buildSha({ FINANCEAI_BUILD_SHA: 'cb3cc75e' })).toBeNull(); // tronqué
        expect(buildSha({ FINANCEAI_BUILD_SHA: 'inconnu' })).toBeNull();
        expect(buildSha({ FINANCEAI_BUILD_SHA: '0.11.0' })).toBeNull();
        // Un SHA « presque » valide : bonne longueur, caractère hors hexadécimal.
        expect(buildSha({ FINANCEAI_BUILD_SHA: 'z'.repeat(40) })).toBeNull();
    });

    it('la route /health EXPOSE ce commit (sinon la fonction ne sert à personne)', () => {
        // Source DÉCOMMENTÉE : le commentaire qui explique la règle vit juste au-dessus de
        // l'appel, et une garde de voisinage lirait sa propre justification
        // (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
        const code = readCodeOnly('mcp/http.ts', 'createHttpServer');
        // ⚠️ `readCodeOnly` BLANCHIT les commentaires au lieu de les supprimer (les gardes qui
        // reportent un numéro de ligne l'exigent) : une fenêtre en CARACTÈRES tomberait donc
        // sur du vide. On écrase les blancs avant de fenêtrer — mesuré, le 1er jet échouait
        // pile là-dessus.
        const bloc = code.slice(code.indexOf("url === '/health'")).replace(/[ \t\r\n]+/g, ' ');
        expect(bloc.slice(0, 200)).toContain('buildSha()');
    });

    it('le déploiement POSE la variable (une route qui la lit sans personne pour l’écrire est morte)', () => {
        // Jumelle indispensable : `buildSha` peut être parfait et rendre `null` pour toujours
        // si `mcp/deploy.sh` n'écrit jamais la variable — c'est la classe
        // `UN-CHAMP-TYPE-SANS-PRODUCTEUR-EST-UNE-INTENTION-JAMAIS-LIVREE`.
        // ⚠️ Lu en BRUT (shell : `readCodeOnly` ne décommente que du JS/TS) et ancré sur la
        // FORME D'UNE AFFECTATION, jamais sur le simple nom — qui figure aussi dans la prose.
        const sh = readFileSync('mcp/deploy.sh', 'utf8');
        expect(sh).toMatch(/FINANCEAI_BUILD_SHA=\$\{BUILD_SHA\}/);
        expect(sh).toMatch(/BUILD_SHA="\$\(git rev-parse HEAD/);
    });
});
