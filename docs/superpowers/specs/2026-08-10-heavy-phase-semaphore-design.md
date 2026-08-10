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
(The build lock in `scripts/with-admin-dev-flag.mjs:216-220` serializes builds only
WITHIN one worktree — its `ROOT` is `process.cwd()` — so cross-worktree builds are part
of the unbounded set; see §4.6.)

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
- **Builds are IN the wrapped set** (R2 F1 probe-backed reversal of the R1 F6 reversal,
  now fenced both directions): the `scripts/with-admin-dev-flag.mjs:216-220` lock is
  WORKTREE-LOCAL (`ROOT = process.cwd()`, lock under ROOT/.build-locks), so it bounds
  nothing across worktrees, and direct `next build` bypasses the wrapper script
  entirely. Wrapping builds is therefore required; the residual case — two builds in
  the SAME worktree, where the second holds a heavy slot while idling on the inner
  worktree-local lock — is a documented limit (§8), rare by construction (one session
  owns a worktree, invariant 11). Do not propose re-excluding builds, and do not
  propose removing the existing inner lock.
- **Priority is best-effort bias, not strict ordering** (C3, §4.4). Non-FIFO, non-fair
  wakeup is a documented limit (§8), not a finding.
- **No enforcement hook** ships in this arc (§8). The AGENTS.md rule is the contract, at
  the cross-cutting-discipline tier (R1 F10: this spec previously claimed
  worktree-invariant tier; the claim is corrected, not the placement).
- **CI never invokes the wrapper**; no workflow edits in this arc.
- **Slot default = 2** on the 12-core/18 GB origin machine; env-tunable via the §4.5
  consistency protocol, not RAM-adaptive.

## 2. Constraints (ratified in conversation, 2026-08-10)

- **C1 — No increase to the phases that dominate per-arc ship time.** Slots wrap ONLY
  heavy local phases. Spec/plan authoring, codex review dispatch/polling, CI polling,
  and merges never acquire a slot. A wrapped heavy phase MAY pay a bounded, surfaced
  queue wait in the ≥(slots+1)-overlap regime — that trade is ratified and registered
  as a documented limit (§8); the constraint is about arc wall-clock, not about no
  command ever waiting.
- **C2 — Full-speed holders.** A slot holder is never worker-starved. (Satisfied
  structurally: the wrapper adds exactly one env marker — `FX_HEAVY_SLOT_HELD`, the
  §4.1 reentrancy guard, which no test or build tool reads — and modifies nothing
  else about the command's environment or flags.)
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
- Not a cap on Docker, Chrome, or codex processes — only on the heavy phases the
  repo's own tooling launches (§4.6, suites and builds).
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
   `os.ftruncate(fd, 0)` then a single `os.write(fd, …)` of one JSON line —
   `pid`, `cmd` (BASENAME of argv[0] only), `argc` (argument count), ISO timestamp,
   priority flag. Full argv is deliberately NEVER recorded and never echoed to stderr
   (R2 F5): slot files are world-readable shared state and wait warnings land in
   transcripts, so a token-bearing argument or credential URL must have no path into
   either. `os.write` is a direct syscall — nothing to flush across `exec`.
5. If all slots are held: sleep `FX_HEAVY_POLL_MS` (default 3000 ms normal, 1000 ms when
   priority) with ±`FX_HEAVY_JITTER_PCT`% jitter (default 20), retry. Warning cadence
   is evaluated AT EACH WAKE: emit when `now - lastWarn >= FX_HEAVY_WAIT_WARN_S` —
   the effective cadence is therefore `max(poll interval, FX_HEAVY_WAIT_WARN_S)`, and
   a poll interval above the warn interval simply warns once per wake rather than
   promising an impossible sub-poll cadence (R4 F5). First wait always warns
   immediately. Each warning names each slot's recorded holder
   metadata, read via a SEPARATE `os.open(path, O_RDONLY)` fd closed after reading
   (never the locking fd). A slot whose metadata is empty, torn, or unparseable is
   reported as `holder unknown (metadata unreadable)` — imprecise-but-surfaced is the
   §8 documented limit; silent omission is not permitted (R1 F5). The warning also
   states that a recorded PID may have exited while a shell descendant retains the
   lock (§4.2).
6. **Post-acquire topology validation (R3 F1, identity per R4 F1):** after `flock`
   succeeds on slot *i*, validate BOTH properties, in order:
   (a) **identity** — `os.fstat(fd)` and `os.stat(path)` agree on `(st_dev, st_ino)`:
   the locked inode is still the one linked at the slot's pathname. A waiter that
   opened a slot file before a directory recreation holds a lock on an ORPHANED
   inode — same-size recreation, growth, and shrink all produce this shape (R4 F1),
   and an index check alone passes it;
   (b) **index** — *i* < the slot count read from `config` AFTER the lock was taken.
   On either failure: one-line stderr notice, `os.close(fd)` (releasing the lock),
   restart the resolution loop from step 2. An acquisition proceeds to exec only
   holding the CURRENT inode at a CURRENTLY-valid index, which closes the resize race
   in every recreation class, not just the shrink subset.
7. On acquire (validated): `os.set_inheritable(fd, True)` (raw integer fd — valid per
   the `os.open` API), then `os.execvp(cmd, args)` — the wrapper process BECOMES the heavy
   command. The flock fd rides through exec; the kernel releases it when the last
   process holding the fd exits. Crash of the holder (any signal, including SIGKILL) =
   immediate release (§4.0 P2). Zero cleanup code (C5).

**Reentrancy — outermost-owns (R4 F2):** before exec, the wrapper sets
`FX_HEAVY_SLOT_HELD=1` in the command's environment (its ONLY env addition). A wrapper
invocation that starts with `FX_HEAVY_SLOT_HELD` already set acquires NOTHING: it
emits one stderr note (`nested under held slot — passing through`) and execs the
command directly. Environment — unlike fds — survives every spawn layer, so the guard
reaches arbitrarily deep children. This makes nested qualifying phases
(`pnpm build → next build`, `test:fast → vitest`, playwright web servers,
`mutation:guards → vitest` children) structurally incapable of the
outer-holds-inner-waits self-deadlock: the outermost wrapped command owns the slot;
every inner wrap is a surfaced no-op. The AGENTS.md rule says "wrap the outermost
command"; wrapping an inner one anyway is harmless by construction.

Exit code, signals, stdio: otherwise fully transparent — `execvp` means the caller
sees the heavy command's exit status directly; no forwarding logic exists to get
wrong. Beyond `FX_HEAVY_SLOT_HELD`, the command's environment is untouched (C2).

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
- A non-priority waiter that backs off for a fresh marker emits a one-line stderr
  notice (`yielding to priority waiter`) — the marker mechanism's own observable
  surface (R4 F3).
- Marker freshness window: `max(10 min, 2 × the waiter's effective poll interval)` —
  a fixed 10-minute window goes stale between two polls at the 600 s poll ceiling and
  would silently cancel the bias (R4 F5 interaction class).
- No lock handoff, no queue file, no strict ordering guarantee. A starved normal waiter
  still acquires as soon as no fresh priority marker exists.
- Discriminability requirement for §7: the marker back-off must be observable
  INDEPENDENTLY of timing — the priority test runs both waiters at EQUAL poll
  intervals with jitter DISABLED (`FX_HEAVY_JITTER_PCT=0`) AND asserts the yielding
  notice on the normal waiter's stderr, so a marker-deletion implementation fails on
  the missing notice regardless of any schedule (R1 F8, R4 F3).

### 4.5 Knobs and the consistency protocol

| Env | Default | Meaning |
| --- | --- | --- |
| `FX_HEAVY_SLOT_DIR` | `/tmp/fx-heavy-slots` | lock-state dir. Tests point this at a tmpdir. Production sessions NEVER set it (AGENTS.md rule) — two dirs are two independent semaphores, undetectable by design (§8). |
| `FX_HEAVY_SLOTS` | `2` | DESIRED slot count; subject to the consistency protocol below. |
| `FX_HEAVY_PRIORITY` | unset | `1` = nearest-merge priority waiter (equivalent to `--priority`). |
| `FX_HEAVY_POLL_MS` | `3000` / `1000` (prio) | wait-poll interval, ±20% jitter. |
| `FX_HEAVY_WAIT_WARN_S` | `300` | repeat-warning cadence while waiting. |
| `FX_HEAVY_DISABLE` | unset | `1` = exec the command directly, no locking (escape hatch; also the CI posture). |
| `FX_HEAVY_JITTER_PCT` | `20` | poll jitter percent; `0` = deterministic (test posture). |
| `FX_HEAVY_SLOT_HELD` | (set by wrapper) | NOT a user knob — the §4.1 reentrancy signal. Written by the wrapper into the exec'd env; read by nested wrapper invocations, which pass through without acquiring. Never set it by hand. |

**Slot-count consistency (R1 F9, atomicity per R2 F2):** publication of `config` (one
JSON line `{"slots": N}`) is ATOMIC first-writer-wins: an invocation that finds no
`config` writes its complete content to a private `config.tmp.<pid>` in the same dir,
then attempts `os.link(tmp, config)` — `link(2)` fails with `EEXIST` if any other
writer already published, so exactly one creator can ever win, and a published `config`
is complete by construction (a reader can never observe a partial write; the
check-then-write race and the torn-read "repair" overwrite from R2 F2 are both
structurally impossible). BOTH outcomes unlink the tmp name: the winner after its
successful `link` (link creates a second name, it does not consume the source —
R4 F4), the loser after `EEXIST`. The loser then reads the winner's value, and on
mismatch with its own `FX_HEAVY_SLOTS` emits a one-line stderr warning and ADOPTS the
recorded value. Waiters RE-RESOLVE `config` on every poll iteration (R2 F2 third
instance): a waiter that outlives a dir removal/recreation converges on the new
topology within one poll rather than acting on a startup snapshot. Changing capacity is
explicit: remove the slot dir (or reboot — `/tmp` clears) while no holder is live; the
warning text says exactly that.

**Knob domains (R2 F4).** All knobs are read at startup (except the per-poll `config`
re-resolve above); every out-of-domain value falls back with a one-line stderr warning,
never a crash and never silence:

- `FX_HEAVY_SLOTS`: integer in [1, 64]; else warn + default 2. (0 or negative would
  make the acquire loop empty and wait forever — rejected, R2 F4.)
- `FX_HEAVY_POLL_MS`: integer in [50, 600000]; else warn + default. (0 busy-spins;
  negatives break sleep — rejected.)
- `FX_HEAVY_WAIT_WARN_S`: integer in [10, 86400]; else warn + default 300. (Effective
  cadence is `max(poll, warn)` — §4.1.5, R4 F5.)
- `FX_HEAVY_JITTER_PCT`: integer in [0, 50]; else warn + default 20. `0` disables
  jitter (deterministic polling — the §7 priority case depends on it).
- `FX_HEAVY_PRIORITY`, `FX_HEAVY_DISABLE`: the string `1` means on; UNSET means off
  silently; any other set value means off WITH a stderr warning naming the expected
  value (a typo like `true` must not silently disable requested behavior — R2 F4).

### 4.6 What must be wrapped (the AGENTS.md rule, summarized)

MUST acquire a slot (via `pnpm heavy -- <cmd>` or direct wrapper invocation), phrased by
invocation shape, not alias (R1 F7):

- Any full-suite vitest run — `pnpm test`, `pnpm test:fast`, or any `vitest run` /
  `pnpm exec vitest run` not scoped to an explicit file list.
- Any NON-INTERACTIVE playwright run — every `pnpm test:e2e*` except interactive forms
  (below), any direct `playwright test` without an interactive flag, and the screenshot
  captures `pnpm screenshot:gallery` / `pnpm screenshot:help` (their config runs an
  inner 8192 MB build, `playwright.screenshots.config.ts:128`).
- Any BUILD — `pnpm build`, direct `next build`, or a `next build` run through
  `scripts/with-admin-dev-flag.mjs` (R2 F1: the inner build lock is worktree-local, so
  only the semaphore bounds builds across worktrees). The build shape is `next build`
  regardless of entry point; `next start` / `next dev` — including through the same
  wrapper script, which forwards any command (R3 F2) — are long-lived servers and
  belong to the MUST-NOT class below.
- Mutation harness: `pnpm mutation:guards`, any `--project mutation` run; one slot per
  concurrently-running shard batch.

Wrap the OUTERMOST command only (§4.1 reentrancy guard makes inner wraps surfaced
no-ops — R4 F2).

MUST NOT be wrapped:

- Any INTERACTIVE playwright invocation, identified by shape not alias (R2 F3):
  `--ui` (including the `pnpm test:e2e:ui` alias, root package.json line 62),
  `--debug`, or a `PWDEBUG`-set environment — unbounded-lived; a slot held
  indefinitely violates C1. Run them unwrapped and sparingly.
- Scoped vitest runs with an explicit file list, typecheck, eslint, `format:check`,
  codex dispatches, CI polling, git/gh operations, spec/plan authoring.
- Long-lived pre-warmed dev servers (§4.2 early-release direction): start them OUTSIDE
  the wrapper; the suite hitting them is the heavy phase, not the server.

A package.json convenience script `"heavy": "python3 scripts/with-heavy-slot.py --"`
makes the invocation `pnpm heavy pnpm test` (pnpm appends run-script args; §7 case 10
pins the forwarding executably).

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
- Builds are wrapped like any heavy phase (§4.6); the same-worktree double-build
  idle-hold is the one shape that parks a slot (documented limit, §8), and invariant 11
  (one session per worktree) makes it rare.
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
5. **Priority bias — marker mechanism only (R1 F8, R4 F3).** Slots=1 held; normal and
   priority waiters at EQUAL `FX_HEAVY_POLL_MS` with `FX_HEAVY_JITTER_PCT=0`
   (deterministic — independent jitter could hand priority the win with the marker
   logic deleted); barrier premise: start the normal waiter, wait for its first-wait
   stderr line, start the priority waiter, wait for ITS first-wait line, release the
   holder. Assert BOTH: the priority waiter acquires first, AND the normal waiter's
   stderr contains the `yielding to priority waiter` notice — the notice only exists
   if the marker mechanism ran, so a marker-deletion implementation fails on it
   regardless of scheduling. `.retry(2)` retained for scheduler noise on the ordering
   arm; the notice arm is timing-independent.
6. **Disable hatch.** `FX_HEAVY_DISABLE=1`: two slots=1 commands overlap (no locking).
7. **Metadata surfacing and secret absence (R1 F5, R2 F5).** Slots=1 held with
   deliberately truncated/garbage slot-file content (test writes over it via a separate
   fd after acquisition): a waiter's first-wait stderr line contains
   `holder unknown (metadata unreadable)`. Companion positive case: intact metadata →
   the line contains the holder's PID. Secret-absence arm: wrap a command carrying a
   token-shaped argument (`node -e … --token=hunter2-sentinel`); assert the sentinel
   appears in NEITHER the slot file NOR any waiter stderr (only the `cmd` basename and
   `argc` do).
8. **Knob domains (R2 F4).** `FX_HEAVY_SLOTS=banana` and `FX_HEAVY_SLOTS=0`: warn +
   default 2 + command runs (exit 0). `FX_HEAVY_DISABLE=true` (not `1`): stderr warning
   naming the expected value AND locking still active (observable: the case-1 mutual
   exclusion holds under it). `FX_HEAVY_POLL_MS=0`: warn + default (asserted via the
   warning line; no busy-spin).
9. **Slot-count consistency (R1 F9, R2 F2).** Sequential arm: dir created under
   `FX_HEAVY_SLOTS=3` (config records 3); a second invocation with `FX_HEAVY_SLOTS=1`
   warns and ADOPTS 3 — observable: with two holders live it still acquires. Race arm:
   N simultaneous first invocations (no pre-existing dir, mixed `FX_HEAVY_SLOTS`
   values) — after all complete, exactly one `config` value exists, every process's
   stderr shows either creation or adopt, and no `config.tmp.*` residue remains
   (pins the `os.link` first-writer-wins publication).
10. **pnpm forwarding.** `pnpm heavy -- node -e "process.exit(0)"` exits 0. (The plan
    owns task numbering; this spec references cases, never plan tasks.)
11. **Resize-race containment (R3 F1, R4 F1).** Two arms sharing the case-1 overlap
    oracle. Shrink arm: dir at `FX_HEAVY_SLOTS=3`; waiter blocks with resolved N=3
    (all slots test-held); recreate dir with config N=1 and a test-owned holder on
    new slot-0; release one OLD slot fd. Identity arm (same-size recreation): dir at
    N=1, waiter blocked on the held slot; recreate dir with config N=1 and a
    test-owned holder locking the NEW slot-0 inode; release the OLD inode's flock so
    the stale waiter's already-open fd can win its orphaned inode — the index check
    alone would pass (`0 < 1`); only the `(st_dev, st_ino)` identity check rejects
    it. Both arms assert: the stale waiter's command never runs concurrently with the
    new topology's holder, and its stderr carries the topology-restart notice.
12. **Nested pass-through (R4 F2).** Slots=1: an outer wrapped command's child
    invokes the wrapper again (inherits `FX_HEAVY_SLOT_HELD=1`); assert the inner
    command RUNS (no self-deadlock on the single slot), the inner wrapper's stderr
    carries the `nested under held slot` note, and slot-file lock state shows one
    holder throughout.

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
- A wrapped phase can wait when more than `slots` heavy phases overlap — bounded,
  surfaced by the wait warning, ratified under C1 (R2 F6).
- Same-worktree double build: the second build holds a heavy slot while idling on the
  worktree-local inner lock (§4.6, R2 F1) — rare under invariant 11, surfaced by the
  wait warning naming the holder.
- Sessions that ignore the AGENTS.md rule are not stopped by any mechanism here;
  enforcement is the rule + review culture (cross-cutting tier). A PreToolUse hook
  could mechanize it later; out of scope (YAGNI until non-compliance is measured).

## 9. Threat model / review fence

Defends against: accidental concurrent heavy phases launched by cooperating,
rule-following agent sessions on one machine. Out of scope: adversarial processes,
sessions that bypass the wrapper or set `FX_HEAVY_SLOT_DIR` in production, non-repo
workloads (Chrome, Docker itself). Findings against out-of-scope actors file to §8, not
to review rounds.
