// api/_lib/garde.ts
// [DURCISSEMENT-RELAIS] 2026-09-25 (décision Marc via pole-securite) — freins du relais, en code pur Web-standard.
//
// ⚠️ HONNÊTETÉ SUR CE QUE CES FREINS VALENT. Le relais tourne sur Vercel SANS ÉTAT : chaque instance a sa mémoire, et
// une instance froide repart de zéro. Le débit ci-dessous est donc un FREIN FAIBLE MAIS UTILE (il coupe une rafale
// sur une instance chaude), jamais une garantie. Aucun stockage partagé : un service tiers (même au palier gratuit)
// ajoute une dépendance et une panne possible ; s'il en faut un un jour, il échoue FERMÉ et cela se décide à part.
// L'en-tête Origin est FALSIFIABLE hors navigateur : c'est un frein contre l'usage depuis une page tierce, pas une
// authentification. La vraie barrière de la passerelle locale reste la clé Anthropic VÉRIFIÉE (cf. relay.ts).

/** Plafond du corps de requête (petits JSON texte ; Vision ne passe pas par le relais). */
export const CORPS_MAX_OCTETS = 200 * 1024;

/** Origine de production ; d'autres via l'env serveur RELAIS_ORIGINES (liste séparée par des virgules). */
export const ORIGINE_PROD = 'https://finance.hubperso.com';

export const LIMITES_PAR_DEFAUT = {
    /** Requêtes par minute et par IP (tous appels). */
    parIp: 120,
    /** Requêtes par minute et par empreinte de clé. */
    parCle: 60,
    /** Vérifications de clé auprès d'Anthropic (clés INCONNUES seulement) par minute et par IP. */
    verifParIp: 10,
} as const;
export type Limites = { parIp: number; parCle: number; verifParIp: number };

const FENETRE_MS = 60_000;
const COMPTEURS_MAX = 2_000;

// ─── Débit : fenêtre fixe, mémoire bornée, éviction par ancienneté ────────────────────────────────────

const compteurs = new Map<string, { debut: number; n: number }>();

/** Tests uniquement. */
export function reinitialiserLimites(): void {
    compteurs.clear();
}

/** Insère en gardant l'ordre d'ancienneté (Map = ordre d'insertion) et la taille bornée. */
function poser(cle: string, valeur: { debut: number; n: number }, maintenant: number): void {
    compteurs.delete(cle);
    if (compteurs.size >= COMPTEURS_MAX) {
        for (const [k, v] of compteurs) if (v.debut + FENETRE_MS <= maintenant) compteurs.delete(k);
        while (compteurs.size >= COMPTEURS_MAX) {
            const plusAncien = compteurs.keys().next().value;
            if (plusAncien === undefined) break;
            compteurs.delete(plusAncien);
        }
    }
    compteurs.set(cle, valeur);
}

/** Compte un passage ; `ok:false` + délai avant nouvel essai si le plafond de la fenêtre est atteint. */
export function essayerDebit(cle: string, max: number, maintenant = Date.now()): { ok: true } | { ok: false; retryApresSec: number } {
    const c = compteurs.get(cle);
    if (!c || c.debut + FENETRE_MS <= maintenant) {
        poser(cle, { debut: maintenant, n: 1 }, maintenant);
        return { ok: true };
    }
    if (c.n >= max) return { ok: false, retryApresSec: Math.max(1, Math.ceil((c.debut + FENETRE_MS - maintenant) / 1000)) };
    c.n += 1;
    return { ok: true };
}

/** Nombre de compteurs en mémoire (tests : borne). */
export function tailleCompteurs(): number {
    return compteurs.size;
}

// ─── Client ───────────────────────────────────────────────────────────────────────────────────────────

/** IP du client telle que posée par la plateforme (x-forwarded-for : premier saut). Absente → 'inconnue'. */
export function ipClient(headers: Headers): string {
    const xff = headers.get('x-forwarded-for');
    const premier = xff?.split(',')[0]?.trim();
    return (premier || headers.get('x-real-ip')?.trim() || 'inconnue').slice(0, 64);
}

// ─── Origin ───────────────────────────────────────────────────────────────────────────────────────────

const HOTE_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function normaliser(o: string): string | null {
    try {
        const u = new URL(o);
        return u.origin === 'null' ? null : u.origin;
    } catch {
        return null;
    }
}

/**
 * Origine autorisée : finance.hubperso.com, RELAIS_ORIGINES, l'URL de CE déploiement (VERCEL_URL /
 * VERCEL_BRANCH_URL, posées par Vercel : les prévisualisations marchent) et localhost (dev).
 * Origine ABSENTE → refus : un POST de navigateur en porte toujours une.
 */
export function origineAutorisee(origin: string | null, get: (k: string) => string | undefined): boolean {
    if (!origin) return false;
    const o = normaliser(origin);
    if (!o) return false;
    const u = new URL(o);
    if (HOTE_LOCAL.test(u.hostname) && u.protocol === 'http:') return true;
    const autorisees = new Set<string>([ORIGINE_PROD]);
    for (const h of [get('VERCEL_URL'), get('VERCEL_BRANCH_URL')]) if (h) autorisees.add(`https://${h}`);
    for (const x of (get('RELAIS_ORIGINES') ?? '').split(',')) {
        const n = normaliser(x.trim());
        if (n) autorisees.add(n);
    }
    return autorisees.has(o);
}

// ─── Corps borné ──────────────────────────────────────────────────────────────────────────────────────

export class CorpsTropGros extends Error {}

/** Lit le corps SANS dépasser `max` octets (annule la lecture au dépassement : jamais de corps géant en mémoire). */
export async function lireCorpsBorne(request: Request, max = CORPS_MAX_OCTETS): Promise<string> {
    const annonce = Number(request.headers.get('content-length'));
    if (Number.isFinite(annonce) && annonce > max) throw new CorpsTropGros();
    if (!request.body) return '';
    const lecteur = request.body.getReader();
    const morceaux: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
            await lecteur.cancel().catch(() => undefined);
            throw new CorpsTropGros();
        }
        morceaux.push(value);
    }
    const tout = new Uint8Array(total);
    let pos = 0;
    for (const m of morceaux) { tout.set(m, pos); pos += m.byteLength; }
    return new TextDecoder().decode(tout);
}
