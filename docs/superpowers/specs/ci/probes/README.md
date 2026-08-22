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
rots. Bound means a reader can tell what the figure was measured against:

- **a revision** — a sha, a branch plus a base, a dated run. A measurement is permanently true of the
  tree it measured, so a bound figure never goes stale; its subject moves and the figure stays correct
  about the tree it names.
- **a producing command or committed script**, so it can be re-derived. Name it beside the figure, or
  once in the record's header covering every figure below.

Either satisfies it. A header line — *"Run 2026-08-21 on `branch` at `abc1234`"* — binds a whole record
in one sentence, and that is how every record here already does it.

The population this protects is narrow and worth naming: a figure asserting a property of the **live
tree** with nothing saying which tree. Those are the ones that pass through a person between the
measurement and the page, and they are the ones that rot. A figure the record derives and prints
alongside its command was never at risk.

There is no lint for this. `2026-08-22-derived-number-population-census.md` measured the alternative:
the per-figure classification is not stable across three defensible readings, and the gate that was
sketched for it fires 23 times on this corpus with a yield of zero. The convention is the mechanism.
