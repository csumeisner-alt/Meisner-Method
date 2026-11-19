---
name: OpenAPI path/query parameter names
description: Work around Orval Zod export collisions when one OpenAPI operation has both path and query parameters.
---

When adding a query parameter to an operation that already has path parameters, check the generated `api-zod` barrel for a duplicate operation `Params` name. Prefer a compatible path parameter when the wire contract allows it. If an existing route must keep both, resolve the conflicting export explicitly in the package barrel; do not patch generated files.

**Why:** In this workspace, Orval gave the path-parameter schema and the generated query-parameter type the same exported name, which made the shared library typecheck fail. Some backward-compatible routes require path and query parameters, so changing the contract to satisfy code generation would be incorrect.

**How to apply:** After changing an OpenAPI operation's parameters, run codegen and the library typecheck. For a required path-plus-query route, explicitly choose the intended conflicting export in the package barrel, then verify the generated query schema remains available.
