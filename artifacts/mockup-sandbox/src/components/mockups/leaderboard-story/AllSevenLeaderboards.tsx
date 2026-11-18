import React from 'react';

type EventConfig = {
  artwork: string;
  name: string;
  subtitle: string;
  capital: string;
  accent: string;
  dateRange?: string;
  startLabel?: string;
  rankRule?: string;
  objective?: string;
  pennyMayhem?: boolean;
  oneStockChallenge?: boolean;
};

const events: EventConfig[] = [
  {
    artwork: 'event-arena-stadium',
    name: 'Event Arena Championship',
    subtitle: 'Championship Standings',
    capital: '$100,000',
    accent: '#e8c45e',
  },
  {
    artwork: 'event-arena-neon-nightclub',
    name: 'Event Arena Championship',
    subtitle: 'Championship Standings',
    capital: '$100,000',
    accent: '#d5a9ff',
  },
  {
    artwork: 'event-arena-mountain-summit',
    name: 'Event Arena Championship',
    subtitle: 'Championship Standings',
    capital: '$100,000',
    accent: '#e8c45e',
  },
  {
    artwork: 'event-arena-red-showdown',
    name: 'Bear Market Mayhem',
    subtitle: 'The Biggest Loser Wins',
    capital: '$100,000',
    accent: '#ff7378',
    rankRule: 'LOWEST PERCENTAGE RETURN RANKS FIRST',
  },
  {
    artwork: 'event-arena-green-stock-exchange',
    name: 'Green Bull Championship',
    subtitle: 'Championship Standings',
    capital: '$500,000',
    accent: '#a6e28a',
  },
  {
    artwork: 'event-arena-penny-stock-mayhem-premium',
    name: 'Penny Stock Mayhem',
    subtitle: 'Stocks & ETFs Under $20',
    capital: '$100,000',
    accent: '#b2ed7c',
    objective: 'STOCKS & ETFs UNDER $20',
    pennyMayhem: true,
  },
  {
    artwork: 'event-arena-one-stock-challenge',
    name: 'The One-Stock Challenge',
    subtitle: 'One Stock · One Open Position',
    capital: '$100,000',
    accent: '#e8c45e',
    objective: 'ONE PARTICIPANT. ONE STOCK. ONE OPEN POSITION.',
    dateRange: 'Feb 8, 2027 – Feb 12, 2027',
    startLabel: 'Feb 8, 2027',
    oneStockChallenge: true,
  },
  {
    artwork: 'lightning-round-arena-clean',
    name: 'Lightning Round',
    subtitle: 'Lightning Round',
    capital: '$100,000',
    accent: '#8dc8ff',
  },
];

function Glyph({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>,
    bolt: <path d="m13 2-3 8h6l-5 12 2-9H7z" />,
    award: <><circle cx="12" cy="8" r="5" /><path d="m8.5 12-1 9 4.5-2.5 4.5 2.5-1-9" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    archive: <><path d="M3 4h18v5H3z" /><path d="M5 9v11h14V9M10 13h4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function PodiumMedal({ accent }: { accent: string }) {
  return (
    <div className="mm-medal" style={{ '--event-accent': accent } as React.CSSProperties}>
      <span className="mm-medal-ring" />
      <span className="mm-cup"><Glyph name="star" size={25} /></span>
      <span className="mm-stem" />
      <span className="mm-base mm-base-one" />
      <span className="mm-base mm-base-two" />
    </div>
  );
}

function PennyTrophy() {
  return (
    <svg width="96" height="96" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="ptGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7A5A1E"/><stop offset=".22" stopColor="#E9CB7A"/><stop offset=".4" stopColor="#FFF3C8"/><stop offset=".6" stopColor="#C99A3F"/><stop offset=".85" stopColor="#8E6A26"/><stop offset="1" stopColor="#D9B762"/></linearGradient>
        <linearGradient id="ptPlinth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2C3A33"/><stop offset="1" stopColor="#0D1612"/></linearGradient>
        <linearGradient id="ptEm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0E5A35"/><stop offset=".5" stopColor="#3FCB84"/><stop offset="1" stopColor="#0E5A35"/></linearGradient>
      </defs>
      <ellipse cx="50" cy="93" rx="30" ry="3" fill="#000" opacity=".35"/>
      <path d="M27 20 C12 20 12 44 33 47" stroke="url(#ptGold)" strokeWidth="4" fill="none" strokeLinecap="round"/>
      <path d="M73 20 C88 20 88 44 67 47" stroke="url(#ptGold)" strokeWidth="4" fill="none" strokeLinecap="round"/>
      <path d="M25 12 H75 V22 C75 41 64 53 50 54 C36 53 25 41 25 22 Z" fill="url(#ptGold)" stroke="#6A4C16" strokeWidth=".8"/>
      <ellipse cx="50" cy="12" rx="25" ry="3.2" fill="#FFF0BE" stroke="#8E6A26" strokeWidth=".6"/>
      <path d="M33 18 C33 34 38 44 44 48" stroke="#fff" strokeOpacity=".55" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <rect x="27" y="25" width="46" height="2.4" fill="url(#ptEm)" opacity=".9"/>
      <path d="M46 54 H54 L53 66 H47 Z" fill="url(#ptGold)"/>
      <ellipse cx="50" cy="60" rx="6.5" ry="2.4" fill="url(#ptGold)" stroke="#6A4C16" strokeWidth=".5"/>
      <path d="M38 66 H62 L65 72 H35 Z" fill="url(#ptGold)" stroke="#6A4C16" strokeWidth=".5"/>
      <rect x="30" y="72" width="40" height="18" rx="1.5" fill="url(#ptPlinth)" stroke="#C99A3F" strokeWidth=".8"/>
      <rect x="30" y="78.5" width="40" height="1.6" fill="url(#ptEm)"/>
    </svg>
  );
}

function PhoneScreen({ event, index }: { event: EventConfig; index: number }) {
  const bear = index === 3;
  return (
    <article className="mm-phone-wrap" aria-label={`${event.name} leaderboard phone screen`}>
      <div className="mm-phone">
        <div className="mm-statusbar"><span>9:41</span><span className="mm-status-icons"><i /><i /><i /></span></div>
        <header className="mm-header">
          <div className="mm-topline">
            <span className="mm-back"><Glyph name="back" size={22} /></span>
            <div className="mm-app-title"><strong>Event Arena</strong><span>Competition hub</span></div>
            <div className="mm-alias"><span className="mm-bolt"><Glyph name="bolt" size={19} /></span><b>Squidward</b><span className="mm-alias-mark"><Glyph name="star" size={10} /></span></div>
          </div>
          <nav className="mm-tabs" aria-label="Event Arena sections">
            {[
              ['award', 'Competition'],
              ['users', 'Leaderboard'],
              ['activity', 'My Trades'],
              ['archive', 'Past Events'],
            ].map(([icon, label], tab) => (
              <div className={`mm-tab ${tab === 1 ? 'selected' : ''}`} key={label}>
                <Glyph name={icon} size={19} /><span>{label}</span>
              </div>
            ))}
          </nav>
        </header>

        <main className="mm-screen-scroll">
          <section className={`mm-event-hero ${event.pennyMayhem ? 'mm-penny-hero' : ''} ${event.oneStockChallenge ? 'mm-one-stock-hero' : ''}`} style={{ '--event-accent': event.accent, backgroundImage: event.oneStockChallenge
            ? 'linear-gradient(160deg, #07141d, #0b2028)'
            : event.pennyMayhem
              ? 'radial-gradient(120% 60% at 50% 0%, #10241a 0%, #07110d 60%)'
              : `linear-gradient(180deg, rgba(4,8,14,.49), rgba(5,9,15,.82) 34%, rgba(5,9,15,.88)), url("/__mockup/images/leaderboard-events/${event.artwork}.jpg")` } as React.CSSProperties}>
            <div className="mm-actions"><span><Glyph name="refresh" size={16} /></span><span><Glyph name="info" size={16} /></span></div>
            <div className="mm-event-title">
              {event.oneStockChallenge ? (
                <div className="mm-one-stock-lockup">
                  <img
                    className="mm-one-stock-art"
                    src={`/__mockup/images/leaderboard-events/${event.artwork}.jpg`}
                    alt="The One-Stock Challenge artwork with a chess piece between a bull and bear"
                  />
                  <p>{event.objective}</p>
                </div>
              ) : event.pennyMayhem ? (
                <div className="mm-penny-lockup" aria-label="Penny Stock Mayhem. Stocks and ETFs under $20.">
                  <svg className="mm-penny-svg" viewBox="0 0 300 152" role="img" aria-label="Penny Stock Mayhem">
                    <defs>
                      <linearGradient id="pmPlat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FBFCFD"/><stop offset=".3" stopColor="#D9E0E4"/><stop offset=".48" stopColor="#7F8B94"/><stop offset=".53" stopColor="#E9EEF1"/><stop offset=".78" stopColor="#A4AFB7"/><stop offset="1" stopColor="#ECF0F2"/></linearGradient>
                      <linearGradient id="pmCrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF9AA0"/><stop offset=".22" stopColor="#F2323F"/><stop offset=".5" stopColor="#B10C1C"/><stop offset=".56" stopColor="#E92636"/><stop offset=".85" stopColor="#7E0713"/><stop offset="1" stopColor="#C81C2B"/></linearGradient>
                    </defs>
                    <g fontFamily="'Oswald','DM Sans',sans-serif" fontWeight="700" textAnchor="middle">
                      <text x="151" y="57" fontSize="60" textLength="290" lengthAdjust="spacingAndGlyphs" fill="#0B1114" opacity=".55">PENNY STOCK</text>
                      <text x="150" y="55" fontSize="60" textLength="290" lengthAdjust="spacingAndGlyphs" fill="url(#pmPlat)" stroke="#5E6A72" strokeWidth=".6">PENNY STOCK</text>
                      <text x="151" y="148" fontSize="94" textLength="290" lengthAdjust="spacingAndGlyphs" fill="#14040A" opacity=".6">MAYHEM</text>
                      <text x="150" y="146" fontSize="94" textLength="290" lengthAdjust="spacingAndGlyphs" fill="url(#pmCrim)" stroke="#FF8A92" strokeOpacity=".35" strokeWidth=".7">MAYHEM</text>
                    </g>
                  </svg>
                  <div className="mm-penny-banner" aria-label="Stocks and ETFs under $20">
                    <i className="r1"/><i className="r2"/><i className="r3"/><i className="r4"/>
                    <span>STOCKS &amp; ETFs UNDER</span>
                    <strong>$20</strong>
                  </div>
                  <img className="mm-penny-art" src={`/__mockup/images/leaderboard-events/${event.artwork}.jpg`} alt="Charging bull with copper pennies in a green championship arena" />
                </div>
              ) : (
                <>
                  <p className="mm-event-name">{event.name}</p>
                  {event.objective && <p className="mm-event-objective">{event.objective}</p>}
                </>
              )}
              <p className="mm-capital">{event.capital} STARTING CAPITAL</p>
              {!event.pennyMayhem && <h1>{event.subtitle}</h1>}
              {event.rankRule && <p className="mm-rank-rule">{event.rankRule}</p>}
              <div className="mm-upcoming"><i /> UPCOMING COMPETITION</div>
                <div className="mm-countdown"><small>COUNTDOWN TO START</small><strong>{event.startLabel ? `Starts ${event.startLabel}` : 'Starts in 18h 15m'}</strong></div>
              <div className="mm-event-meta">
                <span><Glyph name="calendar" size={13} /> {event.dateRange ?? 'Nov 16, 2026 – Nov 20, 2026'}</span>
                <span><Glyph name="users" size={14} /> <b>1</b> competitor</span>
              </div>
              <p className="mm-disclaimer">SELF-REPORTED · NOT INDEPENDENTLY VERIFIED · Updated Nov 15, 2:15 PM</p>
            </div>

            <div className="mm-podium-heading"><b>The podium</b><span>TOP THREE</span></div>
            <div className={`mm-winner ${bear ? 'bear' : ''}`}>
              {event.pennyMayhem ? <PennyTrophy /> : <PodiumMedal accent={event.accent} />}
              <small>RANK 1 OF 1</small>
              <div className="mm-winner-name">Squidward <span className="mm-alias-mark"><Glyph name="star" size={12} /></span> <em>YOU</em></div>
              <label>COMPETITION RETURN</label>
              <strong className="mm-return">+0.00%</strong>
              <div className="mm-equity">
                <div><span>CURRENT EQUITY</span><b>{event.capital}.00</b></div>
                <div><span>DOLLAR P/L</span><b>+$0.00</b></div>
              </div>
            {event.oneStockChallenge && (
              <div className="mm-one-stock-holding">
                <div><span>OPEN HOLDING</span><b>AAPL</b><small>Position $18,420.00</small></div>
                <div><span>REMAINING CASH</span><b>$81,580.00</b></div>
              </div>
            )}
            </div>
            <div className="mm-empty-podium">
              <div><b>#2</b><span className="mm-person-add">＋</span><span>Compete for second</span></div>
              <div><b>#3</b><span className="mm-person-add">＋</span><span>Compete for third</span></div>
            </div>
          </section>

          <section className="mm-position">
            <div className="mm-position-heading"><span className="mm-position-medal"><Glyph name="award" size={20} /></span><b>YOUR POSITION</b><strong>{bear ? 'ANTI-CHAMPION' : 'CHAMPION'}</strong></div>
            <div className="mm-position-rank"><b>#1</b><strong>Squidward <span className="mm-alias-mark"><Glyph name="star" size={12} /></span></strong></div>
            <div className="mm-position-stats"><span>RETURN <b>+0.00%</b></span><span>EQUITY <b>{event.capital}.00</b></span><span>P/L <b>+$0.00</b></span></div>
          </section>
          <div className="mm-footnote">Your score is self-reported and not independently verified.</div>
        </main>

        <footer className="mm-bottom-nav">
          {[
            ['search', 'ANALYZE'],
            ['star', 'TOP PICKS'],
            ['activity', 'PAPER'],
            ['briefcase', 'PORTFOLIO'],
            ['award', 'EVENT ARENA'],
          ].map(([icon, label], nav) => (
            <div className={`mm-nav-item ${nav === 4 ? 'active' : ''}`} key={label}>
              <Glyph name={icon} size={21} /><span>{label}</span>{nav === 4 && <i />}
            </div>
          ))}
        </footer>
        <div className="mm-homebar"><span /></div>
      </div>
      <div className="mm-caption"><span>{String(index + 1).padStart(2, '0')}</span><b>{event.name}</b><small>{event.artwork.replace('event-arena-', '').replaceAll('-', ' ')}</small></div>
    </article>
  );
}

export function AllSevenLeaderboards({ onlyPenny = false }: { onlyPenny?: boolean } = {}) {
  const visibleEvents = onlyPenny ? events.filter((event) => event.pennyMayhem) : events;
  return (
    <div className="mm-gallery">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=DM+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        .mm-gallery { min-height: 100dvh; padding: 36px 24px 58px; color: #f3f0e8; background: #111318; font-family: 'DM Sans', sans-serif; }
        .mm-gallery-intro { max-width: 1240px; margin: 0 auto 28px; display:flex; align-items:end; justify-content:space-between; gap:20px; }
        .mm-gallery-intro p { margin:0 0 7px; color:#c9ad61; font:700 10px 'Space Mono',monospace; letter-spacing:1.7px; }
        .mm-gallery-intro h2 { margin:0; font-size:clamp(22px,3vw,32px); letter-spacing:-1.15px; }
        .mm-gallery-intro span { color:#9a9ba0; font:11px 'Space Mono',monospace; text-align:right; }
        .mm-gallery-grid { max-width:1240px; margin:auto; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),390px)); justify-content:center; align-items:start; gap:34px 30px; }
        .mm-phone-wrap { width:100%; max-width:390px; margin:auto; }
        .mm-phone { height:844px; width:100%; overflow:hidden; position:relative; display:flex; flex-direction:column; border:7px solid #27292e; border-radius:38px; background:#111419; box-shadow:0 18px 50px #0008, inset 0 0 0 1px #55585e; }
        .mm-statusbar { height:24px; flex:none; padding:5px 18px 0; background:#111419; color:#f1f1f3; display:flex; justify-content:space-between; font:600 10px 'DM Sans',sans-serif; }
        .mm-status-icons { display:flex; gap:3px; align-items:center; }.mm-status-icons i { display:block; width:11px;height:7px;border:1.3px solid #eee;border-radius:2px; }.mm-status-icons i:nth-child(2){width:8px;height:8px;border-radius:50%;}.mm-status-icons i:nth-child(3){width:14px;height:7px;border-radius:2px; }
        .mm-header { flex:none; position:relative; z-index:2; padding:4px 10px 7px; background:#111419; border-bottom:1px solid #34363c; }
        .mm-topline { height:49px; display:flex; align-items:center; gap:11px; padding:0 5px; }
        .mm-back { width:27px; color:#e3e4e7; display:flex; }
        .mm-app-title { display:flex; flex-direction:column; flex:1; line-height:1.18; min-width:0; }
        .mm-app-title strong { font-size:18px; font-weight:800; letter-spacing:-.5px; }.mm-app-title span{font-size:11px;color:#a7a8ae;margin-top:3px;}
        .mm-alias { display:flex; align-items:center; gap:6px; color:#d9bc6d; font-size:11px; white-space:nowrap; }
        .mm-bolt { width:39px;height:39px;border:1px solid #44464d;border-radius:12px;background:#1b1e23;display:grid;place-items:center;color:#e7c362;margin-right:2px; }
        .mm-alias-mark { font-size:11px; color:#e68ac3; }
        .mm-tabs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; padding-top:4px; }
        .mm-tab { height:58px; border-radius:12px; background:#1c1f25; border:1px solid #383b43; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; color:#a7aab1; }
        .mm-tab span { color:#e5e5e7; font-size:10px; font-weight:600; white-space:nowrap; }
        .mm-tab.selected { background:#dfb956; border-color:#e6c771; color:#272318; }.mm-tab.selected span { color:#28251d; }
        .mm-screen-scroll { flex:1; min-height:0; overflow:auto; scrollbar-width:none; background:#111419; }.mm-screen-scroll::-webkit-scrollbar{display:none;}
        .mm-event-hero { position:relative; overflow:hidden; min-height:0; margin:0 0 14px; padding:12px 17px 15px; background-size:cover; background-position:center; border:1px solid color-mix(in srgb,var(--event-accent) 43%,transparent); border-radius:0 0 26px 26px; box-shadow:inset 0 -28px 50px #04070c88; }
         .mm-penny-hero { background-color:#07110d; border-color:#9ab76b91; box-shadow:inset 0 -34px 62px #030907c9, inset 0 0 48px #5a9d4b18; }
         .mm-penny-lockup { width:100%;margin:2px auto 12px; }
         .mm-penny-svg { display:block;width:100%;height:auto;filter:drop-shadow(0 6px 8px #000a); }
         .mm-penny-banner { position:relative;margin-top:9px;padding:9px 16px 8px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:4px;border:1.5px solid #2fa56abf;outline:2px solid #0a2418;background:repeating-linear-gradient(180deg,#ffffff1f 0 1px,transparent 1px 3px),linear-gradient(100deg,#ffffff00 20%,#ffffff45 38%,#ffffff00 50%),linear-gradient(180deg,#e7ecea,#a9b3af 45%,#8d9894 55%,#c9d1cd);box-shadow:inset 0 1px #fff,inset 0 -1px #4c5753,0 6px 14px #0009; }
         .mm-penny-banner i { position:absolute;width:5px;height:5px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f1f4f2,#6e7975 70%); }.mm-penny-banner .r1{top:4px;left:4px}.mm-penny-banner .r2{top:4px;right:4px}.mm-penny-banner .r3{bottom:4px;left:4px}.mm-penny-banner .r4{bottom:4px;right:4px}
         .mm-penny-banner span { color:#141c19;font:800 14px 'DM Sans',sans-serif;letter-spacing:.6px;text-shadow:0 1px 0 #ffffffb0; }
         .mm-penny-banner strong { padding-left:12px;border-left:1px solid #5f6a66;box-shadow:-1px 0 #ffffffb0;color:#0f1714;font:800 40px/1 'DM Sans',sans-serif;letter-spacing:-1px;text-shadow:0 1px 0 #ffffffb0,0 0 1px #0e5a35; }
         .mm-penny-art { display:block;width:100%;aspect-ratio:1;object-fit:contain;margin-top:10px;border-radius:14px; }
         .mm-penny-hero .mm-capital { color:#f5d987;font-size:10px;letter-spacing:.75px;text-shadow:0 2px 7px #000; }
         .mm-penny-hero .mm-upcoming,.mm-penny-hero .mm-countdown,.mm-penny-hero .mm-event-meta span { background:#07110edb;border-color:#ffffff35;backdrop-filter:blur(8px); }
         .mm-penny-hero .mm-countdown { box-shadow:0 0 22px #75d66320; }
         .mm-penny-hero .mm-winner:not(.bear) { border-color:#d9bd68;background:linear-gradient(145deg,#a7d65b25,#153626ed 48%,#0a1512f2);box-shadow:0 7px 22px #000a,0 0 25px #5dd27624,inset 0 1px #ffe8a353; }
         .mm-penny-hero .mm-empty-podium div { border-color:#a8c99550;background:#08140fbd; }
         .mm-penny-hero .mm-position { border-color:#b99b4e;background:#12221abf;box-shadow:0 0 22px #6fd56d13,inset 0 1px #ffffff12; }
         .mm-one-stock-hero { background-color:#07141d; border-color:#d6ae5e; box-shadow:inset 0 -34px 62px #03080bc9, inset 0 0 48px #52d1df13; }
         .mm-one-stock-lockup { width:min(100%,250px); margin:3px auto 7px; }
         .mm-one-stock-art { display:block; width:100%; aspect-ratio:1; object-fit:contain; border-radius:13px; box-shadow:0 8px 24px #0008; }
         .mm-one-stock-lockup p { margin:7px 0 0; color:#ffe0a0; font-size:8px; font-weight:800; letter-spacing:.55px; }
         .mm-one-stock-hero .mm-capital { color:#f5d987; text-shadow:0 2px 7px #000; }
         .mm-one-stock-hero .mm-upcoming,.mm-one-stock-hero .mm-countdown,.mm-one-stock-hero .mm-event-meta span { background:#07110edb; border-color:#ffffff35; backdrop-filter:blur(8px); }
         .mm-one-stock-holding { width:100%; display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }
         .mm-one-stock-holding div { min-width:0; padding:7px 5px; border:1px solid #e5c56d55; border-radius:10px; background:#07131ad9; display:flex; flex-direction:column; align-items:center; gap:3px; }
         .mm-one-stock-holding span { color:#d8c991; font:700 7px 'Space Mono',monospace; letter-spacing:.25px; }
         .mm-one-stock-holding b { color:#fff3c7; font-size:12px; font-weight:800; }
         .mm-one-stock-holding small { color:#c7d2d4; font-size:8px; text-align:center; }
        .mm-actions { display:flex; gap:8px; justify-content:flex-end; height:29px; }.mm-actions span { width:30px;height:30px;display:grid;place-items:center;border:1px solid #ffffff43;border-radius:50%;background:#080d16a8;color:#f0eee8; }
        .mm-event-title { display:flex; flex-direction:column; align-items:center; text-align:center; padding-top:0; }
        .mm-event-name { margin:1px 0 3px; color:var(--event-accent); font-size:11px; font-weight:800; letter-spacing:1.18px; text-transform:uppercase; }
        .mm-event-objective { margin:0 0 4px; color:#c8ef9c; font-size:9px; font-weight:800; letter-spacing:.85px; }
        .mm-capital { margin:0 0 8px; color:#f1eee8; font:700 9px 'Space Mono',monospace; letter-spacing:.7px; }
        .mm-event-title h1 { margin:0; max-width:300px; color:#fff9ea; font-size:clamp(21px,5.5vw,28px); line-height:1.08; font-weight:800; letter-spacing:1px; text-shadow:0 2px 7px #000; text-transform:uppercase; }
        .mm-rank-rule { margin:6px 0 0; color:#ffd8db; font:700 8px 'Space Mono',monospace; letter-spacing:.3px; }
        .mm-upcoming { margin-top:10px; display:flex; align-items:center; gap:6px; border:1px solid #d8ba694f; border-radius:18px; padding:5px 10px; background:#080d16c9; color:#e9cc79; font:700 9px 'Space Mono',monospace; letter-spacing:.45px; }
        .mm-upcoming i { width:6px;height:6px;border-radius:50%;background:#e6c15e; }
        .mm-countdown { margin-top:9px; width:min(100%,280px); padding:8px 12px 9px; border-radius:13px; border:1px solid #ffffff24; background:#080d16cf; display:flex; flex-direction:column; align-items:center; }
        .mm-countdown small { color:#c9cbd1; font:700 8px 'Space Mono',monospace; letter-spacing:1.1px; }.mm-countdown strong{margin-top:3px;color:#fff1c5;font-size:21px;font-weight:800;letter-spacing:-.6px;}
        .mm-event-meta { margin-top:9px; display:flex; flex-wrap:wrap; justify-content:center; gap:6px; }
        .mm-event-meta span { min-height:28px; display:flex; align-items:center; justify-content:center; gap:5px; padding:5px 8px; border:1px solid #ffffff20; border-radius:18px; background:#070c14b8; color:#f0eee8; font-size:9px; white-space:nowrap; }.mm-event-meta svg{color:#dbc77c;}
        .mm-event-meta span:nth-child(2){color:#dedbd3;}.mm-event-meta span:nth-child(2) b{color:#fff4d7;}
        .mm-disclaimer { margin:7px 0 0; color:#d0d1d3; font-size:7px; line-height:1.35; letter-spacing:.13px; }
        .mm-podium-heading { display:flex; justify-content:space-between; align-items:center; margin:11px 0 8px; color:#f4f0e7; }.mm-podium-heading b{font-size:13px;}.mm-podium-heading span{color:#d5c189;font:700 8px 'Space Mono',monospace;letter-spacing:1px;}
        .mm-winner { min-height:243px; border-radius:22px; border:1.5px solid #ddba54; background:linear-gradient(145deg,#b18b3060,#282116e9 53%,#0e1115eF); box-shadow:0 7px 18px #0009,inset 0 1px #ffe8a353; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px 15px 12px; color:#f7f2e8; }
        .mm-winner.bear { border-color:#ed666d; background:linear-gradient(145deg,#c1424d62,#2a1115ef 58%,#100e12f5); }
        .mm-medal { position:relative; width:84px;height:87px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--event-accent); margin:0 0 1px; }
        .mm-medal-ring { position:absolute; inset:0; border-radius:50%; border:1px solid color-mix(in srgb,var(--event-accent) 68%,transparent); background:color-mix(in srgb,var(--event-accent) 11%,transparent); box-shadow:0 0 18px color-mix(in srgb,var(--event-accent) 17%,transparent); }
        .mm-cup { z-index:1; width:44px;height:34px;display:grid;place-items:center;border:1px solid #fff0bdad;border-radius:7px 7px 14px 14px;background:var(--event-accent);color:#35280d;box-shadow:0 2px 8px #0007; }
        .mm-stem { z-index:1;width:8px;height:9px;background:var(--event-accent); }.mm-base{z-index:1;height:5px;border-radius:3px;background:var(--event-accent);}.mm-base-one{width:31px;}.mm-base-two{width:41px;margin-top:3px;}
        .mm-winner>small { color:#e4c66e; font:700 9px 'Space Mono',monospace; letter-spacing:1px; margin-top:3px; }
        .mm-winner-name { margin-top:5px; color:#fff; font-size:20px; line-height:1.15; font-weight:800; letter-spacing:-.45px; }.mm-winner-name em{font-style:normal;font-size:8px;color:#e3c267;margin-left:3px;}
        .mm-winner label { margin-top:8px; color:#d7d4cd; font:700 8px 'Space Mono',monospace; letter-spacing:1px; }.mm-return{margin-top:1px;font-size:36px;line-height:1;font-weight:800;letter-spacing:-1px;color:#fff;text-shadow:0 0 16px #ffffff38;}
        .mm-equity { display:grid; grid-template-columns:1fr 1fr; gap:4px; width:100%; margin-top:9px; }.mm-equity div{padding:6px 4px 5px;border-radius:10px;background:#ffffff12;display:flex;flex-direction:column;align-items:center;gap:2px;}.mm-equity span{color:#cac7c0;font:700 7px 'Space Mono',monospace;letter-spacing:.4px;}.mm-equity b{font-size:13px;color:#fff;font-weight:800;}
        .mm-empty-podium { display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px; }.mm-empty-podium div{height:72px;display:flex;align-items:center;justify-content:center;gap:4px;padding:5px;border:1px solid #ffffff40;border-radius:18px;background:#0c111b8e;color:#d3d4d7;white-space:nowrap;}.mm-empty-podium b{font:700 12px 'Space Mono',monospace;color:#e0b965;}.mm-empty-podium div:first-child b{color:#d1d9df;}.mm-empty-podium span:last-child{font-size:8px;}.mm-person-add{color:#b9c0c6;font-size:13px;}
        .mm-position { margin:14px 0 10px; padding:12px 13px 10px; border:1px solid #b99b4e;border-radius:17px;background:#252219;color:#eee9dc;box-shadow:inset 0 1px #ffffff12; }
        .mm-position-heading{display:flex;align-items:center;gap:8px;color:#dfc369;}.mm-position-heading>b{font:700 9px 'Space Mono',monospace;letter-spacing:1px;flex:1;}.mm-position-heading>strong{font:700 8px 'Space Mono',monospace;}
        .mm-position-medal{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#ddbf5b22;border:1px solid #d9bd5880;color:#e7cb71;}
        .mm-position-rank{display:flex;align-items:center;gap:14px;margin-top:9px;}.mm-position-rank>b{font-size:27px;color:#e8c85f;}.mm-position-rank>strong{font-size:15px;color:#f4f0e8;}
        .mm-position-stats{display:flex;justify-content:space-between;margin-top:6px;padding-top:8px;border-top:1px solid #ffffff14;gap:5px;}.mm-position-stats span{display:flex;flex-direction:column;gap:2px;color:#aaa8a0;font:700 7px 'Space Mono',monospace;letter-spacing:.3px;}.mm-position-stats b{color:#f3f0e8;font-size:9px;letter-spacing:0;}
        .mm-footnote{padding:2px 4px 14px;color:#aeb0b4;font-size:8px;text-align:center;}
        .mm-bottom-nav { flex:none; height:69px; z-index:3; display:grid;grid-template-columns:repeat(5,1fr);background:#111419;border-top:1px solid #35373d; }
        .mm-nav-item { position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;color:#a9abb2;border-right:1px solid #25272d; }.mm-nav-item:last-child{border:0;}.mm-nav-item span{font-size:7px;font-weight:600;letter-spacing:.1px;}.mm-nav-item.active{color:#e5c45f;}.mm-nav-item.active span{color:#e5c45f;}.mm-nav-item i{position:absolute;bottom:4px;width:4px;height:4px;border-radius:50%;background:#e5c45f;}
        .mm-homebar{height:18px;flex:none;display:grid;place-items:center;background:#111419;}.mm-homebar span{width:88px;height:4px;border-radius:3px;background:#b6b6b6;}
        .mm-caption { padding:11px 4px 0; display:flex; align-items:baseline; gap:9px; color:#e7e2d8; }.mm-caption>span{font:700 10px 'Space Mono',monospace;color:#ddbc60;}.mm-caption>b{font-size:12px;font-weight:700;}.mm-caption>small{margin-left:auto;color:#85878d;font:8px 'Space Mono',monospace;text-transform:uppercase;}
        @media(max-width:520px){.mm-gallery{padding:22px 12px 40px}.mm-gallery-intro{display:block;margin-bottom:18px}.mm-gallery-intro span{display:block;text-align:left;margin-top:8px}.mm-gallery-grid{grid-template-columns:minmax(0,390px);gap:28px}.mm-phone{height:min(844px,calc(100dvh - 34px));min-height:730px;border-width:5px;border-radius:31px}.mm-event-hero{padding-left:13px;padding-right:13px}.mm-empty-podium div{gap:3px}.mm-empty-podium span:last-child{font-size:7px}}
      `}</style>
      <div className="mm-gallery-intro">
          <div><p>MEISNER METHOD · EVENT ARENA</p><h2>{onlyPenny ? 'Penny Stock Mayhem' : 'Leaderboard screens'}</h2></div>
          <span>{onlyPenny ? 'Cinematic story-card preview' : 'Eight event configurations · one reference state'}</span>
      </div>
      <div className="mm-gallery-grid">
          {visibleEvents.map((event) => <PhoneScreen event={event} index={events.indexOf(event)} key={event.artwork} />)}
      </div>
    </div>
  );
}
