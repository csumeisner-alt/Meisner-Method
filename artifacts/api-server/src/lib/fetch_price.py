#!/usr/bin/env python3
"""Minimal current-price fetcher for the background alert worker.

This intentionally does not access ticker.info. That metadata call can take
long enough to hit the worker timeout even when fast_info has a usable price.
"""
import json
import math
import sys

import yfinance as yf


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No symbol provided"}))
        sys.exit(1)

    symbol = sys.argv[1].upper().strip()
    try:
        info = yf.Ticker(symbol).fast_info
        price = float(info.last_price or 0)
        if price <= 0:
            price = float(info.previous_close or 0)
        if not math.isfinite(price) or price <= 0:
            print(json.dumps({"error": f"No price data available for {symbol}"}))
            sys.exit(1)
        print(json.dumps({"symbol": symbol, "currentPrice": price}, allow_nan=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)


if __name__ == "__main__":
    main()