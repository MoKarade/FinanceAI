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
// Les effacer, c'est réarmer trois fois la même plainte.
//
// ⚠️⚠️ PREMIÈRE FORME LIVRÉE, ET ELLE ÉTAIT MORTE — Marc, 2026-09-21 : « le truc impôt latent
// méthode et raccord sert à rien, le ⓘ fait rien ». La phrase entière vivait dans un `title` plus
// un jumeau `sr-only`. Or **l'en-tête de ce fichier DÉCRIVAIT déjà le défaut** : « un `title` sur
// un `<span>` non focusable n'est lisible qu'à la SOURIS, donc ni au doigt, ni au clavier ». Je
// l'avais écrit comme la JUSTIFICATION d'ajouter le jumeau `sr-only`, et j'ai livré quand même un
// chemin visuel réservé à la souris — sur un écran que Marc regarde au téléphone. Il tapait, rien
// ne s'ouvrait : une pastille qui annonce une explication sans pouvoir la donner est pire que pas
// de pastille, elle promet et ne tient pas.
//
// FORME ACTUELLE : un vrai `<button>` de dévoilement (`aria-expanded` / `aria-controls`) qui
// AFFICHE la phrase sous la rangée. Le doigt, la souris, le clavier et le lecteur d'écran passent
// tous par le MÊME chemin — il n'y a plus de version « pour les voyants à la souris » et une autre
// pour le reste. Le `title` et le jumeau `sr-only` sont retirés : ils étaient la béquille du
// chemin mort, et les garder ferait relire deux fois la même phrase à un lecteur d'écran.
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
 * Le rendu : une rangée de pastilles DÉPLIABLES. Rien de visible quand il n’y a rien à dire.
 *
 * ⚠️ Le conteneur `role="status"` reste monté MÊME VIDE : `mentionAutoriteCourtier` dérive de
 * l’état du store et peut passer de vide à non-vide EN COURS DE SESSION (une synchro Fintable de
 * fond pendant que l’écran est ouvert). Monté à ce moment-là, le nœud apparaît DÉJÀ rempli et la
 * première annonce — la seule utile — est perdue
 * (`UNE-REGION-LIVE-MONTEE-CONDITIONNELLEMENT-N-ANNONCE-PAS`).
 *
 * ⚠️ UNE SEULE note ouverte à la fois : deux pavés dépliés côte à côte reconstruiraient exactement
 * le mur de texte que ce lot a retiré. Re-taper la pastille ouverte la referme — un état qui
 * retire quelque chose de l’écran doit avoir son geste de retour
 * (`UN-ETAT-DE-FILTRAGE-SANS-CONTROLE-QUI-LE-RALLUME-EST-UNE-TRAPPE`).
 */
export const NotesGraphe: React.FC<{ notes: NoteGraphe[] }> = ({ notes }) => {
    const [ouverte, setOuverte] = React.useState<string | null>(null);
    const active = notes.find((n) => n.cle === ouverte) ?? null;
    return (
        <div role="status" className={notes.length ? 'mt-2' : 'sr-only'}>
            <div className="flex flex-wrap items-center gap-1.5">
                {notes.map((n) => {
                    const ouvert = n.cle === ouverte;
                    return (
                        <button
                            key={n.cle}
                            type="button"
                            data-note={n.cle}
                            aria-expanded={ouvert}
                            aria-controls={`note-${n.cle}`}
                            onClick={() => setOuverte(ouvert ? null : n.cle)}
                            // [E2E-REDUCED-MOTION] `touch-target` (44×44, `index.css`) : le cliquet mobile de
                            // `futureMobileFilet` a compté ces pastilles comme DEUX cibles neuves de 25 px
                            // de haut (59 → 61). C'est le défaut que ce lot existe pour corriger, vu une
                            // marche plus bas : une pastille qu'on annonce TAPABLE au doigt et qui mesure
                            // 25 px ne l'est pas. Patron repris tel quel de `ui/SubTabs` et `ui/Toast`,
                            // inconditionnel comme chez eux (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`).
                            className={`touch-target inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors focus-ring ${
                                ouvert
                                    ? 'border-primary/60 bg-primary/15 text-ink-50'
                                    : 'border-white/15 bg-white/5 text-ink-300 hover:bg-white/10'
                            }`}
                        >
                            <span aria-hidden="true">{ouvert ? '×' : 'ⓘ'}</span>
                            {n.label}
                        </button>
                    );
                })}
            </div>
            {active && (
                <p
                    id={`note-${active.cle}`}
                    data-note-texte={active.cle}
                    className="mt-1.5 rounded-card border border-white/10 bg-white/5 px-3 py-2 text-tiny leading-relaxed text-ink-300"
                >
                    {active.explication}
                </p>
            )}
        </div>
    );
};
