import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// [PWA-ANDROID] Garde de l'INSTALLABILITÉ sur Android, née d'un défaut réel (18/09/2026).
//
// Le manifeste ne déclarait qu'une icône SVG (`sizes: "any"`). Chrome fabrique un WebAPK à
// l'installation et lui faut une icône RASTER d'au moins 192 px : sans elle, il n'offre jamais
// « Installer l'application », et rien ne le dit — l'app s'ouvre parfaitement dans un onglet.
//
// ⚠️ Ce que ce fichier garde et qu'un simple coup d'œil au manifeste ne garde PAS : Chrome croit
// le FICHIER, pas le champ `sizes`. Un manifeste qui annonce 512×512 en servant un PNG de 192
// est un manifeste faux, et la conséquence est la même que l'absence d'icône. Les dimensions
// sont donc relues dans l'en-tête IHDR du PNG, pas dans le manifeste.

type Icone = { src: string; sizes?: string; type?: string; purpose?: string };
type Manifeste = {
    id?: string;
    start_url?: string;
    display?: string;
    launch_handler?: { client_mode?: string };
    icons?: Icone[];
};

const racine = resolve(import.meta.dirname, '..');
const manifeste = JSON.parse(readFileSync(resolve(racine, 'public/manifest.json'), 'utf-8')) as Manifeste;
const icones = manifeste.icons ?? [];

/** Dimensions RÉELLES d'un PNG, lues dans son en-tête (13 octets d'IHDR après la signature). */
function dimensionsPng(chemin: string): { largeur: number; hauteur: number } {
    const buf = readFileSync(chemin);
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buf.subarray(0, 8).equals(signature)) throw new Error(`${chemin} n'est pas un PNG`);
    return { largeur: buf.readUInt32BE(16), hauteur: buf.readUInt32BE(20) };
}

const aPourRole = (i: Icone, role: string) => (i.purpose ?? 'any').split(/\s+/).includes(role);

describe('[PWA-ANDROID] le manifeste rend l’app installable', () => {
    it('déclare une icône RASTER d’au moins 192 px de rôle « any » — pas seulement un SVG', () => {
        const raster = icones.filter((i) => i.type === 'image/png' && aPourRole(i, 'any'));
        expect(raster.length, 'aucune icône PNG de rôle « any » : Chrome refusera le WebAPK').toBeGreaterThan(0);
        const assezGrandes = raster.filter((i) => {
            const { largeur, hauteur } = dimensionsPng(resolve(racine, 'public', i.src.replace(/^\//, '')));
            return largeur >= 192 && hauteur >= 192;
        });
        expect(assezGrandes.length).toBeGreaterThan(0);
    });

    it('déclare une icône « maskable » d’au moins 512 px, DISTINCTE de l’icône normale', () => {
        // Une icône non conçue pour le masque, réutilisée comme maskable, se fait rogner les
        // bords par l'icône adaptative d'Android : elle s'affiche, simplement coupée.
        const maskables = icones.filter((i) => aPourRole(i, 'maskable'));
        expect(maskables.length, 'aucune icône maskable').toBeGreaterThan(0);
        const grande = maskables.find((i) => {
            const { largeur } = dimensionsPng(resolve(racine, 'public', i.src.replace(/^\//, '')));
            return largeur >= 512;
        });
        expect(grande, 'aucune maskable ≥ 512 px MESURÉE dans le fichier').toBeDefined();
        const normales = icones.filter((i) => aPourRole(i, 'any')).map((i) => i.src);
        expect(normales).not.toContain(grande!.src);
    });

    it('chaque icône déclarée EXISTE, et sa taille réelle correspond à ce que le manifeste annonce', () => {
        expect(icones.length).toBeGreaterThan(0);
        for (const i of icones) {
            const chemin = resolve(racine, 'public', i.src.replace(/^\//, ''));
            expect(existsSync(chemin), `${i.src} déclaré mais absent de public/`).toBe(true);
            if (i.type !== 'image/png') continue;
            const attendu = Number((i.sizes ?? '').split('x')[0]);
            const { largeur, hauteur } = dimensionsPng(chemin);
            expect(largeur, `${i.src} : le manifeste annonce ${i.sizes}, le fichier fait ${largeur}x${hauteur}`).toBe(attendu);
            expect(hauteur).toBe(attendu);
        }
    });

    it('fixe son `id` et demande `navigate-existing` — l’identité de l’installation et la réutilisation de la fenêtre', () => {
        // `id` ABSENT veut dire « mon identité est mon start_url » : le jour où start_url change,
        // Android voit une SECONDE app et en installe une deuxième au lieu de mettre à jour.
        expect(manifeste.id).toBeTruthy();
        // `navigate-existing` : un lien venu du hub réutilise la fenêtre déjà ouverte au lieu
        // d'en empiler une nouvelle. C'est la moitié « ça ouvre l'app installée » de la demande.
        expect(manifeste.launch_handler?.client_mode).toBe('navigate-existing');
        expect(manifeste.display).toBe('standalone');
    });
});

describe('[LOGO-A] le logo série A est celui que le navigateur et l’iPhone reçoivent', () => {
    const html = readFileSync(resolve(racine, 'index.html'), 'utf-8');

    it('l’onglet pointe vers /icon.svg, plus vers une pastille « Fi » codée en ligne', () => {
        expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg">');
        expect(html).not.toContain('rel="icon" href="data:');
    });

    it('fournit une apple-touch-icon de 180 x 180, déclarée dans index.html', () => {
        expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
        expect(dimensionsPng(resolve(racine, 'public/apple-touch-icon.png'))).toEqual({ largeur: 180, hauteur: 180 });
    });

    it('le dessin est celui de la série A (couleur FinanceAI sur tuile sombre)', () => {
        const svg = readFileSync(resolve(racine, 'public/icon.svg'), 'utf-8').toLowerCase();
        expect(svg).toContain('#2dd4bf');
        expect(svg).toContain('#0b0d12');
    });

    it('le service worker a changé de cache : v4 gardait l’ancien /icon.svg (cache d’abord)', () => {
        const sw = readFileSync(resolve(racine, 'public/sw.js'), 'utf-8');
        expect(sw).not.toContain("CACHE_NAME = 'financeai-v4'");
        expect(sw).toMatch(/CACHE_NAME = 'financeai-v[5-9]/);
    });
});
