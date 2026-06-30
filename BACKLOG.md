# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

---

## INFO-tab data-fidelity audit (2026-06-29)

The seven items below were surfaced by a parser → review-modal → crew-page audit of the **AII/III - Consultants Roundtable** show (source sheet `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`). Every finding carries verified `file:line` evidence (parser re-run on `fixtures/shows/exporter-xlsx/consultants.md`). Full field-by-field table + evidence: **`docs/info-tab-fidelity-audit-2026-06-29.md`**. Suggested order: parser-only cluster first (DRESS, ROOM-DEDUP, TITLE — GS-dims was investigated and is NOT a live parse drop, folded into BL-ROOM-DETAIL-UNRENDERED as render-only) → render surfaces (Opus + impeccable v3) → review-modal completeness.

### BL-PARSER-DRESS-DROP — capture the DRESS block (parser data drop)

**Status:** open · **Severity:** high (systemic; crew never learn what to wear) · **Class:** DROPPED-BY-PARSER

`parseEventDetails` slices markdown from the `DETAILS` header (`lib/parser/blocks/event.ts:135`), but the INFO `DRESS` block sits **before** that header, so the `dress`/`attire`→`dress_code` aliases (`event.ts:97-100`) never fire; `crew.ts:34` uses `"DRESS"` only as a terminator. Verified: `parseEventDetails(...).dress_code === undefined` on both fixture families; `TodaySection.tsx:297-299,467` renders the dress card null. This is the standard exporter template layout → affects every show. **Fix (resolved in spec `docs/superpowers/specs/2026-06-29-parser-info-tab-fidelity-design.md`):** add a dedicated `parseDress` independent of the DETAILS slice that captures the full DRESS block (header value + continuation rows) into the existing `event_details.dress_code` as a **label-retaining multi-line value** (`Set/Strike: …\nShow: …`) — both values preserved with zero loss, NOT new structured fields (which would be zombie fields; the sole consumer `TodaySection.tsx:297` reads `event_details.dress_code` only). TDD: assert both labeled lines populate from a DRESS-before-DETAILS fixture; the crew dress card renders immediately (no UI change). A richer two-card split can come with the deferred UI work.

### BL-ROOM-GEAR-MERGE-DEDUP — fix lunch-room duplication (parser fidelity)

**Status:** open · **Severity:** high (real prod show renders the lunch room as two split cards, on crew + review) · **Class:** FIDELITY BUG

`mergeGearIntoRooms` (`lib/parser/index.ts:355`) matches a GEAR room to an INFO room by `(kind, name-token)`. The lunch room is INFO `breakout`/`"BALLROOM C"` vs GEAR `additional`/`"GRAND BALLROOM C"` (token normalizer `index.ts:328-336` strips `LUNCH SESSION` but not `GRAND`) → double miss → two cards (times on one, gear on the other). Verified via `parseSheet()` → 9 rooms; the lunch room is the only genuine duplicate. **Fix (resolved in spec `docs/superpowers/specs/2026-06-29-parser-info-tab-fidelity-design.md`):** align the GEAR lunch kind to `breakout` AND strip a leading `GRAND` from the GEAR lunch room NAME — both **scoped to gear.ts's `^LUNCH` branch only** — so the GEAR lunch room becomes `(breakout, "BALLROOM C")` and merges onto the INFO lunch room. The `(kind, name-token)` merge key and the shared `gearNameToken` are **preserved unchanged** (per the R8-H1 decision at `index.ts:341-348` — do NOT relax to token-only / drop `kind`, and do NOT globally strip `GRAND`, which would false-merge distinct same-kind `GRAND X`/`X` rooms). The generic `"Additional rooms"` card (`rooms.ts:158-167`) and GEAR `"FOYER"` (real gear) are **intentional and stay** — they only look empty in the Step-3 modal, which is the M2 modal-render gap (`BL-REVIEW-MODAL-COMPLETENESS`), not a parser bug. TDD: assert exactly one `BALLROOM C` room (kind `breakout`) carrying both the INFO times and the GEAR gear; plus a collision negative — a non-lunch `GRAND X`/`X` same-kind pair must NOT merge.

### BL-EVENT-DETAILS-UNRENDERED — surface the technical DETAILS specs to crew + operator (render gap)

**Status:** open · **Severity:** high (crew-impacting) · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus + impeccable v3

The parser captures all 19 `event_details` keys but the crew page renders 5 and the review modal 2 (`Step3SheetCard.tsx:380-385`). Never rendered anywhere: **Stage Size, GS Podium Type, Polling, LED, Backdrop/Scenic, Equipment Storage, Test Pattern, Fonts** (+ sentinels). No component iterates the `event_details` map. **Fix:** a crew-facing Tech-Specs card (Venue or Gear section) iterating the full map with sentinel-hiding (highest crew impact: stage size, podium, polling); extend `EventDetailsBreakdown` to render all non-sentinel keys for the operator pre-publish.

### BL-ROOM-DETAIL-UNRENDERED — deliver per-room setup/dimensions/floor/times

**Status:** open · **Severity:** medium · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus

`room.setup` ("Chevron theater for 60" / "Boardroom for 12"), `room.floor`, `room.dimensions`, and per-room set/show/strike times are parsed but read by zero components; per-room times collapse only into the show-wide `KeyTimesStrip`. **Correction (2026-06-29, spec review):** GS dimensions are NOT a parse drop on live data — the live Consultants sheet carries them **inline** in the `GENERAL SESSION\nNAME\nDIMS\nFLOOR` header cell, which `splitRoomHeader` already captures (pinned by `tests/parser/exporterFixtures.test.ts:1168-1185`; the standalone-`ROOM DIMENSIONS:`-row shape is obsolete). The earlier "parse drop" reading was an artifact of the stale `exporter-xlsx` fixture; a separate-row backfill was attempted in the parser-cluster spec and DROPPED. **Fix (this BL):** purely render — show setup + dimensions + floor + per-room times per room on crew Gear/Venue + the review modal. If a genuine live capture gap is found, design it against the inline-header shape, not the obsolete standalone row.

### BL-REVIEW-MODAL-COMPLETENESS — close the Step-3 publish-gate blind spots (review-only gap)

**Status:** open · **Severity:** medium · **Class:** REVIEW-ONLY GAP · **Routing:** UI → Opus + impeccable v3

The modal body is exactly 6 BreakdownSections + Agenda + Warnings (`Step3SheetCard.tsx:1431-1472`). It omits transportation (T1-T7), loading dock (V3), COI/Proposal/PO# (O1-O3), client contact (C2-C4), in-house AV (O5), hotel contact (O4), 17/19 event-details, crew phone, venue address, hotel address — all of which DO render on the published crew page. So the operator cannot pre-publish-verify this data. **Fix:** add operator-only review sections (Transport, Loading dock, Ops/COI/PO, Contacts, full Event details, addresses, crew phone) so the gate sees everything the crew page will show.

### BL-TITLE-EVENT-NAME-PREFERENCE — prefer the line-1 banner over the "Event Name:" cell (parser fidelity)

**Status:** open · **Severity:** medium · **Class:** FIDELITY BUG

`extractTitleFromMarkdown` priority #1 (`lib/parser/index.ts:121-133`) returns the first `"Event Name:"` cell — `"AII/III - CONSULTANTS ROUNDTABLE"` (uppercased, `2025` dropped) — before the proper line-1 banner `"AII/III - Consultants Roundtable 2025"` (priority #6). Mangled title renders on the crew header (`Header.tsx:83,98`) + review-modal link (`Step3SheetCard.tsx:10`). **Fix:** prefer the line-1 banner; fall back to `"Event Name:"` only when no banner exists. TDD: assert proper-case + year preserved for the consultants fixture.

### BL-CREW-PARTIAL-ATTENDANCE-CHIP — show who is partial-attendance to teammates (render gap)

**Status:** open · **Severity:** low–medium (coordination gap) · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus

`(10/7 ONLY)` / `(10/7 and 10/9 ONLY)` are stripped from names into `date_restriction` (`personalization.ts:118-126`) and drive the viewer's own schedule, but no roster surface shows a badge — `CrewSection.tsx:175-183` (crew) and `CrewBreakdown` (`Step3SheetCard.tsx:194-199`) render name+role only. **Fix:** render a small "Oct 7 & 9 only" chip from `date_restriction.days` next to the role on both the crew roster and the review modal.

---

## BL-FINALIZE-APPROVAL-DECISION-RACE — re-read the full finalize decision row under the per-show lock

**Status:** ✅ RESOLVED — PR #188 (2026-06-29) · **Severity:** medium (pre-existing; narrow window; recoverable) · **Surfaced:** agenda-PDF-schedule whole-diff review R8 (2026-06-29)

**Resolution:** Shipped per the recommended fix below. The generation-scoped locked re-read was widened from `parse_result`-only to the full decision row (kept in place after the Drive fence), the version gate moved to after `coercedRow`, every checked/unchecked branch re-pointed to the locked `coercedRow.*`, and a finishable re-validation skip added (forward-defense). Spec: `docs/superpowers/specs/2026-06-29-finalize-approval-decision-race-design.md`; plan: `docs/superpowers/plans/2026-06-29-finalize-approval-decision-race.md`; tests: `tests/onboarding/finalizeApprovalRace.test.ts`. Client defense-in-depth (recommended-fix item 3 below) was intentionally NOT shipped — the server-side locked re-read fully closes the race.

**Problem.** `finalize` reads `wizard_approved` (and approval provenance, reviewer choices, failure code, manifest status) at _select_ time in `selectFinishableCleanRows`, BEFORE taking the per-show row lock. The approve/unapprove routes serialize on the **same** `show:` advisory lock. So a concurrent approve/unapprove that commits _after_ finalize's select but _before_ finalize acquires that row's lock makes finalize act on the **stale** select-time `wizard_approved`: a row the operator just unchecked can publish, or a row just checked can be Held. The operator's final checkbox intent is then not what ships.

**Pre-existing.** Verified at merge-base `0481c9dc` (before the agenda feature): finalize always used the select-time `wizard_approved` with no locked re-read. The agenda feature added ONLY a generation-scoped `parse_result` re-read under that lock (for agenda publish-safety); it did **not** introduce or worsen this race. The approve route updates `wizard_approved` **without** bumping `staged_modified_time`, so the agenda feature's generation-scoped re-read does not catch it.

**Why deferred (not fixed in the agenda PR).** Fixing it correctly means extending the locked re-read to the FULL decision row and re-driving finalize's 4-branch checked/unchecked/Held/failure split from the locked values — a substantial change to the intricate finalize state machine (the `finishable` predicate `wizard_approved = true OR last_finalize_failure_code is null`, the failure-code lifecycle, manifest `publish_intent`). A naive "demote on `wizard_approved` change" interacts badly with that predicate (a demoted unchecked-clean row may not be re-selected on the next finalize). This is finalize-core concurrency work, orthogonal to agenda extraction, and belongs in a focused finalize PR — not bolted onto a feature PR where it expands blast radius on the publish path.

**Recommended fix (for the focused PR).**

1. Inside the per-show locked tx, generation-re-read the full finalize decision row — `wizard_approved`, `wizard_approved_by_email`/`wizard_approved_at`, `wizard_reviewer_choices`, `last_finalize_failure_code`, manifest `publish_intent`/status — not only `parse_result`.
2. Drive ALL checked/unchecked/Held/failure branching from that locked re-read; re-validate the `finishable` predicate against the locked values; route a row that no longer matches to a typed per-row skip/retry (NOT a publish/Held on stale intent), with careful handling of the failure-code lifecycle so a re-finalize re-selects it correctly.
3. Defense in depth (client): disable/serialize the Step-3 "Finish" action while approval-checkbox writes are in flight.
4. Regression: commit an approve/unapprove AFTER `selectFinishableCleanRows` but BEFORE `processApprovedRow` takes the show lock; assert finalize honors the latest intent (publishes the checked, Holds the unchecked).

**Reference:** `app/api/admin/onboarding/finalize/route.ts` (`selectFinishableCleanRows` ~:346, `processApprovedRow` ~:710 incl. the agenda re-read ~:729); approve `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts:125`.
