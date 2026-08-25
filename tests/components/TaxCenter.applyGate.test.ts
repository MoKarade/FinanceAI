/**
 * [AI-TAXCENTER-APPLY-NOGATE] L'application d'un talon de paie passe par le chemin STANDARD.
 *
 * ⚠️ La faille était l'INCOHÉRENCE entre deux surfaces qui font la même chose : `PayslipUploadCard`
 * avait reçu le filet (diff → confirmation → backup → écriture), `TaxCenter` écrivait encore le
 * profil salarial en direct. Il y avait bien un bouton à cliquer, mais un bouton n'est pas un
 * filet : aucun diff (on ne voyait pas ce qui changeait), aucun backup (rien où revenir), aucune
 * garde de vraisemblance — alors que ce profil alimente TOUTE l'app (fiscalité + projection).
 *
 * ⚠️ Le `setConfig` direct portait en plus une MUTATION : `{ ...config }` est une copie de SURFACE,
 * donc `newConfig.users` restait le MÊME tableau et `newConfig.users[0] = …` écrasait l'état
 * précédent EN PLACE — l'objet auquel un backup ou un `undo` se serait raccroché était déjà modifié.
 *
 * Scan de SOURCE, et pas un rendu : ce qu'on protège est l'absence d'un chemin d'écriture, pas le
 * comportement d'un clic. Le source est DÉCOMMENTÉ avant lecture — cet en-tête même parle de
 * `setConfig`, et une garde d'absence qui lirait les commentaires rougirait sur sa propre prose.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHEMIN = resolve(__dirname, '../../components/TaxCenter.tsx');
const BRUT = readFileSync(CHEMIN, 'utf8');
const CODE = BRUT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('[AI-TAXCENTER-APPLY-NOGATE] pas d’écriture directe du profil', () => {
    it('le décommenteur n’a pas tout mangé (sinon « rien ne matche » se prouve tout seul)', () => {
        expect(CODE.length).toBeGreaterThan(10_000);
        // Témoin de VRAI code, retrouvé par le même lecteur que les assertions ci-dessous.
        expect(CODE).toContain('export const TaxCenter');
    });

    it('l’application passe par `executeWriteTool` avec le spec du dépôt', () => {
        expect(CODE).toContain('executeWriteTool');
        expect(CODE).toContain('applyPayslipSpec');
        // Le point de contrôle humain doit être PASSÉ à l'exécuteur, pas seulement importé.
        expect(CODE).toMatch(/requestConfirmation,?\s*\)/);
    });

    it('AUCUN appel d’écriture directe de la config ne subsiste', () => {
        // `setConfig(` = l'ancien chemin. On vise l'APPEL, pas la mention : un identifiant seul
        // matcherait une déclaration de prop ou un import.
        // ⚠️ `\??\.?` : l'appel OPTIONNEL `setConfig?.(…)` est la forme la plus probable ici (la prop
        // était optionnelle), et c'est exactement celle qu'un motif `setConfig\s*\(` laisse passer.
        // Trouvé par PERTURBATION : ma première version restait verte quand je réintroduisais
        // l'écriture directe sous cette syntaxe.
        const appels = [...CODE.matchAll(/\b(?:setConfig|setAppState)\s*\??\.?\s*\(/g)]
            .map((m) => CODE.slice(0, m.index).split('\n').length);
        expect(appels, `Écriture directe de la config à la ligne ${appels.join(', ')}`).toEqual([]);
        // Et la mutation qui allait avec : plus aucune affectation dans le tableau des utilisateurs.
        expect(CODE).not.toMatch(/\.users\[\d\]\s*=/);
    });
});
