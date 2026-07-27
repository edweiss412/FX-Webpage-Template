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
- **Baseline production is pinned-runner-only, as POLICY enforced by the gate itself.** Initial baselines are the PR gate's own failure-artifact actuals; later regenerations go through the regen workflow (§3.6). The env gate exists to refuse ACCIDENTAL bare-host runs, not as proof of impossibility — a determined local capture is possible (R2 finding 2) and simply produces bytes the pinned-runner comparison rejects, which is the enforcement. Do not propose a sanctioned local capture path.
- **The version pin compares the INSTALLED `@playwright/test` version, exactly.** Major.minor-of-caret-literal was rejected as leaving patch skew and lockfile drift open (R1 finding 6).
- **Fonts are container-resolved (DejaVu), deliberately.** Nothing loads Inter (`BL-HEADER-FONT-FALLBACK-WRAP`, BACKLOG.md). Inside one pinned image the fallback is deterministic, which is all a byte gate needs. Loading Inter is that entry's decision, not this one's; when it lands, baselines are regenerated once via the documented procedure (§3.6).
- **Existing standalone/state-sweep suites are unchanged.** The 88-case matrix, transition sweep, and pusher suites in `tests/e2e/section-header-layout.layout.spec.ts` / `pusher-alignment.layout.spec.ts` stay as they are; the baseline gate is additive. Do not fold the screenshot spec into `standalone.config.ts` — its job runs on a bare runner (`.github/workflows/standalone-e2e.yml:58-61` installs chromium on the host), which violates the byte rule below.
- **Per-cell PNGs were considered and rejected.** 15 cells × 5 widths × 2 themes = 150 idle baselines; the composite-page design (§3.3) covers the same pixels in 10. A per-cell diff is recoverable from the composite diff artifact.
- **`maxDiffPixels: 0` AND `threshold: 0`** (§3.4) are the ratified strictness. `maxDiffPixels` alone leaves Playwright's default per-pixel YIQ `threshold: 0.2`, under which sub-threshold opacity/mask/filter/color shifts count as zero differing pixels — exactly residual finding 4's partial-transparency case. Both knobs are pinned; if CI shows nondeterminism, that is a finding to fix (or explicitly ratify a tolerance in a follow-up), never a silent threshold bump. (R1 finding 1.)

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
| 3 — SMIL | Two mechanisms, because a screenshot alone is temporally escapable (a `begin`-delayed animation, or one dwelling at baseline geometry in the compared frames, diffs nothing — R1 finding 4): (a) the spec's DOM contract asserts the harness tree contains ZERO SMIL elements (`animate, animateTransform, animateMotion, set` selector count = 0 — none exist today, `lucide-react` emits static paths), failing by default the day one is introduced and forcing deliberate handling; (b) for any future ratified SMIL, the baseline diff still catches geometry displaced at capture time. |
| 4 — exotic paint | Any mechanism that suppresses paint — however expressed — produces missing pixels vs baseline. No pattern list. |

### 3.2 Capture tree — reuse of the existing static harness

<!-- spec-lint: ignore — tests/e2e/section-header-visual.spec.ts is created by this spec's implementation -->
The spec (`tests/e2e/section-header-visual.spec.ts`, new) reuses the exact serving mechanism of `tests/e2e/section-header-layout.layout.spec.ts:46-119`:

- `beforeAll` shells out to `node_modules/.bin/tsx tests/e2e/_sectionHeaderCellHarness.tsx` with the same `HARNESS_ENV` (`section-header-layout.layout.spec.ts:31`) — the harness renders the REAL `step3ReviewSections` component tree to static markup outside Playwright's JSX-rewriting loader (rationale: harness header, `_sectionHeaderCellHarness.tsx:5-11`) and emits the 15 reachable matrix cells of spec §4.1a, each pre-wrapped in its `ROW_WIDTHS`-wide container per viewport.
- Real token CSS is compiled with `compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:113`) from `app/globals.css` with `@source` directives, served alongside.
- A local `createServer` bound via `server.listen(0, "127.0.0.1")` (ephemeral port) serves the pages. No dev server, no Supabase.

Cell identity is asserted before any capture (each cell carries a distinct heading, `_sectionHeaderCellHarness.tsx:14-17`), and the 15-cell count is asserted, so a harness regression fails on a DOM contract before a screenshot diff — the anti-tautology pattern of `tests/e2e/empty-state-reachability.spec.ts:47-51`.

### 3.3 Capture grid — 50 baselines

Single-source-of-truth counts: **15** cells, **5** widths (`ROW_WIDTHS` keys), **2** themes, **4** interaction states, **50** = 10 idle + 40 state baselines. States run at ALL five widths, not a representative pair: variants can be width-gated (the existing sweep visits all five for exactly that reason, `tests/e2e/section-header-layout.layout.spec.ts:1044-1048`), so a bounded responsive variant could regress at an uncaptured width while every captured one stays green. (R1 finding 2.)

**Idle composites (10):** the spec writes one composite page per width — the 15 cell containers stacked vertically, each preceded by a plain-text label div. Theme is toggled per capture via `document.documentElement.setAttribute("data-theme", …)` (the mechanism at `section-header-layout.layout.spec.ts:1071`; pages default to `data-theme="light"`, `tests/e2e/section-header-layout.layout.spec.ts:81`). Viewport set to the width; full-page `toHaveScreenshot`. 5 widths × 2 themes.

**State captures (40):** on the `G1-clean` cell page (its header holds the corner link, the header subtree's only interactive element — `section-header-layout.layout.spec.ts:1077`; selector `[data-cell="G1-clean"] a[href]`, `tests/e2e/section-header-layout.layout.spec.ts:889`), an element screenshot of the `[data-cell="G1-clean"]` container in each of: **hover** (`link.hover()`), **focus** (KEYBOARD-driven — pointer parked away first per the hover-contamination trap at `tests/e2e/section-header-layout.layout.spec.ts:1096-1098`, then Tab to the link, so the focus-visible heuristic engages), **active** (`mouse.move` to link center, `mouse.down()`, capture, `mouse.up()`), **hover+focus** (keyboard focus, then hover). 4 states × 5 widths × 2 themes.

<!-- spec-lint: ignore — pseudo-class selector literals in matches() calls, not file citations -->
**State-reachability oracle (R1 finding 3):** before each state capture, the spec asserts the pseudo-state actually holds on the link via `link.evaluate(el => el.matches(sel))` with the selectors `el.matches(':hover')`, `el.matches(':focus-visible:not(:hover)')` (keyboard focus with the pointer parked — the component styles the FOCUS-VISIBLE state, `components/admin/wizard/step3ReviewSections.tsx:1002`, so plain focus passing while focus-visible is false would capture idle pixels under a focus-named baseline, R2 finding 4), `el.matches(':active')` (during the held press), and `el.matches(':hover:focus-visible')` (compound) — so a capture can never silently record the idle rendering under a state-named baseline. The same configuration-vacuity class this spec exists to close applies to its own captures.

Reduced motion is NOT forced for state captures (a transition would be mid-flight only if a duration exists on the channel — the transition sweep already bans that; the baseline additionally freezes whatever end-state paints). `animations: "disabled"` (Playwright default for `toHaveScreenshot`) settles CSS transitions for determinism.

<!-- spec-lint: ignore — tests/e2e/visual.config.ts is created by this spec's implementation -->
### 3.4 Config — new `tests/e2e/visual.config.ts`

<!-- spec-lint: ignore — section-header-visual.spec.ts is created by this spec's implementation -->
Mirrors `standalone.config.ts`'s shape (no `webServer`, chromium-only project, explicit `testMatch` allow-list naming only `section-header-visual.spec.ts` — a spec not listed runs nowhere, `standalone.config.ts:37-39`). Additions:

- `expect.toHaveScreenshot: { maxDiffPixels: 0, threshold: 0 }` — pinned-container rendering is deterministic; any diff is signal, including sub-YIQ-threshold color shifts (§1.1).
- `snapshotPathTemplate: "{testFileDir}/{testFileName}-snapshots/{arg}{ext}"` — drops Playwright's default platform suffix. The platform is constant by construction (next bullet), and a platform-suffixed name would silently create a parallel darwin baseline set on a misconfigured local run instead of failing.
- **Container gate:** the config throws at load unless `SECTION_HEADER_VISUAL_CONTAINER=1` is set. Only the CI workflow and the documented regen one-liner set it. A bare `pnpm exec playwright test --config tests/e2e/visual.config.ts` on a dev machine fails loud with the regen instructions, instead of producing host-font bytes that look like drift. This is the structural defense the byte rule demands (AGENTS.md, "Byte-comparison CI gates must pin BOTH the Docker image AND the host architecture").

<!-- spec-lint: ignore — .github/workflows/section-header-visual.yml is created by this spec's implementation -->
### 3.5 CI — new `.github/workflows/section-header-visual.yml`

- Triggers: `pull_request` (unfiltered — the standalone-e2e precedent: path filters made coverage un-countable, `phantom-gap-e2e.yml:58-64` comment) + `workflow_dispatch` (AGENTS.md "local-passes-CI-fails" rule). No `--network host` (nothing on the host to reach) and the run command names the SPEC PATH literally, so `tests/ci/_metaE2eWorkflowCoverage.test.ts` counts the new spec as covered via its `SPEC_RE` extraction (`tests/ci/_workflowCoverageScan.ts:30`) — no allowlist row; the workflow avoids `needs:`/`shell:`/`working-directory:`/`defaults:` keys, which that scanner treats as unmodelled overrides.
- One job, `ubuntu-latest` (amd64 native): checkout → `./.github/actions/setup` (host `pnpm install`; host linux-x64 binaries are what the container runs, the proven `screenshots-drift.yml:91-97` arrangement) → capture step:

```yaml
- name: Visual baselines in pinned Playwright image
  run: |
    docker run --rm --platform linux/amd64 \
      -v "$PWD:/work" -w /work \
      -e CI=true -e SECTION_HEADER_VISUAL_CONTAINER=1 \
      mcr.microsoft.com/playwright:v1.59.1-jammy \
      bash -lc "corepack enable && pnpm exec playwright test --config tests/e2e/visual.config.ts tests/e2e/section-header-visual.spec.ts"
```

- On failure: upload `test-results/` (holds `-actual` and `-diff` PNGs — the inspectable-diff lesson from `screenshots-drift.yml`'s drifted-captures artifact).
- Image tag `v1.59.1-jammy` matches `@playwright/test: ^1.59.1` (`package.json:98`). Structural pin (R1 finding 6): `tests/cross-cutting/playwright-version-pin.test.ts` currently hardcodes `screenshots-drift.yml` only and compares major.minor of the package.json CARET literal. It is rewritten as a registry over every pinned-image workflow — `screenshots-drift.yml`, `screenshots-regen.yml`, plus the two files this spec creates — comparing the image tag's FULL version against the RESOLVED installed `@playwright/test` version (read as the installed package's own `version` field by requiring the package manifest of `@playwright/test` — the executed version, immune to caret-range lockfile drift), and asserting `--platform linux/amd64` on every `docker run` in each registered workflow.

**Second workflow — the regen workflow (new file under `.github/workflows/`, named `section-header-visual-regen`):** the `screenshots-regen.yml` shape minus Supabase: `workflow_dispatch`, `permissions: contents: write`, checkout `ref: ${{ github.ref_name }}`, host setup, the docker run with `--update-snapshots`, then — BEFORE committing — a second docker run WITHOUT the update flag re-comparing against the fresh bytes (same-runner determinism proof, R2 finding 5), then a bot commit of `tests/e2e/section-header-visual.spec.ts-snapshots/` (only if changed) pushed back to the dispatched branch. It is dispatch-usable only once merged to the default branch (GitHub resolves `workflow_dispatch` against main — R2 finding 1), which is fine: it is the POST-MERGE regeneration tool, never the initial producer.

### 3.6 Baseline production — initial via the gate's own failure artifact; regeneration via the regen workflow

**Initial baselines (this branch).** `workflow_dispatch` cannot run a workflow that exists only on a feature branch (GitHub resolves dispatch against the default branch — R2 finding 1), so the regen workflow cannot be the first producer. The gate workflow CAN run pre-merge (`pull_request` uses the PR branch's workflow file), and its first run — spec + config + workflow committed, zero baselines — FAILS on missing snapshots. That failing run's `test-results/` artifact contains the `-actual` PNGs rendered BY the pinned image on the native-amd64 runner: the authoritative bytes. Procedure: download the artifact, place the actuals as the committed baselines, push; the next gate run must compare clean on its own SHA. No local rendering ever occurs — the dev machine only moves bytes the pinned runner produced.

**Regeneration (post-merge lifetime).** After this branch merges, the regen workflow exists on main and is dispatched with `--ref <branch>` from any future branch that changes header pixels. After its bot commit lands, the operator MUST push a validating commit to the branch (`git commit --allow-empty` suffices): bot pushes trigger no CI, and a baseline commit whose SHA never ran the gate is untested (R2 finding 5). The regen job's own no-update re-comparison (§3.5) proves same-runner determinism; the validating push proves it runner-to-runner.

Inspect the PNGs before relying on them in either path (pixel-diff-before-rebaseline discipline; a blank or clipped capture committed as baseline would gate on nothing). If a clean-baseline comparison fails: diagnose, never loosen §3.4.

## 4. TDD shape (red first, per invariant 1 — R1 finding 7)

- **Part A:** a NEW structural assertion is the red: `REAL_ROUTE_WIDTHS` must equal the keys of `ROW_WIDTHS` (the exact invariant finding 1 wants — every matrix width is real-route-anchored). Added to the width-chain suite (or the shared fixture's own test), it FAILS against today's `[375, 640, 1280]`, then the constant extension turns it green and permanently prevents a sixth width from entering the matrix unanchored. The extended chain loops are then run as the behavioral proof.
- **Part B:** the ordered sequence is red-first by construction and UNCONDITIONAL (R2 finding 3): (1) spec + config + workflows land WITHOUT baselines and the PR opens; (2) the first gate run fails on missing snapshots — the recorded red, and simultaneously the producer (its failure artifact carries the pinned-runner actuals, §3.6); (3) committing those actuals as baselines turns the next gate run green on its own SHA; (4) sensitivity proof: a temporary harness-side visual mutation (e.g. 1px padding on the G1 fixture wrapper in `_sectionHeaderCellHarness.tsx` — harness file, no product surface) is pushed, the gate must FAIL, then the revert must restore green. Red, green, mutation-fail and revert-green run URLs all recorded in the PR body.
- **Meta-test:** the registry rewrite runs red first (registry names the two new workflows before they exist / before tags are pinned), green after.

## 5. Close-out edits

`BACKLOG.md` `BL-HEADER-PROBE-RESIDUAL-VACUITY`: replace the four "Open" items with a closure record — finding 1 closed by the five-width chain; findings 2–4 subsumed by the pixel gate; pointer to this spec and the workflow; note the non-required-context follow-up (§1.1). The "What IS covered" paragraph is updated to include the 50 baselines and the five-width chain.

## 6. Out of scope

- Loading Inter / font determinism beyond the container (`BL-HEADER-FONT-FALLBACK-WRAP`).
- Promoting the new context into branch protection (follow-up after observed green).
- Visual baselines for any surface other than the section-header matrix (pusher rows, real-route modal chrome) — extend later by the same pattern if wanted.
- The childless-growable static guard (`BL-CHILDLESS-GROWABLE-STATIC-GUARD`) — unrelated instrument.
