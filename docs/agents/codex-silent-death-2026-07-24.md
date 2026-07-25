# Codex CLI silent-death investigation — 2026-07-24

Branch `fix/codex-guard-silent-death`, worktree `/Users/ericweiss/FX-worktrees/codex-guard-silent-death`.

Evidence: `~/codex-silent-death-2026-07-24/` (read-only), **plus** two sources the brief did not know had survived:

- `/private/tmp/claude-501/-Users-ericweiss-FX-Webpage-Template/61a4306e-0acd-4120-9879-fd467543de3e/scratchpad/codex-*/attempt-*.stderr.txt` — the eight dispatches' raw **stderr** (200–385 KB each).
- `~/.codex/sessions/**` — **not** rotated. 651 `codex_exec` sessions since 2026-07-19 were available for base-rate analysis.

Everything is labelled VERIFIED (observed directly) or INFERRED.

---

## 1. Root cause (VERIFIED)

**A machine-local Claude Code hook kills Codex mid-run. It is not an upstream Codex bug, not the wrapper's timeouts, and not the model.**

`~/.claude/hooks/reap-idle-codex.sh`, wired to the **`Stop` and `SubagentStop`** hooks in `~/.claude/settings.json`, SIGTERMs (then SIGKILLs 0.5 s later) every Codex process tree older than `MIN_AGE` (**120 s**) whenever its liveness gate reports no recent activity.

The gate is the defect. `recent_log_activity()` checks only:

```python
LOG_ROOTS = [~/.claude/plugins/data/codex-openai-codex,   # companion jobs only
             ~/.codex/log]                                 # codex-tui.log — TUI only
LOG_FILES = [~/.codex/session_index.jsonl, ~/.codex/history.jsonl]
```

with an explicit exclusion in its own comments:

> `# We do NOT walk ~/.codex/sessions — it holds years of archived rollouts and would make the gate slow and over-sensitive.`

But `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` is **the only path a running `codex exec` writes to**. A non-interactive dispatch never touches any watched path, so the gate always reports "idle", and every `codex exec` older than 120 s is killed at the next turn boundary.

The hook was written to reap _orphaned MCP fleets and finished jobs_. It cannot distinguish a finished Codex from a working one, so it reaps both.

### Direct confirmation

Four heavy repro dispatches (native binary, launched together) died **simultaneously at exactly 275.3 s** by **SIGTERM**:

```
RESULT {"mode":"native","exitCode":null,"signal":"SIGTERM","secs":275.3,"oFileExists":false}   ×4
```

They started ≈21:31:30. 21:31:30 + 275.3 s = **21:36:05**. The reaper's own heartbeat file, `~/.claude/hooks/.reap-codex-last`:

```
2026-07-24 21:36:05  reaped 25 procs (0 orphan MCP + 5 live root(s)), ~1161 MB
```

Same second, and "5 live root(s)" covers the four repro processes. The kill is attributed, not inferred.

### Why this explains every observation

| Observation                                                    | Explanation                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Death time looks arbitrary (113–219 s in prod, 275 s in repro) | Fires on **turn end**, whose phase is unrelated to when Codex started          |
| All concurrent dispatches die at the same instant              | One reaper invocation kills all matching trees                                 |
| Deaths only above ~2 min                                       | `MIN_AGE = 120 s`                                                              |
| Sessions with 0 tool calls always complete                     | They finish in well under 120 s                                                |
| No error anywhere in codex's own output                        | SIGTERM is not an application error                                            |
| `exitCode: 0, signal: null` at the wrapper                     | Defect B below launders the SIGTERM                                            |
| Wrapper survived and retried                                   | The wrapper does not match `CODEX_ROOT_RE`, so it is not in the reaped subtree |
| Raising `--attempt-max-secs` to 700 changed nothing            | The killer is external and time-independent of the wrapper                     |
| Rate degraded over days (75% → 30%)                            | More frequent / shorter agent turns ⇒ more turn boundaries ⇒ more reaps        |
| 58% of tool-using `codex exec` sessions die                    | Any dispatch outliving one turn boundary past 120 s is killed                  |

The light repro (12–15 tool calls, 60–72 s) succeeded 4/4 — under `MIN_AGE`. The heavy repro (>120 s) failed 4/4. **The bug is duration-dependent, not size-, prompt-, or model-dependent.**

---

## 2. VERIFIED — defect B: the Node shim launders the SIGTERM into `exit 0`

This is why the kill was invisible for weeks, and it _is_ a genuine upstream bug.

`codex` on npm is a Node shim, `@openai/codex/bin/codex.js`, that spawns the native Rust binary:

```js
// :224-226 — handlers installed for these three signals
["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) => process.on(sig, () => forwardSignal(sig)));
// :243-246 — on child death by signal, re-raise at self to "terminate with 128+n"
if (childResult.type === "signal") process.kill(process.pid, childResult.signal);
```

Because a handler for that signal is still installed, Node **dispatches to the handler** instead of applying the default disposition. `forwardSignal` calls `child.kill()` on the already-reaped child (no-op) and returns. The event loop empties and Node exits **0**.

Measured with a faithful replica of lines 195-249:

```
grandchild SIGTERM -> shim observed {"type":"signal","signal":"SIGTERM"} -> caller sees exitCode=0 signal=null
grandchild SIGINT  -> shim observed {"type":"signal","signal":"SIGINT"}  -> caller sees exitCode=0 signal=null
grandchild SIGHUP  -> shim observed {"type":"signal","signal":"SIGHUP"}  -> caller sees exitCode=0 signal=null
grandchild SIGKILL -> shim observed {"type":"signal","signal":"SIGKILL"} -> caller sees exitCode=null signal=SIGKILL   (correct)
```

SIGKILL propagates correctly _only_ because no handler is installed for it.

This is exactly why the reaper's SIGTERM presented as `exitCode: 0, signal: null, killedReason: null, no -o file`. The reaper SIGKILLs 0.5 s later, but the shim's exit-0 path wins that race consistently. Bypassing the shim in the repro is what made the SIGTERM visible.

---

## 3. VERIFIED — the 10-second duration quantisation is a red herring

Durations were 180.072 / 150.030 / 140.063 / 150 / 150 / 210 / 130 / 230 s — all multiples of 10 plus <0.1 s, which looks like a poller killing the child.

It is a measurement artefact. `scripts/codex-guard.mjs` polls on `POLL_INTERVAL_SECS` (default 10) and computes `durationSecs = nowSecs() - t0` **after** the loop wakes, so a child that exits during a sleep is only noticed at the next tick. Gaps between the last rollout event and the recorded end were 9.5–11.6 s — all under one poll interval.

**Minor unfixed defect:** `durationSecs` in `result.json` is a poll-quantised overestimate, up to `POLL_INTERVAL_SECS` too large. Fix would be to stamp the time inside the `exited` callback.

---

## 4. VERIFIED — codex's stderr contains no error at all

All eight stderr files end **mid-tool-output**, truncated at an arbitrary byte: no `stream error`, no panic, no `turn aborted`, and no `tokens used` footer (successful repro runs all have one). Every apparent `429`/`502`/`503`/`aborted` hit is repo file content the model was reading.

Corresponding stdout (`attempt-N.transcript.txt`) is **0 bytes** in all eight — with `-o`, codex writes the final message only to the `-o` file. This is load-bearing for §6.

Ruled out by measurement:

- **Context ceiling** — window 258 400; largest per-request input among the eight was 140 919. Failing sessions' max input (median 104 525) overlaps successes (median 81 122), and the global maximum (244 588) belongs to a **successful** session.
- **Loop-iteration cap** — tool calls at death: 6, 8, 11, 11, 13, 13, 13, 19. No clustering.
- **Brief size** — 4 638 B / 5 672 B, far under the ~13 KB cliff.
- **A specific tool** — deaths follow `exec`, `exec_command`, `apply_patch`, `update_plan`, `run`, `write_stdin` alike.
- **Alpha regression** — see §5; 0.144.5 already showed it.

---

## 5. VERIFIED — base rate across 651 sessions

Every `codex_exec` session in `~/.codex/sessions` since 2026-07-19 with ≥1 tool call:

```
651 sessions, 272 completed  →  379 silent deaths (58%)
```

All 272 successes ended on `task_complete`. All 379 failures ended mid-turn on `reasoning` (212) or `token_count` (161). **Zero** error / `turn_aborted` / `stream_error` payloads in the entire corpus.

| Day   | CLI             | Model       | Complete     |
| ----- | --------------- | ----------- | ------------ |
| 07-19 | 0.144.5         | gpt-5.5     | 41/55 (75%)  |
| 07-19 | 0.144.5         | gpt-5.6-sol | 13/21 (62%)  |
| 07-19 | 0.144.6         | gpt-5.6-sol | 33/77 (43%)  |
| 07-20 | 0.144.6         | gpt-5.6-sol | 60/134 (45%) |
| 07-21 | 0.144.6         | gpt-5.6-sol | 19/44 (43%)  |
| 07-22 | 0.144.6         | gpt-5.6-sol | 8/35 (23%)   |
| 07-22 | 0.145.0         | gpt-5.6-sol | 18/49 (37%)  |
| 07-23 | 0.145.0         | gpt-5.6-sol | 32/98 (33%)  |
| 07-24 | 0.145.0         | gpt-5.6-sol | 0/18 (0%)    |
| 07-24 | 0.146.0-alpha.6 | gpt-5.6-sol | 29/97 (30%)  |

Spans four CLI versions and two models — consistent with an environmental cause, and now attributed to §1. The 8/8 failure on PR #580 is an unlucky draw from a ~60%-failure distribution, not a distinct phenomenon.

---

## 6. VERIFIED — defect C: the guard's resume rung was unreachable dead code

`selectRung`, pre-fix:

```js
transcript = readFileSync(attempt.transcriptPath, "utf8");   // stdout — always empty
const m = SESSION_ID_RE.exec(transcript);                    // therefore always null
if (m) { ... return "resume"; }
attempt.recovery = "retry";                                  // always taken
```

The `session id:` banner prints on **stderr** (confirmed in all eight stderr files). With `-o`, stdout is empty — all eight transcripts are 0 bytes. The regex never matched, the rung never fired, and every retry was a fresh `exec` that discarded 2–4 minutes of completed review work. Matches the brief's observation that all eight attempts recorded `kind: "exec"` / `recovery: "retry"`.

**Why tests did not catch it.** `tests/codexGuard/ladder.test.ts` scenarios 4, 10, 11 emit the banner via `{ type: "stdout", ... }`. The fixture is unfaithful to the real CLI, so the rung passed its own tests while being dead in production — the repo's documented "mocked-only tests invite tautological APPROVE" failure mode, inside the wrapper built to police reviews.

**Is `no_o_file` the right shape to resume?** Yes. Session state is intact right up to the death and `codex exec resume <sid>` re-enters it. `no_o_file` was already in the eligibility list; the list was right, the lookup was broken.

---

## 7. Patch

All changes in `scripts/codex-guard.mjs` plus one new test file. TDD: `tests/codexGuard/silentDeath.test.ts` was written first and failed before implementation.

### A. Liveness heartbeat (`beatHeartbeat`) — mitigates the root cause

Writes `$CODEX_HOME/log/codex-guard-heartbeat.log` at attempt start and on every poll where the child **actually produced output**. `~/.codex/log` is already watched by the reaper's gate, so a live dispatch now reports itself as live and is no longer reaped.

- Refreshed only on real output growth, so a genuinely wedged child stops beating and stays reapable — the reaper keeps doing its intended job.
- The guard's own stall / attempt / total timers still bound every dispatch independently.
- Opt out with `CODEX_GUARD_NO_HEARTBEAT=1`.

This is in-repo self-defense. **The correct fix is in the hook** (§8) and is out of this repo's scope.

### B. Prefer the native binary (`resolveNativeBinary`)

Resolves `<pkgRoot>/node_modules/@openai/codex-<platform>/vendor/<triple>/bin/codex` from the shim path and invokes it directly, so a terminating signal survives into `attempt.signal` and classifies as `killed` / `external_signal` instead of `no_o_file`.

- Only redirects when the resolved entrypoint is literally `codex.js`; any other executable, or a custom `CODEX_GUARD_BIN_ARGS` entrypoint, is left alone.
- Soft downgrade: unresolvable layout → keep the configured bin, never throw.
- Opt out with `CODEX_GUARD_NO_NATIVE=1`; recorded as `nativeBinaryResolved` in `result.json`.

**This is what turns an invisible failure into a diagnosable one.** Without it, the next occurrence of any signal-based kill is again indistinguishable from a clean empty run.

### C. Session id from stderr

One line in `selectRung`: `SESSION_ID_RE.exec(stderrText) ?? SESSION_ID_RE.exec(transcript)`. `stderrText` was already read two lines above for the cache-TTL signature. Per-attempt sourcing (§6 wrong-source guard) preserved.

### D. Rollout scrape as a last resort

`tryRolloutScrape` walks `$CODEX_HOME/sessions/**` for rollouts matching any session id seen this run, extracts the last assistant message, and parses a verdict. Runs **only** on terminal no-verdict paths, so it can never override a real verdict. Writes `recovered-from-rollout.txt`, sets `recoveredFrom: "rollout_scrape"`.

**Honest scope: this would NOT have saved the eight runs** — none of their rollouts contains a final agent message. It closes the narrower window where the message was emitted but the `-o` write never landed. Belt-and-braces, as the brief anticipated.

Supporting changes: `attempt.sessionId` latched from stderr on every attempt; `state.seenSids` accumulates them; `result.json` gains `recoveredFrom` and `nativeBinaryResolved`.

### Tests — `tests/codexGuard/silentDeath.test.ts`

| Test                                                                | Catches                                     |
| ------------------------------------------------------------------- | ------------------------------------------- |
| resume rung fires when the banner is on **stderr**                  | the dead rung (§6)                          |
| decoy sid from an earlier non-eligible attempt ignored              | regression on per-attempt sourcing          |
| rollout scrape recovers a verdict when `-o` is absent               | §7D                                         |
| heartbeat file exists and is **fresh** after a run                  | §7A — staleness would not hold a reaper off |
| `CODEX_GUARD_NO_HEARTBEAT=1` suppresses it                          | opt-out                                     |
| native binary **executes** (witness file says `NATIVE`, not `SHIM`) | §7B, behaviorally                           |
| falls back to configured bin when no vendor tree exists             | soft-downgrade path                         |

### Not fixed (deliberate)

- `durationSecs` poll quantisation (§3) — cosmetic, no behavioural impact.
- The `no_o_file` collision class is narrowed, not eliminated: with B in place a signal death classifies as `killed`, but a native `exit(0)` mid-turn would still land in `no_o_file`.

---

## 8. The hook fix — APPLIED on the origin machine 2026-07-24

`~/.claude/hooks/reap-idle-codex.sh` is per-machine config outside this repo. It is the real fix and it affects every Codex dispatch on that machine, from any harness, whether or not it goes through codex-guard. **Any other machine or checkout needs these edits applied by hand.**

### Applied — verification

All four recommendations below landed. `MIN_AGE` 120 → 600, the `SubagentStop` entry removed from `~/.claude/settings.json` (leaving `Stop` only), the sessions glob added, and a per-victim kill log added. Backups: `reap-idle-codex.sh.bak-2026-07-24`, `settings.json.bak-2026-07-24`.

The gate change is load-bearing rather than redundant with an existing signal — at the moment of the check, with five live Codex trees running, every pre-existing liveness signal was stale and only the new one was fresh:

```
session_index.jsonl   647539s (7.5d)   stale
history.jsonl        5177559s (60d)    stale
plugin data logs      702721s (8d)     stale
~/.codex/log             713s          stale (ACTIVE_WINDOW is 360s)
sessions rollouts          1s          FRESH   <- new check
```

Pre-patch that combination returns "idle" and reaps all five. Post-patch, forcing `CODEX_REAP_MIN_AGE=0` to make every root eligible still yields `gated: 5 live codex tree(s) active; no orphans`.

A module-level probe against a temp `$HOME` pins the boundaries: fresh rollout ⇒ active; rollout older than `ACTIVE_WINDOW` ⇒ idle (so a genuinely wedged Codex is still reapable, preserving the hook's original purpose); a fresh file in *yesterday's* directory ⇒ active (a run straddling midnight keeps writing where it started); two days back ⇒ not scanned. Measured cost on a 3 726-file archive: 14.3 ms for the bounded scan vs 44.6 ms for the full walk the original comment was avoiding, and it only runs after the no-Codex-processes fast path.

The kill log was verified behaviorally with a decoy process matching `CODEX_ROOT_RE` under `CODEX_REAP_DRYRUN=1`, asserting the decoy's pid, role, and command line all appear and that the decoy was not signalled:

```
2026-07-24 21:54:36 WOULD-KILL CODEX-ROOT pid=13810 et=2s rss=4MB cmd=…python3 -c import time; time.sleep(120)  # codex-darwin-arm64
2026-07-24 21:54:36 WOULD-KILL child-of-codex:2166 pid=2293 et=140s rss=39MB cmd=npm exec mcp-gsheets@latest
```

Roles are `CODEX-ROOT`, `ORPHAN-MCP-ROOT`, or `child-of-{codex,orphan}:<root pid>`; the verb is `KILL`, or `WOULD-KILL` under dryrun. The file appends to `~/.claude/hooks/codex-reap-kills.log` and self-truncates to its second half past 2 MB. The count-only heartbeat is unchanged.

**Incidental finding:** the ChatGPT desktop app runs its own Codex (`/Applications/ChatGPT.app/Contents/Resources/cua_node/…` processes appear as children of `@openai/codex` roots), so `CODEX_ROOT_RE` matched it and the reaper had been killing it as collateral too.

### The patch

Add a scoped freshness check for the path a live `codex exec` actually writes. The original "years of archived rollouts" concern is avoided by checking only today's and yesterday's date directories rather than walking the tree:

Add a scoped freshness check for the path a live `codex exec` actually writes. The original "years of archived rollouts" concern is avoided by checking only today's and yesterday's date directories rather than walking the tree:

```python
# in recent_log_activity(), alongside the existing LOG_FILES loop
import glob, datetime
for d in (datetime.date.today(), datetime.date.today() - datetime.timedelta(days=1)):
    day = os.path.join(HOME, ".codex", "sessions",
                       f"{d.year:04d}", f"{d.month:02d}", f"{d.day:02d}")
    for p in glob.glob(os.path.join(day, "rollout-*.jsonl")):
        try:
            if now - os.path.getmtime(p) < ACTIVE_WINDOW:
                return True
        except OSError:
            continue
```

Two cheap `glob`s on one or two directories — no tree walk, no sensitivity to archives.

Applied alongside it:

1. **Raise `MIN_AGE`.** 120 s is shorter than a normal review dispatch. Even with the gate fixed, `MIN_AGE` ≥ 600 s gives a wide margin. — done, 120 → 600.
2. **Log every kill with the victim's command line.** The count-only heartbeat is why this cost weeks. `~/.claude/hooks/codex-wedge-watchdog.log` already does this well — mirror that format. — done, `~/.claude/hooks/codex-reap-kills.log`.
3. **Reconsider killing on `SubagentStop`.** A subagent turn ending is a poor proxy for "no Codex work is in flight" when another agent may have a dispatch running. — done, entry removed; `Stop` retained.

---

## 9. Upstream issue draft (codex-cli)

> **Title:** `bin/codex.js` exits 0 when the native binary is killed by SIGINT/SIGTERM/SIGHUP
>
> **Version:** 0.146.0-alpha.6 (code unchanged in 0.144.x/0.145.x), macOS darwin 24.6.0, Node 20.20.1
>
> **Summary.** The Node entrypoint installs handlers for SIGINT/SIGTERM/SIGHUP (`bin/codex.js:224`) and, when the spawned native binary dies by signal, re-raises that signal at itself to "terminate with the expected semantics" (`bin/codex.js:243-246`). Because the handler is still installed, Node runs the handler instead of terminating. The handler calls `child.kill()` on the already-dead child and returns; the event loop empties; **the shim exits 0.** Any caller sees a clean success from a process that was killed.
>
> **Minimal repro** — no codex required; ~30 lines reproducing lines 195-249 verbatim. Spawn a long-lived grandchild through the shim logic, send it SIGTERM, observe the shim's exit status:
>
> ```
> grandchild SIGTERM -> shim observed {"type":"signal","signal":"SIGTERM"} -> caller sees exitCode=0 signal=null
> grandchild SIGKILL -> shim observed {"type":"signal","signal":"SIGKILL"} -> caller sees exitCode=null signal=SIGKILL   (correct)
> ```
>
> SIGKILL behaves correctly only because no handler is installed for it.
>
> **Impact.** With `codex exec -o <file>`, a signalled run yields exit 0, no `-o` file, and nothing on stderr — indistinguishable from a run that legitimately produced nothing. In our case a machine-local process reaper had been SIGTERMing long `codex exec` runs for weeks; because the shim reported success, the kills were invisible and ~58% of tool-using dispatches failed silently before the cause was found.
>
> **Fix.** Remove the handler before re-raising:
>
> ```js
> if (childResult.type === "signal") {
>   process.removeAllListeners(childResult.signal);
>   process.kill(process.pid, childResult.signal);
> }
> ```
>
> A `process.exit(128 + signo)` fallback after the re-raise would additionally guard the handler-still-attached case.

---

## 10. Repro assets

Under the session scratchpad (`.../237feff4-.../scratchpad/repro/`):

- `harness.mjs` — spawns codex with the guard's contract, `native` or `shim` mode, records the **true** `exitCode`/`signal`.
- `prompt-toolheavy.md` — ~15 tool calls, ~60 s. Survives (under `MIN_AGE`).
- `prompt-heavy.md` — full-file reads + wide `rg` sweeps, >120 s. **Reproduces 4/4.**

Minimal reproduction of the whole bug: run any `codex exec` that takes over ~2 minutes, and end a Claude turn while it runs.

The scratchpad is session-scoped and will be reclaimed, so the standalone proof of the shim defect (§2 — the artifact the upstream issue needs) is inlined here. It needs no Codex install and runs in about a second:

```js
// shim-repro.mjs — replicates @openai/codex/bin/codex.js:195-249 exit propagation.
import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1e6)"], { stdio: "inherit" });
const forwardSignal = (s) => {
  if (child.killed) return;
  try {
    child.kill(s);
  } catch {}
};
["SIGINT", "SIGTERM", "SIGHUP"].forEach((s) => process.on(s, () => forwardSignal(s)));
const r = await new Promise((res) =>
  child.on("exit", (code, signal) =>
    res(signal ? { type: "signal", signal } : { type: "code", exitCode: code ?? 1 }),
  ),
);
process.stderr.write(`shim observed: ${JSON.stringify(r)}\n`);
if (r.type === "signal") process.kill(process.pid, r.signal);
else process.exit(r.exitCode);
```

```js
// driver.mjs — signal the GRANDCHILD, then report what the caller sees from the shim.
import { spawn, execSync } from "node:child_process";
const sig = process.argv[2] ?? "SIGTERM";
const shim = spawn(process.execPath, ["shim-repro.mjs"], { stdio: ["ignore", "pipe", "inherit"] });
setTimeout(() => {
  for (const p of execSync(`pgrep -P ${shim.pid}`).toString().trim().split("\n"))
    process.kill(Number(p), sig);
}, 500);
shim.on("exit", (code, signal) =>
  console.log(`caller saw exitCode=${code} signal=${signal} (grandchild got ${sig})`),
);
```

`node driver.mjs SIGTERM` prints `exitCode=0 signal=null`; `node driver.mjs SIGKILL` prints `exitCode=null signal=SIGKILL`.
