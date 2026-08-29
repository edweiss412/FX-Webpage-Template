# Wizard report draft survives the modal close

**Row:** `BL-WIZARD-REPORT-DRAFT-LOST-ON-ESCAPE` (BACKLOG.md, filed 2026-08-29) · **Branch:** `fix/wizard-report-draft-escape` · **Effort:** S · **Facing:** product

A half-typed report message in the wizard review modal dies when the modal closes. This spec makes the draft outlive the modal, and changes nothing about what Escape does.

## 1. The defect, reproduced

`Step3ReviewModal` renders through `ReviewModalShell` (`components/admin/wizard/Step3ReviewModal.tsx:480`, the `<ReviewModalShell` open site) and passes no `onEscapeCapture`, so the shell's document key handler falls through to `requestClose()` for every Escape (`components/admin/review/ReviewModalShell.tsx:261`, `if (onEscapeCapture?.() === true) return;`). The consumer unmounts on close. `ReportIssueSection` held its draft in mount-local state (`const [draft, setDraft] = useState("")` at `components/admin/wizard/step3ReviewSections.tsx:4737`, which this arc replaced with a restoring initialiser), so the unmount took the text with it. The component says so itself, in the `ReportIssueSection` docblock: "Draft persistence is mount-local only (spec-accepted)".

This is reproduced, not asserted. `tests/components/admin/wizard/step3ReportDraftEscape.test.tsx` carries two blocks, committed at `b230ccb9d`:

- **PROBE** characterises today. Type into the report textarea, press Escape, wait out the shell's exit window, remount: `onClose` fired once and the reopened textarea is empty. It passes on `main`.
- **PIN** states the boundary. After one Escape the draft is either still on screen or recoverable on reopen. It fails today, because both disjuncts are false.

The PIN was tautological in its first draft. A 50 ms sleep expired inside the exit animation, `onClose` had not fired yet, and the still-painted textarea satisfied the "stayed open" branch on the very tree that was about to be destroyed. It now waits `DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS` (`ReviewModalShell.tsx:54` and `ReviewModalShell.tsx:62`) plus margin before reading the spy. That mistake is recorded because the same shape would silently pass any future test of this surface written the obvious way.

The exposure is narrow by construction: this textarea is the only one in `components/admin` (`rg '<textarea' components/admin` returns exactly one hit, `step3ReviewSections.tsx:4852`). The published side's Report control is a one-click action with nothing to lose.

## 1.1 Resolved scope, do not relitigate

| Decision | Ratification |
|---|---|
| **Fork (a), silent persistence, is what ships.** Eric's call, relayed through bl-orch 2026-08-29. Escape semantics are untouched. | This section; the arc kickoff brief, which is fleet scratch and not tracked in this repo |
| **Fork (b), a dirty-field Escape trap, is DECLINED.** It makes Escape do nothing visible on every press while the field is dirty. `lib/admin/escapeClaim.ts:26-29` deliberately bounds invisible consumption to exactly one key, calling `consume-claim` "the ONE key that changes nothing visible, and it is bounded to one by the spending." An unbounded invisible consumption is the property that design rejected. | `lib/admin/escapeClaim.ts:26-29` |
| **Fork (c), a confirm prompt, is DECLINED.** A confirm inside an open focus trap, for one un-sent LOW-severity message, and the repo ships no such pattern. | Row severity, BACKLOG.md |
| **Escape layering in this modal is already settled and is NOT reopened here.** The §3.5 scoping amendment (ratified 2026-08-28) says a sub-surface the operator ENGAGED with claims Escape and one that opened itself does not; all three cases are pinned at `tests/components/admin/wizard/Step3ReviewModal.test.tsx:607`, tests `(12a)`, `(12b)` and `(12)`. This spec adds no Escape claimant, so that rule is untouched. | `tests/components/admin/wizard/Step3ReviewModal.test.tsx:607` |
| **The `onEscapeCapture` prop stays unused by the wizard.** Its sole consumer remains `PublishedReviewModal.tsx:990`. | `components/admin/review/ReviewModalShell.tsx:100`, `components/admin/showpage/PublishedReviewModal.tsx:990` |
| **`FinalizeButton`'s capture-phase Escape preempt is unaffected.** It listens in the capture phase and calls `stopImmediatePropagation`, so a finalize overlay above the review modal already swallows Escape before the shell sees it. Nothing here runs on that path. | `components/admin/FinalizeButton.tsx:767` |
| **Collapse survival is existing, tested behaviour and is not the fix.** A draft already survives collapsing the disclosure, because `draft` lives at component level and only the form subtree unmounts. | `tests/components/admin/wizard/step3ReviewSections.test.tsx:1218` (T-D1) |
| **The spec-accepted "mount-local only" posture is what this row overturns**, deliberately. The `ReportIssueSection` docblock line saying so is updated by this arc, not worked around. | `step3ReviewSections.tsx:4737` (`ReportIssueSection`) |

## 2. What ships

Persist the draft in `sessionStorage`, keyed the way the attempt key in the same component already is, and restore it when the section mounts.

### 2.1 The key

`fxav-report-draft-wizard-${wizardSessionId}-${driveFileId}`, produced by a `reportDraftStorageKey` helper sitting beside `reportAttemptStorageKey` (`step3ReviewSections.tsx:4564`) and scoped identically. The existing key's own comment gives the reason and it applies unchanged: a later wizard session for the same file is a DIFFERENT report, so it must not inherit the earlier session's text.

`sessionStorage`, not `localStorage`, matching the attempt key. The draft dies with the tab, which is the correct lifetime for an un-sent message.

### 2.2 Write, read, clear

| Path | When | Behaviour |
|---|---|---|
| **Write** | Every `onChange` on the textarea | Store the new value under the key. A non-empty draft writes; an empty one REMOVES the key rather than storing `""`, so a cleared field leaves nothing behind. If the write THROWS, the key is removed rather than left holding the previous, shorter value: a write can fail after an earlier one succeeded (a mid-session quota error), and a stale prefix restored later reads as a complete draft that silently lost its tail. Restoring nothing is honest; restoring a truncated draft is not. |
| **Read** | `useState` lazy initialiser on mount | Return the stored string, truncated to `REPORT_MESSAGE_MAX_CHARS`. Absent key returns `""`, which is today's initial value exactly. |
| **Clear** | Successful submit, beside the existing `rotateAttemptKey` call | Remove the key. A sent report must not come back as a ghost draft. |

Per-keystroke writes are chosen over a write-on-unmount effect. Unmount ordering is one more thing to be wrong about, and the value is capped at 2000 characters, so the write is trivial.

### 2.3 The restored draft has to be visible

A restored draft the operator cannot see is half a repair: they reopen, see the collapsed disclosure, and retype. So whenever the draft is non-empty, the disclosure trigger reads **"Continue your report"** instead of **"Write a report"**; the disclosure itself stays COLLAPSED on mount and focus is untouched.

All three predicates over the draft read the TRIMMED value: the trigger label, the guarantee line, and the existing submit guard and disabled state, which already trimmed. One typed space is not a report, and an untrimmed label promised one to continue while `Send report` sat disabled with nothing on screen explaining the contradiction (audit P3).

The label is DERIVED from the current `draft` value, not captured at mount. A mount-time capture goes stale the moment the operator expands the form and deletes their text: the trigger would still promise a report to continue while the field behind it is empty. A derived label cannot drift, needs no extra state, and costs one ternary.

**The guarantee is stated, not just kept.** Whenever the draft is non-empty the section renders one quiet line under the trigger: **"Kept on this device until you close the tab."** It is ambient helper text (`text-xs/relaxed text-text-subtle`), not a live region, so it never interrupts a screen reader mid-typing. It renders in BOTH disclosure states: collapsed it is the only thing on screen saying the text is safe, expanded it sits beside the text it describes. Without it a silent success is indistinguishable from a silent failure of the store, and an operator who does not already know the guarantee exists retypes instead of reopening.

Auto-expanding on mount is DECLINED. The §D1 focus effect fires whenever `expanded` is true (`step3ReviewSections.tsx`, the `useEffect` guarded on `expanded`), and its comment states the contract it relies on: "mount starts collapsed so this never fires on initial render." Mounting expanded would steal focus from the shell's `initialFocusRef` (the close button, `Step3ReviewModal.tsx` `initialFocusRef={closeRef}`) at the exact moment the dialog opens. A label swap costs no focus behaviour and no new state.

Copy rules: no em dash, and no apostrophe is needed in either string.

## 3. Guard conditions

| Input / state | Behaviour |
|---|---|
| `sessionStorage` unavailable or throwing (private mode, disabled site data) | Every read and write is wrapped in `try`/`catch`, matching `mintOrReuseAttemptKey` (`step3ReviewSections.tsx:4667`). On a throw the section behaves EXACTLY as it does today: mount-local draft, no persistence, no error surfaced. The repair degrades to the current behaviour and never to a crash. |
| Stored value absent | `""`. Identical to today's initial state. |
| Stored value empty string | Treated as absent. The write path never creates this, but a key written by an older build might hold it. |
| Stored value longer than `REPORT_MESSAGE_MAX_CHARS` (2000, `step3ReviewSections.tsx:4548`) | Truncated to the cap on read, by `capDraft`, which never splits a character: a cap landing between the two code units of an astral code point drops the orphan rather than emitting a lone surrogate. The textarea's own `maxLength` bounds what a user can type; a stale or hand-edited key is the only way an over-length value arrives, and it must not defeat the cap. The clear-on-success comparison runs through the SAME `capDraft` normalisation, so an over-length stored value still matches the capped state it was restored into. |
| `wizardSessionId` or `dfid` empty | The key is still well-formed and still scoped. No special case: an empty segment yields a distinct key that simply never collides with a populated one. |
| Two cards open in sequence in one wizard session | Distinct `dfid`, distinct key. Card A's draft never appears in card B. |
| Draft submitted successfully, then modal reopened | Key cleared at submit, so the field is empty. |
| Submit fails | Key NOT cleared. The text the operator would have to retype is exactly what the repair exists to keep. |

## 4. Transition inventory

Two states are added to a surface whose existing transitions are all §D2 instant. No new animation ships.

| # | Transition | Treatment |
|---|---|---|
| R1 | trigger label: "Write a report" ↔ "Continue your report" | instant, deliberate. It is a text swap on a static control, matching every other §D2 row in this section. |
| R2 | collapsed ↔ expanded, draft absent | unchanged (§D2 instant, existing). |
| R3 | collapsed ↔ expanded, draft restored | unchanged (§D2 instant). The restored value is present in the textarea on the first expanded frame; there is no fill animation and no empty-then-populate flash, because the value comes from the state initialiser, not an effect. |
| C1 | draft restored while a previous submit's status line is still rendered | Independent. The status region lives outside the conditional subtree (`step3ReviewSections.test.tsx` T-D3z/T-D3a) and is not read or written by this change. A fresh mount starts at `{ kind: "idle" }` regardless of the restored draft. |
| C2 | label swap while the disclosure is EXPANDED | instant, and unobserved in practice. The label is derived from `draft`, so it flips the moment the field goes empty or non-empty; while expanded the operator is looking at the textarea, and on collapse the trigger is already correct. This is the case a mount-time capture would have got wrong. |

## 5. Dimensional invariants

N/A. No fixed-dimension parent and no flex/grid child relationship is added or altered.

The DOM changes are the text content of an existing button and, when the draft is non-empty, one conditional `<p>` added as a sibling inside the section's existing flex column (§2.3). It inherits that column's `gap` and sets no width, height, or flex property of its own, so it introduces no parent-to-child dimension relationship to state. (An earlier draft of this section said the only DOM change was text inside a button; that was written before the guarantee line existed and was stale by the time it was read. Diff review R1 F3.)

## 6. Acceptance criteria

- **AC-1** A draft typed into the wizard report textarea is present in the textarea after the modal is closed by Escape and reopened.
- **AC-2** The same holds for every other close path (close button, scrim), because the mechanism is the section's mount, not the key that closed the dialog.
- **AC-3** Escape behaviour is unchanged: one Escape on an open modal with no engaged sub-surface still closes it, and `onClose` still fires exactly once.
- **AC-4** A successful submit clears the stored draft; the reopened modal shows an empty field.
- **AC-5** A failed submit does not clear it.
- **AC-6** With `sessionStorage` throwing on every access, the section still renders, still accepts typing, and still submits; the draft simply does not persist.
- **AC-7** A stored value longer than `REPORT_MESSAGE_MAX_CHARS` is truncated on read.
- **AC-8** The trigger reads "Continue your report" whenever the draft is non-empty and "Write a report" otherwise, including after the operator clears a restored draft in place, and the disclosure is collapsed on mount in BOTH cases.
- **AC-9** Focus on modal open is unchanged: it lands on the close button, never on the textarea, whether or not a draft was restored.
- **AC-10** Drafts are scoped per wizard session and per drive file; neither leaks into the other.
- **AC-11** The guarantee line renders whenever the draft is non-empty, in both disclosure states, and disappears when the field is emptied.
- **AC-12** Focus is never on the trigger at either moment its label flips, so no accessible name changes under the user.
- **AC-13** A whitespace-only draft is not a report: the trigger label, the guarantee line and the Send button agree, all three reading the trimmed value.
- **AC-14** A write that throws after an earlier one succeeded clears the key rather than leaving a stale prefix under it.
- **AC-15** A detached submit's success does not erase text a newer mount has typed: the clear is conditional on the store still holding the text that submit sent.
- **AC-12b** The third label flip, on submit success while collapsed with focus on the trigger, is accompanied by the live-region success announcement.
- **AC-4b** An over-length stored draft does not survive a successful send: the clear compares through the same cap the read applies.
- **AC-7b** The cap never splits a character: no unpaired surrogate can reach the textarea.

## 6.3 Cross-model review, diff round 2

Verdict NEEDS-ATTENTION, three findings, all accepted. Two of the three are consequences of round 1's own repair, which is worth stating rather than smoothing over.

| # | Finding | Disposition |
|---|---|---|
| F1 (P1) | An over-length restored draft resurrected after a successful send. The state is capped on read, the store is not, so R1's compare-and-clear read the store RAW, never matched, and never cleared. AC-4 broken by the guard added to protect AC-15. | FIXED, AC-4b. The comparison runs through `readStoredDraft`, so both sides pass the same cap. |
| F2 (P2) | `slice(0, 2000)` counts UTF-16 code units, so 1999 ASCII characters plus an emoji yields a lone high surrogate: malformed text, not the truncation §7 documents. The AC-7 fixture was `"x".repeat(n)`, which cannot distinguish prefix truncation from a suffix, from filler, or from boundary corruption. | FIXED, AC-7b, plus AC-7's fixture rebuilt from distinct characters so each wrong answer fails. |
| F3 (P2) | AC-6 promised the section still submits under throwing storage and the test stopped after typing. It would have passed while throwing storage broke attempt-key minting, the success settlement, or the compare-and-clear. | FIXED. AC-6 submits and asserts the success settles. The submit path is the half that touches storage most and was the half going unasserted. |

The reviewer's sandbox again could not start Vitest, so all three came from reading. Two of them were about tests being weaker than the claims above them, which is the failure mode a sandbox cannot mask.

## 6.2 Cross-model review, diff round 1

Verdict NEEDS-ATTENTION, three findings, all accepted. None relitigated a fenced decision.

| # | Finding | Disposition |
|---|---|---|
| F1 (P1) | A detached successful submit could erase newer text. Submit A, close mid-flight, reopen, type B, then let A succeed: the detached handler's unconditional clear removed B's stored text, and B stayed on screen until the next close and then was gone. | FIXED, AC-15. The clear is now compare-and-clear. This one is the arc's own repair reintroducing the loss the arc exists to stop: before persistence, a detached instance's `setDraft("")` touched only its own dead state, and writing to a SHARED key is what gave it reach. |
| F2 (P2) | AC-12's conclusion was false: there is a THIRD label flip, on submit success, and T-D3b ratifies collapsing while pending, which leaves focus on the trigger. | FIXED, AC-12b, and the claim in AC-12's own comment is corrected rather than quietly widened. The flip is acceptable because the same commit announces the outcome in the live region, and it is now pinned instead of assumed away. |
| F3 (P3) | The spec was not reconciled after the guarantee paragraph landed: §5 still claimed the only DOM change was text in a button, and several citations were keyed to the pre-repair file. | FIXED. §5 now describes the conditional `<p>`, the stale anchors are re-cited, and `spec:lint` is down to two advisories from five. |

The reviewer's own verification was partial and said so: its sandbox refused Vitest's temp directory, so no tests ran there, and `pnpm typecheck` failed on an `EPERM` writing `tsconfig.tsbuildinfo` rather than on any type error. Both commands run clean in the worktree. The findings stand on reading, which is where all three came from anyway.

## 6.1 Gate dispositions (invariant 8)

The impeccable dual gate ran on this diff: `critique` as two isolated sub-agents (design review, detector plus evidence) and `audit`. Browser inspection was skipped throughout, with cause: the surface needs DB-backed staged wizard rows and the fleet was in a DB quiet period, where a locally booted app server points at a shared validation deployment that sends real mail.

No P0. The audit scored 19/20 with no P0 and no P1; the critique scored 24/40 and raised the two P1s below. Dispositions, approved by bl-orch:

| Finding | Severity | Disposition |
|---|---|---|
| The restored draft is undiscoverable: the report section is always last, the modal reopens at the top, and the section's rail entry is the one with `railCount: null` and `hideDot: true` | P1 | DEFERRED to `BL-WIZARD-REPORT-DRAFT-RESTORE-UNDISCOVERABLE`, class-sweep exception (a). The repair has to reopen the ratified §D2 no-status-dot contract, which this arc cannot settle. |
| The guarantee is never stated in copy | P1 | FIXED in branch, §2.3 above, AC-11. |
| The trigger carries two orthogonal meanings (disclosure state and draft state) | P2 | DECLINED. While collapsed the trigger is the only element on screen, so it is the only thing that can carry the cue; the guarantee line now carries the substance and the label carries the verb. Recorded so it is not re-derived. |
| Auto-expand on mount when a draft was restored | P2 | DECLINED, and the reason is upgraded from mechanism to principle: it does not solve the real problem (the section is below the fold either way) and it changes mount state and focus for a case the operator may not care about. |
| No character counter on a 2000-char field; a restored over-length draft is truncated silently | P3 | PARKED. The counter is pre-existing and unrelated to persistence; the truncation is already a documented limit in §3. |
| Textarea has no disabled or error state; submit has no active state; submit shows hover fill while disabled | P2/P3 | PRE-EXISTING, not introduced here. A different defect class from this row, so out of scope under the class-sweep rule; not filed, because the class-sweep default applies to instances of the shape a PR is repairing, and this is not that shape. |
| The label swap is not announced, and nothing pinned that focus is elsewhere when it flips | P2 | FIXED by pin rather than by code: AC-12 asserts focus is off the trigger at both flip moments, so a later focus-restore change fails loudly instead of silently reintroducing a WCAG 4.1.2 problem. |
| Whitespace-only draft: the label predicate did not trim while every other consumer of `draft` did | P3 | FIXED in branch, AC-13. |
| A write that throws after an earlier success leaves a stale prefix that restores silently | P3 | FIXED in branch, AC-14. |
| Nothing announces the restore to a screen-reader user | P3 | DECLINED. The guarantee line is deliberately ambient rather than a live region: the restore is not an event the operator caused at that moment, and announcing it interrupts. The trigger's accessible name does carry "Continue your report" when they reach the control. |
| Detector: two `broken-image` hits | n/a | FALSE POSITIVES. Both are the string `<img>` inside JSDoc prose, at lines this diff does not touch. |

**SSR and hydration, the audit's load-bearing question.** `readStoredDraft` runs inside a `useState` lazy initialiser and touches `window.sessionStorage`, which would be a hydration mismatch if the subtree ever rendered on the server. It cannot, and the reason is NOT that the files carry `"use client"` — a client component still server-renders, and an earlier draft of this section leaned on exactly that non-argument. The real argument is that the subtree is absent from both passes:

- `ReportIssueSection` enters the tree only through the `report` section def, gated on `includesReport(d)` and again on `isStaged(s)` in its `render`, and `includesReport` is `d.mode === "staged"` (`components/admin/review/sectionInclusion.ts:44`).
- Staged mode is reachable only through `Step3ReviewModal`, mounted behind `{detailsOpen ? ... : null}` (`components/admin/wizard/Step3SheetCard.tsx:630`) whose state starts `false` (`Step3SheetCard.tsx:273`). The server pass and the hydration pass both read `false`, so the mount is a post-hydration click.
- The repo's one SSR-open-modal path is the published `/admin?show=` cold load, and `ReviewModalShell.tsx` says so in the comment on that path: "Client-side opens (step3) never hit this". That path is published mode, where `includesReport` is false, so this section is not in that tree either.

Belt and braces, and worth stating because it bounds the blast radius if the mount chain is ever changed: `window is not defined` is a `ReferenceError`, which the bare `catch` in `readStoredDraft` does catch. The failure would be a trigger-label text mismatch and a recoverable hydration warning, never a crash.

## 7. Documented limits

- **The draft dies with the tab.** `sessionStorage` is per-tab and per-origin. Closing the tab, or opening the wizard in a second tab, starts empty. Deliberate: an un-sent report message is not a document, and `localStorage` would resurrect stale text days later in a different show.
- **No cross-device or cross-session recovery.** Same reason.
- **Keys accumulate for the life of the tab**, one per (wizard session, drive file) with a non-empty draft, each bounded at 2000 characters. A wizard session covering many shows where the operator types into many report fields and sends none is the worst case, and it is bounded by the show count and cleared by closing the tab. No eviction policy ships.
- **The store-versus-state invariant rests on `maxLength`, not on the storage helpers.** `capDraft(stored) === restored state` holds because `readStoredDraft` caps on read and the clear compares through the same cap, but `writeStoredDraft` does not cap on write. Nothing needs it to, because every value reaching it comes from the textarea's `onChange` and is bounded by `maxLength={REPORT_MESSAGE_MAX_CHARS}`. If a later edit drops that attribute or writes the draft from anywhere else, the invariant breaks silently and a sent report starts returning as a ghost. Recorded as a limit rather than closed by capping on write, because no reachable input exercises the difference today and a guard no test can tell from its absence is worse than a stated limit. The re-file trigger is a second writer of this key, or the loss of that `maxLength`.
- **A draft written by a build with a different key shape is orphaned, not migrated.** It is unreachable text in a tab-scoped store; it disappears with the tab.

## 8. Out of scope

- Any change to what Escape does, in either modal. See §1.1.
- The published review modal's report control, which has no draft to lose.
- `ReportModal` (`components/shared/ReportModal.tsx`), the crew-facing surface. It is a different component with its own attempt-key reuse; this arc does not touch it.
- Draft persistence for any other field in the wizard.
