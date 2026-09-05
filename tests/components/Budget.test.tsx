import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { Budget } from '../../components/Budget';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getViewContext, _resetViewContextForTests } from '../../services/aiChat/viewContext';
import type { BudgetConfig, BudgetCategory, User, Transaction } from '../../types';
import { formatCAD } from '../../utils/format';

// Mock recharts (jsdom n'a pas SVG dimensions)
vi.mock('recharts', async () => {
    const React = await import('react');
    const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: Passthrough,
        PieChart: Passthrough,
        Pie: () => null,
        Cell: () => null,
        Tooltip: () => null,
        Legend: () => null,
        BarChart: Passthrough,
        Bar: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        ReferenceLine: () => null,
        LineChart: Passthrough,
        Line: () => null,
    };
});

const defaultConfig: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

const defaultBudget: BudgetCategory[] = [
    { id: 'cat1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
    { id: 'cat2', name: 'Restaurants', target: 200, frequency: 'Monthly', type: 'Commun', nature: 'Envie' },
    { id: 'cat3', name: 'CELI', target: 500, frequency: 'Monthly', type: 'Commun', nature: 'Epargne' },
];

const baseProps = {
    transactions: [],
    config: defaultConfig,
    budgetItems: defaultBudget,
    setBudgetItems: () => {},
    apiKey: '',
};

describe('Budget — refonte UI (Phase C3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('se rend sans crash avec props minimales', () => {
        const { container } = render(<Budget {...baseProps} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('[REFONTE-NAV-L5] pas de second h1 : l\'en-tête de page vit dans BudgetWorkspace, Budget garde la barre de pilotage', () => {
        const { container } = render(<Budget {...baseProps} />);
        // L'ancien h1 « Pilotage Budget » est demoté (un seul h1 par destination, porté par le workspace).
        expect(container.querySelector('h1')).toBeNull();
        expect(container.textContent).not.toContain('Pilotage Budget');
        // La barre de pilotage reste : vision de la période + bouton Diagnostic.
        expect(container.textContent).toContain('Vision tactique (Mois en cours)');
        expect(container.textContent).toContain('Diagnostic');
    });

    it('Phase D\'.5 — affiche les 4 tuiles dual prévu/réel (Budget / Revenus / Dépenses / Restant)', () => {
        const { container } = render(<Budget {...baseProps} />);
        const text = container.textContent || '';
        expect(text).toContain('Budget');
        expect(text).toContain('Revenus');
        expect(text).toContain('Dépenses');
        expect(text).toContain('Restant');
        // Les tuiles affichent toutes le label "Réel / Prévu"
        expect(text.match(/Réel \/ Prévu/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    });

    // [BUDGET-REEL-PREVISIONNEL-OBJECTIF] les 4 tuiles passent de Réel/Prévu à Réel/Prévu/OBJECTIF.
    // Discriminant : sans `objectif` sur DualKPIStat, aucun libellé « Objectif : » n'existe et
    // le label reste "Réel / Prévu" seul (perturbation : retirer les props `objectif` fait rougir
    // ce test — vérifié en local).
    it('[BUDGET-REEL-PREVISIONNEL-OBJECTIF] les 4 tuiles affichent une 3e valeur Objectif', () => {
        const { container } = render(<Budget {...baseProps} />);
        const text = container.textContent || '';
        expect(text.match(/Réel \/ Prévu \/ Objectif/g)?.length ?? 0).toBe(4);
        // [a11y panel] Le libellé est un `sr-only` INLINE (plus un `title` HTML, non fiable sur un span).
        const objectifNodes = [...container.querySelectorAll('.sr-only')].filter((n) => (n.textContent ?? '').startsWith('Objectif'));
        expect(objectifNodes.length).toBe(4);
    });

    it('[BUDGET-REEL-PREVISIONNEL-OBJECTIF] Objectif Dépenses = somme des cibles de catégorie, Objectif Restant = Objectif Revenus − Objectif Dépenses', () => {
        const { container } = render(<Budget {...baseProps} />);
        const parseObjectif = (label: string): number => {
            const labelNode = [...container.querySelectorAll('.kpi-label')].find((l) => (l.textContent ?? '').includes(label));
            const tile = labelNode!.closest('div[class*="rounded-card"]');
            const srLabel = [...tile!.querySelectorAll('.sr-only')].find((n) => (n.textContent ?? '').startsWith('Objectif'));
            // Le montant est le texte du PARENT, moins le préfixe sr-only « Objectif : ».
            const raw = (srLabel!.parentElement!.textContent ?? '').replace(/^\s*Objectif\s*:\s*/, '');
            return Number(raw.replace(/[^\d.,-]/g, '').replace(',', '.'));
        };
        const revenus = parseObjectif('Revenus');
        const depenses = parseObjectif('Dépenses');
        const restant = parseObjectif('Restant');
        // 1500 (Loyer, Besoin) + 200 (Restaurants, Envie). Le poste CELI (500, nature Épargne) est
        // EXCLU : le « réel » d'en face filtre `isTransfer`, donc une cotisation d'épargne ne peut
        // structurellement jamais y apparaître — l'inclure comparait deux assiettes différentes
        // (finding financial-integrity MESURÉ : « sous le budget » permanent de 500 $/mois).
        expect(depenses).toBeCloseTo(1700, 0);
        expect(revenus).toBeGreaterThan(0);
        expect(restant).toBeCloseTo(revenus - depenses, 0);
    });

    // [BUDGET-REEL-PREVISIONNEL-OBJECTIF] no-fake-data — findings financial-integrity MESURÉS.
    it('grossSalary absent (paie importée en NET seul) → PAS d\'objectif de revenu, jamais un « 0 $ » crédible', () => {
        // `fiscalBreakdown` dérive le net du SEUL grossSalary : sans lui, l'objectif valait 0 $ et
        // l'objectif de reste-à-vivre était NÉGATIF. Chemin réel : mcp/ingest/applyDocument.ts
        // écrit netSalary sans toucher grossSalary quand la fiche ne porte que le net.
        const netOnly = {
            ...baseProps,
            config: {
                ...defaultConfig,
                users: [
                    { ...defaultConfig.users[0], grossSalary: 0, netSalary: 5000 },
                    { ...defaultConfig.users[1], grossSalary: 0, netSalary: 0 },
                ],
            } as BudgetConfig,
        };
        const { container } = render(<Budget {...netOnly} />);
        const objectifs = [...container.querySelectorAll('.sr-only')].filter((n) => (n.textContent ?? '').startsWith('Objectif'));
        // Dépenses + Fin de mois gardent leur objectif (cibles saisies) ; Revenus et Restant l'OMETTENT.
        const labelDe = (name: string) => {
            const l = [...container.querySelectorAll('.kpi-label')].find((x) => (x.textContent ?? '').includes(name));
            return l!.closest('div[class*="rounded-card"]')!;
        };
        expect(labelDe('Revenus').querySelector('.sr-only')).toBeNull();
        expect(labelDe('Restant').querySelector('.sr-only')).toBeNull();
        expect(objectifs.length).toBeGreaterThan(0); // les tuiles de dépenses en ont toujours un
        expect(container.textContent).not.toMatch(/Objectif\s*:\s*0\s?\$/);
    });

    it('[BUDGET-REEL-PREVISIONNEL-OBJECTIF] l\'Objectif est une cible SAISIE : le simulateur d\'inflation ne le bouge pas', () => {
        // `getDisplayTarget` indexe par `inflationSim` ; l'Objectif passe par `getBaseMonthlyTarget`,
        // qui ne l'indexe pas. Mesuré avant correctif : 2 200 $ → 2 370 $ à +10 %.
        const { container } = render(<Budget {...baseProps} />);
        const readObjectif = () => {
            const l = [...container.querySelectorAll('.kpi-label')].find((x) => (x.textContent ?? '').includes('Dépenses'));
            const tile = l!.closest('div[class*="rounded-card"]')!;
            const sr = [...tile.querySelectorAll('.sr-only')].find((n) => (n.textContent ?? '').startsWith('Objectif'));
            return Number((sr!.parentElement!.textContent ?? '').replace(/^\s*Objectif\s*:\s*/, '').replace(/[^\d.,-]/g, '').replace(',', '.'));
        };
        const avant = readObjectif();
        const slider = container.querySelector('input[type="range"]');
        expect(slider).not.toBeNull();
        fireEvent.change(slider!, { target: { value: '10' } });
        expect(readObjectif()).toBeCloseTo(avant, 0);
    });

    it('affiche le badge Excédentaire/Déficitaire', () => {
        const { container } = render(<Budget {...baseProps} />);
        const text = container.textContent || '';
        // Soit l'un soit l'autre — dépend des montants
        expect(text.match(/Excédentaire|Déficitaire/)).toBeTruthy();
    });

    it('[PH4E-OWNER-EDIT] mode COUPLE (user2 nommé) : section « Santé Financière du Couple » présente', () => {
        const { container } = render(<Budget {...baseProps} />);
        expect(container.textContent || '').toContain('du Couple');
    });

    it('[PH4E-OWNER-EDIT] mode SOLO (user2 SANS nom) : section « du Couple » ABSENTE (isSolo basé sur le nom, pas length)', () => {
        // Régression : `config.users` est un tuple [User,User] → length toujours 2 → isSolo était toujours faux,
        // la section couple s'affichait en solo (et un ownerId orphelin y montrait un montant inexpliqué).
        const soloConfig: BudgetConfig = { ...defaultConfig, users: [defaultConfig.users[0], { ...defaultConfig.users[1], name: '' } as User] };
        const { container } = render(<Budget {...baseProps} config={soloConfig} />);
        const text = container.textContent || '';
        expect(text).toContain('Santé Financière'); // la carte existe (titre solo)
        expect(text).not.toContain('du Couple');     // mais pas la variante couple
    });

    it('[BUDGET-IMPOTS-HORS-COMPARAISON] la tuile « Dépenses » exclut les impôts de son réel ET le dit, montant à l’appui', () => {
        // Décision Marc 2026-09-05 (3a). Sur l'ancien code, la réel valait 1 700 (impôts inclus) et rien ne
        // le disait ; les cibles, elles, n'ont jamais eu de poste Impôts → deux assiettes comparées.
        const now = new Date();
        const iso = (d: Date) => d.toISOString().split('T')[0];
        const curDate = iso(new Date(now.getFullYear(), now.getMonth(), 1));
        const tx = (id: string, category: string, amount: number): Transaction =>
            ({ id, date: curDate, description: category, category, amount } as unknown as Transaction);
        const transactions = [tx('r1', 'Restaurants', -1000), tx('i1', 'Impôts', -700)];

        const { container } = render(<Budget {...baseProps} transactions={transactions} />);
        const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
            .find((l) => (l.textContent ?? '').includes('Dépenses'));
        const tile = label!.closest('.rounded-card') as HTMLElement;
        const reel = tile.querySelector('.text-kpi') as HTMLElement;
        expect((reel.textContent ?? '').replace(/[^\d]/g, '')).toBe('1000');
        const texte = (tile.textContent ?? '').replace(/\u00a0/g, ' ');
        expect(texte).toContain('hors impôts');
        // Le montant exclu est NOMMÉ, composé par le formateur (espace insécable normalisée ci-dessus).
        expect(texte).toContain(`exclus : ${formatCAD(700).replace(/\u00a0/g, ' ')}`);
    });

    it('[BUDGET-MONTH-NAV] naviguer vers le mois précédent RECALCULE les dépenses RÉELLES (régression periodOffset)', () => {
        // Bug Marc 2026-07-16 : le memo `actualsMap` (dépenses réelles par poste) omettait `periodOffset`
        // dans ses deps → naviguer vers un autre mois NE recalculait pas les réels (« ça s'actualise pas »).
        // Discriminant : on scope la RÉEL de la tuile « Dépenses » (pas la prévu = moyenne passée). Sur
        // l'ancien code, la réel reste figée sur le mois courant (1000) après clic ; le fix la passe à 9999.
        const now = new Date();
        const iso = (d: Date) => d.toISOString().split('T')[0];
        const curDate = iso(new Date(now.getFullYear(), now.getMonth(), 1));       // mois courant
        const prevDate = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15)); // mois précédent
        const tx = (id: string, date: string, amount: number): Transaction =>
            ({ id, date, description: 'Resto', category: 'Restaurants', amount } as unknown as Transaction);
        const transactions = [tx('c1', curDate, -1000), tx('p1', prevDate, -9999)];

        const { container, getByLabelText } = render(<Budget {...baseProps} transactions={transactions} />);

        // La RÉEL de la tuile « Dépenses » = premier montant (.text-kpi), la prévu = second (moy. passée).
        // On cible la tuile KPI via `.kpi-label` (« Dépenses » apparaît aussi ailleurs : en-tête du grand livre).
        const reelDigits = (): string => {
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Dépenses'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const reel = tile.querySelector('.text-kpi') as HTMLElement;
            return (reel.textContent ?? '').replace(/[^\d]/g, '');
        };

        expect(reelDigits()).toBe('1000'); // mois courant : 1000 dépensé

        fireEvent.click(getByLabelText('Période précédente')); // periodOffset → -1

        expect(reelDigits()).toBe('9999'); // mois précédent : le memo a bien recalculé (échoue sur l'ancien code)
    });

    it('[BUDGET-3-VUES] la colonne « Moy. 12m » câble le VRAI calcul (ledger → cellule) et suit la période (×12 en Année)', () => {
        // Finding panel PR #500 : les tests de BudgetGroupTable MOCKENT getDisplayAvg → le câblage
        // réel de Budget.tsx (lookup avg12ByItem + × getMultiplier) n'était exercé par aucun test.
        const now = new Date();
        const iso = (d: Date) => d.toISOString().split('T')[0];
        const prevDate = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15)); // mois précédent (1 mois plein)
        const transactions = [
            { id: 'p1', date: prevDate, description: 'Resto', category: 'Restaurants', amount: -123 } as unknown as Transaction,
        ];
        const { getByDisplayValue, getByText } = render(<Budget {...baseProps} transactions={transactions} />);

        // 1 mois plein d'historique → moyenne mensuelle = 123 $, rendue dans la LIGNE du poste.
        // NB : getByText(string) compare l'attendu BRUT au texte DOM NORMALISÉ (les espaces
        // insécables de formatCAD deviennent des espaces simples) → normaliser l'attendu pareil.
        const cad = (n: number) => formatCAD(n).replace(/[  ]/g, ' ');
        const row = () => getByDisplayValue('Restaurants').closest('tr') as HTMLElement;
        expect(within(row()).getByText(cad(123))).toBeInTheDocument();

        // Vue Année : la moyenne suit la MÊME normalisation de période que la cible (×12).
        // Échoue si le multiplicateur n'est pas appliqué à la moyenne (câblage getMultiplier).
        fireEvent.click(getByText('Année'));
        expect(within(row()).getByText(cad(123 * 12))).toBeInTheDocument();
    });

    it('[BUDGET-INCOME-REAL] Revenus = vraies transactions salaire+divers (pas les positifs non-revenu), avec ventilation', () => {
        // Bug Marc 2026-07-16 : le revenu doit venir des vraies rentrées (paie Robovic + revenus divers),
        // ventilé, et NE PAS compter un positif non-revenu (remboursement). Discriminant : l'ancien code
        // sommait TOUS les positifs → 2600 ; le fix restreint aux catégories de revenu → 2500.
        const now = new Date();
        const cur = new Date(now.getFullYear(), now.getMonth(), 3).toISOString().split('T')[0];
        const tx = (id: string, amount: number, category: string): Transaction =>
            ({ id, date: cur, payee: 'X', amount, category } as unknown as Transaction);
        const transactions = [
            tx('s1', 2000, 'Salaire'),         // paie
            tx('d1', 500, 'Revenus divers'),   // divers
            tx('r1', 100, 'Remboursement'),    // positif MAIS pas un revenu → NE doit PAS compter
            tx('e1', -300, 'Restaurants'),     // dépense
        ];
        const { container } = render(<Budget {...baseProps} transactions={transactions} />);

        const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
            .find((l) => (l.textContent ?? '').includes('Revenus'));
        const tile = label!.closest('.rounded-card') as HTMLElement;
        const reel = (tile.querySelector('.text-kpi') as HTMLElement).textContent?.replace(/[^\d]/g, '');
        expect(reel).toBe('2500'); // 2000 + 500, PAS 2600 (remboursement exclu)
        // Ventilation salaire / divers visible
        expect(tile.textContent).toMatch(/Salaire/);
        expect(tile.textContent).toMatch(/Divers/);
    });

    // [BUDGET-INCOME-WINDOW-UTC-OFFBYONE] `incomeBreakdown` comparait `new Date(t.date)` (ancré UTC
    // minuit) à `start`/`end` (ancrés en heure LOCALE) — sous un fuseau NÉGATIF, ça excluait le 1er
    // jour de la période. Invisible en CI (conteneur en UTC, où les deux ancrages coïncident) : le
    // fuseau est un PARAMÈTRE du test, pas un détail d'environnement (leçon
    // `UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`).
    describe('[BUDGET-INCOME-WINDOW-UTC-OFFBYONE] fenêtre revenus vs fuseau horaire', () => {
        const originalTz = process.env.TZ;
        beforeEach(() => { process.env.TZ = 'America/Toronto'; });
        // [finding financial-integrity #751] `process.env.TZ = undefined` écrit la CHAÎNE
        // "undefined", pas une absence — `delete` si le TZ n'était pas défini au départ, sinon les
        // tests suivants tournent sous un fuseau nommé "undefined" plutôt que celui du conteneur.
        afterEach(() => {
            if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
        });

        it('un revenu daté du 1er du mois compte, même sous un fuseau à décalage négatif', () => {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const firstOfMonth = `${y}-${m}-01`;
            const transactions: Transaction[] = [
                { id: 'i1', date: firstOfMonth, payee: 'X', amount: 500, category: 'Revenus divers' } as unknown as Transaction,
            ];
            const { container } = render(<Budget {...baseProps} transactions={transactions} />);
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Revenus'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const reel = (tile.querySelector('.text-kpi') as HTMLElement).textContent?.replace(/[^\d]/g, '');
            expect(reel).toBe('500'); // pas '0' : le 1er du mois n'est plus perdu
        });

        it('une plage PERSONNALISÉE compte les deux bornes, même sous un fuseau à décalage négatif', () => {
            // Vérifie la COHÉRENCE entre `parseLocalDateStr` (bloc CUSTOM) et `toLocalDateStr`
            // (`getDateRangeStrings`), pas un bug observable en isolation sur CUSTOM : avant ce lot,
            // `getDateRange` CUSTOM ancrait DÉJÀ en UTC (`new Date(customStart)`), comme le faisait
            // `incomeBreakdown` — les deux ancrages UTC coïncidaient, donc un `git stash` du fichier
            // ENTIER laisse ce test VERT (les deux défauts s'annulent, mesuré). La preuve qui compte
            // est la perturbation CIBLÉE : reverter SEULEMENT `parseLocalDateStr` (en gardant
            // `toLocalDateStr`) rougit ce test à 300 $ (la borne de fin perdue) — c'est CETTE
            // combinaison-là (nouveau `toLocalDateStr` + ancien ancrage UTC de CUSTOM) qui aurait pu
            // exister si les deux correctifs avaient été faits en deux lots séparés.
            // `new Date('2026-08-01')` ancre à UTC minuit ; relu en heure locale sous Toronto
            // (UTC-4), ça redevenait le 31 juillet AVANT ce correctif (`parseLocalDateStr`).
            const transactions: Transaction[] = [
                { id: 'i1', date: '2026-08-01', payee: 'X', amount: 300, category: 'Revenus divers' } as unknown as Transaction,
                { id: 'i2', date: '2026-08-31', payee: 'X', amount: 200, category: 'Revenus divers' } as unknown as Transaction,
            ];
            const { container, getByText, getByLabelText } = render(<Budget {...baseProps} transactions={transactions} />);
            fireEvent.click(getByText('Custom'));
            fireEvent.change(getByLabelText('Date de début'), { target: { value: '2026-08-01' } });
            fireEvent.change(getByLabelText('Date de fin'), { target: { value: '2026-08-31' } });
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Revenus'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const reel = (tile.querySelector('.text-kpi') as HTMLElement).textContent?.replace(/[^\d]/g, '');
            expect(reel).toBe('500'); // 300 + 200, pas '0' ou '300' (une borne perdue)
        });

        it('[finding financial-integrity #751] le multiplicateur Custom compte des jours CIVILS, pas un delta d\'heures autour d\'un changement d\'heure', () => {
            // Nov 2026 : le passage à l'heure d'hiver a lieu le 1er novembre en Amérique du Nord —
            // un delta de MILLISECONDES entre deux `Date` locales (1er → 30 novembre) inclut
            // l'heure ajoutée par le retour à l'heure normale, arrondi vers le haut par `Math.ceil`.
            // [BUDGET-TRANSACTIONS-SYNC-AUDIT] La borne « juste » a changé depuis #751 : la fenêtre
            // de sélection est INCLUSIVE des deux bornes (29 jours d'écart + 1 = 30 jours réels), donc
            // le multiplicateur correct est 30/30.44 ≈ 986 $ — qui coïncide numériquement, pour CETTE
            // plage précise, avec l'ancien delta d'heures buggué (30 jours lui aussi, par un mécanisme
            // sans rapport). Cette plage ne peut donc plus, à elle seule, discriminer une régression
            // ms-delta : c'est le test DST-libre juste après (Août) qui prouve le +1 inclusif.
            const now = new Date();
            const past = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            const py = past.getFullYear();
            const pm = String(past.getMonth() + 1).padStart(2, '0');
            const transactions: Transaction[] = [
                { id: 's1', date: `${py}-${pm}-15`, payee: 'X', amount: 1000, category: 'Salaire' } as unknown as Transaction,
            ];
            const { getByText, getByLabelText, container } = render(<Budget {...baseProps} transactions={transactions} />);
            fireEvent.click(getByText('Custom'));
            fireEvent.change(getByLabelText('Date de début'), { target: { value: '2026-11-01' } });
            fireEvent.change(getByLabelText('Date de fin'), { target: { value: '2026-11-30' } });
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Revenus'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const prevuEl = tile.querySelector('.text-meta.tabular-nums') as HTMLElement;
            const prevu = Number(prevuEl.textContent?.replace(/[^\d]/g, ''));
            // 1000 × 30/30.44 ≈ 986 $ (30 jours civils INCLUSIFS, DST-safe).
            expect(prevu).toBeGreaterThan(970);
            expect(prevu).toBeLessThan(1000);
        });

        // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Plage SANS changement d'heure (Août) : isole le défaut
        // d'inclusivité (finding A8) de toute question de DST. La fenêtre de sélection retient les
        // DEUX bornes (`t.date >= startStr && t.date <= endStr`), donc 01→31 août = 31 jours réels
        // de transactions, pas 30 (civilDaysBetween exclusif). Discriminant : revenir à
        // `civilDaysBetween(start, end)` seul (sans le `+ 1`) rend ce test rouge à ~986 $ au lieu de
        // ~1 018 $ (mesuré, écart −3,2 % correspondant exactement au tableau de l'audit).
        it('[BUDGET-TRANSACTIONS-SYNC-AUDIT] le multiplicateur Custom compte les jours INCLUSIFS des deux bornes (01→31 août = 31 jours, pas 30)', () => {
            const now = new Date();
            const past = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            const py = past.getFullYear();
            const pm = String(past.getMonth() + 1).padStart(2, '0');
            const transactions: Transaction[] = [
                { id: 's1', date: `${py}-${pm}-15`, payee: 'X', amount: 1000, category: 'Salaire' } as unknown as Transaction,
            ];
            const { getByText, getByLabelText, container } = render(<Budget {...baseProps} transactions={transactions} />);
            fireEvent.click(getByText('Custom'));
            fireEvent.change(getByLabelText('Date de début'), { target: { value: '2026-08-01' } });
            fireEvent.change(getByLabelText('Date de fin'), { target: { value: '2026-08-31' } });
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Revenus'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const prevuEl = tile.querySelector('.text-meta.tabular-nums') as HTMLElement;
            const prevu = Number(prevuEl.textContent?.replace(/[^\d]/g, ''));
            // 1000 × 31/30.44 ≈ 1 018 $ (inclusif, correct) — pas 1000 × 30/30.44 ≈ 986 $ (exclusif, bug).
            expect(prevu).toBeGreaterThan(1000);
            expect(prevu).toBeLessThan(1035);
        });

        // [finding financial-integrity, MOYEN] Le plancher `Math.max(0.1, …)` protégeait contre
        // `diffDays === 0` AVANT le `+1` ci-dessus ; depuis le `+1`, `diffDays` vaut toujours ≥ 1,
        // donc le plancher n'a plus de rôle et ne fait plus qu'écraser les petites plages vers 0,1 —
        // 1, 2 ET 3 jours affichaient tous le MÊME « prévu » (jusqu'à +204 % d'erreur sur 1 jour).
        // Retiré. Discriminant : réintroduire `Math.max(0.1, ...)` fait échouer ce test (100 $ au
        // lieu de ~33 $).
        it('[BUDGET-TRANSACTIONS-SYNC-AUDIT] une plage Custom d\'UN SEUL jour n\'est plus écrasée vers le plancher 0,1', () => {
            const now = new Date();
            const past = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            const py = past.getFullYear();
            const pm = String(past.getMonth() + 1).padStart(2, '0');
            const transactions: Transaction[] = [
                { id: 's1', date: `${py}-${pm}-15`, payee: 'X', amount: 1000, category: 'Salaire' } as unknown as Transaction,
            ];
            const { getByText, getByLabelText, container } = render(<Budget {...baseProps} transactions={transactions} />);
            fireEvent.click(getByText('Custom'));
            fireEvent.change(getByLabelText('Date de début'), { target: { value: '2026-08-15' } });
            fireEvent.change(getByLabelText('Date de fin'), { target: { value: '2026-08-15' } });
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Revenus'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const prevuEl = tile.querySelector('.text-meta.tabular-nums') as HTMLElement;
            const prevu = Number(prevuEl.textContent?.replace(/[^\d]/g, ''));
            // 1000 × 1/30.44 ≈ 33 $ (correct, sans plancher) — pas 1000 × 0,1 = 100 $ (plancher).
            expect(prevu).toBeLessThan(50);
        });

        // [BUDGET-CUSTOM-PLAGE-INVERSEE] finding code-reviewer : une date de fin saisie AVANT la
        // date de début (faute de frappe bénigne) laissait `civilDaysBetween` rendre un nombre
        // positif (il fait `Math.abs`) pendant que le filtre par chaîne ne matchait jamais rien —
        // « réel » toujours 0 $. Les deux bornes sont maintenant permutées silencieusement.
        it('une plage Custom INVERSÉE (fin avant début) est permutée silencieusement, pas vidée à 0 $', () => {
            const transactions: Transaction[] = [
                { id: 'i1', date: '2026-08-15', payee: 'X', amount: 500, category: 'Revenus divers' } as unknown as Transaction,
            ];
            const { getByText, getByLabelText, container } = render(<Budget {...baseProps} transactions={transactions} />);
            fireEvent.click(getByText('Custom'));
            // Fin AVANT début, à l'envers.
            fireEvent.change(getByLabelText('Date de début'), { target: { value: '2026-08-31' } });
            fireEvent.change(getByLabelText('Date de fin'), { target: { value: '2026-08-01' } });
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Revenus'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const reel = (tile.querySelector('.text-kpi') as HTMLElement).textContent?.replace(/[^\d]/g, '');
            expect(reel).toBe('500'); // pas '0' : la transaction du 15 août est bien dans la plage permutée.
        });
    });

    // [finding code-reviewer #751] Les tests ci-dessus couvrent un fuseau NÉGATIF (Toronto). Le
    // même helper (`toLocalDateStr`) doit aussi tenir sous un fuseau POSITIF (Sydney), où le piège
    // s'inverse : minuit local peut reculer d'un jour en UTC au lieu d'avancer.
    describe('[BUDGET-INCOME-WINDOW-UTC-OFFBYONE] défauts Custom vs fuseau à décalage POSITIF', () => {
        const originalTz = process.env.TZ;
        afterEach(() => {
            vi.useRealTimers();
            if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
        });

        it('les valeurs par défaut de la plage Custom reflètent le jour LOCAL juste après minuit', () => {
            // `.toISOString().split('T')[0]` (l'ancien code) aurait donné « 2026-07-31 » ici : minuit
            // local + 30 min à Sydney (UTC+10, hiver austral, pas de DST à cette date) tombe encore la
            // veille en UTC (14h30 le 31 juillet).
            process.env.TZ = 'Australia/Sydney';
            vi.useFakeTimers();
            vi.setSystemTime(new Date(2026, 7, 1, 0, 30)); // 1er août 2026, 00 h 30 LOCAL
            const { getByText, getByLabelText } = render(<Budget {...baseProps} />);
            fireEvent.click(getByText('Custom'));
            expect((getByLabelText('Date de fin') as HTMLInputElement).value).toBe('2026-08-01');
        });
    });

    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Le champ nom d'un poste est un input CONTRÔLÉ qui écrit à
    // CHAQUE frappe (`onChange`) : vider entièrement le nom propagerait `category: ''` à toutes ses
    // transactions, et retaper un nom ensuite ne les récupérerait jamais (`oldItem.name` devient ''
    // → la garde de rename ne se redéclenche plus). Discriminant : retirer la garde ajoutée dans
    // `handleUpdateItem` (un `git stash` ciblé sur ce bloc) fait échouer le 1er `expect` ci-dessous
    // (`setBudgetItems` serait appelé avec `name: ''`).
    describe('[BUDGET-TRANSACTIONS-SYNC-AUDIT] vider le nom d\'un poste est refusé', () => {
        it('un nom vidé (Backspace jusqu\'à \'\') n\'écrit RIEN — ni le poste, ni ses transactions', () => {
            const setBudgetItemsMock = vi.fn();
            const transactions: Transaction[] = [
                { id: 't1', date: '2026-06-01', payee: 'X', amount: -40, category: 'Restaurants' } as unknown as Transaction,
            ];
            const { getByDisplayValue } = render(
                <Budget {...baseProps} transactions={transactions} setBudgetItems={setBudgetItemsMock} />
            );
            // [finding silent-failure-hunter, ÉLEVÉ] Le refus doit être SIGNALÉ (toast), pas
            // seulement silencieux — sinon l'utilisateur voit juste son clavier « ne pas marcher ».
            const toastSpy = vi.fn();
            window.addEventListener('app-toast', toastSpy);
            const input = getByDisplayValue('Restaurants') as HTMLInputElement;
            fireEvent.change(input, { target: { value: '' } });
            expect(setBudgetItemsMock).not.toHaveBeenCalled();
            // Input contrôlé par le prop `budgetItems` (inchangé) → reste affiché tel quel.
            expect(input.value).toBe('Restaurants');
            expect(toastSpy).toHaveBeenCalledTimes(1);
            window.removeEventListener('app-toast', toastSpy);
        });

        it('un nom fait uniquement d\'espaces est traité comme vide (même refus)', () => {
            const setBudgetItemsMock = vi.fn();
            const { getByDisplayValue } = render(
                <Budget {...baseProps} setBudgetItems={setBudgetItemsMock} />
            );
            const input = getByDisplayValue('Restaurants') as HTMLInputElement;
            fireEvent.change(input, { target: { value: '   ' } });
            expect(setBudgetItemsMock).not.toHaveBeenCalled();
        });
    });

    // [BUDGET-RENAME-ECRIT-A-CHAQUE-FRAPPE] Renommer un poste déclenchait une réécriture complète
    // du tableau de transactions (+ un toast) à CHAQUE frappe — jusqu'à 5 pour « Resto » →
    // « Restaurant ». Débouncé : aucune propagation avant une pause de frappe, une seule ensuite,
    // partant du VRAI nom encore présent dans les transactions (pas d'une valeur intermédiaire).
    describe('[BUDGET-RENAME-ECRIT-A-CHAQUE-FRAPPE] la propagation aux transactions est débouncée', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => {
            useFinanceStore.setState({ transactions: [] });
            vi.useRealTimers();
        });

        it('plusieurs frappes rapides ne propagent RIEN avant la pause, puis UNE seule fois vers la valeur finale', () => {
            const transactions: Transaction[] = [
                { id: 't1', date: '2026-06-01', payee: 'X', amount: -40, category: 'Restaurants' } as unknown as Transaction,
            ];
            useFinanceStore.setState({ transactions });
            const toastSpy = vi.fn();
            window.addEventListener('app-toast', toastSpy);
            const { getByDisplayValue } = render(<Budget {...baseProps} transactions={transactions} />);
            const input = getByDisplayValue('Restaurants') as HTMLInputElement;

            // 3 « frappes » successives, comme un input contrôlé les enverrait une par une.
            fireEvent.change(input, { target: { value: 'Restauran' } });
            fireEvent.change(input, { target: { value: 'Restaurant' } });
            fireEvent.change(input, { target: { value: 'Restaurants!' } });

            // Rien avant la pause : ni écriture au store, ni toast.
            expect(useFinanceStore.getState().transactions[0].category).toBe('Restaurants');
            expect(toastSpy).not.toHaveBeenCalled();

            vi.advanceTimersByTime(500);

            // Une seule propagation, du nom ORIGINAL ('Restaurants') vers la valeur FINALE tapée —
            // jamais un renommage intermédiaire ('Restauran' ou 'Restaurant').
            expect(useFinanceStore.getState().transactions[0].category).toBe('Restaurants!');
            expect(toastSpy).toHaveBeenCalledTimes(1);
            window.removeEventListener('app-toast', toastSpy);
        });

        // [finding CRITIQUE code-reviewer + silent-failure-hunter, trouvé indépendamment par les
        // deux] Supprimer un poste PENDANT qu'un renommage débouncé est en vol pour ce MÊME poste :
        // `itemToDelete.name` porte déjà la frappe partielle (budgetItems mis à jour à chaque
        // frappe), pas le nom réellement présent dans `transactions`. Chercher par la frappe
        // abandonnée manquerait la transaction réelle (catégorie fantôme jamais nettoyée) ET
        // laisserait le timer se déclencher plus tard sur un poste qui n'existe plus.
        it('supprimer un poste pendant son propre renommage en vol réassigne au VRAI nom, pas à la frappe abandonnée', () => {
            const transactions: Transaction[] = [
                { id: 't1', date: '2026-06-01', payee: 'X', amount: -40, category: 'Restaurants' } as unknown as Transaction,
            ];
            useFinanceStore.setState({ transactions });
            // `setBudgetItems` STATEFUL (pas le no-op de `baseProps`) : `budgetItems` doit VRAIMENT
            // refléter la frappe partielle au moment de la suppression, comme en production — sinon
            // `itemToDelete.name` lirait toujours le nom ORIGINAL et ce test ne discriminerait rien.
            const Wrapper = () => {
                const [items, setItems] = useState(defaultBudget);
                return <Budget {...baseProps} budgetItems={items} setBudgetItems={setItems} transactions={transactions} />;
            };
            const { getByDisplayValue, getByText } = render(<Wrapper />);
            const input = getByDisplayValue('Restaurants') as HTMLInputElement;
            fireEvent.change(input, { target: { value: 'Restaurant' } }); // frappe partielle, PAS flushée
            const row = input.closest('tr') as HTMLElement;
            fireEvent.click(within(row).getByLabelText('Supprimer la catégorie'));
            fireEvent.click(getByText('Supprimer')); // confirme dans la modale
            // Réassignée au nom RÉELLEMENT présent dans `transactions` ('Restaurants'), pas à la
            // frappe abandonnée ('Restaurant', qui n'existe dans AUCUNE transaction).
            expect(useFinanceStore.getState().transactions[0].category).toBe('Uncategorized');
            // Le timer annulé ne doit RIEN faire de plus après coup (poste déjà supprimé).
            vi.advanceTimersByTime(1000);
            expect(useFinanceStore.getState().transactions[0].category).toBe('Uncategorized');
        });

        // [finding ÉLEVÉ code-reviewer] Le nettoyage au démontage doit FLUSHER, pas seulement
        // annuler — sinon un renommage tapé juste avant de changer d'onglet se perd en silence.
        it('démonter le composant PENDANT le debounce flushe le renommage au lieu de le perdre', () => {
            const transactions: Transaction[] = [
                { id: 't1', date: '2026-06-01', payee: 'X', amount: -40, category: 'Restaurants' } as unknown as Transaction,
            ];
            useFinanceStore.setState({ transactions });
            const { getByDisplayValue, unmount } = render(<Budget {...baseProps} transactions={transactions} />);
            const input = getByDisplayValue('Restaurants') as HTMLInputElement;
            fireEvent.change(input, { target: { value: 'Restaurant' } });
            unmount(); // AVANT que le timer de 500 ms n'ait eu la chance de se déclencher
            expect(useFinanceStore.getState().transactions[0].category).toBe('Restaurant');
        });

        // [finding ÉLEVÉ silent-failure-hunter] Le timer capturait `transactions` par fermeture au
        // moment de la PLANIFICATION — une écriture concurrente (import/sync) pendant la fenêtre de
        // 500 ms aurait été ÉCRASÉE au déclenchement. `transactionsRef` lit toujours la DERNIÈRE
        // valeur, jamais un instantané figé.
        it('une écriture concurrente sur les transactions pendant le debounce n\'est pas écrasée au flush', () => {
            const transactions: Transaction[] = [
                { id: 1, date: '2026-06-01', payee: 'X', amount: -40, category: 'Restaurants' } as unknown as Transaction,
            ];
            useFinanceStore.setState({ transactions });
            const { getByDisplayValue, rerender } = render(<Budget {...baseProps} transactions={transactions} />);
            const input = getByDisplayValue('Restaurants') as HTMLInputElement;
            fireEvent.change(input, { target: { value: 'Restaurant' } });

            // Écriture CONCURRENTE (ex. import Fintable en tâche de fond) : une nouvelle transaction
            // apparaît, sans rapport avec le renommage en cours.
            const concurrentTransactions: Transaction[] = [
                ...transactions,
                { id: 2, date: '2026-06-02', payee: 'Y', amount: -20, category: 'Loyer' } as unknown as Transaction,
            ];
            useFinanceStore.setState({ transactions: concurrentTransactions });
            rerender(<Budget {...baseProps} transactions={concurrentTransactions} />);

            vi.advanceTimersByTime(500);
            const final = useFinanceStore.getState().transactions;
            expect(final).toHaveLength(2); // la transaction concurrente n'a PAS disparu
            expect(final.find(t => t.id === 2)).toBeDefined();
            expect(final.find(t => t.id === 1)?.category).toBe('Restaurant'); // le renommage a eu lieu
        });
    });

    // [BUDGET-CUSTOM-PLAGE-INVERSEE] finding MOYEN (code-reviewer + silent-failure-hunter) : le
    // contexte publié au chat (`chatViewDetail`) décrivait la plage Custom avec les chaînes BRUTES
    // `customStart`/`customEnd`, dans l'ordre SAISI — même inversé — alors que tous les $ du même
    // objet sont calculés sur la plage PERMUTÉE. Un chat qui recevrait « du 31 août au 1er août »
    // pour expliquer des chiffres portant sur la plage chronologique inverse serait trompé.
    it('[BUDGET-CUSTOM-PLAGE-INVERSEE] le contexte publié au chat décrit la plage PERMUTÉE, pas les dates brutes inversées', () => {
        _resetViewContextForTests();
        const { getByText, getByLabelText } = render(<Budget {...baseProps} />);
        fireEvent.click(getByText('Custom'));
        // Fin AVANT début, à l'envers — comme le test de permutation plus haut.
        fireEvent.change(getByLabelText('Date de début'), { target: { value: '2026-08-31' } });
        fireEvent.change(getByLabelText('Date de fin'), { target: { value: '2026-08-01' } });
        const ctx = getViewContext();
        expect(ctx?.detail).toMatchObject({ periodLabel: 'du 2026-08-01 au 2026-08-31' });
    });

    /**
     * [A11Y-PRIVACY-CHAINES-RESTANTES] La liste des dépassements était un `string[]` — « Restaurants
     * (800 $ dépassé) » — avec TROIS consommateurs aux règles opposées : le bandeau à l'écran (qui
     * doit masquer), la carte du contexte de chat et le prompt du diagnostic IA (qui ont besoin du
     * chiffre). Une chaîne unique ne peut pas servir les trois. Elle porte maintenant le poste et le
     * dépassement séparément.
     */
    describe('bandeau « Dépassements détectés » et mode discret', () => {
        // `isPrivacyMode` est un état de MODULE : sans remise à zéro il contamine les tests suivants.
        afterEach(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
        const cur = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-05`;
        const depassement = [
            { id: 'd1', date: cur, payee: 'Resto', amount: -1000, category: 'Restaurants' } as unknown as Transaction,
        ];
        const bandeau = (): string => {
            const el = Array.from(document.querySelectorAll('p'))
                .find((p) => /dépassé/.test(p.textContent ?? ''));
            return (el?.textContent ?? '').replace(/[\s\u00A0\u202F]+/g, ' ').trim();
        };

        it('mode NORMAL : le poste ET le montant du dépassement sont annoncés', () => {
            render(<Budget {...baseProps} transactions={depassement} />);
            // Cible 200 $, réel 1 000 $ → 800 $ de dépassement.
            expect(bandeau()).toMatch(/Restaurants/);
            expect(bandeau()).toMatch(/800/);
        });

        it('mode DISCRET : le POSTE reste nommé, le montant disparaît', () => {
            useFinanceStore.setState({ isPrivacyMode: true });
            render(<Budget {...baseProps} transactions={depassement} />);
            // Le fait « Restaurants dépasse » est ce qui rend le bandeau utile : le masquer
            // reviendrait à afficher une alerte qui ne dit pas de quoi elle parle.
            expect(bandeau()).toMatch(/Restaurants/);
            expect(bandeau()).not.toMatch(/800/);
        });
    });
});
