// services/fintable/mapSnapshot.ts
//
// [FINTABLE Lot 2] Mapper PUR : `FintableSnapshot` → `DocumentPayload[]` pour `applyDocument`.
//
// Aucun accès réseau, aucune écriture, aucune dépendance à l'état de l'app : une fonction pure,
// donc entièrement testable. C'est le Lot 3 (cron) qui passera ces payloads à `runApply` (OCC +
// sauvegarde horodatée).
//
// ⚠️ PIÈGE N°1 — LA DÉDUP NE PROTÈGE PAS DU RECOUVREMENT AVEC L'IMPORT MANUEL.
// `applyDocument` déduplique sur `date|montant_en_cents|payee_minuscule` (`txnKey`). Or le `payee`
// de Fintable (`merchant`/`description`, ex. « BLUE BOTTLE COFFEE ») ne sera PAS la même chaîne que
// celui extrait des relevés PDF importés à la main. Même date, même montant, libellé différent →
// clé différente → **doublon accepté en silence**. Et un doublon fausse `computeStartingCash` ET
// les dépenses réelles du Budget. La fenêtre Fintable (30 jours mesurés) RECOUVRE l'historique
// manuel : le risque est réel, pas théorique.
// → Parade : `transactionsAfter` (date de bascule). On ne mappe que ce qui est STRICTEMENT après la
//   dernière transaction déjà connue. Pas de recouvrement = pas de dépendance à la dédup. La dédup
//   reste la ceinture, la date de bascule est la bretelle.
//
// ⚠️ PIÈGE N°2 — ON NE DEVINE JAMAIS LE RÔLE D'UN COMPTE.
// `Account.type` est du texte libre (« display it, don't switch on it »). Un compte sans rôle
// explicite est SIGNALÉ dans le rapport, jamais rangé par défaut : ranger une carte de crédit dans
// les liquidités gonflerait le patrimoine du montant dû, et l'inverse le raboterait.
//
// ⚠️ Les POSITIONS ne sont pas mappées : Disnat n'est pas couvert par SnapTrade chez Fintable
// (mesuré 2026-07-29, annuaire public), donc aucune position ne remonte. Les comptes de placement
// ont le rôle `investment` : leur solde sert de valeur de RÉFÉRENCE du courtier, pas de source.

import type { BankStatementPayload, CashBalancePayload, DebtPayload, DocumentPayload } from '../../mcp/ingest/applyDocument';
import type { FintableSnapshot, FintableTransaction } from './types';
import { detectInternalTransfers, type TransferPair } from './detectTransfers';

/**
 * [FINTABLE-6] Régime fiscal d'un compte de placement. Déclaré par Marc dans le fichier de rôles,
 * jamais deviné depuis `Account.type` (texte libre côté Fintable : « display it, don't switch on it »).
 * Détermine dans quel panier l'écart courtier (solde réel − Σ titres saisis) est ventilé — s'y tromper
 * fausserait l'impôt de toute la projection, pas seulement un affichage.
 *
 * ⚠️ Les valeurs sont EXACTEMENT celles de `RegisteredAccountType` (`types.ts`) — surtout pas une
 * graphie parallèle type `NON_ENREGISTRE` : deux formats pour la même notion, c'est la table de
 * lookup morte en silence de [[INVEST-ALLOC-GEO-SECTOR]]. Ce module reste sans dépendance (mapper
 * PUR), donc la parité est verrouillée par test plutôt que par un import.
 */
export type FintableTaxRegime = 'CELI' | 'REER' | 'NON-ENREG';

/**
 * SOURCE UNIQUE des valeurs acceptées, à l'exécution. Tout message de remède et toute validation
 * en DÉRIVENT (`join(' | ')`) au lieu de re-taper la liste : une graphie re-codée à côté finit
 * toujours par diverger — et ici le prix est lourd, un `taxRegime` invalide fait `throw` dans
 * `parseRolesJson`, donc `process.exit(1)` du serveur MCP ENTIER au démarrage (pas seulement la
 * sync). Classe [[MCP-CATEGORY-ALLOWLIST]] : « les listes des messages se dérivent de la source
 * unique, jamais re-codées ».
 */
export const FINTABLE_TAX_REGIMES: readonly FintableTaxRegime[] = ['CELI', 'REER', 'NON-ENREG'];

/** Rôle d'un compte Fintable dans FinanceAI. Toujours EXPLICITE (cf. piège n°2). */
export type FintableAccountRole =
    /** Compte courant / épargne → son solde entre dans les liquidités, ses transactions sont importées. */
    | { kind: 'cash' }
    /** Carte de crédit → son solde met à jour une DETTE ; ses transactions sont des dépenses. */
    | { kind: 'debt'; debtName: string }
    /**
     * Compte de placement → son SOLDE fait autorité (positions hors de portée, cf FINTABLE-POSITIONS).
     * `taxRegime` est OPTIONNEL et n'est JAMAIS inféré (règle : « le type fiscal CELI/REER/NON-ENREG
     * ne s'infère jamais — c'est une table pilotée par Marc »). Absent → le solde est quand même
     * enregistré (référence + affichage), mais l'écart courtier ne peut pas être ventilé dans le bon
     * panier fiscal → il est SIGNALÉ plutôt que rangé au hasard. Dégradation gracieuse voulue : un
     * régime manquant ne doit pas faire échouer toute la passe (leçon « isolation par payload »).
     */
    | { kind: 'investment'; taxRegime?: FintableTaxRegime }
    /** Explicitement ignoré. */
    | { kind: 'ignore' };

export interface FintableMappingConfig {
    /** Rôle PAR ID de compte Fintable. Un id absent → compte signalé « sans rôle », jamais deviné. */
    roles: Record<string, FintableAccountRole>;
    /**
     * Date de bascule `YYYY-MM-DD` : seules les transactions STRICTEMENT postérieures sont mappées.
     * En pratique = la date de la dernière transaction déjà présente dans FinanceAI. `null` =
     * aucune borne (à n'utiliser que sur un état vierge — sinon doublons, cf. piège n°1).
     */
    transactionsAfter: string | null;
    /** Devise de l'app. Toute transaction dans une AUTRE devise est écartée et signalée. */
    baseCurrency?: string;
    /**
     * [FINTABLE-TRANSFERS] Fenêtre (jours) pour apparier un paiement de carte : la sortie du compte
     * de liquidités et l'entrée sur le compte de dette. Défaut 3. `0` désactive de fait
     * l'appariement au-delà du même jour ; passer `-1` ne le désactive PAS (borné à 0) — pour
     * désactiver, ne donner à aucun compte le rôle `debt`.
     */
    transferToleranceDays?: number;
}

export interface FintableMappingReport {
    /** Transactions retenues, et pourquoi les autres ne le sont pas. */
    transactions: {
        mapped: number;
        skippedBeforeCutover: number;
        skippedForeignCurrency: number;
        skippedUnroutedAccount: number;
        skippedInvestmentAccount: number;
    };
    /** Solde de liquidités visé (somme des comptes `cash`), ou `null` si indéterminable. */
    cashTargetCad: number | null;
    /** Comptes `cash` dont le solde est absent → la cible serait fausse, donc on ne l'émet pas. */
    cashAccountsMissingBalance: string[];
    /** Dettes mises à jour (nom → solde dû). */
    debts: Array<{ name: string; balanceCad: number }>;
    /**
     * Comptes de placement : le solde du COURTIER, qui fait autorité sur le total du compte (choix
     * Marc 2026-07-30 — « utilise exactement le montant que j'ai dans Fintable »). Jamais converti en
     * titres : Fintable ne rend pas les positions (FINTABLE-POSITIONS, limite produit mesurée).
     * ⚠️ Clé stable = `accountId` (l'id Fintable), JAMAIS `label` — un compte renommé côté banque
     * casserait sinon tout appariement en silence (classe [[INVEST-ALLOC-GEO-SECTOR]] : « une table
     * de lookup dont le format de clé a dérivé est une table entièrement morte, sans erreur »).
     */
    investmentBalances: Array<{
        accountId: string;
        label: string;
        currency: string;
        balance: number | null;
        taxRegime?: FintableTaxRegime;
    }>;
    /** Comptes sans rôle assigné — À TRAITER, pas à ignorer. */
    accountsWithoutRole: Array<{ id: string; label: string; rawType: string }>;
    /** [FINTABLE-TRANSFERS] Paiements de carte reconnus : les 2 côtés sont marqués `isTransfer`. */
    transferPairs: TransferPair[];
    /** Avertissements destinés à l'humain (jamais silencieux). */
    warnings: string[];
}

export interface FintableMappingResult {
    payloads: DocumentPayload[];
    report: FintableMappingReport;
}

/** Le libellé le plus lisible dont on dispose pour une transaction. */
function payeeOf(tx: FintableTransaction): string {
    const merchant = tx.merchant?.trim();
    if (merchant) return merchant;
    const description = tx.description.trim();
    return description || '(sans libellé)';
}

export function mapFintableSnapshot(
    snapshot: FintableSnapshot,
    config: FintableMappingConfig,
): FintableMappingResult {
    const baseCurrency = (config.baseCurrency ?? 'CAD').toUpperCase();
    const warnings: string[] = [];

    const roleOf = (accountId: string): FintableAccountRole | null => config.roles[accountId] ?? null;

    // ── Comptes : rôles, soldes, signalements ───────────────────────────────────────────────────
    const accountsWithoutRole: FintableMappingReport['accountsWithoutRole'] = [];
    const cashAccountsMissingBalance: string[] = [];
    const investmentBalances: FintableMappingReport['investmentBalances'] = [];
    const debts: FintableMappingReport['debts'] = [];
    let cashTotal = 0;
    let cashAccountCount = 0;

    for (const account of snapshot.accounts) {
        const role = roleOf(account.id);
        if (role === null) {
            accountsWithoutRole.push({ id: account.id, label: account.label, rawType: account.rawType });
            continue;
        }
        switch (role.kind) {
            case 'cash': {
                cashAccountCount++;
                if (account.currency.toUpperCase() !== baseCurrency) {
                    // Additionner des devises sans conversion produirait un total FAUX, pas approximatif.
                    warnings.push(
                        `Compte « ${account.label} » est en ${account.currency} mais compte comme liquidités `
                        + `${baseCurrency} : conversion non implémentée → il est EXCLU du total.`,
                    );
                    cashAccountsMissingBalance.push(account.label);
                } else if (account.balance === null) {
                    cashAccountsMissingBalance.push(account.label);
                } else {
                    cashTotal += account.balance;
                }
                break;
            }
            case 'debt': {
                if (account.balance === null) {
                    warnings.push(`Dette « ${role.debtName} » : solde absent chez Fintable → non mise à jour.`);
                    break;
                }
                if (account.currency.toUpperCase() !== baseCurrency) {
                    warnings.push(
                        `Dette « ${role.debtName} » est en ${account.currency} : conversion non implémentée → non mise à jour.`,
                    );
                    break;
                }
                // Un solde de carte de crédit se lit « montant DÛ » : on le porte en positif, comme
                // `Debt.balance`. Un solde négatif signifie un crédit en ta faveur (paiement en trop) —
                // le porter tel quel donnerait une dette NÉGATIVE qui gonflerait le patrimoine.
                const owed = Math.abs(account.balance);
                if (account.balance < 0) {
                    // ⚠️ Le MONTANT n'est PAS interpolé ici (finding panel, PR #531) : ce warning finit
                    // dans FintableSyncReport.warnings, rendu sans gate mode discret dans SystemView.tsx
                    // ET dumpé en clair dans les logs GitHub Actions (fintable-sync.yml, `cat` du corps) —
                    // une surface plus persistante que l'app. Le vrai montant est déjà visible, gardé par
                    // le mode discret, dans Réglages → Dettes (via `debts.push({..., balanceCad: owed})`
                    // ci-dessous) : pas besoin de le répéter ici en clair.
                    warnings.push(
                        `Dette « ${role.debtName} » : solde négatif chez Fintable (crédit en ta faveur) `
                        + '→ interprété comme un montant dû (positif). Vérifie dans Réglages → Dettes.',
                    );
                }
                debts.push({ name: role.debtName, balanceCad: owed });
                break;
            }
            case 'investment': {
                // Le solde du courtier fait autorité — mais seulement s'il est LISIBLE et en CAD.
                // Mêmes règles que `cash`/`debt` : on ne convertit pas de devise, et un solde absent
                // ne devient JAMAIS 0 (un 0 crédible effacerait un compte entier du patrimoine).
                if (account.balance === null) {
                    warnings.push(
                        `Placement « ${account.label} » : solde absent chez Fintable → le montant du `
                        + 'courtier ne peut pas faire autorité pour ce compte (tes titres saisis restent utilisés).',
                    );
                } else if (account.currency.toUpperCase() !== baseCurrency) {
                    warnings.push(
                        `Placement « ${account.label} » est en ${account.currency} : conversion non `
                        + 'implémentée → montant du courtier IGNORÉ pour ce compte (tes titres saisis restent utilisés).',
                    );
                } else if (role.taxRegime === undefined) {
                    // Enregistré quand même (affichage/référence), mais l'écart ne sera pas ventilé :
                    // ranger un écart dans le mauvais panier fiscal fausserait l'impôt de la projection.
                    warnings.push(
                        `Placement « ${account.label} » : régime fiscal non déclaré → le montant du courtier `
                        + 's\'affiche, mais l\'écart avec tes titres n\'entre pas dans la projection. '
                        // Liste DÉRIVÉE de la source unique : re-taper les valeurs ici avait produit
                        // « NON_ENREGISTRE », que `parseRolesJson` REJETTE → suivre ce conseil aurait
                        // fait `process.exit(1)` du serveur MCP entier au démarrage suivant.
                        + `Ajoute "taxRegime": ${FINTABLE_TAX_REGIMES.map((r) => `"${r}"`).join(' | ')} `
                        + 'à ce compte dans le fichier de rôles.',
                    );
                }
                investmentBalances.push({
                    accountId: account.id,
                    label: account.label,
                    currency: account.currency,
                    balance: account.balance,
                    ...(role.taxRegime !== undefined ? { taxRegime: role.taxRegime } : {}),
                });
                break;
            }
            case 'ignore':
                break;
        }
    }

    if (accountsWithoutRole.length > 0) {
        warnings.push(
            `${accountsWithoutRole.length} compte(s) sans rôle assigné — ils sont IGNORÉS tant que tu n'as `
            + 'pas dit ce qu\'ils sont (liquidités / dette / placement). Rien n\'est deviné.',
        );
    }
    if (config.transactionsAfter === null) {
        warnings.push(
            'Aucune date de bascule : toutes les transactions de la fenêtre sont mappées. À n\'utiliser '
            + 'que sur un état VIERGE — sinon la dédup ne rattrapera pas les doublons de libellé différent.',
        );
    }

    // ── Transactions ────────────────────────────────────────────────────────────────────────────
    // [FINTABLE-TRANSFERS] Apparier AVANT le filtrage : le paiement de carte n'est reconnaissable
    // que si ses deux côtés sont visibles ensemble. (La borne de bascule s'applique ensuite aux
    // deux côtés de la même façon — ils portent la même date à quelques jours près.)
    const { transferIds, pairs: transferPairs } = detectInternalTransfers(
        snapshot.transactions, config.roles, config.transferToleranceDays,
    );

    // [TX-TRANSFERS] Nom de compte par transaction : c'est la seule preuve de « deux poches
    // différentes » côté app. Sans lui, l'appariement des virements internes de l'historique ne peut
    // que SUGGÉRER (jamais marquer d'office) — cf. services/transactions/detectTransfers.ts.
    const accountLabelById = new Map(snapshot.accounts.map((a) => [a.id, a.label]));

    const bankTransactions: BankStatementPayload['transactions'] = [];
    let skippedBeforeCutover = 0;
    let skippedForeignCurrency = 0;
    let skippedUnroutedAccount = 0;
    let skippedInvestmentAccount = 0;

    for (const tx of snapshot.transactions) {
        const role = roleOf(tx.accountId);
        if (role === null) { skippedUnroutedAccount++; continue; }
        if (role.kind === 'investment' || role.kind === 'ignore') { skippedInvestmentAccount++; continue; }
        // Comparaison lexicographique valide sur `YYYY-MM-DD` (format vérifié au décodage).
        if (config.transactionsAfter !== null && tx.date <= config.transactionsAfter) {
            skippedBeforeCutover++;
            continue;
        }
        if (tx.currency.toUpperCase() !== baseCurrency) { skippedForeignCurrency++; continue; }
        bankTransactions.push({
            date: tx.date,
            payee: payeeOf(tx),
            // Convention IDENTIQUE des deux côtés : négatif = argent sortant. Aucun changement de signe.
            amount: tx.amount,
            // Catégorie volontairement OMISE : `applyDocument` applique `ruleCategorize(payee)` —
            // les mêmes règles que l'import CSV de l'app. Passer une catégorie Fintable libre la
            // ferait re-mapper ou tomber en « Non catégorisé » (cf. MCP-CATEGORY-ALLOWLIST).
            ...(tx.categoryName ? { category: tx.categoryName } : {}),
            // [FINTABLE-TRANSFERS] Un paiement de carte n'est PAS une dépense : marqué transfert,
            // il sort des dépenses réelles (`budgetSync.ts:58`) et des revenus (`:37`).
            ...(transferIds.has(tx.id) ? { isTransfer: true } : {}),
            // [TX-TRANSFERS] Le compte porteur, persisté par transaction (un lot Fintable couvre
            // plusieurs comptes — le `accountName` du document ne peut pas les distinguer).
            ...(accountLabelById.get(tx.accountId)
                ? { accountName: accountLabelById.get(tx.accountId) }
                : {}),
        });
    }

    if (skippedForeignCurrency > 0) {
        warnings.push(
            `${skippedForeignCurrency} transaction(s) dans une devise ≠ ${baseCurrency} écartée(s) : `
            + 'la conversion n\'est pas implémentée et empiler des devises donnerait un total faux.',
        );
    }

    // ── Payloads ────────────────────────────────────────────────────────────────────────────────
    const payloads: DocumentPayload[] = [];

    if (bankTransactions.length > 0) {
        const bank: BankStatementPayload = { kind: 'bank_statement', transactions: bankTransactions };
        payloads.push(bank);
    }

    // Le solde de liquidités n'est émis QUE s'il est intégralement reconstituable : un compte `cash`
    // sans solde rendrait la cible fausse, et `cash_balance` écrit un DELTA sur `initialBalances`
    // — une cible fausse déplacerait durablement le cash de l'écart (silencieusement).
    let cashTargetCad: number | null = null;
    if (cashAccountCount > 0 && cashAccountsMissingBalance.length === 0) {
        cashTargetCad = cashTotal;
        const cash: CashBalancePayload = { kind: 'cash_balance', targetCad: cashTargetCad };
        payloads.push(cash);
    } else if (cashAccountsMissingBalance.length > 0) {
        warnings.push(
            `Solde de liquidités NON mis à jour : ${cashAccountsMissingBalance.length} compte(s) sans solde `
            + `exploitable (${cashAccountsMissingBalance.join(', ')}). Une cible partielle déplacerait le cash à tort.`,
        );
    }

    for (const debt of debts) {
        // Mise à jour PARTIELLE : ni taux ni paiement minimum (Fintable ne les fournit pas). Si la
        // dette n'existe pas encore, `applyDocument` la refusera — c'est voulu : inventer un taux
        // serait de la donnée fabriquée. Le rapport le dit explicitement.
        const payload: DebtPayload = { kind: 'debt', name: debt.name, balance: debt.balanceCad };
        payloads.push(payload);
    }
    if (debts.length > 0) {
        warnings.push(
            `${debts.length} dette(s) mise(s) à jour en SOLDE seulement (Fintable ne fournit ni taux ni `
            + 'paiement minimum). Elles doivent déjà exister dans FinanceAI avec leur taux — sinon la '
            + 'mise à jour est refusée plutôt que d\'inventer un taux.',
        );
    }

    return {
        payloads,
        report: {
            transactions: {
                mapped: bankTransactions.length,
                skippedBeforeCutover,
                skippedForeignCurrency,
                skippedUnroutedAccount,
                skippedInvestmentAccount,
            },
            cashTargetCad,
            cashAccountsMissingBalance,
            debts,
            investmentBalances,
            accountsWithoutRole,
            transferPairs,
            warnings,
        },
    };
}
