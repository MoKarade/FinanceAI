// tests/components/notesGraphe.test.tsx
//
// [FUTUR-NOTES-COMPACTES] Les deux pavés ont quitté l'écran, les trois RÉSERVES sont restées.
//
// Marc, 2026-09-21, capture au marqueur rouge : « vire moi tout le texte que j'ai barré ».
//
// ⚠️ LA TENSION QUE CE FICHIER TIENT ENSEMBLE, et c'est elle qui fait sa valeur : « moins de
// texte » se satisfait trivialement en SUPPRIMANT de l'information (`EPURATION-SUPPRIME-LA-RESERVE`).
// Deux gardes, donc, et chacune seule est satisfaite par le MAUVAIS moyen :
//   1. PLAFOND — aucun libellé VISIBLE ne dépasse 14 caractères (échoue sur le code d'avant, où la
//      méthodologie faisait ~470 caractères de prose permanente) ;
//   2. AUCUNE RÉSERVE PERDUE — chaque note garde sa phrase entière, atteignable au `title` ET au
//      lecteur d'écran (échoue sur une « épuration » faite à coups de suppressions).
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { notesGraphe, NotesGraphe, PLAFOND_LABEL } from '../../components/future/notesGraphe';
import { sourceFutureProjection } from '../helpers/futureSource';

// ⚠️ Le texte de `raccord` vient du SERVICE (`mentionAutoriteCourtier`), donc la fixture reproduit
// sa LONGUEUR réelle, pas un résumé : mon 1er jet mettait 42 caractères et faisait rougir
// l'assertion « une explication de trois mots ne serait pas une réserve » — la garde avait raison,
// c'est la fixture qui mentait sur ce que le service rend.
const RACCORD = 'Aujourd’hui part du total de ton courtier, au-dessus de la somme des titres que tu '
    + 'as saisis — le passé, lui, reste reconstruit à partir de ces titres, d’où la marche au raccord.';

const TOUT = { courbeAuJour: true, mentionAutoriteCourtier: RACCORD, impotLatentVisible: true };

describe('[FUTUR-NOTES-COMPACTES] ce qui est VISIBLE reste court', () => {
    it('aucun libellé ne dépasse le plafond', () => {
        const notes = notesGraphe(TOUT);
        expect(notes.length).toBe(3); // anti-vacuité : « aucun long » serait vrai de zéro note
        for (const n of notes) {
            expect(n.label.length, `libellé trop long : « ${n.label} »`).toBeLessThanOrEqual(PLAFOND_LABEL);
        }
    });

    it('le rendu ne pose AUCUN nœud de texte visible plus long que le plafond', () => {
        const { container } = render(<NotesGraphe notes={notesGraphe(TOUT)} />);
        const visibles: string[] = [];
        const walk = (n: Node) => {
            if (n.nodeType === 3) {
                const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
                if (t) visibles.push(t);
                return;
            }
            if (n.nodeType === 1 && (n as Element).classList?.contains('sr-only')) return;
            n.childNodes.forEach(walk);
        };
        walk(container);
        expect(visibles.length).toBeGreaterThan(2); // l'écran n'est pas vide
        expect(visibles.filter((t) => t.length > PLAFOND_LABEL)).toEqual([]);
    });
});

describe('[FUTUR-NOTES-COMPACTES] aucune réserve perdue', () => {
    it('taper une pastille AFFICHE sa phrase entière ; re-taper la referme', () => {
        // ⚠️⚠️ TEST INVERSÉ EN PLACE. Il exigeait la phrase dans le `title` ET dans un jumeau
        // `sr-only` — la forme livrée le 2026-09-21, et elle était MORTE : Marc, au téléphone,
        // « le truc impôt latent méthode et raccord sert à rien, le ⓘ fait rien ». Un `title` sur
        // un nœud non focusable ne se révèle qu'au SURVOL SOURIS. L'ancienne assertion passait au
        // vert sur un écran où le geste ne produisait RIEN : elle mesurait la présence d'un
        // attribut, pas l'atteignabilité d'une information.
        // Ce qui est affirmé maintenant est le FAIT, pas la forme : la phrase est atteignable PAR
        // LE GESTE que la pastille annonce. Le supprimer laisserait croire que ce chemin n'a
        // jamais été cassé (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
        const notes = notesGraphe(TOUT);
        const { container } = render(<NotesGraphe notes={notes} />);
        for (const n of notes) {
            const bouton = container.querySelector<HTMLButtonElement>(`button[data-note="${n.cle}"]`);
            expect(bouton, `pastille ${n.cle} absente, ou ce n'est pas un bouton`).toBeTruthy();
            expect(bouton!.getAttribute('aria-expanded')).toBe('false');
            // Fermée, la pastille ne DIT pas encore sa phrase — sinon « taper l'affiche » serait
            // vrai d'un écran qui l'affichait déjà.
            expect(container.textContent).not.toContain(n.explication);

            fireEvent.click(bouton!);
            expect(bouton!.getAttribute('aria-expanded')).toBe('true');
            const texte = container.querySelector(`[data-note-texte="${n.cle}"]`);
            expect(texte, `la phrase de ${n.cle} ne s'affiche pas au clic`).toBeTruthy();
            expect(texte!.textContent).toContain(n.explication);
            // Le bouton DÉSIGNE bien le bloc qu'il ouvre (sinon le lecteur d'écran ne suit pas).
            expect(bouton!.getAttribute('aria-controls')).toBe(texte!.id);

            // …et le geste de RETOUR existe : re-taper referme.
            fireEvent.click(bouton!);
            expect(bouton!.getAttribute('aria-expanded')).toBe('false');
            expect(container.textContent).not.toContain(n.explication);

            // Une « explication » de trois mots ne serait pas une réserve.
            expect(n.explication.length).toBeGreaterThan(60);
        }
    });

    it('le chemin RÉSERVÉ À LA SOURIS a disparu — plus de `title`, plus de jumeau `sr-only`', () => {
        // ⚠️ La garde qui compte vraiment. Les deux béquilles servaient à rendre la phrase
        // « atteignable » sans qu'aucun geste ne l'ouvre ; les laisser en place reconstruirait le
        // défaut à la première refonte, et ferait relire deux fois la même phrase à un lecteur
        // d'écran. Anti-vacuité : les pastilles existent bien (sinon « aucun title » est vrai d'un
        // écran vide).
        const notes = notesGraphe(TOUT);
        const { container } = render(<NotesGraphe notes={notes} />);
        expect(container.querySelectorAll('button[data-note]').length).toBe(3);
        expect(container.querySelectorAll('[data-note][title]').length).toBe(0);
        expect(container.querySelectorAll('[data-note] .sr-only').length).toBe(0);
    });

    it('une seule note ouverte à la fois — deux pavés dépliés refont le mur de texte', () => {
        const notes = notesGraphe(TOUT);
        const { container } = render(<NotesGraphe notes={notes} />);
        fireEvent.click(container.querySelector('button[data-note="methode"]')!);
        fireEvent.click(container.querySelector('button[data-note="raccord"]')!);
        expect(container.querySelectorAll('[data-note-texte]').length).toBe(1);
        expect(container.querySelector('[data-note-texte]')!.getAttribute('data-note-texte'))
            .toBe('raccord');
    });

    it('les trois réserves répondent chacune à une question que Marc a POSÉE', () => {
        const [methode, raccord, latent] = notesGraphe(TOUT);
        // réel vs projeté — ce qui distingue une mesure d'une prévision
        expect(methode.explication).toContain('RÉEL');
        expect(methode.explication.toLowerCase()).toContain('projeté');
        // la marche au raccord — « explique pourquoi j'ai pas la même valeur sur mon app et sur
        // Fintable », posée le jour même où le bandeau a été biffé
        expect(raccord.explication.toLowerCase()).toContain('courtier');
        // « je vois impôt latent commencer le 1/09 mais jsp pourquoi »
        expect(latent.explication).toContain('premier mois projeté');
    });
});

describe('[FUTUR-NOTES-COMPACTES] chaque note est CONDITIONNELLE', () => {
    it('courbe au MOIS : ni méthode, ni impôt latent', () => {
        // Ces deux notes décrivent la courbe au JOUR ; les afficher au mois serait faux.
        const notes = notesGraphe({ ...TOUT, courbeAuJour: false });
        expect(notes.map((n) => n.cle)).toEqual(['raccord']);
    });

    it('série impôt latent MASQUÉE : sa note se tait', () => {
        // Expliquer une courbe que l'utilisateur vient lui-même de masquer est du bruit.
        const notes = notesGraphe({ ...TOUT, impotLatentVisible: false });
        expect(notes.map((n) => n.cle)).toEqual(['methode', 'raccord']);
    });

    it('aucune marche au raccord : la note « Raccord » n’existe pas', () => {
        // ⚠️ Contrôle négatif : une mention permanente devient du décor qu'on cesse de lire
        // (`UN-AVERTISSEMENT-PERMANENT-EST-UN-AVERTISSEMENT-MORT`). La chaîne VIDE et la chaîne
        // BLANCHE doivent toutes deux se taire — le service rend `''`, mais un espace parasite
        // passerait un simple test de vérité.
        expect(notesGraphe({ ...TOUT, mentionAutoriteCourtier: '' }).map((n) => n.cle))
            .toEqual(['methode', 'impot-latent']);
        expect(notesGraphe({ ...TOUT, mentionAutoriteCourtier: '   ' }).map((n) => n.cle))
            .toEqual(['methode', 'impot-latent']);
    });

    it('rien à dire : le conteneur reste MONTÉ, mais invisible', () => {
        // ⚠️ `role="status"` sur un nœud inséré au moment où il doit parler rate la PREMIÈRE
        // transition — la seule qui compte. Or `mentionAutoriteCourtier` peut passer de vide à
        // non-vide EN COURS DE SESSION (synchro Fintable de fond)
        // (`UNE-REGION-LIVE-MONTEE-CONDITIONNELLEMENT-N-ANNONCE-PAS`).
        const { container } = render(<NotesGraphe notes={[]} />);
        const statut = container.querySelector('[role="status"]');
        expect(statut, 'la région live doit exister même sans note').toBeTruthy();
        expect(statut!.className).toContain('sr-only');
    });
});

describe('[FUTUR-NOTES-COMPACTES] le pavé ne revient pas', () => {
    it('la méthodologie n’est plus écrite dans le graphe', () => {
        // ⚠️ Source DÉCOMMENTÉE : l'en-tête du bloc RACONTE le pavé retiré, et une garde d'absence
        // lue sur la source brute rougirait sur sa propre documentation (`SCAN-QUI-MATCHE-LA-PROSE`).
        const src = sourceFutureProjection();
        for (const bout of ['survole pour la lire', 'percentiles mensuels', 'est échantillonné']) {
            expect(src, `« ${bout} » est revenu dans le graphe`).not.toContain(bout);
        }
        // Anti-vacuité : le composant de notes, LUI, est bien câblé — sans ça « la prose a disparu »
        // serait aussi vrai d'un écran qui n'explique plus rien du tout.
        expect(src).toContain('NotesGraphe');
        expect(src).toContain('impotLatentVisible');
    });

    it('les avertissements CONDITIONNELS, eux, sont restés', () => {
        // Marc n'en a biffé aucun — et pour cause : aucun n'était à l'écran, chacun ne parlant que
        // quand son défaut existe. Les emporter avec le pavé aurait été l'épuration qui prend trop
        // (`UNE-EPURATION-SE-JUGE-SUR-CE-QU-ELLE-NE-DOIT-PAS-EMPORTER`).
        const src = sourceFutureProjection();
        expect(src).toContain('undatedTotal');
        expect(src).toContain('truncatedFrom');
        expect(src).toContain('flowsAfterNowDate');
        expect(src).toContain('mentionRaccordJour');
    });
});
