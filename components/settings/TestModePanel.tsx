// components/settings/TestModePanel.tsx
//
// Sélecteur de « Mode Test » : charge un persona réaliste (cf services/
// testPersonas/) parmi plusieurs profils (seul/couple, fauché → riche, immigré,
// pré-retraite…). Les vraies données sont sauvegardées via realDataSnapshot du
// store et restaurées en sortie. Un banner orange permanent (Layout.tsx) +
// le nom du persona signalent le mode en continu.
//
// UX : cliquer un persona l'APPLIQUE immédiatement, en mode test ou non (active le mode
// test au besoin — régression signalée 2× par Marc). Les vraies données sont sauvegardées
// avant et restaurées à la sortie : rien n'est écrasé. Le bouton « Activer » charge le
// persona par défaut.

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { useFinanceStore } from '../../store/useFinanceStore';
import { TEST_PERSONAS, getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';
import { showToast } from '../ui/Toast';

/** `compact` : variante mobile (maquette M-reglages) — persona actif seul, liste repliée. */
export const TestModePanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const isTestMode = useFinanceStore((s) => s.isTestMode);
    const activeTestPersonaId = useFinanceStore((s) => s.activeTestPersonaId);
    const enableTestMode = useFinanceStore((s) => s.enableTestMode);
    const disableTestMode = useFinanceStore((s) => s.disableTestMode);

    const [selectedId, setSelectedId] = useState<string>(activeTestPersonaId ?? DEFAULT_PERSONA_ID);
    const [confirmDisable, setConfirmDisable] = useState(false);
    const [listeOuverte, setListeOuverte] = useState(false);

    const selected = getPersonaOrDefault(selectedId);
    const active = isTestMode ? getPersonaOrDefault(activeTestPersonaId) : null;

    const applyPersona = (id: string) => {
        const persona = getPersonaOrDefault(id);
        setSelectedId(persona.id);
        enableTestMode(persona.build(), persona.id);
        showToast(`Persona « ${persona.label} » chargé. Tes vraies données sont sauvegardées.`, 'success');
    };

    // Choisir un persona dans la liste l'APPLIQUE toujours, qu'on soit déjà en
    // mode test ou non (active le mode test au besoin). L'utilisateur s'attend à
    // « choisir = charger » : sans ça, sélectionner « Léa » (seule) laissait le
    // persona précédent (couple) actif → 2 salaires affichés à tort.
    const onSelectChange = (id: string) => {
        applyPersona(id);
    };

    const handleDisable = () => {
        disableTestMode();
        setConfirmDisable(false);
        showToast('Mode test désactivé — tes vraies données sont restaurées.', 'success');
    };

    const personaBouton = (p: (typeof TEST_PERSONAS)[number]) => {
        const coche = (isTestMode ? active?.id : selectedId) === p.id;
        return (
            <button
                key={p.id}
                type="button"
                aria-pressed={coche}
                onClick={() => onSelectChange(p.id)}
                className={`min-h-11 px-3 py-2 rounded-[10px] border text-left flex flex-col gap-0.5 transition-colors focus-ring ${
                    coche ? 'border-warning-400 bg-warning-500/12' : 'border-white/8 hover:bg-white/5'
                }`}
            >
                <span className="text-[13px] font-semibold text-ink-100">{p.label}</span>
                <span className="text-meta text-ink-400">{p.tagline}</span>
            </button>
        );
    };

    // Boutons (aria-pressed) et non radios : un clic CHARGE le persona, alors qu'un radiogroup se
    // parcourt aux flèches — chaque flèche rechargerait un persona entier. Tab + Entrée suffisent.
    const listePersonas = (
        <div id="mode-test-liste" role="group" aria-labelledby="mode-test-personas" className="flex flex-col gap-1.5">
            {TEST_PERSONAS.map(personaBouton)}
        </div>
    );

    const desactivation = !confirmDisable ? (
        <button type="button" onClick={() => setConfirmDisable(true)} className={`${compact ? 'flex-1' : ''} h-10 px-3 rounded-lg border border-warning-400/50 text-body font-semibold text-warning-400 hover:bg-warning-500/10 transition-colors focus-ring`}>
            {compact ? 'Désactiver' : 'Désactiver le mode test'}
        </button>
    ) : (
        <div className="flex flex-wrap gap-2 items-center">
            <span className="text-body text-ink-200">Restaurer tes vraies données ?</span>
            <Button variant="primary" onClick={handleDisable}>Oui</Button>
            <Button variant="ghost" onClick={() => setConfirmDisable(false)}>Annuler</Button>
        </div>
    );

    // [S5-REFONTE-REGLAGES] Carte des maquettes : teinte ambre quand le mode est actif (un clic sur un
    // persona le charge tout de suite, cf. onSelectChange).
    // - Bureau : description, liste complète des personas, bouton de sortie.
    // - Mobile (`compact`, maquette M-reglages) : persona actif seul ; « Changer de persona » déplie la liste.
    return (
        <section
            aria-labelledby="mode-test-titre"
            className={`rounded-2xl p-4 sm:p-5 flex flex-col gap-3 border ${isTestMode ? 'bg-warning-500/6 border-warning-500/30' : 'premium-card'}`}
        >
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="mode-test-titre" className={`text-[16px] font-semibold ${isTestMode ? 'text-warning-400' : 'text-ink-50'}`}>
                    {isTestMode ? 'Mode test actif' : 'Mode test (dev)'}
                </h2>
                <span id="mode-test-personas" className="text-meta text-ink-400 shrink-0">
                    {compact ? `${TEST_PERSONAS.length} personas` : isTestMode ? 'Changer de persona' : 'Choisir un persona'}
                </span>
            </div>

            {compact ? (
                <>
                    {!listeOuverte && isTestMode && active && (
                        <div className="px-3 py-2 rounded-[10px] border border-warning-400 bg-warning-500/12 flex flex-col gap-0.5">
                            <span className="text-[13px] font-semibold text-ink-100">{active.label}</span>
                            <span className="text-meta text-ink-400">{active.tagline}</span>
                        </div>
                    )}
                    {listeOuverte && listePersonas}
                    <p className="text-meta leading-5 text-ink-400">
                        {isTestMode ? 'Tes vraies données sont sauvegardées et seront restaurées à la sortie.' : 'Un persona réaliste remplit l\'app ; tes vraies données sont sauvegardées et restaurées à la sortie.'}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setListeOuverte((v) => !v)}
                            aria-expanded={listeOuverte}
                            aria-controls="mode-test-liste"
                            className="flex-1 h-10 px-3 rounded-lg border border-white/15 text-body text-ink-100 hover:bg-white/5 transition-colors focus-ring"
                        >
                            {isTestMode ? 'Changer de persona' : 'Choisir un persona'}
                        </button>
                        {isTestMode ? (confirmDisable ? null : desactivation) : (
                            <Button variant="primary" className="flex-1" onClick={() => applyPersona(selectedId)}>Activer le mode test</Button>
                        )}
                    </div>
                    {isTestMode && confirmDisable && desactivation}
                </>
            ) : (
                <>
                    {isTestMode && active ? (
                        <>
                            <p className="text-[13px] leading-5 text-ink-200">{active.description}</p>
                            <p className="text-meta leading-5 text-ink-400">Tes vraies données sont sauvegardées et seront restaurées à la sortie.</p>
                        </>
                    ) : (
                        <p className="text-[13px] leading-5 text-ink-300">
                            Remplit l'app avec un persona réaliste Québec/Canada 2026 pour tester les parcours (projection,
                            fiscalité, dettes, retraite…) sans saisie. Tes <strong className="text-ink-100">vraies données ne sont pas perdues</strong> :
                            sauvegardées et restaurées à la sortie. Un bandeau orange rappelle le mode test.
                        </p>
                    )}
                    {listePersonas}
                    {!isTestMode && <p className="text-meta text-ink-400 leading-snug">{selected.description}</p>}
                    {!isTestMode && (
                        <Button variant="primary" onClick={() => applyPersona(selectedId)}>
                            Activer le mode test
                        </Button>
                    )}
                    {isTestMode && desactivation}
                </>
            )}
        </section>
    );
};
