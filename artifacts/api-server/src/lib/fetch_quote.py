#!/usr/bin/env python3
"""Fast stock quote fetcher — uses fast_info only, no AI, no full history."""
import sys
import json
import yfinance as yf


def expense_ratio(ticker):
    """Best-effort annual expense ratio (decimal fraction) for funds/ETFs.

    Must never break the quote: any failure returns None. yfinance reports
    annualReportExpenseRatio as a fraction, but netExpenseRatio /
    grossExpenseRatio in percent, so those are divided by 100.
    """
    try:
        full = ticker.info or {}
    except Exception:
        return None
    v = full.get("annualReportExpenseRatio")
    if v is not None:
        try:
            return float(v)
        except (TypeError, ValueError):
            pass
    for key in ("netExpenseRatio", "grossExpenseRatio"):
        v = full.get(key)
        if v is not None:
            try:
                return float(v) / 100.0
            except (TypeError, ValueError):
                pass
    return None


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No symbol provided"}))
        sys.exit(1)

    symbol = sys.argv[1].upper().strip()
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info

        price = float(info.last_price or 0)
        if price <= 0:
            # Fall back to previous close if last_price unavailable
            price = float(info.previous_close or 0)

        if price <= 0:
            print(json.dumps({"error": f"No price data available for {symbol}"}))
            sys.exit(1)

        prev = float(info.previous_close or price)
        change = price - prev
        pct = (change / prev * 100) if prev else 0

        print(json.dumps({
            "symbol": symbol,
            "currentPrice": price,
            "priceChange": change,
            "priceChangePercent": pct,
            "expenseRatio": expense_ratio(ticker),
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
