// utils/relativeTime.ts
//
// Temps relatif « il y a … » partagé (extrait de SystemView au moment où une 2ᵉ surface en a eu
// besoin — [FINTABLE-6 Lot 2], badge de fraîcheur des soldes courtier — plutôt que d'en faire une
// copie qui dérive, cf. leçon « consolider AVANT que la 2ᵉ copie existe »).

/** Formate un horodatage epoch ms en « il y a Ns / N min / Nh / N j ». */
export const formatRelative = (ts: number | undefined): string => {
    if (!ts || ts <= 0) return 'jamais';
    const diffMs = Date.now() - ts;
    if (diffMs < 0) return 'futur';
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return `il y a ${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `il y a ${min} min`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `il y a ${hr}h`;
    const days = Math.round(hr / 24);
    return `il y a ${days} j`;
};
