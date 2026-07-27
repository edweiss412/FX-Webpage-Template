# Plan — Hotel ambiguity coverage

**Spec:** `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md` (canonical; §-refs below point there)
**Branch:** `feat/hotel-ambiguity-coverage`
**Implementer:** Opus / Claude Code (invariant: UI work is never delegated — `components/admin/UseRawControl.tsx` is in scope)

---

## 0. Why this plan exists in this shape

The spec ran **9 adversarial rounds / 69 findings**, all verified against live code, none refuted. Two vectors never closed in prose:

- **copy truth** — a string asserts something about the algorithm; some reachable input falsifies it;
- **test-oracle discrimination** — a wrong implementation passes the specified tests.

Per `docs/agents/spec-self-review.md:22` a vector surviving three rounds converges structurally, not by more prose. For the oracle vector the structural convergence is **executable tests**: a test either fails against a wrong implementation or it does not, and running it answers the question that reading cannot. The user ratified moving to plan + TDD on 2026-07-25.

**Consequence for every task below:** the failing test is written FIRST and must be demonstrated to fail **for the stated reason** before implementation. Several spec findings were "this test passes even when the implementation is wrong" — so each task names the wrong implementation its test kills.

---

## 1. Meta-test inventory (mandatory declaration)

| Meta-test | Created / Extended | What it pins |
| --------- | ------------------ | ------------ |
| `tests/parser/_metaTransformSitesWalker.test.ts` | **Extended** | `REQUIRED_DECLARATIONS["hotels.ts"]` gains `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`, **plus a new assertion that `hotels.ts` declares ZERO `deferred:BL-` exempts.** The existing walker only checks a code occurs *somewhere*, and `HOTEL_GUEST_SPLIT_AMBIGUOUS` is already present for the structured site — so without the zero-exempt assertion an implementation can flip only the address site, leave `inline guest paths` deferred with its backlog row intact, and pass every declared check (scope-B finding 2) |
| **New** — `tests/parser/_metaSplitHotelNameAddressPropagation` **.test.ts** (created by T4) | **Created** | Source-scans every `splitHotelNameAddress(` call site in `lib/parser/blocks/hotels.ts` and asserts each destructures the ambiguity field and passes it into a stash. Fails-by-default for a new call site. This exists because the inline-no-guest × P3(a) cell is **not behaviorally observable** (spec §3.1 / §8.1) |
| `tests/parser/ambiguityCodes.test.ts` | **Extended** | New code in the expected sorted list; `AMBIGUITY_CODES ⊆ GAP_CLASSES` still holds |
| `tests/messages/_metaWarningCardCopy.test.ts`, `_metaCatalogCopyHygiene`, `_metaErrorCatalogDocs`, `_metaPopoverContextCoverage` | **Extended by data** | New catalog row must satisfy all four; no code change expected, but each is run and named in the task |
| `tests/parser/dataGapsClassCompleteness.test.ts`, `tests/parser/dataGaps.test.ts` | **Extended** | Hard-coded gap-class counts 33→34 and 53→54, plus the test names and comments that embed them |
| `tests/admin/step3Buckets.test.ts` | **Extended** | Exact-map assertion over `FIELD_LABELS` gains `address` |

**Advisory-lock topology:** N/A — this change touches no `pg_advisory*` surface, no RPC, no migration. Declared explicitly per the mandatory rule.
**Layout-dimensions task:** N/A — spec §7.1 records no fixed-dimension parent and no new flex/grid parent-child pair.
**Transition-audit task:** N/A — spec §7.2 records no new state and no new edge; the change adds values to an existing `disabled` reason set.

---

## 2. CI wiring

`BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), so **every new test file is auto-discovered** — no `testMatch` entry and no workflow path-filter row is required. Verified, not assumed. Both `tests/messages/**` and `tests/parser/**` run in the **parallel** project (`vitest.projects.ts:92`) — a scoped `--project serial` run finds no parser tests at all (scope-A finding 8 / scope-B finding 7). No new e2e spec, so no workflow coverage row.

---

## 3. Tasks — VERTICAL slices

**Restructured after plan review (both scopes BLOCKING, 15 findings).** The first draft sliced horizontally — types, then emitters, then UI — and five findings were the same consequence: **no task could be red at its own boundary.** T3 asserted warnings whose emitter arrived in T6; T6's privacy test needed T7's overlay; T5 added a map key whose exact-map test waited until T11; T6 and T7 could not typecheck alone.

Each slice below lands **red → minimal implementation → green → commit** on its own. Where a slice is a pure refactor it says so and names its characterization net instead of a red step.

### S1 — splitter ambiguity signal ✅ DONE (`90589bda2`, hardened `e71d73e86`)

### S2 — `commitHotels` single commit point (refactor)

**No red step, by nature** (scope-A finding 2): current code already emits before `cap()` and already uses `result.length`, so every proposed assertion passes pre-refactor. Its net is the characterization guards landed in `1e17e11ba` — emission order asserted by position, and `blockRef.index` with two survivors.

**The over-cap inline case moved to S5** (R2-A finding 2): inline emission does not exist until S4, so at S2 that test would pass vacuously or fail because the emitter is missing — neither of which is the rank-gate red it claims.

### S3 — the ADDRESS warning, ATOMIC (registration + every gate it trips)

**Why this is one commit and cannot be split.** Plan review R2 found the same defect in both scopes: this repo's structural gates fire the *instant* a code is registered. Adding `HOTEL_ADDRESS_SPLIT_AMBIGUOUS` to `AMBIGUITY_CODES` immediately trips the transform-sites walker (every ambiguity code must be declared); adding the `GAP_CLASSES` row immediately trips the exact-count assertions. So a slice that registers the code without also flipping the deferral and fixing the counts **cannot end green**. The repo's own three-lockstep rule already says this; R2 is that rule applied to the whole gate set.

**Red step:** the P3(a)/P3(b) emit tests — they fail because no emitter exists.

**Everything in the one commit:**

- Registration spec §4 rows **a–i, dd** — master spec §12.4 new row AND the edit to the existing guest row; `pnpm gen:spec-codes`; `pnpm gen:internal-code-enums` (a *different* generator — running only the first leaves `internal-code-enums.ts` stale and fails the x2 gate).
- Rows **u, v, ff, gg** — the `33→34` and `53→54` assertions, the embedded test NAMES, the numeric comments, the explicit ambiguity-code list, the full-universe comment. Unallocated in the first two drafts; both R2 scopes flagged it.
- Row **ii/jj** — `FIELD_LABELS.address` **with** `tests/admin/step3Buckets.test.ts:180`, which goes red the moment the key is added.
- **The S8 work, pulled forward**: flip BOTH `TRANSFORM_SITES` exempts, delete both BACKLOG rows and the section heading, extend `REQUIRED_DECLARATIONS`, and add the **zero-`deferred:BL-`-exempts** assertion (`REQUIRED_DECLARATIONS` alone cannot prove both flipped — the guest code is already present for the structured site).
- Types, `USE_RAW_CODES`, `applyReplacement`, and the six `UseRawControl` sites.
- **Named meta-test runs** (§1 promised these; no slice named them): `_metaWarningCardCopy`, `_metaCatalogCopyHygiene`, `_metaErrorCatalogDocs`, `_metaPopoverContextCoverage`.
- Copy oracles **C9–C17 and C19–C22** byte-for-byte. **C17 was assigned to no slice** in the last draft.

**Required discriminators — every one of these, or a wrong implementation passes:**

| Oracle | The wrong implementation it kills |
| ------ | --------------------------------- |
| Full envelope on every emit: `severity`, complete `blockRef`, exact `rawSnippet`, `name` present only when resolved | `severity:"info"` or a wrong anchor, while code/reason/message/count all match |
| **P0 privacy** on `Hotel #9999 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316` | the unstripped stash — every other P3(b) case is conf-free |
| `resolution.parsed` cross-checked against the ACTUAL reservation | `{hotelName:null, hotelAddress:null}` — the overlay reads only `replacement` |
| `contentHash` derived independently; two snippets differing AFTER collapsing hash differently | a fixed valid 64-hex constant |
| **First-stash-wins by CONTENT** on `71 Wacker Drive 72 Main St Chicago, IL 60601`: survivor is the resolvable P3(b), not the P3(a) from `stripHotelNameConf`'s re-split | last-stash-wins, which silently downgrades a resolvable card to a disabled one |
| P3(a) is `resolvable:false`, reason `no-split-to-undo` | an enabled no-op fix |
| `segmentRawReading` returns TWO segments — a test that REJECTS the one-plain-segment fallback | correct constants, unmarked boundary |
| Wizard renders `(hotel name and address)` | the `FIELD_LABELS` map assertion alone |
| Undo applied at a **non-zero** `blockRef.index` | an overlay branch that always rewrites reservation 0 |
| Two reservations, two address cards, distinct indices | parse-global first-wins |

### S4 — the INLINE GUEST warning, ATOMIC

Reuses the existing code and is never resolvable, so no overlay work — that is why it is separate from S3. But it likewise carries every gate its emission trips.

**Red step:** the row 5 / row 6 discriminator pair.

**In the one commit:** the predicate + emitter; `EXPECTED_CORPUS_WARN_CODES` (goes red the moment raw fixtures start emitting); the **per-fixture** corpus goldens for all 9 warning fixtures and every quiet fixture (S7 folded in — a generic S4 makes family totals pass before S7 could run, so S7 had no red boundary of its own); C1, C4–C8, C18 byte-for-byte.

**Required discriminators:**

- **Row 5 vs row 6** — `Hyatt Place Check In: 5/1 Check Out: 5/2 Eric` MUST emit; `Hyatt Place Check In: 5/1 Check Out: 5/2` MUST NOT. Both parse to `names: []`. Kills `groupIndex === 0 && names.length > 0` and "warn on every group-0 final return". **No other test separates them.**
- **Row 2** — the no-guest early return stays silent (uncovered in the last draft).
- **Row 7** — `exporter-xlsx/consultants`: 2 reservations, exactly 1 card.
- **The three synthetic counterexamples the rewrite dropped**: the Mary-Ann learn-K case, the `Guests:` post-checkout case, the no-delimiter check-in case.
- Full envelope on every emit, as in S3.
- P1 is `resolvable:false`, reason `raw-not-guest-scoped`, **plus** proof a decision for it cannot mutate `names`.
- Per-fixture exact counts and reasons — family totals are satisfied by one fixture emitting zero and another two.

### S5 — simultaneous ambiguities

- **P1 + P3(b)**: `Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316`
- **P1 + P3(a)**: `Hyatt Place Chicago 71 Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316`
- Over-cap **inline** truncation. **This case belongs here, not in S2** — inline emission does not exist until S4, so at S2 it would pass vacuously or fail for the wrong reason.

**Kills:** a `commitHotels` keeping only the first ambiguity per reservation, and structured-only rank gating.

### S6 — propagation across all five callers

9 behavioral cells (5 callers × P3(b), 4 × P3(a)) plus the source-scanning meta-test.

**Each cell asserts the full payload, not mere presence** (R2-B finding 5): unchanged `{name,address}`, full envelope, exact `rawSnippet` for THAT caller, reservation-cross-checked `parsed`, independently derived `contentHash`. A caller can bind the right ambiguity and pair it with the wrong raw cell; a presence-only matrix and the scanner both pass.

**The scanner must be a per-call binding check**, not a file-level token count: for each `splitHotelNameAddress(` site, assert the call's own result binding is the identifier subsequently passed to a stash. Ships with a **negative fixture** — synthetic source where one caller drops its result, asserted to FAIL the scanner.

### S10 — UI quality gate

`/impeccable critique` AND `/impeccable audit` with the canonical v3 setup gates. P0/P1 fixed or deferred via `DEFERRED.md`. Findings recorded in a close-out doc created by this slice, named for this plan with a CLOSEOUT suffix, §12.

**Commits like any other slice.** The last draft exempted it from commit-per-task, which is wrong: it creates a tracked document and may edit `DEFERRED.md` and UI files. Evaluation needs no test; its tracked outputs still need a commit.

---

## 4. Checklist

1. S1, S2, S3, S4, S5, S6, S10 — each red → green → commit. **S2 alone has no red step** (pure refactor; its net is the characterization guards). S10 has no test but still commits its tracked outputs. S7, S8 and S9 are folded into S3/S4, because this repo's structural gates fire the instant a code is registered, so registration and every gate it trips must land atomically.
2. Self-review (numeric + citation sweep over this plan)
3. **Adversarial review (cross-model)** to APPROVE — dispatch SPLIT by scope; a single whole-plan dispatch hit the wrapper's `total_timeout` at 1837s. `--attempt-max-secs` is capped at **1380**; a larger value makes `codex-guard` exit immediately without running
4. Full gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, **`pnpm spec:lint`** on both the spec and this plan (registration edits the master spec, so spec:lint is load-bearing — scope-B finding 6)
5. Whole-diff cross-model review to APPROVE
6. Push → **real CI green** (a separate gate from local green)
7. `gh pr merge --merge` → fast-forward local `main` → verify `git rev-list --left-right --count main...origin/main` is `0  0`

## 5. Snippet-typecheck note

Snippets above are prose-level (type names and call shapes), not paste-ready bodies — deliberately, since the repo's strict tsconfig makes paste-time compile errors a known round-burner. Each slice's real test body is typechecked in its own red step.
