// [BACKUP-SCHEMA-NON-TYPE] La garde de TYPE des deux entrées non validées.
//
// ⚠️ Ce que ces tests protègent vraiment. La garde du lot 38 scanne la FINITUDE des paramètres du
// moteur ; elle est aveugle à une CHAÎNE, qui traverse l'arithmétique sans jamais devenir non finie.
// Mesuré : `projection.inflationRate = "2"` → −68 M$, une chaîne dans un montant de projet
// immobilier → −52 %, chaque fois 0 refus et 0 valeur non finie publiée. C'est encore le mode
// « absorbé » : rien ne crie, tout est faux.
import { describe, it, expect } from 'vitest';
import { verifierTypesRestaures, messageDeRefusTypes } from '../../services/verifierTypesRestaures';
import { TEST_PERSONAS, getPersonaOrDefault } from '../../services/testPersonas';
import { useFinanceStore } from '../../store/useFinanceStore';
import { INITIAL_PROJECTION } from '../../constants';
import type { AppState } from '../../types';

/** ⚠️ Un état NEUF par cas — jamais partagé (`[TEST-PERSONA-FIXTURE-PARTAGEE]`, lot 33). */
const avecProjection = (e: AppState): AppState => {
    e.projection = { ...INITIAL_PROJECTION } as AppState['projection'];
    return e;
};
const etat = (): AppState => avecProjection(getPersonaOrDefault('couple-confort').build() as AppState);
const champ = (o: unknown): Record<string, unknown> => o as Record<string, unknown>;

describe('[BACKUP-SCHEMA-NON-TYPE] une chaîne dans un montant est refusée', () => {
    it('refuse le canal au plus gros écart — `projection.inflationRate` en texte (−68 M$)', () => {
        const e = etat();
        champ(e.projection).inflationRate = '2';
        expect(verifierTypesRestaures(e).map((f) => f.chemin)).toContain('projection.inflationRate');
    });

    it('refuse un montant IMBRIQUÉ, que seul un parcours récursif atteint', () => {
        const e = etat();
        const p = champ(e.projection);
        p.returnRates = { ...(p.returnRates as Record<string, unknown>), cash: '5' };
        expect(verifierTypesRestaures(e).map((f) => f.chemin)).toContain('projection.returnRates.cash');
    });

    it('refuse le canal mesuré à −52 % — un montant de projet immobilier en texte', () => {
        const e = etat();
        // ⚠️ Le chemin est vérifié, pas supposé : une première version de cette mesure écrivait
        // `realEstate[0].closingCosts`, un tableau ABSENT du persona et un champ qui n'existe pas.
        // Elle rendait « aucun refus » — un faux trou, qui aurait pu passer pour un vrai.
        expect(e.realEstateGoals?.length ?? 0).toBeGreaterThan(0);
        champ(e.realEstateGoals[0]).totalClosingCosts = '15000';
        expect(verifierTypesRestaures(e).map((f) => f.chemin))
            .toContain('realEstateGoals.0.totalClosingCosts');
    });

    it('refuse dans les conteneurs que le backup exporte AUSSI (dette, budget, salaire)', () => {
        const cas: Array<[string, (e: AppState) => void]> = [
            ['debts.0.balance', (e) => { champ(e.debts[0]).balance = '10000'; }],
            ['budgetItems.0.target', (e) => { champ(e.budgetItems[0]).target = '1e999'; }],
            ['config.users.0.netSalary', (e) => { champ(e.config.users[0]).netSalary = '5000'; }],
            ['transactions.0.amount', (e) => { champ(e.transactions[0]).amount = '-42'; }],
        ];
        for (const [chemin, corrompre] of cas) {
            const e = etat();
            corrompre(e);
            expect(verifierTypesRestaures(e).map((f) => f.chemin), chemin).toContain(chemin);
        }
    });

    it('garde la valeur fautive TELLE QUELLE, sans la convertir', () => {
        // `no-fake-data` vaut aussi dans un flux de diagnostic : coercer `"1e999"` en `Infinity`
        // enverrait chercher un nombre là où la donnée est un texte (leçon du lot 38).
        const fautifs = verifierTypesRestaures({ balance: '1e999' });
        expect(fautifs[0].valeur).toBe('1e999');
    });
});

describe('[BACKUP-SCHEMA-NON-TYPE] ce qui NE doit pas être refusé', () => {
    // ⚠️ CANARI, et c'est le contre-poids de tout le lot. Marc a choisi de lister les champs TEXTE
    // plutôt que les 213 champs numériques, parce que l'oubli d'un champ texte est BRUYANT — un faux
    // refus — là où l'oubli d'un champ numérique rouvrirait un canal en silence. Ce test est ce qui
    // rend cet arbitrage tenable : il transforme le faux refus en échec de CI. Un champ texte ajouté
    // au produit sans être ajouté à la liste rougit ICI, pas chez Marc.
    it('ne refuse RIEN sur les sept personas ni sur l\'état initial du store', () => {
        const cas: Array<{ nom: string; objet: unknown }> = [
            { nom: 'état initial du store', objet: JSON.parse(JSON.stringify(useFinanceStore.getState())) },
            ...TEST_PERSONAS.map((p) => ({
                nom: `persona ${p.id}`,
                objet: avecProjection(p.build() as AppState) as unknown,
            })),
        ];
        const refuses = cas.map((c) => ({
            nom: c.nom,
            champs: verifierTypesRestaures(c.objet).map((f) => `${f.chemin}="${String(f.valeur)}"`),
        }));
        expect(refuses).toHaveLength(8);
        expect(refuses.filter((r) => r.champs.length > 0)).toEqual([]);
    });

    it('ne refuse rien sur des états DÉGRADÉS mais légitimes', () => {
        const degradations: Array<[string, (e: AppState) => void]> = [
            ['app neuve (tout vide)', (e) => {
                e.assets = []; e.transactions = []; e.budgetItems = [];
                e.debts = []; e.realEstateGoals = []; e.travelGoals = []; e.lifeEvents = [];
            }],
            ['sans emploi (salaires à 0)', (e) => {
                e.config.users.forEach((u) => { champ(u).netSalary = 0; champ(u).grossSalary = 0; });
            }],
            ['noms vides', (e) => { e.config.users.forEach((u) => { champ(u).name = ''; }); }],
            ['projection absente', (e) => { delete (e as Partial<AppState>).projection; }],
        ];
        for (const [nom, degrader] of degradations) {
            const e = etat();
            degrader(e);
            expect(verifierTypesRestaures(e).map((f) => f.chemin), nom).toEqual([]);
        }
    });

    it('ne refuse pas un TABLEAU de chaînes — ses éléments sont jugés sur la clé du tableau', () => {
        // Sans cette règle, `tags: ['a','b']` verrait ses éléments jugés sur la clé `'0'`, absente de
        // la liste : toute liste de textes de l'app deviendrait un refus.
        expect(verifierTypesRestaures({ toolsUsed: ['a', 'b'] })).toEqual([]);
        expect(verifierTypesRestaures({ balance: ['10000'] }).map((f) => f.chemin)).toEqual(['balance.0']);
    });

    it('ne refuse ni `null`, ni un booléen, ni un nombre', () => {
        expect(verifierTypesRestaures({ balance: null, actif: true, montant: 42 })).toEqual([]);
    });
});

describe('[BACKUP-SCHEMA-NON-TYPE] le message montré', () => {
    it('nomme les champs sans jamais exposer un chemin technique', () => {
        const e = etat();
        champ(e.projection).inflationRate = '2';
        const msg = messageDeRefusTypes(verifierTypesRestaures(e));
        expect(msg).toContain('inflationRate');
        expect(msg).not.toContain('projection.inflationRate');
        expect(msg).toContain('rien n\'a été modifié');
    });

    it('ne répète pas le même nom de champ pour deux occurrences', () => {
        const fautifs = verifierTypesRestaures({
            debts: [{ balance: '1' }, { balance: '2' }],
        });
        expect(fautifs).toHaveLength(2);
        expect(messageDeRefusTypes(fautifs).match(/balance/g) ?? []).toHaveLength(1);
    });

    it('rend une chaîne vide quand il n\'y a rien à dire', () => {
        expect(messageDeRefusTypes([])).toBe('');
    });
});
