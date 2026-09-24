// services/import/disnat/lireReleveDisnat.ts
//
// [PTF-L1F-PARSEUR-DISNAT] Lecture d'un relevé de portefeuille Disnat, à partir de son TEXTE déjà
// découpé en lignes (l'extraction du PDF est une autre étape, chargée en différé). Module PUR : ni
// réseau, ni horloge, ni store. Il ne produit PAS encore des événements du grand livre : le relevé
// n'imprime aucun ISIN, seulement des descriptions et des symboles — la correspondance avec le
// référentiel est l'affaire de `versEvenements`.
//
// Ce que ce module garantit, et pourquoi chaque point existe (mesures du Lot 0 sur l'ancien parseur
// Python, qui perdait des lignes EN SILENCE) :
//   1. UNE SECTION SE BORNE PAR LA FIN DE SON COMPTE (« Valeur totale de votre compte … »), jamais
//      par le premier « Total » : l'ancien s'arrêtait à « Total encaisse et équivalents » et perdait
//      les positions suivantes, et relisait les pages « suite » en double.
//   2. L'HABILLAGE DE PAGE N'EST JAMAIS UNE LIGNE (« Page 5 de 6 », en-tête répété) : l'ancien
//      l'avalait comme la suite de la dernière opération.
//   3. RIEN N'EST JETÉ SANS ÊTRE NOMMÉ : une ligne qu'on ne sait pas lire devient une anomalie avec
//      son NUMÉRO de ligne — jamais son texte (les montants n'ont rien à faire dans un journal).
//   4. TROIS RECOUPEMENTS INDÉPENDANTS DU DÉCOUPAGE : la somme des montants de l'activité d'un compte
//      doit égaler la variation de son encaisse imprimée (fermeture − ouverture), la ligne
//      « ENCAISSE » des détails d'actifs doit égaler la fermeture, et pour chaque position quantité ×
//      coût unitaire doit retomber sur le coût comptable. Un montant de milliers
//      mal découpé (« 1 000,00 » lu comme deux nombres, ou un chiffre de la description avalé) ne
//      passe pas ces deux contrôles.
//   5. LE SENS VIENT DU RELEVÉ, TEL QU'IMPRIMÉ : les montants gardent leur signe ici. C'est la
//      traduction en événements qui le transforme en `kind`, une seule fois, sans Math.abs.

/** Compte du courtier, identifié par sa DEVISE de règlement (le code imprimé n'est jamais gardé :
 *  le dépôt est public). Un compte d'un autre type (REER, CELI…) n'est PAS deviné : anomalie. */
export type CompteDisnat = 'courtier-cad' | 'courtier-usd';

/** Opérations OBSERVÉES sur de vrais relevés (Lot 0), plus « VENTE », symétrique d'« ACHAT ».
 *  Tout autre libellé est une opération INCONNUE : gardée telle quelle, jamais rapprochée. */
type SorteDisnat =
    | 'transfert-recu'
    | 'achat'
    | 'vente'
    | 'dividende'
    | 'retenue-impot'
    | 'impot-non-resident'
    | 'fractionnement'
    | 'frais'
    | 'depot';

const LIBELLES: readonly [string, SorteDisnat][] = [
    ['FRACTIONNEMENT D\'ACTIONS', 'fractionnement'],
    ['IMPÔT DE NON-RÉSIDENT', 'impot-non-resident'],
    ['RETENUE D\'IMPÔT', 'retenue-impot'],
    ['TRANSFERT REÇU', 'transfert-recu'],
    ['DIVIDENDE', 'dividende'],
    ['ACHAT', 'achat'],
    ['VENTE', 'vente'],
    ['FRAIS', 'frais'],
    ['DÉPÔT', 'depot'],
];

export interface OperationDisnat {
    /** Numéro de la ligne dans le texte reçu (1-based), pour nommer une anomalie sans son contenu. */
    ligne: number;
    dateTransaction: string;
    dateReglement: string;
    /** `null` = libellé inconnu : `libelle` le garde tel qu'imprimé. */
    sorte: SorteDisnat | null;
    libelle: string;
    quantite?: number;
    description: string;
    prix?: number;
    /** Montant tel qu'imprimé, SIGNÉ (négatif = sortie du compte). */
    montant?: number;
    /** Lignes de suite imprimées sous l'opération (« TRSF IN », « INTERNET DIRECT/STP »…). */
    suite: string[];
    /** Taux d'une conversion imprimée en suite (« CONV. EN CAD @ 1.36340 »). */
    tauxConversion?: number;
}

interface PositionDisnat {
    ligne: number;
    /** Description ET symbole, tels qu'imprimés avant la quantité. Ils ne se séparent PAS sur le seul
     *  texte : la colonne « Symbole » est souvent vide (« … UCITS », « … ETC » ressemblent à des
     *  symboles et n'en sont pas). La correspondance avec le référentiel les lit ensemble. */
    libelle: string;
    quantite: number;
    /** Absents quand le relevé imprime « ND » (coût non établi). */
    coutUnitaire?: number;
    coutComptable?: number;
    prixMarche: number;
    /** Astérisque du relevé : l'évaluation du prix lui semble incertaine. */
    prixIncertain: boolean;
    /** Devise de COTATION imprimée ; colonne vide = CAD. */
    devise: string;
    /** Valeur marchande en CAD, telle qu'imprimée. */
    valeurMarchande: number;
    /** Indicateur (1 : valeur non établie, 2 : coût estimé d'après le marché, 3 : frais différés). */
    indicateur?: number;
    statut: string;
}

export interface CompteReleve {
    compte: CompteDisnat;
    soldeOuverture?: number;
    soldeFermeture?: number;
    operations: OperationDisnat[];
    positions: PositionDisnat[];
    /** Ligne « ENCAISSE » des détails d'actifs (catégorie « Encaisse et équivalents »), dans la devise
     *  du compte. Elle doit égaler le solde de fermeture : c'est le recoupement que l'ancien parseur
     *  perdait avec la ligne elle-même. Absente = le relevé n'en imprime pas (encaisse nulle). */
    encaisseDetail?: number;
}

type AnomalieReleve =
    | { type: 'date-arrete-introuvable' }
    | { type: 'compte-inconnu'; ligne: number }
    | { type: 'compte-en-double'; ligne: number }
    | { type: 'compte-non-ferme'; compte: CompteDisnat }
    | { type: 'ligne-illisible'; ligne: number; section: 'activite' | 'positions' }
    | { type: 'suite-orpheline'; ligne: number }
    | { type: 'solde-illisible'; compte: CompteDisnat }
    /** Σ montants ≠ fermeture − ouverture : un montant manque ou a été mal découpé. */
    | { type: 'encaisse-non-recoupee'; compte: CompteDisnat }
    /** La ligne « ENCAISSE » des détails d'actifs ne vaut pas le solde de fermeture du compte. */
    | { type: 'encaisse-detail-non-recoupee'; compte: CompteDisnat }
    /** Aucun découpage de la ligne ne fait retomber quantité × coût unitaire sur le coût comptable. */
    | { type: 'cout-non-recoupe'; ligne: number };

export interface ReleveDisnat {
    /** Date d'arrêté (`YYYY-MM-DD`), celle du titre « Au 31 janvier 2026 ». */
    dateArrete: string;
    /** « 1,00 USD = x CAD » de la première page, s'il est imprimé. */
    tauxUsdCad?: number;
    comptes: CompteReleve[];
    anomalies: AnomalieReleve[];
}

const MOIS: Record<string, string> = {
    janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
    juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12',
};

/** « 31 janvier 2026 » ou « 1er mars 2026 » → `2026-01-31`. `null` si illisible. */
function dateEnLettres(texte: string): string | null {
    const m = /^(\d{1,2})(?:er)?\s+(\S+)\s+(\d{4})$/.exec(texte.trim());
    const mois = m ? MOIS[m[2].toLowerCase()] : undefined;
    if (!m || !mois) return null;
    return `${m[3]}-${mois}-${m[1].padStart(2, '0')}`;
}

/** `JJ/MM/AAAA` → `AAAA-MM-JJ`. */
const dateNumerique = (t: string): string => `${t.slice(6, 10)}-${t.slice(3, 5)}-${t.slice(0, 2)}`;

/** Normalise ce que l'extraction PDF peut varier sans changer le sens : apostrophes typographiques,
 *  espaces insécables et multiples. */
const normaliser = (l: string): string => l.replace(/[’‘]/g, '\'').replace(/[  \t]+/g, ' ').replace(/ {2,}/g, ' ').trim();

// ── Nombres au format du relevé : « 12 946,21 », « -600,00 », « 1 011,2657 ». ─────────────────
// Un nombre FINIT par un jeton qui porte la virgule. Il peut être précédé de groupes de milliers : un
// groupe du milieu a EXACTEMENT trois chiffres, le groupe de tête un à trois (et porte le signe).
const FIN_NOMBRE = /^(-?)(\d{1,3}),(\d+)$/;
const TETE = /^-?\d{1,3}$/;
const GROUPE = /^\d{3}$/;

interface Lu { valeur: number; debut: number }

/**
 * Lit le nombre qui FINIT au jeton `fin - 1`. `groupes` = nombre de groupes de milliers à absorber à
 * gauche (`'max'` : autant que possible). Rend `null` si le jeton de fin n'est pas un nombre.
 */
function nombreQuiFinitA(jetons: readonly string[], fin: number, groupes: number | 'max'): Lu | null {
    const dernier = jetons[fin - 1];
    const m = dernier === undefined ? null : FIN_NOMBRE.exec(dernier);
    if (!m) return null;
    let debut = fin - 1;
    let pris = 0;
    // Le jeton de fin n'est un groupe « du milieu » (absorbable) que s'il a exactement 3 chiffres.
    let absorbable = m[1] === '' && m[2].length === 3;
    while (absorbable && (groupes === 'max' || pris < groupes) && debut > 0 && TETE.test(jetons[debut - 1])) {
        debut -= 1;
        pris += 1;
        absorbable = GROUPE.test(jetons[debut]);
    }
    if (groupes !== 'max' && pris !== groupes) return null;
    const texte = jetons.slice(debut, fin).join('');
    return { valeur: Number(texte.replace(',', '.')), debut };
}

/** Toutes les lectures possibles du nombre qui finit à `fin` (de 0 groupe de milliers au maximum). */
function lecturesPossibles(jetons: readonly string[], fin: number): Lu[] {
    const max = nombreQuiFinitA(jetons, fin, 'max');
    if (!max) return [];
    const out: Lu[] = [];
    for (let g = 0; g <= fin - 1 - max.debut; g++) {
        const l = nombreQuiFinitA(jetons, fin, g);
        if (l) out.push(l);
    }
    return out;
}

const estQuantite = (t: string | undefined): boolean => t !== undefined && /^\d+(,\d+)?$/.test(t);
const quantite = (t: string): number => Number(t.replace(',', '.'));

// ── Habillage de page : jamais une ligne de contenu (point 2 de l'en-tête). ───────────────────
const HABILLAGE = [/^Page \d+ de \d+$/, /^Relevé de portefeuille$/, /^Au \d/, /^Numéro de client/];
const estHabillage = (l: string): boolean => HABILLAGE.some((r) => r.test(l));

const DEBUT_COMPTE = /^Profil de votre compte (.+?) - \S+$/;
const FIN_COMPTE = /^Valeur totale de votre compte /;
const SOLDE = /Solde de fermeture au (\d{1,2}(?:er)? \S+ \d{4}) (-?[\d ]*\d,\d{2}) \$/;
const LIGNE_OPERATION = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}\/\d{2}\/\d{4}) (.+)$/;
const TAUX_PAGE_UN = /1,00 USD = (\d+,\d+) CAD/;
const CONVERSION = /^CONV\. EN CAD @ (\d+\.\d+)$/;

/** Lit une ligne d'activité (après les deux dates). `null` si elle est illisible. */
function lireOperation(ligne: number, dT: string, dR: string, reste: string): OperationDisnat | null {
    const connu = LIBELLES.find(([l]) => reste === l || reste.startsWith(`${l} `));
    const libelle = connu ? connu[0] : reste.split(' ')[0];
    const jetons = reste.slice(libelle.length).trim().split(' ').filter(Boolean);
    let fin = jetons.length;
    // Montant (dernier nombre), puis prix s'il en précède un autre. Lecture GLOUTONNE : c'est le
    // recoupement de l'encaisse qui juge si un chiffre de la description a été avalé.
    const montant = nombreQuiFinitA(jetons, fin, 'max');
    if (montant) fin = montant.debut;
    const prix = montant ? nombreQuiFinitA(jetons, fin, 'max') : null;
    if (prix) fin = prix.debut;
    let debutDescription = 0;
    let q: number | undefined;
    if (estQuantite(jetons[0]) && fin > 1) { q = quantite(jetons[0]); debutDescription = 1; }
    const description = jetons.slice(debutDescription, fin).join(' ');
    if (!connu && description === '' && !montant) return null;
    return {
        ligne, dateTransaction: dateNumerique(dT), dateReglement: dateNumerique(dR),
        sorte: connu ? connu[1] : null, libelle,
        ...(q !== undefined ? { quantite: q } : {}),
        description,
        ...(prix ? { prix: prix.valeur } : {}),
        ...(montant ? { montant: montant.valeur } : {}),
        suite: [],
    };
}

/**
 * Lit une ligne de position. De droite à gauche : statut, indicateur éventuel, %, valeur marchande,
 * devise éventuelle, astérisque éventuel, prix du marché, coût comptable, coût unitaire, quantité,
 * puis le libellé (description et symbole éventuel, non séparables). Le seul découpage AMBIGU (quantité ↔ coût unitaire : « 42 1 011,2657 »)
 * est tranché par le recoupement quantité × coût unitaire ≈ coût comptable.
 */
function lirePosition(ligne: number, texte: string, indicateur: number | undefined): PositionDisnat | 'illisible' | 'cout-non-recoupe' {
    const j = texte.split(' ');
    let fin = j.length;
    const statut = j[fin - 1];
    if (!/^[A-D]$/.test(statut ?? '')) return 'illisible';
    fin -= 1;
    let indic = indicateur;
    if (/^[123]$/.test(j[fin - 1] ?? '') && FIN_NOMBRE.test(j[fin - 2] ?? '')) { indic = Number(j[fin - 1]); fin -= 1; }
    const pct = nombreQuiFinitA(j, fin, 'max');
    if (!pct) return 'illisible';
    fin = pct.debut;
    const valeur = nombreQuiFinitA(j, fin, 'max');
    if (!valeur) return 'illisible';
    fin = valeur.debut;
    let devise = 'CAD';
    if (/^[A-Z]{3}$/.test(j[fin - 1] ?? '')) { devise = j[fin - 1]; fin -= 1; }
    let prixIncertain = false;
    if (j[fin - 1] === '*') { prixIncertain = true; fin -= 1; }
    const prix = nombreQuiFinitA(j, fin, 'max');
    if (!prix) return 'illisible';
    fin = prix.debut;

    let coutComptable: number | undefined;
    let coutUnitaire: number | undefined;
    let q: number | undefined;
    let finDescription: number;
    if (j[fin - 1] === 'ND' && j[fin - 2] === 'ND') {
        fin -= 2;
        if (!estQuantite(j[fin - 1])) return 'illisible';
        q = quantite(j[fin - 1]);
        finDescription = fin - 1;
    } else {
        const cc = nombreQuiFinitA(j, fin, 'max');
        if (!cc) return 'illisible';
        coutComptable = cc.valeur;
        fin = cc.debut;
        const candidats = lecturesPossibles(j, fin)
            .filter((l) => l.debut > 0 && estQuantite(j[l.debut - 1]))
            .filter((l) => {
                const qte = quantite(j[l.debut - 1]);
                // Tolérance : le coût unitaire imprimé est arrondi à 4 décimales (½ × 10⁻⁴ par titre),
                // plus un cent d'arrondi du coût comptable.
                return Math.abs(qte * l.valeur - cc.valeur) <= qte * 0.00005 + 0.01;
            });
        if (candidats.length === 0) return 'cout-non-recoupe';
        // Deux lectures qui recoupent toutes les deux : on ne devine pas.
        if (candidats.length > 1) return 'cout-non-recoupe';
        coutUnitaire = candidats[0].valeur;
        q = quantite(j[candidats[0].debut - 1]);
        finDescription = candidats[0].debut - 1;
    }
    const avant = j.slice(0, finDescription);
    if (avant.length === 0) return 'illisible';
    return {
        ligne, libelle: avant.join(' '), quantite: q,
        ...(coutUnitaire !== undefined ? { coutUnitaire } : {}), ...(coutComptable !== undefined ? { coutComptable } : {}),
        prixMarche: prix.valeur, prixIncertain, devise, valeurMarchande: valeur.valeur,
        ...(indic !== undefined ? { indicateur: indic } : {}), statut,
    };
}

const enCents = (v: number): number => Math.round(v * 100);

/** Lit un relevé à partir de ses lignes de texte. Ne lève jamais : tout défaut est une anomalie. */
export function lireReleveDisnat(lignesBrutes: readonly string[]): ReleveDisnat {
    const anomalies: AnomalieReleve[] = [];
    const comptes: CompteReleve[] = [];
    let dateArrete: string | null = null;
    let tauxUsdCad: number | undefined;
    let courant: CompteReleve | null = null;
    let mode: 'profil' | 'activite' | 'positions' | 'hors-compte' = 'hors-compte';
    let indicateurEnAttente: number | undefined;

    const fermer = (): void => {
        if (!courant) return;
        comptes.push(courant);
        courant = null;
    };

    lignesBrutes.forEach((brute, i) => {
        const n = i + 1;
        const l = normaliser(brute);
        if (l === '') return;
        if (dateArrete === null) {
            const m = /^Au (.+)$/.exec(l);
            const d = m ? dateEnLettres(m[1]) : null;
            if (d) { dateArrete = d; return; }
        }
        const taux = TAUX_PAGE_UN.exec(l);
        if (taux && tauxUsdCad === undefined) tauxUsdCad = Number(taux[1].replace(',', '.'));
        if (estHabillage(l)) return;

        const debut = DEBUT_COMPTE.exec(l);
        if (debut) {
            fermer();
            const type = debut[1];
            const compte: CompteDisnat | null = type === 'comptant' ? 'courtier-cad' : type === 'comptant USD' ? 'courtier-usd' : null;
            if (!compte) { anomalies.push({ type: 'compte-inconnu', ligne: n }); mode = 'hors-compte'; return; }
            if (comptes.some((c) => c.compte === compte)) { anomalies.push({ type: 'compte-en-double', ligne: n }); mode = 'hors-compte'; return; }
            courant = { compte, operations: [], positions: [] };
            mode = 'profil';
            return;
        }
        if (!courant || mode === 'hors-compte') return;
        const c: CompteReleve = courant;
        if (FIN_COMPTE.test(l)) { fermer(); mode = 'hors-compte'; return; }

        const solde = SOLDE.exec(l);
        if (solde) {
            const d = dateEnLettres(solde[1]);
            const v = Number(solde[2].replace(/ /g, '').replace(',', '.'));
            if (d !== null && d === dateArrete) c.soldeFermeture = v; else c.soldeOuverture = v;
        }
        if (l === 'Activité mensuelle') { mode = 'activite'; return; }
        if (/^Détails de vos actifs\b/.test(l)) { mode = 'positions'; indicateurEnAttente = undefined; return; }

        if (mode === 'activite') {
            if (/^Date de transaction /.test(l)) return;
            const op = LIGNE_OPERATION.exec(l);
            if (op) {
                const lue = lireOperation(n, op[1], op[2], op[3]);
                if (lue) c.operations.push(lue); else anomalies.push({ type: 'ligne-illisible', ligne: n, section: 'activite' });
                return;
            }
            const derniere = c.operations[c.operations.length - 1];
            if (!derniere) { anomalies.push({ type: 'suite-orpheline', ligne: n }); return; }
            derniere.suite.push(l);
            const conv = CONVERSION.exec(l);
            if (conv) derniere.tauxConversion = Number(conv[1]);
            return;
        }
        if (mode === 'positions') {
            // En-têtes de colonnes et catégories : sans aucun chiffre, ou « Total … ».
            if (/^Total /.test(l) || !/\d/.test(l)) return;
            if (/^(Coût unitaire|Description Symbole|moyen)/.test(l)) return;
            if (/^[123]$/.test(l)) { indicateurEnAttente = Number(l); return; }
            if (/^ENCAISSE /.test(l)) {
                // « ENCAISSE <coût> <valeur marchande> <%> », sans statut ni quantité.
                const j = l.split(' ');
                const pct = nombreQuiFinitA(j, j.length, 'max');
                const valeur = pct ? nombreQuiFinitA(j, pct.debut, 'max') : null;
                const cout = valeur ? nombreQuiFinitA(j, valeur.debut, 'max') : null;
                if (!cout || cout.debut !== 1 || c.encaisseDetail !== undefined) anomalies.push({ type: 'ligne-illisible', ligne: n, section: 'positions' });
                else c.encaisseDetail = (valeur as Lu).valeur;
                return;
            }
            const p = lirePosition(n, l, indicateurEnAttente);
            indicateurEnAttente = undefined;
            if (p === 'illisible') anomalies.push({ type: 'ligne-illisible', ligne: n, section: 'positions' });
            else if (p === 'cout-non-recoupe') anomalies.push({ type: 'cout-non-recoupe', ligne: n });
            else c.positions.push(p);
        }
    });
    if (courant) {
        anomalies.push({ type: 'compte-non-ferme', compte: (courant as CompteReleve).compte });
        fermer();
    }
    if (dateArrete === null) anomalies.push({ type: 'date-arrete-introuvable' });

    // Recoupement de l'encaisse (point 4 de l'en-tête).
    for (const c of comptes) {
        if (c.soldeOuverture === undefined || c.soldeFermeture === undefined) {
            anomalies.push({ type: 'solde-illisible', compte: c.compte });
            continue;
        }
        const somme = c.operations.reduce((s, o) => s + (o.montant === undefined ? 0 : enCents(o.montant)), 0);
        if (somme !== enCents(c.soldeFermeture) - enCents(c.soldeOuverture)) anomalies.push({ type: 'encaisse-non-recoupee', compte: c.compte });
        if (c.encaisseDetail !== undefined && enCents(c.encaisseDetail) !== enCents(c.soldeFermeture)) {
            anomalies.push({ type: 'encaisse-detail-non-recoupee', compte: c.compte });
        }
    }
    return { dateArrete: dateArrete ?? '', ...(tauxUsdCad !== undefined ? { tauxUsdCad } : {}), comptes, anomalies };
}
