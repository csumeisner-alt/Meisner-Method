#!/usr/bin/env python3
"""Stock/market detail fields for the heat-map detail card and paper trading."""
import sys
import json
import math
import re
from datetime import datetime, timezone
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
import yfinance as yf

SECTOR_LABELS = {
    "realestate": "Real Estate",
    "consumer_cyclical": "Consumer Cyclical",
    "basic_materials": "Basic Materials",
    "consumer_defensive": "Consumer Defensive",
    "technology": "Technology",
    "communication_services": "Communication Services",
    "financial_services": "Financial Services",
    "utilities": "Utilities",
    "industrials": "Industrials",
    "energy": "Energy",
    "healthcare": "Healthcare",
}
REGIME_NAMES = ("bull", "bear", "mixed")
COINPAPRIKA_API_ROOT = "https://api.coinpaprika.com/v1"
COINPAPRIKA_TIMEOUT_SECONDS = 2.0


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


def first_present(info, *keys):
    """Return the first provider value that is present, preserving valid zeroes."""
    for key in keys:
        value = info.get(key)
        if value is not None:
            return value
    return None


def finite_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def get_max_supply_status(info):
    """Classify Yahoo's explicit maxSupply value without guessing from absence.

    Yahoo reports 0 for cryptocurrencies with no fixed supply cap. Missing,
    null, non-finite, and invalid values remain unreported.
    """
    value = info.get("maxSupply")
    if isinstance(value, bool):
        return "unreported"
    max_supply = finite_number(value)
    if max_supply is None or max_supply < 0:
        return "unreported"
    return "uncapped" if max_supply == 0 else "capped"


def normalize_crypto_name(value):
    if not isinstance(value, str):
        return ""
    name = re.sub(r"\s+(?:USD|US DOLLAR)$", "", value.strip(), flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]", "", name.casefold())


def choose_coinpaprika_coin_id(symbol, yahoo_name, search_result):
    """Choose an exact, active CoinPaprika symbol match without guessing."""
    base_symbol = str(symbol or "").upper().split("-", 1)[0].strip()
    currencies = search_result.get("currencies") if isinstance(search_result, dict) else None
    if not base_symbol or not isinstance(currencies, list):
        return None

    exact_matches = [
        coin for coin in currencies
        if isinstance(coin, dict)
        and str(coin.get("symbol") or "").strip().upper() == base_symbol
        and coin.get("is_active") is not False
        and isinstance(coin.get("id"), str)
        and coin["id"].strip()
    ]
    if len(exact_matches) == 1:
        return exact_matches[0]["id"].strip()

    normalized_name = normalize_crypto_name(yahoo_name)
    name_matches = [
        coin for coin in exact_matches
        if normalized_name
        and normalize_crypto_name(coin.get("name")) == normalized_name
    ]
    return name_matches[0]["id"].strip() if len(name_matches) == 1 else None


def fetch_coinpaprika_json(url):
    """Fetch a small CoinPaprika response; provider outages never fail the detail card."""
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MeisnerMethod/1.0",
        },
    )
    try:
        with urlopen(request, timeout=COINPAPRIKA_TIMEOUT_SECONDS) as response:
            if getattr(response, "status", 200) != 200:
                return None
            body = response.read(256 * 1024)
        return json.loads(body.decode("utf-8"))
    except Exception:
        return None


def fetch_coinpaprika_max_supply(symbol, info):
    """Look up a matching CoinPaprika asset and return only a positive reported cap."""
    if str(info.get("quoteType") or "").strip().upper() != "CRYPTOCURRENCY":
        return None

    base_symbol = str(symbol or "").upper().split("-", 1)[0].strip()
    if not base_symbol:
        return None
    search_query = urlencode({
        "q": base_symbol,
        "c": "currencies",
        "modifier": "symbol_search",
        "limit": 50,
    })
    search_result = fetch_coinpaprika_json(
        f"{COINPAPRIKA_API_ROOT}/search?{search_query}",
    )
    coin_id = choose_coinpaprika_coin_id(
        base_symbol,
        info.get("longName") or info.get("shortName"),
        search_result,
    )
    if not coin_id:
        return None

    ticker = fetch_coinpaprika_json(
        f"{COINPAPRIKA_API_ROOT}/tickers/{quote(coin_id, safe='')}",
    )
    if (
        not isinstance(ticker, dict)
        or ticker.get("id") != coin_id
        or str(ticker.get("symbol") or "").strip().upper() != base_symbol
    ):
        return None

    raw_max_supply = ticker.get("max_supply")
    if isinstance(raw_max_supply, bool):
        return None
    max_supply = finite_number(raw_max_supply)
    # CoinPaprika documents unavailable values as empty. Do not infer "uncapped"
    # from a zero or missing secondary-provider value.
    return max_supply if max_supply is not None and max_supply > 0 else None


def resolve_max_supply(info, secondary_max_supply=None):
    """Prefer Yahoo's explicit report, fall back to a positive CoinPaprika cap.

    A disagreement is surfaced separately so callers can preserve the primary
    value while warning users not to treat the circulating-share calculation
    as settled.
    """
    yahoo_status = get_max_supply_status(info)
    yahoo_value = info.get("maxSupply")
    if isinstance(yahoo_value, bool):
        yahoo_value = None
    yahoo_supply = finite_number(yahoo_value)
    if yahoo_status == "capped" and (yahoo_supply is None or yahoo_supply <= 0):
        yahoo_status = "unreported"
    elif yahoo_status == "uncapped":
        yahoo_supply = 0

    if isinstance(secondary_max_supply, bool):
        secondary_max_supply = None
    secondary_supply = finite_number(secondary_max_supply)
    if secondary_supply is None or secondary_supply <= 0:
        secondary_supply = None

    if yahoo_status in ("capped", "uncapped"):
        conflict = secondary_supply is not None and (
            yahoo_status == "uncapped"
            or not math.isclose(
                yahoo_supply,
                secondary_supply,
                rel_tol=1e-6,
                abs_tol=1e-8,
            )
        )
        return yahoo_supply, yahoo_status, "Yahoo Finance", conflict

    if secondary_supply is not None:
        return secondary_supply, "capped", "CoinPaprika", False

    return None, "unreported", None, False


def get_expense_ratio(info):
    """Return annual fund costs as a decimal fraction."""
    annual_ratio = finite_number(info.get("annualReportExpenseRatio"))
    if annual_ratio is not None:
        return annual_ratio if annual_ratio >= 0 else None

    for key in ("netExpenseRatio", "grossExpenseRatio"):
        percent_ratio = finite_number(info.get(key))
        if percent_ratio is not None:
            return percent_ratio / 100 if percent_ratio >= 0 else None
    return None


def get_fund_yield(info):
    candidates = []
    for key in ("yield", "dividendYield"):
        value = finite_number(info.get(key))
        if value is None or value < 0:
            continue
        candidates.append(value / 100 if value > 0.5 else value)
    return next((value for value in candidates if value > 0), candidates[0] if candidates else None)


def get_dominant_sector(sector_weightings):
    if not isinstance(sector_weightings, dict):
        return None, None

    candidates = []
    for key, value in sector_weightings.items():
        weight = finite_number(value)
        if weight is None or weight <= 0:
            continue
        label = SECTOR_LABELS.get(str(key), str(key).replace("_", " ").title())
        candidates.append((label, weight))

    return max(candidates, key=lambda item: item[1]) if candidates else (None, None)


def normalize_top_holdings(rows):
    holdings = []
    for row in rows[:5] if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        name = str(row.get("name") or symbol).strip()
        weight = finite_number(row.get("weight"))
        if not symbol or not name or weight is None or weight < 0:
            continue
        # Yahoo's fund-data response normally uses fractions, but tolerate
        # percent-like values without ever emitting an impossible weight.
        if 1 < weight <= 100:
            weight /= 100
        if weight > 1:
            continue
        holdings.append({"symbol": symbol, "name": name, "weight": weight})
    return holdings


def december_closes(history):
    """Extract adjusted December closes from a monthly yfinance history frame."""
    if history is None or getattr(history, "empty", True):
        return {}
    try:
        close_series = history["Close"]
    except (KeyError, TypeError):
        return {}

    closes = {}
    for timestamp, raw_close in close_series.items():
        if getattr(timestamp, "month", None) != 12:
            continue
        close = finite_number(raw_close)
        if close is not None and close > 0:
            closes[int(timestamp.year)] = close
    return closes


def calculate_market_regime_performance(
    etf_december_closes,
    benchmark_december_closes,
    current_year=None,
    lookback_years=20,
):
    """Compare ETF adjusted returns in S&P 500 bull, bear, and mixed years.

    Bull years have benchmark total returns >= 10%; bear years <= -10%;
    remaining years are mixed. A best-fit label requires at least two
    complete years in at least two regimes.
    """
    current_year = current_year or datetime.now(timezone.utc).year
    last_year = current_year - 1
    first_year = last_year - lookback_years + 1
    annual_returns = {name: [] for name in REGIME_NAMES}

    for year in range(first_year, last_year + 1):
        benchmark_start = finite_number(benchmark_december_closes.get(year - 1))
        benchmark_end = finite_number(benchmark_december_closes.get(year))
        etf_start = finite_number(etf_december_closes.get(year - 1))
        etf_end = finite_number(etf_december_closes.get(year))
        if (
            benchmark_start is None
            or benchmark_end is None
            or etf_start is None
            or etf_end is None
            or benchmark_start <= 0
            or etf_start <= 0
        ):
            continue

        benchmark_return = benchmark_end / benchmark_start - 1
        etf_return = etf_end / etf_start - 1
        regime = "bull" if benchmark_return >= 0.10 else (
            "bear" if benchmark_return <= -0.10 else "mixed"
        )
        annual_returns[regime].append(etf_return)

    periods = {
        name: {
            "averageAnnualReturn": (
                sum(returns) / len(returns) if returns else None
            ),
            "years": len(returns),
        }
        for name, returns in annual_returns.items()
    }
    eligible = [
        (name, data["averageAnnualReturn"])
        for name, data in periods.items()
        if data["years"] >= 2 and data["averageAnnualReturn"] is not None
    ]
    best_regime = None
    if len(eligible) >= 2:
        eligible.sort(key=lambda item: item[1], reverse=True)
        if not math.isclose(eligible[0][1], eligible[1][1], abs_tol=1e-9):
            best_regime = eligible[0][0]

    return {
        "bestRegime": best_regime,
        "lookbackYears": lookback_years,
        "firstYear": first_year,
        "lastYear": last_year,
        "benchmarkSymbol": "SPY",
        "bullThreshold": 0.10,
        "bearThreshold": -0.10,
        "periods": periods,
    }


def is_etf_info(info):
    quote_type = str(info.get("quoteType") or "").strip().upper()
    if quote_type == "ETF":
        return True
    return bool(info.get("category") and info.get("fundFamily"))


def build_etf_profile_payload(
    info,
    sector_weightings=None,
    top_holdings=None,
    market_regime=None,
):
    largest_sector, largest_sector_weight = get_dominant_sector(sector_weightings)
    return {
        "fundCategory": info.get("category") or None,
        "fundFamily": info.get("fundFamily") or None,
        "expenseRatio": get_expense_ratio(info),
        "totalAssets": finite_number(info.get("totalAssets")),
        "dividendYield": get_fund_yield(info),
        "beta3Year": finite_number(first_present(info, "beta3Year", "beta")),
        "largestSector": largest_sector,
        "largestSectorWeight": largest_sector_weight,
        "topHoldings": normalize_top_holdings(top_holdings or []),
        "marketRegime": market_regime,
    }


def build_info_brief_payload(
    symbol,
    info,
    etf_profile=None,
    secondary_max_supply=None,
):
    """Project provider fields used by market detail cards and paper trading."""
    name = info.get("longName") or info.get("shortName") or ""
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

    max_supply, max_supply_status, max_supply_source, max_supply_conflict = (
        resolve_max_supply(info, secondary_max_supply)
    )
    payload = {
        "symbol": symbol,
        "companyName": name,
        "sector": info.get("sector", "") or "",
        "industry": info.get("industry", "") or "",
        "exchange": info.get("exchange", "") or info.get("fullExchangeName", "") or "",
        "dividendYield": div_yield,
        "dividendRate": info.get("dividendRate", 0) or 0,
        "marketCap": info.get("marketCap", 0) or 0,
        "currentPrice": float(price),
        "previousClose": first_present(info, "previousClose", "regularMarketPreviousClose"),
        "open": first_present(info, "open", "regularMarketOpen"),
        "dayLow": first_present(info, "dayLow", "regularMarketDayLow"),
        "dayHigh": first_present(info, "dayHigh", "regularMarketDayHigh"),
        "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
        "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
        "volume": first_present(info, "volume", "regularMarketVolume"),
        "averageVolume3Month": first_present(
            info, "averageDailyVolume3Month", "averageVolume",
        ),
        "beta": info.get("beta"),
        "earningsTimestamp": first_present(
            info, "earningsTimestampStart", "earningsTimestamp",
        ),
        "targetMeanPrice": info.get("targetMeanPrice"),
        "trailingEps": info.get("trailingEps"),
        "totalRevenue": info.get("totalRevenue"),
        "circulatingSupply": info.get("circulatingSupply"),
        "maxSupply": max_supply,
        "maxSupplyStatus": max_supply_status,
        "maxSupplySource": max_supply_source,
        "maxSupplyConflict": max_supply_conflict,
        "volume24Hr": info.get("volume24Hr"),
    }
    if etf_profile is not None:
        payload["etfProfile"] = etf_profile
    return payload


def get_fund_data_details(ticker):
    """Read provider-reported ETF sector exposures and top holdings."""
    try:
        fund_data = ticker.funds_data
    except Exception:
        return None, []

    try:
        sector_weightings = getattr(fund_data, "sector_weightings", None)
    except Exception:
        sector_weightings = None
    try:
        top_holdings_frame = getattr(fund_data, "top_holdings", None)
    except Exception:
        top_holdings_frame = None
    top_holdings = []
    if top_holdings_frame is not None and hasattr(top_holdings_frame, "iterrows"):
        try:
            for symbol, row in top_holdings_frame.head(5).iterrows():
                raw_name = row.get("Name")
                top_holdings.append({
                    "symbol": str(symbol),
                    "name": raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else str(symbol),
                    "weight": row.get("Holding Percent"),
                })
        except Exception:
            top_holdings = []
    return sector_weightings, normalize_top_holdings(top_holdings)


def get_market_regime_performance(ticker, symbol):
    try:
        etf_history = ticker.history(
            period="max", interval="1mo", auto_adjust=True,
        )
        benchmark_ticker = ticker if symbol == "SPY" else yf.Ticker("SPY")
        benchmark_history = benchmark_ticker.history(
            period="max", interval="1mo", auto_adjust=True,
        )
    except Exception:
        return None

    return calculate_market_regime_performance(
        december_closes(etf_history),
        december_closes(benchmark_history),
    )


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

        etf_profile = None
        if is_etf_info(info):
            sector_weightings, top_holdings = get_fund_data_details(ticker)
            market_regime = get_market_regime_performance(ticker, symbol)
            etf_profile = build_etf_profile_payload(
                info,
                sector_weightings,
                top_holdings,
                market_regime,
            )

        secondary_max_supply = fetch_coinpaprika_max_supply(symbol, info)
        print(json.dumps(clean_nan(
            build_info_brief_payload(
                symbol,
                info,
                etf_profile,
                secondary_max_supply,
            ),
        ), allow_nan=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
