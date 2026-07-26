# Watch renewal lifecycle — adversarial review log

Round-by-round dispositions. Kept so later rounds and future readers do not re-derive
refuted claims or re-raise settled ones (AGENTS.md cross-CLI orchestrator discipline).

## Spec round 1 (Codex, reviewed commit `bfc1d923a`) — VERDICT: BLOCKING

The reviewer read the FIRST commit; findings 5 and 6 were already repaired by
`60b0f81c7` and `d93fc8304` respectively before the verdict landed.

| # | Sev | Claim | Disposition |
| --- | --- | --- | --- |
| 1 | BLOCKING | The outer deadline cannot cancel what it times out. `withDriveCallDeadline` wraps `subscribeToWatchedFolder`, which has no `AbortSignal`; a fired deadline lets the insert/activation/alert continue invisibly and can activate a channel AFTER refresh recorded a failure. The credential-fetch socket also stays live (evidence in `google-auth-library`/`gtoken`). The run budget, checked only before an iteration, permits budget + one full row budget. | **ACCEPTED, all three.** The late-activation hazard is the serious half: it can produce a post-return mutation the caller believes failed. Repair: DELETE the outer per-row deadline and `lib/drive/callDeadline.ts` entirely; keep only the per-call `{timeout, retry: false}`, which genuinely cancels. Restate the loop bound honestly as budget + one worst-case iteration. The credential-fetch stall becomes a NAMED residual with a backlog entry rather than a gap the spec claimed to have closed. |
| 2 | HIGH | The expiry-only reap predicate misses the invalid-lease class `expires_at <= created_at` with a FUTURE `expires_at`, which `listRenewalDue` deliberately selects and `tests/db/watchRenewalDue.test.ts:141-153` pins. Such a row stays active, stays renewal-due, and refresh retries it forever — contradicting the claim that invalid rows leave refresh. Separately, "provably dead" assumes JS and DB clocks agree. | **ACCEPTED, both.** Repair: the reap predicate mirrors the renewal query's own arms — `expires_at <= now() OR expires_at <= created_at` — and uses the DATABASE's `now()` rather than a JS timestamp, which removes the skew premise instead of documenting it. |
| 3 | HIGH | §4.4 leaves validation parity to a manual PR-body paste although an executable CHECK-parity layer already exists and was built for exactly this blind spot. | **ACCEPTED.** Verified at `tests/db/validation-schema-parity.test.ts:216-290`: it derives expected constraint names FROM the migration text and asserts the validation DB contains them. §4.4's premise ("no gate can catch this") is false. Repair: extend that layer to cover the status CHECK, as its own parse rather than by joining `NONBLANK_MIGRATIONS` (whose `toBe(17)` non-vacuity guard is scoped to the nonblank family). |
| 4 | HIGH | The design contradicts the canonical master spec without amending it, violating AGENTS.md invariant 7. | **ACCEPTED.** Verified in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`: it states "**No client-side timeout is applied** (amended 2026-07-25)"; it defines renewal over every due `active` row with no folder scoping; it lists the status set without `expired`; and **AC-6.18 requires the prior folder's rows to be `superseded` after a folder change**. That last one is the sharpest: the design's "let the old folder expire naturally" leaves them `active` and violates a shipped AC. Repair: (a) three master-spec amendments, and (b) implement the supersession the spec already mandates in `promoteSettings`, keeping the folder filter as defence-in-depth for every path that is not a wizard promotion. |
| 5 | HIGH | Reap failures misclassified as renewal-query failures. | **ALREADY FIXED** in `60b0f81c7` (§3.1.3a) before this verdict landed. Retained here so round 2 does not re-raise it. |
| 6 | MEDIUM | `folderScope` has no complete return contract; the route builds an explicit response object and would not serialize it anyway. | **ALREADY FIXED** in `d93fc8304` — the field was removed entirely. The sub-claim about the route's explicit response object is correct and independently useful: §3.2.3's justification is corrected to rest on the five deep-equality test files, not on the response body. |
| 7 | MEDIUM | Registry and breaking-test inventories incomplete. | **ACCEPTED.** The metaInfra row was corrected in `60b0f81c7`, but the reviewer names surfaces still missing, notably a SECOND `WatchTx` fake at `tests/drive/watchExpiration.test.ts:46-62` and the multi-row isolation fixtures at `tests/drive/watch.test.ts:205-218,654-683`, which seed already-expired rows that the reap would consume — letting an isolation test pass without exercising renewal at all. |
| 8 | MEDIUM | Six proposed tests can pass without proving their stated behaviour. | **ACCEPTED, all six.** The sharpest: "reaping frees the active slot" is tautological because `activatePending` already supersedes any active row; "expired-and-due yields zero subscribes" can pass via the folder filter unless that folder is the configured one; and the never-settling-`watchFolder` test injects past `defaultWatchFolder`, so it never exercises the timeout it claims to test. |
| 9 | LOW | "Single snapshot" is wrong under READ COMMITTED — each statement takes a new snapshot. | **ACCEPTED.** The two statements are atomic and ordered, which is all the design needs; the wording is corrected rather than the design. |
| 10 | LOW | The jsonb prescription is right but its stated failure mode is wrong: postgres.js coerces an untyped object to `[object Object]` and the cast fails loudly, rather than silently double-encoding. | **ACCEPTED.** Repair the reasoning, keep the prescription. |

**Not relitigated, and not raised:** every §1.1a ratified item survived the round untouched.

## Between rounds — defects found by self-review, not by a reviewer

Recorded because the round-count retrospectives treat "found by the implementer"
and "found by the reviewer" as different signals.

| Defect | How it surfaced | Repair |
| --- | --- | --- |
| The per-call timeout omitted `retry: false`, so gaxios's internal retry would have multiplied the budget and the timeout would have bounded nothing. | The mandated class sweep over every `getDriveClient()` call site turned up `lib/drive/fetch.ts`, which had already solved and documented this. | `fix(drive)` idiom copied verbatim from `lib/drive/fetch.ts:359`; the gaxios-behaviour claims re-derived from that file rather than from memory. |
| `folderScope` was described as "additive to a returned object". It is not: `RefreshResult` is deep-equality asserted in five test files and the cron route's body is asserted with `toEqual`. | Reading the `'*'` sentinel's consumers while checking a different claim. | Field dropped entirely; the condition is reported as a durable emit. |
| `tests/sync/_metaInfraContract.test.ts` was marked N/A when it in fact registers all three watch entrypoints, one of them an executable "never rejects" contract that the reap lands inside. | Following a grep of the `'*'` sentinel into the registry. | Row corrected; §3.1.3a written to preserve the contract. |
| Three of the four master-spec anchors in §4.6 were wrong (the timeout clause is at `:1303`, not `:1320`; `:1330` was a blank line). | Self-audit of citations taken from the review report rather than from my own grep. | Anchors re-derived by grep and corrected; the status list also does not contain `stopping`, which only exists in the DDL CHECK. |
| §4.4's vacuity argument was asserted rather than measured. | Deciding whether the extended gate needed a definition check or a name check. | Queried the validation project directly: the constraint name exists there with the old six values and no `expired`, so a name-only check passes today. The query and its output are now in the spec. |

| The two-armed reap retired BOTH arms to `expired`, whose GC treatment skips `channels.stop`. For an inverted lease with a FUTURE `expires_at` that abandons a possibly-live Drive channel with nothing left to stop it. | Verifying my own citation of `tests/db/watchRenewalDue.test.ts:141-155` instead of trusting the review report's line range — the fixture turned out to be `expires_at` 24h out, not merely inverted. | Arms split: `expires_at <= now()` → `expired` (dead, no stop); `expires_at <= created_at` → `superseded` (liveness unknown, GC stops it). Port returns `{id, status}` so the emit and the tests can tell the populations apart. |

## Refuted review finding — recorded so it is not re-derived

**Spec R1 finding 10 (LOW) is REFUTED by measurement.** It claimed the `JSON.stringify` + `::jsonb` prescription was correct, and that postgres.js would reject a raw object loudly as `[object Object]` rather than double-encode it. Probed against the real local database and the real `public.upsert_admin_alert` RPC:

| Parameter form | `jsonb_typeof(context)` | `context->>'watched_folder_id'` |
| --- | --- | --- |
| raw object | `object` | `"probe-folder"` |
| `sql.json(obj)` | `object` | `"probe-folder"` |
| `JSON.stringify(obj)` | `string` | `null` |

The raw object is CORRECT and is accepted, not rejected. `JSON.stringify` is the form that silently double-encodes — the row is written, `occurrence_count` increments, and every `context->>` read returns NULL thereafter. The spec's prescription was inverted for two drafts and the review round agreed with the wrong version; §3.4.2 now carries the table above instead of an argument.

## Spec round 2 (Codex, reviewed `a6d2b3277`) — VERDICT: NEEDS-ATTENTION · all 9 accepted

| # | Sev | Claim | Disposition |
| --- | --- | --- | --- |
| 1 | HIGH | Promotion supersession races a late activation: an old-folder `pending` row committed before promotion is invisible to it, and `activatePending` later promotes it without rechecking `app_settings`. AC-6.18 still fails. | **ACCEPTED.** Promotion now also orphans old-folder `pending` rows, and `activatePending` refuses to promote a row that is no longer `pending` — the row count is currently unchecked, so activation reports success while the row stays orphaned. The canonical spec already prescribes that zero-row rollback (`:1318`); like AC-6.18, it was never implemented. |
| 2 | MEDIUM | The two-arm reap was not propagated to D2, D3, or §5. | **ACCEPTED.** |
| 3 | MEDIUM | `WatchChannelStatus` and the fake's local union both need `expired`; "nothing new has to be plumbed" was true of the field, false of the type. | **ACCEPTED.** |
| 4 | MEDIUM | Six existing refresh call sites inject no folder read and would hit the real service-role path. | **ACCEPTED** — the class was repaired only in the real-DB harness, not exhausted. |
| 5 | MEDIUM | The extended validation block lacks its own non-vacuity guard; a zero-match parse passes having asserted nothing. | **ACCEPTED.** It now asserts exactly one parsed constraint name first. The matrix row claiming the parity test "runs unchanged" contradicted the rewritten §4.4 and is corrected. |
| 6 | MEDIUM | Reap telemetry cannot distinguish `expired` from `superseded`. | **ACCEPTED.** The two populations are reported separately; a merged list would file a future-dated invalid lease as "expired". |
| 7 | LOW | Two false dependency claims: gaxios combines a caller signal via `AbortSignal.any` rather than being displaced; a renewal iteration makes ONE bounded Drive call. | **ACCEPTED, both.** |
| 8 | LOW | "First 20 by table order" is unsupported — `RETURNING` has no ordering contract. | **ACCEPTED.** The caller sorts before capping. |
| 9 | LOW | The 500-decision citation pointed at imports. | **ACCEPTED.** |

## Plan round 1b (Codex, reviewed `a6d2b3277`) — VERDICT: BLOCKING · all 8 accepted

| # | Sev | Claim | Disposition |
| --- | --- | --- | --- |
| 1 | BLOCKING | Task 5's atomicity test is not constructible: the seam is module-private and the public paths call it last. | **ACCEPTED.** Task 5 exports `markWatchOrphanedWithTx` and a `createPostgresWatchTx` factory — both existing production paths — so the contract is testable without a test-only branch. |
| 2 | HIGH | `tests/adminAlerts/alertProducerScope.registry.ts:214` pins the producer by LINE and its meta-test demands exact equality. | **ACCEPTED** and verified: line 463 is the `tx.upsertAdminAlert({` call today, and Tasks 2 and 5 both insert above it. Guaranteed suite failure. Re-derive after the last line-shifting task. |
| 3 | HIGH | The invalidated-assertion inventory missed both invalid-lease tests and the `seedActiveExpiring` isolation fixture. | **ACCEPTED** and verified: `tests/drive/watch.test.ts:657` seeds the rows, `:677` expects four subscribe calls — it would have exercised only reaping while still passing its own name. |
| 4 | HIGH | Task 2's ordering test passes against two separate transactions; Task 3b's single assertion passes if everything is superseded or if the write commits outside the transaction. | **ACCEPTED, both.** Rollback and preservation assertions added. |
| 5 | HIGH | Task 3b's UPDATE hits two SQL fakes with closed dispatchers. | **ACCEPTED** and verified. |
| 6 | HIGH | The class sweep is internally inconsistent and misclassifies already-bounded sites. | **ACCEPTED — my methodology was wrong.** I grepped client CONSTRUCTION and inferred boundedness from it. Re-run against actual call sites: everything under `lib/` is bounded; the unbounded set is exactly ten (two fixed here, eight under `app/api/`), matching the reviewer's list. |
| 7 | MEDIUM | Load-bearing qualifiers and cardinality requirements lack coverage. | **ACCEPTED.** |
| 8 | HIGH | "Four TDD commits" (ratified) contradicts seven task commits and invariant 6; the file inventory still lists a module Task 4 says will not exist. | **ACCEPTED.** The ratified choice was a PR-shape decision and "four" named the four backlog items. Spec §1.1a item 9 reworded so the documents agree; stale module removed. |

## Same-vector recurrence — structural fix applied (R3)

Three consecutive rounds found defects of one shape: **the plan restated something the spec defines, the spec was repaired, the restatement drifted.** Instances: a withdrawn module still in the plan's file inventory (R1b-8); merged telemetry field names contradicting both the spec and the plan's own test row (R2-3); mis-pinned master-spec anchors that had already been corrected in the spec (R2-5); a tautology recorded as accepted in this very log but left in the plan (R2-4); and the seven-site folder-read inventory landing in the spec's registry table but never in the plan's task body (R3-4).

Per the writing-plans same-vector rule, the response is structural rather than another round of patches: the plan now carries a **normative source rule** naming the spec as the only home for WHAT is built, with the plan normative only for ORDER and for facts about the existing tree. Ten drift-prone subjects are listed with their normative section, and a task that disagrees with the spec is by definition the wrong one. This converts a class of judgement calls into one-line fixes.

## Local test baseline is not trustworthy right now (recorded 2026-07-26)

A full-suite run at a docs-only HEAD reported 4 failing files out of 1637. That is **not** a usable pre-implementation baseline: the failing cases carry 15-30 second durations and the log contains cross-session database errors (`reset_crew_member_selection`, `set_admin_developer_rpc` → `not authorized`). Two sibling worktrees are running against this same local Postgres, and vitest was running 13 workers on top of them.

Consequence for implementation: **do not attribute these to the diff, and do not chase them.** Real CI runs isolated and is the authoritative pre/post comparison. If a local failure appears after implementation, re-run it alone before treating it as a regression — a contended box produces timeouts that look exactly like assertion failures.

## Spec round 4 (Codex, reviewed `f80b61f9a`) — VERDICT: NEEDS-ATTENTION · 7 findings

| # | Sev | Claim | Disposition |
| --- | --- | --- | --- |
| 1 | HIGH | The promotion race is still open: the activation guard's subquery reads a READ COMMITTED snapshot, so a subscriber can activate against the pre-promotion value and commit before promotion commits. | **ACCEPTED — and the vector is now DESCOPED**, per the writing-plans three-round rule. This is the third consecutive round on it and each repair introduced the next round's defect. Closing it needs serialization the design is ratified not to add (§1.1a item 6). What ships is best-effort supersession plus the canonical zero-row activation throw; what does not ship is the `app_settings` guard, because a half-correct guard reads as a closed race while leaving the window open. Residual is bounded to one lease and filed. |
| 2 | HIGH | GC erases the `expired` diagnosis: `expired` → `stopped`, and `stopped` maps to `watch_inactive`, so tier 3 is unreachable again after the `:15` pass. | **ACCEPTED.** The §3.1.5 claim was over-promised and is corrected rather than the code: post-GC `watch_inactive` is CORRECT (the folder genuinely has no watch, and reconcile re-subscribes), and tier 3 becoming rare is the D-A symptom disappearing, not a new blind spot. The test now drives the real reap → GC → health lifecycle instead of a synthetic literal row, which is what let the regression hide. |
| 3 | MEDIUM | The guard's fallback arm was wrong, and the measured "env fallback" case was mislabeled: the env path applies only when the settings ROW IS ABSENT, so a present row holding NULL is `no_folder_configured`. | **ACCEPTED**, and verified at `lib/appSettings/getWatchedFolderId.ts:77-80`. My probe measured the mislabeled state. Moot now that the guard is descoped, but recorded because the mislabel, not the SQL, is what made the probe look convincing. |
| 4 | MEDIUM | The refresh-call inventory still omitted `tests/drive/watch.test.ts:671`, and re-dating does not save its four-subscription assertion. | **ACCEPTED.** The test is rewritten as the folder-filter contract, which is strictly stronger than the count it replaces. |
| 5 | MEDIUM | The `superseded`-404 transition is unproved and the 404 detection unspecified. | **ACCEPTED.** The check reads `response.status`, `status` and numeric `code`, and any unrecognised shape counts as non-404 — defaulting ambiguity to retry, because mis-reading a live failure as 404 abandons the channel permanently. |
| 6 | MEDIUM | The repaired sweep command cannot run: in this repo's `rg`, `-E` is `--encoding`. | **ACCEPTED**, and reproduced: `rg: error parsing flag -E: unknown encoding`. Replaced with the `grep -rnE` form actually executed. |
| 7 | LOW | The skipped-folder sort contract has no assertion. | **ACCEPTED.** |
