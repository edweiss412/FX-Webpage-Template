# Handoff — M11 Phase G: Affordance retrofit (§9.0.1 deep-link wiring, Tasks G.0–G.6)

**Status:** CLOSED 2026-05-22 at SHA `4fc4822`. Drift CI gate verified green at GitHub Actions run [`26309766066`](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26309766066) after regenerated x64 baseline at `fe640ea`.

**Handed off:** 2026-05-22 by Eric Weiss (orchestrator session "Orchestrator — M11").
**Implementers:** Split-mode per ROUTING.md "G — Affordance retrofit" row.
- **§A backend / tests** — GPT-5.5 / Codex CLI via `codex exec`. Tasks G.0, G.1, G.2, G.5, G.6.
- **§B UI** — Opus 4.7 / Claude Code via `superpowers:subagent-driven-development`. Tasks G.3, G.4.
- **Coordination:** Single pin-stop after G.0 + G.1 + G.2 commits (per ROUTING.md correction at `4263c0a`). §B Opus consumed §A's pinned contracts (`AffordanceRow` type + `shouldEmitLearnMore` gate) against a frozen reference; §A's G.5 + G.6 tests landed RED-at-commit and flipped GREEN at §B's `d73421c` without further Codex commits.

**Adversarial reviewer:** GPT-5.5 / Codex CLI via manual interactive sessions (companion `--background` mode produced placeholder stubs twice on this surface; fell back to interactive per `feedback_codex_companion_background_review_log_location.md` + the brief-self-containment discipline now in AGENTS.md).

**Plan file:** `docs/superpowers/plans/2026-05-12-user-facing-docs/07-affordance-retrofit.md` (Tasks G.0–G.6).

> Phase G is **split-mode** with a single pin-stop. The split was tighter than M5/M6/M8/M9.5 — only G.0/G.1/G.2 are pre-pin; the §B UI work + §A test tail run in parallel after the pin.
> Phase G ratified **M11 Amendment 1** mid-execution: parse-warning testid family collapses into the error-message template-family. First ratified amendment on the M11 plan.
> Phase G **deletes M10's `components/admin/Tour.tsx`** — the modal was M10's implementation of spec §9.0.1's "second help affordance" before /help/tour existed; spec §5.6 evolved to `target=/help/tour` and Phase E.12 shipped that page with content-superior coverage.

---

## §1 Session metadata

- **Session date(s):** 2026-05-22 (full Phase G start → close).
- **Implementers:** Codex CLI (§A) + Opus / Claude Code (§B), parallel after pin-stop.
- **Reviewer:** Codex (cross-CLI) via 3 manual interactive sessions (R1, R2, R3).
- **Base branch:** `main` at commit `04ac00b` (M11 Phase F close-out handoff).
- **Plan version:** `docs/superpowers/plans/2026-05-12-user-facing-docs/07-affordance-retrofit.md` r10 (r4 fix collapsed parse-warning-row family; r8-r10 fix established TDD ordering for G.4 retrofit; r5 added G.0 hard-exit signal).
- **Spec version:** `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` r14+r15 + **M11 Amendment 1** (ratified during Phase G at `4263c0a`).

---

## §2 Phase progress

- [x] **Phase G — Affordance retrofit** (`07-affordance-retrofit.md`) — **CLOSED 2026-05-22 at SHA `4fc4822`**.
  - [x] Task G.0 — Pre-execution discovery (M9/M10 path inventory in `00-overview.md`) — SHA `3f1f19a` (§A Codex)
  - [x] Task G.1 — `app/help/_affordanceMatrix.ts` typed §5.6 registry (13 concrete + 1 template-family + 1 negative row; Amendment 1 honored — no parse-warning-row family) — SHA `409db33` (§A Codex)
  - [x] Task G.2 — `lib/messages/renderer-gate.ts` with preview-as-crew exception — SHA `5357f6e` (§A Codex) — **PIN-STOP**
  - [x] Task G.3 — `Learn more →` JSX wiring (HelpAffordance new component; Tour modal deleted; dashboard footer link; section-header HelpTooltips; HelpAffordance siblings on AlertBanner/StagedReviewCard/ReSyncButton; ParsePanel parse-warning Learn-mores via Amendment 1's error-message-family pattern) — SHA `d73421c` (§B Opus; impeccable v3 dual-gate APPROVED R1→R2 via external attestation, 2 fresh subagents)
  - [x] Task G.4 — Walker SKIP filter + Phase G DEFERRED entries (M11-G-D-1..5) — SHA `4950e9d` (§B Opus)
  - [x] Task G.5 — `tests/e2e/deep-link-walker.spec.ts` deep-link walker (test #13) — SHA `da7b6dd` (§A Codex, RED-at-commit; flipped GREEN at §B's `d73421c` + later post-fix commits)
  - [x] Task G.6 — Error-renderer gate meta-test (`tests/messages/_metaErrorRendererGate.test.ts`, test #12) — SHA `bf4944d` (§A Codex, RED-at-commit; flipped GREEN at §B's `d73421c`)
  - [x] R1 adversarial review (manual Codex session) — NEEDS_FIX @ 93% confidence; 2 HIGH findings closed at `d84d787` (Opus, first-seen-review-card testid) + `d8901d4` (Codex, wizard seed split)
  - [x] R2 adversarial review — NEEDS_FIX @ 95% confidence; 2 HIGH findings closed at `1d8a14e` (Codex, eslint `.next-screenshots-help` ignore) + `ce7cfa0` (Codex, Docker `--platform linux/amd64` pin + version-pin meta-test extension)
  - [x] R3 adversarial review — **APPROVE @ 93% confidence**; both R2 findings RESOLVED, no new material findings
  - [x] Drift CI gate green on actual GitHub Actions run — `26309766066` after baseline regen at `fe640ea`
  - [ ] User review.

**Cross-cutting infra + docs commits (Phase G-adjacent, in scope for handoff):**
- `4263c0a` — `docs(plan): ratify M11 Amendment 1 (parse-warning testid collapse) + correct Phase G pin-stop boundary`. Promoted the plan-body r4 revision to a ratified spec amendment + fixed ROUTING.md's internally-inconsistent "pin after G.1-G.3" → "pin after G.1+G.2."
- `abfc23a` — `docs(agents): promote cross-cutting + cross-CLI discipline from milestone retrospectives`. New AGENTS.md sections: "Cross-cutting discipline (from milestone retrospectives)" + "Cross-CLI orchestrator discipline." Surfaced mid-Phase-G when the user flagged that Codex-bound prompts were citing memory file paths Codex's tool boundary doesn't reach.
- `2aa42ab` — `docs(agents): strengthen Cross-CLI brief discipline with REVIEWER-ONLY + WebP-restore`. Added two new bullets after R2: explicit REVIEWER-ONLY framing in every adversarial review brief + post-`screenshot:help` WebP restoration instruction. Both were defects in my R2 brief that Codex behaved correctly through anyway, but the discipline got hardened.
- `fe640ea` — `fix(screenshots): regenerate dashboard-overview x64 baseline post-G.3 footer change`. Regenerated 2 WebPs via local `mcr.microsoft.com/playwright:v1.59.1-jammy --platform linux/amd64` Docker capture against fresh `supabase db reset`; local blob hashes match CI capture hashes exactly (validating the platform-pin discipline retroactively).
- `4fc4822` — `chore(gitignore): ignore .pnpm-store + tmp scratch dirs`. Local Docker capture mounts repo at `/work`, causing pnpm's content-addressable store to land in repo root (1.1GB). Pure cache; added with `tmp/` (Playwright test-results scratch).

Other phases: A done at `e911078`; B done at `cd14865`; C done at `6c7e6de`; D done at `08d6546`; E done at `ba2ae36`; F done at `15b7dbe` (tag `m11-phase-F-completed`). H–I tracked in their own per-phase handoffs.

---

## §3 Spec sections in scope (Phase G only)

- **§5.6** — Affordance matrix (the canonical 13-concrete + 1-template-family + 1-negative-row contract that G.1 typed + G.5 walks).
- **§9.0.1** — Deep-link wiring (the "Learn more →" rendering contract G.3 implements).
- **§5.6 affordance matrix Amendment 1 (ratified at `4263c0a`)** — Parse-warning testid family collapses into error-message template-family via `messageFor(code)` routing. First ratified amendment on the M11 plan.
- **AC-11.31, AC-11.32, AC-11.33** — Walker coverage (test #13), error-renderer gate (test #12), affordance reachability.
- **AC-11.35, AC-11.36** — Preview-as-crew exception handling.

Out of scope (deferred to later phases):
- Auth-integration Playwright tests (Phase H).
- Mobile-layout Playwright (Phase H).
- Phase-level impeccable v3 dual-gate over the full M11 surface (Phase I).

---

## §4 Acceptance criteria

| AC | Phase G target | Notes |
| --- | --- | --- |
| AC-11.31 | PASS | `tests/e2e/deep-link-walker.spec.ts` walks every non-deferred concrete row + reverse-target + negative crew assertion. 13/13 pass at HEAD `4fc4822`. |
| AC-11.32 | PASS | `tests/messages/_metaErrorRendererGate.test.ts` covers gate classification + HelpAffordance renderer coverage. Flipped GREEN at §B `d73421c`. |
| AC-11.33 | PASS | Every non-deferred matrix row resolves to a real DOM element at its documented `sourceRoute` under the seeded test environment (after R1 Finding 2 seed split). |
| AC-11.35 | PASS | `shouldEmitLearnMore` returns false for `/admin/show/<slug>/preview/<crewId>` routes via the regex `/^\/admin\/show\/[^/]+\/preview\/[^/]+(?:\/|$)/`. Verified by §A G.2 unit tests + §B G.3 rendering tests. |
| AC-11.36 | PASS | Help-affordance testids follow the documented namespace conventions (concrete: `help-affordance--<context>--<element>`; template-family: `help-affordance--error-message--<code>--learn-more` per Amendment 1). |

ACs NOT addressed by Phase G: AC-11.1–AC-11.30 (covered by Phases A–F), AC-11.34 (Phase F), AC-11.37–AC-11.39 (Phases H–I).

---

## §5 Plan-wide invariants — applicability to Phase G

| # | Invariant | Phase G applicability |
| --- | --- | --- |
| 1 | TDD per task | PASS — Every task: failing test → minimal implementation → passing test → commit. Verify-red technique applied to every meta-test (G.5 mutating matrix target to `#missing-active-shows`; G.6 forcing preview-as-crew gate to true; G.4 verifying SKIP filters trigger; §B G.3 mounting components in admin/crew/preview contexts; R1 Fix 1 mode-boundary RED-before-GREEN; R2 fixes both verify-red'd). |
| 2 | Per-show advisory lock | N/A — Phase G adds no new lock holders. |
| 3 | Email canonicalization | N/A — Phase G surface doesn't touch raw emails. |
| 4 | No global sync cursor | N/A. |
| 5 | No raw error codes in UI | PASS — All "Learn more →" link text is fixed-string ("Learn more →"); helpHref values come from `messageFor(code).helpHref` (catalog-routed); error-code-keyed testids are programmatic identifiers, not user-visible text. |
| 6 | Commit per task | PASS — One conventional-commits commit per task (G.0 through G.6 = 7 commits); R1/R2 fixes one commit per finding (4 commits); docs/infra adjacent commits scope-clean. |
| 7 | Spec is canonical | PASS — When the plan body's r4 revision (parse-warning testid family collapse) was discovered to lack formal ratification, the principled fix was promoting it to a ratified amendment in `00-overview.md`, not silently implementing the deviation. |
| 8 | UI quality gate | PASS — §B G.3 impeccable v3 dual-gate APPROVED at R2 via external attestation (2 fresh subagents). 3 findings DEFERRED via M11-G-D-4 + M11-G-D-5 + (subsumed by D-1/D-2/D-3 surfaces). §B G.4 is `data-testid` retrofit + walker SKIP work — no visual change; dual-gate not separately required per `feedback_impeccable_external_attestation_required.md` precedent. |
| 9 | Supabase call-boundary discipline | PASS — Phase G adds no new Supabase call helpers. R1 Finding 2's seed split touches `tests/e2e/help-docs-setup.ts` (new) + reuses existing `pnpm db:seed` helpers. |

---

## §6 Watchpoints (class-vectors carried forward)

These are bug-class vectors Phase G surfaced or extended; consult before drafting Phase H/I tasks that touch the same surfaces.

1. **Memory files at `~/.claude/projects/<workspace>/memory/` are invisible to Codex.** Cross-CLI orchestrator failure mode discovered mid-Phase-G: multiple Codex-bound prompts (kickoffs, review focus text) cited memory file paths Codex's tool boundary doesn't reach. Promoted to AGENTS.md "Cross-CLI orchestrator discipline" section at `abfc23a`. Going forward, every Codex-bound prompt MUST inline load-bearing principles directly; cite repo paths only. Audit pattern: grep your own draft for `feedback_` or `~/.claude/projects/` matches before sending.

2. **REVIEWER ONLY framing in adversarial review briefs is mandatory.** R2 brief omitted the explicit "REVIEWER ONLY. Do not fix issues" role framing. Codex happened to behave correctly without it (no fix-commits landed) but the omission was a real discipline gap. Strengthened in AGENTS.md at `2aa42ab` — every adversarial-review brief must inline the rule + every reviewer dispatch should grep its own draft for "REVIEWER ONLY" before sending.

3. **`pnpm screenshot:help` overwrites the x64-Linux baseline with host-architecture bytes.** Local capture on macOS/arm64 produces different bytes than the committed CI baseline; restoration via `git restore public/help/screenshots/` MUST happen after every verification run. Now mandated in AGENTS.md at `2aa42ab`.

4. **`--platform linux/amd64` is load-bearing for byte reproducibility from arm64 hosts.** Phase G validated retroactively: local pinned Docker capture with `--platform linux/amd64` on arm64 macOS produces byte-identical output to native-x64 GitHub Actions runner. Both git blob hashes matched CI's flagged hashes exactly (`2ad5607` and `575ab0e` for dashboard-overview-dark/light). The R2 Finding 2 fix at `ce7cfa0` isn't defense-in-depth; it's an actual reproducibility requirement.

5. **CI drift gate catches visible UI changes.** Phase G's G.3 footer link replacement (Tour modal → inline `<a>`) was dashboard-visible and the CI drift gate correctly flagged the committed baseline was stale. Future UI changes to surfaces with committed screenshot baselines (dashboard, per-show panel, preview-as-crew, review-queues, onboarding-wizard) need a baseline regen as part of the same milestone; the gate will trip otherwise.

6. **Companion-script `--background` adversarial-review mode is unreliable on this surface.** Two consecutive `--background` invocations produced placeholder stub responses (`summary:"placeholder"`, empty findings, worker died <14s). Manual interactive Codex CLI sessions completed full reviews in 3-7 min. Pattern fallback documented in `feedback_codex_companion_background_review_log_location.md`; AGENTS.md mandates self-contained briefs for manual sessions.

7. **Plan-body internal contradictions surface during pre-execution discovery.** Two caught during G.0 pre-read: (a) spec §5.6 vs plan body G.1 r4 on parse-warning row family (resolved by promoting to Amendment 1 at `4263c0a`); (b) ROUTING.md pin-stop boundary "G.1-G.3" vs the row-level description routing G.3 to UI (resolved by correcting ROUTING.md at `4263c0a`). Self-consistency-sweep the plan body before drafting tasks.

---

## §7 Test commands

```bash
# Phase G structural unit tests (fast)
pnpm test tests/components/admin/StagedReviewCardFirstSeenAffordance.test.tsx \
          tests/components/admin/section-header-affordance.test.tsx \
          tests/components/admin/parse-panel-affordance.test.tsx \
          tests/components/admin/dashboard-footer-affordance.test.tsx \
          tests/messages/_metaErrorRendererGate.test.tsx \
          tests/help/deep-link-walker-template-family.test.tsx \
          tests/help/deep-link-walker-reverse.test.ts \
          tests/cross-cutting/eslint-generated-dir-ignores.test.ts \
          tests/cross-cutting/playwright-version-pin.test.ts < /dev/null

# Phase G Playwright walker (requires local Supabase + Docker)
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture \
  pnpm exec playwright test --config=playwright.screenshots.config.ts \
  --project=help-docs tests/e2e/deep-link-walker.spec.ts < /dev/null

# Local pinned-image capture (for baseline regen; MUST be followed by git restore)
docker run --rm --platform linux/amd64 --network host \
  -v "$PWD:/work" -w /work -e CI=true \
  mcr.microsoft.com/playwright:v1.59.1-jammy \
  bash -lc "apt-get update -qq && apt-get install -y -qq postgresql-client && corepack enable && pnpm screenshot:help"
git restore public/help/screenshots/  # if not actually regenerating baseline

# CI drift gate (manual trigger; --platform pinned via workflow per ce7cfa0)
gh workflow run screenshots-drift.yml --ref main

# Full close-out gate set
pnpm test < /dev/null        # 4029 passed / 6 skipped at close-out HEAD
pnpm typecheck < /dev/null
NODE_OPTIONS=--max-old-space-size=8192 pnpm lint < /dev/null  # 0 errors, 7 pre-existing warnings
```

---

## §8 Convergence log

### §8.1 Per-task TDD-green cycle

All 7 tasks converged red → green → commit. Split-mode coordination worked as designed: §A Codex's G.5 + G.6 committed RED at `da7b6dd` + `bf4944d`; §B Opus's G.3 commit at `d73421c` made them GREEN without further Codex commits. The 136-missing-error-message-family-links + 272-missing-admin/help-admin-emissions counts at the RED-state commit collapsed to zero at d73421c — the documented split-mode pattern.

### §8.2 Adversarial review chain

3 rounds, all via manual Codex interactive sessions (companion `--background` mode broken on this surface — produced placeholder stubs).

| Round | Verdict | Findings | Fix commits |
| --- | --- | --- | --- |
| R1 | NEEDS_FIX @ 93% | (1) `tests/e2e/deep-link-walker.spec.ts` — `first-seen-review-card--tooltip` row failed: matrix declared non-deferred concrete row, but `/admin/show/staged/<stagedId>` rendered `<StagedReviewCard mode="first_seen" />` without the matching `data-testid`. (2) Same walker — `wizard-step{1,2,3}--tooltip` rows failed: help-docs Playwright seed set `watched_folder_id` (for screenshot capture), dispatching `/admin` to `<Dashboard />` not `<OnboardingWizard />`. | `d84d787` (§B Opus — testid + RED→GREEN + impeccable dual-gate PASS via 2 fresh subagents) + `d8901d4` (§A Codex — seed split: new `help-docs-setup` Playwright setup project with wizard-active seed; screenshots-help retains dashboard seed; walker `/admin`-state switches per matrix row) |
| R2 | NEEDS_FIX @ 95% | (1) `eslint.config.mjs`: lint scans `.next-screenshots-help/` (Next.js build output from `pnpm screenshot:help`) and fails with 1086 errors after capture — the canonical capture→lint sequence is broken. (2) `.github/workflows/screenshots-drift.yml`: Docker image tag is pinned but `--platform linux/amd64` is not — structural meta-test only checks Playwright version alignment, doesn't catch missing platform pin. | `1d8a14e` (§A Codex — `.next-screenshots-help/**` added to eslint ignores + new structural meta-test) + `ce7cfa0` (§A Codex — workflow `--platform linux/amd64` flag added + version-pin meta-test extended; class-sweep caught stale `docker run --rm --network host` literal in `tests/help/screenshot-help-command.test.ts` and updated it in the same commit) |
| R3 | **APPROVE @ 93%** | Both R2 findings RESOLVED. No new material findings. | n/a |

### §8.3 CI close-out gate (real GitHub Actions verification)

After R3 APPROVE, the drift workflow at run `26309076863` flagged 2-file drift: `dashboard-overview-dark.webp` (`aa0e955 → 2ad5607`) + `dashboard-overview-light.webp` (`6326044 → 575ab0e`). Diagnosis: Phase G's G.3 (`d73421c`) replaced the M10 `<Tour />` modal trigger with an inline `<a>` footer link — dashboard-visible UI change → committed Phase F-era baseline stale.

Regeneration sequence (per Phase F's byte-comparison-discipline now in AGENTS.md):
1. `supabase db reset --no-seed` (fresh state matching CI).
2. `docker run --platform linux/amd64 --network host mcr.microsoft.com/playwright:v1.59.1-jammy ...` (pinned image + platform flag).
3. Capture succeeded; local git blob hashes matched CI's flagged hashes exactly (`2ad5607` and `575ab0e`).
4. Committed at `fe640ea`; CI re-triggered.
5. Run `26309766066` → **completed:success**.

Validates retroactively: `--platform linux/amd64` on arm64 macOS produces byte-identical output to native-x64 CI runners when seed state matches. The R2 Finding 2 fix wasn't defense-in-depth — it was a working reproducibility tool.

### §8.4 Structural defenses landed during Phase G

- `tests/cross-cutting/eslint-generated-dir-ignores.test.ts` — pins `.next-screenshots-help/**` in eslint.config.mjs's ignore list (R2 Finding 1 close).
- Extension to `tests/cross-cutting/playwright-version-pin.test.ts` — now asserts BOTH Playwright version alignment AND `--platform linux/amd64` presence in the drift workflow YAML (R2 Finding 2 close).
- New Playwright setup project `tests/e2e/help-docs-setup.ts` — wizard-active seed for the help-docs project; separate from screenshots-help's dashboard-state seed (R1 Finding 2 close).
- `tests/components/admin/StagedReviewCardFirstSeenAffordance.test.tsx` — mode-conditional testid contract (R1 Finding 1 close).

---

## §9 Adversarial findings + dispositions

All findings either landed as fix commits (§8.2) or were dispositioned via DEFERRED.md.

### Phase G DEFERRED entries (5 total)

- **M11-G-D-1** (LOW) — Dashboard `Review staged changes` badge tooltip: hover-tooltip on an existing badge needs new HoverCard-style component (Phase D's `<HelpTooltip>` is click-to-disclose `<details>`). Trigger: next admin-UX polish milestone OR FXAV operator feedback flagging missing context.
- **M11-G-D-2** (LOW) — Per-show staged-review card header tooltip: StagedReviewCard renders straight into choice table; adding a header element is structural refactor + multi-instance positioning. Trigger: next admin-UX polish OR confusion-feedback.
- **M11-G-D-3** (LOW) — Preview-as-crew sticky banner tooltip: sticky-banner + tooltip UX is non-trivial (mobile placement, dismissal). Trigger: next admin-UX polish OR confusion-feedback.
- **M11-G-D-4** (LOW) — HelpAffordance `text-text-subtle` inside `bg-warning-bg` contrast: pre-existing pattern from ErrorExplainer's `helpfulContext` mode; ~4.5:1 light / ~3.3:1 dark (dark fails AA body). Trigger: Phase I `/impeccable harden` pass on AlertBanner/StagedReviewCard/ReSyncButton.
- **M11-G-D-5** (INFO) — HelpAffordance `"use client"` boundary + null-pathname conservative no-emit: catalog-bundle weight already paid by 15+ existing client components; conservative no-emit on null pathname is by-design. Trigger: future architecture review OR observed misbehavior.

### Updates to existing DEFERRED entries

- **M11-E-D5** — partially un-deferred by Phase G via `d73421c`'s walker assertions; the M11-E-D5 stopgap `it.skip` markers were un-skipped at Phase F.10 (`3e46f1a`) so this entry is already RESOLVED at Phase F close-out. Phase G's affordance retrofit adds the rendered DOM affordances the un-skipped tests check for.

### New memory entries created during Phase G

Per the cross-CLI orchestrator discipline now in AGENTS.md, memory entries continue to be Opus-internal context. Phase G discovered + codified two:

- `feedback_byte_comparison_ci_gates_pin_capture_environment.md` (created Phase F R3; extended Phase G R2 with the `--platform linux/amd64` validation from the fe640ea regeneration).
- `feedback_memory_files_invisible_to_codex.md` (created during Phase G mid-implementation after the user flagged memory citations leaking into Codex-bound prompts). Promoted principle to AGENTS.md at `abfc23a`.

---

## §10 Performance & bundle impact

Phase G adds one new client component (`HelpAffordance`) + a `Learn more →` anchor at multiple call sites + section-header HelpTooltip wrappers on the per-show page.

- **Production bundle:** Minimal. HelpAffordance imports `messageFor` + `lookupHelpfulContext` client-side; per impeccable audit Round-1 H3 disposition (now M11-G-D-5), the catalog-bundle weight was already paid by 15+ existing client components. New incremental cost is the HelpAffordance component itself + the `<a>` JSX at the wired call sites.
- **Repository size:** +2 WebP files net change (regenerated dashboard-overview light + dark); other 4 unchanged.
- **CI pipeline duration:** Drift workflow unchanged from Phase F (~5-15 min per run including Docker image pull).
- **Dev experience:** Walker spec adds ~2-3 min to Playwright test suite when run end-to-end; not in default `pnpm test`.

---

## §11 Linked content deferred

- **M11-F-D1** (Phase F): still DEFERRED-AS-LOW per Phase F handoff; empirically determined not load-bearing at current manifest scope.
- **M11-G-D-1..5** (this phase, §9 above): five DEFERRED entries with concrete re-open triggers.

---

## §12 Sign-off

- [x] Phase G implementation (7 tasks) — split-mode Codex + Opus.
- [x] Cross-CLI adversarial review converged APPROVE — 3 rounds: R1 NEEDS_FIX, R2 NEEDS_FIX, R3 APPROVE.
- [x] R1 + R2 findings (4 HIGH total) — all closed via 4 fix commits.
- [x] DEFERRED entries (M11-G-D-1..5) — filed with concrete re-open triggers.
- [x] Impeccable v3 dual-gate APPROVED on G.3 UI surface (external attestation).
- [x] **CI drift gate green on actual GitHub Actions run** — `26309766066` after baseline regen at `fe640ea`.
- [x] Test baseline 4029 passed / 6 skipped (was 4001 / 6 at Phase F close; +28 net new tests across G.0-G.6 + 4 fix commits).
- [x] `pnpm typecheck` + `pnpm lint` clean.
- [x] Working tree clean after `.pnpm-store/` + `tmp/` gitignore patch (`4fc4822`).
- [x] M11 Amendment 1 ratified (`4263c0a`) — first ratified amendment on the M11 plan.
- [x] AGENTS.md strengthened with cross-cutting + cross-CLI discipline (`abfc23a`, `2aa42ab`).
- [x] Close-out handoff (this doc) authored.
- [ ] Tag `m11-phase-G-completed` at `4fc4822` (next step).
- [ ] User review.

---

## §13 Meta-test inventory (created or extended in Phase G)

**Created:**
- `tests/messages/_metaErrorRendererGate.test.tsx` (G.6) — gate classification + HelpAffordance renderer coverage.
- `tests/help/deep-link-walker-template-family.test.tsx` (G.5) — template-family row coverage.
- `tests/help/deep-link-walker-reverse.test.ts` (G.5) — reverse-direction walker (every help-target points back at a valid affordance).
- `tests/e2e/deep-link-walker.spec.ts` (G.5) — Playwright walker over concrete rows (skip list via G.4's DEFERRED filters).
- `tests/e2e/help-docs-setup.ts` (R1 Finding 2 fix) — wizard-active seed for the help-docs Playwright project.
- `tests/components/admin/StagedReviewCardFirstSeenAffordance.test.tsx` (R1 Finding 1 fix) — mode-conditional testid contract.
- `tests/cross-cutting/eslint-generated-dir-ignores.test.ts` (R2 Finding 1 fix) — pins `.next-screenshots-help/**` in eslint ignores.

**Extended:**
- `tests/cross-cutting/playwright-version-pin.test.ts` (R2 Finding 2 fix) — now asserts `--platform linux/amd64` flag presence in the drift workflow.
- `tests/help/screenshot-help-command.test.ts` (R2 Finding 2 class-sweep) — assertion updated away from the stale `docker run --rm --network host` literal.

---

## §14 Phase G meta-observations (close-out retrospective)

1. **Memory-files-invisible-to-Codex is a real cross-CLI failure mode.** Multiple Codex-bound prompts during Phase G cited memory file paths Codex's tool boundary doesn't reach. The discipline correction (inline principles or promote to AGENTS.md) landed mid-Phase-G at `abfc23a`. Going forward, the audit pattern is: grep every Codex-bound prompt for `feedback_` or `~/.claude/projects/` before sending. This is also the principle that turned a brief defect into a structural fix — promoting load-bearing patterns to AGENTS.md makes them durable across harness boundaries.

2. **Companion-script `--background` adversarial-review mode is unreliable on this surface.** Two consecutive attempts to invoke `/codex:adversarial-review --background` produced placeholder stub responses (`summary:"placeholder"`, empty findings, worker died <14s). Manual interactive Codex CLI sessions completed full reviews in 3-7 min. Root cause unknown (possibly prompt-length triggers structured-output truncation, possibly env-var resolution differences in companion-vs-interactive). The interactive fallback is the working pattern for now.

3. **Local pinned-Docker + `--platform linux/amd64` + fresh-state Supabase produces byte-identical CI bytes.** Phase F's byte-comparison-environment memory hypothesized this; Phase G's `fe640ea` validated it concretely — local git blob hashes matched CI's flagged hashes exactly. This means baseline regenerations CAN happen locally on arm64 hosts (no need to download CI artifacts) PROVIDED the seed state matches a fresh `supabase db reset`.

4. **Plan-body internal contradictions surface during pre-execution discovery.** Two caught in G.0: parse-warning row family (resolved as Amendment 1 ratification) + ROUTING.md pin-stop boundary (resolved as a typo fix). Cheap to catch at pre-read; expensive if they surface mid-review. Future plans should self-consistency-sweep before adversarial review fires.

5. **REVIEWER-ONLY brief framing matters even when Codex behaves correctly.** R2 brief omitted the explicit "do not fix" role framing; Codex didn't actually commit fixes (good), but the omission was a real discipline gap that could have triggered reviewer-as-implementer drift in a different session. The user flagged it after R2 returned and asked "was that intentional?" Strengthened in AGENTS.md at `2aa42ab` — every adversarial-review brief MUST inline the rule.

6. **Whole-milestone close-out gate distinct from per-task gates.** Phase G's R1 surfaced findings that per-task reviews would not have caught: integration-level bugs (wizard rows can't resolve under the help-docs seed because the seed was tuned for screenshots-help). Per-task tests passed; whole-phase walker failed. Same pattern as M9/M10/Phase F. AGENTS.md "Cross-cutting discipline" now codifies this gate as its own discrete step.

7. **8 fix commits + 1 baseline regen + 1 gitignore patch = 10 close-out commits.** Phase G's whole-milestone close-out class fired about as expected for a heavy-live-integration milestone (3 review rounds + 1 CI cycle requiring baseline regen). Phase F had 8 CI iterations; Phase G had 1. The Phase F lessons (now in AGENTS.md cross-cutting discipline) genuinely shortened Phase G's CI close-out — the `--platform linux/amd64` discipline was already in place from Phase F R5, and the issue was purely the dashboard UI change requiring regen.
