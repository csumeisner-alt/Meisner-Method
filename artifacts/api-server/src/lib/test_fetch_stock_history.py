import unittest
from datetime import date, datetime, timezone

import fetch_stock


class CommodityHistoryCalendarTests(unittest.TestCase):
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
