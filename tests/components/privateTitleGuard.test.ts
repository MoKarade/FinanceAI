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
 * ⚠️ POURQUOI UN SCAN DE SOURCE ET PAS UN TEST DE RENDU. Une valeur qui sort par un ATTRIBUT
 * échappe au grep du DOM rendu quand le composant est mocké, et surtout : le défaut n'existe pas
 * encore. On ne teste pas un comportement, on ferme une PORTE. C'est la même famille que la garde
 * `tickFormatter`/`formatter` de Recharts (revue #608).
 *
 * ⚠️ POURQUOI PAS « aligner PrivateAmount sur PrivateText » (ne plus rendre `title` en mode privé),
 * ce que suggérait l'audit a11y : ces `title` portent l'EXPLICATION (« Argent que tu ajoutes
 * toi-même »), pas la donnée. Les supprimer en mode discret retirerait de la compréhension sans
 * retirer la moindre fuite — on perdrait deux fois. La vraie règle n'est pas « pas de title », c'est
 * « pas de VALEUR dans le title ».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const RACINE = resolve(__dirname, '../..');

/** Tous les .tsx du repo (hors node_modules / dist), via git : rapide et sans faux fichiers. */
const fichiers = (): string[] =>
    execSync('git ls-files "*.tsx"', { cwd: RACINE, encoding: 'utf8' })
        .split('\n')
        .filter((f) => f && !f.startsWith('tests/'));

/**
 * Extrait les `title={...}` portés par une balise `<PrivateAmount` / `<PrivateText`.
 * ⚠️ On borne au CONTENU de la balise (`[^>]*`) : sans ça, un `title` d'un élément voisin serait
 * attribué à la primitive, et la garde crierait au loup sur du code sain.
 */
const titresDesPrimitives = (src: string): string[] => {
    const out: string[] = [];
    const balise = /<Private(?:Amount|Text)\b[^>]*>/g;
    for (const m of src.match(balise) ?? []) {
        const t = m.match(/\stitle=\{([^}]*)\}/);
        if (t) out.push(t[1]);
    }
    return out;
};

describe('[PRIV-PRIVATEAMOUNT-TITLE] aucune VALEUR dans le `title` d’une primitive de masquage', () => {
    it('tous les `title` sont des chaînes littérales, sans interpolation', () => {
        const fautifs: string[] = [];
        for (const f of fichiers()) {
            const src = readFileSync(resolve(RACINE, f), 'utf8');
            for (const titre of titresDesPrimitives(src)) {
                // ⚠️ `${` = interpolation, donc une valeur calculée. Une explication fixe n'en a
                // aucune. C'est le critère le plus simple qui sépare exactement les deux cas.
                if (titre.includes('${')) fautifs.push(`${f} → title={${titre}}`);
            }
        }
        expect(fautifs, `un \`title\` interpolé peut porter une valeur en clair en mode discret :\n${fautifs.join('\n')}`)
            .toEqual([]);
    });

    // ⚠️ Anti-vacuité : si le motif ne matchait plus rien (renommage, changement de syntaxe), la
    // garde ci-dessus passerait au vert en ne regardant RIEN. On exige donc qu'elle voie encore
    // des primitives — c'est le contrôle qui empêche une garde de mourir en silence.
    it('la garde REGARDE vraiment quelque chose (sinon elle est verte pour rien)', () => {
        const total = fichiers().reduce(
            (n, f) => n + (readFileSync(resolve(RACINE, f), 'utf8').match(/<Private(?:Amount|Text)\b/g)?.length ?? 0),
            0,
        );
        expect(total, 'aucune primitive trouvée — le motif de scan est cassé').toBeGreaterThan(20);
    });
});
