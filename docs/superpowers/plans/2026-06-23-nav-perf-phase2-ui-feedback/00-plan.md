# Navigation Performance — Phase 2 (instant-feedback UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Instant per-nav feedback — add `loading.tsx` skeletons to 4 feedback-less routes, convert the one full-reload internal link to `<Link>`, and parallelize the admin-entry badge reads.

**Architecture:** D = 4 `loading.tsx` files mirroring the house skeleton (`LoadingShell` + `Skeleton` from `components/layout/Skeleton.tsx`). C2 = `DashboardFooter` bare `<a>` → `next/link`. E-lite = `Promise.all` the admin layout's 2 badge reads + `needsAttentionCount`'s 2 count queries (preserving invariant 9). UI work → invariant 8 (impeccable) applies.

**Spec:** `docs/superpowers/specs/2026-06-23-nav-perf-phase2-ui-feedback.md` (Codex-reviewed; lone finding was a verified false positive from a prompt typo — spec citations confirmed correct).

## Global Constraints

- **Invariant 8 (impeccable UI gate) APPLIES:** D adds rendered skeletons, C2 changes nav DOM. `/impeccable critique` + `/impeccable audit` (external attestation) at close-out before the whole-diff review; HIGH/CRITICAL fixed or `DEFERRED.md`'d. Skeletons use ONLY `Skeleton`/`LoadingShell` primitives + design tokens (no raw colors); `motion-reduce`-safe (the primitive gates `animate-pulse`); roughly match loaded dimensions (no layout shift).
- **Invariant 9 (Supabase call-boundary) — E-lite:** `Promise.all` the query promises (they resolve), destructure `{data,error}` per result, keep typed `{kind:'ok'|'infra_error'}`, construction in `try/catch`. **NEVER `Promise.allSettled`.** `loadNeedsAttentionCount` is registered in `tests/admin/_metaInfraContract.test.ts` — keep its grep-shape.
- **No migration, no new Supabase call site** (D + C2 pure UI). **TDD per task; commit per task** (conventional commits: `perf`/`feat`/`fix`/`test`/`style`), `--no-verify` (shared hooks), AND run `pnpm exec prettier --write` on touched files before each commit (CI `quality` = `prettier --check`). Trailers on each commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_012UbLmBoAmaFbndpRpLNwdp`.
- Test runner: `pnpm exec vitest run <file>` (globals OFF; jsdom for component render via `// @vitest-environment jsdom`).

## File Structure

- `app/admin/settings/admins/loading.tsx` — new
- `app/admin/show/staged/[stagedId]/loading.tsx` — new
- `app/admin/show/[slug]/preview/[crewId]/loading.tsx` — new
- `app/help/loading.tsx` — new (scopes the whole `/help` tree)
- `components/admin/DashboardFooter.tsx` — modify (`<a>` → `<Link>`)
- `app/admin/layout.tsx` — modify (`Promise.all` the 2 badge reads)
- `lib/admin/needsAttentionCount.ts` — modify (`Promise.all` the 2 count queries)
- New test files per task.

---

### Task 1: Four `loading.tsx` skeletons (D)

**Files:** create the 4 `loading.tsx` above; test `tests/app/admin/loadingSkeletons.test.tsx` (jsdom) covering all four.

**Interfaces:** each is `export default function Loading()` returning a `LoadingShell`-wrapped skeleton; consumes `Skeleton`, `LoadingShell` from `@/components/layout/Skeleton`.

- [ ] **Step 1: Failing test** (`tests/app/admin/loadingSkeletons.test.tsx`, `// @vitest-environment jsdom`) — for each of the 4 default exports: render it; assert the `LoadingShell` `data-testid` is present (`admin-admins-loading`, `staged-review-loading`, `admin-preview-crew-loading`, `help-loading`); assert ≥3 `Skeleton` elements render (query by the skeleton's class or a `data-testid`); assert NO real page content/headings text leaks (it's a skeleton). Derive the testid list from the spec. Run → FAIL (modules not found).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the 4 files**, each mirroring its route's loaded shape with `Skeleton` primitives (heights/widths from spec §5), wrapped in `LoadingShell label="…"`:
  - `app/admin/settings/admins/loading.tsx` — `testId="admin-admins-loading"`; `<main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">` + header (`h-7 w-48`, `h-4 w-72`) + a list block (e.g. 4× `h-12 w-full` rows). (Mirror `app/admin/settings/admins/page.tsx`'s `<main>` container.)
  - `app/admin/show/staged/[stagedId]/loading.tsx` — `testId="staged-review-loading"`; `<main className="mx-auto flex max-w-2xl flex-col gap-section-gap">` + back-link skeleton (`h-4 w-24`) + 3-line header (`h-3 w-24`, `h-7 w-64`, `h-4 w-80`) + card block (`h-64 w-full`).
  - `app/admin/show/[slug]/preview/[crewId]/loading.tsx` — `testId="admin-preview-crew-loading"`; a banner strip (`h-10 w-full`) + a content envelope (header `h-7 w-56` + 2× tile `h-40 w-full`). (Loosely mirror PreviewBanner + CrewShell.)
  - `app/help/loading.tsx` — `testId="help-loading"`; mirror the `.help-prose` article: breadcrumb row (`h-4 w-40`) + prose block (`h-8 w-2/3` title, then 5× `h-4` rows of varied widths). Generic (scopes all `/help`).
  Use the exact `Skeleton`/`LoadingShell` import + the `LoadingShell testId=…` prop shape from `app/admin/loading.tsx`.
- [ ] **Step 4: Run** `tests/app/admin/loadingSkeletons.test.tsx` → PASS.
- [ ] **Step 5: prettier + commit** — `pnpm exec prettier --write` the 5 files; `perf(admin): add loading.tsx skeletons for settings-admins, staged, preview, help`.

### Task 2: `DashboardFooter` `<a>` → `<Link>` (C2)

**Files:** modify `components/admin/DashboardFooter.tsx`; test `tests/components/admin/dashboardFooterLink.test.tsx` (jsdom).

- [ ] **Step 1: Failing test** — render `DashboardFooter`; assert the "Take the tour" element is an `<a>` rendered by `next/link` (its `href="/help/tour"`), preserves `aria-label="Take the tour"`, `data-testid="help-affordance--dashboard-footer--tour"`, and the single text run "Take the tour →" (one text node — assert `textContent === "Take the tour →"`). To prove it's a `<Link>` not a bare `<a>`: assert the component imports/uses `next/link` (or mock `next/link` and assert it received `href="/help/tour"`). Run → FAIL.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `import Link from "next/link";` replace the `<a href="/help/tour" …>` (DashboardFooter.tsx:35-42) with `<Link href="/help/tour" …>` keeping the EXACT `aria-label`, `data-testid`, `className`, and child text `Take the tour →`. (Default prefetch is fine — `/help/tour` has no crew-page projection side-effect.)
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: prettier + commit** — `perf(admin): DashboardFooter "Take the tour" bare anchor → next/link (no full reload)`.

### Task 3: Parallelize badge reads (E-lite)

**Files:** modify `lib/admin/needsAttentionCount.ts`, `app/admin/layout.tsx`; tests `tests/admin/needsAttentionCount.parallel.test.ts` + `tests/app/admin/layoutBadgeParallel.test.ts`; verify `tests/admin/_metaInfraContract.test.ts`.

- [ ] **Step 1: Failing tests** —
  (a) `tests/admin/needsAttentionCount.parallel.test.ts`: a deferred mock for the two `count` reads; assert the second read is INITIATED before the first resolves (serial impl fails); assert sum on success; assert `{kind:'infra_error'}` when EITHER query returns an error OR throws (per-query discrimination preserved); assert client-construction throw → `infra_error`. Run → FAIL (currently sequential).
  (b) `tests/app/admin/layoutBadgeParallel.test.ts` (spec §7 E-lite (b)): `vi.mock` `@/lib/auth/requireAdmin` (`requireAdminIdentity` → `{email:"a@b.c"}`), `@/components/admin/nav/AdminNav` (stub), `@/lib/admin/alertCount`, `@/lib/admin/needsAttentionCount` — make `fetchUnresolvedAlertCount` + `loadNeedsAttentionCount` DEFERRED (each returns a promise whose resolver the test holds, and each pushes its name to a shared `started[]` array on call). Import the default `AdminLayout`; invoke `AdminLayout({ children: null })` WITHOUT awaiting; after a `setTimeout(0)`/`await Promise.resolve()` microtask-flush assert BOTH `started` entries are present (a serial `await a; await b` impl would have started only `fetchUnresolvedAlertCount`); then resolve both + `await` the layout call to completion. Concrete failure mode: a sequential layout starts the 2nd read only after the 1st resolves. Run → FAIL (layout is currently sequential at L85/L88).
- [ ] **Step 2: Run both, verify fail.**
- [ ] **Step 3a: Implement `needsAttentionCount.ts`** — build both query promises, `const [ing, syn] = await Promise.all([ingestionQuery, syncQuery])`, destructure `{count, error}` from each, apply the existing per-query `infra_error` checks, sum on success. Keep `createSupabaseServerClient` (or service client) construction in its `try/catch`; keep `{kind}` return. NEVER `allSettled`.
- [ ] **Step 3b: Implement `app/admin/layout.tsx`** — replace the sequential `await fetchUnresolvedAlertCount()` (L85) + `await loadNeedsAttentionCount()` (L88) with `const [alertCount, needsAttentionCount] = await Promise.all([fetchUnresolvedAlertCount(), loadNeedsAttentionCount()]);`. AdminNav props unchanged.
- [ ] **Step 4: Run** `tests/admin/needsAttentionCount.parallel.test.ts` + `tests/app/admin/layoutBadgeParallel.test.ts` + `tests/admin/_metaInfraContract.test.ts` (grep-shape + behavioral still pass) + any existing layout test → PASS.
- [ ] **Step 5: prettier + commit** — `perf(admin): parallelize admin-entry badge reads (layout + needsAttentionCount queries)`.

### Task 4: Full verification

- [ ] `pnpm exec vitest run --exclude '**/tests/admin/test-auth-gate.test.ts' --exclude '**/tests/cross-cutting/pg-cron-coverage.test.ts' --exclude '**/tests/cross-cutting/email-canonicalization.test.ts'` → green (note pre-existing env-bound failures). **Specifically confirm the help suite passes** (`tests/help/*` + any help Playwright) since `app/help/loading.tsx` scopes the whole tree.
- [ ] `pnpm exec tsc --noEmit` → clean. `pnpm format:check` → clean. eslint on changed files → clean.
- [ ] Commit any incidental fixes (`test(perf): …`).

### Task 5: Invariant-8 impeccable close-out (external attestation)

- [ ] Compute the diff (`git diff origin/main...HEAD -- app components`).
- [ ] `/impeccable critique` AND `/impeccable audit` on the diff via a FRESH subagent (v3 preflight). Focus: the 4 skeletons match the design system + roughly match loaded-content dimensions (no jarring layout shift on resolve); `DashboardFooter` link is visually identical. HIGH/CRITICAL fixed or `DEFERRED.md`'d.
- [ ] **Real-browser layout check (writing-plans additions):** a Playwright/chrome-devtools assertion that a representative new skeleton (e.g. `staged-review-loading`) renders at its route and its container occupies roughly the loaded-content region (no gross dimension mismatch) — jsdom is not sufficient. Record findings + dispositions in the PR.

### Task 6: Self-review

- [ ] Re-read spec §2/§5/§6/§7; confirm each of D (4 files)/C2/E-lite has a landed task + passing test. Grep the diff: ZERO `Promise.allSettled`; new reads destructure `{data,error}`; skeletons use only `Skeleton`/`LoadingShell` (no raw color classes); no new migration; no `next/link` added to CrewSubNav (C1 stays dropped).

### Task 7: Close-out — whole-diff cross-model review + CI + merge

- [ ] **Whole-diff Codex review** (`codex exec`, BACKGROUNDED — the launch guard requires it; arm a stall Monitor; fresh-eyes, REVIEWER ONLY), iterate to APPROVE. Triage via deferral discipline.
- [ ] Push; open PR (base `main`). Body: scope (D/C2/E-lite), descopes (C1, E-Suspense → BACKLOG/DEFERRED), impeccable findings+dispositions, "no migration".
- [ ] Watch real GitHub Actions CI to green (incl. `quality`/prettier, `unit-suite`, help suite). Reconcile if BEHIND base.
- [ ] `gh pr merge --merge`; fast-forward local `main` (`git -C <main-checkout> merge --ff-only origin/main`); verify `rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review (run after drafting)

1. **Spec coverage:** D→T1 (4 files), C2→T2, E-lite→T3, §6 meta-test→T3, §7-closeout→T5. ✓ no gaps.
2. **No placeholders:** each loading.tsx has concrete dims + testids; C2 cites the exact element; E-lite cites the exact lines.
3. **Anti-tautology:** skeleton tests assert testid + skeleton-element presence + NO real content leak; the needsAttentionCount test uses a deferred mock so a serial impl FAILS; E-lite preserves per-query error discrimination.
4. **Type/name consistency:** `LoadingShell testId`/`Skeleton className` per `app/admin/loading.tsx`; AdminNav props unchanged; `{kind:'ok'|'infra_error'}` preserved.
