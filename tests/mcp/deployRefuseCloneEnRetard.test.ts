/**
 * [DEPLOY-CLONE-EN-RETARD] `mcp/deploy.sh` REFUSE de déployer un clone en retard sur origin/main.
 *
 * POURQUOI CETTE GARDE EXISTE (2026-09-21, mesuré, et ça a coûté un après-midi) : le script
 * déploie `--source .`, donc LE DOSSIER D'OÙ ON LE LANCE — jamais GitHub. Un clone non
 * rafraîchi envoie l'ANCIEN code, et `gcloud` répond quand même « Routing traffic... Done »
 * puis « serving 100 percent of traffic ». Le succès de l'OUTIL se lit alors comme le succès
 * de l'INTENTION, et plus rien ne distingue « déployé » de « déployé le bon code ».
 *
 * ⚠️ GARDE COMPORTEMENTALE, PAS UN SCAN DE SOURCE, et c'est délibéré : `deploy.sh` est un
 * script shell dont les commentaires EXPLIQUENT le refus mot pour mot (« REFUS », « en retard
 * sur origin/main »). Un scan de présence y serait satisfait par la PROSE qui décrit la règle
 * — `SCAN-QUI-MATCHE-LA-PROSE`, et `readCodeOnly` ne sait décommenter que du JS/TS, pas du
 * shell. On exécute donc vraiment le script sur un vrai dépôt git jetable.
 *
 * ⚠️ Les DEUX sens sont mesurés : sans le contrôle négatif, un script qui refuserait TOUJOURS
 * (ou un `exit 1` posé trop haut) passerait pour une protection.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Un dépôt jetable : un « origin » local à deux commits, et un clone laissé au premier. */
function deportEnRetard(): { clone: string; nettoyer: () => void } {
    const racine = mkdtempSync(join(tmpdir(), 'financeai-deploy-'));
    const origin = join(racine, 'origin.git');
    const clone = join(racine, 'clone');
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });

    mkdirSync(origin, { recursive: true });
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin], { stdio: 'pipe' });
    execFileSync('git', ['clone', '--quiet', origin, clone], { stdio: 'pipe' });
    git(clone, 'config', 'user.email', 'garde@test.local');
    git(clone, 'config', 'user.name', 'Garde');

    mkdirSync(join(clone, 'mcp'), { recursive: true });
    git(clone, 'commit', '--quiet', '--allow-empty', '-m', 'premier');
    git(clone, 'push', '--quiet', 'origin', 'main');
    git(clone, 'commit', '--quiet', '--allow-empty', '-m', 'second');
    git(clone, 'push', '--quiet', 'origin', 'main');
    // Le clone recule d'UN commit : exactement l'état « j'ai oublié de puller ».
    git(clone, 'reset', '--quiet', '--hard', 'HEAD~1');

    cpSync(join(process.cwd(), 'mcp', 'deploy.sh'), join(clone, 'mcp', 'deploy.sh'));
    return { clone, nettoyer: () => rmSync(racine, { recursive: true, force: true }) };
}

/** Lance le script et rend sa sortie complète — l'échec `gcloud` absent n'est pas notre sujet. */
function lancer(cwd: string, env: Record<string, string> = {}): string {
    try {
        return execFileSync('bash', ['mcp/deploy.sh'], {
            cwd,
            encoding: 'utf8',
            env: { ...process.env, PROJECT_ID: 'projet-bidon', ...env },
            stdio: 'pipe',
        });
    } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        return `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
}

describe('[DEPLOY-CLONE-EN-RETARD] mcp/deploy.sh ne déploie pas un clone périmé', () => {
    it('REFUSE quand le clone est derrière origin/main, et nomme le geste qui répare', () => {
        const { clone, nettoyer } = deportEnRetard();
        try {
            const sortie = lancer(clone);
            expect(sortie).toContain('REFUS');
            expect(sortie).toContain('en retard de 1 commit');
            // Un refus qui ne dit pas quoi faire se contourne au lieu de se corriger.
            expect(sortie).toContain('git pull origin main');
            // Et il s'arrête AVANT d'appeler gcloud : sinon il aurait déjà construit l'image.
            expect(sortie).not.toContain('Déploiement de financeai-mcp');
        } finally {
            nettoyer();
        }
    });

    it('CONTRÔLE NÉGATIF : à jour, il ne refuse pas (sinon la garde refuserait tout)', () => {
        const { clone, nettoyer } = deportEnRetard();
        try {
            execFileSync('git', ['pull', '--quiet', 'origin', 'main'], { cwd: clone, stdio: 'pipe' });
            const sortie = lancer(clone);
            expect(sortie).not.toContain('REFUS');
            // Il est bien ALLÉ plus loin : c'est ce qui prouve que le refus n'est pas simplement
            // silencieux. (Il échouera ensuite sur `gcloud`, absent ici — hors sujet.)
            expect(sortie).toContain('Déploiement de financeai-mcp');
        } finally {
            nettoyer();
        }
    });

    it('ALLOW_BEHIND=1 laisse passer un retour arrière VOLONTAIRE, en le disant', () => {
        const { clone, nettoyer } = deportEnRetard();
        try {
            const sortie = lancer(clone, { ALLOW_BEHIND: '1' });
            expect(sortie).not.toContain('REFUS');
            expect(sortie).toContain('forcé par ALLOW_BEHIND=1');
            expect(sortie).toContain('Déploiement de financeai-mcp');
        } finally {
            nettoyer();
        }
    });
});
