/**
 * [PRIV-PRIVATEAMOUNT-TITLE] Le `title` des primitives de masquage ne doit JAMAIS porter de valeur.
 *
 * ⚠️ LE TROU, tel que mesuré. `PrivateAmount` transmet sa prop `title` **sans masquage**, y compris
 * en mode privé — alors que tout son contrat est « la vraie valeur n'est plus dans le DOM du tout ».
 * Aujourd'hui aucun appelant ne lui passe un montant : tous les `title=` sont des phrases
 * explicatives FIXES. Donc pas de fuite active, et c'est précisément pour ça que le sujet dormait —
 * le jour où quelqu'un voudra « le montant exact au survol », la valeur fuira par un attribut,
 * copiable et inspectable, sans que rien ne rougisse.
 *
 * ⚠️ POURQUOI PAS « aligner PrivateAmount sur PrivateText » (ne plus rendre `title` en mode privé),
 * ce que suggérait l'audit a11y : ces `title` portent l'EXPLICATION (« Argent que tu ajoutes
 * toi-même »), pas la donnée. Les supprimer en mode discret retirerait de la compréhension sans
 * retirer la moindre fuite. La vraie règle n'est pas « pas de title », c'est « pas de VALEUR dans
 * le title » — d'où un critère d'INTERPOLATION.
 *
 * ⚠️⚠️ LA PREMIÈRE VERSION DE CETTE GARDE ÉTAIT AVEUGLE, et ça vaut plus que la garde elle-même.
 * Elle bornait la balise avec `<Private…[^>]*>` — or un `>` apparaît DANS la balise bien avant sa
 * fin, dès qu'un `className` interpolé contient une comparaison :
 *     <PrivateAmount className={`… ${totalFlow >= 0 ? 'a' : 'b'}`} title="…">
 * Le `[^>]*` s'arrêtait sur le `>` de `>=`, donc le `title` n'était JAMAIS lu. Mesuré : 3 des
 * appels réels de `ProjectionTooltip` sont exactement dans ce cas, et une fuite plantée derrière
 * laissait la garde VERTE. Ma preuve de discrimination d'origine ne l'avait pas vu parce que
 * j'avais posé la fuite sur une balise SANS comparaison — un cas favorable, choisi sans le savoir.
 * Trouvé par la revue automatique de la PR #646.
 * Leçon : borner une syntaxe imbriquée avec une classe de caractères négative est faux par
 * construction. Il faut compter la PROFONDEUR — et tester l'extracteur sur des cas de syntaxe,
 * pas seulement sur le dépôt (§ « l'extracteur, sur des cas construits » ci-dessous).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const RACINE = resolve(__dirname, '../..');

/** Tous les .tsx suivis par git (hors tests) — rapide, et jamais de fichier fantôme. */
const fichiers = (): string[] =>
    execSync('git ls-files "*.tsx"', { cwd: RACINE, encoding: 'utf8' })
        .split('\n')
        .filter((f) => f && !f.startsWith('tests/'));

/**
 * Balises `<PrivateAmount …>` / `<PrivateText …>` COMPLÈTES, bornées par PROFONDEUR d'accolades.
 *
 * ⚠️ C'est le correctif du défaut décrit en tête : un `>` à l'intérieur d'un `{…}` (comparaison,
 * générique, flèche) n'est PAS la fin de la balise. On ne ferme que sur un `>` à profondeur 0.
 */
export const balisesPrimitives = (src: string): string[] => {
    const out: string[] = [];
    const debut = /<Private(?:Amount|Text)\b/g;
    let m: RegExpExecArray | null;
    while ((m = debut.exec(src)) !== null) {
        let i = m.index;
        let profondeur = 0;
        for (; i < src.length; i++) {
            const c = src[i];
            if (c === '{') profondeur++;
            else if (c === '}') profondeur--;
            else if (c === '>' && profondeur === 0) { i++; break; }
        }
        out.push(src.slice(m.index, i));
    }
    return out;
};

/** Contenus des `title={…}` portés par ces balises (le `title="texte"` littéral est hors sujet). */
export const titresInterpolables = (src: string): string[] =>
    balisesPrimitives(src)
        .map((b) => b.match(/\stitle=\{([\s\S]*?)\}(?=[\s/>])/)?.[1])
        .filter((t): t is string => typeof t === 'string');

// ── L'extracteur, sur des cas construits ────────────────────────────────────────────────────────
// ⚠️ Ces cas sont la VRAIE garde de la garde. Balayer le dépôt ne prouve rien tant que l'extracteur
// peut être aveugle : c'est exactement ce qui s'est passé.
describe('[PRIV-PRIVATEAMOUNT-TITLE] l’extracteur voit à travers la syntaxe', () => {
    it('title littéral après un `>=` interpolé : la balise est lue EN ENTIER', () => {
        const src = '<PrivateAmount className={`x ${a >= 0 ? "p" : "q"}`} title="explication fixe">1</PrivateAmount>';
        expect(balisesPrimitives(src)[0]).toContain('title=');
    });

    // LE cas qui échouait : la fuite est DERRIÈRE la comparaison.
    it('title INTERPOLÉ après un `>=` : détecté (l’ancienne garde ne le voyait pas)', () => {
        const src = '<PrivateAmount className={`x ${a >= 0 ? "p" : "q"}`} title={`Valeur ${v}$`}>1</PrivateAmount>';
        expect(titresInterpolables(src)).toEqual(['`Valeur ${v}$`']);
    });

    it('flèche et générique dans la balise ne la tronquent pas non plus', () => {
        const src = '<PrivateText title={fn(() => x)} className={cls}>a</PrivateText>';
        expect(titresInterpolables(src)).toEqual(['fn(() => x)']);
    });

    it('un title littéral n’est jamais un offender', () => {
        expect(titresInterpolables('<PrivateAmount title="fixe">1</PrivateAmount>')).toEqual([]);
    });

    it('balise auto-fermante et absence de title : aucun faux positif', () => {
        expect(titresInterpolables('<PrivateText className={c} />')).toEqual([]);
    });
});

// ── Le dépôt ────────────────────────────────────────────────────────────────────────────────────
describe('[PRIV-PRIVATEAMOUNT-TITLE] aucune VALEUR dans le `title` d’une primitive', () => {
    it('tous les `title` sont des chaînes fixes, sans interpolation', () => {
        const fautifs: string[] = [];
        for (const f of fichiers()) {
            for (const titre of titresInterpolables(readFileSync(resolve(RACINE, f), 'utf8'))) {
                // `${` = valeur calculée. Une explication fixe n'en a jamais.
                if (titre.includes('${')) fautifs.push(`${f} → title={${titre}}`);
            }
        }
        expect(fautifs, `un \`title\` interpolé peut porter une valeur en clair en mode discret :\n${fautifs.join('\n')}`)
            .toEqual([]);
    });

    // ⚠️ Anti-vacuité : un motif cassé rendrait tout vert en ne regardant RIEN.
    it('la garde REGARDE vraiment le dépôt', () => {
        const total = fichiers().reduce(
            (n, f) => n + balisesPrimitives(readFileSync(resolve(RACINE, f), 'utf8')).length,
            0,
        );
        expect(total, 'aucune primitive trouvée — le scan est cassé').toBeGreaterThan(20);
    });

    // ⚠️ Et anti-vacuité SUR LES TITLES : si plus aucun `title` n'était vu (le défaut d'origine !),
    // le test principal passerait au vert sans rien examiner.
    it('elle voit encore des `title` portés par des primitives', () => {
        const avecTitle = fichiers().reduce(
            (n, f) => n + balisesPrimitives(readFileSync(resolve(RACINE, f), 'utf8'))
                .filter((b) => /\stitle=/.test(b)).length,
            0,
        );
        // MESURÉ le 2026-08-17 : 253 primitives dans le dépôt, dont exactement 3 portent un
        // `title`. Seuil = la mesure, pas une estimation — c'est un CLIQUET : s'il descend, soit
        // un `title` a disparu (à constater sciemment), soit l'extracteur est redevenu aveugle,
        // ce qui est exactement le symptôme du défaut de la v1.
        expect(avecTitle, 'plus aucun `title` vu — symptôme EXACT du défaut de la v1').toBeGreaterThanOrEqual(3);
    });
});
