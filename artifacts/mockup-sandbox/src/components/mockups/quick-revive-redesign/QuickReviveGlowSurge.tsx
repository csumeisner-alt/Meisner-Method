import { useEffect, useRef, useState } from "react";
import "./_group.css";

const bubbles = [
  [58, 424, 3.5, 0.1], [78, 391, 2.4, 0.7], [101, 448, 3, 1.2], [124, 410, 4, 0.4],
  [151, 438, 2.6, 1.8], [173, 370, 2.2, 1.5], [190, 426, 3.3, 2.1], [86, 345, 2, 0.3],
  [117, 362, 2.8, 1.1], [143, 332, 1.8, 1.7], [69, 454, 1.7, 2.2], [181, 391, 2, 0.9],
];

function QuickReviveBottle() {
  return (
    <svg className="glow-bottle" viewBox="0 0 260 510" role="img" aria-label="A luminous cyan Quick Revive soda bottle">
      <defs>
        <linearGradient id="quickGlassBody" x1="0" x2="1">
          <stop stopColor="#061c35" />
          <stop offset=".2" stopColor="#165b7d" />
          <stop offset=".43" stopColor="#092f53" />
          <stop offset=".74" stopColor="#06213e" />
          <stop offset="1" stopColor="#5aa7c1" />
        </linearGradient>
        <linearGradient id="quickLiquid" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#c8ffff" />
          <stop offset=".2" stopColor="#5be3ff" />
          <stop offset=".62" stopColor="#159ed7" />
          <stop offset="1" stopColor="#075589" />
        </linearGradient>
        <linearGradient id="quickCap" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#020b1c" />
          <stop offset=".42" stopColor="#123b5d" />
          <stop offset=".68" stopColor="#061c37" />
          <stop offset="1" stopColor="#010914" />
        </linearGradient>
        <radialGradient id="quickGlow">
          <stop stopColor="#72f2ff" stopOpacity=".84" />
          <stop offset=".5" stopColor="#1dbde9" stopOpacity=".34" />
          <stop offset="1" stopColor="#0876b2" stopOpacity="0" />
        </radialGradient>
        <filter id="quickSoftGlow"><feGaussianBlur stdDeviation="10" /></filter>
        <filter id="quickLabelShadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#010a18" floodOpacity=".74" />
        </filter>
        <clipPath id="quickLiquidClip"><path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" /></clipPath>
      </defs>

      <ellipse className="bottle-warm-glow" cx="130" cy="358" rx="106" ry="149" fill="url(#quickGlow)" filter="url(#quickSoftGlow)" />
      <path d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z" fill="url(#quickGlassBody)" stroke="#b6f5ff" strokeOpacity=".76" strokeWidth="3" />
      <path d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z" fill="#092b4b" fillOpacity=".42" />
      <path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill="url(#quickLiquid)" className="liquid-fill quick-liquid-fill" />
      <g clipPath="url(#quickLiquidClip)">
        {bubbles.map(([cx, cy, r, delay], index) => (
          <circle key={index} className="bubble quick-fizz-bubble" cx={cx} cy={cy} r={r} fill="#eaffff" fillOpacity=".72" style={{ animationDelay: `${delay}s` }} />
        ))}
      </g>

      <path d="M102 72c-8 54-6 102-6 157v183c0 28 8 51 18 67l11-5c-10-22-14-41-14-66V213c0-57-2-101 8-146Z" fill="#dcffff" fillOpacity=".12" />

      <g className="quick-neck-label neck-label" filter="url(#quickLabelShadow)">
        <rect x="98" y="106" width="64" height="39" rx="7" fill="#075b91" fillOpacity=".94" stroke="#a5f5ff" strokeOpacity=".56" strokeWidth="1.5" />
        <rect x="102" y="110" width="56" height="31" rx="4.5" fill="#0b77ad" fillOpacity=".42" stroke="#d9ffff" strokeOpacity=".2" />
        <circle cx="130" cy="125.5" r="12.5" fill="#f0ffff" fillOpacity=".14" stroke="#d8ffff" strokeOpacity=".64" strokeWidth="1.3" />
        <path d="M126 119h8v3l2.5 3.5v8c0 2-2.3 3.4-6.5 3.4s-6.5-1.4-6.5-3.4v-8L126 122v-3Z" fill="none" stroke="#eaffff" strokeOpacity=".9" strokeWidth="1.2" />
        <path d="M124 126h12M127 121h6" stroke="#eaffff" strokeOpacity=".8" strokeWidth="1" strokeLinecap="round" />
      </g>

      <g className="quick-bottle-label" filter="url(#quickLabelShadow)">
        <circle cx="130" cy="322" r="80" fill="#dfffff" fillOpacity=".94" stroke="#b7f8ff" strokeWidth="2" />
        <circle cx="130" cy="322" r="72" fill="#0873aa" stroke="#dfffff" strokeOpacity=".58" strokeWidth="2.5" />
        <text x="130" y="280" textAnchor="middle" fill="#edffff" fontFamily="DM Mono, monospace" fontSize="13" fontWeight="700" letterSpacing="1.2">REVIVE</text>
        <path d="M118 301h24v7l4 5v27c0 5-5.4 9-16 9s-16-4-16-9v-27l4-5v-7Z" fill="none" stroke="#edffff" strokeOpacity=".96" strokeWidth="2" />
        <path d="M118 316h24M123 306h14M125 328h10M130 321v14" fill="none" stroke="#edffff" strokeOpacity=".94" strokeWidth="1.7" strokeLinecap="round" />
        <text x="130" y="373" textAnchor="middle" fill="#edffff" fontFamily="Outfit, sans-serif" fontSize="12" fontWeight="600" letterSpacing="2.4">SODA</text>
      </g>

      <g className="quick-cap">
        <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill="url(#quickCap)" stroke="#8fdff3" strokeOpacity=".72" strokeWidth="2" />
        <path className="quick-cap-glint" d="M101 34h58" stroke="#d8fbff" strokeOpacity=".22" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function QuickReviveGlowSurge() {
  const [active, setActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [status, setStatus] = useState("SEALED · FIZZ BOOST READY");
  const statusTimer = useRef<number | null>(null);
  const replayFrame = useRef<number | null>(null);

  useEffect(() => () => {
    if (statusTimer.current !== null) {
      window.clearTimeout(statusTimer.current);
    }
    if (replayFrame.current !== null) {
      window.cancelAnimationFrame(replayFrame.current);
    }
  }, []);

  const replay = () => {
    if (statusTimer.current !== null) {
      window.clearTimeout(statusTimer.current);
    }
    if (replayFrame.current !== null) {
      window.cancelAnimationFrame(replayFrame.current);
    }
    setActive(false);
    replayFrame.current = window.requestAnimationFrame(() => {
      replayFrame.current = null;
      setActive(true);
    });
    setStatus(reducedMotion ? "QUICK REVIVE ARMED · 62% WIN ODDS" : "FIZZ RELEASED · QUICK REVIVE LOADED");
    statusTimer.current = window.setTimeout(() => {
      statusTimer.current = null;
      setStatus("QUICK REVIVE ARMED · 62% WIN ODDS");
    }, reducedMotion ? 180 : 2400);
  };

  return (
    <main className="quick-revive-group glow-shell">
      <section className={`glow-panel ${active ? "is-active" : ""} ${reducedMotion ? "motion-static" : ""}`} aria-label="Central Bank Quick Revive redemption panel">
        <div className="vault-topline">
          <span className="mono">MEISNER METHOD</span>
          <span className="vault-lock mono"><i /> CENTRAL BANK / 05</span>
        </div>
        <header className="glow-header">
          <div>
            <p className="eyebrow mono">REWARDS MACHINE / COLLECTIBLE 02</p>
            <h1 className="serif">Quick Revive<br /><em>Soda</em></h1>
          </div>
          <div className="seal mono">+</div>
        </header>

        <div className="glow-stage">
          <div className="stage-grid" aria-hidden="true" />
          <div className="stage-spotlight" aria-hidden="true" />
          <div className="bottle-wrap"><QuickReviveBottle /></div>
          <div className="pedestal" aria-hidden="true"><span /></div>
          <div className="surge-ring ring-one" aria-hidden="true" />
          <div className="surge-ring ring-two" aria-hidden="true" />
          <div className="splash" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </div>

        <div className="glow-details">
          <div className="detail-heading">
            <div>
              <p className="eyebrow mono">ONE-SPIN BOOST</p>
              <h2>Crack the bottle.</h2>
            </div>
            <span className="bottle-count mono">01 / 01</span>
          </div>
          <p className="detail-copy">Crack one before a toss: 62% win odds and a clean boost when the bubbles break.</p>
          <div className="odds-strip">
            <div><span className="mono">WIN ODDS</span><strong>62%</strong></div>
            <div><span className="mono">LOSS ODDS</span><strong>38%</strong></div>
            <div><span className="mono">BOOST</span><strong>+1 TOSS</strong></div>
          </div>
        </div>

        <div className="glow-status" role="status">
          <span className="pulse-dot" />
          <span className="mono">{status}</span>
        </div>
        <button type="button" className="glow-redeem mono" onClick={replay}>
          <span>{active ? "BOTTLE CRACKED" : "REDEEM QUICK REVIVE"}</span><b>↗</b>
        </button>
        <div className="glow-footer">
          <span>CYAN SODA GLASS · FIZZ LIFT</span>
          <button type="button" className="motion-toggle mono" onClick={() => setReducedMotion((value) => !value)} aria-pressed={reducedMotion}>
            {reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF"}
          </button>
        </div>
      </section>
    </main>
  );
}