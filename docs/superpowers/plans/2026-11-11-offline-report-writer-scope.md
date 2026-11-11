# Crew offline reports: a failed report shows only to its writer

Branch `fix/offline-report-writer-scope`, a follow-up to piece 2 (`docs/superpowers/plans/2026-11-07-crew-offline-reports.md`, merged as #989). Owner decision, Eric, 2026-11-11: a failed report held on a shared phone is visible to, resendable by and discardable by only the crew member who wrote it. Spec `docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md` §5.1 (Failed records, Button count, Cap) and §9 record it.

This unit has no separate plan. The scope came in as a direct brief, and the work ran TDD in the branch's commits.

## Shipped scope

- `components/shared/ReportQueueStatus.tsx`: the failed count, the status region and the tap take only failed records whose writer is the viewer the page names. A page that names nobody shows none. The viewer is a store over the page's marker, so it is read after the commit that mounts the status and follows a refresh that renders someone else's page. An open sheet closes when the page stops naming its writer.
- `components/shared/ReportModal.tsx`: Send again keeps the record's own writer.
- Someone else's failed report stays held for its writer and counts toward the cap. The waiting count stays phone-wide.

## 12. Impeccable dual gate: findings and dispositions

Run on `5973422f9` (the code as first pushed), before the Codex diff review. Critique: dual-agent, a design review and a detector run as separate sub-agents. Audit: one sub-agent on the diff. Both are RAN-DEGRADED: Docker was down on this machine, so there was no local database, no running app and no live browser. The design review read the screenshots of the existing states from the #989 gate. This diff adds no visual state, only decides which records reach the existing ones. The detector found 0 issues in both files, and a planted `border-l-4` side-tab in a scratch copy fired, so it was reading the file.

Scores, where the diff reaches: critique heuristics H1 3, H2 3, H3 3, H4 3, H5 4, H8 4, H9 2, the rest n/a. Audit 19/20 (accessibility 4, performance 4, theming 4, responsive 4, implementation integrity 3).

| # | Finding (severity, source) | Disposition |
|---|---|---|
| 1 | The viewer was read during the status's first render. A status mounted by a client-side navigation, which is how the picker hands over to the show, read the DOM before its own marker committed, so the writer's own failed report stayed hidden until a reload (P1, audit) | **Fixed** in `ab26a776c`. The viewer is a `useSyncExternalStore` over the marker, and a component test mounts the marker in the same commit as the status. Codex diff round 1 found the same defect independently. |
| 2 | A refresh that renders someone else's page left the first viewer in place, so the next person saw the count and could open, read and discard the report (P2, audit) | **Fixed** in `ab26a776c`, with the sheet closing when the page stops naming its writer. Codex diff round 1 rated it BLOCKING and probed the discard. |
| 3 | A viewer-key change (a picker signing-key rotation, or a crew member back under a new id) leaves held reports that match no viewer: the writer's waiting count clears with nothing in its place, and nobody can resend or discard them (P1, critique) | **Deferred**, `OFFLINE-REPORT-ORPHANED-BY-KEY-CHANGE-1` in `DEFERRED.md`. The repair is a product call: age out unclaimed failed records, or accept the previous key for a grace window. Spec §9 records the limit, and §10's sentence about rotation is corrected. |
| 4 | A phone whose cap is full of someone else's hidden reports gives the next person "Couldn't reach the server" with no hint that nothing was saved (P3, critique) | **Recorded.** Their draft is kept in the tab. Spec §9 already records the case, and reaching it takes ten refusals from other people on one phone. |
| 5 | The waiting count is the phone's and the failed count is the viewer's alone, side by side in one style (P3, critique) | **Recorded.** The waiting count's scope is the owner's call (spec §5.1 Button count). |
| 6 | The viewer was read once at mount, safe only while every identity change remounts the footer (P3, critique) | **Fixed** with finding 1. |

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=2 dispositions=recorded
