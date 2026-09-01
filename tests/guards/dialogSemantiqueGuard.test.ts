// [A11Y-MODAL-GUIDE-NODIALOG] Une surface qui RECOUVRE l'app doit se déclarer comme un dialogue.
//
// ⚠️ Le défaut n'est pas cosmétique. Un `<div>` posé en `fixed inset-0` cache visuellement le reste
// de l'application, mais ne le cache à personne d'autre : sans `role="dialog"` ni `aria-modal`, un
// lecteur d'écran continue d'annoncer la page en dessous, et la tabulation y descend — dans des
// contrôles que l'utilisateur ne voit pas. `GuideModal` était dans ce cas, et il est atteignable au
// clavier (palette Cmd+K).
//
// ⚠️ ET LA DOC AFFIRMAIT QUE C'ÉTAIT DÉJÀ MIGRÉ (`DOC-STALE-IMPOSSIBILITY`). D'où cette garde : ce
// n'est pas une phrase de documentation qui répond « est-ce fait ? », c'est un test.
//
// La règle vise les surfaces MODALES. Toutes les surfaces plein écran n'en sont pas — voir
// `EXEMPTIONS`, où chacune dit ce qu'elle est à la place, et un test refuse une exemption périmée.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');
/** La primitive : c'est ELLE qui porte la sémantique, elle n'a personne à qui l'emprunter. */
const PRIMITIVE = 'components/ui/Modal.tsx';

const EXEMPTIONS: ReadonlyArray<{ fichier: string; jeton: string; raison: string }> = [
    {
        fichier: 'Onboarding.tsx',
        jeton: 'z-[9999] bg-[#080b10]',
        raison: 'ce n\'est pas un dialogue mais une PRISE DE CONTRÔLE de l\'écran : rien ne subsiste '
            + 'derrière, il n\'y a donc aucun contenu à rendre inerte. Un `aria-modal` y affirmerait '
            + 'qu\'on masque quelque chose — c\'est le contraire d\'une information utile.',
    },
    {
        fichier: 'Layout.tsx',
        jeton: 'role="navigation"',
        raison: 'tiroir de navigation mobile, pas un dialogue : il porte `role="navigation"` et son '
            + 'libellé. Le motif « menu » n\'exige pas `aria-modal` — le contenu derrière reste une '
            + 'destination légitime, c\'est même le but du tiroir.',
    },
];

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

interface Surface { chemin: string; code: string }

/** Toute surface qui se pose par-dessus l'app : `fixed inset-0` est le marqueur du dépôt. */
function surfacesRecouvrantes(): Surface[] {
    const out: Surface[] = [];
    for (const chemin of fichiersTsx(racine)) {
        const brut = readFileSync(chemin, 'utf8');
        // ⚠️ Source DÉCOMMENTÉE : plusieurs en-têtes RACONTENT ce motif (celui-ci compris, s'il
        // vivait dans components/). Une garde d'absence lue sur la prose accuse du code sain.
        const code = stripCommentsJsx(brut);
        if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
            throw new Error(`${chemin} : décommentage suspect — la garde lirait un fichier vidé`);
        }
        if (!/fixed inset-0/.test(code)) continue;
        out.push({ chemin: chemin.replace(`${process.cwd()}/`, ''), code });
    }
    return out;
}

describe('[A11Y-MODAL-GUIDE-NODIALOG] toute surface qui recouvre l\'app se déclare', () => {
    it('le scan voit les surfaces réelles — témoins nommés', () => {
        const vus = surfacesRecouvrantes().map((s) => s.chemin);
        expect(vus).toContain(PRIMITIVE);
        // ⚠️ Témoin choisi pour ce qu'il est : `PassphraseGate` est un dialogue SANS fermeture (pas
        // de ✕, pas d'Échap — la seule sortie est de déverrouiller). Il ne peut donc PAS passer par
        // la primitive, et c'est le seul cas où la garde doit accepter une déclaration à la main.
        expect(vus).toContain('components/auth/PassphraseGate.tsx');
        // Et les deux exemptions, sinon le test qui les vérifie serait le seul à les voir.
        expect(vus).toContain('components/Onboarding.tsx');
        expect(vus).toContain('components/Layout.tsx');
        expect(vus.length).toBeGreaterThanOrEqual(6);
    });

    it('les écrans MIGRÉS ne sont plus des surfaces brutes — ils consomment la primitive', () => {
        // ⚠️ Contre-témoin, et c'est lui qui mesure le lot : `GuideModal` et `BackupPanel` posaient
        // leur propre `fixed inset-0`. Migrés, ils DISPARAISSENT du scan — un test de présence
        // n'aurait donc rien dit d'eux. On vérifie l'autre moitié : ils passent par `ui/Modal`, et
        // ils n'ont plus de recouvrement à eux. Ré-inliner un overlay dans l'un des deux le ferait
        // réapparaître dans le scan ci-dessus, et rougir ici.
        const vus = surfacesRecouvrantes().map((s) => s.chemin);
        for (const f of ['components/GuideModal.tsx', 'components/settings/BackupPanel.tsx']) {
            expect(vus, `${f} a repris un recouvrement à lui`).not.toContain(f);
            const code = readFileSync(resolve(process.cwd(), f), 'utf8');
            expect(/from\s+'[^']*ui\/Modal'/.test(code), `${f} ne consomme plus la primitive`).toBe(true);
            expect(/<Modal\b/.test(code), `${f} importe la primitive sans l'utiliser`).toBe(true);
        }
    });

    it('chacune porte la sémantique de dialogue, ou passe par la primitive', () => {
        const nus: string[] = [];
        for (const s of surfacesRecouvrantes()) {
            if (s.chemin === PRIMITIVE) continue;
            if (EXEMPTIONS.some((e) => s.chemin.endsWith(`/${e.fichier}`) && s.code.includes(e.jeton))) continue;
            // Deux façons légitimes : consommer `ui/Modal`, ou déclarer soi-même le rôle ET
            // `aria-modal`. Le rôle seul ne suffit pas — c'est `aria-modal` qui dit que le reste est
            // hors d'atteinte, et c'est justement ce que la tabulation ignorait.
            const parLaPrimitive = /from\s+'[^']*ui\/Modal'/.test(s.code) && /<Modal\b/.test(s.code);
            const aLaMain = /role=\{?["']?(dialog|alertdialog)/.test(s.code) && /aria-modal/.test(s.code);
            if (!parLaPrimitive && !aLaMain) nus.push(s.chemin);
        }
        expect(nus, `Surface(s) qui recouvrent l'app sans se déclarer :\n${nus.join('\n')}`).toEqual([]);
    });

    it('chaque exemption est RÉELLE — une exemption périmée se retire', () => {
        const vues = surfacesRecouvrantes();
        for (const e of EXEMPTIONS) {
            const trouve = vues.some((s) => s.chemin.endsWith(`/${e.fichier}`) && s.code.includes(e.jeton));
            expect(trouve, `exemption périmée : ${e.fichier} / ${e.jeton}`).toBe(true);
        }
    });
});
