/**
 * [MIGRATE-GROSS-135] — le brut fabriqué par la migration legacy est PERSISTÉ.
 *
 * ⚠️ Pourquoi ce fichier existe : le lot corrigeait DEUX sites, et seul celui du moteur était
 * couvert par des tests. Or c'est ce site-ci qui ÉCRIT une valeur en dollars dans l'état — donc
 * celui dont l'erreur survit à tout. Trou relevé en revue.
 *
 * ⚠️ Portée RÉELLE, à ne pas surestimer : `getInitialStateWithMigration` fait un early-return dès
 * que `financeai-storage` existe. Ce chemin ne sert donc qu'aux configs d'avant l'ère persist. Le
 * test doit donc effacer cette clé pour atteindre le code testé — et ça dit exactement combien
 * d'utilisateurs sont concernés.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { calculateFiscalReport } from '../../utils/tax';

// jsdom fournit un VRAI `localStorage` : on l'utilise tel quel plutôt que de le stubber — le stub
// masquait le vrai chemin et rendait les quatre cas vacueux (grossSalary restait à 0).
const poserConfig = (users: unknown[]): void => {
    localStorage.clear();
    localStorage.setItem('app_config', JSON.stringify({ users }));
};

describe('[MIGRATE-GROSS-135] migration legacy : le brut PERSISTÉ est déduit, pas approximé', () => {
    beforeEach(() => localStorage.clear());

    it('un net MENSUEL sans brut donne un brut MENSUEL qui redonne le net annuel visé', async () => {
        poserConfig([{ netSalary: 5000 }, { salary: 4000 }]);
        const { getInitialStateWithMigration } = await import('../../store/useFinanceStore');
        const users = getInitialStateWithMigration().config.users as Array<{ grossSalary: number }>;

        // ⚠️ UNITÉS — le piège n°1 du dépôt. Le store est MENSUEL, `calculateGrossFromNet` est
        // ANNUEL : on vérifie l'aller-retour complet plutôt que le nombre intermédiaire.
        for (const [i, netMensuel] of [[0, 5000], [1, 4000]] as const) {
            const netAnnuelRendu = calculateFiscalReport(users[i].grossSalary * 12, 0, 0).netIncome;
            // Tolérance = la GARANTIE de la dichotomie (< 1 $), plus l'arrondi au dollar du brut
            // MENSUEL que la migration écrit (`Math.round`), qui vaut jusqu'à 12 $ une fois annualisé.
            expect(Math.abs(netAnnuelRendu - netMensuel * 12)).toBeLessThan(13);
        }
    });

    it('DISCRIMINE l’ancien facteur plat 1,35', async () => {
        poserConfig([{ netSalary: 5000 }]);
        const { getInitialStateWithMigration } = await import('../../store/useFinanceStore');
        const u = (getInitialStateWithMigration().config.users as Array<{ grossSalary: number }>)[0];
        // L'ancien code écrivait 5000 × 1,35 = 6 750 $/mois. Le brut déduit est sensiblement plus
        // haut (mesuré ≈ 7 247 $/mois) — c'est tout l'objet du lot.
        expect(u.grossSalary).not.toBe(Math.round(5000 * 1.35));
        expect(u.grossSalary).toBeGreaterThan(5000 * 1.35);
    });

    it('un brut DÉJÀ saisi n’est jamais écrasé', async () => {
        poserConfig([{ netSalary: 5000, grossSalary: 6000 }]);
        const { getInitialStateWithMigration } = await import('../../store/useFinanceStore');
        const u = (getInitialStateWithMigration().config.users as Array<{ grossSalary: number }>)[0];
        expect(u.grossSalary).toBe(6000);
    });

    it('net absent ou nul : brut à 0, pas de NaN', async () => {
        poserConfig([{}, { netSalary: 0 }]);
        const { getInitialStateWithMigration } = await import('../../store/useFinanceStore');
        const users = getInitialStateWithMigration().config.users as Array<{ grossSalary: number }>;
        for (const u of users) {
            expect(Number.isFinite(u.grossSalary)).toBe(true);
            expect(u.grossSalary).toBe(0);
        }
    });
});
