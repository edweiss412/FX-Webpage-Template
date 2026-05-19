# Handoff — M11 Phase B: Catalog extension + alignment (Tasks B.1–B.5)

**Status:** CLOSED 2026-05-19 at SHA `cd14865`.

**Handed off:** 2026-05-19 by Eric Weiss (orchestrator session "Orchestrator — M11").
**Implementer:** GPT-5.5 / Codex CLI via `codex exec` (per ROUTING.md row "B — Catalog extension"; `lib/messages/` has been Codex-owned since M5 §A and M8 §A).
**Adversarial reviewer:** Opus 4.7 / Claude Code (cross-CLI per ROUTING.md reviewer-pairing logic; reverses Phase A's Opus-implementer / Codex-reviewer pairing).
**Plan file:** `docs/superpowers/plans/2026-05-12-user-facing-docs/02-catalog-extension.md` (Tasks B.1–B.5; r3-reordered so B.2 parser lands before B.3 alignment).

> Phase B is **single-implementer**. No §A/§B split. No pin-stops. All five tasks (B.1 → B.5) ship in one continuous TDD-disciplined sequence inside a single Codex session.
> Phase B has **no UI surface** — no `app/`, no `components/`, no design-token work. The AGENTS.md §1.8 impeccable v3 dual-gate does NOT fire on this phase. Adversarial review (cross-model) is the only review gate.

---

## §1 Session metadata

- **Session date(s):** TBD (kickoff after this handoff commits).
- **Implementer:** GPT-5.5 / Codex CLI via `codex exec` (single session per AGENTS.md "Codex-specific notes"; `< /dev/null` discipline per memory `feedback_codex_exec_needs_stdin_closed.md`).
- **Reviewer:** Opus 4.7 / Claude Code (cross-CLI adversarial via `/codex:adversarial-review`-style invocation OR direct subagent dispatch from this orchestrator session — TBD at first-review time per `feedback_adversarial_review_canonical_invocation.md`).
- **Base branch:** `main` at commit `3c29355` (current HEAD; X.4 implementation verification handoff committed; X.1 catalog-parity converged at `2090dc2`; Phase A closed at `e911078`; X.4 close-out at `3c29355` is the most recent commit and is the Phase-B base).
- **Plan version:** `docs/superpowers/plans/2026-05-12-user-facing-docs/02-catalog-extension.md` r3 (commit `977dc78` — M12 → M11 rename + plan reordering, 2026-05-19).
- **Spec version:** `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` r14 (commit `977dc78`). Phase B implements spec §5.1 schema extension + §7.1 tests #2 and #17 + AC-11.5 / AC-11.6 / AC-11.11 / AC-11.35.

---

## §2 Phase completed in this session

- [x] **Phase B — Catalog extension + alignment** (`02-catalog-extension.md`) — **CLOSED 2026-05-19 at SHA `cd14865`**
  - [x] Task B.1 — Extend `MessageCatalogEntry` with `title` + `longExplanation` + `helpHref` (`5d081b9`). Seed script regex generalized to handle quoted MI keys (e.g., `"MI-1_VERSION_DETECTION_FAILED"`); seed verification passed `OK: 175 entries seeded`.
  - [x] Task B.2 — `scripts/extract-admin-log-only-codes.ts` parser (`1971551`). Spec-canonical deviation: `PENDING_SNAPSHOT_{ROLLBACK,PROMOTE}_STUCK` confirmed Doug-facing per master-spec lines 2829-2830; fixture has NEGATIVE assertions for both per watchpoint #18.
  - [x] Task B.3 — Catalog-alignment **hard gate** (`1daf1b7`). No catalog mutations needed: live catalog was already null-aligned (X.1 baseline at `2090dc2` had pre-cleaned). Hard-gate test was still red-proven via temporary `STALE_WRITE_ABORTED.dougFacing` drift then restored before commit.
  - [x] Task B.4 — `lib/messages/catalogDocsValidator.ts` + `tests/messages/_metaErrorCatalogDocs.test.ts` (`c0c24b6`). 15 forced fixtures covering all 7 violation cases + 8 satisfying cases. Live-catalog assertion deferred to E.13.
  - [x] Task B.5 — `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts` (`cd14865`). Long-running canary; verify-red-via-restore protocol per AGENTS.md invariant #1 — observed FAIL on temporary `STALE_WRITE_ABORTED.dougFacing` drift, `git restore`d before commit.

Other phases (A done at `e911078`; C–I tracked in their own per-phase handoffs).

---

## §3 Spec sections in scope (Phase B only)

- **§5.1** — `MessageCatalogEntry` schema extension (three new nullable fields; biconditional predicate `severity !== "info"` AND `dougFacing != null` → all three M11 fields non-null).
- **§5.2** — Render-side full contract reused by the validator (`contractViolations` returns specific violation strings for predicate and non-predicate halves).
- **§7.1 test #2** — Catalog meta-test (B.4 forced fixtures; E.13 live-catalog assertion).
- **§7.1 test #17** — Catalog-alignment meta-test (B.5; spec-derived admin-log-only canary).
- **AC-11.5** — Schema-extension shape (additive, `messageFor` signature unchanged).
- **AC-11.6** — Biconditional predicate enforcement.
- **AC-11.11** — `/help/errors` page rendering contract (Phase B prepares the catalog; the rendering is Phase E.13).
- **AC-11.35** — Catalog reconciled with master-spec §12.4 admin-log-only contract via derivation (NOT hand-list).
- **Master-spec `2026-04-30-fxav-crew-pages-design.md` §12.4** — canonical catalog source; line 2691 is the admin-log-only normalization rule; line 2692 enumerates the three accepted null-cell shapes (`—`, empty, `(admin log only ...)`); line 2724 is the `STALE_MANUAL_REPLAY_ABORTED` Doug-facing exception (parser correctly does NOT derive it).

Out of scope for Phase B (deferred to later phases):
- `lib/time/now.ts` (Phase C).
- MDX components beyond the empty `useMDXComponents` shell (Phase D).
- Page content for the 12 non-landing pages, including `title` / `longExplanation` / `helpHref` backfill on Doug-facing predicate entries (Phase E).
- Screenshot harness (Phase F), affordance retrofit (Phase G), auth-integration tests (Phase H), close-out (Phase I).
- Live-catalog full-contract assertion in `_metaErrorCatalogDocs.test.ts` (Phase E Task E.13 lands this; B.4 commits only forced-fixture coverage so the file is green BEFORE E.5–E.11 backfills land).

---

## §4 Acceptance criteria

| AC | Phase B status | Notes |
| --- | --- | --- |
| AC-11.5 | PASS (target) | B.1 extends `MessageCatalogEntry` with `title: string \| null`, `longExplanation: string \| null`, `helpHref: string \| null`. `messageFor` signature unchanged; all existing callers compile. Schema-extension test asserts type shape via `expectTypeOf`. |
| AC-11.6 | PARTIAL — forced-fixture coverage at B.4 | The biconditional contract is asserted by `contractViolations` (validator module). B.4 covers the contract with 15 forced fixtures exercising all 7 violation cases (predicate missing title / longExplanation / helpHref / bad shape; non-predicate stray title / longExplanation / helpHref) + 8 satisfying cases. **Live-catalog assertion is deferred to E.13** (it would FAIL at Phase B close-out because Phase E.5–E.11 backfills haven't landed yet — Doug-facing predicate entries still have all three M11 fields `null`). |
| AC-11.11 | DEFERRED — Phase E.13 | `/help/errors` page rendering is Phase E.13 scope. Phase B prepares the catalog shape that E.13 iterates. |
| AC-11.35 | PASS (target) | B.2 parser + B.3 hard gate + B.5 meta-test cover the derivation rule (`extract-admin-log-only-codes.ts` parses master-spec §12.4 at execution time; B.5 runs the same parser on every test invocation, so future master-spec edits surface as test failures, not stale hand-list drift). |
| AC-11.17 | PASS (target) | Conventional-commits `feat(messages): ...` / `test(messages): ...` / `feat(scripts): ...` for every Phase B commit. Five commits total (one per task). No batching. |
| AC-11.22 | PASS (sequencing) | M10 closed at SHA `9b34d30`; Phase A closed at `e911078`; X.1 closed at `2090dc2`. Phase B starts post-A. |

ACs NOT addressed by Phase B: AC-11.1–AC-11.4 + AC-11.12 + AC-11.23 + AC-11.24 + AC-11.31 (all Phase A scope, closed). AC-11.7–AC-11.10 + AC-11.13–AC-11.21 + AC-11.25–AC-11.34 + AC-11.36–AC-11.39 (Phases C–I scope).

---

## §5 Plan-wide invariants — applicability to Phase B

These are AGENTS.md's 9 invariants layered with M11's per-plan additions (`00-overview.md` "Plan-wide invariants").

| # | Invariant | Phase B applicability |
| --- | --- | --- |
| AGENTS.md §1.1 | **TDD per task.** | **ACTIVE.** Every B.1–B.5 task: failing test → minimal implementation → passing test → commit. B.5 uses the **verify-red-via-restore protocol** (temporarily revert one of B.3's null-alignments with hand-edit, observe FAIL, `git restore` to revert) because B.5 lands AFTER B.3 in the same session — the meta-test is structurally green at commit time, so the red proof is captured via a non-committed transient state. The commit body documents the observed failure literal. |
| AGENTS.md §1.2 | **Per-show advisory lock.** | **N/A for Phase B.** Phase B does not mutate `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`. No `pg_*advisory*_lock` callers introduced. |
| AGENTS.md §1.3 | **Email canonicalization at every boundary.** | **N/A for Phase B.** No raw email handling. |
| AGENTS.md §1.4 | **No global sync cursor.** | **N/A for Phase B.** Catalog is in-memory data; no `lastPollAt` surface. |
| AGENTS.md §1.5 | **No raw error codes in user-visible UI.** | **N/A for Phase B (read-side).** Phase B is producer-side only: it extends the catalog schema and aligns rows. No new renderer code. X.2 (cross-cutting, Codex-routed in parallel) owns the no-raw-codes audit including the MDX gap noted in `DEFERRED.md#m11-a-d3`. |
| AGENTS.md §1.6 | **Commit per task.** | **ACTIVE.** Conventional-commits `feat(messages): ...` (B.1, B.3), `feat(scripts): ...` or `feat(messages): ...` (B.2 — the parser script can stay under `messages` scope since it's a catalog-supporting derivation tool; the plan body uses `feat(messages):`), `test(messages): ...` (B.4, B.5). Never batch multiple B.* tasks into one commit. |
| AGENTS.md §1.7 | **Spec is canonical.** | **ACTIVE.** No ratified amendments for M11. Any disagreement between B.1–B.5 task body and spec → open a question, do not silently fix. Master-spec §12.4 row shape (5 columns) is canonical; the r2 parser-fix in the plan body (Doug cell is `cells[2]` not `cells[1]`) is rooted in master-spec §12.4's header row, not a plan-only convention. |
| AGENTS.md §1.8 | **impeccable v3 critique + audit dual-gate.** | **N/A for Phase B.** No UI surface. UI surface per AGENTS.md §1.8 = any file under `app/` except `app/api/**`, any file under `components/`, any new `app/globals.css` `@theme` token block, or any change to `DESIGN.md` / `tailwind.config.*`. Phase B touches `lib/messages/catalog.ts`, `lib/messages/catalogDocsValidator.ts`, `lib/messages/lookup.ts` (if needed; B.1 plan body says no edits required), `scripts/extract-admin-log-only-codes.ts`, `scripts/seed-m12-catalog-fields.ts`, `tests/messages/*` — none of which trigger §1.8. The dual-gate does NOT fire. |
| AGENTS.md §1.9 | **Supabase call-boundary discipline.** | **N/A for Phase B.** Catalog is in-memory data; no Supabase clients touched. No new registry rows in `tests/auth/_metaInfraContract.test.ts`. |
| M11 plan-wide #4 | **No raw error codes in user-visible UI** (AGENTS.md #5 echo). | Same as AGENTS.md §1.5 above — N/A on the producer side. |
| M11 plan-wide #5 | **impeccable v3 UI gate** (AGENTS.md #8 echo). | N/A for Phase B (no UI surface). |
| M11 plan-wide #7 | **`MessageCatalogEntry` additive extension.** | **CORE ACTIVE for Phase B.** B.1 is the implementer. The three new fields are ADDITIVE: existing four user-facing fields (`dougFacing`, `crewFacing`, `followUp`, `helpfulContext`) keep their shapes; `messageFor` return type widens but signature is unchanged. X.1's `SpecCodePayload` four-field deep-compare test (`tests/cross-cutting/codes.test.ts`) is structurally insensitive to the additive widening — verify by running the test after B.1 commits. |
| M11 plan-wide #8 | **Catalog-master-spec alignment.** | **CORE ACTIVE for Phase B.** Tasks B.2 + B.3 + B.5 are the implementers. The X.1 catalog-parity baseline at `2090dc2` is the upstream-clean state Phase B builds on. The alignment direction is **catalog → spec** (master-spec wins; live catalog rows align to master-spec admin-log-only classification). |
| M11 plan-wide #9 | **`lib/time/now.ts` is the only server-side render-time source.** | **N/A for Phase B.** Phase C creates the utility. Phase B's catalog has no time-rendering code. |
| M11 plan-wide #10 | **§5.6 affordance matrix is the §9.0.1 retrofit contract.** | **N/A for Phase B.** Phase G is the implementer. |

---

## §6 Watchpoints (class-vectors carried forward)

Per AGENTS.md "Same-vector recurrence" + Disagreement-loop preempt rules. These are pre-loaded BEFORE adversarial review fires so the reviewer is anchored on prior-incident context, not discovering it round-N. **Memory entries cited inline** are loaded via the auto-memory index in `CLAUDE.md`.

1. **Audit derives from spec at audit time, not handoff** (memory `feedback_audit_derives_from_spec_not_handoff.md` — NEW 2026-05-19 from X.3 close-out). The Phase B parser `scripts/extract-admin-log-only-codes.ts` MUST parse master-spec §12.4 at execution time. **Hand-listed admin-log-only sets are forbidden** — even though the plan body cites 14 + ~8 known examples as a sanity guide, the parser must derive whatever the live master spec contains. The B.5 meta-test re-runs the parser on every invocation; future master-spec edits surface as test failures, not stale-list drift. **Concrete prohibition:** do not write `const ADMIN_LOG_ONLY_CODES = ["STALE_WRITE_ABORTED", ...]` anywhere in the Phase B code surface. The list is a parser output, not a constant.

2. **X.1 four-field parity test stays green after the additive schema extension** (X.1 catalog-parity close-out at `2090dc2`). `tests/cross-cutting/codes.test.ts` deep-compares the four canonical user-facing fields (`dougFacing`, `crewFacing`, `followUp`, `helpfulContext`) between live catalog and spec-derived `SpecCodePayload`. B.1's additive widening of `MessageCatalogEntry` with three NEW fields (`title`, `longExplanation`, `helpHref`) is structurally invisible to the four-field deep-compare. **Watch:** if the implementer accidentally widens `SpecCodePayload` itself to include the three new fields, the parity test would start failing on every entry whose new fields are `null` in the catalog but absent from spec-derivation. **Mitigation:** B.1 only edits `lib/messages/catalog.ts` and (optionally) `lib/messages/lookup.ts`; `lib/messages/__generated__/spec-codes.ts` and `tests/cross-cutting/codes.test.ts` are X.1-owned and must NOT be touched in Phase B. Re-run `pnpm test tests/cross-cutting/codes.test.ts` after every B.* commit as a cheap structural check.

3. **r2 parser-fix: §12.4 table is 5 columns** (plan body Task B.2). The master-spec §12.4 header is `| Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up |`. After splitting on `|` and dropping leading/trailing empty slots, Doug is `cells[2]`, NOT `cells[1]`. The r1 plan parsed `cells[1]` (the "Where it surfaces" column) and derived zero codes. **Verification step:** Task B.2 Step 5 runs `pnpm dlx tsx scripts/extract-admin-log-only-codes.ts > /tmp/derived.txt && cat /tmp/derived.txt`. Output MUST contain `STALE_WRITE_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `PENDING_SNAPSHOT_ROLLBACK_STUCK`, and MUST NOT contain `STALE_MANUAL_REPLAY_ABORTED`. If the output is empty or short, the implementer is reading the wrong column.

4. **r2 parser-fix: both Doug AND Crew cells must be null-shaped** (plan body Task B.2). Master-spec line 2691 requires BOTH cells null for admin-log-only classification. Checking only Doug would mis-classify codes like `CSRF_DENIED` (Doug-only operator hint, but non-null Crew copy) as admin-log-only. Three accepted null shapes (master-spec line 2692): literal em-dash `—`, empty cell, parenthetical starting `(admin log only`. Other sentinels (`null`, `none`, `n/a`, `(operator log only`) are NOT recognized. The plan body's `isNullShape()` predicate enumerates these explicitly.

5. **r6 parser-fix: escaped pipes inside cells** (plan body Task B.2). Master-spec §12.4 rows use `\|` to escape literal pipes inside cells (e.g., `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` row has `http_status: number \| null` in the "Where" cell). A naive `line.split("|")` shifts every cell after the escape, so Doug lands at `cells[3+]` instead of `cells[2]` and the parser silently misses the row. The plan body's implementation uses a SENTINEL replacement (`<<ESCAPED-PIPE>>`) before splitting and restores after. **Verification:** the live-spec assertion at Task B.2 Step 4 explicitly asserts `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` is derived — if missing, the SENTINEL substitution is broken.

6. **r3 reordering rationale: B.2 (parser) lands BEFORE B.3 (alignment)** (plan body §2 + Task B.3). The r2 plan had B.2 maintain a hand-list of 14 codes while B.5 derived 23+ from master-spec — the mismatch meant B.5's `expect(entry).toBeDefined()` failed for ~8 codes that master-spec named but the live catalog (and B.2's hand-list) didn't cover. **r3 ordering:** B.2 ships the parser; B.3 runs the parser to get the canonical set, then aligns existing catalog rows AND adds null-stub entries for derived codes absent from the live catalog. Result: B.5's hard gate is satisfiable at close-out (every derived code is in the catalog). Do not reorder B.2 and B.3.

7. **B.3 hard gate — no deferrals** (plan body Task B.3). The alignment subtask is the **only** point at which derived codes either align or null-stub. There is no "we'll catch the missing ones in Phase E" escape hatch. The plan body explicitly closes that door because Phase E owns content authoring (`title` / `longExplanation` / `helpHref` for Doug-facing predicate entries), NOT catalog-shape reconciliation. **Watch:** if B.3 finds derived codes the implementer doesn't recognize, do NOT skip them — add null stubs. The runtime needs the entries to format `sync_log` rows for operator debugging (master-spec line 2691).

8. **B.4 biconditional is necessary but NOT sufficient** (plan body Task B.4 + r3 fix). The r2 biconditional helper would have passed a fixture like "crew-only entry with stray helpHref" — `predicate(e)` is false, `allM12FieldsNonNull(e)` is also false, biconditional `false === false` trivially holds, but the contract is violated (non-predicate entries must have ALL THREE M11 fields null). r3 replaces the biconditional with `contractViolations()` returning specific violation strings. The B.4 test file asserts exact violation messages — so a future flawed validator implementation cannot ship a silent regression. **Watch:** do not "simplify" the validator back to a single boolean.

9. **B.4 live-catalog assertion is deferred to E.13** (plan body Task B.4 Step 5 note + r6 — r4's H.6 was removed). At B.4 commit time, the live catalog still has Doug-facing entries with `title` / `longExplanation` / `helpHref` all null because Phase E.5–E.11 backfills haven't landed. A live full-contract assertion would FAIL on every such entry. B.4 commits only forced-fixture coverage (15 cases, all green at commit time). E.13 lands AFTER Phase E backfills, writes the live-catalog assertion (importing `contractViolations` from the SAME validator module — single source of truth), and commits red→green. **Do not** write the live-catalog assertion in B.4; that is E.13's deliverable.

10. **Codex `< /dev/null` discipline** (memory `feedback_codex_exec_needs_stdin_closed.md`). Every `codex exec` invocation in the Codex implementer's session MUST append `< /dev/null` to close stdin. Without it, `codex exec ... "$prompt"` hangs forever waiting on stdin EOF in non-interactive contexts. The companion-script invocations from the orchestrator side handle this already; this note is for the Codex implementer's own shell discipline if it shells out from within its session. Monitor Codex CPU% if the session feels stalled (0.0% for 2+ min = stdin hang).

11. **Codex companion-script `--background` instability** (Phase A §14 observation). Phase A's R2 attempts crashed twice in background mode (jobs `review-mpd6dpqh-5kmstq` and `review-mpd6rqqc-t8u334` died after 1 command). The R3 attempt succeeded in foreground `--wait` mode. **Discipline for the Phase B adversarial review:** if the first background companion-script invocation crashes, fall back to `--wait` foreground on the next attempt rather than continuing to retry background.

12. **X.2 parallel-session cross-talk in the working tree** (Phase A §6 watchpoint #13 carry-forward). X.2 (no-raw-codes audit, Codex-routed) may still be running against the same checkout in a separate session. Phase B subagents / Codex sessions MUST use `git add <specific-paths>` (never `git add -A` / `.`), and verify with `git show --stat HEAD` post-commit that the diff contains only Phase B surface files (`lib/messages/catalog.ts`, `lib/messages/catalogDocsValidator.ts`, `scripts/extract-admin-log-only-codes.ts`, `scripts/seed-m12-catalog-fields.ts`, `tests/messages/*`). `pnpm typecheck` will surface X.2-related errors in untracked files — those are X.2's responsibility, not Phase B's; scope errors appropriately at review time.

13. **Seed script post-script verification is mandatory** (plan body Task B.1 Step 4 r2-added). After running `pnpm dlx tsx scripts/seed-m12-catalog-fields.ts`, the implementer MUST run the fail-loud verification snippet (count of `[A-Z]+:` entry opens vs count of `    title: null,` inserts). If MISMATCH, the seed script missed entries — fix the script BEFORE commit. The r1 seed script anchored on `helpfulContext:[^\n]*,` which only matched single-line `helpfulContext` values; ~50% of live entries use the multi-line `helpfulContext:\n      "long string",` form which the regex silently skipped. The r2 implementation in the plan body uses line-by-line parsing agnostic to inner field shapes — verify by running the count-match check.

14. **Pre-flight flakes observed at HEAD `2090dc2` and `e911078`** (Phase A §6 watchpoint #11 carry-forward). Phase A's Layer-2 auth-gate `vi.mock` leakage flake was RESOLVED at `e911078` (commit `e911078` — `vi.importActual` fix). Phase A's e2e `tile-grid` hydration jitter was RESOLVED at `6afc409` (3-line barrier). **Implication for Phase B close-out:** the four-gate green expectation should hold at `e911078`+ baselines. If any flake re-surfaces, re-run the failing gate **once** before treating as a Phase B regression. Phase B's deliverable does not touch any code reachable from these three tests' surfaces.

15. **Disagreement-loop preempt: catalog drift vs intentional content** (Phase B-specific). The most likely round-1 adversarial finding is "code X is in the live catalog with non-null `dougFacing` but the master spec normalizes it as admin-log-only" — i.e., catalog drift that Phase B's B.3 alignment SHOULD have caught but the parser didn't derive. Pre-load the reviewer: the alignment direction is **catalog → spec** (master-spec wins); if the parser doesn't derive a row that intuitively "looks admin-log-only," the row is NOT admin-log-only by the §12.4 normalization rule (line 2691 + 2692 enumerate the three accepted null shapes; `(operator log only`, `null`, `none`, `n/a` are explicitly NOT accepted). The plan body's "Explicitly NOT in scope" examples cover this: `LINK_CROSS_SHOW_REUSE` (Doug starts with `(operator log only` per master-spec line 2846 — non-canonical, parser correctly skips) and `STALE_MANUAL_REPLAY_ABORTED` (Doug carries explicit copy per line 2724 — Doug-facing, parser correctly skips). If the reviewer pushes to amend the catalog to include these, redirect to a master-spec amendment instead — Phase B does NOT modify master-spec.

16. **Class-sweep before patching** (memory `feedback_class_sweep_before_patch.md` + `feedback_class_sweep_must_be_code_shape_not_name_list.md`). If adversarial review surfaces a parser miss (e.g., "row X has Doug = `—` but parser doesn't derive it"), do NOT patch only the one row. Run the parser against the live master spec, eyeball the output, and grep §12.4 for ALL rows matching the same shape. Round-by-round whack-a-mole on individual codes burns review rounds; a single structural fix to the parser closes the class.

17. **Iterate until convergence** (memory `feedback_iterate_until_convergence.md`). The X.1 lineage trend is 1–3 adversarial review rounds. Phase B may take 1–2 rounds for simple parser/predicate fixes, 2–3 for any structural reshaping. Keep iterating fix → review → fix → review until APPROVE. Stop only on (a) genuine value-judgment ambiguity (escalate to user), (b) tooling failures, OR (c) APPROVE.

18. **Pre-flight spec deviation captured 2026-05-19 — `PENDING_SNAPSHOT_{ROLLBACK,PROMOTE}_STUCK` are Doug-facing, NOT admin-log-only** (Codex flagged at B.2 mid-execution; verified by orchestrator). Live master spec §12.4 lines 2829 (`PENDING_SNAPSHOT_PROMOTE_STUCK`) and 2830 (`PENDING_SNAPSHOT_ROLLBACK_STUCK`) carry real Doug-facing copy; X.1's generated manifest at `lib/messages/__generated__/spec-codes.ts:617-626` independently confirms `dougFacing != null` for both. The M11 spec r9 prose at `2026-05-12-user-facing-docs-design.md:638` (cites line numbers `2821/2822` for these codes) is stale historical narrative — the live master spec evolved after r9 was authored and acquired Doug copy on these rows. Per AGENTS.md §1.7 + memory `feedback_audit_derives_from_spec_not_handoff.md`: **parser-derived set is the source of truth; the plan-body "Known examples" list is advisory.** Disposition:
    - **B.2 live-spec assertion:** drop `expect(codes).toContain("PENDING_SNAPSHOT_ROLLBACK_STUCK")` (and the symmetric `PENDING_SNAPSHOT_PROMOTE_STUCK` if asserted). Replace with NEGATIVE assertions `expect(codes).not.toContain(...)` for both, cite master-spec lines 2829-2830 in a code comment so future master-spec amendments can detect the contract change.
    - **B.3 alignment:** remove both codes from the "Existing entries to null" target list. They are Doug-facing per live §12.4; nulling their `dougFacing` would break X.1's four-field parity (`tests/cross-cutting/codes.test.ts`).
    - **B.5 canary:** no change needed (re-derives from master spec at every run, so naturally excludes both).
    - **No master-spec amendment.** Master spec is canonical and already in the desired state.
    - **M11 spec r9 prose at line 638:** opportunistic stale-narrative cleanup is OK if cheap, but the operational rule "derive at execution time" insulates the contract from the historical narrative drift. Phase B does NOT block on this cleanup.

    **Pre-loaded for cross-model review:** the Opus adversarial reviewer should NOT relitigate this finding. The contract is parser-output-from-live-spec. If the reviewer surfaces "PENDING_SNAPSHOT_* should be admin-log-only per the plan body," cite this watchpoint + master-spec lines 2829-2830 + X.1 manifest lines 617-626.

---

## §7 Test commands

```bash
# Unit + integration (vitest):
pnpm test

# Phase B targeted runs:
pnpm test tests/messages/catalog-schema-extension.test.ts         # B.1 + B.3
pnpm test tests/messages/extract-admin-log-only-codes.test.ts     # B.2
pnpm test tests/messages/_metaErrorCatalogDocs.test.ts            # B.4
pnpm test tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts # B.5

# X.1 parity test (must stay green after additive schema extension):
pnpm test tests/cross-cutting/codes.test.ts

# Existing M5/M8/M9/M10 catalog tests (must stay green after alignment):
pnpm test tests/messages/                                          # everything under tests/messages
pnpm test tests/messages/_metaAdminAlertCatalog.test.ts            # M9 catalog completeness
pnpm test tests/components/admin/                                  # AlertBanner / AdminParsePanel — alignment may surface drifted tests

# M11 Phase A tests (must stay green):
pnpm test tests/help/

# Lint:
pnpm lint

# Typecheck:
pnpm typecheck

# Manual parser inspection against the live master spec:
pnpm dlx tsx scripts/extract-admin-log-only-codes.ts > /tmp/derived.txt && cat /tmp/derived.txt
```

Pre-flight: all four (typecheck + lint + vitest + Phase A `tests/help/`) green at base SHA `3c29355`.
Post-close-out: all four green at Phase B final SHA + new test files included.

E2E Playwright is NOT exercised in Phase B (no UI surface) but should still pass — confirm `pnpm test:e2e --project=mobile-safari` at close-out as a regression check.

---

## §8 Convergence log (adversarial review)

Format: per-round row appended at the bottom. Round 1's "previous SHA" is the Phase B close-implementation SHA (i.e., the SHA at which all B.1–B.5 commits land).

Phase B close-implementation commits (B.1–B.5 — SHAs filled in as commits land):

**Pre-flight spec deviation captured (2026-05-19, pre-R1):** Codex flagged at B.2 mid-execution that the plan body's expected-derived list contains two stale codes (`PENDING_SNAPSHOT_{ROLLBACK,PROMOTE}_STUCK`) whose live master-spec §12.4 rows at lines 2829-2830 carry real Doug-facing copy. Disposition: spec-canonical (AGENTS.md §1.7) — parser correctly does NOT derive them; B.2 fixture + B.3 alignment list adjusted accordingly. See §6 watchpoint #18 for full rationale. **Pre-loaded for R1: do not relitigate.**

| Task | SHA | Title |
| --- | --- | --- |
| B.1 | `5d081b9` | `feat(messages): extend MessageCatalogEntry with title/longExplanation/helpHref (Task B.1)` |
| B.2 | `1971551` | `feat(messages): admin-log-only derivation parser for master-spec §12.4 (Task B.2)` |
| B.3 | `1daf1b7` | `feat(messages): align all derived admin-log-only codes (existing+new) to null per master-spec §12.4 (Task B.3 — hard gate)` |
| B.4 | `c0c24b6` | `test(messages): catalog meta-test #2 — validator module + 15 forced fixtures; live-catalog assertion deferred to E.13 (Task B.4 — TDD red→green)` |
| B.5 | `cd14865` | `test(messages): catalog-alignment meta-test #17 — long-running canary; verify-red-via-restore (Task B.5)` |

Two-stage review (spec compliance + code quality) APPROVED on every task — N/A under single-implementer Codex flow; convergence is captured at the cross-model adversarial layer instead.

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 Opus adversarial (fresh subagent) | 2026-05-19 | **APPROVE** at `cd14865` | — | — | Fresh Opus subagent (`agentId adae9874a333cd8d7`); confidence 96%. Verified: parser correctly derives from live spec at execution time (no hardcoded lists); B.3 alignment preserved `PENDING_SNAPSHOT_{ROLLBACK,PROMOTE}_STUCK` Doug-facing per watchpoint #18; `contractViolations` enforces both halves of the biconditional with specific violation strings (not a weak boolean); X.1 parity surface untouched (`tests/cross-cutting/codes.test.ts` + `lib/messages/__generated__/spec-codes.ts` unmodified); 15 forced fixtures cover all 7 contract-violation cases; B.5 canary re-derives every run; `BRANCH_PROTECTION_DRIFT` + `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` correctly null-aligned (Doug via `(admin log only — ...)` parenthetical matches `isNullShape` via `\b` after `only`). |
| **Final stop-condition verification at `cd14865`** | 2026-05-19 | **PASSES** all 4 gates | typecheck ✅; lint ✅ (5 existing warnings, 0 errors, predate Phase B); vitest 3512 passed / 5 skipped / **0 failed** ✅; e2e mobile-safari 85 passed / 151 skipped / **0 failed** ✅; `tests/cross-cutting/codes.test.ts` 6/6 ✅; `tests/help/` 19/19 ✅; `tests/messages/` 9 files / 217 tests ✅ | — | Phase B officially closed; Phase C (time utility) unblocked |

---

## §9 Impeccable findings + dispositions (Phase B close-out)

**N/A for Phase B.** Per AGENTS.md §1.8 + M11 plan-wide invariant #5, the impeccable v3 dual-gate fires on UI-surface changes only. Phase B is producer-side (`lib/messages/`, `scripts/`, `tests/messages/`) with no `app/` / `components/` / `globals.css` / `DESIGN.md` / `tailwind.config.*` edits. No `/impeccable critique` or `/impeccable audit` runs are required for Phase B close-out.

If during Phase B execution the implementer is tempted to add a UI file (e.g., a placeholder page or a stub component), STOP — that is out of Phase B scope and would re-trigger §1.8 + UI-always-Opus routing. The renderer for `/help/errors` is Phase E.13's deliverable.

---

## §10 Performance & bundle impact

Phase B adds no new runtime dependencies. The `scripts/extract-admin-log-only-codes.ts` and `scripts/seed-m12-catalog-fields.ts` are devtime-only (run once via `pnpm dlx tsx`). The catalog schema extension adds three `string | null` fields per entry — negligible bundle impact at runtime since the new fields are tree-shakeable when callers don't reference them. Existing `messageFor` callers compile unchanged.

Pre-flight `pnpm install` size: unchanged from Phase A close-out (`e911078`).
Post-Phase B `pnpm install` size: unchanged (no new deps added).
`next build` bundle delta: expected negligible (sub-1 KB across the catalog dataset; verify at close-out).

---

## §11 Linked content deferred / phantom-target audit

Per `feedback_deferral_discipline.md`. Phase B's expected deferrals:

- **Live-catalog full-contract assertion in `_metaErrorCatalogDocs.test.ts`** — DEFERRED to **Phase E Task E.13** (concrete trigger, scheduled home, NOT speculative). The forced-fixture coverage at B.4 is complete; E.13 extends the file by importing `contractViolations` from the same validator module. This is a planned scope split, NOT a deferred-because-blocked item.

- **Doug-facing predicate-entry M11 field backfill** (`title` / `longExplanation` / `helpHref` populated on every catalog entry matching the AC-11.6 predicate) — DEFERRED to **Phase E.5–E.11** (per-page backfill). Phase B leaves these fields `null` on Doug-facing predicate entries; Phase E populates them as it authors each `/help/*` page. The biconditional contract is unenforceable at Phase B close-out until those backfills land — hence the E.13 live-catalog assertion timing.

- **AlertBanner / AdminParsePanel tests that exercised drifted catalog behavior** — UPDATED INLINE at Task B.3 Step 6 (NOT deferred). Per plan body: any test failure in `tests/components/admin/` after the alignment is testing drifted behavior; B.3 updates those tests in the same commit. They should now assert the affected entries do NOT surface to Doug.

Three-bucket routing legend:

- **Land-now:** small mechanical fix, <~30 LOC, no milestone-significant abstraction.
- **DEFERRED.md (per-plan):** blocked on planned future M11 phase (C / D / E / F / G / H / I) with concrete trigger.
- **BACKLOG.md (project-wide):** speculative, no scheduled home, no concrete trigger. Aspirational milestone names are NOT real homes.

No expected `DEFERRED.md` / `BACKLOG.md` entries from Phase B. If adversarial review surfaces items, route per the three-bucket discipline at disposition time.

---

## §12 Sign-off

- [x] Implementer (GPT-5.5 / Codex CLI): 2026-05-19 — final SHA `cd14865`
- [x] Reviewer (Opus / Claude Code cross-CLI fresh subagent `adae9874a333cd8d7`) APPROVE on 2026-05-19 at 96% confidence
- [ ] User review: __ date __

Phase B **closed** in this handoff. Marking in `ROUTING.md` is a follow-up admin step.

Close-out gates satisfied:

- [x] All five Phase-B commits landed (B.1 `5d081b9` → B.2 `1971551` → B.3 `1daf1b7` → B.4 `c0c24b6` → B.5 `cd14865`).
- [x] All Phase-B targeted tests green (`tests/messages/` 9 files / 217 tests).
- [x] X.1 parity test (`tests/cross-cutting/codes.test.ts`) still green (6/6).
- [x] All Phase A tests (`tests/help/`) still green (7 files / 19 tests).
- [x] M9 catalog completeness test (`tests/messages/_metaAdminAlertCatalog.test.ts`) still green (inside the 217-test sweep).
- [x] `pnpm test && pnpm lint && pnpm typecheck` clean at final SHA `cd14865`.
- [x] Adversarial review converged to APPROVE at R1 (no R2 needed).

---

## §13 Meta-test inventory (Phase B introduces / extends)

Per AGENTS.md "Meta-test inventory (mandatory)" writing-plans rule + memory `feedback_meta_test_at_plan_time_not_round_n.md`. Phase B's meta-test footprint:

- **CREATE** `tests/messages/_metaErrorCatalogDocs.test.ts` (M11 test #2) — biconditional predicate + full-contract enforcement via the validator module's `contractViolations()`. Forced-fixture coverage at B.4 (15 cases); live-catalog assertion extension at E.13.
- **CREATE** `lib/messages/catalogDocsValidator.ts` — the validator module imported by both B.4's forced fixtures and E.13's live-catalog assertion. Single source of truth for the contract.
- **CREATE** `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts` (M11 test #17) — long-running canary on master-spec §12.4 derivation. Re-runs the parser on every test invocation, so future master-spec edits surface as test failures (NOT stale hand-list drift).
- **CREATE** `scripts/extract-admin-log-only-codes.ts` — spec-derived admin-log-only enumerator. Imported by B.3 alignment subtask, B.5 meta-test, and (transitively) E.13 live-catalog assertion.
- **EXTEND** `tests/messages/catalog-schema-extension.test.ts` — type-shape assertions (B.1) + alignment assertions driven by parser output (B.3). NOT a long-running canary itself; B.5 is the canary. Phase B closes with both intact.
- **VERIFY** `tests/cross-cutting/codes.test.ts` (X.1's parity test) — stays green after Phase B's additive schema extension. The four-field `SpecCodePayload` deep-compare is structurally insensitive to the three new `MessageCatalogEntry` fields. Verify by running the test after B.1 + B.3 commits.
- **VERIFY** `tests/messages/_metaAdminAlertCatalog.test.ts` (M9 catalog completeness) — stays green after alignment (the meta-test only inspects entries with non-null `dougFacing`; B.3's null-alignment removes affected entries from its scope cleanly).

No CI workflow extensions expected. M11 plan §17.2 governs whether catalog meta-tests need a dedicated CI named-check; per current plan readings, the tests run under the standard `pnpm test` gate and don't need a separate `.github/workflows/x-audits.yml` row. If the implementer encounters a plan-body line indicating otherwise, surface as a question.

---

## §14 Cross-milestone dependencies (Phase B specific)

- **X.1 catalog-parity closed at `2090dc2`** — baseline. Phase B builds on a parity-validated catalog; without X.1's clean baseline, B.3 would inherit and ratify pre-existing drift. With X.1 clean, B.3 only introduces *intentional* alignment changes (`dougFacing: null` on master-spec admin-log-only entries) — the catalog-alignment meta-test (M11 test #17) pins both layers in lockstep.

- **M11 Phase A closed at `e911078`** — Phase A's renderer (`app/help/`) does NOT consume the three new fields yet; Phase E will. Phase B's schema extension MUST NOT break Phase A's existing consumption of `dougFacing` / `crewFacing` / `followUp` / `helpfulContext`. The `app/help/layout.tsx` AdminInfraError catch arm (A.2) uses `messageFor("ADMIN_SESSION_LOOKUP_FAILED").dougFacing ?? crewFacing ?? "Please try again in a moment."` — `ADMIN_SESSION_LOOKUP_FAILED` is NOT in the parser-derived admin-log-only set (per spec analysis), so its existing crewFacing fallback shape is preserved by B.3.

- **Phase C (time utility) is the strict-sequential next phase** per `00-overview.md` r2 sequencing. Phase B closes → Phase C starts. No parallelization permitted (the r2 amendment closed the "F + G can run in parallel" earlier-draft door; same rule applies A through I).

- **X.* siblings (X.2 no-raw-codes, X.4 no-global-cursor) do NOT share Phase B's file surface.** They can run in parallel if a second Codex session is available. Phase B's working-tree discipline (specific `git add` paths, not `git add -A`) keeps cross-talk benign per watchpoint #12. X.3 trust-domain is closed (per memory index); X.4 close-out is the current HEAD commit `3c29355`.

- **Phase D, E, F, G, H, I** all depend (transitively) on Phase B's schema extension landing. Phase E.5–E.11 populate Doug-facing predicate entries' M11 fields; Phase E.13 lights up the live-catalog full-contract assertion. Phase G's affordance retrofit consumes `messageFor(code).helpHref` in `/admin/*` render paths. Without Phase B's schema, none of those phases can begin their TDD red state.
