import {
  CheckCircle2,
  ChevronDown,
  Coins,
  Droplets,
  Moon,
  Sparkles,
  Wind,
  Zap,
} from "lucide-react";

import "./_group.css";

const recipes = [
  { name: "QUICK REVIVE", detail: "Blue liquid · raises next toss odds by 7 points", spec: "62% WIN · +7 POINTS", count: "3 BOTTLES", icon: <Droplets size={17} />, tone: "recipe-blue", action: "REDEEM · +7% ODDS" },
  { name: "DAVE RAMSEY DAIQUIRI", detail: "Light blue + yellow liquid · doubles a winning award", spec: "45% WIN · DOUBLE AWARD", count: "2 BOTTLES", icon: <span>✦</span>, tone: "recipe-blue", action: "REDEEM · 2× AWARD" },
  { name: "STAMIN UP", detail: "Amber liquid · a win pays Dark Brew Tokens", spec: "55% WIN · DARK BREW", count: "1 BOTTLE", icon: <Wind size={17} />, tone: "recipe-amber", action: "REDEEM · DARK BREW" },
  { name: "SMARTPRO SODA", detail: "Neon-green liquid · every other bottle is half price", spec: "90 SEC · 50% SALE", count: "2 BOTTLES", icon: <Zap size={17} />, tone: "recipe-lime", action: "REDEEM · 90 SEC", active: true },
];

export function SodasUnlocked() {
  return (
    <main className="bank-preview">
      <div className="bank-grain" />
      <section className="bank-shell" aria-label="All soda recipes unlocked">
        <header className="bank-header">
          <div>
            <p className="bank-eyebrow"><span className="status-dot" /> CENTRAL BANK / INVENTORY</p>
            <h1>THE CENTRAL BANK</h1>
            <p className="bank-subtitle">OF BAD DECISIONS</p>
          </div>
          <button className="icon-button" aria-label="Close Central Bank"><ChevronDown size={17} /></button>
        </header>

        <div className="unlock-banner">
          <div className="unlock-banner-icon"><CheckCircle2 size={19} /></div>
          <div className="unlock-banner-copy">
            <strong>ALL RECIPES UNLOCKED</strong>
            <span>THE BOTTLE LAB IS FULLY ONLINE</span>
          </div>
          <b>04</b>
        </div>

        <div className="reserve-card">
          <div className="reserve-ring">
            <div className="reserve-core">
              <span className="reserve-label">BREW TOKEN</span>
              <strong>1,247</strong>
              <span className="reserve-available">TOKENS AVAILABLE</span>
            </div>
          </div>
          <div className="reserve-copy">
            <span className="reserve-kicker">BOTTLE LAB RESERVE</span>
            <strong>EVERY SODA IS READY</strong>
            <span>Choose one effect before your next toss</span>
            <div className="reserve-ticker">
              <span><Moon size={11} /> 6 BOTTLES READY</span>
              <span><Coins size={11} /> 4 RECIPES</span>
            </div>
          </div>
        </div>

        <div className="recipes-panel">
          <div className="recipes-heading">
            <strong>UNLOCKED SODAS</strong>
            <span>NEXT TOSS EFFECTS</span>
          </div>
          {recipes.map((recipe) => (
            <div className={`recipe-row ${recipe.active ? "active-soda" : ""}`} key={recipe.name}>
              <div className={`recipe-bottle ${recipe.tone}`}>{recipe.icon}</div>
              <div className="recipe-copy">
                <strong>{recipe.name}</strong>
                <span>{recipe.detail}</span>
                <span className="recipe-spec">{recipe.spec} · {recipe.count}</span>
              </div>
              <button className={`recipe-action ${recipe.active ? "active" : "ready"}`}>
                {recipe.active ? "ACTIVE" : "REDEEM"}
              </button>
            </div>
          ))}
        </div>

        <button className="insert-action">
          <Zap size={17} />
          CHOOSE A SODA FOR THE NEXT TOSS
        </button>
        <p className="machine-note"><Sparkles size={11} /> ONE EFFECT AT A TIME · BOTTLES ARE CONSUMED ON REDEMPTION</p>
        <footer className="bank-footer"><Sparkles size={13} /> UNLOCKS STAY PERMANENT · INVENTORY PERSISTS OFFLINE</footer>
      </section>
    </main>
  );
}