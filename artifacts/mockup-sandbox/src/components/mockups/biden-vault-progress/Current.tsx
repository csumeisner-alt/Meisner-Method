import './_group.css';

export function Current() {
  return (
    <main className="vault-current-stage">
      <section className="vault-current-card" aria-label="Biden quote vault progress preview">
        <div className="vault-current-heading">
          <div className="vault-current-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="1.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>VAULT PROGRESS</span>
          </div>
        </div>
        <div className="vault-current-hero">
          <div className="vault-current-count-copy">
            <span className="vault-current-eyebrow">QUOTE VIEWS</span>
            <span className="vault-current-count"><strong>14</strong> / 22</span>
          </div>
          <svg className="vault-current-emblem" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="#171e27" stroke="#168eff" strokeWidth="3" />
            <circle cx="50" cy="50" r="37" fill="#080d15" stroke="#536170" strokeWidth="3" />
            <circle cx="50" cy="50" r="25" fill="#171e27" stroke="#315e8a" strokeWidth="3" />
            <circle cx="50" cy="50" r="8" fill="#168eff" />
            <path d="M50 25V9M50 75v16M25 50H9m66 0h16M32 32 21 21m47 47 11 11M68 32l11-11M32 68 21 79" stroke="#536170" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
        <div
          className="vault-current-meter"
          role="progressbar"
          aria-label="Biden quote view progress"
          aria-valuemin={0}
          aria-valuemax={22}
          aria-valuenow={14}
          aria-valuetext="14 of 22 quote views, 8 more to unlock"
        >
          {Array.from({ length: 22 }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`vault-current-segment${index < 14 ? ' is-filled' : ''}`}
            />
          ))}
        </div>
        <div className="vault-current-remaining">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="5" y="10" width="14" height="11" rx="1.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span>8 MORE QUOTE VIEWS TO UNLOCK</span>
        </div>
      </section>
    </main>
  );
}