// mcp/marche/fichierMarche.ts
//
// [MARCHE-FICHIER] Le contenu du fichier Drive du magasin de marché : le magasin (clôtures, taux) ET la
// liste des titres à tenir à jour (`cibles`). Fichier SÉPARÉ de l'état de l'app (ADR 0019 §3) : l'app ne
// l'écrit jamais, la route `POST /market-store` est son seul écrivain.
//
// PUR : aucune entrée-sortie. `rev` est le compteur de concurrence : chaque écriture l'incrémente, et
// l'écrivain refuse d'écraser un fichier dont le `rev` n'est pas celui qu'il a lu.
//
// ⚠️ Un fichier mal formé est refusé EN ENTIER avec ses raisons, jamais réparé (même règle que le magasin :
// un point corrigé en silence deviendrait un cours « officiel » inventé). Les raisons de `cibles` ne portent
// ni ISIN ni symbole ; celles du magasin peuvent nommer un ISIN : la route ne les renvoie donc JAMAIS à
// l'appelant (réponse = code fixe + nombre d'erreurs), elles restent dans le journal du serveur.
import type { CibleCloture } from '../../services/marche/passeMagasin';
import { lireMagasin, magasinVide, type MagasinMarche } from '../../services/marche/magasinMarche';
import { symboleEodhdValide } from '../../services/marche/clientsMarche';

const VERSION_FICHIER = 1 as const;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const DEVISES: readonly string[] = ['CAD', 'USD', 'EUR'];

export interface FichierMarche {
    version: typeof VERSION_FICHIER;
    /** Compteur de concurrence : 1 à la création, +1 à chaque écriture. */
    rev: number;
    magasin: MagasinMarche;
    /** Les titres à relire. Vide tant que le référentiel (résolution ISIN → symbole EODHD) n'a rien posé. */
    cibles: CibleCloture[];
}

export function fichierVide(maintenant: string): FichierMarche {
    return { version: VERSION_FICHIER, rev: 0, magasin: magasinVide(maintenant), cibles: [] };
}

export type LectureFichier = { ok: true; fichier: FichierMarche } | { ok: false; erreurs: string[] };

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function lireFichierMarche(json: unknown): LectureFichier {
    if (!estObjet(json)) return { ok: false, erreurs: ['fichier : pas un objet'] };
    const erreurs: string[] = [];
    if (json.version !== VERSION_FICHIER) erreurs.push('fichier : version inconnue');
    if (!Number.isInteger(json.rev) || (json.rev as number) < 0) erreurs.push('fichier : rev illisible');
    const magasin = lireMagasin(json.magasin);
    if (!magasin.ok) erreurs.push(...magasin.erreurs.map((e) => `magasin : ${e}`));
    const cibles: CibleCloture[] = [];
    if (!Array.isArray(json.cibles)) erreurs.push('fichier : cibles absentes');
    else {
        json.cibles.forEach((c: unknown, i: number) => {
            const ou = `cibles[${i}]`;
            if (!estObjet(c)) { erreurs.push(`${ou} : pas un objet`); return; }
            if (typeof c.isin !== 'string' || !ISIN.test(c.isin)) { erreurs.push(`${ou} : ISIN mal formé`); return; }
            if (!symboleEodhdValide(c.symboleEodhd)) { erreurs.push(`${ou} : symbole EODHD mal formé`); return; }
            if (typeof c.devise !== 'string' || !DEVISES.includes(c.devise)) { erreurs.push(`${ou} : devise inconnue`); return; }
            cibles.push({ isin: c.isin, symboleEodhd: c.symboleEodhd, devise: c.devise as CibleCloture['devise'] });
        });
    }
    if (erreurs.length > 0 || !magasin.ok) return { ok: false, erreurs };
    return { ok: true, fichier: { version: VERSION_FICHIER, rev: json.rev as number, magasin: magasin.magasin, cibles } };
}
