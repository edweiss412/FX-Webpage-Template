# /help/errors RefAnchor whole-surface a11y pass

**Date:** 2026-08-15 · **Authoring branch:** `docs/help-refanchor-a11y-spec` · **Implementation branch:** `fix/help-refanchor-a11y` · **Entry:** `BL-HELP-REFANCHOR-A11Y-PASS` (BACKLOG.md) · **Status:** DRAFT

## §0 Why this arc exists, and its baseline

`RefAnchor` (`app/help/_components/RefAnchor.tsx`) renders the copy-link affordance beside every catalog entry on `/help/errors`. It is ONE shared component; the errors page renders it once per renderable catalog entry (`app/help/errors/page.tsx:85`, `<RefAnchor id={entry.code} as="h3">`), plus one default-`as` call site at `app/help/admin/parse-warnings/page.mdx:12`. Probed at authoring (2026-08-15, `tsx` against the live catalog through the page's own `predicate` from `lib/messages/catalogDocsValidator.ts:6`, imported at `app/help/errors/page.tsx:30`): **219 renderable entries of 281 total** — the entry's "~217" has drifted by ordinary catalog growth; nothing in this spec depends on the literal. (All line numbers in this spec are drafting-time locators per the citation rule; the durable anchor is file + symbol.)

The ledger entry records three findings, each repairable once in the shared component or once on the page:

1. **All copy-links share one accessible name.** `aria-label="Copy link to this section"` is a static string (`app/help/_components/RefAnchor.tsx:80`, the `<a>` inside the heading), so a screen-reader user hears the same label 219 times with nothing saying which code each copies.
2. **Copy has no perceivable confirmation.** `handleCopyClick` fires `navigator.clipboard?.writeText?.(url)` and discards the result (`app/help/_components/RefAnchor.tsx:65-72`); no state changes, nothing is announced, and no `role=` attribute exists anywhere in the file (probed: `rg -n 'role=' app/help/_components/RefAnchor.tsx` → 0 hits).
3. **219 tab stops precede the footer report CTA.** Keyboard-only users traverse every copy-link to reach `HelpReportCta` (`app/help/errors/page.tsx:110`) at the page foot.

Reachability re-verified at authoring: `pnpm exec vitest run tests/help` is green — **61 files / 666 tests** (the entry's 642 has drifted the same way) — while asserting none of the three; grep for the current label found pins only in `tests/help/ref-anchor.test.tsx` (two `getByRole("link", { name: /copy link to this section/i })` sites). The suite passing is therefore not evidence against any finding, and the plan's tests must each fail on the shipped tree for the stated reason (§3).

## §1.1 Resolved scope — do not relitigate

1. **Copy-links STAY in the tab order** — pre-ratified by the user (Eric), 2026-08-15, in the G4 smalls-batch scope brief (an out-of-repo launch brief; this §1.1 row is the in-repo capture of record). They are real controls; removing them from the tab order harms keyboard users. The remedy for the 219 stops is the §2.3 skip path, not `tabindex="-1"` on the links.
2. **`VALID_ID` is not widened.** The D.5 catalog-vs-chapter contract (`app/help/_components/RefAnchor.tsx:11-29` header comment, "do not widen `VALID_ID` further"; the `VALID_ID` regex at `app/help/_components/RefAnchor.tsx:5`) stands untouched. This arc changes labeling and announcement, never the id contract.
3. **`HelpReportCta`'s fragment pass-through stands.** Captured fragments are best-effort context passed through unvalidated (`docs/superpowers/specs/2026-08-09-help-report-surface-design.md:112`, documented limit 3: "family anchors (e.g. `#sync`) pass through unvalidated"; the shape gate is `FRAGMENT_SHAPE` at `app/help/errors/_components/HelpReportCta.tsx:41`). The §2.3 skip link adds one more non-code fragment to that already-shipped class — the layout's own skip-to-content link (`app/help/layout.tsx:50-55`, `href="#main"`) already does exactly this on this page. No change to `HelpReportCta`.
4. **Confirmation is screen-reader-only; no new visible state ships.** Ratified here (this spec's call, within the entry's scope): the announcement is an sr-only status region. No icon swap, no tooltip, no visible "Copied" flash — so no new visual state, no transition work, no screenshot delta. Widening to a visible confirmation is a future entry, not drift (§4 limit 2).
5. **The skip-path mechanism is this spec's call** (the scope brief delegates the exact mechanism to this spec) and is made in §2.3: an in-page skip link before the jump-list nav targeting a `tabIndex={-1}` wrapper around the existing report Callout. Alternatives considered and rejected in §2.3.
6. **No §12.4 code is minted.** "Link copied" is success copy, the same class as `COMPLETE_COPY` (`components/admin/FinalizeButton.tsx:536-545`, the `not-subject:M5-D8` block above it): there is no error, and putting a non-error in the error catalog to satisfy a name pattern is the documented anti-pattern. Invariant 5 (no raw error codes in UI) is not in play — nothing here renders an error.

## §2 The three repairs

### §2.1 Per-entry accessible name

`aria-label` becomes a template composed from the entry's code: `` aria-label={`Copy link to ${id}`} `` — e.g. "Copy link to SYNC_DELAYED_SEVERE". Rationale for composing from `id` rather than `children`: `id` IS the catalog code (enforced by `VALID_ID`), it is the thing the link copies a deep-link to, and it is a string by contract; `children` is a `ReactNode` with no reliable text form. Codes are unique per page render (the errors page maps over catalog entries keyed by `entry.code`, and object keys are unique), so every accessible name on the page is distinct.

Guard conditions: `id` is already validated before render — an invalid id throws (`app/help/_components/RefAnchor.tsx:43-47`, the `VALID_ID` throw), so the label composition never sees null/empty/garbage. No new guard needed; the spec states this so the plan does not invent one.

Lockstep (class-sweep at round 0): the two name-regex pins in `tests/help/ref-anchor.test.tsx` (the `copy link to this section` matchers) update in the same commit. Authoring-time grep found no other pin of the old label anywhere in `tests/`, `app/`, or `components/`; the implementer re-runs `rg -in "copy link to this section" app components tests` before the commit and updates any hit.

### §2.2 Perceivable copy confirmation

**Region shape (lawful shape 1 of the live-region guard).** `RefAnchor`'s root becomes a fragment: the heading as today, followed by a sibling sr-only status region rendered UNCONDITIONALLY:

- `<span className="sr-only" role="status" aria-live="polite">{announcement}</span>` — the `FinalizeAnnouncer` pattern (`components/admin/FinalizeButton.tsx:547-553`): a stable region whose TEXT mutates, never a region inserted with its text. This is exactly what `tests/components/_metaLiveRegionMounting.test.ts` enforces (its walk covers `app/` — `ROOTS` at `tests/components/_metaLiveRegionMounting.test.ts:34` — so the new region is inside the guard's jurisdiction by default — no exemption row, the region must simply be unconditional).
- The region sits OUTSIDE the heading element, as its following sibling. Inside the heading it would join the heading's computed name and pollute heading navigation with transient text. Styling-safe: `.help-prose` uses direct-child and descendant combinators only (`app/globals.css:1171-1330` region) — no adjacent-sibling selectors — so a new sr-only sibling between a heading and its paragraph changes nothing visually.
- Per-instance regions (219 on the errors page) are correct here: each region is born empty and silent; only the one whose control was activated ever mutates. The component's owner outlives the success it announces (nothing unmounts on copy), which is precisely the case shape 1 exists for. The `UndoAnnounceContext` channel (shape 2) is for owners that do NOT outlive the announcement and is not needed.

**Announcement lifecycle.** Component state `announcement: string`, initially `""`:

- On click, the existing URL composition runs unchanged. If `navigator.clipboard?.writeText` exists, the promise it returns is observed: **on resolve**, set `announcement` to `"Link copied"` and start a clear timer (~2000 ms) that resets it to `""`; a new copy before the timer fires clears and restarts it. **On reject, or when the clipboard API is absent**, the region stays empty — announcing "Link copied" for a write that did not happen would be silently wrong; the default `<a href>` fragment navigation still fires either way. The no-`preventDefault` contract (`app/help/_components/RefAnchor.tsx:60-64` comment: fragment navigation and middle-click open-in-new-tab must survive) is load-bearing on EVERY branch — success, reject, and API-absent — and §3 requires an executable `defaultPrevented === false` proof on each, because an implementation that swallowed the event would pass a region-text-only test while leaving keyboard users with neither confirmation nor navigation.
- The timer is cleaned up on unmount (no set-state-after-unmount).
- Copy string: `Link copied` — sentence-case, no em dash, no code interpolation (the user just activated a control whose accessible name names the code; repeating it is noise). It is success copy, not error copy (§1.1 item 6); the implementation avoids `const` names matching the M5-D8 patterns (`tests/messages/no-inline-error-strings.test.ts` — names ending `COPY`/`MESSAGE`/`ERROR`) or carries the `not-subject:M5-D8` annotation with the success-copy reason.

### §2.3 Skip path to the report CTA

**Mechanism (ratified here):** a chapter-standard in-page skip link plus a focusable target:

- **Link:** a plain server-rendered anchor in `app/help/errors/page.tsx`, placed immediately before the jump-list `<nav>` (`app/help/errors/page.tsx:63`) — the first focusable element the page fragment contributes. Visible text: `Skip to the report button` (matches the intro prose's "report button" vocabulary at `page.tsx:60`). Visually hidden until focused, using the same class recipe as the layout's skip-to-content link (`app/help/layout.tsx:50-55`, the `sr-only focus:not-sr-only focus:absolute … focus:min-h-tap-min …` chain) — that recipe already satisfies the 44 px tap floor (`min-h-tap-min`) and canonical tokens; the implementation copies it rather than inventing a variant.
- **Target:** the existing report Callout at the page foot (`app/help/errors/page.tsx:100-111`) gains a wrapper `<div id="report" tabIndex={-1}>` around the `<Callout type="note">…<HelpReportCta /></Callout>` block. `tabIndex={-1}` for the Safari/VoiceOver fragment-focus caveat the layout already documents on its `<main id="main" tabIndex={-1}>` element (`app/help/layout.tsx:60-62`). After the jump, the next Tab lands on the report button. `report` collides with nothing: family ids are `setup-drive`, `sign-in`, `syncing-sheets`, `crew-schedule`, `diagrams-reels`, `publishing-shows`, `admin-monitoring`, `other-errors` (`app/help/errors/_families.ts:18-129`), and catalog codes are SCREAMING_SNAKE by `VALID_ID`.
- **Fragment side effect, accepted:** activating the link sets `location.hash` to `#report`, so a report opened afterwards carries `helpCode: "report"` and attempt scope `help-errors-c-report`. This is the already-shipped best-effort-context class (§1.1 item 3): the layout's `#main` skip link and every family jump link produce non-code fragments on this page today, and the owning spec's backstop (required freeform message) covers it. Modal-open interactions are unaffected: the skip link is unreachable while the report dialog is open (`aria-modal` focus containment), so the `key={hash}` remount path cannot fire mid-attempt from this link.

**Rejected alternatives**, recorded so review does not re-derive them: (a) removing copy-links from the tab order — pre-ratified against (§1.1 item 1); (b) a client-side `onClick`/`preventDefault` focus handler to avoid the hash — buys a marginally cleaner report context at the cost of a third client island and a divergence from the shipped skip-link pattern, rejected as scope beyond an S; (c) excluding `report` inside `HelpReportCta` — relitigates that component's ratified pass-through contract (§1.1 item 3).

### §2.4 Mode boundaries

`RefAnchor` has two call-site modes, both changed identically by §2.1–§2.2: `as="h3"` per-code entries on `/help/errors` (219 instances) and default-`as` (h2) section headings (`app/help/admin/parse-warnings/page.mdx`, one instance — `<RefAnchor id="PARSE_ERROR_LAST_GOOD">`, no `as` prop). The aria-label composition and the announcement region ship in the shared component and behave the same in both. The §2.3 skip link and target are `/help/errors` page edits only — no other help page approaches this control density (the parse-warnings page renders one RefAnchor), so no skip path ships elsewhere.

### Dimensional Invariants

This arc introduces NO new fixed-dimension parent with flex or grid children. The copy-link keeps its existing `size-11` (44 px) box unchanged; the status region and skip link are sr-only until focused (the skip link's focused state renders the layout recipe's own box). If implementation introduces any fixed-dimension parent→child relationship after all, that task adds the relationship here plus a real-browser `getBoundingClientRect` assertion per the writing-plans layout-dimensions rule.

### Transition Inventory

New states are non-animated by design; §1.1 item 4 forbids new visible states.

| Transition | Treatment |
| --- | --- |
| Announcement region `""` → `"Link copied"` (successful copy) | Instant — no animation needed (sr-only; nothing visible changes) |
| Announcement region `"Link copied"` → `""` (clear timer, ~2000 ms) | Instant — no animation needed (sr-only) |
| Skip link unfocused → focused (`sr-only` → `not-sr-only`) | Instant — no animation needed (the layout's shipped skip-link behavior, reused verbatim) |
| Skip link focused → unfocused | Instant — no animation needed |
| Copy-link `md:opacity-0` ↔ hover/focus opacity | Pre-existing (`transition-opacity`), UNCHANGED by this arc |

Compound: copying link A then link B inside A's clear window mutates two independent regions — B announces normally; A's timer clears A's region silently. Copying the SAME link twice inside the window is a documented limit (§4 limit 3). No state here can be mid-transition in a way that composes with any other (all transitions are instant).

## §3 Test obligations (acceptance shape; the plan carries the task bodies)

Each test states the concrete failure mode it catches and fails on the shipped tree for that reason (anti-tautology rule; the entry's reachability note is binding):

1. **Distinct accessible names.** Render two `RefAnchor`s with different codes; assert each link's accessible name contains its own code and the two names differ. Fails today: both render "Copy link to this section". Production line whose defect makes it fail: the static literal `aria-label="Copy link to this section"` at `app/help/_components/RefAnchor.tsx:80`. Expected names derived from the fixture codes, never hardcoded page-wide counts.
2. **Announcement on successful copy.** With a mocked resolving `writeText`: assert the `role="status"` region EXISTS with `aria-live="polite"` and empty text BEFORE the click (the region-precedes-announcement half, the `BL-ANNOUNCE-REGION-UNMOUNT-CLASS` lesson), then after click + microtask flush its text is "Link copied". Fails today: no `role="status"` exists in the component at all (probed: `rg -n 'role=' app/help/_components/RefAnchor.tsx` → 0 hits).
3. **No false announcement, and the fallback survives every branch.** With `writeText` rejecting, and separately with `navigator.clipboard` undefined: region text stays `""` after click + flush. Catches: an implementation that announces on click rather than on resolve — "never silently wrong" applied to the announcement itself. **In BOTH failure cases AND the success case, assert the click event was NOT default-prevented** (dispatch a cancelable click and assert `defaultPrevented === false`, or equivalent): the spec's fallback claim — default fragment navigation survives — must be executable, because an implementation that called `preventDefault()` would pass every region-text assertion while leaving keyboard users with neither confirmation nor navigation (spec R1 finding 1).
4. **Clear timer, restart, and cleanup.** (a) After a successful copy, advancing fake timers past the clear window empties the region — catches a stale perpetual "Link copied" that re-reads on SR re-scan and blocks re-announcement. (b) A second successful copy mid-window restarts the window: advance partially, copy again, assert the region still announces after the partial advance and clears only a full window after the second copy — catches a fire-once timer that truncates the second announcement. (c) Unmount cleanup, proven by pending-timer count under fake timers (a console-error oracle is VACUOUS here — React no longer warns on set-state-after-unmount, probed in spec review R2: a deliberately leaked state-setting timer fired post-unmount with zero console errors): after a successful copy, assert the clear timer is actually scheduled (premise: `vi.getTimerCount()` returns 1 — without it the cleanup assertion has nothing to discriminate), then `unmount()` and assert `vi.getTimerCount()` returns 0 — an implementation without unmount cleanup leaves the count at 1 and fails by name (shipped precedent for the baseline/count oracle: `tests/api/reel-asset-route.test.ts`, its `vi.getTimerCount()` baseline pattern).
5. **Skip path.** Page-level render of `/help/errors`: an anchor with accessible name "Skip to the report button" and `href="#report"` exists BEFORE the first copy-link in DOM order; the element `id="report"` exists, carries `tabIndex={-1}`, and contains the report CTA. Fails today: no such anchor (probed: the only "report" tokens in `app/help/errors/page.tsx` are the Callout prose and the `HelpReportCta` mount). Premise (executable, `premise` from `tests/_shared/premise.ts:27`): the renderable-entry count exceeds 1 — below that the "219 stops" problem this guards is unreachable and the DOM-order assertion proves nothing.
6. **Structural, already-shipped, verified green rather than written:** `tests/components/_metaLiveRegionMounting.test.ts` must pass over the new region with NO new exemption row (proves the region is unconditional); the whole `tests/help` suite stays green (61 files at authoring).

Real-browser verification (tab order actually reaching the CTA via the skip link, focus landing on the wrapper) belongs to the implementation's impeccable audit pass (§6), not to a new e2e spec — an S-arc adds no Playwright surface.

## §4 Documented limits

1. **Copy failure is not announced.** When the clipboard write rejects or the API is absent, the region stays silent; the fallback remains the default fragment navigation (URL bar updates). Conservative silence plus a surviving affordance, not a wrong claim. Announcing failures would need failure copy with its own catalog/ratification questions — out of an S's scope.
2. **No visible confirmation ships** (§1.1 item 4). Sighted-user confirmation remains the browser's fragment navigation. Re-open trigger: operator or user feedback that the copy affordance feels dead.
3. **Repeat-copy of the same link inside the clear window may not re-announce** (identical text set twice is not a mutation). The ~2000 ms clear bounds the window. Not worth a re-announce toggle hack in an sr-only region.
4. **The skip-link fragment (`#report`) reaches report context as `helpCode: "report"`** — one more member of the shipped non-code-fragment class (`#main`, `#sync`); the report form's required freeform message is the backstop (owning spec's limit 3).
5. **The `as="h2"` chapter mode gains the same announcement region per instance** (one live site today). If a future chapter page renders hundreds of RefAnchors, the per-page skip-path question re-opens for that page; this spec settles `/help/errors` only.

## §5 Meta-test / registry inventory

- **CREATES:** no new meta-test. New unit coverage lands in `tests/help/ref-anchor.test.tsx` (component repairs) and the errors-page test family (skip path) — final file placement is the plan's call within `tests/help/`.
- **EXTENDS (by staying green, no edit):** `tests/components/_metaLiveRegionMounting.test.ts` covers the new region by its filesystem walk — the arc's obligation is shape conformance, not a registry row. `tests/help/anchor-resolver.test.ts`, deep-link walkers, `_metaUiLabelCrosswalk`, and the rest of `tests/help` must stay green.
- **Invariant-9/10 registries:** untouched — no Supabase call, no mutation surface (a client-side clipboard write is not a mutating HTTP route or server action; no `logAdminOutcome`/`code:` emit obligation attaches). Advisory locks: untouched. Source-mutation registry: no enrollment — the subject is a UI component, not a guard/proof surface the registry can express.
- **§12.4 lockstep:** does not fire (no catalog row is added or edited; §1.1 item 6).

## §6 Acceptance criteria

- **AC-1:** Every copy-link on `/help/errors` exposes a distinct accessible name containing its entry's code; the parse-warnings call site gets the same composition. The old shared label appears nowhere (source or test pins).
- **AC-2:** A successful copy is announced as "Link copied" through an unconditional sr-only `role="status" aria-live="polite"` region that exists before the announcement and never unmounts with the state change; failed or unavailable clipboard writes announce nothing; the click's default fragment navigation survives every branch, proven executably (`defaultPrevented === false` in the success, reject, and API-absent tests); the region self-clears (~2000 ms) with restart-on-recopy and unmount cleanup; `_metaLiveRegionMounting` passes with no new exemption.
- **AC-3:** `/help/errors` carries a skip link ("Skip to the report button", `href="#report"`, layout skip-link recipe, ≥44 px focused tap target) as the first focusable element the page contributes, targeting a `tabIndex={-1}` wrapper around the report Callout; copy-links remain in the tab order.
- **AC-4:** the test obligations of §3 land red-then-green per invariant 1, each failing on the shipped tree for its stated reason; `pnpm exec vitest run tests/help` and `pnpm vitest run tests/components/_metaLiveRegionMounting.test.ts` green at close.
- **AC-5:** Process — worktree-only (invariant 11); claim marker per invariant 12 rides `fix/help-refanchor-a11y` and strips in the PR's last pre-merge commit as the entry archives; conventional commits; impeccable dual gate per §7 with the closeout marker line.

## §7 Impeccable gate

The diff touches `app/help/**` — an invariant-8 UI surface. The implementation runs the impeccable v3 dual gate (critique + audit, canonical setup gates: the skill's context load of PRODUCT.md + DESIGN.md, then the register reference read) on the affected diff before merge; P0/P1 findings fixed or `DEFERRED.md`-entried; the closeout carries the machine-checkable marker line per the invariant-8 grammar (`impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>`, the `RAN_FORM` regex at `tests/docs/_invariant8Closeout.ts:44`, enforced by `tests/docs/_metaInvariant8Closeout.test.ts`). Screenshot baselines: `/help/errors` is NOT a captured surface (authoring-time probe: zero `errors` references in `scripts/help-screenshots.ts`; no errors WebP in `public/help/screenshots/`), and every new element is sr-only until focused, so no baseline regenerates. If implementation nonetheless changes visible chrome on any captured surface, the byte-comparison discipline applies (regenerate FROM the pinned Playwright image, `--platform linux/amd64`; `git restore public/help/screenshots/` after any local capture).
