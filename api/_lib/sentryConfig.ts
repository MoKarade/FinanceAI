// api/_lib/sentryConfig.ts — réglages Sentry des fonctions Vercel et du script d'essai (FinanceAI#1171).
//
// Pur et sans effet de bord : ne lit aucun environnement, ne démarre rien. Le DSN arrive en paramètre, et
// SANS DSN Sentry reste éteint (la CI et le build n'ont besoin d'aucune variable). Repris de
// MoKarade/app-template (lib/sentryConfig.ts, tâche #40), PLUS STRICT : ici les erreurs peuvent naître d'une
// requête qui porte un symbole boursier ou le texte d'une conversation financière.
//
// Donnée personnelle (décision de Marc, 15/10/2026 : aucune donnée perso en ligne) : ne partent JAMAIS
// l'adresse IP, les cookies, les en-têtes, le corps, l'adresse de la requête (le symbole est dans sa chaîne), ni
// le MESSAGE de l'erreur (même règle que les traces du dépôt : « nom d'erreur SEUL, jamais le message brut »).
// Restent le type d'erreur, la pile et la source. `sendDefaultPii` reste faux ET `retirerDonneesPersonnelles`
// nettoie l'événement en dernier recours. Verrou : tests/api/sentryConfig.test.ts.

interface ValeurException {
    type?: string;
    value?: string;
}

/** Le sous-ensemble d'un événement Sentry que l'on nettoie (types structurels, aucun import). */
export interface EvenementNettoyable {
    message?: string;
    exception?: { values?: ValeurException[] };
    request?: unknown;
    user?: unknown;
    extra?: unknown;
    breadcrumbs?: unknown;
    server_name?: string;
}

/**
 * Retire tout ce qui peut identifier une personne ou porter une donnée financière ; garde le type d'erreur,
 * la pile et les étiquettes. Le message d'une exception est remplacé par son type.
 */
export function retirerDonneesPersonnelles<T extends EvenementNettoyable>(evenement: T): T {
    delete evenement.request;
    delete evenement.user;
    delete evenement.extra;
    delete evenement.breadcrumbs;
    delete evenement.server_name;
    delete evenement.message;
    for (const valeur of evenement.exception?.values ?? []) {
        valeur.value = valeur.type ?? 'Error';
    }
    return evenement;
}

export interface OptionsSentry {
    dsn: string | undefined;
    enabled: boolean;
    sendDefaultPii: false;
    tracesSampleRate: 0;
    beforeSend: typeof retirerDonneesPersonnelles;
}

/**
 * Options de `Sentry.init`. `dsn` vide ou absent = éteint : aucun événement ne part. Pas de traces de
 * performance (`tracesSampleRate` à 0) : le besoin est de voir les ERREURS.
 */
export function optionsSentry(dsn: string | undefined): OptionsSentry {
    const propre = dsn?.trim() ? dsn.trim() : undefined;
    return {
        dsn: propre,
        enabled: propre !== undefined,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend: retirerDonneesPersonnelles,
    };
}
