import { useEffect, useRef, useState } from "react";
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
        <linearGradient id="capGold" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#6f5016" />
          <stop offset=".22" stopColor="#f9df76" />
          <stop offset=".5" stopColor="#fff1a1" />
          <stop offset=".76" stopColor="#c89b32" />
          <stop offset="1" stopColor="#624411" />
        </linearGradient>
        <radialGradient id="warmGlow">
          <stop stopColor="#ffe777" stopOpacity=".95" />
          <stop offset=".5" stopColor="#e9ad34" stopOpacity=".5" />
          <stop offset="1" stopColor="#bf7b1e" stopOpacity="0" />
        </radialGradient>
        <filter id="softGlow"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id="labelShadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#020812" floodOpacity=".72" />
        </filter>
        <clipPath id="liquidClip"><path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" /></clipPath>
        <clipPath id="portraitClip"><circle cx="130" cy="322" r="51" /></clipPath>
      </defs>

      <ellipse className="bottle-warm-glow" cx="130" cy="362" rx="101" ry="143" fill="url(#warmGlow)" filter="url(#softGlow)" />
      <path d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z" fill="url(#glassBody)" stroke="#a9d7ed" strokeOpacity=".72" strokeWidth="3" />
      <path d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z" fill="#0c2844" fillOpacity=".43" />
      <path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill="url(#goldLiquid)" className="liquid-fill" />
      <g clipPath="url(#liquidClip)">
        <path d="M53 238c33-21 75 10 154-17v225H53Z" fill="#ffec7d" fillOpacity=".35" className="liquid-line" />
        {bubbles.map(([cx, cy, r, delay], index) => (
          <circle
            key={index}
            className="bubble"
            cx={cx * 2.6}
            cy={cy * 5.1}
            r={r * 2.1}
            fill="#fff4a1"
            fillOpacity=".68"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </g>
      <g className="neck-medallion neck-label" filter="url(#labelShadow)">
        <rect x="99" y="106" width="62" height="39" rx="7" fill="#0c3158" fillOpacity=".94" stroke="#6e9fbd" strokeOpacity=".54" strokeWidth="1.5" />
        <rect x="102" y="109" width="56" height="33" rx="4.5" fill="none" stroke="#b8e0ed" strokeOpacity=".18" strokeWidth="1" />
        <circle cx="130" cy="125.5" r="13" fill="#f0c75e" fillOpacity=".38" stroke="#f6da86" strokeOpacity=".76" strokeWidth="1.5" />
        <circle cx="130" cy="125.5" r="9.5" fill="#071f39" fillOpacity=".12" />
        <text x="130" y="132" textAnchor="middle" fill="#09284a" fillOpacity=".94" fontFamily="Georgia, serif" fontSize="18" fontWeight="700">R</text>
        <path d="M104 111h52" stroke="#d9f5ff" strokeOpacity=".2" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="bottle-label" filter="url(#labelShadow)">
        <circle cx="130" cy="322" r="80" fill="url(#capGold)" stroke="#fff0a0" strokeWidth="2" />
        <circle cx="130" cy="322" r="72" fill="#08264a" stroke="#163f69" strokeWidth="3" />
        <image href="/__mockup/images/dave-ramsey-portrait.png" x="79" y="271" width="102" height="102" clipPath="url(#portraitClip)" preserveAspectRatio="xMidYMid slice" />
        <rect x="77" y="251" width="106" height="27" rx="13.5" fill="url(#capGold)" stroke="#fff0a0" strokeWidth="1" />
        <text x="130" y="269" textAnchor="middle" fill="#08264a" fontFamily="Playfair Display, Georgia, serif" fontSize="12" fontWeight="700" letterSpacing=".8">DAVE RAMSEY</text>
        <rect x="73" y="366" width="114" height="31" rx="15.5" fill="url(#capGold)" stroke="#fff0a0" strokeWidth="1" />
        <text x="130" y="388" textAnchor="middle" fill="#08264a" fontFamily="Playfair Display, Georgia, serif" fontSize="18" fontWeight="700" fontStyle="italic">Daiquiri</text>
      </g>
      <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill="url(#capGold)" stroke="#fff0a0" strokeWidth="2" />
      <circle cx="130" cy="38" r="10" fill="#e4b843" stroke="#0a2242" strokeWidth="1.5" />
      <text x="130" y="44" textAnchor="middle" fill="#0a2242" fontFamily="Georgia, serif" fontSize="13" fontWeight="700">R</text>
    </svg>
  );
}

export function DaiquiriGlowSurge() {
  const [active, setActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [status, setStatus] = useState("SEALED · ONE-SPIN BOOST READY");
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
    setStatus(reducedMotion ? "DAIQUIRI ARMED · 45% WIN · 55% LOSS · DOUBLE AWARD" : "SURGE IN PROGRESS · DOUBLE AWARD LOADED");
    statusTimer.current = window.setTimeout(() => {
      statusTimer.current = null;
      setStatus("DAIQUIRI ARMED · 45% WIN · 55% LOSS · DOUBLE AWARD");
    }, reducedMotion ? 180 : 2400);
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
          <p className="detail-copy">Crack one into the machine before a toss: 45% win odds, 55% loss odds, and a double award if it pays.</p>
          <div className="odds-strip">
            <div><span className="mono">WIN ODDS</span><strong>45%</strong></div>
             <div><span className="mono">LOSS ODDS</span><strong>55%</strong></div>
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