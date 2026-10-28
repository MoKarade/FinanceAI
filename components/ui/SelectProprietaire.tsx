// components/ui/SelectProprietaire.tsx
//
// [FISC-RRSP-RENTAL-EARNED] Sélecteur du PROPRIÉTAIRE d'un immeuble (décision Marc 2026-09-05 :
// champ optionnel par immeuble, défaut 50/50). Il pilote UNE chose dans le moteur : à quel conjoint
// le loyer net est attribué comme revenu GAGNÉ pour les droits REER (`revenuGagnePartage.ts`).
// Deux écrans le posent (Réglages → Patrimoine, onglet Immobilier) : une seule liste d'options,
// sinon les deux libellés divergent en silence (`UN-CORRECTIF-LOCAL-REPETE-EST-LE-SIGNE-D-UNE-SOURCE-UNIQUE-MANQUANTE`).
// L'appelant ne le rend QUE pour un ménage à deux : en solo, tout revient de toute façon au seul
// déclarant et un choix sans effet serait une promesse vide.
import React from 'react';
import type { AssetOwner } from '../../types';
import { isCoupleMode } from '../../services/couple/netWorthByOwner';

const LIBELLE_PROPRIETAIRE_CONJOINT = 'Les deux (50/50)';

export const SelectProprietaire: React.FC<{
    id?: string;
    value: AssetOwner | undefined;
    onChange: (owner: AssetOwner) => void;
    /** Prénoms des deux conjoints, dans l'ordre du ménage (index 0 = user1). */
    noms: [string, string];
    className?: string;
}> = ({ id, value, onChange, noms, className }) => (
    <select
        id={id}
        aria-label="Propriétaire de l'immeuble (droits REER)"
        title="Le loyer net compte comme revenu gagné pour les droits REER de ce conjoint"
        value={value ?? 'joint'}
        onChange={e => onChange(e.target.value as AssetOwner)}
        className={className}
    >
        <option value="joint">{LIBELLE_PROPRIETAIRE_CONJOINT}</option>
        <option value="user1">{noms[0]}</option>
        <option value="user2">{noms[1]}</option>
    </select>
);

/** Prénoms à afficher, ou `null` si le ménage n'a qu'une tête (second conjoint sans nom). */
export const nomsConjoints = (users: ReadonlyArray<{ name?: string } | undefined>): [string, string] | null => {
    if (!isCoupleMode(users)) return null; // [COUPLE-PREDICAT-COPIES] source unique
    const n0 = users[0]?.name?.trim() || '';
    return [n0 || 'Conjoint 1', users[1]!.name!.trim()];
};
