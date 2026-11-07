# Crew page offline, piece 2 (offline reports): close-out

Branch `feat/crew-offline-reports`. Spec `docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md` §5, the §6 row and the §7 Reports bullet. Plan `docs/superpowers/plans/2026-11-07-crew-offline-reports.md` (10 tasks), which reached Codex APPROVE at plan round 9 (`docs/review-rounds/feat/crew-offline-reports/9054c83c1627.md`).

## §1 Shipped scope

- A crew report written with no signal (offline at the tap, a rejected POST, or a body that breaks off or stalls) is held in a phone-wide IndexedDB queue. The modal says "Saved on your phone. It will send by itself when you have signal." with a Done button.
- The sender runs from the page on load, `online`, visible and every 60 seconds while anything is queued. It sends oldest first under a Web Lock, reuses the key, keeps a record queued on a network failure, 409, 5xx, 429 or an answer that is not the route's JSON, and marks it failed on any other answer.
- Beside the report button: "N report(s) waiting for signal" and "N report(s) couldn't be sent". The second opens the modal on the oldest failed record, for Send again (a fresh key swapped in through the queue, never a direct POST) or a two-tap Discard.
- `POST /api/report` accepts `offline` and `writer`. A queued report is filed only for the crew member its writer names, and an admin session is refused too. `offline` is stored in `reports.context`, including on a retry against an existing reservation, and the issue gains a "Written with no signal" section. `REPORT_SUBMITTED_FROM_OFFLINE_QUEUE` is logged on the success branch, as an admin-log-only §12.4 row.
- A key belongs to the reporter who reserved it. Another reporter presenting it gets a 401. This hardening came from the automated security review, and it closes the same hole for ordinary retries.
- "Not you? Switch person" waits up to 3 seconds for queued reports before the clear.
- Eight real-browser cases, plus a small-screen case, in Chromium and WebKit: 18 passing.

Where the plan narrows the spec (plan §0, §1), recorded for the owner:
- A report is held only when the page names its author (a `save` or `keep` marker). An admin viewing the crew page, and a crew member on a page rendered with no viewer key, keep today's failure path.
- A persisted draft hydrates only for the person it was written for, and identity is read when the modal opens.
- The spec's §9 gains eight limits, among them that a failed report's text is visible to the next person who opens that show on a shared phone, which §5.1's resend under the current identity implies.

## §12 Impeccable dual gate: findings and dispositions

First run, on `3f911227b`: `/impeccable critique` RAN, dual-agent (design review and detector run as separate sub-agents), 26/40. `/impeccable audit` RAN, 14/20, on real components in Chromium and desktop WebKit. The detector found 0 issues, and planted controls in all three files fired. Screenshots came from a throwaway Playwright capture against the production build, light and dark, at 390, 320 and 1280.

One bounded re-check, on `7a7f66152`, the same method: critique 28/40, audit 17/20. It found three new P1s, all fixed in the next commit.

| # | Finding (severity, source) | Disposition |
|---|---|---|
| 1 | Discard deleted a report in one tap, beside Send again (P1, critique and audit) | **Fixed.** Two taps with the DESIGN.md §15 confirm recipe, a 4 s revert, the shared expiry announcement, and a `_metaDestructiveConfirm` registry row. |
| 2 | A refused Send again dropped focus to the page and said nothing (P1, critique and audit) | **Fixed.** The status region speaks the refusal, and focus returns to the state's main control whenever it falls to the page. The same rule covers Retry, the success Close and Start fresh. |
| 3 | The failed sheet opened the keyboard, and nothing said why it had opened (P1, critique; P2, audit) | **Fixed.** No autofocus on a failed record, and `aria-describedby` points at the notice. |
| 4 | The horizon code's catalog copy said to open a fresh report, under a Send again button (P1, critique; P2, audit) | **Fixed.** That code's copy stays out of this sheet. The other final codes' copy still shows. |
| 5 | The footer counts overflowed at 320 px with 150% text, and pushed the report button off screen at 200% (P1, audit) | **Fixed.** Below `md` the counts take their own row. A real-browser case checks 320 px at 200%, and 680 px at 200%. |
| 6 | The sheet could not scroll, so a short landscape screen clipped both ends (P1, audit) | **Fixed.** The panel scrolls. A real-browser case reaches Close and Send again at 844x390. |
| 7 | Re-check: the success screen still showed the failure notice (P1) | **Fixed.** The notice is hidden once delivered, and stops describing the dialog. |
| 8 | Re-check: Send again left Discard armed, and could announce an expiry for a refusal (P1) | **Fixed.** A resend clears the arm, its timer and the expiry flag. |
| 9 | Re-check: text overlap at 640 to 710 px with 200% text (P1) | **Fixed.** The breakpoint moved from `sm` to `md`. |
| 10 | Done and Send again rendered at 12 px, inherited from the footer (P2, both) | **Fixed.** The panel sets `text-base`. |
| 11 | A read-only textarea looked editable (P2, critique) | **Fixed** (styled read-only). The resize grip stays (P3, recorded). |
| 12 | The two footer chips looked alike (P2, critique) | **Fixed.** The failed count has a border, a glyph and `text-sm`, and it says it opens a dialog. |
| 13 | A background send is never confirmed: the count just clears (P2, both) | **Ratified.** The owner's mockup says "When it goes, the count clears." A sent confirmation would be new copy outside spec §5. |
| 14 | Edits to a failed report are lost on close (P2, audit) | **Ratified limit.** Spec §5.1 keeps the modal's per-surface storage away from failed records. The stored text is unchanged until Send again. |
| 15 | No DESIGN.md §1.2 row for text-strong on info-bg (P3, audit) | **Fixed.** Row added: 16.4 and 15.0. |
| 16 | P3s: no hover on the failed count (fixed); Tab order below `md` goes to the row under the button and back; a refusal speaks the fixed line, not its reason (the notice and description carry it); the armed label wraps at 320 px and 200% | **Recorded.** None blocks a task. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=9 dispositions=recorded
