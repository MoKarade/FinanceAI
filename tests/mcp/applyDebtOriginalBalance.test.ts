// tests/mcp/applyDebtOriginalBalance.test.ts
//
// [DEBT-MCP-ORIGINALBALANCE] Le montant EMPRUNTÉ entre enfin dans l'app — et avec lui, la courbe
// d'amortissement du passé livrée au lot 92 devient ATTEIGNABLE.
//
// ⚠️ Pourquoi ce lot existe. Le lot 92 a câblé l'amortissement du passé et l'a prouvé par 37 gardes,
// puis a mesuré que **zéro producteur** n'écrivait `originalBalance` : ni UI, ni MCP, ni import PDF.
// La feature était livrée, testée, déployée… et invisible (`UN-CHAMP-TYPE-SANS-PRODUCTEUR-EST-UNE-
// INTENTION-JAMAIS-LIVREE`). La garde d'ATTEIGNABILITÉ en fin de fichier est donc la plus importante
// des quatorze : elle part du payload MCP et va jusqu'au supplément de dette au passé, sans
// reconstruire aucun maillon — c'est la seule qui rougirait si la chaîne se rompait ailleurs.
import { describe, it, expect } from 'vitest';
import { applyDocument, type DebtPayload } from '../../mcp/ingest/applyDocument';
import { buildDefaultAppState } from '../../mcp/state/loadAppState';
import { applyDebtSpec } from '../../mcp/tools/applyDebt.spec';
import { amortirDettePassee, supplementAmortiAuMoisAbsolu } from '../../services/projection/debtAmortization';
import { moisAbsolu } from '../../services/projection/debtSchedule';
import type { AppState, Debt } from '../../types';

const baseState = (): AppState => buildDefaultAppState();

/** Le contrat de Marc, tel qu'une extraction PDF le rendrait : tous les champs que la courbe exige. */
const pretAuto = (over: Partial<DebtPayload> = {}): DebtPayload => ({
    kind: 'debt',
    name: 'Prêt auto Honda Civic',
    balance: 18000,
    originalBalance: 30000,
    interestRate: 5,
    minimumPayment: 560,
    debtKind: 'auto',
    startDate: '2024-01-15',
    ...over,
});

const ajoute = (p: DebtPayload, state: AppState = baseState()): Debt =>
    applyDocument(state, p).nextState.debts[0] as Debt;

describe('[DEBT-MCP-ORIGINALBALANCE] écriture du montant emprunté', () => {
    it('AJOUT : le champ arrive dans la dette écrite', () => {
        expect(ajoute(pretAuto()).originalBalance).toBe(30000);
    });

    it('AJOUT sans le champ : la dette n\'en porte pas — non-régression stricte', () => {
        // Le cas de toutes les dettes déjà en base. `undefined` et non `0` : « pas renseigné » n'est
        // pas « zéro », et un 0 réveillerait le refus `donnees-manquantes` pour une autre raison.
        const d = ajoute(pretAuto({ originalBalance: undefined }));
        expect(d.originalBalance).toBeUndefined();
        expect('originalBalance' in d).toBe(false);
    });

    it('MISE À JOUR PARTIELLE : le champ seul suffit à réveiller une dette déjà en base', () => {
        // C'est le geste RÉEL : la dette existe (saisie à la main), le contrat arrive plus tard et
        // n'apporte que le montant emprunté.
        const apres = applyDocument(baseState(), pretAuto({ originalBalance: undefined })).nextState;
        const { nextState, changes } = applyDocument(apres, {
            kind: 'debt', name: 'Prêt auto Honda Civic', originalBalance: 30000,
        });
        expect((nextState.debts[0] as Debt).originalBalance).toBe(30000);
        expect(changes.map(c => c.field)).toContain('debts[0].originalBalance');
        expect(nextState.debts).toHaveLength(1); // mise à jour, jamais un doublon
    });
});

describe('[DEBT-MCP-ORIGINALBALANCE] refus d\'une origine incohérente', () => {
    it('refuse un montant emprunté INFÉRIEUR au solde actuel, en nommant les deux chiffres', () => {
        // Sans ce refus, `amortirDettePassee` renverrait `origine-incoherente` en SILENCE : la dette
        // serait écrite, la courbe resterait plate, et personne ne saurait pourquoi.
        expect(() => applyDocument(baseState(), pretAuto({ originalBalance: 12000 })))
            .toThrow(/montant emprunté.*12000.*INFÉRIEUR.*18000/i);
    });

    it('⚠️ le refus se juge sur les valeurs EFFECTIVES, pas sur le payload seul', () => {
        // La leçon que la garde de DATES du même fichier a déjà payée. Une mise à jour qui ne porte
        // QUE `originalBalance` n'a pas de `balance` à comparer dans son payload : sans fusion avec
        // la dette stockée, la comparaison ne compare RIEN et la garde est vacueuse.
        const apres = applyDocument(baseState(), pretAuto({ originalBalance: undefined })).nextState;
        expect(() => applyDocument(apres, {
            kind: 'debt', name: 'Prêt auto Honda Civic', originalBalance: 12000,
        })).toThrow(/INFÉRIEUR/i);
        // Symétrique : c'est le SOLDE qui monte au-dessus du montant emprunté déjà en base.
        const avecOrigine = applyDocument(baseState(), pretAuto()).nextState;
        expect(() => applyDocument(avecOrigine, {
            kind: 'debt', name: 'Prêt auto Honda Civic', balance: 45000,
        })).toThrow(/INFÉRIEUR/i);
    });

    it('l\'égalité est ACCEPTÉE : un prêt tout juste contracté n\'a rien remboursé', () => {
        expect(ajoute(pretAuto({ originalBalance: 18000 })).originalBalance).toBe(18000);
    });
});

describe('[DEBT-MCP-ORIGINALBALANCE] bornes côté MÉTIER (l\'import PDF ne passe pas par Zod)', () => {
    // Leçon MCP-WHATIF : le schéma est la bretelle, la logique métier est la ceinture. `applyDocument`
    // est appelé DIRECTEMENT par l'ingestion de document, sans validation Zod.
    const refuse = (v: unknown): void => {
        expect(() => applyDocument(baseState(), pretAuto({ originalBalance: v as number })))
            .toThrow(/Montant emprunté invalide/i);
    };
    it('refuse NaN, Infinity, zéro, négatif et aberrant', () => {
        refuse(Number.NaN);
        refuse(Number.POSITIVE_INFINITY);
        refuse(0);
        refuse(-30000);
        refuse(50_000_001); // > MAX_DEBT_BALANCE (50 M$)
    });
    it('« rien n\'a été écrit » est vrai : l\'état d\'entrée n\'est pas muté', () => {
        const state = baseState();
        const avant = JSON.stringify(state.debts ?? []);
        expect(() => applyDocument(state, pretAuto({ originalBalance: -1 }))).toThrow();
        expect(JSON.stringify(state.debts ?? [])).toBe(avant);
    });
});

describe('[DEBT-MCP-ORIGINALBALANCE] le schéma du tool (la bretelle)', () => {
    it('expose le champ, et son libellé dit la CONSÉQUENCE plutôt que le type', () => {
        const champ = applyDebtSpec.inputSchema.originalBalance;
        expect(champ).toBeDefined();
        const { description } = champ._def as { description?: string };
        // Un modèle qui lit « nombre positif » invente ; un modèle qui lit « ne l'estime jamais »
        // s'abstient. La description est l'endroit où cette règle atteint l'IA.
        expect(description ?? '').toMatch(/contrat/i);
        expect(description ?? '').toMatch(/estime JAMAIS|n'invente|jamais à partir/i);
    });
    it('refuse un négatif et un non-fini AVANT le métier', () => {
        expect(applyDebtSpec.inputSchema.originalBalance.safeParse(-1).success).toBe(false);
        expect(applyDebtSpec.inputSchema.originalBalance.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
        expect(applyDebtSpec.inputSchema.originalBalance.safeParse(30000).success).toBe(true);
    });
});

describe('[DEBT-MCP-ORIGINALBALANCE] ATTEIGNABILITÉ — du payload MCP jusqu\'à la courbe du passé', () => {
    // ⚠️ LA garde du lot. Le lot 92 était vert de bout en bout et pourtant invisible ; ce qui manquait
    // n'était couvert par AUCUN test, parce que chaque moitié était testée chez elle. On part donc du
    // payload et on va jusqu'au supplément de dette, sans reconstruire un seul maillon.
    const AUJ = moisAbsolu('2026-01-15') as number;

    it('une dette importée par MCP reçoit VRAIMENT une courbe d\'amortissement', () => {
        const d = ajoute(pretAuto());
        const r = amortirDettePassee(d, AUJ);
        expect(r.forme).toBe('ok');
        // Et elle atterrit EXACTEMENT sur le solde réel : c'est le raccord au présent.
        if (r.forme !== 'ok') throw new Error('inatteignable');
        expect(r.soldes[r.soldes.length - 1]).toBeCloseTo(18000, 6);
    });

    it('le passé doit PLUS, et le supplément décroît vers aujourd\'hui', () => {
        const d = ajoute(pretAuto());
        const debut = moisAbsolu('2024-01-15') as number;
        const supDebut = supplementAmortiAuMoisAbsolu([d], debut, AUJ);
        const supRecent = supplementAmortiAuMoisAbsolu([d], AUJ - 1, AUJ);
        expect(supDebut).toBeGreaterThan(5000);   // anti-vacuité : l'effet est SUBSTANTIEL
        expect(supRecent).toBeGreaterThan(0);
        expect(supRecent).toBeLessThan(supDebut);
        expect(supplementAmortiAuMoisAbsolu([d], AUJ, AUJ)).toBe(0); // raccord exact
    });

    it('SANS le champ, la même dette reste PLATE — c\'est bien lui qui débloque, rien d\'autre', () => {
        // Contrôle indispensable : sans lui, la garde ci-dessus passerait aussi si un autre champ
        // (ajouté par `[DEBT-MCP-PARITE]`) suffisait déjà, et le lot ne prouverait rien.
        const d = ajoute(pretAuto({ originalBalance: undefined }));
        expect(amortirDettePassee(d, AUJ)).toEqual({ forme: 'inapplicable', cause: 'donnees-manquantes' });
        expect(supplementAmortiAuMoisAbsolu([d], moisAbsolu('2024-01-15') as number, AUJ)).toBe(0);
    });

    it('un BAIL importé avec son montant reste PLAT — le cas réel de Marc', () => {
        const d = ajoute(pretAuto({ debtKind: 'auto-lease' }));
        expect(d.originalBalance).toBe(30000); // le champ est bien écrit…
        expect(amortirDettePassee(d, AUJ)).toEqual({ forme: 'inapplicable', cause: 'kind-non-amortissant' });
    });
});
