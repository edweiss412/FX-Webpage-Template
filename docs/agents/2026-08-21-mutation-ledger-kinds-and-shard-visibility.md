# The stale ledger-kinds declaration, and the three mechanisms that hid it

**Findings as of `0820436cf` (branch base). Everything below is a measurement taken at that
sha, not a claim about the tree you are reading.** Re-run the probes before relying on any
number; the partition figures in particular change on every commit, by design.

Written because this analysis existed only in one session's context and one orchestrator relay.

---

## 1. What was actually broken

`EXPECTED_LEDGER_KINDS.rowScanOpener` was `{}` while the `rowScanOpener` surface carried two
`equivalent` rows in `tests/mutation/source/registry.ts`. AC-13 in
`tests/mutation/source/surfaceCases.ts` compares those two, so it had been failing on main.

## 2. Authorship — differential, not causal argument

The CI window pointed at the speclint arc (last observed green `4c6f18ac4`, first observed red
`50d68dd6d`, both arc commits). That attribution is wrong, and the tree settles it:

| commit | date | what it did |
|---|---|---|
| `86383d34e` | 2026-08-15 21:13 | wrote `rowScanOpener: {}` — **correct then**, the surface had no accepted rows |
| `6d6760019` | 2026-08-16 13:43 | added two accepted rows to `rowScanOpener` **and** two to `fieldNearMiss`; stat is `BACKLOG.md`, `registry.ts`, `fieldNearMiss.test.ts` — `expectedLedgerKinds.ts` **not among them** |
| `d342677e0` | 2026-08-17 15:15 | diagnosed the class, wrote the comment, repaired `fieldNearMiss` only |

`git log -p 4dfd784ed..0820436cf -- tests/mutation/source/registry.ts tests/mutation/source/expectedLedgerKinds.ts`
adds and removes **zero** lines matching `rowScanOpener`. `50d68dd6d` touches `registry.ts`
solely to re-key `claimSweep`'s own seven siteIds. The defect predates that arc by four days.

## 3. The half-sweep, which is the more useful finding

`d342677e0` left this comment in the file, and it is still there, directly **above** the row it
does not fix:

> Two rows, both added by 6d6760019 when CI found six survivors on this surface; the declaration
> here was never moved with them, so the AC-13 equality has been red on main since.

It repaired `fieldNearMiss` and left `rowScanOpener` on the next line, same defect, same origin
commit. **Naming a class is not sweeping it.** The repair on this branch is therefore not the
row — it is a derived check that walks `GUARD_SURFACES` and compares every surface's actual
kinds against its declared entry, so the next incomplete enrolment fails immediately and by
default. Running that derivation at `0820436cf` finds exactly **one** mismatch, `rowScanOpener`;
there is no third instance, and `EXPECTED_LEDGER_KINDS` has no entry naming a surface that is
gone (41 surfaces, 41 entries).

## 4. Why it stayed invisible for five days — three independent mechanisms

The AC-13 assertion is reachable only through `runSurface`, which runs at **module scope** inside
`describe.each` (`surfaceCases.ts:20-27`) and spawns a vitest child per mutant. So it lives only
in `guardSurfaces.shard*`, excluded from every merge-gating project by `NIGHTLY_ONLY_EXCLUDES`
(`vitest.projects.ts:97-102`). On top of that:

1. **A CANCELLED leg carries no verdict.** Legs cancel at `timeout-minutes: 90`
   (`.github/workflows/mutation-harness.yml:154`).
2. **A red leg masks every sibling surface on it.** At `4c6f18ac4`, `rowScanOpener` sat on
   shard 1 — already red for `destructiveFileAnalysis`. It was masked, never green.
3. **The leg carrying a surface is not a stable key.** The partition is recomputed from weights
   every commit (`shardPartition.ts:39-45`); there is no committed weight table.

Measured repartition, `sourceShardAssignment` run against both trees:

| | surfaces | `rowScanOpener` | `fieldNearMiss` | `claimSweep` | loads |
|---|---|---|---|---|---|
| `4c6f18ac4` | 40 | **shard 1** | shard 1 | absent | 1040/1043/1041/1043 |
| `0820436cf` | 41 | **shard 2** | shard 0 | shard 1 (w=155) | 1084/1080/1080/1078 |

One enrolment moved three surfaces. Tracking a surface's history by leg number assumes a static
assignment that does not exist, and will mis-attribute every enrolment.

Shard conclusions read by name, never from the aggregate:

- `4c6f18ac4` — shards 0 and 1 FAILURE, 2 and 3 SUCCESS
- `50d68dd6d` — shard 1 CANCELLED, shard 2 FAILURE
- `0820436cf` — shards 1 and 2 FAILURE (one defect each)

## 5. Two defects still open at this sha

**B — `destructiveFileAnalysis` coordinate drift.** All 8 accepted rows are stale; 8 unaccepted
survivors are the same sites at moved coordinates. `fbfc04fdf` (2026-08-16, "compose
EXECUTION_METHODS from the derived core") shifted them with two hunks, `@@ -56,6 +56,7 @@` and
`@@ -534,13 +535,36 @@` — **+1** for seven rows and **+24** for the one below both. A uniform
+1 assumption writes a wrong key for `relational-boundary:602:29:>>>=` → `626:29`, and a wrong
key reads as a fresh stale row rather than as an error.

Re-validated rather than re-keyed on the pairing, by enumerating both trees through the shipped
enumerator: old and new site counts are both 237, and all 8 rows resolve **uniquely** when the
key includes the source line text, each new line byte-identical to its old one.

> **Keying by operator + column + mutation is NOT sufficient** — it is ambiguous for 3 of the 8
> rows (6, 4 and 2 candidates respectively). Line text is what disambiguates.

All 8 equivalence arguments survive: seven cite regions outside both hunks, and the eighth cites
`EXECUTION_METHODS` membership, probed unchanged across the commit (same 10 members, nothing
added or removed).

**C — shard budget breach.** Legs at 3310/3812/4180/5172s against `SHARD_BUDGET_SECONDS = 3600`
(`shardPartition.ts:29`), enforced as a **job failure** (`lib/ci/shardBudget.ts:109-113`,
`scripts/check-shard-budget.ts:136`); the 75% band only annotates. The ceiling is 5400s
(`mutation-harness.yml:154`), so there is 1800s of slack and leg 3 consumes 87% of it. Nothing
pins ceiling to budget, so roughly 228s of further growth silently converts a budget FAILURE —
which leaves `elapsed.txt` and a diagnostic — into a CANCELLED leg, which leaves nothing. **That
conversion is what made this history unreadable, so C is upstream of diagnosing A and B.**

The weight model is the root cause of the spread: `weightOf` (`shardPartition.ts:31-38`) counts
modelled child **boots** and assumes each costs the same ~0.75s. It omits per-suite execution
time entirely, which is why near-equal loads (1.006x spread) produce a 1.56x wall-clock spread.
Do not raise the budget to make it green.
