// tests/services/fintableSyncHealth.test.ts
//
// [FINTABLE-STALE-ALERT] Le cas central est REJOUÉ depuis l'incident réel du 2026-08-05 : la passe
// réussit (error: null, rapport récent) mais plus aucune transaction n'arrive → l'ancien monde
// affichait « tout va bien » pendant 5 jours. Ce test échouerait sur toute implémentation qui se
// contente de regarder `report.error`.

import { describe, it, expect } from 'vitest';
import {
    computeSyncHealth, computeStaleThresholdDays, STALE_SYNC_HOURS,
    DEFAULT_STALE_TRANSACTION_DAYS, MIN_STALE_TRANSACTION_DAYS,
} from '../../services/fintable/syncHealth';
import type { FintableSyncReport, Transaction } from '../../types';

const NOW = Date.parse('2026-08-05T12:00:00Z');
const dayMs = 86_400_000;

const tx = (date: string, id?: number): Transaction => ({
    id: id ?? Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000),
    date, payee: 'Payroll /ROBOVIC INC.', amount: 837.31, category: 'Salaire', status: 'processed',
});

const okReport = (atMs: number): FintableSyncReport => ({
    at: atMs, cutoverDateUsed: '2026-07-01', accountsSeen: 6, accountsWithoutRole: 0,
    transactionsAdded: 0, transfersDetected: 0, cashUpdated: true, debtsUpdated: [],
    investmentReferenceCount: 1, warnings: [], error: null,
});

describe('[FINTABLE-STALE-ALERT] computeSyncHealth', () => {
    it('REJOUE L\'INCIDENT : passe réussie + rapport frais, mais plus aucune transaction → STALE', () => {
        // Situation exacte du 2026-08-05 : dernière transaction le 2026-07-31 (5 j), sync du jour
        // « réussie » avec 0 transaction ajoutée. Un contrôle basé sur report.error dirait « ok ».
        // Historique réaliste : activité quasi quotidienne jusqu'au gel (cadence médiane 1 jour).
        const history = Array.from({ length: 40 }, (_, i) =>
            tx(new Date(NOW - (5 + i) * dayMs).toISOString().slice(0, 10)));
        const h = computeSyncHealth(history, okReport(NOW - 2 * 3_600_000), NOW);
        expect(h.status).toBe('stale');
        expect(h.daysSinceLastTransaction).toBe(5);
        expect(h.lastTransactionDate).toBe('2026-07-31');
        expect(h.lastError).toBeNull();                       // aucune erreur : c'est tout le piège
        expect(h.reason).toMatch(/gelé côté fournisseur/);     // la CAUSE probable est nommée
        // Le seuil s'est ADAPTÉ à sa cadence (3 j) : un seuil fixe de 7 j n'aurait rien vu à J+5.
        expect(h.staleThresholdDays).toBe(MIN_STALE_TRANSACTION_DAYS);
        expect(h.daysSinceLastTransaction).toBeGreaterThan(h.staleThresholdDays);
    });

    it('import vivant → ok (non-vacuité : le statut sait dire oui)', () => {
        const h = computeSyncHealth([tx('2026-08-04'), tx('2026-07-28')], okReport(NOW - 3_600_000), NOW);
        expect(h.status).toBe('ok');
        expect(h.daysSinceLastTransaction).toBe(1);
        expect(h.reason).toMatch(/à jour/);
    });

    it('frontière : au seuil = encore ok, +1 jour = stale (échantillon mince → défaut 7 j)', () => {
        const at = okReport(NOW - 3_600_000);
        // Une seule transaction → pas de cadence exploitable → repli sur le défaut documenté.
        const d = DEFAULT_STALE_TRANSACTION_DAYS;
        const onEdge = computeSyncHealth([tx(new Date(NOW - d * dayMs).toISOString().slice(0, 10))], at, NOW);
        expect(onEdge.staleThresholdDays).toBe(d);
        expect(onEdge.status).toBe('ok');
        const past = computeSyncHealth([tx(new Date(NOW - (d + 1) * dayMs).toISOString().slice(0, 10))], at, NOW);
        expect(past.status).toBe('stale');
    });

    it('le seuil est DÉRIVÉ de la cadence réelle, pas d\'un chiffre fixe', () => {
        // Profil quotidien → seuil au plancher (3 j) : on alerte vite parce que le silence est rare.
        const daily = Array.from({ length: 30 }, (_, i) =>
            tx(new Date(NOW - (i + 1) * dayMs).toISOString().slice(0, 10)));
        expect(computeStaleThresholdDays(daily, NOW)).toBe(MIN_STALE_TRANSACTION_DAYS);
        // Profil clairsemé (1 mouvement / 10 jours) → seuil élargi : pas de fausse alerte.
        const sparse = Array.from({ length: 8 }, (_, i) =>
            tx(new Date(NOW - (i + 1) * 10 * dayMs).toISOString().slice(0, 10)));
        expect(computeStaleThresholdDays(sparse, NOW)).toBeGreaterThan(MIN_STALE_TRANSACTION_DAYS);
        // Historique trop mince → défaut documenté, jamais un seuil inventé.
        expect(computeStaleThresholdDays([tx('2026-08-01')], NOW)).toBe(DEFAULT_STALE_TRANSACTION_DAYS);
    });

    it('la passe elle-même ne tourne plus (> 48 h) → stale, même avec des transactions fraîches', () => {
        const h = computeSyncHealth([tx('2026-08-05')], okReport(NOW - (STALE_SYNC_HOURS + 1) * 3_600_000), NOW);
        expect(h.status).toBe('stale');
        expect(h.reason).toMatch(/ne tourne plus/);
    });

    it('échec de passe → error, avec le code d\'origine PRÉSERVÉ (il oriente le diagnostic)', () => {
        const h = computeSyncHealth([tx('2026-08-05')], { ...okReport(NOW), error: '[AUTH] jeton invalide' }, NOW);
        expect(h.status).toBe('error');
        expect(h.lastError).toBe('[AUTH] jeton invalide');
        expect(h.reason).toContain('[AUTH]');
    });

    it('jamais synchronisé (aucun rapport) → never, jamais confondu avec « gelé »', () => {
        expect(computeSyncHealth([tx('2026-08-05')], undefined, NOW).status).toBe('never');
    });

    it('robustesse : date corrompue ignorée, date FUTURE ne rajeunit pas l\'import', () => {
        // Une date illisible ne doit pas dater l'import de 1970 (gel permanent fictif)…
        const corrupted = computeSyncHealth(
            [{ ...tx('2026-08-04'), date: 'pas-une-date' }, tx('2026-08-04')], okReport(NOW), NOW);
        expect(corrupted.status).toBe('ok');
        expect(corrupted.lastTransactionDate).toBe('2026-08-04');
        // …et une saisie datée dans le futur ne doit pas masquer un vrai gel (bornée à 0).
        const future = computeSyncHealth([tx('2027-01-01')], okReport(NOW), NOW);
        expect(future.daysSinceLastTransaction).toBe(0);
    });

    it('finding #1 panel #561 — ÉCHELLE : 200 000 transactions ne font pas planter (Math.max spread = RangeError)', () => {
        // Mesuré au panel : `Math.max(...epochs)` jette RangeError au-delà d'~125 k, et comme le
        // calcul tourne dans le useMemo de l'Accueil, l'exception tombait TOUT l'onglet.
        const many = Array.from({ length: 200_000 }, (_, i) =>
            tx(new Date(NOW - (i % 900) * dayMs).toISOString().slice(0, 10), i));
        expect(() => computeSyncHealth(many, okReport(NOW), NOW)).not.toThrow();
        expect(computeSyncHealth(many, okReport(NOW), NOW).lastTransactionDate).toBe('2026-08-05');
    });

    it('finding #2 panel #561 — profil SEMAINE SEULEMENT : un long week-end ne crie PAS au loup', () => {
        // Profil très courant (aucune dépense le week-end). Avec la médiane, le seuil tombait à 3 j
        // et un férié de 4 jours déclenchait une FAUSSE alerte « flux gelé côté fournisseur ».
        const weekdays: Transaction[] = [];
        for (let i = 1; i <= 90; i++) {
            const d = new Date(NOW - i * dayMs);
            if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) weekdays.push(tx(d.toISOString().slice(0, 10), i));
        }
        const threshold = computeStaleThresholdDays(weekdays, NOW);
        expect(threshold).toBeGreaterThanOrEqual(4);   // le p90 absorbe la coupure de week-end
        // Un creux de 4 jours (long week-end férié) reste SILENCIEUX.
        const afterLongWeekend = weekdays.filter((t) => Date.parse(`${t.date}T00:00:00Z`) <= NOW - 4 * dayMs);
        expect(computeSyncHealth(afterLongWeekend, okReport(NOW), NOW).status).toBe('ok');
    });

    it('finding #4 panel #561 — la cadence citée est la vraie, jamais re-dérivée d\'un seuil clampé', () => {
        // Profil très clairsemé : le seuil est CLAMPÉ à 14 j. Re-dériver la cadence depuis le seuil
        // affichait « tous les 5 jours » quel que soit le vrai rythme — un chiffre inventé.
        // 6 points espacés de 15 j : tous DANS la fenêtre de 90 j (un espacement de 20 j n'en
        // laissait que 4 → repli sur le défaut, ce que le premier jet de ce test lisait à tort
        // comme un bug du code alors que c'était le comportement documenté).
        const sparse = Array.from({ length: 6 }, (_, i) =>
            tx(new Date(NOW - (i + 1) * 15 * dayMs).toISOString().slice(0, 10), i));
        const h = computeSyncHealth(sparse, okReport(NOW), NOW);
        expect(h.staleThresholdDays).toBe(14);          // clampé
        expect(h.observedGapDays).toBe(15);             // la VRAIE cadence, non clampée
        // Échantillon trop mince → aucune cadence affirmée (on n'invente pas).
        expect(computeSyncHealth([tx('2026-08-01', 1)], okReport(NOW), NOW).observedGapDays).toBeNull();
    });

    it('aucune transaction du tout → stale explicite (jamais « ok » par défaut)', () => {
        const h = computeSyncHealth([], okReport(NOW), NOW);
        expect(h.status).toBe('stale');
        expect(h.daysSinceLastTransaction).toBeNull();
    });
});
