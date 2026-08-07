# Planted fixture — DUPLICATE_IMPORT

Two fences attributed to the SAME file, both importing the same binding.

First, `lib/example.ts`:

```ts
import { expect } from "vitest";

const first = 1;
```

Then more of `lib/example.ts`:

```ts
import { expect } from "vitest";

const second = 2;
```
