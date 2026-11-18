import './_group.css';

const artwork = '/__mockup/images/one-stock-challenge.png';
const participants = [
  { rank: '01', alias: 'BlueChipKing', return: '+12.84%', holding: 'NVDA · $48,620' },
  { rank: '02', alias: 'MarketMaven', return: '+8.31%', holding: 'AAPL · $43,180' },
  { rank: '03', alias: 'QuietConviction', return: '+5.76%', holding: 'MSFT · $39,940' },
];
const standings = [
  { rank: '04', alias: 'LongTermLens', return: '+3.11%', holding: 'AMZN · $37,860' },
  { rank: '05', alias: 'IndexAndChill', return: '+1.42%', holding: 'GOOG · $34,920' },
];

export function Current() {
  return (
    <main style={{ minHeight: '100vh', padding: 16, background: '#08111e' }}>
      <section className="current-card" style={{
        maxWidth: 1000,
        margin: '0 auto',
        overflow: 'hidden',
        border: '1px solid rgba(225,190,111,.48)',
        borderRadius: 24,
        padding: 17,
        background: '#101720',
        boxShadow: '0 20px 54px rgba(0,0,0,.42)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <span className="action">↻</span>
          <span className="action">i</span>
        </div>
        <img
          src={artwork}
          alt="A black chess pawn with gold trim centered in a blue trading arena above a reflective chessboard."
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 560,
            aspectRatio: '1122 / 1402',
            objectFit: 'cover',
            borderRadius: 16,
            margin: '0 auto 15px',
          }}
        />
        <header style={{ textAlign: 'center', padding: '0 8px 18px' }}>
          <h1 style={{ margin: 0, color: '#e7c879', fontSize: 18, letterSpacing: '1.2px' }}>
            THE ONE-STOCK CHALLENGE
          </h1>
          <p style={{ margin: '8px 0', color: '#b6c2d0', fontSize: 13 }}>
            One participant. One stock. One winning position.
          </p>
          <strong style={{ display: 'block', fontSize: 11, letterSpacing: '.8px' }}>
            $100,000 STARTING CAPITAL
          </strong>
          <div style={{ marginTop: 13 }}>
            <span className="status">● LIVE CHAMPIONSHIP</span>
          </div>
          <div className="countdown">
            <small>TIME REMAINING</small>
            <strong>11h 42m 08s</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
            <span className="pill">Feb 8 – Feb 12, 2027</span>
            <span className="pill">24 competitors</span>
          </div>
        </header>
        <section className="podium">
          <h2>THE PODIUM</h2>
          <div className="podium-grid">
            {participants.map((person) => (
              <div className={`row ${person.rank === '01' ? 'row--winner' : ''}`} key={person.rank}>
                <span className="rank">{person.rank}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{person.alias}</strong>
                  <small>{person.holding}</small>
                </div>
                <strong className="return">{person.return}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>
      <section className="full-standings">
        <div className="standings-title"><strong>Full standings</strong><small>2 MORE</small></div>
        {standings.map((person) => (
          <div className="standing-row" key={person.rank}>
            <span className="rank">{person.rank}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{person.alias}</strong>
              <small>{person.holding}</small>
            </div>
            <strong className="return">{person.return}</strong>
          </div>
        ))}
      </section>
      <style>{`
        .action{display:grid;place-items:center;width:36px;height:36px;border:1px solid #536273;border-radius:50%;background:#07111e;color:#f1eee7}
        .status,.pill{display:inline-flex;align-items:center;min-height:34px;padding:7px 11px;border:1px solid rgba(222,190,113,.48);border-radius:20px;background:rgba(7,12,20,.72);color:#e8cb7c;font-size:10px;font-weight:700;letter-spacing:.6px}
        .status{border-color:rgba(112,226,181,.58);background:rgba(35,128,103,.42);color:#a1f0d0}
        .countdown{display:flex;flex-direction:column;align-items:center;gap:5px;margin:12px auto 0;padding:10px 16px;border:1px solid rgba(255,255,255,.15);border-radius:14px;background:rgba(7,12,20,.72);width:max-content;max-width:100%}
        .countdown small,.row small{color:#b6c2d0;font-size:9px;letter-spacing:1px}
        .countdown strong{color:#fff1c5;font-size:21px}
        .pill{color:#d8e1ea;letter-spacing:0}
        .podium{padding:14px 11px 8px;border-top:1px solid rgba(225,190,111,.28)}
        .podium h2{margin:0 0 10px;color:#e7c879;font-size:10px;letter-spacing:1.3px}
        .podium-grid{display:grid;width:100%;min-width:0;grid-template-columns:1fr 1fr;gap:8px;align-items:stretch}
        .row{display:flex;min-width:0;align-items:center;gap:10px;padding:10px 9px;margin-top:0;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#111d2b}
        .row--winner{grid-column:1 / -1;min-height:104px;border-color:rgba(231,200,121,.55);background:rgba(17,29,43,.92)}
        .row:not(.row--winner){flex-direction:column;justify-content:center;text-align:center;padding:10px 6px}
        .rank{color:#e7c879;font-size:12px;font-weight:700}
        .row small{display:block;margin-top:4px;letter-spacing:0}
        .return{color:#a1f0d0;font-size:13px}
        .full-standings{max-width:1000px;margin:0 auto;padding:13px 14px 8px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#101720}
        .standings-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:#f1eee7;font-size:14px}
        .standings-title small{color:#aeb7c1;font-size:9px;letter-spacing:.8px}
        .standing-row{display:flex;align-items:center;gap:10px;min-height:68px;padding:10px 2px;border-top:1px solid rgba(255,255,255,.08)}
        .standing-row small{display:block;margin-top:4px;color:#b6c2d0;font-size:9px}
        @media(min-width:520px){.podium-grid{grid-template-columns:1fr 1.25fr 1fr;align-items:stretch}.row--winner{grid-column:auto;order:2;min-height:228px}.row:nth-child(2){order:1;min-height:218px}.row:nth-child(3){order:3;min-height:218px}}
        @media(max-width:360px){.current-card{padding:12px!important}.countdown strong{font-size:18px}.row{gap:7px;padding:9px 7px}.row strong{font-size:11px}}
      `}</style>
    </main>
  );
}
