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
- **Create** `lib/reports/botLoginAlert.ts` — `botLoginConfigured(env)` presence predicate.
- **Modify** `lib/reports/submit.ts` — opportunistic fail-open raw resolve on submit success.
- **Modify** `lib/notify/runNotify.ts` — `MaintenanceDeps.resolveBotLoginAlert` + invocation in `runMaintenance`.
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
- Create: `lib/reports/botLoginAlert.ts`
- Modify: `lib/notify/runNotify.ts` (`MaintenanceDeps` ~`:71-82`; `runMaintenance` after email reconcile ~`:206`)
- Modify: `lib/reports/submit.ts` (success path ~`:1086`, before the 201 return; raw resolve mirroring `upsertAdminAlert` at `:643`)
- Test: `tests/reports/botLoginAlert.test.ts`, `tests/notify/runMaintenance.botLogin.test.ts`, `tests/reports/submit.botLoginResolve.test.ts`

**Interfaces:**
- Produces: `botLoginConfigured(env?: NodeJS.ProcessEnv): boolean`; a cron resolver `resolveBotLoginAlert(): Promise<void>` (service-role update) wired as `MaintenanceDeps.resolveBotLoginAlert`; a submit-side fail-open raw resolve.

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

- [ ] **Step 5: Write the failing cron-resolver test**

```ts
// tests/notify/runMaintenance.botLogin.test.ts
import { describe, expect, test, vi } from "vitest";
import { runMaintenance } from "@/lib/notify/runNotify";

// runMaintenance is exercised via its deps seam; assert the bot-login resolver
// is invoked once per maintenance run (the default reads process.env internally).
describe("runMaintenance bot-login resolve", () => {
  test("invokes resolveBotLoginAlert once", async () => {
    const resolveBotLoginAlert = vi.fn(async () => {});
    await runMaintenance({
      readHeartbeat: async () => ({ kind: "ok", heartbeat: new Date(0) }),
      detectAndResolveStall: (async () => ({ kind: "ok", opened: 0, resolved: 0 })) as never,
      resolveRecoveredSyncProblems: async () => ({ kind: "ok" }),
      reconcileEmailDeliveryState: (async () => ({ kind: "ok", opened: 0, resolved: 0 })) as never,
      getAlertOnSyncProblems: async () => ({ kind: "known", value: false }) as never,
      getAlertOnAutoPublish: async () => ({ kind: "known", value: false }) as never,
      getDailyReviewDigest: async () => ({ kind: "known", value: false }) as never,
      configValid: () => ({ ok: true }) as never,
      resolveBotLoginAlert,
      now: new Date(0),
    });
    expect(resolveBotLoginAlert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run tests/notify/runMaintenance.botLogin.test.ts`
Expected: FAIL — `resolveBotLoginAlert` not part of `MaintenanceDeps` / not invoked.

- [ ] **Step 7: Add the dep + default resolver + invocation**

In `lib/notify/runNotify.ts`, add to `MaintenanceDeps`:

```ts
  reconcileEmailDeliveryState?: typeof reconcileEmailDeliveryState;
  resolveBotLoginAlert?: () => Promise<void>; // alert-resolve-truthing §6.2
```

Add the default resolver (top-level in the module) — service-role direct update, invariant-9:

```ts
import { botLoginConfigured } from "@/lib/reports/botLoginAlert";

// alert-resolve-truthing §6.2: resolve the global GITHUB_BOT_LOGIN_MISSING row when
// the env is configured. Direct admin_alerts UPDATE (the code is a NON_UPSERT
// producer, not in AdminAlertCode). Invariant-9: destructure { data, error }; a
// returned error surfaces a typed fault, never a silent success.
// not-subject-to-meta: standalone maintenance reconciler; no typed-result contract —
// throws propagate to the notify cron's fault envelope (matching reconcileEmailDeliveryState).
async function resolveBotLoginAlert(): Promise<void> {
  if (!botLoginConfigured()) return; // no Supabase call when unset
  const supabase = createSupabaseServiceRoleClient();
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

In `runMaintenance`, immediately after the `reconcileEmailDeliveryState` call (~`:206`), invoke it:

```ts
  await (deps.resolveBotLoginAlert ?? resolveBotLoginAlert)();
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run tests/notify/runMaintenance.botLogin.test.ts`
Expected: PASS. (If `runMaintenance`'s dep-injection shape differs, adapt the harness to the real signature — the assertion "resolver invoked once per run" is the contract.)

- [ ] **Step 9: Write the failing submit fail-open test**

```ts
// tests/reports/submit.botLoginResolve.test.ts — asserts the R2 F4 fail-open contract:
// a resolve UPDATE that throws must NOT turn a durable 201 submit into a failure, and
// a submit success with GITHUB_BOT_LOGIN unset must NOT fire a resolve (R1 F2).
// (Harness mirrors the existing submit success-path test; the DB adapter's resolve
// query is stubbed to throw, and the return status is asserted 201.)
```

Write the concrete test against the existing `submit.ts` test harness pattern (see `tests/reports/submit.*.test.ts`): (a) success path + `GITHUB_BOT_LOGIN` set + resolve query throws → status 201 still returned; (b) success path + `GITHUB_BOT_LOGIN` unset → resolve query never issued.

- [ ] **Step 10: Run to verify it fails**

Run: `pnpm vitest run tests/reports/submit.botLoginResolve.test.ts`
Expected: FAIL — no resolve on success path yet.

- [ ] **Step 11: Add the fail-open submit resolve**

In `lib/reports/submit.ts`, on the 201 success path (after `writeIssueUrl` succeeds, before `return { status: 201, ... }` ~`:1086`), add:

```ts
      // alert-resolve-truthing §6.2: opportunistic, FAIL-OPEN resolve of the global
      // GITHUB_BOT_LOGIN_MISSING alert when the bot login is configured. Re-reads the
      // env explicitly (a normal create never touches it), so a false-close is
      // impossible. A resolve failure must NEVER fail an already-durable submit.
      if (botLoginConfigured()) {
        try {
          await db.query(
            `UPDATE admin_alerts SET resolved_at = now()
              WHERE code = 'GITHUB_BOT_LOGIN_MISSING' AND show_id IS NULL AND resolved_at IS NULL`,
          );
        } catch (cause) {
          void log.warn("bot-login alert resolve failed (non-fatal)", {
            source: "reports.submit",
            code: "CREW_REPORT_SUBMITTED",
            showId: body.show_id,
            detail: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
```

(Import `botLoginConfigured` from `@/lib/reports/botLoginAlert`. Reuse the existing `log` import. `code: "CREW_REPORT_SUBMITTED"` is an already-cataloged non-error breadcrumb — do NOT introduce a new §12.4 code.)

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

- [ ] **Step 7: Reclassify `GITHUB_BOT_LOGIN_MISSING` in the registry + add parity assertion**

In `tests/messages/_metaAdminAlertCatalog.test.ts`, change the `GITHUB_BOT_LOGIN_MISSING` registry row (`:440`) from `{ class: "deferred" }` to:

```ts
  GITHUB_BOT_LOGIN_MISSING: {
    class: "auto",
    resolveSites: [
      { file: "lib/notify/runNotify.ts", detail: "resolveBotLoginAlert (env-presence reconcile)" },
      { file: "lib/reports/submit.ts", detail: "fail-open resolve on configured submit success" },
    ],
  },
```

Add a parity test:

```ts
test("catalog.resolution matches registry class for all 42 codes", () => {
  for (const code of ADMIN_ALERTS_CODES) {
    const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
    const expected = REGISTRY[code].class === "auto" ? "auto" : "manual";
    expect(entry?.resolution, `${code} resolution`).toBe(expected);
  }
});
```

(Use the file's existing registry constant name and code-list constant; adapt identifiers to the live file.)

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

For `SYNC_STALLED` (global non-watch auto): assert `admin-alert-autoclear` present in the left column, `admin-alert-action` cell renders no resolve form. For `WATCH_CHANNEL_ORPHANED` (auto watch): assert the Retry form present AND `admin-alert-autoclear` present AND the dismiss form absent. For a manual global code: resolve form present, no autoclear note.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/admin/alertBanner.autoResolve.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the banner changes**

Add `import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";`. In the **left-column footer** (`mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-subtle`, ~`:435`), append after the "+N more" link:

```tsx
            {isAutoResolving(alert.code) ? (
              <p data-testid="admin-alert-autoclear" className="basis-full text-text-subtle">
                {autoResolveNote(alert.code)}
              </p>
            ) : null}
```

In the **action cell** (`:479-496`), gate the non-watch resolve form and the watch retry/dismiss:
- The non-watch `else` branch (`:488-496`): render the resolve `<form>` only when `!isAutoResolving(alert.code)`; otherwise render nothing (the note already shows in the footer).
- The watch branch keeps the Retry form unconditionally (Retry is not a manual resolve).

In the **expanded dismiss slot** (`isWatchAlert` dismiss form, `:424-432`): render it only when `!isAutoResolving(alert.code)`.

- [ ] **Step 4: Run the jsdom test to verify it passes**

Run: `pnpm vitest run tests/components/admin/alertBanner.autoResolve.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the real-browser layout assertion (spec §4.5)**

```ts
// tests/e2e/alert-banner-autoresolve-layout.spec.ts (Playwright; harness precedent tests/e2e/)
// Render the banner for SYNC_STALLED and WATCH_CHANNEL_ORPHANED at 360px and 1024px.
// Assert (a) section.scrollWidth <= section.clientWidth (no horizontal overflow) and
// (b) the auto-clear note's bounding rect does not overlap the action cell's rect.
```

Follow the project's real-browser harness precedent (seeded alert row → `/admin` render, or the standalone-render harness). Assert `scrollWidth <= clientWidth` and non-overlapping `getBoundingClientRect()` for `[data-testid=admin-alert-autoclear]` vs `[data-testid=admin-alert-action]`.

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
