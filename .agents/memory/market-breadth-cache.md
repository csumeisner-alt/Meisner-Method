---
name: Market breadth cache behavior
description: Why the broad market indicator uses startup warming and stale-while-revalidate.
---

Keep the market breadth sample at up to 250 active stocks. Yahoo's cold screener request has exceeded a 30-second client wait, while a warmed response completed in under 50 ms.

**Why:** The Analyze badge needs broad-market coverage, but making each client request wait on the external screener makes first load and periodic refreshes feel broken.

**How to apply:** Warm market breadth when the API starts. After the first good snapshot, return it immediately when stale and refresh in the background; keep quote timestamps visible to freshness filtering. Do not shrink the sample just to hide cache timing without revisiting the product tradeoff.
