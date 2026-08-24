# Where the app-e2e upstream 502s actually cluster (2026-08-24)

Evidence pass for `BL-ADMIN-LOADER-CI-TRANSIENT`, run before the row's first scheduled step (the
threshold decision) so that decision is made on measurements rather than on the row's framing.

The row's ten occurrences all quote the same server-log signature and read it as an admin-gate fault:
`AdminInfraError: requireAdmin: is_admin RPC failed: An invalid response was received from the
upstream server`, `code: 'ADMIN_SESSION_LOOKUP_FAILED'`. This probe went looking for where those
502s sit in a run, and found that three of the four beliefs the signature invites are wrong.

## Method

Twenty-two `app-e2e` job logs from 2026-08-24, across five branches, pulled with per-line runner
timestamps:

```
gh api /repos/edweiss412/FX-Webpage-Template/actions/runs/<run>/attempts/<n>/jobs \
  --jq '.jobs[] | select(.name|test("app-e2e")) | .id'
gh api /repos/edweiss412/FX-Webpage-Template/actions/jobs/<job>/logs
```

Three of the twenty-two are red (the two runs the row already records: `32763990640` attempts 1 and
2, and `32786399563` attempt 1). Nineteen are green, including `32786399563` attempt 2, the replay
on identical bytes that the row cites as its disproof.

A genuine 502 is a log line containing `An invalid response was received from the upstream server`,
which is Kong's own 502 body. Events are deduplicated per second and consumer, because one fault
prints several lines (a message line and a stack line, or a multi-line log object).

## Finding 1: the code is not the signature, because most of those lines are deliberate

`ADMIN_SESSION_LOOKUP_FAILED` appears 6 to 10 times per job in red and green jobs alike. Nearly all
of them are `test-forced infra fail (layer=page)`, thrown on purpose by
`lib/auth/requireAdmin.ts:128` when `admin-route-boundaries.spec.ts` sends the
`x-test-force-infra-fail` header. The forced path is per-request and header-gated, so it cannot leak
between tests, and it says nothing about the runner.

Grepping for the code alone matches every healthy run. The discriminating string is the Kong body,
not the code. The fleet's standing "rerun, don't diagnose" signature is written against the code, so
as written it matches green runs too.

## Finding 2: a 502 is background, present in most runs, red or green

| | jobs |
| --- | --- |
| sampled | 22 (3 red, 19 green) |
| carrying at least one genuine 502 | 14 (64%) |
| carrying a gate-level 502 (`is_admin`, `is_session_live`, `is_developer`) | 7 |
| of those 7, red | 3 |
| of those 7, green | 4 |
| total 502 events | 29 |

Every red job carries a gate-level 502, so the row's attribution holds for the reds it recorded. But
a gate-level 502 is not sufficient for a red: four green jobs carry one. Run `32753120324` is the
cleanest single case. It is green, on an unrelated branch (`docs/derived-numbers-provenance`), and
its log carries `requireAdmin: is_admin RPC failed: An invalid response was received from the
upstream server` at 172 seconds into the test step.

What separates a red from a green is not whether a 502 happened. It is whether an assertion was
watching the request it landed on.

## Finding 3: it is not the admin gate, it is every RPC

Consumers of the 29 events:

| events | consumer |
| --- | --- |
| 9 | `viewer_version_token` (`app/admin/_showReviewModal.tsx:142`, fails open, warn only) |
| 7 | `get_admin_show_review_snapshot` (`lib/admin/readShowReviewSnapshot.ts:45`) |
| 4 | `is_session_live` (gate, `lib/auth/requireAdmin.ts:223`) |
| 4 | `admin_read_share_token` (`lib/data/loadShowShareToken.ts:21`) |
| 3 | `is_admin` (gate, `lib/auth/requireAdmin.ts:224`) |
| 1 | `is_developer` (gate, `lib/auth/requireDeveloper.ts:181`) |
| 1 | unattributed |

The admin gate takes 8 of 29. It dominates the row's occurrence list only because it is the consumer
that throws to the error boundary: the other consumers degrade. `viewer_version_token` fails open by
design and logs a warning, `get_admin_show_review_snapshot` reaches the page's own error state, and
runs carrying only those stay green.

So a repair scoped to the admin gate would leave two thirds of the fault population untouched, and
those consumers are one product decision away from being fatal themselves.

## Finding 4: every one of the 29 landed on an RPC, none on a table read

All six named consumers are `supabase.rpc(...)`, which PostgREST serves as `POST /rest/v1/rpc/<fn>`.
Not one event landed on a `.from(...)` select, which is a GET.

The codebase is not RPC-shaped, so this is not a population artifact: `app/admin` plus `lib` carry
141 `.from("` call sites against 40 `.rpc("` sites, GETs ahead 3.5 to 1.

This points at the gateway rather than at Postgres. A reverse proxy retries an idempotent request
when an upstream connection resets, and does not retry a POST, so a connection-level fault is
invisible on the GET traffic and surfaces on the RPC traffic. It also means the gateway structurally
cannot fix this one for us: the retry has to happen above it, at our own call boundary.

Limit worth stating: call-site counts are not request counts, and a `.from()` fault that no consumer
logs would be invisible to this grep. What is measured is that no logged 502 in 22 jobs was a GET.

## Finding 5: the clustering is keyed to the test run, not to the stack's age

Seconds from the start of the Playwright step, over all 29 events:

```
min 95   p25 184   median 195   p75 215   max 297   stdev 37
```

Measured instead from the point where the Supabase stack is up and seeding starts, the same events
scatter: `min 140  p25 224  median 237  p75 260  max 526  stdev 81`. The tighter fit is the
test-run clock, so this is not a container settling after boot and not a fixed-age timer.

The first test result lands at 80 to 105 seconds (the step pays a cold `pnpm build` first), so the
window opens roughly 90 seconds into real browser traffic and runs for about a minute. Sustained
parallel load, not cold start.

## Finding 6: the two `notify-toggles` reds are this same 502, not a settle that ran late

The row reads its two `notify-toggles` occurrences as a server action plus `router.refresh()` failing
to settle inside a 10 second poll, and that reading is what put a targeted wait on the options list.
Both runs were pulled and checked directly rather than inferred from the family:

| run | `is_admin` 502 | `notify-toggles.spec.ts:168:7` fails | gap |
| --- | --- | --- | --- |
| [32572200250](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32572200250) | 12:15:16 | 12:15:26 | 10 s |
| [32587470121](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32587470121) | 17:27:35 | 17:27:45 | 10 s |

In both, the case immediately before it passes seconds earlier, the gate 502s, and the failing case
then burns exactly its 10 second poll. That is the poll expiring against an error boundary, not a
slow settle: the toggle's `router.refresh()` re-enters `requireAdmin`, the gate throws, the page
never re-renders, and `aria-checked` stays where it was. Both runs carry other genuine 502s too
(three and four lines respectively).

## What this does to the row's three options

The row offered: (a) extend the ratified open-time recovery, (b) a targeted wait on the server-action
settle, (c) accept a known-flaky required check.

(b) is answered by finding 6. The wait it would lengthen is already expiring against a thrown gate,
and no wait turns a 502 into a 200.

(a) and (c) both take the fault as given and argue about which specs absorb it. Findings 2 and 3 say
the fault is not spec-shaped: 64% of runs carry it, it lands on whichever RPC is in flight, and
per-spec recovery is a per-consumer patch of a population that is at least six wide.

The direction the evidence actually supports is a bounded retry at the Supabase RPC call boundary,
for transport and 502-class faults only. Findings 2 and 4 are what make it look sufficient rather
than hopeful: the events are sparse and isolated, adjacent RPCs in the same page render succeed (the
`viewer_version_token` greens are exactly that case, the page rendered while one call 502'd), and the
gateway will not retry a POST on our behalf.

That is a change to shipped behavior, which the row's product-facing framing permits but the spec has
to argue, under invariant 9 at every boundary it touches. It also needs a second half: the runs
capture nothing from inside the containers, so the cause of the reset is inferred rather than
observed. A failure-path step that dumps gateway and PostgREST logs plus container restart counts
would make the next occurrence attributable instead of re-inferred.
