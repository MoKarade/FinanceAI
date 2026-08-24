// tests/services/cidClampLimiteConsignee.test.ts
//
// [FISC-CID-CLAMP-EXCEDENT] Le clamp par SOURCE du crédit d'impôt pour dividendes est une limite
// ASSUMÉE, consignée en §3 de `FISCAL_REFERENCE.md`. Décision de Marc (2026-08-24) : consigner,
// ne pas corriger.
//
// ⚠️ POURQUOI UNE GARDE SUR DE LA DOCUMENTATION — et pourquoi elle ne fige PAS la borne.
// Un écart chiffré sans sa CAUSE se lit comme un défaut en attente et invite à le « corriger »
// (`UN-ECART-CHIFFRE-SANS-SA-CAUSE-INVITE-A-LE-CORRIGER`). Ici, la correction naïve n'est pas
// neutre : imputer l'excédent sur l'impôt TOTAL oblige à trancher l'ORDRE entre deux crédits non
// remboursables visant la même assiette (le CID et le crédit-don plafonné), ordre qu'aucune source
// ne fixe. Ce qui doit survivre, c'est donc le RAISONNEMENT, pas le montant : les bornes se
// re-mesurent et dépendent de l'indexation, les ancrer au dollar ferait de ce test une bombe.
//
// ⚠️ La garde vérifie AUSSI que le code renvoie à la section : un commentaire qui disparaît laisse
// le `Math.max(0, …)` nu, et un `Math.max(0, …)` nu se lit comme un oubli.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOC = readFileSync(resolve(__dirname, '../../docs/FISCAL_REFERENCE.md'), 'utf8');
const TITRE = 'Le CID est CLAMPÉ par SOURCE';

/** La section, bornée au prochain titre — jamais un offset arbitraire, qui laisserait un voisin
 *  satisfaire la garde (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE`). */
const section = (): string => {
    const i = DOC.indexOf(TITRE);
    expect(i, `section « ${TITRE} » absente de FISCAL_REFERENCE.md`).toBeGreaterThan(-1);
    const suivante = DOC.indexOf('\n### ', i + 1);
    return DOC.slice(i, suivante > i ? suivante : undefined);
};

describe('[FISC-CID-CLAMP-EXCEDENT] la limite est consignée AVEC sa cause', () => {
    it('la section existe et n’est pas vide (anti-vacuité : une section vide passerait tout le reste)', () => {
        expect(section().length).toBeGreaterThan(1200);
    });

    it('la CAUSE est nommée : le crédit est borné par la BANDE, pas par l’impôt total', () => {
        const s = section();
        expect(s).toMatch(/bande/i);
        expect(s).toMatch(/TOTAL/);
        // Le mécanisme qui rend la portée minuscule : le CID effectif est SOUS le plus bas taux
        // marginal positif, donc le clamp ne mord que là où il n'y a aucun autre impôt.
        expect(s).toMatch(/marginal/);
        expect(s).toMatch(/seuil/i);
        expect(s).toMatch(/aucun\s+autre\s+impôt/i);
    });

    it('la portée est MESURÉE, avec le balayage qui la borne', () => {
        const s = section();
        expect(s).toMatch(/MESURÉ/);
        expect(s).toMatch(/balayage/i);
        expect(s).toMatch(/combinaisons/i);
    });

    it('ce qu’un « correctif » DÉPLACERAIT est écrit, pas seulement le constat', () => {
        const s = section();
        expect(s).toMatch(/non remboursable/i);   // en droit réel, l'excédent est bien perdu
        expect(s).toMatch(/report/i);             // et le CID n'en a aucun, contrairement au don
        expect(s).toMatch(/ORDRE/);               // l'arbitrage que la correction imposerait
        expect(s).toMatch(/FA-6-CREDIT-CAP/);     // l'autre crédit qui vise la même assiette
        expect(s).toMatch(/conservateur/i);       // le sens dans lequel le modèle bougerait
    });

    it('la section renvoie à son ticket, et le code renvoie à la section', () => {
        expect(section()).toContain('FISC-CID-CLAMP-EXCEDENT');
        // Sans ce renvoi, le `Math.max(0, grossTax - cidAmount)` d'`utils/tax.ts` se lit comme un
        // oubli — c'est exactement la lecture qui a produit le ticket.
        const src = readFileSync(resolve(__dirname, '../../utils/tax.ts'), 'utf8');
        const i = src.indexOf('FISC-CID-CLAMP-EXCEDENT');
        expect(i, 'le renvoi a disparu d’utils/tax.ts').toBeGreaterThan(-1);
        expect(src.slice(i, i + 900)).toMatch(/FISCAL_REFERENCE/);
        expect(src.slice(i, i + 900)).toMatch(/Math\.max\(0, grossTax - cidAmount\)/);
    });
});
