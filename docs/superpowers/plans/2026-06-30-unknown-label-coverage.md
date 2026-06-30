# Surface unknown EVENT-DETAILS labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface genuinely-unknown EVENT-DETAILS row labels to the operator via the existing `UNKNOWN_FIELD` / `raw_unrecognized` pipeline (today they are kept-but-unrendered → invisible), behind a shared `emitUnknownField` helper that the venue block also adopts.

**Architecture:** Parser/warnings only (non-UI). New `emitUnknownField` in `lib/parser/warnings.ts`; venue refactored to use it (behavior-preserving); `event.ts` adopts it in its genuinely-unknown branch (flag-and-KEEP). Reuses the registered `UNKNOWN_FIELD` code (no §12.4/catalog/dataGaps/region change). No UI → no impeccable gate.

**Tech Stack:** TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-06-30-unknown-label-coverage-design.md` (Codex-APPROVED round 1).

## Global Constraints

- Edits ONLY in `lib/parser/warnings.ts`, `lib/parser/blocks/venue.ts`, `lib/parser/blocks/event.ts`, `tests/**`. No catalog/spec-codes/dataGaps/region/UI/DB change.
- Reuse the `UNKNOWN_FIELD` string literal (already in §12.4 + the x1 lockstep). Do NOT mint a new code (x1 catalog parity must stay green).
- `blockRef.kind`: `'venue'` for venue (unchanged), `'details'` for event-details (already a `RegionId`).
- Flag-and-KEEP: event-details still `writeField`s the value; sensitive-looking unknowns (`isSensitiveCanonicalKey`) stay silently dropped and are NOT flagged.
- TDD per task; commit per task (`feat(parser):` / `refactor(parser):`). `--no-verify`. Run `pnpm exec prettier --check .` before push.
- Worktree: `/Users/ericweiss/fxav-unknown-label-coverage` (branch `feat/unknown-label-coverage`).

---

## File Structure

- **Modify** `lib/parser/warnings.ts` — add exported `emitUnknownField`.
- **Modify** `lib/parser/blocks/venue.ts` — replace the inline emit (`:298-311`) with the helper call (behavior-preserving).
- **Modify** `lib/parser/blocks/event.ts` — flag-and-keep in the unknown branch (`:200-206`) + import.
- **Modify** `tests/parser/warnings.test.ts` — `emitUnknownField` unit test (venue tests there stay green).
- **Modify** `tests/parser/blocks/event.test.ts` — event-details unknown-label emission tests.

---

## Task 1: `emitUnknownField` helper

**Files:** Modify `lib/parser/warnings.ts`, `tests/parser/warnings.test.ts`.

**Interfaces — Produces:** `emitUnknownField(agg, { block, kind, key, value })`.

- [ ] **Step 1: Failing test** — add to `tests/parser/warnings.test.ts`:

```ts
describe("emitUnknownField", () => {
  it("pushes an UNKNOWN_FIELD warning + a raw_unrecognized entry", () => {
    const agg = newAggregator();
    emitUnknownField(agg, { block: "event_details", kind: "details", key: " Rigging ", value: "2 motors" });
    expect(agg.warnings).toEqual([
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "Unrecognized event_details row label: 'Rigging'",
        blockRef: { kind: "details" },
        rawSnippet: "Rigging | 2 motors",
      },
    ]);
    expect(agg.rawUnrecognized).toEqual([{ block: "event_details", key: "Rigging", value: "2 motors" }]);
  });
  it("no-ops on an undefined aggregator (no throw)", () => {
    expect(() => emitUnknownField(undefined, { block: "x", kind: "x", key: "k", value: "v" })).not.toThrow();
  });
});
```
(Ensure `emitUnknownField` + `newAggregator` are imported from `@/lib/parser/warnings` in this file.)

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/parser/warnings.test.ts -t emitUnknownField` → FAIL (not exported).

- [ ] **Step 3: Implement** — in `lib/parser/warnings.ts`, after `emitUnknownSection` (`:102-111`):

```ts
/**
 * Emit an UNKNOWN_FIELD operator-review warning + a structured raw_unrecognized
 * entry for a row whose label resolved to no known field inside a block scope.
 * `block` names the source (diagnostic message + raw_unrecognized.block); `kind`
 * is the deep-link RegionId (usually == block; event-details uses 'details').
 * Mirrors emitFieldUnreadable/emitUnknownSection. (unknown-label coverage)
 */
export function emitUnknownField(
  agg: ParseAggregator | undefined,
  opts: { block: string; kind: string; key: string; value: string },
): void {
  if (!agg) return;
  const key = opts.key.trim();
  const value = opts.value ?? "";
  agg.warnings.push({
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `Unrecognized ${opts.block} row label: '${key}'`,
    blockRef: { kind: opts.kind },
    rawSnippet: `${key} | ${value}`,
  });
  agg.rawUnrecognized.push({ block: opts.block, key, value });
}
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/parser/warnings.test.ts` (whole file: new test + the existing venue UNKNOWN_FIELD test) → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(parser): emitUnknownField shared warning helper (unknown-label coverage)`

---

## Task 2: Refactor venue to use the helper (behavior-preserving)

**Files:** Modify `lib/parser/blocks/venue.ts`. (No new test — the existing `tests/parser/warnings.test.ts:138-188` + `tests/parser/blocks/venue.test.ts` are the regression net.)

- [ ] **Step 1: Confirm the baseline is green** — `pnpm vitest run tests/parser/warnings.test.ts tests/parser/blocks/venue.test.ts` → PASS (records the pre-refactor behavior).

- [ ] **Step 2: Refactor** — in `lib/parser/blocks/venue.ts`, replace the emit BODY (`:298-310`, inside the existing `if (agg && inVenueFieldScope && col0 !== "" && col0Upper !== "VENUE" && col0Canon === null) {` guard) with:
```ts
      const rawVal = presence(row[1] ?? "") ?? "";
      emitUnknownField(agg, { block: "venue", kind: "venue", key: col0.trim(), value: rawVal });
```
Add `emitUnknownField` to the existing `@/lib/parser/warnings` import in this file. The guard (`if (agg && inVenueFieldScope && …)`) is UNCHANGED. Output is byte-identical: message `Unrecognized venue row label: '<key>'`, `blockRef.kind:'venue'`, `rawSnippet:'<key> | <rawVal>'`, `raw_unrecognized {block:'venue', key:col0.trim(), value:rawVal}` (the helper re-trims an already-trimmed key — no-op).

- [ ] **Step 3: Run, verify still green** — `pnpm vitest run tests/parser/warnings.test.ts tests/parser/blocks/venue.test.ts` → PASS (identical behavior). `pnpm typecheck` → clean.

- [ ] **Step 4: Commit** — `refactor(parser): venue emits UNKNOWN_FIELD via emitUnknownField (unknown-label coverage)`

---

## Task 3: event-details adoption (flag-and-keep)

**Files:** Modify `lib/parser/blocks/event.ts`, `tests/parser/blocks/event.test.ts`.

- [ ] **Step 1: Failing tests** — add to `tests/parser/blocks/event.test.ts` (mirror its existing `parseEventDetails(markdown, version, agg)` call style; build an EVENT DETAILS markdown block + a `newAggregator()`):

```ts
// A genuinely-unknown, non-sensitive label is KEPT and FLAGGED:
//   markdown has an "EVENT DETAILS" header + rows incl. "| Rigging | 2 motors |"
//   (and a known "| Stage Size | 8' x 24' |" control row)
// → result.<canonicalKey('Rigging')> === "2 motors"  (KEPT — assert via toCanonicalKey or the known shape)
// → agg.warnings has exactly ONE { code:'UNKNOWN_FIELD', blockRef:{kind:'details'} } whose rawSnippet contains "Rigging"
// → agg.rawUnrecognized has { block:'event_details', key:'Rigging', value:'2 motors' }
// → NO UNKNOWN_FIELD for "Stage Size" (known label)
// Sensitive unknown is DROPPED and NOT flagged:
//   a row whose label isSensitiveCanonicalKey (e.g. a "PO#"/budget-style label that resolves sensitive)
//   → result has NO such key, agg.warnings has NO UNKNOWN_FIELD for it, rawSnippet never contains its value
```
Write concretely against the real `event.test.ts` harness + `isSensitiveCanonicalKey`/`toCanonicalKey` to pick a label that is genuinely-unknown-non-sensitive ("Rigging") and one that is sensitive. Scope assertions to `agg.warnings.filter(w => w.code === "UNKNOWN_FIELD")` (anti-tautology — don't count the pre-existing `FIELD_LABEL_AUTOCORRECTED`).

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/parser/blocks/event.test.ts -t "unknown"` → FAIL (no UNKNOWN_FIELD emitted).

- [ ] **Step 3: Implement** — `lib/parser/blocks/event.ts`:

(a) Add `emitUnknownField` to the existing import (`:34`):
```ts
import { type ParseAggregator, emitEmptySection, emitUnknownField } from "@/lib/parser/warnings";
```
(b) In the genuinely-unknown else-branch (`:200-206`):
```ts
        } else {
          // Genuinely-unknown label. Keep non-sensitive (unchanged) AND surface it
          // to the operator (it is stored under a non-whitelisted key → rendered by
          // nothing, so without this it vanishes). Sensitive-looking labels stay
          // silently dropped and are NOT flagged (flagging leaks the value via the
          // warning rawSnippet). (unknown-label coverage)
          const key = toCanonicalKey(col0);
          if (key && val && !isSensitiveCanonicalKey(key)) {
            writeField(result, key, val);
            emitUnknownField(agg, { block: "event_details", kind: "details", key: col0, value: val });
          }
        }
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/parser/blocks/event.test.ts` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(parser): surface unknown EVENT-DETAILS labels via UNKNOWN_FIELD (unknown-label coverage)`

---

## Task 4: Full verification

- [ ] **Step 1: Full parser + cross-cutting suites + lint/format (blocking)**

```bash
pnpm vitest run tests/parser tests/cross-cutting/codes.test.ts tests/parser/operatorActionableWarnings.test.ts tests/drive/showDayTimeAnchors.test.ts
pnpm typecheck
pnpm exec eslint lib/parser/warnings.ts lib/parser/blocks/venue.ts lib/parser/blocks/event.ts
pnpm exec prettier --check .
git diff --check origin/main...HEAD
```
Expected: all PASS / clean. **x1 (`codes.test.ts`) MUST stay green** (no new code minted). `operatorActionableWarnings` + `showDayTimeAnchors` confirm the event-details `UNKNOWN_FIELD` is selectable + deep-linkable via `'details'`.

- [ ] **Step 2:** If x1 fails, STOP — it means a new code leaked; the design reuses `UNKNOWN_FIELD` so this must not happen. (No catalog edit is in scope.)

---

## Task 5: Close-out — whole-diff review → CI → merge

- [ ] **Step 1:** Sync `origin/main` (merge in if moved; re-verify the merged tree with the full parser suite). Whole-diff cross-model review via `codex exec` (do-not-relitigate: scope = event-details only; flag-and-keep additive; sensitive-drop unflagged; deferral of other blocks). Iterate to APPROVE. **No impeccable gate** (parser/warnings, non-UI — no `app/`/`components/`/DESIGN.md change).
- [ ] **Step 2:** Push; `gh pr create`. (No UI → no screenshots-drift; no crew-preview regen.)
- [ ] **Step 3:** Confirm REAL CI green (`gh pr checks <PR#> --watch`; `mergeStateStatus == CLEAN`); re-run flakes with `gh run rerun --failed`.
- [ ] **Step 4:** `gh pr merge <PR#> --merge`.
- [ ] **Step 5:** FF local main; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] **Step 6:** Add a `BACKLOG.md` note (chore PR) recording the DEFERRED blocks (ops needs re-scoping; rooms-v4 asymmetric; transport/hotels/crew structural/columnar) so the deferral rationale is durable, OR fold the note into this PR's description. (No open-status backlog row needed unless we intend to do them.)

---

## Self-Review

- **Spec coverage:** helper → T1; venue refactor → T2; event adoption → T3; verification (incl. x1 + operator-actionable + deep-link) → T4; close-out + deferral note → T5. ✓
- **Anti-tautology:** helper test asserts the exact warning + raw_unrecognized objects; venue test is the unchanged regression net (proves behavior-preservation); event test scopes to `code === "UNKNOWN_FIELD"` (not the pre-existing autocorrect), asserts KEEP + flag for non-sensitive, DROP + no-flag + no-value-leak for sensitive, no-flag for known. Each states its failure mode. ✓
- **No new code / touchpoint drift:** reuses `UNKNOWN_FIELD`; T4 pins x1 green; `'details'` region + dataGaps membership unchanged. ✓
- **No placeholders / consistency:** `emitUnknownField` signature + `{block,kind,key,value}` + `blockRef.kind` values consistent across T1-T3; real code in every step. ✓
- **Impeccable:** N/A (non-UI). Stated. ✓
