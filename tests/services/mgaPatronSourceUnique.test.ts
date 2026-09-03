/**
 * [MGA-PATRON-5-COPIES] Le patron d'indexation MGA a une SOURCE UNIQUE — et une seule VITESSE.
 *
 * ⚠️ CE QUE LE TICKET DEMANDAIT DE TRANCHER, ET LA RÉPONSE. Il signalait cinq copies du patron
 * `base × (1 + (inflation + 0,5)/100)^n` et notait que « la divergence a DÉJÀ commencé » :
 * `taxJanuary` utilise l'exposant `nextLoopYear − LAST_KNOWN_RRSP_YEAR` là où les quatre autres
 * utilisent `yearsElapsed`. Il demandait de TRAITER cette divergence, pas de l'écraser.
 *
 * **Elle est VOULUE et correcte.** Une extrapolation porte DEUX paramètres — la VITESSE et l'ANCRE :
 *   • quatre sites partent d'une base connue pour l'année COURANTE (MGA de la RRQ, plafond RQAP,
 *     maximum assurable de l'AE) → on prolonge depuis le début de la projection ;
 *   • `taxJanuary` part d'une base lue dans une TABLE qui s'arrête à sa dernière année publiée →
 *     on prolonge depuis CETTE année-là.
 * Les uniformiser aurait re-fabriqué la marche que `UNE-ANCRE-D-EXTRAPOLATION-EN-DUR-FABRIQUE-UNE-MARCHE`
 * a corrigée (+4,54 % en une année, mesuré). Ce qui est mis en commun est donc la VITESSE seule ;
 * l'ancre et le nombre d'années restent chez l'appelant.
 *
 * ⚠️ Ce lot ne déplace AUCUN montant : l'arithmétique est identique au caractère près.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';
import { projeterAuPatronMga, MGA_EXCES_SUR_INFLATION_PP } from '../../services/projection/helpers';

const fichiersMoteur = (): string[] => {
    const out: string[] = [];
    const marcher = (dir: string): void => {
        for (const e of readdirSync(dir)) {
            const p = join(dir, e);
            if (extname(p) === '') { marcher(p); continue; }
            if (extname(p) !== '.ts' || p.includes('.test.')) continue;
            out.push(p);
        }
    };
    marcher('services');
    return out;
};

/** La forme recopiée que ce lot supprime : un « + 0.5 » divisé par 100 dans une puissance. */
const COPIE_DU_PATRON = /\+\s*0\.5\s*\)\s*\/\s*100/;

describe('[MGA-PATRON-5-COPIES] une seule écriture de la vitesse d\'indexation', () => {
    it('aucun module ne RÉ-IMPLÉMENTE le patron hors de sa source unique', () => {
        const offenders: string[] = [];
        let codeTotal = 0, brutTotal = 0;
        for (const f of fichiersMoteur()) {
            const brut = readFileSync(f, 'utf8');
            // Source DÉCOMMENTÉE, par PRÉCAUTION — et la précaution est aujourd'hui REDONDANTE,
            // mesuré : remplacer `stripCommentsJsx(brut)` par `brut` ne fait rougir personne. La
            // raison est fragile : la prose française écrit « inflation + 0,5 pp » avec une
            // VIRGULE, et le motif cherche le POINT décimal de JavaScript. Le jour où un
            // commentaire cite le code tel quel — la façon la plus naturelle d'expliquer un
            // patron — la garde accuserait le fichier qui la documente. On garde le décommentage
            // et on ÉCRIT qu'il ne tire pas encore, plutôt que d'inventer une fixture qui
            // n'exerce rien (`SCAN-QUI-MATCHE-LA-PROSE`, re-payé cinq fois dans ce dépôt).
            const code = stripCommentsJsx(brut);
            brutTotal += brut.replace(/\s/g, '').length;
            codeTotal += code.replace(/\s/g, '').length;
            if (f.endsWith(join('projection', 'helpers.ts'))) continue; // LA source unique
            code.split('\n').forEach((l, i) => {
                if (COPIE_DU_PATRON.test(l)) offenders.push(`${f}:${i + 1}  ${l.trim().slice(0, 100)}`);
            });
        }
        // Anti-vacuité AGRÉGÉE, mesurée sur CETTE portée : le seuil est posé sous la mesure, pas
        // par habitude (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`).
        expect(codeTotal / brutTotal).toBeGreaterThan(0.45);
        expect(offenders, 'le patron MGA est recopié — appelle `projeterAuPatronMga` de `helpers.ts`.')
            .toEqual([]);
    });

    it('le scan TIRE : il reconnaît la forme que ce lot vient de retirer', () => {
        // Sans ce cas, « zéro offender » ne distingue pas « tout est propre » d'un motif mort.
        // Le témoin est la ligne RÉELLE de `childrenReee.ts` avant ce lot.
        expect(COPIE_DU_PATRON.test(
            "    RQAP_MAX_INCOME * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);")).toBe(true);
        // …et il laisse passer un autre demi-point qui n'est pas ce patron.
        expect(COPIE_DU_PATRON.test('const marge = (taux + 0.5) * 100;')).toBe(false);
    });

    it('la fonction applique bien la vitesse « inflation + un demi-point »', () => {
        // Le FAIT, pas la forme : à 2 % d'inflation, un an de projection donne +2,5 %.
        expect(projeterAuPatronMga(1000, 2, 1)).toBeCloseTo(1025, 6);
        expect(projeterAuPatronMga(1000, 2, 0)).toBe(1000);
        expect(MGA_EXCES_SUR_INFLATION_PP).toBe(0.5);
        // Deux ans COMPOSENT, ils ne s'additionnent pas — un facteur plat donnerait 1050.
        expect(projeterAuPatronMga(1000, 2, 2)).toBeCloseTo(1050.625, 6);
        expect(projeterAuPatronMga(1000, 2, 2)).not.toBeCloseTo(1050, 2);
    });

    it('l\'ANCRE reste chez l\'appelant : la fonction ne connaît que le nombre d\'années', () => {
        // C'est ce qui permet aux deux familles d'ancre de coexister sous la même vitesse.
        // Prolonger 2031 depuis une table qui s'arrête en 2030 = UNE année, pas cinq depuis 2026.
        const depuisTable = projeterAuPatronMga(100_000, 2, 2031 - 2030);
        const depuisDebut = projeterAuPatronMga(100_000, 2, 2031 - 2026);
        expect(depuisTable).toBeCloseTo(102_500, 2);
        expect(depuisDebut).toBeGreaterThan(depuisTable);
        // L'écart entre les deux ancres EST la marche que le dépôt a déjà corrigée : les
        // confondre coûterait ici plus de 10 % sur un plafond légal.
        expect((depuisDebut - depuisTable) / depuisTable).toBeGreaterThan(0.10);
    });
});
