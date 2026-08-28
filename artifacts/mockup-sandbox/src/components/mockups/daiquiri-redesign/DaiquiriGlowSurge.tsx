import { useState } from "react";
import "./_group.css";

const bubbles = [
  [34, 70, 1.6, 0.1], [42, 58, 1.1, 0.7], [49, 78, 1.3, 1.2], [57, 64, 1.8, 0.4],
  [66, 73, 1.1, 1.8], [39, 45, 0.9, 1.5], [61, 49, 1.2, 2.1], [53, 34, 0.8, 0.3],
  [46, 25, 1.2, 1.1], [58, 29, 0.7, 1.7], [37, 82, 0.7, 2.2], [68, 54, 0.8, 0.9],
];

function GlowBottle() {
  return (
    <svg className="glow-bottle" viewBox="0 0 260 510" role="img" aria-label="A collectible navy and gold Dave Ramsey Daiquiri bottle">
      <defs>
        <linearGradient id="glassBody" x1="0" x2="1">
          <stop offset="0" stopColor="#07192f" />
          <stop offset=".2" stopColor="#234f75" />
          <stop offset=".44" stopColor="#0a2748" />
          <stop offset=".74" stopColor="#071b35" />
          <stop offset="1" stopColor="#4e7390" />
        </linearGradient>
        <linearGradient id="goldLiquid" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff3a0" />
          <stop offset=".24" stopColor="#f8d34c" />
          <stop offset=".72" stopColor="#c89027" />
          <stop offset="1" stopColor="#ffe878" />
        </linearGradient>
        <radialGradient id="warmGlow">
          <stop stopColor="#ffe777" stopOpacity=".95" />
          <stop offset=".5" stopColor="#e9ad34" stopOpacity=".5" />
          <stop offset="1" stopColor="#bf7b1e" stopOpacity="0" />
        </radialGradient>
        <filter id="softGlow"><feGaussianBlur stdDeviation="9" /></filter>
        <clipPath id="liquidClip"><path d="M70 202h120v246c0 25-24 42-60 42s-60-17-60-42V202Z" /></clipPath>
      </defs>

      <ellipse className="bottle-warm-glow" cx="130" cy="362" rx="101" ry="143" fill="url(#warmGlow)" filter="url(#softGlow)" />
      <path d="M83 30h94v43l19 31v320c0 50-28 73-66 73s-66-23-66-73V104l19-31V30Z" fill="url(#glassBody)" stroke="#a9d7ed" strokeOpacity=".72" strokeWidth="3" />
      <path d="M92 32h76v46l18 30v314c0 41-21 61-56 61s-56-20-56-61V108l18-30V32Z" fill="#0c2844" fillOpacity=".43" />
      <path d="M70 202h120v246c0 25-24 42-60 42s-60-17-60-42V202Z" fill="url(#goldLiquid)" className="liquid-fill" />
      <g clipPath="url(#liquidClip)">
        <path d="M53 238c33-21 75 10 154-17v225H53Z" fill="#ffec7d" fillOpacity=".35" className="liquid-line" />
        {bubbles.map(([cx, cy, r, delay], index) => <circle key={index} className="bubble" cx={cx * 2.6} cy={cy * 5.1} r={r * 2.1} style={{ animationDelay: `${delay}s` }} />)}
      </g>
      <image className="neck-label" href="/__mockup/images/dave-ramsey-neck-label.png" x="91" y="105" width="78" height="40" preserveAspectRatio="xMidYMid slice" />
      <image href="/__mockup/images/dave-ramsey-label.png" x="51" y="220" width="158" height="205" preserveAspectRatio="xMidYMid slice" />
      <path d="M51 322c0-57 35-103 79-103s79 46 79 103-35 103-79 103-79-46-79-103Z" fill="none" stroke="#f8de77" strokeOpacity=".72" strokeWidth="2" />
      <path d="M99 46c-12 36-7 80-7 122v221c0 45 11 70 21 78" fill="none" stroke="#dff8ff" strokeOpacity=".7" strokeWidth="5" strokeLinecap="round" className="glass-highlight" />
      <path d="M157 52c13 33 8 72 9 116" fill="none" stroke="#fff" strokeOpacity=".42" strokeWidth="3" strokeLinecap="round" />
      <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill="#071429" stroke="#7599b6" strokeWidth="2" />
      <path d="M86 42h88" stroke="#f4d56c" strokeWidth="3" className="cap-glint" />
      <path d="M85 50h90" stroke="#a77a25" strokeWidth="5" opacity=".7" />
    </svg>
  );
}

export function DaiquiriGlowSurge() {
  const [active, setActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [status, setStatus] = useState("SEALED · ONE-SPIN BOOST READY");

  const replay = () => {
    setActive(false);
    requestAnimationFrame(() => setActive(true));
    setStatus(reducedMotion ? "DAIQUIRI ARMED · 45% WIN · 65% LOSS · DOUBLE AWARD" : "SURGE IN PROGRESS · DOUBLE AWARD LOADED");
    window.setTimeout(() => setStatus("DAIQUIRI ARMED · 45% WIN · 65% LOSS · DOUBLE AWARD"), reducedMotion ? 180 : 2400);
  };

  return (
    <main className="daiquiri-group glow-shell">
      <section className={`glow-panel ${active ? "is-active" : ""} ${reducedMotion ? "motion-static" : ""}`} aria-label="Central Bank Daiquiri redemption panel">
        <div className="vault-topline">
          <span className="mono">MEISNER METHOD</span>
          <span className="vault-lock mono"><i /> CENTRAL BANK / 07</span>
        </div>
        <header className="glow-header">
          <div>
            <p className="eyebrow mono">REWARDS MACHINE / COLLECTIBLE 01</p>
            <h1 className="serif">Dave Ramsey<br /><em>Daiquiri</em></h1>
          </div>
          <div className="seal mono">R<br /><small>REDEEM</small></div>
        </header>

        <div className="glow-stage">
          <div className="stage-grid" aria-hidden="true" />
          <div className="stage-spotlight" aria-hidden="true" />
          <div className="bottle-wrap"><GlowBottle /></div>
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
          <p className="detail-copy">Crack one into the machine before a toss: 45% win odds, 65% loss odds, and a double award if it pays.</p>
          <div className="odds-strip">
            <div><span className="mono">WIN ODDS</span><strong>45%</strong></div>
            <div><span className="mono">LOSS ODDS</span><strong>65%</strong></div>
            <div><span className="mono">PAYOUT</span><strong>2×</strong></div>
          </div>
        </div>

        <div className="glow-status" role="status">
          <span className="pulse-dot" />
          <span className="mono">{status}</span>
        </div>
        <button type="button" className="glow-redeem mono" onClick={replay}>
          <span>{active ? "BOTTLE CRACKED" : "REDEEM DAIQUIRI"}</span><b>↗</b>
        </button>
        <div className="glow-footer">
      <span>NAVY GLASS + GOLD LIQUID · DOUBLE AWARD ON WIN</span>
          <button type="button" className="motion-toggle mono" onClick={() => setReducedMotion((value) => !value)} aria-pressed={reducedMotion}>
            {reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF"}
          </button>
        </div>
      </section>
    </main>
  );
}