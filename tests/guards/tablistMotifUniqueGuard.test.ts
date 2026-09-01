// [A11Y-TABLIST-NO-PANEL] Un bandeau d'onglets ne se réinvente pas.
//
// ⚠️ POURQUOI CETTE GARDE. `components/ui/SubTabs.tsx` est né de TROIS copies divergentes du même
// balisage, toutes incomplètes de la même façon. La primitive a corrigé les trois — et un quatrième
// bandeau (`FutureProjection`) est resté à part, parce qu'il avait un habillage différent : ni
// `aria-controls`, ni panneau déclaré, ni clavier. Le motif se re-perd exactement comme ça : par un
// écran qui ressemble assez peu aux autres pour qu'on n'y pense pas.
//
// La règle n'exige pas d'utiliser `SubTabs` (un bandeau peut légitimement vouloir son propre
// habillage) : elle exige d'en emprunter le MOTIF — les mêmes fabricants d'`id` et le même clavier.
// C'est ce qui rend impossible la divergence silencieuse, sans imposer une apparence.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');
/** Le fichier qui DÉFINIT le motif — il ne peut pas l'importer de lui-même. */
const SOURCE_DU_MOTIF = 'components/ui/SubTabs.tsx';

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

interface Bandeau { chemin: string; code: string }

function bandeaux(): Bandeau[] {
    const out: Bandeau[] = [];
    for (const chemin of fichiersTsx(racine)) {
        const brut = readFileSync(chemin, 'utf8');
        // ⚠️ Source DÉCOMMENTÉE : trois fichiers PARLENT de `role="tablist"` dans leur en-tête pour
        // raconter cette histoire. Lue brute, la garde les compterait comme des bandeaux — et le
        // commentaire qui explique le motif satisferait la règle qu'il explique.
        const code = stripCommentsJsx(brut);
        if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
            throw new Error(`${chemin} : décommentage suspect — la garde lirait un fichier vidé`);
        }
        if (!/role="tablist"/.test(code)) continue;
        out.push({ chemin: chemin.replace(`${process.cwd()}/`, ''), code });
    }
    return out;
}

describe('[A11Y-TABLIST-NO-PANEL] tout bandeau d\'onglets emprunte le motif partagé', () => {
    it('le scan voit les bandeaux RÉELS, et pas ceux dont on parle', () => {
        const vus = bandeaux().map((b) => b.chemin);
        // Témoins : la primitive et le bandeau à habillage propre.
        expect(vus).toContain(SOURCE_DU_MOTIF);
        expect(vus).toContain('components/FutureProjection.tsx');
        // ⚠️ Contre-témoin, et c'est lui qui prouve le décommentage : `Profile.tsx` ÉCRIT
        // « role="tablist" » dans son en-tête pour expliquer d'où vient la primitive, alors qu'il
        // n'en rend aucun — il passe par `SubTabs`. Lu brut, il apparaîtrait ici.
        expect(vus, 'le scan lit les commentaires : il compte un bandeau qui n\'existe pas')
            .not.toContain('components/Profile.tsx');
    });

    it('chaque bandeau relie ses onglets à un panneau et se parcourt au clavier', () => {
        const manquants: string[] = [];
        for (const b of bandeaux()) {
            if (b.chemin === SOURCE_DU_MOTIF) continue;
            const trous: string[] = [];
            if (!/aria-controls=/.test(b.code)) trous.push('aria-controls');
            if (!/\bpanelId\s*\(/.test(b.code)) trous.push('panelId (fabricant partagé)');
            if (!/\btabId\s*\(/.test(b.code)) trous.push('tabId (fabricant partagé)');
            if (!/\bclavierTablist\s*[<(]/.test(b.code)) trous.push('clavierTablist (flèches / Début / Fin)');
            if (!/\bTabPanel\b/.test(b.code)) trous.push('TabPanel (role="tabpanel")');
            if (trous.length > 0) manquants.push(`${b.chemin} → ${trous.join(', ')}`);
        }
        expect(manquants, `Bandeau(x) qui réinvente(nt) le motif :\n${manquants.join('\n')}`).toEqual([]);
    });

    it('le clavier et les fabricants d\'id vivent en UN seul endroit', () => {
        // Une copie locale de la logique de touches serait invisible au test ci-dessus (il ne vérifie
        // qu'une PRÉSENCE) : on interdit donc la ré-implémentation, pas seulement l'absence.
        const copieurs = bandeaux()
            .filter((b) => b.chemin !== SOURCE_DU_MOTIF)
            .filter((b) => /['"]ArrowRight['"]/.test(b.code))
            .map((b) => b.chemin);
        expect(copieurs, `Logique de flèches recopiée hors de ${SOURCE_DU_MOTIF} :\n${copieurs.join('\n')}`).toEqual([]);
    });
});
