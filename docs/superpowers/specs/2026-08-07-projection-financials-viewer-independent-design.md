# Viewer-independent financials projection alerting — design

**Date:** 2026-08-07 · **Arc:** `feat/projection-financials-viewer-independent` · **Closes:** `BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE` (BACKLOG.md:957)

<!-- spec-lint: not-ui — _CrewShell.tsx is cited as unchanged context only; no UI file is edited (R4) -->

## 0. Problem — two defects, one mechanism

The crew-page projection alert (`TILE_PROJECTION_FETCH_FAILED`) records, per render, the `tileErrors` keys that render observed (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, `failedKeys` computed from `data.tileErrors`, raise via `upsertAdminAlert`). `getShowForViewer` skips the `shows_internal.financials` read unless the viewer is entitled — `financialsEntitled = isLead || derivedFlags.includes("FINANCIALS")` (`lib/data/getShowForViewer.ts:380`, `isLead = isAdmin || LEAD` at `lib/data/getShowForViewer.ts:375`); the fan-out wave passes `financialsEntitled ? readFinancials() : Promise.resolve(undefined)` (`lib/data/getShowForViewer.ts:762`). Two consequences:

1. **Raise delay (the BL entry's premise, accepted at v1).** A financials-only outage with non-entitled-only traffic is unalerted until a lead/admin renders. Ratified as "Accepted v1 limitation (explicit, `financials` only)" in phase-1 spec §4.13 (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md`).
2. **Resolve defect (post-entry regression, found this arc).** S6 auto-resolution (`docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §S6, ratified 2026-07-03 — AFTER the BL entry, filed 06-17) resolves the alert on any healthy render: `failedKeys.length === 0` → `resolveAdminAlert`, which stamps `resolved_at` on the whole `(show_id, code)` row with **no `failedKeys` guard** (`lib/adminAlerts/resolveAdminAlert.ts`, the `update({ resolved_at })` builder). A non-entitled render cannot observe a financials failure, so during a financials-only outage its healthy-looking render **clears the lead-raised alert**. The alert flaps: on at each lead render, off at the next non-entitled render. This violates the §4.13 R41/R43 intent ("no lower-visibility render can shrink the row") — resolve is stronger than shrink. The S6 spec contains zero mentions of `financials`/`isLead`; the interaction was never considered (probe: `grep -in "financials\|isLead" docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` → no hits).

**Scope-narrowing fact.** `readRunOfShow` reads the SAME `shows_internal` table unconditionally on every render (`getShowForViewer.ts`, the `select("run_of_show")` block above `readFinancials`), so a table-level outage (connectivity, table down, PostgREST fault) already alerts viewer-independently under the `run_of_show` key. The residual blind class is failures specific to the financials read itself. Narrow — but the resolve defect (2) bites on ANY financials-visible failure regardless.

## 1. Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | **Approach A — un-gate the fetch, gate the RETURN.** `readFinancials` issues its query on every render; entitlement gates only what the projection returns. Chosen over (B) a separate status-only probe query and (C) a resolve-guard-only fix. | User selection 2026-08-07 (this arc's kickoff; visual mockup + explicit option pick). |
| R2 | **The §4.13 "Accepted v1 limitation" clause and its do-not-fabricate test instruction are RETIRED** — this doc is the ratified amendment of record (see §3). The rest of §4.13 (render-bound write, union-merge RPC, debounce, fail-quiet, wp-27 do-not-relitigate) stands untouched. | Consequence of R1; user-approved autonomous arc. |
| R3 | **No DB/RPC/migration change.** `upsert_admin_alert` union-merge + debounce (`supabase/migrations/20260505000000_upsert_admin_alert.sql`) and `resolveAdminAlert` are untouched. The resolve defect dissolves structurally (§2.3), not via partial-resolve semantics. | R1 mechanism; option C's partial-clear logic explicitly rejected. |
| R4 | **No UI change.** `_CrewShell.tsx` untouched; the financials visual fallback stays behind `financialsVisible` (§4.13 visual-gate bullet). `impeccable-gate: N/A — no UI surface`. | R1 mechanism. |
| R5 | **Routing:** spec + plan authored in the Fable kickoff session; implementation + closeout in a NEW Opus pane, same herdr workspace. | User directive 2026-08-07 mid-arc. |
| R6 | **Autonomous pipeline; both user review gates (spec, plan) waived.** | User approval 2026-08-07 (autonomous-ship checkpoint). |
| R7 | **Fail-quiet posture of raise/resolve unchanged** (observability writes never break the render) — §4.13, already pinned by existing tests. | Not in scope to revisit. |
| R8 | **Render-bound timing stays** (an outage between renders alerts at the next render, not sooner). Cron/push-based probing is out of scope. | §4.13 wp-27 do-not-relitigate; option A subsumes the entry's probe intent. |

## 2. Design

### 2.1 The one code change (`lib/data/getShowForViewer.ts`)

`readFinancials` becomes unconditional in the fan-out wave; the entitlement gate moves inside, at the return boundary:

- The wave slot at `lib/data/getShowForViewer.ts:762` changes from `financialsEntitled ? readFinancials() : Promise.resolve(undefined)` to `readFinancials()` (signature gains the entitlement, or reads the closure const — plan's choice; behavior below is the contract).
- `readFinancials` ALWAYS issues the existing `from("shows_internal").select("financials").eq("show_id", showId).maybeSingle()` on the existing service-role client (`lib/data/getShowForViewer.ts:330`). Same query, same client, same wave — one additional parallel query per non-entitled render, zero added latency (the wave resolves on its slowest member, and this query's table is already hit by the unconditional `run_of_show` read).
- **Failure paths (any viewer):** returned error → `tileErrors["financials"] = internalRes.error.message`; thrown → `tileErrors["financials"] = message` — byte-identical to today's entitled-render behavior, now on every render.
- **Success path, entitled:** decode + return the row — byte-identical to today.
- **Success path, NOT entitled:** return `undefined` WITHOUT decoding. The fetched value is dropped on the floor inside the function; it never reaches the projection, so `ShowForViewer.financials` stays `undefined` for non-entitled viewers exactly as today and nothing new is serialized toward the client.

### 2.2 Defense-in-depth restatement (honest accounting)

Today's comment stack claims three lines of defense: code gate ("the JSONB column isn't even queried", `lib/data/getShowForViewer.ts:713-718`), RLS, physical separation. The middle line is inert on THIS path — `getShowForViewer` runs entirely on the service-role client (`lib/data/getShowForViewer.ts:330`), which bypasses RLS. The real lines are the code gate and physical separation (financials not on `shows`). After this change the code gate moves from query-issuance to the return boundary: gated data is fetched server-side and discarded pre-projection for non-entitled viewers. RLS continues to protect every non-service-role path unchanged. The comment blocks that state the old contract are updated in the same commit (AC-7 lists them).

### 2.3 Why both defects dissolve with zero downstream edits

`_CrewShell` branches only on `failedKeys` emptiness — it is key-agnostic:

- **Raise:** a non-entitled render during a financials outage now has `tileErrors.financials` set → `failedKeys` non-empty → raise fires with `failedKeys: ["financials", ...]`. Viewer-independent raise, via the existing union-merge RPC. (Defect 1 closed.)
- **Resolve:** a non-entitled render with empty `failedKeys` now PROVES financials fetched successfully — the probe ran. S6's whole-row resolve becomes correct as-designed; no guard needed. (Defect 2 closed.)
- **Alert volume/churn:** during an outage, every render (not just lead renders) hits the raise path. The RPC already bounds this: `lastCountedAt` 10-minute debounce bounds `occurrence_count` inflation; the `WHERE`-gated `DO UPDATE` makes same-union in-window sightings true no-ops (§4.13 union-merge bullet). `occurrence_count` becomes an all-traffic recurrence signal instead of lead-only — strictly more accurate.

## 3. Ratified amendments to phase-1 spec §4.13

This section is the amendment record; the phase-1 document itself gets a pointer line (see AC-10), not a rewrite.

- **A1 — RETIRED:** "Accepted v1 limitation (explicit, `financials` only): a `financials` outage with non-lead-only crew-page traffic is not alerted until a lead/admin renders." New contract: **financials fetch status is observed on every render; `financials` enters `failedKeys` from any render.**
<!-- spec-lint: ignore — the em-dash sits inside verbatim-quoted phase-1 spec text, not user-visible copy -->
- **A2 — RETIRED:** "_Do not assert a non-lead render records `financials`; do not fabricate a non-lead `tileErrors.financials` fixture (impossible against the real projection — §9 tests through the real path)._" The fixture is now possible against the real projection and REQUIRED (AC-2). The "§9 tests through the real path" requirement itself stands: tests exercise `getShowForViewer`, not a hand-built `tileErrors`.
- **A3 — REWORDED:** §4.13's "The only viewer-dependence comes from the projection's own fetch boundary … skips the `shows_internal` (financials) query unless `isLead`" becomes: the fetch is unconditional; only the RETURNED financials value is entitlement-gated. All-domains-viewer-independent is now the uniform rule (`hotel`/`rooms`/`contacts`/`transportation`/`run_of_show`/`financials`).

## 4. Test contract

Anti-tautology posture: every non-entitled test seeds the mock with a REAL financials row (as `tests/data/financialsEntitlement.test.ts` already does), so `result.financials === undefined` can only pass via the gate, never vacuously; error-path tests assert both the `tileErrors` write AND the undefined result.

| AC | Assertion | Where |
|---|---|---|
| AC-1 | Non-entitled viewer: the financials SELECT ISSUES, in the same `Promise.all` wave (select-column disambiguation between the `shows_internal:financials` and `shows_internal:run_of_show` keys as in `tests/data/getShowForViewer.parallel.test.ts:71-95`) | rewrite of `tests/data/getShowForViewer.parallel.test.ts:262` ("non-LEAD viewer issues ZERO financials reads" — assertion inverts) |
| AC-2 | Non-entitled viewer + financials query error → `tileErrors.financials` set AND `result.financials === undefined` — through real `getShowForViewer` | new test, `tests/data/financialsEntitlement.test.ts` |
| AC-3 | Non-entitled viewer + query SUCCESS (mock returns real row) → `result.financials === undefined` (the data-gate) | rewrite of `financialsEntitlement.test.ts:158-169` zero-read test |
| AC-4 | LEAD / FINANCIALS-only / admin viewers: read issues + row returned — unchanged | existing tests at `tests/data/financialsEntitlement.test.ts:145` and `tests/data/financialsEntitlement.test.ts:172` stay green untouched |
| AC-5 | Entitled viewer + query error → `tileErrors.financials` set (today's behavior, still pinned) | existing coverage; add if absent |
| AC-6 | No test in the repo asserts zero financials reads for any viewer (grep `ZERO financials` clean after rewrite) | sweep |
| AC-7 | Comment lockstep: `lib/data/getShowForViewer.ts` comment blocks stating the old never-queried contract — the header note at `lib/data/getShowForViewer.ts:29`, the `FinancialsRow` doc at `lib/data/getShowForViewer.ts:78`, the `readFinancials` gate comment at `lib/data/getShowForViewer.ts:713-718`, the wave comment at `lib/data/getShowForViewer.ts:752-753`, and the return-site note at `lib/data/getShowForViewer.ts:822` — updated in the same commit as the code change | implementation |
| AC-8 | `BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE` closed: entry moved to `BACKLOG-archive.md`; in-progress marker removed in the PR's last commit (invariant 12) | closeout |
| AC-9 | Phase-1 spec §4.13 gets a one-line amendment pointer to this doc beside the retired clauses (A1/A2 locations); no other §4.13 edits | docs |
| AC-10 | `docs/superpowers/specs/README.md` (or the specs index that lists sibling docs) gains this spec's row | docs |

CrewShell composition is deliberately NOT re-tested: `_CrewShell` branches on `failedKeys` emptiness only (raise: `crewShellAlert.test.tsx`; resolve: S6 tests) and is untouched; the new viewer-independence is fully proven at the `getShowForViewer` boundary that produces `tileErrors`.

## 5. What does NOT change

- No migration, no RPC edit, no `admin_alerts` schema/semantics change.
- No UI surface (`app/`, `components/`, tokens): `impeccable-gate: N/A — no UI surface`.
- No new §12.4 codes, no catalog rows (x1 parity untouched).
- No mutation-surface change (invariant 10): `getShowForViewer` is a read path; the CrewShell raise/resolve emits are untouched and already covered.
- No advisory-lock surface (invariant 2): no mutation of locked tables.
- `resolveAdminAlert` / `upsertAdminAlert` helpers untouched.

## 6. Documented limits

- **Decode-level corruption stays silent for financials** (unchanged): a corrupt stored financials JSONB decodes to the null-field fallback without a `tileErrors` entry (`readFinancials` decode branch), unlike `run_of_show` which signals decode corruption. Pre-existing posture; not widened or narrowed here.
- **Entitlement-derivation bugs are invisible to this alert** — it observes fetch health, not whether the right viewers are entitled. Out of scope.
- **Render-bound timing** (R8): no renders → no observation. Admins retain the independent infra signals (drive-health, sync alerts) noted in the BL entry.
- **Consequence bound** (for review convergence): every render either records the financials fetch outcome into `tileErrors`/alert state or returns entitled data normally; the worst residual case is a documented-silent decode fallback that exists today. No input class is silently wrong in a NEW way. Threat-model fence: this guards against infrastructure fetch failures, not adversarial viewers — viewer-facing exposure is governed by the return-boundary gate (AC-3) and the unchanged physical separation.

## 7. Blast radius / effort

One lib file (`lib/data/getShowForViewer.ts`), two test files, three docs (`BACKLOG.md`/`BACKLOG-archive.md`, phase-1 spec pointer lines, specs README). No migration, no UI, no CI-surface change. Effort: S-M.
