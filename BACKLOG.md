# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-07-25 — the three phantom-gap items graduated on `feat/section-header-rebuild-phantom-spacers` (7 terminal-status entries graduated earlier the same day; 30 on the prior 2026-07-24 pass). All seven had been annotated CLOSED / WITHDRAWN / RESOLVED in place rather than moved, which is the drift this header exists to catch; `tests/docs/_metaDeferralLedgerGraduation.test.ts` now fails on a terminal status in this file, so the class cannot silently reopen.

---

## Drive-ID coverage guard — deliberately-undone parts (2026-07-25)

Filed per the owner's scope decision during `fix/secondary-drive-id-nonblank`. The guard shipped in
its minimal form — one live census query, a pure auditor, an empty exemption list, running in
`unit-suite-db` (a worker of the required `unit-suite` aggregator). Four mechanisms were deliberately
NOT built, each after adversarial review showed the attempted version was defeatable. Spec §10 and
§11: `docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md`.

**Read the provenance before picking any of these up.** Seven spec rounds and three plan rounds
(55 findings) are the analysis behind them; the reason each is open is that the obvious fix was tried
and shown not to work, not that nobody thought about it.

### BL-DRIVEID-CENSUS-QUERY-SELF-CHECK — detect a census-query regression that silently narrows the audited set

**Status:** OPEN · **Severity:** medium · **Class:** GUARD COMPLETENESS

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

**Status:** OPEN · **Severity:** medium · **Class:** GUARD SOUNDNESS

`tests/db/validation-schema-parity.test.ts:256-284` asserts validation contains each expected
`conname`. Constraint names are unique per TABLE, not per schema (measured), so a same-named constraint
on a different public table satisfies it — as does one with the right name and a weakened definition
such as `CHECK (true)`. The 2026-07-25 change extended that test's parse and count but deliberately did
not re-architect it.

**Fix (when prioritized):** compare `(schema, table, column)` tuples plus `pg_get_constraintdef`
against the canonical templates in `lib/driveIdCoverage/audit.ts`, exactly as the local guard does.

### BL-VALIDATION-TARGET-BINDING — `validation-schema-parity` cannot prove which database it connected to

**Status:** OPEN · **Severity:** medium · **Class:** GUARD SOUNDNESS · **Pre-existing**

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

**Status:** OPEN · **Severity:** low · **Class:** TEST COVERAGE

`tests/db/driveFileIdNonblank.db.test.ts` behaviorally probes 7 of the 23 constrained columns
(3 pre-existing + the 4 added 2026-07-25); the rest are covered by declaration only — the live guard
proves a canonical CHECK is DECLARED, not that it BEHAVES. Mechanical, bounded, unglamorous: each
addition needs an insert shape satisfying that table's NOT NULL siblings and composite keys.

---

## Admin lifecycle e2e (2026-07-24, share-link-chrome-backlog review r4)

### BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED

`tests/e2e/admin-lifecycle-transitions.spec.ts:305` asserts `admin-share-link-inactive` contains "The crew link is inactive while this show is unpublished." That testid was RETIRED by the share-hub consolidation (`docs/superpowers/specs/2026-07-20-share-hub-design.md:106` lists it under Removed); no production module emits it, and current unit tests assert its absence. The spec would fail if it ran.

It does not run: no workflow references `admin-lifecycle-transitions`, so it is CI-dark. Confirmed pre-existing — the identical assertion is on `origin/main`, and the share-link-chrome-backlog branch does not touch the file.

**Fix:** replace the assertion with whatever now carries the crew-link-off copy (the hub's paused primary label, per `shareHub.test.tsx`), then decide whether the spec should be in a workflow at all — a permanently dark e2e is the reason this survived.

**Surfaced by:** round-4 adversarial review of #598, which found it while checking that branch's retirement of the testid. Recorded rather than fixed there: out of scope for that PR, and it cannot be validated without first un-darkening it.

## BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA — user-supplied text containing the announcement gets it twice

**Filed:** 2026-07-26 (branch `fix/newtab-announcement-family`, PR #592 close-out review round 2, LOW). **Class:** a11y polish. **Effort:** S.

Three `aria-label`s interpolate user-supplied text and then append the canonical `(opens in a new tab)` suffix unconditionally. When the interpolated value already contains that phrase, the name announces it twice:

- `components/admin/wizard/Step3ReviewModal.tsx:410` and `components/admin/showpage/PublishedReviewModal.tsx:722` interpolate a show title. A show titled `Summit (opens in a new tab)` announces as "Open the source sheet for Summit (opens in a new tab) in Google Sheets (opens in a new tab)".
- `components/admin/wizard/step3ReviewSections.tsx:3585` interpolates a diagram's `alt`, with the same result.

Titles and alt text come from admin-entered Google Sheet cells, so the input is reachable but pathological — nobody has typed it, and the degraded name is verbose rather than wrong (it still announces, and still names the destination). Recorded rather than fixed at close-out because the fix wants **one shared helper** that appends the suffix only when it is absent, not three inline conditionals: the copy already lives in exactly one place (`components/shared/NewTabHint.tsx`) for the visually-hidden span, and the label path should get the same treatment rather than a second copy of the rule. Doing that properly means a helper, its tests, and a sweep of every label that appends the phrase (currently 6 Group B anchors), which is more than a close-out patch.

Cheap partial if it ever bites in practice: strip a trailing occurrence from the interpolated value before appending.

## BL-HEADER-JUDGMENT-CHIP-CONTRAST — the judgment icon chip is near-invisible, and the sm+ row made it load-bearing

**Filed:** 2026-07-26 (late-arriving impeccable Assessment A on PR #612 — the dispatched sub-agents' results landed post-merge; the inline degraded run had missed all three findings below).

`bg-info-bg` (#eeeae3, `app/globals.css:295`) against the clean chip's `bg-surface-sunken` (#f4f3f1, `app/globals.css:278`) is ~1.06:1 in light mode; at 28px the two chips differ only by a hairline `border-border`. Below `sm` this barely mattered — the "Parsed with judgment" pill sat directly under the name. At `sm`+ (PR #612) the pill migrates to the row's far edge (up to ~600px away at the 744px cap), so the only cue NEXT TO the name for the judgment state is a chip that reads as clean. Flagged is unaffected (amber is distinct). Fix candidates that do not touch the ratified pill placement: `border-border-strong` on the judgment chip, or an info fill separable from `surface-sunken`. Contrast-pin any new/repurposed token per the pre-code mechanical UI gate.

## BL-HEADER-PILL-LINK-TOUCH-BUFFER — zero dead zone between the inline pill and the sheet link's hit area on touch

**Filed:** 2026-07-26 (same late Assessment A).

`sm:gap-2.5` + `sm:ml-0.5` = 12px, exactly the `before:-inset-3` reach — the 44px hit area is TANGENT to the pill's right edge (the #612 spec fixed the 2px overlap to tangency, pinned by an `elementFromPoint` case at the pill's right-edge-minus-1px). But `sm`+ is not mouse-only: a phone in landscape (~852px viewport) takes the inline branch, and a thumb landing 1px right of "Needs a look" opens a new tab. `sm:ml-1` (4px, tokenized) would buy a 2px dead zone at negligible visual cost; the existing tangency test keeps passing and a second probe just outside the pill edge could pin the buffer.

## BL-HEADER-SUBBLOCK-HIERARCHY-WIDE — the Diagrams sub-block's subordination signal thins out in the sm+ row

**Filed:** 2026-07-26 (same late Assessment A; extends the narrow-mode footprint item 6 in the 2026-07-25 post-merge review list above).

The sub-block is always linkless and never flagged (its chrome provider sets no sectionId/dfid), so nothing in its header is tappable — yet `sm:min-h-tap-min` gives it the same 44px one-row shape as its parent section at `sm`+, leaving subordination to a 4px-smaller chip and 2px-smaller text. Candidates: drop the floor for `sub` at `sm`+ (`sm:min-h-0` — the narrow-mode fix already filed as item 6 applies the same conditional idea), or an `sm:pl-*` indent nesting it under its parent. Confirm-only sibling note (P3): a linkless+PILLED row would sit 32px right of a linked row's pill at `sm`+, but that combination appears unreachable in production (Diagrams is never flagged; "report" carries no pill) — verify before treating as real.

## BL-HEADER-LINK-AFFORDANCE-CLASS — the corner sheet link paints as non-interactive, in three spellings, across three call sites

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

## BL-HEADER-PROBE-RESIDUAL-VACUITY — four adversarial-review findings the section-header probes do not close

**Filed:** 2026-07-26 (branch `feat/section-header-rebuild-phantom-spacers`, adversarial review round 3). **Class:** test hardening. **Effort:** M, and read the rationale before spending it.

Three review rounds produced 13 / 14 / 13 findings, all one vector: _this assertion can be vacuous in some configuration the test does not enter._ Rounds 1 and 2 were repaired in full. Round 3 was repaired except the four below, which are recorded rather than fixed because the vector was ruled **non-convergent** — each round names a new configuration (a theme, a viewport, `:active`, a transition delay, SVG SMIL, `clip-path`, `mask`, `filter`) and the set of ways to move a box or paint nothing is open-ended. The project's own rule for this shape is to stop enumerating and change the mechanism, which rounds 2 and 3 already did twice (the property ban-list became an allowlist; the paint heuristic became `checkVisibility` plus a pixel test).

**Open, with what each would cost:**

1. **The real-route width chain anchors only 375, 640 and 1280 (640 added 2026-07-26).** 320 and 430 are assumed, so a breakpoint changing pane padding at either would leave 60 static matrix cases green against counterfactual container widths. Closing it means two more hydrated-modal mounts in `tests/e2e/admin-layout-dimensions.spec.ts` (~2 min of CI each).
2. **`:active`, and simultaneous hover+focus, are not swept.** `active:transition-transform` on the corner link would shift it during a real press. The three swept states (idle, hover, focus) do not compose.
3. **SVG SMIL is invisible to the sweep.** An `<animateTransform>` inside the status icon moves geometry while every CSS channel reads `none`. No such element exists in the tree today; `lucide-react` emits static paths.
4. **Exotic paint suppression.** `clip-path: inset(50%)`, a transparent `mask`, and `filter: opacity(0)` are now checked, but the check is pattern-based — a computed `clip-path` expressed differently, or a partially transparent mask, would slip through.

**Before picking any of these up, decide whether the answer is a fifth heuristic or a different instrument.** A visual-regression baseline over the header row would subsume 2, 3 and 4 at once by comparing PIXELS instead of enumerating the ways pixels can go missing — and the repo already has the pinned-Docker discipline that such a gate requires (see the byte-comparison rule in AGENTS.md). That is likely the better spend than another round of property lists.

**What IS covered, so this entry is not read as "the probes are weak":** 108 standalone layout cases (88 section-header, incl. the sm+ inline-row suite, + 20 pusher) and 6 real-route width-chain cases, green in CI; 18 mutations run across the batch, each mapped to a distinct catcher; the transition sweep runs both themes x five widths (320/375/430/640/1280) x three states with per-channel duration AND delay; pusher absence runs at three widths with a pixel-level paint test; chain coverage is anchored on the canonical `SectionId` list rather than on the rendered DOM.

## BL-HEADER-FONT-FALLBACK-WRAP — nothing loads Inter, so a bare-Linux client gets a much wider fallback

**Filed:** 2026-07-26 (branch `feat/section-header-rebuild-phantom-spacers`, surfaced by real CI). **Class:** typography robustness. **Effort:** S (load the font) or M (make the affected rows font-independent).

`app/globals.css` sets `--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`, and **nothing loads Inter** — there is no `@font-face` rule and no `next/font` import anywhere. Every named entry after it is a system face, so a client with none of them (Chrome on a bare Linux install, which is what a GitHub Actions runner is) falls through to generic `sans-serif` and gets DejaVu Sans. DejaVu is substantially wider than SF Pro.

Measured consequence: the event-detail group title "Wardrobe & key moments" fills the 240px narrowest real row unaided under DejaVu, so it wraps to two lines (33.59px vs 16.8px) where SF Pro leaves 22.94px of room for the decorative rule beside it. The `min-w-4` floor that is free on every targeted device is not free there.

**This is narrow, not theoretical.** Every device the product actually targets resolves an earlier entry in the stack — iOS/macOS `-apple-system`, Android `ui-sans-serif`, Windows `Segoe UI` — so no crew member or admin sees the DejaVu rendering. It is reachable only on a desktop Linux browser lacking all six named faces.

**Work, either of:** (a) self-host the intended face and add an `@font-face` (or a `next/font` import), which makes every measurement in this repo font-deterministic and retires a whole class of local-vs-CI divergence; or (b) leave the stack alone and make the affected rows font-independent — `whitespace-nowrap` plus truncation on the closed-set group titles, so a wide fallback shortens the label instead of adding a line.

**Do not "fix" this by widening the tolerance in `tests/e2e/section-header-layout.layout.spec.ts`.** That test pins its own font to the Arial / Liberation Sans metric-compatible pair for exactly one measurement, deliberately and with the reason in a comment, so the floor assertion reads the same on macOS, Windows and the Ubuntu runner. Relaxing it instead would hide this entry's finding.

## BL-CHILDLESS-GROWABLE-STATIC-GUARD — static guard against childless growable flex items

**Filed:** 2026-07-25 (branch `feat/section-header-rebuild-phantom-spacers`, DESCOPED from that branch's spec §6 after three adversarial rounds). **Class:** layout hardening (structural defense). **Effort:** M — the cost is the rule, not the walker.

The five sites `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW` repaid are covered by two executable oracles (`tests/e2e/pusher-alignment.layout.spec.ts`, `tests/e2e/section-header-layout.layout.spec.ts`) and by the phantom-gap probe mounts. Neither sees a SIXTH site written tomorrow: the probe only reaches surfaces it is mounted on, and both layout specs name their rows explicitly. A source-scanning guard would fail-by-default on a new one.

**Why it is not written yet, and what a future attempt must clear.** Three rounds could not converge a rule that agreed with its own prototype. The written rule selected 27 registry rows; the prototype walker selected 17. The disagreements were all real ambiguity in "childless" and "growable", not implementation bugs:

- `flex-1` on an element whose only child is a conditional that renders `null` in some states is childless SOMETIMES — a static scan cannot evaluate the condition, and both "always flag" and "never flag" produce false results on live code.
- A growable element that PAINTS (the `h-px bg-border` hairline) is not the defect; the defect is a growable element that paints nothing. Distinguishing them statically means reasoning about which utility classes produce a painted box, which is an open-ended list.
- The `style={{ flex: … }}` prop form has no className to match, so a className-only rule is fail-open on it — and that is exactly the escape hatch a class-sweep guard exists to close.

Per `docs/agents/spec-self-review.md`'s 3-round cap, the guard was descoped rather than shipped at 63% agreement with itself.

**Work, if revived:** start from the PROTOTYPE, not the prose — write the walker first, run it over `components/` + `app/`, and let the actual output define the rule (the reverse of the order that failed). Expect the deliverable to be an ALLOWLIST of accepted shapes rather than a leak hunt, per the same lesson `feedback_static_guard_allowlist_shapes_not_leak_hunting` records from PR #592. A guard that flags a painted hairline is worse than no guard, because the exemption comment it forces teaches the next author that the shape is fine.

## Descoped from the CI-dark coverage cluster (2026-07-26) — read before re-attempting any of these

Four items below were **designed, built, and measured**, then descoped after four cross-model
review rounds (37 accepted findings, none disputed) on branch `feat/ci-dark-coverage`. The owner
chose to ship the provably-sound subset rather than keep iterating.

**Do not re-derive this analysis.** Each entry records what was tried and the measurement that
killed it. The reason each is open is that the obvious approach was implemented and shown not to
work, not that nobody thought about it. Full write-up with metafile traces and per-entry bundle
sizes: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §10.

### BL-HARNESS-RESOLVER-POLICY — a sound server-only resolver for browser harnesses

**Status:** OPEN · **Severity:** medium · **Class:** TEST-HARNESS SOUNDNESS

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

**Status:** OPEN · **Severity:** low (the spec was already dark; nothing that ran was lost)

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

### BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC — detect a self-contained spec nobody registered

**Status:** OPEN · **Severity:** medium · **Class:** GUARD COMPLETENESS

`standalone.config.ts`'s `testMatch` is an explicit allow-list, so a new harness spec that nobody
adds runs nowhere. The shipped guard proves every _listed_ branch resolves to a file (total, and it
caught the stale `overrideableField.layout`), but cannot see a spec that was never listed.

Two detector definitions were tried and both fail: "calls the toolchain helper" is neither
necessary nor sufficient, and "imports `node:http`/`node:https`" misses harnesses that boot no
server — `tests/e2e/phantomGapHelper.layout.spec.ts` drives `page.setContent`, and `data:`
navigation and route-fulfillment harnesses evade it identically. **Trigger:** a new standalone spec
discovered dark, which is the event this would have prevented.

### BL-CI-VITEST-EXCLUSION-COVERAGE — prove an `ENV_BOUND_EXCLUDES` entry runs somewhere

**Status:** OPEN · **Severity:** medium · **Class:** GUARD SOUNDNESS

`ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48`) removes files from the serial project when
`VITEST_EXCLUDE_ENV_BOUND=1`, which only `unit-suite.yml` sets. Nothing watches whether an excluded
file runs anywhere else — the mechanism that kept `pg-cron-coverage.test.ts` dark in CI for months
while passing locally.

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

### BL-CI-ENV-DEPENDENT-CONFIG-NARROWING — a Playwright config could narrow on a variable only GitHub sets

**Status:** OPEN · **Severity:** LOW (guard completeness, not a live defect) · **Class:** CI coverage integrity · **Filed:** 2026-07-26 (PR2 of the CI-dark cluster, adversarial R4)

**Do not re-derive this analysis.** Four adversarial rounds converged here; the measurements are below.

`tests/ci/_standaloneConfigProbe.ts` proves that under the environment it can construct, `tests/e2e/standalone.config.ts` resolves to exactly the 30 spec files whose allowlist rows PR #609 deleted. Membership comes from Playwright's own `--list`, so `projects[].testMatch`, `testIgnore`, `testDir`, `projects: []`, and `grep`/`grepInvert` are all resolved by Playwright rather than modelled, and a companion assertion requires that resolved set to equal what the top-level `testMatch` declares (verified by mutation: a project-level `testMatch` reds it).

**The gap:** a config branching on a variable only the runner sets. The probe pins `CI` and `GITHUB_ACTIONS` and asserts the matcher is identical with and without them, but a branch on `GITHUB_EVENT_NAME`, on another runner default, or on workflow/job/step `env` is invisible to any LOCAL probe **by construction** — the CI environment is not reproducible on a developer machine. Two concrete mutations that pass today's parity check while narrowing under Actions: `process.env.GITHUB_EVENT_NAME === "pull_request"` and `process.env.NODE_ENV === "test"`.

**Why it is not patched:** enumerating variables is the mechanism that failed in rounds 1–3 (regex reader → AST reader → semantics modelling), each replaced rather than extended. A fourth enumeration would be the same shape.

**Mitigation already in place (procedural, and it holds):** the job is unfiltered and runs the WHOLE config on every PR, so a config that narrowed under Actions would show a reduced test count in the run log — 404 tests across 30 files is the current baseline.

**If picked up:** the sound fix is to compare the CI run's own reported test count against a committed baseline, i.e. verify in the environment rather than predict it locally.

### BL-CI-STALE-BRANCH-PROTECTION-COMMENT — one-line docs fix — ✅ RESOLVED (2026-07-26, PR2 of the CI-dark cluster)

**Resolved.** The comment is corrected in `tests/ci/_metaE2eWorkflowCoverage.test.ts`, and the same stale claim was swept from this file's `BL-E2E-LIFECYCLE-SPECS-CI-DARK` entry — it appeared in two places, not one. Kept here rather than graduated to the archive because it is a sub-entry of a still-open parent section, not a standalone item. Original text below for provenance.

`tests/ci/_metaE2eWorkflowCoverage.test.ts:11` states branch protection "deliberately requires ONLY
the `quality` context". Measured live 2026-07-26: `main` requires **twelve** contexts (`quality`,
`unit-suite`, `x1`–`x6`, `validation-schema-parity`, `affordance-matrix-parity`,
`postgrest-dml-lockdown`, `traceability-audit`), and `scripts/generate-traceability.ts` resolves a
third, different list of eight. Any reasoning that treats the repo's e2e jobs as "the only required
check is quality" is wrong — notably, edits to `unit-suite` DO touch a merge-blocking context.

## BL-CI-PARALLEL-DB-FALLBACK-AUDIT — re-run the closed-port protocol across the parallel project

**Status:** OPEN, raised by adversarial review of PR #517 (finding 2).

The `unit-suite-nodb` job proves that no parallel-project file FAILS without a database. That is weaker than "touches no database": a test that swallows a connection error, skips on unavailability, returns early from a setup hook, or takes an untaken conditional DB path will pass while exercising a FALLBACK rather than the DB-backed behavior it was written to check. The no-DB job repeats that same observation every PR, so it shares the blind spot — it is a regression detector, not a proof.

The stronger protocol already exists and was used for the original 2026-06-23 partition: point every Supabase endpoint at a CLOSED PORT rather than simply omitting the database. A refused connection surfaces swallowed-error paths that an absent server does not.

**Work:** re-run that closed-port protocol across all ~691 current parallel-project files, and compare per-file assertion COUNTS against a run with the database present. A file whose assertion count drops is silently degrading. Any found either move to serial or get an explicit note saying the fallback path is what is under test.

## BL-CI-RECLASSIFY-PARALLEL-STABILITY — revive the serial→parallel reclassification only with a concurrency-stability + clean-wall proof

**Filed:** 2026-07-20 (arc SHELVED). **Class:** CI perf. **Effort:** L (structural stability + multi-run measurement).

The DB-free serial→parallel reclassification (PR #528, closed unmerged) is correctness-verified but was shelved: moving ~527 files into the parallel project raises per-shard concurrency, and timing-sensitive moved files (e.g. `tests/admin/_metaInfraContract.test.ts`) starve past the 5s test timeout under CI load — candidate CI run 1 green, run 2 red on identical code. A required gate cannot flake, and the class is load-dependent (not fully enumerable up front). The wall-clock win was also unproven (~17s in contention-noisy samples, under the spec's 30s gate). Seventh lever this program has rejected on the local-passes-CI-fails pattern.

**Reusable asset:** the DB-touch probe + static `DB_BINDING_SIGNALS` matcher (branches `spike/db-touch-instrumentation`, `perf/ci-reclassify-db-free-serial`). Retrospective: `docs/superpowers/specs/ci/2026-07-20-serial-parallel-reclassification-retrospective.md`.

**Do NOT re-attempt the move without, in this order:** (1) solve criterion-3 at CI scale structurally — cap the parallel project's per-leg worker concurrency (`poolOptions.maxWorkers`) or raise the parallel `testTimeout` — and prove stability across ≥5 consecutive green CI runs; (2) demonstrate a clean ≥30s wall win with sequential, non-contending measurements (one CI run at a time). Absent both, the correctness tooling can stand alone (e.g. a nightly DB-drift audit) without the move.

**Status:** open (shelved).

---

## BL-POPOVER-SHARED-RAF-COALESCER — one coalescer helper for both popover consumers

**Filed:** 2026-07-25 (impeccable audit P2) · **Class:** code duplication / drift risk · **Effort:** S

`HoverHelp` and `ShareHub` each implement their own rAF coalescer. They now have IDENTICAL leading-edge throttle semantics, but only because a P1 in the same audit caught them diverging: ShareHub's was a debounce, which silently defeated pan-tracking once a high-frequency `visualViewport` source was attached. The bounds policy was extracted to `lib/popover/place.ts`; the coalescer was not.

**Work:** extract a shared helper and delete both local copies. `shareHubVisualViewport.test.tsx` T-S8 pins throttle-vs-debounce and should move with it.

**Status:** open.

## BL-MODAL-REALTIME-UPDATED-CUE — freshness cue near the published modal's action clusters

**Filed:** 2026-07-24 (retroactive — deferred in PR #505's body 2026-07-20, never filed) · **Class:** UI refinement · **Effort:** S

Impeccable P3 from `admin-modal-realtime-refresh`: an optional "updated just now" cue near the modal's action clusters, so a realtime-driven change is attributable rather than appearing as content silently shifting under the cursor. Deferred as a future refinement — the spec ratifies the silent-by-design posture, so nothing requires it.

**Un-defer signal (weak, hence backlog not DEFERRED.md):** a user reporting that modal content changed without explanation. Note the tension with the ratified posture — adding a cue is a spec decision, not a polish pass.

**Status:** open.

## BL-REALTIME-BROADCAST-FRAME-DROP-WATCH — ~9% local broadcast-frame loss on a healthy socket

**Filed:** 2026-07-24 (retroactive — recorded in PR #505's residuals 2026-07-20, never filed) · **Class:** observability watch item · **Effort:** S (read CI history) to M (if real)

PR #505 measured local realtime silently dropping ~9% of broadcast frames on an otherwise healthy socket; absorbed by CI runner retries and explicitly NOT a code defect of that diff. Filed as a watch item so the observation is not lost: if the drop rate is an artifact of the local stack it should disappear against validation/prod, and if it does not, subscriber code that assumes every broadcast arrives needs a reconcile-on-focus fallback.

**Work:** sample the realtime-dependent e2e/CI history for retry frequency before deciding whether there is anything to fix.

**Status:** open (watch).

## BL-MUTATION-LEDGER-AUTOCORRECT-DRIFT — refresh known-holes fingerprints after parser autocorrect field (2026-07-22)

The `autocorrect` field populated at all 13 parser producers (`7295d794c`, merged via the
warning-card-identity-placement chain, PR #543-era) changes parse output for corpus fixtures whose
mutated cells produce autocorrect-bearing warnings, so the redacted parse-output fingerprints in
`tests/parser/mutation/knownHoles.ts` drift. Nightly run 29907734946 (2026-07-22): DRIFTED
fingerprint rows across 7 shards — SAME siteIds, fingerprint-only, zero NEW siteIds, zero fixed
holes — the benign class per the 2026-07-09 triage discipline (see BL-MUTATION-LEDGER-ROLETOKEN-DRIFT
and BL-MUTATION-LEDGER-REFRESH-AMBIGUITY in `BACKLOG-archive.md` for the identical prior instances and
their resolution mechanics). The nightly `mutation-harness`
workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it gates no PR.
**Refresh:** `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run
--project mutation`, then surgical re-bless via `reconcileLedger` (drift bucket only). Trigger: the
next mutation-file-touching PR or the next post-merge nightly triage.

---

## BL-WATCH-RECONCILE-BACKOFF — backoff state for watch channels (BLOCKED on four shipped defects)

**Status:** OPEN, **blocked** · **Severity:** low · **Surfaced:** watch-channel-health brainstorming (2026-07-01) · **Re-scoped:** 2026-07-25 after five cross-model adversarial rounds

Approach B from `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md` §2/D1: a `drive_watch_reconcile_state` table (attempts, `next_attempt_at`, last error class) plus exponential backoff and a faster reconcile cadence.

**The lease half already shipped separately** as `docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md` — that was the measured defect (every channel taking Google's 1-hour default and being renewed at the instant it expired, ~1 second of slack). It is not part of this entry any more.

**Why this half is blocked.** Five adversarial rounds (~55 findings, every checkable claim verified against the live tree) established that backoff cannot be built correctly on the current watch subsystem. The full design work, including round-by-round disposition tables of what was tried and why each attempt failed, is retained at `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (status DEFERRED). Start there rather than re-deriving.

The decisive blocker is `BL-WATCH-EXPIRED-ACTIVE-ROW`: refresh, not reconcile, is the dominant retry path, and it is ungated. A ladder attached to reconcile therefore cannot deliver backoff at all. Fix all four entries below first — including `BL-WATCH-DRIVE-CALL-TIMEOUT`, which is a prerequisite for any timing claim a backoff ladder would make. (This read "the three" while enumerating four; whole-diff R10.)

## BL-PG-CRON-COVERAGE-UNRUN — the live pg-cron introspection suite runs in no CI workflow

**Status:** OPEN · **Severity:** medium · **Surfaced:** 2026-07-25, whole-diff review round 17

`tests/cross-cutting/pg-cron-coverage.test.ts` is the only test that introspects the live `cron.job` table — job set, schedules, `active` flags, the pg_net extension, the vault secret. It is excluded from `unit-suite` via `ENV_BOUND_EXCLUDES` (`vitest.projects.ts`), and the comment there says it "runs against the validation project (like validation-schema-parity)". **Nothing runs it.** `pnpm test:audit:x6-pg-cron-pivot` runs four different files, and no other workflow references it; `grep -rl pg-cron-coverage .github/workflows/` returns only the `unit-suite.yml` comment that explains the exclusion.

So every assertion in it is dead in CI, including the `active=true` gate that exists specifically because a disabled job would otherwise satisfy the name/schedule/command checks.

**Fix:** give it a job in `x-audits.yml` with `PG_CRON_COVERAGE_TARGET=validation` and `TEST_DATABASE_URL` pointing at the validation project, alongside `validation-schema-parity` which already has that shape. Then correct the stale comment in `unit-suite.yml`.

**Wiring it up is necessary but not sufficient** (whole-diff R18). Every assertion this suite makes about `cron.job.command` is text matching: PostgreSQL resolves the OUTER `cron.schedule` call but stores the command body verbatim, comments included. A job whose `net.http_get(...)` is commented out, followed by an executable `select 1;`, satisfies the route check, the `net.http_get(` check and the exactly-one-timeout check while issuing no request — and `active=true` does not help, because the job runs, it just does nothing. Proving a job actually fires needs a smoke test per job; only the sync path has one today. Track that with this entry rather than by adding more text assertions.

## BL-CRON-REGISTRY-MIGRATION-PARITY — no CI-running check ties a new migration to the cron registry

**Status:** OPEN · **Severity:** medium · **Surfaced:** 2026-07-25, whole-diff review round 17

`pg-cron-jobs.json` is the canonical machine-readable cron contract, and constants are pinned against it. Nothing that runs in CI checks that the MIGRATIONS agree with it:

- `pg-cron-coverage.test.ts` has a static migration check, but it reads two hard-coded historical paths and asserts `scheduledSql.toContain(job.schedule)` over their concatenated text — `fxav_cron_notify_digest` and `fxav_cron_refresh_watch` share `0 * * * *`, so one can change while the assertion still finds the string. It also does not run at all (`BL-PG-CRON-COVERAGE-UNRUN`).
- Its live check reads the DEPLOYED validation row, so a migration sitting unapplied on a branch is invisible until after deploy.

A hand-rolled SQL scanner was tried for exactly this and abandoned after nine review rounds of lexical corners (comments, dollar quoting, identifier case and quoting, name resolution, `search_path`, stored function bodies) — see the header of `tests/cron/samplingPeriodParity.test.ts`. **Do not reinstate regex-based SQL parsing.**

**Fix direction:** apply migrations to a throwaway Postgres in CI and read `cron.job` from it, so PostgreSQL does the parsing on the BRANCH's SQL. The `supabase-local-bootstrap` path already boots a local instance; the pg_cron migrations are GUC-guarded and held aside there, so this needs a variant that enables them.

## BL-WATCH-DRIVE-CALL-TIMEOUT — `files.watch` has no timeout, so one stalled call can hold the renewal loop

**Status:** OPEN · **Severity:** low-medium · **Surfaced:** 2026-07-25, whole-diff review round 6

`getDriveClient()` sets no global timeout and `files.watch` is called with no per-call options, so a stalled Drive request blocks the sequential renewal loop in `refreshWatchSubscriptions` for as long as the platform allows. The master spec claimed "time-boxed (default 15s)" for years; nothing implemented it, and that wording is now corrected rather than left as a false promise.

This is why `2026-07-25-watch-lease-slack-design.md` claims **no** renewal-timing guarantee: every such claim would be parameterised by an execution budget nothing enforces. Adding a real per-call timeout (and a per-row deadline in the loop) is the prerequisite for making any timing guarantee defensible — including the deferred backoff work.

## BL-WATCH-EXPIRED-ACTIVE-ROW — a failed renewal leaves the old channel active forever, retried on every tick

**Status:** OPEN · **Severity:** medium (unbounded futile Drive calls; blocks `BL-WATCH-RECONCILE-BACKOFF`) · **Surfaced:** 2026-07-25, adversarial round 5

When a renewal fails, `markWatchOrphanedWithTx` marks only the **newly inserted pending** channel orphaned. The old channel keeps `status='active'` past its `expires_at`, and the renewal query (`listRenewalDue`, which selects `status='active'` rows whose remaining life is inside the renewal lead) keeps returning it **forever**; GC only collects `superseded`/`orphaned`, so nothing ever cleans it up. Line numbers are deliberately omitted: this entry outlives any particular revision, and the method was renamed from `listExpiringActive` by the lease-slack PR.

Result: refresh re-attempts that folder on every cron tick indefinitely — currently 24 futile `files.watch` calls/day per stuck folder, and 96/day at any 15-minute cadence. **Repro:** force a renewal failure, then observe `drive_watch_channels` retaining an `active` row with `expires_at` in the past while `DRIVE_WATCH_RENEWAL_FAILED` repeats hourly. **Fix direction:** on renewal failure, transition the old row out of `active` (orphaned or a new `expired` state) so it leaves the renewal query and enters GC — being careful that the partial unique index `drive_watch_channels_one_active_per_folder_idx` and the supersession-in-activation path still hold.

## BL-WATCH-ALERT-RAISE-NOT-ATOMIC — the alert raise is not in the transaction it appears to be in

**Status:** OPEN · **Severity:** low-medium (a window where channel state and alert state disagree; blocks alert-derived health inference) · **Surfaced:** 2026-07-25, adversarial round 4

`PostgresWatchTx.upsertAdminAlert` looks like a transaction-port method but calls the standalone service-role helper (`lib/drive/watch.ts:189-194`), which constructs its own Supabase client and issues an RPC over a **different connection** (`lib/adminAlerts/upsertAdminAlert.ts:47-52`) — outside the surrounding `sql.begin` (`lib/drive/watch.ts:315-318`). The alert can commit while the channel mutation rolls back, or vice versa.

Nothing shipped depends on that atomicity today, which is why this is not urgent — but any design that infers "is the watch healthy" from alert state versus channel state has a window, which is what round 4 discovered. **Fix direction:** route the alert upsert through the same `sql` transaction (the RPC can be called via the pg connection), or document the non-atomicity at the call site so future designs do not assume it.

## BL-WATCH-ALERT-FOLDER-SCOPE — the global watch alert cannot describe which folder failed

**Status:** OPEN · **Severity:** low · **Surfaced:** 2026-07-25, adversarial rounds 3-4

`WATCH_CHANNEL_ORPHANED` is global — one unresolved row for the whole system (`show_id IS NULL`, `admin_alerts_one_unresolved_idx`, `supabase/migrations/20260501001000_internal_and_admin.sql:279-280`) — and carries no folder identity. Meanwhile `refreshWatchSubscriptions` renews **every** active channel without consulting `app_settings` (`lib/drive/watch.ts:196-210`), and folder promotion supersedes nothing (`app/api/admin/onboarding/finalize-cas/route.ts:779-804`). So after a folder switch, an old folder's renewal failure raises an alert that describes the _current_ folder, and escalation reports the current folder's name for a failure that happened elsewhere.

**Fix direction:** either scope the alert per folder (context key plus dedup change) or have refresh skip channels whose folder is not the configured one, letting old-folder channels expire naturally.

## BL-SERVER-ACTION-ORIGIN-GATE — same-origin gate for the crew guest Server Action

**Status:** OPEN · **Severity:** low (logout CSRF; no read, no escalation) · **Surfaced:** `fix/picker-flow-app-bugs` review rounds 1-3 (2026-07-25), descoped rather than guessed at

`clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts`) is an exported Server Action that ends the Supabase session on the calling browser and deletes one picker entry from the `__Host-fxav_picker` envelope. It relies on Next's built-in Server Action origin validation, which rejects a mismatched `Origin` but **permits a request that carries no `Origin` header at all**. So a cross-site POST arriving without that header is not refused by anything the app adds.

**The residual, sized.** An attacker who forces the call signs the victim's browser out of this app on that device and removes one supplied show id from their picker envelope. There is no response data returned to the caller, no privilege gained, and no cross-account effect — with `scope: "local"` it does not even touch the victim's other devices. It is logout CSRF, in an app whose sign-out is a visible button. That is why it was filed rather than treated as blocking.

**Why it is not already fixed.** A hand-rolled gate was specified twice and failed review both times. The route-handler precedent (`app/auth/sign-out/route.ts:78-87`) reads `request.nextUrl.origin`, which a Server Action has no equivalent of, so the action must compose the expected origin from headers — `x-forwarded-proto`, `x-forwarded-host`, `host`. That is only sound behind a **trusted proxy** whose overwrite behavior this repo has never established; where a proxy forwards client-supplied values, a spoofed `Origin` plus `x-forwarded-host` pair passes the check. Three consecutive review rounds on one design-correctness vector triggered the prose cap in `docs/agents/spec-self-review.md`: descope, do not patch a fourth time.

**Open decision, and the trigger:** establish the trusted-proxy policy (which headers are authoritative in each deployment, and whether the platform overwrites them), then gate every destructive Server Action on it — not just this one. Pick this up on the next auth security pass, or sooner if a Server Action lands whose forced invocation would do more than log someone out. Reasoning in `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` §4.3a.

---

## BL-PICKER-CLAIMED-ROW-PENDING-STATE — no pending affordance on the claimed-row sign-in control

**Status:** OPEN · **Severity:** low-medium (re-tap risk on venue wifi) · **Surfaced:** impeccable critique of `fix/picker-flow-app-bugs` (2026-07-25), P2

Tapping a claimed roster row (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`) is a full GET to `/auth/sign-in` and then on to Google — three or more hops with the row visually inert the whole time. On ballroom wifi a crew member will tap it again. Every other mutating control in the admin surfaces uses `useFormStatus` for this (10+ components), and master spec §16.6 ratifies the "Confirming…" pending idiom.

Not a regression: the control had no pending state before the hidden-input fix either. Deferred rather than folded into that branch because the row is currently rendered by a Server Component, so a pending state needs a new client boundary — a real change to the picker's component topology, not a class tweak. **Fix (when prioritized):** extract the claimed-row control into a client component using `useFormStatus`, matching the disabled + label-swap recipe the admin surfaces already use. Trigger: next crew-page UX pass, or a report of double-tap sign-in loops.

## BL-PICKER-ROW-RING-OFFSET-BACKDROP — claimed/active roster rows use a bare ring-offset-2

**Status:** OPEN · **Severity:** low (dark-mode focus-ring seam) · **Surfaced:** impeccable critique + audit of `fix/picker-flow-app-bugs` (2026-07-25), both flagged it as pre-existing and out of that diff's scope

`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:138` sets `focus-visible:ring-offset-2` with no `ring-offset-<backdrop>` companion, so the offset resolves to Tailwind's default `--tw-ring-offset-color: #fff` (measured in a real browser during the audit). `DESIGN.md` §1.1 names exactly that as a dark-mode defect: a white gap between the control and its ring on a dark surface. Introduced in commit `4536d6b5a`, well before this branch.

**Fix (when prioritized):** add the matching `ring-offset-<token>` for the row's backdrop, and sweep the other crew-surface focus rings for the same bare-offset shape — `2026-07-23-sharehub-focus-pass` §2 established the two-tier recipe and the no-bare-offset rule, so this is a straggler from before that pass rather than a new decision. Trigger: next focus-ring or dark-mode pass.

---

## BL-SOUND-REDIRECT-GUARD — the self-redirect guard is a known-spellings tripwire, not a sound analysis

**Status:** OPEN · **Severity:** low (the tree is clean; this is about future-proofing) · **Surfaced:** `fix/picker-flow-app-bugs` review rounds 1-5 (2026-07-25)

`tests/cross-cutting/no-absolute-self-redirect-audit.ts` bans `NextResponse.redirect` (and the Web API `Response.redirect`) under `app/`, because an absolute `Location` built from `request.url` carries whatever host Next reports rather than the one the client typed, which drops host-scoped cookies. It now recognises 19 spellings — inline, variable-assigned, alias chains, captured bases, nested-block declarations, parenthesised and type-asserted arguments, `request.nextUrl` and `.clone()`, aliased and namespace imports, element access, parenthesised receivers, destructured methods, const-aliased receivers, and extracted methods — each added after a review probe defeated the previous version.

**The residual.** A value that reaches the call through a helper's return, a class field, a re-export, or dynamic dispatch is not resolved. Five review rounds on this one guard is the evidence for why it stops here: any expression can produce a function, so no syntactic matcher is complete, and the AGENTS.md three-round cap says to bound the claim rather than keep patching. The module header lists what is covered and what is not, so a green run means "no known spelling is present", not "the class is impossible".

**Fix (when prioritized):** make it type-aware — resolve the callee through the TypeScript type checker rather than syntactically, which would cover every alias and indirection in one construction, or move the ban to an ESLint rule with `no-restricted-properties` plus a type-aware companion. Either is a real piece of work, not a patch. **Trigger:** a host-flip regression that the current guard misses, or the next time someone extends the guard for a new spelling — at that point the type-aware version is cheaper than another round.

## BL-E2E-COVERAGE-SCANNER-EXCLUSION-FILTERS — audit other workflows now that paths-ignore counts as a filter

**Status:** OPEN · **Severity:** low · **Surfaced:** `fix/picker-flow-app-bugs` review round 5 (2026-07-25)

`tests/ci/_workflowCoverageScan.ts` classified a workflow as PR-blocking-capable unless it had a `pull_request.paths` filter, and matched only that spelling — so any workflow using `paths-ignore` was treated as running on every PR when it does not. This branch fixed the matcher (`paths(-ignore)?`) and added a self-test, and re-categorised the two crew-e2e specs as `PATH_GATED_BY_EXCLUSION`.

**What remains:** no other workflow in `.github/workflows/` used `paths-ignore` at the time of the fix, so nothing else changed category. Re-run the audit if one adopts it, and check whether any spec's allowlist row (or absence of one) became inaccurate. **Trigger:** the next workflow that adds a `paths-ignore` filter.

---

## BL-SYNC-JOB-FOUR-NAMES — the sync job answers to four different names in Doug-facing copy

**Status:** OPEN · **Severity:** low (copy consistency; admin-facing) · **Surfaced:** #601 impeccable critique (2026-07-25), P3

One job, one audience, four words. `lib/cron/runSummary.ts:34` calls it **"Sheet sync"**; `components/admin/StagedReviewCard.tsx:90` labels its rows **"Auto sync"**; `lib/messages/catalog.ts:366` says **"the scheduled sync"** while `catalog.ts:693` says **"an automatic sync"** — the same catalog, two names, for the same thing.

The 2026-07-03 and 2026-07-25 sweeps (`BL-COPY-CRON-SWEEP`, `-2`) both removed jargon without unifying the noun underneath, and the second one's own consistency check cleared the _scopes_ ("Scheduled jobs" = the set of 9, "the scheduled sync" = one of them, "Auto sync" = a per-row source badge) while missing that the referent itself is named four ways. Not a bug and not urgent; it is the residue those sweeps left.

**Fix (when prioritized):** pick one name for the sync job, then apply the §12.4 three-way lockstep for the two catalog rows (spec prose + `pnpm gen:spec-codes` + `catalog.ts`) and plain edits for the other two sites. **Trigger:** the next admin-copy pass, or any new surface that has to name this job.

---

## BL-TELEMETRY-FALLBACK-RETRY — the scheduled-job health fallback states the cause but offers no retry

**Status:** OPEN · **Severity:** low (developer-tier surface) · **Surfaced:** #601 impeccable critique (2026-07-25), P1 partially addressed

`app/admin/dev/telemetry/page.tsx:84` now reads "Couldn't load scheduled-job health right now. The jobs are probably still running." — the second sentence landed in the #601 follow-up because the critique was right that the old one-liner named neither a cause nor a recourse at the moment Doug's stress is highest. What it still lacks is the recourse half: there is no retry control, so the only way to re-read is a full page reload.

**Fix (when prioritized):** a retry affordance on the fallback, consistent with `AutoRefreshControl`'s manual-refresh icon-button already on this page (spec §7.1) rather than a new idiom. **Trigger:** the next telemetry pass, or a report of the readout failing in practice.

---

## BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE — a venue field-alias generator case fails on some seeds

**Status:** OPEN · **Severity:** low · **Surfaced:** full-suite run during `fix/picker-flow-app-bugs` close-out (2026-07-25)

`tests/parser/blocks/venue.test.ts` → `parseVenue — field-label typo recovery (FIELD_LABEL_AUTOCORRECTED)` → `generator: single-edit typos of venue field aliases (≥5 chars) recover` failed inside a whole-suite run, then passed 3/3 whole-file runs (56/56 each) and passed when isolated with `-t`. The generator constructs single-edit typos, so the input set varies per run: some edit lands on a string the recovery does not accept, and the case only fails when that edit is generated.

**Not caused by the branch that found it:** `fix/picker-flow-app-bugs` touches no file under `tests/parser/` or `lib/parser/`, and the test is a pure unit test with no DB coupling.

**What remains:** make the case deterministic or make the recovery cover the edit. Either seed the generator and pin the seed, so a failure is reproducible and a fix is provable, or enumerate the edit classes explicitly instead of sampling. Then decide whether the failing edit is a genuine gap in `FIELD_LABEL_AUTOCORRECTED` recovery — a seed that fails is evidence about the parser, not only about the test. **Reproduce with:** repeated whole-file runs (`pnpm exec vitest run tests/parser/blocks/venue.test.ts`) until it trips; a single run is likely to pass.

**Caveat on the sighting:** the run that caught it was on a box at load 34+ with a sibling session's vitest running, where many unrelated files failed on 5s timeouts. This case is listed separately from that noise because it failed with a substantive assertion rather than a timeout, and because it also failed in a scoped 3-file run.

---

## BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT — `cleanupStaleEntry` revalidates a path the picker is rarely on

**Status:** OPEN · **Severity:** low · **Surfaced:** class-sweep of the `?gate=skip` revalidate defect (2026-07-25)

`lib/auth/picker/cleanupStaleEntry.ts:107` calls `revalidatePath('/show/<slug>/<shareToken>')`. `revalidatePath` takes a path and ignores the query string, and the picker is commonly reached at `?gate=skip`, so that variant's entry is not invalidated. This is the same defect fixed in `_PickerInterstitial`'s select-identity form action, where a roster tap set the cookie and then re-served the picker, leaving the person exactly where they were until a reload.

**Why it is low here, not the same severity.** The intended screen after a stale-entry cleanup IS the picker, so the user is already looking at the right thing — unlike the select case, where the intended screen was the resolved show. `_StaleCleanupAutoSubmit`'s effect has an empty dependency array, so a stale render cannot re-submit in a loop. The worst observable outcome is a cleared stale-entry hint lingering until the next navigation.

**Why it was not fixed alongside the select case:** the fix there is verified by a prod-build e2e (`CI=1` picker-flow, the guest case). The stale path has no equivalent, and shipping an unverified change to a second Server Action to claim a complete sweep would be worse than recording the instance. The comment in `_StaleCleanupAutoSubmit.tsx` now states the caveat rather than the old claim that the user "sees the fresh picker on next render."

**What remains:** decide whether the cleanup action should redirect to the canonical URL like the select action now does, and write a prod-build e2e for one of `epoch_stale | removed_from_roster | identity_invalidated` first so the change is provable. **Trigger:** the next change to the stale-cleanup path, or any report of a stale hint persisting.

---

## BL-DEV-GATE-GALLERY-SPEC-ROT — `attention-modal-gallery.spec.ts` runs nowhere but a dispatch-only gate, and has rotted

**Status:** OPEN · **Severity:** medium · **Surfaced:** `fix/picker-flow-app-bugs` Task 13 close-out (2026-07-25)

`tests/e2e/attention-modal-gallery.spec.ts` runs only under the `dev-build` Playwright project (`playwright.config.ts:92`), and `dev-build` runs only in `dev-gate-e2e.yml`, which is `workflow_dispatch`-only. No PR ever triggers it. Its last green run was **2026-07-02**; the only other run since was a failure on 2026-06-22. Dispatching it during this branch's close-out failed two assertions:

- `:398` — `controls.getByText(String(GLOBAL.length), { exact: false })` raises a strict-mode violation, resolving to 2 elements. The substring match means any element in the controls bar containing that digit qualifies.
- `:265` — `await expect(attentionMenu).toHaveCount(0)` after `Escape` times out; the menu does not close the way the spec expects.

**Not caused by the branch that found it.** `fix/picker-flow-app-bugs` touches no file under `components/` or `app/admin/`, and its only `playwright.config.ts` edits are to the `mobile-safari` and `desktop-chromium` matchers — `dev-build` is untouched. Two commits that landed on `main` _after_ the gate's last green run change exactly what these assertions read: `432d8ef06 feat(admin-dev): exclude global-scope tier-1 scenarios from the gallery switcher` (the global-scope set the `:398` count is derived from) and `f4c4bf493 feat(admin): merge the attention panel's three groups into two` (the menu at `:265`). 793 commits touched `components/admin/` in that window.

This is the dark-spec class already recorded for this repo (`feedback_dark_spec_in_unrun_project_rots`, #486): a spec nothing runs stops describing the product, and the cost lands on whoever next dispatches the gate.

**What remains:** two decisions, in order. (1) Repair both assertions against the current UI — the count needs an exact/scoped match rather than a substring, and the menu-close assertion needs to match the post-merge panel behavior. (2) Decide whether the gallery spec belongs in a gate no PR runs at all. If its value is the built `ADMIN_DEV_PANEL_ENABLED=true` artifact, that is a reason for a dedicated project, not a reason to be unreachable; if it can run on the `:3000` baseline, move it somewhere PR CI executes. **Trigger:** the next `dev-gate-e2e.yml` dispatch, which will fail on this until it is fixed.

---

## BL-KNOWN-SECTIONS-WALKER — real auto-drift enforcement for the known-section-header registry

**Status:** OPEN · **Severity:** low (defense-in-depth; today's guard is a hand-maintained pin) · **Class:** TEST-ENFORCEMENT GAP

`tests/parser/_metaKnownSectionsRegistry.test.ts` is documented as a drift guard that keeps `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts`) from falling behind the block parsers, but it only asserts a **hardcoded** `REQUIRED_HEADERS` list ⊆ `KNOWN_SECTION_HEADERS`. Both lists are hand-maintained, so a new block parser whose header is registered in NEITHER list passes CI green and its rows would false-positive `UNKNOWN_SECTION_HEADER`. The docstrings in both files were corrected (audit idx87) to describe the real, narrower guarantee (catches an accidental DELETION of a registered header; does NOT detect a genuinely-new unregistered header).

**Why not fixed now:** a robust, low-false-positive walker over `lib/parser/blocks/*.ts` is not cheaply achievable without a parser refactor. Header detection is heterogeneous — plain uppercase literals (`col0Upper === "VENUE"`), lowercase literals (`label === "hotel stays"`), and **regexes** whose matched header is computed, not a literal (`event.ts` `EVENT_DETAILS_HEADER_RE`, `hotels.ts` `/^HOTEL\s+RESERVATIONS?$/`, `rooms.ts` `gsFieldRe`) — and only `dress.ts`/`client.ts` import from `knownSections.ts`. The block-parser sources are also dense with intentional non-header uppercase literals ("NAME", "PHONE", "LED", "TRAVEL", "FRIDAY", "II", "N/A", warning codes), so a naive "every uppercase literal must be registered" walker would need a large hand-maintained exclusion list — the same drift-prone artifact this would replace.

**Fix (when prioritized):** route ALL section-header detection through a single shared, introspectable constant/helper (e.g. a per-parser exported `SECTION_HEADERS` const the parsers match against), then have the meta-test import each parser's constant and assert it ⊆ `KNOWN_SECTION_HEADERS`. Add a proof test that an unregistered header fails. This closes the class structurally instead of by hand-maintained parallel lists.

---

## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

Deferred out of the forensic code-stamping batch (`docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` §9) — separate user-facing / alerting surfaces beyond the pure log-code enrichment.

**Heading caveat:** only the first two items (`BL-SCAN-SSE-BODY-NULL-CODE`, `BL-PICKER-TAMPER-ADMIN-ALERT`) actually came out of that batch. The rest accreted under this heading afterwards from unrelated 2026-07-04+ work (agenda visibility, quiet-link a11y, alert-link e2e, health-resolve lockdown, Step-3 impeccable) and are grouped here by filing date, not by subject. Read each item on its own; the heading is not a topic.

**Sweep status (2026-07-24/25).** Every item below was re-verified against live code, and citations that had rotted were corrected in place — several were badly stale (`AlertBanner.tsx` deleted, `PerShowAlertSection.tsx` deleted, a 9-code registry that is now 20, line numbers shifted). One item closed as obsolete (`BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC`, since graduated to `BACKLOG-archive.md`). **Four** cross-model review rounds then caught further errors in the sweep itself, so treat the corrected text as verified but not sacred. The misses: a `grep -l` that matched a comment instead of a consumer; a nonexistent `shows.last_error_message`; a literal-attribute census that undercounted a dynamically-spread family by four; a "no live render exists" claim contradicted by an existing seeded e2e path; several citations pointing at an import, comment, JSDoc, or projection string rather than the executable binding; a component path copied from a review without resolving its directory; and a route prescription naming three renderers where the same section had already established four. **When picking up any item here, re-verify its citations before acting on them** — that is the whole lesson of this section. Working order for the rest: ~~PR2 `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`~~ (CLOSED, PR #592), PR3 `BL-AGENDA-PERDAY-VIEWER-FILTER`, PR4 `BL-SCAN-SSE-BODY-NULL-CODE`, PR5 `BL-PICKER-TAMPER-ADMIN-ALERT`, PR6 `BL-ALERT-ACTION-LINKS-E2E`. `BL-HEALTH-RESOLVE-DB-LOCKDOWN` stays an accepted risk and `BL-STEP3-IMPECCABLE-LIVE-RENDER` stays unscheduled — both deliberately, not by omission.

### BL-SCAN-SSE-BODY-NULL-CODE — onboarding scan SSE result body emits a user-facing `code:null`

**Status:** OPEN — queued as PR4 of the 2026-07-24 residual sweep · **Severity:** low · **Class:** USER-FACING SURFACE

`app/api/admin/onboarding/scan/route.ts:353` (verified 2026-07-24) emits `{ type: "result", body: { ok: false, code: null } }` to the client on catch (adjacent to the now-forensic-coded `ONBOARDING_SCAN_FAILED` log). The `code:null` is a distinct client-facing surface — arguably warrants a real §12.4 code so the client can catalog-look-up, but that is an expensive 3-way §12.4 change out of scope for the forensic batch. **Fix (when prioritized):** assign a cataloged code + regen `gen:spec-codes` + add the `catalog.ts` row.

### BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY — the admin layout harness hand-writes the wrapper it measures inside

**Status:** OPEN — filed from PR #610 whole-diff review R2 (MEDIUM) · **Severity:** low · **Class:** TEST FIDELITY

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
`AgendaBreakdown` is **236 lines with 4 hook call sites** (`useContext`, `useEffect`,
`useLayoutEffect`).

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

### BL-AGENDA-POSITIONAL-DAYSET-FALLBACK — the day-set matcher has no positional fallback

**Status:** OPEN — deliberate omission, ratified in-spec · **Severity:** very low · **Class:** FEATURE COMPLETENESS

`lib/crew/agendaViewerDays.ts` fails open when labels do not parse, rather than mirroring
`agendaSessionsForToday`'s four-condition positional fallback. Deliberate: the trigger (`!someDateParsed`)
does not occur in the 6-PDF corpus, and folding on positional index means folding in the state of least
knowledge. Full reasoning ratified at
`docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` §3 under "RATIFIED AMENDMENT".

**Revisit if** the corpus gains documents with purely positional day labels ("Day 1" / "Day 2") AND a
viewer reports seeing the whole show expanded when they expected their day marked.

### BL-PICKER-TAMPER-ADMIN-ALERT — selectIdentity tamper breadcrumb could also raise an `admin_alerts` upsert

**Status:** OPEN — queued as PR5 of the 2026-07-24 residual sweep · **Severity:** low · **Class:** ALERTING GAP

`lib/auth/picker/selectIdentity.ts:64` (verified 2026-07-24) logs a `PICKER_IDENTITY_CLAIMED_TAMPER` forensic warn on a hand-crafted claimed-row bypass, but does not raise an `admin_alerts` upsert. The forensic batch is code-stamping only; whether this security/tamper breadcrumb should also surface as an operator-visible admin alert is a separate alerting decision.

**Fix:** design the alert severity/dedupe, then upsert via `upsertAdminAlert` (`lib/adminAlerts/upsertAdminAlert.ts:47`). Two placement constraints, both verified 2026-07-24 — the original one-line fix note ("add the `admin_alerts.upsert` under the per-show lock") is **wrong on both counts** and should not be followed:

1. **Not under the lock.** The per-show advisory lock for this path is held INSIDE the RPC — `pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id))` at `supabase/migrations/20260523000007_select_identity_atomic.sql:37`, called as `.rpc("select_identity_atomic", …)` from `selectIdentity.ts:101`. Per invariant 2's single-holder rule the JS side must NOT acquire it again, and per invariant 10 the emit is post-commit anyway. Upserting after `selectIdentityCore` returns is already correctly outside the lock tx; nothing new is needed to achieve that.
2. **Before the `redirect()`.** The tamper branch calls `redirect(...)` immediately after the warn (`selectIdentity.ts:66-68`), and Next's `redirect()` throws to unwind — an upsert placed after it never executes. `admin_alerts` is also not one of invariant 2's lock-guarded tables, so this is purely an ordering constraint, not a locking one.

New `admin_alert` code → the ~9-surface lockstep fan-out applies (catalog row, identity map, action registry if it gets a link, bell/attention producers, meta-tests).

### BL-AGENDA-PERDAY-VIEWER-FILTER — Schedule agenda area is whole-show / not day-filtered for restricted crew

**Status:** ✅ SHIPPED in PR #610 (2026-07-26) · **Severity:** low · **Class:** VISIBILITY SCOPE

> **Retained for the decision record; the prescriptions below are HISTORY, not open work.** Two
> statements in this entry are now contradicted by shipped code and are corrected here rather than
> edited away, because the reasoning is what makes the entry worth keeping:
>
> 1. **"No reusable day-set matcher exists"** — one does now: `lib/crew/agendaViewerDays.ts`
>    (`visibleAgendaDaysForViewer`). It returns ROW INDICES, not dates, because `AgendaDay.date` is
>    always null in production (`lib/parser/extractAgendaSchedule.ts:653` is its sole constructor).
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

### BL-ALERT-ACTION-LINKS-E2E — real-browser e2e pass over every alert action link

**Status:** OPEN — queued as PR6 of the 2026-07-24 residual sweep; scope recounted · **Severity:** low · **Class:** TEST COVERAGE

**Scope correction (2026-07-24): the registry is now 20 codes, not 9.** `ALERT_ACTIONS` (`lib/adminAlerts/alertActions.ts:113`) registers `SHOW_FIRST_PUBLISHED`, `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE`, `ROLE_FLAGS_NOTICE`, `LIVE_ROW_CONFLICT`, `WIZARD_SESSION_SUPERSEDED_RACE`, `REPORT_ORPHANED_LOST_LEASE`, `BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`, `RESYNC_SHRINK_HELD`, `ONBOARDING_SHEET_UNREADABLE`, `SHEET_UNAVAILABLE`, `OPENING_REEL_NOT_VIDEO`, `OPENING_REEL_PERMISSION_DENIED`, `REEL_DRIFTED`, `EMBEDDED_ASSET_DRIFTED`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `PARSE_ERROR_LAST_GOOD`, `RESYNC_QUALITY_REGRESSED`, `SHOW_UNPUBLISHED`. The 11 codes added since PR #287 have never been enumerated in this item, so anyone sizing it off the original text would under-seed by more than half. Re-count from the registry at implementation time rather than trusting either list — and prefer deriving the seed set from `ALERT_ACTIONS` keys programmatically so the spec cannot go stale again. If PR5 (`BL-PICKER-TAMPER-ADMIN-ALERT`) lands an action link, that is a 21st.

PR #287 shipped the per-code action-link registry with unit + jsdom-render + structural-meta coverage, but no real-browser e2e: nobody has clicked the links in a live app. Coverage gap: fragment-scroll behavior of the `#share-access` internal links on the live render, real seeded alert rows carrying each code's context shape (incl. absent-field variants rendering NO link), and external hrefs (`docs.google.com` / `drive.google.com` / `github.com`) asserted verbatim without navigating off-app.

**Two surface claims in the original text are stale (corrected 2026-07-24).** There is no longer a "banner global-vs-per-show split": global notifications live in the bell (`BellPanel.tsx`, fed by `lib/admin/bellFeed.ts`) and `review/AttentionBanner.tsx` is show-scoped, so the split to assert is bell-vs-banner, not one banner behaving two ways. And `/admin/show/[slug]` is no longer a render surface — it is a legacy 307 redirect into the dashboard modal at `/admin?show=<slug>`, kept only so emailed path-shaped deep links survive the auth `next` pipeline: `requireAdmin()` runs at `app/admin/show/[slug]/page.tsx:28`, then the route redirects to `/admin?<searchParams>` at `:37` (the header comment at `:1-14` explains why). A spec that navigates there and waits for alert cards will be measuring the redirect target, so target `/admin` and `/admin?show=<slug>` deliberately.

**Fix (when prioritized):** a Playwright spec (harness precedent: `tests/e2e/`) that seeds one alert row per registered code — enumerated from `Object.keys(ALERT_ACTIONS)`, not from a hand-copied list (see the scope correction above) — plus per-code negative rows (context field absent → no anchor), covers **four** renderers across **three** routes — `/admin` (bell panel, fed by `bellFeed.ts:133`), `/admin?show=<slug>` (attention banner AND the attention menu, both fed by `attentionItems.ts:307`), and `/admin/dev/telemetry` (health panel; `HealthAlertsPanel` mounts ONLY at `app/admin/dev/telemetry/page.tsx:76`, so no dashboard route can exercise it) — clicks each internal link asserting the landed section, and asserts external anchors' exact href/target/rel without following them. Pair with a one-time validation-deployment smoke click-through.

### BL-HEALTH-RESOLVE-DB-LOCKDOWN — DB-enforce developer-only health-alert resolution

**Status:** OPEN — ACCEPTED RISK, deliberately not scheduled (re-affirmed 2026-07-24) · **Severity:** low · **Class:** SECURITY / DEFENSE-IN-DEPTH

**Re-verified 2026-07-24:** the grant is still live — `supabase/migrations/20260501002000_rls_policies.sql:147` reads `grant select, insert, update, delete on table public.admin_alerts to anon, authenticated;`. The acceptance below is unchanged, and this item was explicitly reviewed and left open during the 2026-07-24 residual sweep rather than overlooked. Do not re-raise it as a finding on an unrelated diff; it closes only as part of `BL-ADMIN-POSTGREST-DML-LOCKDOWN`.

alert-audience-split (spec §6.7) makes health-alert resolution developer-gated at every PRODUCT surface (the dev-gated `resolveHealthAlertFormAction` plus HEALTH_CODES rejects on the three legacy user-facing resolve surfaces: `resolveAdminAlertFormAction`, `app/api/admin/admin-alerts/[id]/resolve`, `app/api/admin/show/[slug]/alerts/[id]/resolve`). This is app-surface defense-in-depth + UI coherence, NOT a DB-enforced trust boundary: `admin_alerts` still GRANTs UPDATE to `authenticated` and its RLS policy allows any `public.is_admin()` caller to update rows (`supabase/migrations/20260501002000_rls_policies.sql`), so a non-developer admin could in principle `PATCH admin_alerts.resolved_at` directly through PostgREST, bypassing the app layer. We ACCEPT this (Doug is the trusted business owner, not an adversary; role filtering is UX not security). **Fix (when prioritized):** revoke direct `admin_alerts` UPDATE from `authenticated`/`anon` and route ALL resolution — doug alerts included — through `SECURITY DEFINER` RPCs with an `is_developer()` check for health codes. Materially larger, whole-resolve-path change; deferred as a cross-reference of the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` admin_alerts-class DML lockdown item.

### BL-STEP3-IMPECCABLE-LIVE-RENDER — live-render impeccable pass on the Step-3 Variant-B page

**Status:** OPEN · **Severity:** low · **Class:** UI EVALUATION

The Step-3 "Review & publish" Variant-B redesign (spec/plan `2026-07-04-step3-review-page-variant-b`) shipped its UI quality gate (invariant 8) via a real-browser static-harness (DI-1…DI-4, bite-verified), a manual DESIGN.md/PRODUCT.md/mock conformance review (close-out §12), and the whole-diff Codex cross-model review as external attestation. What it could NOT do: a `/impeccable critique` + `/impeccable audit` pass on the LIVE rendered page.

**Harness inventory re-verified 2026-07-25 — the item's "no live render" framing was wrong, twice over.**

First, "every Step-3 layout spec is a standalone static harness" is false: `tests/e2e/_step3ReviewModalLiveEntry.tsx:124` does `createRoot(rootEl).render(<LiveHarness />)` on the REAL `<Step3ReviewModal>` tree (esbuild-bundled, served over `node:http`), so drag, scroll-spy, and Tab traversal already run against real component JS in a real browser via `step3-review-modal.interactions.spec.ts`.

Second — and this is what actually shrinks the item — **a seeded real-app Step-3 render already exists.** `tests/e2e/admin-phase2-surfaces.spec.ts:67-74` signs in and boots the real app at `/admin?step=3`, asserting a 200. `tests/e2e/helpers/devCaptureStaged.ts` seeds `pending_syncs` + `onboarding_scan_manifest` (`seedStagedRow`, `:94`), then `openStep3Modal` (`:216-230`) navigates the real `/admin?step=3`, clicks the real card, and waits for `[data-step3-review-panel]`; `tests/e2e/dev-capture.spec.ts:197-218` drives that path. So the app boots, the DB is seeded, and the real modal opens.

**The residual gap is narrower than recorded:** the existing seed is a SINGLE row, and it already supplies the **clean/ready** state — `seedStagedRow` (`devCaptureStaged.ts:94-139`) inserts `status: "staged"` with a parsed `parse_result.show`, no review items and no finalize-failure code — and, importantly, **no resolved linked show**: it writes no `created_show_id` and uses a fresh Drive file ID, so `buildStep3Row` (`OnboardingWizard.tsx:285`) passes `linkedShow: null`. That null is what produces `ready`; a resolved linked show would return `live` / `ready_to_publish` / `held` at an earlier branch of `deriveStep3DisplayState` (`lib/admin/step3DisplayState.ts:44-77`). The show-resolution step that would have supplied one is the `driveFileIds` → `showsRows` lookup at `OnboardingWizard.tsx:477-519`, feeding the row build at `:598-638`. So **five** row states are missing, not six: needs-a-look, demoted, no-details, blocking, set-aside. And no `/impeccable critique` + `/impeccable audit` has been run against that render. This is _extend an existing seed helper and run the dual-gate_, not _stand up a live Step-3 seed from scratch_. Size it accordingly.

Current surface files: `components/admin/wizard/Step3Review.tsx`, `Step3ReviewModal.tsx`, `step3ReviewSections.tsx`, `Step3ReviewWithFinalize.tsx`, `Step3SheetCard.tsx`, plus the live-tree shells `components/admin/review/ReviewModalShell.tsx` and `components/admin/review/ShowReviewSurface.tsx` (imported at `Step3ReviewModal.tsx:46,55`, bound in JSX at `:372,666`), and `components/admin/OnboardingWizard.tsx`, which mounts `Step3ReviewWithFinalize` at `:699` and `:731` (`:35` is only the import).

**Fix (when prioritized):** extend `seedStagedRow` to cover the five missing states (the reserved wizard session already exists; add ≥1 needs-a-look, ≥1 demoted, ≥1 no-details, ≥1 blocking, ≥1 set-aside row alongside the ready row it already seeds), then run the impeccable v3 dual-gate against the live `/admin?step=3` render — including an explicit dark-mode warn-contrast check and the double-"Review" affordance on demoted RESCAN cards (close-out §12 finding 7).

---

## Test-safety hardening (2026-07-05)

### BL-SOURCE-NUL-BYTE-STEP3REVIEW — a committed NUL byte makes one source file invisible to grep

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** SOURCE HYGIENE

`components/admin/wizard/Step3Review.tsx` carries a raw U+0000 at byte offset 53375 — `uncheckedCleanNames.join("<NUL>")`, committed as a literal NUL instead of the two-character escape `\u0000` (commit `fc75a9bcd`). `file(1)` reports the file as `data`, so **`grep` skips it silently**: no match, no "Binary file matches" line, no error. Any grep-based audit of `components/**` under-reports by this file, and one such audit did exactly that while enumerating references for the Step-3 deletion guard. Guards that read with `readFileSync` are unaffected. **Fix (when prioritized):** replace the raw byte with the escape sequence. Deferred rather than fixed inline because `components/**` is a UI surface, so a zero-behavior byte change would trigger the invariant-8 impeccable dual-gate.

### BL-PREPARE-INTERNAL-FAULT-KIND — a third fault kind for post-parse internal helpers

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

`PrepareOnboardingFileError` has two kinds, `drive_fetch` and `parse`, and the post-parse internal helpers (`finalizeArchivedTabs`, `reconcileIncludedTab`, `discardAndRerun`'s fix-up, `applyRoleTokenMappings`) currently fall to `drive_fetch` — today's unchanged behavior. Neither code is right for them: a bug in the role-mapping overlay is not a Drive failure, and it is not something Doug fixes by editing his sheet either, so `STAGED_PARSE_FAILED` ("fix its structure", `warn` severity) would be a new wrong instruction. **Fix (when prioritized):** a third `internal` kind mapped to a code that tells the operator to contact the developer, with the finalize severity staying `error`. Needs a new §12.4 row and the full four-gate CI fan-out, which is why it was not folded into the batch that surfaced it.

### BL-CRON-WORKBOOK-FAULT-CODE — a corrupt workbook on the cron path reports SYNC_FILE_FAILED

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

The cron sync path also synthesizes workbooks (`lib/sync/runScheduledCronSync.ts:3118,3144`). A throw at either site escapes `prepareProcessOneFile` and is caught by the outer per-file loop (`:3915-3925`), which records `outcome: "parse_error"` with `classifySyncFailure(error)` — typically `SYNC_FILE_FAILED`. So it is already parse-family rather than Drive-family (unlike the onboarding paths this batch fixed), and the open question is narrower: should a corrupt workbook there report `PARSE_ERROR_LAST_GOOD`, whose copy tells Doug the latest edit did not parse and the previous version is still live? **Fix (when prioritized):** key on the `WorkbookSynthesisError` type this batch introduced. Deferred because it changes a live crew-visible sync contract and belongs in its own spec.

### BL-ROOM-DIMS-ONLY-NOVEL-HEADER — parse a dims-only novel breakout header (no DAY-range)

**Status:** OPEN · **Severity:** low · **Class:** PARSER COVERAGE

The parser-anchor-de-literalization PR (spec `docs/superpowers/specs/2026-07-05-parser-anchor-deliteralization.md`, audit finding #6) de-literalizes the v1 breakout-room loop from the two literal names `MABEL`/`LAUDERDALE` to any `NAME + trailing DAY-range` header, so a future differently-named DAY-range breakout (`GRAND BALLROOM DAY 1 & 2`) now parses. A dims-ONLY header with NO DAY-range (`SALON ABCD&#10;60' x 45'`, `MERIDIAN HALL&#10;50' x 30'`) is deliberately **out of scope** (spec §2 "Descoped", adversarial-review R31 f1): it is structurally identical to a dims-bearing ASSET/equipment row (`PROJECTION SCREEN&#10;5' x 9'`, `4' X 8' RISER`), so a name-blind admit gate cannot tell a novel dims-only room from an asset — 14 adversarial rounds confirmed every dims-based admit/evidence/ownership gate reopened asset fabrication or field theft. origin/main never parsed this shape, so it is NOT a regression, and a blanket data-gap signal is rejected (it would fire on every gear row = noise). **Fix (when prioritized):** parse a dims-only room only under a POSITIVE room-context signal the sheets actually carry — a `BREAKOUT`/room-section header above the row, or an explicit room label — NOT a dims token. Add fixtures with a real dims-only room inside a room section and assert it parses without any asset row (dims-bearing gear elsewhere on the sheet) becoming a room.

**Update (2026-07-06, spec `docs/superpowers/specs/2026-07-06-bo-venue-header-anchor.md`):** partially addressed by the BO-venue-header anchor — a dims-only header sitting above a **`BO` field block** now parses, anchored on the field block (not the dims token), so no asset is fabricated. The remaining unaddressed sub-case is a dims-only header with **no** field block of any kind (a bare `NAME&#10;dims` cell), which stays out of scope (indistinguishable from an asset without an anchor).

---

### BL-MUTATION-HARNESS-OPEN-HOLES — parser silent-fragility classes pinned by the mutation harness

**Status:** OPEN (2026-07-06, feat/mutation-harness) · **Severity:** medium · **Class:** PARSER ROBUSTNESS

The rec-5 mutation-testing harness (`tests/parser/mutationHarness.test.ts`, nightly workflow) pins **7,885 day-1 silent holes** — mutants whose parse changed with no compensating signal (`SILENT_WRONG` / `SILENT_SIGNAL_LOSS`), recorded in `tests/parser/mutation/knownHoles.ts`. Each hole's `finding` field maps its operator class to the audit finding it exercises (`OPERATOR_FINDING_MAP`), so a ledger failure is triageable by operator. Documented-finding classes: **`header-typo` → audit #5** (short-header typo intolerance, `sectionHeaderNormalize.ts:16,66`); **`blank-row:inject` / `blank-row:remove` → audit #10** (blank-row block segmentation, `exportSheetToMarkdown.ts:104`). The remaining operator classes are silent-fragility surfaces the audit did not enumerate as a numbered finding; each is tracked as a backlog sub-item below and its holes shrink when that class is hardened:

- **`BL-MUTATION-REF-SUB`** — a body cell rewritten to the literal `#REF!` (a real broken-reference export artifact, present in 3/7 live shows) is absorbed into the parse with no signal. Value-corruption class.
- **`BL-MUTATION-UNICODE`** — a zero-width non-joiner (U+200C) injected into a cell value is silently retained (the fintech live ZWNJ shape). Invisible-character class.
- **`BL-MUTATION-COLUMN-SHIFT`** — a spurious leading empty column shifts a section's row grid with no signal (the East Coast column-shifted outlier). Layout-shift class.
- **`BL-MUTATION-MERGED-CELL`** — deleting one interior pipe (how a merged cell exports) fuses two adjacent cells silently. Cell-fusion class.
- **`BL-MUTATION-SECTION-ORDER`** — reordering two adjacent top-level blocks silently reorders the parser's output arrays (the parser preserves source order). **Order-sensitivity discovered by the harness on 2026-07-06** (58 `SILENT_WRONG` + 24 `SILENT_SIGNAL_LOSS` across the corpus); section-reorder was reclassified cosmetic → corrupting as a result.

**Ratchet:** the ledger is a shrink-only baseline. When a downstream fix hardens one of these classes, the corresponding holes become `staleRows` and the nightly harness fails until they are removed from `knownHoles.ts` — turning each parser-robustness fix into a measurable ledger reduction. Do NOT grow the ledger silently; a NEW hole (regression) fails the harness as `newAlarms`.

---

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** OPEN (2026-07-15; audit finding #10, 2026-07-04) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

---

### BL-TRANSPORT-ID-RESOLUTION — id-based transport visibility + no-match admin warning (deferred from Flow 8.4 to 8.3)

**Status:** PARTIALLY CLOSED (2026-07-09, Flow 8.4 PR #374) · **Severity:** medium · **Class:** CREW VISIBILITY / ENRICH

**Partial closure (Flow 8.4, PR #374 — `docs/superpowers/specs/2026-07-09-flow8.4-transport-assignee-warning.md`):** the **enrich-time no-match admin warning** shipped. `lib/sync/enrichTransportAssignees.ts` emits one admin-only aggregate data-gap warning (`TRAVEL_TRANSPORT_NAME_UNMATCHED`, `gateExempt: true`) when a transport driver/assignee name references a crew member who would not see their own tile — turning silent invisibility into a staged-review data-quality signal. **Still deferred to 8.3:** id-persistence + id-based visibility matching (a crew `id` does not exist at enrich time — the uuid is DB-assigned at APPLY via `gen_random_uuid()`, `initial_public_schema.sql:32` — so resolve-to-id-and-persist is architecturally infeasible in the enrich pass; 8.3 must move it to an apply-time step). The regression pins below also remain for 8.3, which changes the `transportTileVisible` predicate.

The Flow-8 audit item 8.4 (`docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §Flow 8) asks that a transport name mis-parse cannot hide a driver's own itinerary. `transportTileVisible` (`lib/visibility/scopeTiles.ts:177-202`) matches assigned crew by **fuzzy name** (`namesRefer`, `lib/data/nameMatch.ts`), which closes the common variance (nickname / legal-name / case / trim / prefix) but NOT a **hard** mis-parse (a merged-cell overflow that shifts the surname token, e.g. a driver stored as `"Doug Larson Loadout"` — the adjacent column fused onto the name — vs roster `"Doug Larson"`; verified `namesRefer` returns false because the multi-token rule compares last tokens `"loadout"`≠`"larson"`). In that case the driver silently does not see their own ground-transport block. Flow 8.4 (PR #374, see Partial closure above) now emits an **admin-visible no-match warning** for this case, so it is no longer _silent_ — but the driver still does not see their tile until the operator fixes the name, because id-based visibility matching remains deferred to 8.3.

**Deferred defensive regression pins (moved out of `flow8-self-serve-trio` at plan-review Round-11; land red-first in 8.3):** pin `transportTileVisible`'s _current_ fuzzy tolerance against name-parse-variance regression — driver `"Doug"` vs viewer `"Doug Larson"` → visible (prefix); `"Douglas Larson"` vs `"Doug Larson"` → visible (surname); assigned-names `["Bill Werner"]` vs `"William Werner"` → visible; case/trim `"  doug larson "` → visible; negative controls (`"Jane Smith"` → not visible, empty/`null` → not visible, admin → visible when transportation exists); and the **known-gap fixture** driver `"Doug Larson Loadout"` vs `"Doug Larson"` → **not visible** (verified live: multi-token rule compares last tokens `"loadout"`≠`"larson"`, `nameMatch.ts:50-53`). These were removed from the milestone because a green-only regression-pin task conflicts with plan-wide invariant 1 (non-negotiable red-first per task); they belong red-first in 8.3, which changes this exact predicate.

**Fix (deferred to the 8.3 venue-timezone / enrich spec, same enrich domain + admin-warning machinery):** at enrich time, resolve free-text `driver_name` / `assigned_names` → `crew_member` ids against the show roster, persist the resolved id set on the transportation legs / driver, match viewer visibility by id (robust to any later render-time name garble), and emit an admin-visible alert when an assigned name resolves to **no** roster member (turns silent invisibility into a data-quality signal — parallels 8.3's ET-default admin warning). Add fixtures with a hard-mis-parsed driver name and assert the driver's own transport becomes visible via id resolution AND that the no-match name raises the admin warning. Interim crew recourse until this lands: the Flow-8.1 picker "Don't see your name?" affordance.

---

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)

## Share hub follow-ups (2026-07-25, share-link-chrome-backlog)

### BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE — a remote rotation is silent under reduced motion

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** UI A11Y

The crew-URL cue fires on ANY accepted token change, including another admin's rotation arriving through `router.refresh()`. On that path no banner mounts — the success banner renders off `result`, local state that only this browser's own action sets (`app/admin/show/[slug]/RotateShareTokenButton.tsx:82`, written at `:159`). So a reduced-motion admin watching a remotely-rotated link gets neither the cue nor an announcement.

NOT a regression: before the cue, a remote rotation swapped the URL silently for everyone, so this diff adds a signal for one group and removes none. Deliberately not fixed there because the fix is a new announcement surface — a live region owned by ShareHub that speaks a change this browser did not initiate needs its own copy, politeness level and repeat-suppression design, plus a decision about whether a background URL change should interrupt a screen-reader user at all. Trigger: an a11y pass on the admin share surfaces, or a report of a surprise URL change.

### BL-HELP-STRIP-COPYLINK-STALE — help prose still describes the retired strip copy-link

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** DOCS

Two claims in `app/help/admin/per-show-panel/page.mdx` describe a status-strip copy-link that the share-hub consolidation removed: `:7` lists it among the strip's contents, and `:30` places the Re-sync button "between the sync line and the copy-link button". Both are user-visible and both are wrong.

Pre-existing debt from `docs/superpowers/specs/2026-07-20-share-hub-design.md:104`, not from the milestone that surfaced it, and deliberately out of scope there: correcting shipped user copy pulls in the help screenshot surface (`help-affordances`, `screenshots-drift`), which a code-comment sweep should not. Trigger: the next help pass, which can own the regeneration.

### BL-SHAREHUB-OPEN-TIMER-LEAK — opening the hub arms a timer that survives unmount

**Status:** OPEN (2026-07-25) · **Severity:** low · **Class:** RESOURCE HYGIENE

Measured while writing the cue's teardown coverage: rendering ShareHub arms zero timers, opening the popover arms one, and unmounting the tree leaves that one behind. The cue's own timer cleans up correctly — the leak predates it and belongs to something the popover mounts.

Consequence today is limited to test hygiene: it makes a global `vi.getTimerCount()` assertion unusable, which is why `shareHubFlashState.test.tsx` measures a delta against a post-open baseline rather than expecting zero. Trigger: bisect the popover's children for the un-cleared `setTimeout`, or promote if a real leak surfaces under repeated modal open/close.

## BL-DURATION-TOKENS-EMIT-NO-CSS — `duration-fast` / `duration-normal` are inert across 89 files

**Status:** OPEN (2026-07-25, destruct-thumb-order impeccable audit P1) · **Severity:** MEDIUM · **Class:** DESIGN TOKEN WIRING, repo-wide

Tailwind v4's `duration-*` utility resolves `--transition-duration-*`, but `app/globals.css` defines `--duration-fast` / `--duration-normal`. Verified empirically: compiling the token CSS emits **no rule** for `duration-fast`. So all **276 `duration-fast` + 42 `duration-normal` usages across 89 files** silently fall back to Tailwind's 150ms default, **and the `@media (prefers-reduced-motion: reduce)` block that zeroes those variables never applies to any Tailwind transition** — which is the part that matters. **Fix:** rename the custom properties to `--transition-duration-fast` / `--transition-duration-normal` in the `@theme` block, then re-verify the reduced-motion path actually zeroes a real transition. **Trigger:** next motion or token pass; treat as an a11y fix, not a cosmetic one.

## BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS — the armed window closes silently for screen readers

**Status:** OPEN (2026-07-25, destruct-thumb-order impeccable audit P2) · **Severity:** LOW · **Class:** A11Y, destructive-confirm family

Two gaps on the shared two-tap idiom, neither specific to one surface. The ARM itself is announced on the surfaces that carry a live region (`PendingPanelDiscardButtons` uses `role="status"`), so this row is about the close, not the open (R12 F3). (1) **Silent disarm:** at 4s the live region empties and the button's accessible name reverts, but a focused button's name change is not spoken — the user believes they are still armed. (2) **Timing:** 4s is tight against ~3s of polite speech for the arm message, so a screen-reader user may not finish hearing the prompt before the window closes. Fixing either well means revisiting `ARM_REVERT_MS` for assistive-tech users specifically, which is a family-wide decision (11 surfaces) rather than a component one. **Trigger:** an a11y pass on the destructive-confirm family, or any change to `ARM_REVERT_MS`.

## BL-STAGED-IDENTITYLINK-RENAME-IDENTITY — dashboard staged apply treats identity-link renames as remove+add

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug §2.5) · **Class:** sync (staged identity application) · **Effort:** M (staged-core threading + double-apply analysis)

The dashboard staged-apply path (`applyStagedCore`) applies an identity-linked rename (MI-12/13/14) as **remove-old + add-new** by ratified contract (R33-2, `applyStagedCore.ts:552`; passes zero `identityLinkRenames`), so crew identity (id/oauth link) is NOT preserved across a rename on that path. The capability AUDIT is already complete (arm (c) audits the removed old identity's loss + arm (b) the added new identity's grant, path-independent), so this is NOT an audit gap. If identity-PRESERVATION on the staged path is ever wanted, thread `identityLinkRenames` through `applyStagedCore` (compute via `computeIdentityLinkRenames` from the staged `triggeredReviewItems`) — but resolve the double-apply / R33-2-override risk first. Trigger: a report of a staged rename losing a crew member's oauth link.

## BL-MASTERSPEC-FINANCIALS-VOCAB — reconcile stale LEAD-only financials-gate prose in the master spec

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug, owner scope decision) · **Class:** docs (canonical-spec consistency) · **Effort:** S (doc-only grep-sweep)

Pre-existing `2026-07-15-extend-role-scope-vocab` debt: that spec added the `FINANCIALS` role flag but did not reconcile the master spec's (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) ~15 financials-access prose claims, which still describe financials/`shows_internal`/FinancialsTile access as LEAD-only. Live code (`lib/data/getShowForViewer.ts:380` `financialsEntitled = isAdmin || includes("LEAD") || includes("FINANCIALS")`, `lib/visibility/scopeTiles.ts:141`) grants on LEAD ∪ FINANCIALS ∪ admin. Reconcile every financials-entitlement claim to `LEAD ∪ FINANCIALS` (or admin). Grep seed: `rg -n "financ|shows_internal|FinancialsTile|financialsEntitled|Proposal|Invoice|PO#" <masterspec> | rg -i "LEAD" | rg -v "FINANCIALS"` (the final exclude is CASE-SENSITIVE — drops only lines already naming the all-caps FINANCIALS role flag). Exclude RLS-admin-only denial and `raw_unrecognized`/`parse_warnings` (admin/LEAD-only — FINANCIALS grants only the `financials` column). Trigger: next master-spec pass or an audit flagging the drift. (This capability-narrow change already corrected the §6.8 MI-9 "LEAD is the only capability element" claim; the rest is out of its scope.)

## BL-ADMIN-PARSEPANEL-ORPHANED — ParsePanel/StagedReviewCard live-scope mount orphaned

Since the show-page→modal pivot (#476) nothing imports `components/admin/ParsePanel.tsx` (its per-show mount was deleted; whole-parse review was deliberately dropped from published shows in 65d5be75a in favor of MI-11 holds in the Changes feed). `StagedReviewCard` remains live in the onboarding wizard; the live-scope `ParsePanel` wrapper is dead code. Surfaced during published-show-alerts (2026-07-19, spec §14). **Fix (when prioritized):** delete ParsePanel or re-home it explicitly; sweep `tests/e2e/_metaEmphasisRenderContract` style registries on removal.

## BL-RESYNC-REGRESSED-JUMP-LINK — the alert's "open the parse panel" pointer is prose, not an affordance

**Status:** OPEN · **Severity:** LOW-MEDIUM (discoverability) · **Class:** UX — surfaced by the correction-loop de-duplication (#516, 2026-07-20)

`RESYNC_QUALITY_REGRESSED`'s body ends "…open the parse panel to see what degraded and fix the sheet." That sentence is the ONLY thing routing Doug from the alert to the Parse warnings panel, and it is plain prose: no link, no jump control.

This pointer became load-bearing in #516. Before that change, the Overview section rendered the correction-loop instruction ("Fixed it in the sheet? … then re-sync.") directly under the alert, so a reader who never scrolled still got the how-to-fix. #516 removed that copy as a duplicate — correctly, since the Parse warnings panel renders the same sentence on a strictly wider condition — which means the alert's prose pointer is now the whole bridge between "something degraded" and "here is how to fix it".

**Why this is NOT a code fix:** master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2801`) ratifies "No action link." for this row. Adding a jump affordance contradicts a ratified contract, so it needs a spec amendment first, not a patch. Do not "just add a link" in a UI PR.

**Options to weigh at spec time:** (a) amend the §12.4 row to permit a section-jump action link (note the row's `resolution:"auto"` posture — the link would be navigational, not resolving, which is a different affordance class than the action links other rows carry); (b) leave the alert alone and instead make the rail's "Parse warnings" section carry the attention dot the alert implies, so the route is visible in the nav rather than in prose; (c) accept the prose pointer as sufficient given the rail is always visible in the modal.

**Trigger:** next milestone touching §12.4 alert rows, the attention surface, or `CompactAlertCard` affordances.

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

## BL-FOCUS-RING-CONTRAST — compute + meta-test `--color-focus-ring` contrast against every backdrop family

From the impeccable critique of `feat/sharehub-focus-pass` (Assessment A P2, 2026-07-23). `--color-focus-ring` is translucent orange (`rgba(255,140,26,0.55)` light / `rgba(255,160,71,0.65)` dark, DESIGN.md token table). Naive alpha-blend puts the light-mode ring around ~1.6:1 against white `--color-surface` — under the WCAG 2.2 SC 2.4.13 Focus Appearance ≥3:1 expectation — while dark mode lands ~4.5:1. Pre-existing and app-wide (every `focus-visible:ring-focus-ring` control), NOT introduced by the focus pass; the pass actually improved perceptibility where the offset gap now separates ring from fill. Work: compute real ratios per backdrop family (surface, surface-sunken, warning-text fill, accent fill), decide whether the light token needs a darker/opaque variant, and pin the outcome with a contrast meta-test (the `status-token-contrast` pattern). Owner decision needed on token change vs accepted-as-brand. **Measured 2026-07-25** (destruct-thumb-order audit, from rendered `getComputedStyle` rather than a naive blend): light composites to ≈`#FFC075` for **1.60:1**, dark **4.40:1** — confirming the earlier estimate. The same audit measured a bare `ring-offset-2` white halo at **17.90:1** against `bg-surface` in dark mode, which is the concrete cost of the ~90 pre-existing bare usages this row already tracks. Same sweep should reconcile the ~90 pre-existing BARE `ring-offset-2` usages (no color companion) outside the share-hub components with the DESIGN.md token-table rule the focus pass added ("never bare ring-offset-2") — each is a latent dark-mode white halo.

## BL-DEV-SWITCHER-BAR-MOBILE-WIDTH — attention-gallery switcher bar counter/description collapse to zero width on mobile

**Status:** OPEN · **Severity:** LOW (developer-only surface) · **Class:** responsive layout — surfaced by the modal-state-coverage impeccable critique (2026-07-22)

At the 390px mobile viewport the switcher bar's counter ("52 / 116") and scenario-description block measure clientWidth 0 (flex siblings squeeze them out), so the operator cannot tell which scenario is active on mobile. Desktop is unaffected. Pre-existing at origin/main 76288ca62 (section jump select landed with the bar); NOT introduced by the modal-state-coverage branch (zero layout-class hunks touch the bar in that diff). **Fix (when prioritized):** give the counter/description block a min-width floor (or wrap the bar) in components/admin/dev/AttentionModalSwitcher.tsx and add a 390px real-browser assertion to the gallery e2e.

## BL-FLOW8REPICK-TEARDOWN-FLAKE — flow8Repick uncaught `window is not defined` after env teardown (CI shard flake)

**Status:** OPEN · **Severity:** LOW (flake; 0 test failures) · **Class:** jsdom teardown race — surfaced on PR #558's `unit-suite-db (5)` (2026-07-23), rerun green, main green at the same code.

`tests/show/flow8Repick.test.tsx` renders React trees with no `afterEach(cleanup)`; mounted components leave scheduler work (`Immediate performWorkUntilDeadline`) that can tick AFTER the jsdom environment is torn down → `ReferenceError: window is not defined` as an **uncaught error** — vitest reports every test passing (879/879 on the shard) yet exits 1 via the separate `Errors` summary line (the known `feedback_vitest_exits_1_on_uncaught_errors_all_tests_pass` class). Eruption is shard-composition-dependent: adding/removing test files reshuffles the serial shards, changing neighbors/timing — PR #558 added two test files and hit it; a `--failed` rerun passed. **Fix (when prioritized):** add `afterEach(cleanup)` to flow8Repick (and sweep `tests/show/` for sibling render-without-cleanup files); assert no `Errors` line in the CI gate wrapper if this class recurs.

## BL-IGNORED-SUMMARY-TAP-TARGET — Ignored (N) disclosure summary is under the 44px tap floor

From the impeccable audit of `feat/crew-warning-attachment` (2026-07-23), pre-existing: the `Ignored (N)` `<summary>` in `components/admin/showpage/sectionWarningExtras.tsx` is a `text-xs` row with no `min-h-tap-min`, under the 44px floor, while `CrewUnderRowStack`'s equivalent "N more" summary carries it. Add `min-h-tap-min` + flex alignment to match.

## BL-ATTENTION-MENU-PANEL-CLIP — attention menu is an anchored, capped scroller inside the clipping panel

**Status:** OPEN · **Severity:** UNVERIFIED (needs measurement before triage) · **Class:** same as `BL-SHAREHUB-ARM-VIEWPORT-REVEAL`, which graduated to `BACKLOG-archive.md` when it shipped.

Surfaced BY the structural registry added in `feat/sharehub-archive-copy-reveal` (`tests/components/admin/showpage/popoverOverlayRegistry.ts`), which is the point of building it. `AttentionMenu` mounts INSIDE the `overflow-clip` review-modal panel (`components/admin/showpage/PublishedReviewModal.tsx`), is absolutely anchored (`components/admin/showpage/AttentionMenu.tsx:119`, `top-[calc(100%+8px)]`) and carries its own capped scroller (`components/admin/showpage/AttentionMenu.tsx:130`, `max-h-96 overflow-y-auto`), while using neither clip-safety mechanism.

The original spec sweep missed it because that grep required `top-full` and this component uses an arbitrary anchor — exactly the false negative plan-review R3 predicted, then demonstrated on a real file.

NOT fixed on suspicion: whether it strands content depends on measured geometry, and it sits near the panel top where 384px may well fit. **Probe recipe:** open the menu at 390x{844,667,560} with enough items to fill `max-h-96` and assert the last item is reachable via `elementFromPoint`, the shape spec §9.2 uses. Registered as `unverified-gap` so the guard stays green while the question stays visible.

## BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS — the hub backdrop swallows taps on its own triggers

**Status:** OPEN · **Severity:** LOW (near-invisible in use) · **Class:** stacking-context misconception.

With the hub open, the `fixed inset-0 z-20` backdrop wins the hit test over both trigger buttons. The root's (now removed) open-gated `z-30` elevated the WHOLE root, backdrop included, and never ordered that fixed child against its non-positioned trigger siblings — so `tests/components/admin/showpage/shareHub.test.tsx` pinned class-level z values and read them as paint order, the exact failure `T-HUB-ZORDER`'s own comment warns about.

**Pre-existing, not a regression:** the same `elementFromPoint` probe fails identically with `origin/main`'s `ShareHub.tsx` checked out in place. Near-invisible because the backdrop's own handler closes the popover, so a trigger tap still dismisses — just via the outside-click path, without focus restore.

**Fix shape:** give the trigger group its own open-gated stacking level above the backdrop, or move the backdrop into the portal beneath the body; then restore the trigger assertions in T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts`), which were deliberately scoped out rather than asserted as expected so the eventual fix does not look like a regression.

## BL-SHAREHUB-CONFIRM-NAMES-SHOW — armed Archive confirm does not name the show it will archive

**Status:** OPEN · **Severity:** LOW · **Class:** destructive-confirm context.

Surfaced by the impeccable critique of `feat/sharehub-archive-copy-reveal` (2026-07-24, finding 1). On short viewports the hub popover now places ABOVE its trigger, which covers the show title and status band — so at the moment the operator arms a destructive action, the surface no longer shows which show they are acting on.

Placement is not the thing to change: opening upward is what makes the confirm reachable at all, and the prior behaviour was a popover clipped off-screen, which is strictly worse than an obscured title. The better fix is to make the confirm self-describing — name the show in the armed consequence sentence, so context travels with the decision instead of depending on what happens to be visible behind the popover.

Fix shape: include the show title in the armed confirm copy in `components/admin/ArchiveShowButton.tsx`, and pin it in `tests/components/admin/showpage/shareHub.test.tsx`. Copy is owner-ratified (destructive-confirm-pass §R7), so this needs a copy decision, not just an edit.

## BL-PUBLISHED-TOGGLE-OVERLAY-CLIP — published-toggle error overlay can be cut by the panel clip

**Status:** OPEN · **Severity:** LOW · **Class:** as above, weaker variant.

`components/admin/PublishedToggle.tsx:59` anchors an error banner `absolute inset-x-0 top-full` inside the clipping panel. Unlike the share hub it carries NO cap and NO internal scroller, so it cannot strand content in a hidden scroll tail — the failure mode the registry exists for — but a long enough error could still be visually cut at the clip edge. Error-only and momentary (`components/admin/PublishedToggle.tsx:55`), hence out of scope for the placement migration.

## BL-STRIPCOMMENTS-DUPLICATED-AND-FAIL-OPEN — 17 hand-rolled comment strippers, each blind the same way

**Status:** OPEN (2026-07-26, destruct-thumb-order whole-diff R19) · **Severity:** MEDIUM · **Class:** structural-guard fail-open

Structural guards across the suite strip comments before scanning source, and **17 files define their own `stripComments`** (`rg -l "function stripComments|const stripComments" tests/`). The common form is `src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")`, which lets **any** `/*` open a block span — including one inside a string or a path.

**Measured impact:** the JSDoc line `* Wraps every route under /admin/*` in `app/admin/layout.tsx` opens a span that runs to the next `*/` far below. All **six** live `className` sites in that file disappear from the scan, so any guard using that helper silently reports nothing for it. Verified: a dead `text-subtle` class planted at `app/admin/layout.tsx:191` was invisible to a scanner using the old helper and is caught by the fixed one.

**Fixed in `tests/styles/_classScanUtils.ts` only** (this PR), because that copy gained a new consumer. It is now line-based and refuses to open a multi-line block unless the opener starts its line or follows a JSX `{`. A self-test pins both directions in `tests/styles/_metaDoublePrefixColorToken.test.ts`. **The other 16 copies are untouched** — fixing them means re-running each guard against what it was previously blind to, and each may surface real pre-existing violations that need their own triage. Doing that inside an unrelated PR would bury them.

**Fix shape:** promote the corrected implementation to one shared module, migrate the 16 callers one at a time, and triage whatever each newly sees. Expect real findings: fixing the shared copy here immediately surfaced two apparent violations (both turned out to be artifacts of an incomplete first fix, which is itself a warning that this needs care, not a bulk sed). **Trigger:** any new structural guard that scans source, or any guard suspected of under-reporting.

## BL-E2E-LIFECYCLE-SPECS-CI-DARK — admin-lifecycle e2e specs are matched by playwright projects but invoked by no workflow

**Status:** OPEN · **Severity:** MEDIUM (dark regression coverage) · **Class:** CI wiring — surfaced by the archive-row-menu-idiom spec R11 adversarial round (2026-07-24).

**PARTIAL 2026-07-26 (PR2 of the CI-dark coverage cluster).** The umbrella shrank substantially: 30 allowlist rows citing this item are gone, because `standalone-e2e.yml` now runs the whole standalone config unfiltered on every PR. 60 rows remain, all app-dependent specs that need a dev server and a seeded database — deliberately out of the cluster's ratified scope. `admin-lifecycle-transitions` specifically is PR4's subject and stays open here until it reaches five consecutive greens.

`tests/e2e/admin-lifecycle-layout.spec.ts` and `tests/e2e/admin-lifecycle-transitions.spec.ts` appear in the `mobile-safari` project `testMatch` (`playwright.config.ts`), but every e2e workflow runs an explicit spec list and none names them — they run nowhere in CI. The archive-row-menu-idiom branch wires the LAYOUT spec (new `lifecycle-layout-e2e.yml`, since it carries that feature's load-bearing assertions); the TRANSITIONS spec remains dark. **Fix (when prioritized):** add `admin-lifecycle-transitions.spec.ts` to the same workflow (or its own) after fixing its local flake class — the 2026-07-24 flake audit (archive-row branch) measured: static source-guard red since 2026-07-20 (fixed on that branch via the ArchiveShowButton transition-opacity carve-out mirroring PublishedToggle's), plus 3 pre-hydration click-swallow failures (hub kebab open x2, published toggle x1) whose failing cases move between runs; the layout spec's toPass hydration-retry is the template. The structural guard for the class (workflow-coverage meta-test with a reasoned allowlist) SHIPPED with the archive-row-menu-idiom branch (spec §6 item 6); un-wiring work here is now just moving this spec off that allowlist by adding it to a workflow. Related owner decision (R18), **corrected 2026-07-26**: the claim that branch protection requires only the `quality` context is STALE — measured, the live required set holds TWELVE contexts. The e2e jobs are advisory not because one context is required, but because none of them is in that set. Promoting e2e jobs into it so a red e2e blocks merge at the GitHub layer remains an owner GitHub-settings action, not repo code; until then enforcement is the pipeline's all-checks-green procedural gate. Measurement: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §2.5.

**New instance observed 2026-07-26** (destruct-thumb-order PR #604): the LAYOUT spec — the one this row records as stabilized by the `toPass` hydration retry — failed once in `lifecycle-layout-e2e` on `mobile-safari`, at the archive-confirm popover assertions (`tests/e2e/admin-lifecycle-layout.spec.ts:411` `scrollIntoView(confirm) must have been called`, and `:538` armed body within the clip rect), 24 passed / 1 failed. Confirmed a flake, not a regression: the failing commit touched only `tests/e2e/pendingDiscardReal.layout.spec.ts`, which that workflow does not run, the two commits before it passed, and a re-run of the identical tree went green. So the hydration retry does NOT cover the popover-placement path — the growth-then-replace measurement takes a fixed `waitForTimeout(300)` rather than retrying to a condition, which is the likely remaining gap. **Fix shape:** replace that fixed wait with a `toPass` block around the armed measurement, same template as the rest of the spec.

## BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP — no-op repeat archive emits a duplicate SHOW_ARCHIVED event

**Status:** OPEN · **Severity:** LOW (forensic telemetry cosmetics) · **Class:** idempotent-no-op observability — surfaced by the archive-row-menu-idiom spec R15 adversarial round (2026-07-24).

`archive_show` is an under-lock idempotent no-op when the show is already archived (`supabase/migrations/20260601000000_b2_show_lifecycle.sql:73-74`), but `archiveShowAction` (`app/admin/show/[slug]/_actions/archive.ts`) treats that no-op as committed success and emits `SHOW_ARCHIVED` again — a repeat submit inside the committed-refreshing window (or from a stale tab) writes a duplicate forensic event for a transition that did not occur. Pre-existing on all variants. **Fix (when prioritized):** have the RPC return a performed/no-op discriminator and emit `SHOW_ARCHIVED` only on the actual false→true transition; add a repeat-submit test asserting single emission.

## BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE — realtime invalidation can swap Archive→Unarchive while the archive form is still pending

**Status:** OPEN · **Severity:** MEDIUM (destructive-control race; needs probe before design) · **Class:** cross-surface lifecycle race — surfaced by the archive-row-menu-idiom spec R15 adversarial round (2026-07-24); inferred from code paths, NOT yet empirically probed.

Scenario: the archive RPC's show invalidation publishes before the server action finishes post-RPC work; the mounted realtime bridge refreshes `archived` props while `useFormStatus` is still pending; ShareHub swaps Archive for Unarchive; ArchiveShowButton's unmount cleanup releases the busy gate; a fast next tap could fire Unarchive while the original action is still settling (server-side advisory lock serializes actual mutations, so the exposure is UX/telemetry, not data corruption). Shared with the legacy variants; untouched by the row restyle. **Fix (when prioritized):** run the mandated empirical race probe (invalidation arriving before action completion), then ratify one of: retain pending UI across the swap, close the hub on the archived flip, or disable the replacement lifecycle control until settlement.

## BL-RESOLVE-INTENT-WRONG-VERB — two event-shaped alerts render "Mark resolved" where "Confirm" is correct

**Status:** OPEN · **Severity:** LOW (copy defect, no functional impact) · **Class:** admin copy / lifecycle contract

`SHOW_FIRST_PUBLISHED` ("<sheet> is now live for crew…") and `PICKER_EPOCH_RESET` (whose own help text reads "Nothing to fix; this is a record of the reset") are both recorded as `intent: "resolve"` in `RESOLVE_INTENTS` (`lib/adminAlerts/resolveActionLabel.ts:58`, `:60`), so their button reads "Mark resolved". By the module's own rule (`lib/adminAlerts/resolveActionLabel.ts:9-12`) both are `confirm`: a deliberate thing that already happened, not a fault to clear. Visible in the notification bell; both codes are excluded from the per-show attention index, so the show modal is unaffected.

**Why it was not fixed in the attention-index change (2026-07-24).** `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` defense 5c reads the intent baseline from **`origin/main`** and asserts every historical `(code, intent)` pair still resolves identically (`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:118-124`). Both codes are `resolve` in that baseline (19 rows). Updating the in-tree baseline and the approved-confirm list does not satisfy the gate, because it compares against main's copy. Intent is append-only by design, and the test states the rationale: "rows already in admin_alerts still render it" — a persisted alert row resolves its label at render time, so flipping an intent retroactively relabels every open row of that code.

**What fixing it requires.** A ratified amendment to the append-only contract, deciding that a retroactive relabel is acceptable when the original intent was simply wrong, plus the mechanism to express that (an exception list the history gate honours, or a versioned baseline). That is a contract change with its own blast radius, not a copy edit. Analysis recorded in `docs/superpowers/specs/2026-07-24-attention-index-consolidation.md` §2.6.

## BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL — a later inline reservation group carrying its own hotel is silently clobbered by inheritance

**Status:** OPEN · **Severity:** MEDIUM (silent wrong hotel on a crew page) · **Class:** parser inline multi-group — surfaced by hotel-ambiguity-coverage whole-diff R1 finding 4 (2026-07-25); disposition ratified 2026-07-26.

`buildInlineReservations` assigns group 0's `baseName` to every row of a multi-group inline cell (`lib/parser/blocks/hotels.ts`, "later groups carry only a divider + guest, not the hotel"). Probe-verified: `Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1 Check Out: 3/2 Marriott Downtown 200 Oak Ave Jane Doe - 1002 Check In: 3/3 Check Out: 3/4` parses reservation 1's hotel as the INHERITED `Hyatt Regency…` — `Marriott Downtown 200 Oak Ave` vanishes. Pre-existing on main; the ambiguity-warning feature deliberately does NOT warn on later groups (spec §3.1 row 7 is unconditional), and three successive output-derived carve-outs (group index guard, leading-divider run, residual-word check) were each probe-verified wrong in both directions before the class was closed per `docs/agents/writing-plans.md:19`. The cell is not dark: reservation 0 of the same cell fires `HOTEL_GUEST_SPLIT_AMBIGUOUS`, pointing the operator at the line. **Fix (when prioritized):** the signal must come from the raw FRAGMENT (`splitInlineReservationGroups` output) BEFORE `buildInlineHotel` parses it — never from parsed output, which is the class that failed three reviews. A fragment-level hotel detector is itself a judgment, so it likely lands as a new ambiguity code with its own spec round, not a patch.
