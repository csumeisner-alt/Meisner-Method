---
name: OpenAPI codegen validation
description: OpenAPI and Orval constraints discovered while regenerating the shared API clients
---

For API changes, keep every path parameter declared and quote flow-style descriptions that contain commas. Schemas with required fields but no `properties` can generate `zod.looseObject`, which is unavailable in the installed Zod version. After Orval generation, check that the `api-zod` barrel does not re-export the same names from both generated modules; expose generated types under a namespace when needed, then run the library typecheck.

**Why:** Orval otherwise either rejects the OpenAPI document or produces generated code that fails at runtime or during TypeScript validation.

**How to apply:** Update `lib/api-spec/openapi.yaml` first, regenerate the clients, then run `pnpm run typecheck:libs` and the affected package checks before trusting the codegen command's overall status.
