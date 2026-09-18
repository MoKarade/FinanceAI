// tests/components/debtManagerStatutSolde.test.tsx
//
// [DETTE-BALANCEASOF-INVISIBLE] — le formulaire DIT enfin où en est le solde enregistré.
//
// Marc, 2026-09-18, après avoir fait le geste que je lui avais demandé (« ouvre bZ, clique
// Enregistrer ») : « vérifie que la date est posée ». PERSONNE ne pouvait : `balanceAsOf` avait
// DEUX écritures et ZÉRO lecture dans tout `components/`. Un champ qu'on demande à l'utilisateur de
// poser et qu'aucun écran ne rend est indiscernable d'un champ qui n'existe pas.
//
// ⚠️ LE FUSEAU EST LE VRAI PIÈGE DE CE LOT, et le conteneur de CI ne peut pas le voir tout seul :
// il tourne en UTC, où la variante fautive et la bonne coïncident TOUJOURS. Ce fichier force donc un
// fuseau NÉGATIF (celui de Marc) AVANT le premier formatage — mesuré sans le correctif :
// `new Date('2026-09-18')` rend « 17 septembre 2026 » à Montréal, parce qu'un ISO nu est parsé à
// MINUIT UTC (`UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`). Un solde estampillé le 18
// se serait affiché « 17 » chez lui — sur l'écran même qui existe pour le rassurer.
process.env.TZ = 'America/Montreal';

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DebtManager, phraseStatutSolde } from '../../components/DebtManager';
import { statutSoldeDette } from '../../services/projection/debtAmortization';
import { formatIsoDay } from '../../utils/format';
import { todayIsoLocal } from '../../services/projection/dailyRefine';
import type { Debt } from '../../types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return { ResponsiveContainer: P, AreaChart: P, Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null };
});

afterEach(cleanup);

/** ⚠️ Les dates se DÉRIVENT de l'horloge du fichier, jamais recopiées du monde réel : une fixture
 *  figée au 2026-09 deviendrait rouge toute seule en changeant d'année, et une date postérieure à
 *  aujourd'hui rendrait `date-figee` pour une raison qui n'a rien à voir avec le cas testé. */
const AUJ = todayIsoLocal();
const ilYA = (jours: number): string => {
    const [y, m, d] = AUJ.split('-').map(Number);
    const t = new Date(y, m - 1, d - jours);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** Le bail de Marc : versements fixes, taux NUL, cadence connue — le SEUL cas où le solde avance. */
const BAIL = (over: Partial<Debt> = {}): Debt =>
    ({
        id: 'bail', name: 'bZ', category: 'Car', kind: 'auto-lease',
        balance: 46_934, interestRate: 0, minimumPayment: 1_016.90,
        startDate: ilYA(60), termEndDate: ilYA(-1400), paymentFrequency: 'weekly',
        ...over,
    } as unknown as Debt);

describe('[DETTE-BALANCEASOF-INVISIBLE] `statutSoldeDette` — trois formes EXCLUSIVES', () => {
    it('daté ET auto-avançant → `suit-les-versements`, et la date rendue est celle qui est STOCKÉE', () => {
        const statut = statutSoldeDette(BAIL({ balanceAsOf: ilYA(9) } as Partial<Debt>), AUJ);
        expect(statut.forme).toBe('suit-les-versements');
        // ⚠️ Anti-vacuité : la forme seule ne prouve rien si la date rendue vient d'ailleurs.
        if (statut.forme !== 'jamais-date') expect(statut.dateIso).toBe(ilYA(9));
    });

    it('SANS date → `jamais-date` : c’est le cas que Marc ne pouvait pas voir', () => {
        expect(statutSoldeDette(BAIL(), AUJ).forme).toBe('jamais-date');
    });

    it('date ILLISIBLE → `jamais-date` aussi : une date qu’on ne sait pas lire ne vaut pas mieux qu’une absente', () => {
        expect(statutSoldeDette(BAIL({ balanceAsOf: 'bientôt' } as Partial<Debt>), AUJ).forme).toBe('jamais-date');
    });

    it('CONTRÔLE NÉGATIF — une carte de crédit datée → `date-figee` (rien ne la fait avancer)', () => {
        const carte = BAIL({ kind: 'credit-card', balanceAsOf: ilYA(9) } as Partial<Debt>);
        expect(statutSoldeDette(carte, AUJ).forme).toBe('date-figee');
    });

    it('CONTRÔLE NÉGATIF — un TAUX non nul → `date-figee` : on ignore ce que le solde contient', () => {
        const avecTaux = BAIL({ interestRate: 6.59, balanceAsOf: ilYA(9) } as Partial<Debt>);
        expect(statutSoldeDette(avecTaux, AUJ).forme).toBe('date-figee');
    });
});

describe('[DETTE-BALANCEASOF-INVISIBLE] `formatIsoDay` — le jour AFFICHÉ est le jour ÉCRIT', () => {
    it('en fuseau NÉGATIF, un jour ISO ne recule pas d’une journée', () => {
        // Le cœur du lot. Sans la construction en heure LOCALE, ceci rend la VEILLE à Montréal.
        expect(formatIsoDay('2026-09-18')).toBe('18 septembre 2026');
        // ⚠️ Anti-vacuité du FUSEAU lui-même : si `process.env.TZ` n'avait pas pris, le test
        // ci-dessus passerait pour la mauvaise raison (en UTC les deux variantes coïncident).
        expect(new Date('2026-09-18').toLocaleDateString('fr-CA', { day: 'numeric' })).toBe('17');
    });

    it('une valeur illisible rend « — », jamais une date inventée', () => {
        expect(formatIsoDay('bientôt')).toBe('—');
        expect(formatIsoDay(undefined)).toBe('—');
        expect(formatIsoDay('')).toBe('—');
    });
});

describe('[DETTE-BALANCEASOF-INVISIBLE] la PHRASE traduit, elle ne décide pas', () => {
    it('les trois formes donnent trois phrases DISTINCTES, et seule « jamais daté » alerte', () => {
        const suit = phraseStatutSolde({ forme: 'suit-les-versements', dateIso: '2026-09-18' });
        const figee = phraseStatutSolde({ forme: 'date-figee', dateIso: '2026-09-18' });
        const jamais = phraseStatutSolde({ forme: 'jamais-date' });
        expect(new Set([suit.texte, figee.texte, jamais.texte]).size).toBe(3);
        expect([suit.alerte, figee.alerte, jamais.alerte]).toEqual([false, false, true]);
        // Les deux phrases datées nomment le JOUR, pas une approximation.
        expect(suit.texte).toContain('18 septembre 2026');
        expect(figee.texte).toContain('18 septembre 2026');
    });

    it('aucune phrase ne porte de MONTANT (rien à masquer en mode discret, et pas deux chiffres pour une dette)', () => {
        for (const statut of [
            { forme: 'suit-les-versements', dateIso: '2026-09-18' },
            { forme: 'date-figee', dateIso: '2026-09-18' },
            { forme: 'jamais-date' },
        ] as const) {
            expect(phraseStatutSolde(statut).texte).not.toMatch(/\$/);
        }
    });
});

describe('[DETTE-BALANCEASOF-INVISIBLE] le formulaire d’édition REND la phrase', () => {
    it('une dette jamais datée l’annonce dès l’ouverture du formulaire', () => {
        render(<DebtManager debts={[BAIL()]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(screen.getByText(/jamais daté/i)).toBeTruthy();
    });

    it('… et une dette datée affiche SA date, pas celle d’aujourd’hui (sens inverse)', () => {
        render(<DebtManager debts={[BAIL({ balanceAsOf: ilYA(9) } as Partial<Debt>)]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(screen.getByText(new RegExp(formatIsoDay(ilYA(9))))).toBeTruthy();
        expect(screen.queryByText(/jamais daté/i)).toBeNull();
    });
});

describe('[DETTE-BALANCEASOF-INVISIBLE] le rendu ne RE-DÉRIVE pas la décision', () => {
    it('`DebtManager` ne teste ni `kind` ni `interestRate` pour choisir sa phrase', async () => {
        // ⚠️ La décision vit dans `statutSoldeDette` (module qui DÉCIDE). La recopier dans le JSX
        // ferait diverger ce que l'écran AFFIRME de ce que le calcul FAIT — la classe exacte que ce
        // chantier répare. On lit la source DÉCOMMENTÉE : le commentaire qui explique le patron
        // NOMME forcément ces champs (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
        const { readFileSync } = await import('node:fs');
        const { stripCommentsJsx } = await import('../../utils/stripComments');
        const brut = readFileSync('components/DebtManager.tsx', 'utf8');
        const code = stripCommentsJsx(brut);
        // Anti-vacuité du DÉCOMMENTAGE : le code doit survivre, sinon « rien trouvé » se prouve à
        // partir de « il n'y a plus rien ».
        expect(code).toContain('phraseStatutSolde');
        expect(code.replace(/\s/g, '').length / brut.replace(/\s/g, '').length).toBeGreaterThan(0.5);

        const corps = code.slice(code.indexOf('export function phraseStatutSolde'));
        const fin = corps.indexOf('\n}');
        const mapper = corps.slice(0, fin);
        expect(mapper).not.toMatch(/\bkind\b/);
        expect(mapper).not.toMatch(/interestRate|minimumPayment|startDate/);
        // Et le mapper doit VRAIMENT être là (sinon les deux `not` ci-dessus sont vrais du vide).
        expect(mapper).toMatch(/jamais-date/);
    });
});
