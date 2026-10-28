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
    it('ne refuse RIEN sur les huit personas — le cas nominal reste calculable', () => {
        // Anti-vacuité de la garde entière : si elle refusait un état sain, elle casserait l'app.
        // Les huit sont balayés parce que « le persona par défaut passe » ne dit rien des autres.
        // ⚠️ `projection` est AJOUTÉE à chaque persona, et c'est le cœur du contrôle depuis que le
        // scan porte sur les params complets : aucun persona ne porte `projection` (le store
        // l'apporte au montage), donc sans cette ligne ce test mesurait un objet plus ÉTROIT que la
        // production — et laissait hors contrôle la plus grosse surface que le lot vient d'ajouter.
        // C'est la classe de défaut que le lot corrige, re-commise dans le test qui devait le
        // prouver (`MESURER-SUR-UN-OBJET-PLUS-ETROIT-QUE-LA-PRODUCTION`).
        const refuses = TEST_PERSONAS.map((p) => {
            const etat = p.build() as AppState;
            etat.projection = { ...INITIAL_PROJECTION } as AppState['projection'];
            return { id: p.id, refus: params(etat).entreesRefusees ?? [] };
        });
        expect(refuses).toHaveLength(8);
        expect(refuses.filter((r) => r.refus.length > 0)).toEqual([]);
    });

    // ⚠️ CANARI D'ÉLARGISSEMENT, et il faut dire ce qu'il est. Les tests au-dessus prouvent que la
    // garde ATTRAPE ; celui-ci prouve qu'elle n'attrape pas TROP — le risque propre à l'inversion
    // (scanner tout l'objet plutôt qu'énumérer les champs). Il ne discrimine pas une régression
    // présente, il attrape la future : un canari se déclare comme tel plutôt que de se faire passer
    // pour une preuve (`TROIS-TESTS-ROUGES-NE-FONT-PAS-TROIS-PREUVES`).
    //
    // Les sept personas sont des ménages COMPLETS : ils ne disent rien du seul état que tout nouvel
    // utilisateur traverse — l'app neuve — ni des configurations qui produisent un `0/0` HONNÊTE, la
    // seule façon crédible qu'un état légitime rende un `NaN`. `scripts/mesureGardeFrontiere.ts`
    // (committé) balaie les 39 cas ; ceux gardés ici sont ceux dont un refus casserait l'app.
    //
    // ⚠️ Sa SPÉCIFICITÉ est mesurée, pas supposée : ajouter à `buildSimulationParams` un dérivé
    // plausible en `0/0` — `tauxEpargne = (net − dépenses) / net` — rend ce test ROUGE et laisse
    // les sept personas VERTS. Sans lui, l'élargissement passerait la CI. (Une première version de
    // la perturbation écrivait `inputs.baseNetAnnual`, un champ qui n'existe pas à ce point : elle
    // rendait `NaN` partout et rougissait tout, ce qui n'aurait rien prouvé de la spécificité.)
    it('ne refuse RIEN sur un état DÉGRADÉ mais légitime — app neuve et `0/0` honnêtes', () => {
        const neuve: AppState = {
            ...(buildCoupleConfort() as AppState),
            assets: [], transactions: [], accounts: [], budgetItems: [],
            debts: [], realEstate: [], goals: [],
        } as AppState;
        neuve.config.users.forEach((u) => {
            (u as unknown as Record<string, unknown>).netSalary = 0;
            (u as unknown as Record<string, unknown>).grossSalary = 0;
        });

        const zeroSurZero = etatAvecProjection();
        // Quantité 0 ET prix 0 : un rendement de 0/0, sans une seule donnée corrompue.
        zeroSurZero.assets.forEach((a) => {
            (a as unknown as Record<string, unknown>).quantity = 0;
            (a as unknown as Record<string, unknown>).buyPrice = 0;
            (a as unknown as Record<string, unknown>).currentPrice = 0;
        });
        // Retraite à l'âge courant : zéro an d'accumulation au dénominateur.
        zeroSurZero.config.users.forEach((u) => {
            (u as unknown as Record<string, unknown>).retirementAge = (u as unknown as { age?: number }).age ?? 35;
        });

        const cas: Array<{ nom: string; etat: AppState }> = [
            { nom: 'app neuve, sans emploi ni données', etat: neuve },
            { nom: '0/0 honnêtes (actif nul, retraite immédiate)', etat: zeroSurZero },
        ];
        const refuses = cas.map((c) => ({ nom: c.nom, refus: params(c.etat).entreesRefusees ?? [] }));
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
    // → 0 refus et −98,8 % de patrimoine). SEIZE tests passaient au vert sur un filet inopérant — le
    // commit disait « vingt-quatre », qui est le compte du fichier APRÈS le lot : même un chiffre
    // d'auto-critique se compte au lieu de s'estimer.
    // Un mécanisme central sans test est un mécanisme dont personne ne sait s'il fonctionne.

    it('attrape un réglage de PROJECTION, qu\'aucune liste nommée ne couvre', () => {
        const etat = etatAvecProjection();
        (etat.projection as unknown as Record<string, unknown>).inflationRate = Number.NaN;
        const chemins = params(etat).entreesRefusees?.map((r) => r.chemin) ?? [];
        expect(chemins).toContain('projection.inflationRate');
    });

    it('descend dans les objets IMBRIQUÉS — le mode absorbé n\'y publie aucun non-fini', () => {
        // `returnRates.celi = NaN` ne produit AUCUNE valeur non finie en sortie (mesuré) : la courbe
        // reste lisse et le patrimoine baisse de **16,3 %** (`scripts/mesureFrontiereMoteur.ts`, qui
        // porte ce cas depuis la 4ᵉ passe ; « ~29 % » venait d'un rapport d'agent non re-mesuré).
        // Seul un scan de l'ENTRÉE peut le voir.
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
        // ⚠️ Test de NON-RÉGRESSION, pas preuve de ce lot : `canonique` existait déjà au commit
        // précédent, donc celui-ci était VERT avant — il discrimine bien `canonique` (neutralisée →
        // rouge), pas la contribution du filet. Le dire évite de le compter comme une preuve de plus.
        const etat = buildCoupleConfort() as AppState;
        (etat.config.users[0] as unknown as Record<string, unknown>).netSalary = Infinity;
        const chemins = (params(etat).entreesRefusees ?? []).map((r) => r.chemin);
        expect(chemins.filter((c) => c.includes('netSalary'))).toEqual(['config.users[0].netSalary']);
    });

    // ⚠️ LE TEST QUI MANQUAIT — et qui n'est pas circulaire. Les cinq au-dessus nomment `projection`
    // et `config` : une re-restriction future du scan à `{config, projection, dérivés}` les
    // laisserait tous VERTS, alors que c'est exactement la faute que ce lot a commise trois fois.
    // Celui-ci ne consulte aucune liste du module : il énumère les clés de l'objet RÉELLEMENT
    // assemblé et exige un refus pour chacune. Le jour où un conteneur sort du scan, il rougit —
    // sans qu'on ait pensé à ce conteneur-là.
    it('refuse un non-fini dans CHAQUE conteneur des params, sans en nommer aucun', () => {
        const assembles = params(etatAvecProjection()) as unknown as Record<string, unknown>;

        /** Remplace la PREMIÈRE feuille numérique atteignable par `NaN`. Rend `false` s'il n'y en a pas. */
        const corrompre = (n: unknown): boolean => {
            if (n === null || typeof n !== 'object') return false;
            for (const [cle, val] of Object.entries(n as Record<string, unknown>)) {
                if (typeof val === 'number' && Number.isFinite(val)) {
                    (n as Record<string, unknown>)[cle] = Number.NaN;
                    return true;
                }
                if (corrompre(val)) return true;
            }
            return false;
        };

        const testes: string[] = [];
        const muets: string[] = [];
        for (const cle of Object.keys(assembles)) {
            if (cle === 'entreesRefusees') continue;   // le relevé lui-même, exclu du filet par contrat
            const copie = structuredClone(assembles) as Record<string, unknown>;
            if (typeof copie[cle] === 'number') copie[cle] = Number.NaN;
            else if (!corrompre(copie[cle])) continue;   // ce conteneur ne porte aucun nombre : rien à prouver
            testes.push(cle);
            const refus = verifierEntreesMoteur(copie);
            if (!refus.some((r) => r.chemin.startsWith(cle))) muets.push(cle);
        }

        // Anti-vacuité : si l'énumération ne trouvait rien à corrompre, la boucle passerait à vide.
        expect(testes.length).toBeGreaterThan(8);
        expect(muets).toEqual([]);
    });

    it('nomme le CONTENEUR, pas « un réglage de la projection » pour une dette', () => {
        // Mesuré avant correctif : `debts[0].interestRate = NaN` s'annonçait « un réglage de la
        // projection est illisible » — l'utilisateur part corriger le mauvais écran. Un libellé qui
        // nomme le mauvais endroit est pire qu'un libellé vague.
        const etat = etatAvecProjection();
        (etat.debts[0] as unknown as Record<string, unknown>).interestRate = Number.NaN;
        const refus = params(etat).entreesRefusees ?? [];
        expect(messageDeRefus(refus)).toContain('dettes');
        expect(messageDeRefus(refus)).not.toContain('réglage de la projection');
    });

    it('classe CAUSE ce qu\'il ne sait pas nommer — un défaut bruyant, jamais tu', () => {
        // `derive` fait TAIRE un refus dès qu'une cause est nommée ailleurs. Un conteneur inconnu
        // classé `derive` reproduirait donc le scénario que `role` existe pour empêcher.
        const refus = verifierEntreesMoteur({ conteneurInexistant: { montant: Number.NaN } });
        expect(refus.map((r) => r.role)).toEqual(['cause']);
        expect(refus[0].libelle).not.toContain('conteneurInexistant');
    });

    it('ne répète PAS le même libellé pour deux champs du même conteneur', () => {
        // Les chemins DIFFÈRENT, donc la déduplication amont ne peut rien : deux dettes illisibles
        // donnaient « … est illisible et … est illisible », la même phrase deux fois.
        const etat = etatAvecProjection();
        const dette = etat.debts[0] as unknown as Record<string, unknown>;
        dette.interestRate = Number.NaN;
        dette.balance = Number.NaN;
        const refus = params(etat).entreesRefusees ?? [];
        expect(refus.length).toBeGreaterThan(1);   // deux refus…
        const msg = messageDeRefus(refus);
        expect(msg.match(/dettes/g) ?? []).toHaveLength(1);   // …mais une seule phrase
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
