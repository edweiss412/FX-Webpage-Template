# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-17 (every other `###` entry from the prior file was already resolved/stale/N/A in its body — see archive).

---

## Bell notification center (2026-07-05)

### BELL-2 — [P2] No triage structure at 9+ (severity/show grouping + mark-all-read)

- **What:** the active section renders a flat activity-ordered list; a 9+ badge opens as an undifferentiated wall. (The count heading was originally part of this entry and already shipped — see archive BELL-2.)
- **Why deferred:** §7.2 grouping is a design change (collapse per (show,code), activityAt DESC is ratified) that needs its own shape pass, not a gate fix.
- **Trigger:** D4 calibration — once real alert volume is observed, run `/impeccable shape` on panel triage (grouping, mark-all-read) as its own feature.

---

## Wizard callout preview (2026-07-17)

### CALLOUT-PREVIEW-ACTION-CUE-1 — [critique P1 → dispositioned P2] Demoted preview may read as FYI; no cue the fix lives in Parse warnings

- **What:** USE-RAW-FULL-LIST-1 was resolved by demoting `SectionFlagCallout` to a preview (spec/plan `2026-07-17-use-raw-callout-preview-demotion`). The invariant-8 impeccable critique (2026-07-17) flagged that with the inline controls gone, the judgment lead ("We made a judgment call reading this. Worth a glance.") + a generic "View details" may read as passive/FYI, so Doug (single admin, no onboarding) could treat a flagged section as no-action. Visibility-of-status heuristic scored 2/4.
- **Why deferred:** the actionable Parse-warnings list IS visible in the same modal and "View details" jumps straight to the row, so the fix is discoverable, not stranded. The ratified demotion (spec §2) explicitly accepted losing the act-from-callout shortcut, and action-forward wording would revisit the §3.10 copy-pinned judgment-lead line — out of this removal-only diff's scope. Audit scored 20/20; the tap-target concern (critique P1b) was refuted by the passing §15 real-browser audit (≥44px).
- **Trigger:** Doug reports treating flagged sections as no-action / missing the fix path, OR the next wizard copy pass — reword "View details" → action-forward (e.g. "Fix in Parse warnings") and/or add a subtle actionable cue. Related resolved twin: `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`.
