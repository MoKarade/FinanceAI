#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
// scripts/mesureDoublons.ts
//
// [TX-DUPLICATES-BRUIT] Mesure le BRUIT du détecteur de doublons sur un extrait de transactions
// RÉELLES, sans jamais mettre ces transactions dans le dépôt (il est PUBLIC).
//
// Pourquoi ce script existe : `docs/CONVENTIONS.md` exige qu'un montant cité dans le dépôt soit
// re-dérivable par un script COMMITTÉ qui nomme chaque paramètre (`UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`).
// Le chiffre du ticket `[TX-DUPLICATES-BRUIT]` vient d'ici — pas d'une lecture à l'œil.
//
// Entrée : un TSV `date<TAB>montant<TAB>marchand<TAB>catégorie`, une ligne par transaction, dans
// l'ordre rendu par le tool MCP `search_transactions` (récent d'abord — le script ré-inverse pour
// que le plus ANCIEN porte le plus petit id, ce que `suggestedKeepId` suppose).
//
//   npx tsx scripts/mesureDoublons.ts <chemin.tsv>
//
// Sortie : pour chaque tolérance de date, les groupes que le détecteur PROPOSE aujourd'hui, partagés
// entre ceux dont les membres partagent le même MARCHAND normalisé et les autres. Cette partition
// est le cœur de la mesure : un groupe aux marchands différents est presque toujours une collision
// de montant (deux dépenses sans rapport qui font le même prix), pas un doublon.

import { readFileSync } from 'node:fs';
import { findDuplicateGroups, cleMarchandPourConfiance as merchantKey } from '../services/transactions/duplicateDetection';
import type { Transaction } from '../types';

function lireTsv(chemin: string): Transaction[] {
    const lignes = readFileSync(chemin, 'utf8').trim().split('\n').filter(Boolean);
    return lignes.reverse().map((l, i) => {
        const [date, montant, payee, category] = l.split('\t');
        return {
            id: i + 1, date, payee: payee ?? '', amount: Number(montant),
            category: category ?? 'Non catégorisé', status: 'processed',
        } as Transaction;
    });
}

function principal(): void {
    const chemin = process.argv[2];
    if (!chemin) {
        console.error('Usage : npx tsx scripts/mesureDoublons.ts <chemin.tsv>');
        process.exit(2);
    }
    const txs = lireTsv(chemin);
    console.log(`Transactions analysées : ${txs.length}`);

    for (const tolerance of [0, 1, 3]) {
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: tolerance });
        const lignesEnTrop = groupes.reduce((n, g) => n + g.suggestedMarkIds.length, 0);
        const enJeu = groupes.reduce((s, g) => s + Math.abs(g.amount) * g.suggestedMarkIds.length, 0);

        // La PARTITION qui compte : un groupe dont tous les membres partagent le marchand normalisé
        // est un candidat plausible ; un groupe qui mélange des marchands est une collision de montant.
        const memeMarchand = groupes.filter((g) => g.confiance !== 'faible');
        const collisions = groupes.filter((g) => g.confiance === 'faible');

        console.log(`\n=== tolérance ${tolerance} j : ${groupes.length} groupes · ${lignesEnTrop} lignes proposées au marquage · ${enJeu.toFixed(2)} $ en jeu`);
        console.log(`    plausibles (haute/moyenne) : ${memeMarchand.length}   ·   COLLISIONS de montant (marchands différents) : ${collisions.length}`);
        for (const g of collisions) {
            const noms = g.members.map((m) => `"${m.payee}"`).join(' ↔ ');
            console.log(`    ⚠️ collision ${g.amount} : ${noms}`);
        }
        for (const g of memeMarchand) {
            console.log(`    · [${g.confiance.padEnd(7)}] ${String(g.members.length).padStart(2)}× ${String(g.amount).padStart(9)} ${g.members[0].payee} (${g.members[0].date} → ${g.members[g.members.length - 1].date})`);
        }
    }
}

principal();
