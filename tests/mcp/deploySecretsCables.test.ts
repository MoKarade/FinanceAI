// tests/mcp/deploySecretsCables.test.ts — [VEHICULE-BAIL] chaque variable que le serveur LIT
// doit être CÂBLÉE par le script qui le déploie.
//
// ══ POURQUOI CE TEST EXISTE ══════════════════════════════════════════════════════════
//
// `GET /vehicule/bail` (ADR 0017) a été écrit, testé par deux fichiers, documenté, et il
// répondait 404 en production. `mcp/http.ts` ne câble la route que si
// `FINANCEAI_VEHICULE_TOKEN` est présent, et `mcp/deploy.sh` ne montait pas ce secret : le
// service déployé se comportait donc EXACTEMENT comme si la route était volontairement
// désactivée. Aucun test ne pouvait le voir — les deux existants exercent le handler, pas
// le déploiement — et aucun signal ne pouvait le dire : un 404 est la réponse NORMALE d'une
// route désactivée.
//
// C'est la même famille que « l'observateur était requis pour l'observation » : du code
// correct dont la CADENCE D'APPEL est nulle. Ici c'est le CÂBLAGE qui est nul.
//
// ⚠️ Ce que ce test NE prouve pas : que le secret existe dans Secret Manager. Ça, seul le
// déploiement le sait, et il le DIT (« secret … absent → … désactivé »). Ce test prouve la
// seule chose vérifiable hors GCP : que le script sait au moins que la variable existe.
//
// ⚠️ Poser la variable à la main dans la console ne remplace pas ce câblage :
// `--set-secrets` / `--set-env-vars` remplacent l'existant à chaque déploiement.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(__dirname, '..', '..');
const SOURCE_HTTP = readFileSync(join(RACINE, 'mcp', 'http.ts'), 'utf8');
const SOURCE_DEPLOY = readFileSync(join(RACINE, 'mcp', 'deploy.sh'), 'utf8');

/**
 * Variables lues par le serveur et DÉLIBÉRÉMENT absentes du script de déploiement.
 *
 * ⚠️ Toute entrée ajoutée ici doit porter sa raison en commentaire. C'est la porte de
 * sortie de ce test, et une liste d'exceptions sans justification la transforme en
 * passoire — la leçon n°6 de Hubperso, apprise sur un test d'exhaustivité exactement
 * comme celui-ci.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    'PORT',
    "Posée par Cloud Run LUI-MÊME à l'exécution. La câbler serait écraser la valeur de la " +
      'plateforme par une des nôtres, donc écouter sur le mauvais port.',
  ],
  [
    'MCP_HTTP_PORT',
    "Repli LOCAL uniquement : sur Cloud Run c'est $PORT qui gagne (cf mcp/http.ts). " +
      "La monter n'aurait aucun effet, et laisserait croire qu'elle en a un.",
  ],
  [
    'MCP_HTTP_HOST',
    "Repli LOCAL uniquement : la présence de $PORT fait déjà écouter sur 0.0.0.0. " +
      'Sur Cloud Run, la poser ne peut que contredire la plateforme.',
  ],
  [
    'MCP_HTTP_ALLOW_EXPOSED',
    "Garde-fou de DÉVELOPPEMENT : elle autorise une exposition hors loopback sans auth. " +
      "Sur Cloud Run l'exposition est le but ET l'auth OAuth est montée — la câbler ici " +
      'reviendrait à transporter en production un interrupteur qui désarme cette garde.',
  ],
]);

/** Les variables que le serveur lit, extraites de son propre code. */
function variablesLues(): string[] {
  const vues = new Set<string>();
  for (const m of SOURCE_HTTP.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    vues.add(m[1]!);
  }
  return [...vues].sort();
}

describe('[VEHICULE-BAIL] le script de déploiement câble ce que le serveur lit', () => {
  // ── ANTI-VACUITÉ ────────────────────────────────────────────────────────────────────
  // Les noms sont ÉCRITS ICI, pas dérivés de l'extraction : sans ça, une expression
  // régulière qui ne trouve plus rien rendrait ce fichier vert en ne vérifiant RIEN.
  // C'est précisément le mode de panne qu'on corrige — un contrôle qui ne peut pas
  // se déclencher.
  it("l'extraction trouve bien les variables connues du serveur", () => {
    const lues = variablesLues();
    for (const attendue of [
      'FINANCEAI_OAUTH_SIGNING_KEY',
      'FINANCEAI_ACCESS_KEY',
      'FINANCEAI_PUBLIC_URL',
      'FINANCEAI_HUB_TOKEN',
      'FINANCEAI_VEHICULE_TOKEN',
      'FINTABLE_TOKEN',
    ]) {
      expect(lues, `mcp/http.ts devrait lire ${attendue}`).toContain(attendue);
    }
    expect(lues.length).toBeGreaterThanOrEqual(10);
  });

  it('chaque variable lue est nommée dans mcp/deploy.sh (ou exceptée avec sa raison)', () => {
    const manquantes = variablesLues().filter(
      (v) => !EXCEPTIONS.has(v) && !SOURCE_DEPLOY.includes(v),
    );
    expect(
      manquantes,
      `mcp/http.ts lit ces variables, mcp/deploy.sh ne les monte pas : la route qu'elles ` +
        `activent sera silencieusement absente du service déployé.`,
    ).toEqual([]);
  });

  it('aucune exception sans raison écrite', () => {
    for (const [nom, raison] of EXCEPTIONS) {
      expect(raison.trim().length, `l'exception ${nom} doit porter sa raison`).toBeGreaterThan(20);
    }
  });

  // Le câblage du bail passe par une CONDITION sur le secret : sans elle, le script
  // monterait une référence à un secret inexistant et `gcloud run deploy` échouerait pour
  // tout le monde, y compris ceux qui n'ont pas de véhicule enregistré.
  it('le bail du véhicule est monté CONDITIONNELLEMENT, comme les autres routes optionnelles', () => {
    expect(SOURCE_DEPLOY).toMatch(
      /gcloud secrets describe financeai-vehicule-token[\s\S]*?FINANCEAI_VEHICULE_TOKEN=financeai-vehicule-token:latest/,
    );
    // Et l'absence se DIT, plutôt que de laisser croire que la route existe.
    expect(SOURCE_DEPLOY).toContain('GET /vehicule/bail désactivé');
  });
});
