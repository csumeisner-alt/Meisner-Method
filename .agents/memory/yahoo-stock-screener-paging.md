---
name: Yahoo stock-screener paging
description: Yahoo Finance's predefined most-active screener page behavior through yfinance.
---

The Yahoo `most_actives` screener may return only 25 rows per request even when a larger `count` is supplied. To collect a wider breadth sample, page with `offset` and stop at the requested maximum or the provider's reported `total`.

**Why:** direct checks of the current yfinance integration returned 25 rows for `count=250`, while offset pages exposed more available securities.

**How to apply:** when broadening the stock breadth universe, keep the offset paging and maximum bounded; do not assume `count` alone expands the result page.
