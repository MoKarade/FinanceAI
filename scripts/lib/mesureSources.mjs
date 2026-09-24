// scripts/lib/mesureSources.mjs
//
// [PTF-L05B-MESURE-SOURCES] Logique PURE de la mesure des sources de cours et de change (Lot 0.5b
// de la refonte du portefeuille). Le conteneur de développement n'a AUCUN accès réseau vers les
// sources (EODHD, Yahoo, Banque du Canada : CONNECT refusé, mesuré le 2026-09-24) ; la CI GitHub,
// elle, en a. D'où un workflow manuel qui MESURE, au lieu de conclure sur des résumés de doc.
//
// ⚠️ Le dépôt et ses journaux de CI sont PUBLICS. Ce module ne produit donc que des VERDICTS et des
// ÉCARTS RELATIFS : jamais un symbole, jamais un prix, jamais un taux. Les symboles et les ancres
// arrivent par un secret (`MESURE_ANCRES`) et ne sont désignés que par leur rang (`L1`, `L2`…).
// Les conditions d'EODHD interdisent en plus de redistribuer ses prix : un journal public en serait un.

/** Date AAAA-MM-JJ d'un horodatage Yahoo (secondes UTC), dans le fuseau de la PLACE de cotation.
 *  Sans le décalage, une clôture de Tokyo ou un point intraday tomberait sur la veille ou le
 *  lendemain selon l'heure. */
export function dateDePlace(tsSecondes, decalageSecondes) {
    return new Date((tsSecondes + (decalageSecondes || 0)) * 1000).toISOString().slice(0, 10);
}

/** Série { date → prix } depuis une réponse `chart` de Yahoo ; `null` si la réponse est inexploitable. */
export function serieYahoo(json) {
    const r = json?.chart?.result?.[0];
    if (!r || !Array.isArray(r.timestamp)) return null;
    const closes = r.indicators?.quote?.[0]?.close ?? [];
    const serie = {};
    r.timestamp.forEach((ts, i) => {
        const c = closes[i];
        if (typeof c === 'number' && Number.isFinite(c)) serie[dateDePlace(ts, r.meta?.gmtoffset)] = c;
    });
    return {
        devise: r.meta?.currency ?? null,
        serie,
        dividendes: Object.keys(r.events?.dividends ?? {}).length,
        fractionnements: Object.keys(r.events?.splits ?? {}).length,
    };
}

/** Série { date → prix } depuis une réponse `eod` d'EODHD (champ `close`, le prix BRUT). */
export function serieEodhd(json) {
    if (!Array.isArray(json)) return null;
    const serie = {};
    for (const p of json) {
        if (p && typeof p.date === 'string' && typeof p.close === 'number' && Number.isFinite(p.close)) serie[p.date] = p.close;
    }
    return { serie };
}

/** Écart relatif MAXIMAL (en %) entre une série et les ancres, sur les dates couvertes.
 *  Les dates à exclure (par ex. celles d'avant un fractionnement, jugées à part) sont ignorées.
 *  @param {Record<string, number>} serie
 *  @param {Record<string, number>} ancres
 *  @param {(date: string) => boolean} [exclure] */
export function ecartAuxAncres(serie, ancres, exclure = () => false) {
    let max = null;
    let couvertes = 0;
    let attendues = 0;
    for (const [date, ancre] of Object.entries(ancres ?? {})) {
        if (exclure(date) || !(typeof ancre === 'number' && ancre > 0)) continue;
        attendues++;
        const prix = serie[date];
        if (!(typeof prix === 'number' && prix > 0)) continue;
        couvertes++;
        const e = Math.abs(prix / ancre - 1) * 100;
        if (max === null || e > max) max = e;
    }
    return { max, couvertes, attendues };
}

/** Sur une date d'AVANT un fractionnement (l'ancre y est le prix d'époque, non ajusté) : la source
 *  donne-t-elle le prix BRUT, le prix AJUSTÉ (÷ ratio), ou autre chose ? Tolérance de 2 %. */
export function natureAvantFractionnement(prix, ancreBrute, ratio) {
    if (!(prix > 0 && ancreBrute > 0 && ratio > 1)) return 'indéterminée';
    if (Math.abs(prix / ancreBrute - 1) < 0.02) return 'brut';
    if (Math.abs((prix * ratio) / ancreBrute - 1) < 0.02) return 'ajusté des fractionnements';
    return 'ni brut ni ajusté';
}

/** Devise renvoyée contre devise attendue. Les pence (GBp/GBX) sont signalés à part : une ligne de
 *  Londres en pence entrerait dans la courbe à ×100 sans rien dire (le type `Asset` n'a pas GBp). */
export function verdictDevise(renvoyee, attendue) {
    if (!renvoyee) return 'non renvoyée';
    if (/^GB[pX]$/.test(renvoyee)) return 'PENCE (ligne en GBp : mauvaise ligne ou ÷100 obligatoire)';
    return renvoyee.toUpperCase() === String(attendue).toUpperCase() ? 'conforme' : `DIFFÉRENTE de l'attendue`;
}

const pct = (x) => (x === null ? '—' : `${x.toFixed(2).replace('.', ',')} %`);

/** Une ligne de rapport, sans symbole ni prix : c'est tout ce qui a le droit d'atteindre le journal. */
export function formaterVerdict(rang, source, v) {
    if (v.statut !== 'ok') return `L${rang} · ${source} : ${v.statut}`;
    const morceaux = [`L${rang} · ${source} : disponible`];
    if (v.devise !== undefined) morceaux.push(`devise ${v.devise}`);
    morceaux.push(`écart max aux ancres ${pct(v.ecart.max)} (${v.ecart.couvertes}/${v.ecart.attendues} dates)`);
    if (v.fractionnement) morceaux.push(`avant fractionnement : ${v.fractionnement}`);
    if (v.ancreNonIndependante) morceaux.push('ancre = prix du courtier (non indépendante)');
    if (v.evenements) morceaux.push(v.evenements);
    return morceaux.join(' · ');
}

/** La FORME de ce qui a été reçu, sans jamais son contenu (ni clé ni valeur : le journal est public).
 *  Premier lancement du 2026-09-24 : « lignes vide ou absent », et rien pour dire si le secret était
 *  un autre fichier, une chaîne entre guillemets ou un tableau nu — trois corrections différentes. */
export function formeRecue(j) {
    if (typeof j === 'string') return 'une chaîne JSON (contenu collé entre guillemets ?)';
    if (Array.isArray(j)) return `un tableau de ${j.length} élément(s) (il manque l'objet { "lignes": … } autour)`;
    if (j && typeof j === 'object') return `un objet à ${Object.keys(j).length} clé(s) de premier niveau, sans « lignes »`;
    return `une valeur de type ${j === null ? 'null' : typeof j}`;
}

/** Validation du secret : un format faux doit échouer BRUYAMMENT, pas produire un rapport vide. */
export function lireAncres(brut) {
    let j;
    try {
        j = JSON.parse(brut);
    } catch {
        throw new Error('MESURE_ANCRES n’est pas du JSON valide');
    }
    if (!Array.isArray(j?.lignes) || j.lignes.length === 0) {
        throw new Error(`MESURE_ANCRES : « lignes » vide ou absent — reçu ${formeRecue(j)}. Le secret attendu est le`
            + ' contenu de mesure-ancres-secret.json (clés « lignes » et « taux »), pas le fichier de vérification.');
    }
    j.lignes.forEach((l, i) => {
        if (typeof l?.yahoo !== 'string' || typeof l?.devise !== 'string' || typeof l?.ancres !== 'object') {
            throw new Error(`MESURE_ANCRES : ligne L${i + 1} incomplète (yahoo, devise et ancres requis)`);
        }
    });
    return j;
}
