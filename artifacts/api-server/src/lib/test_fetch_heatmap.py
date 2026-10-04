import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pandas as pd

import fetch_heatmap


EASTERN = ZoneInfo("America/New_York")


def eastern(year, month, day, hour, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=EASTERN)


def close_frame(rows):
    return pd.DataFrame(
        {"Close": [price for _, price in rows]},
        index=pd.DatetimeIndex([timestamp for timestamp, _ in rows]),
    )


def adjusted_frame(rows):
    return pd.DataFrame(
        {
            "Close": [close for _, close, _ in rows],
            "Adj Close": [adjusted for _, _, adjusted in rows],
        },
        index=pd.DatetimeIndex([timestamp for timestamp, _, _ in rows]),
    )


class HeatMapQuoteTests(unittest.TestCase):
    def assert_quote_session(self, latest, now, expected_session):
        frame = close_frame([
            (latest - timedelta(days=1), 98),
            (latest - timedelta(minutes=5), 99),
            (latest, 100),
        ])
        quote = fetch_heatmap.quote_from_frame(
            frame,
            "AAPL",
            "stocks",
            require_prior_close=False,
            now=now,
        )
        self.assertIsNotNone(quote)
        self.assertEqual(quote["marketSession"], expected_session)

    def test_regular_premarket_and_after_hours_quotes(self):
        self.assert_quote_session(
            eastern(2024, 6, 4, 10, 0),
            eastern(2024, 6, 4, 10, 5),
            "regular",
        )
        self.assert_quote_session(
            eastern(2024, 6, 4, 8, 30),
            eastern(2024, 6, 4, 8, 35),
            "pre_market",
        )
        self.assert_quote_session(
            eastern(2024, 6, 4, 17, 0),
            eastern(2024, 6, 4, 17, 5),
            "after_hours",
        )

    def test_weekend_and_holiday_quotes_are_closed_not_active(self):
        cases = [
            (eastern(2024, 6, 7, 15, 55), eastern(2024, 6, 8, 12, 0)),  # Saturday
            (eastern(2024, 7, 3, 15, 55), eastern(2024, 7, 4, 12, 0)),  # Independence Day
        ]
        for latest, now in cases:
            with self.subTest(now=now):
                frame = close_frame([
                    (latest - timedelta(days=1), 98),
                    (latest - timedelta(minutes=5), 99),
                    (latest, 100),
                ])
                quote = fetch_heatmap.quote_from_frame(
                    frame,
                    "AAPL",
                    "stocks",
                    require_prior_close=False,
                    now=now,
                )
                self.assertIsNotNone(quote)
                self.assertEqual(quote["marketSession"], "closed")

    def test_extended_hours_change_uses_previous_daily_close_at_future_roll(self):
        now = eastern(2024, 6, 4, 9, 5)
        intraday = close_frame([
            (eastern(2024, 6, 3, 19, 55), 103),
            (eastern(2024, 6, 4, 8, 30), 104),
            (eastern(2024, 6, 4, 9, 0), 104),
        ])
        daily = close_frame([
            (datetime(2024, 6, 3), 100),
            (datetime(2024, 6, 4), 110),
        ])

        with patch.object(fetch_heatmap.yf, "download", side_effect=[intraday, daily]):
            quotes = fetch_heatmap.download_quotes(["ES=F"], "futures", "5m", now=now)

        self.assertEqual(quotes["ES=F"]["priceChangePercent"], 4.0)
        self.assertEqual(quotes["ES=F"]["marketSession"], "pre_market")

    def test_stale_stock_and_futures_quotes_are_omitted(self):
        now = eastern(2024, 6, 12, 12, 0)
        stale_stock = close_frame([
            (eastern(2024, 6, 5, 15, 50), 99),
            (eastern(2024, 6, 5, 15, 55), 100),
        ])
        self.assertIsNone(
            fetch_heatmap.quote_from_frame(
                stale_stock,
                "AAPL",
                "stocks",
                require_prior_close=False,
                now=now,
            )
        )

        futures_now = eastern(2024, 6, 4, 10, 0)
        stale_future = close_frame([
            (eastern(2024, 6, 3, 8, 50), 5_000),
            (eastern(2024, 6, 3, 8, 55), 5_001),
        ])
        self.assertIsNone(
            fetch_heatmap.quote_from_frame(
                stale_future,
                "ES=F",
                "futures",
                require_prior_close=False,
                now=futures_now,
            )
        )
        self.assertIsNone(
            fetch_heatmap.quote_from_frame(
                stale_future,
                "GC=F",
                "commodities",
                require_prior_close=False,
                now=futures_now,
            )
        )

    def test_missing_or_empty_quote_data_is_omitted(self):
        now = eastern(2024, 6, 4, 10, 0)
        self.assertIsNone(
            fetch_heatmap.quote_from_frame(None, "AAPL", "stocks", now=now)
        )
        self.assertIsNone(
            fetch_heatmap.quote_from_frame(
                pd.DataFrame(columns=["Close"]),
                "AAPL",
                "stocks",
                now=now,
            )
        )

    def test_provider_sectors_are_normalized_and_missing_values_are_unknown(self):
        self.assertEqual(fetch_heatmap.normalize_sector("Health Care"), "Healthcare")
        self.assertEqual(fetch_heatmap.normalize_sector(None, "AAPL"), "Technology")
        self.assertEqual(fetch_heatmap.normalize_sector(None, "UNLISTED"), "Unknown")
        self.assertEqual(fetch_heatmap.normalize_exchange("NMS"), "NASDAQ")
        self.assertEqual(fetch_heatmap.normalize_exchange("NasdaqGS"), "NASDAQ")
        self.assertEqual(
            fetch_heatmap.merge_metadata(
                {"sector": "Unknown"},
                {"sector": "Health Care"},
                "stock",
            )["sector"],
            "Healthcare",
        )

    def test_sector_query_uses_provider_sector_names_and_primary_us_exchanges(self):
        query = fetch_heatmap.build_sector_screen_query("Real Estate").to_dict()
        encoded = str(query)
        self.assertIn("['sector', 'Real Estate']", encoded)
        self.assertIn("['region', 'us']", encoded)
        self.assertIn("['exchange', 'NMS']", encoded)
        self.assertNotIn("PNK", encoded)

        financials = str(fetch_heatmap.build_sector_screen_query("Financials").to_dict())
        self.assertIn("['sector', 'Financial Services']", financials)
        with self.assertRaises(ValueError):
            fetch_heatmap.build_sector_screen_query("Unknown")

    def test_sector_screener_pages_until_at_least_fifteen_valid_quotes(self):
        now = int(datetime.now(timezone.utc).timestamp())

        def screener_row(symbol, timestamp):
            return {
                "symbol": symbol,
                "quoteType": "EQUITY",
                "exchange": "NMS",
                "currency": "USD",
                "marketState": "CLOSED",
                "regularMarketPrice": 25,
                "regularMarketChangePercent": 1,
                "regularMarketTime": timestamp,
                "regularMarketPreviousClose": 24,
            }

        first_page = [screener_row(f"RE{index:02}", now) for index in range(10)]
        first_page += [screener_row(f"OLD{index:02}", 1) for index in range(40)]
        second_page = [screener_row(f"RE{index:02}", now) for index in range(10, 15)]
        second_page += [screener_row(f"OLD2{index:02}", 1) for index in range(45)]
        with patch.object(
            fetch_heatmap.yf,
            "screen",
            side_effect=[
                {"quotes": first_page, "total": 100},
                {"quotes": second_page, "total": 100},
            ],
        ) as screen:
            quotes = fetch_heatmap.sector_screener_quotes("Real Estate")

        self.assertEqual(len(quotes), 15)
        self.assertTrue(all(quote["sector"] == "Real Estate" for quote in quotes))
        self.assertEqual([call.kwargs["offset"] for call in screen.call_args_list], [0, 50])
        self.assertTrue(all(call.kwargs["size"] == 50 for call in screen.call_args_list))

    def test_risk_levels_use_the_exact_historical_volatility_boundaries(self):
        expected = [
            (14.999, "Conservative"),
            (15, "Moderate Conservative"),
            (24.999, "Moderate Conservative"),
            (25, "Moderate"),
            (40, "Moderate Aggressive"),
            (60, "Aggressive"),
        ]
        for volatility, band in expected:
            with self.subTest(volatility=volatility):
                self.assertEqual(fetch_heatmap.risk_band_for_volatility(volatility), band)
        self.assertIsNone(fetch_heatmap.risk_band_for_volatility(None))

    def test_market_cap_buckets_use_usd_cutoffs(self):
        cases = [
            (299_999_999, "Micro"),
            (300_000_000, "Small"),
            (2_000_000_000, "Mid"),
            (10_000_000_000, "Large"),
            (200_000_000_000, "Mega"),
            (None, None),
        ]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(fetch_heatmap.market_cap_bucket(value), expected)

    def test_one_day_return_uses_latest_quote_and_adjusted_previous_close(self):
        now = datetime(2026, 10, 2, 20, 5, tzinfo=timezone.utc)
        frame = adjusted_frame([
            (datetime(2026, 10, 1), 100, 99),
            (datetime(2026, 10, 2), 105, 103),
        ])
        quote = {
            "symbol": "ABC",
            "assetType": "stock",
            "price": 105,
            "priceTimestamp": int(datetime(2026, 10, 2, 20, tzinfo=timezone.utc).timestamp()),
        }
        result = fetch_heatmap.enrich_quote_with_history(quote, frame, "1d", now)
        self.assertAlmostEqual(result["returnPercent"], (103 / 99 - 1) * 100, places=3)
        self.assertEqual(result["returnBasis"], "adjusted_total_return")
        self.assertEqual(result["historyStartDate"], "2026-10-01")

    def test_calendar_month_uses_last_close_on_or_before_lookback_date(self):
        now = datetime(2024, 3, 31, 12, tzinfo=timezone.utc)
        rows = [
            {"date": date(2024, 2, 28), "close": 90, "adjusted": 90},
            {"date": date(2024, 2, 29), "close": 92, "adjusted": 92},
            {"date": date(2024, 3, 1), "close": 100, "adjusted": 100},
        ]
        baseline = fetch_heatmap.return_baseline(rows, "1m", date(2024, 3, 31), now.date())
        self.assertEqual(baseline["date"], date(2024, 2, 29))

    def test_all_nine_periods_choose_the_requested_calendar_baseline(self):
        now = datetime(2026, 10, 4, 12, tzinfo=timezone.utc)
        quote_day = date(2026, 10, 2)
        start = date(2020, 9, 30)
        rows = []
        cursor = start
        while cursor <= quote_day:
            if cursor.weekday() < 5:
                price = 100 + (cursor - start).days
                rows.append({"date": cursor, "close": price, "adjusted": price})
            cursor += timedelta(days=1)
        quote = {
            "symbol": "ABC",
            "assetType": "stock",
            "price": rows[-1]["close"],
            "priceTimestamp": int(datetime(2026, 10, 2, 20, tzinfo=timezone.utc).timestamp()),
        }
        for period in ("1d", "1w", "1m", "3m", "6m", "1y", "3y", "5y", "max"):
            with self.subTest(period=period):
                baseline = fetch_heatmap.return_baseline(rows, period, quote_day, now.date())
                self.assertIsNotNone(baseline)
                result = fetch_heatmap.enrich_quote_with_history(
                    dict(quote),
                    pd.DataFrame(
                        {
                            "Close": [row["close"] for row in rows],
                            "Adj Close": [row["adjusted"] for row in rows],
                        },
                        index=pd.DatetimeIndex([datetime.combine(row["date"], datetime.min.time()) for row in rows]),
                    ),
                    period,
                    now,
                )
                self.assertAlmostEqual(
                    result["returnPercent"],
                    (quote["price"] / baseline["close"] - 1) * 100,
                    places=4,
                )
                self.assertEqual(result["returnUnavailableReason"], None)

    def test_longer_requested_range_is_unavailable_instead_of_shortened(self):
        rows = [
            {"date": date(2023, 1, 3), "close": 100, "adjusted": 100},
            {"date": date(2026, 10, 2), "close": 120, "adjusted": 120},
        ]
        self.assertIsNone(fetch_heatmap.return_baseline(rows, "5y", date(2026, 10, 2), date(2026, 10, 4)))

    def test_missing_history_is_unavailable_and_max_reports_actual_start(self):
        now = datetime(2026, 10, 4, 12, tzinfo=timezone.utc)
        frame = adjusted_frame([
            (datetime(2026, 5, 1), 100, 100),
            (datetime(2026, 5, 4), 110, 110),
        ])
        quote = {
            "symbol": "ABC",
            "assetType": "stock",
            "price": 110,
            "priceTimestamp": int(datetime(2026, 5, 4, 20, tzinfo=timezone.utc).timestamp()),
        }
        unavailable = fetch_heatmap.enrich_quote_with_history(dict(quote), frame, "1y", now)
        self.assertIsNone(unavailable["returnPercent"])
        self.assertEqual(unavailable["returnUnavailableReason"], "Not enough history for the selected period")
        maximum = fetch_heatmap.enrich_quote_with_history(dict(quote), frame, "max", now)
        self.assertEqual(maximum["returnPercent"], 10)
        self.assertEqual(maximum["historyStartDate"], "2026-05-01")

    def test_volatility_requires_sixty_returns_and_annualizes_crypto_continuously(self):
        now = date(2026, 10, 4)
        too_short = [
            {"date": now - timedelta(days=59 - index), "close": 100 + index % 2, "adjusted": 100 + index % 2}
            for index in range(60)
        ]
        self.assertIsNone(fetch_heatmap.daily_volatility_percent(too_short, "stock", now, False))
        rows = [
            {"date": now - timedelta(days=60 - index), "close": 100 + index % 2, "adjusted": 100 + index % 2}
            for index in range(61)
        ]
        stocks = fetch_heatmap.daily_volatility_percent(rows, "stock", now, False)
        crypto = fetch_heatmap.daily_volatility_percent(rows, "cryptocurrency", now, False)
        self.assertIsNotNone(stocks)
        self.assertAlmostEqual(crypto / stocks, (365 / 252) ** 0.5)


if __name__ == "__main__":
    unittest.main()