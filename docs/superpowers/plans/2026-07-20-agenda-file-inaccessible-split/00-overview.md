# Plan — Split `AGENDA_FILE_INACCESSIBLE` out of `AGENDA_PDF_UNREADABLE`

**Spec:** `docs/superpowers/specs/2026-07-20-agenda-file-inaccessible-split.md`
**Date:** 2026-07-20
**Implementer:** Opus / Claude Code
**Branch:** `feat/agenda-pdf-no-access` (worktree)

## Meta-test inventory

- **Extends:** `tests/sync/enrichAgenda.test.ts` (per-branch emit code),
  `tests/messages/agendaCodes.test.ts` (copy-content + presence),
  `tests/parser/dataGaps.test.ts` (GAP_CLASSES count 32 → 33),
  `tests/messages/warningCardCopyRegistry.ts` (triggerContext + `EXPECTED_TITLE_CHANGES`
  expectations — these are the fixture the `_metaWarningCardCopy` meta-test reads,
  so they are authored in RED, not GREEN).
- **Relies on / must stay green (no manual edit needed):** x1-catalog-parity
  (`tests/cross-cutting/codes.test.ts` — `CODE_SCENARIOS` auto-derives from
  `SPEC_CODES`, so no manual scenario edit), x2-no-raw-codes
  (`tests/cross-cutting/no-raw-codes.test.ts`), `_metaWarningCardCopy`,
  `_metaCatalogCopyHygiene`, `_metaShowScopedTemplates`,
  `_metaEmphasisRenderContract`, `codeProducers` (auto-scan).
- **No new meta-test created.** No new table/RPC/advisory-lock/admin surface.
- **Advisory-lock topology:** N/A — `pg_advisory*` not touched.

## Why one atomic commit (not per-surface)

Producer-reachability + catalog/§12.4 parity couple every surface:

- The x1 parity gate asserts `keys(MESSAGE_CATALOG) === keys(SPEC_CODES)`, so the
  catalog entry and the §12.4 row + regen must co-exist.
- `MessageCode = keyof MESSAGE_CATALOG`; a code emitted before its catalog entry,
  or a catalog entry with no producer, risks the producer-reachability scan.

So the split lands as **one commit** (the split is one logical task). TDD is
honored by writing the failing tests first *within* the task; the working tree is
only committed once every gate is green. This satisfies "one task, one commit."

## Task 1 — Split the code (one commit, TDD)

**Type:** `feat(sync)` — new parse-warning code + retitled sibling. (Touches
`lib/`, catalog, spec, tests; no `app/`, `components/`, CSS, or `DESIGN.md` — so
invariant-8 impeccable gate does NOT apply. Copy hygiene gates DO.)

### Step 1 — RED (write failing tests first)

1. `tests/sync/enrichAgenda.test.ts`: read the existing mocked-`driveClient`
   cases first, then extend/assert per branch + sub-path (spec §4.1):
   - `getFile` rejects **404** → `AGENDA_FILE_INACCESSIBLE` (branch 217).
   - `getFile` rejects **400** → `AGENDA_FILE_INACCESSIBLE` (branch 217).
   - `getFile` resolves a **non-PDF** `fileMeta` (`mimeType: "text/plain"`) →
     `AGENDA_FILE_INACCESSIBLE` (branch 254).
   - `getFile` resolves a **trashed** PDF (`trashed: true`) →
     `AGENDA_FILE_INACCESSIBLE` (branch 254).
   - `downloadFileBytes` returns `{ kind: "unavailable" }` →
     `AGENDA_FILE_INACCESSIBLE` (branch 327). Proves the `unavailable → code`
     mapping only; that `unavailable` itself subsumes media 403/404 AND byte-cap is
     already proved by `tests/drive/agendaDrive.test.ts:105` (byte-cap) and its
     404/403 siblings — do NOT duplicate a byte-cap test here.
   - valid PDF, zero sessions → `AGENDA_PDF_UNREADABLE` (branch 417).
   Assert on the returned `warnings` array (data source), not a rendered surface.
2. `tests/messages/agendaCodes.test.ts`: add `AGENDA_FILE_INACCESSIBLE` to the
   presence list; add copy-content asserts (spec §4.2) — the `/agenda document/i`
   presence/absence pair is the R1 false-embed regression guard:
   - `AGENDA_FILE_INACCESSIBLE.dougFacing` matches `/shared with us/i` AND
     `/deleted/i` AND `/too large/i` AND `/may not be able to see/i`; NONE of
     `dougFacing`/`helpfulContext`/`longExplanation` matches `/agenda document/i`;
     no field matches `/still opens/i`.
   - `AGENDA_PDF_UNREADABLE.dougFacing` matches `/no action/i` AND
     `/agenda document/i`; no field matches `/still opens/i`.
   - Both `crewFacing === null`.
3. `tests/parser/dataGaps.test.ts`: bump `toHaveLength(32)` and
   `DATA_GAP_CODES.size).toBe(32)` → `33` (and, optionally, add
   `AGENDA_FILE_INACCESSIBLE` to the "newly-counted codes" subset list).
4. `tests/messages/warningCardCopyRegistry.ts` (the `_metaWarningCardCopy` fixture
   = the expectation, authored in RED): add the `AGENDA_FILE_INACCESSIBLE`
   `triggerContext` (spec §2.1), update the `AGENDA_PDF_UNREADABLE` `triggerContext`
   (spec §2.2), and add both retitled codes to `EXPECTED_TITLE_CHANGES`.

Run the affected files (`tests/sync/enrichAgenda.test.ts`,
`tests/messages/agendaCodes.test.ts`, `tests/parser/dataGaps.test.ts`,
`tests/messages/_metaWarningCardCopy.test.ts`) → they FAIL: emit codes/copy/count
absent, and `_metaWarningCardCopy` fails because the current catalog
`triggerContext`/`title` no longer match the updated registry. Confirms the tests
bite before any production/catalog change.

### Step 2 — GREEN (implement all surfaces)

1. `lib/sync/enrichAgenda.ts`: change the three inaccessible-branch emits (near
   lines 217, 254, 327) from `AGENDA_PDF_UNREADABLE` → `AGENDA_FILE_INACCESSIBLE`,
   and update each inline `.message` to describe its branch (deleted/not-shared;
   not-a-PDF; download-failed). Leave the zero-sessions emit (near line 417) as
   `AGENDA_PDF_UNREADABLE`; update its `.message` to "no schedule found."
2. `lib/messages/catalog.ts`: add the `AGENDA_FILE_INACCESSIBLE` entry (spec §2.1),
   add it to `WARNING_CARD_COPY_CODES`, and edit the `AGENDA_PDF_UNREADABLE` entry
   to spec §2.2 (title + 4 copy fields + followUp). Match the existing followUp
   arrow glyph exactly (copy the character from a sibling row — not an em-dash).
3. `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4: add the
   `AGENDA_FILE_INACCESSIBLE` table row (line ~2918 block) + its helpfulContext
   map line (line ~3238 block); edit the `AGENDA_PDF_UNREADABLE` row's description
   + dougFacing + its helpfulContext map line. dougFacing / crewFacing / followUp /
   helpfulContext MUST be character-identical to the catalog (x1 parity compares
   them). Edit by hand; NEVER run prettier over the master spec.
4. `lib/parser/dataGaps.ts`: add `{ code: "AGENDA_FILE_INACCESSIBLE", label:
   "unopenable agenda file" }` to `GAP_CLASSES`.
   (`warningCardCopyRegistry.ts` is NOT edited here — its expectations were
   authored in RED Step 1.4; GREEN makes the catalog match them.)
5. `lib/sync/enrichWithDrivePins.ts:103` comment: update the stale mapping note
   (`unavailable = ... → AGENDA_PDF_UNREADABLE`) to reflect the new routing.
6. Regen + stage: `pnpm gen:spec-codes` (→ `spec-codes.ts`),
   `pnpm gen:internal-code-enums` (→ `internal-code-enums.ts`, discovers the new
   literal from enrichAgenda).

### Step 3 — VERIFY: the COMPLETE gate BEFORE committing

The commit is atomic, so every gate below must be green **before** Step 4 — a late
failure must never force an amend or a second commit.

```
# a) regen the two generated files and stage them
pnpm gen:spec-codes && pnpm gen:internal-code-enums

# b) targeted unit + meta + parity + producer reachability
vitest run tests/sync/enrichAgenda.test.ts tests/messages/agendaCodes.test.ts \
  tests/parser/dataGaps.test.ts \
  tests/messages/_metaWarningCardCopy.test.ts tests/messages/_metaCatalogCopyHygiene.test.ts \
  tests/messages/_metaShowScopedTemplates.test.ts tests/messages/_metaEmphasisRenderContract.test.ts \
  tests/messages/codeProducers.test.ts
pnpm test:audit:x1-catalog-parity
pnpm test:audit:x2-no-raw-codes

# c) FULL pre-push gate — the atomic commit only happens after ALL of these pass
pnpm test          # full suite (env-bound/e2e excluded per repo config)
pnpm typecheck
pnpm lint          # canonical-Tailwind + no-inline-error-strings etc.
pnpm format:check  # prettier (NEVER prettier the master spec — hand-edit its one §12.4 line)
```

If any gate is red, fix in the working tree and re-run — do not commit a partial
state.

### Step 4 — STAGE + COMMIT (one commit, only after Step 3 is fully green)

Stage exactly the intended surfaces (the whole worktree diff is this one change,
so `git add -A` is correct here; `.claude/` is gitignored), then confirm the index
holds only those surfaces before committing:

```
git add -A
git status --short   # expect ONLY: enrichAgenda.ts, catalog.ts, master spec,
                     # spec-codes.ts, internal-code-enums.ts, dataGaps.ts,
                     # warningCardCopyRegistry.ts, agendaCodes.test.ts,
                     # enrichAgenda.test.ts, dataGaps.test.ts, enrichWithDrivePins.ts,
                     # + the plan/spec docs. Nothing unexpected.
git commit --no-verify -m "feat(sync): split AGENDA_FILE_INACCESSIBLE out of AGENDA_PDF_UNREADABLE"
```

`--no-verify` is used ONLY to skip the shared lint-staged pre-commit hook (it
contends the main checkout); it does NOT waive Step 3(c), which already ran the
lint/format/typecheck/full-suite gates by hand.

## Anti-tautology / test-design notes

- Emit-code test asserts the branch→code contract on the `warnings` array (the
  data source), not a DOM render; each branch's concrete failure mode (code
  collapse / mis-route) is the thing under test.
- Copy-content asserts against catalog entry fields directly; regexes encode the
  behavioral contract (names both causes; drops the misleading clause), not a
  golden string.
- dataGaps count is derived-truth (registry length), updated in lockstep with the
  registry edit; boundary is exact (32 → 33).
