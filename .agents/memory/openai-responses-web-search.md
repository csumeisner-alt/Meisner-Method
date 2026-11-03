---
name: OpenAI Responses web search through Replit AI Integrations
description: Verified web-search and citation behavior of this workspace's configured OpenAI proxy.
---

The configured Replit AI Integrations OpenAI proxy accepted `responses.create` with the `web_search` tool and `web_search_call.action.sources` included. A live request returned completed search calls with source links.

**Why:** This was verified while adding optional, cited commodity news context; no separate search-provider connection was needed for this capability in this workspace.

**How to apply:** Search only when the user explicitly requests an analysis that needs current news. Keep retrieved sources separate from deterministic scores, and disclose when search is unavailable. Re-test if the proxy or model changes.
