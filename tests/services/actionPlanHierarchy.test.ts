import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildRootBucket, getChildBuckets, ADVICE_WHY, type PlanBucket } from '../../services/projection/actionPlanHierarchy';
import { getErrors, clearErrors, __resetErrorThrottle } from '../../services/errorLogger';

// chartData synthétique : N mois, flux net CELI +500/mois, REER -100/mois (retrait).
// year = 2026 + floor(monthIndex/12). NetWorth croissant.
const makePoints = (months: number, opts: { startPast?: number } = {}) => {
    const pts = [];
    const past = opts.startPast ?? 0;
    for (let i = -past; i < months; i++) {
        const monthOfYear = ((i % 12) + 12) % 12;
        pts.push({
            monthIndex: i,
            year: 2026 + Math.floor(i / 12),
            age: 40 + Math.floor(i / 12),
            isRetired: false,
            dateLabel: `m${monthOfYear} ${2026 + Math.floor(i / 12)}`,
            NetWorth: 100_000 + i * 1000,
            NetTransferCELI: 500,
            NetTransferREER: -100,
        });
    }
    return pts;
};

const child = (data: Record<string, unknown>[], parent: PlanBucket, label?: string): PlanBucket => {
    const kids = getChildBuckets(data, parent);
    return label ? kids.find((k) => k.label.includes(label)) ?? kids[0] : kids[0];
};

describe('actionPlanHierarchy', () => {
    it('bucket racine global couvre tout l\'horizon futur', () => {
        const data = makePoints(24);
        const root = buildRootBucket(data)!;
        expect(root.level).toBe('global');
        expect(root.monthCount).toBe(24);
        expect(root.startYear).toBe(2026);
        expect(root.endYear).toBe(2027);
        expect(root.flows.CELI).toBe(500 * 24);
        expect(root.flows.REER).toBe(-100 * 24);
        expect(root.deposited).toBe(12_000);
        expect(root.withdrawn).toBe(2_400);
        expect(root.hasChildren).toBe(true);
    });

    it('ignore le passé réel (monthIndex < 0)', () => {
        const data = makePoints(12, { startPast: 6 });
        const root = buildRootBucket(data)!;
        expect(root.monthCount).toBe(12); // 6 mois passés exclus
        expect(root.startMonthIndex).toBe(0);
    });

    it('liste vide → racine null', () => {
        expect(buildRootBucket([])).toBeNull();
    });

    it('drill complet : global → décennie → 3 ans → année → semestre → trimestre → mois', () => {
        const data = makePoints(24);
        const root = buildRootBucket(data)!;

        const decade = child(data, root);
        expect(decade.level).toBe('decade');
        expect(decade.monthCount).toBe(24); // < 120 → une seule décennie

        const triennium = child(data, decade);
        expect(triennium.level).toBe('triennium');
        expect(triennium.monthCount).toBe(24); // < 36 → un seul bloc

        const years = getChildBuckets(data, triennium);
        expect(years).toHaveLength(2); // 2026, 2027
        expect(years[0].level).toBe('year');
        expect(years[0].flows.CELI).toBe(6_000);
        expect(years[0].flows.REER).toBe(-1_200);

        const semesters = getChildBuckets(data, years[0]);
        expect(semesters).toHaveLength(2); // 12 mois → 2 semestres de 6
        expect(semesters[0].flows.CELI).toBe(3_000);

        const quarters = getChildBuckets(data, semesters[0]);
        expect(quarters).toHaveLength(2); // 6 mois → 2 trimestres de 3
        expect(quarters[0].flows.CELI).toBe(1_500);

        const monthsB = getChildBuckets(data, quarters[0]);
        expect(monthsB).toHaveLength(3);
        expect(monthsB[0].level).toBe('month');
        expect(monthsB[0].flows.CELI).toBe(500);
        expect(monthsB[0].hasChildren).toBe(false);
        expect(getChildBuckets(data, monthsB[0])).toHaveLength(0); // feuille
    });

    it('conseils : reflètent les flux réels (cotisation CELI + retrait REER)', () => {
        const data = makePoints(12);
        const root = buildRootBucket(data)!;
        const adviceText = root.advice.map((a) => a.text).join(' | ');
        expect(adviceText).toMatch(/Cotise.*CELI/i);
        expect(adviceText).toMatch(/Retire.*REER/i);
    });

    it('conseils structurés : montant signé + sens + « pourquoi » non vide, sans chiffre dans le texte', () => {
        const data = makePoints(12);
        const root = buildRootBucket(data)!;

        const celi = root.advice.find((a) => /CELI/i.test(a.text) && a.kind === 'deposit');
        expect(celi).toBeDefined();
        expect(celi!.amount).toBeGreaterThan(0);          // dépôt = montant positif
        expect(celi!.why.length).toBeGreaterThan(0);      // explication « pourquoi » présente
        expect(celi!.text).not.toMatch(/\d/);             // le montant n'est PAS dans le texte (affiché à part)

        const reer = root.advice.find((a) => /REER/i.test(a.text) && a.kind === 'withdraw');
        expect(reer).toBeDefined();
        expect(reer!.amount).toBeLessThan(0);             // retrait = montant négatif

        // Garde-fou anti-régression fiscale : aucun « pourquoi » ne doit contenir de valeur chiffrée
        // (taux/plafonds/% ) — les constantes vivent dans docs/FISCAL_REFERENCE.md, jamais ici.
        for (const a of root.advice) {
            expect(a.why).not.toMatch(/\d/);
        }
    });

    it('période sans mouvement : un seul item info « rien à faire », non cochable', () => {
        const flat = makePoints(3).map((p) => ({
            ...p,
            NetTransferCELI: 0, NetTransferCELIAPP: 0, NetTransferREER: 0, NetTransferREEE: 0,
            NetTransferNonReg: 0, NetTransferCrypto: 0, NetTransferLiquid: 0,
        }));
        const root = buildRootBucket(flat)!;
        expect(root.advice).toHaveLength(1);
        expect(root.advice[0].kind).toBe('info');
        expect(root.advice[0].amount).toBeNull();
    });

    it('découpe une décennie en blocs de 3 ans', () => {
        const data = makePoints(120); // 10 ans pile
        const root = buildRootBucket(data)!;
        const decade = child(data, root);
        const trienniums = getChildBuckets(data, decade);
        // 120 mois / 36 = 4 blocs (36+36+36+12)
        expect(trienniums).toHaveLength(4);
        expect(trienniums[0].monthCount).toBe(36);
        expect(trienniums[3].monthCount).toBe(12);
    });

    // ── buildAdvice : pans de logique non couverts par makePoints (CELI/REER seuls) ──

    // Points 1 mois où l'on contrôle chaque flux NetTransfer librement. flows = valeur brute
    // (1 mois → pas d'agrégation), arrondie dans makeBucket.
    const onePoint = (transfers: Record<string, number>, opts: { isRetired?: boolean } = {}) => [{
        monthIndex: 0,
        year: 2026,
        age: 40,
        isRetired: opts.isRetired ?? false,
        dateLabel: 'm0 2026',
        NetWorth: 100_000,
        NetTransferCELI: 0, NetTransferCELIAPP: 0, NetTransferREER: 0, NetTransferREEE: 0,
        NetTransferNonReg: 0, NetTransferCrypto: 0, NetTransferLiquid: 0,
        ...transfers,
    }];

    it('moves : triés par |montant| décroissant, indépendamment de l\'ordre source des comptes', () => {
        // Ordre source : CELI(1er) … Liquidites(dernier). On donne au DERNIER compte (Cash) le
        // plus gros mouvement et au PREMIER (CELI) le plus petit → si le tri respecte le montant,
        // Cash passe devant CELI. Un tri naïf par ordre source échouerait.
        const data = onePoint({
            NetTransferCELI: 150,    // plus petit dépôt
            NetTransferLiquid: 9000, // plus gros (compte listé en dernier)
            NetTransferREER: -4000,  // intermédiaire (retrait)
        });
        const moves = buildRootBucket(data)!.advice.filter((a) => a.kind !== 'info');
        expect(moves.map((m) => m.text)).toEqual([
            'Cotise au Cash',   // 9000
            'Retire du REER',   // |-4000|
            'Cotise au CELI',   // 150
        ]);
    });

    it('FLOW_THRESHOLD : un mouvement par compte < 100 est ignoré ; 100 pile passe (borne >=)', () => {
        const data = onePoint({
            NetTransferCELI: 99,    // < seuil → ignoré
            NetTransferREER: -100,  // == seuil → conservé (Math.abs >= 100)
            NetTransferCrypto: 5,   // bruit → ignoré
        });
        const moves = buildRootBucket(data)!.advice.filter((a) => a.kind !== 'info');
        expect(moves).toHaveLength(1);
        expect(moves[0].text).toBe('Retire du REER');
        expect(moves[0].amount).toBe(-100);
    });

    it('item « épargne nette » : kind info + montant signé positif (deposited − withdrawn)', () => {
        const data = onePoint({ NetTransferCELI: 800, NetTransferREER: -300 }); // net +500
        const net = buildRootBucket(data)!.advice.find((a) => a.kind === 'info' && a.amount != null);
        expect(net).toBeDefined();
        expect(net!.text).toMatch(/[ÉE]pargne nette/i);
        expect(net!.amount).toBe(500);
    });

    it('item « décaissement net » : kind info + montant signé négatif quand on sort plus qu\'on dépose', () => {
        const data = onePoint({ NetTransferCELI: 200, NetTransferREER: -900 }); // net -700
        const net = buildRootBucket(data)!.advice.find((a) => a.kind === 'info' && a.amount != null);
        expect(net).toBeDefined();
        expect(net!.text).toMatch(/[Dd]écaissement net/i);
        expect(net!.amount).toBe(-700);
    });

    it('isRetired : ajoute un item info « phase de décaissement », amount null, why non vide sans chiffre', () => {
        const data = onePoint({ NetTransferCELI: 500 }, { isRetired: true });
        const root = buildRootBucket(data)!;
        expect(root.isRetired).toBe(true);
        const phase = root.advice.find((a) => a.kind === 'info' && /phase de décaissement/i.test(a.text));
        expect(phase).toBeDefined();
        expect(phase!.amount).toBeNull();              // item informatif, pas de montant
        expect(phase!.why.length).toBeGreaterThan(0);
        expect(phase!.why).not.toMatch(/\d/);
    });

    it('chaque compte a un « why » non vide et sans chiffre, dans les deux sens (dépôt + retrait)', () => {
        const accounts = ['CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto', 'Liquid'] as const;
        for (const acct of accounts) {
            const field = `NetTransfer${acct}`;
            for (const sign of [1, -1] as const) {
                const root = buildRootBucket(onePoint({ [field]: 500 * sign }))!;
                const move = root.advice.find((a) => a.kind !== 'info');
                expect(move, `${field} sens ${sign}`).toBeDefined();
                expect(move!.kind).toBe(sign > 0 ? 'deposit' : 'withdraw');
                expect(move!.why.length, `why ${field} ${sign}`).toBeGreaterThan(0);
                expect(move!.why, `why chiffré ${field} ${sign}`).not.toMatch(/\d/);
                expect(move!.text, `text chiffré ${field} ${sign}`).not.toMatch(/\d/);
            }
        }
    });

    it('item info net : borne STRICTE > seuil (≠ moves en >=) — net == 100 pile n\'affiche PAS « épargne nette »', () => {
        // Piège d'asymétrie : la branche info utilise `net > 100` (strict) alors que les moves
        // utilisent `Math.abs(v) >= 100`. À net == 100 pile, le move CELI passe mais l'item info
        // « épargne nette » doit rester absent. Un passage de `>` à `>=` casserait ce test.
        const data = onePoint({ NetTransferCELI: 100 }); // deposited=100, withdrawn=0 → net=100
        const advice = buildRootBucket(data)!.advice;
        expect(advice.some((a) => a.kind === 'info' && a.amount != null)).toBe(false);
        const move = advice.find((a) => a.kind !== 'info');
        expect(move!.text).toBe('Cotise au CELI'); // le mouvement, lui, passe (borne >=)
        // Symétrie côté décaissement : net == -100 pile n'affiche PAS « décaissement net ».
        const out = onePoint({ NetTransferREER: -100 }); // net = -100
        expect(buildRootBucket(out)!.advice.some((a) => a.kind === 'info' && a.amount != null)).toBe(false);
    });

    it('net nul (dépôts = retraits) mais gros mouvements : aucun item « net », moves présents et ordonnés avant', () => {
        // deposited == withdrawn → net 0 : ni épargne ni décaissement net, MAIS les deux mouvements
        // qui se compensent restent des conseils. En retraite, l'item info « phase de décaissement »
        // doit précéder les moves chiffrés (ordre de la checklist UI).
        const data = onePoint({ NetTransferCELI: 5000, NetTransferREER: -5000 }, { isRetired: true });
        const advice = buildRootBucket(data)!.advice;
        expect(advice.some((a) => a.kind === 'info' && a.amount != null)).toBe(false); // net 0 → pas d'item net
        const phaseIdx = advice.findIndex((a) => a.kind === 'info' && /phase de décaissement/i.test(a.text));
        const firstMoveIdx = advice.findIndex((a) => a.kind !== 'info');
        expect(phaseIdx).toBeGreaterThanOrEqual(0);
        expect(firstMoveIdx).toBeGreaterThan(phaseIdx); // info AVANT les moves
        expect(advice.filter((a) => a.kind !== 'info').map((m) => m.text))
            .toEqual(['Cotise au CELI', 'Retire du REER']); // |5000| == |−5000| → ordre source stable
    });

    it('garde-fou anti-chiffre : AUCUN « pourquoi » de ADVICE_WHY ne contient de valeur chiffrée', () => {
        // Balaie les 14 entrées (7 comptes × 2 sens), y compris celles jamais émises par la fixture
        // (CELIAPP, REEE, NonReg, Crypto, Liquidités…). Les constantes fiscales doivent rester dans
        // docs/FISCAL_REFERENCE.md — jamais en dur dans un texte « pourquoi ».
        for (const sens of Object.values(ADVICE_WHY)) {
            expect(sens.deposit).not.toMatch(/\d/);
            expect(sens.withdraw).not.toMatch(/\d/);
            expect(sens.deposit.length).toBeGreaterThan(0);
            expect(sens.withdraw.length).toBeGreaterThan(0);
        }
    });
});

// [SILENT-ACTIONPLAN-NAN] Le module alimente le « Plan d'action » en montants CONCRETS. Avant ce
// durcissement, `num()` rabattait toute valeur non finie sur 0 SANS trace : le plan affichait
// « Rien de notable à faire » (ou un montant amputé) sur une donnée moteur corrompue. Même contrat
// que `netWorth.ts` (HARDEN-NETWORTH-NAN) et `pastPurchaseInit.ts` : présent-mais-invalide →
// journalisé ; réellement absent → silencieux.
describe('[SILENT-ACTIONPLAN-NAN] valeur moteur non finie', () => {
    const planLogs = () => getErrors().filter((e) => e.message.includes('Plan d\'action'));

    const point = (extra: Record<string, unknown>) => [{
        monthIndex: 0,
        year: 2026,
        age: 40,
        isRetired: false,
        dateLabel: 'm0 2026',
        NetWorth: 100_000,
        NetTransferCELI: 500,
        ...extra,
    }];

    beforeEach(() => { clearErrors(); __resetErrorThrottle(); });
    afterEach(() => { clearErrors(); __resetErrorThrottle(); });

    it('un flux NaN est neutralisé à 0 ET JOURNALISÉ (jamais avalé)', () => {
        const root = buildRootBucket(point({ NetTransferREER: Number.NaN }))!;
        expect(root.flows.REER, 'la neutralisation à 0 reste le comportement').toBe(0);
        const logs = planLogs();
        expect(logs.length, 'une donnée corrompue ne doit PAS être avalée').toBeGreaterThan(0);
        expect(logs[0].source).toBe('projection');
        expect(logs[0].severity).toBe('warning');
        expect(String(logs[0].context?.fields)).toContain('NetTransferREER');
    });

    it('un Infinity et une valeur non numérique sont aussi journalisés', () => {
        buildRootBucket(point({ NetTransferCrypto: Number.POSITIVE_INFINITY }));
        expect(planLogs().length).toBeGreaterThan(0);

        clearErrors(); __resetErrorThrottle();
        buildRootBucket(point({ NetTransferNonReg: 'beaucoup' }));
        expect(planLogs().length, 'un champ non numérique est présent-mais-invalide, pas absent').toBeGreaterThan(0);
    });

    it('un NetWorth de fin non fini est journalisé (le montant affiché en bout de période)', () => {
        const root = buildRootBucket(point({ NetWorth: Number.NaN }))!;
        expect(root.netWorthEnd).toBe(0);
        expect(String(planLogs()[0].context?.fields)).toContain('NetWorth');
    });

    it('DISCRIMINANT INVERSE — un champ réellement ABSENT reste SILENCIEUX', () => {
        // La fixture n'émet AUCUN NetTransferREEE/CELIAPP/… : c'est un cas NORMAL (un scénario
        // n'émet pas tous les comptes). Logguer ici transformerait la garde en bruit permanent.
        const root = buildRootBucket(point({}))!;
        expect(root.flows.REEE).toBe(0);
        expect(planLogs(), 'un champ absent n\'est pas une corruption').toHaveLength(0);
    });

    it('le journal est THROTTLÉ : un même champ fautif sur 24 mois ne loggue qu\'une fois', () => {
        const pts = Array.from({ length: 24 }, (_, i) => ({
            monthIndex: i, year: 2026 + Math.floor(i / 12), age: 40, isRetired: false,
            dateLabel: `m${i}`, NetWorth: 100_000, NetTransferCELI: Number.NaN,
        }));
        buildRootBucket(pts);
        expect(planLogs()).toHaveLength(1);
    });

    it('le drill enfant journalise aussi (les conseils chiffrés vivent surtout aux niveaux fins)', () => {
        const pts = Array.from({ length: 24 }, (_, i) => ({
            monthIndex: i, year: 2026 + Math.floor(i / 12), age: 40, isRetired: false,
            dateLabel: `m${i}`, NetWorth: 100_000, NetTransferCELI: Number.NaN,
        }));
        const root = buildRootBucket(pts)!;
        clearErrors(); // on ne garde que ce que produit le niveau enfant
        const kids = getChildBuckets(pts, root);
        expect(kids.length).toBeGreaterThan(0);
        expect(planLogs().length, 'le niveau « décennie » a sa propre signature de throttle').toBeGreaterThan(0);
    });
});
