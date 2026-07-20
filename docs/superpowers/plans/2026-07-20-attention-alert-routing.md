# Attention-Alert Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each per-show admin alert to where its fix lives instead of stacking them at the Overview top, and capture the parse-failure reason that is currently computed and discarded.

**Architecture:** Three independently shippable PRs. PR1 (sync + messages) persists the parse failure's invariant code into the existing `PARSE_ERROR_LAST_GOOD` alert context and adds a reason helper. PR2 (admin UI) generalizes the attention mount from crew-only to any section, moves the two parse notices into the Parse-warnings panel as banner lines, and cuts `PICKER_EPOCH_RESET`. PR3 (admin UI) anchors the six asset/reel alerts to the Diagrams sub-block and the opening-reel field.

**Tech Stack:** Next.js 16, TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + jsdom, Playwright (standalone harness), Supabase/Postgres RPC, Tailwind v4.

Canonical spec: `docs/superpowers/specs/2026-07-20-attention-alert-routing.md`. Compiling transport spike: `docs/superpowers/specs/2026-07-20-attention-alert-routing-spike/transport.ts` — PR2's shipped types must match it.

## Global Constraints

- **Worktree only.** All work in `/Users/ericweiss/FX-worktrees/attention-alert-routing` on `feat/attention-alert-routing`; the main checkout is read-only (invariant 11).
- **TDD per task** (invariant 1): failing test → minimal impl → passing test → commit. Never implementation before its test.
- **Commit per task**, conventional-commits: `feat(scope):` / `test(scope):` / `fix(scope):` / `docs(scope):`. Scopes here: `sync`, `messages`, `admin`, `plan`.
- **No raw error codes in user-visible UI** (invariant 5): every user-visible code resolves through `lib/messages/lookup.ts`. The reason helper calls `messageFor`, never reads `MESSAGE_CATALOG` directly.
- **Em-dash ban** in all user-visible copy. Verify composed strings, not just fragments.
- **Advisory lock** (invariant 2): PR1's producer change is inside the existing `withShowLock` transaction (`lib/db/advisoryLock.ts:58`); it adds context keys only, no new lock holder. `tests/auth/advisoryLockRpcDeadlock.test.ts` is not touched.
- **Supabase call-boundary discipline** (invariant 9): every client call destructures `{ data, error }`.
- **Mutation-surface telemetry** (invariant 10): PR1 touches an existing instrumented producer; no new mutation surface is added.
- **UI quality gate** (invariant 8): PR2 and PR3 run `/impeccable critique` AND `/impeccable audit` on the affected diff before close-out; findings + dispositions recorded. PR1 touches no `app/`/`components/` UI, so the gate does not apply to it.
- **Persistence privacy:** `phase1.message` is NEVER persisted into the alert context. Only allowlisted invariant codes are stored.
- **Alias, not new catalog rows:** `MI-2_EMPTY_TITLE`/`MI-3_NO_VALID_DATES` map to the existing `MI-2_TITLE_MISSING`/`MI-3_NO_PARSEABLE_DATE` rows. No §12.4 prose edit, no `gen:spec-codes`, no x1 parity impact.
- **vitest auto-discovers** `tests/**/*.test.{ts,tsx}` (`vitest.projects.ts:34`); new unit tests need no wiring. **Playwright does NOT:** `tests/e2e/standalone.config.ts:35` `testMatch` is an explicit allow-list; a new standalone spec must be added there or it runs nowhere.

---

## File structure

**PR1 — capture the failure reason**
- Modify `lib/sync/runScheduledCronSync.ts:3384` — extend the `PARSE_ERROR_LAST_GOOD` context with `error_code` via the allowlist filter.
- Create `lib/messages/parseFailureReason.ts` — the frozen allowlist, the alias map, and the `parseFailureReasonTitle(code)` helper.
- Modify `lib/admin/attentionItems.ts` — add `errorCode` to `AttentionAlertPayload`; populate it in `toAlertItem` (validated against the same allowlist).
- Modify `AGENTS.md` — one-line correction: the x1 parity gate is at `tests/cross-cutting/codes.test.ts`, not the path AGENTS.md currently cites.
- Tests: `tests/messages/parseFailureReason.test.ts`, `tests/sync/parseErrorReasonPersist.test.ts` (real-RPC), `tests/admin/attentionItemsErrorCode.test.ts`.

**PR2 — generalize the mount, move the parse notices, cut picker**
- Modify `lib/admin/attentionItems.ts` — widen `AttentionRoute` to the section-scoped discriminated union; add `AttentionAnchor`; route the two parse codes to `warnings`; drop `PICKER_EPOCH_RESET` in `deriveAttentionItems`.
- Create `lib/admin/parseAttentionNote.ts` — the `NoteItem` narrowing, `orderNotes`, and `composeParseNote` (mirrors the spike).
- Modify `components/admin/review/ShowReviewSurface.tsx` — `crewAttention` → `sectionAttention`; per-section threading.
- Modify `components/admin/wizard/step3ReviewSections.tsx` — the warnings section renders the notes container; other sections read `sectionAttention[sectionId].sectionTop`.
- Modify `components/admin/showpage/PublishedReviewModal.tsx` — bucketing produces `SectionAttention`.
- Create `tests/adminAlerts/_metaAlertProducerScope.test.ts` — the producer-scope registry.
- Tests: `tests/admin/attentionRouting.test.ts`, `tests/admin/parseAttentionNote.test.ts`, `tests/admin/pickerEpochCut.test.ts`, `tests/admin/reachabilityGuard.test.ts`, extend `tests/admin/_metaAttentionRoutes.test.ts`, extend `tests/components/admin/review/showReviewSurfaceAttention.test.tsx`.

**PR3 — anchors for the asset/reel codes**
- Modify `lib/admin/attentionItems.ts` — route the six asset/reel codes with anchors.
- Create `lib/admin/attentionAnchorAvailability.ts` — `availableAnchors(data)` + shared predicates.
- Modify `components/admin/wizard/step3ReviewSections.tsx` — the Diagrams sub-block and opening-reel field render `byAnchor`.
- Modify `tests/e2e/standalone.config.ts:35` — add the new spec to `testMatch`.
- Tests: `tests/admin/anchorRouting.test.ts`, `tests/admin/anchorAvailability.test.ts`, `tests/e2e/attention-anchor-placement.spec.ts`.

---

# PR1 — Capture the failure reason

Ships on its own: the reason is persisted and resolvable, with no UI change (the field is added to the payload but nothing renders it until PR2). Merges first because PR2's note renderer reads `AttentionAlertPayload.errorCode`.

### Task 1.1: The reason allowlist + alias + helper

**Files:**
- Create: `lib/messages/parseFailureReason.ts`
- Test: `tests/messages/parseFailureReason.test.ts`

**Interfaces:**
- Produces: `PARSE_FAILURE_ALLOWLIST: ReadonlySet<string>` (the 8 codes); `parseFailureReasonTitle(code: string | null | undefined): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/parseFailureReason.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PARSE_FAILURE_ALLOWLIST,
  parseFailureReasonTitle,
} from "@/lib/messages/parseFailureReason";

describe("parseFailureReasonTitle", () => {
  const cases: Array<[string, string]> = [
    ["MI-1_VERSION_DETECTION_FAILED", "Unrecognized show template"],
    ["MI-2_EMPTY_TITLE", "Show title missing"],
    ["MI-3_NO_VALID_DATES", "No readable show dates"],
    ["MI-4_NO_CREW", "No crew rows"],
    ["MI-5_NO_ROOMS", "No rooms found"],
    ["MI-5a_DUPLICATE_CREW_NAME", "Two crew rows share a name"],
    ["MI-5b_DUPLICATE_CREW_EMAIL", "Two crew rows share an email"],
    ["VERSION_AMBIGUOUS", "Unsure which show template this is"],
  ];

  it.each(cases)("resolves %s to its catalog title", (code, title) => {
    expect(parseFailureReasonTitle(code)).toBe(title);
  });

  it("the allowlist is exactly these 8 codes", () => {
    expect([...PARSE_FAILURE_ALLOWLIST].sort()).toEqual(cases.map((c) => c[0]).sort());
  });

  it("returns null for non-allowlisted, unknown, null, and PARSE_HARD_FAIL", () => {
    expect(parseFailureReasonTitle("PARSE_HARD_FAIL")).toBeNull();
    expect(parseFailureReasonTitle("SHEET_UNAVAILABLE")).toBeNull();
    expect(parseFailureReasonTitle("NOT_A_CODE")).toBeNull();
    expect(parseFailureReasonTitle(null)).toBeNull();
    expect(parseFailureReasonTitle(undefined)).toBeNull();
  });

  it("no resolved title contains an em dash (composed-copy guard)", () => {
    for (const code of PARSE_FAILURE_ALLOWLIST) {
      expect(parseFailureReasonTitle(code)).not.toMatch(/—/);
    }
  });

  it("does NOT import MESSAGE_CATALOG directly (invariant 5 — resolves via lookup)", () => {
    const src = readFileSync("lib/messages/parseFailureReason.ts", "utf8");
    expect(src).not.toMatch(/MESSAGE_CATALOG/);
    expect(src).toMatch(/messageFor/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/messages/parseFailureReason.test.ts`
Expected: FAIL — `Cannot find module '@/lib/messages/parseFailureReason'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/messages/parseFailureReason.ts
//
// The parse hard-fail reason, resolved for operator display. `Phase1Result.code`
// is typed `string` and can be a ninth value (`PARSE_HARD_FAIL`), so the
// allowlist is the persistence + display gate: unknown/dynamic values resolve to
// null and render no reason (spec §3.1). Resolution goes through `messageFor`
// (invariant 5), never MESSAGE_CATALOG directly.
import { messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";

/** The 8 invariant codes a parse hard-fail can carry (lib/parser/invariants.ts). */
export const PARSE_FAILURE_ALLOWLIST: ReadonlySet<string> = new Set([
  "MI-1_VERSION_DETECTION_FAILED",
  "MI-2_EMPTY_TITLE",
  "MI-3_NO_VALID_DATES",
  "MI-4_NO_CREW",
  "MI-5_NO_ROOMS",
  "MI-5a_DUPLICATE_CREW_NAME",
  "MI-5b_DUPLICATE_CREW_EMAIL",
  "VERSION_AMBIGUOUS",
]);

// Two producer spellings persist as durable last_error_code values but have no
// catalog row of their own; the same invariant is cataloged under a different
// name. Bridge, do not duplicate (spec §3.1).
const ALIAS: Record<string, MessageCode> = {
  MI-2_EMPTY_TITLE: "MI-2_TITLE_MISSING",
  MI-3_NO_VALID_DATES: "MI-3_NO_PARSEABLE_DATE",
} as unknown as Record<string, MessageCode>;

/** Operator-facing title for an allowlisted parse-failure code, else null. */
export function parseFailureReasonTitle(code: string | null | undefined): string | null {
  if (!code || !PARSE_FAILURE_ALLOWLIST.has(code)) return null;
  const catalogCode = (ALIAS[code] ?? code) as MessageCode;
  const title = messageFor(catalogCode).title;
  return title && title.length > 0 ? title : null;
}
```

Note: object keys with hyphens must be quoted. Write `"MI-2_EMPTY_TITLE": "MI-2_TITLE_MISSING"` etc. (the block above shows the shape; use quoted keys and drop the `as unknown` cast if the map is typed `Record<string, MessageCode>` directly).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/messages/parseFailureReason.test.ts`
Expected: PASS (6 test blocks).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck 2>&1 | grep parseFailureReason || echo clean`
Expected: `clean`.

```bash
git add lib/messages/parseFailureReason.ts tests/messages/parseFailureReason.test.ts
git commit -m "feat(messages): parse-failure reason helper — allowlist + alias, resolves via lookup"
```

### Task 1.2: Persist error_code in the producer (real-RPC test)

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts:3384-3392`
- Test: `tests/sync/parseErrorReasonPersist.test.ts`

**Interfaces:**
- Consumes: `PARSE_FAILURE_ALLOWLIST` (Task 1.1).
- Produces: `PARSE_ERROR_LAST_GOOD` alert context now carries `error_code` when the failure code is allowlisted.

The repeated-raise semantics (spec §3.1) rest on `upsert_admin_alert` replacing the context whole, so this test MUST exercise the real RPC (Codex R8 note), not a mock. It uses `TEST_DATABASE_URL` and skips on a non-loopback/unset DB the same way the repo's other DB-bound sync tests do.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/sync/parseErrorReasonPersist.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const DB = process.env.TEST_DATABASE_URL;
const loopback = !!DB && /(@127\.0\.0\.1|@localhost|@postgres)/.test(DB);
const d = loopback ? describe : describe.skip;

d("PARSE_ERROR_LAST_GOOD error_code persistence (real upsert_admin_alert RPC)", () => {
  let sql: ReturnType<typeof postgres>;
  const SHOW = "00000000-0000-4000-8000-0000000000a1";

  beforeAll(async () => {
    sql = postgres(DB!, { prepare: false });
    await sql`delete from public.admin_alerts where show_id = ${SHOW}::uuid`;
  });
  afterAll(async () => {
    await sql`delete from public.admin_alerts where show_id = ${SHOW}::uuid`;
    await sql.end({ timeout: 5 });
  });

  const raise = (ctx: Record<string, unknown>) =>
    sql`select public.upsert_admin_alert(${SHOW}::uuid, 'PARSE_ERROR_LAST_GOOD', ${sql.json(ctx)})`;

  const readCtx = async () => {
    const [row] = await sql<{ context: Record<string, unknown> }[]>`
      select context from public.admin_alerts
       where show_id = ${SHOW}::uuid and code = 'PARSE_ERROR_LAST_GOOD' and resolved_at is null`;
    return row?.context ?? null;
  };

  it("A then B replaces whole: latest error_code wins", async () => {
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-4_NO_CREW" });
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-5_NO_ROOMS" });
    expect((await readCtx())?.error_code).toBe("MI-5_NO_ROOMS");
  });

  it("allowlisted then omitted: error_code disappears (no stale reason)", async () => {
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-4_NO_CREW" });
    await raise({ drive_file_id: "f", sheet_name: "S" }); // omitted (non-allowlisted upstream)
    expect((await readCtx())?.error_code).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails or skips honestly**

Run: `pnpm vitest run tests/sync/parseErrorReasonPersist.test.ts`
Expected: PASS already? No — the test only exercises the RPC's replace behavior, which already holds, so it will PASS immediately. That is intended: this test pins the RPC contract the producer relies on. The PRODUCER change is proved by Step 3's assertion added to the sync unit test below.

Add the producer-behavior assertion to the existing sync unit path so the code change itself is TDD-driven:

```ts
// append to tests/sync/parseErrorReasonPersist.test.ts, node env, no DB needed
import { pickPersistedErrorCode } from "@/lib/sync/parseErrorContext";

describe("pickPersistedErrorCode (producer filter)", () => {
  it("keeps an allowlisted code", () => {
    expect(pickPersistedErrorCode("MI-4_NO_CREW")).toBe("MI-4_NO_CREW");
  });
  it("drops PARSE_HARD_FAIL and unknowns (no key)", () => {
    expect(pickPersistedErrorCode("PARSE_HARD_FAIL")).toBeUndefined();
    expect(pickPersistedErrorCode("whatever")).toBeUndefined();
  });
});
```

Run: `pnpm vitest run tests/sync/parseErrorReasonPersist.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sync/parseErrorContext'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/sync/parseErrorContext.ts
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";

/** The allowlisted error_code to persist, or undefined to omit the key entirely.
 *  `phase1.message` is never an input here (spec §3.1 privacy posture). */
export function pickPersistedErrorCode(code: string | null | undefined): string | undefined {
  return code && PARSE_FAILURE_ALLOWLIST.has(code) ? code : undefined;
}
```

Then wire it into the producer (`lib/sync/runScheduledCronSync.ts:3388`). The failing branch already has `phase1.code` in scope as `phase1.code` (verify the local binding name at implementation time; §2.3 cites `invariant.failedCodes[0] ?? "PARSE_HARD_FAIL"` reaching the branch as `phase1.code`):

```ts
const errorCode = pickPersistedErrorCode(phase1.code);
await upsertAdminAlert({
  showId: show.showId,
  code: "PARSE_ERROR_LAST_GOOD",
  context: {
    drive_file_id: driveFileId,
    sheet_name: show.priorParseResult.show.title,
    ...(errorCode ? { error_code: errorCode } : {}),
  },
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/sync/parseErrorReasonPersist.test.ts`
Expected: PASS (DB block runs if loopback, else skips; the filter block always runs).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/parseErrorContext.ts lib/sync/runScheduledCronSync.ts tests/sync/parseErrorReasonPersist.test.ts
git commit -m "feat(sync): persist the allowlisted parse-failure code on PARSE_ERROR_LAST_GOOD"
```

### Task 1.3: Carry errorCode onto the attention payload

**Files:**
- Modify: `lib/admin/attentionItems.ts` (`AttentionAlertPayload` type; `toAlertItem` body ~`:232`)
- Test: `tests/admin/attentionItemsErrorCode.test.ts`

**Interfaces:**
- Consumes: `PARSE_FAILURE_ALLOWLIST` (Task 1.1).
- Produces: `AttentionAlertPayload.errorCode: string | null`. PR2's note renderer reads it.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/admin/attentionItemsErrorCode.test.ts
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";

const base = (over: Partial<AttentionAlertInput>): AttentionAlertInput => ({
  id: "a1", code: "PARSE_ERROR_LAST_GOOD", context: null, raised_at: "2026-07-20T00:00:00Z",
  occurrence_count: 1, identityText: null, messageParams: {}, crewName: null, ...over,
});
const alertOf = (rows: AttentionAlertInput[]) =>
  deriveAttentionItems({ alerts: rows, feed: null, slug: "s" })[0]?.alert;

describe("AttentionAlertPayload.errorCode", () => {
  it("carries an allowlisted context.error_code", () => {
    expect(alertOf([base({ context: { error_code: "MI-4_NO_CREW" } })])?.errorCode).toBe("MI-4_NO_CREW");
  });
  it("is null when the context code is not allowlisted", () => {
    expect(alertOf([base({ context: { error_code: "PARSE_HARD_FAIL" } })])?.errorCode).toBeNull();
  });
  it("is null when absent", () => {
    expect(alertOf([base({ context: { drive_file_id: "f" } })])?.errorCode).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/admin/attentionItemsErrorCode.test.ts`
Expected: FAIL — `errorCode` does not exist on the payload.

- [ ] **Step 3: Write minimal implementation**

Add the field to the type and populate it (validated against the allowlist so an out-of-allowlist context value cannot leak through the read layer):

```ts
// in the AttentionAlertPayload type
  errorCode: string | null;

// import at top
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";

// helper near readFailedKeys
function readErrorCode(context: Record<string, unknown> | null): string | null {
  const v = context?.error_code;
  return typeof v === "string" && PARSE_FAILURE_ALLOWLIST.has(v) ? v : null;
}

// in toAlertItem's alert: { ... } literal
    errorCode: readErrorCode(row.context),
```

- [ ] **Step 4: Run test + full attentionItems suite (no regression)**

Run: `pnpm vitest run tests/admin/attentionItemsErrorCode.test.ts tests/admin/attentionItems.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/attentionItems.ts tests/admin/attentionItemsErrorCode.test.ts
git commit -m "feat(admin): carry the allowlisted parse-failure code onto the attention payload"
```

### Task 1.4: Fix the stale AGENTS.md parity-gate citation

**Files:**
- Modify: `AGENTS.md` (the "§12.4 catalog row edits" rule — the `tests/messages/codes.test.ts:92` citation)

**Interfaces:** none (docs).

- [ ] **Step 1: Verify the real path**

Run: `test -f tests/cross-cutting/codes.test.ts && ! test -f tests/messages/codes.test.ts && echo confirmed`
Expected: `confirmed`.

- [ ] **Step 2: Edit the citation**

Replace `tests/messages/codes.test.ts:92` with `tests/cross-cutting/codes.test.ts` in the AGENTS.md §12.4 rule (both the inline mention and any nearby repeat).

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: correct the x1 parity-gate path (tests/cross-cutting/codes.test.ts)"
```

**PR1 close-out:** `pnpm typecheck && pnpm test:fast && pnpm lint`. Open PR, get real CI green, whole-diff Codex review to APPROVE, merge, fast-forward main.

---

# PR2 — Generalize the mount, move the parse notices, cut picker

Depends on PR1 merged (reads `AttentionAlertPayload.errorCode`). Rebases onto main after PR1 lands.

### Task 2.1: Producer-scope registry meta-test

**Files:**
- Create: `tests/adminAlerts/_metaAlertProducerScope.test.ts`
- Create: `tests/adminAlerts/alertProducerScope.registry.ts` (the registry data)

**Interfaces:**
- Produces: `PRODUCER_SCOPE: Array<{ site: string; code: string; scope: "per-show" | "global" }>` and `perShowReachableCodes(): Set<string>`.

- [ ] **Step 1: Enumerate the live call sites**

Run and record the output verbatim in the registry file's header comment:
```bash
grep -rn "upsertAdminAlert(" --include="*.ts" lib/ app/ | grep -v "\.test\." 
grep -rn "upsert_admin_alert(" supabase/migrations/*.sql
```

- [ ] **Step 2: Write the failing meta-test**

```ts
// tests/adminAlerts/_metaAlertProducerScope.test.ts
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { PRODUCER_SCOPE, perShowReachableCodes } from "./alertProducerScope.registry";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

// Every `upsertAdminAlert(` callee (any receiver) + `upsert_admin_alert(` in SQL.
// A NEW site through the named producer surface must be registered or this fails.
function discoverSites(): string[] {
  const out = execSync(
    `grep -rn "upsertAdminAlert(" --include="*.ts" lib app | grep -v '\\.test\\.' ; ` +
      `grep -rn "upsert_admin_alert(" supabase/migrations/*.sql || true`,
    { encoding: "utf8", shell: "/bin/bash" },
  );
  return out.split("\n").map((l) => l.split(":").slice(0, 2).join(":")).filter(Boolean);
}

describe("_metaAlertProducerScope", () => {
  it("every discovered alert-write site is registered", () => {
    const registered = new Set(PRODUCER_SCOPE.map((r) => r.site));
    const missing = discoverSites().filter((s) => !registered.has(s));
    expect(missing, `unregistered alert-write sites: ${missing.join(", ")}`).toEqual([]);
  });

  it("reachability = per-show scope AND not health (spec §7)", () => {
    const reach = perShowReachableCodes();
    // the four global codes must NOT be reachable
    for (const c of ["ONBOARDING_SHEET_UNREADABLE", "WATCH_CHANNEL_ORPHANED", "SYNC_STALLED", "LIVE_ROW_CONFLICT"]) {
      expect(reach.has(c), `${c} must be unreachable`).toBe(false);
    }
    // DRIVE_FETCH_FAILED IS per-show and not health
    expect(reach.has("DRIVE_FETCH_FAILED")).toBe(true);
    // no health code is reachable
    for (const h of HEALTH_CODES) expect(reach.has(h)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run tests/adminAlerts/_metaAlertProducerScope.test.ts`
Expected: FAIL — registry module missing.

- [ ] **Step 4: Write the registry (from Step 1's real output)**

```ts
// tests/adminAlerts/alertProducerScope.registry.ts
// Discovered by: grep upsertAdminAlert( / upsert_admin_alert( — see plan Task 2.1.
// One row per (site, code). A dynamic-code site lists each branch as its own row.
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

export const PRODUCER_SCOPE: Array<{ site: string; code: string; scope: "per-show" | "global" }> = [
  // ... transcribe every discovered site here, one row per emitted code ...
  // Example rows (fill from real grep output):
  { site: "app/api/admin/onboarding/scan/route.ts:306", code: "ONBOARDING_SHEET_UNREADABLE", scope: "global" },
  { site: "lib/sync/runManualSyncForShow.ts:232", code: "DRIVE_FETCH_FAILED", scope: "per-show" },
  // ...
];

export function perShowReachableCodes(): Set<string> {
  const health = new Set(HEALTH_CODES);
  const out = new Set<string>();
  for (const r of PRODUCER_SCOPE) {
    if (r.scope === "per-show" && !health.has(r.code)) out.add(r.code);
  }
  return out;
}
```

- [ ] **Step 5: Run to pass, commit**

Run: `pnpm vitest run tests/adminAlerts/_metaAlertProducerScope.test.ts`
Expected: PASS.

```bash
git add tests/adminAlerts/_metaAlertProducerScope.test.ts tests/adminAlerts/alertProducerScope.registry.ts
git commit -m "test(admin): producer-scope registry meta-test (named-producer surface)"
```

### Task 2.2: The note channel — narrowing, ordering, composition

**Files:**
- Create: `lib/admin/parseAttentionNote.ts`
- Test: `tests/admin/parseAttentionNote.test.ts`

**Interfaces:**
- Consumes: `AttentionItem`, `AttentionAlertPayload` (with `errorCode` from PR1), `parseFailureReasonTitle`.
- Produces: `NoteCode`, `NoteItem`, `orderNotes(notes)`, `composeParseNote(item, warningCount)`. Mirrors the spike at `docs/superpowers/specs/2026-07-20-attention-alert-routing-spike/transport.ts`.

- [ ] **Step 1: Write the failing test (the 6-state matrix + ordering)**

```ts
// @vitest-environment node
// tests/admin/parseAttentionNote.test.ts
import { describe, expect, it } from "vitest";
import { composeParseNote, orderNotes, type NoteItem } from "@/lib/admin/parseAttentionNote";

const note = (code: NoteItem["alert"]["code"], errorCode: string | null = null): NoteItem => ({
  id: `alert:${code}`, kind: "alert", tone: "notice",
  alert: {
    alertId: code, code, template: null, params: {}, action: null, helpHref: null,
    raisedAt: "2026-07-20T00:00:00Z", occurrenceCount: 1, autoClearNote: null,
    failedKeys: null, dataGaps: null, errorCode,
  },
} as NoteItem);

describe("composeParseNote — 6-state matrix", () => {
  it("state 1: PARSE, list, reason", () => {
    const r = composeParseNote(note("PARSE_ERROR_LAST_GOOD", "MI-5b_DUPLICATE_CREW_EMAIL"), 3);
    expect(r.lead).toBe("Crew are still seeing the last good version.");
    expect(r.rest).toBe(
      "Your latest changes didn't go through. Two crew rows share an email. Anything listed below is from the version crew can see, not from the change that failed.",
    );
  });
  it("state 2: PARSE, list, no reason", () => {
    const r = composeParseNote(note("PARSE_ERROR_LAST_GOOD", null), 3);
    expect(r.rest).toBe(
      "Your latest changes didn't go through. Anything listed below is from the version crew can see, not from the change that failed.",
    );
  });
  it("state 3: PARSE, empty, reason", () => {
    const r = composeParseNote(note("PARSE_ERROR_LAST_GOOD", "MI-4_NO_CREW"), 0);
    expect(r.rest).toBe("Your latest changes didn't go through. No crew rows.");
  });
  it("state 4: PARSE, empty, no reason", () => {
    const r = composeParseNote(note("PARSE_ERROR_LAST_GOOD", null), 0);
    expect(r.rest).toBe("Your latest changes didn't go through.");
  });
  it("state 5: RESYNC, list", () => {
    const r = composeParseNote(note("RESYNC_QUALITY_REGRESSED"), 3);
    expect(r.lead).toBe("This version is live for crew.");
    expect(r.rest).toBe("The latest changes lost some detail, and the problems below are what stopped reading.");
  });
  it("state 6: RESYNC, empty", () => {
    const r = composeParseNote(note("RESYNC_QUALITY_REGRESSED"), 0);
    expect(r.rest).toBe("The latest changes lost some detail.");
  });
  it("no composed string contains an em dash", () => {
    for (const n of [note("PARSE_ERROR_LAST_GOOD", "MI-1_VERSION_DETECTION_FAILED"), note("RESYNC_QUALITY_REGRESSED")]) {
      const r = composeParseNote(n, 2);
      expect(`${r.lead} ${r.rest}`).not.toMatch(/—/);
    }
  });
});

describe("orderNotes — explicit precedence, not derivation order", () => {
  it("puts PARSE first even when input is reversed", () => {
    const ordered = orderNotes([note("RESYNC_QUALITY_REGRESSED"), note("PARSE_ERROR_LAST_GOOD")]);
    expect(ordered.map((n) => n.alert.code)).toEqual(["PARSE_ERROR_LAST_GOOD", "RESYNC_QUALITY_REGRESSED"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/admin/parseAttentionNote.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement (port the spike's proven shapes into `lib/`)**

Copy the `NoteCode`, `NoteItem`, `orderNotes`, and the exhaustive `switch` composition from the spike file into `lib/admin/parseAttentionNote.ts`, renaming `composeNote` → `composeParseNote` and making `resolveReason` the imported `parseFailureReasonTitle`. Keep the `default: { const exhaustive: never = alert.code; return exhaustive; }` arm — it is what makes a third note code a compile error.

- [ ] **Step 4: Run to pass; typecheck**

Run: `pnpm vitest run tests/admin/parseAttentionNote.test.ts && pnpm typecheck 2>&1 | grep parseAttentionNote || echo clean`
Expected: PASS then `clean`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/parseAttentionNote.ts tests/admin/parseAttentionNote.test.ts
git commit -m "feat(admin): parse-note channel — narrowed NoteItem, explicit ordering, 6-state copy"
```

### Task 2.3: Widen the route union + route the two parse codes + cut picker

**Files:**
- Modify: `lib/admin/attentionItems.ts` (`AttentionRoute`, `ATTENTION_ROUTES`, `deriveAttentionItems`)
- Test: `tests/admin/attentionRouting.test.ts`, `tests/admin/pickerEpochCut.test.ts`

**Interfaces:**
- Produces: `AttentionRoute` widened to the section-scoped discriminated union with optional `anchor`; `AttentionAnchor = "diagrams" | "opening_reel"`.

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment node
// tests/admin/attentionRouting.test.ts
import { describe, expect, it } from "vitest";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";

describe("ATTENTION_ROUTES — parse codes move to warnings", () => {
  it("PARSE_ERROR_LAST_GOOD routes to warnings", () => {
    expect(ATTENTION_ROUTES.PARSE_ERROR_LAST_GOOD?.sectionId).toBe("warnings");
  });
  it("RESYNC_QUALITY_REGRESSED routes to warnings", () => {
    expect(ATTENTION_ROUTES.RESYNC_QUALITY_REGRESSED?.sectionId).toBe("warnings");
  });
});
```

```ts
// @vitest-environment node
// tests/admin/pickerEpochCut.test.ts
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";

const row = (code: string): AttentionAlertInput => ({
  id: "p", code, context: null, raised_at: "2026-07-20T00:00:00Z",
  occurrence_count: 1, identityText: null, messageParams: {}, crewName: null,
});

describe("PICKER_EPOCH_RESET is cut from attention", () => {
  it("produces no attention item", () => {
    const items = deriveAttentionItems({ alerts: [row("PICKER_EPOCH_RESET")], feed: null, slug: "s" });
    expect(items).toHaveLength(0);
  });
  it("a non-cut code still produces one (control)", () => {
    const items = deriveAttentionItems({ alerts: [row("PARSE_ERROR_LAST_GOOD")], feed: null, slug: "s" });
    expect(items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/admin/attentionRouting.test.ts tests/admin/pickerEpochCut.test.ts`
Expected: FAIL — routes still `overview`; picker still produces an item.

- [ ] **Step 3: Implement**

Widen the type and route the codes:

```ts
export type AttentionAnchor = "diagrams" | "opening_reel";
export type AttentionRoute =
  | { sectionId: "rooms"; anchor?: "diagrams" }
  | { sectionId: "event"; anchor?: "opening_reel" }
  | { sectionId: Exclude<RoutedSectionId, "rooms" | "event">; anchor?: never };
```

In `ATTENTION_ROUTES`, set `PARSE_ERROR_LAST_GOOD` and `RESYNC_QUALITY_REGRESSED` to `{ sectionId: "warnings" }` (keep every other existing row; the table stays set-equal to the registry). In `deriveAttentionItems`, filter `PICKER_EPOCH_RESET` out of the alert rows before `toAlertItem` (its `ATTENTION_ROUTES` row remains for totality):

```ts
const alertItems = args.alerts
  .filter((row) => row.code !== "PICKER_EPOCH_RESET")
  .map((row) => toAlertItem(row, args.slug));
```

- [ ] **Step 4: Run to pass + full attention suite + the routes meta-test**

Run: `pnpm vitest run tests/admin/attentionRouting.test.ts tests/admin/pickerEpochCut.test.ts tests/admin/_metaAttentionRoutes.test.ts tests/admin/attentionItems.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/attentionItems.ts tests/admin/attentionRouting.test.ts tests/admin/pickerEpochCut.test.ts
git commit -m "feat(admin): section-scoped route union; parse codes to warnings; cut picker from attention"
```

### Task 2.4: Reachability guard test

**Files:**
- Create: `tests/admin/reachabilityGuard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
// tests/admin/reachabilityGuard.test.ts
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";

const GLOBAL = ["ONBOARDING_SHEET_UNREADABLE", "WATCH_CHANNEL_ORPHANED", "SYNC_STALLED", "LIVE_ROW_CONFLICT"];
const row = (code: string): AttentionAlertInput => ({
  id: code, code, context: null, raised_at: "2026-07-20T00:00:00Z",
  occurrence_count: 1, identityText: null, messageParams: {}, crewName: null,
});

describe("global codes are guarded as a class", () => {
  // These never reach fetchPerShowAlerts (showId null). This test documents the
  // contract at the derivation boundary: if one ever appears in a per-show fetch,
  // it must not silently render. Pairs with _metaAlertProducerScope reachability.
  it.each(GLOBAL)("%s produces no crew/anchor-critical placement surprise", (code) => {
    const items = deriveAttentionItems({ alerts: [row(code)], feed: null, slug: "s" });
    // If present at all they fall back to overview, never crew/rooms/event.
    for (const it of items) expect(["overview"]).toContain(it.sectionId);
  });
});
```

- [ ] **Step 2-4: Run (should pass — documents current behavior), then commit**

Run: `pnpm vitest run tests/admin/reachabilityGuard.test.ts`
Expected: PASS.

```bash
git add tests/admin/reachabilityGuard.test.ts
git commit -m "test(admin): guard that global codes never take a per-show placement"
```

### Task 2.5: Rename crewAttention → sectionAttention (transport)

**Files:**
- Modify: `components/admin/review/ShowReviewSurface.tsx:165,184,919`
- Modify: `components/admin/wizard/step3ReviewSections.tsx:493,1274,1314,1330`
- Modify: `components/admin/showpage/PublishedReviewModal.tsx:317`
- Test: extend `tests/components/admin/review/showReviewSurfaceAttention.test.tsx`

**Interfaces:**
- Produces: `SectionAttention = Map<RoutedSectionId, SectionAttentionBucket>` with `{ sectionTop, byCrewKey?, byAnchor?, notes? }` per the spike.

- [ ] **Step 1: Add the props-absent byte-identity assertion is retained; add a props-present crew-placement assertion**

The existing test already asserts byte-identical DOM when attention props are absent — keep it verbatim. Add:

```ts
it("crew placement is preserved after the sectionAttention rename (props present)", () => {
  // render with a crew-routed attention item; assert the banner is a descendant
  // of the member <li> exactly as before (clone away sibling rows first).
  // ... uses the same CrewAttention fixture shape, now nested under
  // sectionAttention.get("crew").
});
```

- [ ] **Step 2: Run to verify the new assertion fails**

Run: `pnpm vitest run tests/components/admin/review/showReviewSurfaceAttention.test.tsx`
Expected: FAIL on the new case (prop still named `crewAttention`).

- [ ] **Step 3: Implement the rename**

Rename `crewAttention` → `sectionAttention` across the three components and the context type; the crew payload moves under `sectionAttention.get("crew")`. Non-crew sections read `sectionAttention.get(s.id)?.sectionTop`. Bucketing in `PublishedReviewModal` builds the `Map` per the spike's `SectionAttentionBucket`.

- [ ] **Step 4: Run to pass; the byte-identity case must STILL pass**

Run: `pnpm vitest run tests/components/admin/review/showReviewSurfaceAttention.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx`
Expected: PASS (both the retained byte-identity case and the new placement case).

- [ ] **Step 5: Commit**

```bash
git add components/admin/review/ShowReviewSurface.tsx components/admin/wizard/step3ReviewSections.tsx components/admin/showpage/PublishedReviewModal.tsx tests/components/admin/review/showReviewSurfaceAttention.test.tsx
git commit -m "refactor(admin): crewAttention -> sectionAttention, keyed per section (crew preserved)"
```

### Task 2.6: Render the parse notes in the warnings panel

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (warnings section render, near `:2394`)
- Test: `tests/components/admin/warningsPanelNotes.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/components/admin/warningsPanelNotes.test.tsx
// Renders the warnings section with a sectionAttention notes payload; asserts the
// note <p> appears ABOVE the list/empty-state, scoped to its own testid so the
// list cannot satisfy it. Derives expected text from composeParseNote, not literals.
```

Assert: container testid `parse-attention-notes` is the first child of the panel body; a `parse-attention-note-PARSE_ERROR_LAST_GOOD` `<p>` whose `textContent` equals `composeParseNote(...)` lead+rest; with `warnings.length === 0` the "below" clause is absent (state 3/4); two simultaneous notes are two `<p>` siblings in PARSE-first order.

- [ ] **Step 2-4: fail → implement the notes block → pass**

Render `<div data-testid="parse-attention-notes">` as the first child of the warnings panel body, mapping `orderNotes(bucket.notes ?? [])` through `composeParseNote(item, warnings.length)` to a `<p data-testid={`parse-attention-note-${code}`}>` with the lead in `<strong>`. Classes: `text-xs/relaxed text-text-subtle`, container `border-b border-border pb-2 mb-1`. No card, no stripe, no `role`/`aria-live` (spec §3.2).

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/warningsPanelNotes.test.tsx
git commit -m "feat(admin): render the parse notices as banner lines atop the warnings panel"
```

**PR2 close-out:** `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`. Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff; P0/P1 fixed or DEFERRED. Real CI green, whole-diff Codex review APPROVE, merge, fast-forward.

---

# PR3 — Anchors for the asset/reel codes

Depends on PR2 merged (the anchor field and `byAnchor` channel exist). Rebases onto main after PR2.

### Task 3.1: Anchor availability predicates

**Files:**
- Create: `lib/admin/attentionAnchorAvailability.ts`
- Test: `tests/admin/anchorAvailability.test.ts`

**Interfaces:**
- Produces: `availableAnchors(data): Set<AttentionAnchor>`; `hasDiagrams(data): boolean`; `hasOpeningReel(data): boolean` (the shared predicates the section render ALSO uses).

- [ ] **Step 1: Write the failing test** — `hasDiagrams` true iff resolved diagram list non-empty (`null`/`undefined`/`[]` false); `hasOpeningReel` true iff the field after `stripOpeningReelText().trim()` is non-empty (`null`/`""`/whitespace false); `availableAnchors` returns the set of the two.

- [ ] **Step 2-4:** fail → implement. `hasDiagrams` MUST reuse the already-exported `hasDiagramSignal` (`components/admin/wizard/step3ReviewSections.tsx:3564`), which is the SAME gate the sub-block render uses (`:3239`, `if (!hasDiagramSignal(resolveCurrentDiagrams(diagrams))) return null`) and the badge uses (`:3719`) — this is the spec §3.3 "single shared predicate so availability and render cannot disagree". `hasOpeningReel` reads the `opening_reel` group key (`:382`, rendered `:1839`) and applies `stripOpeningReelText().trim()` non-empty. Do NOT write a divergent diagram predicate. → pass.

- [ ] **Step 5: Commit** `feat(admin): anchor-availability predicates (diagrams, opening_reel)`.

### Task 3.2: Route the six codes with anchors + bucketing fallback

**Files:**
- Modify: `lib/admin/attentionItems.ts` (routes)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (bucketing: section-first, then anchor)
- Test: `tests/admin/anchorRouting.test.ts`

- [ ] **Step 1: Write the failing test** — the three diagram codes route `{ sectionId: "rooms", anchor: "diagrams" }`, the three reel codes `{ sectionId: "event", anchor: "opening_reel" }`; an item whose anchor is unavailable buckets to that section's `sectionTop`; an item whose section is unavailable buckets to `overview`.

- [ ] **Step 2-4:** fail → set the six routes; implement the resolution order in bucketing (section available? no → overview; yes → anchor available? yes → `byAnchor`; no → `sectionTop`) using `availableAnchors` → pass.

- [ ] **Step 5: Commit** `feat(admin): anchor the asset/reel alerts to diagrams and opening_reel`.

### Task 3.3: Mount byAnchor in the section render

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (Diagrams sub-block `:658`; opening-reel field `:1839`)
- Test: `tests/components/admin/anchorMount.test.tsx` (jsdom: the anchored card is a descendant of the anchor container)

- [ ] **Step 1-5:** jsdom test asserting DOM ancestry → render `bucket.byAnchor?.get("diagrams")` at the Diagrams sub-block and `get("opening_reel")` at the reel field → pass → commit `feat(admin): render anchored attention cards at their content`.

### Task 3.4: Real-browser placement spec + testMatch wiring

**Files:**
- Create: `tests/e2e/attention-anchor-placement.spec.ts`
- Modify: `tests/e2e/standalone.config.ts:35` (add `attention-anchor-placement` to the `testMatch` allow-list)

**Interfaces:** standalone harness pattern per `tests/e2e/compact-alert-card-layout.spec.ts` (out-of-process esbuild bundle + Tailwind CLI + `node:http`), no app server.

- [ ] **Step 1: Write the failing spec** — mount a fixture with a diagram-anchored card and a reel-anchored card; assert by DOM ancestry (`card.closest('[data-testid=...]')`) that each card renders inside its anchor container, and that the `?` trigger is present (geometry-agnostic — no 22 vs 44 assertion, per spec §9).

- [ ] **Step 2: Wire testMatch FIRST and confirm it would otherwise silently no-op**

Add `attention-anchor-placement` to the `testMatch` regex. Run `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts --list | grep attention-anchor` — expected: the spec is listed (proves the allow-list entry works).

- [ ] **Step 3-4:** run red → build the entry + harness → green.

Run: `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-anchor-placement.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit** `test(admin): real-browser anchored-placement spec + standalone testMatch wiring`.

**PR3 close-out:** same gate as PR2 (typecheck/test/lint/format, impeccable dual-gate, real CI green, whole-diff Codex APPROVE, merge, fast-forward).

---

## Cross-PR self-review checklist (run before dispatching each PR's review)

- [ ] Spec coverage: every §4 disposition row has a routing task; every §3.2 matrix state has a `composeParseNote` test case; §3.0 registry, §3.1 allowlist/alias/message-privacy, §7 meta-tests all present.
- [ ] No stale citation: `tests/cross-cutting/codes.test.ts` (not `tests/messages/`) — fixed in Task 1.4.
- [ ] Type consistency: `AttentionAlertPayload.errorCode` (1.3) is the exact name the note channel (2.2) and renderer (2.6) read; `sectionAttention` (2.5) is the exact prop the warnings render (2.6) consumes.
- [ ] Anti-tautology: routing tests assert against a frozen expectation, not against `ATTENTION_ROUTES` itself; copy tests derive from `composeParseNote`, scoped to the note testid so the list cannot satisfy them.
- [ ] Real-RPC: the repeated-raise test (1.2) hits `upsert_admin_alert`, not a mock (Codex R8).
- [ ] Playwright wiring: PR3's spec is in `standalone.config.ts` `testMatch` (2-step: wire, then confirm `--list`).
