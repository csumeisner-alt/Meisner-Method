import { useState } from "react";
import "./_group.css";

function DaiquiriBottle({ size = 250, muted = false }: { size?: number; muted?: boolean }) {
  const glass = muted ? "#77808b" : "#b9eaff";
  const yellow = muted ? "#6e6940" : "#f6d64a";
  const blue = muted ? "#4f6572" : "#69c8ff";
  const cap = muted ? "#58616b" : "#d7eefb";
  return (
    <svg
      width={size}
      height={size * 1.34}
      viewBox="0 0 60 80"
      role="img"
      aria-label="Dave Ramsey Daiquiri light blue bottle with yellow liquid and white D"
    >
      <path d="M23 4h14v10l5 7v45c0 6-5 10-12 10s-12-4-12-10V21l5-7V4Z" fill="rgba(205,244,255,0.14)" stroke={glass} strokeWidth="2.2" />
      <path d="M21 37h18v29c0 4-3.3 7-9 7s-9-3-9-7V37Z" fill={yellow} opacity={muted ? 0.48 : 0.92} />
      <path d="M21 37h18v10H21z" fill={blue} opacity={muted ? 0.44 : 0.8} />
      <path d="M25 4h10v5H25z" fill={cap} />
      <path d="M23 22h14" stroke={glass} strokeWidth="1.5" opacity="0.85" />
      <path d="M25 29h5.4c5.2 0 7.6 2.5 7.6 6.3 0 3.9-2.4 6.5-7.6 6.5H25V29Zm4 3.4v6h1.2c2.4 0 3.6-1.1 3.6-3.1 0-1.9-1.2-2.9-3.6-2.9H29Z" fill="#fff" />
      <path d="M21 61c5 2 13 2 18 0" stroke="#fff5ad" strokeOpacity="0.7" strokeWidth="1.2" />
    </svg>
  );
}

export function Current() {
  const [burst, setBurst] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [status, setStatus] = useState("READY · ONE-SPIN BOOST");

  const redeem = () => {
    setBurst(false);
    requestAnimationFrame(() => setBurst(true));
    setStatus(reducedMotion ? "DAIQUIRI ARMED · 45% WIN · 55% LOSS · DOUBLE AWARD" : "CRACKING OPEN · WATCH THE SURGE");
    window.setTimeout(() => setStatus("DAIQUIRI ARMED · 45% WIN · 55% LOSS · DOUBLE AWARD"), reducedMotion ? 180 : 1100);
  };

  return (
    <main className="daiquiri-group current-shell">
      <section className={`current-panel ${burst ? "is-bursting" : ""} ${reducedMotion ? "motion-static" : ""}`} aria-label="Central Bank Daiquiri redemption panel">
        <header className="current-header">
          <div>
            <p className="eyebrow mono">CENTRAL BANK / REWARDS MACHINE</p>
            <h1 className="serif">Dave Ramsey Daiquiri</h1>
          </div>
          <span className="inventory-chip mono">01 BOTTLE</span>
        </header>

        <div className="current-stage">
          <div className="current-halo" />
          <div className="current-bottle"><DaiquiriBottle size={185} /></div>
          <div className="current-ooze" aria-hidden="true"><i /><i /><i /></div>
        </div>

        <div className="current-copy">
          <p>Crack one into the machine before a toss: 45% win odds, 55% loss odds, and a double award if it pays.</p>
          <div className="odds-row mono">
            <span><b>45%</b> WIN</span>
            <span><b>55%</b> LOSS</span>
            <span><b>2×</b> AWARD</span>
          </div>
        </div>

        <div className="current-status" role="status">
          <span className="status-dot" />
          <span className="mono">{status}</span>
        </div>

        <button className="redeem-button mono" onClick={redeem} type="button">
          {burst ? "REDEEMED · NEXT TOSS LOADED" : "REDEEM DAIQUIRI"}
        </button>

        <div className="current-footer">
          <span className="mono">LIGHT BLUE + YELLOW LIQUID</span>
          <button className="motion-toggle mono" type="button" onClick={() => setReducedMotion((value) => !value)} aria-pressed={reducedMotion}>
            {reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF"}
          </button>
        </div>
      </section>
    </main>
  );
}