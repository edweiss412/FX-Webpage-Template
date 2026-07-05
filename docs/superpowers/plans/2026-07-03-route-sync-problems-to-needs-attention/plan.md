# Route sync-problem alerts to Needs attention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two per-show sync-problem admin-alert codes (`SHEET_UNAVAILABLE`, `PARSE_ERROR_LAST_GOOD`) from the dismissible `AlertBanner` into the Needs attention inbox as auto-clearing to-dos, with a three-layer app-level "no manual Dismiss" UX guard.

**Architecture:** The `admin_alerts` row stays the source of truth (email/digest/recovery pipeline unchanged). A new catalog field `adminSurface:"inbox"` marks the two codes; a shared `lib/messages/adminSurface.ts` module drives banner/bell exclusion AND a new third stream in `buildNeedsAttention`/`loadNeedsAttention`/`needsAttentionCount`. The no-Dismiss guard is enforced at three app layers: the per-show UI omits the resolve button, the resolve routes reject with a plain 409, and the shared `resolveAdminAlert(s)` helper throws. No migration, no advisory locks, no DB-tamper hardening (ratified out of scope).

**Tech Stack:** Next.js 16, React Server Components, Supabase (PostgREST + postgres.js), Tailwind v4, Vitest, TypeScript.

## Global Constraints

- **Spec is canonical:** `docs/superpowers/specs/2026-07-03-route-sync-problems-to-needs-attention.md`. Where this plan references a spec section, the spec's detail governs.
- **Scope (ratified UX safety net, spec §1.2/§7):** no DB REVOKE/trigger/RPC, no deploy backfill, no advisory locks, no migration. Raw-DB/PostgREST tamper is OUT OF SCOPE.
- **TDD per task:** failing test → run-fail → minimal impl → run-pass → commit. One task per commit.
- **Commit style:** `<type>(<scope>): <summary>` (scopes here: `messages`, `admin`, `crew-page`/`notify` as apt). `--no-verify` (shared hook belongs to the main checkout); run `pnpm format:check` + `pnpm typecheck` before push.
- **Invariant 5:** no raw error codes in user-visible UI (copy via `lib/messages/lookup.ts`). Invariant 9: every Supabase await destructures `{ data, error }` and returns a typed `infra_error`.
- **No §12.4 catalog-row edit.** `adminSurface` is a catalog-internal field like `severity`.
- **UI is Opus-owned;** invariant 8 impeccable dual-gate on the touched `components/` surfaces before the whole-diff review (Task 12).
- **`ExactOptionalPropertyTypes`:** the repo's tsconfig is strict; add optional fields as `field?: T` and pass conditionally where a `toEqual` shape is asserted.

## Meta-test inventory (declared per writing-plans rule)

- **EXTEND** `tests/messages/_metaAdminAlertCatalog.test.ts` — inbox-routed codes have non-null `dougFacing`, are per-show, are in `INTERPOLATED_DOUG_FACING_CODES`, and are lifecycle `class:"auto"` (Task 11).
- **CREATE** `tests/admin/_metaManualResolveRegistry.test.ts` — the manual-resolve surfaces (routes B/C reject inbox-routed, helper D throws, surface A is `.is("show_id", null)` scope-excluded, AUTO surfaces unguarded) (Task 11).
- **EXTEND** `tests/admin/_metaInfraContract.test.ts` — register the loader's new `admin_alerts` await (Task 4).

## Advisory-lock topology

N/A — this plan touches no `pg_advisory*` code path (no DB writes beyond the existing app routes, which are unchanged in their locking).

## Dimensional invariants / transition inventory

N/A per spec §9 — the inbox is flow layout (stacked cards in `flex-col gap`, no fixed-dimension parent) and item appearance/disappearance is instant (server re-render, no animation). **No layout-dimensions task and no transition-audit task are required**, and this is a deliberate, spec-backed declaration, not an omission.

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/messages/catalog.ts` | +`adminSurface?` field on `MessageCatalogEntry`; set `"inbox"` on 2 entries |
| `lib/messages/adminSurface.ts` (new) | `INFO_SEVERITY_CODES`, `INBOX_ROUTED_CODES`, `BANNER_EXCLUDED_CODES`, `isInboxRouted()` |
| `components/admin/AlertBanner.tsx`, `lib/admin/alertCount.ts` | exclude `BANNER_EXCLUDED_CODES` |
| `lib/admin/needsAttention.ts` | `sync_problem` variant, input type, merge, `syncProblemTotal`, `resolveSyncProblemCopy` |
| `lib/admin/loadNeedsAttention.ts`, `lib/admin/needsAttentionCount.ts` | third stream (archived-excluded, empty-set short-circuit) |
| `components/admin/NeedsAttentionInbox.tsx` | `sync_problem` card |
| `components/admin/NeedsAttentionSummaryCard.tsx`, `components/admin/Dashboard.tsx` | `syncProblemTotal` prop + wiring |
| `components/admin/PerShowAlertSection.tsx` | read-only row for inbox-routed |
| `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts`, `app/api/admin/admin-alerts/[id]/resolve/route.ts`, `lib/adminAlerts/resolveAdminAlert.ts` | reject inbox-routed |
| `lib/notify/digest.ts` | defensive `sync_problem` variant arm |
| `tests/**` | per-task + meta |

---

## Task 1: Catalog field + shared `adminSurface` module

**Files:**
- Modify: `lib/messages/catalog.ts:1-11` (type), `:89-101` (`SHEET_UNAVAILABLE`), `:102-115` (`PARSE_ERROR_LAST_GOOD`)
- Create: `lib/messages/adminSurface.ts`
- Test: `tests/messages/adminSurface.test.ts`

**Interfaces:**
- Produces: `INBOX_ROUTED_CODES: string[]`, `INFO_SEVERITY_CODES: string[]`, `BANNER_EXCLUDED_CODES: string[]`, `isInboxRouted(code: string): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/messages/adminSurface.test.ts`

```ts
import { describe, expect, test } from "vitest";
import {
  INBOX_ROUTED_CODES,
  BANNER_EXCLUDED_CODES,
  isInboxRouted,
} from "@/lib/messages/adminSurface";

describe("adminSurface", () => {
  test("INBOX_ROUTED_CODES is exactly the two per-show sync-problem codes", () => {
    expect([...INBOX_ROUTED_CODES].sort()).toEqual([
      "PARSE_ERROR_LAST_GOOD",
      "SHEET_UNAVAILABLE",
    ]);
  });
  test("isInboxRouted narrows correctly", () => {
    expect(isInboxRouted("SHEET_UNAVAILABLE")).toBe(true);
    expect(isInboxRouted("PARSE_ERROR_LAST_GOOD")).toBe(true);
    expect(isInboxRouted("DRIVE_FETCH_FAILED")).toBe(false);
    expect(isInboxRouted("SYNC_STALLED")).toBe(false);
  });
  test("BANNER_EXCLUDED_CODES is the union of info-severity + inbox-routed", () => {
    for (const c of INBOX_ROUTED_CODES) expect(BANNER_EXCLUDED_CODES).toContain(c);
    // ROLE_FLAGS_NOTICE is the canonical info-severity code (catalog)
    expect(BANNER_EXCLUDED_CODES).toContain("ROLE_FLAGS_NOTICE");
    // no duplicates
    expect(new Set(BANNER_EXCLUDED_CODES).size).toBe(BANNER_EXCLUDED_CODES.length);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module '@/lib/messages/adminSurface'`)

Run: `pnpm vitest run tests/messages/adminSurface.test.ts`

- [ ] **Step 3: Add the catalog field** — `lib/messages/catalog.ts`

Add to `MessageCatalogEntry` (after line 3 `severity?:`):
```ts
  adminSurface?: "banner" | "inbox";
```
Add `adminSurface: "inbox",` to the `SHEET_UNAVAILABLE` object (after its `code:` line) and the `PARSE_ERROR_LAST_GOOD` object (after its `code:` line).

- [ ] **Step 4: Create the shared module** — `lib/messages/adminSurface.ts`

```ts
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

const entries = Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[];

export const INFO_SEVERITY_CODES: string[] = entries
  .filter((e) => e.severity === "info")
  .map((e) => e.code);

export const INBOX_ROUTED_CODES: string[] = entries
  .filter((e) => e.adminSurface === "inbox")
  .map((e) => e.code);

// Codes the AlertBanner + bell count must NOT surface (union, de-duped).
export const BANNER_EXCLUDED_CODES: string[] = [
  ...new Set([...INFO_SEVERITY_CODES, ...INBOX_ROUTED_CODES]),
];

const INBOX_ROUTED_SET = new Set(INBOX_ROUTED_CODES);
export function isInboxRouted(code: string): boolean {
  return INBOX_ROUTED_SET.has(code);
}
```

- [ ] **Step 5: Run — expect PASS.** Run: `pnpm vitest run tests/messages/adminSurface.test.ts`

- [ ] **Step 6: Confirm generated files are unaffected.** Run `pnpm gen:spec-codes && pnpm gen:internal-code-enums && git status --short lib/messages/__generated__` — expect NO diff (the field isn't emitted). Run `pnpm vitest run tests/messages/codes.test.ts` (x1 catalog-parity) — expect PASS (no §12.4 change).

- [ ] **Step 7: Commit**

```bash
git add lib/messages/catalog.ts lib/messages/adminSurface.ts tests/messages/adminSurface.test.ts
git commit --no-verify -m "feat(messages): adminSurface catalog field + shared inbox-routed module"
```

---

## Task 2: Banner + bell-count exclusion

**Files:**
- Modify: `components/admin/AlertBanner.tsx:70-72,119-125`, `lib/admin/alertCount.ts:6-9,23-25`
- Test: `tests/components/AlertBannerInboxExclusion.test.tsx` (new), extend `tests/admin/alertCount.test.ts`

**Interfaces:**
- Consumes: `BANNER_EXCLUDED_CODES` from Task 1.

- [ ] **Step 1: Write the failing test** — `tests/admin/alertCount.test.ts` (add a case; mirror existing mock style there)

```ts
test("excludes inbox-routed codes from the unresolved count", async () => {
  // Arrange a supabase stub whose .not(...) captured args are asserted.
  const notArgs: unknown[] = [];
  const supabase = makeCountStub({ count: 0, captureNot: (a) => notArgs.push(a) });
  await fetchUnresolvedAlertCount(); // uses injected stub per existing test harness
  const inClause = String(notArgs[2] ?? "");
  expect(inClause).toContain("SHEET_UNAVAILABLE");
  expect(inClause).toContain("PARSE_ERROR_LAST_GOOD");
});
```
> Note: match the file's existing stub factory. If `fetchUnresolvedAlertCount` has no DI seam, assert instead via a `tests/components/AlertBannerInboxExclusion.test.tsx` that renders `AlertBanner` with a Supabase mock returning only a `SHEET_UNAVAILABLE` unresolved row and asserts the banner renders `null`.

- [ ] **Step 2: Run — expect FAIL.** Run: `pnpm vitest run tests/admin/alertCount.test.ts`

- [ ] **Step 3: Swap the exclusion source in both files.**

`lib/admin/alertCount.ts` — replace the local `INFO_SEVERITY_CODES` (lines 6-9) with an import, and use it in the `.not` (line 23-25):
```ts
import { BANNER_EXCLUDED_CODES } from "@/lib/messages/adminSurface";
// ...delete the local INFO_SEVERITY_CODES computation...
    if (BANNER_EXCLUDED_CODES.length > 0) {
      q = q.not("code", "in", `(${BANNER_EXCLUDED_CODES.map((c) => `"${c}"`).join(",")})`);
    }
```

`components/admin/AlertBanner.tsx` — replace the module-load `INFO_SEVERITY_CODES` (lines 70-72) and its use in the SELECT builder (lines 119-125) with `BANNER_EXCLUDED_CODES`:
```ts
import { BANNER_EXCLUDED_CODES } from "@/lib/messages/adminSurface";
// ...delete local INFO_SEVERITY_CODES...
      if (BANNER_EXCLUDED_CODES.length > 0) {
        query = query.not(
          "code",
          "in",
          `(${BANNER_EXCLUDED_CODES.map((code) => `"${code}"`).join(",")})`,
        );
      }
```

- [ ] **Step 4: Run — expect PASS.** Run: `pnpm vitest run tests/admin/alertCount.test.ts tests/components/AlertBannerInboxExclusion.test.tsx` and the existing `tests/components/**AlertBanner*` suite (regression).

- [ ] **Step 5: Commit**
```bash
git add components/admin/AlertBanner.tsx lib/admin/alertCount.ts tests/
git commit --no-verify -m "feat(admin): exclude inbox-routed codes from banner + bell count"
```

---

## Task 3: `buildNeedsAttention` sync_problem variant + copy

**Files:**
- Modify: `lib/admin/needsAttention.ts` (types, `MergedEntry`, `buildNeedsAttention`, new `resolveSyncProblemCopy`)
- Test: `tests/admin/needsAttentionSyncProblem.test.ts` (new)

**Interfaces:**
- Produces: variant `{ variant:"sync_problem"; key; alertId; showId; slug; title; code; copy; activityAt }`; input `NeedsAttentionSyncProblemInput`; `BuildNeedsAttentionInput.syncProblems?` + `totalCounts.syncProblems?`; `NeedsAttention.syncProblemTotal`; `resolveSyncProblemCopy({code, sheetName, title}): string`.

- [ ] **Step 1: Write the failing test** — `tests/admin/needsAttentionSyncProblem.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { buildNeedsAttention, resolveSyncProblemCopy } from "@/lib/admin/needsAttention";

const sp = (over: Partial<Parameters<typeof buildNeedsAttention>[0]["syncProblems"][number]> = {}) => ({
  alertId: "a1", showId: "s1", slug: "east-coast", title: "East Coast",
  code: "SHEET_UNAVAILABLE", sheetName: "East Coast", raisedAt: "2026-07-03T10:00:00Z", ...over,
});

describe("buildNeedsAttention sync_problem", () => {
  test("merges + sorts newest-first across streams and totals correctly", () => {
    const r = buildNeedsAttention({
      ingestions: [{ id: "i1", driveFileId: "d1", driveFileName: "Old", lastErrorCode: null, lastAttemptAt: "2026-07-03T09:00:00Z" }],
      syncs: [],
      syncProblems: [sp({ alertId: "a1", raisedAt: "2026-07-03T11:00:00Z" })],
      existence: {},
      totalCounts: { ingestions: 1, syncs: 0, syncProblems: 1 },
      cap: 20,
    });
    expect(r.items[0]?.variant).toBe("sync_problem");   // newer raisedAt sorts first
    expect(r.totalCount).toBe(2);
    expect(r.syncProblemTotal).toBe(1);
  });

  test("overflow is computed from totals, not the capped array", () => {
    const many = Array.from({ length: 21 }, (_, i) => sp({ alertId: `a${i}`, raisedAt: `2026-07-03T10:00:${String(i).padStart(2, "0")}Z` }));
    const r = buildNeedsAttention({ ingestions: [], syncs: [], syncProblems: many, existence: {}, totalCounts: { ingestions: 0, syncs: 0, syncProblems: 21 }, cap: 20 });
    expect(r.renderedCount).toBe(20);
    expect(r.overflowCount).toBe(1);
    expect(r.syncProblemTotal).toBe(21);
  });

  test("digest caller shape (no syncProblems) defaults to empty + 0", () => {
    const r = buildNeedsAttention({ ingestions: [], syncs: [], existence: {}, totalCounts: { ingestions: 0, syncs: 0 } });
    expect(r.syncProblemTotal).toBe(0);
    expect(r.items.some((i) => i.variant === "sync_problem")).toBe(false);
  });
});

describe("resolveSyncProblemCopy", () => {
  test("interpolates sheet name + strips emphasis", () => {
    const c = resolveSyncProblemCopy({ code: "SHEET_UNAVAILABLE", sheetName: "East Coast", title: null });
    expect(c).toContain("East Coast");
    expect(c).not.toMatch(/[<>_*]/);
  });
  test("falls back sheetName -> title -> per-code generic", () => {
    expect(resolveSyncProblemCopy({ code: "SHEET_UNAVAILABLE", sheetName: null, title: "RPAS" })).toContain("RPAS");
    expect(resolveSyncProblemCopy({ code: "SHEET_UNAVAILABLE", sheetName: null, title: null })).toBe("Sheet no longer in folder");
    expect(resolveSyncProblemCopy({ code: "PARSE_ERROR_LAST_GOOD", sheetName: null, title: null })).toBe("Latest edit didn't parse");
  });
  test("unknown code -> a non-empty generic, never a raw code", () => {
    const c = resolveSyncProblemCopy({ code: "NOT_A_CODE", sheetName: null, title: null });
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain("NOT_A_CODE");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `pnpm vitest run tests/admin/needsAttentionSyncProblem.test.ts`

- [ ] **Step 3: Implement in `lib/admin/needsAttention.ts`.**

Add the input type + variant (near the other exported types):
```ts
export type NeedsAttentionSyncProblemInput = {
  alertId: string; showId: string; slug: string | null; title: string | null;
  code: string; sheetName: string | null; raisedAt: string | null;
};
```
Add to the `NeedsAttentionItem` union:
```ts
  | {
      variant: "sync_problem";
      key: string; alertId: string; showId: string; slug: string;
      title: string | null; code: string; copy: string; activityAt: string | null;
    }
```
Extend `BuildNeedsAttentionInput`: add `syncProblems?: NeedsAttentionSyncProblemInput[];` and change `totalCounts` to `{ ingestions: number; syncs: number; syncProblems?: number }`. Extend `NeedsAttention` return type: add `syncProblemTotal: number;`.

Add `resolveSyncProblemCopy` (mirrors `resolveIngestionCopy`, using the existing `plainCatalogText`, `MESSAGE_CATALOG`, `UNRESOLVED_PLACEHOLDER_RE`):
```ts
const SYNC_PROBLEM_GENERIC: Record<string, string> = {
  SHEET_UNAVAILABLE: "Sheet no longer in folder",
  PARSE_ERROR_LAST_GOOD: "Latest edit didn't parse",
};
export function resolveSyncProblemCopy(input: {
  code: string; sheetName: string | null; title: string | null;
}): string {
  const generic = SYNC_PROBLEM_GENERIC[input.code] ?? "Needs your attention";
  if (!(input.code in MESSAGE_CATALOG)) return generic;
  const template = messageFor(input.code as MessageCode).dougFacing;
  if (!template) return generic;
  const name = input.sheetName ?? input.title ?? undefined;
  const doug = plainCatalogText(template, name ? { sheet_name: name } : undefined);
  if (UNRESOLVED_PLACEHOLDER_RE.test(doug)) return generic;
  return doug;
}
```
> `messageFor`, `MessageCode`, `plainCatalogText` come from `@/lib/messages/lookup`; import if not already. Reuse the existing `UNRESOLVED_PLACEHOLDER_RE` at `needsAttention.ts:27`.

In `buildNeedsAttention`: default `const syncProblems = input.syncProblems ?? []` and `const syncProblemsTotal = input.totalCounts.syncProblems ?? 0`. Add sync-problem entries to `merged` with `kind: "sync_problem"`, `sortKey: sp.raisedAt ?? ""`, carrying `alertId/showId/slug/title/code/sheetName`. In the classify map, emit the `sync_problem` variant with `key: `alert:${entry.alertId}``, `copy: resolveSyncProblemCopy({...})`, skipping any entry whose `slug` is null (guard — see Task 4 loader also filters). Set `totalCount = ingestions + syncs + syncProblemsTotal`; add `syncProblemTotal: syncProblemsTotal` to the return.

- [ ] **Step 4: Run — expect PASS.** Run: `pnpm vitest run tests/admin/needsAttentionSyncProblem.test.ts` and the existing `tests/admin/needsAttention*.test.ts` (regression: existing `totalCounts` callers still pass with `syncProblems` absent).

- [ ] **Step 5: `pnpm typecheck`** — confirm the optional-field additions compile (exactOptional).

- [ ] **Step 6: Commit**
```bash
git add lib/admin/needsAttention.ts tests/admin/needsAttentionSyncProblem.test.ts
git commit --no-verify -m "feat(admin): buildNeedsAttention sync_problem variant + copy resolver"
```

---

## Task 4: Loader third stream

**Files:**
- Modify: `lib/admin/loadNeedsAttention.ts` (add rows + head-count + map)
- Modify: `tests/admin/_metaInfraContract.test.ts` (register the new await)
- Test: `tests/admin/loadNeedsAttentionSyncProblem.db.test.ts` (new, db-backed)

**Interfaces:**
- Consumes: `INBOX_ROUTED_CODES`, `buildNeedsAttention` (`syncProblems` + `totalCounts.syncProblems`).

- [ ] **Step 1: Write the failing test** — `tests/admin/loadNeedsAttentionSyncProblem.db.test.ts`

Mirror the setup of the existing `tests/admin/loadNeedsAttention*.db.test.ts` (real local Supabase, `upsert_admin_alert` RPC to insert an unresolved alert with `context.sheet_name`). Assert:
```ts
// seed: a non-archived show + an unresolved SHEET_UNAVAILABLE alert (context sheet_name = show title)
// (archived show + its alert also seeded to prove exclusion)
const r = await loadNeedsAttention({ cap: 20 });
expect("kind" in r).toBe(false);
const sync = r.items.find((i) => i.variant === "sync_problem");
expect(sync?.slug).toBe("<non-archived slug>");
expect(sync?.copy).toContain("<sheet name>");
expect(r.syncProblemTotal).toBe(1);              // archived one excluded
```
Add an empty-set case: temporarily stub `INBOX_ROUTED_CODES` to `[]` (or assert via a unit-level guard) → `syncProblemTotal === 0` and no over-selection.

- [ ] **Step 2: Run — expect FAIL.** Run: `pnpm vitest run tests/admin/loadNeedsAttentionSyncProblem.db.test.ts`

- [ ] **Step 3: Implement in `lib/admin/loadNeedsAttention.ts`.**

After the two pending streams (before the `buildNeedsAttention` call), add — wrapped in try/catch returning `{ kind: "infra_error", message }` per invariant 9, and short-circuiting on empty `INBOX_ROUTED_CODES`:
```ts
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";
// ...
let syncProblemRows: ReadonlyArray<Record<string, unknown>> = [];
let syncProblemCount = 0;
if (INBOX_ROUTED_CODES.length > 0) {
  try {
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("id, code, raised_at, show_id, context, shows!inner(slug, title)")
      .is("resolved_at", null)
      .in("code", INBOX_ROUTED_CODES)
      .not("show_id", "is", null)
      .eq("shows.archived", false)
      .order("raised_at", { ascending: false })
      .limit(opts.cap + 1);
    if (error) return { kind: "infra_error", message: `sync-problem query failed: ${error.message}` };
    syncProblemRows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return { kind: "infra_error", message: `sync-problem query threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    const { count, error } = await supabase
      .from("admin_alerts")
      .select("id, shows!inner(id)", { count: "exact", head: true })
      .is("resolved_at", null)
      .in("code", INBOX_ROUTED_CODES)
      .not("show_id", "is", null)
      .eq("shows.archived", false);
    if (error) return { kind: "infra_error", message: `sync-problem count failed: ${error.message}` };
    if (typeof count !== "number") return { kind: "infra_error", message: "sync-problem head-count returned non-number" };
    syncProblemCount = count;
  } catch (err) {
    return { kind: "infra_error", message: `sync-problem count threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```
Map to inputs (skip + `log.warn` on missing slug):
```ts
const syncProblems = syncProblemRows.flatMap((r) => {
  const embed = r.shows as { slug?: string; title?: string | null } | Array<{ slug?: string; title?: string | null }> | null;
  const show = Array.isArray(embed) ? embed[0] : embed;
  if (!show?.slug) { log.warn("sync-problem alert missing show slug", { alertId: r.id as string }); return []; }
  const ctx = r.context as Record<string, unknown> | null;
  return [{
    alertId: r.id as string, showId: r.show_id as string, slug: show.slug,
    title: (show.title as string | null) ?? null, code: r.code as string,
    sheetName: typeof ctx?.sheet_name === "string" ? ctx.sheet_name : null,
    raisedAt: (r.raised_at as string | null) ?? null,
  }];
});
```
Thread into the `buildNeedsAttention({...})` call: `syncProblems`, and `totalCounts: { ingestions, syncs, syncProblems: syncProblemCount }`. (`log` is imported from `@/lib/log`.)

- [ ] **Step 4: Register the new await** in `tests/admin/_metaInfraContract.test.ts` (add the loader's sync-problem read to the `infraRegistry` per that file's shape).

- [ ] **Step 5: Run — expect PASS.** Run: `pnpm vitest run tests/admin/loadNeedsAttentionSyncProblem.db.test.ts tests/admin/_metaInfraContract.test.ts` and the existing `tests/admin/loadNeedsAttention*` (regression).

- [ ] **Step 6: Commit**
```bash
git add lib/admin/loadNeedsAttention.ts tests/admin/
git commit --no-verify -m "feat(admin): loadNeedsAttention third stream (inbox-routed alerts, archived-excluded)"
```

---

## Task 5: Badge count third stream

**Files:**
- Modify: `lib/admin/needsAttentionCount.ts`
- Test: `tests/admin/needsAttentionCountSyncProblem.db.test.ts` (new)

- [ ] **Step 1: Write the failing test** — assert (db-backed, same seed style) that `loadNeedsAttentionCount()` returns a count that INCLUDES a non-archived unresolved `SHEET_UNAVAILABLE` alert and EXCLUDES an archived one; and that the count equals the loader's `totalCount` for the same fixture (lockstep).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Add a third head-count to the function; when `INBOX_ROUTED_CODES.length === 0`, contribute 0 without querying. Because it's conditional, build it outside the existing `Promise.all([...])` (or include only when non-empty), destructure `{ count, error }` per invariant 9, and add to the returned sum:
```ts
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";
// after the ingestion+sync counts resolve:
let syncProblemCount = 0;
if (INBOX_ROUTED_CODES.length > 0) {
  const { count, error } = await supabase
    .from("admin_alerts")
    .select("id, shows!inner(id)", { count: "exact", head: true })
    .is("resolved_at", null)
    .in("code", INBOX_ROUTED_CODES)
    .not("show_id", "is", null)
    .eq("shows.archived", false);
  if (error) return { kind: "infra_error" };
  if (typeof count !== "number") return { kind: "infra_error" };
  syncProblemCount = count;
}
return { kind: "ok", count: ingestionCount + syncCount + syncProblemCount };
```

- [ ] **Step 4: Run — expect PASS.** Run the new + existing `tests/admin/needsAttentionCount*`.

- [ ] **Step 5: Commit**
```bash
git add lib/admin/needsAttentionCount.ts tests/admin/
git commit --no-verify -m "feat(admin): needsAttentionCount includes inbox-routed alerts (archived-excluded)"
```

---

## Task 6: Inbox sync_problem card

**Files:**
- Modify: `components/admin/NeedsAttentionInbox.tsx` (add branch to `ItemCard`)
- Test: `tests/components/needsAttentionInboxSyncProblem.test.tsx` (new)

- [ ] **Step 1: Write the failing test** (React Testing Library, matching the existing inbox test style)

```tsx
const item = {
  variant: "sync_problem", key: "alert:a1", alertId: "a1", showId: "s1",
  slug: "east-coast", title: "East Coast", code: "SHEET_UNAVAILABLE",
  copy: "East Coast isn't in your folder anymore. …", activityAt: "2026-07-03T10:00:00Z",
} as const;

test("renders a sync_problem card with alert deep-link, unique aria-label, no resolve button", () => {
  render(<NeedsAttentionInbox items={[item]} totalCount={1} renderedCount={1} overflowCount={0} now={new Date("2026-07-03T11:00:00Z")} />);
  const link = screen.getByTestId("needs-attention-item-sync-problem-a1").querySelector("a")!;
  expect(link.getAttribute("href")).toBe("/admin/show/east-coast?alert_id=a1");
  expect(link.getAttribute("aria-label")).toBe("Check sync problem for East Coast (east-coast)");
  expect(screen.queryByRole("button")).toBeNull();
});
test("two cards for different shows have distinct accessible names", () => {
  const b = { ...item, key: "alert:a2", alertId: "a2", slug: "rpas", title: "RPAS" } as const;
  render(<NeedsAttentionInbox items={[item, b]} totalCount={2} renderedCount={2} overflowCount={0} now={new Date()} />);
  const names = screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"));
  expect(new Set(names).size).toBe(names.length);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — add before the `// existing_staged` return in `ItemCard` (`NeedsAttentionInbox.tsx:113`):
```tsx
  if (item.variant === "sync_problem") {
    return (
      <li
        data-testid={`needs-attention-item-sync-problem-${item.alertId}`}
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
      >
        <CardHeader item={item} now={now} status="warn" label="Sync problem" />
        <p className="text-sm font-semibold text-text-strong">{item.title ?? item.slug}</p>
        <p className="text-sm text-text-subtle">{item.copy}</p>
        <Link
          data-testid={`needs-attention-link-sync-problem-${item.alertId}`}
          href={`/admin/show/${encodeURIComponent(item.slug)}?alert_id=${encodeURIComponent(item.alertId)}`}
          aria-label={
            item.title
              ? `Check sync problem for ${item.title} (${item.slug})`
              : `Check sync problem for ${item.slug}`
          }
          className={reviewLinkClass}
        >
          Check it →
        </Link>
      </li>
    );
  }
```

- [ ] **Step 4: Run — expect PASS.** Run new + existing inbox tests.

- [ ] **Step 5: Commit**
```bash
git add components/admin/NeedsAttentionInbox.tsx tests/components/needsAttentionInboxSyncProblem.test.tsx
git commit --no-verify -m "feat(admin): NeedsAttentionInbox sync_problem card (deep-link + a11y)"
```

---

## Task 7: Summary card breakdown + Dashboard wiring

**Files:**
- Modify: `components/admin/NeedsAttentionSummaryCard.tsx` (required `syncProblemTotal` prop + line), `components/admin/Dashboard.tsx:589-593`
- Test: `tests/components/needsAttentionSummaryCardSyncProblem.test.tsx` (new)

- [ ] **Step 1: Write the failing test**
```tsx
test("renders the sync-problem breakdown line when syncProblemTotal > 0", () => {
  render(<NeedsAttentionSummaryCard totalCount={3} ingestionTotal={0} syncTotal={0} syncProblemTotal={3} />);
  expect(screen.getByTestId("summary-chip-sync-problems")).toHaveTextContent("3 sync problems");
});
test("no sync-problem line when zero", () => {
  render(<NeedsAttentionSummaryCard totalCount={1} ingestionTotal={1} syncTotal={0} syncProblemTotal={0} />);
  expect(screen.queryByTestId("summary-chip-sync-problems")).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Add `syncProblemTotal: number;` to the prop type (required) and a third chip after the `syncTotal` block (`NeedsAttentionSummaryCard.tsx:44`):
```tsx
{syncProblemTotal > 0 && (
  <span data-testid="summary-chip-sync-problems" className="tabular-nums">
    {syncProblemTotal} sync problem{syncProblemTotal === 1 ? "" : "s"}
  </span>
)}
```
Wire `Dashboard.tsx:589-593` — add `syncProblemTotal={result.needsAttention.syncProblemTotal}` to `<NeedsAttentionSummaryCard>`.

- [ ] **Step 4: Run — expect PASS.** Run new test + `pnpm typecheck` (the required prop makes Dashboard the compile-enforced caller).

- [ ] **Step 5: Commit**
```bash
git add components/admin/NeedsAttentionSummaryCard.tsx components/admin/Dashboard.tsx tests/
git commit --no-verify -m "feat(admin): summary card sync-problem breakdown + Dashboard wiring"
```

---

## Task 8: PerShowAlertSection read-only for inbox-routed

**Files:**
- Modify: `components/admin/PerShowAlertSection.tsx:281` (conditional resolve button)
- Test: `tests/components/perShowAlertReadOnly.test.tsx` (new)

- [ ] **Step 1: Write the failing test** — render `PerShowAlertSection` (or its rendered list) with (a) a `SHEET_UNAVAILABLE` alert → assert NO `PerShowAlertResolveButton` (its testid/role) and the muted "Clears automatically" note IS present; (b) a `WATCH_CHANNEL_ORPHANED` alert → the resolve button IS present. Match the file's existing render-test harness.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — at `PerShowAlertSection.tsx:281`, gate the button:
```tsx
import { isInboxRouted } from "@/lib/messages/adminSurface";
// ...
{isInboxRouted(alert.code) ? (
  <p data-testid={`per-show-alert-autoclear-${alert.id}`} className="text-xs text-text-subtle">
    Clears automatically once the sheet is back or re-parses.
  </p>
) : (
  <PerShowAlertResolveButton alertId={alert.id} slug={slug} />
)}
```

- [ ] **Step 4: Run — expect PASS.** New test + existing `tests/components/**PerShowAlert*`.

- [ ] **Step 5: Commit**
```bash
git add components/admin/PerShowAlertSection.tsx tests/
git commit --no-verify -m "feat(admin): per-show alert read-only for inbox-routed codes"
```

---

## Task 9: Resolve routes + shared helper reject inbox-routed

**Files:**
- Modify: `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` (add `code` to the SELECT + reject), `app/api/admin/admin-alerts/[id]/resolve/route.ts` (same), `lib/adminAlerts/resolveAdminAlert.ts` (throw guard)
- Modify: `tests/adminAlerts/resolveAdminAlert.test.ts` (retarget `:51` off `SHEET_UNAVAILABLE`; add rejection cases)
- Test: `tests/admin/resolveRouteInboxReject.db.test.ts` (new) for the two routes

- [ ] **Step 1: Write the failing tests.**
  - Helper (unit, in `resolveAdminAlert.test.ts`): `resolveAdminAlert({ showId:"s1", code:"SHEET_UNAVAILABLE" }, stub)` **rejects**/throws and issues NO `.update`; `resolveAdminAlerts({ showId:"s1", codes:["SYNC_STALLED","PARSE_ERROR_LAST_GOOD"] }, stub)` throws; `resolveAdminAlert({ showId:null, code:"SYNC_STALLED" }, stub)` still resolves. Retarget the existing `:51` `SHEET_UNAVAILABLE` case to `TILE_PROJECTION_FETCH_FAILED` (a non-inbox per-show code).
  - Routes (db-backed): a POST resolving a `PARSE_ERROR_LAST_GOOD` alert returns **409** with body `code: "ALERT_AUTO_RESOLVE_ONLY"` and the row stays unresolved; a `SYNC_STALLED`/`WATCH_CHANNEL_ORPHANED` alert still resolves 200.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3a: Helper guard** — `lib/adminAlerts/resolveAdminAlert.ts`, at the top of `resolveAdminAlert` (before building the query) and `resolveAdminAlerts` (before the empty-check return is fine, but guard before the query):
```ts
import { isInboxRouted } from "@/lib/messages/adminSurface";
// resolveAdminAlert:
if (isInboxRouted(input.code)) {
  throw new Error(`inbox-routed admin_alert code ${input.code} is auto-resolve-only; manual resolve is forbidden`);
}
// resolveAdminAlerts:
if (input.codes.some((c) => isInboxRouted(c))) {
  throw new Error(`inbox-routed admin_alert code in bulk resolve is auto-resolve-only; manual resolve is forbidden`);
}
```

- [ ] **Step 3b: Show-scoped route** — `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts`. Add `code` to the `AlertRow` type + the `for update` SELECT (line 107-116: `select id, show_id, resolved_at, code ...`), then after the `if (!row)`/`if (row.resolved_at)` checks and BEFORE the UPDATE:
```ts
import { isInboxRouted } from "@/lib/messages/adminSurface";
// after row fetched, before UPDATE:
if (isInboxRouted(row.code)) return errorResponse(409, "ALERT_AUTO_RESOLVE_ONLY");
```

- [ ] **Step 3c: Global route** — `app/api/admin/admin-alerts/[id]/resolve/route.ts`. Same: add `code` to its SELECT, add `if (isInboxRouted(row.code)) return errorResponse(409, "ALERT_AUTO_RESOLVE_ONLY");` before the UPDATE.

- [ ] **Step 4: Run — expect PASS.** New + retargeted + existing route/helper tests.

- [ ] **Step 5: Commit**
```bash
git add app/api/admin/show/ app/api/admin/admin-alerts/ lib/adminAlerts/resolveAdminAlert.ts tests/
git commit --no-verify -m "feat(admin): resolve routes + helper reject inbox-routed codes (no-Dismiss)"
```

---

## Task 10: Digest caller compatibility

**Files:**
- Modify: `lib/notify/digest.ts:81-97` (add `sync_problem` arms)
- Test: `tests/notify/digestSyncProblemCompat.test.ts` (new)

- [ ] **Step 1: Write the failing test** — a unit test that (a) `buildNeedsAttention` with the digest's exact `{ ingestions, syncs, existence, totalCounts:{ingestions,syncs} }` shape compiles and yields `syncProblemTotal:0`; (b) `groupNeedsAttention` (exported or exercised via `buildDigestModel` with an injected `sql` stub returning no rows) produces no `sync_problem` grouping. If `groupNeedsAttention`/`itemCopy` are not exported, assert via `buildDigestModel` with a stub `sql` (mirroring existing `tests/notify/digest*.test.ts`).

- [ ] **Step 2: Run — expect FAIL** (type error on the union without the arm, or missing handling).

- [ ] **Step 3: Implement** — add explicit `sync_problem` arms before each function's final `return` (`digest.ts:81-97`):
```ts
// groupTitleFor:  if (item.variant === "sync_problem") return item.title;
// itemCopy:       if (item.variant === "sync_problem") return item.copy;
// slugFor:        if (item.variant === "sync_problem") return item.slug;
```

- [ ] **Step 4: Run — expect PASS.** New + existing `tests/notify/digest*`.

- [ ] **Step 5: `pnpm typecheck`.**

- [ ] **Step 6: Commit**
```bash
git add lib/notify/digest.ts tests/notify/digestSyncProblemCompat.test.ts
git commit --no-verify -m "fix(notify): handle sync_problem variant in digest grouping (no behavior change)"
```

---

## Task 11: Meta-tests

**Files:**
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts`
- Create: `tests/admin/_metaManualResolveRegistry.test.ts`

- [ ] **Step 1: Write the tests.**
  - In `_metaAdminAlertCatalog.test.ts`, add a block iterating `INBOX_ROUTED_CODES` asserting each catalog entry: `dougFacing !== null`; is in `INTERPOLATED_DOUG_FACING_CODES`; and `ADMIN_ALERTS_LIFECYCLE[code].class === "auto"`. Import `INBOX_ROUTED_CODES` from `@/lib/messages/adminSurface`.
  - `_metaManualResolveRegistry.test.ts`: source-regex assertions that (a) both resolve routes contain `isInboxRouted(` guarding a `409`/`ALERT_AUTO_RESOLVE_ONLY`; (b) `resolveAdminAlert.ts` throws on `isInboxRouted`; (c) `app/admin/actions.ts` still contains `.is("show_id", null)` (surface A scope-exclusion); (d) grep guard: no production caller passes an inbox-routed literal to `resolveAdminAlert(s)`.

- [ ] **Step 2: Run — expect FAIL** (until Tasks 1/9 landed they pass; here they lock the contract — run to confirm GREEN, since prior tasks satisfied them). If any FAIL, fix the source, not the test.

- [ ] **Step 3: Run — expect PASS.** `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/admin/_metaManualResolveRegistry.test.ts`

- [ ] **Step 4: Commit**
```bash
git add tests/messages/_metaAdminAlertCatalog.test.ts tests/admin/_metaManualResolveRegistry.test.ts
git commit --no-verify -m "test(admin): meta-tests for inbox-routed lifecycle + manual-resolve lockdown"
```

---

## Task 12: Verification, UI quality gate, whole-suite

**Files:** none (gate task)

- [ ] **Step 1: Full suite + typecheck + format.** Run `pnpm typecheck`, `pnpm vitest run` (full), `pnpm format:check`. Fix any fallout (esp. exact-`toEqual` shape tests broken by the new optional fields — Task 3/7). Note: e2e/db tests need the local Supabase up (`pnpm db:seed`).
- [ ] **Step 2: Impeccable dual-gate (invariant 8).** Run `/impeccable critique` AND `/impeccable audit` on the UI diff covering `NeedsAttentionInbox.tsx`, `NeedsAttentionSummaryCard.tsx`, `AlertBanner.tsx`, `PerShowAlertSection.tsx`, `Dashboard.tsx`. Fix HIGH/CRITICAL or record a `DEFERRED.md` entry. Record dispositions in the milestone handoff.
- [ ] **Step 3: Real-app smoke.** Drive `/admin` (dashboard) + `/admin/needs-attention` + a per-show page with a seeded `SHEET_UNAVAILABLE` alert: confirm it appears in the inbox (not the banner), the "Check it" deep-links with `?alert_id`, and the per-show row shows no resolve button.
- [ ] **Step 4: Commit** any fixup (e.g., `chore(admin): full-suite fallout fixes`).

---

## Task 13: Adversarial review (cross-model) + Stage 4 close-out

- [ ] **Step 1:** Whole-diff cross-model adversarial review (Codex), fresh-eyes, REVIEWER ONLY, iterate to APPROVE. Do-not-relitigate: the ratified UX scope (spec §1.2/§7).
- [ ] **Step 2:** Push; open PR; confirm **real GitHub Actions CI green** (not just local). Reconcile if DIRTY/behind base.
- [ ] **Step 3:** `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** §4.1→T1, §4.2→T2, §4.3→T3, §4.4→T4, §4.5→T5, §4.6→T6, §4.7→T7, §4.8→T8(UI)+T9(routes/helper), §4.9→T10, §5 guards→T3/T4/T6, §6 lockstep→T4/T5 + T11 (via shared const), §8 meta→T11 + T4, §10 tests→each task, §11 files→all tasks, §12 UI gate→T12. No gaps.
- **Placeholder scan:** every code step carries real code; no TBD/TODO.
- **Type consistency:** `syncProblems?`/`totalCounts.syncProblems?`/`syncProblemTotal`/`resolveSyncProblemCopy`/`isInboxRouted`/`BANNER_EXCLUDED_CODES`/`INBOX_ROUTED_CODES` names are consistent T1→T11; the `sync_problem` variant fields (`alertId/showId/slug/title/code/copy/activityAt`) match across T3 (definition), T6 (render), T10 (digest arms).
