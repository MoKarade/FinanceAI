// services/assetProfileSync.ts
//
// [INVEST-ALLOC-GEO-SECTOR] Auto-remplissage des champs `Asset.sector`/`Asset.region` depuis le
// profil provider (Finnhub profile2), pour les actifs dont la résolution est 'unknown' (ni champ
// persisté, ni seed, ni crypto) — répare les donuts « tout en Autre » sans saisie manuelle quand
// le provider connaît le titre. Pattern hydrateAssetHistories :
//  - séquentiel + pacing (provider le plus strict, leçon PERF-BOOT-RATELIMIT) ;
//  - patches par symbole appliqués sur l'état FRAIS (anti-course pull Drive/édition) ;
//  - n'écrit QUE l'information UTILE : un profil au secteur 'Autre'/région 'Global' (les défauts
//    du mapping) n'est PAS persisté — écrire un défaut figerait la résolution en source 'asset'
//    et bloquerait un meilleur remplissage futur (édition inline ou provider enrichi) ;
//  - JAMAIS d'écrasement d'un champ déjà présent (l'édition de l'utilisateur prime).

import type { Asset } from '../types';
import type { AssetProfile } from './marketData';
import { resolveAssetMeta } from './assetMeta';
import { logError } from './errorLogger';

interface ProfileSyncDeps {
    getProfile: (symbol: string) => Promise<AssetProfile | null>;
    /** Un provider de PROFIL existe-t-il ? (pas de repli Yahoo ici — Finnhub seulement). */
    hasProvider?: (symbol: string) => boolean;
    sleep?: (ms: number) => Promise<void>;
    delayMs?: number;
}

type ProfilePatch = { sector?: string; region?: string };

const DEFAULT_DELAY_MS = 2_500;

export async function hydrateAssetProfiles(
    assets: readonly Asset[],
    deps: ProfileSyncDeps,
): Promise<Map<string, ProfilePatch>> {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const delayMs = deps.delayMs ?? DEFAULT_DELAY_MS;
    const patches = new Map<string, ProfilePatch>();
    let calls = 0;
    for (const a of assets ?? []) {
        if (!a?.symbol || (a.quantity || 0) <= 0) continue;
        if (resolveAssetMeta(a).source !== 'unknown') continue; // déjà résolu (champ/seed/crypto)
        const profileSymbol = a.historySymbol || a.symbol;
        if (deps.hasProvider && !deps.hasProvider(profileSymbol)) continue; // pas de provider → pas de no-op payé
        if (calls > 0) await sleep(delayMs);
        calls++;
        try {
            const p = await deps.getProfile(profileSymbol);
            if (!p) continue; // provider muet (titre non couvert) → reste 'Autre', éditable inline
            const patch: ProfilePatch = {};
            if (p.sector && p.sector !== 'Autre') patch.sector = p.sector;
            if (p.region && p.region !== 'Global') patch.region = p.region;
            if (patch.sector || patch.region) patches.set(a.symbol, patch);
        } catch (e) {
            // Défense par itération (contrat « ne rejette jamais » non garanti structurellement).
            logError({ source: 'network', severity: 'warning', message: `Profil de ${a.symbol} en échec (répartitions inchangées).`, error: e instanceof Error ? e : new Error(String(e)) });
        }
    }
    return patches;
}

/** Applique les patches sur l'état FRAIS, sans JAMAIS écraser un champ déjà présent. */
export function applyProfilePatches(assets: readonly Asset[], patches: Map<string, ProfilePatch>): Asset[] {
    if (patches.size === 0) return [...assets];
    return assets.map((a) => {
        const p = patches.get(a.symbol);
        if (!p) return a;
        const next: Asset = { ...a };
        if (p.sector && !a.sector) next.sector = p.sector;
        if (p.region && !a.region) next.region = p.region;
        return next;
    });
}
