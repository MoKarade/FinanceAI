// mcp/marche/storeMarche.ts
//
// [MARCHE-STORE] Lecture/écriture du fichier Drive du magasin de marché (`financeai-marche.json`, dans
// l'appDataFolder). UN SEUL écrivain : la route `POST /market-store`. Garde de concurrence par `rev` :
// l'écriture n'a lieu que si le fichier porte encore le `rev` lu — sinon `StateConflictError` (transitoire :
// la prochaine passe relit et réessaie), jamais un écrasement.
//
// ⚠️ Pas de sauvegarde horodatée comme l'état de l'app : le magasin ne porte que des faits RELISIBLES à la
// source (clôtures, taux publics) ; un fichier perdu se reconstruit par une nouvelle passe, il ne contient
// aucune saisie de Marc. L'écriture reste « refus plutôt qu'écrasement » sur le `rev`.
import {
    createAppDataFile, findAppDataFileByName, readAppDataFile, updateAppDataFile, type FetchLike,
} from '../../services/googleDrive/driveAppData';
import { StateConflictError } from '../state/stateErrors';
import { lireFichierMarche, type FichierMarche } from './fichierMarche';

export const NOM_FICHIER_MARCHE = 'financeai-marche.json';

export interface StoreMarche {
    /** `null` = le fichier n'existe pas encore (première passe). Lève sur un fichier illisible. */
    lire(): Promise<FichierMarche | null>;
    /** Écrit `fichier` avec `rev = revAttendue + 1` si le fichier porte encore `revAttendue` (`null` = absent). */
    ecrire(fichier: FichierMarche, revAttendue: number | null): Promise<FichierMarche>;
}

/** Erreur de FORME du fichier : le fichier existe mais n'est pas lisible. Panne réelle, jamais un « vide ». */
export class FichierMarcheIllisibleError extends Error {
    constructor(readonly nbErreurs: number) {
        super(`fichier de marché illisible (${nbErreurs} erreur(s))`);
        this.name = 'FichierMarcheIllisibleError';
    }
}

export function creerStoreMarcheDrive(getToken: () => Promise<string>, fetchFn?: FetchLike): StoreMarche {
    // Écritures sérialisées dans le processus (même raison que `DriveStateSource._saveQueue`).
    let file: Promise<unknown> = Promise.resolve();

    const lireAvecId = async (token: string): Promise<{ id: string; fichier: FichierMarche } | null> => {
        const ref = await findAppDataFileByName(token, NOM_FICHIER_MARCHE, fetchFn);
        if (!ref) return null;
        const brut = await readAppDataFile(token, ref.id, fetchFn);
        const lu = lireFichierMarche(brut);
        if (!lu.ok) {
            // Détail au journal serveur (peut nommer un ISIN : jamais renvoyé à l'appelant), forme seulement dans l'erreur.
            console.error('[FinanceAI MCP http] fichier de marché illisible —', lu.erreurs.join(' | '));
            throw new FichierMarcheIllisibleError(lu.erreurs.length);
        }
        return { id: ref.id, fichier: lu.fichier };
    };

    return {
        async lire() {
            const token = await getToken();
            return (await lireAvecId(token))?.fichier ?? null;
        },
        ecrire(fichier, revAttendue) {
            const run = file.then(async () => {
                const token = await getToken();
                const courant = await lireAvecId(token);
                const revCourante = courant?.fichier.rev ?? null;
                if (revCourante !== revAttendue) {
                    throw new StateConflictError('Conflit : le fichier de marché a changé depuis la lecture. Rien n’a été écrasé.');
                }
                const ecrit: FichierMarche = { ...fichier, rev: (revAttendue ?? 0) + 1 };
                if (courant) await updateAppDataFile(token, courant.id, ecrit, fetchFn);
                else await createAppDataFile(token, NOM_FICHIER_MARCHE, ecrit, fetchFn);
                return ecrit;
            });
            file = run.catch(() => undefined);
            return run;
        },
    };
}
