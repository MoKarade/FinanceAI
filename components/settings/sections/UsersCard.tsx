// components/settings/sections/UsersCard.tsx
// Carte « Utilisateurs » : identité de base par personne (nom, âge, immigré) + ajout/retrait
// du conjoint.
// PH3/PH3-c : TOUT le setup utilisateur vit dans l'onglet PROFIL (salaires, fiscal, répartition,
// carrière & rémunération variable, retraite, enfants).
// ⚠️ [PROFIL-SOUS-ONGLETS 2026-08-17] Les PROFILS ENREGISTRÉS ont quitté ce fichier pour
// `components/profile/SavedProfilesCard.tsx` : ils n'ont rien à voir avec l'identité des personnes
// et vivent désormais dans un autre sous-onglet. Ne PAS les réintroduire ici.

import React from 'react';
import { PrivateNumberInput } from '../../ui/PrivateNumberInput';
import { showToast } from '../../ui/Toast';
import type { AppState, User } from '../../../types';

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

  const retirerConjoint = () => {
    const newUsers = [...config.users];
    newUsers.pop();
    setConfig({ ...config, users: newUsers as [User, User] });
  };
  const majUser = (idx: number, patch: Partial<User>) => {
    const newUsers = [...config.users] as [User, User];
    newUsers[idx] = { ...config.users[idx], ...patch };
    setConfig({ ...config, users: newUsers });
  };
  // [S5-REFONTE-PROFIL] Champs des maquettes : 44 px de haut, fond page, bordure douce.
  const CHAMP = 'w-full h-11 px-3.5 rounded-[10px] border border-white/10 bg-dark text-body text-ink-50 focus-ring';

  return (
    <section aria-labelledby="profil-utilisateurs" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="profil-utilisateurs" className="text-[18px] font-semibold text-ink-50">Utilisateurs</h2>
          {config.users.length < 2 && (
            <button
              ref={partnerToggleRef}
              onClick={() => setShowPartnerForm((v) => !v)}
              aria-expanded={showPartnerForm}
              className="min-h-[44px] px-4 rounded-lg border border-white/40 text-body text-ink-100 hover:bg-white/5 transition-colors focus-ring"
            >
              + Ajouter un conjoint
            </button>
          )}
        </div>

        {/* [CPL-1] — définition OBLIGATOIRE du partenaire avant le passage en couple. */}
        {showPartnerForm && config.users.length < 2 && (
          <div className="rounded-card border border-success-500/25 bg-success-500/6 p-4 space-y-3">
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
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-sm px-3 py-2 text-body text-white focus:border-primary outline-hidden"
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
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-sm px-3 py-2 text-body text-white focus:border-primary outline-hidden"
                />
              </label>
              <label className="block" htmlFor="partner-netSalary">
                <span className="text-tiny uppercase tracking-wider text-ink-400 font-semibold">Salaire net /mois</span>
                <PrivateNumberInput
                  id="partner-netSalary"
                  type="number"
                  min={0}
                  value={partnerDraft.netSalary}
                  onChange={(e) => setPartnerDraft((p) => ({ ...p, netSalary: e.target.value }))}
                  placeholder="0 si sans revenu"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-sm px-3 py-2 text-body text-white focus:border-primary outline-hidden"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {config.users.map((user, idx) => (
            <div
              key={idx}
              data-focus-section={`profile-user${idx + 1}-card`}
              className="premium-card rounded-2xl p-5 sm:p-6 flex flex-col gap-4 h-full"
            >
              <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-dark shrink-0 ${idx === 0 ? 'bg-[#34b39a]' : 'bg-[#7c93f2]'}`} aria-hidden="true">
                  {(user.name || '?').trim().charAt(0).toUpperCase() || '?'}
                </span>
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-meta text-ink-400">Utilisateur {idx + 1}</span>
                  <span className="text-[18px] font-semibold text-ink-50 truncate">{user.name || '—'}</span>
                </div>
                {idx === 1 && (
                  <button type="button" onClick={retirerConjoint} className="text-meta text-ink-300 underline underline-offset-2 hover:text-danger-400 focus-ring rounded-sm">
                    Retirer le conjoint
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_88px] sm:grid-cols-[minmax(0,1fr)_140px] gap-3">
                <div data-focus-section={`profile-user${idx + 1}-name`} className="flex flex-col gap-1.5">
                  <label htmlFor={`uc-name-${idx}`} className="text-[13px] text-ink-300">Nom</label>
                  <input id={`uc-name-${idx}`} type="text" value={user.name} onChange={(e) => majUser(idx, { name: e.target.value })} className={CHAMP} />
                </div>
                <div data-focus-section={`profile-user${idx + 1}-age`} className="flex flex-col gap-1.5">
                  <label htmlFor={`uc-age-${idx}`} className="text-[13px] text-ink-300">Âge actuel</label>
                  <input id={`uc-age-${idx}`} type="number" value={user.age || 30} onChange={(e) => majUser(idx, { age: parseInt(e.target.value) || 30 })} className={`${CHAMP} font-mono`} min={18} max={80} />
                </div>
              </div>
              <div className="rounded-[10px] bg-surface border border-white/6 p-3.5 flex flex-col gap-2.5">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-body text-ink-100">Immigré au Canada</span>
                    <span className="text-meta text-ink-400">Coché : demande l’année de résidence fiscale au Canada</span>
                  </span>
                  {/* Case native (sémantique conservée) habillée en interrupteur. */}
                  <input
                    type="checkbox"
                    checked={!!user.isImmigrant}
                    onChange={(e) => majUser(idx, { isImmigrant: e.target.checked })}
                    className="appearance-none shrink-0 relative w-11 h-[26px] rounded-full bg-surfaceHighlight border border-white/15 cursor-pointer transition-colors checked:bg-success-500 checked:border-success-500 focus-ring before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:w-[18px] before:h-[18px] before:rounded-full before:bg-ink-400 before:transition-transform checked:before:translate-x-[18px] checked:before:bg-white"
                  />
                </label>
                {user.isImmigrant && (
                  <input
                    aria-label={`Année de résidence fiscale au Canada — ${user.name || `conjoint ${idx + 1}`}`}
                    type="number"
                    value={user.canadaArrivalYear || ''}
                    onChange={(e) => majUser(idx, { canadaArrivalYear: parseInt(e.target.value) || undefined })}
                    className={`${CHAMP} font-mono`}
                    min={1950} max={new Date().getFullYear()}
                    placeholder="Année de résidence fiscale (ex. 2018)"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[13px] text-ink-400">
          {/* PH3/PH3-c — tout le setup vit dans CET onglet Profil. */}
          Salaires et options fiscales, carrière et rémunération variable, retraite, enfants (REEE) et mode de
          répartition : onglets suivants de ce Profil.
        </p>
    </section>
  );
};
