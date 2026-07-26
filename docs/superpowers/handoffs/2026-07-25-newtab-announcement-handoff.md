# BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — new-tab announcement family sweep · Handoff / close-out

**PR:** #592 · **Branch:** `fix/newtab-announcement-family` · **Spec:** `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` · **Date:** 2026-07-25

PR2 of the 6-PR `BL-NULLCODE-STAMP-BATCH-2 residuals` sequence (PR1 = #587). Closes the announcement half of `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`; the tap-target half shipped earlier.

## What shipped

Every external link in `components/` and `app/` now tells screen-reader users it opens a new tab. The `↗` glyphs and external-link icons that told sighted users are all `aria-hidden`, so all but two of the family announced nothing.

**Current figures, re-derived from the guard (review R30 item 5 caught this summary stale):** the
family is **22 anchors across 15 files, 0 violations**, and 13 `.mdx` files contribute 0 anchors. The
sweep began at 23 anchors in 16 files and fixed 21 of them; one — this spec's sole `app/` member —
was then deleted upstream as an orphan mid-review, taking its announcement with it. Spec §1.4 carries
the full before/after table and why the file count was independently wrong. Figures quoted further
down this document are historical and were accurate when written.

- `components/shared/NewTabHint.tsx` — one visually-hidden `(opens in a new tab)` span, so the copy exists once across the call sites.
- 11 Group A anchors: sibling space + the hint. Group B anchors: phrase appended to an existing `aria-label` (6 at the time, 5 after the upstream deletion). 4 Group C anchors: hint gated on `action.external` (they are same-app links when false).
- 3 WCAG 2.5.3 (Level A) label-in-name failures fixed: `step3ReviewSections.tsx` and the crew-facing `SourceLink.tsx` read "In sheet" while their labels never contained it; `VenueMapTile.tsx` reads "Directions" while its label never contained that.
- 2 bare `→` glyphs wrapped `aria-hidden` in `Step2Verify.tsx`; `rel` normalized on 3 anchors.
- `tests/styles/_metaNewTabAnnouncement.test.ts` + `tests/styles/_newTabScan.ts` — per-anchor TSX AST guard. **125 tests as of R31** (53 when this line was first written; every review round since added fixtures, and R31 alone added 40). §12 carries the per-round record.

## §12 — UI close-out (impeccable v3 dual-gate)

**Still valid at merge time, verified rather than assumed (2026-07-26).** The gates below ran many
review rounds ago, so the question is whether any UI surface changed since. It did not: the last
commit touching `components/`, `app/`, `DESIGN.md` or `tailwind.config.ts` is `903286b37` (accepting
upstream's deletion of an orphaned component -- no UI authored), and every commit after it touches
only `docs/` and `tests/`. Invariant 8 covers UI surfaces, and the guard/spec/handoff work since is
neither, so no re-run is owed. Check it the same way if more rounds land:
`git log -1 --format=%h -- components/ app/ DESIGN.md` then diff that commit to HEAD.


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

## R9 — 2 BLOCKING + 1 MEDIUM, and a decision reversed on purpose

R9's census independently reproduced the live state (73 admitted files, 23 anchors, zero
violations, no offending MDX), and its findings were again guard-only.

**Candidate discovery.** My `209bcbdb0` fix (href AND (target OR spread)) closed four of R9's six
cases before it ran. Two survived: an explicit `target` whose `href` arrives by spread, and a tag
where both arrive by spread. The first is now closed by making an explicit `target` sufficient on
its own.

That **reverses R8's resolution deliberately**, and the reversal is the interesting part. R8 kept
`<Tabs target="_blank" />` unclassified because a non-URL `target` prop selects a tab, not a window.
R9 then demonstrated the cost of that carve-out: `<Foo target="_blank" {...spreadHref}>` was skipped
entirely. Two reviewers pulling opposite ways on the same rule is resolved by asking which direction
fails closed — so an explicit `target` is always classified now. R9's census confirms no live
component carries `target` without `href`, so the cost today is zero, and a genuine non-URL `target`
prop costs one exemption comment. The old pin was rewritten with this reasoning inline rather than
deleted, so nobody "restores" it later. A spread-only element with neither attribute is still not a
candidate, which is what keeps every `<div {...props}>` out. The remaining residue — both `href` and
`target` inside one unresolvable spread on an unknown tag — is genuinely undecidable and recorded.

**MDX, and a repair that created its own hole.** R8's fix for prose false positives was a
character class excluding angle brackets. R9 showed that ends the tag at any `>` inside it, so
`<a href="x" title="1 > 0" target={dest}>` was invisible; it compiled ten such witnesses with
`@mdx-js/mdx` and each produced a real external anchor named only "Go". Tag boundaries are now
scanned with quote and brace-depth tracking rather than matched. **The asymmetry matters:** for TSX
the lexical net only decides whether to run the AST pass, so over-admitting is free; for MDX the net
IS the enforcement, so a false negative ships silently. That is the reason MDX gets the careful
scanner and TSX keeps the cheap union.

**The meta-test I added to prevent a recurrence was itself too narrow.** It matched only variables
literally named `n` or `nm`, so `attrName(a) === "Target"`, `names.has("Target")` and
`prop.name.text === "Target"` would all have passed — and R9 found exactly that class still live in
the approved-spread path, where `{ TARGET: "_BLANK" }` was rejected as unrecognized. Both are fixed:
property names lowercase through one helper, and the meta-test now covers every name accessor and
set-membership helper. A guard against a class is itself code, and it deserves the same adversarial
attention as the thing it guards.

## R10 — the MDX vector hit four rounds, so the model changed

R10 returned 3 BLOCKING + 3 MEDIUM + 1 LOW. **Three of the seven were the same hand-written MDX
lexer:** `{` and `}` inside a JavaScript regex literal corrupted brace depth, so a later `target`
was invisible (and an unmatched `{` made the scan swallow following prose); fenced code blocks were
read as live JSX; and a quoted attribute ending in a backslash left the scanner stuck in quote mode,
running past the tag into text that then matched `target =`.

Counting the vector honestly: R8 found prose and autolink false positives, R9 found the
angle-bracket-excluding class ending tags early, R10 found three more. **Four rounds, each fixing
the previous fix.** `docs/agents/spec-self-review.md:22` caps that at three, so the lexer is gone:

```
.mdx  ->  @mdx-js/mdx compileSync(src, { jsx: true })  ->  the SAME scanSource used for TSX
```

Prose and fenced code compile to string literals. Regex literals, escapes, and attribute quoting
become the compiler's problem, which is where they belong. **MDX and TSX are one enforcement path
now instead of two** — that is what removes the class rather than the instance, and `@mdx-js/mdx`
was already a devDependency so it cost no new dependency.

It also bought coverage a lexer could never have had: the compiled module is walked in full, so an
anchor bound to an `export const` and rendered as `{link}`, an anchor returned from an exported
function, and a custom component handed a `target` are all classified. Those are pinned.

**And the swap introduced a vacuity risk that I found rather than the next reviewer.** With the
guard now depending on a compiler, an upstream change returning `""` would leave `scanSource` with
nothing to find and the live MDX test passing FOR THE WRONG REASON. The test now asserts every
`.mdx` compiles to real JSX before scanning it, mutation-verified against a stubbed-empty compiler.
Measured: all 13 pages compile to 2.8k-12.3k characters and 25-99 JSX tags, so the floor has
headroom and will not flake.

R10's other findings, all real: a RESOLVABLE inline spread carrying `href`+`target` was skipped
even though both props are statically visible; duplicate case-folded property names took the wrong
value in BOTH directions, because React collapses `{ target, TARGET }` into one attribute where the
later value wins; and my lowercase meta-test hooked on accessor context, so `"Target" === attrName(a)`,
a template literal, a switch case, a variable hop, and `[...].includes(...)` all evaded it.

### Three fail-opens in my own fixes, found by probing them

Between rounds I probed my own work rather than waiting to be told, and each probe found something:

- `<Foo {...{...{href:"x", target:"_blank"}}}>` produced **zero anchors** — my R10 fix unwrapped
  spreads one level, so the identical fail-open sat one level deeper.
- The inverted meta-test's fixed name set only protects names it knows, so a future comparison
  against another attribute would escape silently. It now also derives the names the scanner
  compares and fails until the set covers them.
- The same meta-test flagged `LINK_TAGS.has("Link")` as a violation, which is wrong: JSX **tag**
  names are case-sensitive, unlike attribute names.

That is now three separate instances on this PR of **a class recurring inside its own remediation**
(the casing sweep fixed 8 of 9 sites; the guard written to prevent that had two defects of its own;
spread depth). It is the strongest argument available for pairing every fix with a structural pin
and a mutation, rather than trusting that a passing suite means a working guard.

## R11, R12, and where the review loop stopped

**R11** (3 BLOCKING + 1 HIGH + 1 MEDIUM). The worst was a half-fix of mine: the duplicate
case-folded rule covered spread OBJECTS only, so direct JSX duplicates walked past it.
`<a target="_self" TARGET="_blank">` scanned CLEAN while React applied the later value and really
opened a new tab, and `aria-label` beside `ARIA-LABEL` let an announcing label be replaced by a
silent one *while still counting as compliant* — green and wrong, the worst shape a guard can have.
The HIGH was a process failure worth naming: I deleted the MDX lexer but left its CONTRACT behind,
so the spec still said "MDX never reaches scanSource" and named the deleted `mdxForbidden()`, and a
dead regex sat unused. Deleting code without deleting its contract leaves the next reader with two
incompatible truths.

**R12** (2 BLOCKING + 1 HIGH + 1 MEDIUM). Its HIGH invalidated a fix I had been confident in:
`ts.createScanner().scan()` is not parser-equivalent for templates. It fell out of phase around
template expressions, so appended literals were invisible — including the decisive witness, a late
`"aria-labelledby"` mutated to `"Aria-LabelledBy"`, which let a mutated scanner accept an
unannounced anchor — while ALSO overmatching an unrelated `` `Target${count}` `` fragment. Wrong in
both directions simultaneously. Now a real parse and node walk, restricted to complete literals.
R12 also found `unparen` stripping only parentheses (so `as const` / `satisfies` / `!` hid
resolvable spreads), three false-positive sources in the duplicate rule, and that the
components-map regexes passed **all seven** override shapes.

### The fix-introduces-the-next-defect pattern, five times

| Fix | Defect it introduced |
| --- | --- |
| Casing sweep across nine sites | The ninth reopened the dynamic-`className` hole |
| Meta-test written to prevent that | Flagged `LINK_TAGS.has("Link")`, which is legitimately case-sensitive |
| Resolvable-spread candidacy (R10) | Unwrapped one level, so nested spreads stayed silent |
| MDX lexer → compiler | Introduced a vacuity path: an empty compile would pass for the wrong reason |
| Intrinsic-tag scoping (R12 MEDIUM) | Excluded camelCase intrinsics like `<clipPath>` |

Every one was found by executing the new code, never by reading it. That is why each fix in this PR
ships with a mutation that proves its pin fails without it — a passing suite is not evidence that a
guard works.

## R13 first failed on a quota error that turned out to be transient

R13 was dispatched against `1a497dcbb..10f6ee5aa` and returned `no_verdict` after three attempts,
each dying in 10-20 seconds:

```
ERROR: You've hit your usage limit. ... try again at Jul 31st, 2026 7:48 PM
```

Per AGENTS.md a `no_verdict` is an infrastructure fault and never "the reviewer found nothing". I
read the explicit reset date as authoritative, concluded the gate was unsatisfiable for six days, and
escalated the merge decision to the owner. **That was wrong.** The owner said "try codex again"; a
90-second probe (`codex exec "reply with the single word READY"`) returned available immediately, and
the re-dispatch ran normally.

The lesson is recorded in `feedback_probe_quota_before_escalating`: **availability is testable, so it
must never be escalated.** A quota message names a date, but that date is not a fact about the next
request — treat it like any other transient upstream fault and retry. The escalation mechanics were
correct (answer-independent work drained first, notification in the same turn, `blockedOn` set, nudge
left registered) and that does not make an unnecessary escalation cheap.

What the record supports, stated without inflation:

- **Rounds 5 through 12 found only GUARD defects. Not one changed what a user or screen reader
  experiences.** The 21 remediated anchors and the live census (22 anchors, 0 violations) have been
  stable since R4.
- CI is green on the final head, 190 tests pass, `tsc`/eslint/prettier are clean, `spec:lint` is 0
  hard, and every guard fix is mutation-verified.
- The residual risk is a *guard* fail-open that twelve rounds did not reach — future regression
  protection, not shipped behavior.

Those statements stand on their own and did not depend on how the quota question resolved. The
round count is simply higher than twelve now, since R13 ran after all.

## R13 — the finding that invalidated one of my own claims

R13 returned 2 BLOCKING + 1 HIGH + 1 MEDIUM, and its HIGH was the single most consequential finding
of the whole thread because it was a **root cause under several others**.

`stripCommentsSafely` drove `ts.createScanner().scan()` and rebuilt source from token text. That is
not parser-equivalent: the scanner cannot know a `/` begins a regex without the parser's rescan, so
a VALID regex containing comment bytes was read as a block-comment start and **everything after it
was discarded**. Measured: `/[/*]/` truncated the file to `const re=/[`.

Five consumers were silently reading fragments — the copy-string census, the candidate-admission
net, the caller check, the lowercase tripwire, and a behavioral parity guard. And it directly
falsified what I had written one round earlier, that "a real parse removed the phase-loss class":
the parse was sound, but I was **feeding it already-truncated input**. A correct component fed bad
input is not a correct system, and I had checked the component rather than the pipeline.

The replacement is sound by construction: the parse supplies literal ranges (string, template parts,
REGEX, JSX text) and a lexical pass blanks only comment starts outside them. Both halves are
load-bearing — a pure scanner mis-reads regexes, and a pure trivia walk missed a comment that is the
leading trivia of a TOKEN, which is exactly `{ /*c*/ ...props }` inside JSX attributes. Comments are
blanked to spaces rather than deleted, so byte offsets stay valid for callers that report positions.

R13 also closed: a components-prop caller check that is now an AST assertion (three regex misses, a
truncation exposure, and a false positive removed at once, measured zero occurrences so it is
absolute rather than allowlisted), and a literal tripwire scoped by SEMANTIC POSITION rather than by
accessor name.

## What the last rounds cost, and what they were worth

Rounds 5 through 13 found **no defect in shipped behavior**. Every finding was in the guard. The 21
remediated anchors and the live census (22 anchors, 0 violations) have been stable since R4.

That is not an argument that the rounds were wasted — they closed real under-reporting in a guard
whose entire job is to fail loudly — but it is the honest shape of the work, and it is why the
merge decision does not hinge on the final round.

Two failure patterns recurred often enough to name:

| Pattern | Instances |
| --- | --- |
| A fix introduces the next defect | casing sweep (8 of 9 sites), the guard written to prevent that, spread depth, the MDX compiler swap creating a vacuity path, intrinsic-tag scoping excluding `<clipPath>` |
| The same shape evades several different checks | computed keys defeated three separate rules; case-folding four sites; one-level traversal twice |

Both are arguments for the same discipline: pair every fix with a probe that fails without it, and
when a shape defeats one rule, grep for every other rule that reads the same thing.

## R14 — two infrastructure faults, diagnosed separately

R14 returned `no_verdict` twice for **different** reasons, and treating that as one flaky reviewer
would have wasted both retries:

- **Attempt 1** died after 137,850 tokens on Codex's own safety classifier: *"flagged for possible
  cybersecurity risk"*. The cause was my brief, which said "**ATTACK** these specifically" and asked
  for "evasions", "bypasses" and "fail-open" cases. For a classifier that reads as offensive-security
  tasking, even though the work is quality assurance on a test-only static guard in a private repo.
- **Attempt 2** was killed at its final delivery step (`shape=killed`, exit null) by the wrapper's
  1500-second TOTAL budget, already consumed by attempt 1's eleven minutes.

Ruled out rather than assumed: the reaper (kill log empty, "no orphans") and a stall (heartbeat
live). Re-dispatched with a neutrally-worded brief carrying identical substance, and
`--total-max-secs 3300`. Per AGENTS.md a `no_verdict` is an infrastructure fault and never "the
reviewer found nothing"; that rule held twice here.

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

- **104 guard tests / 222 across the styles, a11y and docs suites** (was 92/167 at R6; the delta is the R14-R20 pins). Synthetic self-tests drive each accept/reject branch, plus named regression pins for every R1-R6 bypass including all eleven R6 operator families. The behavioural casing sweep is the largest single test at 1374ms (roughly 12,000 scans: every closed-list attribute x 7 values x 6 placements x 3 spellings); the whole file runs in 4.5s, so it carries no CI timeout risk. The reviewers' exact probe cases behave correctly (R1: 7 rejected / 3 valid accepted; R2: 16/16).
- `tsc` clean; `prettier` clean; `eslint` 0 errors and 0 warnings from new files (re-verified after the R2 fixes, which had left three dead-code warnings behind).
- Real CI green on #592 before the guard hardening (38 pass / 0 fail), re-run on each subsequent head. NOTE for anyone reading CI history on this PR: the four workflows that show `completed/failure` on head `e1d937109` had every job CANCELLED (bulk external cancel at 12:13:20Z, 11 of 15 workflows already green), and `gh run rerun --failed` is a NO-OP on cancelled jobs — it produced an empty attempt-2 with `total_count: 0` that instantly re-concluded as failure. Neither was a test failure. The `validation-schema-parity` failure visible on the superseded head `7b8e2a70a` never re-ran on a later head, so its "environmental" diagnosis is retired, not confirmed.
- `spec:lint` 0 hard on the spec (27 advisory, all numeric literals in prose).
- Mutation-verified pins, and the count matters because each was a separate reverted clause: re-admitting binary predicates into the approved gating shape fails the R6 compound pin; each of the three line-terminator sites fails its own CR witness; R18's `.includes` evasion, a const-bound-Set name, a renamed verdict string and a bogus exclusion entry each fail a named assertion; a case-sensitive read via regex, via an unquoted property key, via the ancestor walk (`inert`), via `alt`, and R20's value-gated `class` witness all fail the behavioural sweep. A pin that cannot fail proves nothing, and two of these needed reshaping before they could fail at all.

## R17 — LF-only handling, third occurrence, and the class-sweep that priced it

R17 raised one BLOCKING and one HIGH. Both were in the guard's own machinery; the live census
was unchanged at 23 anchors / 0 violations, as it has been since R4.

**BLOCKING — the casing fixture table.** Two of its three parts were already fixed in commits
the reviewer could not see (it scoped strictly to `bb8c2b40a..9de228991`, and `aria-labelledby`
and `style` had been added in `e8e68222e`). The third part was real and was mine: the `href`
fixture carried a literal `target="_blank"`, which admits `<Foo>` on the explicit-target rule
**before** `href` is ever consulted. It returned the same violation with `href` and `HREF` even
under a case-sensitive read, so it asserted nothing. It now uses `<Foo href="x" {...p}>`, which
reaches candidacy only through the href+spread rule; a case-sensitive read drops the anchor and
the pin fails. This is the same defect shape as a tautological test: the fixture exercised a
path that did not include the thing under test.

**HIGH — the jsdoc reason strip split on LF only.** With a `\r` / U+2028 / U+2029 body the
comment is one line, the single leading-decoration strip eats only the first `*`, and a second
`*` survives as a "reason" — so an exemption with **no** reason was honored, defeating the
reason requirement entirely.

**The class-sweep found two more sites, and one was worse than the reported one.**
`hintHasSiblingSpace` modelled JSX whitespace with `/\n/` in two places. JSX deletes a
whitespace run once it contains **any** line terminator, so `Go\r<NewTabHint />` was read as
separated when the rendered accessible name is `Go(opens in a new tab)` — a fail-open in the
**shipped §3.1 rule**, not in the guard. R17 did not report it; sweeping the class did.

LF-only handling has now produced three findings across three rounds (R14's `//` comment that
ran past CR, plus both of these), so the terminator set is now one `LINE_TERMINATORS` constant
rather than a regex spelled per site. Per the three-round rule the response is a model change,
and this is its cheapest form: one definition that cannot be partially updated.

**Two pins had to be reshaped before they could fail, and a control was factually wrong.**
First attempts at both new pins passed under the mutation:

- A jsdoc body with **one** decorative line is strip-equivalent under both readings. Only with
  two does a `*` survive the single leading strip, which is the shape that gets honored.
- The whitespace-only-text-node branch only diverges from `return true` when **adjacent
  content** precedes the stripped run. After a `{" "}` both readings accept, so that shape
  cannot discriminate.

And one control asserted that `Go \r<NewTabHint />` should be accepted because "a real space
before the terminator survives." It does not — the space and the terminator are one run, and
JSX deletes the whole run. The scanner was right and the test was wrong; the corrected control
now pins both halves (`Go ` + terminator is still reported, explicit `{" "}` is accepted) and
the spec §3.1 states the rule.

Each of the three fixes is mutation-proven independently: reverting any one site to `\n` fails
a named pin, and all three restored gives 103/103 in the guard file, 221 across the styles,
a11y and docs suites.

## R18 — the retired vector was still running in the sibling check

R18 was the first non-BLOCKING verdict since R4 (NEEDS-ATTENTION, one HIGH). It independently
confirmed the R17 work: it re-derived 23 live anchors / 0 violations across 246 files, regressed
each of the three terminator sites and watched the matching witness flip, verified through
TypeScript's own JSX transform that all four terminators remove both a bare and a preceding
literal-space separator while `{" "}` survives, and confirmed the new `href` fixture is decisive
(removing `attrName` lowercasing drops `HREF` from one anchor to zero).

**The HIGH: the self-maintaining casing check was regex form-enumeration.** It matched the scanner
source for the reading forms it knew about, so `["download"].includes(name)` had no fixture and
produced no failure. This is the vector R15 and R16 already retired — rebuilt in a sibling check in
the same file. Retiring a vector by changing a model closes it only where the model changed; a
model change is a claim about the whole file, and I had not swept for the old mechanism elsewhere.

**The sweep found it one layer below what R18 reported.** `rel` is read through a
`new Set([...])` bound to a const, which the position-based collector never saw either, so a
camelCase `rel` would not have tripped the lowercase rule. Two collectors existed for one
question, one sound and one not, and they silently disagreed about what the scanner reads.

**The model change:** stop asking *which reading forms exist* (unbounded — alias, array,
const-bound Set, switch case, property key, and the next one someone invents) and ask *which
name-shaped literals exist* (decidable, from the AST, position-blind). Every form still contains
the literal. Each name-shaped literal must then be classified — a casing fixture, or a
`NOT_AN_ATTRIBUTE_NAME` entry with a reason — so a new literal fails until someone decides which it
is. Stale exclusions fail too: an entry no longer present in the source is how a real attribute
name later slips in under a dead classification.

Both halves now run off the one collector, and the 60-line position-enumeration collector is
**deleted** rather than left as a second opinion. That is what makes the two checks structurally
unable to disagree, and it is the part that closes the class rather than the instance.

Mutation-proven four ways: R18's `.includes` witness, a new name added to the const-bound Set, a
renamed verdict string, and a bogus exclusion entry each fail a named assertion.
`nameShapedLiterals` carries its own synthetic pin over ten reading forms plus the prose cases the
shape filter must reject, and states the one genuinely undecidable form (`"al" + "pha"`) instead of
implying it is covered.

**Also merged `origin/main`** (51 commits, 11 changed `.tsx`/`.mdx` files) before pushing. Clean
merge; the census is unchanged at 0 violations, so none of the new upstream files carries an
unannounced anchor.

### Local full-suite flakes, and why they are not this diff

Two local full-suite runs on the same commit failed **disjoint** sets: 7 tests in `settingsHeader`,
`healthAlertsPanel`, `venue`, `validation-check-seed-content-coverage` and
`readShowChangeFeed.staleness`; then 6 different ones in the venue generator, the parseSheet
corpus, a DURABLE lease, a rebuild outcome and a stage-converge case — with `healthAlertsPanel`
passing the second time. A real regression fails the same tests deterministically. Both runs also
shared the box with a `codex-guard` dispatch (a render assertion took 5289ms). CI had already been
12/12 green on a head containing every component change in this PR, and every commit after it
touches only `tests/styles/**` and docs, so the component failures cannot be attributed to the new
work. CI's sharded isolated runners are the arbiter here, not a contended local box.

## R19 — the fourth source-reading model fails, so stop reading the source

R19 (NEEDS-ATTENTION, two HIGHs) confirmed the R17/R18 work independently — 23 anchors / 0
violations across 246 files, 13 MDX files compiled, each terminator site regressed and its witness
flipped, the `href` fixture decisive — and then broke the shape model three ordinary ways:

- a regex literal: `/^FetchPriority$/.test(name)`
- an unquoted property key: `{FetchPriority: true}[name]`
- reusing an already-excluded spelling: `name === "static"`

The third is the one worth dwelling on. **One commit earlier I had written that collision into spec
§6.4 as "possible in principle; no such collision exists today."** It was not a principle, it was a
live evasion, and calling it theoretical is what let it ship. A residual risk that an attacker-free
one-line edit can reach is not residual.

**Four source-reading models have now failed here:** accessor-name scoping (R12), a blanket literal
walk (R13), regex over reading forms (R18), literal shape (R19). Each had to enumerate something —
positions, forms, or node kinds — and the enumeration is what kept losing. The fifth model does not
read the source at all.

`NAME_AFFECTING_ATTRIBUTES` is a closed list from an **external** authority (HTML global attributes,
`<a>` attributes, `role`, every ARIA state/property, the JSX aliases). For each name, scanning the
same fixture with a different case must yield the same verdict. No reading form can evade a check
that never consults the source, and an attribute outside the list behaves identically in either
spelling, because HTML attribute names are ASCII case-insensitive -- so casing cannot cause this
defect there. (The stronger wording this paragraph originally carried, that an outside attribute
"cannot change an accessible name", is RETRACTED: `data-*` is open-ended and a
`[data-state="closed"]` CSS rule hides a subtree. See §6.4.) The closed list is therefore the single
highest-value thing to audit in the whole guard: an omission there is silent, not loud.

### Two things about my own fix

**The first version of the sweep passed all three R19 mutations.** Every base fixture was in the
announcing state, and an announcing base cannot observe a read that SUPPRESSES a violation — the
verdict is `""` either way. Both polarities were required. This is the third time in this PR that a
default-state assertion proved nothing.

**Two of the three mutations were not valid mutations.** They referenced `attrs` before its
shadowing declaration inside the same block and died with `ReferenceError`, and because I grepped
the output for `AssertionError` the crash was invisible — it read as "the mutation did not fail."
A mutation must stay runnable to be valid, and a filter narrower than "did the suite go red" hides
exactly this.

### R19 finding 2 was a process miss, not a code defect

Spec §6.4 still ratified the semantic-position collector R18 deleted, so the canonical spec
disagreed with the implementation. Invariant 7 makes the spec authoritative; recording a model
change in the handoff is not a substitute for amending it. §6.4 now carries the behavioural model,
the four failed source-reading models, the both-polarities requirement, and why the hand-built
fixtures remain alongside the sweep.

## Self-audit against R20's questions, run before R20 reported

Working the review's own "look hardest" list rather than waiting for it found four more:

| Question | Outcome |
| --- | --- |
| Is the closed list actually closed? | **No.** `alt` was missing — an `<img alt>` child contributes to the enclosing anchor's computed name, and §1.1 already discusses the scanner reading it. Added with `placeholder`, `value`, `label`; a case-sensitive `alt` read now fails by name. |
| Are the bases sufficient? | `hidesFromAccName` walks every ancestor up to the anchor (`tests/styles/_newTabScan.ts:416`), so a one-level wrapper never reached depth ≥ 2. Deep bases added; the ancestor path is mutation-proven via a case-sensitive `inert` read. |
| Can a case-sensitive read still hide? | Only in attribute VALUES, which the sweep deliberately does not vary — `className` tokens are genuinely case-sensitive. The one arguable case, `aria-hidden="FALSE"`, fails CLOSED, so the conservative reading can only cost a false positive. Stated in §6.4. |
| Does any comment still overclaim? | Yes — a test was titled "nameShapedLiterals is blind to reading FORM", the exact claim R19 refuted. Retitled, and the four forms it genuinely cannot see are now assertions instead of prose. |

**Honesty note on the deep bases:** they are NOT independently mutation-provable today, because the
ancestor walk IS uniform — every mutation the deep base catches, the one-level base also catches.
That is recorded in the test comment rather than implied, so a later reader does not cite it as
proven. They guard a future non-uniform walk.

### A gate that does not gate is not a gate

I committed a `spec:lint` hard failure **twice**. `spec:lint` reads any backticked token starting
with `:` as a citation with an empty path, so both a bare `` `:` `` in prose about characters and a
shorthand second citation `` `:439` `` are hard failures. Neither `tsc`, `eslint`, nor vitest sees
them. The reason they landed is the shape of the command: the check ran, printed `1 hard`, and
`git commit` ran anyway because it was chained after rather than conditioned on the result. Every
commit after this point is gated with an `if`.

## R20 — the sweep varied one axis and assumed the other

R20 (NEEDS-ATTENTION, two HIGHs). It confirmed the four missing name contributors were already
added, then found the live half of the same finding: **every generic fixture pinned the value to
`"v"`, which made the sweep vacuous for any read gated on the value.** Its witness was an ordinary
case-sensitive `class` read that fires only when the value contains `hidden` — `"v"` never does, so
`class` and `CLASS` returned identical verdicts across all four bases while real markup diverged and
a genuinely hidden announcement was accepted.

This is the **same defect as R19's polarity finding, one axis over.** R19: all bases were in the
announcing state, so suppression was unobservable. R20: all bases carried one value, so
value-gated reads were unobservable. Both times the sweep varied exactly the thing under test and
silently held everything else at a single point. The general form is worth carrying: *a differential
check is only as good as the inputs it varies, and every input held constant is an assumption.*

The sweep now crosses each name with the values that reach the scanner's value-dependent branches —
a neutral value, the `class`/`className` `hidden` token, `true`, the `aria-hidden="false"`
exemption, a style object, a style string — plus the bare valueless form boolean attributes take.
Mutation-proven with R20's exact witness.

### R20 HIGH 2 — §6.4 ratified two contradictory contracts

The R19 amendment had been **appended** without deleting the shape-model bullets it superseded, so
§6.4 simultaneously ratified "coverage is decided by literal SHAPE" (now RETRACTED) and "coverage is
behavioural and supersedes the previous model." Writing "supersedes" in prose deletes nothing. A section with two
contracts is worse than one with the wrong contract: the wrong one can be found and fixed, two mean
every later citation of the section is ambiguous.

Three more instances of the same edit-by-addition habit, all in that section:

- a sentence saying three source-reading models failed and then enumerating four (same drift in a
  test comment);
- the R9-era claim that the tripwire "covers every name-producing accessor" — RETRACTED — surviving
  long after R19 proved no source scan reaches a regex literal or an unquoted property key; retracted
  explicitly rather than quietly reworded, so the next reader knows it was once believed;
- a bullet presenting the literal tripwire as the guarantee.

**A near-miss worth recording, because it was mine and it was destructive.** My first attempt at the
deletion sliced from the superseded bullet to what I assumed was the next one and removed **13
unrelated accepted-limit bullets plus the R19 amendment itself** — 11,727 characters instead of
~1,300. Nothing was committed; `git diff --stat` immediately after the edit caught it, and
`git checkout` restored the file. The lesson is the check, not the luck: run `git diff --stat` after
any scripted deletion and read the removed headings back before doing anything else.

## R21 — three BLOCKING, and two were fail-opens in the SHIPPED rule

Every round from R5 to R20 found defects in the guard's machinery. R21 broke that pattern: two of
its three findings were holes in the rule the guard exists to enforce, meaning real markup could
have shipped inaccessible and the guard would have said nothing.

1. **`class` and `inert` were unhandled.** `hidesFromAccName` recognised only `className`. React
   forwards a literal `class` to the DOM (dev warning only), so `<span class="hidden">` genuinely
   hides — and because BOTH casings behaved the same, the casing sweep could not see it either.
   `inert` removes its subtree from the accessibility tree per the HTML Standard, and it was already
   in the guard's own name-affecting list while this function ignored it. That combination is worth
   noting: a list said the attribute mattered, and the code that was supposed to act on it never
   mentioned it. Nothing cross-checked the two.

2. **A closed `<details>` hides its content, and the hiding condition is the ABSENCE of `open`.**
   This is the only hiding condition in the model that an attribute-PRESENCE loop cannot find, which
   is also why `open` was missing from the closed list — nothing in the code ever looked for it.

3. **Phrase-only accessible name.** The guard checked whether the HINT was visible and never whether
   the LABEL still was. `<span aria-hidden="true">Go</span> <NewTabHint />` passed, and both
   installed accessible-name implementations compute the name as `"(opens in a new tab)"` alone —
   strictly worse than no announcement, because the link stops saying where it goes. The `aria-label`
   path had carried this rule as `phrase-only` since R1; the content path never did. One mechanism,
   two paths, and only one of them enforced it.

Live census stayed 23 anchors / 0 violations throughout, so no shipped anchor relied on any of these
holes — but that is luck about current markup, not evidence the rule was sound.

### The fix introduced two false positives, found by probing rather than by review

`hasDestinationContent` first required literal TEXT, so both of these were reported as having no
destination:

```
<a ...><Label /> <NewTabHint /></a>
<a ...><img alt="Go" /> <NewTabHint /></a>
```

A component renders text the scanner cannot see, and an `<img alt>` contributes its alt to the
computed name. The corrected rule treats any NON-HIDDEN element as opaque and therefore a possible
destination; only a provably hidden subtree does not count. R21's witness still reports, because an
aria-hidden or class-hidden label IS hidden and nothing outside the hint survives.

A third defect in the same fix: fragments. The first attempt spread a `JsxFragment` into an object
shaped like a `JsxElement`, which every `ts.isJsxElement` guard then rejected, so `<>Go</>` was still
reported. The walk now runs over a child list, shared by both.

All four clauses of the corrected rule are mutation-proven separately. The fourth needed a **new
test first**: dropping the empty-expression check changed no result, which meant nothing covered
`{/* comment */}` and the clause could have rotted into a fail-open unnoticed. A mutation that does
not fail is information.

### §6.4 premise narrowed, because it was too strong

The section claimed an attribute outside the closed list "cannot change an accessible name" -- RETRACTED, because it is false: `data-*` is open-ended and `[data-state="closed"] { display: none }` hides a subtree. The true
and sufficient statement is narrower — **HTML attribute names are ASCII case-insensitive**, so
`DATA-STATE` and `data-state` produce identical DOM and match the same selector, and casing therefore
cannot be the defect outside the list. That is all the sweep asserts. CSS-driven hiding is now an
explicit accepted limit: the scanner recognises intrinsic hiding (`hidden`, `aria-hidden`, `inert`,
closed `<details>`, hiding class tokens, inline `display:none`/`visibility:hidden`) and does not read
the repo's stylesheets, because doing so would mean embedding a CSS engine.

## R22 — three more shipped-rule fail-opens, and a mechanism replaced

R22 raised three BLOCKING and one HIGH; the HIGH was the false-positive pair already fixed one
commit outside the range it read. The three BLOCKING were all holes in the enforced rule:

- **`<template>` and `popover`.** Template content is never rendered, and an unshown popover is not
  rendered until invoked. Both are intrinsic HTML semantics, so neither was covered by §6.4's
  selector-driven-CSS exemption — the exemption had been doing more work in my head than on paper.
- **`<details>` closed-detection.** It caught only an absent `open` or a literal `false`. React omits
  the attribute for **every** falsy value, so `open={0}`, `open={null}`, `open={undefined}` and a
  dynamic `open={isOpen}` all render closed. `open` must be provably true; anything else fails
  closed.
- **The destination rule accepted the required separator as a destination.**
  `<span aria-hidden="true">Go</span>{" "}<NewTabHint />` satisfied the space rule AND the
  destination rule simultaneously, while the computed name was the phrase alone. One rule's required
  element was another rule's evidence.

### `hasDestinationContent` took four defects, all the same mistake

| Round | Wrongly treated as opaque |
| --- | --- |
| self-probe | a component child (`<Label />`) and `<img alt="Go" />` |
| self-probe | a fragment, because it was spread into an object shaped like a `JsxElement` |
| self-probe | `{" "}`, `{null}`, `{false}`, `{undefined}` |
| R22 | the separator `{" "}` in the presence of a hidden label, and `{c ? null : null}` |

Every one was a **decidable** case sitting in the undecidable bucket. Literal emptiness is now one
`rendersNothing` predicate rather than four ad-hoc checks, and §6.4 states what remains in that
bucket: a genuinely dynamic expression that renders nothing at runtime. If a fifth defect appears on
the decidable side, the shape list is the thing to replace, not extend.

### The documentation finding earned a mechanism, because careful editing failed three times

R22 found the refuted claim — that an attribute outside the closed list "cannot change an accessible
name" — alive in **three** places while §6.4 called it too strong. Counting R20's discovery of two
contradictory §6.4 contracts, that is three separate amendments in this PR that left superseded text
standing.

Per the three-round rule the response is a mechanism, not a fourth careful edit. A test now pins each
refuted claim and permits it only where a retraction appears within three lines. **It matched its own
`REFUTED` array on first run** — correctly, since that array does contain the claims — and the fix
was to label the array as what it is rather than to weaken the check.

Reusable form: when a claim is refuted, add its exact wording to a guard at the same time as
retracting it. Prose review does not reliably find the copies; a string match does.

## R23 — the round that caught my own assertions being wrong

R23 raised three BLOCKING and two HIGH. One (`<datalist>`) was already fixed in a commit it could
not see. The rest were real, and two of them were **my tests asserting the wrong thing**:

- A control asserted `open=""` means an OPEN `<details>`. React coerces a boolean DOM prop, so an
  empty string is falsy and the attribute is omitted — it renders closed.
- A pin asserted `{c && null}` is provably empty. `a && b` evaluates to **`a`** when `a` is falsy, so
  `0 && null` renders the character `"0"`. My rule inspected only the right operand, which made it
  wrong in BOTH directions: `false && "Dest"` renders nothing and was called a destination, while
  `0 && null` renders "0" and was called empty, manufacturing a violation.

Both encoded my belief about React rather than React's behaviour, and both survived every earlier
round because reading a test cannot detect that. The reviewer executed React 19.2.4 and
`computeAccessibleName`; that is what caught them. The fix was to correct the tests, not the code.

`{true}` was the third: React renders nothing for BOTH booleans. It DOES render numbers, so `{0}`
prints "0" and remains a destination.

### The refuted-claim guard had a hand-written file list, which drifted exactly like prose

It scanned three files and not the handoff, where the refuted assertion was alive in **four** more
places. Its retraction test was also a vocabulary guess — any nearby "narrowed" or "superseded"
licensed a claim, which is the same match-prose-as-text shape that had already failed twice in this
PR. A retraction must now say `RETRACTED` literally, and the file list covers every artifact this PR
writes prose into, with an assertion that each path exists.

### Measuring instead of reasoning, as the standing response

R23's lesson generalises past its own findings: any claim about accessible names should be measured.
Rendering each shape and computing the name (§6.4 carries the table) confirmed four rules and
revealed that **the harness models neither `inert` nor a closed `<details>`** — both compute
`"Go (opens in a new tab)"`. Both installed implementations of `dom-accessibility-api` agree, so it
is not a version artifact.

That gap is now pinned as a test rather than left implicit, because the failure mode it invites is
specific: someone checks one of those rules against `toHaveAccessibleName`, sees disagreement, and
relaxes the guard to match the harness. The guard is deliberately stricter, and a
`toHaveAccessibleName` assertion cannot catch either regression.

## R24 — a conceptual error, and two more classes of unrendered content

R24 raised three BLOCKING and one HIGH. Three were shipped-rule fail-opens, and the middle one was
not a missed case but a **wrong model**.

### Falsy and renders-nothing are orthogonal

`rendersNothing` had been treating JavaScript falsiness as a proxy for "React renders nothing". They
do not line up in either direction:

| Expression | Falsy? | Renders |
| --- | --- | --- |
| `[]` | no, arrays are always truthy | nothing |
| `{}` | no, objects are always truthy | nothing |
| `0` | yes | the character `0` |
| `null` / `undefined` / `false` / `true` | mixed | nothing |

So `{[] && "Dest"}` manufactured a violation (the array is truthy, the result is `"Dest"`), while
`{({}) && null}` and `{[null]}` were accepted despite computing to the phrase alone. There are now
two separate predicates — `isLiteralFalsy` and `isLiteralTruthy` — and an array renders nothing iff
every element does.

The lesson generalises past this rule: when a predicate is named for one property and used for
another, it will be wrong in both directions at once, and a test suite built from the same confusion
will not notice.

### A hint that may not render is not an announcement

Generic AST traversal entered constructs whose execution is conditional:

- `||`: a hint in the right operand renders only when the left is falsy. `{true || <NewTabHint />}`
  read as an unconditional hint while React renders none.
- callbacks: `{e && xs.map(() => <NewTabHint />)}` counted a hint that an empty collection never
  produces.

`||` now records `!(left)` as a condition. Function bodies are not descended at all — the
fail-closed answer, since a hint inside a callback cannot be proven to render. No live anchor does
this, so the strictness costs nothing today.

### A wrapper whose only content is the hint is not a destination

Any non-hidden element counted as a destination wholesale, so `<span> <NewTabHint /></span>` passed
while computing to the phrase alone. Elements with children are now recursed into.
`<input type="hidden">` joined the intrinsic-hiding set.

### Two mutations that passed, and what they meant

Six clauses were mutated; four failed immediately. The two that did not were the useful ones:

- Nothing could tell whether arrays counted as truthy — every existing case gave the same verdict
  either way. `{[] && null}` distinguishes them and is now pinned.
- The refuted-claim marker binding could not fail, because every real marker already sat on its own
  line. The rule is now exercised on **synthetic** input: a guard that only runs on files it already
  passes cannot be shown to work.

That marker rule was itself an R24 finding — the marker had been position-only, so an unrelated
"RETRACTED: the moon-is-cheese claim" three lines away licensed a stale claim. It must now sit on
the claim's own line.

## R25 — and the inversion that should have happened three rounds earlier

R25 raised four BLOCKING and one HIGH:

- **Hints in non-render positions.** `x ?? <NewTabHint />` renders only when `x` is nullish;
  `drop(<NewTabHint />)` is a call argument, which the callee decides, exactly like the JSX-attribute
  case closed back at R4; `(<NewTabHint />, null)` evaluates to its last operand.
- **Self-closing elements that name nothing.** `<br />`, `<img alt="" />` and
  `<input type="text" />` beside the hint each computed to the phrase alone. An empty `alt` is
  explicitly "no name", not "some name".
- **Three statically-empty expression forms**: a spread of an empty array, an array hole (`[,]`),
  and `void 0`.
- **`<input type="HIDDEN">`** compared case-sensitively, while the DOM normalises `input.type`.
  Scoped deliberately — `type` is one of the few attribute VALUES that is case-insensitive, and
  className tokens are not.
- **HIGH:** the refuted-claim guard split on LF/CRLF in production and LF alone in its own synthetic
  self-test, so a CR-only / U+2028 / U+2029 file put an unrelated retraction and a stale claim on one
  "line". Fourth line-terminator defect in this PR, and the first inside a guard written to stop
  drift. Both sites now share the scanner's exported `LINE_TERMINATORS`.

### The inversion

R25's three discard-positions prompted a probe rather than three patches, and it found **six more**:
an object-literal property, a template substitution, `void`, `typeof`, `!`, and property access.

That settled it. Listing positions that DISCARD a hint is unbounded; a JSX child expression renders
its **value**, so the set of forms that PRESERVE that value is closed and finite: the expression
itself, parenthesised / `as` / `satisfies` / non-null wrappers, both conditional branches,
`&&` / `||` / `??` operands with their conditions, the last operand of a comma, array elements, and
JSX children. Everything else is not a render position and fails closed.

**This is the same inversion that fixed the main shape rule at R5**, and in hindsight it should have
been applied to hint discovery at the same time. The tell was identical — each round produced a new
member of an unbounded set — and it took R22 through R25 plus two self-probes to recognise the shape
in a second place. That is the cost of fixing instances when the model is what is wrong.

An allowlist carries the mirror-image risk: reporting CORRECT code. Six render positions are
therefore pinned as must-accept cases beside the eight must-report ones, and both directions are
mutation-proven — restoring the generic fall-through reopens the object-literal fail-open, and
dropping array elements starts reporting `{[<NewTabHint />]}`, which renders perfectly well.

### A third assertion of mine was wrong

A control asserted `<input type="text" />` beside a hint is acceptable. It is not: a bare void
element contributes no accessible name. Running tally of my own assertions this reviewer has caught
encoding belief rather than platform behaviour: `open=""` (R23), `{c && null}` (R23),
`<input type="text" />` (R25). Every time the fix was the test, not the code.

## R26 — an infra fault, and what measuring found while it re-ran

R26's first dispatch returned `no_verdict`: three attempts, all killed, two on `stall` and one on
`attempt_timeout`. Per the project's own note that is an INFRA fault and never "the reviewer found
nothing". Root cause was codex-guard's default `STALL_SECS` of 420 — seven minutes without output on
a review this large is not unusual. Re-dispatched with `--stall-secs 900`.

### Measuring beat reasoning twice more, and confirmed it once

The standing lesson from R23 is to measure claims about accessible names rather than reason about
them. Applied to the void-element branch of the destination rule, it corrected the rule in BOTH
directions:

| Shape | Computed name | The rule had it as |
| --- | --- | --- |
| `<span title="Go" />` | `(opens in a new tab)` | a destination — **fail-open** |
| `<input type="text" value="Go" />` | `Go (opens in a new tab)` | no-name — **false positive on real markup** |

`title` is only a name FALLBACK, and an anchor with content already has a name source, so it
contributes nothing there. `value` genuinely does. Both mutation-proven in opposite directions.

Applied to the `hidden` / `aria-hidden` VALUE rules — which had carried prose justifications from
R1 and R2 for twenty-five rounds without ever being measured — it **confirmed** all six. That is
worth recording precisely because the previous three checks corrected me: the R1/R2 reasoning was
sound.

Those six are now pinned anyway, for the asymmetry: `aria-hidden="false"` is VISIBLE while
`hidden="false"` HIDES, because a non-empty string is truthy for a native boolean attribute and React
renders `hidden=""`. The two lines look collapsible and are not.

**Running tally for the measure-vs-reason question:** four corrections (`open=""`, `{c && null}`,
`title`, `value`), one confirmation (the six value rules), and one documented capability gap (the
harness models neither `inert` nor a closed `<details>`, so the guard is deliberately stricter there).

### A flake I had twice dismissed as noise

Two full-suite runs reported `1 failed | 232 passed`; I re-ran, saw green, and blamed a race with my
own prettier write. It was the behavioural casing sweep timing out: 7 values × 6 placements × 3
spellings × ~100 attributes had grown to ~6.2s against vitest's 5s default. The failure text said
`Test timed out in 5000ms` the first time — three lines below the count I was grepping.

A green re-run narrows the cause to something timing-dependent, which is exactly the set containing
real defects. It is not a diagnosis. Explicit 60s timeout, three consecutive clean runs.

## R27 and R28 — spelling, then binding, then binding at the use site

Three rounds on one question, each answer sound and each incomplete:

| Round | The guard checked | Defeated by |
| --- | --- | --- |
| before R27 | that the element is spelled `NewTabHint` | `const NewTabHint = () => null` |
| R27 | that the file imports `NewTabHint` | shadowing that import inside a component |
| R28 | that the binding holds AT THE USE SITE | (nothing found since) |

R27's fix was right and insufficient: an import existing somewhere in the file says nothing about
what the identifier at the JSX site resolves to. R28's fix walks the enclosing function and block
scopes and parameters, including **destructured** parameters (`({ NewTabHint }) => …`), which is the
idiomatic way a React component would shadow it. An **aliased** destructure
(`{ NewTabHint: other }`) binds a different name and is correctly not a shadow.

The lesson is the ladder, not any rung: "is this the thing I think it is" has three progressively
stronger answers, and the first two both look like verification.

### The destination rule was narrowed rather than refined a fourth time

R27 measured that a control contributes its VALUE while a non-control contributes its `aria-label`,
and encoded that as a tag-based split. R28 measured further and broke it in both directions:

| Shape | Computed name |
| --- | --- |
| `<input type="checkbox" value="Go">` | `(opens in a new tab)` — value does NOT name |
| `<input type="checkbox" aria-label="Go">` | `Go (opens in a new tab)` — label DOES name |
| `<button aria-label="Go">` | `(opens in a new tab)` — label does NOT name |

Real AccName varies by ROLE and by input TYPE. Rather than approximate it a fourth time, the approved
shape was narrowed to what is unambiguous: rendered TEXT, and `alt` on an image. **The guard is now
deliberately STRICTER than AccName on nested-element attributes.** That is a stated posture, chosen
after measuring that no live anchor relies on a nested attribute for its label, so it reports nothing
today and a future case takes one exemption.

This is the R5 principle applied a fifth time: where a property is undecidable or intricate, narrow
the approved shape so the question does not arise.

### Two of the guard's own meta-checks caught this work's fallout

Narrowing the model left `value` / `defaultValue` unread and `select` / `textarea` unmentioned. The
reverse cross-check (added at R21 precisely because a list and its code had silently disagreed) and
the stale-exclusion check both fired immediately. Neither was a review finding; the guard caught its
own author, which is what those two assertions exist for.

### The flake's real fix

The import lookup was asked once per ANCHOR and walked every import statement of all 246 files.
Caching it per source file took the live-census test from 3023ms to 804ms. The earlier explicit
timeouts were correct but were treating a symptom; this removes the cost.

## R29 — and the counting error worth more than the code findings

Three code findings, each a member of a class this PR had already visited:

- **Shadowing forms the scope walk missed:** a loop binding (`for (const NewTabHint of hints)`), a
  named function expression (`const A = function NewTabHint() { … }`), and a catch clause. R28 taught
  that a binding must be resolved at the use site; R29 showed the resolution itself was incomplete.
- **`rendersNothing` missed prefix booleans and literal-test conditionals.** `{!true}` is `false`;
  `{true ? null : "Dest"}` renders nothing because a LITERAL test picks the branch, and requiring
  both branches empty was too weak.
- **`<rp>` was absent from the non-rendered set**, which is `display: none` per the HTML Standard's
  hidden-elements rules. The set is now taken FROM that list rather than hand-assembled — the thing
  R23 claimed to have done. Claiming to use an external authority and then curating by hand is a
  distinct failure from getting a list wrong, and it produced two rounds of findings.

### The documentation finding was a reasoning error

The spec said the family occupies 17 files. It was **16** before the CrewPageLink deletion and is
**15** now — while the anchor count was correct throughout.

§1.3 had already recorded the composition change: `AttentionMenu` left the family, and
`AttentionBanner` gained a second anchor. That holds the ANCHOR total at 23 and reduces the FILE
total from 17 to 16. I re-derived the anchor total, saw it unchanged, and wrote "still 23 anchors" —
which then read as "nothing moved". §1.3 even carried a warning not to treat unchanged totals as
evidence nothing changed, and the warning did not save me, because I had only re-derived the number
that happened not to move.

**A per-file count and a per-anchor count over the same set are independent measurements.** When
composition changes, every derived figure needs re-deriving, not just the one that looks load-bearing.
§1.4 now shows all three columns — as-written, actual-before-deletion, current — so the error is
legible rather than silently corrected.

### Three mutation sweeps, six gaps, none of them review findings

Across `hidesFromAccName`, `rendersNothing`, the destination walk, the hint-walk allowlist and
candidate admission — roughly 36 decision clauses:

| Gap | Disposition |
| --- | --- |
| `<input type="hidden">` branch | DEAD (void element, can never be an ancestor; the narrowed model already rejects it) — deleted |
| `aria-hidden="false"` exemption | unpinned at the SCANNER level; the behavioural suite pins what the HARNESS computes, a different assertion |
| objectLiteral branch of `rendersNothing` | never exercised — every case had the object as `&&`'s LEFT operand |
| comma expression's RIGHT operand | only the left-operand case was pinned, so the clause was unverified |
| component NESTED inside the anchor | untrusted, but no test covered it |
| explicit hint exclusion at the top of the walk | subsumed by the untrusted-component rule; kept, comment corrected so nobody preserves the wrong line |

Twenty-nine review rounds found none of these, and that is not a criticism of the reviewer: a review
examines what it is pointed at, and a sweep examines what the code actually branches on. They are
different instruments. The sweep costs one scripted loop per surface and should have run at R10.

## R30 — and the error class worth more than any single fix

R30 raised four BLOCKING plus the stale summary. Two are ordinary (a comment inside a style object
defeating a raw-text matcher; four more lexical scopes for the shadow walk, including module scope,
where a top-level redeclaration is an error and this guard's stated policy is not to adjudicate
validity, so it fails closed). Two are not.

**My own R29 fix was half a fix.** I made prefix-boolean handling depend on the operand being a
decidable literal, so `{!label}` and `{n > 0}` stayed fail-open. React renders NEITHER boolean, so the
operand never mattered. The corrected rule is grammar-closed — `!x`, the eight comparisons,
`instanceof`, `in`, `delete` — with `typeof` excluded because it yields a STRING, pinned as the
boundary. A fix that addresses the reported instance while leaving the general case open looks like
progress and is a smaller fraction of the work than it appears.

**The `<title>` reason was factually wrong, and that is a distinct error class.** I had written that
metadata elements "cannot meaningfully occur inside an anchor". React 19 HOISTS a nested `<title>`
out, so its text genuinely never reaches the name — the conclusion happened to be safe, the stated
reason was false, and the element did need handling.

That is the second time in this PR I was wrong about BEHAVIOUR rather than about a LIST:

| Round | The claim | The reality |
| --- | --- | --- |
| R23 | the non-rendered tag set "names the HTML Standard's categories" | it was assembled from memory; `<rp>` was missing |
| R26b | metadata elements cannot occur inside an anchor | React 19 hoists `<title>`; the element renders nowhere useful, for a different reason |

Both passed every list-correctness check, because the list was never the defect. **A wrong reason
survives review far longer than a wrong entry**, since a reviewer checks what a rule does rather than
why it claims to be safe.

### The response: measure the premises, don't argue them

So the spec was audited for behavioural claims that existed only as prose, and the load-bearing one
was measured:

**React normalises a non-lowercase attribute NAME rather than dropping it.** Everything about the
casing apparatus rests on this — the behavioural sweep, the lowercase tripwire, the closed list. If
React dropped such attributes, `TARGET="_blank"` would not open a tab and the whole mechanism would
guard nothing. Measured: `TARGET="_blank"` renders `target="_blank"`, and `ARIA-HIDDEN="true"` renders
`aria-hidden="true"` with the name computing to `"Go"`. Pinned.

The non-rendered tag set is now stated EXACTLY, on the third attempt, with every exclusion measured
rather than argued: `link`, `meta`, `base` and `area` are excluded because React THROWS on their
children ("is a self-closing tag and must neither have `children`") so none can ever hold a label;
`head` and `basefont` are excluded because they measurably RENDER here and are structurally absurd
inside an `<a>` with no live usage. `noscript` is documented as a stricter-than-harness case beside
`inert`: `display: none` only when scripting is enabled, so a real browser does not render it while
the harness computes `"Go (opens in a new tab)"` — with an explicit instruction not to "fix" the guard
to match a `toHaveAccessibleName` result there.

### Two CI signals, triaged in opposite directions

One was REAL and no local run could have caught it: upstream's orphan-removal commit added a
filesystem guard forbidding a deleted component's identifier anywhere under `app/`, `components/` or
`tests/`, and the comment explaining the census change named it. My merge resolution was right about
the code and wrong about the prose.

One was an ARTIFACT: `validation-schema-parity` reported failing while a superseded run was
mid-transition. Verified three ways — the diff touches no `supabase/` files, the gate passes on `main`,
and the job's `conclusion` was `null`. The monitor was then fixed to withhold failure reports until
every required context has reported, because the cost of mis-training on noise is waving through the
real one.

## R31 — eight findings, six code fixes, and the false-positive direction

Every R31 finding was in the guard; the shipped behaviour and the live census (22 anchors, 0
violations) were untouched, as they have been since R4. What makes this round worth reading is the
DIRECTION of the errors: **four of the six code defects were false POSITIVES** — the guard reporting
markup that renders a perfectly good announcement.

| # | Finding | Direction |
| --- | --- | --- |
| 1 | `aria-labelledby` outranks `aria-label`; an anchor with both never announces | fail-OPEN |
| 2 | `{<span aria-hidden="true">Go</span>}` treated as opaque, so a non-destination counted as one | fail-OPEN |
| 3 | `var NewTabHint` in a block shadows a use site outside it, invisible to an ancestor walk | fail-OPEN |
| 4 | `display: ("none")` missed by the raw-text matcher | fail-OPEN |
| 5 | An SVG `<title>` renders and NAMES; the guard reported it as no-destination | false positive |
| 6 | `hidden={undefined}`, `popover={false}` read as hiding when React omits the attribute | false positive |
| 7 | The always-boolean set was called closed and pinned in part | untested branch |
| 8 | Docs contradicted the code and each other | stale |

A fail-open hole is the failure this guard exists to prevent, so it gets the attention. But a guard
that reports valid markup is not "safely conservative" — it is how a guard earns the exemptions that
eventually hollow it out, and the exemption is permanent while the false positive that motivated it
is forgotten. Findings 5 and 6 would each have produced one.

### The mechanism was wrong twice in the same fix, and mutation caught both

My first pass on finding 6 routed `aria-hidden` through the same omission helper as `hidden` /
`popover` / `inert`. It produced the CORRECT verdict for `aria-hidden={0}` — visible — by a false
route: React drops a falsy value from a coerced BOOLEAN attribute, but keeps it on a STRING one and
really does render `aria-hidden="0"`. Because the wrong route answered first, the branch stating the
real reason was unreachable, and a mutation deleting that branch entirely changed no test.

The second attempt passed a `kind: "boolean" | "string"` flag. A mutation that ignored the flag
outright ALSO changed no verdict — no falsy `aria-hidden` value hides under either reading — so the
flag documented a distinction it could not affect. **An equivalent mutant is a verdict, not a
nuisance.** The third shape is two separate functions, `omittedByReact` and `ariaHiddenHides`, each
stating only what is true of its own attribute type; every branch of both is now individually
mutation-pinned (14 mutations, all red).

This is the R30 error class recurring inside its own fix: right answer, wrong reason, and the wrong
reason is what survives review, because a reviewer checks what a rule DOES.

### The spec's account of `aria-hidden` casing was backwards, and measurement settled it

§6.4 claimed the scanner exempted only the exact literal `false`, so `aria-hidden="FALSE"` was
reported — and called that a safe fail-closed reading. Measured against BOTH installed AccName
versions, they agree that only the exact, untrimmed, lowercase `"true"` hides: `"TRUE"`, `"True"` and
`" true "` are all VISIBLE. So the scanner's case-fold makes it **stricter than the harness**, in the
same family as `noscript` and `inert` — justified because a browser may fold an enumerated ARIA value
where `dom-accessibility-api` does not, and a silently unannounced link costs more than a reported
valid one. Both sides of the divergence are now pinned: the behaviour suite measures the harness, the
scanner suite asserts the guard reports the folded spellings. The old paragraph reached a defensible
posture through a false premise, which is the third instance of that shape this round.

### Two of the guard's own meta-checks caught my edits mid-flight

The stale-exclusion check flagged `false` the moment folding the hiding attributes removed its
comparison; the attribute-classification check flagged the new tag names `svg` and `foreignObject`,
and later the `"boolean"` / `"string"` flag values. Both fired within seconds of the edit that
invalidated them. Meta-checks that police the guard's own bookkeeping keep paying for themselves —
they are the only mechanism here that has never needed a review round to find its own defect.

### A fail-open hole in the R31 fix itself, found by following the reviewer's probes

While R32 was still running, its stderr showed it rendering `<svg><div><title>` and `<svg><p><title>`
and reporting namespaces. That was enough of a signal to go measure the shape myself rather than wait
for the finding — and the R31 fix had a fail-OPEN hole in it:

| Shape | Accessible name | R31 fix said |
| --- | --- | --- |
| `<svg><title>Go</title></svg>` | `Go (opens in a new tab)` | destination — correct |
| `<svg><g><title>Go</title></g></svg>` | `(opens in a new tab)` | destination — WRONG, no violation reported |
| `<svg><div><title>Go</title></div></svg>` | `(opens in a new tab)` | destination — WRONG |

`inSvgNamespace` asked "is there an `<svg>` anywhere above me", stopping at `<foreignObject>`. Per
SVG-AAM an `<svg>` is named by its OWN direct-child `<title>`; a deeper one names its nearest graphics
container, which is not the anchor's name. The rule is now a direct-parent test, and both the
ancestor-walk shape and a dropped tag check fail tests.

**The measurement also found a genuine divergence between render paths.** For `<svg><div><title>`, a
CLIENT React render keeps the title in the SVG namespace (`createElementNS` inherits from the parent)
while SSR markup reparsed by the HTML parser breaks out to XHTML. The two disagree on namespace and
AGREE on the verdict. That is why the rule tests the direct parent instead of tracking namespace: a
namespace-modelling rule would have to stay correct under two different rule sets, for no gain.

Two process notes. First, `foreignObject` left the scanner when the walk became a parent test, and the
stale-exclusion meta-check flagged it within seconds — the third time this round that a meta-check
caught the bookkeeping consequence of an edit before any test did. Second, this is the R31 pattern
recurring once more: the previous fix reached the right verdict on the case it was written for
(`<svg><title>`) while being wrong about the mechanism (namespace, not parentage), and the wrong
mechanism is what opened the hole one level down.

## R32 — seven findings, and the one I had already fixed

R32 reviewed `5e93e9d49`, one commit behind. Its BLOCKING 1 is the SVG `<title>` ancestor-walk hole
recorded in the previous section — found independently, from the same probe trail, and already fixed
in `11d54ab5a`. Independent arrival at the same defect is worth noting: it was reachable from the
code, not a lucky guess.

The other six were all real, and the shape of the round repeats R31's:

| # | Finding | Direction |
| --- | --- | --- |
| 2 | `stringOf` discards template substitutions, so `aria-hidden={`${true}`}` scanned clean | BOTH |
| 3 | `popover` treated as a boolean attribute when it is ENUMERATED | BOTH |
| 4 | `expressionDestination` left `&&` / `\|\|` / `??` / both-branch conditionals / literal-array spreads opaque | fail-open |
| 5 | Style matched as raw TEXT, so a comma expression and a literal conditional slipped through | fail-open |
| 6 | `hoistedBinds` crossed namespace and class-static-block scopes, and counted block-scoped functions | false positive |
| 7 | `isLiteralFalsy` missed `-0`, `NaN` and `0n` while claiming to cover every falsy value | false positive |

**Findings 2 and 3 were wrong in BOTH directions from a single mistake**, which is the most useful
thing in this round. One weak value-read made `aria-hidden={`${true}`}` fail open AND
`aria-hidden={`true${false}`}` a false positive; one wrong attribute CATEGORY made five preserved
`popover` values fail open AND the two omitted ones false positives. A defect in how a value is
CLASSIFIED does not have a direction — it produces both, and finding one half is not evidence the
other half is absent.

**Finding 6 retracts a choice I defended one round earlier.** R31 added block-level `function`
declarations to the shadow walk, described as "stricter than the language, which is this guard's
stated policy". These files are ES modules, so strict mode makes such a declaration block-scoped: it
cannot reach a use site outside its block, and reporting it is simply wrong. "Deliberately stricter"
is only a defence when the strictness tracks a real runtime difference — as it does for `noscript`,
`inert` and the `aria-hidden` case-fold, each of which has a measured browser-vs-harness divergence
behind it. It is not a defence when it rejects code an author would reasonably write.

**Finding 5 forced the model change the previous four rounds were avoiding.** Each of R27, R28, R30
and R31 deleted one more transparent wrapper from a raw-text matcher, and each time the comment was
updated to claim the set was now complete. It never was, because deletion cannot evaluate. Reading
the object literal through the AST ends the series and retires two special cases with it.

### A branch of my own fix was unreachable, again

I added a comma-expression branch to `staticStringValue` and another to `expressionDestination`. A
mutation deleting the first changed no test — because `unparen` has resolved comma expressions to
their right operand since R13, before either function sees the node. Both branches were deleted
rather than kept as comments claiming a mechanism they do not provide. That is the third
equivalent-mutant this PR, and the second inside a fix written to close a review finding.

### CI note

The Vercel check on `11d54ab5a` failed with `upgradeToPro=build-rate-limit` — an account build-rate
limit, not a code failure, and Vercel is not one of the twelve required contexts.

### Branch sweep over the R32 fixes, run before R33 reported

Every branch of the five new or rewritten functions was mutated individually while R33 was still
running. Six survived, and each one was a real gap the review rounds had not reached:

| Survivor | What it meant |
| --- | --- |
| `staticStringValue` true-keyword arm | the `` `${true}` `` fixture passed via the FAIL-CLOSED default, not by evaluating — it could not tell the two apart |
| template dynamic-substitution guard | no fixture had a dynamic substitution at all |
| `styleObjectHides` non-assignment arm | no fixture had a spread or shorthand in a style object |
| `isNamingSvgTitle` non-element parent | a genuine FALSE POSITIVE — see below |
| `hoistedBinds` var-only check | nothing proved `let` / `const` in a sibling block are NOT shadows |
| conditional both-branches-true arm | verdict-identical to falling through: the caller reads `null` as "assume a destination" |

**The first is the sharpest.** A fixture asserting `` aria-hidden={`${true}`} `` reports proves
nothing about evaluation, because an undecidable value also reports. The fixture that pins it is
`` `${true}x` `` — accepted only if the boolean was really rendered into the string. A test whose
expected outcome matches the fail-closed default cannot detect the loss of the code it was written
for; this is the same "right answer for the wrong reason" that has now appeared five times in this PR,
in a test rather than in the implementation.

**`isNamingSvgTitle` had the false-positive twin of the hole it fixed.** The ancestor walk was too
wide; the literal parent test was too narrow. `<svg>{<title>Go</title>}</svg>`, a fragment, and
`{[<title/>]}` all render the title as the svg's own child and all NAME (measured), and all three were
reported. The rule now walks up to the first JSX ELEMENT — transparent wrappers are skipped, and
stopping at the first element is what keeps `<svg><g><title/></g></svg>` correctly out. Both the
too-wide and too-narrow shapes now fail tests.

Two branches were DELETED rather than pinned: the conditional both-branches-true arm above, and a
self-closing-element guard in `isNamingSvgTitle` that could never execute, since a self-closing
element has no children to contain a `<title>`. That brings this PR to five equivalent mutants, four
of them inside fixes written to close review findings. The sweep costs about a minute per branch and
has now out-found two consecutive review rounds on the code they had just reviewed.

### Two more defects, found from R33's probe trail before its verdict

R33's stderr showed it rendering `popover={void 0}`-style values and `var`-in-a-nested-scope shapes.
Measuring those directly, before the verdict, found two defects — **both introduced by my own R32
fixes**, one in each direction:

**A fail-OPEN hole in the R32 scope fix.** R32 HIGH 6 said `hoistedBinds` wrongly crossed namespace
and class-static-block boundaries. I stopped the downward scan from ENTERING them — correct, since a
`var` in there cannot reach a use site outside — but did only that half. A use site INSIDE one of
those scopes is shadowed by a `var` in a sibling block within it, and after the fix nothing scanned
that scope at all. Measured: `namespace N { if (1) { var NewTabHint = () => null; } … }` rendered
`<a>Go </a>` with no announcement and scanned clean. **A scope boundary is a boundary in both
directions**, and fixing one direction of a two-directional rule is how the previous fix's own hole
got made.

**False positives on `popover`.** `popoverHides` checked the four literal spellings of "React omits
this", so `popover={void 0}`, `popover={a === b}`, `popover={!x}` and `popover={cond ? true : false}`
were all reported, though each provably produces a boolean or undefined and React drops it.

Fixing the second surfaced a distinction worth stating, because the obvious shared helper would have
been wrong: **`hidden` and `popover` disagree about booleans.** For a BOOLEAN attribute the two
booleans differ — `hidden={true}` renders `hidden=""` and hides — so an always-boolean expression is
UNDECIDABLE there and fails closed. For an ENUMERATED attribute React drops EITHER boolean, so the
same expression is provably harmless. Two predicates: `isProvablyNullish` (shared) and
`reactOmitsValue` (nullish plus booleans, used only by `popover`). My first fixture asserted
`hidden={a === b}` should be accepted, and the failing test is what surfaced the distinction — the
fixture was wrong, not the code.

`isAlwaysBoolean` was extracted from `rendersNothing` rather than copied, since two rules now need
it and a second copy is a drift source. Five mutations, all red.

## R33 — nine findings, three already fixed, and the value-classification theme

R33 reviewed `29bf198e3`; the worktree had advanced during the review, so three of its nine were
already closed: the namespace/static-block scope hole (#1) and the `popover` false positives (#7),
both fixed in `b9b8e192c` after reading its probe trail, and the equivalent conditional arm (#9),
deleted during the branch sweep. Independent arrival at all three is worth recording — they were
reachable from the code, not lucky guesses.

The six that were live all belong to ONE theme: **the scanner kept asking "is this a literal?" when
the question is "is this decidable?"**

| # | Where | Fail-open half | False-positive half |
| --- | --- | --- | --- |
| 2 | operand selection | `{-1 && <hidden/>}`, and the same for BigInts, regexes, `typeof`, functions, `new`, JSX | — |
| 3 | zero BigInt by SPELLING (`/^0+n$/`) | `0x0n \|\| <hidden/>` | `hidden={0x0n}` reported |
| 4 | style spreads | `{{...(true ? {display:"none"} : {})}}` | `{{display:"none", ...(true ? {display:"block"} : {})}}` reported |
| 5 | `staticStringValue` | `display: flag ? "none" : "none"` | `` `${null}` ``, `null && "true"`, `null ?? "false"`, … all reported |
| 8 | style KEY case-folded | — | `{{DISPLAY:"NONE"}}` reported |

Four of the six are wrong in BOTH directions, which is now the signature of this class: a
classification defect has no direction.

**Finding 8 is the one measurement settled against me.** React style keys are JavaScript property
names, not CSS ones: `{{DISPLAY:"NONE"}}` makes React emit `-d-i-s-p-l-a-y:NONE`, which styles
nothing. So folding the key's case reported valid markup — and an R32 fixture of mine asserted that
false positive was CORRECT behaviour. The value fold stays, because CSS keywords really are
case-insensitive (`display:"NONE"` hides, measured), and so does trimming, because the CSS parser
tolerates a padded key (`{" display ":"none"}` hides, also measured). Three neighbouring rules, three
different answers, each now measured rather than assumed.

**Finding 4 needed a model change, not a patch.** Properties were scanned independently, but a style
object is an ordered sequence of writes and a spread is a write. It now resolves in source order with
last-write-wins, seeing through a conditional whose branches are decidable. An undecidable spread
makes the whole object opaque rather than being skipped — skipping it would let an earlier hiding
write survive a later unknown one, and the fixture that distinguishes those two behaviours
(`{{display:"none", ...rest}}`) was the last surviving mutation of the round.

Ten mutations, all red. 252 tests green.

### Second branch sweep, over the R33 fixes

Same procedure, run while R34 was in flight. Four survivors, three of them real gaps:

- **`isProvablyNullish`'s both-branches arm.** The obvious fixture — `popover={cond ? null :
  undefined}` — could NOT pin it, because `reactOmitsValue` has a conditional arm of its own and
  reaches the same verdict without it. The path that actually depends on the shared helper is
  `hidden` / `inert`, via `omittedByReact`. **A fixture aimed at the wrong caller looks like coverage
  and is not** — the same defect as a fixture that passes through the fail-closed default, one level
  over: right assertion, wrong route.
- **A style SHORTHAND (`{{display:"none", visibility}}`).** Marking only its own key unknown versus
  treating the whole object as opaque produced identical results on every existing fixture. They
  differ exactly when the shorthand names a DIFFERENT key from the hiding write, and the shorthand
  must not rescue it: that markup really is hidden.
- **`pickObjectLiteral`'s conditional arm**, unpinned until a decidable conditional spread existed.
- Function / arrow / class truthiness, `void`, and template truthiness were already covered.

Running the sweep after each fix round is now the highest-yield step in this PR's loop: two rounds in
a row it found defects in the code the reviewer had just reviewed, and this time it found a coverage
defect the reviewer would not have — a fixture pointed at a caller that could not exercise the rule.

### A fixture that did not parse, and the guard that now catches the class

R34's probe trail showed it testing numeric separators, which surfaced a defect in MY OWN R33
fixture: `0_0n` is a **syntax error** — a numeric separator may not follow a leading zero — so the
two assertions built on it passed vacuously. The scan simply saw a malformed tree and returned
whatever it returned. `0x0_0n` is the valid spelling and exercises the separator path for real.

This is invisible by construction: nothing about a green suite distinguishes "the rule handled this
input" from "this input was never a program". So the probe helper now **fails any fixture whose
source has parse diagnostics**, checked once in the helper rather than per-fixture. All 127 existing
fixtures pass it, and the class cannot recur.

The guard has its own self-test asserting it rejects the exact spelling that fooled the suite, plus a
plainly broken one, and still accepts a valid fixture — a guard nobody has watched fail is
decoration. Disabling it turns that self-test red.

Three fixture-level defects have now been found in this PR, each invisible to a passing suite: an
assertion that matched the fail-closed default, one aimed at a caller that could not reach the rule,
and one that was not valid syntax. All three were found by attacking the TESTS rather than the code.

**A second vacuity guard followed from the same reasoning.** `violations()` returns `[]` both when
the rule ACCEPTS the markup and when the scan never discovered an anchor at all, so every
`expect(violations(...)).toEqual([])` fixture had a second way to pass that carries no information.
All 127 existing fixtures survive the check — it is preventive rather than a bug fix — and it has its
own self-test. Between them the two guards now close the mechanical half of the vacuity class:
a fixture must be a program, and it must actually reach the rule.

What they cannot catch is the semantic half — an assertion whose expected value equals what the rule
would produce with its body deleted. That one still needs mutation, which is why the branch sweep
stays in the loop.
