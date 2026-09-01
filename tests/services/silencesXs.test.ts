import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { normalizeHealthWeights, DEFAULT_HEALTH_WEIGHTS } from '../../utils/healthWeights';
import * as errorLogger from '../../services/errorLogger';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

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

/**
 * Retire les commentaires (`//` et bloc) d'une source avant de la scanner.
 *
 * ⚠️ TROIS fois dans cette seule PR mon motif a matché de la PROSE au lieu du code :
 * `parseBankCsv.ts` EXPLIQUE en en-tête le parseur qu'il remplace (deux fois), et
 * `AddStockForm.tsx` CITE dans un commentaire l'expression fautive `!history || history.length === 0`
 * pour expliquer pourquoi elle est fautive. Resserrer le motif ne règle jamais rien : un
 * commentaire peut contenir n'importe quelle forme syntaxique, c'est précisément son rôle de citer
 * du code. Le correctif est en AMONT — décommenter, puis garder le motif simple
 * (`SCAN-QUI-MATCHE-LA-PROSE`).
 *
 * ⚠️ `[GUARD-STRIPCOMMENTS-DUPLIQUE]` (lot 52) : la copie locale — qui décapitait `https://…` d'un
 * caractère et coupait toute chaîne contenant `//` — cède la place à la SOURCE UNIQUE, seule à
 * connaître les littéraux de chaîne, les gabarits et les littéraux d'expression régulière.
 *
 * ⚠️ ET SA SÉMANTIQUE DIFFÈRE : la source unique BLANCHIT (chaque caractère de commentaire devient
 * une espace) au lieu de supprimer, pour préserver lignes et colonnes. Toute anti-vacuité fondée sur
 * la LONGUEUR devient donc TAUTOLOGIQUE — le résultat a la même longueur que la source, par
 * construction. Les deux de ce fichier comptent désormais les caractères NON BLANCS. Mesuré : sur un
 * décommenteur qui mangerait tout le fichier, la version « longueur » reste VERTE.
 */
const sansCommentaires = (src: string): string => stripComments(src);


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

    /** Source SANS ses commentaires — pour toute assertion d'ABSENCE (`not.toMatch`), qu'un
     *  commentaire citant le motif fautif rendrait rouge à tort. Les assertions de PRÉSENCE qui
     *  visent un commentaire (une leçon citée sur place) lisent `lire`, pas `lireCode`. */
    const lireCode = (rel: string): string => {
        const brut = lire(rel);
        const code = sansCommentaires(brut);
        // ⚠️ PAS `code.length` : le décommenteur blanchit, donc la longueur est INCHANGÉE et
        // l'assertion serait vraie quoi qu'il arrive.
        expect(partDeCodeRestante(brut, code), `${rel} : le décommentage a tout supprimé`)
            .toBeGreaterThan(0.05);
        return code;
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

    it('[SILENT-STOCKFORM-PRICEHINT] `null` (erreur) et `[]` (vide) ne sont PAS confondus', () => {
        // ⚠️ Le défaut que cette garde verrouille est celui que mon premier correctif AVAIT :
        // `if (!history || history.length === 0)` aplatit `null` dans `[]`. Or le contrat de
        // `getHistory` (façade `services/marketData/index.ts`) dit l'inverse — `[]` = vide VALIDE,
        // `null` = ERREUR — et INTERDIT explicitement l'aplatissement. Conséquence : la panne
        // réseau s'affichait « aucun cours trouvé », c'est-à-dire une affirmation FAUSSE sur le
        // titre, et le `catch` prévu pour ça ne se déclenchait jamais.
        const code = lireCode('components/investments/AddStockForm.tsx');
        expect(code, 'null est de nouveau aplati dans le cas « vide »')
            .not.toMatch(/if \(!history \|\| history\.length === 0\)/);
        expect(code, 'le cas ERREUR (null) doit être testé pour lui-même')
            .toMatch(/if \(history === null\) \{/);
        expect(code, 'le cas VIDE doit rester distinct et SANS logError')
            .toMatch(/if \(history\.length === 0\) \{/);
        // Le contrat des deux sœurs est cité sur place — assertion de PRÉSENCE dans un COMMENTAIRE,
        // donc sur la source BRUTE. C'est le seul cas où lire la prose est voulu.
        expect(lire('components/investments/AddStockForm.tsx'))
            .toContain('PATRON-COPIE-AVEC-SON-CONTRAT-D-ERREUR');
    });

    it('[SILENT-STOCKFORM-PRICEHINT] une nouvelle tentative efface la notice précédente', () => {
        // Sans ça : « Aucun cours trouvé » posé sur une date sans séance SURVIT à une seconde
        // tentative RÉUSSIE sur une autre date — le message contredit alors le prix affiché.
        const src = lire('components/investments/AddStockForm.tsx');
        expect(src, 'suggestHistoricalPrice ne repart plus d’un état de notice propre')
            .toMatch(/setIsSuggestingPrice\(true\);[\s\S]{0,260}?setNotice\(null\);/);
    });

    it('[SILENT-PWA-PROMPT] l’échec du prompt d’installation est journalisé en info', () => {
        const src = lire('hooks/usePwaInstallPrompt.ts');
        expect(src).toContain("severity: 'info'");
        expect(src, 'le catch du prompt PWA est encore muet').toContain('logError({');
        expect(src).not.toMatch(/catch \(err\) \{\s*console\.warn\('\[PWA\] prompt failed/);
    });

    it('[VOISIN] `validateSymbol` trace aussi — le patron ne s’arrête pas au ticket', () => {
        // ⚠️ `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`. Trouvé par revue : à 60 lignes du correctif de
        // suggestion de prix, le `catch` de `validateSymbol` faisait `console.error` SEUL. Visible
        // dans la console du navigateur, mais absent de l'écran Système : ni exportable, ni compté
        // dans les stats 24 h. Une garde qui manque là où le voisin immédiat en a une est un signal
        // BIEN plus fort qu'une absence isolée — le risque était connu, traité une fois, sauté ici.
        const src = lire('components/investments/AddStockForm.tsx');
        expect(lireCode('components/investments/AddStockForm.tsx'),
            'le catch de validateSymbol est revenu au console.error seul')
            .not.toMatch(/console\.error\('\[AddStockForm\] validate failed/);
        expect(src).toMatch(/message: 'Validation de ticker ÉCHOUÉE/);
    });

    it('[VOISIN] l’écriture du refus PWA trace, la LECTURE reste muette', () => {
        // Le discriminant est l'ASYMÉTRIE, pas la présence d'un log :
        // `isRecentlyDismissed` (LECTURE) doit rester silencieux — une clé absente est le chemin
        // nominal. `memoriserRefus` (ÉCRITURE) doit tracer — l'utilisateur a cliqué « fermer », il
        // croit la bannière congédiée, et elle revient sans explication.
        const src = lire('hooks/usePwaInstallPrompt.ts');
        expect(src, 'un catch d’écriture localStorage est redevenu muet').not.toContain('/* quota */');
        expect(src).toContain('function memoriserRefus');
        expect(src).toMatch(/message: 'Refus de l’invite PWA non mémorisé/);
        // Les deux sites d'écriture passent par le helper — aucun `setItem` nu ne subsiste.
        const setItemsNus = src.match(/localStorage\.setItem\(DISMISSED_KEY/g) ?? [];
        expect(setItemsNus, 'le refus doit s’écrire par `memoriserRefus`, une seule fois')
            .toHaveLength(1);
        // Et la lecture, elle, garde son `catch` NU : le tracer crierait à chaque chargement.
        expect(src).toMatch(/const raw = localStorage\.getItem\(DISMISSED_KEY\);[\s\S]{0,220}?\} catch \{\n\s*return false;/);
    });

    it('[SYSVIEW-DBSIZE-ZERO] la taille indisponible rend « — », jamais « 0 KB »', () => {
        const src = lire('components/SystemView.tsx');
        // Le discriminant : le `catch` ne fabrique plus une valeur crédible.
        expect(sansCommentaires(src), 'un échec de sérialisation redevient un « 0 KB » crédible')
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


    it('aucun fichier de production du DÉPÔT ne l’IMPORTE ni ne l’APPELLE', () => {
        // ⚠️ Relevé en revue : scanner deux fichiers EN DUR ne prouve rien sur le dépôt. Une
        // réintroduction dans un fichier NEUF (un composant d'import, un script) passerait sous la
        // garde — et c'est le scénario le plus probable, puisque la fonction supprimée était un
        // parseur « pratique » qu'on est tenté de recopier. On balaie donc par glob.
        // ⚠️ PAS `globSync` de `node:fs` : il n'existe qu'à partir de Node 22, et la CI tourne sur
        // Node 20 — le gate LOCAL (Node 22) était vert pendant que la CI cassait. Le dépôt a déjà
        // son marcheur, `readdirSync(dir, { recursive: true })` (Node 18.17+), dans
        // `tests/fiscalConstants.guard.test.ts` : on le réutilise tel quel plutôt que d'en inventer
        // un (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`).
        const racine = join(__dirname, '../..');
        const estSource = (f: string): boolean => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f);
        const fichiers = ['App.tsx', 'index.tsx', 'constants.ts', 'types.ts', 'i18n.ts'];
        for (const dir of ['components', 'services', 'hooks', 'utils', 'store', 'mcp', 'scripts']) {
            for (const entree of readdirSync(join(racine, dir), { recursive: true })) {
                const rel = `${dir}/${entree.toString().split(sep).join('/')}`;
                if (estSource(rel)) fichiers.push(rel);
            }
        }

        // Anti-vacuité du GLOB lui-même : un motif qui ne matche rien rendrait le test vert pour la
        // pire des raisons. On exige le dépôt réel, et la présence des deux fichiers historiquement
        // concernés (ceux que la version précédente de cette garde citait en dur).
        expect(fichiers.length, 'le glob ne balaie rien — garde désarmée').toBeGreaterThan(200);
        expect(fichiers).toContain('App.tsx');
        expect(fichiers).toContain('services/import/parseBankCsv.ts');

        // ⚠️ L'anti-vacuité du décommentage est AGRÉGÉE, pas par fichier. Une règle par fichier
        // (« il reste au moins un quart de la source ») est FAUSSE à l'échelle d'un dépôt :
        // `services/tax.ts` est un alias de 289 octets dont 4 lignes sur 5 sont un commentaire —
        // légitimement 88 % de prose. Mesuré : la règle par fichier le déclarait « tout supprimé ».
        // Un DÉPÔT, lui, ne peut pas être majoritairement composé de commentaires : c'est ça qu'on
        // asserte, plus la survie de jetons de code CONNUS.
        let brutTotal = 0;
        let codeTotal = 0;
        let avecMarkDuplicates = 0;
        for (const rel of fichiers) {
            const brut = readFileSync(join(racine, rel), 'utf-8');
            const code = sansCommentaires(brut);
            // ⚠️ Caractères NON BLANCS des deux côtés : comparer des LONGUEURS donnerait un ratio de
            // 1,0000 en toutes circonstances — une anti-vacuité qui ne peut plus rougir est pire que
            // pas d'anti-vacuité du tout.
            brutTotal += brut.replace(/\s/g, '').length;
            codeTotal += code.replace(/\s/g, '').length;
            if (code.includes('markDuplicates')) avecMarkDuplicates++;
            expect(code, `${rel} référence parseTransactions dans du CODE`)
                .not.toMatch(/\bparseTransactions\b/);
        }
        expect(codeTotal / brutTotal, 'le décommenteur a mangé le dépôt — garde vacueuse')
            .toBeGreaterThan(0.5);
        // Et du VRAI code a survécu, sur les deux sites attendus (`App.tsx`, `parseBankCsv.ts`).
        expect(avecMarkDuplicates, 'markDuplicates a disparu — le décommenteur mange du code')
            .toBeGreaterThanOrEqual(2);
    });
});
