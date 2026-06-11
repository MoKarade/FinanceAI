import React from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import { annualSalaryToMonthly } from '../../utils/salary';
import type {
    User, Gender, CanadianProvince, MaritalStatus, EmploymentType, Industry, PensionPlan, HealthRating,
} from '../../types';

/**
 * Champs de config utilisateur DÉPLACÉS depuis Configuration vers les onglets
 * concernés (demande Marc : « chaque partie dans l'onglet concerné »).
 *
 * Autonome (lit/écrit le store), couple-aware (boucle sur config.users).
 * Une section = un groupe de champs rendu dans l'onglet pertinent :
 *   - 'salary'   → Impôts
 *   - 'fiscal'   → Impôts (CELIAPP 1er acheteur + facteur d'équivalence)
 *   - 'children' → Enfant (REEE)
 *   - 'detailed' → Retraite (profil détaillé santé/carrière, pour la longévité)
 *
 * L'identité de base (nom/âge/immigrant) + les profils enregistrés restent dans
 * Configuration (cf. UsersCard).
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
    detailed: { title: 'Profil détaillé (santé, carrière)', icon: 'retirement', help: 'Sert l\'espérance de vie et les projections de carrière.' },
};

export const UserConfigFields: React.FC<{ section: Section; className?: string }> = ({ section, className = '' }) => {
    const config = useFinanceStore((s) => s.config);
    const setAppState = useFinanceStore((s) => s.setAppState);
    const setConfig = (c: typeof config) => setAppState({ config: c });

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
                                        <label htmlFor={`ucf-gross-${idx}`} className="text-meta font-bold text-success-300">Salaire Brut annuel ($)</label>
                                        <input
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
                                        <label htmlFor={`ucf-net-${idx}`} className="text-meta font-bold text-info-300">Salaire Net mensuel ($)</label>
                                        <input
                                            id={`ucf-net-${idx}`}
                                            type="number"
                                            value={user.netSalary || user.salary || 0}
                                            onChange={(e) => patch(idx, { netSalary: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-dark border border-border rounded px-2 py-1 text-body text-white font-mono"
                                        />
                                    </div>
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
                                        <input
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
                                    <div className="grid grid-cols-3 gap-1">
                                        <select value={user.gender ?? ''} aria-label="Sexe"
                                            onChange={e => patch(idx, { gender: (e.target.value || undefined) as Gender | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Sexe</option><option value="M">Homme</option><option value="F">Femme</option><option value="X">Autre</option>
                                        </select>
                                        <select value={user.province ?? ''} aria-label="Province"
                                            onChange={e => patch(idx, { province: (e.target.value || undefined) as CanadianProvince | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Province</option>
                                            <option value="QC">Québec</option><option value="ON">Ontario</option><option value="AB">Alberta</option>
                                            <option value="BC">C.-B.</option><option value="MB">Manitoba</option><option value="SK">Saskatchewan</option>
                                            <option value="NS">N.-É.</option><option value="NB">N.-B.</option><option value="NL">T.-N.</option>
                                            <option value="PE">Î.-P.-É.</option><option value="YT">Yukon</option><option value="NT">T.-N.-O.</option><option value="NU">Nunavut</option>
                                        </select>
                                        <select value={user.citizenship ?? ''} aria-label="Citoyenneté"
                                            onChange={e => patch(idx, { citizenship: (e.target.value || undefined) as 'CA' | 'US-person-CA' | 'other' | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Citoyenneté</option><option value="CA">Canadien</option><option value="US-person-CA">Dual CA/US (PFIC!)</option><option value="other">Autre</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <select value={user.maritalStatus ?? ''} aria-label="Statut civil"
                                            onChange={e => patch(idx, { maritalStatus: (e.target.value || undefined) as MaritalStatus | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Statut civil</option>
                                            <option value="single">Célibataire</option><option value="married">Marié</option><option value="common-law">Conjoint de fait</option>
                                            <option value="separated">Séparé</option><option value="divorced">Divorcé</option><option value="widowed">Veuf</option>
                                        </select>
                                        <select value={user.employmentType ?? ''} aria-label="Type d'emploi"
                                            onChange={e => patch(idx, { employmentType: (e.target.value || undefined) as EmploymentType | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Type emploi</option>
                                            <option value="employee">Employé</option><option value="self-employed">Autonome</option>
                                            <option value="contractor">Contractuel</option><option value="business-owner">Entrepreneur</option>
                                            <option value="unemployed">Sans emploi</option><option value="retired">Retraité</option><option value="student">Étudiant</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1">
                                        <select value={user.industry ?? ''} aria-label="Industrie"
                                            onChange={e => patch(idx, { industry: (e.target.value || undefined) as Industry | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Industrie...</option>
                                            <option value="tech">Tech</option><option value="finance">Finance</option><option value="health">Santé</option>
                                            <option value="public-sector">Secteur public</option><option value="education">Éducation</option>
                                            <option value="construction">Construction</option><option value="retail">Commerce</option>
                                            <option value="manufacturing">Manufacture</option><option value="energy">Énergie</option>
                                            <option value="transportation">Transport</option><option value="agriculture">Agriculture</option>
                                            <option value="media">Médias</option><option value="other">Autre</option>
                                        </select>
                                        <input aria-label="Années d'expérience professionnelle" type="number" placeholder="Ans expérience" value={user.yearsOfExperience ?? ''}
                                            onChange={e => patch(idx, { yearsOfExperience: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        <select value={user.pensionPlan ?? ''} aria-label="Régime de retraite"
                                            onChange={e => patch(idx, { pensionPlan: (e.target.value || undefined) as PensionPlan | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Régime retraite</option>
                                            <option value="DB">DB (prestations dét.)</option><option value="DC">DC (cotisations dét.)</option>
                                            <option value="RPDB">RPDB</option><option value="none">Aucun</option>
                                        </select>
                                    </div>
                                    <div className="text-tiny text-ink-500 uppercase tracking-widest mt-1">Santé & longévité</div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <select value={user.healthRating ?? ''} aria-label="État de santé"
                                            onChange={e => patch(idx, { healthRating: (e.target.value || undefined) as HealthRating | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">État santé</option><option value="excellent">Excellent</option><option value="good">Bon</option><option value="average">Moyen</option><option value="poor">Faible</option>
                                        </select>
                                        <select value={user.activityLevel ?? ''} aria-label="Activité physique"
                                            onChange={e => patch(idx, { activityLevel: (e.target.value || undefined) as 'sedentary' | 'light' | 'moderate' | 'active' | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Activité physique</option><option value="sedentary">Sédentaire</option><option value="light">Légère</option><option value="moderate">Modérée</option><option value="active">Active</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1">
                                        <label className="flex items-center gap-1 text-tiny text-ink-300">
                                            <input type="checkbox" checked={user.isSmoker ?? false}
                                                onChange={e => patch(idx, { isSmoker: e.target.checked })} />
                                            Fumeur
                                        </label>
                                        <input aria-label="Âge au décès de la mère" type="number" placeholder="Mère — âge décès" value={user.parentAgeAtDeath?.mother ?? ''}
                                            onChange={e => patch(idx, { parentAgeAtDeath: { ...user.parentAgeAtDeath, mother: Number(e.target.value) || undefined } })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        <input aria-label="Âge au décès du père" type="number" placeholder="Père — âge décès" value={user.parentAgeAtDeath?.father ?? ''}
                                            onChange={e => patch(idx, { parentAgeAtDeath: { ...user.parentAgeAtDeath, father: Number(e.target.value) || undefined } })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                    </div>
                                    <div className="text-tiny text-ink-500 uppercase tracking-widest mt-1">Rémunération variable</div>
                                    <div className="grid grid-cols-3 gap-1">
                                        <input aria-label="Bonus en % du brut" type="number" placeholder="Bonus % brut" value={user.bonusPctOfGross ?? ''}
                                            onChange={e => patch(idx, { bonusPctOfGross: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        <input aria-label="RSU vesting annuel" type="number" placeholder="RSU $/an" value={user.rsuVestingPerYear ?? ''}
                                            onChange={e => patch(idx, { rsuVestingPerYear: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        <input aria-label="Valeur stock options" type="number" placeholder="Stock opts $" value={user.stockOptionsValue ?? ''}
                                            onChange={e => patch(idx, { stockOptionsValue: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <input aria-label="Revenus secondaires annuels" type="number" placeholder="Side income $/an" value={user.sideIncomeAnnual ?? ''}
                                            onChange={e => patch(idx, { sideIncomeAnnual: Number(e.target.value) || undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                                        <select value={user.payFrequency ?? ''} aria-label="Périodicité de paie"
                                            onChange={e => patch(idx, { payFrequency: (e.target.value || undefined) as 'biweekly' | 'semimonthly' | 'monthly' | 'weekly' | undefined })}
                                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                                            <option value="">Périodicité paie</option>
                                            <option value="weekly">Hebdo (52)</option><option value="biweekly">Bihebdo (26)</option>
                                            <option value="semimonthly">Bimensuel (24)</option><option value="monthly">Mensuel (12)</option>
                                        </select>
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
