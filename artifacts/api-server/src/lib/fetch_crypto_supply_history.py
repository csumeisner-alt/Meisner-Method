#!/usr/bin/env python3
"""Fetch provider-reported daily on-chain supply history for supported crypto assets."""
import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


COIN_METRICS_ASSETS = {
    "BTC-USD": "btc",
    "ETH-USD": "eth",
    "SOL-USD": "sol",
    "XRP-USD": "xrp",
    "BNB-USD": "bnb",
    "DOGE-USD": "doge",
    "ADA-USD": "ada",
    "TRX-USD": "trx",
    "AVAX-USD": "avax",
    "LINK-USD": "link",
    "LTC-USD": "ltc",
    "BCH-USD": "bch",
    "SUI-USD": "sui",
    "DOT-USD": "dot",
    "SHIB-USD": "shib",
    "TON-USD": "ton",
}
PROVIDER = "Coin Metrics"
METRIC = "SplyCur"
RANGE_DAYS = 365
SUPPORTED_RANGE_DAYS = (30, 90, 365)
COMMUNITY_API = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics"


def _request_json(url):
    request = Request(
        url,
        headers={"User-Agent": "MeisnerMethod/1.0 (crypto supply history)"},
    )
    with urlopen(request, timeout=12) as response:
        return json.load(response)


def _unavailable_metric_error(error):
    try:
        details = json.loads(error.read().decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False
    message = details.get("error", {}).get("message", "")
    return (
        error.code in (400, 403, 404)
        and isinstance(message, str)
        and ("not available" in message.lower() or "not found" in message.lower())
    )


def _empty_history(symbol, range_days=RANGE_DAYS):
    return {
        "symbol": symbol,
        "provider": PROVIDER,
        "metric": METRIC,
        "rangeDays": range_days,
        "interval": "daily",
        "startDate": None,
        "endDate": None,
        "points": [],
    }


def _normalize_points(rows):
    by_date = {}
    if not isinstance(rows, list):
        return []

    for row in rows:
        if not isinstance(row, dict):
            continue
        raw_time = row.get("time")
        if not isinstance(raw_time, str) or len(raw_time) < 10:
            continue
        try:
            observed_date = date.fromisoformat(raw_time[:10]).isoformat()
        except ValueError:
            continue
        raw_supply = row.get(METRIC)
        if isinstance(raw_supply, bool):
            continue
        try:
            supply = float(raw_supply)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(supply) or supply <= 0:
            continue
        by_date[observed_date] = supply

    return [
        {"date": observed_date, "supply": by_date[observed_date]}
        for observed_date in sorted(by_date)
    ]


def fetch_crypto_supply_history(symbol, today=None, fetch_json=_request_json, range_days=RANGE_DAYS):
    """Return actual daily provider values for a supported window without filling gaps."""
    if type(range_days) is not int or range_days not in SUPPORTED_RANGE_DAYS:
        raise ValueError("range_days must be one of 30, 90, or 365")

    normalized_symbol = str(symbol or "").upper().strip()
    asset = COIN_METRICS_ASSETS.get(normalized_symbol)
    if asset is None:
        return _empty_history(normalized_symbol, range_days)

    current_date = today or datetime.now(timezone.utc).date()
    if not isinstance(current_date, date):
        raise TypeError("today must be a date")
    end_date = current_date - timedelta(days=1)
    start_date = end_date - timedelta(days=range_days - 1)
    query = urlencode({
        "assets": asset,
        "metrics": METRIC,
        "frequency": "1d",
        "start_time": start_date.isoformat(),
        "end_time": end_date.isoformat(),
        "page_size": range_days,
    })

    try:
        payload = fetch_json(f"{COMMUNITY_API}?{query}")
    except HTTPError as error:
        if _unavailable_metric_error(error):
            return _empty_history(normalized_symbol, range_days)
        raise RuntimeError("Coin Metrics supply history request failed") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError("Coin Metrics supply history request failed") from error

    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise RuntimeError("Coin Metrics returned an invalid supply history response")

    points = _normalize_points(payload["data"])
    return {
        **_empty_history(normalized_symbol, range_days),
        "startDate": points[0]["date"] if points else None,
        "endDate": points[-1]["date"] if points else None,
        "points": points,
    }


def main():
    symbol = sys.argv[1] if len(sys.argv) > 1 else ""
    range_days = int(sys.argv[2]) if len(sys.argv) > 2 else RANGE_DAYS
    try:
        print(json.dumps(fetch_crypto_supply_history(symbol, range_days=range_days), allow_nan=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
