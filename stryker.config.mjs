// Tests de mutation du MOTEUR FISCAL (porte qualité de l'Atelier, S6 lot 1b — décision de Marc, 24/09).
// Stryker modifie volontairement le code (un `<` devient `<=`, un `0.14` devient `0`…) et relance
// les tests : si aucun ne casse, le « mutant » survit — la ligne est exécutée mais rien ne vérifie
// vraiment son résultat. Le score = % de mutants tués. C'est ce qui distingue un test qui vérifie
// d'un test qui se contente de passer — sur le calcul d'impôt, là où un taux faux (crédit fédéral
// 15 % au lieu de 14 %) passait tous les tests existants.
// Périmètre : services/ fait ~44 000 lignes, trop pour un passage CI de 6 h ; on commence par le
// moteur fiscal (~3 200 lignes). Hebdomadaire en CI (.github/workflows/mutation.yml) et à la demande.
const config = {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.mutation.config.ts" },
  mutate: [
    "utils/tax.ts",
    "services/taxEstimate.ts",
    "services/taxResidual.ts",
    "services/projection/latentTax.ts",
    "services/projection/lifetimeTax.ts",
    "services/projection/taxApril.ts",
    "services/projection/taxDecember.ts",
    "services/projection/taxJanuary.ts",
  ],
  coverageAnalysis: "perTest",
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["json", "html", "clear-text", "progress"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  htmlReporter: { fileName: "reports/mutation/index.html" },
  thresholds: { high: 80, low: 60, break: null },
  timeoutMS: 20000,
  tempDirName: ".stryker-tmp",
};

export default config;
