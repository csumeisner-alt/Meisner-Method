import { Activity, Award, BriefcaseBusiness, ChevronDown, ChevronRight, Flame, Info, RefreshCw, Search, Settings, Star, Zap } from 'lucide-react';
import './_group.css';

export function AnalyzeSelectedFlagStory() {
  return (
    <main className="analyze-selected-flag-story" aria-label="Analyze page preview with the Gadsden title flag selected">
      <div className="analyze-safe-area" />

      <header className="analyze-app-header">
        <div className="analyze-brand-row">
          <img className="analyze-brand-icon" src="/__mockup/images/meisner-method-icon-128.png" alt="" />
          <div className="analyze-brand-copy">
            <div className="analyze-brand-title-row">
              <span className="analyze-brand-title">Meisner Method</span>
              <span className="analyze-title-flag-position">
                <span className="analyze-title-flag analyze-title-flag--heritage" role="img" aria-label="Gadsden title flag selected">
                  <img src="/__mockup/images/premium-flags/gadsden.png" alt="" />
                  <span className="analyze-title-flag-check" aria-hidden="true">✓</span>
                </span>
              </span>
            </div>
            <p className="analyze-tagline">AI-powered market intelligence</p>
          </div>
          <div className="analyze-header-actions" aria-hidden="true">
            <span className="analyze-header-action"><Info size={13} /></span>
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
            <div className="analyze-market-flame"><Flame size={31} strokeWidth={1.7} /></div>
            <div className="analyze-market-copy">
              <span className="analyze-market-eyebrow">MARKET HEAT MAP</span>
              <span className="analyze-market-headline">READING MARKET</span>
              <span className="analyze-market-detail">Checking the total-market move…</span>
            </div>
            <ChevronRight className="analyze-market-chevron" size={18} />
          </div>
        </div>
      </section>

      <section className="analyze-main-content" aria-label="Analyze home content">
        <div className="analyze-section">
          <div className="analyze-section-heading">
            <span className="analyze-section-title"><Star size={11} /> WATCHLIST <ChevronDown size={14} /></span>
            <span className="analyze-section-tools"><RefreshCw size={12} /></span>
          </div>
          <div className="analyze-empty-watchlist">
            <Star size={19} strokeWidth={1.7} />
            <span>Search for a stock and tap ★ to add it here</span>
          </div>
        </div>

        <div className="analyze-section analyze-trending">
          <div className="analyze-section-heading">
            <span className="analyze-section-title"><Zap size={11} /> TRENDING <ChevronDown size={14} /></span>
            <span className="analyze-section-tools"><RefreshCw size={12} /></span>
          </div>
          <div className="analyze-trending-loading">
            <span className="analyze-spinner" aria-hidden="true" />
            <span>Fetching live market data…</span>
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
