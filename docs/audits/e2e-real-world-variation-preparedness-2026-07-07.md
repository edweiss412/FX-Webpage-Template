# End-to-End Preparedness Audit — Real-World Show-Bible Variation — 2026-07-07

**Question:** the fxav-test-shows corpus is a representative sample, not a spec. Treating every structural choice in it as one point in a distribution: how prepared is the full system — ingestion (Drive export → parser → sync/apply), the admin + crew UX, and above all the **seam** between them — for the neighboring variations a real production coordinator would plausibly produce? Could a non-technical Doug drive the core flows today, and does the UX tell him when something went wrong?

**Method:** five parallel investigations at working-tree HEAD `dea2d9adc` (branch `fix/hotels-single-card-flatten`; its uncommitted `step3ReviewSections.tsx` change is a cosmetic hotel-card flatten, irrelevant to findings):

1. Re-verification of all 17 findings + Tier-4 bullets of `edge-case-preparedness-audit-2026-07-04.md` against current code (1,119 commits landed since).
2. Admin UX flow audit (onboarding, review wizard, correction loop, live re-sync, publish/share, breakage noticing, error copy).
3. Crew-page degraded-data render audit (all sections + picker + RightNow).
4. Seam audit: full signal-routing matrix (every parser/sync signal class → persistence → admin surface → push vs pull).
5. Live-sheet variation probe: all 7 real shows' INFO tabs read via gsheets MCP (not the lossy fixtures), variance dimensions cataloged, unseen neighbors extrapolated, fixture drift spot-checked.

Detailed agent outputs are summarized here; file:line citations were verified by the investigating agents against the working tree.

---

## 1. Confidence rating

**6.5 / 10** — on a scale where 10 = "hand Doug the URL and walk away" and 5 = "works if a developer checks in weekly."

Why not lower: the 2026-07-04 audit's Tier-1 ingestion findings are now substantially **fixed** (see §2) — version misclassification stages instead of guessing, material shrinkage holds last-good, stage restrictions use a real grammar, dims/address/date formats widened, the mutation harness manufactures the missing corpus. Hard failures are loud, error copy is genuinely excellent (A−, zero raw-code leaks), and the crew surface never renders a sentinel or a confident wrong *state*.

Why not higher: the seam. The system verifies **presence of known errors, not fidelity to the sheet**. A parse that is plausible-but-wrong (mis-split room, glued hotel guests, mis-read date, wrong per-crew days, wrong autocorrect canonical) emits no signal, renders green in the review wizard, and displays as authoritative to a crew member on-site. And every alert is in-app only — email delivery is config-blocked (Resend unset), so a Doug who isn't looking at `/admin` learns nothing, ever.

---

## 2. Delta since the 2026-07-04 audit (what's already fixed)

| Prior finding | Status | Evidence |
|---|---|---|
| #1 v1 catch-all classification | **FIXED** | `lib/parser/schema.ts:177-197` `classifyVersion` → confident/ambiguous/not_a_sheet; ambiguous → `VERSION_AMBIGUOUS` hardError → staged, never applied (`lib/parser/index.ts:569-580`, `invariants.ts:127-129`) |
| #2 single-literal version markers | **FIXED** | ≥2 markers across ≥2 independent blocks (`schema.ts:88-101`) |
| #3 re-sync shrinkage auto-clobber | **FIXED (material shrink)** | `phase1.ts:411-455` `shrink_held` retains last-good + admin re-confirm with counts. **Residual P0 below: single-crew drop bypasses.** |
| #5 short-header typo intolerance | **PARTIALLY-FIXED** | CREW/TECH + TRANSPORTATION now Damerau-gated (`sectionHeaderNormalize.ts:16,25`); HOTEL/VENUE/DATES still excluded by design — "HOTLE" still vanishes |
| #6 hardcoded venue room names | **FIXED** | shape-based header recognition, MABEL/LAUDERDALE literals gone (`rooms.ts`) |
| #7 3-phrase stage restrictions | **FIXED** | `parseStageClause` token grammar, any subset/reorder of 5 stages + typo-tolerant (`personalization.ts:162-195`) |
| #8 dates M/D/YYYY-only | **FIXED** | ISO/dash/long-form MDY+DMY (`lib/parser/blocks/_helpers.ts:127-190`; PR #354) |
| #9 US-only addresses | **FIXED (North America)** | Crescent/Commons/Mews/etc. + Canadian postal (`hotels.ts:258,265`); non-NA still unsupported |
| #11 dims regex | **FIXED** | shared `_dimsToken.ts` at all 7 sites: bare `50 x 40`, `50ft`, `50′×40′` |
| #15 UNEXPECTED_PARENT silent | **FIXED** | wired in both prod callers (`runOnboardingScan.ts:1094`, `runScheduledCronSync.ts:3564`) |
| #17 unguarded parseSheet call | **FIXED** | try/catch → fail-closed last-good + `PARSE_SHEET_THREW` (`runScheduledCronSync.ts:2865-2884`) |
| MI-1 e2e untested; hand-pinned registry | **FIXED** | `parseSheet.test.ts:296-320`; `_metaKnownSectionsWalker.test.ts` (PR #351) |
| Zero corruption testing | **PARTIALLY-FIXED** | `tests/parser/mutation/` harness (PR #338): column-shift, blank-row, #REF!, unicode. Property fuzz (`fast-check`) still absent |
| Still valid, unchanged | — | #4 non-roster section silent drop (`index.ts:713`); #10 blank-row segmentation; #12 `\bOLD\b` tab skip; #13 closed-vocab mis-correction; #14 first-seen hard-fail no alert (`runOnboardingScan.ts:856-878`); #16 dataGaps never push |

The system moved fast; the residual risk profile is different in kind — less "the parser will mangle a new shape," more "nobody is told when it does."

---

## 3. Doug's core flows, graded

Grades are for a **non-technical** operator, unaided.

| # | Flow | Grade | One-line verdict |
|---|---|---|---|
| 1 | Add a new show (Drive drop → scan → wizard) | **B** | Discoverable front door, plain-language blockers, Retry/Defer/Ignore on hard-fails. Friction: empty-folder/first-run experience is mute ("Found 0 items" hidden in a hover popover, `Step2Verify.tsx:168-181`). |
| 2 | Review parsed output before publish | **C+** | Excellent at flagging what the parser *knows* went wrong (42-class gap taxonomy, per-section flag chrome + jump-to-warning, `step3ReviewSections.tsx:462-520`). But plausible-but-wrong values render as-if-correct with zero confidence signal; `raw_unrecognized[]` is visible only on `/admin/dev`. "N ready to publish" implies verified; readiness = absence-of-known-warning only (`Step3Review.tsx:841-886`). |
| 3 | Correct a bad parse | **C** | No in-app value editing anywhere — the only loop is edit-sheet → "Re-sync from Drive" (`ReSyncButton.tsx:143`). The loop IS documented (`app/help/admin/parse-warnings/page.mdx:19-20`) and last-good stays live. Holds are opaque: only email changes create one, Doug can approve/reject but not create (`writeMi11Holds.ts:63-67`). |
| 4 | Re-sync that changed data on a LIVE show | **C−** | Material shrink gates beautifully (shrink_held + explicit confirm, `phase1.ts:92-120`, `ReSyncButton.tsx:155-190`). But a **single** crew-member removal bypasses the gate entirely — see P0 #1 below. |
| 5 | Publish + share crew links | **B** | Single link + picker (M11.5) is understandable; rotate has a real two-tap confirm. Under-disclosure: the confirm warns the URL breaks but not that `picker_epoch` bumps and every crew member must re-pick identity (`RotateShareTokenButton.tsx:296-298` vs `:7-10`); no re-notify path for already-texted links. |
| 6 | Notice something broke | **C+** | In-app push infra is genuinely good — NotifBell (realtime), AppHealthIndicator, needs-attention badge on every admin page. But **all of it is in-app only**: email delivery config-blocked (`lib/notify/config.ts:7`, Resend unset). Parse-quality warnings are pull-only per-show; geocode failure is fully silent (`enrichVenueGeocode.ts:99-100`). |
| 7 | Understand error copy | **A−** | 8/10 sampled Doug-likely codes are action-first, sheet-vs-app located, jargon-free; zero raw-code leaks anywhere (rendering discipline airtight). Soft spots: "sync-suppression rule" (`catalog.ts:1791`), the parse-panel→MI-N indirection, `DRIVE_METADATA_MISSING` gives Doug no move (`catalog.ts:2523`). |
| 8 | Crew member self-serves their page (picker → sections) | **B+** | Sentinel/empty → graceful hide everywhere (meta-test enforced); `unknown_asterisk` → fail-closed "days not confirmed yet," zero date leak (`ScheduleSection.tsx:869-880`); roster-shrink while holding cookie → re-pick banner, never a stale page (`resolvePickerSelection.ts:105`). Residual: wrong-but-plausible values render authoritative; picker renders roster names raw. |

Flows the brief missed, now enumerated: #6 (monitoring), #7 (copy comprehension), #8 (crew self-serve). Also implicitly covered: approve/reject holds (inside #3/#4) and archive (not separately audited; no findings surfaced).

---

## 4. The seam: signal-routing matrix (condensed)

Full matrix in the seam investigation; the shape that matters:

| Signal class | Terminus | Push? | Doug sees it? |
|---|---|---|---|
| `warn` data-gap codes (42 classes) | `shows_internal.parse_warnings` → dashboard chip, wizard flags, per-show panel | Pull (push only via thresholded regression gate) | Only if he opens the right page |
| Autocorrect codes (`*_AUTOCORRECTED`) | per-show panel + wizard — **excluded from dashboard chip and regression gate** | Pull only | No on the auto-apply cron path |
| `info`-severity warnings | persisted, filtered out by **every** surface (`dataGaps.ts:95`, `phase1.ts:189`) | — | **Never (dark)** |
| `raw_unrecognized[]` | `/admin/dev` page only | — | **Never in practice** |
| `HOTELS_PARSE_WARNING`, agenda-enrich codes | `app_events` telemetry only (`hotels.ts:40`, `enrichAgenda.ts`) | — | **Never (log-only)** |
| MI-1..5b hard fails (existing show) | red sync-status pill + `PARSE_ERROR_LAST_GOOD` alert | Push (in-app) | Yes, if in app |
| MI-1..5b hard fails (**first-seen**) | onboarding manifest only, **no alert** (`runOnboardingScan.ts:856-878`) | — | Only if he opens the wizard |
| MI-6..14 staged items | pending_syncs → needs-attention + wizard | Push (in-app) | Yes |
| Quality regression (≥+5 AND ≥+50%) | `admin_alerts` → bell | Push (in-app) | Yes, when threshold met |
| Structural mis-parse (rooms mis-split, hotel glue, wrong value) | **no signal exists** | — | **No — renders green** |

Four emitted-but-dark classes, plus the no-signal-at-all class. The wizard's flagged/clean distinction is exactly as good as the emitted warnings — sections with no warning are visually identical to correct ones, and there is no per-field confidence anywhere.

---

## 5. Top failure modes eroding confidence (ranked)

### P0-1 — Single crew-member removal on a live show applies silently
MI-6 fires only when `crewDrop > 1` (`lib/parser/invariants.ts:39-40`), so the exact "Doug deleted/moved one row mid-edit" case auto-applies to the **published** page. The vanished member leaves only an undoable changes-feed row (`phase2.ts:389`); it never appears in needs-attention (`needs-attention/page.tsx:46-48`), and it is not a data gap, so no DataQualityBadge (`blockDisappearance.ts:59-86` is section-level). A crew member loses their page (or their pick) and Doug has no unaided path to learn why. **Blast radius:** one crew member per incident, on a live show, silent. *(Crew-side saving grace: the removed member holding a cookie gets a correct re-pick banner, not a stale page.)*

### P0-2 — Confident wrong values render as authoritative, end to end
The class, not one bug: parses that succeed with **no warning** — mis-split room name/dims (`rooms.ts` emits only `emitEmptySection`), glued hotel guests (`hotels.ts:129-151` glue-as-safe-fallback), a mis-read but date-shaped date, a wrong-but-`explicit` per-crew `date_restriction`. Zero signal → clean wizard card → crew page renders it as fact. Worst instance: a crew member's Schedule filtered to the wrong days with RightNow saying "you're off today" — believed on-site (`rightNow.ts:242-343`). The `unknown_asterisk` fail-closed valve only fires when the parser *knows* it doesn't know.

### P1-3 — Everything is in-app; passive Doug is blind
Email delivery is config-blocked (Resend unset, `lib/notify/config.ts:7`). Bell/health/needs-attention are on every admin page and realtime — but only while a page is open. Any failure mode above, plus every legitimate push alert, reaches nobody until Doug happens to log in.

### P1-4 — Sub-threshold degradation accumulates without push
`isQualityRegression` requires +5 absolute AND +50% growth per class (`dataGaps.ts:109-117`): a published show can drift 3→7 unreadable fields per sync, auto-applying every time, chip count silently climbing. Autocorrect codes are excluded from both the chip and the gate — ten wrong canonicalizations = badge total 0. Ignore controls make a suppressed-but-wrong field read clean.

### P1-5 — Section-vocabulary variance still has silent exits
Live-sheet probe confirms coordinators rename/invent headers constantly (`TECH` vs `CREW`, `Hotal Contact Info` sic, `DIagrams` sic, `Venue Contact Info` relabel). Current state: recognized-shape unknown headers warn (good); but a non-roster section (SHIPPING/SECURITY note block) drops with zero signal (`index.ts:713`), HOTEL/VENUE/DATES typos are excluded from typo-correction by design ("HOTLE" vanishes; `sectionHeaderNormalize.ts:16`), a header colliding with a `KNOWN_SUB_LABELS` entry is inferred benign (`knownSections.ts:99`), and any tab named with the word "OLD" is skipped (`exportSheetToMarkdown.ts:323`). Highest-plausibility unseen variants from the live probe: renames like `STAFF`/`LODGING`/`LOCATION`, new sections `SHIPPING`/`CATERING`/`CREDENTIALS`, `SHOW DAY 4`/`REHEARSAL` day labels, non-North-American addresses.

---

## 6. Per-flow action plans to reach A−

Each plan lists only what moves the grade; items are ordered by grade-leverage within the flow. Effort: **config** (env/copy only), **S** (< 1 day), **M** (1–3 days), **L** (multi-day/structural). New admin-visible codes follow the §12.4 three-way-lockstep + telemetry invariants (AGENTS.md rules 5/10) — not restated per item.

### Flow 1 — Add a new show (B → A−)

| # | Action | Effort | Evidence anchor |
|---|---|---|---|
| 1.1 | Promote "Found 0 items" from hover popover to a first-class empty state with a "Add a sheet to the folder, then Rescan" CTA and the watched-folder link inline. | S | `Step2Verify.tsx:168-181,528-552` |
| 1.2 | First-run guidance in Step 1: short "create a folder → drop your show sheets → paste the folder URL" walkthrough (reuse help-page copy), plus a "no folder yet?" branch. | S | `Step1Share` |
| 1.3 | Raise an admin alert on **first-seen hard-fail** (currently manifest-only, invisible outside the wizard). New pushed code, audience "doug", copy naming the sheet + the MI reason in plain language. | S | `runOnboardingScan.ts:856-878`; `runScheduledCronSync.ts:3220` guard `if (show?.showId)` |

Done-when: a Doug with an empty folder or a garbage sheet gets an explicit next step without opening a popover or the wizard.

### Flow 2 — Review parsed output before publish (C+ → A−)

| # | Action | Effort | Evidence anchor |
|---|---|---|---|
| 2.1 | **Warn on silent transforms** (REVISED 2026-07-07 — original "raw-snippet side-by-side" retired after investigation; see findings below). The raw-pane idea does not survive the parser's actual architecture: it stores identity fields **verbatim** and already **warns** on every transform it makes, and where it does silently transform (rooms/hotels/dates) the existing per-section "In sheet ↗" deep-link already exposes source. The real P0-2 gap is **no signal prompting Doug to look**, not "can't see source." Fix: emit warnings on ambiguous/low-confidence transforms, riding the existing warn→panel→deep-link machinery. **First step (this item):** warn when `detectColumns` falls back to positional column defaults (silent crew column mis-map). | S | `lib/parser/blocks/crew.ts:78-110`; `lib/parser/warnings.ts` |
| 2.2 | Surface `raw_unrecognized[]` in the wizard as a "Content we couldn't read" callout (count + expandable raw rows), not just `/admin/dev`. | S | `lib/parser/index.ts:524`; `app/admin/dev/page.tsx` |
| 2.3 | Route warnings with null/unmapped `blockRef.kind` to their best-guess section instead of the generic bucket, so the flag appears where Doug is looking. | S | `step3SectionStatus.ts:68-88` |
| 2.4 | Honest readiness copy: replace "N ready to publish" framing with "N with no known issues — spot-check the highlighted sections against your sheet." Distinguish "no crew found in the sheet" vs "we couldn't read the crew section" (empty-vs-unreadable is knowable from warnings). | S | `Step3Review.tsx:841-886`; `step3ReviewSections.tsx:1125-1126` |

Done-when: a plausible-but-wrong parse is detectable by glancing at the pane pair, and everything the parser *captured but didn't understand* is visible in the wizard.

#### 2.1 investigation findings (2026-07-07)

Brainstorming 2.1 pressure-tested the "raw side-by-side" premise against the live parser and it collapsed. Recorded so the class isn't re-litigated:

- **Value-drift is already closed for identity fields.** Crew `role` is stored **verbatim** (`cleanedRole` = raw cell minus a stripped day-clause, `crew.ts:308,386`); `name`/`email`/`phone` likewise near-verbatim. Every interpretation the parser makes (stage-word / role-token autocorrect, restriction extraction) **emits a warning** with before→after (`STAGE_WORD_AUTOCORRECTED` etc., `catalog.ts:1206-1263`). For these fields there is no silent drift to reveal — source next to parsed is the same string twice.
- **Transform-heavy blocks (rooms/hotels/dates) DO silently transform** — regex name/dims split (`rooms.ts`), guest glue-and-split (`hotels.ts:129-151`), date parsing — with no warning on an ambiguous/wrong split. Here parsed ≠ source, so a source view *is* informative. **But** the existing per-section "In sheet ↗" deep-link (`step3ReviewSections.tsx:547-599`) already exposes that source, and for the *coverage* sub-class (dropped/mis-segmented rows) the live sheet strictly beats any captured copy. So the residual gap is a **signal to look**, not access to source.
- **A captured in-app snapshot is strictly worse than the deep-link for coverage** (lossy, capped, sanitized copy vs complete live sheet) and re-adds a Drive dependency the `persist-source-anchors` work deliberately removed.
- **Genuinely uncovered, silent, structural:** `detectColumns` defaults to positional columns (name=1/role=2/phone=3) with **no warning** when the crew header is missing/unrecognized (`crew.ts:81-84`) → every value verbatim but in the wrong field. Low-frequency (standardized-template sheets) but zero-signal. This is item 2.1's concrete deliverable.

Net: replace the raw-pane build with targeted **ambiguous-transform warnings** on the existing machinery. Column-fallback is the first; room-split / hotel-glue / ambiguous-date confidence warnings are the natural follow-ons (BACKLOG).

### Flow 3 — Correct a bad parse (C → A−)

| # | Action | Effort | Evidence anchor |
|---|---|---|---|
| 3.1 | **Make the sheet-edit loop first-class.** On every reviewed/flagged field that has a source anchor, render "Fix in sheet" deep-linking to the exact cell (anchor infra exists), plus inline one-line loop copy ("edit → save → Re-sync from Drive re-parses") and a Re-sync button in the same view. | S–M | `lib/drive/sourceAnchors.ts:205-211`; `ReSyncButton.tsx:143`; loop copy exists at `app/help/admin/parse-warnings/page.mdx:19-20` |
| 3.2 | **Admin override layer for a narrow field set** (show dates, crew name/role, hotel name/address, venue): an `admin_overrides` table applied AFTER `applyParseResult`, surviving full-replace re-syncs, with a visible "overridden — sheet says X" chip and one-click revert. This also closes seam scenario I (re-sync clobbering corrections). | L | `applyParseResult.ts:132-135` unconditional replace |
| 3.3 | Explain holds where they appear: one sentence ("We held this change for your approval because …") + approve/reject consequences, in the changes feed row. | S | `writeMi11Holds.ts:63-67` |

Done-when: Doug can fix a wrong value either in-app (narrow set) or via a deep link to the exact cell, and his fix survives the next sync. 3.1 + 3.3 alone reach B+; A− requires 3.2.

### Flow 4 — Re-sync that changed data on a live show (C− → A−)

| # | Action | Effort | Evidence anchor |
|---|---|---|---|
| 4.1 | **Gate single-crew drops on published shows**: `crewDrop >= 1` (published) routes through the existing `shrink_held` confirm path. One-line class fix; the UX already exists. Kills P0-1. | S | `invariants.ts:39-40`; `phase1.ts:92-120` |
| 4.2 | Auto-applied changes digest: needs-attention gains a "Recently auto-applied" strip (crew add/rename, field changes) with per-row undo — the changes-feed rows already exist and are undoable, they're just not surfaced anywhere Doug looks. | M | `phase2.ts:389` `writeAutoApplyChanges`; `needs-attention/page.tsx:46-48` |
| 4.3 | Count crew-membership changes as a data-gap-adjacent badge input so a roster that shifted since publish shows amber until Doug glances at it. | S | `DataQualityBadge.tsx:16-20`; `blockDisappearance.ts:59-86` |

Done-when: no mutation of a published show's roster is invisible; material shrink confirms, small drift is surfaced.

### Flow 5 — Publish + share crew links (B → A−)

| # | Action | Effort | Evidence anchor |
|---|---|---|---|
| 5.1 | Complete the rotate warning: add "every crew member will need to re-pick their name on the new link" to the confirm copy (the epoch bump is documented in the component's own comment but not disclosed). | config/S | `RotateShareTokenButton.tsx:296-298` vs `:7-10` |
| 5.2 | Post-rotate handoff: success state immediately presents the NEW link with copy button + "re-send this to your crew" nudge (optionally a prefilled SMS/email `mailto:`/share-sheet using roster contacts already parsed). | S–M | `RotateShareTokenButton.tsx:220`; `CurrentShareLinkPanel.tsx` |

Done-when: rotation never surprises Doug about identity resets, and re-distribution is one tap, not a manual hunt.

### Flow 6 — Notice something broke (C+ → A−)

| # | Action | Effort | Evidence anchor |
|---|---|---|---|
| 6.1 | **Set the Resend key + recipient.** Delivery infra is built and recipient-safe; this converts every existing push alert to email. Highest leverage in the audit. | config | `lib/notify/config.ts:7` |
| 6.2 | Daily/weekly digest email for the pull-only band: new data gaps since last digest, autocorrects applied, auto-applied roster changes, sub-threshold drift. (Digest formatting groundwork exists in the data-gap summary utilities.) | M | `dataGaps.ts:95`; `summarizeDataGaps` |
| 6.3 | Include `*_AUTOCORRECTED` codes in the dashboard chip (or a sibling "auto-fixed" count) and make the regression gate OR-based (+5 absolute OR +50%) for published shows. | S | `dataGaps.ts:109-117,199-207` |
| 6.4 | Wire geocode failure to a warn-level, badge-visible signal instead of silent breaker-open fallback. | S | `enrichVenueGeocode.ts:99-100` |

Done-when: a Doug who never opens the app still learns about failures and drift within a day.

### Flow 7 — Error copy (A− — hold the grade)

Already at target. Optional polish, in order: replace "sync-suppression rule" with plain language + say WHICH condition blocks publish (`catalog.ts:1791`); stop pointing Doug at "the MI-N code" — name the problem in the alert itself (`catalog.ts:143,149`); give `DRIVE_METADATA_MISSING` either a next action ("we'll retry automatically") or a null dougFacing (`catalog.ts:2523`). All S.

### Flow 8 — Crew self-serve (B+ → A−)

| # | Action | Effort | Evidence anchor |
|---|---|---|---|
| 8.1 | Picker hardening: sentinel-guard roster names, collapse exact duplicates, and add a persistent "Don't see your name? Contact <admin contact>" affordance (covers missing-from-roster + typo'd-name cases without exposing parse internals). | S | `_PickerInterstitial.tsx:134-217` |
| 8.2 | Fail closed in `resolveViewerContext` when a crew viewer's id has no matching row in a well-formed array (currently falls open to `{kind:'none'}` restrictions = whole-show visibility). Return the same re-pick path the resolver uses. | S | `viewerContext.ts:125-141`; `resolvePickerSelection.ts:105` |
| 8.3 | Timezone: populate `venue.timezone` at enrich time (geocode already runs; tz lookup from coordinates) with the ET default emitting an admin-visible warning when used on a published show. | M | `rightNow.ts:202`; `showTimezone.ts:10-17`; `enrichVenueGeocode.ts` |
| 8.4 | Transport visibility: match assigned crew by crew-member id (or normalized/fuzzy name) instead of exact `viewerName` string, so a name mis-parse can't hide a driver's own itinerary. | S–M | `TravelSection.tsx:172-177`; `lib/visibility/scopeTiles.ts` |

Done-when: every "can't find myself / can't see my stuff" path lands on a guided affordance, and no fail-open remains.

### Cross-flow note

The P0-2 class (confident wrong values) is not fully closable by any per-flow item — 2.1 (**warn on silent transforms** — revised from side-by-side, see the 2.1 findings) is the detection layer, 3.2 (overrides) the correction layer, 6.2 (digest) the monitoring layer. Together they bound the class; a per-field provenance/confidence model (§7 item 5) is the eventual structural fix. Note the detection layer is *signal*, not *source access* — the deep-link already gives source access; what P0-2 lacks is a prompt to look.

---

## 7. Cheapest changes that most raise confidence

1. **Zero code: set the Resend key + recipient.** The entire in-app alert infrastructure is built and recipient-safe; delivery is one env var away. Converts every existing push signal from "if Doug is looking" to "Doug's inbox." Biggest confidence-per-effort ratio in the audit.
2. **One-line class fix: gate single-crew drops on published shows.** Change the MI-6 threshold (`invariants.ts:39-40`) to `crewDrop >= 1` when the show is published (or route 1-drops through the existing shrink_held path). The shrink-held UX already exists; this just widens what feeds it. Kills P0-1 outright.
3. **Small: surface the last-good vs new diff in the re-sync/review UI.** The seam's structural answer isn't more parser warnings (P0-2 parses emit none by definition) — it's showing Doug *what changed against the sheet snippet* (raw-snippet side-by-side per section, data already captured in `rawSnippet.ts`). Turns "proofread everything" into "glance at what moved."
4. **Small: include autocorrect codes in the dashboard chip** (add to `GAP_CLASSES` or a sibling count) and lower/AND→OR the regression gate for published shows.
5. **Medium (structural, from prior audit, still the right long-term move):** property-based fuzz over the exporter+parser (mutation harness exists; `fast-check` layer still absent) and a per-field provenance/confidence model so the wizard can render uncertainty instead of binary flagged/clean.

---

## 8. What is genuinely strong (do not relitigate)

- Version-ambiguity now stages instead of guessing; material shrink holds last-good; stage-clause grammar; widened date/dims/address matchers; shape-based room headers — the July-4 Tier-1 list is closed.
- Error-copy discipline: zero raw codes on any surface, action-first copy, catalog-driven audiences.
- Crew-surface defensive posture: meta-test-enforced sentinel hiding, fail-closed `unknown_asterisk`, fail-closed malformed projection, re-pick banner on roster shrink, neutral (never confidently wrong) RightNow states.
- Structural meta-tests as a class-closing habit (known-sections walker, sentinel-hiding walker, mutation harness with applicability audit + negative controls).
- Fixture fidelity: spot-check of 2 shows vs live sheets found no material drift (typos, sentinels, orderings all preserved). Residual check worth doing: FinTech's zero-width characters surviving the fixture round-trip.

---

## 9. Sources

Five investigations 2026-07-07 (prior-finding delta verification; admin UX flows 1–7; crew degraded-data render; seam signal-routing; live-sheet variation probe via gsheets MCP over all 7 real shows). Prior art: `edge-case-preparedness-audit-2026-07-04.md`, `sheet-data-grounding-audit-2026-06-18.md`. Working tree at `dea2d9adc` + cosmetic `step3ReviewSections.tsx` edit.
