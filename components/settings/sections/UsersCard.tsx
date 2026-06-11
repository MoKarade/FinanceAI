// components/settings/sections/UsersCard.tsx
// Carte « Profils & utilisateurs » : profils enregistrés (localStorage) +
// identité de base par utilisateur (nom, âge, immigré) + ajout/retrait conjoint.
// NB (demande Marc) : les autres parties ont été déplacées dans leurs onglets —
// salaires + options fiscales (CELIAPP/FE) → Impôts ; enfants (REEE) → Enfant ;
// profil détaillé (santé/carrière) → Retraite ; mode de répartition → Budget.

import React from 'react';
import { Card } from '../../ui/Card';
import { showToast } from '../../ui/Toast';
import type { AppState, User } from '../../../types';
import { logAudit } from '../../../services/auditLog';
import { Icon } from '../../ui/Icon';

interface UsersCardProps {
  config: AppState['config'];
  setConfig: (c: AppState['config']) => void;
}

export const UsersCard: React.FC<UsersCardProps> = ({ config, setConfig }) => {
  const [savedProfiles, setSavedProfiles] = React.useState<string[]>([]);
  const [newProfileName, setNewProfileName] = React.useState('');
  const [profileToDelete, setProfileToDelete] = React.useState<string | null>(null);
  // [CPL-1] (Marc 2026-06-11) — passage en couple GATÉ sur une définition CONSCIENTE du partenaire.
  // Avant : « + Ajouter conjoint » créait un placeholder silencieux (age 30, salaires 0) dont la simple
  // PRÉSENCE change la projection (PSV/SRG du conjoint à ses 65 ans, fractionnement, imposition 2 têtes).
  const [showPartnerForm, setShowPartnerForm] = React.useState(false);
  const [partnerDraft, setPartnerDraft] = React.useState({ name: '', age: '', netSalary: '' });
  const addPartner = () => {
    const name = partnerDraft.name.trim();
    const age = Number(partnerDraft.age);
    if (!name || !Number.isFinite(age) || age < 18 || age > 100) {
      showToast('Nom et âge (18-100) du conjoint requis avant de passer en couple.', 'error');
      return;
    }
    const newUsers = [...config.users, {
      name, age,
      grossSalary: 0,
      netSalary: Number(partnerDraft.netSalary) || 0,
      canadaArrivalYear: new Date().getFullYear() - 5,
      color: '#bd7d9c',
    }];
    setConfig({ ...config, users: newUsers as [User, User] });
    setShowPartnerForm(false);
    setPartnerDraft({ name: '', age: '', netSalary: '' });
    showToast(`${name} ajouté(e) — les calculs passent en mode couple.`, 'success');
  };

  React.useEffect(() => {
    try {
      const profiles = JSON.parse(localStorage.getItem('saved_profiles_list') || '[]');
      setSavedProfiles(profiles);
    } catch (err) {
      console.warn('[UsersCard] Restore profiles error:', err);
    }
  }, []);

  const saveProfile = () => {
    if (!newProfileName.trim()) return;
    const profileSlug = `profile_${newProfileName.trim().replace(/\s+/g, '_').toLowerCase()}`;
    localStorage.setItem(profileSlug, JSON.stringify({ config }));

    const newProfiles = [...new Set([...savedProfiles, newProfileName.trim()])];
    setSavedProfiles(newProfiles);
    localStorage.setItem('saved_profiles_list', JSON.stringify(newProfiles));
    logAudit({ field: 'profile', operation: 'add', description: `Profil « ${newProfileName.trim()} » enregistré` });
    setNewProfileName('');
    showToast(`Profil "${newProfileName}" sauvegarde avec succes !`, 'success');
  };

  const loadProfile = (name: string) => {
    const profileSlug = `profile_${name.replace(/\s+/g, '_').toLowerCase()}`;
    try {
      const dataStr = localStorage.getItem(profileSlug);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data.config) {
          setConfig(data.config);
          logAudit({ field: 'config', operation: 'replace', description: `Profil « ${name} » chargé` });
          showToast(`Profil "${name}" charge !`, 'success');
        }
      }
    } catch (err: unknown) {
      console.error('[UsersCard] Profile load error:', err);
      const msg = err instanceof Error ? err.message : 'inconnu';
      showToast(`Erreur sur "${name}": ${msg}`, 'error');
    }
  };

  const deleteProfile = (name: string) => {
    if (profileToDelete !== name) {
      setProfileToDelete(name);
      setTimeout(() => setProfileToDelete(null), 3000);
      return;
    }
    const profileSlug = `profile_${name.replace(/\s+/g, '_').toLowerCase()}`;
    localStorage.removeItem(profileSlug);
    const newProfiles = savedProfiles.filter(p => p !== name);
    setSavedProfiles(newProfiles);
    localStorage.setItem('saved_profiles_list', JSON.stringify(newProfiles));
    setProfileToDelete(null);
  };

  return (
    <Card icon={<Icon name="settings" size={18} />} title="Profils & utilisateurs">

      <div className="mb-6 bg-black/30 p-4 rounded-xl border border-white/5 shadow-inner">
        <h3 className="text-body font-bold text-white mb-3">Profils Enregistres</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {savedProfiles.length === 0 && <span className="text-meta text-ink-500 italic">Aucun profil enregistre.</span>}
          {savedProfiles.map(p => (
            <div key={p} className="flex items-center bg-primary/15 text-info-300 text-meta px-3 py-1.5 rounded-full border border-primary/25">
              <button type="button" className="font-bold cursor-pointer hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => loadProfile(p)} aria-label={`Charger le profil ${p}`}>{p}</button>
              <button
                onClick={() => deleteProfile(p)}
                className={`ml-2 font-bold px-1.5 rounded ${profileToDelete === p ? 'bg-danger-500 text-white' : 'text-white/50 hover:text-danger-400'}`}
                title={profileToDelete === p ? 'Cliquez encore pour confirmer' : 'Supprimer'}
                aria-label={profileToDelete === p ? 'Confirmer la suppression' : `Supprimer le profil ${p}`}
              >
                {profileToDelete === p ? 'Sur?' : '×'}
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nom du profil (ex: Marc & Anna 2026)"
            value={newProfileName}
            onChange={e => setNewProfileName(e.target.value)}
            className="flex-1 bg-white/5 border border-border rounded px-3 py-1.5 text-body text-white"
          />
          <button onClick={saveProfile} className="bg-primary text-dark px-4 py-1.5 rounded text-body font-bold hover:brightness-110">
            Sauvegarder
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-body font-bold text-white">Utilisateurs</h3>
          <div className="flex gap-2">
            {config.users.length > 1 && (
              <button
                onClick={() => {
                  const newUsers = [...config.users];
                  newUsers.pop();
                  setConfig({ ...config, users: newUsers as [User, User] });
                }}
                className="bg-danger-500/15 text-danger-300 px-3 py-1 rounded-card text-meta hover:bg-danger-500/25 transition-colors"
              >
                - Retirer conjoint
              </button>
            )}
            {config.users.length < 2 && (
              <button
                onClick={() => setShowPartnerForm((v) => !v)}
                aria-expanded={showPartnerForm}
                className="bg-success-500/15 text-success-300 px-3 py-1 rounded-card text-meta hover:bg-success-500/25 transition-colors focus-ring"
              >
                + Ajouter conjoint
              </button>
            )}
          </div>
        </div>

        {/* [CPL-1] — définition OBLIGATOIRE du partenaire avant le passage en couple. */}
        {showPartnerForm && config.users.length < 2 && (
          <div className="rounded-card border border-success-500/25 bg-success-500/[0.06] p-4 space-y-3">
            <p className="text-meta text-ink-200 font-bold">Définir le conjoint pour passer en couple</p>
            <p className="text-tiny text-ink-400">
              ⚠️ Passer en couple change les calculs : imposition par conjoint, rentes RRQ/PSV/SRG du
              partenaire, fractionnement de pension. Un conjoint même sans revenu a un impact (rentes d'État).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-tiny uppercase tracking-wider text-ink-400 font-semibold">Nom *</span>
                <input
                  type="text"
                  value={partnerDraft.name}
                  onChange={(e) => setPartnerDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="ex: Anna"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-body text-white focus:border-primary outline-none"
                />
              </label>
              <label className="block">
                <span className="text-tiny uppercase tracking-wider text-ink-400 font-semibold">Âge *</span>
                <input
                  type="number"
                  min={18}
                  max={100}
                  value={partnerDraft.age}
                  onChange={(e) => setPartnerDraft((p) => ({ ...p, age: e.target.value }))}
                  placeholder="ex: 32"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-body text-white focus:border-primary outline-none"
                />
              </label>
              <label className="block">
                <span className="text-tiny uppercase tracking-wider text-ink-400 font-semibold">Salaire net /mois</span>
                <input
                  type="number"
                  min={0}
                  value={partnerDraft.netSalary}
                  onChange={(e) => setPartnerDraft((p) => ({ ...p, netSalary: e.target.value }))}
                  placeholder="0 si sans revenu"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-body text-white focus:border-primary outline-none"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addPartner}
                disabled={!partnerDraft.name.trim() || !partnerDraft.age}
                className="min-h-[44px] bg-primary text-dark px-4 py-1.5 rounded-card text-meta font-bold hover:brightness-110 transition-all focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Créer le profil conjoint
              </button>
              <button
                onClick={() => { setShowPartnerForm(false); setPartnerDraft({ name: '', age: '', netSalary: '' }); }}
                className="min-h-[44px] px-3 py-1.5 rounded-card text-meta text-ink-400 hover:text-ink-100 transition-colors focus-ring"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {config.users.map((user, idx) => (
            <div
              key={idx}
              data-focus-section={`profile-user${idx + 1}-card`}
              className="flex flex-col gap-2 p-3 bg-white/5 rounded-card border border-border h-full"
            >
              <div className="font-bold text-white mb-2 border-b border-white/5 pb-1">Utilisateur {idx + 1}</div>
              <div data-focus-section={`profile-user${idx + 1}-name`}>
                <label className="text-meta text-ink-300">Nom</label>
                <input
                  type="text"
                  value={user.name}
                  onChange={(e) => {
                    const newUsers = [...config.users] as [User, User];
                    newUsers[idx] = { ...user, name: e.target.value };
                    setConfig({ ...config, users: newUsers });
                  }}
                  className="w-full bg-dark border border-border rounded px-2 py-1 text-body text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div data-focus-section={`profile-user${idx + 1}-age`}>
                  <label className="text-meta text-ink-300">Age actuel</label>
                  <input
                    type="number"
                    value={user.age || 30}
                    onChange={(e) => {
                      const newUsers = [...config.users] as [User, User];
                      newUsers[idx] = { ...user, age: parseInt(e.target.value) || 30 };
                      setConfig({ ...config, users: newUsers });
                    }}
                    className="w-full bg-dark border border-border rounded px-2 py-1 text-body text-white font-mono"
                    min={18} max={80}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-meta text-warning-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!user.isImmigrant}
                      onChange={(e) => {
                        const newUsers = [...config.users] as [User, User];
                        newUsers[idx] = { ...user, isImmigrant: e.target.checked };
                        setConfig({ ...config, users: newUsers });
                      }}
                      className="w-3.5 h-3.5 rounded"
                    />
                    Immigré au Canada
                  </label>
                  {user.isImmigrant && (
                    <input
                      type="number"
                      value={user.canadaArrivalYear || ''}
                      onChange={(e) => {
                        const newUsers = [...config.users] as [User, User];
                        newUsers[idx] = { ...user, canadaArrivalYear: parseInt(e.target.value) || undefined };
                        setConfig({ ...config, users: newUsers });
                      }}
                      className="w-full mt-1 bg-dark border border-border rounded px-2 py-1 text-body text-white font-mono"
                      min={1950} max={new Date().getFullYear()}
                      placeholder="Année de résidence fiscale (ex: 2018)"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-meta text-ink-500 italic">
          Salaires &amp; options fiscales → onglet <strong className="text-ink-300">Impôts</strong> · Enfants (REEE) →
          {' '}<strong className="text-ink-300">Enfant</strong> · Profil détaillé (santé/carrière) →
          {' '}<strong className="text-ink-300">Retraite</strong> · Mode de répartition → <strong className="text-ink-300">Budget</strong>.
        </p>
      </div>
    </Card>
  );
};
