# codex-guard refusal exit status — probe, 2026-08-26

**Question.** The brief routing `feat/speclint-dispatch-gates` reported that the
round-1 guard-surface refusal "refused, exited 0 (AGENTS.md says exit 2), produced
no result artifact", measured on `arc-shardbudget` 2026-08-26 04:38. Does the
wrapper exit 0 on a refusal?

**Answer. No. The wrapper exits 2. The 0 is the launcher's status, not the
wrapper's.**

## Method

Head `37e976231`. One nonconforming brief, the conjunction-prose form a
contributor writes after transcribing the AGENTS.md sentence:

```
GUARD SURFACE: taskContract, MUTATION SCORE: 4/4 plus 0 unaccepted survivors plus OPERATORS: all
```

Dispatched three ways against a real checkout with `--stage diff --round 1`.

## Result

| invocation | status read | exit | result artifact |
| --- | --- | --- | --- |
| foreground | the wrapper's | 2 | none |
| backgrounded with `&`, then `wait` on the child | the wrapper's | 2 | none |
| `nohup … &`, caller reads the launcher | the launcher's | 0 | none |

The refusal text reached stderr in all three. `usageError`
(`scripts/codex-guard.mjs:45`) writes to stderr and calls `process.exit(2)`, and
it is reached from `checkGuardSurfaceDeclarations` (`scripts/codex-guard.mjs:526`)
in the pre-dispatch validation phase, before any lock, dispatch, result artifact,
or corpus row.

## What it means

The earlier measurement is real and its diagnosis was not. Because AGENTS.md tells
every dispatch to launch backgrounded so the caller's PreToolUse hooks never see
the child's command token, a caller shaped that way reads the LAUNCHER's status —
which is 0 whether the wrapper refused, dispatched, or died. This is not specific
to the guard-surface gate: it hides the exit status of **every** usage refusal the
wrapper makes, including the lint gate this arc adds.

Not repaired by writing a result artifact on refusal. "A rejected brief takes no
lock, writes no result artifact, and appends no corpus row" is the contract pinned
at `tests/codexGuard/guardSurfaceGate.test.ts:1-30`, and contradicting it to paper
over a caller-side bug is the wrong direction. Recorded as a documented limit in
`docs/superpowers/specs/2026-08-26-speclint-dispatch-gates-design.md` §7 limit 1; the mitigation is the
dispatch form — launch backgrounded, `wait` on the child, read the child's status.

## Resolved scope — do not relitigate

- **The wrapper's exit code is correct and is not changed.** The measurement that
  said otherwise read the launcher.
- **No result artifact is written on a refusal.** Pinned at
  `tests/codexGuard/guardSurfaceGate.test.ts:1-30`.
- **The separator grammar is not widened** to accept English conjunctions. The
  refusal message and the AGENTS.md bullet show a conforming line instead.

## Feeds

`docs/superpowers/specs/2026-08-26-speclint-dispatch-gates-design.md` §5 and §7.
