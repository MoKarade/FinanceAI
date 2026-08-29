// [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] La garde d'entrée du moteur, et la frontière qui la pose.
//
// ⚠️ Ce que ces tests protègent VRAIMENT. Le mode `Infinity` finit par se voir ; le mode `NaN` est
// ABSORBÉ par le `|| 0` de la frontière et rend une projection lisse et entièrement fausse — mesuré
// par `scripts/mesureFrontiereMoteur.ts` (committé) : 62 400 $/an de salaire évaporés, et ZÉRO
// valeur non finie sur les 361 points publiés. C'est le cas où rien ne crie qui exige une garde.
import { describe, it, expect } from 'vitest';
import { verifierEntreesMoteur, messageDeRefus } from '../../services/projection/verifierEntreesMoteur';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { buildCoupleConfort } from '../../services/testPersonas/coupleConfort';
import { TEST_PERSONAS } from '../../services/testPersonas';
import type { AppState } from '../../types';

/** ⚠️ Un état NEUF par cas — jamais partagé. Une première version de la mesure de ce ticket était
 *  fausse pour l'avoir oublié (`[TEST-PERSONA-FIXTURE-PARTAGEE]`, lot 33). */
const etatAvec = (champ: 'netSalary' | 'grossSalary' | 'salary', valeur: number): AppState => {
    const etat = buildCoupleConfort() as AppState;
    (etat.config.users[0] as unknown as Record<string, unknown>)[champ] = valeur;
    return etat;
};
const params = (etat: AppState) => buildSimulationParamsFromState(etat, { startYear: 2026, startMonth: 0 });

describe('[ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] la frontière refuse une entrée illisible', () => {
    it('ne refuse RIEN sur les sept personas — le cas nominal reste calculable', () => {
        // Anti-vacuité de la garde entière : si elle refusait un état sain, elle casserait l'app.
        // Les sept sont balayés parce que « le persona par défaut passe » ne dit rien des autres.
        const refuses = TEST_PERSONAS.map((p) => ({
            id: p.id,
            refus: params(p.build() as AppState).entreesRefusees ?? [],
        }));
        expect(refuses).toHaveLength(7);
        expect(refuses.filter((r) => r.refus.length > 0)).toEqual([]);
    });

    it('refuse le mode ABSORBÉ (`NaN`), celui qu\'aucun scan de sortie ne voyait', () => {
        const p = params(etatAvec('netSalary', Number.NaN));
        // Le fait qui rend ce cas dangereux, re-mesuré ici : la sortie reste PLAUSIBLE.
        expect(p.baseNetAnnual).toBe(52_800);           // au lieu de 115 200
        expect(Number.isFinite(p.baseNetAnnual)).toBe(true);
        // Et pourtant l'entrée est illisible — c'est ça que la garde voit.
        expect(p.entreesRefusees?.map((r) => r.chemin)).toEqual(['config.users[0].netSalary']);
    });

    it('refuse le mode qui SE PROPAGE (`Infinity`), entrée ET grandeurs dérivées', () => {
        const p = params(etatAvec('netSalary', Infinity));
        expect(p.baseNetAnnual).toBe(Infinity);
        expect(Number.isNaN(p.baseMonthlyExpenses)).toBe(true); // ∞ − épargne = NaN
        const chemins = p.entreesRefusees?.map((r) => r.chemin) ?? [];
        expect(chemins).toContain('config.users[0].netSalary');
        expect(chemins).toContain('baseNetAnnual');
        expect(chemins).toContain('baseMonthlyExpenses');
    });

    it('refuse aussi le salaire BRUT, qui n\'affecte pourtant pas le net', () => {
        const p = params(etatAvec('grossSalary', Infinity));
        expect(p.baseNetAnnual).toBe(115_200); // intact : la corruption est ailleurs
        expect(p.entreesRefusees?.map((r) => r.chemin)).toContain('config.users[0].grossSalary');
    });

    it('OMET le champ quand il n\'y a rien à refuser — la signature des params ne bouge pas', () => {
        // La clé de dédup du moteur est `JSON.stringify(params)` : un champ toujours présent, même
        // vide, changerait cette signature pour tout le monde et invaliderait les calculs en vol.
        const p = params(buildCoupleConfort() as AppState);
        expect('entreesRefusees' in p).toBe(false);
    });
});

describe('[ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] le message nomme le champ', () => {
    it('nomme la personne et le champ, pas un chemin technique', () => {
        const p = params(etatAvec('netSalary', Number.NaN));
        const msg = messageDeRefus(p.entreesRefusees ?? []);
        expect(msg).toContain('salaire net');
        expect(msg).toContain('Alex (test)');       // le nom réel du persona, pas « users[0] »
        expect(msg).not.toContain('config.users');  // jamais de chemin technique à l'écran
    });

    it('n\'énumère PAS les grandeurs dérivées quand une cause est déjà nommée', () => {
        // `Infinity` fait rougir l'entrée ET trois dérivés. Les lister tous enverrait corriger
        // « le revenu net annuel du ménage », un champ qui n'existe dans aucun formulaire.
        const p = params(etatAvec('netSalary', Infinity));
        expect((p.entreesRefusees ?? []).length).toBeGreaterThan(1);
        const msg = messageDeRefus(p.entreesRefusees ?? []);
        expect(msg).toContain('salaire net');
        expect(msg).not.toContain('revenu net annuel');
    });

    it('se rabat sur les dérivés si AUCUNE cause utilisateur n\'est identifiée', () => {
        // Chemin de repli : une corruption arrivée autrement que par un champ de saisie connu.
        const msg = messageDeRefus(verifierEntreesMoteur({ calculatedStartingCash: Number.NaN }));
        expect(msg).toContain('solde de départ');
    });

    it('rend une chaîne vide quand il n\'y a rien à dire', () => {
        expect(messageDeRefus([])).toBe('');
    });

    it('nomme un profil SANS nom par son rang, jamais par un index technique', () => {
        const refus = verifierEntreesMoteur({ config: { users: [{ netSalary: Number.NaN }] } });
        expect(refus[0].libelle).toContain('le profil 1');
    });
});
