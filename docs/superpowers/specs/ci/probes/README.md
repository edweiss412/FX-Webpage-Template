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
| [`2026-08-22-quoted-scalar-census.mts`](./2026-08-22-quoted-scalar-census.mts) | How many QUOTED executable scalars does the live workflow corpus actually contain, and does the repair therefore move the AC-5 finding set? | [`../2026-08-22-workflow-run-scalar-yaml-decode-design.md`](../2026-08-22-workflow-run-scalar-yaml-decode-design.md) §2.4, AC-6 |
| [`2026-08-22-quoted-run-claim-sweep.mts`](./2026-08-22-quoted-run-claim-sweep.mts) | Which sites still assert, in the present tense, the declared limit this arc retires? | [`../2026-08-22-workflow-run-scalar-yaml-decode-design.md`](../2026-08-22-workflow-run-scalar-yaml-decode-design.md) AC-10 |
| [`2026-08-22-seam-check.mjs`](./2026-08-22-seam-check.mjs) | Does this arc's diff touch only the declarations it is allowed to, leaving the delimiter walk to the arc that follows it? | [`../2026-08-22-workflow-run-scalar-yaml-decode-design.md`](../2026-08-22-workflow-run-scalar-yaml-decode-design.md) AC-8 |
| [`2026-08-22-derived-number-population-census.md`](./2026-08-22-derived-number-population-census.md) | Are the figures these records state derived or hand-carried, and is that classification stable enough to gate on? | `BL-DERIVED-NUMBERS-IN-DOCS-ROT` |
| [`2026-08-25-ac-coverage-prototype-probes.md`](./2026-08-25-ac-coverage-prototype-probes.md) | Is the AC-table grammar stable enough to key a lint arm on, and does the declaration-driven arm reproduce the three review rounds it was filed for? | [`../2026-08-25-planlint-ac-command-observability-design.md`](../2026-08-25-planlint-ac-command-observability-design.md) §2, §4, §5, §6 |
| [`2026-08-28-table-provenance-census.mts`](./2026-08-28-table-provenance-census.mts) | How many tables could an executing provenance arm actually reach, what have this corpus's two opt-in doc markers achieved in adoption, and what did the nearest precedent cost to build? | [`../2026-08-28-table-provenance.md`](../2026-08-28-table-provenance.md) §1, §3, §4, §6 |

## Stating a figure

A figure a record states about an artifact — a count, a duration, a score, a size — is **bound** or it
rots. Bound means a reader can still tell, later, what the figure was measured against.

**The anchor has to be immutable.** A commit sha or a blob id — an object id names its own content
and cannot be repointed at different content. A ref is not an anchor, and that includes a tag:
branches, remote refs and tags alike can be moved or deleted, and then the record names nothing at
all. A tag reads as permanent by convention, which is the reason to say plainly that nothing enforces
it. `2026-08-16-timing-scan-binding-probes.md` is the worked example — it pins its probes to
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

**A table is where this keeps landing.** The population above is figures; the shape that recurs is a
whole table of them, named by eleven arcs and indexed as `LIM-NUMERIC-TABLE-PROVENANCE` in
[`../../../../review-rounds/LIMITS.md`](../../../../review-rounds/LIMITS.md). A table binds the same
way a figure does, by naming an immutable anchor once for the section that holds it, and it is the
same header line that does it. `2026-08-28-table-provenance.md` measured whether a per-table marker
should mechanize that and found it should not: the marker would ask for a producing command, which the
paragraph above has already ruled is not a binding.

There is no lint for this, and `2026-08-22-derived-number-population-census.md` is why. Measured on
this directory at `b52481446`: the gate that was sketched for it reds 23 times, at least 15 of those
on lines that are not figures about artifacts at all, and it misses the one record the anchor screen
flags. It also enforces the wrong rule — it asks for a producing command, and a producing command is
not a binding. The convention is the mechanism. The census script beside this README prints
the mutable-only list on every run if you want to check a record against it.
