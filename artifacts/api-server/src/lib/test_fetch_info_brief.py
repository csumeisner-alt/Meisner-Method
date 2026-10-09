import unittest

import fetch_info_brief


class InfoBriefCryptoFieldTests(unittest.TestCase):
    def test_crypto_supply_and_24_hour_volume_are_projected_from_provider_data(self):
        payload = fetch_info_brief.build_info_brief_payload(
            "BTC-USD",
            {
                "longName": "Bitcoin USD",
                "currentPrice": 67_000,
                "circulatingSupply": 19_800_000,
                "maxSupply": 21_000_000,
                "volume24Hr": 18_400_000_000,
            },
        )

        self.assertEqual(payload["symbol"], "BTC-USD")
        self.assertEqual(payload["circulatingSupply"], 19_800_000)
        self.assertEqual(payload["maxSupply"], 21_000_000)
        self.assertEqual(payload["volume24Hr"], 18_400_000_000)

    def test_unreported_crypto_supply_and_volume_remain_unavailable(self):
        payload = fetch_info_brief.build_info_brief_payload(
            "SOME-USD",
            {"longName": "Some Coin USD", "regularMarketPrice": 1.25},
        )

        self.assertIsNone(payload["circulatingSupply"])
        self.assertIsNone(payload["maxSupply"])
        self.assertIsNone(payload["volume24Hr"])


class InfoBriefEtfFieldTests(unittest.TestCase):
    def test_expense_ratio_normalizes_provider_units(self):
        self.assertEqual(
            fetch_info_brief.get_expense_ratio({"annualReportExpenseRatio": 0.0004}),
            0.0004,
        )
        self.assertEqual(
            fetch_info_brief.get_expense_ratio({"netExpenseRatio": 0.08}),
            0.0008,
        )
        self.assertEqual(
            fetch_info_brief.get_expense_ratio({"grossExpenseRatio": 0.12}),
            0.0012,
        )
        self.assertIsNone(fetch_info_brief.get_expense_ratio({}))

    def test_etf_profile_projects_focus_cost_size_income_and_holdings(self):
        profile = fetch_info_brief.build_etf_profile_payload(
            {
                "category": "Large Blend",
                "fundFamily": "Example Funds",
                "netExpenseRatio": 0.08,
                "totalAssets": 500_000_000_000,
                "yield": 0.012,
                "beta3Year": 1.04,
            },
            {
                "technology": 0.40,
                "healthcare": 0.18,
                "utilities": 0.0,
            },
            [
                {"symbol": "ABC", "name": "Alpha Corp", "weight": 0.12},
                {"symbol": "DEF", "name": "Delta Inc", "weight": 0.08},
            ],
        )

        self.assertEqual(profile["fundCategory"], "Large Blend")
        self.assertEqual(profile["fundFamily"], "Example Funds")
        self.assertAlmostEqual(profile["expenseRatio"], 0.0008)
        self.assertEqual(profile["totalAssets"], 500_000_000_000)
        self.assertEqual(profile["dividendYield"], 0.012)
        self.assertEqual(profile["beta3Year"], 1.04)
        self.assertEqual(profile["largestSector"], "Technology")
        self.assertEqual(profile["largestSectorWeight"], 0.40)
        self.assertEqual(profile["topHoldings"][0]["symbol"], "ABC")
        self.assertIsNone(profile["marketRegime"])

    def test_sector_and_holding_values_are_sanitized(self):
        self.assertEqual(
            fetch_info_brief.get_dominant_sector({
                "technology": float("nan"),
                "healthcare": 0.25,
                "utilities": 0.0,
            }),
            ("Healthcare", 0.25),
        )
        self.assertEqual(
            fetch_info_brief.normalize_top_holdings([
                {"symbol": "abc", "name": "Alpha Corp", "weight": 12.5},
                {"symbol": "invalid", "name": "Invalid", "weight": float("inf")},
                {"symbol": "", "name": "No symbol", "weight": 0.2},
            ]),
            [{"symbol": "ABC", "name": "Alpha Corp", "weight": 0.125}],
        )

    def test_regime_performance_uses_complete_years_and_requires_multiple_samples(self):
        benchmark_closes = {
            2019: 100.0,
            2020: 120.0,       # bull: +20%
            2021: 126.0,       # mixed: +5%
            2022: 100.8,       # bear: -20%
            2023: 105.84,      # mixed: +5%
            2024: 118.5408,    # bull: +12%
            2025: 100.75968,   # bear: -15%
            2026: 130.0,       # incomplete current year must be ignored
        }
        etf_closes = {
            2019: 100.0,
            2020: 120.0,       # bull: +20%
            2021: 121.2,        # mixed: +1%
            2022: 106.656,      # bear: -12%
            2023: 108.78912,    # mixed: +2%
            2024: 141.425856,   # bull: +30%
            2025: 127.2832704,  # bear: -10%
            2026: 200.0,
        }

        result = fetch_info_brief.calculate_market_regime_performance(
            etf_closes,
            benchmark_closes,
            current_year=2026,
            lookback_years=6,
        )

        self.assertEqual(result["bestRegime"], "bull")
        self.assertEqual(result["firstYear"], 2020)
        self.assertEqual(result["lastYear"], 2025)
        self.assertEqual(result["periods"]["bull"]["years"], 2)
        self.assertEqual(result["periods"]["bear"]["years"], 2)
        self.assertEqual(result["periods"]["mixed"]["years"], 2)
        self.assertAlmostEqual(
            result["periods"]["bull"]["averageAnnualReturn"],
            0.25,
        )

        limited = fetch_info_brief.calculate_market_regime_performance(
            {2020: 100.0, 2021: 120.0, 2022: 130.0},
            {2020: 100.0, 2021: 120.0, 2022: 130.0},
            current_year=2023,
            lookback_years=2,
        )
        self.assertIsNone(limited["bestRegime"])


if __name__ == "__main__":
    unittest.main()
