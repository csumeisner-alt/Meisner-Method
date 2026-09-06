import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Droplets,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  UnlockKeyhole,
  Zap,
} from "lucide-react";

type DrinkKind = "daiquiri" | "smartPro";
type DrinkStage = "locked" | "unlocked" | "armed";

type DrinkState = {
  stage: DrinkStage;
  bottles: number;
  pulse: number;
  animation: "idle" | "edge" | "surge";
};

const INITIAL_TOKENS = 220;

const drinkCopy = {
  daiquiri: {
    name: "DAVE RAMSEY DAIQUIRI",
    shortName: "Daiquiri",
    accent: "#8edbff",
    accentStrong: "#d9f6ff",
    accentDark: "#123d69",
    unlockPrice: 100,
    bottlePrice: 8,
    description:
      "Crack one into the machine before a toss: 45% win odds, 55% loss odds, and a double award if it pays.",
    detail: "45% WIN · 55% LOSS · DOUBLE AWARD",
    lockedDetail: "RECIPE LOCKED · 100 TOKENS",
    unlockedDetail: "8 TOKENS / BOTTLE · 01 BOTTLE",
    armedDetail: "NEXT TOSS ONLY · 2× WINNING AWARD",
  },
  smartPro: {
    name: "SMARTPRO SODA",
    shortName: "SmartPro",
    accent: "#b9ff45",
    accentStrong: "#efffdc",
    accentDark: "#1e5b9b",
    unlockPrice: 100,
    bottlePrice: 3,
    description:
      "One bottle opens a 90-second window where every other bottle is half price. Recipe unlocks stay full price.",
    detail: "90 SEC · OTHER BOTTLES ½ PRICE",
    lockedDetail: "RECIPE LOCKED · 100 TOKENS",
    unlockedDetail: "3 TOKENS / BOTTLE · 01 BOTTLE",
    armedDetail: "SALE ACTIVE · 90 SECOND WINDOW",
  },
} as const;

function DaiquiriBottle({ muted = false }: { muted?: boolean }) {
  const prefix = `canvas-daiquiri-${muted ? "muted" : "live"}`;
  const glass = muted ? "#5c6b78" : "#b9eaff";
  const glassDeep = muted ? "#273b4b" : "#08192f";
  const yellow = muted ? "#6e6940" : "#f6d64a";
  const yellowBright = muted ? "#8b7944" : "#ffe979";
  const blue = muted ? "#304b60" : "#123d69";
  const cap = muted ? "#273442" : "#061429";
  return (
    <svg width="210" height="412" viewBox="0 0 260 510" role="img" aria-label="Dave Ramsey Daiquiri bottle">
      <defs>
        <linearGradient id={`${prefix}-glass`} x1="0" x2="1">
          <stop stopColor={glassDeep} />
          <stop offset=".22" stopColor="#234f75" />
          <stop offset=".5" stopColor={glassDeep} />
          <stop offset=".78" stopColor="#0b2948" />
          <stop offset="1" stopColor="#547991" />
        </linearGradient>
        <linearGradient id={`${prefix}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={yellowBright} />
          <stop offset=".28" stopColor={yellow} />
          <stop offset=".72" stopColor="#c58b25" />
          <stop offset="1" stopColor="#ffe878" />
        </linearGradient>
        <clipPath id={`${prefix}-liquid-clip`}>
          <path d="M70 202h120v246c0 25-24 42-60 42s-60-17-60-42V202Z" />
        </clipPath>
        <clipPath id={`${prefix}-portrait-clip`}><circle cx="130" cy="322" r="51" /></clipPath>
      </defs>
      <path d="M83 30h94v43l19 31v320c0 50-28 73-66 73s-66-23-66-73V104l19-31V30Z" fill={`url(#${prefix}-glass)`} stroke={glass} strokeOpacity={muted ? .45 : .78} strokeWidth="3" />
      <path d="M93 35h74v43l17 30v314c0 39-20 58-54 58s-54-19-54-58V108l17-30V35Z" fill="#06182d" fillOpacity={muted ? .62 : .28} />
      <path d="M70 202h120v246c0 25-24 42-60 42s-60-17-60-42V202Z" fill={`url(#${prefix}-liquid)`} opacity={muted ? .46 : .95} clipPath={`url(#${prefix}-liquid-clip)`} />
      <g clipPath={`url(#${prefix}-liquid-clip)`}>
        <path d="M53 238c33-21 75 10 154-17v225H53Z" fill="#ffec7d" fillOpacity={muted ? .1 : .3} />
        {[[88, 357, 4], [109, 296, 3], [127, 386, 4], [147, 332, 3], [166, 374, 5], [101, 414, 2.5], [151, 421, 3], [119, 249, 2.5], [138, 282, 2.2]].map(([cx, cy, r], index) => (
          <circle key={index} cx={cx} cy={cy} r={r} fill="#fff4a1" fillOpacity={muted ? .22 : .78} />
        ))}
      </g>
      <g opacity={muted ? .52 : 1}>
        <path d="M99 106h62v39H99Z" fill="#0c3158" stroke="#9bd6ee" strokeOpacity=".7" strokeWidth="1.5" />
        <circle cx="130" cy="125.5" r="13" fill="#f0c75e" fillOpacity=".42" stroke="#f6da86" strokeWidth="1.5" />
        <text x="130" y="132" textAnchor="middle" fill="#09284a" fontSize="18" fontWeight="700">R</text>
      </g>
      <g opacity={muted ? .48 : 1}>
        <circle cx="130" cy="322" r="80" fill={`url(#${prefix}-liquid)`} stroke="#fff0a0" strokeWidth="2" />
        <circle cx="130" cy="322" r="72" fill="#08264a" stroke="#163f69" strokeWidth="3" />
        <image href="/__mockup/images/dave-ramsey-portrait.png" x="79" y="271" width="102" height="102" clipPath={`url(#${prefix}-portrait-clip)`} preserveAspectRatio="xMidYMid slice" />
        <rect x="77" y="251" width="106" height="27" rx="13.5" fill={yellowBright} stroke="#fff0a0" strokeWidth="1" />
        <text x="130" y="269" textAnchor="middle" fill="#08264a" fontSize="12" fontWeight="700" letterSpacing=".8">DAVE RAMSEY</text>
        <rect x="73" y="366" width="114" height="31" rx="15.5" fill={yellowBright} stroke="#fff0a0" strokeWidth="1" />
        <text x="130" y="388" textAnchor="middle" fill="#08264a" fontSize="18" fontWeight="700" fontStyle="italic">Daiquiri</text>
      </g>
      <path d="M99 46c-12 36-7 80-7 122v221c0 45 11 70 21 78" fill="none" stroke="#dff8ff" strokeOpacity={muted ? .24 : .7} strokeWidth="5" strokeLinecap="round" />
      <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill={cap} stroke="#fff0a0" strokeOpacity={muted ? .32 : .9} strokeWidth="2" />
      <circle cx="130" cy="38" r="10" fill={muted ? "#8c6e2d" : "#e4b843"} stroke={muted ? "#25394b" : "#0a2242"} strokeWidth="1.5" />
      <text x="130" y="44" textAnchor="middle" fill={muted ? "#25394b" : "#0a2242"} fontSize="13" fontWeight="700">R</text>
    </svg>
  );
}

function SmartProBottle({ muted = false }: { muted?: boolean }) {
  const prefix = `canvas-smartpro-${muted ? "muted" : "live"}`;
  const glass = muted ? "#718878" : "#ddffd0";
  const glassDeep = muted ? "#183426" : "#071c17";
  const liquid = muted ? "#567b35" : "#a8f52b";
  const green = muted ? "#668c43" : "#b9ff45";
  return (
    <svg width="210" height="412" viewBox="0 0 260 510" role="img" aria-label="SmartPro Soda bottle">
      <defs>
        <linearGradient id={`${prefix}-glass`} x1="0" x2="1">
          <stop stopColor={glassDeep} />
          <stop offset=".2" stopColor={muted ? "#315542" : "#2c7d45"} />
          <stop offset=".46" stopColor={muted ? "#163525" : "#0c3a2b"} />
          <stop offset=".76" stopColor={muted ? "#10271c" : "#09251d"} />
          <stop offset="1" stopColor={muted ? "#56745b" : "#96d86d"} />
        </linearGradient>
        <linearGradient id={`${prefix}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={muted ? "#91b96b" : "#f2ffd0"} />
          <stop offset=".2" stopColor={muted ? "#86b55b" : "#d9ff65"} />
          <stop offset=".62" stopColor={liquid} />
          <stop offset="1" stopColor={muted ? "#315b2c" : "#51a51f"} />
        </linearGradient>
        <clipPath id={`${prefix}-liquid-clip`}>
          <path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" />
        </clipPath>
      </defs>
      <path d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z" fill={`url(#${prefix}-glass)`} stroke={glass} strokeOpacity={muted ? .44 : .78} strokeWidth="3" />
      <path d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z" fill={glassDeep} fillOpacity={muted ? .58 : .38} />
      <path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill={`url(#${prefix}-liquid)`} fillOpacity={muted ? .52 : .96} />
      <g clipPath={`url(#${prefix}-liquid-clip)`}>
        {[[58, 424, 3.5], [78, 391, 2.4], [101, 448, 3], [124, 410, 4], [151, 438, 2.6], [173, 370, 2.2], [190, 426, 3.3], [86, 345, 2], [117, 362, 2.8], [143, 332, 1.8]].map(([cx, cy, r], index) => (
          <circle key={index} cx={cx} cy={cy} r={r} fill="#f4ffd9" fillOpacity={muted ? .2 : .78} />
        ))}
      </g>
      <path d="M103 70c-8 55-6 104-6 158v183c0 28 8 51 18 67l11-5c-10-22-14-41-14-66V212c0-56-2-101 8-145Z" fill="#f4ffe9" fillOpacity={muted ? .06 : .16} />
      <path d="M98 106h64v39H98Z" fill="#092c3c" stroke={green} strokeOpacity={muted ? .35 : .74} strokeWidth="1.5" />
      <text x="130" y="133" fill={muted ? "#9db2a1" : "#f7fff0"} fontSize="23" fontWeight="900" textAnchor="middle">S</text>
      <g opacity={muted ? .58 : 1}>
        <rect x="73" y="264" width="114" height="116" rx="3" fill="#050708" fillOpacity=".97" stroke="#67ce9e" strokeWidth="2.5" />
        <path d="M83 274h94v96H83Z" fill="none" stroke="#314d42" strokeWidth="1" />
        <text x="130" y="339" fill="#d7e0db" fontSize="48" fontWeight="900" textAnchor="middle" letterSpacing="-3">SP</text>
        <path d="M94 351h72" stroke="#67ce9e" strokeWidth="2" strokeLinecap="round" />
        <text x="130" y="365" fill="#67ce9e" fontSize="7" fontWeight="900" textAnchor="middle" letterSpacing="2.2">SMARTPRO</text>
      </g>
      <path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill="#0a0f0d" stroke="#b9e7ff" strokeOpacity={muted ? .28 : .86} strokeWidth="2" />
    </svg>
  );
}

function StatePill({ stage, accent }: { stage: DrinkStage; accent: string }) {
  const locked = stage === "locked";
  return (
    <span className={`state-pill ${locked ? "is-locked" : "is-open"}`} style={{ "--accent": accent } as React.CSSProperties}>
      {locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
      {locked ? "RECIPE LOCKED" : stage === "armed" ? "EFFECT ARMED" : "RECIPE UNLOCKED"}
    </span>
  );
}

function DrinkCard({
  kind,
  state,
  tokens,
  onUnlock,
  onBuy,
  onRedeem,
  onReset,
  onPreview,
  saleSeconds,
}: {
  kind: DrinkKind;
  state: DrinkState;
  tokens: number;
  onUnlock: () => void;
  onBuy: () => void;
  onRedeem: () => void;
  onReset: () => void;
  onPreview: () => void;
  saleSeconds?: number;
}) {
  const copy = drinkCopy[kind];
  const locked = state.stage === "locked";
  const armed = state.stage === "armed";
  const bottleCost = copy.bottlePrice;
  const canAffordUnlock = tokens >= copy.unlockPrice;
  const canAffordBottle = tokens >= bottleCost;
  const actionLabel = locked
    ? `UNLOCK RECIPE · ${copy.unlockPrice} TOKENS`
    : state.bottles > 0
      ? kind === "daiquiri" ? "REDEEM · ARM NEXT TOSS" : "REDEEM · OPEN 90 SEC SALE"
      : `BUY BOTTLE · ${bottleCost} TOKENS`;

  return (
    <article className={`drink-card ${kind} ${locked ? "is-locked" : "is-unlocked"} ${armed ? "is-armed" : ""}`} style={{ "--accent": copy.accent, "--accent-strong": copy.accentStrong } as React.CSSProperties}>
      <div className="card-topline">
        <span className="card-index">0{kind === "daiquiri" ? 1 : 2} / BOTTLE LAB</span>
        <StatePill stage={state.stage} accent={copy.accent} />
      </div>

      <div className={`drink-stage ${kind === "smartPro" && state.animation === "edge" ? "is-edge-tap" : ""} ${kind === "daiquiri" && state.animation === "surge" ? "is-surge" : ""}`}>
        <div className="stage-orbit" />
        <div className="stage-grid" />
        <div className={`bottle-wrap ${state.pulse ? "is-pulsing" : ""}`} key={state.pulse}>
          {kind === "daiquiri" ? <DaiquiriBottle muted={locked} /> : <SmartProBottle muted={locked} />}
        </div>
        {locked ? (
          <div className="lock-medallion" aria-label={`${copy.shortName} is locked`}>
            <LockKeyhole size={22} />
            <span>LOCKED</span>
          </div>
        ) : (
          <button className="preview-hotspot" type="button" onClick={onPreview} aria-label={`Preview ${copy.shortName} bottle animation`}>
            <Sparkles size={14} />
            TAP TO PREVIEW
          </button>
        )}
        {armed && <div className="armed-burst"><Check size={15} /> {kind === "daiquiri" ? "2× AWARD LOADED" : "50% SALE LOADED"}</div>}
        {kind === "smartPro" && state.animation === "edge" && (
          <div className="edge-tap-flare" role="status"><span>SMARTPRO</span><strong>EDGE TAP</strong></div>
        )}
        {kind === "daiquiri" && state.animation === "surge" && (
          <div className="daiquiri-surge-flare" role="status"><span>DAIQUIRI</span><strong>GOLD SURGE</strong></div>
        )}
      </div>

      <div className="drink-copy">
        <div className="drink-heading">
          <div>
            <p className="drink-eyebrow">{kind === "daiquiri" ? "PREMIUM RECIPE" : "FLASH-SALE RECIPE"}</p>
            <h2>{copy.name}</h2>
          </div>
          <div className="bottle-count">
            <span>INVENTORY</span>
            <strong>{locked ? "LOCKED" : `${state.bottles.toString().padStart(2, "0")} BTL`}</strong>
          </div>
        </div>
        <p className="drink-description">{copy.description}</p>
          {kind === "smartPro" && state.stage === "armed" && saleSeconds && saleSeconds > 0 && (
            <div className="smart-sale-panel" aria-label="SmartPro live shop">
              <div className="smart-sale-heading"><span>LIVE SHOP</span><strong>{Math.floor(saleSeconds / 60)}:{(saleSeconds % 60).toString().padStart(2, "0")}</strong></div>
              <div><span>QUICK REVIVE · BOTTLE</span><b>½ PRICE</b></div>
              <div><span>DAIQUIRI · BOTTLE</span><b>½ PRICE</b></div>
              <div className="is-full"><span>SMARTPRO · BOTTLE</span><b>3 TOKENS</b></div>
              <div><span>STAMIN UP · BOTTLE</span><b>½ PRICE</b></div>
            </div>
          )}
        <div className="spec-row">
          <span>{armed ? copy.armedDetail : locked ? copy.lockedDetail : copy.unlockedDetail}</span>
          <span className="spec-accent">{copy.detail}</span>
        </div>
      </div>

      <div className="card-actions">
        <button
          className="primary-action"
          type="button"
          onClick={locked ? onUnlock : state.bottles > 0 ? onRedeem : onBuy}
          disabled={locked ? !canAffordUnlock : armed || !canAffordBottle}
        >
          {locked ? <UnlockKeyhole size={15} /> : kind === "smartPro" ? <Zap size={15} /> : <Droplets size={15} />}
          {actionLabel}
          <ChevronRight size={15} />
        </button>
        <button className="secondary-action" type="button" onClick={onReset}>
          <RotateCcw size={13} /> RESET CARD
        </button>
      </div>
      {!locked && state.bottles === 0 && !armed && (
        <p className="card-hint">Buy a bottle to enable redemption. This test wallet is isolated from the real app.</p>
      )}
      {locked && !canAffordUnlock && (
        <p className="card-hint is-warning">NOT ENOUGH TEST TOKENS TO UNLOCK THIS RECIPE.</p>
      )}
    </article>
  );
}

export function DrinkStateLab() {
  const [tokens, setTokens] = useState(INITIAL_TOKENS);
  const [daiquiri, setDaiquiri] = useState<DrinkState>({ stage: "locked", bottles: 0, pulse: 0, animation: "idle" });
  const [smartPro, setSmartPro] = useState<DrinkState>({ stage: "unlocked", bottles: 1, pulse: 0, animation: "idle" });
  const [saleSeconds, setSaleSeconds] = useState(0);
  const [activity, setActivity] = useState("TEST WALLET READY · NO REAL TOKENS OR PURCHASES");

  useEffect(() => {
    if (saleSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setSaleSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [saleSeconds]);

  useEffect(() => {
    if (saleSeconds === 0 && smartPro.stage === "armed") {
      setSmartPro((value) => ({ ...value, stage: "unlocked" }));
      setActivity("SMARTPRO WINDOW EXPIRED · BUY ANOTHER BOTTLE TO REPLAY");
    }
  }, [saleSeconds, smartPro.stage]);

  const updateDaiquiri = (next: Partial<DrinkState>) => setDaiquiri((value) => ({ ...value, ...next }));
  const updateSmartPro = (next: Partial<DrinkState>) => setSmartPro((value) => ({ ...value, ...next }));

  const unlockDaiquiri = () => {
    if (tokens < 100 || daiquiri.stage !== "locked") return;
    setTokens((value) => value - 100);
    updateDaiquiri({ stage: "unlocked" });
    setActivity("DAIQUIRI UNLOCKED · BOTTLES ARE NOW 8 TOKENS");
  };

  const buyDaiquiri = () => {
    if (tokens < 8 || daiquiri.stage === "locked") return;
    setTokens((value) => value - 8);
    updateDaiquiri({ bottles: daiquiri.bottles + 1 });
    setActivity("DAIQUIRI BOTTLE ADDED TO INVENTORY");
  };

  const redeemDaiquiri = () => {
    if (daiquiri.stage !== "unlocked" || daiquiri.bottles < 1) return;
    updateDaiquiri({ bottles: daiquiri.bottles - 1, stage: "armed", pulse: daiquiri.pulse + 1, animation: "surge" });
    setActivity("DAIQUIRI ARMED · NEXT TOSS HAS 45% WIN ODDS · DOUBLE AWARD");
  };

  const unlockSmartPro = () => {
    if (tokens < 100 || smartPro.stage !== "locked") return;
    setTokens((value) => value - 100);
    updateSmartPro({ stage: "unlocked" });
    setActivity("SMARTPRO UNLOCKED · BOTTLES ARE NOW 3 TOKENS");
  };

  const buySmartPro = () => {
    if (tokens < 3 || smartPro.stage === "locked") return;
    setTokens((value) => value - 3);
    updateSmartPro({ bottles: smartPro.bottles + 1 });
    setActivity("SMARTPRO BOTTLE ADDED TO INVENTORY");
  };

  const redeemSmartPro = () => {
    if (smartPro.stage !== "unlocked" || smartPro.bottles < 1) return;
    updateSmartPro({ bottles: smartPro.bottles - 1, stage: "armed", pulse: smartPro.pulse + 1, animation: "edge" });
    setSaleSeconds(90);
    setActivity("SMARTPRO ACTIVE · 90 SECONDS OF 50% OFF LOADED");
  };

  const resetAll = () => {
    setTokens(INITIAL_TOKENS);
    setDaiquiri({ stage: "locked", bottles: 0, pulse: 0, animation: "idle" });
    setSmartPro({ stage: "unlocked", bottles: 1, pulse: 0, animation: "idle" });
    setSaleSeconds(0);
    setActivity("TEST LAB RESET · DAVE LOCKED · SMARTPRO UNLOCKED");
  };

  const preview = (kind: DrinkKind) => {
    if (kind === "daiquiri") {
      updateDaiquiri({ pulse: daiquiri.pulse + 1, animation: "surge" });
      setActivity("DAIQUIRI PREVIEW · LABEL FLARE AND GOLDEN LIQUID SURGE");
    } else {
      updateSmartPro({ pulse: smartPro.pulse + 1, animation: "edge" });
      setActivity("SMARTPRO PREVIEW · NEON BUBBLES AND EDGE TAP");
    }
  };

  const formatSeconds = `${Math.floor(saleSeconds / 60)}:${(saleSeconds % 60).toString().padStart(2, "0")}`;

  return (
    <main className="drink-lab">
      <header className="lab-header">
        <div>
          <div className="lab-kicker"><span className="lab-dot" /> CENTRAL BANK / INTERACTIVE TEST LAB</div>
          <h1>Locked in.<br /><em>Ready to crack.</em></h1>
          <p className="lab-intro">Compare the locked and unlocked recipe states, then run the real unlock → buy → redeem flow with a disposable test wallet.</p>
        </div>
        <div className="wallet-panel">
          <span>TEST WALLET</span>
          <strong>{tokens} <small>BREW TOKENS</small></strong>
          <button type="button" onClick={resetAll}><RotateCcw size={13} /> RESET ALL</button>
        </div>
      </header>

      <div className="state-guide">
        <div><LockKeyhole size={15} /><span><b>LOCKED</b> muted bottle, unlock action, inventory hidden</span></div>
        <div><UnlockKeyhole size={15} /><span><b>UNLOCKED</b> vivid bottle, bottle purchase, redeem action</span></div>
        <div><Sparkles size={15} /><span><b>TAP THE BOTTLE</b> previews the celebration without consuming it</span></div>
      </div>

      <section className="drink-grid" aria-label="Locked and unlocked drink states">
        <DrinkCard
          kind="daiquiri"
          state={daiquiri}
          tokens={tokens}
          onUnlock={unlockDaiquiri}
          onBuy={buyDaiquiri}
          onRedeem={redeemDaiquiri}
          onReset={() => {
             setDaiquiri({ stage: "locked", bottles: 0, pulse: 0, animation: "idle" });
            setActivity("DAIQUIRI CARD RESET");
          }}
          onPreview={() => preview("daiquiri")}
           saleSeconds={saleSeconds}
        />
        <DrinkCard
          kind="smartPro"
          state={smartPro}
          tokens={tokens}
          onUnlock={unlockSmartPro}
          onBuy={buySmartPro}
          onRedeem={redeemSmartPro}
          onReset={() => {
             setSmartPro({ stage: "unlocked", bottles: 1, pulse: 0, animation: "idle" });
            setSaleSeconds(0);
            setActivity("SMARTPRO CARD RESET · 01 BOTTLE RESTORED");
          }}
          onPreview={() => preview("smartPro")}
           saleSeconds={saleSeconds}
        />
      </section>

      <footer className="lab-footer">
        <div className="activity-line"><span className="activity-pip" /> {activity}</div>
        {saleSeconds > 0 && (
          <div className="sale-readout"><Clock3 size={14} /> SMARTPRO SALE <strong>{formatSeconds}</strong> LEFT · OTHER BOTTLES ½ PRICE</div>
        )}
        <div className="footer-note">CANVAS-ONLY STATE TEST · NO REAL TOKENS · NO PERSISTENCE · RECIPES MATCH CENTRAL BANK RULES</div>
      </footer>

      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #07090b; }
        button { font: inherit; }
        .drink-lab {
          min-height: 100vh;
          padding: 36px 42px 30px;
          color: #f5f6f7;
          background:
            radial-gradient(circle at 15% 0%, rgba(214,173,84,.14), transparent 25rem),
            radial-gradient(circle at 86% 26%, rgba(185,255,69,.08), transparent 24rem),
            linear-gradient(145deg, #07090b 0%, #11161a 50%, #080a0c 100%);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          overflow-x: hidden;
        }
        .lab-header, .state-guide, .drink-grid, .lab-footer { width: min(100%, 1140px); margin-inline: auto; }
        .lab-header { display: flex; align-items: end; justify-content: space-between; gap: 28px; }
        .lab-kicker { display: flex; align-items: center; gap: 8px; color: #d6ad54; font-size: 9px; font-weight: 900; letter-spacing: .18em; }
        .lab-dot, .activity-pip { width: 7px; height: 7px; border-radius: 50%; background: #d6ad54; box-shadow: 0 0 13px rgba(214,173,84,.85); }
        h1 { margin: 14px 0 0; font-size: clamp(40px, 5.3vw, 72px); line-height: .9; letter-spacing: -.07em; font-weight: 850; }
        h1 em { color: #d6ad54; font-style: normal; }
        .lab-intro { max-width: 520px; margin: 22px 0 0; color: #9da7ad; font-size: 14px; line-height: 1.55; }
        .wallet-panel { min-width: 205px; padding: 15px 17px; border: 1px solid #8f753f; border-radius: 13px; background: rgba(8,10,13,.72); box-shadow: inset 0 1px rgba(255,255,255,.07); }
        .wallet-panel > span { color: #a9adb2; font-size: 8px; font-weight: 800; letter-spacing: .16em; }
        .wallet-panel strong { display: block; margin: 5px 0 13px; color: #f7dc8f; font-size: 28px; line-height: 1; letter-spacing: -.05em; }
        .wallet-panel small { color: #d6ad54; font-size: 8px; letter-spacing: .08em; }
        .wallet-panel button { display: flex; align-items: center; gap: 6px; border: 0; color: #9da7ad; background: none; cursor: pointer; font-size: 8px; font-weight: 800; letter-spacing: .08em; }
        .state-guide { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 28px; padding: 10px; border: 1px solid #2b3138; border-radius: 11px; background: rgba(8,10,13,.58); }
        .state-guide div { display: flex; align-items: center; gap: 9px; min-height: 35px; padding: 0 11px; border-right: 1px solid #2b3138; color: #929ba1; font-size: 9px; line-height: 1.3; }
        .state-guide div:last-child { border-right: 0; }
        .state-guide svg { flex: 0 0 auto; color: #d6ad54; }
        .state-guide b { color: #f0f2f3; letter-spacing: .08em; }
        .drink-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 18px; }
        .drink-card { position: relative; overflow: hidden; min-width: 0; border: 1px solid color-mix(in srgb, var(--accent) 34%, #343a40); border-radius: 18px; background: linear-gradient(155deg, rgba(25,30,35,.96), rgba(7,10,12,.98)); box-shadow: 0 22px 50px rgba(0,0,0,.32), inset 0 1px rgba(255,255,255,.07); transition: border-color .3s, background .3s; }
        .drink-card.smartPro { background: linear-gradient(155deg, rgba(13,31,24,.96), rgba(7,12,11,.98)); }
        .drink-card.is-armed { border-color: color-mix(in srgb, var(--accent) 78%, white); }
        .card-topline { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 15px 16px 0; }
        .card-index { color: #737e84; font-size: 8px; font-weight: 900; letter-spacing: .16em; }
        .state-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid color-mix(in srgb, var(--accent) 55%, #3a4147); border-radius: 999px; color: var(--accent-strong); background: color-mix(in srgb, var(--accent) 8%, transparent); font-size: 8px; font-weight: 900; letter-spacing: .09em; }
        .state-pill.is-locked { color: #a3abb0; border-color: #555e68; background: rgba(85,94,104,.1); }
        .drink-stage { position: relative; display: grid; min-height: 340px; place-items: center; margin: 9px 12px 0; overflow: hidden; border: 1px solid #2b3138; border-radius: 13px; background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 48%), linear-gradient(155deg, rgba(38,44,50,.72), rgba(7,10,12,.8)); }
        .smartPro .drink-stage { background: radial-gradient(circle at 50% 45%, rgba(185,255,69,.16), transparent 48%), linear-gradient(155deg, rgba(16,50,35,.68), rgba(7,14,11,.84)); }
        .stage-orbit { position: absolute; width: 275px; height: 275px; border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); border-radius: 50%; box-shadow: 0 0 50px color-mix(in srgb, var(--accent) 12%, transparent), inset 0 0 34px color-mix(in srgb, var(--accent) 8%, transparent); animation: orbit-pulse 3s ease-in-out infinite; }
        .stage-grid { position: absolute; inset: 0; opacity: .19; background: linear-gradient(90deg, transparent 49.5%, var(--accent) 50%, transparent 50.5%), linear-gradient(0deg, transparent 49.5%, var(--accent) 50%, transparent 50.5%); background-size: 100% 68px, 68px 100%; mask-image: radial-gradient(circle, black, transparent 70%); }
        .bottle-wrap { position: relative; z-index: 2; display: grid; place-items: center; filter: drop-shadow(0 22px 20px rgba(0,0,0,.62)); animation: bottle-float 4.5s ease-in-out infinite; }
        .bottle-wrap.is-pulsing { animation: bottle-crack 1.2s cubic-bezier(.15,.8,.3,1) both; }
         .drink-stage.is-edge-tap .bottle-wrap { animation: edge-tap-bottle 1.35s cubic-bezier(.16,.82,.3,1) both; filter: drop-shadow(0 0 32px rgba(185,255,69,.86)); }
         .drink-stage.is-surge .bottle-wrap { animation: dai-surge-bottle 1.5s cubic-bezier(.18,.82,.31,1) both; }
        .bottle-wrap svg { display: block; width: 210px; height: auto; }
        .is-locked .stage-orbit { border-color: rgba(126,138,146,.28); box-shadow: none; animation: none; }
        .is-locked .bottle-wrap { animation: none; filter: grayscale(.45) saturate(.5) drop-shadow(0 17px 18px rgba(0,0,0,.6)); }
        .lock-medallion { position: absolute; z-index: 4; right: 18px; bottom: 15px; display: flex; align-items: center; gap: 7px; padding: 8px 10px; border: 1px solid #555e68; border-radius: 7px; color: #c2c8cc; background: rgba(7,10,12,.82); box-shadow: 0 8px 20px rgba(0,0,0,.35); font-size: 8px; font-weight: 900; letter-spacing: .12em; }
        .preview-hotspot { position: absolute; z-index: 5; bottom: 12px; left: 50%; display: flex; align-items: center; gap: 6px; padding: 7px 9px; border: 1px solid color-mix(in srgb, var(--accent) 58%, #41484e); border-radius: 999px; color: var(--accent-strong); background: rgba(8,12,13,.75); cursor: pointer; transform: translateX(-50%); font-size: 8px; font-weight: 900; letter-spacing: .1em; }
        .preview-hotspot:hover { background: color-mix(in srgb, var(--accent) 14%, #080c0d); }
        .armed-burst { position: absolute; z-index: 6; top: 18px; left: 50%; display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--accent); border-radius: 999px; color: #07100c; background: var(--accent); box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 44%, transparent); transform: translateX(-50%); font-size: 8px; font-weight: 950; letter-spacing: .1em; animation: pop-in .5s ease both; white-space: nowrap; }
         .edge-tap-flare, .daiquiri-surge-flare { position: absolute; z-index: 7; top: 44%; left: 50%; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%); pointer-events: none; animation: edge-flare 1.35s cubic-bezier(.15,.8,.3,1) both; text-shadow: 0 0 18px rgba(185,255,69,.95); }
         .edge-tap-flare::before, .daiquiri-surge-flare::before { position: absolute; width: 220px; height: 220px; border: 1px solid rgba(185,255,69,.7); border-radius: 50%; box-shadow: 0 0 34px rgba(185,255,69,.3), inset 0 0 24px rgba(103,206,158,.2); content: ""; animation: edge-orbit 1.35s ease-out both; }
         .daiquiri-surge-flare { text-shadow: 0 0 18px rgba(246,214,74,.95); animation-name: gold-flare; }
         .daiquiri-surge-flare::before { border-color: rgba(246,214,74,.7); box-shadow: 0 0 34px rgba(246,214,74,.3), inset 0 0 24px rgba(105,200,255,.2); }
         .edge-tap-flare span, .daiquiri-surge-flare span { position: relative; color: #efffdc; font-size: 10px; font-weight: 900; letter-spacing: .3em; }
         .edge-tap-flare strong, .daiquiri-surge-flare strong { position: relative; color: #b9ff45; font-size: 35px; line-height: .95; letter-spacing: -.08em; }
         .daiquiri-surge-flare strong { color: #f6d64a; }
         .smart-sale-panel { margin: 4px 0 12px; padding: 11px 12px 8px; border: 1px solid rgba(103,206,158,.34); border-radius: 10px; background: rgba(5,19,15,.46); box-shadow: inset 0 1px rgba(255,255,255,.06); color: #b7c9bf; font-size: 8px; font-weight: 800; letter-spacing: .08em; }
         .smart-sale-heading, .smart-sale-panel > div:not(.smart-sale-heading) { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
         .smart-sale-heading { color: #67ce9e; font-size: 9px; letter-spacing: .16em; }
         .smart-sale-heading strong { color: #efffdc; font-size: 18px; letter-spacing: -.04em; }
         .smart-sale-panel > div:not(.smart-sale-heading) { border-top: 1px solid rgba(255,255,255,.08); }
         .smart-sale-panel b { color: #b9ff45; white-space: nowrap; }
         .smart-sale-panel .is-full b { color: #d7e0db; }
        .drink-copy { padding: 16px 18px 0; }
        .drink-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .drink-eyebrow { margin: 0 0 6px; color: var(--accent); font-size: 8px; font-weight: 900; letter-spacing: .18em; }
        h2 { margin: 0; color: #f5f6f7; font-size: clamp(17px, 2vw, 23px); line-height: 1.05; letter-spacing: -.045em; }
        .bottle-count { flex: 0 0 auto; text-align: right; }
        .bottle-count span { display: block; color: #737e84; font-size: 7px; font-weight: 800; letter-spacing: .12em; }
        .bottle-count strong { display: block; margin-top: 4px; color: var(--accent-strong); font-size: 11px; letter-spacing: .05em; }
        .is-locked .bottle-count strong { color: #858e94; }
        .drink-description { min-height: 43px; margin: 12px 0 12px; color: #9da7ad; font-size: 11px; line-height: 1.48; }
        .spec-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 9px 0; border-top: 1px solid #2b3138; border-bottom: 1px solid #2b3138; color: #9da7ad; font-size: 8px; font-weight: 800; letter-spacing: .07em; }
        .spec-accent { color: var(--accent); }
        .card-actions { display: flex; gap: 8px; padding: 14px 18px 0; }
        .primary-action, .secondary-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 39px; border-radius: 8px; cursor: pointer; font-size: 8px; font-weight: 900; letter-spacing: .07em; }
        .primary-action { flex: 1; border: 1px solid var(--accent); color: #07100c; background: var(--accent); box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 16%, transparent); }
        .primary-action:hover:not(:disabled) { filter: brightness(1.12); }
        .primary-action:disabled { border-color: #41494f; color: #707a80; background: #20262b; cursor: not-allowed; box-shadow: none; }
        .secondary-action { flex: 0 0 auto; padding: 0 10px; border: 1px solid #41494f; color: #aab2b7; background: #171c20; }
        .secondary-action:hover { border-color: #7b858c; color: #fff; }
        .card-hint { margin: 9px 18px 17px; color: #727d83; font-size: 8px; line-height: 1.4; }
        .card-hint.is-warning { color: #d6ad54; }
        .lab-footer { margin-top: 16px; }
        .activity-line, .sale-readout { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; border: 1px solid #2b3138; border-radius: 9px; color: #9da7ad; background: rgba(8,10,13,.63); font-size: 8px; font-weight: 900; letter-spacing: .1em; text-align: center; }
        .activity-pip { width: 6px; height: 6px; background: #00e5a0; box-shadow: 0 0 12px rgba(0,229,160,.8); }
        .sale-readout { margin-top: 8px; color: #b9ff45; border-color: rgba(185,255,69,.38); background: rgba(185,255,69,.06); }
        .sale-readout strong { color: #efffdc; font-size: 17px; letter-spacing: -.04em; }
        .footer-note { margin-top: 12px; color: #606a70; font-size: 7px; font-weight: 800; letter-spacing: .14em; text-align: center; }
        @keyframes bottle-float { 0%, 100% { transform: translateY(5px) rotate(-1deg); } 50% { transform: translateY(-8px) rotate(1deg); } }
        @keyframes bottle-crack { 0% { transform: scale(1) translateY(0) rotate(0); } 22% { transform: scale(1.08) translateY(-9px) rotate(-4deg); } 58% { transform: scale(1.03) translateY(2px) rotate(3deg); } 100% { transform: scale(1) translateY(0) rotate(0); } }
         @keyframes edge-tap-bottle { 0% { transform: scale(1) translateY(0) rotate(0); filter: drop-shadow(0 22px 20px rgba(0,0,0,.62)); } 22% { transform: scale(1.08) translateY(-16px) rotate(-3deg); filter: drop-shadow(0 0 32px rgba(185,255,69,.86)); } 58% { transform: scale(.96) translateY(4px) rotate(3deg); filter: drop-shadow(0 0 52px rgba(103,206,158,.76)); } 100% { transform: scale(1) translateY(0) rotate(0); filter: drop-shadow(0 22px 20px rgba(0,0,0,.62)); } }
         @keyframes dai-surge-bottle { 0% { transform: scale(.92) translateY(10px) rotate(0); } 34% { transform: scale(1.1) translateY(-18px) rotate(-5deg); } 68% { transform: scale(1.03) translateY(0) rotate(3deg); } 100% { transform: scale(1) translateY(0) rotate(0); } }
         @keyframes edge-flare { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3); } 28% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); } 100% { opacity: 0; transform: translate(-50%, -68%) scale(1.18); } }
         @keyframes gold-flare { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3); } 28% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); } 100% { opacity: 0; transform: translate(-50%, -70%) scale(1.18); } }
         @keyframes edge-orbit { 0% { transform: scale(.4) rotate(-22deg); opacity: 0; } 35% { opacity: 1; } 100% { transform: scale(1.2) rotate(28deg); opacity: 0; } }
        @keyframes orbit-pulse { 0%, 100% { transform: scale(.96); opacity: .62; } 50% { transform: scale(1.04); opacity: 1; } }
        @keyframes pop-in { from { opacity: 0; transform: translate(-50%, -8px) scale(.85); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        @media (max-width: 820px) {
          .drink-lab { padding: 24px 20px; }
          .lab-header { align-items: flex-start; flex-direction: column; }
          .wallet-panel { width: 100%; }
          .state-guide { grid-template-columns: 1fr; }
          .state-guide div { border-right: 0; border-bottom: 1px solid #2b3138; }
          .state-guide div:last-child { border-bottom: 0; }
          .drink-grid { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
           .stage-orbit, .bottle-wrap, .edge-tap-flare, .daiquiri-surge-flare, .edge-tap-flare::before, .daiquiri-surge-flare::before { animation: none; }
        }
      `}</style>
    </main>
  );
}