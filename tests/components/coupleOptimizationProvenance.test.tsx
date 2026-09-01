// [AI-COUPLE-SELFRATED-CONFIDENCE] Un chiffre produit par le modèle ne prend pas l'apparence d'un
// chiffre calculé.
//
// ⚠️ `confidence` et `estimated_savings_cad` sont AUTO-attribués par le modèle. Le schéma Zod valide
// la FORME (`'high' | 'medium' | 'low'`, un nombre fini non négatif) — rien ne vérifie la justesse.
// Or la carte affichait « Haute confiance » et un montant en police monospace verte encadrée :
// exactement l'allure des montants d'impôt du voisin immédiat, qui sortent du moteur et sont testés.
// Deux choses qui se ressemblent à l'écran et n'ont pas le même statut, c'est `no-fake-data`.
//
// ⚠️ Ce test vise le RENDU, pas la constante : c'est ce que l'utilisateur LIT qui affirme quelque
// chose, et une constante juste rendue au mauvais endroit n'aurait rien corrigé.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CoupleOptimizationCard } from '../../components/tax/CoupleOptimizationCard';
import { useFinanceStore } from '../../store/useFinanceStore';

const strategies = [
    { title: 'Fractionner le REER', description: 'Cotiser au REER de conjoint pour égaliser les revenus.', estimated_savings_cad: 1500, confidence: 'high' as const },
    { title: 'Transférer les crédits', description: 'Transférer les frais médicaux au conjoint au revenu le plus bas.', estimated_savings_cad: 420, confidence: 'low' as const },
];

vi.mock('../../services/claude', () => ({
    getCoupleOptimizationStrategies: vi.fn(async () => strategies),
}));

const CONFIG_COUPLE = {
    users: [{ name: 'Marc' }, { name: 'Alex' }],
} as unknown as ReturnType<typeof useFinanceStore.getState>['config'];

beforeEach(() => {
    useFinanceStore.setState({ config: CONFIG_COUPLE, apiKeys: { anthropic: 'sk-test' } as never });
});
afterEach(() => {
    // ⚠️ `isPrivacyMode` est un état de MODULE : sans remise à zéro, un cas qui l'active
    // contaminerait les suivants et les montants seraient masqués sans raison visible.
    useFinanceStore.setState({ isPrivacyMode: false });
});

async function rendreAvecStrategies() {
    render(<CoupleOptimizationCard />);
    fireEvent.click(screen.getByRole('button', { name: /Générer 3 stratégies IA/ }));
    await waitFor(() => expect(screen.getByText('Fractionner le REER')).toBeTruthy());
}

describe('[AI-COUPLE-SELFRATED-CONFIDENCE] la provenance IA est LISIBLE', () => {
    it('aucun niveau de confiance n\'est présenté comme un verdict de l\'app', () => {
        // ⚠️ L'assertion est écrite sur le TEXTE affiché, pas sur la table de libellés : c'est le
        // rendu qui affirme. Et elle vise la formulation exacte du défaut — « Haute confiance » sans
        // rien qui dise qui l'attribue.
        return rendreAvecStrategies().then(() => {
            expect(screen.queryByText('Haute confiance'), 'le verdict du modèle est présenté comme celui de l\'app').toBeNull();
            // Chaque badge dit QUI parle. Deux stratégies rendues ⇒ deux badges.
            const badges = screen.getAllByText(/^IA — /);
            expect(badges).toHaveLength(2);
        });
    });

    it('le montant porte sa provenance DANS son libellé', async () => {
        await rendreAvecStrategies();
        // ⚠️ « estimée » seul ne suffisait pas : un calcul du moteur est lui aussi une estimation.
        // Ce qui manquait, c'est QUI l'a produite.
        // Les DEUX stratégies portent un montant : la provenance doit accompagner CHACUN, pas
        // seulement le premier — un `getByText` aurait d'ailleurs échoué sur la multiplicité, ce qui
        // est en soi la preuve qu'il y en a plusieurs à couvrir.
        const lignes = screen.getAllByText(/Ordre de grandeur avancé par l'IA/);
        expect(lignes).toHaveLength(2);
        for (const ligne of lignes) {
            expect(ligne.className, 'le montant garde l\'habillage « chiffre validé » (vert/succès)').not.toMatch(/emerald|success/);
        }
    });

    it('une mention UNIQUE dit ce que l\'app n\'a PAS fait', async () => {
        await rendreAvecStrategies();
        // ⚠️ Unique, pas par carte : répétée, elle devient du décor qu'on cesse de lire. Le compte
        // fait partie de la propriété défendue — et il est asserté, sinon « la mention existe »
        // resterait vrai d'une version qui la répète six fois.
        const mentions = screen.getAllByText(/L'app ne les recalcule pas/);
        expect(mentions).toHaveLength(1);
        expect(mentions[0].textContent).toMatch(/produits par l'IA/);
    });

    it('la mention n\'apparaît PAS avant qu\'il y ait quelque chose à qualifier', () => {
        // Contrôle d'anti-vacuité : sans lui, « la mention est là » serait aussi vrai d'un texte
        // affiché en permanence, y compris sur une carte vide où il ne qualifie rien.
        render(<CoupleOptimizationCard />);
        expect(screen.queryByText(/L'app ne les recalcule pas/)).toBeNull();
    });
});
