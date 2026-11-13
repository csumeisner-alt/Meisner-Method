---
name: Paper event history writes
description: Rules for safely persisting Event Arena enrollment and completed summaries.
---

All Event Arena record changes must read the latest saved store, apply a narrow mutation, and write through the shared serialized read-modify-write helper. Do not persist a whole store snapshot captured by either screen.

**Why:** Paper Trading and Event Arena share one AsyncStorage record. A stale enrollment, withdrawal, or baseline snapshot can erase a completion written by the other screen.

**How to apply:** Route every new event-store mutation through the helper, and normalize history to one summary per event in newest-first order when loading or saving.
