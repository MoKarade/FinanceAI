// components/profile/SavedProfilesCard.tsx
// [PROFIL-SOUS-ONGLETS] Profils enregistrés (localStorage), EXTRAIT de `UsersCard`.
//
// ⚠️ POURQUOI CETTE EXTRACTION. `UsersCard` mélangeait deux sujets sans rapport dans une seule
// Card de 338 lignes : l'IDENTITÉ des personnes (nom, âge, immigration, ajout de conjoint) et la
// gestion de snapshots de configuration. Le découpage de Profil en sous-onglets (décision Marc
// 2026-08-17, `docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`) les envoie dans deux onglets différents — il fallait donc
// séparer le composant, pas seulement l'affichage.
//
// ⚠️ MIGRATION UI PURE : mêmes clés localStorage (`saved_profiles_list`, `profile_<slug>`), même
// slug, mêmes journaux, même sémantique de suppression à double clic. Aucune donnée n'est touchée,
// et un profil enregistré avant ce refactor reste lisible après.
import React from 'react';
import { Card } from '../ui/Card';
import { showToast } from '../ui/Toast';
import { Icon } from '../ui/Icon';
import type { AppState } from '../../types';
import { logAudit } from '../../services/auditLog';
import { logError } from '../../services/errorLogger';

interface SavedProfilesCardProps {
    config: AppState['config'];
    setConfig: (c: AppState['config']) => void;
}

/** Slug de la clé localStorage d'un profil. Source UNIQUE — les trois opérations (enregistrer,
 *  charger, supprimer) doivent dériver la clé de la MÊME façon, sinon un profil devient
 *  inaccessible ou indéboulonnable. C'était déjà le cas dans `UsersCard`, mais la formule y était
 *  recopiée trois fois : l'extraire supprime la possibilité qu'une des trois dérive. */
const profileKey = (name: string): string => `profile_${name.replace(/\s+/g, '_').toLowerCase()}`;

export const SavedProfilesCard: React.FC<SavedProfilesCardProps> = ({ config, setConfig }) => {
    const [savedProfiles, setSavedProfiles] = React.useState<string[]>([]);
    const [newProfileName, setNewProfileName] = React.useState('');
    const [profileToDelete, setProfileToDelete] = React.useState<string | null>(null);

    React.useEffect(() => {
        try {
            const profiles = JSON.parse(localStorage.getItem('saved_profiles_list') || '[]');
            // Revue #245 (B2) — JSON valide mais non-tableau (donnée corrompue) → garde + journal,
            // sinon crash .map au render.
            if (Array.isArray(profiles)) {
                setSavedProfiles(profiles);
            } else {
                logError({ source: 'storage', severity: 'warning', message: 'SavedProfilesCard: saved_profiles_list n\'est pas un tableau (corrompu) — ignoré.' });
            }
        } catch (err) {
            // [SF-WARN] — liste de profils corrompue dans localStorage → logError (journal app).
            logError({ source: 'storage', severity: 'warning', message: 'SavedProfilesCard: liste des profils sauvegardés illisible (localStorage).', error: err instanceof Error ? err : new Error(String(err)) });
        }
    }, []);

    const saveProfile = () => {
        const name = newProfileName.trim();
        if (!name) return;
        localStorage.setItem(profileKey(name), JSON.stringify({ config }));

        const newProfiles = [...new Set([...savedProfiles, name])];
        setSavedProfiles(newProfiles);
        localStorage.setItem('saved_profiles_list', JSON.stringify(newProfiles));
        logAudit({ field: 'profile', operation: 'add', description: `Profil « ${name} » enregistré` });
        setNewProfileName('');
        showToast(`Profil « ${name} » sauvegardé.`, 'success');
    };

    const loadProfile = (name: string) => {
        try {
            const dataStr = localStorage.getItem(profileKey(name));
            if (dataStr) {
                const data = JSON.parse(dataStr);
                if (data.config) {
                    setConfig(data.config);
                    logAudit({ field: 'config', operation: 'replace', description: `Profil « ${name} » chargé` });
                    showToast(`Profil « ${name} » chargé.`, 'success');
                } else {
                    // Revue #245 (B3) — profil présent mais SANS config : avant, clic = rien (muet).
                    logError({ source: 'storage', severity: 'warning', message: `SavedProfilesCard: profil « ${name} » sans données config.` });
                    showToast(`Le profil « ${name} » est vide ou invalide.`, 'error');
                }
            } else {
                // Profil listé mais clé absente du localStorage (désynchronisation).
                logError({ source: 'storage', severity: 'warning', message: `SavedProfilesCard: profil « ${name} » introuvable (clé absente).` });
                showToast(`Le profil « ${name} » est introuvable.`, 'error');
            }
        } catch (err: unknown) {
            // Revue #245 (B3) — journal app en plus du toast (console.error ne laissait pas de trace).
            logError({ source: 'storage', severity: 'warning', message: `SavedProfilesCard: échec de chargement du profil « ${name} ».`, error: err instanceof Error ? err : new Error(String(err)) });
            const msg = err instanceof Error ? err.message : 'inconnu';
            showToast(`Erreur sur « ${name} » : ${msg}`, 'error');
        }
    };

    const deleteProfile = (name: string) => {
        // Suppression à DOUBLE clic (2e clic dans les 3 s) — comportement inchangé.
        if (profileToDelete !== name) {
            setProfileToDelete(name);
            setTimeout(() => setProfileToDelete(null), 3000);
            return;
        }
        localStorage.removeItem(profileKey(name));
        const newProfiles = savedProfiles.filter((p) => p !== name);
        setSavedProfiles(newProfiles);
        localStorage.setItem('saved_profiles_list', JSON.stringify(newProfiles));
        setProfileToDelete(null);
    };

    return (
        <Card icon={<Icon name="settings" size={18} />} title="Profils enregistrés">
            <p className="text-meta text-ink-300 mb-3 leading-snug">
                Un profil est une photo de ta configuration — pratique pour comparer deux situations
                (célibataire / en couple) sans perdre l'autre. Charger un profil REMPLACE ta config actuelle.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
                {savedProfiles.length === 0 && <span className="text-meta text-ink-400 italic">Aucun profil enregistré.</span>}
                {savedProfiles.map((p) => (
                    <div key={p} className="flex items-center bg-primary/15 text-info-400 text-meta px-3 py-1.5 rounded-full border border-primary/25">
                        <button type="button" className="font-bold cursor-pointer hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => loadProfile(p)} aria-label={`Charger le profil ${p}`}>{p}</button>
                        <button
                            type="button"
                            onClick={() => deleteProfile(p)}
                            className={`ml-2 font-bold px-1.5 rounded ${profileToDelete === p ? 'bg-danger-600 text-white' : 'text-white/50 hover:text-danger-400'}`}
                            title={profileToDelete === p ? 'Clique encore pour confirmer' : 'Supprimer'}
                            aria-label={profileToDelete === p ? 'Confirmer la suppression' : `Supprimer le profil ${p}`}
                        >
                            {profileToDelete === p ? 'Sûr ?' : '×'}
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    aria-label="Nom du profil à sauvegarder"
                    placeholder="Nom du profil (ex: Marc & Anna 2026)"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="flex-1 bg-white/5 border border-border rounded px-3 py-1.5 text-body text-white"
                />
                <button type="button" onClick={saveProfile} className="bg-primary text-dark px-4 py-1.5 rounded text-body font-bold hover:brightness-110 focus-ring">
                    Sauvegarder
                </button>
            </div>
        </Card>
    );
};
