// tests/services/grossFromNetCredits65.test.ts
//
// [GROSSFROMNET-CREDITS-65] `calculateGrossFromNet` ignorait les crédits d'âge (fédéral + QC, 65 ans
// et plus) que `calculateFiscalReport` accorde bel et bien. Le brut déduit d'un net saisi était donc
// SURESTIMÉ pour cette population — et le paramètre ne sert à rien si les appelants ne le passent
// pas, d'où les assertions de CHAÎNE plus bas (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`).
//
// ⚠️ LE TICKET AVAIT RAISON AU DOLLAR PRÈS, et j'ai failli déclarer le contraire. J'ai d'abord mesuré
// l'écart côté BRUT (+3 004 $ à 36 k$ de net) contre les « +1 904 $ » annoncés — sauf que le ticket
// NOMMAIT sa grandeur : « net du modèle − net déclaré ». Dans cette unité-là, ses trois points sont
// exacts. Les deux mesures sont vraies et différentes : un dollar de brut de plus ne rend pas un
// dollar de net de plus (`NE-PAS-DECLARER-UN-TICKET-FAUX-SANS-COMPARER-LA-MEME-GRANDEUR`).
//
// ⚠️ AUCUN GOLDEN N'A BOUGÉ, et c'est un résultat à EXPLIQUER, pas un feu vert (leçon du dépôt).
// L'explication est vérifiée par le dernier test de ce fichier : l'effet n'existe que pour un
// utilisateur de 65 ans et plus QUI N'A PAS de brut saisi — les deux conditions à la fois. Les
// fixtures de goldens n'en contiennent aucune. Le test de chaîne ci-dessous construit donc
// explicitement ce profil, seul moyen de prouver que le câblage moteur n'est pas inerte.

import { describe, it, expect } from 'vitest';
import {
    ageOptsForSalaryInversion, calculateGrossFromNet, calculateFiscalReport, TAX_BASE_YEAR,
} from '../../utils/tax';
import { computeIncomeBaseline } from '../../services/projection/setupSimulation';

const AN = TAX_BASE_YEAR;
const solo66 = { age: 66, eligiblePensionIncome: 0, hasSpouse: false };

describe('[GROSSFROMNET-CREDITS-65] l’inversion net→brut tient compte des crédits d’âge', () => {
    it('à 66 ans, le brut déduit BAISSE — et l’ancien brut était trop haut', () => {
        for (const [net, ecartMin] of [[30_000, 2_500], [36_000, 2_500], [48_000, 1_500]] as const) {
            const sansAge = calculateGrossFromNet(net, AN);
            const avecAge = calculateGrossFromNet(net, AN, solo66);

            // Anti-vacuité : deux bruts nuls seraient parfaitement « égaux » sans rien prouver.
            expect(avecAge, `brut nul à ${net} $ : le scénario ne teste rien`).toBeGreaterThan(net);
            expect(sansAge - avecAge,
                `à ${net} $ de net, l'écart devrait dépasser ${ecartMin} $ (mesuré ~3 000 $ à 36 k$)`)
                .toBeGreaterThan(ecartMin);
        }
    });

    it('l’écart DISPARAÎT au-dessus de ~80 k$ de net : les crédits y sont résorbés', () => {
        // Sans ce cas, on pourrait croire à un décalage constant. C'est une extinction progressive,
        // et c'est ce qui rend le défaut le plus lourd EN BAS de l'échelle — l'inverse de l'intuition.
        const sansAge = calculateGrossFromNet(80_000, AN);
        const avecAge = calculateGrossFromNet(80_000, AN, solo66);
        expect(Math.abs(sansAge - avecAge), 'à 80 k$ de net, plus aucun crédit à accorder').toBeLessThan(10);
    });

    it('à 64 ans, AUCUN écart — c’est bien le seuil légal qui pilote', () => {
        // Contre-épreuve indispensable : sans elle, le premier test serait compatible avec « ageOpts
        // change toujours quelque chose », ce qui ne serait pas le crédit d'âge.
        const sansAge = calculateGrossFromNet(60_000, AN);
        const a64 = calculateGrossFromNet(60_000, AN, { age: 64, eligiblePensionIncome: 0, hasSpouse: false });
        expect(Math.abs(sansAge - a64)).toBeLessThan(1);
    });

    it('`hasSpouse` change le résultat — l’omettre sur-crédite', () => {
        // Le montant QC « personne vivant seule » n'est accordé qu'au solo. Un appelant en mode couple
        // qui laisse `hasSpouse` absent le reçoit quand même : c'est pour ça que les appelants
        // construisent leurs options PAR UTILISATEUR, à partir du nombre d'actifs.
        const enCouple = calculateGrossFromNet(36_000, AN, { ...solo66, hasSpouse: true });
        const enSolo = calculateGrossFromNet(36_000, AN, solo66);
        expect(enCouple, 'couple et solo doivent DIFFÉRER, sinon hasSpouse ne sert à rien')
            .toBeGreaterThan(enSolo);
    });

    it('sans options, le comportement est celui d’AVANT ce lot (rétrocompat)', () => {
        // Défaut NEUTRE : c'est ce qui permet de livrer sans code de migration.
        const sansRien = calculateGrossFromNet(60_000, AN);
        const avecJeune = calculateGrossFromNet(60_000, AN, ageOptsForSalaryInversion(undefined, AN, 1));
        expect(Math.abs(sansRien - avecJeune), 'un utilisateur sans âge ne doit RIEN changer').toBeLessThan(1);
    });
});

describe('[GROSSFROMNET-CREDITS-65] la source unique des options', () => {
    it('dérive l’âge de `birthYear` comme de `age`, et retombe sur un âge sans crédit', () => {
        expect(ageOptsForSalaryInversion({ birthYear: 1960 }, 2026, 1).age).toBe(66);
        expect(ageOptsForSalaryInversion({ age: 66 }, 2026, 1).age).toBe(66);
        // Repli : ni l'un ni l'autre ⇒ 30 ans, donc aucun crédit d'âge, donc aucun changement.
        expect(ageOptsForSalaryInversion(undefined, 2026, 1).age).toBe(30);
        // `birthYear` l'emporte quand les deux sont là (patron du moteur, repris tel quel).
        expect(ageOptsForSalaryInversion({ age: 40, birthYear: 1960 }, 2026, 1).age).toBe(66);
    });

    it('`hasSpouse` suit le nombre d’actifs, et le revenu de pension reste à ZÉRO', () => {
        expect(ageOptsForSalaryInversion({ age: 66 }, 2026, 1).hasSpouse).toBe(false);
        expect(ageOptsForSalaryInversion({ age: 66 }, 2026, 2).hasSpouse).toBe(true);
        // On inverse un SALAIRE : y mettre autre chose accorderait le crédit de pension à un emploi.
        expect(ageOptsForSalaryInversion({ age: 66 }, 2026, 1).eligiblePensionIncome).toBe(0);
    });
});

describe('[GROSSFROMNET-CREDITS-65] la CHAÎNE — le socle du moteur le passe vraiment', () => {
    it('le brut de base d’un 66 ans SANS brut saisi baisse ; celui d’un 40 ans ne bouge pas', () => {
        // C'est LE test qui prouve que le lot n'est pas inerte : `computeIncomeBaseline` ne recevait
        // même pas l'âge avant ce lot (son type était `{ netSalary?, grossSalary? }`).
        const proj = {};
        const base = (age: number) => computeIncomeBaseline(
            proj, [{ netSalary: 3_000, age }], AN,
        ).grossMarcBaseAnnual;

        const jeune = base(40);
        const age66 = base(66);

        expect(jeune, 'anti-vacuité : le brut de base doit être un montant réel').toBeGreaterThan(36_000);
        expect(age66, 'un 66 ans doit avoir un brut déduit PLUS BAS à net égal').toBeLessThan(jeune);
        expect(jeune - age66, 'écart mesuré ~3 000 $ à 36 k$ de net').toBeGreaterThan(2_000);
    });

    it('un 66 ans AVEC brut saisi n’est pas touché — l’inversion n’est jamais empruntée', () => {
        // L'explication de « aucun golden n'a bougé » : il faut les DEUX conditions (65+ ET pas de
        // brut saisi). Les fixtures de goldens ont un brut, donc ne passent jamais par ce chemin.
        const avecBrut = computeIncomeBaseline(
            {}, [{ netSalary: 3_000, grossSalary: 4_200, age: 66 }], AN,
        ).grossMarcBaseAnnual;
        expect(avecBrut, 'le brut saisi doit être utilisé tel quel (×12)').toBe(4_200 * 12);
    });

    it('le net réel au brut déduit colle enfin au net DÉCLARÉ (aller-retour cohérent)', () => {
        // La grandeur du ticket : « net du modèle − net déclaré ». Avant, elle valait +1 904 $ à
        // 36 k$ ; le brut déduit rendait un net trop élevé parce qu'il ignorait les crédits.
        const netDeclare = 36_000;
        const brut = calculateGrossFromNet(netDeclare, AN, solo66);
        const netReel = calculateFiscalReport(brut, 0, 0, AN, false, solo66).netIncome;
        expect(Math.abs(netReel - netDeclare), 'l’aller-retour doit se refermer à moins de 2 $')
            .toBeLessThan(2);

        // Et la preuve que c'était cassé : avec l'ancien brut, l'écart dépassait 1 500 $.
        const brutAvant = calculateGrossFromNet(netDeclare, AN);
        const netReelAvant = calculateFiscalReport(brutAvant, 0, 0, AN, false, solo66).netIncome;
        expect(netReelAvant - netDeclare, 'écart mesuré du ticket : +1 904 $').toBeGreaterThan(1_500);
    });
});
