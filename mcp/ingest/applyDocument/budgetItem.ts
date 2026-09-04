// mcp/ingest/applyDocument/budgetItem.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import type { AppState } from '../../../types';
import { formatCAD } from '../../../utils/format';
import { monthlyTargetOf } from '../../../utils/healthRatios';
import { matchCategoryToName } from '../../../utils/budget';
import type { ApplyResult, BudgetItemPayload, Change } from './types';
import { budgetNameKey, plausible } from './commun';

// ── Poste de budget — ajout OU mise à jour PARTIELLE par nom ─────────────────
// [MCP-DIRECT-EDIT Lot 2] Clé d'upsert = nom normalisé (casse/accents) contre les postes existants.
// ⚠️ Éditer la CIBLE pose `autoTarget: false` (BUDGET-TX-CATEGORIES : une édition manuelle décroche
// la cible auto-gérée, sinon la moyenne du passé écraserait la demande au prochain chargement).

const MAX_BUDGET_TARGET = 1_000_000;    // 1 M$ par période pour un poste de budget (au-delà = aberrant)

export function applyBudgetItem(state: AppState, doc: BudgetItemPayload): ApplyResult {
    const name = String(doc.name || '').trim();
    if (!name) throw new Error('Nom de poste de budget requis (ex. « Épicerie »).');
    if (doc.targetCad != null && (!plausible(doc.targetCad, MAX_BUDGET_TARGET) || doc.targetCad < 0)) {
        throw new Error('Cible de budget invalide ou aberrante (négative / non finie / hors bornes). Rien n\'a été écrit.');
    }
    // Garde ménage SOLO (leçon PH4E-OWNER-EDIT : tester le CONTENU, jamais la longueur du tuple
    // `users` qui vaut toujours 2) : « Perso 2 » sans 2ᵉ conjoint nommé disparaîtrait du breakdown
    // couple en silence → rejet honnête.
    if (doc.type === 'Perso 2' && !(state.config?.users?.[1]?.name ?? '').trim()) {
        throw new Error('Répartition « Perso 2 » impossible : aucun 2ᵉ conjoint configuré. Rien n\'a été écrit.');
    }

    const items = (state.budgetItems ?? []).map((b) => ({ ...b }));
    const changes: Change[] = [];
    const key = budgetNameKey(name);
    const idx = items.findIndex((b) => budgetNameKey(b.name) === key);

    // Doublons de noms équivalents (ex. « RESTAURANT » vs « Restaurant » importés d'un CSV) : le
    // premier est retenu — le signaler plutôt que de laisser croire à une mise à jour de l'autre.
    const twinCount = items.filter((b) => budgetNameKey(b.name) === key).length;
    const twinNote = twinCount > 1 ? ` ⚠️ ${twinCount} postes ont un nom équivalent — le premier a été retenu.` : '';
    // [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] `monthlyTargetOf` PROPAGE désormais une cible illisible
    // en `NaN` au lieu de l'absorber en `0` (c'est tout l'objet du correctif). Les diffs ci-dessous
    // lisent `b.target`, la cible DÉJÀ en état, que rien n'a validée — contrairement à
    // `doc.targetCad`, passé par `plausible()`. Sans ce formateur, la note montrée à l'utilisateur
    // avant qu'il confirme une écriture dirait littéralement « passe de NaN $ à X $ » : ni un
    // « 0 $ » faussement crédible (proscrit par le no-fake-data) ni un « — » honnête, juste une
    // fuite technique (finding code-reviewer, 2e passe panel PR #757).
    // [FMT-PROMPT-MIGRER] `formatCAD` sur la branche FINIE ; le libellé nommé reste sur l'autre
    // (le « — » nu de `formatCAD` se lirait comme une valeur par un modèle).
    const montantLabel = (n: unknown): string => (Number.isFinite(n) ? formatCAD(n) : '— (cible non exploitable)');
    const monthlyTargetLabel = (item: Parameters<typeof monthlyTargetOf>[0]): string => montantLabel(monthlyTargetOf(item));


    if (idx >= 0) {
        const b = items[idx];
        if (doc.targetCad != null && doc.targetCad !== b.target) {
            const freq = doc.frequency ?? b.frequency;
            changes.push({
                field: `poste « ${b.name} » (cible)`, before: b.target,
                after: `${formatCAD(doc.targetCad)} / ${freq} (≈ ${monthlyTargetLabel({ target: doc.targetCad, frequency: freq })}/mois)`,
                note: (b.autoTarget ? 'cible auto-gérée décrochée (édition manuelle)' : undefined),
            });
            b.target = doc.targetCad;
            b.autoTarget = false; // édition manuelle = décrochage de la cible auto (BUDGET-TX-CATEGORIES)
        }
        if (doc.frequency && doc.frequency !== b.frequency) {
            // ⚠️ Même DÉCROCHAGE que l'UI (Budget.tsx : target OU frequency) — finding ÉLEVÉ panel :
            // sans lui, le refresh auto réécrit une moyenne MENSUELLE dans un poste devenu Yearly
            // (cible mensuelle effective ÷12, +épargne fabriquée dans toute la projection).
            changes.push({
                field: `poste « ${b.name} » (fréquence)`, before: b.frequency, after: doc.frequency,
                note: `la cible mensuelle effective passe de ${monthlyTargetLabel(b)} à `
                    + `${monthlyTargetLabel({ target: b.target, frequency: doc.frequency })} (cible inchangée : ${montantLabel(b.target)})`,
            });
            b.frequency = doc.frequency;
            b.autoTarget = false;
        }
        if (doc.nature && doc.nature !== b.nature) {
            changes.push({ field: `poste « ${b.name} » (nature)`, before: b.nature, after: doc.nature });
            b.nature = doc.nature;
        }
        if (doc.type && doc.type !== b.type) {
            changes.push({ field: `poste « ${b.name} » (répartition)`, before: b.type, after: doc.type });
            b.type = doc.type;
        }
        if (changes.length === 0) {
            return { nextState: state, changes: [], summary: `Poste « ${b.name} » : aucune modification (valeurs identiques).${twinNote}` };
        }
        const nextState: AppState = { ...state, budgetItems: items, lastUpdate: Date.now() };
        return { nextState, changes, summary: `Poste de budget « ${b.name} » mis à jour (${changes.length} champ(s)).${twinNote}` };
    }

    // AJOUT : la cible est requise (jamais inventer un montant pour l'utilisateur).
    if (doc.targetCad == null) {
        throw new Error(`Poste « ${name} » introuvable : pour l'AJOUTER, la cible (targetCad) est requise.`);
    }
    const added = {
        id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, // horodaté (convention PERSONA-PURGE)
        name,
        target: doc.targetCad,
        frequency: doc.frequency ?? 'Monthly' as const,
        type: doc.type ?? 'Commun' as const,
        nature: doc.nature ?? 'Besoin' as const,
        autoTarget: false, // cible posée explicitement par l'utilisateur — pas auto-gérée
    };
    items.push(added);
    // [Finding ÉLEVÉ panel] Le sync budget (Lot C : postes ≡ catégories OBSERVÉES) RETIRE au prochain
    // chargement tout poste dont le nom ne rapproche aucune catégorie de transactions (même règle
    // fuzzy que budgetSync : `matchCategoryToName` cat→nom). Prévenir AVANT plutôt que laisser le
    // poste s'évaporer en silence après un « ajouté ✓ ».
    const observedCats = Array.from(new Set(
        (state.transactions ?? []).map((t) => (t.category || '').trim()).filter(Boolean),
    ));
    const matchesObserved = observedCats.some((cat) => matchCategoryToName(cat, [name]) !== undefined);
    const orphanNote = matchesObserved
        ? undefined
        : `⚠️ aucune transaction de catégorie « ${name} » : le poste sera RETIRÉ au prochain chargement de l'app tant qu'aucune dépense ne s'y rattache (le budget suit les catégories observées).`;
    changes.push({
        field: `poste « ${name} »`, before: null,
        after: `${formatCAD(added.target)} / ${added.frequency} (≈ ${monthlyTargetLabel(added)}/mois)`,
        note: orphanNote ?? 'nouveau poste — rapproché des dépenses réelles de la catégorie du même nom (un nom proche peut être auto-renommé vers la catégorie observée)',
    });
    const nextState: AppState = { ...state, budgetItems: items, lastUpdate: Date.now() };
    return {
        nextState, changes,
        summary: `Poste de budget « ${name} » ajouté (${formatCAD(added.target)} / ${added.frequency}, ${added.nature}, ${added.type}).`
            + (orphanNote ? ` ${orphanNote}` : ''),
    };
}
