---
name: Published API freshness
description: Preventing mobile production builds from using an older published API deployment.
---

## Rule
After an API fix, verify the published endpoint—not only the development workflow—before building a mobile release.

**Why:** The mobile production bundle points at the published deployment domain. Development can return the corrected response while the published service still serves an older build.

**How to apply:** Publish the API after server changes, then check a representative public endpoint on the published URL before distributing a new mobile build.

## AI response boundary

AI-generated commentary is optional and untrusted. Parsing or formatting a model response must never be able to turn the deterministic stock analysis into an error response.

**Why:** A published analysis request returned malformed JSON from the model even though the market data, scores, recommendation, and normalized dividend were valid. Treating that parse error as fatal showed users an analysis failure.

**How to apply:** Recover common harmless formatting issues, validate the commentary shape, and use a clear fallback explanation when parsing still fails. Keep the rules-based fields and dividend normalization in the successful response.