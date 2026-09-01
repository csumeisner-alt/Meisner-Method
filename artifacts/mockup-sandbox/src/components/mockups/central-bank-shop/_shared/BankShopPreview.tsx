import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Moon,
  Sparkles,
  ToggleRight,
  X,
  Zap,
} from "lucide-react";

import "../_group.css";

export type BankShopMode = "locked" | "unlocked";

const phrasePackCopy =
  "Swap the normal analysis loading steps for 15 chaotic one-liners. It changes the copy only — your analysis, data, and trades stay exactly the same.";

export function BankShopPreview({ mode }: { mode: BankShopMode }) {
  const isUnlocked = mode === "unlocked";
  const [phrasePackOpen, setPhrasePackOpen] = useState(true);
  const [phrasesActive, setPhrasesActive] = useState(isUnlocked);

  return (
    <main className="bank-preview">
      <div className="bank-grain" />
      <section className="bank-shell" aria-label="The Central Bank shop">
        <header className="bank-header">
          <div>
            <p className="bank-eyebrow">
              <span className="status-dot" />
              WEEKEND FEATURE
            </p>
            <h1>THE CENTRAL BANK</h1>
            <p className="bank-subtitle">OF BAD DECISIONS</p>
          </div>
          <button className="icon-button" aria-label="Close Central Bank">
            <X size={18} />
          </button>
        </header>

        <div className="reserve-card">
          <div className="reserve-ring">
            <div className="reserve-core">
              <span className="reserve-label">BREW TOKEN</span>
              <strong>{isUnlocked ? "47" : "17"}</strong>
              <span className="reserve-available">TOKENS AVAILABLE</span>
            </div>
          </div>
          <div className="reserve-copy">
            <span className="reserve-kicker">BREW TOKEN RESERVE</span>
            <strong>{isUnlocked ? "47" : "17"} TOKENS</strong>
            <span>Offline-friendly balance · atomic vault ledger</span>
            <div className="reserve-ticker">
              <span><ArrowUp size={12} /> 55% WIN</span>
              <span><ArrowDown size={12} /> 45% LOSS</span>
            </div>
          </div>
        </div>

        <div className="shop-toggle">
          <div className="shop-toggle-label">
            <BriefcaseBusiness size={15} />
            <span>BOTTLE LAB / INVENTORY</span>
          </div>
          <div className="shop-toggle-value">
            <strong>2</strong>
            <ChevronUp size={15} />
          </div>
        </div>

        <div className="shop-panel">
          <div className="lab-header">
            <div className="lab-icon"><Activity size={14} /></div>
            <div>
              <strong>BOTTLE LAB</strong>
              <span>RECIPE · ODDS · EFFECT · INVENTORY · REDEMPTION</span>
            </div>
            <b>{isUnlocked ? "47" : "17"} TOKENS</b>
          </div>

          <ShopItem
            title="BANK ACCESS KEY"
            description="Weekday entry requires a key. Buy one for 10 Brew Tokens, then activate it to unlock 12 hours inside the Central Bank."
            icon={<KeyRound size={21} />}
            meta="12H ENTRY"
            value="2 KEYS"
            action="BUY KEY · 10 TOKENS"
          />

          <ShopItem
            title="DAVE RAMSEY DAIQUIRI"
            description="Crack one into the machine before a toss: 45% win odds, 55% loss odds, and a double award if it pays."
            icon={<span className="bottle-glyph">✦</span>}
            meta="45% WIN · 55% LOSS"
            value="LOCKED"
            action="UNLOCK RECIPE · 100 TOKENS"
            accent="cyan"
          />

          <section className={`shop-item phrase-item ${isUnlocked ? "is-unlocked" : ""}`}>
            <button
              className="phrase-header"
              onClick={() => setPhrasePackOpen((value) => !value)}
              aria-expanded={phrasePackOpen}
            >
              <div className="phrase-copy">
                <div className="item-title-row">
                  <strong>NEON GUCCI LOADING PACK</strong>
                  <span className="phrase-pill">{isUnlocked ? (phrasesActive ? "ON" : "OFF") : "10 TOKENS"}</span>
                </div>
                <p>{phrasePackCopy}</p>
                <div className="item-meta">
                  <span>15 LINES · COPY ONLY</span>
                  <span>{isUnlocked ? "TAP TO TOGGLE" : "NEW SHOP ITEM"}</span>
                </div>
              </div>
              {phrasePackOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>

            {phrasePackOpen && (
              <div className="phrase-details">
                <p className="detail-copy">
                  {isUnlocked
                    ? "When on, these lines appear while stock analysis is loading. Turn them off any time; the pack stays yours permanently."
                    : "A tiny luxury purchase for a very specific kind of financial chaos. Unlock once, then decide whether your loading screen gets the unhinged version."}
                </p>
                {isUnlocked ? (
                  <button
                    className={`phrase-toggle ${phrasesActive ? "active" : ""}`}
                    onClick={() => setPhrasesActive((value) => !value)}
                    aria-pressed={phrasesActive}
                  >
                    <div>
                      <strong>{phrasesActive ? "UNHINGED LOADING COPY" : "NORMAL LOADING COPY"}</strong>
                      <span>{phrasesActive ? "The 15-pack is active" : "The 15-pack is resting"}</span>
                    </div>
                    <ToggleRight size={27} />
                  </button>
                ) : (
                  <button className="primary-action">
                    UNLOCK 15 PHRASES · 10 TOKENS
                  </button>
                )}
              </div>
            )}
          </section>

          <ShopItem
            title="SMARTPRO SODA"
            description="Redeem one to make every other bottle half price for 90 seconds. Recipe unlocks and the bank key stay full price."
            icon={<Zap size={19} />}
            meta="90 SEC · 50% SALE"
            value="LOCKED"
            action="UNLOCK RECIPE · 100 TOKENS"
            accent="lime"
          />
        </div>

        <div className="activity-row">
          <div><Moon size={14} /><span>TOKEN ACTIVITY</span></div>
          <span>3 RECENT <ChevronDown size={14} /></span>
        </div>

        <footer className="bank-footer">
          <Sparkles size={13} />
          INSPECTION ONLY · PURCHASES USE THE ATOMIC VAULT LEDGER
        </footer>
      </section>
    </main>
  );
}

function ShopItem({
  title,
  description,
  icon,
  meta,
  value,
  action,
  accent = "gold",
}: {
  title: string;
  description: string;
  icon: ReactNode;
  meta: string;
  value: string;
  action: string;
  accent?: "gold" | "cyan" | "lime";
}) {
  return (
    <section className={`shop-item accent-${accent}`}>
      <div className="shop-item-heading">
        <div className="item-copy">
          <strong>{title}</strong>
          <p>{description}</p>
          <div className="item-meta"><span>{meta}</span><span>NEXT TOSS</span></div>
        </div>
        <div className="item-icon">{icon}</div>
      </div>
      <div className="inventory-line"><span>BOTTLES IN INVENTORY</span><b>{value}</b></div>
      <button className="secondary-action">{action}</button>
    </section>
  );
}