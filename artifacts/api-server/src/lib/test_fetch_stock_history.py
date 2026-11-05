import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import fetch_stock


class CommodityHistoryCalendarTests(unittest.TestCase):
    def test_sunday_futures_bar_maps_to_monday_trade_date(self):
        self.assertEqual(
            fetch_stock.commodity_history_session_date(
                "SI=F",
                datetime(2026, 11, 1, 0, tzinfo=timezone.utc),
            ),
            "2026-11-02",
        )

    def test_sunday_partial_and_monday_bars_collapse_to_one_trade_session(self):
        history_dates, closes, volumes = fetch_stock.normalize_commodity_history(
            "SI=F",
            [
                datetime(2026, 11, 1, 0, tzinfo=timezone.utc),
                datetime(2026, 11, 2, 0, tzinfo=timezone.utc),
            ],
            [50.0, 51.0],
            [10, 20],
        )

        self.assertEqual(history_dates, ["2026-11-02"])
        self.assertEqual(closes, [51.0])
        self.assertEqual(volumes, [20])

    def test_commodity_history_sorts_provider_rows_before_collapsing_sessions(self):
        history_dates, closes, volumes = fetch_stock.normalize_commodity_history(
            "SI=F",
            [
                datetime(2026, 11, 2, 0, tzinfo=timezone.utc),
                datetime(2026, 10, 30, 0, tzinfo=timezone.utc),
                datetime(2026, 11, 1, 0, tzinfo=timezone.utc),
            ],
            [51.0, 49.0, 50.0],
            [20, 8, 10],
        )

        self.assertEqual(history_dates, ["2026-10-30", "2026-11-02"])
        self.assertEqual(closes, [49.0, 51.0])
        self.assertEqual(volumes, [8, 20])

    def test_commodity_quote_changes_are_derived_from_valid_current_and_prior_prices(self):
        quote = fetch_stock.commodity_quote_snapshot(101.5, 100.0)
        self.assertEqual(quote["currentPrice"], 101.5)
        self.assertEqual(quote["priceChange"], 1.5)
        self.assertEqual(quote["priceChangePercent"], 1.5)
        self.assertIsNone(fetch_stock.commodity_quote_snapshot(None, 100.0))
        self.assertIsNone(fetch_stock.commodity_quote_snapshot(101.5, 0))
        self.assertIsNone(fetch_stock.commodity_quote_snapshot(float("nan"), 100.0))

    def test_commodity_quote_timestamp_stays_with_its_source_price_and_volume_is_not_average(self):
        info = SimpleNamespace(
            last_price=102.0,
            previous_close=100.0,
            last_volume=77,
            three_month_average_volume=9_999,
        )
        metadata_quote = fetch_stock.commodity_quote_fields(info, {
            "regularMarketPrice": 101.5,
            "regularMarketPreviousClose": 100.0,
            "regularMarketTime": 1_800_000_000,
            "regularMarketVolume": 120,
        }, [50])
        self.assertEqual(metadata_quote["currentPrice"], 101.5)
        self.assertEqual(metadata_quote["priceChange"], 1.5)
        self.assertEqual(metadata_quote["priceChangePercent"], 1.5)
        self.assertEqual(metadata_quote["priceTimestamp"], 1_800_000_000)
        self.assertEqual(metadata_quote["volume"], 120)

        fast_quote = fetch_stock.commodity_quote_fields(
            SimpleNamespace(last_price=102.0, previous_close=100.0, last_volume=None),
            {"regularMarketTime": 1_800_000_000},
            [50],
        )
        self.assertEqual(fast_quote["currentPrice"], 102.0)
        self.assertIsNone(fast_quote["priceTimestamp"])
        self.assertEqual(fast_quote["volume"], 50)

    def test_upcoming_monday_session_counts_only_after_its_sunday_open(self):
        sunday = date(2026, 11, 1)
        start = date(2026, 10, 30)
        before_open = datetime(2026, 11, 1, 16, 59, tzinfo=ZoneInfo("America/Chicago"))
        after_open = datetime(2026, 11, 1, 17, 1, tzinfo=ZoneInfo("America/Chicago"))

        before_sessions = fetch_stock.expected_commodity_sessions("SI=F", start, before_open)
        after_sessions = fetch_stock.expected_commodity_sessions("SI=F", start, after_open)

        self.assertNotIn("2026-11-02", before_sessions)
        self.assertIn("2026-11-02", after_sessions)

    def test_cme_expected_sessions_skip_weekends_and_full_closures(self):
        sessions = fetch_stock.expected_commodity_sessions(
            "GC=F",
            date(2026, 12, 24),
            datetime(2026, 12, 27, 12, tzinfo=timezone.utc),
        )

        self.assertEqual(sessions, ["2026-12-24"])

    def test_ice_contract_uses_its_venue_calendar(self):
        sessions = fetch_stock.expected_commodity_sessions(
            "KC=F",
            date(2026, 12, 24),
            datetime(2026, 12, 27, 12, tzinfo=timezone.utc),
        )

        self.assertEqual(sessions, ["2026-12-24"])

    def test_unmapped_symbol_has_no_commodity_calendar(self):
        self.assertIsNone(
            fetch_stock.expected_commodity_sessions(
                "AAPL",
                date(2026, 12, 24),
                datetime(2026, 12, 27, 12, tzinfo=timezone.utc),
            )
        )


if __name__ == "__main__":
    unittest.main()
