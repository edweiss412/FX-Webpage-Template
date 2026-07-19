# Adversarial review — final approval

**Reviewer:** Codex (cross-CLI, opposing model), REVIEWER ONLY posture.
**Rounds:** 22. **Verdict:** APPROVE (round 22, confirmation round).

Round 21 returned a bare `VERDICT: APPROVE` with no commentary (532 bytes of
output). Rather than accept it, round 22 required a verification log so a genuine
clean pass could be distinguished from a low-effort one. That log is below.

Vectors closed across rounds 1-20: shrink-wrapped strip vs `ml-auto` flush;
overlay z-order against the publish popover; skeleton band parity; alert-count cap
and accessible name; contrast thresholds (the 3:1 border rule was REMOVED as
unachievable — measured 1.59:1 light / 1.60:1 dark against the mandated token);
conditional-mount counts and the scanner's JSX-form sensitivity; the `surface`
prop (DELETED — no consumers after the move); the `dateSummarySegments` move
(CANCELLED — its premise was false); `subHeader` type narrowing; TDD baseline
provenance and `useId` normalization; T-NO-ORANGE computed-color discovery;
overlay focus orders; dismiss controls for the error and success branches.

One finding was REJECTED with verification and not re-raised (round 14: a stale
success message coexisting with the shrink confirm — impossible, `post()` clears
it at `ReSyncButton.tsx:92-93`).

---

VERIFICATION LOG:
- §9 count targets: `StatusStrip` 8 → 7 = remove `renderTitle`, remove `alert`, add `re-sync`; matches §13 and T-COUNTS. Consistent.
- §9 `PublishedReviewModal` 1 → 4 accounts for sheet link, client subline branch, alert pill, capped sr-only suffix. Consistent with §6.3/§6.6.
- §9 `OverviewSection` remains 4 because the `{archived ? (` head survives while only the Re-sync button leaves its arms. Consistent with §6.7.
- §6.6 alert cap strings: visible `99+ alerts`; accessible name `99+ alerts (1200 open alerts)`. Matches T-ALERT-CAP exactly.
- §6.6 spacing note uses separate `{" "}` before sr-only suffix; avoids trimmed leading-space accessible-name bug. Consistent with the expected name table.
- §7.1 contrast: prior 3:1 border rule removed because measured border ratios are 1.59:1 light / 1.60:1 dark; T-CONTRAST now checks label contrast only at ≥4.5:1. Consistent.
- §7.2 contrast sampling handles transparent-backed controls by walking to the nearest painted ancestor, the subheader band. This makes T-CONTRAST executable.
- §10 focus order closed state: sheet link → alert pill → close → toggle → Re-sync → copy. Matches §4.7 DOM-order requirement and T-RESYNC-FOCUS-ORDER.
- §10 overlay focus orders cover all three Re-sync branches: shrink, error, success; each keeps overlay controls between Re-sync and Copy. Matches §6.7.
- §7 guard table covers archived, null client, null/empty dates, invalid alert count, error sync buckets, null edited, Re-sync pending/error/shrink, and actionable warnings. No obvious missing drawn-state guard.
- §6.7 archived behavior agrees with §7: no strip Re-sync trigger; Overview keeps paused notice. Consistent.
- §6.1 skeleton parity and §11 T-SKELETON-BANDS both require header and subheader height parity, not just band existence. Consistent.

No findings.

VERDICT: APPROVE