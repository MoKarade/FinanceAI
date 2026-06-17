import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  calculateCeliRoom,
  calculateCeliAvailableRoom,
} from '../../utils/tax';

const inputSchema = {
  birthYear: z.number().int().min(1900).max(2030)
    .describe("Annee de naissance de l'utilisateur (ex: 1990)"),
  arrivalYear: z.number().int().min(1900).max(2030)
    .describe("Annee d'arrivee au Canada. Le CELI s'accumule a partir du max entre 18 ans et l'arrivee, jamais avant 2009."),
  currentYear: z.number().int().min(2009).max(2050)
    .describe('Annee courante pour le calcul (ex: 2026)'),
  currentCeliBalance: z.number().nonnegative().optional()
    .describe('Solde CELI actuel en CAD (cotisations nettes cumulees). Defaut: 0.'),
};

export const registerGetTaxRoom = (server: McpServer): void => {
  server.tool(
    'get_tax_room',
    "Calcule l'espace de cotisation CELI cumule depuis le max(18 ans, arrivee Canada) et l'espace restant disponible compte tenu du solde courant. Utilise les plafonds officiels ARC 2009-2025 ; extrapole 2026+ a ~7500$ par an (inflation 2%).",
    inputSchema,
    async ({ birthYear, arrivalYear, currentYear, currentCeliBalance }) => {
      const balance = currentCeliBalance ?? 0;
      const totalRoom = calculateCeliRoom(birthYear, arrivalYear, currentYear);
      const availableRoom = calculateCeliAvailableRoom(birthYear, arrivalYear, currentYear, balance);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            currency: 'CAD',
            totalRoom,
            currentBalance: balance,
            availableRoom,
            notes: 'Le plafond CELI s\'accumule meme sans cotisation. Les retraits liberent de l\'espace l\'annee suivante (non modelise ici, fournir balance ajustee).',
          }, null, 2),
        }],
      };
    },
  );
};
