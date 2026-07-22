// services/aiChat/attachments.ts
//
// [AITOOLS-B1] Pièces jointes du chat Claude in-app (images + PDF + texte/CSV) — demande Marc
// 2026-07-22 (« que je puisse mettre des docs ou image ou autre »).
//
// Contrats (validés avec Marc, roadmap chat B) :
//  - Le transcript persisté/synchronisé reste LÉGER (ADR-4) : seules les MÉTADONNÉES
//    (nom, type, taille) vivent dans `AiMessage.attachments`. Les OCTETS (base64/texte) ne vont
//    JAMAIS dans le store persisté ni dans le push Drive — ils vivent dans un cache mémoire de
//    session, keyé par l'id du message (B2 les déplacera en fichiers Drive appdata séparés).
//  - Conséquence honnête : après un rechargement de page, le contenu d'une pièce jointe n'est plus
//    disponible pour les questions de suivi (la puce reste visible ; le modèle est prévenu).
//  - SÉCURITÉ : le contenu d'un fichier TEXTE est une DONNÉE non fiable (même classe que
//    VISION_INJECTION_GUARD) → balises de cadre neutralisées avant insertion dans le prompt ;
//    le nom de fichier est borné/sanitized (il entre dans le prompt comme titre).
//
// Pur (aucun store, aucun réseau) → testable. Seul import lourd : AUCUN (types Anthropic effacés).

import type Anthropic from '@anthropic-ai/sdk';
import { neutralizeFrameTags, sanitizePromptText } from '../../utils/promptSafety';
import { logError } from '../errorLogger';

export type AiAttachmentKind = 'image' | 'pdf' | 'text';

/** Métadonnées LÉGÈRES persistables dans le transcript (jamais les octets). */
export interface AiAttachmentMeta {
    name: string;
    kind: AiAttachmentKind;
    mimeType: string;
    /** Taille en octets du fichier source. */
    size: number;
}

/** Payload complet EN MÉMOIRE DE SESSION (jamais persisté) : méta + contenu. */
export interface AiAttachmentPayload extends AiAttachmentMeta {
    /** Base64 du binaire (image/pdf) — absent pour un fichier texte. */
    data?: string;
    /** Contenu brut d'un fichier texte — absent pour image/pdf. */
    text?: string;
}

// Bornes honnêtes (l'API Anthropic accepte 5 Mo/image et ~32 Mo/requête ; on reste en dessous
// pour garder des envois rapides et un coût de tokens raisonnable sur la clé BYOK).
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 Mo (limite API par image)
// ⚠️ Proxy IMPARFAIT de la vraie contrainte API (~100 pages) : un PDF texte dense de 10 Mo peut
// dépasser 100 pages et échouer côté API malgré la validation locale (finding panel ai-reviewer).
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1 * 1024 * 1024;    // 1 Mo de texte ≈ largement au-delà d'un CSV utile
// Budget AGRÉGÉ par message (finding panel ÉLEVÉ) : la limite API est ~32 Mo par REQUÊTE et le
// base64 gonfle de ×4/3 — valider chaque fichier ne suffit pas (3 PDF de 10 Mo passent un à un
// mais font ~40 Mo encodés → rejet API générique après coup). 20 Mo bruts ≈ 27 Mo base64, marge saine.
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Somme des octets d'un lot de fichiers/payloads (pour le budget agrégé). */
export function totalAttachmentBytes(files: Array<{ size: number }>): number {
    return files.reduce((s, f) => s + (f.size || 0), 0);
}

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXT_MIMES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'json', 'tsv', 'log']);

/** Liste `accept` pour l'<input type=file> (source unique UI ↔ validation). */
export const ATTACHMENT_ACCEPT = [
    ...IMAGE_MIMES, 'application/pdf', ...TEXT_MIMES, '.txt', '.csv', '.md', '.tsv', '.log',
].join(',');

export type ClassifyResult =
    | { ok: true; kind: AiAttachmentKind; mimeType: string }
    | { ok: false; reason: string };

const extOf = (name: string): string => {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
};

const mb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;

/**
 * Classifie + valide UN fichier (allowlist de types + bornes de taille). Appelée à la SÉLECTION
 * (l'UI refuse immédiatement avec un message honnête — un fichier invalide n'entre jamais dans
 * les puces d'envoi).
 */
export function classifyAttachment(file: { name: string; type: string; size: number }): ClassifyResult {
    const mime = (file.type || '').toLowerCase();
    // Plancher : un fichier de 0 octet (scan cassé, téléchargement partiel) produirait un base64
    // VIDE → bloc droppé → le tour utilisateur ENTIER disparaissait de l'historique modèle pendant
    // que la puce s'affichait comme analysée (finding panel CRITIQUE, prouvé par sonde).
    if ((file.size || 0) === 0) {
        return { ok: false, reason: `${file.name} : fichier vide (0 octet) — rien à analyser.` };
    }
    if (IMAGE_MIMES.has(mime)) {
        if (file.size > MAX_IMAGE_BYTES) {
            return { ok: false, reason: `${file.name} : image trop lourde (${mb(file.size)} > ${mb(MAX_IMAGE_BYTES)}).` };
        }
        return { ok: true, kind: 'image', mimeType: mime };
    }
    if (mime === 'application/pdf' || extOf(file.name) === 'pdf') {
        if (file.size > MAX_PDF_BYTES) {
            return { ok: false, reason: `${file.name} : PDF trop lourd (${mb(file.size)} > ${mb(MAX_PDF_BYTES)}).` };
        }
        return { ok: true, kind: 'pdf', mimeType: 'application/pdf' };
    }
    if (TEXT_MIMES.has(mime) || TEXT_EXTENSIONS.has(extOf(file.name))) {
        if (file.size > MAX_TEXT_BYTES) {
            return { ok: false, reason: `${file.name} : fichier texte trop lourd (${mb(file.size)} > ${mb(MAX_TEXT_BYTES)}).` };
        }
        return { ok: true, kind: 'text', mimeType: TEXT_MIMES.has(mime) ? mime : 'text/plain' };
    }
    return { ok: false, reason: `${file.name} : type non supporté (images PNG/JPEG/WebP/GIF, PDF, texte/CSV seulement).` };
}

/** ArrayBuffer → base64 par TRANCHES (pas de spread géant qui exploserait la pile sur un PDF de 10 Mo). */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/**
 * Lit un fichier VALIDÉ (classifyAttachment ok) en payload de session. Throw sur échec de lecture
 * (l'appelant journalise et refuse l'envoi honnêtement — jamais un envoi partiel silencieux).
 */
export async function readAttachment(file: File): Promise<AiAttachmentPayload> {
    const cls = classifyAttachment(file);
    if (!cls.ok) throw new Error(cls.reason);
    const meta: AiAttachmentMeta = { name: file.name, kind: cls.kind, mimeType: cls.mimeType, size: file.size };
    if (cls.kind === 'text') {
        return { ...meta, text: await file.text() };
    }
    return { ...meta, data: arrayBufferToBase64(await file.arrayBuffer()) };
}

/**
 * Construit le contenu MULTIMODAL d'un tour utilisateur : blocs pièces jointes PUIS le texte.
 * - image → bloc `image` base64 ;
 * - pdf → bloc `document` base64 (l'API lit texte + mise en page) ;
 * - texte/CSV → bloc `document` source texte, balises de cadre NEUTRALISÉES (contenu non fiable —
 *   un CSV exporté peut contenir une consigne adversariale) + titre sanitizé.
 * Le texte utilisateur doit déjà être passé par neutralizeFrameTags (contrat de l'appelant, H3).
 */
export function buildUserContent(
    neutralizedText: string,
    attachments: AiAttachmentPayload[],
): Anthropic.ContentBlockParam[] {
    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const a of attachments) {
        // Garde par TYPE + longueur, jamais par truthiness seule : un base64 VIDE ('') passait la
        // truthiness et droppait le bloc EN SILENCE — combiné à un envoi sans texte, le tour
        // utilisateur ENTIER disparaissait de l'historique modèle pendant que la puce s'affichait
        // comme analysée (finding panel CRITIQUE, prouvé par sonde ; aussi bloqué en amont par le
        // plancher 0 octet de classifyAttachment).
        if (a.kind === 'image' && typeof a.data === 'string' && a.data.length > 0) {
            blocks.push({
                type: 'image',
                source: { type: 'base64', media_type: a.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: a.data },
            });
        } else if (a.kind === 'pdf' && typeof a.data === 'string' && a.data.length > 0) {
            blocks.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: a.data },
                title: sanitizePromptText(a.name, 120) || 'document.pdf',
            });
        } else if (a.kind === 'text' && typeof a.text === 'string') {
            blocks.push({
                type: 'document',
                source: { type: 'text', media_type: 'text/plain', data: neutralizeFrameTags(a.text) },
                title: sanitizePromptText(a.name, 120) || 'document.txt',
            });
        } else {
            // Payload incohérent (kind sans contenu) : la méta reste visible dans la bulle, le
            // modèle ne reçoit rien de fabriqué — mais JAMAIS en silence.
            logError({
                source: 'ai', severity: 'warning',
                message: `Chat in-app : pièce jointe « ${sanitizePromptText(a.name, 80)} » sans contenu exploitable — omise du message au modèle.`,
            });
        }
    }
    if (neutralizedText.trim() !== '') blocks.push({ type: 'text', text: neutralizedText });
    return blocks;
}

// ── Cache MÉMOIRE DE SESSION des payloads, par id de message ─────────────────────────────────────
// Niveau module (survit aux remontages du provider) ; JAMAIS persisté ni synchronisé. Après un
// reload, le cache est vide → l'historique reconstruit retombe sur le texte seul + une note
// honnête « pièce jointe non disponible » (le modèle ne reçoit jamais un contenu fabriqué).

const _sessionAttachments = new Map<string, AiAttachmentPayload[]>();

export function cacheAttachments(messageId: string, payloads: AiAttachmentPayload[]): void {
    if (payloads.length > 0) _sessionAttachments.set(messageId, payloads);
}

/**
 * Éviction (finding panel MOYEN ×2) : un payload dont le message est sorti de la fenêtre
 * d'historique (HISTORY_WINDOW) ne sera PLUS JAMAIS relu — sans purge, une longue session à
 * gros PDF accumule des dizaines de Mo morts en mémoire (classe « déborner sans purge »,
 * AUTH-DRIVE-PERSIST). Appelée à chaque envoi avec les ids encore VIVANTS.
 */
export function pruneAttachmentCache(aliveMessageIds: Iterable<string | undefined>): void {
    const alive = new Set([...aliveMessageIds].filter((id): id is string => Boolean(id)));
    for (const key of _sessionAttachments.keys()) {
        if (!alive.has(key)) _sessionAttachments.delete(key);
    }
}

export function getCachedAttachments(messageId: string | undefined): AiAttachmentPayload[] | undefined {
    return messageId ? _sessionAttachments.get(messageId) : undefined;
}

/** Reset (tests + Effacer la conversation — les payloads d'une conversation effacée sont libérés). */
export function clearAttachmentCache(): void {
    _sessionAttachments.clear();
}

/** Note honnête ajoutée au tour quand des pièces jointes ne sont PLUS en mémoire (post-reload). */
export function unavailableAttachmentsNote(metas: AiAttachmentMeta[]): string {
    const names = metas.map((m) => sanitizePromptText(m.name, 80) || m.kind).join(', ');
    return `[Pièces jointes de ce message (${names}) envoyées dans une session précédente — contenu non disponible ; demande à l'utilisateur de les rejoindre si nécessaire.]`;
}
