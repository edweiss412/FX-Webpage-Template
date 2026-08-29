# Wizard report draft survives the modal close

**Row:** `BL-WIZARD-REPORT-DRAFT-LOST-ON-ESCAPE` (BACKLOG.md, filed 2026-08-29) · **Branch:** `fix/wizard-report-draft-escape` · **Effort:** S · **Facing:** product

A half-typed report message in the wizard review modal dies when the modal closes. This spec makes the draft outlive the modal, and changes nothing about what Escape does.

## 1. The defect, reproduced

`Step3ReviewModal` renders through `ReviewModalShell` (`components/admin/wizard/Step3ReviewModal.tsx:480`, the `<ReviewModalShell` open site) and passes no `onEscapeCapture`, so the shell's document key handler falls through to `requestClose()` for every Escape (`components/admin/review/ReviewModalShell.tsx:261`, `if (onEscapeCapture?.() === true) return;`). The consumer unmounts on close. `ReportIssueSection` holds its draft in mount-local state (`components/admin/wizard/step3ReviewSections.tsx:4621`, `const [draft, setDraft] = useState("")`), so the unmount takes the text with it. The component says so itself, in the `ReportIssueSection` docblock: "Draft persistence is mount-local only (spec-accepted)".

This is reproduced, not asserted. `tests/components/admin/wizard/step3ReportDraftEscape.test.tsx` carries two blocks, committed at `b230ccb9d`:

- **PROBE** characterises today. Type into the report textarea, press Escape, wait out the shell's exit window, remount: `onClose` fired once and the reopened textarea is empty. It passes on `main`.
- **PIN** states the boundary. After one Escape the draft is either still on screen or recoverable on reopen. It fails today, because both disjuncts are false.

The PIN was tautological in its first draft. A 50 ms sleep expired inside the exit animation, `onClose` had not fired yet, and the still-painted textarea satisfied the "stayed open" branch on the very tree that was about to be destroyed. It now waits `DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS` (`ReviewModalShell.tsx:54` and `ReviewModalShell.tsx:62`) plus margin before reading the spy. That mistake is recorded because the same shape would silently pass any future test of this surface written the obvious way.

The exposure is narrow by construction: this textarea is the only one in `components/admin` (`rg '<textarea' components/admin` returns exactly one hit, `step3ReviewSections.tsx:4742`). The published side's Report control is a one-click action with nothing to lose.

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
| **The spec-accepted "mount-local only" posture is what this row overturns**, deliberately. The `ReportIssueSection` docblock line saying so is updated by this arc, not worked around. | `step3ReviewSections.tsx:4621` (`ReportIssueSection`) |

## 2. What ships

Persist the draft in `sessionStorage`, keyed the way the attempt key in the same component already is, and restore it when the section mounts.

### 2.1 The key

`fxav-report-draft-wizard-${wizardSessionId}-${driveFileId}`, produced by a `reportDraftStorageKey` helper sitting beside `reportAttemptStorageKey` (`step3ReviewSections.tsx:4564`) and scoped identically. The existing key's own comment gives the reason and it applies unchanged: a later wizard session for the same file is a DIFFERENT report, so it must not inherit the earlier session's text.

`sessionStorage`, not `localStorage`, matching the attempt key. The draft dies with the tab, which is the correct lifetime for an un-sent message.

### 2.2 Write, read, clear

| Path | When | Behaviour |
|---|---|---|
| **Write** | Every `onChange` on the textarea | Store the new value under the key. A non-empty draft writes; an empty one REMOVES the key rather than storing `""`, so a cleared field leaves nothing behind. |
| **Read** | `useState` lazy initialiser on mount | Return the stored string, truncated to `REPORT_MESSAGE_MAX_CHARS`. Absent key returns `""`, which is today's initial value exactly. |
| **Clear** | Successful submit, beside the existing `rotateAttemptKey` call | Remove the key. A sent report must not come back as a ghost draft. |

Per-keystroke writes are chosen over a write-on-unmount effect. Unmount ordering is one more thing to be wrong about, and the value is capped at 2000 characters, so the write is trivial.

### 2.3 The restored draft has to be visible

A restored draft the operator cannot see is half a repair: they reopen, see the collapsed disclosure, and retype. So whenever the draft is non-empty, the disclosure trigger reads **"Continue your report"** instead of **"Write a report"**; the disclosure itself stays COLLAPSED on mount and focus is untouched.

The label is DERIVED from the current `draft` value, not captured at mount. A mount-time capture goes stale the moment the operator expands the form and deletes their text: the trigger would still promise a report to continue while the field behind it is empty. A derived label cannot drift, needs no extra state, and costs one ternary.

Auto-expanding on mount is DECLINED. The §D1 focus effect fires whenever `expanded` is true (`step3ReviewSections.tsx`, the `useEffect` guarded on `expanded`), and its comment states the contract it relies on: "mount starts collapsed so this never fires on initial render." Mounting expanded would steal focus from the shell's `initialFocusRef` (the close button, `Step3ReviewModal.tsx` `initialFocusRef={closeRef}`) at the exact moment the dialog opens. A label swap costs no focus behaviour and no new state.

Copy rules: no em dash, and no apostrophe is needed in either string.

## 3. Guard conditions

| Input / state | Behaviour |
|---|---|
| `sessionStorage` unavailable or throwing (private mode, disabled site data) | Every read and write is wrapped in `try`/`catch`, matching `mintOrReuseAttemptKey` (`step3ReviewSections.tsx:4572-4583`). On a throw the section behaves EXACTLY as it does today: mount-local draft, no persistence, no error surfaced. The repair degrades to the current behaviour and never to a crash. |
| Stored value absent | `""`. Identical to today's initial state. |
| Stored value empty string | Treated as absent. The write path never creates this, but a key written by an older build might hold it. |
| Stored value longer than `REPORT_MESSAGE_MAX_CHARS` (2000, `step3ReviewSections.tsx:4548`) | Truncated to the cap on read. The textarea's own `maxLength` bounds what a user can type; a stale or hand-edited key is the only way an over-length value arrives, and it must not defeat the cap. |
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

N/A. No fixed-dimension parent and no flex/grid child relationship is added or altered. The only DOM change is the text content of an existing button.

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

## 7. Documented limits

- **The draft dies with the tab.** `sessionStorage` is per-tab and per-origin. Closing the tab, or opening the wizard in a second tab, starts empty. Deliberate: an un-sent report message is not a document, and `localStorage` would resurrect stale text days later in a different show.
- **No cross-device or cross-session recovery.** Same reason.
- **Keys accumulate for the life of the tab**, one per (wizard session, drive file) with a non-empty draft, each bounded at 2000 characters. A wizard session covering many shows where the operator types into many report fields and sends none is the worst case, and it is bounded by the show count and cleared by closing the tab. No eviction policy ships.
- **A draft written by a build with a different key shape is orphaned, not migrated.** It is unreachable text in a tab-scoped store; it disappears with the tab.

## 8. Out of scope

- Any change to what Escape does, in either modal. See §1.1.
- The published review modal's report control, which has no draft to lose.
- `ReportModal` (`components/shared/ReportModal.tsx`), the crew-facing surface. It is a different component with its own attempt-key reuse; this arc does not touch it.
- Draft persistence for any other field in the wizard.
