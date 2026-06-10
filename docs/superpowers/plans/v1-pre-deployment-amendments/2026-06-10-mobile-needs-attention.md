# Mobile "Needs attention" Page + Bottom-Nav Tab (#11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dedicated `/admin/needs-attention` page (alerts + full inbox), third mobile bottom-nav tab with a live count badge, and a compact summary card replacing the inbox on the mobile dashboard — desktop unchanged.

**Architecture:** Extract the dashboard's needs-attention data block into `lib/admin/loadNeedsAttention.ts` (cap-parameterized, typed `infra_error`, internal client construction); a head-count-only sibling `loadNeedsAttentionCount` feeds the badge (initial server prop + pathname-triggered route-handler refetch with token/abort stale suppression + prop-change sync). Dashboard switches inbox↔summary-card via CSS-only dual render at the 720px boundary.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (tokens only, `min-[720px]:` variants), Supabase JS, Vitest + Testing Library, Playwright (real-browser band sweep).

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-mobile-needs-attention-design.md` (adversarially APPROVED R7). Resolved decisions D-1..D-5 and watchpoints §7 are ratified — do not relitigate during implementation or review.

**Routing:** Entire milestone = **Opus / Claude Code** (UI-dominant; hard rule). **Codex = reviewer** (per-task-cluster + whole-milestone fresh-eyes). Branch: `spec/mobile-needs-attention` (already holds the spec).

**No DB changes.** No migrations, no validation-project apply, no schema-manifest regen.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `lib/admin/needsAttention.ts` | Modify | `cap` threading + `ingestionTotal`/`syncTotal` output fields + `PAGE_RENDER_CAP` |
| `lib/admin/loadNeedsAttention.ts` | Create | Bounded query assembly (moved from `Dashboard.tsx:326-460`), typed `infra_error`, internal client construction |
| `lib/admin/needsAttentionCount.ts` | Create | Head-counts-only badge helper (mirrors `lib/admin/alertCount.ts`) |
| `app/api/admin/needs-attention-count/route.ts` | Create | Admin-gated GET returning `{ count }` |
| `components/admin/nav/useNeedsAttentionBadge.ts` | Create | Client badge state: prop sync + pathname refetch + token/abort |
| `components/admin/nav/navConfig.ts` | Modify | `attention` item (`mobileOnly`), 3-way `isNavItemActive` |
| `components/admin/nav/AdminNav.tsx` | Modify | Desktop filter, badge chip, `initialBadgeCount` prop |
| `app/admin/layout.tsx` | Modify | Fetch + thread `initialBadgeCount` |
| `app/admin/needs-attention/page.tsx` | Create | The page (header + alerts + inbox) |
| `app/admin/needs-attention/loading.tsx` | Create | Skeleton |
| `components/admin/NeedsAttentionSummaryCard.tsx` | Create | Mobile dashboard summary card |
| `components/admin/Dashboard.tsx` | Modify | Use loader; dual render in inbox col |
| `lib/audit/trustDomains.ts` | Modify | 2 `PROTECTED_ROUTES` rows |
| `tests/admin/_metaInfraContract.test.ts` | Modify | 2 registry rows |
| `app/admin/page.tsx`, `app/admin/show/[slug]/page.tsx` | Modify | Banner-placement contract comments |
| `tests/e2e/admin-banner.spec.ts` | Modify | Amend dashboard-only contract test (`:386`) |
| `tests/e2e/admin-nav-layout-dimensions.spec.ts` | Modify | 3rd tab + badge + summary/wrapper invariants |
| `tests/e2e/needs-attention-page.spec.ts` | Create | Nav flow + badge freshness (soft-nav + same-route) |
| `scripts/help-screenshots.manifest.ts` | Modify | `needs-attention-mobile` entry |
| `app/help/admin/review-queues/page.mdx` | Modify | "On your phone" section + screenshot |

Structural-registry inventory (spec §9, mandatory, same-commit as the surface): `PROTECTED_ROUTES` rows (Task 5/6), `_metaInfraContract` rows (Tasks 1/2). Declared not-touched: sentinel-hiding, alert-catalog, advisory-lock, DML-lockdown registries.

---

### Task 1: Loader extraction — `loadNeedsAttention`

**Files:**
- Modify: `lib/admin/needsAttention.ts` (RENDER_CAP at `:16`, `NeedsAttention` type at `:84-89`, `buildNeedsAttention` at `:131`)
- Create: `lib/admin/loadNeedsAttention.ts`
- Modify: `components/admin/Dashboard.tsx:326-460` (replace block with loader call)
- Test: `tests/admin/loadNeedsAttention.test.ts` (create)
- Modify: `tests/admin/_metaInfraContract.test.ts` (registry row)

- [ ] **Step 1.1: Write the failing tests** — `tests/admin/loadNeedsAttention.test.ts`. Build a fake Supabase client factory that (a) serves per-table row arrays + per-table `count` values for head queries, (b) can throw from `.from()` globally or per-table, mirroring the harness style already in `tests/admin/_metaInfraContract.test.ts:75-120`. Mock `@/lib/supabase/server` so `createSupabaseServerClient` returns the fake (and can be made to throw).

```ts
// tests/admin/loadNeedsAttention.test.ts — core cases (write all of these)
import { describe, expect, test, vi } from "vitest";

// fake-client factory: makeClient({ rowsByTable, countByTable, throwOnFromTable?, headCountNull? })
// Head queries are .select("id", { count: "exact", head: true }) — detect via options.head === true.

describe("loadNeedsAttention", () => {
  test("parity: cap 20 produces the same items/renderedCount/totalCount/overflowCount shape buildNeedsAttention produced pre-extraction", async () => {
    // fixture: 3 ingestion rows (counts 3), 2 sync rows (count 2), existence marks one staged
    // assert ordering, classification (pending_ingestion/first_seen/existing_staged), totals —
    // derive expectations from the fixture arrays, never hardcode item counts disconnected from them
  });
  test("cap threading: 25 sync rows, cap 20 → renderedCount 20, overflowCount > 0; cap 100 → renders all 25", async () => {});
  test("exact stream totals beyond the cap (R6-F1): 7 ingestion rows/head-count 31 + 20 sync rows/head-count 47, cap 20 → ingestionTotal 31, syncTotal 47, totalCount 78", async () => {
    // 31/47/78 are NOT derivable from any row-array length in this fixture
  });
  test("null head-count integrity (R2-F3): count: null, error: null with rows present → { kind: 'infra_error' }", async () => {});
  test("construction throw containment (R1): createSupabaseServerClient throws, no injected client → resolves { kind: 'infra_error' }, never rejects", async () => {});
  test("query throw containment: .from('pending_syncs') throws mid-helper → infra_error", async () => {});
});
```

- [ ] **Step 1.2: Run tests, verify they fail** — `pnpm vitest run tests/admin/loadNeedsAttention.test.ts` → FAIL ("Cannot find module … loadNeedsAttention").

- [ ] **Step 1.3: Implement.**
  1. `lib/admin/needsAttention.ts`: add `cap?: number` to `BuildNeedsAttentionInput`; the merge slice uses `input.cap ?? RENDER_CAP`; add to the `NeedsAttention` type and return value: `ingestionTotal: number; syncTotal: number;` (= `totalCounts.ingestions` / `totalCounts.syncs`); export `const PAGE_RENDER_CAP = 100;` next to `RENDER_CAP` with a one-line comment ("page-variant cap, spec §4.1; single source — no other literal 100").
  2. `lib/admin/loadNeedsAttention.ts`: move `Dashboard.tsx:326-460` (the two bounded queries + two head-counts + existence lookup + `buildNeedsAttention` call) **verbatim**, with exactly these deltas:
     - signature `export async function loadNeedsAttention(opts: { cap: number; supabase?: SupabaseLike }): Promise<LoadNeedsAttentionResult>` where `LoadNeedsAttentionResult = NeedsAttention | { kind: "infra_error"; message: string }`. `SupabaseLike` = the same client type `fetchDashboardData` uses (grep its current annotation; do not invent a new one).
     - when `opts.supabase` is omitted: `let supabase; try { supabase = await createSupabaseServerClient(); } catch (err) { return { kind: "infra_error", message: \`client construction failed: ...\` }; }` (the `lib/admin/alertCount.ts:11-17` pattern).
     - `RENDER_CAP` literals in `.limit(...)` become `opts.cap + 1`; `buildNeedsAttention` receives `cap: opts.cap`.
     - **count integrity (R2-F3):** after each head-count query, replace the `q.count ?? rows.length` fallback with `if (typeof q.count !== "number") return { kind: "infra_error", message: "<table> head-count returned non-number" };`
     - keep every existing `{ data, error }` destructure + try/catch + typed `infra_error` return (invariant 9); file header comment cites AGENTS.md invariant 9 like `Dashboard.tsx:15` does.
  3. `components/admin/Dashboard.tsx`: replace lines 326-460 with `const na = await loadNeedsAttention({ cap: RENDER_CAP, supabase }); if ("kind" in na) return na;` then `needsAttention: na` / `needReviewCount: na.totalCount` in the returned object (`:462-473` shape unchanged). The client `fetchDashboardData` already constructed is injected — its construction try/catch stays where it is.

- [ ] **Step 1.4: Run tests** — `pnpm vitest run tests/admin/loadNeedsAttention.test.ts` → PASS. Also `pnpm vitest run tests/admin tests/components/admin tests/app/admin tests/help` → no regressions (Dashboard tests must stay green; if a Dashboard test pinned the inline block, update it to mock/exercise the loader instead).

- [ ] **Step 1.5: Register in the meta-test** — add to `infraRegistry` in `tests/admin/_metaInfraContract.test.ts` (rows start ~`:160`):

```ts
{
  helper: "loadNeedsAttention",
  path: "lib/admin/loadNeedsAttention.ts",
  contract: "pending_ingestions/pending_syncs/shows await throws + construction throw → infra_error",
},
```

Follow the file's existing behavioral-assertion pattern (throwing client via the mocked `@/lib/supabase/server`); run `pnpm vitest run tests/admin/_metaInfraContract.test.ts` → PASS.

- [ ] **Step 1.6: Typecheck + commit**

```bash
pnpm typecheck
git add lib/admin components/admin/Dashboard.tsx tests/admin
git commit -m "feat(admin): extract loadNeedsAttention loader with cap threading, exact stream totals, count-integrity guard"
```

### Task 2: Badge count helper — `loadNeedsAttentionCount`

**Files:**
- Create: `lib/admin/needsAttentionCount.ts`
- Test: `tests/admin/needsAttentionCount.test.ts` (create)
- Modify: `tests/admin/_metaInfraContract.test.ts` (registry row)

- [ ] **Step 2.1: Write failing tests** — cases: (a) ok path sums the two head-counts (`{ kind: "ok", count: 31 + 47 }` from mocked counts 31/47 — underivable from row arrays); (b) returned `.error` on either query → `{ kind: "infra_error" }`; (c) `.from()` throw → `infra_error`; (d) construction throw → `infra_error` (never rejects); (e) `count: null, error: null` → `infra_error` (4b). Mock `@/lib/supabase/server`.

- [ ] **Step 2.2: Verify fail** — `pnpm vitest run tests/admin/needsAttentionCount.test.ts` → FAIL (module not found).

- [ ] **Step 2.3: Implement** — mirror `lib/admin/alertCount.ts:11-36` structure exactly:

```ts
// lib/admin/needsAttentionCount.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NeedsAttentionCountResult =
  | { kind: "ok"; count: number }
  | { kind: "infra_error" };

export async function loadNeedsAttentionCount(): Promise<NeedsAttentionCountResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }
  try {
    const ingestions = await supabase
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    if (ingestions.error) return { kind: "infra_error" };
    if (typeof ingestions.count !== "number") return { kind: "infra_error" };
    const syncs = await supabase
      .from("pending_syncs")
      .select("staged_id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    if (syncs.error) return { kind: "infra_error" };
    if (typeof syncs.count !== "number") return { kind: "infra_error" };
    return { kind: "ok", count: ingestions.count + syncs.count };
  } catch {
    return { kind: "infra_error" };
  }
}
```

(Verify the two head-count select columns/filters against the moved originals — `Dashboard.tsx:347-360` and `:385-398` pre-extraction — and match them exactly.)

- [ ] **Step 2.4: Run tests** → PASS.
- [ ] **Step 2.5: Register in meta-test** — row `{ helper: "loadNeedsAttentionCount", path: "lib/admin/needsAttentionCount.ts", contract: "pending_ingestions/pending_syncs head-count throws + construction throw → infra_error" }`; run the meta-test → PASS.
- [ ] **Step 2.6: Commit** — `git commit -m "feat(admin): loadNeedsAttentionCount badge helper (head-counts only, typed infra_error)"`

### Task 3: Count route handler

**Files:**
- Create: `app/api/admin/needs-attention-count/route.ts`
- Modify: `lib/audit/trustDomains.ts:31` (`PROTECTED_ROUTES` row — same commit, R3-F1)
- Test: `tests/app/api/needsAttentionCountRoute.test.ts` (create)

- [ ] **Step 3.1: Failing tests** — mock `@/lib/auth/requireAdmin` + `@/lib/admin/needsAttentionCount`: (a) ok → 200 `{ count: 5 }` with `Cache-Control: no-store`; (b) helper `infra_error` → 503, body contains NO raw catalog codes; (c) `requireAdminIdentity` throwing `AdminInfraError` → 503; (d) `requireAdminIdentity` throwing a Next control-flow error (plain `Error` stand-in) → propagates (rejects).

- [ ] **Step 3.2: Verify fail.** `pnpm vitest run tests/app/api/needsAttentionCountRoute.test.ts` → FAIL.

- [ ] **Step 3.3: Implement:**

```ts
// app/api/admin/needs-attention-count/route.ts
import { NextResponse } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { loadNeedsAttentionCount } from "@/lib/admin/needsAttentionCount";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminIdentity();
  } catch (err) {
    if (err instanceof AdminInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err; // forbidden()/notFound() control flow propagates to Next
  }
  const result = await loadNeedsAttentionCount();
  if (result.kind === "infra_error") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { count: result.count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 3.4: PROTECTED_ROUTES row (same commit):** in `lib/audit/trustDomains.ts` append among the `app/api/admin/**` rows: `{ path: "app/api/admin/needs-attention-count/route.ts", chain: ["requireAdmin"] },`. Run the auth-chain audit test suite (`pnpm vitest run tests/` filtered to the audit specs that consume `PROTECTED_ROUTES` — grep `protectedRoutes` under `tests/`) → PASS.
- [ ] **Step 3.5: Run route tests** → PASS. **Commit** — `git commit -m "feat(admin): needs-attention-count route handler + PROTECTED_ROUTES row"`

### Task 4: Nav config + AdminNav badge + freshness hook

**Files:**
- Modify: `components/admin/nav/navConfig.ts` (full file is 24 lines)
- Create: `components/admin/nav/useNeedsAttentionBadge.ts`
- Modify: `components/admin/nav/AdminNav.tsx` (desktop filter `:64-83`, mobile tabs `:95-125`, props `:31`)
- Modify: `app/admin/layout.tsx:84-100` (fetch + thread prop)
- Tests: `tests/components/admin/nav/navConfig.test.ts` (create or extend), `tests/components/admin/nav/AdminNav.test.tsx` (extend), `tests/components/admin/nav/useNeedsAttentionBadge.test.tsx` (create)

- [ ] **Step 4.1: Failing tests.**

`navConfig.test.ts` — active-state matrix (spec test 5): for each of `/admin`, `/admin/needs-attention`, `/admin/needs-attention/x`, `/admin/settings`, `/admin/settings/admins`, `/admin/show/abc` assert exactly ONE of the three ids is active, with `attention` active only on the needs-attention paths and `dashboard` NOT active there. Also: `NAV.length === 3`, `shouldRenderOverflow(NAV.length) === false`, the attention item is `mobileOnly === true`, href `/admin/needs-attention`.

`AdminNav.test.tsx` additions (existing harness mocks `usePathname`, `tests/components/admin/nav/AdminNav.test.tsx:7`) — make the pathname mock variable; scope queries (anti-tautology) to `admin-nav-topbar` / `admin-bottom-tabs` containers:
- desktop bar contains exactly Dashboard + Settings links, NO "Needs attention" link (`within(topbar)`)
- bottom bar renders `admin-bottom-tab-attention` between dashboard and settings tabs
- badge matrix (spec test 4): `initialBadgeCount` of `null` / `0` / `NaN` / `-1` → no `admin-attention-badge` node; `3` → "3"; `10` → "9+"; attention tab `aria-label` = "Needs attention, 3 items" when badged, "Needs attention" otherwise
- badge does not render on dashboard/settings tabs even when count > 0

`useNeedsAttentionBadge.test.tsx` (renderHook) — spec tests 4 + 4c:
- returns the initial prop value; prop change (rerender with new value) commits immediately
- pathname change (mutable `usePathname` mock + rerender) fetches `/api/admin/needs-attention-count`; ok body `{count: 7}` commits 7; non-OK / rejected / `{count: "x"}` → commits `null`
- initial mount does NOT fetch (fetch spy not called before any pathname change)
- **stale-fetch suppression (4c):** pathname change starts fetch A (deferred); then rerender with a NEW `initialBadgeCount` (prop sync = `router.refresh` path); resolve fetch A with the older count → hook still returns the prop value; assert A's `AbortSignal` was aborted.

- [ ] **Step 4.2: Verify fail** — `pnpm vitest run tests/components/admin/nav` → FAIL (no attention item / no hook module).

- [ ] **Step 4.3: Implement `navConfig.ts`:**

```ts
import { Inbox, LayoutGrid, Settings } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  id: "dashboard" | "attention" | "settings";
  label: string;
  short: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  /** Excluded from the desktop top bar (spec D-2: desktop nav unchanged). */
  mobileOnly?: true;
};

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", href: "/admin", Icon: LayoutGrid },
  { id: "attention", label: "Needs attention", short: "Attention", href: "/admin/needs-attention", Icon: Inbox, mobileOnly: true },
  { id: "settings", label: "Settings", short: "Settings", href: "/admin/settings", Icon: Settings },
];

export const NAV_BREAKPOINT_PX = 720;
export const OVERFLOW_THRESHOLD = 5;

export function shouldRenderOverflow(destinationCount: number): boolean {
  return destinationCount > OVERFLOW_THRESHOLD;
}

// Settings owns /admin/settings*; Attention owns /admin/needs-attention*;
// Dashboard owns /admin and everything else under /admin (incl. /admin/show/*).
export function isNavItemActive(id: NavItem["id"], pathname: string): boolean {
  const inSettings = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
  const inAttention = pathname === "/admin/needs-attention" || pathname.startsWith("/admin/needs-attention/");
  if (id === "settings") return inSettings;
  if (id === "attention") return inAttention;
  return !inSettings && !inAttention;
}
```

- [ ] **Step 4.4: Implement `useNeedsAttentionBadge.ts`:**

```ts
"use client";

/**
 * Badge state for the mobile "Needs attention" tab (spec §4.2).
 * Three commit sources, raced safely via a monotonic token (R5-F1):
 *   1. initial server prop (first paint)
 *   2. prop change — router.refresh() re-renders the layout tree, so a
 *      mutation on the SAME route delivers a fresh count as a new prop
 *      (R4-F1); always commits and invalidates in-flight fetches
 *   3. pathname change — refetch from the count route handler; commits
 *      only if its token is still current; any fault → null (badge hidden)
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function useNeedsAttentionBadge(initialBadgeCount: number | null): number | null {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(initialBadgeCount);
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastPathRef = useRef(pathname);

  useEffect(() => {
    // Prop sync (router.refresh path): newest server truth — always commit.
    tokenRef.current += 1;
    abortRef.current?.abort();
    setCount(initialBadgeCount);
  }, [initialBadgeCount]);

  useEffect(() => {
    if (pathname === lastPathRef.current) return; // initial mount: server prop is fresh
    lastPathRef.current = pathname;
    tokenRef.current += 1;
    const token = tokenRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void fetch("/api/admin/needs-attention-count", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { count?: unknown };
        if (typeof body.count !== "number" || !Number.isFinite(body.count)) throw new Error("bad body");
        if (tokenRef.current === token) setCount(body.count);
      })
      .catch(() => {
        if (tokenRef.current === token) setCount(null); // fail-quiet (ratified D-4)
      });
    return () => controller.abort();
  }, [pathname]);

  return count;
}
```

- [ ] **Step 4.5: Implement `AdminNav.tsx` changes:**
  - props: `{ email, alertCount, initialBadgeCount = null }: { email: string; alertCount: AlertCountResult; initialBadgeCount?: number | null }`
  - `const badgeCount = useNeedsAttentionBadge(initialBadgeCount);`
  - desktop block (`:65`): `NAV.filter((item) => !item.mobileOnly).map(...)` — nothing else changes in that block
  - mobile tab body (`:111-113`): wrap the icon so the badge can anchor without changing tab height (mirror `NotifBell`'s chip classes — `components/admin/nav/NotifBell.tsx:36-38`):

```tsx
const showBadge =
  item.id === "attention" &&
  typeof badgeCount === "number" &&
  Number.isFinite(badgeCount) &&
  badgeCount > 0;
const badgeDisplay = showBadge && badgeCount > 9 ? "9+" : String(badgeCount);
// inside the Link (replacing the bare <item.Icon/>):
<span className="relative">
  <item.Icon className="size-5" />
  {showBadge && (
    <span
      data-testid="admin-attention-badge"
      aria-hidden="true"
      className="absolute -right-2.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-xs font-semibold tabular-nums text-accent-text"
    >
      {badgeDisplay}
    </span>
  )}
</span>
<span>{item.short}</span>
```

  - attention tab Link gets `aria-label={item.id === "attention" ? (showBadge ? `Needs attention, ${badgeCount} item${badgeCount === 1 ? "" : "s"}` : "Needs attention") : undefined}`

- [ ] **Step 4.6: Thread from layout** — `app/admin/layout.tsx`: after the `fetchUnresolvedAlertCount` call (`:84`), add `const needsAttentionCount = await loadNeedsAttentionCount();` and pass `initialBadgeCount={needsAttentionCount.kind === "ok" ? needsAttentionCount.count : null}` at the `<AdminNav>` mount (`:100`). Import from `@/lib/admin/needsAttentionCount`.

- [ ] **Step 4.7: Run tests** — `pnpm vitest run tests/components/admin/nav tests/app/admin` → PASS (existing AdminNav tests must pass unmodified except where they assert "both nav items" — extend those to three for the bottom bar, two for the top bar).
- [ ] **Step 4.8: Commit** — `git commit -m "feat(admin): attention bottom-nav tab with live count badge (token/abort freshness)"`

### Task 5: The page + loading skeleton

**Files:**
- Create: `app/admin/needs-attention/page.tsx`, `app/admin/needs-attention/loading.tsx`
- Modify: `lib/audit/trustDomains.ts` (page row — same commit, R3-F1)
- Modify: `app/admin/page.tsx:90-96` + `app/admin/show/[slug]/page.tsx:13` (contract comments)
- Test: `tests/app/admin/needsAttentionPage.test.tsx` (create)

- [ ] **Step 5.1: Failing tests** — mock `@/lib/admin/loadNeedsAttention`, `@/lib/auth/requireAdmin`, AlertBanner (lightweight stub), and the clock helper Dashboard uses (`nowDate` — same import path as `components/admin/Dashboard.tsx`): (a) success → `admin-needs-attention-page` wrapper, `AdminPageHeader` title "Needs attention", `div#alerts` present, `NeedsAttentionInbox` items rendered with `PAGE_RENDER_CAP`-loaded data; (b) loader `infra_error` → degraded copy ("The admin database query failed…" pattern), NO raw code text anywhere in the DOM, alerts section STILL present; (c) `loadNeedsAttention` called with `{ cap: PAGE_RENDER_CAP }` and WITHOUT a `supabase` key (assert the call argument has no own `supabase` property — pins the no-injected-client rule).

- [ ] **Step 5.2: Verify fail.**

- [ ] **Step 5.3: Implement page:**

```tsx
// app/admin/needs-attention/page.tsx
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { AlertBanner } from "@/components/admin/AlertBanner";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { loadNeedsAttention } from "@/lib/admin/loadNeedsAttention";
import { PAGE_RENDER_CAP } from "@/lib/admin/needsAttention";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
// + the same now/clock import Dashboard.tsx uses for `nowDate`

export const dynamic = "force-dynamic";

export default async function NeedsAttentionPage() {
  await requireAdminIdentity(); // defensive page-level gate (layout also gates)
  const result = await loadNeedsAttention({ cap: PAGE_RENDER_CAP }); // no injected client (spec §4.3)
  const now = await nowDate();
  return (
    <div data-testid="admin-needs-attention-page" className="flex w-full flex-col gap-section-gap">
      <AdminPageHeader title="Needs attention" sub="Everything waiting on you, across all shows." />
      {/* Banner placement contract: dashboard + THIS page only (spec D-5 amendment). */}
      <div id="alerts">
        <AlertBanner />
      </div>
      <section aria-label="Needs attention" className="flex w-full max-w-3xl flex-col gap-3">
        {"kind" in result ? (
          <p
            data-testid="needs-attention-page-degraded"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
          >
            The admin database query failed. Refresh in a moment. If this keeps happening, contact
            the developer.
          </p>
        ) : (
          <NeedsAttentionInbox
            items={result.items}
            totalCount={result.totalCount}
            renderedCount={result.renderedCount}
            overflowCount={result.overflowCount}
            now={now}
          />
        )}
      </section>
    </div>
  );
}
```

`loading.tsx`: header-bar skeleton + 3 stacked list-row placeholders following `app/admin/loading.tsx`'s silhouette idiom (animate-pulse tokens-only blocks; copy that file's structure, swap the dashboard silhouette for header + rows).

- [ ] **Step 5.4: PROTECTED_ROUTES row (same commit):** `{ path: "app/admin/needs-attention/page.tsx", chain: ["requireAdmin"] },` among the page rows (`lib/audit/trustDomains.ts:34-41`). Update the M12.3 banner-placement comments: `app/admin/page.tsx:90-96` ("dashboard-only" → "dashboard + /admin/needs-attention only") and `app/admin/show/[slug]/page.tsx:13` likewise.
- [ ] **Step 5.5: Run tests + audit specs** → PASS. **Commit** — `git commit -m "feat(admin): /admin/needs-attention page (alerts + full inbox, cap 100) + loading skeleton + PROTECTED_ROUTES row"`

### Task 6: Banner placement contract amendment (e2e)

**Files:**
- Modify: `tests/e2e/admin-banner.spec.ts:386-…` (the "dashboard-only contract" test)

- [ ] **Step 6.1: Amend the contract test** — banner present on `/admin` AND `/admin/needs-attention`; absent on `/admin/dev`, `/admin/settings`, `/admin/show/[slug]` (keep the existing absent-route loop, add the new present-route assertion). Rename the test title to "banner placement contract: present on /admin + /admin/needs-attention, absent elsewhere (M12.3, amended by needs-attention spec D-5)".
- [ ] **Step 6.2: Run** — `pnpm exec playwright test tests/e2e/admin-banner.spec.ts` (prod build per project e2e convention; local dev hydration is broken in this sandbox — always e2e against a prod build) → PASS.
- [ ] **Step 6.3: Commit** — `git commit -m "test(admin): amend banner placement contract to dashboard + needs-attention page"`

### Task 7: Summary card + dashboard dual render

**Files:**
- Create: `components/admin/NeedsAttentionSummaryCard.tsx`
- Modify: `components/admin/Dashboard.tsx:627-654` (inbox col section)
- Test: `tests/components/admin/NeedsAttentionSummaryCard.test.tsx` (create), Dashboard component test extension

- [ ] **Step 7.1: Failing tests** (spec test 3; anti-tautology — scope all queries to `[data-testid=needs-attention-summary-card]`, and for the Dashboard-level test clone the tree and REMOVE the `dashboard-inbox-desktop` node before asserting summary-card text, since the full inbox renders overlapping labels):
  - `totalCount 0` → "All caught up" + "Nothing waiting on you." + link href `/admin/needs-attention` still present
  - `totalCount 78, ingestionTotal 31, syncTotal 47` → headline "Needs attention · 78", chips "31 couldn't process" + "47 to review"
  - `ingestionTotal 0, syncTotal 5` → ingestion chip ABSENT, sync chip present (and vice versa)
  - Dashboard integration (R6-F1 tail): render `Dashboard`'s inbox column from a loader result whose totals (31/47) exceed every row-array length → summary card shows 31/47 (loader-derived, not rendered-subset)
  - card has `min-h-tap-min` class; chevron present

- [ ] **Step 7.2: Verify fail.**

- [ ] **Step 7.3: Implement the card:**

```tsx
// components/admin/NeedsAttentionSummaryCard.tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function NeedsAttentionSummaryCard({
  totalCount,
  ingestionTotal,
  syncTotal,
  className,
}: {
  totalCount: number;
  ingestionTotal: number;
  syncTotal: number;
  className?: string;
}) {
  const zero = totalCount === 0;
  return (
    <Link
      href="/admin/needs-attention"
      data-testid="needs-attention-summary-card"
      className={`flex min-h-tap-min items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad transition-colors duration-fast hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${className ?? ""}`}
    >
      <span className="flex min-w-0 flex-col gap-1">
        {zero ? (
          <>
            <span className="text-base font-semibold text-text-strong">All caught up</span>
            <span className="text-sm text-text-subtle">Nothing waiting on you.</span>
          </>
        ) : (
          <>
            <span className="text-base font-semibold text-text-strong">
              Needs attention · <span className="tabular-nums">{totalCount}</span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-subtle">
              {ingestionTotal > 0 && (
                <span data-testid="summary-chip-ingestions" className="tabular-nums">
                  {ingestionTotal} couldn&apos;t process
                </span>
              )}
              {syncTotal > 0 && (
                <span data-testid="summary-chip-syncs" className="tabular-nums">
                  {syncTotal} to review
                </span>
              )}
            </span>
          </>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-text-subtle" aria-hidden="true" />
    </Link>
  );
}
```

- [ ] **Step 7.4: Dashboard dual render** — inside `dashboard-inbox-col` (`Dashboard.tsx:627-654`): summary card first with `className="min-[720px]:hidden"`, then wrap the EXISTING header row + `NeedsAttentionInbox` in `<div data-testid="dashboard-inbox-desktop" className="hidden min-[720px]:flex min-[720px]:h-full min-[720px]:min-h-0 min-[720px]:flex-col min-[720px]:gap-3">` (replicating the section's previous interior: flex-col + gap-3 + the height pass-through the inbox's `h-full` root relied on — R4-F2). Pass `totalCount={result.needsAttention.totalCount} ingestionTotal={result.needsAttention.ingestionTotal} syncTotal={result.needsAttention.syncTotal}` to the card. The section's own classes (`:630`) are untouched — desktop capture selector `[data-testid=dashboard-inbox-col]` must see pixel-identical content at 1280px.
- [ ] **Step 7.5: Run tests** → PASS. **Commit** — `git commit -m "feat(admin): mobile summary card replaces dashboard inbox under 720px (exact stream totals)"`

### Task 8: Layout-dimensions e2e (band sweep) — MANDATORY real-browser task

**Files:**
- Modify: `tests/e2e/admin-nav-layout-dimensions.spec.ts` (harness: `WIDTHS` at `:38`, `rect()` helper, `signInAs(page, ADMIN_FIXTURE)`)

Dimensional invariants from spec §4.8 — assert ALL of these (verbatim list):
1. each of the THREE tabs spans full bar height (`self-stretch`) and equal widths (`flex-1`); bar full-viewport-width, bottom-anchored
2. badge must NOT change tab height: tab heights with badge present == without (±0.5px)
3. summary card ≥44px (`min-h-tap-min`) at all mobile widths; chevron vertically centered within card rect ±1px
4. desktop inbox parity through the new wrapper: at 1080/1280, `|inboxCol.height − showsCol.height| ≤ 0.5` (the `min-[1080px]:items-stretch` equal-height split, `Dashboard.tsx:544`) and `needs-attention-inbox` has a non-zero rect inside `dashboard-inbox-desktop`

- [ ] **Step 8.1: Write the assertions** — extend the existing per-width test: at 600/719 → `admin-bottom-tab-attention` rect equals dashboard/settings tab rects in width (±0.5) and height; `needs-attention-summary-card` visible with height ≥ 44 and chevron centered; `needs-attention-inbox` zero-rect (`display:none`). At 720/860/1024/1280 → summary card zero-rect; topbar contains NO link with href `/admin/needs-attention` (locator count 0); inbox visible. At 1080-band widths (1080 via added width if not in `WIDTHS` — add 1080 to the sweep) + 1280 → invariant 4. Badge height-neutrality: run one mobile width with seeded pending rows (badge present) and compare tab heights against the no-badge run.
- [ ] **Step 8.2: Run** — `pnpm exec playwright test tests/e2e/admin-nav-layout-dimensions.spec.ts` against a prod build → PASS (iterate on wrapper classes if invariant 4 fails — the wrapper classes are the variable, the invariant is not).
- [ ] **Step 8.3: Commit** — `git commit -m "test(admin): band-sweep invariants for attention tab, badge neutrality, summary card, desktop inbox parity"`

### Task 9: Navigation-flow + badge-freshness e2e

**Files:**
- Create: `tests/e2e/needs-attention-page.spec.ts` (use the `signInAs`/fixture harness from `admin-banner.spec.ts` / `admin-nav-layout-dimensions.spec.ts`; seed pending rows the way existing e2e fixtures seed `pending_ingestions`/`pending_syncs` — grep `tests/e2e/helpers/fixtures` for the seeding helpers)

- [ ] **Step 9.1: Write the flows** (mobile viewport 390×844):
  - tap summary card on `/admin` → lands on `/admin/needs-attention`, inbox items render
  - from `/admin/settings`, tap the Attention tab → page renders; tab shows `aria-current="page"`
  - badge text equals seeded pending count (seed 3 → "3"; seed 12 → "9+")
  - **soft-nav freshness (test 11):** load `/admin`, mutate seeded counts server-side (insert a pending row via the test DB helper), client-side navigate to settings (tab tap, no reload) → badge reflects the new count
  - **same-route freshness (test 11b):** on the page, Retry/Discard a seeded pending-ingestion item (`PendingPanelRetryButton` flow calls `router.refresh()` — `components/admin/PendingPanelRetryButton.tsx:34-57`) → badge decrements without any navigation
  - desktop spot-check: `page.goto("/admin/needs-attention")` at 1280 renders the page (no redirect), topbar has no Attention link
- [ ] **Step 9.2: Run** → PASS. **Commit** — `git commit -m "test(admin): needs-attention navigation + badge freshness e2e (soft-nav + same-route)"`

### Task 10: Transition audit — MANDATORY

**Files:**
- Verify (no expected changes): `components/admin/nav/AdminNav.tsx`, `components/admin/NeedsAttentionSummaryCard.tsx`, `app/admin/needs-attention/page.tsx`, `components/layout/PageTransition.tsx`

Spec §4.9 transition inventory (verbatim — every pair instant by design, route-level animation owned by the existing PageTransition):

| Transition | Treatment |
|---|---|
| badge hidden ↔ shown | instant |
| badge n ↔ 9+ | instant |
| summary card items ↔ all-caught-up | instant |
| page alerts present ↔ absent | instant |
| page list ↔ empty state | instant |
| dashboard ↔ page route change | PageTransition (existing) |
| any × reduced-motion | PageTransition disables motion; rest instant |

- [ ] **Step 10.1: Audit** — grep the four files for `AnimatePresence`, `motion.`, ternary renders, and `&&` conditional blocks; confirm NO new framer-motion usage was introduced and every conditional render in the new components is a server-rendered/instant swap per the table. Confirm `PageTransition` is untouched (`git diff main -- components/layout/PageTransition.tsx` is empty). Compound transitions: none possible (no two client-animated states co-exist) — confirm the only client state is the badge count value.
- [ ] **Step 10.2: Record** the audit result in the commit message of the next task (no code change expected; if a violation IS found, fix to instant + retest).

### Task 11: Screenshot manifest + help page

**Files:**
- Modify: `scripts/help-screenshots.manifest.ts:48-79`, `app/help/admin/review-queues/page.mdx`
- Test: `tests/help/page-review-queues.test.tsx` (extend)

- [ ] **Step 11.1: Manifest entry** (shape per `ManifestEntry`, `scripts/help-screenshots.manifest.ts:10-20`):

```ts
{
  key: "needs-attention-mobile",
  route: "/admin/needs-attention",
  fixture: RPAS_CENTRAL_2026,
  frozenClockInstant: MID_SHOW_INSTANT,
  viewport: MOBILE,
  captureSelector: "[data-testid=admin-needs-attention-page]",
},
```

- [ ] **Step 11.2: Help MDX** — add an "On your phone" section to `app/help/admin/review-queues/page.mdx` after the existing dashboard-panel paragraph: 2-3 sentences (tab in the bottom bar, badge = waiting count, the dashboard card opens the same page) + `<Screenshot name="needs-attention-mobile" alt="The Needs attention page on a phone: alerts on top, the full inbox below, with the Attention tab active in the bottom bar." />`. Extend `tests/help/page-review-queues.test.tsx` to assert the new section + screenshot render. Check `tests/help/forbidden-prose-registry.test.ts` still passes (help prose rules).
- [ ] **Step 11.3: Generate the baseline via the SANCTIONED pinned-docker amd64 procedure** (byte-comparison gate discipline — never from the host): run the documented `pnpm screenshot:help` docker flow with `--platform linux/amd64`, commit ONLY the new `needs-attention-mobile-{light,dark}.webp` baselines, then `git restore public/help/screenshots/` for any pre-existing baselines the local capture touched (companion-brief rule). `dashboard-overview` + `review-queues-empty-state` are desktop captures and must NOT drift — if they do, the dual-render leaked visible pixels at 1280px; fix the code, don't regen those baselines.
- [ ] **Step 11.4: Run** — `pnpm vitest run tests/help` → PASS. **Commit** — `git commit -m "docs(help): needs-attention mobile screenshot + review-queues phone section"`

### Task 12: Full local gate

- [ ] **Step 12.1:** `pnpm vitest run` (full suite) — only pre-existing failures allowed (2 framer/jsdom hydration UI tests + cred-gated smokes; verify they fail identically on `main`).
- [ ] **Step 12.2:** `pnpm typecheck` → 0 errors. `pnpm exec prettier --check` on every touched file (no CI format gate — run it manually, M12.8 lesson).
- [ ] **Step 12.3:** Full Playwright e2e for the touched specs against a prod build. Generated-file freshness: `pnpm gen:spec-codes` (no §12.4 changes — diff must be empty), admin-tables/traceability generators only if their inputs changed (they shouldn't).
- [ ] **Step 12.4: Commit** any stragglers — `git commit -m "chore: close out local gates for mobile needs-attention milestone"`

### Task 13: Impeccable v3 dual-gate (invariant 8 — EXTERNAL attestation)

- [ ] **Step 13.1:** Dispatch a FRESH external session/subagent (never the session that wrote the UI) to run `/impeccable critique` on the milestone diff (canonical v3 preflight: PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 13.2:** Same for `/impeccable audit`.
- [ ] **Step 13.3:** Fix or explicitly defer (DEFERRED.md entry) every HIGH/CRITICAL finding; LOWs may go to BACKLOG. Spec-check any copy rewrites against the spec before shipping (critique knows UX, not product contracts). Re-run the dual gate after fix commits (it fires on every UI mutation).

### Task 14: Adversarial review (cross-model) — MANDATORY before close-out

- [ ] **Step 14.1:** Per-milestone code review: `codex-companion adversarial-review --background --fresh --base main --scope branch` with REVIEWER-ONLY framing, fresh-eyes posture, and the spec §7 do-not-relitigate list (D-1..D-5, chips, dual-render, badge mechanism + fail-quiet, null-count behavior change, registry rows, wrapper parity).
- [ ] **Step 14.2:** Iterate fix → re-review (`--resume-last`) until APPROVE, no round budget. Class-sweep every finding before patching the named instance; verify each fix-subagent's commit landed on THIS branch (`git merge-base --is-ancestor <sha> HEAD`).
- [ ] **Step 14.3:** Whole-milestone fresh-eyes pass is the FINAL review round (small milestone: the branch-scope review at convergence covers it; confirm the last round ran with fresh-eyes posture over the entire diff).

### Task 15: CI + merge

- [ ] **Step 15.1:** Push branch, open PR against `main`. If PR shows DIRTY/behind, merge base in first (absent gates ≠ failing gates).
- [ ] **Step 15.2:** Real GitHub-Actions CI green: x1-x6 audits (x3 trust-domain audit exercises the new PROTECTED_ROUTES rows; avoid `Array.from(` in route files — use literal arrays), screenshots-drift (new baselines committed; desktop baselines untouched), validation-schema-parity (no-op — no migrations), Vercel build, traceability.
- [ ] **Step 15.3:** Merge to `main` (merge-commit method, per project convention). Delete branch. Update memory + BACKLOG/DEFERRED with any open items.

---

## Plan self-review checklist (run before adversarial review of this plan)

- Spec coverage: D-1..D-5 → Tasks 5/4/7/4/6; §4.1→T1, §4.2→T2/T3/T4, §4.3→T5, §4.4→T4, §4.5→T7, §4.6/4.7→T4/T7 tests, §4.8→T8, §4.9→T10, §4.10→T11, §5→T1/T2/T3/T5, §9 tests 1-11b → T1(1,2,2b,4b),T2(4b,7b),T4(4,4c,5,6),T5(7,7b),T6(9),T7(3),T8(8),T9(10,11,11b).
- Anti-tautology: summary-card assertions scoped + sibling-removed (T7); topbar/bottom-bar scoped queries (T4); loader totals underivable from fixtures (T1/T2/T7).
- Types consistent: `LoadNeedsAttentionResult`, `NeedsAttentionCountResult`, `initialBadgeCount`, `PAGE_RENDER_CAP` used identically across tasks.
