import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getMarketOrderQuoteError } from '../../lib/paperOrderEntry';
import ProfessionalOrderEntry, { type ConfirmOrderArgs, type OrderIntent } from '../../components/ProfessionalOrderEntry';
import type { LiveQuote, PaperAccount, PaperPosition } from '../../lib/paperMath';

type Scenario = { side: OrderIntent; accountId: 'alpha' | 'beta' };

const accounts: Record<Scenario['accountId'], PaperAccount> = {
  alpha: { id: 'alpha', name: 'Alpha account', cash: 10_000, createdAt: '2025-01-01' },
  beta: { id: 'beta', name: 'Beta account', cash: 10_000, createdAt: '2025-01-01' },
};

const positions: PaperPosition[] = [
  {
    id: 'alpha-long', accountId: 'alpha', symbol: 'ACME', companyName: 'Acme Corp',
    shares: 4, avgCost: 90, openedAt: '2025-01-01', dividendYield: 0, sector: '',
  },
  {
    id: 'beta-long', accountId: 'beta', symbol: 'ACME', companyName: 'Acme Corp',
    shares: 99, avgCost: 90, openedAt: '2025-01-01', dividendYield: 0, sector: '',
  },
  {
    id: 'alpha-short', accountId: 'alpha', symbol: 'ACME', companyName: 'Acme Corp',
    shares: 3, avgCost: 110, openedAt: '2025-01-01', dividendYield: 0, sector: '', positionType: 'short',
  },
  {
    id: 'beta-short', accountId: 'beta', symbol: 'ACME', companyName: 'Acme Corp',
    shares: 88, avgCost: 110, openedAt: '2025-01-01', dividendYield: 0, sector: '', positionType: 'short',
  },
];

declare global {
  interface Window {
    __orderAttempts: ConfirmOrderArgs[];
    __orderFills: ConfirmOrderArgs[];
  }
}

window.__orderAttempts = [];
window.__orderFills = [];

export default function Entry() {
  const [scenario, setScenario] = useState<Scenario>({ side: 'buy', accountId: 'alpha' });
  const [quoteMode, setQuoteMode] = useState<'fresh' | 'stale' | 'missing' | 'invalid'>('fresh');
  const [quotePrice, setQuotePrice] = useState(100);
  const quote: LiveQuote | undefined = quoteMode === 'missing'
    ? undefined
    : {
        price: quoteMode === 'invalid' ? 0 : quotePrice,
        change: 0,
        pct: 0,
        priceTimestamp: quoteMode === 'stale' ? Date.now() / 1000 - 60 * 60 : Date.now() / 1000,
        fetchedAtMs: quoteMode === 'stale' ? Date.now() - 60 * 60 * 1000 : Date.now(),
      };
  const account = accounts[scenario.accountId];
  const scenarioPositions = scenario.side === 'buy'
    ? []
    : scenario.side === 'sell'
      ? positions.filter((position) => position.positionType !== 'short')
    : scenario.side === 'short'
      ? positions.filter((position) => position.accountId !== account.id)
      : scenario.side === 'cover'
        ? positions.filter((position) => position.positionType === 'short')
        : positions;
  const selectedPos = scenario.side === 'sell'
    ? scenarioPositions.find((position) => position.accountId === account.id) ?? null
    : scenario.side === 'cover'
      ? scenarioPositions.find((position) => position.accountId === account.id) ?? null
      : null;
  const quotes: Record<string, LiveQuote> = quote ? { ACME: quote } : {};

  const confirm = async (args: ConfirmOrderArgs) => {
    window.__orderAttempts.push(args);
    const quoteError = getMarketOrderQuoteError(quote, args.quotePrice);
    if (quoteError) return { status: 'rejected' as const, message: quoteError };
    window.__orderFills.push(args);
    return { status: 'filled' as const, message: 'Order filled.', fillPrice: args.quotePrice };
  };

  const selectScenario = (side: OrderIntent, accountId: Scenario['accountId']) => {
    setScenario({ side, accountId });
    setQuoteMode('fresh');
    setQuotePrice(100);
  };

  return (
    <div>
      <div>
        <button data-testid="scenario-buy" onClick={() => selectScenario('buy', 'alpha')}>Buy</button>
        <button data-testid="scenario-sell" onClick={() => selectScenario('sell', 'alpha')}>Sell</button>
        <button data-testid="scenario-short" onClick={() => selectScenario('short', 'beta')}>Short</button>
        <button data-testid="scenario-cover" onClick={() => selectScenario('cover', 'beta')}>Cover</button>
        <button data-testid="quote-fresh" onClick={() => setQuoteMode('fresh')}>Fresh quote</button>
        <button data-testid="quote-stale" onClick={() => setQuoteMode('stale')}>Stale quote</button>
        <button data-testid="quote-missing" onClick={() => setQuoteMode('missing')}>Missing quote</button>
        <button data-testid="quote-invalid" onClick={() => setQuoteMode('invalid')}>Invalid quote</button>
        <button data-testid="quote-change" onClick={() => { setQuoteMode('fresh'); setQuotePrice(101); }}>Change quote</button>
      </div>
      <ProfessionalOrderEntry
        key={`${scenario.side}-${scenario.accountId}`}
        visible
        side={scenario.side}
        symbol="ACME"
        companyName="Acme Corp"
        currentPrice={quotePrice}
        account={account}
        accountEquity={100_000}
        accountPositions={scenarioPositions}
        quotes={quotes}
        selectedPos={selectedPos}
        pendingOrders={[]}
        onClose={() => undefined}
        onRefreshQuote={async () => undefined}
        onSearchStock={() => undefined}
        onSetShortCollateralRatio={() => undefined}
        onConfirm={confirm}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Entry />);
