---
name: Python NaN/Infinity produces JSON that Node cannot parse
description: Why a Python script feeding a Node service must sanitize non-finite floats
---

# Python-generated JSON consumed by Node must not contain NaN/Infinity

**Rule:** When a Python script emits JSON that a Node/TypeScript process reads with `JSON.parse`, never let `NaN`, `Infinity`, or `-Infinity` reach the output. Python's `json.dumps` emits bare `NaN` by default (valid for Python's own loader, invalid per the JSON spec), and Node's `JSON.parse` throws on it.

**Why:** A stock script computed `volatility` that could be `NaN` (empty return series), serialized it as `"volatility": NaN`, and the Node route's `JSON.parse` threw — surfacing as an opaque HTTP 422 even though the Python script itself ran fine (~25-30s). Root cause was invisible from the Node side because the script "succeeded."

**How to apply:** Recursively sanitize non-finite floats to `null` (or a safe default) before serializing, and serialize with `json.dumps(data, allow_nan=False)` so any missed case fails loudly at generation time rather than silently downstream. Guard divisions that can produce NaN (empty lists, zero denominators) with a `safe_float` helper. This applies to EVERY `fetch_*.py` in `artifacts/api-server` whose stdout is `JSON.parse`d by a Node route — add a new field or a new fetcher and you must wrap the final print the same way.

**Gotcha:** `float(nan)` returns `nan` without raising, so a `try/except (TypeError, ValueError)` around `float(...)` does NOT catch a NaN input — it silently passes it through. Any normalization helper (e.g. expense-ratio, dividend-yield) must add an explicit `math.isfinite(f)` check, not rely on the except.
