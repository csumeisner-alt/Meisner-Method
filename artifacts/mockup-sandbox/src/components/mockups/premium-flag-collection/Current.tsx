import './_group.css';
import { useState } from 'react';

const FLAGS = [
  { id: 'default', name: 'Default U.S. flag', image: null, locked: false },
  { id: 'heritage', name: 'Gadsden', image: '/__mockup/images/premium-flags/gadsden.png', locked: false },
  { id: 'liberty', name: 'Liberty & Eagle', image: '/__mockup/images/premium-flags/liberty-eagle.jpg', locked: false },
  { id: 'founders', name: 'Betsy Ross', image: '/__mockup/images/premium-flags/betsy-ross.jpg', locked: false },
  { id: 'midnight', name: 'Red Union', image: '/__mockup/images/premium-flags/red-union.jpg', locked: false },
  { id: 'southern-cross', name: 'Southern Cross', image: '/__mockup/images/premium-flags/southern-cross.jpg', locked: false },
  { id: 'eagle', name: 'Pride', image: '/__mockup/images/premium-flags/pride.jpg', locked: true },
] as const;

function FlagArt({ flag }: { flag: (typeof FLAGS)[number] }) {
  return (
    <div className="flag-frame" role="img" aria-label={`${flag.name} flag waving in the wind`}>
      {flag.image
        ? <img className="flag-artwork" src={flag.image} alt="" />
        : <div className="default-flag-art">🇺🇸</div>}
      {flag.locked && <div className="flag-lock"><span>🔒</span><small>0 / 22 Biden quotes</small></div>}
    </div>
  );
}

export function Current() {
  const [selected, setSelected] = useState<(typeof FLAGS)[number]['id']>('heritage');
  const selectedFlag = FLAGS.find((flag) => flag.id === selected) ?? FLAGS[0];

  return (
    <main className="showcase">
      <header className="topbar">
        <div className="wordmark">
          <span className="monogram">MM</span>
          <div>
            <div className="brand-title">
              MEISNER METHOD
              <span className="header-flag"><FlagArt flag={selectedFlag} /></span>
            </div>
            <div className="brand-subtitle">15 OF 15 ACHIEVEMENTS · PREMIUM BADGE UNLOCKED</div>
          </div>
        </div>
        <div className="unlock-pill"><span className="gold-dot" /> COLLECTION COMPLETE</div>
      </header>

      <section className="collection">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DEFAULT + SIX FLAG DESIGNS · ONE SELECTED TITLE BADGE</p>
            <h1>Flags that move like cloth</h1>
            <p className="intro">15 achievements unlock the default and five flags. Pride unlocks after 22 Biden quotes.</p>
          </div>
          <div className="selection-note">
            <span className="note-label">CURRENT SELECTION</span>
            <strong>{selectedFlag.name}</strong>
          </div>
        </div>

        <div className="flag-grid">
          {FLAGS.map((flag, index) => {
            const active = selected === flag.id;
            return (
              <button
                key={flag.id}
                type="button"
                className={`flag-card${active ? ' selected' : ''}${flag.locked ? ' locked' : ''}`}
                onClick={() => !flag.locked && setSelected(flag.id)}
                aria-pressed={active}
                aria-disabled={flag.locked}
                aria-label={`Select the ${flag.name} flag`}
              >
                <div className="card-topline">
                  <span className="flag-number">0{index + 1}</span>
                  {active && <span className="selected-label">SELECTED</span>}
                </div>
                <div className="flag-stage"><FlagArt flag={flag} /></div>
                <div className="card-bottom">
                  <span className="flag-name">{flag.name}</span>
                  <span className={`radio${active ? ' checked' : ''}`}>{active ? '✓' : ''}</span>
                </div>
              </button>
            );
          })}
        </div>

        <footer className="footnote">
          <span className="footnote-mark">✦</span>
          <span>Default + five flags after 15 achievements</span>
          <span className="footnote-rule" />
          <span>Pride unlocks at 22 Biden quotes</span>
        </footer>
      </section>
    </main>
  );
}
