// tests/components/DebtManagerKindFields.test.tsx
//
// [DEBT-UI-PAR-TYPE] Le dernier chemin manquant du chantier Dette : la saisie À LA MAIN.
//
// Les lots 91→93 ont livré le service d'amortissement, son câblage dans la courbe du passé, puis
// l'écriture par l'assistant. Restait `DebtManager`, qui n'exposait ni le TYPE de dette (11 valeurs
// dans `types.ts` depuis W5.3) ni le montant emprunté : Marc pouvait distinguer un bail d'un prêt
// dans sa tête, pas dans l'app — `CHAMP-DANS-LE-TYPE-INATTEIGNABLE-DANS-L-UI`.
//
// Ce que ces gardes défendent :
//   1. le champ n'apparaît QUE là où le moteur en fait quelque chose, et la condition vient de LUI ;
//   2. les DEUX formulaires jumeaux (ajout, édition) le portent — c'est ce fichier qui a déjà payé
//      `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI` ;
//   3. l'UI refuse exactement ce que l'assistant refuse, sur les valeurs EFFECTIVES ;
//   4. un champ vidé rend `undefined`, jamais `0` ni `NaN`.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DebtManager } from '../../components/DebtManager';
import { nombreSaisiOuAbsent, refusOrigineIncoherente } from '../../components/debt/DebtKindFields';
import { DEBT_KIND_LABELS } from '../../components/debt/debtKindLabels';
import { KIND_AMORTISSANT } from '../../services/projection/debtAmortization';
import { DEBT_KINDS, type Debt } from '../../types';

const pret = (over: Partial<Debt> = {}): Debt => ({
    id: 'd1', name: 'Prêt auto Honda', balance: 18000, interestRate: 5,
    minimumPayment: 560, category: 'Car', ...over,
});

/** Monte l'écran et rend le dernier état écrit par le composant. */
const monter = (debts: Debt[] = []) => {
    let dernier: Debt[] = debts;
    render(<DebtManager debts={debts} setDebts={d => { dernier = d; }} />);
    return { lu: () => dernier };
};

describe('[DEBT-UI-PAR-TYPE] les libellés des onze types', () => {
    it('chaque valeur de DEBT_KINDS a un libellé, et aucun n\'est son identifiant technique', () => {
        // La map est un `Record<DebtKind, string>` : le typecheck garantit déjà l'exhaustivité. Ce
        // test garantit la QUALITÉ — un libellé qui recopie la clé serait exhaustif et inutile.
        for (const k of DEBT_KINDS) {
            expect(DEBT_KIND_LABELS[k], k).toBeTruthy();
            expect(DEBT_KIND_LABELS[k], k).not.toBe(k);
        }
        // Bail et prêt auto sont DEUX lignes distinctes : les confondre change ce que le moteur fait.
        expect(DEBT_KIND_LABELS['auto-lease']).not.toBe(DEBT_KIND_LABELS.auto);
    });
});

describe('[DEBT-UI-PAR-TYPE] le montant emprunté n\'apparaît que là où il sert', () => {
    it('AJOUT : absent tant qu\'aucun type n\'est choisi, présent pour un prêt auto', () => {
        monter();
        fireEvent.click(screen.getByRole('button', { name: /Ajouter/i }));
        expect(screen.queryByLabelText(/Montant emprunté/i)).toBeNull();
        fireEvent.change(screen.getByLabelText(/Type de dette/i), { target: { value: 'auto' } });
        expect(screen.getByLabelText(/Montant emprunté/i)).toBeTruthy();
    });

    it('un BAIL ne montre PAS le champ — le cas réel de Marc, et ce n\'est pas un oubli', () => {
        monter();
        fireEvent.click(screen.getByRole('button', { name: /Ajouter/i }));
        fireEvent.change(screen.getByLabelText(/Type de dette/i), { target: { value: 'auto-lease' } });
        // Offrir le champ pour un bail ferait saisir un chiffre que le moteur ignore, sans le dire.
        expect(screen.queryByLabelText(/Montant emprunté/i)).toBeNull();
    });

    it('la condition vient de KIND_AMORTISSANT, pas d\'une liste recopiée', () => {
        // Anti-vacuité de la règle : on balaie les ONZE types et on exige que la présence du champ
        // suive EXACTEMENT la table du moteur. Une liste locale divergerait au premier type ajouté.
        for (const k of DEBT_KINDS) {
            const { unmount } = render(<DebtManager debts={[]} setDebts={() => {}} />);
            fireEvent.click(screen.getByRole('button', { name: /Ajouter/i }));
            fireEvent.change(screen.getByLabelText(/Type de dette/i), { target: { value: k } });
            const visible = screen.queryByLabelText(/Montant emprunté/i) !== null;
            expect(visible, `${k} : champ ${visible ? 'visible' : 'absent'}`).toBe(KIND_AMORTISSANT[k]);
            unmount();
        }
        // Le balayage ne prouve rien s'il ne contient pas les deux réponses.
        const valeurs = DEBT_KINDS.map(k => KIND_AMORTISSANT[k]);
        expect(new Set(valeurs).size).toBe(2);
    });
});

describe('[DEBT-UI-PAR-TYPE] les DEUX formulaires jumeaux portent le champ', () => {
    it('ÉDITION : le type et le montant emprunté sont saisissables sur une dette existante', () => {
        const { lu } = monter([pret()]);
        fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
        fireEvent.change(screen.getByLabelText(/Type de dette/i), { target: { value: 'auto' } });
        fireEvent.change(screen.getByLabelText(/Montant emprunté/i), { target: { value: '30000' } });
        fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
        expect(lu()[0].kind).toBe('auto');
        expect(lu()[0].originalBalance).toBe(30000);
    });

    it('AJOUT : les deux champs arrivent dans la dette créée', () => {
        const { lu } = monter([]);
        fireEvent.click(screen.getByRole('button', { name: /Ajouter/i }));
        fireEvent.change(screen.getByLabelText(/Nom de la dette/i), { target: { value: 'Prêt auto' } });
        fireEvent.change(screen.getByLabelText(/Solde de la dette/i), { target: { value: '18000' } });
        fireEvent.change(screen.getByLabelText(/Type de dette/i), { target: { value: 'auto' } });
        fireEvent.change(screen.getByLabelText(/Montant emprunté/i), { target: { value: '30000' } });
        fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
        expect(lu()).toHaveLength(1);
        expect(lu()[0].kind).toBe('auto');
        expect(lu()[0].originalBalance).toBe(30000);
    });

    it('les deux formulaires portent des identifiants DIFFÉRENTS', () => {
        // ⚠️ Mesuré en écrivant ce test : les deux formulaires ne coexistent JAMAIS dans le DOM —
        // `startEdit` fait `setIsAdding(false)`. Ma première version les ouvrait tous les deux et
        // n'en trouvait qu'un seul : elle affirmait une collision impossible aujourd'hui. Ce qui se
        // teste vraiment, c'est que le suffixe SÉPARE les identifiants — la protection vaut pour le
        // jour où les deux surfaces coexisteraient, et elle se mesure en les rendant séparément.
        const idsDe = (ouvrir: (c: HTMLElement) => void): string[] => {
            const { container, unmount } = render(<DebtManager debts={[pret()]} setDebts={() => {}} />);
            ouvrir(container);
            const ids = [...container.querySelectorAll('[id^="debt-kind-"], [id^="debt-original-"]')].map(e => e.id);
            unmount();
            return ids;
        };
        const ajout = idsDe(c => fireEvent.click(within(c).getByRole('button', { name: /Ajouter/i })));
        const edition = idsDe(c => fireEvent.click(within(c).getByRole('button', { name: /Modifier/i })));
        expect(ajout.length).toBeGreaterThan(0);   // anti-vacuité : chaque formulaire porte bien des id
        expect(edition.length).toBeGreaterThan(0);
        expect(ajout.some(id => edition.includes(id))).toBe(false);
    });

    it('ouvrir l\'édition FERME l\'ajout — c\'est ce qui rend la collision impossible', () => {
        // Le fait sur lequel repose le test précédent, écrit noir sur blanc : s'il changeait, la
        // séparation des identifiants cesserait d'être une précaution et deviendrait indispensable.
        const { container } = render(<DebtManager debts={[pret()]} setDebts={() => {}} />);
        fireEvent.click(within(container).getByRole('button', { name: /Ajouter/i }));
        expect(container.querySelectorAll('[id^="debt-kind-ajout"]').length).toBe(1);
        fireEvent.click(within(container).getByRole('button', { name: /Modifier/i }));
        expect(container.querySelectorAll('[id^="debt-kind-ajout"]').length).toBe(0);
        expect(container.querySelectorAll('[id^="debt-kind-edit-"]').length).toBe(1);
    });
});

describe('[DEBT-UI-PAR-TYPE] l\'UI refuse ce que l\'assistant refuse', () => {
    it('une origine INFÉRIEURE au solde bloque l\'enregistrement et l\'explique', () => {
        const { lu } = monter([]);
        fireEvent.click(screen.getByRole('button', { name: /Ajouter/i }));
        fireEvent.change(screen.getByLabelText(/Nom de la dette/i), { target: { value: 'Prêt auto' } });
        fireEvent.change(screen.getByLabelText(/Solde de la dette/i), { target: { value: '18000' } });
        fireEvent.change(screen.getByLabelText(/Type de dette/i), { target: { value: 'auto' } });
        fireEvent.change(screen.getByLabelText(/Montant emprunté/i), { target: { value: '12000' } });
        expect(screen.getByRole('status').textContent).toMatch(/inférieur au solde actuel/i);
        fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
        expect(lu()).toHaveLength(0); // rien n'a été écrit
    });

    it('en ÉDITION aussi, une origine incohérente ne s\'enregistre pas', () => {
        // ⚠️ Ce test porte le FAIT, pas le mécanisme. J'avais d'abord écrit « le refus se juge sur les
        // valeurs EFFECTIVES », en recopiant la leçon du lot 93 (payload MCP partiel) — perturbation
        // faite, juger sur le seul brouillon laissait 13 tests verts : `startEdit` fait
        // `setDraft({ ...d })`, le brouillon n'est JAMAIS partiel ici. La fusion est une précaution
        // (commentée comme telle dans `saveEdit`), le refus lui-même est ce qui doit tenir.
        const { lu } = monter([pret({ kind: 'auto' })]);
        fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
        fireEvent.change(screen.getByLabelText(/Montant emprunté/i), { target: { value: '12000' } });
        fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
        expect(lu()[0].originalBalance).toBeUndefined(); // refusé, la dette est intacte
    });

    it('l\'égalité passe : un prêt tout juste contracté n\'a rien remboursé', () => {
        expect(refusOrigineIncoherente(18000, 18000)).toBeNull();
        expect(refusOrigineIncoherente(17999, 18000)).toMatch(/inférieur/i);
        // Rien à comparer ⇒ rien à refuser (ni bruit, ni faux blocage).
        expect(refusOrigineIncoherente(undefined, 18000)).toBeNull();
        expect(refusOrigineIncoherente(30000, undefined)).toBeNull();
    });
});

describe('[DEBT-UI-PAR-TYPE] un champ vidé n\'est pas un zéro', () => {
    it('« pas renseigné » rend undefined, jamais 0 ni NaN', () => {
        expect(nombreSaisiOuAbsent('')).toBeUndefined();
        expect(nombreSaisiOuAbsent('   ')).toBeUndefined();
        expect(nombreSaisiOuAbsent('abc')).toBeUndefined();
        expect(nombreSaisiOuAbsent('0')).toBe(0);
        expect(nombreSaisiOuAbsent('30000')).toBe(30000);
    });

    it('vider le champ dans le formulaire ne laisse pas un NaN dans la dette', () => {
        // `parseFloat('')` rend NaN — un NaN écrit ici traverserait jusqu'au moteur, où une valeur
        // non finie ne doit JAMAIS devenir un défaut numérique.
        const { lu } = monter([pret({ kind: 'auto', originalBalance: 30000 })]);
        fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
        fireEvent.change(screen.getByLabelText(/Montant emprunté/i), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
        const v = lu()[0].originalBalance;
        expect(v === undefined || Number.isFinite(v)).toBe(true);
        expect(Number.isNaN(v as number)).toBe(false);
    });
});
