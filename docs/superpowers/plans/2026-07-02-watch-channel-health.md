# Watch-Channel Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the APPROVED spec `docs/superpowers/specs/2026-07-01-watch-channel-health-design.md` — de-jargoned WATCH_CHANNEL_ORPHANED copy, Resolve→Dismiss rename, hourly reconcile with auto-resolve + fired-once escalation (Sentry + gated email), admin "Retry now" on banner + Settings, and full error capture/redaction in the watch subscribe path.

**Architecture:** All watch lifecycle logic stays in `lib/drive/watch.ts` (reconcile takes the same-cycle refresh result); pure classification/redaction in new `lib/drive/watchErrors.ts`; escalation (guard + Sentry + email) in new `lib/drive/watchEscalation.ts`; the strict `app_events` writer joins `lib/log/persist.ts` (sole-writer guard); one new server action in `app/admin/actions.ts` shared by the banner and the Settings panel.

**Tech Stack:** Next.js 16 server components/actions, postgres.js raw-SQL WatchTx, Supabase service-role clients, Resend via `lib/notify/send.ts`, `@sentry/nextjs`, Vitest + Playwright.

## Global Constraints

- **Spec is canonical:** `docs/superpowers/specs/2026-07-01-watch-channel-health-design.md` (Status: APPROVED, 11 adversarial rounds). Read the section cited by each task before implementing it. Where this plan and the spec disagree, the spec wins.
- TDD per task (invariant 1): failing test → run to see it fail → minimal implementation → pass → commit.
- Named constants (spec §2): `ESCALATION_THRESHOLD = 3`, `STALE_PENDING_MAX_AGE_MS = 3_600_000`. Defined ONCE in `lib/drive/watchErrors.ts`; every consumer imports them. Tests derive fixtures from the constants, never hardcode 3 or 1h.
- No advisory locks anywhere in this diff (spec §3.2 Concurrency; §6). Zero `pg_advisory*` additions.
- No new §12.4 codes. The copy change is an existing-row edit → three-way lockstep in ONE commit (Task 8). NEVER run prettier on the master spec.
- Invariant 9: every new Supabase call boundary destructures `{ data, error }` and gets a registry row (Task-specific notes) or an inline `// not-subject-to-meta: <reason>`.
- UI chrome labels ("Retry now", "Retrying…", "Dismiss", status lines) are NOT cataloged (spec §6 chrome-vs-catalog watchpoint). Substantive copy is cataloged (Task 8).
- Commit format: `feat(sync):` / `test(sync):` for watch/cron work; `feat(admin):` for UI/action work; `docs(help):`-style not needed here.
- The log call in the watch catch paths passes ONLY the redacted `errorMessage` string — never `error: err` (spec §3.1.4, R5-1).
- Full-suite + gates run in Task 16 before the whole-diff review; the invariant-8 impeccable dual-gate (Task 15) runs BEFORE the whole-diff Codex review.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/drive/watchErrors.ts` | Create | Pure: `classifyWatchError`, `redactWatchError`, `ESCALATION_THRESHOLD`, `STALE_PENDING_MAX_AGE_MS`, `WatchErrorClass` |
| `lib/drive/watch.ts` | Modify | Catch-path capture; `SubscribeResult.reason`; `RefreshResult` channels; two new `WatchTx` methods; `reconcileWatchChannels` |
| `lib/drive/watchEscalation.ts` | Create | `maybeEscalateWatchOrphaned` (alert read, guard read, recheck, guard write, Sentry, gated email); email copy literals |
| `lib/log/persist.ts` | Modify | Add `persistAppEventStrict` (failure-visible sibling of `persistAppEvent`) |
| `app/api/cron/refresh-watch/route.ts` | Modify | refresh → reconcile; 200/500 contract; summary counts |
| `app/admin/actions.ts` | Modify | Add `retryWatchSubscriptionFormAction` |
| `components/admin/RetryWatchButton.tsx` | Create | useFormStatus submit button, "Retry now"/"Retrying…" |
| `components/admin/AlertBanner.tsx` | Modify | `occurrence_count` in SELECT; watch-code action-slot branch; panel dismiss row + status line + error line |
| `components/admin/ResolveAlertButton.tsx` | Modify | Labels Resolve→Dismiss |
| `components/admin/settings/DriveConnectionPanel.tsx` | Modify | Retry-connection form; folderId-keyed visibility + copy |
| `lib/messages/catalog.ts` + master spec §12.4 + `lib/messages/__generated__/spec-codes.ts` | Modify | Copy lockstep |
| Tests | Create/Modify | Per task below; e2e watch variant in `tests/e2e/admin-banner-layout.spec.ts`; DB race in `tests/db/upsert-admin-alert-dedup.test.ts`; meta-test row rewrite in `tests/sync/_metaInfraContract.test.ts` |

---

### Task 1: `watchErrors.ts` — classification, redaction, constants

**Files:**
- Create: `lib/drive/watchErrors.ts`
- Test: `tests/drive/watchErrors.test.ts`

**Interfaces:**
- Produces: `classifyWatchError(err: unknown): WatchErrorClass`; `redactWatchError(message: string, secrets?: { webhookSecret?: string }): string`; `export const ESCALATION_THRESHOLD = 3`; `export const STALE_PENDING_MAX_AGE_MS = 3_600_000`; `export type WatchErrorClass = "config" | "drive_api" | "db"`. Consumed by Tasks 2, 5, 6, 10.
- **Import-direction rule (hard):** `lib/drive/watchErrors.ts` imports NOTHING from `lib/drive/watch.ts` — watch.ts imports from watchErrors.ts, so any reverse import creates a `watch → watchErrors → watch` cycle. `classifyWatchError` detects `DriveWatchInfraError` STRUCTURALLY via its `kind === "drive_watch_infra_error"` marker (`lib/drive/watch.ts:10-12`), never via `instanceof`. Only the **test file** may import `DriveWatchInfraError` from `@/lib/drive/watch` (tests are outside the module graph of the two production files, so no cycle).

- [ ] **Step 1: Write the failing test**

```ts
// tests/drive/watchErrors.test.ts
import { describe, expect, test } from "vitest";
import {
  classifyWatchError,
  redactWatchError,
  ESCALATION_THRESHOLD,
  STALE_PENDING_MAX_AGE_MS,
} from "@/lib/drive/watchErrors";
import { DriveWatchInfraError } from "@/lib/drive/watch";

describe("classifyWatchError", () => {
  test("DriveWatchInfraError (kind marker) → db", () => {
    expect(classifyWatchError(new DriveWatchInfraError("op", new Error("x")))).toBe("db");
  });
  test("DRIVE_WEBHOOK_BASE_URL throw → config", () => {
    expect(
      classifyWatchError(new Error("DRIVE_WEBHOOK_BASE_URL is required for Drive watch subscriptions")),
    ).toBe("config");
  });
  test("invalid_grant / default-credentials / GOOGLE_SERVICE_ACCOUNT_JSON → config", () => {
    expect(classifyWatchError(new Error("invalid_grant: account not found"))).toBe("config");
    expect(classifyWatchError(new Error("Could not load the default credentials"))).toBe("config");
    expect(classifyWatchError(new Error("GOOGLE_SERVICE_ACCOUNT_JSON is unset"))).toBe("config");
  });
  test("Drive HTTP / malformed-watch errors → drive_api", () => {
    expect(classifyWatchError(new Error("Drive files.watch response missing id/resourceId/expiration"))).toBe("drive_api");
    expect(classifyWatchError(new Error("Request failed with status code 500"))).toBe("drive_api");
  });
  test("total over unknown: string, undefined, null → drive_api (never throws)", () => {
    expect(classifyWatchError("boom")).toBe("drive_api");
    expect(classifyWatchError(undefined)).toBe("drive_api");
    expect(classifyWatchError(null)).toBe("drive_api");
  });
});

describe("redactWatchError", () => {
  // Failure mode caught: webhook secret / Bearer token leaking into admin-visible
  // alert context and durable app_events (the GEAR PII-leak class; spec §3.1.3, R2-6/R5-1).
  const SECRET = "0a9d3d1c-5c1e-4a58-9f4a-secret-value";
  test("scrubs the literal webhook secret and Bearer tokens, keeps diagnostics", () => {
    const msg = `Invalid token=${SECRET} while POST with Authorization: Bearer ya29.abc.def failed: DRIVE_WEBHOOK_BASE_URL is required`;
    const out = redactWatchError(msg, { webhookSecret: SECRET });
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain("ya29.abc.def");
    expect(out).toContain("DRIVE_WEBHOOK_BASE_URL is required");
  });
  test("scrubs key/secret/authorization pairs", () => {
    const out = redactWatchError("secret: shh123 key=abc authorization: xyz");
    expect(out).not.toContain("shh123");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("xyz");
  });
  test("truncates to 300 chars AFTER redaction", () => {
    const long = `token=leak-me ${"x".repeat(400)}`;
    const out = redactWatchError(long);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).not.toContain("leak-me");
  });
});

describe("constants", () => {
  test("single source of truth values (spec §2)", () => {
    expect(ESCALATION_THRESHOLD).toBe(3);
    expect(STALE_PENDING_MAX_AGE_MS).toBe(3_600_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/drive/watchErrors.test.ts`
Expected: FAIL — `Cannot find module '@/lib/drive/watchErrors'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/drive/watchErrors.ts
//
// Pure helpers for the watch-channel health feature (spec §2, §3.1).
// MUST stay import-free of lib/drive/watch.ts (watch.ts imports this module).

export type WatchErrorClass = "config" | "drive_api" | "db";

// Spec §2 named constants — the single definition; tests and consumers import these.
export const ESCALATION_THRESHOLD = 3;
export const STALE_PENDING_MAX_AGE_MS = 3_600_000;

const CONFIG_PATTERNS = [
  /DRIVE_WEBHOOK_BASE_URL is required/i,
  /invalid_grant/i,
  /could not load the default credentials/i,
  /GOOGLE_SERVICE_ACCOUNT_JSON/i,
];

// Structural check instead of instanceof to avoid a watch.ts import cycle;
// DriveWatchInfraError carries kind = "drive_watch_infra_error" (watch.ts:10-22).
function isDriveWatchInfraError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { kind?: unknown }).kind === "drive_watch_infra_error"
  );
}

export function classifyWatchError(err: unknown): WatchErrorClass {
  if (isDriveWatchInfraError(err)) return "db";
  const message = String((err as { message?: unknown })?.message ?? err);
  if (CONFIG_PATTERNS.some((re) => re.test(message))) return "config";
  return "drive_api";
}

// Spec §3.1.3 redaction contract: (a) literal webhook secret, (b) Bearer runs +
// token/key/secret/authorization pair values, (c) truncate LAST.
export function redactWatchError(
  message: string,
  secrets: { webhookSecret?: string } = {},
): string {
  let out = message;
  if (secrets.webhookSecret) out = out.split(secrets.webhookSecret).join("[redacted]");
  out = out.replace(/Bearer\s+\S+/g, "Bearer [redacted]");
  out = out.replace(/\b(token|key|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return out.slice(0, 300);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/drive/watchErrors.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add lib/drive/watchErrors.ts tests/drive/watchErrors.test.ts
git commit --no-verify -m "feat(sync): watch error classification + redaction primitives"
```

---

### Task 2: Error capture in `subscribeToWatchedFolder`

**Files:**
- Modify: `lib/drive/watch.ts` (`SubscribeResult` :52-54; the two catch branches :383-408)
- Test: `tests/drive/watch.test.ts` (extend existing tests at :133 and :199)

**Interfaces:**
- Consumes: Task 1's `classifyWatchError`, `redactWatchError`.
- Produces: `SubscribeResult = { outcome: "active"; channelId: string } | { outcome: "orphaned"; channelId: string; reason: "watch_create_failed" | "activate_failed_after_watch_created" }`. Alert context gains `error_class` + `error_message` on every producer path. Tasks 3, 6, 9 consume `result.reason`.

- [ ] **Step 1: Write the failing tests** — extend the two existing orphan tests in `tests/drive/watch.test.ts` (the `FakeWatchTx.alerts` array already captures context):

```ts
// Inside the existing "watch creation failure leaves orphaned row..." test body, after
// the current assertions, ADD (the existing deps.watchFolder mock must reject with
// an Error whose message embeds the webhook secret to exercise redaction):
//   deps.watchFolder = vi.fn().mockRejectedValue(
//     new Error(`files.watch failed: token=${capturedSecret} Bearer ya29.zzz`));
const alert = tx.alerts[0]!;
expect(alert.context.reason).toBe("watch_create_failed");
expect(alert.context.error_class).toBe("drive_api");
expect(String(alert.context.error_message)).not.toContain(capturedSecret);
expect(String(alert.context.error_message)).not.toContain("ya29.zzz");
expect(result).toEqual({
  outcome: "orphaned",
  channelId: expect.any(String),
  reason: "watch_create_failed",
});

// New sibling test: the log sink is redacted (spec §3.1.4 / §4.1 — the R5-1 durable-log
// leak class). Failure mode: implementation adds error: err or passes the unredacted
// message; both would persist the webhook secret to app_events.
// Top of file: vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
// import { log } from "@/lib/log";
test("subscribe failure log payload is redacted and carries no raw error object", async () => {
  const tx = new FakeWatchTx();
  const secret = "sec-leak-1";
  await subscribeToWatchedFolder("folder-1", {
    tx,
    uuid: () => "chan-1",
    webhookSecret: () => secret,
    watchFolder: () => Promise.reject(new Error(`files.watch failed token=${secret} Bearer ya29.zzz`)),
  });
  const [message, fields] = (log.error as ReturnType<typeof vi.fn>).mock.calls[0]!;
  expect(message).toBe("drive watch subscribe failed");
  expect(fields).not.toHaveProperty("error");
  const flat = JSON.stringify(fields);
  expect(flat).not.toContain(secret);
  expect(flat).not.toContain("ya29.zzz");
  expect(fields.errorMessage).toContain("files.watch failed");
  expect(fields.errorClass).toBe("drive_api");
});

// New sibling test: config-class error classification flows into context
test("DRIVE_WEBHOOK_BASE_URL config error is classified config in the orphan alert", async () => {
  const tx = new FakeWatchTx();
  const result = await subscribeToWatchedFolder("folder-1", {
    tx,
    uuid: () => "chan-1",
    webhookSecret: () => "sec-1",
    watchFolder: () => Promise.reject(new Error("DRIVE_WEBHOOK_BASE_URL is required for Drive watch subscriptions")),
  });
  expect(result.outcome).toBe("orphaned");
  expect(tx.alerts[0]!.context.error_class).toBe("config");
  expect(tx.alerts[0]!.context.error_message).toContain("DRIVE_WEBHOOK_BASE_URL is required");
});

// In the existing "activation failure..." test (:199): assert
// reason === "activate_failed_after_watch_created" on both context and result,
// and error_class === "db" when the activate throw is a DriveWatchInfraError.
```

- [ ] **Step 2: Run to verify the new assertions fail**

Run: `pnpm vitest run tests/drive/watch.test.ts`
Expected: FAIL — `reason`/`error_class` undefined on result and context

- [ ] **Step 3: Implement** in `lib/drive/watch.ts`:

```ts
// top of file
import { classifyWatchError, redactWatchError } from "@/lib/drive/watchErrors";
import { log } from "@/lib/log";

// SubscribeResult (replaces :52-54)
export type SubscribeOrphanReason = "watch_create_failed" | "activate_failed_after_watch_created";
export type SubscribeResult =
  | { outcome: "active"; channelId: string }
  | { outcome: "orphaned"; channelId: string; reason: SubscribeOrphanReason };

// catch #1 (replaces the bare catch at :383-392)
  } catch (err) {
    const errorClass = classifyWatchError(err);
    const errorMessage = redactWatchError(
      String((err as { message?: unknown })?.message ?? err),
      { webhookSecret },
    );
    await runTx((tx) =>
      markWatchOrphanedWithTx(tx, channelId, {
        watched_folder_id: folderId,
        channel_id: channelId,
        reason: "watch_create_failed",
        error_class: errorClass,
        error_message: errorMessage,
      }),
    );
    await log.error("drive watch subscribe failed", {
      source: "drive.watch",
      errorMessage,
      watchedFolderId: folderId,
      channelId,
      errorClass,
    });
    return { outcome: "orphaned", channelId, reason: "watch_create_failed" };
  }

// catch #2 (replaces :396-408) — same shape, reason "activate_failed_after_watch_created",
// keeps the existing extra context keys (requested_channel_id, resource_id, expiration),
// returns { outcome: "orphaned", channelId: watch.id, reason: "activate_failed_after_watch_created" }.
```

Constraint check (spec §3.1.4 / R5-1): the log call carries `errorMessage` (redacted string) — NEVER `error: err`. No `code:` field.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/drive/watch.test.ts tests/drive/watchErrors.test.ts`
Expected: PASS. Also run `pnpm typecheck` — existing `SubscribeResult` consumers (`finalize-cas` deps typed `Promise<unknown>`; refresh loop) must still compile.

- [ ] **Step 5: Commit**

```bash
git add lib/drive/watch.ts tests/drive/watch.test.ts
git commit --no-verify -m "feat(sync): classify, redact, and log watch subscribe failures; SubscribeResult carries orphan reason"
```

---

### Task 3: `refreshWatchSubscriptions` typed failure channels

**Files:**
- Modify: `lib/drive/watch.ts:411-430` (`refreshWatchSubscriptions`)
- Modify: `tests/sync/_metaInfraContract.test.ts:778-789` (rewrite the existing row: "DB-port throw → rejects with DriveWatchInfraError" becomes "DB-port throw → typed `failures` entry; function never rejects" — follow the file's own registry row format)
- Test: `tests/drive/watch.test.ts` (modify :244-336 refresh tests; add per-row isolation + classification tests)

**Interfaces:**
- Produces: `export type RefreshResult = { refreshed: string[]; orphaned: string[]; failures: Array<{ folderId: string; operation: string }> }`; `refreshWatchSubscriptions(deps?: RefreshDeps): Promise<RefreshResult>`. `RefreshDeps` unchanged (`watch.ts:68-73`). Task 6's condition (b) and Task 7's route consume all three channels.

- [ ] **Step 1: Write failing tests** (spec §3.2 Hardening; failure modes: one bad folder aborting the loop; activate-failure hiding as handled degradation — R9-1; list failure rejecting — R5-3):

```ts
test("refresh isolates per-row failures and classifies by orphan reason", async () => {
  const tx = new FakeWatchTx();
  // three due rows: folder-a (subscribe → active), folder-b (orphaned watch_create_failed),
  // folder-c (orphaned activate_failed_after_watch_created), folder-d (throws DriveWatchInfraError)
  seedActiveExpiring(tx, ["folder-a", "folder-b", "folder-c", "folder-d"]);
  const subscribe = vi.fn(async (folderId: string) => {
    if (folderId === "folder-a") return { outcome: "active", channelId: "a" } as const;
    if (folderId === "folder-b") return { outcome: "orphaned", channelId: "b", reason: "watch_create_failed" } as const;
    if (folderId === "folder-c") return { outcome: "orphaned", channelId: "c", reason: "activate_failed_after_watch_created" } as const;
    throw new DriveWatchInfraError("drive_watch_channels.insert_pending", new Error("db down"));
  });
  const result = await refreshWatchSubscriptions({ tx, subscribeToWatchedFolder: subscribe });
  expect(subscribe).toHaveBeenCalledTimes(4); // folder-d's throw did NOT abort the loop... order: a,b,c,d
  expect(result.refreshed).toEqual(["folder-a"]);
  expect(result.orphaned).toEqual(["folder-b"]);
  expect(result.failures).toEqual([
    { folderId: "folder-c", operation: "activate_pending" },
    { folderId: "folder-d", operation: "subscribe" },
  ]);
});

test("refresh catches a list_expiring DB failure into the typed failures channel (never rejects)", async () => {
  const tx = new FakeWatchTx();
  tx.listExpiringActive = async () => { throw new Error("connection refused"); };
  const result = await refreshWatchSubscriptions({ tx });
  expect(result).toEqual({ refreshed: [], orphaned: [], failures: [{ folderId: "*", operation: "list_expiring" }] });
});
```

(`seedActiveExpiring` = local helper pushing active rows with near-expiry `expiresAt` into `tx.rows`, derived from `tx.now`.)

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/drive/watch.test.ts` → FAIL (`orphaned`/`failures` missing; second test rejects).

- [ ] **Step 3: Implement** (replaces `refreshWatchSubscriptions` body):

```ts
export type RefreshResult = {
  refreshed: string[];
  orphaned: string[];
  failures: Array<{ folderId: string; operation: string }>;
};

export async function refreshWatchSubscriptions(deps: RefreshDeps = {}): Promise<RefreshResult> {
  const runTx = watchTxRunner(deps);
  const now = deps.now ?? (() => new Date());
  const refreshed: string[] = [];
  const orphaned: string[] = [];
  const failures: Array<{ folderId: string; operation: string }> = [];

  let due: WatchChannelRow[];
  try {
    const threshold = new Date(now().getTime() + 24 * 60 * 60 * 1000).toISOString();
    due = await runTx((tx) =>
      callWatchTx("drive_watch_channels.list_expiring_active", () => tx.listExpiringActive(threshold)),
    );
  } catch (err) {
    await log.error("refresh-watch list_expiring failed", {
      source: "drive.watch",
      errorMessage: redactWatchError(String((err as { message?: unknown })?.message ?? err)),
    });
    return { refreshed: [], orphaned: [], failures: [{ folderId: "*", operation: "list_expiring" }] };
  }

  const subscribe =
    deps.subscribeToWatchedFolder ?? ((folderId: string) => subscribeToWatchedFolder(folderId));
  for (const row of due) {
    try {
      const result = await subscribe(row.watchedFolderId);
      if (result.outcome === "active") refreshed.push(row.watchedFolderId);
      else if (result.reason === "activate_failed_after_watch_created")
        failures.push({ folderId: row.watchedFolderId, operation: "activate_pending" });
      else orphaned.push(row.watchedFolderId);
    } catch (err) {
      failures.push({ folderId: row.watchedFolderId, operation: "subscribe" });
      await log.error("refresh-watch renewal failed", {
        source: "drive.watch",
        errorMessage: redactWatchError(String((err as { message?: unknown })?.message ?? err)),
        watchedFolderId: row.watchedFolderId,
      });
    }
  }
  return { refreshed, orphaned, failures };
}
```

- [ ] **Step 4: Rewrite the meta-test row** at `tests/sync/_metaInfraContract.test.ts:778-789` to the never-rejects contract (spec §3.2 Hardening, R5-3): the row's behavioral assertion becomes "DB-port throw → resolved `RefreshResult` with `failures: [{ folderId: '*', operation: 'list_expiring' }]`, not a rejection". Keep the file's existing row/assertion format.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/drive/watch.test.ts tests/sync/_metaInfraContract.test.ts && pnpm typecheck`
Expected: PASS. (`app/api/cron/refresh-watch/route.ts` still compiles — `result.refreshed` still exists; route is rewritten in Task 7.)

- [ ] **Step 6: Commit**

```bash
git add lib/drive/watch.ts tests/drive/watch.test.ts tests/sync/_metaInfraContract.test.ts
git commit --no-verify -m "feat(sync): refresh returns typed refreshed/orphaned/failures channels; per-row isolation"
```

---

### Task 4: `persistAppEventStrict`

**Files:**
- Modify: `lib/log/persist.ts` (add the strict sibling; the best-effort `persistAppEvent` is untouched)
- Test: `tests/log/persistStrict.test.ts` (create)

**Interfaces:**
- Produces: `export type StrictAppEvent = { level: LogLevel; source: string; message: string; context: Record<string, unknown>; code?: string | null; requestId?: string | null; showId?: string | null; driveFileId?: string | null; actorHash?: string | null }` and `persistAppEventStrict(record: StrictAppEvent): Promise<{ ok: true } | { ok: false; error: unknown }>` — failure-visible insert into `app_events`. The input type is deliberately NARROWER than `LogRecord` (`lib/log/types.ts:16-25` makes `code`/`requestId`/`showId`/`driveFileId`/`actorHash` required — forcing guard callers to spell out five nulls is noise; the insert coalesces the optional fields to `null`). Task 5 consumes it. Lives in `lib/log/persist.ts` because `tests/log/_metaAppEventsWriter.test.ts:29` pins that file as the SOLE `app_events` insert site (spec §3.2.5 guard write contract, R3-1).

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/persistStrict.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ from: () => ({ insert: insertMock }) }),
}));
import { persistAppEventStrict } from "@/lib/log/persist";

const RECORD = {
  level: "info" as const,
  source: "drive.watch.escalation",
  message: "watch escalation fired",
  context: { alertId: "a-1", errorClass: "config", occurrenceCount: 1 },
};

beforeEach(() => insertMock.mockReset());

describe("persistAppEventStrict", () => {
  // Failure mode caught: best-effort log.* swallowing a guard-write failure →
  // duplicate escalation (spec R1-1); silent throw path (invariant 9).
  test("returns ok on clean insert and passes NOT-NULL columns", async () => {
    insertMock.mockResolvedValue({ error: null });
    const result = await persistAppEventStrict(RECORD);
    expect(result).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: "info", source: "drive.watch.escalation", message: "watch escalation fired" }),
    );
  });
  test("returned error → { ok: false, error }", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    expect((await persistAppEventStrict(RECORD)).ok).toBe(false);
  });
  test("thrown error → { ok: false, error } (never throws)", async () => {
    insertMock.mockRejectedValue(new Error("net down"));
    expect((await persistAppEventStrict(RECORD)).ok).toBe(false);
  });
  test("sanitizes context through the logger chokepoint (emails redacted)", async () => {
    // Failure mode: strict writer bypassing buildRecord's sanitizeContext →
    // unsanitized PII persisting to app_events (spec §3.2.5 "same sanitization path").
    insertMock.mockResolvedValue({ error: null });
    await persistAppEventStrict({ ...RECORD, context: { alertId: "a-1", note: "reach doug@example.com" } });
    const inserted = insertMock.mock.calls[0]![0] as { context: Record<string, unknown> };
    expect(JSON.stringify(inserted.context)).not.toContain("doug@example.com");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/log/persistStrict.test.ts` → FAIL (`persistAppEventStrict` not exported).

- [ ] **Step 3: Implement** (append to `lib/log/persist.ts`; add `import { sanitizeContext } from "./sanitize";` — signature `sanitizeContext(message, context)` returning `{ message, context }`, the same call `buildRecord` makes at `lib/log/logger.ts:36`):

```ts
// Failure-visible sibling of persistAppEvent for callers that need a durable,
// checkable write (watch-escalation fired-once guard, spec §3.2.5). Same sole-writer
// file per tests/log/_metaAppEventsWriter.test.ts. Registered in
// tests/sync/_metaInfraContract.test.ts (invariant 9) — unlike the best-effort
// sibling above, this one surfaces the error. Input is narrower than LogRecord:
// guard callers have no request/show/actor context.
export type StrictAppEvent = {
  level: LogRecord["level"];
  source: string;
  message: string;
  context: Record<string, unknown>;
  code?: string | null;
  requestId?: string | null;
  showId?: string | null;
  driveFileId?: string | null;
  actorHash?: string | null;
};

export async function persistAppEventStrict(
  record: StrictAppEvent,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    // Same sanitization chokepoint as the logger path (spec §3.2.5): buildRecord
    // runs sanitizeContext before persistAppEvent; this writer bypasses buildRecord,
    // so it must sanitize itself.
    const { message, context } = sanitizeContext(record.message, record.context);
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("app_events").insert({
      level: record.level,
      source: record.source,
      message,
      code: record.code ?? null,
      request_id: record.requestId ?? null,
      show_id: record.showId ?? null,
      drive_file_id: record.driveFileId ?? null,
      actor_hash: record.actorHash ?? null,
      context,
    });
    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}
```

- [ ] **Step 4: Run tests** — `pnpm vitest run tests/log/persistStrict.test.ts tests/log/_metaAppEventsWriter.test.ts` → PASS (writer guard still sees only persist.ts inserts).

- [ ] **Step 5: Commit**

```bash
git add lib/log/persist.ts tests/log/persistStrict.test.ts
git commit --no-verify -m "feat(sync): persistAppEventStrict failure-visible app_events writer"
```

---

### Task 5: `watchEscalation.ts` — fired-once escalation

**Files:**
- Create: `lib/drive/watchEscalation.ts`
- Test: `tests/drive/watchEscalation.test.ts`
- Modify: `tests/sync/_metaInfraContract.test.ts` (registry rows for the alert-row read, guard read, and `persistAppEventStrict` — mirror the file's row format)

**Interfaces:**
- Consumes: `ESCALATION_THRESHOLD` (Task 1), `persistAppEventStrict` (Task 4), `sendEmail` (`lib/notify/send.ts:28`), `baseKey` (`lib/notify/idempotencyKey.ts:5-7`), `configValid` (`lib/notify/config.ts:6`), `getAlertOnSyncProblems` (`lib/appSettings/getAlertOnSyncProblems.ts:12`), `activeRecipients` (`lib/notify/recipients.ts:13`), `escapeHtml` (`lib/notify/templates/escapeHtml.ts:10`), `@sentry/nextjs`.
- Produces: `maybeEscalateWatchOrphaned(input: { folderId: string; folderName: string | null }, deps?: EscalationDeps): Promise<{ escalated: boolean; faults: string[] }>` — Task 6 calls it on every unhealthy outcome. All deps injectable for tests.

Step order is LOAD-BEARING (spec §3.2.5, R6-1): trigger read → due? → guard read → **recheck → guard write → sends**. A recheck/guard fault aborts BEFORE anything is consumed.

- [ ] **Step 1: Write the failing tests** (each names its failure mode):

```ts
// tests/drive/watchEscalation.test.ts
import { describe, expect, test, vi } from "vitest";
import { maybeEscalateWatchOrphaned } from "@/lib/drive/watchEscalation";
import { ESCALATION_THRESHOLD } from "@/lib/drive/watchErrors";

const ALERT = (over: Partial<{ id: string; occurrence_count: number; context: Record<string, unknown> }> = {}) => ({
  id: "alert-1",
  occurrence_count: ESCALATION_THRESHOLD,
  context: { error_class: "drive_api" },
  ...over,
});

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    readUnresolvedWatchAlert: vi.fn().mockResolvedValue(ALERT()),
    hasEscalationFired: vi.fn().mockResolvedValue(false),
    persistAppEventStrict: vi.fn().mockResolvedValue({ ok: true }),
    captureException: vi.fn(),
    configValid: vi.fn().mockReturnValue({ ok: true }),
    getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "value", enabled: true }),
    activeRecipients: vi.fn().mockResolvedValue({ kind: "ok", recipients: ["a@x.com", "b@x.com"] }),
    sendEmail: vi.fn().mockResolvedValue({ ok: true, messageId: "m1" }),
    ...over,
  };
}

describe("maybeEscalateWatchOrphaned", () => {
  test("below threshold, non-config → no escalation, no reads consumed", async () => {
    const deps = makeDeps({ readUnresolvedWatchAlert: vi.fn().mockResolvedValue(ALERT({ occurrence_count: ESCALATION_THRESHOLD - 1 })) });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r).toEqual({ escalated: false, faults: [] });
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
  });
  test("config class escalates at count 1", async () => {
    const deps = makeDeps({ readUnresolvedWatchAlert: vi.fn().mockResolvedValue(ALERT({ occurrence_count: 1, context: { error_class: "config" } })) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps)).escalated).toBe(true);
  });
  test("existing guard row → zero sends, zero guard writes (fired-once across restarts)", async () => {
    const deps = makeDeps({ hasEscalationFired: vi.fn().mockResolvedValue(true) });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r.escalated).toBe(false);
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  test("still fires above threshold when no guard exists (multi-bump robustness)", async () => {
    const deps = makeDeps({ readUnresolvedWatchAlert: vi.fn().mockResolvedValue(ALERT({ occurrence_count: ESCALATION_THRESHOLD + 4 })) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps)).escalated).toBe(true);
  });
  test("R6-1: recheck read failure aborts BEFORE the guard write; retryable next cycle", async () => {
    // recheck = second readUnresolvedWatchAlert call
    const read = vi.fn()
      .mockResolvedValueOnce(ALERT())
      .mockResolvedValueOnce("infra_error" as const);
    const deps = makeDeps({ readUnresolvedWatchAlert: read });
    const r1 = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r1).toEqual({ escalated: false, faults: ["alert_row_read"] });
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    // cycle 2: recheck succeeds → full fire (two-cycle retryability, spec §4.4)
    const deps2 = makeDeps();
    const r2 = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps2);
    expect(r2.escalated).toBe(true);
    expect(deps2.persistAppEventStrict).toHaveBeenCalledTimes(1);
    expect(deps2.sendEmail).toHaveBeenCalledTimes(2);
  });
  test("R5-2: alert resolved at recheck → benign abort, no guard, no sends, no fault", async () => {
    const read = vi.fn().mockResolvedValueOnce(ALERT()).mockResolvedValueOnce(null);
    const deps = makeDeps({ readUnresolvedWatchAlert: read });
    expect(await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps)).toEqual({ escalated: false, faults: [] });
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
  });
  test("guard write failure → guard_write fault, zero sends", async () => {
    const deps = makeDeps({ persistAppEventStrict: vi.fn().mockResolvedValue({ ok: false, error: "x" }) });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r).toEqual({ escalated: false, faults: ["guard_write"] });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  test("Sentry throwing never breaks the cycle", async () => {
    const deps = makeDeps({ captureException: vi.fn(() => { throw new Error("sentry down"); }) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps)).escalated).toBe(true);
  });
  test("configValid false → deliberate email skip, not a fault; Sentry still fired; pref NOT read (gate order)", async () => {
    // R1(plan)-4 failure mode: with Resend unconfigured AND the pref read faulting,
    // a wrong gate order emits a false pref_read infra fault.
    const deps = makeDeps({
      configValid: vi.fn().mockReturnValue({ ok: false, reason: "unconfigured" }),
      getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "infra_error" }),
    });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r).toEqual({ escalated: true, faults: [] });
    expect(deps.captureException).toHaveBeenCalled();
    expect(deps.getAlertOnSyncProblems).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  test("pref off → skip; pref infra_error → pref_read fault, no fail-open", async () => {
    const off = makeDeps({ getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "value", enabled: false }) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, off)).faults).toEqual([]);
    expect(off.sendEmail).not.toHaveBeenCalled();
    const infra = makeDeps({ getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "infra_error" }) });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, infra);
    expect(r.faults).toEqual(["pref_read"]);
    expect(infra.sendEmail).not.toHaveBeenCalled();
  });
  test("R3-3: recipients infra_error → recipients_read fault; zero recipients → benign skip", async () => {
    const infra = makeDeps({ activeRecipients: vi.fn().mockResolvedValue({ kind: "infra_error" }) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, infra)).faults).toEqual(["recipients_read"]);
    const empty = makeDeps({ activeRecipients: vi.fn().mockResolvedValue({ kind: "ok", recipients: [] }) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, empty)).faults).toEqual([]);
  });
  test("sendEmail mapping: retry_later benign; conflict/infra → email_send fault (once)", async () => {
    const retry = makeDeps({ sendEmail: vi.fn().mockResolvedValue({ ok: "retry_later" }) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, retry)).faults).toEqual([]);
    const bad = makeDeps({ sendEmail: vi.fn().mockResolvedValue({ ok: false, kind: "infra_error", message: "x" }) });
    expect((await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, bad)).faults).toEqual(["email_send"]);
  });
  test("idempotency key derives from alert row id + recipient", async () => {
    const deps = makeDeps();
    await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    const call = (deps.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.idempotencyKey).toMatch(/^fxav:watch_escalation:/);
    expect(call.subject).toBe("FXAV: the live-updates connection needs attention (F)");
    expect((deps.captureException as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toMatchObject({
      extra: { watchedFolderId: "folder-1" },
    });
  });
});
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/drive/watchEscalation.ts
//
// Fired-once dev escalation for WATCH_CHANNEL_ORPHANED (spec §3.2.5, §3.3).
// Order is load-bearing: trigger read → due? → guard read → RECHECK → GUARD WRITE →
// SENDS (Sentry → email). Faults abort before anything is consumed.
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { ESCALATION_THRESHOLD } from "@/lib/drive/watchErrors";
import { persistAppEventStrict } from "@/lib/log/persist";
import { sendEmail as defaultSendEmail } from "@/lib/notify/send";
import { baseKey } from "@/lib/notify/idempotencyKey";
import { configValid as defaultConfigValid } from "@/lib/notify/config";
import { getAlertOnSyncProblems as defaultGetPref } from "@/lib/appSettings/getAlertOnSyncProblems";
import { activeRecipients as defaultActiveRecipients } from "@/lib/notify/recipients";
import { escapeHtml } from "@/lib/notify/templates/escapeHtml";

export const ESCALATION_EVENT_SOURCE = "drive.watch.escalation";

export type WatchAlertRow = {
  id: string;
  occurrence_count: number;
  context: Record<string, unknown> | null;
};

// Registered Supabase call boundary (tests/sync/_metaInfraContract.test.ts):
// returns the row, null when no unresolved alert, or "infra_error".
export async function readUnresolvedWatchAlert(): Promise<WatchAlertRow | null | "infra_error"> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("id, occurrence_count, context")
      .eq("code", "WATCH_CHANNEL_ORPHANED")
      .is("show_id", null)
      .is("resolved_at", null)
      .maybeSingle();
    if (error) return "infra_error";
    return (data as WatchAlertRow | null) ?? null;
  } catch {
    return "infra_error";
  }
}

// Registered Supabase call boundary: guard-row existence check.
export async function hasEscalationFired(alertId: string): Promise<boolean | "infra_error"> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_events")
      .select("id")
      .eq("source", ESCALATION_EVENT_SOURCE)
      .eq("context->>alertId", alertId)
      .limit(1);
    if (error) return "infra_error";
    return (data ?? []).length > 0;
  } catch {
    return "infra_error";
  }
}

function emailCopy(folderName: string | null, errorClass: string, errorMessage: string) {
  const name = folderName ?? "your Drive folder";
  const subject = `FXAV: the live-updates connection needs attention (${name})`;
  const text = [
    `The connection that makes sheet edits show up instantly is having trouble for "${name}". It couldn't be set up or renewed.`,
    `Your shows still sync on the normal schedule, so nothing is lost — at worst, edits take a few minutes to appear.`,
    `FXAV retries the connection automatically every hour. An admin can also retry immediately: open the dashboard banner or Settings → Drive connection and use "Retry now".`,
    `Technical detail (for support): ${errorClass}: ${errorMessage}`,
  ].join("\n\n");
  const html = [
    `<p>The connection that makes sheet edits show up instantly is having trouble for "<strong>${escapeHtml(name)}</strong>". It couldn't be set up or renewed.</p>`,
    `<p>Your shows still sync on the normal schedule, so nothing is lost — at worst, edits take a few minutes to appear.</p>`,
    `<p>FXAV retries the connection automatically every hour. An admin can also retry immediately: open the dashboard banner or Settings → Drive connection and use "Retry now".</p>`,
    `<p>Technical detail (for support): <code>${escapeHtml(errorClass)}: ${escapeHtml(errorMessage)}</code></p>`,
  ].join("\n");
  return { subject, text, html };
}

export type EscalationDeps = {
  readUnresolvedWatchAlert?: typeof readUnresolvedWatchAlert;
  hasEscalationFired?: typeof hasEscalationFired;
  persistAppEventStrict?: typeof persistAppEventStrict;
  captureException?: (err: unknown, ctx?: Record<string, unknown>) => void;
  configValid?: typeof defaultConfigValid;
  getAlertOnSyncProblems?: typeof defaultGetPref;
  activeRecipients?: typeof defaultActiveRecipients;
  sendEmail?: typeof defaultSendEmail;
};

export async function maybeEscalateWatchOrphaned(
  input: { folderId: string; folderName: string | null },
  deps: EscalationDeps = {},
): Promise<{ escalated: boolean; faults: string[] }> {
  const faults: string[] = [];
  const readAlert = deps.readUnresolvedWatchAlert ?? readUnresolvedWatchAlert;

  // (i) trigger read
  const alert = await readAlert();
  if (alert === "infra_error") return { escalated: false, faults: ["alert_row_read"] };
  if (alert === null) return { escalated: false, faults: [] };
  const errorClass = String(alert.context?.error_class ?? "drive_api");
  const due = alert.occurrence_count >= ESCALATION_THRESHOLD || errorClass === "config";
  if (!due) return { escalated: false, faults: [] };

  // guard read — fired once per alert-row lifetime (60-day retention window)
  const fired = await (deps.hasEscalationFired ?? hasEscalationFired)(alert.id);
  if (fired === "infra_error") return { escalated: false, faults: ["guard_read"] };
  if (fired) return { escalated: false, faults: [] };

  // (ii) recheck — R5-2/R6-1: abort BEFORE the guard if resolved meanwhile
  const recheck = await readAlert();
  if (recheck === "infra_error") return { escalated: false, faults: ["alert_row_read"] };
  if (recheck === null || recheck.id !== alert.id) return { escalated: false, faults: [] };

  // (iii) guard write — fail-closed for duplication
  const guard = await (deps.persistAppEventStrict ?? persistAppEventStrict)({
    level: "info",
    source: ESCALATION_EVENT_SOURCE,
    message: "watch escalation fired",
    context: { alertId: alert.id, errorClass, occurrenceCount: alert.occurrence_count, watchedFolderId: input.folderId },
  });
  if (!guard.ok) return { escalated: false, faults: ["guard_write"] };

  // (iv) sends — Sentry first (never faults), then gated email
  try {
    (deps.captureException ?? Sentry.captureException)(
      new Error("WATCH_CHANNEL_ORPHANED escalated"),
      { tags: { errorClass }, extra: { occurrenceCount: alert.occurrence_count, watchedFolderId: input.folderId } },
    );
  } catch {
    // Sentry is a notification channel, not the durable record (spec §3.3).
  }

  // Gate 1 FIRST — configValid (spec §3.3.2): unconfigured email is a deliberate
  // skip, and it must short-circuit BEFORE the pref read so "Resend unset +
  // transient pref fault" never surfaces as a scheduler-visible infra failure.
  if (!(deps.configValid ?? defaultConfigValid)().ok) return { escalated: true, faults };

  // Gate 2 — the alert_on_sync_problems pref; infra_error → fault, never fail-open.
  const pref = await (deps.getAlertOnSyncProblems ?? defaultGetPref)();
  if (pref.kind === "infra_error") return { escalated: true, faults: ["pref_read"] };
  if (!pref.enabled) return { escalated: true, faults };

  const recipients = await (deps.activeRecipients ?? defaultActiveRecipients)();
  if (recipients.kind === "infra_error") return { escalated: true, faults: ["recipients_read"] };

  const errorMessage = String(alert.context?.error_message ?? "(no detail captured)");
  const copy = emailCopy(input.folderName, errorClass, errorMessage);
  let emailFault = false;
  for (const recipient of recipients.recipients) {
    const result = await (deps.sendEmail ?? defaultSendEmail)({
      to: recipient,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
      idempotencyKey: baseKey("watch_escalation", alert.id, recipient),
    });
    if (result.ok === false) emailFault = true; // retry_later ("retry_later") is benign
  }
  if (emailFault) faults.push("email_send");
  return { escalated: true, faults };
}
```

(Check `configValid`'s exact return shape at `lib/notify/config.ts:6-12` — it returns a `ConfigResult` with `.ok`; adjust the call if the shape differs.)

- [ ] **Step 4: Run tests** — `pnpm vitest run tests/drive/watchEscalation.test.ts` → PASS.

- [ ] **Step 5: Add registry rows** in `tests/sync/_metaInfraContract.test.ts` for `readUnresolvedWatchAlert`, `hasEscalationFired` (both in `lib/drive/watchEscalation.ts`), and `persistAppEventStrict` (`lib/log/persist.ts`), following the file's existing row format; run that meta-test → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/drive/watchEscalation.ts tests/drive/watchEscalation.test.ts tests/sync/_metaInfraContract.test.ts
git commit --no-verify -m "feat(sync): fired-once watch escalation — guard-ordered Sentry + gated email"
```

---

### Task 6: `reconcileWatchChannels`

**Files:**
- Modify: `lib/drive/watch.ts` (two new `WatchTx` methods + `PostgresWatchTx` impls + `reconcileWatchChannels`)
- Test: `tests/drive/watch.test.ts` (extend `FakeWatchTx` with the two methods; new describe block)

**Interfaces:**
- Consumes: Task 3's `RefreshResult`; Task 5's `maybeEscalateWatchOrphaned`; `getActiveWatchedFolder` (`lib/appSettings/getWatchedFolderId.ts:43`, admin-registry-owned — no new registry row; behavioral coverage here maps its `infra_error` to the `folder_read` fault); `resolveAdminAlert` (`lib/adminAlerts/resolveAdminAlert.ts:11`); constants from Task 1.
- Produces (Task 7 consumes): `reconcileWatchChannels(refresh: RefreshResult, deps?: ReconcileDeps): Promise<ReconcileResult>` with `ReconcileResult = { outcome: "healthy" | "recovered" | "still_orphaned" | "renewal_failing" | "vacuous" | "infra_error"; sweptPending: number; escalated: boolean; faults: string[] }`.

New `WatchTx` methods (add to the interface at `watch.ts:33-50`, to `PostgresWatchTx`, and to the test `FakeWatchTx`):

```ts
sweepStalePending(cutoffIso: string): Promise<string[]>;
hasLiveActiveChannel(folderId: string, nowIso: string): Promise<boolean>;
```

`PostgresWatchTx` implementations:

```ts
async sweepStalePending(cutoffIso: string): Promise<string[]> {
  const rows = await this.rows<{ id: string }>(
    `
      update public.drive_watch_channels
         set status = 'orphaned'
       where status = 'pending' and created_at < $1::timestamptz
       returning id
    `,
    [cutoffIso],
  );
  return rows.map((r) => r.id);
}

async hasLiveActiveChannel(folderId: string, nowIso: string): Promise<boolean> {
  const rows = await this.rows<{ id: string }>(
    `
      select id from public.drive_watch_channels
       where watched_folder_id = $1 and status = 'active' and expires_at > $2::timestamptz
       limit 1
    `,
    [folderId, nowIso],
  );
  return rows.length > 0;
}
```

- [ ] **Step 1: Write the failing tests.** New describe block in `tests/drive/watch.test.ts`; `FakeWatchTx` gains in-memory `sweepStalePending` (flip pending rows older than cutoff, using a `createdAt` field added to `WatchRow` seeds) and `hasLiveActiveChannel`. Helper:

```ts
const NO_REFRESH = { refreshed: [], orphaned: [], failures: [] };
function reconcileDeps(tx: FakeWatchTx, over: Record<string, unknown> = {}) {
  return {
    tx,
    now: () => tx.now,
    getActiveWatchedFolder: vi.fn().mockResolvedValue({ folderId: "folder-1", folderName: "F" }),
    resolveAdminAlert: vi.fn().mockResolvedValue(undefined),
    maybeEscalateWatchOrphaned: vi.fn().mockResolvedValue({ escalated: false, faults: [] }),
    subscribeToWatchedFolder: vi.fn().mockResolvedValue({ outcome: "active", channelId: "c" }),
    ...over,
  };
}
```

Cases (each comment names the failure mode caught):

```ts
test("healthy: live channel + clean refresh → resolve + healthy", ...);
  // catches: status='active'-only class regressing; resolve not firing on recovery
test("vacuous: no folder → resolve stale alert, no subscribe", ...);
  // deps.getActiveWatchedFolder → { kind: "no_folder_configured" }
test("no live channel → exactly one subscribe; active → recovered + resolve", ...);
test("no live channel, subscribe orphaned watch_create_failed → still_orphaned, no resolve, escalation runs", ...);
test("no live channel, subscribe orphaned activate_failed → activate_write fault → infra_error outcome", ...);
test("R4-1/R10-1 renewal_failing (both legs): live channel BUT refresh.orphaned OR refresh.failures names the folder → renewal_failing, NO resolve, NO second subscribe, escalation runs", () => {
  // leg 1: refresh = { refreshed: [], orphaned: ["folder-1"], failures: [] }
  // leg 2: refresh = { refreshed: [], orphaned: [], failures: [{ folderId: "folder-1", operation: "activate_pending" }] }
  // assert deps.subscribeToWatchedFolder NOT called; deps.resolveAdminAlert NOT called;
  // deps.maybeEscalateWatchOrphaned called — catches: resolve-defeats-renewal-alert;
  // double-subscribe count distortion; never-escalates-on-renewal-failing (R9-2)
});
test("folder-switch: old folder's live channel does NOT satisfy the predicate", () => {
  // active channel rows for folder-OLD; configured folder folder-NEW → subscribe fires for folder-NEW
});
test("stale-pending sweep flips only rows older than STALE_PENDING_MAX_AGE_MS and writes ZERO alerts", () => {
  // seed pending rows at cutoff ± epsilon derived from the constant; assert tx.alerts unchanged
});
test("fault mapping: folder infra_error → folder_read; hasLiveActiveChannel throw → channel_read; resolve throw → alert_resolve_write; subscribe DriveWatchInfraError throw → subscribe_infra; sweep throw → pending_sweep; any fault → outcome infra_error", ...);
test("plan-R3-1: getActiveWatchedFolder THROWING (not returning infra_error) → folder_read fault, typed return, no throw out of reconcile", ...);
test("plan-R3-1: maybeEscalateWatchOrphaned THROWING → escalation_helper fault, typed return, no throw", ...);
test("plan-R3-2: thrown subscribe (subscribe_infra) still runs the escalation branch (deps.maybeEscalateWatchOrphaned called) — a down-and-unrecoverable watch is support-worthy", ...);
test("active subscribe + resolveAdminAlert throw → alert_resolve_write fault, outcome stays recovered-shaped, NO escalation call", () => {
  // plan-R2 finding 1: a successful re-subscribe followed by a resolve DB fault
  // must not send Sentry/email as if the channel were still broken.
  // deps.resolveAdminAlert rejects; assert deps.maybeEscalateWatchOrphaned NOT called;
  // result.faults contains "alert_resolve_write"; result.outcome === "infra_error"
  // (fault forces infra_error, but the escalation branch was never entered).
});
test("escalation faults propagate into reconcile faults", () => {
  // maybeEscalateWatchOrphaned → { escalated: true, faults: ["email_send"] } → outcome infra_error, escalated true
});
```

- [ ] **Step 2: Run to verify failure** — `reconcileWatchChannels` not exported.

- [ ] **Step 3: Implement** in `lib/drive/watch.ts`:

```ts
import { getActiveWatchedFolder as defaultGetActiveWatchedFolder } from "@/lib/appSettings/getWatchedFolderId";
import { resolveAdminAlert as defaultResolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { maybeEscalateWatchOrphaned as defaultMaybeEscalate } from "@/lib/drive/watchEscalation";
import { STALE_PENDING_MAX_AGE_MS } from "@/lib/drive/watchErrors";

export type ReconcileOutcome =
  | "healthy" | "recovered" | "still_orphaned" | "renewal_failing" | "vacuous" | "infra_error";
export type ReconcileResult = {
  outcome: ReconcileOutcome;
  sweptPending: number;
  escalated: boolean;
  faults: string[];
};
export type ReconcileDeps = {
  tx?: WatchTx;
  withTx?: <R>(fn: (tx: WatchTx) => Promise<R>) => Promise<R>;
  now?: () => Date;
  getActiveWatchedFolder?: typeof defaultGetActiveWatchedFolder;
  resolveAdminAlert?: typeof defaultResolveAdminAlert;
  maybeEscalateWatchOrphaned?: typeof defaultMaybeEscalate;
  subscribeToWatchedFolder?: (folderId: string) => Promise<SubscribeResult>;
};

export async function reconcileWatchChannels(
  refresh: RefreshResult,
  deps: ReconcileDeps = {},
): Promise<ReconcileResult> {
  const runTx = watchTxRunner(deps);
  const now = deps.now ?? (() => new Date());
  const faults: string[] = [];
  let sweptPending = 0;

  // 1. Stale-pending sweep — silent hygiene, ZERO admin_alerts writes (spec §3.2.1).
  try {
    const cutoff = new Date(now().getTime() - STALE_PENDING_MAX_AGE_MS).toISOString();
    const swept = await runTx((tx) =>
      callWatchTx("drive_watch_channels.sweep_stale_pending", () => tx.sweepStalePending(cutoff)),
    );
    sweptPending = swept.length;
    if (swept.length > 0) {
      await log.warn("stale pending watch channels swept", {
        source: "drive.watch.reconcile",
        sweptIds: swept,
      });
    }
  } catch {
    faults.push("pending_sweep");
  }

  const resolve = deps.resolveAdminAlert ?? defaultResolveAdminAlert;

  // 2. Configured folder. The helper returns a typed infra_error, but a THROWN
  // failure (client construction, unexpected reject) must also map to the fault —
  // recorded-not-thrown, spec §3.2: an unhandled throw out of the route handler
  // is a contract violation (plan-R3 finding 1).
  let folder: Awaited<ReturnType<typeof defaultGetActiveWatchedFolder>>;
  try {
    folder = await (deps.getActiveWatchedFolder ?? defaultGetActiveWatchedFolder)();
  } catch {
    faults.push("folder_read");
    return { outcome: "infra_error", sweptPending, escalated: false, faults };
  }
  if ("kind" in folder && folder.kind === "infra_error") {
    faults.push("folder_read");
    return { outcome: "infra_error", sweptPending, escalated: false, faults };
  }
  if ("kind" in folder) {
    // no_folder_configured → vacuous-healthy: nothing to watch; clear any stale alert.
    try {
      await resolve({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
    } catch {
      faults.push("alert_resolve_write");
    }
    return {
      outcome: faults.length ? "infra_error" : "vacuous",
      sweptPending, escalated: false, faults,
    };
  }

  // 3. Health predicate — (a) live channel AND (b) clean same-cycle renewal (R4-1, R10-1).
  let live: boolean;
  try {
    live = await runTx((tx) =>
      callWatchTx("drive_watch_channels.has_live_active", () =>
        tx.hasLiveActiveChannel(folder.folderId, now().toISOString()),
      ),
    );
  } catch {
    faults.push("channel_read");
    return { outcome: "infra_error", sweptPending, escalated: false, faults };
  }
  const renewalFailed =
    refresh.orphaned.includes(folder.folderId) ||
    refresh.failures.some((f) => f.folderId === folder.folderId);

  if (live && !renewalFailed) {
    try {
      await resolve({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
    } catch {
      faults.push("alert_resolve_write");
    }
    return {
      outcome: faults.length ? "infra_error" : "healthy",
      sweptPending, escalated: false, faults,
    };
  }

  // 4. Unhealthy — subscribe only when there is NO live channel (renewal-failing
  //    already had its attempt via refresh; a second call would double the
  //    occurrence_count cadence — spec §3.2.3).
  let outcome: ReconcileOutcome = live ? "renewal_failing" : "still_orphaned";
  if (!live) {
    try {
      const result = await (deps.subscribeToWatchedFolder ?? subscribeToWatchedFolder)(
        folder.folderId,
      );
      if (result.outcome === "active") {
        // The channel IS healthy the moment subscribe returns active — set
        // recovered BEFORE attempting resolve, so a resolve-write fault can
        // never route a recovered channel into the escalation branch
        // (plan-R2 finding 1: false Sentry/email on a healthy watch).
        outcome = "recovered";
        try {
          await resolve({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
        } catch {
          faults.push("alert_resolve_write");
        }
      } else if (result.reason === "activate_failed_after_watch_created") {
        faults.push("activate_write"); // DB fault in an orphaned costume (spec §3.1.2)
      }
    } catch {
      faults.push("subscribe_infra");
    }
  }

  // 5. Escalation — on EVERY unhealthy outcome, incl. renewal_failing (R9-2).
  // Deliberate (plan-R3 finding 2): a thrown subscribe (subscribe_infra) leaves
  // outcome = still_orphaned and the branch still runs — the escalation check
  // reads the pre-existing unresolved alert row, and a watch that is BOTH down
  // and failing to re-subscribe is exactly the support-worthy state. The helper
  // itself is failure-isolated: every dependency inside it already maps to a
  // named fault, and a residual throw maps to escalation_helper here
  // (recorded-not-thrown, plan-R3 finding 1).
  let escalated = false;
  if (outcome === "still_orphaned" || outcome === "renewal_failing") {
    try {
      const esc = await (deps.maybeEscalateWatchOrphaned ?? defaultMaybeEscalate)({
        folderId: folder.folderId,
        folderName: folder.folderName,
      });
      escalated = esc.escalated;
      faults.push(...esc.faults);
    } catch {
      faults.push("escalation_helper");
    }
  }

  return {
    outcome: faults.length ? "infra_error" : outcome,
    sweptPending, escalated, faults,
  };
}
```

Note: `getActiveWatchedFolder`'s success arm has NO `kind` key (`getWatchedFolderId.ts:38-41`) — the `"kind" in folder` narrowing above is the correct discriminator.

- [ ] **Step 4: Run tests** — `pnpm vitest run tests/drive/watch.test.ts && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/drive/watch.ts tests/drive/watch.test.ts
git commit --no-verify -m "feat(sync): reconcileWatchChannels — sweep, dual-condition health, recovery, escalation"
```

---

### Task 7: refresh-watch route — HTTP contract

**Files:**
- Modify: `app/api/cron/refresh-watch/route.ts` (all 16 lines)
- Test: `tests/cron/refreshWatchRoute.test.ts` (create — the new contract cases below)
- Modify: `tests/api/cron-sync.test.ts:123-158` — the existing `/api/cron/refresh-watch` describe mocks only `refreshWatchSubscriptions` and expects the old `{ ok: true, refreshed }` body; its `cronMock` must gain `reconcileWatchChannels: vi.fn().mockResolvedValue({ outcome: "healthy", sweptPending: 0, escalated: false, faults: [] })` and refresh mocks return the Task-3 `{ refreshed, orphaned: [], failures: [] }` shape; body expectations update to the new shape (`refreshOrphaned`, `refreshFailures`, `reconcile`).
- Modify: `tests/cron/cronRouteSummaries.test.ts:94-110` — the refresh-watch summary test's `vi.doMock("@/lib/drive/watch", ...)` must also export `reconcileWatchChannels`; its summary expectation becomes `{ outcome: "ok", counts: { refreshed: 2, refreshFailures: 0, sweptPending: 0, escalated: 0 } }`.

**Interfaces:**
- Consumes: Tasks 3+6. `runCronRoute` (`lib/cron/withCronRunSummary.ts:11`), `rejectUnauthorizedCron` (`app/api/cron/_auth.ts:3`), `CronRunOutcome = "ok" | "partial" | "infra"` (`lib/cron/runSummary.ts:6`).
- Produces: the spec §3.2 route contract — 200/`"ok"` vs 500/`"infra"`.

- [ ] **Step 1: Write failing tests** (mock `refreshWatchSubscriptions` + `reconcileWatchChannels` via `vi.mock("@/lib/drive/watch")`; set `CRON_SECRET` and send `Authorization: Bearer` per existing cron route tests):

```ts
// Failure modes: silent-200-on-infra-fault (R1-2); 5xx-on-handled-degradation paging (R2-5).
test("200 ok — healthy reconcile; body carries refresh + reconcile counts", ...);
test("200 ok — still_orphaned and renewal_failing and vacuous are NOT 5xx", ...);
   // parameterize outcome; assert status 200, body.ok true, body.reconcile.outcome passthrough
test("500 infra — reconcile outcome infra_error (each fault name) → status 500, body.ok false, body.reconcile.faults present", ...);
   // parameterize over: folder_read, pending_sweep, channel_read, subscribe_infra, activate_write,
   // alert_resolve_write, alert_row_read, guard_read, guard_write, pref_read, recipients_read,
   // email_send, escalation_helper
test("500 infra — refresh.failures non-empty (incl. { folderId: '*', operation: 'list_expiring' } and activate_pending) even when reconcile is clean", ...);
test("sendEmail retry_later is NOT a fault (reconcile returns clean → 200)", ...);
test("401 without bearer", ...);
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```ts
// app/api/cron/refresh-watch/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { refreshWatchSubscriptions, reconcileWatchChannels } from "@/lib/drive/watch";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("refresh-watch", request, async () => {
    const refresh = await refreshWatchSubscriptions();
    const reconcile = await reconcileWatchChannels(refresh);
    const infra = refresh.failures.length > 0 || reconcile.outcome === "infra_error";
    const body = {
      ok: !infra,
      refreshed: refresh.refreshed,
      refreshOrphaned: refresh.orphaned,
      refreshFailures: refresh.failures.length,
      reconcile: infra
        ? { outcome: reconcile.outcome, faults: reconcile.faults }
        : { outcome: reconcile.outcome, sweptPending: reconcile.sweptPending, escalated: reconcile.escalated },
    };
    return {
      response: NextResponse.json(body, { status: infra ? 500 : 200 }),
      summary: {
        outcome: infra ? "infra" : "ok",
        counts: {
          refreshed: refresh.refreshed.length,
          refreshFailures: refresh.failures.length,
          sweptPending: reconcile.sweptPending,
          escalated: reconcile.escalated ? 1 : 0,
        },
      },
    };
  });
}
```

(No `runtime`/`dynamic` exports — cron routes have none; match `CronRunSummary`'s exact type for `summary`.)

- [ ] **Step 4: Run tests** — `pnpm vitest run tests/cron/refreshWatchRoute.test.ts tests/api/cron-sync.test.ts tests/cron/cronRouteSummaries.test.ts && pnpm typecheck` → PASS (all three files; the two pre-existing files updated per the Files list).

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/refresh-watch/route.ts tests/cron/refreshWatchRoute.test.ts tests/api/cron-sync.test.ts tests/cron/cronRouteSummaries.test.ts
git commit --no-verify -m "feat(sync): refresh-watch route runs reconcile; scheduler-visible 500 on infra faults"
```

---

### Task 8: §12.4 copy lockstep (single commit)

**Files (ALL in one commit — x1 gate):**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2808` (§12.4 row) and `:3098` (long-context map)
- Regen: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`
- Modify: `lib/messages/catalog.ts:246-258`
- Verify: `tests/cross-cutting/codes.test.ts`, `tests/messages/catalog.test.ts`

New copy (spec §3.5 — truthful in both push-down and renewal-failing states):

| Field | Value |
|---|---|
| dougFacing | `A push subscription couldn't be confirmed…` → `The instant-updates connection to Google Drive is having trouble. Shows still sync automatically every few minutes.` |
| followUp | `Eric → reconcile / retry` → `Auto-retry hourly; admin Retry now; Eric if escalated` |
| helpfulContext (map :3098) | `The connection that makes sheet edits show up instantly couldn't be set up or renewed. Your shows still sync on the normal schedule, so nothing is lost — at worst, edits take a few minutes to appear. We retry the connection automatically every hour, and you can use Retry now to try immediately. If it keeps failing, we'll flag it for support.` |
| title (catalog-only) | `Live updates need attention` |
| longExplanation (catalog-only) | `The connection that makes sheet edits show up instantly couldn't be set up or renewed. Shows still sync on the normal schedule; at worst, edits take a few minutes to appear. The connection is retried automatically every hour, and an admin can retry immediately from the dashboard or Settings. If it keeps failing, it's flagged for support automatically.` |
| "Where it surfaces" cell | `Drive watch create/renew failed to confirm (files.watch error/timeout or activation failure); raised by subscribe, kept current by the hourly reconcile` |

- [ ] **Step 1:** Edit the master-spec row at `:2808` — keep the exact table format (pipes, double-quoted dougFacing cell, em-dash for crewFacing). Edit the long-context map entry at `:3098`. **Do NOT run prettier on this file.**
- [ ] **Step 2:** `pnpm gen:spec-codes` — regenerates `spec-codes.ts`.
- [ ] **Step 3:** Update `lib/messages/catalog.ts:246-258` with all six fields above (`crewFacing: null` and `helpHref` unchanged).
- [ ] **Step 4:** Run the gate: `pnpm test:audit:x1-catalog-parity && pnpm vitest run tests/messages/catalog.test.ts` → PASS.
- [ ] **Step 5:** Commit ALL THREE surfaces together:

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts
git commit --no-verify -m "feat(admin): de-jargon WATCH_CHANNEL_ORPHANED copy (§12.4 three-way lockstep)"
```

---

### Task 9: `retryWatchSubscriptionFormAction`

**Files:**
- Modify: `app/admin/actions.ts` (new export after `resolveAdminAlertFormAction`)
- Test: `tests/admin/retryWatchAction.test.ts` (create; mock `requireAdmin`, `getActiveWatchedFolder`, `subscribeToWatchedFolder`, `resolveAdminAlert`, `revalidatePath`)

**Interfaces:**
- Produces: `retryWatchSubscriptionFormAction(formData: FormData): Promise<void>` (spec §3.6 signature; the parameter is received from the form binding and deliberately unused — name it `_formData`). Tasks 10 and 12 bind it to `<form action=…>`; tests invoke with `new FormData()`.

- [ ] **Step 1: Write failing tests** (spec §3.6 + §4.5 incl. R11 advisory 1 — every fail-visible path pinned):

```ts
test("calls requireAdmin before any read", ...);
test("no_folder_configured → returns without subscribe, no throw, no revalidate; logs the deliberate skip (log.info spy: source 'admin.watchRetry')", ...);
test("folder infra_error → REJECTS with the typed WatchRetryInfraError (kind discriminator), no subscribe, no revalidate", async () => {
  // Failure mode: a generic Error keeps fail-visibility but loses the discriminable
  // typed-result contract (invariant 9 / spec §3.6.2 "throw a typed error").
  await expect(retryWatchSubscriptionFormAction(new FormData())).rejects.toMatchObject({
    kind: "watch_retry_infra_error",
    operation: "folder_read",
  });
});
test("active outcome → resolveAdminAlert({showId:null, code:'WATCH_CHANNEL_ORPHANED'}) + both revalidatePaths", ...);
   // anti-tautology: assert the resolve SPY args, not DOM
test("orphaned outcome → NO resolve call; still revalidates (banner re-render is the feedback)", ...);
test("subscribe throwing DriveWatchInfraError → REJECTS", ...);
test("resolveAdminAlert throwing after active → REJECTS (fail-visible)", ...);
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** (in `app/admin/actions.ts`; follows the file's `"use server"` + per-action `requireAdmin()` pattern):

```ts
import { getActiveWatchedFolder } from "@/lib/appSettings/getWatchedFolderId";
import { subscribeToWatchedFolder } from "@/lib/drive/watch";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { log } from "@/lib/log";

// Typed throw for the retry action (invariant 9: discriminable, never a bare Error).
export class WatchRetryInfraError extends Error {
  readonly kind = "watch_retry_infra_error" as const;
  constructor(readonly operation: "folder_read") {
    super(`watch retry: ${operation} failed (infra)`);
    this.name = "WatchRetryInfraError";
  }
}

// Admin self-service retry for the Drive push subscription (spec §3.6).
// Shared by the AlertBanner action slot and the Settings Drive panel.
// Infra faults THROW typed (invariant 9 / R2-3) — the Next error boundary surfaces
// them; no_folder_configured is a deliberate, logged no-op (nothing to retry; the
// hourly reconcile treats no-folder as vacuous-healthy).
export async function retryWatchSubscriptionFormAction(_formData: FormData): Promise<void> {
  await requireAdmin();
  const folder = await getActiveWatchedFolder();
  if ("kind" in folder && folder.kind === "infra_error") {
    throw new WatchRetryInfraError("folder_read");
  }
  if ("kind" in folder) {
    await log.info("watch retry skipped: no folder configured", { source: "admin.watchRetry" });
    return;
  }
  const result = await subscribeToWatchedFolder(folder.folderId);
  if (result.outcome === "active") {
    await resolveAdminAlert({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/settings");
}
```

- [ ] **Step 4: Run** action tests + `pnpm vitest run tests/cross-cutting/auth-chain-audit.test.ts` (the ts-morph audit must see `requireAdmin` before sinks in the new `"use server"` export) → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/actions.ts tests/admin/retryWatchAction.test.ts
git commit --no-verify -m "feat(admin): retryWatchSubscriptionFormAction — shared watch-retry server action"
```

---

### Task 10: `RetryWatchButton` + AlertBanner watch branch

**Files:**
- Create: `components/admin/RetryWatchButton.tsx`
- Modify: `components/admin/AlertBanner.tsx` (SELECT :108-119; `AlertRow` :44-52; action slot :399-424; panel :359-397)
- Test: `tests/components/RetryWatchButton.test.tsx` (create), `tests/components/AlertBanner.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 9's action; `ESCALATION_THRESHOLD` (Task 1); `AccentButton` (`components/shared/AccentButton.tsx:103`, props `fontWeight`/`ringOffset`/`minWidthTap`).
- Produces: testids `admin-alert-retry-button`, `admin-alert-watch-status`, `admin-alert-error-detail`, `admin-alert-panel-dismiss` (Task 14 e2e consumes these).

- [ ] **Step 1a: Write the FAILING real-browser e2e tests first (TDD for the layout contract).** Add `seedWatchAlert(opts: { occurrenceCount?: number; errorClass?: string; errorMessage?: string })` to `tests/e2e/helpers/seedAlerts.ts` (inserts the single global `WATCH_CHANNEL_ORPHANED` row with context via the existing `admin` client + `clearAlerts` pattern), and the watch-alert describe block in `tests/e2e/admin-banner-layout.spec.ts` (full test list in Task 14 — author ALL of it now). Run `pnpm playwright test tests/e2e/admin-banner-layout.spec.ts` against the dev server: the new describe MUST FAIL (no Retry button exists yet; the seeded watch alert renders the old Dismiss slot). Commit the red e2e tests together with this task's component work at Step 6 — Task 14 later re-runs them green.

- [ ] **Step 1b: `RetryWatchButton` failing test** — idle label `Retry now`; `useFormStatus` pending → `Retrying…` + `disabled` + `aria-busy` (mirror `tests/components/ResolveAlertButton.test.tsx` harness; regression: pending derives ONLY from `useFormStatus`, no local flag — M9-D-C4-1).

- [ ] **Step 2: Implement**

```tsx
// components/admin/RetryWatchButton.tsx
"use client";

/**
 * Single-tap retry for WATCH_CHANNEL_ORPHANED (spec §3.4.2). No two-tap confirm —
 * retry is safe/idempotent. Pending derives ONLY from useFormStatus (child-of-form;
 * M9-D-C4-1). Labels are UI chrome (uncataloged, like "Dismiss"/"Details").
 */
import { useFormStatus } from "react-dom";
import { AccentButton } from "@/components/shared/AccentButton";

export function RetryWatchButton({
  idleLabel = "Retry now",
  pendingLabel = "Retrying…",
  testId = "admin-alert-retry-button",
}: {
  idleLabel?: string;
  pendingLabel?: string;
  testId?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <AccentButton
      type="submit"
      data-testid={testId}
      disabled={pending}
      aria-busy={pending}
      fontWeight="medium"
      minWidthTap
      ringOffset="warning-bg"
    >
      {pending ? pendingLabel : idleLabel}
    </AccentButton>
  );
}
```

Banner (Task 10) uses the defaults; Settings (Task 12) passes `idleLabel="Retry connection"` + `testId="drive-connection-retry-button"` — the spec's Settings affordance is named "Retry connection" (spec §3.6 panel copy "Use Retry connection to reconnect"), while the banner's is "Retry now" (spec §3.4.2).

(Verify `AccentButton` forwards `type`/`data-testid`/`disabled`/`aria-busy` — it does for `ResolveAlertButton`'s confirm row; mirror exactly.)

- [ ] **Step 3: AlertBanner failing tests** (extend `tests/components/AlertBanner.test.tsx`; seed helper gains `occurrence_count`/`context` knobs):

```ts
// Failure modes: wrong action bound to watch alerts; dismiss disappearing entirely;
// escalated derivation reading the wrong fields; sibling self-satisfaction (anti-tautology).
test("WATCH_CHANNEL_ORPHANED global alert renders the Retry form in the action slot — and NOT the slot Dismiss form", () => {
  // anti-tautology: clone the banner DOM, REMOVE [data-testid=admin-alert-panel]
  // (it now contains a dismiss form) BEFORE asserting the slot has no dismiss button
});
test("other global codes keep the Dismiss slot form unchanged", ...);
test("per-show WATCH_CHANNEL_ORPHANED (hypothetical) keeps Check-it link (show_id branch wins)", ...);
test("panel dismiss row present for watch alert (form + hidden id input + button inside the SAME form; not inside <summary>)", ...);
test("status line: occurrence_count < ESCALATION_THRESHOLD & error_class drive_api → 'Retrying automatically every hour.'", ...);
test("status line: error_class config OR occurrence_count >= ESCALATION_THRESHOLD → 'We've flagged this for support — no action needed.'", ...);
   // fixtures derive from ESCALATION_THRESHOLD import — never literal 3
test("context.error_message renders in the muted code line; absent → no code line", ...);
test("Dismiss-confirm Cancel still operable while Retry pending (independent useFormStatus scopes)", ...);
test("compound: Dismiss submitted while Retry pending — component renders whatever the re-fetched DB state is (both final states exercised via seed swap)", ...);
```

- [ ] **Step 4: Implement AlertBanner changes**

1. SELECT (:108-119): add `occurrence_count` to the column list; `AlertRow` gains `occurrence_count: number`.
2. Above the action slot:

```tsx
const isWatchAlert = !isPerShowAlert && alert.code === "WATCH_CHANNEL_ORPHANED";
const errorClass = typeof alert.context?.error_class === "string" ? alert.context.error_class : null;
const errorDetail = typeof alert.context?.error_message === "string" ? alert.context.error_message : null;
const escalated = isWatchAlert && (errorClass === "config" || alert.occurrence_count >= ESCALATION_THRESHOLD);
```

(`import { ESCALATION_THRESHOLD } from "@/lib/drive/watchErrors";` — pure module, server-component-safe.)

3. Action slot (:399-424) becomes a three-way branch: per-show `Check it` link (unchanged) / watch → `<form action={retryWatchSubscriptionFormAction}><RetryWatchButton /></form>` / other-global → existing Dismiss form (unchanged, hidden id input intact).
4. Panel additions (inside the existing panel section, after the helpfulContext `<p>` at :371-378), watch-only:

```tsx
{isWatchAlert ? (
  <p data-testid="admin-alert-watch-status" className="text-sm text-text-subtle">
    {escalated ? "We've flagged this for support — no action needed." : "Retrying automatically every hour."}
  </p>
) : null}
{isWatchAlert && errorDetail ? (
  <p data-testid="admin-alert-error-detail" className="text-xs text-text-subtle">
    <code>{errorDetail}</code>
  </p>
) : null}
{isWatchAlert ? (
  <form action={resolveAdminAlertFormAction} data-testid="admin-alert-panel-dismiss">
    <input type="hidden" name="id" value={alert.id} data-testid="admin-alert-id-input" />
    <ResolveAlertButton />
  </form>
) : null}
```

Slot-integrity: the panel is a grid SIBLING of `<details>` (F18) — forms here are legal (never inside `<summary>`). Transitions: all state changes are instant server re-renders (spec §3.4 transition inventory) — no animation props to add.

- [ ] **Step 5: Run** — `pnpm vitest run tests/components/RetryWatchButton.test.tsx tests/components/AlertBanner.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/RetryWatchButton.tsx components/admin/AlertBanner.tsx tests/components/RetryWatchButton.test.tsx tests/components/AlertBanner.test.tsx tests/e2e/helpers/seedAlerts.ts tests/e2e/admin-banner-layout.spec.ts
git commit --no-verify -m "feat(admin): watch-alert Retry now action slot + panel dismiss/status/error detail"
```

(The e2e watch-variant tests authored red in Step 1a ride in this commit; they go green in Task 14's verification run once the dev server picks up this implementation.)

---

### Task 11: Resolve → Dismiss rename

**Files:**
- Modify: `components/admin/ResolveAlertButton.tsx` (:108 `Resolve`→`Dismiss`; :145 `Confirm resolve`→`Confirm dismiss`, `Resolving…`→`Dismissing…`; header comments)
- Modify: `tests/components/ResolveAlertButton.test.tsx` (:34-37, :42-46, :63, :76, :91), `tests/components/AlertBanner.test.tsx` (:617-629 label pin)

**Interfaces:** presentation-only — component name, testids, server action, DB columns all unchanged (spec §3.4).

- [ ] **Step 1:** Update the label assertions in both test files first (`"Dismiss"`, `"Confirm dismiss"`, `"Dismissing…"`); run → FAIL (labels still old).
- [ ] **Step 2:** Change the three literals + comment block in `ResolveAlertButton.tsx`.
- [ ] **Step 3:** `pnpm vitest run tests/components/ResolveAlertButton.test.tsx tests/components/AlertBanner.test.tsx` → PASS. Class-sweep: `grep -rn '"Resolve' components/ app/ --include='*.tsx' | grep -v test` — `PerShowAlertResolveButton.tsx:77` says `Mark resolved`/`Resolving…` (per-show surface; out of scope per spec §3.4 which renames the GLOBAL banner button only — leave it; note in commit body).
- [ ] **Step 4: Commit**

```bash
git add components/admin/ResolveAlertButton.tsx tests/components/ResolveAlertButton.test.tsx tests/components/AlertBanner.test.tsx
git commit --no-verify -m "feat(admin): rename global alert Resolve button to Dismiss (honest verb)"
```

---

### Task 12: DriveConnectionPanel — Retry connection

**Files:**
- Modify: `components/admin/settings/DriveConnectionPanel.tsx` (`deriveStatusLine` :35-73, `deriveHealthExplainer` :79-101, button group :206-235)
- Test: `tests/components/admin/settings/DriveConnectionPanel.test.tsx` (:96-109 split + new cases)

**Interfaces:** Consumes Task 9's action. Health prop unchanged (`DriveConnectionHealth`, `lib/admin/driveConnectionHealth.ts:38`; warn arm carries `folderId`).

Visibility rule (spec §3.6, R2-4/R8-1):

```ts
const showRetry =
  !("kind" in health) &&
  health.health === "warn" &&
  (health.reason === "watch_inactive" ||
    health.reason === "watch_expired" ||
    (health.reason === "not_configured" && health.folderId !== null));
```

- [ ] **Step 1: Failing tests** (failure mode: the folder-configured/zero-watch-rows post-GC state losing its recovery affordance — the exact R8-1 regression):

```ts
test("Retry connection form present for watch_inactive and watch_expired", ...);
test("Retry present for not_configured WITH folderId (post-GC zero-watch-rows state) — and status line reads 'Connection needs attention' with the Retry-first explainer", ...);
test("Retry ABSENT for not_configured with folderId null — setup copy unchanged ('Connection not set up' / 'You haven't pointed FXAV…')", ...);
test("Retry absent for positive, sync_* reasons, stale_*, and infra_error", ...);
test("Retry form submits retryWatchSubscriptionFormAction (form action identity)", ...);
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement.**
  - `deriveStatusLine`: the `not_configured` branch takes `folderId`: `folderId !== null` → the existing `watch_inactive` "Connection needs attention" line; else unchanged.
  - `deriveHealthExplainer`: `watch_inactive`/`watch_expired`/`not_configured`-with-folderId → `"FXAV's link to your Drive folder lapsed, so new edits may not sync instantly. Use Retry connection to reconnect — your existing shows keep all their data and keep syncing on the normal schedule."`; `not_configured`-without-folderId unchanged.
  - Button group (:206-235): add as sibling of the rerun-setup form:

```tsx
{showRetry ? (
  <form data-testid="drive-connection-retry-form" action={retryWatchSubscriptionFormAction}>
    <RetryWatchButton
      idleLabel="Retry connection"
      pendingLabel="Retrying…"
      testId="drive-connection-retry-button"
    />
  </form>
) : null}
```

(The Settings label is "Retry connection" per spec §3.6 — the panel explainer says "Use Retry connection to reconnect"; the test asserting the form also pins this label.)

- [ ] **Step 4:** `pnpm vitest run tests/components/admin/settings/DriveConnectionPanel.test.tsx` → PASS.
- [ ] **Step 5: Commit**

```bash
git add components/admin/settings/DriveConnectionPanel.tsx tests/components/admin/settings/DriveConnectionPanel.test.tsx
git commit --no-verify -m "feat(admin): Settings Drive panel Retry connection — folderId-keyed visibility + copy"
```

---

### Task 13: DB-layer Dismiss-vs-Retry race test

**Files:**
- Modify: `tests/db/upsert-admin-alert-dedup.test.ts` (new describe block; reuse the file's `sql`/`makeShow`/skip-when-no-DB harness — global alerts need NO show, pass `null::uuid`)

Non-tautological DB pin (spec §4.10, R8-3): the race semantics live in the RPC + partial index, not the component.

- [ ] **Step 1: Write the tests**

```ts
describe("WATCH_CHANNEL_ORPHANED dismiss-vs-retry race (global alert)", () => {
  const WATCH_CODE = "WATCH_CHANNEL_ORPHANED";
  async function cleanupGlobal() {
    await sql!`delete from public.admin_alerts where code = ${WATCH_CODE} and show_id is null`;
  }
  test.skipIf(!sql)("post-dismiss failed retry INSERTS a fresh unresolved row (honest re-raise)", async () => {
    await cleanupGlobal();
    await sql!`select public.upsert_admin_alert(null::uuid, ${WATCH_CODE}, ${sql!.json({ reason: "watch_create_failed" })})`;
    await sql!`update public.admin_alerts set resolved_at = now() where code = ${WATCH_CODE} and show_id is null and resolved_at is null`;
    await sql!`select public.upsert_admin_alert(null::uuid, ${WATCH_CODE}, ${sql!.json({ reason: "watch_create_failed" })})`;
    const rows = await sql!<{ resolved_at: string | null; occurrence_count: number }[]>`
      select resolved_at, occurrence_count from public.admin_alerts
       where code = ${WATCH_CODE} and show_id is null order by raised_at`;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.resolved_at).not.toBeNull();       // dismissed row untouched
    expect(rows[1]!.resolved_at).toBeNull();           // fresh incident row
    expect(rows[1]!.occurrence_count).toBe(1);
    await cleanupGlobal();
  });
  test.skipIf(!sql)("retry-success after dismiss: unresolved-only resolve UPDATE affects zero rows (convergence)", async () => {
    await cleanupGlobal();
    await sql!`select public.upsert_admin_alert(null::uuid, ${WATCH_CODE}, ${sql!.json({})})`;
    await sql!`update public.admin_alerts set resolved_at = now() where code = ${WATCH_CODE} and show_id is null and resolved_at is null`;
    const updated = await sql!<{ id: string }[]>`
      update public.admin_alerts set resolved_at = now()
       where code = ${WATCH_CODE} and show_id is null and resolved_at is null
       returning id`;
    expect(updated).toHaveLength(0); // resolveAdminAlert's WHERE shape no-ops — no error, no dup
    await cleanupGlobal();
  });
});
```

- [ ] **Step 2: Run** — `pnpm vitest run tests/db/upsert-admin-alert-dedup.test.ts` (needs `TEST_DATABASE_URL`; locally the dev DB). Expected: PASS (these pin EXISTING RPC semantics — if either fails, STOP: the spec's §3.4 compound contract is wrong; escalate).
- [ ] **Step 3: Commit**

```bash
git add tests/db/upsert-admin-alert-dedup.test.ts
git commit --no-verify -m "test(db): pin dismiss-vs-retry race semantics for WATCH_CHANNEL_ORPHANED"
```

---

### Task 14: e2e — banner layout watch variant (verification run)

**Files:** authored RED in Task 10 Step 1a (`tests/e2e/helpers/seedAlerts.ts` + `tests/e2e/admin-banner-layout.spec.ts`) — this task verifies them GREEN post-implementation and fixes any real-layout violations they surface. TDD ordering: red at Task 10 Step 1a → implementation Tasks 10-12 → green here.

Real-browser obligations (spec §3.4 dimensional invariants; jsdom computes no layout). The authored describe block (reference copy — must match what Task 10 Step 1a wrote):

```ts
test.describe("watch-alert variant (WATCH_CHANNEL_ORPHANED)", () => {
  // Seed: seedWatchAlert({ occurrenceCount: 1 }) in beforeEach; clearAlerts afterAll.
  test("Retry slot geometry: one-line centered idle, col2 ≤ 55%, across WIDTHS", async ({ page }) => {
    // mirror the existing global-alert geometry assertions but target admin-alert-retry-button;
    // reuse rect() + TOL; assert vertical-center within the summary row and
    // right-column width ≤ 0.55 * banner width at every WIDTHS breakpoint
  });
  test("action slot does not move when the panel expands (compound: expand while idle + while pending)", async ({ page }) => {
    // capture rect before open, click OUTER_SUMMARY, capture after — delta < TOL;
    // repeat with the form submit in-flight (route the action to a slow stub via
    // page.route on the server action endpoint OR assert pending label swap then geometry)
  });
  test("panel dismiss row renders below helpful context and does not alter slot position", async ({ page }) => {
    // open panel; assert admin-alert-panel-dismiss visible inside admin-alert-panel;
    // slot rect unchanged (TOL)
  });
  test("escalated status line renders for occurrenceCount >= ESCALATION_THRESHOLD", async ({ page }) => {
    // re-seed with occurrenceCount: ESCALATION_THRESHOLD (import the constant), reload,
    // open panel, expect "We've flagged this for support — no action needed."
  });
});
```

- [ ] **Step 2: Run** — `pnpm playwright test tests/e2e/admin-banner-layout.spec.ts` (requires e2e env: dev server :3000 + Supabase; see the file header). Expected: the ENTIRE spec passes — the watch-variant describe (red since Task 10 Step 1a) now green, and the pre-existing global/per-show gates unregressed.
- [ ] **Step 3:** If a geometry gate fails, fix the component (not the test) and commit as `fix(admin): e2e layout <violation>`. When green with no fixes needed, commit nothing (tests landed in Task 10) and mark the task complete.

---

### Task 15: impeccable dual-gate (invariant 8)

UI surfaces in this diff: `AlertBanner.tsx`, `ResolveAlertButton.tsx`, `RetryWatchButton.tsx`, `DriveConnectionPanel.tsx`.

- [ ] **Step 1:** Run `/impeccable critique` on the affected diff (canonical v3 preflight gates: PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix HIGH/CRITICAL findings, or defer each via a `DEFERRED.md` entry. Record findings + dispositions for the PR body (spec §4 UI quality gate: the PR description is the §12-equivalent record).
- [ ] **Step 4:** Commit any fixes as `fix(admin): impeccable <finding>` commits.

---

### Task 16: Full-suite verification + close-out

- [ ] **Step 1:** `pnpm typecheck && pnpm lint` → clean.
- [ ] **Step 2:** `prettier --check .` → clean (master spec untouched by prettier — verify no diff on `docs/superpowers/specs/2026-04-30-*.md`).
- [ ] **Step 3:** FULL suite: `pnpm vitest run` (shared-DB caution: run `.db.test` files in isolation if the worktree run pollutes; verify `tests/db/*` green against local). Expected failures: none. Known pre-existing failures must be verified pre-existing at merge-base before dismissing.
- [ ] **Step 4:** Gates: `pnpm test:audit:x1-catalog-parity`; `pnpm vitest run tests/cross-cutting/auth-chain-audit.test.ts tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaAdminAlertProducer.test.ts tests/log/_metaAppEventsWriter.test.ts tests/sync/_metaInfraContract.test.ts tests/admin/_metaInfraContract.test.ts` → all PASS.
- [ ] **Step 5:** e2e: `pnpm playwright test tests/e2e/admin-banner-layout.spec.ts` → PASS.
- [ ] **Step 6:** Pipeline close-out (AGENTS.md autonomous pipeline — not TDD steps): whole-diff Codex cross-model review to APPROVE → push → PR → real CI green (check `mergeStateStatus == CLEAN`, pass PR number not SHA to `gh pr checks --watch`) → `gh pr merge --merge` → fast-forward local main (`rev-list --left-right --count main...origin/main` == `0 0`).
- [ ] **Step 7:** **Ops (USER CONFIRMATION REQUIRED — D4):** ask the user before setting `DRIVE_WEBHOOK_BASE_URL=https://fxav-crew-pages-validation.vercel.app` on the validation Vercel project (Production) and triggering a fresh production deployment from main. After deploy: watch the next hourly reconcile self-heal the orphaned state (or use the new Retry button); if Drive rejects the webhook URL (domain verification), the new `error_message` capture surfaces it in the banner — that residual is a GCP-console ops item, out of code scope (spec §3.7.3). Optional ops note for the user: `SENTRY_DSN` is unset on validation, so escalation Sentry captures no-op there (email still fires).

---

## Meta-test inventory (from spec §4)

- EXTENDS `tests/sync/_metaInfraContract.test.ts`: rewritten `refreshWatchSubscriptions` row (Task 3); new rows `readUnresolvedWatchAlert`, `hasEscalationFired`, `persistAppEventStrict` (Task 5).
- `tests/admin/_metaInfraContract.test.ts`: touched only if AlertBanner's registered fetch row pins its column list (check when adding `occurrence_count` in Task 10; update the row if the grep-shape breaks).
- No new registries; no new tables/RPCs/§12.4 codes/advisory locks.
