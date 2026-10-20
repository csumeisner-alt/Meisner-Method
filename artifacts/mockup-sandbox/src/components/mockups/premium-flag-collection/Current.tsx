import './_group.css';
import { useState } from 'react';

const FLAGS = [
  { id: 'heritage', name: 'Heritage', canton: '#14284B', red: '#B8323D', white: '#F4F0E5', star: '#F1D28A' },
  { id: 'liberty', name: 'Liberty', canton: '#0E3550', red: '#C43B42', white: '#F8F5EF', star: '#F7E6B5' },
  { id: 'founders', name: 'Founders', canton: '#24364A', red: '#9F3A3F', white: '#E8DFC8', star: '#D8B568' },
  { id: 'midnight', name: 'Midnight', canton: '#111D36', red: '#8D2E3D', white: '#D9DDE4', star: '#D8BE83' },
  { id: 'eagle', name: 'Eagle', canton: '#172D4E', red: '#B5443F', white: '#FFF9EB', star: '#E8C66F' },
] as const;

const FLAG_SHAPE = 'M1 5 C18 0 31 9 48 5 C66 0 81 8 99 3 L99 58 C81 62 65 54 48 59 C30 64 16 55 1 60 Z';
const ROWS = Array.from({ length: 9 }, (_, row) => ({
  y: 3.5 + row * 3.7,
  count: row % 2 === 0 ? 6 : 5,
}));

function FlagArt({ flag }: { flag: (typeof FLAGS)[number] }) {
  const clipId = `clip-${flag.id}`;
  const sheenId = `sheen-${flag.id}`;
  return (
    <div className="flag-frame" aria-label={`${flag.name} premium American flag`}>
      <svg viewBox="0 0 100 64" role="img" aria-label={`${flag.name} American flag`}>
        <defs>
          <clipPath id={clipId}><path d={FLAG_SHAPE} /></clipPath>
          <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".48" />
            <stop offset=".32" stopColor="#fff" stopOpacity=".06" />
            <stop offset=".7" stopColor="#000" stopOpacity=".02" />
            <stop offset="1" stopColor="#fff" stopOpacity=".28" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {Array.from({ length: 13 }, (_, stripe) => (
            <rect
              key={`stripe-${stripe}`}
              x="0"
              y={stripe * (64 / 13)}
              width="100"
              height={(64 / 13) + 0.2}
              fill={stripe % 2 === 0 ? flag.red : flag.white}
            />
          ))}
          <rect x="0" y="0" width="43" height="35" fill={flag.canton} />
          {ROWS.map((row, rowIndex) =>
            Array.from({ length: row.count }, (_, column) => (
              <circle
                key={`star-${rowIndex}-${column}`}
                cx={row.count === 6 ? 3.8 + column * 7.1 : 7.35 + column * 7.1}
                cy={row.y}
                r=".9"
                fill={flag.star}
              />
            )),
          )}
          <rect x="0" y="0" width="100" height="64" fill={`url(#${sheenId})`} />
        </g>
        <path d={FLAG_SHAPE} fill="none" stroke="#D6AD54" strokeOpacity=".9" strokeWidth="1.7" />
        <path d="M3 7 C17 3 31 11 47 7" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="1" />
      </svg>
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
            <p className="eyebrow">YOUR TITLE BADGE</p>
            <h1>Choose your American flag</h1>
            <p className="intro">Five premium finishes. Pick the one that waves beside your title.</p>
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
                className={`flag-card${active ? ' selected' : ''}`}
                onClick={() => setSelected(flag.id)}
                aria-pressed={active}
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
          <span>Unlocked by earning all 15 achievements</span>
          <span className="footnote-rule" />
          <span>Selection is saved on this device</span>
        </footer>
      </section>
    </main>
  );
}
