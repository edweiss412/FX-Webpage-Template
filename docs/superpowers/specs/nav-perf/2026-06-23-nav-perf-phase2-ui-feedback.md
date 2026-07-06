# Spec — Navigation performance, Phase 2: instant-feedback UI (loading skeletons + Link + parallel badge reads)

**Date:** 2026-06-23
**Slug:** nav-perf-phase2-ui-feedback
**Status:** Draft → self-review → Codex adversarial review → execution
**Milestone:** Navigation performance (Phase 2 of 2). Phase 1 (server data-fetch parallelization + admin auth gate) shipped in PR #85.
**Implementer/Reviewer:** Opus (Claude Code) implements (UI work — invariant 8 applies); Codex adversarial-reviews.

---

## 1. Problem & goal

After Phase 1 made the cold server render fast, the remaining nav-feel gaps are **feedback** gaps:
1. **Four user-facing routes have no `loading.tsx`** — navigating to them shows the *old page frozen* for the whole `force-dynamic` render, with zero feedback.
2. **`DashboardFooter`'s "Take the tour" is a bare `<a href="/help/tour">`** — a **full document reload** (re-downloads the doc, re-runs the `force-dynamic` `/help` layout) instead of a client soft-nav.
3. The admin layout's two badge reads run **sequentially** and block first paint on `/admin` entry.

**Goal:** instant per-nav feedback (skeletons), eliminate the one full-reload internal link, and parallelize the first-entry badge reads — all UI-surface work, invariant-8 gated.

## 2. Scope

**In scope:**
- **D — `loading.tsx` for 4 routes** (mirror the house skeleton: `LoadingShell` + `Skeleton` primitives from `components/layout/Skeleton.tsx`).
- **C2 — `components/admin/DashboardFooter.tsx`**: bare `<a href="/help/tour">` → `next/link` `<Link>`.
- **E-lite — parallelize the badge reads**: `app/admin/layout.tsx` `Promise.all([fetchUnresolvedAlertCount(), loadNeedsAttentionCount()])`; inside `lib/admin/needsAttentionCount.ts` `Promise.all` the two count queries.

**Explicitly OUT of scope (descoped 2026-06-23, user-confirmed):**
- **C1 (CrewSubNav → `<Link>`) — DROPPED.** `router.push` is already client-side soft-nav (no full reload), and the phantom-alert hazard **bars prefetch** (`tests/components/crew/noPrefetchAlert.test.tsx:61-145` deliberately enforces `router.push` + no `next/link` import + `<button>`; `SectionChipLink.tsx:18-24` documents the `upsertAdminAlert`-on-speculative-render hazard). A `<Link prefetch={false}>` conversion yields **no nav-speed benefit** (only `<a>` semantics) and would weaken that safety test. The real crew-nav perf win is the **deferred** prefetch-enablement (requires moving the projection side-effect off speculative render) — BACKLOG.
- **E full `<Suspense>` badge-streaming — DESCOPED.** `AdminNav` is `"use client"` (`AdminNav.tsx:1`) with a stateful refetch hook (`useNeedsAttentionBadge`, `AdminNav.tsx:42`), and the repo has **zero `<Suspense>` precedent** (grep: 0 hits). Streaming would need a server-child + slot bridge — invasive, for a first-`/admin`-entry-only gain (the layout is reused across sibling navs, so its awaits don't re-run per nav — established Phase 1). E-lite (parallelization) captures the clean win.

## 3. Invariants in play

- **Invariant 8 (impeccable UI quality gate) — APPLIES.** D adds new *rendered* skeleton surfaces; C2 changes nav DOM. `/impeccable critique` AND `/impeccable audit` (external attestation — fresh subagent) run on the diff at close-out; HIGH/CRITICAL fixed or `DEFERRED.md`'d before the cross-model review. Skeletons must use the existing design-system primitives + tokens and roughly match loaded-content dimensions (no layout-shift on resolve).
- **Invariant 9 (Supabase call-boundary) — E-lite only.** `needsAttentionCount`'s parallelized queries keep `{ data, error }` per query + the `{kind:'ok'|'infra_error'}` typed result; `Promise.all` the query promises (they resolve), **never `allSettled`**; client construction stays in `try/catch`. `loadNeedsAttentionCount` is registered in `tests/admin/_metaInfraContract.test.ts` (Phase 1) — the grep-shape (awaits inside try/catch, `{data,error}` destructure) must keep matching.
- **No migration; no new RPC-gated table.** PostgREST DML lockdown + validation-schema-parity N/A.

## 4. Verified factual basis (live-code citation pass, 2026-06-23, worktree off `origin/main` @ `6875b3db`)

**Skeleton primitives:** `components/layout/Skeleton.tsx` — `<Skeleton className>` (`animate-pulse motion-reduce:animate-none bg-surface-sunken rounded-md`); `<LoadingShell testId? label>` (sr-only `role="status"` announcement). Template: `app/admin/loading.tsx` (LoadingShell + header/stat-strip/two-col skeletons), `app/me/loading.tsx` (LoadingShell + `<main>` wrapper + header/sections). Testid convention: `{context}-loading` on LoadingShell.

**D — the 4 routes lacking `loading.tsx` (all `force-dynamic`):**
- `app/admin/settings/admins/` (page `force-dynamic` L21) — `<main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">` wrapping async `<AdministratorsSection>`.
- `app/admin/show/staged/[stagedId]/` (L33) — `<main data-testid="live-first-seen-staged-page" className="mx-auto flex max-w-2xl flex-col gap-section-gap">`: nav link + 3-level header (eyebrow `text-xs`, `h2 text-2xl`, `p`) + `<StagedReviewCard>`.
- `app/admin/show/[slug]/preview/[crewId]/` (L51) — fragment: `<PreviewBanner>` + `<CrewShell>` (no outer `<main>`).
- `app/help/` — `app/help/layout.tsx` (`force-dynamic` L13) renders `<main id="main" tabIndex={-1}>` + Breadcrumb + `.help-prose` wrapper around `{children}`. A `loading.tsx` here scopes the **whole `/help` tree** (`/help`, `/help/tour`, `/help/errors`, …).

**C2 — `components/admin/DashboardFooter.tsx:35-42`:** `<a href="/help/tour" aria-label="Take the tour" data-testid="help-affordance--dashboard-footer--tour" className="inline-flex w-fit min-h-tap-min items-center justify-center rounded-sm text-sm font-medium text-accent-on-bg underline underline-offset-4 transition-colors duration-fast hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">Take the tour →</a>`. Comment L31-34: the single-text-run + aria-label is for byte-stable screenshots (`<Link>` renders a single `<a>`, so the text run is preserved). Only bare internal `<a>` in the file.

**E-lite — `app/admin/layout.tsx:85,88`:** `const alertCount = await fetchUnresolvedAlertCount();` then `const needsAttentionCount = await loadNeedsAttentionCount();` (sequential; both block first paint, run on first `/admin` entry). Passed to `<AdminNav email alertCount initialBadgeCount={needsAttentionCount.kind==="ok"?…count:null} />` (L104-108). `lib/admin/needsAttentionCount.ts:19-26,33-40` — two sequential `count: 'exact', head: true` reads (`pending_ingestions`, then `pending_syncs`), summed; `{kind:'ok',count} | {kind:'infra_error'}`. Both independent → parallelizable.

## 5. Design — changes

**D · four `loading.tsx` files.** Each `export default function` returns a `LoadingShell`-wrapped skeleton mirroring its route's loaded shape, using `Skeleton` primitives + design tokens (no raw colors), `motion-reduce`-safe (the primitive already gates `animate-pulse`). Roughly match loaded dimensions to avoid layout shift.
- `app/admin/settings/admins/loading.tsx` — testId `admin-admins-loading`; `<main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">` shell + header skeleton (h-7 w-48, h-4 w-72) + a list/form block (several h-12 rows).
- `app/admin/show/staged/[stagedId]/loading.tsx` — testId `staged-review-loading`; max-w-2xl flex-col gap-section-gap: a back-link skeleton, 3-line header (h-3 w-24 eyebrow, h-7 w-64 title, h-4 w-80), then a card-shaped block (h-64).
- `app/admin/show/[slug]/preview/[crewId]/loading.tsx` — testId `admin-preview-crew-loading`; a banner-strip skeleton (h-10 full-width) + a crew-page-ish content block (header + a couple of tiles). Mirror the PreviewBanner + CrewShell envelope loosely (it's a preview).
- `app/help/loading.tsx` — testId `help-loading`; mirror the `.help-prose` article envelope: a breadcrumb-row skeleton (h-4 w-40) + a prose block (h-8 w-2/3 title, several h-4 full/again rows). Generic (scopes the whole `/help` tree).

**C2 · `DashboardFooter` `<a>` → `<Link>`.** Replace the bare `<a href="/help/tour">` with `next/link` `<Link href="/help/tour">`, preserving the EXACT `aria-label`, `data-testid`, `className`, and the single visible text run `Take the tour →`. `<Link>` renders one `<a>` so the byte-stable text-run + screenshot rationale (DashboardFooter.tsx:31-34) is preserved. Default prefetch is fine here — `/help/tour` has **no** crew-page projection side-effect (the phantom-alert hazard is crew-route-specific), so no `prefetch={false}` needed.

**E-lite · parallelize badge reads.**
- `lib/admin/needsAttentionCount.ts`: run the two `count` reads with `Promise.all([ingestionQuery, syncQuery])`, then destructure `{ data, error, count }` per result and apply the existing `infra_error` discrimination per query; sum on success. Preserve the construction `try/catch` + the `{kind:'ok'|'infra_error'}` contract (admin meta-test grep-shape).
- `app/admin/layout.tsx`: `const [alertCount, needsAttentionCount] = await Promise.all([fetchUnresolvedAlertCount(), loadNeedsAttentionCount()]);` — collapses the two badge round-trips from sequential to one wall-time on `/admin` entry. AdminNav props unchanged.

## 6. Meta-test inventory (invariant 9)

- `tests/admin/_metaInfraContract.test.ts` — `loadNeedsAttentionCount` + `fetchUnresolvedAlertCount` already registered. **Action:** parallelizing must keep their grep-shape (supabase awaits inside `try/catch`, `{data,error}` destructure) + typed `{kind}` results; no registry change (signatures unchanged). Re-run the meta-test.
- No new Supabase call sites (D + C2 are pure UI). No new RPC-gated table; no migration.

## 7. Testing strategy (TDD per task)

- **D (each `loading.tsx`):** render the default export; assert the `LoadingShell` testId + the skeleton structure (key `data-testid`s / element counts) present; assert it uses `Skeleton` primitives (no raw color classes). Concrete failure mode caught: a missing/empty skeleton, or one that renders real (non-skeleton) content.
- **C2:** `DashboardFooter` renders a `next/link` `<Link>` (an `<a>` with the href) — NOT a bare `<a>` outside Link; preserve `aria-label`, `data-testid`, single text run "Take the tour →". Concrete failure mode: regressing to a full-reload anchor or splitting the text run (screenshot drift).
- **E-lite:** (a) `needsAttentionCount` parallelization — deferred-mock both count queries; assert the second query is *initiated* before the first resolves (a serial impl fails); assert sum on success, and `infra_error` when either query errors/throws (per-query discrimination preserved). (b) layout — assert `fetchUnresolvedAlertCount` + `loadNeedsAttentionCount` run concurrently (spy/deferred). Re-run `tests/admin/_metaInfraContract.test.ts`.
- **§7-closeout (invariant 8):** `/impeccable critique` + `/impeccable audit` (external attestation, v3 preflight) on the diff — focus: the 4 skeletons match the design system + don't cause layout shift; `DashboardFooter` link unchanged visually. HIGH/CRITICAL fixed or `DEFERRED.md`'d before the cross-model review. **Real-browser layout-shift check (per writing-plans additions):** a Playwright/chrome-devtools assertion that at least one representative new skeleton renders at the route and its container occupies the same region as the loaded content (no gross dimension mismatch); jsdom is not sufficient for layout.

## 8. Risks / watchpoints (pre-load the reviewer)

- **DO NOT relitigate C1's drop:** `router.push` is already client soft-nav; prefetch is barred by the phantom-alert hazard (`noPrefetchAlert.test.tsx`); a `<Link>` conversion has no speed benefit and would weaken that safety test. Real win is the deferred prefetch-enablement. (User-confirmed descope 2026-06-23.)
- **DO NOT relitigate E's Suspense descope:** client `AdminNav` + stateful hook + no `<Suspense>` precedent → invasive for a first-entry-only gain; E-lite parallelization is the clean slice.
- **`app/help/loading.tsx` scopes the whole `/help` tree** — verify the help test suite (`tests/help/*`, the help-docs Playwright run) still passes; loading.tsx is additive (only shows during the async render), so resolved-page tests are unaffected, but confirm.
- **E-lite invariant 9:** `Promise.all` the query promises + per-result `{data,error}` discrimination; never `allSettled`; keep the construction in `try/catch` so the admin meta-test grep-shape matches.
- **C2 byte-stable text run** — `<Link>` must render a single `<a>` with the text run intact (no split) to avoid the screenshot drift DashboardFooter.tsx:31-34 guards against.

## 9. Deferred / follow-up (filed)

- **BACKLOG:** crew sub-nav prefetch-enablement (move the `CrewShell` projection / `upsertAdminAlert` side-effect off speculative render, then enable prefetch on `CrewSubNav` + `SectionChipLink`) — the *real* crew-nav perf win, deferred because it needs a side-effect refactor. (Also the post-Phase-2 caching follow-up: tag-based caching tied to sync.)
- **DEFERRED:** full `<Suspense>` badge-streaming of the admin nav (after a `<Suspense>` pattern + AdminNav slot refactor exists).

## 10. Expected outcome

Four previously-feedback-less routes show an instant skeleton on navigation; the "Take the tour" link becomes a client soft-nav (no full reload); the admin-entry badge reads collapse from sequential to one parallel wall-time. No migration, no behavior change beyond feedback + the one link's nav mode. Invariant-8 gated.
