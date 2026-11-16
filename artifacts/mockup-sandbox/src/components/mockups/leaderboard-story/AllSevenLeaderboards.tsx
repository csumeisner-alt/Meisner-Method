import React from 'react';

type EventConfig = {
  artwork: string;
  name: string;
  subtitle: string;
  capital: string;
  accent: string;
  rankRule?: string;
  objective?: string;
  pennyMayhem?: boolean;
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
    artwork: 'event-arena-penny-stock-mayhem-clean',
    name: 'Penny Stock Mayhem',
    subtitle: 'Stocks & ETFs Under $20',
    capital: '$100,000',
    accent: '#b2ed7c',
    objective: 'STOCKS & ETFs UNDER $20',
    pennyMayhem: true,
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
          <section className={`mm-event-hero ${event.pennyMayhem ? 'mm-penny-hero' : ''}`} style={{ '--event-accent': event.accent, backgroundImage: event.pennyMayhem
            ? `linear-gradient(180deg, rgba(4,8,14,.12), rgba(5,9,15,.32) 23%, rgba(5,9,15,.84) 47%, rgba(5,9,15,.93)), url("/__mockup/images/leaderboard-events/${event.artwork}.jpg")`
            : `linear-gradient(180deg, rgba(4,8,14,.49), rgba(5,9,15,.82) 34%, rgba(5,9,15,.88)), url("/__mockup/images/leaderboard-events/${event.artwork}.jpg")` } as React.CSSProperties}>
            <div className="mm-actions"><span><Glyph name="refresh" size={16} /></span><span><Glyph name="info" size={16} /></span></div>
            <div className="mm-event-title">
              {event.pennyMayhem ? (
                <div className="mm-penny-lockup" aria-label="Penny Stock Mayhem. Stocks and ETFs under $20.">
                  <div className="mm-penny-title">
                    <span>PENNY STOCK</span>
                    <strong>MAYHEM</strong>
                  </div>
                  <div className="mm-penny-banner">
                    <span>STOCKS &amp; ETFs UNDER</span>
                    <strong>$20</strong>
                  </div>
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
              <div className="mm-countdown"><small>COUNTDOWN TO START</small><strong>Starts in 18h 15m</strong></div>
              <div className="mm-event-meta">
                <span><Glyph name="calendar" size={13} /> Nov 16, 2026 – Nov 20, 2026</span>
                <span><Glyph name="users" size={14} /> <b>1</b> competitor</span>
              </div>
              <p className="mm-disclaimer">SELF-REPORTED · NOT INDEPENDENTLY VERIFIED · Updated Nov 15, 2:15 PM</p>
            </div>

            <div className="mm-podium-heading"><b>The podium</b><span>TOP THREE</span></div>
            <div className={`mm-winner ${bear ? 'bear' : ''}`}>
              <PodiumMedal accent={event.accent} />
              <small>RANK 1 OF 1</small>
              <div className="mm-winner-name">Squidward <span className="mm-alias-mark"><Glyph name="star" size={12} /></span> <em>YOU</em></div>
              <label>COMPETITION RETURN</label>
              <strong className="mm-return">+0.00%</strong>
              <div className="mm-equity">
                <div><span>CURRENT EQUITY</span><b>{event.capital}.00</b></div>
                <div><span>DOLLAR P/L</span><b>+$0.00</b></div>
              </div>
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
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
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
         .mm-penny-hero { background-position:center 34%; border-color:#9ab76b91; box-shadow:inset 0 -34px 62px #030907c9, inset 0 0 48px #5a9d4b18; }
         .mm-penny-lockup { width:min(100%,320px);margin:2px auto 7px; }
         .mm-penny-title { display:flex;flex-direction:column;align-items:center;line-height:.9;text-align:center;filter:drop-shadow(0 7px 8px #000b); }
         .mm-penny-title span { color:transparent;background:linear-gradient(180deg,#ffffff 0%,#e2e9ed 26%,#87939d 47%,#f7fbff 59%,#9ca8b1 77%,#eef2f4 100%);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:clamp(25px,7.3vw,33px);font-weight:950;letter-spacing:1.15px;text-shadow:0 2px 0 #59646d,0 4px 0 #303b44; }
         .mm-penny-title strong { color:transparent;background:linear-gradient(180deg,#ffc1c3 0%,#ff626b 25%,#e52331 55%,#a50d1b 78%,#ff626b 100%);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:clamp(38px,10vw,46px);font-weight:950;letter-spacing:3px;line-height:1.04;text-shadow:0 2px 0 #89121b,0 4px 0 #5c0b13; }
         .mm-penny-banner { min-height:47px;margin-top:8px;padding:5px 10px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #d8e2db;border-radius:9px;background:linear-gradient(125deg,#e1e8e4 0%,#5b8169 24%,#12251c 52%,#316747 76%,#9eb6a3 100%);box-shadow:0 0 20px #55d7792b,inset 0 1px #fff9; }
         .mm-penny-banner span { color:#f2f6f3;font-size:10px;font-weight:900;letter-spacing:.45px;text-shadow:0 2px 4px #000c; }
         .mm-penny-banner strong { color:#fff;font-size:27px;font-weight:950;line-height:1;text-shadow:0 1px 0 #aebbb3,0 3px 6px #000b; }
         .mm-penny-hero .mm-capital { color:#f5d987;font-size:10px;letter-spacing:.75px;text-shadow:0 2px 7px #000; }
         .mm-penny-hero .mm-upcoming,.mm-penny-hero .mm-countdown,.mm-penny-hero .mm-event-meta span { background:#07110edb;border-color:#ffffff35;backdrop-filter:blur(8px); }
         .mm-penny-hero .mm-countdown { box-shadow:0 0 22px #75d66320; }
         .mm-penny-hero .mm-winner:not(.bear) { border-color:#d9bd68;background:linear-gradient(145deg,#a7d65b25,#153626ed 48%,#0a1512f2);box-shadow:0 7px 22px #000a,0 0 25px #5dd27624,inset 0 1px #ffe8a353; }
         .mm-penny-hero .mm-empty-podium div { border-color:#a8c99550;background:#08140fbd; }
         .mm-penny-hero .mm-position { border-color:#b99b4e;background:#12221abf;box-shadow:0 0 22px #6fd56d13,inset 0 1px #ffffff12; }
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
          <span>{onlyPenny ? 'Cinematic story-card preview' : 'Seven event configurations · one reference state'}</span>
      </div>
      <div className="mm-gallery-grid">
          {visibleEvents.map((event) => <PhoneScreen event={event} index={events.indexOf(event)} key={event.artwork} />)}
      </div>
    </div>
  );
}
