import React from 'react';
import { formatCAD } from '../../../utils/format';
import { PrivateAmount } from '../../ui/PrivateAmount';
import { PrivateText } from '../../ui/PrivateText';
import type { transactionsOnDay } from '../../../services/history/dayTransactions';
import { detailsTransaction } from './detailsTransaction';

/**
 * [GODFILE-FUTUREDETAILMODAL] Section « Transactions du jour » (comptées + barrées, ou le zéro
 * MESURÉ dit en toutes lettres), extraite telle quelle de FutureDetailModal.tsx (lot 154).
 * La CONDITION d'existence (`dayIso && transactions`) reste chez le parent, avec les deux
 * commentaires qui la justifient ([PASSE-REEL-TXN-DU-JOUR] / no-fake-data).
 */
export const SectionTransactionsDuJour: React.FC<{
    dayIso: string;
    txnsDuJour: ReturnType<typeof transactionsOnDay>;
    userName1?: string;
    userName2?: string;
}> = ({ dayIso, txnsDuJour, userName1, userName2 }) => {
    const fmt = (n: number) => formatCAD(n);
    return (
                            <div className="border-t border-white/10 pt-3">
                        {(txnsDuJour.counted.length > 0 || txnsDuJour.excluded.length > 0) ? (
                            <>
                                <div className="flex items-baseline justify-between gap-2 mb-2">
                                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold">
                                        Transactions du {dayIso}
                                        <span className="ml-1.5 normal-case tracking-normal text-ink-400/80 font-normal">
                                            — net encaissé/décaissé
                                        </span>
                                    </div>
                                    <PrivateAmount className={`font-mono text-meta ${txnsDuJour.netCounted >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                        {txnsDuJour.netCounted > 0 ? '+' : ''}{fmt(txnsDuJour.netCounted)}
                                    </PrivateAmount>
                                </div>
                                <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">
                                    <table className="w-full text-meta">
                                        <caption className="sr-only">
                                            Transactions du {dayIso}. Les lignes marquées sont exclues du calcul de la courbe.
                                        </caption>
                                        <thead className="sticky top-0 bg-dark">
                                            <tr className="text-tiny uppercase tracking-wide text-ink-400">
                                                <th scope="col" className="text-left font-bold px-2.5 py-1.5">Marchand</th>
                                                <th scope="col" className="text-left font-bold px-2.5 py-1.5">Catégorie</th>
                                                <th scope="col" className="text-right font-bold px-2.5 py-1.5">Montant</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {txnsDuJour.counted.map((t) => (
                                                <tr key={`c-${t.id}`} className="border-t border-white/5">
                                                    <td className="px-2.5 py-1.5 text-ink-100 align-top">
                                                        <PrivateText>{t.payee}</PrivateText>
                                                        {t.accountName && <span className="text-tiny text-ink-400"> · {t.accountName}</span>}
                                                        {(() => {
                                                            const d = detailsTransaction(t, userName1, userName2);
                                                            if (d.length === 0) return null;
                                                            return (
                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                    {d.map((x, i) => (
                                                                        <span
                                                                            key={i}
                                                                            className={`text-tiny px-1.5 py-px rounded border ${x.ton === 'attention'
                                                                                ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
                                                                                : 'text-ink-300 border-white/10 bg-white/5'}`}
                                                                        >
                                                                            {x.texte}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-2.5 py-1.5 text-ink-400"><PrivateText quoi="categorie">{t.category}</PrivateText></td>
                                                    <td className={`px-2.5 py-1.5 text-right font-mono ${t.amount >= 0 ? 'text-green-300' : 'text-ink-200'}`}>
                                                        <PrivateAmount>{fmt(t.amount)}</PrivateAmount>
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Montrées mais BARRÉES : la liste doit correspondre au relevé bancaire,
                                                pendant que le total reste celui des seules transactions comptées.
                                                Masquer ces lignes trahirait la première promesse, les compter la seconde.
                                                ⚠️ PAS d'`opacity-60` sur ces lignes : `text-ink-300`/`text-ink-400` sont
                                                DÉJÀ des shades atténués, tout juste AA à pleine opacité — les composer
                                                avec une opacité tombait sous le seuil (~3,0-3,4:1, mesuré par la revue),
                                                précisément sur la ligne qui EXPLIQUE pourquoi elle ne compte pas.
                                                ⚠️ `npm run check-contrast` ne l'aurait PAS vu : scan statique
                                                token-vs-token, aveugle aux classes `opacity-*`. Le `line-through` suffit
                                                à dire « exclu » ; l'atténuation porte sur le FOND, qui n'a pas de texte. */}
                                            {txnsDuJour.excluded.map(({ txn, reason }) => (
                                                <tr key={`e-${txn.id}`} className="border-t border-white/5 bg-white/[0.02]">
                                                    <td className="px-2.5 py-1.5 text-ink-300 align-top">
                                                        <span className="line-through"><PrivateText>{txn.payee}</PrivateText></span>
                                                        {txn.accountName && <span className="text-tiny text-ink-400"> · {txn.accountName}</span>}
                                                        <span className="text-tiny text-amber-300"> · {reason}</span>
                                                        {(() => {
                                                            const d = detailsTransaction(txn, userName1, userName2);
                                                            if (d.length === 0) return null;
                                                            return (
                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                    {d.map((x, i) => (
                                                                        <span
                                                                            key={i}
                                                                            className={`text-tiny px-1.5 py-px rounded border ${x.ton === 'attention'
                                                                                ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
                                                                                : 'text-ink-300 border-white/10 bg-white/5'}`}
                                                                        >
                                                                            {x.texte}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-2.5 py-1.5 text-ink-400"><PrivateText quoi="categorie">{txn.category}</PrivateText></td>
                                                    <td className="px-2.5 py-1.5 text-right font-mono text-ink-400 line-through">
                                                        <PrivateAmount>{fmt(txn.amount)}</PrivateAmount>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {txnsDuJour.excluded.length > 0 && (
                                    <p className="text-tiny text-ink-400 mt-1.5 leading-snug">
                                        Les lignes barrées apparaissent sur ton relevé mais ne bougent pas la courbe :
                                        un doublon est un artefact d'import, un virement interne déplace l'argent sans
                                        le faire entrer ni sortir de ton patrimoine.
                                    </p>
                                )}
                            </>
                        ) : (
                            /* Le jour est identifié et RIEN n'y a bougé : on le DIT. Sans cette
                               branche, l'écran était muet — et un écran muet se lit « c'est
                               cassé », pas « il n'y a rien ». */
                            <p className="text-tiny text-ink-400 leading-snug">
                                <span className="uppercase tracking-widest text-ink-400 font-bold">
                                    Transactions du {dayIso}
                                </span>
                                {' — '}aucun mouvement ce jour-là. La courbe peut malgré tout bouger : le rendement
                                de tes placements et l'équité immobilière n'ont pas de transaction associée.
                            </p>
                        )}
                            </div>
    );
};
