#!/usr/bin/env python3
"""
Fetch trending/most-active stocks with live price data.
Returns top 10 by volume with price, change, and change%.
"""
import sys
import json
import math


def clean_nan(obj):
    """Recursively replace NaN/inf floats with None so output is valid JSON.

    Python's json.dumps emits bare `NaN`/`Infinity` tokens which JSON.parse
    rejects, causing the Node API server to 500 on this endpoint.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    return obj


def fetch_trending():
    import yfinance as yf

    # Try yfinance Screener for most-active stocks first
    try:
        screener = yf.screen("most_actives", count=10)
        quotes = screener.get("quotes", [])
        if quotes:
            result = []
            for q in quotes:
                price = q.get("regularMarketPrice") or q.get("postMarketPrice")
                change = q.get("regularMarketChange", 0)
                change_pct = q.get("regularMarketChangePercent", 0)
                volume = q.get("regularMarketVolume", 0)
                name = q.get("shortName") or q.get("longName") or q.get("symbol", "")
                if price and price > 0:
                    result.append({
                        "symbol": q.get("symbol", ""),
                        "name": name,
                        "currentPrice": round(float(price), 2),
                        "priceChange": round(float(change), 4),
                        "priceChangePercent": round(float(change_pct), 4),
                        "volume": int(volume),
                    })
            if result:
                print(json.dumps(clean_nan(result), allow_nan=False))
                return
    except Exception:
        pass

    # Fallback: fetch a broad watchlist and sort by volume
    WATCHLIST = [
        "AAPL", "NVDA", "TSLA", "MSFT", "AMD", "AMZN", "META", "GOOGL",
        "SPY", "QQQ", "PLTR", "SOFI", "RIVN", "MARA", "COIN", "BAC",
        "INTC", "F", "AAL", "NIO",
    ]
    tickers = yf.Tickers(" ".join(WATCHLIST))
    result = []
    for sym in WATCHLIST:
        try:
            t = tickers.tickers.get(sym)
            if not t:
                continue
            fi = t.fast_info
            price = fi.last_price
            prev = fi.previous_close
            if not price or not prev or price <= 0:
                continue
            change = price - prev
            change_pct = (change / prev) * 100
            vol = getattr(fi, "three_month_average_volume", 0) or 0
            result.append({
                "symbol": sym,
                "name": sym,
                "currentPrice": round(float(price), 2),
                "priceChange": round(float(change), 4),
                "priceChangePercent": round(float(change_pct), 4),
                "volume": int(vol),
            })
        except Exception:
            continue

    # Sort by volume descending, take top 10
    result.sort(key=lambda x: x["volume"], reverse=True)
    print(json.dumps(clean_nan(result[:10]), allow_nan=False))


if __name__ == "__main__":
    try:
        fetch_trending()
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
