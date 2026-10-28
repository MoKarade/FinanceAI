// services/marche/passeMagasin.ts
//
// [PTF-L1C2-PASSE] La PASSE du magasin de marché : décide quelles séries relire, combien d'appels
// dépenser, puis fusionne ce que les sources rendent. Décidé au Lot 0 (ADR 0019) : un seul écrivain,
// la tâche serveur (lot 1c-2). Ce module est PUR : les deux lectures (EODHD, Banque du Canada) sont
// INJECTÉES, il ne fait aucun `fetch`, ne lit ni n'écrit aucun fichier. La tâche serveur lui passe le
// magasin lu, les cibles, et les lectures branchées sur `clientsMarche.ts` ; elle écrit le résultat.
//
// Ce que ce module garantit, et pourquoi :
//   1. UN BUDGET, JAMAIS DÉPASSÉ. Le plan gratuit d'EODHD plafonne les appels par jour : la passe en
//      dépense au plus `budgetAppelsEodhd`, la série la plus EN RETARD d'abord. Ce qui ne passe pas dans
//      le budget est reporté au prochain passage et COMPTÉ, pas oublié.
//   2. AUCUN APPEL POUR RIEN. Une série à jour, ou dont aucune séance n'a pu paraître depuis son dernier
//      point (week-end), n'est pas relue.
//   3. RATTRAPAGE PAR RECOUVREMENT. La fenêtre relue commence AU dernier point connu (un jour de
//      recouvrement) : une révision de la source est vue, et la fusion idempotente (`fusionnerClotures`)
//      ne compte pas ce qui n'a pas changé. Elle ne remonte jamais plus loin que l'historique du plan
//      gratuit ; ce qui serait perdu au-delà est COMPTÉ (`fenetresTronquees`).
//   4. REFUS, JAMAIS RÉPARATION. Une devise de cotation en conflit avec celle du magasin, une réponse
//      illisible, un échec réseau : la série est laissée telle quelle et l'incident compté.
//   5. LE RAPPORT NE PORTE QUE DES COMPTEURS. Ni ISIN, ni symbole, ni cours, ni clé, ni URL, ni message
//      de la source : le journal de la tâche est public et les conditions d'EODHD interdisent d'en
//      redistribuer les prix.
//   6. NE MUTE RIEN. Le magasin reçu est rendu inchangé ; le nouveau est une copie. `majLe` ne bouge
//      que si un point a changé (rejouer la même passe ne réécrit pas le fichier).
import type { BrokerLedgerCurrency } from '../../types';
import { jourUtcDepuisD } from '../fx/observationsBdc';
import type { LectureSerieSource, PointCoursLu } from './clientsMarche';
import {
    fusionnerClotures, fusionnerTaux,
    type DeviseTaux, type MagasinMarche, type PointCloture, type PointTaux,
} from './magasinMarche';

/** Un titre à tenir à jour. L'ISIN est la clé du magasin ; le symbole n'est que la façon d'interroger EODHD. */
export interface CibleCloture {
    isin: string;
    symboleEodhd: string;
    /** Devise de COTATION (celle du référentiel) : EODHD ne la renvoie pas. */
    devise: BrokerLedgerCurrency;
}

/** Lectures injectées. Une promesse REJETÉE est un échec réseau : comptée, jamais citée. */
export interface LecteursMarche {
    lireClotures(symboleEodhd: string, du: string, au: string): Promise<LectureSerieSource<PointCoursLu>>;
    lireTaux(devise: DeviseTaux, du: string, au: string): Promise<LectureSerieSource<PointTaux>>;
}

export interface OptionsPasse {
    /** Jour de la passe, AAAA-MM-JJ (fuseau décidé par l'appelant). Aucun point postérieur n'est accepté. */
    aujourdhui: string;
    /** Horodatage ISO écrit dans `majLe` quand quelque chose a changé. */
    maintenant: string;
    /** Appels EODHD maximum pour cette passe. La Banque du Canada est gratuite et hors budget. */
    budgetAppelsEodhd?: number;
    /** Profondeur maximale d'une fenêtre EODHD (le plan gratuit ne rend qu'un an d'historique). */
    fenetreMaxJours?: number;
    /** Début de l'historique des TAUX quand aucun n'est encore écrit (le moteur de courbes le fixe). */
    debutTaux?: string;
    /** Essai à blanc : calcule le plan et le rapport SANS rien appeler. */
    essaiABlanc?: boolean;
}

/** 12 titres tiennent dans le plan gratuit (20 appels par jour) avec de la marge pour une relance. */
const BUDGET_PAR_DEFAUT = 15;
/** Historique servi par le plan gratuit d'EODHD (mesuré au Lot 0.5b : environ un an). */
const FENETRE_MAX_PAR_DEFAUT = 365;

interface RapportCloture {
    cibles: number;
    /** Cibles répétées pour un même ISIN et une même devise : lues une seule fois. */
    doublons: number;
    /** Séries déjà à jour, ou sans séance possible depuis leur dernier point : aucun appel. */
    sansBesoin: number;
    appels: number;
    /** À relire, mais le budget est épuisé : au prochain passage. */
    reportes: number;
    /** Fenêtres plus longues que l'historique du plan : le début est perdu, pas rattrapable ici. */
    fenetresTronquees: number;
    devisesEnConflit: number;
    echecsReseau: number;
    reponsesIllisibles: number;
    /** Lignes illisibles, doublons de date ou dates futures de la source, jamais corrigées. */
    ecartes: number;
    ajouts: number;
    revisions: number;
    promotions: number;
    ignores: number;
}

interface RapportTaux {
    sansBesoin: number;
    appels: number;
    echecsReseau: number;
    reponsesIllisibles: number;
    ecartes: number;
    ajouts: number;
    revisions: number;
}

interface RapportPasse {
    essaiABlanc: boolean;
    clotures: RapportCloture;
    taux: RapportTaux;
}

interface ResultatPasse {
    /** Copie : le magasin reçu n'est jamais muté. Identique (même `majLe`) quand rien n'a changé. */
    magasin: MagasinMarche;
    modifie: boolean;
    rapport: RapportPasse;
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

const msDuJour = (d: string): number => jourUtcDepuisD(d) as number;
const jourDepuisMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const estOuvre = (ms: number): boolean => { const j = new Date(ms).getUTCDay(); return j !== 0 && j !== 6; };

/** Y a-t-il un jour OUVRÉ dans `]apres, jusqua]` ? Sinon aucune séance n'a pu paraître : pas d'appel. */
function seanceAttendue(apres: string, jusqua: string): boolean {
    for (let t = msDuJour(apres) + MS_PAR_JOUR; t <= msDuJour(jusqua); t += MS_PAR_JOUR) if (estOuvre(t)) return true;
    return false;
}

interface Fenetre { du: string; au: string; tronquee: boolean }

/**
 * La fenêtre à relire pour une série dont le dernier point est `dernier` (ou `null` : série vide).
 * `null` = rien à lire. Recouvrement d'un jour (point 3 de l'en-tête). Un point de SECOURS encore écrit
 * (`secoursDepuis`, le plus ancien) force la relecture même sans séance attendue : c'est la seule façon
 * pour que l'officiel le remplace (point 2 de `magasinMarche.ts`).
 */
function fenetreARelire(dernier: string | null, secoursDepuis: string | null, aujourdhui: string, limite: string): Fenetre | null {
    if (dernier === null) return { du: limite, au: aujourdhui, tronquee: false };
    if (secoursDepuis === null && !seanceAttendue(dernier, aujourdhui)) return null;
    const du = secoursDepuis !== null && secoursDepuis < dernier ? secoursDepuis : dernier;
    // Le début voulu est plus ancien que la limite : tout ce qui est entre les deux est hors de portée.
    return du < limite ? { du: limite, au: aujourdhui, tronquee: true } : { du, au: aujourdhui, tronquee: false };
}

const dernierJour = (points: readonly (readonly [string, ...unknown[]])[] | undefined): string | null =>
    points && points.length > 0 ? points[points.length - 1][0] : null;

/** Date du plus ancien point de secours (les points sont triés par date), ou `null`. */
const premierSecours = (points: readonly PointCloture[] | undefined): string | null =>
    points?.find((p) => p[2] === 'yahoo')?.[0] ?? null;

/** Retire les points datés APRÈS `aujourdhui` (une source ne publie pas le futur : un tel point est faux). */
function sansFutur<P extends readonly [string, ...unknown[]]>(points: readonly P[], aujourdhui: string): { gardes: P[]; futurs: number } {
    const gardes = points.filter((p) => p[0] <= aujourdhui);
    return { gardes, futurs: points.length - gardes.length };
}

function exigerOptions(o: OptionsPasse, budget: number, fenetre: number): void {
    if (jourUtcDepuisD(o.aujourdhui) === null) throw new Error('passeMagasin : date du jour illisible');
    // ISO complet exigé (aller-retour exact) : `Date.parse` accepte « 1 » ou « 2026-01-09 », qui finiraient tels quels dans `majLe`.
    if (Number.isNaN(Date.parse(o.maintenant)) || new Date(o.maintenant).toISOString() !== o.maintenant) throw new Error('passeMagasin : horodatage illisible');
    if (!Number.isInteger(budget) || budget < 0) throw new Error('passeMagasin : budget invalide');
    if (!Number.isInteger(fenetre) || fenetre < 1) throw new Error('passeMagasin : fenêtre invalide');
    if (o.debutTaux !== undefined && jourUtcDepuisD(o.debutTaux) === null) throw new Error('passeMagasin : début des taux illisible');
}

/**
 * Exécute une passe : relit les clôtures et les taux en retard, fusionne, rend le nouveau magasin et un
 * rapport de compteurs. Lève sur des options invalides (erreur de programmation de l'appelant) ;
 * jamais sur une donnée ou une panne de source (points 4 et 5 de l'en-tête).
 */
export async function executerPasseMagasin(
    magasin: MagasinMarche,
    cibles: readonly CibleCloture[],
    lecteurs: LecteursMarche,
    options: OptionsPasse,
): Promise<ResultatPasse> {
    const budget = options.budgetAppelsEodhd ?? BUDGET_PAR_DEFAUT;
    const fenetreMax = options.fenetreMaxJours ?? FENETRE_MAX_PAR_DEFAUT;
    exigerOptions(options, budget, fenetreMax);
    const { aujourdhui } = options;
    const essai = options.essaiABlanc === true;
    const limite = jourDepuisMs(msDuJour(aujourdhui) - fenetreMax * MS_PAR_JOUR);

    const rc: RapportCloture = {
        cibles: cibles.length, doublons: 0, sansBesoin: 0, appels: 0, reportes: 0, fenetresTronquees: 0, devisesEnConflit: 0,
        echecsReseau: 0, reponsesIllisibles: 0, ecartes: 0, ajouts: 0, revisions: 0, promotions: 0, ignores: 0,
    };
    const rt: RapportTaux = { sansBesoin: 0, appels: 0, echecsReseau: 0, reponsesIllisibles: 0, ecartes: 0, ajouts: 0, revisions: 0 };

    const clotures: MagasinMarche['clotures'] = { ...magasin.clotures };
    let modifie = false;

    // ─── Clôtures : la plus en retard d'abord, dans le budget ─────────────────────────────────────────
    const aRelire: Array<{ cible: CibleCloture; fenetre: Fenetre; retard: number }> = [];
    // Un ISIN n'est lu qu'UNE fois (sinon le budget serait dépensé deux fois et la 2e fusion écraserait la 1re) ;
    // deux devises pour un même ISIN, c'est une entrée contradictoire : refusée en entier, jamais départagée.
    const parIsin = new Map<string, CibleCloture[]>();
    for (const c of cibles) parIsin.set(c.isin, [...(parIsin.get(c.isin) ?? []), c]);
    const uniques: CibleCloture[] = [];
    for (const groupe of parIsin.values()) {
        if (groupe.some((c) => c.devise !== groupe[0].devise)) { rc.devisesEnConflit++; continue; }
        rc.doublons += groupe.length - 1;
        uniques.push(groupe[0]);
    }
    for (const cible of uniques) {
        const existante = magasin.clotures[cible.isin];
        if (existante && existante.devise !== cible.devise) { rc.devisesEnConflit++; continue; }
        const dernier = dernierJour(existante?.points);
        const fenetre = fenetreARelire(dernier, premierSecours(existante?.points), aujourdhui, limite);
        if (fenetre === null) { rc.sansBesoin++; continue; }
        // Une série vide est la plus en retard de toutes.
        aRelire.push({ cible, fenetre, retard: dernier === null ? Number.POSITIVE_INFINITY : msDuJour(aujourdhui) - msDuJour(dernier) });
    }
    // Retard décroissant ; à retard égal, l'ISIN départage (ordre stable d'une passe à l'autre).
    aRelire.sort((a, b) => (b.retard - a.retard) || (a.cible.isin < b.cible.isin ? -1 : a.cible.isin > b.cible.isin ? 1 : 0));

    for (const { cible, fenetre } of aRelire) {
        if (rc.appels >= budget) { rc.reportes++; continue; }
        if (fenetre.tronquee) rc.fenetresTronquees++;
        // Le budget se compte à l'appel PRÉVU : en essai à blanc, le plan est le même qu'en vrai.
        rc.appels++;
        if (essai) continue;
        let lecture: LectureSerieSource<PointCoursLu>;
        try { lecture = await lecteurs.lireClotures(cible.symboleEodhd, fenetre.du, fenetre.au); }
        catch { rc.echecsReseau++; continue; }
        if (lecture.statut === 'erreur') { rc.reponsesIllisibles++; continue; }
        const { gardes, futurs } = sansFutur(lecture.points, aujourdhui);
        rc.ecartes += lecture.ecartes + futurs;
        const recus: PointCloture[] = gardes.map(([d, v]) => [d, v, 'eodhd']);
        const existants = magasin.clotures[cible.isin]?.points ?? [];
        const bilan = fusionnerClotures(existants, recus);
        rc.ajouts += bilan.ajouts; rc.revisions += bilan.revisions; rc.promotions += bilan.promotions; rc.ignores += bilan.ignores;
        if (bilan.ajouts + bilan.revisions + bilan.promotions > 0) {
            clotures[cible.isin] = { devise: cible.devise, points: bilan.points };
            modifie = true;
        }
    }

    // ─── Taux de la Banque du Canada : gratuits, hors budget ──────────────────────────────────────────
    const taux: MagasinMarche['taux'] = { ...magasin.taux };
    const devises = [...new Set(uniques.map((c) => c.devise))].filter((d): d is DeviseTaux => d !== 'CAD').sort();
    const debutTaux = options.debutTaux ?? limite;
    for (const devise of devises) {
        const dernier = dernierJour(magasin.taux[devise]);
        const fenetre = dernier === null
            ? { du: debutTaux, au: aujourdhui }
            : seanceAttendue(dernier, aujourdhui) ? { du: dernier, au: aujourdhui } : null;
        if (fenetre === null || fenetre.du > fenetre.au) { rt.sansBesoin++; continue; }
        rt.appels++;
        if (essai) continue;
        let lecture: LectureSerieSource<PointTaux>;
        try { lecture = await lecteurs.lireTaux(devise, fenetre.du, fenetre.au); }
        catch { rt.echecsReseau++; continue; }
        if (lecture.statut === 'erreur') { rt.reponsesIllisibles++; continue; }
        const { gardes, futurs } = sansFutur(lecture.points, aujourdhui);
        rt.ecartes += lecture.ecartes + futurs;
        const bilan = fusionnerTaux(magasin.taux[devise] ?? [], gardes);
        rt.ajouts += bilan.ajouts; rt.revisions += bilan.revisions;
        if (bilan.ajouts + bilan.revisions > 0) { taux[devise] = bilan.points; modifie = true; }
    }

    const rapport: RapportPasse = { essaiABlanc: essai, clotures: rc, taux: rt };
    if (!modifie) return { magasin, modifie: false, rapport };
    return { magasin: { ...magasin, majLe: options.maintenant, clotures, taux }, modifie: true, rapport };
}
