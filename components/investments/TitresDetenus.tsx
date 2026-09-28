// components/investments/TitresDetenus.tsx
//
// [S5-REFONTE-PLACEMENTS] Les titres détenus (maquettes E/M-placements) : tableau Titre · Compte ·
// Propriétaire · Valeur · Poids au bureau, liste compacte sur mobile. Valeurs en CAD (prix natif × FX),
// triées de la plus grosse à la plus petite ; le propriétaire n'apparaît qu'en mode couple.
import React from 'react';
import { formatCAD, formatNumber } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';

export interface LigneTitre {
    cle: string;
    symbole: string;
    compte: string;
    proprietaire?: string;
    valeur: number;
    /** Part du portefeuille (%). */
    poids: number;
}

/** Libellé et couleur des comptes (couleurs des séries du graphe). */
const COMPTES: Record<string, { libelle: string; couleur: string }> = {
    CELI: { libelle: 'CELI', couleur: '#34b39a' },
    CELIAPP: { libelle: 'CELIAPP', couleur: '#7dd3c0' },
    REER: { libelle: 'REER', couleur: '#7c93f2' },
    'NON-ENREG': { libelle: 'Non-enregistré', couleur: '#d4a24c' },
    CRYPTO: { libelle: 'Crypto', couleur: '#a78bfa' },
    REEE: { libelle: 'REEE', couleur: '#56b6d6' },
    MARGE: { libelle: 'Marge', couleur: '#e0703a' },
    AUTRE: { libelle: 'Autre', couleur: '#8896a8' },
};
const compteDe = (type?: string) => COMPTES[type || 'NON-ENREG'] ?? COMPTES.AUTRE;

const poidsTexte = (p: number) => `${formatNumber(p, { decimals: 1 })} %`;

export const TitresDetenus: React.FC<{ lignes: LigneTitre[]; couple: boolean; etroit: boolean }> = ({ lignes, couple, etroit }) => {
    if (etroit) {
        return (
            <section aria-labelledby="titres-titre" className="rounded-2xl bg-surface border border-white/6 px-4 pt-4 pb-1 min-w-0">
                <h2 id="titres-titre" className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-400 pb-2">Titres détenus</h2>
                <ul>
                    {lignes.map((l) => {
                        const c = compteDe(l.compte);
                        return (
                            <li key={l.cle} className="flex items-center gap-3 py-3 border-t border-white/5">
                                <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: c.couleur }} aria-hidden="true" />
                                <span className="flex-1 min-w-0 flex flex-col">
                                    <span className="font-mono font-bold text-ink-50 truncate">{l.symbole}</span>
                                    <span className="text-meta text-ink-400 truncate">{c.libelle}{couple && l.proprietaire ? ` · ${l.proprietaire}` : ''}</span>
                                </span>
                                <span className="flex flex-col items-end shrink-0">
                                    <PrivateAmount className="font-mono font-bold text-ink-50">{formatCAD(l.valeur)}</PrivateAmount>
                                    <span className="font-mono text-meta text-ink-400">{poidsTexte(l.poids)}</span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </section>
        );
    }
    return (
        <section aria-label="Titres détenus" className="rounded-2xl bg-surface border border-white/6 overflow-hidden min-w-0">
            <table className="w-full text-body">
                <caption className="sr-only">Titres détenus : compte, {couple ? 'propriétaire, ' : ''}valeur et poids dans le portefeuille</caption>
                <thead>
                    <tr className="text-left text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-400">
                        <th scope="col" className="px-5 h-12 font-semibold">Titre</th>
                        <th scope="col" className="px-3 font-semibold">Compte</th>
                        {couple && <th scope="col" className="px-3 font-semibold">Propriétaire</th>}
                        <th scope="col" className="px-3 font-semibold text-right">Valeur</th>
                        <th scope="col" className="px-5 font-semibold text-right">Poids</th>
                    </tr>
                </thead>
                <tbody>
                    {lignes.map((l) => {
                        const c = compteDe(l.compte);
                        return (
                            <tr key={l.cle} className="border-t border-white/5">
                                <th scope="row" className="px-5 h-[52px] text-left font-mono font-bold text-ink-50">{l.symbole}</th>
                                <td className="px-3">
                                    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-surfaceHighlight text-meta text-ink-200">
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.couleur }} aria-hidden="true" />{c.libelle}
                                    </span>
                                </td>
                                {couple && <td className="px-3 text-ink-300">{l.proprietaire}</td>}
                                <td className="px-3 text-right"><PrivateAmount className="font-mono text-ink-50">{formatCAD(l.valeur)}</PrivateAmount></td>
                                <td className="px-5 text-right font-mono text-ink-300">{poidsTexte(l.poids)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </section>
    );
};
