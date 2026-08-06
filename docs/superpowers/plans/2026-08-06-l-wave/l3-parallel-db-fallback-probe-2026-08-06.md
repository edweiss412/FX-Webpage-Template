# L3 probe transcript — BL-CI-PARALLEL-DB-FALLBACK-AUDIT

**Run:** 2026-08-06, worktree `../FX-worktrees/l-wave-docs`, branch `feat/l-wave-docs`, local Supabase
stack up (`pnpm preflight`: env ✓, local DB ✓).
**Result: VALID probe, ZERO degrading files → ARCHIVE (answered-negative), per spec §2.1.3.**

The differ is committed beside this file at `l3-parallel-db-fallback-diff.mjs`. Both commands below
are reproducible verbatim.

## Commands

```
# Run 1 — DB PRESENT (every Supabase endpoint live)
SUPABASE_URL="http://127.0.0.1:54321" \
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  pnpm vitest run --project=parallel --reporter=json --outputFile=<scratch>/parallel-db.json

# Run 2 — CLOSED PORT (a REFUSED connection, not an absent variable)
SUPABASE_URL="http://127.0.0.1:1" \
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:1" \
TEST_DATABASE_URL="postgresql://127.0.0.1:1/none" \
  pnpm vitest run --project=parallel --reporter=json --outputFile=<scratch>/parallel-closed.json

node docs/superpowers/plans/2026-08-06-l-wave/l3-parallel-db-fallback-diff.mjs \
  <scratch>/parallel-db.json <scratch>/parallel-closed.json
```

## Raw result

```
db-present:  files=890 passed=12271 skipped=2 failed=0
closed-port: files=890 passed=12271 skipped=2 failed=0

PROBE VALID
  files compared:            890
  passing assertions  db:    12271
  passing assertions  closed:12271
  failed assertions   db:    0
  failed assertions   closed:0

DEGRADING FILES: 0
DISPOSITION: archive (answered-negative) per spec §2.1.3.
```

**File count note:** the differ compares **890** files, against the entry's stale "~691" and the
2026-08-04 re-verification's "875". All three are counts of different things over time; 890 is what
the `parallel` project actually resolved on this commit, and it is the number the result is about.

## Validity gate (ran BEFORE the decision rule, spec §2.1.3 / R1 F3)

| Gate | Result |
| --- | --- |
| Both runs exit with parseable JSON reports | PASS (exit 0 both; reports 4.6 MB each) |
| Per-file results present; identical file set across runs | PASS (890 = 890, no file exclusive to either run) |
| DB-present run reports a nonzero total assertion count | PASS (12271 passing) |
| Differ validates fields rather than defaulting absent ones to zero | PASS by construction — a missing `name`, `assertionResults`, or `status` records INVALID and exits 2; a duplicate file name records ambiguous attribution |

An INVALID probe means fix-and-re-run. **The entry is never archived on an invalid probe** — that
rule is why the two corrections below were made rather than reported around.

## Two corrections made during the run, recorded because each would have produced a false negative

**1. The first baseline was the WRONG STATE.** The ambient shell had `SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, and `TEST_DATABASE_URL` **all unset** — `.env.local` is not loaded by
vitest (`vitest.config.ts` calls no `dotenv`/`loadEnv`; `tests/setup.ts` only ever assigns with
`??=`, so it never clobbers an inherited value). A first pass that set only `TEST_DATABASE_URL`
therefore compared *absent endpoint* against *closed port* — and the entry's whole thesis is that
those two differ ("point every Supabase endpoint at a CLOSED PORT rather than simply omitting the
database. A refused connection surfaces swallowed-error paths that an absent server does not"). The
baseline was re-run with all three endpoints explicitly live. The result was unchanged, but it was
not a result until the baseline was right.

**2. The instrument was proven sensitive before the zero was believed.** A no-delta result is
worthless from a blind instrument, so the probe's own premise was established executably (the
AGENTS.md guard-premise rule applied to a probe). A temporary sentinel was planted in the parallel
glob space modelling the EXACT shape the entry describes — a file that silently asserts less when
the endpoint is refused:

```
tests/lib/__l3ProbePremise.test.ts   (temporary; deleted in the same turn, never committed)
  const live = process.env.SUPABASE_URL === "http://127.0.0.1:54321";
  test("always runs", …)
  test.runIf(live)("only asserts when the endpoint is live (1)", …)
  test.runIf(live)("only asserts when the endpoint is live (2)", …)
```

Run under both envs and fed to the differ:

```
DEGRADING FILES: 1
  tests/lib/__l3ProbePremise.test.ts
      passing 3 -> 1; newly skipped 0 -> 2
```

That proves three things at once: the closed-port env **reaches the test process**, the differ
**detects the fallback shape**, and it **routes to the STAYS-OPEN branch** when it finds one. The
zero over 890 real files is therefore a measurement, not a blind spot.

**Supporting premises, also checked rather than assumed:** `127.0.0.1:1` returns `ECONNREFUSED` (a
genuinely refused connection, not a filtered port that would silently time out into the same fallback
the probe hunts), and the live stack answers `HTTP 200` at `127.0.0.1:54321/rest/v1/`.

## Decision

The rule is pre-ratified and total over a valid probe (spec §2.1.3): a file whose passing count
drops, that newly skips, or that reports all-skipped under the closed port is DEGRADING — a drop
"explained" by a skip is exactly the fallback shape, never a pardon. **Zero degrading files →
archive with this transcript.**

The 2 skipped assertions are identical in both runs (same files, same count), so they are
unconditional skips, not closed-port casualties.

## What this settles, and what it does not

**Settles:** the parallel project has no file that silently degrades under a refused Supabase
connection. The `unit-suite-nodb` job's blind spot — that "does not FAIL without a database" is
weaker than "touches no database" — was real as a concern and is empirically EMPTY as of this commit,
across all 890 files.

**Does not settle:** this is a point-in-time measurement, not a standing guard. Nothing prevents a
future file from being added with a swallowed-connection fallback; the no-DB job would keep passing
it exactly as the entry warned. Re-running this probe is the way to re-measure, which is why the
differ is committed rather than thrown away.
