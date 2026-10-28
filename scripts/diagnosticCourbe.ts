#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
// scripts/diagnosticCourbe.ts
//
// [COURBE-DIAGNOSTIC] Explique les cassures de la courbe « Performance comparée » sur l'état RÉEL,
// sans rien écrire dans le dépôt (il est tenu comme PUBLIC).
//
//   npx tsx scripts/diagnosticCourbe.ts [export-etat.json]
//
// Source d'état : Google Drive si le connecteur est autorisé (`npm run mcp:auth`), sinon le fichier
// donné en argument ou `$FINANCEAI_STATE_FILE` (même résolution que le serveur MCP). Lecture seule.
//
// Sortie : symboles, dates et POURCENTAGES. Jamais un montant ni une quantité : elle peut se coller
// dans une issue. Elle nomme tout de même les titres — ne pas la committer dans un fichier du dépôt.

import { resolveState } from '../mcp/bootstrap';
import { loadAppStateFromSource } from '../mcp/state/loadAppState';
import { diagnostiquerCourbe } from '../services/history/diagnosticCourbe';

async function principal(): Promise<void> {
    const { source, describe } = await resolveState(process.argv[2]);
    if (!source) {
        console.error("Aucune source d'état : lance `npm run mcp:auth` (Drive) ou passe un export JSON.");
        process.exit(2);
    }
    const etat = await loadAppStateFromSource(source);
    console.error(`Source : ${describe()}`);
    const d = diagnostiquerCourbe(etat.assets ?? [], etat.fxRates ?? undefined);
    console.log(JSON.stringify(d, null, 2));
}

principal().catch((err: unknown) => {
    console.error('Échec :', err instanceof Error ? err.message : err);
    process.exit(1);
});
