import unittest
from datetime import date, datetime, timezone
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
