#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
// scripts/fintableDoctor.ts — [FINTABLE Lot 1b] « Pourquoi ma donnée n'arrive pas ? », ZÉRO écriture.
//
// Complément de `fintable:dry` (qui répond « quelles données j'importerais »). Celui-ci répond
// « pourquoi il n'y en a pas » : droits du plan, santé des connexions, état des intégrations.
//
// Usage (Git Bash) :
//   FINTABLE_TOKEN="$(gcloud secrets versions access latest --secret=financeai-fintable-token --project=financeai-497112)" \
//     npm run fintable:doctor
// Usage (PowerShell) :
//   $env:FINTABLE_TOKEN = (gcloud secrets versions access latest --secret=financeai-fintable-token --project=financeai-497112)
//   npm run fintable:doctor
//
// La sortie ne contient AUCUN montant ni identifiant de compte bancaire — elle est conçue pour être
// recollée telle quelle dans un diagnostic partagé.

import { FintableClient } from '../services/fintable/client';
import { explainMissingData, readFintableDiagnostics } from '../services/fintable/readDiagnostics';
import { FintableError } from '../services/fintable/types';

async function main(): Promise<void> {
    const token = process.env.FINTABLE_TOKEN;
    if (!token) {
        console.error('FINTABLE_TOKEN absent de l\'environnement. Crée un jeton LECTURE SEULE dans Dashboard → API.');
        process.exitCode = 2;
        return;
    }

    const diag = await readFintableDiagnostics(new FintableClient({ token }));

    console.log('PLAN');
    console.log(`  Tier : ${diag.profile.tier}${diag.profile.planPeriod ? ` (${diag.profile.planPeriod})` : ''}`);
    console.log(`  Synchronisations autorisées : ${diag.profile.canSync ? 'OUI' : 'NON'}`);
    if (diag.profile.connectionsUsed !== null || diag.profile.connectionLimit !== null) {
        console.log(`  Connexions : ${diag.profile.connectionsUsed ?? '?'} / ${diag.profile.connectionLimit ?? '?'}`);
    }
    if (diag.profile.expiresAt) console.log(`  Échéance du plan : ${diag.profile.expiresAt}`);

    console.log('');
    console.log(`CONNEXIONS (${diag.connections.length})`);
    for (const c of diag.connections) {
        console.log(`  - ${c.institutionName} [${c.provider}]`);
        console.log(`      santé=${c.healthy ? 'OK' : 'PROBLÈME'} statut="${c.statusText}" reconnexion_requise=${c.needsReconnect}`);
        console.log(`      comptes=${c.accountsCount ?? '?'} dernière_sync_réussie=${c.lastSuccessfulUpdate ?? 'JAMAIS'}`);
        if (c.syncStatus) {
            console.log(`      dernière passe : état=${c.syncStatus.state ?? '?'} étape="${c.syncStatus.stage ?? '?'}" fin=${c.syncStatus.finishedAt ?? '(non terminée)'}`);
        }
    }

    console.log('');
    console.log('INTÉGRATIONS');
    if (!diag.integrations) {
        console.log('  (non lues)');
    } else {
        const { airtable, googleSheets } = diag.integrations;
        console.log(`  Airtable : ${airtable ? `${airtable.healthy ? 'OK' : 'PROBLÈME'} onglet_positions=${airtable.holdingsTableName ?? 'NON CONFIGURÉ'}` : 'non connecté'}`);
        if (googleSheets.length === 0) console.log('  Google Sheets : aucune feuille connectée');
        for (const s of googleSheets) {
            console.log(`  Google Sheets « ${s.title} » : ${s.healthy ? 'OK' : `PROBLÈME (${s.error ?? 'raison non fournie'})`}`);
            console.log(`      onglets → comptes=${s.tabs.accounts ?? 'NON CONFIGURÉ'} transactions=${s.tabs.transactions ?? 'NON CONFIGURÉ'} positions=${s.tabs.holdings ?? 'NON CONFIGURÉ'}`);
        }
    }

    if (diag.failures.length > 0) {
        console.log('');
        console.log('SECTIONS NON LUES');
        for (const f of diag.failures) console.log(`  - ${f.section} : ${f.reason}`);
    }

    console.log('');
    const causes = explainMissingData(diag);
    if (causes.length === 0) {
        console.log('CAUSES PROBABLES D\'UNE ABSENCE DE DONNÉES : aucune détectée.');
        console.log('  Le compte, les connexions et les intégrations ont l\'air sains. Si des positions');
        console.log('  manquent malgré tout, le suspect suivant est le périmètre de la connexion elle-même');
        console.log('  (quels comptes ont été cochés lors du lien bancaire).');
    } else {
        console.log('CAUSES PROBABLES D\'UNE ABSENCE DE DONNÉES');
        for (const c of causes) console.log(`  - ${c}`);
    }

    console.log('');
    console.log('Aucune écriture effectuée (lecture seule).');
}

main().catch((err: unknown) => {
    if (err instanceof FintableError) {
        console.error(`Échec [${err.code}] : ${err.message}`);
        if (err.isTransient) console.error('Erreur transitoire — réessaie dans quelques minutes.');
    } else {
        console.error(`Échec inattendu : ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exitCode = 1;
});
