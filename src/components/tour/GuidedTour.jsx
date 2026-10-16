// Spotlight tour. The app tour auto-starts on first launch; others via startTour(id).
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuX, LuArrowRight, LuChevronLeft, LuSparkles } from '../ui/icons';
import { TOURS, hasSeenTour, markTourSeen, onTourStart, tourForView } from './tour';
import ModeShowcase from '../creation/ModeShowcase';

const PAD = 6;
const CARD_W = 320;

export default function GuidedTour({ view }) {
  const [tourId, setTourId] = useState('app');
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState(null);
  const steps = TOURS[tourId] || TOURS.app;
  const active = step >= 0;
  const current = steps[step];

  useEffect(() => {
    const off = onTourStart((id) => { setTourId(TOURS[id] ? id : 'app'); setStep(0); });
    const timer = hasSeenTour('app') ? null : setTimeout(() => setStep(0), 900);
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);

  const measure = useCallback(() => {
    const t = current?.target;
    const el = typeof t === 'function' ? t() : t && document.querySelector(t);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [current]);

  useEffect(() => {
    if (!active) return undefined;
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 320);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [active, measure]);

  // First visit to a view: run its tour (after the app tour has been seen)
  useEffect(() => {
    const id = tourForView(view);
    if (active || id === 'app' || !hasSeenTour('app') || hasSeenTour(id)) return undefined;
    const t = setTimeout(() => { setTourId(id); setStep(0); }, 1200);
    return () => clearTimeout(t);
  }, [view, active]);

  const finish = useCallback(() => { markTourSeen(tourId); setStep(-1); }, [tourId]);
  const next = useCallback(() => (step >= steps.length - 1 ? finish() : setStep(step + 1)), [step, steps.length, finish]);
  const back = () => setStep((s) => Math.max(0, s - 1));

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, finish]);

  if (!active) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = current.visual ? 360 : CARD_W;
  let cardStyle;
  if (rect) {
    const GAP = 14, M = 16, H = current.visual ? 480 : 260;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const midY = clamp(rect.top + rect.height / 2 - H / 2, M, vh - H - M);
    const alignX = clamp(rect.left, M, vw - cardW - M);
    if (rect.left + rect.width + GAP + cardW <= vw - M) cardStyle = { left: rect.left + rect.width + GAP, top: midY };
    else if (rect.left - GAP - cardW >= M) cardStyle = { left: rect.left - GAP - cardW, top: midY };
    else if (rect.top + rect.height + GAP + H <= vh - M) cardStyle = { left: alignX, top: rect.top + rect.height + GAP };
    else if (rect.top - GAP - H >= M) cardStyle = { left: alignX, top: rect.top - GAP - H };
    else cardStyle = { left: alignX, top: vh - H - M };
    cardStyle.width = cardW;
  } else {
    const w = current.visual ? 400 : 380;
    cardStyle = { left: vw / 2 - w / 2, top: Math.max(16, vh / 2 - (current.visual ? 260 : 130)), width: w };
  }
  const isLast = step === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[10040]" aria-live="polite">
      {rect ? (
        <div
          className="tempo-tour-spot pointer-events-none fixed rounded-xl ring-2 ring-white"
          style={{ ...rect, boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.55)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/55" />
      )}
      <div className="fixed inset-0" onMouseDown={(e) => e.preventDefault()} />

      <div
        key={`${tourId}-${step}`}
        role="dialog"
        aria-label={current.title}
        className="tempo-tour-card fixed border border-black/15 bg-white shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          {!rect && (
            <span className="grid h-10 w-10 shrink-0 place-items-center bg-black text-white"><LuSparkles size={18} /></span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Step {step + 1} of {steps.length}
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{current.title}</h3>
          </div>
          <button onClick={finish} aria-label="Close tour" className="-mr-1 -mt-1 grid h-8 w-8 place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <LuX size={16} />
          </button>
        </div>
        {current.visual && (
          <div className="px-5 pt-3">
            <ModeShowcase key={`${tourId}-${step}`} modes={current.visual} compact />
          </div>
        )}
        <p className="px-5 pt-2 text-sm leading-relaxed text-slate-600">{current.text}</p>

        <div className="mt-4 flex gap-1 px-5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1 flex-1 transition-colors ${i <= step ? 'bg-slate-900' : 'bg-slate-200'}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-black/10 px-5 py-3">
          <button onClick={finish} className="text-xs font-medium text-slate-500 hover:text-slate-900">
            {step === 0 ? 'Skip tour' : 'End tour'}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={back} className="flex h-9 items-center gap-1 border border-black/15 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <LuChevronLeft size={16} /> Back
              </button>
            )}
            <button onClick={next} className="flex h-9 items-center gap-1.5 bg-black px-4 text-sm font-semibold text-white hover:bg-slate-800">
              {step === 0 ? 'Start tour' : isLast ? 'Finish' : 'Next'}
              {!isLast && <LuArrowRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
