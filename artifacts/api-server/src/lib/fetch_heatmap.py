#!/usr/bin/env python3
"""Fetch one batched, freshness-checked set of market heat-map quotes."""
import calendar
import json
import math
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import yfinance as yf
from yfinance import EquityQuery


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
COMMODITY_SESSION_FAMILIES = {
    "cme_nearly_24h": frozenset(("GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "PL=F", "PA=F")),
    "cme_grains": frozenset(("ZC=F", "ZW=F", "ZS=F")),
    "ice_cotton": frozenset(("CT=F",)),
    "ice_day": frozenset(("KC=F", "SB=F")),
    "cme_livestock": frozenset(("LE=F", "HE=F")),
}
# Temporary ICE notices can be entered here without changing regular schedules.
# Each entry has inclusive start_date/end_date values and a sessions map from
# symbol to weekday (Monday=0) -> (start minute, end minute) windows. End times
# are exclusive; use 1440 for midnight. The windows describe that local date.
ICE_COMMODITY_SCHEDULE_OVERRIDES = ()
# Temporary, confirmed U.S. equity-market closures can be entered here without
# depending on a calendar-package release. Each entry has inclusive
# start_date/end_date values and a timezone-aware reopen_at datetime for the
# next regular open. Use None when the reopening time is not confirmed; the app
# then omits the estimate. Remove an entry after the authoritative calendar is
# current again.
US_EQUITY_TEMPORARY_CLOSURE_OVERRIDES = ()
FUTURE_SYMBOLS = [
    "ES=F", "NQ=F", "YM=F", "RTY=F", "ZN=F", "ZB=F", "ZF=F",
    "6E=F", "6J=F", "6B=F", "6C=F", "DX=F",
]
CME_FUTURES_PRODUCT_GROUPS = {
    "equity_index": frozenset(("ES=F", "NQ=F", "YM=F", "RTY=F")),
    "interest_rates": frozenset(("ZN=F", "ZB=F", "ZF=F")),
    "fx": frozenset(("6E=F", "6J=F", "6B=F", "6C=F")),
}
# DX=F is ICE's U.S. Dollar Index future, not a CME FX future.
OTHER_FUTURES_PRODUCT_GROUPS = {
    "ice_dollar_index": frozenset(("DX=F",)),
}
FUTURES_PRODUCT_GROUP_BY_SYMBOL = {
    symbol: group
    for group, group_symbols in {
        **CME_FUTURES_PRODUCT_GROUPS,
        **OTHER_FUTURES_PRODUCT_GROUPS,
    }.items()
    for symbol in group_symbols
}
# CME Group's published 2026 Thanksgiving schedule has distinct Friday closes
# for FX versus Equities and Interest Rates. Times are Central Time:
# https://www.cmegroup.com/tools-information/holiday-calendar.html
# Keep this exact-date override narrow; CME notes that holiday schedules can change.
CME_FUTURES_HOLIDAY_CLOSES_CT = {
    date(2026, 11, 27): {
        "equity_index": 12 * 60 + 15,
        "interest_rates": 12 * 60 + 15,
        "fx": 13 * 60 + 45,
    },
}
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
PERIOD_LOOKBACKS = {
    "1w": ("days", 7),
    "1m": ("months", 1),
    "3m": ("months", 3),
    "6m": ("months", 6),
    "1y": ("months", 12),
    "3y": ("months", 36),
    "5y": ("months", 60),
}
RISK_BANDS = (
    (15, "Conservative"),
    (25, "Moderate Conservative"),
    (40, "Moderate"),
    (60, "Moderate Aggressive"),
    (math.inf, "Aggressive"),
)
SECTOR_ALIASES = {
    "technology": "Technology",
    "information technology": "Technology",
    "communication services": "Communication Services",
    "consumer cyclical": "Consumer Cyclical",
    "consumer discretionary": "Consumer Cyclical",
    "consumer defensive": "Consumer Defensive",
    "consumer staples": "Consumer Defensive",
    "financials": "Financials",
    "financial services": "Financials",
    "healthcare": "Healthcare",
    "health care": "Healthcare",
    "industrials": "Industrials",
    "real estate": "Real Estate",
    "energy": "Energy",
    "utilities": "Utilities",
    "basic materials": "Basic Materials",
    "materials": "Basic Materials",
}
EXCHANGE_ALIASES = {
    "nms": "NASDAQ", "ngm": "NASDAQ", "ncm": "NASDAQ", "nas": "NASDAQ",
    "nasdaq": "NASDAQ", "nasdaq global select": "NASDAQ", "nasdaq global market": "NASDAQ",
    "nasdaqgs": "NASDAQ", "nasdaqgm": "NASDAQ", "nasdaqcm": "NASDAQ",
    "nyq": "NYSE", "nyse": "NYSE", "new york stock exchange": "NYSE",
    "xnys": "NYSE", "xnas": "NASDAQ",
    "pcx": "NYSE Arca", "arca": "NYSE Arca", "nyse arca": "NYSE Arca",
    "ase": "NYSE American", "amex": "NYSE American", "xase": "NYSE American", "nyse american": "NYSE American",
    "bts": "Cboe", "cboe": "Cboe",
    "otc": "OTC", "pinksheet": "OTC",
    "lse": "London Stock Exchange", "xlon": "London Stock Exchange",
    "london stock exchange": "London Stock Exchange", "london": "London Stock Exchange",
    "jpx": "Tokyo Stock Exchange", "xtks": "Tokyo Stock Exchange",
    "tyo": "Tokyo Stock Exchange", "tokyo": "Tokyo Stock Exchange",
    "tokyo stock exchange": "Tokyo Stock Exchange",
    "hkex": "Hong Kong Stock Exchange", "hkse": "Hong Kong Stock Exchange",
    "xhkg": "Hong Kong Stock Exchange", "hkg": "Hong Kong Stock Exchange",
    "hong kong": "Hong Kong Stock Exchange", "hong kong stock exchange": "Hong Kong Stock Exchange",
    "asx": "Australian Securities Exchange", "xasx": "Australian Securities Exchange",
    "australian securities exchange": "Australian Securities Exchange",
    "tsx": "Toronto Stock Exchange", "tor": "Toronto Stock Exchange",
    "xtse": "Toronto Stock Exchange", "toronto": "Toronto Stock Exchange",
    "toronto stock exchange": "Toronto Stock Exchange",
    "xetr": "Deutsche Börse Xetra", "xetra": "Deutsche Börse Xetra",
    "fra": "Deutsche Börse Xetra", "frankfurt": "Deutsche Börse Xetra",
    "frankfurt stock exchange": "Deutsche Börse Xetra",
    "deutsche börse": "Deutsche Börse Xetra", "deutsche boerse": "Deutsche Börse Xetra",
    "xpar": "Euronext Paris", "par": "Euronext Paris", "paris": "Euronext Paris",
    "euronext paris": "Euronext Paris",
    "xswx": "SIX Swiss Exchange", "six": "SIX Swiss Exchange",
    "swiss": "SIX Swiss Exchange", "six swiss exchange": "SIX Swiss Exchange",
    "xkrx": "Korea Exchange", "krx": "Korea Exchange", "seoul": "Korea Exchange",
    "korea exchange": "Korea Exchange",
    "xtai": "Taiwan Stock Exchange", "tai": "Taiwan Stock Exchange",
    "taiwan": "Taiwan Stock Exchange", "taiwan stock exchange": "Taiwan Stock Exchange",
    "xses": "Singapore Exchange", "ses": "Singapore Exchange",
    "singapore": "Singapore Exchange", "singapore exchange": "Singapore Exchange",
    "xshg": "Shanghai Stock Exchange", "shh": "Shanghai Stock Exchange",
    "shanghai": "Shanghai Stock Exchange", "shanghai stock exchange": "Shanghai Stock Exchange",
    "xams": "Euronext Amsterdam", "ams": "Euronext Amsterdam",
    "amsterdam": "Euronext Amsterdam", "euronext amsterdam": "Euronext Amsterdam",
    "xbru": "Euronext Brussels", "bru": "Euronext Brussels",
    "brussels": "Euronext Brussels", "euronext brussels": "Euronext Brussels",
    "xmad": "Bolsa de Madrid", "mad": "Bolsa de Madrid", "mce": "Bolsa de Madrid",
    "madrid": "Bolsa de Madrid", "bolsa de madrid": "Bolsa de Madrid",
    "xmil": "Borsa Italiana", "mil": "Borsa Italiana",
    "milan": "Borsa Italiana", "borsa italiana": "Borsa Italiana",
}
EXCHANGE_CALENDAR_IDS = {
    "NASDAQ": "XNYS",
    "NYSE": "XNYS",
    "NYSE Arca": "XNYS",
    "NYSE American": "XNYS",
    "Cboe": "XNYS",
    "London Stock Exchange": "XLON",
    "Tokyo Stock Exchange": "XTKS",
    "Hong Kong Stock Exchange": "XHKG",
    "Australian Securities Exchange": "XASX",
    "Toronto Stock Exchange": "XTSE",
    "Deutsche Börse Xetra": "XETR",
    "Euronext Paris": "XPAR",
    "SIX Swiss Exchange": "XSWX",
    "Korea Exchange": "XKRX",
    "Taiwan Stock Exchange": "XTAI",
    "Singapore Exchange": "XSES",
    "Shanghai Stock Exchange": "XSHG",
    "Euronext Amsterdam": "XAMS",
    "Euronext Brussels": "XBRU",
    "Bolsa de Madrid": "XMAD",
    "Borsa Italiana": "XMIL",
}
METADATA_CACHE_PATH = os.path.join(tempfile.gettempdir(), "meisner_heat_map_metadata.json")
METADATA_CACHE_TTL_SECONDS = 24 * 60 * 60
MIN_VOLATILITY_RETURNS = 60
HISTORY_BATCH_SIZE = 40
SECTOR_SCREEN_PAGE_SIZE = 50
MAX_SECTOR_SCREEN_CANDIDATES = 250
MOST_ACTIVE_SCREEN_PAGE_SIZE = 25
MAX_STOCK_BREADTH_SCREEN_RESULTS = 250
MIN_SECTOR_QUOTES = 15
US_EQUITY_EXCHANGES = ("NMS", "NGM", "NCM", "NYQ", "PCX", "ASE", "BTS")
US_EQUITY_EXCHANGE_LABELS = {
    "NASDAQ",
    "NYSE",
    "NYSE Arca",
    "NYSE American",
    "Cboe",
}
VALID_STOCK_SECTORS = frozenset(SECTOR_ALIASES.values())
YAHOO_SECTOR_SCREEN_LABELS = {"Financials": "Financial Services"}


def finite_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def normalize_sector(value, symbol=None):
    raw = str(value or "").strip()
    normalized = SECTOR_ALIASES.get(raw.casefold())
    if normalized:
        return normalized
    if not raw and symbol:
        return STOCK_SECTORS.get(symbol, "Unknown")
    return raw if raw else "Unknown"


def normalize_exchange(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    return EXCHANGE_ALIASES.get(raw.casefold(), raw.upper() if len(raw) <= 6 else raw)


def risk_band_for_volatility(volatility_percent):
    if volatility_percent is None or not math.isfinite(volatility_percent):
        return None
    for upper_bound, label in RISK_BANDS:
        if volatility_percent < upper_bound:
            return label
    return "Aggressive"


def market_cap_bucket(market_cap_usd):
    if market_cap_usd is None or not math.isfinite(market_cap_usd) or market_cap_usd <= 0:
        return None
    if market_cap_usd < 300_000_000:
        return "Micro"
    if market_cap_usd < 2_000_000_000:
        return "Small"
    if market_cap_usd < 10_000_000_000:
        return "Mid"
    if market_cap_usd < 200_000_000_000:
        return "Large"
    return "Mega"


def read_metadata_cache(now=None):
    now_timestamp = as_utc_datetime(now).timestamp()
    try:
        with open(METADATA_CACHE_PATH, "r", encoding="utf-8") as cache_file:
            stored = json.load(cache_file)
        return {
            symbol: item["metadata"]
            for symbol, item in stored.items()
            if isinstance(item, dict)
            and isinstance(item.get("metadata"), dict)
            and now_timestamp - finite_number(item.get("timestamp")) <= METADATA_CACHE_TTL_SECONDS
        }
    except (OSError, ValueError, TypeError):
        return {}


def write_metadata_cache(cache, now=None):
    timestamp = as_utc_datetime(now).timestamp()
    payload = {
        symbol: {"timestamp": timestamp, "metadata": metadata}
        for symbol, metadata in cache.items()
    }
    temp_path = f"{METADATA_CACHE_PATH}.{os.getpid()}.tmp"
    try:
        with open(temp_path, "w", encoding="utf-8") as cache_file:
            json.dump(payload, cache_file, allow_nan=False)
        os.replace(temp_path, METADATA_CACHE_PATH)
    except OSError:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def metadata_from_provider(info, symbol, asset_type):
    sector_value = info.get("sectorDisp") or info.get("sector")
    sector = normalize_sector(sector_value, symbol) if asset_type == "stock" else None
    market_cap = (
        finite_number(info.get("marketCap"))
        if asset_type == "stock" and str(info.get("currency") or "").upper() == "USD"
        else None
    )
    return {
        "sector": sector,
        "exchange": normalize_exchange(info.get("fullExchangeName") or info.get("exchange")),
        "marketCapUsd": market_cap if market_cap and market_cap > 0 else None,
    }


def merge_metadata(primary, fallback, asset_type):
    result = dict(primary or {})
    backup = fallback or {}
    for field in ("sector", "exchange", "marketCapUsd"):
        missing = result.get(field) is None or (field == "sector" and result.get(field) == "Unknown")
        if missing and backup.get(field) is not None:
            result[field] = backup[field]
    if asset_type == "stock":
        result["sector"] = normalize_sector(result.get("sector"))
    else:
        result["sector"] = None
        result["marketCapUsd"] = None
    result["exchange"] = normalize_exchange(result.get("exchange"))
    return result


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


def as_utc_datetime(value=None):
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@lru_cache(maxsize=1)
def us_equity_calendar():
    import exchange_calendars

    return exchange_calendars.get_calendar("XNYS")


@lru_cache(maxsize=32)
def calendar_for_exchange(exchange):
    normalized = normalize_exchange(exchange)
    calendar_id = EXCHANGE_CALENDAR_IDS.get(normalized)
    if calendar_id is None:
        return None
    try:
        if calendar_id == "XNYS":
            return us_equity_calendar()
        import exchange_calendars

        return exchange_calendars.get_calendar(calendar_id)
    except Exception:
        return None


def exchange_timezone(exchange):
    exchange_calendar = calendar_for_exchange(exchange)
    if exchange_calendar is None:
        return None
    return getattr(exchange_calendar.tz, "key", None)


def temporary_us_equity_closure_for_date(session_date, exchange):
    if normalize_exchange(exchange) not in US_EQUITY_EXCHANGE_LABELS:
        return False, None
    matches = []
    for override in US_EQUITY_TEMPORARY_CLOSURE_OVERRIDES:
        start_date = override.get("start_date")
        end_date = override.get("end_date")
        if (
            isinstance(start_date, date)
            and isinstance(end_date, date)
            and start_date <= session_date <= end_date
        ):
            matches.append(override)
    if not matches:
        return False, None

    reopen_times = []
    for override in matches:
        reopen_at = override.get("reopen_at")
        if not isinstance(reopen_at, datetime) or reopen_at.tzinfo is None:
            return True, None
        reopen_times.append(reopen_at.astimezone(timezone.utc))
    return True, max(reopen_times)


def active_temporary_us_equity_closure(now, exchange):
    if normalize_exchange(exchange) not in US_EQUITY_EXCHANGE_LABELS:
        return False, None
    as_of = as_utc_datetime(now)
    local_date = as_of.astimezone(ZoneInfo("America/New_York")).date()
    active_reopen_times = []
    has_unconfirmed_reopen = False
    for override in US_EQUITY_TEMPORARY_CLOSURE_OVERRIDES:
        start_date = override.get("start_date")
        end_date = override.get("end_date")
        if not isinstance(start_date, date) or not isinstance(end_date, date):
            continue
        if start_date > local_date:
            continue
        reopen_at = override.get("reopen_at")
        if not isinstance(reopen_at, datetime) or reopen_at.tzinfo is None:
            has_unconfirmed_reopen = True
            continue
        reopen_at = reopen_at.astimezone(timezone.utc)
        if reopen_at > as_of:
            active_reopen_times.append(reopen_at)
    if has_unconfirmed_reopen:
        return True, None
    if active_reopen_times:
        return True, max(active_reopen_times)
    return False, None


def next_regular_open_timestamp(now=None, exchange=None):
    as_of = as_utc_datetime(now)
    closure_active, reopen_at = active_temporary_us_equity_closure(as_of, exchange)
    if closure_active:
        return int(reopen_at.timestamp()) if reopen_at is not None else None
    try:
        calendar = calendar_for_exchange(exchange)
        if calendar is None:
            return None
        current_date = as_of.astimezone(calendar.tz).date()
        sessions = calendar.sessions_in_range(
            current_date.isoformat(),
            (current_date + timedelta(days=14)).isoformat(),
        )
        for session in sessions:
            session_open = calendar.session_open(session).to_pydatetime()
            if session_open.tzinfo is None:
                session_open = session_open.replace(tzinfo=timezone.utc)
            session_open = session_open.astimezone(timezone.utc)
            if session_open > as_of:
                session_date = session_open.astimezone(calendar.tz).date()
                is_override_closure, override_reopen_at = temporary_us_equity_closure_for_date(
                    session_date,
                    exchange,
                )
                if is_override_closure:
                    if override_reopen_at is None:
                        return None
                    if override_reopen_at > as_of:
                        return int(override_reopen_at.timestamp())
                    continue
                return int(session_open.timestamp())
    except Exception:
        return None
    return None


@lru_cache(maxsize=1)
def cme_futures_calendar():
    import exchange_calendars

    # Use the bundled CMES calendar as a deterministic, offline holiday source.
    # Its holiday and special-close rules are maintained by exchange_calendars.
    # Juneteenth is handled separately because this calendar's built-in rules
    # predate that holiday. CME's published Globex hours are the venue reference:
    # https://www.cmegroup.com/tools-information/holiday-calendar.html
    return exchange_calendars.get_calendar("CMES")


def cme_futures_group_holiday_session(symbol, current):
    group = FUTURES_PRODUCT_GROUP_BY_SYMBOL.get(symbol)
    if group not in CME_FUTURES_PRODUCT_GROUPS:
        return None
    central = current.astimezone(ZoneInfo("America/Chicago"))
    group_closes = CME_FUTURES_HOLIDAY_CLOSES_CT.get(central.date())
    if group_closes is None:
        return None
    close_minute = group_closes.get(group)
    if close_minute is None:
        return None
    current_minute = central.hour * 60 + central.minute
    return "regular" if current_minute < close_minute else "closed"


def observed_juneteenth(year):
    holiday = date(year, 6, 19)
    if holiday.weekday() == 5:
        return holiday - timedelta(days=1)
    if holiday.weekday() == 6:
        return holiday + timedelta(days=1)
    return holiday


def commodity_session_family(symbol):
    for family, symbols in COMMODITY_SESSION_FAMILIES.items():
        if symbol in symbols:
            return family
    return None

def ice_commodity_schedule_override(symbol, current):
    for override in ICE_COMMODITY_SCHEDULE_OVERRIDES:
        if (
            override["start_date"] <= current.date() <= override["end_date"]
            and symbol in override["sessions"]
        ):
            return override["sessions"][symbol]
    return None
def commodity_market_is_open(symbol, current):
    family = commodity_session_family(symbol)
    weekday = current.weekday()
    minute = current.hour * 60 + current.minute

    if family in ("ice_cotton", "ice_day"):
        override = ice_commodity_schedule_override(symbol, current)
        if override is not None:
            return any(
                start_minute <= minute < end_minute
                for start_minute, end_minute in override.get(weekday, ())
            )

    if family == "cme_nearly_24h":
        return not (
            weekday == 5
            or (weekday == 6 and minute < 18 * 60)
            or (weekday == 4 and minute >= 17 * 60)
            or (weekday < 5 and 17 * 60 <= minute < 18 * 60)
        )
    if family == "cme_grains":
        overnight = weekday < 5 and minute < 8 * 60 + 45
        daytime = weekday < 5 and 9 * 60 + 30 <= minute < 14 * 60 + 20
        evening = (weekday < 4 or weekday == 6) and minute >= 20 * 60
        return overnight or daytime or evening
    if family == "ice_cotton":
        overnight_or_daytime = weekday < 5 and minute < 14 * 60 + 20
        evening = (weekday < 4 or weekday == 6) and minute >= 21 * 60
        return overnight_or_daytime or evening
    if family == "ice_day":
        start, end = (4 * 60 + 15, 13 * 60 + 30) if symbol == "KC=F" else (3 * 60 + 30, 13 * 60)
        return weekday < 5 and start <= minute < end
    if family == "cme_livestock":
        return weekday < 5 and 9 * 60 + 30 <= minute < 14 * 60 + 5
    return None


def market_session(timestamp, asset_type, now=None, symbol=None, exchange=None):
    as_of = as_utc_datetime(now)
    age_seconds = as_of.timestamp() - timestamp
    if asset_type == "cryptocurrency":
        return "regular" if age_seconds <= 30 * 60 else "closed"
    if asset_type in ("stock", "etf"):
        if age_seconds > 30 * 60:
            return "closed"
        return equity_market_session(timestamp, as_of, exchange)
    try:
        local = datetime.fromtimestamp(timestamp, ZoneInfo("America/New_York"))
        current = as_of.astimezone(ZoneInfo("America/New_York"))
    except Exception:
        return "unknown"
    if asset_type == "future":
        if age_seconds > 30 * 60:
            return "closed"
        minute = current.hour * 60 + current.minute
        weekday = current.weekday()
        if (
            weekday == 5
            or (weekday == 6 and minute < 18 * 60)
            or (weekday == 4 and minute >= 17 * 60)
            or (weekday < 5 and 17 * 60 <= minute < 18 * 60)
        ):
            return "closed"
        if current.date() == observed_juneteenth(current.year) and minute >= 13 * 60:
            return "closed"
        group_session = cme_futures_group_holiday_session(symbol, current)
        if group_session is not None:
            return group_session
        try:
            is_open = cme_futures_calendar().is_open_on_minute(current)
        except Exception:
            return "unknown"
        return "regular" if is_open else "closed"
    if asset_type == "commodity":
        if age_seconds > 30 * 60:
            return "closed"
        is_open = commodity_market_is_open(symbol, current)
        if is_open is None:
            return "unknown"
        return "regular" if is_open else "closed"
    if local.date() != current.date() or local.weekday() >= 5:
        return "closed"
    return "unknown"


def equity_market_session(timestamp, as_of, exchange):
    closure_active, _ = active_temporary_us_equity_closure(as_of, exchange)
    if closure_active:
        return "closed"
    exchange_calendar = calendar_for_exchange(exchange)
    if exchange_calendar is None:
        return "unknown"
    try:
        local = datetime.fromtimestamp(timestamp, exchange_calendar.tz)
        current = as_of.astimezone(exchange_calendar.tz)
        if local.date() != current.date():
            return "closed"
        session = local.date().isoformat()
        if not exchange_calendar.is_session(session):
            return "closed"
        market_open = exchange_calendar.session_open(session).to_pydatetime().astimezone(
            exchange_calendar.tz
        )
        market_close = exchange_calendar.session_close(session).to_pydatetime().astimezone(
            exchange_calendar.tz
        )
    except Exception:
        return "unknown"
    if local < market_open:
        return "pre_market" if exchange_calendar.name == "XNYS" and local.hour >= 4 else "closed"
    if local < market_close:
        try:
            return "regular" if exchange_calendar.is_open_on_minute(local) else "closed"
        except Exception:
            return "unknown"
    if exchange_calendar.name == "XNYS" and local.hour < 20:
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
            prior_rows.append((row_date, price))
    return max(prior_rows, key=lambda row: row[0])[1] if prior_rows else None


def daily_rows_from_frame(frame, symbol):
    daily_frame = frame_for_symbol(frame, symbol)
    if daily_frame is None or "Close" not in daily_frame:
        return []
    rows = []
    for index_value, raw_price in daily_frame["Close"].items():
        price = finite_number(raw_price)
        if price is None or price <= 0:
            continue
        try:
            day = index_value.date()
        except Exception:
            continue
        adjusted_price = None
        if "Adj Close" in daily_frame:
            try:
                adjusted_price = finite_number(daily_frame["Adj Close"].loc[index_value])
            except (KeyError, TypeError, ValueError):
                adjusted_price = None
        rows.append({"date": day, "close": price, "adjusted": adjusted_price})
    return sorted(rows, key=lambda row: row["date"])


def date_for_timestamp(timestamp, asset_type):
    timezone_name = "UTC" if asset_type == "cryptocurrency" else "America/New_York"
    try:
        return datetime.fromtimestamp(timestamp, ZoneInfo(timezone_name)).date()
    except Exception:
        return datetime.fromtimestamp(timestamp, timezone.utc).date()


def return_baseline(rows, period, quote_day, now_day):
    if not rows:
        return None
    if period == "1d":
        return next((row for row in reversed(rows) if row["date"] < quote_day), None)
    if period == "max":
        return rows[0]
    lookback = PERIOD_LOOKBACKS.get(period)
    if lookback is None:
        return None
    unit, count = lookback
    if unit == "days":
        target_day = now_day - timedelta(days=count)
    else:
        month_index = now_day.year * 12 + now_day.month - 1 - count
        target_year, target_month_zero_based = divmod(month_index, 12)
        target_month = target_month_zero_based + 1
        target_day_of_month = min(now_day.day, calendar.monthrange(target_year, target_month)[1])
        target_day = now_day.replace(year=target_year, month=target_month, day=target_day_of_month)
    return next((row for row in reversed(rows) if row["date"] <= target_day), None)


def daily_volatility_percent(rows, asset_type, now_day, use_adjusted):
    year_start = now_day - timedelta(days=365)
    prices = [
        row["adjusted"] if use_adjusted else row["close"]
        for row in rows
        if year_start <= row["date"] <= now_day
        and (row["adjusted"] if use_adjusted else row["close"]) is not None
    ]
    daily_returns = [
        (prices[index] / prices[index - 1]) - 1
        for index in range(1, len(prices))
        if prices[index - 1] > 0 and math.isfinite(prices[index] / prices[index - 1])
    ]
    if len(daily_returns) < MIN_VOLATILITY_RETURNS:
        return None
    mean_return = sum(daily_returns) / len(daily_returns)
    variance = sum((value - mean_return) ** 2 for value in daily_returns) / (len(daily_returns) - 1)
    annualization_days = 365 if asset_type == "cryptocurrency" else 252
    return math.sqrt(variance) * math.sqrt(annualization_days) * 100


def enrich_quote_with_history(quote, frame, period, now=None):
    rows = daily_rows_from_frame(frame, quote["symbol"])
    asset_type = quote["assetType"]
    now_datetime = as_utc_datetime(now)
    quote_day = date_for_timestamp(quote["priceTimestamp"], asset_type) if quote.get("priceTimestamp") else now_datetime.date()
    basis_adjustable = asset_type in ("stock", "etf") and bool(rows) and all(
        row["adjusted"] is not None and row["adjusted"] > 0 for row in rows
    )
    selected_basis = "adjusted_total_return" if basis_adjustable else "price_return_proxy"
    selected_price_field = "adjusted" if basis_adjustable else "close"
    scale_row = next((row for row in reversed(rows) if row["date"] <= quote_day), rows[-1] if rows else None)
    scale = (
        scale_row["adjusted"] / scale_row["close"]
        if basis_adjustable and scale_row and scale_row["close"] > 0
        else 1.0
    )
    current_price = quote["price"] * scale
    baseline = return_baseline(rows, period, quote_day, now_datetime.date())
    baseline_price = baseline.get(selected_price_field) if baseline else None
    return_percent = None
    unavailable_reason = None
    if baseline_price is None or baseline_price <= 0:
        unavailable_reason = "Not enough history for the selected period"
    else:
        candidate = (current_price / baseline_price - 1) * 100
        if math.isfinite(candidate):
            return_percent = round(candidate, 4)
        else:
            unavailable_reason = "No valid baseline close for the selected period"
    start_date = rows[0]["date"].isoformat() if rows else None
    volatility = daily_volatility_percent(
        rows,
        asset_type,
        now_datetime.date(),
        basis_adjustable,
    )
    volatility = round(volatility, 4) if volatility is not None else None
    quote.update({
        "returnPercent": return_percent,
        "returnBasis": selected_basis,
        "returnUnavailableReason": unavailable_reason,
        "historyStartDate": start_date,
        "annualizedVolatilityPercent": volatility,
        "riskBand": risk_band_for_volatility(volatility),
    })
    return quote


def quote_from_frame(
    frame,
    symbol,
    category,
    require_prior_close=True,
    previous_close=None,
    now=None,
    exchange=None,
):
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
    if asset_type == "future" or symbol.endswith("=F"):
        max_age = 24 * 60 * 60
    as_of = as_utc_datetime(now)
    now_timestamp = as_of.timestamp()
    if latest_timestamp > now_timestamp + 3600 or now_timestamp - latest_timestamp > max_age:
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
    session = market_session(
        latest_timestamp,
        asset_type,
        now=as_of,
        symbol=symbol,
        exchange=exchange,
    )
    next_open = (
        next_regular_open_timestamp(as_of, exchange)
        if asset_type in ("stock", "etf") and session in ("closed", "after_hours")
        else None
    )
    return {
        "symbol": symbol,
        "name": symbol,
        "price": round(latest_price, 6),
        "priceChangePercent": round(change_percent, 4),
        "returnPercent": None,
        "returnBasis": "adjusted_total_return" if asset_type in ("stock", "etf") else "price_return_proxy",
        "returnUnavailableReason": None,
        "historyStartDate": None,
        "priceTimestamp": latest_timestamp,
        "marketSession": session,
        "nextRegularOpenTimestamp": next_open,
        "assetType": asset_type,
        "sector": normalize_sector(STOCK_SECTORS.get(symbol), symbol) if asset_type == "stock" else None,
        "exchange": normalize_exchange(exchange),
        "exchangeTimezone": exchange_timezone(exchange),
        "marketCapUsd": None,
        "annualizedVolatilityPercent": None,
        "riskBand": None,
    }


def download_quotes(symbols, category, interval, now=None):
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
                now=now,
            )
            if quote:
                quotes[symbol] = quote
        except Exception:
            continue
    return quotes


def quote_from_screener(item, now=None):
    symbol = str(item.get("symbol") or "").upper().strip()
    if not symbol:
        return None
    asset_type = "stock" if str(item.get("quoteType") or "").upper() != "ETF" else "etf"
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
    as_of = as_utc_datetime(now)
    now_timestamp = as_of.timestamp()
    if stamp > now_timestamp + 3600 or now_timestamp - stamp > 120 * 60 * 60:
        return None
    if change_percent is None and previous_close and previous_close > 0:
        change_percent = (price - previous_close) / previous_close * 100.0
    if change_percent is None or not math.isfinite(change_percent):
        return None
    exchange = normalize_exchange(item.get("fullExchangeName") or item.get("exchange"))
    if asset_type in ("stock", "etf"):
        session = market_session(
            stamp,
            asset_type,
            now=as_of,
            symbol=symbol,
            exchange=exchange,
        )
    elif market_state in ("PRE", "PREPRE", "REGULAR", "POST", "POSTPOST"):
        session = market_session(stamp, asset_type, now=as_of, symbol=symbol)
    next_open = (
        next_regular_open_timestamp(as_of, exchange)
        if asset_type in ("stock", "etf") and session in ("closed", "after_hours")
        else None
    )
    metadata = {
        "sector": normalize_sector(item.get("sectorDisp") or item.get("sector"), symbol) if asset_type == "stock" else None,
        "exchange": exchange,
        "marketCapUsd": (
            finite_number(item.get("marketCap"))
            if asset_type == "stock" and str(item.get("currency") or "").upper() == "USD"
            else None
        ),
    }
    if metadata["marketCapUsd"] is not None and metadata["marketCapUsd"] <= 0:
        metadata["marketCapUsd"] = None
    return {
        "symbol": symbol,
        "name": str(item.get("shortName") or item.get("longName") or symbol),
        "price": round(price, 6),
        "priceChangePercent": round(change_percent, 4),
        "returnPercent": None,
        "returnBasis": "adjusted_total_return" if asset_type in ("stock", "etf") else "price_return_proxy",
        "returnUnavailableReason": None,
        "historyStartDate": None,
        "priceTimestamp": int(stamp),
        "marketSession": session,
        "nextRegularOpenTimestamp": next_open,
        "assetType": asset_type,
        "sector": metadata["sector"],
        "exchange": metadata["exchange"],
        "exchangeTimezone": exchange_timezone(metadata["exchange"]),
        "marketCapUsd": metadata["marketCapUsd"],
        "annualizedVolatilityPercent": None,
        "riskBand": None,
    }


def build_sector_screen_query(sector):
    normalized_sector = normalize_sector(sector)
    if normalized_sector not in VALID_STOCK_SECTORS:
        raise ValueError("unsupported stock sector")
    provider_sector = YAHOO_SECTOR_SCREEN_LABELS.get(normalized_sector, normalized_sector)
    return EquityQuery("and", [
        EquityQuery("eq", ["region", "us"]),
        EquityQuery("eq", ["sector", provider_sector]),
        EquityQuery("is-in", ["exchange", *US_EQUITY_EXCHANGES]),
    ])


def sector_screener_quotes(sector):
    query = build_sector_screen_query(sector)
    result = {}
    offset = 0
    while offset < MAX_SECTOR_SCREEN_CANDIDATES:
        page_size = min(SECTOR_SCREEN_PAGE_SIZE, MAX_SECTOR_SCREEN_CANDIDATES - offset)
        try:
            response = yf.screen(
                query,
                offset=offset,
                size=page_size,
                sortField="dayvolume",
                sortAsc=False,
            )
        except Exception:
            break
        rows = response.get("quotes", []) if isinstance(response, dict) else []
        if not isinstance(rows, list) or not rows:
            break
        for item in rows:
            if not isinstance(item, dict):
                continue
            exchange = normalize_exchange(item.get("exchange") or item.get("fullExchangeName"))
            if exchange not in US_EQUITY_EXCHANGE_LABELS:
                continue
            if str(item.get("quoteType") or item.get("typeDisp") or "").upper() == "ETF":
                continue
            parsed = quote_from_screener(item)
            if parsed is None:
                continue
            parsed["assetType"] = "stock"
            # Yahoo's equity screener applies the sector query but omits sector
            # fields from its quote rows, so retain the verified query label.
            parsed["sector"] = normalize_sector(sector)
            result.setdefault(parsed["symbol"], parsed)
        offset += len(rows)
        total = finite_number(response.get("total")) if isinstance(response, dict) else None
        if len(result) >= MIN_SECTOR_QUOTES:
            break
        if total is not None and offset >= total:
            break
        if total is None and len(rows) < page_size:
            break
    return list(result.values())


def most_active_screen_rows(max_results):
    rows = []
    offset = 0
    while offset < max_results:
        page_size = min(MOST_ACTIVE_SCREEN_PAGE_SIZE, max_results - offset)
        try:
            response = yf.screen("most_actives", count=page_size, offset=offset)
        except Exception:
            break
        page = response.get("quotes", []) if isinstance(response, dict) else []
        if not page:
            break
        rows.extend(page[:max_results - len(rows)])
        offset += len(page)
        total = finite_number(response.get("total"))
        if (total is not None and offset >= total) or len(page) < page_size:
            break
    return rows


def screener_quotes(category, sector=None):
    if category == "stocks" and sector is not None:
        targeted_quotes = sector_screener_quotes(sector)
        if len(targeted_quotes) >= MIN_SECTOR_QUOTES:
            return targeted_quotes
        # If the provider's targeted result is temporarily sparse, preserve any
        # matching liquid names already available from the standard screener.
        merged = {quote["symbol"]: quote for quote in targeted_quotes}
        for quote in screener_quotes(category):
            if quote.get("sector") == normalize_sector(sector):
                merged.setdefault(quote["symbol"], quote)
        return list(merged.values())

    try:
        quotes = (
            most_active_screen_rows(MAX_STOCK_BREADTH_SCREEN_RESULTS)
            if category == "stocks"
            else yf.screen("most_actives", count=100).get("quotes", [])
        )
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
            parsed["sector"] = normalize_sector(item.get("sectorDisp") or item.get("sector"), parsed["symbol"])
        else:
            parsed["assetType"] = "etf"
            parsed["sector"] = None
        result.append(parsed)
    return result


def get_requested_symbols(category, symbols):
    if category == "custom":
        return symbols
    return UNIVERSES.get(category, [])


def fetch_provider_info(symbol):
    try:
        return yf.Ticker(symbol).get_info()
    except Exception:
        return {}


def enrich_quote_metadata(quotes_by_symbol, now=None):
    cached = read_metadata_cache(now)
    symbols_to_fetch = []
    for symbol, quote in quotes_by_symbol.items():
        asset_type = quote["assetType"]
        cached_metadata = cached.get(symbol, {})
        metadata = merge_metadata(
            {
                "sector": quote.get("sector"),
                "exchange": quote.get("exchange"),
                "marketCapUsd": quote.get("marketCapUsd"),
            },
            cached_metadata,
            asset_type,
        )
        quote.update(metadata)
        if asset_type in ("stock", "etf") and (
            (asset_type == "stock" and metadata["sector"] == "Unknown")
            or metadata["exchange"] is None
            or (asset_type == "stock" and metadata["marketCapUsd"] is None)
        ) and symbol not in cached:
            symbols_to_fetch.append(symbol)

    if symbols_to_fetch:
        fetched = {}
        with ThreadPoolExecutor(max_workers=min(8, len(symbols_to_fetch))) as executor:
            futures = {executor.submit(fetch_provider_info, symbol): symbol for symbol in symbols_to_fetch}
            for future in as_completed(futures):
                symbol = futures[future]
                try:
                    fetched[symbol] = future.result()
                except Exception:
                    fetched[symbol] = {}
        for symbol, info in fetched.items():
            quote = quotes_by_symbol[symbol]
            provider_metadata = metadata_from_provider(info, symbol, quote["assetType"])
            merged = merge_metadata(
                {
                    "sector": quote.get("sector"),
                    "exchange": quote.get("exchange"),
                    "marketCapUsd": quote.get("marketCapUsd"),
                },
                provider_metadata,
                quote["assetType"],
            )
            quote.update(merged)
            cached[symbol] = merge_metadata(provider_metadata, cached.get(symbol), quote["assetType"])
    write_metadata_cache(cached, now)
    for quote in quotes_by_symbol.values():
        if quote["assetType"] in ("stock", "etf"):
            exchange = quote.get("exchange")
            quote["exchangeTimezone"] = exchange_timezone(exchange)
            session = market_session(
                quote.get("priceTimestamp"),
                quote["assetType"],
                now=now,
                symbol=quote.get("symbol"),
                exchange=exchange,
            )
            quote["marketSession"] = session
            quote["nextRegularOpenTimestamp"] = (
                next_regular_open_timestamp(now, exchange)
                if session in ("closed", "after_hours")
                else None
            )
    return quotes_by_symbol


def download_history(symbols, period):
    histories = {}
    if not symbols:
        return histories
    for start in range(0, len(symbols), HISTORY_BATCH_SIZE):
        batch = symbols[start:start + HISTORY_BATCH_SIZE]
        try:
            data = yf.download(
                tickers=" ".join(batch),
                period=period,
                interval="1d",
                prepost=False,
                auto_adjust=False,
                actions=False,
                group_by="ticker",
                threads=True,
                progress=False,
                timeout=35,
            )
        except Exception:
            continue
        for symbol in batch:
            frame = frame_for_symbol(data, symbol)
            if frame is not None:
                histories[symbol] = frame
    return histories


def fetch_heat_map(category, symbols, period="1d", sector=None, now=None):
    requested = get_requested_symbols(category, symbols)
    quotes_by_symbol = {}
    if category in ("stocks", "etfs"):
        screened = screener_quotes(category, sector)
        if screened:
            quotes_by_symbol = {quote["symbol"]: quote for quote in screened}
            requested = list(quotes_by_symbol)

    if not quotes_by_symbol:
        intraday = download_quotes(requested, category, "5m", now=now)
        missing = [symbol for symbol in requested if symbol not in intraday]
        if missing:
            intraday.update(download_quotes(missing, category, "1d", now=now))
        quotes_by_symbol = intraday

    enrich_quote_metadata(quotes_by_symbol, now)
    history_period = "max" if period == "max" else ("2y" if period in ("1d", "1w", "1m", "3m", "6m", "1y") else "5y")
    histories = download_history(list(quotes_by_symbol), history_period)
    for symbol, quote in quotes_by_symbol.items():
        enrich_quote_with_history(quote, histories.get(symbol), period, now=now)
    return quotes_by_symbol, requested


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
    period = sys.argv[3].strip().lower() if len(sys.argv) > 3 and sys.argv[3] else "1d"
    if period not in ("1d", "1w", "1m", "3m", "6m", "1y", "3y", "5y", "max"):
        raise ValueError("unsupported period")
    raw_sector = sys.argv[4].strip() if len(sys.argv) > 4 and sys.argv[4] else ""
    requested_sector = normalize_sector(raw_sector) if raw_sector else None
    if requested_sector is not None and (category != "stocks" or requested_sector not in VALID_STOCK_SECTORS):
        raise ValueError("unsupported sector filter")
    quotes_by_symbol, requested = fetch_heat_map(category, symbols, period, requested_sector)
    ordered_quotes = [quotes_by_symbol[symbol] for symbol in requested if symbol in quotes_by_symbol]
    if category in ("stocks", "etfs") and quotes_by_symbol:
        # Screener results are ranked by activity; preserve that order.
        ordered_quotes = list(quotes_by_symbol.values())
    unavailable = [symbol for symbol in requested if symbol not in quotes_by_symbol]
    response = {
        "category": category,
        "period": period,
        "requestedSector": requested_sector,
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
