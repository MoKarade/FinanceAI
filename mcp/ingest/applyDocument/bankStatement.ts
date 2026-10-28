// mcp/ingest/applyDocument/bankStatement.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import type { AppState, Transaction } from '../../../types';
import { isValidIsoDate } from '../../../utils/isoDate';
import { RULE_CATEGORIES, buildCategoryCanonicalMap, resolveCandidateCategory } from '../../../services/import/categoryRules';
import type { ApplyResult, BankStatementPayload, Change } from './types';
import { MAX_TXN_AMOUNT, plausible } from './commun';

// ── Relevé bancaire (transactions + dédup) ───────────────────────────────────
const txnKey = (t: { date: string; amount: number; payee: string }): string =>
    `${t.date}|${Math.round((t.amount || 0) * 100)}|${String(t.payee || '').trim().toLowerCase()}`;

/**
 * [MCP-CATEGORY-ALLOWLIST] Jeu canonique des catégories acceptées à l'ÉCRITURE : les postes de
 * budget EXISTANTS + les catégories des règles (`RULE_CATEGORIES`). La catégorie du tool MCP est
 * du TEXTE LIBRE écrit par l'IA : hors allowlist, elle entrerait dans le rapprochement fuzzy
 * partagé (réel/moyenne/grand livre) et pourrait être absorbée par un poste au nom englobant
 * (« Sport » ⊂ « Tran-sport ») SANS trace (finding silent-failure-hunter PR #501). Inconnue →
 * règles déterministes sur le payee, sinon « Non catégorisé » — et le résumé le DIT.
 * Postes APRÈS RULE_CATEGORIES : en cas de collision de clé normalisée (poste « épicerie » vs
 * canonique « Épicerie »), le POSTE gagne — c'est la cible réelle de réconciliation du Budget
 * (priorité documentée + testée, finding code-reviewer PR #502).
 */
function buildCategoryAllowlist(state: AppState): Map<string, string> {
    return buildCategoryCanonicalMap([
        ...RULE_CATEGORIES,
        ...(state.budgetItems ?? []).map((item) => item?.name ?? ''),
    ]);
}

export function applyBankStatement(state: AppState, doc: BankStatementPayload): ApplyResult {
    const existing = (state.transactions ?? []) as Transaction[];
    // [FINTABLE-DOUBLON-INTRALOT-SILENCIEUX] finding financial-integrity, MESURÉ : `seen` unique
    // confondait deux cas de nature différente — un doublon contre l'EXISTANT (bénin sur le chemin
    // automatisé, le recouvrement légitime est déjà écarté en amont par la bascule anti-doublon,
    // 0 collision mesurée sur 60 jours) et un doublon INTRA-LOT (deux lignes DISTINCTES du même lot
    // entrant qui partagent la même clé) — qui, lui, désigne le plus souvent deux dépenses RÉELLES
    // identiques le même jour (mesuré : 3 cafés à 4,25 $, 1 seul écrit, 8,50 $ perdus en silence,
    // `cashAnchorDelta` absorbe l'écart). Deux ensembles séparés pour pouvoir avertir sur le second
    // sans déclencher une alarme permanente sur le premier.
    const existingKeys = new Set(existing.map(txnKey));
    const seenThisLot = new Set<string>();
    let maxId = existing.reduce((m, t) => Math.max(m, t.id || 0), 0);
    const allowedCategories = buildCategoryAllowlist(state);

    const added: Transaction[] = [];
    let dupCount = 0; // TOTAL (existant + intra-lot) — préserve le libellé `dupPhrase` existant
    let dupIntraLotCount = 0; // sous-ensemble SUSPECT de dupCount, voir commentaire ci-dessus
    let rejCount = 0; // montant aberrant (D9)
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Compteur SÉPARÉ de `rejCount` : les deux causes de rejet ne
    // sont pas la même information pour l'appelant (un montant aberrant n'est pas une date invalide),
    // et les fusionner sous « aberrant » rendrait le résumé FAUX sur un rejet de date.
    let rejDateCount = 0;
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] finding silent-failure-hunter (ÉLEVÉ) : cette garde filtrait
    // trois cas (ligne absente, montant non numérique, date absente) sans compter AUCUN d'eux — un
    // lot où TOUTES les lignes ont ce défaut rendait `added.length === 0` et un résumé littéralement
    // « aucune nouvelle transaction. », sans dire qu'il y avait N lignes soumises et rejetées.
    let rejMalformedCount = 0;
    let remapCount = 0;
    for (const tx of doc.transactions ?? []) {
        if (!tx || typeof tx.amount !== 'number' || !tx.date) { rejMalformedCount++; continue; }
        // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Garde runtime symétrique à `applyBankStatement.spec.ts` —
        // un appel direct (hors passerelle MCP) contourne Zod, leçon MCP-WHATIF. Sans elle, une date
        // hors calendrier (`2026-02-30`) ou mal formée passait telle quelle jusqu'au grand livre.
        if (!isValidIsoDate(tx.date)) { rejDateCount++; continue; }
        if (!plausible(tx.amount, MAX_TXN_AMOUNT)) { rejCount++; continue; } // D9 : montant aberrant ignoré
        const k = txnKey(tx);
        // ⚠️ `callerClassified` : le rattrapage a déjà tranché, avec un invariant d'appariement
        // unique que cette clé annulerait en supprimant les dépenses réelles surnuméraires.
        if (!doc.callerClassified) {
            if (existingKeys.has(k)) { dupCount++; continue; } // déjà présent — bénin (recouvrement)
            if (seenThisLot.has(k)) { dupCount++; dupIntraLotCount++; continue; } // déjà ajouté CE LOT — suspect
        }
        seenThisLot.add(k);
        // [TX-CATEGORY-RULES] + [MCP-CATEGORY-ALLOWLIST] Catégorie fournie ACCEPTÉE seulement si
        // canonique (remap vers la casse canonique) ; inconnue ou absente → règles déterministes
        // sur le payee (mêmes règles que l'import CSV de l'app — cohérence app↔MCP), sinon
        // « Non catégorisé » (l'IA de l'app peut re-passer dessus). Un remap est COMPTÉ (résumé).
        const resolvedCat = resolveCandidateCategory(tx.category, allowedCategories, tx.payee || '', 'Non catégorisé');
        if (resolvedCat.remapped) remapCount++;
        added.push({
            id: ++maxId,
            date: tx.date,
            payee: tx.payee || '',
            amount: tx.amount,
            category: resolvedCat.category,
            status: 'processed',
            isTransfer: !!tx.isTransfer,
            // ⚠️ Propagé SEULEMENT s'il est vrai : ajouter `isDuplicate: false` partout changerait
            // la forme de toutes les transactions écrites par tous les autres appelants.
            ...(tx.isDuplicate ? { isDuplicate: true } : {}),
            // [TX-TRANSFERS] Le compte de la LIGNE prime sur celui du document : un lot Fintable
            // couvre plusieurs comptes, alors qu'un relevé PDF n'en couvre qu'un.
            ...(tx.accountName || doc.accountName
                ? { accountName: tx.accountName || doc.accountName }
                : {}),
        });
    }

    const changes: Change[] = [];
    if (added.length) {
        changes.push({
            field: 'transactions',
            before: existing.length,
            after: existing.length + added.length,
            note: `+${added.length} ajoutée(s)${dupCount ? `, ${dupCount} doublon(s) ignoré(s)` : ''}`,
        });
    }
    const nextState: AppState = added.length
        ? { ...state, transactions: [...existing, ...added], lastUpdate: Date.now() }
        : state;
    // [BUDGET-DUPCOUNT-MESSAGE-FAUX] finding code-reviewer : chaque segment est une PHRASE nue (sans
    // séparateur), jointe plus bas par `, ` — l'ancienne construction préfixait chaque segment par
    // `, ` littéral, ce qui laissait une virgule orpheline en tête dès que `dupCount === 0` mais un
    // AUTRE rejet existait (`(, 1 montant(s) aberrant(s) ignoré(s))`).
    const dupPhrase = dupCount ? `${dupCount} doublon(s) ignoré(s)` : '';
    // [FINTABLE-DOUBLON-INTRALOT-SILENCIEUX] Signal SÉPARÉ (pas fusionné dans `dupPhrase`) : un
    // doublon intra-lot est SUSPECT (deux lignes distinctes du même lot, probablement deux vraies
    // dépenses identiques) alors qu'un doublon contre l'existant est un recouvrement bénin — les
    // fusionner sous « doublon(s) ignoré(s) » masquerait le seul cas qui mérite d'être vérifié.
    const dupIntraLotPhrase = dupIntraLotCount
        ? `${dupIntraLotCount} doublon(s) SUSPECT(s) au sein du même lot (vérifier s'il s'agit de dépenses distinctes)`
        : '';
    const rejPhrase = rejCount ? `${rejCount} montant(s) aberrant(s) ignoré(s)` : '';
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Message SÉPARÉ (pas fusionné dans `rejPhrase`) : une date
    // invalide n'est pas un montant aberrant, et un appelant qui lit « aberrant » sur un rejet de
    // date en tirerait la mauvaise conclusion (il vérifierait ses montants, jamais son format de date).
    const rejDatePhrase = rejDateCount ? `${rejDateCount} date(s) invalide(s) ignorée(s)` : '';
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] finding financial-integrity (FAIBLE) : la garde compte 3
    // causes (ligne absente, montant non numérique, date manquante) — libellé générique plutôt que
    // d'en nommer 2 sur 3 et laisser croire qu'une ligne `null`/non-objet a une « date manquante ».
    const rejMalformedPhrase = rejMalformedCount
        ? `${rejMalformedCount} ligne(s) invalide(s) ou incomplète(s) ignorée(s)`
        : '';
    // [MCP-CATEGORY-ALLOWLIST] Signal honnête : un remap silencieux serait la classe
    // « staleness/attribution silencieuse » — l'appelant doit savoir que ses catégories
    // inventées ont été re-catégorisées par les règles.
    const remapPhrase = remapCount
        ? `${remapCount} catégorie(s) non canonique(s) re-catégorisée(s) par les règles`
        : '';
    const rejectionPhrases = [dupPhrase, dupIntraLotPhrase, rejPhrase, rejDatePhrase, rejMalformedPhrase, remapPhrase].filter(Boolean);
    const summary = added.length
        ? `Relevé bancaire : ${added.length} transaction(s) ajoutée(s)${rejectionPhrases.length ? `, ${rejectionPhrases.join(', ')}` : ''}.`
        : `Relevé bancaire : aucune nouvelle transaction${rejectionPhrases.length ? ` (${rejectionPhrases.join(', ')})` : ''}.`;
    // [MCP-REJECTIONS-NON-STRUCTUREES] PAS `dupCount` — voir le JSDoc de `rejectedCount` sur
    // `ApplyResult` pour la raison MESURÉE (pas juste supposée bénigne).
    const rejectedCount = rejCount + rejDateCount + rejMalformedCount;
    return {
        nextState, changes, summary,
        ...(rejectedCount > 0 ? { rejectedCount } : {}),
        ...(dupIntraLotCount > 0 ? { dupIntraLotCount } : {}),
    };
}
