---
name: OpenAPI path/query parameter names
description: Work around Orval Zod export collisions when one OpenAPI operation has both path and query parameters.
---

When adding a query parameter to an operation that already has path parameters, check the generated `api-zod` barrel for a duplicate operation `Params` name. If Orval emits a colliding path schema and query type, prefer a compatible path parameter or a separate operation instead of patching generated output.

**Why:** In this workspace, Orval gave the path-parameter schema and the generated query-parameter type the same exported name, which made the shared library typecheck fail.

**How to apply:** After changing an OpenAPI operation's parameters, run codegen and the library typecheck before wiring the generated client.
