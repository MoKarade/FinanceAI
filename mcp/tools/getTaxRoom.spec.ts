// mcp/tools/getTaxRoom.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getTaxRoom.tool.ts. Tool STATELESS (calculateur pur, ignore l'état).

import { z } from 'zod';
import {
  calculateCeliRoom,
  calculateCeliAvailableRoom,
} from '../../services/tax';
import { jsonContent } from './_dataAware';
import type { ReadToolSpec } from './_toolSpec';

const inputSchema = {
  birthYear: z.number().int().min(1900).max(2030)
    .describe("Annee de naissance de l'utilisateur (ex: 1990)"),
  arrivalYear: z.number().int().min(1900).max(2030)
    .describe("Annee d'arrivee au Canada. Le CELI s'accumule a partir du max entre 18 ans et l'arrivee, jamais avant 2009."),
  currentYear: z.number().int().min(2009).max(2050)
    .describe('Annee courante pour le calcul (ex: 2026)'),
  currentCeliBalance: z.number().nonnegative().finite().optional()
    .describe('Solde CELI actuel en CAD (cotisations nettes cumulees). Defaut: 0.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args et le handler reste fortement typé (une annotation élargirait le shape).
export const getTaxRoomSpec = {
  kind: 'stateless',
  name: 'get_tax_room',
  description:
    "Calcule l'espace de cotisation CELI cumule depuis le max(18 ans, arrivee Canada) et l'espace restant disponible compte tenu du solde courant. Utilise les plafonds officiels ARC 2009-2025 ; extrapole 2026+ a ~7500$ par an (inflation 2%).",
  inputSchema,
  // [Finding panel 2026-07-21] jsonContent = LE chokepoint de sortie (scrub anti-injection) —
  // un JSON.stringify à la main créait un 2e chemin de sortie non gardé (identique octet pour
  // octet ici : payload 100 % numérique + note code-auteur, hors USER_TEXT_KEYS).
  handler: async ({ birthYear, arrivalYear, currentYear, currentCeliBalance }, _getState) => {
    const balance = currentCeliBalance ?? 0;
    const totalRoom = calculateCeliRoom(birthYear, arrivalYear, currentYear);
    const availableRoom = calculateCeliAvailableRoom(birthYear, arrivalYear, currentYear, balance);
    return jsonContent({
      currency: 'CAD',
      totalRoom,
      currentBalance: balance,
      availableRoom,
      notes: 'Le plafond CELI s\'accumule meme sans cotisation. Les retraits liberent de l\'espace l\'annee suivante (non modelise ici, fournir balance ajustee).',
    });
  },
} satisfies ReadToolSpec<Args>;
