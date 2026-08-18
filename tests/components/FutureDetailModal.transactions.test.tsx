// tests/components/FutureDetailModal.transactions.test.tsx
//
// [PASSE-REEL-TXN-DU-JOUR] Demande de Marc : « je veux voir mes transactions à chaque date quand je
// clique sur détail ». Cadrage confirmé par lui : TOUTES les transactions, dans le PANNEAU EXISTANT.
//
// ⚠️ Le helper `transactionsOnDay` a sa propre suite (logique d'inclusion). ICI on prouve autre
// chose, et c'est le risque réel de ce lot : que la section soit effectivement ATTEIGNABLE et
// RENDUE. Un helper juste dont personne n'affiche la sortie est la définition d'une feature qui
// n'existe pas (leçon `UX-UNREACHABLE-FEATURE` du dépôt).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { FutureDetailModal } from '../../components/projection/FutureDetailModal';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { ProjectionChartPoint } from '../../services/projection/types';
import type { Transaction } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

const JOUR = '2026-03-04';

const txn = (p: Partial<Transaction>): Transaction => ({
    id: 1, date: JOUR, payee: 'IGA', amount: -42.5, category: 'Épicerie', status: 'processed', ...p,
} as Transaction);

// Montants « uniques » : aucun autre nombre de la modale ne peut les imiter.
const TRANSACTIONS: Transaction[] = [
    txn({ id: 1, payee: 'Épicerie Metro', amount: -13741, category: 'Alimentation', accountName: 'Chèque' }),
    txn({ id: 2, payee: 'Paie', amount: 28319, category: 'Revenu' }),
    txn({ id: 3, payee: 'Doublon Metro', amount: -13741, category: 'Alimentation', isDuplicate: true }),
    txn({ id: 4, payee: 'Vers CELI', amount: -55127, category: 'Virement', isTransfer: true }),
    txn({ id: 5, date: '2026-03-05', payee: 'Autre jour', amount: -99991, category: 'Divers' }),
];

// ⚠️ Prénoms VOLONTAIREMENT distinctifs. Avec « Marc », l'assertion négative échouait sur l'en-tête
// de colonne « MARCHAND » — « Marc » en est un sous-mot. Même classe de faux positif que le montant
// témoin 1213 qui vivait dans « T1213 retenue source » : un jeton de test se choisit contre le
// VOCABULAIRE RÉEL de l'écran, pas contre ce qui semble improbable.
const NOM_1 = 'Zephyrin';
const NOM_2 = 'Ondine';

const pointDuJour = { monthIndex: 2, dayIso: JOUR, NetWorth: 1000, diffNW: 0 } as unknown as ProjectionChartPoint;
const pointMensuel = { monthIndex: 2, NetWorth: 1000, diffNW: 0 } as unknown as ProjectionChartPoint;

const ouvrir = (point: ProjectionChartPoint, transactions: Transaction[] | undefined = TRANSACTIONS, dayIso: string | null = JOUR) =>
    render(
        <FutureDetailModal
            point={point}
            chartData={[point]}
            transactions={transactions}
            dayIso={dayIso}
            onClose={vi.fn()}
        />,
    );

/** Texte du document ENTIER : la modale se rend dans un portail (`document.body`). */
const texte = () => (document.body.textContent ?? '').replace(/[\s  ]/g, '');

/** Texte de la SEULE table des transactions.
 *  ⚠️ Indispensable pour les assertions NÉGATIVES : la modale affiche les noms des conjoints
 *  ailleurs (ventilation par personne). Chercher « Marc » dans tout le document accusait donc le
 *  détail d'une ligne pour un texte qui vient d'une autre section — mes deux premiers tests
 *  échouaient à tort. Une assertion « ne contient pas » doit viser la zone qu'elle juge. */
const texteTable = () => {
    const cap = [...document.querySelectorAll('caption')].find((c) => (c.textContent ?? '').includes('Transactions du'));
    return ((cap?.closest('table')?.textContent) ?? '').replace(/[\s  ]/g, '');
};

beforeEach(() => { act(() => { useFinanceStore.setState({ isPrivacyMode: false }); }); });
afterEach(() => { cleanup(); act(() => { useFinanceStore.setState({ isPrivacyMode: false }); }); });

describe('[PASSE-REEL-TXN-DU-JOUR] la section est ATTEIGNABLE et rendue', () => {
    it('une journée identifiée affiche ses transactions, marchand ET montant', () => {
        ouvrir(pointDuJour);
        const t = texte();
        expect(t, 'la section doit s’annoncer').toContain(`Transactionsdu${JOUR}`);
        expect(t, 'marchand').toContain('ÉpicerieMetro');
        expect(t, 'montant').toContain('13741');
        expect(t, 'catégorie').toContain('Alimentation');
        expect(t, 'compte').toContain('Chèque');
        expect(t, 'la paie du jour').toContain('28319');
    });

    it('les transactions d’un AUTRE jour ne sont pas montrées', () => {
        ouvrir(pointDuJour);
        expect(texte(), 'une transaction du 5 mars n’a rien à faire dans le détail du 4').not.toContain('99991');
    });

    // Le cœur du cadrage : TOUTES les transactions, mais un total qui reste celui de la courbe.
    it('doublon et virement sont AFFICHÉS, avec leur raison', () => {
        ouvrir(pointDuJour);
        const t = texte();
        expect(t, 'le doublon doit apparaître — il est sur le relevé').toContain('DoublonMetro');
        expect(t).toContain('doublon');
        expect(t, 'le virement aussi').toContain('VersCELI');
        expect(t).toContain('virementinterne');
        expect(t, 'et l’écran doit EXPLIQUER pourquoi ils ne comptent pas').toContain('nebougentpaslacourbe');
    });

    it('le total affiché est celui qui explique la COURBE (hors doublon et virement)', () => {
        ouvrir(pointDuJour);
        // −13 741 + 28 319 = 14 578. Le virement (−55 127) et le doublon en sont exclus.
        expect(texte()).toContain('14578');
    });

    // ⚠️ Sur un point MENSUEL ou FUTUR, il n'y a pas de mouvements réels. Une section vide y
    // laisserait croire « aucune transaction ce jour-là » — un faux (no-fake-data).
    it('sans jour transmis, aucune section transactions', () => {
        ouvrir(pointMensuel, TRANSACTIONS, null);
        expect(texte(), 'pas de journée identifiée → pas de section').not.toContain('Transactionsdu');
    });

    // ⚠️ [PASSE-REEL-TXN-JOUR-VIDE 2026-08-14] Ce test affirmait EXACTEMENT L'INVERSE, et c'est ce
    // qui a fait échouer la livraison en vrai. Marc, en mode « courbe au jour », a cliqué des jours
    // du passé et n'a RIEN vu — parce qu'un jour sans mouvement ne rendait rien du tout. À l'écran,
    // « aucun mouvement ce jour-là » et « la fonctionnalité est cassée » étaient indistinguables ;
    // il a conclu la seconde et me l'a signalé deux fois.
    // La règle no-fake-data interdit d'INVENTER une donnée absente — elle n'interdit pas d'ÉNONCER
    // un zéro MESURÉ. Le silence n'est honnête que là où la question n'a pas de sens (point mensuel
    // ou futur, testé juste au-dessus) ; sur une journée identifiée, elle en a une.
    it('une journée identifiée SANS transaction le DIT explicitement', () => {
        ouvrir(pointDuJour, [txn({ id: 9, date: '2020-01-01', amount: -5 })]);
        expect(texte(), 'le jour doit être nommé').toContain(`Transactionsdu${JOUR}`);
        expect(texte(), "l'absence doit être énoncée").toContain('aucunmouvementcejour-là');
    });

    // Le pendant : la même journée AVEC un mouvement ne doit évidemment pas afficher l'état vide.
    // Sans cette assertion, on pourrait rendre le message d'absence EN PERMANENCE et rester vert.
    it("l'état vide ne s'affiche PAS quand la journée a des mouvements", () => {
        ouvrir(pointDuJour, TRANSACTIONS);
        expect(texte()).not.toContain('aucunmouvementcejour-là');
    });

    // ⚠️ Rendu DIRECT, pas via `ouvrir` : passer `undefined` à un paramètre À VALEUR PAR DÉFAUT
    // déclenche ce défaut (sémantique JS). Mon premier essai passait donc la liste COMPLÈTE en
    // croyant tester son absence — le test échouait en accusant le composant, à tort.
    // ⚠️ Sans la prop, on ne SAIT rien — donc on n'affirme rien. Dire « aucun mouvement ce
    // jour-là » ici serait une affirmation de MESURE produite par une ABSENCE de données : pire
    // que le silence corrigé par cette PR, car le message a l'autorité d'un fait constaté.
    // (Finding du silent-failure-hunter sur cette PR.) Une liste `[]` EXPLICITE, elle, est une
    // vraie mesure — testée juste en dessous.
    it('sans la prop `transactions`, la modale rend sans erreur et n’affirme RIEN', () => {
        expect(() => render(
            <FutureDetailModal point={pointDuJour} chartData={[pointDuJour]} dayIso={JOUR} onClose={vi.fn()} />,
        )).not.toThrow();
        expect(texte()).not.toContain('aucunmouvementcejour-là');
        expect(texte()).not.toContain('Transactionsdu');
    });

    it('avec une liste VIDE explicite, l’absence est bien énoncée (c’est une mesure)', () => {
        render(<FutureDetailModal point={pointDuJour} chartData={[pointDuJour]} transactions={[]} dayIso={JOUR} onClose={vi.fn()} />);
        expect(texte()).toContain('aucunmouvementcejour-là');
    });
});

// ── Le DÉTAIL par transaction (demande de Marc : « et plus de détail ») ──────────────────────
// ⚠️ Uniquement des FAITS présents sur la donnée. Un champ absent ne doit produire AUCUNE pastille
// — un « inconnu » affiché aurait l'air d'une information (no-fake-data).
describe('[PASSE-REEL-TXN-DU-JOUR] détail par transaction', () => {
    const avecDetail = (p: Partial<Transaction>) =>
        ouvrir({ ...pointDuJour } as ProjectionChartPoint, [txn({ id: 1, payee: 'Cible', amount: -11113, ...p })], JOUR);

    it('le statut ANORMAL est signalé (en attente, erreur, saisie manuelle)', () => {
        avecDetail({ status: 'pending' });
        expect(texte()).toContain('enattente');
        cleanup();
        avecDetail({ status: 'error' });
        expect(texte()).toContain('erreurd’import');
        cleanup();
        avecDetail({ status: 'manual' });
        expect(texte()).toContain('saisiemanuelle');
    });

    // ⚠️ « traité » est le cas NORMAL : une pastille sur chaque ligne ne dirait rien et noierait
    // celles qui méritent l'œil. Test d'INTENTION.
    it('le statut NORMAL n’affiche aucune pastille', () => {
        avecDetail({ status: 'processed' });
        expect(texte()).not.toContain('trait\u00e9');
    });

    it('le conjoint est nommé quand l’attribution est EXPLICITE', () => {
        render(
            <FutureDetailModal
                point={pointDuJour} chartData={[pointDuJour]} dayIso={JOUR}
                transactions={[txn({ id: 1, ownerId: 1, amount: -222 })]}
                userName1={NOM_1} userName2={NOM_2} onClose={vi.fn()}
            />,
        );
        expect(texteTable()).toContain(NOM_2);
        expect(texteTable(), 'l’autre conjoint n’a rien à faire sur cette ligne').not.toContain(NOM_1);
    });

    it('sans attribution explicite, aucun conjoint n’est affiché', () => {
        render(
            <FutureDetailModal
                point={pointDuJour} chartData={[pointDuJour]} dayIso={JOUR}
                transactions={[txn({ id: 1, amount: -222 })]}
                userName1={NOM_1} userName2={NOM_2} onClose={vi.fn()}
            />,
        );
        const t = texteTable();
        expect(t, 'deviner le propriétaire serait une invention').not.toContain(NOM_1);
        expect(t).not.toContain(NOM_2);
    });

    it('l’origine de la catégorie est dite : vérifiée, ou classée par IA avec sa confiance', () => {
        avecDetail({ isVerified: true });
        expect(texte()).toContain('v\u00e9rifi\u00e9e');
        cleanup();
        // ⚠️ 93, PAS 0.93 : `confidence` est en 0-100 dans tout le dépôt — `Transactions.tsx` affiche
        // déjà `${t.confidence}%` SANS multiplier. Ma première fixture reproduisait l'hypothèse
        // FAUSSE du code, donc ne discriminait rien. Deuxième fois de la session qu'un de mes tests
        // fabrique la condition qu'il devrait prouver.
        avecDetail({ isAiProcessed: true, confidence: 93 });
        expect(texte()).toContain('class\u00e9eparIA');
        expect(texte(), 'la confiance chiffrée aide à juger').toContain('93');
        expect(texte(), 'un « 9300 » trahirait une confusion d’échelle').not.toContain('9300');
    });

    it('une confiance IA FAIBLE est mise en évidence', () => {
        avecDetail({ isAiProcessed: true, confidence: 42 });
        expect(texte()).toContain('42');
        expect(document.querySelector('.text-amber-300'), 'une catégorie peu sûre doit sauter aux yeux').not.toBeNull();
    });

    it('la catégorie d’ORIGINE n’apparaît que si l’IA l’a changée', () => {
        avecDetail({ category: 'Restaurants', originalCategory: 'Divers' });
        expect(texte()).toContain('avant:Divers');
        cleanup();
        avecDetail({ category: 'Divers', originalCategory: 'Divers' });
        expect(texte(), 'identique = du bruit').not.toContain('avant:');
    });

    it('une transaction sans aucun détail n’affiche aucune pastille', () => {
        avecDetail({ status: 'processed' });
        const t = texte();
        for (const mot of ['enattente', 'saisiemanuelle', 'v\u00e9rifi\u00e9e', 'class\u00e9eparIA', 'avant:']) {
            expect(t, `« ${mot} » ne doit pas apparaître`).not.toContain(mot);
        }
    });

    it('les lignes EXCLUES portent le même détail', () => {
        avecDetail({ isTransfer: true, status: 'pending' });
        const t = texte();
        expect(t, 'la ligne exclue reste une transaction : son détail compte autant').toContain('enattente');
        expect(t).toContain('virementinterne');
    });
});

// ── ⚠️ LA GARDE QUI MANQUAIT — le chemin RÉEL, pas la fixture ────────────────────────────────
// Ma première version lisait `dayIso` sur `point`. Ces tests passaient quand même, parce qu'ils
// fabriquaient un point portant `dayIso` à la main. En vrai, `FutureProjection` REBASE tout point
// quotidien sur son mois hôte avant de le transmettre (`detailPointFor` : « un mois qui existe
// plutôt qu'un mois fantôme »), et `dayIso` est posé au MÊME endroit que `hostMonthIndex` — donc
// effacé. La section était rigoureusement INATTEIGNABLE au clic, avec 8 tests au vert.
// Classe `UX-UNREACHABLE-FEATURE` : un test qui fabrique lui-même la condition qu'il devrait
// prouver atteignable ne prouve rien.
describe('[PASSE-REEL-TXN-DU-JOUR] le jour vient de la PROP, jamais du point', () => {
    it('un point PORTANT `dayIso` mais SANS la prop n’affiche rien', () => {
        // Exactement ce que la modale reçoit en vrai après rebasage : le point ne fait pas foi.
        ouvrir(pointDuJour, TRANSACTIONS, null);
        expect(texte(), 'lire `point.dayIso` rendrait ce test vert alors que le clic réel ne montre rien')
            .not.toContain('Transactionsdu');
    });

    it('la prop SEULE suffit, même sur un point mensuel rebasé', () => {
        ouvrir(pointMensuel, TRANSACTIONS, JOUR);
        expect(texte(), 'c’est le cas RÉEL : point mensuel + jour transmis à part').toContain(`Transactionsdu${JOUR}`);
        expect(texte()).toContain('ÉpicerieMetro');
    });
});

// ⚠️ Garde de SOURCE sur le câblage : le rendu ne peut pas voir d'où vient la prop.
describe('[PASSE-REEL-TXN-DU-JOUR] câblage : le jour est capté AVANT le rebasage', () => {
    it('`FutureProjection` lit le jour sur le point d’ORIGINE, pas sur le point rebasé', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const src = readFileSync(resolve(__dirname, '../../components/FutureProjection.tsx'), 'utf8');
        // ⚠️ La garde porte sur l'INTENTION (le jour vient du point d'ORIGINE), pas sur une forme
        // d'écriture : elle accepte la lecture directe comme le passage par une variable locale
        // liée à `tooltip.point`. Ce qu'elle interdit — dériver le jour de `detailPoint`, TOUJOURS
        // rebasé sur le mois — est vérifié séparément juste en dessous.
        // ⚠️ HISTOIRE DE CETTE GARDE, parce qu'elle dit quelque chose sur les gardes de SOURCE.
        // Écrite sur la forme INLINE d'origine, elle a crié au faux positif deux fois : d'abord
        // quand du code s'est inséré entre la déclaration et l'usage (fenêtre élargie), puis quand
        // `[FUTUR-DETAIL-STEP-DAY]` a extrait le tout dans `ouvrirDetailSur` — appelé depuis DEUX
        // endroits, ce qui était le bon refactor. Une garde arrimée à une FORME D'ÉCRITURE finit
        // par accuser les bons changements ; elle vise donc maintenant la RELATION.
        //
        // Ce qui compte : le jour est lu sur le point BRUT reçu, jamais sur le retour de
        // `detailPointFor` (toujours rebasé sur le mois).
        expect(src, 'le jour doit être lu sur le point BRUT, pas sur le point rebasé')
            .toMatch(/const\s+p\s*=\s*pt as[\s\S]{0,600}setDetailDayIso\(p\./);
        expect(src, 'et transmis en prop dédiée').toContain('dayIso={detailDayIso}');
        // ⚠️ [PASSE-REEL-TXN-JOUR-VIDE] Le jour ne part QUE s'il est MESURÉ. `dayIso` est posé sur
        // tout point quotidien, FUTUR COMPRIS (`mergeDailyRealPoint` fait `{ ...d }` sur la branche
        // projetée) : sans ce filtre, cliquer un jour futur affiche « aucun mouvement ce jour-là »,
        // une affirmation de mesure sur du projeté. Le défaut était INVISIBLE avant l'état vide —
        // la liste étant toujours vide dans le futur, la section ne se rendait pas du tout.
        expect(src, '`dayIsReal` doit conditionner l’envoi du jour, sinon le futur ment')
            .toMatch(/dayIsReal\s*\?\s*\(?\s*p\.dayIso/);
        // Les DEUX formes du même défaut : dériver le jour du point rebasé, directement ou en
        // passant le retour de `detailPointFor` au setter.
        expect(src, 'le jour ne doit JAMAIS être dérivé de `detailPoint`').not.toMatch(/detailPoint[^\n]*\.dayIso/);
        expect(src, 'ni du retour de `detailPointFor`').not.toMatch(/setDetailDayIso\([^)]*detailPointFor/);
    });

    it('`FutureDetailModal` ne lit plus `dayIso` sur son `point`', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const src = readFileSync(resolve(__dirname, '../../components/projection/FutureDetailModal.tsx'), 'utf8');
        expect(src.replace(/\/\*[\s\S]*?\*\//g, ''), 'lire le point ramènerait le bug d’origine')
            .not.toMatch(/point[^\n]*\)\.dayIso/);
    });
});

// ── Mode discret ─────────────────────────────────────────────────────────────────────────────
// ⚠️ CE BLOC A CHANGÉ DE RÈGLE, et c'est une DÉCISION de Marc, pas une régression.
// Cinq tickets de ce lot avaient posé « on masque les MONTANTS, pas ce qui identifie » — et ce
// test CODIFIAIT ce périmètre, marchand visible compris. Le 2026-08-17, mis devant le constat que
// « pharmacie X, le 3 » dit déjà beaucoup sans le moindre chiffre, Marc a tranché : « masquer
// marchands » (`[PRIV-PAYEE-MODE-DISCRET]`). Le test suit la décision.
// ⚠️ PUIS ELLE A CHANGÉ UNE 2e FOIS, le lendemain : Marc a répondu « masquer » à la question de la
// CATÉGORIE (`[PRIV-CATEGORIE-MASQUEE]`). Ce test a donc suivi TROIS décisions successives sur le
// même périmètre — montants seuls, puis + marchands, puis + catégories. C'est normal et sain : il
// CODIFIE une politique produit, il ne la fixe pas. Ce qui compterait comme une régression, ce
// serait qu'il change SANS décision derrière ; d'où la date et l'auteur de chacune, écrits ici.
describe('[PASSE-REEL-TXN-DU-JOUR] mode discret', () => {
    it('montants, marchands ET catégories sortent tous du DOM', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        ouvrir(pointDuJour);
        const t = texte();
        expect(t, 'montant d’une ligne').not.toContain('13741');
        expect(t, 'la paie').not.toContain('28319');
        expect(t, 'le total du jour').not.toContain('14578');
        // ⚠️ Décision Marc 2026-08-17 : le marchand est de la donnée personnelle (Loi 25).
        expect(t, 'le marchand ne doit plus rester en clair').not.toContain('ÉpicerieMetro');
        expect(t, 'mais la ligne doit rester identifiable comme masquée').toContain('Marchandmasqué');
        // ⚠️ Décision Marc 2026-08-18 : la catégorie AUSSI (`[PRIV-CATEGORIE-MASQUEE]`).
        expect(t, 'la catégorie ne reste plus en clair non plus').not.toContain('Alimentation');
        expect(t, 'et elle s’annonce comme catégorie, pas comme marchand').toContain('Catégoriemasquée');
    });
});
