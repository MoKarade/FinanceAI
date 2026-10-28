import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Configuration réservée aux tests de mutation du MOTEUR FISCAL (stryker.config.mjs, S6 lot 1b).
//
// Seuls les tests qui importent le moteur fiscal tournent : Stryker rejoue les tests à chaque
// mutant, et la suite complète (≈ 6 400 tests, séquentielle) rendrait le passage hebdomadaire
// impossible. Conséquence assumée : un mutant que seul un AUTRE test aurait tué compte comme
// « survivant » — le score est donc prudent, jamais flatteur.
// Liste = les fichiers de tests/ qui importent utils/tax, services/tax*, projection/tax* ou
// projection/{latent,lifetime}Tax (composants .tsx exclus : lents, et ils testent l'affichage).
// Pour la régénérer : grep -rlE "utils/tax['\"]|services/tax['\"]|taxEstimate|taxResidual|projection/(taxApril|taxDecember|taxJanuary|latentTax|lifetimeTax)" tests --include=*.ts
// ⚠️ PAS de mergeConfig : il CONCATÈNE les tableaux, et `include` redeviendrait « tous les tests »
// (mesuré : 6 440 tests au lieu du sous-ensemble). On remplace donc `include`, le reste est hérité.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    // Environnement `node`, pas jsdom : le moteur fiscal est du calcul pur, et jsdom coûtait 92 %
    // du temps (mesuré : 766 tests = 3,7 s de tests pour 47 s de mise en place). Décisif pour
    // les mutants « statiques » (constantes de module : taux, paliers), qui rejouent TOUS les tests.
    environment: 'node',
    include: [
      "tests/services/activeIncome.test.ts",
      "tests/services/cashflowAllocation.overrides.test.ts",
      "tests/services/cashflowAllocation.shortfall.test.ts",
      "tests/services/cashflowAllocation.test.ts",
      "tests/services/celiappRoomEtRamq.test.ts",
      "tests/services/childrenReee.test.ts",
      "tests/services/claude.promptPaliers.test.ts",
      "tests/services/coupleTaxation.test.ts",
      "tests/services/divDerivedBases.test.ts",
      "tests/services/dividendeReputeStepUpAcb.test.ts",
      "tests/services/divorceLatentTax.test.ts",
      "tests/services/estateAgeCredits.test.ts",
      "tests/services/estateCalculation.test.ts",
      "tests/services/grossFromNetCredits65.test.ts",
      "tests/services/latentTax.test.ts",
      "tests/services/latentTaxAgeCredits.test.ts",
      "tests/services/latentTaxFerrWiring.test.ts",
      "tests/services/latentTaxPensionCredit.test.ts",
      "tests/services/legacyGrossSignature.test.ts",
      "tests/services/lifetimeTax.test.ts",
      "tests/services/logRamqFssMemeUnite.test.ts",
      "tests/services/perfLatentMcSkip.test.ts",
      "tests/services/personaActifQuiDecaisse.test.ts",
      "tests/services/projection.bracketRealIndex.test.ts",
      "tests/services/projection.divorceMechanisms.test.ts",
      "tests/services/projection.eventDays.test.ts",
      "tests/services/ramqExemptParAdulte.test.ts",
      "tests/services/reerRetraitsRegistres.test.ts",
      "tests/services/rqapPlafondScenario.test.ts",
      "tests/services/rqapPrestationCotisations.test.ts",
      "tests/services/rrspCapExtrapolation.test.ts",
      "tests/services/rrspRentalEarnedWiring.test.ts",
      "tests/services/rrspRoomAnneeCivile.test.ts",
      "tests/services/rrspRoomPerUser.test.ts",
      "tests/services/rrspRoomWiring.test.ts",
      "tests/services/setupSimulation.test.ts",
      "tests/services/tax.item2a.characterization.test.ts",
      "tests/services/tax.test.ts",
      "tests/services/taxApril.test.ts",
      "tests/services/taxDecember.test.ts",
      "tests/services/taxDecemberActifPension.test.ts",
      "tests/services/taxDecemberAgeCreditBand.test.ts",
      "tests/services/taxDecemberInflationAmont.test.ts",
      "tests/services/taxDecemberSourcesUniques.test.ts",
      "tests/services/taxEstimate.test.ts",
      "tests/services/taxJanuary.test.ts",
      "tests/services/taxPayrollBase.test.ts",
      "tests/services/taxResidual.test.ts",
      // (tests/store/migrateGrossFromNet.test.ts écarté : il a besoin de localStorage, donc de jsdom.)
      "tests/utils/donationCredit.test.ts",
      "tests/utils/residency.test.ts",
    ],
  },
});
