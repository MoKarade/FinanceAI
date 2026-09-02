// [AI-REBALANCE-CAUSE-PERDUE] Un service qui rend `[]` sur quatre situations distinctes rend
// l'écran MUET.
//
// ⚠️ `getRebalanceJustifications` répondait `[]` pour : aucune clé, aucune action, une erreur
// d'appel (réseau / quota / clé refusée / 5xx), et « le modèle n'a rien rendu d'exploitable ».
// L'écran ne recevait qu'un tableau vide — il ne POUVAIT pas nommer la cause, quoi qu'on écrive dans
// son message. C'était la seule surface IA du dépôt restée incapable de le faire après
// `[AI-BUDGETMODAL-ERROR-COLLAPSE]`, et la raison n'était pas dans le composant : elle était deux
// appels plus haut, là où l'erreur était jetée.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Ce que le SDK fait au prochain appel : rendre un texte, ou lever. */
    prochaineReponse: '' as string,
    prochaineErreur: null as unknown,
    logError: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: vi.fn(async () => {
                if (mocks.prochaineErreur) throw mocks.prochaineErreur;
                return { content: [{ type: 'text', text: mocks.prochaineReponse }] };
            }),
        };
    },
}));
vi.mock('../../services/errorLogger', () => ({ logError: mocks.logError }));

import { getRebalanceJustifications } from '../../services/claude';

const actions = [
    { id: 'a1', label: 'VFV.TO', action: 'Réduire', currentPct: 22, targetPct: 15, diffAmount: -5000 },
] as never;

beforeEach(() => {
    mocks.prochaineErreur = null;
    mocks.prochaineReponse = '';
    mocks.logError.mockClear();
});

describe('[AI-REBALANCE-CAUSE-PERDUE] chaque situation a sa FORME', () => {
    it('aucune clé et aucune action ne se disent PAS pareil', async () => {
        // ⚠️ Les deux rendaient `[]`. « Rien à justifier » n'est même pas un échec : afficher du
        // rouge dessus serait faux, alors qu'une clé absente demande une action de l'utilisateur.
        expect(await getRebalanceJustifications(actions, '')).toEqual({ forme: 'sans-cle' });
        expect(await getRebalanceJustifications([] as never, 'sk-test')).toEqual({ forme: 'rien-a-justifier' });
    });

    it('une ERREUR d\'appel remonte l\'erreur ELLE-MÊME — c\'est elle qui porte le statut', async () => {
        // ⚠️ Le point du lot : sans l'objet d'erreur, l'écran ne peut pas distinguer un 429 d'une
        // coupure réseau, et son message ne peut être qu'une phrase vague ou une accusation inventée.
        mocks.prochaineErreur = Object.assign(new Error('Too Many Requests'), { status: 429 });
        const res = await getRebalanceJustifications(actions, 'sk-test');
        expect(res.forme).toBe('echec');
        if (res.forme === 'echec') {
            // L'objet ORIGINAL, pas une copie appauvrie : c'est `.status` qui nomme la cause.
            expect((res.err as { status?: number }).status).toBe(429);
        }
        expect(mocks.logError, 'un échec doit rester tracé, pas seulement remonté').toHaveBeenCalled();
    });

    it('une réponse INEXPLOITABLE se distingue d\'un échec d\'appel', async () => {
        // Le service a répondu ; c'est le MODÈLE qui n'a rien dit d'utilisable. Confondre les deux
        // enverrait l'utilisateur vérifier sa connexion pour un problème de prompt.
        mocks.prochaineReponse = 'je ne peux pas répondre à ça';
        expect(await getRebalanceJustifications(actions, 'sk-test')).toEqual({ forme: 'sans-reponse' });
        // Un tableau VIDE mais valide compte aussi : le bouton n'apparaît que s'il y a au moins une
        // action à justifier, donc « zéro justification » n'est pas un succès.
        mocks.prochaineReponse = '[]';
        expect(await getRebalanceJustifications(actions, 'sk-test')).toEqual({ forme: 'sans-reponse' });
    });

    it('le cas NOMINAL rend les justifications — sinon les trois autres seraient vacueux', async () => {
        // ⚠️ Contrôle : sans lui, « chaque échec a sa forme » serait aussi vrai d'un service qui
        // échoue TOUJOURS.
        mocks.prochaineReponse = JSON.stringify([{ actionId: 'a1', reason: 'Position au-dessus de la cible.' }]);
        const res = await getRebalanceJustifications(actions, 'sk-test');
        expect(res.forme).toBe('ok');
        if (res.forme === 'ok') {
            expect(res.justifications).toHaveLength(1);
            expect(res.justifications[0].actionId).toBe('a1');
        }
    });
});
