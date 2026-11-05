#!/usr/bin/env python3
"""
Fetch OHLCV chart data + moving averages for a given symbol and period.
Usage: python3 fetch_chart.py AAPL 3mo 1d
"""
import sys
import json
import math

from fetch_stock import COMMODITY_CALENDARS, commodity_history_session_date

def safe_float(val):
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


def build_adjusted_return_series(candles, adjustment_column_present, dividend_column_present):
    """Build a provider-backed total-return series only from complete source data."""
    if not adjustment_column_present:
        reason = "Provider did not supply Adj Close values."
    elif not dividend_column_present:
        reason = "Provider distribution history is missing."
    elif len(candles) < 2:
        reason = "At least two complete adjusted observations are required."
    elif any(candle["adjClose"] is None or candle["adjClose"] <= 0 for candle in candles):
        reason = "Provider adjusted-close history is incomplete or invalid."
    elif any(candle["dividend"] is None or candle["dividend"] < 0 for candle in candles):
        reason = "Provider distribution history is incomplete or invalid."
    else:
        base = candles[0]["adjClose"]
        return {
            "status": "available",
            "method": "provider_adjusted_close",
            "values": [
                {
                    "date": candle["date"],
                    "returnPercent": round((candle["adjClose"] / base - 1) * 100, 6),
                }
                for candle in candles
            ],
            "reason": None,
        }

    return {
        "status": "unavailable",
        "method": "provider_adjusted_close",
        "values": [],
        "reason": reason,
    }


def safe_volume(val):
    try:
        volume = float(val)
        if math.isnan(volume) or math.isinf(volume):
            return 0
        return max(0, int(volume))
    except Exception:
        return 0

def moving_average(closes, period):
    result = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1 : i + 1]
        result[i] = round(sum(window) / period, 4)
    return result

def fetch_chart(symbol, period, interval):
    import yfinance as yf

    ticker = yf.Ticker(symbol)
    # Keep raw OHLC values distinct from the provider's dividend/split-adjusted close.
    hist = ticker.history(period=period, interval=interval, auto_adjust=False, actions=True)

    if hist.empty:
        print(json.dumps({"error": f"No data for {symbol}"}))
        return

    candles = []
    closes_raw = []
    adjustment_column_present = "Adj Close" in hist.columns
    dividend_column_present = "Dividends" in hist.columns

    history_rows = list(hist.iterrows())
    if symbol in COMMODITY_CALENDARS:
        history_rows.sort(key=lambda item: item[0])

    for ts, row in history_rows:
        o = safe_float(row.get("Open"))
        h = safe_float(row.get("High"))
        l = safe_float(row.get("Low"))
        c = safe_float(row.get("Close"))
        adj_close = safe_float(row.get("Adj Close")) if adjustment_column_present else None
        dividend = safe_float(row.get("Dividends")) if dividend_column_present else None
        v = safe_volume(row.get("Volume", 0))
        if None in (o, h, l, c):
            continue
        closes_raw.append(c)
        date_label = ts.strftime("%Y-%m-%d")
        if symbol in COMMODITY_CALENDARS and interval == "1d":
            date_label = commodity_history_session_date(symbol, ts)
        candles.append({
            "t": int(ts.timestamp()),
            "date": date_label,
            "o": o,
            "h": h,
            "l": l,
            "c": c,
            "adjClose": adj_close,
            "dividend": dividend,
            "v": v,
        })

    if symbol in COMMODITY_CALENDARS and interval == "1d":
        # Yahoo can emit both a Sunday partial bar and Monday's completed
        # futures trade-date bar. Keep the later provider observation.
        candles_by_session = {}
        for candle in candles:
            existing = candles_by_session.get(candle["date"])
            if existing is None or candle["t"] >= existing["t"]:
                candles_by_session[candle["date"]] = candle
        candles = sorted(candles_by_session.values(), key=lambda candle: candle["t"])
        closes_raw = [candle["c"] for candle in candles]

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
        "seriesType": "continuous_futures" if symbol in COMMODITY_CALENDARS else "market_history",
        "candles": candles,
        "adjustedReturnSeries": build_adjusted_return_series(
            candles,
            adjustment_column_present,
            dividend_column_present,
        ),
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
