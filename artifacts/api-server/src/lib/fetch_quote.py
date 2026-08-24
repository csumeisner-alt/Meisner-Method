#!/usr/bin/env python3
"""Fast stock quote fetcher with extended-hours support.

The mobile app already consumes ``currentPrice`` from this script.  Prefer the
price for Yahoo's current market session (pre-market, regular, or post-market)
and fall back to the regular price when extended-hours data is unavailable.
"""
import sys
import json
import math
import yfinance as yf


def clean_nan(obj):
    """Recursively replace NaN/inf floats with None so output is valid JSON.

    Python's json.dumps emits bare `NaN`/`Infinity` tokens which JSON.parse
    rejects, causing the Node API server to 500 on the affected symbol.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    return obj


def finite_number(value):
    """Return a finite float, or None for missing/invalid values."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def positive_number(value):
    number = finite_number(value)
    return number if number is not None and number > 0 else None


def ticker_metadata(ticker):
    """Best-effort metadata lookup; quote data must still work if it fails."""
    try:
        return ticker.info or {}
    except Exception:
        return {}


def select_market_quote(metadata, fast_price, fast_previous_close):
    """Select the newest usable price and matching change fields.

    Yahoo exposes ``marketState`` as PRE, REGULAR, POST, or CLOSED.  During
    CLOSED, the prior post-market price is still the latest price available,
    so it is preferred over the regular close when present.
    """
    regular_price = (
        positive_number(metadata.get("regularMarketPrice"))
        or positive_number(fast_price)
    )
    previous_close = (
        positive_number(metadata.get("regularMarketPreviousClose"))
        or positive_number(metadata.get("previousClose"))
        or positive_number(fast_previous_close)
        or regular_price
    )

    market_state = str(metadata.get("marketState") or "").upper()
    session_fields = {
        "PRE": ("preMarketPrice", "preMarketChange", "preMarketChangePercent", "preMarketTime", "premarket"),
        "PREPRE": ("preMarketPrice", "preMarketChange", "preMarketChangePercent", "preMarketTime", "premarket"),
        "POST": ("postMarketPrice", "postMarketChange", "postMarketChangePercent", "postMarketTime", "after_hours"),
        "POSTPOST": ("postMarketPrice", "postMarketChange", "postMarketChangePercent", "postMarketTime", "after_hours"),
        "CLOSED": ("postMarketPrice", "postMarketChange", "postMarketChangePercent", "postMarketTime", "after_hours"),
    }

    price = regular_price
    change = None
    change_percent = None
    price_timestamp = metadata.get("regularMarketTime")
    price_source = "regular"

    fields = session_fields.get(market_state)
    if fields:
        price_key, change_key, change_percent_key, time_key, source = fields
        session_price = positive_number(metadata.get(price_key))
        if session_price is not None:
            price = session_price
            change = finite_number(metadata.get(change_key))
            change_percent = finite_number(metadata.get(change_percent_key))
            price_timestamp = metadata.get(time_key)
            price_source = source

    if price is None:
        price = previous_close
        price_source = "previous_close"

    if price is None:
        return None

    if change is None:
        change = price - previous_close if previous_close is not None else 0
    if change_percent is None:
        change_percent = (change / previous_close * 100) if previous_close else 0

    timestamp = finite_number(price_timestamp)
    return {
        "currentPrice": price,
        "priceChange": change,
        "priceChangePercent": change_percent,
        "marketSession": market_state or "UNKNOWN",
        "priceSource": price_source,
        "priceTimestamp": int(timestamp) if timestamp is not None and timestamp > 0 else None,
    }


def expense_ratio(metadata):
    """Best-effort annual expense ratio (decimal fraction) for funds/ETFs.

    Must never break the quote: any failure returns None. yfinance reports
    annualReportExpenseRatio as a fraction, but netExpenseRatio /
    grossExpenseRatio in percent, so those are divided by 100.
    """
    full = metadata or {}
    v = full.get("annualReportExpenseRatio")
    if v is not None:
        try:
            f = float(v)
            if math.isfinite(f):
                return f
        except (TypeError, ValueError):
            pass
    for key in ("netExpenseRatio", "grossExpenseRatio"):
        v = full.get(key)
        if v is not None:
            try:
                f = float(v) / 100.0
                if math.isfinite(f):
                    return f
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
        fast_info = ticker.fast_info

        fast_price = positive_number(fast_info.last_price)
        fast_previous_close = positive_number(fast_info.previous_close)

        metadata = ticker_metadata(ticker)
        quote = select_market_quote(metadata, fast_price, fast_previous_close)
        if quote is None:
            print(json.dumps({"error": f"No price data available for {symbol}"}))
            sys.exit(1)

        print(json.dumps(clean_nan({
            "symbol": symbol,
            **quote,
            "expenseRatio": expense_ratio(metadata),
        }), allow_nan=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
