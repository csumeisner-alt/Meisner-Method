import './_group.css';

const metrics = [
  { label: 'COMP P/L', value: '−$13,106.08', tone: 'negative' },
  { label: 'RETURN', value: '−13.11%', tone: 'negative' },
  { label: 'BUYING POWER', value: '$98.85', tone: '' },
  { label: 'RANK', value: 'NOT RANKED', tone: 'gold' },
];

export function Current() {
  return (
    <main className="event-summary-preview">
      <section className="event-card current" aria-label="Current Event Arena summary">
        <header className="event-topline">
          <h1 className="event-title">EVENT ARENA · Nov 16–20</h1>
          <button className="event-switch" type="button" aria-label="Switch paper trading account">
            SWITCH
          </button>
        </header>

        <div className="equity-line">
          <span className="equity-label">FINAL EQUITY</span>
          <span className="equity-value">$86,893.92</span>
        </div>

        <div className="metric-grid" aria-label="Event account metrics">
          {metrics.map((metric) => (
            <div className="metric-tile" key={metric.label}>
              <div className="metric-label">{metric.label}</div>
              <div className={`metric-value ${metric.tone}`.trim()}>{metric.value}</div>
            </div>
          ))}
        </div>

        <footer className="event-footer">
          <div className="event-footer-content">
            <div className="event-footer-line">
              <span className="event-status">Event complete</span>
              <span className="participant-count">1 participant</span>
            </div>
            <div className="event-progress" role="progressbar" aria-label="Event schedule progress" aria-valuenow={100}>
              <div className="event-progress-fill" />
            </div>
          </div>
          <button className="leaderboard-button" type="button" aria-label="View Event Arena leaderboard">
            ▥
          </button>
        </footer>

        <div className="account-dots" aria-hidden="true">
          <span className="account-dot" />
          <span className="account-dot" />
          <span className="account-dot" />
          <span className="account-dot active" />
        </div>
      </section>
    </main>
  );
}
