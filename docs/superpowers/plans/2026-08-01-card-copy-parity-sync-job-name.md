# Card-copy parity + Auto sync name — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the §4.2 `helpfulContext` column against the catalog for all 44 warning-card codes, and unify the sync job's Doug-facing name to "Auto sync", per spec `docs/superpowers/specs/2026-08-01-card-copy-parity-sync-job-name.md` (APPROVEd, Codex r3).

**Architecture:** Copy/registry-only branch. Three commits: (1) Part A — canonical-table reconcile + full `EXPECTED_HELPFUL_CONTEXT` back-fill; (2) Part B — "Auto sync" rename with §12.4 three-way lockstep; (3) backlog graduation for both entries. No DB, no UI files, no new runtime code paths.

**Tech Stack:** Vitest, tsx, `pnpm gen:spec-codes`, existing meta-tests.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-08-01-card-copy-parity-sync-job-name.md`; its §1.1 decisions are ratified — do not reopen.
- Unified name literal: `Auto sync` (capital A, lowercase s) in visible copy; `auto sync` in the explainer's lowercased `data-text` mirrors.
- Commit per task, `--no-verify`, conventional commits.
- Banned vocabulary + em-dash rules apply to every edited copy string (`tests/messages/_metaWarningCardCopy.test.ts` BANNED regex; §12.4 copy conventions). All new strings below reuse shipped vocabulary and straight apostrophes.
- Worktree: `/Users/ericweiss/FX-worktrees/card-copy-parity-sync-job-names` (branch `feat/card-copy-parity-sync-job-names`). All paths below relative to it.
- Meta-test inventory (writing-plans rule): this branch EXTENDS `tests/messages/_metaWarningCardCopy.test.ts` (key-set completeness assertion) and `tests/docs/_metaDeferralLedgerGraduation.test.ts` (two `BACKLOG_GRADUATED` rows). No other registry applies: no Supabase call sites, no admin mutations, no advisory locks (`pg_advisory` untouched), no tiles/sentinels.
- No new test files → no `testMatch`/workflow wiring changes needed (all edited tests already run in the unit suite).

---

### Task 1: Part A — freeze helpfulContext for all 44 rows

**Files:**
- Modify: `tests/messages/warningCardCopyRegistry.ts` (EXPECTED_HELPFUL_CONTEXT + its doc comment)
- Modify: `tests/messages/_metaWarningCardCopy.test.ts` (header comment, row parser, key-set assertion, two scoping comments)
- Modify: `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` (§4.2 rows 12, 29, 40; stale counts at ~55/~105/~166; freeze-scope UPDATE notes)

**Interfaces:**
- Produces: `EXPECTED_HELPFUL_CONTEXT` covering exactly the 44 codes of `WARNING_CARD_COPY_CODES`; doc-reading test resolving suffixed rows via first-token match. Task 3 relies on nothing from this task except the commit existing.

- [ ] **Step 1: Back-fill the registry (test-side edits first — this is the failing-test half)**

Generate the 42 missing entries from the catalog (source of truth per spec §1.1) with this throwaway script, run from the worktree root:

```bash
pnpm exec tsx -e '
import { MESSAGE_CATALOG } from "./lib/messages/catalog";
import { WARNING_CARD_COPY_CODES, EXPECTED_HELPFUL_CONTEXT } from "./tests/messages/warningCardCopyRegistry";
const C = MESSAGE_CATALOG as Record<string, Record<string, unknown>>;
for (const code of [...WARNING_CARD_COPY_CODES].sort()) {
  console.log(`  ${code}:\n    ${JSON.stringify(C[code]!.helpfulContext)},`);
}
'
```

Replace the body of `EXPECTED_HELPFUL_CONTEXT` in `tests/messages/warningCardCopyRegistry.ts` with the full 44-entry output (sorted; the two existing entries `HOTEL_INLINE_GROUP_OWN_HOTEL` / `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` are included by the script and must come out byte-identical to what is there today — verify with `git diff`, their lines must not change). Replace the map's doc comment (lines 132-139) with:

```ts
/**
 * Frozen `helpfulContext` for EVERY registry code: the spec-§4.2 row and the
 * catalog entry are held in lockstep for the whole table (spec
 * 2026-08-01-card-copy-parity-sync-job-name §2). A typo in either the
 * canonical row or the catalog entry fails the gate, and the key-set
 * assertion in _metaWarningCardCopy keeps this map total over
 * WARNING_CARD_COPY_CODES.
 */
```

- [ ] **Step 2: Update the meta-test**

In `tests/messages/_metaWarningCardCopy.test.ts`:

(a) Header comment lines 4-16: replace the partial-coverage sentences. New header paragraph (keep the untyped-Record note that follows it):

```ts
// Structural meta-test for warning-card copy: every registry code carries a
// title + condensed helpfulContext (inline card guidance) + triggerContext
// (? popover), within caps, free of reader-facing jargon. Byte-identity to the
// spec §4.2 table is frozen for triggerContext AND helpfulContext on EVERY
// registry code (rows 1-42 back-filled by spec
// 2026-08-01-card-copy-parity-sync-job-name; BL-CARD-COPY-HELPFULCONTEXT-PARITY
// graduated), and for the six changed titles. The corpus oracle parses the
// committed fixture corpus and requires every emitted warn-severity code to be
// registered, behavioral fails-by-default for corpus-exercised parser codes
// (spec §3.5.4 scope: sync/enrichment producers rely on the AGENTS.md
// new-code checklist instead; a code slipping both layers renders today's
// title-only card, never a raw code).
```

(b) In the doc-reading test, change the row lookup line

```ts
        .find((l) => l.startsWith("| ") && l.split("|")[2]?.trim() === code);
```

to

```ts
        .find((l) => l.startsWith("| ") && l.split("|")[2]?.trim().split(/\s/)[0] === code);
```

and replace that test's scoping comment (the "Scoped to EXPECTED_HELPFUL_CONTEXT's codes…" sentence) with `// Covers every registry code: EXPECTED_HELPFUL_CONTEXT is total (see key-set assertion below).`

(c) Replace the "frozen copy fixture: helpfulContext" test's scoping comment (lines 121-124) with the same one-liner, and add inside that test, before the loop:

```ts
    expect(Object.keys(EXPECTED_HELPFUL_CONTEXT).sort()).toEqual(
      [...WARNING_CARD_COPY_CODES].sort(),
    );
```

Failure mode this catches: a future code added to `WARNING_CARD_COPY_CODES` without a frozen `helpfulContext` row — previously the freeze silently didn't cover it.

- [ ] **Step 3: Run to verify the red state**

Run: `pnpm exec vitest run tests/messages/_metaWarningCardCopy.test.ts`
Expected: FAIL. The doc-reading test uses hard assertions in a loop, so it stops at the FIRST mismatch: with the sorted registry that is `AGENDA_PDF_UNREADABLE §4.2 helpfulContext` (the "frozen copy fixture: helpfulContext" test fails fast the same way). The full divergence census (two codes × two fields each) was established by the spec §2.1 probe, not by this red run. If the first failure names any code other than `AGENDA_PDF_UNREADABLE` or `HOTEL_GUEST_SPLIT_AMBIGUOUS`, STOP — the catalog moved since 2026-08-01. Quote the red output in the task log.

- [ ] **Step 4: Reconcile the canonical document (implementation half)**

In `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md`:

(a) Row 12 (line ~132): replace the two copy cells so the row reads

```
| 12 | HOTEL_GUEST_SPLIT_AMBIGUOUS | A hotel line could be read more than one way, so we made a judgment call. Check who is on the reservation in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out. | Appears when a hotel line could be read more than one way. |
```

(b) Row 29 (line ~149): replace the whole row with

```
| 29 | AGENDA_PDF_UNREADABLE — title: **"No agenda schedule found"** (retitled by the AGENDA_FILE_INACCESSIBLE split) | We opened the agenda PDF but couldn't find a day-by-day schedule in it, so crew see the agenda document only. Nothing is broken; no action is needed unless it should include a readable schedule. | Appears when the agenda PDF opens fine but we couldn't find a schedule in it. |
```

(c) Row 40 (line ~160): code cell only, `AGENDA_FILE_INACCESSIBLE` becomes `AGENDA_FILE_INACCESSIBLE — title: **"Can't open the agenda file"** (retitled by the same split)` — copy cells unchanged.

(d) Line ~55 comment `// rows 10, 21, 26, 36` becomes `// rows 10, 21, 26, 29, 36, 40 (29 + 40 markers added 2026-08-01)`.

(e) Line ~105, sentence "…and the four changed titles copied byte-for-byte from §4.2…" becomes "…and the six changed titles copied byte-for-byte from §4.2…"; then replace the two sentences from "Rows 1-42 stay unfrozen" through "rather than retroactively frozen." with: `UPDATE 2026-08-01 (spec 2026-08-01-card-copy-parity-sync-job-name): EXPECTED_HELPFUL_CONTEXT now covers every row — rows 1-42 were back-filled after reconciling rows 12 and 29 to the shipped catalog (both had drifted via ratified later commits), and BL-CARD-COPY-HELPFULCONTEXT-PARITY graduated.`

(f) Line ~166 sentence becomes: `Existing title values stay for all codes except rows 10, 21, 26 (null today, newly authored), row 36 (retitled away from jargon), and — via the later AGENDA_FILE_INACCESSIBLE split, markers back-filled 2026-08-01 — rows 29 and 40.`

Line ~210's "the four title changes" stays (historical narrative of the 2026-07-20 commit — ratified in the new spec §2.3-1a).

- [ ] **Step 5: Run to verify green**

Run: `pnpm exec vitest run tests/messages/_metaWarningCardCopy.test.ts tests/messages/popoverContextCopy.test.ts`
Expected: PASS (all tests; popoverContextCopy is untouched by Part A and proves no collateral).

- [ ] **Step 6: Commit**

```bash
git add tests/messages/warningCardCopyRegistry.ts tests/messages/_metaWarningCardCopy.test.ts docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md
git commit --no-verify -m "test(messages): freeze §4.2 helpfulContext byte-parity for all 44 warning-card codes"
```

---

### Task 2: Part B — unify the sync-job name to "Auto sync"

**Files:**
- Modify: `tests/messages/popoverContextCopy.test.ts:30` (pinned WATCH_CHANNEL_ORPHANED string)
- Modify: `tests/app/admin/telemetryPage.test.tsx:76` (pinned label)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (7 prose sites)
- Modify: `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes` only — never by hand)
- Modify: `lib/messages/catalog.ts` (6 codes)
- Modify: `lib/cron/runSummary.ts:34`
- Modify: `docs/alerts/admin-alert-system-explainer.html` (4 lines)

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: the literal `"Auto sync"` as `CRON_JOBS[0].label` (read by `app/admin/dev/telemetry/page.tsx` at render; no signature change).

- [ ] **Step 1: Update the two pinned tests to the NEW strings (failing-test half)**

`tests/messages/popoverContextCopy.test.ts:30` — replace the pinned string with:

```
"At worst, edits take a few minutes to appear instead of instantly, since Auto sync still runs. It keeps trying to reconnect on its own, waiting longer between attempts the longer it fails, or use Retry now. Only worth attention if it keeps failing."
```

`tests/app/admin/telemetryPage.test.tsx:76` — `label: "Sheet sync",` becomes `label: "Auto sync",`. NOTE: this line is mocked input (`loadCronHealth` is mocked; no assertion reads the label), so this edit alone produces no red — it is a consistency edit. The genuine label pin is a NEW assertion added to the same file (data-source assertion against the real registry, not the mock — anti-tautology rule; the concrete failure mode it catches is the registry label regressing to any non-unified name while all mocks stay green):

```ts
import { CRON_JOBS } from "@/lib/cron/runSummary";
```

and a new top-level test alongside the existing ones:

```ts
it("the sync job's registry label is the unified name (BL-SYNC-JOB-FOUR-NAMES)", () => {
  expect(CRON_JOBS.find((j) => j.jobName === "sync")?.label).toBe("Auto sync");
});
```

- [ ] **Step 2: Run to verify red**

Run: `pnpm exec vitest run tests/messages/popoverContextCopy.test.ts tests/app/admin/telemetryPage.test.tsx`
Expected: FAIL on both files — popoverContextCopy on the pinned WATCH_CHANNEL_ORPHANED string (old copy still shipped), telemetryPage on the new registry-label assertion (`CRON_JOBS` still says "Sheet sync"). Quote output.

- [ ] **Step 3: Master spec §12.4 edits (7 sites)**

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, apply exactly these phrase replacements (verify each with grep before editing; anchors are unique):

1. `SYNC_DELAYED_SEVERE` table row (~2990): `Instant updates or the scheduled sync have stalled.` → `Instant updates or Auto sync has stalled.`
2. `SYNC_STALLED` table row (~2993), dougFacing cell only (NOT the trigger-condition cell "scheduled sync heartbeat…"): `Automatic syncing hasn't run in over an hour,` → `Auto sync hasn't run in over an hour,`
3. `STAGED_PARSE_SUPERSEDED:` appendix entry (~3139): `(probably by a different admin or an automatic sync)` → `(probably by a different admin or Auto sync)`
4. `SYNC_DELAYED_SEVERE:` appendix entry (~3189): `whether instant updates are healthy and whether automatic sync is running.` → `whether instant updates are healthy and whether Auto sync is running.`
5. `NO_FOLDER_CONFIGURED:` appendix entry (~3193): `The automatic sync ran before the setup wizard saved a watched Drive folder.` → `Auto sync ran before the setup wizard saved a watched Drive folder.`
6. `MISSING_PENDING_INGESTION_MODTIME:` appendix entry (~3231): `so the scheduled sync knows when to resume processing.` → `so Auto sync knows when to resume processing.`
7. `WATCH_CHANNEL_ORPHANED:` appendix entry (~3347): `since the scheduled sync still runs.` → `since Auto sync still runs.`

- [ ] **Step 4: Regenerate spec-codes**

Run: `pnpm gen:spec-codes`
Expected: `lib/messages/__generated__/spec-codes.ts` diff shows exactly seven changed string fields across six codes — `WATCH_CHANNEL_ORPHANED.helpfulContext`, `STAGED_PARSE_SUPERSEDED.helpfulContext`, `NO_FOLDER_CONFIGURED.helpfulContext`, `MISSING_PENDING_INGESTION_MODTIME.helpfulContext`, `SYNC_DELAYED_SEVERE.dougFacing`, `SYNC_DELAYED_SEVERE.helpfulContext`, `SYNC_STALLED.dougFacing`. `git diff --stat lib/messages/__generated__/` = 1 file.

- [ ] **Step 5: Catalog + label + explainer edits**

`lib/messages/catalog.ts` — same phrase replacements as Step 3 on each code's `dougFacing`/`helpfulContext`, PLUS the `longExplanation` mirrors that carry the same phrases:

- `WATCH_CHANNEL_ORPHANED.helpfulContext` (~366)
- `STAGED_PARSE_SUPERSEDED.helpfulContext` (~693) + `.longExplanation` (~696)
- `NO_FOLDER_CONFIGURED.helpfulContext` (~829) + `.longExplanation` (~832)
- `MISSING_PENDING_INGESTION_MODTIME.helpfulContext` (~2346) + `.longExplanation` (~2349)
- `SYNC_DELAYED_SEVERE.dougFacing` (~2442), `.helpfulContext` (~2446), `.longExplanation` (~2449)
- `SYNC_STALLED.dougFacing` (~2458)

`lib/cron/runSummary.ts:34`: `label: "Sheet sync",` → `label: "Auto sync",`.

`docs/alerts/admin-alert-system-explainer.html`:
- line ~927 (`data-text`, lowercase): `the scheduled sync` → `auto sync` (keep surrounding words: `since the scheduled sync still runs` → `since auto sync still runs`)
- line ~936 (visible): `since the scheduled sync still runs` → `since Auto sync still runs`
- line ~1051 (`data-text`, lowercase): `automatic syncing hasn't run in over an hour` → `auto sync hasn't run in over an hour`
- line ~1059 (visible): `Automatic syncing hasn't run in over an hour` → `Auto sync hasn't run in over an hour`

- [ ] **Step 6: Run to verify green + lockstep gate**

Run: `pnpm test:audit:x1-catalog-parity && pnpm exec vitest run tests/messages tests/app/admin/telemetryPage.test.tsx tests/api/cron-sync.test.ts`
Expected: PASS. Then the acceptance-criterion-3 sweep, two scopes (authored and RUN at plan time, 2026-08-01; the regex uses bare `automatic sync`, which also substring-matches `automatic syncing`):

Scope 1 — copy surfaces, expect ZERO hits (pre-edit baseline was 16: 11 catalog fields + 1 runSummary label + 4 explainer lines, every one edited by this task):

```bash
rg -n -i "sheet sync|scheduled sync|automatic sync" lib/messages/catalog.ts lib/cron/runSummary.ts docs/alerts/admin-alert-system-explainer.html components/
```

Scope 2 — `app/` tree, expect EXACTLY these four survivor lines, all ratified out-of-scope in spec §1.1 (per-hit disposition: 1 = onboarding-help verb gerund pinned by `tests/help/page-onboarding-wizard.test.tsx:64`; 2-4 = code comments, not user-visible copy):

```bash
rg -n -i "sheet sync|scheduled sync|automatic sync" app/
# app/help/admin/onboarding-wizard/page.mdx:117   (verb phrase "starts automatic syncing of the folder")
# app/api/cron/sync/route.ts:10                   (comment)
# app/admin/show/[slug]/_actions/useRaw.ts:158    (comment)
# app/admin/show/[slug]/_actions/useRaw.ts:188    (comment)
```

Any hit outside these four is a missed rename site — fix before committing. (`lib/messages/__generated__/spec-codes.ts` is deliberately outside both scopes; it regenerates from the already-edited spec and is proven by the x1 gate instead.)

- [ ] **Step 7: Commit**

```bash
git add tests/messages/popoverContextCopy.test.ts tests/app/admin/telemetryPage.test.tsx docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts lib/cron/runSummary.ts docs/alerts/admin-alert-system-explainer.html
git commit --no-verify -m "fix(messages): unify the sync job's Doug-facing name to Auto sync (§12.4 lockstep)"
```

---

### Task 3: Graduate both backlog entries

**Files:**
- Modify: `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED`)
- Modify: `BACKLOG.md` (remove both entries; prepend reconciled note)
- Modify: `BACKLOG-archive.md` (add both archived sections)

**Interfaces:** consumes the two prior commits' existence (graduation claims cite them); produces nothing downstream.

- [ ] **Step 1: Register both ids (failing-test half)**

Append to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts`:

```ts
  // feat/card-copy-parity-sync-job-names (2026-08-01): §4.2 helpfulContext
  // byte-parity frozen for all 44 registry codes (rows 1-42 back-filled), and
  // the sync job's Doug-facing name unified to "Auto sync" across the catalog,
  // runSummary label, and the explainer mirror (§12.4 three-way lockstep).
  { id: "BL-CARD-COPY-HELPFULCONTEXT-PARITY", provenance: "feat/card-copy-parity-sync-job-names" },
  { id: "BL-SYNC-JOB-FOUR-NAMES", provenance: "feat/card-copy-parity-sync-job-names" },
```

- [ ] **Step 2: Run to verify red**

Run: `pnpm exec vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: FAIL — both ids registered but absent from `BACKLOG-archive.md` (and still present in `BACKLOG.md`). Quote output.

- [ ] **Step 3: Move the entries**

Cut the full `## BL-SYNC-JOB-FOUR-NAMES` (BACKLOG.md ~240) and `## BL-CARD-COPY-HELPFULCONTEXT-PARITY` (~719) sections from `BACKLOG.md`. Append both to `BACKLOG-archive.md` following its existing archived-section format, keeping the original heading + body and adding this closing status line inside each section (branch string verbatim — the meta-test asserts the section contains the provenance):

- under BL-CARD-COPY-HELPFULCONTEXT-PARITY: `**CLOSED 2026-08-01** — resolved on feat/card-copy-parity-sync-job-names (spec 2026-08-01-card-copy-parity-sync-job-name): §4.2 rows 12/29 reconciled to the shipped catalog and EXPECTED_HELPFUL_CONTEXT back-filled to all 44 codes with a key-set completeness assertion.`
- under BL-SYNC-JOB-FOUR-NAMES: `**CLOSED 2026-08-01** — resolved on feat/card-copy-parity-sync-job-names (spec 2026-08-01-card-copy-parity-sync-job-name): one name, "Auto sync" — six catalog codes via §12.4 three-way lockstep, the runSummary label, and the explainer mirror; the StagedReviewCard badge already read "Auto sync" and is unchanged.`

In `BACKLOG.md`, edit the existing `Last reconciled:` line (line 7): insert at its head `Last reconciled: 2026-08-01 — feat/card-copy-parity-sync-job-names graduated BL-CARD-COPY-HELPFULCONTEXT-PARITY (§4.2 helpfulContext frozen for all 44 rows after reconciling rows 12/29 to the shipped catalog) and BL-SYNC-JOB-FOUR-NAMES (one name: "Auto sync" — catalog x6 codes with §12.4 lockstep, runSummary label, explainer mirror; StagedReviewCard badge unchanged). Prior: ` and demote the line's previous `Last reconciled: 2026-08-01 — ` prefix to `2026-08-01 — ` so the existing history chain reads on unbroken.

- [ ] **Step 4: Run to verify green**

Run: `pnpm exec vitest run tests/docs/`
Expected: PASS (graduation guard + ledger walker + invariant-8 closeout meta-test all green).

- [ ] **Step 5: Commit**

```bash
git add tests/docs/_metaDeferralLedgerGraduation.test.ts BACKLOG.md BACKLOG-archive.md
git commit --no-verify -m "docs(plan): graduate BL-CARD-COPY-HELPFULCONTEXT-PARITY + BL-SYNC-JOB-FOUR-NAMES"
```

---

### Task 4: Close-out verification

**Files:** none new (deletes the untracked probe script if still present).

- [ ] **Step 1: Full suite**

Run: `rm -f scripts/tmp-parity-probe.ts && pnpm test 2>&1 | tail -20`
Expected: full unit suite green (loopback-guarded DB tests may skip per preflight warning — skips are not failures).

- [ ] **Step 2: Acceptance sweep (spec §5)**

Re-run both Task 2 Step 6 sweeps (Scope 1 zero hits; Scope 2 exactly the four ratified survivors) and `pnpm exec tsx`-check that `EXPECTED_HELPFUL_CONTEXT` has 44 keys:

```bash
pnpm exec tsx -e 'import { EXPECTED_HELPFUL_CONTEXT } from "./tests/messages/warningCardCopyRegistry"; console.log(Object.keys(EXPECTED_HELPFUL_CONTEXT).length)'
```

Expected: `44`.

- [ ] **Step 3: Proceed to whole-diff cross-model review** (pipeline Stage 4 — not a commit step).

---

## 12. Close-out

impeccable-gate: N/A — no UI surface

No file under `app/` (non-api), `components/`, `app/globals.css` `@theme`, `tailwind.config.*`, or `DESIGN.md` is modified by this plan; `/impeccable critique` and `/impeccable audit` are therefore not required (invariant 8 N/A form).
