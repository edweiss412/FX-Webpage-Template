# codex-guard — watchdog wrapper for `codex exec` dispatches

**Date:** 2026-07-19 (R1 revision)
**Status:** Draft (autonomous ship run; user approved design in-session)
**Owner:** Claude (Opus/Fable harness)

## 1. Problem

Direct `codex exec` dispatches (adversarial reviews, task briefs) fail in recurring, well-documented ways, and every recovery today is a manual, memory-driven procedure the dispatching Claude session must remember and execute step by step. Evidence:

- `~/.claude/hooks/codex-wedge-watchdog.log` shows 8+ companion WEDGE events in the 48h before this spec, two escalating to KILL (~16 min each). After each kill, the launching session must perform the manual `codex exec` fallback dance.
- Failure classes and their fixes are banked in memory files (`feedback_codex_*`), but memory files are invisible to Codex sessions and applied inconsistently even by Claude sessions (documented in `feedback_codex_exec_killed_fallback_selfreview_ci`: six wedge/kill cycles burned before a known one-line fix was applied).
- Upstream root causes are open and unfixable locally: openai/codex#23807 (300s stalls, stream disconnected) and openai/codex#14470 (macOS MCP-init hang) — both verified OPEN 2026-07-19. Installed codex-cli 0.144.5 (current is 0.144.6).

Goal: one command that launches `codex exec` with every banked-correct flag, watches for stalls, walks the known recovery ladder automatically, and always terminates with a machine-readable outcome — so the calling session never hangs, never misapplies the ladder, and fails fast to its documented fallback when Codex is truly dead.

## 2. Scope

**In scope**

- `scripts/codex-guard.mjs` — plain Node (no TS, no repo runtime deps), executable CLI.
- `tests/codexGuard/*.test.ts` — vitest unit tests driven by a fake codex binary fixture (no real codex, CI-safe).
- AGENTS.md documentation subsection (usage contract + shim install one-liner).
- Per-machine global shim `~/.claude/bin/codex-guard` (3-line exec of the repo copy; created post-merge on this machine, documented for others — the shim itself is NOT a tracked file).

**Out of scope (deliberate — do not relitigate)**

- Companion (app-server) internals, plugin patching, `codex-review-retry.mjs`: untouched. The companion path keeps its existing guards; this wrapper is the *rescue* it falls back to, not a rewiring of it.
- `~/.claude/hooks/codex-launch-guard.sh` and `codex-wedge-watchdog.sh`: untouched (machine-level infra, outside the repo). The wrapper is designed to coexist (see §8).
- Root-causing upstream codex bugs.
- Multi-process coordination beyond the two named mechanisms (result.json-exists refusal §7; cache-rung lock §6). Two guards deliberately pointed at the SAME `--out` concurrently is a caller bug the refusal check catches only at startup; mid-run same-dir races are out of scope.

## 3. CLI contract

```
node scripts/codex-guard.mjs review \
  --brief <file>            # required: reviewer prompt/brief text file
  --cwd <dir>               # required: working root for codex (-C) and for `resume`
  --out <dir>               # required: output dir (created if absent; must not already contain result.json)
  [--artifact <file>]...    # repeatable: files to inline after the brief; requires --fallback
  [--fallback]              # companion-wedge rescue mode: inline artifacts + budget directives
  [--label <name>]          # optional tag recorded in result.json ([A-Za-z0-9_-]{1,64})
  [--max-attempts <n>]      # default 3
  [--attempt-max-secs <n>]  # default 1200, max 1440 (see §8)
  [--total-max-secs <n>]    # default 1500
  [--stall-secs <n>]        # default 420
  [--first-output-secs <n>] # default 120
```

One subcommand (`review`). No config file. Numeric flags accept positive integers. Every timing constant in §11 (including `POLL_INTERVAL_SECS` and `KILL_GRACE_SECS`, which have no flags) also has an env override `CODEX_GUARD_<NAME>` accepting positive **decimals** — the test seam for sub-second timing. Flags win over env; both are validated by the same rules (§7).

**Path resolution:** `--brief`, `--cwd`, `--out`, every `--artifact`, and `CODEX_HOME` are resolved to absolute paths against the wrapper's launch cwd at startup, before any spawn. All child argv paths (`-o`, `-C`) are absolute thereafter — a resume attempt spawned with a different child cwd cannot re-anchor them.

**Outputs (all under `--out`):**

- `attempt-<n>.transcript.txt` — stdout of that attempt.
- `attempt-<n>.stderr.txt` — stderr of that attempt (kept separate: failure-signature matching reads ONLY stderr, §6).
- `attempt-<n>.last-message.txt` — codex's `-o` file for that attempt.
- `models_cache.bak.json` — backup, only if the cache-TTL rung fired.
- `result.json` — the contract (see §6).

**Exit codes:**

| Code | Meaning | result.json |
| --- | --- | --- |
| 0 | Wrapper ran to a defined outcome | written; outcome in `status` |
| 2 | Usage error (bad/missing flags, unreadable brief, non-empty prior `result.json`) | never written |
| 3 | Wrapper internal error (spawn ENOENT, unwritable transcript, kill failure, signal-interrupted wrapper, result-write failure) | best-effort write with `status:"no_verdict"`, `failureReason:"wrapper_error"` (or `"interrupted"`), `error` string; if even that write fails, stderr carries the error and exit is still 3 |

Rationale (do not relitigate): the caller launches the wrapper as a background Bash task and reads `result.json` on the exit notification; encoding review outcome in the exit code would make "codex said NEEDS-ATTENTION" look like an infra failure. Exit 3 exists precisely so infra failure IS distinguishable.

**Wrapper signal handling:** on SIGINT/SIGTERM, kill the live child process group, best-effort `result.json` (`failureReason:"interrupted"`), exit 3. If the wrapper is SIGKILLed, orphaned codex children are possible — accepted limitation; the machine wedge-watchdog (EXEC_KILL 3000s) is the backstop.

## 4. Launch invariants (the banked flags)

A **fresh attempt** spawns exactly:

```
codex exec --skip-git-repo-check -s read-only -C <cwd> \
  -c model_reasoning_effort=high -o <out>/attempt-<n>.last-message.txt
```

A **resume attempt** (rung 2 only) spawns exactly:

```
codex exec resume <sid> -c model_reasoning_effort=high -o <out>/attempt-<n>.last-message.txt
```

with the child's cwd set to `--cwd` (resume accepts no `-C`; verified `codex exec resume --help`). `--skip-git-repo-check` and `-s` are deliberately absent on resume: they are not documented for the subcommand, and the resumed session retains its original sandbox. Scenario 4 (§9) pins both argv shapes exactly.

- **No `-m` flag** — ChatGPT-account auth 400s on explicit model ids (`feedback_codex_exec_model_id_chatgpt_account`).
- **`-s read-only`** — verified valid sandbox value (codex-cli 0.144.5 help).
- **Prompt via stdin pipe, never argv** (both attempt kinds). The wrapper writes the composed prompt (or, for resume, the fixed emit-verdict prompt: "Output your final findings list and the mandatory final line now: VERDICT: …") to the child's stdin and closes it. This (a) satisfies the stdin-EOF requirement (`feedback_codex_exec_needs_stdin_closed`), and (b) sidesteps macOS ARG_MAX for large inlined artifacts. Codex CLI: "If not provided as an argument … instructions are read from stdin" (verified `codex help exec`).
- **stdout → transcript, stderr → stderr file** (§3). The `-o` file is the verdict source of truth; the transcript is diagnostics; stderr is the signature-matching input (`feedback_codex_exec_output_last_message_flag`, §6).
- Child is spawned **detached in its own process group**; kills signal the group (codex spawns helpers). After any kill, the wrapper waits for child exit (bounded 10s) before the next spawn — no overlapping attempts.

**Prompt composition:**

- Default: brief file contents verbatim. `--artifact` without `--fallback` is a usage error (exit 2) — one composition rule per mode, no silent third behavior.
- `--fallback`: brief + for each `--artifact`, a delimited block (`===== ARTIFACT: <basename> =====` … `===== END ARTIFACT =====`) + a fixed trailer with the banked budget directives: citations pre-verified, do not re-read files needlessly, "REACH A VERDICT — budget your reading" (`feedback_codex_companion_appserver_wedge_codex_exec_fallback` step 3, `feedback_codex_exec_review_verdict_marker` item 3).
- Combined prompt cap: `PROMPT_MAX_BYTES` (§11) → usage error above.

## 5. Stall detection and kill precedence

Per attempt, the wrapper polls transcript+stderr sizes every `POLL_INTERVAL_SECS`:

- **`total_timeout`** — run wall clock > `total-max-secs`: kill the live attempt, end the run.
- **`attempt_timeout`** — attempt wall clock > `attempt-max-secs`.
- **`stall`** — after first output byte (transcript or stderr): no growth in either for `stall-secs`.
- **`no_output`** — no first byte within `first-output-secs`.

**Precedence when several are true in the same poll: `total_timeout` > `attempt_timeout` > `stall` > `no_output`.** Every kill records its `killedReason`; the total deadline actively kills and reaps (it is not merely a post-attempt check — §9 scenario 9 pins this). All wall-clock caps are soft by up to `POLL_INTERVAL_SECS + KILL_GRACE_SECS` — documented, accepted.

Why 420s stall and not the memory-documented 180–210s: upstream #23807 is a stall of *exactly 300s that then recovers*. A 210s trigger would kill runs that would have healed at 300s; 420s clears the recoverable stall with margin while staying far below the machine watchdog's 1500s notify threshold. Why file growth alone (no CPU pairing): between-turns quiet periods show 0% CPU legitimately; sustained output silence for 7 minutes is itself the sustained signal.

Kill = SIGTERM to the process group, SIGKILL after `KILL_GRACE_SECS`.

## 6. Recovery ladder and result contract

An attempt **fails** when any of: killed by §5; exited non-zero; **terminated by an external signal** (`exitCode:null` + `signal` recorded, `killedReason:"external_signal"` — e.g. the machine watchdog); or exited zero with a `failureShape` of `no_o_file` / `empty_o_file` / `no_marker` / `unrecognized_verdict`.

After a failed attempt, choose the FIRST matching rung. **Rung matching reads ONLY the stderr file of the attempt that just failed** — never earlier attempts (a historical match must not shadow later rungs), never stdout (reviewer prose discussing these very signatures must not trigger a destructive recovery; codex's own infra errors log to stderr).

1. **Cache-TTL wedge** — stderr matches `/codex_models_manager::manager: failed to renew cache TTL/`:
   acquire the cross-process lock `$CODEX_HOME/.codex-guard-cache-lock` (atomic `mkdir`); on success, back up `$CODEX_HOME/models_cache.json` to `--out`, delete it, release the lock, retry fresh. Lock held by a sibling, or backup/delete fails, or `CODEX_HOME`/cache file absent → the rung is **skipped** but records itself in the attempt (`recovery:"cache_ttl_skipped"`). **Matched-or-skipped, the rung consumes its once-per-run cap** — a stale signature can never shadow rung 2 on later failures. (`feedback_codex_models_cache_ttl_wedge_fix`; deleting the cache is safe for sibling codex processes by design of the fix — absence forces a fresh full fetch; the lock exists to serialize the backup+delete pair itself.)
2. **Truncation resume** — process exited zero, `-o` invalid, and THIS attempt's transcript contains a session id (`/session id:?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i` — never `ls ~/.codex/sessions`, which races with parallel sessions): spawn the resume attempt (§4). Once per run.
3. **Generic transient** — anything else: plain retry. No per-run cap of its own (bounded by the budgets).

**Budgets and admission.** `--max-attempts` counts every spawned attempt (fresh + resume). Before spawning any next attempt — including executing rung side effects like the cache delete — the wrapper requires `remaining total budget ≥ MIN_ADMISSION_SECS` (§11); otherwise the run ends (`failureReason:"total_timeout"`) without the side effect. When an attempt completes and attempts are exhausted, `failureReason:"attempts_exhausted"` — checked before the admission gate, so simultaneous exhaustion deterministically reports `attempts_exhausted`.

**Verdict parsing** (each `-o` file, in order):

1. Strip fenced code blocks (``` … ```) — a verdict line quoted in a fence is never the operative verdict.
2. Collect lines matching `/^\s*VERDICT:\s*(.+)$/m`; discard any containing two or more known outcomes or the literal " or " (echoed-format-instruction false positive, `feedback_codex_exec_review_verdict_marker`).
3. Take the LAST survivor. Normalize the payload: trim; strip surrounding markdown emphasis (`*`, `_`, backticks) and trailing punctuation (`.,;:!`); uppercase.
4. Known outcomes: `APPROVE`, `NEEDS-ATTENTION`, `BLOCKING` → `status:"verdict"`, `verdict:<outcome>`. Any other survivor → the attempt FAILS with `failureShape:"unrecognized_verdict"`; `verdictLine` preserves the raw line. No survivors → `no_marker`.

`status:"verdict"` therefore ALWAYS means a recognized outcome; consumers may branch on `status` alone.

**`result.json`:**

```json
{
  "guardVersion": 1,
  "label": "spec-r1" ,
  "status": "verdict" | "no_verdict",
  "verdict": "APPROVE" | "NEEDS-ATTENTION" | "BLOCKING" | null,
  "verdictLine": "<raw last surviving line, even when unrecognized>" | null,
  "lastMessagePath": "<abs path of the attempt that produced the verdict>" | null,
  "attempts": [
    {
      "n": 1,
      "kind": "exec" | "resume",
      "pid": 12345 | null,
      "exitCode": 0 | null,
      "signal": "SIGKILL" | null,
      "killedReason": "no_output" | "stall" | "attempt_timeout" | "total_timeout" | "external_signal" | null,
      "failureShape": "no_o_file" | "empty_o_file" | "no_marker" | "unrecognized_verdict" | "nonzero_exit" | "killed" | "spawn_error" | null,
      "recovery": "cache_ttl" | "cache_ttl_skipped" | "resume" | "retry" | null,
      "transcriptPath": "<abs>", "stderrPath": "<abs>", "lastMessagePath": "<abs>",
      "durationSecs": 314
    }
  ],
  "failureReason": "attempts_exhausted" | "total_timeout" | "wrapper_error" | "interrupted" | null,
  "error": "<internal error detail>" | null,
  "startedAt": "<ISO8601>", "endedAt": "<ISO8601>"
}
```

Semantics: `recovery` on attempt N = the rung selected AFTER N failed (null on success or run end); `pid:null` + `failureShape:"spawn_error"` = the child never started; `exitCode:null` + `signal` set = signal death. Every key always present (`null`, never omitted). `attempts` is non-empty on every exit-0 result and MAY be empty on an exit-3 best-effort result (wrapper died before the first spawn).

## 7. Input guard conditions

| Input | Missing | Invalid | Notes |
| --- | --- | --- | --- |
| `--brief` | exit 2 | unreadable/empty file → exit 2 | required; resolved absolute |
| `--cwd` | exit 2 | not a directory → exit 2 | required; resolved absolute |
| `--out` | exit 2 | created recursively; unwritable → exit 2; **already contains `result.json` → exit 2** (reuse refusal — prevents stale-result misreads and same-dir sibling collisions at startup) | required; resolved absolute |
| `--artifact` | n/a | unreadable → exit 2; **present without `--fallback` → exit 2** | resolved absolute |
| `--label` | `null` in result.json | chars outside `[A-Za-z0-9_-]` or len>64 → exit 2 | |
| numeric flags | defaults §11 | non-positive/non-integer → exit 2; `--attempt-max-secs` > 1440 → exit 2 (§8 watchdog bound); `--stall-secs` or `--first-output-secs` ≥ `--attempt-max-secs` → exit 2 | env overrides: positive decimals allowed, same bounds |
| `CODEX_HOME` | defaults `~/.codex` | resolved absolute; dir/cache absent → rung 1 skips (still consumes cap, §6) | |

## 8. Non-interference contract (existing infra)

| Existing guard | Interaction |
| --- | --- |
| `~/.claude/hooks/codex-launch-guard.sh` (PreToolUse: denies foreground `codex exec` Bash calls) | Wrapper invocations (`node scripts/codex-guard.mjs …`) contain no `codex exec` token → not denied. Convention (documented in AGENTS.md): still launch the wrapper with `run_in_background: true`; its exit notification is the caller's completion signal. The wrapper's own internal spawns are invisible to PreToolUse hooks. |
| Per-machine `.claude/hooks/bash-guard.sh` in the checkout (gitignored, not a tracked file; blocks `codex exec` without `< /dev/null`) | Same: no `codex exec` substring in the caller's command line. Internal spawn closes stdin by construction (§4). |
| `codex-wedge-watchdog.sh` (`EXEC_MAX=1500` notify, `EXEC_KILL=3000`) | Watchdog sees the wrapper's codex children in `ps`. `--attempt-max-secs` is capped at 1440 by validation (§7) so a wrapper-managed attempt can never reach even the notify tier. If an external kill lands anyway, the child dies by signal → `external_signal` failed attempt → ladder proceeds normally (§6). |
| `codex-review-retry.mjs` + companion | Untouched. Companion wedge → the caller runs `codex-guard review --fallback` as the rescue (replaces the manual multi-step procedure). |

Double-retry audit: the wrapper retries only its OWN child processes; no path routes a companion call through the wrapper, so retry multiplication is structurally impossible.

## 9. Testing (TDD; vitest; `tests/codexGuard/*.test.ts`)

All tests drive the wrapper with `CODEX_GUARD_BIN` pointing at a **fake codex fixture** (`tests/codexGuard/fixtures/fake-codex.mjs`) whose behavior is selected per-test via a scenario file; the fake records its argv, cwd, and stdin to disk for assertion. Real codex is never spawned (CI has no codex CLI). `CODEX_HOME` points at a temp dir per test. All timing via `CODEX_GUARD_*` decimal env overrides (incl. poll interval + kill grace — §3) for sub-second runs.

Scenarios (each names the broken implementation it catches):

1. **Happy path** — verdict in `-o`; assert result.json, exact fresh-attempt argv (flag drift), stdin delivery byte count (argv regression), child cwd.
2. **Echoed-brief false positive + fence + normalization** — `-o` contains the format-instruction line, a fenced `VERDICT: APPROVE`, then real `VERDICT: **NEEDS-ATTENTION**.`; assert parsed NEEDS-ATTENTION (parser laxity/strictness both directions).
3. **Cache-TTL rung** — TTL signature on STDERR → backup+delete+lock released+retry; same signature on STDOUT only → rung NOT fired (stream-confusion catch); cache recreated by fake, second TTL failure → rung not re-fired (cap).
4. **Truncation resume** — assert resume argv shape exactly, child cwd = `--cwd`, absolute `-o`; decoy session id present in a PREVIOUS attempt's transcript and a decoy sessions dir in fake `CODEX_HOME` — assert the CURRENT attempt's sid used (wrong-source catch).
5. **Stall kill** — one byte then silence; assert kill, `killedReason:"stall"` (dead-detector synthetic positive).
6. **No-output kill** — silence from spawn.
7. **Exhaustion** — 3 transient failures; assert `attempts_exhausted`, exit 0, 3 attempt records with `recovery:"retry"`, `"retry"`, `null`.
8. **Usage errors** — table-driven: missing brief, artifact-without-fallback, bad label, attempt-max > 1440, stall ≥ attempt-max, non-empty `result.json` in `--out`.
9. **Total-timeout mid-attempt** — budgets tuned so total expires while attempt 2 is live; assert `killedReason:"total_timeout"` on attempt 2, AND the fake's pidfile process is actually dead (kill really happened, not just bookkeeping).
10. **Ordered ladder in one run** — attempt 1 TTL (stderr) → attempt 2 truncation+sid → attempt 3 resume succeeds; assert rung order cache_ttl → resume and `kind` sequence exec, exec, resume.
11. **Cache-skip consumes cap** — `CODEX_HOME` absent; TTL signature fires → `recovery:"cache_ttl_skipped"`; NEXT failure is truncation → assert resume STILL reachable (shadowing catch).
12. **Stall clock resets** — fake emits a byte every interval < stall window for 3+ windows, then verdict; assert NO kill (false-stall catch).
13. **External signal** — test SIGKILLs the fake mid-run; assert `signal` recorded, `killedReason:"external_signal"`, ladder proceeds.
14. **Wrapper internal error** — `CODEX_GUARD_BIN` pointing at a nonexistent path; assert exit 3, best-effort result.json with `failureReason:"wrapper_error"`, `attempts[0].failureShape:"spawn_error"`.
15. **Admission gate** — remaining budget < MIN_ADMISSION_SECS after attempt 1 fails with TTL signature; assert run ends `total_timeout` AND the cache file was NOT deleted (side-effect-without-successor catch).

Anti-tautology: expected values derive from fixture scenario definitions (random session ids asserted end-to-end; fake-recorded argv compared against §4 strings built independently in the test); no assertion merely checks "spawn was called"; kill assertions check real process liveness via the fake's pidfile.

**Meta-test inventory (declared per AGENTS.md):** none of the existing structural registries apply — no Supabase call boundary, no admin route/table, no §12.4 code, no advisory lock, no tile/sentinel surface, no mutation HTTP/server-action surface (a local CLI script is not a mutation surface unit per invariant 10's definition). Declared explicitly: **no registry rows added; no new meta-test created.** The exact-argv assertions (scenarios 1, 4) are the structural pin for flag drift.

## 10. Documentation (AGENTS.md)

New subsection under "Codex-specific notes": **"Codex dispatch guard (`codex-guard`)"** —

- All direct `codex exec` review/task dispatches SHOULD go through `node scripts/codex-guard.mjs review …` (backgrounded).
- Companion app-server wedge rescue = `codex-guard review --fallback --artifact <spec-or-plan> …` (replaces the manual fallback procedure; memory files stay as background, the AGENTS.md text is the cross-CLI durable contract).
- Result contract: read `result.json`; `status:"no_verdict"` → apply the existing skip/self-review ladder (`feedback_codex_exec_killed_fallback_selfreview_ci`) — the wrapper bounds the retry burn, it does not change the escalation policy. Exit 3 = wrapper infra failure, not a Codex outcome.
- Brief authoring: the brief MUST instruct the reviewer to end with a final `VERDICT: <outcome>` line using one of APPROVE / NEEDS-ATTENTION / BLOCKING (the wrapper detects verdicts, it does not inject the instruction).
- Fresh `--out` per dispatch (timestamped dir); the wrapper refuses a dir that already holds a `result.json`.
- Shim install one-liner for other machines/checkouts:
  `mkdir -p ~/.claude/bin && printf '#!/bin/sh\nexec node "$HOME/FX-Webpage-Template/scripts/codex-guard.mjs" "$@"\n' > ~/.claude/bin/codex-guard && chmod +x ~/.claude/bin/codex-guard`

## 11. Defaults (single source of truth)

| Constant | Default | Bound / note |
| --- | --- | --- |
| `MAX_ATTEMPTS` | 3 | ≥1 |
| `ATTEMPT_MAX_SECS` | 1200 | validation max 1440 (< watchdog notify 1500) |
| `TOTAL_MAX_SECS` | 1500 | |
| `STALL_SECS` | 420 | > upstream 300s recoverable stall; < attempt max |
| `FIRST_OUTPUT_SECS` | 120 | < attempt max |
| `POLL_INTERVAL_SECS` | 10 | env-only override |
| `KILL_GRACE_SECS` | 5 | env-only override |
| `MIN_ADMISSION_SECS` | 120 | env-only override |
| `PROMPT_MAX_BYTES` | 2000000 | |
| Cache-TTL rung | once per run | matched-or-skipped both consume |
| Resume rung | once per run | |

Every other section referencing a number refers here. Env override names: `CODEX_GUARD_` + constant name.

## 12. Flag lifecycle (per AGENTS.md flag table rule)

| Flag | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| `--fallback` | argv only | caller | prompt composer (§4); validation (§7) | inlines artifacts + budget trailer; gates `--artifact` |
| `--label` | argv → result.json | caller | result.json consumers | tagging only, no behavior |
| numeric flags | argv/env | caller/tests | §5/§6 budgets; §7 validation | timing/attempt bounds |
| `CODEX_GUARD_BIN` | env | tests | spawner | test seam; absent → `codex` from PATH |
| `CODEX_HOME` | env | codex itself | rung 1 lock/cache paths | cache-clear target |

No zombie flags: every row has all four columns live.

## 13. Watchpoints (reviewer preempts — verified deliberate, do not relitigate)

- Exit-0-with-`result.json` regardless of verdict outcome; exit 3 for wrapper infra (§3 rationale).
- Prompt via stdin pipe, not argv (§4 rationale).
- `STALL_SECS` 420 exceeds the memory-documented 180–210s (§5 rationale — the 300s recoverable upstream stall).
- File-growth-only stall detection, no CPU pairing (§5 rationale).
- The wrapper does not extend the PreToolUse guards to cover itself; background-launch is a documented convention, not enforced (machine-level hooks are out of repo scope; §8).
- Plain `.mjs`, not TS: the global shim must run via bare `node` outside the repo's toolchain.
- Same-`--out` mid-run races and wrapper-SIGKILL orphans: accepted limitations, documented (§2, §3).
- Soft cap overrun by ≤ poll + grace (§5): accepted, documented.
