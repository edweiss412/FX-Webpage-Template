# fix/observe-error-telemetry — review-round record at 5fccaaac7804

The spec stage's record is at `26b99c4c0ad8.md` and the plan stage's at `44b0d74b1107.md`. Diff rounds 1 through 3 ran at `8be90aba7c23`; merging `origin/main` to clear a `BACKLOG.md` conflict moved the merge base, so this file opens at round 1 by design. The arc's diff total is four, summed across the two bases, which is what puts this section here.

## diff — 1 rounds

One round at THIS base. The arc's diff total is **4**, summed across both bases, which is what obliges this section.

**Examined:** every finding raised at both bases. Round 1 returned 5, round 2 returned 6, round 3 returned 3, round 4 returned 3 — seventeen, every one admissible, none refuted. Three of the four rounds carried a P0, and all three P0s were the same repair: keep the share token out of `app_events`.

**Mechanizable:** one thing, and it is not a lint arm. **Enrol the guard surface before the first review dispatch, and let the score say what reading cannot.**

The convergence criterion already says this. This arc did it in the wrong order and so measured the cost rather than restating the rule. `lib/observe/clientErrorTransport.ts` was enrolled after diff round 4, on a surface that had cleared three adversarial rounds and carried a suite written specifically for it. First score: **41/64, 23 survivors.**

| what survived | what it would have cost |
| --- | --- |
| all eight wire caps, each raisable by one | the cap table is duplicated in `app/api/observe/client-error/route.ts`; a silent drift on one side is a payload the other re-cuts |
| five `slice(0, cap)` offsets, each becoming `slice(1, cap)` | a payload quietly missing its first character, which nobody reads as corruption |
| both 200-character dedup bounds | two crashes merging, or splitting, with no test noticing |
| the prefix floor and the loop's start | the floor is the false-positive trade; nothing pinned its value |
| `tag`'s `typeof ctor === "function" && ctor.name`, flipped to `||` | `.name` read off whatever sits at `.constructor`, so an object carrying its own `constructor` key gets an invented type tag |

None of those is a subtle line. Every one is a constant or an offset that no reviewer reads as suspicious, because the code is right — what is missing is a test, and absence is what review is worst at. Three rounds of expert attention found the wrong *lines* and could not have found these. After the repairs the surface scores **55/55 with zero survivors**, and `describeClientValue` scores 20/21 with one accepted-equivalent row.

The rule as a step, not an intention: a diff whose subject is a lib module with a referring suite is enrolled and scored BEFORE the round-1 dispatch, and the round-1 brief carries the `GUARD SURFACE:` line. The wrapper already refuses a round-1 diff brief whose guard-surface line is malformed; what it cannot do is notice a surface that was never enrolled at all.

declined: no `BL-`/`DEF-` row, and the reason is that the rule already exists. AGENTS.md's convergence criterion, bullet 4, says enrolment precedes review in those words, and cites two arcs that measured the cost of deciding late. This arc is a third measurement of the same rule, not a new one, so it went where the other two are — appended to that bullet, in the tracked repo where every harness reads it — rather than into a queue as a process row. Filing it would also have been refused twice over: by the 2026-08-25 process mint freeze, whose done condition test it fails (the gap is a property of review discipline, not a number a product arc would notice moving), and by this arc's own binding directive to file nothing of any facing.

**Judgment:** the repair direction on rounds 2 through 4, and the arc got it right twice after getting it wrong once.

Round 1's P0 was a pathname-only match. Round 2's repair was a route-shape pattern, which is a WIDENING, and round 2's P0 was the next hole in it — a duplicate copy of the token in a query string. That is the ratchet the round-economy rule names: each widening is a bigger target for the next round.

Round 2's repair changed direction. The primary mechanism became exact-literal replacement of a value the page already holds, with the pattern demoted to a documented backstop. Round 3's P0 then found an ORDER OF OPERATIONS defect rather than a missing spelling — truncation running before the scrub — which is the shape you get once the recognizer stops being the weak part.

Round 4 forced the narrowing all the way. Its P2 was the position-only match reading `/show/<slug>/unpublish`, a real static route, as token-bearing: the literal word "unpublish" redacted out of every message on that page and its URL rewritten into a crew URL that does not exist. Worth naming precisely because the failure direction inverted — a widening recognizer's cost is corruption of ordinary payloads, not a leak. Matching on the token's own shape, `^[0-9a-f]{64}$`, from the DB's own CHECK, fires on strictly less and deleted three things rather than adding a fifth pattern: the encoded-form pass (hex never percent-encodes, so it could not fire), a redundant length guard, and a final re-scrub sweep that was a no-op on every reachable input.

The general form, for the next arc that finds itself here: **when a recognizer takes a finding in consecutive rounds, the repair that terminates is the one that makes it fire less.** A pattern that must recognize more is a pattern with a next corner. A value you already hold, or a shape some other component is the authority for, has none.

**Infra:** round 4's P1 is a process finding and belongs here rather than in a commit message. The R3 probe repair was made, executed, verified, and described in the round-4 brief as done — and never staged. The commit that claimed it added four test files and not the probe. The reviewer read `HEAD`, which is the correct thing to read, and found the duplicated projection still there.

The brief asserted a repair the diff did not contain. That is the same defect class as a spec citing a `file:line` nobody grepped, and it has the same fix: **a brief's claim about the diff is checked against the diff before dispatch, not against memory of having made the change.** `git status` before writing the brief would have caught it in one second. The round cost roughly twenty-five minutes of dispatch.

Second, smaller, and it cost two silent no-ops: a scripted `str.replace` whose anchor has moved does nothing and reports nothing. Two test edits here were applied against text that a prior rename had already changed, so both vanished — and the confirming mutation run passed for that reason, not because the assertions held. Any scripted edit asserts its anchor matched, or is verified by reading the file back. The mutation score is what exposed it, which is one more entry on the enrolment side of the ledger.
