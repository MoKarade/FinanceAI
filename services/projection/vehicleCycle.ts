// services/projection/vehicleCycle.ts
// Cycle 23 split (depuis taxCycle.ts): cycle de remplacement véhicule.
// Cycle 10 (origine): déclenchement automatique tous les 10 ans (120 mois).
// Indépendant du conteneur VehicleReplacement[] (qui est plus granulaire).
//
// V22 — Remplacement véhicule automatique.
// Retourne {cost, log} si remplacement déclenché ce mois.

export function processAutoVehicleReplacement(
    m: number,
    monthsSinceLast: number,
    vehicleReplacementEnabled: boolean | undefined,
    simInflation: number,
): { cost: number; resetCounter: boolean; logMsg?: string } {
    if (!vehicleReplacementEnabled || m === 0 || monthsSinceLast < 120) {
        return { cost: 0, resetCounter: false };
    }
    const vehicleCost = 35000 * Math.pow(1 + simInflation / 100, m / 12);
    return {
        cost: vehicleCost,
        resetCounter: true,
        logMsg: `🚗 Remplacement véhicule: -${Math.round(vehicleCost).toLocaleString('fr-CA')}$`,
    };
}
