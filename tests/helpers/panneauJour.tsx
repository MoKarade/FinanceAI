// tests/helpers/panneauJour.tsx
// [FUTUR-PANNEAU-FIXE] Monte le panneau du jour avec des props par défaut inoffensives.
//
// ⚠️ POURQUOI UN HELPER PARTAGÉ, et pourquoi ICI. Quatre fichiers de test montaient l'ancienne
// infobulle avec un seul prop (`data`) ; le panneau en prend dix, dont la moitié n'intéresse aucun
// d'eux (pas de navigation, callbacks). Recopier ce littéral quatre fois aurait été exactement la
// duplication que le contrôle de qualité de la CI a refusée la veille sur ce même lot — et la
// leçon `UN-CONTROLE-DE-DUPLICATION-EST-UNE-GARDE-CONTRE-LA-DUPLICATION-DE-GARDES` dit où le
// mettre : `tests/helpers/`, l'endroit qu'on doit regarder AVANT d'écrire une garde.
//
// ⚠️ Les défauts sont choisis pour ne RIEN affirmer : `origine: 'epingle'` (l'état où tout est
// visible, donc celui qui ne masque aucune section au test), flèches activées, callbacks vides.
// Un test qui veut mesurer un de ces états le passe EXPLICITEMENT — le défaut ne doit jamais être
// ce qu'on prétend vérifier.
import React from 'react';
import { render } from '@testing-library/react';
import { PanneauJour } from '../../components/projection/PanneauJour';
import type { PointJour } from '../../components/projection/panneauJour/sections';
import type { OrigineJour } from '../../components/future/jourAffiche';
import type { PasNavigation } from '../../components/future/panneauPas';

export interface OptionsPanneauJour {
    origine?: OrigineJour;
    userName1?: string;
    userName2?: string;
    onOpenDetail?: () => void;
    onStep?: (dir: -1 | 1, pas: PasNavigation) => void;
    pas?: PasNavigation;
    onPasChange?: (pas: PasNavigation) => void;
    canStepPrev?: boolean;
    canStepNext?: boolean;
    onRelease?: () => void;
}

export function renderPanneauJour(data: PointJour | null, o: OptionsPanneauJour = {}) {
    return render(
        <PanneauJour
            data={data}
            origine={o.origine ?? 'epingle'}
            userName1={o.userName1}
            userName2={o.userName2}
            onOpenDetail={o.onOpenDetail ?? (() => {})}
            onStep={o.onStep ?? (() => {})}
            pas={o.pas ?? 'jour'}
            onPasChange={o.onPasChange ?? (() => {})}
            canStepPrev={o.canStepPrev ?? true}
            canStepNext={o.canStepNext ?? true}
            onRelease={o.onRelease ?? (() => {})}
        />,
    );
}
