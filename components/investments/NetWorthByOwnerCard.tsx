// components/investments/NetWorthByOwnerCard.tsx
//
// CI-1000x — Phase 1 (axe B). Affiche la répartition du portefeuille entre les
// deux conjoints (toi / conjoint / commun) et permet d'attribuer chaque actif
// à un propriétaire. Visible uniquement en mode couple (2 utilisateurs nommés).

import React from 'react';
import { formatCAD } from '../../utils/format';
import { Card } from '../ui/Card';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset, AssetOwner } from '../../types';
import { computeNetWorthByOwner, defaultOwner, isCoupleMode } from '../../services/couple/netWorthByOwner';
import { assetValueCad } from '../../services/portfolio';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';

interface NetWorthByOwnerCardProps {
    assets: Asset[];
    setAssets: (assets: Asset[]) => void;
}

const fmt = (n: number): string => formatCAD(n);
const pct = (v: number, total: number): string => (total > 0 ? `${Math.round((v / total) * 100)} %` : '0 %');

export const NetWorthByOwnerCard: React.FC<NetWorthByOwnerCardProps> = ({ assets, setAssets }) => {
    const config = useFinanceStore((s) => s.config);
    // [ASSET-FX-DISPLAY] les prix des actifs sont en devise NATIVE → conversion CAD obligatoire.
    const fxRates = useFinanceStore((s) => s.fxRates);
    const users = (config?.users ?? []).filter(Boolean);
    // Mode couple = 2e utilisateur avec un nom (même définition que CoupleModeBadge).
    const isCouple = isCoupleMode(users); // [COUPLE-PREDICAT-COPIES] source unique (même module que le partage)
    if (!isCouple) return null;

    const name1 = users[0]?.name || 'Utilisateur 1';
    const name2 = users[1]?.name || 'Conjoint(e)';
    const color1 = users[0]?.color || '#4f9d86';
    const color2 = users[1]?.color || '#5b82bf';

    const bd = computeNetWorthByOwner(assets, fxRates, 0, true);

    const setOwner = (symbol: string, owner: AssetOwner | undefined) => {
        setAssets(assets.map((a) => (a.symbol === symbol ? { ...a, owner } : a)));
    };

    const buckets: Array<{ label: string; value: number; color: string }> = [
        { label: name1, value: bd.user1, color: color1 },
        { label: name2, value: bd.user2, color: color2 },
        { label: 'Commun', value: bd.joint, color: '#9b8fcf' },
    ];

    return (
        <Card icon={<Icon name="users" size={18} />} title="Répartition du portefeuille par personne">
            <p className="text-meta text-ink-300 mb-3 leading-snug">
                Qui possède quoi. Les comptes enregistrés (CELI/REER/CELIAPP) sont individuels ;
                le non-enregistré et le cash peuvent être communs. « Auto » applique la règle par défaut.
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4">
                {buckets.map((b) => (
                    <div key={b.label} className="bg-black/30 rounded-lg p-3 border border-white/5 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} aria-hidden="true" />
                            <span className="text-meta text-ink-200 truncate">{b.label}</span>
                        </div>
                        <PrivateAmount as="div" className="font-mono font-bold text-white">{fmt(b.value)}</PrivateAmount>
                        {/* [A11Y-PCT-NOT-MASKED] Le montant juste au-dessus était masqué en mode
                            discret, mais PAS ce pourcentage — or une répartition du patrimoine
                            ENTRE CONJOINTS est une information relationnelle, et elle reste
                            lisible même quand les montants sont cachés (« 70 % / 30 % » se lit
                            par-dessus l'épaule aussi bien qu'un dollar). `FutureKpiStrip` traite
                            déjà explicitement un `%` comme une donnée à masquer (drapeau
                            `privateSublabel`) : la garde manquait ICI alors que la ligne VOISINE
                            l'avait — motif `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`.
                            Le libellé du poste (`b.label`) reste visible : masquer la valeur ne
                            retire donc aucun discriminant du nom accessible. */}
                        <PrivateAmount as="div" className="text-tiny text-ink-400">{pct(b.value, bd.total)}</PrivateAmount>
                    </div>
                ))}
            </div>

            {assets.length > 0 && (
                <div className="space-y-1.5">
                    <div className="text-tiny text-ink-400 font-black uppercase tracking-widest mb-1">Attribuer par actif</div>
                    {assets.map((a) => {
                        const value = assetValueCad(a, fxRates); // CAD (prix natif × FX)
                        return (
                            <div key={a.symbol} className="flex items-center justify-between gap-2 text-body bg-white/5 rounded px-2 py-1.5">
                                <span className="text-ink-100 truncate">
                                    <span className="font-bold">{a.symbol}</span>
                                    <span className="text-ink-400"> · {a.accountType || 'NON-ENREG'} · </span>
                                    <PrivateAmount className="font-mono">{fmt(value)}</PrivateAmount>
                                </span>
                                <select
                                    aria-label={`Propriétaire de ${a.symbol}`}
                                    value={a.owner ?? ''}
                                    onChange={(e) => setOwner(a.symbol, (e.target.value || undefined) as AssetOwner | undefined)}
                                    className="bg-dark border border-border rounded px-2 py-1 text-meta text-white shrink-0"
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
            )}
        </Card>
    );
};
