# Task 3: Nearest-preceding inheritance

**Files:**

- Modify: tests/parser/inlineLaterGroupOwnHotel.test.ts (new `describe("inheritance")` block; same harness as Task 2)
- Modify: `lib/parser/blocks/hotels.ts` — nearest-preceding inheritance in the row-finalization pass (spec §4, S7)

(Scope-A/scope-B evidence scans moved to Task 5 — they are warning-observable only, so they land AFTER Task 4's emit plumbing; plan R1 finding 3.)

**Interfaces:**

- Consumes: Task 2's wiring (tier outcomes computed before the all-names guard; tier-1 keeps live).
- Produces: a later tier-3/tier-2 row inherits the NEAREST PRECEDING kept hotel (tier-1 group or group 0), not always group 0 — row-observable via `hotel_name`/`hotel_address` on the inheriting row.

## Oracle groups (spec §8.1 rows, byte-exact; same harness file/pattern as Task 2)

1. Nearest-preceding worked example (S7) — the inheriting row's `hotel_name` equals the PRECEDING tier-1 group's kept hotel, not group 0's.
2. Two-tier-1-predecessors discriminator (R16 f2) — kills a "most recent tier-1 anywhere" or "always group 0" implementation; the row names which predecessor wins.
3. Null group-0 `baseName` inheritance shape (R16 f5) — row fields only here; the envelope bytes for this row land in Task 4's envelope tests.

Warning-cardinality clauses for these rows extend the Task 2 `describe.skip("warning cardinality (unskipped by Task 4)")` block, same row names.

Concrete failure modes: rows 1–2 kill always-inherit-group-0 and wrong-predecessor implementations; row 3 kills a null-deref on a group-0 build without a `baseName`.

## Steps

- [ ] **Step 1: Write the failing tests** — the `describe("inheritance")` block per the rows above; extend the skip block with their warning rows.
- [ ] **Step 2: Run, verify the new block FAILS** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts`. Expected: rows 1-2 (nearest-preceding + two-predecessor discriminator) FAIL — this task's red; row 3 (null group-0 baseName) PASSES already (with no preceding tier-1 row it inherits group 0's null today — a regression pin, plan R2 f6); Task 2 rows stay green.
- [ ] **Step 3: Commit failing tests** — `git add tests/parser/inlineLaterGroupOwnHotel.test.ts && git commit -m "test(parser): nearest-preceding inheritance oracles"`
- [ ] **Step 4: Implement** — nearest-preceding inheritance in the row-finalization pass: an inheriting (tier-2/tier-3) later row takes the hotel of the nearest preceding KEPT row (tier-1 or group 0).
- [ ] **Step 5: Run to green** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts`. Expected: PASS.
- [ ] **Step 6: Full suite + typecheck** — `pnpm typecheck && pnpm vitest run tests/parser`. Expected: PASS.
- [ ] **Step 7: Commit** — `git add lib/parser/blocks/hotels.ts && git commit -m "feat(parser): nearest-preceding kept-hotel inheritance for later groups"`
