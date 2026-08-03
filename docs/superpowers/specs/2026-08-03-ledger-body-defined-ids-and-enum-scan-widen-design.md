# Body-defined ledger ids, and the parse-warning enum scan

**Date:** 2026-08-03
**Branch:** `chore/ledger-body-ids-enum-scan-widen`
**Closes:** `BL-LEDGER-GUARD-BODY-DEFINED-IDS` (Part A, in full)
**Amends:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` (Part B — the filed remedy is refuted by probe; see §7)

Two backlog rows, grouped because both edit `BACKLOG.md` and parallel branches would
collide on the reconciliation line at `BACKLOG.md:7`, which the file itself records as a
merge-concatenation rot site. Their code surfaces are disjoint.

---

## Part A — the citation guard resolves headings only

### A.1 Current behavior

`tests/docs/_metaLedgerReferentialIntegrity.test.ts:127-135` builds the definition side
from `ledgerIds(...)` over the four files in `LEDGERS` (`:55-60`). `ledgerIds`
(`tests/docs/_ledgerMdast.ts:324-326`) is `extractEntries(...).map(e => e.id)`, and
`extractEntries` (`:302-322`) mints an id only from a top-level `##`/`###` HEADING via
`headingId` (`:221-287`).

Eight ids are defined deliberately in an entry's BODY instead. They resolve for a human
reading the parent and are not debt, but the guard cannot see them, so they sit in
`KNOWN_DANGLING` (`:95-114`) looking like untracked work. `BL-LEDGER-GUARD-BODY-DEFINED-IDS`
ratified on 2026-08-02 that **they stay body-defined**: promoting them would give each a
heading whose content is one bullet and would break the parent's ratchet or gate semantics.

### A.2 Corpus census — three shapes, and the backlog row names only one

The row's **Work:** paragraph describes the form as ``- **`BL-…`** — …``. That is one of
two definition shapes actually present, and the corpus also contains a near-miss that must
NOT define. Probed 2026-08-03 across all four ledgers:

| # | Shape | Instances | Verdict |
|---|-------|-----------|---------|
| 1 | ``- **`BL-MUTATION-REF-SUB`** — …`` (`strong` > `inlineCode`, one id) | `BACKLOG.md:581-585` (5) | DEFINES |
| 2 | `- **BL-SYNCFEED-UI-1** — …` (`strong` > plain text, one id) | `BACKLOG.md:1116-1118` (3) | DEFINES |
| 3 | ``- `BL-A`, `BL-B`, `BL-C` — …`` (`inlineCode`, **no** `strong`, many ids) | `BACKLOG.md:83-84` (2) | must NOT define |

Shape 3 is the enumeration inside `BL-LEDGER-GUARD-BODY-DEFINED-IDS` itself — a bullet
that *discusses* the eight ids. It leads with an id, so a "first token is a BL- id" rule
would mint from it. The `strong` wrapper is what separates a definition from a discussion,
and it is present on every shape-1/shape-2 instance and absent on every shape-3 instance.

Counts: `grep -cE '^\s*-\s+\*\*`?BL-'` → BACKLOG.md 8, BACKLOG-archive.md 0, DEFERRED.md 0,
DEFERRED-archive.md 0. No `DEF-` id uses either definition shape, so the change is inert
for the deferred pair today and correct for it if one ever does.

### A.3 Grammar

Inside the body of an entry whose own heading id already resolves, a list item DEFINES an
id when **all** hold:

1. The item's first block child is a paragraph.
2. That paragraph's **first inline node is a `strong` node**.
3. The `strong` node's flattened text is **exactly one** id token — `[A-Z0-9]` start,
   `[A-Z0-9-]*[A-Z0-9]` tail, matching the guard's existing `CITATION` shape
   (`_metaLedgerReferentialIntegrity.test.ts:67`) — with no other text inside the strong run.
   The token may sit inside an `inlineCode` child of the strong node (shape 1) or be plain
   text (shape 2).
4. The text immediately after the `strong` node begins with the entry separator: optional
   whitespace, then `—`.

Condition 3's "exactly one" rejects a hypothetical `` **`BL-A`, `BL-B`** `` multi-id lead;
condition 4 rejects `**BL-FOO** is discussed above`, which mentions rather than defines.
Condition 2 rejects shape 3. Any inline mention later in the bullet is unreachable by
construction — only the LEAD is read.

**Deliberate divergence from `headingId`.** `headingId` rejects a token in `code`
provenance (`_ledgerMdast.ts:278-281`), so `` ## `BL-X` `` mints nothing. The body-bullet
extractor accepts `inlineCode` inside the strong lead, because shape 1 — the majority of
the live corpus — is written that way. The discriminator here is the `strong` wrapper, not
the code span, so admitting code provenance costs no precision. Headings keep their strict
rule; this is a second, narrower minting site with its own evidence.

### A.4 Scope containment

The "a bullet in a plan or spec must NOT define anything" requirement holds **structurally,
not by predicate**: `definedIds()` reads only the four files in `LEDGERS`. Body bullets in
plans, specs, and handoffs are never offered to the extractor, so a typo in one cannot
define itself. The prose bullet in the reconciliation log (`BACKLOG.md:7`) sits before the
first heading and therefore belongs to no entry's body — `extractEntries` slices bodies
from the first id-heading onward (`:312-321`).

### A.5 Placement and blast radius

- `tests/docs/_ledgerMdast.ts` gains an exported `bodyDefinedIds(entry: LedgerEntry): string[]`,
  next to the walker it belongs to. It reuses the existing mdast node types; no new dependency.
- `tests/docs/_metaLedgerReferentialIntegrity.test.ts:127-135` `definedIds()` unions heading
  ids with body ids.
- The eight `KNOWN_DANGLING` rows for `BL-MUTATION-{REF-SUB,UNICODE,COLUMN-SHIFT,MERGED-CELL,SECTION-ORDER}`
  and `BL-SYNCFEED-UI-{1,2,3}` are deleted. One row survives: `BL-RESOLVED`
  (`:106-107`), a prose placeholder in an audit doc, handed to a separate follow-up.
- The existing stale-row ratchet (`:306-314`, "no KNOWN_DANGLING row has started resolving")
  becomes the enforcement that they are never re-added.

Consumers of `ledgerIds` elsewhere are unaffected: `bodyDefinedIds` is additive and
`ledgerIds` keeps its heading-only contract, so the graduation guard
(`_metaDeferralLedgerGraduation.test.ts`) and the in-progress guard
(`_metaLedgerInProgress.test.ts`) see no change. This is deliberate — an entry's LIFECYCLE
(status, graduation, in-flight) belongs to headings; only the citation namespace widens.

### A.6 Plants

Against a synthetic corpus, in `_ledgerMdast.walker.test.ts` (which `NOT_CITATIONS`
already excludes from the citation scan, so plant ids cannot pollute the real run):

| # | Plant | Expect |
|---|-------|--------|
| 1 | ``- **`BL-A`** — text`` inside an entry | defines `BL-A` |
| 2 | `- **BL-B** — text` inside an entry | defines `BL-B` |
| 3 | ``- `BL-C`, `BL-D` — text`` inside an entry | defines nothing |
| 4 | `- text mentioning **BL-E** — text` | defines nothing (not the lead) |
| 5 | ``- **`BL-F`, `BL-G`** — text`` | defines nothing (two ids in one strong run) |
| 6 | `- **BL-H** is discussed above` | defines nothing (no `—` separator) |
| 7 | A shape-1 bullet BEFORE the first heading | defines nothing (no parent entry) |
| 8 | `- **BL-lower** — text` | defines nothing (lowercase is not an id) |
| 9 | `- **Status:** IN PROGRESS · …` | defines nothing (field label, no id) |
| 10 | `- **BL-J** — text` nested two levels deep inside an entry's list | defines `BL-J` |

Plant 10 pins the nested case explicitly rather than leaving it to chance; the live corpus
has only flat lists, so the behavior would otherwise be untested either way.

An eleventh assertion is a live-corpus pin, not a plant: `bodyDefinedIds` over the real
`BACKLOG.md` yields exactly the eight ids in §A.2, so a grammar regression that silently
stops minting them fails here rather than surfacing as a re-added `KNOWN_DANGLING` row.

---

## Part B — the parse-warning enum generator

### B.1 What the row says

`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` states that `extractInternalCodeEnums`
(`scripts/extract-internal-code-enums.ts:70-73`) collects `parse_warnings.code` literals
only from `readFiles(["lib/parser"])`, so four emitters outside that root are hand-listed
in `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`). Its remedy:
"widen the scan roots … and delete `EXTRA_WARNING_CODES`", plus a guard.

### B.2 What the probes show

Three probes were run on 2026-08-03 in this worktree (scratch scripts, not committed).

**Probe 1 — widen the roots, measure the delta.** Re-ran the exact current predicate over
candidate root sets:

| Roots | Codes | Added vs `lib/parser` |
|---|---|---|
| `lib/parser` (current) | 46 | — |
| `+ lib/agenda + lib/sync` | 55 | +9 |
| `lib` (whole) | 66 | +20 |
| `lib` + `app` | 66 | +20 |

Of the four codes the row wants absorbed, root-widening alone absorbs **one**
(`PULL_SHEET_OVERRIDE_CONTENT_CHANGED`). It absorbs 8 codes that are **not** parse
warnings — `DRIVE_FETCH_FAILED`, `PARSE_ERROR_LAST_GOOD`, `RESYNC_QUALITY_REGRESSED`,
`RESYNC_SHRINK_HELD`, `SHEET_UNAVAILABLE`, `SHOW_FIRST_PUBLISHED` (all
`lib/sync/runScheduledCronSync.ts`, admin-alert namespace), `ROLE_FLAGS_NOTICE`
(`lib/sync/phase2.ts`), `STAGED_PARSE_OUTDATED_AT_PHASE_D` (`lib/sync/pullSheetOverride.ts`).
Widening to all of `lib` additionally absorbs the dev gallery's own fixture codes from
`lib/dev/attentionScenarios/tier2.ts` and `tier3.ts` — the generator would begin feeding
on its own consumer.

**So the filed remedy is refuted:** root-widening under-delivers on the goal and
over-selects into three unrelated code namespaces.

**Probe 2 — why the other three are missed.** Not the roots:

- `AGENDA_SCHEDULE_LOW_CONFIDENCE` and `AGENDA_SCHEDULE_TIME_ADJUSTED` are emitted through
  a positional helper, `warn("CODE", message)` — `lib/sync/enrichAgenda.ts:45-47` defines
  `function warn(code: string, message: string): ParseWarning`, used at `:424` and `:432`.
  `CODE_PROPERTY_RE` (`extract-internal-code-enums.ts:17`) matches only `code: "LITERAL"`,
  so the helper form is structurally invisible at any root.
- The `EXTRA_WARNING_CODES` comment attributes `AGENDA_SCHEDULE_LOW_CONFIDENCE` to
  `lib/agenda/extractAgendaSchedule.ts` (`tier1.ts:132`). **That attribution is wrong.**
  The only occurrence in that file is `:634`, a `code:` field inside a `log.warn(...)` call
  opened at `:615` — correctly stripped by `stripLogEmissionCalls`
  (`extract-internal-code-enums.ts:45`). That file emits no ParseWarning. The real emitter
  is `lib/sync/enrichAgenda.ts:424`.
- `PULL_SHEET_ON_ARCHIVED_TAB` **is already generated**, as
  `source: "parse_warnings.code,pending_ingestions.last_error_code"`
  (`lib/messages/__generated__/internal-code-enums.ts:224-226`). Its `EXTRA_WARNING_CODES`
  row is dead — and it was masking a different defect (§B.3).

**Probe 3 — type-aware census of every ParseWarning construction site.** ts-morph over
`lib/`, `app/`, `components/`, matching object literals whose contextual type is
`ParseWarning` plus calls whose return type is `ParseWarning`. Result: **16 codes have no
emit site under `lib/parser`**, across nine files:

```
lib/sync/enrichAgenda.ts            AGENDA_FILE_INACCESSIBLE, AGENDA_LINK_NOT_CLICKABLE,
                                    AGENDA_PDF_UNREADABLE, AGENDA_SCHEDULE_LOW_CONFIDENCE,
                                    AGENDA_SCHEDULE_TIME_ADJUSTED
lib/sync/enrichWithDrivePins.ts     DIAGRAMS_TAB_MISSING, DIAGRAMS_EMBEDDED_NONE_FOUND,
                                    DIAGRAMS_EMBEDDED_CAP_EXCEEDED,
                                    DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE,
                                    DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE,
                                    LINKED_FOLDER_OVERFLOW_TRUNCATED
lib/sync/snapshotAssets.ts          EMBEDDED_ASSET_DRIFTED
lib/sync/applyStaged.ts             EMBEDDED_ASSET_DRIFTED
lib/sync/pullSheetOverride.ts       PULL_SHEET_OVERRIDE_CONTENT_CHANGED
lib/sync/enrichVenueGeocode.ts      VENUE_TIMEZONE_UNRESOLVED, VENUE_GEOCODE_UNRESOLVED
lib/sync/enrichTransportAssignees.ts TRAVEL_TRANSPORT_NAME_UNMATCHED
lib/dev/attentionScenarios/tier2.ts TYPO_NORMALIZED          (gallery fixture, not production)
lib/dev/attentionScenarios/tier3.ts BLOCK_DISAPPEARED        (gallery fixture, not production)
```

The hand-maintained residue lists 4. The real residue is **14 production codes**. This is
the invisible rot the row predicted, at three and a half times the size it estimated.

**A text prefilter on `ParseWarning` is unsound.** A narrower first run of probe 3 that
only loaded files whose source text contains `ParseWarning` missed
`lib/sync/enrichVenueGeocode.ts`, `lib/sync/enrichTransportAssignees.ts`, and
`lib/sync/applyStaged.ts` — they construct ParseWarning-typed object literals contextually
without ever naming the type. Any guard built on "files that mention `ParseWarning`" is
therefore already blind to three live emitters on day one.

**Cost.** The type-aware census took **382 s** on this host. That rules it out of the
default vitest lane and forces a placement decision for any type-aware guard.

### B.3 A separate live defect the probe surfaced

`warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`) filters with
`v.source === "parse_warnings.code"` — **strict equality**. Three generated codes carry a
comma-joined multi-source value and are therefore dropped by the gallery even though they
are real parse warnings:

- `MI-1_VERSION_DETECTION_FAILED` (`internal-code-enums.ts:134`)
- `PULL_SHEET_ON_ARCHIVED_TAB` (`:224`)
- `VERSION_AMBIGUOUS` (`:383`)

`PULL_SHEET_ON_ARCHIVED_TAB` was invisible because its `EXTRA_WARNING_CODES` row put it
back; `MI-1_VERSION_DETECTION_FAILED` and `VERSION_AMBIGUOUS` are simply absent from the
gallery today. (`LIVE_ROW_CONFLICT` at `:131` is also multi-source but is
`admin_alerts.code,pending_ingestions.last_error_code` — correctly excluded, and named here
because a first pass misread it as a fourth case.)
`lib/observe/query/serializeWarning.ts:29` gets this right with
`entry.source.includes("parse_warnings.code")`; `tier1.ts:140` and its test at
`tests/dev/attentionScenariosWarnings.test.ts:21` do not. This defect is independent of
the scan roots, is a one-line fix on each side, and is in scope regardless of §B.4.

### B.4 Scope decision (open)

The row is filed **Effort: S** on a premise the probes refute. Deleting
`EXTRA_WARNING_CODES` outright requires the generator to recognize ParseWarning
constructions by TYPE, not by directory-plus-regex — because the emit shapes in the live
corpus are (a) `code:` object properties, (b) positional `warn("CODE", msg)` helper calls,
and (c) object literals that never name the type. That is a different, larger change than
the row describes, and it carries a 382 s cost that needs a lane answer.

This is a scope call for the user, not for the run. It is asked after Part A ships, so
nothing waits on it.

### B.5 Blast radius, either way

`INTERNAL_CODE_ENUMS` is consumed by `tests/cross-cutting/no-raw-codes-audit.ts:91-93`
(every code becomes a forbidden literal in user-visible JSX),
`lib/observe/query/serializeWarning.ts:27-30`, and the gallery. The committed manifest is
pinned by `expect(INTERNAL_CODE_ENUMS).toEqual(extracted)`
(`tests/cross-cutting/no-raw-codes.test.ts:34`), and `pnpm test:audit:x2-no-raw-codes`
regenerates before asserting, so any generator change must be accompanied by a regenerated
manifest in the same commit. `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts`
pins that `CRON_RUN_SUMMARY` never enters the manifest — a live tripwire against widening
into `lib/cron`.

Deleting `EXTRA_WARNING_CODES` also requires rewriting
`tests/dev/attentionScenariosWarnings.test.ts:33-40`, whose
`expect(EXTRA_WARNING_CODES.length).toBeGreaterThan(0)` (`:36`) asserts the residue is
non-empty.

---

## Out of scope

- Promoting any body-defined id to a heading — ratified against on 2026-08-02.
- `BL-RESOLVED`'s `KNOWN_DANGLING` row (prose placeholder in an audit doc).
- Building a runtime module that enumerates the parse-warning universe. It is the clean
  fix for the class and it is a spec of its own, not a line in this one.
- Any UI surface. `lib/dev/attentionScenarios/**` is a data module, not a component;
  invariant 8's impeccable dual-gate is N/A for this branch.

## Verification

`pnpm vitest run tests/docs/ tests/dev/attentionScenariosWarnings.test.ts` plus
`pnpm test:audit:x2-no-raw-codes` for any Part B work. Baseline before this branch:
`tests/docs/_metaLedgerReferentialIntegrity.test.ts` + `tests/dev/attentionScenariosWarnings.test.ts`
= 29 tests passing.
