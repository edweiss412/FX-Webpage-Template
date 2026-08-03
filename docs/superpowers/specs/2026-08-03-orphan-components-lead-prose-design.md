# Orphaned components + the LEAD capability prose — design

**Date:** 2026-08-03 · **Branch:** `chore/orphan-components-lead-prose` · **Base:** `origin/main` @ `369bfcce0`

Settles the two entries `chore/copy-deadcode-sweep` filed on 2026-08-02 because each needed a
decision or a contract read that a copy-sweep diff was not entitled to make:

- **Item A** — `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` (`BACKLOG.md:641`): five components
  under `components/` that no file under `app/`, `components/`, or `lib/` imports.
- **Item B** — `BL-LEAD-CAPABILITY-PROSE-STALE` (`BACKLOG.md:663`): two prose claims that a LEAD
  role flag confers an admin/ops surface.

Both are answer-first, edit-second. The research is recorded here so the next reader does not
re-derive it.

---

## 1. Resolved scope — do not relitigate

Each item below is settled, with its ratification cited. A reviewer verifies the citation rather
than re-deriving the decision.

1. **Expanding `CAPABILITY_TRANSITION_MATRIX` to model `hasFinancials`.** A design change with a
   15-row blast radius; filed as a backlog entry (§7). §4.1's fix is the prose correction plus the
   modeling-boundary statement.
2. **Deleting `TileServerFallback` / `TileErrorBoundary`.** Ratified KEEP (§3.5 item 1); deleting
   them reverses a spec decision and removes a registered alert producer.
3. **Re-opening the §12.4 `ROLE_FLAGS_NOTICE` copy.** Already corrected on
   `chore/copy-deadcode-sweep` (`lib/messages/catalog.ts:895-899`); §4.2 is the SPEC clause only.
4. **Wiring a mount for any of the five.** Each retired component has a live successor named in
   §3.1-§3.4; `WrappedTile`'s absence of a mount is the deliberate state (§3.5).
5. **Regenerating help screenshots.** No rendered surface changes.

---

6. **The four retirements themselves.** Each names a specific superseding commit AND a specific
   live successor (§3.1-§3.4). "Nothing imports it" is the guard's finding, not this spec's
   argument; the argument is the successor.

7. **Keeping `WrappedTile` is a DECIDED terminal state, not unfinished work** (§3.5). The entry
   shrinks from five rows to one and stays open by design; `BACKLOG.md:661` explicitly admits
   "record the blocking dependency in the row's reason" as a resolution.

---

## 2. Probes run on current `main` (not inherited from the filing branch)

### 2.1 Item A — the orphan probe

Re-ran `orphanScan()` from `tests/components/_orphanedComponents.ts` against
`369bfcce0`: **191 files under `components/`, 5 with zero production importers** — exactly the
five in `ORPHAN_ALLOWLIST` (`tests/components/_orphanedComponents.ts:53-79`). The filing branch
measured 192/6 on `c29d3eb68` before `ParsePanel` was deleted; the delta is that deletion. No new
orphan appeared, none of the five was rescued.

### 2.2 Item B — the admin-grant probe

`public.is_admin()` (`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:135-149`)
is, verbatim:

```sql
select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or exists (select 1 from public.admin_emails ae
                where ae.email = public.auth_email_canonical() and ae.revoked_at is null);
```

It never reads `role_flags`. Sweeping every production use of the `LEAD` flag across `app/`,
`components/`, `lib/`, and `supabase/migrations/` finds exactly four families, none of them an
admin path:

| Family | Sites |
| --- | --- |
| Crew-page visibility | `lib/visibility/scopeTiles.ts:86` (audio), `lib/visibility/scopeTiles.ts:97` (video), `lib/visibility/scopeTiles.ts:114` (lighting), `lib/visibility/scopeTiles.ts:141` (financials) |
| Financials entitlement | `lib/data/getShowForViewer.ts:375` (`isLead = isAdmin || derivedFlags.includes("LEAD")` — admin grants LEAD, never the reverse) |
| Capability-change plumbing | `lib/sync/phase1.ts:265`, `lib/sync/phase2.ts:247-249`, `lib/sync/changeLog/writeAutoApplyChanges.ts:159`, `lib/adminAlerts/deriveMessageParams.ts:280`, `lib/log/emitLeadRoleApplied.ts:31-32` |
| Display / parser vocabulary | `components/crew/sections/CrewSection.tsx:203` ("Lead" chip), `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:172`, `lib/parser/roleVocabulary.ts:11`, `lib/parser/types.ts:148`, `lib/parser/invariants.ts:84` |

**Settled: no role flag grants admin access on current `main`.**

---

## 3. Item A — per-component decision

The allowlist is this entry's live ledger. Four components are **retired** (a live successor
renders the same affordance); one is **retained by a ratified KEEP** and its row is amended rather
than removed. Every supersession below is a specific commit plus a specific live successor, not an
inference from "nothing imports it".

### 3.1 `components/admin/PerShowCrewSection.tsx` — RETIRED

Mount removed at `d70761005` (2026-05-31, per-show two-col reskin). The per-show route itself is
now a 307 redirect into the dashboard modal (`app/admin/show/[slug]/page.tsx:1-38`,
admin-show-modal spec §3), and the crew roster is rendered there by `CrewBreakdown`
(`components/admin/wizard/step3ReviewSections.tsx:1594`) with per-row affordances from
`CrewRowActions` (`components/admin/wizard/CrewRowActions.tsx`). `PerShowCrewRow`, the type it
exports, has no importer outside its own test.

**Action:** delete the component, delete `tests/components/PerShowCrewSection.test.tsx`, drop the
allowlist row, and repair the two registries that name it (§5).

### 3.2 `components/admin/ResolveAlertButton.tsx` — RETIRED

Superseded at `67ce6d082` (2026-07-05, "mount bell in both chromes; retire AlertBanner"). The live
dismiss affordance is the trailing ghost Dismiss in `components/admin/BellPanel.tsx:224-312`. The
button's confirm testid `admin-alert-confirm-resolve-button` appears nowhere but the component and
its own test, so the destructive-confirm registry row at
`tests/styles/_metaDestructiveConfirm.test.ts:85` is pinning a surface no user can reach.

**Action:** delete the component and `tests/components/ResolveAlertButton.test.tsx`; drop the
allowlist row, the `_metaDestructiveConfirm` row, and the `accent-button-atom` migrated-files row
(`tests/styles/accent-button-atom.test.ts:60`); repoint the five comments that cite it as a pattern
exemplar (§5).

### 3.3 `components/admin/RunFinalCASButton.tsx` — RETIRED

Superseded at `bd214c04b` (2026-07-06, "unified Step-3 …; delete interstitials"). That commit
deleted the three standalone interstitials and their `ResumeFinalizeButton`; the surviving Step-3
footer (`components/admin/wizard/Step3ReviewWithFinalize.tsx:153-172`) renders `FinalizeTrigger`
plus `CleanupAbandonedFinalizeButton`, and `FinalizeButton`'s `"finish"` mode is the live
finalize-CAS-only path (`components/admin/FinalizeButton.tsx:151`, with the POST at `components/admin/FinalizeButton.tsx:400`). The commit's
own message says it "trimmed FinalizeReentry to the surviving RunFinalCAS/Cleanup contracts" — that
was true of the CONTRACTS, but the button was never re-mounted.

**Action:** delete the component and `tests/components/admin/RunFinalCASButton.test.tsx`; trim the
`RunFinalCASButton` describe from `tests/components/admin/FinalizeReentry.test.tsx` and the import
in `tests/components/admin/RescanSheetButton.test.tsx`; drop the allowlist row and the
`accent-button-atom` row (`tests/styles/accent-button-atom.test.ts:62`); repair citing comments
(§5).

**Coverage note:** `RunFinalCASButton.test.tsx` pins WM-R3 per-row `finalize-cas` regressions (409
handling, per-row codes). That contract is exercised on the live path by
`tests/onboarding/finalize-cas.test.ts` and the `FinalizeButton` suites; the per-row rendering
assertions die with the dead component because the live renderer is `FinalizeButton`'s own
`wizard-finalize-cas-per-row` block (`components/admin/FinalizeButton.tsx:827`), already covered
there. This is stated so the deletion is not mistaken for silent coverage loss.

### 3.4 `components/right-now/RightNowCard.tsx` — RETIRED, with two test files RETARGETED

Superseded at `b327d5eb0` (2026-06-18, "RightNowHero (RightNowCard re-skinned to 5 hero slots)");
its last mount died at `72fb4f8a5` the same day. `RightNowHero` is live at
`components/crew/sections/TodaySection.tsx:614` and carries the card's clock, `lastGood` tracker,
and `prefersReducedMotion` machinery **verbatim** (`components/crew/RightNowHero.tsx:4-15`,
`components/crew/RightNowHero.tsx:332`, `components/crew/RightNowHero.tsx:364`,
`components/crew/RightNowHero.tsx:416`).

Two unit suites still render the dead card directly, and each pins a REAL regression whose fixed
code is what got carried into the hero:

- `tests/components/RightNowCardRecovery.test.tsx` — the Codex round-9 HIGH: stale tint must UNWIND
  on `unknown → show_day_n` recovery instead of pinning the card on `lastGood` forever.
- `tests/components/RightNowCardReducedMotionInitial.test.tsx` — the Codex round-19 MEDIUM:
  `data-prefers-reduced-motion` resolves at mount with no SSR flash.

`tests/components/crew/rightNowHero.test.tsx` covers the 12-state map, per-day anchors, live clock,
stat guards, and the clock freeze — **not** either of these two behaviors. Deleting the card and
its tests would therefore delete the only coverage of two live regressions.

**Action:** retarget both suites onto `RightNowHero` BEFORE deleting the card. The hero exposes
every DOM hook the suites use (`data-stale`, `data-prefers-reduced-motion`, `right-now-state`,
`right-now-body`, `right-now-lead`, `right-now-detail` — `components/crew/RightNowHero.tsx:467-528`);
only the root testid differs (`right-now-hero` vs `right-now-card`). Expected strings stay derived
from fixture inputs, never hardcoded and never imported from the production render helper
(the existing anti-tautology guarantees in each file's header are preserved verbatim, with the
component name updated). If a hero copy or markup difference makes an assertion inapplicable, that
divergence is a FINDING to record in the closeout, not a reason to drop the assertion.

The e2e suites `tests/e2e/right-now.spec.ts` and `tests/e2e/right-now-transitions.spec.ts` drive
the real crew page and therefore already exercise the hero; only their header prose names the card
(§5).

### 3.5 `components/shared/WrappedTile.tsx` — RETAINED, row AMENDED

This is the entry's "shrunk, not emptied" case, and the reason is a ratified KEEP plus a live
contract that depends on the dormancy:

1. **Ratified KEEP.** `docs/superpowers/plans/crew/2026-06-15-crew-page-redesign-phase1/04-layout-migration-closeout.md:10`
   and the design doc at `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md:404`
   both retain `WrappedTile` / `TileServerFallback` / `TileErrorBoundary` explicitly ("Shared tile
   error infra is reused, not deleted"). Invariant 7 — the spec is canonical; a diff does not
   silently reverse a ratified decision.
2. **The dormancy is itself a pinned invariant.** The alerts family spec
   (`docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md:234`
   and `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md:657`) states that `WrappedTile` having no production call site is what keeps
   `TileServerFallback`'s `TILE_SERVER_RENDER_FAILED` producer dormant "and its write-site pin
   honest (§6.2)". `tests/crew/_metaTileProducerTopology.test.ts:169` asserts exactly that.
3. **Over-deletion guard.** `tests/migration/crew-redesign-cleanup.test.ts:30` lists the file in
   `RETAINED`, the list whose stated purpose is catching "accidental over-deletion of retained
   infra".
4. **Cascade.** `WrappedTile` is the ONLY production importer of both `TileErrorBoundary` and
   `TileServerFallback` (`components/shared/WrappedTile.tsx:12-13`; `WrappedSection` composes
   `TileErrorFallback` directly — `components/crew/WrappedSection.tsx:49`). Deleting it does not
   shrink the ledger by one, it GROWS it by two, and the second file is a registered alert
   producer.

There is no mount to wire: the live crew sections are synchronous and use `WrappedSection`
(`components/crew/sections/{Venue,Gear,Crew,Travel}Section.tsx`), the deliberate synchronous analog
documented at `components/crew/WrappedSection.tsx:3-12`. `WrappedTile` is the async `load()` form,
retained deliberately.

**Action:** keep the file and its allowlist row; rewrite the row's `reason` from the sweep's
observational note to the terminal state above, citing the KEEP and the cascade. Amend the backlog
entry rather than archiving it (§7).

---

## 4. Item B — the two prose claims, settled

### 4.1 `lib/visibility/capabilityTransitions.ts:124` — the line is WRONG (stale), not a deliberate model

The disputed line sits inside a block whose own preamble reads "Tile-visibility rules from
`lib/visibility/scopeTiles.ts` (**verbatim branch logic**)"
(`lib/visibility/capabilityTransitions.ts:118-124`). The three sibling lines quote their predicates
in full; the fourth quotes a two-branch `financialsVisible` that stopped being verbatim at
`e348c81ca` (2026-07-16, the FINANCIALS role-flag commit that shipped both the render predicate
and the data-projection entitlement),
which added the third branch now live at `lib/visibility/scopeTiles.ts:141`.

So it is a stale quote, not "an accurate description of a matrix that deliberately models `hasLead`
only". **Recorded for the next reader: WRONG, of the stale-verbatim-quote kind.**

The matrix's five modeled predicates (`CapabilityPredicate`, `lib/visibility/capabilityTransitions.ts:53`) genuinely do not include a
`hasFinancials`, and expanding C(5,2)=10 rows to C(6,2)=15 is a design change, not a prose fix — out
of scope here (§1). But the omission interacts with the matrix's own definition of a delta ("the
flip is SUFFICIENT to change visibility regardless of the other predicate", `lib/visibility/capabilityTransitions.ts:126-131`): a
`hasLead` flip no longer definitively toggles `FinancialsTile` for a viewer who also holds
`FINANCIALS`. The type comment at `lib/visibility/capabilityTransitions.ts:48-51` claims a future predicate addition "surfaces here AND in
the matrix as a TypeScript error" — that mechanism did not fire, because nothing added the flag to
the union.

**Fix:** correct the quoted predicate to `isAdmin || LEAD || FINANCIALS`, and state the modeling
boundary explicitly — the recorded deltas are definitive with respect to the five MODELED
predicates only, and `FINANCIALS` is unmodeled. File the matrix gap as a new backlog entry
(`BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE`) rather than expanding the matrix in a prose PR.
`CAPABILITY_TRANSITION_MATRIX` has no production consumer — its only reader is
`tests/visibility/capabilityTransitions.test.ts` — so the gap is documentary, which is why a
backlog row is the proportionate response.

### 4.2 Master spec MI-9 — the clause is a STALE DESCRIPTION inherited from copy, not encoded intent

MI-9 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`) reads "**LEAD and FINANCIALS
are the capability-granting `role_flags` elements** (both gate `shows_internal.financials` access …;
LEAD additionally grants the admin/ops surface)".

Provenance: the parenthetical entered the spec at `aaab97102` (2026-07-17), the commit that
reconciled §6.8 to LEAD ∪ FINANCIALS. Its diff shows the phrase was lifted from the THEN-LIVE
`ROLE_FLAGS_NOTICE` copy, which said "LEAD status (which grants admin/ops/financials access)". That
copy is exactly what `BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT` corrected on 2026-08-02: the
live catalog row now says only "the roles that unlock internal financials"
(`lib/messages/catalog.ts:895-899`). The spec clause is the last surviving instance of the
corrected claim — a description that went stale when its source string was fixed, not an intent the
code has yet to implement.

**"admin/ops surface" denoted nothing LEAD actually confers.** What LEAD confers beyond FINANCIALS
is scope-tile breadth, not admin access.

**Fix:** correct the clause in place to state what LEAD additionally does (unlocks the
audio/video/lighting scope tiles per `lib/visibility/scopeTiles.ts:86`,
`lib/visibility/scopeTiles.ts:97`, and `lib/visibility/scopeTiles.ts:114`, and renders the
crew-page "Lead" chip per `components/crew/sections/CrewSection.tsx:203`) and to state plainly that
neither capability flag grants admin access, naming `is_admin()`'s two arms. Record the provenance
in the same clause so a future reader does not re-derive it.

**§12.4 lockstep check:** this edit touches §6.8 MI-9 prose only, NOT a §12.4 catalog row — the
`ROLE_FLAGS_NOTICE` row's `helpfulContext` / `longExplanation` were already corrected on
`chore/copy-deadcode-sweep` and are **not reopened here**. No `pnpm gen:spec-codes` regen and no
`lib/messages/catalog.ts` change is required or permitted by this branch. If implementation finds
any §12.4 prose drift, the three-way lockstep applies in one commit
(`tests/cross-cutting/codes.test.ts:69` blocks merge otherwise).

---

## 5. Collateral edit inventory

Every reference below is a comment or registry naming a file this branch deletes. A deleted file's
citations are stale by construction; leaving them is the same defect class the orphan guard exists
to catch.

| Site | Today | Action |
| --- | --- | --- |
| `tests/cross-cutting/no-load-show-crew-with-auth.test.ts:5-8` | `FILES` lists the component + its test | Drop both rows; the surviving row (`app/admin/show/[slug]/page.tsx`) keeps the guard non-vacuous |
| `tests/help/forbidden-prose-registry.test.ts:80` | reason prose: "No copy-URL affordance ships in PerShowCrewSection" | Reword to name the live surface; the registry's assertion is unchanged |
| `tests/styles/_metaDestructiveConfirm.test.ts:85` | `R("components/admin/ResolveAlertButton.tsx", …)` | Delete the row |
| `tests/styles/accent-button-atom.test.ts:59-66` | `MIGRATED_FILES` contains both retired buttons | Delete both rows; extend the existing `ResumeFinalizeButton` de-migration note to cover them (that note is the precedent) |
| `components/shared/AccentButton.tsx:7-8` and `components/shared/AccentButton.tsx:34` | header cites `ResolveAlertButton` + `RunFinalCASButton` as call sites | Repoint to live call sites (`PendingPanelRetryButton`, `FinalizeButton`, `StagedReviewCard`) |
| `app/admin/settings/admins/RevokeRowButton.tsx:7` | "C4 ResolveAlertButton pattern" | Repoint to a live two-tap exemplar |
| `components/admin/RetryWatchButton.tsx:7` | contrasts with "ResolveAlertButton's destructive Dismiss" | Repoint to `BellPanel`'s Dismiss |
| `components/admin/PendingPanelDiscardButtons.tsx:59` | cites `ResolveAlertButton "Confirm dismiss"` | Repoint |
| `tests/components/RetryWatchButton.test.tsx:11` | same contrast in test prose | Repoint |
| `tests/onboarding/finalize-cas.test.ts:513` | "RunFinalCASButton renders per-row codes via messageFor()" | Repoint to `FinalizeButton` |
| `tests/components/atoms/AccentButton.test.tsx:7` | lists `RunFinalCASButton` | Repoint |
| `lib/data/getShowForViewer.ts:213` and `lib/data/getShowForViewer.ts:441` | "the page passes this map to each `<WrappedTile>`'s `load`" | Repoint to the live consumer; the DATA contract is unchanged |
| `components/crew/RightNowHero.tsx` header + eight in-body comments (`components/crew/RightNowHero.tsx:4-15`, `components/crew/RightNowHero.tsx:58`, `components/crew/RightNowHero.tsx:98`, `components/crew/RightNowHero.tsx:332`, `components/crew/RightNowHero.tsx:342`, `components/crew/RightNowHero.tsx:364`, `components/crew/RightNowHero.tsx:416`, `components/crew/RightNowHero.tsx:513`) | provenance comments citing `RightNowCard`, one carrying a line range into the deleted file | Rewrite as retirement-aware provenance (name the commit, drop line ranges that can no longer be checked) |
| `components/right-now/buildRightNowContext.ts:4` and `components/right-now/buildRightNowContext.ts:8` | describes the card as its consumer | Repoint to `RightNowHero` |
| `app/help/_components/Callout.tsx:26-27` | cites `components/right-now/RightNowCard.tsx:520` for the `stale-tint` token semantic | Repoint to the hero's equivalent site |
| `components/layout/Header.tsx:4`, `components/layout/Header.tsx:8`, `components/layout/PageTransition.tsx:8` | cite the card as the live hero | Repoint |
| `tests/e2e/right-now.spec.ts:1-3` · `tests/e2e/right-now-transitions.spec.ts` | headers name the card | Update header prose; the specs themselves are unchanged (they drive the real page) |
| `tests/components/_orphanedComponents.ts:53-79` | five allowlist rows | Delete four; rewrite `WrappedTile`'s reason |

`components/crew/CrewSectionTransition.tsx`, `components/crew/primitives/KeyTimesStrip.tsx:16`, and
`components/shared/TileServerFallback.tsx:16` cite `RightNowHero` / `TileErrorBoundary` /
`WrappedSection` — live files, no edit.

**Class sweep (AGENTS.md).** After the deletions, a bare-string `rg` for each retired identifier
across the whole tree must return only intentional history (this spec, the backlog archive, closed
plan/spec documents). Any other hit is the same bug shape and is fixed in the same commit as its
sibling, not one per review round.

---

## 6. Test contracts

| # | Test | Failure mode it catches |
| --- | --- | --- |
| T1 | `tests/components/_metaOrphanedComponents.test.ts` green with a 1-row `ORPHAN_ALLOWLIST` | A deleted component's row left behind (family b) or a retained file's row dropped (family a) |
| T2 | Retargeted `RightNowHeroRecovery` suite: `show_day_n → unknown → show_day_n` clears stale AND renders the NEW body (asserting a callTime absent from `lastGood`) | The round-9 HIGH regressing in the LIVE component — stale tint pinned on `lastGood` after recovery |
| T3 | Retargeted `RightNowHeroReducedMotionInitial` suite: `data-prefers-reduced-motion` correct at first paint for both `useReducedMotion` values | The round-19 MEDIUM regressing in the live component — SSR flash to a stub state |
| T4 | `tests/crew/_metaTileProducerTopology.test.ts:169` still green | `WrappedTile` gaining a production call site, waking the dormant `TILE_SERVER_RENDER_FAILED` producer whose write-site pin assumes dormancy |
| T5 | `tests/migration/crew-redesign-cleanup.test.ts` `RETAINED` still green | Over-deletion of the retained tile-error infra while emptying the ledger |
| T6 | `tests/docs/_metaInvariant8Closeout.test.ts` green | A plan unit missing its `impeccable-gate:` marker |
| T7 | Full `pnpm test` + `pnpm typecheck` + `pnpm lint` | A deleted module still imported anywhere; a registry row pointing at a deleted path |

T2/T3 are the load-bearing new proofs: they must FAIL if `RightNowHero`'s carried-over logic is
broken, which is what makes them coverage rather than ceremony. Both derive expected values from
fixture inputs; neither imports the production render helper.

---

## 7. Backlog graduation

- **`BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` — AMENDED, not archived.** Four of five resolved;
  `WrappedTile` reaches the terminal state §3.5 describes. The entry stays open with its table
  reduced to the single retained row, its "Fix (when prioritized)" replaced by the settled
  dispositions, and an explicit note that the remaining row is a DECIDED retention (deliberate
  dormancy under a ratified KEEP), not an undecided one — so a future sweep does not re-litigate it
  as unfinished work.
- **`BL-LEAD-CAPABILITY-PROSE-STALE` — ARCHIVED.** Both claims settled and corrected; the entry
  moves whole to `BACKLOG-archive.md` per `BACKLOG.md:5`.
- **`BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` — FILED (new).** The `hasFinancials` predicate gap
  from §4.1: documentary only (no production consumer), effort M (10 → 15 matrix rows plus tests),
  trigger = the next milestone touching scope-tile visibility or the matrix.
- **`BACKLOG.md:7` `Last reconciled:`** gains a new LEADING segment naming this branch and both
  dispositions. Two sibling panes are graduating other rows from the same file concurrently — on a
  rebase conflict, keep BOTH sides (the entries are disjoint; the reconciliation line
  concatenates).

---

## 8. Invariant compliance

| Invariant | Disposition |
| --- | --- |
| 1 — TDD per task | Each deletion is preceded by the guard/test edit that fails without it; the two retargeted suites are written against `RightNowHero` and run RED against a deliberately broken assumption before the card is deleted. One commit per component decision and per prose claim; no batching. |
| 2 — advisory lock | N/A — no code path mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`. |
| 3 — email canonicalization | N/A. |
| 4 — no global sync cursor | N/A. |
| 5 — no raw error codes in UI | N/A — no user-visible copy changes. |
| 6 — commit per task | `chore(components):` / `test(components):` / `docs(spec):` per unit. |
| 7 — spec is canonical | §3.5 is this rule applied: the ratified KEEP outranks the sweep's observation. |
| 8 — UI gate | Deletion-only; no rendered surface is added or changed, and no mount is wired (§1 item 4). Marker: `impeccable-gate: N/A — no UI surface`. |
| 9 — Supabase call-boundary | N/A — no Supabase call site added or moved. |
| 10 — mutation-surface observability | N/A — no mutating route or `"use server"` action added or removed. |
| 11 — worktree only | Branch `chore/orphan-components-lead-prose` at `../FX-worktrees/orphan-components-lead-prose`, created off `origin/main` before the first edit; `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight` all run. |

Routing: `components/` is Opus-owned. Implementation is Opus; Codex is the adversarial reviewer
only.

---

## 9. Dimensional Invariants

**N/A.** This diff introduces and modifies no fixed-dimension parent containing flex or grid
children. Four components are deleted outright and nothing replaces them in any tree; the
remaining edits are comments, test registries, and markdown. No parent-to-child height or width
guarantee is created, altered, or removed, so no real-browser layout-dimensions task is mandated.

## 10. Transition Inventory

**N/A for new state.** No component gains, loses, or changes a visual state. The two retargeted
suites assert transition BEHAVIOR that already ships in `RightNowHero` and is unchanged by this
diff: `show_day_n → unknown` (stale tint applied, `lastGood` body preserved),
`unknown → show_day_n` and `dateless → show_day_n` (stale tint unwinds, new body renders), and
the reduced-motion resolution at mount. Those are pins on existing behavior, not new transitions;
the hero's own inventory is unchanged and lives with the crew-page redesign spec.

---

## 11. Verification

```
pnpm typecheck
pnpm lint
pnpm test -- tests/components/_metaOrphanedComponents.test.ts
pnpm test -- tests/crew/_metaTileProducerTopology.test.ts tests/migration/crew-redesign-cleanup.test.ts
pnpm test -- tests/components/crew                       # incl. the retargeted hero suites
pnpm test -- tests/styles tests/cross-cutting tests/docs
pnpm test                                                # full suite before push
```

Then: real CI green (not local-only — `AGENTS.md` "Local-passes-CI-fails is its own bug class"),
then `gh pr merge --merge`, then fast-forward local `main` to `0  0`.
