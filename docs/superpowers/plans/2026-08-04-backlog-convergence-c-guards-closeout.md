# Backlog convergence — Unit C guards/tests cluster closeout

Branch `chore/sweep-guards-tests`. Plan: `docs/superpowers/plans/2026-08-04-backlog-convergence.md` Tasks 15–20.

impeccable-gate: N/A — no UI surface

That marker is load-bearing here rather than boilerplate: **two of the nine claimed entries turned out to have UI fixes**, and honoring this scoping is why neither landed on this branch. See §3.

## 1. Disposition of all nine claimed entries

| Entry | Disposition |
| --- | --- |
| `BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY` | **CLOSED** — comparator made total; both `accepted-gap` rows retired, surface now carries none |
| `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` | **CLOSED** — emit deferred out of the locked transaction, both handlers |
| `BL-CANONICAL-CLASS-ARRAY-BLINDSPOT` | **CLOSED** — blind spot bounded by census; migration filed as `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` |
| `BL-LEDGER-BODY-DEFINED-ID-OVERMINT` | **CLOSED** — condition 4 (separator required); corruption probed first |
| `BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR` | **CLOSED** — committed 58-code equality anchor |
| `BL-REALTIME-BROADCAST-FRAME-DROP-WATCH` | **CLOSED** — investigation discharged; the watch found nothing |
| `BL-TELEMETRY-FALLBACK-RETRY` | **PREREQ-FENCED**, stays open — trigger unmet AND the fix is a UI surface |
| `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` | **STAYS OPEN** — both preconditions verified; the mutation itself is blocked (§4) |
| `BL-FRESHNESS-ABORTED-CLOSE-E2E` | **NOT ATTEMPTED**, claim released — recorded plainly, not dressed as a fence (§5) |

Six closed, three left open with their reasons on the entries. `pnpm ledger:mass`: 102 entries / 301 → **97 / 292**.

## 2. What the closures actually needed beyond what the entries said

Three entries under-described their own fix, and each gap was itself a defect:

- **The comparator** needed three things its entry never mentioned. `suitePaths` had to gain the new suite — a mutant inside a function no listed suite calls survives for want of a caller, and nine did. The suite must import relatively rather than through `@/`, because an aliased import resolves past the runner's substituted mutant to the pristine original, so every mutant "survives" against a file the test never loaded. And the six remaining survivors needed classifying, all six argued from control flow rather than from V8's sort being stable — which is precisely what the old `accepted-gap` rows rested on.
- **The rebuild-exhaustion emit** exposed a real gap in the invariant-10 registry: Assertion 1 required the registered route file to contain `await logAdminOutcome(`, so a surface that DEFERS its emit failed the check *for doing what invariant 10 demands*. The registry punished the fix. Rows may now declare `emittedVia`, which moves the mechanical checks to the module owning the call while `file` stays the surface of record — and a declaring row must additionally prove the surface reaches the flush, so the field cannot point at a module the route never calls.
- **The canonical-class entry's prescribed fix does not apply as written.** It says migrate to `cn(...)`, "already a default-detected callee". Probed: there is no `cn` helper anywhere in this repo, and neither `clsx` nor `class-variance-authority` is a dependency. So the migration is not the mechanical `eslint --fix` the entry promises — it must first introduce a callee. A test now asserts that absence, so the day a `cn` lands it fails and points at the migration entry.

## 3. Two entries had UI fixes, and the plan's own gate scoping decided them

`BL-CANONICAL-CLASS-ARRAY-BLINDSPOT`'s repair spans 33 sites in 20 files under `components/` and `app/`; `BL-TELEMETRY-FALLBACK-RETRY`'s is a retry control on `app/admin/dev/telemetry/page.tsx`. Either would make this branch an invariant-8 UI surface, contradicting the `N/A — no UI surface` marker above.

They were dispositioned differently because they are not the same case. The canonical-class entry had a **guard half worth shipping here** — the census bounds the blind spot so it can only shrink — with the migration filed out under class-sweep exception (c). The telemetry entry has no guard half: the fix *is* the control, and its own trigger ("the next telemetry pass, or a report of the readout failing in practice") is unmet, so it is prereq-fenced with the fence quoted.

## 4. Outstanding: one command, blocked on tooling permission

`BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` is owner-approved (spec §4.5 item 3) and **both preconditions are verified**:

- **Soak green** — 60 runs since 2026-07-27: 57 success, 3 cancelled, zero failures.
- **The workflow reports on every PR** — checked because the soak cannot show it, and a required context that never reports blocks every PR forever. `section-header-visual.yml` is deliberately unfiltered on `pull_request`.

The `gh api -X POST` mutation was denied by this session's tooling permission classifier — an environment limit, not a repo or GitHub one. The exact command and its verification are recorded on the entry. Current required set is 12 contexts; this adds the 13th.

## 5. One item not attempted, recorded as such

`BL-FRESHNESS-ABORTED-CLOSE-E2E` needs a single Playwright case driving an animated modal exit across a realtime-seeded two-context harness. It is not fenced — the work is owed and the entry's own "What would close it" already specifies it exactly. It was not attempted because it cannot be verified without a dev server and browsers, and an e2e case pushed without ever being run is worse than no case: a green CI tells you nothing about a test never observed failing. Claim released so the row is not falsely held.

## 6. Verification

- `pnpm typecheck` clean; `pnpm mutation:guards` 8/8; doc guards 326 green; the log/sync/onboarding regression 1595 green across 193 files.
- Every new guard was proven to FAIL before being trusted: a planted array-join className, a planted anchor code, the mention/typo corruption against the shipped `bodyDefinedIds`, and the emit-ordering assertion red at tick 1 vs 2.
- Real CI green on the PR is the gate that counts.
