/**
 * @vitest-environment jsdom
 *
 * [TX-EXCLUES-INTROUVABLES] — Marc, le 2026-09-15 : « je vois plus aucune transactions du bresil ».
 *
 * Il venait d'exclure des calculs ses 44 lignes du voyage, comme je le lui avais demandé. RIEN
 * n'était perdu — `markTransactionsAsDuplicate` est PUR et ne fait que poser un drapeau — mais
 * `showDuplicates` est un état de COMPOSANT (`useState(false)`), donc remis à faux à chaque
 * montage, et son SEUL `setShowDuplicates(true)` vivait dans `handleMarkDuplicates`. Mesuré sur le
 * code d'avant : `setShowDuplicates` n'apparaissait que DEUX fois dans le fichier — sa déclaration
 * et cet appel. Au rechargement, les lignes exclues étaient donc invisibles ET irrécupérables
 * depuis la liste ; le seul recours était « Annuler tous les marquages », qui DÉFAIT le travail
 * au lieu de le montrer.
 *
 * Ce que ces gardes verrouillent : un écran qui masque doit DIRE ce qu'il masque, et tout état de
 * filtrage doit avoir un contrôle qui le rallume (classe `UX-UNREACHABLE-FEATURE`).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import type { Transaction } from '../../types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const SOURCE = resolve(__dirname, '../../components/Transactions.tsx');

describe('[TX-EXCLUES-INTROUVABLES] les transactions exclues restent atteignables', () => {
    it('le contrôle qui RALLUME l\'affichage existe, en plus de celui qui l\'allume au marquage', () => {
        const brut = readFileSync(SOURCE, 'utf8');
        const code = stripCommentsJsx(brut);

        // Anti-vacuité du décommentage : ce fichier porte de longs commentaires, et une assertion
        // de COMPTE sur du source doit lire le code SEUL (`SCAN-QUI-MATCHE-LA-PROSE` — le jeton
        // `setShowDuplicates` est justement cité dans le commentaire du correctif).
        expect(code.replace(/\s/g, '').length).toBeGreaterThan(5000);
        expect(code).toContain('const [showDuplicates, setShowDuplicates]');

        // 3 sites de CODE : la déclaration, l'ouverture au marquage, et la BASCULE de la liste.
        // Le code d'avant en avait 2 — c'est le troisième qui manquait, et son absence est
        // exactement ce que Marc a vécu.
        const sites = code.match(/setShowDuplicates/g) ?? [];
        expect(sites.length).toBeGreaterThanOrEqual(3);

        // …et ce troisième site est bien une BASCULE, pas un second `(true)` : sans ça, une fois
        // affichées, les exclues ne pourraient plus être masquées.
        expect(code).toMatch(/setShowDuplicates\(\s*p\s*=>\s*!p\s*\)/);
    });

    it('le COMPTE des exclues est annoncé dans la liste, pas seulement dans le panneau Doublons', () => {
        const code = stripCommentsJsx(readFileSync(SOURCE, 'utf8'));

        // Le panneau « Doublons » recevait déjà `markedCount`, mais il est REPLIÉ par défaut :
        // le compte n'atteignait pas quelqu'un qui regarde sa liste. Il doit être rendu là où le
        // masquage a lieu, et sa condition doit être « il y a au moins une exclusion ».
        expect(code).toMatch(/markedDuplicateCount\s*>\s*0\s*&&/);
        expect(code).toMatch(/\{markedDuplicateCount\}\s*exclue/);
    });

    it('le libellé nomme l\'ACTION disponible, dans les deux sens', () => {
        const code = stripCommentsJsx(readFileSync(SOURCE, 'utf8'));
        // « 44 exclues » seul décrit un état sans dire qu'on peut y faire quelque chose — c'est la
        // moitié du défaut (l'autre étant l'absence de contrôle). Le libellé porte donc le verbe,
        // et il change avec l'état plutôt que d'affirmer une seule direction.
        expect(code).toMatch(/showDuplicates\s*\?\s*'masquer'\s*:\s*'afficher'/);
        expect(code).toMatch(/aria-pressed=\{showDuplicates\}/);
    });
});

describe('[TX-EXCLUES-INTROUVABLES] au REMONTAGE — le cas exact vécu par Marc', () => {
    // C'est la garde qui compte : les trois scans ci-dessus prouvent la présence de jetons, jamais
    // qu'un geste ramène les lignes. Ici on monte l'écran avec une transaction DÉJÀ exclue — donc
    // `showDuplicates` repart à `false`, exactement comme après un rechargement de page.
    const TXS: Transaction[] = [
        { id: 1, date: '2026-09-08', payee: 'Farm Ipanema', amount: -120.99, category: 'Magasinage', status: 'processed', isDuplicate: true },
        { id: 2, date: '2026-09-09', payee: 'Metro Ferland', amount: -42.5, category: 'Épicerie', status: 'processed' },
    ];

    function monter() {
        return render(
            <Transactions transactions={TXS} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />,
        );
    }

    it('la ligne exclue est masquée, MAIS l\'écran dit combien il en masque et sait les rappeler', () => {
        const { container } = monter();
        const table = () => container.querySelector('table') as HTMLElement;

        // 1. Le masquage lui-même est le comportement voulu — on ne le retire pas.
        expect(within(table()).queryByText('Farm Ipanema')).toBeNull();
        // Témoin : l'écran n'est pas vide pour une autre raison (fixture cassée, rendu absent…).
        expect(within(table()).getByText('Metro Ferland')).toBeTruthy();

        // 2. …mais il DIT ce qu'il masque. Sans ça, « plus aucune transaction du Brésil » est
        //    indiscernable d'une perte de données — c'est ce que Marc a vécu.
        const bascule = within(container).getByRole('button', { name: /1 exclue/ });
        expect(bascule.getAttribute('aria-pressed')).toBe('false');

        // 3. …et le geste la RAMÈNE. C'est le chaînon qui n'existait pas : avant ce lot, le seul
        //    recours était « Annuler tous les marquages », qui défait le travail au lieu de le montrer.
        fireEvent.click(bascule);
        expect(within(table()).getByText('Farm Ipanema')).toBeTruthy();
        expect(within(container).getByRole('button', { name: /1 exclue/ }).getAttribute('aria-pressed')).toBe('true');

        // 4. La bascule va dans les DEUX sens — un bouton qui n'allume que dans un sens
        //    recrée la trappe un cran plus loin.
        fireEvent.click(within(container).getByRole('button', { name: /1 exclue/ }));
        expect(within(table()).queryByText('Farm Ipanema')).toBeNull();
    });

    it('ANTI-VACUITÉ : sans aucune exclusion, aucun compte n\'est annoncé', () => {
        // Sans ce cas, un bouton rendu en PERMANENCE passerait le test ci-dessus — et un écran qui
        // annonce « 0 exclue » sur un état sain est du bruit qui apprend à être ignoré.
        const { container } = render(
            <Transactions transactions={[TXS[1]]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />,
        );
        expect(within(container).queryByRole('button', { name: /exclue/ })).toBeNull();
    });
});
