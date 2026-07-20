# Plan — Show Alert Compact

**Spec:** `docs/superpowers/specs/2026-07-20-show-alert-compact.md` (canonical; §-references below point there).
**Branch:** `feat/show-alert-compact` (worktree `../FX-worktrees/show-alert-compact`).
**Implementer:** Opus / Claude Code — UI work is always Opus per AGENTS.md routing.
**Mode:** autonomous ship (user approved 2026-07-20 00:55 CDT); both user-review gates waived.

## 0. Pre-draft verification (DONE at plan time, not deferred)

Every file, symbol, and registry named below was verified against the live checkout while drafting. Findings that changed the plan:

| Check | Result |
|-------|--------|
| `vitest.projects.ts` line 20 `BASE_INCLUDE` = `["tests/**/*.test.ts", "tests/**/*.test.tsx"]` | Any new unit test under `tests/` is auto-included; NO testMatch edit needed. |
| Affordance-matrix parity gate matches a LITERAL testid (`tests/help/_metaAffordanceMatrixParity.test.ts` line 90) and requires each concrete id to occur exactly once (same file, lines 100-116) | Per-item popovers must use exemption comments + ONE template-family row, never concrete rows (spec §10). |
| `tests/help/_affordance-matrix-shape.test.ts` lines 75-79 bans concrete parse-warning testids | Confirms the same route. |
| `tests/components/admin/dataGapsTransitionAudit.test.tsx` line 147 pins `/\{a\.dataGaps \? \(/` | Must change in the same commit as the AttentionBanner guard tightening (Task 5). |
| `tests/components/admin/class-sweep-now-utility.test.ts` lines 126-133 forbids `Date.now(` / `new Date()` in AttentionBanner | Binds Task 5; no test edit. |
| `tests/components/admin/transitionAudit.test.tsx` line 41 already lists AttentionBanner | Task 9 adds three more paths. |
| `components/admin/telemetry/HealthAlertResolveButton.tsx` line 19 has pending but no error state | Task 7 asserts only the states that exist. |
| Repo has ZERO `toBeVisible()` usages and loads no CSS in jsdom (`vitest.config.ts` line 61) | Unit tests assert `aria-expanded` + `hidden` class; real visibility only in Playwright (spec §9.1). |
| `PerShowActionableWarnings` consumers | `components/admin/showpage/sectionWarningExtras.tsx` lines 101 and 146, `components/admin/StagedReviewCard.tsx` line 521, `BulkIgnoreControls.tsx` (slot pass-through), `app/admin/show/staged/[stagedId]/page.tsx` line 172. |
| `AttentionBanner` call site | `components/admin/showpage/PublishedReviewModal.tsx` line 294 (`bannerFor` helper). |

Snippet typecheck: every code block below was written against the repo's strict tsconfig conventions (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Optional props are passed conditionally via spread (`...(x ? { prop: x } : {})`), never as `prop={undefined}`.

## 1. Meta-test inventory (declared up front)

CREATES: none.
EXTENDS: `transitionAudit.test.tsx` (3 paths), `dataGapsTransitionAudit.test.tsx` (regex), `app/help/_affordanceMatrix.ts` (1 template-family row + comment rewrite).
SATISFIED BY EXEMPTION: `_metaAffordanceMatrixParity.test.ts` (2 call-site comments).
CONSTRAINS (no edit): `class-sweep-now-utility.test.ts`, `status-token-contrast.test.ts`.
MUST NOT EDIT: `_metaInlineIdentityContract.test.ts`, `_metaAdminAlertCatalog.test.ts`.

## 2. Task list

Each task is TDD: failing test -> minimal implementation -> passing test -> commit. Commit format `<type>(<scope>): <summary>`, scope `admin`.

**Two ordering rules, added after plan review R1 (findings 1-5, 3 of them BLOCKING):**

1. **Registry atomicity.** A source-scanning gate and the code it scans move in the SAME commit. A `<HoverHelp>` call site therefore ships together with its exemption comment; a component ships together with its row in the motion-free scanner list. No commit boundary may leave a gate red. The original plan deferred both to trailing tasks (old Tasks 8 and 9); those tasks are dissolved into the tasks that create the code.
2. **Red phase for structural and browser assertions.** A scanner row or layout assertion written after its code passes on first run, which proves nothing. Every such assertion is demonstrated red by a scratch MUTATION of the code it governs (delete the class, drop the row, revert the guard), observed failing, then the mutation reverted before commit. The observed failure output is quoted in the commit body. This is the honest substitute for a red phase when the code necessarily precedes the pin.

Tasks 1 and 2 are already committed (`ebda208c4`, `05f4b4e64`); their gaps from review findings 9 and 10 are repaired in Task 2b.

---

### Task 2b - shell defaults, warning-stripe pass-through, and message-row gaps

Repairs review findings 9 and 10 against the already-committed shell.

**Test first:** omitted `tone` defaults to `warning` (glyph present, amber skin); omitted `stripe` defaults to `review`; warning tone honors each of `review`, `degraded`, AND `none` (the `none` case is what PerShowActionableWarnings depends on in Task 6); absent `helpTrigger` renders no trigger wrapper element at all, not merely no trigger content; the `!` glyph carries `aria-hidden="true"` (review finding 20 - the glyph must never reach the accessibility tree).

**Commit:** `test(admin): pin CompactAlertCard defaults, stripe pass-through, and glyph aria-hidden`

---

### Task 3 - `HoverHelp` Escape containment

**Test first** (new file `tests/components/admin/hoverHelpEscapeContainment.test.tsx (new)`): render a `HoverHelp` inside a real `ReviewModalShell`, open the popover, dispatch Escape from inside it. Assert BOTH that the popover closed AND that the shell's close callback was NOT called. Regression pair: with the popover CLOSED, Escape reaches the shell and it closes normally.

Do NOT assert `defaultPrevented` - the shell ignores it (`components/admin/review/ReviewModalShell.tsx` lines 239-245), so that assertion proves nothing. A synthetic-parent-handler spy is likewise insufficient; the `document`-level native listener is the boundary under test.

**Implement:** element-level `onKeyDown` on the HoverHelp root per spec section 3.2 (`preventDefault` + `stopPropagation` + close, only while open).

**Commit:** `fix(admin): contain HoverHelp Escape so it never closes the host modal`

---

### Task 4 - amber `?` trigger + help-body helper

**Location and signature, specified** (review finding 8): both live in `components/admin/compactAlertHelp.tsx (new)`.

```ts
export function buildHelpPopoverBody(input: {
  helpfulContext: string | null | undefined;
  helpHref: string | null | undefined;
  route: string;
}): { body: ReactNode; learnMore?: { href: string } } | null;
```

Returns `null` when there is nothing to show. `learnMore` is included only when `helpHref` is non-empty after trim AND `shouldEmitLearnMore` passes for `route`; it is omitted entirely (never `undefined`) to satisfy `exactOptionalPropertyTypes`. With a Learn-more link but no `helpfulContext`, `body` is the exact string `"More about this alert in the help pages."`.

**Test first:** all four presence combinations; whitespace-only `helpfulContext` and `helpHref` both count as absent; the route gate exercised passing AND failing with the same non-empty `helpHref`; the helpHref-only lead-in text asserted VERBATIM against the string above, not by substring sniffing; and the returned `learnMore.href` equals the input href.

Trigger tests (review finding 7): render the trigger through `HoverHelp` and assert it is a `<button>`, carries `min-h-tap-min min-w-tap-min`, the focus-ring classes, and an accessible name of `"What does this mean?"`; and that clicking it flips `aria-expanded` false -> true. Popover state is asserted via `aria-expanded` and the body's `hidden` class per spec section 9.1 - never `toBeVisible()`, which is vacuous in this repo's CSS-less jsdom.

**Commit:** `feat(admin): amber help trigger and route-gated popover body helper`

---

### Task 5 - AttentionBanner adapter

**Test first:** update `tests/components/admin/review/attentionBanner.test.tsx` - remove identity assertions and the `underCrewRow` prop; add, each with its concrete failure mode:

- invalid item / missing `alert` -> null;
- null, empty, and whitespace `template` -> fallback;
- **a non-empty template whose emphasis rendering yields no visible text -> fallback** (review finding 11: an implementation guarding only the input string renders an empty message row and would otherwise pass);
- null `action` -> time alone, no leading separator;
- `failedKeys` null / `[]` / all-whitespace -> no entry;
- **exactly 6 surviving keys -> all six shown with NO `+N more` suffix**, and 7 keys -> six plus `+1 more` (review finding 13: catches off-by-one and `+0 more`);
- `dataGaps` null, `total: 0`, `total: NaN`, **`total: -1`, and `total: Infinity`** -> no entry (review finding 12: "nonzero and not NaN" would pass the old set while rendering negatives and infinities);
- whitespace-only `autoClearNote` -> resolve button, not note;
- stripe `review` vs `degraded` from `item.tone`;
- trigger across all four help combinations with the route gate exercised both ways;
- **preserved DOM contracts asserted explicitly** (review finding 21): `data-attention-anchor`, `aria-current` when highlighted, and the dynamic resolve/autoclear/failed-sources/data-gaps testids - a wholesale rewrite can drop these while every behavioral test stays green;
- Ep -> Rp -> C retry path.

**Implement:** rewrite onto `CompactAlertCard`. Delete the identity sub-line, the `INLINE_IDENTITY_CODES` import, the `underCrewRow` prop and its use at `components/admin/showpage/PublishedReviewModal.tsx` line 294, and the freestanding Learn-more link. Keep `now: Date` as a prop; never read the clock (`class-sweep-now-utility` constraint).

**In the SAME commit** (registry atomicity): the `// not-a-help-affordance:` exemption comment above this call site, and the updated pinned regex in `tests/components/admin/dataGapsTransitionAudit.test.tsx` line 147, and this component's path is already in the motion-free scanner list.

**Red-phase evidence:** the dataGaps regex update is demonstrated red by first running the scanner against the tightened guard without updating the pin; the failure is quoted in the commit body.

**Commit:** `refactor(admin): AttentionBanner onto the compact card`

---

### Task 6 - PerShowActionableWarnings adapter

**Test first:**

- `sourceCell` present with NULL `driveFileId` -> no link (catches branching on `sourceCell` rather than on the built href);
- controls land in `controlsBand`, asserted via the controls node's ancestor band (catches the A1 regression of a full control cluster in the footer);
- **the adapter passes `stripe="none"` on the WARNING tone path** (review finding 14: the muted path proves nothing here, since muted forces `none` inside the shell; omitting the prop on the warning path would silently produce the shell's default review stripe);
- no link and no controls -> no footer bar;
- `renderItemControls` absent, and present-but-returning-null -> no controls band;
- all-empty title chain -> `"Data quality issue"`;
- row-label suppression across null, empty, whitespace, and non-`UNKNOWN_FIELD`;
- muted tone skin; key stability untouched.

**In the SAME commit:** this call site's exemption comment, and this component's path added to the motion-free scanner list in `tests/components/admin/transitionAudit.test.tsx`.

**Red-phase evidence:** the scanner row is demonstrated red by a scratch mutation adding a motion class to the component; failure quoted in the commit body.

**Commit:** `refactor(admin): per-show actionable warnings onto the compact card`

---

### Task 7 - HealthAlertsPanel adapter

**Test first:**

- `neutral` tone with NO stripe and NO glyph; the weight badge still distinguishes degraded from notice (catches severity migrating onto the container, which A5 forbids);
- **footer-right branch coverage** (review finding 16): `isAutoResolving` true -> italic auto-resolve note and NO resolve button; false -> the resolve button; plus the button's pending state (it has no error state - `components/admin/telemetry/HealthAlertResolveButton.tsx` line 19);
- separator interleaving across every link-presence combination, including `show_id` XOR `slug` -> no View-show link;
- `occurrence_count` 0 / 1 / 2 / negative / non-finite;
- **detail/follow-up templates exercised INDEPENDENTLY for empty and whitespace-only**, and **sentence entries asserted to precede Identity and Seen** (review finding 17: blank sentence rows or reordered content would otherwise pass);
- all four detail inputs absent -> no band.

**In the SAME commit:** this component's path added to the motion-free scanner list, with the same scratch-mutation red-phase evidence.

**Commit:** `refactor(admin): health alert rows onto the compact card`

---

### Task 8 - affordance-matrix template-family row

Exemption comments already shipped with their call sites in Tasks 5 and 6 (registry atomicity), so no commit boundary was ever red. This task registers the family row.

**Test first, with a real red phase** (review finding 2): extend `tests/help/_affordance-matrix-shape.test.ts` with an assertion that a template-family row exists whose `testidPattern` covers the per-item help popover, AND that the concrete-row count is unchanged. Run it BEFORE adding the row and observe it fail; quote the failure in the commit body.

**Implement:** one `template-family` row in `app/help/_affordanceMatrix.ts` (shape at lines 19-27), and rewrite the stale comment at lines 105-112 that claims per-alert education is a freestanding `helpHref` link.

**Commit:** `test(admin): register the per-item help popover as a template-family affordance`

---

### Task 9 - compound transition tests

Repairs review finding 4: the source-scanning audit cannot prove compound behavior, and the project rule requires compound-transition tests.

**Test first** (`tests/components/admin/compactAlertCompoundTransitions.test.tsx (new)`), behavioral, not source-scanning:

- popover open, then resolve clicked -> the request proceeds AND the popover is unaffected until the confirmed swap (catches shared state that closes the popover on unrelated activity);
- popover open across `Rp -> Ep` -> the popover stays open and the inline error renders;
- popover open across `Ep -> Rp` retry -> still open;
- popover open at `Rp -> C` -> the whole body swaps and both trigger and popover unmount, with the anchor still mounted (R11);
- popover toggled closed while a request is in flight -> the request is unaffected.

**Commit:** `test(admin): compound popover-and-resolve transitions on the compact card`

---

### Task 10 - real-browser layout assertions

**File and CI wiring, named concretely** (review finding 6): `tests/e2e/compact-alert-card-layout.spec.ts (new)`, matched by the existing `tests/e2e/**` Playwright project. The workflow path filter is verified by grepping the admin-layout workflow for its `tests/e2e` glob in this same task; if the glob does not already cover the new file, the filter is amended in this commit and the amendment is stated in the PR body.

**Assertions, each with a stated observable** (review findings 18, 19, 20):

- **Footer containment:** every DESCENDANT element of the footer bar has a `getBoundingClientRect()` within the bar's BORDER BOX, minus its computed `padding-left`/`padding-right` read via `getComputedStyle` - the border-box-versus-content-box distinction is stated explicitly rather than assumed.
- **Truncation is load-bearing:** `scrollWidth > clientWidth` on the long label element (ancestor clipping cannot satisfy this, whereas pure containment can).
- **Wrapping:** measured as the footer bar's height exceeding a single line-box height, and the left cluster's `getBoundingClientRect().top` differing from the right cluster's - stated so "two lines" is unambiguous.
- **Popover not clipped:** proven by HIT TESTING, not geometry - `document.elementFromPoint` at the popover body's centre returns the body or a descendant of it. Bounding rectangles cannot reveal clipping (the spec says so itself), so geometry alone is not used for this claim.
- **Tap targets:** the help trigger AND every footer link measured at >= 44x44 (review finding 20 - footer links carry the same requirement).
- **Message-row containment:** with a long unbroken token as the message, the help trigger's rect stays inside the card (proves `min-w-0`).

**Red-phase evidence:** each assertion is demonstrated red by a scratch mutation of the class it governs (`ml-auto`, `min-w-0`, `truncate`, `min-h-tap-min`), observed failing, then reverted. Failures quoted in the commit body.

**Commit:** `test(admin): real-browser layout assertions for the compact alert card`

---

### Task 11 - impeccable dual gate

Before running, apply the pre-code mechanical checklist: em-dash ban in user-visible copy, straight apostrophes, `min-h-tap-min` on interactives, canonical `text-xs/relaxed` and `text-subtle` classes.

Run `/impeccable critique` and `/impeccable audit` on the diff. P0 and P1 findings fixed, or explicitly deferred via a `DEFERRED.md` entry.

**Close-out record is unconditional** (review finding 22): `docs/superpowers/plans/2026-07-20-show-alert-compact/01-closeout.md (new)` records both gate runs, every finding with its disposition, and the review-round history. It is committed EVEN IF the gates surface nothing - a clean run is a result worth recording, and the previous plan made this commit conditional.

**Commits:** `fix(admin): impeccable gate findings on the compact alert card` (only if code findings) and `docs(plan): show-alert-compact close-out record` (always).

---

### Task 12 - ship

Full suite, typecheck, eslint, `format:check`. Whole-diff cross-model review using the inlined variant (tool-using codex dispatches have died 18 times on this repo today; the inlined form is what works). Push, real CI green, `gh pr merge --merge`, fast-forward local main until `git rev-list --left-right --count main...origin/main` reports `0  0`.

## 3. Risks

| Risk | Mitigation |
|------|-----------|
| A registry gate goes red at a commit boundary | Ordering rule 1: gate and code move together; old Tasks 8 and 9 dissolved into Tasks 5-7 |
| A structural or browser assertion passes on first run and proves nothing | Ordering rule 2: scratch-mutation red phase with the failure quoted in the commit body |
| Affordance-matrix registration breaks three assertions if done as a concrete row | Task 8 pins the count-unchanged assertion; spec section 10 explains the route |
| Controls band regresses into the footer | Task 6 asserts the ancestor band, not mere presence |
| Compound popover-and-resolve behavior unprovable by source scanning | Task 9 is behavioral |
| Popover clipping inside the review modal | Descoped (A6), residual filed as `BL-HOVERHELP-PORTAL`; Task 10 proves the card-level claim by hit testing rather than geometry |
| jsdom visibility assertions silently vacuous | Spec section 9.1 rules; Playwright owns real visibility |
