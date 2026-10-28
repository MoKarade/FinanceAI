/**
 * @vitest-environment jsdom
 *
 * [SANITIZE-PROTO] `sanitizeContext` et la clé `__proto__`.
 *
 * ══ POURQUOI CE FICHIER EXISTE ══════════════════════════════════════════════════════
 *
 * Aikido signale `services/errorLogger.ts:142` en sévérité 75 — la plus haute de tout le
 * scan du 18/09 — sous `AIK_js_prototype_pollution_recursive_func_call`, en annonçant que
 * ça « change le comportement de l'application ».
 *
 * ⚠️ CETTE ANNONCE EST FAUSSE, ET LE DÉFAUT EST QUAND MÊME RÉEL. Les deux faits sont
 * mesurés SÉPARÉMENT ici, parce que les confondre mène à deux erreurs opposées : croire à
 * une faille globale (et paniquer), ou conclure au faux positif (et laisser le vrai bug).
 *
 *   1. `Object.prototype` n'est JAMAIS touché — `out` est un objet neuf à chaque appel.
 *      Aucune pollution globale, aucun autre objet de l'application affecté.
 *   2. MAIS la clé `__proto__` DISPARAISSAIT de l'entrée de journal persistée, en silence.
 *
 * ⚠️ UNE FIXTURE ÉCRITE À LA MAIN NE DISCRIMINE PAS. `{ __proto__: … }` en littéral ne
 * crée AUCUNE propriété propre — c'est l'accesseur hérité — donc `Object.entries()` n'y
 * voit rien et le cas ne se produit jamais. Il faut un `JSON.parse` RÉEL. C'est la classe
 * `UNE-FIXTURE-AUX-MAUVAIS-NOMS-DE-CHAMPS-EST-UNE-FIXTURE-VIDE` : une fixture qui ne
 * reproduit pas la forme réelle de l'entrée est une fixture vide.
 *
 * Et ce n'est pas théorique : deux sources `JSON.parse` non typées sont documentées dans ce
 * dépôt sous `[BACKUP-SCHEMA-NON-TYPE]` — le backup JSON et le blob `financeai-storage`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { logError, getErrors, clearErrors, onLogEntry } from '../../services/errorLogger';

beforeEach(() => {
    localStorage.clear();
    clearErrors();
});

/** Un contexte tel qu'il arrive VRAIMENT d'un backup ou du blob de stockage. */
function contexteDepuisJson(): Record<string, unknown> {
    // `JSON.parse` crée `__proto__` comme propriété PROPRE. Un littéral, non.
    return JSON.parse('{"__proto__":{"injecte":true},"compte":"Chèque","niveau":3}');
}

describe('[SANITIZE-PROTO] la clé `__proto__` d\'un JSON.parse survit au sanitiseur', () => {
    it('la fixture reproduit bien la forme réelle — sinon tout le reste est vide', () => {
        // ANTI-VACUITÉ, et c'est le cas le plus important du fichier : si `JSON.parse`
        // cessait de produire une propriété propre, les cas suivants passeraient en ne
        // vérifiant RIEN, et le test entier deviendrait décoratif.
        const brut = contexteDepuisJson();
        expect(Object.getOwnPropertyNames(brut)).toContain('__proto__');
        expect(Object.entries(brut).map(([k]) => k)).toContain('__proto__');
        // Et la démonstration que le littéral, lui, ne sert à rien :
        const litteral = { __proto__: { injecte: true }, compte: 'Chèque' };
        expect(Object.getOwnPropertyNames(litteral)).not.toContain('__proto__');
    });

    it('l\'entrée PERSISTÉE garde la clé — c\'est ce qui était perdu', () => {
        logError({ source: 'storage', message: 'restauration de backup', context: contexteDepuisJson() });

        // ⚠️ LA PERTE SE MESURE APRÈS L'ALLER-RETOUR `JSON.stringify` → `JSON.parse` du
        // stockage, pas en mémoire : avec `out = {}`, l'affectation remplaçait le prototype,
        // et `JSON.stringify` n'énumère pas un prototype — la clé s'évaporait là.
        const contexte = getErrors()[0].context as Record<string, unknown>;
        expect(Object.getOwnPropertyNames(contexte)).toContain('__proto__');
        // Les clés voisines ne doivent pas avoir souffert au passage.
        expect(contexte.compte).toBe('Chèque');
        expect(contexte.niveau).toBe(3);
    });

    it('la clé est une propriété PROPRE, jamais un prototype remplacé', () => {
        let vu: Record<string, unknown> | undefined;
        const stop = onLogEntry(e => { vu = e.context as Record<string, unknown>; });
        logError({ source: 'storage', message: 'x', context: contexteDepuisJson() });
        stop();

        expect(vu).toBeDefined();
        // La distinction qui EST le correctif : propriété propre (bon) contre prototype
        // remplacé (le défaut). `Object.getPrototypeOf` tranche sans ambiguïté.
        expect(Object.prototype.hasOwnProperty.call(vu!, '__proto__')).toBe(true);
        expect(Object.getPrototypeOf(vu!)).toBeNull();
    });

    it('`Object.prototype` reste INTACT — l\'annonce d\'Aikido était surestimée', () => {
        logError({
            source: 'storage',
            message: 'tentative',
            context: JSON.parse('{"__proto__":{"polluant":"oui"}}'),
        });
        // Si la pollution était globale, un objet quelconque hériterait de `polluant`.
        // Ce cas documente que ça n'a JAMAIS été le cas, avant comme après le correctif :
        // il ne discrimine donc pas le changement, il borne la portée du signalement.
        expect(({} as Record<string, unknown>).polluant).toBeUndefined();
        expect((Object.prototype as unknown as Record<string, unknown>).polluant).toBeUndefined();
    });

    it('la récursion protège AUSSI les niveaux imbriqués', () => {
        // Le correctif tient en une ligne, mais cette ligne est traversée à CHAQUE niveau :
        // un objet imbriqué est passé par le même chemin. Sans ce cas, on pourrait corriger
        // la racine et laisser la profondeur cassée sans que rien ne le dise.
        logError({
            source: 'storage',
            message: 'imbriqué',
            context: JSON.parse('{"a":{"b":{"__proto__":{"injecte":true},"garde":"oui"}}}'),
        });
        const a = getErrors()[0].context as Record<string, Record<string, Record<string, unknown>>>;
        const profond = a.a.b;
        expect(Object.getOwnPropertyNames(profond)).toContain('__proto__');
        expect(profond.garde).toBe('oui');
    });

    it('les clés sensibles restent masquées — le correctif ne desserre aucune garde', () => {
        // `sanitizeContext` existe d'abord pour la PII (`SH5`). Changer la création de l'objet
        // ne doit rien y changer : sans ce cas, une régression de masquage passerait pour un
        // effet de bord acceptable du correctif de prototype.
        logError({
            source: 'storage',
            message: 'pii',
            context: JSON.parse('{"__proto__":{"x":1},"salary":120000,"api_key":"abc","compte":"ok"}'),
        });
        const c = getErrors()[0].context as Record<string, unknown>;
        expect(c.salary).toBe('[redacted]');
        expect(c.api_key).toBe('[redacted]');
        expect(c.compte).toBe('ok');
    });
});
