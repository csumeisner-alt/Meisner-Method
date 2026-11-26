import './_group.css';

type IconName = 'back' | 'bolt' | 'activity' | 'refresh' | 'clock' | 'arrow' | 'shield' | 'search' | 'star' | 'briefcase' | 'arena';

function Icon({ name, className }: { name: IconName; className?: string }) {
  const shared = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (name) {
    case 'back':
      return <svg {...shared}><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></svg>;
    case 'bolt':
      return <svg {...shared}><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" fill="currentColor" stroke="none" /></svg>;
    case 'activity':
      return <svg {...shared}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
    case 'refresh':
      return <svg {...shared}><path d="M20 7v5h-5" /><path d="M4.9 9A8 8 0 0 1 18.3 6L20 8" /><path d="M4 17v-5h5" /><path d="M19.1 15A8 8 0 0 1 5.7 18L4 16" /></svg>;
    case 'clock':
      return <svg {...shared}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'arrow':
      return <svg {...shared}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>;
    case 'shield':
      return <svg {...shared}><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'search':
      return <svg {...shared}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
    case 'star':
      return <svg {...shared}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
    case 'briefcase':
      return <svg {...shared}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2" /></svg>;
    case 'arena':
      return <svg {...shared}><path d="M12 3 14.3 8l5.4.8-3.9 3.8.9 5.4-4.7-2.5-4.7 2.5.9-5.4-3.9-3.8L9.7 8 12 3Z" /><path d="M5 21h14" /></svg>;
  }
}

const sectionTabs = [
  { label: 'Competition', image: 'neon-gucci-competition.png', selected: true },
  { label: 'Leaderboard', image: 'neon-gucci-leaderboard.png', selected: false },
  { label: 'My Trades', image: 'neon-gucci-trades.png', selected: false },
  { label: 'Past Events', image: 'neon-gucci-past.png', selected: false },
];

const mainNavigation = [
  { label: 'ANALYZE', icon: 'search' as const },
  { label: 'TOP PICKS', icon: 'star' as const },
  { label: 'PAPER', icon: 'activity' as const },
  { label: 'PORTFOLIO', icon: 'briefcase' as const },
  { label: 'EVENT ARENA', icon: 'arena' as const, active: true },
];

function BottomNavigation() {
  return (
    <nav className="ng-bottom-nav" aria-label="Main app navigation">
      {mainNavigation.map((item, index) => (
        <div className={`ng-nav-item${item.active ? ' is-active' : ''}`} key={item.label} aria-current={item.active ? 'page' : undefined}>
          {item.active ? <span className="ng-arena-emblem"><Icon name={item.icon} /></span> : <Icon name={item.icon} />}
          <span className="ng-nav-label">{item.label}</span>
          {index < mainNavigation.length - 1 && <span className="ng-nav-divider" aria-hidden="true" />}
        </div>
      ))}
      <span className="ng-home-indicator" aria-hidden="true" />
    </nav>
  );
}

export function MainEventArea() {
  return (
    <div className="ng-arena" aria-label="Meisner Method Event Arena Competition hub">
      <div className="ng-status" aria-label="Phone status bar">
        <span>9:41</span>
        <span className="ng-status-right">
          <i className="ng-signal" />
          <i className="ng-wifi" />
          <i className="ng-battery" />
        </span>
      </div>

      <header className="ng-header">
        <div className="ng-header-row">
          <span className="ng-back" aria-label="Go back"><Icon name="back" /></span>
          <div className="ng-title-block">
            <h1 className="ng-title">Event Arena</h1>
            <p className="ng-subtitle">Competition hub</p>
          </div>
          <aside className="ng-lightning" aria-label="Lightning Round invitation">
            <Icon name="bolt" className="ng-bolt" />
            <span className="ng-lightning-copy">
              <strong className="ng-lightning-title">LIGHTNING ROUND</strong>
              <span className="ng-lightning-sub">24-HOUR CHAMPIONSHIP</span>
              <span className="ng-invite">VIEW INVITATION ↗</span>
            </span>
          </aside>
        </div>
        <nav className="ng-tabs" aria-label="Event Arena sections">
          {sectionTabs.map((tab) => (
            <div className={`ng-tab${tab.selected ? ' is-selected' : ''}`} key={tab.label} aria-label={tab.label} aria-current={tab.selected ? 'page' : undefined}>
              <img
                src={`/__mockup/images/neon-gucci-event-arena/${tab.image}`}
                alt=""
                aria-hidden="true"
              />
            </div>
          ))}
        </nav>
      </header>

      <main className="ng-content">
        <div className="ng-overview-topline">
          <span className="ng-mark"><Icon name="activity" /></span>
          <span className="ng-overview-kicker">MEISNER METHOD / EVENT ARENA</span>
          <span className="ng-refresh" aria-label="Refresh event overview"><Icon name="refresh" /></span>
        </div>

        <section className="ng-event-card" aria-labelledby="ng-event-title">
          <div className="ng-card-status">
            <span className="ng-phase-dot" />
            <span>UPCOMING EVENT</span>
            <span className="ng-event-id">SAMPLE · EA-042</span>
          </div>

          <h2 className="ng-event-heading" id="ng-event-title">Week of Mar 16</h2>

          <div className="ng-capital-band">
            <span className="ng-capital-mark" />
            <span className="ng-capital-copy">
              <span className="ng-capital-label">FRESH EVENT ACCOUNT</span>
              <strong className="ng-capital-value">$100,000.00</strong>
            </span>
            <span className="ng-capital-suffix">STARTING<br />CAPITAL</span>
          </div>

          <p className="ng-event-copy"><strong>Entry is open.</strong> Join with a fresh, isolated paper account. Your other strategies and balances stay untouched.</p>

          <div className="ng-countdown">
            <div className="ng-countdown-head">
              <span>ILLUSTRATIVE START COUNTDOWN</span>
              <Icon name="clock" />
            </div>
            <div className="ng-countdown-grid" aria-label="Illustrative countdown sample">
              {[
                ['03', 'DAYS'],
                ['08', 'HOURS'],
                ['24', 'MINUTES'],
                ['16', 'SECONDS'],
              ].map(([value, label]) => (
                <span className="ng-count-unit" key={label}>
                  <strong className="ng-count-value">{value}</strong>
                  <span className="ng-count-label">{label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="ng-dates">
            <div>
              <span className="ng-date-label">OPENS · SAMPLE</span>
              <strong className="ng-date-value">Mon, Mar 16 · 9:30 AM</strong>
            </div>
            <span className="ng-date-divider" />
            <div>
              <span className="ng-date-label">CLOSES · SAMPLE</span>
              <strong className="ng-date-value">Fri, Mar 20 · 4:00 PM</strong>
            </div>
          </div>

          <button className="ng-join" type="button">
            Join Event Arena <Icon name="arrow" />
          </button>
          <p className="ng-disclaimer">ALL EVENT DETAILS SHOWN ARE ILLUSTRATIVE SAMPLE DATA</p>
        </section>

        <aside className="ng-personal-note">
          <span className="ng-note-icon"><Icon name="shield" /></span>
          <span>
            <strong className="ng-note-title">Your competition stays personal</strong>
            <p className="ng-note-copy">Each entry uses a dedicated paper account. Your other strategies stay untouched.</p>
          </span>
        </aside>
      </main>

      <BottomNavigation />
    </div>
  );
}
