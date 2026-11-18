const sample = {
  dates: 'FEB 8 — FEB 12, 2027',
  startingBalance: '$100,000.00',
  endingBalance: '$112,500.00',
  netProfit: '+$12,500.00',
  returnPercent: '+12.50%',
  rank: '#3',
  trades: '12 completed trades',
  symbols: 'AAPL',
};

export function EndOfEventStory() {
  return (
    <main className="event-story" aria-label="Sample One-Stock Challenge end-of-event story card">
      <img
        className="event-story__art"
        src="/__mockup/images/leaderboard-events/event-arena-one-stock-challenge.png"
        alt=""
      />
      <div className="event-story__shade" />

      <header className="event-story__brand">
        <div className="event-story__mark" aria-hidden="true">M</div>
        <div>
          <p className="event-story__brand-name">MEISNER METHOD</p>
          <p className="event-story__brand-subtitle">EVENT ARENA · RESULTS</p>
        </div>
        <span className="event-story__complete">EVENT COMPLETE</span>
      </header>

      <section className="event-story__event" aria-label="Event and date">
        <p className="event-story__eyebrow">THE ONE-STOCK CHALLENGE</p>
        <h1>One stock.<br />One final result.</h1>
        <p className="event-story__dates">{sample.dates}</p>
      </section>

      <section className="event-story__result" aria-label="Final return and rank">
        <p className="event-story__eyebrow">EVENT RETURN</p>
        <p className="event-story__return">{sample.returnPercent}</p>
        <p className="event-story__profit">{sample.netProfit} <span>net</span></p>
        <div className="event-story__badges">
          <span className="event-story__rank"><span>FINAL RANK</span>{sample.rank}</span>
          <span className="event-story__milestone">IN THE GREEN</span>
        </div>
      </section>

      <section className="event-story__details" aria-label="Starting and ending balances">
        <div className="event-story__balance">
          <p>STARTING BALANCE</p>
          <strong>{sample.startingBalance}</strong>
        </div>
        <div className="event-story__balance">
          <p>ENDING BALANCE</p>
          <strong>{sample.endingBalance}</strong>
        </div>
        <div className="event-story__activity">
          <strong>{sample.trades}</strong>
          <span>{sample.symbols}</span>
        </div>
      </section>

      <footer className="event-story__footer">
        <span className="event-story__footer-line" />
        <p>PAPER TRADING · SIMULATED RESULTS</p>
        <span className="event-story__sample">SAMPLE RESULT</span>
      </footer>

      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { width: 100%; height: 100%; margin: 0; }
        .event-story {
          position: relative;
          isolation: isolate;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          width: 100%;
          height: 100vh;
          min-height: 700px;
          overflow: hidden;
          padding: 32px 28px 24px;
          color: #f7f7ff;
          background: #080713;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        }
        .event-story__art {
          position: absolute;
          z-index: -2;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
        .event-story__shade {
          position: absolute;
          z-index: -1;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(6, 6, 17, .74) 0%, rgba(7, 8, 23, .46) 34%, rgba(7, 8, 22, .75) 59%, #080713 100%),
            linear-gradient(90deg, rgba(5, 7, 18, .38), transparent 64%, rgba(8, 8, 24, .23));
        }
        .event-story__brand {
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .event-story__mark {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
          border: 1px solid rgba(246, 193, 92, .9);
          border-radius: 13px;
          color: #ffe2a2;
          background: rgba(4, 17, 34, .64);
          box-shadow: 0 0 24px rgba(246, 193, 92, .2);
          font-size: 22px;
          font-weight: 800;
        }
        .event-story__brand-name,
        .event-story__brand-subtitle,
        .event-story__eyebrow,
        .event-story__dates,
        .event-story__balance p,
        .event-story__footer p {
          margin: 0;
        }
        .event-story__brand-name {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .18em;
        }
        .event-story__brand-subtitle {
          margin-top: 4px;
          color: rgba(228, 231, 255, .72);
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .16em;
        }
        .event-story__complete {
          margin-left: auto;
          padding: 7px 9px;
          border: 1px solid rgba(246, 193, 92, .4);
          border-radius: 999px;
          color: #ffe5a8;
          background: rgba(4, 22, 38, .46);
          font-size: 7px;
          font-weight: 800;
          letter-spacing: .11em;
          white-space: nowrap;
        }
        .event-story__event { margin-top: 32px; }
        .event-story__eyebrow {
          color: #f2c66d;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .2em;
        }
        .event-story__event h1 {
          margin: 10px 0 8px;
          color: #fff;
          font-size: clamp(32px, 9vw, 42px);
          font-weight: 800;
          line-height: .98;
          letter-spacing: -.055em;
          text-shadow: 0 4px 26px rgba(0, 0, 0, .4);
        }
        .event-story__dates {
          color: rgba(237, 236, 255, .8);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .12em;
        }
        .event-story__result {
          margin-top: 28px;
          padding: 19px 18px 17px;
          border: 1px solid rgba(235, 191, 99, .38);
          border-radius: 22px;
          background: linear-gradient(145deg, rgba(19, 18, 42, .82), rgba(10, 13, 31, .76));
          box-shadow: 0 18px 48px rgba(0, 0, 0, .28), inset 0 1px rgba(255, 255, 255, .07);
          backdrop-filter: blur(14px);
        }
        .event-story__return {
          margin: 3px 0 0;
          color: #ffe2a2;
          font-size: clamp(54px, 14vw, 68px);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -.065em;
          text-shadow: 0 0 34px rgba(235, 191, 99, .24);
        }
        .event-story__profit {
          margin: 8px 0 0;
          color: #7cf0b2;
          font-size: 18px;
          font-weight: 750;
          letter-spacing: -.025em;
        }
        .event-story__profit span {
          color: rgba(237, 236, 255, .72);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: .02em;
        }
        .event-story__badges {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 17px;
        }
        .event-story__rank,
        .event-story__milestone {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 32px;
          padding: 6px 10px;
          border: 1px solid rgba(255, 218, 128, .45);
          border-radius: 999px;
          background: rgba(255, 218, 128, .11);
          color: #ffe6a3;
          font-size: 12px;
          font-weight: 800;
        }
        .event-story__rank span,
        .event-story__milestone {
          font-size: 8px;
          letter-spacing: .12em;
        }
        .event-story__milestone {
          border-color: rgba(108, 245, 182, .36);
          background: rgba(75, 222, 157, .1);
          color: #9df4c5;
        }
        .event-story__details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-top: 14px;
        }
        .event-story__balance {
          min-width: 0;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 14px;
          background: rgba(9, 11, 26, .72);
          backdrop-filter: blur(10px);
        }
        .event-story__balance p {
          color: rgba(224, 225, 250, .68);
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .13em;
        }
        .event-story__balance strong {
          display: block;
          margin-top: 7px;
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          white-space: nowrap;
        }
        .event-story__activity {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 4px 2px 0;
        }
        .event-story__activity strong {
          color: rgba(248, 247, 255, .94);
          font-size: 11px;
          font-weight: 700;
        }
        .event-story__activity span {
          overflow: hidden;
          color: rgba(221, 222, 247, .72);
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .event-story__footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
        }
        .event-story__footer-line {
          width: 100%;
          height: 1px;
           background: linear-gradient(90deg, transparent, rgba(235, 191, 99, .46), transparent);
        }
        .event-story__footer p {
          color: rgba(218, 219, 243, .66);
          font-size: 7px;
          font-weight: 700;
          letter-spacing: .18em;
        }
        .event-story__sample {
          color: rgba(209, 208, 231, .46);
          font-size: 6px;
          font-weight: 700;
          letter-spacing: .15em;
        }
        @media (max-height: 740px) {
          .event-story { min-height: 0; padding-top: 22px; padding-bottom: 16px; }
          .event-story__event { margin-top: 18px; }
          .event-story__result { margin-top: 18px; padding: 15px; }
          .event-story__return { font-size: 54px; }
          .event-story__details { margin-top: 10px; }
        }
      `}</style>
    </main>
  );
}
