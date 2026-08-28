import { useEffect, useRef, useState } from "react";
import "./_group.css";

const bubbles = [
  [58, 432, 3.2, 0.2], [79, 393, 2.3, 0.8], [101, 449, 3.5, 1.3], [124, 408, 2.7, 0.4],
  [150, 437, 3.1, 1.9], [177, 382, 2.1, 1.5], [193, 424, 3.5, 2.2], [86, 355, 2.2, 0.35],
  [117, 372, 2.8, 1.15], [144, 339, 1.8, 1.75], [70, 461, 1.6, 2.3], [181, 403, 2, 0.9],
];

function StaminUpBottle() {
  return (
    <svg className="glow-bottle" viewBox="0 0 260 510" role="img" aria-label="A premium amber Stamin Up bottle that converts winning awards to Dark Brew Tokens">
      <defs>
        <linearGradient id="staminGlassBody" x1="0" x2="1">
          <stop stopColor="#211006" />
          <stop offset=".18" stopColor="#7a3c14" />
          <stop offset=".42" stopColor="#3f1b08" />
          <stop offset=".72" stopColor="#281006" />
          <stop offset="1" stopColor="#b16a27" />
        </linearGradient>
        <linearGradient id="staminLiquid" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffd779" />
          <stop offset=".2" stopColor="#f5a32c" />
          <stop offset=".6" stopColor="#c45d12" />
          <stop offset="1" stopColor="#70260d" />
        </linearGradient>
        <linearGradient id="staminCap" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#7d4a12" />
          <stop offset=".22" stopColor="#f8cf5d" />
          <stop offset=".5" stopColor="#fff0a0" />
          <stop offset=".78" stopColor="#c18722" />
          <stop offset="1" stopColor="#6a3d0b" />
        </linearGradient>
        <radialGradient id="staminGlow">
          <stop stopColor="#ffd86b" stopOpacity=".86" />
          <stop offset=".5" stopColor="#e57a1d" stopOpacity=".36" />
          <stop offset="1" stopColor="#7c2b0e" stopOpacity="0" />
        </radialGradient>
        <filter id="staminSoftGlow"><feGaussianBlur stdDeviation="10" /></filter>
        <filter id="staminLabelShadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#120500" floodOpacity=".78" />
        </filter>
        <clipPath id="staminLiquidClip"><path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" /></clipPath>
      </defs>

      <ellipse className="bottle-warm-glow" cx="130" cy="358" rx="108" ry="150" fill="url(#staminGlow)" filter="url(#staminSoftGlow)" />
      <path d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z" fill="url(#staminGlassBody)" stroke="#ffd38c" strokeOpacity=".78" strokeWidth="3" />
      <path d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z" fill="#341507" fillOpacity=".38" />
      <path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill="url(#staminLiquid)" className="liquid-fill stamin-liquid-fill" />
      <g clipPath="url(#staminLiquidClip)">
        {bubbles.map(([cx, cy, r, delay], index) => (
          <circle key={index} className="bubble stamin-bubble" cx={cx} cy={cy} r={r} fill="#fff0b0" fillOpacity=".66" style={{ animationDelay: `${delay}s` }} />
        ))}
      </g>

      <path d="M103 70c-8 55-6 104-6 158v183c0 28 8 51 18 67l11-5c-10-22-14-41-14-66V212c0-56-2-101 8-145Z" fill="#fff0bd" fillOpacity=".1" />

      <g className="stamin-neck-label neck-label" filter="url(#staminLabelShadow)">
        <rect x="98" y="106" width="64" height="39" rx="7" fill="#132c43" fillOpacity=".94" stroke="#f2bd55" strokeOpacity=".76" strokeWidth="1.5" />
        <rect x="102" y="110" width="56" height="31" rx="4.5" fill="#214968" fillOpacity=".46" stroke="#ffe2a1" strokeOpacity=".2" />
        <circle cx="130" cy="125.5" r="12.5" fill="#f6c65b" fillOpacity=".45" stroke="#ffe5a1" strokeOpacity=".8" strokeWidth="1.3" />
        <path d="M130 116v19M123 125.5h14" stroke="#172b3c" strokeOpacity=".92" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="130" cy="125.5" r="4" fill="none" stroke="#172b3c" strokeOpacity=".72" strokeWidth="1" />
        <path d="M104 111h52" stroke="#fff0bd" strokeOpacity=".2" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      <g className="stamin-bottle-label" filter="url(#staminLabelShadow)">
        <circle cx="130" cy="322" r="80" fill="#ffe4a0" fillOpacity=".94" stroke="#fff0bd" strokeWidth="2" />
        <circle cx="130" cy="322" r="72" fill="#16324a" stroke="#f8c95f" strokeOpacity=".9" strokeWidth="3" />
        <text x="130" y="280" textAnchor="middle" fill="#ffe7aa" fontFamily="DM Mono, monospace" fontSize="12" fontWeight="700" letterSpacing="1.1">STAMIN UP</text>
        <g className="stamin-tornado">
          <path className="stamin-tornado-swirl" d="M103 303c10-12 43-14 54 0 5 7-3 14-17 15-13 1-23 3-23 10 0 8 12 10 21 10 13 0 18 4 15 10-3 7-11 11-18 14" fill="none" stroke="#ffd66c" strokeWidth="4.2" strokeLinecap="round" />
          <path className="stamin-tornado-core" d="M108 305c10 5 30 5 44 0M115 319c8 4 20 4 29 0M122 333c5 3 11 3 16 0M127 349h7" fill="none" stroke="#fff0bb" strokeOpacity=".86" strokeWidth="2.2" strokeLinecap="round" />
        </g>
        <path d="M113 350c10 5 24 5 34 0" fill="none" stroke="#f5c65b" strokeOpacity=".62" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      <g className="stamin-cap">
        <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill="url(#staminCap)" stroke="#fff0bd" strokeOpacity=".8" strokeWidth="2" />
        <path className="stamin-cap-glint" d="M101 34h58" stroke="#fff8cf" strokeOpacity=".28" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function StaminUpGlowSurge() {
  const [active, setActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [status, setStatus] = useState("SEALED · DARK BREW CONVERSION READY");
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
    setStatus(reducedMotion ? "STAMIN UP ARMED · WIN AWARD CONVERTS TO DARK BREW" : "CHARGE RELEASED · DARK BREW RESERVE LOADED");
    statusTimer.current = window.setTimeout(() => {
      statusTimer.current = null;
      setStatus("STAMIN UP ARMED · WIN AWARD CONVERTS TO DARK BREW");
    }, reducedMotion ? 180 : 2400);
  };

  return (
    <main className="stamin-up-group glow-shell">
      <section className={`glow-panel ${active ? "is-active" : ""} ${reducedMotion ? "motion-static" : ""}`} aria-label="Central Bank Stamin Up redemption panel">
        <div className="vault-topline">
          <span className="mono">MEISNER METHOD</span>
          <span className="vault-lock mono"><i /> CENTRAL BANK / 09</span>
        </div>
        <header className="glow-header">
          <div>
            <p className="eyebrow mono">REWARDS MACHINE / COLLECTIBLE 03</p>
            <h1 className="serif">Stamin Up</h1>
          </div>
          <div className="seal mono">S</div>
        </header>

        <div className="glow-stage">
          <div className="stage-grid" aria-hidden="true" />
          <div className="stage-spotlight" aria-hidden="true" />
          <div className="bottle-wrap"><StaminUpBottle /></div>
          <div className="pedestal" aria-hidden="true"><span /></div>
          <div className="surge-ring ring-one" aria-hidden="true" />
          <div className="surge-ring ring-two" aria-hidden="true" />
          <div className="splash" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </div>

        <div className="glow-details">
          <div className="detail-heading">
            <div>
              <p className="eyebrow mono">ONE-SPIN BOOST</p>
              <h2>Spin the storm.</h2>
            </div>
            <span className="bottle-count mono">01 / 01</span>
          </div>
          <p className="detail-copy">On a winning toss, keep your Brew Token stake and convert the equal award into Dark Brew Tokens.</p>
          <div className="odds-strip">
            <div><span className="mono">WIN ODDS</span><strong>55%</strong></div>
            <div><span className="mono">LOSS ODDS</span><strong>45%</strong></div>
            <div><span className="mono">RESERVE</span><strong>1×</strong></div>
          </div>
        </div>

        <div className="glow-status" role="status">
          <span className="pulse-dot" />
          <span className="mono">{status}</span>
        </div>
        <button type="button" className="glow-redeem mono" onClick={replay}>
          <span>{active ? "RESERVE CHARGED" : "REDEEM STAMIN UP"}</span><b>↗</b>
        </button>
        <div className="glow-footer">
          <span>AMBER GLASS + GOLD CHARGE · DARK BREW ON WIN</span>
          <button type="button" className="motion-toggle mono" onClick={() => setReducedMotion((value) => !value)} aria-pressed={reducedMotion}>
            {reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF"}
          </button>
        </div>
      </section>
    </main>
  );
}