#!/usr/bin/env python3
"""Brief stock info — company name, sector, dividend yield, market cap."""
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


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No symbol provided"}))
        sys.exit(1)

    symbol = sys.argv[1].upper().strip()
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        # Validate that we got real data
        name = info.get("longName") or info.get("shortName") or ""
        if not name:
            print(json.dumps({"error": f"No data found for {symbol}"}))
            sys.exit(1)

        # Current price — try multiple fields
        price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("previousClose")
            or 0
        )

        # yfinance returns dividendYield inconsistently — sometimes as a true
        # decimal fraction (0.0099 = 0.99%) and sometimes as a percent-like
        # value (0.99 = 0.99%). No real stock sustains a 50 %+ yield, so
        # anything above 0.5 is treated as a percentage and normalised.
        div_yield_raw = info.get("dividendYield", 0) or 0
        if not isinstance(div_yield_raw, (int, float)) or not math.isfinite(div_yield_raw):
            div_yield_raw = 0
        div_yield = div_yield_raw / 100 if div_yield_raw > 0.5 else div_yield_raw

        # dividendRate is the declared annual dividend per share in dollars
        # (e.g. 0.83 for WMT). It avoids the yield × price approximation
        # and is unaffected by the decimal/percent ambiguity.
        div_rate = info.get("dividendRate", 0) or 0

        market_cap = info.get("marketCap", 0) or 0
        sector = info.get("sector", "") or ""
        industry = info.get("industry", "") or ""
        exchange = info.get("exchange", "") or info.get("fullExchangeName", "") or ""

        print(json.dumps(clean_nan({
            "symbol": symbol,
            "companyName": name,
            "sector": sector,
            "industry": industry,
            "exchange": exchange,
            "dividendYield": div_yield,
            "dividendRate": div_rate,
            "marketCap": market_cap,
            "currentPrice": float(price),
        }), allow_nan=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
