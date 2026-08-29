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
import { INITIAL_PROJECTION } from '../../constants';
import type { AppState } from '../../types';

/** ⚠️ Un état NEUF par cas — jamais partagé. Une première version de la mesure de ce ticket était
 *  fausse pour l'avoir oublié (`[TEST-PERSONA-FIXTURE-PARTAGEE]`, lot 33). */
const etatAvec = (champ: 'netSalary' | 'grossSalary' | 'salary', valeur: number): AppState => {
    const etat = buildCoupleConfort() as AppState;
    (etat.config.users[0] as unknown as Record<string, unknown>)[champ] = valeur;
    return etat;
};
const params = (etat: AppState) => buildSimulationParamsFromState(etat, { startYear: 2026, startMonth: 0 });

/** ⚠️ Le persona ne porte PAS `projection` (le store l'apporte au montage). Une fixture qui l'omet
 *  fait échouer les tests du filet sur la fixture et non sur le code — le piège
 *  `UNE-FIXTURE-AUX-MAUVAIS-NOMS-DE-CHAMPS-EST-UNE-FIXTURE-VIDE`, vu ici en direct. */
const etatAvecProjection = (): AppState => {
    const etat = buildCoupleConfort() as AppState;
    etat.projection = { ...INITIAL_PROJECTION } as AppState['projection'];
    return etat;
};

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

    it('refuse un POSTE DE BUDGET illisible — le canal au plus gros écart', () => {
        // ⚠️ Ce canal manquait au premier jet, et il portait le pire écart mesuré :
        // `computeMonthlySavings` finit par `Math.max(0, revenus − dépenses)`, donc un poste à
        // `Infinity` donne `−Infinity` que `Math.max` rabat sur **0** — fini, crédible et faux.
        // Mesuré avant correctif : l'épargne mensuelle passait de 5 370 $ à 0 sans un seul refus.
        const etat = buildCoupleConfort() as AppState;
        const poste = (etat.budgetItems as unknown as Array<Record<string, unknown>>)
            .find((b) => /picerie/i.test(String(b.name)));
        expect(poste).toBeDefined();          // anti-vacuité : la fixture porte bien ce poste
        poste!.target = Infinity;
        const p = params(etat);
        expect(p.entreesRefusees?.map((r) => r.chemin)).toContain('budgetItems[1].target');
        expect(messageDeRefus(p.entreesRefusees ?? [])).toContain('Épicerie');
    });

    it('refuse un terme ÉCARTÉ du solde de départ — le total seul ne peut rien dire', () => {
        // `computeCashLedger` ÉCARTE les valeurs non finies et rend toujours un total FINI : un
        // contrôle sur `calculatedStartingCash` ne peut donc jamais tirer. C'est l'inventaire des
        // termes jetés qui protège (`TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL`).
        const refus = verifierEntreesMoteur(
            { calculatedStartingCash: 102_254 },   // fini : le total ne trahit rien
            { termesFautifsCash: [{ origine: 'initialBalances', cle: 'CELI', valeur: Infinity }] },
        );
        expect(refus.map((r) => r.chemin)).toEqual(['initialBalances.CELI']);
        expect(refus[0].libelle).toContain('CELI');
    });

    it('refuse `currentRentExpense`, produit par la frontière et oublié au premier jet', () => {
        const etat = buildCoupleConfort() as AppState;
        const logement = (etat.budgetItems as unknown as Array<Record<string, unknown>>)
            .find((b) => /logement|loyer/i.test(String(b.name)));
        expect(logement).toBeDefined();
        logement!.target = Infinity;
        const p = params(etat);
        // Le poste ET la grandeur dérivée sont relevés : deux chemins, une seule cause.
        expect(p.entreesRefusees?.map((r) => r.chemin)).toContain('currentRentExpense');
    });

    it('OMET le champ quand il n\'y a rien à refuser — la signature des params ne bouge pas', () => {
        // La clé de dédup du moteur est `JSON.stringify(params)` : un champ toujours présent, même
        // vide, changerait cette signature pour tout le monde et invaliderait les calculs en vol.
        const p = params(buildCoupleConfort() as AppState);
        expect('entreesRefusees' in p).toBe(false);
    });
});

describe('[ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] le filet récursif', () => {
    // ⚠️ CES TESTS MANQUAIENT, et c'est leur absence qui a laissé passer le pire défaut du lot : le
    // « filet récursif » ne scannait que l'objet de huit clés construit pour l'appeler, donc les
    // deux canaux que le commit annonçait fermer restaient ouverts (`projection.inflationRate = NaN`
    // → 0 refus et −93 % de patrimoine). Vingt-quatre tests passaient au vert sur un filet inopérant.
    // Un mécanisme central sans test est un mécanisme dont personne ne sait s'il fonctionne.

    it('attrape un réglage de PROJECTION, qu\'aucune liste nommée ne couvre', () => {
        const etat = etatAvecProjection();
        (etat.projection as unknown as Record<string, unknown>).inflationRate = Number.NaN;
        const chemins = params(etat).entreesRefusees?.map((r) => r.chemin) ?? [];
        expect(chemins).toContain('projection.inflationRate');
    });

    it('descend dans les objets IMBRIQUÉS — le mode absorbé n\'y publie aucun non-fini', () => {
        // `returnRates.celi = NaN` ne produit AUCUNE valeur non finie en sortie (mesuré) : la courbe
        // reste lisse et le patrimoine baisse de ~29 %. Seul un scan de l'ENTRÉE peut le voir.
        const etat = etatAvecProjection();
        const proj = etat.projection as unknown as Record<string, unknown>;
        proj.returnRates = { ...(proj.returnRates as Record<string, unknown>), celi: Number.NaN };
        expect(params(etat).entreesRefusees?.map((r) => r.chemin)).toContain('projection.returnRates.celi');
    });

    it('ne met JAMAIS le chemin technique dans le libellé montré', () => {
        const etat = etatAvecProjection();
        (etat.projection as unknown as Record<string, unknown>).inflationRate = Number.NaN;
        const msg = messageDeRefus(params(etat).entreesRefusees ?? []);
        expect(msg).not.toContain('projection.');
        expect(msg).toContain('réglage de la projection');
    });

    it('classe CAUSE un champ de profil que le filet attrape, pas `derive`', () => {
        // Sinon `messageDeRefus` le tait dès qu'un salaire est aussi fautif, et Marc corrige le
        // salaire pour se faire refuser sur une cause que rien ne lui a nommée.
        const etat = buildCoupleConfort() as AppState;
        const u = etat.config.users[0] as unknown as Record<string, unknown>;
        u.netSalary = Number.NaN;
        u.facteurEquivalence = Number.NaN;
        const refus = params(etat).entreesRefusees ?? [];
        const cible = refus.find((r) => r.chemin === 'config.users[0].facteurEquivalence');
        expect(cible?.role).toBe('cause');
    });

    it('déduplique les DEUX notations du même champ', () => {
        // Le filet écrit `config.users.0.netSalary`, les listes nommées `config.users[0].netSalary`.
        const etat = buildCoupleConfort() as AppState;
        (etat.config.users[0] as unknown as Record<string, unknown>).netSalary = Infinity;
        const chemins = (params(etat).entreesRefusees ?? []).map((r) => r.chemin);
        expect(chemins.filter((c) => c.includes('netSalary'))).toEqual(['config.users[0].netSalary']);
    });

    it('garde la valeur fautive TELLE QUELLE, sans fabriquer un NaN', () => {
        const refus = verifierEntreesMoteur({ config: { users: [{ netSalary: '1e999' }] } });
        expect(refus[0].valeur).toBe('1e999');
    });
});

describe('[ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] le message nomme le champ', () => {
    it('nomme la personne et le champ, pas un chemin technique', () => {
        const p = params(etatAvec('netSalary', Number.NaN));
        const msg = messageDeRefus(p.entreesRefusees ?? []);
        expect(msg).toContain('salaire net');
        // ⚠️ Élidé : « de Alex » se lit mal. Le premier correctif d'élision ne traitait que le rang.
        expect(msg).toContain("d'Alex (test)");
        expect(msg).not.toContain('de Alex');
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
        // ⚠️ Forme ÉLIDÉE : le libellé s'écrivait « de le profil 1 » au premier jet. Un texte montré
        // à l'utilisateur se relit comme une phrase (finding panel #764).
        expect(refus[0].libelle).toBe('le salaire net du profil 1 est illisible');
    });

    it('refuse une valeur du bon TYPE mais illisible — une string dans un champ monétaire', () => {
        // ⚠️ Le prédicat d'origine ne regardait que la finitude, or le vecteur du ticket est un
        // `JSON.parse` non typé : une valeur revient aussi bien en `string`. Mesuré, `"1e999"` dans
        // un poste de budget traversait sans jamais devenir non fini — épargne mensuelle à 0 et
        // patrimoine final à −95 %, sans un seul refus.
        const etat = buildCoupleConfort() as AppState;
        const poste = (etat.budgetItems as unknown as Array<Record<string, unknown>>)
            .find((b) => /picerie/i.test(String(b.name)));
        poste!.target = '1e999';
        expect(params(etat).entreesRefusees?.map((r) => r.chemin)).toContain('budgetItems[1].target');
    });

    it('ne refuse PAS un poste à `null` — « non budgété » n\'est pas « illisible »', () => {
        // Sans cette assertion, durcir le prédicat casserait l'app sur un cas nominal du formulaire.
        const etat = buildCoupleConfort() as AppState;
        (etat.budgetItems as unknown as Array<Record<string, unknown>>)[0].target = null;
        expect(params(etat).entreesRefusees ?? []).toEqual([]);
    });

    it('refuse en revanche un poste dont le champ est ABSENT — et le titre d\'avant mentait', () => {
        // ⚠️ Le test précédent s'intitulait « (`null`/absent) » et ne testait que `null`. Mesuré :
        // `null` est inoffensif (`acc + null` vaut `acc`), un champ ABSENT donne `acc + undefined`
        // = `NaN`, donc la projection EST refusée — via un dérivé qui ne nomme rien de corrigeable.
        // Le refus est juste (la donnée est inexploitable) ; c'est le libellé qui manque de
        // précision, et c'est consigné comme tel plutôt que caché derrière un titre inexact.
        const etat = buildCoupleConfort() as AppState;
        delete (etat.budgetItems as unknown as Array<Record<string, unknown>>)[0].target;
        expect(params(etat).entreesRefusees?.map((r) => r.chemin)).toContain('baseMonthlyExpenses');
    });

    it('accorde le verbe au pluriel sur une grandeur au pluriel', () => {
        const refus = verifierEntreesMoteur({ baseMonthlyExpenses: Number.NaN });
        expect(refus[0].libelle).toBe('les dépenses mensuelles de base sont illisibles');
    });
});
