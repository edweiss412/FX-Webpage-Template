# Card-copy helpfulContext parity back-fill + sync-job name unification

**Date:** 2026-08-01 · **Status:** DRAFT (autonomous /ship-feature run) · **Backlog:** `BL-CARD-COPY-HELPFULCONTEXT-PARITY` + `BL-SYNC-JOB-FOUR-NAMES` (both `BACKLOG.md`)

Two small, related copy-registry closures shipped as one branch:

- **Part A** — freeze the `helpfulContext` column of the canonical warning-card table (spec `2026-07-20-warning-card-copy-restore.md` §4.2) against `lib/messages/catalog.ts` for **all 44 registry codes**, closing the rows-1-42 gap that `EXPECTED_HELPFUL_CONTEXT` deliberately left open.
- **Part B** — unify the Doug-facing name of the scheduled sync job to **"Auto sync"** across every surface that names it, with the §12.4 three-way lockstep for catalog rows.

## 1. Context

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
|---|---|
| The catalog wins both Part-A divergences. Both catalog entries were **deliberate later edits** that the canonical table missed: `HOTEL_GUEST_SPLIT_AMBIGUOUS` was rewritten by commit `6d6d43367` (`feat(parser): flag the hotel name/address boundary as an ambiguity`, the 2026-07-25 hotel-ambiguity-coverage arc); `AGENDA_PDF_UNREADABLE` was rewritten by commit `ada490e58` (`feat(sync): split AGENDA_FILE_INACCESSIBLE out of AGENDA_PDF_UNREADABLE`). The stale §4.2 rows also self-contradict: row 29's old prose ("We couldn't read the linked agenda PDF") describes the pre-split behavior that now belongs to `AGENDA_FILE_INACCESSIBLE`, while the shipped title ("No agenda schedule found", `tests/messages/warningCardCopyRegistry.ts` `EXPECTED_TITLE_CHANGES`) and the shipped triggerContext ("opens fine but we couldn't find a schedule") describe the post-split behavior. Reconciling the table to the catalog is a documentation fix, not a copy change — **no shipped string changes in Part A.** | Probe transcript §2.1; `git log -S` output §2.2 |
| The unified job name is **"Auto sync"**. Rationale §3.1. The `StagedReviewCard.tsx` source badge already reads "Auto sync" and is **unchanged** — the alternative ("Sheet sync" everywhere) would make the badge ambiguous against its sibling "Manual sync" (a manual sync also syncs the sheet; the badge's axis is trigger source). Consequence: **no UI-surface file is edited on this branch** (`components/admin/StagedReviewCard.tsx:90` stays byte-identical), so invariant 8 is `N/A — no UI surface`. | `components/admin/StagedReviewCard.tsx:89-93` (`SOURCE_LABELS`) |
| Part B widens beyond the backlog entry's four sites to the **full class** (six catalog rows + the `runSummary` label), per the class-sweep rule in `AGENTS.md` ("Class-sweep before patching adversarial findings"). The sweep transcript is §3.2. | `BACKLOG.md` `BL-SYNC-JOB-FOUR-NAMES` ("pick one name … plain edits for the other two sites" — superseded by the sweep) |
| Verb-phrase descriptions of syncing behavior are **out of scope**: they describe activity, not the job's name. Kept as-is: `WATCH_CHANNEL_ORPHANED.dougFacing` "Shows still sync automatically every few minutes" (`lib/messages/catalog.ts:362`), `SYNC_STALLED.title` "Syncing has stalled" (`catalog.ts:2463`), `SYNC_STALLED.longExplanation` "the scheduled job that reads show sheets from Google Drive" (`catalog.ts:2465`), the onboarding help page's "starts automatic syncing of the folder" (pinned by `tests/help/page-onboarding-wizard.test.tsx:64`), and "the normal sync schedule" phrasings. Code comments and test names (`app/admin/show/[slug]/_actions/useRaw.ts:158`, `app/api/cron/sync/route.ts:10`, `tests/api/cron-sync.test.ts:81`) are not user-visible copy. | Sweep §3.2 |
| `cadence`/`description` fields in `CRON_JOBS` and the §12.4 trigger-condition column prose ("scheduled sync heartbeat has not completed in over an hour", master spec line ~2993) are spec-internal/descriptive, not Doug-visible names — unchanged. | Master spec §12.4 table |

### 1.2 Existing mechanisms (all verified live 2026-08-01)

- Canonical table: `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.2 (44 rows; row cells: `| n | CODE [— title: …] | helpfulContext | triggerContext |`). Four rows carry a `— title:` suffix in the code cell (rows 10, 21, 26, 36).
- Enforcement: `tests/messages/_metaWarningCardCopy.test.ts` + fixture registry `tests/messages/warningCardCopyRegistry.ts`. `EXPECTED_TRIGGER_CONTEXT` covers all 44; `EXPECTED_HELPFUL_CONTEXT` covers only `HOTEL_INLINE_GROUP_OWN_HOTEL` + `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` (rows 43-44). The doc-reading test ("canonical §4.2 rows and the catalog agree, read from the DOCUMENT itself") parses rows with `l.split("|")[2]?.trim() === code` — strict equality that **cannot find the four `— title:` suffixed rows** (probe §2.1 confirmed; extending it to all 44 codes requires a first-token match).
- §12.4 lockstep: master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (table rows ~2990/2993 carry `dougFacing`; appendix list entries at ~3139/3189/3193/3231/3347 carry `helpfulContext`) → `pnpm gen:spec-codes` (`package.json:24`, `scripts/extract-spec-codes.ts`) → `lib/messages/catalog.ts`; gate `tests/cross-cutting/codes.test.ts` ("AC-X.1 §12.4 catalog parity") deep-matches `dougFacing`, `crewFacing`, `followUp`, `helpfulContext` per code. `title`/`longExplanation` are **not** x1-compared.
- Backlog graduation: closed entries move to `BACKLOG-archive.md` with a "Last reconciled" preamble note in `BACKLOG.md`; a graduation meta-test in `tests/docs/` rejects terminal-status entries left in place.

## 2. Part A — helpfulContext byte-parity back-fill (rows 1-42)

### 2.1 Probe (ran 2026-08-01; throwaway tsx script in the worktree, deleted before merge, transcript below)

Diffed every §4.2 row against `MESSAGE_CATALOG` for both `helpfulContext` and `triggerContext`:

```
total registry: 44   already frozen: 2   helpfulContext matching: 42   diffs: 2   no §4.2 row: 0
triggerContext diffs: 2 (same two codes)
```

Only two codes diverge, and each diverges in **both** columns (the doc row is wholly stale; the registry's `EXPECTED_TRIGGER_CONTEXT` was updated when the catalog changed, the doc table was not):

| Code | Column | §4.2 doc (stale) | Catalog (shipped, wins) |
|---|---|---|---|
| `HOTEL_GUEST_SPLIT_AMBIGUOUS` (row 12) | helpfulContext | "A hotel guest cell looked like several people glued together, so we made a judgment call splitting them. Check the guest list in case two people were merged or one was split." | "A hotel line could be read more than one way, so we made a judgment call. Check who is on the reservation in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out." |
| `HOTEL_GUEST_SPLIT_AMBIGUOUS` (row 12) | triggerContext | "Appears when one guest cell seems to hold more than one name." | "Appears when a hotel line could be read more than one way." |
| `AGENDA_PDF_UNREADABLE` (row 29) | helpfulContext | "We couldn't read the linked agenda PDF, so crew see the agenda document but no day-by-day schedule. Check the link still opens; tell us if this keeps appearing." | "We opened the agenda PDF but couldn't find a day-by-day schedule in it, so crew see the agenda document only. Nothing is broken; no action is needed unless it should include a readable schedule." |
| `AGENDA_PDF_UNREADABLE` (row 29) | triggerContext | "Appears when the linked agenda PDF can't be opened or its pages can't be read." | "Appears when the agenda PDF opens fine but we couldn't find a schedule in it." |

### 2.2 Provenance (why catalog wins)

```
git log --all --oneline -S "part of the hotel name was read as a person" -- lib/messages/catalog.ts
  6d6d43367 feat(parser): flag the hotel name/address boundary as an ambiguity
git log --all --oneline -S "Nothing is broken; no action is needed unless" -- lib/messages/catalog.ts
  ada490e58 feat(sync): split AGENDA_FILE_INACCESSIBLE out of AGENDA_PDF_UNREADABLE
```

### 2.3 Changes

1. **§4.2 rows 12 and 29** in `2026-07-20-warning-card-copy-restore.md`: replace both copy cells with the shipped catalog strings (table above). Row 29's code cell additionally gains the retitle marker already shipped in `EXPECTED_TITLE_CHANGES`: `AGENDA_PDF_UNREADABLE — title: **"No agenda schedule found"** (retitled by the ada490e58 split; was "Agenda PDF unreadable")` — documentation only, titles are asserted from `EXPECTED_TITLE_CHANGES`, not the doc.
2. **Same doc, freeze-scope prose** (§3.1-adjacent block, the "Rows 1-42 stay unfrozen" paragraph at line ~105, and any other `BL-CARD-COPY-HELPFULCONTEXT-PARITY` mentions): dated UPDATE note — as of this spec, `EXPECTED_HELPFUL_CONTEXT` covers all 44 rows and the backlog entry is graduated.
3. **`tests/messages/warningCardCopyRegistry.ts`**: back-fill `EXPECTED_HELPFUL_CONTEXT` with the remaining 42 codes, values byte-copied from the (post-step-1) §4.2 table = shipped catalog strings. Rewrite the map's doc comment (the "deliberately does NOT cover every code" paragraph is obsolete).
4. **`tests/messages/_metaWarningCardCopy.test.ts`**: (a) update the header + inline comments that describe partial coverage / the HOTEL_GUEST_SPLIT_AMBIGUOUS divergence / the backlog ref; (b) in the doc-reading test, change the row-code extraction from `cells[2]?.trim() === code` to first-token match (`cells[2]?.trim().split(/\s/)[0] === code`) so the four `— title:` suffixed rows resolve; (c) add an assertion that `EXPECTED_HELPFUL_CONTEXT`'s key set equals `WARNING_CARD_COPY_CODES` — the freeze can no longer silently lose coverage when a code is added to the registry without a frozen row.
5. **Backlog**: graduate `BL-CARD-COPY-HELPFULCONTEXT-PARITY` to `BACKLOG-archive.md` per the graduation convention (archive the entry, prepend the "Last reconciled" note).

### 2.4 Guard conditions / failure modes

- A future code added to `WARNING_CARD_COPY_CODES` without an `EXPECTED_HELPFUL_CONTEXT` row now fails the new key-set assertion (2.3-4c) — fails-by-default, the M5-style registry posture.
- A §4.2 row whose code cell gains a suffix keeps resolving (first-token match). A code with **no** §4.2 row at all still fails `no §4.2 row for <code>`.
- Editing either side (doc row or catalog string) alone fails the doc-reading test for all 44 codes — the previous blind spot (only rows 43-44) is closed.

## 3. Part B — sync-job name unification to "Auto sync"

### 3.1 Name choice

Candidates were the four shipped names. "Auto sync" wins because it is the only candidate that stays unambiguous on **every** surface: on the `StagedReviewCard` source badge its contrast class is trigger source (`Auto sync` / `Drive push` / `Manual sync` / `Onboarding scan`, `components/admin/StagedReviewCard.tsx:89-93`) — "Sheet sync" there would collide with "Manual sync", which also syncs the sheet. In the scheduled-jobs health list (`lib/cron/runSummary.ts:31-95`) "Auto sync" is unambiguous: it is the only sync job among the nine. In prose it works as a proper noun without an article ("since Auto sync still runs"). It is also the shortest candidate, which helps the capped Doug-facing fields. Mid-sentence capitalization: "Auto sync" (capital A, lowercase s), byte-matching the shipped badge string.

### 3.2 Site inventory (full-class sweep, `grep -rn "Sheet sync|Auto sync|scheduled sync|automatic sync|auto sync"` over `lib components app docs public tests e2e`, 2026-08-01)

Sites that NAME the job (in scope):

| # | Site | Current | New |
|---|---|---|---|
| 1 | `lib/cron/runSummary.ts:34` (`CRON_JOBS[0].label`, jobName `"sync"`) | `"Sheet sync"` | `"Auto sync"` |
| 2 | `WATCH_CHANNEL_ORPHANED.helpfulContext` (`catalog.ts:365-366` + master spec ~3347) | "…instead of instantly, since the scheduled sync still runs. It keeps trying…" | "…instead of instantly, since Auto sync still runs. It keeps trying…" |
| 3 | `STAGED_PARSE_SUPERSEDED.helpfulContext` + `.longExplanation` (`catalog.ts:692-696` + master spec ~3139) | "(probably by a different admin or an automatic sync)" | "(probably by a different admin or Auto sync)" |
| 4 | `NO_FOLDER_CONFIGURED.helpfulContext` + `.longExplanation` (`catalog.ts:828-832` + master spec ~3193) | "The automatic sync ran before the setup wizard saved a watched Drive folder." | "Auto sync ran before the setup wizard saved a watched Drive folder." |
| 5 | `MISSING_PENDING_INGESTION_MODTIME.helpfulContext` + `.longExplanation` (`catalog.ts:2345-2349` + master spec ~3231) | "so the scheduled sync knows when to resume processing" | "so Auto sync knows when to resume processing" |
| 6 | `SYNC_DELAYED_SEVERE.dougFacing` (`catalog.ts:2441-2442` + master spec table ~2990) | "Instant updates or the scheduled sync have stalled." | "Instant updates or Auto sync has stalled." (verb agrees with the nearer, singular subject) |
| 7 | `SYNC_DELAYED_SEVERE.helpfulContext` + `.longExplanation` (`catalog.ts:2445-2449` + master spec ~3189) | "whether instant updates are healthy and whether automatic sync is running" | "whether instant updates are healthy and whether Auto sync is running" |
| 8 | `SYNC_STALLED.dougFacing` (`catalog.ts:2457-2458` + master spec table ~2993) | "Automatic syncing hasn't run in over an hour, so new sheet changes won't reach crew pages until it resumes." | "Auto sync hasn't run in over an hour, so new sheet changes won't reach crew pages until it resumes." |

Unchanged (referent named correctly already): `components/admin/StagedReviewCard.tsx:90` badge `"Auto sync"`; the `tests/help/_uiLabelExceptions.ts:191` comment listing the badge set. Out-of-scope verb phrases and internals: §1.1.

### 3.3 §12.4 three-way lockstep (per AGENTS.md "§12.4 catalog row edits")

One commit carries, for the six catalog codes with edited x1-compared fields (`WATCH_CHANNEL_ORPHANED`, `STAGED_PARSE_SUPERSEDED`, `NO_FOLDER_CONFIGURED`, `MISSING_PENDING_INGESTION_MODTIME`, `SYNC_DELAYED_SEVERE`, `SYNC_STALLED` — five with `helpfulContext` edits, two with `dougFacing` edits, `SYNC_DELAYED_SEVERE` in both sets):

1. master spec §12.4 prose edits (table `dougFacing` cells for `SYNC_DELAYED_SEVERE` + `SYNC_STALLED`; appendix `helpfulContext` entries for the five listed),
2. `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts`,
3. matching `lib/messages/catalog.ts` edits (including the non-x1-compared `longExplanation` mirrors, which duplicate the same phrases and would otherwise drift).

Gate: `pnpm test:audit:x1-catalog-parity`.

### 3.4 Known test touchpoints

- `tests/messages/popoverContextCopy.test.ts:30` pins the old `WATCH_CHANNEL_ORPHANED.helpfulContext` byte string — update in the same commit.
- `tests/app/admin/telemetryPage.test.tsx:76` pins `label: "Sheet sync"` — update.
- `tests/components/admin/__snapshots__/parsePanelComposition.test.tsx.snap` contains `Auto sync` (badge) — unchanged.
- Part A: `tests/messages/_metaWarningCardCopy.test.ts` + registry per §2.3.

The plan's TDD shape: extend/adjust the pinned tests first (red against current strings where the assertion is the NEW string), then apply the copy edits (green).

## 4. Interaction between the parts

Part A freezes §4.2 `helpfulContext` for all 44 warning-card codes; Part B edits **catalog codes outside that registry** (`WATCH_CHANNEL_ORPHANED` etc. are §12.4 admin/system codes, not warning-card codes — zero overlap with `WARNING_CARD_COPY_CODES`). Verified: none of the six Part-B codes appear in `WARNING_CARD_COPY_CODES`. The two parts share no files except `BACKLOG.md` and can land as independent commits on one branch.

## 5. Acceptance criteria

1. `EXPECTED_HELPFUL_CONTEXT` keys == `WARNING_CARD_COPY_CODES` (44), asserted in the meta-test; whole suite green.
2. §4.2 rows 12 + 29 byte-match the shipped catalog strings; the doc-reading test resolves all 44 rows including the four `— title:` suffixed ones.
3. Zero user-visible occurrences of "Sheet sync", "the scheduled sync", "an automatic sync", "the automatic sync", "automatic sync", or "Automatic syncing" as the job's **name** in `lib/messages/catalog.ts`, `lib/cron/runSummary.ts`, `components/`, `app/` (verified by the §3.2 sweep re-run at close-out; out-of-scope verb phrases per §1.1 remain).
4. `pnpm test:audit:x1-catalog-parity` green (regen included in the Part-B commit).
5. Both backlog entries graduated to `BACKLOG-archive.md`; graduation meta-test green.
6. No file under `components/`, `app/` (non-api), `app/globals.css`, `tailwind.config.*`, or `DESIGN.md` modified → `impeccable-gate: N/A — no UI surface`.

## 6. Documented limits

- Part A freezes byte-parity, not copy quality: any future deliberate copy change must edit table + catalog + registry fixture together (that is the point).
- Part B unifies the job's *name*; descriptive verb phrases about syncing remain varied by design (§1.1). The catalog's `title`/`longExplanation` fields are not x1-gated; their Part-B edits are kept consistent by the same commit but only the doc-reading/x1/popover tests pin them mechanically where noted.
- `spec-codes.ts` is generated; it is never hand-edited.

## Dimensional Invariants

N/A — no component, layout, or DOM change on this branch; the only component file named (`components/admin/StagedReviewCard.tsx`) is explicitly unchanged (§1.1).

## Transition Inventory

N/A — no visual states are added or changed; copy-string and documentation edits only.

## 7. Invariant compliance

- No DB, no advisory locks, no mutation surfaces, no migrations → invariants 2, 3, 4, 9, 10 N/A (no new code paths; copy-only).
- Invariant 5 (no raw codes in UI): untouched — edits stay inside `lib/messages/catalog.ts` lookup surface.
- Invariant 8: `impeccable-gate: N/A — no UI surface` (§5.6).
- TDD (invariant 1): test-first per §3.4.
