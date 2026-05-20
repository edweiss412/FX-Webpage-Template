# Phase 0.E — `validation:report-fixtures` (Band F report-pipeline harness)

> Per spec §4.2 band F + §9.0 task 0.E (R24 BLOCKING gate) + §9.1.2. Estimate: 0.5 day.
>
> Goal: ship the report-pipeline fault-injection harness. BLOCKING by default per spec §9.0 — unblocked only by pre-dispositioning every deep report outcome as EXCLUDED-rely-on-structural in MATRIX-INVENTORY.md.

---

### Task 0.E.0: Decide INCLUDED-via-harness vs EXCLUDED-rely-on-structural

Phase 0.E is BLOCKING under the default disposition. If the dev wants to skip authoring this harness, they MUST instead pre-disposition every deep report-pipeline outcome (lookup-inconclusive, lease-expired, horizon-expired, orphaned-lost-lease) as EXCLUDED-rely-on-structural in MATRIX-INVENTORY.md (Phase 1 first task).

- [ ] **Step 1: Decide.** If unsure, default to INCLUDED-via-harness (build the harness). The alternative (EXCLUDED) requires careful per-outcome justification with structural-test cites.

- [ ] **Step 2: Record the decision in the dev's working notes.** If EXCLUDED, the rest of Phase 0.E is N/A — skip to Phase 0.F.

---

### Task 0.E.1: Implement `validation-report-fixtures`

**Files:**
- Create: `scripts/validation-report-fixtures.ts`
- Create: `tests/scripts/validation-report-fixtures.test.ts`

Per spec §9.1.2: `--outcome <success|in-flight|rate-limit-admin|rate-limit-crew|lookup-inconclusive|lease-expired|horizon-expired|orphaned-lost-lease>`. Materializes the named outcome's row shape in the `reports` table directly via service role per master spec §13.2.3. No real GitHub fault required — the harness writes the row shape that the redemption/render path would observe if the failure had genuinely occurred.

- [ ] **Step 1: Write failing test:**
  - rejects unknown outcome name
  - on success, INSERTs a row in `reports` with the named outcome's shape
  - tags row with `revoked_reason`-equivalent (whatever the reports table convention is — likely a column like `outcome_kind` or `status`) so cleanup can target only validation-induced rows
  - returns structured stdout: `materialized <outcome> report row <id>`
  - has a `--cleanup` flag that DELETEs validation-tagged rows

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Read master spec §13.2.3** to confirm the exact row shape per outcome. The spec enumerates:
  - `IDEMPOTENCY_IN_FLIGHT` — duplicate POST while original is mid-call
  - `REPORT_HORIZON_EXPIRED` — `created_at < now - 24h` retry path
  - `REPORT_ORPHANED_LOST_LEASE` — lost-lease cleanup path
  - rate limits — per `report_rate_limits` table

For each outcome, the harness either INSERTs into `reports` directly with the right column values (status, error code, lease state, etc.) OR uses the existing `/api/report` endpoint with crafted inputs that trigger the outcome.

- [ ] **Step 4: Implement.** Use `assertProdEquivalentTarget` guard. Service-role INSERT for each outcome's row shape.

- [ ] **Step 5: Tag every harness-INSERTed row** with a stable identifier (e.g., `idempotency_key = 'validation:report-fixtures:<outcome>'`) so the `--cleanup` flag can selectively DELETE.

- [ ] **Step 6: Run — expect PASS.** Commit.

---

### Task 0.E.2: Integration test against the rendered UI

The harness's value is rendering — does the live UI show the failure-state row correctly? Phase 0.F smoke 7 covers this end-to-end, but a quick unit test here builds confidence.

- [ ] **Step 1: Write a unit-style assertion** that for each materialized outcome, the resulting row's `messageFor(<outcome-code>)` returns a non-null `dougFacing` (or whatever the rendering predicate is). This catches "harness wrote row but the row shape doesn't trigger any rendering" bugs.

- [ ] **Step 2: Run.** Commit.

---

### Task 0.E.3: End-to-end Phase 0.E verification

- [ ] **Step 1: Run `pnpm validation:report-fixtures --outcome lookup-inconclusive`** against prod-equivalent Supabase. Expect exit 0 + report row visible in admin UI.

- [ ] **Step 2: Verify cleanup works:** `pnpm validation:report-fixtures --cleanup`. Confirm DELETE removed validation-tagged rows.

- [ ] **Step 3: Move to Phase 0.F** (`06-phase0-smokes.md`).

---

## Phase 0.E failure modes

- **Harness INSERT fails CHECK constraint.** The reports table has invariants (status enum, FK to other tables). The harness must write SHAPE-correct rows — re-read master spec §13.2.3 row contracts.
- **Row materialized but UI doesn't render.** Either the UI predicate doesn't match the harness's row shape (the harness is incomplete), OR the `messageFor()` lookup is wrong. Diagnose by reading the admin UI's render code.
- **Cleanup misses rows.** Validation-tag the rows on INSERT; the cleanup pattern matches `WHERE <tag-column> LIKE 'validation:%'` (analogous to revoked_links cleanup in §3.3).
