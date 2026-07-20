# Spec B input — per-show alert codes needing `dougFacingShowScoped`

**Received:** 2026-07-20, from the attention-alert routing session
**Status:** INPUT, not ratified copy. Do not author from this table without resolving the two coupling questions below.
**Depends on:** the mechanism shipped in this branch — `dougFacingShowScoped` (`lib/messages/catalog.ts:47`), selected at `lib/admin/attentionItems.ts:145` via `entry.dougFacingShowScoped ?? entry.dougFacing`. Both citations verified against this branch. No new mechanism is needed; these are authoring rows.

## Why this is spec B, not spec A

Spec A adopted the 3 templates whose `dougFacing` opens with the LITERAL prefix `In <sheet-name>, ` / `In <show-name>, `, and explicitly deferred the rest: *"Templates carrying `<show-name>` mid-sentence are untouched, grammatical either way, and rewriting them is spec B"* (design §3.3).

The 13 codes below carry the name mid-sentence or as the sentence subject. Verified: **none of them trips spec A's defense 1** (`tests/messages/_metaShowScopedTemplates.test.ts`), because that scan matches the literal opening prefix only.

**That is a real gap, and spec B must close it.** Nothing currently forces these 13 to be authored, so they can be forgotten silently. Spec B needs its own fails-by-default rule — something like "every code reachable in the published-show review modal declares a variant or carries an exemption with a reason" — keyed on reachability rather than on the prefix shape. Without it, spec B's coverage is a checklist, not a gate.

## Scope claim (from the sender, not re-verified here)

These are the codes that can reach the published-show review modal: raised per-show (`showId` non-null) and not health-audience. Verified against raise sites, not routing-table membership.

Explicitly NOT in the list (carry `showId: null`, or are not alerts): `ONBOARDING_SHEET_UNREADABLE`, `WATCH_CHANNEL_ORPHANED`, `SYNC_STALLED`, `LIVE_ROW_CONFLICT`, `DRIVE_FETCH_FAILED`.

Raise sites offered as evidence: `runScheduledCronSync.ts:2364` (row 1), `20260701000000_published_toggle_unpublish_show.sql:16` (row 2), `runScheduledCronSync.ts:3387` (row 3), `runManualSyncForShow.ts:186` (row 4), `runScheduledCronSync.ts:3421` (row 5), `runScheduledCronSync.ts:376` (row 6), `lib/sync/applyStaged.ts:112-116` verify family (rows 9-12), `lib/sync/assetRecovery.ts:31` (row 7). **Re-verify these at authoring time** — spec A's live-code citation rule applies to inputs too.

## The rows (DRAFT copy)

| #   | Code                                 | Proposed `dougFacingShowScoped`                                                                                                                                                                                                          |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `SHOW_FIRST_PUBLISHED`               | Now live for crew at its share-token URL: `<crew-count>` crew, `<show-date>`. Flip Published off if this was a mistake; crew can't open it again until you do.                                                                            |
| 2   | `SHOW_UNPUBLISHED`                   | Unpublished. Crew who open the link see a 'not available right now' page. Turn Published back on when you're ready.                                                                                                                       |
| 3   | `PARSE_ERROR_LAST_GOOD`              | The latest edit didn't parse, so the previous approved version is still showing to crew. **Coupling B.**                                                                                                                                  |
| 4   | `SHEET_UNAVAILABLE`                  | This sheet isn't in your folder anymore: you may have moved or unshared it, or it was deleted. Re-share it to bring the show back.                                                                                                        |
| 5   | `RESYNC_SHRINK_HELD`                 | The latest version dropped crew or a whole section, so the update was held and the last good version is still live. If the change is intentional, re-sync to apply it; otherwise fix the sheet.                                           |
| 6   | `RESYNC_QUALITY_REGRESSED`           | The latest edit lost some data quality: one or more fields or sections that used to read no longer do. The update is already live; fix the sheet to restore them. **Coupling B.**                                                         |
| 7   | `ASSET_RECOVERY_BYTES_EXCEEDED`      | The diagram set is too large to recover automatically (more than 60 images, an image over 50MB, or over 3GB total), so crew see placeholders for the missing diagrams. Trim the gallery, or tell the developer if you need the ceiling raised. |
| 8   | `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` | A diagram can't be re-downloaded automatically. Save the sheet (any edit advances the version) and crew will see the image again on the next sync.                                                                                        |
| 9   | `EMBEDDED_ASSET_DRIFTED`             | An embedded diagram changed after staging, so crew see a placeholder for that image. A new sheet edit re-stages it.                                                                                                                       |
| 10  | `OPENING_REEL_PERMISSION_DENIED`     | The opening-reel video is no longer shared with FXAV, so crew see the text status only. Re-share the video file, or replace the link, to restore inline playback.                                                                         |
| 11  | `OPENING_REEL_NOT_VIDEO`             | The opening-reel link is not a video file, so crew see the text status only. Replace the link with a video file URL to enable inline playback.                                                                                            |
| 12  | `REEL_DRIFTED`                       | The opening-reel video has been edited since you reviewed this parse, so crew see the text status only. Your next sheet edit re-stages the new reel.                                                                                      |
| 13  | `PICKER_EPOCH_RESET`                 | Probably no row needed. **Coupling A.**                                                                                                                                                                                                  |

## Blocking coupling questions

**A. `PICKER_EPOCH_RESET` may be deleted entirely.** The routing session proposes cutting the alert: `PickerResetControl.tsx:186` already renders a visible success banner with a live region and 5s auto-dismiss, and `resetPickerEpoch.ts:47` already writes a durable `PICKER_EPOCH_RESET_BY_ADMIN` audit record, making the alert a third copy of one event. Confirm the cut before authoring row 13.

Note for whoever lands that cut: `PICKER_EPOCH_RESET` currently has a `RESOLVE_INTENTS` row (`lib/adminAlerts/resolveActionLabel.ts`). Per the append-only lifecycle rule, deleting the code means setting `retired: true` on that row, NOT removing it — `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` compares against `origin/main` and will fail on a deletion.

**B. Rows 3 and 6 currently end in a pointer to the parse panel.** The routing session proposes moving both alerts INTO that panel, which would make the pointer self-referential — the same defect spec A fixed for `lead-hint`. The drafts above already drop the pointer. If the routing change does not land, put it back: the sentence is correct as long as the alert renders elsewhere.

## Invariants that still apply

- The bell keeps the unscoped `dougFacing` (`components/admin/BellPanel.tsx:126`), where the show name is load-bearing because the bell is global. Both strings stay authored; a variant is never a replacement.
- Every new variant lands with its frozen pair in `tests/messages/_metaShowScopedTemplates.test.ts` (`PAIRED`), whose key set must EQUAL the set of codes defining a variant — so adding a variant without a pair fails.
- Variants are validated on RENDERED output under a worst-case empty-param fixture, not on template text.
- `dougFacingShowScoped` is classified `rendered-prose` in `tests/messages/_metaCatalogCopyHygiene.test.ts`, so the em-dash ban applies.
