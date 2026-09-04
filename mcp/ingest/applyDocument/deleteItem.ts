// mcp/ingest/applyDocument/deleteItem.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import type { AppState } from '../../../types';
import { formatCAD } from '../../../utils/format';
import type { ApplyResult, Change, DeleteItemPayload } from './types';
import { budgetNameKey } from './commun';

// ── Suppression d'entité (actif / dette) — ADR Lots 4-5 ──────────────────────
// Correspondance NORMALISÉE EXACTE (casse/accents — jamais de fuzzy sur un geste destructif) ;
// ambiguïté (2 noms équivalents, même symbole dans 2 comptes sans précision) → throw, pas de choix
// silencieux. L'aperçu LISTE ce qui disparaît + les effets dérivés (NW, courbe, décaissement).

// [Finding panel — classe AI-PROMPT-FAKE-ZERO] Un montant NON FINI (état corrompu) affiché « 0 $ »
// dans l'aperçu d'une SUPPRESSION ferait confirmer l'utilisateur sur une donnée fabriquée → frontière
// de formatage honnête : « (non disponible) », jamais un 0 plausible.
const fmtOrUnavailable = (v: unknown): string =>
    Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : '(non disponible)';
// [FMT-PROMPT-MIGRER] Variante CAD pour les montants EN DOLLARS CANADIENS (solde de dette).
// ⚠️ `fmtOrUnavailable` ci-dessus reste NU exprès : son autre site formate un PRIX EN DEVISE
// NATIVE suivi de son code (« 123,45 USD ») — y mettre `formatCAD` fabriquerait « 123 $ USD »,
// le membre déviant mesuré par `UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`.
const cadOrUnavailable = (v: unknown): string =>
    Number.isFinite(Number(v)) ? formatCAD(Number(v)) : '(non disponible)';

export function applyDeleteItem(state: AppState, doc: DeleteItemPayload): ApplyResult {
    const name = String(doc.name || '').trim();
    if (!name) throw new Error('Nom/symbole requis pour une suppression.');
    const key = budgetNameKey(name);

    if (doc.entity === 'asset') {
        const all = (state.assets ?? []);
        let matches = all.filter((a) => budgetNameKey(a.symbol || '') === key);
        if (matches.length === 0) throw new Error(`Aucun actif au symbole « ${name} » dans le portefeuille. Rien n'a été supprimé.`);
        if (matches.length > 1 && doc.accountType) {
            const inAccount = matches.filter((a) => (a.accountType || '') === doc.accountType);
            // [Finding panel] Distinguer « ta précision est INVALIDE » de « précise » — sinon un agent
            // boucle en renvoyant le même accountType fautif en croyant devoir juste « préciser ».
            if (inAccount.length === 0) {
                const accounts = matches.map((a) => a.accountType || '(sans compte)').join(', ');
                throw new Error(`Aucun actif « ${name} » dans le compte « ${doc.accountType} » — ce symbole est détenu dans : ${accounts}. Rien n'a été supprimé.`);
            }
            matches = inAccount;
        }
        if (matches.length !== 1) {
            throw new Error(`Plusieurs actifs portent le symbole « ${name} » (comptes différents) : précise le compte (accountType, ex. CELI / REER / NON-ENREG). Rien n'a été supprimé.`);
        }
        const target = matches[0];
        const changes: Change[] = [{
            field: `actif ${target.symbol}${target.accountType ? ` (${target.accountType})` : ''}`,
            before: `${target.quantity} × ${fmtOrUnavailable(target.currentPrice)} ${target.currency || 'CAD'}`,
            after: 'supprimé',
            note: '⚠️ la courbe d\'historique du portefeuille perd AUSSI sa contribution passée (pas de registre de ventes) ; le produit d\'une vente réelle doit arriver par tes transactions bancaires (import relevé)',
        }];
        const nextState: AppState = { ...state, assets: all.filter((a) => a !== target), lastUpdate: Date.now() };
        return { nextState, changes, summary: `Actif ${target.symbol} supprimé du portefeuille. Sauvegarde créée avant l'écriture (annulable via Réglages → Sauvegarde).` };
    }

    // ⚠️ [NAV-REMOVE-OBJECTIFS-TAB] Ceinture métier — un appel DIRECT du handler contourne Zod
    // (même patron que `applyCashBalance`/`applyBudgetItem` dans ce fichier). Avant le retrait des
    // objectifs, une valeur d'`entity` inattendue retombait sur `savingsGoals` ; elle retomberait
    // désormais sur les DETTES — un geste destructif au rayon d'impact bien supérieur. On refuse
    // explicitement au lieu de deviner.
    if (doc.entity !== 'debt') {
        throw new Error(`Type d'entité non supporté pour une suppression : « ${String(doc.entity)} ». Attendu : asset ou debt. Rien n'a été supprimé.`);
    }
    const all = (state.debts ?? []);
    const matches = all.filter((d) => budgetNameKey(d.name || '') === key);
    if (matches.length === 0) throw new Error(`Aucune dette nommée « ${name} ». Rien n'a été supprimé.`);
    if (matches.length > 1) throw new Error(`Plusieurs dettes portent un nom équivalent à « ${name} » : renomme-les d'abord (noms distinctifs). Rien n'a été supprimé.`);
    const target = matches[0];
    const changes: Change[] = [{
        field: `dette « ${target.name} »`,
        before: `${cadOrUnavailable(target.balance)} à ${target.interestRate} %`,
        after: 'supprimée',
        note: '⚠️ le patrimoine net MONTE du solde supprimé — réservé à une dette réellement soldée ou saisie par erreur',
    }];
    const nextState: AppState = { ...state, debts: all.filter((d) => d !== target), lastUpdate: Date.now() };
    return { nextState, changes, summary: `Dette « ${target.name} » supprimée. Sauvegarde créée avant l'écriture (annulable via Réglages → Sauvegarde).` };
}
