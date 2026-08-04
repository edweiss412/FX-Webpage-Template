# `ledger-mass` oracle fixture — the 2026-08-04 ledgers

`BACKLOG.md` and `DEFERRED.md` here are byte-for-byte copies of the repo's open
queues at `8d78cdf13`, the backlog-convergence spec commit. They are the frozen
tree the `pnpm ledger:mass` oracle in `tests/scripts/ledgerMass.test.ts` pins
against, with the expected numbers hard-coded in that test from spec §0 —
BACKLOG mass 306 / DEFERRED mass 15 / total 321, unsized 31 + 11 — rather than
recomputed by the script under test.

Do not edit these files to make a test pass. They are a historical snapshot; a
change here silently re-bases the oracle, which is the one thing it exists to
prevent. `--at 8d78cdf13` reads the same blobs out of git history and must agree
with this directory.

**The archives are deliberately absent.** `ledger-mass` skips `*-archive.md` by
design (mass measures the OPEN queues), so copying 740 KB of archive here would
assert nothing. Archive-skipping is proven instead by a scratch fixture the test
builds at runtime, which is also where the planted `severity-unrecognized` entry
lives — planting it in these files would break the oracle they exist to carry.
