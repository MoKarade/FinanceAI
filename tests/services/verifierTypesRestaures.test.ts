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
import { verifierTypesRestaures, messageDeRefusTypes, resumeTechniqueDesFautifs, CHAMPS_TEXTE, CHAMPS_BOOLEENS, LONGUEUR_MAX_DIAGNOSTIC } from '../../services/verifierTypesRestaures';
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
    it('ne refuse RIEN sur les huit personas ni sur l\'état initial du store', () => {
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
        expect(refuses).toHaveLength(9); // 8 personas + l'état initial du store
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

    it('[INCIDENT 2026-09-01, 2e vague] ne refuse RIEN sur un rôle de compte Fintable « dette »', () => {
        // ⚠️ Le correctif de la 1re vague n'a PAS suffi, et c'est la garde de dérivation elle-même
        // qui était aveugle : son extracteur ancrait le nom du champ en DÉBUT DE LIGNE, donc il ne
        // voyait aucun champ déclaré dans un littéral de type EN LIGNE. `FintableAccountRoleConfig`
        // est exactement ça — une union dont chaque membre tient sur une ligne :
        //
        //     | { kind: 'debt'; debtName: string }
        //
        // `debtName` était donc invisible au scan CENSÉ empêcher un oubli, et l'app de Marc s'est
        // vidée une seconde fois sur ce champ. Un recenseur ancré sur la FORME du code ne couvre que
        // les formes qu'il a croisées en l'écrivant.
        const etatAvecRoles = {
            ...(etat() as unknown as Record<string, unknown>),
            fintableRoles: {
                acc_01KYQ1R472D9SHC12VB3JMSC0H: { kind: 'debt', debtName: 'Mastercard Cash Back' },
                acc_01M0AM4WER91HA2Y8BGZA9ENJB: { kind: 'debt', debtName: 'Marge de crédit' },
                acc_01QCASH: { kind: 'cash' },
                acc_01QINV: { kind: 'investment', taxRegime: 'CELI' },
            },
        };
        expect(verifierTypesRestaures(etatAvecRoles).map((f) => f.chemin)).toEqual([]);
    });

    it('[garde de dérivation] tout champ TEXTUEL du contrat figure dans la liste blanche', () => {
        // ⚠️ La vraie leçon de l'incident n'est pas « il manquait `accountId` », c'est que la liste
        // était dérivée des états MESURÉS — donc aveugle à toute surface que le dépôt ne porte pas.
        // Elle se dérive désormais du CONTRAT : un champ déclaré textuel dans `types.ts` et absent
        // d'ici est un refus garanti chez qui utilise la fonctionnalité correspondante.
        const types = readFileSync(resolve(process.cwd(), 'types.ts'), 'utf8');
        const textuels = new Set<string>();
        // ⚠️ Un champ ne commence pas toujours une LIGNE. Le premier jet ancrait sur `^`, donc il
        // ratait tout littéral de type en ligne — `| { kind: 'debt'; debtName: string }`. C'est ce
        // trou qui a vidé l'app une seconde fois. Le nom se reconnaît désormais aussi APRÈS un `{`
        // ou un `;`, et la valeur s'arrête au `;` OU à l'accolade fermante. Mesuré : 76 → 78 clés
        // vues, zéro perdue ; les deux gagnées sont `debtName` et `kind`.
        for (const m of types.matchAll(/(?:^|(?<=[{;]))\s*(?:readonly\s+)?([A-Za-z_][\w]*)\??\s*:\s*([^;}]+)[;}]/gm)) {
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
        // ⚠️ Second témoin, et c'est lui qui vaut : `debtName` n'existe QUE dans un littéral en
        // ligne. Ancré sur `^`, le scan ne le voyait pas — le témoin échoue alors, au lieu de
        // laisser croire qu'il n'y avait rien à trouver.
        expect(textuels.has('debtName'), 'témoin : un champ déclaré dans un littéral EN LIGNE doit être vu').toBe(true);

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
        // ⚠️ Même élargissement que ci-dessus, et pour la même raison : l'ancrage `^ {4}` ne voyait
        // que les champs de premier niveau écrits seuls sur leur ligne.
        for (const m of store.matchAll(/(?:^|(?<=[{;]))\s*(?:readonly\s+)?([A-Za-z_][\w]*)\??\s*:\s*([^;}]+)[;}]/gm)) {
            const [, cle, brut] = m;
            const type = brut.trim().replace(/Record<\s*string\s*,/g, 'Record<K,');
            if (!/\bstring\b/.test(type)) continue;
            // ⚠️ Une MÉTHODE du store n'est pas un champ persisté. Le filtre se pose sur la LIGNE,
            // pas sur le type capturé : élargi aux littéraux en ligne, le scan voit maintenant
            // l'INTÉRIEUR des signatures (`updateApiKeys: (keys: { anthropic: string; finnhub?: string }) => void`),
            // dont les champs ne sont pas persistés. Mesuré : sans ce filtre, `finnhub` entrait ici.
            const ligne = store.slice(store.lastIndexOf('\n', m.index) + 1, store.indexOf('\n', m.index));
            if (/=>/.test(ligne) || type.startsWith('(')) continue;
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

    it('[INCIDENT] le diagnostic affiché SURVIT à la troncature — les chemins sont la seule partie utile', () => {
        // ⚠️ Pendant l'incident, `SystemView` tronquait la ligne à 80 caractères. Le seul préfixe en
        // fait 95 : la coupe tombait EXACTEMENT avant les chemins, dans l'écran qu'on demande à
        // l'utilisateur d'ouvrir pour se diagnostiquer. Un diagnostic amputé de sa conclusion n'est
        // pas un diagnostic — et deux bornes sur la même grandeur, c'est la plus bête qui gagne
        // (`PLAFOND_CITATIONS` bornait déjà le message à cinq chemins).
        const fautifs = Array.from({ length: 9 }, (_, i) => ({
            chemin: `transactions.${i}.accountId`, cle: 'accountId', valeur: 'acc_9f3c1',
        }));
        const message = `Error: ${resumeTechniqueDesFautifs(fautifs)}`;
        const affiche = message.slice(0, LONGUEUR_MAX_DIAGNOSTIC);
        // Le cas le PIRE : plafond de citations atteint (5 chemins) + le compteur de reste.
        expect(message).toContain('+4');
        expect(affiche, 'la troncature coupe les chemins — le diagnostic devient inexploitable')
            .toBe(message);
        expect(affiche).toContain('transactions.4.accountId');
    });

    it('ne refuse pas un TABLEAU de chaînes — ses éléments sont jugés sur la clé du tableau', () => {
        // Sans cette règle, `tags: ['a','b']` verrait ses éléments jugés sur la clé `'0'`, absente de
        // la liste : toute liste de textes de l'app deviendrait un refus.
        expect(verifierTypesRestaures({ toolsUsed: ['a', 'b'] })).toEqual([]);
        expect(verifierTypesRestaures({ balance: ['10000'] }).map((f) => f.chemin)).toEqual(['balance.0']);
    });

    it('ne refuse ni `null`, ni un nombre, ni un booléen sur une clé DÉCLARÉE booléenne', () => {
        // ⚠️ INVERSÉ au lot 199 : jusque-là ce cas passait `actif: true` — une clé inventée — et
        // affirmait qu'un booléen n'est JAMAIS refusé. C'était le canal laissé ouvert
        // (`[BACKUP-BOOLEEN-DANS-UN-MONTANT]`), désormais fermé : un booléen n'est légitime que sur
        // une clé de `CHAMPS_BOOLEENS`. La clé témoin devient `isActive`, déclarée dans `types.ts`.
        expect(verifierTypesRestaures({ balance: null, isActive: true, montant: 42 })).toEqual([]);
    });
});

describe('[BACKUP-BOOLEEN-DANS-UN-MONTANT] un booléen dans un montant est refusé (lot 199)', () => {
    // `true + 1 === 2` : un booléen traverse l'arithmétique comme une chaîne, sans jamais devenir
    // non fini. MESURÉ sur `couple-confort` (horizon 40 ans), 0 refus avant ce lot :
    //   · `config.users[0].netSalary = true` → patrimoine successoral −91,9 % (9,74 M$ → 0,79 M$) ;
    //   · `budgetItems[0].target = false` → −2,7 % ; `debts[0].balance = true` → +0,2 %.
    it('refuse le canal au plus gros écart — le salaire net en booléen (−91,9 %)', () => {
        const e = etat();
        champ(e.config.users[0]).netSalary = true;
        expect(verifierTypesRestaures(e).map((f) => f.chemin)).toContain('config.users.0.netSalary');
    });

    it('refuse `false` autant que `true`, et dans les conteneurs que le backup exporte', () => {
        const cas: Array<[string, (e: AppState) => void]> = [
            ['budgetItems.0.target', (e) => { champ(e.budgetItems[0]).target = false; }],
            ['debts.0.balance', (e) => { champ(e.debts[0]).balance = true; }],
            ['transactions.0.amount', (e) => { champ(e.transactions[0]).amount = true; }],
            ['projection.inflationRate', (e) => { champ(e.projection).inflationRate = true; }],
        ];
        for (const [chemin, muter] of cas) {
            const e = etat();
            muter(e);
            expect(verifierTypesRestaures(e).map((f) => f.chemin), chemin).toContain(chemin);
        }
    });

    it('garde la valeur fautive TELLE QUELLE (`false` n\'est pas coercé en 0)', () => {
        const fautifs = verifierTypesRestaures({ balance: false });
        expect(fautifs[0].valeur).toBe(false);
    });

    it('le message nomme le canal : « du texte ou un booléen »', () => {
        const e = etat();
        champ(e.debts[0]).balance = true;
        expect(messageDeRefusTypes(verifierTypesRestaures(e))).toContain('booléen');
        expect(resumeTechniqueDesFautifs(verifierTypesRestaures(e))).toContain('booléen');
    });

    it('[garde de dérivation] tout champ BOOLÉEN de types.ts figure dans CHAMPS_BOOLEENS', () => {
        // Même arbitrage que pour les textes : l'oubli d'un booléen déclaré est un faux refus BRUYANT,
        // et c'est ce test qui le transforme en échec de CI avant qu'il ne vide l'app de quiconque.
        const types = readFileSync(resolve(process.cwd(), 'types.ts'), 'utf8');
        const booleens = new Set<string>();
        for (const m of types.matchAll(/(?:^|(?<=[{;]))\s*(?:readonly\s+)?([A-Za-z_][\w]*)\??\s*:\s*([^;}]+)[;}]/gm)) {
            const [, cle, brut] = m;
            const type = brut.trim();
            // ⚠️ Un `Record<…, boolean>` (`setupOptOut`) porte ses booléens sous SES clés, jamais sous la
            // sienne : la clé du conteneur n'est pas un champ booléen. Ses clés réelles sont la 3e
            // surface, mesurée sur les états du dépôt (voir le test suivant).
            if (/Record</.test(type)) continue;
            if (/\bboolean\b/.test(type)) booleens.add(cle);
        }
        expect(booleens.size).toBeGreaterThan(40); // mesuré : 58
        expect(booleens.has('useTheoretical'), 'témoin : un booléen de ProjectionConfig doit être vu').toBe(true);
        const manquants = [...booleens].filter((c) => !CHAMPS_BOOLEENS.has(c)).sort();
        expect(manquants, 'champ BOOLÉEN de types.ts absent de CHAMPS_BOOLEENS : toute donnée réelle qui le porte VIDERA l\'app.').toEqual([]);
    });

    it('[garde de dérivation, 2e surface] tout champ booléen PERSISTÉ du store figure dans la liste', () => {
        const fichier = readFileSync(resolve(process.cwd(), 'store/useFinanceStore.ts'), 'utf8');
        const debut = fichier.indexOf('export interface FinanceState');
        const fin = fichier.indexOf('\n}', debut);
        expect(debut).toBeGreaterThan(0);
        const store = fichier.slice(debut, fin);
        const booleens = new Set<string>();
        for (const m of store.matchAll(/(?:^|(?<=[{;]))\s*(?:readonly\s+)?([A-Za-z_][\w]*)\??\s*:\s*([^;}]+)[;}]/gm)) {
            const [, cle, brut] = m;
            const type = brut.trim();
            if (!/\bboolean\b/.test(type)) continue;
            const ligne = store.slice(store.lastIndexOf('\n', m.index) + 1, store.indexOf('\n', m.index));
            if (/=>/.test(ligne) || type.startsWith('(')) continue; // une méthode n'est pas un champ persisté
            booleens.add(cle);
        }
        expect(booleens.has('projectionRunMC'), 'témoin : un booléen du corps du store doit être vu').toBe(true);
        const manquants = [...booleens].filter((c) => !CHAMPS_BOOLEENS.has(c)).sort();
        expect(manquants, 'champ BOOLÉEN du store absent de CHAMPS_BOOLEENS : il videra l\'app au lancement.').toEqual([]);
    });

    it('[3e surface] les clés d\'un Record booléen (setupOptOut.<page>) — invisibles au scan des types — passent', () => {
        // Mesuré sur les états du dépôt : `children`, `debts`, `lifeProjects`, `realEstate` portent
        // un booléen sous `setupOptOut`. Un scan des TYPES ne les voit pas (clés d'un `Record`).
        const e = etat();
        (e as unknown as Record<string, unknown>).setupOptOut = { children: true, debts: false, lifeProjects: true, realEstate: true };
        expect(verifierTypesRestaures(e).map((f) => f.chemin).filter((c) => c.startsWith('setupOptOut'))).toEqual([]);
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
