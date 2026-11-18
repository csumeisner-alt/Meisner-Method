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

export function FullCard() {
  return (
    <main style={{ minHeight: '100vh', padding: 14, background: '#08111e' }}>
      <section className="full-card" style={{ backgroundImage: `url("${artwork}")` }}>
        <div className="full-card__shade" />
        <div className="full-card__content">
          <div className="actions">
            <span className="action">↻</span>
            <span className="action">i</span>
          </div>
          <header className="identity">
            <div className="eyebrow">MEISNER METHOD <span>·</span> EVENT ARENA</div>
            <h1>THE ONE-STOCK<br />CHALLENGE</h1>
            <div className="gold-rule" />
            <p>One participant. One stock. One winning position.</p>
            <strong className="capital">$100,000 <span>STARTING CAPITAL</span></strong>
            <div className="status">● LIVE CHAMPIONSHIP</div>
            <div className="countdown">
              <small>TIME REMAINING</small>
              <strong>11h 42m 08s</strong>
            </div>
            <div className="facts">
              <span>FEB 8 – FEB 12, 2027</span>
              <span>24 COMPETITORS</span>
            </div>
          </header>
          <section className="podium">
            <div className="section-label"><span>FINAL STANDINGS</span><i /></div>
            <div className="podium-grid">
              {participants.map((person, index) => (
                <div className={`row ${index === 0 ? 'row--winner' : ''}`} key={person.rank}>
                  <span className="rank">{person.rank}</span>
                  <div className="identity-row">
                    <strong>{person.alias}</strong>
                    <small>{person.holding}</small>
                  </div>
                  <strong className="return">{person.return}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="standings">
            <div className="section-label"><span>FULL STANDINGS</span><small>2 MORE</small></div>
            {standings.map((person) => (
              <div className="standing-row" key={person.rank}>
                <span className="rank">{person.rank}</span>
                <div className="identity-row">
                  <strong>{person.alias}</strong>
                  <small>{person.holding}</small>
                </div>
                <strong className="return">{person.return}</strong>
              </div>
            ))}
          </section>
        </div>
      </section>
      <style>{`
        .full-card{position:relative;isolation:isolate;width:100%;max-width:1000px;min-height:100vh;margin:0 auto;overflow:hidden;border:1px solid rgba(231,200,121,.58);border-radius:24px;background-color:#07111e;background-position:center 50%;background-repeat:no-repeat;background-size:cover;box-shadow:0 24px 60px rgba(0,0,0,.48)}
        .full-card__shade{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(3,12,25,.84) 0%,rgba(4,15,30,.48) 28%,rgba(4,14,28,.35) 48%,rgba(4,12,24,.78) 72%,rgba(4,10,20,.94) 100%),linear-gradient(90deg,rgba(3,12,25,.42),transparent 50%,rgba(3,12,25,.42))}
        .full-card__content{position:relative;padding:14px 15px 16px}
        .actions{display:flex;justify-content:flex-end;gap:8px}
        .action{display:grid;place-items:center;width:34px;height:34px;border:1px solid rgba(255,255,255,.32);border-radius:50%;background:rgba(4,13,26,.56);color:#fff2c9;font-size:16px}
        .identity{text-align:center;padding:30px 5px 14px}
        .eyebrow{color:#d9e7f1;font-size:9px;letter-spacing:1.8px;font-weight:700}
        .eyebrow span{color:#e7c879;padding:0 4px}
        h1{margin:11px 0 0;color:#f4e7bf;font-size:clamp(20px,6vw,29px);line-height:1.06;letter-spacing:1.2px;text-shadow:0 2px 16px rgba(0,0,0,.85)}
        .gold-rule{width:44px;height:2px;margin:12px auto 0;background:#e7c879;box-shadow:0 0 12px rgba(231,200,121,.48)}
        p{margin:10px 0 13px;color:#edf2f7;font-size:12px;line-height:1.45;text-shadow:0 2px 8px rgba(0,0,0,.9)}
        .capital{display:inline-block;color:#ffe8a7;font-size:14px;letter-spacing:.5px;text-shadow:0 2px 10px rgba(0,0,0,.9)}
        .capital span{color:#f1eee7;font-size:9px;letter-spacing:1px}
        .status{display:table;margin:12px auto 0;padding:7px 11px;border:1px solid rgba(112,226,181,.65);border-radius:20px;background:rgba(7,34,37,.76);color:#a1f0d0;font-size:9px;font-weight:700;letter-spacing:1px}
        .countdown{display:flex;flex-direction:column;align-items:center;gap:4px;width:max-content;max-width:100%;margin:10px auto 0;padding:9px 15px;border:1px solid rgba(231,200,121,.38);border-radius:13px;background:rgba(4,12,23,.72);box-shadow:0 8px 22px rgba(0,0,0,.18)}
        .countdown small{color:#d1d9e2;font-size:8px;letter-spacing:1.4px;font-weight:700}
        .countdown strong{color:#fff1c5;font-size:20px;text-shadow:0 2px 10px rgba(0,0,0,.9)}
        .facts{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:10px}
        .facts span{padding:7px 9px;border:1px solid rgba(255,255,255,.18);border-radius:18px;background:rgba(4,12,23,.72);color:#e4ebf2;font-size:8px;font-weight:700;letter-spacing:.6px}
        .podium{padding:12px 1px 2px}
        .podium-grid{display:grid;width:100%;min-width:0;grid-template-columns:1fr 1fr;gap:7px;align-items:stretch}
        .section-label{display:flex;align-items:center;gap:10px;margin:0 4px 8px;color:#f0d88e;font-size:9px;letter-spacing:1.5px;font-weight:700}
        .section-label i{height:1px;flex:1;background:linear-gradient(90deg,rgba(231,200,121,.58),transparent)}
        .row{display:flex;width:100%;min-width:0;align-items:center;gap:10px;min-height:88px;padding:10px 11px;border:1px solid rgba(230,237,245,.17);border-radius:13px;background:rgba(4,13,25,.58);backdrop-filter:blur(3px)}
        .row--winner{grid-column:1 / -1;min-height:102px;border-color:rgba(231,200,121,.6);background:rgba(9,20,34,.68)}
        .row:not(.row--winner){flex-direction:column;justify-content:center;gap:5px;text-align:center;padding:10px 6px}
        .row:not(.row--winner) .identity-row{flex:0 1 auto;width:100%;text-align:center}
        .row:not(.row--winner) .identity-row strong{font-size:9px;white-space:normal;overflow:visible;text-overflow:clip}
        .rank{display:grid;place-items:center;width:27px;height:27px;flex:none;border:1px solid rgba(231,200,121,.42);border-radius:9px;color:#f0d88e;font-size:10px;font-weight:800}
        .identity-row{flex:1;min-width:0}
        .identity-row strong{display:block;overflow:hidden;color:#f7f8fa;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
        .identity-row small{display:block;margin-top:4px;color:#c4d0dc;font-size:9px}
        .return{color:#9fe0c6;font-size:12px;white-space:nowrap}
        .standings{padding-top:10px}
        .section-label small{margin-left:auto;color:#c6d0da;font-size:8px;letter-spacing:.8px}
        .standing-row{display:flex;align-items:center;gap:10px;min-height:58px;margin-top:6px;padding:9px 11px;border:1px solid rgba(230,237,245,.14);border-radius:11px;background:rgba(4,13,25,.54)}
        @media(min-width:520px){.full-card__content{padding:16px 19px 18px}.identity{padding-top:28px}.podium-grid{grid-template-columns:1fr 1.25fr 1fr}.row--winner{grid-column:auto;order:2;min-height:148px}.row:nth-child(2){order:1}.row:nth-child(3){order:3}}
        @media(max-width:519px){.row:not(.row--winner) .identity-row strong{font-size:8px}.row:not(.row--winner) .identity-row small{font-size:8px}}
        @media(max-width:359px){.full-card{background-position:center 43%}.full-card__content{padding:12px 11px}.identity{padding-top:24px}.facts span{font-size:7px}.row{gap:7px;padding:9px 8px}.return{font-size:10px}}
      `}</style>
    </main>
  );
}
