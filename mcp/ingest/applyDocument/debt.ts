// mcp/ingest/applyDocument/debt.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import { DEBT_KINDS } from '../../../types';
import type { AppState, Debt } from '../../../types';
import { isValidIsoDate } from '../../../utils/isoDate';
import { formatCAD } from '../../../utils/format';
import type { ApplyResult, Change, DebtPayload } from './types';
import { MAX_DEBT_BALANCE, MAX_INTEREST_RATE, MAX_MONTHLY_PAYMENT, plausible } from './commun';

// ── Dette (prêt auto, carte, perso…) — ajout OU mise à jour par nom ──────────
// ⚠️ [DEBT-MCP-PARITE, 2026-08-21] Ce commentaire affirmait « les dettes n'ont PAS de date de
// début » — FAUX depuis `[DETTE-DATES]` (2026-08-19) : `Debt.startDate`/`termEndDate` existent et
// sont servis par le moteur (`debtSchedule.ts`). Ce tool reste réservé aux dettes DÉJÀ
// CONTRACTÉES (le solde fourni doit être réel AUJOURD'HUI) ; `startDate` sert à dater une dette
// contractée dans le PASSÉ (pour que le graphe Futur ne la montre pas avant son vrai début) ou
// SIGNÉE mais dont le premier paiement est encore à venir — pas à modéliser un achat hypothétique,
// qui reste le rôle de `simulate_what_if`.

/** Clé de dédup/mise à jour : nom normalisé (le retry d'un même ajout ne duplique pas). */
const debtKey = (name: string): string => String(name || '').trim().toLowerCase();

/** [DEBT-MCP-PARITE] Date complète exigée (contrairement à `GOAL_DEADLINE_RE` plus permissif) :
 *  une date de dette vient d'un document réel (contrat, relevé) ou d'une saisie DebtManager
 *  (`<input type="date">`), toujours au jour près — jamais un YYYY-MM approximatif. Validation
 *  CALENDAIRE (pas seulement le format) : `utils/isoDate.ts`, source unique partagée avec le
 *  schéma Zod du tool MCP (`applyDebt.spec.ts`) — voir sa doc pour le piège `2026-13-01`. */

/** Catégorie inférée du nom quand absente (auto/études/carte → sinon Personal).
 *  Accents strippés une fois (« véhicule » matche `vehic`) ; les mots COURTS sont ancrés `\b…\b` —
 *  faux positifs prouvés par le panel 2026-07-15 : « Chargex »/« recharge » matchaient `char` nu. */
function inferDebtCategory(name: string): Debt['category'] {
    const n = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (/auto|voiture|vehic|camion|\bchar\b|\bcar\b|\bmoto\b/.test(n)) return 'Car';
    if (/etud|student|scolaire/.test(n)) return 'Student';
    if (/carte|\bcard\b|visa|mastercard|amex/.test(n)) return 'CreditCard';
    return 'Personal';
}

export function applyDebt(state: AppState, doc: DebtPayload): ApplyResult {
    const name = String(doc.name || '').trim();
    if (!name) throw new Error('Nom de dette requis (ex. « Prêt auto Honda »).');

    // Bornes de plausibilité (D9) — le contenu vient de l'IA : toute valeur FOURNIE aberrante/non
    // finie est REJETÉE en bloc (pas d'écriture partielle d'une dette corrompue). Les 3 champs $
    // sont optionnels (mise à jour PARTIELLE d'une dette existante — jamais forcer l'IA à inventer
    // un chiffre) mais « si fourni, alors valide ». Ceinture : le schéma Zod du tool a déjà
    // .finite(), mais un appel direct du handler bypasse Zod (leçon MCP-WHATIF).
    if (doc.balance != null && (!plausible(doc.balance, MAX_DEBT_BALANCE) || doc.balance <= 0)) {
        throw new Error(`Solde de dette invalide/aberrant (${doc.balance}). Rien n'a été écrit.`);
    }
    if (doc.interestRate != null && (!plausible(doc.interestRate, MAX_INTEREST_RATE) || doc.interestRate < 0)) {
        throw new Error(`Taux d'intérêt invalide/aberrant (${doc.interestRate} %). Rien n'a été écrit.`);
    }
    if (doc.minimumPayment != null && (!plausible(doc.minimumPayment, MAX_MONTHLY_PAYMENT) || doc.minimumPayment < 0)) {
        throw new Error(`Paiement mensuel invalide/aberrant (${doc.minimumPayment}). Rien n'a été écrit.`);
    }
    if (doc.amortizationYears != null && (!Number.isFinite(doc.amortizationYears) || doc.amortizationYears <= 0 || doc.amortizationYears > 50)) {
        throw new Error(`Amortissement invalide (${doc.amortizationYears} ans). Rien n'a été écrit.`);
    }
    // [DEBT-MCP-PARITE] Même ceinture que balance/interestRate : `kind` est un ENUM Zod côté tool,
    // mais l'IMPORT PDF (`applyDebt` appelé directement, sans passer par le schéma Zod du tool MCP —
    // même leçon MCP-WHATIF que ci-dessus) peut fournir n'importe quelle chaîne. Un `kind` inconnu
    // est REJETÉ plutôt que silencieusement accepté (il pilote `debtAmortization`/l'allowlist à
    // venir — un kind halluciné y serait invisible, pas juste cosmétique).
    if (doc.debtKind != null && !DEBT_KINDS.includes(doc.debtKind)) {
        throw new Error(`Type de dette inconnu (${doc.debtKind}). Valeurs valides : ${DEBT_KINDS.join(', ')}. Rien n'a été écrit.`);
    }
    if (doc.startDate != null && !isValidIsoDate(doc.startDate)) {
        throw new Error(`Date de début invalide (${doc.startDate}), format attendu YYYY-MM-DD (date calendaire réelle). Rien n'a été écrit.`);
    }
    if (doc.termEndDate != null && !isValidIsoDate(doc.termEndDate)) {
        throw new Error(`Date de fin invalide (${doc.termEndDate}), format attendu YYYY-MM-DD (date calendaire réelle). Rien n'a été écrit.`);
    }
    // [DEBT-MCP-ORIGINALBALANCE] Même ceinture que `balance` : borne, finitude, strictement positif.
    // Le schéma Zod du tool est la BRETELLE ; l'import PDF appelle `applyDocument` sans lui.
    if (doc.originalBalance != null && (!plausible(doc.originalBalance, MAX_DEBT_BALANCE) || doc.originalBalance <= 0)) {
        throw new Error(`Montant emprunté invalide/aberrant (${doc.originalBalance}). Rien n'a été écrit.`);
    }

    const debts = (state.debts ?? []).map((d) => ({ ...d })) as Debt[];
    const changes: Change[] = [];
    const category = doc.category ?? inferDebtCategory(name);

    const existingIdx = debts.findIndex((d) => debtKey(d.name) === debtKey(name));
    // [DEBT-MCP-PARITE, ÉLEVÉ revue] La cohérence chronologique doit se vérifier sur les valeurs
    // EFFECTIVES (après fusion avec la dette déjà stockée), jamais sur le seul payload courant :
    // une mise à jour PARTIELLE qui ne touche que `termEndDate` (l'autre date restant celle déjà
    // en base) contournait la garde précédente (comparaison payload-seul) — mesuré : une dette
    // dont `startDate` reste au FUTUR et `termEndDate` bascule au PASSÉ n'est alors JAMAIS
    // 'active' (phases 'a-venir' → 'terminee' sans jamais passer par 'active'), donc jamais payée
    // ni comptée au bilan avant de réapparaître d'un bloc à `startDate`.
    const existingForDates = existingIdx >= 0 ? debts[existingIdx] : undefined;
    const effectiveStart = doc.startDate ?? existingForDates?.startDate;
    const effectiveEnd = doc.termEndDate ?? existingForDates?.termEndDate;
    if (effectiveStart != null && effectiveEnd != null && effectiveEnd < effectiveStart) {
        throw new Error(`La date de fin (${effectiveEnd}) précède la date de début (${effectiveStart}). Rien n'a été écrit.`);
    }
    // [DEBT-MCP-ORIGINALBALANCE] Cohérence `originalBalance >= balance`, sur les valeurs EFFECTIVES
    // (après fusion avec la dette déjà stockée) et JAMAIS sur le seul payload — exactement la leçon
    // que la garde de dates trois lignes plus haut a déjà payée : une mise à jour PARTIELLE qui ne
    // touche QUE `originalBalance` laisse `balance` en base, donc une comparaison payload-seul ne
    // compare rien. Une dette dont le montant emprunté est INFÉRIEUR au solde actuel a GROSSI : ce
    // n'est pas un profil d'amortissement, `amortirDettePassee` la refuserait en silence
    // (`origine-incoherente`). Refuser À L'ÉCRITURE dit POURQUOI, au moment où c'est corrigeable.
    const effectiveOriginal = doc.originalBalance ?? existingForDates?.originalBalance;
    const effectiveBalance = doc.balance ?? existingForDates?.balance;
    if (effectiveOriginal != null && effectiveBalance != null && effectiveOriginal < effectiveBalance) {
        throw new Error(`Le montant emprunté (${formatCAD(effectiveOriginal)}) est INFÉRIEUR au solde actuel `
            + `(${formatCAD(effectiveBalance)}) : une dette qui a grossi n'a pas de profil d'amortissement. `
            + `Vérifie les deux chiffres sur le contrat. Rien n'a été écrit.`);
    }
    if (existingIdx >= 0) {
        // MISE À JOUR par nom (idempotent : re-soumettre la même dette ne crée pas de doublon).
        // Un champ ABSENT est laissé intact (mise à jour partielle) — et donc jamais EFFAÇABLE via
        // ce tool une fois posé (choix assumé, style additif : effacer = geste UI DebtManager).
        const d = debts[existingIdx];
        const apply = (field: keyof Debt, after: unknown): void => {
            const before = d[field];
            if (before === after || after == null) return;
            changes.push({ field: `debts[${existingIdx}].${String(field)}`, before, after });
            (d as unknown as Record<string, unknown>)[String(field)] = after;
        };
        apply('balance', doc.balance);
        apply('interestRate', doc.interestRate);
        apply('minimumPayment', doc.minimumPayment);
        if (doc.category) apply('category', doc.category);
        apply('amortizationYears', doc.amortizationYears);
        apply('rateProvider', doc.rateProvider);
        apply('kind', doc.debtKind);
        apply('startDate', doc.startDate);
        apply('termEndDate', doc.termEndDate);
        apply('originalBalance', doc.originalBalance);
        const nextState: AppState = { ...state, debts, lastUpdate: Date.now() };
        const summary = changes.length
            ? `Dette « ${d.name} » mise à jour : ${changes.length} champ(s).`
            : `Dette « ${d.name} » : aucune modification (valeurs déjà à jour).`;
        return { nextState, changes, summary };
    }

    // AJOUT : les 3 champs financiers redeviennent REQUIS (pas de dette incomplète — l'optionnel
    // ne vaut que pour la mise à jour partielle d'une dette existante).
    const { balance, interestRate, minimumPayment } = doc;
    if (balance == null || interestRate == null || minimumPayment == null) {
        throw new Error(`Dette « ${name} » introuvable : pour l'AJOUTER, balance + interestRate + ` +
            `minimumPayment sont tous requis (l'omission n'est permise qu'en mise à jour d'une dette existante). Rien n'a été écrit.`);
    }
    const newDebt: Debt = {
        // Suffixe aléatoire anti-collision même-milliseconde ; le préfixe debt_ distingue de la
        // convention DebtManager (Date.now().toString()) → aucun chevauchement entre les 2 sources.
        id: `debt_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`,
        name,
        balance,
        interestRate,
        minimumPayment,
        category,
        ...(doc.amortizationYears != null ? { amortizationYears: doc.amortizationYears } : {}),
        ...(doc.rateProvider ? { rateProvider: doc.rateProvider } : {}),
        ...(doc.debtKind != null ? { kind: doc.debtKind } : {}),
        ...(doc.startDate != null ? { startDate: doc.startDate } : {}),
        ...(doc.termEndDate != null ? { termEndDate: doc.termEndDate } : {}),
        ...(doc.originalBalance != null ? { originalBalance: doc.originalBalance } : {}),
    };
    debts.push(newDebt);
    changes.push({
        field: `debts[+${debts.length - 1}]`,
        before: null,
        after: { name, balance, interestRate, minimumPayment, category },
        note: doc.category ? undefined : `catégorie inférée du nom : ${category}`,
    });
    const nextState: AppState = { ...state, debts, lastUpdate: Date.now() };
    // [DEBT-MCP-PARITE, ÉLEVÉ revue] Ce résumé (relu par l'assistant ET affiché à l'aperçu de
    // consentement, `_writeHelper.ts`) affirmait TOUJOURS « servie dès maintenant » — faux dès que
    // `startDate` est dans le futur : la dette est alors ABSENTE du patrimoine du jour (exclue de
    // `activeDebtsTotal`) jusqu'à cette date, contredisant la description du tool ET la phrase
    // elle-même. `today` au même format YYYY-MM-DD que `doc.startDate` (comparaison lexicographique
    // valide sur ce format) — même patron que `applyBankStatement` plus haut dans ce fichier.
    const today = new Date().toISOString().slice(0, 10);
    const debutDifferencie = doc.startDate != null && doc.startDate > today
        ? `Débute le ${doc.startDate} (absente du patrimoine avant cette date).`
        : 'Servie dès maintenant par la projection.';
    const summary = `Dette « ${name} » ajoutée (${category}) : solde ${formatCAD(balance)}, ${interestRate} %, ` +
        `paiement ${formatCAD(minimumPayment)}/mois. ${debutDifferencie}`;
    return { nextState, changes, summary };
}
