---
name: Patriot Mode premium theme
description: Patriot Mode uses a shared brushed-steel surface and gold hierarchy instead of a flat patriotic palette.
---

Patriot Mode should feel like a premium dark-metal edition: use the shared patriotic palette's steel/gold tokens, keep gold for primary headers and elevated card borders, and reserve red/white/blue motion for brief entry moments such as stock-analysis ticker glow.

**Why:** The original flat navy treatment made the unlock feel like a temporary color swap rather than a premium mode.

**How to apply:** Route Patriot Mode screens through the shared steel background component and use the palette tokens for headers, navigation, cards, and accents; normal mode should remain visually unchanged.

Brand artwork should use a black-and-metallic-gold framed MM mark consistently in native assets and the in-app header; keep the frame inset from all edges so platform icon masks cannot clip it.

**Why:** Launcher icons are rendered small and aggressively masked, while the full wordmark is not readable at that size; a compact monogram preserves the identity and survives mobile safe areas.

**How to apply:** Use a framed MM crop for the launcher icon and favicon, and a vector gold framed monogram for the in-app logo. Keep badges and the full wordmark out of the launcher asset.

The Android launcher must define an explicit black adaptive-icon background and a transparent gold foreground; otherwise Android can place the mark on a default white field and make it appear undersized.

**Why:** The previous raster icon and missing adaptive-icon configuration produced a white launcher surround and made the logo look unrelated to the in-app mark.

**How to apply:** Keep the native launcher artwork and in-app logo generated from the same vector mark, with a black fallback icon and transparent adaptive foreground.

Patriot Mode action emphasis should use brief, low-frequency gold motion rather than continuous animation: a primary button can reveal a muted flag motif for roughly one second after a quiet interval, while preserving a high-contrast label.

**Why:** Continuous or high-contrast patriotic motion competes with the financial workflow and can make a primary action feel promotional instead of premium.

**How to apply:** Keep the effect local and GPU-friendly, avoid network or timer work outside the component, and ensure text remains readable at the animation peak.

Patriot Mode's fact-count unlock milestone is 1,776 taps.

**Why:** The milestone intentionally uses the year associated with American independence as part of the mode's identity.

**How to apply:** Keep the threshold centralized in the fact-count logic and derive progress/celebration copy from that shared constant.