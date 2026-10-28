// hooks/useSelectionJour.ts
// [FUTUR-PANNEAU-FIXE] Machine d'état de la SÉLECTION d'un jour sur le graphe Futur.
//
//   repos ──survol──▶ aperçu ──clic──▶ épinglé
//     ▲                 │                 │
//     └──sortie graphe──┘                 │
//     └────────Échap / clic-dehors────────┘
//
// ⚠️ CE MODULE REMPLACE `useChartTooltipPosition`, ET LA MOITIÉ QUI DISPARAÎT EST LE
// POSITIONNEMENT. L'ancien hook faisait DEUX choses : cette machine d'état, et le calcul de la
// position d'une infobulle FLOTTANTE (bornage au viewport, mesure de hauteur, mutation directe de
// `left`/`top` à 60 fps, ancrage en « bottom sheet » sur téléphone). Le panneau, lui, vit dans le
// FLUX du document sous le graphe : il n'a ni position à calculer, ni bord d'écran à éviter, ni
// remontage au basculement d'orientation. Garder ce code aurait laissé un système complet sans
// aucun consommateur — du code mort qui, en plus, DÉCRIT un comportement que l'app n'a plus.
//
// ⚠️ CE QUI EST GARDÉ TEL QUEL, et c'est le cœur : « survol = aperçu, clic = ÉPINGLE » est le choix
// de Marc (2026-09-18) et la réponse à son irritant n°1 — « elle disparaît / bouge quand je veux la
// lire ». En mode épinglé le survol est IGNORÉ : on peut descendre la souris dans le panneau, le
// lire, cliquer dedans, sans que le jour change sous les doigts.
import { useCallback, useEffect, useRef, useState } from 'react';

export type ModeSelectionJour = 'idle' | 'hovering' | 'frozen';

interface OptionsSelectionJour<P> {
    /** Clé d'identité d'un point (ex. `monthIndex`) → déduplique les re-rendus au survol. */
    getKey: (point: P) => string | number;
    /** Conteneur du graphe : un clic dedans re-sélectionne (il n'annule pas), et il reçoit le focus
     *  quand on relâche l'épingle. Il doit donc être focalisable (`tabIndex={-1}`). */
    containerRef: React.RefObject<HTMLElement | null>;
}

export interface SelectionJour<P> {
    mode: ModeSelectionJour;
    /** Le point survolé (mode `hovering`) ou épinglé (mode `frozen`) — `null` au repos. */
    point: P | null;
    /** À poser sur le PANNEAU : un clic dedans ne désépingle pas, et il reçoit le focus à l'épingle. */
    panneauRef: React.RefObject<HTMLDivElement | null>;
    /** Recharts a rapporté le point survolé. */
    onHoverPoint: (point: P) => void;
    /** Le curseur a quitté la zone tracée. */
    onChartLeave: () => void;
    /**
     * Clic sur le graphe → épingle le point donné (repli : le point courant).
     *
     * ⚠️ `parClavier` n'est pas un détail de confort : il décide si le panneau est AMENÉ à l'écran.
     * Voir le commentaire de l'effet de focus plus bas — les deux modalités ont des besoins
     * OPPOSÉS, et les servir pareil sacrifie forcément l'une des deux.
     */
    freezeOn: (point: P | null, opts?: { parClavier?: boolean }) => void;
    /** Relâche l'épingle (retour au repos, donc à l'ancre « aujourd'hui »). */
    release: () => void;
}

export function useSelectionJour<P>({ getKey, containerRef }: OptionsSelectionJour<P>): SelectionJour<P> {
    const [mode, setMode] = useState<ModeSelectionJour>('idle');
    const [point, setPoint] = useState<P | null>(null);

    const panneauRef = useRef<HTMLDivElement | null>(null);

    // Miroirs synchrones : les callbacks restent stables tout en lisant l'état courant.
    const modeRef = useRef<ModeSelectionJour>(mode);
    modeRef.current = mode;
    const pointRef = useRef<P | null>(point);
    pointRef.current = point;

    const onHoverPoint = useCallback((next: P) => {
        if (modeRef.current === 'frozen') return; // épinglé : le survol est ignoré
        setPoint((prev) => (prev !== null && getKey(prev) === getKey(next) ? prev : next));
        setMode((m) => (m === 'hovering' ? m : 'hovering'));
    }, [getKey]);

    const onChartLeave = useCallback(() => {
        if (modeRef.current !== 'hovering') return; // épinglé : on garde le jour
        setMode('idle');
        setPoint(null);
    }, []);

    // Mémorise la MODALITÉ de la dernière épingle — lue par l'effet de focus, qui ne peut pas la
    // deviner autrement (un `focus()` ne sait pas d'où vient le geste qui l'a déclenché).
    const parClavierRef = useRef(false);
    const freezeOn = useCallback((next: P | null, opts?: { parClavier?: boolean }) => {
        const cible = next ?? pointRef.current;
        if (cible === null) return; // rien à épingler
        parClavierRef.current = opts?.parClavier === true;
        setPoint(cible);
        setMode('frozen');
    }, []);

    const release = useCallback(() => {
        setMode('idle');
        setPoint(null);
    }, []);

    // a11y : à l'épingle, le panneau prend le focus (c'est lui qui vient de devenir interactif —
    // Veille / Lendemain / Détail complet) ; au relâchement, le focus revient au graphe.
    //
    // ⚠️⚠️ `preventScroll` DÉPEND DE LA MODALITÉ, et c'est une correction : les deux besoins sont
    // OPPOSÉS, donc les servir pareil sacrifie forcément l'un des deux.
    //   • À la SOURIS, l'utilisateur regarde la courbe qu'il vient de cliquer. Faire défiler la page
    //     vers le panneau la lui ferait perdre de vue — d'où `preventScroll`.
    //   • Au CLAVIER (Entrée ou flèches sur le graphe), le panneau est le seul endroit où quelque
    //     chose s'est passé, et il peut être HORS ÉCRAN — le graphe fait de 380 à 650 px de haut.
    //     `preventScroll` y posait le focus sans rien amener à l'écran : le lecteur d'écran suivait,
    //     l'utilisateur clavier VOYANT se retrouvait à taper dans un panneau qu'il ne voit pas
    //     (WCAG 2.4.7). Il faut donc laisser le navigateur faire défiler.
    // Trouvé par l'audit d'accessibilité du lot, et aucune fixture ne pouvait le voir : jsdom ne
    // fait pas de mise en page, donc « hors écran » n'y existe pas.
    const modePrecedentRef = useRef<ModeSelectionJour>(mode);
    useEffect(() => {
        const prec = modePrecedentRef.current;
        if (mode === 'frozen' && prec !== 'frozen') {
            panneauRef.current?.focus?.({ preventScroll: !parClavierRef.current });
        } else if (prec === 'frozen' && mode !== 'frozen') {
            // Au relâchement, le focus revient au graphe. Même règle : au clavier on le ramène à
            // l'écran, à la souris il y est déjà.
            containerRef.current?.focus?.({ preventScroll: !parClavierRef.current });
        }
        modePrecedentRef.current = mode;
    }, [mode, containerRef]);

    // Échap et clic-dehors — montés UNIQUEMENT en épinglé.
    //
    // ⚠️ Ils RELÂCHENT, ils ne ferment rien : le panneau reste à l'écran et retombe sur
    // aujourd'hui. C'est la différence avec l'infobulle, qui disparaissait. Un panneau qui se
    // viderait sur Échap serait un écran qui perd son contenu sans qu'on ait rien demandé.
    useEffect(() => {
        if (mode !== 'frozen') return;
        const surTouche = (e: KeyboardEvent) => {
            if (e.key === 'Escape') release();
        };
        const surPointeur = (e: PointerEvent) => {
            const cible = e.target as Node | null;
            const panneau = panneauRef.current;
            const conteneur = containerRef.current;
            if (panneau && cible && panneau.contains(cible)) return;   // clic DANS le panneau = garder
            if (conteneur && cible && conteneur.contains(cible)) return; // clic sur le graphe = re-épingle
            release();
        };
        document.addEventListener('keydown', surTouche);
        document.addEventListener('pointerdown', surPointeur, true); // capture : précède les handlers React
        return () => {
            document.removeEventListener('keydown', surTouche);
            document.removeEventListener('pointerdown', surPointeur, true);
        };
    }, [mode, release, containerRef]);

    return { mode, point, panneauRef, onHoverPoint, onChartLeave, freezeOn, release };
}
