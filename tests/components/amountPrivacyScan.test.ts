/**
 * [A11Y-PRIVACY-SCAN-GLOBAL] GARDE DE SOURCE — tout montant RENDU tient compte du mode discret.
 *
 * Le pendant, pour le JSX ordinaire, de `chartPrivacyScan.test.ts` (qui ne couvre que les props
 * Recharts). Elle MESURE au lieu d'énumérer : les quatre tickets `A11Y-PRIVACY-*` livrés jusqu'ici
 * partaient d'une liste écrite à la main par un audit, et le périmètre annoncé s'est trouvé faux à
 * chaque lot.
 *
 * ⚠️ **POURQUOI ELLE CONNAÎT LES ALIAS LOCAUX.** Le ticket annonçait « 38 sites dans 19 fichiers »,
 * mesurés par un grep `formatCAD`. Or une bonne moitié des écrans passe par un alias local
 * (`const fmt = (n) => formatCAD(n)`, `money`, `formatCurrency`, `fmtMoney`) : ces sites étaient
 * INVISIBLES au grep qui a produit le ticket. Le recensement alias-aware en trouve nettement plus.
 * Même famille que `UN-ALIAS-DEPRECIE-REND-LE-CODE-INTROUVABLE-PAR-UN-SEUL-NOM` : un second nom
 * rend le code introuvable par le premier.
 *
 * CE QUE LA GARDE EXIGE : toute ligne qui FORMATE un montant porte, dans une fenêtre de ±2 lignes,
 * une marque de mode discret (`PrivateAmount`, `isPrivacyMode`, `MASKED_…`, …).
 *
 * DEUX ÉCHAPPATOIRES, explicites et greppables — comme `AXE-NON-MONETAIRE` chez sa jumelle :
 *  · `MONTANT-PUBLIC`     — la valeur n'est pas celle de l'utilisateur (borne de palier fiscal,
 *                           barème légal, tarif de référence). #608 exige de les GARDER visibles.
 *  · `MONTANT-HORS-ECRAN` — la ligne construit une chaîne pour un canal qui n'est PAS un rendu
 *                           (contexte de l'assistant IA). Le mode discret y est une décision
 *                           distincte, non tranchée : voir `[PRIVACY-CONTEXTE-IA]` au BACKLOG.
 *  · `MONTANT-MASQUE-AILLEURS` — le masquage existe, mais hors de la fenêtre : un formateur d'axe
 *                           que son appelant enveloppe (`privacyMode ? … : yFormatter(v)`), ou un
 *                           sous-arbre entier retiré par un `{!isPrivacyMode && …}` plus haut.
 *                           Chaque usage DIT où, en clair, à côté du jeton.
 *  · `MONTANT-CHAINE-A-DECOUPER` — **dette INVENTORIÉE, datée du 2026-09-01** : le montant est
 *                           interpolé dans une CHAÎNE construite en amont, donc il n'y a aucun nœud
 *                           à envelopper. Le correctif est structurel (découper en segments, comme
 *                           aux lots 56 et 58), pas un `PrivateAmount` de plus — il vit dans
 *                           `[A11Y-PRIVACY-CHAINES-RESTANTES]`. Le jeton rend la dette GREPPABLE et
 *                           BORNÉE : la garde bloque tout le reste au lieu d'être livrée non
 *                           bloquante, ce qui l'aurait apprise à être ignorée.
 *
 * ⚠️ **DEUX LECTEURS, et c'est un choix.** MONEY et PRIVACY sont cherchés dans la source
 * DÉCOMMENTÉE : sans ça, un commentaire qui EXPLIQUE le mode discret satisfait la garde — classe
 * `SCAN-QUI-MATCHE-LA-PROSE`, déjà payée trois fois dans ce dépôt. Les trois échappatoires, elles,
 * sont cherchées dans la source BRUTE : elles sont FAITES pour vivre en commentaire, à côté de la
 * ligne qu'elles justifient.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Formateurs monétaires de la source unique (`utils/format.ts`). */
const MONEY_BASE = /\bformatCAD\s*\(|\bformatCompactCAD\s*\(|\bformatSigned\s*\([^)]*withCurrency/;
/**
 * Marques prouvant que le mode discret est pris en compte.
 *
 * ⚠️ Comme chez `chartPrivacyScan`, n'ajoute JAMAIS ici un nom de helper LOCAL : il figure déjà
 * côté MONEY, et l'y remettre rendrait la garde auto-satisfaite.
 */
const PRIVACY = /Private(Amount|Block|Text|SliderValue|NumberInput|Select)\b|isPrivacyMode|privacyMode|MASKED_[A-Z]|masked[A-Z]|(?<![\w.])privacy(?![\w.])/;
/**
 * ⚠️ **Les lignes d'ATTRIBUT ne bénéficient PAS de la fenêtre — et c'est le cœur du lot.**
 *
 * `<KPIStat value={formatCurrency(x)} sublabel={`Manque ${formatCurrency(y)}`} privacy />` : la prop
 * `privacy` masque le `value`, PAS le `sublabel`, qui sort en clair juste en dessous. Une fenêtre de
 * ±2 lignes voit la marque du voisin et déclare la ligne saine — le masquage du `value` SERVIRAIT
 * d'alibi à la fuite du `sublabel`. Ces lignes doivent donc porter leur marque À ELLES.
 * C'est `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI` transformé en règle de garde.
 */
const LIGNE_ATTRIBUT = /\b(sublabel|title|aria-label|placeholder|alt|note)\s*=/;
const PUBLIC_OK = /MONTANT-PUBLIC/;
const HORS_ECRAN = /MONTANT-HORS-ECRAN/;
const MASQUE_AILLEURS = /MONTANT-MASQUE-AILLEURS/;
const CHAINE_DETTE = /MONTANT-CHAINE-A-DECOUPER/;
/** Fenêtre de voisinage : un `<PrivateAmount>` ouvrant est souvent une ou deux lignes plus haut. */
const W = 2;

const files = readdirSync(path.join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(ROOT, 'components', f));

/** Alias LOCAUX d'un formateur monétaire, déclarés dans le fichier. */
export function aliasMonetaires(src: string): string[] {
    return [...src.matchAll(/const\s+(\w+)\s*[:=][^\n]*=>\s*[^\n]*\b(formatCAD|formatCompactCAD)\s*\(/g)]
        .map((m) => m[1]);
}

interface Site { fichier: string; ligne: number; texte: string }

function sitesNonMasques(): Site[] {
    const out: Site[] = [];
    for (const file of files) {
        const brut = readFileSync(file, 'utf8');
        // `stripCommentsJsx` BLANCHIT (mêmes lignes, mêmes colonnes) : les deux lectures restent
        // alignées ligne à ligne, ce qui est la condition pour croiser les deux fenêtres.
        const src = stripCommentsJsx(brut);
        const lines = src.split('\n');
        const lignesBrutes = brut.split('\n');
        const alias = aliasMonetaires(src);
        const ALIAS = alias.length ? new RegExp(`\\b(${alias.join('|')})\\s*\\(`) : null;
        lines.forEach((l, i) => {
            if (!(MONEY_BASE.test(l) || (ALIAS && ALIAS.test(l)))) return;
            // La DÉFINITION d'un alias n'est pas un rendu — c'est son point d'APPEL qui compte.
            if (/const\s+\w+\s*[:=][^\n]*=>/.test(l) && MONEY_BASE.test(l)) return;
            const fenetre = lines.slice(Math.max(0, i - W), i + W + 1).join('\n');
            const fenetreBrute = lignesBrutes.slice(Math.max(0, i - W), i + W + 1).join('\n');
            if (LIGNE_ATTRIBUT.test(l)) { if (PRIVACY.test(l)) return; }
            else if (PRIVACY.test(fenetre)) return;
            if (PUBLIC_OK.test(fenetreBrute) || HORS_ECRAN.test(fenetreBrute)
                || MASQUE_AILLEURS.test(fenetreBrute) || CHAINE_DETTE.test(fenetreBrute)) return;
            out.push({ fichier: path.relative(ROOT, file), ligne: i + 1, texte: l.trim().slice(0, 120) });
        });
    }
    return out;
}

describe('[A11Y-PRIVACY-SCAN-GLOBAL] aucun montant rendu n\'échappe au mode discret', () => {
    it('a bien des fichiers à scanner (la garde ne peut pas être vide)', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('connaît les alias locaux — sinon elle hérite du trou qui a fabriqué le ticket', () => {
        // Anti-vacuité : ce dépôt EN CONTIENT, et c'est la seule raison d'être de cette moitié du
        // scan. Si plus aucun alias n'existait, la ligne `ALIAS` serait morte sans que rien ne le
        // dise. Témoin nommé plutôt que compte : un compte se rebase, un nom se vérifie.
        const src = readFileSync(path.join(ROOT, 'components/realestate/RealEstateWorkspace.tsx'), 'utf8');
        expect(aliasMonetaires(src)).toContain('formatCurrency');
    });

    it('le décommentage laisse du code à scanner (anti-vacuité, AGRÉGÉE)', () => {
        // ⚠️ Le seuil est AGRÉGÉ sur tout `components/`, pas par fichier : mesuré au lot 58, un
        // fichier très documenté descend à 0,466 de code sans être malade pour autant
        // (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`). À l'échelle du dossier,
        // « la moitié du dépôt a disparu » redevient un signal.
        // `partDeCodeRestante` n'est pas utilisée ici À DESSEIN : elle rend un ratio PAR FICHIER,
        // et c'est précisément la portée dont le seuil ne veut pas. On agrège les caractères.
        let brutTotal = 0, codeTotal = 0;
        for (const file of files) {
            const brut = readFileSync(file, 'utf8');
            brutTotal += brut.replace(/\s/g, '').length;
            codeTotal += stripCommentsJsx(brut).replace(/\s/g, '').length;
        }
        expect(codeTotal / brutTotal).toBeGreaterThan(0.5);
    });

    it('la garde TIRE : un montant nu, sans marque, est bien relevé', () => {
        // Sans ce cas, « zéro offender » ne distingue pas « tout est masqué » de « le scan est
        // mort ». On lui donne une source de synthèse qui porte exactement le défaut visé.
        const faux = [
            'const x = 1;',
            '<div className="kpi">{formatCAD(soldeDuCompte)}</div>',
            'const y = 2;',
        ].join('\n');
        const lignes = faux.split('\n');
        const suspecte = lignes.findIndex((l) => MONEY_BASE.test(l));
        expect(suspecte).toBe(1);
        expect(PRIVACY.test(faux)).toBe(false);
        // …et le MÊME texte, enveloppé, ne l'est plus.
        expect(PRIVACY.test(faux.replace('{formatCAD(', '<PrivateAmount>{formatCAD('))).toBe(true);
    });

    it('la dette « montant dans une chaîne » est BORNÉE et ne peut que décroître', () => {
        // `MONTANT-CHAINE-A-DECOUPER` inventorie les sites dont le correctif est STRUCTUREL
        // (découper la chaîne en segments), pas un `PrivateAmount` de plus. Un inventaire de dette
        // sans plafond n'est pas un inventaire : c'est une échappatoire (`ENTREE-D-INVENTAIRE-FANTOME`).
        // Le plafond descend avec `[A11Y-PRIVACY-CHAINES-RESTANTES]` ; il ne remonte jamais.
        //
        // ⚠️ On compte les SITES, pas les occurrences du jeton : un bloc de commentaire qui EXPLIQUE
        // la dette (et cite le ticket) porte le même mot que les lignes qu'il justifie. Compter les
        // occurrences donnait 12 pour 11 sites — l'assertion aurait CERTIFIÉ la prose au lieu de
        // borner la dette, exactement `UN-REPLACE-GLOBAL-DE-JETON-REECRIT-LE-COMMENTAIRE-QUI-LE-NOMME`.
        // Un site = une ligne qui porte À LA FOIS un formateur monétaire et le jeton.
        // ⚠️ Le jeton est posé EN LIGNE sur chaque site, jamais dans un commentaire de bloc au-dessus :
        // sinon le site échappe au compte (mesuré — deux sites manquaient, n rendait 9 pour 12) et
        // l'inventaire borne moins que ce qu'il autorise.
        const DETTE_MAX = 12; // MESURÉ le 2026-09-01, à la livraison de la garde
        let n = 0;
        for (const file of files) {
            const brut = readFileSync(file, 'utf8');
            const alias = aliasMonetaires(stripCommentsJsx(brut));
            const ALIAS = alias.length ? new RegExp(`\\b(${alias.join('|')})\\s*\\(`) : null;
            n += brut.split('\n').filter((l) => /MONTANT-CHAINE-A-DECOUPER/.test(l)
                && (MONEY_BASE.test(l) || (ALIAS && ALIAS.test(l)))).length;
        }
        expect(n, 'nouvelle chaîne à découper : le correctif est structurel, pas un jeton de plus')
            .toBeLessThanOrEqual(DETTE_MAX);
        // Anti-vacuité SYMÉTRIQUE : le jour où la dette est soldée, ce test doit rougir pour qu'on
        // retire le jeton du vocabulaire de la garde au lieu de le laisser traîner.
        expect(n, 'dette soldée — retire `MONTANT-CHAINE-A-DECOUPER` de la garde et ce test').toBeGreaterThan(0);
    });

    it('aucun montant formaté ne reste hors du mode discret', () => {
        const offenders = sitesNonMasques().map((s) => `${s.fichier}:${s.ligne}  ${s.texte}`);
        expect(
            offenders,
            'montant formaté sans marque de mode discret dans les 2 lignes voisines. '
            + 'Envelopper dans <PrivateAmount>, ou déclarer MONTANT-PUBLIC (valeur légale, pas celle '
            + 'de l\'utilisateur) / MONTANT-HORS-ECRAN (chaîne pour un canal non rendu).',
        ).toEqual([]);
    });
});
