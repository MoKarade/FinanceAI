// [STORAGE-KEYS-NO-REGISTRY] Une clé de stockage écrite à deux endroits est un renommage à moitié.
//
// ⚠️ LE RISQUE N'EST PAS « il y a beaucoup de clés », c'est « la même chaîne est écrite deux fois ».
// C'est la seule situation où une correction peut n'être appliquée qu'à moitié — et l'échec est
// SILENCIEUX : l'app lit une clé qui n'existe pas et se comporte comme un premier lancement. La plus
// exposée était aussi la plus critique : `financeai-storage`, qui porte TOUTES les données de
// l'utilisateur, était écrite en QUATRE endroits, dont un accompagné d'un commentaire demandant de
// la synchroniser à la main.
//
// ⚠️ Cette garde ne réclame donc PAS que toutes les clés passent par le registre. Une clé écrite à
// un seul endroit n'a pas le défaut, et l'y forcer ajouterait un import à des fichiers qui n'en ont
// pas besoin — du bruit qui rend la règle plus facile à ignorer.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';

const racine = process.cwd();
const REGISTRE = 'utils/storageKeys.ts';
/**
 * La copie IRRÉDUCTIBLE : `public/ga-init.js` est chargé avant le bundle et ne peut rien importer.
 * Elle est assumée — mais vérifiée ici, ce qu'un commentaire ne faisait pas.
 */
const HORS_BUNDLE = 'public/ga-init.js';

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        if (nom === 'node_modules' || nom === 'dist' || nom.startsWith('.')) return [];
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return sources(chemin);
        return /\.(ts|tsx)$/.test(chemin) ? [chemin] : [];
    });
}

/** Fichiers qui écrivent la VALEUR d'une clé en littéral (source décommentée). */
function fichiersAvecLitteral(valeur: string): string[] {
    const out: string[] = [];
    for (const chemin of sources(resolve(racine))) {
        const relatif = chemin.replace(`${racine}/`, '');
        if (relatif === REGISTRE) continue;
        // Les tests ont le droit d'écrire une clé en dur : c'est souvent le seul moyen de vérifier
        // qu'elle vaut bien ce qu'on croit, et un test qui importerait le registre ne prouverait
        // rien de plus qu'une tautologie.
        if (relatif.startsWith('tests/')) continue;
        const brut = readFileSync(chemin, 'utf8');
        // ⚠️ Source DÉCOMMENTÉE : `financeai-storage` est NOMMÉE dans une vingtaine de commentaires
        // qui expliquent la persistance. Lue brute, la garde crierait sur de la prose — et c'est
        // précisément la prose qu'on veut garder libre de raconter l'histoire.
        const code = stripCommentsJsx(brut);
        if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
            throw new Error(`${relatif} : décommentage suspect — la garde lirait un fichier vidé`);
        }
        if (code.includes(`'${valeur}'`) || code.includes(`"${valeur}"`) || code.includes(`\`${valeur}\``)) {
            out.push(relatif);
        }
    }
    return out;
}

describe('[STORAGE-KEYS-NO-REGISTRY] une clé partagée s\'écrit en UN seul endroit', () => {
    it('aucune clé du registre n\'est réécrite en littéral ailleurs', () => {
        const offenders: string[] = [];
        for (const [nom, valeur] of Object.entries(STORAGE_KEYS)) {
            for (const f of fichiersAvecLitteral(valeur)) {
                offenders.push(`${f} réécrit « ${valeur} » (STORAGE_KEYS.${nom})`);
            }
        }
        expect(offenders, `Clé(s) de stockage dupliquée(s) :\n${offenders.join('\n')}`).toEqual([]);
    });

    it('le scan VOIT les littéraux — témoin nommé, sinon « aucun offender » ne prouve rien', () => {
        // ⚠️ Anti-vacuité indispensable : la même assertion serait verte si le scan ne lisait aucun
        // fichier, ou si le décommentage effaçait tout. On vérifie donc qu'une chaîne réellement
        // présente dans le code est bien TROUVÉE — et une chaîne absente, non.
        expect(fichiersAvecLitteral('financeai-backups'), 'témoin : cette clé IndexedDB existe en dur')
            .toContain('services/backupAuto.ts');
        expect(fichiersAvecLitteral('cle-qui-nexiste-nulle-part-xyz')).toEqual([]);
    });

    it('la copie HORS BUNDLE de la clé de consentement est à jour', () => {
        // ⚠️ `public/ga-init.js` est chargé AVANT l'app et ne peut rien importer : la duplication est
        // irréductible. Elle était « garantie » par un commentaire demandant de synchroniser à la
        // main — ce qui n'est pas une garantie. Elle est vérifiée ici.
        const chemin = resolve(racine, HORS_BUNDLE);
        expect(existsSync(chemin), `${HORS_BUNDLE} introuvable — l'exemption ne protège plus rien`).toBe(true);
        expect(readFileSync(chemin, 'utf8')).toContain(`'${STORAGE_KEYS.analyticsConsent}'`);
    });

    it('chaque clé du registre est réellement UTILISÉE — un registre ne se remplit pas de souvenirs', () => {
        // Une entrée que plus personne ne consomme est un constat périmé qui se lit comme un fait
        // (`ENTREE-D-INVENTAIRE-FANTOME`). Le registre doit décrire l'app d'aujourd'hui.
        const tout = sources(resolve(racine))
            .filter((c) => !c.includes('/tests/'))
            .map((c) => readFileSync(c, 'utf8'))
            .join('\n');
        for (const nom of Object.keys(STORAGE_KEYS)) {
            const usages = tout.split(`STORAGE_KEYS.${nom}`).length - 1;
            expect(usages, `STORAGE_KEYS.${nom} n'a aucun consommateur`).toBeGreaterThan(0);
        }
    });
});
