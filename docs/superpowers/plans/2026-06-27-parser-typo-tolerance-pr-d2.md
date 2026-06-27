# Parser Typo-Tolerance PR-D2 (transport V2_SCHEDULE_LABELS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover transport schedule rows whose stage label is a likely typo. In the v2 transport parser, a schedule row is recognized ONLY by exact membership in `V2_SCHEDULE_LABELS` — a misspelled label (e.g. `Pick Up Warehous`) is currently dropped, so the whole transport leg (date/time/passengers) is lost from the crew page. PR-D2 adds a gated fuzzy fallback so a near-miss is recognized, the entry recovered, and a `FIELD_LABEL_AUTOCORRECTED` warning emitted.

**Architecture:** `parseV2Transport` (lib/parser/blocks/transport.ts) iterates the transport table; metadata rows (driver/vehicle/parking/notes) are consumed by exact `if…continue` checks, then `if (V2_SCHEDULE_LABELS.has(label))` appends a schedule entry. PR-D2 adds an `else` that runs `gatedVocabCorrect` over the uppercase schedule vocab (the PR-A local-vocab pattern); on a near-miss it appends the entry (keeping the operator's raw label as `stage`) and warns. No deferred-commit / loop refactor is needed — schedule rows are independent (one entry per row), and the fuzzy branch is the `else` of the exact check, so an exact label never double-fires. The only structural prep is threading the existing `ParseAggregator` into `parseV2Transport` (it currently stops at `parseTransportation`).

**Tech Stack:** TypeScript, Next.js 16 parser modules, Vitest. No DB, no UI, no migrations.

## Scope (v2-only — deliberate)

- **In scope:** `parseV2Transport`'s `V2_SCHEDULE_LABELS` recognizer — the one place a schedule entry's capture depends SOLELY on exact membership of a closed vocab, so a typo = a dropped leg.
- **Out of scope (documented):**
  - `parseV4Transport` (transport.ts:256) only uses `V2_SCHEDULE_LABELS` as a *secondary* gate (`seenDateHeader || …`); v4 post-date-header rows are filtered by the `isTransportStage` **regex allowlist** (transport.ts:73-90) — a different (already typo-tolerant) mechanism. Adding closed-vocab fuzzy there would not change post-date-header behavior and is redundant.
  - `parseV1Transport` recognizes any non-`Driver`/`Parking`/`Notes` row as a schedule-like row already (transport.ts:436) — no closed-vocab gate to fuzz.
  - The `{PASSENGERS}` column-header fuzzy (a separate surface the PR-A note deferred) stays deferred — it is a column header, not the schedule-label vocab.
  - Metadata labels (driver/vehicle/parking/notes) are NOT fuzz-recovered (a `Vehicl` typo stays dropped, as today) — out of scope for this slice.

## Global Constraints

- **TDD per task** (invariant 1): failing test → run-fail → minimal impl → run-pass → commit. One task per commit (`feat(parser):` / `test(parser):`).
- **No new error code.** Reuse `FIELD_LABEL_AUTOCORRECTED` (already wired end-to-end from PR-B: catalog `lib/messages/catalog.ts:1117`, OPERATOR_ACTIONABLE `lib/parser/dataGaps.ts:131`, dispatch `lib/drive/showDayTimeAnchors.ts:141`, help-family `app/help/errors/_families.ts:61`). A transport schedule label is a label-recognition correction; the catalog copy is generic ("a field label looked misspelled … we read it as the closest real one"). A transport-specific code is explicitly deferred — not worth the #155 6-surface lockstep for this slice. Do NOT edit §12.4 / run `gen:spec-codes`.
- **`blockRef.kind = "transportation"`** — a RegionId (`lib/sheet-links/buildSheetDeepLink.ts:25`) with a header-block anchor (`:70`). It is NOT in `KIND_TO_REGION` (showDayTimeAnchors.ts), so the FIELD_LABEL_AUTOCORRECTED region-branch resolves `region["transportation"]` (or degrades link-less). No dispatch change.
- **Single source / no drift:** the fuzzable vocab is DERIVED from `V2_SCHEDULE_LABELS` and exported once (`TRANSPORT_SCHEDULE_VOCAB`); the registry imports it; a registration test re-derives (mirrors PR-D1's `EVENT_LABEL_VOCAB`).
- **Corpus stability:** the fixtures are correctly spelled, so no fuzzy fires on them — the whole-corpus transport tests must be unchanged.

## Behavior contract

1. **Exact membership is unchanged.** A row whose lowercased label is in `V2_SCHEDULE_LABELS` is appended exactly as today (no warning). The fuzzy branch is the `else` of the exact check, so it never runs for an exact label (no double-push).
2. **A near-miss recovers the entry with the RAW label.** A row whose label is not exact but is a gated near-miss (Damerau ≤ 1, tie-abort) of a schedule label is appended with `stage: col0` (the operator's original text — we recover the leg, we do not rewrite crew-facing free text) and emits one `FIELD_LABEL_AUTOCORRECTED` (warn, `kind: "transportation"`, `rawSnippet: col0`).
3. **Selectivity.** A row that is neither exact nor a near-miss (a genuinely-unrelated label, a short token, or a metadata typo like `Vehicl`) is NOT appended and emits no warning — exactly today's behavior. The Damerau-1 gate plus the distinctiveness of the long schedule phrases keep false recognitions out.

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/parser/typoVocabCollision.test.ts` — adds a derived `transportScheduleLabel` fuzzable row to `TYPO_VOCABS`; the standing tripwire then asserts no member sits within Damerau-1 of any OTHER registered vocab. Plus a registration test pinning the derivation. **Creates no new meta-test.**
- **N/A — declared explicitly:** advisory-lock topology, Supabase call-boundary, `admin_alerts` catalog, postgrest-dml-lockdown — PR-D2 is parser-only (no DB writes, no auth, no admin alerts, no `pg_advisory*`).
- **N/A — no new warn code** → the §12.4 catalog-parity (`x1`) lockstep is not in scope (reuse).

## File Structure

- **Modify** `lib/parser/blocks/transport.ts` — export a derived `TRANSPORT_SCHEDULE_VOCAB`; add the `gatedVocabCorrect` import; thread `agg` into `parseV2Transport` (signature + the `parseTransportation` call site); add the fuzzy `else` branch with the warn.
- **Modify** `lib/parser/typoVocabRegistry.ts` — add the `transportScheduleLabel` entry importing `TRANSPORT_SCHEDULE_VOCAB`.
- **Modify** `tests/parser/blocks/transport.test.ts` — add the fuzzy-recovery describe block (Task 1) + the property test (Step 5).
- **Modify** `tests/parser/typoVocabCollision.test.ts` — add the `transportScheduleLabel` registration test (Task 2).

---

## Task 1: Fuzzy schedule-label recovery in parseV2Transport

**Files:**
- Modify: `lib/parser/blocks/transport.ts`
- Test: `tests/parser/blocks/transport.test.ts`

**Interfaces:**
- Consumes: `gatedVocabCorrect` (`lib/parser/typoGate.ts:16`), `ParseAggregator` + `newAggregator` (`lib/parser/warnings.ts`).
- Produces (for Task 2): `export const TRANSPORT_SCHEDULE_VOCAB: readonly string[]` from `lib/parser/blocks/transport.ts`.

- [ ] **Step 1: Write the failing BEHAVIOR tests** — append to `tests/parser/blocks/transport.test.ts`. Add `import { newAggregator } from "@/lib/parser/warnings";` (the gate/vocab/generator imports come in Step 5). Then append:

```ts
// ── PR-D2: fuzzy schedule-label recovery (v2) ────────────────────────────────
// Minimal v2 TRANSPORTATION block (header | TRANSPORTATION | NAME | PHONE |) from rows.
function v2Block(rows: string[]): string {
  return ["| TRANSPORTATION | NAME | PHONE |", "| Driver | Carlos Pineda | 610-618-0111 |", ...rows].join("\n") + "\n";
}
const FLA = (agg: ReturnType<typeof newAggregator>) =>
  agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");

describe("parseTransportation — v2 fuzzy schedule-label recovery (PR-D2)", () => {
  it("recovers a misspelled schedule label and warns once (kind=transportation, raw stage kept)", () => {
    const agg = newAggregator();
    const t = parseTransportation(v2Block(["| Pick Up Warehous | 10/6 @ TBD |"]), "v2", undefined, agg);
    const entry = t!.schedule.find((s) => s.stage === "Pick Up Warehous");
    expect(entry).toBeDefined(); // recovered with the operator's RAW label
    const warns = FLA(agg);
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef).toEqual({ kind: "transportation" });
    expect(warns[0]!.rawSnippet).toBe("Pick Up Warehous");
  });

  it("exact schedule label still routes unchanged, no warning", () => {
    const agg = newAggregator();
    const t = parseTransportation(v2Block(["| Pick Up Warehouse | 10/6 @ TBD |"]), "v2", undefined, agg);
    expect(t!.schedule.some((s) => /pick up warehouse/i.test(s.stage))).toBe(true);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("a genuinely-unrelated label is NOT recognized as a schedule row, no warning", () => {
    const agg = newAggregator();
    const t = parseTransportation(v2Block(["| Catering Notes | Lunch at noon |"]), "v2", undefined, agg);
    expect(t!.schedule).toHaveLength(0);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("a metadata-label typo (Vehicl) is NOT pulled into the schedule, no warning", () => {
    const agg = newAggregator();
    const t = parseTransportation(v2Block(["| Vehicl | 16' Box Truck |"]), "v2", undefined, agg);
    expect(t!.schedule).toHaveLength(0);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("a too-short token is not fuzz-recognized", () => {
    const agg = newAggregator();
    const t = parseTransportation(v2Block(["| Pick | x |"]), "v2", undefined, agg);
    expect(t!.schedule).toHaveLength(0);
    expect(FLA(agg)).toHaveLength(0);
  });
});
```

  **Concrete failure modes these catch:** a dropped transport leg on a typo'd label (recover test); regression of exact recognition or a spurious warn on a correctly-spelled label (exact test); false-recognition of unrelated rows (Catering test — catches an over-broad gate); scope creep pulling metadata typos into the schedule (Vehicl test); over-eager matching of short tokens (Pick test). The "typos beyond the example sheets" property test lands in Step 5.

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/blocks/transport.test.ts`. Expected (a clean assertion red): the **recover** test FAILS (the typo'd row is dropped today, so no entry and no warn); the **exact**, **Catering**, **Vehicl**, and **Pick** tests already PASS (current behavior already ignores all of them) — confirm those 4 are green in this run.

- [ ] **Step 3: Implement in `lib/parser/blocks/transport.ts`.**

  3a. Add the import (after the existing `canonicalize` import, transport.ts:31):
```ts
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
```

  3b. Export the derived vocab + gate opts. Immediately AFTER the `V2_SCHEDULE_LABELS` Set literal (after transport.ts:103) add:
```ts
// Uppercase schedule labels the v2 fuzzy fallback recognizes toward — DERIVED from
// V2_SCHEDULE_LABELS (single source of truth; lib/parser/typoVocabRegistry.ts imports this
// exact const so the registry can't drift). All members are long (>=13 chars), so minLen:5
// never trips; it is passed for convention + robustness.
export const TRANSPORT_SCHEDULE_VOCAB: readonly string[] = [...V2_SCHEDULE_LABELS].map((s) =>
  s.toUpperCase(),
);
const TRANSPORT_SCHEDULE_GATE_OPTS = { minLen: 5, tieAbort: true } as const;
```

  3c. Thread `agg` into `parseV2Transport`. Change its signature (transport.ts:289-292) from:
```ts
function parseV2Transport(
  markdown: string,
  crewMembers?: CrewMemberRow[],
): TransportationRow | null {
```
  to:
```ts
function parseV2Transport(
  markdown: string,
  crewMembers?: CrewMemberRow[],
  agg?: ParseAggregator,
): TransportationRow | null {
```
  And update the call site in `parseTransportation` (transport.ts:117) from `parseV2Transport(markdown, crewMembers)` to `parseV2Transport(markdown, crewMembers, agg)`.

  3d. Add the fuzzy `else` branch. Replace the schedule block (transport.ts:345-354):
```ts
    if (V2_SCHEDULE_LABELS.has(label)) {
      // v2 format: col1 = "date @ time" or just a date
      const { date, time } = parseV2DateTime(col1, contextYear);
      schedule.push({
        stage: col0,
        date,
        time,
        assigned_names: extractAssignedNames(cells, -1, crewMembers),
      });
    }
```
  with:
```ts
    if (V2_SCHEDULE_LABELS.has(label)) {
      // v2 format: col1 = "date @ time" or just a date
      const { date, time } = parseV2DateTime(col1, contextYear);
      schedule.push({
        stage: col0,
        date,
        time,
        assigned_names: extractAssignedNames(cells, -1, crewMembers),
      });
    } else if (col0) {
      // Fuzzy recovery: a near-miss of a schedule label (Damerau<=1, tie-abort) is recognized
      // as a schedule row so the leg isn't dropped. Keep the operator's RAW label as `stage`
      // (we recover the entry, we don't rewrite crew-facing text) and warn. Metadata typos
      // (driver/vehicle/parking/notes) were already consumed above, and unrelated labels are
      // far from these long phrases, so this stays tight.
      const fix = gatedVocabCorrect(col0.toUpperCase(), TRANSPORT_SCHEDULE_VOCAB, TRANSPORT_SCHEDULE_GATE_OPTS);
      if (fix?.corrected) {
        const { date, time } = parseV2DateTime(col1, contextYear);
        schedule.push({
          stage: col0,
          date,
          time,
          assigned_names: extractAssignedNames(cells, -1, crewMembers),
        });
        agg?.warnings.push({
          severity: "warn",
          code: "FIELD_LABEL_AUTOCORRECTED",
          message: `Read likely-misspelled transport schedule label '${col0}' as '${fix.match}'`,
          blockRef: { kind: "transportation" },
          rawSnippet: col0,
        });
      }
    }
```

- [ ] **Step 4: Run behavior tests to verify pass** — `pnpm vitest run tests/parser/blocks/transport.test.ts` → all green (new + pre-existing). Then `pnpm vitest run tests/parser` → the whole-corpus transport coverage is unchanged (fixtures are correctly spelled — no fuzzy fires).

- [ ] **Step 5: Add the "typos beyond the example sheets" property test.** Add imports at the top of `tests/parser/blocks/transport.test.ts`: `import { gatedVocabCorrect } from "@/lib/parser/typoGate";`, `import { TRANSPORT_SCHEDULE_VOCAB } from "@/lib/parser/blocks/transport";`, `import { unambiguousTypos } from "../_typoGenerator";`. Then append:
```ts
// Property test over the gate (the "typos beyond the example sheets" core). The schedule vocab
// is all alphabetic+space, so generator neighbors (ALPHA = A–Z + space) are well-formed.
describe("parseTransportation — schedule-label gate corrects unseen typos (PR-D2)", () => {
  it("corrects unambiguous single-edit typos of every schedule label back to that label", () => {
    const opts = { minLen: 5, tieAbort: true } as const;
    expect(TRANSPORT_SCHEDULE_VOCAB.length).toBe(9);
    for (const member of TRANSPORT_SCHEDULE_VOCAB) {
      for (const typo of unambiguousTypos(member, TRANSPORT_SCHEDULE_VOCAB, { minLen: 5 })) {
        const fix = gatedVocabCorrect(typo, TRANSPORT_SCHEDULE_VOCAB, opts);
        expect(fix?.corrected, `${typo} → ${member}`).toBe(true);
        expect(fix?.match, `${typo} → ${member}`).toBe(member);
      }
    }
  }, 30000); // generous timeout — comprehensive generator sweep (PR-D1 CI-shard-timeout lesson)
});
```
  Run `pnpm vitest run tests/parser/blocks/transport.test.ts` → green.

- [ ] **Step 6: Anti-tautology mutation proofs (run, confirm RED, revert — do NOT commit the mutation).**
  - **The fuzzy recovery is load-bearing:** temporarily delete the entire `else if (col0) { … }` fuzzy branch. Run → the **recover** test goes RED (the typo'd leg is dropped again). Revert.
  - **The gate's selectivity is load-bearing:** temporarily replace `if (fix?.corrected)` with `if (true)` (recognize every non-metadata row). Run → the **Catering** test goes RED (an unrelated row is falsely pushed + warned). Revert.
  Confirm `git diff lib/parser/blocks/transport.ts` is empty after reverting both.

- [ ] **Step 7: Commit**
```bash
git add lib/parser/blocks/transport.ts tests/parser/blocks/transport.test.ts
git commit -m "feat(parser): fuzzy schedule-label recovery in v2 transport block"
```

---

## Task 2: Register `transportScheduleLabel` in the collision tripwire

**Files:**
- Modify: `lib/parser/typoVocabRegistry.ts`
- Test: `tests/parser/typoVocabCollision.test.ts`

**Interfaces:**
- Consumes: `TRANSPORT_SCHEDULE_VOCAB` from `lib/parser/blocks/transport.ts` (Task 1).

- [ ] **Step 1: Write the failing registration test** — append to `tests/parser/typoVocabCollision.test.ts`. Add `import { TRANSPORT_SCHEDULE_VOCAB } from "@/lib/parser/blocks/transport";` at the top, then:
```ts
/**
 * PR-D2: the v2 transport schedule-label fuzzy fallback (gatedVocabCorrect over
 * V2_SCHEDULE_LABELS) must have a matching registry entry so the collision tripwire guards it.
 * The entry is DERIVED from the exported vocab (not hand-listed) so it cannot drift.
 */
describe("transport schedule-label vocab registration (PR-D2)", () => {
  it("registers a transportScheduleLabel fuzzable vocab matching TRANSPORT_SCHEDULE_VOCAB", () => {
    const tr = TYPO_VOCABS.find((v) => v.id === "transportScheduleLabel");
    expect(tr).toBeDefined();
    expect(tr!.klass).toBe("fuzzable");
    expect([...tr!.members].sort()).toEqual([...TRANSPORT_SCHEDULE_VOCAB].sort());
    expect(tr!.members).toContain("RENTAL PICKUP");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → the registration test FAILS (`transportScheduleLabel` undefined); the existing collision tripwire still PASSES.

- [ ] **Step 3: Add the registry entry** — in `lib/parser/typoVocabRegistry.ts`, add the import at the top (after the `EVENT_LABEL_VOCAB` import added in PR-D1):
```ts
import { TRANSPORT_SCHEDULE_VOCAB } from "@/lib/parser/blocks/transport";
```
and add the entry immediately after the `eventFieldAlias` row:
```ts
  // PR-D2: v2 transport schedule-label fuzzy fallback (gatedVocabCorrect over V2_SCHEDULE_LABELS).
  // Members are the SAME derived vocab the gate fuzzes, so the tripwire guards exactly what ships.
  { id: "transportScheduleLabel", klass: "fuzzable", minLen: 5, members: TRANSPORT_SCHEDULE_VOCAB },
```

- [ ] **Step 4: Run + mutation proof.** `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → both the registration test and the collision tripwire PASS (no `transportScheduleLabel` member within Damerau-1 of any other registered vocab). **If a REAL collision surfaces**, do NOT weaken the test — resolve it (exclude the genuinely-ambiguous member from the gate vocab with a documented carve-out, mirrored in the registration derivation). Then the mutation proof: temporarily add a Damerau-1 neighbor of a schedule label (e.g. `"RENTAL PICKUS"`) to the `sentinels` excluded entry → confirm the collision tripwire FAILS → revert.

- [ ] **Step 5: Commit**
```bash
git add lib/parser/typoVocabRegistry.ts tests/parser/typoVocabCollision.test.ts
git commit -m "test(parser): register transportScheduleLabel fuzzable vocab + collision guard"
```

---

## Task 3: Full verification

- [ ] **Step 1:** `pnpm typecheck && pnpm eslint lib tests && pnpm prettier --check lib/parser/blocks/transport.ts tests/parser/blocks/transport.test.ts lib/parser/typoVocabRegistry.ts tests/parser/typoVocabCollision.test.ts` → clean.
- [ ] **Step 2:** `pnpm vitest run` (FULL — the #155 lesson). Expected: only the 3 known env-bound live-infra suites fail locally (`tests/admin/test-auth-gate.test.ts` HTTP, `tests/cross-cutting/email-canonicalization.test.ts`, `tests/cross-cutting/pg-cron-coverage.test.ts`) — green in real CI. `tests/parser`, `tests/help`, and the collision meta-test must be green.
- [ ] **Step 3:** Confirm no catalog/§12.4 drift: `git diff --name-only origin/main..HEAD` lists exactly the 4 code files + this plan — no `lib/messages/`, no `docs/superpowers/specs/`.

---

## Self-Review (checklist)

1. **Spec coverage:** §5.3 names transport `V2_SCHEDULE_LABELS` as a re-route surface; the surface analysis scoped it to the v2 parser (the only exact-vocab schedule gate). Covered by Task 1.
2. **No loop refactor / no deferral:** schedule rows are independent and the fuzzy is the `else` of the exact `.has` check, so exact wins and no double-push — verified by the exact-unchanged test.
3. **Scope guard:** metadata typos and unrelated rows are not pulled in — pinned by the Vehicl + Catering tests + the selectivity mutation.
4. **Drift:** vocab derived + exported once; registry imports it; registration test re-derives.
5. **Type consistency:** `TRANSPORT_SCHEDULE_VOCAB: readonly string[]`; `agg?: ParseAggregator` threaded into `parseV2Transport` + its sole call site; gate match (`fix.match`) is uppercase, used only in the dev-facing message.

## Adversarial review (cross-model)

After implementation, send the whole diff to Codex (`codex exec`, read-only, high reasoning) as a REVIEWER-ONLY adversarial review. Iterate to APPROVE. Do-not-relitigate preempts: (a) **v2-only scope** — v4 uses the `isTransportStage` regex allowlist (transport.ts:73-90), a different already-tolerant mechanism, and v1 recognizes any non-metadata row; the V2_SCHEDULE_LABELS exact gate only gates capture in v2 (transport.ts:345); (b) `gatedVocabCorrect`-over-local-vocab is the correct pattern (the schedule set classifies a row as a schedule entry — it is not a label→field map, so NOT `resolveAliasScoped`); (c) `FIELD_LABEL_AUTOCORRECTED` reuse is deliberate (a transport-specific code is deferred — not worth the 6-surface lockstep); (d) `stage` keeps the RAW `col0` by design (recover the entry; don't rewrite crew-facing free text); (e) `{PASSENGERS}` column fuzzy stays deferred.

## Execution Handoff

Inline execution in this session (TDD per task, commit per task), then whole-diff Codex review → push → real CI green → `gh pr merge --merge` → fast-forward local `main`.
