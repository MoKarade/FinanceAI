// services/testConfig.ts
//
// Configuration utilisateurs pour le mode test.
// Extrait de testFixtures.ts (DT4) — ne jamais charger au boot.

import type { BudgetConfig } from '../types';

const TEST_USERS: BudgetConfig['users'] = [
    { name: 'Alex (test)', grossSalary: 7500, netSalary: 5200, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991 },
    { name: 'Sam (test)', grossSalary: 6200, netSalary: 4400, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993 },
];

export const TEST_CONFIG: BudgetConfig = {
    users: TEST_USERS,
    splitMode: '50/50',
};
