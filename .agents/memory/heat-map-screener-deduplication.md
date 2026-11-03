---
name: Heat-map screener deduplication
description: Why repeated screener rows must be removed before serving heat-map quote lists.
---

Yahoo screener pages can repeat a ticker row. These are duplicate records for one Yahoo symbol, not separate listings. The standard stock heat-map path builds a symbol-keyed map, but the fast market-breadth snapshot serializes screener rows directly; deduplicate there as well and preserve the first-ranked quote.

**Why:** Repeated symbols create duplicate tiles and React key warnings; retaining the first ranked row keeps screener ordering and data selection predictable.

**How to apply:** When changing screener pagination or adding a new quote-list response path, deduplicate by symbol before serialization and keep a client-side guard before heat-map grouping.
