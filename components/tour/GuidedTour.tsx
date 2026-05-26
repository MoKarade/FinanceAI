// components/tour/GuidedTour.tsx
// G22-F4 — Tutoriel guidé « maison » (zéro dépendance).
//
// Visite tous les onglets : à chaque étape, le tour ouvre l'onglet concerné,
// met en surbrillance son item de navigation (spotlight via box-shadow géant)
// et affiche une bulle d'explication. Navigation Suivant/Précédent/Passer,
// raccourcis clavier (←/→/Échap), ignorable et relançable depuis Configuration.
//
// Robustesse : si l'ancre de navigation n'est pas mesurable (sidebar masquée
// sur mobile, élément absent), on bascule sur une carte centrée — le tour
// continue de naviguer et d'expliquer sans dépendre du positionnement.

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFinanceStore } from '../../store/useFinanceStore';
import { TOUR_STEPS } from './tourSteps';
import { TOUR_EVENT, markTourSeen } from './tourControl';

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const BUBBLE_WIDTH = 340;
const SPOTLIGHT_PAD = 6;

export const GuidedTour: React.FC = () => {
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);

  const total = TOUR_STEPS.length;
  const step = TOUR_STEPS[idx];

  const finish = useCallback(() => {
    markTourSeen();
    setActive(false);
  }, []);

  // Démarrage via event global (post-onboarding ou bouton « relancer »).
  useEffect(() => {
    const onStart = () => {
      setIdx(0);
      setActive(true);
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  // Ouvre l'onglet de l'étape courante.
  useEffect(() => {
    if (!active) return;
    const s = TOUR_STEPS[idx];
    if (s.tab) setActiveTab(s.tab);
  }, [active, idx, setActiveTab]);

  // Mesure l'ancre de navigation pour le spotlight + le placement de la bulle.
  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    const s = TOUR_STEPS[idx];
    const measure = () => {
      if (!s.tab) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour-id="nav-${s.tab}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect(r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    // Double rAF : laisser le switch d'onglet + le layout se stabiliser.
    // Flag `cancelled` : le 2e rAF est planifié DANS le 1er, donc un simple
    // cancelAnimationFrame ne le couvre pas — on garde une garde explicite pour
    // éviter un setRect après démontage/ré-exécution de l'effet.
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => { if (!cancelled) measure(); });
    });
    window.addEventListener('resize', measure);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, [active, idx]);

  const next = useCallback(() => {
    // Dernière étape → terminer (return tôt, pas de setIdx fragile).
    if (idx + 1 >= total) { finish(); return; }
    setIdx((i) => i + 1);
  }, [idx, total, finish]);

  const prev = useCallback(() => {
    setIdx((i) => (i > 0 ? i - 1 : i));
  }, []);

  // Raccourcis clavier.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, prev, finish]);

  if (!active || typeof document === 'undefined') return null;

  const isLast = idx + 1 >= total;
  const anchored = rect !== null;

  // Placement de la bulle : à droite de l'ancre (sidebar à gauche) si mesurée,
  // sinon centrée. Clampée dans le viewport.
  const bubbleStyle: React.CSSProperties = anchored
    ? (() => {
        const left = Math.min(rect!.left + rect!.width + 16, window.innerWidth - BUBBLE_WIDTH - 16);
        const top = Math.min(Math.max(rect!.top, 16), window.innerHeight - 260);
        return { position: 'fixed', left: Math.max(16, left), top, width: BUBBLE_WIDTH };
      })()
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: `min(${BUBBLE_WIDTH}px, calc(100vw - 32px))` };

  return createPortal(
    <div className="fixed inset-0 z-[9990]" role="dialog" aria-modal="true" aria-label="Tutoriel guidé">
      {/* Dim : spotlight (box-shadow géant) si ancré, sinon backdrop plein. */}
      {anchored ? (
        <div
          aria-hidden="true"
          className="fixed rounded-card pointer-events-none transition-all duration-300"
          style={{
            top: rect!.top - SPOTLIGHT_PAD,
            left: rect!.left - SPOTLIGHT_PAD,
            width: rect!.width + SPOTLIGHT_PAD * 2,
            height: rect!.height + SPOTLIGHT_PAD * 2,
            boxShadow: '0 0 0 9999px rgba(8,11,16,0.72), 0 0 0 2px rgba(16,185,129,0.9)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-[#080b10]/72" />
      )}

      {/* Bulle */}
      <div
        style={bubbleStyle}
        className="bg-[#0F1116] border border-white/10 rounded-card shadow-2xl p-5 animate-fade-in"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-tiny font-bold text-primary uppercase tracking-widest" aria-live="polite">
            Étape {idx + 1} / {total}
          </span>
          <button
            type="button"
            onClick={finish}
            className="text-tiny text-ink-400 hover:text-ink-100 focus-ring rounded px-1"
          >
            Passer ✕
          </button>
        </div>

        <h3 className="text-h2 text-ink-50 mb-1.5">{step.title}</h3>
        <p className="text-body text-ink-300 leading-relaxed mb-4">{step.body}</p>

        {/* Barre de progression */}
        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-4" aria-hidden="true">
          <div
            className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-300"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>

        <div className="flex gap-2">
          {idx > 0 && (
            <button
              type="button"
              onClick={prev}
              className="flex-1 px-3 py-2 rounded-card text-meta font-bold text-ink-200 bg-white/5 hover:bg-white/10 transition-colors focus-ring"
            >
              ← Précédent
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex-1 px-3 py-2 rounded-card text-meta font-bold text-white bg-primary hover:brightness-110 transition-all focus-ring"
          >
            {isLast ? 'Terminer 🎉' : 'Suivant →'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
