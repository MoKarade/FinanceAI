// components/investments/NetWorthByOwnerCard.tsx
//
// CI-1000x — Phase 1 (axe B). Répartition du portefeuille entre les deux conjoints (toi / conjoint /
// commun) et attribution de chaque actif à un propriétaire. Visible uniquement en mode couple.
//
// [S5-REFONTE-PLACEMENTS] « Qui possède quoi » des maquettes (E/M-placements) : barre de répartition,
// trois lignes chiffrées, la règle en une phrase ; l'attribution titre par titre (absente des
// maquettes) reste là, repliée sous un lien.

import React from 'react';
import { formatCAD } from '../../utils/format';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset, AssetOwner, User } from '../../types';
import { computeNetWorthByOwner, defaultOwner, isCoupleMode } from '../../services/couple/netWorthByOwner';
import { assetValueCad } from '../../services/portfolio';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { PrivateAmount } from '../ui/PrivateAmount';

interface NetWorthByOwnerCardProps {
    assets: Asset[];
    setAssets: (assets: Asset[]) => void;
}

const fmt = (n: number): string => formatCAD(n);
const pct = (v: number, total: number): string => (total > 0 ? `${Math.round((v / total) * 100)} %` : '0 %');

/** Nom du propriétaire d'un actif (attribution saisie, sinon la règle par défaut du compte). */
export function nomProprietaire(a: Pick<Asset, 'owner' | 'accountType'>, users: ReadonlyArray<Pick<User, 'name'> | null | undefined>): string {
    const owner = a.owner ?? defaultOwner(a.accountType);
    if (owner === 'user1') return users[0]?.name || 'Utilisateur 1';
    if (owner === 'user2') return users[1]?.name || 'Conjoint(e)';
    return 'Commun';
}

export const NetWorthByOwnerCard: React.FC<NetWorthByOwnerCardProps> = ({ assets, setAssets }) => {
    const config = useFinanceStore((s) => s.config);
    // [ASSET-FX-DISPLAY] les prix des actifs sont en devise NATIVE → conversion CAD obligatoire.
    const fxRates = useFinanceStore((s) => s.fxRates);
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    const users = (config?.users ?? []).filter(Boolean);
    // Mode couple = 2e utilisateur avec un nom (même définition que CoupleModeBadge).
    const isCouple = isCoupleMode(users); // [COUPLE-PREDICAT-COPIES] source unique (même module que le partage)
    if (!isCouple) return null;

    const name1 = users[0]?.name || 'Utilisateur 1';
    const name2 = users[1]?.name || 'Conjoint(e)';

    const bd = computeNetWorthByOwner(assets, fxRates, 0, true);

    const setOwner = (symbol: string, owner: AssetOwner | undefined) => {
        setAssets(assets.map((a) => (a.symbol === symbol ? { ...a, owner } : a)));
    };

    // Pastilles des maquettes : plein clair, contour (vide), gris.
    const buckets: Array<{ label: string; value: number; pastille: string; barre: string }> = [
        { label: name1, value: bd.user1, pastille: 'bg-ink-100', barre: 'bg-ink-100' },
        { label: name2, value: bd.user2, pastille: 'border border-ink-300', barre: 'bg-ink-400/40' },
        { label: 'Commun', value: bd.joint, pastille: 'bg-ink-500', barre: 'bg-ink-500' },
    ];

    return (
        <section aria-labelledby="qui-possede-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:p-5 flex flex-col gap-3.5 min-w-0">
            <h2 id="qui-possede-titre" className="text-[17px] font-semibold text-ink-50">Qui possède quoi</h2>
            {/* [A11Y-PCT-NOT-MASKED] La barre dessine la MÊME répartition que les pourcentages : en mode
                discret elle reste neutre (sinon « 60 / 40 » se lirait à l'œil, dollars masqués). */}
            <div className="h-3 rounded-full overflow-hidden flex bg-white/8" aria-hidden="true">
                {!isPrivacyMode && bd.total > 0 && buckets.map((b) => (
                    <span key={b.label} className={b.barre} style={{ width: `${(b.value / bd.total) * 100}%` }} />
                ))}
            </div>
            <ul className="flex flex-col gap-2">
                {buckets.map((b) => (
                    <li key={b.label} className="flex items-center justify-between gap-3 text-body">
                        <span className="flex items-center gap-2 min-w-0 text-ink-100">
                            <span className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${b.pastille}`} aria-hidden="true" />
                            <span className="truncate">{b.label}</span>
                        </span>
                        <span className="font-mono text-ink-100 shrink-0">
                            <PrivateAmount>{fmt(b.value)}</PrivateAmount>
                            <span className="text-ink-400"> · </span>
                            {/* [A11Y-PCT-NOT-MASKED] % de répartition ENTRE PERSONNES : masqué comme le montant. */}
                            <PrivateAmount className="text-ink-300">{pct(b.value, bd.total)}</PrivateAmount>
                        </span>
                    </li>
                ))}
            </ul>
            <p className="text-meta leading-[18px] text-ink-400">
                CELI, REER et CELIAPP sont individuels ; le non-enregistré et le cash peuvent être communs.
            </p>

            {assets.length > 0 && (
                <CollapsibleSection title="Attribuer chaque titre" variant="lien" headingLevel={3}>
                    <div className="flex flex-col gap-1.5">
                        <p className="text-meta text-ink-400">« Auto » applique la règle ci-dessus.</p>
                        {assets.map((a) => {
                            const value = assetValueCad(a, fxRates); // CAD (prix natif × FX)
                            return (
                                <div key={a.symbol} className="flex items-center justify-between gap-2 text-body rounded-lg bg-white/3 px-2.5 py-1.5">
                                    <span className="text-ink-100 truncate">
                                        <span className="font-mono font-bold">{a.symbol}</span>
                                        <span className="text-ink-400"> · {a.accountType || 'NON-ENREG'} · </span>
                                        <PrivateAmount className="font-mono">{fmt(value)}</PrivateAmount>
                                    </span>
                                    <select
                                        aria-label={`Propriétaire de ${a.symbol}`}
                                        value={a.owner ?? ''}
                                        onChange={(e) => setOwner(a.symbol, (e.target.value || undefined) as AssetOwner | undefined)}
                                        className="h-9 px-2 text-meta text-ink-50 shrink-0"
                                    >
                                        <option value="">Auto ({defaultOwner(a.accountType) === 'user1' ? name1 : 'Commun'})</option>
                                        <option value="user1">{name1}</option>
                                        <option value="user2">{name2}</option>
                                        <option value="joint">Commun</option>
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </CollapsibleSection>
            )}
        </section>
    );
};
