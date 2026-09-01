# Closeout — the telemetry retry outcome announcement

Plan: `docs/superpowers/plans/2026-08-31-telemetry-retry-outcome.md`. Spec: `docs/superpowers/specs/2026-08-31-telemetry-retry-outcome-announcement.md`. Branch `feat/telemetry-retry-outcome`, PR #957. Closes `TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1`.

## 12. Invariant 8 — the impeccable dual gate

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded

**Scope of the gate.** The four files this branch touches under `app/` and `components/`: `components/admin/telemetry/TelemetryRetryButton.tsx`, `app/admin/dev/telemetry/page.tsx`, `components/admin/telemetry/EventTimeline.tsx`, `components/admin/telemetry/HealthAlertsPanel.tsx`. Both halves ran with the canonical v3 setup gates (`context.mjs` context load of PRODUCT.md + DESIGN.md, then the product register reference, this being an admin surface where design serves the task). Critique ran as two isolated sub-agents that did not see each other's output before synthesis; the audit ran as its own agent afterward.

Method note, recorded because it bounds the run: the critique's first Assessment A attempt died on a model rate limit and was re-dispatched on a different model. Assessment B was unaffected and ran once. Not degraded, but not a single clean pass either.

No dev server and no screenshots: the route is developer-gated behind `requireDeveloperIdentity()`, and this is an arm64 host whose screenshot baselines are x64-Linux. Scored from source, resolved tokens, sibling components, and executable probes.

### Critique — 30/40, competent upper band

AI slop verdict for the product register: **passes**. The diff adds no visual surface, invents no token, reuses the existing treatment, and the copy is plain and calm.

| Finding | Tier | Disposition |
| --- | --- | --- |
| A retry that never completes is silent and indistinguishable from one still in flight; the armed baseline is also unbounded in time, so a much later auto-refresh could attribute an outcome to a long-forgotten tap | P1 | **PART FIXED, part documented limit.** The proposed repair was a timer that announces the outcome after 8-10s, and that is the one thing this arc must not ship: it would assert "still couldn't load" when nothing is known to have completed, which is the same dishonesty as the timer-driven `aria-busy` the row's own probes rejected. The misattribution half is NARROWED, not fixed, and an earlier draft of this row said otherwise until the whole-diff review's third finding corrected it: the baseline stays armed for as long as the fallback is mounted, so an auto-refresh landing minutes later does append an outcome to that tap's intent. What the outcome SAYS is still true when it is said, since a re-read did complete and the branch is still failing; what is unbounded is how long the user must hold the tap in mind for the pairing to read naturally. Cycle-boundary pruning bounds accumulated text, never the baseline's lifetime. Both halves are now spec documented limit 2, where the worst case is today's shipped behaviour and never a wrong announcement. |
| The status region is a hand-rolled `role="status"` text swap with a parity trick where DESIGN.md §15 mandates the shared `role="log"` channel and says not to hand-roll a third copy | P2 | **FIXED** (`81b720c6d`). This diff is precisely §15's trigger case: two message kinds now share one region and either can recur verbatim. Taking `useAnnounceLog` + `AnnounceLogRegion` deleted the sequence counter, the modulo and the parity suffix, whose behaviour varies by assistive technology. The owner-branch-stability half is knowingly excepted and the header says so. |
| Tapping Try again leaves the header's "Updated Ns ago" chip stale, so the sighted user sees a number actively asserting nothing happened | P2 | **NOT FIXED, filed as an unfixed peer** (PR body and readiness message). Same shape as this row for a different audience, and I would rather say that plainly than pretend the branch closed both halves. The chip's `lastRefreshedAt` is local state inside `AutoRefreshControl`; making a sidebar control write it means lifting that state into shared page context, which is a restructure of a component this PR does not otherwise touch, plus a product call about whether a per-plate retry should reset a page-level freshness claim. Class-sweep exception (c). |
| On success the control unmounts and focus falls to `document.body` | P3 | **ANSWERED, no change.** Recorded by the deferring arc as its one behavioural limit and unchanged by this diff; the 20s auto-refresh already performs the same swap. Moving focus is a separate decision about the fallback-to-content transition, not about the announcement. |
| A non-finite `renderedAt` silently degrades the feature to intent-only forever | P3 | **ANSWERED, no change.** Unreachable today: every branch of `nowDate()` returns a real or validated `Date`. The guard is deliberate and its degrade is conservative (never a wrong announcement), which is the posture the spec's guard table states. Six tests cover the non-finite domain on both sides. |

### Audit — 19/20, excellent

Anti-patterns: **PASS**, `detect.mjs` returned `[]` on the four files and again across the whole `components/admin/telemetry` directory.

| Dimension | Score | Note |
| --- | --- | --- |
| Accessibility | 3 | The two P2s below, both fixed |
| Performance | 4 | Render-phase update verified terminating and single-fire under StrictMode |
| Theming | 4 | Zero new literals; the only literals in these files predate the branch |
| Responsive | 4 | 44px floor verified through the shared base; the new prop is data-only |
| Anti-patterns | 4 | None |

| Finding | Tier | Disposition |
| --- | --- | --- |
| The live region's accessible name was the button's own command string, so the log read as a second control in browse mode and the rotor | P2 | **FIXED**. Named for its content now (`<subject> retry updates`), the shape every other consumer of the channel uses. The fix was unpinned when made: reverting the label stayed green until the naming assertion was added, which compares against the button's rendered name rather than a literal. |
| Cap-only channel, so utterances accumulate for the life of the mount (measured: four taps, eight nodes, 180 characters) | P2 | **FIXED**, and the fix is narrower than the one proposed. Pruning on every tap would collapse two impatient taps into one node, handing a text-diffing screen reader the silence the deleted parity trick existed to work around. The reset fires only at a cycle boundary, when nothing is in flight. |
| The render-phase `announce()` is safe only because no TTL is passed, and nothing recorded that | P3 | **FIXED**, recorded in the header, with the reason a TTL is the wrong pruning mechanism here. |
| The header claimed no announcement ever races the unmount; the premise held but the conclusion did not | P3 | **FIXED**, narrowed to what §15 actually names. A successful refresh can still remove an unspoken intent; that path is silent by design. |

## Mechanical evidence

- Pre-code mechanical UI checklist on the added lines: zero em dashes, zero `--`, zero straight apostrophes in user-visible copy, no hex, no px literals in class strings, no raw error codes. `tests/styles/_metaEmDashCopy.test.ts` green.
- `min-h-tap-min` reaches the one interactive element unconditionally through `SECONDARY_ACTION_BASE`; `--spacing-tap-min: 44px`.
- Transition inventory: the diff introduces no animation and no `motion` import. Proved by plant rather than by reading: a `motion.span` planted into the component reds the derived instant population in `transitionAudit.test.tsx`; reverted, green.
- Mutation evidence, in two passes because the gate changed the mechanism between them. Against the drafted implementation: sixteen mutants over the announcement path (every boolean operand, every state write), fifteen red, with the settlement's `seq + 1` surviving as equivalent under a stated reachability argument. That counter is gone with the channel swap, so the survivor is moot rather than carried. Against the shipped implementation: prune-every-tap reds four cases, never-prune reds one, the region label reverting to the button's command string reds the naming case (green until that assertion was added), and both copy literals red when reworded (`Retried {what}` reds one case, a reworded outcome reds two).
- Whole-diff review rounds 1 and 2 returned four findings, all repaired. Round 1: the intent copy was only ever asserted against its own constant; the three canonical documents still bound the deleted parity design; and this closeout claimed a misattribution fix the code does not implement. Round 2 caught the sweep that round 1's second finding asked for still missing spec §3.7, which described both the deleted parity mechanism and a cadence the code does not have. The cadence is one outcome per settled CYCLE: the first differing render disarms the baseline, so a double tap that provokes two server responses hears one answer, not two. Worth recording that a class sweep declared complete was not, which is the failure the sweep rule exists to catch and it caught it here one round later.
- Screenshot baselines: nothing moves. No committed capture frames this surface.

## The peer this arc did not close

The sighted half of the same defect is still open: tapping Try again produces no visible change, and the header chip keeps counting up from the last auto-refresh. Named here, in the PR body, and in the readiness message so it is bl-orch's call rather than a row this arc mints.
