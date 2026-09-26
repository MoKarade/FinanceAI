// components/aiChat/AssistantVerrouille.tsx
//
// [S5-REFONTE-ASSISTANT] Écran de l'Assistant tant que la clé API manque (maquettes E-assistant /
// M-assistant). Remplace, pour CETTE page, l'écran générique « page verrouillée » : on voit à quoi
// ressemblera l'assistant (aperçu inerte) et, à côté, ce qu'il faut pour l'activer.
// - Bureau large : aperçu à gauche, carte d'activation à droite.
// - Mobile : carte d'activation d'abord (c'est l'action), aperçu dessous.
// L'aperçu n'a AUCUN élément interactif : rien à atteindre au clavier, rien qui ferait croire
// qu'on peut déjà écrire.

import React from 'react';
import { PageHeader } from '../ui/PageHeader';
import { Icon } from '../ui/Icon';
import { Tab } from '../../types';
import { useShallow } from 'zustand/shallow';
import { useFinanceStore } from '../../store/useFinanceStore';
import { PAGE_SETUP } from '../setup/PageSetupGate';
import { REQUIREMENTS } from '../setup/requirements';
import { SUGGESTIONS_ASSISTANT } from './suggestions';

export const AssistantVerrouille: React.FC = () => {
    const navigateWithFocus = useFinanceStore((s) => s.navigateWithFocus);
    const config = PAGE_SETUP[Tab.ASSISTANT]!;
    const reqs = config.requirementIds.map((id) => REQUIREMENTS[id]);
    const etats = useFinanceStore(useShallow((s) => reqs.map((r) => r.isMet(s))));
    const faits = etats.filter(Boolean).length;
    const cle = REQUIREMENTS.anthropicKey;

    return (
        <div className="space-y-6 stagger-in">
            <PageHeader
                title="Assistant"
                actions={
                    <span className="h-8 px-3 rounded-full border border-warning-400/50 bg-warning-500/8 text-meta font-semibold text-warning-400 inline-flex items-center">
                        Configuration requise · {faits}/{reqs.length}<span className="hidden sm:inline">&nbsp;prêt</span>
                    </span>
                }
            />

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
                <section aria-labelledby="assistant-activer" className="xl:order-last rounded-2xl bg-surface border border-white/6 p-4 sm:p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <h2 id="assistant-activer" className="text-[18px] font-semibold text-ink-50">Pour activer l'assistant</h2>
                        <p className="text-body text-ink-300">{config.intro}</p>
                    </div>
                    <ul className="flex flex-col gap-2">
                        {reqs.map((r, i) => (
                            <li key={r.id} className="rounded-xl border border-white/6 bg-dark/40 p-4 flex items-start gap-3">
                                <RondEtat fait={etats[i]} />
                                <div className="min-w-0">
                                    <p className="text-body font-semibold text-ink-50">
                                        {r.label}<span className="sr-only"> — {etats[i] ? 'fait' : 'à faire'}</span>
                                    </p>
                                    {r.help && <p className="text-meta text-ink-400 mt-0.5 leading-5">{r.help}</p>}
                                </div>
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        onClick={() => navigateWithFocus(cle.focus!.tab, cle.focus!.section)}
                        className="h-12 rounded-xl bg-ink-50 text-dark text-body font-semibold hover:bg-white transition-colors focus-ring"
                    >
                        Configurer / ajouter
                    </button>
                </section>

                <section aria-label="Aperçu de l'assistant" className="rounded-2xl bg-surface border border-white/6 flex flex-col min-h-[340px] xl:min-h-[680px]">
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                        <span className="w-12 h-12 rounded-xl bg-surfaceHighlight flex items-center justify-center text-ink-400" aria-hidden="true">
                            <Icon name="sparkles" size={20} />
                        </span>
                        <p className="text-[18px] font-semibold text-ink-400">Pose une question ou choisis une suggestion</p>
                        <p className="text-meta text-ink-400">Aperçu : se déverrouille dès que la clé est ajoutée.</p>
                        <ul className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-2 w-full sm:w-auto mt-1">
                            {SUGGESTIONS_ASSISTANT.map((s) => (
                                <li key={s.label} className="h-11 sm:h-9 px-3.5 rounded-xl sm:rounded-full border border-white/8 text-meta text-ink-400 inline-flex items-center justify-center">
                                    {s.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="p-4 border-t border-white/6" aria-hidden="true">
                        <div className="h-[52px] rounded-xl border border-white/6 bg-dark/40 flex items-center gap-2 pl-4 pr-2">
                            <span className="flex-1 text-body text-ink-400">Écris ta question…</span>
                            <span className="w-9 h-9 rounded-lg bg-surfaceHighlight flex items-center justify-center text-ink-400">
                                <Icon name="arrow-up" size={14} />
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

/** Rond d'état d'un prérequis : anneau ambre (à faire) ou pastille pleine (fait). */
const RondEtat: React.FC<{ fait: boolean }> = ({ fait }) => (
    <span
        className={`shrink-0 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${fait ? 'bg-success-400 border-success-400 text-dark' : 'border-warning-400'}`}
        aria-hidden="true"
    >
        {fait && <Icon name="check" size={12} />}
    </span>
);
