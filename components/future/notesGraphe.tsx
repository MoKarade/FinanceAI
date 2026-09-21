// components/future/notesGraphe.tsx
//
// [FUTUR-NOTES-COMPACTES] Les réserves du graphe Futur, en PASTILLES au lieu de pavés.
//
// Marc, 2026-09-21, capture à l'appui, deux blocs biffés au marqueur rouge : « vire moi tout le
// texte que j'ai barré ». Les deux : le bandeau « aujourd'hui part du total de ton courtier… d'où
// la marche au raccord » et le pavé « Courbe au jour — … » (méthodologie + impôt latent).
//
// ⚠️⚠️ CE QUI EST EN TENSION ICI, ET POURQUOI CE MODULE EXISTE PLUTÔT QU'UN `git rm` DE TROIS
// PARAGRAPHES. « Moins de texte » se satisfait trivialement en SUPPRIMANT de l'information
// (`EPURATION-SUPPRIME-LA-RESERVE`), et les trois phrases biffées répondent chacune à une question
// que Marc a DÉJÀ posée :
//   • la marche au raccord — « explique pourquoi j'ai pas la même valeur sur mon app et sur
//     Fintable » (le jour même où il biffe la phrase qui y répond) ;
//   • l'impôt latent qui démarre au milieu — « je vois impôt latent commencer le 1/09 mais jsp
//     pourquoi » (`[PASSE-REEL-IMPOT-LATENT-DEBUT]`) ;
//   • réel avant / projeté après — la distinction sans laquelle un point passé et un point futur
//     se lisent avec la même confiance.
// Les effacer, c'est réarmer trois fois la même plainte. La forme retenue est celle que le dépôt a
// déjà payée pour cette tension exacte (`[FUTUR-INFOBULLE-EPUREE]` + finding a11y #644) : un
// LIBELLÉ court visible, la phrase entière dans le `title` ET dans un jumeau `sr-only` — un `title`
// sur un `<span>` non focusable n'est lisible qu'à la SOURIS, donc ni au doigt, ni au clavier, ni
// au lecteur d'écran. Le pavé disparaît de l'écran ; le FAIT reste atteignable.
//
// ⚠️ Aucune de ces phrases ne porte de MONTANT, et ce n'est pas un hasard : interpolé dans une
// chaîne, un montant n'est plus un nœud, donc plus masquable en mode discret
// (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`). La seule exception possible est
// `raccord`, dont le texte vient du service — et ce service est déjà gardé là-dessus
// (`tests/services/fintable/autoriteCourtier.test.ts`).
import React from 'react';

/** Une réserve : ce qu'on AFFICHE (court) et ce qu'on EXPLIQUE (entier, hors écran). */
export interface NoteGraphe {
    cle: string;
    /** Visible. Court par contrat — c'est tout l'objet de ce lot. */
    label: string;
    /** La phrase entière. Va dans le `title` ET dans le jumeau `sr-only`. */
    explication: string;
}

/** Plafond du libellé VISIBLE. Une pastille qui redevient une phrase rate le lot. */
export const PLAFOND_LABEL = 14;

const METHODE = 'Chaque point est une journée : survole pour la lire, clique pour la figer. '
    + 'Avant aujourd’hui, c’est du RÉEL — tes transactions datées et le prix de tes titres ce '
    + 'jour-là. Après, c’est projeté : ce que l’app sait dater (paie, charges, solde d’impôt) '
    + 'tombe au bon jour, le rendement du marché est réparti sur le mois, et les bandes Monte '
    + 'Carlo sont des percentiles mensuels reliés entre fins de mois. En vue très large le tracé '
    + 'est échantillonné, mais le survol et le clic visent toujours le jour exact.';

const IMPOT_LATENT = 'L’impôt latent n’est pas reconstruit pour le passé : l’app n’a pas '
    + 'l’historique de tes prix de revient. Sa courbe démarre donc au premier mois projeté — '
    + 'ce n’est pas un trou dans tes données.';

/**
 * Les réserves à afficher, dans l’ordre.
 *
 * ⚠️ Chaque note est CONDITIONNELLE, et c’est ce qui l’empêche de devenir du décor : une mention
 * permanente cesse d’être lue (`UN-AVERTISSEMENT-PERMANENT-EST-UN-AVERTISSEMENT-MORT`). En
 * particulier `impot-latent` ne parle que si la série est VISIBLE — sinon on expliquerait une
 * courbe que l’utilisateur a lui-même masquée.
 */
export function notesGraphe(o: {
    courbeAuJour: boolean;
    mentionAutoriteCourtier: string;
    impotLatentVisible: boolean;
}): NoteGraphe[] {
    const out: NoteGraphe[] = [];
    if (o.courbeAuJour) out.push({ cle: 'methode', label: 'Méthode', explication: METHODE });
    // ⚠️ HORS du `courbeAuJour` : cette marche existe dans les DEUX modes, et un signal logé sous
    // la condition d’un autre signal n’est visible que la moitié du temps (le bloc d’origine le
    // disait déjà en toutes lettres — la contrainte survit au changement de forme).
    if (o.mentionAutoriteCourtier.trim()) {
        out.push({ cle: 'raccord', label: 'Raccord', explication: o.mentionAutoriteCourtier.trim() });
    }
    if (o.courbeAuJour && o.impotLatentVisible) {
        out.push({ cle: 'impot-latent', label: 'Impôt latent', explication: IMPOT_LATENT });
    }
    return out;
}

/**
 * Le rendu : une rangée de pastilles. Rien de visible quand il n’y a rien à dire.
 *
 * ⚠️ Le conteneur `role="status"` reste monté MÊME VIDE : `mentionAutoriteCourtier` dérive de
 * l’état du store et peut passer de vide à non-vide EN COURS DE SESSION (une synchro Fintable de
 * fond pendant que l’écran est ouvert). Monté à ce moment-là, le nœud apparaît DÉJÀ rempli et la
 * première annonce — la seule utile — est perdue
 * (`UNE-REGION-LIVE-MONTEE-CONDITIONNELLEMENT-N-ANNONCE-PAS`).
 */
export const NotesGraphe: React.FC<{ notes: NoteGraphe[] }> = ({ notes }) => (
    <div role="status" className={notes.length ? 'mt-2 flex flex-wrap items-center gap-1.5' : 'sr-only'}>
        {notes.map((n) => (
            <span
                key={n.cle}
                data-note={n.cle}
                title={n.explication}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-300"
            >
                <span aria-hidden="true">ⓘ</span>
                {n.label}
                <span className="sr-only"> — {n.explication}</span>
            </span>
        ))}
    </div>
);
