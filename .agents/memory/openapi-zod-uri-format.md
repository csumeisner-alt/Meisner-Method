---
name: OpenAPI URI format and Zod codegen
description: Current compatibility constraint between URI format annotations and generated Zod validators.
---

When adding API fields that contain URLs, avoid OpenAPI `format: uri` unless the generated Zod validator is updated to a supported URL-checking method. The current codegen emits `z.url()`, which the installed Zod version does not provide.

**Why:** API code generation succeeded, but the generated library typecheck then failed because this repository's Zod version lacks the emitted URL helper.

**How to apply:** Keep URL fields typed as strings in the OpenAPI schema and validate URL provenance and protocols in the API code, or deliberately coordinate a compatible Zod/codegen upgrade.
