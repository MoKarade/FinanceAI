/**
 * [FINTABLE-RATTRAPAGE] Classement des transactions rapatriées — certain / incertain / nouveau.
 *
 * Marc, 2026-08-18 : « l'import Fintable marche pas, j'ai passé à 1 an d'historique et ça me dit
 * 0 transactions en plus ». Cause MESURÉE : la sync est strictement en avant (bascule = date de la
 * transaction la plus récente connue), donc rien d'ancien n'est ni demandé ni gardé. Le rattrapage
 * renonce à cette garantie ; ce module est ce qui la remplace.
 *
 * ⚠️ CE QUE CES TESTS PROTÈGENT EN PRIORITÉ : **ne pas neutraliser une vraie dépense**. Sur un
 * rattrapage d'un an, un faux positif ne se voit pas — il enlève juste de l'argent du budget, en
 * silence. C'est le sens de la moitié des cas ci-dessous.
 */
import { describe, it, expect } from 'vitest';
import { classerRattrapage, libellesSimilaires } from '../../../services/fintable/backfillDedup';
import type { Transaction } from '../../../types';

const t = (o: Partial<Transaction>): Transaction =>
    ({ id: Math.random(), date: '2026-06-10', payee: 'Metro', amount: -42, category: 'Épicerie', status: 'processed', ...o }) as Transaction;

describe('[FINTABLE-RATTRAPAGE] les doublons CERTAINS partent tout seuls', () => {
    it('même jour, même montant, même libellé → neutralisé sans déranger Marc', () => {
        const r = classerRattrapage([t({ payee: 'Metro' })], [t({ payee: 'METRO #123' })]);
        expect(r.certaines).toHaveLength(1);
        expect(r.certaines[0].isDuplicate).toBe(true);
        expect(r.incertaines).toHaveLength(0);
        expect(r.nouvelles).toHaveLength(0);
    });

    // ⚠️ « Neutralisé », pas « supprimé » : Marc a dit « supprimer », le dépôt MARQUE. Une marquée
    // est déjà hors courbe/budget (effet identique) mais se défait d'un clic — une suppression, non.
    it('la transaction est CONSERVÉE, seulement marquée', () => {
        const r = classerRattrapage([t({})], [t({ payee: 'Metro', amount: -42 })]);
        expect(r.certaines[0]).toMatchObject({ payee: 'Metro', amount: -42, isDuplicate: true });
    });
});

describe('[FINTABLE-RATTRAPAGE] les INCERTAINS sont listés, pas décidés', () => {
    /**
     * LE cas qui motive tout le lot : la banque a renommé le marchand entre l'import CSV et
     * Fintable. `markDuplicates` exige montant ET libellé → ne le voit pas. C'est précisément ce
     * contre quoi la bascule protégeait, donc ce qu'un rattrapage doit rendre visible.
     */
    it('même montant, date proche, libellé DIFFÉRENT → arbitrage de Marc', () => {
        const r = classerRattrapage(
            [t({ date: '2026-06-10', payee: 'PAIEMENT CAISSE', amount: -180 })],
            [t({ date: '2026-06-12', payee: 'Hydro-Québec', amount: -180 })],
        );
        expect(r.incertaines).toHaveLength(1);
        expect(r.incertaines[0].ecartJours).toBe(2);
        expect(r.incertaines[0].existante.payee).toBe('PAIEMENT CAISSE');
        // Neutralisée par défaut : mieux vaut un doublon caché qu'un doublon qui fausse le budget,
        // et la liste permet de le rétablir.
        expect(r.incertaines[0].entrante.isDuplicate).toBe(true);
    });

    it('au-delà de la fenêtre de 5 jours, ce n’est plus un candidat', () => {
        const r = classerRattrapage(
            [t({ date: '2026-06-01', payee: 'X', amount: -180 })],
            [t({ date: '2026-06-10', payee: 'Y', amount: -180 })],
        );
        expect(r.nouvelles).toHaveLength(1);
        expect(r.incertaines).toHaveLength(0);
    });

    it('le candidat retenu est le PLUS PROCHE en date', () => {
        const r = classerRattrapage(
            [t({ date: '2026-06-05', payee: 'Loin', amount: -50 }), t({ date: '2026-06-09', payee: 'Proche', amount: -50 })],
            [t({ date: '2026-06-10', payee: 'Autre', amount: -50 })],
        );
        expect(r.incertaines[0].existante.payee).toBe('Proche');
    });
});

describe('[FINTABLE-RATTRAPAGE] ne JAMAIS neutraliser une vraie dépense', () => {
    /**
     * ⚠️ Choix explicite de Marc (2026-08-18). `markDuplicates` marque deux vraies transactions
     * identiques à ±5 j — tolérable sur un import ponctuel, destructeur sur un rattrapage d'un an.
     * Ici elles passent en NOUVELLES : deux cafés à 4,25 $ le même jour sont deux cafés.
     */
    it('deux dépenses identiques le même jour, SANS existante → toutes deux gardées', () => {
        const r = classerRattrapage([], [
            t({ payee: 'Café', amount: -4.25 }),
            t({ payee: 'Café', amount: -4.25 }),
        ]);
        expect(r.nouvelles).toHaveLength(2);
        expect(r.certaines).toHaveLength(0);
        expect(r.incertaines).toHaveLength(0);
    });

    /**
     * ⚠️ L'invariant d'APPARIEMENT UNIQUE. Trois vraies dépenses identiques face à UNE seule
     * existante : sans `dejaApparie`, les trois s'apparieraient à la même et seraient neutralisées —
     * on effacerait deux dépenses réelles pour un seul doublon.
     */
    it('une existante ne peut absorber qu’UNE entrante', () => {
        const r = classerRattrapage(
            [t({ payee: 'Café', amount: -4.25 })],
            [t({ payee: 'Café', amount: -4.25 }), t({ payee: 'Café', amount: -4.25 }), t({ payee: 'Café', amount: -4.25 })],
        );
        expect(r.certaines).toHaveLength(1);
        expect(r.nouvelles, 'les deux autres sont de VRAIES dépenses').toHaveLength(2);
    });

    it('montant différent → jamais un doublon, même libellé et même jour', () => {
        const r = classerRattrapage([t({ amount: -42 })], [t({ amount: -43 })]);
        expect(r.nouvelles).toHaveLength(1);
    });

    it('même montant + même jour mais libellés SANS rapport → incertain, pas certain', () => {
        // Deux achats de 20 $ le même jour chez deux commerçants : banal. On ne tranche pas seul.
        const r = classerRattrapage(
            [t({ date: '2026-06-10', payee: 'Pharmacie', amount: -20 })],
            [t({ date: '2026-06-10', payee: 'Station-service', amount: -20 })],
        );
        expect(r.certaines).toHaveLength(0);
        expect(r.incertaines).toHaveLength(1);
        expect(r.incertaines[0].ecartJours).toBe(0);
    });

    it('une date illisible n’est jamais appariée par hasard', () => {
        const r = classerRattrapage([t({ date: 'n/a', amount: -42 })], [t({ date: 'n/a', amount: -42 })]);
        expect(r.nouvelles).toHaveLength(1);
    });
});

/**
 * ⚠️ La règle de similarité est RECOPIÉE de `arePayeesSimilar` (non exportée). Ce test confronte les
 * deux sur les mêmes cas pour qu'une divergence future ROUGISSE, au lieu de dériver en silence —
 * classe « outil-garde à valeurs re-codées en dur », déjà au dossier.
 */
describe('[FINTABLE-RATTRAPAGE] la similarité reste alignée sur la dédup historique', () => {
    it.each([
        ['Metro', 'METRO #123', true],
        ['Metro', 'metro', true],
        ['Hydro-Québec', 'PAIEMENT CAISSE', false],
        ['ABC', 'ABCD', false],
        ['', '', true],
        ['Metro', '', false],
    ])('« %s » vs « %s » → %s', (a, b, attendu) => {
        expect(libellesSimilaires(a as string, b as string)).toBe(attendu);
    });
});

/**
 * [finding silent-failure #649] Le compteur ne suffisait pas — il fallait une VOIX.
 *
 * ⚠️ Mon premier correctif remontait `skippedBeforeCutover` au rapport et l'affichait dans le toast
 * de la sync MANUELLE. Or l'incident de Marc vient de la sync AUTOMATIQUE (au chargement de l'app,
 * sans clic) : aucun toast, et les vues durables — pied de la carte, Système & diagnostics —
 * n'affichaient pas le champ. Le silence n'était pas supprimé, il était DÉPLACÉ.
 * Les `warnings`, eux, sont déjà transportés partout. Rouler dessus rend l'information visible sans
 * demander à chaque écran de s'en souvenir : c'est ça, corriger la classe plutôt que le symptôme.
 */
import { mapFintableSnapshot } from '../../../services/fintable/mapSnapshot';

describe('[FINTABLE-RATTRAPAGE] les écartées ont une VOIX, pas seulement un compteur', () => {
    const snapshot = (dates: string[]) => ({
        readAt: Date.parse('2026-08-18T12:00:00Z'),
        accounts: [{ id: 'acc_1', connectionId: 'conn_1', name: 'Chèque', type: 'depository', currency: 'CAD', balance: 1500, cashBalance: null, debt: null }],
        holdings: [], holdingsSkipped: [],
        transactions: dates.map((d, i) => ({
            id: `tx_${i}`, accountId: 'acc_1', date: d, amount: -20, currency: 'CAD',
            description: `Achat ${i}`, pending: false,
        })),
    } as never);

    const config = (after: string | null) => ({
        roles: { acc_1: { kind: 'cash' } }, transactionsAfter: after, baseCurrency: 'CAD',
    } as never);

    it('des transactions écartées → un AVERTISSEMENT qui dit pourquoi et quoi faire', () => {
        const r = mapFintableSnapshot(snapshot(['2025-01-05', '2025-02-05']), config('2026-07-01'));
        expect(r.report.transactions.skippedBeforeCutover).toBe(2);
        const w = r.report.warnings.join(' | ');
        expect(w, 'le nombre').toContain('2 transaction(s) plus ANCIENNES');
        expect(w, 'la raison').toContain('2026-07-01');
        expect(w, 'et surtout : quoi faire').toContain('Rattraper l’historique');
    });

    // ⚠️ Anti-sur-correctif : un avertissement permanent ne se lit plus comme un avertissement.
    it('rien d’écarté → aucun avertissement de bascule', () => {
        const r = mapFintableSnapshot(snapshot(['2026-08-05']), config('2026-07-01'));
        expect(r.report.transactions.skippedBeforeCutover).toBe(0);
        expect(r.report.warnings.join(' | ')).not.toContain('plus ANCIENNES');
    });

    it('en RATTRAPAGE (bascule nulle), rien n’est écarté ni signalé à ce titre', () => {
        const r = mapFintableSnapshot(snapshot(['2025-01-05']), config(null));
        expect(r.report.transactions.skippedBeforeCutover).toBe(0);
        expect(r.report.warnings.join(' | ')).not.toContain('plus ANCIENNES');
    });
});

/**
 * [FINTABLE-DOUBLON-DATE-DECALEE + FINTABLE-APPARIEMENT-GLOUTON] Les deux trous mesurés par l'audit
 * de la PR #649, fermés après coup.
 */
describe('[FINTABLE-RATTRAPAGE] le doublon à DATE DÉCALÉE ne passe plus entre les mailles', () => {
    /**
     * ⚠️ LA FORME LA PLUS FRÉQUENTE du doublon bancaire réel : date de transaction vs date de
     * comptabilisation, qui diffère systématiquement entre deux agrégateurs. Elle ne tombait dans
     * AUCUNE branche (`d === 0 && similaire` → certain ; `!similaire` → incertain) et partait en
     * NOUVELLE : ni neutralisée, ni listée, et invisible pour la dédup par clé puisque la date entre
     * dans la clé. Double comptage silencieux.
     */
    it('même marchand, même montant, 1 jour d’écart → INCERTAIN (pas « nouvelle »)', () => {
        const r = classerRattrapage(
            [t({ date: '2026-06-10', payee: 'Metro', amount: -42 })],
            [t({ date: '2026-06-11', payee: 'METRO #12', amount: -42 })],
        );
        expect(r.nouvelles, 'la laisser passer = double comptage').toHaveLength(0);
        expect(r.incertaines).toHaveLength(1);
        expect(r.incertaines[0].ecartJours).toBe(1);
    });

    // ⚠️ On ne la classe PAS « certaine » : un abonnement facturé deux jours de suite existe.
    it('… mais elle n’est pas neutralisée en silence : c’est Marc qui tranche', () => {
        const r = classerRattrapage(
            [t({ date: '2026-06-10', payee: 'Metro', amount: -42 })],
            [t({ date: '2026-06-11', payee: 'Metro', amount: -42 })],
        );
        expect(r.certaines).toHaveLength(0);
        expect(r.incertaines).toHaveLength(1);
    });

    // ⚠️ `Date.parse('2026-06T00:00:00Z')` est VALIDE : deux dates au MOIS seul donnaient d === 0,
    // donc « certain » sur une granularité mensuelle. Le dépôt manipule des transactions au mois.
    it('deux dates au MOIS seul ne sont jamais « certaines »', () => {
        const r = classerRattrapage(
            [t({ date: '2026-06', payee: 'Metro', amount: -42 })],
            [t({ date: '2026-06', payee: 'Metro', amount: -42 })],
        );
        expect(r.certaines).toHaveLength(0);
    });
});

describe('[FINTABLE-RATTRAPAGE] la preuve la plus FORTE se sert la première', () => {
    /**
     * ⚠️ En une seule passe, l'ordre des ENTRANTES décidait : une entrante douteuse traitée en
     * premier « volait » l'existante d'un vrai doublon → DEUX erreurs d'un coup (un faux positif
     * listé à Marc, et le vrai doublon reclassé NOUVELLE, donc compté deux fois dans le budget).
     */
    it('un INCERTAIN ne vole plus l’existante d’un CERTAIN', () => {
        const r = classerRattrapage(
            [t({ date: '2026-06-10', payee: 'Metro', amount: -42 })],
            [
                t({ date: '2026-06-11', payee: 'Pharmacie', amount: -42 }), // douteux, traité en 1er
                t({ date: '2026-06-10', payee: 'METRO #123', amount: -42 }), // LE vrai doublon
            ],
        );
        expect(r.certaines, 'le vrai doublon doit être reconnu').toHaveLength(1);
        expect(r.certaines[0].payee).toBe('METRO #123');
        // L'existante étant consommée, la Pharmacie n'a plus de candidate : c'est une vraie dépense.
        expect(r.nouvelles.map((x) => x.payee)).toEqual(['Pharmacie']);
        expect(r.incertaines).toHaveLength(0);
    });
});
