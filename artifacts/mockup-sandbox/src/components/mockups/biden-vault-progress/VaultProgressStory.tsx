import './_group.css';

const QUOTES_VIEWED = 14;
const QUOTE_THRESHOLD = 22;
const QUOTES_REMAINING = QUOTE_THRESHOLD - QUOTES_VIEWED;

function StarPair() {
  return (
    <span className="vault-story-stars" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="m12 2 2.4 6.8L21 6l-2.8 6.6L25 15l-7.2 1.2L19 23l-6.2-4.5L8 24l1.2-7.2L2 18l5-5.8L0 9l7.3-.1L6 2l5.8 4.8z" transform="translate(0 -1) scale(.9)" /></svg>
      <svg viewBox="0 0 24 24"><path d="m12 2 2.4 6.8L21 6l-2.8 6.6L25 15l-7.2 1.2L19 23l-6.2-4.5L8 24l1.2-7.2L2 18l5-5.8L0 9l7.3-.1L6 2l5.8 4.8z" transform="translate(0 -1) scale(.9)" /></svg>
    </span>
  );
}

function VaultDoor() {
  return (
    <div className="vault-story-door-wrap" aria-hidden="true">
      <svg className="vault-story-door" viewBox="0 0 240 240" fill="none">
        <defs>
          <radialGradient id="vault-blue-glow">
            <stop offset="0" stopColor="#168eff" stopOpacity=".35" />
            <stop offset="1" stopColor="#168eff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vault-steel" x1="32" y1="30" x2="204" y2="211" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9ba8b6" />
            <stop offset=".24" stopColor="#303b47" />
            <stop offset=".5" stopColor="#111923" />
            <stop offset=".78" stopColor="#65717c" />
            <stop offset="1" stopColor="#1c2631" />
          </linearGradient>
          <linearGradient id="vault-blue-edge" x1="37" y1="50" x2="163" y2="186" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7bcaff" />
            <stop offset=".54" stopColor="#168eff" />
            <stop offset="1" stopColor="#094a8c" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="119" fill="url(#vault-blue-glow)" />
        <circle cx="120" cy="120" r="103" fill="#07111c" stroke="url(#vault-blue-edge)" strokeWidth="4" />
        <circle cx="120" cy="120" r="94" fill="url(#vault-steel)" stroke="#9ca9b7" strokeWidth="2" />
        <circle cx="120" cy="120" r="82" fill="#111923" stroke="#202d3b" strokeWidth="4" />
        <circle cx="120" cy="120" r="67" fill="url(#vault-steel)" stroke="#8a98a7" strokeWidth="3" />
        <circle cx="120" cy="120" r="53" fill="#111a25" stroke="#293847" strokeWidth="3" />
        <circle cx="120" cy="120" r="22" fill="url(#vault-steel)" stroke="#a2afbd" strokeWidth="3" />
        <circle cx="120" cy="120" r="8" fill="#121c27" stroke="#aebbc8" strokeWidth="2" />
        <path d="M120 67v31m0 44v31m-53-53h31m44 0h31M82.5 82.5l22 22m31 31 22 22m0-75.5-22 22m-31 31-22 22" stroke="#aab6c1" strokeWidth="7" strokeLinecap="round" />
        <path d="M120 67v31m53 22h-31" stroke="#168eff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="120" cy="26" r="4" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
        <circle cx="120" cy="214" r="4" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
        <circle cx="26" cy="120" r="4" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
        <circle cx="214" cy="120" r="4" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
        <circle cx="54" cy="54" r="3.5" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
        <circle cx="186" cy="54" r="3.5" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
        <circle cx="54" cy="186" r="3.5" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
        <circle cx="186" cy="186" r="3.5" fill="#d5e3f0" stroke="#586574" strokeWidth="2" />
      </svg>
    </div>
  );
}

export function VaultProgressStory() {
  return (
    <main className="vault-story" aria-label="Biden quote vault progress story card">
      <header className="vault-story-masthead">
        <span className="vault-story-rule" />
        <StarPair />
        <h1 className="vault-story-heading">VAULT PROGRESS</h1>
        <StarPair />
        <span className="vault-story-rule" />
      </header>

      <p className="vault-story-subtitle">VIEW BIDEN QUOTES. UNLOCK THE VAULT.</p>

      <section className="vault-story-panel">
        <div className="vault-story-panel-inner">
          <div className="vault-story-topline">
            <span>YOUR PROGRESS</span>
            <span className="vault-story-record">
              <span className="vault-story-record-dot" />
              QUOTE LOG ACTIVE
            </span>
          </div>

          <div className="vault-story-hero">
            <div className="vault-story-count-copy">
              <p className="vault-story-eyebrow">BIDEN QUOTES</p>
              <div className="vault-story-countline">
                <span className="vault-story-count">{QUOTES_VIEWED}</span>
                <span className="vault-story-total">/ {QUOTE_THRESHOLD}</span>
              </div>
              <p className="vault-story-viewed">QUOTES VIEWED</p>
            </div>
            <VaultDoor />
          </div>

          <div
            className="vault-story-progress"
            role="progressbar"
            aria-label="Biden quotes viewed"
            aria-valuemin={0}
            aria-valuemax={QUOTE_THRESHOLD}
            aria-valuenow={QUOTES_VIEWED}
          >
            {Array.from({ length: QUOTE_THRESHOLD }, (_, index) => (
              <span
                key={index}
                className={`vault-story-segment${index < QUOTES_VIEWED ? ' is-filled' : ''}`}
              />
            ))}
          </div>

          <div className="vault-story-scale" aria-hidden="true">
            <span>1</span>
            <span className="vault-story-scale-label">{QUOTE_THRESHOLD} QUOTES TO UNLOCK</span>
            <span>{QUOTE_THRESHOLD}</span>
          </div>

          <div className="vault-story-unlock">
            <div className="vault-story-keep-going">
              <span className="vault-story-note-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M8 13h8M8 17h8" />
                </svg>
              </span>
              <div>
                <p className="vault-story-keep-title">KEEP GOING!</p>
                <p className="vault-story-keep-copy">{QUOTES_REMAINING} more quotes to unlock the vault.</p>
              </div>
            </div>
            <span className="vault-story-unlock-divider" />
            <div className="vault-story-locked">
              <span className="vault-story-lock-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                </svg>
              </span>
              <div>
                <p className="vault-story-lock-title">VAULT LOCKED</p>
                <p className="vault-story-lock-copy">View all 22 quotes to unlock.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="vault-story-footer">ALL 22 QUOTES UNLOCK THE VAULT</footer>
    </main>
  );
}