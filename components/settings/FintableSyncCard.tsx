// components/settings/FintableSyncCard.tsx
//
// [FINTABLE-7] Écran de configuration de la sync bancaire Fintable, exécutée DANS LE NAVIGATEUR.
//
// Remplace ce que Marc devait faire à la main : écrire un `.fintable-roles.json`, le pousser en
// secret Google Cloud, créer un secret GitHub, redéployer Cloud Run. Ici : coller le jeton, cliquer
// « Tester », choisir un rôle par compte, synchroniser.
//
// ⚠️ AUCUN MONTANT n'est affiché dans cette carte — ni solde de compte, ni total. Assigner un rôle
// ne demande que le NOM et le TYPE du compte, donc afficher des soldes n'apporterait rien et
// ouvrirait une surface à garder en mode discret (règle Loi 25 : masquer = ne PAS rendre la valeur).
// Le seul chiffre montré est un COMPTE d'éléments (nb de transactions), jamais de l'argent.
//
// ⚠️ Les services lourds (mapper, `applyDocument`, client HTTP) sont chargés en import DYNAMIQUE au
// premier clic — via `importWithRetry`, pas un `await import()` nu : après un déploiement, un chunk
// périmé donnerait sinon un 404 en boucle (leçon AITOOLS-E).

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import { importWithRetry, isChunkLoadError } from '../../utils/lazyWithRetry';
import { referenceDeltaPatch } from '../../services/fintable/applyStatePatch';
import { acquireFintableSyncLock, releaseFintableSyncLock } from '../../services/fintable/autoSync';
import { saveApiKeys } from '../../services/secureKeyStore';
import { logError } from '../../services/errorLogger';
import type { AppState, FintableAccountRoleConfig } from '../../types';

/** Ce que l'écran de configuration a besoin de savoir d'un compte — jamais son solde. */
interface SetupAccount {
    id: string;
    label: string;
    rawType: string;
    currency: string;
}

type RoleKind = FintableAccountRoleConfig['kind'];

const ROLE_LABELS: Record<RoleKind, string> = {
    cash: 'Liquidités',
    debt: 'Dette (carte)',
    investment: 'Placement',
    ignore: 'Ignorer',
};

/** Marc, 2026-07-30 : « c'est tout non enregistré pour le moment » → défaut le plus probable. */
const DEFAULT_REGIME = 'NON-ENREG' as const;

function roleOf(roles: Record<string, FintableAccountRoleConfig> | undefined, id: string): FintableAccountRoleConfig | undefined {
    return roles?.[id];
}

export const FintableSyncCard: React.FC = () => {
    const apiKeys = useFinanceStore((s) => s.apiKeys);
    const fintableRoles = useFinanceStore((s) => s.fintableRoles);
    const report = useFinanceStore((s) => s.fintableSyncReport);
    const setAppState = useFinanceStore((s) => s.setAppState);
    const isTestMode = useFinanceStore((s) => s.isTestMode);

    const [token, setToken] = useState(apiKeys?.fintable ?? '');
    const [accounts, setAccounts] = useState<SetupAccount[] | null>(null);
    const [busy, setBusy] = useState<'idle' | 'testing' | 'syncing'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    // [FINTABLE-TOKEN-PERSIST, finding #2 panel #559] Canal SÉPARÉ de `error` : une panne de coffre
    // était écrasée par l'erreur réseau suivante (mesuré : double panne → le message « non
    // sauvegardé » disparaissait totalement de l'UI). Deux causes distinctes = deux messages.
    const [persistError, setPersistError] = useState<string | null>(null);

    /** Une valeur saisie n'a pas encore atteint le coffre (finding #1 : flush au départ de la page). */
    const pendingRef = useRef(false);
    /** Chaîne de sérialisation des écritures (finding #3 : sinon un blob PÉRIMÉ peut gagner la course). */
    const persistChainRef = useRef<Promise<void>>(Promise.resolve());

    const saveToken = (value: string) => {
        setToken(value);
        pendingRef.current = true;
        setAppState({ apiKeys: { ...apiKeys, fintable: value } });
    };

    // [FINTABLE-TOKEN-PERSIST] Le jeton doit SURVIVRE au rechargement, comme les autres clés :
    // même coffre chiffré (secureKeyStore). Incident réel 2026-08-05 : saveToken n'écrivait que le
    // store MÉMOIRE (le champ `fintable` du coffre existait depuis #535, l'hydratation le lisait
    // depuis #545, mais AUCUNE écriture n'y était branchée) → au reload, jeton disparu → sync
    // « jeton absent » en boucle, import bancaire gelé 5 jours sans alerte. Persistance au BLUR
    // (pas à chaque frappe — un chiffrement AES par touche) + avant Tester/Synchroniser (le clic
    // blur déjà l'input, ceinture). Échec de coffre AFFICHÉ, jamais avalé (pattern App.tsx
    // handleUpdateApiKeys).
    // ⚠️ Panel #559 — le premier jet ne couvrait QUE le blur, et rouvrait le MÊME symptôme par 3 trous
    // (mesurés) : (1) fermer l'onglet ou naviguer n'émet AUCUN blur sur l'input (ni un autofill de
    // gestionnaire de mots de passe) → jeton perdu comme avant ; (2) une panne de coffre était écrasée
    // par l'erreur suivante et n'était jamais loguée → invisible même dans Diagnostics ; (3) deux
    // écritures concurrentes n'étaient pas ordonnées → le blob PÉRIMÉ pouvait gagner. C'est la leçon
    // « trajet COMPLET d'un secret » (CONVENTIONS) appliquée à elle-même.
    const persistToken = useCallback((): Promise<void> => {
        const run = async (): Promise<void> => {
            try {
                // getState() lu À L'EXÉCUTION (pas capturé) : sérialisées, deux écritures en attente
                // convergent sur la MÊME valeur, la plus fraîche.
                await saveApiKeys(useFinanceStore.getState().apiKeys);
                pendingRef.current = false;
                setPersistError(null);
            } catch (e: unknown) {
                pendingRef.current = true; // pas dans le coffre : on retentera au prochain flush
                const msg = e instanceof Error ? e.message : '';
                // Trace DURABLE (Réglages → Diagnostics) : un message d'UI peut être remplacé, pas ça.
                logError({
                    source: 'storage', severity: 'error',
                    message: '[FINTABLE-TOKEN-PERSIST] Écriture du jeton dans le coffre chiffré échouée.',
                    error: e instanceof Error ? e : new Error(String(e)),
                });
                setPersistError(msg
                    ? `Jeton non sauvegardé (${msg}) — il restera valide jusqu'au rechargement.`
                    : 'Jeton non sauvegardé : coffre chiffré indisponible — il restera valide jusqu\'au rechargement.');
            }
        };
        // Sérialisation stricte (finding #3) : l'ordre d'émission est l'ordre d'écriture.
        persistChainRef.current = persistChainRef.current.then(run, run);
        return persistChainRef.current;
    }, []);

    // [finding #1 panel #559] Le blur ne couvre PAS le départ de la page ni la navigation interne.
    // `visibilitychange:hidden` arrive au changement d'onglet/minimisation (bien avant une fermeture
    // réelle) et le cleanup couvre le démontage (changement d'onglet DANS l'app, palette de commandes).
    // ⚠️ Limite honnête : `saveApiKeys` est asynchrone (chiffrement AES + IndexedDB) — sur une
    // fermeture BRUTALE, rien ne garantit qu'elle aboutisse. On réduit la fenêtre, on ne la ferme pas.
    useEffect(() => {
        const flush = (): void => { if (pendingRef.current) void persistToken(); };
        const onVisibility = (): void => { if (document.visibilityState === 'hidden') flush(); };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', flush);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [persistToken]);

    const setRole = (id: string, next: FintableAccountRoleConfig | undefined) => {
        const roles = { ...(fintableRoles ?? {}) };
        if (next === undefined) delete roles[id];
        else roles[id] = next;
        setAppState({ fintableRoles: roles });
    };

    const handleTest = async () => {
        setBusy('testing'); setError(null); setNotice(null);
        await persistToken(); // ceinture : un jeton testé est un jeton qu'on veut garder
        try {
            const { listFintableAccountsForSetup } = await importWithRetry(
                () => import('../../services/fintable/browserSync'), 'fintable-sync',
            );
            const res = await listFintableAccountsForSetup(token);
            if (res.error !== null) { setError(res.error); setAccounts(null); return; }
            setAccounts(res.accounts.map((a) => ({
                id: a.id, label: a.label, rawType: a.rawType, currency: a.currency,
            })));
            setNotice(`${res.accounts.length} compte(s) actif(s) trouvé(s).`);
        } catch (err) {
            setError(isChunkLoadError(err)
                ? 'Nouvelle version de l\'app disponible — recharge la page puis réessaie.'
                : 'Impossible de joindre Fintable. Vérifie ta connexion, puis réessaie.');
            logError({ source: 'ui', severity: 'warning', message: '[FINTABLE-7] Test de connexion échoué.' });
        } finally { setBusy('idle'); }
    };

    const handleSync = async () => {
        // [Finding code-reviewer #545, CRITIQUE] Verrou PARTAGÉ avec la sync AUTO : sans lui, une
        // passe manuelle lancée pendant la passe auto (fenêtre réseau de plusieurs secondes)
        // calculerait son patch sur une base figée → dernier-écrivain-gagne sur transactions/soldes.
        if (!acquireFintableSyncLock()) {
            setError('Une synchronisation est déjà en cours — réessaie dans un instant.');
            return;
        }
        setBusy('syncing'); setError(null); setNotice(null);
        await persistToken(); // ceinture : idem handleTest
        try {
            const { runFintableBrowserSync } = await importWithRetry(
                () => import('../../services/fintable/browserSync'), 'fintable-sync',
            );
            // L'état courant est relu au moment du clic (pas capturé au rendu) : une passe qui
            // écrirait par-dessus un état périmé perdrait ce qui a changé entre-temps.
            const current = useFinanceStore.getState() as unknown as AppState;
            const { report: fresh, nextState } = await runFintableBrowserSync(current, token);
            // [Finding security-privacy #545] Mode démo activé PENDANT le fetch → ne RIEN écrire
            // (de vraies données dans une session persona = l'inverse de PERSONA-PURGE).
            if (useFinanceStore.getState().isTestMode === true) {
                setError('Mode démo activé pendant la synchronisation — rien n\'a été écrit.');
                return;
            }
            if (nextState === null) {
                // Échec : on écrit LE RAPPORT seul (pour que la carte de diagnostic le montre), et
                // surtout AUCUN contenu — `nextState: null` signifie « rien d'exploitable ».
                setAppState({ fintableSyncReport: fresh });
                setError(fresh.error ?? 'La synchronisation a échoué.');
                return;
            }
            // Delta par IDENTITÉ DE RÉFÉRENCE — helper PARTAGÉ avec la sync auto quotidienne
            // ([FINTABLE-7 Lot 3], `services/fintable/applyStatePatch.ts`, qui porte le pourquoi :
            // finding silent-failure PR #536, jamais de liste de clés à la main).
            setAppState(referenceDeltaPatch(current, nextState));
            setNotice(`Synchronisé : ${fresh.transactionsAdded} transaction(s) ajoutée(s).`);
        } catch (err) {
            setError(isChunkLoadError(err)
                ? 'Nouvelle version de l\'app disponible — recharge la page puis réessaie.'
                : 'La synchronisation a échoué. Réessaie dans un moment.');
            logError({ source: 'ui', severity: 'error', message: '[FINTABLE-7] Synchronisation manuelle échouée.' });
        } finally { releaseFintableSyncLock(); setBusy('idle'); }
    };

    const unassigned = (accounts ?? []).filter((a) => roleOf(fintableRoles, a.id) === undefined).length;

    return (
        <Card icon={<Icon name="import" size={18} />} title="Sync bancaire Fintable">
            <div className="space-y-4">
                <p className="text-meta text-ink-400">
                    Importe automatiquement tes transactions, tes liquidités et le solde de tes cartes.
                    Tout se passe dans le navigateur : rien à configurer ailleurs.
                </p>

                {isTestMode && (
                    <div role="status" className="text-meta text-warning-400 bg-warning-500/10 border border-warning-500/20 rounded-lg px-3 py-2">
                        Mode démo actif : la synchronisation est désactivée pour ne pas mélanger des données
                        de démonstration avec tes vraies données.
                    </div>
                )}

                {/* [FINTABLE-STALE-ALERT] Cible du deep-link de la bannière d'Accueil. */}
                <div data-focus-section="fintable-sync">
                    <label htmlFor="fintable-token" className="block text-body text-ink-300 mb-1">
                        Jeton Fintable (lecture seule)
                    </label>
                    <input
                        id="fintable-token"
                        type="password"
                        value={token}
                        onChange={(e) => saveToken(e.target.value)}
                        onBlur={() => { void persistToken(); }}
                        className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        placeholder="ft_..."
                        aria-describedby="fintable-token-help"
                    />
                    <p id="fintable-token-help" className="text-meta text-ink-400 mt-1">
                        Crée-le dans Fintable → Dashboard → API, en <strong>lecture seule</strong>. Il reste sur
                        cet appareil (chiffré) et n'est jamais synchronisé.
                    </p>
                </div>

                {/* ⚠️ [finding a11y-auditor, PR #536] Un bouton désactivé ne dit QUE « estompé » à un
                    lecteur d'écran. La raison est donc explicitée dans un texte lié par
                    `aria-describedby`, mis à jour selon ce qui bloque réellement. */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => { void handleTest(); }}
                        disabled={busy !== 'idle' || token.trim() === ''}
                        aria-describedby="fintable-actions-why"
                        className="px-3 py-2 bg-info-500/15 hover:bg-info-500/25 border border-info-500/30 rounded-card text-info-400 text-meta font-bold transition-colors focus-ring disabled:opacity-50"
                    >
                        {busy === 'testing' ? 'Test en cours…' : 'Tester la connexion'}
                    </button>
                    <button
                        type="button"
                        onClick={() => { void handleSync(); }}
                        disabled={busy !== 'idle' || token.trim() === '' || isTestMode}
                        aria-describedby="fintable-actions-why"
                        className="px-3 py-2 bg-primary/90 hover:bg-primary text-dark rounded-card text-meta font-bold transition-colors focus-ring disabled:opacity-50"
                    >
                        {busy === 'syncing' ? 'Synchronisation…' : 'Synchroniser maintenant'}
                    </button>
                </div>
                <p id="fintable-actions-why" className="sr-only">
                    {token.trim() === ''
                        ? 'Ces actions nécessitent un jeton Fintable.'
                        : isTestMode
                            ? 'La synchronisation est indisponible en mode démo.'
                            : busy !== 'idle'
                                ? 'Une opération est déjà en cours.'
                                : 'Prêt.'}
                </p>

                {/* ⚠️ [finding a11y-auditor, PR #536] Régions live montées en PERMANENCE, dont le
                    TEXTE change — une région insérée dans le DOM au moment du résultat n'est pas
                    annoncée de façon fiable par tous les lecteurs d'écran (WCAG 4.1.3). Quand elles
                    sont vides, `sr-only` les retire visuellement sans les démonter. Une seule région
                    par canal (alerte / statut) → aucune double annonce du même message. */}
                <div
                    role="alert"
                    aria-label="Erreur de synchronisation"
                    className={error
                        ? 'text-meta text-danger-400 bg-danger-500/10 border border-danger-500/20 rounded-card p-2'
                        : 'sr-only'}
                >
                    {error ?? ''}
                </div>
                {/* [FINTABLE-TOKEN-PERSIST, finding #2 panel #559] Région DISTINCTE de celle ci-dessus :
                    une panne de coffre et une panne réseau sont deux causes indépendantes qui peuvent
                    survenir ENSEMBLE — partager une région faisait disparaître la première (mesuré).
                    Deux messages différents dans deux régions ≠ la double annonce que le finding
                    a11y #536 interdisait (c'était le MÊME message dupliqué). */}
                <div
                    role="alert"
                    aria-label="Sauvegarde du jeton"
                    className={persistError
                        ? 'text-meta text-warning-400 bg-warning-500/10 border border-warning-500/20 rounded-card p-2'
                        : 'sr-only'}
                >
                    {persistError ?? ''}
                </div>
                <div
                    role="status"
                    aria-live="polite"
                    className={notice && !error
                        ? 'text-meta text-success-400 bg-success-500/10 border border-success-500/20 rounded-card p-2'
                        : 'sr-only'}
                >
                    {busy === 'testing' ? 'Test de connexion en cours.' : ''}
                    {busy === 'syncing' ? 'Synchronisation en cours.' : ''}
                    {busy === 'idle' && !error ? (notice ?? '') : ''}
                </div>

                {accounts !== null && accounts.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-meta font-bold uppercase tracking-widest text-ink-400">
                            Rôle de chaque compte
                        </h3>
                        <p className="text-tiny text-ink-400">
                            Rien n'est deviné : un compte sans rôle est simplement ignoré, et signalé après chaque passe.
                            {unassigned > 0 && <> Il en reste <strong>{unassigned}</strong> à déclarer.</>}
                        </p>
                        <ul className="space-y-2">
                            {accounts.map((a) => {
                                const role = roleOf(fintableRoles, a.id);
                                return (
                                    <li key={a.id} className="p-2 bg-white/[0.02] border border-white/5 rounded-card">
                                        <div className="flex flex-wrap items-center gap-2 justify-between">
                                            <div className="min-w-0">
                                                <div className="text-body text-ink-200 truncate">{a.label}</div>
                                                <div className="text-tiny text-ink-400">{a.rawType} · {a.currency}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="sr-only" htmlFor={`role-${a.id}`}>Rôle de {a.label}</label>
                                                <select
                                                    id={`role-${a.id}`}
                                                    value={role?.kind ?? ''}
                                                    onChange={(e) => {
                                                        const kind = e.target.value as RoleKind | '';
                                                        if (kind === '') return setRole(a.id, undefined);
                                                        if (kind === 'debt') return setRole(a.id, { kind: 'debt', debtName: role?.kind === 'debt' ? role.debtName : '' });
                                                        if (kind === 'investment') return setRole(a.id, { kind: 'investment', taxRegime: DEFAULT_REGIME });
                                                        return setRole(a.id, { kind });
                                                    }}
                                                    className="bg-dark border border-border rounded px-2 py-1 text-meta text-white focus:border-primary outline-none"
                                                >
                                                    <option value="">— à déclarer —</option>
                                                    {(Object.keys(ROLE_LABELS) as RoleKind[]).map((k) => (
                                                        <option key={k} value={k}>{ROLE_LABELS[k]}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {role?.kind === 'debt' && (
                                            <div className="mt-2">
                                                <label htmlFor={`debtname-${a.id}`} className="block text-tiny text-ink-400 mb-1">
                                                    Nom EXACT de la dette telle qu'elle existe dans Réglages → Dettes
                                                </label>
                                                <input
                                                    id={`debtname-${a.id}`}
                                                    type="text"
                                                    value={role.debtName}
                                                    onChange={(e) => setRole(a.id, { kind: 'debt', debtName: e.target.value })}
                                                    className="w-full bg-dark border border-border rounded px-2 py-1 text-meta text-white focus:border-primary outline-none"
                                                    placeholder="Desjardins Cash Back Mastercard"
                                                />
                                                <p className="text-tiny text-ink-400 mt-1">
                                                    Seul le SOLDE est mis à jour — le taux et le paiement minimum restent les tiens.
                                                </p>
                                            </div>
                                        )}

                                        {role?.kind === 'investment' && (
                                            <div className="mt-2">
                                                <label htmlFor={`regime-${a.id}`} className="block text-tiny text-ink-400 mb-1">
                                                    Régime fiscal
                                                </label>
                                                <select
                                                    id={`regime-${a.id}`}
                                                    value={role.taxRegime ?? ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setRole(a.id, v === ''
                                                            ? { kind: 'investment' }
                                                            : { kind: 'investment', taxRegime: v as 'CELI' | 'REER' | 'NON-ENREG' });
                                                    }}
                                                    className="bg-dark border border-border rounded px-2 py-1 text-meta text-white focus:border-primary outline-none"
                                                >
                                                    <option value="">— non déclaré —</option>
                                                    <option value="NON-ENREG">Non enregistré</option>
                                                    <option value="CELI">CELI</option>
                                                    <option value="REER">REER</option>
                                                </select>
                                                <p className="text-tiny text-ink-400 mt-1">
                                                    Détermine où l'écart entre le solde du courtier et tes titres saisis entre dans
                                                    ta projection. Non déclaré = le montant s'affiche, mais reste hors projection.
                                                </p>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {accounts !== null && accounts.length === 0 && (
                    <p className="text-meta text-ink-400">
                        Aucun compte actif chez Fintable. Vérifie que tes connexions bancaires y sont bien actives.
                    </p>
                )}

                {report && (
                    <div className="text-tiny text-ink-400 border-t border-white/5 pt-2">
                        Dernière passe : {new Date(report.at).toLocaleString('fr-CA')} ·{' '}
                        {report.error === null
                            ? `${report.transactionsAdded} transaction(s) ajoutée(s), ${report.accountsSeen} compte(s) vu(s)`
                            : <span className="text-danger-400">échec — {report.error}</span>}
                        {report.warnings.length > 0 && ` · ${report.warnings.length} avertissement(s)`}
                        <span className="block mt-1">Détail complet dans Réglages → Système &amp; diagnostics.</span>
                    </div>
                )}
            </div>
        </Card>
    );
};
