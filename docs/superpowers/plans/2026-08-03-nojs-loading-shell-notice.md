# Plan — no-JavaScript notice in `LoadingShell`

**Spec:** `docs/superpowers/specs/2026-08-03-nojs-loading-shell-notice-design.md` (canonical; this plan never supersedes it)
**Branch:** `fix/nojs-loading-shell-notice`
**Closes:** `BL-ADMIN-NOJS-LOADING-CONFLICT`

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded

---

## Meta-test inventory (mandatory declaration)

**Creates:** `tests/styles/_metaLoadingShellContentScope.test.ts` — asserts `[data-loading-shell-content]` is styled only from the `<noscript>`-scoped rule inside `LoadingShell`: it appears in no stylesheet a JS-on browser parses, and exactly one component writes it. Filesystem-walked, so a new stylesheet or component fails by default. Closes the round-4 MEDIUM: a duplicate or global rule would hide the loading fallback on all nine routes for every visitor, and neither the component test nor the e2e observes a rule arriving from elsewhere.
**Extends:** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — one `LOCAL_ONLY_ALLOWLIST` row for the new e2e spec (reason constant `PATH_GATED`). Required, not optional: the coverage scanner treats a path-filtered workflow as not PR-blocking-capable, so without the row its filesystem-walked assertion reports the spec dark and the required Vitest suite fails.

Explicit reason: the invariant-9 Supabase call-boundary registry (`tests/auth/_metaInfraContract.test.ts`) applies to helpers that call Supabase — this change calls nothing. The invariant-10 mutation-surface registries (`tests/log/_auditableMutations.ts`, `tests/log/mutationSurface/exemptions.ts`) apply to route handlers and `"use server"` actions — `components/layout/Skeleton.tsx` is neither, and adds no new file under `app/api/` or any `"use server"` module. The advisory-lock topology test applies to `pg_advisory*` callers — none here. `tests/docs/_metaLedgerInProgress.test.ts` is *exercised* by Task 4 but not extended: the marker convention is already implemented and this branch is an ordinary consumer of it.

## Advisory-lock holder topology

**N/A.** The diff touches no `pg_advisory*` call site, no RPC, and no SQL. Verified: `rg 'pg_advisory' components/ app/show app/admin/loading.tsx` → 0 hits.

## Pre-draft code-verification pass

Run 2026-08-03 against the worktree at `81e0aa216`. Every name below was grepped, not recalled.

| Named thing | Verified |
|---|---|
| `LoadingShell` signature and body | `components/layout/Skeleton.tsx:30-44` |
| `Skeleton` primitive | `components/layout/Skeleton.tsx:15-21` |
| Nine `loading.tsx` callers | enumerated in spec §11 with per-file line anchors |
| `ADMIN_FIXTURE` export | `tests/e2e/helpers/fixtures.ts`, imported at `tests/e2e/admin-layout.spec.ts:15` |
| `signInAs` signature | `tests/e2e/helpers/signInAs.ts:43-73`; POSTs via `page.request.post` at `tests/e2e/helpers/signInAs.ts:60` |
| `desktop-chromium` `testMatch` | `playwright.config.ts:78` |
| `E2E_PORT` knob | `playwright.config.ts:8` |
| jsdom pragma convention | `tests/components/layout/PageTransition.test.tsx:1` (`// @vitest-environment jsdom`) |
| Existing tests touching `LoadingShell` | spec §7.3, all three read |
| `rounded-lg` precedent in `components/` | `components/admin/BellPanel.tsx`, `components/admin/FinalizeButton.tsx` |
| Backlog entry location | `BACKLOG.md:1261` heading, marker added directly beneath it |

## e2e harness-readiness checklist (mandatory — plan attaches Playwright)

- **(a) Server boot.** The baseline `webServer`, a `next dev -H 127.0.0.1 -p $E2E_PORT` (`playwright.config.ts:248`), reached at `http://127.0.0.1:${E2E_PORT}` (`playwright.config.ts:250`, default 3000 at `playwright.config.ts:8`). No new project and no new server: Task 3 adds the spec name to the existing `testMatch` regex.

  **`BASELINE_SERVER_ONLY=1` is mandatory for every local run of this spec, and it is not optional advice.** `playwright test` boots EVERY `webServer` entry in the config regardless of `--project`, and four of the other entries run a cold `pnpm build` first. Measured at plan time: without the flag, a single-spec run had not reached its first assertion after 25 minutes and was killed. `playwright.config.ts:406` filters the array down to the :3000 baseline when `BASELINE_SERVER_ONLY` or its older alias `CREW_E2E_ONLY` is set. CI's `admin-layout-e2e` job sets `BASELINE_SERVER_ONLY` for the same reason (`.github/workflows/admin-layout-e2e.yml:87`), so the local command and the CI job boot the same single server — though CI's takes the `process.env.CI` branch and serves a production build (`playwright.config.ts:245-247`) where local serves `next dev` (`playwright.config.ts:248`). The canonical local command is therefore:

  ```
  BASELINE_SERVER_ONLY=1 E2E_PORT=3070 pnpm exec playwright test --project=desktop-chromium tests/e2e/nojs-loading-notice.spec.ts
  ```

  **Known local blocker, measured at plan time.** With the baseline server up, `page.goto("/admin")` in this harness fails with `net::ERR_ABORTED` — **with JavaScript enabled as well as disabled**, so it is not a no-JS defect. `/` loads fine (200, redirects to `/auth/sign-in`). The most likely cause is that the local DB lacks the seeded corpus and `app_settings` rows that `admin-layout-e2e.yml:95` provisions in CI. Task 3 therefore runs `pnpm db:seed` (and, if that is insufficient, the fresh-DB prelude) before treating any `/admin` failure as a defect in the code under test. Do not redesign the spec around this symptom before seeding.
- **(b) Readiness gate.** The JS-off cases await `expect(page.getByTestId("admin-dashboard-loading")).toBeAttached()` — the fallback is in the initial HTML (spec §1.0), so no hydration gate exists or is possible; attachment of the fallback IS the readiness signal, and it is the only one available when nothing will ever hydrate. The JS-on control reads the notice count twice: once at `commit`, then again after the fallback disappears, using `toHaveCount(0)` on the loading testId as the settle edge — a positive edge, never `networkidle` and never a timeout-shaped gate. It does NOT assert the fallback attached with JS on: measured, `/admin` resolves before any assertion can poll, so that read is unobservable (spec §7.2 case 4).
- **(c) Detach safety.** No sampler, no `locator.evaluate`, no polling of a node that can unmount. The JS-off cases run against a page that never changes after first paint. The JS-on control's only locator call is a `toHaveCount(0)` assertion, which is detach-safe by construction (it polls a count, not an element handle).

---

## Tasks

Each task: failing test → minimal implementation → passing test → commit (invariant 1). Commit style `<type>(<scope>): <summary>`, scope `crew-page` is wrong here — use `ui` for the component and `test` for test-only steps.

### Task 1 — component test for the no-JS block (RED)

Create tests/components/layout/loadingShellNoJs.test.tsx (new file, path unlinked) with the fifteen assertions from spec §7.1. It must fail against unmodified `LoadingShell` (no `<noscript>` exists yet).

Pragma `// @vitest-environment jsdom` — the file renders via `react-dom/server` but needs jsdom's `DOMParser` to make structural assertions (spec §7.1). Typechecked against the repo's strict tsconfig before commit, per the paste-time rule: `noUncheckedIndexedAccess` means every `querySelector` result is `Element | null` and every regex `exec` result is nullable, so each is narrowed with an explicit non-null assertion after an `expect(...).not.toBeNull()`.

Shape:

```tsx
// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingShell } from "@/components/layout/Skeleton";

const HIDE_RULE = "[data-loading-shell-content]{display:none}";

function renderShell(): { noscriptInner: Document; outer: Document } {
  const html = renderToStaticMarkup(
    <LoadingShell testId="probe" label="Loading your dashboard…">
      <div data-testid="child" />
    </LoadingShell>,
  );
  const open = html.indexOf("<noscript>");
  const close = html.indexOf("</noscript>");
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  const inner = html.slice(open + "<noscript>".length, close);
  const rest = html.slice(0, open) + html.slice(close + "</noscript>".length);
  const parser = new DOMParser();
  return {
    noscriptInner: parser.parseFromString(inner, "text/html"),
    outer: parser.parseFromString(rest, "text/html"),
  };
}
```

Assertions, one `it` each, each named for the failure it catches:

1. `noscriptInner.querySelector('[data-testid="loading-nojs-notice"]')` is non-null **and** `outer.querySelector('[data-testid="loading-nojs-notice"]')` is null. Catches: the notice rendering outside `<noscript>`, showing the card to every visitor.
2. `noscriptInner.querySelector("style")?.textContent` equals `HIDE_RULE` exactly. Catches: typo'd selector, renamed attribute, or React hoisting the `<style>` out of the block.
3. Extract the selector with `/^(\[[^\]]+\])\{/.exec(styleText)`, then `outer.querySelector(extracted)` is non-null. Catches: style and wrapper attribute disagreeing — independently satisfiable while 2 and 4 both pass.
4. `wrapper = outer.querySelector("[data-loading-shell-content]")` is non-null; `wrapper.contains(outer.querySelector('[role="status"]'))` and `wrapper.contains(outer.querySelector('[data-testid="child"]'))` are both true. Catches: an empty wrapper rendered as a *sibling* of the status and children — the round-1 false-green. Containment, never ordering.
5. The `h1` in `noscriptInner` has `textContent` exactly `JavaScript is required`; the `p` has exactly `This page needs JavaScript to load. Turn it on, then reload.`. Catches: a benign but wrong message, which every other assertion tolerates.
6. `noscriptInner.querySelector("h1")` is non-null (assert on tag, not on class). Catches: silent regression to a styled `<p>`.
7. The notice text contains no em-dash and does not match `/[A-Z]{2,}_[A-Z0-9_]+/`. Catches: copy-convention drift, which no existing scan reaches (spec §7.0).
8. The notice's PARENT carries `mx-auto`, `max-w-2xl`, `px-4`. Catches: loss of the gutter — only three `loading.tsx` files pad below the wrapper and the mobile-primary crew route is one of them, so without this the card runs edge-to-edge at 390px there and past 1500px on wide admin.
9. The notice's `classList` contains each of `rounded-md`, `border`, `border-border`, `bg-surface`, `p-tile-pad` (membership, so order is not pinned). Catches: a classless card that keeps the copy and discards the treatment the user chose.
10. The heading's `classList` contains `text-2xl`, `font-semibold`, `text-text-strong`; the body's contains `mt-2`, `text-base`, `text-text-subtle`. Catches: token drift on the text elements — separate from 9 because fixing the card does not imply fixing these.
11. `notice.contains(h1)` and `notice.contains(bodyParagraph)`. Catches: an empty padded card beside loose copy, which assertion 5 alone accepts because it searches the whole `noscriptInner` document.
12. The serialized `outer` string contains the literal `data-loading-shell-content=""`. Catches: regression to the bare JSX attribute, which serializes to `="true"` and which the attribute *selector* in assertions 3-4 matches either way.
13. The wrapper's ENTIRE attribute set is exactly `["data-loading-shell-content"]` with value `""`. Catches: `hidden` / `class="hidden"` / `style="display:none"` on that element — each breaks the JavaScript-ENABLED path on all nine routes while assertions 1-12 and all four e2e cases stay green. Verified by mutation.
14. The wrapper's parent is the shell root, the root's parent is `<body>`, and the root's attributes are exactly `["data-testid"]`. Catches: any hiding ANCESTOR, by pinning the chain's shape rather than blacklisting mechanisms — verified against `opacity:0`, `sr-only`, and `height:0 overflow:hidden`, each of which defeated a property blacklist.
15. Both the root and the wrapper are `DIV` elements. Catches: element-type substitution — a `<dialog>` keeps every attribute assertion true while UA styling hides the fallback.

The `describe` is parameterized over both `testId` variants, so all fifteen run twice. Catches prop-keyed mutations: a class applied only when `testId` is absent hides `/me` while leaving the probe render and the `/admin` e2e byte-identical. Parameterize the BLOCK, not individual cases — per-case coverage reached two of the fifteen and the mutant escaped the other thirteen.

All fifteen come from spec §7.1; the plan does not add or reinterpret any.

Verify RED: `pnpm vitest run tests/components/layout/loadingShellNoJs.test.tsx` fails on assertion 1 (no `<noscript>` in the markup, so the `indexOf` guard trips first). Commit: `test(ui): no-JS block assertions for LoadingShell (RED)`.

### Task 2 — implement the `<noscript>` block (GREEN)

Apply spec §2 verbatim to `components/layout/Skeleton.tsx`. Update the `LoadingShell` docblock to describe the two branches and to point at spec §7.0 so nobody "fixes" the test to use `@testing-library/react`.

Verify GREEN: `pnpm vitest run tests/components/layout/loadingShellNoJs.test.tsx` passes 28/28 — fourteen `it` blocks covering the fifteen assertions (rows 14 and 15 share one block), each run for both `testId` variants.

Verify no collateral damage — the three files from spec §7.3, which passed 31/31 against a throwaway patch at spec time and must be re-confirmed against the real commit:

```
pnpm vitest run tests/components/crew/loading.test.tsx tests/app/admin/loadingSkeletons.test.tsx tests/components/layout/PageTransition.test.tsx
```

Commit: `feat(ui): tell no-JavaScript visitors the page cannot load`.

### Task 3 — real-browser e2e (RED then GREEN, order inverted)

This task's test cannot be written RED-first against an unmodified component in the usual way, because Task 2 has already landed. The equivalent discipline: write the spec, run it, and confirm each JS-off assertion fails when the `<noscript>` block is temporarily reverted (`git stash` the component, run, restore). Record that confirmation in the commit body — an e2e that has never been observed failing is not a test.

Create tests/e2e/nojs-loading-notice.spec.ts (new file, path unlinked) per spec §7.2: two `test.describe` blocks, each with its own `test.use`, never a file-scoped one.

**Three registrations, all required. Any one missing leaves the test dark or fails the suite.**

1. `playwright.config.ts:78` — add `nojs-loading-notice` to the `desktop-chromium` `testMatch` alternation. Do **not** add it to `mobile-safari`: one project is enough for a no-JS assertion, and the WebKit cookie limitation documented at `playwright.config.ts:55-64` makes the auth path there unnecessarily fragile.
2. `.github/workflows/admin-layout-e2e.yml` — name this spec file explicitly in the run step, and add `components/layout/Skeleton.tsx` + the spec to the trigger's `paths:` filter.
3. `tests/ci/_metaE2eWorkflowCoverage.test.ts` — a `LOCAL_ONLY_ALLOWLIST` row with reason constant `PATH_GATED`. Mandatory: the coverage scanner treats a path-filtered workflow as not PR-blocking-capable, so without the row the required Vitest suite fails outright.

Registration 2 is the one that is easy to skip and fatal to skip. Most Playwright workflows here pass an explicit spec-file list — 8 of the 11 that invoke `playwright test` (`crew-e2e.yml:151`, `published-modal-e2e.yml:149`, `admin-layout-e2e.yml:120`, `step3-live-bundle.yml:75` among them); the three exceptions (`standalone-e2e.yml`, `help-affordances.yml`, `dev-gate-e2e.yml`) run whole configs or projects, and `desktop-chromium` appears in none of them. A spec present only in `testMatch` therefore runs on no CI job at all — which is precisely how the predecessor test this branch is replacing sat failing on `main` unnoticed from M12.11 until it was deleted. Shipping the replacement into the same blind spot would repeat the original defect while appearing to fix it.

`admin-layout-e2e.yml` is the right host, and it is the host whose own header documents this failure class: "the spec ran in NO workflow… this gate has been dark since it was written" (`.github/workflows/admin-layout-e2e.yml:1-12`). It already runs `--project=desktop-chromium` on every `pull_request` (`.github/workflows/admin-layout-e2e.yml:29`), boots only the :3000 baseline via `BASELINE_SERVER_ONLY` (`.github/workflows/admin-layout-e2e.yml:87`), and seeds the corpus that `signInAs(ADMIN_FIXTURE)` needs (`.github/workflows/admin-layout-e2e.yml:102`). The simplest wiring appends the new spec to the existing run step's file list (`.github/workflows/admin-layout-e2e.yml:120`) rather than adding a step:

```yaml
      - name: Run admin layout e2e (desktop-chromium, :3000 only)
        run: pnpm exec playwright test --project=desktop-chromium tests/e2e/bell-panel-layout.spec.ts tests/e2e/admin-nav-layout-dimensions.spec.ts tests/e2e/nojs-loading-notice.spec.ts
```

The job's `timeout-minutes` (`.github/workflows/admin-layout-e2e.yml:62`, currently 25) is re-checked after the first real CI run and raised if the added spec pushes the job near it.

**The backlog entry's "No CI workflow runs Playwright" is stale and must not be carried forward** into the archive note — thirteen workflow files reference Playwright and eleven invoke `playwright test` (`rg -l playwright .github/workflows/`). Task 4's resolution paragraph says so explicitly, because that stale sentence is exactly the reasoning that would justify skipping registration 2.

Commit: `test(ui): real-browser proof that no-JS visitors get the notice`.

### Task 4 — archive the backlog entry

Move `BL-ADMIN-NOJS-LOADING-CONFLICT` from `BACKLOG.md` to `BACKLOG-archive.md`, stripping the `**Status:** IN PROGRESS · **Branch:** …` line as part of the move (an archived entry may not carry a flight marker — `tests/docs/_metaLedgerInProgress.test.ts`). Append a resolution paragraph recording three things: the named symptom was already obsolete at `67ce6d082`; the structural half is fixed by this branch; and the entry's claim that no CI workflow runs Playwright is stale as of this date, with the replacement e2e wired into `admin-layout-e2e.yml` so it cannot rot the way its predecessor did.

Verify: `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` and `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts`.

Commit: `docs(backlog): archive BL-ADMIN-NOJS-LOADING-CONFLICT as resolved`.

### Task 5 — invariant-8 impeccable dual-gate

`components/layout/Skeleton.tsx` is a UI surface, so both halves run before close-out, by external attestors (fresh subagents, not the implementing session), with the v3 setup gates (the skill's context-load step over PRODUCT.md + DESIGN.md, then the register reference read).

- `/impeccable critique` on the diff.
- `/impeccable audit` on the diff.

P0 and P1 findings are fixed or explicitly deferred via a `DEFERRED.md` entry. Findings and dispositions land in §12 of this plan, and the `impeccable-gate:` marker at the top is updated from `PENDING` to the real counts.

Note for the attestors: the notice is only ever visible with JavaScript disabled, so a browser-driven critique will not see it. Attestors evaluate the rendered markup from `renderToStaticMarkup` (the exact string is in spec §7.1) plus the token choices, not a live screenshot.

### Task 6 — self-review

Re-run the numeric sweep and the citation-grep across this plan; re-run `pnpm spec:lint` on both spec and plan; confirm every snippet above typechecks.

### Task 7 — adversarial review (cross-model)

Codex, to APPROVE, no round budget. Between self-review and execution handoff.

### Task 8 — whole-diff review, CI, merge

Whole-diff cross-model review to APPROVE → push → **real CI green**, not just local → `gh pr merge --merge` → fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## Layout-dimensions task

**Not applicable, per spec §5.** There is no fixed-dimension parent: `LoadingShell` renders unstyled block `<div>` elements that impose no dimension on their children. The two width-relative first children in the corpus (`app/help/loading.tsx:13`, `w-2/3`; and the `w-full` skeleton at `app/admin/show/[slug]/preview/[crewId]/loading.tsx:29`) resolve against the same containing-block width before and after the change.

Verification is folded into Task 3 rather than skipped: the JS-on control case loads `/admin` in a real browser and asserts the dashboard settles, which exercises the new wrapper on the JS-on path end to end.

## Transition-audit task

**Not applicable, per spec §6.** Two branches, no transition between them: which branch renders is fixed by the browser at parse time and cannot change without a reload. No `AnimatePresence`, no conditional remount, no compound transition.

## §12 — Impeccable findings + dispositions

Both halves run by EXTERNAL attestors (fresh subagents, not the implementing session), with the v3 setup gates completed in each. `critique` design health **25/40** (Acceptable); `audit` **18/20** (Excellent: a11y 3, perf 4, responsive 3, theming 4, anti-patterns 4, no AI tells).

| # | Gate | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | critique | **P1** | The notice inherited no page padding. Only three `loading.tsx` files put horizontal padding below `data-loading-shell-content` (`app/show/[slug]/[shareToken]/loading.tsx:38`, `app/admin/show/[slug]/preview/[crewId]/loading.tsx:33`, `app/admin/settings/admins/loading.tsx:12`); all six admin fallbacks inherit it from `app/admin/layout.tsx:191`, and `/me` and `/help` pad from a parent of `LoadingShell`. So the notice gets **no** horizontal padding on the mobile-primary crew route, and the gutter double-applies on the rest. | **Fixed** (`9475a1657`). The notice carries its own `mx-auto w-full max-w-2xl px-4 py-8 sm:px-8` gutter, pinned by component assertion 8. |
| 2 | critique | P2 | Off the house scale: `rounded-lg` is the 16px radius DESIGN.md §4 reserves for modal/dialog surfaces, and on `border-border` cards the repo runs `rounded-md` ~129 times to `rounded-lg`'s 9 (9 of 10 being popovers). `p-4` vs the 64-use `p-tile-pad`. | **Fixed** (`9475a1657`). Now `rounded-md` + `p-tile-pad`, matching `components/admin/RecentAutoAppliedStrip.tsx:676`. |
| 3 | critique | P2 | Copy named a location that does not exist on the primary persona's device: on iOS, JavaScript is under Settings → Apps → Safari → Advanced, not "your browser settings". | **Fixed** (`9475a1657`). Now "Turn it on, then reload", correct on every platform because it names none. |
| 4 | audit | P2 | Type scale one to two steps below every comparable dead-end screen — `ShowUnavailable.tsx:33-38`, `app/admin/layout.tsx:95-96` all pair `text-2xl` with `text-base`, while the notice carried the page's only instruction in the caption token. | **Fixed.** Now `text-2xl` heading + `text-base` body. Same job, same vocabulary. |
| 5 | audit | P2 | The gutter fix is guarded only by a jsdom `classList.contains` assertion; no test measures a box, and `sm:px-8`/`py-8` are unasserted. DESIGN.md §7a's own rule is that a class-presence assertion only restates the fix. | **Deferred, with the risk retired by probe.** The attestor measured the shipped geometry headless with `javaScriptEnabled:false` and found it correct (x=16 w=358 at 390px; centered x=496 w=608 at 1600px), so this is a coverage gap rather than a defect. A real-browser box assertion would need a fifth e2e case whose only subject is padding on a state no user reaches with JS on; the class assertion plus that probe is proportionate. |
| 6 | audit | P3 | The gutter double-applies on the eight parent-padded routes — all six admin fallbacks inherit from `app/admin/layout.tsx:191`, and `/me` and `/help` pad from a parent of `LoadingShell`. Measured: card 326px vs 358px at 390px, and left-aligned rather than centered on `/help` because of the `.help-prose` 70ch cap. | **Accepted.** A ~32px difference on the eight parent-padded routes, in a state that is already a dead end. Scoping the gutter per-route would need a prop threaded through all nine `loading.tsx` files to fix a cosmetic delta. |
| 7 | audit | P3 | No landmark element on the crew and admin routes (both wrap in bare divs). | **Accepted; the obvious fix is wrong.** A `<main>` inside `LoadingShell` would nest inside the `<main>` that `/me` and `/help` already provide. Correcting it belongs with those routes' chrome, not here. |
| 8 | audit | P3 | `<style>` inside a body-level `<noscript>` is non-conforming per the HTML spec, which allows it only under `<head>`. | **Accepted.** Every browser honors it, and the alternative — hoisting a global rule into `<head>` — would apply outside this component's scope, which is the property that makes the mechanism safe. |
| 9 | audit | P3 | No filesystem-walked test that a NEW `loading.tsx` wraps `LoadingShell`; one that did not would ship dark. | **Filed, not fixed.** Real and general, but it guards a convention this change consumes rather than introduces. Belongs in a structural meta-test of its own. |

No P0 at either gate. The single P1 and three of the four P2s are fixed; P2 #5 is deferred with its risk retired by probe, and the four P3s are dispositioned above.
