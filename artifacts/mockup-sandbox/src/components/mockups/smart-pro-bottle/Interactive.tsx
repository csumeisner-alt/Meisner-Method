import React, { useEffect, useState } from "react";

function SmartProBottle({ active }: { active: boolean }) {
  const prefix = "smart-pro-interactive";
  return (
    <svg
      width="260"
      height="510"
      viewBox="0 0 260 510"
      role="img"
      aria-label="SmartPro Soda glowing lime-green bottle"
      className={active ? "smart-pro-art smart-pro-art-active" : "smart-pro-art"}
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
      </defs>
      <path
        d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z"
        fill={`url(#${prefix}-glass)`}
        stroke="#bcebcf"
        strokeOpacity="0.86"
        strokeWidth="3"
      />
      <path
        d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z"
        fill="#071c17"
        fillOpacity="0.34"
      />
      <path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill={`url(#${prefix}-liquid)`} fillOpacity="0.97" />
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
        <path d="M98 106h64v39H98Z" fill="#092c3c" stroke="#54c28d" strokeOpacity="0.9" strokeWidth="1.5" />
        <path d="M102 110h56v31h-56Z" fill="#2e7b49" fillOpacity="0.44" stroke="#f7fff0" strokeOpacity="0.2" />
        <text x="130" y="133" fill="#f7fff0" fontSize="23" fontWeight="900" textAnchor="middle">S</text>
      </g>
      <g>
        <rect x="73" y="264" width="114" height="116" rx="3" fill="#050708" fillOpacity="0.97" stroke="#67ce9e" strokeWidth="2.5" />
        <path d="M83 274h94v96H83Z" fill="none" stroke="#314d42" strokeWidth="1" />
        <text x="130" y="339" fill="#d7e0db" fontSize="48" fontWeight="900" textAnchor="middle" letterSpacing="-3">SP</text>
        <path d="M94 351h72" stroke="#67ce9e" strokeWidth="2" strokeLinecap="round" />
        <text x="130" y="365" fill="#67ce9e" fontSize="7" fontWeight="900" textAnchor="middle" letterSpacing="2.2">SMARTPRO</text>
      </g>
      <g>
        <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill={`url(#${prefix}-cap)`} stroke="#b9e7ff" strokeOpacity="0.86" strokeWidth="2" />
        <path d="M101 34h58" stroke="#e8f6ff" strokeOpacity="0.34" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

type Stage = "locked" | "unlocked" | "active" | "expired";

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

export function Interactive() {
  const [stage, setStage] = useState<Stage>("locked");
  const [tokens, setTokens] = useState(140);
  const [bottles, setBottles] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [animationMode, setAnimationMode] = useState<"idle" | "redeem" | "creative">("idle");

  const triggerHaptic = (pattern: number | number[]) => {
    const reducedMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  };

  useEffect(() => {
    if (stage !== "active") return;
    setSecondsLeft(90);
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setStage("expired");
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const unlock = () => {
    if (stage !== "locked" || tokens < 100) return;
    setTokens((value) => value - 100);
    setStage("unlocked");
  };

  const buyBottle = () => {
    if (stage === "locked" || tokens < 3) return;
    setTokens((value) => value - 3);
    setBottles((value) => value + 1);
    if (stage === "expired") {
      setStage("unlocked");
      setAnimationMode("idle");
    }
  };

  const redeem = () => {
    if (stage !== "unlocked" || bottles < 1) return;
    setBottles((value) => value - 1);
    setStage("active");
    setSecondsLeft(90);
    setAnimationMode("redeem");
    setAnimationKey((value) => value + 1);
    triggerHaptic([28, 48, 90]);
  };

  const playCreativeAnimation = () => {
    if (stage === "locked") return;
    setAnimationMode("creative");
    setAnimationKey((value) => value + 1);
    triggerHaptic([18, 30, 18]);
  };

  const handleBottleTap = () => {
    playCreativeAnimation();
  };

  const reset = () => {
    setStage("locked");
    setTokens(140);
    setBottles(0);
    setSecondsLeft(90);
    setAnimationMode("idle");
    setAnimationKey((value) => value + 1);
  };

  const stageLabel = stage === "locked"
    ? "RECIPE LOCKED"
    : stage === "unlocked"
      ? "READY TO REDEEM"
      : stage === "active"
        ? `SALE ACTIVE · ${formatCountdown(secondsLeft)}`
        : "SALE EXPIRED · RESET TO REPLAY";
  const actionLabel = stage === "locked"
    ? "UNLOCK RECIPE · 100 TOKENS"
    : stage === "unlocked" && bottles > 0
      ? "REDEEM BOTTLE · OPEN SALE"
      : "BUY SMARTPRO BOTTLE · 3 TOKENS";
  const canTapBottle = stage !== "locked";
  const tapLabel = stage === "unlocked" && bottles > 0
    ? "TAP TO REDEEM"
    : stage === "active"
      ? "TAP TO REPLAY"
      : "TAP TO PREVIEW";

  return (
    <main className="smart-pro-interactive-frame">
      <header className="smart-pro-interactive-header">
        <img src="/__mockup/images/smartpro-financial-logo.png" alt="SmartPro Financial" />
        <div className="smart-pro-header-tag">CENTRAL BANK / INTERACTIVE PROTOTYPE</div>
      </header>
      <section className={`smart-pro-interactive-card smart-pro-state-${stage}`}>
        <div className="smart-pro-interactive-copy">
          <p className="smart-pro-interactive-eyebrow">SMARTPRO SODA</p>
          <h1>Tap into<br /><em>the edge.</em></h1>
          <p className="smart-pro-interactive-description">
             Unlock the recipe, buy a bottle, then use the green action button to open the flash-sale window.
          </p>
          <div className="smart-pro-step-list">
            <div className={stage === "locked" ? "smart-pro-step is-current" : "smart-pro-step is-done"}><b>01</b><span>UNLOCK THE RECIPE</span></div>
            <div className={stage === "unlocked" ? "smart-pro-step is-current" : stage === "active" ? "smart-pro-step is-done" : "smart-pro-step"}><b>02</b><span>BUY A BOTTLE</span></div>
            <div className={stage === "active" ? "smart-pro-step is-current" : "smart-pro-step"}><b>03</b><span>REDEEM THE SALE</span></div>
          </div>
          <div className="smart-pro-wallet">
            <span>TEST WALLET</span>
            <strong>{tokens} TOKENS</strong>
            <span>{bottles} BOTTLE{bottles === 1 ? "" : "S"}</span>
          </div>
           {stage === "active" && (
             <div className="smart-pro-sale-panel" aria-label="Active sale shop">
               <div className="smart-pro-sale-panel-heading">
                 <span>LIVE SHOP</span>
                 <strong>{formatCountdown(secondsLeft)}</strong>
               </div>
               <div className="smart-pro-sale-row"><span>QUICK REVIVE · BOTTLE</span><b>½ PRICE</b></div>
               <div className="smart-pro-sale-row"><span>DAIQUIRI · BOTTLE</span><b>½ PRICE</b></div>
               <div className="smart-pro-sale-row is-full"><span>SMARTPRO · BOTTLE</span><b>3 TOKENS</b></div>
               <div className="smart-pro-sale-row"><span>STAMIN UP · BOTTLE</span><b>½ PRICE</b></div>
             </div>
           )}
        </div>
        <div className="smart-pro-interactive-stage">
          <div className="smart-pro-stage-status">{stageLabel}</div>
           {stage === "active" && (
             <div className="smart-pro-countdown" aria-live="polite">
               <strong>{formatCountdown(secondsLeft)}</strong>
               <span>LEFT IN FLASH SALE</span>
               <div className="smart-pro-countdown-track"><i style={{ width: `${(secondsLeft / 90) * 100}%` }} /></div>
             </div>
           )}
           <div className={`smart-pro-interactive-halo ${stage === "active" || animationMode === "creative" ? "is-active" : ""}`} key={`halo-${animationKey}`} />
           <div className={`smart-pro-interactive-bubbles ${stage === "active" || animationMode === "creative" ? "is-bursting" : ""}`} key={`bubbles-${animationKey}`}>
            <i /><i /><i /><i /><i /><i />
          </div>
          <button
            type="button"
             className={`smart-pro-bottle-button ${canTapBottle ? "is-tappable" : ""}`}
             onClick={handleBottleTap}
             aria-label={stage === "unlocked" && bottles > 0 ? "Tap to redeem SmartPro bottle" : stage === "locked" ? "SmartPro bottle preview" : "Tap to replay SmartPro bottle animation"}
          >
             {canTapBottle && <span className="smart-pro-tap-ring" aria-hidden="true" />}
             <span className={`smart-pro-bottle-art ${animationMode === "redeem" ? "is-redeemed" : ""} ${animationMode === "creative" ? "is-creative" : ""}`} key={`bottle-art-${animationKey}`}>
               <SmartProBottle active={stage === "active"} />
             </span>
             {canTapBottle && <span className="smart-pro-tap-hint">{tapLabel === "TAP TO REDEEM" ? "TAP TO PREVIEW" : tapLabel}</span>}
          </button>
          {stage === "active" && (
             <div className="smart-pro-sale-burst" role="status" aria-live="polite" key={`burst-${animationKey}`}>
               <span>{animationMode === "redeem" ? "SALE ACTIVATED" : "SMARTPRO LIVE"}</span>
               <strong>{animationMode === "redeem" ? "½ PRICE" : "EDGE TAP"}</strong>
            </div>
          )}
           {animationMode === "creative" && (
             <div className="smart-pro-creative-flare" role="status" aria-live="polite" key={`creative-flare-${animationKey}`}>
               <span>SMARTPRO</span>
               <strong>EDGE TAP</strong>
             </div>
           )}
          <div className="smart-pro-stage-note">
             {stage === "locked"
               ? "The bottle stays quiet until the recipe is unlocked."
               : stage === "unlocked" && bottles === 0
                 ? "Buy a bottle below, then use the green button to redeem."
                 : stage === "unlocked"
                   ? "Tap the bottle to preview the animation; redeem with the green button."
                   : stage === "active"
                     ? "Other bottles are half price until the timer runs out; recipe unlocks stay full price."
                     : "The flash-sale window has closed. Buy another bottle to run the test again."}
          </div>
        </div>
      </section>
      <div className="smart-pro-interactive-controls">
        <button type="button" className="smart-pro-primary-control" onClick={stage === "locked" ? unlock : stage === "unlocked" && bottles > 0 ? redeem : buyBottle}>{actionLabel}</button>
        <button type="button" className="smart-pro-secondary-control" onClick={reset}>RESET TEST</button>
      </div>
      <p className="smart-pro-interactive-legal">CANVAS TEST STATE · NO REAL TOKENS OR PURCHASES · SMARTPRO ITSELF REMAINS 3 TOKENS</p>
      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #090b0c; }
        button { font: inherit; }
        .smart-pro-interactive-frame {
          min-height: 100vh; padding: 34px 38px 28px; color: #f3f6f3;
          background: radial-gradient(circle at 73% 46%, rgba(79,198,150,.12), transparent 28%), linear-gradient(145deg, #090b0c, #111718 62%, #0b1110);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif; overflow: hidden;
        }
        .smart-pro-interactive-header { width: 100%; max-width: 1040px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
        .smart-pro-interactive-header img { width: min(270px, 44vw); height: auto; display: block; mix-blend-mode: screen; }
        .smart-pro-header-tag { color: #67ce9e; border: 1px solid rgba(103,206,158,.34); border-radius: 999px; padding: 8px 12px; font-size: 9px; font-weight: 800; letter-spacing: .14em; white-space: nowrap; }
        .smart-pro-interactive-card { width: 100%; max-width: 1040px; min-height: 640px; margin: 0 auto; display: grid; grid-template-columns: .83fr 1.17fr; border: 1px solid rgba(103,206,158,.32); border-radius: 24px; overflow: hidden; background: linear-gradient(120deg, rgba(39,44,44,.92), rgba(8,40,30,.86)); box-shadow: 0 28px 90px rgba(0,0,0,.48), inset 0 1px rgba(255,255,255,.1); transition: border-color .35s, background .35s; }
        .smart-pro-state-active { border-color: rgba(103,206,158,.78); background: linear-gradient(120deg, rgba(47,54,53,.96), rgba(10,58,40,.94)); }
        .smart-pro-interactive-copy { padding: 62px 30px 42px 56px; display: flex; flex-direction: column; justify-content: center; position: relative; z-index: 4; }
        .smart-pro-interactive-eyebrow { margin: 0 0 14px; color: #67ce9e; font-size: 11px; font-weight: 900; letter-spacing: .24em; }
        h1 { margin: 0; font-size: clamp(42px, 5.7vw, 74px); line-height: .92; letter-spacing: -.065em; font-weight: 850; }
        h1 em { color: #67ce9e; font-style: normal; }
        .smart-pro-interactive-description { max-width: 330px; color: #bac9c1; font-size: 15px; line-height: 1.55; margin: 22px 0 28px; }
        .smart-pro-step-list { display: flex; flex-direction: column; gap: 10px; }
        .smart-pro-step { display: flex; gap: 12px; align-items: center; color: #71817a; font-size: 10px; font-weight: 800; letter-spacing: .1em; transition: color .2s; }
        .smart-pro-step b { width: 23px; height: 23px; border: 1px solid #35423d; border-radius: 50%; display: grid; place-items: center; font-size: 8px; }
        .smart-pro-step.is-current { color: #f3f6f3; }
        .smart-pro-step.is-current b { color: #17211e; background: #67ce9e; border-color: #67ce9e; }
        .smart-pro-step.is-done { color: #67ce9e; }
        .smart-pro-step.is-done b { color: #67ce9e; border-color: #67ce9e; }
        .smart-pro-wallet { display: flex; align-items: baseline; flex-wrap: wrap; gap: 9px 14px; margin-top: 34px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.12); color: #799087; font-size: 9px; font-weight: 800; letter-spacing: .13em; }
        .smart-pro-wallet strong { color: #f3f6f3; }
        .smart-pro-wallet span:last-child { color: #67ce9e; }
         .smart-pro-sale-panel { margin-top: 22px; max-width: 330px; padding: 13px 14px 11px; border: 1px solid rgba(103,206,158,.34); border-radius: 12px; background: rgba(5,19,15,.46); box-shadow: inset 0 1px rgba(255,255,255,.06); }
         .smart-pro-sale-panel-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: #67ce9e; font-size: 9px; font-weight: 900; letter-spacing: .16em; }
         .smart-pro-sale-panel-heading strong { color: #efffdc; font-size: 18px; letter-spacing: -.04em; }
         .smart-pro-sale-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 7px 0; border-top: 1px solid rgba(255,255,255,.08); color: #b7c9bf; font-size: 8px; font-weight: 800; letter-spacing: .08em; }
         .smart-pro-sale-row b { color: #b9ff45; font-size: 9px; white-space: nowrap; }
         .smart-pro-sale-row.is-full b { color: #d7e0db; }
        .smart-pro-interactive-stage { min-height: 640px; position: relative; display: grid; place-items: center; }
        .smart-pro-stage-status { position: absolute; top: 34px; right: 42px; z-index: 5; color: #67ce9e; font-size: 10px; font-weight: 900; letter-spacing: .13em; }
         .smart-pro-countdown { position: absolute; top: 65px; right: 42px; z-index: 5; width: 142px; display: flex; flex-direction: column; gap: 5px; text-align: right; }
         .smart-pro-countdown strong { color: #efffdc; font-size: 28px; line-height: .9; letter-spacing: -.06em; }
         .smart-pro-countdown span { color: #8fa299; font-size: 7px; font-weight: 900; letter-spacing: .14em; }
         .smart-pro-countdown-track { width: 100%; height: 3px; overflow: hidden; border-radius: 999px; background: rgba(103,206,158,.18); }
         .smart-pro-countdown-track i { display: block; height: 100%; border-radius: inherit; background: #b9ff45; box-shadow: 0 0 10px rgba(185,255,69,.8); transition: width 1s linear; }
        .smart-pro-interactive-halo { position: absolute; width: 430px; height: 430px; border-radius: 50%; border: 1px solid rgba(103,206,158,.27); background: radial-gradient(circle, rgba(103,206,158,.13), transparent 67%); box-shadow: 0 0 80px rgba(103,206,158,.14); animation: smart-idle-pulse 3.3s ease-in-out infinite; transition: transform .35s, border-color .35s; }
        .smart-pro-interactive-halo.is-active { border-color: rgba(185,255,69,.72); background: radial-gradient(circle, rgba(185,255,69,.2), transparent 64%); box-shadow: 0 0 100px rgba(185,255,69,.32); animation: smart-active-pulse .9s ease-in-out 3; }
        .smart-pro-bottle-button { appearance: none; border: 0; padding: 0; margin: 0; position: relative; z-index: 3; background: transparent; color: inherit; cursor: default; filter: drop-shadow(0 26px 25px rgba(0,0,0,.58)); }
         .smart-pro-bottle-button.is-tappable { cursor: pointer; animation: smart-tap-float 2.3s ease-in-out infinite; }
        .smart-pro-bottle-button.is-tappable:hover { filter: drop-shadow(0 26px 30px rgba(103,206,158,.35)); }
         .smart-pro-tap-ring { position: absolute; z-index: -1; inset: 20px -22px; border: 1px solid rgba(185,255,69,.65); border-radius: 50%; box-shadow: 0 0 0 8px rgba(103,206,158,.06), 0 0 30px rgba(185,255,69,.18); animation: smart-tap-ring 1.7s ease-out infinite; pointer-events: none; }
         .smart-pro-bottle-art { display: block; position: relative; z-index: 2; }
         .smart-pro-bottle-art.is-redeemed { animation: smart-redeem-bottle 1.5s cubic-bezier(.18,.82,.31,1) both; }
         .smart-pro-bottle-art.is-creative { animation: smart-creative-bottle 1.35s cubic-bezier(.16,.82,.3,1) both; }
         .smart-pro-art { display: block; width: min(260px, 29vw); height: auto; transition: filter .3s; }
        .smart-pro-art-active { filter: drop-shadow(0 0 24px rgba(185,255,69,.8)); }
        .smart-pro-tap-hint { position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); color: #67ce9e; font-size: 9px; font-weight: 900; letter-spacing: .18em; white-space: nowrap; animation: smart-hint 1.4s ease-in-out infinite; }
        .smart-pro-interactive-bubbles { position: absolute; width: 400px; height: 510px; pointer-events: none; }
        .smart-pro-interactive-bubbles i { position: absolute; display: block; width: 10px; height: 10px; border: 1px solid rgba(185,255,69,.72); border-radius: 50%; background: rgba(103,206,158,.2); opacity: .5; }
        .smart-pro-interactive-bubbles i:nth-child(1) { left: 18%; top: 63%; width: 18px; height: 18px; }
        .smart-pro-interactive-bubbles i:nth-child(2) { left: 27%; top: 42%; width: 8px; height: 8px; }
        .smart-pro-interactive-bubbles i:nth-child(3) { right: 19%; top: 57%; width: 14px; height: 14px; }
        .smart-pro-interactive-bubbles i:nth-child(4) { right: 28%; top: 29%; width: 7px; height: 7px; }
        .smart-pro-interactive-bubbles i:nth-child(5) { left: 48%; top: 23%; width: 6px; height: 6px; }
        .smart-pro-interactive-bubbles i:nth-child(6) { right: 13%; top: 70%; width: 5px; height: 5px; }
        .smart-pro-interactive-bubbles.is-bursting i { animation: smart-bubble-burst 1.25s cubic-bezier(.2,.9,.3,1) both; }
        .smart-pro-interactive-bubbles.is-bursting i:nth-child(2) { animation-delay: .08s; }
        .smart-pro-interactive-bubbles.is-bursting i:nth-child(3) { animation-delay: .14s; }
        .smart-pro-interactive-bubbles.is-bursting i:nth-child(4) { animation-delay: .2s; }
        .smart-pro-interactive-bubbles.is-bursting i:nth-child(5) { animation-delay: .26s; }
        .smart-pro-interactive-bubbles.is-bursting i:nth-child(6) { animation-delay: .32s; }
        .smart-pro-sale-burst { position: absolute; z-index: 6; top: 40%; left: 50%; display: flex; flex-direction: column; align-items: center; color: #f1ffd9; text-shadow: 0 0 18px #b9ff45; transform: translate(-50%, -50%); animation: smart-sale-burst 1.6s cubic-bezier(.15,.8,.3,1) both; pointer-events: none; }
        .smart-pro-sale-burst span { font-size: 12px; font-weight: 900; letter-spacing: .22em; }
        .smart-pro-sale-burst strong { color: #b9ff45; font-size: 46px; line-height: .95; letter-spacing: -.08em; }
         .smart-pro-creative-flare { position: absolute; z-index: 7; top: 46%; left: 50%; display: flex; flex-direction: column; align-items: center; color: #efffdc; text-shadow: 0 0 18px rgba(185,255,69,.92); transform: translate(-50%, -50%); animation: smart-creative-flare 1.35s cubic-bezier(.15,.8,.3,1) both; pointer-events: none; }
         .smart-pro-creative-flare::before { content: ""; position: absolute; width: 210px; height: 210px; border: 1px solid rgba(185,255,69,.68); border-radius: 50%; box-shadow: 0 0 34px rgba(185,255,69,.32), inset 0 0 24px rgba(103,206,158,.2); animation: smart-creative-orbit 1.35s ease-out both; }
         .smart-pro-creative-flare span { position: relative; font-size: 10px; font-weight: 900; letter-spacing: .3em; }
         .smart-pro-creative-flare strong { position: relative; color: #b9ff45; font-size: 40px; line-height: .95; letter-spacing: -.08em; }
        .smart-pro-stage-note { position: absolute; bottom: 32px; left: 42px; right: 42px; color: #8fa299; text-align: center; font-size: 11px; line-height: 1.4; }
        .smart-pro-interactive-controls { max-width: 1040px; margin: 18px auto 0; display: flex; gap: 10px; }
        .smart-pro-primary-control, .smart-pro-secondary-control { min-height: 44px; border-radius: 10px; padding: 0 17px; border: 1px solid #67ce9e; font-size: 10px; font-weight: 900; letter-spacing: .12em; cursor: pointer; }
        .smart-pro-primary-control { flex: 1; color: #12241c; background: #67ce9e; }
        .smart-pro-primary-control:hover { background: #a3e6c1; }
        .smart-pro-secondary-control { color: #b7c9bf; background: #1e2524; border-color: #3e5148; }
        .smart-pro-interactive-legal { max-width: 1040px; margin: 16px auto 0; color: #64756c; text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .14em; }
        @keyframes smart-idle-pulse { 0%,100% { transform: scale(.97); opacity: .7; } 50% { transform: scale(1.03); opacity: 1; } }
        @keyframes smart-active-pulse { 0%,100% { transform: scale(.88); opacity: .45; } 50% { transform: scale(1.1); opacity: 1; } }
        @keyframes smart-tap-float { 0%,100% { transform: translateY(5px) rotate(-1deg); } 50% { transform: translateY(-7px) rotate(1deg); } }
        @keyframes smart-redeem-bottle { 0% { transform: scale(1) translateY(0) rotate(0); } 24% { transform: scale(1.12) translateY(-10px) rotate(-4deg); } 100% { transform: scale(.72) translateY(24px) rotate(7deg); opacity: .22; } }
        @keyframes smart-bubble-burst { 0% { transform: translate(0,0) scale(.6); opacity: .2; } 45% { opacity: 1; } 100% { transform: translate(var(--smart-x, 20px), -115px) scale(1.55); opacity: 0; } }
        @keyframes smart-sale-burst { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.55); } 26% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); } 100% { opacity: 0; transform: translate(-50%, -80%) scale(1); } }
        @keyframes smart-hint { 0%,100% { opacity: .55; transform: translate(-50%, 0); } 50% { opacity: 1; transform: translate(-50%, -4px); } }
         @keyframes smart-tap-ring { 0% { transform: scale(.82); opacity: .15; } 45% { opacity: .9; } 100% { transform: scale(1.08); opacity: 0; } }
         @keyframes smart-creative-bottle { 0% { transform: scale(1) translateY(0) rotate(0); filter: drop-shadow(0 26px 25px rgba(0,0,0,.58)); } 22% { transform: scale(1.08) translateY(-16px) rotate(-3deg); filter: drop-shadow(0 0 32px rgba(185,255,69,.86)); } 58% { transform: scale(.96) translateY(4px) rotate(3deg); filter: drop-shadow(0 0 52px rgba(103,206,158,.76)); } 100% { transform: scale(1) translateY(0) rotate(0); filter: drop-shadow(0 26px 25px rgba(0,0,0,.58)); } }
         @keyframes smart-creative-flare { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3); } 28% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); } 100% { opacity: 0; transform: translate(-50%, -68%) scale(1.18); } }
         @keyframes smart-creative-orbit { 0% { transform: scale(.4) rotate(-22deg); opacity: 0; } 35% { opacity: 1; } 100% { transform: scale(1.2) rotate(28deg); opacity: 0; } }
        @media (max-width: 720px) {
          .smart-pro-interactive-frame { padding: 20px; }
          .smart-pro-interactive-header { align-items: flex-start; flex-direction: column; }
          .smart-pro-interactive-header img { width: 250px; }
          .smart-pro-interactive-card { grid-template-columns: 1fr; }
          .smart-pro-interactive-copy { padding: 34px 28px 8px; }
          .smart-pro-interactive-stage { min-height: 540px; }
          .smart-pro-stage-status { top: 22px; right: 24px; }
           .smart-pro-countdown { top: 52px; right: 24px; }
          .smart-pro-interactive-halo { width: 340px; height: 340px; }
           .smart-pro-sale-panel { max-width: none; }
          .smart-pro-interactive-controls { flex-direction: column; }
          .smart-pro-stage-note { bottom: 25px; left: 24px; right: 24px; }
        }
        @media (prefers-reduced-motion: reduce) {
           .smart-pro-interactive-halo, .smart-pro-bottle-button, .smart-pro-tap-ring, .smart-pro-tap-hint, .smart-pro-bottle-art, .smart-pro-interactive-bubbles.is-bursting i, .smart-pro-sale-burst, .smart-pro-creative-flare, .smart-pro-creative-flare::before { animation: none; }
        }
      `}</style>
    </main>
  );
}