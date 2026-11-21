import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getMarketOrderQuoteError, isClosedMarketQuote } from '../../lib/paperOrderEntry';
import { applySlippage, getPurchaseLimitRejectionReason } from '../../lib/paperEngine';
import ProfessionalOrderEntry, { type ConfirmOrderArgs, type OrderIntent } from '../../components/ProfessionalOrderEntry';
import type { LiveQuote, PaperAccount, PaperOrder, PaperPosition } from '../../lib/paperMath';

type Scenario = {
  side: OrderIntent;
  accountId: 'alpha' | 'beta';
  editing?: boolean;
  market?: boolean;
  penny?: boolean;
  assetType?: 'stock' | 'etf';
};

const accounts: Record<Scenario['accountId'], PaperAccount> = {
  alpha: { id: 'alpha', name: 'Alpha account', cash: 10_000, shortCollateral: 125, shortCollateralRatio: 1.5, createdAt: '2025-01-01' },
  beta: { id: 'beta', name: 'Beta account', cash: 10_000, shortCollateral: 125, shortCollateralRatio: 1.5, createdAt: '2025-01-01' },
};

const editableOrder: PaperOrder = {
  id: 'editable-order',
  accountId: 'alpha',
  symbol: 'ACME',
  companyName: 'Acme Corp',
  orderType: 'limit',
  side: 'buy',
  shares: 2,
  limitPrice: 95,
  status: 'pending',
  placedAt: '2025-01-01T00:00:00.000Z',
};
const editableMarketOrder: PaperOrder = {
  id: 'editable-market-order',
  accountId: 'alpha',
  symbol: 'ACME',
  companyName: 'Acme Corp',
  orderType: 'market',
  side: 'buy',
  shares: 10,
  status: 'pending',
  placedAt: '2025-01-01T00:00:00.000Z',
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
  const [quoteMode, setQuoteMode] = useState<'fresh' | 'stale' | 'closed' | 'missing' | 'invalid'>('fresh');
  const [quotePrice, setQuotePrice] = useState(100);
  const quote: LiveQuote | undefined = quoteMode === 'missing'
    ? undefined
    : {
        price: quoteMode === 'invalid' ? 0 : quotePrice,
        change: 0,
        pct: 0,
        priceTimestamp: quoteMode === 'stale' || quoteMode === 'closed'
          ? Date.now() / 1000 - 60 * 60
          : Date.now() / 1000,
        fetchedAtMs: quoteMode === 'stale' || quoteMode === 'closed'
          ? Date.now() - 60 * 60 * 1000
          : Date.now(),
        ...(quoteMode === 'closed' ? { marketSession: 'CLOSED', priceSource: 'previous_close' } : {}),
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
    const quoteError = getMarketOrderQuoteError(
      quote,
      args.quotePrice,
      isClosedMarketQuote(quote),
    );
    if (quoteError) return { status: 'rejected' as const, message: quoteError };
    if (args.orderType === 'market' && isClosedMarketQuote(quote)) {
      return {
        status: 'pending' as const,
        pendingReason: 'market-open' as const,
        message: 'The regular market is closed. Your market order is pending market open and will fill at the next regular market open using the next available quote.',
      };
    }
    if (scenario.penny && args.side === 'buy') {
      const purchaseLimitRejection = getPurchaseLimitRejectionReason({
        order: { side: 'buy', assetType: scenario.assetType },
        executionQuotePrice: args.quotePrice,
        fillPrice: applySlippage(args.quotePrice, args.shares, 'buy'),
        maxPurchasePrice: 20,
      });
      if (purchaseLimitRejection) {
        return { status: 'rejected' as const, message: purchaseLimitRejection };
      }
    }
    window.__orderFills.push(args);
    return { status: 'filled' as const, message: 'Order filled.', fillPrice: args.quotePrice };
  };

  const selectScenario = (side: OrderIntent, accountId: Scenario['accountId']) => {
    setScenario({ side, accountId });
    setQuoteMode('fresh');
    setQuotePrice(100);
  };

  const selectPennyScenario = (assetType: 'stock' | 'etf', price: number) => {
    setScenario({ side: 'buy', accountId: 'alpha', penny: true, assetType });
    setQuoteMode('fresh');
    setQuotePrice(price);
  };

  return (
    <div>
      <div>
        <button data-testid="scenario-buy" onClick={() => selectScenario('buy', 'alpha')}>Buy</button>
        <button data-testid="scenario-sell" onClick={() => selectScenario('sell', 'alpha')}>Sell</button>
        <button data-testid="scenario-short" onClick={() => selectScenario('short', 'beta')}>Short</button>
        <button data-testid="scenario-cover" onClick={() => selectScenario('cover', 'beta')}>Cover</button>
        <button data-testid="scenario-penny-stock" onClick={() => selectPennyScenario('stock', 19.5)}>Penny stock</button>
        <button data-testid="scenario-penny-etf" onClick={() => selectPennyScenario('etf', 19.5)}>Penny ETF</button>
        <button data-testid="scenario-penny-at-limit" onClick={() => selectPennyScenario('stock', 20)}>Penny at limit</button>
        <button data-testid="scenario-edit-order" onClick={() => setScenario({ side: 'buy', accountId: 'alpha', editing: true })}>Edit pending order</button>
        <button data-testid="scenario-edit-market-order" onClick={() => setScenario({ side: 'buy', accountId: 'alpha', editing: true, market: true })}>Edit pending market order</button>
        <button data-testid="quote-fresh" onClick={() => setQuoteMode('fresh')}>Fresh quote</button>
        <button data-testid="quote-stale" onClick={() => setQuoteMode('stale')}>Stale quote</button>
        <button data-testid="quote-closed" onClick={() => setQuoteMode('closed')}>Closed market</button>
        <button data-testid="quote-closed-move" onClick={() => { setQuoteMode('closed'); setQuotePrice(101); }}>Closed-market quote changes</button>
        <button data-testid="quote-missing" onClick={() => setQuoteMode('missing')}>Missing quote</button>
        <button data-testid="quote-invalid" onClick={() => setQuoteMode('invalid')}>Invalid quote</button>
        <button data-testid="quote-change" onClick={() => { setQuoteMode('fresh'); setQuotePrice(101); }}>Change quote</button>
      </div>
      <ProfessionalOrderEntry
        key={`${scenario.side}-${scenario.accountId}-${scenario.assetType ?? 'regular'}-${scenario.penny ? 'penny' : 'standard'}`}
        visible
        side={scenario.side}
        symbol="ACME"
        companyName="Acme Corp"
        currentPrice={quotePrice}
        account={account}
        accountEquity={100_000}
        accountPositions={scenarioPositions}
        quotes={quotes}
        stockInfo={scenario.penny && scenario.assetType ? {
          companyName: scenario.assetType === 'etf' ? 'Acme ETF' : 'Acme Corp',
          currentPrice: quotePrice,
          dividendYield: 0,
          dividendRate: 0,
          expenseRatio: scenario.assetType === 'etf' ? 0.001 : 0,
          sector: 'Technology',
          assetType: scenario.assetType,
        } : undefined}
        purchaseLimit={scenario.penny ? 20 : undefined}
        selectedPos={selectedPos}
        existingOrder={scenario.editing ? scenario.market ? editableMarketOrder : editableOrder : null}
        pendingOrders={[]}
        onClose={() => undefined}
        onRefreshQuote={async () => new Promise((resolve) => setTimeout(resolve, 300))}
        onSearchStock={() => undefined}
        onSetShortCollateralRatio={() => undefined}
        onConfirm={confirm}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <SafeAreaProvider>
    <Entry />
  </SafeAreaProvider>,
);
