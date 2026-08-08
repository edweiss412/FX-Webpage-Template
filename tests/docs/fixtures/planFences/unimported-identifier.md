# Planted fixture — UNIMPORTED_IDENTIFIER

Not a real plan. This tree exists so the gate's ability to FAIL is executable
rather than assumed: a guard whose premise never holds where it runs passes
forever and reads exactly like a guard that found nothing.

Appending to `lib/example.ts`:

```ts
import { readFileSync } from "node:fs";

const raw = readFileSync("x");
expect(raw).toBe("x");
```
