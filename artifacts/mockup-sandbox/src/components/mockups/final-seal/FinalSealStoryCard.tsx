import { useEffect, useState } from 'react';
import { ArrowRight, Award, Check, Circle, Flag, RotateCcw, Sparkle, X } from 'lucide-react';
import './_group.css';

const MARKER_COUNT = 15;

function SealArtwork({ replayKey }: { replayKey: number }) {
  return (
    <div className="seal-art" key={replayKey} aria-label="A seal formed from fifteen achievement markers" role="img">
      <div className="seal-art__orbit" />
      <div className="seal-art__orbit-inner" />
      <div className="seal-art__orbit-dash" />
      <div className="seal-art__crosshair" />
      {Array.from({ length: MARKER_COUNT }, (_, index) => {
        const angle = (index / MARKER_COUNT) * Math.PI * 2 - Math.PI / 2;
        const radius = 43;
        return (
          <span
            className={`seal-art__marker${index === MARKER_COUNT - 1 ? ' seal-art__marker--final' : ''}`}
            key={index}
            style={{
              '--x': `${Math.cos(angle) * radius}%`,
              '--y': `${Math.sin(angle) * radius}%`,
              '--left': `calc(50% + ${Math.cos(angle) * radius}%)`,
              '--top': `calc(50% + ${Math.sin(angle) * radius}%)`,
              '--delay': `${index * 43}ms`,
            } as React.CSSProperties}
          >
            {index === MARKER_COUNT - 1 ? <Award size={13} strokeWidth={2.4} /> : <Check size={11} strokeWidth={3} />}
          </span>
        );
      })}
      <div className="seal-art__medal">
        <div className="seal-art__medal-core"><Award size={43} strokeWidth={1.45} /></div>
      </div>
      <i className="seal-art__spark seal-art__spark--a" />
      <i className="seal-art__spark seal-art__spark--b" />
      <i className="seal-art__spark seal-art__spark--c" />
      <i className="seal-art__spark seal-art__spark--d" />
    </div>
  );
}

export function FinalSealStoryCard() {
  const [replayKey, setReplayKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setReplayKey((key) => key + 1), 20);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  const replay = () => {
    if (reducedMotion) setReducedMotion(false);
    setReplayKey((key) => key + 1);
  };

  return (
    <main className="final-seal-preview">
      <section
        className="seal-story"
        data-replay={replayKey % 2}
        data-reduced={reducedMotion}
        aria-label="Final Seal achievement celebration"
      >
        <header className="seal-story__topline">
          <div className="seal-story__brand">
            <span className="seal-story__brand-mark"><Circle size={11} strokeWidth={1.8} /></span>
            Meisner Method
          </div>
          <button className="seal-story__icon-button" type="button" aria-label="Dismiss achievement celebration">
            <X size={19} strokeWidth={1.6} />
          </button>
        </header>
        <div className="seal-story__progress" aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>

        <div className="seal-story__kicker">A practice, completed</div>
        <SealArtwork replayKey={replayKey} />

        <div className="seal-story__copy" aria-live="polite">
          <p className="seal-story__eyebrow">THE FINAL SEAL</p>
          <h1 className="seal-story__title">15 of 15 complete</h1>
          <p className="seal-story__description">Your title flag collection is now open.</p>
        </div>
        <div className="seal-story__completion"><b>All achievements earned</b></div>

        <div className="seal-story__cta-wrap">
          <button className="seal-story__cta" type="button" aria-label="Choose your title flag">
            <span className="seal-story__cta-label">
              <span className="seal-story__cta-mark"><Flag size={13} strokeWidth={1.8} /></span>
              Choose your title flag
            </span>
            <ArrowRight size={18} strokeWidth={1.8} />
          </button>
          <p className="seal-story__footnote">The next mark is yours to choose</p>
        </div>

        <div className="seal-story__controls" aria-label="Preview controls">
          <button className="seal-story__replay" type="button" onClick={replay} aria-label="Replay seal animation">
            <RotateCcw size={12} /> Replay
          </button>
          <button
            className="seal-story__motion-toggle"
            type="button"
            aria-pressed={reducedMotion}
            onClick={() => setReducedMotion((value) => !value)}
          >
            <Sparkle size={12} /> {reducedMotion ? 'Motion off' : 'Motion on'}
          </button>
        </div>
      </section>
    </main>
  );
}
