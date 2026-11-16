---
name: Mobile UI smoke tests
description: A lightweight regression-test approach for mobile screen flows without a component-rendering test harness.
---

For a focused native-screen flow with no component renderer configured, move important data transformations into React Native-free helpers, test their behavior directly, and add a small source-contract smoke test for the screen's event-handler and prop wiring. For browser-rendered React Native Web fixtures, keep mocked hook callbacks stable when production effects depend on them; recreating a callback on each render can cancel and restart async restore effects.

**Why:** a duplicated test-only simulation can pass while the screen stops calling the real logic, while introducing a full UI test stack for one narrow flow adds dependencies without broad value. An unstable mocked API callback also changes effect behavior and can make rendered fixtures fail for reasons the production hook does not.

**How to apply:** keep the behavioral decisions in imported helpers; have the source smoke check prove the actual screen hands selected values into those helpers and separates lookup actions from trade confirmation. In browser fixtures, define effect dependencies once at mock-module scope and reuse them across renders. For React Native Web scroll navigation, use the DOM target/viewport offset and set the scroll element's `scrollTop`; a native `scrollTo({ y })` ref call may not map to the browser's `top` option.

Standalone esbuild browser fixtures need Expo-style resolution when they import real Expo UI: prefer `.web.*` files, allow JSX in `.js`, and define `global` as `globalThis`.

**Why:** Expo packages can ship JSX in JavaScript, while React Native Web animation cleanup assumes the `global` alias Metro normally supplies. A missing alias can blank a fixture only after an interaction even when the real Expo preview works.

**How to apply:** reproduce Metro's browser resolution in the fixture rather than changing production rendering to accommodate an incomplete test bundler.