#!/usr/bin/env python3
"""Fetch one batched, freshness-checked set of market heat-map quotes."""
import json
import math
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import yfinance as yf


STOCK_SECTORS = {
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology", "AVGO": "Technology",
    "ORCL": "Technology", "CRM": "Technology", "AMD": "Technology", "MU": "Technology",
    "INTC": "Technology", "QCOM": "Technology", "ADBE": "Technology", "TXN": "Technology",
    "GOOGL": "Communication Services", "GOOG": "Communication Services",
    "META": "Communication Services", "NFLX": "Communication Services", "DIS": "Communication Services",
    "TMUS": "Communication Services", "T": "Communication Services", "VZ": "Communication Services",
    "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical", "HD": "Consumer Cyclical",
    "MCD": "Consumer Cyclical", "NKE": "Consumer Cyclical", "LOW": "Consumer Cyclical",
    "WMT": "Consumer Defensive", "COST": "Consumer Defensive", "PG": "Consumer Defensive",
    "KO": "Consumer Defensive", "PEP": "Consumer Defensive",
    "JPM": "Financials", "BAC": "Financials", "GS": "Financials", "V": "Financials",
    "MA": "Financials", "BRK-B": "Financials",
    "LLY": "Healthcare", "JNJ": "Healthcare", "UNH": "Healthcare", "ABBV": "Healthcare",
    "PFE": "Healthcare", "MRK": "Healthcare",
    "CAT": "Industrials", "GE": "Industrials", "RTX": "Industrials", "HON": "Industrials",
    "PLD": "Real Estate", "AMT": "Real Estate", "O": "Real Estate",
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
    "NEE": "Utilities", "DUK": "Utilities",
}

ETF_SYMBOLS = [
    "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "XLK", "XLF", "XLE", "XLV",
    "XLI", "XLY", "XLP", "XLU", "XLRE", "XLC", "SMH", "SOXX", "GLD", "SLV",
    "TLT", "IEF", "HYG", "LQD", "ARKK", "XBI", "EEM", "EFA", "SCHD", "BND",
]
COMMODITY_SYMBOLS = [
    "GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "ZC=F", "ZW=F", "ZS=F",
    "KC=F", "CT=F", "SB=F", "PL=F", "PA=F", "LE=F", "HE=F",
]
FUTURE_SYMBOLS = [
    "ES=F", "NQ=F", "YM=F", "RTY=F", "ZN=F", "ZB=F", "ZF=F",
    "6E=F", "6J=F", "6B=F", "6C=F", "DX=F",
]
CRYPTO_SYMBOLS = [
    "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "BNB-USD", "DOGE-USD",
    "ADA-USD", "TRX-USD", "AVAX-USD", "LINK-USD", "LTC-USD", "BCH-USD",
    "SUI-USD", "DOT-USD", "SHIB-USD", "TON-USD",
]
STOCK_SYMBOLS = list(STOCK_SECTORS)
UNIVERSES = {
    "stocks": STOCK_SYMBOLS,
    "etfs": ETF_SYMBOLS,
    "commodities": COMMODITY_SYMBOLS,
    "futures": FUTURE_SYMBOLS,
    "cryptocurrency": CRYPTO_SYMBOLS,
}


def finite_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def clean_nan(value):
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {key: clean_nan(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_nan(item) for item in value]
    return value


def asset_type_for(category, symbol):
    if category == "stocks":
        return "stock"
    if category == "etfs":
        return "etf"
    if category == "commodities":
        return "commodity"
    if category == "futures":
        return "future"
    if category == "cryptocurrency":
        return "cryptocurrency"
    if symbol.endswith("-USD"):
        return "cryptocurrency"
    if symbol.endswith("=F"):
        return "commodity" if symbol in COMMODITY_SYMBOLS else "future"
    if symbol in ETF_SYMBOLS:
        return "etf"
    return "stock"


def market_session(timestamp, asset_type):
    age_seconds = datetime.now(timezone.utc).timestamp() - timestamp
    if asset_type == "cryptocurrency":
        return "regular" if age_seconds <= 30 * 60 else "closed"
    try:
        local = datetime.fromtimestamp(timestamp, ZoneInfo("America/New_York"))
        current = datetime.now(ZoneInfo("America/New_York"))
    except Exception:
        return "unknown"
    if local.date() != current.date() or local.weekday() >= 5 or age_seconds > 30 * 60:
        return "closed"
    minute = local.hour * 60 + local.minute
    if 4 * 60 <= minute < 9 * 60 + 30:
        return "pre_market"
    if 9 * 60 + 30 <= minute < 16 * 60:
        return "regular"
    if 16 * 60 <= minute < 20 * 60:
        return "after_hours"
    return "closed"


def index_timestamp(index_value):
    try:
        value = index_value.to_pydatetime()
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp())
    except Exception:
        try:
            return int(index_value.timestamp())
        except Exception:
            return None


def frame_for_symbol(frame, symbol):
    if frame is None or getattr(frame, "empty", True):
        return None
    columns = frame.columns
    if getattr(columns, "nlevels", 1) > 1:
        for level in range(columns.nlevels):
            try:
                if symbol in columns.get_level_values(level):
                    selected = frame.xs(symbol, axis=1, level=level, drop_level=True)
                    if not selected.empty:
                        return selected
            except (KeyError, ValueError):
                continue
        return None
    return frame


def previous_daily_close(frame, symbol, latest_index):
    daily_frame = frame_for_symbol(frame, symbol)
    if daily_frame is None or "Close" not in daily_frame:
        return None
    latest_date = latest_index.date() if hasattr(latest_index, "date") else None
    prior_rows = []
    for index_value, raw_price in daily_frame["Close"].dropna().items():
        row_date = index_value.date() if hasattr(index_value, "date") else None
        price = finite_number(raw_price)
        if price is not None and price > 0 and latest_date is not None and row_date < latest_date:
            prior_rows.append(price)
    return prior_rows[-1] if prior_rows else None


def quote_from_frame(frame, symbol, category, require_prior_close=True, previous_close=None):
    if frame is None or "Close" not in frame:
        return None
    close = frame["Close"]
    if hasattr(close, "dropna"):
        close = close.dropna()
    rows = []
    for index_value, raw_price in close.items():
        price = finite_number(raw_price)
        timestamp = index_timestamp(index_value)
        if price is not None and price > 0 and timestamp is not None:
            rows.append((index_value, timestamp, price))
    if len(rows) < 2 and require_prior_close and previous_close is None:
        return None
    if not rows:
        return None

    latest_index, latest_timestamp, latest_price = rows[-1]
    asset_type = asset_type_for(category, symbol)
    max_age = 48 * 60 * 60 if asset_type == "cryptocurrency" else 120 * 60 * 60
    now = datetime.now(timezone.utc).timestamp()
    if latest_timestamp > now + 3600 or now - latest_timestamp > max_age:
        return None

    latest_date = latest_index.date() if hasattr(latest_index, "date") else None
    prior_price = previous_close
    if prior_price is None:
        for index_value, _, price in reversed(rows[:-1]):
            row_date = index_value.date() if hasattr(index_value, "date") else None
            if latest_date is None or row_date != latest_date:
                prior_price = price
                break
    if prior_price is None or prior_price <= 0:
        return None

    change_percent = (latest_price - prior_price) / prior_price * 100.0
    if not math.isfinite(change_percent):
        return None
    sector = STOCK_SECTORS.get(symbol) if asset_type == "stock" else None
    if category == "stocks" and not sector:
        sector = "Other"
    return {
        "symbol": symbol,
        "name": symbol,
        "price": round(latest_price, 6),
        "priceChangePercent": round(change_percent, 4),
        "priceTimestamp": latest_timestamp,
        "marketSession": market_session(latest_timestamp, asset_type),
        "assetType": asset_type,
        "sector": sector,
    }


def download_quotes(symbols, category, interval):
    if not symbols:
        return {}
    try:
        data = yf.download(
            tickers=" ".join(symbols),
            period="5d",
            interval=interval,
            prepost=True,
            auto_adjust=False,
            actions=False,
            group_by="ticker",
            threads=True,
            progress=False,
            timeout=30,
        )
    except Exception:
        return {}
    daily_data = None
    if interval == "5m":
        try:
            daily_data = yf.download(
                tickers=" ".join(symbols),
                period="5d",
                interval="1d",
                auto_adjust=False,
                actions=False,
                group_by="ticker",
                threads=True,
                progress=False,
                timeout=30,
            )
        except Exception:
            daily_data = None
    quotes = {}
    for symbol in symbols:
        try:
            frame = frame_for_symbol(data, symbol)
            reference_close = None
            if interval == "5m" and frame is not None and not frame.empty:
                latest_index = frame["Close"].dropna().index[-1]
                reference_close = previous_daily_close(daily_data, symbol, latest_index)
            quote = quote_from_frame(
                frame,
                symbol,
                category,
                require_prior_close=interval != "5m",
                previous_close=reference_close,
            )
            if quote:
                quotes[symbol] = quote
        except Exception:
            continue
    return quotes


def quote_from_screener(item):
    symbol = str(item.get("symbol") or "").upper().strip()
    if not symbol:
        return None
    market_state = str(item.get("marketState") or "").upper()
    if market_state in ("PRE", "PREPRE"):
        price = finite_number(item.get("preMarketPrice")) or finite_number(item.get("regularMarketPrice"))
        change_percent = finite_number(item.get("preMarketChangePercent"))
        stamp = finite_number(item.get("preMarketTime"))
        session = "pre_market"
    elif market_state in ("POST", "POSTPOST", "CLOSED"):
        price = finite_number(item.get("postMarketPrice")) or finite_number(item.get("regularMarketPrice"))
        change_percent = finite_number(item.get("postMarketChangePercent"))
        stamp = finite_number(item.get("postMarketTime")) or finite_number(item.get("regularMarketTime"))
        session = "after_hours" if market_state in ("POST", "POSTPOST") and finite_number(item.get("postMarketPrice")) else "closed"
    else:
        price = finite_number(item.get("regularMarketPrice"))
        change_percent = finite_number(item.get("regularMarketChangePercent"))
        stamp = finite_number(item.get("regularMarketTime"))
        session = "regular" if market_state == "REGULAR" else "unknown"

    previous_close = finite_number(item.get("regularMarketPreviousClose")) or finite_number(item.get("previousClose"))
    if price is None or price <= 0 or stamp is None:
        return None
    now = datetime.now(timezone.utc).timestamp()
    if stamp > now + 3600 or now - stamp > 120 * 60 * 60:
        return None
    if change_percent is None and previous_close and previous_close > 0:
        change_percent = (price - previous_close) / previous_close * 100.0
    if change_percent is None or not math.isfinite(change_percent):
        return None
    return {
        "symbol": symbol,
        "name": str(item.get("shortName") or item.get("longName") or symbol),
        "price": round(price, 6),
        "priceChangePercent": round(change_percent, 4),
        "priceTimestamp": int(stamp),
        "marketSession": session,
        "assetType": "stock" if str(item.get("quoteType") or "").upper() != "ETF" else "etf",
        "sector": str(item.get("sector") or item.get("sectorDisp") or STOCK_SECTORS.get(symbol) or "Other"),
    }


def screener_quotes(category):
    try:
        quotes = yf.screen("most_actives", count=100).get("quotes", [])
    except Exception:
        return []
    result = []
    for item in quotes:
        quote_type = str(item.get("quoteType") or item.get("typeDisp") or "").upper()
        is_etf = quote_type == "ETF" or "ETF" in quote_type
        if category == "stocks" and is_etf:
            continue
        if category == "etfs" and not is_etf:
            continue
        parsed = quote_from_screener(item)
        if parsed is None:
            continue
        if category == "stocks":
            parsed["assetType"] = "stock"
            parsed["sector"] = str(item.get("sector") or item.get("sectorDisp") or STOCK_SECTORS.get(parsed["symbol"]) or "Other")
        else:
            parsed["assetType"] = "etf"
            parsed["sector"] = None
        result.append(parsed)
    return result


def get_requested_symbols(category, symbols):
    if category == "custom":
        return symbols
    return UNIVERSES.get(category, [])


def fetch_heat_map(category, symbols):
    requested = get_requested_symbols(category, symbols)
    if category in ("stocks", "etfs"):
        quotes = screener_quotes(category)
        if quotes:
            available = {quote["symbol"]: quote for quote in quotes}
            return available, list(available)

    intraday = download_quotes(requested, category, "5m")
    missing = [symbol for symbol in requested if symbol not in intraday]
    if missing:
        intraday.update(download_quotes(missing, category, "1d"))
    return intraday, requested


def main():
    if len(sys.argv) < 2:
        raise ValueError("category is required")
    category = sys.argv[1].strip().lower()
    if category not in ("stocks", "etfs", "commodities", "futures", "cryptocurrency", "custom"):
        raise ValueError("unsupported category")
    raw_symbols = sys.argv[2].split(",") if len(sys.argv) > 2 and sys.argv[2] else []
    symbols = list(dict.fromkeys(symbol.strip().upper() for symbol in raw_symbols if symbol.strip()))
    if category == "custom" and len(symbols) > 40:
        raise ValueError("custom maps support at most 40 symbols")
    if any(not symbol or len(symbol) > 15 or any(char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.^=-" for char in symbol) for symbol in symbols):
        raise ValueError("invalid ticker symbol")
    quotes_by_symbol, requested = fetch_heat_map(category, symbols)
    ordered_quotes = [quotes_by_symbol[symbol] for symbol in requested if symbol in quotes_by_symbol]
    if category in ("stocks", "etfs") and quotes_by_symbol:
        # Screener results are ranked by activity; preserve that order.
        ordered_quotes = list(quotes_by_symbol.values())
    unavailable = [symbol for symbol in requested if symbol not in quotes_by_symbol]
    response = {
        "category": category,
        "quotes": ordered_quotes,
        "unavailableSymbols": unavailable,
        "updatedAt": int(datetime.now(timezone.utc).timestamp()),
    }
    print(json.dumps(clean_nan(response), allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, allow_nan=False))
        sys.exit(1)