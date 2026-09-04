// tests/services/debtChampsSansLecteur.test.ts
//
// [DEBT-UI-CHAMPS-RESTANTS] Inventaire des champs de `Debt` que PERSONNE ne lit.
//
// ⚠️ Ce lot devait AJOUTER trois champs au formulaire de dettes. Le recensement l'a REFUSÉ, et c'est
// le résultat du lot : `limit`, `amortizationYears` et `isInterestDeductible` existent dans le TYPE,
// mais aucun code de production ne lit celui d'une DETTE. Leur offrir une saisie aurait fabriqué
// trois champs dont le remplissage ne change rien — une interface qui promet un effet qu'elle n'a
// pas, c'est `no-fake-data` appliqué à l'interaction. C'est l'IMAGE MIROIR de
// `UN-CHAMP-TYPE-SANS-PRODUCTEUR-EST-UNE-INTENTION-JAMAIS-LIVREE` : ici il y a des producteurs
// (`amortizationYears` en a quatre) et zéro consommateur.
//
// ⚠️ Cet inventaire doit savoir MOURIR (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`). Il porte donc
// DEUX assertions par champ : « aucun lecteur inattendu n'est apparu » ET « les lecteurs attendus
// sont toujours là ». Le jour où quelqu'un branche vraiment un de ces champs, ce fichier rougit et
// exige qu'on retire son entrée — un inventaire qui ne sait que refuser des ajouts survit à sa
// raison d'être.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { describe, it, expect } from 'vitest';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';

const RACINES = ['components', 'services', 'mcp', 'hooks', 'store', 'utils'];

const fichiersProd = (): string[] => {
    const out: string[] = [];
    const marcher = (dir: string): void => {
        for (const e of readdirSync(dir)) {
            const p = join(dir, e);
            if (statSync(p).isDirectory()) { marcher(p); continue; }
            if (!['.ts', '.tsx'].includes(extname(p))) continue;
            if (p.includes('.test.') || p.includes('.spec.')) continue;
            out.push(p);
        }
    };
    for (const r of RACINES) marcher(r);
    return out;
};

/** Un accès de propriété, avec le RÉCEPTEUR qui le précède : c'est lui qui dit sur QUEL type on lit. */
const ACCES = (champ: string): RegExp => new RegExp(`([A-Za-z_$][\\w$]*)\\s*\\??\\.\\s*${champ}\\b`, 'g');

/**
 * Les seuls accès tolérés : ils portent le MÊME NOM sur un AUTRE type. Chacun est nommé avec sa
 * raison — une exclusion sans justification se lit comme un détail déjà tranché
 * (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`).
 */
const TOLERES: ReadonlyArray<{ champ: string; fichier: string; recepteur: string; raison: string }> = [
    {
        champ: 'amortizationYears', fichier: 'services/projection/rentalMonth.ts', recepteur: 'rp',
        raison: "`RentalProperty.amortizationYears` — un IMMEUBLE LOCATIF, pas une dette. Homonyme.",
    },
    {
        champ: 'amortizationYears', fichier: 'services/claude.ts', recepteur: 'ctx',
        raison: "Contexte de prompt IA : l'amortissement de l'HYPOTHÈQUE du ménage, pas d'une dette.",
    },
    {
        champ: 'amortizationYears', fichier: 'mcp/ingest/applyDocument/debt.ts', recepteur: 'doc',
        raison: "`DebtPayload.amortizationYears` — c'est une ÉCRITURE vers la dette, pas une lecture.",
    },
];

const CHAMPS_SANS_LECTEUR = ['limit', 'amortizationYears', 'isInterestDeductible'] as const;

interface Hit { fichier: string; recepteur: string; }

const scanner = (champ: string): { hits: Hit[]; partCode: number } => {
    const hits: Hit[] = [];
    let brut = 0, code = 0;
    for (const f of fichiersProd()) {
        const src = readFileSync(f, 'utf8');
        const decom = stripCommentsJsx(src);
        brut += src.length; code += decom.replace(/\s/g, '').length;
        for (const m of decom.matchAll(ACCES(champ))) hits.push({ fichier: f, recepteur: m[1] });
    }
    return { hits, partCode: code / Math.max(1, brut) };
};

describe('[DEBT-UI-CHAMPS-RESTANTS] trois champs de `Debt` que personne ne lit', () => {
    it("le scanner VOIT réellement des accès de propriété (anti-vacuité)", () => {
        // Sans ce témoin, « zéro lecteur » se prouverait à partir de « le scanner ne trouve rien ».
        // On vise un champ dont on SAIT qu'il est lu partout dans le moteur.
        const { hits, partCode } = scanner('balance');
        expect(hits.length).toBeGreaterThan(20);
        // Le décommentage laisse du vrai code : mesuré ~0,66 sur cet ensemble de fichiers de prod.
        expect(partCode).toBeGreaterThan(0.4);
    });

    for (const champ of CHAMPS_SANS_LECTEUR) {
        it(`\`Debt.${champ}\` n'a AUCUN lecteur — et si ça change, cette entrée doit MOURIR`, () => {
            const { hits } = scanner(champ);
            const attendus = TOLERES.filter(t => t.champ === champ);
            const inattendus = hits.filter(h =>
                !attendus.some(t => h.fichier === t.fichier && h.recepteur === t.recepteur));
            expect(inattendus.map(h => `${h.fichier} (${h.recepteur}.${champ})`),
                `Un lecteur est apparu : ce champ n'est plus mort. Retire son entrée de `
                + `CHAMPS_SANS_LECTEUR et donne-lui sa saisie — c'est le moment, plus avant.`,
            ).toEqual([]);
            // Second sens : les homonymes déclarés doivent TOUJOURS exister. S'ils disparaissent,
            // l'exemption survit à son objet et couvrirait un vrai lecteur ajouté au même endroit
            // (`ENTREE-D-INVENTAIRE-FANTOME`).
            for (const t of attendus) {
                expect(hits.some(h => h.fichier === t.fichier && h.recepteur === t.recepteur),
                    `Exemption périmée (${t.fichier}, ${t.recepteur}.${champ}) : ${t.raison}`).toBe(true);
            }
        });
    }

    it("le champ témoin `balance`, lui, est bien LU — la règle ne dit pas « aucun champ n'est lu »", () => {
        // Contre-épreuve : si le scanner classait tout en « sans lecteur », les trois assertions
        // ci-dessus passeraient pour une raison qui n'a rien à voir avec les champs visés.
        const { hits } = scanner('balance');
        const recepteurs = new Set(hits.map(h => h.recepteur));
        expect(recepteurs.size).toBeGreaterThan(3);
    });
});
