// tests/components/taxBracketVizAnnee.test.tsx
//
// [TAXBRACKETVIZ-ANNEE] `TaxBracketViz` dessinait les paliers 2026 BRUTS et calculait son total par
// `calculateFiscalReport(gross, 0, 0)` — année 2026 par défaut — alors que le brut qu'il reçoit de
// `Retirement.tsx` est déduit au barème de l'année COURANTE. Paire désaccordée, exactement comme
// celle corrigée dans `TaxCenter` (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`).
//
// ⚠️ LE TICKET SOUS-ESTIMAIT L'ÉCART, ET SE TROMPAIT SUR SA NATURE. Il annonçait « 333 $ sur 86 968
// (0,4 %) dès 2027 — visuellement invisible, d'où le classement FAIBLE ». RE-MESURÉ sur l'impôt
// total (fédéral + Québec), 2026 figé contre l'année réelle :
//
//   | brut      | 2027            | 2030            | 2035             |
//   |-----------|-----------------|-----------------|------------------|
//   |  60 000 $ |  +212 $ (2,0 %) |  +693 $ (6,7 %) | +1 283 $ (13,1 %)|
//   |  86 968 $ |  +212 $ (1,0 %) |  +874 $ (4,4 %) | +2 069 $ (11,1 %)|
//   | 200 000 $ |  +566 $ (0,8 %) | +2 331 $ (3,4 %)| +5 095 $  (7,7 %)|
//
// Ce n'est donc pas un biais FIXE de 0,4 % : il COMPOSE à ~2 %/an, comme l'indexation qu'il ignore.
// À dix ans, l'impôt affiché est surévalué de plus de 11 % pour un revenu moyen.
//
// ⚠️ CE QUE CE FICHIER GARDE, ET POURQUOI CHAQUE MORCEAU EST LÀ.
//  1. Les barres ET le total suivent la MÊME année. Un demi-correctif (total indexé, barres figées)
//     serait PIRE que le défaut : il rendrait VISIBLE une incohérence entre des barres et la somme
//     affichée juste en dessous. Le ticket le disait, et il avait raison.
//  2. La source des paliers est UNIQUE — `bracketsForYear` lit `getIndexedBracketsForYear`, celui-là
//     même dont `calculateFiscalReport` tire son impôt. Ré-indexer côté composant compilerait et
//     divergerait au premier changement de règle (`UNE-FORMULE-MONEY-CRITICAL-RECOPIEE-DIVERGE`).
//  3. `year` est REQUISE, sans défaut : un `= 2026` se périme en silence, et lire l'horloge dans le
//     composant en ferait une bombe au 1er janvier
//     (`UN-DEFAUT-QUI-SE-PERIME-SE-CORRIGE-EN-RENDANT-LE-CHAMP-REQUIS`).

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaxBracketViz } from '../../components/TaxBracketViz';
import { bracketsForYear, FED_BRACKETS, calculateFiscalReport } from '../../utils/tax';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

afterEach(cleanup);

const lire = (rel: string): string => readFileSync(resolve(__dirname, '../../', rel), 'utf8');

/** Source DÉCOMMENTÉE — obligatoire pour toute assertion de COMPTE ou d'ABSENCE.
 *  ⚠️ Ma première version comptait `new Date().getFullYear()` sur la source BRUTE et trouvait 2
 *  occurrences pour 1 seule ligne de code : les deux autres étaient dans les COMMENTAIRES qui
 *  EXPLIQUENT justement pourquoi il ne doit y en avoir qu'une (`SCAN-QUI-MATCHE-LA-PROSE`). Une
 *  garde d'absence contredit mécaniquement une bonne doc — le remède est le lecteur, pas la doc. */
const lireCode = (rel: string): string => stripComments(lire(rel));

describe('[TAXBRACKETVIZ-ANNEE] les paliers affichés suivent l’année', () => {
    it('`bracketsForYear` indexe, et rend EXACTEMENT la table de l’impôt de la même année', () => {
        const p2026 = bracketsForYear(2026);
        const p2035 = bracketsForYear(2035);

        // Anti-vacuité : sans une borne finie non nulle, « indexé » et « figé » sont indiscernables.
        expect(p2026.fed[0].upTo, 'la 1re borne fédérale doit être un montant fini').toBeGreaterThan(0);
        expect(p2026.fed[0].upTo).toBe(FED_BRACKETS[0].upTo);

        // L'indexation composée : ~1,02^9 sur neuf ans. On vérifie l'ORDRE DE GRANDEUR, pas le
        // dollar — ancrer la valeur exacte ferait de ce test une bombe au prochain changement de
        // règle d'indexation, alors que ce qu'on protège est « ça suit l'année ».
        const ratio = p2035.fed[0].upTo / p2026.fed[0].upTo;
        expect(ratio, 'les paliers 2035 doivent être PLUS HAUTS que ceux de 2026').toBeGreaterThan(1.15);
        expect(ratio, 'ils ne doivent pas non plus exploser').toBeLessThan(1.25);

        // L'infini reste l'infini — une borne ouverte ne s'indexe pas.
        expect(p2035.fed[p2035.fed.length - 1].upTo).toBe(Infinity);
    });

    it('les taux, eux, ne bougent PAS — seules les BORNES sont indexées', () => {
        // Contre-épreuve : si l'helper touchait aussi aux taux, il ne serait plus le barème.
        expect(bracketsForYear(2035).fed.map(b => b.rate)).toEqual(FED_BRACKETS.map(b => b.rate));
    });

    it('le composant rend des BORNES différentes selon l’année (la paire est bien câblée)', () => {
        const a2026 = render(<TaxBracketViz annualGrossIncome={86_968} year={2026} />).container.textContent ?? '';
        cleanup();
        const a2035 = render(<TaxBracketViz annualGrossIncome={86_968} year={2035} />).container.textContent ?? '';

        // La 1re borne fédérale 2026 (58 523 $) est écrite en toutes lettres dans le rendu 2026 et
        // ne doit PLUS y être en 2035. C'est l'assertion qui échoue si les barres restent figées.
        const borne2026 = Math.round(bracketsForYear(2026).fed[0].upTo).toLocaleString('fr-CA');
        const borne2035 = Math.round(bracketsForYear(2035).fed[0].upTo).toLocaleString('fr-CA');
        expect(borne2026, 'les deux bornes doivent DIFFÉRER, sinon le cas est vacueux').not.toBe(borne2035);

        expect(a2026).toContain(borne2026);
        expect(a2035).toContain(borne2035);
        expect(a2035, 'le rendu 2035 affiche encore la borne 2026 : les barres sont restées figées')
            .not.toContain(borne2026);
    });

    it('le TOTAL suit la même année que les barres — pas de demi-correctif', () => {
        // On vise la grandeur PUBLIÉE (le texte rendu), pas un retour de fonction : c'est ce que
        // l'utilisateur lit. L'impôt 2035 est PLUS BAS que l'impôt 2026 à brut égal (les paliers
        // ont monté), donc les deux rendus ne peuvent pas afficher le même total.
        const t2026 = calculateFiscalReport(86_968, 0, 0, 2026);
        const t2035 = calculateFiscalReport(86_968, 0, 0, 2035);
        const somme = (r: { fedTax?: number; qcTax?: number }) => Math.round((r.fedTax ?? 0) + (r.qcTax ?? 0));
        expect(somme(t2026), 'anti-vacuité : les deux impôts doivent différer').not.toBe(somme(t2035));
        expect(somme(t2035), 'un barème indexé doit imposer MOINS à brut nominal égal')
            .toBeLessThan(somme(t2026));

        // ⚠️ Le composant n'affiche PAS de total combiné en dollars : il rend l'impôt fédéral et
        // l'impôt québécois séparément. Ma première version cherchait la somme (18 734 $) dans le
        // texte — chaîne qui n'existe nulle part, alors que le code était juste. On vise donc les
        // deux grandeurs RÉELLEMENT publiées.
        const rendu2035 = render(<TaxBracketViz annualGrossIncome={86_968} year={2035} />).container.textContent ?? '';
        const fed2035 = Math.round(t2035.fedTax ?? 0).toLocaleString('fr-CA');
        const qc2035 = Math.round(t2035.qcTax ?? 0).toLocaleString('fr-CA');
        const fed2026 = Math.round(t2026.fedTax ?? 0).toLocaleString('fr-CA');
        expect(fed2035, 'anti-vacuité : les deux impôts fédéraux doivent différer').not.toBe(fed2026);
        expect(rendu2035, `impôt fédéral affiché ≠ celui de 2035 (${fed2035} $)`).toContain(fed2035);
        expect(rendu2035, `impôt québécois affiché ≠ celui de 2035 (${qc2035} $)`).toContain(qc2035);
        expect(rendu2035, 'le rendu 2035 affiche encore l’impôt de 2026 : le total est resté figé')
            .not.toContain(fed2026);
    });
});

describe('[TAXBRACKETVIZ-ANNEE] la paire appelant/composant reste accordée', () => {
    it('`Retirement` passe la MÊME année au brut déduit et aux paliers', () => {
        // `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE` : le défaut d'origine n'était pas qu'une année
        // manquait, c'est qu'UNE SEULE des deux l'avait. La garde vise donc la variable PARTAGÉE,
        // pas la présence d'un `new Date()` quelque part.
        const src = lire('components/Retirement.tsx');
        // ⚠️ [ENG-STARTYEAR-DEFAUT-2026] Ce motif ancrait la FORME `useMemo(() => new Date().getFullYear())`.
        // Le lot suivant a eu besoin du MOIS en plus de l'année, donc d'une `new Date()` mémoïsée dont
        // on tire les deux — et la garde a rougi alors que rien de ce qu'elle défend n'avait bougé.
        // C'est la deuxième fois que cette assertion se casse sur la forme sans que le FAIT gardé
        // change (cf le 3e argument de `calculateGrossFromNet`, plus bas). Elle vise désormais ce
        // qu'elle veut dire : une seule lecture d'horloge, dont l'année dérive.
        expect(src, 'une lecture d’horloge MÉMOÏSÉE, donc stable au re-rendu')
            .toMatch(/const maintenant = useMemo\(\(\) => new Date\(\), \[\]\)/);
        expect(src, 'l’année dérive de cette lecture, pas d’une seconde')
            .toMatch(/const anneeFiscaleCourante = maintenant\.getFullYear\(\)/);
        // ⚠️ Le motif s'arrête à `[,)]` et n'exige PAS que l'appel se termine là : ce qui est gardé,
        // c'est que la variable PARTAGÉE occupe la position de l'ANNÉE — pas l'arité de l'appel.
        // Ancrer sur `\)` a rougi au lot suivant, quand `[GROSSFROMNET-CREDITS-65]` a ajouté un 3e
        // argument sans rien casser de ce que cette garde protège. Une garde doit tenir sur le FAIT
        // qu'elle défend, pas sur la forme exacte qu'avait le code le jour où on l'a écrite.
        expect(src, 'le brut déduit doit lire la variable partagée')
            .toMatch(/calculateGrossFromNet\(netAnnual, anneeFiscaleCourante[,)]/);
        expect(src, 'les paliers doivent lire la MÊME variable')
            .toMatch(/<TaxBracketViz[^>]*year=\{anneeFiscaleCourante\}/);
        // Et plus AUCUNE lecture d'horloge séparée dans ce fichier : deux `new Date()` distincts
        // pourraient tomber de part et d'autre d'un 31 décembre.
        const code = lireCode('components/Retirement.tsx');
        // Anti-vacuité du décommentage : si le décommenteur avait tout mangé, « 1 occurrence »
        // se prouverait à partir de « il ne reste rien ».
        // ⚠️ PAS `code.length` : la source unique BLANCHIT — le résultat a exactement la longueur de
        // la source, donc un seuil en octets serait franchi même si tout avait été mangé.
        expect(partDeCodeRestante(lire('components/Retirement.tsx'), code),
            'décommentage trop agressif : il ne reste plus de code').toBeGreaterThan(0.2);
        expect(code, 'jeton de vrai code retrouvé après décommentage').toContain('anneeFiscaleCourante');
        // ⚠️ On compte `new Date(` et non `new Date().getFullYear()` : c'est la LECTURE D'HORLOGE
        // qui doit être unique, pas une de ses projections. Le motif d'avant aurait laissé passer un
        // `new Date().getMonth()` ajouté à côté — exactement ce que ce fichier a eu besoin de faire,
        // et exactement le 31 décembre que la variable partagée existe pour fermer.
        expect((code.match(/new Date\(/g) ?? []).length,
            'une seule lecture de l’horloge pour tout l’écran').toBe(1);
        expect(code, 'le mois dérive de la MÊME lecture').toContain('maintenant.getMonth()');
    });

    it('[ENG-STARTYEAR-DEFAUT-2026] le chercheur d’objectif part de l’année COURANTE, pas d’un littéral', () => {
        // Le moteur portait `startYear = 2026` en défaut de déstructuration, et `GoalSeekerCard`
        // était le SEUL appelant à omettre le champ — il projetait donc depuis 2026 en dur, quelle
        // que soit l'année réelle. Le champ est désormais REQUIS côté `SimulationParams` : `tsc`
        // exige la valeur sur chaque site, et cette garde vérifie que celle qui est passée est bien
        // la lecture d'horloge partagée, pas un littéral réintroduit.
        const code = lireCode('components/Retirement.tsx');
        expect(code, 'l’année de départ vient de la lecture d’horloge partagée')
            .toMatch(/startYear:\s*anneeFiscaleCourante/);
        expect(code, 'le mois de départ aussi — câbler une année, c’est câbler une paire')
            .toMatch(/startMonth:\s*moisCourant/);

        // Et le défaut ne revient pas côté moteur : le champ reste REQUIS. Un `startYear?:` ou un
        // `startYear = <littéral>` rouvrirait la classe entière sans qu'aucun appelant ne bronche.
        const moteur = lireCode('services/projection.ts');
        expect(moteur, 'le champ doit rester REQUIS').toMatch(/\n\s*startYear:\s*number;/);
        expect(moteur, 'aucun défaut d’année ne revient à la déstructuration')
            .not.toMatch(/startYear\s*=\s*\d{4}/);
    });

    it('le composant n’a AUCUN défaut d’année ni aucune lecture d’horloge', () => {
        const src = lire('components/TaxBracketViz.tsx');
        expect(src, 'un défaut `year = 2026` se périmerait en silence').not.toMatch(/year\s*=\s*2026/);
        expect(src, 'lire l’horloge ici rendrait les tests non déterministes').not.toMatch(/new Date\(\)/);
        expect(src, 'la table doit venir de la source unique').toMatch(/bracketsForYear\(year\)/);
        expect(src, 'le total doit recevoir l’année').toMatch(/calculateFiscalReport\([^)]*,\s*year\)/);
    });
});
