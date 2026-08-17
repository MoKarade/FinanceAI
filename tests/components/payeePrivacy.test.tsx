/**
 * [PRIV-PAYEE-MODE-DISCRET] Le NOM DU MARCHAND est masqué en mode discret.
 *
 * Décision Marc (2026-08-17) : « masquer marchands ».
 *
 * ⚠️ POURQUOI CE LOT EXISTE. L'audit `A11Y-PRIVACY` du 2026-08-12 a fermé les fuites de MONTANTS —
 * son périmètre déclaré n'a jamais couvert le marchand. Or « pharmacie X, le 3 » dit déjà beaucoup
 * sans le moindre chiffre à côté : santé, convictions, habitudes. C'est de la donnée personnelle au
 * sens de la Loi 25, et le mode discret sert précisément à montrer son écran à quelqu'un.
 *
 * ⚠️ CE QUE LA GARDE VÉRIFIE, ET POURQUOI ELLE LIT `innerHTML`. Une valeur sensible ne fuit pas
 * seulement par le texte : elle fuit par un ATTRIBUT (`title`, `aria-label`) — classe de piège
 * maison, déjà payée sur les montants. Chercher la chaîne dans `document.body.innerHTML` couvre les
 * deux d'un coup, là où un `queryByText` ne verrait que le texte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { ExpertTooltip } from '../../components/projection/ProjectionTooltip';
import { PrivateText } from '../../components/ui/PrivateText';
import { maskPayee, rowControlLabel, MASKED_PAYEE_LABEL } from '../../utils/privacyAria';
import type { ProjectionChartPoint } from '../../services/projection/types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

/** Chaîne volontairement improbable : si elle apparaît quelque part, c'est une VRAIE fuite. */
const MARCHAND = 'PHARMA-CONFIDENTIEL-ZQX';

const privacy = (actif: boolean) => useFinanceStore.setState({ isPrivacyMode: actif } as never);

beforeEach(() => privacy(false));

describe('[PRIV-PAYEE-MODE-DISCRET] la primitive PrivateText', () => {
    it('mode discret : la valeur n’est PLUS DANS LE DOM (pas seulement floutée)', () => {
        privacy(true);
        const { container } = render(<PrivateText>{MARCHAND}</PrivateText>);
        // ⚠️ Même contrat que `PrivateAmount` : un flou CSS laisserait la chaîne copiable,
        // inspectable, et lisible par un lecteur d'écran. On ne la rend pas du tout.
        expect(container.innerHTML).not.toContain(MARCHAND);
        expect(container.textContent).toContain('•••');
        expect(container.textContent).toContain(MASKED_PAYEE_LABEL);
    });

    it('hors mode discret : la valeur est rendue telle quelle', () => {
        // Anti-sur-correctif : masquer en permanence rendrait l'app inutilisable.
        const { container } = render(<PrivateText>{MARCHAND}</PrivateText>);
        expect(container.textContent).toContain(MARCHAND);
        expect(container.textContent).not.toContain('•••');
    });
});

describe('[PRIV-PAYEE-MODE-DISCRET] les helpers d’ATTRIBUT', () => {
    it('`maskPayee` remplace le marchand dans un title / aria-label', () => {
        expect(maskPayee(MARCHAND, true)).toBe(MASKED_PAYEE_LABEL);
        expect(maskPayee(MARCHAND, false)).toBe(MARCHAND);
    });

    /**
     * ⚠️ LE piège du masquage naïf, et la raison d'être de `rowControlLabel`. Remplacer le marchand
     * par le même libellé dans CHAQUE `aria-label` donnerait à toutes les cases à cocher le MÊME
     * nom accessible : le masquage détruirait la navigation au lecteur d'écran. On bascule sur la
     * DATE, qui discrimine sans rien révéler de sensible.
     */
    it('`rowControlLabel` garde des noms DISTINCTS en mode discret', () => {
        const a = rowControlLabel('Sélectionner', MARCHAND, '2026-06-18', 1, true);
        const b = rowControlLabel('Sélectionner', 'AUTRE-MARCHAND', '2026-06-19', 2, true);
        expect(a).not.toContain(MARCHAND);
        expect(a).not.toBe(b);
        expect(a).toContain('2026-06-18');
    });

    /**
     * ⚠️ LE TEST QUI MANQUAIT, et c'est celui qui comptait. La version d'avant comparait deux
     * transactions à des dates DIFFÉRENTES : elle prouvait l'évidence et laissait passer le cas
     * COURANT — plusieurs transactions le MÊME JOUR, qui recevaient toutes le nom accessible
     * « Sélectionner la transaction du 2026-06-18 ». Deux agents l'ont mesuré indépendamment.
     * Le masquage échangeait alors une fuite de vie privée contre un trou WCAG 4.1.2.
     */
    it('MÊME JOUR : les noms restent distincts (c’est le cas courant, pas le cas rare)', () => {
        const a = rowControlLabel('Sélectionner', MARCHAND, '2026-06-18', 1, true);
        const b = rowControlLabel('Sélectionner', 'AUTRE-MARCHAND', '2026-06-18', 2, true);
        expect(a).not.toBe(b);
        // Le discriminant est l'`id` : opaque, jamais affiché ailleurs, il ne révèle rien.
        expect(a).not.toContain(MARCHAND);
        expect(b).not.toContain('AUTRE-MARCHAND');
    });

    it('hors mode discret, le libellé nomme bien le marchand', () => {
        expect(rowControlLabel('Sélectionner', MARCHAND, '2026-06-18', 1, false)).toContain(MARCHAND);
    });
});

describe('[PRIV-PAYEE-MODE-DISCRET] l’infobulle du jour ne laisse rien filtrer', () => {
    const jour = () => ({
        monthIndex: 12, dateLabel: '18 juin 2026', age: 41, NetWorth: 223_110, diffNW: 4_648,
        isDailyPoint: true, dayIsReal: true, dayIsDated: true,
        dayMovements: [{ payee: MARCHAND, amount: -13 }],
        dayMovementsTotal: 1,
    } as unknown as ProjectionChartPoint);

    it('mode discret : le marchand n’est ni dans le texte ni dans un attribut', () => {
        privacy(true);
        render(<ExpertTooltip data={jour()} />);
        // `innerHTML` : couvre le texte ET les attributs (title, aria-label) d'un seul coup.
        expect(document.body.innerHTML).not.toContain(MARCHAND);
    });

    it('hors mode discret : le marchand est bien lisible', () => {
        render(<ExpertTooltip data={jour()} />);
        expect(document.body.textContent).toContain(MARCHAND);
    });

    /**
     * ⚠️ LA FUITE QUE MA FIXTURE RENDAIT INVISIBLE. Le test ci-dessus pose TOUJOURS `dayMovements`,
     * donc n'atteint jamais le REPLI — et c'est le repli qui fuyait. `dayMovements` n'existe que
     * sur un jour PASSÉ reconstruit ; un jour FUTUR portant une charge récurrente passe forcément
     * par `dayLabels`, dont le contenu est `r.payee` (`datedMonthEvents.ts`), soit un vrai nom de
     * marchand. Le chemin heureux était masqué, le repli non.
     * Leçon : une fixture qui remplit tous les champs teste le cas nominal et RIEN d'autre.
     */
    const jourFutur = () => ({
        monthIndex: 30, dateLabel: '18 déc. 2028', age: 43, NetWorth: 400_000,
        isDailyPoint: true, dayIsDated: true, dayLabels: [MARCHAND],
        // ⚠️ Volontairement ABSENTS — c'est ce qui force le repli.
    } as unknown as ProjectionChartPoint);

    it('jour FUTUR (repli sur `dayLabels`) : le marchand est masqué aussi', () => {
        privacy(true);
        render(<ExpertTooltip data={jourFutur()} />);
        expect(document.body.innerHTML).not.toContain(MARCHAND);
    });

    it('jour FUTUR hors mode discret : le libellé reste lisible', () => {
        render(<ExpertTooltip data={jourFutur()} />);
        expect(document.body.textContent).toContain(MARCHAND);
    });
});
