---
name: Heat-map selected quote retention
description: How the open heat-map detail card should behave when refreshed map batches omit its selected symbol.
---

An open heat-map detail card must retain its last displayed quote when a successful, matching map batch does not contain a valid quote for the selected symbol. Show an explicit unavailable message and retry action; when a later matching batch includes a valid quote, update the card and clear the message.

**Why:** A successful map refresh can omit one instrument without invalidating the last quote shown in its open detail card, and the user must not see another tile's data in its place.

**How to apply:** Tie the card to its selected symbol, not the current first/nearest quote. Only treat omission as current when the active map response matches the selected category and period and the request did not fail.
