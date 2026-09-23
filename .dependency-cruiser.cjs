// Règles d'architecture de FinanceAI (porte qualité de l'Atelier, S6).
// But : que la structure décrite dans le CLAUDE.md reste VRAIE à mesure que le code grandit.
// Cliquet : le nombre de violations au jour de la mise en place est figé dans qualite/seuils.json
// (architecture.violations) ; il peut baisser, jamais monter.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "pas-de-cycle",
      comment: "Deux modules qui s'importent mutuellement : l'ordre de chargement devient fragile.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "pas-d-import-introuvable",
      comment: "Un import qui ne se résout vers rien casse au build ou, pire, à l'exécution.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "prod-sans-dependance-de-dev",
      comment: "Le code servi ne doit pas dépendre d'un paquet de développement (absent en production).",
      severity: "error",
      from: { path: "^(services|components|hooks|store|utils|api)/", pathNot: "\\.test\\.tsx?$" },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "services-n-importent-pas-l-interface",
      comment: "services/ est la logique (moteur fiscal, projection, données) ; il ne connaît ni les composants ni les hooks React.",
      severity: "error",
      from: { path: "^services/" },
      to: { path: "^(components|hooks)/|^App\\.tsx$" },
    },
    {
      name: "tests-hors-du-code-servi",
      comment: "Le code servi n'importe jamais un test.",
      severity: "error",
      from: { path: "^(services|components|hooks|store|utils|api|mcp)/" },
      to: { path: "^(tests|e2e)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(dist|node_modules|coverage|reports|public)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"] },
  },
};
