# Self-review checklist

> Part of [the FXAV crew pages design plan](README.md).


Per the writing-plans skill: after writing the complete plan, look at the spec with fresh eyes and check the plan against it.

- [ ] **Spec coverage** — walk every §-numbered section in the spec and confirm a task implements it. Specifically:
  - §1–§3 (goal/scope/architecture) → architectural decisions captured in plan header.
  - §4 (data model) → M2 tasks 2.1..2.5.
  - §5 (sync) → M6 tasks 6.1..6.13.
  - §5.5 (push) → M6 tasks 6.9..6.10.
  - §6 (parser) → M1 tasks 1.1..1.14.
  - §6.8 (invariants) → M1 task 1.12 + M6 tasks 6.4, 6.11, 6.12.
  - §6.11 (diagrams) + §6.11.1 (reel drift) → M7 tasks 7.1..7.8.
  - §7 (auth) → M5 tasks 5.1..5.9.
  - §8 (crew page) → M4 tasks 4.1..4.15.
  - §9 (admin) → M10 tasks 10.1..10.9.
  - §10 (linked content) → M7 task 7.9.
  - §11 (edit/sync semantics) → covered across M5/M6/M7.
  - §12 (errors) → M9 task 9.4 + M5 task 5.8.
  - §13 (reporting) → M8 tasks 8.1..8.5.
  - §14 (stack/dirs) → M0 tasks 0.1..0.6.
  - §15 (build sequence) → milestone structure of plan.
  - §17 (acceptance criteria) → enumerated per task.

- [ ] **Placeholder scan** — search plan for: `TBD`, `add appropriate`, `similar to Task`, `etc.`, `...`, `TODO`. Replace any matches with concrete code/text or remove.

- [ ] **Type consistency** — verify type and method names used in later tasks match earlier definitions:
  - `ParseResult` (Task 1.1) used in 1.11, 1.12, 6.4, 6.5, 6.11, 7.3.
  - `validateLinkSession` (Task 5.2) used in 5.5, 5.6, 5.7, 7.5, 7.6, 8.3, X.3.
  - `runInvariants` (Task 1.12) used in 2.4, 3.2, 6.4.
  - `applyParseResult` (Task 6.5) used in 2.4, 6.11, 7.3.
  - `getShowForViewer` (Task 4.3) used in 4.4..4.10, 5.7, 10.8.
  - `snapshotAssets` (Task 7.3) called from `phase2.ts` (Task 6.5).

- [ ] **Layout dimensions task present** — Task 4.13 covers AC-4.4 with `getBoundingClientRect` per `data-testid`, asserting `child.height === parent.height` within 0.5px tolerance, including the explicit Tailwind v4 `align-items: stretch` invariant. **every §8.4 invariant has a corresponding assertion** — (1) Right Now full-width across breakpoints, (2) grid column count + equal-row stretch, (3) tile min-height 96px, (4) 240px internal-overflow rule + `[data-testid=tile-show-more]` disclosure, (5) footer sticky-on-short / flow-on-long with both short-content and long-content fixtures exercised.

- [ ] **Transition audit task present** — Task 4.12 enumerates every Right Now state transition pair from §8.2's table including compound transitions (e.g., `Any → unknown` mid-flight against another transition).

- [ ] **Pre-draft code-verification pass** — Task 1 of this plan documents that the codebase is green-field; spec citations were verified against fixtures (2025-06-ria-investment-forum.md:30-32, lines 110-121; 2026-03-rpas-central-four-seasons.md:38; etc.).

- [ ] **Anti-tautology rule** — every test in the plan that asserts "output X equals/contains value Y" scopes its extraction so the thing-under-test cannot self-satisfy. Examples:
  - AC-7.8 snapshot isolation test compares against pre-edit storage bytes, NOT against the live Drive read.
  - Phase-2 monotonic-guard tests compare against the persisted `last_seen_modified_time` BEFORE the test attempt, not the value passed in.
  - Tile rendering tests scope locator queries to the tile's own `data-testid`, not the parent grid.
  - For every new test task, the failure mode it catches is documented (e.g., Task 6.5's tests catch the partial-unique-index abort on rename-keeping-email; Task 6.10's catch the leak when push delivers a deferred file).

- [ ] **Tier × domain matrix** — N/A for this app (no surcharge tiers); the analogous matrix here is "every MI-* invariant × every entry-point mode (`cron`/`push`/`manual`/`onboarding_scan`/`asset_recovery`) × every Phase guard". Spot-check: §5.2 phase 1 outcome 2's first-seen-vs-existing branching is covered by Task 6.4's tests; the four-mode UPDATE guards are covered by Task 6.5's tests.

- [ ] **CHECK/enum migration matrix** — covered in Task 2.2 (initial migration includes every CHECK + every partial unique index). Task 8.1 adds the only enum/CHECK addition (idempotency_key NOT NULL). No transitional window — all CHECKs land in the initial migration.

- [ ] **Flag lifecycle table** — every flag the plan touches is wired:
  - `crew_member_auth.revoked_below_version` — written by Tasks 6.5 (universal bump on add), 6.11 (Apply auth side-effects); read by Task 5.2 (validateLinkSession step 5).
  - `app_settings.pending_wizard_session_id` — written by Tasks 10.3, 10.5; read by Tasks 6.4 (wizard purge), 6.11 (wizard CAS).
  - `shows.coi_status` — written by Task 6.5 (Phase 2 `shows` UPDATE); read by Tasks 4.3, 4.8.
  - `shows.diagrams.snapshot_status` — written by Tasks 7.3, 7.4; read by Task 6.3 (asset_recovery routing) and Task 7.8 (GC suppression).

- [ ] **Self-consistency sweep** — grep plan for numeric literals; reconcile:
  - 15-min idle TTL: §7.2 / Task 5.2 / AC-5.6 — consistent.
  - 12-hour absolute TTL: §7.2 / Task 5.2 — consistent.
  - 90-day JWT default: §7.2 / Task 5.1 — consistent.
  - 90-second processing lease: §13.2.3 / Task 8.3 — consistent.
  - 7-day GC grace (active) / 30-day (archived): §6.11 / Task 7.8 — consistent.
  - 10/hr admin / 3/hr crew rate limits: §13.3 / Task 8.3 / AC-8.3 / AC-8.6 — consistent.
  - 60-image diagram cap, 12-case pull-sheet cap, 8-item notes cap, 280-char note truncation: §10 cardinality caps / Tasks 4.9, 4.10, 7.9 — consistent.

After running self-review, fix any issues inline. Then proceed to adversarial review.

# Execution handoff

The plan and spec are saved at:
- Plan: `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/` (see [README.md](README.md))
- Spec: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`

**Two execution paths:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks. Use `superpowers:subagent-driven-development`.

2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.
