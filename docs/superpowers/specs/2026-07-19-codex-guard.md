# codex-guard — watchdog wrapper for `codex exec` dispatches

**Date:** 2026-07-19
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

## 3. CLI contract

```
node scripts/codex-guard.mjs review \
  --brief <file>            # required: reviewer prompt/brief text file
  --cwd <dir>               # required: working root for codex (-C) and for `resume`
  --out <dir>               # required: output dir (created if absent)
  [--artifact <file>]...    # repeatable: files to inline after the brief (fallback mode)
  [--fallback]              # companion-wedge rescue mode: inline artifacts + budget directives
  [--label <name>]          # optional tag recorded in result.json ([A-Za-z0-9_-]{1,64})
  [--max-attempts <n>]      # default 3
  [--attempt-max-secs <n>]  # default 1200
  [--total-max-secs <n>]    # default 1500
  [--stall-secs <n>]        # default 420
  [--first-output-secs <n>] # default 120
```

One subcommand (`review`). No config file. All knobs are flags with env-var overrides (`CODEX_GUARD_<FLAG>`, e.g. `CODEX_GUARD_STALL_SECS`) used by tests; flags win over env.

**Outputs (all under `--out`):**

- `attempt-<n>.transcript.txt` — merged stdout+stderr of that attempt.
- `attempt-<n>.last-message.txt` — codex's `-o` file for that attempt.
- `models_cache.bak.json` — backup, only if the cache-TTL recovery fired.
- `result.json` — the contract (see §6).

**Exit codes:** `0` = wrapper completed and wrote `result.json` (regardless of whether a verdict was obtained — the outcome lives in `result.json.status`); `2` = usage error (bad/missing flags, unreadable brief, invalid numbers) reported on stderr, no `result.json`. Rationale (do not relitigate): the caller launches the wrapper as a background Bash task and reads `result.json` on the exit notification; encoding review outcome in the exit code would make "codex said NEEDS-ATTENTION" look like an infra failure.

## 4. Launch invariants (the banked flags)

Each attempt spawns exactly:

```
codex exec --skip-git-repo-check -s read-only -C <cwd> \
  -c model_reasoning_effort=high -o <out>/attempt-<n>.last-message.txt
```

- **No `-m` flag** — ChatGPT-account auth 400s on explicit model ids (`feedback_codex_exec_model_id_chatgpt_account`).
- **`-s read-only`** — verified valid sandbox value (codex-cli 0.144.5 help).
- **Prompt via stdin pipe, never argv.** The wrapper writes the composed prompt to the child's stdin and closes it. This (a) satisfies the stdin-EOF requirement (`feedback_codex_exec_needs_stdin_closed` — codex hangs forever on open stdin; a closed pipe is the documented-safe delivery), and (b) sidesteps macOS ARG_MAX limits for large inlined artifacts (observed transcripts reach 600KB–1.2MB). Codex CLI: "If not provided as an argument … instructions are read from stdin" (verified `codex help exec`).
- **Transcript captured** to `attempt-<n>.transcript.txt` (stdout+stderr merged). The `-o` file is the verdict source of truth; the transcript is diagnostics + signature-matching input (`feedback_codex_exec_output_last_message_flag`).
- Child is spawned in its own process group; kills target the group (codex spawns helpers).

**Prompt composition:**

- Default: brief file contents verbatim.
- `--fallback` (companion-rescue mode): brief + for each `--artifact`, a delimited block (`===== ARTIFACT: <basename> =====` … `===== END ARTIFACT =====`) + a fixed trailer with the banked budget directives: citations pre-verified, do not re-read files needlessly, "REACH A VERDICT — budget your reading" (`feedback_codex_companion_appserver_wedge_codex_exec_fallback` step 3, `feedback_codex_exec_review_verdict_marker` item 3).
- Combined prompt cap: 2,000,000 bytes → usage error above (guards runaway artifact lists; stdin delivery has no hard OS limit but a >2MB brief is a caller bug).

## 5. Stall detection

Per attempt, the wrapper polls the transcript file every 10s:

- **No first byte within `first-output-secs` (120s)** → kill, attempt failed (`killedReason: "no_output"`).
- **After first byte: no transcript growth for `stall-secs` (420s)** → kill, attempt failed (`killedReason: "stall"`).
- **Attempt wall clock > `attempt-max-secs` (1200s)** → kill, attempt failed (`killedReason: "attempt_timeout"`).

Why 420s and not the memory-documented 180–210s: upstream #23807 is a stall of *exactly 300s that then recovers*. A 210s trigger would kill runs that would have healed at 300s; 420s clears the recoverable stall with margin while staying far below the machine watchdog's 1500s notify threshold. Why file growth alone (no CPU pairing): between-turns quiet periods show 0% CPU legitimately (`feedback_codex_exec_needs_stdin_closed` diagnostic discipline); sustained *transcript* silence for 7 minutes is itself the sustained signal — codex exec streams events during normal operation, and the one known benign silence (the 300s stall) is cleared by the threshold.

Kill = SIGTERM to the process group, SIGKILL after 5s grace.

## 6. Recovery ladder and result contract

An attempt **fails** when: the process was killed (§5), exited non-zero, or exited zero with a missing/empty `-o` file or no valid verdict line in it.

After a failed attempt, choose the FIRST matching rung (then loop while attempts and total budget remain):

1. **Cache-TTL wedge** — transcript (any attempt so far) matches `/renew cache TTL|codex_models_manager/`: back up `$CODEX_HOME/models_cache.json` (default `~/.codex/`) to `--out`, delete it, retry fresh. **At most once per run** (`feedback_codex_models_cache_ttl_wedge_fix`).
2. **Truncation resume** — process exited zero, `-o` invalid, and the transcript contains a session id (`/session id:?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i` against THIS attempt's transcript only — never `ls ~/.codex/sessions`, which races with parallel sessions): run `codex exec resume <sid> -o <new-file>` with prompt "Output your final findings list and the mandatory final line now: VERDICT: …" from `--cwd` (resume has no `-C`; verified `codex exec resume --help`). **At most once per run** (`feedback_codex_exec_output_last_message_flag` recovery note).
3. **Generic transient** — anything else (stall kill, non-zero exit, ECONNRESET/ETIMEDOUT in tail): plain retry.

Budgets: `--max-attempts` (default 3, counting the initial attempt and every rung execution including `resume`) and `--total-max-secs` (default 1500) — whichever exhausts first ends the run with `status: "no_verdict"`.

**Verdict parsing** (applies to each `-o` file): scan for lines matching `/^\s*VERDICT:\s*(.+)$/m`, EXCLUDING any line that contains two or more known outcomes or the literal " or " (echoed-format-instruction false positive, `feedback_codex_exec_review_verdict_marker`). Known outcomes: `APPROVE`, `NEEDS-ATTENTION`, `BLOCKING`. Last surviving match wins. A `-o` file with content but no surviving verdict line → attempt failed (`failureShape: "no_marker"`).

**`result.json`:**

```json
{
  "guardVersion": 1,
  "label": "spec-r1" ,
  "status": "verdict" | "no_verdict",
  "verdict": "APPROVE" | "NEEDS-ATTENTION" | "BLOCKING" | "OTHER" | null,
  "verdictLine": "VERDICT: APPROVE" | null,
  "lastMessagePath": "<out>/attempt-2.last-message.txt" | null,
  "attempts": [
    { "n": 1, "exitCode": 0, "killedReason": null, "recovery": "cache_ttl",
      "failureShape": "no_o_file", "durationSecs": 314 }
  ],
  "failureReason": "attempts_exhausted" | "total_timeout" | null,
  "startedAt": "<ISO8601>", "endedAt": "<ISO8601>"
}
```

`verdict: "OTHER"` = a surviving `VERDICT:` line whose payload isn't a known outcome; `verdictLine` carries it raw. Guard conditions: every field always present; `attempts` never empty on exit 0; unknown/absent values are `null`, never omitted keys.

## 7. Input guard conditions

| Input | Missing | Invalid | Notes |
| --- | --- | --- | --- |
| `--brief` | exit 2 | unreadable/empty file → exit 2 | required |
| `--cwd` | exit 2 | not a directory → exit 2 | required |
| `--out` | exit 2 | created recursively; unwritable → exit 2 | required |
| `--artifact` | n/a (repeatable, optional) | unreadable → exit 2 | only meaningful with `--fallback`; allowed without (inlined the same) |
| `--label` | omitted from result.json → `null` | chars outside `[A-Za-z0-9_-]` or len>64 → exit 2 | |
| numeric flags | defaults §3 | non-positive/non-integer → exit 2 | env overrides validated identically |
| `CODEX_HOME` | defaults to `~/.codex` | missing dir → rung 1 skipped (nothing to clear), noted in attempt record | |

## 8. Non-interference contract (existing infra)

| Existing guard | Interaction |
| --- | --- |
| `~/.claude/hooks/codex-launch-guard.sh` (PreToolUse: denies foreground `codex exec` Bash calls) | Wrapper invocations (`node scripts/codex-guard.mjs …`) contain no `codex exec` token → not denied. Convention (documented in AGENTS.md): still launch the wrapper with `run_in_background: true`; its exit notification is the caller's completion signal. The wrapper's own internal spawns are invisible to PreToolUse hooks. |
| Per-machine `.claude/hooks/bash-guard.sh` in the checkout (gitignored, not a tracked file; blocks `codex exec` without `< /dev/null`) | Same: no `codex exec` substring in the caller's command line. Internal spawn closes stdin by construction (§4). |
| `codex-wedge-watchdog.sh` (`EXEC_MAX=1500` notify, `EXEC_KILL=3000`) | Watchdog sees the wrapper's codex children in `ps`. Per-attempt cap 1200s < 1500s guarantees a healthy wrapper-managed attempt never triggers even the notify tier. If an external kill lands anyway, the wrapper observes a killed child and walks the ladder normally. |
| `codex-review-retry.mjs` + companion | Untouched. Companion wedge → the caller runs `codex-guard review --fallback` as the rescue (replaces the manual multi-step procedure). |

Double-retry audit: the wrapper retries only its OWN child processes; no path routes a companion call through the wrapper, so retry multiplication is structurally impossible.

## 9. Testing (TDD; vitest; `tests/codexGuard/*.test.ts`)

All tests drive the wrapper with `CODEX_GUARD_BIN` pointing at a **fake codex fixture** (`tests/codexGuard/fixtures/fake-codex.mjs`) whose behavior is selected per-test via a scenario env var/file. Real codex is never spawned (CI has no codex CLI; also keeps tests deterministic). `CODEX_HOME` points at a temp dir per test. Timeouts overridden to sub-second via env.

Scenarios and the concrete failure mode each catches:

1. **Happy path** — fake emits transcript + `-o` file with `VERDICT: APPROVE`; assert result.json `status:"verdict"`, correct spawn argv (flag set exactly as §4 — catches silent flag drift), prompt delivered via stdin (fake echoes stdin length — catches argv regression).
2. **Echoed-brief false positive** — `-o` file contains the format-instruction line ("end with VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION") above a real `VERDICT: NEEDS-ATTENTION`; assert parsed verdict is NEEDS-ATTENTION, not the instruction line (catches the documented false-trigger).
3. **Cache-TTL rung** — attempt 1: exit 0, no `-o`, transcript contains `failed to renew cache TTL`; assert `models_cache.json` in fake `CODEX_HOME` is backed up to `--out` and deleted, attempt 2 launched, rung recorded once; a THIRD TTL failure does not re-fire the rung (once-per-run cap).
4. **Truncation resume** — attempt 1: exit 0, no marker, transcript has a session id; assert attempt 2 argv is `exec resume <sid> -o …` and cwd is `--cwd` (catches wrong-cwd resume + `ls sessions` race by construction).
5. **Stall kill** — fake writes one byte then sleeps; assert kill after stall window, `killedReason:"stall"`, ladder proceeds (catches dead stall detector — the watchdog's own historical failure mode: a detector that never fires; the fixture is the synthetic positive).
6. **No-output kill** — fake sleeps before any output; assert `killedReason:"no_output"` within first-output window.
7. **Exhaustion** — all attempts fail transient; assert `status:"no_verdict"`, `failureReason:"attempts_exhausted"`, exit code 0, attempts array length = max.
8. **Usage errors** — missing brief / bad numbers / bad label → exit 2, no result.json.
9. **Total-timeout** — budgets tuned so total expires mid-attempt-2; assert `failureReason:"total_timeout"`.

Anti-tautology: expected values derive from fixture scenario definitions (e.g., the session id the fake embeds is random per test and asserted end-to-end); no assertion merely checks "spawn was called."

**Meta-test inventory (declared per AGENTS.md):** none of the existing structural registries apply — no Supabase call boundary, no admin route/table, no §12.4 code, no advisory lock, no tile/sentinel surface, no mutation HTTP/server-action surface (a local CLI script is not a mutation surface unit per invariant 10's definition). Declared explicitly: **no registry rows added; no new meta-test created.** The spawn-argv assertion in scenario 1 is the structural pin for flag drift.

## 10. Documentation (AGENTS.md)

New subsection under "Codex-specific notes": **"Codex dispatch guard (`codex-guard`)"** —

- All direct `codex exec` review/task dispatches SHOULD go through `node scripts/codex-guard.mjs review …` (backgrounded).
- Companion app-server wedge rescue = `codex-guard review --fallback --artifact <spec-or-plan> …` (replaces the manual fallback procedure; memory files stay as background, the AGENTS.md text is the cross-CLI durable contract).
- Result contract: read `result.json`; `status:"no_verdict"` → apply the existing skip/self-review ladder (`feedback_codex_exec_killed_fallback_selfreview_ci`) — the wrapper bounds the retry burn, it does not change the escalation policy.
- Brief authoring: the brief MUST instruct the reviewer to end with a final `VERDICT: <outcome>` line (the wrapper detects verdicts, it does not inject the instruction).
- Shim install one-liner for other machines/checkouts:
  `mkdir -p ~/.claude/bin && printf '#!/bin/sh\nexec node "$HOME/FX-Webpage-Template/scripts/codex-guard.mjs" "$@"\n' > ~/.claude/bin/codex-guard && chmod +x ~/.claude/bin/codex-guard`

## 11. Defaults (single source of truth)

| Constant | Default | Bound |
| --- | --- | --- |
| `MAX_ATTEMPTS` | 3 | ≥1 |
| `ATTEMPT_MAX_SECS` | 1200 | < watchdog notify 1500 |
| `TOTAL_MAX_SECS` | 1500 | |
| `STALL_SECS` | 420 | > upstream 300s recoverable stall |
| `FIRST_OUTPUT_SECS` | 120 | |
| `POLL_INTERVAL_SECS` | 10 | |
| `KILL_GRACE_SECS` | 5 | |
| `PROMPT_MAX_BYTES` | 2000000 | |
| Cache-TTL rung | once per run | |
| Resume rung | once per run | |

Every other section referencing a number refers here.

## 12. Flag lifecycle (per AGENTS.md flag table rule)

| Flag | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| `--fallback` | argv only | caller | prompt composer (§4) | inlines artifacts + budget trailer |
| `--label` | argv → result.json | caller | result.json consumers | tagging only, no behavior |
| numeric flags | argv/env | caller/tests | §5/§6 budgets | timing/attempt bounds |
| `CODEX_GUARD_BIN` | env | tests | spawner | test seam; absent → `codex` from PATH |
| `CODEX_HOME` | env | codex itself | rung 1 path resolution | cache-clear target |

No zombie flags: every row has all four columns live.

## 13. Watchpoints (reviewer preempts — verified deliberate, do not relitigate)

- Exit-0-with-`result.json` regardless of verdict outcome (§3 rationale).
- Prompt via stdin pipe, not argv (§4 rationale).
- `STALL_SECS` 420 exceeds the memory-documented 180–210s (§5 rationale — the 300s recoverable upstream stall).
- File-growth-only stall detection, no CPU pairing (§5 rationale).
- The wrapper does not extend the PreToolUse guards to cover itself; background-launch is a documented convention, not enforced (machine-level hooks are out of repo scope; §8).
- Plain `.mjs`, not TS: the global shim must run via bare `node` outside the repo's toolchain.
