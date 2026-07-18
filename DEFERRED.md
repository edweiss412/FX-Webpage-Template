# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-17 (every other `###` entry from the prior file was already resolved/stale/N/A in its body — see archive).

---

## CI speedup — Phase 2 (2026-06-23)

### D11 — [P3] Restore Next `.next/cache` before the screenshots-drift Docker build

- **What:** cache `.next-screenshots-help/cache` (the compiler cache) before the screenshots-drift build. The help-affordances half already shipped 2026-07-17.
- **Why still deferred:** screenshots-drift builds inside the pinned Docker container (root-owned cache vs `actions/cache` saving as the runner user) AND is a byte-comparison gate, so a warm build must be proven byte-identical to a cold one first.
- **Trigger:** dispatch `screenshots-regen` to prove warm-build byte-identity, chown the cache dir back to the runner user, THEN cache `.next-screenshots-help/cache`. Full context: archive D11.

---

## Bell notification center (2026-07-05)

### BELL-2 — [P2] No triage structure at 9+ (severity/show grouping + mark-all-read)

- **What:** the active section renders a flat activity-ordered list; a 9+ badge opens as an undifferentiated wall. (The count heading was originally part of this entry and already shipped — see archive BELL-2.)
- **Why deferred:** §7.2 grouping is a design change (collapse per (show,code), activityAt DESC is ratified) that needs its own shape pass, not a gate fix.
- **Trigger:** D4 calibration — once real alert volume is observed, run `/impeccable shape` on panel triage (grouping, mark-all-read) as its own feature.

---

## Wizard use-raw full-list controls (2026-07-16)

### USE-RAW-FULL-LIST-1 — [P1→ratified] Callout + full-list both render live role controls; siblings diverge until navigation

- **What:** a warning in the first 3 of its section's callout has two live control instances (callout preview + complete list). Recognize-role does no client refresh (2026-07-15 §8.1 timing contract), so recognizing a role via one instance leaves the sibling in create mode until navigation — Doug could re-submit from the sibling.
- **Status — not an oversight:** ratified keep-both (spec §2.1 / §4.6, 2026-07-16). No data risk — a stale-sibling save resolves via the action's EXISTING-ROW-first branch (set-equal → idempotent success; different grants → benign conflict notice; never a raw code). Lowest urgency.
- **Trigger:** a Doug report of double-recognizing roles from the two sites, OR a decision to demote the callout to a pure preview (title + jump only), which revisits the ratified keep-both decision. Backlog twin: `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`.
