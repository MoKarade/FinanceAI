import { useState } from 'react';

/**
 * [FUTUR-MOBILE-PR1] Extraction PURE du state `hiddenSeries`/`isVisible`/`toggleSeries`/`showAllSeries`
 * hors de `components/FutureProjection.tsx` — aucun changement de comportement, clé localStorage
 * INCHANGÉE (`future:hiddenSeries:v1`). Un seul appelant aujourd'hui
 * (`FutureProjection`) ; la légende mobile (`[FUTUR-MOBILE-PR3]`) le consommera par PROPS, jamais par
 * un second appel du hook (une seule source de vérité pour les séries masquées).
 *
 * G10 — légende interactive : on stocke les séries MASQUÉES (le delta vs défaut « tout visible »),
 * persistées en localStorage. Même convention que Dashboard (`dashboard:hiddenAccounts:v1`) :
 * persistance DANS le setter.
 */
export function useHiddenSeries() {
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem('future:hiddenSeries:v1');
            return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
        } catch { return new Set<string>(); }
    });
    const isVisible = (key: string) => !hiddenSeries.has(key);
    const toggleSeries = (key: string) => {
        setHiddenSeries((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            try { localStorage.setItem('future:hiddenSeries:v1', JSON.stringify([...next])); } catch {/* localStorage indispo */}
            return next;
        });
    };
    const showAllSeries = () => {
        setHiddenSeries(new Set());
        try { localStorage.setItem('future:hiddenSeries:v1', '[]'); } catch {/* localStorage indispo */}
    };
    return { hiddenSeries, isVisible, toggleSeries, showAllSeries };
}
