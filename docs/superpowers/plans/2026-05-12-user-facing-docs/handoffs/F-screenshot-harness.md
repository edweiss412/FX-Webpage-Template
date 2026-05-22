# Handoff — M11 Phase F: Screenshot harness (Tasks F.1–F.11)

**Status:** CLOSED 2026-05-22 at SHA `15b7dbe`. CI drift gate verified green at GitHub Actions run [`26296036685`](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26296036685).

**Handed off:** 2026-05-21 by Eric Weiss (orchestrator session "Orchestrator — M11").
**Implementer:** GPT-5.5 / Codex CLI via `codex exec` (per ROUTING.md row "F — Screenshot harness" — "Pure tooling: Playwright scripts, image encoder, CI gate, test infrastructure. No UI authoring — the harness CAPTURES UI but doesn't WRITE UI."). Mechanical MDX swap in F.10 explicitly classified as Codex tooling per ROUTING.md rationale; verifiable via per-page tests + meta-screenshot-asset-existence test.
**Adversarial reviewer:** Opus 4.7 / Claude Code via `/codex:adversarial-review --scope branch` (cross-CLI per ROUTING.md reviewer-pairing logic; base is Phase E close-out commit `ba2ae36`).
**Plan file:** `docs/superpowers/plans/2026-05-12-user-facing-docs/06-screenshot-harness.md` (Tasks F.1–F.11).

> Phase F is **single-implementer Codex**. No §A/§B split. All eleven tasks (F.1 → F.11) ship in one continuous TDD-disciplined sequence inside one Codex session.
> Phase F is **heavy-live-integration**. Per memory `feedback_heavy_audit_milestones_budget_two_rounds.md` + actual outcome: 4 local adversarial-review rounds + 5 additional CI-only iterations after the first real GitHub Actions run. Local-APPROVE was necessary but not sufficient.
> Phase F's structural defenses pin **execution-environment determinism** (Docker image, host architecture, pnpm version, env-var availability) as load-bearing for the drift gate's correctness.

---

## §1 Session metadata

- **Session date(s):** 2026-05-21 (F.1 start) → 2026-05-22 (close-out + CI green).
- **Implementer:** Codex CLI (single session for tasks F.1–F.11 + adversarial review fix rounds + CI close-out iterations).
- **Reviewer:** Opus / Claude Code (cross-CLI) via `/codex:adversarial-review --scope branch` for the 4-round local adversarial loop.
- **Base branch:** `main` at commit `ba2ae36` (Phase E close-out).
- **Plan version:** `docs/superpowers/plans/2026-05-12-user-facing-docs/` r1. Plan body `06-screenshot-harness.md` is r2-converged (r1 → r2 swept setup-project pattern fix, port 3004 NOT 3003, help-docs `testMatch` coverage).
- **Spec version:** `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` r14+r15. Phase F consumes §3.6 (screenshot harness contract: §3.6.1 manifest, §3.6.2 capture preconditions, §3.6.3 drift gate), AC-11.34 (fixture-range validation), AC-11.15–AC-11.22, AC-11.25–AC-11.30 (Phase F sub-targets per the plan's AC mapping).

---

## §2 Phase progress

- [x] **Phase F — Screenshot harness** (`06-screenshot-harness.md`) — **CLOSED 2026-05-22 at SHA `15b7dbe`**.
  - [x] Task F.1 — Manifest definition (`scripts/help-screenshots.manifest.ts` + `tests/help/manifest-shape.test.ts`) — SHA `8c08801`
  - [x] Task F.2 — Fixture-range parser (`scripts/help-screenshots-fixture-range.ts` + test #14) — SHA `a9139f1`
  - [x] Task F.3 — Capture script (`scripts/help-screenshots.ts` + `sharp@^0.34` dep + tests) — SHA `7d2c28a`
  - [x] Task F.4 — `screenshots-help` + `help-docs` Playwright projects + setup-project pattern (real-test, not default-export) + port 3004 — SHA `afb19f0`
  - [x] Task F.5 — `screenshot:help` package script + drift workflow + capture spec — SHA `5ef4664`
  - [x] Task F.6 — `<Screenshot>` picture-contract meta-test (verifies dark `<source>` per manifest entry) — SHA `4af0441`
  - [x] Task F.7 — `_metaScreenshotManifest` meta-test (fixture existence + App-Router route resolution + gated WebP existence + orphan WebP detection) — SHA `e90cb82`
  - [x] Task F.8 — Screenshot-coverage test Half A (manifest reachability via name prop; plan-defect resolution moved non-empty assertion to Half B) — SHA `7cc2c02`
  - [x] Task F.9 — E2E clock-pipeline proof test (test #18); discovered + fixed manifest preview-route slug + crew ID deterministic alignment — SHA `bbae36b`
  - [x] Task F.10 — MDX placeholder swap (3 pages, 6 total references; manifest grew from 4 seed entries → 6 to align with Phase E content); 12 WebPs landed; 6 M11-E-D5 stopgaps un-skipped — SHA `3e46f1a`
  - [x] Task F.11 — Coverage Half B (on-disk WebP existence + non-empty walk); preview-banner selector tightened to `[data-testid=admin-preview-banner]` for capture determinism; checksum-stable recapture — SHA `3f18708`
  - [x] Phase-level adversarial review (Opus / Claude Code) — 4 rounds against base `ba2ae36`. R1 (2 HIGH) → R4 APPROVE @ 82% confidence. See §8 + §9.
  - [x] LOW residual #1 — `tests/cross-cutting/playwright-version-pin.test.ts` (ties `@playwright/test` version in `package.json` to Docker tag in workflow YAML) — SHA `96279f3`
  - [x] LOW residual #2 — light/dark byte-distinct assertion extension in `_metaScreenshotManifest.test.ts` — SHA `301b00e`
  - [x] LOW residual #3 — DEFERRED as M11-F-D1 (post-navigation animation suppression; empirical 5x checksum determinism + capture-surface audit ruled it not load-bearing at current manifest scope) — SHA `c79c47d`
  - [x] Phase F close-out gate #6 (real-CI drift workflow green) — see §8.2 for the 8-iteration class.

**Cross-cutting infra commits (Phase F-adjacent, in scope for handoff):**
- `c0ac819` — `fix(admin): suppress react-hooks/set-state-in-effect on M9.5 settle effect`. Surfaced by F.9 close-out's `pnpm lint` step. M9.5's `RevokeAllLinksButton` state-machine settle effect was deliberately introduced (impeccable audit M-2 + M-3) but tripped the React 19 / Next 16 lint rule. Targeted suppression with rationale comment; behavior unchanged.
- `78d6771` — `ci(screenshots): enable workflow_dispatch on screenshots-drift`. Drift workflow was PR-only + cron-only; adds manual-trigger capability so close-out gate #6 can be verified without waiting for the next 10:00 UTC cron firing. Operationally useful long-term.

Other phases: A done at `e911078`; B done at `cd14865`; C done at `6c7e6de`; D done at `08d6546`; E done at `ba2ae36`. G–I tracked in their own per-phase handoffs.

---

## §3 Spec sections in scope (Phase F only)

- **§3.6** — Screenshot harness contract end-to-end. §3.6.1 manifest schema (consumed by F.1); §3.6.2 twelve reproducibility preconditions (enforced by F.3 capture script); §3.6.3 CI drift gate (F.5 workflow + the actual close-out gate #6 verification).
- **AC-11.34** — Fixture-range validation; every manifest entry's `frozenClockInstant` must fall inside the parsed `[SET earliest .. STRIKE latest]` range from the fixture's INFO tab DATES rows. Implemented as fail-fast pre-launch check in F.3's `captureAll()`.
- **AC-11.15–AC-11.22** — Manifest + capture + drift gate + meta-test acceptance criteria.
- **AC-11.25–AC-11.30** — Cross-cutting test-coverage criteria for the harness layer.

Out of scope for Phase F (deferred to later phases):
- Affordance retrofit + `Learn more →` link wiring in `/admin/*` components (Phase G).
- Auth-integration Playwright tests (Phase H).
- Phase-level impeccable v3 dual-gate over the full M11 surface (Phase I).
- The Phase E-shipped MDX content is consumed read-only by F.10's placeholder swap; any content-level concerns surfaced go to E.* DEFERRED entries, not Phase F.

---

## §4 Acceptance criteria

| AC | Phase F target | Notes |
| --- | --- | --- |
| AC-11.15 | PASS | Manifest exists at `scripts/help-screenshots.manifest.ts` with non-empty entries, all required fields, unique keys, valid ISO `frozenClockInstant` (F.1 + meta-test). |
| AC-11.16 | PASS | Fixture-range parser correctly extracts SET/STRIKE bounds from INFO-tab DATES section (NOT whole INFO body — narrows to avoid hotel/transport-date false-expansion per F.2 implementation note). |
| AC-11.17 | PASS | Capture script enforces all 12 §3.6.2 preconditions (clock, theme, animation, realtime, auth, browser launch args, quiescence, encode, write); F.3 + runtime smoke verified at F.5 (`pnpm screenshot:help` end-to-end). |
| AC-11.18 | PASS | `screenshots-help` Playwright project isolated in `playwright.screenshots.config.ts` (R3 architectural separation); setup-project pattern is a real test file (`tests/e2e/screenshots-help-setup.ts`), NOT a default-export `globalSetup` function (r2 plan fix). Port 3004 NOT 3003 (r2 plan fix). |
| AC-11.19 | PASS | `screenshot:help` package script wired; drift workflow `.github/workflows/screenshots-drift.yml` runs capture in pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` Docker image. |
| AC-11.20 | PASS | CI drift gate catches BOTH tracked diffs AND untracked WebPs (R3 hardening). |
| AC-11.21 | PASS | All structural meta-tests (#8 coverage Half A + Half B, #9 picture contract, #10 manifest meta-test, #14 fixture-range parser, #18 E2E clock-pipeline) green. |
| AC-11.22 | PASS | Real WebPs committed at `public/help/screenshots/*.webp` for all 6 manifest keys × 2 themes = 12 files. preview-as-crew-banner-dark.webp regenerated from native-x64 CI run after Phase F R5 finding (cross-architecture drift). |
| AC-11.34 | PASS | Fixture-range validation runs pre-launch in `captureAll()`; out-of-range entries throw with clear error. |

ACs NOT addressed by Phase F: AC-11.1–AC-11.14 (A/B/C/D/E), AC-11.23–AC-11.24 (A), AC-11.31–AC-11.33 (G), AC-11.35–AC-11.39 (G/H/I).

---

## §5 Plan-wide invariants — applicability to Phase F

| # | Invariant | Phase F applicability |
| --- | --- | --- |
| 1 | TDD per task | PASS — Every task: failing test → minimal implementation → passing test → commit. Verify-red technique applied to every structural meta-test (F.6 dark-source media query mutation; F.7 route-resolution path mutation; F.8 empty-name `<Screenshot>` injection; F.9 X-Screenshot-Frozen-Now header disablement; F.11 dashboard-overview-light.webp deletion). |
| 2 | Per-show advisory lock | N/A — Phase F surface doesn't mutate `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions`. The setup-project seeds via existing `pnpm db:seed` (which holds locks per spec); Phase F adds no new lock sites. |
| 3 | Email canonicalization | N/A — Phase F surface doesn't touch raw emails. |
| 4 | No global sync cursor | N/A — Phase F doesn't reference `lastPollAt`. |
| 5 | No raw error codes in UI | N/A — Phase F is tooling, not UI. F.10's MDX swap is mechanical text substitution, not new copy. |
| 6 | Commit per task | PASS — One conventional-commits commit per task; `feat(screenshots):` for new code, `test(screenshots):` for test-only additions, `fix(screenshots):` for review-driven fixes. Class-sweep enforcement applied (R3 → R3-follow-up was a separate commit because the baseline regeneration needed its own atomic unit). |
| 7 | Spec is canonical | PASS — Plan-body contradictions resolved by reading spec §3.6.2 verbatim (e.g., F.8 plan-defect: non-empty assertion split between Half A / Half B was resolved by deferring the assertion to F.11 commit where on-disk WebPs exist, since spec §3.6.2 doesn't pin which half owns it). |
| 8 | UI quality gate | N/A — Phase F is not UI. Plan ROUTING.md explicit: "the harness CAPTURES UI but doesn't WRITE UI." F.10's MDX swap is mechanical and verified via per-page tests + meta-screenshot-asset-existence, not via impeccable dual-gate. |
| 9 | Supabase call-boundary discipline | PARTIAL — Phase F adds no new Supabase call helpers; setup-project's seed path uses existing `pnpm db:seed` helper. The CI close-out class (§8.2) surfaced an env-var-availability gap (`createSupabaseServiceRoleClient` lacked production keys in CI), but the helper boundary itself was unchanged. |

---

## §6 Watchpoints (class-vectors carried forward)

These are bug-class vectors Phase F surfaced or extended; consult before drafting Phase G/H/I tasks that touch the same surfaces.

1. **Execution-environment divergence is its own bug class.** Local-passes + Docker-on-dev-passes + adversarial-review-APPROVE is NECESSARY but NOT SUFFICIENT for CI-bound surfaces. Phase F's first real CI run revealed 4 distinct environment gaps (Jekyll/Pages, pnpm 11+ syntax, Supabase env keys, x64 vs arm64 host architecture) that local verification couldn't catch. See memory `feedback_byte_comparison_ci_gates_pin_capture_environment.md` (created during Phase F; extended after the x64-baseline finding) + `feedback_mocked_only_tests_invite_tautological_approve.md` (the parent class).

2. **Pin host architecture, not just Docker image.** Apple Silicon / arm64 dev hosts produce different image bytes from native-x64 CI runners even with an identical pinned Docker image tag (Rosetta emulation or arm64-native rendering paths diverge from native x86_64). Future byte-comparison gates MUST regenerate baselines on the CI runner's architecture, never on dev local. `--platform linux/amd64` is the canonical flag for arm64 hosts targeting x64 CI.

3. **pnpm 11+ deprecated all legacy build-script gates.** `onlyBuiltDependencies`, `ignoredBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`, and `ignoreDepScripts` are all replaced by the single `allowBuilds:` map in `pnpm-workspace.yaml`. Any future milestone adding a new dependency with a lifecycle build script (sharp-like native binary) must extend the `allowBuilds:` map; failing to do so produces `ERR_PNPM_IGNORED_BUILDS` in CI where corepack uses the new pnpm.

4. **WebServer env propagation chain.** `playwright.screenshots.config.ts` webServer env block must supply EVERY env var the production Next.js bundle reads at request time. Phase F's gap was both `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` AND `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. Local-passing-CI-failing pattern: local `.env.local` fills the gap; CI doesn't have `.env.local`. The `process.env.X ?? "<local-default>"` pattern is the load-bearing portability defense.

5. **Manifest-vs-content alignment.** F.10 grew the manifest from 4 seed entries to 6 because Phase E authored against semantic key names (`dashboard-overview`, `review-queues-empty-state`) that didn't exactly match F.1's seed (`dashboard-active-shows`, `dashboard-pending-ingestion`). Resolution: align manifest to content, not vice versa. Phase G/H may surface similar alignment gaps as they reference manifest keys from new affordance contexts.

6. **Plan-body internal contradictions.** F.8's "non-empty assertion" was listed in BOTH Half A AND Half B of the same task body. Detect-and-document-as-deviation pattern was applied (Codex's commit message explicitly cited the contradiction); reviewer's response was clean. Future plan-bodies should be self-consistency-swept before adversarial review fires.

---

## §7 Test commands

```bash
# Phase F structural meta-tests (fast, no browser/Docker)
pnpm test tests/help/manifest-shape.test.ts \
          tests/help/fixture-range-parser.test.ts \
          tests/help/_metaScreenshotManifest.test.ts \
          tests/help/screenshot-coverage.test.ts \
          tests/help/screenshot-picture-contract.test.ts \
          tests/help/playwright-config.test.ts \
          tests/help/capture-script.test.ts \
          tests/help/screenshot-help-command.test.ts \
          tests/cross-cutting/playwright-version-pin.test.ts < /dev/null

# Capture pipeline end-to-end (requires local supabase + Playwright)
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture \
  pnpm screenshot:help < /dev/null

# Pinned-image capture (CI parity; arm64 hosts must add --platform linux/amd64)
docker run --rm --network host \
  --platform linux/amd64 \
  -v "$PWD:/work" -w /work -e CI=true \
  mcr.microsoft.com/playwright:v1.59.1-jammy \
  bash -lc "apt-get update && apt-get install -y postgresql-client && corepack enable && pnpm screenshot:help"

# Full suite (close-out gate)
pnpm test < /dev/null        # expect 4001 passed / 6 skipped at close-out HEAD
pnpm typecheck < /dev/null
NODE_OPTIONS=--max-old-space-size=8192 pnpm lint < /dev/null  # 0 errors, 7 pre-existing warnings

# CI drift gate (manual trigger via workflow_dispatch since 78d6771)
gh workflow run screenshots-drift.yml --ref main
sleep 5 && gh run list --workflow screenshots-drift.yml --limit 1
gh run watch <run-id> --exit-status
```

---

## §8 Convergence log

### §8.1 Per-task TDD-green cycle

All 11 tasks converged red → green → commit in a single Codex session per task. No task required rework after its commit landed. Verify-red technique applied to every structural meta-test (see §5 row 1 for the specific mutations exercised).

### §8.2 Adversarial review (cross-CLI, Opus / Claude Code)

4 rounds against base `ba2ae36`. Heavy-live-integration milestone — per memory `feedback_heavy_audit_milestones_budget_two_rounds.md`, ≥2 rounds expected; actual 4 because three of the four rounds surfaced HIGH-severity environment-divergence findings that local verification couldn't have caught without exercising the actual CI surface.

| Round | Verdict | Key findings | Fix commit |
| --- | --- | --- | --- |
| R1 | NEEDS-FIX | (1) Drift workflow didn't `supabase start` before capture (classic `feedback_mocked_only_tests_invite_tautological_approve.md` — script ran clean against local Supabase, would have failed every CI run). (2) Manifest captures not consumer-backed + distinct. | `859d67d` + `0b38d0b` |
| R2 | NEEDS-FIX | Review-queues capture semantics + CI gate alignment. | `7c5fcba` |
| R3 | NEEDS-FIX | (1) Screenshot Playwright config not isolated (webServer fanout from shared `playwright.config.ts`). (2) Drift CI didn't catch untracked WebP additions (only tracked diffs). | `8938d43` |
| R3-follow-up | NEEDS-FIX | Cross-platform WebP determinism: shipped macOS-captured WebPs would have false-positived every Linux CI run. Pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` Docker image + regenerated baseline FROM the pinned image. | `76457e0` |
| R4 | APPROVE @ 82% confidence | 3 LOW residuals (#1 Playwright version pin, #2 light/dark byte distinct, #3 animation suppression timing). | `96279f3` + `301b00e` + `c79c47d` (M11-F-D1 DEFERRED) |

### §8.3 CI close-out gate (real GitHub Actions verification)

R4 local APPROVE was followed by 5 additional CI-only iterations after the first real GH Actions run. **The local-APPROVE → real-CI-green gap is itself a class-vector for Phase G/H/I to internalize.**

| # | Failure mode (surfaced only in CI) | Fix commit |
| --- | --- | --- |
| 1 | Pre-existing GitHub Pages Jekyll build (`pages-build-deployment` workflow) failing on every push due to Liquid template chokes on `{{ }}` patterns inside markdown code examples (AGENTS.md, M10-onboarding.md). Pre-existing — not introduced by Phase F. Resolved with `.nojekyll` to bypass Jekyll entirely (Next.js project; Pages auto-enabled but unused). | `0cc70bf` |
| 2 | `pnpm install` failed inside pinned Docker image with `ERR_PNPM_IGNORED_BUILDS` for `@sentry/cli`, `esbuild`, `sharp`, `unrs-resolver`. Three sub-iterations on config syntax: (a) `pnpm.onlyBuiltDependencies` in `package.json` — not respected by pnpm 11.2.2; (b) `onlyBuiltDependencies` in `pnpm-workspace.yaml` — still pnpm 10 syntax, not respected; (c) `allowBuilds:` map in `pnpm-workspace.yaml` — pnpm 11+ canonical, respected. Context7 query identified the canonical syntax. | `1a5f404` → `42a618b` → `78b5e8a` |
| 3 | Production Next.js webServer rendered error pages because `createSupabaseServerClient()` requires `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon-alias chain) at runtime; webServer env block didn't supply it. Local `.env.local` filled the gap; CI didn't have `.env.local`. | `e1f0bad` |
| 4 | After anon-key fix, capture still failed because `createSupabaseServiceRoleClient()` requires `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` for production server reads. Same class as #3, second surface. | `22c40c5` |
| 5 | x64 vs arm64 cross-architecture WebP drift on `preview-as-crew-banner-dark.webp`. Local Codex baseline was captured on dev's Docker (Apple Silicon → Rosetta emulation OR arm64-native render). CI runs native x86_64 Linux. Same pinned image, different host arch, different bytes. Reproduced locally with `--platform linux/amd64`; committed the x64 baseline. | `15b7dbe` |

**CI green at run `26296036685` after iteration #5.**

### §8.4 Structural defenses landed during Phase F

- `tests/cross-cutting/playwright-version-pin.test.ts` — pins `@playwright/test` package.json version to the Docker image tag in the drift workflow YAML. Closes the future-failure-mode where a Renovate/Dependabot bump of Playwright silently desyncs the capture environment.
- `tests/help/_metaScreenshotManifest.test.ts` extension — asserts `<key>-light.webp` ≠ `<key>-dark.webp` byte-wise for every manifest entry with `theme: "both"`. Catches silent dark-theme-init-script failures where both WebPs end up identical.
- `tests/help/screenshot-coverage.test.ts` Half A + Half B — manifest reachability (Half A, F.8) + on-disk WebP existence + non-empty walk assertion (Half B, F.11). Walks `app/help/**/*.mdx` for `<Screenshot name="...">` references; fails if any name is empty, missing from manifest, or missing on disk.

---

## §9 Adversarial findings + dispositions

All findings either landed as fix commits (see §8.2 + §8.3) or were dispositioned via DEFERRED.md / BACKLOG.md.

### Phase F DEFERRED entries

- **M11-F-D1** (LOW) — Animation suppression injected via `page.addStyleTag` (post-navigation) rather than `page.addInitScript` (pre-navigation). Empirically determined to be a non-issue at current 3-key manifest scope (5x checksum-identical recapture proves byte-determinism). Concrete re-open trigger: any future manifest key whose captured selector contains framer-motion / `@keyframes` / spinners / mount transitions. Filed at SHA `c79c47d`.

### New memory entries created during Phase F

- `feedback_byte_comparison_ci_gates_pin_capture_environment.md` — Pin both Docker image AND host architecture; regenerate baselines on CI runner, never on dev. Extended after Phase F R5 finding (x64 vs arm64 cross-arch drift) with explicit `--platform linux/amd64` guidance + structural meta-test recommendation.

### Cross-references to existing memory

- `feedback_mocked_only_tests_invite_tautological_approve.md` — Predicted both R1's Supabase-start gap and §8.3's CI-only failure class. Local verification observes what the test author thought the surface required; CI observes what it actually requires.
- `feedback_heavy_audit_milestones_budget_two_rounds.md` — Predicted ≥2 adversarial rounds. Actual 4 + 5 CI iterations.
- `feedback_class_sweep_before_patch.md` — Applied at R3 (config isolation + drift gate hardening landed in one commit covering both class vectors) and §8.3 #3+#4 (anon-key + service-role-key were swept as one finding, fixed in two consecutive commits for atomicity).

---

## §10 Performance & bundle impact

Phase F is test infrastructure + image artifacts; no production runtime / bundle impact.

- **Production bundle:** unchanged. `lib/time/now.ts`'s `X-Screenshot-Frozen-Now` header check runs at request time; no build-time inlining. No new dependencies in production `dependencies`.
- **Repository size:** +12 WebP files at `public/help/screenshots/` (modest — WebP encoder at `{ quality: 90, effort: 4 }` produces compact files).
- **CI pipeline duration:** drift workflow ~4-7 minutes per run (Docker image pull dominates first-run; subsequent runs hit cache).
- **Dev experience:** `pnpm screenshot:help` ~30-90 seconds locally (manifest-size-dependent).

---

## §11 Linked content deferred

- **M11-E-D5** (Phase E): 6 `<Screenshot name=>` assertions skipped pending Phase F WebP delivery. **RESOLVED** by F.10 (placeholder → Screenshot swap, 12 WebPs landed, 6 assertions un-skipped). Re-skip count delta: 13 → 6 in `pnpm test` skipped count.
- **M11-F-D1** (Phase F): Post-navigation animation suppression timing. DEFERRED-AS-LOW; concrete re-open trigger documented at SHA `c79c47d`. See §9.

---

## §12 Sign-off

- [x] Phase F implementation (11 tasks) — Codex CLI session.
- [x] Cross-CLI adversarial review converged APPROVE — Opus / Claude Code, R4 @ 82% confidence.
- [x] LOW residuals dispositioned — #1 + #2 landed as structural defenses; #3 DEFERRED with concrete trigger.
- [x] **CI drift gate green on actual GitHub Actions run** — run `26296036685` (gate #6 satisfied; 8 close-out iterations; see §8.3).
- [x] Test baseline 4001 passed / 6 skipped.
- [x] `pnpm typecheck` clean.
- [x] `pnpm lint` 0 errors (7 pre-existing warnings, unchanged from Phase E close-out).
- [x] Close-out handoff (this doc) authored.
- [ ] Tag `m11-phase-F-completed` (next step).
- [ ] User review.

---

## §13 Meta-test inventory (created or extended in Phase F)

**Created:**
- `tests/help/manifest-shape.test.ts` (F.1) — required fields, unique keys, ISO instants.
- `tests/help/fixture-range-parser.test.ts` (F.2) — DATES-section narrowing, ISO + US date formats, edge cases.
- `tests/help/capture-script.test.ts` (F.3) — smoke + export shape.
- `tests/help/playwright-config.test.ts` (F.4) — setup-project pattern, port 3004, project shape.
- `tests/help/screenshot-help-command.test.ts` (F.5) — package script + workflow + capture-spec wiring.
- `tests/help/screenshot-picture-contract.test.ts` (F.6) — `<Screenshot>` component renders both `<source>` elements with correct `prefers-color-scheme` media queries.
- `tests/help/_metaScreenshotManifest.test.ts` (F.7; extended in F.11 + LOW#2) — fixture existence + route resolution + WebP existence + orphan detection + (F.11) on-disk gating + (LOW#2) light/dark byte-distinct.
- `tests/help/screenshot-coverage.test.ts` (F.8 Half A + F.11 Half B) — manifest reachability + non-empty walk + on-disk WebP existence.
- `tests/e2e/help-screenshots-clock-pipeline.spec.ts` (F.9) — X-Screenshot-Frozen-Now reaches server render; primary determinism contract.
- `tests/e2e/screenshots-help-capture.spec.ts` (F.5/F.10) — drives the manifest entries through Playwright capture.
- `tests/e2e/screenshots-help-setup.ts` (F.4) — seed project (real Playwright test, not default-export).
- `tests/cross-cutting/playwright-version-pin.test.ts` (LOW #1) — `package.json` `@playwright/test` ↔ workflow Docker tag parity.

**Extended:**
- Drift workflow `screenshots-drift.yml` from R3 + close-out: `supabase start` (R1), `--network host` Docker + pinned image (R3), `workflow_dispatch:` trigger (`78d6771`), tracked + untracked diff (R3).

---

## §14 Phase F meta-observations (close-out retrospective)

1. **Local-APPROVE is necessary but not sufficient for CI-bound surfaces.** Phase F's R4 APPROVE was followed by 5 CI-only iterations covering 4 distinct environment-divergence classes (Jekyll/Pages, pnpm syntax, Supabase env keys, host architecture). Every milestone with new CI surface should treat "real CI green" as a separate close-out gate from "local + adversarial-review green," not a derivative one. The byte-comparison memory created during Phase F was extended TWICE (anon key gap, host architecture pin) by findings the original memory predicted only generically.

2. **Plan-body internal contradictions warrant a self-consistency sweep before adversarial review.** F.8's "non-empty assertion" was listed in both Half A and Half B; resolution worked smoothly because Codex caught + documented the deviation, but pre-emptive self-consistency could have saved the round-trip. Recommendation: writing-plans skill should add a "grep every numeric assertion + every named assertion across all sub-sections" step before final draft.

3. **The byte-comparison-CI-gate class is broader than this project.** Generalizes to PDF golden files, audio waveform diffs, video frame checksums, anything-non-text. The memory is project-tagged but the pattern would help any future Anthropic-internal byte-comparison gate.

4. **CI-iteration cost is asymmetric.** 5 CI iterations × ~5 min each = ~25 minutes of CI compute + ~25 minutes of orchestrator + Codex coordination, but each iteration was very cheap to dispatch (one `gh workflow run` + one `gh run watch`). The asymmetry favors "push the fix, run CI, observe, iterate" over "diagnose extensively locally, then push once." Caveat: this depends on having `workflow_dispatch:` enabled — added at `78d6771` mid-phase, operationally useful long-term.

5. **8 iterations to gate-#6-green is on the high end but proportionate.** Adversarial review caught the truly novel surfaces (Supabase start, byte determinism). CI caught the environment-divergence surfaces. Combined, the close-out class fired exactly where it should have. The pre-existing Jekyll failure was incidental — not Phase F's responsibility, but Phase F's first push surfaced it and Phase F's close-out fixed it. Net positive: the next milestone's first push won't hit it.
