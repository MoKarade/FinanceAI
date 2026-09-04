// utils/chartKeyboardSelect.ts
//
// [D6-GRAPH] Prédicat du geste clavier « figer un jour » sur la courbe temporelle.
//
// ⚠️ Extrait de `FutureProjection.tsx` pour une raison PRÉCISE, à connaître avant de le
// « ré-inliner » : la garde `tests/guards/tablistMotifUniqueGuard.test.ts` interdit tout littéral
// de flèche dans un fichier qui rend un `role="tablist"` — le clavier des BANDEAUX d'onglets vit
// dans `components/ui/SubTabs.tsx` (clavierTablist), et une copie locale y serait une divergence
// silencieuse. Le geste du GRAPHE n'est pas celui d'un bandeau : il vit donc ici, dans un module
// sans tablist, où la garde ne confond pas les deux surfaces. (CI rouge vécue le 2026-09-04 : le
// littéral 'ArrowRight' inline dans FutureProjection a fait rougir la garde — à raison sur sa
// forme, à tort sur le fond ; la séparation lève l'ambiguïté au lieu d'élargir l'exemption.)
export function estGesteSelectionJourClavier(key: string): boolean {
    return key === 'Enter' || key === ' ' || key === 'ArrowLeft' || key === 'ArrowRight';
}
