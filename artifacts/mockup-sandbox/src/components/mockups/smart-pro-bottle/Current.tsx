import React from "react";

function SmartProBottle() {
  const prefix = "smart-pro-canvas";
  return (
    <svg
      width="260"
      height="510"
      viewBox="0 0 260 510"
      role="img"
      aria-label="SmartPro Soda glowing lime-green bottle"
    >
      <defs>
        <linearGradient id={`${prefix}-glass`} x1="0" x2="1">
          <stop stopColor="#071c17" />
          <stop offset="0.2" stopColor="#2c7d45" />
          <stop offset="0.46" stopColor="#0c3a2b" />
          <stop offset="0.76" stopColor="#09251d" />
          <stop offset="1" stopColor="#96d86d" />
        </linearGradient>
        <linearGradient id={`${prefix}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f2ffd0" />
          <stop offset="0.2" stopColor="#d9ff65" />
          <stop offset="0.62" stopColor="#a8f52b" />
          <stop offset="1" stopColor="#51a51f" />
        </linearGradient>
        <linearGradient id={`${prefix}-cap`} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#050708" />
          <stop offset="0.42" stopColor="#263831" />
          <stop offset="0.68" stopColor="#0b1511" />
          <stop offset="1" stopColor="#020303" />
        </linearGradient>
        <clipPath id={`${prefix}-liquid-clip`}>
          <path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" />
        </clipPath>
        <filter id={`${prefix}-shadow`} x="-40%" y="-20%" width="180%" height="160%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <ellipse cx="130" cy="478" rx="92" ry="17" fill="#a8f52b" opacity="0.2" filter={`url(#${prefix}-shadow)`} />
      <path
        d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z"
        fill={`url(#${prefix}-glass)`}
        stroke="#ddffd0"
        strokeOpacity="0.86"
        strokeWidth="3"
      />
      <path
        d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z"
        fill="#071c17"
        fillOpacity="0.34"
      />
      <path
        d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z"
        fill={`url(#${prefix}-liquid)`}
        fillOpacity="0.97"
      />
      <g clipPath={`url(#${prefix}-liquid-clip)`}>
        <path d="M42 245c45-18 88 12 177-20v220H42Z" fill="#f4ffd4" fillOpacity="0.25" />
        {[
          [58, 424, 3.5], [78, 391, 2.4], [101, 448, 3], [124, 410, 4],
          [151, 438, 2.6], [173, 370, 2.2], [190, 426, 3.3], [86, 345, 2],
          [117, 362, 2.8], [143, 332, 1.8], [69, 454, 1.7], [181, 391, 2],
        ].map(([cx, cy, r], index) => (
          <circle key={index} cx={cx} cy={cy} r={r} fill="#f4ffd9" fillOpacity="0.78" />
        ))}
      </g>
      <path d="M103 70c-8 55-6 104-6 158v183c0 28 8 51 18 67l11-5c-10-22-14-41-14-66V212c0-56-2-101 8-145Z" fill="#f4ffe9" fillOpacity="0.17" />
      <g>
        <path d="M98 106h64v39H98Z" fill="#092c3c" stroke="#b9ff45" strokeOpacity="0.74" strokeWidth="1.5" />
        <path d="M102 110h56v31h-56Z" fill="#2e7b49" fillOpacity="0.44" stroke="#f7fff0" strokeOpacity="0.2" />
        <text x="130" y="133" fill="#f7fff0" fontSize="23" fontWeight="900" textAnchor="middle">S</text>
      </g>
      <g>
        <circle cx="130" cy="322" r="80" fill="#e8ffd4" fillOpacity="0.96" stroke="#b9ff45" strokeWidth="2" />
        <circle cx="130" cy="322" r="72" fill="#092c3c" stroke="#dcffc0" strokeOpacity="0.65" strokeWidth="2.5" />
        <circle cx="130" cy="322" r="50" fill="none" stroke="#b9ff45" strokeOpacity="0.7" strokeWidth="1.5" />
        <text x="130" y="283" fill="#f7fff0" fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="1.4">SMARTPRO</text>
        <text x="130" y="350" fill="#b9ff45" fontSize="62" fontWeight="900" textAnchor="middle">S</text>
        <text x="130" y="375" fill="#f7fff0" fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="2.2">SODA</text>
      </g>
      <g>
        <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill={`url(#${prefix}-cap)`} stroke="#b9e7ff" strokeOpacity="0.86" strokeWidth="2" />
        <path d="M101 34h58" stroke="#e8f6ff" strokeOpacity="0.34" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Current() {
  return (
    <main className="smart-pro-frame">
      <div className="smart-pro-kicker">
        <span className="smart-pro-status-dot" />
        CENTRAL BANK / NEW RECIPE
      </div>
      <section className="smart-pro-card">
        <div className="smart-pro-copy">
          <p className="smart-pro-eyebrow">SMARTPRO SODA</p>
          <h1>The lime-green<br />flash sale.</h1>
          <p className="smart-pro-description">
             One bottle opens a 90-second window where every other bottle is half price. Recipe unlocks stay full price.
          </p>
          <div className="smart-pro-meta">
            <span>100 TOKENS TO UNLOCK</span>
            <span>3 TOKENS / BOTTLE</span>
          </div>
        </div>
        <div className="smart-pro-stage">
          <div className="smart-pro-halo" />
          <div className="smart-pro-spark smart-pro-spark-a">✦</div>
          <div className="smart-pro-spark smart-pro-spark-b">+</div>
          <div className="smart-pro-bottle"><SmartProBottle /></div>
          <div className="smart-pro-bubble smart-pro-bubble-a" />
          <div className="smart-pro-bubble smart-pro-bubble-b" />
          <div className="smart-pro-bubble smart-pro-bubble-c" />
        </div>
      </section>
      <div className="smart-pro-footer">
        <span>90 SECOND SALE WINDOW</span>
        <span className="smart-pro-footer-divider" />
        <span>SMARTPRO STAYS FULL PRICE</span>
      </div>
      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #030907; }
        .smart-pro-frame {
          min-height: 100vh;
          padding: 38px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          color: #f5fff0;
          background:
            radial-gradient(circle at 68% 45%, rgba(107, 190, 51, .16), transparent 27%),
            radial-gradient(circle at 20% 10%, rgba(23, 91, 155, .15), transparent 31%),
            linear-gradient(145deg, #020605 0%, #061a12 56%, #03100c 100%);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          overflow: hidden;
        }
        .smart-pro-kicker {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #b9ff45;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .18em;
          margin: 0 auto 20px;
          max-width: 1040px;
          width: 100%;
        }
        .smart-pro-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #b9ff45; box-shadow: 0 0 14px #b9ff45; }
        .smart-pro-card {
          width: 100%;
          max-width: 1040px;
          margin: 0 auto;
          min-height: 640px;
          display: grid;
          grid-template-columns: .9fr 1.1fr;
          border: 1px solid rgba(185,255,69,.3);
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(9,44,60,.72), rgba(5,28,20,.84));
          box-shadow: 0 26px 90px rgba(0,0,0,.46), inset 0 1px 0 rgba(245,255,240,.08);
          overflow: hidden;
        }
        .smart-pro-copy { padding: 76px 42px 50px 58px; display: flex; flex-direction: column; justify-content: center; position: relative; z-index: 2; }
        .smart-pro-eyebrow { color: #b9ff45; font-size: 12px; font-weight: 800; letter-spacing: .24em; margin: 0 0 18px; }
        h1 { font-size: clamp(38px, 5vw, 66px); line-height: .96; letter-spacing: -.055em; margin: 0; font-weight: 800; }
        .smart-pro-description { color: #b9cdbd; font-size: 16px; line-height: 1.55; max-width: 330px; margin: 26px 0 34px; }
        .smart-pro-meta { display: flex; flex-direction: column; gap: 10px; color: #f5fff0; font-size: 10px; font-weight: 800; letter-spacing: .13em; }
        .smart-pro-meta span { border-left: 2px solid #b9ff45; padding-left: 12px; }
        .smart-pro-stage { min-height: 640px; position: relative; display: grid; place-items: center; }
        .smart-pro-halo { position: absolute; width: 440px; height: 440px; border-radius: 50%; border: 1px solid rgba(185,255,69,.28); background: radial-gradient(circle, rgba(185,255,69,.14), transparent 65%); box-shadow: 0 0 70px rgba(167,245,43,.18); animation: smart-pulse 3.2s ease-in-out infinite; }
        .smart-pro-bottle { position: relative; z-index: 2; filter: drop-shadow(0 24px 24px rgba(0,0,0,.55)); animation: smart-float 4.6s ease-in-out infinite; transform-origin: 50% 90%; }
        .smart-pro-bottle svg { display: block; width: min(260px, 52vw); height: auto; }
        .smart-pro-bubble { position: absolute; border: 1px solid rgba(230,255,198,.75); background: rgba(185,255,69,.24); border-radius: 50%; box-shadow: 0 0 18px rgba(185,255,69,.5); animation: smart-rise 3.4s ease-in-out infinite; }
        .smart-pro-bubble-a { width: 16px; height: 16px; left: 19%; top: 62%; }
        .smart-pro-bubble-b { width: 10px; height: 10px; right: 20%; top: 31%; animation-delay: .8s; }
        .smart-pro-bubble-c { width: 7px; height: 7px; right: 16%; top: 56%; animation-delay: 1.5s; }
        .smart-pro-spark { position: absolute; z-index: 3; color: #efffdc; text-shadow: 0 0 15px #b9ff45; font-size: 26px; animation: smart-spark 2.8s ease-in-out infinite; }
        .smart-pro-spark-a { top: 22%; right: 21%; }
        .smart-pro-spark-b { bottom: 25%; left: 17%; animation-delay: 1.1s; color: #4fa0de; }
        .smart-pro-footer { display: flex; justify-content: center; align-items: center; gap: 14px; color: #86a991; font-size: 9px; font-weight: 800; letter-spacing: .15em; margin: 20px auto 0; }
        .smart-pro-footer-divider { width: 4px; height: 4px; background: #b9ff45; border-radius: 50%; }
        @keyframes smart-float { 0%,100% { transform: translateY(7px) rotate(-1deg); } 50% { transform: translateY(-9px) rotate(1deg); } }
        @keyframes smart-pulse { 0%,100% { transform: scale(.96); opacity: .7; } 50% { transform: scale(1.04); opacity: 1; } }
        @keyframes smart-rise { 0%,100% { transform: translateY(10px) scale(.85); opacity: .15; } 50% { transform: translateY(-20px) scale(1); opacity: .9; } }
        @keyframes smart-spark { 0%,100% { transform: scale(.8) rotate(-8deg); opacity: .35; } 50% { transform: scale(1.15) rotate(8deg); opacity: 1; } }
        @media (max-width: 720px) {
          .smart-pro-frame { padding: 20px; }
          .smart-pro-card { grid-template-columns: 1fr; }
          .smart-pro-copy { padding: 34px 28px 12px; }
          .smart-pro-stage { min-height: 500px; }
          .smart-pro-halo { width: 330px; height: 330px; }
          .smart-pro-footer { text-align: center; line-height: 1.5; }
        }
        @media (prefers-reduced-motion: reduce) {
          .smart-pro-halo, .smart-pro-bottle, .smart-pro-bubble, .smart-pro-spark { animation: none; }
        }
      `}</style>
    </main>
  );
}