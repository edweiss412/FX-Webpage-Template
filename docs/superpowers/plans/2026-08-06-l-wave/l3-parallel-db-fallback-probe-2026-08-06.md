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
PROBE VALID
  files compared:          890
  tests passing   db:      12271
  tests passing   closed:  12271
  tests skipped   db:      2
  tests skipped   closed:  2
  metric: per-TEST outcomes keyed by fullName (not per-expect assertions)

DEGRADING FILES: 0
DISPOSITION: archive (answered-negative) per spec §2.1.3.
```

## What the metric IS, and the limit that follows (cross-model review R1, findings 1-2)

**Vitest's JSON reporter emits one `assertionResults` entry per TEST CASE, not per `expect()`.** The
entry asks for "per-file assertion COUNTS"; what is available, and what this compares, is **per-test
outcomes**. That gap is stated here rather than papered over, because the first version of this
differ described itself in the entry's language and thereby overclaimed.

Two defects in that first version were found by cross-model review and are now closed, each with an
executable demonstration:

1. **Count-only comparison was defeated by a SWAP** — one test starts skipping while another starts
   passing, preserving every total. The differ now keys on test IDENTITY (`fullName`), so that case
   is a per-test transition:

   ```
   DEGRADING FILES: 1
     /x/tests/lib/swap.test.ts
         passed -> pending: alpha
   ```

2. **The validity gate ignored report-level `success` and per-file `status`** — a run with a failing
   setup hook or a suite-level error can carry unchanged test rows and still reach the archive
   branch. Both are now gated:

   ```
   PROBE INVALID (never archive on an invalid probe):
     closed-port: report reports success=false — a non-succeeding run cannot settle this probe
   exit 2
   ```

**THE EXACT BOUND (narrowed again at R2 F1).** The decision rule iterates the tests that PASSED with
the DB present and asks whether each still passes. So the probe establishes precisely: **no
DB-present passing test ceased passing.** It does NOT establish "no test changes outcome" — a
baseline-skipped test that passes under the closed port, or two skips trading places, is outside the
rule by construction. Both are deliberate exclusions (neither is the fallback shape the entry
describes), but the claim is now stated at its real width rather than a flattering one.

**The skipped set is PROVEN unchanged, not inferred from equal counts** (R2 F1). The differ compares
non-passing tests by identity and reports it: `non-passing set identical by identity: yes`. Both runs
skip exactly `drive/embeddedObjectsLiveSmoke.test.ts :: extractEmbeddedObjects — live Google export
smoke …` and `reviewRounds/report.test.ts :: real history (spec §11.3 layer 2) SKIPS BY NAME on a
shallow clone`, so they are unconditional skips rather than closed-port casualties — asserted from
identity, which is what the earlier count-only claim could not support.

**DOCUMENTED LIMIT, inherent to the reporter:** assertions weakened INSIDE a test that still passes
are invisible, because no per-test assertion count is exposed. A test that stops asserting but keeps
passing reads as unchanged. Closing that needs an assertion-level reporter or an instrumented
`expect`.

**File count note:** the differ compares **890** files, against the entry's stale "~691" and the
2026-08-04 re-verification's "875". All three are counts of different things over time; 890 is what
the `parallel` project actually resolved on this commit, and it is the number the result is about.

## Validity gate (ran BEFORE the decision rule, spec §2.1.3 / R1 F3)

| Gate | Result |
| --- | --- |
| Both runs exit with parseable JSON reports | PASS (exit 0 both; reports 4.6 MB each) |
| Both reports declare `success: true` | PASS (added R1 F2; a non-succeeding run cannot settle the probe) |
| Every file reports `status: "passed"` | PASS (added R1 F2) |
| Per-file results present; identical file set across runs | PASS (890 = 890, no file exclusive to either run) |
| DB-present run reports a nonzero total passing-test count | PASS (12271 passing) |
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
glob space modelling one shape the entry describes — a file that silently runs less when the
endpoint is refused. (Review R1 correctly noted this sentinel alone proves sensitivity only to ITS
shape; the identity-keying and `success` gates above are what extend the instrument beyond it, and
each carries its own demonstration.)

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

The rule is pre-ratified and total over a valid probe (spec §2.1.3): a file with a baseline-passing
test that stops passing under the closed port — by skipping, failing, or disappearing — is
DEGRADING. A drop "explained" by a skip is exactly the fallback shape, never a pardon. **Zero
degrading files → archive with this transcript.**

The 2 skipped tests are identical in both runs BY IDENTITY (not merely by count — see above), so
they are unconditional skips, not closed-port casualties.

## What this settles, and what it does not

**Settles:** across all 890 files, **no test that passed with the DB present ceased passing under a
refused connection** — none started skipping, started failing, or disappeared — and the non-passing
set is identical by identity across the two runs. That is the measured claim, at its exact width.
The `unit-suite-nodb` job's blind spot — that "does not FAIL without a database" is weaker than
"touches no database" — was a real concern, and no instance of it surfaced at this bound on this
commit.

**Does not settle:** (a) assertion-level weakening inside a still-passing test, per the documented
limit above; (b) the future — this is a point-in-time measurement, not a standing guard, and nothing
prevents a new file arriving with a swallowed-connection fallback that the no-DB job keeps passing
exactly as the entry warned. Re-running this probe is the way to re-measure, which is why the differ
is committed rather than thrown away.
