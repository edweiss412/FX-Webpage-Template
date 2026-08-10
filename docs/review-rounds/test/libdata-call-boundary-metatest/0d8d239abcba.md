# `test/libdata-call-boundary-metatest` — base `0d8d239abcba`

Second base for this arc; the spec and plan rounds ran against `b2a9122935c8` and are filed there. This base begins after `origin/main` was merged into the branch mid-implementation.

## diff — 16 rounds

**Examined:** sixteen counted rounds (R2–R17) across two scopes, scanner-logic and registry-fidelity, declaring 44 findings; three dispatches returned no verdict and are not counted. The registry-fidelity scope APPROVED at R6 with 0 findings and was not dispatched again. Every finding was probed by the reviewer against the shipped guard, and every accepted one was repaired with a planted self-test plus a mutant proving the repair load-bearing — 47 mutants killed, one proven equivalent.

**Mechanizable:** One shape accounts for the overwhelming majority: **a text pattern used to answer a question about program structure.** It recurred in four separate places, and in each one the same story played out — widen, get found, widen again — until the mechanism was replaced instead:

| Predicate | Rounds spent widening | What ended it |
| --- | --- | --- |
| Site scanner | R1–R4 (quote classes, `$`, escapes, line continuations, `?.`, `!`, non-adjacent generics) | Read sites from `typescript`'s parse |
| Waiver recognition | R2, R4, R5 (line anchor, block-comment inner lines, regex-class and JSX false comments) | Take comment ranges from parsed token positions |
| Mention check | R7, R8, R10 (ASCII `\b`, a letter/digit IdentifierPart approximation, `#` and `\` escapes) | Read the suite's mentioned names from its parse |
| Pin coupling | R3, R11, R12, R13 (substring, kind, left boundary, astral and braced-escape spellings) | Prove coupling by ERASING the call and requiring the pin to stop matching |

Twelve rounds went into the four widening trains; four went into everything else. **The signal was available the first time a second round landed on the same predicate**, and the structural-defense-calibration rule already says to ship the structural fix at first recurrence rather than waiting for the third. It was not applied until the pattern had repeated four times over. If one lesson from this arc is worth carrying, it is that "the recognizer missed a spelling" is never a finding about that spelling — it is a finding about the recognizer's category, and the second occurrence is the signal, not the fourth.

Two further findings were the same defect in a different dress — **one question answered in two places, the second copy lagging**. The `Array` exclusion lagged the member-name reader (R9), then the coupling erasure lagged the exclusion (R14). Both were closed by making a single predicate (`calleeParts`, then `siteAt`) the only place that answers "is this a site".

**Judgment:** Three findings were genuine design calls rather than mechanizable defects.

The `coveredBy` **both-arms** question (R2 on `revokeAdminEmail`, R4 on `listAdminEmails`, whose mock could not throw at all) was repaired but deliberately NOT mechanized: recognizing "this suite exercises both arms" textually is the same recognizer ratchet the diff rounds had just paid for. It ships as an authoring bar in spec §3.4 under limit 7's division, with all four rows audited.

The **built-in receiver** question (R5, R6) went the other way: `Array.from` is excluded because it is live in this corpus, and `Buffer.from`, `Readable.from` and the rest are deliberately NOT, because enumerating built-in receivers is an open set and their worst case is a loud false positive answered by one waiver. It is documented limit §6.8 and pinned executable — a planted test asserts those ARE reported, so the limit is a stated behavior rather than an accident.

**R17 is the one that justifies the whole train.** Until it, the guard required a single pin to depend on the call, which proves "the call is here" and nothing else — so a row could pin its own call exactly and borrow the neighbouring site's `if (other.error)`, passing while the site never inspected its own result. That is precisely what invariant 9 exists to prevent: the guard had been proving the easy half of its own contract for sixteen rounds. A row now makes two claims and is tested twice, and nine fixtures had to be rewritten because they used unbound calls that the stricter rule correctly rejects.

Also recorded: spec limit 6 was rewritten from "noted" to "enforced" when R16 showed the duplicate-site misattribution it had accepted as harmless was in fact silent. A documented limit is a claim, and it is worth re-testing that claim as the guard gets stronger.

**Infra:** Three of twenty-three dispatches returned no verdict, none of them a review outcome. R1's whole-diff dispatch was killed at its attempt timeout with its audit complete — its stderr held the probe that became the R1 finding, recovered by reading the stream rather than re-dispatching. R3's registry-fidelity dispatch ran a single 7166s attempt with Codex's command runner stalling on `/bin/pwd`, at a machine load average of 172 caused by concurrent runs in other worktrees; the same review completed in ~20 minutes once serialized. R18 was interrupted by a machine-wide Codex usage limit.

Two smaller mechanics worth recording because each cost real time. `nohup … & disown` with two dispatches in one shell disowns only the most recent job, so the first takes the SIGHUP and dies leaving an empty out-dir and an empty log — dispatch one per shell invocation. And a transient-mutant script whose anchor no longer matches after formatting reports zero red, which is indistinguishable from a surviving mutant; verify the mutation applied before believing either result.
