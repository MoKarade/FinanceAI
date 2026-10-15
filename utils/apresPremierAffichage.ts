// utils/apresPremierAffichage.ts
//
// [S5-REFONTE-PERF] Repousser un travail de fond (réseau, hydratation) APRÈS le premier affichage.
//
// ⚠️ POURQUOI. Au démarrage, tout ce qui part avant que l'écran soit peint entre dans le chemin
// critique mesuré (Lighthouse mobile simule un réseau lent : chaque requête lancée avant le plus
// grand affichage retarde son estimation). Une lecture des taux de la Banque du Canada n'a rien à
// faire devant le premier écran : les taux de repli servent déjà, et la lecture fraîche arrive une
// seconde plus tard sans que personne ne la voie arriver.
//
// Règle : navigateur au repos (`requestIdleCallback`), au plus tard `delaiMax` ms ; sans cette API
// (Safari, jsdom), un court délai. Rend une fonction d'annulation, à appeler au démontage.
export function apresPremierAffichage(tache: () => void, delaiMax = 2000): () => void {
    if (typeof window === 'undefined') {
        tache();
        return () => {};
    }
    let annule = false;
    const lancer = () => { if (!annule) tache(); };
    if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(lancer, { timeout: delaiMax });
        return () => {
            annule = true;
            window.cancelIdleCallback?.(id);
        };
    }
    const t = window.setTimeout(lancer, 300);
    return () => {
        annule = true;
        window.clearTimeout(t);
    };
}
