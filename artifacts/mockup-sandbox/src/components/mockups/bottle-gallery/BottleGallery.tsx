import { useState } from "react";

import { Current as LockedShop } from "../central-bank-shop/Current";
import { Unlocked as UnlockedShop } from "../central-bank-shop/Unlocked";
import { SodasUnlocked } from "../central-bank-shop/SodasUnlocked";
import { QuickReviveGlowSurge } from "../quick-revive-redesign/QuickReviveGlowSurge";
import { DaiquiriGlowSurge } from "../daiquiri-redesign/DaiquiriGlowSurge";
import { StaminUpGlowSurge } from "../stamin-up-redesign/StaminUpGlowSurge";
import { Interactive as SmartProInteractive } from "../smart-pro-bottle/Interactive";

type ViewKey =
  | "locked"
  | "unlocked"
  | "inventory"
  | "quickRevive"
  | "daiquiri"
  | "staminUp"
  | "smartPro";

const views: Array<{ key: ViewKey; label: string; detail: string }> = [
  { key: "locked", label: "Locked shop", detail: "See recipes before unlock" },
  { key: "unlocked", label: "Unlocked shop", detail: "See the open bottle lab" },
  { key: "inventory", label: "Inventory", detail: "See all four bottles ready" },
  { key: "quickRevive", label: "Quick Revive", detail: "Tap redeem to release the fizz" },
  { key: "daiquiri", label: "Daiquiri", detail: "Tap redeem to trigger the gold surge" },
  { key: "staminUp", label: "Stamin Up", detail: "Tap redeem to charge Dark Brew" },
  { key: "smartPro", label: "SmartPro", detail: "Unlock → buy → redeem the sale" },
];

function ActiveView({ view }: { view: ViewKey }) {
  switch (view) {
    case "locked":
      return <LockedShop />;
    case "unlocked":
      return <UnlockedShop />;
    case "inventory":
      return <SodasUnlocked />;
    case "quickRevive":
      return <QuickReviveGlowSurge />;
    case "daiquiri":
      return <DaiquiriGlowSurge />;
    case "staminUp":
      return <StaminUpGlowSurge />;
    case "smartPro":
      return <SmartProInteractive />;
  }
}

export function BottleGallery() {
  const [activeView, setActiveView] = useState<ViewKey>("locked");
  const active = views.find((view) => view.key === activeView) ?? views[0];

  return (
    <main className="bottle-gallery">
      <header className="bottle-gallery-header">
        <div>
          <p className="bottle-gallery-kicker">MEISNER METHOD / CENTRAL BANK</p>
          <h1>Bottle state lab</h1>
          <p className="bottle-gallery-subtitle">
            Current app visuals. Switch states, then click the redemption controls inside each bottle panel.
          </p>
        </div>
        <div className="bottle-gallery-status">
          <span className="bottle-gallery-status-dot" />
          CANVAS TEST · NO REAL TOKENS
        </div>
      </header>

      <nav className="bottle-gallery-nav" aria-label="Bottle states">
        {views.map((view) => (
          <button
            key={view.key}
            type="button"
            className={view.key === activeView ? "is-active" : ""}
            onClick={() => setActiveView(view.key)}
          >
            <strong>{view.label}</strong>
            <span>{view.detail}</span>
          </button>
        ))}
      </nav>

      <div className="bottle-gallery-current">
        <div className="bottle-gallery-current-label">
          <span>NOW VIEWING</span>
          <strong>{active.label}</strong>
        </div>
        <ActiveView view={activeView} />
      </div>

      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #05090d; }
        body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        button { font: inherit; }
        .bottle-gallery {
          min-height: 100vh;
          color: #eef5f2;
          background:
            radial-gradient(circle at 50% 0%, rgba(63, 133, 107, .18), transparent 30%),
            #05090d;
        }
        .bottle-gallery-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          padding: 28px 28px 22px;
          border-bottom: 1px solid rgba(164, 207, 190, .14);
        }
        .bottle-gallery-kicker {
          margin: 0 0 7px;
          color: #78d8ac;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .2em;
        }
        .bottle-gallery h1 {
          margin: 0;
          color: #f7fbf8;
          font-size: clamp(25px, 6vw, 36px);
          line-height: 1;
          letter-spacing: -.05em;
        }
        .bottle-gallery-subtitle {
          max-width: 570px;
          margin: 10px 0 0;
          color: #8fa39a;
          font-size: 12px;
          line-height: 1.45;
        }
        .bottle-gallery-status {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
          color: #7e978b;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .12em;
          white-space: nowrap;
        }
        .bottle-gallery-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #67ce9e;
          box-shadow: 0 0 12px rgba(103, 206, 158, .8);
        }
        .bottle-gallery-nav {
          display: flex;
          gap: 8px;
          padding: 14px 28px;
          overflow-x: auto;
          border-bottom: 1px solid rgba(164, 207, 190, .1);
          background: rgba(4, 10, 12, .92);
          scrollbar-width: thin;
        }
        .bottle-gallery-nav button {
          display: flex;
          flex: 0 0 auto;
          flex-direction: column;
          min-width: 130px;
          gap: 5px;
          padding: 10px 12px;
          border: 1px solid rgba(164, 207, 190, .18);
          border-radius: 10px;
          color: #a5b7ae;
          background: rgba(255, 255, 255, .035);
          text-align: left;
          cursor: pointer;
          transition: border-color .2s, background .2s, color .2s, transform .2s;
        }
        .bottle-gallery-nav button:hover {
          border-color: rgba(103, 206, 158, .58);
          transform: translateY(-1px);
        }
        .bottle-gallery-nav button.is-active {
          color: #0b1a14;
          border-color: #67ce9e;
          background: #67ce9e;
          box-shadow: 0 0 20px rgba(103, 206, 158, .18);
        }
        .bottle-gallery-nav strong {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .06em;
          text-transform: uppercase;
        }
        .bottle-gallery-nav span {
          color: #738980;
          font-size: 9px;
          line-height: 1.25;
        }
        .bottle-gallery-nav button.is-active span {
          color: rgba(11, 26, 20, .72);
        }
        .bottle-gallery-current-label {
          display: flex;
          align-items: baseline;
          gap: 10px;
          padding: 16px 28px 0;
          color: #6f877c;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .16em;
        }
        .bottle-gallery-current-label strong {
          color: #d8e8df;
          font-size: 11px;
        }
        @media (max-width: 580px) {
          .bottle-gallery-header {
            align-items: flex-start;
            flex-direction: column;
            padding: 22px 18px 18px;
          }
          .bottle-gallery-nav { padding: 12px 18px; }
          .bottle-gallery-current-label { padding-left: 18px; padding-right: 18px; }
          .bottle-gallery-status { align-self: flex-start; }
        }
      `}</style>
    </main>
  );
}