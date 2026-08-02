# Plan — docs hygiene: retired-workflow citation rot + master-spec financials vocabulary

**Spec:** `docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md` (canonical; converged APPROVE at spec review R3; this plan implements it and does not override it).
**Branch:** `docs/citation-rot-financials-vocab` (worktree off origin/main at 2509f1452).
**Preflight:** skipped — docs + one test-registry file; no env, no DB, no app code. Declared in the PR body.

impeccable-gate: N/A — no UI surface

## Meta-test inventory

None created or extended, with one convention-mandated exception: two `{ id, provenance }` rows appended to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (the graduation ledger's own registry — required by the existing guard, not a new guard). No other registry applies: no Supabase calls, no locks, no alerts, no tiles, no e2e.

## Plan artifacts (measured at plan time, committed beside this plan)

- `2026-08-02-docs-hygiene-baseline-lint.txt` — all-severity `pnpm spec:lint` output for all ten Task-1 files (plan review R1 finding 2: an earlier narrow-grep baseline hid CLOSE-OUT's `CITATION_MALFORMED` at :28; this artifact is the delta base). Canonical (re)generation command — the post-edit delta MUST re-run exactly this, then `diff` against the artifact (plan review R3: the pnpm/header chrome is stripped by the same filter both times, so the diff is deterministic):

  ```sh
  for f in <the ten files, same order as the artifact>; do
    echo "===== $f"
    pnpm spec:lint "$f" 2>&1 | grep -v "^> \|^$\|^pnpm\|ELIFECYCLE\|spec:lint docs"
  done
  ```
- `2026-08-02-docs-hygiene-adjacency-sweep.txt` — the ±2-line context dump around all 14 probe-visible master-spec edit lines with LEAD-token flags (plan review R1 finding 4: the sweep is run at plan time, not deferred). Result: the only LEAD-bearing lines in any window are edit sites themselves or the ratified no-edit line 655 — no stragglers.

## TDD framing (docs tasks)

Each task's red state is a measured failing check (a lint count, a grep hit-set, a stale literal), captured before the edit; green is the same command's pinned expected output after.

---

## Task 1 — strip dangling workflow citations (spec §2)

**Red (measured, unfiltered — see baseline artifact):** target-class `CITATION_FILE_MISSING` findings naming a deleted `*-e2e.yml`: 15 across 10 files. Per-file hard counts before → after: strip-mobile plan 10→8; destruct-thumb plan 1→0; modal-header CLOSE-OUT 3→2; share-link-chrome spec 2→0; archive-row-menu spec 1→0; destruct-thumb spec 2→0; caret-blur plan 2→1; attention-index plan 3→1; caret-blur spec 1→0; hoverhelp-viewport spec 2→0. Residual total 12, five classes, inventoried in spec §1.1 item 3.

**Edits (per-site disposition; style per spec §2.1):**

| Site | Current (fragment) | New (fragment) |
| --- | --- | --- |
| strip-mobile plan :34 | "Modify: backticked path (workflow), (path filter, if it names spec files individually…)" | "Modify: the now-deleted modal-header-layout-e2e workflow (path filter, …)" |
| strip-mobile plan :352 | "backticked path: grep for `skeletonBandParity`; mirror every per-file entry…" | "the now-deleted modal-header-layout-e2e workflow: grep for `skeletonBandParity`; …" |
| destruct-thumb plan :102 | "modelled on backticked bare filename (same setup action, …)" | "modelled on the since-retired modal-header-layout-e2e workflow (same setup action, …)" |
| modal-header CLOSE-OUT :86 | "backticked bare filename was narrowed to what #493 left dark" | "the modal-header-layout-e2e workflow (since retired) was narrowed to what #493 left dark" |
| share-link-chrome spec :30 (2 sites) | "(backticked path:39 says exactly that about the ~15 specs still dark)" and the citation-column entry | "(line 39 of the since-retired modal-header-layout-e2e workflow said exactly that about the ~15 specs then dark)"; citation column keeps only the still-tracked phantom-gap and package.json citations |
| archive-row-menu spec :128 | "(R14: e.g. backticked bare filename runs `pnpm test:e2e:modal-header`, whose spec list lives in `package.json`)" | "(R14: e.g. the since-retired modal-header-layout-e2e workflow ran `pnpm test:e2e:modal-header`, …)" |
| destruct-thumb spec :24 | "the config itself IS invoked by backticked path:106" | "the config itself was invoked by the since-retired modal-header-layout-e2e workflow" |
| destruct-thumb spec :326 | "modelled directly on backticked path" | "modelled directly on the since-retired modal-header-layout-e2e workflow" |
| caret-blur plan :20 | "backticked hoverhelp-geometry path path-triggers on …" | "the since-retired hoverhelp-geometry-e2e workflow path-triggered on …" |
| caret-blur spec :30 | test-inventory row citing the backticked hoverhelp-geometry path | same row naming "the since-retired hoverhelp-geometry-e2e workflow" in prose |
| attention-index plan :269 | "(backticked attention-anchor path is the closest template, a standalone-config job with a path filter)" (source uses a dash separator) | "(the since-retired attention-anchor-e2e workflow was the closest template, …)" (source's dash separator stays as-is) |
| attention-index plan :288 | "backticked attention-anchor path:19-32 is the structural template, but **it does not demonstrate every class**" | "lines 19-32 of the since-retired attention-anchor-e2e workflow were the structural template, but **they did not demonstrate every class**" |
| hoverhelp-viewport spec :63 | "CI: backticked hoverhelp-geometry path lists … It does NOT list ShareHub" | "CI: the since-retired hoverhelp-geometry-e2e workflow listed … It did NOT list ShareHub" |
| hoverhelp-viewport spec :251 | "Three entries MUST be added to backticked path's `pull_request` path filter in the same commit that creates or changes them, or a later edit will not fire…" | "Three entries had to be added to the hoverhelp-geometry-e2e workflow's `pull_request` path filter in the same commit that created or changed them, or a later edit would not fire… (workflow since retired; the requirement was satisfied while it lived)" — past tense per plan review R1 finding 5: the imperative asserted an impossible live-CI action |

Wording latitude: the implementer may vary the qualifier ("retired" / "since-retired" / "now-deleted") to read naturally; binding constraints: (a) no backticks around any deleted workflow name or path, (b) no `.yml`-suffixed backticked token pointing at a deleted file, (c) sentence meaning preserved, (d) no em-dash introduced, (e) tense adjusted where the sentence otherwise asserts live CI behavior.

**Green:** spec §2.3's three items — (1) per-file lint matches the counts above with zero target-class findings; (2) all-severity delta: re-run the canonical artifact-generation command above and `diff` its output against the committed baseline — the only differences are the removed target findings and the affected files' summary hard-counts; (3) the spec §2.3 tree-wide `rg` loop, hits confirmed against `spec:lint`, reports zero target-class citations.

**Commit:** `docs: strip dangling citations to the seven retired e2e workflows`

## Task 2 — master-spec financials vocabulary + specs-README count (spec §3, §1.1 item 8)

**Red (measured):** the seed (spec §3.2) returns 15 lines, 11 stale; the discovery-mode window probe below returns the 14-line edit-site set (spec §3.2.1); `docs/superpowers/specs/README.md` claims "3769 lines" while the file is 4027.

**Window probe (canonical script; discovery mode — edit sites deliberately NOT excluded, so a missed edit keeps it red; spec review R2 finding 2):**

```sh
python3 - <<'EOF'
import re
lines=open('docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md').read().split('\n')
fin=re.compile(r'financ|invoice|proposal|po#|shows_internal|financials|\bops\b',re.I)
lead=re.compile(r'\bLEAD\b|\blead\b|\bLead\b')
fl=re.compile(r'FINANCIALS')
RATIFIED={221,1715,2076,2449,2451,2733,2865,3805,  # spec 3.2.1 non-claims
          193,655,657,1418}                        # seed no-edit lines
hits=[]
for i,l in enumerate(lines):
    n=i+1
    if lead.search(l) and not fl.search(l):
        if any(fin.search(lines[j]) for j in range(max(0,i-2),min(len(lines),i+3))):
            if n not in RATIFIED: hits.append(n)
print("hits:",hits)
EOF
```

Measured pre-edit: `hits: [23, 178, 199, 632, 640, 653, 1487, 2372, 2460, 3727, 3728, 3747, 3831, 3832]` — exactly the 14 edit-site lines. Post-edit acceptance: `hits: []` (every edited line then names `FINANCIALS` on-line).

**Edits — exact clause substitutions, one per line unless noted (line-count-neutral; no em-dash introduced; existing dashes stay):**

| Line | Old clause (verbatim) | New clause |
| --- | --- | --- |
| 23 | `filtered out of non-LEAD views` | `filtered out of non-financials-entitled views (LEAD or FINANCIALS flag, or admin; 2026-07-15 vocab extension)` |
| 178 | `-- LEAD-gated;` | `-- gated on financials entitlement (LEAD or FINANCIALS flag, or admin);` |
| 199 | `-- LEAD-only:` | `-- financials-entitled (LEAD/FINANCIALS/admin; 2026-07-15 vocab extension):` |
| 632 | `for a LEAD or none of it for a non-LEAD;` | `for a financials-entitled viewer (LEAD or FINANCIALS, or admin) or none of it otherwise;` |
| 640 | `LEAD crew see this table's columns only because` | `Financials-entitled crew (LEAD or FINANCIALS) see this table's` `financials` `column only because` (the backticked column name is a tracked-concept token, not a file citation) |
| 653 (i) | `the LEAD-aware fetch helper` | `the entitlement-aware fetch helper` |
| 653 (ii) | `it joins only when the freshly-derived role is LEAD (or` `viewer.kind === 'admin'` `)` | `it joins only when the freshly-derived flags grant financials (LEAD or FINANCIALS, or` `viewer.kind === 'admin'` `; 2026-07-15 vocab extension)` |
| 653 (iii) | `For non-LEAD viewers, it does not query` | `For non-entitled viewers, it does not query` |
| 1487 | `**LEAD detection.** ` `role_flags` ` contains ` `LEAD` ` ⇒` | `**Financials entitlement.** ` `role_flags` ` contains ` `LEAD` ` or ` `FINANCIALS` ` (or the viewer is admin; 2026-07-15 vocab extension) ⇒` |
| 2372 | `has ` `LEAD` ` in ` `role_flags` `, OR the viewer is admin → ` `viewerRole === 'lead'` `.` | `has ` `LEAD` ` or ` `FINANCIALS` ` in ` `role_flags` `, OR the viewer is admin: financials-entitled (2026-07-15 vocab extension).` (pseudo-label dropped per spec §3.2 row 2372) |
| 2460 (i) | `— LEAD only.` | `— financials-entitled only (LEAD or FINANCIALS flag, or admin; 2026-07-15 vocab extension).` |
| 2460 (ii) | `Hidden entirely for non-LEAD (omitted` | `Hidden entirely for non-entitled viewers (omitted` |
| 3727 | `role_flags don't include LEAD.` | `role_flags don't include LEAD (or FINANCIALS; 2026-07-15 vocab extension).` |
| 3728 | append at line end | ` [2026-07-15 vocab extension: the demo assumes the member holds no FINANCIALS flag.]` |
| 3747 | append at line end | ` [Amended 2026-07-15 (extend-role-scope-vocab): the FINANCIALS role flag now also grants; entitlement is LEAD or FINANCIALS or admin.]` |
| 3831 | `AC-5.9 LEAD viewer's response includes` … `non-LEAD viewer's response omits it.` | `AC-5.9 A financials-entitled viewer's (LEAD or FINANCIALS flag, or admin; 2026-07-15 vocab extension) response includes` … `a non-entitled viewer's response omits it.` |
| 3832 | append at line end | ` [2026-07-15 vocab extension: assumes the member holds no FINANCIALS flag.]` |

README: `3769 lines` → `4027 lines` (one word; rides this commit — folded per plan review R1 finding 3 rather than standing as a red-less task).

**Adjacency sweep (run at plan time — artifact above):** the only LEAD-bearing lines within ±2 of any edit site are other edit sites or ratified line 655. Dispositions for context lines: 2373's "Otherwise:" reads correctly against the rewritten 2372 entitlement condition; no other context line carries an entitlement claim.

**Green (spec §3.3):**
1. Seed re-run returns exactly lines 193, 655, 657, 1418; window probe returns `hits: []`.
2. `wc -l docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` = 4027.
3. `pnpm spec:lint` on the master spec: findings identical to the pre-edit baseline run (no new findings of any severity; baseline captured in the same session before editing).
4. The plan-time adjacency sweep stands in for the spec §3.3 item-4 manual pass; any straggler found while editing joins rule-(a) and is recorded in the PR body.

**Commit:** `docs: reconcile master-spec financials prose to LEAD/FINANCIALS/admin entitlement`

## Task 3 — ledger graduation (spec §5; red-first order per plan review R1 finding 1)

1. **Registry first (red):** append two rows to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` with the conventional comment: `{ id: "BL-DANGLING-CITATIONS-RETIRED-WORKFLOW", provenance: "docs/citation-rot-financials-vocab" }` and `{ id: "BL-MASTERSPEC-FINANCIALS-VOCAB", provenance: "docs/citation-rot-financials-vocab" }`. Run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` — **FAILS** (registry rows present, archive sections absent; the test iterates `BACKLOG_GRADUATED` and asserts the archive carries each id + provenance). This is the task's red state — the inverse order (archive first) is green throughout and proves nothing.
2. **Archive move (green):** move both entries from BACKLOG.md's open queue to `BACKLOG-archive.md`, each with a close-out note naming the provenance branch `docs/citation-rot-financials-vocab`, what shipped (item 1: 15 citations across 10 files rendered as prose, class-swept per AGENTS.md; item 2: 14 master-spec claims reconciled — 11 seed-visible + 3 window-probe — with 4 seed exclusions + 8 probe non-claims ratified), and the two backlog-entry corrections measured en route (the retiring spec is second-to-last in the entry's list and already clean; the seed returns 15 hits).
3. Update BACKLOG.md's "Last reconciled" header line.
4. **New deferral row** — insert verbatim into BACKLOG.md's open queue (level-2 heading, `BL-` prefix, per the `tests/docs/_ledgerMdast.ts` walker's `BACKLOG_OPTS` heading contract — plan review R1 finding 6):

   ```markdown
   ## BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT — §12.4 ROLE_FLAGS_NOTICE copy says FINANCIALS unlocks admin access

   **Filed:** 2026-08-02 (docs/citation-rot-financials-vocab, spec review R2 finding 3) · **Class:** docs/copy (§12.4 catalog) · **Severity:** low · **Effort:** S

   Master spec §12.4 `ROLE_FLAGS_NOTICE` helpfulContext (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3356`) reads "This fires only for LEAD or FINANCIALS, the roles that unlock internal financials and admin access". FINANCIALS unlocks the `financials` column only ("Nothing else", the Effect row of `docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md`); LEAD alone additionally grants the admin/ops surface, stated correctly at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`. Explanatory copy only, so no access is actually granted, but it is Doug-visible text. Fix requires the §12.4 three-way lockstep in ONE commit (spec §12.4 prose edit + `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` row) and touches the frozen helpfulContext byte-parity contract (BL-CARD-COPY-HELPFULCONTEXT-PARITY, graduated 2026-08-01) — re-freeze parity after the edit. Trigger: next §12.4 copy pass.
   ```

5. `BL-HELP-STRIP-COPYLINK-STALE` untouched.

**Green:** `pnpm vitest run tests/docs/` passes (graduation test + ledger walker + README parity + invariant-8 closeout).
**Commit:** `docs: graduate BL-DANGLING-CITATIONS-RETIRED-WORKFLOW + BL-MASTERSPEC-FINANCIALS-VOCAB; file BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`

## Task 4 — verification sweep + gates

- All Task 1/2 acceptance commands re-run from clean tree; outputs recorded for the PR body.
- Full pre-push gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- `pnpm spec:lint` on this plan and on the spec: 0 hard each.

## Task 5 — adversarial review (cross-model), then ship

- Whole-diff Codex review via `scripts/codex-guard.mjs` (file list inlined in the brief; REVIEWER ONLY; verdict marker; do-not-relitigate = spec §1.1 all 10 items + spec §9 review log).
- Push, PR body: scope summary, preflight-skip declaration, acceptance outputs, deferred-item notes (BL-HELP-STRIP-COPYLINK-STALE; BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT).
- Real CI green (all checks) → `gh pr merge --merge` → fast-forward local main → `git rev-list --left-right --count main...origin/main` = `0  0`.

## Checklist

- [ ] Task 1 strip + lint deltas (all-severity, vs committed baseline artifact)
- [ ] Task 2 master-spec vocab + README count + seed/probe/wc/lint checks
- [ ] Task 3 graduation (registry-first red, archive, header, new deferral row)
- [ ] Task 4 verification sweep + full gates
- [ ] Self-review (this plan) against docs/agents/writing-plans.md
- [ ] Adversarial review (cross-model) — plan, then whole-diff
- [ ] Execution handoff (same session; autonomous pipeline)
