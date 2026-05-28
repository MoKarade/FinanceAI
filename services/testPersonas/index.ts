// services/testPersonas/index.ts
//
// Registre des personas du mode test. Ordre = ordre d'affichage dans le menu.
// Spectre couvert : seul/couple, fauché → moyen → aisé → riche, locataire/
// proprio, enfants/non, immigré/natif, actif/pré-retraite.

import type { TestPersona } from './types';
import { buildCoupleConfort } from './coupleConfort';
import { buildLeaFauchee } from './leaFauchee';
import { buildKarimImmigre } from './karimImmigre';
import { buildCoupleDettes } from './coupleDettes';
import { buildPreRetraiteRiche } from './preRetraiteRiche';
import { buildJeuneCoupleDink } from './jeuneCoupleDink';
import { buildAutonomeMonoparentale } from './autonomeMonoparentale';

export type { TestPersona } from './types';

export const DEFAULT_PERSONA_ID = 'couple-confort';

export const TEST_PERSONAS: TestPersona[] = [
    {
        id: 'couple-confort',
        emoji: '🏡',
        label: 'Couple à l\'aise',
        tagline: 'Double revenu, maison, 1 enfant — tout roule',
        description: 'Couple ~35 ans avec deux bons salaires, une maison hypothéquée, '
            + 'un enfant, des actifs CELI/REER/NonReg/Crypto et des dettes modérées. '
            + 'Le cas « tout va bien » pour tester l\'optimisation fiscale de couple.',
        build: buildCoupleConfort,
    },
    {
        id: 'lea-fauchee',
        emoji: '🎓',
        label: 'Léa, 24 ans',
        tagline: 'Seule, début de carrière, budget serré',
        description: 'Célibataire à faible revenu, locataire, avec une dette étudiante et '
            + 'très peu d\'épargne. Teste le bas du spectre : cashflow tendu, CELIAPP '
            + 'pour un premier achat lointain.',
        build: buildLeaFauchee,
    },
    {
        id: 'karim-immigre',
        emoji: '🚀',
        label: 'Karim, 34 ans',
        tagline: 'Seul, aisé, immigré français récent',
        description: 'Célibataire à haut revenu (tech), immigré arrivé en 2022 — droits '
            + 'CELI/REER limités et PSV au prorata. Épargne agressive, vise l\'indépendance '
            + 'financière. Teste la fiscalité d\'un nouvel arrivant.',
        build: buildKarimImmigre,
    },
    {
        id: 'couple-dettes',
        emoji: '🔥',
        label: 'Sophie & Marc-A., 35 ans',
        tagline: 'Couple étranglé par les dettes',
        description: 'Couple à revenus moyens, locataires, avec de grosses dettes toxiques '
            + '(carte 22 %, prêt auto, marge) et quasi aucune épargne. Teste le cashflow '
            + 'négatif, la stratégie debt-first et les mois de manque (shortfall).',
        build: buildCoupleDettes,
    },
    {
        id: 'pre-retraite-riche',
        emoji: '⛵',
        label: 'Diane & Robert, 58 ans',
        tagline: 'Couple riche, retraite imminente',
        description: 'Couple proche de la retraite, gros patrimoine (REER abondant, CELI '
            + 'plein, maison payée), pension à prestations déterminées. Teste le décaissement, '
            + 'le meltdown REER, la récupération de la PSV et les rentes RRQ/PSV.',
        build: buildPreRetraiteRiche,
    },
    {
        id: 'jeune-couple-dink',
        emoji: '💑',
        label: 'Maya & Liam, ~29 ans',
        tagline: 'Jeune couple sans enfants, épargne pour un 1er achat',
        description: 'Deux revenus moyens-bons, locataires, sans enfants, qui épargnent fort '
            + 'pour acheter dans ~3 ans. Teste le CELIAPP des deux conjoints + le RAP et '
            + 'l\'accumulation pré-achat.',
        build: buildJeuneCoupleDink,
    },
    {
        id: 'autonome-monoparentale',
        emoji: '🛠️',
        label: 'Nadia, 42 ans',
        tagline: 'Travailleuse autonome, monoparentale',
        description: 'Travailleuse autonome à revenu variable, monoparentale avec un enfant, '
            + 'sans REER d\'employeur (cotise elle-même). Teste le revenu irrégulier, le REER '
            + 'auto-cotisé et la situation monoparentale.',
        build: buildAutonomeMonoparentale,
    },
];

export function getPersonaById(id: string | null | undefined): TestPersona | undefined {
    if (!id) return undefined;
    return TEST_PERSONAS.find((p) => p.id === id);
}

export function getPersonaOrDefault(id: string | null | undefined): TestPersona {
    return getPersonaById(id) ?? TEST_PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID)!;
}
