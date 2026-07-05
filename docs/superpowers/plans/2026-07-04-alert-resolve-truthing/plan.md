# Alert Manual-Resolve Truthing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the manual "Mark resolved" affordance reflect each alert code's true resolution class (auto vs manual) on every surface that renders it, and finish auto-resolution for the one remaining reachable config-state code (`GITHUB_BOT_LOGIN_MISSING`).

**Architecture:** Promote the alert resolution class from the test-only registry into a runtime `MESSAGE_CATALOG.resolution` field (mirroring how `audience`/`healthWeight` were promoted); derive `AUTO_RESOLVING_CODES` / `isAutoResolving` / `autoResolveNote` in `lib/adminAlerts/audience.ts`; suppress the manual button + render a read-only auto-clear note for auto codes on `HealthAlertsPanel`, `PerShowAlertSection`, and `AlertBanner`; add app-layer fail-closed guards on the four manual-resolve doors; and add a raw (NON_UPSERT-producer) resolver for `GITHUB_BOT_LOGIN_MISSING` gated on an explicit env-presence read.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), TypeScript, Vitest, Playwright (real-browser layout), Supabase (service-role client + postgres.js raw SQL), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-04-alert-resolve-truthing.md` (APPROVED, 3 adversarial rounds).

## Global Constraints

- **Invariant 5 (no raw error codes in UI):** all operator-facing copy routes through `lib/messages/lookup.ts` / catalog; the new `autoResolveNote` is human copy, never a code string.
- **Invariant 8 (UI quality gate):** `HealthAlertsPanel`, `PerShowAlertSection`, `AlertBanner` are UI surfaces → `/impeccable critique` + `/impeccable audit` on the diff before close-out; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Invariant 9 (Supabase call-boundary):** every Supabase call destructures `{ data, error }`; the cron bot-login resolver surfaces faults typed/logged, never silent; register in the relevant meta-test or carry `// not-subject-to-meta: <reason>`.
- **`GITHUB_BOT_LOGIN_MISSING` is a registered NON_UPSERT producer** (`tests/messages/_metaAdminAlertCatalog.test.ts:585-587`), EXCLUDED from `AdminAlertCode` (`lib/adminAlerts/upsertAdminAlert.ts:3-35`). It must NOT be routed through the `AdminAlertCode`-typed `resolveAdminAlert`. Resolve it via raw backend writes.
- **Resolution partition (canonical):** `auto` = 22 codes, `manual` = 20 (incl. 2 deferred), `NEW` 15, `DEFER` 2 — total 42. Every count references this.
- **TDD per task; commit per task** (`<type>(<scope>): <summary>`, `--no-verify` in this worktree). Run `pnpm format:check` before any push (--no-verify skips prettier).
- **Never run prettier on the master spec** (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) — mangles §12.4 cells → x1 divergence. Edit prose lines surgically.
- **Unknown-code default is `manual`** (fail-visible): `isAutoResolving(unknownCode) === false`.

---

## File structure

- **Modify** `lib/messages/catalog.ts` — add `resolution?: "auto" | "manual"` to `MessageCatalogEntry`; tag all 42 alert codes; fix `AMBIGUOUS_EMAIL_BINDING` copy (Task 7).
- **Modify** `lib/adminAlerts/audience.ts` — derive `AUTO_RESOLVING_CODES`, `isAutoResolving`, `AUTO_RESOLVE_NOTES` + `autoResolveNote`.
- **Create** `lib/reports/botLoginAlert.ts` — `botLoginConfigured(env)` presence predicate + injectable service-role `resolveBotLoginAlertRow(makeClient?)` (cron default).
- **Modify** `lib/reports/submit.ts` — shared fail-open `resolveBotLoginAlertFailOpen(db, showId)` invoked before BOTH 201 returns (normal-create `:1089` + expired-lease-retry `:956`).
- **Modify** `lib/notify/runNotify.ts` — `MaintenanceDeps.resolveBotLoginAlert` + **catch-logged** invocation in `runMaintenance` (a resolve fault never collapses the run).
- **Modify** `components/admin/telemetry/HealthAlertsPanel.tsx` — button→note for auto codes.
- **Modify** `components/admin/PerShowAlertSection.tsx` — broaden suppression to `isAutoResolving`.
- **Modify** `components/admin/AlertBanner.tsx` — note in left column; keep Retry; drop resolve/dismiss forms for auto codes.
- **Modify** `app/admin/actions.ts` — `isAutoResolving` guard in `resolveHealthAlertFormAction` + `resolveAdminAlertFormAction`.
- **Modify** `app/api/admin/admin-alerts/[id]/resolve/route.ts` + `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` — auto-code rejection.
- **Modify** `tests/messages/_metaAdminAlertCatalog.test.ts` — reclassify `GITHUB_BOT_LOGIN_MISSING` → auto; add `resolution`-parity + manual-copy-guard assertions.
- **Modify** `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md` — §3 row + counts.
- **Modify** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (line ~3091) + `pnpm gen:spec-codes` — `AMBIGUOUS_EMAIL_BINDING` helpfulContext.
- **Modify** `DEFERRED.md` — branch-protection re-enable path.

## Meta-test inventory (declared per AGENTS.md)

- **EXTENDS** `tests/messages/_metaAdminAlertCatalog.test.ts`: (a) reclassify `GITHUB_BOT_LOGIN_MISSING` deferred→auto; (b) new assertion `catalog.resolution` ↔ registry class parity for all 42; (c) new manual-copy guard (no auto-clear language in `resolution: "manual"` copy).
- **No advisory-lock surface touched** — `pg_advisory*` topology N/A (no code path mutating `shows`/`crew_members`/auth/pending_* is added; the bot-login resolve is a global `admin_alerts` UPDATE, no advisory lock).
- **Supabase call-boundary:** the cron bot-login resolver is a new `.from("admin_alerts").update(...)` service-role call — register in the notify call-boundary meta-test or inline `// not-subject-to-meta`.

---

## Task 1: Raw `GITHUB_BOT_LOGIN_MISSING` resolver (helper + cron + submit)

**Files:**
- Create: `lib/reports/botLoginAlert.ts` (`botLoginConfigured` + injectable service-role `resolveBotLoginAlertRow`)
- Modify: `lib/notify/runNotify.ts` (`MaintenanceDeps` ~`:71-82`; `runMaintenance` invocation after email reconcile ~`:206`, **catch-logged so a resolve fault never collapses the run** — H3)
- Modify: `lib/reports/submit.ts` — fail-open raw resolve before **BOTH** durable-`201` returns: the normal-create path (`:1089`) AND the expired-lease-retry path (`:956`, `handleExpiredLeaseRetry`). `GITHUB_BOT_LOGIN_MISSING` is raised on the lookup-inconclusive path (`handleLookupInconclusive:783`), which feeds the expired-lease flow, so the `:956` return is a real reach — H2. Raw resolve mirrors the raw `upsertAdminAlert` at `:643`.
- Test: `tests/reports/botLoginAlert.test.ts`, `tests/notify/runMaintenance.botLogin.test.ts`, `tests/reports/submit.botLoginResolve.test.ts`

**Interfaces:**
- Produces: `botLoginConfigured(env?: NodeJS.ProcessEnv): boolean`; `resolveBotLoginAlertRow(makeClient?): Promise<void>` (service-role update, injectable client factory for tests) wired as the default for `MaintenanceDeps.resolveBotLoginAlert`; a submit-side fail-open raw resolve extracted so both `201` returns invoke it.

- [ ] **Step 1: Write the failing test for the presence predicate**

```ts
// tests/reports/botLoginAlert.test.ts
import { describe, expect, test } from "vitest";
import { botLoginConfigured } from "@/lib/reports/botLoginAlert";

describe("botLoginConfigured", () => {
  test("true only for a non-empty GITHUB_BOT_LOGIN", () => {
    expect(botLoginConfigured({ GITHUB_BOT_LOGIN: "fxav-bot" } as NodeJS.ProcessEnv)).toBe(true);
    expect(botLoginConfigured({ GITHUB_BOT_LOGIN: "  " } as NodeJS.ProcessEnv)).toBe(false);
    expect(botLoginConfigured({ GITHUB_BOT_LOGIN: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(botLoginConfigured({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/reports/botLoginAlert.test.ts`
Expected: FAIL — cannot find module `@/lib/reports/botLoginAlert`.

- [ ] **Step 3: Implement the presence predicate**

```ts
// lib/reports/botLoginAlert.ts
//
// alert-resolve-truthing §6.1. GITHUB_BOT_LOGIN_MISSING is a NON_UPSERT admin-alert
// producer (raw INSERT in lib/reports/submit.ts) excluded from AdminAlertCode, so it
// is resolved via raw backend writes gated on this explicit env-presence read — NOT
// through the typed resolveAdminAlert helper. "Submit succeeded" does not prove the
// env is configured (the env is only read on the expired-lease recovery path), so
// resolution ALWAYS re-checks the env here.
export function botLoginConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.GITHUB_BOT_LOGIN;
  return typeof v === "string" && v.trim() !== "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/reports/botLoginAlert.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing resolver + non-collapse tests (H3 — no tautology)**

The `runMaintenance` "called once" assertion alone is tautological (it only proves a passed-in
callback fired). Instead test the **default resolver's real behavior** (env gate, targeted UPDATE
shape, typed error) directly via its injectable client factory, plus a `runMaintenance`-level test
that a **throwing** resolver does NOT collapse the maintenance run.

```ts
// tests/notify/runMaintenance.botLogin.test.ts
import { describe, expect, test, vi } from "vitest";
import { resolveBotLoginAlertRow } from "@/lib/reports/botLoginAlert";
import { runMaintenance } from "@/lib/notify/runNotify";

// A minimal chainable fake of the service-role query builder used by the resolver.
function fakeClient(result: { error: { message: string } | null }) {
  const update = vi.fn(() => builder);
  const eq = vi.fn(() => builder);
  const is = vi.fn(() => builder);
  const select = vi.fn(async () => result);
  const builder = { update, eq, is, select } as unknown as Record<string, unknown>;
  const from = vi.fn(() => builder);
  return { client: { from } as never, from, update, eq, is, select };
}

describe("resolveBotLoginAlertRow (default cron resolver)", () => {
  test("env unset → no client constructed, no Supabase call", async () => {
    const makeClient = vi.fn();
    await resolveBotLoginAlertRow(makeClient as never); // GITHUB_BOT_LOGIN unset in test env
    expect(makeClient).not.toHaveBeenCalled();
  });

  test("env set + clean → issues the targeted resolving UPDATE", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", "fxav-bot");
    const f = fakeClient({ error: null });
    await resolveBotLoginAlertRow(() => f.client);
    expect(f.from).toHaveBeenCalledWith("admin_alerts");
    expect(f.eq).toHaveBeenCalledWith("code", "GITHUB_BOT_LOGIN_MISSING");
    expect(f.is).toHaveBeenCalledWith("show_id", null);
    expect(f.is).toHaveBeenCalledWith("resolved_at", null);
    vi.unstubAllEnvs();
  });

  test("env set + returned error → throws typed (invariant 9)", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", "fxav-bot");
    const f = fakeClient({ error: { message: "boom" } });
    await expect(resolveBotLoginAlertRow(() => f.client)).rejects.toThrow(/bot-login alert resolve failed: boom/);
    vi.unstubAllEnvs();
  });
});

describe("runMaintenance bot-login step is fail-open (H3 — never collapses the run)", () => {
  test("a throwing resolveBotLoginAlert dep leaves the other step results intact", async () => {
    const steps = await runMaintenance({
      readHeartbeat: async () => ({ kind: "ok", heartbeat: new Date(0) }),
      detectAndResolveStall: (async () => ({ kind: "ok", opened: 0, resolved: 0 })) as never,
      resolveRecoveredSyncProblems: async () => ({ kind: "ok" }),
      reconcileEmailDeliveryState: (async () => ({ kind: "ok", opened: 0, resolved: 0 })) as never,
      getAlertOnSyncProblems: async () => ({ kind: "value", enabled: false }) as never,
      getAlertOnAutoPublish: async () => ({ kind: "value", enabled: false }) as never,
      getDailyReviewDigest: async () => ({ kind: "value", enabled: false }) as never,
      configValid: () => ({ ok: true }) as never,
      resolveBotLoginAlert: async () => {
        throw new Error("resolve blew up");
      },
      now: new Date(0),
    });
    // The 3 pre-existing steps are preserved (NOT collapsed to a single generic stall
    // infra_error, which is what an uncaught throw + safeMaintenance would produce).
    expect(steps.map((s) => s.step)).toEqual(["stall", "recovery", "emailDelivery"]);
    expect(steps.find((s) => s.step === "emailDelivery")?.result).toEqual({
      kind: "ok",
      opened: 0,
      resolved: 0,
    });
  });
});
```

(Confirm the real toggle-result shape when writing — the live `runMaintenance` reads `.enabled` on
each toggle, `runNotify.ts:184-189`; adapt the dep return literals to the true shape.)

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run tests/notify/runMaintenance.botLogin.test.ts`
Expected: FAIL — `resolveBotLoginAlertRow` not exported; `resolveBotLoginAlert` not a `MaintenanceDeps` member / not invoked.

- [ ] **Step 7: Add the injectable default resolver, the dep, and the catch-logged invocation**

In `lib/reports/botLoginAlert.ts`, add the service-role resolver (injectable client factory so the
env gate + UPDATE shape + typed error are directly testable):

```ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient"; // adapt to the real factory path

// alert-resolve-truthing §6.2: resolve the global GITHUB_BOT_LOGIN_MISSING row when the
// env is configured. Direct admin_alerts UPDATE (the code is a NON_UPSERT producer, not in
// AdminAlertCode). Invariant-9: destructure { error }; a returned error throws a typed fault
// (the CRON invocation catch-logs it — see runNotify — so a failed resolve degrades to a
// logged no-op for THIS cycle instead of collapsing the whole maintenance run). The env is
// checked BEFORE the client is constructed, so an unset deployment makes zero Supabase calls.
export async function resolveBotLoginAlertRow(
  makeClient: () => ReturnType<typeof createSupabaseServiceRoleClient> = createSupabaseServiceRoleClient,
): Promise<void> {
  if (!botLoginConfigured()) return;
  const supabase = makeClient();
  const { error } = await supabase
    .from("admin_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("code", "GITHUB_BOT_LOGIN_MISSING")
    .is("show_id", null)
    .is("resolved_at", null)
    .select("id");
  if (error) {
    throw new Error(`bot-login alert resolve failed: ${error.message ?? String(error)}`);
  }
}
```

In `lib/notify/runNotify.ts`, add to `MaintenanceDeps` and import the default:

```ts
import { resolveBotLoginAlertRow } from "@/lib/reports/botLoginAlert";
// ...
  reconcileEmailDeliveryState?: typeof reconcileEmailDeliveryState;
  resolveBotLoginAlert?: () => Promise<void>; // alert-resolve-truthing §6.2
```

In `runMaintenance`, immediately after the `reconcileEmailDeliveryState` call + `out.push({ step: "emailDelivery", ... })` (~`:224`), invoke the resolver **catch-logged** — a fault must NOT escape `runMaintenance` (an uncaught throw is swallowed by `safeMaintenance` into a single generic `stall` infra_error at `runNotify.ts:141-145`, destroying every real step result). This preserves the returned `[stall, recovery, emailDelivery]` array (so existing `runMaintenance` tests stay green — no 4th step) while surfacing the fault via a log (invariant 9, not silent):

```ts
  await (deps.resolveBotLoginAlert ?? resolveBotLoginAlertRow)().catch((cause) => {
    void log.warn("bot-login alert resolve failed (non-fatal)", {
      source: "notify.maintenance",
      code: "CREW_REPORT_SUBMITTED", // reuse an existing non-error breadcrumb code; do NOT mint a §12.4 code
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  });
```

(Reuse the module's existing `log` import; if `notify.maintenance` is not an established `source`
value, use the existing notify source string in this file. The invocation returns `void` — it does
not append a step, keeping the 3-step contract.)

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run tests/notify/runMaintenance.botLogin.test.ts`
Expected: PASS — default resolver env gate + UPDATE shape + typed error all covered; a throwing dep leaves `[stall, recovery, emailDelivery]` intact. (If `runMaintenance`'s dep-injection shape differs, adapt the harness to the real signature — the contracts are: default resolver behaves per the three cases, and a throwing resolver never collapses the run.)

- [ ] **Step 9: Write the failing submit fail-open test (BOTH 201 paths — H2)**

```ts
// tests/reports/submit.botLoginResolve.test.ts — asserts the R2 F4 fail-open + H2 contracts:
//   (a) NORMAL-create 201 (:1089) + GITHUB_BOT_LOGIN set → the resolving UPDATE is issued;
//   (b) EXPIRED-LEASE-retry 201 (:956, handleExpiredLeaseRetry) + GITHUB_BOT_LOGIN set → the
//       resolving UPDATE is issued (this path is where the alert is opened upstream, :783);
//   (c) either 201 path + resolve UPDATE THROWS → status is STILL 201 (fail-open, never
//       fails a durable submit);
//   (d) 201 + GITHUB_BOT_LOGIN unset → the resolve UPDATE is never issued (R1 F2, no false-close).
// Harness mirrors the existing submit success-path tests (tests/reports/submit.*.test.ts).
// Detect the resolve UPDATE by matching the fake db.query calls for the GITHUB_BOT_LOGIN_MISSING
// UPDATE string; stub that specific query to reject for case (c) while the create path succeeds.
```

Write the concrete test against the existing `submit.ts` test harness pattern. Cover all four cases;
crucially **exercise both the normal-create and the expired-lease-retry success paths** (the fake
db/GitHub adapters must drive `submitReport` down each 201 branch).

- [ ] **Step 10: Run to verify it fails**

Run: `pnpm vitest run tests/reports/submit.botLoginResolve.test.ts`
Expected: FAIL — no resolve on either success path yet.

- [ ] **Step 11: Add the fail-open submit resolve before BOTH 201 returns (H2)**

In `lib/reports/submit.ts`, extract a module-local fail-open helper and invoke it immediately before
**each** durable-`201` return — the normal-create return (`:1089`) AND the expired-lease-retry return
(`:956`). A single shared helper (DRY) so the two call sites cannot drift:

```ts
// alert-resolve-truthing §6.2 (H2): opportunistic, FAIL-OPEN resolve of the global
// GITHUB_BOT_LOGIN_MISSING alert when the bot login is configured. Re-reads the env explicitly
// (a normal create never touches it), so a false-close is impossible. Called before BOTH 201
// returns — the alert is opened on the lookup-inconclusive path (:783) that feeds the
// expired-lease flow, so the :956 return is a real reach. A resolve failure must NEVER fail an
// already-durable submit — every fault is caught + logged (invariant 9, not silent).
async function resolveBotLoginAlertFailOpen(db: ReportLeaseDb, showId: string | null): Promise<void> {
  if (!botLoginConfigured()) return; // no query when unset (no false-close)
  try {
    await db.query(
      `UPDATE admin_alerts SET resolved_at = now()
        WHERE code = 'GITHUB_BOT_LOGIN_MISSING' AND show_id IS NULL AND resolved_at IS NULL`,
    );
  } catch (cause) {
    void log.warn("bot-login alert resolve failed (non-fatal)", {
      source: "reports.submit",
      code: "CREW_REPORT_SUBMITTED",
      showId,
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
```

Then, before the normal-create `return { status: 201, ... }` (`:1089`):

```ts
      await resolveBotLoginAlertFailOpen(db, body.show_id);
      return { status: 201, body: successBody(auth, "created", issue.htmlUrl) };
```

And before the expired-lease-retry `return { status: 201, ... }` (`:956`, inside
`handleExpiredLeaseRetry`) — use that function's in-scope `db` + show id (`ageRow.show_id ?? body.show_id`):

```ts
  await resolveBotLoginAlertFailOpen(db, ageRow.show_id ?? body.show_id);
  return { status: 201, body: successBody(auth, "created", issue.htmlUrl) };
```

(Import `botLoginConfigured` from `@/lib/reports/botLoginAlert`. Reuse the existing `log` import and
`ReportLeaseDb` type. `code: "CREW_REPORT_SUBMITTED"` is an already-cataloged non-error breadcrumb —
do NOT introduce a new §12.4 code. Confirm the exact in-scope `db`/show-id identifiers at each site
when implementing; `:956` uses the same `successBody(auth, "created", issue.htmlUrl)` shape.)

- [ ] **Step 12: Run to verify it passes**

Run: `pnpm vitest run tests/reports/submit.botLoginResolve.test.ts tests/reports/botLoginAlert.test.ts tests/notify/runMaintenance.botLogin.test.ts`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add lib/reports/botLoginAlert.ts lib/notify/runNotify.ts lib/reports/submit.ts tests/reports/botLoginAlert.test.ts tests/notify/runMaintenance.botLogin.test.ts tests/reports/submit.botLoginResolve.test.ts
git commit --no-verify -m "feat(notify): auto-resolve GITHUB_BOT_LOGIN_MISSING via env-presence reconcile (cron + fail-open submit)"
```

---

## Task 2: `resolution` catalog metadata + derived predicate/note + registry parity

**Files:**
- Modify: `lib/messages/catalog.ts` (`MessageCatalogEntry` type + all 42 alert-code entries)
- Modify: `lib/adminAlerts/audience.ts`
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts` (reclassify `GITHUB_BOT_LOGIN_MISSING`; parity assertion)
- Modify: `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md` (§3 row + counts)
- Test: `tests/adminAlerts/autoResolving.test.ts`

**Interfaces:**
- Produces: `MessageCatalogEntry.resolution?: "auto" | "manual"`; `AUTO_RESOLVING_CODES: string[]`; `isAutoResolving(code: string): boolean`; `autoResolveNote(code: string): string`.

- [ ] **Step 1: Write the failing derivation test**

```ts
// tests/adminAlerts/autoResolving.test.ts
import { describe, expect, test } from "vitest";
import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";

describe("isAutoResolving", () => {
  test("auto codes true, manual codes false, unknown false (fail-visible)", () => {
    expect(isAutoResolving("EMAIL_NOT_CONFIGURED")).toBe(true);
    expect(isAutoResolving("SYNC_STALLED")).toBe(true);
    expect(isAutoResolving("GITHUB_BOT_LOGIN_MISSING")).toBe(true);
    expect(isAutoResolving("BRANCH_PROTECTION_DRIFT")).toBe(false); // deferred → manual
    expect(isAutoResolving("OAUTH_IDENTITY_CLAIMED")).toBe(false); // event → manual
    expect(isAutoResolving("SOMETHING_UNCATALOGED")).toBe(false); // unknown → fail-visible
  });
  test("autoResolveNote returns human copy, never a code, with a generic fallback", () => {
    expect(autoResolveNote("EMAIL_NOT_CONFIGURED")).toMatch(/email/i);
    expect(autoResolveNote("SOMETHING_UNCATALOGED")).toMatch(/clears automatically/i);
    expect(autoResolveNote("EMAIL_NOT_CONFIGURED")).not.toMatch(/EMAIL_NOT_CONFIGURED/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/adminAlerts/autoResolving.test.ts`
Expected: FAIL — `isAutoResolving`/`autoResolveNote` not exported.

- [ ] **Step 3: Add the `resolution` field to the catalog type**

In `lib/messages/catalog.ts`, after `healthWeight?` in `MessageCatalogEntry`:

```ts
  /**
   * Resolution class (alert-resolve-truthing §3). "auto" = the system resolves this
   * code itself at recovery (a manual button would be a misleading no-op → suppressed);
   * "manual" = one-shot acknowledgment, manual resolve is the disposition. Absent on
   * non-admin_alerts codes (crew/report/inbox copy that never becomes an alert row).
   */
  resolution?: "auto" | "manual";
```

- [ ] **Step 4: Tag all 42 alert codes with `resolution`**

Add `resolution: "auto"` to the 22 auto codes (the 7 precedent-AUTO + 14 NEW from the 2026-07-03 registry + `GITHUB_BOT_LOGIN_MISSING`) and `resolution: "manual"` to the 20 manual codes (18 EVENT-bucket incl. `TILE_SERVER_RENDER_FAILED` + the 2 `BRANCH_PROTECTION_*` deferred). The authoritative class per code is the registry at `tests/messages/_metaAdminAlertCatalog.test.ts` — `auto → "auto"`, everything else → `"manual"`. (Task 2 Step 8's parity test is the guard; if any code is mis-tagged it fails.)

- [ ] **Step 5: Add derivations to `audience.ts`**

```ts
/** Every `resolution: "auto"` code — self-resolving; the manual button is suppressed. */
export const AUTO_RESOLVING_CODES: string[] = entries
  .filter((entry) => entry.resolution === "auto")
  .map((entry) => entry.code);

const AUTO_RESOLVING_SET = new Set(AUTO_RESOLVING_CODES);

/** True iff a code self-resolves. Unknown/uncataloged → false (fail-visible: the
 * manual button still renders, so an unrecognized actionable alert is never hidden). */
export function isAutoResolving(code: string): boolean {
  return AUTO_RESOLVING_SET.has(code);
}

// Per-code auto-clear note; codes absent here fall back to the generic line. Human
// copy only (invariant 5) — never a raw code, never interpolates untrusted context.
const AUTO_RESOLVE_NOTES: Record<string, string> = {
  EMAIL_NOT_CONFIGURED: "Clears automatically once email notifications are configured on the deployment.",
  EMAIL_DELIVERY_FAILED: "Clears automatically once email deliveries recover.",
  GITHUB_BOT_LOGIN_MISSING: "Clears automatically once GITHUB_BOT_LOGIN is set on the deployment.",
  SYNC_STALLED: "Clears automatically once the sync heartbeat recovers.",
  WATCH_CHANNEL_ORPHANED: "Clears automatically once the Drive watch channel re-subscribes (use Retry to trigger it now).",
};

export function autoResolveNote(code: string): string {
  return (
    AUTO_RESOLVE_NOTES[code] ??
    "Clears automatically when the system detects recovery — no action needed here."
  );
}
```

- [ ] **Step 6: Run the derivation test to verify it passes**

Run: `pnpm vitest run tests/adminAlerts/autoResolving.test.ts`
Expected: FAIL on `GITHUB_BOT_LOGIN_MISSING` if the registry still says `deferred` (Step 4 tagged it `auto`, but parity must hold). Proceed to Step 7 to reclassify the registry, THEN re-run.

- [ ] **Step 7: Reclassify `GITHUB_BOT_LOGIN_MISSING` in the registry + fix counts + add parity assertion (H1 — real registry shape)**

The registry constant is **`ADMIN_ALERTS_LIFECYCLE`** (`_metaAdminAlertCatalog.test.ts:271`), NOT
`REGISTRY`, and `ResolveSite = { file: string; pattern: RegExp }` (`:264`) — the "auto code's resolve
site exists on disk" test greps each `site.pattern` against the file (`:639-645`). Change the
`GITHUB_BOT_LOGIN_MISSING` row (`:440`) from `{ class: "deferred" }` to (real function-name regexes,
which land in Task 1):

```ts
  GITHUB_BOT_LOGIN_MISSING: {
    class: "auto",
    resolveSites: [
      { file: "lib/reports/botLoginAlert.ts", pattern: /resolveBotLoginAlertRow/ },
      { file: "lib/reports/submit.ts", pattern: /resolveBotLoginAlertFailOpen/ },
    ],
  },
```

Also update the **count assertion** that pins the auto total: `:628`
`expect(autoCodes.length, "spec §3 pins 21 auto codes ...").toBe(21)` → `.toBe(22)` with an updated
message (`22 auto = 7 precedent + 14 NEW + GITHUB_BOT_LOGIN_MISSING`), and the matching inline comment
`:627` (`21 auto codes` → `22 auto codes`). Update the **header comment block** `:259-262`:
`7 precedent AUTO + 14 NEW = 21 "auto"` → `... + GITHUB_BOT_LOGIN_MISSING = 22 "auto"`; `3 "deferred"`
→ `2 "deferred"`; and the arithmetic `21 + 17 + 1 + 3 = 42` → `22 + 17 + 1 + 2 = 42`. (Grep the file for
any other `21`/`3 "deferred"`/`deferred` count references and reconcile — numeric sweep.)

Add a parity test (real constant names — `ADMIN_ALERTS_LIFECYCLE`, `ADMIN_ALERTS_CODES`, `MESSAGE_CATALOG`):

```ts
test("catalog.resolution matches registry class for all 42 codes", () => {
  for (const code of ADMIN_ALERTS_CODES) {
    const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
    const expected = ADMIN_ALERTS_LIFECYCLE[code].class === "auto" ? "auto" : "manual";
    expect(entry?.resolution, `${code} resolution`).toBe(expected);
  }
});
```

(`ADMIN_ALERTS_CODES` and `MESSAGE_CATALOG` are already imported/in-scope in this test file; confirm the
import lines when implementing.)

- [ ] **Step 8: Run the meta-test + derivation test**

Run: `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/adminAlerts/autoResolving.test.ts`
Expected: PASS (all 42 parity, GITHUB_BOT_LOGIN_MISSING now auto with resolve sites).

- [ ] **Step 9: Update the 2026-07-03 spec §3 + counts**

In `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md`: move the `GITHUB_BOT_LOGIN_MISSING` §3 row (`:94`) from `DEFER` to auto (cite the two resolve sites); update §3 line 51 counts `7 AUTO · 14 NEW · 18 EVENT · 3 DEFER` → `7 AUTO · 15 NEW · 18 EVENT · 2 DEFER`; add a one-line note that `2026-07-04-alert-resolve-truthing` supersedes this row. Do NOT touch the two `BRANCH_PROTECTION_*` rows. Edit surgically (no prettier).

- [ ] **Step 10: Commit**

```bash
git add lib/messages/catalog.ts lib/adminAlerts/audience.ts tests/messages/_metaAdminAlertCatalog.test.ts tests/adminAlerts/autoResolving.test.ts docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md
git commit --no-verify -m "feat(admin): promote alert resolution class to runtime catalog + reclassify GITHUB_BOT_LOGIN_MISSING auto"
```

---

## Task 3: `HealthAlertsPanel` — button→note for auto codes

**Files:**
- Modify: `components/admin/telemetry/HealthAlertsPanel.tsx` (`HealthAlertRowItem`, line 142)
- Test: `tests/components/admin/healthAlertsPanel.autoResolve.test.tsx`

- [ ] **Step 1: Write the failing render test**

```tsx
// Render HealthAlertRowItem (or the panel) for one auto code and one manual code.
// Auto → asserts data-testid `health-alert-autoclear-<id>` present AND
// `health-alert-resolve-<id>` (the button) absent. Manual → button present, note absent.
// Scope the query to the row under test (clone-and-strip siblings) per anti-tautology.
```

Write against the panel's existing test harness (`tests/components/admin/*telemetry*` / health panel tests). Use an auto code (`EMAIL_NOT_CONFIGURED`) row and a manual code (`TILE_SERVER_RENDER_FAILED`) row.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/admin/healthAlertsPanel.autoResolve.test.tsx`
Expected: FAIL — the button renders unconditionally today.

- [ ] **Step 3: Implement the swap**

In `HealthAlertsPanel.tsx`, add `import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";` and replace line 142 (`<HealthAlertResolveButton alertId={row.id} />`) with:

```tsx
      {isAutoResolving(row.code) ? (
        <p
          data-testid={`health-alert-autoclear-${row.id}`}
          className="text-xs text-text-subtle"
        >
          {autoResolveNote(row.code)}
        </p>
      ) : (
        <HealthAlertResolveButton alertId={row.id} />
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/admin/healthAlertsPanel.autoResolve.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/telemetry/HealthAlertsPanel.tsx tests/components/admin/healthAlertsPanel.autoResolve.test.tsx
git commit --no-verify -m "feat(admin): HealthAlertsPanel renders auto-clear note for self-resolving codes"
```

---

## Task 4: `PerShowAlertSection` — broaden suppression to `isAutoResolving`

**Files:**
- Modify: `components/admin/PerShowAlertSection.tsx` (line 322 ternary)
- Test: `tests/components/admin/perShowAlertReadOnly.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Extend the existing read-only test: a non-inbox auto doug code (`SHOW_UNPUBLISHED`) row → `per-show-alert-autoclear-<id>` present, `PerShowAlertResolveButton` absent; an inbox code (`SHEET_UNAVAILABLE`) → keeps its bespoke "sheet is back" copy; a manual code (`OAUTH_IDENTITY_CLAIMED` if per-show, else another manual per-show code) → button present.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/admin/perShowAlertReadOnly.test.tsx`
Expected: FAIL — `SHOW_UNPUBLISHED` still shows a button.

- [ ] **Step 3: Implement the three-way ternary**

Add `import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";`. Replace the `isInboxRouted(alert.code) ? (...) : (<PerShowAlertResolveButton .../>)` block (line 322-335) with:

```tsx
              {isInboxRouted(alert.code) ? (
                <p data-testid={`per-show-alert-autoclear-${alert.id}`} className="text-xs text-text-subtle">
                  Clears automatically once the sheet is back or re-parses.
                </p>
              ) : isAutoResolving(alert.code) ? (
                <p data-testid={`per-show-alert-autoclear-${alert.id}`} className="text-xs text-text-subtle">
                  {autoResolveNote(alert.code)}
                </p>
              ) : (
                <PerShowAlertResolveButton alertId={alert.id} slug={slug} />
              )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/admin/perShowAlertReadOnly.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PerShowAlertSection.tsx tests/components/admin/perShowAlertReadOnly.test.tsx
git commit --no-verify -m "feat(admin): PerShowAlertSection suppresses manual resolve for all auto-resolving codes"
```

---

## Task 5: `AlertBanner` — note in left column, keep Retry (+ real-browser layout)

**Files:**
- Modify: `components/admin/AlertBanner.tsx` (footer left column ~`:435`; action cell ~`:479-496`; dismiss slot ~`:424`)
- Test: `tests/components/admin/alertBanner.autoResolve.test.tsx` (jsdom render) + `tests/e2e/alert-banner-autoresolve-layout.spec.ts` (Playwright layout)

**Interfaces:**
- Consumes: `isAutoResolving`, `autoResolveNote`.

- [ ] **Step 1: Write the failing jsdom render test**

The note lives in the left-column footer (`:435`), which is **inside `data-testid="admin-alert-panel"`
— the expanded `<details>` panel, `display:none` by default in real CSS** (jsdom does not apply the
`details:not([open]) ~ panel` rule, so jsdom sees it in the DOM regardless; the genuine-visibility
proof is the Step 5 real-browser assertion, H4). For `SYNC_STALLED` (global non-watch auto): assert
`admin-alert-autoclear` is present **within the `admin-alert-panel` subtree** (scope the query to the
panel node, anti-tautology) AND the `admin-alert-action` cell renders no resolve form (no
`admin-alert-id-input` inside `admin-alert-action`). For `WATCH_CHANNEL_ORPHANED` (auto watch): assert
the Retry form present AND `admin-alert-autoclear` present AND the panel dismiss form
(`admin-alert-panel-dismiss`) absent. For a manual global code: resolve form present, no autoclear note.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/admin/alertBanner.autoResolve.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the banner changes**

Add `import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";`. In the
**left-column footer** (`mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-subtle`,
~`:435`, which is inside the expanded `admin-alert-panel`), append after the "+N more" link — the note
is **expanded-panel-only** by design (spec §4.5): the collapsed banner shows the message + Details
caret and *no* action affordance for a non-watch auto code (honest, no misleading button), and the note
appears on expand:

```tsx
            {isAutoResolving(alert.code) ? (
              <p data-testid="admin-alert-autoclear" className="basis-full text-text-subtle">
                {autoResolveNote(alert.code)}
              </p>
            ) : null}
```

In the **action cell** (`:454-498`), gate the non-watch resolve form and the watch dismiss:
- The non-watch `else` branch (`:487-497`): render the resolve `<form>` only when `!isAutoResolving(alert.code)`; otherwise render nothing (the note shows on expand in the footer). `actionLink`/per-show-link branches are unaffected.
- The watch branch keeps the Retry form unconditionally (Retry is not a manual resolve).

In the **expanded panel dismiss slot** (`isWatchAlert` dismiss form, `:424-433`, `admin-alert-panel-dismiss`): render it only when `!isAutoResolving(alert.code)`.

- [ ] **Step 4: Run the jsdom test to verify it passes**

Run: `pnpm vitest run tests/components/admin/alertBanner.autoResolve.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the real-browser layout assertion (spec §4.5 — must OPEN the panel, H4)**

```ts
// tests/e2e/alert-banner-autoresolve-layout.spec.ts (Playwright; harness precedent tests/e2e/)
// Render the banner for SYNC_STALLED and WATCH_CHANNEL_ORPHANED at 360px and 1024px.
// The note lives in admin-alert-panel, which is display:none until <details open>, so FIRST
// open the panel (click the summary, or set the `open` attribute on the <details>) — a
// collapsed note has a zero rect and a non-overlap check would pass tautologically.
// Then assert (a) the note is GENUINELY VISIBLE: its getBoundingClientRect() width AND height
//   are both > 0 (not display:none);
//        (b) section.scrollWidth <= section.clientWidth (no horizontal overflow);
//        (c) the note's bounding rect does not overlap the action cell's rect.
```

Follow the project's real-browser harness precedent (seeded alert row → `/admin` render, or the
standalone-render harness). **Open the `<details>` before measuring.** Assert the note rect is
non-zero (width and height `> 0`), `scrollWidth <= clientWidth`, and non-overlapping
`getBoundingClientRect()` for `[data-testid=admin-alert-autoclear]` vs `[data-testid=admin-alert-action]`,
at both widths.

- [ ] **Step 6: Run the layout spec**

Run: `pnpm exec playwright test tests/e2e/alert-banner-autoresolve-layout.spec.ts` (or the project's e2e command).
Expected: PASS at both widths.

- [ ] **Step 7: Commit**

```bash
git add components/admin/AlertBanner.tsx tests/components/admin/alertBanner.autoResolve.test.tsx tests/e2e/alert-banner-autoresolve-layout.spec.ts
git commit --no-verify -m "feat(admin): AlertBanner shows auto-clear note (left column) + keeps Retry for auto codes"
```

---

## Task 6: Fail-closed guards on the four manual-resolve doors

**Files:**
- Modify: `app/admin/actions.ts` (`resolveHealthAlertFormAction` ~`:224`; `resolveAdminAlertFormAction` ~`:46`)
- Modify: `app/api/admin/admin-alerts/[id]/resolve/route.ts` (~`:117` HEALTH_CODES branch)
- Modify: `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` (~`:124-131`)
- Test: `tests/admin/resolveAutoCodeGuard.test.ts` (+ extend existing route/action tests)

- [ ] **Step 1: Write the failing guard tests**

For each door: given an **auto** code row, assert NO `resolved_at` UPDATE is issued (zero-row / no write) and the door returns its no-op/forbidden shape; given a **manual** code row, resolve still succeeds. Include the **regression pin**: the internal `resolveAdminAlert({ code: "EMAIL_NOT_CONFIGURED" })` (email-detector path) still succeeds — the guard is at the UI door only.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/admin/resolveAutoCodeGuard.test.ts`
Expected: FAIL — auto codes currently resolvable via the doug doors.

- [ ] **Step 3: Implement the guards**

Add `import { isAutoResolving } from "@/lib/adminAlerts/audience";` to each file.
- `resolveHealthAlertFormAction` (`app/admin/actions.ts`, after `if (!HEALTH_CODES.includes(code)) return;` ~`:224`): `if (isAutoResolving(code)) return;`
- `resolveAdminAlertFormAction` (after its `code` lookup + HEALTH_CODES guard): `if (isAutoResolving(code)) return;`
- Global route (`:117` region, beside the `HEALTH_CODES.includes(row.code)` branch): add an `isAutoResolving(row.code)` branch returning the same "leave resolved_at unchanged" shape.
- Per-show route (`:124-131`, beside the `HEALTH_CODES` + `isInboxRouted` branches): add `isAutoResolving(row.code)` rejection, same shape.

Do NOT touch `lib/adminAlerts/resolveAdminAlert.ts` (internal helper stays permissive — email detector depends on it).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/admin/resolveAutoCodeGuard.test.ts`
Expected: PASS (incl. the internal-helper regression pin).

- [ ] **Step 5: Commit**

```bash
git add app/admin/actions.ts "app/api/admin/admin-alerts/[id]/resolve/route.ts" "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts" tests/admin/resolveAutoCodeGuard.test.ts
git commit --no-verify -m "feat(admin): reject manual resolve of auto-resolving codes at the UI doors (internal helper stays permissive)"
```

---

## Task 7: Fix `AMBIGUOUS_EMAIL_BINDING` copy + manual-copy meta-test guard

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (helpfulContext prose ~`:3091`)
- Regen: `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`)
- Modify: `lib/messages/catalog.ts` (`AMBIGUOUS_EMAIL_BINDING` `helpfulContext` `:54`, `longExplanation` `:57`)
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts` (manual-copy guard)
- Test: covered by the meta-test + x1-catalog-parity.

- [ ] **Step 1: Write the failing manual-copy guard**

```ts
test("no resolution:manual code promises auto-clear in its copy", () => {
  const BANNED = /clears? automatically|clear on the next sync|auto-?clear/i;
  const EXEMPT = new Set<string>([]); // none
  for (const code of ADMIN_ALERTS_CODES) {
    if (MESSAGE_CATALOG[code]?.resolution !== "manual" || EXEMPT.has(code)) continue;
    for (const field of ["dougFacing", "helpfulContext", "longExplanation"] as const) {
      const copy = MESSAGE_CATALOG[code]?.[field] ?? "";
      expect(copy, `${code}.${field}`).not.toMatch(BANNED);
    }
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts -t "auto-clear"`
Expected: FAIL on `AMBIGUOUS_EMAIL_BINDING.helpfulContext` / `.longExplanation`.

- [ ] **Step 3: Fix the master-spec prose (surgical, no prettier)**

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` line ~3091, replace the trailing sentence "Once you correct the duplicate in your sheet, this alert will clear automatically on the next sync." with manual-confirm copy consistent with §4.6: "Once you correct the duplicate in your sheet, mark this alert resolved from the affected show's page." Edit only that line.

- [ ] **Step 4: Regenerate spec-codes**

Run: `pnpm gen:spec-codes`
Then confirm `lib/messages/__generated__/spec-codes.ts` `AMBIGUOUS_EMAIL_BINDING.helpfulContext` updated.

- [ ] **Step 5: Update `catalog.ts`**

Edit `lib/messages/catalog.ts:54` (`helpfulContext`) and `:57` (`longExplanation`) to the same manual-confirm wording (drop "clear automatically on the next sync" / "clear on the next sync").

- [ ] **Step 6: Run the guard + x1 parity**

Run: `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/`
Expected: PASS (manual-copy guard green; x1-catalog-parity green — the §12.4 table row at line 2780 was already auto-clear-free, so only the helpfulContext prose block changed).

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts tests/messages/_metaAdminAlertCatalog.test.ts
git commit --no-verify -m "fix(messages): AMBIGUOUS_EMAIL_BINDING copy no longer promises auto-clear (manual code) + meta-test guard"
```

---

## Task 8: DEFERRED.md branch-protection note + docs sweep

**Files:**
- Modify: `DEFERRED.md`

- [ ] **Step 1: Add the DEFERRED.md entry**

Add an entry noting: `BRANCH_PROTECTION_DRIFT` / `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` stay `class: deferred` (manual button retained) because their detector job is `if: false` (`.github/workflows/x-audits.yml:443,474`, X6-D-1 solo-dev variant). **Re-enable trigger:** if the X6-D-1 verify-branch-protection jobs are re-enabled, add resolve-on-clean at `scripts/verify-branch-protection.ts:334-337` (success branch, existing service-role client `:70`, `localSupabaseReason` skip `:63`) and reclassify both to `auto` (registry + catalog `resolution`).

- [ ] **Step 2: Verify the note is consistent + no stale counts**

Run: `rg -n "22|20|15 NEW|2 DEFER|BRANCH_PROTECTION" docs/superpowers/specs/2026-07-04-alert-resolve-truthing.md DEFERRED.md` and confirm consistency.

- [ ] **Step 3: Commit**

```bash
git add DEFERRED.md
git commit --no-verify -m "docs(plan): record branch-protection auto-resolution deferral (X6-D-1 detector disabled)"
```

---

## Task 9: Full-suite gate + impeccable dual-gate + close-out

**Files:** none new (verification + gates).

- [ ] **Step 1: Full suite + typecheck + format**

Run: `pnpm typecheck && pnpm vitest run && pnpm format:check`
Expected: green. Triage any failure env (psql/DB) vs real. Broad breakage in a shared chokepoint = design signal — investigate, don't paper over.

- [ ] **Step 2: Meta-test re-run (fragility sweep)**

Run: `pnpm vitest run tests/messages/ tests/admin/ tests/adminAlerts/` — confirm `_metaAdminAlertCatalog`, `_metaInfraContract`, catalog parity, and the new guards all green after every edit (structural meta-tests are comment/format-fragile).

- [ ] **Step 3: Impeccable dual-gate (invariant 8, UI surfaces)**

Run `/impeccable critique` AND `/impeccable audit` on the diff for `HealthAlertsPanel.tsx`, `PerShowAlertSection.tsx`, `AlertBanner.tsx` (external, not self-attested). Fix every HIGH/CRITICAL or record in `DEFERRED.md` with a concrete trigger. Record findings + dispositions.

- [ ] **Step 4: Commit any impeccable fixes**

```bash
git add -A && git commit --no-verify -m "fix(admin): impeccable dual-gate findings on alert auto-clear surfaces"
```

---

## Self-review checklist (run before adversarial review)

- [ ] Spec coverage: §3 (Task 2), §4.1 (Task 3), §4.2 (Task 4), §4.3/§4.5 (Task 5), §4.6 (Task 7), §5 (Task 6), §6 (Task 1+2), §7 (Task 2+7+8), §11 branch-protection (Task 8), §12 (Task 9). No gaps.
- [ ] Type consistency: `isAutoResolving`/`autoResolveNote`/`AUTO_RESOLVING_CODES`/`botLoginConfigured` names identical across all tasks.
- [ ] No placeholders: every code step shows the code.
- [ ] Anti-tautology: render tests scope to the row-under-test (clone-and-strip); layout expectations derive from real-browser rects, not hardcoded.

## Adversarial review (cross-model)

After self-review passes, invoke `adversarial-review` (reviewer = Codex) on this plan; iterate to APPROVE (no round budget). Only then proceed to execution.
