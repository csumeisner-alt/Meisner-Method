import contextlib
import io
import json
import sys
import unittest
from unittest.mock import Mock, call, patch

import pandas as pd

import fetch_chart


class ChartHistoryTests(unittest.TestCase):
    def test_supported_asset_symbol_formats_return_usable_candles_for_chart_ranges(self):
        symbols = ("AAPL", "SPY", "GC=F", "BTC-USD")
        ranges = (
            ("5d", "1h"),
            ("1mo", "1d"),
            ("3mo", "1d"),
            ("6mo", "1d"),
            ("1y", "1d"),
            ("2y", "1wk"),
        )
        history = pd.DataFrame(
            [
                {"Open": 100.0, "High": 102.0, "Low": 99.0, "Close": 101.0, "Volume": float("nan")},
                {"Open": float("nan"), "High": 103.0, "Low": 100.0, "Close": 102.0, "Volume": 120},
                {"Open": 101.0, "High": 104.0, "Low": 100.0, "Close": 103.0, "Volume": 125},
            ],
            index=pd.to_datetime(["2025-01-02", "2025-01-03", "2025-01-06"], utc=True),
        )
        ticker = Mock()
        ticker.history.return_value = history
        yfinance = Mock()
        yfinance.Ticker.return_value = ticker

        with patch.dict(sys.modules, {"yfinance": yfinance}):
            for symbol in symbols:
                for period, interval in ranges:
                    output = io.StringIO()
                    with contextlib.redirect_stdout(output):
                        fetch_chart.fetch_chart(symbol, period, interval)

                    payload = json.loads(output.getvalue())
                    self.assertEqual(payload["symbol"], symbol)
                    self.assertEqual(payload["period"], period)
                    self.assertEqual(payload["interval"], interval)
                    self.assertEqual(len(payload["candles"]), 2)
                    self.assertEqual(payload["candles"][0]["v"], 0)
                    self.assertTrue(all(candle["o"] is not None for candle in payload["candles"]))

        self.assertEqual(
            yfinance.Ticker.call_args_list,
            [call(symbol) for symbol in symbols for _ in ranges],
        )
        self.assertEqual(
            ticker.history.call_args_list,
            [call(period=period, interval=interval) for _ in symbols for period, interval in ranges],
        )

    def test_empty_provider_history_returns_a_clear_no_data_response(self):
        ticker = Mock()
        ticker.history.return_value = pd.DataFrame()
        yfinance = Mock(Ticker=Mock(return_value=ticker))
        output = io.StringIO()

        with patch.dict(sys.modules, {"yfinance": yfinance}), contextlib.redirect_stdout(output):
            fetch_chart.fetch_chart("UNKNOWN", "3mo", "1d")

        self.assertEqual(json.loads(output.getvalue()), {"error": "No data for UNKNOWN"})


if __name__ == "__main__":
    unittest.main()
