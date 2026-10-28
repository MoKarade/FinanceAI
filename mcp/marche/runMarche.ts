// mcp/marche/runMarche.ts
//
// [MARCHE-RUN] Une passe complète : lire le fichier, exécuter `executerPasseMagasin`, écrire si quelque chose
// a changé. Les lectures réseau et le store sont injectés (testable sans réseau ni Drive).
//
// ⚠️ Le rapport rendu ne contient que des COMPTEURS (hérité de la passe) : il finit dans le journal public d'un
// workflow GitHub, et les conditions d'EODHD interdisent d'en redistribuer les prix.
import { executerPasseMagasin, type LecteursMarche, type OptionsPasse } from '../../services/marche/passeMagasin';
import { fichierVide } from './fichierMarche';
import type { StoreMarche } from './storeMarche';

type RapportPasse = Awaited<ReturnType<typeof executerPasseMagasin>>['rapport'];

export interface ResultatRun {
    rapport: RapportPasse;
    /** Le fichier a-t-il été écrit ? Jamais en essai à blanc. */
    ecrit: boolean;
    cibles: number;
}

/** Début de l'historique des TAUX quand aucun n'est encore écrit. Borne de lecture, pas une donnée : la BdC est gratuite. */
const DEBUT_TAUX_PAR_DEFAUT = '2023-01-01';

/** Le jour de Marc (Québec). Une séance du jour J n'est complète qu'après 16 h à Québec, donc ce jour n'est jamais en avance sur la source. */
export const jourDuQuebec = (maintenant: Date): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);

export async function runPasseMarche(
    store: StoreMarche,
    lecteurs: LecteursMarche,
    o: { maintenant: Date; essaiABlanc: boolean; budgetAppelsEodhd?: number },
): Promise<ResultatRun> {
    const iso = o.maintenant.toISOString();
    const lu = await store.lire();
    const fichier = lu ?? fichierVide(iso);
    const options: OptionsPasse = {
        aujourdhui: jourDuQuebec(o.maintenant),
        maintenant: iso,
        essaiABlanc: o.essaiABlanc,
        debutTaux: DEBUT_TAUX_PAR_DEFAUT,
        ...(o.budgetAppelsEodhd !== undefined ? { budgetAppelsEodhd: o.budgetAppelsEodhd } : {}),
    };
    const passe = await executerPasseMagasin(fichier.magasin, fichier.cibles, lecteurs, options);
    if (o.essaiABlanc || !passe.modifie) {
        return { rapport: passe.rapport, ecrit: false, cibles: fichier.cibles.length };
    }
    await store.ecrire({ ...fichier, magasin: passe.magasin }, lu?.rev ?? null);
    return { rapport: passe.rapport, ecrit: true, cibles: fichier.cibles.length };
}
