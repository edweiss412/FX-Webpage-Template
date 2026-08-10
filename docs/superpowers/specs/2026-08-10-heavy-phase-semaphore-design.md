# Heavy-Phase Concurrency Semaphore — Design

**Date:** 2026-08-10 (R1 repairs applied same day)
**Status:** Draft (autonomous /ship-feature arc `feat/heavy-phase-semaphore`)
**Owner surface:** scripts/with-heavy-slot.py (new in this arc), AGENTS.md cross-cutting rule, tests/scripts/withHeavySlot.test.ts (new in this arc)

## 1. Motivation

On 2026-08-10 this machine (18 GB RAM / 12 cores) froze and required a hard reset after
system-wide memory exhaustion: 12 JetsamEvents between 05:11 and 06:11, every one
`vm-compressor-space-shortage`, with the kernel killing core daemons (`trustd`, `secd`,
`amfid`, `ReportCrash` itself). The proximate load was ~9 concurrent autonomous arcs each
free to run a full vitest suite (default worker count = CPU count), playwright e2e with
5 web servers (`playwright.config.ts:231`), mutation harness runs, and screenshot
captures simultaneously, on top of the 4 GB Docker VM and Chrome. Recovery cost ~2 h of
wall clock across every live arc. No layer imposes machine-wide admission control over
suite-shaped work; each session is individually well-behaved and collectively lethal.
(Builds are the exception: `scripts/with-admin-dev-flag.mjs:216-220` already serializes
ALL builds machine-wide behind a lock — see §4.6.)

Contention already taxes ship time today: the mutation-merged-cell arc recorded shard runs
hitting the 3600 s per-shard timeout "under sibling-session load" — an hour added to one
arc by unthrottled siblings. This design makes the crash-shaped overload structurally
bounded for wrapped phases while keeping per-arc ship time flat or better (see §6).

## 1.1 Resolved scope — do not relitigate

Each decision below is ratified (user conversation 2026-08-10, this arc's kickoff) or
probe-settled (§4.0), including R1-driven reversals. Reviewers verify, not re-derive:

- **Python 3 stdlib implementation** (the repo's first `.py`): macOS ships no `flock(1)`,
  Node has no stdlib `flock`, and an mkdir/lockfile scheme reintroduces stale-lock
  cleanup. Ratified under C5+C6. Do not propose a Node port or an npm lock dependency.
- **flock-through-execvp mechanism is probe-verified** (§4.0 P1/P2). Claims that the lock
  does not survive `execvp`, or that SIGKILL of the holder leaks it, must refute the probe.
- **Node `child_process.spawn` children do NOT inherit the slot fd** (§4.0 P3, R1 F1).
  Lock lifetime is defined by the measured semantics in §4.2 — both failure directions
  are documented limits there, not findings.
- **Worker capping is REMOVED from this design** (R1 F2/F3 reversal, fenced both
  directions): the wrapper never exports `VITEST_MAX_WORKERS` or any worker knob,
  because vitest 4.1.5 applies the env var AFTER the `fileParallelism:false →
  maxWorkers=1` serial resolution (probe §4.0 P4), so any export would break the serial
  project's pinned `maxWorkers === 1`
  (`tests/cross-cutting/db-test-connection-hygiene.test.ts:148-161`). Aggregate load is
  bounded by slot count alone; holders always run with an untouched environment (C2 is
  satisfied trivially). Do not propose re-adding sizing in either direction.
- **Builds are OUT of the wrapped set** (R1 F6 reversal, fenced): `pnpm build` and
  direct `next build` already serialize machine-wide behind the lock in
  `scripts/with-admin-dev-flag.mjs:216-220`; wrapping them would park an idle waiter in
  a heavy slot. Do not propose wrapping builds, and do not propose removing the existing
  build lock.
- **Priority is best-effort bias, not strict ordering** (C3, §4.4). Non-FIFO, non-fair
  wakeup is a documented limit (§8), not a finding.
- **No enforcement hook** ships in this arc (§8). The AGENTS.md rule is the contract, at
  the cross-cutting-discipline tier (R1 F10: this spec previously claimed
  worktree-invariant tier; the claim is corrected, not the placement).
- **CI never invokes the wrapper**; no workflow edits in this arc.
- **Slot default = 2** on the 12-core/18 GB origin machine; env-tunable via the §4.5
  consistency protocol, not RAM-adaptive.

## 2. Constraints (ratified in conversation, 2026-08-10)

- **C1 — No per-arc ship-time increase.** Slots wrap ONLY heavy local phases. Spec/plan
  authoring, codex review dispatch/polling, CI polling, and merges never acquire a slot.
- **C2 — Full-speed holders.** A slot holder is never worker-starved. (Satisfied
  structurally: the wrapper modifies nothing about the command's environment or flags.)
- **C3 — Nearest-merge priority.** A closeout/CI-stage arc's heavy run jumps ahead of
  round-1 implementation suites (best-effort, §4.4 — not a strict queue).
- **C4 — Cross-account safe.** All four Claude accounts run as the same macOS user;
  lock state lives in a shared world-visible dir, not under any `CLAUDE_CONFIG_DIR`.
- **C5 — Crash-safe with zero cleanup.** A SIGKILLed or crashed holder releases its slot
  at process death. No stale-lock file can wedge the queue (kernel `flock` semantics).
- **C6 — Zero new dependencies.** Python 3 stdlib only (3.12.5 machine-wide).

## 3. Non-goals

- Not a scheduler: no persistent daemon, no queue state, no cross-machine coordination.
- Not CI-facing: GitHub Actions runners are single-tenant; the wrapper is never invoked
  by workflows.
- Not a cap on Docker, Chrome, codex processes, or builds (§4.6) — only on suite-shaped
  phases the repo's own tooling launches.
- Not strict FIFO or strict priority: flock wakeup order is kernel-chosen; §4.4 biases
  it, nothing more.

## 4. Design

### 4.0 Mechanism probes (run 2026-08-10, macOS 15.7.5, Python 3.12.5, Node 22 / vitest 4.1.5)

- **P1 — flock survives execvp.** Holder opens a slot file, takes `LOCK_EX|LOCK_NB` on
  the raw fd, marks it inheritable, `execvp`s into `sleep 30`; prober attempts
  `LOCK_EX|LOCK_NB`:

  ```
  step1 (holder execvp'd into sleep, expect HELD):
  HELD
  sleep                 <- ps confirms the holder process image is now `sleep`
  ```

- **P2 — SIGKILL releases with zero cleanup** (same run):

  ```
  step2 (holder SIGKILLed, expect ACQUIRED):
  ACQUIRED
  ```

- **P3 — Node spawn children do NOT inherit extra fds** (R1 reviewer probe, reproduced):
  a Node process handed fd 3 sees it (`node fd3: true`), but its
  `child_process.spawnSync("sh", ["-c", "test -e /dev/fd/3"])` child does not (exit 1).
  Default `stdio` gives spawn children ONLY stdin/stdout/stderr. Consequence: vitest
  fork workers and playwright web servers spawned by a Node runner do not hold the
  flock; §4.2 defines lock lifetime accordingly.

- **P4 — `VITEST_MAX_WORKERS` overrides the serial resolution** (R1 reviewer probe,
  confirmed against the installed vitest 4.1.5 dist): the config resolver first applies
  `fileParallelism:false → resolved.maxWorkers = 1`, then LATER overwrites
  `resolved.maxWorkers` from `process.env.VITEST_MAX_WORKERS` when set. Exporting the
  var therefore raises the serial DB project above one worker. This probe is why worker
  capping is removed (§1.1).

### 4.1 Slot mechanism

scripts/with-heavy-slot.py — new in this arc (invoked as `python3 scripts/with-heavy-slot.py [--priority] -- <cmd> [args…]`):

1. Ensure slot dir exists: `FX_HEAVY_SLOT_DIR` (default `/tmp/fx-heavy-slots`), mode
   0755, `os.makedirs(exist_ok=True)`.
2. Resolve slot count N via the §4.5 consistency protocol (dir-recorded value wins).
3. Acquire loop, all raw-fd API (R1 F4): for each slot index,
   `fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)` then
   `fcntl.flock(fd, LOCK_EX | LOCK_NB)`. First success wins. A LOSING fd is
   `os.close`d immediately before trying the next slot (R1 F4 lifecycle note). There
   are no probe fds anywhere in the design (sizing is removed).
4. On success, write holder metadata with unbuffered raw-fd calls (R1 F5):
   `os.ftruncate(fd, 0)` then a single `os.write(fd, …)` of one JSON line
   (`pid`, `argv`, ISO timestamp from the shell clock, priority flag). `os.write` is a
   direct syscall — nothing to flush across `exec`.
5. If all slots are held: sleep `FX_HEAVY_POLL_MS` (default 3000 ms normal, 1000 ms when
   priority) with ±20% jitter, retry. On first wait and every `FX_HEAVY_WAIT_WARN_S`
   (default 300 s) thereafter, emit one stderr line naming each slot's recorded holder
   metadata, read via a SEPARATE `os.open(path, O_RDONLY)` fd closed after reading
   (never the locking fd). A slot whose metadata is empty, torn, or unparseable is
   reported as `holder unknown (metadata unreadable)` — imprecise-but-surfaced is the
   §8 documented limit; silent omission is not permitted (R1 F5). The warning also
   states that a recorded PID may have exited while a shell descendant retains the
   lock (§4.2).
6. On acquire: `os.set_inheritable(fd, True)` (raw integer fd — valid per the
   `os.open` API), then `os.execvp(cmd, args)` — the wrapper process BECOMES the heavy
   command. The flock fd rides through exec; the kernel releases it when the last
   process holding the fd exits. Crash of the holder (any signal, including SIGKILL) =
   immediate release (§4.0 P2). Zero cleanup code (C5).

Exit code, signals, stdio: fully transparent — `execvp` means the caller sees the heavy
command's exit status directly; no forwarding logic exists to get wrong. The command's
environment is untouched (C2).

### 4.2 Lock lifetime — measured semantics and both failure directions

The slot is held by the exec'd top-level process and any descendant that inherits the
fd. Which descendants inherit is measured, not assumed (§4.0 P3):

- **Shell layers inherit** (`sh -c`, pnpm's shell wrappers): plain fork/exec preserves
  open fds. The lock therefore survives the `pnpm → sh → node` chain down to the
  top-level Node runner.
- **Node `child_process` children do NOT inherit** (default stdio closes extra fds):
  vitest fork workers, playwright-spawned web servers, and any helper the runner spawns
  hold nothing.

Two failure directions follow, both documented limits (§8), both surfaced:

- **Early release (over-admission):** if the top-level runner dies while its spawned
  heavy children survive it, the slot frees while work continues. Bounded in practice:
  interactive kills and crashes hit the whole process group, and orphaned vitest/
  playwright children are defects in their own right. The §4.6 rule keeps long-lived
  processes out of wrapped commands, which removes the deliberate version of this case.
- **Retention (wedge):** a shell-layer descendant that outlives the command keeps the
  slot held. Surfaced by the §4.1.5 wait warning (holder metadata + the
  may-have-exited caveat). Deliberately NOT auto-broken — breaking a live lock
  reintroduces the stale-lock class C5 exists to kill.

### 4.3 Worker sizing — removed

There is no worker sizing in this design. Rationale and fence: §1.1 (R1 F2/F3, probe
§4.0 P4). The wrapper's only lever is admission; a holder's command runs exactly as it
would unwrapped.

### 4.4 Priority (C3, best-effort)

`--priority` flag or `FX_HEAVY_PRIORITY=1` (set by arcs in closeout/CI stage per the
AGENTS.md rule):

- Priority waiters poll faster (§4.1.5 defaults), so on a release they statistically
  win the race.
- Each priority waiter touches a marker `prio-wait-<pid>` in the slot dir while
  waiting, removed on acquire and on normal exit (`atexit`, best-effort); markers with
  mtime older than 10 min are ignored (a crashed waiter must not throttle others).
  Non-priority waiters that see a fresh priority marker add one extra poll interval
  before each attempt, yielding the next free slot to the priority waiter with high
  probability.
- No lock handoff, no queue file, no strict ordering guarantee. A starved normal waiter
  still acquires as soon as no fresh priority marker exists.
- Discriminability requirement for §7: the marker back-off must be observable
  INDEPENDENTLY of the faster poll rate — the priority test pins the marker mechanism
  with both waiters at EQUAL poll intervals (R1 F8).

### 4.5 Knobs and the consistency protocol

| Env | Default | Meaning |
| --- | --- | --- |
| `FX_HEAVY_SLOT_DIR` | `/tmp/fx-heavy-slots` | lock-state dir. Tests point this at a tmpdir. Production sessions NEVER set it (AGENTS.md rule) — two dirs are two independent semaphores, undetectable by design (§8). |
| `FX_HEAVY_SLOTS` | `2` | DESIRED slot count; subject to the consistency protocol below. |
| `FX_HEAVY_PRIORITY` | unset | `1` = nearest-merge priority waiter (equivalent to `--priority`). |
| `FX_HEAVY_POLL_MS` | `3000` / `1000` (prio) | wait-poll interval, ±20% jitter. |
| `FX_HEAVY_WAIT_WARN_S` | `300` | repeat-warning cadence while waiting. |
| `FX_HEAVY_DISABLE` | unset | `1` = exec the command directly, no locking (escape hatch; also the CI posture). |

**Slot-count consistency (R1 F9):** the first wrapper invocation to create the slot dir
writes `config` (one JSON line: `{"slots": N}`) into it. Every later invocation reads
`config`; if its own `FX_HEAVY_SLOTS` differs from the recorded value, it emits a
one-line stderr warning and ADOPTS the recorded value — the dir's topology wins, so
mixed-config sessions can never disagree about capacity (the fork R1 F9 describes).
Changing capacity is explicit: remove the slot dir (or reboot — `/tmp` clears) while no
holder is live; the warning text says exactly that. A missing/torn `config` in an
existing dir is repaired by the next invocation writing its own value (surfaced by the
same warning path).

All knobs are read once at startup. Invalid numeric values fall back to defaults with a
stderr warning (never a crash — the wrapper failing must not block a gate run).

### 4.6 What must be wrapped (the AGENTS.md rule, summarized)

MUST acquire a slot (via `pnpm heavy -- <cmd>` or direct wrapper invocation), phrased by
invocation shape, not alias (R1 F7):

- Any full-suite vitest run — `pnpm test`, `pnpm test:fast`, or any `vitest run` /
  `pnpm exec vitest run` not scoped to an explicit file list.
- Any non-interactive playwright run — every `pnpm test:e2e*` EXCEPT `test:e2e:ui`
  (below), any direct `playwright test`, and the screenshot captures
  `pnpm screenshot:gallery` / `pnpm screenshot:help` (their config runs an inner
  8192 MB build, `playwright.screenshots.config.ts:128`).
- Mutation harness: `pnpm mutation:guards`, any `--project mutation` run; one slot per
  concurrently-running shard batch.

MUST NOT be wrapped:

- Builds — `pnpm build` and direct `next build` (already machine-serialized by
  `scripts/with-admin-dev-flag.mjs:216-220`; wrapping parks an idle waiter in a slot,
  R1 F6).
- `pnpm test:e2e:ui` (root package.json line 62) — interactive and unbounded-lived; a slot held
  indefinitely violates C1. Run it unwrapped and sparingly.
- Scoped vitest runs with an explicit file list, typecheck, eslint, `format:check`,
  codex dispatches, CI polling, git/gh operations, spec/plan authoring.
- Long-lived pre-warmed dev servers (§4.2 early-release direction): start them OUTSIDE
  the wrapper; the suite hitting them is the heavy phase, not the server.

A package.json convenience script `"heavy": "python3 scripts/with-heavy-slot.py --"`
makes the invocation `pnpm heavy pnpm test` (pnpm appends run-script args; the Task-4
test pins the forwarding executably).

## 5. AGENTS.md rule (new cross-cutting bullet, appended after the current last bullet of "Cross-cutting discipline")

One bullet stating: the mechanism, the MUST/MUST-NOT shapes from §4.6, the
`FX_HEAVY_PRIORITY=1` closeout convention, the never-set-`FX_HEAVY_SLOT_DIR` rule, the
dev-server instruction, and a citation of this spec. The bullet lives at — and claims —
the cross-cutting-discipline tier (R1 F10): cite-and-apply discipline, not a plan-wide
invariant. Codex sessions read AGENTS.md, not this spec; the bullet is the durable
cross-CLI contract.

## 6. Why this cannot increase per-arc ship time (C1 argument)

- A slot is only contended when ≥3 wrapped heavy phases overlap — the regime where,
  measured this morning, suites ran at a fraction of speed and shards blew a 3600 s
  timeout. Serial-at-full-speed beats parallel-at-thrash-speed on wall clock in that
  regime. (For 3 phases that would have co-run acceptably, the queued phase pays a
  bounded wait; the C1 claim is about the phases that dominate arc latency, next
  bullet — not that no command ever waits.)
- Phases that dominate arc latency (review rounds, CI, merge polling) never wait.
- A holder is never slowed: the wrapper adds no caps, no env changes, no flags (C2).
- Builds keep their existing dedicated serialization and never consume a slot (§4.6).
- The crash alternative charged every live arc ~2 h. Amortized, admission control is
  the fast path.

## 7. Testing

tests/scripts/withHeavySlot.test.ts — new in this arc (vitest, collected by
`BASE_INCLUDE` `vitest.projects.ts:34`; no DB, no env-bound gating). All cases run
against `FX_HEAVY_SLOT_DIR=<per-test mkdtemp>` and small `FX_HEAVY_POLL_MS` — never the
real `/tmp/fx-heavy-slots`.

1. **Mutual exclusion (premise-carrying).** Slots=1: two wrapped `node -e` children
   each append `start:<ts>`/`end:<ts>` to a shared log; assert non-overlap. Premise
   probe in the same case: the identical two children UNWRAPPED must overlap — if they
   do not, the fixture cannot see overlap and the assertion is vacuous (lengthen the
   child's sleep until the premise holds).
2. **Crash release.** Slots=1: SIGKILL the first wrapped process mid-hold; a second
   wrapped command then acquires. Bound: within `poll × 1.2 + 2000 ms` (jitter- and
   spawn-latency-aware, R1 F8), no manual cleanup between.
3. **Exit-code and argv transparency.** Wrapped `node -e "process.exit(7)"` exits 7;
   argv containing spaces reaches the child intact (child echoes `process.argv`).
4. **Descendant semantics pin (§4.0 P3 / §4.2).** Slots=1: a wrapped Node parent
   spawns a detached child that outlives it; after the parent exits, assert a new
   wrapped command CAN acquire (spawn children do not retain the lock). Pins the
   measured early-release semantics so a future runtime change surfaces as a test
   failure, not a silent behavior shift.
5. **Priority bias — marker mechanism only (R1 F8).** Slots=1 held; normal waiter and
   priority waiter at EQUAL `FX_HEAVY_POLL_MS`; barrier premise: start the normal
   waiter, wait for its first-wait stderr line (readiness signal), start the priority
   waiter, wait for ITS first-wait line, then release the holder. Assert the priority
   waiter acquires first. Equal intervals mean only the marker back-off can produce
   the bias — deleting the marker logic fails this test. `.retry(2)` retained for
   scheduler noise; the barrier removes the start-order race.
6. **Disable hatch.** `FX_HEAVY_DISABLE=1`: two slots=1 commands overlap (no locking).
7. **Metadata surfacing (R1 F5).** Slots=1 held with deliberately truncated/garbage
   slot-file content (test writes over it via a separate fd after acquisition):
   a waiter's first-wait stderr line contains `holder unknown (metadata unreadable)`.
   Companion positive case: with intact metadata the line contains the holder's PID.
8. **Invalid knob fallback.** `FX_HEAVY_SLOTS=banana`: wrapper warns on stderr, uses
   default 2, and still runs the command (exit 0).
9. **Slot-count consistency (R1 F9).** Dir created by an invocation with
   `FX_HEAVY_SLOTS=3` (config records 3); a second invocation with `FX_HEAVY_SLOTS=1`
   warns and ADOPTS 3 — observable: with two holders live, the second invocation still
   acquires (a 1-slot believer could not).
10. **pnpm forwarding (Task 4).** `pnpm heavy -- node -e "process.exit(0)"` exits 0.

The suite spawns ≤3 tiny node children per case — it is itself light and needs no slot.

## 8. Documented limits (pre-filed; not findings)

- Early release on parent-only death, and retention by shell-layer descendants —
  measured semantics §4.2, both surfaced (wait warning; §4.6 rules shrink exposure).
- Priority is bias, not ordering (§4.4).
- `FX_HEAVY_SLOT_DIR` divergence creates independent semaphores, undetectable by
  design; fenced by the AGENTS.md never-set rule (§4.5). `FX_HEAVY_SLOTS` divergence is
  detected and reconciled (§4.5 protocol).
- Metadata may name an exited PID or be unreadable; the warning says so rather than
  guessing (§4.1.5). Never silent.
- `/tmp` clears on reboot — by design (locks are runtime state; the kernel released
  them at death anyway).
- Sessions that ignore the AGENTS.md rule are not stopped by any mechanism here;
  enforcement is the rule + review culture (cross-cutting tier). A PreToolUse hook
  could mechanize it later; out of scope (YAGNI until non-compliance is measured).

## 9. Threat model / review fence

Defends against: accidental concurrent heavy phases launched by cooperating,
rule-following agent sessions on one machine. Out of scope: adversarial processes,
sessions that bypass the wrapper or set `FX_HEAVY_SLOT_DIR` in production, non-repo
workloads (Chrome, Docker itself). Findings against out-of-scope actors file to §8, not
to review rounds.
