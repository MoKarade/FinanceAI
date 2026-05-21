// components/settings/TestModePanel.tsx
//
// Bouton pour activer/désactiver le "Mode Test" qui remplit l'app avec des
// fixtures réalistes (cf services/testFixtures.ts). Les vraies données sont
// sauvegardées via realDataSnapshot du store et restaurées au sortir du mode.
//
// Un banner orange permanent en haut de l'app (Layout.tsx) signale le mode
// pour éviter qu'on ne croie tester sur les vraies données.

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useFinanceStore } from '../../store/useFinanceStore';
import { buildTestFixtures } from '../../services/testFixtures';
import { showToast } from '../ui/Toast';

export const TestModePanel: React.FC = () => {
    const isTestMode = useFinanceStore(s => s.isTestMode);
    const enableTestMode = useFinanceStore(s => s.enableTestMode);
    const disableTestMode = useFinanceStore(s => s.disableTestMode);
    const [confirmEnable, setConfirmEnable] = useState(false);
    const [confirmDisable, setConfirmDisable] = useState(false);

    const handleEnable = () => {
        const fixtures = buildTestFixtures();
        enableTestMode(fixtures);
        setConfirmEnable(false);
        showToast('🧪 Mode test activé — fixtures chargées. Tes vraies données sont sauvegardées.', 'success');
    };

    const handleDisable = () => {
        disableTestMode();
        setConfirmDisable(false);
        showToast('✅ Mode test désactivé — tes vraies données sont restaurées.', 'success');
    };

    if (isTestMode) {
        return (
            <Card title="🧪 Mode test ACTIF">
                <div className="space-y-3">
                    <p className="text-sm text-amber-300 leading-snug">
                        L'app affiche actuellement des <strong>données fictives</strong> (couple Alex+Sam, ~60
                        transactions, 5 actifs, 1 maison, 1 enfant). Tes vraies données sont sauvegardées
                        en mémoire et seront restaurées dès que tu désactiveras le mode.
                    </p>
                    <p className="text-xs text-gray-400">
                        💡 Utilisé pour tester rapidement les flows (projection, catégorisation IA, PDF,
                        backup chiffré) sans saisir manuellement.
                    </p>
                    {!confirmDisable ? (
                        <Button variant="primary" onClick={() => setConfirmDisable(true)}>
                            Désactiver le mode test
                        </Button>
                    ) : (
                        <div className="flex gap-2 items-center">
                            <span className="text-sm text-gray-300">Confirmer la sortie du mode test ?</span>
                            <Button variant="primary" onClick={handleDisable}>
                                Oui, restaurer mes données
                            </Button>
                            <Button variant="ghost" onClick={() => setConfirmDisable(false)}>
                                Annuler
                            </Button>
                        </div>
                    )}
                </div>
            </Card>
        );
    }

    return (
        <Card title="🧪 Mode test (dev)">
            <div className="space-y-3">
                <p className="text-sm text-gray-300 leading-snug">
                    Remplit l'app avec des fixtures réalistes Québec/Canada 2026 (couple fictif, ~60
                    transactions, actifs CELI/REER/NonReg/Crypto, hypothèque, enfant, voyages, dette).
                    Pratique pour tester sans avoir à saisir manuellement.
                </p>
                <p className="text-xs text-gray-400 leading-snug">
                    🔒 Tes <strong>vraies données ne sont pas perdues</strong>. Elles sont sauvegardées
                    en mémoire et restaurées dès que tu désactives le mode. Un banner orange en haut de
                    l'écran rappellera en permanence que tu es en mode test.
                </p>
                {!confirmEnable ? (
                    <Button variant="ghost" onClick={() => setConfirmEnable(true)}>
                        Activer le mode test
                    </Button>
                ) : (
                    <div className="flex gap-2 items-center">
                        <span className="text-sm text-gray-300">Confirmer l'activation ?</span>
                        <Button variant="primary" onClick={handleEnable}>
                            Oui, charger les fixtures
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmEnable(false)}>
                            Annuler
                        </Button>
                    </div>
                )}
            </div>
        </Card>
    );
};
