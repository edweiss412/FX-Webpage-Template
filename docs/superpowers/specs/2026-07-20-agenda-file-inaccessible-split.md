# Spec — Split agenda "couldn't open the file" out of `AGENDA_PDF_UNREADABLE`

**Date:** 2026-07-20
**Status:** Draft (autonomous /ship-feature)
**Slug:** `agenda-file-inaccessible-split`

## 0. Summary

`AGENDA_PDF_UNREADABLE` fires from **four failure branches**. Three of them mean
we could not obtain a usable agenda PDF, so crew get no schedule and usually no
agenda at all (deleted/not-shared, non-PDF/trashed, download-blocked/too-large).
The fourth means we downloaded a valid PDF but found no schedule in it — there
crew **do** see the embedded agenda document. One code with one copy therefore
cannot be accurate: its current copy ("we couldn't read the PDF... check that the
agenda link still opens") is actively misleading for the dominant real case (a
private file that isn't shared with our service account), and its "crew see the
embedded agenda document" claim is false for exactly that case.

This spec **splits the code by whether our sync could obtain a readable agenda
PDF at all**:

- **New `AGENDA_FILE_INACCESSIBLE`** — we could not open/obtain a usable agenda
  PDF, so there's no schedule and crew may not be able to see the agenda.
  Actionable: confirm it exists, is shared with us, and is a reasonably sized PDF,
  or replace the link.
- **`AGENDA_PDF_UNREADABLE` (kept, narrowed)** — we downloaded a valid PDF but
  found no day-by-day schedule in it, so crew see the agenda document only. Its
  copy becomes accurate; usually no action.

The split is keyed on **which internal branch fired** (our code knows), not on the
Drive error (which cannot tell "not shared" from "deleted"). It is achievable and
correct precisely because we split on our own knowledge, not Drive's.

## Dimensional Invariants

N/A — this is a message-catalog copy + sync-emit-string change. No React
component, layout, fixed-dimension parent, or flex/grid relationship is added or
modified. The help page renders existing markup from catalog data; no DOM
structure changes.

## Transition Inventory

N/A — no component with multiple visual states is added or modified. The two
warning cards render statically from catalog copy; there are no state transitions
or animations in scope.

## 1. Problem, with evidence

### 1.1 Resolved scope — do not relitigate

Ratified by the empirical spike + code reads below. Verify the evidence; do not
re-derive.

1. **"Private/not-shared" and "deleted" are Drive-indistinguishable — so we do
   NOT try to separate them.** Probe on 2026-07-20 as the sync service account
   `fxav-reader@fxav-crew-pages.iam.gserviceaccount.com`: a not-shared existing
   file (fileId `1N0SNyciz0isLC_a-ivZhEow1-12mm0w0`, confirmed live via its
   "Request access" page) and a nonexistent random fileId BOTH return HTTP **404
   `reason:"notFound"`, `message:"File not found: <id>."`** — byte-identical on
   metadata `files.get` and on `alt=media`. Drive hides existence. Therefore
   `AGENDA_FILE_INACCESSIBLE` names **both** ("deleted, or private and not shared
   with us") rather than asserting one. A dedicated permission-only code remains
   impossible and is out of scope.

2. **The split is by internal branch, and that IS distinguishable.** Our own code
   knows which failure branch it took. The four current `AGENDA_PDF_UNREADABLE`
   emit sites, all in `lib/sync/enrichAgenda.ts`:
   - branch 217 — `getFile` threw 404/400 (deleted OR not-shared OR invalid id).
   - branch 254 — `getFile` succeeded but `fileMeta.mimeType !== "application/pdf" || trashed`.
   - branch 327 — `downloadFileBytes` returned `unavailable` (media 404/403 at
     `lib/drive/agendaDrive.ts:143`, or byte-cap exceeded at
     `lib/drive/agendaDrive.ts:136`).
   - branch 417 — download + parse succeeded, `sessionCount === 0`.

3. **Crew-visibility per branch is decided by the crew proxy, and it inverts.**
   Crew never fetch Drive directly; the embed loads through
   `/api/asset/agenda/<show>/<fileId>` (`components/agenda/AgendaEmbed.tsx:5`),
   which downloads the bytes **server-side via the same service account** and
   streams them. Non-PDF MIMEs return 410 and the viewer shows an "Open in Drive"
   fallback (`components/agenda/AgendaEmbed.tsx:13`). Consequence:
   - branches 217, 327 — we don't get usable bytes (branch 217: not obtainable;
     branch 327: download blocked, OR the file exceeds our size cap so we reject
     it even though Drive would serve it) → the crew proxy (same download path,
     same cap) also fails → **crew see no agenda.**
   - branch 254 (non-PDF) — proxy returns 410 → **crew see no agenda** (the "Open
     in Drive" fallback is not the document). Trashed is an edge (§6).
   - branch 417 — SA downloaded a valid PDF → proxy serves it → **crew DO see the
     agenda document**, just no structured schedule.
   So "crew see the embedded agenda document" is true ONLY for branch 417. This is
   why branch 254 belongs with the inaccessible group, not the kept code (a
   refinement over the first cut, which would have re-introduced the false-embed
   claim).

4. **Branch → code mapping (final):**

   | Branch | Cause | Crew see agenda? | Code |
   | --- | --- | --- | --- |
   | 217 | getFile 404/400 (deleted / not-shared / invalid) | No | `AGENDA_FILE_INACCESSIBLE` |
   | 254 | not a PDF / trashed | No (410 / edge) | `AGENDA_FILE_INACCESSIBLE` |
   | 327 | download unavailable (media 403/404, byte-cap) | No | `AGENDA_FILE_INACCESSIBLE` |
   | 417 | valid PDF, zero sessions extracted | Yes | `AGENDA_PDF_UNREADABLE` (kept) |

5. **Sharing guidance stays "shared with us," never "everyone/outsiders."** A file
   shared only with the service account works; the copy must not imply public
   access is required. An "anyone-with-the-link can view" example is offered as
   one concrete option, not a requirement.

6. **Routing needs no change.** `sectionForWarning` (`lib/admin/step3SectionStatus.ts:70`)
   routes by `w.blockRef?.kind`; the agenda `warn()` helper
   (`lib/sync/enrichAgenda.ts:45`) sets no `blockRef`, so both codes land in the
   "warnings" bucket and group by their catalog **title** eyebrow (the mechanism
   visible in the reported screenshots). A new catalog entry is sufficient; no
   `warningsBySection` / `KIND_TO_SECTION` / `AMBIGUITY_CODES`
   (`lib/parser/ambiguityCodes.ts:19`) edit (neither code is an ambiguity code).

### 1.2 Current (misleading) copy — cited

`lib/messages/catalog.ts:1563` `AGENDA_PDF_UNREADABLE`: `dougFacing`
(`lib/messages/catalog.ts:1566`, mirrored §12.4 table
`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2918`), `helpfulContext`
(`lib/messages/catalog.ts:1570`, mirrored §12.4 map
`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3238`), `triggerContext`
(`lib/messages/catalog.ts:1572`, mirrored
`tests/messages/warningCardCopyRegistry.ts:89`), `longExplanation`
(`lib/messages/catalog.ts:1575`). All center on "can't read the PDF / check the
link opens" and claim crew see the embed — wrong for the inaccessible causes.

## 2. The two codes (exact copy)

Straight apostrophes, no em-dashes (`tests/messages/_metaCatalogCopyHygiene.test.ts`);
retain the `_<sheet-name>_` emphasis token where a `<sheet-name>` appears
(`tests/messages/_metaShowScopedTemplates.test.ts` and
`tests/messages/_metaEmphasisRenderContract.test.ts`).

### 2.1 NEW — `AGENDA_FILE_INACCESSIBLE`

Copy deliberately **hedges crew-visibility** ("may not be able to see") rather
than asserting crew definitely cannot see it — because a trashed file may still
stream through the proxy, a non-PDF shows an "Open in Drive" fallback, and a
too-large-but-shared file is genuinely reachable in Drive. The always-true facts
are "we couldn't open it" and "no schedule"; crew-visibility is hedged. All four
causes (deleted, not-shared, non-PDF, too-large) are named.

- `code`: `"AGENDA_FILE_INACCESSIBLE"`
- `title`: `"Can't open the agenda file"`
- `dougFacing`:
  _"We couldn't open the agenda file linked on _<sheet-name>_, so there's no
  day-by-day schedule and crew may not be able to see the agenda either. Most
  often it's private and not shared with us, or it was deleted; it can also be a
  non-PDF link or a file too large to open. Confirm the agenda is a shared,
  reasonably sized PDF (for example, set the link to anyone-with-the-link can
  view), or replace the link."_
- `crewFacing`: `null`
- `followUp`: `"Doug → check agenda link"` (literal arrow U+2192, matching sibling rows)
- `helpfulContext`:
  _"We couldn't open the linked agenda file, so there's no schedule and crew may
  not be able to see the agenda. It may be private and not shared with us,
  deleted, a non-PDF link, or too large to open. Confirm it's a shared,
  reasonably sized PDF, or replace the link."_
- `triggerContext`:
  _"Appears when we can't open the linked agenda file: it's missing, not shared
  with us, not a PDF, or too large."_
- `longExplanation`:
  _"We couldn't open the agenda file linked on this show, so there's no day-by-day
  schedule and crew may not be able to see the agenda. This happens when the file
  was deleted, when it's private and not shared with us (a missing file and a
  not-shared file look the same to us), when the link isn't a readable PDF, or
  when the file is too large for us to open. Confirm the agenda is a shared,
  reasonably sized PDF, then re-check, or replace the link."_
- `helpHref`: `"/help/errors#AGENDA_FILE_INACCESSIBLE"`

### 2.2 KEPT (narrowed) — `AGENDA_PDF_UNREADABLE`

Now fires only for branch 417 (valid PDF, zero sessions).

- `title`: `"No agenda schedule found"` (was `"Agenda PDF unreadable"` — inaccurate
  now that the file opened fine).
- `dougFacing`:
  _"We opened the agenda PDF linked on _<sheet-name>_ but couldn't find a
  day-by-day schedule in it, so crew see the agenda document but not a structured
  schedule. No action is needed unless the agenda is supposed to include a
  schedule we can read."_
- `crewFacing`: `null`
- `followUp`: `"Doug → optional check"` (literal arrow U+2192; was `"Doug → check agenda link"`).
- `helpfulContext`:
  _"We opened the agenda PDF but couldn't find a day-by-day schedule in it, so
  crew see the agenda document only. Nothing is broken; no action is needed unless
  it should include a readable schedule."_
- `triggerContext`:
  _"Appears when the agenda PDF opens fine but we couldn't find a schedule in it."_
- `longExplanation`:
  _"The agenda PDF opened and downloaded fine, but we couldn't find a day-by-day
  schedule in it, so crew see the embedded agenda document without a structured
  schedule. This is a safe fallback; no action is needed unless the agenda is
  supposed to contain a schedule we can read, in which case check its layout."_
- `helpHref`: unchanged `"/help/errors#AGENDA_PDF_UNREADABLE"`.

Both `followUp` values use the literal `→` (U+2192) already used by every sibling
catalog row (e.g. `lib/messages/catalog.ts:80`), never an em-dash.

## 3. Surface fan-out (ONE atomic commit)

New §12.4 parse-warning code + retitled kept code. Every surface
`AGENDA_PDF_UNREADABLE` touches gets a sibling for `AGENDA_FILE_INACCESSIBLE`.

**All rows below land in a single commit.** Producer-reachability + x1 parity
couple them: the catalog entry, the §12.4 row, both regenerated files, and the
enrichAgenda producer must co-exist or an intermediate commit is red. "regen" in
rows 3 and 5 means "run the generator and stage its output into this same commit,"
not a separate commit.

| # | File | Action |
| --- | --- | --- |
| 1 | `lib/sync/enrichAgenda.ts` (branches 217, 254, 327) | emit `AGENDA_FILE_INACCESSIBLE` (update inline `.message` for branch clarity); branch 417 stays `AGENDA_PDF_UNREADABLE` |
| 2 | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 | NEW `AGENDA_FILE_INACCESSIBLE` row; EDIT `AGENDA_PDF_UNREADABLE` row (table line 2918 desc+dougFacing; helpfulContext map line 3238) |
| 3 | `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` | regen; stage into the commit |
| 4 | `lib/messages/catalog.ts` | NEW `AGENDA_FILE_INACCESSIBLE` entry; NEW `WARNING_CARD_COPY_CODES` member; EDIT `AGENDA_PDF_UNREADABLE` entry (title + 4 copy fields + followUp) |
| 5 | `pnpm gen:internal-code-enums` → `lib/messages/__generated__/internal-code-enums.ts` | regen (auto-discovers the new literal from enrichAgenda); stage into the commit |
| 6 | `lib/parser/dataGaps.ts` | NEW `GAP_CLASSES` row `{ code: "AGENDA_FILE_INACCESSIBLE", label: "unopenable agenda file" }` (mirrors `AGENDA_PDF_UNREADABLE` at `lib/parser/dataGaps.ts:52`) |
| 7 | `tests/messages/warningCardCopyRegistry.ts` | NEW `AGENDA_FILE_INACCESSIBLE` triggerContext (mirror line 89); EDIT `AGENDA_PDF_UNREADABLE`; add both codes' new titles to `EXPECTED_TITLE_CHANGES` at `tests/messages/warningCardCopyRegistry.ts:109` |
| 8 | `tests/messages/agendaCodes.test.ts` | add `AGENDA_FILE_INACCESSIBLE` to the code list + copy-content asserts |
| 9 | `tests/sync/enrichAgenda.test.ts` | update per-branch emit expectations (217/254/327 → new; 417 → kept) |
| 10 | `tests/parser/dataGaps.test.ts` | bump the hard-coded `GAP_CLASSES` length + `DATA_GAP_CODES.size` from `32` → `33` (line ~42) |

`CODE_SCENARIOS` needs NO manual edit — `tests/cross-cutting/code-scenarios.ts`
derives its keys from `SPEC_CODES` via `Object.fromEntries`, so the new code is
auto-covered once `gen:spec-codes` runs.

**Parity/meta gates that must stay green:** x1-catalog-parity
(`tests/cross-cutting/codes.test.ts:69`, `tests/cross-cutting/extract-spec-codes.test.ts`),
x2-no-raw-codes (`tests/cross-cutting/no-raw-codes.test.ts`),
`tests/messages/_metaWarningCardCopy.test.ts`,
`tests/messages/_metaCatalogCopyHygiene.test.ts`,
`tests/messages/_metaShowScopedTemplates.test.ts`,
`tests/messages/_metaEmphasisRenderContract.test.ts`,
`tests/messages/codeProducers.test.ts` (auto-scan),
`tests/messages/codes-coverage.test.ts` (M8-only — unaffected).

## 4. Test plan (TDD)

1. **`tests/sync/enrichAgenda.test.ts` (RED first).** Assert the emitted
   `warning.code` for **every changed branch and its named sub-paths**:
   - getFile rejects **404** → `AGENDA_FILE_INACCESSIBLE` (branch 217).
   - getFile rejects **400** → `AGENDA_FILE_INACCESSIBLE` (branch 217, other gone status).
   - getFile resolves a **non-PDF** `fileMeta` (`mimeType: "text/plain"`) →
     `AGENDA_FILE_INACCESSIBLE` (branch 254).
   - getFile resolves a **trashed** PDF (`trashed: true`) →
     `AGENDA_FILE_INACCESSIBLE` (branch 254).
   - `downloadFileBytes` returns `{ kind: "unavailable" }` → `AGENDA_FILE_INACCESSIBLE`
     (branch 327). This test proves the `unavailable → code` mapping only. That
     `{ kind: "unavailable" }` itself covers BOTH media 403/404 and byte-cap is
     proved separately and already by `tests/drive/agendaDrive.test.ts` (the
     "404 → unavailable", "403 → unavailable", and "stream exceeds
     AGENDA_PDF_MAX_BYTES → unavailable (byte cap)" cases at lines 83/88/105); the
     two tests compose, so no byte-cap test is duplicated at the enrichAgenda layer.
   - valid PDF, **zero-session** extraction → `AGENDA_PDF_UNREADABLE` (branch 417).
   Concrete failure mode: a refactor collapsing the codes or mis-routing a branch.
   Assert on the returned `warnings` array (data source), not a rendered surface.
   Read the existing tests first and extend the already-mocked `driveClient`
   cases; do not hardcode.
2. **Copy-content (`tests/messages/agendaCodes.test.ts`) — protects the R1
   embed-claim regression across every edited field.** Assert against the catalog
   entry fields directly:
   - `AGENDA_FILE_INACCESSIBLE`: `dougFacing` matches `/shared with us/i` AND
     `/deleted/i` AND `/too large/i` (all cause classes named) AND
     `/may not be able to see/i` (hedged crew-visibility). NONE of
     `dougFacing` / `helpfulContext` / `longExplanation` matches
     `/agenda document/i` (the positive-embed phrasing must be absent — this is
     the R1 false-embed regression guard). No field matches `/still opens/i`.
   - `AGENDA_PDF_UNREADABLE`: `dougFacing` matches `/no action/i` AND
     `/agenda document/i` (the embed claim IS present and true here); no field
     matches `/still opens/i`.
   - Both keep `crewFacing === null`.
   Failure mode: a silent revert re-introduces the false-embed claim on the
   inaccessible code, or drops it from the kept code — the `/agenda document/i`
   presence/absence pair catches both directions.
3. **Parity + hygiene + card-copy green** (§3 gates), after the two regens.
4. **`_metaWarningCardCopy` green** — the retitle is reflected in
   `EXPECTED_TITLE_CHANGES` and both triggerContexts match the registry.

No dimensional-invariant / transition-audit tasks: no component, layout, or
multi-state UI changes (catalog data + sync emit strings; the help page renders
from the catalog).

## 5. Guard conditions / edge cases

- **Byte-cap exceeded** (branch 327 via `ByteLimitExceededError`) — a shared,
  valid PDF that exceeds the cap also yields `unavailable` →
  `AGENDA_FILE_INACCESSIBLE`. The copy names this case ("a file too large to
  open" / "reasonably sized PDF"), so the guidance is truthful for it rather than
  steering Doug only toward permissions. Not worth its own code.
- **Trashed file** (branch 254) — `getFile` returns `trashed:true`. A trashed file
  may still stream bytes briefly, so crew *might* see it — which is exactly why the
  copy hedges crew-visibility ("may not be able to see") instead of asserting they
  can't. "It was deleted" covers the cause.
- **`<sheet-name>` token** — present + emphasized in both `dougFacing` strings; the
  kept code keeps it, the new code keeps it. `longExplanation` uses "this show" (no
  token) intentionally (help-page context has no per-sheet binding), matching the
  existing `AGENDA_LINK_NOT_CLICKABLE.longExplanation` style.
- **No numeric literals** in the copy strings; the §12.4 **code count increases by
  one** (new row) — the only numeric consequence, reconciled by adding exactly one
  §12.4 row and one catalog entry (nothing else in the spec counts codes).

## 6. Out of scope (deferred, with rationale)

- Distinguishing not-shared from deleted (Drive-impossible — §1.1.1).
- Merging `AGENDA_PDF_UNREADABLE` (zero-sessions) with `AGENDA_SCHEDULE_LOW_CONFIDENCE`
  (low-confidence times) — both now mean "PDF only, no schedule," but they fire
  from distinct extractor branches and carry different admin nuance; consolidation
  is a separate copy-consolidation decision.
- Deduping the raw-warnings ledger vs the section-routed actionable card — a
  pre-existing, all-codes UX question.
- Renaming the `AGENDA_PDF_UNREADABLE` **code id** (only the human title changes;
  renaming the id would ripple through every generated enum + emit site for no
  user-visible gain).
