# Section-header probe residual closure — width-chain completion + pixel-baseline gate

**Date:** 2026-07-26 · **Backlog:** `BL-HEADER-PROBE-RESIDUAL-VACUITY` (BACKLOG.md §"four adversarial-review findings the section-header probes do not close") · **Branch:** `test/header-probe-residual-closure`

<!-- spec-lint: not-ui — test-and-CI-only change; no component, page, or token edits, so no Dimensional Invariants / Transition Inventory apply -->

## 0. Problem

Three adversarial rounds on `feat/section-header-rebuild-phantom-spacers` produced one non-convergent vector: assertions vacuous under configurations the tests never enter. Four findings were recorded rather than fixed:

1. Real-route width chain anchors only 375/640/1280; 320 and 430 are assumed.
2. The CSS active state and simultaneous hover+focus are not swept.
3. SVG SMIL (`<animateTransform>`) moves geometry while every CSS channel reads `none`.
4. Exotic paint suppression (`clip-path` variants, partial masks, `filter` chains) is checked pattern-wise; the set is open-ended.

The backlog entry's own conclusion: finding 1 has a cheap direct fix; findings 2–4 need a **different instrument, not a fifth heuristic** — compare pixels instead of enumerating the ways pixels can go missing. This spec ships both.

## 1. Scope

- **Part A** — extend the real-route width chain to all five widths (closes finding 1).
- **Part B** — a committed pixel-baseline gate over the section-header matrix, captured only inside the pinned Playwright Docker image (subsumes findings 2–4).
- **Close-out** — rewrite the BACKLOG entry recording closure and mechanism.

No UI surface changes. No files under `app/` or `components/` are edited, so the invariant-8 impeccable dual-gate does not attach. No mutation surfaces are touched, so invariant 10 adds no registry rows.

### 1.1 Resolved scope — do not relitigate

- **Instrument choice is ratified.** A fifth property-heuristic round is rejected by the backlog entry itself (BACKLOG.md, entry body: "stop enumerating and change the mechanism"). The pixel baseline is the ratified replacement. Do not propose extending the transition sweep to the active state/SMIL/computed-clip-path instead.
- **The new CI job ships as a NON-required status context.** Promotion into branch protection's required-context list is a deliberate follow-up after observed green runs, not part of this branch (the required list is a live repo setting with twelve contexts; see `~` memory note mirrored in BACKLOG close-out text). A red run is still a visible failing check on every PR.
- **Fonts are container-resolved (DejaVu), deliberately.** Nothing loads Inter (`BL-HEADER-FONT-FALLBACK-WRAP`, BACKLOG.md). Inside one pinned image the fallback is deterministic, which is all a byte gate needs. Loading Inter is that entry's decision, not this one's; when it lands, baselines are regenerated once via the documented procedure (§3.6).
- **Existing standalone/state-sweep suites are unchanged.** The 88-case matrix, transition sweep, and pusher suites in `tests/e2e/section-header-layout.layout.spec.ts` / `pusher-alignment.layout.spec.ts` stay as they are; the baseline gate is additive. Do not fold the screenshot spec into `standalone.config.ts` — its job runs on a bare runner (`.github/workflows/standalone-e2e.yml:58-61` installs chromium on the host), which violates the byte rule below.
- **Per-cell PNGs were considered and rejected.** 15 cells × 5 widths × 2 themes = 150 idle baselines; the composite-page design (§3.3) covers the same pixels in 10. A per-cell diff is recoverable from the composite diff artifact.
- **`maxDiffPixels: 0`** (§3.4) is the ratified strictness. If CI shows nondeterminism, that is a finding to fix (or explicitly ratify a tolerance in a follow-up), never a silent threshold bump.

## 2. Part A — width chain completes to five widths

**Change:** `tests/e2e/_sectionHeaderWidths.ts:38` — `REAL_ROUTE_WIDTHS` from `[375, 640, 1280]` to `[320, 375, 430, 640, 1280]`.

**Mechanism already in place, no other edits:**

- Both real-route suites iterate the constant: `tests/e2e/admin-layout-dimensions.spec.ts:680` (`section-header width chain @ <w>: the real mount matches the harness fixture`) and `tests/e2e/admin-layout-dimensions.spec.ts:830` (`section-header §5 width chain @ <w>: every link holds within 0.5px`). Extending the constant adds four test cases (2 loops × 2 widths).
- CI step exists and matches by grep: `.github/workflows/phantom-gap-e2e.yml:182` runs `-g "width chain"` against `admin-layout-dimensions.spec.ts` under desktop-chromium. New cases are picked up with no workflow edit. Cost ≈ 2 min per width (backlog estimate), ~4 min added.
- Expected values already exist: `ROW_WIDTHS` (`tests/e2e/_sectionHeaderWidths.ts:34`) carries `320: 280` and `430: 390`, derived (viewport − 40) but never product-measured — which is precisely what the chain assertion exists to check. 320 and 430 are the sheet presentation like 375 (same code path; the modal presentation forks at 640 per the derivation comment in that file).

**Risk:** a real product breakpoint between 320–430 could make the derived values wrong — that is the finding, not a test bug. If the real mount reports a different width, the fix is a measured update to `ROW_WIDTHS` (the 1280 precedent: 561 → 744, documented in the same file's header comment), which re-aims the whole 88-case matrix — exactly the drift the chain exists to catch.

## 3. Part B — pixel-baseline gate

### 3.1 What it asserts

Committed PNG baselines of the section-header matrix; any future pixel change on those surfaces fails CI until the baselines are deliberately regenerated. This subsumes the three open findings mechanically:

| Finding | Why the baseline closes it |
| --- | --- |
| 2 — active state, hover+focus | Captures are taken in held-press and hover+focus states (§3.3). A future `active:*` geometry shift changes pressed-state pixels. |
| 3 — SMIL | An `<animateTransform>` inside the tree changes rendered pixels at capture time (Playwright's `animations: "disabled"` pauses CSS/Web-Animations, not SMIL), so the diff fires — displaced or flaking, either is loud. |
| 4 — exotic paint | Any mechanism that suppresses paint — however expressed — produces missing pixels vs baseline. No pattern list. |

### 3.2 Capture tree — reuse of the existing static harness

<!-- spec-lint: ignore — tests/e2e/section-header-visual.spec.ts is created by this spec's implementation -->
The spec (`tests/e2e/section-header-visual.spec.ts`, new) reuses the exact serving mechanism of `tests/e2e/section-header-layout.layout.spec.ts:46-119`:

- `beforeAll` shells out to `node_modules/.bin/tsx tests/e2e/_sectionHeaderCellHarness.tsx` with the same `HARNESS_ENV` (`section-header-layout.layout.spec.ts:31`) — the harness renders the REAL `step3ReviewSections` component tree to static markup outside Playwright's JSX-rewriting loader (rationale: harness header, `_sectionHeaderCellHarness.tsx:5-11`) and emits the 15 reachable matrix cells of spec §4.1a, each pre-wrapped in its `ROW_WIDTHS`-wide container per viewport.
- Real token CSS is compiled with `compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:113`) from `app/globals.css` with `@source` directives, served alongside.
- A local `createServer` bound via `server.listen(0, "127.0.0.1")` (ephemeral port) serves the pages. No dev server, no Supabase.

Cell identity is asserted before any capture (each cell carries a distinct heading, `_sectionHeaderCellHarness.tsx:14-17`), and the 15-cell count is asserted, so a harness regression fails on a DOM contract before a screenshot diff — the anti-tautology pattern of `tests/e2e/empty-state-reachability.spec.ts:47-51`.

### 3.3 Capture grid — 26 baselines

Single-source-of-truth counts: **15** cells, **5** widths (`ROW_WIDTHS` keys), **2** themes, **4** interaction states, **2** state widths, **26** = 10 + 16 baselines.

**Idle composites (10):** the spec writes one composite page per width — the 15 cell containers stacked vertically, each preceded by a plain-text label div. Theme is toggled per capture via `document.documentElement.setAttribute("data-theme", …)` (the mechanism at `section-header-layout.layout.spec.ts:1071`; pages default to `data-theme="light"`, `tests/e2e/section-header-layout.layout.spec.ts:81`). Viewport set to the width; full-page `toHaveScreenshot`. 5 widths × 2 themes.

**State captures (16):** on the `G1-clean` cell page (its header holds the corner link, the header subtree's only interactive element — `section-header-layout.layout.spec.ts:1077`; selector `[data-cell="G1-clean"] a[href]`, `tests/e2e/section-header-layout.layout.spec.ts:889`), an element screenshot of the `[data-cell="G1-clean"]` container in each of: **hover** (`link.hover()`), **focus** (focus with pointer parked away first — the hover-contamination trap at `tests/e2e/section-header-layout.layout.spec.ts:1096-1098`), **active** (`mouse.move` to link center, `mouse.down()`, capture, `mouse.up()`), **hover+focus** (focus, then hover). 4 states × 2 widths (375 sheet presentation, 1280 wide) × 2 themes.

Reduced motion is NOT forced for state captures (a transition would be mid-flight only if a duration exists on the channel — the transition sweep already bans that; the baseline additionally freezes whatever end-state paints). `animations: "disabled"` (Playwright default for `toHaveScreenshot`) settles CSS transitions for determinism.

<!-- spec-lint: ignore — tests/e2e/visual.config.ts is created by this spec's implementation -->
### 3.4 Config — new `tests/e2e/visual.config.ts`

<!-- spec-lint: ignore — section-header-visual.spec.ts is created by this spec's implementation -->
Mirrors `standalone.config.ts`'s shape (no `webServer`, chromium-only project, explicit `testMatch` allow-list naming only `section-header-visual.spec.ts` — a spec not listed runs nowhere, `standalone.config.ts:37-39`). Additions:

- `expect.toHaveScreenshot.maxDiffPixels: 0` — pinned-container rendering is deterministic; any diff is signal (§1.1).
- `snapshotPathTemplate: "{testFileDir}/{testFileName}-snapshots/{arg}{ext}"` — drops Playwright's default platform suffix. The platform is constant by construction (next bullet), and a platform-suffixed name would silently create a parallel darwin baseline set on a misconfigured local run instead of failing.
- **Container gate:** the config throws at load unless `SECTION_HEADER_VISUAL_CONTAINER=1` is set. Only the CI workflow and the documented regen one-liner set it. A bare `pnpm exec playwright test --config tests/e2e/visual.config.ts` on a dev machine fails loud with the regen instructions, instead of producing host-font bytes that look like drift. This is the structural defense the byte rule demands (AGENTS.md, "Byte-comparison CI gates must pin BOTH the Docker image AND the host architecture").

<!-- spec-lint: ignore — .github/workflows/section-header-visual.yml is created by this spec's implementation -->
### 3.5 CI — new `.github/workflows/section-header-visual.yml`

- Triggers: `pull_request` (unfiltered — the standalone-e2e precedent: path filters made coverage un-countable, `phantom-gap-e2e.yml:58-64` comment) + `workflow_dispatch` (AGENTS.md "local-passes-CI-fails" rule).
- One job, `ubuntu-latest` (amd64 native): checkout → `./.github/actions/setup` (host `pnpm install`; host linux-x64 binaries are what the container runs, the proven `screenshots-drift.yml:91-97` arrangement) → capture step:

```yaml
- name: Visual baselines in pinned Playwright image
  run: |
    docker run --rm --platform linux/amd64 --network host \
      -v "$PWD:/work" -w /work \
      -e CI=true -e SECTION_HEADER_VISUAL_CONTAINER=1 \
      mcr.microsoft.com/playwright:v1.59.1-jammy \
      bash -lc "corepack enable && pnpm exec playwright test --config tests/e2e/visual.config.ts"
```

- On failure: upload `test-results/` (holds `-actual` and `-diff` PNGs — the inspectable-diff lesson from `screenshots-drift.yml`'s drifted-captures artifact).
- Image tag `v1.59.1-jammy` matches `@playwright/test: ^1.59.1` (`package.json:98`). A structural meta-test pins workflow tag ↔ package version (AGENTS.md byte rule: "Tie the Docker image tag to the package.json dependency version via a structural meta-test") — extend or mirror the existing one guarding `screenshots-drift.yml` (implementation task locates it; if it is generic over workflows, add this workflow to its registry).

### 3.6 Baseline generation + regeneration (operator procedure, documented in the spec file header)

```sh
docker run --rm --platform linux/amd64 --network host \
  -v "$PWD:/work" -w /work \
  -e SECTION_HEADER_VISUAL_CONTAINER=1 \
  mcr.microsoft.com/playwright:v1.59.1-jammy \
  bash -lc "corepack enable && pnpm exec playwright test --config tests/e2e/visual.config.ts --update-snapshots"
```

Run on the dev machine (arm64 hosts emulate amd64 via `--platform`, the AGENTS.md-mandated arrangement); inspect the pixel diff BEFORE committing regenerated baselines (pixel-diff-pre-rebaseline discipline); commit the `tests/e2e/section-header-visual.spec.ts-snapshots/*.png` set. Cross-machine byte determinism is proven on the first PR run: baselines generated on the dev machine must compare clean on the CI runner under the same image, or the gate is unshippable as designed (then: diagnose, do not loosen §3.4).

## 4. TDD shape

- **Part A:** the extended loop IS the test; red is only expected if a 320/430 derivation is wrong (then fix per §2 Risk). Run the two chain suites locally before/after the constant edit.
- **Part B:** the gate's failing mode is proven by mutation once, during implementation: with baselines committed, apply a one-line visual mutation to the header tree (e.g. a 1px padding change on the corner link), run the spec in-container, observe the diff fail; revert. Recorded in the PR body, not committed as a test (the gate itself is the durable assertion; a committed mutation test would need a second baseline set).
- Meta-test (image-tag pin, §3.5) lands red-first if written fresh (assert tag matches package version — verify it fails when pointed at a stale tag), or as a registry row if the existing meta-test is generic.

## 5. Close-out edits

`BACKLOG.md` `BL-HEADER-PROBE-RESIDUAL-VACUITY`: replace the four "Open" items with a closure record — finding 1 closed by the five-width chain; findings 2–4 subsumed by the pixel gate; pointer to this spec and the workflow; note the non-required-context follow-up (§1.1). The "What IS covered" paragraph is updated to include the 26 baselines and the five-width chain.

## 6. Out of scope

- Loading Inter / font determinism beyond the container (`BL-HEADER-FONT-FALLBACK-WRAP`).
- Promoting the new context into branch protection (follow-up after observed green).
- Visual baselines for any surface other than the section-header matrix (pusher rows, real-route modal chrome) — extend later by the same pattern if wanted.
- The childless-growable static guard (`BL-CHILDLESS-GROWABLE-STATIC-GUARD`) — unrelated instrument.
