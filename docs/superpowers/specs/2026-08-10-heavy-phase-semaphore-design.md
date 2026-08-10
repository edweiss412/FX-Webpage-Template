# Heavy-Phase Concurrency Semaphore — Design

**Date:** 2026-08-10
**Status:** Draft (autonomous /ship-feature arc `feat/heavy-phase-semaphore`)
**Owner surface:** scripts/with-heavy-slot.py (new in this arc), AGENTS.md cross-cutting rule, tests/scripts/withHeavySlot.test.ts (new in this arc)

## 1. Motivation

On 2026-08-10 this machine (18 GB RAM / 12 cores) froze and required a hard reset after
system-wide memory exhaustion: 12 JetsamEvents between 05:11 and 06:11, every one
`vm-compressor-space-shortage`, with the kernel killing core daemons (`trustd`, `secd`,
`amfid`, `ReportCrash` itself). The proximate load was ~9 concurrent autonomous arcs each
free to run a full vitest suite (default worker count = CPU count), playwright e2e with
5 web servers (`playwright.config.ts:231`), mutation harness runs, and `next build`
simultaneously, on top of the 4 GB Docker VM and Chrome. Recovery cost ~2 h of wall clock
across every live arc. No layer imposes machine-wide admission control; each session is
individually well-behaved and collectively lethal.

Contention already taxes ship time today: the mutation-merged-cell arc recorded shard runs
hitting the 3600 s per-shard timeout "under sibling-session load" — an hour added to one
arc by unthrottled siblings. This design makes the crash impossible-by-construction for
wrapped phases while keeping per-arc ship time flat or better (see §6).

## 1.1 Resolved scope — do not relitigate

Each decision below is ratified (user conversation, 2026-08-10, this arc's kickoff) or
probe-settled. Reviewers verify, not re-derive:

- **Python 3 stdlib implementation** (the repo's first `.py`): macOS ships no `flock(1)`,
  Node has no stdlib `flock`, and an mkdir/lockfile scheme reintroduces stale-lock
  cleanup. Ratified under C5+C6. Do not propose a Node port or an npm lock dependency.
- **flock-through-execvp mechanism is probe-verified** (transcript §4.0). Claims that
  the lock does not survive `execvp`, or that SIGKILL leaks it, are refuted by the probe.
- **Priority is best-effort bias, not strict ordering** (C3, §4.4). Non-FIFO,
  non-fair wakeup is a documented limit (§8), not a finding.
- **No enforcement hook** shipping in this arc (§8 last bullet). The AGENTS.md rule is
  the contract, same enforcement tier as the worktree invariant. A PreToolUse
  mechanization is deliberately deferred until non-compliance is measured.
- **Wrapper is a no-op surface for CI** (`FX_HEAVY_DISABLE=1` posture, §3): workflows
  never invoke it; no workflow edits belong to this arc.
- **Slot default = 2** on the 12-core/18 GB origin machine; env-tunable, not adaptive.
  Auto-sizing from RAM is out of scope.

## 2. Constraints (ratified in conversation, 2026-08-10)

- **C1 — No per-arc ship-time increase.** Slots wrap ONLY heavy local phases. Spec/plan
  authoring, codex review dispatch/polling, CI polling, and merges never acquire a slot.
- **C2 — Full-speed holders.** A slot holder is never worker-starved: worker sizing is
  dynamic (cores / holders), and a holder running alone is uncapped.
- **C3 — Nearest-merge priority.** A closeout/CI-stage arc's heavy run jumps ahead of
  round-1 implementation suites (best-effort, see §4.4 — not a strict queue).
- **C4 — Cross-account safe.** All four Claude accounts run as the same macOS user;
  lock state lives in a shared world-visible dir, not under any `CLAUDE_CONFIG_DIR`.
- **C5 — Crash-safe with zero cleanup.** A SIGKILLed or crashed holder releases its slot
  at process death. No stale-lock file can wedge the queue (kernel `flock` semantics).
- **C6 — Zero new dependencies.** macOS ships no `flock(1)` and Node has no built-in
  `flock`; Python 3 (3.12.5 machine-wide) has `fcntl.flock` in stdlib. The wrapper is a
  single-file Python 3 script — the repo's first `.py`, justified by C5+C6 (a Node
  implementation would need a native dep; an mkdir-lock would violate C5).

## 3. Non-goals

- Not a scheduler: no persistent daemon, no queue state, no cross-machine coordination.
- Not CI-facing: GitHub Actions runners are single-tenant; the wrapper is a no-op there
  (and is never invoked by workflows).
- Not a cap on Docker, Chrome, or codex processes — only on phases the repo's own
  tooling launches.
- Not strict FIFO or strict priority: flock wakeup order is kernel-chosen; §4.4 biases
  it, nothing more. Documented limit, not a finding.

## 4. Design

### 4.0 Mechanism probe (run 2026-08-10, macOS 15.7.5, Python 3.12.5)

Probe scripts: a holder that opens a slot file, takes `LOCK_EX|LOCK_NB`, marks the fd
inheritable, and `execvp`s into `sleep 30`; a prober that attempts `LOCK_EX|LOCK_NB`.

```
step1 (holder execvp'd into sleep, expect HELD):
HELD
sleep                 <- ps confirms the holder process image is now `sleep`
step2 (holder SIGKILLed, expect ACQUIRED):
ACQUIRED
```

Both load-bearing claims are measured, not argued: the flock survives `execvp`
(§4.1.5), and SIGKILL of the holder releases the slot with zero cleanup (C5).

### 4.1 Slot mechanism

scripts/with-heavy-slot.py — new in this arc (invoked as `python3 scripts/with-heavy-slot.py [flags] -- <cmd> [args…]`):

1. Ensure slot dir exists: `FX_HEAVY_SLOT_DIR` (default `/tmp/fx-heavy-slots`), mode 0755,
   `os.makedirs(exist_ok=True)`.
2. Slot files `slot-0` … `slot-(N-1)`, N = `FX_HEAVY_SLOTS` (default 2).
3. Acquire loop: for each slot file, `open(…, "a")` then
   `fcntl.flock(fd, LOCK_EX | LOCK_NB)`. First success wins. On success, truncate+write
   holder metadata (`pid`, `argv`, ISO timestamp, `FX_HEAVY_PRIORITY` flag) for
   diagnostics — content is advisory; the LOCK is the only truth.
4. If all slots are held: sleep `FX_HEAVY_POLL_MS` (default 3000 ms normal, 1000 ms when
   `FX_HEAVY_PRIORITY=1`) with ±20% jitter, retry. Emit one line to stderr on first wait
   and every `FX_HEAVY_WAIT_WARN_S` (default 300 s) thereafter, naming holder PIDs from
   slot-file metadata.
5. On acquire: compute worker sizing (§4.3), set env, `os.set_inheritable(fd, True)`,
   then `os.execvp(cmd, args)` — the wrapper process BECOMES the heavy command. The flock
   fd rides through exec; the kernel releases it when the last process holding the fd
   exits. Crash of the holder (any signal, including SIGKILL) = immediate release. This
   is C5 with zero cleanup code.

Exit code, signals, stdio: fully transparent — `execvp` means the caller sees the heavy
command's exit status directly; no forwarding logic exists to get wrong.

### 4.2 Holder-descendant lifetime (documented limit)

Children of the heavy command inherit the locked fd (deliberately — vitest fork workers
dying with the suite is the common case). A descendant that OUTLIVES the command keeps
the slot held: concretely, a playwright `webServer` with `reuseExistingServer: true`
(`playwright.config.ts:265`) left running holds the slot. Mitigation: the §4.1.4 wait
warning names holder PIDs, so a wedged slot is diagnosable in one `ps`. Accepted limit —
auto-breaking a lock would reintroduce the stale-lock class C5 exists to kill. The
AGENTS.md rule (§5) tells sessions that pre-warmed long-lived dev servers must be started
OUTSIDE the wrapper (they are not a heavy phase; the suite hitting them is).

### 4.3 Worker sizing (C2)

After acquiring slot *i*, count currently-held slots by non-blocking probe of the other
slot files (`LOCK_EX|LOCK_NB` then immediate unlock on success — a probe never retains a
lock; a failed probe means "held"). Let `H` = held count including self, `cores` =
`os.cpu_count()`:

- `H == 1`: export nothing — uncapped, full machine (C2's "alone = full speed").
- `H >= 2`: export `VITEST_MAX_WORKERS = max(3, cores // H)` — verified live against
  the installed vitest 4.1.5: `rg VITEST_MAX_WORKERS node_modules/vitest/dist/` hits
  `resolved.maxWorkers = Number.parseInt(process.env.VITEST_MAX_WORKERS)` (chunk
  filenames are build-hashed; anchor by the grep, not the chunk name). Existing serial-project
  semantics are unaffected: the serial vitest project pins `fileParallelism: false`
  (`vitest.config.ts:110`) and the runtime hygiene assertion
  (`tests/cross-cutting/db-test-connection-hygiene.test.ts:148-161`) pins serial
  `maxWorkers === 1`, which `max(3, …)` can never lower. An explicit
  `VITEST_MAX_WORKERS` already set by the caller is respected (wrapper never overwrites
  a caller-provided value).

Playwright needs no cap: `workers: 1` at `playwright.config.ts:49` and
`tests/e2e/standalone.config.ts:89`.

The probe→export window is racy (a second holder may acquire between probe and exec).
Accepted: the failure mode is one run sized for fewer co-holders than exist — the
pre-semaphore status quo, bounded to the race window, self-correcting on the next
acquisition. Documented limit.

### 4.4 Priority (C3, best-effort)

`FX_HEAVY_PRIORITY=1` (set by arcs in closeout/CI stage per the AGENTS.md rule):

- Priority waiters poll 3× faster (§4.1.4), so on a slot release they statistically win
  the race.
- Each waiter touches a marker `prio-wait-<pid>` (priority) in the slot dir while
  waiting, removed on acquire or exit (`atexit` + best-effort; stale markers ignore
  after 10 min mtime). Non-priority waiters that see a fresh priority marker add one
  extra poll interval before each attempt, yielding the next free slot to the priority
  waiter with high probability.
- No lock handoff, no queue file, no strict ordering guarantee. A starved normal waiter
  still acquires as soon as no fresh priority marker exists.

### 4.5 Knobs

| Env | Default | Meaning |
| --- | --- | --- |
| `FX_HEAVY_SLOT_DIR` | `/tmp/fx-heavy-slots` | lock-state dir (tests point this at a tmpdir) |
| `FX_HEAVY_SLOTS` | `2` | machine-wide heavy slots |
| `FX_HEAVY_PRIORITY` | unset | `1` = nearest-merge priority waiter |
| `FX_HEAVY_POLL_MS` | `3000` / `1000` (prio) | wait-poll interval, ±20% jitter |
| `FX_HEAVY_WAIT_WARN_S` | `300` | repeat-warning cadence while waiting |
| `FX_HEAVY_DISABLE` | unset | `1` = exec the command directly, no locking (escape hatch; also the CI posture) |

All knobs are read once at startup. Invalid numeric values fall back to defaults with a
stderr warning (never a crash — the wrapper failing must not block a gate run).

Flag form: the only flags are `--priority` (equivalent to `FX_HEAVY_PRIORITY=1`) and the
mandatory `--` separator before the command. Everything else is env-only, keeping the
wrapper's argv surface trivially parseable.

### 4.6 What must be wrapped (the AGENTS.md rule, summarized)

MUST acquire a slot (via `pnpm heavy -- <cmd>` or direct wrapper invocation):

- Full-suite vitest: `pnpm test`, `pnpm test:fast`, or any `vitest run` not scoped to an
  explicit file list.
- Any `pnpm test:e2e*` playwright run.
- Mutation harness: `pnpm mutation:guards` and any `--project mutation` run; harness
  shard batches count one slot per concurrently-running batch.
- `pnpm build` (Turbopack peak RSS is heavy-phase sized).

MUST NOT be wrapped: scoped vitest runs with an explicit file list, `tsc`/typecheck,
eslint, `format:check`, codex dispatches, CI polling, git/gh operations, spec/plan
authoring, long-lived pre-warmed dev servers (§4.2).

A `package.json` convenience script `"heavy": "python3 scripts/with-heavy-slot.py --"`
makes the invocation `pnpm heavy pnpm test` (pnpm forwards trailing args after the
script's own `--`).

## 5. AGENTS.md rule (new cross-cutting bullet, appended at AGENTS.md:241)

One bullet in "Cross-cutting discipline": states the mechanism, the MUST/MUST-NOT lists
from §4.6, the `FX_HEAVY_PRIORITY=1` closeout convention, the §4.2 dev-server
instruction, and cites this spec. Wording lands in the plan; the bullet is the durable
cross-CLI contract (Codex sessions read AGENTS.md, not this spec).

## 6. Why this cannot increase per-arc ship time (C1 argument)

- A slot is only contended when ≥3 heavy phases would otherwise run concurrently — the
  regime where, measured this morning, suites ran at a fraction of speed and shards blew
  a 3600 s timeout. Serial-at-full-speed beats parallel-at-thrash-speed on wall clock.
- Phases that dominate arc latency (review rounds, CI, merge polling) never wait.
- A holder is never slowed: uncapped alone (§4.3), and at `H=2` each gets `cores/2`
  workers of a machine that is not swapping.
- The crash alternative charged every live arc ~2 h. Amortized, admission control is the
  fast path.

## 7. Testing

tests/scripts/withHeavySlot.test.ts — new in this arc (vitest, collected by `BASE_INCLUDE`
`vitest.projects.ts:34`; no DB, no env-bound gating). All cases run against
`FX_HEAVY_SLOT_DIR=<per-test tmpdir>` and `FX_HEAVY_SLOTS=1..2`, poll interval floored
via `FX_HEAVY_POLL_MS=50` — never the real `/tmp/fx-heavy-slots`.

1. **Mutual exclusion (premise-carrying).** Slots=1: two wrapped `node -e` children each
   append `start`/`end` + timestamp to a shared log. Assert intervals do NOT overlap
   AND that the fixture would detect overlap (run the same two commands unwrapped,
   assert overlap occurs — the premise probe that proves the test can see the
   difference; guards-state-their-premise rule).
2. **Crash release.** Slots=1: SIGKILL the first wrapped process mid-run; assert a
   second wrapped command acquires within one poll interval (no manual cleanup between).
3. **Exit-code and argv transparency.** Wrapped `node -e "process.exit(7)"` exits 7;
   argv with spaces/quotes arrives intact (child echoes `process.argv` to a file).
4. **Worker sizing.** Slots=2 with slot-0 pre-held by the test (a held `flock` the test
   owns): wrapped child asserts `process.env.VITEST_MAX_WORKERS === String(Math.max(3, Math.floor(cores/2)))`.
   With no co-holder: asserts the var is unset. With caller-set `VITEST_MAX_WORKERS=5`:
   asserts it survives as `5`.
5. **Priority bias.** Slots=1 held; one normal + one priority waiter started together
   (deterministic intervals: normal `FX_HEAVY_POLL_MS=400`, priority 100); on release,
   assert the priority waiter acquired first. Timing-based — mark `.retry(2)` and keep
   intervals ≥4× apart so the bias is structural, not a coin flip.
6. **Disable hatch.** `FX_HEAVY_DISABLE=1`: two slots=1 commands overlap (no locking),
   proving the hatch bypasses cleanly.

The suite spawns ≤2 tiny node children per case — it is itself light and needs no slot.

## 8. Documented limits (pre-filed; not findings)

- Descendant-held slots (§4.2). Surfaced via wait-warning with PIDs.
- Probe→exec sizing race (§4.3). Self-correcting, bounded, status-quo fallback.
- Priority is bias, not ordering (§4.4). A determined normal waiter is not starved.
- `/tmp` clears on reboot — by design (locks are runtime state; kernel released them at
  death anyway).
- Sessions that simply ignore the AGENTS.md rule are not stopped by any mechanism here;
  enforcement is the rule + review culture, same tier as the worktree invariant. A
  PreToolUse hook could mechanize it later; out of scope (YAGNI until measured).

## 9. Threat model / review fence

Defends against: accidental concurrent heavy phases launched by cooperating,
rule-following agent sessions on one machine. Out of scope: adversarial processes,
sessions that bypass the wrapper, non-repo workloads (Chrome, Docker itself). Findings
against out-of-scope actors file to §8, not to review rounds.
