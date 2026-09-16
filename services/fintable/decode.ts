// services/fintable/decode.ts
//
// [FINTABLE Lot 1] Décodage STRICT des réponses de l'API Fintable vers notre modèle normalisé.
//
// Pourquoi des décodeurs écrits à la main plutôt qu'un schéma Zod : ce chemin est money-critical et
// l'erreur doit NOMMER le champ fautif (`transactions[12].amount`) pour être diagnosticable depuis
// un cron serveur. Un `.parse()` qui jette « invalid input » sur un payload de 500 transactions
// n'aide personne à 3 h du matin.
//
// Règle non négociable (classe NAN-INPUT-HARDENING) : une valeur monétaire NON FINIE ne devient
// JAMAIS 0 en silence. Soit elle est ABSENTE et vaut `null` (absence honnête), soit elle est
// présente-mais-illisible et c'est une `FintableError('MALFORMED')` — pas un chiffre fabriqué.

import {
    FintableError,
    type FintableAccount,
    type FintableHolding,
    type FintableTransaction,
    type FtRawAccount,
    type FtRawHolding,
    type FtRawTransaction,
} from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Montant OBLIGATOIRE (« Money is a string » — chaîne décimale exacte).
 * ⚠️ `Number('')` vaut 0 et `Number(null)` vaut 0 : on refuse donc explicitement tout ce qui n'est
 * pas une chaîne non vide AVANT la conversion, sinon un champ vide deviendrait un montant de 0 $.
 */
export function parseMoneyRequired(value: unknown, field: string): number {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new FintableError(
            `Champ « ${field} » : montant attendu sous forme de chaîne décimale, reçu ${describe(value)}.`,
            'MALFORMED',
        );
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
        throw new FintableError(
            `Champ « ${field} » : montant illisible (non fini) — la valeur brute n'est pas un décimal.`,
            'MALFORMED',
        );
    }
    return n;
}

/** Montant OPTIONNEL : `null`/`undefined` → `null` (absence honnête, jamais 0). */
export function parseMoneyOptional(value: unknown, field: string): number | null {
    if (value === null || value === undefined) return null;
    return parseMoneyRequired(value, field);
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value === '') {
        throw new FintableError(
            `Champ « ${field} » : chaîne non vide attendue, reçu ${describe(value)}.`,
            'MALFORMED',
        );
    }
    return value;
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

/** Ne révèle JAMAIS la valeur elle-même (un montant/description est une donnée privée). */
function describe(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'un tableau';
    return `un ${typeof value}`;
}

/** `YYYY-MM-DD` strict — un format inattendu fausserait tout le rapprochement par date. */
function requireDate(value: unknown, field: string): string {
    const s = requireString(value, field);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        throw new FintableError(
            `Champ « ${field} » : date au format YYYY-MM-DD attendue.`,
            'MALFORMED',
        );
    }
    return s;
}

export function decodeAccount(raw: unknown, index: number): FintableAccount {
    if (!isRecord(raw)) {
        throw new FintableError(`accounts[${index}] : objet attendu, reçu ${describe(raw)}.`, 'MALFORMED');
    }
    const a = raw as unknown as FtRawAccount;
    const display = optionalString(a.display_name);
    return {
        id: requireString(a.id, `accounts[${index}].id`),
        connectionId: requireString(a.connection_id, `accounts[${index}].connection_id`),
        // Le nom personnalisé prime — c'est celui que Marc voit dans ses feuilles.
        label: display ?? requireString(a.name, `accounts[${index}].name`),
        rawType: typeof a.type === 'string' ? a.type : '',
        currency: requireString(a.currency, `accounts[${index}].currency`),
        balance: parseMoneyOptional(a.balance, `accounts[${index}].balance`),
        balanceAvailable: parseMoneyOptional(a.balance_available, `accounts[${index}].balance_available`),
        lastTxDate: optionalString(a.last_tx_date),
        // `enabled` absent → on considère le compte ACTIF (défaut sûr : on préfère lire un compte
        // de trop que d'en manquer un en silence ; le filtrage explicite se fait chez l'appelant).
        enabled: a.enabled !== false,
    };
}

export function decodeHolding(
    raw: unknown,
    index: number,
    accountId: string,
    snapshotDate: string | null,
): FintableHolding {
    if (!isRecord(raw)) {
        throw new FintableError(`holdings[${index}] : objet attendu, reçu ${describe(raw)}.`, 'MALFORMED');
    }
    const h = raw as unknown as FtRawHolding;
    return {
        id: requireString(h.id, `holdings[${index}].id`),
        accountId,
        name: requireString(h.name, `holdings[${index}].name`),
        symbol: optionalString(h.symbol),
        quantity: parseMoneyOptional(h.quantity, `holdings[${index}].quantity`),
        price: parseMoneyOptional(h.price, `holdings[${index}].price`),
        value: parseMoneyOptional(h.value, `holdings[${index}].value`),
        // ⚠️ TOTAL, pas unitaire — le nom du champ le dit pour empêcher la confusion en aval.
        costBasisTotal: parseMoneyOptional(h.cost_basis, `holdings[${index}].cost_basis`),
        currency: requireString(h.currency, `holdings[${index}].currency`),
        snapshotDate,
    };
}

/**
 * [FINTABLE-CHAMPS-INCONNUS] Clés d'une transaction que notre CONTRAT déclare (`FtRawTransaction`).
 *
 * ⚠️ Pourquoi cette liste existe, et pourquoi elle est LITTÉRALE : `FtRawTransaction` a été écrit
 * d'après la DOC de l'API, jamais d'après un payload observé — et `decodeTransaction` reconstruit
 * l'objet champ par champ, donc **tout ce que l'API envoie en plus est jeté sans trace**. C'est
 * exactement le trou par lequel est passé `[FINTABLE-MONTANT-EN-DEVISE-ORIGINALE]` : le montant
 * arrive dans la devise d'ORIGINE (mesuré : +2 537,31 $ sur 44 transactions au Brésil) pendant que
 * `currency` porte la devise du COMPTE, et personne ne pouvait dire si l'API fournissait, ailleurs
 * dans le même objet, de quoi le corriger. Un type TypeScript disparaît à l'exécution : seule une
 * liste de chaînes peut répondre à « qu'est-ce qu'on jette ? ». Elle est tenue alignée sur le type
 * par `tests/services/fintable/champsInconnus.test.ts`, qui la DÉRIVE du source de `types.ts`.
 *
 * ⚠️ Ce n'est PAS une liste blanche de sécurité : une clé inconnue n'est jamais une erreur, elle ne
 * fait rien refuser. C'est un INVENTAIRE — il rend visible ce que le décodeur ignore.
 */
export const CLES_TRANSACTION_DECLAREES: readonly string[] = [
    'id', 'account_id', 'date', 'datetime', 'auth_date', 'amount', 'currency', 'description',
    'merchant', 'pending', 'category', 'category_manual_override', 'created_at', 'updated_at',
];

/** Nombre maximal de noms cités dans un avertissement — le COMPTE, lui, est toujours exact. */
export const MAX_CLES_CITEES = 12;

/**
 * Union TRIÉE des clés présentes dans les payloads bruts et absentes de `declarees`.
 *
 * Pure, tolérante (une entrée non-objet est ignorée : le décodeur, lui, la refusera avec un message
 * qui nomme son index) et bornée par construction — le résultat a la taille du VOCABULAIRE de
 * l'API, jamais celle de la page de transactions.
 */
export function clesInconnues(
    raws: readonly unknown[],
    declarees: readonly string[] = CLES_TRANSACTION_DECLAREES,
): string[] {
    const connues = new Set(declarees);
    const vues = new Set<string>();
    for (const raw of raws) {
        if (!isRecord(raw)) continue;
        for (const cle of Object.keys(raw)) {
            if (!connues.has(cle)) vues.add(cle);
        }
    }
    return [...vues].sort();
}

/** Un champ hors contrat, avec quelques VALEURS observées — pour trancher s'il sert à quelque chose. */
export interface EchantillonCleInconnue {
    cle: string;
    /** Valeurs observées, TRONQUÉES et bornées. Jamais l'ensemble : c'est un échantillon, pas un dump. */
    exemples: string[];
}

/** Longueur max d'une valeur citée. Un mémo bancaire peut porter un nom complet ou une adresse. */
const MAX_LONGUEUR_EXEMPLE = 48;
/** Exemples par clé. Deux suffisent à voir un FORMAT ; davantage est de la donnée personnelle en plus. */
const MAX_EXEMPLES_PAR_CLE = 2;

/**
 * [FINTABLE-EXTERNAL-MEMO-PISTE-DEVISE] Échantillon des VALEURS des champs hors contrat.
 *
 * `clesInconnues` rend les NOMS — assez pour savoir qu'un champ existe, pas pour savoir s'il sert.
 * La question ouverte pendant que 44 montants étaient faux était : « l'API dit-elle la devise RÉELLE
 * quelque part ? ». Aucun des 5 champs ne s'appelle « currency », mais `external_memo` est du texte
 * libre — c'est là que des banques écrivent « USD 4.40 @ 1.37 ». Un nom ne peut pas répondre ; une
 * valeur, oui.
 *
 * ⚠️⚠️ **CETTE SORTIE NE DOIT JAMAIS ENTRER DANS `report.warnings`.** Le rapport de synchro est rendu
 * dans `SystemView` SANS gate de mode discret ET `cat`é en clair dans les journaux GitHub Actions
 * d'un dépôt **PUBLIC** (`[FINTABLE-RAPPORT-EN-CLAIR-DANS-UN-JOURNAL-PUBLIC]`). Un mémo bancaire peut
 * porter un nom, un numéro de chèque, une adresse. Décision de Marc (2026-09-16) : « oui, à l'écran
 * seulement ». Une garde de test vérifie cette séparation — elle n'est pas laissée à la vigilance.
 *
 * Bornée DEUX fois (nombre de clés, nombre et longueur des exemples) : la taille du résultat suit le
 * VOCABULAIRE de l'API, jamais le volume de la page.
 */
export function echantillonsClesInconnues(
    raws: readonly unknown[],
    declarees: readonly string[] = CLES_TRANSACTION_DECLAREES,
    maxCles: number = MAX_CLES_CITEES,
): EchantillonCleInconnue[] {
    const connues = new Set(declarees);
    const parCle = new Map<string, string[]>();
    for (const raw of raws) {
        if (!isRecord(raw)) continue;
        for (const [cle, valeur] of Object.entries(raw)) {
            if (connues.has(cle)) continue;
            const deja = parCle.get(cle) ?? [];
            if (deja.length >= MAX_EXEMPLES_PAR_CLE) continue;
            // `null`/`undefined` sont des NON-valeurs : les citer ferait croire à un champ rempli.
            if (valeur === null || valeur === undefined) continue;
            const brut = typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
            const texte = brut.length > MAX_LONGUEUR_EXEMPLE
                ? `${brut.slice(0, MAX_LONGUEUR_EXEMPLE)}…`
                : brut;
            if (texte.trim() === '') continue;
            if (deja.includes(texte)) continue;
            deja.push(texte);
            parCle.set(cle, deja);
        }
    }
    return [...parCle.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, Math.max(0, maxCles))
        .map(([cle, exemples]) => ({ cle, exemples }));
}

export function decodeTransaction(raw: unknown, index: number): FintableTransaction {
    if (!isRecord(raw)) {
        throw new FintableError(`transactions[${index}] : objet attendu, reçu ${describe(raw)}.`, 'MALFORMED');
    }
    const t = raw as unknown as FtRawTransaction;
    const category = isRecord(t.category) ? optionalString((t.category as { name?: unknown }).name) : null;
    return {
        id: requireString(t.id, `transactions[${index}].id`),
        accountId: requireString(t.account_id, `transactions[${index}].account_id`),
        date: requireDate(t.date, `transactions[${index}].date`),
        // Obligatoire par contrat : une transaction sans montant lisible est une donnée cassée,
        // pas une transaction à 0 $ (elle fausserait le solde dérivé).
        amount: parseMoneyRequired(t.amount, `transactions[${index}].amount`),
        currency: requireString(t.currency, `transactions[${index}].currency`),
        // `description` peut légitimement être vide chez certaines banques → on tolère la chaîne vide.
        description: typeof t.description === 'string' ? t.description : '',
        merchant: optionalString(t.merchant),
        categoryName: category,
        updatedAt: optionalString(t.updated_at),
    };
}
