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


if __name__ == "__main__":
    unittest.main()
