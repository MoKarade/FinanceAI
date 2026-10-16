// services/fintable/phraseErreurFintable.ts
// [FINTABLE-ERREUR-SIMPLE] Traduit l'erreur brute d'une passe Fintable (`report.error`) en une phrase
// simple pour l'écran. Le texte brut reste disponible (détail replié) : on ne le jette pas.

const FINTABLE_JETON_REFUSE = 'Fintable refuse la connexion : renouvelle ton jeton';
const FINTABLE_NE_REPOND_PAS = 'Fintable ne répond pas, réessaie dans un instant';

/** 401/403 = jeton absent, expiré, révoqué ou sans droit → renouveler le jeton. Le reste → réessayer. */
export function phraseErreurFintable(brut: string): string {
    return /\bHTTP (401|403)\b/.test(brut) ? FINTABLE_JETON_REFUSE : FINTABLE_NE_REPOND_PAS;
}
