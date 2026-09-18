// components/projection/PanneauJour.tsx
// [FUTUR-PANNEAU-FIXE] Le panneau FIXE sous le graphe Futur — il remplace l'infobulle flottante.
//
// Demande de Marc (2026-09-18), en texte libre : « j'aimerais que ce soit un panneau fixe en
// dessous du graphe et pareil sur le téléphone mais je veux que ça reste lisible. Je veux pouvoir
// choisir le lendemain ou la veille ». Puis, en clic : colonnes sur PC / onglets sur téléphone ·
// le graphe garde sa taille (la page défile) · état initial sur AUJOURD'HUI · l'infobulle
// flottante DISPARAÎT.
//
// ⚠️ CE QUE CE PANNEAU RÈGLE, ET POURQUOI LE FLOTTANT NE POUVAIT PAS. Marc a coché les quatre
// irritants : elle disparaît quand il veut la lire · trop de choses à trier · les chiffres ne se
// recomposent pas · pénible sur téléphone. Le premier est STRUCTUREL à un objet qui suit le
// curseur : pour lire une infobulle, il faut bouger la souris vers elle, et la bouger la change.
// Un panneau dans le flux du document n'a pas ce problème — et l'épingle (clic) le garantit même
// pendant qu'on survole ailleurs.
//
// ⚠️ ET SURTOUT : AUCUNE SECTION N'EST SUPPRIMÉE. Interrogé sur ce qu'il regarde en premier, Marc
// a coché les QUATRE propositions. Le problème n'était donc pas le volume mais l'ORGANISATION —
// « épurer » aurait répondu à une question qu'il n'a pas posée, et retiré à chaque fois quelque
// chose que quelqu'un cherchait (`EPURATION-SUPPRIME-LA-RESERVE`).
import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { SubTabs, TabPanel } from '../ui/SubTabs';
import { useViewportBelowSm } from '../../hooks/useViewportBelowSm';
import { PANNEAU_SECTIONS, PANNEAU_SECTION_IDS, type SectionPanneauId } from '../future/panneauSections';
import { PAS_NAVIGATION, type PasNavigation } from '../future/panneauPas';
import { LIBELLE_ORIGINE, type OrigineJour } from '../future/jourAffiche';
import { SectionValeurNette, SectionFlux, SectionComptes, SectionMouvements, type PointJour } from './panneauJour/sections';

const ID_PREFIXE = 'futur-panneau';

interface PanneauJourProps {
    /** Le jour à décrire — `null` quand la courbe ne fournit aucun point exploitable. */
    data: PointJour | null;
    /** D'où vient ce jour : épinglé, survolé, ou l'ancre « aujourd'hui ». */
    origine: OrigineJour;
    userName1?: string;
    userName2?: string;
    /** Ouvre le panneau de détail exhaustif sur ce jour. */
    onOpenDetail: () => void;
    /** Déplace la sélection d'un pas dans la direction donnée. */
    onStep: (dir: -1 | 1, pas: PasNavigation) => void;
    /** Granularité des flèches. ⚠️ Elle vit chez le PARENT, pas ici : c'est lui qui calcule
     *  `canStepPrev`/`canStepNext`, et il ne peut pas le faire sans connaître le pas. Gardée en
     *  local, elle aurait donné des flèches actives qui ne mènent nulle part au bord de la série. */
    pas: PasNavigation;
    onPasChange: (pas: PasNavigation) => void;
    canStepPrev: boolean;
    canStepNext: boolean;
    /** Relâche l'épingle (retour à aujourd'hui) — absent quand rien n'est épinglé. */
    onRelease?: () => void;
    /** Posée par la machine d'état : focus à l'épingle, et « clic dedans = garder ». */
    panneauRef?: React.RefObject<HTMLDivElement | null>;
}

const RENDU_SECTION: Record<SectionPanneauId, (p: PanneauJourProps & { data: PointJour }) => React.ReactNode> = {
    valeur: ({ data }) => <SectionValeurNette data={data} />,
    flux: ({ data, userName1, userName2 }) => <SectionFlux data={data} userName1={userName1} userName2={userName2} />,
    comptes: ({ data }) => <SectionComptes data={data} />,
    mouvements: ({ data }) => <SectionMouvements data={data} />,
};

export const PanneauJour: React.FC<PanneauJourProps> = (props) => {
    const { data, origine, onOpenDetail, onStep, pas, onPasChange, canStepPrev, canStepNext, onRelease, panneauRef } = props;
    const estEtroit = useViewportBelowSm();
    const [ongletActif, setOngletActif] = useState<SectionPanneauId>(PANNEAU_SECTION_IDS[0]);
    const aidePas = PAS_NAVIGATION.find((p) => p.id === pas) ?? PAS_NAVIGATION[0];

    // ⚠️ `no-fake-data` : sans point exploitable, le panneau le DIT. Retomber sur le premier point
    // de la série afficherait les montants d'une date que personne n'a demandée.
    if (!data) {
        return (
            <div className="mt-3 rounded-card border border-white/10 bg-surface/40 px-3 py-4 text-center text-tiny text-ink-300">
                Aucun jour à décrire — la courbe ne fournit pas encore de point exploitable.
            </div>
        );
    }

    const barreNavigation = (
        <div className="flex flex-wrap items-center gap-2">
            {/* ⚠️ [a11y, WCAG 2.5.3 label-in-name] L'aria-label CONTIENT le texte visible
                (« Veille », « Lendemain ») : un aria-label de remplacement casserait la commande
                vocale — « clique Veille » ne trouverait aucun bouton de ce nom. */}
            <button
                type="button"
                onClick={() => onStep(-1, pas)}
                disabled={!canStepPrev}
                aria-label={`Veille — ${aidePas.aide}`}
                title={aidePas.aide}
                className="focus-ring inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-tiny font-bold text-white bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:pointer-events-none border border-white/20 rounded-lg px-3 py-2.5 transition-colors"
            >
                ← Veille
            </button>
            <button
                type="button"
                onClick={() => onStep(1, pas)}
                disabled={!canStepNext}
                aria-label={`Lendemain — ${aidePas.aide}`}
                title={aidePas.aide}
                className="focus-ring inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-tiny font-bold text-white bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:pointer-events-none border border-white/20 rounded-lg px-3 py-2.5 transition-colors"
            >
                Lendemain →
            </button>

            {/* Le PAS des flèches. Choix de Marc pour le téléphone, où viser un jour à la tape est
                impossible (≈ 0,7 px par mois à l'horizon par défaut) — mais utile partout : trois
                ans en arrière coûtent trois tapes au lieu de mille. */}
            <div role="group" aria-label="Pas des flèches" className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-black/30 border border-white/10">
                {PAS_NAVIGATION.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => onPasChange(p.id)}
                        aria-pressed={pas === p.id}
                        title={p.aide}
                        className={`touch-target inline-flex items-center justify-center px-2.5 py-1.5 text-tiny font-bold rounded transition-colors focus-ring ${pas === p.id ? 'bg-primary text-dark' : 'text-ink-300 hover:text-ink-50 hover:bg-white/10'}`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            <button
                type="button"
                onClick={onOpenDetail}
                className="focus-ring inline-flex items-center justify-center min-h-[44px] text-tiny font-bold text-primary bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-lg px-3 py-2.5 transition-colors"
            >
                Détail complet →
            </button>

            {/* ⚠️ Le retour à aujourd'hui n'existe QUE quand un jour est épinglé, et il est
                VISIBLE : « Échap » n'existe pas au doigt, et un état qui retire l'utilisateur
                d'« aujourd'hui » sans geste de retour est une trappe
                (`UN-ETAT-DE-FILTRAGE-SANS-CONTROLE-QUI-LE-RALLUME-EST-UNE-TRAPPE`). */}
            {origine === 'epingle' && onRelease && (
                <button
                    type="button"
                    onClick={onRelease}
                    className="focus-ring inline-flex items-center justify-center min-h-[44px] text-tiny font-bold text-ink-200 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-2.5 transition-colors"
                >
                    Revenir à aujourd’hui
                </button>
            )}
        </div>
    );

    const contenu = (id: SectionPanneauId) => RENDU_SECTION[id]({ ...props, data });

    // ⚠️ `data-jour-epingle` REMPLACE `data-frozen-tooltip`, et ce n'est pas un renommage. Le
    // panneau est TOUJOURS présent — c'est tout l'objet du lot —, donc sa présence ne dit plus
    // rien. Ce que l'e2e doit pouvoir observer, c'est « un jour est ÉPINGLÉ ». Sans ce marqueur,
    // les specs qui vérifiaient « clic → figé » chercheraient un nœud toujours là, et seraient
    // vertes pour la mauvaise raison.
    return (
        <div
            ref={panneauRef}
            tabIndex={-1}
            data-panneau-jour=""
            data-jour-epingle={origine === 'epingle' ? '' : undefined}
            aria-label="Détail du jour sélectionné sur la courbe"
            className="mt-3 rounded-card border border-white/10 bg-surface/40 p-3 focus-ring"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-body font-extrabold text-white tracking-tight">{data.dateLabel || 'N/A'}</span>
                    <span className="text-tiny font-bold text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full whitespace-nowrap">Âge {data.age || '??'}</span>
                </div>
                {/* ⚠️ L'ORIGINE est écrite, pas devinée : « aujourd'hui », « aperçu » et « épinglé »
                    se ressemblent à l'écran et ne veulent pas dire la même chose. Région live : le
                    conteneur reste monté et c'est son TEXTE qui change — monté à la demande, il
                    raterait la première annonce, la seule qui compte
                    (`UNE-REGION-LIVE-MONTEE-CONDITIONNELLEMENT-N-ANNONCE-PAS`). */}
                <p role="status" className="text-[10px] text-ink-400 m-0">{LIBELLE_ORIGINE[origine]}</p>
            </div>

            {barreNavigation}

            {estEtroit ? (
                <div className="mt-3 space-y-2">
                    <SubTabs<SectionPanneauId>
                        idPrefix={ID_PREFIXE}
                        label="Sections du jour"
                        tabs={PANNEAU_SECTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon }))}
                        active={ongletActif}
                        onSelect={setOngletActif}
                    />
                    {PANNEAU_SECTIONS.map((s) => (
                        <TabPanel key={s.id} idPrefix={ID_PREFIXE} tab={s.id} when={ongletActif === s.id} className="focus-ring rounded-card">
                            {contenu(s.id)}
                        </TabPanel>
                    ))}
                </div>
            ) : (
                /* ⚠️ Les quatre colonnes viennent de `PANNEAU_SECTIONS`, la MÊME liste que les
                   onglets ci-dessus : deux listes écrites séparément divergeraient au premier lot
                   qui touche l'une, et l'utilisateur de téléphone verrait un autre ordre sans que
                   rien ne rougisse. */
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {PANNEAU_SECTIONS.map((s) => (
                        <section key={s.id} aria-label={s.label} className="min-w-0">
                            {/* ⚠️ `h3` et non `h4` : la carte qui enveloppe le graphe rend un `h2`, donc un `h4` sauterait
                                un niveau — un lecteur d'écran annonce alors une sous-section fantôme. */}
                            <h3 className="flex items-center gap-1.5 text-tiny uppercase tracking-widest text-ink-300 font-bold mb-1.5" title={s.aide}>
                                <Icon name={s.icon} size={13} />{s.label}
                            </h3>
                            {contenu(s.id)}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};
