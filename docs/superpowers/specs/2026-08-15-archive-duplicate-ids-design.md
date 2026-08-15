# Archive duplicate entry ids — de-duplicate and guard

**Date:** 2026-08-15 · **Authoring branch:** `docs/archive-dup-ids-spec` · **Implementation branch:** `chore/archive-duplicate-ids` · **Entry:** `BL-ARCHIVE-DUPLICATE-ENTRY-IDS` (BACKLOG.md) · **Status:** spec-APPROVED (codex-guard R7, 2026-08-15; R1-R6 findings repaired in-branch)

## §0 Why, and what the probe actually found

The entry reports 35 ids appearing twice in `BACKLOG-archive.md` and attributes them to
union-merge artifacts. The count reproduces exactly, but the attribution is refuted by
inspection, and the correction changes the repair from "delete one copy of each" to a
heading-grammar normalization.

**Probe (2026-08-15, branch base `fafa354ac`, transcript committed at
`docs/superpowers/plans/2026-08-15-archive-duplicate-ids/dup-census-2026-08-15.txt`).**
Three passes, all committed with the script beside the transcript:

1. The entry's own pipeline (`grep -oE '^#{2,3} (BL|DEF)-[A-Z0-9-]+' BACKLOG-archive.md |
   sed -E 's/^#+ //' | sort | uniq -d | wc -l`) → **35**, matching the filing.
2. A pairwise body diff of all 35 pairs → **zero verbatim or near-verbatim pairs**
   (best similarity ratio 0.12). Every pair is one TINY section (2–6 lines) plus one
   full entry — not two copies of anything.
3. A walker-grounded census (`extractEntries` from `tests/docs/_ledgerMdast.ts`, the
   ratified ledger grammar, run over every file `ledgerFiles()` discovers —
   `scripts/lib/ledger-fields.ts:96`) → 35 duplicate ids in `BACKLOG-archive.md` at
   the family's levels, 2 in `DEFERRED-archive.md` at the family's own levels, **4
   more** in `DEFERRED-archive.md` visible only when the scan spans levels 2 AND 3,
   **2 more** in `BACKLOG-archive.md` visible only at the all-depth scan (`###`
   terminal record + `####` preserved original — surfaced by the R5 F1 probe after
   R4 widened the scan; live proof the depth-typo shape exists in the corpus), and
   **0** in `BACKLOG.md` / `DEFERRED.md`. Repair set: **43 pairs** (37 + 6).

**The real mechanism is the archive's own resolution convention, not union merges.**
Each duplicated id is one entry written in two parts: a terminal record heading
(`## BL-X — RESOLVED (2026-08-03, fix/branch)`, or a `DEMOTED …` / `GRADUATED …`
preamble) followed by the preserved original entry carrying its own id-bearing heading
(`### BL-X — original title`). Both headings mint the same id, so every
heading-extraction pipeline counts the entry twice. 42 of the 43 pairs put the terminal
record first; `USE-RAW-FULL-LIST-1` puts it second (two dated sections, the later one
`✅ RESOLVED`). The union-merge RISK the entry describes is real — a union resolution
CAN duplicate a whole entry — but zero of the current 43 pairs is one, and the shipped
guard catches that class too by construction (two identical headings collide the same
way two convention headings do).

**Why nothing caught it** (entry's diagnosis, confirmed): `ledgerIds()` returns a `Set`
(`tests/docs/_ledgerMdast.ts:426`), so within-file duplicates are invisible by
construction to `tests/docs/_metaDeferralLedgerGraduation.test.ts`'s cross-file checks.

## §1.1 Resolved scope — do not relitigate

1. **The entry's fix is ratified by the entry itself** (BACKLOG.md, "**Fix:** de-duplicate
   the 35, then add the within-file uniqueness assertion to the graduation meta-test"):
   repair the pairs, then guard. The G2 scope brief re-ratifies both halves and the two
   traps (span `^#{2,3}` levels; anchor to headings, never substrings).
2. **The mechanism correction is probe-settled, not arguable.** Pass 2 above measured
   zero verbatim pairs; a reviewer proposing "just delete the second copy" is arguing
   against a committed diff table. The de-dup is a heading demotion, not a deletion —
   no body text is removed anywhere in this arc.
3. **Repair direction: the terminal record keeps the id-bearing heading; the preserved
   original's heading is demoted to a bold paragraph line** with identical text
   (`### BL-X — title` → `**BL-X — title**`). Rationale: the surviving heading is the
   one the graduation suite's provenance assertions anchor
   (`^#{2,3} ~{0,2}${id}` first match, `_metaDeferralLedgerGraduation.test.ts:633`), and
   post-demotion each provenance section only GROWS (it previously CUT at the duplicate
   heading), so every existing assertion is preserved or strengthened. A bold paragraph
   mints nothing: heading lanes see headings only, and body-defined-id minting requires
   a bold LIST-ITEM lead (`tests/docs/_ledgerMdast.ts:360-375`), not a paragraph.
4. **Guard placement:** `tests/docs/_metaDeferralLedgerGraduation.test.ts`, per the
   entry. Inspected and confirmed right: that suite already owns the ledger-pair
   invariants, the per-family `ExtractOpts`, and the executable-plants pattern the new
   lane reuses. File discovery via `ledgerFiles()` with per-file opts from `optsFor()`
   (`scripts/lib/ledger-fields.ts:82` — the registry-held grammar, not a re-derived
   filename match), so a newly REGISTERED ledger family's file pair is covered by
   default (the in-progress meta-test's pattern,
   `tests/docs/_metaLedgerInProgress.test.ts:241`). Discovery reaches exactly the
   registered families' base and archive files
   (`LEDGER_FAMILIES`, `scripts/lib/ledger-fields.ts:47`); an UNREGISTERED
   ledger-shaped sibling is `unregisteredLedgerFiles`' complaint surface and out of
   this lane's domain (spec R1 F3).
5. **Guard domain (the "CI" decision):** an id is IN DOMAIN only if it appears at its
   family's ratified entry levels (BACKLOG `##`/`###` with `BL-` prefix; DEFERRED `###`,
   any SHOUTY id). The collision SCAN spans EVERY heading depth (1-6) with the
   family's prefix rule (spec R4 F1, superseding R2 F1's union form: a duplicate
   parked at ANY depth — including a one-character `####` typo — collides with an
   in-domain id; the domain rule alone decides which ids are checked, so the wider
   scan adds no false-positive surface beyond what the family grammar already
   tolerates), so a level-2
   terminal stub shadowing a level-3 DEFERRED entry is caught (the four `PSQL-`/
   `NEWTAB-`/`DESTRUCT-` pairs), while the two `## CI …` prose section headings —
   which mint the token `CI` at level 2 only — are out of domain and can never false-
   positive. This derives the accept-set from the walker's ratified grammar instead of
   authoring a second recognizer.
6. **Archives may be edited for this purpose.** The entry mandates de-duplicating the
   archive; the edit is structural (heading marks), with every word preserved. Where a
   preamble sentence claims verbatim preservation in ANY spelling — "follows
   verbatim", "Entry preserved verbatim below", and peers (R6 F2: the clause keys on
   the verbatim CLAIM, not one phrase) — the impl appends
   "(heading demoted to a bold line; see BL-ARCHIVE-DUPLICATE-ENTRY-IDS)" in the same
   commit so the prose stays true.
7. **Autonomy:** user grant 2026-08-15 — both user review gates WAIVED; Fable authors,
   a fresh Opus pane implements from `HANDOFF.md`.
8. **No convention redesign beyond this entry.** Future archive moves simply stop
   duplicating the id in the preserved heading (the demoted-bold form is the new
   convention, stated in §2.3); the guard makes the old form fail CI by name.

## §2 Contract

### §2.1 The repair (43 pairs, one mechanical rule)

For each pair below, the NON-SURVIVING heading line is rewritten in place from
`#{2,4} <text>` to `**<text>**` (exact text preserved; the depth range spans every
live demotion target — the two R5 F1 targets are `####`, R6 F1). No other body
change, except the §1.1.6 verbatim-preamble annotations. Line numbers are drafting-time locators
at base `fafa354ac`; the impl re-derives them from the guard's own RED output.

`BACKLOG-archive.md` — 37 pairs, all keep-FIRST (terminal record first; the last
two rows are the `###`/`####` shape the all-depth scan surfaced, R5 F1):

| Id | Terminal heading (kept) | Original heading (demoted) |
|---|---|---|
| BL-RATE-LIMIT-SNAPSHOT-DURABILITY | 2582 | 2611 |
| BL-LEDGER-MDAST-SHARED-HOME | 2623 | 2659 |
| BL-AGENDA-PERLINK-COMPLETENESS | 2674 | 2708 |
| BL-FITWITHINCLIP-CLIP-SCROLL-STALE | 2728 | 2770 |
| BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP | 2817 | 2850 |
| BL-IDENTITYLINK-LANDED-VS-REQUESTED | 2860 | 2893 |
| BL-UNDO-SELECTIONS-RESET-AT-DROP | 2903 | 2935 |
| BL-ADMIN-NOJS-LOADING-CONFLICT | 2984 | 2986 |
| BL-MODAL-REALTIME-UPDATED-CUE | 3067 | 3075 |
| BL-ONBOARDING-CAS-SOURCE-ANCHORS | 3085 | 3087 |
| BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT | 3117 | 3119 |
| BL-ADMIN-PARSEPANEL-ORPHANED | 3125 | 3127 |
| BL-HELP-STRIP-COPYLINK-STALE | 3131 | 3133 |
| BL-UNPUBLISH-TO-HELD | 3141 | 3143 |
| BL-VERSION-AMBIGUOUS-V1-OVERRIDE | 3153 | 3155 |
| BL-CI-STATIC-ENV-INJECTION | 3383 | 3387 |
| BL-DANGLING-CITATIONS-RETIRED-WORKFLOW | 3399 | 3401 |
| BL-MASTERSPEC-FINANCIALS-VOCAB | 3429 | 3431 |
| BL-SOUND-REDIRECT-GUARD | 3439 | 3443 |
| BL-CI-GITHUB-ENV-CROSS-STEP-STATE | 3453 | 3457 |
| BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION | 3465 | 3469 |
| BL-LEDGER-GUARD-MDAST-REWRITE | 3487 | 3491 |
| BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE | 4870 | 4874 |
| BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP | 4880 | 4884 |
| BL-INVARIANT8-CLOSEOUT-ENFORCEMENT | 5117 | 5123 |
| BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS | 5250 | 5254 |
| BL-ATTENTION-MENU-PANEL-CLIP | 5266 | 5270 |
| BL-PUBLISHED-TOGGLE-OVERLAY-CLIP | 5282 | 5286 |
| BL-SHAREHUB-CONFIRM-NAMES-SHOW | 5294 | 5298 |
| BL-SHAREHUB-OPEN-TIMER-LEAK | 5310 | 5314 |
| BL-POPOVER-SHARED-RAF-COALESCER | 5324 | 5328 |
| BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE | 5590 | 5602 |
| BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE | 5617 | 5625 |
| BL-KNOWN-SECTIONS-WALKER | 5639 | 5654 |
| BL-NEEDS-ATTENTION-HOLDS-ROLLUP | 5973 | 5975 |
| BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK | 5481 | 5488 |
| BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND | 5664 | 5688 |

Pair notes, verified by reading both bodies: `BL-INVARIANT8-CLOSEOUT-ENFORCEMENT`'s
terminal verdict sits in its first record's BODY (`**Graduated:** 2026-08-01 …`) rather
than its heading, and the record itself labels the second copy "Original entry
(provenance):" — keep-first is the record's own stated structure. The two
`###`/`####` pairs (R5 F1) both carry the terminal word in the first heading
(`RESOLVED before the 2026-08-02 merge…`; `RESOLVED (2026-08-03, …)`). Every other
first heading carries it in the heading line itself.

`DEFERRED-archive.md` — 6 pairs:

| Id | Kept | Demoted | Direction |
|---|---|---|---|
| NEWTAB-GUARD-UNDECIDABLE-2 | 380 | 412 | keep first (`DEMOTED TO A RATIFIED LIMIT 2026-08-04`) |
| DESTRUCT-ARM-ANNOUNCE-1 | 448 | 470 | keep first (`GRADUATED 2026-08-04`) |
| PSQL-GUARD-RECALL-RESIDUAL | 478 | 507 | keep first (`DEMOTED TO A DOCUMENTED LIMIT 2026-08-04`) |
| PSQL-STARTUP-FILE-NO-X-CLASSWIDE | 541 | 587 | keep first (`GRADUATED 2026-08-03`) |
| USE-RAW-FULL-LIST-1 | 1905 | 1763 | **keep second** — the line-1905 record carries `✅ RESOLVED` (2026-07-17 demotion branch); line 1763 is the original 2026-07-16 deferral record among its `-2`/`-3` siblings |
| CASP-2 | 1807 | 1818 | keep first (`✅ RESOLVED`; the demoted heading sits inside the entry's own `<details>` fold — mdast still parses it as a heading, which is why it collides) |

The four keep-first DEFERRED pairs are the `##` stub + `###` original convention —
invisible to `DEFERRED_OPTS` levels `[3]` alone, which is exactly the entry's trap 1.

### §2.2 The guard

One new `describe` block in `tests/docs/_metaDeferralLedgerGraduation.test.ts`:

- **Discovery:** `ledgerFiles(ROOT)` (`scripts/lib/ledger-fields.ts:96`) — every file
  of every REGISTERED family, no enumerated file list; a family added to
  `LEDGER_FAMILIES` brings its pair into the lane by default.
- **Extraction:** `extractEntries` with the file's family opts from `optsFor(file)`
  (`scripts/lib/ledger-fields.ts:82`; resolves to the same
  `{ requirePrefix: "BL-", levels: [2, 3] }` / `{ requirePrefix: null, levels: [3] }`
  values the suite already holds) for the DOMAIN pass, and a second SCAN pass at
  `levels: [1, 2, 3, 4, 5, 6]` — every mdast heading depth — with the family's
  prefix rule (spec R4 F1: any-depth collisions, including depth typos, are in
  scan range; the DOMAIN pass alone bounds which ids are judged).
- **Offender rule:** an id is reported when it is in domain (appears at the family's
  ratified levels) AND the scan finds it on more than one heading. Failure message
  names file, id, and heading lines.
- **Executable plants** (the suite's r21 pattern — synthetic text through
  `extractEntries`, unconditional execution, `tests/_shared/premise.ts` where a fixture
  premise is load-bearing). Fire rows: same-level duplicate (`## BL-X` twice);
  cross-level duplicate (`## BL-X` + `### BL-X`); DEFERRED `##` stub + `###` original;
  a synthetic family registered at `levels: [4]` with two `#### FUT-1` headings,
  proving a non-default-level family fires (spec R3 F2); a BACKLOG-family pair
  `## BL-X — RESOLVED` + `#### BL-X — original` — the one-character depth-typo
  shape (spec R4 F1: without this plant, a revert to a narrower scan passes every
  other plant while a typo'd duplicate sits silent).
  Stays-quiet rows, each with the pin it protects: two `## CI …`-style SHOUTY prose
  headings at level 2 in a null-prefix family (out of domain — the live shape at
  `DEFERRED-archive.md:1218` and `DEFERRED-archive.md:1314`); a demoted bold line beside one heading (the
  repaired form); two DIFFERENT ids at the same level.

### §2.3 Convention going forward

An archive record preserves the original entry's heading as a bold paragraph line, never
as a second id-bearing heading. Stated here once; the guard enforces it by name, so no
prose reminder in AGENTS.md is needed (a failing CI line citing this spec is the
reminder).

### §2.4 Entry disposition

The impl branch archives `BL-ARCHIVE-DUPLICATE-ENTRY-IDS` (archive-RED pattern) with:
the corrected mechanism diagnosis (§0), the census transcript pointer, the 43-pair
count (37 + 6, superseding the filed 35), and this spec as the record. The archived
entry itself follows the §2.3 convention.

### Dimensional Invariants

None — no UI surface, no rendered component. If implementation somehow introduces one,
that task adds the relationship here plus the real-browser assertion per the
writing-plans layout-dimensions rule.

### Transition Inventory

None — prose and test changes only; no visual states.

## §3 Sequencing

1. This branch (`docs/archive-dup-ids-spec`): spec → codex-guard `--stage spec` APPROVE
   → plan → codex-guard `--stage plan` APPROVE → `HANDOFF.md` → PR → CI → merge.
2. **Handoff-by-overlap (the L-wave §3 / M-wave §3 ratified protocol, spelled out —
   spec R1 F1):** before this branch's last pre-merge commit, the impl worktree +
   branch `chore/archive-duplicate-ids` is created off `origin/main`, and it runs
   `pnpm ledger:claims --check BL-ARCHIVE-DUPLICATE-ENTRY-IDS` from the main checkout
   EXPECTING exit 1 naming `docs/archive-dup-ids-spec` and ONLY it — that is the
   planned-handoff signature, not a collision; any OTHER branch named = real
   collision, stop and reconcile. It then marks the entry
   `IN PROGRESS · Branch: chore/archive-duplicate-ids` and pushes. THEN this branch's
   last pre-merge commit releases its own marker. At no instant is the entry
   undeclared on origin; the transient dual declaration is the designed handoff state
   (invariant 12's Stage-0 stop rule governs NEW claims, and the L-wave protocol is
   the ratified exception shape for planned handoffs — its spec §3 and the merged
   L-wave `HANDOFF.md` step 0.3 are the precedent).
3. A fresh Opus pane implements from `HANDOFF.md`: guard RED (observed naming all 43)
   → repair → GREEN → archive the entry → PR → real CI green → merge → `0 0`.

## §4 Documented limits

1. **A null-prefix (DEFERRED-family) id duplicated ONLY at level 2 is out of domain.**
   The DEFERRED entry grammar is level 3 by ratified rationale (level-2 headings there
   are prose sections — `_metaDeferralLedgerGraduation.test.ts:52-57`); a level-2-only
   entry is already invisible to every existing lane (graduation, terminal,
   in-progress), and this guard inherits exactly that scope rather than minting a
   second grammar. Worst case is a missed duplicate in a record file — conservative,
   and surfaced here by name; never silently wrong about what the guard claims.
2. **Formatted/obfuscated ids mint nothing** (the walker's ratified conservative
   direction, `_ledgerMdast.ts` §1.1.18 note): a duplicate heading whose id is wrapped
   in formatting is invisible to this lane, as it is to every other. Threat-model
   fence: accidental authoring and merge artifacts by ordinary contributors;
   render-equivalent obfuscation is review's failure class, not this tripwire's.
3. **A SHOUTY prose heading that reaches a family's ratified levels and collides with a
   real id would fire.** That is a naming-hygiene defect worth a loud name, not a false
   positive to engineer away.
4. **The archive's historical prose is otherwise untouched.** Stale line-number
   citations INSIDE archived bodies (drafting-time locators by convention) are not
   corrected by this arc.

## §5 Meta-test / registry inventory

- **EXTENDS:** `tests/docs/_metaDeferralLedgerGraduation.test.ts` (the uniqueness lane
  + plants). No new file; the suite is already CI-wired in the `parallel` project.
- **CREATES / registries:** nothing else. No Supabase call site, no mutation surface,
  no advisory lock, no §12.4 row (invariants 9/10/2/5 untriggered — docs + one test
  file). Source-mutation registry: not enrolled — the lane's kill criteria are its
  executable plants, and the subject corpus is finite (the ledger files on disk).

## §6 Acceptance criteria

- **AC-1:** the uniqueness lane lands and is OBSERVED red naming all 43 pairs (37
  `BACKLOG-archive.md`, 6 `DEFERRED-archive.md`) before any repair commit; after the
  repairs it is green; all plant rows pass.
- **AC-2:** every pair repaired per the §2.1 tables — survivor heading intact, demoted
  line bold with identical text; the REPAIR COMMIT's diff over the two archive files
  touches only the 43 demoted heading lines plus the §1.1.6 preamble annotations. The
  §2.4 archive move is its own later commit and adds its own section — outside AC-2's
  discipline by construction (spec R1 F2).
- **AC-3:** `pnpm vitest run tests/docs/` green on every commit; the graduation suite's
  provenance assertions pass unmodified.
- **AC-4:** entry archived per §2.4; flight marker stripped in the archive move; the
  impl branch's marker released in its PR's last pre-merge commit; conventional
  commits; TDD per task.

## §7 Convergence contract (for review dispatches on this spec and its diff)

- **CONSEQUENCE BOUND:** over the probe domain below, every in-domain duplicate id is
  either repaired or reported by CI by name — never silently wrong. A duplicate outside
  the domain (limits 1–2) is a DOCUMENTED LIMIT, not a finding.
- **PROBE DOMAIN:** the ledger files `ledgerFiles()` discovers on disk —
  `BACKLOG.md`, `BACKLOG-archive.md`, `DEFERRED.md`, `DEFERRED-archive.md`, plus the
  file pair of any family later registered in `LEDGER_FAMILIES`
  (`scripts/lib/ledger-fields.ts:47`). An unregistered ledger-shaped sibling is
  `unregisteredLedgerFiles`' complaint surface, not this lane's (spec R1 F3). A probe
  input more than one ordinary edit from these files files to documented limits.
- **THREAT-MODEL FENCE:** accidental authoring mistakes and merge artifacts by ordinary
  contributors. Adversarial obfuscation (formatted ids, render-equivalent spellings,
  HTML-comment smuggling) is out of scope and files to §4.

impeccable-gate: N/A — no UI surface
