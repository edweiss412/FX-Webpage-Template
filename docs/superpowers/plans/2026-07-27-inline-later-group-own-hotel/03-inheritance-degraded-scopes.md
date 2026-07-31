# Task 3: Nearest-preceding inheritance + degraded scope-A/scope-B scans

**Files:**
- Modify: `tests/parser/inlineLaterGroupOwnHotel.test.ts` (new `describe` blocks: `inheritance`, `scope A`, `scope B + fallback`)
- Modify: `lib/parser/blocks/hotels.ts` — caller-side scope-A per-segment scan, scope-B fallback attribution, nearest-preceding inheritance (spec §4, S7)

**Interfaces:**
- Consumes: Task 2's wiring (per-row stash slots; tier outcomes computed before the all-names guard).
- Produces: (a) inheritance — a later tier-3/tier-2 row inherits the NEAREST PRECEDING kept hotel (tier-1 group or group 0), not always group 0; (b) scope A — every segment with ≥2 `Check In` matches on D1-normalized text runs the evidence scan on the D1-NORMALIZED post-first-marker region (street/postal regexes, raw + restricted-neutralized reads, plus arm-ii conf families with ZIP+4 exclusion) and stashes ONE `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` on the segment's surviving row when positive; (c) scope B — a fallback-collapsed cell with tier-1/2 evidence on any later segment attributes exactly ONE SUSPECTED to the surviving reservation; (d) max-one-SUSPECTED-per-row across all sources.

## Oracle groups (spec §8.1 rows, byte-exact; same harness file/pattern as Task 2)

1. **Inheritance:** nearest-preceding worked example (S7); two-tier-1-predecessors discriminator (R16 f2); null group-0 baseName envelope shape (R16 f5 — row fields only here; envelope bytes in Task 4).
2. **Scope A:** R9 flip (conf-carrying glued guest WARNS) + conf-less true negative; R10 partial degradation (3-booking cell, SUSPECTED@0); street-only / postal-only positives (R16 f3); hash positive (R17); bare-digit positive (R18 f2); ZIP+4 negative (R18 f2); entity-split evidence (R21 f2); tab-split evidence (R38 f2); quoted evidence (R48); digit-run prose WARNS (R53/R55 flip — documented limit); hyphenated-note FY input; dash-glued street ×3 forms (R29/R49); word-glued street ×3 forms (R55); lowercase-state silent (R30 documented limit); entity-split first checkout WARNS (R26); tab-entity-split third marker degrade (R36 f2); whole-cell scope-A conf positive ×3 dash forms (R24 f3/R49).
3. **Scope B + fallback:** José non-ASCII fallback with D1-affected bytes (R7); fallback suffix-only warn; fallback no-evidence negative; trailing-initial scope-B silence (R22 — the unit oracle lives in Task 1's file; here the whole-cell byte-parity + zero-new-codes assertion); max-one collision matrix pairs a/b/c (R14 f3).

Row-shape assertions land now; the per-row WARNING assertions for these rows also go into the Task 2 `describe.skip("warning cardinality — unskipped by Task 4")` block (extend it here with these rows). Until Task 4, scope scans record stashes without emitting.

Anti-tautology: scope-A positives must assert `rawSnippet === <the RAW cell/segment bytes with entity/quote intact>` AND `!== normalized` (those byte assertions live in Task 4's envelope tests; here assert row parity + stash bookkeeping via public row output only). Every "exactly one" is asserted by filtering the full warnings array by code and checking `.length === 1` (Task 4), never `.some()`.

Concrete failure modes: inheritance rows kill always-inherit-group-0; scope-A rows kill raw-byte scans (entity/quote/tab inputs), unrestricted/over-restricted neutralizers (FY / word-glued / digit-run family), and family-omitting arm-ii implementations (hash/bare/ZIP+4 cells complete the 8-cell family × context matrix); scope-B rows kill silent-vanish on fallback and double-stash (max-one matrix).

## Steps

- [ ] **Step 1: Write the failing tests** — three new `describe` blocks per the groups above; extend the skip block with their warning rows.
- [ ] **Step 2: Run, verify the new blocks FAIL** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts` (negatives/limits that match today PASS; positives needing inheritance/scopes FAIL).
- [ ] **Step 3: Commit failing tests** — `git commit -m "test(parser): inheritance + scope-A/B degraded-scan oracles"` (file already tracked).
- [ ] **Step 4: Implement** — nearest-preceding inheritance in the row-finalization pass; scope-A scan (D1-normalize segment text, locate first marker in normalized text, scan the region with the S9 arm definitions — identical family/read definitions as the detector); scope-B attribution on the fallback path (detection already computed pre-guard, Task 2); max-one-per-row stash discipline.
- [ ] **Step 5: Run to green** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts`. Expected: PASS.
- [ ] **Step 6: Full suite + typecheck** — `pnpm typecheck && pnpm vitest run tests/parser`. Expected: PASS.
- [ ] **Step 7: Commit** — `git add lib/parser/blocks/hotels.ts && git commit -m "feat(parser): nearest-preceding inheritance + scope-A/B degraded scans"`
