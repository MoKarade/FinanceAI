// components/future/JalonsLeviers.tsx
//
// [S5-REFONTE-FUTUR] Sous la courbe (maquettes F-bureau / F-mobile) : le tableau des JALONS
// (aujourd'hui, FIRE, retraite, fin de l'horizon) et la carte LEVIERS. Présentation pure — chaque
// valeur arrive déjà calculée par `FutureProjection.tsx` (mêmes sources que la courbe) ; rien n'est
// recalculé ici.
//
// ⚠️ La carte Leviers montre les leviers ACTUELLEMENT appliqués, pas une plage d'exploration : la
// maquette affichait « 58 · 60 · 63 » et « 3 / 15 · 6 combinaisons », des valeurs d'illustration
// qu'aucun état de l'app ne porte. Les inventer ferait un chiffre crédible et faux.
import React from 'react';

export interface JalonProjection {
    cle: string;
    libelle: string;
    /** Libellé court (téléphone), sinon `libelle`. */
    libelleCourt?: string;
    /** Année (« 2036 », « ≈ 2036 ») ou « — ». */
    annee: string;
    age: string;
    /** Montant DÉJÀ enveloppé par l'appelant (`PrivateAmount`) ou `null` → « — ». */
    montant: React.ReactNode | null;
    /** Teinte du montant : FIRE en ambre (couleur de sa série). */
    ton?: 'fire';
    /** Ligne masquée au téléphone (maquette F-mobile : pas de ligne « Aujourd'hui »). */
    bureauSeulement?: boolean;
}

export const TableJalons: React.FC<{ jalons: JalonProjection[]; etroit: boolean }> = ({ jalons, etroit }) => {
    const lignes = etroit ? jalons.filter((j) => !j.bureauSeulement) : jalons;
    const th = 'text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-400';
    return (
        <section aria-label="Jalons de la projection" className="rounded-2xl bg-surface border border-white/6 overflow-hidden min-w-0">
            <table className="w-full text-body">
                <caption className="sr-only">Jalons de la projection : année, âge et montant</caption>
                <thead>
                    <tr className="text-left">
                        <th scope="col" className={`${th} pl-4 lg:pl-6 h-11 lg:h-10`}>Jalon</th>
                        <th scope="col" className={`${th} px-2 lg:px-3`}>Année</th>
                        <th scope="col" className={`${th} px-2 lg:px-3`}>Âge</th>
                        <th scope="col" className={`${th} pr-4 lg:pr-6 text-right`}>Montant</th>
                    </tr>
                </thead>
                <tbody>
                    {lignes.map((j) => (
                        <tr key={j.cle} className="border-t border-white/5">
                            <th scope="row" className="pl-4 lg:pl-6 h-[52px] lg:h-[41px] text-left font-normal text-ink-100">
                                {etroit ? (j.libelleCourt ?? j.libelle) : j.libelle}
                            </th>
                            <td className="px-2 lg:px-3 font-mono text-ink-200 whitespace-nowrap">{j.annee}</td>
                            <td className="px-2 lg:px-3 font-mono text-ink-200">{j.age}</td>
                            <td className={`pr-4 lg:pr-6 text-right font-mono whitespace-nowrap ${j.ton === 'fire' ? 'text-warning-400' : 'text-ink-50'}`}>
                                {j.montant ?? <span className="text-ink-400">—</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
};

export interface LevierAffiche {
    libelle: string;
    valeur: string;
}

export const CarteLeviers: React.FC<{
    leviers: LevierAffiche[];
    /** Nom de la stratégie que la courbe affiche (celui du moteur) — absent : rien d'affiché. */
    strategie?: string;
    /** Résumé d'une phrase (téléphone, maquette F-mobile). */
    resume: string;
    nbLeviers: number;
    etroit: boolean;
    onOptimiser: () => void;
}> = ({ leviers, strategie, resume, nbLeviers, etroit, onOptimiser }) => (
    <section aria-labelledby="leviers-titre" className="rounded-2xl bg-surface border border-white/6 p-4 lg:p-5 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 min-w-0">
            <h2 id="leviers-titre" className="text-[17px] font-bold text-ink-50">Leviers</h2>
            {strategie && <p className="text-meta text-ink-400 truncate">{`Stratégie : ${strategie}`}</p>}
        </div>
        {etroit ? (
            <p className="text-meta text-ink-300 leading-snug">{resume}</p>
        ) : (
            <dl className="-mt-1">
                {leviers.map((l) => (
                    <div key={l.libelle} className="flex items-center justify-between gap-3 h-[42px] border-b border-white/5">
                        <dt className="text-body text-ink-200">{l.libelle}</dt>
                        <dd className="font-mono text-[13px] text-ink-50 text-right">{l.valeur}</dd>
                    </div>
                ))}
            </dl>
        )}
        {!etroit && (
            <button type="button" onClick={onOptimiser} className="self-start min-h-6 text-meta text-ink-200 underline underline-offset-2 hover:text-ink-50 focus-ring rounded-sm">
                Voir les {nbLeviers} leviers
            </button>
        )}
        {/* « Trouver la meilleure stratégie » : même chemin que l'ancien « Ré-optimiser » — retour au
            composeur de leviers (recherche Monte-Carlo), qui efface aussi le gel de la courbe. */}
        <button
            type="button"
            onClick={onOptimiser}
            title="Recomposer tes leviers et recalculer la meilleure stratégie"
            className="h-12 rounded-xl bg-primary text-dark text-body font-bold hover:brightness-105 transition focus-ring"
        >
            Trouver la meilleure stratégie
        </button>
    </section>
);
