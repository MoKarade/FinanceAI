// components/settings/TestModePanel.tsx
//
// Sélecteur de « Mode Test » : charge un persona réaliste (cf services/
// testPersonas/) parmi plusieurs profils (seul/couple, fauché → riche, immigré,
// pré-retraite…). Les vraies données sont sauvegardées via realDataSnapshot du
// store et restaurées en sortie. Un banner orange permanent (Layout.tsx) +
// le nom du persona signalent le mode en continu.
//
// UX : EN mode test, changer le menu déroulant bascule le persona IMMÉDIATEMENT
// (sélection = application). HORS mode test, on exige le bouton « Activer » pour
// ne pas écraser les vraies données juste en parcourant la liste.

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useFinanceStore } from '../../store/useFinanceStore';
import { TEST_PERSONAS, getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';
import { showToast } from '../ui/Toast';

export const TestModePanel: React.FC = () => {
    const isTestMode = useFinanceStore((s) => s.isTestMode);
    const activeTestPersonaId = useFinanceStore((s) => s.activeTestPersonaId);
    const enableTestMode = useFinanceStore((s) => s.enableTestMode);
    const disableTestMode = useFinanceStore((s) => s.disableTestMode);

    const [selectedId, setSelectedId] = useState<string>(activeTestPersonaId ?? DEFAULT_PERSONA_ID);
    const [confirmDisable, setConfirmDisable] = useState(false);

    const selected = getPersonaOrDefault(selectedId);
    const active = isTestMode ? getPersonaOrDefault(activeTestPersonaId) : null;

    const applyPersona = (id: string) => {
        const persona = getPersonaOrDefault(id);
        setSelectedId(persona.id);
        enableTestMode(persona.build(), persona.id);
        showToast(`🧪 Persona « ${persona.label} » chargé. Tes vraies données sont sauvegardées.`, 'success');
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
        showToast('✅ Mode test désactivé — tes vraies données sont restaurées.', 'success');
    };

    return (
        <Card title={isTestMode ? '🧪 Mode test ACTIF' : '🧪 Mode test (dev)'}>
            <div className="space-y-3">
                {isTestMode && active ? (
                    <p className="text-body text-amber-300 leading-snug">
                        Persona actif : <strong>{active.emoji} {active.label}</strong> — {active.tagline}.
                        Choisis-en un autre dans la liste pour <strong>basculer instantanément</strong>.
                        Tes vraies données sont sauvegardées et seront restaurées à la sortie.
                    </p>
                ) : (
                    <p className="text-body text-ink-200 leading-snug">
                        Remplit l'app avec un persona réaliste Québec/Canada 2026 pour tester les flows
                        (projection, fiscalité, dettes, retraite…) sans saisie manuelle. Tes
                        <strong> vraies données ne sont pas perdues</strong> : sauvegardées en mémoire et
                        restaurées à la sortie. Un banner orange rappelle en continu le mode test.
                    </p>
                )}

                <label className="block">
                    <span className="text-meta font-medium text-ink-300">
                        {isTestMode ? 'Changer de persona' : 'Choisir un persona'}
                    </span>
                    <select
                        aria-label="Choisir un persona de test"
                        value={selectedId}
                        onChange={(e) => onSelectChange(e.target.value)}
                        className="mt-1 w-full bg-surfaceHighlight border border-white/10 rounded-md px-3 py-2 text-body text-ink-100 focus:outline-none focus:ring-2 focus:ring-warning-500"
                    >
                        {TEST_PERSONAS.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.emoji} {p.label} — {p.tagline}
                            </option>
                        ))}
                    </select>
                </label>

                <p className="text-meta text-ink-300 leading-snug">{selected.description}</p>

                <div className="flex flex-wrap gap-2 items-center">
                    {!isTestMode && (
                        <Button variant="primary" onClick={() => applyPersona(selectedId)}>
                            Activer le mode test
                        </Button>
                    )}
                    {isTestMode && (
                        !confirmDisable ? (
                            <Button variant="ghost" onClick={() => setConfirmDisable(true)}>
                                Désactiver le mode test
                            </Button>
                        ) : (
                            <div className="flex gap-2 items-center">
                                <span className="text-body text-ink-200">Restaurer tes vraies données ?</span>
                                <Button variant="primary" onClick={handleDisable}>Oui</Button>
                                <Button variant="ghost" onClick={() => setConfirmDisable(false)}>Annuler</Button>
                            </div>
                        )
                    )}
                </div>
            </div>
        </Card>
    );
};
