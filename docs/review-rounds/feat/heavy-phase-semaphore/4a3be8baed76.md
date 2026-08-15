# Round-economy filing — feat/heavy-phase-semaphore

## spec — 13 rounds

**Examined:** thirteen rounds to APPROVE/0 (10/6/3/5/3/3/4/5/2/3/1/1/0; one SIGTERM'd dispatch and one usage-limit dispatch not counted) on
`docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md`. The train's
dominant class is behavior-asserted-without-probe on OS/tool semantics: R1 landed
node-spawn fd non-inheritance and the vitest env-over-serial-pin layering; R2 landed
the worktree-locality of the build lock and the non-atomic config publication; R3 the
resolve-vs-acquire resize race; R4 the inode-identity gap, `os.link` source retention,
and the nested-acquisition deadlock. Every finding that survived carried a runnable
probe, and every accepted repair either deleted a mechanism (worker sizing, R1) or
replaced an argued property with a validated one (post-acquire identity+index check).
Two full reversals occurred on the build-exclusion question (R1 F6 out, R2 F1 back
in), each probe-forced; the decision is now fenced both directions in spec §1.1.

**Judgment:** the round burn was concentrated where the spec asserted semantics of
surfaces outside the repo (kernel flock/fd inheritance, vitest config resolution,
`os.link`) from documentation-level knowledge. The §4.0 probe section shrank rounds it
covered (P1/P2 claims were never re-litigated); every un-probed semantic claim cost a
round. The transferable rule is already in `docs/agents/spec-self-review.md`
(probe-before-argue) — this arc's lesson is that for a design whose ENTIRE substance
is OS semantics, the probe pass must cover every syscall-level claim, not just the
headline mechanism.

**Mechanizable:** none — the escaping class (unprobed external-semantics claims) has
no static signature `spec:lint` could match without probing the semantics itself;
`CITATION_FILE_MISSING`/numeric sweeps already ran clean on every round.

## plan — 4 rounds

**Examined:** four rounds to APPROVE/0 (3/4/3/0) on
`docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md`. Every finding was a
plan-discipline defect, none a design defect: R1 — task-green scope wider than its
tested cases, ambient reentrancy marker vacuating the dogfooded suite's fixtures,
post-merge tree mutation; R2 — a warn-cadence sliver still ahead of its first oracle,
an untested AGENTS.md prose contract, the closeout not using the priority convention
it ships, and a mechanically-impossible corpus-row sequencing requirement; R3 — an
AC's claimed coverage wider than its case body, an unobserved guard RED, and the
string-guard's missing operator enumeration.

**Judgment:** the spec's 13-round hardening left nothing design-shaped for the plan
rounds to find — the residue was all TDD-ordering and oracle-ownership bookkeeping,
which the task-contract linter cannot see because it checks marker FORM, not whether
a green scope exceeds its red's cases. The reviewer's per-behavior red-green framing
(each mechanism lands in the task whose case first asserts it) is the transferable
authoring rule; applying it while drafting would have made R1 F1/R2 F1/R3 F2 free.

**Mechanizable:** none new — green-scope-vs-case ownership requires reading both the
plan prose and the spec case bodies; `TASK_AC_MISSING`/marker grammar already ran
clean from round 1.

## diff — 19 rounds

**Examined:** nineteen counted rounds on the implementation diff, dispatched as two
tight-scope reviews per the split-review default. The wrapper half
(`scripts/with-heavy-slot.py` + `tests/scripts/withHeavySlot.test.ts`, ~1600 lines,
the arc's entire mechanism) took APPROVE/0 in round 1 and was never re-opened; its
reviewed scope is byte-identical from that verdict to merge. Every counted round
after round 1 belongs to the other half: the AGENTS.md prose rule and its
string-presence guard, 4/1/1/1/1/3/5/3/2/2/1/1/1/2/1/1/2/1/0 findings across rounds 1-19 — thirty-three in total, closing APPROVE/0 at round 19.

That split is the finding. The half with kernel semantics, fd lifetimes across
`execvp`, inode identity, and an atomic swap protocol converged immediately, because
spec §7 had already enumerated its defect classes as executable cases and thirteen
spec rounds had probed each one. The half that burned eighteen is a paragraph of
English and a regex list.

**Judgment:** eight of the thirty-three diff findings are one class — *the guard's stated coverage is
wider than its enforced coverage* — and the arc kept re-entering it because each
repair changed WHERE the gap lived rather than removing the possibility of one. R1
found members the hand-written list omitted; the repair derived the member set from
spec §4.6 spans, which closed omission and opened misclassification. R2 found a span
misclassified `ignore`, introduced BY that repair. R3 found an `ignore` row whose
prose reason ("pinned by its own clause") named a clause that pinned something
weaker. The bidirectional completeness test cannot see either, because an `ignore`
row IS an accounted-for span — the registry was complete and wrong.

R3's repair — `pinnedBy` as a REQUIRED, ASSERTED field on every `ignore` row, so a
row cannot claim coverage it does not have because asserting the claim IS the
coverage — was filed here after round 3 as closing the class. **Round 4 disproved
that claim, and the correction is the most useful thing in this filing.** It closed
the ignore-row SUBCASE. The wider class had another member the ignore rows could not
reach: R4 deleted three characters, the `non-` in "non-interactive", putting
interactive Playwright on the MUST side in direct contradiction with the MUST-NOT
side, with every registered code span and every clause pattern intact.

Round 5 then did it again, and that is what finally identified the real shape. It
produced seven more inversions — `never by alias` to `also by alias`, `stay
unwrapped` to `stay wrapped`, `bounds nothing across worktrees` to `bounds across
worktrees` — and the round-4 repair's own claim to have "swept every
polarity-bearing qualifier" was false for the same reason the round-3 claim was:

**The invertible set is every declarative clause in the paragraph.** Closing it by
adding patterns is an enumeration over English, which does not terminate. Three
rounds were spent discovering that, each one adding patterns and each one declaring
a class closed that the next round re-opened with an ordinary three-character edit.

The close is a VERBATIM PIN of the bullet against
`tests/docs/fixtures/agents-heavy-phase-rule.md`, whitespace-normalized so markdown
may reflow but no word may change. Every inversion fails, including all fifteen the
reviewer produced and every one nobody thought of, and the criterion is closed
rather than open: there is no "what if they word it differently", because any
different wording fails. The cost is one deliberate fixture update when the contract
genuinely changes — the correct ceremony for a document other harnesses depend on
and cannot see the spec behind.

The pattern checks stay, for two reasons that are worth separating. They name WHAT
broke, which a pin cannot; and the spec-derived registry closes the one axis the pin
structurally cannot see — a shape ADDED to spec §4.6 that the bullet never picked
up, where the bullet is unchanged and therefore matches its pin perfectly.

**The transferable rule, stated at the cost of five rounds (3 through 6):** a guard over PROSE can
close two things by assertion — that named things are present and on the right side,
and that the text is the text. It cannot close "the prose does not mean the opposite"
by pattern, at any length of pattern list. Decide at authoring time which of the
three you need, and reach for the pin the moment the answer is the third. The
round-3 and round-4 filings each declared this class closed one round before being
refuted, and both of those overclaims are left in the history above rather than
edited out, because the pattern they make is the finding.

Worth stating plainly against the round-1 brief: it named the mutation-family closure
as the convergence criterion and demanded a surviving mutant per finding, and every
round complied — eleven findings, twenty-two mutants, zero speculation, and no
ratchet into a markdown parser or an AST. Every round cost was bounded by a concrete accepted
document rather than an argument. The criterion did its job: it kept every round
honest and it is why the arc ends with a closed criterion instead of a longer list.
What a per-finding mutant requirement cannot do is tell you the enumeration you are
inside will not terminate — that took three rounds of pattern-adding to see, and
seeing it is what produced the pin.

Round 6 then found the two things the pin could not: a member whose ENV GATE is the
load-bearing part of its shape (`RUN_BUILD_ARTIFACT_GATE_TEST=1` — without it the
suite is `describe.skipIf(!RUN)` and must NOT be wrapped, so a file:line citation
could never carry the condition), and a false positive the pin itself introduced,
where appending a plainly-worded sibling bullet was swallowed by an extraction that
ended only at a BOLD one. The second is worth naming: a verbatim pin converts every
extraction-boundary bug into a failure on somebody else's unrelated edit, so the pin
and the extraction have to be reviewed as one mechanism. Both sibling shapes are now
regression rows asserting the guard stays QUIET.

Round 6's third finding was against this filing's own arithmetic, which had gone
stale across rounds — the counts here are now derived from the file rather than
carried forward by hand.

Round 7 is where the pin's real cost came due, and it is the part worth carrying
forward. Four of its five findings were FALSE POSITIVES of this guard: a reflowed
bold opener, a reflowed body line, a section heading reworded around the same
words, and four markdown sibling syntaxes (`*`, `+`, `1.`, `___`) the boundary
regex did not know. Each is an ordinary edit by someone with no interest in this
rule, and each turned their commit red. The fifth was the acceptance half — the
whole rule wrapped in an HTML comment, which left the extractor reading a
commented-out copy that matched its pin perfectly while the normative document had
no rule at all.

The shape those four share is worth stating exactly, because it is the standing
liability of a pin: **the guard located and matched on RAW text while its own
`normalize()` declared whitespace irrelevant.** A pin does not merely add
strictness; it converts every locating and boundary bug into a failure on a
stranger's unrelated edit. So the repair was not four patches but one inversion —
strip comments, locate the section and the opener by tolerant patterns, widen the
boundary to every markdown sibling syntax, and run every member, clause, and
polarity check against the NORMALIZED rule so no check can contradict the pin
about what whitespace means. Nine regression rows now assert the guard stays
QUIET, which is the half a mutation table never covers.

**A pin is cheap to write and expensive to aim.** Anyone reaching for one on the
strength of the round-5 lesson above should read this paragraph as the other half
of that advice: budget a round for false positives, and write the stays-quiet rows
in the same commit as the pin, not after a reviewer finds them.

Round 8 then made the deeper point, and it is the one that should have been made at
authoring time. Its three findings — a four-space indent turning the entire MUST-NOT
block into an indented code block that `normalize()` cannot see; four more block
syntaxes (`_ _ _`, a plain paragraph, a blockquote, a fenced block, `1)`) swallowed
by the boundary regex; a Setext heading unrecognized — are all the same statement:
**the guard was parsing markdown by hand, and the enumeration it kept walking into
is CommonMark's block grammar.** Rounds 6, 7, and 8 each paid for one more slice of
that grammar. It does not terminate in a regex, and re-implementing it in a test is
the recognizer-ratchet this repo has measured before.

`remark` is a direct dependency of this repo and always was. The repair replaces
the hand-rolled block detection with the AST: the section is a `heading` node
whatever its syntax, the rule is a `listItem`, sibling blocks are outside it by
construction rather than by anticipation, a commented-out rule is an `html` node
and simply is not a list item, and an over-indented paragraph is a `code` node the
guard now names explicitly. All three findings closed at once, and so did every
future member of the class — which is the difference between a derivation and the
five preceding patches.

**The rule to carry: when a guard's subject is a structured document, parse it with
the parser the ecosystem already ships, and reach for that on round one.** Three
rounds went to discovering that a regex cannot enumerate a grammar. The check for
whether you are in this situation is short — if the guard is matching on syntax
rather than on content, and the document has a parser, use it.

Round 9 found the two residues the AST rewrite left, and both are worth recording
because neither is about markdown. The first was a CLASS-SWEEP MISS charged
squarely to this session: round 6 established that a member whose heaviness is
conditional cannot be stated as a file:line citation, and the repair fixed the
build-artifact-gate member while leaving its only peer — the share-link-flash
matrix — in exactly the state round 6 had just rejected. The rule the repo already
carries says to sweep the shape, not the instance, and the sweep here was two
entries long. The second was `blocks.find(...)` taking the FIRST heading matching
`/cross-cutting discipline/i` rather than the one containing the rule, so inserting
an unrelated similarly-named section above it reported the rule missing while it
sat untouched one section down — the AST removed the syntax enumeration but not
the obligation to pick the right node.

Also worth recording: repairing round 9 F1 required rewording the `--quick` clause,
and the guard immediately failed on its own pinned phrase and its own operator row.
That is the pin and the operator table working exactly as intended on their author,
one round after being written, and it is the clearest evidence in this arc that the
mechanism is load-bearing rather than decorative.

Round 10's two findings are the sharpest small pair in the arc. The first: a
non-breaking space pasted into `` `pnpm test` `` produces a command that does not
exist (`zsh: command not found: pnpm test`) and read as IDENTICAL to every check
including the verbatim pin, because `normalize()` collapsed all of `\s`. Twenty-five
space-bearing code spans were exposed at once. The fix is a character class —
reflow inserts spaces, tabs, and newlines, and never inserts U+00A0, so collapsing
only ASCII whitespace closes every span together and a named check reports the
codepoint rather than leaving the pin to say "4 kB of text differs somewhere". It
is worth noticing that a verbatim pin does NOT subsume normalization bugs: the pin
is only as strict as the normalizer in front of it, and this one had a hole in it
from the round-5 commit that introduced it.

The second: requiring the heading to read "cross-cutting discipline" turned an
ordinary rename to "Cross-cutting rules" into a failure. The load-bearing word is
the TIER — `cross-cutting` — which is what spec §5 makes normative; whether the
heading calls it discipline, rules, or notes is an organizational choice with
nothing to do with this rule.

Round 11 closed the arc's last structural gap, and it is the round-8 lesson
arriving one level deeper. Round 8 moved BLOCK structure to the AST; INLINE
structure was left as a regex over normalized text, and that is exactly where the
next mutant landed. A blank line inside a code span ENDS it — CommonMark does not
carry inline code across one — so `` `pnpm test` `` shattered into malformed
fragments like `", "`, while `normalize()` collapsed the blank line away and
handed every check a tidy `` `pnpm test` `` that no longer existed in the document.
Members are now matched against real `inlineCode` node VALUES, placed into MUST /
MUST-NOT regions by source offset. The parser is the only thing that knows what a
code span is, and "use the parser" turned out to apply at every level of the
document, not just the one that failed first.

Round 12 found the third level of the same thing, and it is about the AST's
SEMANTICS rather than its syntax. The section slice ran to the next heading of
depth at most the parent's, so a CHILD subsection stayed inside it: inserting
`### Retired guidance (non-normative)` above the untouched bullet moved the rule
into explicitly non-normative prose while the guard returned `[]`. Spec §5 requires
the rule to be a DIRECT bullet of the cross-cutting section, and "direct" was the
word nothing enforced. The section's direct content now ends at the first heading
of ANY depth.

Three rounds, three levels — blocks, inlines, then containment. Each was the same
error in a different place: the guard knew what it wanted and asked the document a
question that did not mean that.

Round 13 is the fourth level and the most interesting, because it collides head-on
with an earlier accepted finding. It renamed the parent heading to "Retired
cross-cutting guidance (non-normative)" — still the `cross-cutting` tier the round-10
repair had loosened the match to, rule byte-identical beneath it, now explicitly
non-normative, guard green.

**Round 10 and round 13 are both right, and together they prove a pattern cannot
decide this.** R10: requiring the literal phrase "cross-cutting discipline" fails an
ordinary rename to "Cross-cutting rules". R13: accepting any heading containing the
tier admits a disclaimer. Distinguishing a harmless rename from a disclaiming one is
semantics; the only pattern-shaped alternative is a vocabulary of disclaimer words
("retired", "deprecated", "historical", …), open by construction, re-opening on the
next synonym — the same enumeration trap rounds 3-5 already paid for once.

**Ratified reversal, fenced both directions:** the heading is now PINNED, exactly
like the rule body. A rename to "Cross-cutting rules" fails — not because it is
wrong, but because moving a cross-CLI contract is a decision worth one fixture line
to record. Do not re-loosen this to a tier match; do not propose a disclaimer word
list. The reasoning lives at the check itself so neither side can be relitigated
without reading it.

Both heading-rename cases moved from stays-quiet rows to operator rows in the same
commit, which is the honest form of a reversal: the old expectation is not deleted,
it is inverted where a reader will see it.

Round 14 found the two places the previous two repairs stopped one step short, and
both are worth recording as a pattern in their own right: **a partial repair leaves
the same defect at every site the repair did not enumerate.** The heading pin
compared TEXT but not DEPTH, so demoting `##` to `###` nested the contract inside
the preceding section — "Codex-specific notes" in the live file — with every word
identical. And round 11's inline repair covered classified MEMBERS only, so the
blank-line span break still worked on every span a CLAUSE references rather than a
member: the entry point, the direct wrapper invocation, the recreate command.

The second one is the more instructive. The round-11 fix was correct and still
enumerated — it hardened the member check, not the concept. The close is to pin the
SPANS AS PARSED: the sequence of `inlineCode` values must equal the fixture's, so
any span that stops being a span fails regardless of which check happens to
reference it. That is the same move as the text pin, one structural level down, and
it should have been made in round 11 rather than hardening one call site.

Round 15 found a false positive the raw-text pin carried: the rule's own bullet
marker. `-`, `*`, and `+` all produce the same `listItem`, so swapping the glyph is
a formatting edit — but the pin compared raw source and the marker was in the
comparison. Round 16 then produced the next glyph in the same seam: `**MUST wrap**`
to `__MUST wrap__`, identical AST, guard red. The reviewer named it as the same
residual seam, which is what made it worth closing properly rather than stripping a
second glyph.

**The seam is that a raw-text pin compares SYNTAX along with content, and syntax
has spellings.** Round 15's repair was the one-glyph patch; round 16's is the seam:
the text pin now compares `plainText` of the parse tree, so every markdown
delimiter is gone from the comparison and no future spelling can re-open it.
Nothing is lost, because what those delimiters carried is asserted separately and
more precisely — code spans pinned AS PARSED, the two `strong` markers asserted as
`strong` NODES (so dropping the bold entirely still fails, while its spelling is
free), and location pinned by heading text and depth.

That left a design consequence the filing recorded as a hazard to be careful about:
the guard now carried TWO normalized representations, and every check had to pick
the right one. Round 17 then produced a false positive in EACH half of that split —
`` `` pnpm heavy <cmd> `` `` (same `inlineCode` value, different delimiter
spelling) rejected by the raw-form patterns, and an `<!-- editorial note -->` whose
`html` node value `plainText` concatenated straight into the content pin.

**The split was the defect, not the tuning of it**, and the filing's "wants a
comment" framing was the wrong disposition one round before being refuted — the
third time in this arc that a repair was declared safe one round early. The close
is ONE canonical rendering emitted from the parse tree: code spans always
single-backticked whatever they were written as, `html` and `code` nodes
contributing nothing because comments and code blocks are not the contract, and
every check — pin, clause patterns, `pinnedBy`, polarity — reading the same string.
There is no longer a wrong form to pick.

Worth naming as the arc's most repeated authoring error, since it now has four
instances (R3, R4, R14, R16): **declaring a class closed in the same commit that
closes one member of it.** Each time the honest move was available and cheap — say
which axis was closed and which were not yet examined.

Round 18 then turned the R17 repair's own design choice against it, which is the
tidiest single finding in the arc. `canonicalText` drops `html` nodes because a
comment is not the contract — so a `<details><summary>Retired guidance
(non-normative)</summary>` wrapper collapsed every MUST, MUST-NOT, and tail clause
into a disclaimed panel while contributing nothing to the text the pin compares.
The repair is a STRUCTURAL split rather than a tag vocabulary: an HTML comment
renders as nothing and cannot contain, hide, or relabel anything, so it stays
allowed; any other raw HTML is markup that can, so it is rejected. "Is this a
comment" is decidable, which is why this does not become a list of dangerous tags
to keep current — the shape every earlier vocabulary-flavoured proposal in this arc
failed on.

**Mechanizable:** the inversion class is now closed by construction (the verbatim
pin), the exemption-claim axis is type-required (`pinnedBy`), the spec-derived
registry catches a shape added to §4.6, block structure comes from `remark` rather
than from a regex over syntax, normalization collapses only ASCII whitespace so a
smuggled U+00A0 cannot read as a space, members are matched against parsed
`inlineCode` values rather than backticked substrings, the section's direct
content ends at the first heading of any depth so the rule cannot be nested into
non-normative prose, the section heading is pinned alongside the rule body so the
contract cannot be disclaimed out from over it, the heading's DEPTH is pinned so it
cannot be nested into the preceding section, the code spans are pinned AS PARSED so
no clause-referenced span can quietly stop being one, the pin ignores the list
marker glyph and every other markdown delimiter because those are syntax rather
than content, emphasis is asserted as `strong` NODES so its spelling is free while
its absence is not, one canonical AST-derived rendering feeds every check so no
delimiter spelling and no editorial comment can reach any of them, raw HTML markup
inside the rule is rejected while comments stay allowed (a decidable split, not a
tag list), and 68 cases — 44 `OPERATORS` rows plus twenty-two stays-quiet rows —
run on every suite, so no repair can silently regress an earlier one in either
direction. What
remains unmechanized is the authoring judgement — knowing to reach for a pin rather
than a pattern list when the guard's subject is prose. That has no static signature;
it belongs in `docs/agents/writing-plans.md` alongside the anti-tautology rule, and
the paragraph above is written to be liftable there verbatim.

**The number that should be read first.** The wrapper — 470 lines of Python doing
fd inheritance across `execvp`, inode identity, an atomic swap protocol, and
crash-release semantics, plus its 39-case process-spawning suite — took ONE round
at zero findings, and its reviewed bytes never changed again. The AGENTS.md
paragraph and its guard took eighteen more and thirty-three findings. The
difference is not difficulty; it is that spec §7 had already turned the wrapper's
defect classes into executable cases before any code existed, and nothing had done
that for the prose. Every one of the eighteen rounds was discovering, one at a
time, what "the guard pins the rule" was supposed to mean.

The single most useful thing to carry out of this arc: **a guard over prose needs
its own §7 before it is written.** Not a longer pattern list — a statement of what
must be impossible (the words changing, the location changing, the normativity
changing) and which parsed property makes each impossible. That statement is now
recoverable from the finished guard, and it fits in a paragraph; deriving it cost
eighteen rounds.

**Infra:** the sandboxed reviewer could not start Vitest (`EPERM` creating its temp
dir) in every one of the nineteen rounds and transpiled the exported pure checker in memory
instead. That worked only because the guard was authored as an exported pure function
over text with the file-reading confined to two module-level constants. A guard
written as a terminal script would have been unverifiable under the same sandbox — the
same shape the source-mutation registry requires for enrolment, arrived at
independently.
