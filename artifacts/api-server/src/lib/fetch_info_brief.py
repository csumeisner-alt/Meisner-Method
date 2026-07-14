#!/usr/bin/env python3
"""Brief stock info — company name, sector, dividend yield, market cap."""
import sys
import json
import yfinance as yf


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

        div_yield = info.get("dividendYield", 0) or 0
        market_cap = info.get("marketCap", 0) or 0
        sector = info.get("sector", "") or ""
        industry = info.get("industry", "") or ""
        exchange = info.get("exchange", "") or info.get("fullExchangeName", "") or ""

        print(json.dumps({
            "symbol": symbol,
            "companyName": name,
            "sector": sector,
            "industry": industry,
            "exchange": exchange,
            "dividendYield": div_yield,
            "marketCap": market_cap,
            "currentPrice": float(price),
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
