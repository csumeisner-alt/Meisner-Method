---
name: Achievement design and triggers
description: Product rules for achievement presentation and unlock reliability.
---

Achievements should be one-time cosmetic rewards with brief, dismissible feedback. Do not add token payouts, streak pressure, or blocking celebrations. Award them from the product action itself, independently of Brew token/reward persistence or API success.

**Why:** achievements are meant to feel satisfying without distracting users, and a reward-service failure in preview must not hide an unrelated cosmetic unlock.

**How to apply:** when adding milestones, keep the catalog reviewable in Settings and verify the screen event triggers the achievement even when reward progress or remote services fail.

Title-flag rewards unlock after all 15 achievements: the default U.S. flag plus five premium designs. Pride additionally requires the existing 22-view Biden quote threshold used by the Brew Bank.

**Why:** the user specified separate achievement and quote-view gates for these cosmetic choices.

**How to apply:** read the Brew Bank's persisted quote-view count and shared threshold; do not create a parallel Pride counter or award Pride at the 15-achievement milestone.

When no flag selection is saved, use the default U.S. flag that matches the Patriot Mode unlock. Preserve any valid saved selection.

**Why:** the user clarified that the default title flag should match the flag shown with Patriot Mode.

**How to apply:** resolve missing or invalid stored selections to `DEFAULT_FLAG_ID`, while honoring valid saved choices.

Do not preview or announce title-flag rewards before the achievement set is complete; keep the reveal a surprise.

**Why:** the user asked that the 15-achievement reward remain undisclosed until completion.

**How to apply:** hide the title-flag reward section until all 15 achievements are earned instead of showing a locked teaser.
