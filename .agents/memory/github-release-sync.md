---
name: GitHub release sync
description: Reliable fallback for publishing the validated app tree when the configured GitHub HTTPS remote rejects authentication.
---

If the repository's HTTPS remote rejects authentication, do not request or expose a personal access token. Use the existing authorized GitHub integration to create a tree and commit on `main`, with GitHub's current `main` commit as the parent.

**Why:** The stored Git credential can become invalid even while the Replit GitHub integration remains healthy. The connector proxy also enforces a request-rate limit; parallel blob uploads can trigger HTTP 429 before the branch is updated.

**How to apply:** Compare local and remote blob hashes, upload only changed blobs sequentially at fewer than 10 requests per second with 429 backoff, create the tree and commit, update the branch without force, then verify every tracked path and blob hash.