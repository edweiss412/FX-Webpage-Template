# Observability Coverage Carve-Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the durable log stream self-triageable and close the highest-value observability gaps that don't collide with in-flight feature work.

**Architecture:** Additive log instrumentation only — a per-failure breadcrumb in the cron summarizers, a cry-wolf split in `enrichAgenda`, an admin-gate denial warn, forensic codes on 4 code-less rows, and `logAdminOutcome` post-commit telemetry on 5 live-show mutation routes. No DB migration, no UI, no advisory-lock change, no new Supabase call sites.

**Tech Stack:** Next.js 16 route handlers, TypeScript (exactOptionalPropertyTypes), Vitest, `lib/log` (`log.*` + `logAdminOutcome`).

**Spec:** `docs/superpowers/specs/2026-07-02-observability-coverage-carveout-design.md` (Codex-APPROVED, 3 rounds). Every anchor below is verified against live code in this worktree.

## Global Constraints

- **TDD per task, commit per task** (invariant 1 + 6). Conventional commits: `feat(<scope>):` / `test(<scope>):`. Scopes: `log`, `cron`, `sync`, `auth`, `parser`, `admin`.
- **Every new `code` literal lives ONLY inside a `log.*(...)` or `logAdminOutcome(...)` span** → §12.4-scanner-exempt (no `catalog.ts` / §12.4 registration). A literal outside such a span fails x1 `tests/messages/codes.test.ts`. The breadcrumb reads `r.code` at runtime — never a literal.
- **Email canonicalization (invariant 3):** `requireAdminIdentity()`/`readAdminEmail()` return already-canonical email; pass it straight to `hashForLog`/`logAdminOutcome.actorEmail`. Never re-canonicalize, never hash `""`.
- **Mutation-boundary discipline:** telemetry fires ONLY on a committed live-show mutation — never on discard/no-op/stage/guard/idempotent-repoll.
- **Spy-on-log assertions are mandatory** where an existing test only asserts a return value (verdict-only tests would let a broken log ship green).
- **Derive test expectations from fixtures**, never hardcode a hash or id.
- **Meta-test task (Task 12) runs LAST** — its assertions require every route+code to already exist.
- **No advisory lock is acquired** by any change (invariant 2 unchanged); **no new Supabase call site** (invariant 9 unchanged).

**New codes inventory (11 new + 1 reused, 0 catalog changes):** plain-log forensic — `AGENDA_GETFILE_GONE`, `AGENDA_GETFILE_FAULT`, `AGENDA_TOO_MANY_PAGES`, `AGENDA_PDFJS_THREW`, `AGENDA_SCHEDULE_HIGH_CONFIDENCE`, `HOTELS_PARSE_WARNING`, `ADMIN_ACCESS_DENIED`; reused catalog — `AGENDA_SCHEDULE_LOW_CONFIDENCE`; admin-outcome — `SHOW_APPLIED` (R1+R2), `SHOW_SYNCED_MANUAL`, `PENDING_INGESTION_RETRIED`, `SNAPSHOT_ROLLBACK_REPAIRED`.

---

## Task 1: summarizeSync per-failure breadcrumb

**Files:**
- Modify: `lib/cron/summarizeSync.ts`
- Test: `tests/cron/summarizeSync.test.ts` (extend; if absent, create)

**Interfaces:**
- Consumes: `RunScheduledCronSyncResult.processed: Array<{ driveFileId: string; result: ProcessOneFileResult }>` (`lib/sync/runScheduledCronSync.ts:334-338`); FAILED-set variants carry a runtime `code` (`:183-224`).
- Produces: `CronRunSummary.detail.failures: Array<{ driveFileId: string; outcome: string; code?: string }>` + optional `detail.failuresTruncated: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cron/summarizeSync.test.ts
import { describe, expect, test } from "vitest";
import { summarizeSync } from "@/lib/cron/summarizeSync";

const proc = (driveFileId: string, result: unknown) => ({ driveFileId, result });

describe("summarizeSync — failure breadcrumb", () => {
  test("hard_fail item appears in detail.failures with driveFileId+outcome+code", () => {
    const s = summarizeSync({
      processed: [
        proc("f-ok", { outcome: "applied", showId: "s1" }),
        proc("f-bad", { outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" }),
      ],
    } as never);
    expect(s.outcome).toBe("partial");
    expect(s.counts?.failed).toBe(1);
    expect(s.detail?.failures).toEqual([
      { driveFileId: "f-bad", outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" },
    ]);
  });

  test("ok run omits detail.failures entirely (exactOptionalPropertyTypes)", () => {
    const s = summarizeSync({ processed: [proc("f", { outcome: "applied", showId: "s" })] } as never);
    expect(s.outcome).toBe("ok");
    expect(s.detail).toBeUndefined();
  });

  test("ConcurrentSyncSkipped + skipped are excluded from failures", () => {
    const s = summarizeSync({
      processed: [
        proc("f-lock", { skipped: "CONCURRENT_SYNC_SKIPPED" }),
        proc("f-skip", { outcome: "skipped" }),
        proc("f-bad", { outcome: "parse_error", code: "SYNC_INFRA_ERROR" }),
      ],
    } as never);
    expect(s.detail?.failures).toEqual([
      { driveFileId: "f-bad", outcome: "parse_error", code: "SYNC_INFRA_ERROR" },
    ]);
  });

  test("truncates at 25 with failuresTruncated:true; counts.failed keeps true total", () => {
    const processed = Array.from({ length: 30 }, (_, i) =>
      proc(`f${i}`, { outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" }),
    );
    const s = summarizeSync({ processed } as never);
    expect(s.counts?.failed).toBe(30);
    expect((s.detail?.failures as unknown[]).length).toBe(25);
    expect(s.detail?.failuresTruncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/cron/summarizeSync.test.ts` → FAIL (`detail.failures` undefined).

- [ ] **Step 3: Implement** — in `lib/cron/summarizeSync.ts`: add `const MAX_FAILURE_BREADCRUMBS = 25;` near the top. Widen the loop and collect failures:

```ts
const failures: Array<{ driveFileId: string; outcome: string; code?: string }> = [];
for (const { driveFileId, result: r } of result.processed) {
  if ((r as { skipped?: string }).skipped === CONCURRENT_SYNC_SKIPPED) {
    skipped++;
    continue;
  }
  const outcome = (r as { outcome?: string }).outcome;
  if (outcome === "applied") applied++;
  else if (outcome === "stage") staged++;
  else if (outcome && SKIPPED.has(outcome)) skipped++;
  else {
    failed++; // FAILED-set OR conservative unknown
    if (failures.length < MAX_FAILURE_BREADCRUMBS) {
      const code = (r as { code?: string }).code;
      failures.push({ driveFileId, outcome: outcome ?? "unknown", ...(code ? { code } : {}) });
    }
  }
}
```

Then in the `failed > 0 || heartbeatFault` branch, build one merged detail object (omit-not-undefined):

```ts
if (failed > 0 || heartbeatFault) {
  const detail = {
    ...(result.maintenanceFaults ? { maintenanceFaults: result.maintenanceFaults } : {}),
    ...(failures.length > 0 ? { failures } : {}),
    ...(failures.length > 0 && failed > failures.length ? { failuresTruncated: true } : {}),
  };
  return Object.keys(detail).length > 0
    ? { outcome: "partial", counts, detail }
    : { outcome: "partial", counts };
}
```

(Note: `failed > failures.length` is the truncation signal — `failures` is capped at 25 while `failed` counts all.)

- [ ] **Step 4: Run tests** — `pnpm vitest run tests/cron/summarizeSync.test.ts` → PASS. Then `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(cron): per-failure breadcrumb in summarizeSync"`

---

## Task 2: summarizeAssetRecovery breadcrumb mirror (showId, code optional)

**Files:**
- Modify: `lib/cron/summarizeAssetRecovery.ts`
- Test: `tests/cron/summarizeAssetRecovery.test.ts` (extend; if absent, create)

**Interfaces:**
- Consumes: `AssetRecoveryCronResult.processed: Array<{ showId: string; result: AssetRecoveryResult }>` (`lib/sync/assetRecovery.ts:118`). `partial_failure` (`:105`)/`no_op` (`:115`) carry NO code; `revision_drift`/`drift_cooldown`/`bytes_exceeded`/`infra_error` do.
- Produces: `CronRunSummary.detail.failures: Array<{ showId: string; outcome: string; code?: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cron/summarizeAssetRecovery.test.ts
import { describe, expect, test } from "vitest";
import { summarizeAssetRecovery } from "@/lib/cron/summarizeAssetRecovery";
const proc = (showId: string, result: unknown) => ({ showId, result });

describe("summarizeAssetRecovery — failure breadcrumb", () => {
  test("keys on showId; omits code for partial_failure", () => {
    const s = summarizeAssetRecovery({
      processed: [
        proc("s-ok", { outcome: "recovered" }),
        proc("s-pf", { outcome: "partial_failure", snapshotRevisionId: "r1" }),
      ],
    } as never);
    expect(s.outcome).toBe("partial");
    expect(s.detail?.failures).toEqual([{ showId: "s-pf", outcome: "partial_failure" }]);
  });

  test("infra_error carries its code", () => {
    const s = summarizeAssetRecovery({
      processed: [proc("s-x", { outcome: "infra_error", code: "SYNC_INFRA_ERROR" })],
    } as never);
    expect(s.outcome).toBe("infra");
    expect(s.detail?.failures).toEqual([
      { showId: "s-x", outcome: "infra_error", code: "SYNC_INFRA_ERROR" },
    ]);
  });

  test("all-ok run omits detail", () => {
    const s = summarizeAssetRecovery({ processed: [proc("s", { outcome: "no_op" })] } as never);
    expect(s.detail).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (`detail` undefined).

- [ ] **Step 3: Implement** — widen the loop to `{ showId, result: r }`, collect `failures` on the `failed++` arms (`infra_error`, PARTIAL-set, unknown), each `{ showId, outcome: o, ...(code ? { code } : {}) }` with `const code = (r as { code?: string }).code`. Cap at a shared `MAX_FAILURE_BREADCRUMBS = 25`. In the final return, attach `detail: { failures }` only when `failures.length > 0` (currently returns `{ outcome, counts }` with no detail — omit when empty).

- [ ] **Step 4: Run tests + typecheck** → PASS/clean.

- [ ] **Step 5: Commit** — `feat(cron): per-failure breadcrumb mirror in summarizeAssetRecovery`

---

## Task 3: enrichAgenda known_stale cry-wolf split

**Files:**
- Modify: `lib/sync/enrichAgenda.ts:160-188`
- Test: `tests/sync/enrichAgenda.test.ts:281-345` (extend)

- [ ] **Step 1: Write the failing test** — extend the existing describe with a `log` spy:

```ts
// add at top of the describe: vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
// then, using the existing 404 fixture:
test("getFile 404 → log.info AGENDA_GETFILE_GONE, no error field", async () => {
  const { log } = await import("@/lib/log");
  // ...drive getFile throws a 404 DriveFetchError (reuse existing 404 setup)...
  await enrichAgenda(/* ...existing 404 args... */);
  expect(log.info).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ code: "AGENDA_GETFILE_GONE", verdict: "known_stale" }),
  );
  const infoFields = (log.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![1] as Record<string, unknown>;
  expect(infoFields).not.toHaveProperty("error");
  expect(log.warn).not.toHaveBeenCalled();
});
test("getFile 503/plain-Error → log.warn AGENDA_GETFILE_FAULT with error", async () => {
  const { log } = await import("@/lib/log");
  // ...drive getFile throws a 503 / plain Error (reuse existing 503 setup)...
  await enrichAgenda(/* ...existing 503 args... */);
  expect(log.warn).toHaveBeenCalledWith(
    "getFile threw",
    expect.objectContaining({ code: "AGENDA_GETFILE_FAULT", verdict: "unknown", error: expect.anything() }),
  );
});
```

(Note: existing verdict assertions at `:294-344` stay green — they assert `perLink[].verdict`. Preserve them.)

- [ ] **Step 2: Run test to verify it fails** — FAIL (single `log.warn` fires for both; no code).

- [ ] **Step 3: Implement** — replace the single `log.warn` at `:160-167` (delete it) and add per-branch emissions inside the existing `if (status === 404 || status === 400)` / `else` at `:168`/`:180`:

```ts
} catch (error) {
  const status = driveErrorStatus(error);
  if (status === 404 || status === 400) {
    log.info("agenda link gone", {
      source: "sync.enrichAgenda",
      fileId: link.fileId,
      ordinal: i,
      status,
      verdict: "known_stale",
      code: "AGENDA_GETFILE_GONE",
    });
    warnings.push(warn("AGENDA_PDF_UNREADABLE", /* ...existing message... */));
    perLink.push({ ordinal: i, ...(recoveredFileId !== undefined ? { recoveredFileId } : {}), verdict: "known_stale" });
  } else {
    log.warn("getFile threw", {
      source: "sync.enrichAgenda",
      fileId: link.fileId,
      ordinal: i,
      status,
      verdict: "unknown",
      error,
      code: "AGENDA_GETFILE_FAULT",
    });
    perLink.push({ ordinal: i, ...(recoveredFileId !== undefined ? { recoveredFileId } : {}), verdict: "unknown" });
  }
  continue;
}
```

- [ ] **Step 4: Run tests + typecheck** → PASS/clean (existing verdict tests still pass).

- [ ] **Step 5: Commit** — `feat(sync): split enrichAgenda getFile-catch — info+code for gone, warn+code for transient`

---

## Task 4: requireAdmin denial log.warn ADMIN_ACCESS_DENIED

**Files:**
- Modify: `lib/auth/requireAdmin.ts` (add import + `log.warn` before `forbidden()` at `:267`)
- Test: `tests/auth/requireAdmin.test.ts:160-172` (+ `:190-210`)

- [ ] **Step 1: Write the failing test** — add a hoisted `@/lib/log` mock to the suite, then in the denial test:

```ts
const { log } = await import("@/lib/log");
const { hashForLog } = await import("@/lib/email/hashForLog");
const { canonicalize } = await import("@/lib/email/canonicalize");
// ...trigger authed-but-not-admin (is_session_live true, is_admin false)...
await expect(requireAdmin()).rejects.toThrow("forbidden()");
expect(log.warn).toHaveBeenCalledWith(
  "admin access denied",
  expect.objectContaining({
    source: "auth/requireAdmin",
    code: "ADMIN_ACCESS_DENIED",
    actorHash: hashForLog(canonicalize("Admin@FXAV.Test ")), // seeded email :52-55
  }),
);
```

Also assert the unauthed-redirect and infra paths do NOT call `log.warn` with `ADMIN_ACCESS_DENIED`.

- [ ] **Step 2: Run test to verify it fails** — FAIL (`log.warn` not called with that code).

- [ ] **Step 3: Implement** — add `import { hashForLog } from "@/lib/email/hashForLog";` (near the `canonicalize` import `:26`). At the denial (`:265-267`), insert before `forbidden()`:

```ts
if (isAdmin !== true) {
  // Confirmed non-admin — auth-level denial (security boundary: 403).
  await log.warn("admin access denied", {
    source: "auth/requireAdmin",
    code: "ADMIN_ACCESS_DENIED",
    actorHash: hashForLog(email),
  });
  forbidden();
}
```

- [ ] **Step 4: Run tests + typecheck** — run `tests/auth/requireAdmin.test.ts` + `tests/auth/_metaInfraContract.test.ts` (pins requireAdmin infra emits) → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(auth): log ADMIN_ACCESS_DENIED at the admin-gate denial`

---

## Task 5: extractAgendaSchedule forensic codes

**Files:**
- Modify: `lib/agenda/extractAgendaSchedule.ts:173,543,584,595`
- Test: `tests/agenda/extractAgendaSchedule.test.ts` (+ `...Serverless.test.ts`)

**Reuse-vs-mint (from spec §5.1):** `:173` mint `AGENDA_TOO_MANY_PAGES`; `:543` **reuse** `AGENDA_SCHEDULE_LOW_CONFIDENCE`; `:584` mint `AGENDA_SCHEDULE_HIGH_CONFIDENCE` (durability addition — was code-less info, now durable); `:595` mint `AGENDA_PDFJS_THREW` (keep the reserved `error: err`).

- [ ] **Step 1: Write the failing test** — spy on `log`; drive each branch (too-many-pages via `>AGENDA_MAX_PAGES` fixture; low/high confidence via existing fixtures; pdfjs-threw via a getDocument that throws) and assert each emits its `code`. For `:584`, assert `log.info` is called with `code: "AGENDA_SCHEDULE_HIGH_CONFIDENCE"` (now durable).

- [ ] **Step 2: Run test to verify it fails** — FAIL (codes absent).

- [ ] **Step 3: Implement** — add the `code:` property to each existing `log.*` call's fields object (message args unchanged):
  - `:173` `log.warn("too-many-pages", { source: "agenda.extract", ..., code: "AGENDA_TOO_MANY_PAGES" })`
  - `:543` `log.warn("low-confidence", { source: "agenda.extract", ..., code: "AGENDA_SCHEDULE_LOW_CONFIDENCE" })`
  - `:584` `log.info("high", { source: "agenda.extract", ..., code: "AGENDA_SCHEDULE_HIGH_CONFIDENCE" })`
  - `:595` `log.error("pdfjs threw", { source: "agenda.extract", bytes: ..., error: err, code: "AGENDA_PDFJS_THREW" })`

- [ ] **Step 4: Run tests + typecheck** → PASS/clean.

- [ ] **Step 5: Commit** — `feat(agenda): forensic codes on extractAgendaSchedule log rows`

---

## Task 6: hotels parser HOTELS_PARSE_WARNING

**Files:**
- Modify: `lib/parser/blocks/hotels.ts:35`
- Test: `tests/parser/blocks/hotels.test.ts`

- [ ] **Step 1: Write the failing test** — spy on `log`; trigger the local `warn(msg)` path and assert `log.warn` called with `expect.objectContaining({ source: "parser.hotels", code: "HOTELS_PARSE_WARNING" })`.

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — `:35` → `log.warn(msg, { source: "parser.hotels", code: "HOTELS_PARSE_WARNING" });` (message stays the runtime `msg`).

- [ ] **Step 4: Run tests + typecheck** → PASS/clean.

- [ ] **Step 5: Commit** — `feat(parser): HOTELS_PARSE_WARNING code on hotels-block warn`

---

## Task 7: R1 — staged/[fileId]/apply SHOW_APPLIED

**Files:**
- Modify: `app/api/admin/staged/[fileId]/apply/route.ts`
- Test: `tests/api/admin-staged-apply-route.test.ts`

**Interfaces:** import `import { logAdminOutcome } from "@/lib/log/logAdminOutcome";`. Actor = `admin.email` (`readAdminEmail()` at `:134`; guard: only proceed when `admin.kind === "ok"`). `driveFileId = fileId` (`:104`). `ApplyStagedResult.applied` has `showId`; `wizard_applied` has `wizardSessionId` (no showId).

- [ ] **Step 1: Write the failing test** — mock `applyStaged` to return `{ outcome: "applied", showId: "s1", ... }`; assert `logAdminOutcome` called with `{ code: "SHOW_APPLIED", source: "api.admin.staged.apply", actorEmail: <canonical>, driveFileId: <fileId>, showId: "s1" }`. Add a `discarded`-outcome test asserting `logAdminOutcome` NOT called. Add a `wizard_applied` test asserting call with `wizardSessionId` and NO `showId`.

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — in the `result.outcome === "applied"` block (both the 202 pending-promote at `:168` and the 200 at `:178`), before returning:

```ts
await logAdminOutcome({
  code: "SHOW_APPLIED",
  source: "api.admin.staged.apply",
  actorEmail: admin.email,
  driveFileId: fileId,
  showId: result.showId,
});
```

In the `wizard_applied` block (`:187`): same but `wizardSessionId: result.wizardSessionId` and NO `showId`. Do NOT add to the `discarded` (`:197`) or guard/error returns. (`admin` is `readAdminEmail()`'s result; it's already destructured earlier — use `admin.email` guarded by the existing `admin.kind === "ok"` check.)

- [ ] **Step 4: Run tests + typecheck** → PASS/clean.

- [ ] **Step 5: Commit** — `feat(admin): SHOW_APPLIED telemetry on live staged apply`

---

## Task 8: R2 — show/staged/[stagedId]/apply SHOW_APPLIED

**Files:**
- Modify: `app/api/admin/show/staged/[stagedId]/apply/route.ts`
- Test: `tests/api/admin/…` (the route's existing test; grep for the handler test)

**Interfaces:** import `logAdminOutcome`. Actor = `admin.email` (`deps.requireAdminIdentity()` at `:140`). `driveFileId` from `readDriveFileIdForStagedId` (`:154`). `showId = result.showId` (`:174`). Source `"api.admin.staged.apply"` (matches existing `:186`).

- [ ] **Step 1: Write the failing test** — drive the `applied` outcome; assert `logAdminOutcome({ code: "SHOW_APPLIED", source: "api.admin.staged.apply", actorEmail, driveFileId, showId })`.

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — inside the `!("skipped" in result) && result.outcome === "applied"` block (`:173-176`), before the `return NextResponse.json({ slug })`:

```ts
await logAdminOutcome({
  code: "SHOW_APPLIED",
  source: "api.admin.staged.apply",
  actorEmail: admin.email,
  driveFileId,
  showId: result.showId,
});
```

- [ ] **Step 4: Run tests + typecheck** → PASS/clean.

- [ ] **Step 5: Commit** — `feat(admin): SHOW_APPLIED telemetry on show staged apply`

---

## Task 9: R3 — sync/[slug] SHOW_SYNCED_MANUAL (gated on applied)

**Files:**
- Modify: `app/api/admin/sync/[slug]/route.ts`
- Test: `tests/api/admin-sync-route.test.ts`

**Interfaces:** switch `requireAdmin()` (`:57`) → `requireAdminIdentity()` and capture email. import `logAdminOutcome`. `driveFileId = resolved.driveFileId` (`:68`). Gate: emit only when `result.outcome === "applied"` (a `stage` also reaches `:86` — do NOT emit). `showId = result.showId` (applied variant).

- [ ] **Step 1: Write the failing test** — mock `runManualSyncForShow` → `{ outcome: "applied", showId: "s1", ... }`; assert `logAdminOutcome({ code: "SHOW_SYNCED_MANUAL", source: "api.admin.sync", actorEmail, driveFileId, showId: "s1" })`. Add a `stage`-outcome test asserting `logAdminOutcome` NOT called.

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — change `:57` to `const { email } = await requireAdminIdentity();` (import `requireAdminIdentity` at `:2`, keeping `requireAdmin` removed if now unused). Before `:86` `return`:

```ts
if (result.outcome === "applied") {
  await logAdminOutcome({
    code: "SHOW_SYNCED_MANUAL",
    source: "api.admin.sync",
    actorEmail: email,
    driveFileId: resolved.driveFileId,
    showId: result.showId,
  });
}
return NextResponse.json({ ok: true, result });
```

The switch is behavior-transparent: `requireAdmin()` (`:57`) is NOT wrapped in a try/catch (it sits directly in `runWithRequestContext`), and `requireAdmin` delegates to `requireAdminIdentity` (`requireAdmin.ts:288`) — so `requireAdminIdentity()` throws the same `AdminInfraError` and raises the same `forbidden()`/redirect interrupts, propagating identically. Just capture `{ email }` on the success path.

- [ ] **Step 4: Run tests + typecheck** → PASS/clean.

- [ ] **Step 5: Commit** — `feat(admin): SHOW_SYNCED_MANUAL telemetry on manual re-sync`

---

## Task 10: R4 — pending-ingestions/[id]/retry PENDING_INGESTION_RETRIED (outcome-ref)

**Files:**
- Modify: `app/api/admin/pending-ingestions/[id]/retry/route.ts`
- Test: `tests/api/…` retry route test (grep `handleLivePendingIngestionRetry`)

**Interfaces:** import `logAdminOutcome` + `AdminOutcome` type. Capture `const admin = await deps.requireAdminIdentity()` (`:321` currently discards it). `driveFileId` at `:330`. **Gate on the applied outcome, NOT `appliedShowId`.**

- [ ] **Step 1: Write the failing test** — (a) manual-sync `applied` → `logAdminOutcome({ code: "PENDING_INGESTION_RETRIED", source: "api.admin.pending-ingestions.retry", actorEmail, driveFileId, showId })` called once; (b) a `source_gone`/`parse_error` outcome that maps to `still_failed` but carries a showId → `logAdminOutcome` NOT called (the over-log guard); (c) first-seen `applied` → called; (d) `parsed_pending_review`/`deferred` → NOT called.

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — declare beside `appliedShowId` (`:337`): `let outcome: Omit<AdminOutcome, "code"> | null = null;`. In the manual-sync path, after `:376` (the `appliedShowId` capture), add a TIGHTER, outcome-gated assignment:

```ts
if (syncResult.outcome === "applied") {
  outcome = {
    source: "api.admin.pending-ingestions.retry",
    actorEmail: admin.email,
    driveFileId: row.drive_file_id,
    showId: syncResult.showId,
  };
}
```

In the first-seen path, alongside `:397` (`if (stageResult.outcome === "applied") appliedShowId = stageResult.showId;`):

```ts
if (stageResult.outcome === "applied") {
  outcome = {
    source: "api.admin.pending-ingestions.retry",
    actorEmail: admin.email,
    driveFileId: row.drive_file_id,
    showId: stageResult.showId,
  };
}
```

After the lock resolves, beside `revalidateShow` (`:405`), before `return result`:

```ts
if (outcome) await logAdminOutcome({ code: "PENDING_INGESTION_RETRIED", ...outcome });
```

Capture the admin: `:321` `const admin = await deps.requireAdminIdentity();` (keep the existing catch). `admin.email` is canonical.

- [ ] **Step 4: Run tests + typecheck** → PASS/clean. Confirm the `Omit<AdminOutcome,"code">` ref carries NO `code` field (scanner-safety; the literal rides only the emit call).

- [ ] **Step 5: Commit** — `feat(admin): PENDING_INGESTION_RETRIED telemetry on live retry apply`

---

## Task 11: R5 — snapshot-rollback/[id]/repair SNAPSHOT_ROLLBACK_REPAIRED

**Files:**
- Modify: `app/api/admin/snapshot-rollback/[id]/repair/route.ts`
- Test: `tests/api/admin-snapshot-rollback-repair.test.ts`

**Interfaces:** switch `requireAdmin()` (`:19`) → `requireAdminIdentity()` (still throws `AdminInfraError` → the `instanceof AdminInfraError` catch at `:21` stays valid). import `logAdminOutcome`. `driveFileId = data.drive_file_id` (`:34-38`). NO showId; pass `snapshotRevisionId` via `extra`.

- [ ] **Step 1: Write the failing test** — drive `repairSnapshotRollback` → `{ outcome: "repaired", snapshotRevisionId: "r1" }`; assert `logAdminOutcome({ code: "SNAPSHOT_ROLLBACK_REPAIRED", source: "api.admin.snapshot-rollback.repair", actorEmail, driveFileId, extra: { snapshotRevisionId: "r1" } })`. Assert `not_found`/`not_stuck` outcomes do NOT emit.

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — `:2` import `requireAdminIdentity` (keep `AdminInfraError`); `:19` `const { email } = await requireAdminIdentity();`. Capture `data.drive_file_id` from the ledger select. Before `:55` `return NextResponse.json({ ok: true, result })`:

```ts
await logAdminOutcome({
  code: "SNAPSHOT_ROLLBACK_REPAIRED",
  source: "api.admin.snapshot-rollback.repair",
  actorEmail: email,
  driveFileId: data.drive_file_id,
  extra: { snapshotRevisionId: result.snapshotRevisionId },
});
```

- [ ] **Step 4: Run tests + typecheck** → PASS/clean.

- [ ] **Step 5: Commit** — `feat(admin): SNAPSHOT_ROLLBACK_REPAIRED telemetry on repair`

---

## Task 12: Extend the meta-test (LAST — after all routes+codes exist)

**Files:**
- Modify: `tests/log/_metaAdminOutcomeContract.test.ts`

**Why last:** Assertion 1 reads each registered route file and requires the import + call + quoted code; Assertion 3 requires every sanctioned code be used by ≥1 route. These only pass once Tasks 7-11 exist. Assertion 4 leak-checks `NEW_FORENSIC_CODES`.

- [ ] **Step 1: Extend the registries** —
  - `AUDITABLE_MUTATIONS` (`:13`) += 5 rows:
    ```ts
    { file: "app/api/admin/staged/[fileId]/apply/route.ts", code: "SHOW_APPLIED" },
    { file: "app/api/admin/show/staged/[stagedId]/apply/route.ts", code: "SHOW_APPLIED" },
    { file: "app/api/admin/sync/[slug]/route.ts", code: "SHOW_SYNCED_MANUAL" },
    { file: "app/api/admin/pending-ingestions/[id]/retry/route.ts", code: "PENDING_INGESTION_RETRIED" },
    { file: "app/api/admin/snapshot-rollback/[id]/repair/route.ts", code: "SNAPSHOT_ROLLBACK_REPAIRED" },
    ```
  - `SANCTIONED_CODES` (`:34`) += `"SHOW_APPLIED", "SHOW_SYNCED_MANUAL", "PENDING_INGESTION_RETRIED", "SNAPSHOT_ROLLBACK_REPAIRED"`.
  - `NEW_FORENSIC_CODES` (`:47`) += the 7 plain-log forensic codes: `"AGENDA_GETFILE_GONE", "AGENDA_GETFILE_FAULT", "AGENDA_TOO_MANY_PAGES", "AGENDA_PDFJS_THREW", "AGENDA_SCHEDULE_HIGH_CONFIDENCE", "HOTELS_PARSE_WARNING", "ADMIN_ACCESS_DENIED"`. (Do NOT add the REUSED `AGENDA_SCHEDULE_LOW_CONFIDENCE` — it is cataloged.)

- [ ] **Step 2: Run the meta-test** — `pnpm vitest run tests/log/_metaAdminOutcomeContract.test.ts` → all 4 assertions PASS. (If Assertion 1 fails on an import specifier, confirm each route imports from exactly `"@/lib/log/logAdminOutcome"`.)

- [ ] **Step 3: Negative-regression** — temporarily break one route (remove a `logAdminOutcome` call) and confirm Assertion 1 FAILS; restore. Temporarily add a leaked `code: "SHOW_APPLIED"` in a plain object in a route and confirm Assertion 4 FAILS; restore. (Do not commit the breaks.)

- [ ] **Step 4: Commit** — `test(log): extend _metaAdminOutcomeContract for carve-out codes`

---

## Task 13: Whole-diff verification

- [ ] **Step 1: Scanner + enum no-op** — `pnpm gen:internal-code-enums` → **no diff** (no code escaped the generator). `git diff --exit-code` on generated files → clean.
- [ ] **Step 2: x1 catalog parity** — `pnpm vitest run tests/messages/codes.test.ts` → PASS (no leaked producer; catalog untouched).
- [ ] **Step 3: Targeted suites** — `pnpm vitest run tests/cron tests/sync/enrichAgenda.test.ts tests/auth/requireAdmin.test.ts tests/auth/_metaInfraContract.test.ts tests/agenda tests/parser/blocks/hotels.test.ts tests/log tests/api` → PASS.
- [ ] **Step 4: Full typecheck** — `pnpm typecheck` → clean.
- [ ] **Step 5: Full test suite** — `pnpm test` → green except the known env-only failures (`test-auth-gate`, `email-canonicalization`, `pg-cron-coverage`, `validation-schema-parity` — need live DB/HTTP the worktree lacks; verify each is unrelated to this diff by confirming it also fails at the merge-base).
- [ ] **Step 6: Commit** (if any generated-file refresh) — `chore(log): regen after carve-out` (only if needed).

---

## Self-review checklist (run after drafting)

- **Spec coverage:** S1→T1/T2; S2→T3; S3→T4; S4→T5/T6; S5→T7-T11; meta-test→T12; verify→T13. All 5 surfaces + meta-test covered.
- **Type consistency:** `logAdminOutcome`/`AdminOutcome` names match `lib/log/logAdminOutcome.ts`; `CronRunSummary.detail` is `Record<string,unknown>`; breadcrumb element shapes differ by summarizer (driveFileId vs showId) — intentional.
- **No placeholders:** every impl step shows the actual code; every test step shows real assertions.
- **Mutation-boundary:** T7 excludes discarded; T9 gates applied; T10 gates on `outcome==="applied"` not `appliedShowId`; T11 gates repaired.
- **Scanner-safety:** every code inside a log/logAdminOutcome span; T10 ref is `Omit<AdminOutcome,"code">`; T13 verifies gen no-op + x1.
