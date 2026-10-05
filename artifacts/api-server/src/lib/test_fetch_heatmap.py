import unittest
from datetime import date, datetime, timedelta, timezone
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


def adjusted_frame(rows):
    return pd.DataFrame(
        {
            "Close": [close for _, close, _ in rows],
            "Adj Close": [adjusted for _, _, adjusted in rows],
        },
        index=pd.DatetimeIndex([timestamp for timestamp, _, _ in rows]),
    )


class HeatMapQuoteTests(unittest.TestCase):
    def assert_quote_session(
        self,
        latest,
        now,
        expected_session,
        symbol="AAPL",
        category="stocks",
        exchange="NASDAQ",
    ):
        frame = close_frame([
            (latest - timedelta(days=1), 98),
            (latest - timedelta(minutes=5), 99),
            (latest, 100),
        ])
        quote = fetch_heatmap.quote_from_frame(
            frame,
            symbol,
            category,
            require_prior_close=False,
            now=now,
            exchange=exchange,
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

    def test_equity_sessions_follow_early_closes_and_exchange_holidays(self):
        cases = [
            # The Friday after Thanksgiving closes at 1 p.m. Eastern.
            (eastern(2024, 11, 29, 12, 55), eastern(2024, 11, 29, 13, 0), "regular", "AAPL", "stocks"),
            (eastern(2024, 11, 29, 13, 0), eastern(2024, 11, 29, 13, 5), "after_hours", "SPY", "etfs"),
            # Independence Day is an exchange holiday, even during normal hours.
            (eastern(2024, 7, 4, 10, 0), eastern(2024, 7, 4, 10, 5), "closed", "AAPL", "stocks"),
        ]
        for latest, now, expected_session, symbol, category in cases:
            with self.subTest(latest=latest, symbol=symbol):
                self.assert_quote_session(
                    latest,
                    now,
                    expected_session,
                    symbol=symbol,
                    category=category,
                )

    def test_non_us_equity_sessions_use_exchange_timezone_holidays_and_early_closes(self):
        london = ZoneInfo("Europe/London")
        self.assert_quote_session(
            datetime(2024, 8, 27, 10, 0, tzinfo=london),
            datetime(2024, 8, 27, 10, 5, tzinfo=london),
            "regular",
            symbol="VOD",
            exchange="London Stock Exchange",
        )
        # The London Stock Exchange closes at 12:30 local time on Christmas Eve.
        self.assert_quote_session(
            datetime(2024, 12, 24, 12, 25, tzinfo=london),
            datetime(2024, 12, 24, 12, 30, tzinfo=london),
            "regular",
            symbol="VOD",
            exchange="LSE",
        )
        self.assert_quote_session(
            datetime(2024, 12, 24, 12, 30, tzinfo=london),
            datetime(2024, 12, 24, 12, 35, tzinfo=london),
            "closed",
            symbol="VOD",
            exchange="XLON",
        )
        self.assert_quote_session(
            datetime(2024, 12, 25, 10, 0, tzinfo=london),
            datetime(2024, 12, 25, 10, 5, tzinfo=london),
            "closed",
            symbol="VOD",
            exchange="XLON",
        )

    def test_missing_or_unsupported_exchange_never_falls_back_to_us_hours(self):
        latest = eastern(2024, 6, 4, 10, 0)
        now = eastern(2024, 6, 4, 10, 5)
        self.assert_quote_session(latest, now, "unknown", exchange=None)
        self.assert_quote_session(latest, now, "unknown", exchange="Unmapped Exchange")

    def test_non_us_screener_quote_uses_its_exchange_calendar_and_timezone(self):
        london = ZoneInfo("Europe/London")
        quote = fetch_heatmap.quote_from_screener(
            {
                "symbol": "VOD",
                "quoteType": "EQUITY",
                "exchange": "XLON",
                "marketState": "REGULAR",
                "regularMarketPrice": 100,
                "regularMarketChangePercent": 1,
                "regularMarketTime": datetime(2024, 8, 27, 10, 0, tzinfo=london).timestamp(),
                "regularMarketPreviousClose": 99,
            },
            now=datetime(2024, 8, 27, 10, 5, tzinfo=london),
        )
        self.assertEqual(quote["marketSession"], "regular")
        self.assertEqual(quote["exchange"], "London Stock Exchange")
        self.assertEqual(quote["exchangeTimezone"], "Europe/London")

        missing_exchange = fetch_heatmap.quote_from_screener(
            {
                "symbol": "VOD",
                "quoteType": "EQUITY",
                "marketState": "REGULAR",
                "regularMarketPrice": 100,
                "regularMarketChangePercent": 1,
                "regularMarketTime": datetime(2024, 8, 27, 10, 0, tzinfo=london).timestamp(),
                "regularMarketPreviousClose": 99,
            },
            now=datetime(2024, 8, 27, 10, 5, tzinfo=london),
        )
        self.assertEqual(missing_exchange["marketSession"], "unknown")
        self.assertIsNone(missing_exchange["nextRegularOpenTimestamp"])
        self.assertIsNone(missing_exchange["exchangeTimezone"])

    def test_frame_quote_uses_exchange_metadata_after_enrichment(self):
        london = ZoneInfo("Europe/London")
        now = datetime(2024, 8, 27, 10, 5, tzinfo=london)
        frame = close_frame([
            (datetime(2024, 8, 26, 10, 0, tzinfo=london), 98),
            (datetime(2024, 8, 27, 9, 55, tzinfo=london), 99),
            (datetime(2024, 8, 27, 10, 0, tzinfo=london), 100),
        ])
        quote = fetch_heatmap.quote_from_frame(
            frame,
            "VOD",
            "custom",
            require_prior_close=False,
            now=now,
        )
        self.assertEqual(quote["marketSession"], "unknown")

        with (
            patch.object(
                fetch_heatmap,
                "read_metadata_cache",
                return_value={"VOD": {"exchange": "LSE"}},
            ),
            patch.object(fetch_heatmap, "write_metadata_cache"),
        ):
            fetch_heatmap.enrich_quote_metadata({"VOD": quote}, now)

        self.assertEqual(quote["marketSession"], "regular")
        self.assertEqual(quote["exchangeTimezone"], "Europe/London")

    def test_next_open_uses_the_listed_exchange_after_its_early_close(self):
        london = ZoneInfo("Europe/London")
        next_open = fetch_heatmap.next_regular_open_timestamp(
            datetime(2024, 12, 24, 12, 35, tzinfo=london),
            exchange="LSE",
        )
        self.assertEqual(
            datetime.fromtimestamp(next_open, timezone.utc),
            datetime(2024, 12, 27, 8, 0, tzinfo=london).astimezone(timezone.utc),
        )

    def test_next_regular_open_includes_early_close_and_holiday_schedules(self):
        friday_after_early_close = eastern(2024, 11, 29, 13, 5)
        holiday = eastern(2024, 7, 4, 10, 5)

        monday_open = fetch_heatmap.next_regular_open_timestamp(
            friday_after_early_close,
            exchange="NYSE",
        )
        friday_open = fetch_heatmap.next_regular_open_timestamp(holiday, exchange="NASDAQ")

        self.assertEqual(
            datetime.fromtimestamp(monday_open, timezone.utc),
            eastern(2024, 12, 2, 9, 30).astimezone(timezone.utc),
        )
        self.assertEqual(
            datetime.fromtimestamp(friday_open, timezone.utc),
            eastern(2024, 7, 5, 9, 30).astimezone(timezone.utc),
        )

    def test_temporary_us_closure_override_is_applied_and_removal_restores_calendar(self):
        class WeekdayCalendar:
            tz = EASTERN

            def sessions_in_range(self, start, end):
                first = date.fromisoformat(start)
                last = date.fromisoformat(end)
                sessions = []
                current = first
                while current <= last:
                    if current.weekday() < 5:
                        sessions.append(current)
                    current += timedelta(days=1)
                return sessions

            def session_open(self, session):
                return pd.Timestamp(
                    datetime(
                        session.year,
                        session.month,
                        session.day,
                        9,
                        30,
                        tzinfo=self.tz,
                    )
                )

        as_of = eastern(2026, 10, 8, 16, 0)
        override = {
            "start_date": date(2026, 10, 9),
            "end_date": date(2026, 10, 9),
            "reopen_at": eastern(2026, 10, 12, 9, 30),
        }
        with patch.object(
            fetch_heatmap,
            "calendar_for_exchange",
            return_value=WeekdayCalendar(),
        ):
            with patch.object(
                fetch_heatmap,
                "US_EQUITY_TEMPORARY_CLOSURE_OVERRIDES",
                (override,),
            ):
                overridden_open = fetch_heatmap.next_regular_open_timestamp(
                    as_of,
                    exchange="NYSE",
                )
                self.assertEqual(
                    datetime.fromtimestamp(overridden_open, timezone.utc),
                    eastern(2026, 10, 12, 9, 30).astimezone(timezone.utc),
                )

            with patch.object(
                fetch_heatmap,
                "US_EQUITY_TEMPORARY_CLOSURE_OVERRIDES",
                (),
            ):
                normal_open = fetch_heatmap.next_regular_open_timestamp(
                    as_of,
                    exchange="NYSE",
                )
                self.assertEqual(
                    datetime.fromtimestamp(normal_open, timezone.utc),
                    eastern(2026, 10, 9, 9, 30).astimezone(timezone.utc),
                )

    def test_confirmed_temporary_closure_supplies_reopen_without_calendar(self):
        now = eastern(2026, 10, 9, 10, 0)
        reopen_at = eastern(2026, 10, 12, 9, 30)
        override = {
            "start_date": date(2026, 10, 9),
            "end_date": date(2026, 10, 9),
            "reopen_at": reopen_at,
        }
        frame = close_frame([
            (eastern(2026, 10, 8, 15, 55), 98),
            (eastern(2026, 10, 9, 9, 50), 99),
            (eastern(2026, 10, 9, 9, 55), 100),
        ])
        with (
            patch.object(
                fetch_heatmap,
                "US_EQUITY_TEMPORARY_CLOSURE_OVERRIDES",
                (override,),
            ),
            patch.object(fetch_heatmap, "calendar_for_exchange", return_value=None),
        ):
            quote = fetch_heatmap.quote_from_frame(
                frame,
                "SPY",
                "etfs",
                require_prior_close=False,
                now=now,
                exchange="NYSE",
            )

        self.assertEqual(quote["marketSession"], "closed")
        self.assertEqual(
            datetime.fromtimestamp(quote["nextRegularOpenTimestamp"], timezone.utc),
            reopen_at.astimezone(timezone.utc),
        )

    def test_unconfirmed_temporary_closure_omits_reopen_estimate(self):
        now = eastern(2026, 10, 9, 10, 0)
        override = {
            "start_date": date(2026, 10, 9),
            "end_date": date(2026, 10, 9),
            "reopen_at": None,
        }
        frame = close_frame([
            (eastern(2026, 10, 8, 15, 55), 98),
            (eastern(2026, 10, 9, 9, 50), 99),
            (eastern(2026, 10, 9, 9, 55), 100),
        ])
        with (
            patch.object(
                fetch_heatmap,
                "US_EQUITY_TEMPORARY_CLOSURE_OVERRIDES",
                (override,),
            ),
            patch.object(fetch_heatmap, "calendar_for_exchange", return_value=None),
        ):
            quote = fetch_heatmap.quote_from_frame(
                frame,
                "SPY",
                "etfs",
                require_prior_close=False,
                now=now,
                exchange="NYSE",
            )

        self.assertEqual(quote["marketSession"], "closed")
        self.assertIsNone(quote["nextRegularOpenTimestamp"])

    def test_quotes_include_next_open_only_for_closed_or_after_hours_equities(self):
        frame_quote = fetch_heatmap.quote_from_frame(
            close_frame([
                (eastern(2024, 11, 27, 16, 0), 98),
                (eastern(2024, 11, 29, 12, 55), 99),
                (eastern(2024, 11, 29, 13, 0), 100),
            ]),
            "SPY",
            "etfs",
            require_prior_close=False,
            now=eastern(2024, 11, 29, 13, 5),
            exchange="NYSE",
        )
        after_hours = fetch_heatmap.quote_from_screener(
            {
                "symbol": "SPY",
                "quoteType": "ETF",
                "exchange": "NYQ",
                "marketState": "POST",
                "postMarketPrice": 100,
                "postMarketChangePercent": 1,
                "postMarketTime": eastern(2024, 11, 29, 13, 5).timestamp(),
                "regularMarketPreviousClose": 99,
            },
            now=eastern(2024, 11, 29, 13, 10),
        )
        regular = fetch_heatmap.quote_from_screener(
            {
                "symbol": "AAPL",
                "quoteType": "EQUITY",
                "exchange": "NMS",
                "marketState": "REGULAR",
                "regularMarketPrice": 100,
                "regularMarketChangePercent": 1,
                "regularMarketTime": eastern(2024, 11, 29, 12, 0).timestamp(),
                "regularMarketPreviousClose": 99,
            },
            now=eastern(2024, 11, 29, 12, 5),
        )

        self.assertEqual(frame_quote["marketSession"], "after_hours")
        self.assertEqual(
            datetime.fromtimestamp(frame_quote["nextRegularOpenTimestamp"], timezone.utc),
            eastern(2024, 12, 2, 9, 30).astimezone(timezone.utc),
        )
        self.assertEqual(after_hours["marketSession"], "after_hours")
        self.assertEqual(
            datetime.fromtimestamp(after_hours["nextRegularOpenTimestamp"], timezone.utc),
            eastern(2024, 12, 2, 9, 30).astimezone(timezone.utc),
        )
        self.assertIsNone(regular["nextRegularOpenTimestamp"])

    def test_missing_equity_schedule_omits_next_open_time(self):
        with patch.object(fetch_heatmap, "calendar_for_exchange", return_value=None):
            self.assertIsNone(
                fetch_heatmap.next_regular_open_timestamp(
                    eastern(2024, 11, 29, 13, 10),
                    exchange="NYSE",
                )
            )

    def test_equity_calendar_failure_never_marks_quotes_regular(self):
        latest = eastern(2024, 11, 29, 13, 5)
        now = eastern(2024, 11, 29, 13, 10)
        with patch.object(fetch_heatmap, "calendar_for_exchange", return_value=None):
            self.assert_quote_session(latest, now, "unknown")

            # Even without a schedule, a quote older than the freshness window stays inactive.
            self.assert_quote_session(
                eastern(2024, 11, 29, 13, 0),
                eastern(2024, 11, 29, 13, 45),
                "closed",
            )

    def test_screener_regular_labels_are_checked_against_the_equity_calendar(self):
        early_close_quote = fetch_heatmap.quote_from_screener(
            {
                "symbol": "SPY",
                "quoteType": "ETF",
                "exchange": "NYSE",
                "marketState": "REGULAR",
                "regularMarketPrice": 100,
                "regularMarketChangePercent": 1,
                "regularMarketTime": eastern(2024, 11, 29, 13, 5).timestamp(),
                "regularMarketPreviousClose": 99,
            },
            now=eastern(2024, 11, 29, 13, 10),
        )
        self.assertEqual(early_close_quote["marketSession"], "after_hours")

        holiday_quote = fetch_heatmap.quote_from_screener(
            {
                "symbol": "AAPL",
                "quoteType": "EQUITY",
                "exchange": "NASDAQ",
                "marketState": "REGULAR",
                "regularMarketPrice": 100,
                "regularMarketChangePercent": 1,
                "regularMarketTime": eastern(2024, 7, 4, 10, 0).timestamp(),
                "regularMarketPreviousClose": 99,
            },
            now=eastern(2024, 7, 4, 10, 5),
        )
        self.assertEqual(holiday_quote["marketSession"], "closed")

    def test_futures_are_active_during_overnight_sessions_and_closed_for_maintenance(self):
        cases = [
            (eastern(2024, 6, 4, 2, 0), eastern(2024, 6, 4, 2, 5), "regular"),
            (eastern(2024, 6, 4, 16, 54), eastern(2024, 6, 4, 16, 59), "regular"),
            (eastern(2024, 6, 4, 17, 0), eastern(2024, 6, 4, 17, 0), "closed"),
            (eastern(2024, 6, 4, 17, 25), eastern(2024, 6, 4, 17, 30), "closed"),
            (eastern(2024, 6, 4, 17, 59), eastern(2024, 6, 4, 17, 59), "closed"),
            (eastern(2024, 6, 4, 18, 0), eastern(2024, 6, 4, 18, 0), "regular"),
        ]
        for latest, now, expected_session in cases:
            with self.subTest(latest=latest, now=now):
                self.assert_quote_session(
                    latest,
                    now,
                    expected_session,
                    symbol="ES=F",
                    category="futures",
                )

    def test_futures_close_for_weekend_and_reopen_sunday_evening(self):
        cases = [
            (eastern(2024, 6, 7, 16, 59), eastern(2024, 6, 7, 16, 59), "regular"),
            (eastern(2024, 6, 7, 17, 0), eastern(2024, 6, 7, 17, 0), "closed"),
            (eastern(2024, 6, 9, 17, 59), eastern(2024, 6, 9, 17, 59), "closed"),
            (eastern(2024, 6, 9, 18, 0), eastern(2024, 6, 9, 18, 0), "regular"),
        ]
        for latest, now, expected_session in cases:
            with self.subTest(latest=latest, now=now):
                self.assert_quote_session(
                    latest,
                    now,
                    expected_session,
                    symbol="ES=F",
                    category="futures",
                )

    def test_futures_follow_cme_holiday_closures_and_early_closes(self):
        cases = [
            # CME Globex does not trade on Good Friday.
            (eastern(2024, 3, 29, 10, 0), eastern(2024, 3, 29, 10, 0), "closed"),
            # CME's Independence Day schedule closes at 1 p.m. Eastern.
            (eastern(2024, 7, 4, 12, 55), eastern(2024, 7, 4, 12, 55), "regular"),
            (eastern(2024, 7, 4, 13, 0), eastern(2024, 7, 4, 13, 0), "closed"),
            # Juneteenth's observed CME schedule also closes at 1 p.m. Eastern.
            (eastern(2024, 6, 19, 12, 55), eastern(2024, 6, 19, 12, 55), "regular"),
            (eastern(2024, 6, 19, 13, 0), eastern(2024, 6, 19, 13, 0), "closed"),
        ]
        for latest, now, expected_session in cases:
            with self.subTest(latest=latest, now=now):
                self.assert_quote_session(
                    latest,
                    now,
                    expected_session,
                    symbol="ES=F",
                    category="futures",
                )

    def test_futures_symbols_map_to_product_groups_and_venue(self):
        expected_cme_groups = {
            "equity_index": {"ES=F", "NQ=F", "YM=F", "RTY=F"},
            "interest_rates": {"ZN=F", "ZB=F", "ZF=F"},
            "fx": {"6E=F", "6J=F", "6B=F", "6C=F"},
        }
        self.assertEqual(
            {
                group: set(symbols)
                for group, symbols in fetch_heatmap.CME_FUTURES_PRODUCT_GROUPS.items()
            },
            expected_cme_groups,
        )
        self.assertEqual(fetch_heatmap.OTHER_FUTURES_PRODUCT_GROUPS["ice_dollar_index"], {"DX=F"})
        self.assertEqual(
            set(fetch_heatmap.FUTURES_PRODUCT_GROUP_BY_SYMBOL),
            set(fetch_heatmap.FUTURE_SYMBOLS),
        )

    def test_2026_thanksgiving_futures_follow_product_group_close_boundaries_offline(self):
        cases = [
            # CME lists Equity Index and Interest Rates through 12:15 p.m. CT.
            ("ES=F", eastern(2026, 11, 27, 13, 14), "regular"),
            ("ES=F", eastern(2026, 11, 27, 13, 15), "closed"),
            ("ZN=F", eastern(2026, 11, 27, 13, 14), "regular"),
            ("ZN=F", eastern(2026, 11, 27, 13, 15), "closed"),
            # At 1:30 p.m. CT, only the FX group remains open.
            ("ES=F", eastern(2026, 11, 27, 14, 30), "closed"),
            ("ZN=F", eastern(2026, 11, 27, 14, 30), "closed"),
            ("6E=F", eastern(2026, 11, 27, 14, 30), "regular"),
            # FX remains open until 1:45 p.m. CT, 90 minutes later.
            ("6E=F", eastern(2026, 11, 27, 14, 44), "regular"),
            ("6E=F", eastern(2026, 11, 27, 14, 45), "closed"),
        ]
        with patch.object(
            fetch_heatmap,
            "cme_futures_calendar",
            side_effect=RuntimeError("holiday override must not need a calendar"),
        ):
            for symbol, now, expected_session in cases:
                with self.subTest(symbol=symbol, now=now):
                    self.assert_quote_session(
                        now,
                        now,
                        expected_session,
                        symbol=symbol,
                        category="futures",
                    )

    def test_futures_calendar_failure_never_marks_quotes_regular(self):
        latest = eastern(2024, 6, 4, 10, 0)
        now = eastern(2024, 6, 4, 10, 5)
        with patch.object(
            fetch_heatmap,
            "cme_futures_calendar",
            side_effect=RuntimeError("calendar unavailable"),
        ):
            self.assert_quote_session(
                latest,
                now,
                "unknown",
                symbol="ES=F",
                category="futures",
            )

    def test_commodity_globex_contracts_follow_daily_breaks_and_weekly_open(self):
        cases = [
            ("GC=F", eastern(2024, 6, 4, 2, 0), "regular"),
            ("CL=F", eastern(2024, 6, 4, 16, 59), "regular"),
            ("SI=F", eastern(2024, 6, 4, 17, 0), "closed"),
            ("NG=F", eastern(2024, 6, 4, 17, 59), "closed"),
            ("HG=F", eastern(2024, 6, 4, 18, 0), "regular"),
            ("PL=F", eastern(2024, 6, 7, 16, 59), "regular"),
            ("PA=F", eastern(2024, 6, 7, 17, 0), "closed"),
            ("GC=F", eastern(2024, 6, 9, 17, 59), "closed"),
            ("CL=F", eastern(2024, 6, 9, 18, 0), "regular"),
        ]
        for symbol, now, expected_session in cases:
            with self.subTest(symbol=symbol, now=now):
                self.assert_quote_session(
                    now,
                    now,
                    expected_session,
                    symbol=symbol,
                    category="commodities",
                )

    def test_commodity_grains_follow_split_sessions_and_sunday_open(self):
        cases = [
            ("ZC=F", eastern(2024, 6, 9, 19, 59), "closed"),
            ("ZW=F", eastern(2024, 6, 9, 20, 0), "regular"),
            ("ZS=F", eastern(2024, 6, 10, 8, 44), "regular"),
            ("ZC=F", eastern(2024, 6, 10, 8, 45), "closed"),
            ("ZW=F", eastern(2024, 6, 10, 9, 29), "closed"),
            ("ZS=F", eastern(2024, 6, 10, 9, 30), "regular"),
            ("ZC=F", eastern(2024, 6, 10, 14, 19), "regular"),
            ("ZW=F", eastern(2024, 6, 10, 14, 20), "closed"),
            ("ZS=F", eastern(2024, 6, 14, 20, 0), "closed"),
        ]
        for symbol, now, expected_session in cases:
            with self.subTest(symbol=symbol, now=now):
                self.assert_quote_session(
                    now,
                    now,
                    expected_session,
                    symbol=symbol,
                    category="commodities",
                )

    def test_commodity_ice_and_livestock_schedule_families(self):
        cases = [
            # ICE cotton opens Sunday evening and runs overnight through its weekday close.
            ("CT=F", eastern(2024, 6, 9, 20, 59), "closed"),
            ("CT=F", eastern(2024, 6, 9, 21, 0), "regular"),
            ("CT=F", eastern(2024, 6, 10, 14, 19), "regular"),
            ("CT=F", eastern(2024, 6, 10, 14, 20), "closed"),
            ("CT=F", eastern(2024, 6, 14, 21, 0), "closed"),
            # ICE coffee and sugar, and CME livestock, have weekday daytime sessions.
            ("KC=F", eastern(2024, 6, 10, 4, 14), "closed"),
            ("KC=F", eastern(2024, 6, 10, 4, 15), "regular"),
            ("KC=F", eastern(2024, 6, 10, 13, 30), "closed"),
            ("SB=F", eastern(2024, 6, 10, 3, 29), "closed"),
            ("SB=F", eastern(2024, 6, 10, 3, 30), "regular"),
            ("SB=F", eastern(2024, 6, 10, 13, 0), "closed"),
            ("LE=F", eastern(2024, 6, 10, 9, 29), "closed"),
            ("HE=F", eastern(2024, 6, 10, 9, 30), "regular"),
            ("LE=F", eastern(2024, 6, 10, 14, 5), "closed"),
            ("HE=F", eastern(2024, 6, 8, 10, 0), "closed"),
        ]
        for symbol, now, expected_session in cases:
            with self.subTest(symbol=symbol, now=now):
                self.assert_quote_session(
                    now,
                    now,
                    expected_session,
                    symbol=symbol,
                    category="commodities",
                )

    def test_temporary_ice_schedule_override_is_limited_to_its_dates_and_products(self):
        override = {
            "start_date": date(2024, 6, 11),
            "end_date": date(2024, 6, 12),
            "sessions": {
                "KC=F": {
                    1: ((5 * 60 + 15, 13 * 60 + 30),),
                    2: ((5 * 60 + 15, 13 * 60 + 30),),
                },
                "CT=F": {
                    1: ((22 * 60, 24 * 60),),
                    2: ((22 * 60, 24 * 60),),
                },
            },
        }
        cases = [
            # Immediately before the override, coffee follows regular hours.
            (eastern(2024, 6, 10, 4, 30), "regular"),
            # During the override, the later opening time applies on both dates.
            (eastern(2024, 6, 11, 4, 30), "closed"),
            (eastern(2024, 6, 11, 5, 15), "regular"),
            (eastern(2024, 6, 12, 4, 30), "closed"),
            # Immediately after the override, regular hours resume.
            (eastern(2024, 6, 13, 4, 30), "regular"),
        ]
        with patch.object(
            fetch_heatmap,
            "ICE_COMMODITY_SCHEDULE_OVERRIDES",
            (override,),
        ):
            for now, expected_session in cases:
                with self.subTest(now=now):
                    self.assert_quote_session(
                        now,
                        now,
                        expected_session,
                        symbol="KC=F",
                        category="commodities",
                    )

            cotton_cases = [
                # Cotton also uses the override, with its own temporary opening.
                (eastern(2024, 6, 11, 21, 30), "closed"),
                (eastern(2024, 6, 11, 22, 0), "regular"),
            ]
            for now, expected_session in cotton_cases:
                with self.subTest(symbol="CT=F", now=now):
                    self.assert_quote_session(
                        now,
                        now,
                        expected_session,
                        symbol="CT=F",
                        category="commodities",
                    )

            # ICE schedule data cannot change a CME commodity's regular hours.
            self.assert_quote_session(
                eastern(2024, 6, 11, 4, 30),
                eastern(2024, 6, 11, 4, 30),
                "regular",
                symbol="ZW=F",
                category="commodities",
            )

    def test_every_supported_commodity_has_a_session_family(self):
        mapped = set().union(*fetch_heatmap.COMMODITY_SESSION_FAMILIES.values())
        self.assertEqual(mapped, set(fetch_heatmap.COMMODITY_SYMBOLS))

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
                    exchange="NYSE",
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
        self.assertEqual(quotes["ES=F"]["marketSession"], "regular")

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

    def test_provider_sectors_are_normalized_and_missing_values_are_unknown(self):
        self.assertEqual(fetch_heatmap.normalize_sector("Health Care"), "Healthcare")
        self.assertEqual(fetch_heatmap.normalize_sector(None, "AAPL"), "Technology")
        self.assertEqual(fetch_heatmap.normalize_sector(None, "UNLISTED"), "Unknown")
        self.assertEqual(fetch_heatmap.normalize_exchange("NMS"), "NASDAQ")
        self.assertEqual(fetch_heatmap.normalize_exchange("NasdaqGS"), "NASDAQ")
        self.assertEqual(fetch_heatmap.normalize_exchange("XLON"), "London Stock Exchange")
        self.assertEqual(fetch_heatmap.normalize_exchange("XNAS"), "NASDAQ")
        self.assertEqual(
            fetch_heatmap.merge_metadata(
                {"sector": "Unknown"},
                {"sector": "Health Care"},
                "stock",
            )["sector"],
            "Healthcare",
        )

    def test_sector_query_uses_provider_sector_names_and_primary_us_exchanges(self):
        query = fetch_heatmap.build_sector_screen_query("Real Estate").to_dict()
        encoded = str(query)
        self.assertIn("['sector', 'Real Estate']", encoded)
        self.assertIn("['region', 'us']", encoded)
        self.assertIn("['exchange', 'NMS']", encoded)
        self.assertNotIn("PNK", encoded)

        financials = str(fetch_heatmap.build_sector_screen_query("Financials").to_dict())
        self.assertIn("['sector', 'Financial Services']", financials)
        with self.assertRaises(ValueError):
            fetch_heatmap.build_sector_screen_query("Unknown")

    def test_sector_screener_pages_until_at_least_fifteen_valid_quotes(self):
        now = int(datetime.now(timezone.utc).timestamp())

        def screener_row(symbol, timestamp):
            return {
                "symbol": symbol,
                "quoteType": "EQUITY",
                "exchange": "NMS",
                "currency": "USD",
                "marketState": "CLOSED",
                "regularMarketPrice": 25,
                "regularMarketChangePercent": 1,
                "regularMarketTime": timestamp,
                "regularMarketPreviousClose": 24,
            }

        first_page = [screener_row(f"RE{index:02}", now) for index in range(10)]
        first_page += [screener_row(f"OLD{index:02}", 1) for index in range(40)]
        second_page = [screener_row(f"RE{index:02}", now) for index in range(10, 15)]
        second_page += [screener_row(f"OLD2{index:02}", 1) for index in range(45)]
        with patch.object(
            fetch_heatmap.yf,
            "screen",
            side_effect=[
                {"quotes": first_page, "total": 100},
                {"quotes": second_page, "total": 100},
            ],
        ) as screen:
            quotes = fetch_heatmap.sector_screener_quotes("Real Estate")

        self.assertEqual(len(quotes), 15)
        self.assertTrue(all(quote["sector"] == "Real Estate" for quote in quotes))
        self.assertEqual([call.kwargs["offset"] for call in screen.call_args_list], [0, 50])
        self.assertTrue(all(call.kwargs["size"] == 50 for call in screen.call_args_list))

    def test_risk_levels_use_the_exact_historical_volatility_boundaries(self):
        expected = [
            (14.999, "Conservative"),
            (15, "Moderate Conservative"),
            (24.999, "Moderate Conservative"),
            (25, "Moderate"),
            (40, "Moderate Aggressive"),
            (60, "Aggressive"),
        ]
        for volatility, band in expected:
            with self.subTest(volatility=volatility):
                self.assertEqual(fetch_heatmap.risk_band_for_volatility(volatility), band)
        self.assertIsNone(fetch_heatmap.risk_band_for_volatility(None))

    def test_market_cap_buckets_use_usd_cutoffs(self):
        cases = [
            (299_999_999, "Micro"),
            (300_000_000, "Small"),
            (2_000_000_000, "Mid"),
            (10_000_000_000, "Large"),
            (200_000_000_000, "Mega"),
            (None, None),
        ]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(fetch_heatmap.market_cap_bucket(value), expected)

    def test_one_day_return_uses_latest_quote_and_adjusted_previous_close(self):
        now = datetime(2026, 10, 2, 20, 5, tzinfo=timezone.utc)
        frame = adjusted_frame([
            (datetime(2026, 10, 1), 100, 99),
            (datetime(2026, 10, 2), 105, 103),
        ])
        quote = {
            "symbol": "ABC",
            "assetType": "stock",
            "price": 105,
            "priceTimestamp": int(datetime(2026, 10, 2, 20, tzinfo=timezone.utc).timestamp()),
        }
        result = fetch_heatmap.enrich_quote_with_history(quote, frame, "1d", now)
        self.assertAlmostEqual(result["returnPercent"], (103 / 99 - 1) * 100, places=3)
        self.assertEqual(result["returnBasis"], "adjusted_total_return")
        self.assertEqual(result["historyStartDate"], "2026-10-01")

    def test_calendar_month_uses_last_close_on_or_before_lookback_date(self):
        now = datetime(2024, 3, 31, 12, tzinfo=timezone.utc)
        rows = [
            {"date": date(2024, 2, 28), "close": 90, "adjusted": 90},
            {"date": date(2024, 2, 29), "close": 92, "adjusted": 92},
            {"date": date(2024, 3, 1), "close": 100, "adjusted": 100},
        ]
        baseline = fetch_heatmap.return_baseline(rows, "1m", date(2024, 3, 31), now.date())
        self.assertEqual(baseline["date"], date(2024, 2, 29))

    def test_all_nine_periods_choose_the_requested_calendar_baseline(self):
        now = datetime(2026, 10, 4, 12, tzinfo=timezone.utc)
        quote_day = date(2026, 10, 2)
        start = date(2020, 9, 30)
        rows = []
        cursor = start
        while cursor <= quote_day:
            if cursor.weekday() < 5:
                price = 100 + (cursor - start).days
                rows.append({"date": cursor, "close": price, "adjusted": price})
            cursor += timedelta(days=1)
        quote = {
            "symbol": "ABC",
            "assetType": "stock",
            "price": rows[-1]["close"],
            "priceTimestamp": int(datetime(2026, 10, 2, 20, tzinfo=timezone.utc).timestamp()),
        }
        for period in ("1d", "1w", "1m", "3m", "6m", "1y", "3y", "5y", "max"):
            with self.subTest(period=period):
                baseline = fetch_heatmap.return_baseline(rows, period, quote_day, now.date())
                self.assertIsNotNone(baseline)
                result = fetch_heatmap.enrich_quote_with_history(
                    dict(quote),
                    pd.DataFrame(
                        {
                            "Close": [row["close"] for row in rows],
                            "Adj Close": [row["adjusted"] for row in rows],
                        },
                        index=pd.DatetimeIndex([datetime.combine(row["date"], datetime.min.time()) for row in rows]),
                    ),
                    period,
                    now,
                )
                self.assertAlmostEqual(
                    result["returnPercent"],
                    (quote["price"] / baseline["close"] - 1) * 100,
                    places=4,
                )
                self.assertEqual(result["returnUnavailableReason"], None)

    def test_longer_requested_range_is_unavailable_instead_of_shortened(self):
        rows = [
            {"date": date(2023, 1, 3), "close": 100, "adjusted": 100},
            {"date": date(2026, 10, 2), "close": 120, "adjusted": 120},
        ]
        self.assertIsNone(fetch_heatmap.return_baseline(rows, "5y", date(2026, 10, 2), date(2026, 10, 4)))

    def test_missing_history_is_unavailable_and_max_reports_actual_start(self):
        now = datetime(2026, 10, 4, 12, tzinfo=timezone.utc)
        frame = adjusted_frame([
            (datetime(2026, 5, 1), 100, 100),
            (datetime(2026, 5, 4), 110, 110),
        ])
        quote = {
            "symbol": "ABC",
            "assetType": "stock",
            "price": 110,
            "priceTimestamp": int(datetime(2026, 5, 4, 20, tzinfo=timezone.utc).timestamp()),
        }
        unavailable = fetch_heatmap.enrich_quote_with_history(dict(quote), frame, "1y", now)
        self.assertIsNone(unavailable["returnPercent"])
        self.assertEqual(unavailable["returnUnavailableReason"], "Not enough history for the selected period")
        maximum = fetch_heatmap.enrich_quote_with_history(dict(quote), frame, "max", now)
        self.assertEqual(maximum["returnPercent"], 10)
        self.assertEqual(maximum["historyStartDate"], "2026-05-01")

    def test_volatility_requires_sixty_returns_and_annualizes_crypto_continuously(self):
        now = date(2026, 10, 4)
        too_short = [
            {"date": now - timedelta(days=59 - index), "close": 100 + index % 2, "adjusted": 100 + index % 2}
            for index in range(60)
        ]
        self.assertIsNone(fetch_heatmap.daily_volatility_percent(too_short, "stock", now, False))
        rows = [
            {"date": now - timedelta(days=60 - index), "close": 100 + index % 2, "adjusted": 100 + index % 2}
            for index in range(61)
        ]
        stocks = fetch_heatmap.daily_volatility_percent(rows, "stock", now, False)
        crypto = fetch_heatmap.daily_volatility_percent(rows, "cryptocurrency", now, False)
        self.assertIsNotNone(stocks)
        self.assertAlmostEqual(crypto / stocks, (365 / 252) ** 0.5)


class HeatMapScreenerTests(unittest.TestCase):
    def test_stock_breadth_pages_up_to_250_most_active_results(self):
        def page(start, count, total):
            return {
                "quotes": [{"symbol": f"SYM{index}"} for index in range(start, start + count)],
                "total": total,
            }

        with patch.object(
            fetch_heatmap.yf,
            "screen",
            side_effect=[page(0, 25, 54), page(25, 25, 54), page(50, 4, 54)],
        ) as screen:
            rows = fetch_heatmap.most_active_screen_rows(250)

        self.assertEqual(len(rows), 54)
        self.assertEqual(
            [call.kwargs["offset"] for call in screen.call_args_list],
            [0, 25, 50],
        )
        self.assertTrue(all(call.kwargs["count"] == 25 for call in screen.call_args_list))

    def test_etf_screener_request_remains_unchanged(self):
        with patch.object(
            fetch_heatmap.yf,
            "screen",
            return_value={"quotes": []},
        ) as screen:
            self.assertEqual(fetch_heatmap.screener_quotes("etfs"), [])

        screen.assert_called_once_with("most_actives", count=100)


if __name__ == "__main__":
    unittest.main()
