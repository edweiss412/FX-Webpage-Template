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
