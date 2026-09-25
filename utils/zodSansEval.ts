// utils/zodSansEval.ts
//
// [S5-ZOD4-CSP] zod 4 compile ses validateurs d'objets avec `new Function` (JIT), après avoir TESTÉ si
// eval est permis. Notre CSP interdit eval (pas de 'unsafe-eval', index.html + vercel.json) : le test
// lui-même est une violation CSP que le navigateur journalise, même si zod l'attrape. Mesuré le 24/09/2026
// (PR #1055) : Lighthouse « bonnes pratiques » 0,96 au lieu de 1 (audit inspector-issues, « Content
// security policy »), budget bloquant. `jitless` coupe le JIT ET le test (zod/v4/core/util.js, allowsEval).
// Importé EN PREMIER par index.tsx, avant tout schéma. `zod/v4/core` et non `zod` : l'entrée ne tire que
// la configuration, pas toute la bibliothèque (chargée à la demande par les écrans qui s'en servent).
import { config } from 'zod/v4/core';

config({ jitless: true });
