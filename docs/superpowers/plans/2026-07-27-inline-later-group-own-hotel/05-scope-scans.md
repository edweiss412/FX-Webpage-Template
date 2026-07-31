# Task 5: Degraded scope-A / scope-B evidence scans

Lands AFTER Task 4 so every scan outcome is warning-observable at this task's own boundary (plan R1 finding 3): the scans' ONLY behavioral delta is `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` stashes, and the emit plumbing now exists — no skip device, all assertions ACTIVE.

**Files:**

- Modify: tests/parser/inlineLaterGroupOwnHotel.test.ts (new `describe` blocks: `scope A`, `scope B + fallback`; same harness)
- Modify: `lib/parser/blocks/hotels.ts` — caller-side scope-A per-segment scan, scope-B fallback attribution, max-one-SUSPECTED-per-row discipline (spec §4 scopes A/B)

**Interfaces:**

- Consumes: Task 2's wiring (detection computed before the all-names guard), Task 4's stash slots + emitters.
- Produces: (a) scope A — every segment with ≥2 `Check In` matches on D1-normalized text runs the evidence scan on the D1-NORMALIZED post-first-marker region (street/postal regexes, raw + restricted-neutralized reads, plus arm-ii conf families with ZIP+4 exclusion — family definitions IDENTICAL to the detector's) and stashes ONE `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` on the segment's surviving row when positive; (b) scope B — a fallback-collapsed cell with tier-1/2 evidence on any later segment attributes exactly ONE SUSPECTED to the surviving reservation; (c) max-one-SUSPECTED-per-row across all sources.

## Oracle groups (spec §8.1 rows, byte-exact; warning assertions ACTIVE via `parse(later).warnings.filter(...)`)

1. **Scope A:** R9 flip (conf-carrying glued guest WARNS) + conf-less true negative; R10 partial degradation (3-booking cell, SUSPECTED@0); street-only / postal-only positives (R16 f3); hash positive (R17); bare-digit positive (R18 f2); ZIP+4 negative (R18 f2); **ZIP+4 rejection boundaries, scope A** (five materializations — first FOUR warn via arm (ii), FIFTH silent; kill-claims per the row's R43-f2 scoping); entity-split evidence (R21 f2); tab-split evidence (R38 f2); quoted evidence (R48); digit-run prose WARNS (R53/R55 flip, `Note FY-2026 Drive kickoff` — documented limit; the only scope-A FY row, phantom duplicate removed plan R11 f2); dash-glued street ×3 forms (R29/R49); word-glued street ×3 forms (R55); lowercase-state silent (R30 documented limit); entity-split first checkout WARNS (R26). (The tab-entity-split third-marker degrade row moved to Task 2 — it exercises D1 marker counting + the tier-gate, not the evidence scan, and cannot provide this task's red; plan R11 f2.)
2. **Scope B + fallback:** José non-ASCII fallback with D1-affected bytes (R7); fallback suffix-only warn; fallback no-evidence negative; **Fallback survivor, whole-cell scope-A conf positive** (R24 f3, ×3 dash-family forms — the trailing-initial `Jane D` cell: ONE reservation byte-equal to today's fallback PLUS exactly one SUSPECTED via arm (ii) on `- 1002` after the cell's first marker; the earlier zero-new-codes framing was the pre-R13 oracle the spec FLIPPED — the word-count rule is discriminated ONLY by Task 1's unit oracle, warnings cannot discriminate it; plan R11 f1); **Missing group-0 checkout, later postal hotel** (R9 — ONE-segment collapse, byte-equal single reservation PLUS exactly one SUSPECTED via evidence-scan arm (i); the INTEGRATION test through `parseHotels` that kills the R9 bypass); max-one collision matrix pairs a/b/c (R14 f3); **Stash order, SUSPECTED slot** (R20 f3 — the degraded Hotel-71 survivor cell: row byte-equal to today's parse, per-row emit order guest → SUSPECTED → address all at index 0, exactly one SUSPECTED; kills an implementation that appends SUSPECTED after the address stash while passing Task 4's OWN-slot order test; plan R3 f2).

Anti-tautology: scope-A positives assert BOTH the cardinality (`.length === 1`, never `.some()`) AND `rawSnippet === <the RAW cell/segment bytes with entity/quote/tab intact>` AND `!== normalized` where the row states it.

Concrete failure modes: scope-A rows kill raw-byte scans (entity/quote/tab inputs), unrestricted/over-restricted neutralizers (FY / word-glued / digit-run family), family-omitting arm-ii implementations (hash/bare/ZIP+4 cells complete the family × context matrix), and scan-region errors (pre-marker text leaking in); scope-B rows kill silent-vanish on fallback and double-stash (max-one matrix).

## Steps

- [ ] **Step 1: Write the failing tests** — two new `describe` blocks per the groups above, warning assertions ACTIVE.
- [ ] **Step 2: Run, verify the new blocks FAIL** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts`. Expected: scan positives FAIL (no scan exists — zero SUSPECTED emitted); negatives/limits PASS (they assert silence).
- [ ] **Step 3: Commit failing tests** — `git add tests/parser/inlineLaterGroupOwnHotel.test.ts && git commit -m "test(parser): scope-A/B degraded-scan warning oracles"`
- [ ] **Step 4: Implement** — scope-A scan (D1-normalize segment text, locate first marker in normalized text, scan the region with the S9 arm definitions); scope-B attribution on the fallback path (detection already computed pre-guard, Task 2); max-one-per-row stash discipline.
- [ ] **Step 5: Run to green** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts`. Expected: PASS.
- [ ] **Step 6: Full suite + typecheck** — `pnpm typecheck && pnpm vitest run tests/parser`. Expected: PASS.
- [ ] **Step 7: Commit** — `git add lib/parser/blocks/hotels.ts && git commit -m "feat(parser): scope-A/B degraded-segment evidence scans + max-one stash discipline"`
