// tests/components/dashboard/HealthIndicator.privacy.test.tsx
//
// [A11Y-PRIVACY-HEALTH-RAW] — deux montants de l'indicateur de santé restaient EN CLAIR en mode
// discret : la cible FIRE (« … (cible Future : 1 234 567 $) ») et le coût mensuel des abonnements
// (« 7 401 $/mois (…) »). Ils étaient interpolés dans la CHAÎNE `raw` produite par
// `utils/healthScore.ts`, donc `<PrivateAmount>` n'avait aucun nœud à envelopper — même classe que
// les journaux du moteur du lot 56 (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`).
//
// ⚠️ Le ticket d'origine annonçait TROIS sites de consommation de `raw` dans ce composant. Mesuré :
// il y en a DEUX (le texte visible et l'`aria-label` du cas indisponible). Le troisième qu'il
// nommait — le `sr-only` — rend `m.help`, qui ne porte aucun montant. Recensé, pas cité.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { HealthIndicator } from '../../../components/dashboard/HealthIndicator';
import { healthRawText, type HealthRawPart } from '../../../utils/healthScore';
import { MASKED_AMOUNT_LABEL } from '../../../utils/privacyAria';
import { formatCAD } from '../../../utils/format';
import { stripComments, partDeCodeRestante } from '../../../utils/stripComments';

const initialState = useFinanceStore.getState();

/** Cible FIRE et coût d'abonnement choisis DISTINCTIFS : aucun autre chiffre de l'écran ne peut
 *  produire ces suites de chiffres par accident, donc « présent / absent » ne parle que d'eux. */
const CIBLE_FIRE = 1_234_567;
const ABO_ANNUEL = 88_812;              // → 7 401 $/mois
const ABO_MENSUEL = ABO_ANNUEL / 12;

/** ⚠️ `formatCAD` sépare les milliers par une espace INSÉCABLE (U+00A0) et en met une autre avant
 *  le « $ ». Une assertion écrite avec des espaces ordinaires serait VACUEUSE — mesuré au lot 56,
 *  où la perturbation laissait quatre tests verts. On normalise DES DEUX CÔTÉS. */
const sansEspaces = (s: string) => s.replace(/[\s  ]/g, '');
const domSansEspaces = () => sansEspaces(document.body.textContent ?? '');

const montePlein = () => {
    useFinanceStore.setState(initialState, true);
    localStorage.clear();
    useFinanceStore.setState({
        config: {
            ...initialState.config,
            users: [
                { ...initialState.config.users[0], name: 'TestUser', grossSalary: 5000, netSalary: 3500 },
                { ...initialState.config.users[1], name: '' },
            ],
        },
        // La cible FIRE vient EXCLUSIVEMENT de la projection (source unique `chartData`).
        lastProjection: { chartData: [{ monthIndex: 0, age: 35, NetWorth: 100_000, FireTarget: CIBLE_FIRE }] } as never,
        subscriptions: [
            { payee: 'Gym', yearlyCost: ABO_ANNUEL, averageAmount: 0, dayOfMonth: 5, category: 'Abo', lastDate: '2026-08-05' },
        ] as never,
    });
};

beforeEach(montePlein);

describe('HealthIndicator — mode discret', () => {
    it('mode NORMAL : les deux montants sont bien à l\'écran (anti-vacuité)', () => {
        render(<HealthIndicator />);
        const dom = domSansEspaces();
        expect(dom).toContain(sansEspaces(formatCAD(CIBLE_FIRE)));
        expect(dom).toContain(sansEspaces(formatCAD(ABO_MENSUEL)));
    });

    it('mode DISCRET : aucun des deux montants n\'est dans le DOM', () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        render(<HealthIndicator />);
        const dom = domSansEspaces();
        // `PrivateAmount` ne floute pas : la valeur n'est PLUS rendue du tout (copier-coller,
        // inspecteur, lecteur d'écran — zéro fuite).
        expect(dom).not.toContain(sansEspaces(formatCAD(CIBLE_FIRE)));
        expect(dom).not.toContain(sansEspaces(formatCAD(ABO_MENSUEL)));
        // …et remplacée par le masque, avec son équivalent lecteur d'écran.
        expect(screen.getAllByText(MASKED_AMOUNT_LABEL).length).toBeGreaterThanOrEqual(2);
    });

    it('mode DISCRET : le CONTEXTE reste lisible — on masque le montant, pas la phrase', () => {
        // Un masquage qui emporterait le gabarit rendrait la ligne incompréhensible (« ••• »
        // tout seul) : la métrique doit rester interprétable sans sa valeur.
        useFinanceStore.setState({ isPrivacyMode: true });
        render(<HealthIndicator />);
        const dom = domSansEspaces();
        expect(dom).toContain(sansEspaces('(cible Future :'));
        expect(dom).toContain(sansEspaces('/mois ('));
        expect(dom).toContain(sansEspaces('du revenu net)'));
    });

    it('l\'`aria-label` du score indisponible passe par le même masquage que le texte', () => {
        // Sans projection, `fireProgress` bascule en `available:false` et son détail part dans un
        // ATTRIBUT — canal par lequel ce dépôt a déjà vu fuir une valeur (revue #608). Aucun `raw`
        // de la branche indisponible ne porte de montant AUJOURD'HUI ; ce que ce cas verrouille,
        // c'est que l'attribut emprunte le helper, donc qu'il suivra le jour où il en portera un.
        useFinanceStore.setState({ lastProjection: null, isPrivacyMode: true });
        render(<HealthIndicator />);
        expect(screen.getByLabelText('Progression FIRE : Projection requise — ouvrir Future')).toBeInTheDocument();
    });
});

describe('healthRawText', () => {
    const parts: HealthRawPart[] = [
        { type: 'texte', texte: 'avant ' },
        { type: 'montant', texte: formatCAD(CIBLE_FIRE) },
        { type: 'texte', texte: ' après' },
    ];

    it('recompose la chaîne complète quand on ne masque pas', () => {
        expect(healthRawText(parts, false)).toBe(`avant ${formatCAD(CIBLE_FIRE)} après`);
    });

    it('remplace le MONTANT — et lui seul — par le libellé partagé de PrivateAmount', () => {
        const masque = healthRawText(parts, true);
        expect(masque).toBe(`avant ${MASKED_AMOUNT_LABEL} après`);
        expect(sansEspaces(masque)).not.toContain(sansEspaces(formatCAD(CIBLE_FIRE)));
    });
});

describe('garde — un segment de MONTANT ne se fabrique qu\'à un seul endroit', () => {
    it('`type: \'montant\'` n\'apparaît qu\'une fois dans healthScore.ts (le constructeur `mnt`)', () => {
        // Sans ça, un site futur pourrait écrire `{ type: 'montant', texte: `${x} $` }` à la main et
        // contourner `formatCAD` — la source unique de formatage. La garde vise la FABRICATION,
        // pas l'usage : `type === 'montant'` (une LECTURE) reste libre.
        const brut = readFileSync('utils/healthScore.ts', 'utf-8');
        const code = stripComments(brut);
        // Anti-vacuité du décommentage : il reste bien du code à scanner (`stripComments` BLANCHIT,
        // donc la longueur ne dit rien — c'est la part NON BLANCHE qui le prouve).
        // ⚠️ Le seuil est PROPRE À CE FICHIER, pas le 0,5 des gardes de dépôt : `healthScore.ts` est
        // majoritairement de la PROSE par conception (chaque garde y porte son incident écrit) —
        // MESURÉ 0,466 de code. Un seuil recopié d'une garde à l'échelle du dépôt aurait rougi sur
        // un fichier parfaitement sain (`l'anti-vacuité du décommentage se déplace avec la portée`).
        expect(partDeCodeRestante(brut, code)).toBeGreaterThan(0.3);
        // ⚠️ Le motif vise la FABRICATION (littéral d'objet, donc `,`), pas la DÉCLARATION du type
        // (`readonly type: 'montant';`, donc `;`) : sans cette distinction il matchait aussi la
        // définition de l'union et comptait 2 — `SCAN-QUI-MATCHE-LA-DECLARATION-AU-LIEU-DE-L-USAGE`.
        const fabrications = code.match(/type:\s*'montant',/g) ?? [];
        expect(fabrications).toHaveLength(1);
        expect(code).toContain('formatCAD(valeur)');
        // Contrôle : la déclaration existe toujours (si l'union était renommée, le motif ci-dessus
        // tomberait à 0 en silence et la garde se lirait « aucune fabrication » = « tout va bien »).
        expect(code).toMatch(/readonly type:\s*'montant';/);
    });
});
