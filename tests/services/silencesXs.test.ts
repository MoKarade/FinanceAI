import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeHealthWeights, DEFAULT_HEALTH_WEIGHTS } from '../../utils/healthWeights';
import * as errorLogger from '../../services/errorLogger';

/**
 * Vague 1e (fin) — cinq XS « silence qui cache quelque chose », 2026-08-19.
 *
 * ⚠️ Leçon fraîche appliquée (`DIAGNOSTIC-GROUPE-A-MOITIE-FAUX`) : les cinq tickets sont regroupés
 * par CLASSE (« une erreur avalée sans trace »), mais chaque diagnostic a été re-dérivé sur son
 * propre code avant d'écrire quoi que ce soit. Ils se sont tous confirmés — cette fois.
 *
 * Trois portent sur des erreurs AVALÉES, un sur une valeur crédible substituée à une absence, et un
 * sur du code MORT dont la perte silencieuse restait ré-exposable par copier-coller.
 */

afterEach(() => vi.restoreAllMocks());

describe('[SILENT-HEALTHWEIGHTS-FIELD] un poids corrompu laisse une trace, un poids absent non', () => {
    // Le seul des cinq qui se teste au CONTRAT (fonction pure exportée) plutôt que par scan.

    it('champ PRÉSENT mais non fini → repli sur le défaut ET journalisation', () => {
        const spy = vi.spyOn(errorLogger, 'logErrorThrottled').mockImplementation(() => {});
        const out = normalizeHealthWeights({ savingsRate: NaN, debtRatio: 'douze' as unknown as number });

        // Le repli fait toujours son travail — on ne casse rien, on ajoute une trace.
        expect(out.savingsRate).toBe(DEFAULT_HEALTH_WEIGHTS.savingsRate);
        expect(out.debtRatio).toBe(DEFAULT_HEALTH_WEIGHTS.debtRatio);

        // Le discriminant : sans la trace, un réglage revenu à sa valeur d'usine est INEXPLICABLE
        // pour l'utilisateur comme pour le diagnostic.
        expect(spy).toHaveBeenCalledTimes(1);
        const [, entry] = spy.mock.calls[0];
        expect(entry.source).toBe('storage');
        expect(entry.context?.champs).toEqual(['savingsRate', 'debtRatio']);
    });

    it('champ ABSENT → repli SILENCIEUX (c’est la rétrocompat, pas une corruption)', () => {
        // ⚠️ Le symétrique compte autant. Un utilisateur d'avant l'ajout de `budgetParity` /
        // `subscriptionLoad` n'a que 4 poids : journaliser son cas transformerait la rétrocompat
        // normale en avertissement permanent, et l'avertissement cesserait d'être lu.
        const spy = vi.spyOn(errorLogger, 'logErrorThrottled').mockImplementation(() => {});
        const out = normalizeHealthWeights({ savingsRate: 30, emergencyFund: 20 });
        expect(out.budgetParity).toBe(DEFAULT_HEALTH_WEIGHTS.budgetParity);
        expect(spy, 'un champ simplement absent ne doit RIEN journaliser').not.toHaveBeenCalled();
    });

    it('entrée nulle ou vide : défauts, sans bruit', () => {
        const spy = vi.spyOn(errorLogger, 'logErrorThrottled').mockImplementation(() => {});
        expect(normalizeHealthWeights(null)).toEqual(DEFAULT_HEALTH_WEIGHTS);
        expect(normalizeHealthWeights({})).toEqual(DEFAULT_HEALTH_WEIGHTS);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('[SILENT-*] les erreurs avalées laissent désormais une trace (scan de source)', () => {
    // ⚠️ Ces trois correctifs vivent dans des composants/hooks dont l'échec est un chemin réseau ou
    // navigateur — instanciables, mais au prix de mocks lourds qui testeraient surtout mes mocks.
    // Ce qui doit être VRAI est structurel : plus de `console.warn` SEUL sur ces chemins. Patron de
    // scan déjà utilisé ici (`chartPrivacyScan`, `curveFields`).
    const lire = (rel: string): string => {
        const src = readFileSync(join(__dirname, '../..', rel), 'utf-8');
        expect(src.length, `${rel} : fichier vide ou mal résolu`).toBeGreaterThan(500);
        return src;
    };

    it('[SILENT-STOCKFORM-PRICEHINT] la suggestion de prix trace ET informe l’utilisateur', () => {
        const src = lire('components/investments/AddStockForm.tsx');
        expect(src).toContain('suggestHistoricalPrice');            // on lit bien le bon chemin
        expect(src, 'l’échec de suggestion de prix reste sans trace').toContain('logError({');
        // Un log seul ne suffit pas : l'utilisateur voyait un champ vide sans explication.
        expect(src).toMatch(/setNotice\(`Impossible de récupérer le cours/);
        // Et le cas « aucun cours trouvé » (pas une erreur) est distingué de l'échec.
        expect(src).toMatch(/setNotice\(`Aucun cours trouvé/);
    });

    it('[SILENT-PWA-PROMPT] l’échec du prompt d’installation est journalisé en info', () => {
        const src = lire('hooks/usePwaInstallPrompt.ts');
        expect(src).toContain("severity: 'info'");
        expect(src, 'le catch du prompt PWA est encore muet').toContain('logError({');
        expect(src).not.toMatch(/catch \(err\) \{\s*console\.warn\('\[PWA\] prompt failed/);
    });

    it('[SYSVIEW-DBSIZE-ZERO] la taille indisponible rend « — », jamais « 0 KB »', () => {
        const src = lire('components/SystemView.tsx');
        // Le discriminant : le `catch` ne fabrique plus une valeur crédible.
        expect(src, 'un échec de sérialisation redevient un « 0 KB » crédible')
            .not.toMatch(/catch \{ return 0; \}/);
        expect(src).toMatch(/catch \{ return null; \}/);
        expect(src).toContain("dbSize === null ? '—'");
    });
});

describe('[DEAD-PARSETX-SILENT-DROP] le parseur orphelin est parti, ses voisins restent', () => {
    it('`parseTransactions` n’est plus exportée', async () => {
        const mod = await import('../../utils/transactionParser');
        expect('parseTransactions' in mod,
            'le parseur mort est de retour : il jette les lignes invalides SANS RIEN DIRE').toBe(false);
    });

    it('`markDuplicates` et `isInternalTransferLabel` sont TOUJOURS là (elles, sont appelées)', async () => {
        // ⚠️ Le vrai risque d'une suppression est d'emporter un voisin vivant. `markDuplicates` est
        // appelée par `App.tsx` ET `services/import/parseBankCsv.ts` — un test le verrouille plutôt
        // qu'une relecture.
        const mod = await import('../../utils/transactionParser');
        expect(typeof mod.markDuplicates).toBe('function');
        expect(typeof mod.isInternalTransferLabel).toBe('function');
    });

    /**
     * Retire les commentaires (`//` et `/* … *\/`) avant de scanner.
     *
     * ⚠️ Deux fois de suite mon motif a matché de la PROSE, pas du code : `parseBankCsv.ts`
     * MENTIONNE le vieux parseur dans son en-tête pour expliquer pourquoi il existe — et c'est
     * utile, l'interdire reviendrait à effacer l'historique du choix. Un `\bparseTransactions\b`
     * nu échouait dessus ; le resserrer en `\bparseTransactions\s*\(` aussi, parce que la prose
     * écrit « parseTransactions (TAB/`;` … ». Resserrer le motif ne règle pas le problème de
     * FOND : un scan qui lit les commentaires les prendra toujours pour du code. On retire donc la
     * prose une bonne fois, et le motif redevient simple.
     */
    const sansCommentaires = (src: string): string =>
        src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('aucun appelant de production ne l’IMPORTE ni ne l’APPELLE', () => {
        for (const rel of ['App.tsx', 'services/import/parseBankCsv.ts']) {
            const brut = readFileSync(join(__dirname, '../..', rel), 'utf-8');
            expect(brut.length).toBeGreaterThan(500);
            const code = sansCommentaires(brut);
            // Anti-vacuité du décommentage : il ne doit pas avoir mangé le fichier entier.
            expect(code.length, `${rel} : le retrait des commentaires a tout supprimé`)
                .toBeGreaterThan(brut.length / 4);
            expect(code).toContain('markDuplicates');   // du VRAI code a survécu
            expect(code, `${rel} référence encore parseTransactions dans du CODE`)
                .not.toMatch(/\bparseTransactions\b/);
        }
    });
});
