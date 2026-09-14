// tests/services/fintable/suggestDebtName.test.ts
//
// [FINTABLE-DEBTNAME-AUTO] Le nom de dette d'un compte Fintable se DEVINE, et se devine TIMIDEMENT.
//
// Demande Marc (2026-09-14) : « je veux pas avoir à donner exactement le nom dans dette, ça devrait
// être automatique ». Le risque du remède est money-critical et SYMÉTRIQUE de la demande : une
// suggestion trop hardie écrirait le solde de la carte sur une AUTRE dette. Ces cas verrouillent les
// deux moitiés — ce qui doit être proposé, et surtout ce qui ne doit JAMAIS l'être.
import { describe, it, expect } from 'vitest';
import { suggestDebtName, debtNameExiste } from '../../../services/fintable/suggestDebtName';
import type { Debt } from '../../../types';

const dette = (id: string, name: string): Debt => ({
    id, name, balance: 1_000, interestRate: 19.99, minimumPayment: 50, category: 'CreditCard',
});

const MC = dette('d1', 'Desjardins Cash Back Mastercard');
const HYPO = dette('d2', 'Hypothèque Condo');
const AUTO = dette('d3', 'Prêt auto Honda');

describe('[FINTABLE-DEBTNAME-AUTO] suggestDebtName', () => {
    it('égalité au caractère près : le libellé Fintable EST le nom de la dette', () => {
        expect(suggestDebtName('Desjardins Cash Back Mastercard', [MC, HYPO, AUTO])).toBe('Desjardins Cash Back Mastercard');
    });

    it('la casse et les accents ne font pas échouer l\'appariement — mais le nom RENDU garde sa graphie d\'origine', () => {
        // ⚠️ C'est l'assertion qui compte : `applyDebt` compare sur `trim().toLowerCase()` en gardant
        // les ACCENTS. Rendre « hypotheque condo » (normalisé) au lieu de « Hypothèque Condo » ferait
        // refuser la mise à jour — le défaut même que ce lot corrige, reconstruit un cran plus bas.
        expect(suggestDebtName('HYPOTHEQUE CONDO', [MC, HYPO, AUTO])).toBe('Hypothèque Condo');
    });

    it('une seule dette existe : c\'est forcément elle, même sans aucun mot en commun', () => {
        expect(suggestDebtName('PCA Everyday Chequing', [HYPO])).toBe('Hypothèque Condo');
    });

    it('mots signifiants en commun : le libellé de la banque n\'a pas à être identique', () => {
        expect(suggestDebtName('DESJARDINS CASH BACK MC 5020', [MC, HYPO, AUTO])).toBe('Desjardins Cash Back Mastercard');
    });

    // ── La moitié qui protège : ne RIEN proposer plutôt que de proposer au hasard. ──
    it('aucun mot signifiant en commun ⇒ null (jamais « la première de la liste »)', () => {
        expect(suggestDebtName('Compte chèque Tangerine', [MC, HYPO, AUTO])).toBeNull();
    });

    it('les mots passe-partout ne créent PAS d\'appariement : « Carte de crédit » ne vise personne', () => {
        // Sans la liste de mots non discriminants, « carte » et « credit » suffiraient à apparier
        // n'importe quelle carte avec n'importe quelle autre — et le solde irait sur la mauvaise.
        const visa = dette('d4', 'Carte de crédit Visa BNC');
        const amex = dette('d5', 'Carte de crédit Amex');
        expect(suggestDebtName('Carte de crédit', [visa, amex])).toBeNull();
    });

    it('ÉGALITÉ de score entre deux dettes ⇒ null : ambigu n\'est pas probable', () => {
        const a = dette('d6', 'Desjardins Visa');
        const b = dette('d7', 'Desjardins Mastercard');
        // « Desjardins » matche les deux à égalité (1 mot chacune) : aucune raison de préférer l'une.
        expect(suggestDebtName('Desjardins', [a, b])).toBeNull();
    });

    it('aucune dette déclarée ⇒ null (rien à proposer, et rien d\'inventé)', () => {
        expect(suggestDebtName('Desjardins Cash Back Mastercard', [])).toBeNull();
        expect(suggestDebtName('Desjardins Cash Back Mastercard', undefined)).toBeNull();
    });

    it('une dette au nom vide ne devient jamais un candidat', () => {
        expect(suggestDebtName('Peu importe', [dette('d8', '   ')])).toBeNull();
    });
});

describe('[FINTABLE-DEBTNAME-AUTO] debtNameExiste — alignée sur ce qu\'applyDebt ACCEPTE', () => {
    it('casse et espaces ignorés, comme `debtKey`', () => {
        expect(debtNameExiste('  desjardins cash back MASTERCARD ', [MC])).toBe(true);
    });

    it('⚠️ les ACCENTS comptent — parce qu\'ils comptent dans `debtKey` d\'applyDebt', () => {
        // Assertion DISCRIMINANTE : si `debtNameExiste` normalisait les accents (ce que fait
        // `suggestDebtName` pour CHERCHER), l'écran afficherait « ça correspond » sur un nom
        // qu'`applyDebt` refuse — un écran qui affirme plus que sa source ne garantit.
        expect(debtNameExiste('Hypotheque Condo', [HYPO])).toBe(false);
        expect(debtNameExiste('Hypothèque Condo', [HYPO])).toBe(true);
    });

    it('nom vide ou dette absente ⇒ false', () => {
        expect(debtNameExiste('', [MC])).toBe(false);
        expect(debtNameExiste('   ', [MC])).toBe(false);
        expect(debtNameExiste('Carte inconnue', [MC, HYPO])).toBe(false);
        expect(debtNameExiste('Carte inconnue', undefined)).toBe(false);
    });
});
