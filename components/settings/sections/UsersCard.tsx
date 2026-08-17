// components/settings/sections/UsersCard.tsx
// Carte « Utilisateurs » : identité de base par personne (nom, âge, immigré) + ajout/retrait
// du conjoint.
// PH3/PH3-c : TOUT le setup utilisateur vit dans l'onglet PROFIL (salaires, fiscal, répartition,
// carrière & rémunération variable, retraite, enfants).
// ⚠️ [PROFIL-SOUS-ONGLETS 2026-08-17] Les PROFILS ENREGISTRÉS ont quitté ce fichier pour
// `components/profile/SavedProfilesCard.tsx` : ils n'ont rien à voir avec l'identité des personnes
// et vivent désormais dans un autre sous-onglet. Ne PAS les réintroduire ici.

import React from 'react';
import { Card } from '../../ui/Card';
import { showToast } from '../../ui/Toast';
import type { AppState, User } from '../../../types';
import { Icon } from '../../ui/Icon';

interface UsersCardProps {
  config: AppState['config'];
  setConfig: (c: AppState['config']) => void;
}

export const UsersCard: React.FC<UsersCardProps> = ({ config, setConfig }) => {
  // [CPL-1] (Marc 2026-06-11) — passage en couple GATÉ sur une définition CONSCIENTE du partenaire.
  // Avant : « + Ajouter conjoint » créait un placeholder silencieux (age 30, salaires 0) dont la simple
  // PRÉSENCE change la projection (PSV/SRG du conjoint à ses 65 ans, fractionnement, imposition 2 têtes).
  const [showPartnerForm, setShowPartnerForm] = React.useState(false);
  const [partnerDraft, setPartnerDraft] = React.useState({ name: '', age: '', netSalary: '' });
  const partnerToggleRef = React.useRef<HTMLButtonElement>(null);
  const addPartner = () => {
    const name = partnerDraft.name.trim();
    // Revue #245 — âge ENTIER (cohérent avec l'éditeur existant en parseInt).
    const age = Math.round(Number(partnerDraft.age));
    if (!name || !Number.isFinite(age) || age < 18 || age > 100) {
      showToast('Nom et âge (18-100) du conjoint requis avant de passer en couple.', 'error');
      return;
    }
    const newUsers = [...config.users, {
      name, age,
      grossSalary: 0,
      // Revue #245 — pas de négatif (min={0} de l'input ne bloque pas la saisie clavier).
      netSalary: Math.max(0, Number(partnerDraft.netSalary) || 0),
      // Revue #245 — PAS de canadaArrivalYear par défaut : ce champ alimente le prorata
      // RRQ/PSV (résidence) ; un « arrivé il y a 5 ans » fantôme sous-estimerait les rentes.
      // Laisser vide force une saisie explicite si « Immigré » est coché ensuite.
      color: '#bd7d9c',
    }];
    setConfig({ ...config, users: newUsers as [User, User] });
    setShowPartnerForm(false);
    setPartnerDraft({ name: '', age: '', netSalary: '' });
    showToast(`${name} ajouté(e) — les calculs passent en mode couple.`, 'success');
  };
  const cancelPartnerForm = () => {
    setShowPartnerForm(false);
    setPartnerDraft({ name: '', age: '', netSalary: '' });
    // Revue #245 (a11y M2) — refocus le toggle au cancel (le panneau qui contenait le focus disparaît).
    partnerToggleRef.current?.focus();
  };

  return (
    <Card icon={<Icon name="users" size={18} />} title="Utilisateurs">

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
                className="bg-danger-500/15 text-danger-400 min-h-[44px] px-3 py-1 rounded-card text-meta hover:bg-danger-500/25 transition-colors focus-ring"
              >
                - Retirer conjoint
              </button>
            )}
            {config.users.length < 2 && (
              <button
                ref={partnerToggleRef}
                onClick={() => setShowPartnerForm((v) => !v)}
                aria-expanded={showPartnerForm}
                className="bg-success-500/15 text-success-400 min-h-[44px] px-3 py-1 rounded-card text-meta hover:bg-success-500/25 transition-colors focus-ring"
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
                onClick={cancelPartnerForm}
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
                <label htmlFor={`uc-name-${idx}`} className="text-meta text-ink-300">Nom</label>
                <input
                  id={`uc-name-${idx}`}
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
                  <label htmlFor={`uc-age-${idx}`} className="text-meta text-ink-300">Age actuel</label>
                  <input
                    id={`uc-age-${idx}`}
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
                  <label className="flex items-center gap-2 text-meta text-warning-400 cursor-pointer">
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

        <p className="text-meta text-ink-400 italic">
          {/* PH3/PH3-c — libellé re-véridifié : tout le setup vit désormais dans CET onglet Profil. */}
          Salaires &amp; options fiscales, carrière &amp; rémunération variable, retraite, enfants (REEE) et
          mode de répartition : sections suivantes de cet onglet <strong className="text-ink-300">Profil</strong>.
        </p>
      </div>
    </Card>
  );
};
