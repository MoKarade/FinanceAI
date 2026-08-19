// services/startingCash.ts
//
// [CASH-NAN-SILENT] SOURCE UNIQUE du cash dérivé — audit de santé 2026-08-19.
//
// Le cash n'est pas un champ du store : il est DÉRIVÉ (Σ soldes initiaux + Σ transactions hors
// doublons/transferts). Cette formule était RECOPIÉE à trois endroits, et les trois faisaient
// `Number(v) || 0` **sans aucune trace** :
//   · `hooks/useSimulationParams.ts`      (celle que consomme ProjectionEngine → TOUTE la projection)
//   · `services/portfolio.ts`             (`computeCurrentLiquidity` → Dashboard, snapshot IA)
//   · `services/projection/buildSimulationParams.ts` (`computeStartingCash` → loader MCP)
//
// Pourquoi c'était grave : le patron `HARDEN-*-NAN` — créé après l'incident réel « −193 k$ » du
// 2026-06-16 — est appliqué à `assetValueCad` (65 lignes plus haut dans `portfolio.ts` !) et à
// `computeRawNetWorth`, mais PAS ici. Or c'est le POINT D'ENTRÉE : si le cash de départ est faux,
// tout ce que la projection en dérive l'est aussi, en silence.
//
// Le chemin d'atteinte est réel, pas théorique : `components/settings/BackupPanel.tsx` valide les
// backups restaurés avec `transactions: z.array(z.object({}).passthrough())` — le champ `amount`
// n'y est PAS typé (contrairement à `initialBalances: z.record(z.string(), z.number())` qui l'est),
// et le store recharge ensuite par `JSON.parse` brut sans re-validation. Un montant corrompu
// devient donc un `0 $` parfaitement crédible à la racine de la projection.
//
// ⚠️ Le comportement NUMÉRIQUE est inchangé (un terme non fini vaut toujours 0 dans la somme) :
// c'est la TRACE qui manquait. Un `0 $` crédible sans trace est pire qu'une erreur bruyante.
import type { Transaction } from '../types';
import { logErrorThrottled } from './errorLogger';

/** Un terme non fini écarté de la somme, avec de quoi le retrouver dans les données. */
interface TermeFautif {
    /** `initialBalances` (clé de compte) ou `transaction` (id). */
    origine: 'initialBalances' | 'transaction';
    cle: string;
    valeur: unknown;
}

export interface CashLedgerResult {
    /** Le cash dérivé. Identique à l'ancienne formule, à la trace près. */
    cash: number;
    /** Termes non finis écartés. Vide dans le cas SAIN (la quasi-totalité du temps). */
    termesFautifs: TermeFautif[];
}

/**
 * Cash dérivé + inventaire des termes non finis écartés.
 *
 * Exposé séparément de `computeCashLedger` pour que les appelants qui VEULENT afficher la
 * dégradation (un bandeau « des montants de ton historique sont illisibles ») puissent le faire
 * sans re-parcourir les données. Ne journalise rien — c'est le rôle de `computeCashLedger`.
 */
export function computeCashLedgerDetailed(
    initialBalances: Record<string, number> | null | undefined,
    transactions: readonly Transaction[] | null | undefined,
): CashLedgerResult {
    let cash = 0;
    const termesFautifs: TermeFautif[] = [];

    for (const [cle, brut] of Object.entries(initialBalances ?? {})) {
        const v = Number(brut);
        if (Number.isFinite(v)) cash += v;
        else termesFautifs.push({ origine: 'initialBalances', cle, valeur: brut });
    }

    for (const t of transactions ?? []) {
        // Même base d'exclusion que TOUTE la reconstruction du passé (`reconstructCashHistory`,
        // `dailyPastLedger`, `dayTransactions`) : un doublon ou un transfert ne bouge pas le solde.
        // Diverger ici ferait diverger les deux bouts de la courbe (classe PH4D).
        if (t.isDuplicate || t.isTransfer) continue;
        const v = Number(t.amount);
        if (Number.isFinite(v)) cash += v;
        else termesFautifs.push({ origine: 'transaction', cle: String(t.id ?? '?'), valeur: t.amount });
    }

    return { cash, termesFautifs };
}

/**
 * Cash dérivé, avec journalisation des termes non finis écartés.
 *
 * ⚠️ Throttlé par SIGNATURE (comme `computeRawNetWorth`) : ce calcul est appelé à chaque rendu de
 * plusieurs surfaces et à chaque construction de paramètres de simulation. Sur un état
 * durablement corrompu, journaliser à chaque appel noierait le journal — et le journal noyé ne
 * sert plus à rien. Une entrée par motif distinct de corruption : signal maximal, zéro flood.
 */
export function computeCashLedger(
    initialBalances: Record<string, number> | null | undefined,
    transactions: readonly Transaction[] | null | undefined,
): number {
    const { cash, termesFautifs } = computeCashLedgerDetailed(initialBalances, transactions);
    if (termesFautifs.length > 0) {
        const signature = termesFautifs.map((t) => `${t.origine}:${t.cle}`).sort().join(',');
        logErrorThrottled(`cash-ledger-nonfinite:${signature}`, {
            source: 'projection',
            severity: 'warning',
            message: `Cash dérivé : ${termesFautifs.length} terme(s) non fini(s) écarté(s) de la somme`,
            context: { termesFautifs: termesFautifs.slice(0, 20), total: termesFautifs.length },
        });
    }
    return cash;
}
