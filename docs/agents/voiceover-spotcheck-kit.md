# VoiceOver spot-check kit: Sheet warnings announcer

Pass kit for `DEFERRED.md` → `VOICEOVER-ANNOUNCER-SPOTCHECK` (owner action, filed 2026-07-22).
The row asks the owner to run VoiceOver over **ignore**, **bulk-ignore**, and **pointer
reveal**, and confirm one polite utterance per action, silence on background refreshes, and
the reveal focus move. Only the owner can perform it. This file exists so the run takes about
ten minutes instead of an hour: every expected utterance below is quoted from the shipped
code with a `file:line`, so you are comparing what VoiceOver says against a written string
rather than deciding on the spot whether what you heard was right.

Written 2026-08-29 against `e7751f61d`. Every citation was grepped at that commit. If a
citation no longer resolves, the surface moved and this kit is stale. Re-map before running.

## Run it against a real show. Not the dev gallery.

`/admin/dev/attention-gallery` looks like the right harness and is the wrong one. Every
mutating call from that page is intercepted at the network boundary
(`components/admin/dev/GalleryWriteGuard.tsx`) and answered with a synthetic
`403 {"ok":false,"code":"GALLERY_DISPLAY_ONLY"}` (`GalleryWriteGuard.tsx:118-119`). The
scenario scripts can fake a bulk-ignore **partial**, **fail**, or **pending** outcome, and
those are the only three kinds the type admits (`lib/dev/attentionScenarios/types.ts:180`).
There is no success kind.

That matters because every announcement in this feature fires on a fetch-**success** branch
and nowhere else. In the gallery the success branch is unreachable, so the panel is silent
and the silence means nothing. Use a real show with real warnings.

## Setup

1. Local stack up, dev server running, signed in as an admin.
2. Pick a published show that currently has data-quality warnings, ideally one with **four
   or more** warning-carrying sections (the pointer reveal only appears above three) and at
   least one warning **group of two or more** sharing a code (the bulk chip only appears for
   a group).
3. macOS VoiceOver: `Cmd+F5` to toggle. `Ctrl+Option` is the VO modifier. Safari is the
   reference browser; Chrome is acceptable but announces some role="log" additions with
   different timing.
4. Turn on the VoiceOver caption panel, at VoiceOver Utility → General → "Show caption panel".
   You are checking exact strings, and reading them beats remembering them.
5. Optional but useful: VoiceOver Utility → Verbosity → Announcements, so you can confirm
   nothing extra rides along.

## The two surfaces

The original row named one surface. There are now two, and both need the pass.

- **Published review modal**, at `/admin?show=<slug>`. The show page at `/admin/show/<slug>`
  redirects into it (`app/admin/show/[slug]/page.tsx:5`); the modal itself is
  `app/admin/_showReviewModal.tsx:77`. Open the **Sheet warnings** section.
- **Onboarding wizard, step 3**, at `/admin/onboarding`, the same review surface in wizard
  mode. Ignore and Un-ignore now ship here too (PR #943,
  `feat/wizard-warning-ignore-controls`), and `ShowReviewSurface` deliberately gives every
  surface mount the real announce channel rather than the published one only
  (`components/admin/review/ShowReviewSurface.tsx:873-880`). A silent state change in the
  wizard is an a11y defect, so run step A on both.

**Step B is published-only.** The wizard has no bulk chip. `BulkIgnoreControls` has exactly
one render site, and it sits behind a published gate: `if (!isPublished(d)) return null;`
(`components/admin/showpage/sectionWarningExtras.tsx:163`, chip at `:279`), and that module's
factory has exactly one caller, the published modal
(`components/admin/showpage/PublishedReviewModal.tsx:303`). The wizard's step-3 panel renders
only the per-card controls (`components/admin/wizard/step3ReviewSections.tsx:3333`, `:3411`).
On a wizard run, score every B row N/A. An absent control is not a FAIL.

Step C runs on both: `pointerTargets` is derived with no published/wizard gate
(`ShowReviewSurface.tsx:494`) and spread into the warnings chrome together with
`onJumpToSection` (`:1148-1151`), which is what makes the overflow clause a button rather
than plain text.

The panel is titled **Sheet warnings** (`components/admin/wizard/step3ReviewSections.tsx:5004`).
It was called "Parse warnings" before PR #568; that name survives only in code comments and
in the jump-button copy ("Fix in Sheet warnings" / "Review in Sheet warnings",
`step3ReviewSections.tsx:679`).

## The one live region everything speaks through

A single `role="log"` element, screen-reader-only, accessible name **"Warning updates"**,
`data-testid="warnings-panel-status"`. It is rendered only for the warnings section
(`ShowReviewSurface.tsx:1202-1207`); the element itself is `AnnounceLogRegion`
(`components/admin/announceLog.tsx:134`).

`role="log"` carries implicit `aria-live="polite"`, `aria-atomic="false"` and
`aria-relevant="additions text"` and the code treats those implicits as the contract, so
there is no explicit `aria-live` anywhere to look for (`announceLog.tsx:120-123`). Three
consequences you are listening for:

- Additions speak. Only the added node is presented, never the whole log.
- Removals are silent (`announceLog.tsx:24`, `:99`).
- Existing entry text never mutates, so nothing is ever re-spoken.

The log is append-only, capped at 50 entries (`ANNOUNCE_LOG_CAP`, `announceLog.tsx:26`), and
on this surface it is created with **no** TTL (`ShowReviewSurface.tsx:402`), so a recent entry
is never pruned out from under a queued utterance.

The bulk chip additionally has its own small `role="status"` span pinned as the chip's next
sibling (`components/admin/BulkIgnoreControls.tsx:227`). That one carries the confirm-window
copy, not the completion copy.

## Step scripts

Do them in this order. Each step names the exact string to listen for.

### A. Single ignore, then un-ignore

Control: the **Ignore** button on an individual warning card,
`data-testid="dq-<action>-<reportSurfaceId>"` (`components/admin/DataQualityWarningControls.tsx:241`).

1. VO-navigate to the button. Expected name: **"Ignore"** (`DataQualityWarningControls.tsx:247-253`).
2. Activate it. While the request is in flight the label becomes **"Ignoring…"** and the
   button is `aria-busy`.
3. On success, expect **exactly one** utterance: **"Warning ignored."**
   (`DataQualityWarningControls.tsx:179`).
4. A `router.refresh()` fires right after the announce (`DataQualityWarningControls.tsx:183`).
   Expect **no second utterance** from it.
5. Find the same warning in its ignored state. Expected button name: **"Un-ignore"**;
   in-flight, **"Un-ignoring…"**.
6. Activate it. Expect exactly one utterance: **"Warning restored."** (same line, `:179`).

Failure path, worth one deliberate try if you can force it (stop the dev server mid-click):
failures **never** announce. The error surfaces as a `role="alert"` paragraph instead
(`DataQualityWarningControls.tsx:257-259`). VoiceOver should interrupt with the alert copy,
not add a line to the log.

### B. Bulk ignore (published surface only): a two-tap confirm, so three things to hear

Control: the group chip, `data-testid="dq-bulk-ignore-<code>"`
(`components/admin/BulkIgnoreControls.tsx:216`). Its accessible name leads with the visible
text in every state, so Label-in-Name holds across the morph
(`BulkIgnoreControls.tsx:163-168`).

1. VO-navigate to the chip. Visible text **"Ignore"**; accessible name **"Ignore <count>"**,
   or **"Ignore <count> · <group label>"** when the group has a plain-language label
   (`BulkIgnoreControls.tsx:173-177`, `:220`).
2. **First tap: arms, does not act.** Visible text becomes **"Are you sure?"**; accessible
   name becomes **"Are you sure? Ignore <count>"**, keeping the **" · <group label>"** suffix
   if the group had one at B1 (the suffix is applied to the name in every state,
   `BulkIgnoreControls.tsx:220`). The sibling `role="status"` says
   **"Tap again to confirm."** (`BulkIgnoreControls.tsx:228-229`).
3. **Let it expire once, deliberately.** Wait out the 4-second arm window
   (`ARM_REVERT_MS = 4_000`, `lib/admin/destructiveConfirm.ts:18`). Expect
   **"Confirm window closed. Nothing was changed."** (`ARM_EXPIRED_ANNOUNCEMENT`,
   `destructiveConfirm.ts:28`).
4. Re-arm, then **tap again within 4 seconds**. Visible text becomes **"Ignoring…"**.
5. On an all-succeeded batch, expect **exactly one** utterance:
   **"1 ignored."** for a single item, otherwise **"<n> ignored."**
   (`BulkIgnoreControls.tsx:135`).
6. `router.refresh()` follows the announce (`BulkIgnoreControls.tsx:136`). Expect no second
   utterance.

Failures never announce. They render a `role="alert"` paragraph instead
(`BulkIgnoreControls.tsx:241-245`), and the surface deliberately does **not** auto-refresh, so
the notice survives. The copy differs by failure kind (`BulkIgnoreControls.tsx:146`):

- **Some succeeded:** **"Ignored `<ok>` of `<n>`. Refresh to see the rest."** The ones that
  landed really are committed, so this is honest rather than pessimistic.
- **None succeeded, or the request threw:** **"Couldn't ignore those warnings. Refresh and
  try again."** (`failCopy`, `BulkIgnoreControls.tsx:110`).

### C. Pointer reveal: the focus move

This one only exists in the "warnings are elsewhere" state: the panel itself is clean and
points at other sections. It needs **more than three** warning-carrying sections, all of them
label-resolved (`ElsewherePointerSentence`, `components/admin/wizard/step3ReviewSections.tsx:805`).

The sentence names at most three sections, then collapses the rest. With five
warning-carrying sections it reads: *"The warnings that need a look are in Crew, Contacts,
Rooms & scope, and 2 more. Nothing else to note here."* The names are data-driven, so yours
will differ; what is fixed is that **three** appear before the overflow clause
(`POINTER_NAME_CAP = 3`, `step3ReviewSections.tsx:761`; `named = targets.slice(0, cap)`,
`:775-778`). A sentence showing fewer than three names has no overflow clause and no reveal
button.

1. VO-navigate the sentence. The section names are buttons; the overflow clause is a button
   too, with visible text **"<n> more"** and accessible name **"Show 1 more section"** or
   **"Show <n> more sections"** (`step3ReviewSections.tsx:869-882`).
2. Activate the reveal.
3. **The focus move is the check.** Focus must land on the **first newly revealed section-name
   button**, the fourth name in the sentence. It must not stay put and must not return to
   the panel root. The pending-focus flag is set in the tap handler and consumed by the next commit's
   layout effect (`step3ReviewSections.tsx:815-826`); the ref is attached to the button at
   index 3 (`step3ReviewSections.tsx:842`).
4. VoiceOver should therefore announce that section-name button. That announcement is the
   focus move, not a log entry. The live region stays silent here.
5. Activate the revealed name button. It jumps to that section.

If no section label resolves, the sentence is the flat fallback with no buttons at all:
**"The warnings that need a look are in their own sections. Nothing else to note here."**
(`step3ReviewSections.tsx:830`). That state has nothing to reveal and nothing to focus.

### D. Silence on background refreshes

Three refresh events reach this surface without any action of yours. None may speak.

1. **Revalidate-on-open.** Opening the modal fires a `router.refresh()`
   (`components/admin/showpage/PublishedReviewModal.tsx:199`). Open the modal with VoiceOver
   already running: expect the modal's own focus announcement and nothing from
   "Warning updates".
2. **Post-action refresh.** Covered in steps A.4 and B.6. The refresh that follows an
   announced action must not produce a second utterance.
3. **Close-time reconcile.** Closing the modal fires another `router.refresh()`
   (`PublishedReviewModal.tsx:265`). Expect silence from the warnings log.

Then leave the panel open and idle for a minute with VoiceOver running, touching nothing.
Expect silence. Nothing on this surface is timer-driven: the admin bell's four commit sources
are the initial prop, a `router.refresh()` prop change, a pathname change, and an
`admin:alerts` realtime broadcast (`components/admin/nav/useBellBadge.ts:6-15`), and none of
them is a poll. So this row is expected to pass by construction. It is here as a cheap
regression net, not as a test of a mechanism that exists today; if it ever fails, something
started polling.

## Recording form

Fill this in and paste the completed copy into the `DEFERRED.md` row (or into the PR that
un-defers it). The completed form **is** the un-defer evidence the row asks for.

```
VOICEOVER-ANNOUNCER-SPOTCHECK recorded pass

Date:                        Commit:
Surface for this sheet:      published / wizard
Browser + version:           macOS version:
Show slug:                   Surface(s) run: published / wizard / both

A. Single ignore
  A1  "Ignore" button name correct                       PASS / FAIL / N/A   heard: ______
  A2  in-flight label "Ignoring…"                        PASS / FAIL / N/A
  A3  one utterance, "Warning ignored."                  PASS / FAIL / N/A   heard: ______
  A4  post-announce refresh SILENT                       PASS / FAIL / N/A
  A5  "Un-ignore" button name correct                    PASS / FAIL / N/A   heard: ______
  A6  one utterance, "Warning restored."                 PASS / FAIL / N/A   heard: ______
  A7  failure path announced NOTHING (alert only)        PASS / FAIL / N/A

B. Bulk ignore  (PUBLISHED SURFACE ONLY - score every row N/A on a wizard run)
  B1  idle name "Ignore <count>" (+ label if present)    PASS / FAIL / N/A   heard: ______
  B2  armed name "Are you sure? Ignore <count>" (+ label) PASS / FAIL / N/A  heard: ______
  B3  armed status "Tap again to confirm."               PASS / FAIL / N/A   heard: ______
  B4  expiry "Confirm window closed. Nothing was changed." PASS / FAIL / N/A heard: ______
  B5  one utterance, "<n> ignored." / "1 ignored."       PASS / FAIL / N/A   heard: ______
  B6  post-announce refresh SILENT                       PASS / FAIL / N/A
  B7  failure announced NOTHING (alert only)             PASS / FAIL / N/A
  B8  failure copy matched the KIND (partial vs none)    PASS / FAIL / N/A   read: ______

C. Pointer reveal
  C1  reveal name "Show <n> more section(s)"             PASS / FAIL / N/A   heard: ______
  C2  focus lands on FIRST revealed section-name button  PASS / FAIL / N/A   landed on: ______
  C3  live region SILENT during the reveal               PASS / FAIL / N/A
  C4  revealed name button jumps to its section          PASS / FAIL / N/A

D. Background-refresh silence
  D1  modal open (revalidate) SILENT                     PASS / FAIL / N/A
  D2  modal close (reconcile) SILENT                     PASS / FAIL / N/A
  D3  one idle minute SILENT (expected by construction)  PASS / FAIL / N/A

Anything heard that is not listed above:

Verdict:  PASS / FAIL
```

Any FAIL is a real a11y defect on a shipped surface, which makes it product-facing: file it
with the heard string, the step letter, and the browser.
