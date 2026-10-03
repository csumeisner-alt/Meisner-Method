---
name: Mobile UI smoke tests
description: A lightweight regression-test approach for mobile screen flows without a component-rendering test harness.
---

For a focused native-screen flow with no component renderer configured, move important data transformations into React Native-free helpers, test their behavior directly, and add a small source-contract smoke test for the screen's event-handler and prop wiring.

**Why:** a duplicated test-only simulation can pass while the screen stops calling the real logic, while introducing a full UI test stack for one narrow flow adds dependencies without broad value.

**How to apply:** keep the behavioral decisions in imported helpers; have the source smoke check prove the actual screen hands selected values into those helpers and separates lookup actions from trade confirmation.