import io
import json
import unittest
from datetime import date
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

import fetch_crypto_supply_history


class CryptoSupplyHistoryTests(unittest.TestCase):
    def test_fetches_daily_provider_supply_for_a_one_year_window(self):
        requests = []

        def fetch_json(url):
            requests.append(url)
            return {
                "data": [
                    {"time": "2026-10-08T00:00:00.000000000Z", "SplyCur": "200.5"},
                    {"time": "2026-10-07T00:00:00.000000000Z", "SplyCur": "200"},
                    {"time": "2026-10-06T00:00:00.000000000Z", "SplyCur": "NaN"},
                ]
            }

        result = fetch_crypto_supply_history.fetch_crypto_supply_history(
            "btc-usd",
            today=date(2026, 10, 9),
            fetch_json=fetch_json,
        )

        self.assertEqual(len(requests), 1)
        query = parse_qs(urlparse(requests[0]).query)
        self.assertEqual(query["assets"], ["btc"])
        self.assertEqual(query["metrics"], ["SplyCur"])
        self.assertEqual(query["frequency"], ["1d"])
        self.assertEqual(query["start_time"], ["2025-10-09"])
        self.assertEqual(query["end_time"], ["2026-10-08"])
        self.assertEqual(result["provider"], "Coin Metrics")
        self.assertEqual(result["metric"], "SplyCur")
        self.assertEqual(result["interval"], "daily")
        self.assertEqual(result["startDate"], "2026-10-07")
        self.assertEqual(result["endDate"], "2026-10-08")
        self.assertEqual(result["points"], [
            {"date": "2026-10-07", "supply": 200.0},
            {"date": "2026-10-08", "supply": 200.5},
        ])

    def test_fetches_shorter_selected_windows_and_keeps_the_provider_date_gaps(self):
        requests = []

        def fetch_json(url):
            requests.append(url)
            return {"data": [
                {"time": "2026-10-08T00:00:00.000000000Z", "SplyCur": "200.5"},
                {"time": "2026-10-06T00:00:00.000000000Z", "SplyCur": "200"},
            ]}

        result = fetch_crypto_supply_history.fetch_crypto_supply_history(
            "btc-usd",
            today=date(2026, 10, 9),
            fetch_json=fetch_json,
            range_days=30,
        )

        query = parse_qs(urlparse(requests[0]).query)
        self.assertEqual(query["start_time"], ["2026-09-09"])
        self.assertEqual(query["end_time"], ["2026-10-08"])
        self.assertEqual(query["page_size"], ["30"])
        self.assertEqual(result["rangeDays"], 30)
        self.assertEqual(result["points"], [
            {"date": "2026-10-06", "supply": 200.0},
            {"date": "2026-10-08", "supply": 200.5},
        ])

    def test_rejects_unsupported_history_windows(self):
        for range_days in (0, 31, 180, 366, True):
            with self.subTest(range_days=range_days):
                with self.assertRaisesRegex(ValueError, "range_days"):
                    fetch_crypto_supply_history.fetch_crypto_supply_history(
                        "btc-usd",
                        range_days=range_days,
                        fetch_json=lambda _url: self.fail("unsupported range must not call provider"),
                    )

    def test_does_not_invent_points_for_unsupported_symbols_or_missing_coverage(self):
        calls = []
        unsupported_symbol = fetch_crypto_supply_history.fetch_crypto_supply_history(
            "NOT-A-COIN",
            today=date(2026, 10, 9),
            fetch_json=lambda url: calls.append(url),
        )
        self.assertEqual(calls, [])
        self.assertEqual(unsupported_symbol["points"], [])
        self.assertIsNone(unsupported_symbol["startDate"])
        self.assertIsNone(unsupported_symbol["endDate"])

        no_coverage = fetch_crypto_supply_history.fetch_crypto_supply_history(
            "sol-usd",
            today=date(2026, 10, 9),
            fetch_json=lambda _url: {"data": []},
        )
        self.assertEqual(no_coverage["points"], [])

    def test_unavailable_provider_metric_is_reported_as_no_history(self):
        def reject_metric(_url):
            raise HTTPError(
                "https://community-api.coinmetrics.io/",
                403,
                "Forbidden",
                {},
                io.BytesIO(json.dumps({
                    "error": {
                        "message": "Requested metric is not available with supplied credentials."
                    }
                }).encode("utf-8")),
            )

        result = fetch_crypto_supply_history.fetch_crypto_supply_history(
            "sol-usd",
            today=date(2026, 10, 9),
            fetch_json=reject_metric,
        )

        self.assertEqual(result["points"], [])

    def test_invalid_provider_response_fails_instead_of_looking_like_no_history(self):
        with self.assertRaisesRegex(RuntimeError, "invalid supply history"):
            fetch_crypto_supply_history.fetch_crypto_supply_history(
                "btc-usd",
                today=date(2026, 10, 9),
                fetch_json=lambda _url: {"unexpected": []},
            )


if __name__ == "__main__":
    unittest.main()
