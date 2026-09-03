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
  and merges never acquire a slot. A wrapped heavy phase MAY pay a surfaced
  queue wait in the ≥(slots+1)-overlap regime — surfaced by the wait warnings,
  finite in practice, but NOT formally bounded (§4.1.2 states the no-fairness
  semantics; R9 F2) — that trade is ratified and registered as a documented limit
  (§8); the constraint is about arc wall-clock, not about no command ever waiting.
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
2. **Take the attempt bracket: `recreate.lock` SHARED (R7 F1, ordering per R8 F1,
   surfacing per R8 F2):** open `recreate.lock` (create on demand) and try
   `LOCK_SH | LOCK_NB` FIRST. NB failure means an exclusive recreation swap is in
   progress: emit the first-wait warning (`waiting: recreation in progress`)
   immediately — BEFORE any blocking — then retry `LOCK_SH | LOCK_NB` on the same
   warn-at-each-wake loop as slot waiting (step 6 cadence), so a wedged recreation
   is never a silent block (R8 F2 second instance). The SH lock, once held,
   brackets one ATTEMPT — resolve, scan, and (on a win) validate — and is released
   before every poll sleep and before exec (never inherited by the command). A
   recreator holds `LOCK_EX` for its entire swap (§4.5), so no wrapper can resolve,
   publish a config, or acquire a slot inside a swap — excluded by the kernel, not
   convention. Liveness is stated honestly (R8 F2 first instance): macOS `flock`
   has no writer preference — a later SH can be granted while an EX waits — so EX
   admission is NOT ordered; it is prompt in practice because SH brackets are
   microsecond-scale and every waiter spends its poll sleeps (≥50 ms) holding
   nothing, so zero-SH windows recur every interval. No fairness guarantee is
   claimed; a recreation that waits abnormally long is visible through its own
   §4.5 swap-begin line having not yet appeared.
3. Resolve slot count N via the §4.5 consistency protocol (dir-recorded value wins) —
   under the SH bracket (R8 F1: the bracket precedes resolution; the previous
   numbering said both orders at once).
4. The acquire scan, all raw-fd API (R1 F4): for each slot index,
   `fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)` then
   `fcntl.flock(fd, LOCK_EX | LOCK_NB)`. First success wins. A LOSING fd is
   `os.close`d immediately before trying the next slot (R1 F4 lifecycle note). There
   are no probe fds anywhere in the design (sizing is removed).
5. On success, write holder metadata with unbuffered raw-fd calls (R1 F5):
   `os.ftruncate(fd, 0)` then a single `os.write(fd, …)` of one JSON line —
   `pid`, `cmd` (BASENAME of argv[0] only), `argc` (argument count), ISO timestamp,
   priority flag. Full argv is deliberately NEVER recorded and never echoed to stderr
   (R2 F5): slot files are world-readable shared state and wait warnings land in
   transcripts, so a token-bearing argument or credential URL must have no path into
   either. `os.write` is a direct syscall — nothing to flush across `exec`.
6. If all slots are held: sleep `FX_HEAVY_POLL_MS` (default 3000 ms normal, 1000 ms when
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
7. **Post-acquire topology validation (R3 F1, identity per R4 F1):** after `flock`
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
   The validate→exec sequence is not kernel-atomic; what closes the residual window is
   the §4.5 rule that topology changes go through `--recreate`, which BLOCKS on every
   live holder's flock — a process past validation holds a current-inode flock, so a
   rule-following recreation cannot overlap its execution at all (R5 F1). Manual
   `rm -rf` of the slot dir is out of contract (§8).
8. On acquire (validated), release the SH bracket, then: `os.set_inheritable(fd, True)` (raw integer fd — valid per
   the `os.open` API), then `os.execvp(cmd, args)` — the wrapper process BECOMES the heavy
   command. The flock fd rides through exec; the kernel releases it when the last
   process holding the fd exits. Crash of the holder (any signal, including SIGKILL) =
   immediate release (§4.0 P2). Zero cleanup code (C5).

**Reentrancy — outermost-owns, with a VALIDATED marker (R4 F2, R5 F3):** before exec,
the wrapper sets `FX_HEAVY_SLOT_HELD=<slot-path>:<pid>` in the command's environment
(its ONLY env addition) — the held slot's pathname plus the holder's PID, not a bare
flag. A wrapper invocation that starts with the marker set does NOT trust it blindly
(the env survives Node-spawn descendants that the fd does not — R5 F3): it validates
that (a) the named slot file's metadata records the marker's PID, (b) that PID is
alive (`kill -0`), and (c) the slot is actually locked (a `LOCK_NB` probe on a
separate fd FAILS; the probe fd is closed either way). All three hold → emit
`nested under held slot — passing through` and exec directly. Any check fails → the
marker is STALE (the ancestor holder died; an orphaned descendant is launching new
work): emit `stale slot-held marker — acquiring normally`, strip the marker from the
child env, and run the normal acquisition path. This keeps the nested self-deadlock
structurally impossible for live holders while a dead holder's descendants can never
silently bypass admission. Nested qualifying phases (`pnpm build → next build`,
`test:fast → vitest`, playwright web servers, `mutation:guards → vitest` children)
pass through under a live ancestor; the outermost wrapped command owns the slot. The
AGENTS.md rule says "wrap the outermost command"; wrapping an inner one anyway is
harmless by construction.

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
  slot held. Surfaced by the §4.1.6 wait warning (holder metadata + the
  may-have-exited caveat). Deliberately NOT auto-broken — breaking a live lock
  reintroduces the stale-lock class C5 exists to kill.

### 4.3 Worker sizing — removed

There is no worker sizing in this design. Rationale and fence: §1.1 (R1 F2/F3, probe
§4.0 P4). The wrapper's only lever is admission; a holder's command runs exactly as it
would unwrapped.

### 4.4 Priority (C3, best-effort)

`--priority` flag or `FX_HEAVY_PRIORITY=1` (set by arcs in closeout/CI stage per the
AGENTS.md rule):

- Priority waiters poll faster (§4.1.6 defaults), so on a release they statistically
  win the race.
- Each priority waiter maintains a marker `prio-wait-<pid>` in the slot dir while
  waiting — created on first wait and its mtime REFRESHED on every poll attempt
  (`os.utime`; create-once is non-conforming, R7 F3, since an active waiter's marker
  would silently age out of the freshness window) — removed on acquire and on normal
  exit (`atexit`, best-effort). A marker is FRESH within the single freshness window
  defined below and ignored past it (a crashed waiter must not throttle others —
  and a crashed waiter is exactly the one that stops refreshing). Non-priority waiters that see a fresh
  marker add one extra poll interval before each attempt, yielding the next free slot
  to the priority waiter with high probability.
- A non-priority waiter that backs off for a fresh marker emits a one-line stderr
  notice (`yielding to priority waiter`) — the marker mechanism's own observable
  surface (R4 F3).
- Marker freshness window — the ONLY definition (R6 F2; declared-cadence basis per
  R9 F1): each marker's content is one JSON line carrying the priority waiter's pid
  and its OWN effective poll interval; an observer treats the marker as fresh while
  `age <= max(10 min, 2 × the interval DECLARED IN THE MARKER)`. Basing the window
  on the observer's interval silently expired an active slow-polling waiter's
  marker for every faster-polling observer (R9 F1: priority at 600 s poll renews at
  up to 720 s gaps while a 3 s observer expired it at 600 s); the declared cadence
  closes the whole heterogeneous-settings region. An unreadable/unparseable marker
  is treated as fresh-at-the-10-minute-floor and surfaced in the yielding notice as
  `cadence unknown` — never silently ignored. The 10-minute floor bounds how long a
  crashed waiter's marker can throttle others at ordinary poll rates.
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
| `FX_HEAVY_SLOT_HELD` | (set by wrapper) | NOT a user knob — the §4.1 reentrancy signal (`<slot-path>:<pid>`). Written by the wrapper into the exec'd env; nested invocations VALIDATE it (metadata pid + liveness + lock probe) before passing through. Never set it by hand. |
| `FX_HEAVY_TEST_HOLD_OPEN_MS` | unset | NOT a user knob — test-only race-injection point: sleep this many ms (a) between a slot `open` and its `flock` attempt (makes the §7 case 11 orphaned-inode window reproducible, R5 F2) and (b) inside `--recreate`'s swap, between the config `os.replace` and the slot-file adjustment (makes the §7 case 13 swap-window, serialization-premise, and crash arms reproducible, R7 F1 / R8 F3/F5). Integer [0, 60000]; out-of-domain warns + ignores. Production sessions never set it. |

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
topology within one poll rather than acting on a startup snapshot.

**Capacity changes go through `--recreate` (R5 F1; serialization per R6 F1):**
`python3 scripts/with-heavy-slot.py --recreate --slots N` performs the swap safely.
`--slots` obeys the SAME [1, 64] integer domain as `FX_HEAVY_SLOTS` but with the
management posture: out-of-domain or missing input is a stderr error and exit 2 with
NO swap (a management command fails loud; only the wrap path must never block a gate
run — R6 F3, which also closes the `--slots 0` empty-topology wedge). Procedure:

1. Take `LOCK_EX` on `recreate.lock` in the slot dir (created on demand, NEVER
   unlinked by any operation) — NB-FIRST with surfaced waiting (R10 F2): on NB
   failure emit `waiting: recreate.lock held` immediately and retry on the standard
   warn-cadence loop. Recreators serialize on it against each other (R6 F1) AND
   against every ordinary acquisition, which holds `LOCK_SH` on the same file per
   attempt (§4.1.2, R7 F1): the exclusive lock is granted only when no acquisition
   is in flight, and no acquisition can begin until the swap completes.
2. Flock every PRESENT slot file — enumerated by GLOB over `slot-*` in the dir, not
   by the 0..N-1 index range, so residue from a crashed shrink is locked and
   removable too (R10 F3) — in index order, each NB-first: on NB failure emit
   `waiting: slot-<i> held by <metadata>` (same metadata read as §4.1.6) and retry
   on the warn cadence, so a live or retained holder wedging recreation is surfaced
   from the first attempt, never a silent block (R10 F2). After EACH slot flock
   apply the step-7 identity check (`fstat` vs `stat`): an orphaned-inode lock —
   possible if this recreator opened a path before a prior recreator's swap — is
   closed and the slot re-opened from the current pathname before proceeding, so a
   recreator can never hold a stale generation while mutating the live one (R6 F1).
3. **Atomic swap — there is NO all-unlinked window (R8 F3):** holding recreate.lock +
   all current-generation slot locks, emit `swap begin <monotonic-ns>` to stderr,
   then: (a) write the new config content to `config.tmp.<pid>` and `os.replace` it
   onto `config` — an atomic REPLACE, so a valid `config` exists at every instant
   and a crash at any point leaves either the old or the new value, never an
   uninitialized dir for a later wrapper to seed with its own `FX_HEAVY_SLOTS`
   (`os.replace` consumes the tmp name — no residue); (b) unlink EVERY locked slot
   file with index >= newN — the step-2 glob means this covers residue from any
   earlier crashed shrink, not just the immediately-previous generation (R10 F3:
   an index-range enumeration left files `T..O-1` behind forever whenever a later
   target satisfied `S <= T < O`); create missing slot files < newN with `O_CREAT`
   (the acquire scan's own `O_CREAT` also self-heals a crash here); (c) emit
   `swap end <monotonic-ns>`, release everything. A recreator crash mid-procedure
   therefore leaves a consistent dir at worst carrying inert extra slot files
   (indices >= the recorded count are unacquirable by step-7 validation), and ANY
   later `--recreate` — equal, growing, or shrinking — removes them, restoring the
   exact-slot-set postcondition. No recovery step, no journal (C5's zero-cleanup
   posture extends to recreation).

Any waiter mid-acquisition either blocks behind these locks or wins an orphaned
inode and is rejected by step 7 validation on its next attempt. Reboot (`/tmp`
clears) is the other supported reset. Manual `rm -rf` of a live slot dir is OUT OF
CONTRACT — it reintroduces the recreation races by hand and files to §8.

**Runtime stderr contract for the shared-state protocol (R8 F4)** — every §7 oracle
line is a specified emission, not a test invention: the first-boot publisher emits
`config created (slots=N)`; every later invocation that reads an existing config
emits `config adopted (slots=N)` (plus the mismatch WARNING when its own env
differs); a successful acquisition emits `acquired slot-<i> (slots=N)` just before
exec; `--recreate` emits the `swap begin/end <monotonic-ns>` pair around step 3.

**Knob domains (R2 F4).** All knobs are read at startup (except the per-poll `config`
re-resolve above); every out-of-domain value falls back with a one-line stderr warning,
never a crash and never silence:

- `FX_HEAVY_SLOTS`: integer in [1, 64]; else warn + default 2. (0 or negative would
  make the acquire loop empty and wait forever — rejected, R2 F4.)
- `FX_HEAVY_POLL_MS`: integer in [50, 600000]; else warn + default. (0 busy-spins;
  negatives break sleep — rejected.)
- `FX_HEAVY_WAIT_WARN_S`: integer in [10, 86400]; else warn + default 300. (Effective
  cadence is `max(poll, warn)` — §4.1.6, R4 F5.)
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

**Transitive shape rule (R10 F1):** a command is classified by what it TRANSITIVELY
launches, not by its own surface shape — an explicitly-scoped or non-suite outer
command whose body spawns a heavy phase is wrapped at its own outermost entry.
Current known members, found by the subprocess sweep
`rg -n -U 'execFileSync\("pnpm",\s*\["build"\]|execFileSync\("pnpm",\s*\["test:e2e'`
over `tests/` + `scripts/` (the sweep command is the derived cover — rerun it when
authoring changes to either tree):

- `RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts`
  — scoped vitest, but its helper runs `pnpm build` twice
  (`tests/admin/build-artifact-gate.test.ts:73`): wrapped.
- `node scripts/share-link-flash-adversary-matrix.mjs` (full mode) — runs
  non-interactive playwright (`scripts/share-link-flash-adversary-matrix.mjs:1042`):
  wrapped. `--quick` mode spawns no playwright and stays unwrapped.

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
  surfaced, practically-finite wait — not formally bounded, §4.1.2; the C1 claim is
  about the phases that dominate arc latency, next bullet — not that no command
  ever waits.)
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
   holder. Assert ALL THREE: the priority waiter acquires first; the normal waiter's
   stderr contains the `yielding to priority waiter` notice (the notice only exists
   if the marker mechanism ran, so a marker-deletion implementation fails on it
   regardless of scheduling); and, in a variant that delays the release by at least
   two poll intervals, the marker's mtime ADVANCES between polls (`stat` twice —
   pins the per-poll refresh, R7 F3; a create-once implementation fails this arm).
   `.retry(2)` retained for scheduler noise on the ordering arm; the notice and
   refresh arms are timing-independent.
   Declared-cadence freshness arm (R9 F1): plant two markers by hand with backdated
   mtimes (`os.utime`) — one declaring poll 400000 ms backdated 700 s (window
   `max(600 s, 2 × 400 s) = 800 s` → FRESH: a normal waiter emits the yielding
   notice), one declaring poll 3000 ms backdated 700 s (window = 600 s floor →
   STALE: no yield). Flips exactly at the declared-cadence boundary,
   deterministically, no waiting — an implementation computing freshness from the
   observer's own interval fails the first half.
6. **Disable hatch.** `FX_HEAVY_DISABLE=1`: two slots=1 commands overlap (no locking).
7. **Metadata surfacing and secret absence (R1 F5, R2 F5).** Slots=1 held with
   deliberately truncated/garbage slot-file content (test writes over it via a separate
   fd after acquisition): a waiter's first-wait stderr line contains
   `holder unknown (metadata unreadable)`. Companion positive case: intact metadata →
   the line contains the holder's PID. Secret-absence arm: wrap a command carrying a
   token-shaped argument (`node -e … --token=hunter2-sentinel`); assert the sentinel
   appears in NEITHER the slot file NOR any waiter stderr (only the `cmd` basename and
   `argc` do).
8. **Knob domains (R2 F4; upper bound per R12 F1).** `FX_HEAVY_SLOTS=banana`,
   `FX_HEAVY_SLOTS=0`, AND `FX_HEAVY_SLOTS=65`: warn + default 2 + command runs
   (exit 0) — the 65 arm is env-side (warn+default posture), distinct from the
   case 13 management-CLI exit-2 posture; without it an implementation could cap
   `--slots` yet accept a 65-slot env and silently defeat the machine-wide bound.
   Companion boundary: `FX_HEAVY_SLOTS=64` accepted (config records 64, no warning). `FX_HEAVY_DISABLE=true` (not `1`): stderr warning
   naming the expected value AND locking still active (observable: the case-1 mutual
   exclusion holds under it). Full-matrix arms (plan R3 F1 amendment — every knob's
   invalid class has an oracle): `FX_HEAVY_WAIT_WARN_S=banana` → warn + default 300;
   `FX_HEAVY_JITTER_PCT=99` → warn + default 20; `FX_HEAVY_PRIORITY=true` (not `1`)
   → warning naming the expected value AND no priority behavior (no prio-wait marker
   created). `FX_HEAVY_POLL_MS=0`: warn + default (asserted via the
   warning line; no busy-spin).
9. **Slot-count consistency (R1 F9, R2 F2; discriminators per R8 F5).** Sequential
   arm: dir created under `FX_HEAVY_SLOTS=3` (config records 3); a second invocation
   with `FX_HEAVY_SLOTS=1` warns and ADOPTS 3 — observable: with two holders live it
   still acquires. Race arm: N simultaneous first invocations (no pre-existing dir,
   mixed `FX_HEAVY_SLOTS` values) — after all complete, assert: EXACTLY ONE process
   emitted `config created (slots=X)` (the §4.5 stderr contract line) and every
   other emitted `config adopted (slots=X)` with the SAME X as the creator; one
   `config` holding X exists; no `config.tmp.*` residue. A last-writer-wins
   overwrite implementation fails the exactly-one-creator count and the same-X
   agreement (R8 F5 first instance); the tmp+`os.link` EEXIST protocol is the only
   shape that passes.
10. **pnpm forwarding.** `pnpm heavy -- node -e "process.exit(0)"` exits 0. (The plan
    owns task numbering; this spec references cases, never plan tasks.)
11. **Resize-race containment (R3 F1, R4 F1, fixture per R5 F2).** The orphaned-inode
    window (open → descheduled → flock) is sub-poll and unreachable through the
    public interface — the acquire loop closes losing fds — so both arms inject it
    deterministically with `FX_HEAVY_TEST_HOLD_OPEN_MS`: the waiter opens the OLD
    slot file, sleeps at the injection point, the test swaps the topology during the
    sleep (unlink + recreate: identity arm same-size N=1→N=1; shrink arm N=3→N=1),
    with a test-owned holder locking the NEW slot-0 inode; the waiter's flock then
    wins its now-orphaned inode. Assert per arm: the waiter's command never runs
    concurrently with the new topology's holder (case-1 overlap oracle), and its
    stderr carries the topology-restart notice — identity rejection in the same-size
    arm (`0 < 1` passes the index check), index or identity rejection in the shrink
    arm.
12. **Nested pass-through and stale marker (R4 F2, R5 F3).** Live arm — slots=1: an
    outer wrapped command's child invokes the wrapper again (inherits the marker);
    assert the inner command RUNS (no self-deadlock), inner stderr carries
    `nested under held slot`, one holder throughout. Stale arm — start a wrapped
    parent whose Node child (marker inherited, fd not) survives it; after the parent
    exits, the orphan invokes the wrapper: assert stderr carries
    `stale slot-held marker — acquiring normally`, the run ACQUIRES a slot (observable:
    a concurrent wrapped command at slots=1 is mutually excluded with it), and the
    marker it passes to its own child names the NEW slot/pid.
13. **Recreate discipline (R5 F1, R6 F1, R6 F3; arms per R7 F1/F2/F4).**
    Holder arm: slots=1 with a wrapped command running; `--recreate --slots 2`
    started concurrently must not complete before the holder's command exits
    (timestamps), completes after, and the dir then holds slot-0/slot-1 + config 2 +
    no tmp residue — AND its stderr carries `waiting: slot-0 held by <metadata>`
    from the first blocked attempt (the R10 F2 surfacing; a silently-blocking
    implementation fails this line).
    Serialization arm (replaces the R6 overlap oracle, which the mandated
    lock-ordering makes unreachable — R7 F2; premise per R8 F5): BOTH recreators run
    with the in-swap injection delay D (hook site (b)) where D exceeds an entire
    undelayed recreation — unserialized execution would therefore produce
    OVERLAPPING swap windows by construction, which is the premise the R8 F5 probe
    showed the bare started-together fixture lacks. Assert: the two `swap begin/end`
    stderr windows are disjoint AND each spans >= D (proving the delay was live
    inside both); the SECOND recreator's stderr carries
    `waiting: recreate.lock held` (R11 F1 — the recreator-behind-recreator wait
    site's own oracle: a blocking-flock mutant passes the window assertions but
    never emits this line); and the final dir exactly matches the LAST completed
    recreation (one config, matching slot files, no orphaned-generation files).
    Swap-window arm (pins the SH/EX exclusion, R7 F1): a recreator delayed INSIDE
    its swap (injection site (b), now between the config `os.replace` and slot-file
    adjustment); an ordinary wrapped command started during the delay — assert its
    `waiting: recreation in progress` warning appears (the §4.1.2 NB-first
    surfacing, R8 F2), it does not run before `swap end`, and it then runs admitted
    under the recreator's NEW generation (its `acquired slot-<i> (slots=N)` line
    carries the recreator's target N).
    Crash arm (pins the atomic swap, R8 F3; residue convergence per R10 F3): from
    slots=5, SIGKILL a recreator targeting 2 inside its injected swap delay (config
    already replaced to 2, slot files 0-4 still present); assert `config` holds a
    valid JSON slot count (never absent), a subsequent wrapped command runs
    normally with `config adopted`, never `config created` (an uninitialized-dir
    reseed — the R8 F3 silent capacity loss — would emit `created`), then run
    `--recreate --slots 3` (a target strictly between the recorded 2 and the old 5,
    the R10 F3 non-convergent region) and assert the dir holds EXACTLY
    slot-0..slot-2 + config 3 — the glob enumeration removed the crash residue that
    an index-range implementation leaves forever.
    Domain arm (complete accept-set coverage, R7 F4): `--recreate` with missing
    `--slots`, `--recreate --slots 0`, `--recreate --slots 65`, and
    `--recreate --slots banana` each exit 2 with a stderr error and a byte-identical
    dir; boundary `--recreate --slots 64` succeeds and leaves slot-0..slot-63 +
    config 64.

The suite spawns ≤3 tiny node children per case — it is itself light and needs no slot.

## 8. Documented limits (pre-filed; not findings)

- Early release on parent-only death, and retention by shell-layer descendants —
  measured semantics §4.2, both surfaced (wait warning; §4.6 rules shrink exposure).
- Priority is bias, not ordering (§4.4).
- `FX_HEAVY_SLOT_DIR` divergence creates independent semaphores, undetectable by
  design; fenced by the AGENTS.md never-set rule (§4.5). `FX_HEAVY_SLOTS` divergence is
  detected and reconciled (§4.5 protocol).
- Metadata may name an exited PID or be unreadable; the warning says so rather than
  guessing (§4.1.6). Never silent.
- `/tmp` clears on reboot — by design (locks are runtime state; the kernel released
  them at death anyway).
- Manual `rm -rf` of a live slot dir is out of contract (§4.5) — it hand-builds the
  recreation races `--recreate` exists to prevent. Consequence is bounded over-
  admission until in-flight commands finish, surfaced by topology-restart notices on
  every subsequent acquisition; the repair is rerunning `--recreate`.
- A wrapped phase can wait when more than `slots` heavy phases overlap — surfaced by
  the wait warning, finite in practice, NOT formally bounded (no-fairness semantics,
  §4.1.2, R9 F2) — ratified under C1 (R2 F6).
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
