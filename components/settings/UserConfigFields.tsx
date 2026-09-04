import React from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PrivateNumberInput } from '../ui/PrivateNumberInput';
import { useFinanceStore } from '../../store/useFinanceStore';
import { annualSalaryToMonthly } from '../../utils/salary';
import { hasLegacyGross135Signature, proposedGrossMonthlyFromNet } from '../../services/legacyGrossSignature';
import { PrivateAmount } from '../ui/PrivateAmount';
import { formatCAD } from '../../utils/format';
import type { User } from '../../types';

/**
 * Champs de config utilisateur, composés dans l'onglet PROFIL unifié (PH3).
 *
 * Autonome (lit/écrit le store), couple-aware (boucle sur config.users).
 * Une section = un groupe de champs :
 *   - 'salary'   → salaires brut/net
 *   - 'fiscal'   → CELIAPP 1er acheteur + facteur d'équivalence
 *   - 'children' → enfants (REEE)
 *   - 'detailed' → carrière & rémunération variable (bonus/RSU/side income → moteur,
 *                  cf. services/projection/activeIncome.ts). PH3-c : champs santé/civil/emploi
 *                  morts PURGÉS (aucun consommateur — détail au type User, types.ts).
 *
 * L'identité de base (nom/âge/immigrant) + les profils enregistrés restent dans UsersCard.
 */

/** Mode de répartition (config-level, pas par-utilisateur) → déplacé dans Budget. */
export const RepartitionField: React.FC<{ className?: string }> = ({ className = '' }) => {
    const config = useFinanceStore((s) => s.config);
    const setAppState = useFinanceStore((s) => s.setAppState);
    if ((config.users?.length ?? 0) < 2) return null; // pertinent en couple seulement
    return (
        <Card icon={<Icon name="budget" size={18} />} title="Mode de répartition" className={className}>
            <p className="text-meta text-ink-400 mb-2">Comment répartir les dépenses communes entre les conjoints.</p>
            <select
                aria-label="Mode de répartition des dépenses communes"
                value={config.splitMode}
                onChange={(e) => setAppState({ config: { ...config, splitMode: e.target.value as typeof config.splitMode } })}
                className="w-full bg-dark border border-border rounded px-3 py-2 text-white"
            >
                <option value="prorata">Prorata des Salaires Nets</option>
                <option value="50/50">50 / 50</option>
                <option value="custom">Personnalisé</option>
            </select>
        </Card>
    );
};

type Section = 'salary' | 'fiscal' | 'children' | 'detailed';

const SECTION_META: Record<Section, { title: string; icon: Parameters<typeof Icon>[0]['name']; help?: string }> = {
    salary: { title: 'Salaires', icon: 'tax', help: 'Brut annuel + net mensuel, par personne. Base des impôts et de la répartition.' },
    fiscal: { title: 'Options fiscales', icon: 'tax', help: 'Premier acheteur (CELIAPP) et facteur d\'équivalence (réduit le plafond REER).' },
    children: { title: 'Enfants (REEE)', icon: 'child', help: 'Active le REEE et la subvention pour la planification des coûts.' },
    detailed: { title: 'Carrière & rémunération variable', icon: 'tax', help: 'Bonus, RSU et revenus secondaires entrent dans les revenus projetés. Industrie : informatif.' },
};

export const UserConfigFields: React.FC<{ section: Section; className?: string }> = ({ section, className = '' }) => {
    const config = useFinanceStore((s) => s.config);
    const setAppState = useFinanceStore((s) => s.setAppState);
    const setConfig = (c: typeof config) => setAppState({ config: c });
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);

    // Brouillon ANNUEL du brut (store = mensuel) — cf. convention UsersCard.
    const [grossAnnualDraft, setGrossAnnualDraft] = React.useState<Record<number, string>>({});

    const patch = (idx: number, p: Partial<User>) => {
        const users = [...config.users] as [User, User];
        users[idx] = { ...users[idx], ...p };
        setConfig({ ...config, users });
    };

    const meta = SECTION_META[section];

    return (
        <Card icon={<Icon name={meta.icon} size={18} />} title={meta.title} className={className}>
            <div className="space-y-3">
                {meta.help && <p className="text-meta text-ink-400">{meta.help}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    {config.users.map((user, idx) => (
                        <div key={idx} className="flex flex-col gap-2 p-3 bg-white/5 rounded-card border border-border h-full">
                            <div className="font-bold text-white mb-1 border-b border-white/5 pb-1 text-meta">
                                {user.name?.trim() || `Utilisateur ${idx + 1}`}
                            </div>

                            {section === 'salary' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div data-focus-section={`profile-user${idx + 1}-grossSalary`}>
                                        <label htmlFor={`ucf-gross-${idx}`} className="text-meta font-bold text-success-400">Salaire Brut annuel ($)</label>
                                        <PrivateNumberInput
                                            id={`ucf-gross-${idx}`}
                                            type="number"
                                            value={grossAnnualDraft[idx] ?? String((user.grossSalary || 0) * 12)}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                setGrossAnnualDraft((d) => ({ ...d, [idx]: raw }));
                                                patch(idx, { grossSalary: annualSalaryToMonthly(parseFloat(raw) || 0) });
                                            }}
                                            className="w-full bg-dark border border-border rounded px-2 py-1 text-body text-white font-mono"
                                        />
                                    </div>
                                    <div data-focus-section={`profile-user${idx + 1}-netSalary`}>
                                        <label htmlFor={`ucf-net-${idx}`} className="text-meta font-bold text-info-400">Salaire Net mensuel ($)</label>
                                        <PrivateNumberInput
                                            id={`ucf-net-${idx}`}
                                            type="number"
                                            value={user.netSalary || user.salary || 0}
                                            onChange={(e) => patch(idx, { netSalary: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-dark border border-border rounded px-2 py-1 text-body text-white font-mono"
                                        />
                                    </div>
                                    {/* [MIGRATE-GROSS-PROPOSER] Décision de Marc (2026-09-03) : détecter la signature du
                                        brut FABRIQUÉ par l'ancienne version (net × 1,35 arrondi) et PROPOSER — aucune
                                        écriture sans clic explicite : écraser une saisie est irréversible, et une
                                        coïncidence est possible (d'où « C'est bien mon brut », qui éteint l'avis). */}
                                    {/* ⚠️ Pas d'avis en mode discret : la structure du DOM ne doit
                                        pas dépendre des VALEURS de salaire (garde d'indiscernabilité,
                                        leçon #608), et une proposition de réécriture s'examine à
                                        découvert — le montant proposé serait masqué de toute façon. */}
                                    {!isPrivacyMode && hasLegacyGross135Signature(user) && (() => {
                                        const propose = proposedGrossMonthlyFromNet(
                                            user, new Date().getFullYear(),
                                            config.users.filter((x) => (x?.netSalary || 0) > 0 || (x?.grossSalary || 0) > 0).length || 1,
                                        );
                                        return (
                                            <div role="note" className="col-span-2 bg-warning-500/10 border border-warning-500/30 rounded p-2 space-y-1">
                                                <p className="text-tiny text-warning-300">
                                                    Ce brut ressemble à une valeur fabriquée automatiquement par une ancienne
                                                    version de l'app (1,35 × le net), pas à une saisie. Le vrai brut est
                                                    probablement différent — il pilote les impôts et les droits REER projetés.
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        className="text-tiny px-2 py-1 rounded bg-info-500/20 text-info-300 border border-info-500/40 hover:bg-info-500/30"
                                                        onClick={() => {
                                                            setGrossAnnualDraft((d) => ({ ...d, [idx]: String(propose * 12) }));
                                                            patch(idx, { grossSalary: propose, grossSalaryConfirmed: true });
                                                        }}
                                                    >
                                                        Recalculer depuis mon net (<PrivateAmount>{formatCAD(propose * 12)}</PrivateAmount>/an)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="text-tiny px-2 py-1 rounded bg-white/5 text-ink-300 border border-border hover:bg-white/10"
                                                        onClick={() => patch(idx, { grossSalaryConfirmed: true })}
                                                    >
                                                        C'est bien mon brut
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {section === 'fiscal' && (
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={!user.hasOwnedPropertyLast4Years}
                                            onChange={(e) => patch(idx, { hasOwnedPropertyLast4Years: !e.target.checked })}
                                            className="w-3 h-3 rounded border-white/10 bg-black text-info-500 focus:ring-info-500/50"
                                        />
                                        <span className="text-tiny text-ink-300 group-hover:text-info-400 transition-colors">Premier Acheteur (CELIAPP)</span>
                                    </label>
                                    <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded border border-white/5">
                                        <span className="text-tiny text-ink-300 uppercase font-black shrink-0 inline-flex items-center gap-1">FE <Icon name="budget" size={11} /></span>
                                        {/* Le FE est un MONTANT ($ de la case 52 du T4) : il chiffre la valeur du régime de
                                            retraite de l'employeur. Masqué au même titre que le salaire. */}
                                        <PrivateNumberInput
                                            type="number"
                                            placeholder="Facteur Equiv. (ex: 0)"
                                            aria-label="Facteur d'équivalence"
                                            value={user.facteurEquivalence ?? 0}
                                            onChange={(e) => patch(idx, { facteurEquivalence: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-transparent border-none text-tiny text-white font-mono focus:ring-0 text-right p-0"
                                        />
                                    </div>
                                </div>
                            )}

                            {section === 'children' && (
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={user.hasChildren}
                                            onChange={(e) => patch(idx, { hasChildren: e.target.checked })}
                                            className="w-3 h-3 rounded border-white/10 bg-black text-info-500 focus:ring-info-500/50"
                                        />
                                        <span className="text-tiny text-ink-300 group-hover:text-pink-400 transition-colors">A des enfants (REEE)</span>
                                    </label>
                                    {user.hasChildren && (
                                        <input
                                            type="number"
                                            aria-label="Nombre d'enfants"
                                            value={user.childCount || 1}
                                            onChange={(e) => patch(idx, { childCount: parseInt(e.target.value) || 1 })}
                                            className="w-12 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-tiny text-white font-mono text-center"
                                            min={1} max={10}
                                        />
                                    )}
                                </div>
                            )}

                            {section === 'detailed' && (
                                <div className="space-y-2">
                                    {/* PH3-c (+ industry purgé 2026-06-19) — champs profil détaillé morts retirés (aucun consommateur). */}
                                    <div className="text-tiny text-ink-400 uppercase tracking-widest mt-1">Rémunération variable</div>
                                    <div className="grid grid-cols-4 gap-1">
                                        {/* Bonus en POURCENTAGE : laissé en clair à dessein. Le contrat du mode discret
                                            porte sur les MONTANTS ($) — et le brut auquel ce % s'applique est masqué,
                                            donc le % seul ne reconstitue aucune somme. RSU et revenus secondaires,
                                            eux, sont des $/an : masqués. */}
                                        <input aria-label="Bonus en % du brut" type="number" placeholder="Bonus % brut" value={user.bonusPctOfGross ?? ''}
                                            onChange={e => patch(idx, { bonusPctOfGross: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        <PrivateNumberInput aria-label="RSU vesting annuel" type="number" placeholder="RSU $/an" value={user.rsuVestingPerYear ?? ''}
                                            onChange={e => patch(idx, { rsuVestingPerYear: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        {/* [PH3-c-bis] Durée du vesting RSU — le moteur la LIT depuis toujours
                                            (`activeIncome.ts` : `(rsuYearsRemaining ?? 99) > yearsElapsed`) mais AUCUN
                                            champ ne l'écrivait : le repli à 99 ans faisait couler les RSU sur tout
                                            l'horizon. MESURÉ sur une projection de 40 ans à 24 000 $/an de RSU :
                                            7 273 468 $ de patrimoine final sans durée, contre 5 892 838 $ avec un
                                            vesting de 4 ans — **1 380 630 $ (+23,4 %) de richesse fantôme**.
                                            Pas un % : un NOMBRE D'ANNÉES, donc pas de masquage (le mode discret porte
                                            sur les montants, et son voisin `rsuVestingPerYear` est déjà masqué). */}
                                        <input aria-label="Années de vesting RSU restantes" type="number" min={0} placeholder="RSU ans" value={user.rsuYearsRemaining ?? ''}
                                            onChange={e => patch(idx, { rsuYearsRemaining: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        <PrivateNumberInput aria-label="Revenus secondaires annuels" type="number" placeholder="Side income $/an" value={user.sideIncomeAnnual ?? ''}
                                            onChange={e => patch(idx, { sideIncomeAnnual: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
};
