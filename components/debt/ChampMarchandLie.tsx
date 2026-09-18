// components/debt/ChampMarchandLie.tsx
//
// [DETTE-MARCHAND-RECHERCHE] Choisir le marchand qui rembourse une dette, dans une liste qui se
// CHERCHE au lieu de se dérouler.
//
// ⚠️ POURQUOI CE LOT EXISTE, et la mesure qui l'a déclenché. Le champ était un `<select>` natif qui
// offrait TOUT marchand ayant au moins une sortie d'argent, trié par fréquence décroissante. Mesuré
// sur les vraies transactions de Marc le 2026-09-18 : **1 879 sorties d'argent**, dont
// `Tim Hortons` **218 fois** et `Metro Ferland Du Marai` **50 fois**, contre **8** pour
// `Toyota Financial` — celui qu'il cherchait. L'option EXISTAIT, au libellé exact
// « Toyota Financial (8) », et il ne la voyait pas : « je vois pas toyota dans la liste ». Un tri
// par fréquence enterre par construction ce qu'on cherche dès que la liste dépasse un écran.
//
// ⚠️ CE QUI N'A PAS CHANGÉ, et c'est délibéré : la liste reste la SEULE émettrice de valeur. Taper
// dans le champ ne pose RIEN — seul un clic sur une ligne existante écrit `paymentPayee`. Un champ
// « nom exact du marchand » est un appariement déguisé en formulaire : il demande à l'humain de
// deviner une égalité de chaîne, accents et espaces compris, et un caractère de travers rend la
// dette muette sans rien dire. La recherche FILTRE ce qui est offert, elle ne fabrique pas de valeur.
//
// ⚠️ ET LA NORMALISATION DE RECHERCHE N'EST PAS UNE CLÉ. `clePayee` fait un `trim()` et RIEN
// d'autre, parce que rabattre la casse ou les accents FUSIONNERAIT deux marchands distincts — c'est
// écrit dans son en-tête, mesuré à l'automne sur la bascule Fintable. `cleRecherche` ci-dessous
// rabat casse et accents, ce qui est juste pour TROUVER et faux pour APPARIER : elle ne sort jamais
// d'ici, et la valeur émise reste le `payee` d'origine, au caractère près.

import React, { useMemo, useState } from 'react';

/** Marchand offert au lien : son libellé exact, et le nombre de sorties d'argent connues. */
export interface MarchandCandidat { payee: string; nb: number }

/**
 * Clé de COMPARAISON pour la recherche — insensible à la casse et aux accents.
 *
 * ⚠️ Ne JAMAIS l'employer comme clé d'appariement : deux marchands distincts que seuls la casse ou
 * un accent séparent doivent le RESTER (`clePayee`, source unique de l'appariement, fait un `trim()`
 * et rien d'autre, et son en-tête dit pourquoi). Ici on cherche, on n'apparie pas.
 */
const cleRecherche = (s: string): string =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Les marchands qui correspondent à la requête, dans l'ORDRE REÇU (fréquence décroissante).
 *
 * Une requête vide rend la liste ENTIÈRE : le champ ne doit rien cacher tant que personne n'a
 * demandé à filtrer — sinon on remplace « trop long » par « on ne sait pas ce qu'il y a dedans ».
 */
export function filtrerMarchands(
    marchands: ReadonlyArray<MarchandCandidat>,
    requete: string,
): MarchandCandidat[] {
    const q = cleRecherche(requete);
    if (q === '') return [...marchands];
    return marchands.filter(m => cleRecherche(m.payee).includes(q));
}

interface Props {
    /** Le marchand actuellement lié, déjà passé par `clePayee` (chaîne vide = aucun lien). */
    lie: string;
    marchands: ReadonlyArray<MarchandCandidat>;
    /** Reçoit le libellé EXACT choisi, ou `undefined` pour retirer le lien. */
    onChoisir: (payee: string | undefined) => void;
    /** Identifiant du champ de recherche — les deux formulaires coexistent dans le DOM. */
    id: string;
}

/**
 * ⚠️ PAS d'état ouvert/fermé, et c'est délibéré. Un champ de recherche qui se REPLIE une fois le
 * choix fait rend le lien invisible au montage suivant — `UN-ETAT-DE-FILTRAGE-SANS-CONTROLE-QUI-LE-
 * RALLUME-EST-UNE-TRAPPE` appliqué à un formulaire.
 *
 * ⚠️⚠️ DEUX LIGNES SONT HORS DU FILTRE, et c'est la moitié qui manquait au 1er jet. « Aucun lien »
 * l'était déjà ; le marchand DÉJÀ LIÉ, lui, était filtré comme n'importe quel autre — donc chercher
 * « hydro » sur une dette liée à « Toyota Financial » le faisait DISPARAÎTRE de l'écran, avec sa
 * coche, sans que rien d'autre ne dise à quoi la dette est liée. Le commentaire de ce fichier
 * AFFIRMAIT pourtant la garantie inverse (« le marchand lié est marqué, la liste reste là ») :
 * elle n'était vraie qu'à requête vide ou correspondante. La même classe que celle citée juste
 * au-dessus, re-commise dans le fichier qui la cite.
 *
 * ⚠️ ET AUCUN RÔLE ARIA DE COMBOBOX. Le 1er jet posait `role="combobox"` + `aria-expanded` +
 * `listbox`/`option`. Mesuré (axe-core, 3 violations `nested-interactive`, sévérité *serious*) :
 * un `role="option"` qui CONTIENT un `<button>` est un contrôle imbriqué, et le focus se pose sur
 * le bouton — donc l'`aria-selected` du `<li>` n'était jamais exposé à l'élément focalisé. Pire,
 * `aria-expanded={resultats.length > 0}` devenait `false` alors que la liste restait RENDUE (la
 * ligne « aucun lien » est hors filtre) : un attribut qui annonce « replié » pendant que du
 * contenu actionnable est affiché ment plus qu'un `<select>`, qui lui n'a jamais menti. Et le rôle
 * `combobox` PROMET les flèches et `aria-activedescendant`, que ce composant n'implémente pas.
 * Le patron réel est « un champ qui filtre, une liste de boutons » : on l'écrit tel quel, et
 * l'option courante se dit par `aria-current`, porté par l'élément qui a VRAIMENT le focus.
 */
export const ChampMarchandLie: React.FC<Props> = ({ lie, marchands, onChoisir, id }) => {
    const [requete, setRequete] = useState('');

    // ⚠️ Le marchand DÉJÀ lié figure toujours dans la liste, même si plus aucune transaction ne le
    // porte : sans lui, ouvrir le formulaire puis choisir effacerait le lien en silence, et Marc
    // n'aurait aucun moyen de voir à quoi sa dette est liée.
    // ⚠️ Et son `nb: 0` s'ÉCRIT « aucun virement trouvé », pas « (0) » : le `<select>` que ce lot
    // remplace le disait en toutes lettres, et « (0) » est indiscernable d'un marchand simplement
    // rare — une nuance perdue au passage, rendue par le panel.
    const tous = useMemo<MarchandCandidat[]>(() => (
        lie !== '' && !marchands.some(m => m.payee === lie)
            ? [{ payee: lie, nb: 0 }, ...marchands]
            : [...marchands]
    ), [lie, marchands]);

    const resultats = useMemo(() => filtrerMarchands(tous, requete), [tous, requete]);
    const idListe = `${id}-resultats`;
    // ⚠️ Le marchand lié est ÉPINGLÉ hors du filtre, exactement comme « aucun lien » — mais
    // seulement quand le filtre ne le rend pas déjà, sinon il apparaîtrait DEUX fois. Le compte
    // annoncé plus bas reste celui du FILTRE (« N sur M ») : épingler une ligne ne change pas
    // combien de marchands correspondent à la recherche, et prétendre le contraire serait un
    // second mensonge à la place du premier.
    const epingle = useMemo<MarchandCandidat | null>(() => (
        lie !== '' && !resultats.some(m => m.payee === lie)
            ? tous.find(m => m.payee === lie) ?? null
            : null
    ), [lie, resultats, tous]);

    const ligne = (m: MarchandCandidat, choisi: boolean) => (
        <li key={m.payee}>
            <button
                type="button"
                aria-current={choisi ? 'true' : undefined}
                onClick={() => onChoisir(m.payee)}
                className={`w-full text-left px-2 py-1 min-h-[44px] text-meta hover:bg-white/10 touch-target ${choisi ? 'text-primary font-bold' : 'text-white'}`}
            >
                {m.payee} ({m.nb === 0 ? 'aucun virement trouvé' : m.nb}){choisi ? ' ✓' : ''}
            </button>
        </li>
    );

    return (
        <div className="flex flex-col gap-1 text-tiny text-ink-400">
            <label htmlFor={id}>Virements qui remboursent cette dette</label>
            <input
                id={id}
                type="text"
                autoComplete="off"
                placeholder="Cherche un marchand : toyota, hydro…"
                value={requete}
                onChange={e => setRequete(e.target.value)}
                className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white"
            />
            <ul
                id={idListe}
                aria-label="Marchands à lier à cette dette"
                className="max-h-56 overflow-y-auto rounded border border-white/10 bg-dark divide-y divide-white/5"
            >
                {/* ⚠️ Le libellé de l'option vide dit si l'état est INACHEVÉ ou CHOISI : « aucun lien »
                    est un état parfaitement défini (la dette suit alors la cadence saisie), pas un
                    formulaire à finir. Hors filtre, donc toujours à un geste. */}
                <li>
                    <button
                        type="button"
                        aria-current={lie === '' ? 'true' : undefined}
                        onClick={() => onChoisir(undefined)}
                        className="w-full text-left px-2 py-1 min-h-[44px] text-meta text-ink-300 hover:bg-white/10 touch-target"
                    >
                        — aucun : suivre la cadence saisie ci-dessous —
                    </button>
                </li>
                {epingle !== null && ligne(epingle, true)}
                {resultats.map(m => ligne(m, m.payee === lie))}
            </ul>
            {/* Ce que la recherche a RETIRÉ de la vue se DIT : une liste filtrée qui ne compte pas
                est indiscernable d'une liste vide. */}
            <span role="status" aria-live="polite">
                {requete.trim() === ''
                    ? `${tous.length} marchand${tous.length > 1 ? 's' : ''} · tape pour filtrer`
                    : `${resultats.length} sur ${tous.length} marchand${tous.length > 1 ? 's' : ''}`}
            </span>
        </div>
    );
};
