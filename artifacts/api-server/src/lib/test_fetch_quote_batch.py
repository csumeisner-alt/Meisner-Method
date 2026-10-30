import unittest
from unittest.mock import patch

import fetch_quote


class PortfolioQuoteBatchTests(unittest.TestCase):
    def test_unavailable_symbol_does_not_discard_successful_quotes(self):
        available_quote = {
            "symbol": "AAPL",
            "currentPrice": 190.5,
            "priceChange": 1.5,
            "priceChangePercent": 0.8,
            "marketSession": "REGULAR",
            "priceSource": "regular",
            "priceTimestamp": 1_800_000_000,
            "expenseRatio": None,
        }

        with patch.object(
            fetch_quote,
            "fetch_quote",
            side_effect=lambda symbol: available_quote if symbol == "AAPL" else None,
        ):
            result = fetch_quote.fetch_quotes(["AAPL", "MISSING"])

        self.assertEqual(result["quotes"], [available_quote])
        self.assertEqual(result["unavailableSymbols"], ["MISSING"])


if __name__ == "__main__":
    unittest.main()
