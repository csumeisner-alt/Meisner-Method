---
name: Published API freshness
description: Preventing mobile production builds from using an older published API deployment.
---

## Rule
After an API fix, verify the published endpoint—not only the development workflow—before building a mobile release.

**Why:** The mobile production bundle points at the published deployment domain. Development can return the corrected response while the published service still serves an older build.

**How to apply:** Publish the API after server changes, then check a representative public endpoint on the published URL before distributing a new mobile build.