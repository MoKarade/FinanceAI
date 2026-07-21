// services/aiTools/registry.ts
//
// [AITOOLS-B] Registre des tools consommés par le chat Claude IN-APP (SDK Anthropic tool-use).
// Ce sont les MÊMES specs que le serveur MCP (mcp/tools/*.spec.ts) — la parité « mêmes réponses
// que claude.ai » est garantie par construction (une seule logique) et verrouillée par
// tests/aiTools/registryParity.test.ts (même état → même payload).
//
// Périmètre Lot B : LECTURE SEULE (11 tools — 8 data-aware + 3 calculateurs stateless).
// Les 5 tools d'écriture (apply_*) arrivent au Lot D avec le flux de CONFIRMATION obligatoire
// (diff avant/après + clic Appliquer) — JAMAIS d'écriture sans confirmation (exigence Marc).
// Exclus définitifs : `ping` (health-check serveur), `connect_drive` (OAuth loopback Node —
// l'app EST la source de données, ce tool n'a pas de sens ici).
//
// ⚠️ Browser-safe : ce module (et tout services/aiTools/) ne doit JAMAIS importer le SDK serveur
// MCP ni un module Node-only — garde : tests/aiTools/noMcpSdkInSpecs.test.ts.

import type { AnyReadToolSpec } from '../../mcp/tools/_toolSpec';
import { getFinancialOverviewSpec } from '../../mcp/tools/getFinancialOverview.spec';
import { getHoldingsSpec } from '../../mcp/tools/getHoldings.spec';
import { getProjectionSpec } from '../../mcp/tools/getProjection.spec';
import { getTaxSituationSpec } from '../../mcp/tools/getTaxSituation.spec';
import { getRetirementOutlookSpec } from '../../mcp/tools/getRetirementOutlook.spec';
import { getNextBestActionsSpec } from '../../mcp/tools/getNextBestActions.spec';
import { searchTransactionsSpec } from '../../mcp/tools/searchTransactions.spec';
import { simulateWhatIfSpec } from '../../mcp/tools/simulateWhatIf.spec';
import { getTaxRoomSpec } from '../../mcp/tools/getTaxRoom.spec';
import { calculateRealEstateSpec } from '../../mcp/tools/calculateRealEstate.spec';
import { runProjectionSpec } from '../../mcp/tools/runProjection.spec';

/** Tools de LECTURE exposés au chat in-app. AUCUNE mutation possible par ces handlers. */
export const READ_SPECS: AnyReadToolSpec[] = [
    getFinancialOverviewSpec,
    getHoldingsSpec,
    getProjectionSpec,
    getTaxSituationSpec,
    getRetirementOutlookSpec,
    getNextBestActionsSpec,
    searchTransactionsSpec,
    simulateWhatIfSpec,
    getTaxRoomSpec,
    calculateRealEstateSpec,
    runProjectionSpec,
];

/** Index par nom pour le dispatch. */
export const READ_SPECS_BY_NAME: ReadonlyMap<string, AnyReadToolSpec> =
    new Map(READ_SPECS.map((s) => [s.name, s]));
