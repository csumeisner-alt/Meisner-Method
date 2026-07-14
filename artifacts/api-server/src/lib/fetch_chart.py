#!/usr/bin/env python3
"""
Fetch OHLCV chart data + moving averages for a given symbol and period.
Usage: python3 fetch_chart.py AAPL 3mo 1d
"""
import sys
import json
import math

def safe_float(val):
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None

def moving_average(closes, period):
    result = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1 : i + 1]
        result[i] = round(sum(window) / period, 4)
    return result

def fetch_chart(symbol, period, interval):
    import yfinance as yf

    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval=interval)

    if hist.empty:
        print(json.dumps({"error": f"No data for {symbol}"}))
        return

    candles = []
    closes_raw = []

    for ts, row in hist.iterrows():
        o = safe_float(row.get("Open"))
        h = safe_float(row.get("High"))
        l = safe_float(row.get("Low"))
        c = safe_float(row.get("Close"))
        v = int(row.get("Volume", 0) or 0)
        if c is None:
            continue
        closes_raw.append(c)
        candles.append({
            "t": int(ts.timestamp()),
            "date": ts.strftime("%Y-%m-%d"),
            "o": o,
            "h": h,
            "l": l,
            "c": c,
            "v": v,
        })

    # Compute MAs over the full close series
    ma20 = moving_average(closes_raw, 20)
    ma50 = moving_average(closes_raw, 50)
    ma200 = moving_average(closes_raw, 200)

    # Attach MAs to candles
    for i, candle in enumerate(candles):
        candle["ma20"] = ma20[i]
        candle["ma50"] = ma50[i]
        candle["ma200"] = ma200[i]

    print(json.dumps({
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "candles": candles,
    }))

if __name__ == "__main__":
    sym = sys.argv[1].upper() if len(sys.argv) > 1 else "AAPL"
    period = sys.argv[2] if len(sys.argv) > 2 else "3mo"
    interval = sys.argv[3] if len(sys.argv) > 3 else "1d"
    try:
        fetch_chart(sym, period, interval)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
