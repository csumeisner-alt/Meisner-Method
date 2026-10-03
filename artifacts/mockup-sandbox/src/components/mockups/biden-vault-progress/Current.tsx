import './_group.css';

export function Current() {
  return (
    <main className="vault-current-stage">
      <section className="vault-current-card" aria-label="Current quote unlock progress">
        <div className="vault-current-heading">
          <div className="vault-current-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="1.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>CENTRAL BANK UNLOCK</span>
          </div>
          <span className="vault-current-count">14/22</span>
        </div>
        <div className="vault-current-copy">View 8 more Biden quotes to unlock the Central Bank.</div>
        <div
          className="vault-current-track"
          role="progressbar"
          aria-label="Biden quotes viewed"
          aria-valuemin={0}
          aria-valuemax={22}
          aria-valuenow={14}
        >
          <div className="vault-current-fill" />
        </div>
      </section>
    </main>
  );
}