#!/usr/bin/env python3
"""Minimal current-price fetcher for the background alert worker.

Use yfinance's one-day, one-minute history with pre/post-market data when
available.  This keeps alert checks aligned with the quote endpoint while
falling back to fast_info if Yahoo does not return an extended-hours candle.
"""
import json
import math
import sys

import yfinance as yf


def positive_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number > 0 else None


def latest_history_price(ticker):
    try:
        history = ticker.history(
            period="1d",
            interval="1m",
            prepost=True,
            auto_adjust=False,
        )
        closes = history["Close"].dropna()
        if len(closes) > 0:
            return positive_number(closes.iloc[-1])
    except Exception:
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
        price = latest_history_price(ticker)
        if price is None:
            price = positive_number(info.last_price) or positive_number(info.previous_close)
        if price is None:
            print(json.dumps({"error": f"No price data available for {symbol}"}))
            sys.exit(1)
        print(json.dumps({"symbol": symbol, "currentPrice": price}, allow_nan=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)


if __name__ == "__main__":
    main()