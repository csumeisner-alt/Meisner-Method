import unittest
from datetime import datetime, timedelta
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


if __name__ == "__main__":
    unittest.main()