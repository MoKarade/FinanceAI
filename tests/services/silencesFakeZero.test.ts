import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCoupleProfileLines } from '../../services/claude';

/**
 * [COUPLE-CTX-FAKE-ZERO] + [TOOL-TAXSITUATION-FAKE-ZERO] — vague 1e, 2026-08-19.
 * « Silences qui cachent de l'argent » : deux surfaces qui parlent à un LLM.
 *
 * ⚠️ Les deux tickets étaient groupés sous le même diagnostic (« un `|| 0` publie un faux 0 $ »).
 * **Vérifié : ce diagnostic n'est juste que pour le PREMIER.** Dans le tool `get_tax_situation`, le
 * `(u.grossSalary || 0) * 12` est suivi d'un `.filter(g > 0)` : le conjoint est EXCLU, pas publié à
 * 0. Le défaut y est l'inverse — une DISPARITION silencieuse — et il est plus sournois, parce que le
 * system prompt déclare les payloads d'outils « ta SEULE source de vérité chiffrée ».
 *
 * Deux défauts, deux correctifs différents : rendre la valeur NON FINIE d'un côté (pour que la garde
 * `promptCad` reprenne son travail), NOMMER l'absence de l'autre.
 */

describe('[COUPLE-CTX-FAKE-ZERO] un salaire absent ne devient pas un « 0 $ » affirmé au modèle', () => {
    // ⚠️ Le correctif vit dans un COMPOSANT (`CoupleOptimizationCard`), mais ce qui compte est le
    // TEXTE qui part chez Claude. On teste donc le constructeur de prompt sur les deux formes de
    // contexte — c'est lui qui décide ce que le modèle lit.
    const ctx = (gross: number, net: number) => ({
        user1: { name: 'Marc', grossAnnual: gross, netAnnual: net },
        user2: { name: 'Anna', grossAnnual: NaN, netAnnual: NaN },
    });

    it('une valeur NON FINIE devient « (non disponible) », jamais « 0$ »', () => {
        const prompt = buildCoupleProfileLines(ctx(96_000, 68_000));

        // Non-vacuité : le prompt contient bien les deux conjoints et le montant connu.
        expect(prompt).toContain('Marc');
        expect(prompt).toContain('Anna');
        expect(prompt).toContain('96000$');

        // Le discriminant : Anna n'a pas de salaire saisi. Le modèle doit le SAVOIR.
        expect(prompt).toContain('(non disponible)');
        expect(prompt, 'un revenu inconnu est affirmé à 0 $ — le modèle bâtira des stratégies dessus')
            .not.toMatch(/Anna\s*:\s*brut\s*0\$/);
    });

    it('le composant ne rétablit PAS le `|| 0` (scan de source)', () => {
        // ⚠️ Le vrai correctif est l'ABSENCE d'une coercition, et une absence ne se teste pas au
        // contrat : rien dans la signature ne changerait si quelqu'un remettait `|| 0` « pour éviter
        // un NaN ». D'où le scan de source — patron déjà utilisé ici (`chartPrivacyScan`).
        const src = readFileSync(
            join(__dirname, '../../components/tax/CoupleOptimizationCard.tsx'), 'utf-8',
        );
        expect(src.length).toBeGreaterThan(500);            // anti-vacuité du scan
        expect(src).toContain('CoupleTaxContext');          // on lit bien le bon endroit
        for (const champ of ['grossSalary', 'netSalary']) {
            expect(src, `\`${champ} || 0\` est de retour : promptCad est de nouveau court-circuité`)
                .not.toMatch(new RegExp(`${champ}\\s*\\|\\|\\s*0`));
        }
    });
});

describe('[TOOL-TAXSITUATION-FAKE-ZERO] un conjoint exclu du calcul est NOMMÉ, pas effacé', () => {
    // Scan de source : le handler du tool est un `withState` async difficile à instancier ici, et ce
    // qui compte est structurel — le payload DOIT porter le champ, et le filtre DOIT rester.
    const src = readFileSync(join(__dirname, '../../mcp/tools/getTaxSituation.spec.ts'), 'utf-8');

    it('le payload publie `perUserOmitted`', () => {
        expect(src.length).toBeGreaterThan(1_000);          // anti-vacuité
        expect(src).toContain('perUser: perUserReports.map');   // on lit bien le payload

        // ⚠️ Un `toContain('perUserOmitted')` nu serait presque VACUEUX : la constante locale porte
        // déjà ce nom, donc l'assertion passerait même si le champ n'atteignait jamais le payload.
        // Vérifié par perturbation (retirer la ligne du payload la laissait VERTE). On vise donc la
        // ligne DU PAYLOAD, juste au-dessus de `perUser:` — c'est elle qui parle au modèle.
        expect(src, 'un conjoint sans brut disparaît du payload sans laisser de trace')
            .toMatch(/perUserOmitted,\n\s*perUser: perUserReports\.map/);
        // La raison est portée par la donnée, pas laissée au modèle à deviner.
        expect(src).toMatch(/reason:\s*'brut annuel inconnu/);
    });

    it('le champ est TOUJOURS présent, même vide', () => {
        // Un champ omis quand la liste est vide serait indiscernable de « l'outil ne le dit pas » :
        // le modèle ne pourrait pas distinguer « personne n'a été exclu » de « je n'en sais rien ».
        // `perUserOmitted` est passé sans garde conditionnelle dans l'objet du payload.
        expect(src).toMatch(/\n\s*perUserOmitted,\n/);
        expect(src).not.toMatch(/\.\.\.\(perUserOmitted/);   // pas de spread conditionnel
    });

    it('le filtre qui EXCLUT est toujours là (le correctif ne l’a pas remplacé)', () => {
        // ⚠️ La tentation serait d'inclure le conjoint avec un impôt à 0 : ce serait rétablir le faux
        // 0 $ que le ticket croyait déjà présent. On exclut ET on le dit — pas l'un ou l'autre.
        expect(src).toContain('.filter(({ grossAnnual: g }) => g > 0)');
    });
});
