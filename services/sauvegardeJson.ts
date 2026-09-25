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
    /** Aucune enveloppe lisible (rien n'a encore été enregistré sur cet appareil). */
    | { readonly ok: false; readonly cause: 'rien-a-sauvegarder' };

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
): ResultatSauvegarde {
    if (donneesFictives) return { ok: false, cause: 'donnees-fictives' };
    if (!estEnveloppeStore(enveloppe)) return { ok: false, cause: 'rien-a-sauvegarder' };
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
    return cause === 'donnees-fictives'
        ? 'Sauvegarde impossible en mode test : l\'app affiche des données fictives. Quitte le mode test, puis exporte.'
        : 'Rien à sauvegarder : aucune donnée enregistrée sur cet appareil pour l\'instant.';
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
