# Mobile auto-applied parity — spec

**Date:** 2026-07-16
**Branch:** `feat/mobile-autoapplied-parity` (worktree off `origin/main` @ `a01c05f99`)
**Closes:** DEFERRED `FLOW4-1` (P1, `DEFERRED.md:467-471`) + `FLOW4-7` (P3 ride-along, `DEFERRED.md:503-507`). Backlog: `BL-FLOW4-MOBILE-AUTOAPPLIED-PARITY`.

## 1. Problem

`RecentAutoAppliedStrip` mounts only inside `dashboard-inbox-desktop` (`components/admin/Dashboard.tsx:723-766`, `hidden min-[720px]:flex`). The `<720px` branch renders only `NeedsAttentionSummaryCard` (`Dashboard.tsx:716-722`, `min-[720px]:hidden`) with no auto-applied count. The roster-shift `DataQualityBadge` IS visible on mobile, so Doug sees the amber signal but has no path to count/review/Accept/Undo auto-applied changes.

Ratified approach (user, 2026-07-16): reuse the existing mobile full-list route `/admin/needs-attention` (the summary card already links there, `NeedsAttentionSummaryCard.tsx:21`) — do NOT build a net-new mobile surface, do NOT inline the strip in the `<720px` dashboard branch.

## 2. Current state (citations)

- `app/admin/needs-attention/page.tsx:28-72` — RSC page: `requireAdminIdentity()` (`:29`), `loadNeedsAttention({ cap: PAGE_RENDER_CAP })` (`:30`), `AdminPageHeader` (renders `<h1>`, `components/admin/nav/AdminPageHeader.tsx:70`), one `<section aria-label="Needs attention">` (`:51`) with degraded copy (`:52-59`) or `NeedsAttentionInbox` (`:61-67`). No strip, no other headings on the page.
- `components/admin/RecentAutoAppliedStrip.tsx:409-469` — client component, props `{ data: RecentAutoApplied; actions: RecentAutoAppliedStripActions; defaultExpanded?: boolean }`. `infra_error` → bounded fallback section with hardcoded `<h4>` (`:426-436`); `groups.length === 0` → `null` (`:440`); populated → `<section aria-label="Recently auto-applied changes">` (`:443-446`) + hardcoded `<h4>` (`:448`) + groups (`GroupSection` renders `<h5>` per group, `:278`) + overflow note (`:459-466`). Heading levels are calibrated for the dashboard's `<h3>` context and are "not portable" by the file's own comment (`:273-277`).
- `lib/admin/loadRecentAutoApplied.ts:123-126` — `loadRecentAutoApplied(deps: { publishedShowIds: string[]; supabase?: SupabaseClient })` → `RecentAutoApplied` (`:47-55`: `{ kind:"ok"; groups; overflowCount } | { kind:"infra_error"; message }`). Registered in `tests/admin/_metaInfraContract.test.ts:231` and `tests/admin/_metaBoundedReads.test.ts` `READ_MODULES`.
- `components/admin/Dashboard.tsx:267-268` — dashboard derives `publishedShowIds` from its own shows rows (bounded `.limit(ACTIVE_SHOWS_CAP)`, `:203`; `ACTIVE_SHOWS_CAP = 500`, `:57`) and calls `loadRecentAutoApplied({ publishedShowIds })`.
- `components/admin/NeedsAttentionSummaryCard.tsx:5-59` — props `{ totalCount, ingestionTotal, syncTotal, syncProblemTotal, className? }`; `zero = totalCount === 0` (`:18`) renders "All caught up / Nothing waiting on you." (`:26-30`); non-zero renders "Needs attention · {totalCount}" (`:33-35`) + chips row (`:36-52`, testids `summary-chip-ingestions` / `summary-chip-syncs` / `summary-chip-sync-problems`).
- `app/admin/_actions/autoApplied.ts` — the 3 module-level `"use server"` actions (`acceptChangeAction`, `acceptAllAction`, `undoFromDashboardAction`); each success branch calls `revalidatePath("/admin", "page")` (`:54`, `:85`, `:113`; undo also `revalidateShow`, `:112`). Directly importable from any RSC page (module-level directive — no inline-closure boundary risk).
- Tests: `tests/app/admin/needsAttentionPage.test.tsx` (page), `tests/components/admin/NeedsAttentionSummaryCard.test.tsx` + `tests/components/needsAttentionSummaryCardSyncProblem.test.tsx` (card), `tests/admin/autoAppliedActions.test.ts` (actions; `:75` asserts `revalidatePath("/admin", "page")`), `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (strip), `tests/components/admin/Dashboard.test.tsx` (dashboard render incl. summary card). `tests/e2e/needs-attention-page.spec.ts` exists but is excluded from `pnpm test` (e2e); grep it for removed testids before push.

## 3. Design

### D1 — new helper `lib/admin/loadPublishedShowIds.ts`

```ts
export type PublishedShowIds =
  | { kind: "ok"; ids: string[] }
  | { kind: "infra_error"; message: string };

export async function loadPublishedShowIds(deps?: {
  supabase?: SupabaseClient;
}): Promise<PublishedShowIds>;
```

- Service-role client by default (`createSupabaseServiceRoleClient()`, same construction-throw handling as `loadRecentAutoApplied.ts:127-133`), injectable for tests.
- One chained read: `.from("shows").select("id").eq("published", true).limit(PUBLISHED_IDS_CAP)` where the helper declares `export const PUBLISHED_IDS_CAP = 500` — the same value as `ACTIVE_SHOWS_CAP` (`components/admin/Dashboard.tsx:57`), so page/dashboard parity holds at the cap. The helper must NOT import from `components/admin/Dashboard.tsx` (a prod `lib/` → component-graph edge); instead the new unit test pins `PUBLISHED_IDS_CAP === ACTIVE_SHOWS_CAP` by importing both (test-side import precedent: `tests/admin/fetchDashboardData.test.ts:408`).
- Destructures `{ data, error }`; returned error and thrown error both → `{ kind: "infra_error", message }` (invariant 9).
- Registered in `tests/admin/_metaInfraContract.test.ts` (new `helper: "loadPublishedShowIds"` row) AND appended to `READ_MODULES` in `tests/admin/_metaBoundedReads.test.ts`.
- Read-only: no telemetry emit needed (not a mutation surface, invariant 10 does not apply).

### D2 — mount strip on `/admin/needs-attention`

`app/admin/needs-attention/page.tsx`:

- Load in parallel with the existing loader:
  ```ts
  const [result, publishedIds] = await Promise.all([
    loadNeedsAttention({ cap: PAGE_RENDER_CAP }),
    loadPublishedShowIds(),
  ]);
  const recentAutoApplied: RecentAutoApplied =
    publishedIds.kind === "ok"
      ? await loadRecentAutoApplied({ publishedShowIds: publishedIds.ids })
      : { kind: "infra_error", message: publishedIds.message };
  ```
  (The ids read gates the change-log read; a failed ids read degrades to the strip's existing bounded fallback copy — never a silently empty strip.)
- Render `<RecentAutoAppliedStrip data={recentAutoApplied} actions={{ acceptChangeAction, acceptAllAction, undoFromDashboardAction }} headingLevel={2} />` as a SIBLING after the existing `<section aria-label="Needs attention">` (`page.tsx:51-69`), inside the page's root flex column. The strip renders its own `<section>`; it must NOT nest inside the needs-attention section (separate concept, mirrors the desktop composition where the strip follows the inbox, `Dashboard.tsx:754-766`).
- The strip renders (or nulls) independently of the needs-attention degraded branch: a `"kind" in result` inbox failure does not suppress the strip, and vice versa.
- Actions are imported directly from `app/admin/_actions/autoApplied.ts` — direct references, never inline closures (RSC boundary rule).

### D3 — revalidate the page from the actions

All 3 actions in `app/admin/_actions/autoApplied.ts` add `revalidatePath("/admin/needs-attention", "page")` immediately after each existing `revalidatePath("/admin", "page")` (success branches only — `:54`, `:85`, `:113`). Without this the page serves stale rows after a disposition performed on it.

### D4 — `headingLevel` prop on the strip

`RecentAutoAppliedStrip` gains `headingLevel?: 2 | 4` (default `4` — dashboard behavior unchanged without edits at the call site).

- Strip heading tag = `h{headingLevel}` at BOTH `<h4>` sites (`:427` infra_error branch and `:448` populated branch — same level in both branches).
- Group heading tag = `h{headingLevel + 1}` (`GroupSection` `:278` `<h5>` becomes dynamic; `GroupSection` receives the computed group level as a prop). So: dashboard `4/5` (unchanged), page `2/3` (no `h1 → h4` skip; WCAG 1.3.1 — do not reintroduce the S3C-3 class).
- Implementation shape: `const HeadingTag = \`h${headingLevel}\` as const;` — heading levels are from a closed union, never string-interpolated from data.
- Visual classes on the headings are UNCHANGED (`text-sm font-semibold text-text-strong`) at both levels; the prop changes semantics only. Mode boundary: `headingLevel` affects heading tags only — no other element differs between the two levels.

### D5 — FLOW4-7 ride-along: `aria-labelledby`

The populated section (`:443-446`) currently carries `aria-label="Recently auto-applied changes"` AND a same-text heading. Replace the `aria-label` with `aria-labelledby` pointing at the heading's `id` (generate via `useId()`). Apply to the populated branch; the `infra_error` branch section (`:426`) has no `aria-label` today — give it the same `aria-labelledby` treatment for consistency. Accessible name is unchanged in both branches ("Recently auto-applied").

Note the visible heading text is "Recently auto-applied" (`:427`, `:448`) while the removed `aria-label` said "Recently auto-applied changes" — after this change the accessible name follows the heading ("Recently auto-applied"). That is the point of FLOW4-7 (one source of truth). Verified: no existing test pins the old accessible name (repo grep for "Recently auto-applied changes" in `tests/` is empty).

### D6 — summary-card auto-applied chip

`NeedsAttentionSummaryCard` gains `autoAppliedCount: number` (required — the only call site is `Dashboard.tsx:716`, which is edited in the same change).

- `Dashboard.tsx` computes: `recentAutoApplied.kind === "ok" ? recentAutoApplied.groups.reduce((n, g) => n + g.rows.length, 0) : 0` and threads it. Degraded auto-applied read → `0` → chip hidden (no false signal; the desktop strip shows the degraded copy, mobile simply doesn't count — awareness parity is best-effort under infra failure).
- Card internals:
  - `const autoApplied = Number.isFinite(autoAppliedCount) && autoAppliedCount > 0 ? autoAppliedCount : 0;` (guard: null/NaN/negative/zero all render as absent).
  - `zero` becomes `totalCount === 0 && autoApplied === 0` — the card may not claim "All caught up / Nothing waiting on you." while dispositions are pending.
  - Non-zero branch: the title count segment `· {totalCount}` renders only when `totalCount > 0`; with `totalCount === 0 && autoApplied > 0` the title is plain "Needs attention" (never "· 0"). `totalCount` semantics are untouched — auto-applied is NOT folded into it (mirrors desktop, where the strip is a separate section below the inbox).
  - New chip in the existing chips row (`:36-52`), after `summary-chip-sync-problems`: `{autoApplied > 0 && (<span data-testid="summary-chip-auto-applied" className="tabular-nums">{autoApplied} auto-applied</span>)}` — same classes as sibling chips.
- The card still links to `/admin/needs-attention` (`:21`), which after D2 hosts the strip — the tap-through completes the disposition path.

### Transition inventory

| Transition | Treatment |
| --- | --- |
| chip absent ↔ present (count crosses 0) | instant — no animation (matches sibling chips) |
| "All caught up" ↔ count line | instant — pre-existing ternary, unchanged treatment |
| strip on page: null ↔ populated ↔ infra_error | pre-existing strip behavior, unchanged by this spec |

No new visual states with animation; no compound transitions introduced.

### Dimensional invariants

None new: the strip and card join existing single-column flex flows (`page.tsx:33` root `flex-col`; card is self-contained). No fixed-dimension parent with flex/grid children is introduced.

## 4. Guard conditions

| Input | null/empty/zero/NaN behavior |
| --- | --- |
| `autoAppliedCount` (card) | non-finite, negative, or 0 → chip absent; zero-state eligible |
| `publishedIds.kind === "infra_error"` (page) | strip renders its bounded degraded copy (D2 mapping) |
| `publishedIds.ids = []` (page) | `loadRecentAutoApplied` called with `[]`; existing loader returns ok/empty → strip renders `null` (`RecentAutoAppliedStrip.tsx:440`) |
| `recentAutoApplied.kind === "infra_error"` (dashboard chip) | count `0` → chip hidden |
| `headingLevel` omitted | defaults to `4` — dashboard markup byte-identical to today |
| needs-attention load degraded + strip populated | both render independently (degraded copy + strip) |

## 5. Out of scope

- FLOW4-2 / FLOW4-3 (badge affordance/glyph) — separate cluster.
- Strip visual redesign, mobile bottom sheet, inline `<720px` dashboard strip (rejected alternatives).
- `AUTOAPPLIED-*` deferrals, `DESTRUCT-*` deferrals.
- Folding auto-applied into `needsAttention.totalCount` or the `/api` count route (`tests/app/api/needsAttentionCountRoute.test.ts` surface) — count semantics unchanged everywhere.
- `defaultExpanded` seam (`RecentAutoAppliedStrip.tsx:412`) — untouched, page uses collapsed-by-default like the dashboard.

## 6. Tests (surfaces + shapes)

1. **`tests/admin/loadPublishedShowIds.test.ts`** (new): ok path (ids returned, `.eq("published", true)` + `.limit(PUBLISHED_IDS_CAP)` asserted on the builder mock); returned-error → `infra_error`; thrown → `infra_error`; client-construction throw → `infra_error`; drift pin `PUBLISHED_IDS_CAP === ACTIVE_SHOWS_CAP` (imports both). Registry: `_metaInfraContract` row + `_metaBoundedReads` `READ_MODULES` entry land with the helper (fails-by-default check: the meta-tests fail if the rows are missing).
2. **`tests/app/admin/needsAttentionPage.test.tsx`** (extend): strip renders below the inbox section as a sibling with `headingLevel={2}` (assert `<h2>` "Recently auto-applied" present when populated); ids `infra_error` → strip degraded copy while inbox healthy; inbox degraded + strip populated both render; empty groups → no strip section.
3. **`tests/admin/autoAppliedActions.test.ts`** (extend): each success branch asserts BOTH `revalidatePath("/admin", "page")` AND `revalidatePath("/admin/needs-attention", "page")`; failure branches keep asserting `revalidatePath` not called.
4. **`tests/components/admin/RecentAutoAppliedStrip.test.tsx`** (extend): default renders `h4`/`h5` (regression pin); `headingLevel={2}` renders `h2`/`h3` in populated AND infra_error branches; populated + degraded sections' accessible name comes from the heading via `aria-labelledby` (assert `section` accessible name "Recently auto-applied" and absence of `aria-label`).
5. **`tests/components/admin/NeedsAttentionSummaryCard.test.tsx`** (extend): chip absent at 0/negative/NaN; chip "3 auto-applied" at 3; `totalCount=0 && autoAppliedCount>0` → NOT "All caught up", title without "· 0", only the auto-applied chip; `totalCount>0 && autoAppliedCount>0` → title count + all applicable chips.
6. **`tests/components/admin/Dashboard.test.tsx`** (extend — it already renders the summary card via `needs-attention-summary-card`): `autoAppliedCount` threaded as the groups' row sum; `infra_error` data → chip absent.

Anti-tautology: card expectations derive from constructed props (e.g., 2 groups × [2,1] rows → chip text "3 auto-applied"), never from re-reading the rendered container; heading-level assertions query by role+level (`getByRole("heading", { level: 2 })`), not by tag-name scans of a container that renders both levels.

## 7. Meta-test inventory

- **EXTENDS** `tests/admin/_metaInfraContract.test.ts` — new `loadPublishedShowIds` registry row (invariant 9).
- **EXTENDS** `tests/admin/_metaBoundedReads.test.ts` — `READ_MODULES` += `lib/admin/loadPublishedShowIds.ts`.
- **No new meta-test**: no new recipe/style class, no new mutation surface (`tests/log/_metaMutationSurfaceObservability.test.ts` discovers no new mutating route/action — the page is read-only and the 3 actions already carry registry membership), no advisory-lock surface (actions delegate to self-locking helpers, single-holder topology untouched — `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected).
- Source-scanning registries that walk edited files (`page rebuild fans out` class): run full `pnpm test` before push; expected touchpoints are help-affordance and DOM-anchor scanners if any scan `app/admin/needs-attention/page.tsx` — additive-only edits should not trip them, but the full-suite gate is the arbiter.

## 8. Do-not-relitigate

- Strip placement on the shared full-list page rather than a mobile-only surface: user-ratified 2026-07-16 (this spec §1). Desktop visitors to `/admin/needs-attention` seeing the strip is intended (consistency), not scope creep.
- `totalCount` NOT including auto-applied: mirrors desktop composition (`Dashboard.tsx:754-766` strip is outside the inbox); DEFERRED FLOW4-1 asks for a disposition path, not a needs-attention recount. The `/api` count route and bell are untouched by design.
- `PUBLISHED_IDS_CAP` as a local constant drift-pinned to `ACTIVE_SHOWS_CAP` by a test (not a prod import from `Dashboard.tsx`, not a constant relocation): the prod import would drag the dashboard component graph into a `lib/` helper; relocating `ACTIVE_SHOWS_CAP` is refactor scope this spec avoids.
- Chip hidden under degraded auto-applied read (not an error line on the card): the card is a single `<Link>`; embedding error copy inside it is a new pattern — the strip on the linked page carries the degraded copy instead.
- `headingLevel` union `2 | 4` only (not full 1–6 flexibility): YAGNI — exactly two mount contexts exist.
- FLOW4-7 accessible-name change ("…changes" suffix dropped): follows the heading, single source of truth — the rename is the fix, not a regression.

## 9. Close-out bookkeeping (same PR)

- `DEFERRED.md`: FLOW4-1 → `[✅ RESOLVED 2026-07-16]` (strip on `/admin/needs-attention` + summary-card chip); FLOW4-7 → `[✅ RESOLVED 2026-07-16]` (`aria-labelledby`).
- `BACKLOG.md`: no edit — verified no `BL-FLOW4-*` row exists in either `BACKLOG.md` or `docs/superpowers/plans/BACKLOG.md` (the DEFERRED refs were forward-looking ids that were never filed; same finding as the destructive-confirm arc).
- Invariant-8 impeccable dual-gate (critique + audit) — UI surface touched (`app/admin/needs-attention/page.tsx`, `components/admin/*`), runs before whole-diff adversarial review.
