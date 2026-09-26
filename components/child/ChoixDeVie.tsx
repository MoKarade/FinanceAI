// components/child/ChoixDeVie.tsx
//
// [S5-REFONTE-ENFANTS] Carte « Choix de vie » des maquettes (E-enfants / M-enfants) : cinq groupes
// d'options en pastilles (libellé court + prix), l'option retenue cerclée de blanc.
// Les montants viennent des constantes du MOTEUR (services/projection/childCosts.ts) : l'écran et la
// projection lisent la même source. Seuls les LIBELLÉS sont raccourcis ici (affichage).
import React from 'react';
import { PrivateAmount } from '../ui/PrivateAmount';
import { formatCAD, formatCompactCAD } from '../../utils/format';
import {
    DAYCARE_INFO, SCHOOL_INFO, ACTIVITIES_INFO, UNI_INFO, CAR_INFO,
    type DaycareType, type SchoolType, type ActivitiesLevel, type UniversityType, type CarGift,
} from '../../services/projection/childCosts';

/** Libellés courts des maquettes, par groupe et par option (les clés sont celles du moteur). */
export const LIBELLES_CHOIX = {
    garde: { cpe: 'CPE subventionné', garde_privee: 'Garderie privée', parent_foyer: 'Parent au foyer' } satisfies Record<DaycareType, string>,
    ecole: { publique: 'Publique', privee: 'Privée', internationale: 'Internationale' } satisfies Record<SchoolType, string>,
    activites: { aucune: 'Aucune', legeres: 'Légères', intensives: 'Intensives' } satisfies Record<ActivitiesLevel, string>,
    etudes: {
        aucune: 'Aucune', dep: 'DEP', cegep: 'Cégep', uni_local: 'Université chez les parents',
        uni_appart: 'Université + appart', uni_etranger: 'Hors Québec',
    } satisfies Record<UniversityType, string>,
    voiture: { non: 'Aucune', usagee: 'Usagée', neuve: 'Neuve' } satisfies Record<CarGift, string>,
};

interface Option<K extends string> { cle: K; libelle: string; prix: React.ReactNode }

interface ChoixDeVieProps {
    daycareType: DaycareType; setDaycareType: (v: DaycareType) => void;
    schoolType: SchoolType; setSchoolType: (v: SchoolType) => void;
    activitiesLevel: ActivitiesLevel; setActivitiesLevel: (v: ActivitiesLevel) => void;
    universityType: UniversityType; setUniversityType: (v: UniversityType) => void;
    carGift: CarGift; setCarGift: (v: CarGift) => void;
}

const cles = <K extends string>(o: Record<K, unknown>) => Object.keys(o) as K[];

export const ChoixDeVie: React.FC<ChoixDeVieProps> = (p) => {
    const garde: Option<DaycareType>[] = cles(DAYCARE_INFO).map((k) => ({
        cle: k,
        libelle: LIBELLES_CHOIX.garde[k],
        prix: DAYCARE_INFO[k].monthly > 0
            ? <><PrivateAmount>{formatCAD(DAYCARE_INFO[k].monthly)}</PrivateAmount>/mois</>
            : 'perte de salaire',
    }));
    const ecole: Option<SchoolType>[] = cles(SCHOOL_INFO).map((k) => ({
        cle: k,
        libelle: LIBELLES_CHOIX.ecole[k],
        prix: <>+<PrivateAmount>{formatCompactCAD(SCHOOL_INFO[k].yearlyExtra)}</PrivateAmount>/an</>,
    }));
    const activites: Option<ActivitiesLevel>[] = cles(ACTIVITIES_INFO).map((k) => ({
        cle: k,
        libelle: LIBELLES_CHOIX.activites[k],
        prix: ACTIVITIES_INFO[k].yearlyExtra > 0
            ? <>+<PrivateAmount>{formatCAD(ACTIVITIES_INFO[k].yearlyExtra)}</PrivateAmount>/an</>
            : <PrivateAmount>{formatCAD(0)}</PrivateAmount>,
    }));
    const etudes: Option<UniversityType>[] = cles(UNI_INFO).map((k) => ({
        cle: k,
        libelle: LIBELLES_CHOIX.etudes[k],
        prix: UNI_INFO[k].yearlyCost > 0
            ? <><PrivateAmount>{formatCompactCAD(UNI_INFO[k].yearlyCost)}</PrivateAmount>/an · {UNI_INFO[k].years} ans</>
            : <PrivateAmount>{formatCAD(0)}</PrivateAmount>,
    }));
    const voiture: Option<CarGift>[] = cles(CAR_INFO).map((k) => ({
        cle: k,
        libelle: LIBELLES_CHOIX.voiture[k],
        prix: <PrivateAmount>{CAR_INFO[k].cost > 0 ? formatCompactCAD(CAR_INFO[k].cost) : formatCAD(0)}</PrivateAmount>,
    }));

    return (
        <section aria-labelledby="choix-de-vie-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-5 sm:py-[18px] flex flex-col gap-[18px]">
            <h2 id="choix-de-vie-titre" className="text-[16px] sm:text-[17px] font-semibold text-ink-50">Choix de vie</h2>
            <Groupe titre="Garde (0 à 5 ans)" options={garde} actif={p.daycareType} choisir={p.setDaycareType} />
            <Groupe titre="École (6 à 17 ans)" options={ecole} actif={p.schoolType} choisir={p.setSchoolType} />
            <Groupe titre="Sports et activités" options={activites} actif={p.activitiesLevel} choisir={p.setActivitiesLevel} />
            <Groupe titre="Études (18 à 25 ans)" options={etudes} actif={p.universityType} choisir={p.setUniversityType} />
            <Groupe titre="Voiture à 18 ans" options={voiture} actif={p.carGift} choisir={p.setCarGift} />
        </section>
    );
};

/**
 * Un groupe à choix unique. Boutons `aria-pressed` (et non radios) : un clic APPLIQUE le choix et
 * recalcule la courbe — un radiogroup se parcourt aux flèches, chaque flèche relancerait le calcul.
 */
function Groupe<K extends string>({ titre, options, actif, choisir }: { titre: string; options: Option<K>[]; actif: K; choisir: (k: K) => void }) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-[13px] sm:text-[11px] font-semibold sm:tracking-[0.08em] sm:uppercase text-ink-100 sm:text-ink-400">{titre}</h3>
            <div role="group" aria-label={titre} className="flex flex-wrap gap-1.5">
                {options.map((o) => {
                    const on = o.cle === actif;
                    return (
                        <button
                            key={o.cle}
                            type="button"
                            onClick={() => choisir(o.cle)}
                            aria-pressed={on}
                            className={`min-h-11 sm:min-h-10 px-3 py-1.5 rounded-[10px] border flex flex-col items-start gap-px text-left text-[13px] transition-colors focus-ring ${
                                o.cle === actif ? 'border-ink-50 bg-ink-50/12 text-ink-50' : 'border-white/10 text-ink-200 hover:bg-white/5'
                            }`}
                        >
                            <span className="font-semibold">{o.libelle}</span>
                            <span className={`font-mono text-[11px] ${on ? 'text-ink-200' : 'text-ink-400'}`}>{o.prix}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
