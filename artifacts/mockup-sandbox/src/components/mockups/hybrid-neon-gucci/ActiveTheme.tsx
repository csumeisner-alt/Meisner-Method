import { Activity, ArrowUpRight, BarChart3, Bell, BriefcaseBusiness, ChevronDown, Search, Settings2, Sparkles, Star, TrendingUp, WalletCards } from "lucide-react";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; background: #100d10; }
  .ng-shell {
    min-height: 844px;
    overflow: hidden;
    position: relative;
    color: #fffaf0;
    font-family: Inter, sans-serif;
    background:
      radial-gradient(circle at 88% 16%, rgba(85,236,255,.18), transparent 28%),
      radial-gradient(circle at 10% 78%, rgba(239,200,110,.14), transparent 30%),
      linear-gradient(145deg, #3b2b24 0%, #1f1718 44%, #100d10 100%);
  }
  .ng-shell:before {
    content: "";
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(125deg, transparent 0 28px, rgba(216,195,154,.04) 29px 30px),
      repeating-linear-gradient(35deg, transparent 0 50px, rgba(85,236,255,.035) 51px 52px);
    pointer-events: none;
  }
  .ng-shell:after {
    content: "GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG  GG";
    position: absolute; inset: 150px -40px auto -40px; height: 400px;
    color: #d8c39a; opacity: .075; font-size: 19px; font-weight: 900; letter-spacing: 19px;
    line-height: 62px; transform: rotate(-12deg); word-spacing: 21px; pointer-events: none;
  }
  .ng-content { position: relative; z-index: 1; padding: 24px 20px 94px; }
  .ng-brand { display: flex; align-items: center; gap: 11px; }
  .ng-logo { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid #efc86e; border-radius: 13px; color: #14231e; font-size: 17px; font-weight: 900; letter-spacing: -3px; background: linear-gradient(135deg,#8cf3cf,#efc86e); box-shadow: 0 0 24px rgba(85,236,255,.24); }
  .ng-brand-name { margin: 0; color: #ffe1a0; font-size: 17px; font-weight: 800; letter-spacing: .3px; }
  .ng-kicker { margin: 3px 0 0; color: #cdbfaa; font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; }
  .ng-icon { margin-left: auto; color: #cdbfaa; }
  .ng-stripe { display: flex; height: 8px; margin: 20px -20px 22px; box-shadow: 0 0 18px rgba(85,236,255,.2); }
  .ng-stripe i:nth-child(1), .ng-stripe i:nth-child(5) { flex: .28; background: #efc86e; }
  .ng-stripe i:nth-child(2), .ng-stripe i:nth-child(4) { flex: 1; background: #117a55; }
  .ng-stripe i:nth-child(3) { flex: .55; background: #a62132; }
  .ng-search { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; border: 1px solid #8f7448; border-radius: 14px; background: rgba(43,33,30,.83); box-shadow: inset 0 1px rgba(255,255,255,.07); }
  .ng-search span { color: #cdbfaa; font-size: 12px; }
  .ng-analyze { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 52px; margin-top: 11px; border: 1px solid #8cf3cf; border-radius: 14px; color: #14231e; font-size: 13px; font-weight: 900; letter-spacing: 2px; background: linear-gradient(100deg,#117a55,#8cf3cf 52%,#efc86e); box-shadow: 0 0 22px rgba(85,236,255,.23), 0 7px 18px rgba(0,0,0,.22); }
  .ng-analyze:after { content: ""; position: absolute; top: 0; bottom: 0; width: 30%; background: rgba(255,255,255,.35); transform: skewX(-22deg) translateX(-180%); animation: scan 4.8s ease-in-out infinite; }
  @keyframes scan { 0%,48% { transform: skewX(-22deg) translateX(-180%); } 70%,100% { transform: skewX(-22deg) translateX(430%); } }
  .ng-section-head { display: flex; align-items: center; margin: 24px 0 11px; color: #ffe1a0; font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; }
  .ng-section-head small { margin-left: auto; color: #cdbfaa; font-size: 9px; font-weight: 500; letter-spacing: .8px; }
  .ng-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ng-card { position: relative; overflow: hidden; padding: 14px; border: 1px solid rgba(143,116,72,.76); border-radius: 15px; background: linear-gradient(145deg,rgba(52,39,32,.94),rgba(36,27,27,.92)); box-shadow: inset 0 1px rgba(255,255,255,.05), 0 8px 18px rgba(0,0,0,.15); }
  .ng-card:before { content: ""; position: absolute; width: 70px; height: 70px; right: -32px; top: -33px; border-radius: 50%; background: rgba(85,236,255,.14); filter: blur(2px); }
  .ng-ticker { display: flex; justify-content: space-between; color: #fffaf0; font-size: 16px; font-weight: 800; }
  .ng-change { color: #75f2c6; font-size: 10px; font-weight: 700; }
  .ng-company { margin-top: 5px; overflow: hidden; color: #cdbfaa; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .ng-price { margin-top: 13px; color: #fffaf0; font-size: 18px; font-weight: 700; }
  .ng-spark { display: flex; align-items: end; gap: 3px; height: 24px; margin-top: 8px; }
  .ng-spark i { flex: 1; min-width: 3px; border-radius: 3px 3px 0 0; background: linear-gradient(#8cf3cf,#117a55); }
  .ng-panel { display: flex; align-items: center; gap: 11px; padding: 13px 14px; border: 1px solid rgba(143,116,72,.76); border-radius: 15px; background: rgba(43,33,30,.88); }
  .ng-orb { display: grid; place-items: center; flex: 0 0 auto; width: 38px; height: 38px; border: 1px solid #efc86e; border-radius: 50%; color: #14231e; background: linear-gradient(135deg,#8cf3cf,#efc86e); box-shadow: 0 0 16px rgba(85,236,255,.38); }
  .ng-panel strong { display: block; color: #ffe1a0; font-size: 12px; }
  .ng-panel span { display: block; margin-top: 4px; color: #cdbfaa; font-size: 10px; line-height: 1.35; }
  .ng-chip { margin-left: auto; padding: 5px 7px; border: 1px solid rgba(117,242,198,.55); border-radius: 8px; color: #75f2c6; font-size: 9px; font-weight: 800; letter-spacing: .6px; }
  .ng-bottom { position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(4,1fr); height: 72px; border-top: 1px solid rgba(143,116,72,.7); background: rgba(16,13,16,.94); backdrop-filter: blur(16px); }
  .ng-nav { display: grid; place-items: center; align-content: center; gap: 5px; color: #a99582; font-size: 8px; font-weight: 700; letter-spacing: .7px; }
  .ng-nav.active { color: #8cf3cf; text-shadow: 0 0 12px rgba(85,236,255,.6); }
  .ng-live { position: absolute; top: 78px; right: 18px; display: flex; align-items: center; gap: 5px; color: #75f2c6; font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .ng-live b { width: 5px; height: 5px; border-radius: 50%; background: #75f2c6; box-shadow: 0 0 9px #55ecff; }
`;

function Sparkline() {
  const heights = [35, 54, 43, 68, 57, 77, 64, 91, 75, 98];
  return <div className="ng-spark">{heights.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>;
}

export function ActiveTheme() {
  return (
    <main className="ng-shell">
      <style>{css}</style>
      <div className="ng-live"><b /> LIVE THEME</div>
      <div className="ng-content">
        <header className="ng-brand">
          <div className="ng-logo">GG</div>
          <div>
            <h1 className="ng-brand-name">Meisner Method</h1>
            <p className="ng-kicker">Hybrid Neon Gucci · active</p>
          </div>
          <Settings2 size={18} className="ng-icon" />
        </header>
        <div className="ng-stripe"><i /><i /><i /><i /><i /></div>
        <div className="ng-search"><Search size={17} /><span>Enter ticker (AAPL, TSLA...)</span><Bell size={15} className="ng-icon" /></div>
        <div className="ng-analyze"><Sparkles size={15} style={{ marginRight: 8 }} /> ANALYZE MARKET</div>

        <div className="ng-section-head"><Star size={13} style={{ marginRight: 7 }} /> Watchlist <small>LIVE QUOTES · 10:13 PM</small></div>
        <div className="ng-panel">
          <div className="ng-orb"><TrendingUp size={18} /></div>
          <div><strong>Momentum scanner is ready</strong><span>Tap Analyze to turn a ticker into a lesson.</span></div>
          <div className="ng-chip">READY</div>
        </div>

        <div className="ng-section-head"><Activity size={13} style={{ marginRight: 7 }} /> Trending now <small>UPDATED JUST NOW</small></div>
        <div className="ng-grid">
          {[
            ['NVDA', 'NVIDIA Corporation', '$217.55', '+4.58%'],
            ['AAPL', 'Apple Inc.', '$231.42', '+2.74%'],
            ['TSLA', 'Tesla, Inc.', '$348.18', '+3.91%'],
            ['VOO', 'Vanguard S&P 500 ETF', '$612.08', '+1.24%'],
          ].map(([ticker, company, price, change]) => (
            <article className="ng-card" key={ticker}>
              <div className="ng-ticker"><span>{ticker}</span><span className="ng-change">{change}</span></div>
              <div className="ng-company">{company}</div>
              <div className="ng-price">{price}</div>
              <Sparkline />
            </article>
          ))}
        </div>
      </div>
      <nav className="ng-bottom">
        <div className="ng-nav active"><Search size={18} /><span>ANALYZE</span></div>
        <div className="ng-nav"><BarChart3 size={18} /><span>TOP PICKS</span></div>
        <div className="ng-nav"><WalletCards size={18} /><span>PAPER</span></div>
        <div className="ng-nav"><BriefcaseBusiness size={18} /><span>PORTFOLIO</span></div>
      </nav>
    </main>
  );
}