// [VEHICULE-BAIL] La valeur de `FINANCEAI_VEHICULE_DETTE` ne doit JAMAIS entrer dans un log.
//
// Ce que cette garde défend : `mcp/bootstrap.ts` porte la convention en toutes lettres
// (`[MCP-CLOUDRUN-DEPLOY-LOGS] jamais l'email complet dans les logs`) et masque l'email Drive
// au domaine seul. Mon premier jet du log de démarrage interpolait le NOM de la dette en clair
// — un nom que Marc choisit, donc qui peut porter un numéro de contrat ou une plaque, et qui
// part vers Cloud Logging sur le chemin Cloud Run. Trouvé par la revue de sécurité du lot, pas
// par le gate : aucune garde ne lisait ce fichier.
//
// ⚠️ Ce qui est gardé est le FAIT (« la valeur ne sort pas »), jamais la FORME qu'avait le log.
// Le message garde son information utile — que la variable soit POSÉE se voit encore au
// démarrage ; c'est sa VALEUR qui n'a rien à faire là, et une faute de frappe dedans se dit
// ailleurs (la route répond 404/409 en nommant les candidates à l'appelant authentifié).
//
// ⚠️ Le log CONTINUE de nommer la variable `FINANCEAI_VEHICULE_DETTE` — au démarrage, la
// question utile est « ma variable est-elle prise en compte ? ». Ce n'est PAS gardé ici, et
// c'est délibéré : mesuré, une assertion sur cette mention est satisfaite par le
// `process.env.FINANCEAI_VEHICULE_DETTE` de la lecture d'environnement, donc elle ne
// discriminerait rien — une garde qui ne peut pas tirer n'est pas une protection.
//
// ⚠️ Lecture DÉCOMMENTÉE obligatoire : c'est une assertion d'ABSENCE, et la meilleure façon
// d'expliquer un motif interdit est de l'écrire (leçon `SCAN-QUI-MATCHE-LA-PROSE`). Le
// commentaire ci-dessus en est la preuve vivante — il NOMME la variable.

import { describe, it, expect } from 'vitest';
import { readCodeOnly } from '../helpers/source';

const FICHIER = 'mcp/http.ts';

// Témoin de décommentage : un vrai jeton de code de ce fichier, qui prouve que le lecteur
// n'a pas tout mangé — sinon « rien n'interpole le nom » se démontrerait à partir de
// « il n'y a plus rien ».
const TEMOIN = 'createServer';

describe('log de démarrage — aucun identifiant de Marc en clair', () => {
    it('la VALEUR de FINANCEAI_VEHICULE_DETTE n\'est interpolée nulle part', () => {
        const code = readCodeOnly(FICHIER, TEMOIN);
        expect(code).not.toContain('${vehiculeNomDette}');
    });

    it('anti-vacuité : la variable EXISTE encore dans ce fichier', () => {
        // Sans ce cas, retirer complètement la fonctionnalité rendrait la garde ci-dessus
        // verte pour la mauvaise raison — elle serait satisfaite par la disparition de son objet.
        const code = readCodeOnly(FICHIER, TEMOIN);
        expect(code).toContain('vehiculeNomDette');
    });

});
