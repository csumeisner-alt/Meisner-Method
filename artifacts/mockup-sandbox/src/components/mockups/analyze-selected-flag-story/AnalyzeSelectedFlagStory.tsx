import { Activity, Award, BriefcaseBusiness, ChevronDown, ChevronRight, Info, RefreshCw, Search, Settings, Star, TrendingDown, Zap } from 'lucide-react';
import './_group.css';

export function AnalyzeSelectedFlagStory() {
  const trending = [
    { symbol: 'NVDA', name: 'NVIDIA Corporation', change: '−14.01%', price: '$125.53' },
    { symbol: 'ANT', name: 'Anthropic, PBC', change: '−8.50%', price: '$88.91' },
    { symbol: 'INTC', name: 'Intel Corporation', change: '−7.07%', price: '$51.28' },
    { symbol: 'IREN', name: 'IREN LIMITED', change: '−17.97%', price: '$16.42' },
  ];

  return (
    <main className="analyze-selected-flag-story" aria-label="Analyze page after selecting the Gadsden title flag">
      <div className="analyze-safe-area" />

      <header className="analyze-app-header">
        <div className="analyze-brand-row">
          <img className="analyze-brand-icon" src="/__mockup/images/meisner-method-icon-128.png" alt="" />
          <div className="analyze-brand-copy">
            <div className="analyze-brand-title-row">
              <span className="analyze-brand-title">
                Meisner Method
                <span className="analyze-title-flag-position">
                  <span className="analyze-title-flag analyze-title-flag--heritage" role="img" aria-label="Gadsden title flag">
                    <img src="/__mockup/images/premium-flags/gadsden.png" alt="" />
                  </span>
                </span>
              </span>
            </div>
            <p className="analyze-tagline">AI-powered market intelligence</p>
          </div>
          <div className="analyze-header-actions" aria-hidden="true">
            <span className="analyze-header-action analyze-header-action--info"><Info size={13} /></span>
            <span className="analyze-header-action"><Settings size={20} /></span>
          </div>
        </div>
      </header>

      <section className="analyze-controls" aria-label="Analyze search">
        <div className="analyze-search">
          <Search size={19} strokeWidth={2} />
          <span>Search by name or symbol</span>
        </div>
        <div className="analyze-submit">ANALYZE</div>
        <div className="analyze-market-frame">
          <div className="analyze-market-card">
            <div className="analyze-market-flame">
              <svg width="43" height="49" viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                  <linearGradient id="marketPulseFlameStory" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#1D63D8" />
                    <stop offset="64%" stopColor="#6BC8FF" />
                    <stop offset="100%" stopColor="#F4FCFF" />
                  </linearGradient>
                  <linearGradient id="marketPulseCoreStory" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#6BC8FF" />
                    <stop offset="100%" stopColor="#F4FCFF" />
                  </linearGradient>
                </defs>
                <path d="M52 96C34 92 22 79 22 61C22 45 32 36 40 24C40 36 46 42 50 46C52 31 59 18 68 5C67 27 80 35 84 51C89 72 75 92 56 96Z" fill="url(#marketPulseFlameStory)" />
                <path d="M51 87C42 83 37 76 39 66C41 57 49 51 52 42C60 53 63 61 59 68C66 65 69 59 67 52C78 66 71 82 60 87Z" fill="url(#marketPulseCoreStory)" />
                <path d="M51 83C46 80 47 74 51 68C53 73 56 75 55 79C59 77 60 72 59 69C66 77 60 83 54 85Z" fill="#FFF8DC" opacity="0.96" />
              </svg>
            </div>
            <div className="analyze-market-copy">
              <span className="analyze-market-eyebrow">MARKET HEAT MAP</span>
              <span className="analyze-market-headline">MARKET COLD</span>
              <span className="analyze-market-detail">−3.56% LAST SESSION</span>
            </div>
            <span className="analyze-market-session">
              <span className="analyze-market-status">MARKET CLOSED</span>
              <ChevronRight className="analyze-market-chevron" size={18} />
            </span>
          </div>
        </div>
      </section>

      <section className="analyze-main-content" aria-label="Analyze home content">
        <div className="analyze-section">
          <div className="analyze-section-heading">
            <span className="analyze-section-title"><Star size={13} /> WATCHLIST (5) <ChevronRight size={16} /></span>
            <span className="analyze-section-tools">7:31 AM <RefreshCw size={13} /></span>
          </div>
          <div className="analyze-watchlist-collapsed" aria-label="Five saved watchlist symbols, collapsed" />
        </div>

        <div className="analyze-section analyze-trending">
          <div className="analyze-section-heading">
            <span className="analyze-section-title"><Zap size={13} /> TRENDING (10) <ChevronDown size={16} /></span>
            <span className="analyze-section-tools">7:31 AM <RefreshCw size={13} /></span>
          </div>
          <div className="analyze-trending-grid">
            {trending.map((stock) => (
              <article className="analyze-stock-card" key={stock.symbol}>
                <span className="analyze-stock-change"><TrendingDown size={10} /> {stock.change}</span>
                <strong>{stock.symbol}</strong>
                <span className="analyze-stock-name">{stock.name}</span>
                <b>{stock.price}</b>
              </article>
            ))}
          </div>
        </div>

        <p className="analyze-disclaimer">For informational purposes only. Not financial advice.</p>
      </section>

      <nav className="analyze-bottom-tabs" aria-label="Main navigation">
        <div className="analyze-tab analyze-tab--active"><Search size={20} /><span>ANALYZE</span></div>
        <div className="analyze-tab"><Star size={19} /><span>TOP PICKS</span></div>
        <div className="analyze-tab"><Activity size={20} /><span>PAPER</span></div>
        <div className="analyze-tab"><BriefcaseBusiness size={19} /><span>PORTFOLIO</span></div>
        <div className="analyze-tab"><Award size={19} /><span>EVENT ARENA</span></div>
      </nav>
    </main>
  );
}
