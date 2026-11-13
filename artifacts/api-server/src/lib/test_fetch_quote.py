import unittest

import fetch_quote


class FetchQuoteTests(unittest.TestCase):
    def test_overnight_market_state_uses_only_fresh_overnight_fields(self):
        result = fetch_quote.select_market_quote(
            {
                "marketState": "OVERNIGHT",
                "regularMarketPrice": 100,
                "regularMarketPreviousClose": 99,
                "regularMarketTime": 1_800_000_000,
                "overnightMarketPrice": 101,
                "overnightMarketChange": 2,
                "overnightMarketChangePercent": 2.02,
                "overnightMarketTime": 1_800_000_060,
            },
            100,
            99,
        )

        self.assertEqual(result["currentPrice"], 101)
        self.assertEqual(result["priceChangePercent"], 2.02)
        self.assertEqual(result["marketSession"], "OVERNIGHT")
        self.assertEqual(result["priceSource"], "overnight")
        self.assertEqual(result["priceTimestamp"], 1_800_000_060)


if __name__ == "__main__":
    unittest.main()
