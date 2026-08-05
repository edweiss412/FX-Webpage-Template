# BACKLOG-archive.md

Historical ledger of resolved / shipped / superseded BACKLOG items — full provenance kept (what, why, how it was resolved). The live speculative queue is **[BACKLOG.md](./BACKLOG.md)**; entries graduate here when they ship.

Order follows the original BACKLOG.md layout, not resolution date — **grep by id**. Ids are preserved verbatim so every `BL-*` reference elsewhere in the repo (specs, plans, test comments, `DEFERRED.md`) still resolves to a readable entry.

Same split as [DEFERRED.md](./DEFERRED.md) ↔ [DEFERRED-archive.md](./DEFERRED-archive.md): the working queue stays a queue, the changelog lives here.

---

## BL-BELLPANEL-DISMISS-COMMENT-DRIFT — six BellPanel comments name a label the panel stopped rendering — CLOSED 2026-08-04

The six comments now name the control by its ROLE ("the resolve control") rather than by a verb the
panel stopped rendering, and the pending-state comment names the two real pending labels
("Confirming…" / "Resolving…") instead of "Dismissing…".

**Eight, not six.** Sweeping the shape rather than the named instances found two more the entry did
not count: the module header offered `"Dismiss"/"Retry"` as its example of uncataloged UI chrome
(now `"Mark resolved"/"Retry"`), and the scrim comment described a hypothetical focusable
`"Dismiss"` button — quoted like a label, which is the same misreading in a place where no control
exists at all. It now reads "focusable close button". No occurrence of the string survives in the
file.

**`DESIGN.md` §16 needed no change, which the entry asked to be checked rather than assumed.** Its
wording already names Dismiss only historically — "the bell previously said Dismiss" — while
describing the intent-driven labels as current. It was the source of truth the comments had drifted
from, not another copy of the drift.

Original entry, verbatim:

`components/admin/BellPanel.tsx` calls its trailing ghost control "Dismiss" in six comments
beginning at `components/admin/BellPanel.tsx:224` ("Trailing ghost Dismiss (DESIGN.md §16)", "must
not stay stuck at Dismissing…", "Health rows … have no Dismiss", and so on). The control renders
`Confirm` or `Mark resolved`, chosen by the alert code's intent
(`components/admin/BellPanel.tsx:377-388`, `lib/adminAlerts/resolveActionLabel.ts:73-76`); no
"Dismiss" string reaches the DOM.

**Why filed rather than swept:** it is the same defect CLASS as the branch that found it (prose
asserting something the code does not do) but a different SHAPE — a renamed label, not a citation to
a deleted file — and the branch that found it was retiring components, not editing alert chrome.
Sweeping it in would have grown that diff past its subject. No product question: the code is right
and the comments are stale.

**Fix (when prioritized):** reword the six comments to the rendered labels, and check whether
`DESIGN.md §16`'s own wording still names a Dismiss affordance.

**Trigger:** the next branch touching `BellPanel` or the alert-resolve labels.

---

## BL-CI-STALE-BRANCH-PROTECTION-COMMENT — one-line docs fix — ✅ RESOLVED (2026-07-26, PR2 of the CI-dark cluster) — GRADUATED 2026-08-04 (verified live)

The entry declared itself resolved and asked to be kept in place as a sub-entry of an open parent.
Verified against the tree before graduating rather than trusting the declaration:

- `tests/ci/_metaE2eWorkflowCoverage.test.ts` now states the claim was STALE and corrects it —
  twelve contexts, measured 2026-07-26. The only surviving occurrence of the old phrasing anywhere
  outside the frozen ledger fixture is inside that correction sentence, quoting what it corrects.
- The sibling sweep the entry claims also holds: `BL-E2E-LIFECYCLE-SPECS-CI-DARK` carries both the
  quoted stale phrase and the twelve-context correction, so the second site was fixed, not missed.

**One forward-looking note.** That comment records a DATED measurement (2026-07-26), which is honest
as written. But `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` is an approved, verified-green flip that
would take the required set to THIRTEEN. Whoever lands it should re-measure and update that comment
in the same commit, or it becomes stale again in exactly the way this entry was filed for.

Original entry, verbatim:

**Resolved.** The comment is corrected in `tests/ci/_metaE2eWorkflowCoverage.test.ts`, and the same stale claim was swept from this file's `BL-E2E-LIFECYCLE-SPECS-CI-DARK` entry — it appeared in two places, not one. Kept here rather than graduated to the archive because it is a sub-entry of a still-open parent section, not a standalone item. Original text below for provenance.

`tests/ci/_metaE2eWorkflowCoverage.test.ts:11` states branch protection "deliberately requires ONLY
the `quality` context". Measured live 2026-07-26: `main` requires **twelve** contexts (`quality`,
`unit-suite`, `x1`–`x6`, `validation-schema-parity`, `affordance-matrix-parity`,
`postgrest-dml-lockdown`, `traceability-audit`), and `scripts/generate-traceability.ts` resolves a
third, different list of eight. Any reasoning that treats the repo's e2e jobs as "the only required
check is quality" is wrong — notably, edits to `unit-suite` DO touch a merge-blocking context.

---

## BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY — finding-order comparator is unpinnable for equal `(docLine, code)` pairs — CLOSED 2026-08-04

Closed on `chore/sweep-guards-tests` with the entry's own suggestion: the message as a third sort
key, making the comparator total over the fields a Finding varies in. Extracted as an exported
`compareFindings` so the ordering RELATION is testable directly, and placed BELOW
`checkTaskContract` (declarations hoist) so the mutation registry's line-keyed siteIds above it keep
their coordinates — putting it at the top invalidated fifteen rows at once.

**Both `accepted-gap` rows retired in the same commit**, and the surface now carries NONE: they
described this exact blind spot, and it is closed rather than re-accepted. The gate needed three
further things the entry did not mention, each a real hole — `suitePaths` had to gain the new suite
(nine mutants survived for want of any listed suite that called the function), the suite must import
relatively rather than through `@/` (an aliased import resolves past the runner's substituted
mutant), and the six remaining survivors needed classifying, all six argued from control flow rather
than from V8's sort being stable — which is what the old rows rested on. `pnpm mutation:guards` 8/8.

Original entry, verbatim:

Two source mutants of the `findings.sort(...)` comparator at `lib/specLint/taskContract.ts:247` survive the suite and cannot be killed through the function's output: `a.code > b.code` → `>=` and the final `: 0` → `: 1`. Both are reached only when `a.docLine - b.docLine` is `0`, and each differs from clean behavior only when the two `code` values are ALSO equal — for unequal codes both take an identical path.

Such a pair is reachable: `ac=AC-90,AC-91` with both ids unresolved emits two `TASK_AC_UNRESOLVED` findings on one line, sharing `(docLine, code)` and differing only in `message`. Probed against the real `checkTaskContract` on `node v20.20.1` — clean `AC-90,AC-91`; `>=` mutant `AC-90,AC-91`; `: 0`→`: 1` mutant `AC-90,AC-91`. Neither reorders.

A **third** mutant of the same comparator, `a.code < b.code` → `<=`, was originally filed here and does NOT belong: it reverses the pair to `AC-91,AC-90`, so it is killable and was repaid by test in the same arc. It was misfiled because the first probe sorted elements identical in every field, a fixture that cannot express a reversal and therefore reported "no difference" for a mutant that plainly reorders real findings. That trap is recorded as documented limit **L-8** of `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`.

The two survivors are ledgered `accepted-gap` (not `equivalent`) in the source-mutation registry and counted as survivors, costing ~2.4 points of that surface's mutation score. `equivalent` would overclaim: an inconsistent comparator is implementation-defined in ECMA-262, so the argument rests on V8's stable sort rather than on control flow — documented limit **L-7** of the same spec.

**Closing this** means making the comparator total so no equal-key pair exists — add a third tiebreak (e.g. `message`), after which both mutants become killable and their ledger rows go stale, which the gate reports rather than absorbs.

**Deferred from `feat/mutation-gate-guard-surfaces` under class-sweep exception (a) — it needs a product decision this PR cannot settle.** Ordering for same-line, same-code findings is `spec:lint`'s user-visible report contract; that arc ships a mutation harness plus test debt and touches no `taskContract.ts` product code. The sweep itself was complete — all three comparator sites were found and classified together, one repaid and two ledgered — so this entry covers every remaining instance of the class, not one peer of several.

---

## BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT — a durable event for a committed row is skipped when the outer finalize rolls back — CLOSED 2026-08-04

Closed on `chore/sweep-guards-tests`. The emit moved into `DeferredApplyEmits` — the accumulator
its two sibling emits already used — and is flushed in EACH finalize handler's `finally`, so it
lands post-commit on the success path and the rollback path alike, on the streaming handler as well
as the non-streaming one.

**The defect was PLACEMENT, not loss**, and that distinction drove the test design: the inline emit
DID fire on a rollback, so an occurrence-only assertion is green against the bug. Each case pins
that the emit's tick lands AFTER `withTx` settles. The route's old comment claimed "outside the lock
txn" on the strength of the ROW transaction having committed, which is the wrong transaction.

It also surfaced a real gap in the invariant-10 registry: Assertion 1 required the registered route
file to contain `await logAdminOutcome(`, so a surface that DEFERS its emit failed for doing exactly
what invariant 10 demands. Rows may now declare `emittedVia`.

Original entry, verbatim:

`logAdminOutcome({ code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED", … })` (`app/api/admin/onboarding/finalize-cas/route.ts:1025-1038`) fires inside `runFinalizeCas`, which runs inside the outer `deps.withTx` holding `tryFinalizeLock` (`app/api/admin/onboarding/finalize-cas/route.ts:905`). The row mutation it describes commits in its own `withRowTx`, independently of that outer transaction — so when the outer commit fails, the mutation stands and the event describing it is silently skipped.

**The exposure is the lock, not a lost event.** The emit fires after `withRowTx` resolves (`app/api/admin/onboarding/finalize-cas/route.ts:968-970`, `:1020-1022`) and before the outer transaction finishes, so a later outer rollback cannot retract it — an earlier draft of this row claimed the event was skipped, which is wrong. What is true is that it runs while `tryFinalizeLock` is still held, which is the invariant-10 posture AGENTS.md states for emits ("POST-COMMIT, outside any advisory-lock tx"). Its neighbour `SHOW_FINALIZED` shares the placement, but both finalize routes have deliberate, test-pinned behavior for it (ordinary finalize suppresses on outer failure, `tests/onboarding/finalize.test.ts:864`; finalize-cas preserves it, `tests/onboarding/finalize-cas.test.ts:685-686`), so it is not in this row's scope.

**Why this is exception (a), not a mechanical fix.** Moving the emit outside the lock also changes when it fires relative to an outer rollback, and whether an operator should hear about an exhausted shadow rebuild belonging to a finalize attempt that then failed is a product question about their mental model. If the answer is yes, the fix is the accumulator-and-`finally` pattern the closing branch establishes for its own emits. Surfaced by cross-model review R9 of that branch, which identified the placement while the branch had no basis to settle the semantics.

---

## BL-REALTIME-BROADCAST-FRAME-DROP-WATCH — ~9% local broadcast-frame loss on a healthy socket — CLOSED 2026-08-04, watch found nothing

INVESTIGATION discharged on `chore/sweep-guards-tests`. The entry's own decision rule was retry
frequency in the realtime-dependent CI history, on the reasoning that a real drop rate would be
absorbed by retries rather than by failures. Sampled 2026-08-04, 60 runs per workflow:

| workflow                                        | failures / 60 | flaky in 4 sampled green runs |
| ----------------------------------------------- | ------------- | ----------------------------- |
| `published-modal-e2e` (the realtime-heavy spec) | 2             | 1                             |
| `phantom-gap-e2e`                               | 0             | 0                             |
| `lifecycle-layout-e2e`                          | 0             | 0                             |
| `crew-e2e` (broad, not realtime-specific)       | 6             | not sampled                   |

A subscriber missing ~1 frame in 11 would fail assertions routinely; the realtime-dependent specs
are effectively clean, with a single flaky case across the sample. So the ~9% loss does NOT
reproduce in CI, which is exactly the outcome the entry predicted for a local-stack artifact: "if
the drop rate is an artifact of the local stack it should disappear against validation/prod". No
reconcile-on-focus fallback is owed.

**Bounded honestly:** CI is not production, and Playwright retries could in principle absorb a
small drop rate without surfacing as flaky. What is established is that the rate is nowhere near
9% anywhere but the local stack. A production report of missed realtime updates re-opens this with
new evidence rather than re-running the same sample.

Original entry, verbatim:

PR #505 measured local realtime silently dropping ~9% of broadcast frames on an otherwise healthy socket; absorbed by CI runner retries and explicitly NOT a code defect of that diff. Filed as a watch item so the observation is not lost: if the drop rate is an artifact of the local stack it should disappear against validation/prod, and if it does not, subscriber code that assumes every broadcast arrives needs a reconcile-on-focus fallback.

**Work:** sample the realtime-dependent e2e/CI history for retry frequency before deciding whether there is anything to fix.

**Status:** open (watch).

---

## BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR — the recognizer signals unresolvable sites, but a narrowed scan scope drops codes with nothing to signal — CLOSED 2026-08-04

Closed on `chore/sweep-guards-tests` with the anchor the entry's Work section specifies: a
committed code set (`tests/parser/_warningCodeAnchor.ts`, 58 codes) compared by EQUALITY, so a
narrowed scan scope fails loud in both directions and its diff is the review artifact. Verified by
planting a code the scan does not produce and watching the guard name it, rather than assuming the
comparison works.

**Checked the subsumption question first, as the entry instructs.**
`BL-CATALOG-PARTITION-WARNING-CLASS` would genuinely subsume this — its fix makes the catalog
ENUMERATE its warnings instead of having a scanner infer them, after which the scan stops being the
source of truth and the scope question evaporates. It is not closed as a duplicate today because
that fix has not shipped (M effort, its own branch), and closing it as one would leave the
silent-narrowing failure mode guarded by nothing in the meantime. The anchor is marked INTERIM in
its own header and says to delete it when that entry lands.

Original entry, verbatim:

`scanParseWarningSites` is fail-closed for sites it VISITS: a construction whose code the checker cannot resolve is signalled rather than dropped (`lib/messages/__internal__/parseWarningSites.ts`). The scope it visits is a different question. `inWarningScanRoots` (`scripts/extract-internal-code-enums.ts:42-49`) is a hand-written predicate — `^(lib|app)/`, minus `lib/dev/`, the generated dir, and `catalog.ts` — and **a file the predicate never admits produces no site, so there is nothing to signal.** Narrow the predicate, or land an emitter outside `lib/`|`app/`, and the universe shrinks silently while every existing assertion stays green.

Probed on the abandoned branch, against an equivalent recognizer: excluding one contributing file dropped the code set 57 → 51 while `unresolved` stayed empty; tightening a pre-filter _within_ files dropped 22 of 57 codes with the contributing-FILE set unchanged, which is why a file-list anchor does not close it either. Twelve root-level source files sit outside `^(lib|app)/` today, including the live Next.js entry point `instrumentation.ts`.

**Work:** give the scan an anchor independent of its own output — a committed golden snapshot of the code set, compared by equality, so a narrowing fails loud in both directions and its diff is the review artifact. The trade is explicit: a hand-maintained list, justified not by size but by failure mode (it cannot rot silently the way the deleted `EXTRA_WARNING_CODES` residue could). Alternatively `BL-CATALOG-PARTITION-WARNING-CLASS`, already filed as the closure for the related soundness question, may subsume this — check it first, and close this as duplicate if it does.

**Status:** OPEN.

---

## BL-LEDGER-BODY-DEFINED-ID-OVERMINT — any bold lone id at a bullet lead defines, so a mention can mint an id — CLOSED 2026-08-04

Closed on `chore/sweep-guards-tests` by adding condition 4: a body-defined id must be SEPARATED
from what follows it (em dash, colon, or nothing at all). Prose running straight on from a bold
lead is a sentence about that id, not a definition of it.

**Probed before tightening**, as the entry and the finding-admissibility contract both require.
`tests/docs/ledgerBodyIdOvermint.test.ts` demonstrates the corruption against the SHIPPED
function first — a bullet reading "bold-id is tracked separately" minted that id, and a bold typo defined the
typo, which is the one direction the citation guard cannot catch because the misspelling resolves
itself. The three pre-existing conditions are re-pinned alongside, and the real ledgers are
asserted to still mint exactly the eight ids they minted before: a tightening that silently
dropped a live id would be a worse defect than the over-mint it fixes.

Original entry, verbatim:

`bodyDefinedIds` (`tests/docs/_ledgerMdast.ts:346`) does not require a separator after the bold id,
so any bold lone id at a bullet lead defines. A bullet whose bold id is followed by ordinary prose,
or by a colon, mints that id exactly as a real sub-item definition would; a nested bullet and a
backticked enumeration both correctly do not. The five-shape probe with its outputs is in
`docs/superpowers/specs/2026-08-03-ledger-claim-visibility-design.md` §9.2 — deliberately not
reproduced here, because its planted ids would need citation exemptions in this ledger.

Latent, not live: main mints exactly the intended eight ids today. But it over-mints in the
direction the guard exists to prevent — a bullet naming a sibling id in bold makes that id resolve,
so a typo can define itself. Deferred out of `chore/ledger-claim-visibility` under exception (b) of
the `AGENTS.md` class-sweep disposition rule: the originating brief fenced it explicitly. Any
tightening needs a probe demonstrating the corruption it prevents, per the finding-admissibility
contract.

---

## BL-CANONICAL-CLASS-ARRAY-BLINDSPOT — CLOSED 2026-08-04, bounded by census

The blind spot is real and confirmed against the plugin source, and it is now **bounded**: `tests/specLint/canonicalClassArray.test.ts` enumerates every array-join className in the tree and fails on a new one, in both shapes the pattern takes. The set the linter cannot see can only shrink. Proven by planting a site and watching the guard reject it, not by assuming the recognizer works.

The 33-site migration is filed as `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` — see it for why it did not land here, and for the correction to this entry's prescribed fix (`cn` does not exist in this repo).

---

## BL-FEED-BUTTON-SUCCESS-ANNOUNCE — SHIPPED 2026-08-04

Shipped on `feat/sweep-ui-a11y`. Accept, Approve and Reject now announce their SUCCESS
through the same live-region channel that already carried Undo's: "Change accepted" /
"Change approved" / "Change rejected", the generic verb form ratified at spec
`docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §4.5 item 2. No row name in
the utterance — unlike the undo sentence, which quotes its summary because it must say which
claim stopped being true, these announce an action the listener just took on the row they were
already on.

The three strings live beside `undoneAnnouncement` in `components/admin/undoAnnounceContext.ts`
so the two surfaces provably say the same words, and each is announced from INSIDE its action's
async continuation rather than from an effect: on success the row leaves the feed on
revalidation and the component unmounts, and an effect scheduled on that commit is not
guaranteed to run. `tests/components/feedButtonSuccessAnnounce.test.tsx` asserts the string that
reaches the region, scoped inside the real provider's region and with that region stripped from
a clone of the rest of the tree, so no sibling can supply the words.

Original entry, verbatim (title: Accept and Approve/Reject announce failures but not successes):

**Filed:** 2026-08-03 from `feat/sync-feed-undo-announce`. **Class:** a11y asymmetry. **Effort:** S.

That branch gave Undo a success announcement and made all three feed action buttons announce their FAILURES (the card wrapper is now an always-mounted `role="status"`). Accept and Approve/Reject were deliberately left without success announcements: the mechanism is free now (consume `UndoAnnounceContext`, call `announce`), but the COPY is a product decision, not a mechanical one — "Change accepted"? naming the row? saying what acceptance means? Undo's copy took two review rounds to settle punctuation alone.

**Work:** decide the copy for each, then reuse `undoneAnnouncement`'s shape in `components/admin/undoAnnounceContext.ts`.

**Status:** OPEN.

---

## BL-IDENTITYCHIP-SR-SEPARATOR — SHIPPED 2026-08-04

Shipped on `feat/sweep-ui-a11y` as the entry's own promotion mechanics specify: an `aria-label`
of "<name>, <role>" on the parent span (`components/auth/IdentityChip.tsx`). It OVERRIDES the
children's text rather than adding to it, so the visible run is byte-identical and no comma
reaches the screen — asserted, since an SR-only fix that changes the visual is a regression.

**The promotion prerequisite was not a fence, and the screen said why.** The entry gated
promotion on an audit pass or a crew complaint, but "genuinely speculative" applied to whether
anyone would COMPLAIN about the run-on phrasing, not to whether it happens — it happens
deterministically. Beyond the entry: either part can be blank during a picker round-trip, and
`${name}, ${role}` would then speak "Eric Weiss," — a worse utterance than the run-on it
replaces. The parts are joined only when both are present, and both empty-side cases are covered.

Original entry, verbatim (title: `<name> · <role>` separator SR experience polish):

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 3 — post-pick header chrome audit P3).

**Effort:** S

**Description:** IdentityChip renders `<name>` + `·` separator + `<role>` as flat siblings inside a single span. The `·` is `aria-hidden="true"` so SRs don't announce the punctuation, but they read "Eric Weiss Lead A2" as a flat phrase rather than "Eric Weiss, Lead A2" (proper pause). A `aria-label="Eric Weiss, Lead A2"` on the parent span (or wrapping in a comma-separated visually-hidden duplicate) would tighten the experience.

**Why backlog, not deferred:** The current SR behavior is acceptable per WCAG (no ambiguous content, no missing context). The polish is genuinely speculative — depends on whether SR users complain about the run-on phrasing.

**Promotion prerequisite:** EITHER (a) an a11y audit pass picks it up as part of a broader SR-experience review, OR (b) a crew member reports the issue.

**Promotion mechanics:** Add `aria-label={`${name}, ${role}`}` to the parent `<span>` and visually-hide the middle dot separator. ~3-line edit.

screen-disposition 2026-08-04: KEEP — not a hypothetical about a surface that does not exist. The markup is live and reads as claimed: `components/auth/IdentityChip.tsx:46` is the parent span, `:48-50` the `aria-hidden` middle dot, `:51` the role span, all flat siblings, mounted at `app/show/[slug]/[shareToken]/_CrewShell.tsx:467`. The body's "genuinely speculative" applies to whether anyone will COMPLAIN, not to whether the run-on phrasing happens — it does, deterministically. Closing on `feat/sweep-ui-a11y` (a ~3-line edit on the branch that already carries the impeccable dual gate) costs less than carrying the row.

---

## BL-TERMINAL-FAILURE-ICON — SHIPPED 2026-08-04

Shipped on `feat/sweep-ui-a11y`. A lucide `AlertCircle` sits above the h1 at `--icon-lg` (32px,
DESIGN.md:382) in `text-text-subtle`, exactly as the entry's promotion mechanics specify.
DESIGN.md §1 bans red/green as primary semantic colors, which is right and which left this
surface nothing but its copy to say it IS a failure; the icon says it in form rather than hue.

`aria-hidden`, deliberately: the h1 directly below already states the failure, so an announced
icon would only prepend "alert circle" to a sentence that says it better. The suite pins DOM
ORDER rather than presence — "above the h1" is the entire request, and an icon under the retry
link satisfies a presence check and nobody looking at the screen — plus decorativeness, both
documented tokens, and the no-retry variant.

**The telemetry prerequisite was a PRIORITIZATION gate, not a real one**: nothing about adding
the icon can be wrong before the telemetry arrives, so honoring the entry never required waiting.

Original entry, verbatim (title: visual failure cue beyond muted gray):

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 2 — TerminalFailure critique LOW).

**Effort:** S

**Description:** `<TerminalFailure>` uses the muted text-text-strong / text-text-subtle palette and renders as a centered max-w-md block. DESIGN.md §1 correctly bans red/green as primary semantic colors, but the surface has no iconography or shape signal that this IS a failure render. A neutral icon (e.g., lucide-react `AlertCircle` or `CloudOff`) above the h1 would improve glance-ability without violating the color-blind floor.

**Why backlog, not deferred:** The surface is rare in production — only renders on infra-error paths. Crew will encounter it at most a few times per quarter. Adding an icon is a glanceability nicety, not a recovery affordance gap (the new retryHref already closes that).

**Promotion prerequisite:** EITHER (a) a polish pass picks it up as part of a broader auth-surface visual update, OR (b) production telemetry shows TerminalFailure is rendering often enough that glanceability becomes load-bearing.

**Promotion mechanics:** Add an icon (lucide-react `AlertCircle`) above the h1, sized at `--icon-lg` (32px), in `text-text-subtle`. ~5-line edit.

screen-disposition 2026-08-04: KEEP — the promotion gate the body names ("production telemetry shows TerminalFailure is rendering often enough") is a PRIORITIZATION gate, not a prerequisite: nothing about adding the icon can be wrong before the telemetry arrives, so honoring the entry does not require waiting. Surface verified live — `components/auth/TerminalFailure.tsx:47-51`, no icon and no lucide import today. Closing on `feat/sweep-ui-a11y` as a ~5-line edit under the dual gate.

---

## BL-AUTH-INTERSTITIAL-FONT — SHIPPED 2026-08-04

Shipped on `feat/sweep-ui-a11y`, and the entry's own framing was refuted first. It offered two
bad options — inline `@font-face` per document (a SECOND font-delivery mechanism, the objection
that keeps `BL-HARNESS-FONT-FIDELITY` open) or route the four through React (a far larger change
to auth plumbing than a font justifies) — and missed the third path sitting in its own sibling:
`app/auth/sign-out/route.ts` already inlined a `<style>` block DECLARING a system stack. That
names a typeface without shipping one.

Landed by extracting that document into `lib/auth/interstitialDocument.ts` and pointing all four
routes at it, rather than pasting the style block three more times. The duplicated `<head>` is
precisely how three of the four drifted away from the fourth, so one builder is both the fix and
the guard against recurrence; the source-level half of
`tests/routes/authInterstitialFont.test.ts` fails any route that grows its own `<head>` back.

The negative assertions are the load-bearing ones — no `<link>`, `@import`, `@font-face`,
`<script>` or absolute URL. These documents are reached BECAUSE a request already failed, so a
webfont would add a first network dependency at the worst possible moment. That is a rule about
standalone documents, not a general one: the app's own fatal-error page binds the real font.

Original entry, verbatim (title: four hand-built HTML auth responses mount no React root, so they miss the app font):

**Filed:** 2026-08-03 (`feat/font-binding-modal-freshness-cue`, adversarial review R5). **Class:** consistency / completeness. **Effort:** S–M depending on the approach chosen.

Four route handlers build and return a complete `<html>` document as a string, so neither Next root renders them and neither the font loader's generated class nor the app stylesheet reaches them: `app/api/auth/google/start/route.ts`, `app/api/auth/picker-bootstrap/route.ts`, `app/auth/callback/route.ts`, and `app/auth/sign-out/route.ts` — the last of which explicitly sets `system-ui, sans-serif` in its own inline style.

**What they are.** Persistent ERROR documents with readable copy and no automatic redirect: a 503 from the Google-auth start, 403/502 from the picker bootstrap, a 503 from the auth callback, and a 500 from sign-out carrying explanatory copy and a retry button. A user who lands on one reads it. (An earlier filing called them transient bounces; review R6 corrected that, and the correction matters — the disposition below rests on the accurate reading.)

**Why it was not fixed with the font binding.** Sign-out's explicit `system-ui, sans-serif` rests on one narrow, checkable fact: it is a self-contained document that requests **zero external assets** (it inlines its own `<style>` block — it is NOT styleless, a claim review R8 disproved). A webfont would add its first network dependency, on a page reached because a request already failed. This is NOT a general "error pages should avoid webfonts" principle, which would contradict the app's own fatal-error page, where the font IS bound. The real gap is the other three, which fall to browser defaults: a serif nobody chose. Covering them means either inlining an `@font-face` into each hand-built document, which is a SECOND font-delivery mechanism, or routing them through React, which is a far larger change to auth plumbing than a font justifies. Recorded as a documented limit rather than left as an implied-but-false "app-wide" claim.

**Citation corrected 2026-08-04** (`feat/harness-font-fidelity`, PR #705): this paragraph cited `BL-HARNESS-FONT-FIDELITY` as the precedent for keeping a second font-delivery mechanism out, and that row has since GRADUATED — by adopting exactly one. Removed rather than re-pointed, because the resolution does not transfer: the harnesses got fidelity by reading the SAME `app/fonts.css` the app reads, one mechanism serving two consumers, while these four documents are hand-built strings with no stylesheet link. The disposition this entry closed on is unchanged; only its borrowed justification is.

**Work:** the three pages that fall to browser-default serif are the real gap — the Google-auth start, the picker bootstrap and the auth callback. Sign-out already carries an explicit system stack and is the LEAST urgent of the four, not the most. Worth pairing with any future pass over the auth interstitials rather than doing on its own.

screen-disposition 2026-08-04: KEEP — and the entry's own dichotomy is REFUTED by a precedent already in the tree. The body argues both directions are bad ("either inlining an `@font-face` into each hand-built document, which is a SECOND font-delivery mechanism … or routing them through React"), but `app/auth/sign-out/route.ts:33` already takes a THIRD: an inline `body{font:16px/1.5 system-ui,sans-serif;…}` — a stack DECLARATION, not a delivery mechanism, with zero external assets and no React. Probed 2026-08-04: the other three documents (`app/api/auth/google/start/route.ts:24-37`, `app/api/auth/picker-bootstrap/route.ts:38-48`, `app/auth/callback/route.ts:49-62`) carry charset/title/viewport and nothing else, so they fall to browser-default serif while their sibling does not. Closing on `feat/sweep-ui-a11y` by extending the sign-out precedent to the other three; `app/auth/**` is an invariant-8 UI surface, which is why it lands on the dual-gate branch.

---

## BL-RATE-LIMIT-SNAPSHOT-DURABILITY — DEMOTED TO A DOCUMENTED LIMIT 2026-08-04

Demoted by the 2026-08-04 ledger filing bar. The entry is the clearest
conservative-plus-surfaced case in the queue, and says so itself three times: "The R-series ratified
this as a zero-impact bound", "No production data is ever at risk (validation Supabase only)", and
"this entry exists only so the idea isn't lost if rate-limit fixtures ever prove flaky in practice."

**Probed 2026-08-04.** The store IS file-backed rather than transactional, exactly as claimed —
`scripts/validation-report-fixtures.ts:77-80` defines `SNAPSHOT_DIR = ".validation-state"` with the
admin and crew snapshot JSON paths, written at `:341` and read at `:346`. So the crash window between
the seed commit and the snapshot rewrite is real. What it does on hitting that window is the whole
point: it WARNS and refuses rather than restoring a possibly-stale prior, with a refuse-existing
guard at `:409-414`, an identity match at `:419-427`, and two explicit escape hatches
(`--force-overwrite-snapshot` at `:122`, `--force-cleanup-without-snapshot` at `:136`). The blocking
constraint on the repair is also real:
`supabase/migrations/20260527204241_validation_state.sql:5` pins `key text PRIMARY KEY CHECK (key =
'validation_seed')`, so a DB-transactional snapshot store needs that CHECK widened first.

**The limit now lives in the code it constrains.** `scripts/validation-report-fixtures.ts` already
carried the crash window in a comment on the snapshot `status` field; that comment now also names
this demotion, the un-defer trigger verbatim, and the CHECK that gates the repair. `scripts/**` is
not a UI surface, so the record could go where it belongs.

screen-disposition 2026-08-04: DEMOTE — probed file-backed store, worst case is a warn-and-refuse on
a validation-only surface, un-defer trigger preserved in the guard file and here.

The original entry follows verbatim, with its in-flight status marker removed on archiving per
invariant 12 — archives categorically reject in-progress work.

### BL-RATE-LIMIT-SNAPSHOT-DURABILITY — DB-backed snapshot store for rate-limit fixture seed/restore

**Filed:** 2026-05-28 from M12 Phase 0.E close-out §6 finding 3 (R9 durability residual).

**Description:** The `validation:report-fixtures` rate-limit-admin / rate-limit-crew outcomes persist their pre-seed `(prior_count, recorded_hour_bucket, identity)` snapshot to a file-backed store at `.validation-state/rate-limit-{admin,crew}-snapshot.json` (gitignored) so cleanup can restore the exact pre-seed bucket state. A crash in the narrow window **between the rate-limit seed-commit (DB write) and the snapshot-file rewrite** leaves the snapshot stale — cleanup would then restore the wrong count (or the refuse-existing-snapshot guard blocks re-seed until manual file removal). The R-series ratified this as a **zero-impact bound** under the file-backed-only strategy: the window is sub-second, the blast radius is one validation-Supabase rate-limit bucket, and the R43 F39 refuse-existing-snapshot guard + `--force-overwrite-snapshot` escape hatch + unlink-on-cleanup semantics bound the failure to "operator re-runs cleanup with the force flag." No production data is ever at risk (validation Supabase only).

**Why backlog, not deferred:** Fully closing the crash-window requires authorizing a **DB-side snapshot table** so the snapshot write shares the same transaction as the seed-commit (atomic seed+snapshot). That's a **scope expansion beyond M12**: `validation_state` cannot be the backend (its `CHECK (key = 'validation_seed')` singleton constraint rejects any other key, and the table is RLS-locked + REVOKE-locked per R17), so closing this means a new migration adding a dedicated snapshot table + its RLS/REVOKE posture + RPC-gating registry row (per the postgrest-dml-lockdown class-wide invariant) + the harness rewrite to write snapshot-in-transaction. None of that is scoped or planned. The file-backed strategy is the ratified M12 design; this entry exists only so the idea isn't lost if rate-limit fixtures ever prove flaky in practice.

**Promotion prerequisite:** EITHER (a) observed real flakiness from the crash-window during Phase 1 walks or future validation runs, OR (b) a broader validation-tooling-durability milestone that justifies the new snapshot table + its full lockdown posture. Absent either, the file-backed bound stands.

---

## BL-LEDGER-MDAST-SHARED-HOME — DEMOTED, NO DEFECT TO SCHEDULE 2026-08-04

Demoted by the 2026-08-04 ledger filing bar, and the only row in the screen with NO failure mode at
all — not a conservative one, not a latent one. The entry's complaint is that `scripts/**` imports
from `tests/**`, which "is backwards"; its own class field says `module placement` and its whole
prescription is "Relocating it beside its consumers is the repair."

**Probed 2026-08-04: nothing is broken, and nothing would break.** `tsconfig.json` carries one path
alias (`"@/*": ["./*"]`), `include` is `**/*.ts` — covering `scripts/` and `tests/` alike — and
`exclude` lists only `node_modules`, the `.next-*` dirs and four fixture dirs. There is no
scripts/tests boundary to violate. `tests/docs/_ledgerMdast.ts` imports no vitest module and is an
underscore helper that `**/*.test.ts` does not match, so it is not a test-only artifact. Both
directions execute live: `pnpm ledger:mass` (`tsx scripts/ledger-mass.ts`) runs and prints a report,
and `pnpm vitest run tests/scripts/ledgerFields.test.ts` passes. `pnpm preflight` does not touch the
graph at all.

**And the entry undercounts what the move costs.** It names "four importers plus three hardcoded path
exemptions". The real numbers are five and five: one direct importer under `scripts/`
(`scripts/lib/ledger-fields.ts:22`) plus four under `tests/`
(`tests/docs/_metaDeferralLedgerGraduation.test.ts:49`, `tests/docs/_ledgerMdast.walker.test.ts:9`,
`tests/docs/_metaLedgerReferentialIntegrity.test.ts:37`, `tests/scripts/ledgerFields.test.ts:18`),
with five hardcoded `tests/docs/_ledgerMdast*` paths inside `_metaLedgerReferentialIntegrity.test.ts`
(`:78`, `:80`, `:611`, `:612`, `:650`) — the last of which is a PURITY GUARD that reads the file and
asserts it contains no banned tokens, so the move must relocate an assertion about the module's own
path. That is a real lockstep edit buying a subjective tidiness improvement and zero behaviour.

If the placement is ever worth changing, it is worth changing as part of work that is already in that
code — not as a scheduled item of its own.

screen-disposition 2026-08-04: DEMOTE — probed; no tooling constraint breaks today, the module is not
vitest-bound, both directions run live, and the row asks for a relocation with no failure mode behind
it. Counts corrected on the way out: five importers, not four; five hardcoded paths, not three.

The original entry follows verbatim, with its in-flight status marker removed on archiving per
invariant 12 — archives categorically reject in-progress work.

## BL-LEDGER-MDAST-SHARED-HOME — the ledger walker lives under tests/ but is consumed by scripts/

**Status:** OPEN · **Severity:** low · **Class:** module placement · **Filed:** 2026-08-03 (`chore/ledger-claim-visibility`, spec §9.3) · **Effort:** M

`tests/docs/_ledgerMdast.ts` is the authoritative ledger walker and is pure by construction — the
referential-integrity guard forbids `node:fs`, `node:path`, and `require(` inside it. Once a script
consumes it, `scripts/**` imports from `tests/**`, which is backwards.

Relocating it beside its consumers is the repair. Deferred out of `chore/ledger-claim-visibility`
under exception (c): it spans four importers plus three hardcoded path exemptions inside
`tests/docs/_metaLedgerReferentialIntegrity.test.ts` that must all move in lockstep, none of which
that branch otherwise touches.

---

## BL-AGENDA-PERLINK-COMPLETENESS — DEMOTED TO A DOCUMENTED LIMIT 2026-08-04

Demoted by the 2026-08-04 ledger filing bar. The row describes a real narrowing — `R` is the
SHOW-WIDE restricted day set, so `visibleAgendaDaysForViewer` judges completeness show-wide even
though `components/crew/sections/ScheduleSection.tsx:210` calls it once PER LINK — and then states
the disposition itself: "**Deliberately not changed in #610**", the narrower rule "is probably the
right rule", and the behaviour "fails open".

Fail-open is what makes it a limit rather than queue work. When completeness fails the function
returns `ALL` (`lib/crew/agendaViewerDays.ts:260`), so the viewer sees MORE than their assignment and
never less. No day is ever hidden by this narrowing, which is the conservative-behaviour case §2.1
routes to the owning surface's limits record.

**Probed 2026-08-04 for a corpus instance, and there is none.** Across `fixtures/shows/raw/**` and
`fixtures/shows/email-embedded/**`, exactly two shows carry more than one agenda link:
`fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md:87,89` (RFI + PCF — narratively
the described shape, two 1-day programs in the same ballroom on 5/13 and 5/14 per `:203-214`, `:319`)
and `fixtures/shows/raw/2025-03-dci-rpas-central.md:239,241`, whose second link is a `.docx` so only
one PDF is in play. `tests/agenda/agendaViewerDaysInvariant.test.ts` contains zero occurrences of
`link` or `multi`, and the one multi-link test that exists
(`tests/agenda/agendaAdminPreview.test.ts:345`) reuses a single `makeHighConf(1, 2)` extraction for
all three links, so it is not date-partitioned either. Zero instances of the failing shape.

**The limit lives in the code it constrains**, at the completeness check in
`lib/crew/agendaViewerDays.ts`, carrying the fail-open reasoning, the probe result, the un-defer
trigger, and the entry's own instruction that the invariant search gains multi-link fixtures BEFORE
the rule changes. `lib/**` is not an invariant-8 UI surface, so the record went where it belongs.

screen-disposition 2026-08-04: DEMOTE — fail-open by construction (the viewer sees more, never less),
zero corpus instances of the date-partitioned shape, and #610 already ratified not changing it.

The original entry follows verbatim, with its in-flight status marker removed on archiving per
invariant 12 — archives categorically reject in-progress work.

### BL-AGENDA-PERLINK-COMPLETENESS — date-partitioned multi-PDF agendas never fold

**Status:** OPEN — surfaced by PR #610 review R5 (MEDIUM) · **Severity:** low · **Class:** FEATURE REACH

`visibleAgendaDaysForViewer` requires ONE link to locate EVERY date the viewer is assigned before it
will fold anything (`located.size === R.size`, with `R` the show-wide viewer date set). When a show
publishes several agenda PDFs partitioned by date — link A covering May 5+7, link B covering May 6+8,
viewer assigned May 5+6 — each link locates one of two and both fail open. Folding is therefore
systematically disabled for that shape even though each link's own rows are completely identifiable.

**Deliberately not changed in #610.** Completeness is show-wide precisely because loosening it is what
produced six separate fold-the-viewer's-day defects across five review rounds. Narrowing it to "this
link's own rows are identifiable AND it located at least one viewer date" is probably the right rule,
but it re-opens that class and belongs in a change that can carry its own adversarial pass. The
current behaviour is SAFE — it fails open — so the cost is a missing improvement, not a wrong page.

**Fix (when prioritized):** per-link completeness, with the invariant search in
`tests/agenda/agendaViewerDaysInvariant.test.ts` extended to multi-link fixtures first, so the
loosening is measured against the property before it ships.

## BL-FITWITHINCLIP-CLIP-SCROLL-STALE — DEMOTED TO A DOCUMENTED LIMIT 2026-08-04

Demoted by the 2026-08-04 ledger filing bar (AGENTS.md "Ledger filing bar (2026-08-04)"; procedure in
`docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §2). The entry states its own
disqualification in its body: "Not reachable on today's surfaces — every current clip ancestor is the
review-modal panel (`overflow-clip`, non-scrolling). This is a latent gap in the hook's stated
contract, not a live defect."

**Verified 2026-08-04 against the live hook.** `components/admin/useFitWithinClip.ts:47-50` does
accept any non-`visible` `overflowX`/`overflowY` as the clip edge, and the file registers no
`scroll` listener at all — its signals are the two ResizeObservers around `:144`, a `transitionend`
on the positioned element at `:173`, and a window `resize` at `:174`. So the gap is real as
described. What makes it a documented limit rather than queue work is the second half: there is no
scrolling clip ancestor in this tree, so the stale cap has nothing to be stale on, and the worst case
if one ever appears is a cap computed against the pre-scroll geometry — a conservative
under-measurement, not a wrong write.

**THE LIMIT, recorded here rather than in the hook file.** `components/**` is an invariant-8 UI
surface, and this arc's PR 1 is a docs/scripts/tests unit carrying `impeccable-gate: N/A`. Putting a
comment block into the hook would have pulled a UI-surface file into a PR with no UI gate, so the
archive entry is the limits record — one of the three locations §2.1 names, alongside a spec § and a
guard-file header.

> `findClippingAncestor` treats any non-`visible` overflow as the clip edge, including
> `overflow-y: auto`, but the effect subscribes only to ResizeObserver, `transitionend` and window
> resize. A clip ancestor that SCROLLS therefore leaves the computed cap stale until one of those
> three fires.
>
> **Fix when prioritized:** a passive `scroll` listener on the resolved clip ancestor, routed through
> the same coalescer as the other signals.
>
> **Un-defer trigger:** any surface gains a scrolling clip ancestor — i.e. `findClippingAncestor`
> resolves to an element with `overflow-y: auto`/`scroll` rather than the review-modal panel's
> `overflow-clip`.

screen-disposition 2026-08-04: DEMOTE — self-declared unreachable on every current surface, worst
case is a conservative under-measurement, and the limit now lives in this record with its un-defer
trigger intact.

The original entry follows verbatim, with its in-flight status marker removed on archiving per
invariant 12 — archives categorically reject in-progress work.

## BL-FITWITHINCLIP-CLIP-SCROLL-STALE — a SCROLLING clip ancestor is never re-measured on scroll

**Effort:** S

Surfaced by the non-degraded impeccable gate rerun on PR #658 (2026-08-02).

`findClippingAncestor` (`components/admin/useFitWithinClip.ts`) accepts ANY non-`visible`
overflow as the clip edge, which deliberately includes `overflow-y: auto` — a scrolling
ancestor clips just as a `overflow-clip` panel does. But the effect subscribes to resize
(ResizeObserver on the clip ancestor and the offsetParent), `transitionend`, and window
resize. It never listens for `scroll`.

So on a surface where the clip edge SCROLLS, the fitted cap is computed once against the
ancestor's position at mount and then goes stale: scrolling moves the clip edge relative to
the overlay without resizing anything, and nothing re-measures.

Not reachable on today's surfaces — every current clip ancestor is the review-modal panel
(`overflow-clip`, non-scrolling). This is a latent gap in the hook's stated contract, not a
live defect.

**Trigger:** the first consumer whose clip ancestor scrolls. Fix is a passive `scroll` listener
on the resolved clip ancestor, routed through the same coalescer as the other signals.

---

## BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP — RESOLVED (2026-08-04, PR #697 `fix/apply-undo-audit-fidelity`, merge `644f8bb06`)

**The entry named ONE discard site; the class sweep found four.** The shape it describes — a path
that obtains a real `roleFlagsNotice` and emits nothing — held equally for the first-seen onboarding
finalize, for `runManualStageForFirstSeen` (which builds the notice and then returns a shape without
it), and for the pending-ingestion retry route, which bypasses `processOneFile`'s post-commit tail
altogether and was therefore dark for everything that tail emits, not only this notice. All four are
repaired here under the class-sweep disposition default; none qualified for a deferral exception,
since each was the same defect in code the branch was already touching.

**Shipped:** one shared helper, `lib/sync/emitRoleFlagsNotice.ts`. It is the `emitDeferredRoleFlagsNotice`
body that already existed inside `lib/sync/runScheduledCronSync.ts` — exported and relocated, with the
near-verbatim copy in `lib/sync/applyStaged.ts` collapsed into it — and every discard site now routes
through it. Three of the four accumulate their notices and flush them in a `finally` AFTER the outer
transaction, because the obvious position (beside the existing `SHOW_FINALIZED` `logAdminOutcome`) is
post-**row**-commit but still inside the route's outer finalize lock, which invariant 10 forbids. Both
finalize-cas handlers are wired, including the STREAMING one: it owns its own `withTx` and its own
`finally`, and it is the handler the admin finalize button actually reaches, so wiring only the
non-streaming fallback would have left the production path dark. `_metaLeadRoleAppliedTopology` now
expects exactly one emit site.

**The structural guard against a fifth site is DESCOPED, not shipped** — refiled as
`BL-ROLEFLAGSNOTICE-DROP-GUARD`. `roleFlagsNotice` reaches its sink through import aliases and
dependency-injection seams, so a guard keyed on direct consumers would bless an envelope-preserving
wrapper while staying blind to the retry route that drops it; catching that needs recursive carrier
tracking to terminal sinks, which is its own design rather than a bullet in this spec. What ships in
its place is a behavioral test per instance, on all four.

Spec: `docs/superpowers/specs/2026-08-03-apply-undo-audit-fidelity-design.md` §2.3 and §9.

The original entry follows, its in-flight marker stripped — an archive cannot hold work in
flight (invariant 12). Nothing else is edited.

## BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP — the wizard Phase D apply discards its capability notice

**Filed:** 2026-08-03 (`2026-08-03-staged-identitylink-rename-identity` §1.1 #7, review R1 finding 1) · **Class:** audit emission gap (onboarding Phase D) · **Effort:** S-M (a post-commit sink on the finalize-cas route)

`applyStagedCore` returns `roleFlagsNotice` on every path, and the dashboard staged-apply tail emits it post-commit. `finalize-cas` (`app/api/admin/onboarding/finalize-cas/route.ts`) does not: its per-row return carries only `drive_file_id`, `code`, and `showId`, and no `ROLE_FLAGS_NOTICE` alert or durable `LEAD_ROLE_APPLIED` event is emitted anywhere on that route. A capability gain or loss landed by a Phase D existing-show apply is therefore audited by the change-log row but never reaches the bell or the durable event.

Pre-existing and independent of the staged identity-link threading — verified live 2026-08-03 against both the core result shape and the route body. **Fix (when prioritized):** emit from `coreResult.roleFlagsNotice` post-commit, outside the advisory-lock transaction (invariant 10), mirroring the dashboard tail in `lib/sync/applyStaged.ts`.

---

## BL-IDENTITYLINK-LANDED-VS-REQUESTED — RESOLVED (2026-08-04, PR #697 `fix/apply-undo-audit-fidelity`, merge `644f8bb06`)

**The notice and the feed now derive from the pairs that actually LANDED**, reported by the apply
rather than assumed from the request. `renameCrewMember` reports whether a row changed,
`ApplyParseResultOutcome` carries the landed and unlanded pairs with a `reason` on each, and an
`IDENTITY_LINK_RENAME_UNLANDED` durable event records the ones that did not land.

**The entry's premise was partly wrong, and the truth was wider.** It claimed the feed writer consumed
the requested `identityLinkRenames`. The feed never saw them: `writeAutoApplyChanges` re-derived its
own pairs from `triggeredItems` through a `renamePairs` helper that accepted any MI-12/MI-13/MI-14
item unconditionally — no accept gate at all, so the feed could record a rename that was never even
requested by an accepted item, a wider defect than the row described. That derivation is deleted and
the feed takes the landed pairs from its call site.

**The notice needed a two-arm split, not a swap.** `capabilityRoleChangesForNotice` uses the pairs
twice for opposite purposes. Arm (a) maps an added name back to its linked prior so an unchanged-flag
rename is not reported as a fresh grant, and it takes landed pairs. Arm (c) SUPPRESSES a
capability-loss notice, and feeding it landed pairs alone would have fired a **false** capability-loss
notice for every pair whose source row survived the apply — a new defect in the opposite direction
from the one being fixed. Its correct input is landed pairs ∪ unlanded pairs whose source SURVIVED,
computed as a survival test inside `applyParseResult` where `deleteKeepNames` lives, and deliberately
not as a reason test: `name_held` is recorded for every surviving hold while delete-protection is
recorded only in specific hold-kind branches, so a held pair can genuinely lose its row. A real
capability loss that the requested-pairs suppression hid is now reported.

The remaining false-loss shape — arm (c) firing for a held row that no rename pair names — is out of
scope under class-sweep exception (c) and filed as `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`.

Spec: `docs/superpowers/specs/2026-08-03-apply-undo-audit-fidelity-design.md` §2.1 and §2.2.

The original entry follows, its in-flight marker stripped — an archive cannot hold work in
flight (invariant 12). Nothing else is edited.

## BL-IDENTITYLINK-LANDED-VS-REQUESTED — the notice and feed consume requested rename pairs, not landed ones

**Filed:** 2026-08-03 (`2026-08-03-staged-identitylink-rename-identity` §1.1 #8, review R1 finding 2) · **Class:** sync audit fidelity (cron + staged, shared) · **Effort:** M (the reconciler must report what it landed)

Hold-aware reconciliation can suppress a rename TARGET (P2-F4 added-row reservation collision, `lib/sync/holds/holdAwareApply.ts`). The pair then no-ops inside `applyParseResult` — no successor row lands — yet `capabilityRoleChangesForNotice` and the feed writer both consume the **requested** `identityLinkRenames`, so the notice and the feed describe a rename that did not happen. `renameCrewMember`'s no-op on target collision / missing source is the same class (it returns void, unobservable to callers).

Shared verbatim with the cron path — same producer/consumer wiring — and neither introduced nor widened by the staged threading, which only adds a second producer. **Fix (when prioritized):** have the apply return the pairs it actually landed and feed the notice/feed writers from that, not from the request.

---

## BL-UNDO-SELECTIONS-RESET-AT-DROP — RESOLVED (2026-08-04, PR #697 `fix/apply-undo-audit-fidelity`, merge `644f8bb06`)

**`selections_reset_at` now survives an undo.** `crewImage` carries the column into `before_image`
and the Direction A re-insert restores it
(`supabase/migrations/20260804000000_undo_change_selections_reset_at.sql`).

**The real fix was capturing the successor's marker BEFORE the delete, not merging in `ON CONFLICT`.**
A normal `crew_renamed` undo deletes the live successor first, precisely so the INSERT slot is free —
so the common rename path takes the clean-INSERT branch and a merge living only in the conflict branch
would never run. Worse, a reset stamped on that successor _after_ the rename is destroyed by the
delete, so the conflict-branch `greatest(...)` never sees it either. The successor row is already
`select … for update`'d before the delete, so its marker is captured there at zero extra cost and the
restored row takes the later of the two values.

**`undo_change` was not the only producer.** `mi11_approve_hold` omits the column from BOTH its
`before_image` builder and the fresh successor INSERT it writes; both sites are repaired in the same
migration, which therefore replaces two functions rather than one. The guard that should have caught
the original drop was reading a migration superseded a month earlier and asserted nothing about
omissions — it is repointed at the live body with the column added, so repairing the drop does not
leave its blind guard to queue the next one.

**Two historical shapes stay unrescuable, and are documented limits rather than hidden.** The fix
works by falling through to the live successor's marker, so it helps only where a successor carries
one: a pre-change `crew_removed` has no successor at all, and a pre-change MI-11 rename has NULL on
both inputs. Both are bounded to rows written before this change, and neither is backfillable — the
information no longer exists anywhere.

Spec: `docs/superpowers/specs/2026-08-03-apply-undo-audit-fidelity-design.md` §2.4 and §8.

The original entry follows, its in-flight marker stripped — an archive cannot hold work in
flight (invariant 12). Nothing else is edited.

## BL-UNDO-SELECTIONS-RESET-AT-DROP — any crew undo resets `selections_reset_at` to null

**Filed:** 2026-08-03 (`2026-08-03-staged-identitylink-rename-identity` §1.1 #9, review R1 finding 3) · **Class:** undo lifecycle fidelity · **Effort:** S (one column through `before_image` + the Direction A re-insert)

`crewImage` omits `selections_reset_at` from `before_image`, and the `undo_change` Direction A re-insert omits the column, so ANY crew undo — removed or renamed, either apply shape, either path — restores the row with a null marker. A picker cookie that was deliberately invalidated before the undone change can validate again afterward.

Pre-existing and shape-agnostic: the cron in-place rename already round-trips through the same RPC, so the staged threading does not widen it. **Fix (when prioritized):** carry the column in `before_image` and restore it on re-insert, with a db test asserting an invalidated cookie stays invalidated across an undo.

---

## BL-INTER-NUMERAL-DISAMBIGUATION — RESOLVED (2026-08-03, `feat/inter-numeral-disambiguation`)

**Resolved by changing the font, not the CSS — the entry's premise was false.**

The row asked for `"zero" 1, "cv05" 1` on the tabular rule. Probing the actual binaries first showed
those features do not exist in the Inter build Google Fonts serves: measured live, the latin subset
carries `calt ccmp dnom frac kern locl mark mkmk numr pnum tnum` and a `wght` axis, nothing more. The
requested change would have rendered nothing — exactly as the `"cv11" 1` beside it had been rendering
nothing since `78662acb5` (2026-05-03), silently, on every route, for three months.

Two further defects in the row itself, independent of availability: `cv05` moves lowercase `l` only and
never touches capital `I`, so the pair named in the row's own title was incomplete; and `ss04` is
Inter's own "disambiguation without zero", which covers both letterforms in one tag.

**Shipped:** a latin + latin-ext SUBSET of the upstream `rsms/inter` v4.1 release at
`assets/fonts/InterVariable-latin.woff2` (173 KB, built by `scripts/subset-inter.sh` from a
checksum-pinned input, OFL text alongside) and loaded via `next/font/local`. The verbatim 344 KB
release was the decision at the gate; the impeccable audit then measured it costing FCP +136-164ms
and a fallback-to-Inter swap landing 3.7s in on slow 4G, and the owner revised. CSS: `ss04` at
`html`, `ss04`/`tnum` on the tabular rule, and `zero` on a narrower `.code-value` — `.tabular-nums`
turned out to sit on whole prose sentences, including the Right Now hero's 30px bold `<h2>`, so the
slash was landing mid-sentence. `ss04` is repeated on each rule because `font-feature-settings`
inherits as a whole value rather than a merged list. The generated-artifact objection that
argued for verbatim is answered by asserting the binary SEMANTICALLY — the guard checks the
declared tags and both axes against whatever the loader points at — rather than by byte-equality,
so no pinned-image gate is owed. The `opsz` axis survives the subset, making `DESIGN.md` §2.1's
long-standing optical-sizing claim true for the first time.

**Fourteen false claims corrected** across `DESIGN.md`, the font-binding spec and plan, and eight source
comments — including that plan's own P3 disposition, which had recorded "now deterministically activates
Inter's alternates … for the first time" as an accepted consequence. It activated nothing.

**The guard is the real deliverable.** `tests/styles/fontFeatureAvailability.test.ts` derives the font
path from `app/fonts.ts` and asserts every tag `app/globals.css` declares exists in that binary, so this
class of silent failure fails the build instead. It carries a regression proof against the committed
Google-served binary showing it would have caught the dead `cv11` on the day it was written. In the
browser, `zero` is proven by a PIXEL oracle rather than a width one: `zero` and `zero.slash` share an
xAdvance of 1292 units, so a width assertion can never see the feature work.

## BL-ADMIN-NOJS-LOADING-CONFLICT — RESOLVED (2026-08-03, `fix/nojs-loading-shell-notice`)

### BL-ADMIN-NOJS-LOADING-CONFLICT — no-JS contract vs loading.tsx streaming

Filed 2026-06-10 (discovered during mobile needs-attention T5 e2e run; pre-existing since M12.11 `f2f7f7b4`). The `admin-banner.spec.ts` "no-JS native summary" e2e fails on main: with `javaScriptEnabled:false` the admin dashboard never leaves the `app/admin/loading.tsx` skeleton because React streams suspense content into a hidden div swapped by an inline `$RC()` script that needs JS. No CI workflow runs Playwright, so it went unnoticed. Structurally: the no-JS banner contract and instant loading skeletons are incompatible as shipped. Options when picked up: drop the no-JS contract test, gate loading.tsx behind JS detection (not really possible server-side), or accept skeleton-only no-JS rendering and retarget the test. Technical home: `tests/e2e/admin-banner.spec.ts:261` + `app/admin/loading.tsx`.

**Resolved 2026-08-03 (`fix/nojs-loading-shell-notice`).** Two halves, only one of which was still live.

_The named symptom was already gone._ `tests/e2e/admin-banner.spec.ts` was deleted wholesale in `67ce6d082` ("feat(admin): mount bell in both chromes; retire AlertBanner"), together with `components/admin/AlertBanner.tsx` and the `<details>`-based no-JS contract that test asserted. At pickup, `rg noscript app components` returned zero hits: no no-JS contract survived anywhere in the app.

_The structural half was real, and is fixed._ A probe against a throwaway `force-dynamic` route confirmed the mechanism exactly as this entry described it — the fallback renders inline, the real content ships inside `<div hidden id="S:1">`, and only an inline `$RC()` call reveals it. Of the three options this entry listed, the first is moot (the test is gone) and the second is not implementable (the server cannot know whether the client will run the script). The third shipped, in the strongest available form: `LoadingShell` now carries a `<noscript>` block with a "JavaScript is required" notice plus a `<noscript>`-scoped `<style>` that hides the shell content, so a no-JS visitor gets one clear message instead of an eternal shimmer. One insertion point covers all nine `loading.tsx` routes — crew as well as admin, which is broader than this entry's admin-only framing.

_One claim in this entry was stale and should not be carried forward._ "No CI workflow runs Playwright" was true when filed; thirteen workflow files reference it today and eleven invoke `playwright test`. That sentence is precisely the reasoning that would justify skipping CI registration, so the replacement e2e (`tests/e2e/nojs-loading-notice.spec.ts`) is named explicitly in `.github/workflows/admin-layout-e2e.yml` as well as in `playwright.config.ts`. Registering only the latter would have left it dark — most Playwright workflows here pass an explicit spec-file list, and `desktop-chromium` appears in none of the three that instead run whole configs or projects — which is how the predecessor test sat failing on `main` from M12.11 until it was deleted.

Spec: `docs/superpowers/specs/2026-08-03-nojs-loading-shell-notice-design.md`. Plan: `docs/superpowers/plans/2026-08-03-nojs-loading-shell-notice.md`.

---

## BL-INTERNAL-CODE-ENUM-SCAN-WIDEN — RESOLVED (2026-08-03, `chore/scanner-precision-cluster`)

**Filed:** 2026-08-02 (retroactively; cited by `lib/dev/attentionScenarios/tier1.ts:127` and `docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md:165` as if already filed, with no row anywhere). **Class:** generated-registry completeness. **Effort:** S.

`extractInternalCodeEnums` (`scripts/extract-internal-code-enums.ts:70-71`) collects `parse_warnings.code` literals from `readFiles(["lib/parser"])`, then filters those files by `/\bParseWarning\b|\bwarnings\b|hardErrors/`. Because no runtime module enumerates the parse-warning universe, the attention-scenario gallery has to union the generated enum with a hand-maintained residue, `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`): `AGENDA_SCHEDULE_LOW_CONFIDENCE`, `AGENDA_SCHEDULE_TIME_ADJUSTED`, `PULL_SHEET_ON_ARCHIVED_TAB`, `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`.

The `tier1.ts` comment attributes the miss to the content regex alone. Verified 2026-08-02, that is only the second filter: all four emitters live in `lib/agenda/extractAgendaSchedule.ts`, `lib/sync/enrichAgenda.ts`, and `lib/sync/pullSheetOverride.ts` — outside the `["lib/parser"]` root the scan ever opens, so the regex never runs on them. Widening the content heuristic without widening the directory list would change nothing.

**Work:** widen the scan roots (and the content predicate, if it then over- or under-selects) so the generator reaches every `ParseWarning` emitter, and delete `EXTRA_WARNING_CODES`. The union in `warningCodes()` de-duplicates, so absorbing a code silently shrinks the residue rather than double-rendering it — which means the residue can rot invisibly, and is the reason this is worth closing rather than living with. Add a guard that fails when a `ParseWarning` code literal exists in a file the generator does not scan; otherwise the same drift reappears the next time an emitter lands outside the scanned roots.

**Status:** RESOLVED on branch `chore/scanner-precision-cluster` (2026-08-03)

---

**How it was resolved.** The scan is no longer syntactic. Every syntactic mechanism was built and
refuted by probe — widening the roots mis-attributes 10-13 admin-alert codes, stripping type
declarations misses value positions, and matching factories by their WRITTEN return type is the
same bug one level up, since `warning(): Phase2Args["parseResult"]["warnings"][number]` never
spells `ParseWarning`. Recognition is now by TYPE, fail-closed (the default is SIGNAL), with four
capture-linked classifications validated in a second pass against what was actually captured.

The entry's premise was also partly wrong, and worse than it thought: `PULL_SHEET_ON_ARCHIVED_TAB`
was already absorbed, so one of the four residue rows was long dead, and **eleven** real §12.4
codes were dark that the residue never listed. `warningCodes()` de-duplicates, so under-coverage
had no symptom at all — which is exactly why the entry asked for a guard.

Measured: 58 codes, 0 unresolved, 44 capture-linked skips, zero admin-alert leakage.
`EXTRA_WARNING_CODES` is gone and the consumer filter moved from exact equality to provenance
membership, which alone had been dropping three genuine warnings.

**Documented limit, not a defect:** a code whose provenance passes through `any`/`unknown` or that
reaches its factory only by higher-order application is neither captured nor signalled — tracing
that is undecidable, and no type-based recognizer survives `const w: ParseWarning = someAny`. Zero
such constructions exist today. The real closure is an enumerated catalog, filed as
`BL-CATALOG-PARTITION-WARNING-CLASS`.

## BL-LEDGER-GUARD-BODY-DEFINED-IDS — RESOLVED (2026-08-03, `chore/scanner-precision-cluster`)

**Filed:** 2026-08-02 (dangling-citation filing pass). **Class:** guard precision. **Effort:** S. **Owner note:** the guard file itself is owned by a parallel session; this entry is the handoff, not a patch.

`tests/docs/_metaLedgerReferentialIntegrity.test.ts` resolves a citation against `ledgerIds(...)`, which walks `##`/`###` HEADINGS. Some ids are defined deliberately in an entry's BODY instead: a parent entry enumerates its sub-items as bullets, and each bullet's id is how the sub-item is referenced everywhere else. Those resolve fine for a human reading the parent, and they are not debt — but the guard cannot see them, so they sit in `KNOWN_DANGLING` looking like untracked work.

**Decision (2026-08-02): they stay body-defined.** Promoting them would give each a heading whose content is one bullet, and would break the thing that makes them meaningful — the parent's ratchet or gate semantics. The eight below are the full current set:

- `BL-MUTATION-REF-SUB`, `BL-MUTATION-UNICODE`, `BL-MUTATION-COLUMN-SHIFT`, `BL-MUTATION-MERGED-CELL`, `BL-MUTATION-SECTION-ORDER` — the five operator classes enumerated by `BL-MUTATION-HARNESS-OPEN-HOLES` above, which states outright that "each is tracked as a backlog sub-item below". They are also the `finding` tags on thousands of rows in `tests/parser/mutation/knownHoles.ts`, where they identify a hole CLASS, not an item. The parent owns the shrink-only ratchet that gives them their meaning: hardening a class turns its holes into `staleRows` and fails the nightly harness until they are removed. Split across five headings, that ratchet has no single home.
- `BL-SYNCFEED-UI-1`, `BL-SYNCFEED-UI-2`, `BL-SYNCFEED-UI-3` — the three LOW / no-user-harm findings enumerated by `BL-SYNC-FEED-UI-POLISH` above, each a one-sentence "only act if" note from one impeccable dual-gate that PASSED. Their shared provenance and shared "no concrete trigger" disposition is the entry; individually they are not items.

**Work:** teach the guard that an id may be DEFINED by a body bullet of the form ``- **`BL-…`** — …`` inside an entry whose own heading id resolves, then delete these eight `KNOWN_DANGLING` rows. Two things to get right, both of which the existing family-reference suppressor already models: the bullet must be inside a resolving parent (a bullet in a plan or spec must NOT define anything, or any typo can define itself), and the definition must be a bullet LEAD, not any inline mention, or an entry that merely discusses a sibling id would define it. Worth a plant in the guard's own corpus for each failure mode.

**Status:** RESOLVED on branch `chore/scanner-precision-cluster` (2026-08-03)

---

**How it was resolved.** `bodyDefinedIds` teaches the guard that a parent entry may DEFINE a
sub-item id as a body bullet. Three conditions, each forced by a measurement against the real
corpus: the id must lead the bullet inside a **strong** span (a code-span lead is enumeration —
this entry's own body led a bullet with the same five ids and would otherwise have defined them);
it must be the first child of the item's first paragraph; and the walk stops at the first heading,
because `extractEntries` opens entries only at prefixed headings, so a plain `##` section falls
inside the preceding entry's span. Across the four ledgers those conditions are the difference
between 11 ids and the 8 that are really body-defined. `definedIds` is exported with injectable
`(ledgers, read)` and six plants pin the file-scoping property, including one asserting its body
performs no read outside the injected reader. The eight `KNOWN_DANGLING` rows are removed, not
exempted — the guard's stale-row ratchet is what proves the removal was required.

## BL-MODAL-REALTIME-UPDATED-CUE — RESOLVED (2026-08-03, `feat/modal-freshness-cue`)

Shipped as a one-shot flash-then-fade on the panel card of each registry section whose content changed across an in-place reconcile, plus a branch-stable sr-only announcement driven by the SAME detector so the two legs can never disagree. Spec: `docs/superpowers/specs/2026-08-03-modal-freshness-cue.md`.

**The entry's premise below was WRONG, and it was load-bearing.** It claims the spec ratified a silent-by-design posture. It did not: `docs/superpowers/specs/2026-07-19-admin-modal-realtime-refresh.md:75` says only that the bridge component renders `null`, and line 173 says its transition inventory is N/A because the bridge adds no visual states. Both are statements about the BRIDGE, not about the surface it refreshes. Nobody had weighed a cue and rejected it, so this was a new design decision rather than a reversal of one. The un-defer signal was never reached either: the user was shown the options and chose the cue directly.

The original entry, unedited, follows.

## BL-MODAL-REALTIME-UPDATED-CUE — freshness cue near the published modal's action clusters

**Filed:** 2026-07-24 (retroactive — deferred in PR #505's body 2026-07-20, never filed) · **Class:** UI refinement · **Effort:** S

Impeccable P3 from `admin-modal-realtime-refresh`: an optional "updated just now" cue near the modal's action clusters, so a realtime-driven change is attributable rather than appearing as content silently shifting under the cursor. Deferred as a future refinement — the spec ratifies the silent-by-design posture, so nothing requires it.

**Un-defer signal (weak, hence backlog not DEFERRED.md):** a user reporting that modal content changed without explanation. Note the tension with the ratified posture — adding a cue is a spec decision, not a polish pass.

**Status:** resolved (shipped 2026-08-03).

## BL-ONBOARDING-CAS-SOURCE-ANCHORS — RESOLVED (2026-08-03, `fix/onboarding-cas-source-anchors`)

### BL-ONBOARDING-CAS-SOURCE-ANCHORS — the existing-show re-onboard never refreshed shows.source_anchors

**Filed:** 2026-06-28 (cross-model review of PR #179) · **Class:** data fidelity · **Effort:** S · **Resolved:** 2026-08-03

**The gap.** PR #179 threaded `source_anchors` into the FIRST-SEEN onboarding materialization so a
freshly-onboarded show got correct "In sheet" deep links immediately. The EXISTING-SHOW re-onboard
path had the same gap and kept it: `stageExistingShowShadow` staged a shadow payload without the
anchors, `deleteApprovedPending` consumed the `pending_syncs` row in the same transaction, and by
Phase D the value the scan computed no longer existed anywhere. A re-onboarded show kept whatever
anchors the last sync-pipeline pass left.

**What shipped, and why it is not what this entry originally prescribed.** The entry called for
computing anchors pre-lock in `finalize-cas`'s apply path. That was right for PR #179's era and
stale by the time it was picked up: the 2026-07-01 persist-at-scan rewrite made Phase D SQL-only, so
an XLSX export there is no longer an option. The anchors ride the shadow payload instead — the same
channel `use_raw_decisions` already uses, for the same reason. Three edits: a `source_anchors` key in
`stageExistingShowShadow`'s `jsonb_build_object`, a tolerant `sourceAnchors` field on
`parseShadowPayloadForApply` (anything unusable degrades to `{}` rather than refusing a shadow over
a cosmetic deep link), and a never-pass-`{}` spread at the Phase-D `applyStagedCore` call. No
migration, no new §12.4 code, no UI surface.

**The limit it does NOT close.** Flow B preserves the stored map on ANY empty scan, where the sync
pipeline would clear on some of them — `pending_syncs.source_anchors` flattens a transient Drive
failure and a workbook with no recognized regions into the same `{}`, so clearing on that value
would wipe good anchors on every hiccup during a re-onboard. The consequence is that a preserved map
can predate the applied revision and still produce a structurally valid deep link to a stale range.
Documented in full at `docs/superpowers/specs/step3-onboarding/2026-08-03-finalize-cas-source-anchors.md`
§4.1, with the revision-stamp fix that would detect it filed as
`BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH`.

## BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT — RESOLVED (2026-08-02, `chore/copy-deadcode-sweep`)

## BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT — §12.4 ROLE_FLAGS_NOTICE copy says FINANCIALS unlocks admin access

**Filed:** 2026-08-02 (docs/citation-rot-financials-vocab, spec review R2 finding 3) · **Class:** docs/copy (§12.4 catalog) · **Severity:** low · **Effort:** S

Master spec §12.4 `ROLE_FLAGS_NOTICE` helpfulContext (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3356`) reads "This fires only for LEAD or FINANCIALS, the roles that unlock internal financials and admin access". FINANCIALS unlocks the `financials` column only ("Nothing else", the Effect row of `docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md`); LEAD alone additionally grants the admin/ops surface, stated correctly at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`. Explanatory copy only, so no access is actually granted, but it is Doug-visible text. Fix requires the §12.4 three-way lockstep in ONE commit (spec §12.4 prose edit + `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` row) and touches the frozen helpfulContext byte-parity contract (BL-CARD-COPY-HELPFULCONTEXT-PARITY, graduated 2026-08-01) — re-freeze parity after the edit. Trigger: next §12.4 copy pass.

## BL-ADMIN-PARSEPANEL-ORPHANED — RESOLVED (2026-08-02, `chore/copy-deadcode-sweep`)

## BL-ADMIN-PARSEPANEL-ORPHANED — ParsePanel/StagedReviewCard live-scope mount orphaned

Since the show-page→modal pivot (#476) nothing imports `components/admin/ParsePanel.tsx` (its per-show mount was deleted; whole-parse review was deliberately dropped from published shows in 65d5be75a in favor of MI-11 holds in the Changes feed). `StagedReviewCard` remains live in the onboarding wizard; the live-scope `ParsePanel` wrapper is dead code. Surfaced during published-show-alerts (2026-07-19, spec §14). **Fix (when prioritized):** delete ParsePanel or re-home it explicitly; sweep `tests/e2e/_metaEmphasisRenderContract` style registries on removal.

## BL-HELP-STRIP-COPYLINK-STALE — RESOLVED (2026-08-02, `chore/copy-deadcode-sweep`)

### BL-HELP-STRIP-COPYLINK-STALE — help prose still describes the retired strip copy-link

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** DOCS

Two claims in `app/help/admin/per-show-panel/page.mdx` describe a status-strip copy-link that the share-hub consolidation removed: `:7` lists it among the strip's contents, and `:30` places the Re-sync button "between the sync line and the copy-link button". Both are user-visible and both are wrong.

Pre-existing debt from `docs/superpowers/specs/2026-07-20-share-hub-design.md:104`, not from the milestone that surfaced it, and deliberately out of scope there: correcting shipped user copy pulls in the help screenshot surface (`help-affordances`, `screenshots-drift`), which a code-comment sweep should not. Trigger: the next help pass, which can own the regeneration.

## BL-UNPUBLISH-TO-HELD — RESOLVED (2026-08-03, `docs/graduate-bl-unpublish-to-held` — already shipped 2026-07-01; row filed on a false verification)

## BL-UNPUBLISH-TO-HELD — no inverse action returning a published show to Held

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md:291` lists it under §11 Out of scope / Backlog, with no row anywhere). **Class:** admin lifecycle gap. **Effort:** M (new RPC + state-machine review).

The existing M12.13 token-unpublish ARCHIVES the show; there is no published→Held transition. Verified 2026-08-02: no such RPC exists in `supabase/migrations/` or `lib/`. So an operator who published early has one exit, and it is the destructive one.

**Work:** a `published → held` RPC plus its admin affordance. Treat the state machine as the hard part, not the SQL: Held is the pre-publish review state, so returning to it has to say what happens to the share token, to any in-flight finalize, and to a crew member holding a live link, and it must not become a second path to the archived state. Advisory-lock discipline (invariant 2) and the `AUDITABLE_MUTATIONS` registry (invariant 10) both apply.

**Resolution (2026-08-03):** already shipped a month before the row was filed. The published toggle (spec `docs/superpowers/specs/admin/2026-07-01-published-toggle.md`, commit 945bd4ef0) is exactly this feature: `unpublish_show` RPC (`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:27`) does a pure `published=false` with archived untouched — which IS Held, since Held has no column of its own (`published=F ∧ archived=F`) — and is driven by `setShowPublishedAction(slug, false)` from the admin show review modal. Both of the row's factual claims were wrong at filing time: the RPC existed, and the M12.13 token-unpublish never archived — the emailed-link path is a pure unpublish too (`lib/sync/unpublishShow.ts`). Every state-machine question the row poses is answered in the shipped surface: the share token is deliberately not rotated (spec D1 — a crew member's live link lands on the paused-link UI via the `published≠true` check in `app/show/[slug]/[shareToken]/page.tsx` and revives on republish); in-flight finalize is refused (`FINALIZE_OWNED_SHOW`); archived rows are immutable (`SHOW_ARCHIVED_IMMUTABLE`), so the RPC cannot become a second path to archived; the advisory lock is held in-RPC with the single-holder topology pinned (`tests/sync/_advisoryLockSingleHolderContract.test.ts:528`); and the `AUDITABLE_MUTATIONS` row has executable behavioral proof including the performed-only emit contract (`tests/log/adminOutcomeBehavior.test.ts:1969`, commit 72862711f). A 10-point graduation audit found no functional gap; its one finding — the validation-schema-parity gate covers tables×columns and never functions — is repo-wide, not feature-specific, and is filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED`.

## BL-VERSION-AMBIGUOUS-V1-OVERRIDE — RESOLVED — WON'T BUILD (2026-08-03, `docs/close-v1-override-wont-build`)

## BL-VERSION-AMBIGUOUS-V1-OVERRIDE — no admin force-classify for a genuine legacy-v1 sheet

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md:171` defers it by name in §10, with no row anywhere). **Class:** operator escape hatch. **Effort:** M.

`VERSION_AMBIGUOUS` has deliberately no in-app "approve the ambiguous parse as-is" affordance, because approving a parse the system is not confident about defeats the gate. The two live resolutions are: the operator restores the sheet's version markers, or a developer registers the new template's markers. A genuine legacy-v1 sheet has neither, and none exists in the corpus today — it would flag ambiguous with no way forward but those same two actions. Verified 2026-08-02: no force-classify path exists.

**Read the deferral before picking this up.** The reason it is open is not that nobody thought about it: an admin override IS an approve-ambiguous path, which is the exact thing the gate exists to prevent. Any design here has to explain why it is not that, and a real legacy-v1 sheet appearing is the trigger that would make the question live.

**Resolution (2026-08-03): WON'T BUILD.** Closed on `docs/close-v1-override-wont-build` per `docs/superpowers/specs/data-quality/2026-08-03-close-v1-override-wont-build.md`. No admin force-classify override gets built, now or trigger-gated.

The row's own premise was false as stated, and that is what closes it rather than a priority call. `v1` is a **fallback bucket, not a confirmed legacy template**: `lib/parser/schema.ts:37` calls it the fallback for when markdown table syntax is present but no v2/v4 markers are found, and the registry entry at `lib/parser/schema.ts:53` is `{ id: "v1", fallback: true }` with no `requires` array — so nothing positively identifies a v1 sheet. The gate spec says the same thing independently at its D2 row: v1 is defined purely by absence. **Probed 2026-08-03:** all 10 committed fixtures in `fixtures/shows/raw/` classify confidently through `classifyVersion` — six v2 at scores 7/0, four v4 at 8/0 — with zero ambiguous and zero v1, against a `MIN_MARGIN` of 2. The oldest sheet in the corpus, `2024-05-east-coast-family-office.md`, is the one a legacy-v1 template would most plausibly be, and it scores 7/0 for v2 on the typo spelling `Hotal Contact Info`. That probe establishes exactly one claim — **the committed corpus contains no v1 sheet** — and neither the broader "no v1 sheet has ever existed" nor anything about the live-sheet population; the argument below needs none of those.

Four things can land in the ambiguous bucket, indistinguishable by construction, which is why the gate pauses for human triage instead of publishing a guess: (1) a **damaged v2/v4 sheet** — resolved by restoring its markers, and force-classifying it as v1 would parse it with the wrong template, strictly worse than the repair; (2) a **genuinely new template** — resolved by a developer registering its markers, where an override would instead ship a permanent wrong classification; (3) a **junk non-show spreadsheet** with a table sitting in the synced folder — resolved by disregarding it, where the correct outcome is not parsing it at all; (4) a **hypothetical genuine legacy-v1 sheet**, never observed. An override serves none of them better than its existing disposition.

The insight that closes the question is about occupant (4): **a real legacy-v1 sheet, once actually seen, is indistinguishable from occupant (2).** Any real sheet has some stable column-0 labels — that is exactly what the confidence-scoring marker sets are built from (`V4_BLOCKS` and `V2_BLOCKS`, `lib/parser/schema.ts:90-99`, each spanning three independent blocks against a diversity clause requiring ≥2) — so a developer registers them as a version entry, which is §7.1 resolution #2. Nothing about that path is restricted to _new_ templates; it is restricted to _unregistered_ ones, and a legacy sheet nobody registered is unregistered. This entry's "a genuine legacy-v1 sheet has neither" therefore conflated **no markers registered today** (true of a hypothetical legacy sheet, and of every new template before someone registers it) with **no registrable structure** (unsupported). And a sheet that genuinely had no registrable structure would not be parseable by the block parsers either: force-classifying it as v1 would hand them a document they cannot read, producing a confidently-wrong parse instead of a signaled one. The override does not turn an unparseable sheet into a parseable one — it turns a _signaled_ failure into a _silent_ one, inverting the posture the preparedness audit requires (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`: every input "parsed correctly or _signaled_, never silently wrong").

**Re-open trigger, deliberately conjunctive — both halves required:** a real legacy sheet surfaces **AND** marker registration proves impossible, i.e. the sheet has no stable column-0 labels spanning ≥2 blocks. The first alone is not enough; that is occupant (2), already resolved. If the second ever holds, the right follow-up is still probably not a force-classify override — a sheet with no registrable structure is one the block parsers cannot read — but the question would at least be live again, which it is not today.

## BL-PARSER-HOTEL-INLINE-AMBIGUITY — RESOLVED (2026-07-26, PR #608 `feat/hotel-ambiguity-coverage`)

**Filed:** 2026-07-07 (ambiguity-warnings-v1 §6 deferred-exemption seed) · **Resolved:** 2026-07-26 · **Class:** parser observability · **Effort:** M

Ambiguity-warnings-v1 scoped its guest-cell warning STRICTLY to the structured path — `parseGuestCell`'s two call sites in `hotels.ts` — and left the inline shapes (v1 "Hotel Stays", v2 inline "Hotel Reservations" rows), which parse guest lines through separate code, carrying a `deferred:BL-PARSER-HOTEL-INLINE-AMBIGUITY` exemption in that file's `TRANSFORM_SITES`. The transform-sites walker enforced that every `deferred:` ref resolve in `BACKLOG.md`, so the row was load-bearing for a live guard. Closed by the hotel-ambiguity-coverage spec, which names it under **Closes:**; `HOTEL_GUEST_SPLIT_AMBIGUOUS` is now a real catalog code (`lib/messages/catalog.ts:1383`) and no `deferred:BL-` exemption remains anywhere under `lib/parser/blocks/` (verified 2026-08-02).

Its `BACKLOG.md` row lived under a section called "Parser ambiguity-warning coverage (2026-07-07, ambiguity-warnings-v1)", which was DELETED at close rather than graduated here, which is why the id dangled: the spec's own **Closes:** line still cites that section by name.

---

## BL-PARSER-ADDRESS-SPLIT-AMBIGUITY — RESOLVED (2026-07-26, PR #608 `feat/hotel-ambiguity-coverage`)

**Filed:** 2026-07-07 (ambiguity-warnings-v1 §6 deferred-exemption seed) · **Resolved:** 2026-07-26 · **Class:** parser observability · **Effort:** M

Twin of the entry above, same spec, same close, same deleted section. `splitHotelNameAddress` un-glues a venue name from a street address the exporter has flattened, using a first-standalone-street-number heuristic — a genuinely ambiguous transform that emitted nothing, and carried the `deferred:BL-PARSER-ADDRESS-SPLIT-AMBIGUITY` exemption in `hotels.ts`'s `TRANSFORM_SITES` rather than a warning. `HOTEL_ADDRESS_SPLIT_AMBIGUOUS` is now a real catalog code (`lib/messages/catalog.ts:1426`).

---

## BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL — RESOLVED (2026-07-31, PR #635 `feat/inline-later-group-own-hotel`)

**Filed:** 2026-07-27 · **Resolved:** 2026-07-31 · **Class:** parser correctness · **Effort:** L

A later segment of an inline hotel cell could carry its own hotel rather than inheriting the nearest preceding one, and the parser had no way to tell those apart. Closed by `classifyLaterSegment(rawSegment, ordinal, contextYear)` in `lib/parser/blocks/hotels.ts` — a pure exported three-tier detector implementing the spec's D1-D7 pipeline (normalize, divider strip, conf-delimiter prefix cut, address anchor plus tail extension, tier decision with guards, caps and scans, rebuild through the existing `buildInlineHotel`) — wired into `buildInlineReservations`, with caller-side scope-A/scope-B degraded scans and nearest-preceding inheritance for multi-marker and fallback cells, plus two new warn-severity ParseWarnings. Pinned by `tests/parser/inlineLaterGroupDetector.test.ts` against the spec's ~159-row §8.1 behavior table, every row copied byte-exact.

Spec `docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md`, APPROVED after 58 adversarial rounds; the round-economy rules in `docs/agents/adversarial-round-economy-2026-07-31.md` were written from this arc's retrospective. The plan's `00-overview.md` names it under **Closes:**, but no row was ever graduated.

---

## BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW — RESOLVED (2026-07-26, PR #580)

**Filed:** before 2026-07-24 · **Resolved:** 2026-07-26 · **Class:** UI layout (phantom gap) · **Effort:** S

A `flex-1` decorative hairline in the `BulkIgnoreControls` eyebrow is a flex ITEM. In a row with enough real content to consume the line, `flex-1` resolves to ZERO width and the row still charges its `gap` on BOTH sides of the invisible rule. Closed by hiding the rule below 480px (`hidden min-[480px]:block`) plus a `min-w-*` floor; `DESIGN.md` §7a gained the zero-WIDTH sibling case alongside the childless-item `empty:hidden` idiom.

The row was DELETED from `BACKLOG.md` at close rather than graduated — `docs/superpowers/specs/2026-07-24-dq-eyebrow-divider-and-confirm-bar-design.md:222` instructs exactly that ("delete the entry — the debt is paid, not deferred"), which is what left five citations, including two e2e specs and `BACKLOG-archive.md:541`, pointing at nothing. Recorded here instead; deleting a closed row is what this file exists to prevent.

---

## BL-SHOWSTABLE-720-TITLE-FLOOR — RESOLVED (2026-07-01)

**Filed:** before 2026-07-01 · **Resolved:** 2026-07-01, `fix(admin): raise shows-table stacked→columnar breakpoint 720→768` · **Class:** UI layout · **Effort:** S

The shows-table's multi-column grid activated at `min-[720px]`, but at exactly 720px the `minmax(0,1fr)` title track resolved to about 106px, under the band sweep's `MIN_TITLE_PX = 120` floor. Raised the stacked-to-columnar breakpoint to `min-[768px]` (live at `components/admin/ShowsTable.tsx:86`), so the table keeps the existing stacked mobile layout below 768px, where the columns genuinely do not fit with a readable title. Spec `docs/superpowers/specs/admin/2026-07-01-shows-720-title-floor-design.md`, plan `docs/superpowers/plans/admin/2026-07-01-shows-720-title-floor.md` — both open by naming this id as the gap they fix, and neither graduated a row.

---

## Backlog ids named by a conditional that never fired, or withdrawn before filing (recorded 2026-08-02)

Five ids that a spec or plan spells out as a REAL id, in a branch that turned out not to be taken. Nothing was ever filed, and nothing should have been. They are recorded rather than left dangling for two reasons: the citations are load-bearing prose that should stay readable, and a reader who greps one of these should learn that the branch did not fire, not find silence and assume the work was dropped.

Verified 2026-08-02 against live code, not against the documents that name them.

### BL-ATTENTION-PILL-FOCUS-UNWIRED — conditional never fired (spec is wired)

`docs/superpowers/plans/2026-07-24-attention-index.md:299` is the RED branch of a wiring task: "do not wire it. File `BL-ATTENTION-PILL-FOCUS-UNWIRED` in `BACKLOG.md` with the failure output." The GREEN branch was taken — `attention-pill-focus` is in the standalone harness project regex (`tests/e2e/standalone.config.ts:86`), it carries no `LOCAL_ONLY_ALLOWLIST` row, and `tests/ci/_metaE2eWorkflowCoverage.test.ts` passes, which it could not do if the spec were dark and unallowlisted.

### BL-E2E-REPORT-MODAL-UNRUNNABLE — conditional never fired (registration kept)

`docs/superpowers/plans/2026-07-26-ci-dark-descoped-closeout/plan.md:603` is the RED half of a disposition step: if `report-modal` failed beyond quick fixture drift, revert its registration and add a `DARK_SPEC_ALLOWLIST` row citing this id. It went green: `report-modal` is registered in both Playwright project alternations (`playwright.config.ts:65` and `:79`) and keeps the pre-existing `UNSEEN` row (`tests/ci/_metaE2eWorkflowCoverage.test.ts:164`), which is exactly the step's stated GREEN outcome ("keep registration + the existing `UNSEEN` row — premise restored").

### BL-CI-UNIT-SUITE-PHASE2 — conditional never fired, and its question was superseded

`docs/superpowers/plans/2026-07-19-ci-unit-suite-under-5min/00-plan.md:507` instructs, on one branch of a keep-fastest fallback, appending the residual wall-clock gap to `BACKLOG.md` as a heading of this name. No such heading was ever added. The 6-vs-8 leg question the branch turned on has since been superseded outright: `unit-suite` now splits by database need rather than by leg count alone (8 db legs running `--project=serial`, 3 no-db legs running `--project=parallel`, per the workflow's own header comment), so the residual that heading would have recorded no longer describes the pipeline.

### BL-DESTRUCT-FORK-FOCUS-TRANSFER — withdrawn at spec time, never filed

`docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md:195` withdraws it in as many words, in a "Not needed / Why" table: "Focus transfer across a fork — no fork to cross; `BL-DESTRUCT-FORK-FOCUS-TRANSFER` is withdrawn rather than filed." The design ended up with one subtree and no branch, so the finding it would have tracked has no surface to occur on.

### BL-CI-P3-FILE-GRANULAR-SERIAL — a ratification pointer, not an item

`docs/superpowers/specs/ci/2026-07-20-ci-overlap-boot-with-setup.md:17` cites it in a "Resolved scope — do not relitigate" table as the ratification for keeping test-membership changes (which files run in which vitest project) out of scope: P3 measured no wall-clock gain from them and was **closed unmerged** (PR #510). So the id names a decision with its evidence, not open work, and re-proposing file-granular serial membership needs a new measurement that beats P3's, not this row.

---

## Impeccable-gate deferrals whose backlog row was never opened (filed retroactively 2026-08-02)

Fifteen ids named by a `Backlog: BL-…` line at the end of a `DEFERRED.md` gate deferral, where the row that line promises was never created in `BACKLOG.md`. Each deferral has since closed — resolved by a later pass, or made moot when its surface was removed — so the promised row never had an open life to have; but the ids stay cited from specs, plans, and `DEFERRED-archive.md`, and this file's contract is that every such reference resolves to something readable (see the preamble above).

Filed here at their already-terminal state rather than as open work, because none of them is open. Each row names the deferral id it came from, so the full finding, its deferral rationale, and its resolution stay in `DEFERRED-archive.md` rather than being duplicated. Three of these say in as many words that no row was ever filed (`BL-VENUE-DEGRADED-TILE-LABEL`, `BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL`, and `BL-COLLAPSEPANEL-REGION-OPTOUT`, which has its own section below); the pattern generalizes to all fifteen.

### BL-ADMIN-EYEBROW-FAINT-CONTRAST — RESOLVED (2026-07-16, accent-contrast token pass)

From `VCR-1` (venue-card-redesign impeccable critique, P1). The shared Stage-3 eyebrow token `--color-text-faint` rendered 10px uppercase labels at roughly 3.0-3.75:1, under the 4.5:1 AA floor, on every Stage-3 card rather than just the venue one — which is why the auditor asked for a token-level disposition instead of a per-card patch. Closed by the accent-contrast token pass: `CELL_EYEBROW_CLASS`, the hard-coded venue and dock eyebrows, and the map badge all re-pointed to `text-subtle`, with a wizard 10px-faint scan pinning the class.

### BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL — RESOLVED (2026-07-17, `fix/autoapplied-kinddot-tell`)

From `KINDDOT-1`. `KindDotCluster` distinguished `crew_removed` (warn `#b26a16`) from `crew_renamed` (review `#a87716`) by hue alone, which a color-vision-limited operator on a sunlit floor cannot rely on. Ratified as not a WCAG 1.4.1 violation (dots are `aria-hidden` with a cluster `aria-label` naming every kind, and every disposition control lives behind the expand), so it was deferred as polish. Closed when the shows-glance-legibility pass fired: the destructive marker became a shape-distinct centered minus-bar, non-removed kinds stay filled discs, and every marker gained a shape-independent `data-testid`.

### BL-BLOCKRES-ESCALATED-HELP — RESOLVED (2026-07-17)

From `BLOCKRES-1` (P2). `BlockedRowResolver`'s escalated state carried no `HelpAffordance`, so Doug lost the "What does this mean?" context every other error branch offers while a developer clears the block. The original deferral rationale — that it conflicts with the no-clickable-trigger contract — was itself wrong: the Task 11 test pins no `<button>` and no `[role="button"]`, and a disclosure `<summary>`/`<a>` is neither, while the invariant-5 escalation test already strips the `help-affordance` subtree. Closed by rendering `<HelpAffordance code={code}>` on the escalated branch.

### BL-BLOCKRES-HELP-GATING — RESOLVED (2026-07-17)

From `BLOCKRES-2` (P2). `errorCopy: string | null` became a discriminated `{ kind: "coded"; copy; code } | { kind: "plain"; copy } | null`, so `HelpAffordance` renders only on coded branches (`needs_attention`, `busy`), keyed to the RESPONSE `body.code` — the same code the dougFacing copy comes from. This matches `RescanSheetButton`'s info-vs-coded split and fixed a latent mismatch where help used the row `code` while copy came from `body.code`. Code-less statuses now render a plain line with no disclosure.

### BL-BLOCKRES-DISABLED-WIRING — CLOSED AS DESIGNED (2026-07-17)

From `BLOCKRES-4` (P3). `BlockedRowResolver`'s `disabled` prop (freeze during an active publish or finalize run) stays implemented and tested but is deliberately not wired from either call site. Both panels render the resolver only in `cas_per_row` state, which is mutually exclusive with `running`; the auto-retry flips state to `running` and unmounts the whole panel. So `disabled={isRunning}` would always be `false` where the resolver renders — dead wiring, and a weaker freeze than the unmount it would duplicate. The prop is retained for the standalone contract and for a future architecture where the panel stays mounted during retry.

### BL-DATAQUALITY-BADGE-TOUCH-DETAIL — RESOLVED (2026-07-17, `feat/badge-affordance-a11y`)

From `FLOW4-2`. The roster/gap breakdown reached sighted users only through a `title` tooltip on a non-focusable `<span>`, invisible on touch and keyboard. `DataQualityBadge` now renders the signal type and count as visible chips (glyph plus `tabular-nums` count), dissolving the `title`-only dependency; the full class-level breakdown stays in the byte-preserved `aria-label`/`title` as progressive enhancement, and the component stays hook-free and presentational.

### BL-DATAQUALITY-BADGE-SEGMENT-GLYPH — RESOLVED (2026-07-17, `feat/badge-affordance-a11y`)

From `FLOW4-3`. One amber `TriangleAlert` conflated parse gaps with roster shift, so a glance could not tell them apart. The badge now renders up to two chips — `Users` for roster changed, `TriangleAlert` for parse gaps, roster first — each with a visible count. Distinction is carried by glyph shape and count, never hue: both stay `text-status-warn-text`, upholding the DESIGN §1 color-blind floor. The split is recorded as a DESIGN.md §1.3 decision.

### BL-FLOW4-MOBILE-AUTOAPPLIED-PARITY — RESOLVED (2026-07-16)

From `FLOW4-1`. `RecentAutoAppliedStrip` mounted only inside the desktop inbox column, so an operator under 720px saw the amber roster-shift badge in `ShowsTable` with no path to review, count, Accept, or Undo. Closed by mounting the strip on `/admin/needs-attention` (the mobile full-list route the summary card already links to, at `headingLevel=2`) plus a mobile summary-card signal.

### BL-FLOW4-BULK-UNDO-ERROR-SURFACE — RESOLVED (2026-07-16, destructive-confirm pass)

From `FLOW4-4`. `confirmUndoAll` awaited `undoFromDashboardAction` per id and discarded each result, closing the confirm panel regardless, so a partial failure such as `UNDO_SUPERSEDED` produced no explicit message — only the implicit tell that the failed row stayed visible after revalidation. Closed by an aggregate `role="alert"` ("Couldn't undo N of M…") shipped in the destructive-confirm pass, with thrown actions counted as failures.

### BL-FLOW4-CONFIRM-DANGER-STYLE — RESOLVED (2026-07-16)

From `FLOW4-5` and `FLOW4-6`, which named the same row. `FLOW4-5`: the Undo-all confirm rendered "Keep changes" and "Undo all N" as near-identical neutral buttons, a mis-tap risk on a phone. `FLOW4-6`: `confirmUndoAll` unmounted the confirm panel while focus could sit on the confirm-go button, dropping focus to `<body>`. Closed by the inverted-amber destructive recipe (`bg-warning-text`/`text-warning-bg`) shipped project-wide and pinned by `tests/styles/_metaDestructiveConfirm.test.ts`, plus a guarded focus restore to the disclosure toggle (ejection-aware, capture-at-click) on both the cancel and completion paths.

### BL-HERO-SEGMENT-VIBRANCY — RESOLVED (2026-07-17, `feat/hero-segment-vibrancy`)

From `ACCENT-PASS-1` (P2). The hero's active show-day segment had been changed `bg-accent` to `bg-accent-on-bg` to clear WCAG 1.4.11, costing brand vibrancy on the one surface PRODUCT.md reserves for expressive orange. Closed by `border border-accent-edge bg-accent`: the vibrant fill is restored and the 3:1 boundary is carried by the edge stroke, the same recipe the toggles and the wizard active pill already use. The edge clears 3:1 on every surface the segment can render on, including the stale-tint morph path; the inactive `bg-border` track is unchanged under its pre-existing ratified contract.

### BL-MOBILEPARITY-STRIP-HEADING-SIZE — RESOLVED (2026-07-17, `fix/mobileparity-heading-fixes`)

From `MOBILEPARITY-1`. `RecentAutoAppliedStrip` kept `text-sm` on its section heading at both `headingLevel` values, so on `/admin/needs-attention` a semantic `<h2>` rendered at 14px, visually subordinate to the group cards under it. Bumped to `text-base` at BOTH mounts rather than forked by level, preserving §D3's identical-classes-across-contexts invariant; 16px stays below both parents at both mounts, so no hierarchy inverts. Class equality across mounts is now pinned by test, which promotes §D3 from prose to an executable invariant.

### BL-OVERRIDE-CONTROL-ARIA-FIELD-QUALIFIER — MOOT (2026-07-16, surface removed in PR #382)

From `OVR-5`. The reused `OverrideableField` paused branch rendered "Re-point"/"Discard" with no field qualifier, so a screen-reader user tabbing orphan rows heard the same pair repeatedly, and the visible `ORPHAN_FIELD_LABEL` span was not linked by `aria-labelledby`. Deferred because it was an inherited pattern shared by every override surface and belonged at the shared-component level. Never filed, and moot before it could be: PR #382 removed the orphan-block surface. Recorded rather than dropped, because the underlying shared-`OverrideableField` shape would return with any future override surface.

### BL-OVERRIDE-ORPHAN-SALIENCE — MOOT (2026-07-16, surface removed in PR #382)

From `OVR-6`. The "Paused overrides" section used the same calm neutral tokens as the non-actionable Show-details and Hotels blocks, so nothing signalled that it needed action, and "Re-point" is jargon for a non-technical operator. Deferred as an enhancement rather than a correctness gap, since the durable needs-attention stream already draws Doug to the item and this block is the deep-link target, not the primary alert. Moot with the same PR #382 removal.

### BL-VENUE-DEGRADED-TILE-LABEL — RESOLVED (2026-07-17, `venue-degraded-tile-glyph`)

From `VCR-4` (P3). On the permanently link-only degraded tile (empty geocode query plus a valid `mapHref`), the always-painted stripe base still carried the `map` mono label, visually identical to the transient loading state, so nothing distinguished "map coming" from "no map, ever". Closed by rendering a centered `MapPin` "no preview" glyph empty state on the terminal tile while the standard and loading tiles keep `map`. `VCR-4`'s own trigger line sanctioned that label divergence in advance.

---

## BL-TRANSPORT-VIEWER-NAME-MATCH — RESOLVED (2026-06-26, `c0165ad05`)

**Filed:** retroactively 2026-08-02 · **Resolved:** 2026-06-26, `c0165ad05` `fix(crew-page): name-aware transport-tile viewer match (namesRefer)` · **Class:** crew-page visibility correctness · **Effort:** S

Filed retroactively because the id had no ledger row: it is cited from four shipped source sites as the provenance of a decision, never as an open item, so nothing ever graduated. Recorded here so those citations resolve.

`transportTileVisible` matched the viewer against `transportation.driver_name` and `transportation.schedule[*].assigned_names[]` with exact `===`. `driver_name` is FREE-TEXT (`presence(clean(...))` in the transport block parser, not roster-validated), so a sheet's "Driver: Doug" never equalled a roster "Doug Larson" and the driver could not see their own ride card. Replaced by the name-aware `namesRefer` matcher (`lib/data/nameMatch.ts`) — NFD/diacritic fold, `Jr`/`Sr` suffix strip, single-token first/last prefix compatibility, multi-token surname anchoring — the same matcher the hotel filter uses (`BL-HOTEL-VIEWER-NAME-MATCH`). Later widened to the alias-set form `namesReferAny` when the `viewerNameAliases` §3.5 name-override work landed (`6a7eaaa79`, 2026-07-09) and joined by a garble-proof id path (`282cadeb7`, same day), so a viewer whose id is in `transportationOwnerIds` sees the tile even when the sheet garbled the driver name past name matching.

**UX-not-security** per the owner's 2026-05-23 determination (master spec amendment): the filter is presentation, over-match is benign (the tile is re-reachable by re-picking), under-match (hiding a viewer's own ride) is the harm. Live citations: `lib/data/getShowForViewer.ts:243`, `lib/visibility/scopeTiles.ts:162`, `lib/visibility/transportTransitions.ts:9`, `tests/visibility/transportTransitions.test.ts:219` (the transition-matrix test picks old/new placeholder names with distinct surnames precisely because the matcher is surname-aware).

---

## BL-HOTEL-VIEWER-NAME-MATCH — RESOLVED (2026-06-26, autonomous pipeline)

**Filed:** retroactively 2026-08-02 · **Resolved:** 2026-06-26 · **Class:** crew-page visibility correctness · **Effort:** M

Filed retroactively as a heading of its own. The close-out was written into the BODY of the parser-residuals entry ("Hotel `hotel_name` / address split + conf#", item 3 of the exporter-fidelity backlog further down this file), so the id resolved for a human reading that entry but for nothing that greps by heading — including the eight citations across shipped source, spec, and plan.

The per-viewer hotel filter in `getShowForViewer` was `res.names.some(n => guest.includes(viewer))`, a naive substring test broken for roughly five of the seven corpus shows (first names `Carl` ⊉ `Carl Fenton`; nicknames `Douglas`/`Doug`, `Alexandre`/`Alex`, `DJ`/`David`; initials `Eric W`/`Eric Weiss`). Replaced by `hotelVisibleToViewer` (`lib/data/getShowForViewer.ts:113`) over `namesReferAny`, plus a `parseGuestCell` slash-split so future data stores one guest per entry while already-persisted `"David Johnson / Jeffrey Justice"` rows still match at MATCH time (no DB backfill). Pinned by the `namesRefer` unit matrix, an explicit + fixture-derived `hotelVisibleToViewer` suite, a structural source guard against a `.includes` relapse, and three seeded live-DB `getShowForViewer` regressions.

Spec `docs/superpowers/specs/parser/2026-06-26-hotel-viewer-name-match.md`, plan `docs/superpowers/plans/parser/2026-06-26-hotel-viewer-name-match/00-overview.md` (Codex: spec APPROVED in 4 rounds, plan APPROVED in 4). Full narrative, including the per-show breakage table and the round-by-round review history, stays in the parser-residuals entry rather than being duplicated here.

---

## BL-CRON-SYNTHETIC-SHOW-SKIP — RESOLVED (2026-07-17, `542eb098a` + `7e4788301`)

**Filed:** retroactively 2026-08-02 · **Resolved:** 2026-07-17 · **Class:** cron reconciliation soundness · **Effort:** S

Filed retroactively: cited from three shipped sites as the provenance of the guard, never as an open row.

A db/e2e run pointed at a shared remote database can COMMIT a seeded `published=true` show and leave it behind (`sql.begin` commits on success; several seeders do no cleanup). The scheduled cron then listed live shows, found the row absent from the Drive folder listing, and marked it `source_gone`/`SHEET_UNAVAILABLE` on every tick forever — churning the tick to `outcome: partial` and generating alert noise for a row that can never resolve. `lib/sync/syntheticDriveFileId.ts` recognizes the test-seed shapes (`drv-<uuid>`, `drive-<uuid>`, `picker-e2e:*`) and the missing-shows filter in `runScheduledCronSync` skips a row only on the CONJUNCTION of synthetic shape AND `last_seen_modified_time IS NULL`.

The conjunction is the load-bearing part and came from Codex R1 MEDIUM (`7e4788301`): the shape filter alone is strong but not a proof of impossibility, since the Drive id charset admits hyphens and hex, so a real Drive id could in principle land on the hyphenated-UUID shape. Every production show-insert stamps `last_seen_modified_time` in the same statement (the cron first-seen INSERT and the shared `applyStaged` upsert used by onboarding finalize), so a NULL watermark can only come from a non-apply test seeder, and a genuine show that LEFT the folder has synced at least once and is still reconciled. Pinned by `tests/sync/syncRevalidate.test.ts:211` — a synthetic row alongside a real gone show, asserting only the real one enters the loop.

---

## BL-ONBOARDING-SCAN-EXPORT-HANG — RESOLVED (2026-06-26, `d18a15a95`)

**Filed:** retroactively 2026-08-02 · **Resolved:** 2026-06-26, `d18a15a95` `fix(drive): bound the xlsx export with an AbortSignal stall guard` · **Class:** infra liveness · **Effort:** S

Filed retroactively: the id survives only as a `describe` title in the test that pins the fix.

Drive's xlsx export intermittently stalls for heavy sheets, and a reproduced onboarding scan hung on one. A silent socket stall never throws, so `withDriveRetry` — which reacts to thrown 429/5xx — could not see it, and the scan sat forever with no timeout of its own. `lib/drive/fetch.ts` now bounds each export attempt with an `AbortSignal` stall guard and surfaces the abort as a transient 504 (`DriveFetchError`), so `withDriveRetry` retries the stalled export with a fresh budget rather than failing it outright; a PERSISTENTLY stalled sheet now fails the whole scan instead of hanging it. Pinned by `tests/drive/fetch.test.ts:689` with zero-jitter, zero-sleep fake retry so the assertions stay deterministic and fast.

---

## BL-CASP2-POPOVER-PROXIMITY — RESOLVED (2026-07-17, `b60deb33b`)

**Filed:** retroactively 2026-08-02 (CASP2-2, impeccable critique P1) · **Resolved:** 2026-07-17, `b60deb33b` · **Class:** UI polish (error-surface proximity) · **Effort:** S

Filed retroactively as a sibling heading to `BL-CASP2-STRIP-POLISH` (which does have one). The closure was written inside the `CASP-2` entry's body in `DEFERRED-archive.md`, so the id resolved for a reader of that entry but not for the shipped-source citation at `components/admin/PublishedToggle.tsx:49`.

The inline `PublishedToggle` rendered refusals and generic retry copy in a right-anchored `right-0 w-max max-w-60` popover hanging off the sticky `StatusStrip`. When a long show title made the strip flex-wrap, the toggle moved far left while the popover stayed pinned to a phantom right edge, breaking Gestalt proximity between the control and its error. Widening it to a full-strip-width banner (`inset-x-0`, `top-full`) makes its x-position invariant to where the toggle wraps, so it can never disconnect — and a full-width banner is in-viewport BY CONSTRUCTION at 390px, where the rejected toggle-anchored alternative overflowed both extremes. `break-words` caps long `ErrorExplainer`/`HelpAffordance` tokens so copy grows vertically only.

ERROR-ONLY by design: errors are momentary. The longer-lived finalize skin split off to the in-flow `FINALIZE_CHIP` under `BL-CASP2-STRIP-POLISH` so it never overlays the rail content below the strip. Geometry pinned by `tests/e2e/statusStripToggleLayout.spec.ts` §8.10c (banner hugs strip edges, width > 300px, x-position identical short vs long title); class set pinned by the `PublishedToggle.test.tsx` positioning-parity unit test. Impeccable dual-gate on the diff: critique no-slop, detector clean, audit 20/20, contrast AA both themes (6.09:1 light / 6.94:1 dark).

---

## BL-COLLAPSEPANEL-REGION-OPTOUT — RESOLVED (2026-07-17, `4d1980ba9`)

**Filed:** retroactively 2026-08-02 (COLLAPSE-REGION-1) · **Resolved:** 2026-07-17, `4d1980ba9` `fix(admin): CollapsePanel region opt-out; strip groups drop landmark` · **Class:** a11y (landmark proliferation) · **Effort:** S

This id was never opened as a row — `DEFERRED-archive.md`'s COLLAPSE-REGION-1 resolution says so in as many words ("was cited here but was never actually filed in `BACKLOG.md` (no row to close)"). It is nonetheless cited from shipped source as the provenance of the opt-out, so the row is written retroactively at its already-resolved state rather than left dangling; that note in `DEFERRED-archive.md` is updated to point here.

`CollapsePanel` set `role="region"` plus `aria-label` on every disclosed panel. WAI-APG cautions against many region landmarks, and `RecentAutoAppliedStrip` can render up to `STRIP_RENDER_CAP = 50` show groups, so an admin with a busy dashboard could swamp the AT landmark list. `CollapsePanel` now takes `region?: boolean` (default `true`); `region={false}` drops the role and label — a bare `aria-label` is not surfaced on a generic element — while preserving the id/testid (the `aria-controls` target), the overflow-hidden clip, and the inert-when-closed behavior. The strip's per-group panels pass `region={false}`, since the toggle above each already names and controls it (`aria-expanded` + `aria-controls`, show name as its accessible name); the two singleton disclosures (IgnoredSheets, AddAdmin) keep the default. Pinned by `tests/components/admin/CollapsePanel.test.tsx` (region-false drops role and label but keeps id and inert; default keeps the landmark). Live citation: `components/admin/RecentAutoAppliedStrip.tsx:459`.

---

## BL-CI-STATIC-ENV-INJECTION — RESOLVED (2026-08-02, `test/ci-static-env-injection`)

**Resolution:** both guard layers now refuse static `env:` blocks carrying off-allowlist pairs. One shared registry in the scanner module — `ENV_KEY_ALLOWLIST`, VALUE-PINNED and PAIR-KEYED GOVERNANCE-BOUND rows (`key → { values: [{ text: exact scalar text, governs: [covered spec paths THAT PAIR gates] }], reason }`) seeded from the 35 live keys (38 pairs). Governance hangs off the VALUE, never the key: a key-level list cannot see two live values of one row swap between the claiming site and a parked one, which leaves a value-gated spec self-skipping green — and one shared predicate `offAllowlistEnvKeys` (`Object.hasOwn` membership + pinned-value-text membership; expressions pin as text). Scanner: scope-correct rejection — workflow-root env governs the file, job env its job, a run-step's env its own claims — with reason `env block sets unmodelled key(s): <sorted keys>`; a `uses:`/composite step handed dirty env poisons the job fail-closed through the generalized `envPoisoned` mechanism (reason and census why-string both name the static source now). Census: `runBlocksOf` gained an allowlist parameter and per-scope poison seeding; composite dirt poisons onward, workflow run-step dirt stays block-local. Mutation families pinned per layer, not uniformly in both: S1–S3 and S7 (scope/traversal, fail-open flip, precision twins, value-pin) in BOTH self-suites; S4–S6 and S8 (reason strings, multi-key completeness, allowlist hygiene, governance) in the SCANNER self-suite only, because reasons, the registry and the governance derivation are scanner-side concepts the census does not model (S7 = value-pin deletion, from the R2 live mutant `MODAL_PREFETCH_E2E=0` — a green run with no tests under a key-name-only registry; S8 = governance-binding deletion, from the R3 relocation / R4 prose-laundering / R5 duplicate-substitution live mutants — governance derives from the scan's own covered-claim crediting via `envPairGovernance` + `governanceViolations`); pair-level stale-row + live-completeness (both directions: declared→live and live→declared) + governance-equality + reason hygiene keeps the registry from rotting in either direction. Spec: docs/superpowers/specs/ci/2026-08-02-ci-static-env-injection-design.md (§7 = review record). Original entry below.

## BL-CI-STATIC-ENV-INJECTION — a workflow/job/step `env:` block can select a fake executable and the coverage scanner still counts the spec

**Filed:** 2026-08-01 (R1 adversarial review of the cross-step-env-guard spec, `docs/superpowers/specs/ci/2026-08-01-ci-cross-step-env-guard-design.md` §5 L3). **Class:** CI guard soundness. **Effort:** S–M.

Static env injection is a FAIL-OPEN residual of `tests/ci/_workflowCoverageScan.ts`: a job-level `env:\n  PATH: fixtures/fake:/usr/bin:/bin` followed by a textually clean `pnpm exec playwright test …` step yields `covered` containing the spec and `rejected: []` (R1 probe, 2026-08-01). Unlike the cross-step `GITHUB_ENV`/`GITHUB_PATH` class (closed by that spec), there is no step ordering to thread — the vector is a static key the scanner simply does not model. Existing partial mitigations: `standalone-e2e.yml` pins no-`env:` at every level (workflow, job, step) for the reporter-path surface, and the `PLAYWRIGHT_*` raw-text sweep covers that env-var family; the general scanner and the census have no such pin. Zero live workflows carry an `env:` PATH override today.

**Work:** decide the modeling posture (reject-on-`env:`-anywhere is the scanner's `UNMODELLED_RE` pattern and probably right; an allowlist of known-benign env keys is the alternative), apply it to both guard layers, and pin with synthetic fixtures per the finding-admissibility contract.

**Status:** OPEN.

---

## BL-DANGLING-CITATIONS-RETIRED-WORKFLOW — RESOLVED (2026-08-02, `docs/citation-rot-financials-vocab`)

### BL-DANGLING-CITATIONS-RETIRED-WORKFLOW — `spec:lint` hard-fails on docs citing the deleted e2e workflow

**Status:** OPEN — fallout from c7c5625c2, found while shipping PR #610 · **Severity:** very low · **Class:** DOC HYGIENE

`origin/main` deleted `.github/workflows/modal-header-layout-e2e.yml` when it retired seven per-feature
e2e workflows. Backticked references to that path are citations to `spec:lint`, so every doc still
naming it now hard-fails `CITATION_FILE_MISSING`. Note the linter keys on the `.yml` extension, not on
the directory separator — shortening to a bare filename does NOT clear it; the backticks have to go.

PR #610 swept its own three docs (5 + 3 hard findings → 0 each) by rendering the name as prose. Seven
others were left alone deliberately, to avoid pulling unrelated specs into an in-review diff:

- `docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band.md`
- `docs/superpowers/plans/admin/2026-07-25-destruct-thumb-order-drift-guard.md`
- `docs/superpowers/plans/2026-07-18-modal-header-reconciliation/CLOSE-OUT.md`
- `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md`
- `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md`
- `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md`
- `docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md`

**Not urgent:** `spec:lint` is not wired into any workflow (verified — no `.github/workflows/**` match),
so nothing is merge-blocked. It fails only for whoever runs it by hand on one of those files.

**Fix (when prioritized):** one mechanical pass stripping the backticks; the last entry is the
retiring spec itself, where the old name is legitimate history.

**CLOSED 2026-08-02** — resolved on docs/citation-rot-financials-vocab: all 15 backticked citations to the seven deleted workflows rendered as prose (the entry's seven-file list was class-swept to 10 files; the retiring spec — second-to-last in the entry's list, not last — was measured already clean and needed no edit). Residual non-target lint findings (12, five classes) deliberately left, inventoried in the batch spec §1.1.

## BL-MASTERSPEC-FINANCIALS-VOCAB — RESOLVED (2026-08-02, `docs/citation-rot-financials-vocab`)

## BL-MASTERSPEC-FINANCIALS-VOCAB — reconcile stale LEAD-only financials-gate prose in the master spec

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug, owner scope decision) · **Class:** docs (canonical-spec consistency) · **Effort:** S (doc-only grep-sweep)

Pre-existing `2026-07-15-extend-role-scope-vocab` debt: that spec added the `FINANCIALS` role flag but did not reconcile the master spec's (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) ~15 financials-access prose claims, which still describe financials/`shows_internal`/FinancialsTile access as LEAD-only. Live code (`lib/data/getShowForViewer.ts:380` `financialsEntitled = isAdmin || includes("LEAD") || includes("FINANCIALS")`, `lib/visibility/scopeTiles.ts:141`) grants on LEAD ∪ FINANCIALS ∪ admin. Reconcile every financials-entitlement claim to `LEAD ∪ FINANCIALS` (or admin). Grep seed: `rg -n "financ|shows_internal|FinancialsTile|financialsEntitled|Proposal|Invoice|PO#" <masterspec> | rg -i "LEAD" | rg -v "FINANCIALS"` (the final exclude is CASE-SENSITIVE — drops only lines already naming the all-caps FINANCIALS role flag). Exclude RLS-admin-only denial and `raw_unrecognized`/`parse_warnings` (admin/LEAD-only — FINANCIALS grants only the `financials` column). Trigger: next master-spec pass or an audit flagging the drift. (This capability-narrow change already corrected the §6.8 MI-9 "LEAD is the only capability element" claim; the rest is out of its scope.)

**CLOSED 2026-08-02** — resolved on docs/citation-rot-financials-vocab: 14 claims reconciled (11 of the seed's 15 hits + 3 seed-blind instances found by a whole-file window probe), line-count-neutral, entitlement phrased as LEAD or FINANCIALS or admin per the live financialsEntitled mechanism. The 4 seed no-edit lines and 8 probe non-claims are ratified in the batch spec §3.2/§3.2.1. One same-vocabulary residue found during review — the §12.4 ROLE_FLAGS_NOTICE helpfulContext over-grant — is filed separately as BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (needs the §12.4 three-way lockstep).

## BL-SOUND-REDIRECT-GUARD — RESOLVED (2026-08-01, `test/redirect-guard-type-aware`)

**Resolution:** the syntactic 19-spelling matcher in `tests/cross-cutting/no-absolute-self-redirect-audit.ts` is replaced by TWO-PRONG type-checker resolution over walked roots extended to `app/** + lib/**` plus the permitted root middleware/proxy surfaces (ts/tsx/js): prong 1 flags every call whose resolved signature's declaration is `redirect` on a container named `NextResponse`/`Response`; prong 2 flags every OTHER reference to that method OR to the class object carrying it — property/element access, binding elements, destructuring-assignment members (via the vendored compiler's `getTypeOfAssignmentPattern`), and naked `NextResponse`/`Response` value flows — type-decided, never allow-listable. All four residual classes this entry filed (helper return, class field, re-export, dynamic dispatch) are caught, plus the families the spec/plan reviews and the whole-diff rounds (each recorded in the spec's disposition blocks) surfaced on the way: twelve typed value-flow shapes, ten literal-typed computed-key extraction shapes, union-typed keys, eight destructuring-assignment forms, ten whole-receiver structural-laundering shapes, namespace carriers, import-call carriers, re-export carriers, CommonJS require and import-equals carriers, and global-object carriers (symbol-based provenance over direct references, local aliases, and single-file helper returns; deeper environment indirection stays under the deliberate-evasion concession) — the spec §6 closure tables are the canonical enumeration (grown across the whole-diff rounds), pinned by fixtures + the E1 escape pin in `tests/cross-cutting/no-absolute-self-redirect.test.ts`. Former limits receiver-as-any, widened computed keys, and `Reflect.get` are CAUGHT at the naked class-object reference their erasure must spell; the sole remaining type-erasure limit, pinned AS BEHAVIOR (E1), is string-mediated dynamic access (eval shape). Plain-JS modules are fenced out of the walked roots by a sentinel (tsconfig `include` is TS-only + `checkJs` off, so `tsc --noEmit` gives JS no backstop). Spec: docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md (spec APPROVE r4, plan APPROVE r3, then whole-diff-driven closures recorded in the spec's disposition blocks; probe harness committed: self-contained probes beside the spec, the importing mutant corpus under tests/cross-cutting/redirect-guard-probes/). Original entry below.

## BL-SOUND-REDIRECT-GUARD — the self-redirect guard is a known-spellings tripwire, not a sound analysis

**Status:** OPEN · **Severity:** low (the tree is clean; this is about future-proofing) · **Surfaced:** `fix/picker-flow-app-bugs` review rounds 1-5 (2026-07-25)

`tests/cross-cutting/no-absolute-self-redirect-audit.ts` bans `NextResponse.redirect` (and the Web API `Response.redirect`) under `app/`, because an absolute `Location` built from `request.url` carries whatever host Next reports rather than the one the client typed, which drops host-scoped cookies. It now recognises 19 spellings — inline, variable-assigned, alias chains, captured bases, nested-block declarations, parenthesised and type-asserted arguments, `request.nextUrl` and `.clone()`, aliased and namespace imports, element access, parenthesised receivers, destructured methods, const-aliased receivers, and extracted methods — each added after a review probe defeated the previous version.

**The residual.** A value that reaches the call through a helper's return, a class field, a re-export, or dynamic dispatch is not resolved. Five review rounds on this one guard is the evidence for why it stops here: any expression can produce a function, so no syntactic matcher is complete, and the AGENTS.md three-round cap says to bound the claim rather than keep patching. The module header lists what is covered and what is not, so a green run means "no known spelling is present", not "the class is impossible".

**Fix (when prioritized):** make it type-aware — resolve the callee through the TypeScript type checker rather than syntactically, which would cover every alias and indirection in one construction, or move the ban to an ESLint rule with `no-restricted-properties` plus a type-aware companion. Either is a real piece of work, not a patch. **Trigger:** a host-flip regression that the current guard misses, or the next time someone extends the guard for a new spelling — at that point the type-aware version is cheaper than another round.

## BL-CI-GITHUB-ENV-CROSS-STEP-STATE — RESOLVED (2026-08-01, `test/ci-cross-step-env-guard`)

**Resolution:** both guard layers now model job-scoped cross-step env state. Census: `RunBlock` gained `poisoned`; `runBlocksOf` walks each job's steps in order with one recursive walker — comment-stripped `GITHUB_ENV`/`GITHUB_PATH` mention poisons every later same-job block; local composite actions splice at the use site (poison flows both directions, nesting recurses with a PATH-scoped cycle guard); unknown, non-composite (javascript/docker), and cyclic `./` refs poison fail-closed; poisoned classifying blocks route registry-or-loud (`environment poisoned by an earlier same-job GITHUB_ENV/GITHUB_PATH write`). Scanner: per-job `envPoisoned` threaded across ALL step chunks with a new rejection reason (`earlier same-job step writes GITHUB_ENV/GITHUB_PATH`) placed after the unmodelled-override gate and after the shape gates that decide whether the file or job can run at all, plus a recursive `localActionPoisons` resolver (quote-stripped refs, composite-only, cycle fail-closed) fed by a `localActions` manifest map. Mutation-family closure F1–F8 pinned by fixtures in both self-suites; R1 adversarial review contributed F7 (non-composite opaque actions) and F8 (nested composite recursion) via live escaping mutants, corrected the GITHUB_PATH write semantics in every example, and split static `env:` injection out as `BL-CI-STATIC-ENV-INJECTION` (a fail-open residual at the time; CLOSED since by `test/ci-static-env-injection` and graduated to this archive — do not re-file it against the active queue). Spec: docs/superpowers/specs/ci/2026-08-01-ci-cross-step-env-guard-design.md (§7 = review record). Original entry below.

## BL-CI-GITHUB-ENV-CROSS-STEP-STATE — an earlier step's GITHUB_ENV/GITHUB_PATH write can neuter a later step's playwright invocation, and neither guard layer sees it

**Filed:** 2026-07-31 (R12 adversarial review of `feat/ci-dark-descoped-guards`, class-sweep spillover). **Class:** CI guard soundness. **Effort:** M.

R12 closed the WITHIN-run-block shell-state class in both guard layers (the invocation census's `controlFlowRe`/`cmdPos` in `tests/ci/_metaSpecRegistration.test.ts`, and the workflow-coverage scanner's `UNMODELLED_SHELL_RE` in `tests/ci/_workflowCoverageScan.ts`): assignments, assignment builtins, source/dot, cd/pushd/popd, builtin/command wrappers are now registry-or-loud / refuse-to-cover. The CROSS-STEP variant remains open: a step that runs `echo "PATH=/fake:$PATH" >> "$GITHUB_PATH"` (or writes PATH via `$GITHUB_ENV`) mutates the environment of every LATER step in the same job, so a textually-clean `pnpm exec playwright test …` step downstream runs a fake pnpm that exits 0 — green step, no tests. The census processes run blocks as a flat text list with no job grouping, and the scanner qualifies each step independently, so neither models cross-step state. Partial existing mitigations: `standalone-e2e.yml` liveness is owned by the §4 run-report comparator (a fake pnpm writes no report, so the comparison step reds); the `PLAYWRIGHT_` raw-text sweep covers that env-var family; **zero live workflows write GITHUB_ENV/GITHUB_PATH today** (measured 2026-07-31), so this is a forward-looking hole, not a live one.

**Work:** teach both layers job-scoped grouping — census: refuse-to-auto-classify any run block whose SIBLING (same-job, earlier) blocks write `GITHUB_ENV`/`GITHUB_PATH`; scanner: reject a step's claims when any earlier same-job step matches the same write pattern. Composite-action steps inherit the same job env and need the same grouping.

## BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION — ✅ RESOLVED (2026-08-01, `test/pg-cron-mechanism-sabotage-probe`)

**Resolution:** the remaining sound direction from the entry — a probe that sabotages the query-count mechanism and asserts the guard notices — shipped as two execute-the-suite probes in `tests/cross-cutting/pgCronCiVacuity.test.ts`: an injected inert live case must red the mutant suite BY NAME (per-case attribution wired), and with the observe argument stripped it must red via the aggregate afterAll message (backstop present). Mutation-family closure measured live: MF-1 whole-mechanism deletion (the `1c1ae148e` state), MF-2 observe-arg drop, and MF-4 aggregate-branch deletion all escaped every prior guard and are now each caught; MF-3 increment-drop was already caught by the existing reachable-DB probe. The meaningfulness proxy stays fenced OFF (a `psql("SELECT 1")` body still passes — reviewer territory by four-round ratification). Spec: `docs/superpowers/specs/ci/2026-08-01-pg-cron-mechanism-sabotage-probe-design.md`. Original entry below.

### BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION — the vacuity guard counts queries in aggregate, not per case

**Status:** OPEN · **Severity:** LOW (guard completeness; no live defect) · **Class:** CI coverage integrity · **Filed:** 2026-07-26 (PR3 of the CI-dark cluster, adversarial R4)

**Do not re-derive this analysis.** Four adversarial rounds converged here; measurements below.

`tests/cross-cutting/pg-cron-coverage.test.ts` refuses a CI run where fewer live queries were issued than live cases ran. That closes the MEASURED defect — the suite previously reported exit 0 with "2 passed | 6 skipped", asserting nothing — and it catches an emptied case body (verified: emptying one body while keeping its name yields "6 live cases ran but only 5 database queries were issued").

**Per-case attribution SHIPPED in the same round.** The counter is snapshotted around each case, and a case issuing no query throws by name. Verified against R4's exact reproduction — six queries in one case with the next one empty now reds, naming the empty case — so the first of its two reproductions is closed.

**The gap that remains:** replacing every body with `psql("SELECT 1")` satisfies attribution while asserting nothing about pg_cron.

**Why THAT is not patched:** each round defeated the next proxy — source patterns (rewrite the predicate), case names (keep names, empty bodies), aggregate queries (front-load one case). Proving assertions are _meaningful_ is equivalent to reviewing them, which is a reviewer's job, not a meta-guard's. A fifth proxy would be the same shape.

**Also open (same round):** the executable vacuity guard does not protect the query-count mechanism itself — deleting `queryCount` and its `afterAll` branch leaves all three probe cases green. Exactly demonstrated by commit `1c1ae148e`, which had the executable guard without query counting and was green.

**If picked up:** the remaining sound direction is a probe that sabotages the mechanism and asserts the guard notices — the per-case attribution half is done, and its delta enforcement is covered behaviourally by `tests/cross-cutting/liveCaseCounter.test.ts`.

## BL-LEDGER-GUARD-MDAST-REWRITE — RESOLVED (2026-08-01, `test/ledger-guard-mdast-rewrite`)

**Resolution:** the tripwire now parses each ledger with remark + remark-gfm and evaluates the terminal-word + veto semantics on the mdast — `tests/docs/_ledgerMdast.ts` (provenance-mapped id extraction, id-heading-to-id-heading partition, disposition-table flatten, seven lanes behind one `entryTerminal` evaluator). The full r15–r40 plant corpus rides the walker verdict-preserving; the owner-split r22–r41 containment hardening (`tests/components/admin/sheetIconLinkContainment.test.ts`) was restored from snapshot `a1cfce98d` with a two-row PR-#640 reconcile and its sheet-icon spec §7.10 paragraph in lockstep; the three r41 open findings were re-derived by probe (both ledger classes REPRODUCED and fixed — reordered field rows now caught, hyphenated-id false positives closed by line-global token maximality; the census-expression-shapes probe found no escaping variant). Spec: docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md (eleven adversarial rounds, r11 APPROVE). Original entry below.

## BL-LEDGER-GUARD-MDAST-REWRITE — port the graduation tripwire from regexes onto the remark/mdast AST

**Filed:** 2026-07-31 (branch `feat/sheet-icon-link-affordance-class`, whole-diff rounds 22-30). **Class:** test infrastructure. **Effort:** M.

`tests/docs/_metaDeferralLedgerGraduation.test.ts` detects terminal-status claims in ledger prose with line-anchored regexes. Nine adversarial-review rounds (r22-r30) surfaced an open-ended stream of CommonMark surface spellings the regex lanes miss (container prefixes, task-list checkboxes, `__` bold twins, italic/mixed-emphasis labels, indented headings) — and the two regex countermeasures that tried to model code contexts (fence blanking, inline-code stripping) shipped their own CommonMark-semantics defects and were removed in r30. The guard's header now ratifies two boundaries: render-equivalent obfuscation is review's failure class, and regex reimplementation of markdown grammar is out of scope.

**Charter extended (2026-07-31 split):** the r22–r41 hardening rounds (container prefixes, task-list checkboxes, `__`/comment normalization, italic/mixed labels, dash separators, bare/anywhere field lanes, preposition chains — plus the containment extension/symlink/URL/icon-anchor censuses) live on `test/guard-hardening-followup` (snapshot `a1cfce98d`, r41 WIP patch in the branch note) and ship through THIS item's review, not the feature PR's. The r41 open findings (census expression shapes; later same-line fields; hyphenated-id false positives) are the follow-up's starting worklist.

**Work:** parse each ledger with remark + remark-gfm (already dependencies), walk the mdast — headings, paragraph/text/strong/emphasis nodes — and evaluate the existing terminal-word + veto semantics on node text. Code blocks, inline code, HTML comments, links, and tables then fall out of the tree for free, closing the entire spelling class the regex lanes can only chase. Keep the current plants; they become fixtures for the AST walker. Until this lands, grammar-completeness findings against the regex lanes re-litigate the r28/r30 ratification.

## BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED — ✅ RESOLVED (2026-07-26, PR4 of the CI-dark cluster)

**Graduated:** 2026-07-27 (reconciliation) — resolved by `feat/ci-lifecycle-gallery` (PR #615, PR4 of the CI-dark cluster); the entry had been annotated RESOLVED in place. Filed 2026-07-24 under the "Admin lifecycle e2e" section (share-link-chrome-backlog review r4).

**Resolved.** The assertion on `admin-share-link-inactive` is deleted. Verified before deleting: neither the testid nor its copy exists under `components/`, `app/`, or `lib/`, and `git log -S` attributes the removal to `d7fa48b9a feat(admin): replace the Overview share cluster with the status-band hub (T4)` — a ratified redesign, not a rename.

The proposed fix below (**"replace the assertion with whatever now carries the crew-link-off copy"**) was investigated and **rejected on evidence**: nothing carries it. The nearest surviving string is a rotation confirmation in a different control, and `admin-current-share-link-unavailable` is an _error_ state gated on `published`. Everything below this line is the ORIGINAL entry, kept as provenance — its "It does not run" and "Fix:" paragraphs describe the pre-2026-07-26 state, not the current one.

**Note on the host spec:** `admin-lifecycle-transitions.spec.ts` was wired into `lifecycle-layout-e2e.yml` on `pull_request` on 2026-07-27 after reaching five consecutive greens — see `BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE` below. The file is no longer CI-dark. (Original note said "still NOT wired"; superseded.)

`tests/e2e/admin-lifecycle-transitions.spec.ts:305` asserts `admin-share-link-inactive` contains "The crew link is inactive while this show is unpublished." That testid was RETIRED by the share-hub consolidation (`docs/superpowers/specs/2026-07-20-share-hub-design.md:106` lists it under Removed); no production module emits it, and current unit tests assert its absence. The spec would fail if it ran.

It does not run: no workflow references `admin-lifecycle-transitions`, so it is CI-dark. Confirmed pre-existing — the identical assertion is on `origin/main`, and the share-link-chrome-backlog branch does not touch the file.

**Fix:** replace the assertion with whatever now carries the crew-link-off copy (the hub's paused primary label, per `shareHub.test.tsx`), then decide whether the spec should be in a workflow at all — a permanently dark e2e is the reason this survived.

**Surfaced by:** round-4 adversarial review of #598, which found it while checking that branch's retirement of the testid. Recorded rather than fixed there: out of scope for that PR, and it cannot be validated without first un-darkening it.

## BL-HEADER-PROBE-RESIDUAL-VACUITY — CLOSED 2026-07-26 (branch `test/header-probe-residual-closure`)

**Graduated:** 2026-07-27 (reconciliation) — closed by `test/header-probe-residual-closure` (PR #617); the entry had been annotated CLOSED in place. The one live follow-up (promote the `section-header-visual` context into branch protection's required set after observed-green soak) is carried by `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` in BACKLOG.md.

**Filed:** 2026-07-26 (branch `feat/section-header-rebuild-phantom-spacers`, adversarial review round 3). **Class:** test hardening. **Closed:** 2026-07-26, all four findings, by changing the instrument rather than adding a fifth heuristic — exactly the disposition the original entry recommended. Spec: `docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md` (Codex APPROVE R3 + plan APPROVE R4, 19 accepted findings across both artifacts).

**How each finding closed:**

1. **Width chain anchors all five widths.** `REAL_ROUTE_WIDTHS` now equals the `ROW_WIDTHS` key set (320/430 measured 280px/390px on the real hydrated modal, confirming the viewport-minus-40 derivation), and `tests/cross-cutting/section-header-width-anchors.test.ts` pins the set equality so a sixth matrix width cannot enter unanchored.
2. **Interaction states are pixel-baselined.** `tests/e2e/section-header-visual.spec.ts` captures hover, keyboard focus (`:focus-visible`), held-press active, and hover+focus at all five widths in both themes (40 state baselines), each behind an exclusive pseudo-state oracle and fresh-navigation isolation.
3. **SMIL is closed structurally.** The visual spec's DOM contract asserts zero SMIL elements in the tree (a screenshot alone is temporally escapable); a future `<animateTransform>` fails by default and forces deliberate handling.
4. **Exotic paint suppression is subsumed by pixels.** 10 idle composite baselines (5 widths × 2 themes over all 15 matrix cells) compared at `maxDiffPixels: 0` AND `threshold: 0` — no property enumeration; any mechanism that suppresses or moves paint produces differing bytes.

**Mechanism:** committed PNG baselines captured ONLY inside pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` on native amd64 (`.github/workflows/section-header-visual.yml`, unfiltered PR gate; `section-header-visual-regen.yml`, post-merge dispatch regen with in-job re-comparison). Initial baselines were the gate's own failure-artifact actuals; `tests/cross-cutting/playwright-version-pin.test.ts` is now a four-workflow registry pinning image tags to the INSTALLED `@playwright/test` exactly.

**Follow-up (deliberate, small):** the `section-header-visual` context is NOT yet in branch protection's required set — promote after observed-green soak, per spec §1.1.

**What IS covered, cumulatively:** 108 standalone layout cases (88 section-header, incl. the sm+ inline-row suite, + 20 pusher) and 10 real-route width-chain cases (all five widths × 2 loops), green in CI; 18 mutations mapped to distinct catchers; the transition sweep both themes × five widths × three states with per-channel duration AND delay; pusher absence at three widths with a pixel-level paint test; chain coverage anchored on the canonical `SectionId` list; and the 50-baseline visual gate above.

## BL-AGENDA-FOLD-NO-SEEDED-E2E — the fold is never exercised through the real crew page

**Status:** GRADUATED — test/agenda-fold-seeded-e2e, 2026-08-02 · **Severity:** low · **Class:** TEST COVERAGE

**Resolution:** `test/agenda-fold-seeded-e2e` (2026-08-02) seeds the fold end to end. `seedShowWithCrew` gained an `agendaLinks` option writing `agenda_links` with a parseable `extracted` payload, and `tests/e2e/stage-restricted-crew-schedule.spec.ts` now drives the REAL crew page as two complementary date-restricted viewers (each sees their own agenda day open and marked, the other folded) plus an unrestricted admin control that sees both days open with no markers — so `effectiveViewerDateRestriction` → `aggregateDays` → `visibleShowDays` → the matcher → the rendered fold is verified as one composition rather than in pieces. The spec is wired into `crew-e2e.yml` under desktop-chromium (moved off mobile-safari when the first CI run measured every non-admin viewer dark there — Linux WebKit will not store the Secure `__Host-` picker cookie over plain http) behind a run-command wiring guard in `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (token-exact, executing-position, segment-scoped), and its coverage-registry row moved from `UNSEEN` to `PATH_GATED_BY_EXCLUSION`. Spec: docs/superpowers/specs/schedule/2026-08-02-agenda-fold-seeded-e2e-webkit-design.md; plan: docs/superpowers/plans/schedule/2026-08-02-agenda-fold-seeded-e2e-webkit.md. `BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` covers the admin half and SHIPPED separately on 2026-08-02 (mainline, see its own archive entry); this branch is strictly the crew-page half and touches no admin surface. Original entry below.

Coverage for the per-viewer day fold is: matcher unit tests, component tests in jsdom, two
self-hosted browser specs, and a jsdom **mock** of the `ScheduleSection` seam. Nothing renders the
fold through the real crew page. Confirmed by grep: only `agendaScheduleLayout.spec.ts` and
`agendaBreakdown.layout.spec.ts` reference `agenda-day-*`/`agenda-schedule`, and both boot their own
`node:http` server rather than the app.

**What that leaves unproven.** The seam test asserts `AgendaScheduleBlock` receives the right
`viewerDays` per link by mocking the component. It cannot show that a real date-restricted crew
member, loading a real share link, sees their day expanded — the composition of
`effectiveViewerDateRestriction` → `aggregateDays` → `visibleShowDays` → the matcher → the rendered
fold is only ever verified in pieces.

**Why not closed in #610.** It needs a seeded show whose `agenda_links` carry an `extracted`
extraction with parseable day labels, plus a date-restricted crew member and a share link.
`supabase/seed.ts:228` writes `parsed.show.agenda_links` straight from the fixture, so this is
fixture and seed work, not a harness gap — a meaningful blast radius to take on at review round 9 of
one PR.

**Fix (when prioritized):** extend an existing crew e2e fixture with agenda links, then assert the
viewer's row is `open` and marked while another day is folded. Related:
`BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` wants the same thing on the admin side, and
`BL-AGENDA-A11Y-WEBKIT-COVERAGE` would ride along.

## BL-AGENDA-A11Y-WEBKIT-COVERAGE — the fold's accessibility proof runs Chromium only

**Status:** GRADUATED — test/agenda-fold-seeded-e2e, 2026-08-02 · **Severity:** very low · **Class:** TEST COVERAGE

**Resolution:** `test/agenda-fold-seeded-e2e` (2026-08-02) adds a `standalone-webkit-a11y` project to `tests/e2e/standalone.config.ts` (Desktop Safari) scoped by `testMatch` to `agendaScheduleLayout.spec.ts` and an UNANCHORED `grep: /a11y:/` — Playwright matches grep against the joined "<project> <file> <title>" string, so an anchored `/^a11y:/` would select zero tests. It resolves exactly ONE test, structurally pinned by `tests/ci/standalone-webkit-a11y-wiring.test.ts` against `--list --reporter=json` (zero = the joined-title trap; more = the dimensional suite leaking onto WebKit), which also asserts `standalone-e2e.yml` installs webkit in executing position. The standalone baseline is regenerated with the one added identity; the dimensional tests stay chromium-only by design, so the feared second full 439-spec run does not happen. Original entry below.

`tests/e2e/standalone.config.ts` defines a single `standalone-chromium` project, so the fold's
accessibility assertions never run against WebKit even though Safari is an explicit crew target. That
matters here more than usual: the `<summary>` carries an `<h3>` beside sibling spans and an SVG, which
is outside HTML's strict content model, so "the browser still exposes both semantics" is an empirical
claim per engine.

**Measured once, by hand, during #610:** a temporary `probe-webkit` project (`devices["Desktop Safari"]`)
ran the a11y test green in 5.0s, then the config was reverted. So WebKit does expose it today — but a
hand-run measurement is not coverage, and by this repo's own dark-spec lesson it will rot.

**Not shipped in #610** because adding a WebKit project to that config runs all 439 standalone specs a
second time and would surface unrelated engine differences mid-review.

**Fix (when prioritized):** either a WebKit project scoped to the a11y-bearing specs, or a
`--project` matrix leg in `standalone-e2e.yml`.

## BL-AGENDA-PERDAY-VIEWER-FILTER — Schedule agenda area is whole-show / not day-filtered for restricted crew

**Graduated:** 2026-07-27 (reconciliation) — shipped by `feat/agenda-perday-viewer-fold` (PR #610, 2026-07-26); the entry had been annotated SHIPPED in place and retained "for the decision record", which this archive is the home for. Originally a `###` sub-entry of the BL-NULLCODE-STAMP-BATCH-2 residuals section.

**Status:** ✅ SHIPPED in PR #610 (2026-07-26) · **Severity:** low · **Class:** VISIBILITY SCOPE

> **Retained for the decision record; the prescriptions below are HISTORY, not open work.** Two
> statements in this entry are now contradicted by shipped code and are corrected here rather than
> edited away, because the reasoning is what makes the entry worth keeping:
>
> 1. **"No reusable day-set matcher exists"** — one does now: `lib/crew/agendaViewerDays.ts`
>    (`visibleAgendaDaysForViewer`). It returns ROW INDICES, not dates, because the current
>    extractor always writes `date: null` (`lib/agenda/extractAgendaSchedule.ts` is its sole
>    constructor; stored rows from older writers may carry strings — see the spec's §2.5
>    narrowed scope), so dates cannot identify a row.
> 2. **"reusing … the same positional-fallback rule"** — the shipped matcher deliberately does NOT
>    implement the positional fallback. Ratified at
>    `docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` §3 ("RATIFIED AMENDMENT"),
>    tracked as `BL-AGENDA-POSITIONAL-DAYSET-FALLBACK`. Short version: its trigger never fires on the
>    measured corpus, and folding on positional index means folding in the state of least knowledge —
>    the shape behind all four viewer-day-folding bugs review found.
>
> Everything else — the middle posture, the "Your day" marker, native `<details>` keeping the block a
> Server Component, and mandatory fail-open — shipped as written.

The Schedule section's Agenda area (`components/crew/sections/ScheduleSection.tsx:143-163`) renders `AgendaEmbed` + per-link `AgendaScheduleBlock` from `link.extracted` as a **whole-show** artifact: `AgendaScheduleBlock` receives no date/stage restriction and shows the full-show agenda to **every** viewer (the only branch that suppresses it is the `unknown_asterisk` early-return, `:168-179`). So date-restricted AND (post-#248) stage-restricted crew see the full-show agenda above their filtered day cards. This is pre-existing behavior, not introduced by #248 (spec §3.5).

**Not a privacy issue — a scan-cost issue.** The `AgendaEmbed` "View agenda" affordance sits directly above the structured block and opens the unfilterable whole-show PDF, so no filtering of the structured rows can withhold a date that the viewer could not reach in one tap. The question is purely how much a part-time crew member has to scan to find their own day.

**Decision (2026-07-24, Eric):** viewer's day expanded and marked, other days folded — the middle posture, not whole-show and not trimmed-to-worked-days. Concretely:

- The day matching the viewer's effective visible-day set renders in full, carrying a "Your day" marker.
- Every other agenda day collapses to a single tappable row (day label + session count) that expands in place. Native `<details>`/`<summary>` — `AgendaScheduleBlock` is a Server Component (no `'use client'`), and this posture must not force it client-side.
- **Fail-open is mandatory.** Day-to-date matching is best-effort, and it is split across two functions in `lib/crew/agendaDayForToday.ts`: `parseIsoFromDayLabel` (`:36-43`) ONLY parses a date-bearing heading into an ISO date — it has no fallback. The positional fallback lives inside `agendaSessionsForToday` (`:64-73`) and fires only when no label in that extraction parsed AND `ext.days.length === showDays.length`, matching a single `todayIso`. When neither path resolves a day for this viewer, render every day expanded (today's behavior) — a failed match must never cost the viewer the agenda, and must never fold the day they actually work.
- Rejected: trimming the list to worked days only (loses on-page visibility of load-in/strike days that a strike-only crew member legitimately uses), and keeping whole-show unchanged (leaves the scan cost that prompted the item).

**Fix:** thread the effective visible-day set into `AgendaScheduleBlock`. Note that **no reusable day-set matcher exists** — `agendaSessionsForToday` maps to ONE `todayIso` and returns sessions, not days — so PR3 writes a day-set variant beside it, reusing `parseIsoFromDayLabel` and the same positional-fallback rule rather than duplicating either. Needs the invariant-8 impeccable dual-gate, a Dimensional-Invariants pass, and a real-browser layout assertion (the fold changes the block's height contract). Mockup of the three postures considered, at phone width in both themes: `docs/superpowers/specs/2026-07-24-agenda-visibility-mock/agenda-visibility-options.html`.

## Drive-ID coverage guard — deliberately-undone parts (2026-07-25) — ✅ RESOLVED (2026-07-27)

All four closed by `feat/driveid-guard-cluster` per
`docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md`: the
system_identifier pin + per-connection DO guard (target binding), the auditor-on-validation
layer (definition match), the dual-source census cross-check (self-check), and the
registry-enforced behavioral probes (23/23 columns).

Filed per the owner's scope decision during `fix/secondary-drive-id-nonblank`. The guard shipped in
its minimal form — one live census query, a pure auditor, an empty exemption list, running in
`unit-suite-db` (a worker of the required `unit-suite` aggregator). Four mechanisms were deliberately
NOT built, each after adversarial review showed the attempted version was defeatable. Spec §10 and
§11: `docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md`.

**Read the provenance before picking any of these up.** Seven spec rounds and three plan rounds
(55 findings) are the analysis behind them; the reason each is open is that the obvious fix was tried
and shown not to work, not that nobody thought about it.

### BL-DRIVEID-CENSUS-QUERY-SELF-CHECK — detect a census-query regression that silently narrows the audited set

**Status:** RESOLVED 2026-07-27 (`feat/driveid-guard-cluster`) · **Severity:** medium · **Class:** GUARD COMPLETENESS

If `lib/driveIdCoverage/introspect.ts`'s census query stops returning a column — a narrowed name
predicate, a changed schema list, an added filter — that column is absent from both the census and the
audit, and the suite is green. Four mechanisms were tried and each defeated: a required-tuple set and a
`>= 23` count floor (both pass at exactly today's size once the census legitimately grows), a committed
census artifact with a shape contract (a truncated artifact satisfied it), and a broad-predicate
`broadCount` cross-check (vacuous — every `drive_file_id` match also matches `drive`, so narrowing the
primary predicate left both assertions true).

**Fix (when prioritized):** a genuinely independent source of truth — derive the column set a second
way (`pg_attribute` rather than `information_schema`) and require the two to agree — or a mutation test
that narrows the query and asserts the suite goes red. Today's control is code review of ~15 lines.

### BL-VALIDATION-PARITY-DEFINITION-MATCH — validation parity still matches on bare constraint NAMES

**Status:** RESOLVED 2026-07-27 (`feat/driveid-guard-cluster`) · **Severity:** medium · **Class:** GUARD SOUNDNESS

`tests/db/validation-schema-parity.test.ts:256-284` asserts validation contains each expected
`conname`. Constraint names are unique per TABLE, not per schema (measured), so a same-named constraint
on a different public table satisfies it — as does one with the right name and a weakened definition
such as `CHECK (true)`. The 2026-07-25 change extended that test's parse and count but deliberately did
not re-architect it.

**Fix (when prioritized):** compare `(schema, table, column)` tuples plus `pg_get_constraintdef`
against the canonical templates in `lib/driveIdCoverage/audit.ts`, exactly as the local guard does.

### BL-VALIDATION-TARGET-BINDING — `validation-schema-parity` and `pg-cron-validation-parity` cannot prove which database they connected to

**Status:** RESOLVED 2026-07-27 (`feat/driveid-guard-cluster`) · **Severity:** medium · **Class:** GUARD SOUNDNESS · **Pre-existing**

A libpq URI's authority is not its effective target: `?host=` / `hostaddr=` query parameters and
duplicate keyword-form fields override it. A `TEST_DATABASE_URL` displaying the validation project's
pooler authority can therefore connect to a loopback or any other database and pass every
authority-based check. Affects the whole job, predates the 2026-07-25 change.

**Fix (when prioritized):** interrogate the CONNECTED server for an identity fact rather than parsing
the DSN string. Note an authority-parsing check (`postgres.<ref>` username + `*.pooler.supabase.com`
host) was drafted and rejected during review as theatre against precisely this bypass —
`scripts/lib/validation-target.ts`'s helpers do not fit either, since they validate an HTTPS Supabase
API URL, not a Postgres DSN.

### BL-DRIVEID-BEHAVIORAL-COVERAGE — 16 of 23 constrained Drive-ID columns have no execution probe

**Status:** RESOLVED 2026-07-27 (`feat/driveid-guard-cluster`) · **Severity:** low · **Class:** TEST COVERAGE

`tests/db/driveFileIdNonblank.db.test.ts` behaviorally probes 7 of the 23 constrained columns
(3 pre-existing + the 4 added 2026-07-25); the rest are covered by declaration only — the live guard
proves a canonical CHECK is DECLARED, not that it BEHAVES. Mechanical, bounded, unglamorous: each
addition needs an insert shape satisfying that table's NOT NULL siblings and composite keys.

---

## Secondary-name Drive-ID columns — deferred from the drive_file_id nonblank CHECK (2026-07-02) — ✅ RESOLVED (2026-07-25)

**Resolved by** `supabase/migrations/20260725000000_secondary_drive_id_nonblank.sql`, spec
`docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md`, plan
`docs/superpowers/plans/2026-07-25-secondary-drive-id-nonblank/00-overview.md`.

The empty/whitespace `drive_file_id` DB-CHECK work (migration `20260702120200_drive_file_id_nonblank.sql`) deliberately scoped itself to **every column named exactly `drive_file_id`** (14 public + 5 dev mirror). The two columns below are Drive-ID-bearing but carry a _secondary_ name and were not reachable-empty, so they were documented out of scope rather than silently dropped.

### BL-OPENING-REEL-DRIVE-ID-NONBLANK — nonblank CHECK on `shows.opening_reel_drive_file_id`

**Status:** ✅ RESOLVED (2026-07-25) · **Severity:** low (not reachable-empty) · **Class:** DEFENSE-IN-DEPTH

Shipped as `shows_opening_reel_drive_file_id_nonblank` on both `public.shows` and `dev.shows` — the dev clone carries the column (`supabase/migrations/20260502000000_dev_schema_clone.sql:58`), so a public-only migration would have left it asymmetric. Nullable form: `check (opening_reel_drive_file_id is null or opening_reel_drive_file_id ~ '[^[:space:]]')`. Behavioral probes in `tests/db/driveFileIdNonblank.db.test.ts`.

### BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK — nonblank CHECK on `wizard_finalize_checkpoints.last_processed_drive_file_id`

**Status:** ✅ RESOLVED (2026-07-25) · **Severity:** low · **Class:** DEFENSE-IN-DEPTH

Shipped as `wizard_finalize_checkpoints_drive_file_id_nonblank`. Two corrections to the original entry, both surfaced by adversarial review:

- The entry called this "a cursor copy of an already-CHECK'd id." **There is no write path at all** — every non-DDL reference in `app/` and `lib/` is a read or a type (`app/admin/_finalizeCheckpoint.ts:64`, `:77`, `:24`; `lib/audit/noGlobalCursor.ts:39`, `:45`). Nothing writes the column, which makes the CHECK purely forward-looking protection.
- The constraint name is squeezed from **both** ends. The conventional `<table>_<column>_nonblank` form is 65 bytes, past Postgres's 63-byte identifier limit, so it would be silently truncated; and it must KEEP the `_drive_file_id_nonblank` suffix, because `tests/db/validation-schema-parity.test.ts:261-263` filters the live constraint list on exactly that suffix — a name without it would sit in `expected`, never appear in `live`, and leave that gate permanently RED. Dropping the column-name prefix satisfies both at 50 bytes.

### Also closed here: a third column that was never filed

`public.onboarding_rebuild_attempts.drive_file_id` is named **exactly** `drive_file_id` and was therefore always INSIDE the original 2026-07-02 scope rule. It was created 16 days later (`supabase/migrations/20260718000000_onboarding_rebuild_attempts.sql:6`) and never picked up a CHECK — found by the pre-draft census, not by any backlog entry. It is half of a composite primary key, which provides no protection: a blank is a legal distinct key value. Shipped as `onboarding_rebuild_attempts_drive_file_id_nonblank`.

That 16-day silent gap is why this work also landed an executable guard (`lib/driveIdCoverage/`, `tests/db/driveIdCoverage.db.test.ts`) that fails `unit-suite-db` — a worker of the required `unit-suite` aggregator — when a Drive-ID-bearing column lands uncovered. Its deliberately-undone parts are filed in `BACKLOG.md` as `BL-DRIVEID-CENSUS-QUERY-SELF-CHECK`, `BL-VALIDATION-PARITY-DEFINITION-MATCH`, `BL-VALIDATION-TARGET-BINDING`, and `BL-DRIVEID-BEHAVIORAL-COVERAGE`.

---

## BL-PHANTOM-GAP-PROBE-OTHER-SURFACES — run the zero-extent-flex-item probe on the crew page and dashboard harnesses

**Filed:** 2026-07-24 (branch `fix/overview-phantom-gap`). **Class:** layout hardening. **Effort:** S per harness.

`T-NOPHANTOM` (tests/e2e/published-review-modal.layout.spec.ts) walks the rendered tree for in-flow items with zero extent on their parent's gap axis — an always-rendered wrapper whose entire content is state-gated is invisible but still charges its parent's `gap`. It found two instances on its first run: the reported Overview `overview-sheet-sync` slot (32px) and `ScheduleDayRow`'s time grid (4px per entry-less day). Both are now fixed with `empty:hidden`.

The probe is scoped to the PUBLISHED MODAL tree only, so the crew page, the admin dashboard, and the wizard's own surfaces are unmeasured. A static sweep of `components/` + `app/` for the conditional-only-wrapper shape found no further true positives, but it cannot see the `{items.map(...)}` form — an empty array leaves no textual trace, and that is exactly the form the ScheduleDayRow instance took. So static coverage is not a substitute.

**Work:** extract the probe into a shared helper and mount it in the existing standalone crew-page and dashboard layout harnesses. Expect false positives to need the same `checkVisibility()` treatment per surface (on the modal, the `lg:hidden` chip rail alone produced 25).

**Status:** ✅ SHIPPED — `test/phantom-gap-probe-real-pages` (2026-07-25, PR #581). The walk lives in `tests/e2e/helpers/phantomGap.ts` (`scanForPhantomGaps` + `reconcilePhantomLedger`) and is mounted on the REAL routes rather than new harnesses — a fixture chosen to look complete is exactly the one that cannot catch an emptied-out wrapper. Mounts: `T-NOPHANTOM-DASH` on `/admin` (390 / 1280), `T-NOPHANTOM-SHOW` on the HYDRATED show modal at `/admin?show=<slug>` (375 / 1280 — the static harness never hydrates, which its own header names as its blind spot), and `T-NOPHANTOM-CREW` on all six crew sections (390 / 1000). All wired into `.github/workflows/phantom-gap-e2e.yml`, because both host specs were matched by playwright projects but invoked by no workflow — mounting a probe into a dark spec would have made the probe dark too.

Two defects it paid for immediately: a PROBE defect (grid axes were admitted on item count; grid gaps sit between TRACKS, and track count is independent of item count in both directions — `shows-table-header`, 7 items across 7 tracks in one row, was reported as an offender it is not), and a real layout instance on the hydrated modal that no static fixture crowds enough to reveal, carried forward as `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`.

Not covered, deliberately: the wizard's own pre-publish surfaces, `BellPanel`, and the admin nav — no probe mount reaches them yet. Adding one is the same recipe (scan root + named non-vacuity anchor + a workflow step).

---

## BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET — probe the archived dashboard bucket

**Filed:** 2026-07-25 (branch `test/phantom-gap-probe-real-pages`, adversarial review R3 finding 1). **Class:** layout hardening (coverage). **Effort:** S (seed + one case).

`T-NOPHANTOM-DASH` measured `/admin` in its ACTIVE bucket only. `/admin?bucket=archived` renders a structurally different tree — `ArchivedShowRow` (`components/admin/ArchivedShowRow.tsx`) instead of `ShowsTable` rows — so a zero-extent child introduced there triggered the `phantom-gap-e2e` workflow via `components/**` while both dashboard cases stayed green.

Not simply added as a third case at filing time: `pnpm db:seed` (what the workflow runs) seeds **no archived shows** — the archived fixture lives in the separate `supabase/seedWalkerFixtures.ts` extension seed — so a probe there would have measured an empty bucket, anchored on nothing, and been exactly the vacuous green the anchors exist to prevent.

**Graduated:** 2026-07-25 on `feat/section-header-rebuild-phantom-spacers` — spec `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md`, task T6.

**Shipped as:** a `T-NOPHANTOM-DASH [archived]` case at both widths (390 / 1280) in `tests/e2e/admin-layout-dimensions.spec.ts`, anchored on an `archived-show-row-<slug>` container rather than a count, so an empty bucket fails loudly instead of passing vacuously. The seed gap was closed in the workflow rather than in `seed.ts`: `.github/workflows/phantom-gap-e2e.yml` gained a step that runs the walker-fixture seed alongside `db:seed`, which is the narrower change — `seed.ts` is the shared base corpus and archived shows are fixture-specific.

## BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW — `empty:hidden` the TravelRow eyebrow

**Filed:** 2026-07-25 (branch `test/phantom-gap-probe-real-pages`, found by `T-NOPHANTOM-CREW`). **Class:** layout hardening. **Effort:** XS (one class), plus the invariant-8 impeccable dual gate.

`TravelRow` rendered its eyebrow `<p>` unconditionally inside a `flex flex-col gap-0.5` stack (`components/crew/sections/TravelSection.tsx`). A ground leg whose stage was promoted to the primary line passes `label=""` — deliberate, and the comment there calls the blank eyebrow "acceptable per its presentational contract". It was not free: an empty `<p>` is still a flex item, so the stack charged 2px above a line that painted nothing. Two legs on the seeded show, at both widths; ledgered in `KNOWN_CREW_PHANTOM_ITEMS` (`tests/e2e/crew-layout-dimensions.spec.ts`).

A class sweep for the same shape (an empty STRING becoming an element's entire rendered content) found no second instance — every other `? "" :` in `components/` is a className fragment or a pluralization suffix inside larger text.

**Graduated:** 2026-07-25 on `feat/section-header-rebuild-phantom-spacers` — spec `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md`, task T5.

**Shipped as:** `empty:hidden` on that `<p>` (the DESIGN.md §7a idiom), with both `KNOWN_CREW_PHANTOM_ITEMS` rows deleted — the ledger is now empty, and its stale-row assertion is what proves the repair rather than a separate test. The `{" "}` caveat the entry flagged is now enforced rather than remembered: `tests/docs/designSevenAEmptyHiddenSites.test.ts` fails if a component carries `empty:hidden` without being named in §7a's "Current sites" list, so the idiom cannot spread undocumented.

## BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW — decide crowded-row behavior for childless `flex-1` spacers

**Filed:** 2026-07-25 (branch `test/phantom-gap-probe-real-pages`, found by `T-NOPHANTOM-SHOW`). **Class:** layout hardening (UI judgment). **Effort:** S per site, plus the invariant-8 impeccable dual gate.

A childless `<span className="flex-1" />` used as a right-pusher is a flex ITEM. In a row with enough real content to consume the line, `flex-1` resolves to ZERO width and the row still charges its `gap` on BOTH sides of an invisible spacer — the same class as the `BulkIgnoreControls` hairline (`BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW`, repaid on #580 by hiding the rule below 480px).

Proven instance, ledgered in `KNOWN_SHOW_MODAL_PHANTOM_ITEMS`: `ModalSectionChrome`'s header row in `components/admin/wizard/step3ReviewSections.tsx`, charging 10px on each side at 375px on the seeded show's Rooms and Warnings breakdowns. Four further sites carried the same shape (the `step3ReviewSections` hairline, `BellPanel`'s action row, `AdminNav`, `OnboardingTopBar`), none measured by any probe mount at filing time.

**Graduated:** 2026-07-25 on `feat/section-header-rebuild-phantom-spacers` — spec `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md`, tasks T1-T4.

**Resolved with three DIFFERENT decisions, not one.** The entry proposed "one visual decision, applied consistently across all five". Measurement refuted that framing: the five sites are three distinct cases, and DESIGN.md §7a now records the distinction.

- **Four pusher sites** (`BellPanel` x2 branches, `AdminNav`, `OnboardingTopBar`) — spacer DELETED, `ml-auto` on the trailing cluster. A pusher has no visual job, so the element should not exist; `ml-auto` is the same layout with no item. `tests/e2e/pusher-alignment.layout.spec.ts` carries two oracles per site, because absence alone cannot see a repair that forgets `ml-auto` and alignment alone cannot see a spacer that came back.
- **The hairline** — a `min-w-4` floor, NOT a width-hide. It paints, so it is not a phantom; it only needed a minimum. Measured: 22.94px at the narrowest real row (240px), collapsing only at viewports ≤215px that no device reaches. `min-w-6` was rejected on measurement — it binds and wraps the label.
- **The header row** — rebuilt rather than patched, since the spacer was a symptom of a header that also wrapped a one-word title onto three lines at 375px. Icon left, centred name + count, sheet link right (now an external-link icon, not the "In sheet" text link), badge centred below. `--spacing-header-link-slot` keeps the centred group optically centred when no link renders.

**Descoped, filed as `BL-CHILDLESS-GROWABLE-STATIC-GUARD`:** a static guard against the shape recurring. Three adversarial rounds could not converge a rule that agreed with a prototype (27 registry rows from the written rule vs 17 from the prototype), which is the 3-round cap in `docs/agents/spec-self-review.md`. The two e2e oracles cover the four repaired sites; the guard would cover unwritten ones.

---

## BL-HOVERHELP-PORTAL — portal the HoverHelp popover so it survives clipping ancestors

**Filed:** 2026-07-20 (show-alert-compact spec, adversarial R2 F7/F8/F10) · **Class:** UI robustness · **Effort:** M (portal + positioning, or an anchor-positioning polyfill, plus containment assertions)

`HoverHelp` positions its popover body absolutely IN FLOW rather than portaling it (components/admin/HoverHelp.tsx:193). Inside a scrolling surface the popover can be visually clipped by an ancestor, and `getBoundingClientRect()` does not reveal it (it reports the unclipped box, so a naive assertion passes). The concrete case: `AttentionBanner` cards sit in an `overflow-y-auto` scroll container (components/admin/review/ShowReviewSurface.tsx:869) nested in an `overflow-clip` panel (components/admin/review/ReviewModalShell.tsx:614), so a popover opened near the bottom of the scroll viewport is cut off until the user scrolls.

Pre-existing for every HoverHelp consumer inside a scrolling admin surface; NOT introduced by show-alert-compact, whose spec explicitly descopes placement policy to the shipped default (amendment A6) rather than inventing an unmeasurable geometry rule. Fixing it means portaling the body to `document.body` with anchored positioning (or adopting CSS anchor positioning with a polyfill), then asserting popover containment against BOTH clipping ancestors in a real-browser test.

**Status:** ✅ RESOLVED — `feat/hoverhelp-smart-position` (2026-07-22; spec `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md`). The shared `HoverHelp` body now portals — into the `ReviewModalShell` panel via `PopoverHostContext` (staying inside the focus trap / aria-modal / inert subtree) or `document.body` elsewhere — with a pure collision-aware positioning core (`lib/popover/position.ts`). The exact AttentionBanner-at-pane-bottom geometry this entry documents is the T4a elementFromPoint kill-shot in `tests/e2e/published-review-modal.interactions.spec.ts`; body-host geometry is covered by `tests/e2e/hoverhelp-geometry.spec.ts` (19 cases). Follow-up carve-out: `BL-HOVERHELP-VISUAL-VIEWPORT` below.

---

## BL-HOVERHELP-VISUAL-VIEWPORT — position HoverHelp against the visual viewport under pinch-zoom

**Graduated:** 2026-07-25. Shipped on `fix/hoverhelp-visual-viewport-tdd` (PR #595).

**Filed:** 2026-07-22 (hoverhelp-smart-position spec §9, deferred by design) · **Class:** UI robustness (mobile pinch-zoom) · **Effort:** S-M (`window.visualViewport` rect + resize/scroll listeners in the shell measure path)

`computePopoverPlacement` bounds body-host popovers by the LAYOUT viewport (`window.innerWidth/innerHeight`). Under pinch-zoom the visual viewport is a smaller, offset window onto the layout viewport, so an open popover can sit partially outside what the zoomed-in user can see. Ratified as out of scope for v1 (spec §1.1): admin surfaces are desktop-first, pinch-zoom on the crew page is transient, and the popover is dismissible/reopenable at the new zoom. Fix shape: use `window.visualViewport` (rect + `resize`/`scroll` events feeding the existing rAF coalescer) as the bounds rect when present.

**Status:** CLOSED — implemented per `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md`. Scope grew during review: `ShareHub` carries the identical placement code and was fixed in the same change; WebKit is explicitly excluded (its coordinate convention is unverifiable in this repo's harness); and the guarantee that zoom can never newly hide a popover is pinned by a property suite rather than a boundary rule.

---

## BL-CREW-WARN-STACK-E2E-GEOMETRY — real-browser width-fill assertion for the crew under-row warning stack

**Filed:** 2026-07-24 (retroactive — deferred in PR #534's body 2026-07-21, never filed) · **Status:** ✅ SHIPPED (2026-07-24, branch `test/crew-warn-stack-width-fill`) · **Class:** test coverage (real-browser layout)

PR #534 descoped its Task 10 (real-browser layout) with: "`CrewUnderRowStack`'s parent is not fixed-dimension, so the rule's trigger doesn't apply; width-fill is unit-asserted. Deferred `BL-CREW-WARN-STACK-E2E-GEOMETRY`." The id was cited in the PR body but no row was ever added to BACKLOG.md, DEFERRED.md, or this archive — found by a PR-body-vs-ledger reconciliation sweep on 2026-07-24.

PR #563 (crew-warning-attachment T5) had already landed real-browser geometry for the surface at `tests/e2e/published-review-modal.layout.spec.ts`: the under-row stack `[data-testid="crew-warn-stack-<key>"]` measured inside the crew panel card's border box on all four edges, and between its member's row and the next. Those are CONTAINMENT bounds, not the width-FILL equality the deferral named — a stack rendered at half width or indented satisfies them.

**Shipped:** `T-WARN-WIDTHFILL @1280` + `@390` in that spec's existing T5 describe block (harness page `crewwarnings.html`, shared `TOL`; no new harness or config). Asserts left edge + width on BOTH the border box and the content box of the stack against the member ROW's measured spans. The row is resolved from the rendered name span upward to the hosting `<li>`'s direct child — never from the stack's own parent, which would restate `display: block` — and the resolver throws if the resolved row turns out to contain the stack, so a future markup collapse fails instead of passing vacuously. Anti-vacuity floor (`row.contentW > viewport * 0.4`) plus row-fills-li rule out a collapsed layout satisfying any equality.

Both spans are measured because the first cut measured only `getBoundingClientRect()` and the named regression SURVIVED: under `box-sizing: border-box`, hoisting the per-kind `pl-6` (crewwarn-underrow-polish §2) onto the stack leaves the border box byte-identical while insetting every card 24px. Negative-regression verified per mutation: `pl-6` on the stack fails content-box left at both viewports; `mx-4` fails border-box left at both; `w-fit` fails border-box width at 1280 but SURVIVES at 390, where the widest card already fills the narrow row so shrink-to-fit is geometrically indistinguishable from fill (documented in the test comment, not a gap the assertion can close).

---

## BL-SPEC-LINT — mechanize the checkable subset of spec/plan pre-review passes

**Filed:** 2026-07-19 (round-burn retrospective, PRs #470–#500) · **Class:** review-round reduction (tooling) · **Effort:** M (script + wiring into review-dispatch discipline)

R1–R3 adversarial rounds are dominated by non-compliance with passes AGENTS.md already mandates, not rule gaps. A `pnpm spec:lint <doc>` script closes the mechanizable subset: (a) every `file:line` citation resolves and the line matches the claimed symbol; (b) numeric-literal cross-check (each count/duration appears consistently everywhere the doc repeats it); (c) copy-rule scan on quoted user-visible strings (em-dash ban, apostrophe literals); (d) presence check for the mandatory §1.1 "Resolved scope — do not relitigate" section and, for UI specs, Dimensional Invariants + Transition Inventory sections. Until it exists, the attached citation-grep/numeric-sweep transcript is the compliance artifact (AGENTS.md spec self-review additions, 2026-07-19).

**Status:** ✅ SHIPPED — `feat/spec-lint` (2026-07-19; spec `docs/superpowers/specs/2026-07-19-spec-lint.md`).

---

## BL-CASP2-STRIP-POLISH — StatusStrip finalize-popover persistent overlay — ✅ RESOLVED (2026-07-17)

**Filed:** 2026-07-17 (CASP2-4 residual, `DEFERRED.md` CASP2-4) · **Resolved:** 2026-07-17, branch `feat/casp2-finalize-inflow` · **Class:** UI polish (transient-state overlay) · **Effort:** S

The calm finalize hint in the inline `PublishedToggle` no longer persists as an absolute overlay. `POPOVER_POSITION` is now **error-skin-only**; the finalize skin split off to an in-flow compact chip (`FINALIZE_CHIP`, a flex sibling of the switch) that stays inside the sticky strip's flow and can never overlay the rail content below the strip. Mode-dependent visible label ("Finalizing…" / "Publishing…", `aria-hidden`) + `sr-only` full sentence (the `aria-describedby` target); role-less/calm. Real-browser geometry rewritten (CI-1 containment + CI-1b height-bound + CI-2/CI-3 compact pill) in `tests/e2e/statusStripToggleLayout.spec.ts`; unit parity test now pins error-banner-absolute vs finalize-chip-in-flow (and fixes the `FORBIDDEN` width-cap regex). Impeccable dual-gate: critique no-slop + detector clean, audit 20/20, contrast AA both themes. Twin row in `DEFERRED.md` CASP2-4 item 1 marked RESOLVED in the same PR. This was the sole open CASP2 residual — CASP2 fully closed.

---

## BL-ROLE-VOCAB-STAGING-OVERLAY — run the role-mapping overlay in the wizard staging/rescan pipeline

**Filed:** 2026-07-16 (extend-role-scope-vocab whole-diff R1, `DEFERRED.md` ROLE-VOCAB-2) · **Class:** UX completeness (staged preview parity) · **Effort:** M (staging-core change + step-3 preview semantics + tests)

The wizard rescan parses without the role-mapping overlay, so a just-recognized role's `UNKNOWN_ROLE_TOKEN` warning persists in step 3 until publish (staged saves always `apply_pending`; mapping applies at finalize via phase2 — no data loss). Integrate the overlay (or a use-raw-style decision-display state on the control) into the staging path so step 3 previews post-overlay state and the staged `"applied"` branch becomes reachable (spec §8.3 amendment 2026-07-16 reserves it).

**Status:** ✅ SHIPPED — `feat/role-vocab-staging-overlay` (2026-07-16; spec `docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md`, 16 adversarial rounds). Overlay + always-written consumed-token stamp at the `prepareOnboardingFiles` chokepoint; stamp persisted to `shows_internal.applied_role_mappings` on every phase2 apply; one VOLATILE `FOR SHARE` SQL predicate (`role_mappings_stamp_satisfied`) gates the wizard apply, the final-CAS Held-to-Live flip (completion-blocking), and the `publish_show` RPC with the new §12.4 code `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`. Whole-feature convergence gap surfaced by review → `BL-ROLE-VOCAB-MAPPING-CONVERGENCE`.

---

## BL-ROLE-VOCAB-MAPPING-CONVERGENCE — mapping-only changes never advance the cron watermark

**Filed:** 2026-07-16 (role-vocab staging-overlay adversarial review R2/R7, spec `2026-07-16-role-vocab-staging-overlay.md` §3.4) · **Class:** convergence gap (parent feature) · **Effort:** M (watermark design decision)

Editing/deleting a `role_token_mappings` row changes no sheet bytes, so cron/push watermark-skip every unmodified sheet (`lib/sync/perFileProcessor.ts` — `modifiedTime <= effective_watermark → skip`) and a published show's `role_flags`/warnings converge only on its next sheet edit or manual sync. The publish freshness gate (staging-overlay spec §3.5) closes every `published=false→true` path; this item is the residual class for ALREADY-published shows and genuinely post-publish revokes. Candidate designs: `role_token_mappings.updated_at` participating in the effective cron watermark, or targeted re-sync fan-out on settings mutations. Pinned by the `tests/sync/perFileProcessor.test.ts` role-vocab drift-window test — revisit it with any watermark change.

**Status:** ✅ SHIPPED — `feat/role-vocab-mapping-convergence` (2026-07-16; spec `docs/superpowers/specs/2026-07-16-role-vocab-mapping-convergence.md`, 6 spec + 2 plan adversarial rounds). Drift-derived cron re-sync eligibility: per-tick content-based batch predicate over published shows (`lib/sync/roleVocabDrift.ts` — stamp exact-match drift + newly-mapped `UNKNOWN_ROLE_TOKEN` warnings; no timestamps, no migration), watermark-skip rescue in `perFileProcessor` (cron-only, never past a live pending_syncs row), in-lock pre-Phase-1 recheck (published + no-pending; DEF-4 owns archived), `less_than_or_equal` Phase 2 stale guard for `driftResync` runs, fail-open scan telemetry (`ROLE_VOCAB_DRIFT_SCAN_FAILED` / `ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE`). Drift-window pin test revised to the bounded topology. Legacy pre-`roleToken` warnings remain outside direction (b) until the show's next processed sync (spec §3.1 carve-out).

---

## BL-MUTATION-LEDGER-ROLETOKEN-DRIFT — ✅ RESOLVED IN-PR (2026-07-16): ledger re-blessed on feat/extend-role-scope-vocab

**Filed:** 2026-07-16 (extend-role-scope-vocab Task 15) · **Class:** benign ledger drift · **Effort:** S (corpus re-run + surgical re-bless)

The `roleToken` field added to `UNKNOWN_ROLE_TOKEN` warnings (feat/extend-role-scope-vocab) changes parse output for every corpus fixture whose mutated cells produce unknown role tokens, so the redacted parse-output fingerprints in `tests/parser/mutation/knownHoles.ts` drift. Local run 2026-07-16: **~1013 DRIFTED fingerprint rows across 7 shards — SAME siteIds, fingerprint-only (`driftedAlarms`/`driftedStale`), zero NEW siteIds, zero fixed holes** — the benign class per the 2026-07-09 triage discipline (see BL-MUTATION-LEDGER status above: fixture-data-driven sites; a source edit cannot add a site). The nightly `mutation-harness` workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it does not gate this PR. **Refresh:** `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run --project mutation`, then surgical re-bless via `reconcileLedger` (drift bucket only). Trigger: the next mutation-file-touching PR or the first post-merge nightly triage.

**Resolution (2026-07-16):** the nightly on MAIN went red with this exact class the same day, promoting the refresh into this PR. Root cause correction: the drift is ENTIRELY from PR #388-era parser-output changes — the `roleToken` field is empirically fingerprint-neutral (collection dumps from main's parser and this branch's parser are byte-identical). Full corpus collection on the branch + surgical `reconcileLedger` drift-bucket re-bless: 7912 rows, 1017 fingerprints swapped, 0 new holes, 0 fixed holes (machine-verified pure drift; the re-bless script fails loud otherwise). First post-merge nightly should be green.

---

## BL-MUTATION-LEDGER-AUTOCORRECT-DRIFT — ✅ RESOLVED (2026-07-22, `chore/mutation-ledger-autocorrect-rebless`, PR #548)

**Filed:** 2026-07-22 · **Class:** benign ledger drift · **Effort:** XS (corpus re-run + surgical re-bless) · **Resolved:** 2026-07-22

The `autocorrect` field populated at all 13 parser producers (`7295d794c`, merged via the
warning-card-identity-placement chain, PR #543-era) changes parse output for corpus fixtures whose
mutated cells produce autocorrect-bearing warnings, so the redacted parse-output fingerprints in
`tests/parser/mutation/knownHoles.ts` drift. Nightly run 29907734946 (2026-07-22): DRIFTED
fingerprint rows across 7 shards — SAME siteIds, fingerprint-only, zero NEW siteIds, zero fixed
holes — the benign class per the 2026-07-09 triage discipline (BL-MUTATION-LEDGER-ROLETOKEN-DRIFT
above and BL-MUTATION-LEDGER-REFRESH-AMBIGUITY below are the identical prior instances). The nightly
`mutation-harness` workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it
gated no PR.

**Resolution (2026-07-22, `c5847a9f4`):** re-blessed the same day it was filed, on
`chore/mutation-ledger-autocorrect-rebless` (PR #548), from the full HEAD corpus — 8 LPT shard dumps,
101,705 mutants, reconciled bidirectionally: **2452 pure fingerprint drifts, 0 new holes, 0 fixed
holes**; ledger totals unchanged (7912 rows, 7514 `wrong` + 398 `signal_loss`, section-reorder 82).

**Why it sat in the open queue twelve days after it was fixed:** the entry named its own trigger as
"the next mutation-file-touching PR or the next post-merge nightly triage", and that PR shipped
within hours — the refresh happened, the entry was never closed. Graduated on
`chore/close-mutation-autocorrect-drift` (2026-08-03) after re-verifying the claim rather than
trusting the commit message: every scheduled `mutation-harness` nightly from 2026-07-29 through
2026-08-03 is green, and the intervening 07-27 / 07-28 red runs were the SEPARATE hotel
ambiguity-judgment drift, closed by `9af6610a8` + `704de0833`.

---

## BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID — one-line desktop grid rows for the roles settings list

**Filed:** 2026-07-16 (extend-role-scope-vocab impeccable dual-gate, `DEFERRED.md` ROLE-VOCAB-1) · **Class:** UX density (P2) · **Effort:** S (responsive layout branch + tests + dual-gate re-run)

**Status:** ✅ SHIPPED — PR #402 (`feat/role-vocab-settings-desktop-grid`, spec `docs/superpowers/specs/2026-07-16-role-vocab-settings-desktop-grid.md`, commits `21819c1b5` + `11d6fdd9d`). Single-DOM `min-[760px]:` grid branch in `RoleMappingRow`, `max-w-3xl` container, real-browser layout spec `tests/e2e/roles-settings-layout.spec.ts` + component suite green, invariant-8 dual-gate ran. `DEFERRED.md` ROLE-VOCAB-1 marked resolved.

`/admin/settings/roles` renders the stacked mobile card at every viewport; the committed mock (`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Roles You've Added.dc.html`, Desktop width section) specifies a compact one-line grid row (`150px | chips | meta | actions`, short "Edit" label) at >=760px. Implement the desktop variant when the list grows past ~8 rows or Doug reports desk-context sparseness. UI work -> Opus + invariant-8 impeccable dual-gate.

**Status:** ✅ SHIPPED — `feat/role-vocab-settings-desktop-grid` (PR #402, 2026-07-16; spec `docs/superpowers/specs/2026-07-16-role-vocab-settings-desktop-grid.md`). Single-DOM responsive branch in `RoleMappingRow` (`min-[760px]:` grid, header dissolves via `contents`, panels `col-span-4`), `max-w-3xl` container, `EDIT_LABEL_SHORT` re-added behind a constant Edit `aria-label`. Real-browser layout gate `tests/e2e/roles-settings-layout.spec.ts` (desktop-chromium). Dual-gate: critique 33/40, audit 20/20, no P0/P1 (`docs/superpowers/plans/2026-07-16-role-vocab-settings-desktop-grid/DUAL-GATE.md`).

---

## BL-EXTEND-ROLE-SCOPE-VOCAB — map novel role tokens to scope-capability flags

**Filed:** 2026-07-10 (admin field-override removal, `docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md` §1/§6) · **Class:** capability gap · **Effort:** M (needs a visibility-mapping design)

When a crew member's role in the sheet is a legitimate token the parser doesn't recognize, `role_flags` resolution fails closed (`UNKNOWN_ROLE_TOKEN` → no flag) and that person gets no scope tiles. `role_flags` are a **closed vocabulary** gating scope-tile visibility (`lib/visibility/*`), so editing the sheet cannot elicit the correct scope — the token is spelled fine, the app just doesn't map it. This is one of the two residual needs the removed admin field-override feature was gesturing at but did not properly solve (an override stored a display value, not a capability mapping). **Follow-up:** let an admin map a novel/unrecognized role token to the correct scope-capability flags so it grants the right tiles. Needs a visibility-mapping design (where the mapping lives, per-show vs global, how it survives re-sync, audit trail). Explicitly NOT a free-form value override — it maps a token to a closed-vocab capability set.

**Status:** ✅ SHIPPED — `feat/extend-role-scope-vocab` (PR #396, 2026-07-16; spec `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md`). Global `role_token_mappings` table (capability-checkbox model: Audio/Video/Lighting/Financial details, recognize-only valid), pure post-parse overlay applied in phase 2, `ROLE_TOKEN_MAPPED` telemetry with delta gate, admin control on UNKNOWN_ROLE_TOKEN warnings + `/admin/settings/roles` list page. Two residual UX items deferred → `BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID`, `BL-ROLE-VOCAB-STAGING-OVERLAY`.

---

## BL-STRUCTURAL-TRANSFORM-USE-RAW — "use the sheet's raw value" reversal on recoverable structural transforms

**Filed:** 2026-07-10 (admin field-override removal, `docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md` §1/§6) · **Class:** correction gap · **Effort:** M–L (per-transform revert semantics)

The one territory where a sheet edit genuinely **can't** elicit correct output: transforms where the sheet is right but the parser mis-structures it and no reword fixes it — room name/dim split (`lib/parser/blocks/rooms.ts`), hotel guest/address glue (`lib/parser/blocks/hotels.ts`), and inverted check-in/out date ordering. The raw value is **already captured** on the corresponding ambiguity warnings (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY` — ambiguity-warnings-v1 #367). **Follow-up:** an admin affordance attached to those recoverable structural-transform warnings that says "decline this transform / use the sheet's raw value," deriving the corrected value from the sheet's raw content (never fabricated in-app — no second source of truth). Needs per-transform revert semantics (what "raw" means for each transform, how the reversal survives re-sync, how it renders). This is the sheet-canonical-preserving successor to the removed override layer, scoped to structural transforms only (NOT verbatim fields, which are sheet-editable).

**Status:** ✅ SHIPPED — `feat/structural-transform-use-raw` (spec `docs/superpowers/specs/2026-07-10-structural-transform-use-raw.md`). Content-pinned decisions, pure post-parse overlay, both admin surfaces. One residual UX enhancement deferred → `BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE`.

---

## BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE — wizard use-raw toggle beyond the 3-per-section callout cap

**Filed:** 2026-07-15 (structural-transform use-raw whole-diff review R4, `DEFERRED.md` USE-RAW-1) · **Class:** UX completeness (P2) · **Effort:** S–M (thread props + invariant-8 impeccable dual-gate + Playwright/component tests)

The Step-3 wizard renders the use-raw toggle only inside `SectionFlagCallout`, which caps at `CALLOUT_MAX_ENTRIES = 3` per section (`components/admin/wizard/step3ReviewSections.tsx:519`). A section with >3 recoverable warnings (realistically only room-header splits in a room-heavy show) leaves warnings 4+ without a wizard toggle — they collapse to "+N more in Parse warnings." Not a correctness bug: the decision is reachable post-publish on the uncapped per-show live page (`app/admin/show/[slug]/page.tsx:971-994`), content-pinned by `(code, contentHash)`, so it carries through. **Follow-up:** render the toggle for every in-scope recoverable warning in the wizard's full uncapped `WarningsBreakdown` list (`:2374`), matching the live page — threading `useRawDecisions`/`wizardSessionId` into that component and resolving the summary-callout-vs-full-list redundancy (either the breakdown becomes the sole actionable site or the callout stays a compact preview). UI work → Opus + invariant-8 impeccable critique+audit + real-browser layout/transition tests.

**Status:** ✅ SHIPPED — `feat/use-raw-wizard-full-list` (PR #399, 2026-07-16; spec `docs/superpowers/specs/2026-07-16-use-raw-wizard-full-list-toggle.md`). WarningsBreakdown mounts `UseRawControlBoundary` + `RoleRecognizeControlBoundary` on every in-scope warning when `wizardSessionId` is threaded (callout kept as capped actionable preview); `stableWarningKeys` identity keys at both render sites (reorder state-migration guards); stale-sibling role-control contract pinned (idempotent/conflict). Three impeccable findings deferred → `DEFERRED.md` USE-RAW-FULL-LIST-1/2/3 (`BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`, `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y`, `BL-WIZARD-WARNINGS-COPY-QUALIFIER`).

---

## BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION — demote SectionFlagCallout to pure preview (title + jump only)

**Status:** ✅ RESOLVED — `feat/use-raw-callout-preview-demotion` (2026-07-17; spec + plan `docs/superpowers/{specs,plans}/2026-07-17-use-raw-callout-preview-demotion*`). Deliberately overrode the ratified keep-both: stripped the `UseRawControlBoundary` + `RoleRecognizeControlBoundary` mounts from `SectionFlagCallout` so `WarningsBreakdown` is the sole actionable site (one live control instance per warning; divergence structurally impossible). Resolves `DEFERRED.md` USE-RAW-FULL-LIST-1 (moved to `DEFERRED-archive.md`). Impeccable dual-gate: audit 20/20, critique clean; one follow-on UX note → `CALLOUT-PREVIEW-ACTION-CUE-1`, itself ✅ RESOLVED 2026-07-18 (`feat/callout-preview-action-cue`; action-forward "Fix/Review in Parse warnings" jump label — see `DEFERRED-archive.md`).

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-1) · **Class:** UX simplification (P1→ratified+deferred) · **Effort:** S

With PR #399 the wizard's `WarningsBreakdown` is a complete actionable list, so a warning in the first 3 of its section's callout has two live control instances. Use-raw converges via `router.refresh()`; the recognize-role control deliberately performs no client refresh (2026-07-15 §8.1 timing contract), so a recognized role leaves the sibling instance in create mode until navigation — resubmit resolves deterministically (set-equal → idempotent, different → benign conflict notice; pinned by `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`) but can momentarily confuse. Keep-both is the ratified spec decision (spec §2.1/§4.6, 2026-07-16). **Follow-up:** if Doug reports double-recognizing from the two sites, demote the callout to a compact preview (title + jump link, no mounted controls), revisiting the keep-both ratification. UI work → Opus + invariant-8 dual-gate.

---

## BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y — site-scoped testids + qualified aria-labels for duplicated warning controls

**Status:** ✅ RESOLVED — `fix/use-raw-control-site-a11y-copy` (2026-07-17; spec `docs/superpowers/specs/2026-07-17-use-raw-control-site-a11y-copy.md`).

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-2) · **Class:** accessibility (P2) · **Effort:** S–M (touches shared controls + every existing control test)

Both render sites emit identical `data-testid` values (`use-raw-control`, `role-recognize-control`, toggle ids) and identical radiogroup `aria-label`s — screen-reader users hear the same group twice per warning with no disambiguation, and unscoped `getByTestId` queries multi-match. All in-repo queries are container-scoped today, so nothing was broken. **Resolution:** an optional `WarningControlSite` (`"callout"|"list"|"showpage"`) threads mount→boundary→control and site-scopes **every** leaf testid (not just the container) — `use-raw-control`/`role-recognize-control` plus the toggle/panel/check/etc. leaves. Accessible names are **kind/token-qualified**, NOT warning-title-qualified as originally scoped: the use-raw radiogroup is qualified by `resolution.parsed.kind` (room split / hotel guest split / show dates) and the recognize-role trigger by its `roleToken` (label-in-name preserved). This avoided threading `reviewWarningTitle` through the shared controls (the user-ratified approach for this diff). Absent `site` = bare testids, so the standalone unit suites stayed unchanged.

---

## BL-WIZARD-WARNINGS-COPY-QUALIFIER — qualify the "informational / don't block publishing" line above consequential controls

**Status:** ✅ RESOLVED — `fix/use-raw-control-site-a11y-copy` (2026-07-17). Line now reads "These warnings don't block publishing. Some include an optional fix you can apply below." — drops "informational," keeps the non-blocking clause, names the fixes.

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-3) · **Class:** copy (P2) · **Effort:** XS

The §3.10-pinned "These are informational and don't block publishing" line now headlines rows whose controls can grant financial access (recognize-role) or rewrite crew-visible values (use-raw). Still factually true — warnings never block publishing and the controls are optional — but the framing undersells consequence. **Follow-up:** qualify at the next wizard copy pass (copy is §3.10-pinned; requires the spec-copy update discipline).

---

## BL-CREW-RENAME-SILENT-REPLACEMENT — rename (drop+add) bypasses the single-drop shrink gate on published shows

**Status:** ✅ RESOLVED — `feat/crew-rename-shrink-gate` (PR #383, 2026-07-11). Option A tiered, per spec `docs/superpowers/specs/2026-07-10-crew-rename-shrink-gate.md` (4 adversarial rounds APPROVE): the publish gate now keys on crew **removal-class items** (MI-13/MI-14 pairs + their orphan-removes) instead of net `crewDrop`, so drop+add can no longer mask a removal (net-zero rename AND swap both hold); MI-12 (same canonical email) auto-links as an identity-preserving in-place rename — `crew_members.id` survives, so the picker cookie keeps resolving; confirmed MI-13/14 holds also link on the version-bound accept (confirm = vouch); unconfirmed heuristic pairs never merge identities (fail-safe re-pick). `describeShrink` names rename candidates/removals (8-part cap). `undo_change` analyzed and deliberately unchanged (no FK references `crew_members(id)` in the final schema; linked + replaced undo shapes pinned by DB tests). No schema change, no UI files.

**Filed:** 2026-07-10 (e2e preparedness re-rating, `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §10) · **Class:** seam gap (P0-1 residual) · **Effort:** S–M (rename-vs-drop classification)

The #359 fix routes `crewDrop === 1` on published shows through the `shrink_held` confirm path (`lib/sync/phase1.ts:441-444`; MI-6 proper still fires only at `crewDrop > 1`, `lib/parser/invariants.ts:250-252`). But a **rename** arrives as drop+add in the same sync — net crew delta 0 — so neither gate fires: the old member row is silently replaced on a published show. Consequences match the original P0-1: the renamed member's picker identity vanishes (their cookie gets the re-pick banner, so crew-side is fail-safe), and Doug's only trace is an unsurfaced changes-feed row. Two further known carve-outs, both **by design**: unpublished shows auto-apply single drops (`phase1.ts:44`), and `onboarding_scan` mode is excluded from the gate (`phase1.ts:441`). **Follow-up:** classify drop+add pairs within one sync (name-similarity and/or matching email/phone on the added row) as a rename candidate and either auto-link identity (preserve `crew_member_auth`/picker continuity) or route through `shrink_held` for confirm. Note MI-7b precedent: rename re-staging keyed on `(kind,name)` already exists for rooms — the crew rename class is the unhandled sibling.

---

## BL-MUTATION-LEDGER-REFRESH-AMBIGUITY — refresh known-holes fingerprints after ambiguity-warnings-v1

**Status:** ✅ RESOLVED — `feat/mutation-ledger-triage-classify` (2026-07-09). Refreshed via a full `COLLECT_MUTATION_ALARMS` corpus run + surgical re-bless: **1017 fingerprints swapped, 1 fixed hole dropped** (`merged-cell:fixed-income:B8:L48:X1` — the ambiguity parse change now CATCHES that mutant), ledger 7913 → 7912, **zero new holes** (no regression). The original "benign drift, NO new siteIds/holes" claim below held on the regression axis; the one correction is that there was also 1 coverage-improving FIX (a shrink, per the ratchet), not pure drift. The drop was proven legit, not a generation regression or flake (Codex #369 finding): the site is still GENERATED (1 of 853 merged-cell mutants on `fixed-income`) and its oracle verdict flipped `SILENT_WRONG` → `SIGNALED` (the ambiguity warning now makes the corruption visible). The SHIPPED harness never auto-heals — the shard assertion requires `fixedHoles == []`, so any future fixed hole reddens the nightly for human triage; the auto-drop was a supervised one-off in the re-bless tool. Same PR added drift/new/fixed classification to `reconcileLedger` (triage now names which bucket fired) and a schedule-only auto-filed tracking issue so a red nightly is no longer invisible.

The ambiguity-warnings-v1 feature adds four `severity:"warn"` ParseWarning codes (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `HOTEL_CARDINALITY_EXCEEDED`, `DATE_ORDER_SUGGESTS_DMY`), so the parser OUTPUT for any corpus fixture that now triggers one of them changes. The mutation harness fingerprints (a redacted parse-output hash) stored in `tests/parser/mutation/knownHoles.ts` `RAW_HOLES` therefore drift for those fixtures (e.g. `2026-04-asset-mgmt-cfo-coo-waldorf` `ref-sub` rows). **Confirmed BENIGN:** same `siteId`s, changed fingerprints only, NO new `siteId`s/holes — mutation sites are fixture-data-driven (`ref-sub`/`blank-row`/… corrupt input cells), not parser-source-line-driven, so a source edit cannot add a site. The nightly `mutation-harness` workflow (NON-required check, path-filtered to `tests/parser/mutation/**` + vitest wiring, self-documented "red is triaged, not a merge blocker") will flag these until the ledger is refreshed; the feature PR deliberately does NOT touch mutation files, so the workflow never ran on it. **Refresh:** run `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run --project mutation`, rebuild `RAW_HOLES` from the 8 shard dumps (comparison key is `siteId|kind|fingerprint`; `finding`/`note` are metadata), and commit. Trigger to promote: the next mutation-file-touching PR, or the first post-merge nightly triage.

---

## INFO-tab data-fidelity audit (2026-06-29)

The seven items below were surfaced by a parser → review-modal → crew-page audit of the **AII/III - Consultants Roundtable** show (source sheet `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`). Every finding carries verified `file:line` evidence (parser re-run on `fixtures/shows/exporter-xlsx/consultants.md`). Full field-by-field table + evidence: **`docs/audits/info-tab-fidelity-audit-2026-06-29.md`**. Suggested order: parser-only cluster first (DRESS, ROOM-DEDUP, TITLE — GS-dims was investigated and is NOT a live parse drop, folded into BL-ROOM-DETAIL-UNRENDERED as render-only) → render surfaces (Opus + impeccable v3) → review-modal completeness.

### BL-PARSER-DRESS-DROP — capture the DRESS block (parser data drop)

**Status:** ✅ RESOLVED — PR #191 (2026-06-30) · **Severity:** high (systemic; crew never learn what to wear) · **Class:** DROPPED-BY-PARSER

`parseEventDetails` slices markdown from the `DETAILS` header (`lib/parser/blocks/event.ts:135`), but the INFO `DRESS` block sits **before** that header, so the `dress`/`attire`→`dress_code` aliases (`event.ts:97-100`) never fire; `crew.ts:34` uses `"DRESS"` only as a terminator. Verified: `parseEventDetails(...).dress_code === undefined` on both fixture families; `TodaySection.tsx:297-299,467` renders the dress card null. This is the standard exporter template layout → affects every show. **Fix (resolved in spec `docs/superpowers/specs/parser/2026-06-29-parser-info-tab-fidelity-design.md`):** add a dedicated `parseDress` independent of the DETAILS slice that captures the full DRESS block (header value + continuation rows) into the existing `event_details.dress_code` as a **label-retaining multi-line value** (`Set/Strike: …\nShow: …`) — both values preserved with zero loss, NOT new structured fields (which would be zombie fields; the sole consumer `TodaySection.tsx:297` reads `event_details.dress_code` only). TDD: assert both labeled lines populate from a DRESS-before-DETAILS fixture; the crew dress card renders immediately (no UI change). A richer two-card split can come with the deferred UI work.

### BL-ROOM-GEAR-MERGE-DEDUP — fix lunch-room duplication (parser fidelity)

**Status:** ✅ RESOLVED — PR #191 (2026-06-30) · **Severity:** high (real prod show renders the lunch room as two split cards, on crew + review) · **Class:** FIDELITY BUG

`mergeGearIntoRooms` (`lib/parser/index.ts:355`) matches a GEAR room to an INFO room by `(kind, name-token)`. The lunch room is INFO `breakout`/`"BALLROOM C"` vs GEAR `additional`/`"GRAND BALLROOM C"` (token normalizer `index.ts:328-336` strips `LUNCH SESSION` but not `GRAND`) → double miss → two cards (times on one, gear on the other). Verified via `parseSheet()` → 9 rooms; the lunch room is the only genuine duplicate. **Fix (resolved in spec `docs/superpowers/specs/parser/2026-06-29-parser-info-tab-fidelity-design.md`):** align the GEAR lunch kind to `breakout` AND strip a leading `GRAND` from the GEAR lunch room NAME — both **scoped to gear.ts's `^LUNCH` branch only** — so the GEAR lunch room becomes `(breakout, "BALLROOM C")` and merges onto the INFO lunch room. The `(kind, name-token)` merge key and the shared `gearNameToken` are **preserved unchanged** (per the R8-H1 decision at `index.ts:341-348` — do NOT relax to token-only / drop `kind`, and do NOT globally strip `GRAND`, which would false-merge distinct same-kind `GRAND X`/`X` rooms). The generic `"Additional rooms"` card (`rooms.ts:158-167`) and GEAR `"FOYER"` (real gear) are **intentional and stay** — they only look empty in the Step-3 modal, which is the M2 modal-render gap (`BL-REVIEW-MODAL-COMPLETENESS`), not a parser bug. TDD: assert exactly one `BALLROOM C` room (kind `breakout`) carrying both the INFO times and the GEAR gear; plus a collision negative — a non-lunch `GRAND X`/`X` same-kind pair must NOT merge.

### BL-EVENT-DETAILS-UNRENDERED — surface the technical DETAILS specs to crew + operator (render gap)

**Status:** ✅ RESOLVED — PR #195 (2026-06-30) · **Severity:** high (crew-impacting) · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus + impeccable v3

The parser captures all 19 `event_details` keys but the crew page renders 5 and the review modal 2 (`Step3SheetCard.tsx:380-385`). Never rendered anywhere: **Stage Size, GS Podium Type, Polling, LED, Backdrop/Scenic, Equipment Storage, Test Pattern, Fonts** (+ sentinels). No component iterates the `event_details` map. **Fix:** a crew-facing Tech-Specs card (Venue or Gear section) iterating the full map with sentinel-hiding (highest crew impact: stage size, podium, polling); extend `EventDetailsBreakdown` to render all non-sentinel keys for the operator pre-publish. **Shipped:** shared closed-vocab whitelist `lib/crew/eventDetailsSpecs.ts` (`EVENT_DETAILS_LABELS` + `CREW_TECH_SPEC_KEYS`) feeding (1) a full-width "Tech specs" card in `GearSection` (2-col `KeyValueRows`, sentinel-hidden, `gear-tech-specs` card-id → `details` deep-link) and (2) the extended `EventDetailsBreakdown` (all known text specs, shown as-parsed incl. sentinels — the existing review-surface contract).

### BL-ROOM-DETAIL-UNRENDERED — deliver per-room setup/dimensions/floor/times

**Status:** ✅ RESOLVED — PR #197 (2026-06-30) · **Severity:** medium · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus

`room.setup` ("Chevron theater for 60" / "Boardroom for 12"), `room.floor`, `room.dimensions`, and per-room set/show/strike times are parsed but read by zero components; per-room times collapse only into the show-wide `KeyTimesStrip`. **Correction (2026-06-29, spec review):** GS dimensions are NOT a parse drop on live data — the live Consultants sheet carries them **inline** in the `GENERAL SESSION\nNAME\nDIMS\nFLOOR` header cell, which `splitRoomHeader` already captures (pinned by `tests/parser/exporterFixtures.test.ts:1168-1185`; the standalone-`ROOM DIMENSIONS:`-row shape is obsolete). The earlier "parse drop" reading was an artifact of the stale `exporter-xlsx` fixture; a separate-row backfill was attempted in the parser-cluster spec and DROPPED. **Fix (this BL):** purely render — show setup + dimensions + floor + per-room times per room on crew Gear/Venue + the review modal. If a genuine live capture gap is found, design it against the inline-header shape, not the obsolete standalone row. **Shipped:** render-only via shared `lib/crew/roomDetailFields.ts` (`ROOM_DETAIL_FIELDS`) feeding (1) a room-first "Room details" card in GearSection (`gear-room-details` → `rooms`; per-room `<h3>` + single-column `KeyValueRows` of dimensions/floor/setup + set/show/strike times; sentinel-hidden, cap 12) and (2) the Step-3 `RoomsBreakdown` per-room detail sub-list (as-parsed). No parser change (live-verified: East Coast populates these inline; Consultants is sentinel-empty → card hides). `power`/`digital_signage`/`notes` deliberately excluded.

### BL-REVIEW-MODAL-COMPLETENESS — close the Step-3 publish-gate blind spots (review-only gap)

**Status:** ✅ RESOLVED — PR #199 (2026-06-30) · **Severity:** medium · **Class:** REVIEW-ONLY GAP · **Routing:** UI → Opus + impeccable v3

The modal body is exactly 6 BreakdownSections + Agenda + Warnings (`Step3SheetCard.tsx:1431-1472`). It omits transportation (T1-T7), loading dock (V3), COI/Proposal/PO# (O1-O3), client contact (C2-C4), in-house AV (O5), hotel contact (O4), 17/19 event-details, crew phone, venue address, hotel address — all of which DO render on the published crew page. So the operator cannot pre-publish-verify this data. **Fix:** add operator-only review sections (Transport, Loading dock, Ops/COI/PO, Contacts, full Event details, addresses, crew phone) so the gate sees everything the crew page will show. **Shipped:** event-details + room-detail already closed by #195/#197; #199 added 4 new BreakdownSections (Venue, Transport, Contacts incl. client+secondary, Billing & docs = COI/Proposal/PO/Invoice) + Crew(+phone)/Hotels(+address), all from ParseResult, as-parsed via `contentRows`/`hasContent` (no SourceLink; confirmation_no stays private). PO/Proposal read ungated from `pr.show.*` (modal is admin-only).

### BL-TITLE-EVENT-NAME-PREFERENCE — prefer the line-1 banner over the "Event Name:" cell (parser fidelity)

**Status:** ✅ RESOLVED — PR #191 (2026-06-30) · **Severity:** medium · **Class:** FIDELITY BUG

`extractTitleFromMarkdown` priority #1 (`lib/parser/index.ts:121-133`) returns the first `"Event Name:"` cell — `"AII/III - CONSULTANTS ROUNDTABLE"` (uppercased, `2025` dropped) — before the proper line-1 banner `"AII/III - Consultants Roundtable 2025"` (priority #6). Mangled title renders on the crew header (`Header.tsx:83,98`) + review-modal link (`Step3SheetCard.tsx:10`). **Fix:** prefer the line-1 banner; fall back to `"Event Name:"` only when no banner exists. TDD: assert proper-case + year preserved for the consultants fixture.

### BL-CREW-PARTIAL-ATTENDANCE-CHIP — show who is partial-attendance to teammates (render gap)

**Status:** ✅ RESOLVED — PR #201 (2026-06-30) · **Severity:** low–medium (coordination gap) · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus

`(10/7 ONLY)` / `(10/7 and 10/9 ONLY)` are stripped from names into `date_restriction` (`personalization.ts:118-126`) and drive the viewer's own schedule, but no roster surface shows a badge — `CrewSection.tsx:175-183` (crew) and `CrewBreakdown` (`Step3SheetCard.tsx:194-199`) render name+role only. **Fix:** render a small "Oct 7 & 9 only" chip from `date_restriction.days` next to the role on both the crew roster and the review modal. **Shipped:** new `humanizeDayList` + shared `lib/crew/partialAttendance.ts` `partialAttendanceLabel({humanize})` → a mixed-case `PersonRow` chip (`data-partial`, CalendarDays glyph, "Oct 7 & 9 only" / "Partial (dates TBD)"; not viewer-gated) on the crew roster + an as-parsed inline `· …` segment in the Step-3 `CrewBreakdown`. Render-only.

---

## BL-FINALIZE-APPROVAL-DECISION-RACE — re-read the full finalize decision row under the per-show lock

**Status:** ✅ RESOLVED — PR #188 (2026-06-29) · **Severity:** medium (pre-existing; narrow window; recoverable) · **Surfaced:** agenda-PDF-schedule whole-diff review R8 (2026-06-29)

**Resolution:** Shipped per the recommended fix below. The generation-scoped locked re-read was widened from `parse_result`-only to the full decision row (kept in place after the Drive fence), the version gate moved to after `coercedRow`, every checked/unchecked branch re-pointed to the locked `coercedRow.*`, and a finishable re-validation skip added (forward-defense). Spec: `docs/superpowers/specs/data-quality/2026-06-29-finalize-approval-decision-race-design.md`; plan: `docs/superpowers/plans/data-quality/2026-06-29-finalize-approval-decision-race.md`; tests: `tests/onboarding/finalizeApprovalRace.test.ts`. Client defense-in-depth (recommended-fix item 3 below) was intentionally NOT shipped — the server-side locked re-read fully closes the race.

**Problem.** `finalize` reads `wizard_approved` (and approval provenance, reviewer choices, failure code, manifest status) at _select_ time in `selectFinishableCleanRows`, BEFORE taking the per-show row lock. The approve/unapprove routes serialize on the **same** `show:` advisory lock. So a concurrent approve/unapprove that commits _after_ finalize's select but _before_ finalize acquires that row's lock makes finalize act on the **stale** select-time `wizard_approved`: a row the operator just unchecked can publish, or a row just checked can be Held. The operator's final checkbox intent is then not what ships.

**Pre-existing.** Verified at merge-base `0481c9dc` (before the agenda feature): finalize always used the select-time `wizard_approved` with no locked re-read. The agenda feature added ONLY a generation-scoped `parse_result` re-read under that lock (for agenda publish-safety); it did **not** introduce or worsen this race. The approve route updates `wizard_approved` **without** bumping `staged_modified_time`, so the agenda feature's generation-scoped re-read does not catch it.

**Why deferred (not fixed in the agenda PR).** Fixing it correctly means extending the locked re-read to the FULL decision row and re-driving finalize's 4-branch checked/unchecked/Held/failure split from the locked values — a substantial change to the intricate finalize state machine (the `finishable` predicate `wizard_approved = true OR last_finalize_failure_code is null`, the failure-code lifecycle, manifest `publish_intent`). A naive "demote on `wizard_approved` change" interacts badly with that predicate (a demoted unchecked-clean row may not be re-selected on the next finalize). This is finalize-core concurrency work, orthogonal to agenda extraction, and belongs in a focused finalize PR — not bolted onto a feature PR where it expands blast radius on the publish path.

**Recommended fix (for the focused PR).**

1. Inside the per-show locked tx, generation-re-read the full finalize decision row — `wizard_approved`, `wizard_approved_by_email`/`wizard_approved_at`, `wizard_reviewer_choices`, `last_finalize_failure_code`, manifest `publish_intent`/status — not only `parse_result`.
2. Drive ALL checked/unchecked/Held/failure branching from that locked re-read; re-validate the `finishable` predicate against the locked values; route a row that no longer matches to a typed per-row skip/retry (NOT a publish/Held on stale intent), with careful handling of the failure-code lifecycle so a re-finalize re-selects it correctly.
3. Defense in depth (client): disable/serialize the Step-3 "Finish" action while approval-checkbox writes are in flight.
4. Regression: commit an approve/unapprove AFTER `selectFinishableCleanRows` but BEFORE `processApprovedRow` takes the show lock; assert finalize honors the latest intent (publishes the checked, Holds the unchecked).

**Reference:** `app/api/admin/onboarding/finalize/route.ts` (`selectFinishableCleanRows` ~:346, `processApprovedRow` ~:710 incl. the agenda re-read ~:729); approve `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts:125`.

---

## BL-COPY-CRON-SWEEP — de-jargon "cron" across the remaining catalog codes

**Status:** ✅ RESOLVED (2026-07-03, branch `chore/copy-cron-sweep`) · **Severity:** low (copy quality; admin-facing) · **Surfaced:** watch-channel-health spec §3.5 (2026-07-01)

All four catalog entries de-jargoned via the §12.4 three-way lockstep (spec prose + `pnpm gen:spec-codes` + catalog.ts, x1 gate green): `STAGED_PARSE_SUPERSEDED` ("a cron run" → "an automatic sync"), `NO_FOLDER_CONFIGURED` ("Cron ran" → "The automatic sync ran"), `MISSING_PENDING_INGESTION_MODTIME` ("so cron knows" → "so the scheduled sync knows"), `SYNC_DELAYED_SEVERE` ("Push or cron is stalled" / "normal cron interval" / "the cron job" → "the scheduled sync" phrasing, plus the sibling "push subscriptions" → "instant updates" per user's cron+push scope choice). Replacement vocabulary matches the shipped `WATCH_CHANNEL_ORPHANED` / `SYNC_STALLED` voice.

---

## BL-COPY-CRON-SWEEP-2 — de-jargon "cron" on the two non-catalog admin surfaces

**Status:** ✅ RESOLVED (2026-07-25, branch `chore/copy-cron-sweep-2`) · **Severity:** low (copy quality; admin-facing) · **Surfaced:** BL-COPY-CRON-SWEEP execution (2026-07-03)

The two filed surfaces plus the destination they link to, so the vocabulary is coherent end to end rather than a de-jargoned label opening a page headed "Cron health". Replacement word is **scheduled job**, not the archived sweep's "automatic sync": the telemetry page covers 9 jobs (notify, diagram-gc, report-reaper, asset-recovery, keepalive, sync, refresh-watch, gc-watch, plus sync), so a sync word would have narrowed it. The help-MDX line describes the sync specifically and does use "automatic syncing".

Shipped: `app/admin/settings/page.tsx` (Diagnostics link title + sub), `app/help/admin/onboarding-wizard/page.mdx:117` ("points cron at the folder for ongoing sync" → "starts automatic syncing of the folder"), `app/admin/dev/telemetry/page.tsx` (header sub + degraded fallback), `components/admin/telemetry/CronHealthHeader.tsx` + `CronHealthList.tsx` ("Cron health" → "Scheduled jobs"), `TelemetryOverviewStrip.tsx` ("Cron jobs" → "Scheduled jobs"; "Cron health unavailable" → "Health unavailable", non-redundant under the relabelled card). Identifiers, `data-testid`s, `aria-labelledby` ids, route paths, and component/file names keep "cron" — they name the real pg_cron mechanism and are not user-visible.

Test pins added in the same commit (each fails on re-introduction): `tests/components/telemetry/cronHealthHeader.test.tsx` heading, `cronHealthList.test.tsx` heading, `telemetryOverviewStrip.test.tsx` (label in both ok + infra_error states, plus `not.toMatch(/cron/i)` on the card's text), `tests/app/admin/telemetryPage.test.tsx` (header sub + degraded fallback), `tests/help/page-onboarding-wizard.test.tsx` (`not.toMatch(/\bcron\b/i)` over the whole MDX source), `tests/e2e/developer-tier.spec.ts` (link copy + `not.toContainText(/cron/i)` on the Diagnostics section).

No repo-wide static jargon guard was added: there was no regression vector to close — the leftovers were the first sweep's deliberate deferral, not copy someone re-introduced — and a scanner over `app/**` + `components/**` would have to distinguish copy from the many legitimate `cron` identifiers, testids, and route paths. The per-surface `not.toMatch(/cron/i)` pins cover the surfaces that actually carry the copy.

---

## Mutation-surface observability (invariant #10, 2026-07-04)

Filed alongside AGENTS.md plan-wide invariant #10 (mutation-surface observability). The invariant is live and enforced; these two entries are the scoped debt it deliberately grandfathers.

### BL-CREW-PICKER-OBSERVABILITY — telemetry taxonomy for the crew/system picker functions

**Status:** CLOSED (2026-07-05) · **Severity:** low · **Class:** OBSERVABILITY DEBT

**Shipped** the `auth.picker.*` crew-telemetry taxonomy (coded `log.info`, distinct from `logAdminOutcome` since the actor is an anonymous crew member on an emailed link): `PICKER_IDENTITY_SELECTED` (`selectIdentityCoreImpl`), `PICKER_IDENTITY_CLEARED` (`clearIdentityCoreImpl`, existence-guarded), `PICKER_STALE_ENTRY_CLEANED` (`cleanupStaleEntryCoreImpl`, cleaned branch). The 6 exported wrappers carry `// no-telemetry:` delegation comments and `KNOWN_UNINSTRUMENTED` (`tests/log/mutationSurface/exemptions.ts`) is now empty; the discovery floor forces any NEW picker mutation to be accounted for regardless. The 3 **admin-gated** picker mutations (`resetPickerEpoch`, `rotateShareToken`, `resetCrewMemberSelection`) remain instrumented via `logAdminOutcome` (invariant #10 §3.1 A) and were never part of this debt.

### BL-ADMIN-OUTCOME-BEHAVIOR — backfill executable behavioral proofs for the 30 grandfathered admin surfaces

**Status:** ✅ CLOSED (2026-07-09) · **Severity:** low · **Class:** TEST COVERAGE

**Done across 3 autonomous PRs — Batch 1 #365 (6 per-show actions, pin 30→24), Batch 2 #368 (16 clean DI-seam route POSTs, pin 24→8), Batch 3 #371 (final 8 — 4 heavy DI-seam incl. the `fakeLeasePool` extract-agenda proof + 4 plain-POST, pin 8→0).** The `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` allowlist + `GrandfatherUnit` type + both pin tests were then **deleted entirely**; Task 18 in `tests/log/adminOutcomeBehavior.test.ts` is now a strict completeness assertion (`missing = AUDITABLE_MUTATIONS(admin) − recorded`, no grandfather subtraction) so every admin mutation surface must carry a live inline `proveAdminOutcomeBehavior` proof — no escape hatch remains. Test-only throughout; no production change.

<details><summary>Original entry</summary>

`ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`tests/log/mutationSurface/exemptions.ts`) froze 30 pre-existing admin surface units — 24 admin route `POST`s + 6 pre-existing admin action functions — that already emitted a success outcome at `origin/main` HEAD but did not yet carry the new **executable** sink-spy success-branch proof in `tests/log/adminOutcomeBehavior.test.ts` (they were registry-verified only). The invariant-#10 behavioral-coverage assertion already forced EVERY new/non-grandfathered admin surface to ship a proof; this entry backfilled the frozen 30 so the grandfather set could shrink to zero.

</details>

---

## BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER — parse show-prefixed `<PREFIX> BREAKOUT N` room headers

**Status:** DONE (2026-07-06, feat/bo-show-prefixed-breakout) · **Severity:** low · **Class:** PARSER COVERAGE

**Resolved:** `boBlockRe` now admits an optional single UPPERCASE-alnum-token prefix; `splitRoomHeader` strips it case-sensitively; a prefixed-admission gate (`roomHasBoFieldValue`) requires positive BO-field content so header dims/floor alone cannot fabricate a room; `NEXT_ROOM_HEADER_RE` terminates a BO block on a prefixed header. The two RPAS BREAKOUT 1/2 headers now parse as `LASALLE A`/`LASALLE B` with their dims/floor/fields; the `dci-rpas-central` rooms baseline was regenerated (only that key). Spec `docs/superpowers/specs/2026-07-06-bo-show-prefixed-breakout-header.md`, plan `docs/superpowers/plans/2026-07-06-bo-show-prefixed-breakout-header.md`.

`parseBoRooms`'s `boBlockRe` (`lib/parser/blocks/rooms.ts:1020`) is `^\|\s*BREAKOUT`-anchored (case-sensitive), so it does **not** own a header that carries a show prefix before the `BREAKOUT` keyword — e.g. `RPAS BREAKOUT 1&#10;LASALLE A&#10;30' x 25' x 10.5'&#10;7th Floor` and `RPAS BREAKOUT 2&#10;LASALLE B…` in `fixtures/shows/raw/2025-03-dci-rpas-central.md:207,152` (both above real `BO Setup`/`BO Set Time`/… blocks). No other pass claims them either, so these two breakout rooms are **currently unparsed** (the fixture's baseline rooms contain only GS). Surfaced during the BO-venue-header-anchor review (Codex R1). The BO-venue-header anchor deliberately does **not** start parsing them (its substring ownership gate excludes any `BREAKOUT`-bearing header to keep the frozen corpus byte-identical). **Fix (when prioritized):** extend `boBlockRe` (or add a pass) to admit a `<optional prefix> BREAKOUT N <name> <dims> <floor>` header, deriving the room name from the non-prefix, non-BREAKOUT portion (`LASALLE A`); regenerate the room baseline and assert the two RPAS breakouts parse with their dims/floor/fields. Changes the frozen `origin-main-rooms.json` baseline for `dci-rpas-central`, so it is its own PR, not a rider.

---

## BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO — derive Step-3 override state from the durable row, not the preview

**Status:** ✅ RESOLVED 2026-07-17 · **Severity:** medium · **Class:** UI ROBUSTNESS (Opus-only + invariant-8 impeccable)

Shipped: the durable `pending_syncs.pull_sheet_override` is reduced (`coerceOverrideSnapshotFromRow`, finalize-parity) onto `Step3Row.pullSheetOverride` → `SectionCore.pullSheetOverride`, and `PackListBreakdown` derives override state from the durable snapshot compared against the preview via `overrideSnapshotsEqual`. On divergence it renders the S5 re-scan recovery block (no S2/S3 re-offer, so the loop cannot recur); the S5 Re-scan is frozen during publish runs via `Step3RunStateContext`. Plan `docs/superpowers/plans/2026-07-17-psat1-durable-override-dto/`. Original context below.

Step-3 (`components/admin/wizard/step3ReviewSections.tsx`) derives `overrideActive` solely from the persisted preview (`pr.archivedPullSheetTabs.some((t) => t.included)`), not from the durable `pending_syncs.pull_sheet_override` row. When an accept/revoke RPC commits but its best-effort follow-up re-scan fails (transient infra; route returns 200 on RPC success per §5.8 audit-before-re-scan), the durable override and the preview `included` flag diverge, so Step-3 re-offers S2 (accept, `expectedOverrideSnapshot: null`) → RPC row-state CAS 40001 → 409 → `router.refresh()` reloads the same stale envelope → loop (revoke-failure is the inverse stale-S3). Surfaced by whole-diff Codex review R2 on `feat/pull-sheet-archived-tab-override`. **Not a data or publication bug** — the override commits correctly and the Task-11 finalize gate (`STAGED_PARSE_OUTDATED_AT_PHASE_D`) fail-safes publication; only the recovery UX loops, and only on a re-scan infra failure. **Fix (when prioritized):** thread a `pullSheetOverrideActive: boolean` (from `pending_syncs.pull_sheet_override != null`) through the Step-3 DTO (`Step3SheetCard` → `SectionData`) and derive `overrideActive` from it; where durable-override and preview-`included` disagree, render the §5.8 "re-scan needed" divergent state ("gear saved; preview refreshing — reload to update") instead of S2/S3. UI is Opus-only + `/impeccable critique`+`audit` (invariant 8). Tracked in `DEFERRED.md` → PSAT-1.

---

## BL-AUTOAPPLIED-CARD-LAYOUT-E2E — real-browser width-distribution assertion for the auto-applied card button grid

**Status:** ✅ SHIPPED (2026-07-17) · **Severity:** low · **Class:** UI LAYOUT COVERAGE

The redesigned "Recently auto-applied" change card distributes Accept/Undo via CSS grid (`grid-cols-2` 1fr/1fr, or `grid-cols-1`) + `w-full` buttons. ~~The jsdom suite pins the mechanism; a real-browser pixel-width assertion is deferred.~~ **Shipped:** `tests/e2e/autoAppliedCardGrid.layout.spec.ts` (+ harness `_autoAppliedCardGridHarness.tsx`, in `standalone.config.ts`) renders the real `RecentAutoAppliedStrip` and asserts the 1fr/1fr split and the single==double+gap full-width invariant from measured button boxes only (no hardcoded pixel, no grid-class selector); negative-regression verified. See `DEFERRED.md` AUTOAPPLIED-REDESIGN-1.

---

## BL-AUTOAPPLIED-SINGLETON-FLATTEN — flatten card-in-card for single-change groups

**Status:** ✅ RESOLVED-BY-SUPERSESSION (2026-07-17) · **Severity:** low · **Class:** UI POLISH
A per-show group with one change renders a group-card wrapper around a single inner change-card (card-in-card). Consider dropping the inner border/padding when `rows.length === 1`. ~~Deferred: marginal gain, adds a render branch, matches the approved mock.~~ **Resolved:** `StripRow` now takes a `flatten` path — singleton groups flatten the inner row card (no card-in-card) while multi-row groups keep per-row cards; pinned green by `tests/components/admin/RecentAutoAppliedStrip.test.tsx` ("singleton group flattens the inner row card"). See `DEFERRED.md` AUTOAPPLIED-REDESIGN-2. (Verified live during the KINDDOT-1 ship; BACKLOG had drifted.)

---

## BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF — structured field-level From→To for field_changed

**Status:** ✅ RESOLVED (PR #453, 2026-07-17) · **Severity:** low · **Class:** FEATURE / DB WRITE-PATH
~~`field_changed` rows show a generic summary ("A field changed on this sync"); naming the field / showing its From→To needs structured before/after stored at write time (`writeAutoApplyChanges.ts`) — the DB write-path arc this read-only redesign excluded.~~ **Resolved:** shipped as REDESIGN-3. `field_changed` rows render a structured per-field list (MI-8 "cleared" note-only / MI-8b COI From→To / MI-8c "N cases removed" / **MI-9 role From→To**, existing-crew-only) stored on `show_change_log.after_image.fieldChanges` — no migration (freeform jsonb, `after_image` already selected), no `TriggeredReviewItem` widening, no old financial value stored. New `lib/sync/changeLog/fieldChanges.ts` (`buildFieldChangesRow` writer + `deriveFieldsDiff` reader, 500-entry read cap + forensic `AUTOAPPLIED_FIELDCHANGES_INVALID` warn); component renders all entries (no "+N more"), field name as the heading, all-malformed/corrupt → a visible "Unavailable" warning row. Spec + plan under `docs/superpowers/{specs,plans}/2026-07-17-autoapplied-field-structured-diff`. See `DEFERRED.md` AUTOAPPLIED-REDESIGN-3.

---

## BL-AUTOAPPLIED-COLLAPSED-KIND-HINT — surface change kind in the collapsed group header

**Status:** ✅ RESOLVED-BY-SUPERSESSION (2026-07-17) · **Severity:** low · **Class:** UI TRIAGE DENSITY
~~Collapsed-by-default group headers (per explicit user directive) show only showName + a bare count; the change kind (incl. a destructive "Removed") is hidden until expand.~~ **Resolved:** the collapsed `GroupSection` header now renders `KindDotCluster` — one dot per distinct change kind (incl. destructive "Removed") + an `aria-label` naming every kind, visible before expanding; pinned by `tests/components/admin/RecentAutoAppliedStrip.test.tsx` ("collapsed header shows a kind-dot cluster"). KINDDOT-1 (2026-07-17) then hardened the destructive dot with a shape-distinct minus-bar (non-color tell). See `DEFERRED.md` AUTOAPPLIED-COLLAPSE-1 + KINDDOT-1. (Verified live during the KINDDOT-1 ship; BACKLOG had drifted.)

---

## BL-DISCLOSURE-FAMILY-HEIGHT-MORPH — animate the disclosure family (accordions) at once

**Status:** ✅ RESOLVED-BY-SUPERSESSION (2026-07-17) · **Severity:** low · **Class:** UI MOTION / SYSTEM-WIDE
~~The dashboard disclosure components (`RecentAutoAppliedStrip` groups, `IgnoredSheetsDisclosure`, `AddAdminDisclosure`) all mount/unmount their panels instantly while the chevron animates~~; DESIGN.md lists "accordion expand" at `duration-normal`. **Resolved:** all three named disclosures now use the shared `components/admin/CollapsePanel.tsx` — a height-morph track (`grid-template-rows 0fr→1fr` over `duration-normal`, `inert`-when-closed, reduced-motion aware), so the whole family shares one animated idiom. (Other instant `{open ? … : null}` surfaces like `AppHealthIndicator`/`ReportModal` are a nav indicator + modal, outside this disclosure family.) See `DEFERRED.md` AUTOAPPLIED-COLLAPSE-2. (Verified live during the KINDDOT-1 ship; BACKLOG had drifted.)

---

## BL-DESTRUCT-ARMED-REFLOW — verify/fix armed morph label reflow under the finger at 360px

**Status:** RESOLVED (2026-07-17, branch `fix/destruct1-armed-reflow`) · **Severity:** medium · **Class:** UI MOBILE ERGONOMICS

The three two-tap guards (BulkIgnoreControls, PendingPanelDiscardButtons, StagedReviewCard) swap in a longer armed label, so the confirm hit-target can grow/wrap between tap 1 and tap 2 while a phone user's finger is already traveling. (`RescanSheetButton`'s G3 arm guard was withdrawn in PR #411 — it no longer arms — so the surface is three, not the four this row originally listed.) **Resolved:** real-browser measurement at 360px found only `PendingPanelDiscardButtons` relocates the target (armed label wraps to a new flex row); fixed by stacking its two discard buttons full-width `< sm` (`basis-full sm:basis-auto`) so the ignore box is stable across the morph. `BulkIgnoreControls` (right-edge pinned) + `StagedReviewCard` (left-edge pinned) measured benign, no change. Real-browser layout spec with negative control: `tests/e2e/pendingDiscardReflow.layout.spec.ts`. DEFERRED.md DESTRUCT-1. Spec `docs/superpowers/specs/2026-07-17-destruct1-armed-reflow.md`.

---

## BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD — lifecycle-guard the per-member picker-reset RPC + sweep sibling admin RPCs

**Status:** RESOLVED (2026-07-17) · **Severity:** low (pre-existing; admin-gated; defense-in-depth) · **Class:** DB SECURITY / RPC LIFECYCLE GUARD

**Resolution (2026-07-17):** (a) `reset_crew_member_selection` gained the byte-identical DEF-1 post-lock guard (archived/published/finalize-owned refusal); its JS boundary discriminates the P0001 lifecycle refusal from infra so no false `PICKER_SELECTION_RESET_INFRA_FAILED` is emitted. (b) The sibling sweep audited every crew/share-mutating SECURITY DEFINER surface against the live `pg_catalog`; the one further gap — `undo_change` — gained an archived + finalize-owned guard (structured `UNDO_SHOW_ARCHIVED` / `UNDO_FINALIZE_OWNED` returns, NOT published-gated; two new §12.4 codes). A `undoChange.ts` post-success read `{data,error}` invariant-9 swallow was fixed in passing. The whole class is pinned by the fails-by-default `tests/db/crew-rpc-lifecycle-guard-meta.test.ts` (GUARDED / EXEMPT / TRIGGER / PRIVATE_HELPERS registries). `publish_show`/`unpublish_show`/`validation_finalize_all_atomic` verified out-of-scope (no target-table mutation); the crew-auth link RPCs + `set_field_override` were confirmed dropped, not gaps. See spec `docs/superpowers/specs/crew/2026-07-17-rpc-crew-lifecycle-guard-design.md`.

`reset_crew_member_selection(p_show_id, p_crew_member_id)` (`supabase/migrations/20260703000001_reset_crew_member_selection.sql:16`) gates only on `is_admin()` — it has NO archived / published / finalize-owned lifecycle guard, unlike its lifecycle-aware siblings (`archive_show` carries a finalize-owned refusal; the published toggle refuses under finalize). It is therefore invocable against a read-only (archived/unpublished) or finalize-owned show, mutating `crew_member_auth` selection state on a show the admin UI presents as read-only. The consolidated per-show page fix (`app/admin/show/[slug]/page.tsx` — shareSlot serialization gate) stops the affordance being SERIALIZED into the RSC payload for ineligible shows, so this is no longer reachable through the rendered UI; the RPC itself remains a lifecycle-agnostic entry point via a direct PostgREST `rpc()` call. **Fix (when prioritized):** (a) add the `archived`/`published`/finalize-owned refusal to `reset_crew_member_selection` (mirror `archive_show`'s `readfinalizeowned_b2` + `shows.archived/published` checks under the per-show advisory lock, AGENTS.md invariant 2); (b) structural sweep of sibling admin picker/crew RPCs (`reset_picker_epoch`, `rotate_show_share_token`, and the crew-mutating SECURITY DEFINER set) for the same lifecycle-guard gap — enumerate each RPC × {archived, unpublished, finalize-owned} × has-guard, and pin the invariant with a meta-test. Trigger: next admin-RPC security pass, or a report of a reset/rotate landing on an archived show.

---

## BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT — rowTone renders notice-weight health codes red — ✅ SHIPPED

**✅ SHIPPED (branch `feat/bell-triage-severity-grouping`, 2026-07-17):** `rowTone` now returns `critical` only when `DEGRADED_HEALTH_CODES.includes(entry.code)`, else `notice` — so the 9 `audience:"health"` + `healthWeight:"notice"` codes render amber (Warning), matching the health rollup. `rowTone` moved to the new pure `lib/admin/bellTriage.ts`; the color-blind floor still holds (glyph SHAPE carries severity). Landed with its DEFERRED twin BELL-2 (triage grouping) in one PR, per the DEFERRED↔BACKLOG twin rule. Coverage: `tests/admin/bellTriage.test.ts` + `tests/components/bellPanelRedesign.test.tsx` (notice-health → Warning, not Critical).

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug §5, deferred to keep the change non-UI) · **Class:** UI (bell severity tone) · **Effort:** S (2-line fix + impeccable gate)

`BellPanel.tsx` `rowTone` short-circuits `if (entry.isHealth) return "critical"` BEFORE consulting `healthWeight`/`severity`, so EVERY notice-weight health code (SYNC_STALLED, WATCH_CHANNEL_ORPHANED, and the ~7 other `healthWeight: "notice"` codes) renders a red `CircleAlert` even though the health rollup treats them amber. Moot for `ROLE_FLAGS_NOTICE` after its health→doug reclassify (it is no longer `isHealth`), but latent for the rest. Fix: `if (entry.isHealth) return DEGRADED_HEALTH_CODES.includes(entry.code) ? "critical" : "notice"` (`DEGRADED_HEALTH_CODES`/`NOTICE_HEALTH_CODES` already exist, `lib/adminAlerts/audience.ts`). UI change → invariant-8 impeccable dual-gate applies. Trigger: next bell/health-panel UI pass.

---

## BL-MI9-LEAD-ROUTING-DIVERGENCE — auth-sensitive LEAD-bit routing (RESOLVED: ratified as auto-apply + audit)

**Status:** RESOLVED (2026-07-17, PR #439 `fix/mi9-lead-staging` merged) · **Severity:** was HIGH (security / authorization) · **Class:** AUTH ROUTING — resolved by ratification, not by restoring staging

**Resolution (owner option B, opposite of this entry's original "restore staging" proposal):** the owner ratified that a LEAD-bit change **AUTO-APPLIES** — it is a deliberate sheet edit (Doug typing/removing `LEAD`), not a parser guess, and severs no access. Instead of staging, the change is made **auditable**: every `role_flags` delta emits `ROLE_FLAGS_NOTICE` (`admin_alerts`, info severity) and a LEAD gain/loss additionally writes a durable failure-visible `LEAD_ROLE_APPLIED` audit `app_event` (forensic, recoverable via `observe events`). Ratified plan amendment #8 (`plans/…/00-overview.md:158-175`), master spec §6.8/§12.4/help copy, and `tests/sync/phase1.test.ts` were all reconciled to auto-apply in PR #439; the dead `MI-9_ROLE_FLAGS_DELTA` §12.4 code was retired to `RETIRED_CODES`. `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF` (REDESIGN-3) now **enriches** MI-9's auto-applied `field_changed` row (a role From→To entry) rather than treating it as out-of-scope. The original problem statement below is retained as history — its proposed "route MI-9 to staging" fix was **not** adopted.

---

_History (superseded — the fix below was NOT adopted; auto-apply was ratified instead):_

**Original framing — surfaced by REDESIGN-3 adversarial review R13/R21:**

The **canonical master spec** requires an MI-9 LEAD-bit set-membership change (crew member gains or loses `LEAD`) to **STAGE for admin approval** — LEAD grants ops + `shows_internal` financial access. Sources (all say STAGE): master spec §6.8 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1624` "Stage for approval", with the exact examples `['A1']→['LEAD','A1']` / `['LEAD','A1']→['A1']`); §12.4 (`:2862` `MI-9_ROLE_FLAGS_DELTA` → "Doug → review staged"); help copy (`:3155` "we hold every LEAD toggle for review"); ratified plan amendment #8 (`plans/…/00-overview.md:158-175`, 2026-05-09); M6 handoff (`plans/…/handoffs/M6-drive-sync.md:324`); Phase-1 test plan (`plans/…/06-drive-sync.md:66`).

**But the live code auto-applies it.** The "Phase 2 Task 2.1 decision rule" (`lib/sync/phase1.ts:504-511`, landed 2026-06-09 — a month after amendment #8) over-broadened to "MI-11 is the ONLY gated invariant; every other invariant auto-applies", sweeping MI-9 LEAD-bit into `outcome: "pass"` (auto-apply). `tests/sync/phase1.test.ts:807-849` **pins the wrong behavior** (asserts MI-9 LEAD-gain and LEAD-loss → `"pass"`). No document ratifies auto-apply; per invariant 7 (spec canonical) this is an **unratified divergence / security bug**: a LEAD promotion/demotion in a sheet currently grants/revokes ops+financial access silently, without the required staged admin review.

**Fix:** route MI-9 LEAD-bit items to the staging path so Phase-1 returns `outcome: "stage"` (whole parse to `pending_syncs`, Phase 2 not executed), per §6.8 + the drive-sync test plan ("Phase 1 returns `stage`; `pending_syncs` row exists; Phase 2 NOT executed"). Compose with the existing shrink-held (MI-6/7/13/14), MI-11 hold, debounce, and first-seen gates. Correct `phase1.test.ts:807-849` to assert `stage` for the MI-9 cases + add a dedicated MI-9-stages regression. Non-LEAD `role_flags` deltas stay auto-apply with `ROLE_FLAGS_NOTICE` (unchanged). **Blocks/precedes** `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF` (REDESIGN-3): once MI-9 stages it never reaches the auto-applied `field_changed` writer, simplifying that feature. Trigger: fix NOW per owner decision 2026-07-17 (chosen over shipping REDESIGN-3 first).

---

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup) — ALL THREE RESOLVED 2026-07-25

Closed by `share-link-chrome-backlog` (spec `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md`, plan `docs/superpowers/plans/2026-07-24-share-link-chrome-backlog.md`).

### BL-CREWPAGE-ROTATE-URL-FLASH — RESOLVED (built)

A one-shot cue now marks the crew-URL block when the share-token changes: a 2px `accent-edge` ring plus a brief `accent-tint` wash, 1600ms, no cue at all under reduced motion.

Two premises in the original entry had gone stale and were corrected before building. It named three surfaces to highlight; `ShareLinkBody` had been deleted by the share-hub consolidation and the other two were orphans, so exactly ONE live crew-URL surface existed — the ShareHub popover's row, which conveniently sits five rows above the rotate control that triggers it.

### BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE — RESOLVED BY DELETION

`ShareChip.tsx` and `CrewPageLink.tsx` were mounted by no production module and imported only by their own tests. Minting a `--spacing-*` token to describe dead code is worse than deleting it, so both components and both test files are gone.

**Recorded so it is not re-derived:** the item deferred itself on the grounds that "the same magic appears elsewhere". That was false against the live tree — `max-w-[16rem]` occurred exactly ONCE, in the file now deleted. There was no app-wide pattern to batch with.

### BL-CREWPAGE-ROTATE-FOCUS-MGMT — CLOSED, SUPERSEDED (zero code)

The requested fix — restoring keyboard focus after a rotate resolves — is a RATIFIED ACCEPTED RESIDUAL, not an open defect. `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:34` scopes C5 to cancel and auto-revert paths only; `:82` enumerates the submit-outcome matrix and names Rotate explicitly, accepting focus loss where the control is replaced by a status element, announced through the existing `role="status"`.

The cancel/auto-revert half the item also wanted was already shipped: C3 focuses the cancel button on confirm-open (`app/admin/show/[slug]/RotateShareTokenButton.tsx:115`), C5 restores the trigger (`:106`, `:126`).

**Recorded so it is not refiled:** this item asks for behavior a ratified spec deliberately declined. Reopening it means revisiting that spec, not implementing this entry.

## Picker-flow app bugs (3) — RESOLVED on branch `fix/picker-flow-app-bugs` (2026-07-25)

**All three shipped together**, each with the paired e2e stub un-skipped as its red phase, and the suite wired into `crew-e2e.yml` so the cases actually run in CI (they were dark for two independent reasons: the job named exactly one spec file, and `PICKER_COOKIE_SIGNING_KEY` was set in no workflow at all, so the suite would have crashed at setup rather than failing cleanly). That workflow's trigger was also inverted from `paths` to `paths-ignore` after six review rounds each found another missing entry in the allow-list, so the job now runs unless a change touches only prose no script reads (not `docs/`, which prebuild's manifest reads). It is still path-gated, not PR-blocking-capable: an interim claim that the specs became "PR-covered" was an artifact of the coverage scanner matching only `paths:`, which this branch fixed. Spec: `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md`; plan: `docs/superpowers/plans/2026-07-24-picker-flow-app-bugs.md`.

Two of the fixes differ from what these entries proposed, both for reasons review established:

- **BL-PICKER-BOOTSTRAP-HOST-FLIP** was swept as a class, not patched at the two named sites. The grep found **six** `new URL(..., request.url)` redirect expressions across four files, two of which build the URL through a local variable. All six route through a new `hostRelativeRedirect` helper, and an AST guard bans the shape under `app/`.
- **BL-PICKER-GATE-SKIP-MISMATCH**'s proposed fix was **rejected as insufficient**. Honoring `?gate=skip` on a cleared session reaches the picker exactly once: `google_mismatch` is decided before the picker cookie is ever consulted, so the very next request re-renders the gate. The shipped fix signs the browser out device-locally (`scope: "local"` — the library default is global and would revoke a colleague's other devices), after which the chain resolves to `first_contact` and the existing guard applies unchanged. `page.tsx` was not touched.
- **BL-PICKER-CLAIMED-ROW-NEXT-DROP** shipped as proposed: `next` rides a hidden input.

Original entries follow, verbatim.

PR #60 landed the picker-flow e2e (`tests/e2e/picker-flow.spec.ts`) with three `test.skip` stubs whose SKIP comments each say the blocker is **app behavior, not a helper/config gap**. PR #60's summary claimed these were "filed as follow-ups in BACKLOG.md," but no entries existed — the bugs lived only as `// SKIP:` comments and are still live. These three entries make the tracking honest. Do NOT un-skip the tests until the paired app fix ships; enabling a stub without its fix just re-surfaces a known red. (Each SKIP comment records a direct repro.)

### BL-PICKER-BOOTSTRAP-HOST-FLIP — bootstrap redirect canonicalizes 127.0.0.1 → localhost and drops the auth cookie

**Resolved on branch `fix/picker-flow-app-bugs` (2026-07-25).** See the section header above for what shipped differently from what this entry proposed.

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (blocks the authed picker-bootstrap leg; the host flip drops the host-scoped Supabase auth cookie) · **Class:** APP-BEHAVIOR BLOCKER

The authed leg redirects through `/api/auth/picker-bootstrap`, whose `NextResponse.redirect(new URL(nextOutcome.path, request.url), …)` (`app/api/auth/picker-bootstrap/route.ts:181,199`) canonicalizes the host `127.0.0.1` → `localhost` (`request.url` reports `localhost` even under `pnpm start -H 127.0.0.1`; `NEXT_PUBLIC_SITE_ORIGIN` does not influence it). That host flip drops the `127.0.0.1`-scoped Supabase auth cookie, so the revisit resolves to Mode A instead of `needs_picker_bootstrap` and the crew-shell never renders. Verified reproducing under both `pnpm dev` and `pnpm build && pnpm start`. **Fix:** emit a host-relative `Location` from the bootstrap redirect (app fix in `app/api/auth/picker-bootstrap/route.ts`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:77` ("first-contact gate -> tap 'Sign in with Google' -> OAuth happy path -> show body renders"; SKIP note at :68).

### BL-PICKER-GATE-SKIP-MISMATCH — "Continue as guest" can't reach the picker while an authed non-roster session persists

**Resolved on branch `fix/picker-flow-app-bugs` (2026-07-25).** See the section header above for what shipped differently from what this entry proposed.

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (a cleared-but-present session can't reach the picker via guest-skip) · **Class:** APP-BEHAVIOR BLOCKER

"Continue as guest" (`clearIdentityAndSkip`, wired at `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:96`) clears the stale picker entry, but the browser STILL carries the authed non-roster Google session, so the post-action resolve is `reason: 'google_mismatch'` (NOT `first_contact`); `page.tsx` honors `?gate=skip` only for `first_contact` (`app/show/[slug]/[shareToken]/page.tsx:25-28,77`), so the Mode B mismatch gate re-renders and `picker-interstitial-root` never mounts. Confirmed by direct repro: after the guest click the page stays on the Mode B gate (mismatch header still visible), not the picker. **Fix:** let the gate semantics reach the picker via `?gate=skip` when the session is present-but-cleared (app decision in `app/show/[slug]/[shareToken]/page.tsx` + `clearIdentityAndSkip`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:173` ("Mode B 'Continue as guest' atomically clears the stale entry and lands on the picker"; SKIP note at :164).

### BL-PICKER-CLAIMED-ROW-NEXT-DROP — claimed-row recovery GET form discards the `next` query param

**Resolved on branch `fix/picker-flow-app-bugs` (2026-07-25).** See the section header above for what shipped differently from what this entry proposed.

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (post-sign-in return target is lost on the claimed-row recovery path) · **Class:** APP-BEHAVIOR BLOCKER

The claimed-row recovery control is `<form action={signInRecoveryUrl} method="GET">` with NO hidden inputs (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:154`; `signInRecoveryUrl = /auth/sign-in?next=<encoded>` built at :86). On a GET submit the browser DISCARDS the action URL's query string and rebuilds it from the (empty) form fields, so the navigation lands on bare `/auth/sign-in` with no `?next=`. `waitForURL(/auth/sign-in\?next=/)` therefore never matches (final page is `/auth/sign-in` with no `next`). **Fix:** carry `next` as a hidden `<input>` rather than in the action query (app fix in `_PickerInterstitial.tsx`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:234` ("Deactivated row: tapping a claimed crew member redirects through /auth/sign-in"; SKIP note at :226).

---

## BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE — auto-resolve GITHUB_BOT_LOGIN_MISSING on successful bot auth

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3, DEFER row) · **Class:** DEFERRAL · **Effort:** S

The `GITHUB_BOT_LOGIN_MISSING` alert tracks that the bot login env is unset. Config state observable inside the M8 report pipeline, but the review discipline for report features requires live GitHub integration probes, so auto-resolution was deferred pending M8 shipping and validation-environment gates.

**Status:** ✅ RESOLVED — already shipped before this entry was revisited. `docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md` §6 superseded the DEFER row. The stated blocker did not apply: resolution is gated on an explicit env-presence read (`botLoginConfigured`, `lib/reports/botLoginAlert.ts:15`), not on "a submit succeeded", so no live-GitHub probe is needed. Two raw resolvers (the code is a NON_UPSERT producer deliberately excluded from the `AdminAlertCode` union, so the typed helper is unusable): `resolveBotLoginAlertRow` (`lib/reports/botLoginAlert.ts:45`, invoked by maintenance at `lib/notify/runNotify.ts:237-248`) and `resolveBotLoginAlertFailOpen` (`lib/reports/submit.ts`). Registry row is `class: "auto"` with both sites pinned (`tests/messages/_metaAdminAlertCatalog.test.ts:493-499`); behavioral coverage in `tests/reports/submit.botLoginResolve.test.ts` and `tests/notify/runMaintenance.botLogin.test.ts`. Confirmed live during `2026-07-24-alert-autoresolve-tile-and-report-family` §2.1, including independently by the cross-model reviewer.

---

## BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE — auto-resolve branch-protection alerts on policy sync

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3, DEFER rows) · **Class:** DEFERRAL · **Effort:** S

`BRANCH_PROTECTION_DRIFT` and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` track state of the GitHub branch-protection CI monitor. Both are raised outside app runtime (CI-side ops script), making auto-resolution look like a separate ops-pipeline concern.

**Status:** ✅ RESOLVED — already shipped by `docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md` D6 / §10. The bell spec ratified the conversion AHEAD of the workflow re-enable trigger deliberately: the bell surface makes premature manual resolution of these codes an attractive nuisance, so the manual button had to go even while the detector stays disabled. Resolver `defaultResolveAlerts` (`scripts/verify-branch-protection.ts:253`) with healthy-path call sites wired (`:361-379`); both codes `class: "auto"` with resolve sites pinned (`tests/messages/_metaAdminAlertCatalog.test.ts:502-513`); auto-clear copy at `lib/adminAlerts/audience.ts:118-122`.

**Residual (tracked, not blocking):** the resolver is dormant in CI. Its only producer runs in the `verify-branch-protection` and `verify-branch-protection-status` jobs, both `if: false` under the X6-D-1 solo-dev variant (`.github/workflows/x-audits.yml:443`, `:474`). Re-enabling those jobs is the one remaining step, recorded at `DEFERRED-archive.md:861`; it needs no further alert-side work. Full provenance: `DEFERRED-archive.md:853-862`.

---

## BL-ALERT-REPORT-FAMILY-AUTORESOLVE — evaluate manual-by-design posture for report-family incidents

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3, EVENT rows) · **Class:** DEFERRAL (evaluation) · **Effort:** S

The six report-family codes are incident notices and observational audit records, event-shaped by design. Revisit post-M8 if new incident classes emerge that blur the event/state boundary.

**Status:** ✅ RESOLVED as EVALUATED — **no change**. Full evaluation in `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md` §5. The entry asked for an evaluation; the answer is that the existing `event-manual` classification is correct for all six. Now guarded against silent drift by a named per-code test in `tests/messages/_metaAdminAlertCatalog.test.ts`.

Two auto-resolution designs were drafted and **rejected on evidence**, recorded so a future session does not re-derive them:

1. **Local anti-join (rejected, adversarial round 1).** Three of the six raise through a state-gated insert whose `SELECT` gate is a live predicate over `reports`, which makes them LOOK state-shaped. But they are raised only when a GitHub lookup has ALREADY returned `LookupInconclusive` (`lib/reports/submit.ts:771-819`), so the raise condition is a conjunction and the anti-join negates only the local half. `REPORT_DUPLICATE_LIVE_MATCHES` means multiple live GitHub issues share a marker; `REPORT_OPEN_ORPHAN_LABEL` means an open issue carries the orphan-cleanup label. Reaping the local report closes neither. Worse, flipping `resolution` to `"auto"` also suppresses the manual button, so the operator would lose both the signal and the control while the fix is still outstanding.
2. **Resolve on a fresh successful lookup (rejected, adversarial round 3).** `findIssueByMarker` IS a complete fresh check for one `idempotency_key`, and the alert context carries that key, so this satisfies same-instance and whole-condition. It fails **repeatability**: once `writeRecoveredIssueUrl` persists a URL, every later submit short-circuits as a duplicate before reaching the lookup (`lib/reports/submit.ts:1073-1075`). If GitHub's state changes right after the check, the alert is already cleared and nothing will ever look again — a permanent wrong answer with no re-raise path and no independent durable record.

**Durable rule extracted** (spec §3): a recovery observation may clear a row only if it identifies the same instance, re-evaluates EVERY conjunct of the raise condition, and is repeatable. A state-shaped LOCAL gate is not evidence that a code is state-shaped overall.

---

## BL-ALERT-TILE-RENDER-PER-TILE-KEYING — per-tile keyed auto-resolution for TILE_SERVER_RENDER_FAILED

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3) · **Class:** DEFERRAL · **Effort:** M

`TILE_SERVER_RENDER_FAILED` is state-shaped but has no aggregation point: the alert row is deduped per (show, code) with `context.tileId` replaced on re-raise, so tile A's success cannot prove tile B is healthy. A per-tile-keyed redesign closes this structurally but was believed to require a schema change.

**Status:** ✅ RESOLVED — shipped by `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md` §4. **No schema change was needed**: keying filters on the `context->>'tileId'` the row already carries, so the dedup index is untouched and no migration ships.

The entry's premise was also incomplete in a way that mattered. Keying on `tileId` alone is NOT sufficient, because permission gates live INSIDE the wrapped seam (`transportTileVisible`, `components/crew/sections/TravelSection.tsx:172-178`): different viewers execute different code for the same tileId, so a viewer who skips the failing path would clear an alert still live for the viewer who reaches it. Resolution is therefore keyed on the **(tile, observer)** pair, with `viewerKey = data.viewerId ?? "admin"`.

`WrappedSection` now records outcomes into a per-request ledger; `_CrewShell` owns that ledger and schedules one post-response sweep that raises for failed tiles and resolves clean ones for that observer only. The code is `hybrid`, not `auto` — catalog `resolution` stays `"manual"` so the button survives, because re-detection needs that specific observer to load the page again. Structural defense: `tests/crew/_metaTileProducerTopology.test.ts` bounds where sections may be constructed at all, which is what actually guarantees the ledger reaches the sweep. Row-state proof against real rows: `tests/db/tileAlertResolution.db.test.ts`.

---

## Test-safety hardening batch (3) — CLOSED on branch `test/safety-hardening-batch` (2026-07-25, PR #590)

Filed together under BACKLOG.md's §"Test-safety hardening (2026-07-05)", closed together, and graduated together on 2026-07-25. That section still holds its open remainder (`BL-PREPARE-INTERNAL-FAULT-KIND`, `BL-CRON-WORKBOOK-FAULT-CODE`, `BL-ROOM-DIMS-ONLY-NOVEL-HEADER`); `BL-SOURCE-NUL-BYTE-STEP3REVIEW` graduated 2026-08-02.

### BL-DBTEST-LOOPBACK-EVAL-GUARD — retrofit module-eval loopback guard onto pre-existing db tests

**Status:** CLOSED (2026-07-25, `test/safety-hardening-batch`) · **Severity:** low · **Class:** TEST SAFETY

**Shipped:** all 37 files reading `LOCAL_TEST_DATABASE_URL` now route it through `assertLocalDbUrl` (or `assertLocalDbUrlIfSet` for the one validation-capable suite, which is guarded on its LOCAL leg rather than exempted). The guard moved to the side-effect-free `tests/db/_localDbUrl.ts` and redacts DSN credentials. `tests/db/_metaLocalDbUrlGuard.test.ts` walks `tests/**` and fails any unguarded read, recognising bracket / parenthesized / `process["env"]` / aliased / destructured spellings; exempt set is empty and pinned by equality.

**Original report (historical — describes the tree BEFORE the fix above; its "Fix (when prioritized)" is superseded):** the finalize-resume-deadlock whole-diff R1 review surfaced (and fixed, for the 3 suites in that diff) a latent pattern shared by ~20 pre-existing `tests/onboarding/*.db.test.ts` files: `LOCAL_URL = process.env.LOCAL_TEST_DATABASE_URL ?? <loopback default>` is consumed by a probe `beforeAll` that opens `postgres(LOCAL_URL)` and sets `dbUp = true` BEFORE the loopback assertion (`expect(LOCAL_URL).toMatch(/127…/)`) runs in a later `beforeAll`. If `LOCAL_TEST_DATABASE_URL` is mispointed to a remote host (`TEST_DATABASE_URL` is the validation project), the probe connects remote and `dbUp` flips true; even when the later assertion throws, `afterAll`'s `if (dbUp)` teardown still issues DELETE/UPDATE against the remote. The default is loopback so this only bites on an explicit remote override, hence low severity. **Fix (when prioritized):** wrap each file's `LOCAL_URL` in `assertLocalDbUrl(...)` from `tests/db/_remediationHelpers.ts` (synchronous module-eval throw on non-loopback host, before any handle) — the proven pattern in `cleanupReapCrossSession.db.test.ts` + 7 others and now the 3 finalize-resume-deadlock suites. Consider a structural meta-test that fails any `*.db.test.ts` opening `postgres(...)` on a URL not passed through `assertLocalDbUrl`.

### BL-RESCAN-PREPARE-ERROR-GRANULARITY — distinguish parse vs Drive-fetch failure in re-scan fail-closed paths

**Status:** CLOSED (2026-07-25, `test/safety-hardening-batch`) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

**Shipped:** `prepareOnboardingFiles` throws a discriminated `PrepareOnboardingFileError`, classified by error IDENTITY first — `WorkbookSynthesisError` (new, tagged at `synthesizeMarkdownFromXlsx`) is a parse fault even when raised inside the Drive export, which no call-site rule can see. Both fail-closed sites map `kind:"parse"` to the EXISTING `STAGED_PARSE_FAILED` row (no new §12.4 code), and the live first-seen retry route was swept for the same conflation. The row's copy was rewritten path-agnostically under the three-way lockstep. Deliberately NOT reclassified: post-parse internal helper faults (see `BL-PREPARE-INTERNAL-FAULT-KIND`).

**Original report (historical — describes the tree BEFORE the fix above; its "Fix (when prioritized)" is superseded, and no new §12.4 code was needed):** both re-scan fail-closed catch sites — the finalize inline auto-heal (`app/api/admin/onboarding/finalize/route.ts`, the `prepareOnboardingFiles` try/catch) and the standalone `rescanWizardSheet` (`lib/onboarding/rescanWizardSheet.ts:127`) — map ANY `prepareOnboardingFiles` throw to `DRIVE_FETCH_FAILED`. Because `prepareOnboardingFiles` does export AND parse, a parser/schema failure or malformed-workbook fault is reported to Doug as a Drive fetch failure, and telemetry loses the export-vs-parse distinction. The recovery path is identical (both demote fail-closed to the re-apply page), so this is a wrong-reason/observability issue, not a correctness bug — surfaced by whole-diff R5. **Fix (when prioritized):** have `prepareOnboardingFiles` throw a discriminated error (e.g. `{ kind: 'drive_fetch' | 'parse' }`) and map each to a distinct §12.4 code at BOTH call sites (new code needs the full 3-way lockstep + CI touchpoints). Deferred to keep the two sites consistent and avoid a new catalog code mid-feature.

### BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS — deletion-safety Link guard misses helper-built hrefs

**Status:** CLOSED (2026-07-25, `test/safety-hardening-batch`) · **Severity:** low · **Class:** TEST COVERAGE

**Shipped:** the same-line predicate is replaced by four layers over `app/` + `components/` + `lib/` + `next.config.ts` + `app/**/*.mdx` — an occurrence allow-list pinned by position KIND (so a ratified comment cannot become code at an unchanged count), AST resolution of `<Link>`/`<a>` hrefs through helpers, arrow helpers, consts, object properties, `+`, `join()` and `concat()`, an assembled-literal scan, and a raw scan for MDX. Primitives live in `tests/admin/stagedPageRefScan.ts` and are exercised against synthetic sources.

**Original report (historical — describes the tree BEFORE the fix above; its "Fix (when prioritized)" is superseded):** the Step-3 consolidation deletion-safety guard (`tests/admin/step3DeletionSafety.test.ts`, the "no in-app `<Link href>` out to the retired staged page" test) matches only a literal `/admin/onboarding/staged/` substring on the SAME source line as `href`. A helper-built href (`href={buildStagedUrl(id)}` where the path lives in a const or is assembled elsewhere) could reintroduce a link to the retired staged page without tripping the guard — surfaced by whole-diff R5 (LOW). A blanket "path appears anywhere" scan is NOT a clean fix: the path is LEGITIMATELY referenced by the finalize race-row `re_apply_url` builder and the `next.config.ts` 307 redirect source (both ratified in spec §4.6 — they now 307 to /admin), so a stricter guard false-positives on those. **Fix (when prioritized):** a JSX-aware check that resolves `<Link>`/`<a>` href expressions (including one-hop helper returns) to a URL and asserts none resolve under `/admin/onboarding/staged/`, while allow-listing the ratified non-Link string references. Low value + false-positive risk mid-feature, so deferred; the literal same-line guard plus the retired-import guard already cover the common regressions.

---

## BL-SHAREHUB-ARM-VIEWPORT-REVEAL — armed Archive confirm unreachable inside the overflow-clip modal panel

**Status:** ✅ RESOLVED — `feat/sharehub-archive-copy-reveal` (2026-07-24; spec `docs/superpowers/specs/2026-07-24-sharehub-viewport-popover-and-archive-copy.md`). · **Severity when open:** HIGH (was filed MEDIUM) · **Class:** clipped-overlay content stranding — the same class as `BL-HOVERHELP-PORTAL`, which the share hub was never migrated for.

**The original entry was wrong in two ways, both corrected here by measurement.**

It said the operator "CAN reach them by scrolling the modal panel manually (band and popover move up with it)". They cannot: `[data-review-modal-panel]` is `overflow: clip` (`components/admin/review/ReviewModalShell.tsx:623`), which is NOT a scroll container. It reports a `scrollHeight` (1854) larger than its `clientHeight` (476) — which is why it read as scrollable — but assigning `scrollTop` is a no-op, asserted directly by the probe (`panelIsScrollContainer: false`; a manual `scrollTop += overshoot` left it at 0). No ancestor between the popover and the viewport scrolls either: `body` is `overflow: hidden` under the modal scroll-lock and the wrapper is `fixed inset-0`. The popover's own scroller is the only one that exists, and its scrollport bottom is itself off-screen, so its last 108-261px of content is unreachable at ANY scroll position.

It also said "short phones". Measured unreachable at 390x844, 740, 667, 620 and 560 — every height swept, including the project's default mobile viewport. The geometry is structural, not viewport-specific bad luck: the hub anchor sits a constant 347px below the panel top, so fitting requires `347 + popoverHeight <= 0.85 * vh`, i.e. `vh >= 973px` while the 30rem cap binds, and never at all below 686px where the cap is 70vh.

So a destructive control could be ARMED and then neither confirmed nor cancelled (Cancel sits in the same off-screen band; Escape still dismissed).

**Fixed by** migrating the hub popover to the portal + `lib/popover/position.ts` placement stack already shipped for `HoverHelp`, rather than writing new placement math. Reachability at all five heights, plus containment, side selection, caret, focus and the armed-resize case, are pinned in `tests/e2e/admin-lifecycle-layout.spec.ts`.

---

## BL-TEST-PG-CLIENT-TEARDOWN — leak-proof postgres.js clients in DB tests (WITHDRAWN 2026-07-24, measured)

**Graduated:** 2026-07-25. Withdrawn on `fix/test-pg-client-teardown-stale` (PR #589), which is where the measurement below was taken and where the replacement guard `tests/cross-cutting/db-test-connection-hygiene.test.ts` landed. A withdrawal is a graduation: the entry left the open queue.

**Status:** WITHDRAWN — the premise did not survive measurement. Superseded by the structural guard at `tests/cross-cutting/db-test-connection-hygiene.test.ts`. Do not implement the `makeTestSql` migration described below; it is recorded only so a future reader does not re-derive it.

**What the entry claimed.** ~55 test files create module-level `postgres(DB_URL, { max, prepare: false })` clients with no `idle_timeout` and no `.end()`; since postgres.js leaves `idle_timeout` `null` (never auto-close), those pools hold their connections for the whole serial DB run and can exhaust local Postgres `max_connections` (~100) after a long session, surfacing as spurious "too many clients" failures on untouched code. The proposed fix was a shared `tests/db/testSql.ts` → `makeTestSql()` factory with `idle_timeout` plus an `endAllTestSql()` teardown, migrating ~55 files, hand-auditing the advisory-lock/concurrency tests that deliberately hold a connection, and a meta-test banning direct `postgres(` calls.

**What is actually true.** The counts were an artifact of `grep postgres(`, which matches both the loopback-guard regex literals several helpers declare (`/^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])/`) and mentions in comments. An AST walk gives the real figures: **155 constructions across 121 files**, 86 of them (64 files) with no `idle_timeout`, and **106 module-scope constructions across 101 files**. All 106 are bound to a name (102 declared and initialized in one statement, 4 assigned to a binding declared earlier), and **60 of them — across 59 files — are never `.end()`ed on that binding** — overwhelmingly the `probe` client DB tests open to read state back. So the entry was right that many clients are never explicitly closed. It was wrong about what happens next.

**The stated mechanism cannot fire.** Vitest runs each test file in its own worker and terminates that worker when the file finishes, closing its sockets — this is what `isolate: true` (the default) means, and it holds for the threads pool as much as for forks. Verified with a 3-file probe recording `process.pid`: 3 distinct pids. Note this is not a strict hand-off — vitest begins a worker's termination without awaiting it before scheduling the next file, so a slow-exiting worker can briefly overlap its successor. What it rules out is connections persisting across the run, not every instant of overlap.

A second reason the fear was misplaced: **postgres.js opens connections lazily.** `max: 6` is a ceiling, not a preallocation — a client running one query at a time holds one connection. So even the pools that exist are far smaller in practice than their configured maximum.

**Measurement (2026-07-24).** Full `pnpm test` — 1603 files, 17198 tests, 692s — sampling `pg_stat_activity` every 0.25s (2256 samples), filtering on `application_name = 'postgres.js'` (postgres.js 3.4.9 sets that by default at `node_modules/postgres/src/index.js:485`):

|                                   |             |
| --------------------------------- | ----------- |
| `max_connections` (local)         | 100         |
| Baseline backends / of them pg.js | 28 / 0      |
| Peak total backends               | 30          |
| **Peak held by postgres.js**      | **5**       |
| Mean pg.js while any were open    | 1.7         |
| Trend, first vs last third of run | 0.02 → 0.12 |

The trend matters more than the peak here: accumulation is a claim about growth over time, and a peak is a single sampled instant. Both thirds sit near zero and the difference between them (0.10 backends) is far below the ~5 a single file reaches, so the series carries no signal of accumulation — with means this close to zero, that is the whole of what it supports, not a growth rate and not literally "no growth". postgres.js backends were open in only 175 of 2256 samples, and no sample exceeded 5.

**Scope of what this establishes.** One execution, under the current config, on one machine. It rules out persistent cross-file accumulation — the mechanism the entry named. It does not measure the suite under `--fileParallelism`, under a future `isolate: false`, or running concurrently with other worktrees against the same Postgres, all of which are outside the withdrawn entry's claim but inside the space of things that could exhaust a pool.

An earlier pass at this measurement filtered on an EMPTY `application_name` and reported "peak 6" — those were background processes, which is why the figure sat at a constant 6 including at idle. The sampler's attribution was then validated directly: a file using the `max: 6` pool in `tests/db/_holdsHelpers.ts:47` shows up as 1-2 `postgres.js` backends, not 6, confirming both the filter and the lazy-connection behavior above.

A 64-file `idle_timeout` sweep would have bought nothing against these numbers, at the cost of churn plus real risk of dropping a held connection mid-test in the advisory-lock, deadlock, and concurrency tests — the files that deliberately hold a connection open across statements. (An earlier draft put that at "26 files" from an ad-hoc grep; the number is not reproducible from any stated classifier, so it is dropped rather than restated.)

**What replaced it.** The measurement holds only while the isolation does. `tests/cross-cutting/db-test-connection-hygiene.test.ts` reads the **resolved runtime config**, not the authored one: `isolate` directly, and file parallelism via `maxWorkers === 1` (the worker config does not carry `fileParallelism`, and a CLI `--fileParallelism` or `VITEST_MAX_WORKERS` is applied after project options — so a config-file check alone reads `false` while the run is concurrent). It also asserts the authored `serial.fileParallelism`, and scans `package.json`, workflow YAML, and every file under `scripts/` for any MENTION of the isolation knobs.

That scan deliberately does not parse values. Three rounds of matching harmful spellings precisely lost in both directions — `--isolate  false` with two spaces, `=+2`, `=0` and `=foo` (which `Number.parseInt` turns into 0/NaN and vitest resolves to default parallel workers) all evaded it, while benign `01`, `1e2`, and `--fileParallelism false` were wrongly rejected. A bare token scan cannot be beaten by a spelling, and when it fires wrongly it fires loudly. There are zero occurrences in those files today, so it costs nothing until someone reaches for a knob. Every file under `scripts/` is read regardless of extension, since an extension allowlist fails open for each launcher format it does not list.

Verified by 23 mutation injections — 22 turn the guard red, and the one that must not (a whole-line comment mentioning the flags) stays green. Each injection is checked for having actually landed before its result is read, after one silently-non-applying substitution produced a "green" indistinguishable from a guard failure.

An AST census of unclosed clients was tried and removed. It could not do its job: a wrapper teardown (`afterAll(() => closeSql(sql))`) leaves the count unchanged though the clients are genuinely closed, and moving construction behind a factory collapses it though nothing was closed — so it could neither confirm nor deny that the invariant still had subjects, while catching none of the configuration regressions the assertions do catch. The subject count above is a measured fact with a date on it, not something to re-derive on every run.

If disabling isolation ever becomes desirable, the `makeTestSql` work above becomes necessary again — that is the real trigger, not a connection count.

**`db:reset-pool` stays.** This measurement removes the DB test suite as the explanation the entry gave; it does not establish what the cause is, and it does not clear the suite under configurations it did not run. The plausible remaining source is concurrent load — one local Postgres shared across worktrees, dev servers, and `psql` sessions, on top of a baseline that is already 28 of 100 with no tests running — but that was not measured here.

---

## Nullcode batch-2 residual sweep — one item closed as obsolete

### BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — quiet-link affordance family: no SR new-tab announcement

**Graduated:** 2026-07-25. Shipped on `fix/newtab-announcement-family` (PR #592) — 21 previously-silent external links now announce, three WCAG 2.5.3 label-in-name failures fixed, and a per-anchor AST guard keeps the family closed.

**Status:** CLOSED — shipped 2026-07-25 in PR #592 · **Severity:** low · **Class:** A11Y / RESPONSIVE

**Both halves are now done.** The tap-target half landed earlier (`min-h-tap-min`); the announcement half shipped as PR2 of the residual sweep. All 21 unannounced external anchors now announce, via a single `components/shared/NewTabHint.tsx` primitive (11 Group A sites), an extended `aria-label` (6 Group B sites), or an `action.external`-gated hint (4 Group C sites). Three WCAG 2.5.3 label-in-name failures found along the way were fixed too. A per-anchor TSX AST guard (`tests/styles/_metaNewTabAnnouncement.test.ts`, scanner in `_newTabScan.ts`) fails by default on any new external anchor — it has already caught one added by a sibling session mid-rebase. Close-out, including the impeccable dual-gate findings and dispositions, is in `docs/superpowers/handoffs/2026-07-25-newtab-announcement-handoff.md`. Two P3 residues are tracked in `DEFERRED.md` › `NEWTAB-A11Y-RESIDUE-1`.

The original analysis is kept below for provenance.

**Tap-target half is DONE.** The quiet-link affordance now carries `min-h-tap-min` (`components/admin/PerShowActionableWarnings.tsx:281`, the "Open in Sheet ↗" anchor), so the venue-floor thumb-target complaint no longer applies to it.

**New-tab-announcement half is still open, and the original path citations are stale.** `components/admin/PerShowAlertSection.tsx` no longer exists; the per-show alert action link now flows through the per-code registry `lib/adminAlerts/alertActions.ts`. Its three resolver call sites are `lib/admin/attentionItems.ts:307` (`resolveAlertAction`), `lib/admin/bellFeed.ts:133` (`resolveAlertActions`), and `components/admin/telemetry/HealthAlertsPanel.tsx:83` (`resolveAlertAction`) — but they reach **four** renderers, not three: `attentionItems.ts:307` feeds both `review/AttentionBanner.tsx:165` and `showpage/AttentionMenu.tsx` (which reads `item.alert.action` at `:183` and renders it at `:208-218`), while `bellFeed.ts` feeds `BellPanel.tsx:304` and the panel call feeds `HealthAlertsPanel.tsx:149`. The card shell itself is `components/admin/CompactAlertCard.tsx` (consumers: `NoteWarningCard.tsx:93`, `PerShowActionableWarnings.tsx:305`, `review/AttentionBanner.tsx:238`, `telemetry/HealthAlertsPanel.tsx:179`). `components/admin/showpage/StatusStrip.tsx` is NOT a consumer — it only carries the `#share-access` destination the registry links AT, and its sole textual match on `alertActions` is a comment at `:191`. So this is a wider family than the two surfaces the item named.

The defect: an external quiet link marks its `↗` `aria-hidden` (`PerShowActionableWarnings.tsx:283`) with no accessible-name suffix, so a screen reader hears "Open in Sheet" and never learns the link leaves the page. Two sites carry the established convention — an `aria-label` naming both destination and behavior (`wizard/Step3SheetCard.tsx:152`, `wizard/VenueMapTile.tsx:138`, e.g. `aria-label="Open the venue in Google Maps (opens in a new tab)"`). Note `rg "opens in a new tab" components/` returns **three** lines, not two: `Step3SheetCard.tsx:138` is a comment, not an accessible name.

**Census — count `_blank`, NOT `target="_blank"` (corrected 2026-07-25).** The literal-attribute grep finds 18 anchors across 12 files, but the real total is **22 across 16 files** (`grep -rn '_blank' components/`). The four it misses are the ones this item most cares about: the registry action renderers spread the attribute conditionally —

```
{...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
```

— at `review/AttentionBanner.tsx:165`, `BellPanel.tsx:304`, `telemetry/HealthAlertsPanel.tsx:149`, and `showpage/AttentionMenu.tsx:211-213`. So **20 of 22 carry no announcement**, and a structural guard written against the literal attribute would leave the alert-action family — the exact subject of this item — unguarded. Any meta-test here MUST match the dynamic spread form too.

Whether each of the 20 is a real defect or a deliberate omission (crew-facing `SourceLink`, an already-labelled parent, the `aria-label={alt}` nameless-link guard at `step3ReviewSections.tsx:3575-3577`) is the scoping question the fix answers per site.

**Fix:** one family-wide pass applying the existing `aria-label` convention to every `target="_blank"` anchor that lacks it — not per-call-site divergence, and not a new mechanism when two surfaces already model one. Worth a structural meta-test asserting every `target="_blank"` in `components/` has either an `aria-label` containing "opens in a new tab" or an inline exemption, so the class closes instead of regressing. UI diff → invariant-8 impeccable dual-gate applies.

### BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC — WATCH_CHANNEL_ORPHANED renders a raw provider error string in the admin banner

**Graduated:** 2026-07-25. Closed as obsolete during the residual-sweep on `docs/nullcode-batch2-residual-hygiene` (PR #587) — nothing implemented it; the surface it described had already been deleted.

**Status:** CLOSED — OBSOLETE (verified 2026-07-24) · **Severity:** low · **Class:** INVARIANT-5 / UI COPY

**Closed because the rendering surface no longer exists.** The item described the `WATCH_CHANNEL_ORPHANED` expanded panel rendering `context.error_message` verbatim inside a `<code>` block in `components/admin/AlertBanner.tsx`. `AlertBanner.tsx` was deleted when the bell replaced it (`67ce6d082` — "feat(admin): mount bell in both chromes; retire AlertBanner (spec §7.1/§8)"), and the raw-string block did not survive the port: `rg error_message components/` matches nothing, so there is no user-visible render of the provider string on any surface. The invariant-5 tension the item recorded (raised as R9 F17 in the 2026-07-04 at-a-glance-identity Codex review) is therefore resolved incidentally, not by a deliberate fix.

Where the raw string still flows, and why that is in-policy: the field is `admin_alerts.context.error_message`, and its ONLY remaining consumer is `lib/drive/watchEscalation.ts:155`, which reads it into the escalation **email** body sent to configured admin recipients. Invariant 5 governs user-visible UI copy; an operator escalation email to the people who administer the Drive connection is the debug-only affordance the original item proposed keeping.

**Do not confuse this with `last_error_message`, which is a different field on a different table.** `pending_ingestions.last_error_message` carries parse/sync failure detail, written at **four** `insert into public.pending_ingestions` sites across three files: `lib/sync/applyStaged.ts:662` (wizard partition) and `:799` (live partition), `runScheduledCronSync.ts:1005`, `runOnboardingScan.ts:474`. The observe CLI reads it at `lib/observe/query/failures.ts` — the executable binding is `.from("pending_ingestions")` at `:31` and the redaction is `sanitizeIdentityString(r.last_error_message, …)` at `:61`; `:11-12` is only the projection string. The dev-tier fixture harness reads it at `app/admin/dev/actions.ts:325-327` (`.schema("dev").from("pending_ingestions")`, projection at `:329`), where the selected value is typed at `:342` but not rendered downstream. Raw display is prevented by the shape of `resolveIngestionCopy` (`lib/admin/needsAttention.ts:178-200`) plus caller discipline — not by a check, and **not** by a two-field boundary: its signature takes `code`, `driveFileName`, AND an optional `genericFallback?: string` that several branches return verbatim (`const generic = input.genericFallback ?? GENERIC_INGESTION_COPY; if (!code) return generic;`). No caller passes anything but an authored constant today, so there is no live leak, but the invariant-5 safety here rests on that caller discipline — a future caller forwarding a raw message through `genericFallback` would defeat it. `:163-168` is the JSDoc documenting the intent, not an executable guard. It has nothing to do with `WATCH_CHANNEL_ORPHANED`, and the `shows` table has no such column at all — its sync-failure column is `last_sync_error` (`supabase/migrations/20260501000000_initial_public_schema.sql:24`). `lib/adminAlerts/alertIdentityMap.ts:118` still carries a stale comment referring to "the pre-existing `error_message` `<code>` block" — harmless, but it is the one remaining reference to the retired surface.

**If the escalation-email exposure is ever re-scoped as a problem, file a new item** — this one is closed against a surface that is gone, and reopening it would re-argue a render path that no longer exists.

---

## Shipped 2026-07-26 — PR #604 (`fix/destruct-thumb-order-drift-guard`)

All three rows below shipped. `BL-DESTRUCT-CONFIRM-COPY-HARMONIZE` and
`BL-DESTRUCT-BULK-UNDO-SUCCESS-STATUS` had in fact been implemented on 2026-07-17 and
were never closed; `BL-DESTRUCT-STACK-THUMB-ORDER` is what PR #604 fixed. Resolution
detail is in `DEFERRED-archive.md` under `DESTRUCT-4`. Entries are reproduced **intact**
below, per this repo's archive contract.

## Destructive-confirm family (2026-07-16/17, destructive-confirm-pass + destruct1-armed-reflow)

### BL-DESTRUCT-STACK-THUMB-ORDER — reconsider destructive-vs-safe order when the pending discard buttons stack

**Status:** OPEN (2026-07-17, destruct1-armed-reflow impeccable critique P2) · **Severity:** low · **Class:** UI MOBILE ERGONOMICS

When `PendingPanelDiscardButtons` stacks full-width `< sm` (DESTRUCT-1 fix), the irreversible "Permanently ignore" sits BELOW the safe "Defer until modified" — i.e. nearest a resting thumb (impeccable critique P2, persona Casey). Mitigated already by the two-tap arm→confirm guard + 4s auto-revert. NOT fixed in the DESTRUCT-1 branch because the obvious fix (a `< sm` visual reorder) is a trap: a CSS `order` flip desyncs DOM/visual order on a destructive control (WCAG 2.4.3 focus-order regression) and would also flip the conventional Defer-left / Ignore-right at `≥ sm`; a DOM reorder fixes the stacked case but breaks the side-by-side order. A real fix needs either a breakpoint-forked render (two DOM orders) or a deliberate spacing/affordance change, weighed against the guard already covering the mis-tap. Trigger: next admin mobile pass, or a venue-floor mis-tap report on this specific control.

### BL-DESTRUCT-CONFIRM-COPY-HARMONIZE — harmonize confirm-label grammar + auto-revert timing across destructive surfaces

**Status:** OPEN (2026-07-16, destructive-confirm-pass) · **Severity:** low · **Class:** UI CONSISTENCY

Morph guards say "Confirm: X" while panel confirms say bare "Confirm revoke|reset|rotate|dismiss"; panels auto-revert at 3s (`AUTO_REVERT_MS`) while guards + Archive use 4s (`ARM_REVERT_MS`). One grammar + one timing constant across all 11 recipe surfaces. DEFERRED.md DESTRUCT-2. Trigger: next destructive-surface polish pass.

### BL-DESTRUCT-BULK-UNDO-SUCCESS-STATUS — announce bulk-undo full success to screen readers

**Status:** OPEN (2026-07-16, destructive-confirm-pass) · **Severity:** low · **Class:** UI A11Y

`RecentAutoAppliedStrip` renders the aggregate outcome only when `failed > 0`; an all-success bulk undo self-heals visually (rows drop on revalidate) but emits no `role="status"` confirmation for SR users. Net-new affordance beyond spec §6 F2's ratified failure-only alert. DEFERRED.md DESTRUCT-3. Trigger: bundled with BL-DESTRUCT-CONFIRM-COPY-HARMONIZE or an SR-user report.

---

## BL-WATCH-RECONCILE-BACKOFF — backoff state for watch channels — ✅ RESOLVED (2026-07-27)

**Status:** ✅ RESOLVED (2026-07-27) · **Severity:** low · **Surfaced:** watch-channel-health brainstorming (2026-07-01) · **Re-scoped:** 2026-07-25 · **Unblocked:** 2026-07-26 · **Shipped:** `feat/watch-reconcile-backoff` (PR #620)

**Resolved by** the `feat/watch-reconcile-backoff` PR: migrations `supabase/migrations/20260727000000_drive_watch_reconcile_state.sql` + `supabase/migrations/20260727000001_reschedule_refresh_watch.sql`, spec `docs/superpowers/specs/observability/2026-07-26-watch-reconcile-backoff-v2-design.md` (v2 — constants and cadence re-derived on the post-lifecycle tree, per the unblock note), plan + close-out at `docs/superpowers/plans/2026-07-26-watch-reconcile-backoff/`. Ships the full ratified Option-C scope: 15-minute `fxav_cron_refresh_watch` cadence (`7,22,37,52 * * * *`), the `drive_watch_reconcile_state` table with the `watch_backoff_ms` SQL ladder, write-iff-attempt bookkeeping inside `subscribeToWatchedFolder` (reconcile + admin Retry opt in; refresh and onboarding never touch the ladder), duration-based escalation (`ESCALATION_AFTER_MS`, 3h), and field-split surfacing (Doug: next-attempt line on bell + Settings; developer: observe CLI columns + telemetry deep link). The retained 2026-07-24 design stays DEFERRED as the analysis record. Residuals unchanged: `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED` still parameterises every timing claim; `BL-WATCH-DRIVE-CALL-TIMEOUT` stays NARROWED.

Original entry follows for provenance:

Approach B from `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md` §2/D1: a `drive_watch_reconcile_state` table (attempts, `next_attempt_at`, last error class) plus exponential backoff and a faster reconcile cadence.

**The lease half already shipped separately** as `docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md` — that was the measured defect (every channel taking Google's 1-hour default and being renewed at the instant it expired, ~1 second of slack). It is not part of this entry any more.

**Why this half is blocked.** Five adversarial rounds (~55 findings, every checkable claim verified against the live tree) established that backoff cannot be built correctly on the current watch subsystem. The full design work, including round-by-round disposition tables of what was tried and why each attempt failed, is retained at `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (status DEFERRED). Start there rather than re-deriving.

**Unblocked 2026-07-26 (still OPEN, and its prescriptions still need re-deriving).** All four prerequisite entries below were fixed by the watch-renewal-lifecycle PR, and the decisive one is cleared: refresh no longer retries an expired folder at all (the reap removes it from the renewal query) and no longer touches a non-configured one, so **reconcile's `!live` branch is now the single retry surface** — precisely where a ladder attaches. Note `BL-WATCH-DRIVE-CALL-TIMEOUT` was NARROWED rather than closed: the credential fetch is still unbounded, so any timing claim a ladder makes is still parameterised by something unenforced. The constants and cadence in the retained design were falsified across five rounds and must be re-derived, not resumed.

The original blocker analysis, for context: refresh, not reconcile, was the dominant retry path, and it was ungated. A ladder attached to reconcile therefore cannot deliver backoff at all. Fix all four entries below first — including `BL-WATCH-DRIVE-CALL-TIMEOUT`, which is a prerequisite for any timing claim a backoff ladder would make. (This read "the three" while enumerating four; whole-diff R10.)

## Watch renewal lifecycle — reap, folder scope, atomic alert (2026-07-26) — ✅ RESOLVED

**Resolved by** the `fix/watch-renewal-lifecycle` PR: migration `supabase/migrations/20260726000000_drive_watch_expired_status.sql`, spec `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md`, plan `docs/superpowers/plans/observability/2026-07-26-watch-renewal-lifecycle.md`.

Three of the four watch entries that blocked `BL-WATCH-RECONCILE-BACKOFF`. The fourth, `BL-WATCH-DRIVE-CALL-TIMEOUT`, was NARROWED rather than closed and stays in the live queue: the Drive requests are bounded but the `GoogleAuth` credential fetch is not, so its caller-visible symptom remains reproducible. Two residuals were filed at the same time — `BL-WATCH-PROMOTION-ACTIVATION-RACE` and `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED`.

## BL-WATCH-EXPIRED-ACTIVE-ROW — a failed renewal leaves the old channel active forever, retried on every tick

**Status:** CLOSED 2026-07-26 by the watch-renewal-lifecycle PR. The reap retires dead rows to a new `expired` status (and invalid leases to `superseded`, because their Drive channel may still be live) before the renewal query runs, so they leave that query and enter GC. See `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.1.

When a renewal fails, `markWatchOrphanedWithTx` marks only the **newly inserted pending** channel orphaned. The old channel keeps `status='active'` past its `expires_at`, and the renewal query (`listRenewalDue`, which selects `status='active'` rows whose remaining life is inside the renewal lead) keeps returning it **forever**; GC only collects `superseded`/`orphaned`, so nothing ever cleans it up. Line numbers are deliberately omitted: this entry outlives any particular revision, and the method was renamed from `listExpiringActive` by the lease-slack PR.

Result: refresh re-attempts that folder on every cron tick indefinitely — currently 24 futile `files.watch` calls/day per stuck folder, and 96/day at any 15-minute cadence. **Repro:** force a renewal failure, then observe `drive_watch_channels` retaining an `active` row with `expires_at` in the past while `DRIVE_WATCH_RENEWAL_FAILED` repeats hourly. **Fix direction:** on renewal failure, transition the old row out of `active` (orphaned or a new `expired` state) so it leaves the renewal query and enters GC — being careful that the partial unique index `drive_watch_channels_one_active_per_folder_idx` and the supersession-in-activation path still hold.

## BL-WATCH-ALERT-RAISE-NOT-ATOMIC — the alert raise is not in the transaction it appears to be in

**Status:** CLOSED 2026-07-26 by the watch-renewal-lifecycle PR. `PostgresWatchTx.upsertAdminAlert` now issues the canonical RPC over the enclosing transaction's own connection, so the alert and the channel mutation commit together. See `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.4.

`PostgresWatchTx.upsertAdminAlert` looks like a transaction-port method but calls the standalone service-role helper (`lib/drive/watch.ts:189-194`), which constructs its own Supabase client and issues an RPC over a **different connection** (`lib/adminAlerts/upsertAdminAlert.ts:47-52`) — outside the surrounding `sql.begin` (`lib/drive/watch.ts:315-318`). The alert can commit while the channel mutation rolls back, or vice versa.

Nothing shipped depends on that atomicity today, which is why this is not urgent — but any design that infers "is the watch healthy" from alert state versus channel state has a window, which is what round 4 discovered. **Fix direction:** route the alert upsert through the same `sql` transaction (the RPC can be called via the pg connection), or document the non-atomicity at the call site so future designs do not assume it.

## BL-WATCH-ALERT-FOLDER-SCOPE — the global watch alert cannot describe which folder failed

**Status:** CLOSED 2026-07-26 by the watch-renewal-lifecycle PR. Refresh renews only the configured folder (fail-closed on a failed settings read), and promotion supersedes the prior folder's channels — so the alert can only ever describe the folder in use. See `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.2 and §3.2.4; the residual concurrent-promotion window is `BL-WATCH-PROMOTION-ACTIVATION-RACE`.

`WATCH_CHANNEL_ORPHANED` is global — one unresolved row for the whole system (`show_id IS NULL`, `admin_alerts_one_unresolved_idx`, `supabase/migrations/20260501001000_internal_and_admin.sql:279-280`) — and carries no folder identity. Meanwhile `refreshWatchSubscriptions` renews **every** active channel without consulting `app_settings` (`lib/drive/watch.ts:196-210`), and folder promotion supersedes nothing (`app/api/admin/onboarding/finalize-cas/route.ts:779-804`). So after a folder switch, an old folder's renewal failure raises an alert that describes the _current_ folder, and escalation reports the current folder's name for a failure that happened elsewhere.

## **Fix direction:** either scope the alert per folder (context key plus dedup change) or have refresh skip channels whose folder is not the configured one, letting old-folder channels expire naturally.

## BL-STANDALONE-CONFIG-CI-DARK — the standalone real-browser specs run in no CI job — ✅ RESOLVED (2026-07-26)

**Status:** CLOSED 2026-07-26 (PR2 of the CI-dark coverage cluster) · **Severity:** MEDIUM (test-coverage integrity) · **Class:** CI WIRING — pre-existing, surfaced by the `modal-header-reconciliation` close-out (2026-07-19)

**How it closed.** `.github/workflows/standalone-e2e.yml` runs the WHOLE config unfiltered on every PR (404 tests, 3.3 min, no webServer / Supabase / build), and the seven per-feature workflows that existed only because nothing ran the config are deleted. All 30 members lost their allowlist rows, verified against the scanner's own output rather than a hand list.

The structural guard proposed below shipped in the form that could be made SOUND: `tests/ci/_metaStandaloneConfigBranches.test.ts` pins that every `testMatch` branch resolves to an existing spec (the check is total — the branch list is finite and each entry resolves or does not). The converse direction, detecting a self-contained spec never REGISTERED in the config, could not be given a sound definition after four adversarial rounds and is filed separately as `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC`. An honest gap beats a guard that catches only what it happens to recognize.

Spec: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §4.

`tests/e2e/standalone.config.ts` holds ~19 self-contained real-browser specs (the `*.layout` family, `statusStripToggleLayout`, `blocked-row-resolver-transitions`, `collapse-panel-morph`, `packlist-rescan-recovery`, `skeletonBandParity`, …). **No workflow invoked that config, and Playwright's default `playwright.config.ts` matches none of those files under any project.** Consequences: `pnpm exec playwright test tests/e2e/<one>.spec.ts` reports `No tests found` (the failure looks like a bad path, not a missing project), and the specs are runnable ONLY by someone who already knows to pass `--config=tests/e2e/standalone.config.ts`. They went green once at authoring time and were never run again in CI.

This is the **#479 failure class repeating** — a spec living in no CI-run project drifted silently and broke on `main` once the Step 3 client graph changed. The lesson memo is "a dark spec in an unrun project rots."

**Partially closed (2):** `.github/workflows/destructive-layout-e2e.yml` now runs `pendingDiscardReal.layout` + `pendingDiscardReflow.layout`, and `.github/workflows/modal-header-layout-e2e.yml` runs the four modal-header-family specs — `published-review-modal.layout`, `skeletonBandParity`, `statusStripToggleLayout`, `step3-review-modal.layout` — via `pnpm test:e2e:modal-header`, with `workflow_dispatch` enabled. **The other ~13 remain dark.**

**Fix:** wire the remainder into CI (either extend the new workflow's spec list job-by-job, or add a job that runs the whole standalone config), then add a **structural guard** so the class cannot silently reopen: a meta-test asserting every `tests/e2e/*.spec.ts` is matched by at least one project in `playwright.config.ts` OR by `standalone.config.ts` AND named in some workflow's run list. Fails-by-default, so a NEW standalone spec that nothing runs breaks CI at authoring time instead of rotting.

**Known blocker for a whole-config job:** `packlist-rescan-recovery.spec.ts` shells out to `pnpm dlx esbuild@0.28.0` (network fetch at test time) and fails locally on a cold/offline dlx cache — pin or vendor that dependency before putting it in a required job.

**Trigger:** next milestone touching `tests/e2e/**` layout harnesses, or any adversarial round that flags real-browser coverage.

---

## BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE — the Published-toggle round-trip case is not yet five-greens stable — ✅ RESOLVED (2026-07-27)

**Status:** ✅ RESOLVED (2026-07-27, branch `fix/lifecycle-transitions-roundtrip-flake`) · **Severity:** was MEDIUM (blocked wiring an otherwise-repaired spec) · **Class:** e2e flake · **Filed:** 2026-07-26 (PR4 of the CI-dark cluster)

**Resolved by** `fix/lifecycle-transitions-roundtrip-flake`. The CI measurement loop (10 samples, retries=0, trace=on) split the "flake" into two deterministic-in-cause modes, then two further rounds surfaced two more; all four are repaired and none was CI slowness:

1. **Client commit wedge (7/10)** — recovered test-side by `expectFlipLanded`'s tiered read-only recovery (nudge, then reload); the mutation is never retried. Product exposure stays open as `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE`.
2. **Crew-page fail-closed (3/10)** — a missing `PICKER_COOKIE_SIGNING_KEY` in the workflow env; the picker chain threw and `resolvePickerSelection` failed closed on 40/40 attempts (run 30236837082). Key added; the resolver now names its failing upstream call with a `site` discriminator.
3. **Nudge-tier Escape leak** — the recovery nudge's Escape reached the modal shell's document-level listener after ShareHub's lifecycle effect self-closed the popover, navigating the modal to `/admin` and starving the ON flip. Fixed: no Escape, plus a 5s fail-fast modal assert before the ON flip (`726bcb4e6`).
4. **Backdrop-covered kebab** — ShareHub's full-viewport backdrop intercepted the kebab click under actionability. Fixed: the popover is closed via the backdrop's own designed click handler (`34dc36d24`).

**Acceptance met (spec §6.1 / AC-6):** five consecutive green normal-dispatch `lifecycle-layout-e2e.yml` runs on 2026-07-27 — 30296297785, 30296928109, 30297537395, 30298134455, 30298809756 — preceded by a green 10/10-samples measurement run. The spec is wired on `pull_request`, the `_metaE2eWorkflowCoverage` allowlist row is deleted, and the spec amendment records the closure. Original entry below for provenance.

**Do not re-derive this analysis.** Measurements below.

`tests/e2e/admin-lifecycle-transitions.spec.ts` was matched by the `mobile-safari` project and named by no workflow. PR4 repaired both of its DETERMINISTIC breaks and stopped short of wiring it, per spec §6.1's pre-ratified fallback: acceptance is five consecutive green runs, and "if it cannot reach that, it stays dark with a recorded reason. An admitted flake is worse than a known gap."

**Fixed and shipped:**

- The assertion on `admin-share-link-inactive` (retired by `d7fa48b9a`) is deleted — it failed every run, so no flake work could ever have reached five greens.
- The compound "Archive armed while another action refreshes" case is retired: the ShareHub backdrop makes its premise unreachable (see `BL-ARCHIVE-ARMED-CONCURRENT-REFRESH`).
- The pre-hydration click-swallow is fixed properly — `waitForHydration` drives the ShareHub kebab (client-only, writes nothing, safe to retry), then the mutation is dispatched exactly once. An earlier attempt retried the mutation itself and was measurably wrong: a slow unpublish let the retry click the refreshed OFF toggle and dispatch a REPUBLISH.

**What remains:** the "Published toggle round-trip" case. Best measured **4/5 locally**; the single failure was `Expected "true" / Received "false"` on the ON flip, which is why that assertion now carries the same 30s budget as the OFF flip. A subsequent real-CI run then failed the OFF flip with `Expected "false" / Received "true"` after 30s.

**2026-07-26 UPDATE (branch `fix/lifecycle-transitions-roundtrip-flake`): the ">30s under CI load" hypothesis below is DISPROVEN — do not pursue it.** A CI measurement loop (`transitions_repeats` workflow_dispatch input on lifecycle-layout-e2e.yml; baseline run 30235889083, 10 samples) went **0/10** and split the failure into two independent modes, neither of them slowness:

1. **Client commit wedge, 7/10** — the action POST returned 200 `{ok:true}` in ~230ms with the flipped tree in the response body, the refresh RSC landed in ~160ms, the page kept answering assertion polls, and the toggle STILL sat `aria-busy="true"`/old `aria-checked` for the full 30s. The React transition never commits (React 19 replay-loss class; nearest public report: vercel/next.js discussion 88767). next 16.2.11/12 vendor the SAME React (`19.3.0-canary-3f0b9e61-20260317`) — no upgrade fix rides a patch bump. Product-side exposure filed as `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE`. Test-side: `expectFlipLanded` tiered read-only recovery (nudge → reload), mutation never retried.
2. **Crew-page fail-closed, 3/10** — every sample that survived the wedge failed the post-republish crew visit with `PICKER_RESOLVER_LOOKUP_FAILED` ("Couldn't load your show access"). The resolver swallowed the fault silently; `lib/auth/picker/resolveShowPageAccess.ts` now warns with a `site` discriminator per infra_error return, and the spec retries the read-only crew visit bounded (3 attempts / 45s). 3/3 is suspicious for "transient" — if it persists with a named `site`, chase that call, not the test.

**If picked up (superseded procedure):** dispatch the measurement loop (`gh workflow run lifecycle-layout-e2e.yml --ref <branch> -f transitions_repeats=10`), not `gh run rerun`; classify per-sample with the trace artifacts (wedge = stuck `aria-busy` with a fast 200 POST; picker = resolver copy on the crew page).

## BL-CRON-REGISTRY-MIGRATION-PARITY — ✅ RESOLVED (2026-07-26) — no CI-running check ties a new migration to the cron registry

**RESOLVED 2026-07-26 (PR3 of the CI-dark coverage cluster).** This entry's premise was WRONG and that is the interesting part: it said the fix "needs a variant that enables them", believing CI holds the pg_cron migrations aside permanently. `scripts/ci/supabase-local-bootstrap.sh` holds them aside for the INITIAL boot only, then applies them with `supabase migration up --include-all`. `unit-suite-db` has therefore always had a Postgres whose `cron.job` rows were produced by PostgreSQL parsing the branch's SQL — the exact parity check asked for, with no new infrastructure and no SQL scanner (which this entry explicitly forbade). The suite was simply excluded from CI via `ENV_BOUND_EXCLUDES`, so it ran locally and nowhere else. Un-excluded, plus two anti-vacuity mechanisms (CI throws on unreachable psql; a live-case counter refuses an all-static run), plus a `pg-cron-validation-parity` job for the persistent validation project. See spec `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §5.

**Status:** OPEN · **Severity:** medium · **Surfaced:** 2026-07-25, whole-diff review round 17

`pg-cron-jobs.json` is the canonical machine-readable cron contract, and constants are pinned against it. Nothing that runs in CI checks that the MIGRATIONS agree with it:

- `pg-cron-coverage.test.ts` has a static migration check, but it reads two hard-coded historical paths and asserts `scheduledSql.toContain(job.schedule)` over their concatenated text — `fxav_cron_notify_digest` and `fxav_cron_refresh_watch` share `0 * * * *`, so one can change while the assertion still finds the string. It also does not run at all (`BL-PG-CRON-COVERAGE-UNRUN`).
- Its live check reads the DEPLOYED validation row, so a migration sitting unapplied on a branch is invisible until after deploy.

A hand-rolled SQL scanner was tried for exactly this and abandoned after nine review rounds of lexical corners (comments, dollar quoting, identifier case and quoting, name resolution, `search_path`, stored function bodies) — see the header of `tests/cron/samplingPeriodParity.test.ts`. **Do not reinstate regex-based SQL parsing.**

**Fix direction:** apply migrations to a throwaway Postgres in CI and read `cron.job` from it, so PostgreSQL does the parsing on the BRANCH's SQL. The `supabase-local-bootstrap` path already boots a local instance; the pg_cron migrations are GUC-guarded and held aside there, so this needs a variant that enables them.

## BL-STRIPCOMMENTS-DUPLICATED-AND-FAIL-OPEN — 17 hand-rolled comment strippers, each blind the same way — ✅ RESOLVED (2026-07-26)

**Status:** RESOLVED (2026-07-26, branch `refactor/stripcomments-shared`) · **Severity:** MEDIUM · **Class:** structural-guard fail-open

**Resolution:** One TS-parser-backed module, `tests/_shared/stripComments.ts` (`commentRanges`/`stripCommentsSafely` promoted from `_newTabScan` with a required `ts.ScriptKind` — the TSX hardcode mis-parsed plain-`.ts` generic arrows — plus `stripSqlComments` with dollar-span-as-code + nesting, `stripCssComments`, `stripMdxComments`, and an extension router `stripCommentsForFile`). The adversarial-review sweeps grew the inventory from 17 to 54 rows across 52 files (named strippers, inline replace chains, char scanners, line-start skip filters, SQL/CSS/YAML/dotenv variants); 45 migrated, 9 kept with reasoned site-granular allowlist rows. `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` walks `tests/**` and flags five idiom families on comment-stripped source (fails-by-default; negative plants pin each family, including a renamed char-loop and an alternate regex spelling). Spec: `docs/superpowers/specs/2026-07-26-stripcomments-shared-design.md`. Triage found no real pre-existing violations — every guard stayed green post-migration; the A6 line-number skew (deletion collapsing multi-line comments) was silently FIXED by offset-preserving blanking.

Structural guards across the suite strip comments before scanning source, and **17 files define their own `stripComments`** (`rg -l "function stripComments|const stripComments" tests/`). The common form is `src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")`, which lets **any** `/*` open a block span — including one inside a string or a path.

**Measured impact:** the JSDoc line `* Wraps every route under /admin/*` in `app/admin/layout.tsx` opens a span that runs to the next `*/` far below. All **six** live `className` sites in that file disappear from the scan, so any guard using that helper silently reports nothing for it. Verified: a dead `text-subtle` class planted at `app/admin/layout.tsx:191` was invisible to a scanner using the old helper and is caught by the fixed one.

**Fixed in `tests/styles/_classScanUtils.ts` only** (this PR), because that copy gained a new consumer. It is now line-based and refuses to open a multi-line block unless the opener starts its line or follows a JSX `{`. A self-test pins both directions in `tests/styles/_metaDoublePrefixColorToken.test.ts`. **The other 16 copies are untouched** — fixing them means re-running each guard against what it was previously blind to, and each may surface real pre-existing violations that need their own triage. Doing that inside an unrelated PR would bury them.

**Fix shape:** promote the corrected implementation to one shared module, migrate the 16 callers one at a time, and triage whatever each newly sees. Expect real findings: fixing the shared copy here immediately surfaced two apparent violations (both turned out to be artifacts of an incomplete first fix, which is itself a warning that this needs care, not a bulk sed). **Trigger:** any new structural guard that scans source, or any guard suspected of under-reporting.

---

## BL-SCAN-SSE-BODY-NULL-CODE — onboarding scan SSE result body emitted a user-facing `code:null` — ✅ RESOLVED (2026-07-27)

**Resolved by:** `feat/scan-sse-null-code` (PR #621), PR4 of the 2026-07-24 BL-NULLCODE-STAMP-BATCH-2 residual sweep.

The scan route's mid-run-throw catch logged a forensic `ONBOARDING_SCAN_FAILED` but emitted `{ ok:false, code:null }` to the wizard client, forcing the generic fallback copy. The string was promoted to a real §12.4 code as the three-way lockstep in one commit (master-spec §12.4 row + helpfulContext map, `pnpm gen:spec-codes`, `lib/messages/catalog.ts` predicate row) plus the route emit and `Step2Verify` `RECOGNIZED_CODES`, so the operator now gets the cataloged copy and a HelpAffordance. The code graduated out of `NEW_FORENSIC_CODES` via the new `GRADUATED_TO_CATALOG` ledger (tests/log/\_auditableMutations.ts), whose contract test pins disjointness, catalog-row presence, and producer presence; the forensic log stamp remains pinned by `NULLCODE_BATCH2_STAMPS`.

---

## BL-PICKER-TAMPER-ADMIN-ALERT — selectIdentity tamper breadcrumb now raises an `admin_alerts` upsert — ✅ RESOLVED (2026-07-27)

**Resolved by:** `feat/picker-tamper-alert` (PR #623), PR5 of the 2026-07-24 BL-NULLCODE-STAMP-BATCH-2 residual sweep.

The `selectIdentity` claimed-row rejection logged only a forensic `PICKER_IDENTITY_CLAIMED_TAMPER` warn. It now also upserts a global `admin_alerts` row before the sign-in redirect, honoring both verified placement constraints (no JS-side advisory lock — held inside `select_identity_atomic`; before `redirect()`, which throws to unwind), with `showId: null`, context `{ slug, crew_member_id, reason }`, never the share token, and a mandatory try/catch that logs `PICKER_ALERT_FAILED` rather than replacing the security redirect. Audience `health` / weight `notice` / resolution `manual` on the `PICKER_SELECTION_RACE` precedent; deliberately no `ALERT_ACTIONS` row and not an inline-identity code. Full ~15-surface lockstep landed in one feature commit; the code graduated out of `NEW_FORENSIC_CODES` via `GRADUATED_TO_CATALOG` with its forensic stamp still pinned.

---

## BL-ALERT-ACTION-LINKS-E2E — real-browser e2e pass over every alert action link — ✅ RESOLVED (2026-07-27)

**Resolved by:** `test/alert-action-links-e2e`, PR6 (last) of the 2026-07-24 BL-NULLCODE-STAMP-BATCH-2 residual sweep.

`tests/e2e/alert-action-links.spec.ts` seeds one unresolved `admin_alerts` row per `ALERT_ACTIONS` code (derived from `ALERT_ACTION_CODES` with a set-equality guard, so a 21st code fails by name) plus one negative row per null-return shape, and asserts the rendered anchors in a live app. Renderer census correction recorded in the spec header: the bell (non-health, non-inbox-routed), the attention banner (footer action + external-only destination chip), and the health panel carry registry links; AttentionMenu no longer renders per-item action anchors, so the item's four-renderer claim was down to three by ship time. External hrefs asserted verbatim with target/rel and never followed; every internal link's DECLARED fragment must resolve to a real element on the landed route (mutation-verified: re-pointing RESYNC_SHRINK_HELD at the dead `#resync` reds exactly that assertion). Wired into crew-e2e.yml's run line + desktop-chromium testMatch with a PATH_GATED_BY_EXCLUSION coverage row (crew-section-toggle precedent). The item's paired one-time validation-deployment smoke click-through was NOT performed by this PR — it is a deploy-time manual step and remains with Eric.

---

## BL-CHILDLESS-GROWABLE-STATIC-GUARD — static guard against childless growable flex items — ✅ RESOLVED (2026-07-26)

**Status:** CLOSED 2026-07-26, shipped on `feat/childless-growable-static-guard` · **How it closed.** The revival followed the entry's own mandate: walker first (census v2 over `components/` + `app/` at `396416778`: 79 growable candidates, 0 in the banned shape), output defined an allowlist of four shapes. Spec `docs/superpowers/specs/2026-07-26-childless-growable-static-guard-design.md` converged APPROVE after 8 adversarial rounds (26 findings); the guard shipped as `tests/styles/_childlessGrowableScan.ts` + `tests/styles/_metaChildlessGrowable.test.ts` (live gate green, two-row component registry, four-token paint set, zero exemptions). The original entry follows for provenance.

**Filed:** 2026-07-25 (branch `feat/section-header-rebuild-phantom-spacers`, DESCOPED from that branch's spec §6 after three adversarial rounds). **Class:** layout hardening (structural defense). **Effort:** M — the cost is the rule, not the walker.

The five sites `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW` repaid are covered by two executable oracles (`tests/e2e/pusher-alignment.layout.spec.ts`, `tests/e2e/section-header-layout.layout.spec.ts`) and by the phantom-gap probe mounts. Neither sees a SIXTH site written tomorrow: the probe only reaches surfaces it is mounted on, and both layout specs name their rows explicitly. A source-scanning guard would fail-by-default on a new one.

**Why it is not written yet, and what a future attempt must clear.** Three rounds could not converge a rule that agreed with its own prototype. The written rule selected 27 registry rows; the prototype walker selected 17. The disagreements were all real ambiguity in "childless" and "growable", not implementation bugs:

- `flex-1` on an element whose only child is a conditional that renders `null` in some states is childless SOMETIMES — a static scan cannot evaluate the condition, and both "always flag" and "never flag" produce false results on live code.
- A growable element that PAINTS (the `h-px bg-border` hairline) is not the defect; the defect is a growable element that paints nothing. Distinguishing them statically means reasoning about which utility classes produce a painted box, which is an open-ended list.
- The `style={{ flex: … }}` prop form has no className to match, so a className-only rule is fail-open on it — and that is exactly the escape hatch a class-sweep guard exists to close.

Per `docs/agents/spec-self-review.md`'s 3-round cap, the guard was descoped rather than shipped at 63% agreement with itself.

**Work, if revived:** start from the PROTOTYPE, not the prose — write the walker first, run it over `components/` + `app/`, and let the actual output define the rule (the reverse of the order that failed). Expect the deliverable to be an ALLOWLIST of accepted shapes rather than a leak hunt, per the same lesson `feedback_static_guard_allowlist_shapes_not_leak_hunting` records from PR #592. A guard that flags a painted hairline is worse than no guard, because the exemption comment it forces teaches the next author that the shape is fine.

## Graduated 2026-07-31 — sheet-icon-link whole-diff r37

Both entries below were RESOLVED by `feat/sheet-icon-link-affordance-class` itself and sat in the open queue until whole-diff r37 caught the drift. `BL-HEADER-PILL-LINK-TOUCH-BUFFER`: the shared component's asymmetric overlay (`before:-left-2.5`, 10px heading-side reach at `components/admin/SheetIconLink.tsx:73`) against the pill side's measured 12px clearance delivers exactly the requested 2px dead zone, pinned by the clearance cases in `tests/e2e/section-header-layout.layout.spec.ts`. `BL-HEADER-SUBBLOCK-HIERARCHY-WIDE`: the tap floor now drops for linkless sub-blocks at EVERY width (`sub && sheetHref === null`, spec §1 item 8), which is the entry's first candidate fix; its P3 sibling note (linkless+pilled row offset — combination unreachable in production) is carried in the entry verbatim and stays confirm-only. Original entries follow.

## BL-HEADER-PILL-LINK-TOUCH-BUFFER — zero dead zone between the inline pill and the sheet link's hit area on touch

**Filed:** 2026-07-26 (same late Assessment A).

`sm:gap-2.5` + `sm:ml-0.5` = 12px, exactly the `before:-inset-3` reach — the 44px hit area is TANGENT to the pill's right edge (the #612 spec fixed the 2px overlap to tangency, pinned by an `elementFromPoint` case at the pill's right-edge-minus-1px). But `sm`+ is not mouse-only: a phone in landscape (~852px viewport) takes the inline branch, and a thumb landing 1px right of "Needs a look" opens a new tab. `sm:ml-1` (4px, tokenized) would buy a 2px dead zone at negligible visual cost; the existing tangency test keeps passing and a second probe just outside the pill edge could pin the buffer.

## BL-HEADER-SUBBLOCK-HIERARCHY-WIDE — the Diagrams sub-block's subordination signal thins out in the sm+ row

**Filed:** 2026-07-26 (same late Assessment A; extends the narrow-mode footprint item 6 in the 2026-07-25 post-merge review list above).

The sub-block is always linkless and never flagged (its chrome provider sets no sectionId/dfid), so nothing in its header is tappable — yet `sm:min-h-tap-min` gives it the same 44px one-row shape as its parent section at `sm`+, leaving subordination to a 4px-smaller chip and 2px-smaller text. Candidates: drop the floor for `sub` at `sm`+ (`sm:min-h-0` — the narrow-mode fix already filed as item 6 applies the same conditional idea), or an `sm:pl-*` indent nesting it under its parent. Confirm-only sibling note (P3): a linkless+PILLED row would sit 32px right of a linked row's pill at `sm`+, but that combination appears unreachable in production (Diagrams is never flagged; "report" carries no pill) — verify before treating as real.

## Graduated 2026-07-27 — sheet-icon-link close-out (whole-diff r3)

`BL-HEADER-LINK-AFFORDANCE-CLASS` (below) had been annotated closed in place in a spelling the terminal-status guard could not see (bold opening claim); the guard was widened in the same branch (heading-suffix and opening-line spellings, SUPERSEDED/DONE joining the terminal set) and the entry moved wholesale. Three further in-place-terminal entries this branch's sweeps caught — `BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED`, `BL-HEADER-PROBE-RESIDUAL-VACUITY`, `BL-AGENDA-PERDAY-VIEWER-FILTER` — were independently graduated by mainline #628 the same day; their archive copies live at the top of this file with mainline provenance. This branch's graduation of `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` was reverted in the merge per #628's deliberate keep (sub-entry of a still-open parent section).

## BL-HEADER-LINK-AFFORDANCE-CLASS — the corner sheet link paints as non-interactive, in three spellings, across three call sites

**CLOSED 2026-07-26** by `feat/sheet-icon-link-affordance-class` (spec `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md`, handoff `docs/superpowers/plans/2026-07-26-sheet-icon-link-affordance-class-handoff.md`): items 1/3/4/5/6 closed via the shared components/admin/SheetIconLink.tsx (item 2 was closed earlier by PR #592). The class sweep found a FOURTH member the entry missed (Step3ReviewModal.tsx — byte-identical to PublishedReviewModal's), and the item-5 inset prescription below was superseded (the filed `-inset-x-2.5` yields a 40px-wide target; shipped 10/14px asymmetric keeps 44×44). The count-pinned phrase-containment guard (`tests/components/admin/sheetIconLinkContainment.test.ts`) closes the drift class. Residual sibling class (`text-text-subtle` on four OTHER icon-only action targets) filed as DEFERRED.md SHEETLINK-SUBTLE-ACTION-CLASS-1. Historical entry below kept verbatim.

**Filed:** 2026-07-26 (post-merge independent design review of PR #605 — see that batch's close-out §12 for why the review landed late). **Class:** UI affordance + a11y. **Effort:** S per item, M if taken as the class sweep it should be. **Gate:** invariant-8 impeccable dual-run, since every item is a UI surface.

Six findings, all verified live against `839eed829`. Items 1 and 4 are **class-wide** — the same shape exists on sibling sheet links that this batch never touched — so fixing only the section header would leave the class open and the inconsistency worse.

1. **The link is coloured with a token DESIGN.md forbids for action targets.** `--color-text-subtle` is documented "Never used for action targets" (`DESIGN.md:27`) and "never an action target" (`DESIGN.md:58`). The rebuilt corner link uses `text-text-subtle`, and so does `components/admin/showpage/PublishedReviewModal.tsx:721`. Pre-existing on both counts — but the rebuild removed the words "In sheet", so the colour is now carrying the entire affordance rather than sitting beside a text link. Fix: `text-text` at rest, `text-text-strong` on hover, at BOTH sites, and add an `active:` state — a tap currently gives no feedback until a new tab loads.
2. **No new-tab cue.** `components/admin/wizard/Step3SheetCard.tsx:152` appends "(opens in a new tab)" to its accessible name; the rebuilt link's `aria-label` does not, while carrying `target="_blank"`. The visible words used to imply it. Fix: match the sibling's phrasing. **CLOSED by PR #592** (`fix/newtab-announcement-family`), which merged this batch and re-applied its announcement at the relocated anchor: the label now reads `Open the source sheet for <label> (opens in a new tab)`, with a `.trim()` fallback to `Open the source sheet (opens in a new tab)` so a blank section label yields no dangling "for". Item 3's point about the stale precedent comment also landed there — the comment now states the label carries the announcement and that WCAG 2.5.3 no longer constrains it.
3. **The justifying comment cites the wrong precedent.** It reads "the show card's own header already uses an icon-only sheet link, so this is a consistency fix." `Step3SheetCard.tsx` renders a TEXT title link with a trailing glyph — not icon-only. The genuine icon-only precedent is `PublishedReviewModal.tsx:721`. The decision is fine; its stated reason points at the wrong sibling and should not be inherited by the next author.
4. **One 44px hit area, three spellings, three aria phrasings.** `size-tap-min` on a 44px box (PublishedReviewModal), `size-5` plus `before:-inset-3` (the rebuild), and an inline glyph after text (Step3SheetCard). Pick one idiom and one phrasing; a shared component is the obvious end state.
5. **The hit overlay bleeds onto the name (below `sm`).** `before:-inset-3` is 12px against the row's `gap-2.5` (10px), and the anchor is `relative` while the centred name group is not positioned — so the overlay paints over the gap plus roughly 2px of the name. The last sliver of a full-width name opens the sheet. **The tap-target test cannot catch this**: it asserts that points inside the expanded box DO hit the link (the intended behaviour) and probes just outside at `box.left - 3`, which is beyond the overlay. Fix: `before:-inset-y-3 before:-inset-x-2.5`, and extend the test to assert the overlay does not cover the heading's rect. (At `sm`+ the neighbour is the inline pill, and that side IS resolved: `sm:ml-0.5` makes gap+margin equal the 12px overlay, pinned by an `elementFromPoint` case — spec 2026-07-26. The narrow name-side bleed above still stands.)
6. **Sub-blocks take a top-level footprint.** `min-h-tap-min` is unconditional on the header line below `sm` (and on the outer row via `sm:min-h-tap-min` at `sm`+, where the line-1 wrapper is boxless — spec 2026-07-26), so the Diagrams sub-block — which never renders a link, so the tap floor buys nothing there — occupies the same 44px as a peer section, working against the deliberate `size-6` / `text-sm` subordination. Fix: `${sub ? "" : "min-h-tap-min"}`.

**Out of bounds: the centred title (below `sm`).** Both reviewers raised it; it is owner-ratified from a measured four-way comparison, and **superseded at `sm`+ by the 2026-07-26 wide-inline spec (owner re-decision): wide screens are now left-aligned**. Still out of bounds below `sm`. The old datum — that all four compared options were centred variants, so no left-aligned baseline was measured — is now historical: the `sm`+ row IS the left-aligned treatment.

**Why this was not caught pre-merge.** The invariant-8 gate ran single-context after four sub-agent dispatches went unanswered for ~25 minutes; three of them were still working and reported hours later. The single-context run scored the surface 32/40 where the independent pair scored 30 and 29, and both independent agents rated _Recognition over recall_ at 2 — the lowest score either gave — for the reason item 1 describes.

---

## BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC — detect a self-contained spec nobody registered — ✅ RESOLVED (2026-07-27, ci-dark descoped close-out PR-A)

**Resolved by:** `feat/ci-dark-descoped-guards` (PR #626, PR-A of the ci-dark descoped close-out, spec `docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md`).
**Status:** ✅ RESOLVED · **Severity:** medium · **Class:** GUARD COMPLETENESS

**Resolution.** The detector never inspects a spec at all — the two failed definitions below
modelled harness shape, and the shipped guard replaces the model with observation. The universe is
Playwright's own default file matcher (installed 1.59.1, common/config.js line 164) applied to a
`readdirSync` walk of `tests/e2e/`, minus the exact suffix pair the Vitest include globs claim;
membership is the union of `--list --reporter=json` output across every registered Playwright
config (`playwright.config.ts`, `tests/e2e/standalone.config.ts`,
`playwright.screenshots.config.ts`, and `tests/e2e/visual.config.ts` — the last joined at merge
time when main shipped the section-header visual gate). A
test-shaped file resolved by no config and absent from `DARK_SPEC_ALLOWLIST` (each row carries a
backlog ref) fails one aggregate assertion naming every offender and every config. A
config-set tripwire (invocation census over `package.json` scripts + workflow `run:` blocks, plus a
filename belt) pins the config set, and a drift tie pins the Vitest-claim subtraction verbatim. Shipped
at `tests/ci/_metaSpecRegistration.test.ts` ("spec registration detector (spec §3.1)"); mutation-
verified with three filename shapes (spec-ts, spec-cts, and test-mjs variants). The live instance it caught,
`tests/e2e/report-modal.spec.ts`, was dispositioned per spec §3.2.

> **Historical (pre-resolution) text below, preserved verbatim.** The "cannot see a spec that was
> never listed" gap it describes is exactly what the shipped detector above closes, and the
> **Trigger** at the end no longer applies.

`standalone.config.ts`'s `testMatch` is an explicit allow-list, so a new harness spec that nobody
adds runs nowhere. The shipped guard proves every _listed_ branch resolves to a file (total, and it
caught the stale `overrideableField.layout`), but cannot see a spec that was never listed.

Two detector definitions were tried and both fail: "calls the toolchain helper" is neither
necessary nor sufficient, and "imports `node:http`/`node:https`" misses harnesses that boot no
server — `tests/e2e/phantomGapHelper.layout.spec.ts` drives `page.setContent`, and `data:`
navigation and route-fulfillment harnesses evade it identically. **Trigger:** a new standalone spec
discovered dark, which is the event this would have prevented.

---

## BL-CI-ENV-DEPENDENT-CONFIG-NARROWING — a Playwright config could narrow on a variable only GitHub sets — ✅ RESOLVED (2026-07-27, ci-dark descoped close-out PR-A)

**Resolved by:** `feat/ci-dark-descoped-guards` (PR #626, PR-A of the ci-dark descoped close-out, spec `docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md`).
**Status:** ✅ RESOLVED · **Severity:** LOW (guard completeness, not a live defect) · **Class:** CI coverage integrity · **Filed:** 2026-07-26 (PR2 of the CI-dark cluster, adversarial R4)

**Resolution.** Exactly the "if picked up" fix below: verify in the environment rather than predict
it locally. `tests/e2e/standalone.config.ts` now emits a JSON run report under the gitignored
test-results directory; `scripts/check-standalone-baseline.mjs` compares the run's
own reported executed spec-file list and total executed-test count against the committed
`tests/e2e/standalone-baseline.json`, and `.github/workflows/standalone-e2e.yml` runs the
comparator as a post-run step — so a config that narrows only under Actions reds the job on its own
report, with no env-var enumeration anywhere. Comparator behaviorally pinned at
`tests/scripts/checkStandaloneBaseline.test.ts`; reporter/baseline/workflow-step structure pinned
at `tests/ci/_metaSpecRegistration.test.ts`; the workflow mutation `repeatEach:
process.env.GITHUB_ACTIONS === "true" ? 2 : 1` (file-preserving, locally invisible) verified red in
a real Actions run — URL in the PR body. The parent spec's §10b ceiling paragraph carries the
supersession note.

**Do not re-derive this analysis.** Four adversarial rounds converged here; the measurements are below.

> **Historical (pre-resolution) text below, preserved verbatim.** The gap it calls unpatched is
> closed by the shipped comparator described above; the "404 tests across 30 files" figure predates
> the fix (the committed baseline is now 440 tests), and the **If picked up** fix is exactly what
> shipped.

`tests/ci/_standaloneConfigProbe.ts` proves that under the environment it can construct, `tests/e2e/standalone.config.ts` resolves to exactly the 30 spec files whose allowlist rows PR #609 deleted. Membership comes from Playwright's own `--list`, so `projects[].testMatch`, `testIgnore`, `testDir`, `projects: []`, and `grep`/`grepInvert` are all resolved by Playwright rather than modelled, and a companion assertion requires that resolved set to equal what the top-level `testMatch` declares (verified by mutation: a project-level `testMatch` reds it).

**The gap:** a config branching on a variable only the runner sets. The probe pins `CI` and `GITHUB_ACTIONS` and asserts the matcher is identical with and without them, but a branch on `GITHUB_EVENT_NAME`, on another runner default, or on workflow/job/step `env` is invisible to any LOCAL probe **by construction** — the CI environment is not reproducible on a developer machine. Two concrete mutations that pass today's parity check while narrowing under Actions: `process.env.GITHUB_EVENT_NAME === "pull_request"` and `process.env.NODE_ENV === "test"`.

**Why it is not patched:** enumerating variables is the mechanism that failed in rounds 1–3 (regex reader → AST reader → semantics modelling), each replaced rather than extended. A fourth enumeration would be the same shape.

**Mitigation already in place (procedural, and it holds):** the job is unfiltered and runs the WHOLE config on every PR, so a config that narrowed under Actions would show a reduced test count in the run log — 404 tests across 30 files is the current baseline.

**If picked up:** the sound fix is to compare the CI run's own reported test count against a committed baseline, i.e. verify in the environment rather than predict it locally.

---

## BL-DURATION-TOKENS-EMIT-NO-CSS — `duration-fast` / `duration-normal` are inert across 89 files — ✅ RESOLVED (2026-07-27)

**Status:** CLOSED 2026-07-27, shipped on `fix/duration-tokens-emit-no-css` (PR #632) · **How it closed.** Approach A (alias, not the entry's literal rename): the `@theme` block gained `--transition-duration-<name>: var(--duration-<name>)` aliases for all four named durations, so `duration-<name>` utilities emit real CSS and the reduced-motion collapse propagates through the var() chain. Guarded by a compile-emission structural test (`tests/design/durationTokenEmission.test.ts`, fixture probe covering all four names) and a WebKit computed-value e2e assertion in `tests/e2e/crew-section-toggle.spec.ts` (0.15s fallback red → 0.12s / 0s green). Spec: `docs/superpowers/specs/2026-07-27-duration-tokens-emit-no-css.md`. Residual bare-`transition-*` gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`. The original entry follows for provenance.

**Original entry (filed 2026-07-25, destruct-thumb-order impeccable audit P1 · Severity MEDIUM · Class DESIGN TOKEN WIRING, repo-wide):**

Tailwind v4's `duration-*` utility resolves `--transition-duration-*`, but `app/globals.css` defines `--duration-fast` / `--duration-normal`. Verified empirically: compiling the token CSS emits **no rule** for `duration-fast`. So all **276 `duration-fast` + 42 `duration-normal` usages across 89 files** silently fall back to Tailwind's 150ms default, **and the `@media (prefers-reduced-motion: reduce)` block that zeroes those variables never applies to any Tailwind transition** — which is the part that matters. **Fix:** rename the custom properties to `--transition-duration-fast` / `--transition-duration-normal` in the `@theme` block, then re-verify the reduced-motion path actually zeroes a real transition. **Trigger:** next motion or token pass; treat as an a11y fix, not a cosmetic one.

## BL-WATCH-DRIVE-CALL-TIMEOUT — ✅ RESOLVED (2026-08-01, drive-timeout cluster)

**Graduated:** 2026-08-01 — resolved by `fix/drive-api-call-timeouts` (the drive-timeout cluster; spec `docs/superpowers/specs/2026-07-31-drive-timeout-cluster-design.md`). The watch-renewal-lifecycle PR (2026-07-26) bounded the `files.watch`/`channels.stop` requests and NARROWED this entry to its credential-fetch residual; the drive-timeout cluster closed that residual — the GoogleAuth token POST is bounded by the URL-scoped `TokenBoundGaxios` transporter (`GOOGLE_AUTH_TOKEN_TIMEOUT_MS`, 10s), so a stalled credential call can no longer hold the renewal loop. The master spec's watch-create clause was amended in the same PR. Original entry below, kept as provenance.

**Status:** NARROWED 2026-07-26 by the watch-renewal-lifecycle PR — NOT closed. `files.watch` and `channels.stop` now carry `{ timeout: 15s, retry: false }` and the renewal loop has a run budget, but the `GoogleAuth` credential fetch preceding each request is still unbounded, so a stalled credential call can hold the loop exactly as this entry describes. The remaining half is `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED`. See `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.3.

`getDriveClient()` sets no global timeout and `files.watch` is called with no per-call options, so a stalled Drive request blocks the sequential renewal loop in `refreshWatchSubscriptions` for as long as the platform allows. The master spec claimed "time-boxed (default 15s)" for years; nothing implemented it, and that wording is now corrected rather than left as a false promise.

This is why `2026-07-25-watch-lease-slack-design.md` claims **no** renewal-timing guarantee: every such claim would be parameterised by an execution budget nothing enforces. Adding a real per-call timeout (and a per-row deadline in the loop) is the prerequisite for making any timing guarantee defensible — including the deferred backoff work.

## BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED — ✅ RESOLVED (2026-08-01, drive-timeout cluster)

**Graduated:** 2026-08-01 — resolved by `fix/drive-api-call-timeouts` (the drive-timeout cluster; spec `docs/superpowers/specs/2026-07-31-drive-timeout-cluster-design.md`). The auth client's transporter is now a `TokenBoundGaxios` (lib/drive/client.ts) that injects a 10s timeout ONLY on token-host requests — a flat transport default was rejected because the same transporter carries every authenticated API request and would have aborted healthy stream bodies (adversarial r1 finding 1; live probes in the spec). Proven over real stalled sockets in tests/drive/clientAuthTimeout.test.ts. Original entry below.

**Status:** OPEN · **Severity:** low · **Surfaced:** 2026-07-26, watch-renewal-lifecycle spec round 1

`files.watch` and `channels.stop` now carry a per-call `{timeout, retry: false}`, which gaxios enforces by aborting the request. That bounds the API call and NOT the credential fetch that precedes it: `getDriveClient()` hands `google.drive` a `GoogleAuth` instance which performs its own token request, on its own transport, before the API request is issued, where no `MethodOptions` applies. A hung token endpoint therefore still stalls the caller.

An outer race was designed and withdrawn — it could not cancel the fetch either, and its rejection let an activation commit after the caller had recorded the row as failed. No supported per-call knob was found for the token path. Any fix likely means configuring the auth client's transport, which affects every Drive caller and so wants its own review.

**Scope note:** this is the residual named in `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.3.1a, filed rather than left implicit because the withdrawn design's error was claiming to have closed it.

## BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES — ✅ RESOLVED (2026-08-01, drive-timeout cluster)

**Graduated:** 2026-08-01 — resolved by `fix/drive-api-call-timeouts` (the drive-timeout cluster; spec `docs/superpowers/specs/2026-07-31-drive-timeout-cluster-design.md`). All eight sites bounded: five metadata gets carry `{timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false}`; the three stream-opens are bounded by stall guards on the await (body transfer deliberately unbounded — client cancellation + byte caps govern, spec §6). The scan route's pre-scan verify maps a Drive stall to the new 504 `ONBOARDING_FOLDER_VERIFY_UNAVAILABLE` instead of blaming the operator. A structural AST guard (tests/drive/\_metaDriveCallBounds.test.ts) now fails any NEW unbounded Drive/Sheets call by default. Original entry below.

**Status:** OPEN · **Severity:** low-medium · **Surfaced:** 2026-07-26, watch-renewal-lifecycle plan review

A sweep of every Drive/Sheets API call — `grep -rnE '\.(files|channels|revisions|spreadsheets)\.[a-zA-Z]+\(' lib/ app/ --include='*.ts'`, judged by each call's SECOND argument — found everything under `lib/` already bounded by `{timeout, retry: false}` or a stall guard. Eight calls under `app/api/` are not:

- `app/api/admin/onboarding/scan/route.ts:109`
- `app/api/asset/agenda/[show]/[id]/route.ts:320`, `:481`, `:524`
- `app/api/asset/reel/[show]/route.ts:397`, `:527`, `:568`, `:661`

Each can stall its request indefinitely, the same class `BL-WATCH-DRIVE-CALL-TIMEOUT` closed for the watch surface. Out of scope there because they are route-level asset paths with their own budgets and no backlog entry claimed them.

## **Method note for whoever picks this up:** sweep by API CALL, not by `getDriveClient()`. A construction-site grep misclassifies at least four already-bounded `lib/` sites, and `rg -E` is `--encoding` in this repo, so use `grep -rnE`.

---

## BL-HEADER-JUDGMENT-CHIP-CONTRAST — the judgment icon chip is near-invisible, and the sm+ row made it load-bearing — ✅ RESOLVED (2026-08-01)

**Resolved by `fix/judgment-chip-newtab-suffix` (PR #640, 2026-08-01).**

**Filed:** 2026-07-26 (late-arriving impeccable Assessment A on PR #612 — the dispatched sub-agents' results landed post-merge; the inline degraded run had missed all three findings below).

`bg-info-bg` (#eeeae3, `app/globals.css:295`) against the clean chip's `bg-surface-sunken` (#f4f3f1, `app/globals.css:278`) is ~1.06:1 in light mode; at 28px the two chips differ only by a hairline `border-border`. Below `sm` this barely mattered — the "Parsed with judgment" pill sat directly under the name. At `sm`+ (PR #612) the pill migrates to the row's far edge (up to ~600px away at the 744px cap), so the only cue NEXT TO the name for the judgment state is a chip that reads as clean. Flagged is unaffected (amber is distinct). Fix candidates that do not touch the ratified pill placement: `border-border-strong` on the judgment chip, or an info fill separable from `surface-sunken`. Contrast-pin any new/repurposed token per the pre-code mechanical UI gate.

---

## BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA — user-supplied text containing the announcement gets it twice — ✅ RESOLVED (2026-08-01)

**Resolved by `fix/judgment-chip-newtab-suffix` (PR #640, 2026-08-01).**

**Filed:** 2026-07-26 (branch `fix/newtab-announcement-family`, PR #592 close-out review round 2, LOW). **Class:** a11y polish. **Effort:** S.

Three `aria-label`s interpolate user-supplied text and then append the canonical `(opens in a new tab)` suffix unconditionally. When the interpolated value already contains that phrase, the name announces it twice:

- `components/admin/wizard/Step3ReviewModal.tsx:410` and `components/admin/showpage/PublishedReviewModal.tsx:722` interpolate a show title. A show titled `Summit (opens in a new tab)` announces as "Open the source sheet for Summit (opens in a new tab) in Google Sheets (opens in a new tab)".
- `components/admin/wizard/step3ReviewSections.tsx:3585` interpolates a diagram's `alt`, with the same result.

Titles and alt text come from admin-entered Google Sheet cells, so the input is reachable but pathological — nobody has typed it, and the degraded name is verbose rather than wrong (it still announces, and still names the destination). Recorded rather than fixed at close-out because the fix wants **one shared helper** that appends the suffix only when it is absent, not three inline conditionals: the copy already lives in exactly one place (`components/shared/NewTabHint.tsx`) for the visually-hidden span, and the label path should get the same treatment rather than a second copy of the rule. Doing that properly means a helper, its tests, and a sweep of every label that appends the phrase (currently 6 Group B anchors), which is more than a close-out patch.

Cheap partial if it ever bites in practice: strip a trailing occurrence from the interpolated value before appending.

## BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE — REFUTED BY PROBE 2026-07-31 (race-cluster feature)

**Status:** CLOSED-REFUTED 2026-07-31, `fix/archive-lifecycle-race-cluster` · **How it closed.** The mandated empirical probe (5 Playwright cases, spec §2 of `docs/superpowers/specs/2026-07-31-archive-lifecycle-race-cluster-design.md`) refuted the inferred mechanism: with the archive action's POST response HELD 3s after the server fully processed it (RPC committed, broadcast published), the same-tab UI recorded ZERO state changes during the hold — Next's app-router action queue serializes router.refresh() behind the in-flight action, so the "realtime invalidation swaps Archive→Unarchive while useFormStatus is pending" scenario cannot occur same-tab. 8/8 unforced runs settled first. The measured residue was a 6ms post-settle painted frame (enabled Unarchive inside the still-open popover, one commit before the §4 close; unclickable even by Playwright actionability), eliminated by switching the ShareHub §4 lifecycle-close effect to useLayoutEffect (close commits pre-paint). Cross-tab (armed, not pending) the §4 close behaves as designed, same 6ms frame, same fix; covered by the restored compound e2e case. Original entry below for provenance.

## BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE — realtime invalidation can swap Archive→Unarchive while the archive form is still pending

**Status:** OPEN · **Severity:** MEDIUM (destructive-control race; needs probe before design) · **Class:** cross-surface lifecycle race — surfaced by the archive-row-menu-idiom spec R15 adversarial round (2026-07-24); inferred from code paths, NOT yet empirically probed.

Scenario: the archive RPC's show invalidation publishes before the server action finishes post-RPC work; the mounted realtime bridge refreshes `archived` props while `useFormStatus` is still pending; ShareHub swaps Archive for Unarchive; ArchiveShowButton's unmount cleanup releases the busy gate; a fast next tap could fire Unarchive while the original action is still settling (server-side advisory lock serializes actual mutations, so the exposure is UX/telemetry, not data corruption). Shared with the legacy variants; untouched by the row restyle. **Fix (when prioritized):** run the mandated empirical race probe (invalidation arriving before action completion), then ratify one of: retain pending UI across the swap, close the hub on the archived flip, or disable the replacement lifecycle control until settlement.

## BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP — CLOSED 2026-07-31 (race-cluster feature)

**Status:** CLOSED 2026-07-31, `fix/archive-lifecycle-race-cluster` · **How it closed.** Probe Case C confirmed the duplicate (stale tab's no-op archive → two SHOW_ARCHIVED rows for one transition). Fixed FAMILY-WIDE per the class-sweep rule: archive_show / publish_show (+\_publish_show_core) / unpublish_show now return a performed/no-op boolean discriminator (migration `20260801000000_lifecycle_rpc_performed_discriminator.sql`, single-transaction DROP+recreate; unarchive_show already boolean — contract introduced by 20260602000002, preserved through the 20260718000001 refactor); `LifecycleResult` carries required `performed`; all three admin actions gate `logAdminOutcome` on it (revalidates still run on ok so a stale surface heals). Layered coverage: `tests/db/lifecycle_rpc_performed.test.ts` (RPC discriminator + no-op side-effect probes) and no-op zero-emission cases in `tests/log/adminOutcomeBehavior.test.ts`. Original entry below for provenance.

## BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP — no-op repeat archive emits a duplicate SHOW_ARCHIVED event

**Status:** OPEN · **Severity:** LOW (forensic telemetry cosmetics) · **Class:** idempotent-no-op observability — surfaced by the archive-row-menu-idiom spec R15 adversarial round (2026-07-24).

`archive_show` is an under-lock idempotent no-op when the show is already archived (`supabase/migrations/20260601000000_b2_show_lifecycle.sql:73-74`), but `archiveShowAction` (`app/admin/show/[slug]/_actions/archive.ts`) treats that no-op as committed success and emits `SHOW_ARCHIVED` again — a repeat submit inside the committed-refreshing window (or from a stale tab) writes a duplicate forensic event for a transition that did not occur. Pre-existing on all variants. **Fix (when prioritized):** have the RPC return a performed/no-op discriminator and emit `SHOW_ARCHIVED` only on the actual false→true transition; add a repeat-submit test asserting single emission.

## BL-ARCHIVE-ARMED-CONCURRENT-REFRESH — CLOSED 2026-07-31 (race-cluster feature)

**Status:** CLOSED 2026-07-31, `fix/archive-lifecycle-race-cluster` · **How it closed.** The case is RESTORED via the vector the entry itself proposed: a realtime-driven refresh needs no second user gesture, so the ShareHub backdrop cannot block it. The restored compound case in `tests/e2e/admin-lifecycle-transitions.spec.ts` arms Archive in tab B, archives from tab A, and asserts with a paint-aligned rAF sampler: popover closes (§4), loaded modal stays mounted, no armed remnant, no error banner, and NO painted frame contains an enabled replacement lifecycle control inside the open popover (pins the useLayoutEffect pre-paint close). Original entry below for provenance.

### Original entry: BL-ARCHIVE-ARMED-CONCURRENT-REFRESH — no case covers an armed Archive during a refresh from another source

**Status:** OPEN · **Severity:** LOW · **Class:** test coverage gap · **Filed:** 2026-07-26 (PR4 of the CI-dark cluster)

`tests/e2e/admin-lifecycle-transitions.spec.ts` had a "compound: Archive armed while another action refreshes → no torn state" case. It was removed because its premise became **structurally unreachable**, not because the invariant stopped mattering.

**Measured:** the run fails with `share-hub-backdrop ... subtree intercepts pointer events`. The armed Archive control lives inside the ShareHub popover (`components/admin/showpage/ShareHub.tsx:929`), and while that popover is open it renders a `fixed inset-0 z-20` backdrop (`components/admin/showpage/ShareHub.tsx:631-642`) covering every control outside it — including the StatusStrip published-toggle the case dispatched. Closing the popover to reach the toggle unmounts the armed control. Mutually exclusive by design, introduced by `98bf7b17f feat(admin): ShareHub popover — behavior, ARIA, and the §9 composition rules (T3)`.

**The gap:** an armed Archive can still race a refresh triggered from another source (realtime, a sibling tab, a server action completing), and nothing now covers that. The old case exercised it via a route the UI no longer permits.

## **If picked up:** drive the concurrent refresh from something other than a second user gesture — e.g. dispatch a realtime event or navigate the router directly while the popover is open — rather than trying to click a control the backdrop covers.

## BL-CI-VITEST-EXCLUSION-COVERAGE — prove an `ENV_BOUND_EXCLUDES` entry runs somewhere — ✅ RESOLVED (2026-07-31, ci-dark descoped close-out PR-B)

**Resolved by:** `feat/ci-dark-vitest-exclusion` (PR-B of the ci-dark descoped close-out, spec `docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md` §6).
**Status:** ✅ RESOLVED · **Severity:** medium · **Class:** GUARD SOUNDNESS

**Resolution.** The three failed formulations below all PREDICTED execution by reading shell; the
shipped guard uses the runner as the oracle instead. `ENV_BOUND_COVERAGE_REGISTRY`
(`vitest.projects.ts`) maps every `ENV_BOUND_EXCLUDES` entry to a PR-blocking workflow job whose
step is VERBATIM `pnpm run-excluded <file>` (string equality on the parsed YAML, the
WHOLE_CONFIG_RE exact-literal posture — `false && pnpm run-excluded <f>` is simply not the
literal), with the workflow/job/step qualified against the coverage scanner's
execution-override classes plus `environment:`. The alias runs
`scripts/run-excluded-test.mjs`: vitest on the file with a JSON report to a temp path, exit 0
IFF child exit 0 AND >=1 passed AND 0 failed — collection is not execution, and a run-level
failure with green cases is still a failure. Behaviorally pinned at
`tests/scripts/runExcludedTest.test.ts` (9 cases incl. the CI-refused override seam and the
alias-mapping pin); registry totality + workflow qualification at
`tests/ci/_metaEnvBoundExclusionCoverage.test.ts` (dark rows are RED, never a pass).
`tests/admin/test-auth-gate.test.ts` left the exclusion array and runs in unit-suite again
(24 passed / 3 skipped under `VITEST_EXCLUDE_ENV_BOUND=1`, 5x stability-looped);
`tests/cross-cutting/email-canonicalization.test.ts` is proven by the x5 job's run-excluded
step (its three `livePsqlReachable` suites skip there — documented honest ceiling, spec §6.1).

> **Historical (pre-resolution) text below, preserved verbatim.** The "nothing watches whether
> an excluded file runs anywhere else" gap it describes is exactly what the shipped registry
> closes; the **Trigger** at the end no longer applies.

**Status:** OPEN · **Severity:** medium · **Class:** GUARD SOUNDNESS

`ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48`) removes files from the serial project when
`VITEST_EXCLUDE_ENV_BOUND=1`, which only `unit-suite.yml` sets. Nothing watches whether an excluded
file runs anywhere else — the mechanism that kept `pg-cron-coverage.test.ts` dark in CI for months
while passing locally (that specific file was un-excluded 2026-07-26; the unwatched-exclusion
mechanism this entry is about remains).

Three formulations failed:

1. **Matching a filename in a `run:` block** counts `echo <file>`, shell comments, and dead
   branches as coverage.
2. **Applying capability checks to a resolved alias body** cannot distinguish a runner argument
   from arbitrary shell: `false && vitest run <f>`, `true || vitest run <f>`, `if false; then …`.
3. **Resolved-config inclusion** is decidable, but must be resolved under the _same env CI sets_
   (measured: env unset → 8 tests pass; `VITEST_EXCLUDE_ENV_BOUND=1` → `No test files found, exit
1`), and pairing it with a `--project` run check reintroduces the shell problem for the run half.

Current state of the other two entries, both invisible to any check built so far:
`tests/admin/test-auth-gate.test.ts` runs **nowhere**, and
`tests/cross-cutting/email-canonicalization.test.ts` runs only in an `x-audits.yml` job carrying a
job-level `if:` and a trailing `| tee` — each an explicit rejection condition in
`tests/ci/_workflowCoverageScan.ts`. **Trigger:** a third entry joining the array, or a
dark-exclusion incident.

### BL-HARNESS-RESOLVER-POLICY — a sound server-only resolver for browser harnesses

**Resolved:** 2026-07-31 (PR-C, `feat/ci-dark-directive-resolver`). Superseded by the DIRECTIVE rule: `tests/e2e/helpers/useServerDirectivePlugin.mjs` stubs a module iff its own prologue cooks to `"use server"` (the authoritative Next signal, a real TypeScript parse — not the path/graph heuristic this entry weighed), and the stub THROWS on any property read/call, so a consumed-but-uninvoked proxy can no longer silently alter behaviour (the unsoundness measured below). Contract-tested at the build boundary (`useServerDirectivePlugin.test.ts`, 18 fixtures + a disabled-plugin mutation case) and consolidated across both harness bundlers (bundleLiveEntry child + the step3 bundler). Original analysis retained:

**Status:** RESOLVED · **Severity:** medium · **Class:** TEST-HARNESS SOUNDNESS

A rule-based esbuild plugin (`onResolve` matching server-only specifiers, `onLoad` returning a CJS
proxy stub) **was built and it works**: all 7 live harness entries build, all 7 render in a real
browser, and no stub is called. It was descoped because its safety _guarantee_ is unsound, not
because it fails.

Measured, in order:

1. **A proxy is consumable without being invoked.** `flags.code === "show_not_found"` compares a
   proxy and quietly yields `false`; a truthiness test is always `true`; a destructured constant
   stays a proxy. Nothing throws, the harness renders, and assertions run against altered
   behaviour. No render check or call-counter can observe this.
2. **A strict throw-on-any-property-read stub** gives byte-identical DOM and zero errors on 4 of 5
   probed entries and **breaks the fifth's build** — esbuild reads module properties at bundle time
   to resolve named exports.
3. **Path rules overmatch**, with two named live instances: `lib/drive/driveFolderUrl.ts` is a pure
   string function reachable from the alert-card harness via `lib/adminAlerts/alertActions.ts`
   (fails LOUDLY, a call throws), and `SHOW_NOT_FOUND` at
   `app/admin/show/[slug]/_actions/shared.ts:35` is the silent shape — real, but currently
   unreachable from any harness, so latent.
4. **A packages-and-builtins-only rule set** (zero overmatch surface) fails four times in sequence:
   `node:fs/promises` unresolved, then a stub under-export, then `HASH_FOR_LOG_PEPPER` thrown at
   module load, then `__dirname is not defined`.
5. **A sentinel-based guard** detects only preselected sentinels, so it cannot support the claim it
   exists to support.

**Fix direction if resumed:** a graph-derived rule — stub a module iff it transitively imports a
server-only package — rather than a path heuristic. **Trigger:** a second harness entry reaching
the server tree.

### BL-HARNESS-PACKLIST-SERVER-GRAPH — return `packlist-rescan-recovery` to the standalone config

**Resolved:** 2026-07-31 (PR-C, `feat/ci-dark-directive-resolver`). `packlist-rescan-recovery.spec.ts` is back in `tests/e2e/standalone.config.ts`'s testMatch under the shared directive resolver: the C1 Step 5 import-graph reality check measured 0 inputs under googleapis / postgres / google-auth-library on its exact entry (1909 total inputs), so the whole server subtree drops out by class. Original analysis retained:

**Status:** RESOLVED · **Severity:** low (the spec was already dark; nothing that ran was lost)

Removed from `tests/e2e/standalone.config.ts` because the whole-config CI job cannot carry a red
spec, and no per-module alias list fixes it. Its entry reaches the entire server tree — traced by
esbuild metafile:

```
_packListRescanLiveEntry.tsx -> step3ReviewSections.tsx -> UseRawControlBoundary.tsx
  -> app/admin/show/[slug]/_actions/useRaw.ts ("use server")
  -> lib/sync/runManualSyncForShow.ts -> runScheduledCronSync.ts -> googleapis (913 graph inputs)
```

`lib/sync/lockedShowTx.ts` reaches the `postgres` driver by a parallel edge. Stubbing that one
boundary is **not** enough: ten distinct `lib/sync/*` modules still pull `postgres`. A 4-entry
alias list leaves 78 errors. **Fix direction:** `BL-HARNESS-RESOLVER-POLICY`, or trim
`step3ReviewSections.tsx`'s import graph so a client component stops importing Server Action
modules at module scope.

## BL-FLOW8REPICK-TEARDOWN-FLAKE — ✅ RESOLVED (2026-08-01, branch `fix/flow8repick-scheduler-leak`)

**Graduated:** 2026-08-01 — filed 2026-07-23 off PR #558's `unit-suite-db (5)` shard. This is the PRIMARY id for the flake; `BL-TEST-FLOW8REPICK-ASYNC-LEAK` below is a duplicate of it, and both graduate on the same fix.

**Root cause (proven, not inferred).** React Testing Library registers its auto-cleanup only when a GLOBAL `afterEach` exists. This suite runs `globals: false` (`vitest.config.ts:69`) and `tests/setup.ts` never registered one, so RTL's cleanup silently no-opped for **every** RTL test in the repo — 412 files imported RTL and not one registered cleanup itself. Each `render()` therefore left its tree mounted for the rest of the file, and a mounted tree can still hold scheduled React work; on a fast enough runner that callback lands after the jsdom environment is torn down, throwing `ReferenceError: window is not defined` inside `scheduler.performWorkUntilDeadline`. Demonstrated directly: before the fix a two-test probe saw `document.body.childElementCount === 1` at the start of the second test.

**Resolution.** A `window`-guarded `afterEach(cleanup)` in `tests/setup.ts` — the guard keeps the node-environment default (`vitest.config.ts:68`) from loading RTL. This resolves the whole class rather than the named file: `tests/show/flow8Repick.test.tsx` was one of 412 instances and was never special, so the `BL-FLOW8REPICK-TEARDOWN-FLAKE` fix note ("add `afterEach(cleanup)` to flow8Repick, and sweep `tests/show/` for siblings") was correct in direction but scoped two levels too narrow — the sweep is the entire `tests/` tree. Pinned by `tests/cross-cutting/rtlAutoCleanup.test.tsx`, which asserts against `document.body` rather than spying on `cleanup`, and fails if the setup block is deleted.

**Blast radius measured before landing:** all 412 RTL files (410 test files / 4510 tests) green, then the full suite — 1691 files / 19397 tests — green. No test depended on DOM accumulating across tests.

**Original entry, verbatim:**

> **Status:** OPEN · **Severity:** LOW (flake; 0 test failures) · **Class:** jsdom teardown race — surfaced on PR #558's `unit-suite-db (5)` (2026-07-23), rerun green, main green at the same code.
>
> `tests/show/flow8Repick.test.tsx` renders React trees with no `afterEach(cleanup)`; mounted components leave scheduler work (`Immediate performWorkUntilDeadline`) that can tick AFTER the jsdom environment is torn down → `ReferenceError: window is not defined` as an **uncaught error** — vitest reports every test passing (879/879 on the shard) yet exits 1 via the separate `Errors` summary line (the known `feedback_vitest_exits_1_on_uncaught_errors_all_tests_pass` class). Eruption is shard-composition-dependent: adding/removing test files reshuffles the serial shards, changing neighbors/timing — PR #558 added two test files and hit it; a `--failed` rerun passed. **Fix (when prioritized):** add `afterEach(cleanup)` to flow8Repick (and sweep `tests/show/` for sibling render-without-cleanup files); assert no `Errors` line in the CI gate wrapper if this class recurs.

## BL-TEST-FLOW8REPICK-ASYNC-LEAK — ✅ RESOLVED (2026-08-01) — duplicate of `BL-FLOW8REPICK-TEARDOWN-FLAKE`

**Graduated:** 2026-08-01, same fix as the entry above. **This id should never have existed.** It was filed 2026-07-20 on the never-PR'd `chore/ci-namespace-runner-trial` — three days BEFORE `BL-FLOW8REPICK-TEARDOWN-FLAKE` was filed on `main` for the same bug — and was lifted to `main` 2026-08-01 by PR #642 without noticing the id already had a mainline twin. The duplicate-check there grepped the exact id string, which cannot see a differently-named entry describing the same defect. Kept verbatim rather than deleted, per this file's id-preservation rule, so the PR #642 reference still resolves. Its independent contribution: the Namespace-runner reproduction (PR #514, run 29754822376) and the observation that `unit-suite` is a required gate, so the green-tests/red-job symptom can fail unrelated PRs.

**Original entry, verbatim:**

> **Status:** OPEN, surfaced 2026-07-20 by the Namespace runner trial (PR #514, run 29754822376 attempt 1).
>
> `tests/show/flow8Repick.test.tsx` leaks an async React scheduler callback past the end of the test file. On a fast enough runner the callback lands after the test environment is torn down and throws `ReferenceError: window is not defined` inside `scheduler.performWorkUntilDeadline`. Vitest reports it as an unhandled error and exits non-zero **even though every assertion passes** — the failing run showed `187 passed | 2 skipped` / `1906 passed | 3 skipped` alongside `Errors 2 errors`.
>
> **Why it matters:** `unit-suite` is a REQUIRED merge gate, so this fails PRs for reasons unrelated to the change under review, and the symptom (green tests, red job) is confusing to diagnose. It is timing-dependent, so it can occur on GitHub-hosted runners too — just less often, since the trial's faster CPUs made it reproduce within three runs.
>
> **Fix direction:** ensure the component under test is unmounted and any pending scheduler work flushed before the test completes — e.g. an explicit `cleanup()`/`unmount()` in a teardown hook, and awaiting pending timers/microtasks rather than letting the file end with work in flight. Reproducing reliably will likely need either a fast machine or artificially delayed teardown.
>
> **Provenance:** lifted to `main` 2026-08-01 from `chore/ci-namespace-runner-trial`, which was never opened as a PR; the branch remains the source of the underlying spec.

## BL-PICKER-ROW-RING-OFFSET-BACKDROP — claimed/active roster rows use a bare ring-offset-2 — ✅ RESOLVED (2026-08-01, `fix/focus-ring-a11y-pass`)

**Graduated:** 2026-08-01 — Resolved by the tree-wide bare-offset sweep (plan Task 3): the claimed/active roster rows gained `focus-visible:ring-offset-bg` (the rows sit on the picker `<main class="bg-bg">` ground, not their own fill); the dark-mode probe asserts the rendered offset color equals the computed `--color-bg`. The no-new-bare guard (tests/styles/noBareRingOffset.test.ts) prevents recurrence.

Original entry (provenance):

**Status:** OPEN · **Severity:** low (dark-mode focus-ring seam) · **Surfaced:** impeccable critique + audit of `fix/picker-flow-app-bugs` (2026-07-25), both flagged it as pre-existing and out of that diff's scope

`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:138` sets `focus-visible:ring-offset-2` with no `ring-offset-<backdrop>` companion, so the offset resolves to Tailwind's default `--tw-ring-offset-color: #fff` (measured in a real browser during the audit). `DESIGN.md` §1.1 names exactly that as a dark-mode defect: a white gap between the control and its ring on a dark surface. Introduced in commit `4536d6b5a`, well before this branch.

**Fix (when prioritized):** add the matching `ring-offset-<token>` for the row's backdrop, and sweep the other crew-surface focus rings for the same bare-offset shape — `2026-07-23-sharehub-focus-pass` §2 established the two-tier recipe and the no-bare-offset rule, so this is a straggler from before that pass rather than a new decision. Trigger: next focus-ring or dark-mode pass.

## BL-BARE-TRANSITION-NO-DURATION-CLASS — bare `transition-*` sites sit outside the duration-token system — ✅ RESOLVED (2026-08-01, `fix/focus-ring-a11y-pass`)

**Graduated:** 2026-08-01 — Resolved at the token layer: `@theme` gained `--default-transition-duration: var(--duration-fast)`, so every bare `transition-*` site (150ms default, outside the reduced-motion collapse) now resolves 120ms through the duration-token chain and collapses to 0ms under prefers-reduced-motion. Compiler-output proof extends tests/design/durationTokenEmission.test.ts (bare `transition-colors` fixture element).

Original entry (provenance):

**Status:** OPEN (2026-07-27, filed by `fix/duration-tokens-emit-no-css` spec §5) · **Severity:** LOW · **Class:** A11Y / DESIGN TOKEN WIRING

The `@theme` `--transition-duration-*` aliases (spec `docs/superpowers/specs/2026-07-27-duration-tokens-emit-no-css.md`) made every _named_ `duration-<name>` utility real and reduced-motion-safe. Elements carrying a bare `transition-*` utility with NO named duration class still fall back to Tailwind's 150ms default and sit OUTSIDE the `prefers-reduced-motion` collapse (which zeroes only the `--duration-*` chain). Exemplars: `app/me/page.tsx:246` (`transition-transform`), `components/shared/CardReportTrigger.tsx:90` and `components/crew/primitives/SourceLink.tsx:72` (`transition-colors`). No site count stated — counts of this class are grep-flavour dependent (see the agenda-fold §5.2 precedent). **Fix (when prioritized):** per-site judgement — add the appropriate `duration-<name>` class, or explicitly accept the default for that surface. Likely cheaper class fix (impeccable critique 2026-07-27 P3): alias Tailwind's `--default-transition-duration` to a token so even bare sites inherit the system + reduced-motion collapse — evaluate side effects before choosing. **Trigger:** next motion or a11y pass.

## BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS — the armed window closes silently for screen readers — ✅ RESOLVED (2026-08-01, `fix/announce-a11y-pass`)

**Graduated:** 2026-08-01 — Resolved for gap (1), the silent disarm: every timered two-tap surface now announces the auto-revert close through a persistent sr-only `role="status"` region rendering the shared `ARM_EXPIRED_ANNOUNCEMENT` ("Confirm window closed. Nothing was changed.", lib/admin/destructiveConfirm.ts; value pinned by T5, declaration uniqueness by T4a, importer co-presence by T4 in tests/styles/\_metaDestructiveConfirm.test.ts). The `expired` flag is set only in the timer callback and cleared at arm + every dispatch entry (settlement-kind-independent), so explicit disarms stay silent and consecutive expiries always re-announce; BulkIgnoreControls keys expiry per group; ResolveAlert/Rotate/Revoke were restructured to single-return so the region node survives branch swaps; StagedReviewCard's `handleApply` gained the missing disarm (found in review — an Apply outlasting 4s could have announced "nothing changed" mid-mutation). Gap (2), the 4s-vs-speech timing, was owner-ratified CLOSED as keep-4s-and-announce (spec §1.1: the 8s raise and pause-while-focused alternatives were presented and declined; a missed window now announces its own close, so the user is never misled). Spec: docs/superpowers/specs/2026-08-01-announce-a11y-pass-design.md.

Original entry (provenance):

**Status:** OPEN (2026-07-25, destruct-thumb-order impeccable audit P2) · **Severity:** LOW · **Class:** A11Y, destructive-confirm family

Two gaps on the shared two-tap idiom, neither specific to one surface. The ARM itself is announced on the surfaces that carry a live region (`PendingPanelDiscardButtons` uses `role="status"`), so this row is about the close, not the open (R12 F3). (1) **Silent disarm:** at 4s the live region empties and the button's accessible name reverts, but a focused button's name change is not spoken — the user believes they are still armed. (2) **Timing:** 4s is tight against ~3s of polite speech for the arm message, so a screen-reader user may not finish hearing the prompt before the window closes. Fixing either well means revisiting `ARM_REVERT_MS` for assistive-tech users specifically, which is a family-wide decision (11 surfaces) rather than a component one. **Trigger:** an a11y pass on the destructive-confirm family, or any change to `ARM_REVERT_MS`.

## BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE — a remote rotation is silent under reduced motion — ✅ RESOLVED (2026-08-01, `fix/announce-a11y-pass`)

**Graduated:** 2026-08-01 — Resolved: ShareTokenContext gained a `remoteTokenChanges` counter that bumps only on a SEED-driven accepted non-null-to-non-null token change (a local rotate goes through `applyRotated` first, so its follow-up seed never counts; a picker-epoch reset advances the epoch without a token change and never counts). ShareHub watches it with the render-phase pattern and announces "Crew link changed. The earlier link no longer works." through a popover-root persistent sr-only region under EXACTLY the visual flash cue's predicate (open + linkActive; cleared by the same `(!open || !linkActive)` predicate) — owner-ratified mirror-the-cue scope, no closed-popover announcements. Spec: docs/superpowers/specs/2026-08-01-announce-a11y-pass-design.md §4.

Original entry (provenance):

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** UI A11Y

The crew-URL cue fires on ANY accepted token change, including another admin's rotation arriving through `router.refresh()`. On that path no banner mounts — the success banner renders off `result`, local state that only this browser's own action sets (`app/admin/show/[slug]/RotateShareTokenButton.tsx:82`, written at `:159`). So a reduced-motion admin watching a remotely-rotated link gets neither the cue nor an announcement.

NOT a regression: before the cue, a remote rotation swapped the URL silently for everyone, so this diff adds a signal for one group and removes none. Deliberately not fixed there because the fix is a new announcement surface — a live region owned by ShareHub that speaks a change this browser did not initiate needs its own copy, politeness level and repeat-suppression design, plus a decision about whether a background URL change should interrupt a screen-reader user at all. Trigger: an a11y pass on the admin share surfaces, or a report of a surprise URL change.

## BL-FOCUS-RING-CONTRAST — compute + meta-test `--color-focus-ring` contrast against every backdrop family — ✅ RESOLVED (2026-08-01, `fix/focus-ring-a11y-pass`)

**Graduated:** 2026-08-01 — Resolved: light `--color-focus-ring` went opaque `#E06000` (owner-ratified Option B from a rendered three-option mockup; old translucent orange measured 1.60:1 on white). Light `--color-info-bg` nudged `#EEEAE3`->`#F1EDE7` so info fills clear the floor (spec 3.1). tests/styles/focusRingContrast.test.ts pins the exact light value, dark-pair identity, and the computed nine-family matrix floor (light 3.07-3.59:1, dark composites 3.69-4.56:1). The ~90 bare `ring-offset-2` usages this row tracked were swept with container-matched companions (actual walker count 86 sites incl. an rg-invisible NUL-byte file; three `focus-visible:outline-accent` sites migrated to `outline-focus-ring`), enforced by tests/styles/noBareRingOffset.test.ts.

Original entry (provenance):

From the impeccable critique of `feat/sharehub-focus-pass` (Assessment A P2, 2026-07-23). `--color-focus-ring` is translucent orange (`rgba(255,140,26,0.55)` light / `rgba(255,160,71,0.65)` dark, DESIGN.md token table). Naive alpha-blend puts the light-mode ring around ~1.6:1 against white `--color-surface` — under the WCAG 2.2 SC 2.4.13 Focus Appearance ≥3:1 expectation — while dark mode lands ~4.5:1. Pre-existing and app-wide (every `focus-visible:ring-focus-ring` control), NOT introduced by the focus pass; the pass actually improved perceptibility where the offset gap now separates ring from fill. Work: compute real ratios per backdrop family (surface, surface-sunken, warning-text fill, accent fill), decide whether the light token needs a darker/opaque variant, and pin the outcome with a contrast meta-test (the `status-token-contrast` pattern). Owner decision needed on token change vs accepted-as-brand. **Measured 2026-07-25** (destruct-thumb-order audit, from rendered `getComputedStyle` rather than a naive blend): light composites to ≈`#FFC075` for **1.60:1**, dark **4.40:1** — confirming the earlier estimate. The same audit measured a bare `ring-offset-2` white halo at **17.90:1** against `bg-surface` in dark mode, which is the concrete cost of the ~90 pre-existing bare usages this row already tracks. Same sweep should reconcile the ~90 pre-existing BARE `ring-offset-2` usages (no color companion) outside the share-hub components with the DESIGN.md token-table rule the focus pass added ("never bare ring-offset-2") — each is a latent dark-mode white halo.

## BL-DEV-SWITCHER-BAR-MOBILE-WIDTH — attention-gallery switcher bar counter/description collapse to zero width on mobile — ✅ RESOLVED (2026-08-01, `fix/focus-ring-a11y-pass`)

**Graduated:** 2026-08-01 — Resolved: scenario label got a `min-w-12` floor (measured 0px at 390 before), counter keeps `shrink-0 tabular-nums`; five new data-testid hooks; the gallery e2e asserts the full 390x844 contract (no overflow, per-cluster containment, counter untruncated, label >= 48px, interactive controls >= 44px).

Original entry (provenance):

**Status:** OPEN · **Severity:** LOW (developer-only surface) · **Class:** responsive layout — surfaced by the modal-state-coverage impeccable critique (2026-07-22)

At the 390px mobile viewport the switcher bar's counter ("52 / 116") and scenario-description block measure clientWidth 0 (flex siblings squeeze them out), so the operator cannot tell which scenario is active on mobile. Desktop is unaffected. Pre-existing at origin/main 76288ca62 (section jump select landed with the bar); NOT introduced by the modal-state-coverage branch (zero layout-class hunks touch the bar in that diff). **Fix (when prioritized):** give the counter/description block a min-width floor (or wrap the bar) in components/admin/dev/AttentionModalSwitcher.tsx and add a 390px real-browser assertion to the gallery e2e.

## BL-IGNORED-SUMMARY-TAP-TARGET — Ignored (N) disclosure summary is under the 44px tap floor — ✅ RESOLVED (2026-08-01, `fix/focus-ring-a11y-pass`)

**Graduated:** 2026-08-01 — Resolved: the summary gained `min-h-tap-min inline-flex items-center` (the wizard summary recipe); browser measurement in the gallery e2e (expect.poll over getBoundingClientRect >= 44), red-proofed against the un-fixed component.

Original entry (provenance):

From the impeccable audit of `feat/crew-warning-attachment` (2026-07-23), pre-existing: the `Ignored (N)` `<summary>` in `components/admin/showpage/sectionWarningExtras.tsx` is a `text-xs` row with no `min-h-tap-min`, under the 44px floor, while `CrewUnderRowStack`'s equivalent "N more" summary carries it. Add `min-h-tap-min` + flex alignment to match.

## BL-INVARIANT8-CLOSEOUT-ENFORCEMENT — mechanically enforce that every invariant-8 plan ships a closeout

**Graduated:** 2026-08-01 — Resolved on `test/invariant8-closeout-enforcement`: the assertion removed in `a20b94457` returns as its own structural guard, `tests/docs/_metaInvariant8Closeout.test.ts` + walker `tests/docs/_invariant8Closeout.ts` — filesystem-walked unit discovery over every plan shape (flat, nested, category subdirs, closeout-attach), the machine marker grammar (`impeccable-gate: …` / `N/A — no UI surface` / TEMPLATE form, spec §3.3), a frozen 195-row pre-guard debt ledger with loud staleness, and write-path edits (AGENTS.md invariant 8, HANDOFF-TEMPLATE §12). Spec: `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md` (spec r3 APPROVE; plan r3 APPROVE). The three-step path the entry prescribed (ratify a convention, migrate or debt-list, restore as default-deny walk) shipped exactly, with the entry's lexical-hedge sketch superseded by the marker grammar (probe-refuted; spec §1.1.2).

Original entry (provenance):

## BL-INVARIANT8-CLOSEOUT-ENFORCEMENT — mechanically enforce that every invariant-8 plan ships a §12 closeout

Descoped out of the 2026-07-24 dev-row copy close-out after three consecutive whole-diff
review rounds on the same vector. The change shipped
`tests/docs/_metaDeferralLedgerGraduation.test.ts`, whose ledger invariants (no id both
active and archived; every graduated id archive-only) are enforceable and true. A third
assertion — every plan declaring an invariant-8 (impeccable) gate carries a `## 12`
closeout section — was removed, because it cannot be made both fail-by-default and
honest against the tree as it stands.

**Measured 2026-07-24.** `docs/superpowers/plans/` holds 33 flat `*.md` plans and 274
nested files that mention invariant 8 or impeccable. Plan files are variously
`plan.md`, `00-plan.md`, `PLAN.md`; closeouts are variously `closeout.md` inside a plan
directory or a sibling `<name>-closeout.md`. Of the 13 plan DIRECTORIES that declare the
gate, 12 have no `## 12` closeout section. There is therefore no rule that locates a
closeout for an arbitrary plan, so a filesystem walk silently under-reports; and a
registry-based version is an opt-in list, which is precisely the fail-by-default hole a
structural guard exists to close.

**Work when prioritized:** (1) ratify one closeout location convention; (2) migrate or
explicitly debt-list the existing plans; (3) restore the assertion as a default-deny
walk over that convention, requiring both gate halves named AND an affirmative P0/P1
disposition (a lexical check must reject hedges — "skipped", "pending", "not run",
"TBD" — since the earlier draft passed on "Critique skipped. Audit pending."). Note the
honest ceiling: any text assertion verifies SHAPE, not that a human actually ran the
gate.

## BL-CARD-COPY-HELPFULCONTEXT-PARITY — the canonical warning-card table's `helpfulContext` column is not gated against the catalog

**Status:** OPEN · **Severity:** LOW (documentation drift, no user-visible defect today) · **Class:** copy registry — surfaced by `docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md` R57 finding 1 (2026-07-30).

`docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.2 is the canonical warning-card copy table, but only its `triggerContext` column and four changed titles are byte-frozen against `lib/messages/catalog.ts` (`tests/messages/_metaWarningCardCopy.test.ts`, via `EXPECTED_TRIGGER_CONTEXT`). The `helpfulContext` column is gated by nothing: the master spec §12.4 appendix ↔ catalog parity that `x1` enforces says nothing about THIS table. Verified 2026-07-30: `HOTEL_GUEST_SPLIT_AMBIGUOUS` row 12 and its catalog entry already differ, and the suite passes. That is shipped copy and out of the inline-later-group feature's scope, so it was not retroactively frozen.

Rows 43-44 (`HOTEL_INLINE_GROUP_OWN_HOTEL`, `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED`) ARE frozen, via `EXPECTED_HELPFUL_CONTEXT` in `tests/messages/warningCardCopyRegistry.ts` and the matching byte-parity loop in `_metaWarningCardCopy` — the mechanism exists and is proven; what remains is back-filling rows 1-42. **Fix (when prioritized):** audit each of the 42 rows against its catalog entry, decide per row which side is correct (the canonical table or the shipped catalog copy), reconcile, then move every code into `EXPECTED_HELPFUL_CONTEXT` so the loop covers the whole registry. The reconciliation is a copy decision per row, not a mechanical sweep, which is why it is filed rather than bundled.

**CLOSED 2026-08-01** — resolved on feat/card-copy-parity-sync-job-names (spec 2026-08-01-card-copy-parity-sync-job-name): §4.2 rows 12/29 reconciled to the shipped catalog and EXPECTED_HELPFUL_CONTEXT back-filled to all 44 codes with a key-set completeness assertion.

## BL-SYNC-JOB-FOUR-NAMES — the sync job answers to four different names in Doug-facing copy

**Status:** OPEN · **Severity:** low (copy consistency; admin-facing) · **Surfaced:** #601 impeccable critique (2026-07-25), P3

One job, one audience, four words. `lib/cron/runSummary.ts:34` calls it **"Sheet sync"**; `components/admin/StagedReviewCard.tsx:90` labels its rows **"Auto sync"**; `lib/messages/catalog.ts:366` says **"the scheduled sync"** while `catalog.ts:693` says **"an automatic sync"** — the same catalog, two names, for the same thing.

The 2026-07-03 and 2026-07-25 sweeps (`BL-COPY-CRON-SWEEP`, `-2`) both removed jargon without unifying the noun underneath, and the second one's own consistency check cleared the _scopes_ ("Scheduled jobs" = the set of 9, "the scheduled sync" = one of them, "Auto sync" = a per-row source badge) while missing that the referent itself is named four ways. Not a bug and not urgent; it is the residue those sweeps left.

**Fix (when prioritized):** pick one name for the sync job, then apply the §12.4 three-way lockstep for the two catalog rows (spec prose + `pnpm gen:spec-codes` + `catalog.ts`) and plain edits for the other two sites. **Trigger:** the next admin-copy pass, or any new surface that has to name this job.

**CLOSED 2026-08-01** — resolved on feat/card-copy-parity-sync-job-names (spec 2026-08-01-card-copy-parity-sync-job-name): one name, "Auto sync" — six catalog codes via §12.4 three-way lockstep, the runSummary label, and the explainer mirror; the StagedReviewCard badge already read "Auto sync" and is unchanged.

---

## BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY — RESOLVED — the admin layout harness hand-writes the wrapper it measures inside

`tests/e2e/agendaBreakdown.layout.spec.ts` now renders the real `AgendaScheduleBlock` (PR #610 replaced
that transcription), but still hand-writes the surrounding `article` / `section` / `ul` / `li.min-w-0`
chrome. That `min-w-0` is load-bearing for the long-token overflow assertion, so the harness can stay
green while the ACTUAL admin wrapper overflows. Production Step 3 renders `AgendaBreakdown`
(`components/admin/wizard/step3ReviewSections.tsx:3300`), which has a modal-chrome branch the harness
does not reproduce.

**Why PR #610 did not close it — cost premise CORRECTED by review R3.** The first version of this
entry said `AgendaBreakdown` had "~30 hooks" and needed a new seeded harness. Both were wrong, and the
error is worth naming: the hook count came from `grep -c` over the whole 4000-line
`step3ReviewSections.tsx` and was attributed to the component. Measured properly,
`AgendaBreakdown` is **225 lines with 4 hook call sites in its own body** — `useContext` x1,
`useEffect` x2, `useLayoutEffect` x1. Method, so the number is checkable rather than asserted:
brace-match the function body from `export function AgendaBreakdown(` and count `use[A-Z]\w*(`.
Review R4 reported nine (adding three `useState` and two `useRef`); those do not appear anywhere
between this function and the next export, `PublishedAgendaList`. Child components it renders have
their own hooks — the relevant number for harness cost is the ones this component owns.

The machinery also already exists. `tests/e2e/_step3ReviewModalLiveEntry.tsx` browser-renders the REAL
modal via an esbuild IIFE bundle served over `node:http`, and already stubs `fetch` (`:36-62`,
pass-through for anything it does not intercept). The one thing standing between that harness and real
coverage is a single line: `tests/e2e/_step3ReviewModalHarness.tsx:158` hands the modal
`agendaBaseline: []`.

**Still deferred, on the corrected grounds:** closing it needs a non-empty `AdminAgendaItem[]` fixture
(`lib/agenda/agendaAdminPreview.ts:34`), an extract-route intercept, and its own bundle entry + spec —
because `buildSectionData` is shared, so changing the default fixture in place would perturb every
existing step3-review-modal spec. Additive work, not a new harness. Sized in hours, not the days the
original entry implied.

**Start here:** add an optional `agendaBaseline` override to `buildSectionData`
(`tests/e2e/_step3ReviewModalHarness.tsx:128`) defaulting to `[]`, so existing callers are untouched.

**Partially mitigated already:** since `standalone-e2e.yml` runs the whole standalone config unfiltered
on every PR, a change to `step3ReviewSections.tsx` now triggers this spec. It did not when the finding
was written, which assumed the retired path filter.

**Fix (when prioritized):** drive the real Step 3 surface in a seeded e2e run and assert the wrapper's
containment there, then delete the transcribed chrome. Overlaps `BL-STEP3-IMPECCABLE-LIVE-RENDER`.

**RESOLVED (2026-08-02, `test/step3-live-render-cluster`).** Spec `docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md` §4, plan `docs/superpowers/plans/admin/2026-08-02-step3-live-render-cluster.md` Tasks 4-5. The "start here" line was taken literally: `buildSectionData` (`tests/e2e/_step3ReviewModalHarness.tsx`) gained an optional third `agendaBaseline` param defaulting to `[]`, so no existing caller moved; a new browser entry (`tests/e2e/_step3ReviewModalAgendaEntry.tsx`) mounts the REAL `<Step3ReviewModal>` with a non-empty baseline and stubs only the extract-agenda POST. `tests/e2e/step3-review-modal.agenda.spec.ts` now measures the real `li[data-testid="agenda-item"]` wrapper at 320/390/720px, and the hand-transcribed `tests/e2e/agendaBreakdown.layout.spec.ts` was DELETED with all three of its assertion families re-homed first. **One correction the entry earned:** its premise that the `li`'s `min-w-0` is the load-bearing declaration is FALSE. Mutation-proved on the shipped spec — dropping `min-w-0` from `step3ReviewSections.tsx:3239` leaves all six cases green, because the agenda `ul` is `flex flex-col` and the automatic-minimum-size floor applies to its vertical main axis. The declaration that actually holds containment is `wrap-break-word` on the session title (`components/crew/AgendaScheduleBlock.tsx:166`); dropping THAT turns both 320px cases red. The shipped spec's header records this so the wrong premise does not propagate.

---

## BL-STEP3-IMPECCABLE-LIVE-RENDER — RESOLVED — live-render impeccable pass on the Step-3 Variant-B page

The Step-3 "Review & publish" Variant-B redesign (spec/plan `2026-07-04-step3-review-page-variant-b`) shipped its UI quality gate (invariant 8) via a real-browser static-harness (DI-1…DI-4, bite-verified), a manual DESIGN.md/PRODUCT.md/mock conformance review (close-out §12), and the whole-diff Codex cross-model review as external attestation. What it could NOT do: a `/impeccable critique` + `/impeccable audit` pass on the LIVE rendered page.

**Harness inventory re-verified 2026-07-25 — the item's "no live render" framing was wrong, twice over.**

First, "every Step-3 layout spec is a standalone static harness" is false: `tests/e2e/_step3ReviewModalLiveEntry.tsx:124` does `createRoot(rootEl).render(<LiveHarness />)` on the REAL `<Step3ReviewModal>` tree (esbuild-bundled, served over `node:http`), so drag, scroll-spy, and Tab traversal already run against real component JS in a real browser via `step3-review-modal.interactions.spec.ts`.

Second — and this is what actually shrinks the item — **a seeded real-app Step-3 render already exists.** `tests/e2e/admin-phase2-surfaces.spec.ts:67-74` signs in and boots the real app at `/admin?step=3`, asserting a 200. `tests/e2e/helpers/devCaptureStaged.ts` seeds `pending_syncs` + `onboarding_scan_manifest` (`seedStagedRow`, `:94`), then `openStep3Modal` (`:216-230`) navigates the real `/admin?step=3`, clicks the real card, and waits for `[data-step3-review-panel]`; `tests/e2e/dev-capture.spec.ts:197-218` drives that path. So the app boots, the DB is seeded, and the real modal opens.

**The residual gap is narrower than recorded:** the existing seed is a SINGLE row, and it already supplies the **clean/ready** state — `seedStagedRow` (`devCaptureStaged.ts:94-139`) inserts `status: "staged"` with a parsed `parse_result.show`, no review items and no finalize-failure code — and, importantly, **no resolved linked show**: it writes no `created_show_id` and uses a fresh Drive file ID, so `buildStep3Row` (`OnboardingWizard.tsx:285`) passes `linkedShow: null`. That null is what produces `ready`; a resolved linked show would return `live` / `ready_to_publish` / `held` at an earlier branch of `deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts:44-77`). The show-resolution step that would have supplied one is the `driveFileIds` → `showsRows` lookup at `OnboardingWizard.tsx:477-519`, feeding the row build at `:598-638`. So **five** row states are missing, not six: needs-a-look, demoted, no-details, blocking, set-aside. And no `/impeccable critique` + `/impeccable audit` has been run against that render. This is _extend an existing seed helper and run the dual-gate_, not _stand up a live Step-3 seed from scratch_. Size it accordingly.

Current surface files: `components/admin/wizard/Step3Review.tsx`, `Step3ReviewModal.tsx`, `step3ReviewSections.tsx`, `Step3ReviewWithFinalize.tsx`, `Step3SheetCard.tsx`, plus the live-tree shells `components/admin/review/ReviewModalShell.tsx` and `components/admin/review/ShowReviewSurface.tsx` (imported at `Step3ReviewModal.tsx:46,55`, bound in JSX at `:372,666`), and `components/admin/OnboardingWizard.tsx`, which mounts `Step3ReviewWithFinalize` at `:699` and `:731` (`:35` is only the import).

**Fix (when prioritized):** extend `seedStagedRow` to cover the five missing states (the reserved wizard session already exists; add ≥1 needs-a-look, ≥1 demoted, ≥1 no-details, ≥1 blocking, ≥1 set-aside row alongside the ready row it already seeds), then run the impeccable v3 dual-gate against the live `/admin?step=3` render — including an explicit dark-mode warn-contrast check and the double-"Review" affordance on demoted RESCAN cards (close-out §12 finding 7).

---

## Test-safety hardening (2026-07-05)

**RESOLVED (2026-08-02, `test/step3-live-render-cluster`).** Spec `docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md`, plan `docs/superpowers/plans/admin/2026-08-02-step3-live-render-cluster.md` Tasks 1-2 and 6. `seedStagedRow` gained per-variant options and a new `seedStep3StateGallery()` seeds all six card states into ONE wizard session under the per-show advisory lock, so `/admin?step=3` renders the whole gallery; `assembleStep3Row` was extracted from `OnboardingWizard.tsx` to give the matrix test a real executable seam. The impeccable v3 dual-gate then ran against that LIVE render at 390/1280px in light and dark. Results, full findings, and dispositions are in §12 of the plan; the marker is `impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=1 dispositions=recorded`. Both explicit checks this entry demanded were performed: dark-mode warn contrast PASSES at AAA (9.64:1 on the warn card, 9.68:1 for the chip on surface), and the demoted double-"Review" affordance was left alone as ratified. No P0; one P1 and four P2, all pre-existing and outside the diff, deferred under `STEP3-GALLERY-TAP-TARGETS-1` in `DEFERRED.md`.

---

## BL-SOURCE-NUL-BYTE-STEP3REVIEW — RESOLVED — a committed NUL byte makes one source file invisible to grep

`components/admin/wizard/Step3Review.tsx` carries a raw U+0000 at byte offset 53375 — `uncheckedCleanNames.join("<NUL>")`, committed as a literal NUL instead of the two-character escape `\u0000` (commit `fc75a9bcd`). `file(1)` reports the file as `data`, so **`grep` skips it silently**: no match, no "Binary file matches" line, no error. Any grep-based audit of `components/**` under-reports by this file, and one such audit did exactly that while enumerating references for the Step-3 deletion guard. Guards that read with `readFileSync` are unaffected. **Fix (when prioritized):** replace the raw byte with the escape sequence. Deferred rather than fixed inline because `components/**` is a UI surface, so a zero-behavior byte change would trigger the invariant-8 impeccable dual-gate.

**RESOLVED (2026-08-02, `test/step3-live-render-cluster`).** Plan `docs/superpowers/plans/admin/2026-08-02-step3-live-render-cluster.md` Task 3. The raw U+0000 in `components/admin/wizard/Step3Review.tsx` is now the escape `\u0000` (runtime-identical string), so `file(1)` reports text and `grep` no longer skips the file. Fixed red-first: a new assertion in `tests/admin/step3DeletionSafety.test.ts` fails on ANY scanned source file containing a raw NUL, so the class is closed rather than the instance. The entry's stated reason for deferring — that a `components/**` byte change would trigger the invariant-8 dual gate — was discharged by running that gate in the same branch (Task 6).

## BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS — RESOLVED (2026-08-02, `fix/admin-popover-overlay-cluster`)

The hub's own `fixed inset-0 z-20` backdrop painted over its NON-POSITIONED trigger siblings and swallowed their taps; a trigger click only appeared to work because the backdrop's handler closed the popover, which is why focus was never restored. Closed with a THREE-term elevation gate on the triggers (`open && !busy && !attentionMenuOpen`), the menu term threaded PublishedReviewModal → StatusStrip → ShareHub. The third term is load-bearing: the attention menu's panel is z-20 in the same band, and an unconditional elevation is the regression share-hub-fidelity-fixes §3 already had to fix once. Real-browser proof in `tests/e2e/admin-lifecycle-layout.spec.ts` (T-BACKDROP-TRIGGERS (a) hit test, (b) a real click that pre-fix could not even dispatch — Playwright reported the backdrop intercepting pointer events).

### BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS — the hub backdrop swallows taps on its own triggers

**Status:** OPEN · **Severity:** LOW (near-invisible in use) · **Class:** stacking-context misconception.

With the hub open, the `fixed inset-0 z-20` backdrop wins the hit test over both trigger buttons. The root's (now removed) open-gated `z-30` elevated the WHOLE root, backdrop included, and never ordered that fixed child against its non-positioned trigger siblings — so `tests/components/admin/showpage/shareHub.test.tsx` pinned class-level z values and read them as paint order, the exact failure `T-HUB-ZORDER`'s own comment warns about.

**Pre-existing, not a regression:** the same `elementFromPoint` probe fails identically with `origin/main`'s `ShareHub.tsx` checked out in place. Near-invisible because the backdrop's own handler closes the popover, so a trigger tap still dismisses — just via the outside-click path, without focus restore.

**Fix shape:** give the trigger group its own open-gated stacking level above the backdrop, or move the backdrop into the portal beneath the body; then restore the trigger assertions in T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts`), which were deliberately scoped out rather than asserted as expected so the eventual fix does not look like a regression.

---

## BL-ATTENTION-MENU-PANEL-CLIP — RESOLVED (2026-08-02, `fix/admin-popover-overlay-cluster`)

Filed by the popover-overlay registry as `unverified-gap`, then MEASURED: at 390×560 the panel overhung the clipping modal panel by 55px with a 54px stranded tail, so the suspicion was right. The scroller now takes the shared `useFitWithinClip`, capping `max-h-96` against the clip edge, and gains `role="group"` + `aria-label="Show issues"` + `tabIndex={0}` so a monitoring-only list (all read-only rows, zero focusable descendants) is still keyboard-reachable. Registry row flipped to `fit-within-clip`.

### BL-ATTENTION-MENU-PANEL-CLIP — attention menu is an anchored, capped scroller inside the clipping panel

**Status:** OPEN · **Severity:** UNVERIFIED (needs measurement before triage) · **Class:** same as `BL-SHAREHUB-ARM-VIEWPORT-REVEAL`, which graduated to `BACKLOG-archive.md` when it shipped.

Surfaced BY the structural registry added in `feat/sharehub-archive-copy-reveal` (`tests/components/admin/showpage/popoverOverlayRegistry.ts`), which is the point of building it. `AttentionMenu` mounts INSIDE the `overflow-clip` review-modal panel (`components/admin/showpage/PublishedReviewModal.tsx`), is absolutely anchored (`components/admin/showpage/AttentionMenu.tsx:119`, `top-[calc(100%+8px)]`) and carries its own capped scroller (`components/admin/showpage/AttentionMenu.tsx:130`, `max-h-96 overflow-y-auto`), while using neither clip-safety mechanism.

The original spec sweep missed it because that grep required `top-full` and this component uses an arbitrary anchor — exactly the false negative plan-review R3 predicted, then demonstrated on a real file.

NOT fixed on suspicion: whether it strands content depends on measured geometry, and it sits near the panel top where 384px may well fit. **Probe recipe:** open the menu at 390x{844,667,560} with enough items to fill `max-h-96` and assert the last item is reachable via `elementFromPoint`, the shape spec §9.2 uses. Registered as `unverified-gap` so the guard stays green while the question stays visible.

---

## BL-PUBLISHED-TOGGLE-OVERLAY-CLIP — RESOLVED (2026-08-02, `fix/admin-popover-overlay-cluster`)

Same class on the anchored refusal banner: measured overhang 43.7px past a 220px clip, with `overflow-y: visible` so the tail was simply cut. Now capped by `useFitWithinClip`, made a real scroll container (`overflow-y-auto`), and given `aria-label="Publish error details"` + `tabIndex={0}`. The finalize hint shares the popover testid but is an in-flow chip and deliberately did NOT acquire the treatment — pinned as a mode boundary.

### BL-PUBLISHED-TOGGLE-OVERLAY-CLIP — published-toggle error overlay can be cut by the panel clip

**Status:** OPEN · **Severity:** LOW · **Class:** as above, weaker variant.

`components/admin/PublishedToggle.tsx:59` anchors an error banner `absolute inset-x-0 top-full` inside the clipping panel. Unlike the share hub it carries NO cap and NO internal scroller, so it cannot strand content in a hidden scroll tail — the failure mode the registry exists for — but a long enough error could still be visually cut at the clip edge. Error-only and momentary (`components/admin/PublishedToggle.tsx:55`), hence out of scope for the placement migration.

---

## BL-SHAREHUB-CONFIRM-NAMES-SHOW — RESOLVED (2026-08-02, `fix/admin-popover-overlay-cluster`)

The armed Archive confirm now names the show, in owner-ratified copy: `Crew links for “{name}” stop working now and won’t come back until you re-publish and issue a new link.`, with the armed group labelled `Confirm archiving “{name}”`. A blank-safe guard (absent / empty / whitespace) renders today's strings byte-identically, so every non-hub call site and any partial data during editing is unchanged, and the prop is consumed ONLY in the `asRow` armed branch. A no-truncation pin keeps a pathological title fully visible — eliding the show's name on a destructive confirm is the failure mode that matters.

### BL-SHAREHUB-CONFIRM-NAMES-SHOW — armed Archive confirm does not name the show it will archive

**Status:** OPEN · **Severity:** LOW · **Class:** destructive-confirm context.

Surfaced by the impeccable critique of `feat/sharehub-archive-copy-reveal` (2026-07-24, finding 1). On short viewports the hub popover now places ABOVE its trigger, which covers the show title and status band — so at the moment the operator arms a destructive action, the surface no longer shows which show they are acting on.

Placement is not the thing to change: opening upward is what makes the confirm reachable at all, and the prior behaviour was a popover clipped off-screen, which is strictly worse than an obscured title. The better fix is to make the confirm self-describing — name the show in the armed consequence sentence, so context travels with the decision instead of depending on what happens to be visible behind the popover.

Fix shape: include the show title in the armed confirm copy in `components/admin/ArchiveShowButton.tsx`, and pin it in `tests/components/admin/showpage/shareHub.test.tsx`. Copy is owner-ratified (destructive-confirm-pass §R7), so this needs a copy decision, not just an edit.

---

## BL-SHAREHUB-OPEN-TIMER-LEAK — RESOLVED (2026-08-02, `fix/admin-popover-overlay-cluster`)

Closed as a MEASURED ARTIFACT, not a product leak. Root cause: the open-focus effect's `panelRef.current?.focus()` makes jsdom run `Selection._associateRange`, which arms a `setTimeout(0)` of its own; under fake timers that macrotask is never drained, so it shows up in `getTimerCount()`. A real browser has no such timer. No component change was warranted; the delta-based assertion style stays (a global zero-count assertion is unusable in jsdom by construction) and the root cause is now recorded at the delta baseline so the next reader does not re-bisect it.

### BL-SHAREHUB-OPEN-TIMER-LEAK — opening the hub arms a timer that survives unmount

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** RESOURCE HYGIENE

Measured while writing the cue's teardown coverage: rendering ShareHub arms zero timers, opening the popover arms one, and unmounting the tree leaves that one behind. The cue's own timer cleans up correctly — the leak predates it and belongs to something the popover mounts.

Consequence today is limited to test hygiene: it makes a global `vi.getTimerCount()` assertion unusable, which is why `shareHubFlashState.test.tsx` measures a delta against a post-open baseline rather than expecting zero. Trigger: bisect the popover's children for the un-cleared `setTimeout`, or promote if a real leak surfaces under repeated modal open/close.

---

## BL-POPOVER-SHARED-RAF-COALESCER — RESOLVED (2026-08-02, `fix/admin-popover-overlay-cluster`)

The duplicated leading-edge rAF throttle extracted to `lib/popover/rafCoalescer.ts` and adopted by both consumers, with the pending flag cleared BEFORE running so events landing mid-frame can schedule the next one. Adoption is held by an AST meta-test that resolves callees through the TypeScript type checker rather than matching identifier text, so a same-named local const, a shadowing function parameter, and a decoy-module import all fail it (each demonstrated as a reverted mutant). Both consumers' cleanups now cancel through the shared instance.

### BL-POPOVER-SHARED-RAF-COALESCER — one coalescer helper for both popover consumers

**Filed:** 2026-07-25 (impeccable audit P2) · **Class:** code duplication / drift risk · **Effort:** S

`HoverHelp` and `ShareHub` each implement their own rAF coalescer. They now have IDENTICAL leading-edge throttle semantics, but only because a P1 in the same audit caught them diverging: ShareHub's was a debounce, which silently defeated pan-tracking once a high-frequency `visualViewport` source was attached. The bounds policy was extracted to `lib/popover/place.ts`; the coalescer was not.

**Work:** extract a shared helper and delete both local copies. `shareHubVisualViewport.test.tsx` T-S8 pins throttle-vs-debounce and should move with it.

**Status:** open.

## Merged from the plans backlog (2026-08-02) — already terminal at merge time

These 12 were closed in place in `docs/superpowers/plans/BACKLOG.md`, which never carried the
open-queue-only rule this pair enforces. Recorded unchanged; each states its own resolution.

### BL-VENUE-MAP-DARK-DOUBLE-FETCH — Dark-mode venue-card first paint fetches the light static map, then re-fetches dark — ✅ SHIPPED (2026-07-17, fix/venue-card-vcr2-vcr3)

**Resolution:** `VenueMapTile` now initializes `theme` to `null` and mounts the `<img>` only after the post-hydration effect resolves the applied theme, so SSR/first paint render only the always-painted stripe base (no `<img>`, no proxy fetch) and the image mounts once with the correct theme — no light→dark double-fetch, no hydration mismatch. Prospective row (never separately filed); tracked via DEFERRED.md VCR-2, now RESOLVED.

### BL-VENUE-LINK-ONLY-EMPTY-CARD — A venue whose only field is a valid Maps link renders a visually empty card — ✅ SHIPPED (2026-07-17, fix/venue-card-vcr2-vcr3)

**Resolution:** `VenueBreakdown` now mounts the map region on `query || mapHref` (was `query` alone) and `VenueMapTile` renders a degraded stripe + Directions tile (anchored to the Maps link, no `<img>`) when the query is empty but `mapHref` is valid. A non-empty-but-non-parseable `googleLink` (e.g. `"TBD"`) remains an accepted degenerate (count ≥ 1, region collapses, no dead anchor). Prospective row (never separately filed); tracked via DEFERRED.md VCR-3, now RESOLVED.

### BL-HOTEL-DASH-STREET-NUMBER-CLIPPED — A dash-prefixed street number is deleted as a conf# and the address is lost — ✅ RESOLVED (2026-07-03)

**Resolution (2026-07-03):** Fixed in `stripConfTokens` (`lib/parser/blocks/hotels.ts`). The dash-conf# replacer now threads the street-vs-conf discriminator: a `dash + 4–5-digit` run whose number BEGINS a street phrase (`looksLikeStreetStart` — suffixed street OR `…, ST ZIP` tail, the same discriminator the Hotel-Stays path uses) is preserved, keeping the number but dropping the separator dash so the flattened `name number street` form is exactly what `splitHotelNameAddress` expects. A `#`-marked run (`- #1515`) or a non-street dash-number (a real conf#) is still stripped. A suffixed dash-street now splits into name+address; a suffixless one stays glued but the number is no longer lost (the #3 safe fallback, no data loss). TDD: 5 cases in `tests/parser/blocks/hotels.test.ts` (suffixed split, suffixless glued-but-preserved, dash-conf# still stripped, 4-digit non-street conf# stripped, ZIP+4 idx4 not regressed); full parser suite (1412) + typecheck green; Codex-reviewed.

**Origin:** PR #38–#217 audit finding idx88, probe-confirmed 2026-07-03. `stripConfTokens` (`lib/parser/blocks/hotels.ts`) deletes a `dash + 4+ digits` run as a confirmation number. For a hotel written `"Hyatt Regency - 1515 Broadway New York, NY 10036"`, the `- 1515` street number is deleted; the remaining `"Hyatt Regency  Broadway New York, NY 10036"` then has no leading street number for `splitHotelNameAddress` to split on, so the WHOLE string becomes `hotel_name` and `hotel_address` is **null**. Probe: `{name:"Hyatt Regency Broadway New York, NY 10036", address:null}`. (The sibling idx4 ZIP+4 clip — a dash IMMEDIATELY after a digit — was fixed 2026-07-03 via a `(?<!\d)` lookbehind; this dash-STREET case has a space before the dash, so that lookbehind does not cover it.)

**Why backlog (not shipped with idx4):** the fix needs the street-vs-conf DISCRIMINATOR — do not strip a `dash + number` when the number begins a street phrase — which means threading `STREET_ADDRESS_RE` into `stripConfTokens` (currently a stateless regex-replace). That is the delicate hotel guest/conf#/address boundary that took Codex 3 rounds (BL-PARSER #3 history), and a naive lookahead can't distinguish `"- 1515 Broadway"` (street) from `"- 2035940 John Clark"` (conf# then next guest). Reachability is also lower than idx4: the exporter space-joins multi-line address cells (no dash), so the dash only appears when an operator types `"Hotel - <number> <street>"` on one line. Pick up with a focused pass that reuses `STREET_ADDRESS_RE` as the discriminator (like the inline no-Check-In path already does) and re-runs the full hotel suite.

### BL-EXPORTER-MULTIFORUM-BANNER-TITLE — ✅ RESOLVED (2026-07-03): a mashed multi-forum banner no longer beats the curated Event Name

**Origin:** exporter-gap audit 2026-07-03 (skeptic-upheld, MEDIUM, plausible-future). `synthesizeMarkdownFromXlsx`'s `shouldPreserveNewlines` (`lib/drive/exportSheetToMarkdown.ts`) flattens any cell with `≥ 3` lines (space-join, no `&#10;`). The CLIENT-tab row-1 **title banner** is column-duplicated across the full row; when it carries ≥3 lines (a co-located 3+-forum combined event, or forum + subtitle + year), flattening strips the `&#10;` markers. `lib/parser/index.ts`'s #0 banner branch guard `!/&#(10|9);/.test(col0)` then passes, `isAcceptableTitleCell` passes, and #0 returns the **mashed** banner (`"II - Alpha Forum II - Beta Forum II - Gamma Summit 2025"`) as `show.title` BEFORE the #1 `Event Name:` / #2 `Title of Event` value can win. Probe-confirmed end-to-end; the identical content across **2** lines preserves `&#10;`, so #0 correctly skips it and the clean curated title wins (this is exactly how redefining-fi's real 2-forum "RFI & PC Chicago" banner works today — pinned by `infoTabFidelity.test.ts:111`). Crossing the 3-line boundary flips the title.

**Why backlog (not shipped with the GS-header gap):** harm is title-**quality** degradation, not data loss — the output is still a valid non-empty title of real banner text (comparable to fintech's shipped `"II - FinTech Forum CTO Summit 2026"`), no crash / wrong-show / security issue — and the 3+-forum input is plausible-future, not in the corpus. Both candidate fixes touch a delicate, working title pipeline: (a) in the exporter, detect a **full-row-duplicated** banner cell and preserve its newlines regardless of line count (needs row-width context that `shouldPreserveNewlines` lacks — move the check up into the block/grid stage); or (b) in `index.ts`, let a present non-null `Event Name:` / `Title of Event` value **outrank** the #0 banner branch when the banner's flattened text repeats a title-prefix token (e.g. multiple `"II -"`). Prefer (b)-minimal but gate it so a legit single-forum banner still wins. Pick up with a title-precedence decision; add an `infoTabFidelity` case for the 3-forum shape.

### BL-ROOMS-BREAKOUT-REUSE-DROP — ✅ RESOLVED (2026-07-03): reused breakout now MERGES into one card

**Origin:** PR #38–#217 bug audit finding idx20 (#106), re-verified at HEAD 2026-07-03. `parseBoRooms` (`lib/parser/blocks/rooms.ts`) dedups numbered breakouts by their bare venue name (`headerKey = split.name.toUpperCase()`, where `splitRoomHeader` strips the `BREAKOUT N` prefix). So two genuinely-distinct entries that reuse the SAME physical room across days — e.g. `BREAKOUT 1 SALON A` (Day-1 setup/time) and `BREAKOUT 2 SALON A` (Day-2 setup/time) — collapse to one key and the second is SILENTLY dropped (no warning), losing that day's schedule/AV. Probe-confirmed on constructed input; **not present in the current 7-show corpus** (every corpus breakout has a distinct venue), so latent — but a multi-day show reusing a room is a probable future input.

**Why backlog (not a one-line fix):** un-deduping in `parseBoRooms` alone does not fix it — `mergeRooms` ALSO keys on `kind + name` (`keyOf = \`${r.kind}::${name.toUpperCase()}\``), so two rooms both named `SALON A`re-collapse there. A correct fix needs a room-MODEL decision: (a) keep two DISTINCT entries (needs distinct names/keys — changes displayed names, and the crew UI shows a room card per entry), or (b) MERGE across days like the east-coast`MABEL 1`GS/breakout reconciliation (but room fields`setup`/`show_time`/`strike_time`are single-valued, so a merge is lossy unless the model gains per-day slots). This is a product/data-model call, not a mechanical parser tweak; forcing a fix risks confusing duplicate cards or lossy merges. Pick up with an owner decision on the multi-day-room model.`idx23`/`idx22`(non-ordinal floors, dangling dims) from the same audit shipped separately (they are contained`splitRoomHeader` corrections).

### BL-ONBOARDING-SCAN-TRANSIENT-THROTTLE-RETRY — ✅ RESOLVED (shared Drive-fetch-layer retry/backoff)

**✅ RESOLVED (2026-06-23).** Fixed in the follow-up via the **shared Drive-fetch-layer** option (the BL's "natural home"). `lib/drive/fetch.ts` now: (a) `DriveFetchError` carries `status` (transient export 429/5xx are detectable, not flattened into the message); (b) `withDriveRetry(op, opts?)` retries ONLY transient statuses (429/500/502/503/504) with bounded exponential backoff (250/500/1000ms) + jitter, default 3 retries — non-transient errors (revision races, 404, omitted metadata) propagate immediately; (c) a named `driveFilesGet`/`driveFilesGetCall` thunk wraps every `drive.files.get` and the xlsx export `fetch` is wrapped too, so ALL callers benefit — onboarding scan + cron (`runPushSyncForShow`) + manual sync (`runManualSyncForShow`) + retry. Test injection via `DriveFetchOptions.retry` ({sleep, maxRetries, random}); 5 new `tests/drive/fetch.test.ts` cases (transient-retry-then-succeed, non-transient-no-retry, bounded-exhaustion, export-retry, export-non-transient). Two structural meta-tests updated for the new named thunk site: `_scopeCheckContract` (`driveFilesGetCall` exempt raw wrapper) + `_sharedDriveSupportContract` (`supportsAllDrives: true` inlined at the single `.files.get` site).

<details><summary>Original filing</summary>

**Filed:** 2026-06-22 from PR #73 (onboarding folder-scan prepare parallelization) Codex adversarial review R1 (MEDIUM).

**Description:** `prepareOnboardingFiles` (`lib/sync/runOnboardingScan.ts`) fetches each sheet's Drive metadata + xlsx export (plus conditional enrich reads) with bounded concurrency. The Drive fetch layer (`lib/drive/fetch.ts`, `lib/drive/client.ts`) has **no retry/backoff** and propagates rate-limit / transient errors unchanged, and `prepareOnboardingFiles` has no per-file error handling — so a single transient Drive throttle (429/503) or blip in any sheet aborts the whole scan, which the wizard route surfaces as a failed "Verify your folder" step (the wizard session is already reserved/purged before the scan call). PR #73 deliberately bounded the prepare concurrency (cap 6) so parallelism does not materially raise this risk, but the underlying abort-on-transient-failure gap is **pre-existing** — the prior strictly-serial loop had it too.

**Why backlog, not deferred:** No concrete trigger. On the real FXAV workload (a bounded number of shows per folder, ≤~6 Drive calls per sheet, cap-6 in-flight) a transient-throttle-induced scan failure is low-probability, and the conservative cap is the standing mitigation. A real fix needs a design call: retry-with-backoff scoped to the prepare path, vs. hardening the shared `lib/drive/fetch.ts` layer (which would also change the cron + manual-sync paths and needs the Drive error shape surfaced first — `DriveFetchError` currently flattens the HTTP status into its message, so transient detection requires carrying the status). Either path is its own focused change + tests, not in-scope for a parallelization PR.

**Promotion prerequisite:** EITHER (a) an operator observes a real onboarding-scan failure traced to a transient Drive throttle/blip, OR (b) a v1.x sync-robustness milestone bundles Drive-layer retry/backoff across the onboarding + cron + manual-sync paths (the natural home, since the gap is shared). _(Resolved via option (b).)_

</details>

---

### BL-APPLYSTAGED-SUPERSESSION-ROLLBACK — ✅ RESOLVED (PR for fix/applystaged-supersession-rollback)

**✅ RESOLVED (2026-06-23).** Filed from PR #80 Codex adversarial-review R3 (HIGH, Finding 2) and fixed in the follow-up.

**The bug class:** a wizard-scoped apply/restage runs on the per-show locked tx; if the session flips AFTER a wizard-scoped write but BEFORE the next EXISTS-guarded statement 0-rows, the code RETURNED `wizard_superseded` normally → `withPostgresSyncPipelineLock` (`sql.begin`) COMMITTED the already-executed partial writes as residue.

**Audit result (parallel multi-agent + direct verification of all six `return wizard_superseded` sites in `applyStaged.ts`):**

- **THROW (partial write precedes):** `1084` (`recordWizardApplyHardFail`'s `pending_ingestion` upsert succeeded, then `markWizardManifestHardFailed` 0-rowed), `1105` (`approveWizardPendingSync`'s `wizard_approved` UPDATE succeeded, then `markWizardManifestApplied` 0-rowed), `1554` (the restage's UNGUARDED `deleteWizardPendingSyncsExcept` — which wipes the **superseding** session's staged rows — + `deleteLivePendingIngestion` ran before the scan reported superseded).
- **LEAVE as return (no preceding locked-tx mutation):** `1066` (first guard, after only reads), `1099` (`approveWizardPendingSync` 0-rowing = no write; the mutating `recordWizardApplyHardFail` branch returns at 1086/1088 instead), `1425` (read-only preflight in its own dedicated locked tx).

**Route topology (the original filing pointed at the wrong routes):** these throws are reached **ONLY via the WIZARD apply route** `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply` (`sourceScope: "wizard"`) — NOT the live `show/staged` routes (`sourceScope: "live"`, never hit the wizard branch). That route's catch mapped any throw to a body-less **500**; added the rollback catch → 409 + `WIZARD_SESSION_SUPERSEDED_RACE` alert (mirrors the retry route). The wizard **discard** route already caught `discardStaged`'s throws (no change). The **finalize** path uses `applyStagedCore` (not `applyStaged_unlocked`) so it never reaches these sites. Added `"apply"` to the `WizardSessionRollbackContext.attemptedAction` union.

**Tests:** the wizard apply route maps the thrown rollback to 409 + alert (`wizardScopedReapply.test.ts`). The throw→tx-abort→rollback mechanism is proven by PR #80's `wizardSessionCasRaceDb` in-scan real-DB test (same lock + same error). **Residual follow-up:** a dedicated real-DB apply partial-commit test (the wizard-apply route tests use a Fake tx) — the mechanism is proven by proxy + the throws are code-verified.

---

### BL-NEEDS-ATTENTION-DARK-CAPTURE-FLAKE — nondeterministic dark-mode screenshot baseline — **RESOLVED 2026-06-11 (PR #22, 709d4b6a)**

**Resolved** the same day it was filed, by the deferred-easy-wins PR #22 drift-gate investigation (which hit the same flake 3/3 on its own runs and root-caused it). Diagnosis matched this entry's "when picked up" plan: a new artifact-upload-on-failure step in `screenshots-drift.yml` made the failing bytes downloadable; pixel-diff showed 253 px at max channel delta 6/255 (sub-perceptual raster jitter, full-width band y136-254) — **runner-class bimodality**, not a UI change: loaded `pull_request` runners rendered ±LSB differently than idle `workflow_dispatch`/local runners (signature: drift gate failed while `screenshots-regen` reported "no baseline changes" on identical content). Fixes shipped in PR #22: (a) `waitForQuiescence` gains `document.fonts.ready` + double-rAF paint settle (M11-A-D5 recipe); (b) raster-path launch flags `--disable-gpu --disable-partial-raster --force-color-profile=srgb` via shared `scripts/capture-launch-args.ts`, consumed by `captureAll()`'s own `chromium.launch` AND both Playwright configs (Codex R2/R3 caught two launch paths the flags weren't reaching); (c) the dark baseline regenerated from CI's own bytes via the sanctioned `screenshots-regen` dispatch (`683df34a`); (d) the artifact upload stays, so any future drift is diagnosable. Drift gate green on the re-baselined head under a loaded PR runner. Memory: `feedback_screenshot_capture_runner_bimodality.md` (Opus-internal). Original entry retained below for the record.

_Original entry:_ Filed 2026-06-11. `needs-attention-mobile-dark.webp` is bimodally nondeterministic in CI's drift capture: PR #20 passed first-try, PR #21 failed → rerun passed, PR #23 failed → rerun (this entry filed while pending). Light variant has never flaked. The drift gate is starting to cry wolf — every unrelated PR pays a rerun. When picked up: diff the two CI byte-variants (download artifacts from a failing + passing run) to identify the unstable pixels (suspects: dark-mode font rasterization on the empty-state card, AlertBanner async settle, missing `expectStableMs`/`waitFor` on the manifest entry — `scripts/help-screenshots.manifest.ts` `needs-attention-mobile` has neither while the capture runner supports both); then either stabilize the capture (waitFor + expectStableMs) or, if the instability is encoder-level, regenerate the dark baseline from CI's own modal bytes and add a retry-compare to the drift job. Technical home: `scripts/help-screenshots.manifest.ts` + the drift workflow.

### BL-ACCENT-ON-BG-AA-CONTRAST — ✅ SHIPPED 2026-07-16 (accent-contrast token pass, feat/accent-contrast-token-pass)

**✅ SHIPPED (2026-07-16).** The dedicated token/accessibility pass landed: light `--color-accent-on-bg-runtime` `#c25e00` → `#a65000` (5.34:1 on bg; ≥4.5:1 on every audited tinted text fill — accent/10, accent/15, accent-tint, stale-tint), light `--color-accent-text-runtime` `#ffffff` → `#0e0f12` (dark-text-on-orange CTAs, 8.23:1 both modes), NEW `--color-accent-edge` (`#7a3d00` light) as the ≥3:1 toggle/pill ON-boundary, DESIGN.md §1.1/§1.2 figures corrected to measured values and pinned by `tests/styles/design-figure-parity.test.ts`, accent rows pinned in `tests/styles/status-token-contrast.test.ts`, raw-accent-text ban (`tests/styles/_metaRawAccentText.test.ts`) and per-occurrence `bg-accent` disposition registry (`tests/styles/_metaBgAccentInventory.test.ts`). Also resolved: DEFERRED STEP3MODAL-1, DEVTIER-2, VCR-1 (eyebrows re-pointed to `text-subtle`; `text-text-faint` token itself unchanged — decorative uses keep the third hierarchy tier), TEL-1, TEL-2. Historical filing below.

**Filed:** 2026-06-22 (invariant-8 impeccable audit P2 on the `/help` prose typography layer, branch `feat/help-prose-typography`). The light-mode `--color-accent-on-bg-runtime` (`#c25e00`, `app/globals.css:244`) on the page background `#fafaf9` (`:231`) computes to **4.11:1** — below the 4.5:1 AA floor for normal-size text. DESIGN.md §1.1/§1.2 assert this pair is `4.6:1` ("AA body"); that figure is a miscalculation (gamma 2.2-vs-2.4 error). Dark mode (`#ffa047` on `#0f1014`) is 9.39:1 (AAA) and unaffected.

This is **pre-existing and project-wide**: `--color-accent-on-bg` is the link/emphasis text color on StagedReviewCard, the onboarding wizard, IdentityChip, DashboardFooter, etc. — all 4.11:1 on `--color-bg`. The `/help` prose layer originally adopted it as the body-prose link color too, but the **Codex adversarial review (PR #74) blocked that**: newly applying a sub-AA token across the whole help-center body-link surface is a fresh AA regression, not something to backlog. So `/help` prose links were changed to inherit the high-contrast body text color + underline in every state (matching the Header/Breadcrumb chrome, ≈16:1 AAA; the accent is NOT used at rest OR on :hover — round 2 of the review caught a hover regression, since WCAG 1.4.3 is not waived for hover text) — `tests/help/help-prose-layer.test.ts` pins that the prose-link rules set no sub-AA accent in any state and that the inherited color clears 4.5:1 in both modes. **`/help` therefore no longer consumes the sub-AA token for body links.** This backlog item now covers ONLY the remaining app-wide consumers (StagedReviewCard / wizard / IdentityChip / DashboardFooter / status pills) where accent-on-bg is still used as small-text color.

**Why backlog, not now:** the correct fix is at the token layer. Darkening `--color-accent-on-bg-runtime` (light) from `#c25e00` to ~`#b35600` (≈4.6:1 on `#fafaf9`) changes the orange on **every** accent-on-bg consumer (admin + crew), requires correcting the DESIGN.md §1.1/§1.2 figures, and would shift the `/admin` screenshot baselines (which the screenshot-drift gate pins) — a much larger blast radius than a content chunk, and a brand decision (it nudges the brand orange darker).

**Promotion prerequisite:** a dedicated token/accessibility pass that (a) picks the darker light-mode accent-on-bg value, (b) corrects the DESIGN.md §1.1/§1.2 contrast figures to the measured values, (c) adds an `accent-on-bg`-on-`bg` row to `tests/styles/status-token-contrast.test.ts` so the link surface is pinned going forward, and (d) regenerates the `/admin` screenshot baselines via the native-amd64 workflow. Until then the underline keeps `/help` links discoverable and the deficit is a known, documented 0.4-ratio AA gap shared with the rest of the app.

### BL-CREWSUBNAV-PREFETCH-ENABLEMENT — ✅ SUPERSEDED by the crew client-side section-toggle milestone (2026-06-23)

**SUPERSEDED (2026-06-23)** by the crew client-side section-toggle milestone (branch `worktree-crew-prefetch-enablement`). The "enable prefetch" framing below was a **misdiagnosis**: prefetch can't help a `?s=` change on a _dynamic_ route (Next only prefetches the static `loading.tsx` for a dynamic segment), and the `upsertAdminAlert` side-effect is already dynamic-route-guarded (the `router.push`/`prefetch={false}` are belt-and-suspenders, not the real guard). The actual cost was a full **server round-trip per section tab** (`router.push` re-running `getShowForViewer`). The shipped milestone makes section switches a pure **client toggle** over server-rendered bodies — instant, zero network, freshness preserved via `ShowRealtimeBridge → router.refresh()` — delivering the win WITHOUT prefetch or any side-effect relocation. **Residual (low priority):** relocating the side-effect + enabling prefetch would now only warm the initial-load / cross-show shell, a much smaller gain since per-tab is already instant. The original (now-historical) analysis follows.

**Filed:** 2026-06-23 (nav-perf Phase 2 — the descoped C1). Phase 2 dropped the "CrewSubNav `router.push` → `<Link>`" conversion because it yields **no** navigation-speed gain: `router.push` is already a client-side soft-nav (no full reload), and prefetch — the only thing `<Link>` would add — is **barred** by the phantom-alert hazard. `components/crew/SectionChipLink.tsx` uses `<Link prefetch={false}>` for exactly this reason, and `tests/components/crew/noPrefetchAlert.test.tsx` enforces that CrewSubNav drives nav imperatively (no prefetching `<Link>`). The crew page render has a projection / `upsertAdminAlert` side-effect that a speculative prefetch would fire spuriously.

**The real win:** make speculative prefetch SAFE by moving the side-effect off the speculative render path (e.g. fire the projection/alert only on a committed navigation or in a route handler, not during the RSC render that a `<Link>` hover/viewport prefetch triggers). THEN enable prefetch on `CrewSubNav` + `SectionChipLink` so the most-tapped crew nav warms its loading shell on hover — instant section switches. This is the genuine crew-nav latency win Phase 2 could not deliver.

**Why backlog, not now:** needs an investigation into where the projection/`upsertAdminAlert` side-effect fires during the crew render + a design for relocating it without breaking the alert semantics — its own focused milestone (spec + plan), not a follow-up edit. Speculative on the relocation approach.

**Promotion prerequisite:** confirm the exact side-effect site(s) in the crew render path; design a prefetch-safe relocation; then a milestone that relocates it, enables prefetch, and flips `noPrefetchAlert.test.tsx` from "asserts no `<Link>`" to "asserts prefetch is safe (no spurious alert on speculative render)."

### BL-NAV-PERF-TAG-CACHING — ✅ SHIPPED PR #102 (tag-based caching of getShowForViewer)

**✅ SHIPPED (2026-06-23, PR #102, merge `550f7511`).** Implemented as **option B** (exhaustive tag invalidation, near-zero staleness) — NOT by removing `force-dynamic` (the crew route stays dynamic for picker-cookie auth; only the `getShowForViewer` DATA fetch is cached). `getShowForViewer` was SPLIT: the data fan-out is wrapped in `unstable_cache` (per-show-per-viewer key, tag `show-${showId}`, 300s TTL backstop) while `viewerVersionToken` is kept LIVE (caching it = realtime-bridge refresh loop). `revalidateShowFromResult`/`revalidateShow` = `revalidateTag(tag, {expire:0})` IMMEDIATE post-commit at every show-data write (sync chokepoint + onboarding finalize/finalize-cas + diagram/asset/staged-apply + lifecycle + feed/unpublish; picker/share-rotate/validation/mi11-reject exempt-with-reason), enforced by the discovery meta-test `tests/db/showCacheRevalidateCoverage.test.ts`. `use cache`/`cacheComponents` + removing `force-dynamic` were deliberately OUT of scope. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-23-nav-perf-tag-caching*` (Codex spec 5 + plan 4 + whole-diff 3 rounds — the whole-diff review caught the partial-failure + non-applied-`last_sync_status` freshness gaps). Historical filing below.

**Filed:** 2026-06-23 (nav-perf follow-up; the deferred "Should we introduce caching?" question). Every route is `force-dynamic` (a cold render per navigation). Phases 1+2 made the cold render fast + added instant feedback, but the structural ceiling is the always-dynamic model. The big win is to cache the show/crew/admin reads with `use cache` + `cacheTag(...)` and `revalidateTag(...)` from the **sync write path** (and admin mutations), so navigations serve cached data and only re-render when the underlying show actually changes.

**Why backlog, not now:** caching correctness is subtle (stale-data risk on a per-show app where freshness matters), and the user explicitly deferred it ("Should we introduce caching?" → not this round). It needs its own brainstorm/spec: which routes can safely drop `force-dynamic`, the exact tag taxonomy (per-show / per-crew / admin-wide), every `revalidateTag` call site across the sync + admin-mutation surfaces, and a staleness-bound decision. Largest blast radius + the highest correctness risk of the three follow-ups.

**Promotion prerequisite:** a dedicated brainstorm/spec on the cache model (tag taxonomy + every revalidate site + staleness bound + which routes opt in), reviewed for correctness before any `force-dynamic` is removed.

### BL-PARSER-PRODUCTION-FIDELITY-RESIDUAL — remaining MEDIUM parser fixes vs the production exporter (rooms name/dims/floor split, meal-room suppression, hotel name/address split)

**Filed:** 2026-06-23. The end-to-end grounding audit (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/sheet-data-grounding-audit-2026-06-18.md` §"End-to-end exporter+parser validation", "Recommended fixes (ranked)") listed 9 parser-fidelity fixes against the real production renderer (`exporter-xlsx/` fixtures). **Re-assessing the CURRENT parser (2026-06-23) against the 7 fixtures, the CRITICAL/HIGH ones are already DONE:** event_details (exporter DETAILS-column-collapse fix), General Session room present, transportation populated, East-Coast `dates`, no phantom DOCUMENTS crew, agenda label, HTML-entity decode. The round-trip guard pins all 7 fixtures **creds-free** (PR #100): `tests/drive/round-trip-fixture.test.ts` synthesizes the committed trimmed `exporter-xlsx/<show>.xlsx` snapshots and asserts they equal the committed `.md` in the normal unit-suite — no Drive, no secret (`real-drive.yml` removed so the live test sheets stay editable). So TDD here just parses the committed `exporter-xlsx/*.md` fixtures.

**Remaining (~3 MEDIUM; #1a shipped 2026-06-23):**

1. **Room name / dimensions / floor split** — `lib/parser/blocks/rooms.ts`. **MULTI-PATH** (precise per-show grounding, 2026-06-23). Each room's physical name, dims, floor should be SEPARATE fields (`kind` already records gs/breakout). **Naming RESOLVED (owner, 2026-06-23):** `name` = the **venue room only** — strip the `GENERAL SESSION` / `BREAKOUT N` label + dims + floor; fall back to `General Session` for a GS with no venue. The source cell is `LABEL\nNAME[\nDIMS][\nFLOOR]` but `synthesizeMarkdownFromXlsx` flattens the newlines to SPACES, so the split is PATTERN-based: dims `/\d+\s*'\s*x/` with an optional intro prefix (`TOTAL:` / `A/B:` / `APPROXIMATELY`); floor `/\b\d+(?:st|nd|rd|th)\s+Floor\b/i`; drop literal `Dimensions`/`Floor` placeholder words. (Casing: source is ALL-CAPS; title-casing is a minor open sub-decision.)

   Current output is broken across **three distinct behaviors** (verified by parsing `fixtures/shows/exporter-xlsx/<show>.md`):

   | show          | result now (name / dims / floor)                                                                            | sub-fix                                                      |
   | ------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
   | fintech       | `ADLER BALLROOM` / `75' x 37'` / `15th Floor`                                                               | **1a ✅** (idx22 stripped the dangling `x`, 2026-07-03)      |
   | fixed-income  | `SALON ABC` / `43' x 49' x 12'` / —                                                                         | **1a ✅**                                                    |
   | rpas          | `GRAND BALLROOM A/B` / `TOTAL: 82' x 94' x 14' A/B: 82' x 63' x 14'` / `8th Floor`                          | **1a ✅**                                                    |
   | consultants   | `GRAND BALLROOM A/B` / `A/B: 82' x 63' x 14'` / `8th Floor`                                                 | **1a ✅ + 1b exporter fix ✅** (2026-07-03)                  |
   | redefining-fi | `LAKEVIEW BALLROOM` / `61' x 55' x 11'` / `7th Floor`                                                       | **1b exporter fix ✅** (was `General Session`/—; 2026-07-03) |
   | ria           | `SALON ABCD` / `41' x 73' x 13'` / —                                                                        | **1b exporter fix ✅** (was `General Session`/—; 2026-07-03) |
   | east-coast    | `MABEL 1` / `60' x 45'` / — (GS adopts the venue header; distinct day-1&2 MABEL 1 breakout kept losslessly) | **✅ DONE**                                                  |

   Breakouts follow the same pattern (consultants `DELAWARE`/`LASALLE`/`WALTON` ·`7th Floor`, `STATE B`·`8th Floor`; ria `DRAWING ROOM A/B`; fixed-income `SALON D`·`43' x 24' x 12'`; rpas `STATE A/B`·`38' x 29' x 12'`·`8th Floor`; consultants LUNCH `BALLROOM C`) — all **1a ✅**.

   **1a — SHIPPED (PR pending, 2026-06-23):** added `splitRoomHeader(raw, kind)` shared by every path that reads a fused header (v4 `parseV4RoomBlock`, v2 `parseGsRoom`, BO breakouts incl. LUNCH ROOM, v4/v2 ADDITIONAL fallback). Removed `deriveBreakoutName` + the per-path dim/floor regexes; routing all paths through the same splitter preserves the `mergeRooms` kind+name dedup keys. Pinned by a per-show `{kind,name,dimensions,floor}` table over all 7 exporter-xlsx fixtures in `tests/parser/exporterFixtures.test.ts`.

   **1b — RESOLVED via exporter fix (2026-07-03), NOT obsolete. ⚠️ The earlier "Doug restructured the sheets" claim was a MISDIAGNOSIS — corrected here.** The GS venue rides in an **inline `GENERAL SESSION␊NAME␊DIMS␊FLOOR` header** in the INFO cell (redefining `LAKEVIEW BALLROOM␊61' x 55' x 11'␊7th Floor`, ria `SALON ABCD␊41' x 73' x 13'`, consultants `GRAND BALLROOM A/B␊A/B: 82' x 63' x 14'␊8th Floor`) — and it **always has**. Verified 2026-07-03 by extracting the **frozen 2026-06-18 `.xlsx` snapshot** (`consultants.xlsx` cell `A76`): it is byte-identical to the live cell. The data never changed; Doug did not restructure anything. The real defect was in the **exporter**: `normalizeBlock` (a pre-`#1a` workaround) dropped the `GENERAL SESSION␊…` header row whenever it was followed by a `GS Setup` row (`block.slice(1)`), so the fused header — dims, floor, and for ria/redefining the room NAME — was silently discarded before it ever reached `parseGsRoom` + `splitRoomHeader`. The committed `.md` fixtures faithfully reflected that lossy exporter output (round-trip guard passed), which is why the earlier session saw "fixture parses as General Session" and wrongly concluded the fixtures were STALE / Doug had restructured. Class-swept 2026-07-03: exactly 3 corpus shows affected (consultants, redefining-fi, ria — all v2, INFO tab), 0 in v4/v1. Fixed by removing the `normalizeBlock` drop; the 3 `.md` fixtures were regenerated (header preserved) and the `exporterFixtures.test.ts` GS expectations updated to the recovered NAME + dims (+ floor). No live-sheet edits, no data change, no staleness — see the frozen-`.xlsx` = live-cell proof above.

   **east-coast MABEL/GS reconciliation — ✅ DONE (this PR).** east-coast is the one genuine v1 residual: its GS block is headed `MABEL 1␊APPROXIMATELY 60' x 45'` (no `GENERAL SESSION` label). `parseGsRoom` now adopts that venue header via `findGsBlockVenueHeader` (the nearest column-duplicated block-header above the first `GS Setup` row; a `| label | value |` DETAILS pair is correctly NOT treated as a header, so redefining/ria/consultants stay "General Session") → gs `MABEL 1` / `60' x 45'`. The same-name `MABEL 1` breakout (the day-1&2 reuse) is reconciled by `parseRooms` **losslessly**: it is absorbed into the GS room ONLY when it's a strict subset (every populated field is gs-absent or identical); since east-coast's breakout has DISTINCT AV (BO Video "Projector & Screen" ≠ the GS Eiki rig), it is kept as a separate room rather than dropped (cross-model adversarial review caught the earlier unconditional-drop + fill-null-merge as data loss). The venue-header detector also requires STRONG evidence (an in-cell `&#10;` or a dims token) so a trimmed metadata label like `| Fonts |` above `GS Setup` can't become the GS name. `splitRoomHeader` strips a leading `APPROXIMATELY` as a dims prefix.

2. **Reformat intake-form "additional" rooms — ✅ DONE (this PR).** These `kind:'additional'` rooms are harvested from the CLIENT INTAKE FORM tab's free-text `Additional Room Name(s) / Setup` answers (a Google Form, NOT Doug's INFO room blocks), so the value is usually meal/social PROSE (`Lunch in Adorn both days…`, `Ballroom C - Meal rooms`). Owner decision (2026-06-23): NOT suppress, NOT keep-prose-as-name — **reformat**: `parseAdditionalRoomFields` now emits ONE card with `name:"Additional rooms"`, the `Name(s)` prose in `notes`, and the `Setup` prose in `setup`. The crew Today section renders `room.notes` as a "Room: Additional rooms" callout (`components/crew/sections/TodaySection.tsx:115`), so the "which rooms / no AV needed" signal stays visible behind a clean label instead of a paragraph-as-name room card. (Reverses the C2/R8 prose-as-name behavior; only `name`, gear `audio/video/lighting`, and `notes` render crew-side — `setup`/`dimensions` are data-only.)
3. **Hotel `hotel_name` / address split + conf# — ✅ DONE (this PR).** `splitHotelNameAddress(combined)` in `lib/parser/blocks/hotels.ts` un-glues the venue name from the street address (the exporter flattens the cell's `name⏎street⏎city` newlines to spaces). Split heuristic: the address begins at the FIRST standalone 2–5 digit street number followed by a street word (leading-`\s` anchor so a `#5001397` conf# can't trigger; trailing `\p{L}` so a 5-digit ZIP can't; first-match-wins keeps the street number ahead of any later ZIP). Wired into the structured HOTEL-table value rows (`parseHotelTable`) AND the inline-cell final pass (`stripHotelNameConf`); `stripConfTokens` runs FIRST so a dash/#-prefixed conf# can't masquerade as a street number. Also strips artifacts the live cells carry that the exporter preserves: ria wraps its address in literal `"…"` (stripped); fintech's Holiday Inn embeds U+200C ZWNJ (stripped) — so both crew-facing fields (`hotel_name` bold line, `hotel_address` subtle line in `TravelSection`/`TodaySection`/RightNow; column already SELECTed in `getShowForViewer`) render clean. **Grounded by gsheets-MCP read of all 7 live INFO tabs (2026-06-26): ZERO structural drift vs the committed exporter-xlsx fixtures**, every hotel name ends at the first street number, and no hotel name in the corpus contains such a number → no false split. Conf# remains parsed-but-NOT-persisted (privacy — `hotel_reservations` is show-wide crew-readable; the `#4 PRIVACY` meta-test pins it). TDD: per-show `{hotel_name, hotel_address}` table over all 7 exporter-xlsx fixtures + structural invariants (no glued address on the name line; no ZWNJ/quote in either field) + ria quote-unwrap + raw-fixture Waldorf assertion flipped to the split form. **Residual — ✅ DONE (follow-up PR):** east-coast's v1 `Hotel Stays` cell glued guest FIRST-names into `hotel_name` (`Four Seasons Fort Lauderdale Doug Carl Eric W`) because the single-word-guest `--- conf#` shapes weren't extracted into `names[]`. Fixed: `buildInlineHotel`'s NO-Check-In branch cuts the cell at its confirmation-number delimiters (a dash-run + 4+ digit number that is NOT a street number — `STREET_ADDRESS_RE` is the street-vs-conf discriminator) into `<hotel> name1 | name2 | … | nameN`. Names 2..N are unambiguously delimited; the FIRST guest's name length is ambiguous (how many leading words are the hotel), so it is **learned from the later guests** (`baseWords` = words minus a trailing single-letter initial) and peeled off `seg0` — `Four Seasons Fort Lauderdale Doug | Carl | Eric W` → hotel "Four Seasons Fort Lauderdale", names ["Doug","Carl","Eric W"]; `Westin Doug Larson - … | Eric Weiss - …` → hotel "Westin", names ["Doug Larson","Eric Weiss"]. A guest-less cell (no non-street dash-conf, no bare 6+/#-conf) routes through `splitHotelNameAddress` (`Hyatt Regency - 1515 Madison Ave` → name/address preserved, no fake guest; suffixless streets like Broadway stay glued per the #3 gate). `names[]` is load-bearing (`getShowForViewer` filters hotels by viewer-name ∈ `res.names`, :644). Codex took 3 rounds on the guest/address-boundary vector (R1 dash-address-as-guest; R2 4–5 digit dash-conf dropped; R3 multi-word first-guest truncated to surname) → resolved with the street-vs-conf discriminator + learn-K + a **structural-defense matrix test** (`tests/parser/exporterFixtures.test.ts` "STRUCTURAL DEFENSE" rows) pinning the boundary across shapes. **Bounded limitation (documented, non-corpus):** a SINGLE-guest no-Check-In cell with a multi-word name (`Westin Doug Larson - 7414`, one guest) has no sibling to learn the name length from, so it falls through to the legacy greedy Pattern 1 (surfaces "Westin Doug Larson" — the guest is present, not dropped; the leading hotel word bleeds in). The legacy bare-conf# 2025-04 fixture (no dash, "In on the Nth" prose) likewise falls through (conf# still stripped). **BL-HOTEL-VIEWER-NAME-MATCH — ✅ DONE (autonomous pipeline, 2026-06-26).** Spec/plan at `docs/superpowers/{specs,plans}/2026-06-26-hotel-viewer-name-match*`. The per-viewer hotel filter (`getShowForViewer.ts:644`) was `res.names.some(n => guest.includes(viewer))` — broken for ~5 of 7 shows (first-names `Carl`⊉`Carl Fenton`; nicknames `Douglas`/`Doug`, `Alexandre`/`Alex`, `DJ`/`David`; initials `Eric W`/`Eric Weiss`). Replaced by `hotelVisibleToViewer = res.names.some(n => namesRefer(n, viewerName))`, where `namesRefer` (`lib/data/nameMatch.ts`) is a symmetric matcher: NFD/diacritic-fold + `Jr/Sr` suffix-strip tokenizer; single-token → first/last prefix-compat; **multi-token → SURNAME-only** (the surname carries identity, so it catches every nickname/legal-name form — `Bill`↔`William` too; distinct surnames still exclude same-first-name people, `Eric Carroll`↮`Eric Weiss`); splits each side on `/` so legacy persisted `"David Johnson / Jeffrey Justice"` rows match at MATCH time (no DB backfill). Also fixed `parseGuestCell` to split slash-separated guests for clean FUTURE data. **UX-not-security** per the owner's 2026-05-23 determination (master spec amendment `:7-10` + `PRODUCT.md:69-73`): the picker is a free self-identify over the full roster + `getShowForViewer` fetches via service-role, so the filter is presentation; over-match re-surfaces a card reachable by re-picking (benign; conf# never persisted). Lenient by design — under-match (hides a viewer's own hotel) is the harm. Codex: spec APPROVED (4 rounds: nickname under-match → surname-only; accent → NFD fold; over-match privacy → owner-determination citation; oracle citations), plan APPROVED (4 rounds: wiring guard → guard-regex bug → seeded regression → legacy-persisted match-time split). Tests: `namesRefer` unit matrix (§1 oracle + over-match exclusions + nickname/accent/legacy/edges + symmetry), `hotelVisibleToViewer` explicit + fixture-derived (5 broken shows re-parsed) + a **structural source-guard** (no naive `.includes`), and 3 seeded live-DB `getShowForViewer` regressions.

**Approach:** one MEDIUM fix per PR, TDD-grounded against the `exporter-xlsx/*.md` fixtures (assert the CORRECTED values per the audit's per-show ground-truth appendix). **Blast radius:** ~859 parser tests + `tests/parser/exporterFixtures.test.ts` + `rooms.test.ts`/`hotels.test.ts` assert current outputs; update expectations in lockstep. Lower-priority #9 (fail-silent observability — warn when a recognized section yields no fields) is partially done (some warnings now emit).

**Why backlog:** intricate MULTI-PATH parser surgery on a 659-line file with heavy 859-test blast radius; deferred from the session that did the grounding (it deserves a fresh focused pass, which the precise per-show current→desired table above makes efficient — naming decision already resolved). Not breaking anything — the residuals are MEDIUM display-fidelity gaps, and the round-trip + parser suites are green. Suggested order: ~~#1a (contained header-split PR)~~ **✅ shipped** → ~~#1b~~ **obsolete + east-coast reconciliation ✅ done** → ~~#2 (meal-room)~~ **✅ reformatted to a clean "Additional rooms" card + notes, 2026-06-23** → ~~#3 (hotels)~~ **✅ name/address split + conf#/ZWNJ/quote strip, 2026-06-26**. **All ranked residuals of this backlog item are now shipped** (only the minor east-coast v1 Hotel-Stays guest-extraction follow-up noted under #3 remains, out of scope).

### BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK — RESOLVED before the 2026-08-02 merge; mis-filed as open by an intensifier

Moved out of the open queue 2026-08-02. Its own heading said `✅ FULLY CLOSED`, but the
graduation guard reads a terminal word only in leading position, so `FULLY CLOSED` /
`FULLY RESOLVED` / `ALREADY SHIPPED` all classify as OPEN while reading as closed to a
human. Filed as BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND. Entry preserved verbatim below.

#### BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK — Drive-under-lock class — ✅ FULLY CLOSED (both instances fixed)

**✅ RESOLVED (2026-06-22).** Both instances of the Drive-under-lock class are fixed and the advisory-lock guard now enforces the whole `lib/sync` / `lib/drive` / `lib/asset` subtree with **no allowlist** (the `knownDriveUnderLockPaths` exemption was removed). History retained below.

- **Instance 1 — wizard revision-race restage — CLOSED in PR #77.** Now prepares pre-lock + stages under the lock via `prepareOnboardingFiles` + `scanOnboardingPreparedFiles`; the combined-fetch dedup landed; the advisory-lock guard was extended to follow cross-file scan calls (`runOnboardingScan` / `prepareOnboardingFiles` are Drive-reaching markers). That guard extension is what surfaced instance 2.
- **Instance 2 — `retrySingleFile` — CLOSED in PR #80.** The reorder surfaced TWO latent production bugs that the guard's cross-file blindness + the scan-mocking tests had hidden:
  - **Bug 1 (deadlock).** The retry held `withPostgresSyncPipelineLock` (= `withShowLock(hashtext('show:'||driveFileId))`) on connection A and `await`ed `runOnboardingScan`, whose connection B blocked on the SAME key → app-level deadlock (Postgres can't detect it). Confirmed empirically by a new live-DB repro (`tests/onboarding/retrySingleFileNestedLockDeadlockDb.test.ts`) that ran the real route lock + real scan lock, reproduced the hang (RED), then went GREEN after the reorder. The repro terminates only the two key-scoped hung backends (pid-snapshot diff) so the shared local DB is never wedged.
  - **Bug 2 (false supersession, masked by Bug 1).** With the hang gone, the real scan revealed it deletes the wizard `pending_ingestion` on successful stage (`phase1.ts:355`); `finalize` _also_ deleted it and read the 0-row as supersession → a bogus 409 on a retry that actually succeeded. `finalize` now detects a **post-scan** supersession via a wizard-session **currency re-check** (the scan owns the delete + in-scan supersession detection).
  - **Bug 3 (defer/ignore race — Codex adversarial-review R1, HIGH).** The first cut of the fix ran the scan OUTSIDE the lock, opening a window where a concurrent defer/ignore (which takes the show lock, transitions the manifest, deletes the pending row) interleaves and the retry's scan overwrites the resolved manifest. **Fixed** by running the DB scan UNDER the finalize lock — the same lock the defer/ignore takes — so staging + finalize are atomic and a concurrent resolution is serialized (a re-preflight aborts the retry with `not_found`). A new live-DB regression test pins this.
  - **Bug 4 (live-partition corruption — Codex R2 + independent multi-lens review, CRITICAL).** The first under-lock cut staged via `makeInlineOnboardingScanTx`, which overrides only manifest/log/alert/probe and INHERITS the pipeline tx's LIVE-only `upsertLivePendingSync`/`deleteLivePendingIngestion` (`wizard_session_id` null). So a clean retry staged `pending_syncs` into the LIVE partition while the manifest stayed wizard-scoped+unresolved → the wizard finalize/approve pipeline (filters `wizard_session_id = SESSION`) never saw the row → onboarding session **wedged**. Empirically confirmed (staged `wizard_session_id` was null). **Fixed** by building the under-lock scan tx as a real wizard-scoped `PostgresOnboardingScanTx` bound to the locked connection via `tx.holdPort()` (the service-role hold-port that rides the held show lock — no new connection/lock); `makeInlineOnboardingScanTx` is DELETED. This also closes a related HIGH (an in-scan supersession now 0-rows the staging INSERT via the wizard EXISTS guard instead of committing an orphan null-partition row F4 reap could never sweep). A new real-DB partition assertion pins `wizard_session_id = SESSION`. **The identical bug in the #77 wizard revision-race restage (`stageWizardRestageInline`) was fixed the same way** (it staged live → `readWizardPendingSyncForApply` returned null → reported `source_gone` for a successful restage).

**Fix shape (instance 2):** `retrySingleFile` keeps only the slow Drive prepare PRE-lock; the DB staging + finalize run together UNDER one pipeline lock. Lock#1 `retrySingleFilePreflight` reads the pending-folder id → pre-lock Drive metadata + `prepareOnboardingFiles` → Lock#2 { re-preflight (a concurrent defer/ignore or supersession aborts here) → `scanOnboardingPreparedFiles` on the SAME locked connection via a wizard-scoped `PostgresOnboardingScanTx` bound to `tx.holdPort()` + a passthrough `withShowLock` (single-holder) → `retrySingleFileFinalize` }. Because the scan now shares the locked transaction, a supersession throw rolls its staging back atomically — **no orphan residue** (the R32-1 race test updated: residue 1→0, the moot F4-reap-of-residue half removed since F4 sweep stays covered by `reapStaleSessionsDb`). `retrySingleFile_unlocked` was split into the exported `preflight` + `finalize` (R1, separate commit); both structural meta-test registries (`_advisoryLockSingleHolderContract`, `_metaInfraContract`) + 4 test files were migrated; the guard exemption was removed. Full suite green (6992 pass).

**Residual:** a dedicated real-DB restage test for #77 (the existing restage tests mock the scan) is a recommended follow-up — the wizard-scoped-via-holdPort mechanism is proven by the retry's real-DB partition assertion + identical wiring. Pairs naturally with BL-ONBOARDING-SCAN-TRANSIENT-THROTTLE-RETRY in any future sync-robustness milestone — but the lock-hygiene class itself is closed. The applyStaged-wide supersession-return concern is filed separately as `BL-APPLYSTAGED-SUPERSESSION-ROLLBACK` below.

---

## Verified-complete sweep of the merged plans backlog (2026-08-03)

Five entries from the 2026-08-02 merge, each verified clause-by-clause against the live tree
before archiving — not on a headline check. Two more that the same sweep examined were NOT
archived: `BL-OPS-LOG` and `BL-PUSH-NOTIFICATIONS` each still carry unshipped scope, and stay
in the open queue with a dated verification note recording exactly which clauses remain.

### BL-COPY-SHARE-LINK — Admin "Copy share link" affordance on per-show panel crew section

**ARCHIVED 2026-08-03 — OBSOLETE PREMISE, intent satisfied.** Every mechanism this entry names was dropped at the M11.5 crew-auth pivot and is now a banned term (`signLinkJwt`, `crew_member_auth`, `current_token_version`/`revoked_below_version` — `tests/cross-cutting/no-m9-5-surfaces.test.ts:26-36`). The affordance itself ships: `app/admin/show/[slug]/ShareLinkCopyButton.tsx`, mounted at `components/admin/showpage/ShareHub.tsx:875`, copying `${origin}/show/${slug}/${token}` (`ShareHub.tsx:452`). The `#t=` vs `?t=` clause is inapplicable rather than violated — the token is a path segment now. The no-live-link hide condition has a structural analogue: `linkActive = published && !archived && url != null` (`ShareHub.tsx:458`, gate at `:852`). Filed as obsolete-premise, NOT as "every clause shipped".

**Origin:** Split from M11-E-D1 (HIGH) on 2026-05-20 during the M9 close-out spec-vs-shipped audit. M9.5 (`handoffs/M9.5-signed-link-controls.md`) carries the v1-blocking "Issue new link" + "Revoke all links" subset; this entry carries the post-v1 convenience affordance.

**Scope:** Add a "Copy share link" button to the per-show panel crew section that copies the canonical signed-link URL (with `#t=` fragment, never `?t=` per spec §7.2 lines 1953 + 1991) to the clipboard. The button MUST be hidden when the crew row is in the no-live-link state (`current_token_version === revoked_below_version`) per spec line 1100. Mint the URL by signing a JWT with the row's `current_token_version` via the existing `signLinkJwt()` in `lib/auth/jwt.ts`.

Open design questions:

- **Mint at click vs mint at render.** Mint-at-render exposes the JWT in the rendered HTML (a leak vector if the page is screenshotted or the DOM is logged). Mint-at-click avoids that but requires a Server Action round-trip and a brief "Copying…" state. Recommend mint-at-click for parity with the Revoke confirm two-tap UX.
- **Visual feedback.** Standard pattern: button label flips to "Copied!" for 2s after success. Catalog-routed via `messageFor()` (no raw string) per AGENTS.md §1.5.
- **Mobile clipboard API.** `navigator.clipboard.writeText` requires HTTPS + transient user activation. Both already satisfied on the admin surface; no fallback needed.

**Why backlog, not deferred:** No v1 ops gap. Doug can manually construct the URL today (or copy from the address bar after testing the link himself). The affordance is a convenience-shortcut, not a recovery path. No concrete trigger date; promotion depends on FXAV operator feedback (Doug surfaces friction with the manual workflow) OR a broader "admin UX polish" milestone.

**Promotion prerequisite:** Either (a) FXAV feedback flags the workflow as a real friction point, OR (b) a v1.x admin-UX polish milestone bundles this with the other BL-ADMIN-\* entries.

### BL-X5-INTROSPECTION-GAP — Eight widened X.5 canonical-email CHECKs have no `tests/db` introspection rows

**ARCHIVED 2026-08-03 — COMPLETE.** Resolved by option (c), the cross-cutting parity assertion. **Residual closed 2026-08-03 (`feat/db-lockdown-cluster`):** the walk's aperture was constraint-NAME-scoped (`:126` skips anything lacking `email_canonical`), leaving three live canonical CHECKs invisible for naming reasons alone — `admin_emails.email`, `ignored_warnings.ignored_by`, `role_token_mappings.decided_by`. A `CATALOG_CANONICAL_CHECKS` registry sourced from `pg_constraint` now pins all 19 regardless of naming. All 8 named tables covered in `tests/cross-cutting/_canonicalEmailCheckContract.test.ts`: `sync_audit:31`, `app_settings:32-33`, `deferred_ingestions:34`, `admin_alerts:35`, `reports:37-41`, `report_rate_limits:43-47`, `pending_syncs:48`, `shows_pending_changes:49`. It walks `supabase/migrations` for `*email_canonical*` CHECKs and asserts the widened body per column.

**Origin:** Surfaced 2026-05-21 during the M9.5 Phase 1-2 pin-stop triage. Codex's Task 3 class-sweep (commit `6d61229`) updated the three `tests/db` assertions that existed (`crew_members`, `transportation`, `contacts`) to pin the widened CHECK contract (`email IS NULL OR (email = lower(trim(email)) AND email <> '')`). Eight other tables had their canonical-email CHECKs widened in X.5 but have **no** corresponding `tests/db` introspection-test row: `sync_audit`, `app_settings`, `deferred_ingestions`, `admin_alerts`, `reports`, `report_rate_limits`, `pending_syncs`, `shows_pending_changes`.

**Scope:** For each of the 8 tables, decide whether to (a) add an introspection-test row pinning the widened CHECK, (b) confirm the CHECK is covered at a different layer (RPC-behavior test, migration-apply test) such that introspection rows aren't warranted, or (c) absorb the coverage into a single cross-cutting `tests/cross-cutting/email-canonicalization.test.ts` parity assertion that walks every table whose canonical CHECK was widened.

**Why backlog, not deferred:** The widening contract is correct and live in the schema; this is a coverage-completeness gap, not a behavioral bug. Picking it up requires a small design call (per-table rows vs cross-cutting parity), and the right home may be the existing `tests/cross-cutting/validation-tooling-tz-pin.test.ts` lineage (post-M12-R5 structural defenses) rather than scattered `tests/db` rows.

**Promotion prerequisite:** Either (a) a future X.\* cross-cutting touch surfaces the gap (e.g., a follow-on widening that introspects all canonical CHECKs at once), OR (b) explicit decision to add a parity meta-test under `tests/cross-cutting/`. Either path is small (under half a day) once scoped — but neither is in-scope for any currently planned milestone.

### BL-WIZARD-SESSION-CAS-TURNOVER-RACE — Wizard defer/ignore can still commit after the active wizard is superseded

**ARCHIVED 2026-08-03 — COMPLETE, all three scope clauses.** (a) Lock-then-act shipped as a third variant, not literally either lettered option: all three mutations run in one `withRowTx` with a `FOR UPDATE` lock on `pending_ingestions` (`app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:150-165`) plus per-statement currency predicates against `app_settings.pending_wizard_session_id` (deferral upsert `:217-232`, delete `:323-333`), a 0-row outcome raising `WizardSessionSupersededRollbackError` and rolling back the whole tx — option (b)'s stated semantics without the RPC packaging. (b) Regression test `tests/onboarding/wizardSessionCasRaceDb.test.ts` flips the session mid-window (`:425-447`), asserts 409 + typed `WIZARD_SESSION_SUPERSEDED` and all three mutations rolled back (`:359-361`). (c) The audit trail shipped too: `route.ts:553-567` emits an `admin_alerts` row `WIZARD_SESSION_SUPERSEDED_RACE` carrying both `superseded_session_id` and `current_session_id`, post-rollback on a separate connection; same in the ignore, apply and discard routes.

**Origin:** Surfaced 11+ times across R41 spec + plan adversarial review rounds (2026-05-23 through 2026-05-24) by Codex on `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:297-302`. Most recently P-R8 [high]. Dispositioned each time as OUT-OF-SCOPE for the R41 crew-auth pivot because the affected file is M-series onboarding code, not crew-auth code. Filing here so future R41-pivot adversarial-review rounds can cite this BACKLOG entry instead of re-surfacing the same finding.

**Symptom:** `transitionManifestRow` checks `app_settings.pending_wizard_session_id` only at the manifest UPDATE step. After that succeeds, the handler performs the deferral upsert (line ~301) and pending-ingestion delete (line ~302) without holding or re-checking the `app_settings` row. Under READ COMMITTED, a concurrent finalize/new-scan transaction can supersede or clear the active wizard between the manifest UPDATE and the subsequent two mutations; the stale request can still commit a deferral and delete the pending row while returning 200. This is exactly the class the CAS is meant to prevent.

**Scope of a real fix (if/when promoted):**

- **Lock-then-act protocol.** Either (a) `SELECT pending_wizard_session_id FROM app_settings ... FOR UPDATE` inside the same transaction as the manifest UPDATE + deferral upsert + pending-ingestion delete, or (b) collapse all three mutations into a single SECURITY DEFINER RPC that takes the session-id as an arg and CHECKs it against `app_settings.pending_wizard_session_id` in one statement per mutation. Option (b) matches the M5 advisory-lock topology pattern used elsewhere in this codebase.
- **Regression test.** Flip `pending_wizard_session_id` between the manifest UPDATE and the deferral upsert (e.g., via a `pg_advisory_xact_lock` + concurrent transaction harness), assert no deferral or delete commits, and assert the route returns a typed `WIZARD_SESSION_SUPERSEDED` failure.
- **Audit trail.** If the race is detected, emit an `admin_alerts` row with the superseded vs current session-ids so operators can correlate.

**Why backlog, not deferred:** This is an M-series onboarding wizard bug, not an FXAV crew-auth pivot bug. The R41 pivot does not touch this file. No M-series milestone is currently scheduled. Promoting requires a host milestone — most naturally an "M-onboarding-fixups" milestone scoped to known onboarding-flow races, OR a return to the M-series plan tree once R41 ships.

**Promotion prerequisite:** EITHER (a) Doug or Eric observes a real wizard-session-turnover race in production (an orphaned deferral row, a phantom delete), OR (b) an unrelated onboarding milestone re-opens this file and a class-sweep audit lands the fix as part of the broader change, OR (c) the M-onboarding-fixups milestone is scheduled.

**Promotion mechanics:** Add the lock-then-act RPC or `FOR UPDATE` patch as the lead task in the host milestone; pin via a structural meta-test that all three mutations occur in one transaction holding `app_settings` for update.

### BL-LINT-DEBT-PREEXISTING — ~90 pre-existing eslint errors in unrelated files

**ARCHIVED 2026-08-03 — COMPLETE; the 2026-06-21 self-declaration verified, not taken on trust.** `npx eslint .` now reports `0 errors, 49 warnings` against the ~90 errors this entry was filed for; `pnpm lint` exits 0. CI gate live at `.github/workflows/quality.yml:34-44` (`pnpm lint` + `pnpm typecheck` + `pnpm format:check`); pre-commit gate at `package.json:138-141` (`simple-git-hooks` -> `lint-staged`). Residual noted at archive time, out of this entry's scope: the gate passes no `--max-warnings`, so those 49 warnings can grow silently. This entry was one of the two that exposed `BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND` — it declared its own closure in its opening line and the guard read it as open.

**✅ RESOLVED (2026-06-21, `chore/lint-format-ci-gates` branch):** promotion prerequisite (a) was taken — a CI lint gate (`.github/workflows/quality.yml` running `pnpm lint` + `pnpm typecheck` + `pnpm format:check`) was added AND the full lint debt was cleared in the same branch (`pnpm lint` now exits 0). Root cause was mostly `.validation-local` design-mock noise (now eslint-ignored) plus ~48 real findings fixed. The same branch also normalized the repo-wide prettier drift (~56% of files) and added a `simple-git-hooks` + `lint-staged` pre-commit gate to stop regression. Retained for history; no further work. (A residual eslint blind spot — array-join classNames — is tracked separately as `BL-CANONICAL-CLASS-ARRAY-BLINDSPOT` below.)

**Filed:** 2026-05-31 from M12.2 Phase A close-out.

**Description:** During M12.2 Phase A close-out, `pnpm lint` surfaced ~90 eslint errors across files unrelated to
the M12.2 diff (changed-files lint was clean; the milestone shipped green). These pre-date Phase A and are not a
Phase-A regression. Flagged by the implementer, not fixed (out of scope for a UI reskin).

**Why backlog, not deferred:** no single plan/milestone owns "repo-wide lint debt"; the errors span unrelated
subsystems and fixing them is speculative cleanup with no concrete trigger. A fix would touch code outside any
active milestone's scope.

**Promotion prerequisite:** EITHER (a) a CI lint gate is tightened to fail on these (forcing a cleanup pass), OR
(b) a dedicated repo-hygiene/tech-debt milestone is scoped. Until then, changed-files-lint-clean is the standing
bar (matches the existing per-task discipline). Capture the exact error list at promotion via `pnpm lint`.

### BL-DIAGRAMS-EMBEDDED-SOURCE — embedded-image diagrams need a feasible source

**ARCHIVED 2026-08-03 — COMPLETE; the candidate fix shipped, and the body below is now WRONG.** Read the correction before the entry: the prose asserts embedded-in-tab diagrams are "unreachable" and that "the linked-folder path remains the only working diagrams source". Both were true when filed and are false now. The XLSX-media route the entry proposes as its candidate shipped per `docs/superpowers/specs/parser/2026-07-02-diagrams-embedded-images.md`: `lib/drive/embeddedObjects.ts` `extractEmbeddedObjects` walks drawing rels to `xl/media/*`, and the live cron path feeds it bytes from the existing Drive export (`runScheduledCronSync.ts:2937` -> `:3040`). `lib/sync/enrichWithDrivePins.ts:180-243` takes that branch FIRST and returns real stubs (`mediaPartName`, `embeddedFingerprint`, `recovery_disposition`), consumed by `defaultSnapshotAssetsForApply.ts:49-55` and `assetRecovery.ts:226-232`. The Sheets adapter still returns `embeddedObjects: []` (`runScheduledCronSync.ts:2118`) but no longer determines the outcome, and `DIAGRAMS_EMBEDDED_NONE_FOUND` now fires only when the tab has neither raster media nor a linked folder (`enrichWithDrivePins.ts:203-212`). Embedded-in-tab diagrams are genuinely reachable.

Filed 2026-06-12 (production-bug fix `fix/sheets-drawings-fields-mask`). The cron adapter's `listSpreadsheetSheets` originally projected `sheets(...,drawings(objectId,imageProperties(...),embeddedObject(...)))` — but the Sheets v4 `Sheet` schema defines **no `drawings` field**, so the live API rejected every `spreadsheets.get` with 400 INVALID_ARGUMENT and every cron full re-parse of a real show failed as `SYNC_FILE_FAILED`. The fix narrowed the mask to `sheets(properties(title))` and the adapter now always returns `embeddedObjects: []`; `extractEmbeddedImages` degrades honestly (`DIAGRAMS_EMBEDDED_NONE_FOUND` warning / linked-folder fallback), and the linked-folder path remains the only working diagrams source. Net: floating images embedded directly in the DIAGRAMS tab are **unreachable** — Sheets v4 cannot enumerate drawings/floating images via any read API. Candidate when picked up: extract images from the XLSX export the sync already fetches (see `synthesizeMarkdownFromXlsx` / `lib/drive/fetch.ts` — xlsx media parts carry embedded images), mapping them into the existing `SpreadsheetEmbeddedObject` contract; alternatives (Drawings API, Apps Script shim) are heavier. Technical home: `lib/sync/runScheduledCronSync.ts` `defaultDriveClient.listSpreadsheetSheets` + `lib/sync/enrichWithDrivePins.ts` `extractEmbeddedImages`; contract pinned by `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts` + the live smoke `tests/sync/realSheetsListSpreadsheetSheetsSmoke.test.ts`. No trigger — the linked-folder fallback covers Doug's workflow today; promote only if embedded-in-tab diagrams become a real operator need.

---

## BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE — RESOLVED (2026-08-03, `fix/db-test-timeout-flake`)

**Resolution:** the entry named two files; the flake was a class of 242. Both halves of the diagnosis were right and neither was sufficient alone.

The default-timeout half is fixed at the ROOT of `vitest.config.ts` (`testTimeout`/`hookTimeout` at 30_000), which both projects inherit via `extends: true`, rather than per-file as the entry proposed — a sweep found 242 test files reaching a real database, nearly none setting their own budget, so per-file would have fixed the two that happened to flake first and left the shape everywhere else. Files needing more still raise their own (`vi.setConfig` wins over the config file), so the already-bumped 90s doc-scan in `tests/scripts/validation-report-fixtures.test.ts` is unaffected. That alone closes `tests/db/show_share_tokens.test.ts`, whose exposure was purely the 5s default across three synchronous psql spawns.

The entry's second suggestion — an explicit barrier instead of wall-clock `vi.waitFor` — turned out to be load-bearing rather than optional, because **`vi.waitFor`'s own timeout defaults to 1000ms and is not derived from `testTimeout`**: raising the test budget to 30s would have left the poll one second to cover a DB round-trip, and `concurrentRetry` would have kept flaking. `tests/reports/_createIssueBarrier.ts` gives the mock a deferred it resolves when `createIssue` is ENTERED; `awaitCreateIssueEntered` races that against every in-flight submit settling, so the "nobody ever entered createIssue" case throws one descriptive line instead of hanging to the timeout. It waits on ALL submits deliberately — in the first-submit race the loser legitimately 409s before the winner enters `createIssue`, so a single-promise race would fail healthy runs. A class sweep found the same shape in `tests/reports/firstSubmitRace.test.ts`, which the entry did not name; both were converted.

The third suggestion, a scoped `retry: 1`, was NOT taken: retries mask nondeterminism in DB tests, and with the two real causes removed there is nothing left for it to paper over.

Pinned by `tests/cross-cutting/db-test-timeout-floor.test.ts` — the floor against both the authored and the RESOLVED runtime config (so a CLI override cannot pass on the strength of the file alone), plus a filesystem-walked ban on `vi.waitFor` in DB-touching files, which fails by default for a newly added one. `vi.waitFor` in `tests/components/**` and `tests/admin/**` is deliberately untouched: those poll an in-process React state flush with no I/O in it.

### BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE — DB-concurrency tests intermittently time out and fail the `unit-suite` gate

**Filed:** 2026-06-26 (surfaced during PR #121 — the `unit-suite` matrix-shard landing; see memory `project_ci_speedup_pr_d_matrix_shard`). **NOT introduced by sharding:** a re-run of the same commit passed (confirming a flake, not a fault), and sharding _reduces_ per-leg DB load. These tests would flake the same way on the pre-split monolithic gate under the same runner noise.

**Effort:** S

A few DB-concurrency tests intermittently **time out** (Vitest "Test/Hook timed out", NOT assertion failures) under 2-core CI-runner load, failing whichever shard leg they land in → the required `unit-suite` gate goes red until a re-run clears it:

- `tests/reports/concurrentRetry.test.ts` — "only one retry claims the expired lease while the other sees in-flight contention": fires concurrent `submitReport` DB calls racing for an expired processing lease + `await vi.waitFor(() => createIssue called once)`, with an `afterEach` `cleanupReportFixtures` DB call. It uses Vitest's **default** 5s test / 10s hook timeouts (no `vi.setConfig`), so it exceeds them when the local Supabase is momentarily slow.
- `tests/db/show_share_tokens.test.ts` — "new show insert auto-creates a 64-character lowercase hex token" (trigger-driven) — same default-timeout exposure.

**When picked up:** bump per-file timeouts (`vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })`, mirroring the already-bumped `tests/scripts/validation-report-fixtures.test.ts` at 90s) and/or make the contention test deterministic (gate the second submit on an explicit barrier rather than wall-clock `vi.waitFor`); optionally scope a Vitest `retry: 1` to the DB-concurrency files only. Technical home: the two test files (± `vitest.config.ts`). Cheap to do; low value until the flake rate is annoying enough (a leg re-run currently clears it). Related class: `BL-NEEDS-ATTENTION-DARK-CAPTURE-FLAKE` (CI nondeterminism).

---

## BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE — RESOLVED (2026-08-02, `test/parser-determinism-pair`)

**Resolution:** the entry's recorded diagnosis was wrong in both halves, and the corrected work is test-only. **There is no RNG.** `singleEditNeighbors` / `unambiguousTypos` (`tests/parser/_typoGenerator.ts`) are pure, `REVERSE_MAP` is built once at module load and never mutated, `lib/parser/` reads no env and holds no module-level mutable state, and vitest isolates modules per file — cross-model review confirmed it independently, with five separate processes producing the identical 8453-case SHA-256. So "the input set varies per run" is disproven; what varied was coverage per _edit_, because the case sampled `.slice(0, 4)` aliases x `.slice(0, 6)` typos off a list ordered by `FIELD_ALIASES` insertion order. Worse, that window covered only the five aliases whose canonicals `parseVenue` never assigns (`venue.contact_info`, `venue.in_house_av`, `venue.hotel_reservations` — owned by `contacts.ts` / `hotels.ts`), so not one of the 24 sampled cases could ever prove a value reached a venue field.

**The recovery-gap question is answered: no.** Exhaustive enumeration of all 8453 unambiguous single-edit neighbours across all 11 venue aliases of length >= 5 produces **zero** `UNKNOWN_FIELD` and exactly one `FIELD_LABEL_AUTOCORRECTED` per non-trim case. The 22 trim-equivalent neighbours (leading/trailing space, 2 per alias) resolve EXACTLY after `.trim()` and correctly emit no autocorrect; 2 of them emit `TYPO_NORMALIZED` because `hotal contact info` is itself a registered typo alias. No parser change was needed or made.

The case now enumerates exhaustively behind a non-colliding anchor (assignment is first-wins, so the old `| VENUE NAME |` anchor shadowed every `venue.name` typo), and its oracle is ONE strict deep-equality comparison of the whole returned object against an expectation derived from each case's own inputs — reached after four review rounds each found a mutant escaping a weaker property-listing assertion (anchor corruption; trim cases with no routing assertion; a third field corrupted with a non-sentinel marker; a stray field set to `null` / `""` / a non-string). Guards: a derived coverage floor over assignable canonicals, a per-alias volume floor of `alias.length * 10` (measured ratios 53.8-56.6), and non-vacuity. The case carries its own 30000ms timeout because the exhaustive loop measures ~3.6s against vitest's 5000ms default — shipping it without that would have manufactured the very flake this entry reported. Spec: `docs/superpowers/specs/parser/2026-08-02-parser-determinism-pair.md`. Original entry below.

## BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE — a venue field-alias generator case fails on some seeds

**Status:** OPEN · **Severity:** low · **Surfaced:** full-suite run during `fix/picker-flow-app-bugs` close-out (2026-07-25)

`tests/parser/blocks/venue.test.ts` → `parseVenue — field-label typo recovery (FIELD_LABEL_AUTOCORRECTED)` → `generator: single-edit typos of venue field aliases (≥5 chars) recover` failed inside a whole-suite run, then passed 3/3 whole-file runs (56/56 each) and passed when isolated with `-t`. The generator constructs single-edit typos, so the input set varies per run: some edit lands on a string the recovery does not accept, and the case only fails when that edit is generated.

**Not caused by the branch that found it:** `fix/picker-flow-app-bugs` touches no file under `tests/parser/` or `lib/parser/`, and the test is a pure unit test with no DB coupling.

**What remains:** make the case deterministic or make the recovery cover the edit. Either seed the generator and pin the seed, so a failure is reproducible and a fix is provable, or enumerate the edit classes explicitly instead of sampling. Then decide whether the failing edit is a genuine gap in `FIELD_LABEL_AUTOCORRECTED` recovery — a seed that fails is evidence about the parser, not only about the test. **Reproduce with:** repeated whole-file runs (`pnpm exec vitest run tests/parser/blocks/venue.test.ts`) until it trips; a single run is likely to pass.

**Caveat on the sighting:** the run that caught it was on a box at load 34+ with a sibling session's vitest running, where many unrelated files failed on 5s timeouts. This case is listed separately from that noise because it failed with a substantive assertion rather than a timeout, and because it also failed in a scoped 3-file run.

---

## BL-KNOWN-SECTIONS-WALKER — RESOLVED (2026-08-02, `test/parser-determinism-pair`)

**Resolution:** already delivered on 2026-07-06 by `tests/parser/_metaKnownSectionsWalker.test.ts` (`c6bd73001`), against `docs/superpowers/specs/parser/2026-07-06-known-sections-walker.md`. This entry was stale for ~4 weeks, and so were the docstrings in `lib/parser/knownSections.ts` and `tests/parser/_metaKnownSectionsRegistry.test.ts`, which still said the walker did not exist and was "not cheaply achievable" — that false claim is what scoped this entry as open work at the start of `test/parser-determinism-pair`. What the entry asked for, and where it lives:

| The entry asked for                                                                            | Shipped as                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| route all section-header detection through a shared, introspectable constant/helper            | per-file `SECTION_HEADER_TOKENS` exports plus the shared factory `lib/parser/blocks/_sectionHeaderMatch.ts` (8 importers under `lib/parser/blocks/`, plus `lib/parser/index.ts`). **Partially, by ratified design:** the walker proves each exporter IMPORTS the factory, not that it is used exclusively — `rooms.ts` is import-link-exempt and keeps capture/shape matchers the presence factory cannot express (walker spec §6.7). |
| meta-test imports each parser's constant and asserts it is a subset of `KNOWN_SECTION_HEADERS` | walker step 3, exact-subset                                                                                                                                                                                                                                                                                                                                                                                                           |
| a proof test that an unregistered header fails                                                 | the non-vacuity proof block, 6 cases including negative controls                                                                                                                                                                                                                                                                                                                                                                      |
| (implied) a new parser must not pass silently                                                  | filesystem walk over `lib/parser/blocks/` — a new file fails unless it exports tokens or is allowlisted                                                                                                                                                                                                                                                                                                                               |

This branch retired the entry, corrected both docstrings, and added one narrow guard so the false claim cannot return: the two files may contain none of three named stale-absence phrases and must both name `_metaKnownSectionsWalker`. `tests/parser/_metaKnownSectionsRegistry.test.ts` is deliberately kept — the walker's subset check catches a registry deletion only while some parser still exports the token, so a single edit removing a header from BOTH `KNOWN_SECTION_HEADERS` and the owning parser's tokens leaves the walker green, and `REQUIRED_HEADERS` is what fails then.

**A BL-citation freshness guard was considered and refused on measurement:** of 113 distinct `BL-` ids cited from `lib/`, `tests/`, `scripts/`, `app/`, **70 already resolve archive-only**, essentially all legitimate historical provenance. Such a guard ships as a 70-row allowlist — the same drift-prone hand-maintained artifact this entry itself declined to build. Spec: `docs/superpowers/specs/parser/2026-08-02-parser-determinism-pair.md` §2.7. Original entry below.

## BL-KNOWN-SECTIONS-WALKER — real auto-drift enforcement for the known-section-header registry

**Status:** OPEN · **Severity:** low (defense-in-depth; today's guard is a hand-maintained pin) · **Class:** TEST-ENFORCEMENT GAP

`tests/parser/_metaKnownSectionsRegistry.test.ts` is documented as a drift guard that keeps `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts`) from falling behind the block parsers, but it only asserts a **hardcoded** `REQUIRED_HEADERS` list ⊆ `KNOWN_SECTION_HEADERS`. Both lists are hand-maintained, so a new block parser whose header is registered in NEITHER list passes CI green and its rows would false-positive `UNKNOWN_SECTION_HEADER`. The docstrings in both files were corrected (audit idx87) to describe the real, narrower guarantee (catches an accidental DELETION of a registered header; does NOT detect a genuinely-new unregistered header).

**Why not fixed now:** a robust, low-false-positive walker over `lib/parser/blocks/*.ts` is not cheaply achievable without a parser refactor. Header detection is heterogeneous — plain uppercase literals (`col0Upper === "VENUE"`), lowercase literals (`label === "hotel stays"`), and **regexes** whose matched header is computed, not a literal (`event.ts` `EVENT_DETAILS_HEADER_RE`, `hotels.ts` `/^HOTEL\s+RESERVATIONS?$/`, `rooms.ts` `gsFieldRe`) — and only `dress.ts`/`client.ts` import from `knownSections.ts`. The block-parser sources are also dense with intentional non-header uppercase literals ("NAME", "PHONE", "LED", "TRAVEL", "FRIDAY", "II", "N/A", warning codes), so a naive "every uppercase literal must be registered" walker would need a large hand-maintained exclusion list — the same drift-prone artifact this would replace.

**Fix (when prioritized):** route ALL section-header detection through a single shared, introspectable constant/helper (e.g. a per-parser exported `SECTION_HEADERS` const the parsers match against), then have the meta-test import each parser's constant and assert it ⊆ `KNOWN_SECTION_HEADERS`. Add a proof test that an unregistered header fails. This closes the class structurally instead of by hand-maintained parallel lists.

### BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND — RESOLVED (2026-08-03, `fix/ledger-guard-terminal-claim`)

Both spellings fixed in `tests/docs/_ledgerMdast.ts`, pinned by the M10 plant block and
recorded in the canonical spec at §3.1 of
`docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md`.

- **Heading lane:** after the anchor, a bounded run of a closed-class intensifier
  inventory (`FULLY|COMPLETELY|ENTIRELY|ALREADY|NOW|SUCCESSFULLY`) is stepped past before
  the terminal token is read. The veto is still evaluated AT the terminal word, so
  `NOT FULLY CLOSED` / `NEVER COMPLETELY SHIPPED` / `PARTIALLY CLOSED` stay open.
- **Opening lane:** the prefix before the first token may be whitespace and status markers
  (`✅`/`✔`/`☑`) instead of strictly empty — a consistency repair, since the heading anchor
  and `SEP_AFTER_LABEL` already allowed `✅`.

Proven load-bearing by mutation rather than asserted: reverting either half reds M10, and a
mutant widening the intensifier inventory to `[A-Za-z]+` reds five plants — so the corpus
refuses an over-tightening as firmly as it refuses the blind spot. The nine live
terminal-word-carrying open entries that must NOT close are pinned in the same block.

Both live instances were already archived when this was filed
(`BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK`, `BL-LINT-DEBT-PREEXISTING`); re-run against the
live ledgers after the fix, the only terminal-classified open entry is the pre-existing
ratified exception `BL-CI-STALE-BRANCH-PROTECTION-COMMENT`.

#### BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND — two spellings hide a terminal status from the graduation guard

**Status:** OPEN · **Severity:** medium · **Surfaced:** 2026-08-02, the plans-ledger merge (`chore/backlog-ledger-integrity`)

`tests/docs/_ledgerMdast.ts` misses two independent spellings of a closure. Both were found by
reading entries a human would call closed and asking why the guard did not. Probed against the
shipped walker.

**(1) An intensifier before the terminal word**, in a heading — the word is recognized only in
leading position, so anything in front of it makes the entry read as OPEN:

| heading suffix                           | guard verdict |
| ---------------------------------------- | ------------- |
| `✅ CLOSED`                              | TERMINAL      |
| `✅ RESOLVED (2026-07-03)`               | TERMINAL      |
| `**RESOLVED 2026-06-11 (PR #22)**`       | TERMINAL      |
| `✅ FULLY CLOSED (both instances fixed)` | **open**      |
| `✅ FULLY RESOLVED`                      | **open**      |
| `✅ COMPLETELY DONE`                     | **open**      |
| `✅ ALREADY SHIPPED`                     | **open**      |

**(2) A checkmark AND a parenthetical together**, in a bold opening-line claim. Either alone is
recognized; the combination is not, for every terminal word:

| opening line                             | guard verdict |
| ---------------------------------------- | ------------- |
| `**✅ RESOLVED:** …`                     | TERMINAL      |
| `**RESOLVED (2026-06-21):** …`           | TERMINAL      |
| `**RESOLVED (2026-06-21, \`br\`):\*\* …` | TERMINAL      |
| `**✅ RESOLVED (2026-06-21):** …`        | **open**      |
| `**✅ SHIPPED (2026-06-21):** …`         | **open**      |
| `**✅ CLOSED (PR #22):** …`              | **open**      |
| `**✅ DONE (2026-06-21):** …`            | **open**      |

Spelling (2) is the more dangerous of the pair, because checkmark-plus-date is the most natural
way a person writes a closure.

The `PARTIALLY CLOSED` and `NOT CLOSED` cases correctly stay open — those are the ratified
`VETO` negations/qualifiers, and a fix must not weaken them. The gap is that VETO enumerates
words that _negate_, while nothing enumerates words that merely _intensify_, and an
unrecognized leading word currently defaults to "not terminal".

**Live corruption this caused:** one entry per spelling, each sitting in the open queue while
declaring its own closure. `BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK` (`✅ FULLY CLOSED`, spelling 1)
and `BL-LINT-DEBT-PREEXISTING` (`✅ RESOLVED (2026-06-21, …)`, spelling 2) — both now archived.

Class-swept at filing across the active `BACKLOG.md` and `DEFERRED.md`, twice. The narrow sweep
(both bad shapes) found exactly those two. A deliberately wider sweep — ANY terminal word in a
heading or opening line of an entry the guard calls open — returned 11, of which 9 are correct
refusals the fix must preserve: `PARTIALLY CLOSED` / `Partial closure` (the ratified VETO),
`Status: OPEN`, and terminal words used as ordinary prose (`the closed-port protocol`, the UI
string `"Mark resolved"`). So this is a latent hole, not a backlog of mis-filings — and the
9 correct refusals are the regression set for any fix.

**Why backlog, not a one-line fix:** lane semantics are spec-canonical
(`docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md`, eleven adversarial
rounds). Adding an intensifier class touches the same recognizer the VETO negations run
through, so it needs the plants-corpus treatment (`M1`–`M9` in
`tests/docs/_metaDeferralLedgerGraduation.test.ts`): a discriminating plant per new spelling,
plus proof the existing negation plants still red. Doing it inline here would be an unreviewed
edit to a ratified guard.

**Trigger:** the next change that touches `_ledgerMdast.ts` lane semantics, or a third
instance of either shape appearing in the ledgers.

---

## Reconciliation log

Reconciliation history moved out of `BACKLOG.md`'s header line on 2026-08-02. That line was append-only and every merge re-appended the incoming branch's whole chain, so it had grown to 40 segments / 24,188 characters of which 26 segments were verbatim duplicates. Entries below are the deduplicated set, newest first, verbatim apart from three mechanical edits: the `Prior:` / `Prior same day:` lead-ins were dropped, the mainline row's "merged into this branch" was resolved to "merged into the then-shipping branch" now that the branch is gone, and one shorter 2026-07-26 restatement was dropped as subsumed by the fuller row that also names its branch. No id lost its citation — all 33 `BL-` ids named in the old header line are still named here or in `BACKLOG.md`. No entry defines a `BL-` id; ids named here are citations resolving to their own entries above.

- 2026-08-01 — feat/card-copy-parity-sync-job-names graduated BL-CARD-COPY-HELPFULCONTEXT-PARITY (§4.2 helpfulContext frozen for all 44 rows after reconciling rows 12/29 to the shipped catalog) and BL-SYNC-JOB-FOUR-NAMES (one name: "Auto sync" — catalog x6 codes with §12.4 lockstep, runSummary label, explainer mirror; StagedReviewCard badge unchanged).
- 2026-08-01 — `fix/announce-a11y-pass` graduated the two Cluster A announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`): arm-expiry announcements on all 11 `ARM_REVERT_MS` surfaces (shared `ARM_EXPIRED_ANNOUNCEMENT`, dispatch-entry clears, per-group keying on bulk ignore, StagedReviewCard Apply-disarm fix, T4/T4a/T5 guards) and the ShareHub remote-rotation live region (seed-diff `remoteTokenChanges` counter, mirror-the-cue predicate).
- 2026-08-01 — `test/ledger-guard-mdast-rewrite` graduated `BL-LEDGER-GUARD-MDAST-REWRITE` (the graduation tripwire ported onto the remark/mdast walker at `tests/docs/_ledgerMdast.ts`; the owner-split r22–r41 hardening restored from snapshot `a1cfce98d` with a two-row reconcile; the three r41 findings closed by probe — the split's follow-up branch is retired).
- 2026-08-01 — `fix/judgment-chip-newtab-suffix` (PR #640) graduated `BL-HEADER-JUDGMENT-CHIP-CONTRAST` (border-strong outline, owner-ratified Option A) and `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` (`stripNewTabSuffix` value-position dedup at the three interpolated labels).
- 2026-08-01 — `fix/focus-ring-a11y-pass` graduated the five Cluster A mechanical rows (`BL-FOCUS-RING-CONTRAST`, `BL-PICKER-ROW-RING-OFFSET-BACKDROP`, `BL-IGNORED-SUMMARY-TAP-TARGET`, `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, `BL-BARE-TRANSITION-NO-DURATION-CLASS`) — light focus-ring `#E06000`, info-bg nudge, tree-wide offset sweep + structural guard, default-duration alias, tap floor, switcher width. The two announcement rows (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`) stay OPEN for the follow-up spec.
- 2026-07-31 — `BL-HARNESS-RESOLVER-POLICY` + `BL-HARNESS-PACKLIST-SERVER-GRAPH` graduated on `feat/ci-dark-directive-resolver` (PR-C of the ci-dark descoped close-out: shared `"use server"` directive plugin — a parse-based, throw-on-call resolver — consolidated across both harness bundlers, and `packlist-rescan-recovery` returned to the standalone config under it).
- 2026-07-31 — `BL-CI-VITEST-EXCLUSION-COVERAGE` graduated on `feat/ci-dark-vitest-exclusion` (PR-B of the ci-dark descoped close-out: ENV_BOUND_COVERAGE_REGISTRY + run-excluded execution oracle; test-auth-gate returned to unit-suite).
- 2026-07-31 — mainline reconciliation, merged into the then-shipping branch: 2026-07-31 (`feat/sheet-icon-link-affordance-class` close-out, over the 2026-07-27 three-parallel-pass merge base) — mainline #628 graduated three in-place-terminal entries (`BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` PR #615, `BL-HEADER-PROBE-RESIDUAL-VACUITY` PR #617 — its one live follow-up rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` — and `BL-AGENDA-PERDAY-VIEWER-FILTER` PR #610), corrected `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim, kept `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` deliberately, and hardened the graduation meta-test against terminal HEADINGS and SHIPPED status lines. `fix/duration-tokens-emit-no-css` graduated `BL-DURATION-TOKENS-EMIT-NO-CSS` (alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). `feat/ci-dark-descoped-guards` graduated `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`. `feat/sheet-icon-link-affordance-class` independently graduated the same three plus its own closure `BL-HEADER-LINK-AFFORDANCE-CLASS`, widening the meta-test to heading-suffix and opening-line spellings (SUPERSEDED/DONE in the terminal set); the merge deduplicated the double-graduated archive copies and reverted this branch's graduation of `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` per #628's deliberate keep. Same branch, at close-out: `BL-HEADER-PILL-LINK-TOUCH-BUFFER` and `BL-HEADER-SUBBLOCK-HIERARCHY-WIDE` graduated — both resolved by the feature itself (asymmetric-overlay 2px pill buffer; linkless sub-block floor drop at every width). NOTE (2026-07-31 split, owner-directed): nineteen adversarial-review rounds of additional guard hardening (ledger container/normalization/field lanes; containment extension/symlink/URL/anchor censuses) were split OUT of the shipping PR to `test/guard-hardening-followup` (snapshot at `a1cfce98d`), chartered under `BL-LEDGER-GUARD-MDAST-REWRITE`.
- 2026-07-27 (merged passes) — `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` + `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` graduated on `feat/ci-dark-descoped-guards` (spec-registration detector + post-run baseline comparator), and `BL-DURATION-TOKENS-EMIT-NO-CSS` graduated on `fix/duration-tokens-emit-no-css` (shipped, alias approach; residual gap filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS`). Same day: three entries that had shipped but were annotated terminal in place graduated: `BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED` (PR #615, `feat/ci-lifecycle-gallery`), `BL-HEADER-PROBE-RESIDUAL-VACUITY` (PR #617, `test/header-probe-residual-closure`; its one live follow-up now rides `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT`), and `BL-AGENDA-PERDAY-VIEWER-FILTER` (PR #610, `feat/agenda-perday-viewer-fold`). Also corrected in place: `BL-HEADER-FONT-FALLBACK-WRAP`'s "no `next/font` import anywhere" claim was wrong at filing — the crew show layout has imported Inter since 2026-05-03; the admin tree is what loads nothing. `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` stays deliberately (sub-entry of a still-open parent; rationale in the entry). The graduation meta-test now also rejects terminal HEADINGS and SHIPPED status lines — the shapes this pass caught slipping past it.
- 2026-07-26 — `BL-CHILDLESS-GROWABLE-STATIC-GUARD` graduated on `feat/childless-growable-static-guard`; 2026-07-25 — the three phantom-gap items plus 7 terminal-status entries; 2026-07-24 — 30 entries.

### BL-ADMIN-POSTGREST-DML-LOCKDOWN — Revoke table-level DML on remaining admin-only tables so SECURITY DEFINER RPCs are the sole mutation gate

**ARCHIVED 2026-08-03 — COMPLETE (`feat/db-lockdown-cluster`).** Audited spec §4.3 AT AUDIT TIME (19 live tables, not the 23-table prose count nor this entry's snapshot) and classified each: 8 REVOKEd, 2 documented class-(c) exemptions, 9 already closed. Migration `supabase/migrations/20260803000000_lockdown_admin_only_tables.sql` revokes INSERT/UPDATE/DELETE from anon+authenticated on `sync_log`, `reports`, `sync_audit`, `drive_watch_channels`, `report_rate_limits`, `pending_snapshot_uploads`, `revision_race_cooldowns`, `recovery_drift_cooldowns`; SELECT retained. The exposure was probe-demonstrated first: an ADMIN-authenticated session could INSERT/UPDATE/DELETE these tables through PostgREST, bypassing any SECURITY DEFINER RPC gate that exists. Post-apply the same probe shape returns `permission denied` **on the eight revoked tables**. Note five of the eight are class (b) with no RPC at all, so for them the gain is that the table is unreachable from a browser session, not that writes now route through an RPC. The original demonstration used `admin_alerts` (forging `resolved_by`) because it is the sharpest illustration — but `admin_alerts` is class (c) and that specific bypass remains open by decision, not by oversight. `app_settings` and `admin_alerts` are class (c) — their write paths name RLS as the AUTHORITATIVE gate (`app/admin/settings/_actions/setAutoPublish.ts:47`, `app/admin/actions.ts:139`), so revoking would invert a deliberate trust boundary; they carry `ADMIN_DML_EXEMPTIONS` rows and the promotion path is spec §11. The audit this entry asked for shipped as **Layer 5** (spec-derived completeness: every `ADMIN_TABLES` member must be locked or exempted, so a 20th §4.3 table fails by default) plus a `PUBLIC_TABLE_CLASSIFICATION` registry reconciling all 41 public relations against the live catalog. Spec: `docs/superpowers/specs/db/2026-08-02-db-lockdown-trio-design.md`. Original entry below.

**Partial closure (2026-06-18, crew-page redesign Phase 2 spec R16-HIGH):** the **`shows_internal`** portion is being closed by Phase 2 — the AGENDA `run_of_show` spec adds a `revoke insert,update,delete on public.shows_internal from anon,authenticated` migration + a `RPC_GATED_TABLES` registry row (`tests/db/postgrest-dml-lockdown.test.ts:124`), making the locked service-role sync the single serialized writer (the read-modify-merge would otherwise race an unlocked admin PostgREST write). Verified the only writer is the service-role sync (`runScheduledCronSync.ts:1278`); no authenticated app code mutates the table, so the REVOKE is functionally inert. This locks down `financials`/`parse_warnings`/`raw_unrecognized` on the same table as a side effect (intended). The REMAINING scope below is the OTHER admin-only tables.

**Origin:** Surfaced 2026-05-21 during M9.5 adversarial review R5+R6 (HIGH). The new `revoke_all_links` and `issue_new_link` RPCs correctly held the per-show advisory lock + did the active-roster `EXISTS` gate inside the RPC body, but `crew_member_auth` and `crew_members` retained `INSERT`/`UPDATE`/`DELETE` for the `authenticated` role — meaning any authenticated caller could bypass the RPC entirely by calling the table directly via PostgREST's `from('<table>').insert/update/delete` builder. M9.5 closed the hole for the two tables it touched (REVOKE migration + structural meta-test pinning the invariant). The same vector exists for every other admin-only table whose intended mutation gate is a SECURITY DEFINER RPC but whose DML grants were never explicitly revoked.

**Scope (audit at promotion time, not from this snapshot):** candidates surfaced during R7 prep included `shows`, `pending_syncs`, `pending_ingestions`, `sync_audit`. The actual list MUST derive from the live spec §4.3 admin-only-tables enumeration AT promotion time (per `feedback_audit_derives_from_spec_not_handoff.md`), not from this BACKLOG snapshot — admin-only tables have been amended multiple times (e.g., X.3 caught §4.3 going from 19→21 tables post-handoff). The promotion plan must:

- Walk every admin-only table from spec §4.3 at audit time.
- For each table, determine whether its intended mutation gate is (a) a SECURITY DEFINER RPC (lockdown needed), (b) admin-only RLS with no service-role bypass needed (lockdown also reasonable as defense-in-depth), or (c) intentionally writable by some non-service role (NOT a lockdown candidate; document why).
- For (a) and (b) candidates: ship a `REVOKE INSERT, UPDATE, DELETE ON <table> FROM authenticated` migration + extend the structural meta-test from M9.5 R5+R6 to pin the invariant. The meta-test pattern is the load-bearing defense; a one-line `GRANT` in a future migration silently re-opens the hole without it.
- Audit: write a runtime probe that derives the candidate list from §4.3 + the SECURITY DEFINER function inventory, asserts each candidate table has the expected REVOKEs, and surfaces named diffs.

**Why backlog, not deferred:** The exposure is real but not actively exploited (the M9.5 holes were caught at adversarial review, not in production), and the FXAV product surface is small — `authenticated` callers who could bypass the RPC are FXAV admins or signed-in crew members, not arbitrary internet users. No concrete trigger exists. Picking it up is genuine security-hardening polish; it requires a spec amendment ratifying the "all admin-only-table mutations flow through SECURITY DEFINER RPCs" contract OR a brainstorming session to define the gate-classification matrix table-by-table. Not in-scope for any currently planned milestone.

**Promotion prerequisite:** Either (a) FXAV ops feedback or a security review surfaces an actual exposure path that warrants the work, OR (b) a v1.x security-hardening milestone bundles this with related lockdown work (e.g., RLS-coverage promotion under BL-RLS-COVERAGE-CROSSCUTTING). The structural meta-test pattern shipped at M9.5 R5+R6 is the template; extend the existing meta-test, don't write a parallel one.

**Cross-references:**

- Memory: `feedback_postgrest_dml_lockdown_for_rpc_gated_tables.md` documents the bug class + the planning-time checklist.
- M9.5 R5+R6 commits (full SHAs in M9.5 §13 convergence log).
- Related backlog: `BL-RLS-COVERAGE-CROSSCUTTING` covers the row-level half of the contract; this entry covers the statement-level half. A future v1.x security milestone may bundle both.

### BL-RLS-COVERAGE-CROSSCUTTING — Promote M9 C9 admin-RLS runtime probe to a cross-cutting meta-test

**ARCHIVED 2026-08-03 — COMPLETE (`feat/db-lockdown-cluster`).** Promoted to `tests/cross-cutting/rlsCoverage.test.ts`, and the derivation INVERTED: it now iterates the spec-derived `ADMIN_TABLES` rather than live `pg_policies`, so a §4.3 table with no policy fails instead of vanishing. Three probe-backed defects the old M9 C9 probe missed are now asserted — (a) `relrowsecurity`, because `DISABLE ROW LEVEL SECURITY` leaves the `admin_only` row intact in `pg_policies` and every structural arm stayed green while gating was off (verified by mutant); (b) policy count, because Postgres ORs permissive policies so a second one widens access silently; (c) the two 19-element sets were never the same 19 (`email_deliveries` in one, `ignored_warnings` in the other), which equal cardinality hid from the old length check and from a baseline frozen off the very query it was compared against. The behavioral witness is paired (`admin_count > 0 AND nonadmin_count = 0`) with a global anti-vacuity floor rather than a frozen expected-degradation set, which could not survive the local-vs-fresh-CI row-count difference. **No new required status check** was added: the old probe was already PR-blocking in the same suite, so the win is spec-derivation and fail-by-default, not gating — see spec §6.4, which says so explicitly rather than overstating it. Original entry below.

**Origin:** Surfaced 2026-05-19 during the X.5 seed-handoff drafting. AC-X.5 in spec §17.2 body specifies email canonicalization (matches plan Task X.5), but AC-X.6's required-checks list names the X.5 gate `x5-rls-coverage` — an internal spec inconsistency. The drift will be surfaced by X.5 (in its convergence log) + audited by X.6 (cross-cutting parity assertion). This BACKLOG entry tracks the deferred decision about whether to promote the M9 C9-era `tests/db/admin-rls-runtime.test.ts` runtime probe to a cross-cutting meta-test under a new AC.

**Scope:** M9 C9 shipped `tests/db/admin-rls-runtime.test.ts` covering all 21 §4.3 admin-only tables × behavioral SELECT + structural qual/with_check predicate-equivalence. It runs under the existing `tests/db/` test suite, no dedicated CI check name. Promotion would mean:

- Relocate / extend to `tests/cross-cutting/rls-coverage.test.ts` under the X.\* lineage pattern (regression fixtures, audit-derives-from-spec, CI gate exposure).
- Add a dedicated CI gate name (e.g., `x7-rls-coverage` if X.5/X.6 keep their existing assignments, or absorb into an X.5 reframing).
- Author a spec amendment defining the new AC (placement TBD — new AC-X.7, or reframing AC-X.5 to split email-canon + RLS-coverage into two ACs).

**Why backlog, not deferred:** The M9 C9 probe works today; behaviorally there's no coverage gap. Promotion is polish work (move from per-domain test to cross-cutting meta-test for discoverability + CI gate naming consistency). Promotion requires (a) a spec amendment decision about AC placement, (b) a ROUTING.md decision about whether the new AC gets a check name, (c) a brainstorming session to confirm the promotion is worth the spec churn vs leaving the probe in `tests/db/`.

**Promotion prerequisite:** spec amendment defining the new AC, OR a decision to reframe AC-X.5/X.6 to absorb RLS coverage. Either path is a real spec-amendment cycle with adversarial review, not a casual edit.

---

## BL-PICKER-CLAIMED-ROW-PENDING-STATE — RESOLVED (2026-08-03, `fix/picker-signin-flow-cluster`) — no pending affordance on the claimed-row sign-in control

**Status:** OPEN · **Severity:** low-medium (re-tap risk on venue wifi) · **Surfaced:** impeccable critique of `fix/picker-flow-app-bugs` (2026-07-25), P2

Tapping a claimed roster row (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`) is a full GET to `/auth/sign-in` and then on to Google — three or more hops with the row visually inert the whole time. On ballroom wifi a crew member will tap it again. Every other mutating control in the admin surfaces uses `useFormStatus` for this (10+ components), and the `"Confirming…"` pending idiom is ratified in `docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md:175` (this entry previously cited "master spec §16.6", which does not exist — §16 has only §16.1 and §16.2).

Not a regression: the control had no pending state before the hidden-input fix either. Deferred rather than folded into that branch because the row is currently rendered by a Server Component, so a pending state needs a new client boundary — a real change to the picker's component topology, not a class tweak. **Fix (when prioritized):** extract the claimed-row control into a client component using `useFormStatus`, matching the disabled + label-swap recipe the admin surfaces already use. Trigger: next crew-page UX pass, or a report of double-tap sign-in loops.

**Resolved.** The claimed row's button became a `"use client"` island with local pending state:
the lock swaps to a spinner in a shared fixed-width slot, the role chip reads `Signing in…`, and
the row reports `aria-disabled` + `aria-busy`. Three mechanism choices were forced by measurement,
not preference — `useFormStatus` does NOT fire for this form (it is a native GET, measured
`NATIVE_GET=false` / `FUNCTION_ACTION=true`), `aria-disabled` rather than the native `disabled`
attribute keeps keyboard focus, and the `onClick` must call `preventDefault` because neither
`aria-disabled` nor an early return cancels a submit's default action (measured `submits=2`).
The entry's own proposed fix — "use `useFormStatus`, matching the admin surfaces" — was therefore
wrong, and would have shipped an affordance that never appeared.

---

### BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED — RESOLVED (2026-08-03, `fix/picker-signin-flow-cluster`) — a `next` carrying a query string fails the bootstrap

**Status:** OPEN — measured on `test/agenda-fold-seeded-e2e` (2026-08-02) · **Severity:** low · **Class:** AUTH UX

A Google session that matches a crew row with no picker-cookie entry yet resolves to
`needs_picker_bootstrap` and redirects through `/api/auth/picker-bootstrap`. When the `next` it
carries has a query string — e.g. the deep link `/show/<slug>/<token>?s=schedule`, which is exactly
what a crew member gets from a section link — the handler does not land back on the show and renders
"Sign-in unavailable / Sign-in landed somewhere we don't recognize." Measured on BOTH engines
(Chromium and WebKit), so it is not a cookie-storage artifact: the bare URL bootstraps fine and the
same URL with `?s=schedule` does not.

**Blast radius today.** First contact only, and only on a deep link: once the cookie exists the
query rides along normally. A crew member who hits it can recover by opening the bare show link, so
the effect is a confusing dead end rather than lost access.

**Worked around, not fixed, in e2e.** `stage-restricted-crew-schedule.spec.ts` bootstraps on the
bare URL and re-navigates with `?s=schedule`. That documents the limit; it does not close it.

**Fix (when prioritized):** decide whether the bootstrap should preserve the `next` query (probably)
or strip it and redirect to the canonical show URL, then pin the chosen behavior with a route test
covering a query-bearing `next`.

**Resolved.** `parseNextPath` now splits the query off before matching `SHOW_NEXT_RE`, which keeps
its `$` anchor on the path portion. Blast radius was wider than this entry recorded: three of the
four shapes `buildShowReturnUrl` emits were 403ing, not only section deep links — `?gate=skip` is
an ordinary first-contact path. The two-step workaround in
`tests/e2e/stage-restricted-crew-schedule.spec.ts` is retired at all three sites, and reverting the
fix reds them, which is the end-to-end proof.

## BL-LEAD-CAPABILITY-PROSE-STALE — two prose claims that LEAD grants an admin/ops surface

**RESOLVED 2026-08-03** (`chore/orphan-components-lead-prose`). Both claims settled by reading the contract each belonged to; both turned out to be stale rather than intentional.

**Filed:** 2026-08-02 (`chore/copy-deadcode-sweep`, spec review R1 finding 1) · **Class:** docs/copy + contract · **Severity:** low · **Effort:** S each, but each needs a contract read

Probed while fixing `BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: **no role flag grants admin access.** `is_admin()` (`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql`) reads the JWT `app_metadata.role` claim and the `admin_emails` table, and never consults `role_flags`; the admin tree gates on admin identity. Sweeping every production use of the LEAD flag finds financials entitlement (`lib/visibility/scopeTiles.ts`, `lib/data/getShowForViewer.ts`), the audio/video/lighting scope-tile predicates, and a "Lead" chip. No admin path exists.

The shipped Doug-visible copy was corrected on that branch (§12.4 helpfulContext, its `longExplanation`, and the explainer mirror). Two prose claims were deliberately NOT edited, because each is a statement about what a capability confers rather than a copy string, and changing one is a ratification act:

1. **`lib/visibility/capabilityTransitions.ts`** — its module-header predicate list carries `financialsVisible = isAdmin || LEAD (LEAD-or-admin)`, while the live predicate is `isAdmin || LEAD || FINANCIALS`. Whether the line is wrong or is an accurate description of a flip matrix that deliberately models `hasLead` only cannot be settled without reading the matrix contract.
2. **Master spec MI-9** (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) — "LEAD additionally grants the admin/ops surface". Contradicted by the probe above. May encode intent rather than a stale description.

**How it was settled.**

1. **`lib/visibility/capabilityTransitions.ts` — WRONG, of the stale-verbatim-quote kind.** The block the line sits in is labelled "Tile-visibility rules from `lib/visibility/scopeTiles.ts` (verbatim branch logic)", and `financialsVisible` gained its third branch at `e348c81ca` (2026-07-16) without the quote following. It was NOT "an accurate description of a matrix that deliberately models `hasLead` only" — though the matrix genuinely does not model `FINANCIALS`, which is now stated as an explicit modeling boundary and filed as `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE`. `tests/visibility/capabilityHeaderParity.test.ts` extracts the expected flag set from `scopeTiles.ts` SOURCE and compares sets, so the block cannot drift that way again.
2. **Master spec MI-9 — a STALE DESCRIPTION, not encoded intent.** "admin/ops" was always copy: its oldest instances are the §12.4 strings ratified at `9700c447b` (2026-05-09), MI-9's earlier wording carried the same claim, and `aaab97102` rewrote the clause around it. Every other instance had since been retired or corrected, leaving this one. The clause now states what LEAD actually confers beyond FINANCIALS — the audio/video/lighting scope tiles and the crew-page "Lead" chip — and that neither flag grants admin access, naming `is_admin()`'s two arms.

**A third instance the literal sweep could not see:** `lib/sync/phase2.ts` said a capability flag "would grant ops/financial access silently" — the same claim in production source, in a semantic variant. Corrected in the same commit. `tests/docs/capabilityClaimProse.test.ts` now scans the MI-9 rows AND every `.ts`/`.tsx` under `app/`, `components/`, and `lib/` with a positive-claim recognizer (a raw admin/grant ban could never go green, since the corrected prose itself says neither flag grants admin access), pinned by six fixtures including `lib/parser/typoVocabRegistry.ts`'s unrelated "ops/financials field-alias" as the hardest negative.

---

### BL-SYNC-FEED-UI-POLISH — impeccable v3 LOW/no-harm follow-ups (changes-feed UI)

**Filed:** 2026-06-10 from the Phase-6 impeccable v3 dual-gate (gate PASSED; zero HIGH after the Approve-button accent fix; these are LOW / no-user-harm, no concrete trigger — same shape as the `BACKLOG-B2UI-*` batch below (`:1303-1305`): one parent entry, the individual findings as sub-bullets under it). Citation corrected 2026-08-02: this line gave that family a `BL-` prefix, which resolves to nothing — the real ids carry the `BACKLOG-` prefix. A one-word prefix typo, not a vanished family; the analogy it draws was always sound. The wrong spelling is described rather than written out, since re-typing it would re-create the dangling reference.

- **BL-SYNCFEED-UI-1** — `UndoChangeButton`: post-submit success relies on page revalidation flipping the row to `undone`; consider an `aria-live` region announcing undo success (the failure path already surfaces via `ErrorExplainer`).
- **BL-SYNCFEED-UI-2** — `ChangeFeedBadge`: `title` tooltips are hover-only (desktop); acceptable since the visible text label already carries meaning (color-blind floor met) — only act if touch-discoverability is raised.
- **BL-SYNCFEED-UI-3** — `Disposition` test fixtures pass `{disposition:'removal', name:…}` where the canonical union has no `name` on `removal` (off-type but harmless at runtime; `dispositionName` returns null for removal). Tighten the fixtures if/when the `Disposition` type is hardened.

**GRADUATED 2026-08-03** (`feat/sync-feed-undo-announce`). All three children disposed:

- **BL-SYNCFEED-UI-1 — RESOLVED, with its own premise corrected.** The note proposed an `aria-live` region inside `UndoChangeButton`. That placement cannot work: a successful undo moves the row out of `status='applied'`, `action` flips to `none` (`lib/sync/feed/shapeChangeFeed.ts:65`), `canUndo` goes false and the whole button subtree unmounts before assistive technology can read anything. Six adversarial rounds then established that no surface-level owner works either — the group empties, the strip returns null, the dashboard returns a different tree, the feed is swapped for its error rendering. The channel now lives in `AdminAnnounceProvider`, mounted by `app/admin/layout.tsx` and by `ReviewModalShell` (a modal needs its own, because content outside an `aria-modal` dialog is excluded from the accessibility tree). Append-shaped `role="log"`, because two shows dropping a same-named crew member produce byte-identical announcements.
- **BL-SYNCFEED-UI-2 — RATIFIED as untriggered, no code.** The entry conditions action on touch-discoverability being raised; it has not been. `ChangeFeedBadge` renders the status as a real text node (`components/admin/ChangeFeedBadge.tsx:55`) with `title` as pure supplement, so no information is hover-only. **Re-open trigger preserved:** raise it if touch discoverability of the badge tooltips is ever reported as a problem.
- **BL-SYNCFEED-UI-3 — GRADUATED as already-shipped.** The off-type fixture was corrected at `c3920fe6a`; `tests/components/admin/ChangeFeedEntry.test.tsx:192` reads `{ disposition: "removal" as const }`, and a tree-wide sweep finds no removal literal carrying `name`. The `Disposition` union at `lib/sync/holds/types.ts:7-10` never moved, so the entry's "tighten if/when the type is hardened" premise was moot.

**Filed from this work, not fixed:** `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`.

Spec `docs/superpowers/specs/2026-08-03-undo-success-announcement-design.md`; plan `docs/superpowers/plans/admin/2026-08-03-undo-success-announcement.md`.

---

---

## BL-HEADER-FONT-FALLBACK-WRAP — RESOLVED (2026-08-03, `feat/font-binding-modal-freshness-cue`)

**Resolution.** The browser check the entry asked for was run first, and it changed the shape of the finding.

_What the probe found._ Next 16's `next/font/google` registers the face under the **literal** family name `Inter`, not a hashed one — so the crew layout's import DID bind, and the entry's stated doubt ("`next/font`'s hashed `@font-face` family name does not obviously satisfy") is empirically refuted for this Next version. Measured on a real crew page: inherited width 192.38px, forced `"Inter"` 192.38px, generic `sans-serif` 182.61px. But on every non-crew route the same string measured 187.28px against Inter's 168.91px — the host system font, not Inter.

_So the real finding was wider than the entry knew._ The product rendered **two type families across its trees** — Inter on crew pages, the host sans on admin, auth, help and the crash screen — while `DESIGN.md` §2.1 commits to one, and named `app/layout.tsx` as the place to load it. That wiring had never been done. Admin numerics also silently lost the `cv11`/`tnum` treatment §2.4 specifies, since those alternates exist only in Inter.

_What shipped._ The loader lives in `app/fonts.ts`, whose single exported instance both Next roots import — `app/layout.tsx` and `app/global-error.tsx`, which renders its own `<html>` and replaces the root layout on a fatal error, so the crash screen was otherwise the one tree left behind. `--font-sans` reads `var(--font-inter, "Inter", "Inter Fallback"), …`: naming the literal skipped next/font's generated metric-matched fallback face, so the `display: "swap"` window reflowed ~10% on every route until the impeccable critique measured it.

_Scope, stated plainly — and narrowed twice during review, so read the claim as written._ This closes the wide-fallback path for **every Next-rendered surface with a React root** — every page of the product proper. Deliberately NOT "everything a user reads": the four auth error documents below are read when they appear. Two things it does NOT reach, both documented rather than quietly implied:

- The 31 standalone test harnesses compile `app/globals.css` with no Next runtime, so they keep measuring the ambient host font by construction. Costs nothing today (the one font-sensitive measurement carries a deliberate Arial / Liberation Sans pin). Filed as `BL-HARNESS-FONT-FIDELITY`.
- Four route handlers build their own complete `<html>` as a string and mount no React root: the Google-auth start, the picker bootstrap, the auth callback, and sign-out. All four are persistent ERROR pages (503/403/502/500) with readable copy and no automatic redirect — review R6 corrected an earlier claim that they were transient bounces. Sign-out's explicit `system-ui` is defensible on one narrow fact — it is a self-contained document requesting ZERO external assets, so a webfont would add its first network dependency — and NOT on any general "error pages avoid webfonts" principle, which this change contradicts by binding the font on the fatal-error page. The other three fall to browser-default serif. Filed as `BL-AUTH-INTERSTITIAL-FONT`.

_The tolerance in `tests/e2e/section-header-layout.layout.spec.ts` was NOT widened_, per this entry's own instruction.

_Guards._ `tests/e2e/font-binding.spec.ts` measures rendered text width on `/admin`, `/auth/sign-in` and a seeded crew route — width, not `document.fonts.check()`, which returned `true` on a tree with no Inter face registered at all. It also asserts exactly one font family and no duplicate `@font-face` tuple, which CORROBORATE the static guard rather than closing it — four review rounds each produced new syntactic escapes from a source-parsing check, so the guard's claim was narrowed to what it actually proves. `tests/assets/singleFontLoader.test.ts` is the millisecond tripwire, pinning the loader's PATH (a count cannot tell "one loader, at the root" from "one loader, in the wrong layout" — exactly this bug). It is a tripwire for the ORDINARY accident and proves no closure: four adversarial rounds each found a location a file-walk cannot see, and the vector was descoped per the AGENTS.md same-vector rule rather than patched a fifth time. Spec §4.3 records what that leaves open and why it is acceptable. Wired into `crew-e2e.yml`, which builds and starts the production artifact.

Spec: `docs/superpowers/specs/2026-08-03-app-wide-font-binding.md` · Plan: `docs/superpowers/plans/2026-08-03-app-wide-font-binding.md`

---

## BL-STAGED-IDENTITYLINK-RENAME-IDENTITY — RESOLVED (2026-08-03, `feat/staged-identitylink-rename-identity`) — dashboard staged apply treats identity-link renames as remove+add

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug §2.5) · **Class:** sync (staged identity application) · **Effort:** M (staged-core threading + double-apply analysis)

The dashboard staged-apply path (`applyStagedCore`) applies an identity-linked rename (MI-12/13/14) as **remove-old + add-new** by ratified contract (R33-2, `applyStagedCore.ts:552`; passes zero `identityLinkRenames`), so crew identity (id/oauth link) is NOT preserved across a rename on that path. The capability AUDIT is already complete (arm (c) audits the removed old identity's loss + arm (b) the added new identity's grant, path-independent), so this is NOT an audit gap. If identity-PRESERVATION on the staged path is ever wanted, thread `identityLinkRenames` through `applyStagedCore` (compute via `computeIdentityLinkRenames` from the staged `triggeredReviewItems`) — but resolve the double-apply / R33-2-override risk first. Trigger: a report of a staged rename losing a crew member's oauth link.

**Resolved.** `docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md`, branch `feat/staged-identitylink-rename-identity`: `computeStagedIdentityLinkRenames` links a pair only when its validated reviewer choice is `rename` (the per-item admin vouch, the staged analogue of cron's version-bound accept), and `applyStagedCore` threads the result into `runPhase2` behind a length gate. A staged rename now preserves `crew_members.id` and `claimed_via_oauth_at`; `independent` still applies as remove+add, so the R33-2 feed assertions are untouched. The double-apply / override risk this entry flagged resolved as a choice gate, not a path override — the role-flags spec's staged loss+grant audit shape is superseded in part, banner-fenced in both directions.

## BL-NEEDS-ATTENTION-HOLDS-ROLLUP — RESOLVED (2026-08-03, `feat/needs-attention-holds-rollup`)

## BL-NEEDS-ATTENTION-HOLDS-ROLLUP — pending MI-11 holds do not surface on the needs-attention page

**Filed:** 2026-08-02 (retroactively; `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-mobile-needs-attention-design.md:285` lists it under §11 Deferred as a "BACKLOG candidate", and no row was created). **Class:** UX completeness. **Effort:** M (blocked on a read path).

`/admin/needs-attention` rolls up the durable attention stream but shows no pending MI-11 holds, so a hold is visible only from the show it belongs to. Verified 2026-08-02: no cross-show holds read path exists in `lib/` or `app/`, which is the actual blocker — the page cannot roll up what nothing can query.

**Work:** build the cross-show holds read, then add the rollup. Prerequisite first; the page change is small once the read exists. UI surface, so Opus-owned with the invariant-8 dual gate.

**Status:** RESOLVED.

**How it resolved:** the missing cross-show read landed as `lib/admin/identityHolds.ts` (service-role `sync_holds` read, `kind='mi11_pending'` on non-archived shows, bounded `.limit(HOLDS_ROW_CAP + 1)`) plus a pure `groupHoldRows` core shared by BOTH transports, so the needs-attention page, the dashboard inbox, the AdminNav badge, the mobile summary-card chip, and the daily digest all group holds identically (one card per show; a single hold shows its own summary, several collapse behind a count line and a disclosure). Spec `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md`, plan `docs/superpowers/plans/2026-08-03-needs-attention-holds-rollup.md`. Seeded e2e coverage in `tests/e2e/needs-attention-holds.spec.ts` pins the kind + archived filters, the badge counting SHOWS rather than rows, and reject clear-through.

---

---

## BL-HARNESS-FONT-FIDELITY — the standalone harnesses measured a different font than the product renders

**Status:** RESOLVED — SHIPPED 2026-08-04 (`feat/harness-font-fidelity`, PR #705).

**Filed:** 2026-08-03 (`feat/font-binding-modal-freshness-cue`, the successor residual of `BL-HEADER-FONT-FALLBACK-WRAP`). **Class:** test fidelity / CI determinism. **Effort:** M.
The 31 standalone e2e harnesses route through `compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`), which runs the Tailwind CLI over `app/globals.css` and serves the result as a static file beside harness-rendered markup. There is no Next.js runtime, so no `next/font` `@font-face` — they resolve `--font-sans`'s literal fallback pair and land on the ambient host font (SF Pro locally, DejaVu Sans on the Ubuntu runner). The product now renders Inter on every React-root surface; the harnesses measure something the product never shows.
**Cost today is zero**, which is why this is backlog and not deferred: CI is green, and the one measurement that was font-sensitive carries a deliberate Arial / Liberation Sans metric-compatible pin with its reason inline (`tests/e2e/section-header-layout.layout.spec.ts:165-183`). Widening that tolerance is refused — it hides the finding.
**Work:** give `compileEntryCss` a font asset to emit alongside the stylesheet it already writes, and an `@font-face` to match. It is a single choke point, so all 31 harnesses gain fidelity at once. The tradeoff to decide first: that is a SECOND font-delivery mechanism alongside `next/font`, and two sources for one family can drift. The alternative — self-hosting the face and having both the app and the harnesses read it — is a larger change that would supersede `DESIGN.md` §2.1's ratified `next/font` mechanism, so it needs a spec, not a patch.

**Shipped.** The face is declared once in `app/fonts.css` over the committed binary and read by BOTH Next roots AND by `compileEntryCss`, so the harnesses render what the product renders. One committed source, one set of bytes, nothing to drift against — which is what the entry's own "Work" paragraph said a second delivery mechanism could not give.

**The entry's count was 31 and is 32 as shipped**: the browser guard this work added is itself a `compileEntryCss` caller, and the fail-by-default wiring meta-test found it rather than anyone remembering.

**The spec it asked for was written, and its central premise expired before implementation began.** `docs/superpowers/specs/2026-08-03-harness-font-fidelity-design.md` was drafted against `next/font/google` and mandated seven Google v20 subsets "byte-identical to what next/font downloads". `main` moved underneath it — `ca8efc694` and `6c2615e9c` had already switched to `next/font/local` over an upstream Inter v4.1 subset, and the spec named that mechanism nowhere. Shipping §3.3 verbatim would have replaced the vendored binary with Google's build, which has `ss04`, `zero`, `cv*` and the `opsz` axis stripped — reverting `BL-INTER-NUMERAL-DISAMBIGUATION` and failing `tests/styles/fontFeatureAvailability.test.ts`. User-ratified 2026-08-04: one face over the existing bytes. §3.3, §3.4 and §1's unpinned-input paragraph are marked SUPERSEDED in place rather than rewritten, because `consistency.mjs` cross-checks the document's own counts and editing them would have made it internally inconsistent.

**Guards.** 16 static rows over `app/fonts.css` parsed with Lightning CSS — the front end `@tailwindcss/cli` already uses — with 30 mutants killed; 9 rows over the emitted harness block plus a real-browser guard (request 200, face `loaded`, rendered advance within 0.5px of a byte-derived expectation); a shared fixture distributing the oracle to all 32 callers behind a fail-by-default wiring meta-test keyed on the `test` BINDING; 87 `document.fonts.ready` waits behind an order-aware AST guard; and a 32-route × 2-viewport census with a frozen mono manifest and a registered-face-set assertion.

**Four things measurement overturned, each recorded where it was wrong rather than quietly corrected.** The mutation matrix caught the guard not comparing the fallback's override VALUES (inventory equality proves a descriptor exists, never what it says). CI caught a Linux/macOS text-rasterization difference — hinted 132px against geometric 130.09375px — root-caused in the pinned container rather than by widening a tolerance. The impeccable critique caught a rationale written into five surfaces claiming the harnesses bind through the inline literal, which stopped being true the moment this branch's own post-step began appending `app/fonts.css` whole. The audit caught the binary losing its one-year immutable cache when it moved out of `.next/static/media/`, which the filename's new content hash and a `next.config.ts` header restore.

**Documented limits.** The four rootless auth HTML responses stay excluded (`BL-AUTH-INTERSTITIAL-FONT`). The route census is a ratified SAMPLE over an enumerated driven set, not a completeness pursuit. The layout root emits its preload twice (React 19 hoists and also renders in place; browsers dedupe by URL), and the prerendered global-error artifact carries no preload at all.
