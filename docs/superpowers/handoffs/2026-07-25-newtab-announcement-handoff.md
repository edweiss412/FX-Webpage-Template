# BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — new-tab announcement family sweep · Handoff / close-out

**PR:** #592 · **Branch:** `fix/newtab-announcement-family` · **Spec:** `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` · **Date:** 2026-07-25

PR2 of the 6-PR `BL-NULLCODE-STAMP-BATCH-2 residuals` sequence (PR1 = #587). Closes the announcement half of `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`; the tap-target half shipped earlier.

## What shipped

Every external link in `components/` and `app/` now tells screen-reader users it opens a new tab. The `↗` glyphs and external-link icons that told sighted users are all `aria-hidden`, so 21 of 23 anchors announced nothing.

- `components/shared/NewTabHint.tsx` — one visually-hidden `(opens in a new tab)` span, so the copy exists once across 15 call sites.
- 11 Group A anchors: sibling space + the hint. 6 Group B anchors: phrase appended to an existing `aria-label`. 4 Group C anchors: hint gated on `action.external` (they are same-app links when false).
- 3 WCAG 2.5.3 (Level A) label-in-name failures fixed: `step3ReviewSections.tsx` and the crew-facing `SourceLink.tsx` read "In sheet" while their labels never contained it; `VenueMapTile.tsx` reads "Directions" while its label never contained that.
- 2 bare `→` glyphs wrapped `aria-hidden` in `Step2Verify.tsx`; `rel` normalized on 3 anchors.
- `tests/styles/_metaNewTabAnnouncement.test.ts` + `tests/styles/_newTabScan.ts` — per-anchor TSX AST guard, 53 tests.

## §12 — UI close-out (impeccable v3 dual-gate)

**Invariant 8 applies by path:** the diff touches `components/**` and `app/admin/show/[slug]/CrewPageLink.tsx`. Both gates were **run** via independent subagents (per the standing owner request that this gate always uses subagents), each performing the canonical setup: `context.mjs` context load (PRODUCT.md + DESIGN.md) then the `product.md` register reference.

Both returned **NEEDS-WORK**. Findings and dispositions:

| # | Gate | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | audit | **P0** | `tests/components/a11y/newTabAnnouncementBehavior.test.tsx` fixture used `occurrences` (real field `occurrenceCount`, `lib/admin/attentionItems.ts:62`) and omitted `params`/`raisedAt`/`autoClearNote`/`errorCode`; `tsc` exit 1, would have failed `quality.yml` | **FIXED** — I had linted the new file but never typechecked it |
| 2 | audit | P1 | `format:check` red on the same file | **FIXED** |
| 3 | critique | P1 | Separator invariant unenforced — deleting the space before a hint left the whole suite green, silently producing `"Open in Sheet(opens in a new tab)"` (mutation-proven) | **FIXED** — AST rule requiring a real sibling space, covering all 15 sites; same mutation now fails with a precise message |
| 4 | critique | P2 | **Visible regression**: wrapping `Step2Verify`'s arrows cost 4.05px of word-space (134.08→130.03px, Chromium@16px), arrow touching the preceding letter — both anchors are gap-less `inline-flex`, so the wrapped glyph became its own flex item and the prior text run's trailing space was trimmed. jsdom cannot see it | **FIXED** — `&nbsp;` inside the aria-hidden span; spec §5.1's "dimensionally inert" claim corrected (true for the absolute hint span, false for a wrapped inline glyph in a flex parent) |
| 5 | critique | P2 | Label copy: new sheet labels dropped the destination app that the spec's own cited precedent uses (`Step3SheetCard.tsx:152` says "in Google Sheets"), and "In sheet, open the source sheet" repeated "sheet" three times | **FIXED** — all four sheet labels name Google Sheets; `VenueMapTile` became "Directions to the venue in Google Maps", avoiding a comma splice |
| 6 | audit | P3 | Ternary fallbacks guarded falsy, not blank: `title=" "` yielded `for   (opens...` | **FIXED** — `.trim()` guards |
| 7 | audit | P3 | `step3ReviewSections.tsx` DiagramTile still bare `rel="noreferrer"` | **FIXED** — normalized |
| 8 | critique | P3 | Diagram link exposes its name via both the anchor `aria-label` and the inner `img alt` | **DEFERRED** — `DEFERRED.md` › `NEWTAB-A11Y-RESIDUE-1(a)`. Fixing it reverses a previously accepted audit fix that a test explicitly pins; that is a separate reviewed decision, not a mid-sweep edit |
| 9 | audit | P3 | `BellPanel.tsx` "View in telemetry ↗" is internal, now the only `↗` that does not mean new tab | **DEFERRED** — `NEWTAB-A11Y-RESIDUE-1(b)`; out of family (no `target`, so the guard does not see it) |
| 10 | audit | — | 8 `broken-image` detector hits (`VenueMapTile`, `step3ReviewSections`) | **NOT A FINDING** — pre-existing `<img onError>` guards on map tiles/thumbnails, untouched by this diff; independently confirmed by a peer scan |

Audit verification worth recording: `.sr-only` compiles to `position:absolute; 1×1px; clip-path:inset(50%); visibility:visible` — clip-based, **not** `display:none`, so the hint genuinely contributes to the accessible name. Chromium CDP `Accessibility.getFullAXTree` over 7 real anchor shapes returned exactly `"<label> (opens in a new tab)"` each time, single space, no empties. At 320px and 390px the anchors' `getBoundingClientRect` was identical to 3dp with and without the hint, including inside `gap-*` and `truncate` parents.

## Cross-model review (whole diff)

Codex, fresh-eyes, on the full implementation: **BLOCKING** — 3 BLOCKING + 4 HIGH + 1 MEDIUM + 1 LOW, all execution-verified by transpiling the scanner in memory. Every finding was real and is fixed in `fe8890697` and the commits after it:

- **The guard failed OPEN on seven shapes.** Unresolvable spreads (`<a {...externalLinkProps}>`) returned zero anchors instead of failing closed; `some`-based gating let `external && ready` satisfy `external`; a single overwritten `conditions` value let an unconditional hint hide behind a gated one; `!e` did not match `!(e)`; only the FIRST phrase was stripped, so `"(opens…) (opens…)"` passed; any substitution counted as a destination, so `` `${""} (opens…)` `` passed; and the valid `external ? "Go (opens…)" : "Go"` was wrongly rejected.
- Hidden-attribute classification was presence-based, so `hidden={false}` was rejected while Tailwind `invisible` and anchor-level `hidden` were missed.
- Exemptions were an unparsed substring window, so `data-note="no-newtab-announcement:"` suppressed a finding and a reasonless marker was accepted.
- The §6.8 copy census was specified but never implemented.
- This handoff did not exist (invariant 8 requires the §12 record) and `BACKLOG.md` was not closed.

Each is now pinned by a named regression self-test. The scanner was extracted to `tests/styles/_newTabScan.ts` so probes and the guard share one implementation — the reviewer had to transpile a test file to exercise it, which was a design smell.

## Cross-model review — three rounds, and a design change in the third

**R1: BLOCKING.** 3 BLOCKING + 4 HIGH + 1 MEDIUM + 1 LOW, all real, all fixed. The guard was
failing OPEN on seven shapes, including `<a {...externalLinkProps}>` returning zero anchors.

**R2: initially lost to an upstream outage, then obtained.** The first dispatch died with all
three attempts exiting 1 against `503 ... biscuit_baker_service_me_circuit_open`
(`failureShape: nonzero_exit`, no signal — so neither the reaper silent-death class nor the
brief-size cliff). While the circuit was open I ran 20 self-certify probes on the briefed
surfaces and promoted the useful ones to permanent tests; that pass found nothing, which is
precisely why I re-dispatched rather than treating it as a substitute. On retry R2 returned
**BLOCKING**: 3 BLOCKING + 3 HIGH + 2 MEDIUM + 1 LOW, all real, all fixed.

**R3: BLOCKING** — 3 BLOCKING + 3 HIGH + 1 MEDIUM + 1 LOW. Every round confirmed the shipped
anchors themselves are correct ("no currently shipped anchor with a demonstrably wrong
announcement"); every finding across all three rounds was a guard or test defect.

### The third round forced a design change, not another patch

R1, R2 and R3 each found a NEW fail-open AST shape: nested spreads, computed keys, shadowed
identifiers and parameters, spread-supplied `aria-label`, spread-supplied `hidden`,
partially-exhaustive ternaries. That is not a run of bugs — it is the wrong default.
`docs/agents/spec-self-review.md:22` caps prose/patch iteration on a surviving vector at three
rounds, and this vector had survived three.

So the scanner was **inverted to a shape allowlist**. Rather than trying to prove an anchor is
broken (unsound: a static scanner cannot resolve imported props objects, parameters, or
shadowing), an external link must match one of a small set of approved shapes and anything
else is reported with instructions. The entire codebase uses exactly two shapes — 19 literal
`target="_blank"` and 4 conditional spreads — so the allowlist costs nothing today and closes
the whole class by construction.

Accepted tradeoffs, deliberately:

- A correct-but-unusual shape (an announcing `aria-label` arriving via spread) is reported. The
  author moves to an approved shape or adds an exemption with a reason. A false positive costs
  one comment; a false negative ships a silent link.
- An unconditionally external anchor must render its hint **unconditionally**. R2 asked for
  exhaustive ternaries to be accepted; R3 then defeated the both-branches heuristic with
  `e ? ready && <Hint/> : <Hint/>`. Proving an arbitrary conditional chain exhaustive is
  undecidable, so the approved shape is the simple one.
- Anything between the anchor and its hint whose attributes cannot be proven non-hiding (a
  spread, or a non-literal `className`/`style`) is reported.

### Two of my own test defects, found by reviewers rather than by me

- R3 called the empty-interpolation block **vacuous** and was right: it asserted properties of
  hand-authored constants, rendered nothing, and its "anti-tautology" source read would have
  survived changing `title.trim() ?` to `true ?`. It now renders and reads the computed
  accessible name, plus a probe-parity guard that is mutation-verified to fail on exactly that
  edit.
- Earlier, my first `HealthAlertsPanel` test guarded its assertions behind `if (link && …)` and
  passed while the action never resolved. Asserting existence exposed that `SHEET_UNAVAILABLE`
  needs `context.drive_file_id`, not the `sheet_url` I had invented.

## R5 — first UNOBTAINED, then obtained: BLOCKING with 6 findings

**The self-certification below was written while R5 had no verdict, and it was WRONG to treat
that as near-equivalent to a review.** Three attempts had exited 1 against
`503 ... circuit_open` (attempt 1 after 440 seconds and 130k tokens of real work);
`failureShape: nonzero_exit`, no signal, so neither the reaper silent-death class nor the
brief-size cliff. Per AGENTS.md, `no_verdict` is never "the reviewer found nothing".

When the circuit closed, R5 was re-dispatched and returned **BLOCKING with 4 BLOCKING + 1 HIGH +
1 LOW** — six real findings, none of which my 17 self-certification probes had found. The record
is kept here deliberately: it is direct evidence that self-certification does not substitute for
adversarial eyes, which is the opposite of what this section originally argued.

What R5 found, all fixed in `e1d937109`: the live-tree file filter was still case-SENSITIVE after
R4 made the scanner case-insensitive (my own regression — `_BLANK`/`target={t}`/`{...props}`
files were never scanned at all); `normPredicate` equated `!(e && ready)` with `!e && ready`;
`guardedSubstitution` treated `label` and `label.trim()` as interchangeable; the empty-`label`
seam had no rendering coverage; spec §4 contradicted its own corrected §1.3; and four `role`
values were rejected as opaque naming wrappers when the installed accName implementation computes
the right name through them. R5 labelled every finding's impact itself: five "future regression
protection and/or invariant 7", one developer friction. **None reached shipped behavior**, and R5
independently re-confirmed 23 anchors clean.

## R6 — BLOCKING with 5 findings, and the sixth round on one vector forced a model change

R6 reviewed the R5 fix delta and returned **4 BLOCKING + 1 HIGH**. Again none touched shipped
behavior; again the guard was the problem.

The decisive finding was its first: my R5 fix for predicate comparison — peel parens after `!`
only when the negand matches no `/[&|?:]/` — was not an atom test. R6 broke it across **eleven
operator families** (equality `!(x === y)` vs `!x === y` at `x=0,y=false`; relational
`!(n > 0)` vs `!n > 0` at `n=-1`; arithmetic, `in`, `instanceof`, bitwise, nullish, comma,
conditional, AND, OR), each with a witness state where the tab opens and nothing is announced.
Every probe returned zero violations.

That was the **sixth** consecutive round on the same vector. `docs/agents/spec-self-review.md:22`
caps a surviving vector at three rounds and says to change the model — so the model changed rather
than gaining a twelfth rule:

- `normPredicate` **deleted outright**, so the unsound comparator cannot be reintroduced.
- Predicates compare as **AST structural keys**, never normalized text.
- A gating predicate must be an identifier, a property-access chain, or `!` over either. A
  **compound** predicate is *reported, not compared*. All eleven families fail closed at once and
  no twelfth family can reopen the hole.
- Identity comparison (does a guard prove its OWN substitution non-empty?) keeps arbitrary
  expressions but compares structurally, so `!(label && ready)` guarding `${!label && ready}` no
  longer passes at `label=""`.

Cost today is zero: all four shipped gated anchors gate on member expressions. Ratified as an
accepted limit in spec §6.4.

R6's other four: the `.mdx` rule tested only `/_blank/i`, so `target={dest}` and
`{...externalProps}` evaded it (MDX never reaches the scanner, so its rule is now the strictest
available — no `_blank`, no `target`, no spread); spec §4 still claimed all four gated anchors
render `{action.label}` when the fourth is the banner's static `Google Sheets` chip; spec §6.3
still called any `role` a naming override, contradicting the R5 change; and — the finding that
explains the whole thread — **the four R5 scanner changes had NO self-test**, which is precisely
how the suite stayed green while the comparator was fail-open. Five pins added, including all
eleven families, mutation-verified: re-admitting binary predicates fails the compound pin,
restoring gives 66/66.

### The self-certification that R5 later refuted, kept for the record

Self-certification against those exact questions:

| Question | Result |
| --- | --- |
| Any remaining plausible unannounced-link shape? | 8 NEW shapes probed (expression-literal target, `<Link>`, hint in the wrong gated branch, hint inside a `map` callback, target-plus-spread, opaque wrapper two levels deep, phrase-only nested template label, `_self` in a gated branch) — **all 8 flagged** |
| Any false positive rejecting correct code? | 9 correct shapes probed (both shipped shapes, negated polarity, internal link, `target="_self"`, decorative glyph wrapper, static className wrapper, guarded-substitution label) — **all 9 accepted** |
| Is the `{ target, rel }` allowlist over-narrow? | Derived from the tree, not guessed: all four gated spreads carry exactly those two props, and `referrerPolicy`/`download` appear on no anchor. Evidence recorded in spec §6.2 |
| Do the 23 live anchors still classify clean? | Yes — 19 literal + 4 gated, zero violations, asserted by the guard's own live-tree test |
| Invariant 7 (spec is canonical) | Satisfied: §6 and §7 were amended to ratify the allowlist and the reduced behavioral set |
| Any vacuous test left? | The parity guard is mutation-verified to fail when `.trim()` becomes `.length > 0` |

The valuable probes are permanent tests (the `R5 ` cases), so this is repeatable rather than a
claim. Guard: 59 tests; 159 across the a11y suites.

**Read that table as a cautionary artifact, not as evidence.** Every row is literally true and
the probes are permanent tests — and R5 still found six things none of them covered. The lesson
recorded in `feedback_never_compare_predicates_as_text` is the durable output.

## R7 — BLOCKING with 3 findings: the same mistake, one layer over

R7 reviewed the R6 delta and returned **3 BLOCKING**. All three were mine, and the first is the
one worth remembering: R6 narrowed **gating** predicates to a decidable subset, but the
**identity** comparison — does a guard prove its OWN substitution non-empty? — kept a serializer
that fell back to `getText().replace(/\s+/g, "")` for unsupported subtrees. Narrowing one path and
leaving a text comparison in the other is not a fix, it is a relocation.

That fallback erases token boundaries, so different expressions collided into one key and a guard
"proved" a DIFFERENT expression non-empty: `new F()` with `newF()`, `await x` with `awaitx`,
`typeof x` with `typeofx`, `delete x.y` with `deletex.y`, `x as string` with `xasstring`, a
one-space template with an empty one, and any two literals differing only by an internal space
(`get(/a b/)` with `get(/ab/)`). It also dropped optional-chain tokens and call type arguments,
colliding `obj?.[key]` with `obj[key]`, `fn?.()` with `fn()`, and `fn<T>()` with `fn()`. R7 gave a
witness for each where the substitution returned `""` and the computed name was
`(opens in a new tab)` with no destination.

`canon` is deleted. `identityKey` accepts only an identifier, a property access (recording `?.`),
an element access with a literal or identifier key, a **zero-argument** call with **no type
arguments** over any of those, and `!` over any of them; everything else fails closed. **No text
comparison remains anywhere in the scanner.** The shipped labels (`label`, `alt`, `displayTitle`,
`title`, `title.trim()`) are all inside the subset, asserted by test rather than assumed.

The other two were both lexical nets that could not see comments: `admitsCandidate` skipped FILES
containing `target <comment> ={dest}` or a spread whose brace is separated from its dots, and
matched `target` case-sensitively even though HTML attribute names are case-insensitive and React
emits `TARGET={x}` with a warning rather than dropping it. `MDX_FORBIDDEN` had the identical hole,
which R7 confirmed against `@mdx-js/mdx` 3.1.1. Both now test raw text AND a comment-stripped copy
and take the UNION — stripping alone is unsafe for MDX, because prose contains `https://` and a JS
lexer reads `//` as a line comment, deleting the rest of that line; a union can only admit MORE.

Mutation-verified both: restoring the text fallback fails the collision pin, removing
comment-stripping fails the lexical-net pin, control 71/71. I also self-probed the forging risk
introduced by the new `i:`/`p:`/`s:` key prefixes (a string key mimicking a prefix, bracket
injection, negation aliasing, property vs element access) — six pairs, all rejected.

**Rounds 5, 6 and 7 all found guard defects and none found a shipped-behavior defect.** The 21
remediated anchors have been stable since R4. That asymmetry is the honest summary of this
close-out: the user-facing work was right early, and the machinery asserting it took four more
rounds to become sound.

## R8 — 2 BLOCKING + 1 MEDIUM, and a fix that reopened its own class

R8's independent 150,975-pair identity probe found **no collision**, so R7's fix held. What it
found instead were two holes elsewhere:

**Casing.** `admitsCandidate` matched `target` case-insensitively; `classifyShape` compared the
attribute name verbatim. So all 63 non-lowercase spellings were ADMITTED by the file net and then
skipped with zero anchors and zero violations — the worst possible shape, since the guard looked
like it had examined the file. React forwards `TARGET`/`Target`/`tArGeT` to the DOM and the browser
normalizes them, so each really opened a new tab named only "Go". `attrName` now lowercases, and
the sweep deliberately covers the HIDING attributes too: an uppercase `ARIA-HIDDEN` really hides,
so missing it would ACCEPT a hint that never reaches the accessible name.

**The sweep repeated the bug inside the fix for the bug.** Nine name comparisons; I changed eight.
The ninth (`nm !== "className"` in the path-opacity rule) silently reopened the
dynamic-`className` hole, and only an existing pin caught it. There is now a meta-test asserting
that no attribute-name comparison literal is non-lowercase. That guard exists because the class
recurred *during its own remediation*, which is the strongest possible argument for a structural
pin over care.

**Tag discovery.** A member-expression tag is not in `LINK_TAGS`, so
`<Tags.External href="x" target="_blank">` and `<UI.Link target={dest}>` were admitted and never
classified. Resolving this had a real constraint: an existing pin says `<Tabs target="_blank" />`
must NOT be an anchor, because a tab target is not a URL. `href` — not `target` — is therefore the
discriminator, which also keeps every `<div {...props}>` from becoming a violation.

**MDX prose.** The net matched `target =` anywhere, flagging "The target = 80% of the quarterly
goal." and a GFM autolink whose query string contains `target=`. It now requires a JSX tag context.

### The residue I had accepted, then probed, then closed

Writing R9's brief I listed the remaining hole as an accepted limit: a member-expression tag whose
target arrives only through a conditional spread. Then I probed it instead of trusting my own
label, and `<Foo.Bar href="x" {...(e ? { target: "_blank" } : {})}>Go</Foo.Bar>` produced **zero
anchors** — admitted, unclassified, silent. It carries `href`, so it was cheap to close rather
than accept: candidacy is now `href` AND (a `target` attribute OR any spread). The live tree stayed
at 23 anchors / 0 violations, so the stronger rule costs nothing today.

The lesson is narrow and worth keeping: **"accepted limit" is a claim about reachability, and it
deserves a probe like any other claim.** Two of this PR's accepted limits turned out to be closable
the moment they were executed rather than described — this one, and the effectful-predicate
deferral that R6's model change had already fixed without my noticing.

## A gate I retired rather than satisfied

The local full-suite gate is **not** green and cannot be made green here. A peer session (PID
89042) runs `pnpm test` from `FX-worktrees/alert-autoresolve` against the SAME local Supabase.
Evidence that this is contention and not this diff: 17 of 18 failures vanish when the same files
run serially; the one file that still fails yields a DIFFERENT failure set on each run; it is
untouched by this branch (`git diff --name-only origin/main...HEAD` matches it zero times); and
the signatures are foreign UUIDs, `busy` vs `updated`, and off-by-N row counts. CI gives each job
an isolated database, so CI is the authority for this PR. Recorded rather than quietly dropped.

## The pattern worth carrying forward

**Every defect in the guard was found by executing it, none by reading it.** Five adversarial spec rounds (35 findings) reviewed the design and missed all seven bypasses; the spike, the implementation, the impeccable gates, a peer scan, and the whole-diff review each found more. `docs/agents/spec-self-review.md:22` caps prose iteration on a surviving design vector at three rounds and requires a probe instead — that rule paid for itself here, and the guard's own history is the evidence.

The guard has also already proven itself on live upstream code: rebasing onto 82 sibling-session commits, it caught a brand-new unannounced anchor (`AttentionBanner`'s "Google Sheets ↗" destination chip) with no prompting, and flagged that `AttentionMenu` had left the family entirely.

## Verification

- 66 guard tests (synthetic self-tests driving each accept/reject branch, plus named regression pins for every R1-R6 bypass, including all eleven R6 operator families); 167 across the guard and a11y suites. The reviewers' exact probe cases behave correctly (R1: 7 rejected / 3 valid accepted; R2: 16/16).
- `tsc` clean; `prettier` clean; `eslint` 0 errors and 0 warnings from new files (re-verified after the R2 fixes, which had left three dead-code warnings behind).
- Real CI green on #592 before the guard hardening (38 pass / 0 fail), re-run on each subsequent head. NOTE for anyone reading CI history on this PR: the four workflows that show `completed/failure` on head `e1d937109` had every job CANCELLED (bulk external cancel at 12:13:20Z, 11 of 15 workflows already green), and `gh run rerun --failed` is a NO-OP on cancelled jobs — it produced an empty attempt-2 with `total_count: 0` that instantly re-concluded as failure. Neither was a test failure. The `validation-schema-parity` failure visible on the superseded head `7b8e2a70a` never re-ran on a later head, so its "environmental" diagnosis is retired, not confirmed.
- `spec:lint` 0 hard on the spec (27 advisory, all numeric literals in prose).
- Mutation-verified pins: re-admitting binary predicates into the approved gating shape fails the R6 compound pin (1 failed); restoring gives 66/66. A pin that cannot fail proves nothing.
