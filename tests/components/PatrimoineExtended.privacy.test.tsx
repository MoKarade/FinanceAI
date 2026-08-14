// tests/components/PatrimoineExtended.privacy.test.tsx
//
// [A11Y-PRIVACY-PATRIMOINE-ETENDU] — 4ᵉ ticket du lot `[A11Y-PRIVACY-LOT2]`.
//
// Quatre panneaux de Réglages entièrement à nu : assurances (capital, prime), immeubles locatifs
// (prix, valeur, hypothèque, loyer, charges, DPA), sociétés (JVM, dividende) et objectifs cycliques
// (véhicule, rénovation, don). 17 champs numériques, ZÉRO référence au mode discret.
//
// CRITÈRE — le fichier avait DÉJÀ sa convention : un champ monétaire porte « (dollars) » dans son
// `aria-label`, un autre porte « (pourcentage) » ou « (années) ». On s'appuie dessus plutôt que
// d'en inventer une. 13 champs monétaires sur 17 ; les 4 restants (taux hypothécaire, vacance,
// % détenu, fréquence de remplacement) ne sont pas des sommes et restent lisibles.
//
// ⚠️ Deux champs d'assurance n'avaient AUCUN nommage — seulement un `placeholder`, qui disparaît
// avec le champ quand il est masqué. Ils auraient donné deux boutons « ••• » anonymes. Nommés selon
// la convention du fichier.
//
// ⚠️ Le NOI du résumé d'immeuble était doublement fautif : en clair quel que soit le mode, ET rendu
// par un `toLocaleString` nu alors que la règle du dépôt est `formatCAD` (source unique).
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    InsurancePanel, RentalPropertyPanel, BusinessPanel, CyclicalGoalsPanel,
} from '../../components/PatrimoineExtended';
import { useFinanceStore } from '../../store/useFinanceStore';
import type {
    InsurancePolicy, RentalProperty, PrivateBusiness,
    VehicleReplacement, MajorRenovation, CharitableGoal,
} from '../../types';

const setPrivacy = (on: boolean) => act(() => { useFinanceStore.setState({ isPrivacyMode: on }); });

// Montants à 5-6 chiffres : un nombre court croiserait un pourcentage, une année ou un seuil du
// rendu (leçon du témoin 1213, qui vivait dans « T1213 retenue source »).
const POLICES: InsurancePolicy[] = [
    { id: 'p1', kind: 'life-term', insurer: 'Assureur X', faceAmount: 743119, monthlyPremium: 18337 } as InsurancePolicy,
];
const IMMEUBLES: RentalProperty[] = [
    {
        id: 'r1', name: 'Duplex Rosemont',
        purchasePrice: 412987, currentValue: 583641, mortgageBalance: 271853,
        mortgageRate: 4.7, monthlyRent: 32719, vacancyPct: 6.3, monthlyExpenses: 11447,
        ccaTaken: 94271,
    } as RentalProperty,
];
const SOCIETES: PrivateBusiness[] = [
    { id: 'b1', name: 'Ma société', ownershipPct: 73, estimatedValue: 861329, annualDividend: 57413 } as PrivateBusiness,
];
const VEHICULES: VehicleReplacement[] = [{ id: 'v1', cyclYears: 9, costEstimate: 43817 }];
const RENOS: MajorRenovation[] = [{ id: 'n1', date: '2029-05-01', cost: 66293 }];
const DONS: CharitableGoal[] = [{ id: 'c1', annualAmount: 21769 }];

/** Les 13 montants du fichier, avec le panneau qui les rend. */
const MONTANTS: Array<[string, number]> = [
    ['capital assuré', 743119], ['prime mensuelle', 18337],
    ['prix d’achat', 412987], ['valeur actuelle', 583641], ['hypothèque', 271853],
    ['loyer', 32719], ['charges', 11447], ['DPA', 94271],
    ['JVM société', 861329], ['dividende', 57413],
    ['coût véhicule', 43817], ['coût rénovation', 66293], ['don annuel', 21769],
];

/** Les grandeurs NON monétaires, qui doivent rester lisibles. */
const NON_MONTANTS: Array<[string, number]> = [
    ['taux hypothécaire', 4.7], ['vacance', 6.3], ['% détenu', 73], ['fréquence véhicule', 9],
];

const renderTous = () => render(
    <>
        <InsurancePanel policies={POLICES} onChange={vi.fn()} />
        <RentalPropertyPanel properties={IMMEUBLES} onChange={vi.fn()} />
        <BusinessPanel businesses={SOCIETES} onChange={vi.fn()} />
        <CyclicalGoalsPanel
            vehicles={VEHICULES} renovations={RENOS} charity={DONS}
            onVehicles={vi.fn()} onRenovations={vi.fn()} onCharity={vi.fn()}
        />
    </>,
);

const inputValues = (c: HTMLElement) =>
    [...c.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value).join('|');

const allText = (c: HTMLElement) => {
    const attrs = [...c.querySelectorAll('[title], [aria-label], [placeholder]')]
        .map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`)
        .join(' ');
    return `${c.textContent ?? ''} ${attrs} ${inputValues(c)}`.replace(/[\s  ]/g, '');
};

beforeEach(() => { setPrivacy(false); });
afterEach(() => { cleanup(); setPrivacy(false); });

describe('[A11Y-PRIVACY-PATRIMOINE-ETENDU] les 13 montants des 4 panneaux', () => {
    it('mode discret INACTIF : les 13 montants sont LISIBLES (le test discrimine)', () => {
        const { container } = renderTous();
        const values = inputValues(container);
        for (const [quoi, montant] of MONTANTS) {
            expect(values, `${quoi} devrait être lisible hors mode discret`).toContain(String(montant));
        }
    });

    it('mode discret ACTIF : les 13 montants SORTENT du DOM', () => {
        setPrivacy(true);
        const { container } = renderTous();
        const text = allText(container);
        for (const [quoi, montant] of MONTANTS) {
            expect(text, `${quoi} fuyait`).not.toContain(String(montant));
        }
    });

    it('mode discret ACTIF : taux, pourcentages et durées restent LISIBLES', () => {
        setPrivacy(true);
        const { container } = renderTous();
        const values = inputValues(container);
        for (const [quoi, valeur] of NON_MONTANTS) {
            expect(values, `${quoi} n'est pas un montant : il ne doit PAS être masqué`).toContain(String(valeur));
        }
    });

    it('mode discret ACTIF : le clic révèle un champ NUMÉRIQUE éditable', () => {
        setPrivacy(true);
        const { container } = renderTous();
        const btn = [...container.querySelectorAll('button')]
            .find((b) => b.getAttribute('aria-label') === 'Loyer mensuel (dollars)')!;
        expect(btn.tagName).toBe('BUTTON');
        act(() => { fireEvent.click(btn); });
        const champ = container.querySelector('input[aria-label="Loyer mensuel (dollars)"]') as HTMLInputElement;
        expect(champ.tagName).toBe('INPUT');
        expect(champ.type, 'le champ révélé doit rester numérique').toBe('number');
        expect(champ.value).toBe(String(IMMEUBLES[0].monthlyRent));
    });
});

// ── Le NOI du résumé : masqué ET passé par formatCAD ──────────────────────────────────────────
describe('[A11Y-PRIVACY-PATRIMOINE-ETENDU] NOI du résumé d’immeuble', () => {
    // NOI = loyer×12×(1−vacance) − charges×12, calculé par le composant. On ne le recopie PAS en dur
    // ici : on vérifie qu'AUCUN des montants d'entrée ne subsiste, et que le résumé est masqué.
    it('mode discret INACTIF : le NOI est affiché, et formaté par formatCAD (espace fine, pas de « $ » collé)', () => {
        const { container } = renderTous();
        const resume = container.querySelector('summary')!.textContent ?? '';
        expect(resume, "le nom de l'immeuble identifie le bloc : il reste").toContain('Duplex Rosemont');
        expect(resume, 'le cap rate est un taux, il reste').toMatch(/Cap:\s*[\d.]+%/);
        // `toLocaleString('fr-CA') + '$'` produisait « 1 234$ » (dollar COLLÉ, hors source unique).
        expect(resume, 'un « $ » collé au nombre trahit un toLocaleString nu').not.toMatch(/\d\$/);
    });

    it('mode discret ACTIF : le NOI est masqué, le nom et le cap rate restent', () => {
        setPrivacy(true);
        const { container } = renderTous();
        const resume = container.querySelector('summary')!.textContent ?? '';
        expect(resume).toContain('Duplex Rosemont');
        expect(resume).toMatch(/Cap:\s*[\d.]+%/);
        expect(resume, 'le NOI doit être remplacé par « ••• »').toContain('•••');
    });
});

// ── Nommage : sans lui, 13 boutons « ••• » anonymes ──────────────────────────────────────────
describe('[A11Y-PRIVACY-PATRIMOINE-ETENDU] nom accessible des champs masqués', () => {
    it('mode discret ACTIF : chaque montant masqué garde SON libellé, et tous sont distincts', () => {
        setPrivacy(true);
        const { container } = renderTous();
        const noms = [...container.querySelectorAll('button[aria-label]')]
            .map((b) => b.getAttribute('aria-label')!)
            .filter((n) => n.includes('(dollars)'));
        expect(noms, 'les 13 champs monétaires doivent être nommés').toHaveLength(13);
        expect(new Set(noms).size, 'deux champs masqués portent le MÊME nom').toBe(13);
        // Les deux champs d'assurance n'avaient AUCUN nommage avant ce lot.
        expect(noms).toContain('Capital assuré (dollars)');
        expect(noms).toContain('Prime mensuelle (dollars)');
    });
});

// ── Garde de SOURCE : la convention « (dollars) » du fichier, appliquée ───────────────────────
// Un test de RENDU ne voit que les panneaux instanciés par la fixture ; un scan de SOURCE voit tout
// le fichier, y compris un champ ajouté demain dans un panneau que la fixture n'utilise pas.
describe('[A11Y-PRIVACY-PATRIMOINE-ETENDU] garde de source : tout champ « (dollars) » est masqué', () => {
    const source = readFileSync(resolve(__dirname, '../../components/PatrimoineExtended.tsx'), 'utf8');
    // Source décommentée : ce fichier CITE des noms de champs dans ses commentaires, et un scan sur
    // la source brute prendrait ces mentions pour de vrais champs (leçon #630). On retire les
    // commentaires JSX en bloc ET les lignes `//` — une ligne entière, donc aucun risque de couper
    // une URL au milieu d'une instruction.
    const propre = source
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    /** Chaque contrôle, avec l'`aria-label` qu'il porte. */
    const controles = () => {
        const out: Array<{ balise: string; libelle: string }> = [];
        const re = /<(input|PrivateNumberInput)\s+aria-label="([^"]*)"/g;
        for (const m of propre.matchAll(re)) out.push({ balise: m[1], libelle: m[2] });
        return out;
    };

    /** Tous les `aria-label` du fichier, sans hypothèse sur la balise ni l'ordre des attributs. */
    const tousLesLibelles = () =>
        [...propre.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);

    // ⚠️ LA garde de la garde — comparaison d'ENSEMBLES, pas de CARDINALITÉS.
    // La regex de `controles()` exige que `aria-label` soit le PREMIER attribut de la balise. Un
    // futur champ écrit `<PrivateNumberInput type="number" aria-label="X (dollars)" …>` lui
    // échapperait entièrement. Comparer deux LONGUEURS le détecterait, mais serait aveugle à deux
    // erreurs qui se COMPENSENT numériquement. On compare donc les libellés eux-mêmes : le message
    // d'échec nomme alors le champ manquant au lieu d'annoncer un écart de compte.
    it('le scan voit TOUS les champs nommés du fichier (aucun angle mort)', () => {
        const vus = new Set(controles().map((c) => c.libelle));
        const manquants = tousLesLibelles().filter((l) => !vus.has(l));
        expect(manquants, 'ces champs nommés échappent au scan : la garde ne les protège pas').toEqual([]);
    });

    it('la garde voit bien des libellés « (dollars) » (sinon elle ne prouverait rien)', () => {
        expect(controles().filter((c) => c.libelle.includes('(dollars)'))).toHaveLength(13);
    });

    it('AUCUN champ « (dollars) » ne reste un <input> nu', () => {
        const fautifs = controles()
            .filter((c) => c.libelle.includes('(dollars)') && c.balise !== 'PrivateNumberInput')
            .map((c) => `« ${c.libelle} »`);
        expect(fautifs, 'un montant est saisi en clair, quel que soit le mode discret').toEqual([]);
    });

    // Symétrique : masquer un non-montant coûte de la lisibilité sans rien protéger de plus.
    it('AUCUN champ SANS « (dollars) » n’est masqué', () => {
        const fautifs = controles()
            .filter((c) => !c.libelle.includes('(dollars)') && c.balise === 'PrivateNumberInput')
            .map((c) => `« ${c.libelle} »`);
        expect(fautifs, "ce champ n'est pas un montant : le masquer coûte de la lisibilité pour rien").toEqual([]);
    });

    it('la règle formatCAD est respectée : aucun toLocaleString dans le fichier', () => {
        expect(propre, '`formatCAD` est la source unique de formatage $').not.toContain('toLocaleString');
    });
});
