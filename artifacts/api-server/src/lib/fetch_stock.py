#!/usr/bin/env python3
"""
Fetch stock data via yfinance and print JSON to stdout.
Usage: python3 fetch_stock.py AAPL
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


def expense_ratio(full_info):
    """Return the fund's annual expense ratio as a decimal fraction, or None.

    yfinance is inconsistent about units:
      - annualReportExpenseRatio is already a fraction (e.g. 0.0004 = 0.04%)
      - netExpenseRatio / grossExpenseRatio are in percent (e.g. 0.04 = 0.04%)
    Most individual equities report none of these, in which case we return None
    so the app charges no fee.
    """
    v = full_info.get("annualReportExpenseRatio")
    if v is not None:
        try:
            f = float(v)
            if math.isfinite(f):
                return f
        except (TypeError, ValueError):
            pass
    for key in ("netExpenseRatio", "grossExpenseRatio"):
        v = full_info.get(key)
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

        # 1-year daily history
        hist = ticker.history(period="1y", interval="1d", auto_adjust=True)
        if hist.empty or len(hist) < 20:
            print(json.dumps({"error": f"No price history for {symbol}"}))
            sys.exit(1)

        closes = [float(x) for x in hist["Close"].tolist()]
        volumes = [int(x) for x in hist["Volume"].tolist()]

        # Basic info & fast_info
        info = ticker.fast_info

        current_price = float(info.last_price or closes[-1])
        prev_close = float(info.previous_close or (closes[-2] if len(closes) > 1 else current_price))
        price_change = current_price - prev_close
        price_change_pct = (price_change / prev_close * 100) if prev_close else 0

        # More detailed info (may be slow but needed for fundamentals)
        full_info = {}
        try:
            full_info = ticker.info or {}
        except Exception:
            pass

        result = {
            "symbol": symbol,
            "companyName": full_info.get("longName") or full_info.get("shortName") or symbol,
            "exchange": full_info.get("exchange") or getattr(info, "exchange", "Unknown"),
            "currency": full_info.get("currency") or getattr(info, "currency", "USD"),
            "currentPrice": current_price,
            "priceChange": price_change,
            "priceChangePercent": price_change_pct,
            "volume": int(info.three_month_average_volume or volumes[-1] if volumes else 0),
            "avgVolume": int(info.three_month_average_volume or (volumes[-1] if volumes else 0)),
            "marketCap": float(info.market_cap) if getattr(info, "market_cap", None) else None,
            "week52High": float(info.year_high) if getattr(info, "year_high", None) else max(closes[-52:] if len(closes) >= 52 else closes),
            "week52Low": float(info.year_low) if getattr(info, "year_low", None) else min(closes[-52:] if len(closes) >= 52 else closes),
            "closes": closes,
            "volumes": volumes,
            # Fundamentals from full_info
            "pe": float(full_info["trailingPE"]) if full_info.get("trailingPE") is not None else None,
            "pb": float(full_info["priceToBook"]) if full_info.get("priceToBook") is not None else None,
            "eps": float(full_info["trailingEps"]) if full_info.get("trailingEps") is not None else None,
            "revenueGrowth": float(full_info["revenueGrowth"]) if full_info.get("revenueGrowth") is not None else None,
            "earningsGrowth": float(full_info["earningsGrowth"]) if full_info.get("earningsGrowth") is not None else None,
            "debtEquity": float(full_info["debtToEquity"]) if full_info.get("debtToEquity") is not None else None,
            "dividendYield": float(full_info["dividendYield"]) if full_info.get("dividendYield") is not None else None,
            "expenseRatio": expense_ratio(full_info),
            "profitMargin": float(full_info["profitMargins"]) if full_info.get("profitMargins") is not None else None,
            "returnOnEquity": float(full_info["returnOnEquity"]) if full_info.get("returnOnEquity") is not None else None,
            # Analyst data
            "buyCount": int(full_info.get("recommendationMean") and 0 or 0),
            "holdCount": 0,
            "sellCount": 0,
            "analystRating": full_info.get("recommendationKey", "").capitalize() or "Neutral",
            "analystCount": int(full_info.get("numberOfAnalystOpinions") or 0),
            "priceTarget": float(full_info["targetMeanPrice"]) if full_info.get("targetMeanPrice") is not None else None,
            "shortInterest": float(full_info["shortPercentOfFloat"]) if full_info.get("shortPercentOfFloat") is not None else None,
        }

        # Better analyst counts from recommendations summary
        try:
            rec = ticker.recommendations_summary
            if rec is not None and not rec.empty:
                row = rec.iloc[0]
                result["buyCount"] = int(row.get("strongBuy", 0) or 0) + int(row.get("buy", 0) or 0)
                result["holdCount"] = int(row.get("hold", 0) or 0)
                result["sellCount"] = int(row.get("sell", 0) or 0) + int(row.get("strongSell", 0) or 0)
        except Exception:
            pass

        # Derive analystRating from counts if available
        total = result["buyCount"] + result["holdCount"] + result["sellCount"]
        if total > 0:
            bp = result["buyCount"] / total
            sp = result["sellCount"] / total
            if bp > 0.6:
                result["analystRating"] = "Strong Buy"
            elif bp > 0.4:
                result["analystRating"] = "Buy"
            elif sp > 0.4:
                result["analystRating"] = "Sell"
            else:
                result["analystRating"] = "Hold"
            result["analystCount"] = total

        print(json.dumps(clean_nan(result), allow_nan=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
