// api/_lib/accessJwt.ts
// [CF-ACCESS] 2026-09-25 (décision Marc, avis pole-securite) — contrôle du jeton Cloudflare Access côté API.
//
// POURQUOI. Cloudflare Access met un mur devant finance.hubperso.com (code à usage unique par e-mail), mais la
// redirection n'est qu'un CONFORT : l'adresse *.vercel.app reste joignable en direct. Le VRAI mur est ici : le relais
// Claude et les proxys exigent l'en-tête `Cf-Access-Jwt-Assertion` et en vérifient la signature. Pas de jeton valide
// = 401, quelle que soit l'adresse d'entrée.
//
// Vérification confiée à `jose` (bibliothèque éprouvée, pas de code de crypto maison) :
//   - RS256 SEULEMENT (`none`, HS256… refusés : c'est la faille classique « algorithme choisi par l'attaquant ») ;
//   - `iss` = https://<équipe>.cloudflareaccess.com EXACT ; `aud` contient CF_ACCESS_AUD ; `exp` obligatoire, `nbf` respecté ;
//   - clé publique cherchée par `kid` dans /cdn-cgi/access/certs, en cache court ; un `kid` inconnu déclenche UN
//     rafraîchissement, borné par un délai de repos (jose `cooldownDuration`) : un attaquant qui envoie des `kid`
//     au hasard ne peut pas faire marteler Cloudflare ;
//   - revendication `email` = CF_ACCESS_EMAIL (ceinture : si la politique Access était mal réglée, l'API refuse quand même).
// Le jeton n'est JAMAIS journalisé (ni entier, ni en morceaux) ; seuls des motifs fixes de refus le sont.
//
// CF_ACCESS_REQUIRED : valeur ABSENTE (ou tout autre chose que « 0 ») = EXIGER. Le mode observation n'existe que si la
// valeur vaut exactement `0` (repli de mise en service / de retour arrière). Il journalise « observation active » et
// laisse passer, sans jamais donner le bénéfice du jeton (l'IP cf-connecting-ip n'est crue qu'avec un jeton valide).
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const ENTETE_JETON = 'cf-access-jwt-assertion';

export interface AccessConfig {
    /** Nom du domaine d'équipe (la partie avant .cloudflareaccess.com). */
    equipe: string;
    aud: string;
    /** E-mail attendu, en minuscules. */
    email: string;
}

export interface VerdictAcces {
    /** L'appel peut continuer (jeton valide, ou observation active). */
    autorise: boolean;
    /** Le jeton a été vérifié : seule condition pour croire cf-connecting-ip. */
    jetonValide: boolean;
    /** Le mode observation a laissé passer un appel sans jeton valide. */
    observation: boolean;
}

export interface OptionsAcces {
    /** Clés publiques injectables (tests) ; défaut : /cdn-cgi/access/certs de l'équipe. */
    cles?: JWTVerifyGetKey;
    /** Horloge injectable (tests). */
    maintenant?: Date;
}

const NOM_EQUIPE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const TOLERANCE_HORLOGE_SEC = 5;

/** Config depuis l'env serveur, ou `null` si absente/invalide (échec FERMÉ côté appelant tant que l'accès est exigé). */
export function accessDepuisEnv(get: (k: string) => string | undefined): AccessConfig | null {
    const equipe = get('CF_ACCESS_TEAM_DOMAIN')?.trim();
    const aud = get('CF_ACCESS_AUD')?.trim();
    const email = get('CF_ACCESS_EMAIL')?.trim().toLowerCase();
    if (!equipe || !aud || !email) return null;
    // Nom d'équipe SEUL : un hôte complet ou une URL laisserait choisir où vont chercher les clés.
    if (!NOM_EQUIPE.test(equipe)) return null;
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
    return { equipe, aud, email };
}

/** Exigence : SEULE la valeur exacte « 0 » désactive l'exigence (observation). Absente, vide, « false »… = exiger. */
export function accesExige(get: (k: string) => string | undefined): boolean {
    return get('CF_ACCESS_REQUIRED') !== '0';
}

const jeuxDeCles = new Map<string, JWTVerifyGetKey>();

let dernierAvisRefus = 0;
let dernierAvisConfig = 0;

/** Tests uniquement. */
export function reinitialiserCleAccess(): void {
    jeuxDeCles.clear();
    dernierAvisRefus = 0;
    dernierAvisObservation = 0;
    dernierAvisConfig = 0;
}

function clesDistantes(equipe: string): JWTVerifyGetKey {
    const cle = equipe.toLowerCase();
    let jeu = jeuxDeCles.get(cle);
    if (!jeu) {
        jeu = createRemoteJWKSet(new URL(`https://${cle}.cloudflareaccess.com/cdn-cgi/access/certs`), {
            cacheMaxAge: 10 * 60_000, // cache court : les clés Access tournent
            cooldownDuration: 30_000, // au plus un rafraîchissement / 30 s, même sur `kid` inconnu répété
            timeoutDuration: 5_000,
        });
        jeuxDeCles.set(cle, jeu);
    }
    return jeu;
}

/** Vérifie un jeton : `true` seulement si TOUT concorde. Ne lève jamais ; ne journalise jamais le jeton. */
export async function jetonAccessValide(token: string | null | undefined, cfg: AccessConfig, opts: OptionsAcces = {}): Promise<boolean> {
    if (!token) return false;
    try {
        const { payload } = await jwtVerify(token, opts.cles ?? clesDistantes(cfg.equipe), {
            algorithms: ['RS256'],
            issuer: `https://${cfg.equipe.toLowerCase()}.cloudflareaccess.com`,
            audience: cfg.aud,
            requiredClaims: ['exp'],
            clockTolerance: TOLERANCE_HORLOGE_SEC,
            ...(opts.maintenant ? { currentDate: opts.maintenant } : {}),
        });
        return typeof payload.email === 'string' && payload.email.toLowerCase() === cfg.email;
    } catch (e) {
        // Nom de l'erreur SEUL (JWTExpired, JWSSignatureVerificationFailed…) : jamais le message ni le jeton.
        // Au plus 1 ligne / 10 s : un balayage de l'adresse ne doit pas inonder les journaux.
        const t = Date.now();
        if (t - dernierAvisRefus > 10_000) {
            dernierAvisRefus = t;
            console.warn('[access] jeton refusé:', (e as { code?: string })?.code ?? (e as { name?: string })?.name ?? 'Error');
        }
        return false;
    }
}

let dernierAvisObservation = 0;

/**
 * Contrôle d'accès d'une requête API. Exiger (défaut) : sans jeton valide → `autorise: false`. Observation
 * (CF_ACCESS_REQUIRED=0) : laisse passer, journalise « observation active » (au plus 1×/min, sans donnée).
 */
export async function controlerAcces(
    headers: Headers,
    get: (k: string) => string | undefined,
    opts: OptionsAcces = {},
): Promise<VerdictAcces> {
    const exige = accesExige(get);
    const cfg = accessDepuisEnv(get);
    let jetonValide = false;
    if (cfg) {
        jetonValide = await jetonAccessValide(headers.get(ENTETE_JETON), cfg, opts);
    } else if (exige) {
        // 1 ligne / minute au plus (sans donnée) : le journal ne doit pas pouvoir être inondé par des appels répétés.
        const t = Date.now();
        if (t - dernierAvisConfig > 60_000) {
            dernierAvisConfig = t;
            console.error('[access] configuration incomplète (CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD / CF_ACCESS_EMAIL) : accès refusé');
        }
    }
    if (jetonValide) return { autorise: true, jetonValide: true, observation: false };
    if (exige) return { autorise: false, jetonValide: false, observation: false };
    const t = Date.now();
    if (t - dernierAvisObservation > 60_000) {
        dernierAvisObservation = t;
        console.warn('[access] observation active');
    }
    return { autorise: true, jetonValide: false, observation: true };
}
