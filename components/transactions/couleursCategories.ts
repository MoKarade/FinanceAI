// components/transactions/couleursCategories.ts
//
// [S5-REFONTE-TRANSACTIONS] Pastille de couleur d'une catégorie (maquettes E/M-transactions). Les
// catégories des maquettes ont leur couleur ; les autres en reçoivent une stable, dérivée du nom.
const FIXES: Record<string, string> = {
    'Épicerie': '#34b39a', Salaire: '#34d399', Logement: '#7c93f2', Transfert: '#64748b',
    Restaurants: '#d4a24c', 'Santé': '#d08a9e', Transport: '#56b6d6',
};
const PALETTE = ['#a78bfa', '#e0703a', '#7dd3c0', '#f87171', '#fbbf24', '#94a3b8', '#c084fc', '#4ade80'];
const A_CLASSER = new Set(['Uncategorized', 'Inconnu']);

export function couleurCategorie(categorie: string | undefined): string {
    if (!categorie || A_CLASSER.has(categorie)) return '#fbbf24';
    if (FIXES[categorie]) return FIXES[categorie];
    let h = 0;
    for (const c of categorie) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
}
