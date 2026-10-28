// scripts/mesureSources.mjs
//
// [PTF-L05B-MESURE-SOURCES] Mesure, depuis la CI, des sources de cours (Yahoo, EODHD gratuit) et de
// change (Banque du Canada) contre des ANCRES : clôtures publiques aux dates des relevés.
// Lancé par .github/workflows/mesure-sources.yml (manuel uniquement). Node ≥ 18 (fetch natif), aucune
// dépendance.
//
// Entrées (secrets, jamais dans le dépôt) :
//   MESURE_ANCRES — JSON { lignes: [{ yahoo, eodhd?, devise, ancres: { AAAA-MM-JJ: prix },
//                   ancreCourtier?: bool, fractionnement?: { date, ratio } }],
//                   taux?: { AAAA-MM-JJ: { USD, EUR } } }
//   EODHD_TOKEN   — optionnel : clé d'un compte EODHD GRATUIT.
// Sortie : des VERDICTS et des écarts relatifs, jamais un symbole, un prix ni un taux (journal public).
import {
    serieYahoo, serieEodhd, ecartAuxAncres, natureAvantFractionnement, verdictDevise, formaterVerdict, lireAncres,
} from './lib/mesureSources.mjs';

const PAUSE_MS = 1500; // Yahoo répond 429 aux rafales depuis les IP de cloud
const BUDGET_EODHD = 20; // appels/jour du plan gratuit
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const epoch = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);

async function lire(url, options) {
    try {
        const r = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) return { statut: `refusée (HTTP ${r.status})` };
        return { statut: 'ok', json: await r.json() };
    } catch (e) {
        return { statut: `injoignable (${e?.name ?? 'erreur'})` };
    }
}

function juger(serie, ligne) {
    const f = ligne.fractionnement;
    const avant = (d) => Boolean(f && d < f.date);
    const ecart = ecartAuxAncres(serie, ligne.ancres, avant);
    let fractionnement;
    if (f) {
        const dateAvant = Object.keys(ligne.ancres).filter(avant).sort()[0];
        fractionnement = dateAvant
            ? natureAvantFractionnement(serie[dateAvant], ligne.ancres[dateAvant], f.ratio)
            : 'aucune ancre avant la date';
    }
    return { ecart, fractionnement, ancreNonIndependante: Boolean(ligne.ancreCourtier) };
}

async function main() {
    const brut = process.env.MESURE_ANCRES;
    if (!brut) {
        console.error('::error::Secret MESURE_ANCRES absent (voir docs/A_FAIRE_MOI.md, [PTF-L05B-MESURE-SOURCES]).');
        process.exit(1);
    }
    const { lignes, taux } = lireAncres(brut);
    const dates = lignes.flatMap((l) => Object.keys(l.ancres)).sort();
    const du = dates[0];
    const au = dates[dates.length - 1];
    // Marge d'une semaine de part et d'autre : une ancre de fin de mois tombe parfois un jour chômé.
    const debut = epoch(du) - 7 * 86400;
    const fin = epoch(au) + 7 * 86400;

    console.log(`Mesure de ${lignes.length} lignes, ${new Set(dates).size} dates d'ancrage.`);
    console.log('--- Yahoo (chart v8, events=div,splits) ---');
    for (const [i, l] of lignes.entries()) {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(l.yahoo)}`
            + `?period1=${debut}&period2=${fin}&interval=1d&events=div%2Csplits`;
        const r = await lire(url, { headers: { 'User-Agent': 'Mozilla/5.0 (FinanceAI mesure)' } });
        const s = r.statut === 'ok' ? serieYahoo(r.json) : null;
        if (!s) {
            console.log(formaterVerdict(i + 1, 'Yahoo', { statut: r.statut === 'ok' ? 'réponse inexploitable' : r.statut }));
        } else {
            console.log(formaterVerdict(i + 1, 'Yahoo', {
                statut: 'ok',
                devise: verdictDevise(s.devise, l.devise),
                ...juger(s.serie, l),
                evenements: `événements rendus : ${s.dividendes} dividende(s), ${s.fractionnements} fractionnement(s)`,
            }));
        }
        await attendre(PAUSE_MS);
    }

    const cle = process.env.EODHD_TOKEN;
    console.log('--- EODHD (plan gratuit, champ close = brut) ---');
    if (!cle) {
        console.log('non mesuré : secret EODHD_TOKEN_MESURE absent');
    } else {
        let appels = 0;
        for (const [i, l] of lignes.entries()) {
            if (!l.eodhd) { console.log(`L${i + 1} · EODHD : pas de symbole fourni`); continue; }
            if (appels >= BUDGET_EODHD - 2) { console.log(`L${i + 1} · EODHD : non mesurée (budget de ${BUDGET_EODHD} appels)`); continue; }
            appels++;
            const url = `https://eodhd.com/api/eod/${encodeURIComponent(l.eodhd)}?fmt=json&from=${du}&to=${au}&api_token=${encodeURIComponent(cle)}`;
            const r = await lire(url);
            const s = r.statut === 'ok' ? serieEodhd(r.json) : null;
            console.log(s
                ? formaterVerdict(i + 1, 'EODHD', { statut: 'ok', ...juger(s.serie, l) })
                : formaterVerdict(i + 1, 'EODHD', { statut: r.statut === 'ok' ? 'réponse inexploitable' : r.statut }));
        }
        // Dividendes et fractionnements : UN symbole suffit à savoir si le plan gratuit y a accès.
        const temoin = lignes.find((l) => l.fractionnement && l.eodhd);
        if (temoin) {
            for (const api of ['splits', 'div']) {
                const r = await lire(`https://eodhd.com/api/${api}/${encodeURIComponent(temoin.eodhd)}?fmt=json&from=${du}&api_token=${encodeURIComponent(cle)}`);
                const n = r.statut === 'ok' && Array.isArray(r.json) ? r.json.length : null;
                console.log(`EODHD /${api} : ${r.statut === 'ok' ? `accessible (${n ?? '?'} événement(s))` : r.statut}`);
            }
        }
    }

    console.log('--- Banque du Canada (Valet) ---');
    if (!taux || Object.keys(taux).length === 0) {
        console.log('non mesuré : aucun taux d’ancrage fourni');
    } else {
        const r = await lire(`https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json?start_date=${du}&end_date=${au}`);
        if (r.statut !== 'ok') {
            console.log(`Valet : ${r.statut}`);
        } else {
            const obs = Object.fromEntries((r.json?.observations ?? []).map((o) => [o.d, o]));
            for (const [devise, serieId] of [['USD', 'FXUSDCAD'], ['EUR', 'FXEURCAD']]) {
                const serie = Object.fromEntries(Object.entries(obs).map(([d, o]) => [d, Number(o[serieId]?.v)]));
                const ancres = Object.fromEntries(Object.entries(taux).map(([d, t]) => [d, t[devise]]));
                const e = ecartAuxAncres(serie, ancres);
                console.log(`Valet ${devise}/CAD : écart max ${e.max === null ? '—' : `${e.max.toFixed(3).replace('.', ',')} %`} (${e.couvertes}/${e.attendues} dates)`);
            }
        }
    }
}

main().catch((e) => {
    // Le message d'une erreur de lecture du secret ne cite jamais son contenu.
    console.error(`::error::${e?.message ?? 'échec de la mesure'}`);
    process.exit(1);
});
