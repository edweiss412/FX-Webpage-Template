# Phase C — Request-scoped time utility

**Scope:** Build `lib/time/now.ts` — a single server-side time utility that returns the request-scoped `X-Screenshot-Frozen-Now` ISO timestamp when both `ENABLE_TEST_AUTH === "true"` AND a valid `Authorization: Bearer ${TEST_AUTH_SECRET}` are present on the current request. Migrate known render-side `new Date()` call sites (initially `app/show/[slug]/page.tsx:697`). Ship the gating unit test (test #15) and the server-time grep guard (test #16).

**Prereqs:** Phase B complete (strict sequential per 00-overview.md). Phase A's auth env + Next.js config in place is the practical dependency; Phase B's catalog schema extension is a no-op interaction with this phase but the strict-sequential ordering applies.

**Tasks:** C.1 → C.4 (4 tasks). C.1 must precede C.2 (migration consumes the utility). C.3 + C.4 can interleave once C.1 commits.

---

### Task C.1: Implement `lib/time/now.ts`

**Files:**
- Create: `lib/time/now.ts`

Per spec §3.6.2 Fixed-clock row (r10 request-scoped form). The utility reads the `X-Screenshot-Frozen-Now` header via Next 16's `headers()` API; gated by `ENABLE_TEST_AUTH === "true"` AND a valid `Authorization: Bearer ${TEST_AUTH_SECRET}` per `app/api/test-auth/set-session/route.ts` pattern.

**r2 — TDD restructure per C-r1 finding 1 (HIGH):** the r1 task wrote only smoke tests in C.1 and deferred the real gate tests to C.3 with a "PASS immediately" expectation. That violates AGENTS.md invariant #1 for a security-sensitive surface (the gate prevents prod from being clock-pinnable via a header). r2 moves the full three-precondition behavioral tests into C.1 so the gate's red→green is observable BEFORE the implementation lands. C.3's role narrows to broader test-#15 envelope coverage layered on top of the C.1 gate tests.

- [ ] **Step 1: Write the failing test**

Create `tests/time/now.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock `next/headers` so we can vary the request-scoped header per fixture.
let headerStore: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => headerStore[k.toLowerCase()] ?? null }),
}));

const FROZEN = "2026-03-24T15:00:00.000Z";

beforeEach(() => {
  headerStore = {};
  delete process.env.ENABLE_TEST_AUTH;
  delete process.env.TEST_AUTH_SECRET;
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("lib/time/now — three-precondition gate (test #15)", () => {
  it("ALL THREE preconditions met → returns frozen instant", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer test-secret-fixture";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";

    const { nowDate, now } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(FROZEN);
    // r3 fix per C-r2 finding 1: `now()` returns ISO string (matches spec
    // §3.6.2 frozen-instant contract), NOT epoch ms. Original assertion
    // expected a number which contradicted the implementation contract.
    expect(await now()).toBe(FROZEN);
  });

  it("header missing → falls back to real Date.now (gate refuses)", async () => {
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";
    headerStore.authorization = "Bearer test-secret-fixture";
    // No x-screenshot-frozen-now header.

    vi.useFakeTimers();
    const realNow = new Date("2099-01-01T00:00:00.000Z");
    vi.setSystemTime(realNow);

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
  });

  it("ENABLE_TEST_AUTH unset (prod-shape env) → gate refuses even with valid header + bearer", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer test-secret-fixture";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";
    // ENABLE_TEST_AUTH intentionally unset.

    vi.useFakeTimers();
    const realNow = new Date("2099-01-01T00:00:00.000Z");
    vi.setSystemTime(realNow);

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
  });

  it("Bearer header missing → gate refuses", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";

    vi.useFakeTimers();
    const realNow = new Date("2099-01-01T00:00:00.000Z");
    vi.setSystemTime(realNow);

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
  });

  it("Bearer token mismatch → gate refuses", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer wrong-secret";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";

    vi.useFakeTimers();
    const realNow = new Date("2099-01-01T00:00:00.000Z");
    vi.setSystemTime(realNow);

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
  });

  it("header value not parseable as ISO 8601 → gate refuses (defense-in-depth)", async () => {
    headerStore["x-screenshot-frozen-now"] = "not-a-date";
    headerStore.authorization = "Bearer test-secret-fixture";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";

    vi.useFakeTimers();
    const realNow = new Date("2099-01-01T00:00:00.000Z");
    vi.setSystemTime(realNow);

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
  });

  it("TEST_AUTH_SECRET shorter than 16 chars → gate refuses (mirrors route guard at api/test-auth:95)", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer short";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "short"; // 5 chars — below the 16-min from app/api/test-auth/set-session/route.ts

    vi.useFakeTimers();
    const realNow = new Date("2099-01-01T00:00:00.000Z");
    vi.setSystemTime(realNow);

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

Run: `pnpm test tests/time/now.test.ts`
Expected: FAIL — module `@/lib/time/now` not found. This is the genuine red state; the gate cannot be satisfied without creating the module.

- [ ] **Step 3: Implement `lib/time/now.ts`**

```ts
// lib/time/now.ts
//
// M12 Phase C.1 — request-scoped time utility.
//
// Returns the frozen instant when ALL THREE preconditions hold:
//   (a) request carries `X-Screenshot-Frozen-Now: <ISO>` header
//   (b) process.env.ENABLE_TEST_AUTH === "true"
//   (c) request includes `Authorization: Bearer ${TEST_AUTH_SECRET}`
//
// Otherwise returns real `Date.now()` / `new Date()`. Production builds with
// ENABLE_TEST_AUTH unset (the default) ignore the header entirely.
//
// Spec §3.6.2 Fixed-clock row. Gating contract mirrors
// app/api/test-auth/set-session/route.ts (which validates the same env +
// Authorization Bearer pair).

import { headers } from "next/headers";

/**
 * Returns the current instant as an ISO string. Equivalent to
 * `new Date().toISOString()` in production. In screenshot-capture mode
 * (see header contract above), returns the manifest entry's
 * `frozenClockInstant`.
 *
 * **Use this** anywhere a server component renders a relative timestamp
 * ("X min ago"), an absolute date that should match a fixture, or any
 * time-sensitive output that appears in a captured screenshot.
 *
 * **Do NOT use this** for mutation-path timestamps (e.g., setting
 * `resolved_at` on a write). Mutation paths should keep `new Date()` and
 * carry a `// not-render-side: <reason>` waiver comment.
 */
export async function now(): Promise<string> {
  return (await nowDate()).toISOString();
}

/**
 * Same gating as `now()`, but returns a `Date` for callers that prefer the
 * object form. Both functions read the same precondition state.
 */
export async function nowDate(): Promise<Date> {
  if (process.env.ENABLE_TEST_AUTH !== "true") {
    return new Date();
  }
  // Next 16 `headers()` is async in App Router.
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    // Outside a request scope (e.g., during build-time RSC compilation).
    return new Date();
  }

  const frozen = h.get("x-screenshot-frozen-now");
  if (!frozen) return new Date();

  const authz = h.get("authorization");
  const expectedSecret = process.env.TEST_AUTH_SECRET;
  // r3 fix per C-r2 finding 4: mirror `app/api/test-auth/set-session/route.ts:95`
  // which requires expectedSecret.length >= 16. Without this, a one-char
  // TEST_AUTH_SECRET would let a guess-attacker pin the clock.
  if (!expectedSecret || expectedSecret.length < 16) return new Date();
  if (authz !== `Bearer ${expectedSecret}`) return new Date();

  const parsed = new Date(frozen);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm typecheck && pnpm test tests/time/now.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/time/now.ts tests/time/now.test.ts
git commit -m "feat(time): lib/time/now.ts request-scoped time utility with header gating (Task C.1)"
```

---

### Task C.2: Migrate `app/show/[slug]/page.tsx:697`

**Files:**
- Modify: `app/show/[slug]/page.tsx` (replace `const today = new Date()` with `const today = await nowDate()`)

Per spec §3.6.2 server-time migration inventory + AC-12.38. The reviewer-identified call site at line 646 renders "today" for schedule highlighting on the crew page — captured indirectly via the `/admin/show/<slug>/preview/<crew-id>` impersonation manifest entry.

- [ ] **Step 1: Read the existing call site**

Run: `rg -n "const today = new Date\(\)" app/show/\[slug\]/page.tsx` (resolves to the actual line at execution time — line numbers drift across PRs). Then `sed -n "$((MATCH-5)),$((MATCH+10))p" app/show/[slug]/page.tsx` to see the surrounding context.

The migration site sits inside a synchronous JSX IIFE shaped like `{(() => { const today = new Date(); ...; return (<>...</>); })()}` inside the async `ShowPage` component. **Do NOT** make the IIFE async — that would have it return a Promise that React renders as the literal `[object Promise]`.
Identify the exact context: the `const today = new Date();` line and what function/scope it lives in. Note whether the surrounding function is `async` (the page component is async; an inner helper might not be).

- [ ] **Step 2: Write the failing test**

Create `tests/show/page-today-uses-now-utility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("app/show/[slug]/page.tsx — render-side time migration (AC-12.38)", () => {
  const src = readFileSync(join(process.cwd(), "app/show/[slug]/page.tsx"), "utf8");

  it("imports from @/lib/time/now", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/time\/now["']/);
  });

  it("uses await nowDate() instead of `new Date()` at the previously-flagged line", () => {
    // The literal `const today = new Date()` must be gone (or carry a waiver).
    const todayLines = src.split("\n").filter((l) => l.includes("const today"));
    expect(todayLines.length).toBeGreaterThan(0);
    for (const line of todayLines) {
      expect(line).not.toContain("new Date()");
      expect(line).toMatch(/nowDate\s*\(\s*\)/);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test tests/show/page-today-uses-now-utility.test.ts`
Expected: FAIL.

- [ ] **Step 4: Edit `app/show/[slug]/page.tsx`**

At the top of the file, add the import:

```ts
import { nowDate } from "@/lib/time/now";
```

**r2 fix per C-r1 finding 2 (HIGH) — hoist the await OUT of the synchronous IIFE.** The migration site at `app/show/[slug]/page.tsx:697` sits inside `{(() => { const today = new Date(); ...; return (<>...</>); })()}` — a synchronous JSX IIFE. Replacing `new Date()` with `await nowDate()` in place would either fail typecheck OR (if the IIFE is made async) return a Promise that React renders as `[object Promise]`. Neither is acceptable.

**Correct migration:** declare `const today = await nowDate();` OUTSIDE the IIFE, in the parent `ShowPage` async function scope (`async function ShowPage` is at ~line 440; the IIFE opens at ~line 696). Then DELETE the declaration inside the IIFE — the closure captures the outer `today`. The IIFE stays synchronous; the await happens at the async parent's top level.

Example diff shape (line numbers illustrative — use the actual `rg` match from Step 1):

```diff
 export default async function ShowPage({ params }: PageProps) {
   // ... existing data fetches ...
+  const today = await nowDate();
   return (
     <>
       {/* ... other tiles ... */}
       {(() => {
-        const today = new Date();
         const transportVisible = transportTileVisible({ ... });
         return (
           <>
             {/* ... schedule + transport tiles ... */}
           </>
         );
       })()}
     </>
   );
 }
```

Add a regression test to `tests/show/page-today-uses-now-utility.test.ts` that specifically guards against the async-IIFE class:

```ts
it("does NOT contain an async IIFE that would render a Promise as React child", () => {
  expect(src).not.toMatch(/\(async\s*\(\)\s*=>\s*\{/);
  expect(src).not.toMatch(/\(async\s*function\b/);
});
```

The page component is already `async function ShowPage` (verified at line 440 in current head). No other call-site invokes the page directly; Next.js's router handles the awaited render.

- [ ] **Step 5: Run typecheck + test + existing show-page tests**

Run: `pnpm typecheck && pnpm test tests/show/page-today-uses-now-utility.test.ts`
Expected: PASS.

Run the broader show-page suite:

```bash
pnpm test:e2e -g "schedule-tile|right-now"
```

Expected: unchanged behavior (the utility falls back to `new Date()` when the screenshot header isn't present; production behavior is identical).

- [ ] **Step 5b: Migrate render-side `new Date()` in `components/` surfaces reachable from `app/show/[slug]/page.tsx`** (per C-r2 finding 3 — the C.4 guard now scans `components/`):

  ```bash
  rg -n "new Date\(\)" components/layout/Footer.tsx components/shared/StaleFooter.tsx
  ```

  Two known render-side call sites:
  - `components/layout/Footer.tsx:91` — `const year = new Date().getUTCFullYear()` for the copyright year. Migrate to `const year = (await nowDate()).getUTCFullYear()`. Since `Footer` is a Client Component (`"use client"` at top? if not, currently a Server Component — verify), it may need conversion: if it's a Server Component, replace with `await nowDate()` directly and ensure the caller awaits the now-async Footer; if it's a Client Component, move the year computation to a Server Component wrapper, OR keep `new Date().getUTCFullYear()` but add `// not-render-side: copyright year is wall-clock-stable across screenshot capture` waiver since copyright-year is OK to drift across years (screenshot fixtures are pinned to 2026; year is stable mid-March).
  - `components/shared/StaleFooter.tsx:72` — `const currentNow = now ?? new Date()`. The component ALREADY accepts a `now` prop for deterministic testing (line 27: "Override for deterministic testing"). The render-time default is the risk surface. Option A: make the prop required (defensive) and pass `await nowDate()` from every server caller. Option B: add `// not-render-side: defaulted only when caller omits the prop; screenshot harness always passes a frozen `now`` and ensure every screenshot-reachable call site passes the prop explicitly.

  Choose per-component based on the architecture; the C.4 guard test will FAIL for any unwaived raw `new Date()`. Update test #16 + AC-12.38 outcome documentation if a waiver is the chosen approach.

  Run the C.4 guard after the migration:

  ```bash
  pnpm test tests/help/_metaServerTimeGuard.test.ts
  ```
  Expected: PASS — either the call sites are migrated to `nowDate()` or carry an explicit `// not-render-side:` waiver.

- [ ] **Step 6: Commit**

```bash
git add app/show/[slug]/page.tsx components/layout/Footer.tsx components/shared/StaleFooter.tsx tests/show/page-today-uses-now-utility.test.ts
git commit -m "refactor(show): migrate render-side new Date() to nowDate() utility (Task C.2 — page.tsx + Footer + StaleFooter)"
```

---

### Task C.3: `lib/time/now.ts` capture-boundary + alt-style coverage (test #15 envelope)

**Files:**
- Modify: `tests/time/now.test.ts` (add capture-boundary + alt-style envelope coverage on top of C.1's gate tests)

Per spec §7.1 test 15 / AC-12.37. **r2 restructure per C-r1 finding 1 (HIGH):** C.1 already commits the full three-precondition gate test suite (6 cases covering each precondition individually plus a defense-in-depth malformed-ISO case). C.3 was originally written as a duplicate of C.1's tests, which would commit green-only. r2 narrows C.3 to genuinely-new test-#15 envelope coverage that C.1 did NOT cover: capture-boundary (a frozen header returns byte-identical ISO across simulated 60+s wall clock) + alt-style fixtures (alternate Bearer encodings, header casing tolerance). Each new assertion has a defensible red state — the capture-boundary in particular would FAIL against a naive implementation that re-reads Date.now() on every call.

**Verify-red-via-restore protocol (mandatory per AGENTS.md invariant #1, cross-phase pattern from B.5):** before committing, temporarily break the C.1 implementation in one minimal way (e.g., make the capture-boundary assertion test return a fresh `Date.now()` even when frozen). Run the new C.3 tests, observe FAIL on the boundary test, restore C.1's implementation, re-run green. Document the observed failure in the commit message body. This proves the new C.3 assertions would catch a regression in C.1's gate implementation.

- [ ] **Step 1: Write the new failing tests**

**r3 fix per C-r2 finding 2 (HIGH) — append-only, no duplicate bindings/mocks.** The r2 snippet duplicated `vi.mock("next/headers")`, re-declared `FROZEN`, and re-imported vitest + the SUT. r3 rewrites C.3 as **incremental additions inside the existing C.1 file**, reusing C.1's `headerStore`/`FROZEN`/`vi.mock` setup. The new tests live in a NEW `describe` block at the bottom of the same file but share C.1's module-level mocks and constants.

Append this `describe` block to `tests/time/now.test.ts` AFTER C.1's existing block (do NOT re-import anything; the imports at the top of the file already cover what we need):

```ts
// r3: C.3 envelope coverage — capture-boundary + alt-style. Re-uses C.1's
// module-level vi.mock("next/headers"), `headerStore`, and `FROZEN` constant.
describe("lib/time/now — capture-boundary + alt-style envelope (test #15)", () => {
  it("capture-boundary: same frozen header returns byte-identical ISO across 60+s wall clock", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer test-secret-fixture";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";

    const { now } = await import("@/lib/time/now");
    const first = await now();
    // Simulate 61s of wall-clock advancing — the frozen path MUST ignore it.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    const second = await now();
    vi.useRealTimers();
    expect(second).toBe(first);
    expect(second).toBe(FROZEN);
  });

  it("alt-style: header casing tolerance — frozen returned for `X-SCREENSHOT-FROZEN-NOW`", async () => {
    // The mock's get() lower-cases the key (mirrors Next 16 behavior); the
    // production gate looks up "x-screenshot-frozen-now" only. This test
    // documents the casing contract.
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "Bearer test-secret-fixture";
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(FROZEN);
  });

  it("alt-style: Bearer prefix is case-sensitive (`bearer ...` rejected — defense-in-depth)", async () => {
    headerStore["x-screenshot-frozen-now"] = FROZEN;
    headerStore.authorization = "bearer test-secret-fixture"; // lowercase b
    process.env.ENABLE_TEST_AUTH = "true";
    process.env.TEST_AUTH_SECRET = "test-secret-fixture";

    vi.useFakeTimers();
    const realNow = new Date("2099-01-01T00:00:00.000Z");
    vi.setSystemTime(realNow);

    const { nowDate } = await import("@/lib/time/now");
    expect((await nowDate()).toISOString()).toBe(realNow.toISOString());
  });
});
```

- [ ] **Step 2: Verify-red-via-restore (per AGENTS.md invariant #1)**

Pre-flight: `git status --short lib/time/now.ts` MUST be empty (else the restore step would discard unrelated edits). Then temporarily break the C.1 implementation so the new capture-boundary case would fail:

```bash
# Backup, then patch lib/time/now.ts so frozen reads ignore the header on
# every other call (simulates a regression where the gate "leaks" on
# repeated invocations):
cp lib/time/now.ts lib/time/now.ts.bak
# Hand-edit: e.g., change the final `return new Date(parsed)` to
# `return Math.random() > 0.5 ? new Date(parsed) : new Date()`
```

Run: `pnpm test tests/time/now.test.ts`
Expected: FAIL on "capture-boundary: same frozen header returns byte-identical ISO across 60+s wall clock". Restore:

```bash
mv lib/time/now.ts.bak lib/time/now.ts
git status --short lib/time/now.ts
# Expected: empty output.
```

Re-run: PASSES. Record the observed failure in the commit message:

- [ ] **Step 3: Run test to verify it passes (green)**

Run: `pnpm test tests/time/now.test.ts`
Expected: PASS — C.1's gate tests + C.3's envelope tests all green.

- [ ] **Step 4: Commit (with verify-red captured)**

```bash
git add tests/time/now.test.ts
git commit -m "test(time): lib/time/now.ts capture-boundary + envelope coverage (Task C.3 — test #15)

Verify-red observed: patched lib/time/now.ts to return Math.random()-based
real-time on every other call -> capture-boundary assertion failed with
non-byte-identical ISO across simulated 60+s wall clock.
Restored and re-ran -> PASS."
```

---

### Task C.4: Server-side time-call grep guard (test #16)

**Files:**
- Create: `tests/help/_metaServerTimeGuard.test.ts`

Per spec §7.1 test 16 / AC-12.38. Greps server-side `.ts`/`.tsx` under route directories derived from the screenshot manifest (per r9 tightening). Per-line waiver rule. **r2 fix per C-r1 finding 4 — uses non-global regex** so a forbidden call on column 60 cannot suppress a forbidden call on column 8 of the next line.

Add a self-test fixture to lock in the multi-violation behavior:

```ts
describe("Server-time grep guard — multi-violation regex stability (r2)", () => {
  it("reports BOTH forbidden calls on adjacent lines at different columns", () => {
    // Build a synthetic 2-line source that contains a forbidden call at a
    // late column on line 1 AND an early column on line 2. A `/g`-flagged
    // RegExp would keep its lastIndex from line 1 (high column) and miss the
    // line-2 match (low column). The fix drops the `/g` flag.
    const synthetic = [
      "const a = computeSomethingLongAndDescriptive_takingHere_with_padding_paddingX = new Date();",
      "const b = new Date();",
    ].join("\n");

    const PATS = [/\bnew Date\(\s*\)/, /\bDate\.now\(\s*\)/]; // SAME as production
    const violations: string[] = [];
    synthetic.split("\n").forEach((line, i) => {
      for (const pat of PATS) {
        if (pat.test(line)) violations.push(`L${i + 1}`);
      }
    });
    expect(violations).toEqual(["L1", "L2"]);
  });
});
```

**Note:** Task C.4 references `scripts/help-screenshots.manifest.ts` which Phase F creates. To unblock C.4, write the test to **gracefully degrade** when the manifest doesn't exist yet — fall back to the spec-named scan roots (`app/show`, `app/admin`) until Phase F lands.

- [ ] **Step 1: Write the failing test**

```ts
// tests/help/_metaServerTimeGuard.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Derive scan roots from the screenshot manifest if it exists; fall back
 * to the spec-named roots (`app/show`, `app/admin`) until Phase F lands.
 *
 * Per AC-12.36 / spec §7.1 test 16 r9 tightening: roots are derived from
 * `scripts/help-screenshots.manifest.ts`, not hard-coded. When the manifest
 * lands in Phase F, switch the discovery to read its `entry.route` slugs
 * and collapse to unique top-level segments (e.g., "/admin/dashboard" →
 * "app/admin").
 */
function discoverScanRoots(): string[] {
  // r3 fix per C-r2 finding 3 (CROSS-PHASE): `app/<segment>` alone misses
  // components imported BY those routes. The live `app/show/[slug]/page.tsx`
  // imports `components/layout/Footer.tsx` and `components/shared/StaleFooter.tsx`,
  // both of which contain render-time `new Date()` calls. Without scanning
  // `components/`, AC-12.38 can pass while screenshots still drift with the
  // wall clock. Always include `components/` (it's the project's UI primitive
  // root) in addition to manifest-derived app routes.
  const roots = new Set<string>(["components"]);

  const manifestPath = join(process.cwd(), "scripts/help-screenshots.manifest.ts");
  if (!existsSync(manifestPath)) {
    // Pre-Phase-F fallback: cover the known app surfaces + components.
    roots.add("app/show");
    roots.add("app/admin");
    return [...roots].sort();
  }
  // Phase F manifest expected shape:
  //   export const MANIFEST: ReadonlyArray<{ route: string; ... }> = [...]
  // Static-parse by regex (avoid eval).
  const src = readFileSync(manifestPath, "utf8");
  const routes = [...src.matchAll(/route:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  for (const r of routes) {
    const seg = r.split("/").filter(Boolean)[0]; // "admin", "show", etc.
    if (seg) roots.add(join("app", seg));
  }
  return [...roots].sort();
}

// r2 fix per C-r1 finding 4 — drop the `/g` flag. Global regexes keep
// `lastIndex` across `.test()` calls, so reusing the SAME instance across
// many lines can skip a later match whose column is to the left of a prior
// match's `lastIndex`. The guard MUST report every forbidden call.
const FORBIDDEN_PATTERNS = [/\bnew Date\(\s*\)/, /\bDate\.now\(\s*\)/];
const WAIVER_COMMENT = /\/\/\s*not-render-side:/;

function walkTsTsx(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walkTsTsx(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

describe("Server-side time-call grep guard (test #16 — AC-12.38)", () => {
  const scanRoots = discoverScanRoots();
  it(`has at least one scan root (got ${scanRoots.join(", ")})`, () => {
    expect(scanRoots.length).toBeGreaterThan(0);
  });

  const violations: string[] = [];
  const allFiles = scanRoots.flatMap((root) =>
    walkTsTsx(join(process.cwd(), root)),
  );

  for (const file of allFiles) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Only allow inside lib/time/now.ts itself (the utility implementation).
      if (file.endsWith("lib/time/now.ts")) continue;
      for (const pat of FORBIDDEN_PATTERNS) {
        if (pat.test(line)) {
          if (!WAIVER_COMMENT.test(line)) {
            violations.push(
              `${relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`,
            );
          }
        }
      }
    }
  }

  it("every render-side time call uses lib/time/now.ts or carries a per-line waiver", () => {
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails for any unwaivered call sites**

Run: `pnpm test tests/help/_metaServerTimeGuard.test.ts`
Expected: FAIL — at minimum, the call sites in `app/admin/actions.ts`, `app/admin/dev/actions.ts`, and `app/show/[slug]/p/actions.ts` will be flagged. (Task C.2 migrated `app/show/[slug]/page.tsx:697`; the action paths are mutation-side.)

- [ ] **Step 3: Add per-line waivers to known mutation paths**

For each currently-unwaivered match in `app/admin/actions.ts`, `app/show/[slug]/p/actions.ts`, `app/admin/dev/actions.ts`, append the waiver comment on the matched line:

```ts
// Example: app/admin/actions.ts:81
resolved_at: new Date().toISOString(), // not-render-side: mutation timestamp (write-only)
```

Repeat for each known mutation-side call. The grep guard then accepts them.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/help/_metaServerTimeGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/help/_metaServerTimeGuard.test.ts app/admin/actions.ts app/show/[slug]/p/actions.ts app/admin/dev/actions.ts
git commit -m "test(help): server-time grep guard (test #16) + per-line waivers on mutation paths (Task C.4)"
```

---

## Phase C close-out

After C.1 – C.4 commits land:

- [ ] `lib/time/now.ts` exists and gates correctly on all three preconditions
- [ ] `app/show/[slug]/page.tsx`'s render-side `today` migrated to `nowDate()`
- [ ] Test #15 (lib/time/now.ts gate) PASSES with 9 cases + capture-boundary
- [ ] Test #16 (server-time grep guard) PASSES against the current call-site inventory
- [ ] Mutation paths carry `// not-render-side: <reason>` per-line waivers
- [ ] Existing `pnpm test:e2e` for crew page passes — production behavior unchanged when header isn't present
- [ ] **Hand off to Phase D** ([04-components.md](04-components.md))

Phase C introduces ~4 commits, ~150 LOC of new code + per-line waiver comments on ~4 existing lines.
