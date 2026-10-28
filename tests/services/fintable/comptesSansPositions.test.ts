// tests/services/fintable/comptesSansPositions.test.ts
//
// [FINTABLE-INVESTMENTS-MUET] La cause d'un écran de placements VIDE arrive enfin jusqu'à l'écran.
//
// ⚠️ Demande Marc 2026-08-17. Le recensement (lot 98) a corrigé le diagnostic du ticket : il ne
// manquait PAS un traitement de codes d'erreur Plaid — la cause était déjà mesurée par
// `readFintableSnapshot` (`holdingsSkipped`), et son seul consommateur était un script CLI de
// développement. Classée puis JETÉE avant l'écran
// (`UNE-CAUSE-CLASSEE-PUIS-JETEE-EST-UNE-CAUSE-ABSENTE`).
//
// Ce que ces gardes défendent :
//   1. les DEUX chemins de sync remplissent le champ — c'est le même oubli qu'ils partageaient ;
//   2. le libellé humain voyage avec l'identifiant (un `accountId` seul n'explique rien) ;
//   3. rien n'est ajouté au rapport quand il n'y a rien à signaler (pas de bruit persisté) ;
//   4. l'écran ÉNUMÈRE la cause au lieu de la compter, et n'affiche AUCUN montant.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { comptesSansPositionsDuSnapshot } from '../../../services/fintable/comptesSansPositions';
import { stripCommentsJsx, partDeCodeRestante } from '../../../utils/stripComments';
import type { FintableAccount, FintableSnapshot } from '../../../services/fintable/types';

const compte = (id: string, label: string): FintableAccount =>
    ({ id, label } as FintableAccount);

const snap = (
    accounts: FintableAccount[],
    holdingsSkipped: FintableSnapshot['holdingsSkipped'],
): Pick<FintableSnapshot, 'accounts' | 'holdingsSkipped'> => ({ accounts, holdingsSkipped });

describe('[FINTABLE-INVESTMENTS-MUET] la cause devient nommable', () => {
    it('le LIBELLÉ humain voyage avec l\'identifiant', () => {
        // Un `accountId` seul (« acc_7f3a… ») n'apprend rien à Marc : il ne peut pas savoir DE QUEL
        // compte on parle, donc pas décider quoi reconnecter chez Fintable.
        const r = comptesSansPositionsDuSnapshot(snap(
            [compte('acc_1', 'Disnat REER'), compte('acc_2', 'Wealthsimple CELI')],
            [{ accountId: 'acc_1', reason: 'positions non fournies par l\'institution' }],
        ));
        expect(r).toEqual([{
            accountId: 'acc_1',
            label: 'Disnat REER',
            reason: 'positions non fournies par l\'institution',
        }]);
    });

    it('un compte INCONNU reste NOMMABLE — on ne tait pas la ligne', () => {
        // Un compte disparu de la liste entre deux lectures garde son identifiant en repli. Taire la
        // ligne ferait perdre la seule information qui explique l'écran vide.
        const r = comptesSansPositionsDuSnapshot(snap([], [{ accountId: 'acc_9', reason: 'timeout' }]));
        expect(r).toEqual([{ accountId: 'acc_9', label: 'acc_9', reason: 'timeout' }]);
    });

    it('rien à signaler ⇒ `undefined`, jamais un tableau vide', () => {
        // `[]` et absent se lisent pareil à l'écran, mais `undefined` garde le rapport persisté
        // IDENTIQUE à celui d'avant ce lot dans le cas nominal : aucun bruit pour dire « rien ».
        expect(comptesSansPositionsDuSnapshot(snap([compte('a', 'A')], []))).toBeUndefined();
        expect(comptesSansPositionsDuSnapshot(
            snap([compte('a', 'A')], undefined as unknown as FintableSnapshot['holdingsSkipped']),
        )).toBeUndefined();
    });

    it('TOUS les comptes sautés remontent, pas seulement le premier', () => {
        const r = comptesSansPositionsDuSnapshot(snap(
            [compte('a', 'A'), compte('b', 'B')],
            [{ accountId: 'a', reason: 'r1' }, { accountId: 'b', reason: 'r2' }],
        ));
        expect(r).toHaveLength(2);
        expect(r?.map(x => x.label)).toEqual(['A', 'B']);
    });
});

describe('[FINTABLE-INVESTMENTS-MUET] les DEUX chemins de sync le remplissent', () => {
    // ⚠️ C'est le cœur du lot. Les deux chemins composaient déjà leurs `warnings` à l'identique et
    // avaient oublié `holdingsSkipped` TOUS LES DEUX, de la même façon. Une garde qui n'en couvrirait
    // qu'un laisserait l'autre muet — et c'est justement le chemin serveur que personne ne regarde.
    const lit = (p: string): string => stripCommentsJsx(readFileSync(p, 'utf8'));

    // ⚠️ Seuils d'anti-vacuité MESURÉS par fichier, jamais copiés d'une autre garde. Le 0,5
    // canonique des scans de DÉPÔT (agrégé sur des centaines de fichiers) déclarerait vides les
    // TROIS fichiers de ce lot — ils sont majoritairement de la PROSE par conception. Mesuré le
    // 2026-09-03 : `browserSync.ts` 0,358 · `runFintableSync.ts` 0,459 · `FintableSyncCard.tsx`
    // 0,634. C'est la troisième fois que ce seuil se re-mesure au lieu de se recopier
    // (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`).
    const PART_CODE_MIN: Readonly<Record<string, number>> = {
        'services/fintable/browserSync.ts': 0.30,
        'mcp/runFintableSync.ts': 0.40,
        'components/settings/FintableSyncCard.tsx': 0.55,
    };

    for (const chemin of ['services/fintable/browserSync.ts', 'mcp/runFintableSync.ts']) {
        it(`${chemin} verse le champ dans son rapport`, () => {
            const code = lit(chemin);
            expect(partDeCodeRestante(readFileSync(chemin, 'utf8'), code)).toBeGreaterThan(PART_CODE_MIN[chemin]);
            // Ancré sur l'APPEL avec son argument, jamais sur le nom seul : l'import le porte aussi
            // (`SCAN-QUI-MATCHE-LA-DECLARATION-AU-LIEU-DE-L-USAGE`, re-payé au lot 96).
            expect(code).toContain('comptesSansPositions: comptesSansPositionsDuSnapshot(snapshot)');
        });
    }

    it('les deux chemins partagent la MÊME source, ils ne la recopient pas', () => {
        // Deux recopies auraient rendu le prochain oubli certain — c'est exactement ce qui vient
        // d'arriver avec `holdingsSkipped`.
        for (const chemin of ['services/fintable/browserSync.ts', 'mcp/runFintableSync.ts']) {
            expect(lit(chemin)).toContain('comptesSansPositions');
            expect(lit(chemin)).toMatch(/import \{ comptesSansPositionsDuSnapshot \}/);
        }
    });
});

describe('[FINTABLE-INVESTMENTS-MUET] l\'écran ÉNUMÈRE la cause, il ne la compte pas', () => {
    const brut = readFileSync('components/settings/FintableSyncCard.tsx', 'utf8');
    const code = stripCommentsJsx(brut);

    it('la carte rend la LISTE, avec le libellé et la raison de chaque compte', () => {
        // Seuil mesuré à la portée de CE fichier (0,634 le 2026-09-03), pas copié.
        expect(partDeCodeRestante(brut, code)).toBeGreaterThan(0.55);
        expect(code).toContain('report.comptesSansPositions'); // témoin : le champ est bien lu
        expect(code).toMatch(/comptesSansPositions!\.map/);     // ... et ÉNUMÉRÉ
        expect(code).toContain('{c.label}');
        expect(code).toContain('{c.reason}');
    });

    it('AUCUN montant n\'est affiché à côté — surtout pas un 0 $', () => {
        // Un « 0 $ » y serait crédible et FAUX : le solde total peut exister, c'est le DÉTAIL qui
        // manque. Le no-fake-data interdit le chiffre plausible à la place d'une mesure absente.
        const bloc = code.slice(code.indexOf('comptesSansPositions'), code.indexOf('Détail complet'));
        expect(bloc.length, 'anti-vacuité : le bloc doit exister').toBeGreaterThan(200);
        expect(bloc).not.toMatch(/formatCAD|PrivateAmount|\$/);
    });

    it('le message dit que la réparation est AILLEURS, et ne promet pas de guérison', () => {
        // « réessaie plus tard » serait une affirmation sur l'AVENIR, fausse pour les institutions
        // dont Fintable ne rend JAMAIS les positions
        // (`UN-MESSAGE-QUI-PROMET-UNE-RESOLUTION-AUTOMATIQUE-EST-UNE-AFFIRMATION-SUR-L-AVENIR`).
        const bloc = code.slice(code.indexOf('comptesSansPositions'), code.indexOf('Détail complet'));
        expect(bloc).toMatch(/Fintable/);
        expect(bloc).toMatch(/pas dans cette app|pas dans l'app/);
        expect(bloc).toMatch(/jamais fournies|ne sont jamais/);
        expect(bloc).not.toMatch(/réessaie|prochain essai|automatiquement/i);
    });
});
