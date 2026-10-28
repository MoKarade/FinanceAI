// [A11Y-LABELS-PARAMS-AVANCES] Chaque champ des paramètres avancés porte un NOM ACCESSIBLE.
//
// ⚠️ Le défaut : 26 champs sans aucune association `<label>` ↔ contrôle — ni `htmlFor`/`id`, ni
// enveloppement. Leur nom accessible était donc VIDE (WCAG 4.1.2) : un lecteur d'écran annonçait
// « zone d'édition » sans dire laquelle, sur des réglages qui pilotent toute la projection.
//
// ⚠️ Les 14 champs MONÉTAIRES du fichier avaient été câblés — parce que le masquage du mode discret
// l'exigeait — et les 26 autres pas. Un besoin technique avait fait le travail à moitié, et
// personne ne l'avait vu parce que la moitié faite était la plus visible.
//
// ⚠️ Ce test interroge le nom ACCESSIBLE (`getByLabelText`), pas la présence d'un attribut : c'est
// le nom qui compte pour l'utilisateur, et un `htmlFor` qui pointe un `id` inexistant — ou
// DUPLIQUÉ — ne le produit pas. Deux `id="app-returnRates"` coexistaient d'ailleurs après le
// premier passage : les deux labels pointaient le même contrôle, et le scan d'orphelins n'y voyait
// rien puisque chaque label avait bien son `htmlFor`.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdvancedProjectionParams } from '../../components/AdvancedProjectionParams';
import { INITIAL_PROJECTION } from '../../constants';
import type { ProjectionConfig } from '../../types';

// ⚠️ TOUTES les sections conditionnelles sont activées. Sinon l'assertion d'UNICITÉ des `id` ne
// couvrirait que les champs rendus : le doublon `app-returnRates` du premier passage était dans une
// section toujours visible, mais rien ne garantit que le prochain le sera. Une garde ne couvre que
// ce que sa fixture rend NON NUL — ici, « rend » au sens propre.
const monter = () => render(
    <AdvancedProjectionParams
        projection={{
            ...INITIAL_PROJECTION,
            stressTestEnabled: true,
            divorceEnabled: true,
            ltdEnabled: true,
            criticalIllnessEnabled: true,
            inheritanceEnabled: true,
            jobLossEnabled: true,
            modelSurvivor: true,
            snowbirdEnabled: true,
            vehicleReplacementEnabled: true,
            useManualBalances: true,
        } as ProjectionConfig}
        updateProj={vi.fn()}
    />,
);

describe('[A11Y-LABELS-PARAMS-AVANCES] nom accessible des champs', () => {
    it('aucun champ ne reste sans nom accessible', () => {
        const { container } = monter();
        const champs = [...container.querySelectorAll('input, select, textarea')];

        // Anti-vacuité : un rendu qui n'afficherait aucun champ passerait tout le reste.
        // ⚠️ Le seuil est MESURÉ, pas choisi : ce montage (toutes les sections conditionnelles
        // activées) rend exactement 40 champs — le fichier en porte 40, donc la fixture les couvre
        // TOUS. Un `> 20` posé au jugé faisait échouer le test sur son propre garde-fou, et un
        // montage partiel (première version : 33 champs, les 7 balances manuelles absentes) laissait
        // l'assertion d'unicité aveugle à un septième de la surface.
        expect(champs.length, 'aucun champ rendu → le test ne mesure rien').toBeGreaterThanOrEqual(40);

        const anonymes = champs
            .filter((c) => {
                const id = c.getAttribute('id');
                const parLabel = id ? container.querySelector(`label[for="${id}"]`) : null;
                const enveloppe = c.closest('label');
                return !parLabel && !enveloppe && !c.getAttribute('aria-label');
            })
            .map((c) => c.getAttribute('id') ?? c.outerHTML.slice(0, 60));

        expect(anonymes, `Champ(s) sans nom accessible :\n${anonymes.join('\n')}`).toEqual([]);
    });

    it('deux champs ne partagent JAMAIS le même `id`', () => {
        // ⚠️ Le piège du premier passage : `app-returnRates` était posé sur le rendement crypto ET
        // sur le rendement cash. Les deux labels pointaient alors le même contrôle — le second champ
        // n'avait plus de nom, et un scan d'orphelins ne voyait rien puisque chaque label avait son
        // `htmlFor`. Un attribut présent ne prouve pas qu'il désigne la bonne chose.
        const { container } = monter();
        const ids = [...container.querySelectorAll('[id]')].map((e) => e.getAttribute('id')!);
        const doublons = ids.filter((v, i) => ids.indexOf(v) !== i);
        expect([...new Set(doublons)], `id dupliqué(s) : ${doublons.join(', ')}`).toEqual([]);
    });

    it('un nom précis est bien rendu — anti-vacuité des deux cas ci-dessus', () => {
        monter();
        expect(screen.getByLabelText(/Chute bourse/)).toBeTruthy();
        expect(screen.getByLabelText(/Rendement crypto annuel/)).toBeTruthy();
        expect(screen.getByLabelText(/Rendement cash/)).toBeTruthy();
    });
});
