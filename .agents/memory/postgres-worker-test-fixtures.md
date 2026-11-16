---
name: PostgreSQL worker test fixtures
description: Keep database-backed worker tests representative of the production schema and data flow.
---

For PostgreSQL-specific worker tests, use an isolated schema but mirror the production constraints, defaults, and partial indexes involved in the behavior. Seed related state consistently across orders, fills, transactions, positions, and participant status so the worker follows its real eligibility transitions.

**Why:** A hand-built schema can pass basic transaction tests while missing a production default or partial-index conflict target; inconsistent fixture rows can exercise a different worker path than the one users rely on.

**How to apply:** Before adding a database-backed worker test, compare its schema and seeded ledger rows with the production schema setup and the worker's status queries.
