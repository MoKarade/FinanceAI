// components/settings/TestModePanel.tsx
//
// Sélecteur de « Mode Test » : charge un persona réaliste (cf services/
// testPersonas/) parmi plusieurs profils (seul/couple, fauché → riche, immigré,
// pré-retraite…). Les vraies données sont sauvegardées via realDataSnapshot du
// store et restaurées en sortie. Un banner orange permanent (Layout.tsx) +
// le nom du persona signalent le mode en continu.

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
    const isActivePersona = isTestMode && active?.id === selectedId;

    const loadPersona = () => {
        enableTestMode(selected.build(), selected.id);
        showToast(`🧪 Persona « ${selected.label} » chargé. Tes vraies données sont sauvegardées.`, 'success');
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
                    <p className="text-sm text-amber-300 leading-snug">
                        Persona actif : <strong>{active.emoji} {active.label}</strong> — {active.tagline}.
                        Tes <strong>vraies données sont sauvegardées</strong> et seront restaurées dès que
                        tu désactives le mode.
                    </p>
                ) : (
                    <p className="text-sm text-gray-300 leading-snug">
                        Remplit l'app avec un persona réaliste Québec/Canada 2026 pour tester les flows
                        (projection, fiscalité, dettes, retraite…) sans saisie manuelle. Tes
                        <strong> vraies données ne sont pas perdues</strong> : sauvegardées en mémoire et
                        restaurées à la sortie. Un banner orange rappelle en continu le mode test.
                    </p>
                )}

                <label className="block">
                    <span className="text-xs font-medium text-gray-400">Choisir un persona</span>
                    <select
                        value={selectedId}
                        onChange={(e) => setSelectedId(e.target.value)}
                        className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                        {TEST_PERSONAS.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.emoji} {p.label} — {p.tagline}
                            </option>
                        ))}
                    </select>
                </label>

                <p className="text-xs text-gray-400 leading-snug">{selected.description}</p>

                <div className="flex flex-wrap gap-2 items-center">
                    <Button variant="primary" onClick={loadPersona} disabled={isActivePersona}>
                        {!isTestMode
                            ? 'Activer le mode test'
                            : isActivePersona
                                ? 'Persona déjà chargé'
                                : 'Charger ce persona'}
                    </Button>
                    {isTestMode && (
                        !confirmDisable ? (
                            <Button variant="ghost" onClick={() => setConfirmDisable(true)}>
                                Désactiver le mode test
                            </Button>
                        ) : (
                            <div className="flex gap-2 items-center">
                                <span className="text-sm text-gray-300">Restaurer tes vraies données ?</span>
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
