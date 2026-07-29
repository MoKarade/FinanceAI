#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
// scripts/fintableDry.ts — [FINTABLE Lot 1] Dry-run de LECTURE, ZÉRO écriture.
//
// Usage (PowerShell) :
//   $env:FINTABLE_TOKEN="<jeton lecture seule>" ; npm run fintable:dry
//   $env:FINTABLE_TOKEN="<jeton>" ; npm run fintable:dry -- --days 90 --show-amounts
//
// Par DÉFAUT le rapport ne contient AUCUN montant ni libellé de marchand : seulement des comptes,
// des structures et des compteurs. C'est voulu — la sortie est ainsi sûre à recoller dans un chat
// pour diagnostic. `--show-amounts` lève ce voile pour un usage local uniquement.
//
// Ce script n'écrit rien : ni dans l'état FinanceAI, ni dans Drive, ni chez Fintable (que des GET).

import { FintableClient } from '../services/fintable/client';
import { readFintableSnapshot } from '../services/fintable/readSnapshot';
import { FintableError } from '../services/fintable/types';

interface Args { days: number; showAmounts: boolean; includeDisabled: boolean }

function parseArgs(argv: string[]): Args {
    const out: Args = { days: 30, showAmounts: false, includeDisabled: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--days') {
            const n = Number(argv[i + 1]);
            if (!Number.isFinite(n) || n <= 0) throw new Error('--days attend un nombre de jours positif.');
            out.days = Math.floor(n);
            i++;
        } else if (argv[i] === '--show-amounts') {
            out.showAmounts = true;
        } else if (argv[i] === '--include-disabled') {
            out.includeDisabled = true;
        }
    }
    return out;
}

function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Masque un montant sauf si l'utilisateur a demandé explicitement à le voir. */
function money(n: number | null, show: boolean): string {
    if (n === null) return '(absent)';
    return show ? n.toFixed(2) : '•••';
}

async function main(): Promise<void> {
    const token = process.env.FINTABLE_TOKEN;
    if (!token) {
        console.error('FINTABLE_TOKEN absent de l\'environnement. Crée un jeton LECTURE SEULE dans Dashboard → API.');
        process.exitCode = 2;
        return;
    }
    const args = parseArgs(process.argv.slice(2));
    const to = new Date();
    const from = new Date(to.getTime() - args.days * 86_400_000);

    const client = new FintableClient({ token });
    console.log(`Lecture Fintable — ${args.days} derniers jours (${isoDay(from)} → ${isoDay(to)})`);
    console.log(args.showAmounts ? 'Montants : AFFICHÉS (usage local)' : 'Montants : MASQUÉS (sortie partageable)');
    console.log('');

    const snap = await readFintableSnapshot(client, {
        dateFrom: isoDay(from),
        dateTo: isoDay(to),
        includeDisabled: args.includeDisabled,
    });

    console.log(`COMPTES (${snap.accounts.length})`);
    for (const a of snap.accounts) {
        console.log(
            `  - ${a.label} [${a.currency}] type="${a.rawType}" solde=${money(a.balance, args.showAmounts)}`
            + ` dernière_tx=${a.lastTxDate ?? '(aucune)'} actif=${a.enabled}`,
        );
    }

    console.log('');
    const bySnapshotDate = new Set(snap.holdings.map((h) => h.snapshotDate ?? '(sans date)'));
    console.log(`POSITIONS (${snap.holdings.length}) — snapshot(s) : ${[...bySnapshotDate].join(', ') || '(aucun)'}`);
    for (const h of snap.holdings) {
        console.log(
            `  - ${h.symbol ?? '(sans symbole)'} « ${h.name} » [${h.currency}]`
            + ` qté=${h.quantity ?? '(absent)'} prix=${money(h.price, args.showAmounts)}`
            + ` valeur=${money(h.value, args.showAmounts)} coût_TOTAL=${money(h.costBasisTotal, args.showAmounts)}`,
        );
    }
    if (snap.holdingsSkipped.length > 0) {
        console.log(`  Comptes sans positions lues (${snap.holdingsSkipped.length}) :`);
        for (const s of snap.holdingsSkipped) console.log(`    - ${s.accountId} : ${s.reason}`);
    }

    console.log('');
    console.log(`TRANSACTIONS (${snap.transactions.length}, pending exclues par contrat)`);
    const perAccount = new Map<string, number>();
    const categories = new Map<string, number>();
    let uncategorized = 0;
    const currencies = new Set<string>();
    for (const t of snap.transactions) {
        perAccount.set(t.accountId, (perAccount.get(t.accountId) ?? 0) + 1);
        currencies.add(t.currency);
        if (t.categoryName) categories.set(t.categoryName, (categories.get(t.categoryName) ?? 0) + 1);
        else uncategorized++;
    }
    const labelOf = new Map(snap.accounts.map((a) => [a.id, a.label]));
    for (const [accId, n] of perAccount) console.log(`  - ${labelOf.get(accId) ?? accId} : ${n}`);
    console.log(`  Devises rencontrées : ${[...currencies].join(', ') || '(aucune)'}`);
    console.log(`  Non catégorisées : ${uncategorized}`);
    console.log(`  Catégories Fintable distinctes (${categories.size}) :`);
    for (const [name, n] of [...categories].sort((a, b) => b[1] - a[1])) {
        console.log(`    - ${name} : ${n}`);
    }

    if (snap.transactions.length > 0) {
        const dates = snap.transactions.map((t) => t.date).sort();
        console.log(`  Étendue de dates : ${dates[0]} → ${dates[dates.length - 1]}`);
    }

    console.log('');
    console.log('Aucune écriture effectuée (lecture seule).');
}

main().catch((err: unknown) => {
    if (err instanceof FintableError) {
        console.error(`Échec [${err.code}] : ${err.message}`);
        if (err.isTransient) console.error('Erreur transitoire — réessaie dans quelques minutes.');
    } else {
        console.error(`Échec inattendu : ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exitCode = 1;
});
