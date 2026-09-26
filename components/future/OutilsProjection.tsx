// components/future/OutilsProjection.tsx
//
// [S5-REFONTE-FUTUR] Carte « Outils » de l'écran Futur : les trois tiroirs (hypothèses, plan
// d'action, historique) qu'ouvrait la barre latérale — retirée par les maquettes F-bureau /
// F-mobile, qui ne la montrent plus. Les tiroirs, eux, restent : ce sont des fonctions de l'app
// absentes des maquettes, rangées ici plutôt que perdues (règle posée au début de la refonte).
// Mêmes libellés au bureau et au téléphone : un seul nom par tiroir, jamais deux.
import React from 'react';

export type FutureDrawerId = 'hypotheses' | 'plan' | 'historique';

/** Source unique de l'`id` DOM du tiroir associé — consommée ICI (`aria-controls` des boutons) ET
 *  dans `FutureProjection.tsx` (`<Drawer id=…>`), pour que les deux ne divergent jamais. */
export function tiroirDomId(id: FutureDrawerId): string {
    return `future-drawer-${id}`;
}

const TIROIRS: ReadonlyArray<{ id: FutureDrawerId; label: string; detail: string }> = [
    { id: 'hypotheses', label: 'Modifier les hypothèses', detail: 'Rendements, inflation, Monte-Carlo, projets immobiliers' },
    { id: 'plan', label: "Plan d'action", detail: 'Ce que la courbe te demande de faire, mois par mois' },
    { id: 'historique', label: 'Historique', detail: 'Évolution passée du patrimoine, compte par compte' },
];

export const OutilsProjection: React.FC<{
    tiroirOuvert: FutureDrawerId | null;
    onOuvrir: (id: FutureDrawerId) => void;
}> = ({ tiroirOuvert, onOuvrir }) => (
    <section aria-labelledby="outils-projection-titre" className="rounded-2xl bg-surface border border-white/6 px-5 pt-4 pb-2">
        <h2 id="outils-projection-titre" className="text-[17px] font-bold text-ink-50">Outils</h2>
        <ul className="mt-1">
            {TIROIRS.map((t) => (
                <li key={t.id} className="border-t border-white/5 first:border-t-0">
                    <button
                        type="button"
                        onClick={() => onOuvrir(t.id)}
                        aria-haspopup="dialog"
                        aria-expanded={tiroirOuvert === t.id}
                        aria-controls={tiroirDomId(t.id)}
                        aria-describedby={`${tiroirDomId(t.id)}-detail`}
                        className="w-full min-h-[52px] py-2 flex items-center justify-between gap-3 text-left rounded-lg focus-ring group"
                    >
                        {/* Nom accessible = le libellé seul (« Plan d'action ») ; le détail est une
                            DESCRIPTION (aria-describedby), pas une partie du nom. */}
                        <span className="min-w-0">
                            <span className="block text-body text-ink-100 group-hover:text-ink-50">{t.label}</span>
                            <span id={`${tiroirDomId(t.id)}-detail`} aria-hidden="true" className="block text-meta text-ink-400 truncate">{t.detail}</span>
                        </span>
                        <span aria-hidden="true" className="text-ink-500 group-hover:text-ink-200">›</span>
                    </button>
                </li>
            ))}
        </ul>
    </section>
);
