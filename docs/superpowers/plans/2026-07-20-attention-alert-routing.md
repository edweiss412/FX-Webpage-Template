# Attention-Alert Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each per-show admin alert to where its fix lives instead of stacking them at the Overview top, and capture the parse-failure reason that is currently computed and discarded.

**Architecture:** Three independently shippable PRs on one branch, merged in order (each rebased onto main after its predecessor lands). PR1 (sync + messages) persists the parse failure's invariant code into the existing `PARSE_ERROR_LAST_GOOD` alert context and adds a reason helper. PR2 (admin UI) generalizes the attention mount from crew-only to any section, moves the two parse notices into the Parse-warnings panel as banner lines, and cuts `PICKER_EPOCH_RESET`. PR3 (admin UI) anchors the six asset/reel alerts to the Diagrams sub-block and the opening-reel field.

**Tech Stack:** Next.js 16, TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + jsdom, Playwright (standalone harness), Supabase/Postgres RPC (`postgres` client), Tailwind v4.

Canonical spec: `docs/superpowers/specs/2026-07-20-attention-alert-routing.md`. Compiling transport spike: `docs/superpowers/specs/2026-07-20-attention-alert-routing-spike/transport.ts` - PR2's shipped types must match it, pinned by a parity test (Task 2.2b).

## Global Constraints

- **Worktree only** (invariant 11): `/Users/ericweiss/FX-worktrees/attention-alert-routing` on `feat/attention-alert-routing`; main checkout read-only.
- **TDD per task** (invariant 1): failing test (run it, see it red for the RIGHT reason) → minimal impl → green → commit. Never impl before its test. A test green before implementation is NOT a valid red step; where a task pins existing behavior, that is a **characterization test**, committed separately, never counted as the TDD red for new code.
- **Commit per task**, conventional-commits: `feat(scope):`/`test(scope):`/`fix(scope):`/`docs(scope):`. Scopes: `sync`, `messages`, `admin`, `plan`.
- **No raw error codes in user-visible UI** (invariant 5): every user-visible code resolves through `lib/messages/lookup.ts`. The reason helper calls `messageFor`, never `MESSAGE_CATALOG` directly.
- **Em-dash ban** in all user-visible copy: verify the COMPOSED string, not fragments.
- **Advisory lock** (invariant 2): PR1's producer change is inside the existing `withShowLock` transaction (`lib/db/advisoryLock.ts:58`); it adds context keys only. Sole holder is the JS-side wrapper; no new holder. `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- **Supabase call-boundary** (invariant 9): every client call destructures `{ data, error }`.
- **Mutation telemetry** (invariant 10): PR1 touches an existing instrumented producer; no new mutation surface.
- **UI quality gate** (invariant 8): PR2 and PR3 run `/impeccable critique` AND `/impeccable audit` on the diff before close-out. PR1 touches no UI.
- **Persistence privacy:** `phase1.message` is NEVER persisted into the alert context. Only allowlisted invariant codes are stored.
- **Alias, not new catalog rows:** `MI-2_EMPTY_TITLE`/`MI-3_NO_VALID_DATES` map to existing `MI-2_TITLE_MISSING`/`MI-3_NO_PARSEABLE_DATE`. No §12.4 prose edit, no `gen:spec-codes`, no x1 parity impact.
- **Typecheck the whole project, honor the exit code:** every task's verify runs `pnpm typecheck` and asserts it exits 0. NEVER `pnpm typecheck | grep X || echo clean` - that discards the exit status and can print "clean" on an unrelated failure.
- **vitest auto-discovers** `tests/**/*.test.{ts,tsx}` (`vitest.projects.ts:34`); new unit tests need no wiring. **Playwright does NOT:** `tests/e2e/standalone.config.ts:35` `testMatch` is an explicit allow-list; a new standalone spec must be added there or it runs nowhere (its own comment: "runs nowhere and silently proves nothing").

---

## Cross-PR branch mechanics

One branch, three PRs merged in sequence. After each merge:

```bash
git fetch origin
git checkout feat/attention-alert-routing
git rebase origin/main            # replays the next PR's commits onto the merged predecessor
# resolve any conflict, then:
git push --force-with-lease
```

Each PR is a contiguous commit range; open with `gh pr create` after its tasks are green and its close-out gate passes. PR2 opens only after PR1 is merged and the rebase is clean (PR2 imports `AttentionAlertPayload.errorCode` from PR1). PR3 opens only after PR2 is merged. The run is complete when `git rev-list --left-right --count main...origin/main` reports `0  0` after PR3 merges.

---

## File structure

**PR1** - Create `lib/messages/parseFailureReason.ts`, `lib/sync/parseErrorContext.ts`; Modify `lib/sync/runScheduledCronSync.ts:3385`, `lib/admin/attentionItems.ts`, `AGENTS.md`. Tests: `tests/messages/parseFailureReason.test.ts`, `tests/sync/parseErrorContext.test.ts`, `tests/sync/parseErrorReasonPersist.db.test.ts`, `tests/admin/attentionItemsErrorCode.test.ts`, `tests/admin/reasonTransportIntegration.test.ts`.

**PR2** - Modify `lib/admin/attentionItems.ts`; Create `lib/admin/parseAttentionNote.ts`, `lib/admin/sectionAttention.ts`, `tests/adminAlerts/alertProducerScope.registry.ts` + `tests/adminAlerts/_metaAlertProducerScope.test.ts`; Modify `components/admin/review/ShowReviewSurface.tsx`, `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/showpage/PublishedReviewModal.tsx`. Tests: `tests/admin/attentionRoutingFrozen.test.ts`, `tests/admin/parseAttentionNote.test.ts`, `tests/admin/parseNoteCopy.test.ts`, `tests/admin/spikeParity.test.ts`, `tests/admin/pickerEpochCut.test.ts`, `tests/admin/bucketAttention.test.ts`, `tests/components/admin/warningsPanelNotes.test.tsx`, extend `tests/admin/_metaAttentionRoutes.test.ts` + `tests/components/admin/review/showReviewSurfaceAttention.test.tsx`.

**PR3** - Create `lib/admin/attentionAnchorAvailability.ts`, `tests/e2e/_attentionAnchorEntry.tsx`; Modify `lib/admin/attentionItems.ts`, `lib/admin/sectionAttention.ts`, `components/admin/wizard/step3ReviewSections.tsx`, `tests/e2e/standalone.config.ts:35`. Tests: `tests/admin/anchorRouting.test.ts`, `tests/admin/anchorAvailability.test.ts`, `tests/components/admin/anchorMount.test.tsx`, `tests/e2e/attention-anchor-placement.spec.ts`.

---

# PR1 - Capture the failure reason

Ships alone: the reason is persisted and resolvable; no UI renders it until PR2. Merges first because PR2's note renderer reads `AttentionAlertPayload.errorCode`.

### Task 1.1: Reason allowlist + alias + helper

**Files:** Create `lib/messages/parseFailureReason.ts`; Test `tests/messages/parseFailureReason.test.ts`.

**Interfaces - Produces:** `PARSE_FAILURE_ALLOWLIST: ReadonlySet<string>`; `parseFailureReasonTitle(code: string | null | undefined): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/parseFailureReason.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PARSE_FAILURE_ALLOWLIST, parseFailureReasonTitle } from "@/lib/messages/parseFailureReason";

const CASES: Array<[string, string]> = [
  ["MI-1_VERSION_DETECTION_FAILED", "Unrecognized show template"],
  ["MI-2_EMPTY_TITLE", "Show title missing"],
  ["MI-3_NO_VALID_DATES", "No readable show dates"],
  ["MI-4_NO_CREW", "No crew rows"],
  ["MI-5_NO_ROOMS", "No rooms found"],
  ["MI-5a_DUPLICATE_CREW_NAME", "Two crew rows share a name"],
  ["MI-5b_DUPLICATE_CREW_EMAIL", "Two crew rows share an email"],
  ["VERSION_AMBIGUOUS", "Unsure which show template this is"],
];

describe("parseFailureReasonTitle", () => {
  it.each(CASES)("resolves %s to its catalog title", (code, title) =>
    expect(parseFailureReasonTitle(code)).toBe(title));
  it("the allowlist is exactly these 8 codes", () =>
    expect([...PARSE_FAILURE_ALLOWLIST].sort()).toEqual(CASES.map((c) => c[0]).sort()));
  it("returns null for PARSE_HARD_FAIL, non-allowlisted, unknown, null, undefined", () => {
    for (const c of ["PARSE_HARD_FAIL", "SHEET_UNAVAILABLE", "NOT_A_CODE"] as const)
      expect(parseFailureReasonTitle(c)).toBeNull();
    expect(parseFailureReasonTitle(null)).toBeNull();
    expect(parseFailureReasonTitle(undefined)).toBeNull();
  });
  it("no resolved title contains an em dash", () => {
    for (const code of PARSE_FAILURE_ALLOWLIST) expect(parseFailureReasonTitle(code)).not.toMatch(/—/);
  });
  it("resolves via lookup, not MESSAGE_CATALOG directly (invariant 5)", () => {
    const src = readFileSync("lib/messages/parseFailureReason.ts", "utf8");
    expect(src).not.toMatch(/MESSAGE_CATALOG/);
    expect(src).toMatch(/messageFor/);
  });
});
```

- [ ] **Step 2: Run - expect FAIL** `pnpm vitest run tests/messages/parseFailureReason.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// lib/messages/parseFailureReason.ts
import { messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";

/** The 8 invariant codes a parse hard-fail can carry (lib/parser/invariants.ts:114+). */
export const PARSE_FAILURE_ALLOWLIST: ReadonlySet<string> = new Set([
  "MI-1_VERSION_DETECTION_FAILED", "MI-2_EMPTY_TITLE", "MI-3_NO_VALID_DATES", "MI-4_NO_CREW",
  "MI-5_NO_ROOMS", "MI-5a_DUPLICATE_CREW_NAME", "MI-5b_DUPLICATE_CREW_EMAIL", "VERSION_AMBIGUOUS",
]);

// Two producer spellings persist as durable last_error_code values but have no
// catalog row; the same invariant is cataloged under a different name (spec §3.1).
const ALIAS: Record<string, MessageCode> = {
  "MI-2_EMPTY_TITLE": "MI-2_TITLE_MISSING",
  "MI-3_NO_VALID_DATES": "MI-3_NO_PARSEABLE_DATE",
};

export function parseFailureReasonTitle(code: string | null | undefined): string | null {
  if (!code || !PARSE_FAILURE_ALLOWLIST.has(code)) return null;
  const catalogCode = (ALIAS[code] ?? code) as MessageCode;
  const title = messageFor(catalogCode).title;
  return title && title.length > 0 ? title : null;
}
```

- [ ] **Step 4: Run - expect PASS**, then `pnpm typecheck` (exit 0).

- [ ] **Step 5: Commit** `git add lib/messages/parseFailureReason.ts tests/messages/parseFailureReason.test.ts && git commit -m "feat(messages): parse-failure reason helper - allowlist + alias, resolves via lookup"`

### Task 1.2: Producer seam - build the context (unit)

**Files:** Create `lib/sync/parseErrorContext.ts`; Test `tests/sync/parseErrorContext.test.ts`.

**Interfaces - Consumes:** `PARSE_FAILURE_ALLOWLIST`. **Produces:** `buildParseErrorContext(args: { driveFileId: string; sheetName: string; failureCode: string | null | undefined; message?: string | null }): Record<string, unknown>`.

The producer's context construction is extracted into a pure seam so the filter is unit-testable without a DB. The `message` param exists ONLY to prove it is dropped.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/sync/parseErrorContext.test.ts
import { describe, expect, it } from "vitest";
import { buildParseErrorContext } from "@/lib/sync/parseErrorContext";
const base = { driveFileId: "drive-1", sheetName: "II - East Coast" };

describe("buildParseErrorContext", () => {
  it("retains the existing context fields", () => {
    const ctx = buildParseErrorContext({ ...base, failureCode: "MI-4_NO_CREW" });
    expect(ctx.drive_file_id).toBe("drive-1");
    expect(ctx.sheet_name).toBe("II - East Coast");
  });
  it("adds error_code for an allowlisted failure", () =>
    expect(buildParseErrorContext({ ...base, failureCode: "MI-4_NO_CREW" }).error_code).toBe("MI-4_NO_CREW"));
  it("OMITS error_code for PARSE_HARD_FAIL, unknown, null", () => {
    for (const failureCode of ["PARSE_HARD_FAIL", "WHATEVER", null, undefined] as const)
      expect(buildParseErrorContext({ ...base, failureCode }).error_code).toBeUndefined();
  });
  it("NEVER persists anything derived from message (privacy)", () => {
    const SENTINEL = "SECRET-SHEET-CONTENT-9f3a";
    const ctx = buildParseErrorContext({ ...base, failureCode: "MI-4_NO_CREW", message: `title was ${SENTINEL}` });
    expect(JSON.stringify(ctx)).not.toContain(SENTINEL);
    expect("message" in ctx).toBe(false);
  });
  it("adds exactly one key beyond the two existing", () =>
    expect(Object.keys(buildParseErrorContext({ ...base, failureCode: "MI-5_NO_ROOMS" })).sort())
      .toEqual(["drive_file_id", "error_code", "sheet_name"]));
});
```

- [ ] **Step 2: Run - expect FAIL** (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/sync/parseErrorContext.ts
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";

// Builds the PARSE_ERROR_LAST_GOOD alert context. `message` is accepted so the
// caller's variable can be passed and is GUARANTEED never persisted (spec §3.1).
export function buildParseErrorContext(args: {
  driveFileId: string; sheetName: string; failureCode: string | null | undefined; message?: string | null;
}): Record<string, unknown> {
  const errorCode = args.failureCode && PARSE_FAILURE_ALLOWLIST.has(args.failureCode) ? args.failureCode : undefined;
  return { drive_file_id: args.driveFileId, sheet_name: args.sheetName, ...(errorCode ? { error_code: errorCode } : {}) };
}
```

- [ ] **Step 4: Run - expect PASS**; `pnpm typecheck` (exit 0).

- [ ] **Step 5: Commit** `feat(sync): parse-error context builder - allowlist filter, message never persisted`.

### Task 1.3: Wire the seam into the producer (characterization + real-RPC)

**Files:** Modify `lib/sync/runScheduledCronSync.ts:3385-3392`; Test `tests/sync/parseErrorReasonPersist.db.test.ts`.

**Interfaces - Consumes:** `buildParseErrorContext`.

- [ ] **Step 1: Write the failing producer-call assertion (source characterization)**

```ts
// @vitest-environment node - tests/sync/parseErrorReasonPersist.db.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("producer wiring", () => {
  it("builds its PARSE_ERROR_LAST_GOOD context via buildParseErrorContext (not an inline literal)", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    const block = src.slice(src.indexOf('code: "PARSE_ERROR_LAST_GOOD"'));
    expect(block.slice(0, 400)).toMatch(/buildParseErrorContext\(/);
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (producer uses an inline object literal).

- [ ] **Step 3: Implement the wiring** - at `lib/sync/runScheduledCronSync.ts:3385`, the hard-fail branch has the failure code in scope as `phase1.code` (confirm the local binding name at this line - it is the `hard_fail` result's `code`, `= invariant.failedCodes[0] ?? "PARSE_HARD_FAIL"`). Replace the inline context:

```ts
import { buildParseErrorContext } from "@/lib/sync/parseErrorContext";
// ...
await upsertAdminAlert({
  showId: show.showId,
  code: "PARSE_ERROR_LAST_GOOD",
  context: buildParseErrorContext({
    driveFileId,
    sheetName: show.priorParseResult.show.title,
    failureCode: phase1.code,
  }),
});
```

Do NOT pass `phase1.message`.

- [ ] **Step 4: Write the real-RPC replace test**

```ts
// @vitest-environment node - head of the same file
import { afterAll, beforeAll } from "vitest";
import postgres from "postgres";
const DB = process.env.TEST_DATABASE_URL;
const loopback = !!DB && /(@127\.0\.0\.1|@localhost|@postgres)/.test(DB);
const d = loopback ? describe : describe.skip;

d("upsert_admin_alert replaces context whole (latest error_code wins)", () => {
  let sql: ReturnType<typeof postgres>;
  const SHOW = "00000000-0000-4000-8000-0000000000a1";
  beforeAll(async () => { sql = postgres(DB!, { prepare: false });
    await sql`delete from public.admin_alerts where show_id = ${SHOW}::uuid`; });
  afterAll(async () => { await sql`delete from public.admin_alerts where show_id = ${SHOW}::uuid`;
    await sql.end({ timeout: 5 }); });
  const raise = (ctx: Record<string, unknown>) =>
    sql`select public.upsert_admin_alert(${SHOW}::uuid, 'PARSE_ERROR_LAST_GOOD', ${sql.json(ctx)})`;
  const readCtx = async () => {
    const [r] = await sql<{ context: Record<string, unknown> }[]>`
      select context from public.admin_alerts
       where show_id = ${SHOW}::uuid and code = 'PARSE_ERROR_LAST_GOOD' and resolved_at is null`;
    return r?.context ?? null;
  };
  it("A then B: error_code is B (latest)", async () => {
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-4_NO_CREW" });
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-5_NO_ROOMS" });
    expect((await readCtx())?.error_code).toBe("MI-5_NO_ROOMS");
  });
  it("A then omitted: error_code disappears (whole-context replace)", async () => {
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-4_NO_CREW" });
    await raise({ drive_file_id: "f", sheet_name: "S" });
    expect((await readCtx())?.error_code).toBeUndefined();
  });
});
```

`pnpm vitest run tests/sync/parseErrorReasonPersist.db.test.ts` - loopback: DB block PASSES (pins the RPC contract); the source-characterization test PASSES after Step 3. Non-loopback: DB block SKIPS honestly. **CI:** this `.db.test.ts` runs in the DB-bound audit leg (which has a loopback DB), not the unit-suite leg; confirm the existing `*.db.test.ts` glob picks it up before close-out, else add it to the DB-audit workflow path filter in this task.

- [ ] **Step 5: Commit** `feat(sync): persist the allowlisted parse-failure code on PARSE_ERROR_LAST_GOOD`.

### Task 1.4: Carry errorCode onto the attention payload

**Files:** Modify `lib/admin/attentionItems.ts`; Test `tests/admin/attentionItemsErrorCode.test.ts`.

**Interfaces - Produces:** `AttentionAlertPayload.errorCode: string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/admin/attentionItemsErrorCode.test.ts
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";
const base = (over: Partial<AttentionAlertInput>): AttentionAlertInput => ({
  id: "a1", code: "PARSE_ERROR_LAST_GOOD", context: null, raised_at: "2026-07-20T00:00:00Z",
  occurrence_count: 1, identityText: null, messageParams: {}, crewName: null, ...over });
const alertOf = (r: AttentionAlertInput[]) => deriveAttentionItems({ alerts: r, feed: null, slug: "s" })[0]?.alert;
describe("AttentionAlertPayload.errorCode", () => {
  it("carries an allowlisted context.error_code", () =>
    expect(alertOf([base({ context: { error_code: "MI-4_NO_CREW" } })])?.errorCode).toBe("MI-4_NO_CREW"));
  it("is null for a non-allowlisted context value (read-layer defense)", () =>
    expect(alertOf([base({ context: { error_code: "PARSE_HARD_FAIL" } })])?.errorCode).toBeNull());
  it("is null when absent", () =>
    expect(alertOf([base({ context: { drive_file_id: "f" } })])?.errorCode).toBeNull());
});
```

- [ ] **Step 2: Run - expect FAIL** (`errorCode` not on the payload).

- [ ] **Step 3: Implement** - add `errorCode: string | null;` to `AttentionAlertPayload`; import `PARSE_FAILURE_ALLOWLIST`; add near `readFailedKeys`:

```ts
function readErrorCode(context: Record<string, unknown> | null): string | null {
  const v = context?.error_code;
  return typeof v === "string" && PARSE_FAILURE_ALLOWLIST.has(v) ? v : null;
}
```

and in `toAlertItem`'s `alert: { ... }` literal: `errorCode: readErrorCode(row.context),`.

- [ ] **Step 4: Run - expect PASS**; then `pnpm vitest run tests/admin/attentionItems.test.ts tests/admin/attentionItemsErrorCode.test.ts` and `pnpm typecheck` (exit 0 - catches any other `AttentionAlertPayload` literal now missing `errorCode`).

- [ ] **Step 5: Commit** `feat(admin): carry the allowlisted parse-failure code onto the attention payload`.

### Task 1.5: End-to-end reason transport (integration)

**Files:** Test `tests/admin/reasonTransportIntegration.test.ts`.

Proves the field survives persist-shape → derive → compose (spec §3.1). Uses the persisted CONTEXT SHAPE as input.

- [ ] **Step 1: Write the test**

```ts
// @vitest-environment node
// tests/admin/reasonTransportIntegration.test.ts
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";
import { parseFailureReasonTitle } from "@/lib/messages/parseFailureReason";
const persisted = (error_code?: string): AttentionAlertInput => ({
  id: "p1", code: "PARSE_ERROR_LAST_GOOD",
  context: { drive_file_id: "f", sheet_name: "S", ...(error_code ? { error_code } : {}) },
  raised_at: "2026-07-20T00:00:00Z", occurrence_count: 1, identityText: null, messageParams: {}, crewName: null });
describe("reason survives persist-shape -> derive -> resolve", () => {
  it("A allowlisted resolves to its title end to end", () => {
    const a = deriveAttentionItems({ alerts: [persisted("MI-5b_DUPLICATE_CREW_EMAIL")], feed: null, slug: "s" })[0]?.alert;
    expect(parseFailureReasonTitle(a?.errorCode ?? null)).toBe("Two crew rows share an email");
  });
  it("omitted resolves to null (no stale reason)", () => {
    const a = deriveAttentionItems({ alerts: [persisted()], feed: null, slug: "s" })[0]?.alert;
    expect(parseFailureReasonTitle(a?.errorCode ?? null)).toBeNull();
  });
});
```

- [ ] **Step 2-4:** This is a **characterization/integration** test (composes shipped units; passes once 1.1+1.4 are in). Confirm it goes red if `readErrorCode` threading is reverted, then restore. Not a TDD red for new code.

- [ ] **Step 5: Commit** `test(admin): end-to-end parse-reason transport integration`.

### Task 1.6: Fix the stale AGENTS.md parity-gate citation

**Files:** Modify `AGENTS.md`.

- [ ] **Step 1: Verify** `test -f tests/cross-cutting/codes.test.ts && ! test -f tests/messages/codes.test.ts && echo confirmed`.
- [ ] **Step 2: Edit** - replace `tests/messages/codes.test.ts:92` in the §12.4 rule with `tests/cross-cutting/codes.test.ts:92` (verify the line number against the live file).
- [ ] **Step 3: Commit** `docs: correct the x1 parity-gate path (tests/cross-cutting/codes.test.ts)`.

**PR1 close-out:** `pnpm typecheck && pnpm test:fast && pnpm lint`. Open PR, real CI green, whole-diff Codex APPROVE, merge, fast-forward.

---

# PR2 - Generalize the mount, move the parse notices, cut picker

Depends on PR1 merged. Rebase onto main first.

### Task 2.1: Producer-scope registry (AST discovery)

**Files:** Create `tests/adminAlerts/alertProducerScope.registry.ts`, `tests/adminAlerts/_metaAlertProducerScope.test.ts`.

**Interfaces - Produces:** `PRODUCER_SCOPE` rows; `perShowReachableCodes(): Set<string>`.

Discovery uses the TypeScript compiler API, following the precedent `tests/sync/_scopeCheckContract.test.ts` (walks `CallExpression` across `lib/sync`/`lib/drive`/`app/api`). Lexical grep is rejected (R1#3). Named-producer surface = any call whose callee's rightmost identifier is `upsertAdminAlert`, plus SQL `upsert_admin_alert(` invocations. Raw `INSERT INTO admin_alerts` sites (`lib/reports/submit.ts:991`, `diagramGc`/`promoteSnapshot`/`cron:3678` raw emitters) are the spec §3.0 residual-risk class - registered `discoverable: false`; the meta-test enforces registration only for the discoverable surface.

- [ ] **Step 1: Write the failing meta-test**

```ts
// tests/adminAlerts/_metaAlertProducerScope.test.ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PRODUCER_SCOPE, perShowReachableCodes, DEFINITION_SITES, FROZEN_REACHABLE } from "./alertProducerScope.registry";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

const ROOTS = ["lib", "app"];
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) { const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (!p.includes("node_modules")) walk(p, out); }
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p); }
  return out;
}
function discover(): string[] {
  const sites: string[] = [];
  for (const root of ROOTS) for (const file of walk(root)) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const c = n.expression;
        const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined;
        if (name === "upsertAdminAlert") {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          sites.push(`${file}:${line + 1}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return sites;
}

describe("_metaAlertProducerScope", () => {
  it("every AST-discovered call site is registered (or a known definition site)", () => {
    const reg = new Set(PRODUCER_SCOPE.filter((r) => r.discoverable !== false).map((r) => r.site));
    const missing = discover().filter((s) => !reg.has(s) && !DEFINITION_SITES.has(s));
    expect(missing, `unregistered: ${missing.join(", ")}`).toEqual([]);
  });
  it("no registered discoverable site is stale (registered ⊆ discovered)", () => {
    const disc = new Set(discover());
    const stale = PRODUCER_SCOPE.filter((r) => r.discoverable !== false && !disc.has(r.site)).map((r) => r.site);
    expect(stale, "stale rows").toEqual([]);
  });
  it("reachability = per-show AND not-health; frozen set matches", () => {
    const reach = [...perShowReachableCodes()].sort();
    expect(reach).toEqual(FROZEN_REACHABLE);
    for (const g of ["ONBOARDING_SHEET_UNREADABLE", "WATCH_CHANNEL_ORPHANED", "SYNC_STALLED", "LIVE_ROW_CONFLICT"])
      expect(reach).not.toContain(g);
    expect(reach).toContain("DRIVE_FETCH_FAILED");
    for (const h of HEALTH_CODES) expect(reach).not.toContain(h);
  });
});
```

- [ ] **Step 2: Build the registry** - transcribe all 44 classified sites (re-run `discover()` to confirm the AST site list has not drifted). Row shape `{ site, code, scope, discoverable?, dynamic?, note? }`. Globals: `SYNC_STALLED`, `LIVE_ROW_CONFLICT`, `WATCH_CHANNEL_ORPHANED`, `CALLBACK_CLAIM_THREW`, `ONBOARDING_SHEET_UNREADABLE`, `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`, `PICKER_BOOTSTRAP_RPC_FAILED`, `WEBHOOK_TOKEN_INVALID` (×2), `GITHUB_BOT_LOGIN_MISSING`. Per-show: the six asset/reel codes, both parse codes, `DRIVE_FETCH_FAILED`, `SHEET_UNAVAILABLE`, `SHOW_UNPUBLISHED`, `SHOW_FIRST_PUBLISHED`, `RESYNC_SHRINK_HELD`, `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE`, `AMBIGUOUS_EMAIL_BINDING`, `ROLE_FLAGS_NOTICE`, `OAUTH_IDENTITY_CLAIMED`, plus health-audience per-show codes (`ASSET_RECOVERY_REVISION_DRIFT`, `PENDING_SNAPSHOT_*`, `REPORT_*`) registered `discoverable:false` where raw-SQL. Dynamic sites (`applyStaged.ts:1962`, `reports/submit.ts:759`/`lib/reports/submit.ts:669`, `roleFlagsNotice` object-arg) list one row per resolvable literal, `dynamic:true`.

```ts
// tests/adminAlerts/alertProducerScope.registry.ts
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
export const PRODUCER_SCOPE: Array<{
  site: string; code: string; scope: "per-show" | "global"; discoverable?: boolean; dynamic?: boolean; note?: string;
}> = [
  { site: "lib/notify/detect/stall.ts:15", code: "SYNC_STALLED", scope: "global" },
  { site: "lib/sync/runManualSyncForShow.ts:232", code: "DRIVE_FETCH_FAILED", scope: "per-show" },
  // ... ALL 44 rows - complete, no placeholder ...
  { site: "lib/reports/submit.ts:991", code: "REPORT_ORPHANED_LOST_LEASE", scope: "per-show", discoverable: false,
    note: "raw INSERT, not a named-producer callee (spec §3.0 residual risk)" },
];
export function perShowReachableCodes(): Set<string> {
  const health = new Set(HEALTH_CODES); const out = new Set<string>();
  for (const r of PRODUCER_SCOPE) if (r.scope === "per-show" && !health.has(r.code)) out.add(r.code);
  return out;
}
// AST hits that land on `async upsertAdminAlert(` / `function upsertAdminAlert(` definition lines:
export const DEFINITION_SITES = new Set<string>([ /* fill from the discover() run */ ]);
// The sorted output of perShowReachableCodes(), pasted once and reviewed as a diff:
export const FROZEN_REACHABLE: string[] = [ /* fill from one run */ ];
```

- [ ] **Step 3: Run - red first (module missing), then green after Step 2.**

- [ ] **Step 4: Add a fake unregistered `upsertAdminAlert(...)` call in a scratch `lib/` file, run, see the discovery test fail, remove it.** Proves discovery is live.

- [ ] **Step 5: Commit** `test(admin): producer-scope registry + AST discovery meta-test`.

### Task 2.2: The note channel - guard, ordering, total composition

**Files:** Create `lib/admin/parseAttentionNote.ts`; Test `tests/admin/parseAttentionNote.test.ts`.

**Interfaces - Produces:** `NoteCode`, `NoteItem`, `toNoteItem(item: AttentionItem): NoteItem | null`, `orderNotes(notes: NoteItem[]): NoteItem[]`, `composeParseNote(item: NoteItem, warningCount: number): { lead: string; rest: string }`. Ports the spike.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/admin/parseAttentionNote.test.ts
import { describe, expect, it } from "vitest";
import { toNoteItem, orderNotes, composeParseNote } from "@/lib/admin/parseAttentionNote";
import type { AttentionItem } from "@/lib/admin/attentionItems";
const item = (code: string, errorCode: string | null = null): AttentionItem => ({
  id: `alert:${code}`, kind: "alert", tone: "notice", sectionId: "warnings", crewKey: null,
  actionable: false, menuTitle: "x", menuSubtitle: null,
  alert: { alertId: code, code, template: null, params: {}, action: null, helpHref: null,
    raisedAt: "2026-07-20T00:00:00Z", occurrenceCount: 1, autoClearNote: null, failedKeys: null,
    dataGaps: null, errorCode } } as AttentionItem);
describe("toNoteItem guard", () => {
  it("accepts the two note codes", () => {
    expect(toNoteItem(item("PARSE_ERROR_LAST_GOOD"))).not.toBeNull();
    expect(toNoteItem(item("RESYNC_QUALITY_REGRESSED"))).not.toBeNull();
  });
  it("rejects any other code and hold items", () => {
    expect(toNoteItem(item("SHEET_UNAVAILABLE"))).toBeNull();
    expect(toNoteItem({ id: "h", kind: "hold", tone: "critical", sectionId: "changes", crewKey: null,
      actionable: true, menuTitle: "x", menuSubtitle: null } as AttentionItem)).toBeNull();
  });
});
describe("orderNotes", () => {
  it("PARSE first even when reversed", () => {
    const got = orderNotes([toNoteItem(item("RESYNC_QUALITY_REGRESSED"))!, toNoteItem(item("PARSE_ERROR_LAST_GOOD"))!]);
    expect(got.map((n) => n.alert.code)).toEqual(["PARSE_ERROR_LAST_GOOD", "RESYNC_QUALITY_REGRESSED"]);
  });
});
describe("composeParseNote is total", () => {
  it("non-empty lead+rest for both codes", () => {
    for (const c of ["PARSE_ERROR_LAST_GOOD", "RESYNC_QUALITY_REGRESSED"]) {
      const r = composeParseNote(toNoteItem(item(c))!, 1);
      expect(r.lead.length).toBeGreaterThan(0);
      expect(r.rest.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (module missing).

- [ ] **Step 3: Implement** - port `NoteCode`/`NoteItem`/`orderNotes`/the exhaustive-`switch` `composeParseNote` from the spike, renaming `resolveReason` to imported `parseFailureReasonTitle`, and add the guard the spike lacked:

```ts
export function toNoteItem(item: AttentionItem): NoteItem | null {
  const a = item.alert;
  if (!a) return null;
  if (a.code !== "PARSE_ERROR_LAST_GOOD" && a.code !== "RESYNC_QUALITY_REGRESSED") return null;
  return item as NoteItem;
}
```

Keep `default: { const exhaustive: never = alert.code; return exhaustive; }`.

- [ ] **Step 4: Run - PASS**; typecheck exit 0.

- [ ] **Step 5: Commit** `feat(admin): parse-note channel - guard, ordering, total composition`.

### Task 2.2a: The copy oracle (frozen strings)

**Files:** Test `tests/admin/parseNoteCopy.test.ts`. Expected strings are FROZEN literals from spec §3.2, NOT derived from `composeParseNote` (R1#4).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/admin/parseNoteCopy.test.ts
import { describe, expect, it } from "vitest";
import { composeParseNote, toNoteItem, type NoteItem } from "@/lib/admin/parseAttentionNote";
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";
import type { AttentionItem } from "@/lib/admin/attentionItems";
const mk = (code: string, errorCode: string | null): NoteItem =>
  toNoteItem({ id: `alert:${code}`, kind: "alert", tone: "notice", sectionId: "warnings", crewKey: null,
    actionable: false, menuTitle: "x", menuSubtitle: null,
    alert: { alertId: code, code, template: null, params: {}, action: null, helpHref: null,
      raisedAt: "2026-07-20T00:00:00Z", occurrenceCount: 1, autoClearNote: null, failedKeys: null,
      dataGaps: null, errorCode } } as AttentionItem)!;
const EXPECT = {
  s1: { lead: "Crew are still seeing the last good version.", rest: "Your latest changes didn't go through. Two crew rows share an email. Anything listed below is from the version crew can see, not from the change that failed." },
  s2: { lead: "Crew are still seeing the last good version.", rest: "Your latest changes didn't go through. Anything listed below is from the version crew can see, not from the change that failed." },
  s3: { lead: "Crew are still seeing the last good version.", rest: "Your latest changes didn't go through. No crew rows." },
  s4: { lead: "Crew are still seeing the last good version.", rest: "Your latest changes didn't go through." },
  s5: { lead: "This version is live for crew.", rest: "The latest changes lost some detail, and the problems below are what stopped reading." },
  s6: { lead: "This version is live for crew.", rest: "The latest changes lost some detail." },
} as const;
describe("6-state copy matrix (frozen oracle)", () => {
  it("s1", () => expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", "MI-5b_DUPLICATE_CREW_EMAIL"), 3)).toEqual(EXPECT.s1));
  it("s2", () => expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", null), 3)).toEqual(EXPECT.s2));
  it("s3", () => expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", "MI-4_NO_CREW"), 0)).toEqual(EXPECT.s3));
  it("s4", () => expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", null), 0)).toEqual(EXPECT.s4));
  it("s5", () => expect(composeParseNote(mk("RESYNC_QUALITY_REGRESSED", null), 3)).toEqual(EXPECT.s5));
  it("s6", () => expect(composeParseNote(mk("RESYNC_QUALITY_REGRESSED", null), 0)).toEqual(EXPECT.s6));
});
describe("composed-string hygiene across ALL 8 reason titles", () => {
  it.each([...PARSE_FAILURE_ALLOWLIST])("%s: no em dash / doubled period / doubled space", (rc) => {
    const c = composeParseNote(mk("PARSE_ERROR_LAST_GOOD", rc), 2);
    const s = `${c.lead} ${c.rest}`;
    expect(s).not.toMatch(/—/); expect(s).not.toMatch(/\.\./); expect(s).not.toMatch(/  /);
  });
});
```

- [ ] **Step 2-4:** red if composition drifts; green when `composeParseNote` matches §3.2. The all-title hygiene sweep is new coverage and must pass.

- [ ] **Step 5: Commit** `test(admin): frozen copy oracle + all-title hygiene`.

### Task 2.2b: Spike parity + negative-type guard

**Files:** Test `tests/admin/spikeParity.test.ts`. Preserves the spike's four `@ts-expect-error` rejections in the SHIPPED types.

- [ ] **Step 1-3:** Copy the four negative cases from the spike, retargeted at the shipped `AttentionRoute` (Task 2.3) and `NoteItem`/`NoteCode` (Task 2.2): invalid `{sectionId:"crew", anchor:"diagrams"}`, wrong anchor for section, alert-less note item, third note code. The file must `pnpm typecheck` clean WITH all four directives consumed.

- [ ] **Step 4:** `pnpm typecheck` exit 0 (compile-time is the test).

- [ ] **Step 5: Commit** `test(admin): shipped-type parity with the transport spike (negative cases)`.

### Task 2.3: Widen the route union + route parse codes + frozen fixture + cut picker + header-pill guard

**Files:** Modify `lib/admin/attentionItems.ts`; Test `tests/admin/attentionRoutingFrozen.test.ts`, `tests/admin/pickerEpochCut.test.ts`.

**Interfaces - Produces:** `AttentionAnchor = "diagrams" | "opening_reel"`; `AttentionRoute` discriminated union.

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment node
// tests/admin/attentionRoutingFrozen.test.ts
import { describe, expect, it } from "vitest";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
// Frozen from spec §4. At PR2 time the six asset/reel keys read "overview";
// PR3 Task 3.2 flips them to the @anchor form and re-runs.
const FROZEN: Record<string, string> = {
  PARSE_ERROR_LAST_GOOD: "warnings", RESYNC_QUALITY_REGRESSED: "warnings",
  ASSET_RECOVERY_BYTES_EXCEEDED: "overview", EMBEDDED_RECOVERY_REQUIRES_RESTAGE: "overview",
  EMBEDDED_ASSET_DRIFTED: "overview", OPENING_REEL_PERMISSION_DENIED: "overview",
  OPENING_REEL_NOT_VIDEO: "overview", REEL_DRIFTED: "overview",
  SHEET_UNAVAILABLE: "overview", RESYNC_SHRINK_HELD: "overview", SHOW_FIRST_PUBLISHED: "overview",
  SHOW_UNPUBLISHED: "overview", DRIVE_FETCH_FAILED: "overview", PICKER_EPOCH_RESET: "overview",
  AMBIGUOUS_EMAIL_BINDING: "crew", ROLE_FLAGS_NOTICE: "crew",
};
describe("ATTENTION_ROUTES frozen disposition", () => {
  it.each(Object.entries(FROZEN))("%s routes to %s", (code, expected) => {
    const r = ATTENTION_ROUTES[code];
    const got = r && "anchor" in r && r.anchor ? `${r.sectionId}@${r.anchor}` : r?.sectionId;
    expect(got).toBe(expected);
  });
});
```

```ts
// @vitest-environment node
// tests/admin/pickerEpochCut.test.ts
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, ATTENTION_ROUTES, type AttentionAlertInput } from "@/lib/admin/attentionItems";
const row = (code: string): AttentionAlertInput => ({ id: code, code, context: null,
  raised_at: "2026-07-20T00:00:00Z", occurrence_count: 1, identityText: null, messageParams: {}, crewName: null });
describe("PICKER_EPOCH_RESET cut from attention", () => {
  it("route row REMAINS for registry totality", () => expect(ATTENTION_ROUTES.PICKER_EPOCH_RESET).toBeDefined());
  it("produces no attention item", () =>
    expect(deriveAttentionItems({ alerts: [row("PICKER_EPOCH_RESET")], feed: null, slug: "s" })).toHaveLength(0));
  it("a non-cut code still produces one (control)", () =>
    expect(deriveAttentionItems({ alerts: [row("PARSE_ERROR_LAST_GOOD")], feed: null, slug: "s" })).toHaveLength(1));
  it("header-pill count is UNAFFECTED by a picker row (spec §1.1 'unaffected')", () => {
    const withPicker = deriveAttentionItems({ alerts: [row("PARSE_ERROR_LAST_GOOD"), row("PICKER_EPOCH_RESET")], feed: null, slug: "s" });
    const without = deriveAttentionItems({ alerts: [row("PARSE_ERROR_LAST_GOOD")], feed: null, slug: "s" });
    const actionable = (items: ReturnType<typeof deriveAttentionItems>) => items.filter((i) => i.actionable).length;
    expect(actionable(withPicker)).toBe(actionable(without));
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (parse codes still `overview`; picker still produces an item).

- [ ] **Step 3: Implement** the union, the two `warnings` routes, the derivation filter:

```ts
export type AttentionAnchor = "diagrams" | "opening_reel";
export type AttentionRoute =
  | { sectionId: "rooms"; anchor?: "diagrams" }
  | { sectionId: "event"; anchor?: "opening_reel" }
  | { sectionId: Exclude<RoutedSectionId, "rooms" | "event">; anchor?: never };
// ATTENTION_ROUTES: set the two parse codes to { sectionId: "warnings" }; leave the rest.
// deriveAttentionItems: args.alerts.filter((r) => r.code !== "PICKER_EPOCH_RESET") before toAlertItem.
```

- [ ] **Step 4: Run - PASS**; `pnpm vitest run tests/admin/attentionRoutingFrozen.test.ts tests/admin/pickerEpochCut.test.ts tests/admin/_metaAttentionRoutes.test.ts` + typecheck.

- [ ] **Step 5: Commit** `feat(admin): section-scoped route union; parse codes to warnings; cut picker from attention`.

### Task 2.4: Extend `_metaAttentionRoutes` with anchor-validity

**Files:** Modify `tests/admin/_metaAttentionRoutes.test.ts`.

- [ ] **Step 1-2:** Add: for every `ATTENTION_ROUTES` value with an `anchor`, the `(sectionId, anchor)` pair is one of `rooms/diagrams` or `event/opening_reel`. Passes today (no anchors yet); pins the invariant before PR3. **Characterization extension.**
- [ ] **Step 3: Commit** `test(admin): _metaAttentionRoutes anchor-validity guard`.

### Task 2.5: Bucketing boundary - `bucketAttention` + notes-vs-cards

**Files:** Create `lib/admin/sectionAttention.ts`; Test `tests/admin/bucketAttention.test.ts`.

**Interfaces - Produces:** `SectionAttentionBucket`, `SectionAttention`, `bucketAttention(items, { renderCard, sectionAvailable, anchorAvailable })`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/admin/bucketAttention.test.ts
import { describe, expect, it } from "vitest";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import type { AttentionItem } from "@/lib/admin/attentionItems";
const it_ = (code: string, sectionId: string, crewKey: string | null = null): AttentionItem => ({
  id: `alert:${code}`, kind: "alert", tone: "notice", sectionId, crewKey, actionable: false,
  menuTitle: "x", menuSubtitle: null,
  alert: { alertId: code, code, template: null, params: {}, action: null, helpHref: null,
    raisedAt: "2026-07-20T00:00:00Z", occurrenceCount: 1, autoClearNote: null, failedKeys: null,
    dataGaps: null, errorCode: null } } as AttentionItem);
const opts = { renderCard: (i: AttentionItem) => `CARD:${i.alert!.code}`, sectionAvailable: () => true, anchorAvailable: () => true };
describe("bucketAttention", () => {
  it("parse codes go to notes, NOT sectionTop cards", () => {
    const w = bucketAttention([it_("PARSE_ERROR_LAST_GOOD", "warnings")], opts).get("warnings")!;
    expect(w.notes?.map((n) => n.alert.code)).toEqual(["PARSE_ERROR_LAST_GOOD"]);
    expect(w.sectionTop).toEqual([]);
  });
  it("a normal overview code becomes a sectionTop card, not a note", () => {
    const o = bucketAttention([it_("DRIVE_FETCH_FAILED", "overview")], opts).get("overview")!;
    expect(o.notes ?? []).toEqual([]); expect(o.sectionTop).toEqual(["CARD:DRIVE_FETCH_FAILED"]);
  });
  it("crew item with a key goes to byCrewKey", () =>
    expect(bucketAttention([it_("ROLE_FLAGS_NOTICE", "crew", "doug")], opts).get("crew")!.byCrewKey?.get("doug"))
      .toEqual(["CARD:ROLE_FLAGS_NOTICE"]));
  it("section unavailable falls back to overview", () => {
    const m = bucketAttention([it_("EMBEDDED_ASSET_DRIFTED", "rooms")], { ...opts, sectionAvailable: (s: string) => s !== "rooms" });
    expect(m.get("overview")!.sectionTop).toEqual(["CARD:EMBEDDED_ASSET_DRIFTED"]);
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (module missing).

- [ ] **Step 3: Implement** `sectionAttention.ts` - `SectionAttentionBucket`/`SectionAttention` matching the spike, and `bucketAttention`: for each item, `toNoteItem(item)` non-null AND `sectionId==="warnings"` → push to `notes`; else resolve section (available? else `overview`), then anchor (route has anchor AND `anchorAvailable`? → `byAnchor`; crewKey? → `byCrewKey`; else `sectionTop`) and push `renderCard(item)`. No empty buckets.

- [ ] **Step 4: Run - PASS**; typecheck exit 0.

- [ ] **Step 5: Commit** `feat(admin): bucketAttention - notes channel vs pre-rendered cards, section/anchor fallback`.

### Task 2.6: Rename crewAttention → sectionAttention

**Files:** Modify `components/admin/review/ShowReviewSurface.tsx:165`; `components/admin/wizard/step3ReviewSections.tsx:493`; `components/admin/showpage/PublishedReviewModal.tsx:317`. Test: extend `tests/components/admin/review/showReviewSurfaceAttention.test.tsx`.

- [ ] **Step 1: Add the props-present crew-placement assertion (real code)**

```tsx
// append to tests/components/admin/review/showReviewSurfaceAttention.test.tsx
it("crew placement is preserved after the sectionAttention rename (props present)", () => {
  const sectionAttention = new Map([["crew", {
    sectionTop: [], byCrewKey: new Map([["doug", [<div key="b" data-testid="crew-banner-doug">alert</div>]]]),
  }]]);
  const { container } = render(<ShowReviewSurface {...baseSurfaceProps()} sectionAttention={sectionAttention as never} />);
  const li = [...container.querySelectorAll("li")].find((el) => el.textContent?.includes("Doug"));
  const clone = li!.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("li").forEach((n, i) => { if (i > 0) n.remove(); });
  expect(clone.querySelector('[data-testid="crew-banner-doug"]')).not.toBeNull();
});
```

(Adapt `baseSurfaceProps()` to the file's existing fixture builder; the retained byte-identity test stays verbatim above.)

- [ ] **Step 2: Run - expect FAIL** (prop still `crewAttention`).

- [ ] **Step 3: Implement the rename** - `crewAttention: CrewAttention` → `sectionAttention: SectionAttention` in the three components + context type. Crew payload reads `sectionAttention.get("crew")`; non-crew sections read `sectionAttention.get(s.id)?.sectionTop`; `PublishedReviewModal` builds the map via `bucketAttention` (2.5). Update in THIS commit the fixtures/specs that name the prop: `tests/components/admin/review/attentionBanner.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/components/admin/compactAlertCompoundTransitions.test.tsx`, `tests/e2e/published-show-attention.spec.ts`, `tests/e2e/published-review-modal.deeplink.spec.ts`.

- [ ] **Step 4: Run - BOTH byte-identity AND placement PASS**; typecheck; grep guard `! grep -rn "crewAttention" components/ tests/ lib/`.

- [ ] **Step 5: Commit** `refactor(admin): crewAttention -> sectionAttention keyed per section (crew preserved)`.

### Task 2.7: Render the parse notes as banner lines (not cards)

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx` (warnings section, near `components/admin/wizard/step3ReviewSections.tsx:2394`); Test `tests/components/admin/warningsPanelNotes.test.tsx`.

- [ ] **Step 1: Write the failing test (jsdom, real assertions)** - asserts: (a) `parse-attention-notes` container is the first child of the warnings panel body, ABOVE the list/empty-state; (b) a `parse-attention-note-PARSE_ERROR_LAST_GOOD` `<p>` whose textContent equals `${lead} ${rest}` from `composeParseNote`, scoped `within(getByTestId("parse-attention-notes"))` so the warning list cannot satisfy it; (c) `warnings.length===0` → the "below" clause absent; (d) two notes are two `<p>` siblings PARSE-first; (e) the note is NOT a `CompactAlertCard` - `p.querySelector('[data-testid^="compact-alert-card"]')` is null (banner, not card). Copy CONTENT is independently frozen in 2.2a; this is a render-binding test, so deriving the expected string from `composeParseNote` is legitimate here.

- [ ] **Step 2-4:** red → render `<div data-testid="parse-attention-notes">` as first child, mapping `orderNotes(bucket.notes ?? [])` through `composeParseNote(item, warnings.length)` to `<p data-testid={\`parse-attention-note-${code}\`}>` with lead in `<strong>`. Classes `text-xs/relaxed text-text-subtle`; container `border-b border-border pb-2 mb-1`. No card, no stripe, no `role`/`aria-live` (spec §3.2). → green.

- [ ] **Step 5: Commit** `feat(admin): render the parse notices as banner lines atop the warnings panel`.

**PR2 close-out:** `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`. Impeccable dual-gate; P0/P1 fixed or DEFERRED. Real CI green, whole-diff Codex APPROVE, merge, fast-forward.

---

# PR3 - Anchors for the asset/reel codes

Depends on PR2 merged. Rebase onto main first.

### Task 3.1: Anchor availability (per-section map, shared predicates)

**Files:** Create `lib/admin/attentionAnchorAvailability.ts`; Test `tests/admin/anchorAvailability.test.ts`.

**Interfaces - Produces:** `anchorsForData(data: SectionData): Map<"rooms" | "event", Set<AttentionAnchor>>` (per-section, spec §3.2 - NOT a global set). `diagrams` REUSES the exported `hasDiagramSignal` (`components/admin/wizard/step3ReviewSections.tsx:3564`) - the SAME gate the sub-block render (`components/admin/wizard/step3ReviewSections.tsx:3239`) and badge (`components/admin/wizard/step3ReviewSections.tsx:3719`) use, so availability and render cannot disagree. `opening_reel` reads the `opening_reel` group key (`components/admin/wizard/step3ReviewSections.tsx:382`, rendered `components/admin/wizard/step3ReviewSections.tsx:1839`) after `stripOpeningReelText().trim()` non-empty.

- [ ] **Step 1: Write the failing test** - `SectionData` with diagram signal → `rooms` set has `diagrams`; without → absent. Non-empty `opening_reel` → `event` set has `opening_reel`; `null`/`""`/whitespace → absent. Assert return is a `Map` keyed by section; `crew` never appears. A source assertion greps the module: it imports `hasDiagramSignal`, not a hand-rolled diagram check.

- [ ] **Step 2-4:** red → implement importing `hasDiagramSignal` and the reel accessor. Confirm the sub-block render gate (`components/admin/wizard/step3ReviewSections.tsx:3239`) references the SAME exported symbol (a source test asserts both the availability module and the render gate reference `hasDiagramSignal`).

- [ ] **Step 5: Commit** `feat(admin): per-section anchor availability reusing the render gates' predicates`.

### Task 3.2: Route the six codes with anchors + re-freeze the routing fixture

**Files:** Modify `lib/admin/attentionItems.ts` (routes), `lib/admin/sectionAttention.ts` (anchor resolution via `anchorsForData`); Test `tests/admin/anchorRouting.test.ts`; update `tests/admin/attentionRoutingFrozen.test.ts`.

- [ ] **Step 1: Write the failing tests** - the six routes carry the anchor; update the frozen fixture's six values from `"overview"` to `"rooms@diagrams"` / `"event@opening_reel"`; a bucketing test: anchor available → `byAnchor`, unavailable → `sectionTop`, section unavailable → `overview` (through `bucketAttention` with `anchorsForData`-derived `anchorAvailable`).

- [ ] **Step 2-4:** red → set the six routes to `{ sectionId, anchor }`; wire `anchorsForData` into the modal's `bucketAttention` call as `anchorAvailable` → green. Re-run `attentionRoutingFrozen` + `_metaAttentionRoutes` (anchor-validity now exercised).

- [ ] **Step 5: Commit** `feat(admin): anchor the asset/reel alerts to diagrams and opening_reel`.

### Task 3.3: Mount byAnchor at the content

**Files:** Modify `components/admin/wizard/step3ReviewSections.tsx` (Diagrams sub-block `components/admin/wizard/step3ReviewSections.tsx:3239`, opening-reel field `components/admin/wizard/step3ReviewSections.tsx:1839`); Test `tests/components/admin/anchorMount.test.tsx`.

- [ ] **Step 1: Write the failing test (jsdom, DOM ancestry)** - render the rooms section with a `byAnchor` bucket carrying a diagram card (`data-testid="attention-card-EMBEDDED_ASSET_DRIFTED"`); assert `card.closest('[data-testid="published-diagrams-subblock"]')` (verify the sub-block's real testid at implementation) non-null. Same for the reel field. Provide a real `SectionData` fixture with diagram signal + reel value.

- [ ] **Step 2-4:** red → render `bucket.byAnchor?.get("diagrams")` at the Diagrams sub-block and `get("opening_reel")` at the reel field → green.

- [ ] **Step 5: Commit** `feat(admin): render anchored attention cards at their content`.

### Task 3.4: Real-browser placement spec + testMatch wiring

**Files:** Create `tests/e2e/attention-anchor-placement.spec.ts`, `tests/e2e/_attentionAnchorEntry.tsx`; Modify `tests/e2e/standalone.config.ts:35`.

Harness pattern: `tests/e2e/compact-alert-card-layout.spec.ts` (out-of-process esbuild bundle + Tailwind CLI over `app/globals.css` + `node:http`), no app server.

- [ ] **Step 1: Wire testMatch FIRST and prove it is live** - add `attention-anchor-placement` to the `testMatch` regex; run `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts --list | grep attention-anchor-placement` → listed.

- [ ] **Step 2: Write the failing spec** - bundle `_attentionAnchorEntry.tsx` (mounts a fixed-width Rooms sub-block with a diagram-anchored card `data-testid="attention-card-<code>"` and an Event field with a reel-anchored card), serve it, assert by DOM ancestry that each card `closest` its anchor container. The `?` trigger present (geometry-AGNOSTIC - no 22 vs 44, spec §9).

- [ ] **Step 3-4:** build the entry + harness (copy the bundling `beforeAll` from `compact-alert-card-layout.spec.ts`, swapping the `@source` list to include `step3ReviewSections.tsx` + the entry). Run the spec → PASS.

- [ ] **Step 5: Commit** `test(admin): real-browser anchored-placement spec + standalone testMatch wiring`.

**PR3 close-out:** typecheck/test/lint/format, impeccable dual-gate, real CI green, whole-diff Codex APPROVE, merge, fast-forward. Then `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-review checklist (run before dispatching each PR's review)

- [ ] **TDD validity:** every "expect FAIL" fails for the stated reason; characterization tests (1.5, 2.4) labeled as such, not counted as red-for-new-code.
- [ ] **No swallowed exit:** every verify runs `pnpm typecheck` whole, asserts exit 0 - no `| grep || echo clean`.
- [ ] **Producer contract:** seam test (1.2) proves error_code add + existing fields retained + message dropped; source test (1.3) proves the producer calls the seam; real-RPC test (1.3) proves latest-wins; integration (1.5) spans persist-shape → resolve.
- [ ] **Registry:** AST discovery (not grep); `discovered ⊆ registered` AND `registered ⊆ discovered` for the discoverable surface; raw-INSERT sites `discoverable:false`; frozen reachable set asserted whole.
- [ ] **Copy:** frozen oracle independent of `composeParseNote` (2.2a); all 6 full lines; em-dash + doubled-period + doubled-space over all 8 titles; render-binding scoped to the note testid (2.7).
- [ ] **Regression proofs:** frozen full routing fixture (2.3/3.2), `_metaAttentionRoutes` anchor-validity (2.4), spike parity negatives (2.2b), notes-vs-cards (2.5), banner-not-card (2.7), picker cut + route-row-remains + header-pill unaffected (2.3).
- [ ] **Anchor signature:** `anchorsForData` returns a per-section `Map` (3.1); availability reuses `hasDiagramSignal` and the reel accessor.
- [ ] **Transport boundary:** `toNoteItem` (2.2) and `bucketAttention` (2.5) are named units with tests; the production notes-vs-cards branch is proven.
- [ ] **Cross-PR:** rebase commands present; PR opens gated on predecessor merge; `0  0` completion.
- [ ] **Playwright wiring:** 3.4 wires `testMatch` and confirms via `--list` before writing the spec body.
