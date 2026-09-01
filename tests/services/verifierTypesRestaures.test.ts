// [BACKUP-SCHEMA-NON-TYPE] La garde de TYPE des deux entrées non validées.
//
// ⚠️ Ce que ces tests protègent vraiment. La garde du lot 38 scanne la FINITUDE des paramètres du
// moteur ; elle est aveugle à une CHAÎNE, qui traverse l'arithmétique sans jamais devenir non finie.
// Mesuré : `projection.inflationRate = "2"` → −68 M$, une chaîne dans un montant de projet
// immobilier → −52 %, chaque fois 0 refus et 0 valeur non finie publiée. C'est encore le mode
// « absorbé » : rien ne crie, tout est faux.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifierTypesRestaures, messageDeRefusTypes, CHAMPS_TEXTE } from '../../services/verifierTypesRestaures';
import { TEST_PERSONAS, getPersonaOrDefault } from '../../services/testPersonas';
import { useFinanceStore } from '../../store/useFinanceStore';
import { INITIAL_PROJECTION } from '../../constants';
import type { AppState } from '../../types';

/** ⚠️ Un état NEUF par cas — jamais partagé (`[TEST-PERSONA-FIXTURE-PARTAGEE]`, lot 33). */
const avecProjection = (e: AppState): AppState => {
    e.projection = { ...INITIAL_PROJECTION } as AppState['projection'];
    return e;
};
const etat = (): AppState => avecProjection(getPersonaOrDefault('couple-confort').build() as AppState);
const champ = (o: unknown): Record<string, unknown> => o as Record<string, unknown>;

describe('[BACKUP-SCHEMA-NON-TYPE] une chaîne dans un montant est refusée', () => {
    it('refuse le canal au plus gros écart — `projection.inflationRate` en texte (−68 M$)', () => {
        const e = etat();
        champ(e.projection).inflationRate = '2';
        expect(verifierTypesRestaures(e).map((f) => f.chemin)).toContain('projection.inflationRate');
    });

    it('refuse un montant IMBRIQUÉ, que seul un parcours récursif atteint', () => {
        const e = etat();
        const p = champ(e.projection);
        p.returnRates = { ...(p.returnRates as Record<string, unknown>), cash: '5' };
        expect(verifierTypesRestaures(e).map((f) => f.chemin)).toContain('projection.returnRates.cash');
    });

    it('refuse le canal mesuré à −52 % — un montant de projet immobilier en texte', () => {
        const e = etat();
        // ⚠️ Le chemin est vérifié, pas supposé : une première version de cette mesure écrivait
        // `realEstate[0].closingCosts`, un tableau ABSENT du persona et un champ qui n'existe pas.
        // Elle rendait « aucun refus » — un faux trou, qui aurait pu passer pour un vrai.
        expect(e.realEstateGoals?.length ?? 0).toBeGreaterThan(0);
        champ(e.realEstateGoals[0]).totalClosingCosts = '15000';
        expect(verifierTypesRestaures(e).map((f) => f.chemin))
            .toContain('realEstateGoals.0.totalClosingCosts');
    });

    it('refuse dans les conteneurs que le backup exporte AUSSI (dette, budget, salaire)', () => {
        const cas: Array<[string, (e: AppState) => void]> = [
            ['debts.0.balance', (e) => { champ(e.debts[0]).balance = '10000'; }],
            ['budgetItems.0.target', (e) => { champ(e.budgetItems[0]).target = '1e999'; }],
            ['config.users.0.netSalary', (e) => { champ(e.config.users[0]).netSalary = '5000'; }],
            ['transactions.0.amount', (e) => { champ(e.transactions[0]).amount = '-42'; }],
        ];
        for (const [chemin, corrompre] of cas) {
            const e = etat();
            corrompre(e);
            expect(verifierTypesRestaures(e).map((f) => f.chemin), chemin).toContain(chemin);
        }
    });

    it('garde la valeur fautive TELLE QUELLE, sans la convertir', () => {
        // `no-fake-data` vaut aussi dans un flux de diagnostic : coercer `"1e999"` en `Infinity`
        // enverrait chercher un nombre là où la donnée est un texte (leçon du lot 38).
        const fautifs = verifierTypesRestaures({ balance: '1e999' });
        expect(fautifs[0].valeur).toBe('1e999');
    });
});

describe('[BACKUP-SCHEMA-NON-TYPE] ce qui NE doit pas être refusé', () => {
    // ⚠️ CANARI, et c'est le contre-poids de tout le lot. Marc a choisi de lister les champs TEXTE
    // plutôt que les 213 champs numériques, parce que l'oubli d'un champ texte est BRUYANT — un faux
    // refus — là où l'oubli d'un champ numérique rouvrirait un canal en silence. Ce test est ce qui
    // rend cet arbitrage tenable : il transforme le faux refus en échec de CI. Un champ texte ajouté
    // au produit sans être ajouté à la liste rougit ICI, pas chez Marc.
    it('ne refuse RIEN sur les sept personas ni sur l\'état initial du store', () => {
        const cas: Array<{ nom: string; objet: unknown }> = [
            { nom: 'état initial du store', objet: JSON.parse(JSON.stringify(useFinanceStore.getState())) },
            ...TEST_PERSONAS.map((p) => ({
                nom: `persona ${p.id}`,
                objet: avecProjection(p.build() as AppState) as unknown,
            })),
        ];
        const refuses = cas.map((c) => ({
            nom: c.nom,
            champs: verifierTypesRestaures(c.objet).map((f) => `${f.chemin}="${String(f.valeur)}"`),
        }));
        expect(refuses).toHaveLength(8);
        expect(refuses.filter((r) => r.champs.length > 0)).toEqual([]);
    });

    it('ne refuse rien sur des états DÉGRADÉS mais légitimes', () => {
        const degradations: Array<[string, (e: AppState) => void]> = [
            ['app neuve (tout vide)', (e) => {
                e.assets = []; e.transactions = []; e.budgetItems = [];
                e.debts = []; e.realEstateGoals = []; e.travelGoals = []; e.lifeEvents = [];
            }],
            ['sans emploi (salaires à 0)', (e) => {
                e.config.users.forEach((u) => { champ(u).netSalary = 0; champ(u).grossSalary = 0; });
            }],
            ['noms vides', (e) => { e.config.users.forEach((u) => { champ(u).name = ''; }); }],
            ['projection absente', (e) => { delete (e as Partial<AppState>).projection; }],
        ];
        for (const [nom, degrader] of degradations) {
            const e = etat();
            degrader(e);
            expect(verifierTypesRestaures(e).map((f) => f.chemin), nom).toEqual([]);
        }
    });

    it('ne refuse rien sur l\'HISTORIQUE DE CHAT — une surface qu\'aucun persona ne porte', () => {
        // ⚠️ Le cas qui manquait à la mesure initiale. Les personas ne portent aucune conversation,
        // alors que `partialize` les persiste : la surface la plus riche en TEXTE libre de l'app
        // n'était donc couverte par aucun contrôle. Elle passe — mais grâce à la dérivation depuis
        // `types.ts`, pas grâce aux états mesurés. C'est la même leçon que `version: '3.2'` :
        // une liste se vérifie sur chaque surface qu'elle garde, pas sur la plus familière.
        const etatAvecChat = {
            ...(etat() as unknown as Record<string, unknown>),
            aiConversations: [{
                id: 'c1',
                title: 'Ma retraite ?',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-02T00:00:00Z',
                model: 'sonnet',
                messages: [
                    { role: 'user', text: 'Puis-je prendre ma retraite à 60 ans ?', timestamp: '2026-01-01T00:00:00Z', id: 'm1' },
                    { role: 'model', text: 'Voici la réponse…', timestamp: '2026-01-01T00:01:00Z', id: 'm2', toolsUsed: ['Situation fiscale'] },
                ],
            }],
            activeAiConversationId: 'c1',
            aiChatModel: 'sonnet',
            aiChatCostUsdTotal: 0.42,
        };
        expect(verifierTypesRestaures(etatAvecChat).map((f) => f.chemin)).toEqual([]);
    });

    it('[INCIDENT 2026-09-01] ne refuse RIEN sur un état qui porte des comptes bancaires synchronisés', () => {
        // ⚠️ LE CAS QUI A VIDÉ L'APP DE MARC. `accountId` est un `number` dans `Transaction` et un
        // `string` dans `FintableBrokerBalance` — la seule clé du contrat à porter les deux types.
        // La mesure qui justifiait la liste (« zéro collision ») portait sur les états DU DÉPÔT, et
        // aucun persona ne porte de données Fintable : la collision était donc invisible.
        //
        // Effet réel : `merge` levait, l'app se réhydratait VIDE à chaque lancement, et la
        // restauration Drive rejouait le refus (le pull appelle `persist.rehydrate()`). Vu de
        // l'utilisateur, c'est indiscernable d'une perte totale de données.
        const etatAvecBanque = {
            ...(etat() as unknown as Record<string, unknown>),
            fintableBrokerBalances: [
                { accountId: 'acc_9f3c1', label: 'REER Disnat', balanceCad: 128_400, taxRegime: 'REER' },
            ],
            holdings: [
                { symbol: 'VFV.TO', quantity: 120, price: 148.2, amount: 17_784, currency: 'CAD', accountId: 'acc_9f3c1' },
            ],
            // Le même nom de clé, en NOMBRE cette fois : les deux doivent passer.
            transactions: [
                { id: 1, date: '2026-08-01', payee: 'Épicerie', amount: -142.3, category: 'Épicerie', accountId: 4, status: 'processed' },
            ],
        };
        expect(verifierTypesRestaures(etatAvecBanque).map((f) => f.chemin)).toEqual([]);
    });

    it('[garde de dérivation] tout champ TEXTUEL du contrat figure dans la liste blanche', () => {
        // ⚠️ La vraie leçon de l'incident n'est pas « il manquait `accountId` », c'est que la liste
        // était dérivée des états MESURÉS — donc aveugle à toute surface que le dépôt ne porte pas.
        // Elle se dérive désormais du CONTRAT : un champ déclaré textuel dans `types.ts` et absent
        // d'ici est un refus garanti chez qui utilise la fonctionnalité correspondante.
        const types = readFileSync(resolve(process.cwd(), 'types.ts'), 'utf8');
        const textuels = new Set<string>();
        for (const m of types.matchAll(/^\s*(?:readonly\s+)?([A-Za-z_][\w]*)\??\s*:\s*([^;]+);/gm)) {
            const [, cle, brut] = m;
            const type = brut.trim();
            // ⚠️ `Record<string, number>` est indexé PAR des chaînes mais ne porte que des nombres :
            // ses valeurs ne sont jamais jugées sous cette clé. Sans cette exclusion, la garde
            // réclamerait `initialBalances` et `investmentTargetPcts` — deux faux positifs mesurés.
            const sansIndex = type.replace(/Record<\s*string\s*,/g, 'Record<K,');
            if (/\bstring\b/.test(sansIndex) || /^'[^']*'(\s*\|\s*'[^']*')+$/.test(sansIndex)) textuels.add(cle);
        }
        // Anti-vacuité : le contrat EN A, et en nombre — sinon « aucun manquant » ne dirait rien.
        expect(textuels.size).toBeGreaterThan(50);
        expect(textuels.has('accountId'), 'témoin : la clé de l\'incident doit être vue par ce scan').toBe(true);

        const manquants = [...textuels].filter((c) => !CHAMPS_TEXTE.has(c)).sort();
        expect(
            manquants,
            'champ déclaré TEXTUEL dans types.ts mais absent de CHAMPS_TEXTE : toute donnée réelle qui '
            + 'le porte fera échouer la réhydratation et VIDERA l\'app. Ajoute-le à la liste.',
        ).toEqual([]);
    });

    it('[garde de dérivation, 2e surface] tout champ textuel PERSISTÉ du store figure dans la liste', () => {
        // ⚠️ `AppState` n'est PAS toute la surface persistée : le store ajoute ses propres champs
        // (`revealedProjectionSig`, `activeTestPersonaId`, …) et `partialize` en exclut seulement
        // huit. La dérivation d'origine n'avait lu que `types.ts` — d'où deux des trois clés
        // manquantes de l'incident. Une liste se dérive de CHAQUE surface qu'elle garde.
        const fichier = readFileSync(resolve(process.cwd(), 'store/useFinanceStore.ts'), 'utf8');
        // ⚠️ On borne au CORPS de `FinanceState` : le même fichier déclare `PendingFocus` et
        // `MigrationStatus`, qui ne sont PAS l'état persisté. Sans cette borne, le scan réclamait
        // `section` et `backupKey` — deux clés qui ne traversent jamais la persistance, et les
        // ajouter aurait gonflé la liste blanche avec des noms que rien ne justifie.
        const debut = fichier.indexOf('export interface FinanceState');
        const fin = fichier.indexOf('\n}', debut);
        expect(debut, 'interface FinanceState introuvable — le scan ne borne plus rien').toBeGreaterThan(0);
        const store = fichier.slice(debut, fin);
        // Les huit clés que `partialize` retire : elles ne sont jamais relues, donc hors périmètre.
        const EXCLUS_DE_LA_PERSISTANCE = new Set([
            'apiKeys', 'activeTab', 'isPrivacyMode', 'lastProjection',
            'projectionStatus', 'projectionRefus', 'lockedProjection', 'pendingFocus',
        ]);
        const textuels = new Set<string>();
        for (const m of store.matchAll(/^ {4}([A-Za-z_][\w]*)\??\s*:\s*([^;=]+);/gm)) {
            const [, cle, brut] = m;
            const type = brut.trim().replace(/Record<\s*string\s*,/g, 'Record<K,');
            if (!/\bstring\b/.test(type)) continue;
            // ⚠️ Une MÉTHODE du store n'est pas un champ persisté. `=>` ne suffit pas : une
            // signature multi-lignes (`updateApiKeys: (keys: { anthropic: string; … }) => void`)
            // est coupée avant sa flèche par la capture. C'est la parenthèse OUVRANTE qui tranche.
            if (/=>/.test(type) || type.startsWith('(')) continue;
            if (EXCLUS_DE_LA_PERSISTANCE.has(cle)) continue;
            textuels.add(cle);
        }
        // Anti-vacuité + témoins : les deux clés que l'incident a révélées doivent être VUES ici.
        expect(textuels.size).toBeGreaterThan(0);
        expect(textuels.has('revealedProjectionSig')).toBe(true);
        expect(textuels.has('activeTestPersonaId')).toBe(true);

        const manquants = [...textuels].filter((c) => !CHAMPS_TEXTE.has(c)).sort();
        expect(
            manquants,
            'champ TEXTUEL du store, PERSISTÉ, absent de CHAMPS_TEXTE : il videra l\'app au lancement.',
        ).toEqual([]);
    });

    it('ne refuse pas un TABLEAU de chaînes — ses éléments sont jugés sur la clé du tableau', () => {
        // Sans cette règle, `tags: ['a','b']` verrait ses éléments jugés sur la clé `'0'`, absente de
        // la liste : toute liste de textes de l'app deviendrait un refus.
        expect(verifierTypesRestaures({ toolsUsed: ['a', 'b'] })).toEqual([]);
        expect(verifierTypesRestaures({ balance: ['10000'] }).map((f) => f.chemin)).toEqual(['balance.0']);
    });

    it('ne refuse ni `null`, ni un booléen, ni un nombre', () => {
        expect(verifierTypesRestaures({ balance: null, actif: true, montant: 42 })).toEqual([]);
    });
});

describe('[BACKUP-SCHEMA-NON-TYPE] le message montré', () => {
    it('nomme les champs sans jamais exposer un chemin technique', () => {
        const e = etat();
        champ(e.projection).inflationRate = '2';
        const msg = messageDeRefusTypes(verifierTypesRestaures(e));
        expect(msg).toContain('inflationRate');
        expect(msg).not.toContain('projection.inflationRate');
        expect(msg).toContain('rien n\'a été modifié');
    });

    it('ne répète pas le même nom de champ pour deux occurrences', () => {
        const fautifs = verifierTypesRestaures({
            debts: [{ balance: '1' }, { balance: '2' }],
        });
        expect(fautifs).toHaveLength(2);
        expect(messageDeRefusTypes(fautifs).match(/balance/g) ?? []).toHaveLength(1);
    });

    it('rend une chaîne vide quand il n\'y a rien à dire', () => {
        expect(messageDeRefusTypes([])).toBe('');
    });
});
