---
name: Artifact workflow listener conflicts
description: How a stale artifact child can keep a port occupied after its managed workflow fails
---

A managed artifact workflow can fail with `EADDRINUSE` while a prior child from the same artifact is still serving health checks on the configured port. The listener may belong to a failed workflow process tree rather than an unrelated service.

**Why:** The API server and alert worker both returned healthy responses while their workflow states were failed; restarting each exact managed workflow replaced the stale children and restored tracked, running services.

**How to apply:** When `EADDRINUSE` occurs, inspect the listener's executable, working directory, and parent chain. If it is a stale child of the same artifact, restart the exact managed workflow instead of changing port configuration or adding another workflow. Verify workflow status and local/proxied health routes afterward.

An Expo restart can encounter a prior Metro process that survived from the same project; accepting Expo's prompt to move to a new port can leave the managed preview attached to the wrong server.

**Why:** The stale Metro listener may still serve successfully while the restarted workflow waits for interactive confirmation on a different port.

**How to apply:** Keep the artifact's injected `$PORT`. Inspect the listener's process group, stop only the stale process group belonging to the same project, then restart the exact managed workflow and verify its configured port is open.
