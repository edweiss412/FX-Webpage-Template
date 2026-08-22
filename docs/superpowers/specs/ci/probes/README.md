# `docs/superpowers/specs/ci/probes/` — Draft-time measurements

Evidence cited by the CI specs beside this directory. A probe is a measurement, not a design: it answers one question against real data so a spec can state a fact instead of an assumption.

Written under the probe-before-argue rule in [`../../../../agents/spec-self-review.md`](../../../../agents/spec-self-review.md) — for detector, classifier, and heuristic surfaces, corpus-calibrated bounds are a draft-time input, not a late-round discovery.

| Probe | Question | Feeds |
| --- | --- | --- |
| [`2026-08-04-finding-format-probe.md`](./2026-08-04-finding-format-probe.md) | Can a finding count be recognized from reviewer output, or must it be declared? | [`../2026-08-04-review-round-economy.md`](../2026-08-04-review-round-economy.md) §3 |
| [`2026-08-04-mergebase-stability-probe.md`](./2026-08-04-mergebase-stability-probe.md) | Is `git merge-base` stable enough to key an arc identity on? | [`../2026-08-04-review-round-economy.md`](../2026-08-04-review-round-economy.md) §5.2 |
| [`2026-08-16-timing-scan-binding-probes.md`](./2026-08-16-timing-scan-binding-probes.md) | What does the timing scan's global name filter suppress, and can a binding-identity resolver reproduce it at a tolerable cost? | [`../2026-08-16-timing-scan-binding-resolution-design.md`](../2026-08-16-timing-scan-binding-resolution-design.md) §3 |
| [`2026-08-16-premisescan-import-edge-probe.md`](./2026-08-16-premisescan-import-edge-probe.md) | Which import/export forms does `premiseScan` follow, and where do those forms occur? | [`../2026-08-16-premisescan-import-edge-fidelity-design.md`](../2026-08-16-premisescan-import-edge-fidelity-design.md) §3 |
| [`2026-08-19-premisescan-nested-hook-leak-probe.md`](./2026-08-19-premisescan-nested-hook-leak-probe.md) | Does narrowing `hookBodies` to stop at nested `describe`s move any live verdict? | [`../2026-08-19-premisescan-nested-hook-sibling-leak-design.md`](../2026-08-19-premisescan-nested-hook-sibling-leak-design.md) §3 |
| [`2026-08-20-browser-child-wallclock-probe.md`](./2026-08-20-browser-child-wallclock-probe.md) | What is the per-child wall clock of a healthy browser-gate run, and what ceiling does it support? | [`../2026-08-20-browser-child-lifetime-design.md`](../2026-08-20-browser-child-lifetime-design.md) §3 |
| [`2026-08-21-connection-census/`](./2026-08-21-connection-census/) | Which files under `tests/` open a `postgres` connection, through which helpers, with which URL provenance, and do the ledger row's two incident spellings have any live instance? | [`../2026-08-21-destructive-guard-discovery-by-connection-design.md`](../2026-08-21-destructive-guard-discovery-by-connection-design.md) §1, §3 |
| [`2026-08-22-derived-number-population-census.md`](./2026-08-22-derived-number-population-census.md) | Are the figures these records state derived or hand-carried, and is that classification stable enough to gate on? | `BL-DERIVED-NUMBERS-IN-DOCS-ROT` |

## Stating a figure

A figure a record states about an artifact — a count, a duration, a score, a size — is **bound** or it
rots. Bound means a reader can still tell, later, what the figure was measured against.

**The anchor has to be immutable.** A commit sha, a blob id, a tag that does not move. A branch or a
remote ref is not an anchor: it moves, and it can be deleted, and then the record names nothing at
all. `2026-08-16-timing-scan-binding-probes.md` is the worked example — it pins its probes to
`origin/fix/scanner-scope-totality` and prints the `git show` that materialises them, names no sha
anywhere, and that branch no longer exists.

**Naming the producing command is not by itself a binding.** It says how the figure was derived, not
what it was derived from, and a command run against a moving tree answers differently tomorrow. Name
the command *and* the revision. One header line does both for a whole record:

> Run 2026-08-21 on `fix/some-branch` at `abc1234`.

**A measurement that genuinely cannot be reproduced binds by declaration instead** — say so, and say
why. `2026-08-04-finding-format-probe.md` does this: its corpus is machine-local, deliberately
uncommitted, and nothing re-runs it. An honest documented limit beats a figure pretending to be
reproducible.

The population this protects is narrow and worth naming: a figure asserting a property of the **live
tree** with nothing immutable saying which tree. Those are the ones that pass through a person between
the measurement and the page.

There is no lint for this, and `2026-08-22-derived-number-population-census.md` is why. Measured on
this directory at `b52481446`: the gate that was sketched for it reds 23 times, at least 15 of those
on lines that are not figures about artifacts at all, and it misses the one record the anchor screen
flags. It also enforces the wrong rule — it asks for a producing command, and a producing command is
not a binding. The convention is the mechanism. The census script beside this README prints
the mutable-only list on every run if you want to check a record against it.
