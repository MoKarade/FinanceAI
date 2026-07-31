// tests/services/categoryRules.test.ts
// [TX-CATEGORY-RULES] — règles déterministes de catégorisation (corpus réel Desjardins).
// Direction : payees représentatifs de CHAQUE catégorie + inconnus → null (jamais d'invention).
// Intégration : parseBankCsv (CSV sans colonne catégorie) et applyBankStatement (MCP) routent
// par les MÊMES règles — cohérence app↔MCP.

import { describe, it, expect } from 'vitest';
import { ruleCategorize, RULE_CATEGORIES, categoryKey, buildCategoryCanonicalMap, resolveCandidateCategory } from '../../services/import/categoryRules';
import { parseBankCsv } from '../../services/import/parseBankCsv';
import { applyDocument } from '../../mcp/ingest/applyDocument';
import { buildDefaultAppState } from '../../mcp/state/loadAppState';

describe('ruleCategorize — corpus réel (payees Desjardins compte + MasterCard)', () => {
    const cases: Array<[string, string]> = [
        // compte
        ['Paie / ROBOVIC INC.', 'Salaire'],
        ['Payroll /ROBOVIC INC.', 'Salaire'],
        ['Paie / ALGO SERVICE DE PAIE', 'Salaire'],
        ['Ristourne', 'Revenus divers'],
        ['Intérêt sur ET', 'Revenus divers'],
        ['Virement Interac de / ANNA LUCIE MAL/', 'Revenus divers'],
        ['Loyer/bail / 9420 3767 Quebec inc.', 'Logement'],
        ['Virement envoyé à / Valerie cameron    /Loyer', 'Logement'],
        ['Paiement facture - AccèsD Internet / HYDRO-QUEBEC', 'Logement'],
        ['Paiement facture - AccèsD Internet / Desjardins Remises MasterCard', 'Transfert'],
        ['Paiement facture - AccèsD Internet / Desjardins Cash Back MasterCar', 'Transfert'],
        ['PAIEMENT CAISSE', 'Transfert'],
        ['Paiement facture - AccèsD Internet / Virement Disnat 5NFL7A3', 'Transfert'],
        ['Placement / Wealthsimple Investments Inc.', 'Transfert'],
        ['Assurance / DESJARDINS ASS. GENERALES', 'Assurances'],
        ["Frais fixes d'utilisation", 'Frais bancaires'],
        ['FRAIS DE CRÉDIT', 'Frais bancaires'],
        ['Paiement facture - AccèsD Internet / Payement impôt fédéral', 'Impôts'],
        // carte
        ['METRO FERLAND DU MARAI', 'Épicerie'],
        ['IGA DES SOURCES CHARLE', 'Épicerie'],
        ['Achat / FRUITERIE 440 Q', 'Épicerie'],
        ['SAQ33616 GALERIES CHAR', 'Épicerie'],
        ['DEPANNEUR L ETAPE', 'Épicerie'],
        ['TIM HORTONS #1338', 'Restaurants'],
        ["MCDONALD'S #40044", 'Restaurants'],
        ['UBER CANADA/UBEREATS', 'Restaurants'],
        ['CHEZ ASHTON 1ERE AVENU', 'Restaurants'],
        ['SONIC PRINCEVILLE 3179', 'Transport'],
        ['PETRO-CANADA 12200', 'Transport'],
        ['COUCHE-TARD # 1141', 'Transport'],
        ['ACHAT PREAUTORISE / COUCHETARD', 'Transport'],
        ['NETFLIX.COM', 'Abonnements'],
        ['VIRGIN PLUS', 'Abonnements'],
        // [TX-CATEGORIZE] Google Play est une plateforme AMBIGUË (achat unique OU abonnement) :
        // le libellé seul ne peut plus décider « Abonnements » — c'est le profil de récurrence du
        // marchand qui promeut (cf. services/transactions/contextualCategorize.ts).
        ['GOOGLE *Cell to Singul', 'Loisirs'],
        ['CLAUDE.AI SUBSCRIPTION', 'Abonnements'],
        ['BRUNET MARAIS 6433', 'Santé'],
        ['ECONOFITNESS ADMIN MON', 'Santé'],
        ['STEAM PURCHASE', 'Loisirs'],
        ['SQDC77005 QC LEBOURGNE', 'Loisirs'],
        ['SEPAQ JACQUES CARTIER', 'Loisirs'],
        ['WINNERS 330', 'Magasinage'],
        ['DOLLARAMA # 52', 'Magasinage'],
        ['CANADIAN TIRE #245', 'Magasinage'],
        ['AIRBNB * HMM54R29XW', 'Voyages'],
        ['AIR TRANSAT A.T. INC.', 'Voyages'],
        ['Virement Interac à / ensemble patio/', 'Autre'],
    ];
    it.each(cases)('« %s » → %s', (payee, expected) => {
        expect(ruleCategorize(payee)).toBe(expected);
    });

    it('volume : les cas couvrent TOUTES les catégories du jeu canonique (sauf Uncategorized implicite)', () => {
        const covered = new Set(cases.map(([, c]) => c));
        for (const cat of RULE_CATEGORIES) {
            expect(covered.has(cat), `catégorie « ${cat} » sans cas de test`).toBe(true);
        }
    });

    it("DIRECTION : payee inconnu → null (jamais d'invention — l'IA/Uncategorized prend le relais)", () => {
        for (const p of ['TRUDEL INNOVATION', 'MERCHANT XYZ 123', '', 'GARMIN INTL AFP']) {
            expect(ruleCategorize(p)).toBe(null);
        }
    });

    it('un Interac vers une PERSONNE au nom d\'enseigne (Bell, Wendy, Brunet, Simons, Normandin) → Autre, jamais la boutique (finding panel)', () => {
        for (const p of [
            'Virement Interac à / MARIE BELL     /',
            'Virement Interac à / WENDY TREMBLAY /',
            'Virement Interac à / SOPHIE BRUNET  /',
            'Virement Interac à / JOHN SIMONS    /',
            'Virement Interac à / LUC NORMANDIN  /',
        ]) {
            expect(ruleCategorize(p)).toBe('Autre');
        }
    });

    it('regex ancrées (finding panel) : GRILLE ≠ GRILL, APPROVISIONNEMENT ≠ PROVISION', () => {
        expect(ruleCategorize('RONA - GRILLE FOYER')).toBe('Magasinage');       // pas Restaurants
        expect(ruleCategorize('CANADIAN TIRE GRILLES BBQ')).toBe('Magasinage'); // pas Restaurants
        expect(ruleCategorize('SERVICES APPROVISIONNEMENT X')).toBe(null);      // pas Épicerie
        expect(ruleCategorize('PROVISION STE-ODILE')).toBe('Épicerie');         // le vrai marchand reste couvert
    });

    it('ordre des règles (finding panel) : SAAQ prime sur ASSURANCE ; INTERET nu = charge, pas un revenu', () => {
        expect(ruleCategorize('SAAQ - SOCIETE ASSURANCE AUTOMOBILE QUEBEC')).toBe('Transport');
        expect(ruleCategorize('PAIEMENT SAAQ IMMATRICULATION')).toBe('Transport');
        expect(ruleCategorize('Assurance / DESJARDINS ASS. GENERALES')).toBe('Assurances'); // inchangé
        expect(ruleCategorize('FRAIS DE PROVISION INTERET')).toBe(null);  // plus jamais « Revenus divers »
        expect(ruleCategorize('Intérêt sur ET')).toBe('Revenus divers');  // la vraie forme relevé reste couverte
        expect(ruleCategorize('Interest on TS')).toBe('Revenus divers');
    });
});

describe('intégration — les règles s\'appliquent à l\'import', () => {
    it('parseBankCsv SANS colonne catégorie → catégories par règles ; inconnu → Uncategorized', () => {
        const csv = [
            'Date,Description,Montant',
            '2026-06-04,"Paie / ROBOVIC INC.",837.31',
            '2026-06-15,"Achat / FRUITERIE 440 Q",-15.82',
            '2026-06-16,"TRUDEL INNOVATION",-9.20',
        ].join('\n');
        const { transactions } = parseBankCsv(csv);
        // NB : markDuplicates trie par date — on compare payee→catégorie, pas l'ordre.
        const byPayee = new Map(transactions.map(t => [t.payee, t.category]));
        expect(byPayee.get('Paie / ROBOVIC INC.')).toBe('Salaire');
        expect(byPayee.get('Achat / FRUITERIE 440 Q')).toBe('Épicerie');
        expect(byPayee.get('TRUDEL INNOVATION')).toBe('Uncategorized');
    });

    it('MCP applyBankStatement → mêmes règles (cohérence app↔MCP) ; catégorie fournie PRIME', () => {
        const { nextState } = applyDocument(buildDefaultAppState(), {
            kind: 'bank_statement',
            transactions: [
                { date: '2026-06-04', payee: 'Paie / ROBOVIC INC.', amount: 837.31 },
                { date: '2026-06-05', payee: 'TIM HORTONS #1338', amount: -8.37 },
                { date: '2026-06-06', payee: 'TIM HORTONS #1338', amount: -5.74, category: 'Autre' },
                { date: '2026-06-07', payee: 'TRUDEL INNOVATION', amount: -9.2 },
            ],
        } as Parameters<typeof applyDocument>[1]);
        expect(nextState.transactions.map(t => t.category)).toEqual([
            'Salaire', 'Restaurants', 'Autre', 'Non catégorisé',
        ]);
    });
});

// [MCP-CATEGORY-ALLOWLIST] Helpers purs partagés (applyDocument + categorizeBatch) — une seule
// source de la validation, jamais deux copies qui dérivent.
describe('allowlist canonique de catégories (helpers partagés)', () => {
    it('categoryKey : insensible casse/accents/espaces', () => {
        expect(categoryKey('  Épicerie ')).toBe('epicerie');
        expect(categoryKey('epicerie')).toBe('epicerie');
    });

    it('buildCategoryCanonicalMap : en cas de collision de clé, le DERNIER nom gagne (priorité poste)', () => {
        // applyDocument place les postes APRÈS RULE_CATEGORIES → un poste renommé « épicerie »
        // impose SA casse sur la forme canonique des règles (cible réelle de réconciliation).
        const m = buildCategoryCanonicalMap(['Épicerie', 'épicerie']);
        expect(m.get('epicerie')).toBe('épicerie');
        expect(m.size).toBe(1);
        // Noms vides/espaces ignorés (jamais de clé '' qui matcherait un blanc).
        expect(buildCategoryCanonicalMap(['', '   ', 'Loyer']).size).toBe(1);
    });

    it('resolveCandidateCategory : canonique remappée, hors-liste → règles payee, absente ≠ remap', () => {
        const allowed = buildCategoryCanonicalMap(['Épicerie', 'Transport']);
        // Canonique (variante casse) → forme canonique, PAS un remap.
        expect(resolveCandidateCategory('epicerie', allowed, 'IGA', 'Autre'))
            .toEqual({ category: 'Épicerie', remapped: false });
        // Hors liste + règle payee → règle, COMPTÉ remap (le vecteur « Sport » du finding).
        expect(resolveCandidateCategory('Sport', allowed, 'UBERTRIP 8XZK4', 'Autre'))
            .toEqual({ category: 'Transport', remapped: true });
        // Hors liste + payee sans règle → fallback, COMPTÉ remap.
        expect(resolveCandidateCategory('Sport', allowed, 'ZZZZZ INCONNU', 'Autre'))
            .toEqual({ category: 'Autre', remapped: true });
        // Absente → règles/fallback, PAS un remap (une absence n'est pas une invention).
        expect(resolveCandidateCategory(undefined, allowed, 'ZZZZZ INCONNU', 'Autre'))
            .toEqual({ category: 'Autre', remapped: false });
    });
});
