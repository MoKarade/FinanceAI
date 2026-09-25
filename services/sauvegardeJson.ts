// services/sauvegardeJson.ts
//
// [EXPORT-JSON-PERD-FINTABLE] Format de la sauvegarde JSON manuelle (claire ou chiffrée).
//
// ⚠️ L'ancien export ÉNUMÉRAIT ses champs à la main (`buildBackupPayload`, 26 clés) et la
// restauration les réécrivait sous des clés LEGACY (`app_*`) relues au démarrage : tout champ
// persisté que personne n'avait pensé à ajouter DEUX fois — à l'export ET dans un lecteur legacy —
// disparaissait à la restauration. Soldes et historique Fintable, rôles des comptes, abonnements,
// taux de change, conversations IA, documents : perdus en silence, pendant que la synchro Drive,
// elle, les portait tous.
//
// Le correctif n'est pas une 27ᵉ clé mais l'inversion : la sauvegarde EST l'enveloppe persistée
// (`financeai-storage`, `{ state, version }`), celle-là même que la synchro Drive pousse. Une clé
// ajoutée au store demain y entre sans que personne n'y pense ; la restauration réécrit cette
// enveloppe telle quelle et le démarrage la fait passer par `merge` + `verifierTypesRestaures`,
// exactement comme un pull Drive.
//
// Décisions de Marc (2026-09-25) : conversations IA et documents INCLUS (ils sont dans l'enveloppe),
// et la restauration REMPLACE TOUT — ce que la sauvegarde ne contient pas retombe à sa valeur par
// défaut, jamais un mélange de deux époques. Les clés API n'en font jamais partie (exclues de la
// persistance, et retirées une seconde fois par `stripApiKeys` avant d'arriver ici).
//
// Module PUR : il reçoit l'enveloppe et le mode, il ne lit ni le store ni `localStorage`
// (`UN-IMPORT-DANS-LA-COUCHE-SERVICES-ELARGIT-LE-CONTRAT-DE-MOCK-DE-TOUS-LES-MONTAGES`).

/** Version du FORMAT de sauvegarde. `3.2` = l'ancien format par champs (toujours relu). */
export const VERSION_SAUVEGARDE_ETAT = '4.0';

/** L'enveloppe persistée du store, telle que zustand l'écrit. */
export interface EnveloppeStore {
    readonly state: Record<string, unknown>;
    readonly version: number;
}

export interface SauvegardeEtat {
    readonly version: typeof VERSION_SAUVEGARDE_ETAT;
    readonly timestamp: number;
    readonly store: EnveloppeStore;
}

export type ResultatSauvegarde =
    | { readonly ok: true; readonly sauvegarde: SauvegardeEtat }
    /** Mode test / bac à sable : l'état courant est FICTIF, l'archiver produirait un faux dossier. */
    | { readonly ok: false; readonly cause: 'donnees-fictives' }
    /** Rien n'a encore été enregistré sur cet appareil (aucun blob). */
    | { readonly ok: false; readonly cause: 'rien-a-sauvegarder' }
    /** Un blob EXISTE mais il est illisible ou mal formé. Distinct du cas précédent : dire « rien à
     *  sauvegarder » à quelqu'un dont le dossier vient de se corrompre l'enverrait dans le mauvais sens
     *  (revue silent-failure, PR #1065). */
    | { readonly ok: false; readonly cause: 'illisible' };

/** L'objet a-t-il la forme d'une enveloppe persistée (`state` objet, `version` entier) ? */
export function estEnveloppeStore(v: unknown): v is EnveloppeStore {
    if (v === null || typeof v !== 'object') return false;
    const { state, version } = v as { state?: unknown; version?: unknown };
    return state !== null && typeof state === 'object' && !Array.isArray(state)
        && typeof version === 'number' && Number.isInteger(version) && version >= 0;
}

/**
 * Construit la sauvegarde à partir de l'enveloppe que la synchro Drive pousserait
 * (`getLocalPayload().payload` : clés API retirées, artefacts de persona désinfectés).
 *
 * ⚠️ Refus en données fictives, même règle que les autres sorties de fichier
 * (`[SANDBOX-ETANCHEITE-FICHIERS]`) : en mode test, l'enveloppe porte le persona à l'écran ET
 * le dossier réel mis de côté (`realDataSnapshot`) — la restaurer ramènerait l'app en mode test.
 */
export function construireSauvegardeEtat(
    enveloppe: unknown,
    donneesFictives: boolean,
    maintenant: number,
    /** Un blob `financeai-storage` existe-t-il, lisible ou non ? `getLocalPayload` rend `null` dans
     *  les deux cas — seul l'appelant, qui lit le stockage, peut les séparer. */
    blobPresent: boolean,
): ResultatSauvegarde {
    if (donneesFictives) return { ok: false, cause: 'donnees-fictives' };
    if (!estEnveloppeStore(enveloppe)) {
        return { ok: false, cause: blobPresent || enveloppe != null ? 'illisible' : 'rien-a-sauvegarder' };
    }
    return {
        ok: true,
        sauvegarde: {
            version: VERSION_SAUVEGARDE_ETAT,
            timestamp: maintenant,
            store: { state: enveloppe.state, version: enveloppe.version },
        },
    };
}

/** Message du refus d'export, une seule rédaction pour le JSON clair et le chiffré. */
export function messageRefusSauvegarde(cause: Extract<ResultatSauvegarde, { ok: false }>['cause']): string {
    if (cause === 'donnees-fictives') {
        return 'Sauvegarde impossible en mode test : l\'app affiche des données fictives. Quitte le mode test, puis exporte.';
    }
    if (cause === 'illisible') {
        return 'Sauvegarde impossible : le dossier enregistré sur cet appareil est illisible. Rien n\'a été modifié — restaure depuis Google Drive ou depuis une ancienne sauvegarde.';
    }
    return 'Rien à sauvegarder : aucune donnée enregistrée sur cet appareil pour l\'instant.';
}

/**
 * Ce que la fenêtre de confirmation annonce avant de tout remplacer. Lit les deux formats : dans
 * le nouveau, les collections vivent sous `store.state`, plus à la racine — lire la racine
 * annoncerait « 0 transaction » pour une sauvegarde qui en porte des milliers.
 */
export function resumeSauvegarde(data: {
    readonly version?: string;
    readonly store?: { readonly state?: Record<string, unknown> };
    readonly transactions?: readonly unknown[];
    readonly assets?: readonly unknown[];
}): { version: string; transactions: number; actifs: number } {
    const source: Record<string, unknown> = data.store?.state ?? (data as Record<string, unknown>);
    const longueur = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
    return {
        version: data.version ?? 'Inconnue',
        transactions: longueur(source.transactions),
        actifs: longueur(source.assets),
    };
}

export type ResultatEcriture =
    | { readonly ok: true }
    /** L'écriture a levé (quota, stockage indisponible). `retabli` : le contenu d'avant a-t-il pu
     *  être remis en place ? */
    | { readonly ok: false; readonly erreur: unknown; readonly retabli: boolean };

/**
 * Vide le stockage puis y écrit la restauration — et, si l'écriture lève, REMET EN PLACE ce qui
 * s'y trouvait. Sans ce retour arrière, un `QuotaExceededError` survenu APRÈS `clear()` laissait un
 * stockage vide : au rechargement, une app sans aucune donnée, indiscernable d'un premier lancement
 * (revue silent-failure, PR #1065). Le contenu d'avant tenait dans le stockage, il y retient donc.
 */
export function remplacerLeStockage(
    stockage: Storage,
    ecrire: (s: Storage) => void,
    /** Clés qui SURVIVENT au remplacement (coffre chiffré des clés API) : elles ne font pas partie du
     *  dossier sauvegardé, les effacer ferait perdre à l'utilisateur ce que le fichier ne peut pas
     *  lui rendre. */
    garder: readonly string[] = [],
): ResultatEcriture {
    const avant: Array<[string, string]> = [];
    for (let i = 0; i < stockage.length; i++) {
        const cle = stockage.key(i);
        if (cle !== null) avant.push([cle, stockage.getItem(cle) ?? '']);
    }
    stockage.clear();
    try {
        for (const [cle, valeur] of avant) if (garder.includes(cle)) stockage.setItem(cle, valeur);
        ecrire(stockage);
        return { ok: true };
    } catch (erreur) {
        try {
            stockage.clear();
            for (const [cle, valeur] of avant) stockage.setItem(cle, valeur);
            return { ok: false, erreur, retabli: true };
        } catch {
            return { ok: false, erreur, retabli: false };
        }
    }
}

/** Clés de l'état qu'un fichier de sauvegarde n'a JAMAIS le droit d'imposer à la restauration. */
export const CLES_JAMAIS_RESTAUREES = ['apiKeys', 'isTestMode', 'realDataSnapshot', 'activeTestPersonaId'] as const;

/**
 * L'enveloppe à écrire, débarrassée de ce qu'un fichier ne doit jamais imposer (revue sécurité,
 * PR #1065) :
 * - `apiKeys` : un export légitime n'en porte JAMAIS (exclues de la persistance, puis retirées par
 *   `stripApiKeys`). Un fichier qui en porte a été fabriqué ; sans ce filtre, `merge` les aurait
 *   posées en mémoire — l'Assistant et les cours tourneraient avec les identifiants d'un tiers, et
 *   la synchro Fintable sur SON compte. Le garde-fou « V1 » ne regardait que l'ancien champ racine.
 * - le mode test : l'export est refusé en mode test, donc un fichier légitime porte toujours
 *   `isTestMode: false` et aucun instantané. Retirés, ils retombent au défaut (mode normal).
 * `retirees` nomme ce qui a été écarté, pour le journal.
 */
export function enveloppeARestaurer(store: EnveloppeStore): { enveloppe: EnveloppeStore; retirees: string[] } {
    const state: Record<string, unknown> = { ...store.state };
    const retirees: string[] = [];
    for (const cle of CLES_JAMAIS_RESTAUREES) {
        if (Object.hasOwn(state, cle)) {
            delete state[cle];
            retirees.push(cle);
        }
    }
    return { enveloppe: { state, version: store.version }, retirees };
}

