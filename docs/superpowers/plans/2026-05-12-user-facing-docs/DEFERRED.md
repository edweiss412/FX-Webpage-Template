# M11 user-facing-docs — DEFERRED.md

Per `feedback_deferral_discipline.md` — items here are work that **will be done** with a concrete trigger or scheduled future-phase home inside the M11 plan tree. Items that **might be done** with no scheduled home go to `docs/superpowers/plans/BACKLOG.md` instead.

---

## Phase A close-out (2026-05-19) — impeccable v3 dual-gate dispositions

### M11-A-D1: Sidebar `<details>` semantic-vs-visual divergence on desktop

**STATUS: CLOSED-FIX-NOW (2026-05-19).** Codex adversarial-review R2 (`review-mpd6twd0-foreground`) re-flagged this as a Phase A blocker, citing AC-11.3 / spec §6.1 directly: spec implies the sidebar is a *normal nav* on desktop and *collapses to a disclosure* only under 768 px — not a `<details>` widget visually forced-open via CSS. Per `feedback_iterate_until_convergence.md`, adversarial-review spec-cited verdict overrides orchestrator deferral judgment. Disposition moved from DEFERRED-to-Phase-B → FIX-NOW inside Phase A scope. Fix mechanism: replace `<details>`-with-`md:hidden`-summary with a `useState`-driven `<button aria-expanded={open} aria-controls="help-nav">` + plain `<nav>` (no disclosure widget on desktop; button-controlled disclosure on mobile). Original entry preserved below for the convergence record.

---

- **Severity:** MEDIUM (impeccable critique + audit both surfaced; consolidated single root cause)
- **File:line:** `app/help/_components/Sidebar.tsx:25-34` (the single-`<details>` chrome that achieves "mobile-collapse + desktop-always-visible" via `<summary className="md:hidden">` + inner `<div className="hidden group-open:block md:block">`)
- **Symptom:** On desktop, the `<details>` element remains in its default `closed` state in the DOM (only CSS `md:block` makes the inner list visible). Screen readers (VoiceOver, NVDA) may announce the parent disclosure as collapsed even though the list is visually rendered.
- **Why deferred (concrete trigger):** Phase B (catalog extension) is scheduled to start after Phase A close-out per ROUTING.md. The fix requires a `"use client"` `useMediaQuery` hook returning conditional render `<div>` (md+) vs `<details>` (mobile), OR a client effect that sets `open={true}` on md+ — both are non-trivial refactors that exceed the small-mechanical-fix threshold (~30 LOC + new client-hook pattern) and would themselves re-trigger §1.8 attestation. Phase B touches `lib/messages/catalog.ts` but doesn't touch `app/help/_components/`, so this won't be incidentally repaired in B's scope. Re-evaluate at Phase D close-out (D wires `mdx-components.tsx` + introduces Callout/Step/Screenshot — likely also touches Sidebar for in-page nav structure). If D doesn't pick it up, defer to Phase I close-out's `/impeccable harden` pass.
- **Why not BACKLOG.md:** Phase B (and Phase D, Phase I) are real planned phases with task counts. The trigger is concrete (next Phase A surface touch). Not speculative.
- **Spec status:** Spec §6.1 prescribes "sidebar collapsed into a top-of-page disclosure" under 768 px; no desktop ARIA-semantics constraint. Current implementation does NOT violate spec.
- **Impact at v1:** Low. Doug is the sole admin and is a sighted user; the nav list IS visible on desktop. AT mismatch is real but edge-case for the actual reader population.
- **Re-open trigger:** any Phase B/D/I task that edits `app/help/_components/Sidebar.tsx` OR if FXAV crew uses AT and reports the issue.

### M11-A-D3: No-raw-codes audit excludes MDX (routes to X.2)

- **Severity:** MEDIUM (Codex adversarial-review R1, 2026-05-19, `review-mpd6425l-l613hp`)
- **File:line:** `tests/cross-cutting/no-raw-codes-audit.ts:92-95` AND the `discoverStaticAppRoutePaths()` helper near it.
- **Symptom:** The source audit's default file set keeps only `.tsx`; M11 introduces most help routes as `page.mdx`. The runtime route discovery crawls only `page.tsx`. A raw catalog code added to a help MDX page would pass both the AST audit and the runtime crawl, undercutting M5-D8 / X.2-spec discipline.
- **Why deferred (concrete trigger + cross-plan routing):** `tests/cross-cutting/no-raw-codes-audit.ts` is owned by X.2 (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/X2-no-raw-codes.md`), running in a parallel single-implementer Codex session. M11 Phase A's user-prompt scope explicitly excluded X.2 work ("DO NOT: Run X.2 work in this session. parallel session does X.2."). The Codex review correctly identified that M11's MDX surface creates a coverage gap for X.2's audit — but the fix belongs to X.2, not M11 Phase A. Route via this DEFERRED entry; X.2's session owner picks it up.
- **Why not BACKLOG.md:** X.2 is a real, scheduled, in-flight cross-cutting milestone (the X.2 handoff file `X2-no-raw-codes.md` was seeded at commit `961ac69` on 2026-05-19). The trigger is concrete: include this finding in X.2's next-round adversarial review fix set.
- **Spec status:** M5-D8 + X.2 spec invariant — no raw error codes in user-visible UI. MDX-route coverage gap means M11's `/help/errors/page.tsx` + future Phase E content is currently uncovered.
- **Concrete fix path (for X.2):** (a) Include `.mdx` in the source audit's default file set OR add an MDX-specific parser pass; (b) update `discoverStaticAppRoutePaths()` to include `page.mdx`; (c) add a failing MDX fixture containing a raw code to prove the guard catches it.
- **Impact at v1:** Low — Phase A ships only stub MDX pages (single `<h1>` each); the catalog-code attack surface won't appear until Phase E.5/E.6/E.7 content lands (which goes through Phase E's TDD + impeccable + adversarial review cycle, where Codex would re-flag).
- **Re-open trigger:** X.2 next-round adversarial review fix set OR before Phase E.5 starts, whichever comes first.
- **Cross-reference:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/X2-no-raw-codes.md` — the X.2 implementer should add this finding to its scope.

### M11-A-D4: `tests/admin/test-auth-gate.test.ts` Layer 2 DB-residue flake

**STATUS: RESOLVED 2026-05-19 at SHA `e911078`.** Deeper root-cause investigation (`agentId a0a16c195da111dcf`) found the actual cause: `vi.mock("@supabase/supabase-js")` at the test file's top-level GLOBALLY stubs the Supabase module for Layer 1's unit assertions; Layer 2's pre-clean imports `admin` from `tests/e2e/helpers/supabaseAdmin.ts` whose `createClient` is the STUBBED version. So `admin.auth.admin.listUsers` returns `[]` — pagination through empty data never finds the fixture user — and the live dev-build server (separate Node process, real Supabase) returns 410 because the residue is still in `auth.users`. **Fix**: `beforeAll` block uses `vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js")` to build a `realAdmin` client bypassing the file's `vi.mock`; Layer 2's two pre-clean loops use `realAdmin` instead of `admin`. Layer 1's mocked assertions unchanged. Companion patch at `4add98d` (paginate-until-exhausted in both the test file AND `tests/e2e/helpers/signInAs.ts`) was retained — the e2e helper IS used by Playwright (separate process, real Supabase, real pagination matters there). Full `pnpm test` verified clean: 3455/3460 passed / 0 failed. Original entry preserved below for the convergence record.

---


- **Severity:** MEDIUM (project-level test infrastructure; surfaces ~50% of runs at HEAD `aa7b249`)
- **File:line:** `tests/admin/test-auth-gate.test.ts:486-540` (Layer 2 HTTP positive-path tests for `/api/test-auth/set-session`)
- **Symptom:** Both Layer-2 tests POST `{ email, isAdmin }` to `/api/test-auth/set-session` after `admin.auth.admin.deleteUser` pre-clean. The endpoint responds 410 Gone instead of 200 — the server's create-only check finds the user already exists. The pre-clean removes the `auth.users` row but does NOT sweep paired tables (likely `admin_emails` and/or `crew_member_auth`) that the create-only check consults.
- **Why deferred (NOT Phase A's surface):** Phase A's diff at `0274a63..aa7b249` touches only `app/help/`, `mdx-components.tsx`, `next.config.ts`, `package.json` (deps), and `tests/help/`. Zero changes to `app/api/test-auth/`, `admin_emails`, `crew_member_auth`, or `tests/admin/test-auth-gate.test.ts`. The flake exists in this same shape at the Phase A base SHA `2090dc2` (observed in pre-flight run #1). What changed: Phase A added 53 new test files under `tests/help/`, shifting vitest's `fileParallelism: false` sequential file order; the flake now surfaces more consistently because the DB state from earlier test files (X.1 catalog-parity adds, M10 onboarding adds) is different at the time `test-auth-gate.test.ts` runs.
- **Concrete fix path (NOT Phase A scope):** Project-infra session — extend `test-auth-gate.test.ts:486-540`'s pre-clean to also DELETE matching rows from `admin_emails` and `crew_member_auth` (and any other table the `/api/test-auth/set-session` create-only check reads) before the POST.
- **Why not BACKLOG.md:** The flake is real test-isolation work that needs to be done; not speculative. The home is a project-infra cleanup session, not M11's plan tree.
- **Re-open trigger:** any future M11 phase whose new tests cause the flake to surface in ≥80% of CI runs, OR a project-infra cleanup session.

### M11-A-D5: `tests/e2e/empty-state-reachability.spec.ts` tile-grid 1% pixel jitter

**STATUS: RESOLVED 2026-05-19 at SHA `6afc409`.** Root cause (per investigator `agentId ad693cc653e4e6654`): within-tile-grid 1% diff was sub-pixel layout/font jitter on Next.js dev-build first-paint after concurrent prior-spec navigations warmed/perturbed the webpack module cache; the screenshot fired before fonts/layout fully settled. **Fix**: 3-line hydration + fonts barrier inserted before each of the two failing `toHaveScreenshot` calls (lines 163 + 179 of `empty-state-reachability.spec.ts`): `page.waitForLoadState("networkidle")` + an `expect(getByTestId("right-now-card")).toHaveAttribute("data-prefers-reduced-motion", /^(true|false)$/)` post-hydration wait + `page.evaluate(() => document.fonts.ready)`. Full `pnpm test:e2e --project=mobile-safari` verified clean: 85/236 passed / 151 skipped / 0 failed. The `data-prefers-reduced-motion` barrier proved sufficient under webkit in spite of the investigator's flag that it might not work in mobile-safari — the `networkidle` + `fonts.ready` portion was the load-bearing wait. Original entry preserved below for the convergence record.

---


- **Severity:** LOW / P3 (Playwright sub-pixel flake; cleared by isolated re-run at the same SHA)
- **File:line:** `tests/e2e/empty-state-reachability.spec.ts:163,179` (categories 2 + 3 of the M3 §8.3 empty-state reachability suite)
- **Symptom:** First full-suite e2e mobile-safari run reports a 1481-pixel diff (ratio 0.01) on the `tile-grid` screenshot. Isolated re-run of just `empty-state-reachability.spec.ts` against the same SHA passes 4/4 cleanly. Variance is sub-pixel antialiasing / font rendering / system-load timing.
- **Why deferred (NOT Phase A's surface):** Phase A does not touch `components/show/`, `components/atoms/`, or `app/show/[slug]/`. The M3 LodgingTile + tile-grid render path is owned by the M3/M4 plan tree. WebServer logs surface an incidental hydration drift on `<RightNowCard data-prefers-reduced-motion>` ("unknown" → "false"), but RightNowCard is outside the screenshotted `tile-grid` element.
- **Concrete fix path (NOT Phase A scope):** Project-infra session — either (a) raise `maxDiffPixels` tolerance on the four `empty-state-reachability.spec.ts` snapshots to allow ~0.02 ratio, (b) refresh the snapshots if a stable post-fonts rendering can be captured, or (c) investigate the RightNowCard hydration drift root-cause and pin its post-hydration state before the screenshot fires.
- **Why not BACKLOG.md:** Real e2e infrastructure work needed before this surface ships to production CI gates; not speculative.
- **Re-open trigger:** any commit that touches `components/show/`, `components/atoms/`, or related M3/M4 surfaces; OR project-infra cleanup session.

### M11-A-D2: No skip-link to main content from `/help` chrome

- **Severity:** P3 polish (impeccable audit)
- **File:line:** `app/help/layout.tsx:46-57` (the chrome composition wrapper)
- **Symptom:** Keyboard users must tab through Header (brand + ThemeToggle + "Back to admin") + Sidebar (12+ nav entries) before reaching main content on every `/help/*` page. WCAG 2.4.1 polish.
- **Why deferred (concrete trigger):** Phase I close-out's `/impeccable harden` pass is the canonical home for WCAG polish that isn't a P0/P1. The fix is a visually-hidden `<a href="#main">Skip to content</a>` as first child of the layout wrapper + `id="main"` on `<main>` — 2-line addition, but it touches `app/help/layout.tsx` which is also where the AdminInfraError catch arm lives, so the fix should land in a focused milestone rather than as a one-off Phase A close-out tail commit.
- **Why not BACKLOG.md:** Phase I (close-out) is a real planned phase with the `/impeccable harden` task category called out in ROUTING.md.
- **Spec status:** No spec citation on skip-links; WCAG 2.4.1 best-practice.
- **Impact at v1:** Low. 13-page docs surface; Doug is the sole keyboard user.
- **Re-open trigger:** Phase I `/impeccable harden` pass kicks off.
