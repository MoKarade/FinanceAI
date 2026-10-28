// tests/components/panneauJourLevier.test.tsx
//
// [DETTE-LEVIER-EXPLICITE] Le panneau du jour DIT pourquoi la dette monte.
//
// Marc, 2026-09-21 : « Je veux que ce soit explicite et expliqué ». Le graphe montre désormais DEUX
// courbes ; il fallait encore qu'en s'arrêtant sur un jour, il lise la cause en toutes lettres —
// sinon « la dette monte » reste une observation sans explication, et c'est ce qui l'a fait douter
// de ses propres chiffres.
//
// ⚠️ LA TENSION QUE CE FICHIER TIENT, et elle est réelle : `[FUTUR-INFOBULLE-EPUREE]` plafonne la
// PROSE VISIBLE de ce panneau à 45 caractères (Marc, 2026-08-17 : « quasiment pas de texte »).
// Une explication de 250 caractères ne peut donc pas être un nœud de texte visible. Le patron du
// dépôt — payé par le finding a11y #644 — est : libellé COURT visible, phrase entière dans le
// `title` (attribut, hors comptage) ET dans un jumeau `sr-only` (un `title` sur un `<span>` non
// focusable n'est lisible qu'à la SOURIS : ni clavier, ni lecteur d'écran).
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPanneauJour } from '../helpers/panneauJour';
import type { ProjectionChartPoint } from '../../services/projection/types';
import { phraseLevier, LIBELLE_LEVIER } from '../../components/future/detteSerie';

/**
 * Un jour PORTEUR de levier. ⚠️ `NetWorth` DOIT être inférieur à la somme des comptes : la ligne de
 * dette du panneau est DÉRIVÉE par soustraction (`Σ actifs − NetWorth`), jamais lue d'un champ —
 * sans écart, la ligne de dette ne s'affiche pas et la sous-ligne de levier non plus.
 */
const jour = (levier?: number): ProjectionChartPoint => ({
    monthIndex: 60, dateLabel: '10 août 2031', age: 45,
    Liquidites: 20_000, CELI: 90_000, REER: 210_000, NonReg: 180_000,
    NetWorth: 152_125, // 500 000 d'actifs − 347 875 de dette
    DettesNonImmo: 347_875,
    ...(levier === undefined ? {} : { DetteLevierSmith: levier }),
    isDailyPoint: true, dayIsReal: false,
} as unknown as ProjectionChartPoint);

const PLAFOND_PROSE = 45; // le même que `[FUTUR-INFOBULLE-EPUREE]`, re-lu ici et non recopié d'un œil

const noeudsDeTexte = (): string[] => {
    const out: string[] = [];
    const walk = (n: Node) => {
        if (n.nodeType === 3) {
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (t) out.push(t);
            return;
        }
        if (n.nodeType === 1 && (n as Element).classList?.contains('sr-only')) return;
        n.childNodes.forEach(walk);
    };
    walk(document.body);
    return out;
};

describe('[DETTE-LEVIER-EXPLICITE] le panneau du jour nomme la part levier', () => {
    it('un jour AVEC levier : la ligne apparaît, et elle dit « dont »', () => {
        renderPanneauJour(jour(347_875));
        expect(screen.getAllByText(LIBELLE_LEVIER).length).toBeGreaterThan(0);
        // Anti-vacuité : la ligne de dette QUI LA CONTIENT est bien là aussi — sans elle, la
        // sous-ligne parlerait d'un conteneur absent.
        expect(screen.getAllByText('Dettes (hors hypothèque)').length).toBeGreaterThan(0);
    });

    it('un jour SANS levier : aucune ligne (contrôle négatif)', () => {
        // ⚠️ Le contrôle qui compte : une ligne qui s'afficherait toujours serait du décor, et
        // affirmerait « levier » sur une dette ordinaire.
        renderPanneauJour(jour(undefined));
        expect(screen.queryByText(LIBELLE_LEVIER)).toBeNull();
    });

    it('un levier à ZÉRO ne parle pas non plus', () => {
        renderPanneauJour(jour(0));
        expect(screen.queryByText(LIBELLE_LEVIER)).toBeNull();
    });

    it('l’explication complète est accessible : `title` ET jumeau `sr-only`', () => {
        const { container } = renderPanneauJour(jour(347_875));
        const phrase = phraseLevier({ DetteLevierSmith: 347_875 })!;
        // ⚠️ Le `title` seul ne suffit PAS (finding a11y #644) : sur un `<span>` non focusable il
        // n'est révélé que par un survol SOURIS. Les deux, ou l'explication est perdue pour le
        // clavier et le lecteur d'écran — exactement les deux populations que Marc n'est pas, et
        // exactement pour ça qu'on ne s'en aperçoit jamais à l'usage.
        const porteur = container.querySelector(`[title="${phrase.replace(/"/g, '&quot;')}"]`);
        expect(porteur, 'aucun élément ne porte la phrase en `title`').toBeTruthy();
        expect(porteur!.querySelector('.sr-only')?.textContent).toContain(phrase);
    });

    it('la ligne visible RESPECTE le plafond de prose de 45 caractères', () => {
        // ⚠️ La garde `[FUTUR-INFOBULLE-EPUREE]` existe, mais SA fixture ne porte pas de levier :
        // elle ne pouvait donc rien dire de cette ligne. Une garde ne couvre que ce que sa fixture
        // rend non nul (`UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
        renderPanneauJour(jour(347_875));
        const trop = noeudsDeTexte().filter((t) => t.length > PLAFOND_PROSE);
        expect(trop, `prose trop longue rendue : ${JSON.stringify(trop)}`).toEqual([]);
        // Anti-vacuité : l'écran n'est pas vide, et la phrase LONGUE existe bien quelque part.
        expect(noeudsDeTexte().length).toBeGreaterThan(10);
        expect(phraseLevier({ DetteLevierSmith: 1 })!.length).toBeGreaterThan(PLAFOND_PROSE);
    });
});
