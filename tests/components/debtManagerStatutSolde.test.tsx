// tests/components/debtManagerStatutSolde.test.tsx
//
// [DETTE-BALANCEASOF-INVISIBLE] — le formulaire DIT enfin où en est le solde enregistré.
//
// Marc, 2026-09-18, après avoir fait le geste que je lui avais demandé (« ouvre la dette, clique
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
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { DebtManager, phraseStatutSolde } from '../../components/DebtManager';
import { statutSoldeDette } from '../../services/projection/debtAmortization';
import { filtrerMarchands } from '../../components/debt/ChampMarchandLie';
import { formatIsoDay } from '../../utils/format';
import { todayIsoLocal } from '../../services/projection/dailyRefine';
import type { Debt } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';

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

/** Un bail type : versements fixes, taux NUL, cadence connue — le SEUL cas où le solde avance. */
const BAIL = (over: Partial<Debt> = {}): Debt =>
    ({
        id: 'bail', name: 'Bail auto', category: 'Car', kind: 'auto-lease',
        balance: 30_000, interestRate: 0, minimumPayment: 650,
        startDate: ilYA(60), termEndDate: ilYA(-1400), paymentFrequency: 'weekly',
        ...over,
    } as unknown as Debt);

describe('[DETTE-BALANCEASOF-INVISIBLE] `statutSoldeDette` — trois formes EXCLUSIVES', () => {
    it('daté ET auto-avançant → `suit-les-versements`, et la date rendue est celle qui est STOCKÉE', () => {
        const statut = statutSoldeDette(BAIL({ balanceAsOf: ilYA(9) } as Partial<Debt>), AUJ, []);
        expect(statut.forme).toBe('suit-les-versements');
        // ⚠️ Anti-vacuité : la forme seule ne prouve rien si la date rendue vient d'ailleurs.
        if (statut.forme === 'suit-les-versements') expect(statut.dateIso).toBe(ilYA(9));
    });

    it('SANS date → `jamais-date` : c’est le cas que Marc ne pouvait pas voir', () => {
        expect(statutSoldeDette(BAIL(), AUJ, []).forme).toBe('jamais-date');
    });

    it('date ILLISIBLE → `jamais-date` aussi : une date qu’on ne sait pas lire ne vaut pas mieux qu’une absente', () => {
        expect(statutSoldeDette(BAIL({ balanceAsOf: 'bientôt' } as Partial<Debt>), AUJ, []).forme).toBe('jamais-date');
    });

    it('CONTRÔLE NÉGATIF — une carte de crédit datée → `date-figee` (rien ne la fait avancer)', () => {
        const carte = BAIL({ kind: 'credit-card', balanceAsOf: ilYA(9) } as Partial<Debt>);
        expect(statutSoldeDette(carte, AUJ, []).forme).toBe('date-figee');
    });

    it('CONTRÔLE NÉGATIF — un TAUX non nul → `date-figee` : on ignore ce que le solde contient', () => {
        const avecTaux = BAIL({ interestRate: 6.5, balanceAsOf: ilYA(9) } as Partial<Debt>);
        expect(statutSoldeDette(avecTaux, AUJ, []).forme).toBe('date-figee');
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

describe('[DETTE-VIREMENTS-REELS] le formulaire dit ce que les VIREMENTS font, et offre le lien', () => {
    /** Des virements types, ramenés à l'horloge du fichier : une date figée deviendrait
     *  postérieure à `AUJ` un jour ou l'autre, et le cas cesserait de mesurer quoi que ce soit. */
    const TX = [
        { id: 1, date: ilYA(9), payee: 'Financement Auto', amount: -150, category: 'Transport', status: 'processed' },
        { id: 2, date: ilYA(3), payee: 'Financement Auto', amount: -150, category: 'Transport', status: 'processed' },
        { id: 3, date: ilYA(60), payee: 'Concessionnaire Auto', amount: -600, category: 'Transport', status: 'processed' },
    ];
    const poserTransactions = (txs: unknown[]): void => {
        useFinanceStore.setState({ transactions: txs as never });
    };
    afterEach(() => poserTransactions([]));

    it('lié à un marchand, la phrase COMPTE les virements déduits et nomme le dernier jour', () => {
        poserTransactions(TX);
        const dette = BAIL({ balanceAsOf: ilYA(20), paymentPayee: 'Financement Auto' } as Partial<Debt>);
        render(<DebtManager debts={[dette]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        // ⚠️ Le sélecteur vise la PHRASE, pas « le texte Financement Auto » : ce libellé figure aussi
        // dans les `<option>` du menu de liaison, et un `getByText` large y trouverait deux nœuds.
        const p = screen.getByText(/virements à « Financement Auto » depuis/);
        expect(p.textContent).toContain('2 virements');
        expect(p.textContent).toContain(formatIsoDay(ilYA(3)));
        // ⚠️ Le CONCESSIONNAIRE n'entre pas dans le compte : « 3 virements » serait le signe que
        // l'appariement s'est relâché quelque part entre le module et l'écran.
        expect(p.textContent).not.toContain('3 virement');
    });

    it('lié à un marchand qui ne verse RIEN → la phrase alerte et nomme le marchand', () => {
        poserTransactions(TX);
        const dette = BAIL({ balanceAsOf: ilYA(20), paymentPayee: 'Marchand Inexistant' } as Partial<Debt>);
        render(<DebtManager debts={[dette]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        const p = screen.getByText(/aucun virement de ce marchand/i);
        expect(p.textContent).toContain('Marchand Inexistant');
    });

    const listeMarchands = () => screen.getByRole('list', { name: /Marchands à lier/i });

    /** Les marchands OFFERTS, dans l'ordre affiché. La ligne « aucun lien » est hors liste : elle
     *  ne passe pas par le filtre, donc elle n'a pas sa place dans un inventaire des candidats.
     *
     *  ⚠️ Lu par le RÔLE RÉEL (`list` + `button`), et c'est le correctif d'un mensonge : le 1er jet
     *  posait `role="listbox"`/`role="option"` sur des `<li>` qui CONTIENNENT un `<button>` —
     *  axe-core rendait 3 violations `nested-interactive` (*serious*), et l'`aria-selected` du `<li>`
     *  n'était jamais exposé à l'élément qui a le focus. Le choix courant se lit désormais sur
     *  `aria-current`, porté par le bouton lui-même. */
    const marchandsOfferts = (): string[] =>
        within(listeMarchands())
            .getAllByRole('button')
            .map(o => o.textContent ?? '')
            // ⚠️ Sur le LIBELLÉ DE LA SORTIE, jamais sur le mot « aucun » : un marchand sans virement
            // restant s'écrit « (aucun virement trouvé) » depuis ce lot, et un `includes('aucun')`
            // le jetait de l'inventaire — c'est le test lui-même qui l'a dit, en rougissant.
            .filter(txt => !txt.trimStart().startsWith('— aucun'))
            .map(txt => txt.replace(/\s*\((?:\d+|aucun virement trouvé)\)\s*✓?\s*$/, '').trim());

    it('le sélecteur de marchand N’EXISTE que là où il produit quelque chose (taux nul + versements fixes)', () => {
        // ⚠️ [DETTE-MARCHAND-RECHERCHE] Ce n'était plus un `<select>` depuis que la liste a dépassé
        // l'écran : une longue liste de sorties d'argent, un marchand courant présent des centaines de fois contre une poignée pour le
        // marchand cherché, trié par fréquence — le prêteur devenait introuvable dans la liste. Ce que la
        // garde défend n'a pas bougé (mêmes candidats, même ordre, aucun montant) ; seule la FORME
        // du contrôle a changé, donc le test la suit au lieu d'ancrer `<option>`.
        poserTransactions(TX);
        const { unmount } = render(<DebtManager debts={[BAIL({ balanceAsOf: ilYA(9) } as Partial<Debt>)]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        // La liste vient de `marchandsCandidats` : les deux marchands, le plus fréquent en tête.
        expect(marchandsOfferts()).toEqual(['Financement Auto', 'Concessionnaire Auto']);
        // ⚠️ Aucun MONTANT dans la liste : `PrivateAmount` ne peut pas envelopper une ligne d'option,
        // donc il serait lisible en mode discret. Un COMPTE, lui, ne dit rien de ce que Marc possède.
        expect(listeMarchands().textContent).not.toMatch(/\$/);
        unmount();

        // CONTRÔLE NÉGATIF : à taux NON NUL, la déduction serait fausse — le champ disparaît.
        render(<DebtManager debts={[BAIL({ interestRate: 6.5, balanceAsOf: ilYA(9) } as Partial<Debt>)]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(screen.queryByLabelText(/Virements qui remboursent/i)).toBeNull();
    });

    it('la RECHERCHE réduit la liste, et « aucun lien » reste atteignable quel que soit le filtre', () => {
        // ⚠️ C'est le défaut que ce lot corrige, pris par l'autre bout : une liste triée par
        // FRÉQUENCE enterre ce qu'on cherche dès qu'elle dépasse l'écran. La recherche ne doit
        // jamais pouvoir CACHER la sortie (« aucun lien ») — sinon on remplace « introuvable » par
        // « inatteignable ».
        poserTransactions(TX);
        render(<DebtManager debts={[BAIL({ balanceAsOf: ilYA(9) } as Partial<Debt>)]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(marchandsOfferts()).toHaveLength(2);

        // Casse ET accents ignorés pour CHERCHER — jamais pour apparier (`clePayee` reste un trim).
        fireEvent.change(screen.getByLabelText(/Virements qui remboursent/i), { target: { value: 'concess' } });
        expect(marchandsOfferts()).toEqual(['Concessionnaire Auto']);
        expect(within(listeMarchands()).getByRole('button', { name: /aucun/i })).toBeTruthy();

        // Une requête sans résultat ne laisse PAS croire que la liste est vide : le compte le dit.
        fireEvent.change(screen.getByLabelText(/Virements qui remboursent/i), { target: { value: 'zzzz' } });
        expect(marchandsOfferts()).toEqual([]);
        // ⚠️ Interrogé par son TEXTE puis vérifié sur son rôle : l'écran porte plusieurs régions
        // live, donc `getByRole('status')` seul est ambigu — et c'est le FAIT (le compte est
        // annoncé, et il est annoncé à voix haute) qui compte, pas la position du nœud.
        const compteur = screen.getByText(/0 sur 2 marchands/);
        expect(compteur.getAttribute('role')).toBe('status');
    });

    it('seul un CLIC sur une ligne existante pose le lien — taper ne pose RIEN', () => {
        // ⚠️ Un champ « nom exact du marchand » est un appariement déguisé en formulaire : il
        // demande de deviner une égalité de chaîne, et un caractère de travers rend la dette muette
        // sans rien dire. La recherche FILTRE ce qui est offert, elle ne fabrique pas de valeur.
        poserTransactions(TX);
        const setDebts = vi.fn();
        render(<DebtManager debts={[BAIL({ balanceAsOf: ilYA(9) } as Partial<Debt>)]} setDebts={setDebts} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        fireEvent.change(screen.getByLabelText(/Virements qui remboursent/i), { target: { value: 'Financement Auto' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(setDebts.mock.calls.at(-1)?.[0][0].paymentPayee).toBeUndefined();

        // Contrôle POSITIF : le même libellé, CHOISI dans la liste, pose bien le lien.
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        fireEvent.click(screen.getByRole('button', { name: /^Financement Auto/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(setDebts.mock.calls.at(-1)?.[0][0].paymentPayee).toBe('Financement Auto');
    });

    it('un marchand LIÉ À UNE AUTRE DETTE disparaît de la liste — sinon il est déduit DEUX fois', () => {
        // ⚠️ `paiementsReelsDette` travaille par dette : deux dettes liées au même marchand
        // déduiraient CHACUNE la totalité des virements. Mesuré sur deux dettes liées au même
        // marchand : le double de la somme versée retiré du total dû. La liste est le SEUL
        // endroit où ce lien se pose — l'empêcher ici l'empêche partout.
        poserTransactions(TX);
        const autre = BAIL({ id: 'autre', name: 'autre bail', balanceAsOf: ilYA(9), paymentPayee: 'Financement Auto' } as Partial<Debt>);
        const celleCi = BAIL({ id: 'bail', balanceAsOf: ilYA(9) } as Partial<Debt>);
        render(<DebtManager debts={[celleCi, autre]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
        expect(marchandsOfferts()).not.toContain('Financement Auto');
        // ⚠️ Anti-vacuité : le marchand NON pris reste offert, sinon « absent » serait vrai d'une
        // liste vide ou d'un sélecteur cassé.
        expect(marchandsOfferts()).toContain('Concessionnaire Auto');
    });

    it('des virements qui DÉPASSENT le solde annoncent le refus, et alertent', () => {
        // Le remplaçant du plancher `Math.max(0, …)` : mesuré, il rendait 0,00 $ sous une phrase
        // rassurante. L'écran doit maintenant NOMMER le refus et le marchand en cause.
        poserTransactions([
            ...TX,
            ...Array.from({ length: 300 }, (_, i) => ({ id: 100 + i, date: ilYA(1 + i % 300), payee: 'Épicerie', amount: -400, category: 'Épicerie', status: 'processed' })),
        ]);
        const dette = BAIL({ balanceAsOf: ilYA(300), paymentPayee: 'Épicerie' } as Partial<Debt>);
        render(<DebtManager debts={[dette]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        const p = screen.getByText(/dépassent le solde enregistré/i);
        expect(p.textContent).toContain('Épicerie');
        expect(p.className).toContain('amber');
    });

    it('le marchand DÉJÀ lié reste dans la liste même si plus aucune transaction ne le porte', () => {
        // Sans ça, ouvrir le formulaire effacerait le lien en silence au premier changement.
        poserTransactions(TX);
        const dette = BAIL({ balanceAsOf: ilYA(9), paymentPayee: 'Marchand Disparu' } as Partial<Debt>);
        render(<DebtManager debts={[dette]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        // Il est OFFERT (donc re-choisissable) ET marqué comme le choix courant — sans les deux,
        // le formulaire effacerait le lien en silence au premier changement.
        expect(marchandsOfferts()).toContain('Marchand Disparu');
        expect(
            within(listeMarchands()).getByRole('button', { name: /^Marchand Disparu/ }).getAttribute('aria-current'),
        ).toBe('true');
    });

    it('le marchand LIÉ survit à une recherche qui ne le matche pas — sinon Marc ne voit plus son propre choix', () => {
        // ⚠️⚠️ TROUVÉ PAR LE PANEL, après un gate ciblé vert. Le 1er jet protégeait le marchand lié
        // de la disparition dans la liste COMPLÈTE (`tous`), puis la FILTRAIT comme n'importe quelle
        // autre ligne — donc chercher « hydro » sur une dette liée à « Financement Auto » le faisait
        // disparaître de l'écran avec sa coche, et RIEN d'autre du formulaire ne dit à quoi la dette
        // est liée. C'est `UN-ETAT-DE-FILTRAGE-SANS-CONTROLE-QUI-LE-RALLUME-EST-UNE-TRAPPE`
        // re-commise dans le fichier qui CITE cette leçon, et dont le commentaire AFFIRMAIT la
        // garantie inverse — vraie seulement à requête vide ou correspondante.
        poserTransactions(TX);
        render(<DebtManager debts={[BAIL({ balanceAsOf: ilYA(9), paymentPayee: 'Financement Auto' } as Partial<Debt>)]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));

        // ANTI-VACUITÉ : la requête choisie doit vraiment EXCLURE le marchand lié, sinon le test
        // passerait pour la mauvaise raison (il serait simplement resté dans les résultats).
        expect(filtrerMarchands([{ payee: 'Financement Auto', nb: 8 }], 'concess')).toEqual([]);

        fireEvent.change(screen.getByLabelText(/Virements qui remboursent/i), { target: { value: 'concess' } });
        expect(marchandsOfferts()).toContain('Financement Auto');
        expect(
            within(listeMarchands()).getByRole('button', { name: /^Financement Auto/ }).getAttribute('aria-current'),
        ).toBe('true');
        // Et il n'apparaît qu'UNE fois : épinglé hors filtre ET rendu par le filtre serait un doublon.
        expect(marchandsOfferts().filter(m => m === 'Financement Auto')).toHaveLength(1);
        // Le compte annoncé reste celui du FILTRE — épingler une ligne ne change pas combien de
        // marchands correspondent à la recherche.
        expect(screen.getByText(/1 sur 2 marchands/)).toBeTruthy();

        // CONTRÔLE : une requête qui matche le marchand lié ne le duplique pas non plus.
        fireEvent.change(screen.getByLabelText(/Virements qui remboursent/i), { target: { value: 'auto' } });
        expect(marchandsOfferts().filter(m => m === 'Financement Auto')).toHaveLength(1);
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
