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
- `lib/admin/loadRecentAutoApplied.ts:123-126` — `loadRecentAutoApplied(deps: { publishedShowIds: string[]; supabase?: SupabaseClient })` → `RecentAutoApplied` (`:47-55`: `{ kind:"ok"; groups; renderedCount; overflowCount; rosterShiftByShow } | { kind:"infra_error"; message }`). Registered in `tests/admin/_metaInfraContract.test.ts:231` and `tests/admin/_metaBoundedReads.test.ts` `READ_MODULES`.
- **Critical: `publishedShowIds` does NOT scope the strip's group list.** The `show_change_log` read that builds `groups` is GLOBAL (`loadRecentAutoApplied.ts:144-155` — filtered by `source=auto_apply` / `status=applied` / `acknowledged_at is null` / `change_kind`, but NOT by show id). `publishedShowIds` is the `p_show_ids` argument to the `roster_shift_counts` RPC ONLY (`:197-199`), producing `rosterShiftByShow`. And `rosterShiftByShow` is consumed ONLY by the dashboard's shows-table roster-shift badges (`Dashboard.tsx:476-491`); the strip component reads only `data.kind` / `data.groups` / `data.overflowCount` (`RecentAutoAppliedStrip.tsx:421`,`:440`,`:459`).
- `components/admin/Dashboard.tsx:267-268` — dashboard derives `publishedShowIds` from its own shows rows (bounded `.limit(ACTIVE_SHOWS_CAP)`, `:203`; `ACTIVE_SHOWS_CAP = 500`, `:57`) and calls `loadRecentAutoApplied({ publishedShowIds })` — because the dashboard DOES render the badges.
- `components/admin/NeedsAttentionSummaryCard.tsx:5-59` — props `{ totalCount, ingestionTotal, syncTotal, syncProblemTotal, className? }`; `zero = totalCount === 0` (`:18`) renders "All caught up / Nothing waiting on you." (`:26-30`); non-zero renders "Needs attention · {totalCount}" (`:33-35`) + chips row (`:36-52`, testids `summary-chip-ingestions` / `summary-chip-syncs` / `summary-chip-sync-problems`).
- `app/admin/_actions/autoApplied.ts` — the 3 module-level `"use server"` actions (`acceptChangeAction`, `acceptAllAction`, `undoFromDashboardAction`); each success branch calls `revalidatePath("/admin", "page")` (`:54`, `:85`, `:113`; undo also `revalidateShow`, `:112`). Directly importable from any RSC page (module-level directive — no inline-closure boundary risk).
- Tests: `tests/app/admin/needsAttentionPage.test.tsx` (page), `tests/components/admin/NeedsAttentionSummaryCard.test.tsx` + `tests/components/needsAttentionSummaryCardSyncProblem.test.tsx` (card), `tests/admin/autoAppliedActions.test.ts` (actions; `:75` asserts `revalidatePath("/admin", "page")`), `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (strip), `tests/components/admin/Dashboard.test.tsx` (dashboard render incl. summary card). `tests/e2e/needs-attention-page.spec.ts` exists but is excluded from `pnpm test` (e2e); grep it for removed testids before push.

## 3. Design

### D1 — mount strip on `/admin/needs-attention` with `publishedShowIds: []`

`app/admin/needs-attention/page.tsx`:

- Load in parallel with the existing loader:
  ```ts
  const [result, recentAutoApplied] = await Promise.all([
    loadNeedsAttention({ cap: PAGE_RENDER_CAP }),
    // publishedShowIds:[] is CORRECT here, not a stub: it feeds only the
    // roster_shift_counts RPC → rosterShiftByShow, which the shows-table badges
    // consume — and this page has no shows table. The strip's group list is a
    // GLOBAL show_change_log read, unaffected by this arg, so the page strip is
    // byte-parity with the dashboard strip's groups. [] → RPC returns zero rows:
    // roster_shift_counts is `where show_id = any(p_show_ids)`
    // (supabase/migrations/20260706130000_show_change_log_acknowledged.sql:40),
    // and `= any('{}')` matches nothing — never errors.
    loadRecentAutoApplied({ publishedShowIds: [] }),
  ]);
  ```
- No new read module: the page composes two already-registered loaders. No `_metaInfraContract` / `_metaBoundedReads` change.
- Render `<RecentAutoAppliedStrip data={recentAutoApplied} actions={{ acceptChangeAction, acceptAllAction, undoFromDashboardAction }} headingLevel={2} />` as a SIBLING after the existing `<section aria-label="Needs attention">` (`page.tsx:51-69`), inside the page's root flex column. The strip renders its own `<section>`; it must NOT nest inside the needs-attention section (separate concept, mirrors the desktop composition where the strip follows the inbox, `Dashboard.tsx:754-766`).
- The strip renders (or nulls) independently of the needs-attention degraded branch: a `"kind" in result` inbox failure does not suppress the strip, and vice versa. A `recentAutoApplied.kind === "infra_error"` (change-log read or roster RPC faulted) renders the strip's own bounded fallback copy (`RecentAutoAppliedStrip.tsx:421-436`); empty groups → strip renders `null` (`:440`).
- Actions are imported directly from `app/admin/_actions/autoApplied.ts` — direct references, never inline closures (RSC boundary rule).

### D2 — revalidate the page from the actions

All 3 actions in `app/admin/_actions/autoApplied.ts` add `revalidatePath("/admin/needs-attention", "page")` immediately after each existing `revalidatePath("/admin", "page")` (success branches only — `:54`, `:85`, `:113`). Without this the page serves stale rows after a disposition performed on it.

### D3 — `headingLevel` prop on the strip

`RecentAutoAppliedStrip` gains `headingLevel?: 2 | 4` (default `4` — dashboard behavior unchanged without edits at the call site).

- Strip section heading tag: `const SectionHeading = headingLevel === 2 ? "h2" : "h4";` (type `"h2" | "h4"`), rendered `<SectionHeading className="text-sm font-semibold text-text-strong">` at BOTH sites (`:427` infra_error branch and `:448` populated branch — same level in both).
- Group heading tag: the strip computes `const groupHeadingTag = headingLevel === 2 ? "h3" : "h5";` (type `"h3" | "h5"`) and passes it to `GroupSection` as a `groupHeadingTag` prop; `GroupSection` renders `<GroupHeadingTag …>` in place of the hardcoded `<h5>` (`:278`). So: dashboard `4/5` (unchanged), page `2/3` (no `h1 → h4` skip; WCAG 1.3.1 — do not reintroduce the S3C-3 class).
- **Type-safety (mandatory):** derive tags by ternary yielding a string-literal union — NOT `` `h${headingLevel}` `` template interpolation (produces `string`, unassignable to a JSX tag under strict TS), NOT `as const` on a computed expression, NOT `headingLevel + 1` arithmetic (widens to `number`). The ternary's `"h2" | "h4"` / `"h3" | "h5"` are `keyof JSX.IntrinsicElements`, assignable to a Capitalized JSX tag variable. Under `exactOptionalPropertyTypes` this is the only shape that typechecks.
- Visual classes on the headings are UNCHANGED (`text-sm font-semibold text-text-strong`) at both levels; the prop changes semantics only. Mode boundary: `headingLevel` affects heading tags only — no other element differs between the two levels.

### D4 — FLOW4-7 ride-along: `aria-labelledby`

The populated section (`:443-446`) currently carries `aria-label="Recently auto-applied changes"` AND a same-text heading. Replace the `aria-label` with `aria-labelledby` pointing at the heading's `id` (generate via `useId()`). Apply to the populated branch; the `infra_error` branch section (`:426`) has no `aria-label` today — give it the same `aria-labelledby` treatment for consistency. Accessible name is unchanged in both branches ("Recently auto-applied").

Note the visible heading text is "Recently auto-applied" (`:427`, `:448`) while the removed `aria-label` said "Recently auto-applied changes" — after this change the accessible name follows the heading ("Recently auto-applied"). That is the point of FLOW4-7 (one source of truth). Verified: no existing test pins the old accessible name (repo grep for "Recently auto-applied changes" in `tests/` is empty).

### D5 — summary-card auto-applied chip

`NeedsAttentionSummaryCard` gains `autoAppliedCount?: number` (OPTIONAL, default treated as `0`). Optional deliberately: the guard below absorbs `undefined`, so the 3 existing test render sites in `tests/components/needsAttentionSummaryCardSyncProblem.test.tsx:12,24,36` keep compiling without edits, and the sole prod call site `Dashboard.tsx:716` passes it explicitly.

- `Dashboard.tsx` computes the TRUE backlog, not the capped rendered rows: `recentAutoApplied.kind === "ok" ? recentAutoApplied.renderedCount + recentAutoApplied.overflowCount : 0` and threads it. This equals `matchedTotal` (the `count:"exact"` figure, `loadRecentAutoApplied.ts:160,168,219`); `groups.reduce(rows)` would equal `renderedCount` alone and silently cap the chip at `STRIP_RENDER_CAP = 50` (`loadRecentAutoApplied.ts:57`) — the mobile chip must not under-report a 50+ backlog. Degraded auto-applied read → `0` → chip hidden (no false signal; the desktop strip shows the degraded copy, mobile simply doesn't count — awareness parity is best-effort under infra failure).
- Card internals:
  - `const autoApplied = typeof autoAppliedCount === "number" && Number.isFinite(autoAppliedCount) && autoAppliedCount > 0 ? autoAppliedCount : 0;` (guard: undefined/null/NaN/negative/zero all render as absent).
  - `zero` becomes `totalCount === 0 && autoApplied === 0` — the card may not claim "All caught up / Nothing waiting on you." while dispositions are pending.
  - Non-zero branch: the title count segment `· {totalCount}` renders only when `totalCount > 0`; with `totalCount === 0 && autoApplied > 0` the title is plain "Needs attention" (never "· 0"). `totalCount` semantics are untouched — auto-applied is NOT folded into it (mirrors desktop, where the strip is a separate section below the inbox).
  - New chip in the existing chips row (`:36-52`), after `summary-chip-sync-problems`: `{autoApplied > 0 && (<span data-testid="summary-chip-auto-applied" className="tabular-nums">{autoApplied} auto-applied</span>)}` — same classes as sibling chips.
- The card still links to `/admin/needs-attention` (`:21`), which after D1 hosts the strip — the tap-through completes the disposition path.

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
| `autoAppliedCount` (card) | undefined (omitted), non-finite, negative, or 0 → chip absent; zero-state eligible |
| `recentAutoApplied.kind === "infra_error"` (page) | strip renders its bounded degraded copy (`RecentAutoAppliedStrip.tsx:421-436`) |
| `groups = []` (page, ok data) | strip renders `null` (`RecentAutoAppliedStrip.tsx:440`) — page shows inbox only |
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

1. **`tests/app/admin/needsAttentionPage.test.tsx`** (extend): strip renders below the inbox section as a sibling with `headingLevel={2}` (assert `<h2>` "Recently auto-applied" present when populated — mock `loadRecentAutoApplied` to ok/groups); `loadRecentAutoApplied` mocked as `infra_error` → strip degraded copy while inbox healthy; inbox degraded (`loadNeedsAttention` infra_error) + strip populated → both render; empty groups → no strip section (inbox only). Assert `loadRecentAutoApplied` was invoked with `publishedShowIds: []`.
2. **`tests/admin/autoAppliedActions.test.ts`** (extend): each success branch asserts BOTH `revalidatePath("/admin", "page")` AND `revalidatePath("/admin/needs-attention", "page")`; failure branches keep asserting `revalidatePath` not called.
3. **`tests/components/admin/RecentAutoAppliedStrip.test.tsx`** (extend): default renders `h4`/`h5` (regression pin); `headingLevel={2}` renders `h2`/`h3` in populated AND infra_error branches; populated + degraded sections' accessible name comes from the heading via `aria-labelledby` (assert `section` accessible name "Recently auto-applied" and absence of `aria-label`).
4. **`tests/components/admin/NeedsAttentionSummaryCard.test.tsx`** (extend): chip absent at 0/negative/NaN; chip "3 auto-applied" at 3; `totalCount=0 && autoAppliedCount>0` → NOT "All caught up", title without "· 0", only the auto-applied chip; `totalCount>0 && autoAppliedCount>0` → title count + all applicable chips.
5. **`tests/components/admin/Dashboard.test.tsx`** (extend — it already renders the summary card via `needs-attention-summary-card`): `autoAppliedCount` threaded as `renderedCount + overflowCount` (assert a fixture with `renderedCount=3, overflowCount=2` → chip "5 auto-applied", proving overflow is counted, NOT the capped rendered rows); `infra_error` data → chip absent.
   Also assert existing card render sites (`tests/components/needsAttentionSummaryCardSyncProblem.test.tsx`) still pass without the prop (compile + chip absent) — the optional-prop regression pin.

Anti-tautology: card chip expectations derive from the constructed `autoAppliedCount` prop (e.g., prop `5` → chip text "5 auto-applied"), and the Dashboard-threading expectation derives from fixture `renderedCount`/`overflowCount` (3+2 → "5 auto-applied"), never from re-reading the rendered container; heading-level assertions query by role+level (`getByRole("heading", { level: 2 })`), not by tag-name scans of a container that renders both levels.

## 7. Meta-test inventory

- **No meta-test CREATED or EXTENDED.** No new `lib/` read module (the page composes `loadNeedsAttention` + `loadRecentAutoApplied`, both already in `_metaInfraContract` and `_metaBoundedReads` registries). No new recipe/style class. No new mutation surface (`tests/log/_metaMutationSurfaceObservability.test.ts` is filesystem-walked/fails-by-default — the page is a read-only RSC and adds no mutating route/action; the 3 edited actions already carry `AUDITABLE_MUTATIONS` membership, and adding a second `revalidatePath` to an already-registered action does not change surface discovery). No advisory-lock surface (actions delegate to self-locking helpers, single-holder topology untouched — `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected).
- **Registry note:** `_metaInfraContract` and `_metaBoundedReads` are MANUALLY-enumerated registries (they iterate `infraRegistry` / `READ_MODULES` only — a NEW helper would go undiscovered). This milestone adds no new helper, so no registry drift risk here — but a future helper on this surface must add its own row (the registries are not fails-by-default for un-enumerated modules).
- Source-scanning registries that walk edited files (`page rebuild fans out` class): run full `pnpm test` before push; expected touchpoints are help-affordance and DOM-anchor scanners if any scan `app/admin/needs-attention/page.tsx` — additive-only edits should not trip them, but the full-suite gate is the arbiter.

## 8. Do-not-relitigate

- Strip placement on the shared full-list page rather than a mobile-only surface: user-ratified 2026-07-16 (this spec §1). Desktop visitors to `/admin/needs-attention` seeing the strip is intended (consistency), not scope creep.
- `totalCount` NOT including auto-applied: mirrors desktop composition (`Dashboard.tsx:754-766` strip is outside the inbox); DEFERRED FLOW4-1 asks for a disposition path, not a needs-attention recount. The `/api` count route and bell are untouched by design.
- `publishedShowIds: []` passed on the page is CORRECT, not a lazy stub: that arg feeds only `roster_shift_counts` → `rosterShiftByShow`, consumed only by the dashboard's shows-table badges (`Dashboard.tsx:476-491`); the needs-attention page has no shows table. The strip's groups come from a GLOBAL `show_change_log` read unaffected by the arg, so page/dashboard strip groups are identical. No `loadPublishedShowIds` helper is built (an earlier draft proposed one; the change-log read is not show-scoped, so it was unnecessary).
- Chip hidden under degraded auto-applied read (not an error line on the card): the card is a single `<Link>`; embedding error copy inside it is a new pattern — the strip on the linked page carries the degraded copy instead.
- `headingLevel` union `2 | 4` only (not full 1–6 flexibility): YAGNI — exactly two mount contexts exist.
- FLOW4-7 accessible-name change ("…changes" suffix dropped): follows the heading, single source of truth — the rename is the fix, not a regression.

## 9. Close-out bookkeeping (same PR)

- `DEFERRED.md`: FLOW4-1 → `[✅ RESOLVED 2026-07-16]` (strip on `/admin/needs-attention` + summary-card chip); FLOW4-7 → `[✅ RESOLVED 2026-07-16]` (`aria-labelledby`).
- `BACKLOG.md`: no edit — verified no `BL-FLOW4-*` row exists in either `BACKLOG.md` or `docs/superpowers/plans/BACKLOG.md` (the DEFERRED refs were forward-looking ids that were never filed; same finding as the destructive-confirm arc).
- Invariant-8 impeccable dual-gate (critique + audit) — UI surface touched (`app/admin/needs-attention/page.tsx`, `components/admin/*`), runs before whole-diff adversarial review.
