// api/_lib/sentry.ts — signalement des erreurs imprévues des fonctions Vercel à Sentry (FinanceAI#1171).
//
// ÉTEINT sans `SENTRY_DSN` : aucun import du SDK, aucun réseau, la fonction rend sa réponse comme avant.
// Allumé, il passe par les MÊMES réglages que le script d'essai (api/_lib/sentryConfig.ts : aucune donnée
// perso, message d'erreur retiré), jamais par un `Sentry.init` libre. Les intégrations par défaut sont
// coupées : le SDK n'instrumente ni les requêtes entrantes ni la console, il ne fait que ce qu'on lui demande.
//
// Une fonction serverless peut être gelée dès sa réponse envoyée : on attend donc l'envoi (`flush`, borné)
// AVANT de rendre la main. Un échec du signalement ne casse JAMAIS la réponse de l'utilisateur ; il est
// tracé par son nom (jamais son message), comme les autres traces du dépôt.
import { optionsSentry } from './sentryConfig.js';

type SentryNode = typeof import('@sentry/node');

const DELAI_ENVOI_MS = 2_000;

let sdk: Promise<SentryNode> | undefined;

function charger(dsn: string): Promise<SentryNode> {
    sdk ??= import('@sentry/node').then((Sentry) => {
        Sentry.init({
            ...optionsSentry(dsn),
            defaultIntegrations: false,
            environment: process.env.VERCEL_ENV ?? 'inconnu',
        });
        return Sentry;
    });
    return sdk;
}

/** Signale une exception imprévue ; `source` dit quelle fonction (« relais », « proxy »). Ne lève jamais. */
export async function signalerErreur(erreur: unknown, source: string): Promise<void> {
    const options = optionsSentry(process.env.SENTRY_DSN);
    if (!options.enabled || options.dsn === undefined) return;
    try {
        const Sentry = await charger(options.dsn);
        Sentry.captureException(erreur, { tags: { source } });
        await Sentry.flush(DELAI_ENVOI_MS);
    } catch (e) {
        console.error('[sentry] signalement impossible:', (e as { name?: string })?.name ?? 'Error');
    }
}
