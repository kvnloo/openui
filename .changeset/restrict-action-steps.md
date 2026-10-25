---
"@openuidev/lang-core": patch
---

Validate restricted action slots against their declared built-in step refs, reporting and pruning disallowed actions instead of passing them to the runtime. Unrestricted `action()` slots keep their existing behavior.
