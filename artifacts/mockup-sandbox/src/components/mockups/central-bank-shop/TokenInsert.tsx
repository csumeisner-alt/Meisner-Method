import {
  ArrowDownToLine,
  ArrowLeft,
  Coins,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";

import "./_group.css";

export function TokenInsert() {
  return (
    <main className="bank-preview">
      <div className="bank-grain" />
      <section className="bank-shell" aria-label="Token insertion state">
        <header className="bank-header">
          <div>
            <p className="bank-eyebrow"><span className="status-dot" /> WEEKEND FEATURE</p>
            <h1>THE CENTRAL BANK</h1>
            <p className="bank-subtitle">OF BAD DECISIONS</p>
          </div>
          <button className="icon-button" aria-label="Go back"><ArrowLeft size={17} /></button>
        </header>

        <section className="machine-stage-card">
          <div className="stage-status">
            <span><i className="ready-pip" /> MACHINE / STAKE READY</span>
            <span>AWAITING TOKEN</span>
          </div>
          <div className="machine-deck">
            <div className="machine-glow" />
            <div className="machine-face">
              <div className="machine-topline"><span>BREW BANK · 07</span><span>READY</span></div>
              <div className="machine-reels" aria-label="Ready slot machine">
                <div className="machine-reel">☕</div>
                <div className="machine-reel">✦</div>
                <div className="machine-reel">⚡</div>
              </div>
              <div className="machine-scanline" />
              <div className="machine-bottomline">
                <span>INSERT TOKEN TO ARM TOSS</span>
                <div className="coin-slot">
                  <div className="slot-opening" />
                  <Coins size={22} />
                </div>
              </div>
            </div>
            <div className="token-trail" />
            <div className="token-ready"><Coins size={23} /></div>
          </div>
          <p className="stage-caption">Your token is staged above the vault slot. One tap commits the deposit and starts the reels.</p>
        </section>

        <div className="deposit-card">
          <div><span>DEPOSIT</span><strong>1 TOKEN</strong></div>
          <div className="deposit-stepper">
            <button className="step-button" aria-label="Decrease deposit"><Minus size={14} /></button>
            <button className="step-button" aria-label="Increase deposit"><Plus size={14} /></button>
          </div>
        </div>

        <button className="insert-action">
          <ArrowDownToLine size={17} />
          TOSS 1 TOKEN INTO THE BANK
        </button>

        <p className="machine-note"><Sparkles size={11} /> WIN RETURNS YOUR DEPOSIT + AN EQUAL PAYOUT · LOSE ONLY THE TOKEN DEPOSITED</p>
        <footer className="bank-footer"><Sparkles size={13} /> SOUND + HAPTICS READY · TAP TO COMMIT THE STAKE</footer>
      </section>
    </main>
  );
}