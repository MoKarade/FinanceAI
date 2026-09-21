// [FUTUR-DAILY-NATIVE] Garde : chaque `dataKey` tracé par FutureProjection DOIT figurer dans
// CURVE_FIELDS (la ventilation légère de la série quotidienne). Une série ajoutée au render sans
// être ajoutée à CURVE_FIELDS serait ventilée NULLE PART : la courbe la tracerait sur des champs
// absents → ligne invisible, en silence — exactement la classe « no-op silencieux » du dépôt.
//
// ⚠️ La garde lit le SOURCE du composant (pas sa config) : elle ne peut pas être trompée par une
// constante qui dériverait du render. `monthIndex` (axe X) est exclu : c'est l'abscisse, pas une
// série ventilée.
//
// ⚠️⚠️ [DETTE-LEVIER-EXPLICITE 2026-09-21] DEUX corrections, et la première était une BOMBE :
//   1. la lecture passe par `tests/helpers/futureSource.ts`, qui décommente. Cette garde lisait la
//      source BRUTE, donc un commentaire français à nombre IMPAIR d'apostrophes ASCII dans le bloc
//      `CURVE_FIELDS` décalait toutes les paires de littéraux suivantes et lui faisait accuser un
//      champ PRÉSENT d'être absent (`UNE-APOSTROPHE-FRANCAISE-EST-UN-DELIMITEUR-DE-CHAINE`, déjà
//      payée le 2026-09-18 sur sa jumelle de `bilanQuotidien.test.ts` — pas sur elle) ;
//   2. les `dataKey={accesseur}` (forme FONCTION) sont désormais couverts : ils lui étaient
//      totalement invisibles. Détail et preuve de non-mensonge de la table :
//      `tests/components/futureCourbeLevier.test.ts`.
import { describe, it, expect } from 'vitest';
import { curveFieldsDuComposant, dataKeysDuRender } from '../helpers/futureSource';
import { CHAMP_PAR_ACCESSEUR } from '../../components/future/detteSerie';

describe('[FUTUR-DAILY-NATIVE] CURVE_FIELDS couvre tous les dataKey tracés', () => {
    it('chaque dataKey LITTÉRAL du render ∈ CURVE_FIELDS', () => {
        const declared = curveFieldsDuComposant();
        const { litteraux } = dataKeysDuRender();
        expect(litteraux.length).toBeGreaterThan(5); // non-vacuité : le render trace bien des séries
        for (const k of litteraux) {
            expect(declared.has(k), `dataKey="${k}" tracé mais ABSENT de CURVE_FIELDS — la série serait invisible au jour`).toBe(true);
        }
    });

    it('chaque dataKey par ACCESSEUR trace lui aussi un champ de CURVE_FIELDS', () => {
        const declared = curveFieldsDuComposant();
        const { accesseurs } = dataKeysDuRender();
        // Non-vacuité : s'il n'y avait plus d'accesseur, ce cas ne dirait rien. Deux existent
        // (dette totale, part levier) — s'ils disparaissent, cette garde doit être re-jugée, pas
        // rendue silencieuse.
        expect(accesseurs.length).toBeGreaterThanOrEqual(2);
        for (const nom of accesseurs) {
            const champ = CHAMP_PAR_ACCESSEUR[nom];
            expect(champ, `dataKey={${nom}} tracé mais ABSENT de CHAMP_PAR_ACCESSEUR — champ tracé inconnu`).toBeTruthy();
            expect(declared.has(champ!), `${nom} lit ${champ}, ABSENT de CURVE_FIELDS — la série serait muette au jour`).toBe(true);
        }
    });
});
