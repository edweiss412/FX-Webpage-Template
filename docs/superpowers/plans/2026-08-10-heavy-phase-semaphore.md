# Plan — Heavy-Phase Concurrency Semaphore

**Spec:** `docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md` — CANONICAL for every mechanism, stderr-contract line, knob domain, and §7 test-case body. Tasks below cite cases by number and do NOT restate their arms; where task text and spec disagree, the spec wins. Spec APPROVED at R13, zero findings (13 counted rounds).
**Branch:** `feat/heavy-phase-semaphore` · **Implementer:** Opus / Claude Code (dedicated pane; spec+plan authored by the Fable session per user routing instruction 2026-08-10)
**Adversarial reviewer:** Codex via codex-guard

## Pre-draft verification transcript (writing-plans mandate)

- Root package.json scripts verified 2026-08-10 (lines 48/49/54/55/62/46-47): `test` = `vitest run`, `test:fast`, `mutation:guards`, `test:e2e`, `test:e2e:ui`, `screenshot:gallery`, `screenshot:help` — the spec §4.6 shapes.
- vitest 4.1.5: `VITEST_MAX_WORKERS` env OVERRIDES the serial `fileParallelism:false → maxWorkers=1` resolution (spec §4.0 P4) — the reason the plan contains NO worker-sizing task.
- Node spawn fd non-inheritance reproduced locally (spec §4.0 P3); flock-through-execvp + SIGKILL release probed (spec §4.0 P1/P2).
- `vitest.projects.ts:34` `BASE_INCLUDE` collects tests/scripts/withHeavySlot.test.ts (new in this arc) with zero wiring.
- `scripts/with-admin-dev-flag.mjs:216-220` — inner build lock is WORKTREE-LOCAL (`ROOT = process.cwd()`, R2 F1 probe); builds are IN the wrapped set (spec §1.1, fenced).
- Transitive-shape members verified live (R10 F1): `tests/admin/build-artifact-gate.test.ts:73` spawns `pnpm build`; `scripts/share-link-flash-adversary-matrix.mjs:1014` spawns playwright.
- `tests/docs/_metaAgentsMarkerContract.test.ts` pins invariant-12 prose only — an appended cross-cutting bullet cannot trip it.
- Python 3.12.5 machine-wide.

## Meta-test inventory (mandatory declaration)

- CREATES: none. EXTENDS: none. No Supabase call boundary, advisory lock, admin alert, or tile surface is touched. Executable proof for the wrapper is its own process-spawning suite (spec §7). `tests/docs/_metaInvariant8Closeout.test.ts` satisfied by the §12 marker below; `tests/docs/specsReadmeIndexParity.test.ts` green at spec commit (root-level spec, no row required — verified by running it).
- Mutation-family closure: N/A — Python CLI, process-lifecycle defect class; the source-mutation registry overlays vitest-imported TS modules and cannot express it (step3-a11y precedent, spec §1.1). Defect classes are the spec §7 case list; a reviewer-proposed NEW class needs a live demonstration against the shipped wrapper.

## e2e harness-readiness: N/A — no Playwright attached; all tests are vitest + child_process.

Shared test scaffolding (anti-tautology): every case builds its OWN `mkdtemp` slot dir via `FX_HEAVY_SLOT_DIR`; helper `runWrapped(env, argv)` spawns `python3 scripts/with-heavy-slot.py`; assertions read child-written artifact files and the SPEC-CONTRACTED stderr lines (spec §4.5 runtime stderr contract), never incidental output. Timing bounds derive from the case's own `FX_HEAVY_POLL_MS`; `FX_HEAVY_JITTER_PCT=0` wherever determinism is asserted. Each snippet typechecked against strict tsconfig before plan dispatch.

## Acceptance criteria (each AC delegates its full arm inventory to the named spec §7 case — the spec is canonical)

- **AC-1** — spec §7 case 1: premise-carrying mutual exclusion.
- **AC-2** — spec §7 case 2: crash releases the slot within the jitter-aware bound.
- **AC-3** — spec §7 case 3: exit-code and argv transparency.
- **AC-4** — spec §7 case 4: descendant lock-lifetime pin.
- **AC-5** — spec §7 case 5, all four arms: ordering, yielding notice, per-poll refresh, declared-cadence freshness.
- **AC-6** — spec §7 case 6: disable hatch.
- **AC-7** — spec §7 case 7: metadata surfacing + secret absence.
- **AC-8** — spec §7 case 8: full knob-domain matrix incl. env-side 65 and accepted 64.
- **AC-9** — spec §7 case 9: slot-count consistency, exactly-one-creator discriminators.
- **AC-10** — spec §7 case 10: pnpm forwarding.
- **AC-11** — spec §7 case 11, both arms: resize-race containment on the injection hook.
- **AC-12** — spec §7 case 12, both arms: nested pass-through + stale-marker recovery.
- **AC-13** — spec §7 case 13, all five arms: recreate discipline.
- **AC-14** — closeout postconditions: full local gates green (wrapper dogfooded), whole-diff review APPROVE, real CI green, merged, ff-synced 0 0.

<!-- tasks: depth=2 -->

## Task 1 — wrapper core: mutual exclusion, crash release, transparency

<!-- task: red=`pnpm vitest run tests/scripts/withHeavySlot.test.ts` ac=AC-1,AC-2,AC-3 -->

RED: create tests/scripts/withHeavySlot.test.ts implementing spec §7 cases 1-3 exactly as specified (premise-carrying overlap oracle, jitter-aware crash-release bound, exit-code/argv transparency). Fails: scripts/with-heavy-slot.py does not exist.

GREEN: implement the §4.1 acquisition path for the single-generation happy case — steps 1-8 EXCEPT the §4.5 consistency/recreate machinery (Task 3) and priority (Task 4): dir bootstrap, SH attempt bracket on recreate.lock (NB-first + waiting line), config create/adopt with contracted stderr lines, acquire scan, metadata write (basename+argc only), wait loop with warn cadence, post-acquire validation, `acquired slot-<i>` line, `os.set_inheritable` + `os.execvp`. Stdlib only.

Commit: `feat(infra): heavy-phase slot wrapper core (mutual exclusion, crash-safe)`

## Task 2 — lock-lifetime pin, disable hatch, diagnostics, knob domains

<!-- task: red=`pnpm vitest run tests/scripts/withHeavySlot.test.ts` ac=AC-4,AC-6,AC-7,AC-8 -->

RED: add spec §7 cases 4, 6, 7, 8 (all arms, incl. the secret-absence sentinel and the full knob-domain matrix).

GREEN: implement `FX_HEAVY_DISABLE` direct-exec, O_RDONLY metadata read + `holder unknown (metadata unreadable)` branch, and every §4.5 knob accept-set (warn-and-default numerics incl. `FX_HEAVY_JITTER_PCT`; warn-on-set-but-not-1 booleans).

Commit: `feat(infra): heavy-slot lifetime pin, disable hatch, holder diagnostics, knob domains`

## Task 3 — topology: consistency, validation, recreate

<!-- task: red=`pnpm vitest run tests/scripts/withHeavySlot.test.ts` ac=AC-9,AC-11,AC-13 -->

RED: add spec §7 cases 9 (both arms + discriminators), 11 (both arms on the injection hook), and 13 (all five arms: holder, serialization-premise, swap-window, crash+residue-convergence, domain).

GREEN: implement the full §4.5 machinery — atomic tmp+`os.link` first-boot publication (both-sides tmp unlink, exactly-one-creator), per-poll re-resolve, §4.1.7 identity+index validation with release/restart, `--recreate` (EX NB-first with waiting lines; glob slot enumeration with per-slot NB-first waits, identity re-validation; atomic `os.replace` swap; >=newN unlink incl. residue; `swap begin/end` lines; `--slots` [1,64] management posture), and both `FX_HEAVY_TEST_HOLD_OPEN_MS` injection sites.

Commit: `feat(infra): heavy-slot topology consistency, post-acquire validation, recreate`

## Task 4 — priority bias and reentrancy

<!-- task: red=`pnpm vitest run tests/scripts/withHeavySlot.test.ts` ac=AC-5,AC-12 -->

RED: add spec §7 cases 5 (all four arms: ordering, yielding notice, per-poll refresh, declared-cadence freshness) and 12 (live + stale marker arms).

GREEN: implement §4.4 (markers carrying pid + declared poll interval; per-poll `os.utime` refresh; declared-cadence freshness window with `cadence unknown` surfacing; back-off + yielding notice; `--priority`/`FX_HEAVY_PRIORITY`) and the §4.1 validated `FX_HEAVY_SLOT_HELD=<slot-path>:<pid>` reentrancy (three-check validation; strip + acquire on staleness).

Commit: `feat(infra): heavy-slot priority bias and outermost-owns reentrancy`

## Task 5 — pnpm entry point + AGENTS.md rule

<!-- task: red=`pnpm vitest run tests/scripts/withHeavySlot.test.ts` ac=AC-10 -->

RED: add spec §7 case 10 (fails: no `heavy` script in package.json).

GREEN: add `"heavy": "python3 scripts/with-heavy-slot.py --"` to root package.json; append the AGENTS.md cross-cutting bullet per spec §5 — mechanism, §4.6 MUST/MUST-NOT shapes INCLUDING the transitive-shape rule and its two named members, FX_HEAVY_PRIORITY closeout convention, never-set-FX_HEAVY_SLOT_DIR rule, dev-server instruction, --recreate-only capacity changes, spec citation.

Gates in this task: `pnpm exec vitest run tests/docs/` green (AGENTS.md meta-tests see the edit).

Commit: `feat(infra): pnpm heavy entry point + AGENTS.md heavy-phase rule`

## Task 6 — closeout

<!-- task: red=`bash -c "git log origin/main..HEAD --oneline | grep -q 'AGENTS.md heavy-phase rule'"` ac=AC-14 -->

(Gate-command validity: probed against constructed failing state — exits 1 on a branch without Task 5's commit, 0 after; anchors ordering, not a test file.)

- Full local gates, wrapper dogfooded: `pnpm heavy pnpm test`, `pnpm typecheck` (vitest AND playwright tsconfigs), `pnpm exec eslint .`, `pnpm format:check`.
- Whole-diff codex-guard review (stage diff) to APPROVE; push; PR; real CI green (`gh pr checks --required`); `gh pr merge --merge` same turn; ff-sync `0 0`; Stage 4.4 (pane+agent labels cleared, nudge CronDelete).
- Ledger: no BL-/DEF- rows exist for this arc — nothing to mark or archive.
- Round-economy filing: extend `docs/review-rounds/feat/heavy-phase-semaphore/4a3be8baed76.md` with the final spec round count and any plan/diff sections the thresholds require.

<!-- tasks: end -->

## 12. Invariant-8 closeout

impeccable-gate: N/A — no UI surface
