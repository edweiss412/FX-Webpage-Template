# Review rounds — test/e2e-spec-discovery-wiring @ 57dfd4d5bfd6

## diff — 4 rounds

**Examined:** the whole branch diff — a config-to-disk staleness guard and the nine dead `testMatch` branches it found, a settle-race repair across six cases in `tests/e2e/popover-clip-fit.spec.ts`, a four-spec dedupe from `desktop-chromium` with the workflow path that made one look load-bearing, the mutation enrolment of `tests/ci/_configBranchProbe.ts`, and corrections to `LIM-E2E-SPEC-DISCOVERY-GAP` plus four other documents that carried the refuted account. Verdicts ran NEEDS-ATTENTION, NEEDS-ATTENTION, NEEDS-ATTENTION, APPROVE, with declared findings decaying 3, 2, 1, 0.

**Judgment:** every finding in every round was about the same thing, and it was not the code. The arc's subject is a census that enumerated one member of a population and reported the remainder as a finding. That exact error then recurred four times inside the work correcting it:

1. The original limit measured `playwright.config.ts` and called the other three configs' specs dark.
2. My spec claimed a workflow had run three of four named specs, from reading the config side of a merge and inferring the workflow side without opening it. There was no such incident.
3. My correction of the census allowed one spec a single day of darkness. The commit that added it to the config also created it and regenerated the baseline, so it ran from the moment it existed. The cited evidence set is 0 for 4, not 1 for 4.
4. My sweep for carriers of the refuted account grepped the phrases my own corrections had used, so a design spec saying the same thing in different words was invisible to it.

The durable form, arrived at on the fourth attempt: grep the ARTIFACT identifiers — the four spec basenames — across `docs/` and read every hit. Phrase matching finds your own prose.

Round 3's remaining finding was the mirror risk, and worth recording because the brief asked for it explicitly: two claims that overstated in the OTHER direction. "The deduped runs differed only by an incidental viewport" ignored that the two projects also differ in timeout, retries, baseURL, trace and webServer use; the specs are self-hosted and consult none of it, so the dedupe holds, but it is a second execution under a different posture rather than a no-op. And "strictly stronger" was wrong: removing a conditional duplicate leaves the unfiltered guarantee intact, it does not improve it. A correction that overshoots is the same defect wearing the opposite sign.

**Mechanizable:** declined: the mechanizable half is SHIPPED in this branch rather than filed — the disk-to-config direction was already guarded and the config-to-disk direction was not, so this branch ships that half — deriving its config population from disk by content rather than from a list, because a hand-maintained population is precisely what kept failing above. The remaining declaration-versus-resolution pairing, a workflow naming a positional spec path its selected project cannot match, has a proved mechanism (Playwright drops it in silence at exit 0) and zero live instances across all 62 pairs, with no incident. Under the 2026-08-25 process mint freeze that is a documented limit carrying its probe, not a guard arm and not a row. It is recorded in `LIM-E2E-SPEC-DISCOVERY-GAP` rather than minted as a row, so nothing is filed here: the shipped guard needs no entry, and the residual pairing is a documented limit by the freeze's own test.

**Infra:** mutation enrolment cost three full runs of shard 3 at roughly an hour each, because **`-t <surfaceId>` does not narrow a mutation shard** — mutants execute during collection rather than inside the filtered `it` bodies, confirmed by reading `MUTATION_SUITE` off the live overlay child while it ran a different surface's suite. The harness exposes no per-surface filter. Budget the whole shard's weight, and where the class-mutation slot is grant-managed, declare that scope in the ask. Recorded in the registry row and the spec so the next enroller does not repeat the assumption.

The enrolment paid for itself regardless. The surface scored **0.4167** on a suite that had already cleared a spec review round: seven survivors, of which four were equivalent resource bounds and three were real. The sharpest accepted a MISSING output marker, which would have fed a dying child process's stderr to `JSON.parse` and destroyed the only text saying why it died. The second run then found the case written to kill one of those survivors asserting `toHaveLength(PROBE_ERROR_QUOTE)` — an oracle for a constant derived from that constant, which moved with the mutant and stayed green. Final: **8/8, zero unaccepted survivors**, all six declared operators.

## spec — 1 round

**Examined:** `docs/superpowers/specs/ci/2026-08-30-e2e-declared-vs-resolved.md`. One round, BLOCKING, 4 findings, all admitted. The sharpest found the guard's config population hand-listed in two places that agreed with each other, so a fifth config could sit unexamined — the arc's own subject, inside the guard against it. Repaired by deriving the population from disk and proved by planting the reviewer's hypothetical and watching the guard red on it.

**Mechanizable:** declined: the repair is the guard this branch ships, and its own population defect was closed in the same diff by deriving from disk. Nothing remains to file.

**Judgment:** a spec review round found the guard reproducing, inside itself, the defect it exists to catch. That is not a prose defect a lint arm reaches — it needed a reader who knew the subject well enough to notice the guard's population was written the way the census had been.
