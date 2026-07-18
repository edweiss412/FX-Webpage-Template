# EMDASH-1 Catalog-Wide Em-Dash Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all 179 em dashes from the message catalog's rendered-prose field values (per DESIGN.md §9) and pin the class closed with a compiler-exhaustive copy-hygiene audit.

**Architecture:** A per-occurrence copy sweep of `lib/messages/catalog.ts` (7 rendered-prose fields). The four §12.4-coupled fields (`dougFacing`, `crewFacing`, `followUp`, `helpfulContext`) ride the ratified three-way lockstep (master-spec §12.4 prose + `pnpm gen:spec-codes` regen + catalog), pinned green by the existing x1-catalog-parity gate. A new compiler-exhaustive audit in the existing catalog copy-hygiene meta-test rejects `—` and `--` on a field set derived from `Record<keyof MessageCatalogEntry, FieldPolicy>`, so a future rendered field fails typecheck until classified.

**Tech Stack:** TypeScript, Vitest, `tsx` (for the catalog runtime-walk baseline count).

**Spec:** `docs/superpowers/specs/2026-07-18-emdash-catalog-sweep.md` (Codex-approved, 8 rounds).

## Global Constraints

- **DESIGN.md §9:** no em dashes (`—`, U+2014) AND no `--` in rendered copy. Replace with comma/colon/semicolon/period/parentheses per §5 of the spec, per-occurrence judgment (never a blind global replace).
- **§12.4 lockstep (AGENTS.md):** editing `dougFacing`/`crewFacing`/`followUp`/`helpfulContext` requires master-spec §12.4 prose + `pnpm gen:spec-codes` regen (`lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts` in the SAME commit. NEVER run Prettier on the master spec.
- **§12.4 table null-marker hazard:** a lone `—` in a §12.4 pipe-table cell is the NULL marker — never convert it; only edit em dashes embedded inside non-null copy text.
- **No raw error codes in UI (invariant 5):** unaffected — this only changes copy strings, not code routing.
- **Green commits:** every committed state passes the full suite; the RED audit is observed locally within the task, not committed as a failing state.
- **Meta-test inventory:** this milestone EXTENDS `tests/messages/_metaCatalogCopyHygiene.test.ts`. No `pg_advisory*` touched (no lock topology). No UI files touched (no impeccable gate, no layout/transition tasks).

---

## File Structure

- `lib/messages/catalog.ts` (modify) — 179 em-dash substitutions across dougFacing/helpfulContext/crewFacing/followUp/title/longExplanation (dougSummary already 0).
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (modify) — §12.4 table cells (dougFacing/crewFacing/followUp) + helpfulContext appendix, coupled fields only.
- `lib/messages/__generated__/spec-codes.ts` (regenerated + committed) — via `pnpm gen:spec-codes`.
- `tests/messages/_metaCatalogCopyHygiene.test.ts` (modify) — add compiler-exhaustive `—`/`--` audit.
- `tests/messages/fullSweepCopy.test.ts` (modify) — update `dougFacingSubstring` fixtures `:38`, `:220` to swept punctuation.
- `DEFERRED.md` / `DEFERRED-archive.md` (modify) — move `ALERT-COPY-EMDASH-1`.

---

### Task 1: Widen the copy-hygiene audit + sweep all rendered-prose em dashes

**Files:**
- Modify: `tests/messages/_metaCatalogCopyHygiene.test.ts`
- Modify: `lib/messages/catalog.ts`
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4)
- Modify (regenerated): `lib/messages/__generated__/spec-codes.ts`
- Modify: `tests/messages/fullSweepCopy.test.ts`

**Interfaces:**
- Consumes: `MESSAGE_CATALOG`, `type MessageCatalogEntry` from `@/lib/messages/catalog`.
- Produces: nothing new imported elsewhere; the audit is self-contained in the meta-test.

- [ ] **Step 1: Capture the authoritative baseline count (proves the audit will be RED).**

Write `count-emdash.mts` at the worktree root and run it — this is the same runtime-walk the audit asserts to 0:

```ts
import { MESSAGE_CATALOG } from "./lib/messages/catalog";
const FIELDS = ["dougFacing","crewFacing","followUp","helpfulContext","title","longExplanation","dougSummary"] as const;
let total = 0; const per: Record<string, number> = {};
for (const e of Object.values(MESSAGE_CATALOG) as any[])
  for (const f of FIELDS) if (typeof e[f] === "string") { const n = (e[f].match(/—/g) || []).length; per[f] = (per[f] || 0) + n; total += n; }
console.log(per, "TOTAL", total);
```

Run: `pnpm exec tsx count-emdash.mts`
Expected: `{ dougFacing: 47, helpfulContext: 69, longExplanation: 52, title: 5, crewFacing: 4, followUp: 2 } TOTAL 179`. Delete the script after (`rm count-emdash.mts`).

- [ ] **Step 2: Write the widened audit test (compiler-exhaustive field policy).**

Add to `tests/messages/_metaCatalogCopyHygiene.test.ts` (import `type MessageCatalogEntry` alongside the existing `MESSAGE_CATALOG` import):

```ts
describe("Rendered-prose copy has no em dash or double hyphen (DESIGN.md §9, EMDASH-1)", () => {
  type FieldPolicy = "rendered-prose" | "excluded-url" | "excluded-enum" | "excluded-identifier";
  // Record<keyof MessageCatalogEntry, …>: adding a field to the type without
  // classifying it here is a COMPILE ERROR — the fails-by-default guarantee.
  const FIELD_POLICY: Record<keyof MessageCatalogEntry, FieldPolicy> = {
    code: "excluded-identifier",
    severity: "excluded-enum",
    adminSurface: "excluded-enum",
    audience: "excluded-enum",
    healthWeight: "excluded-enum",
    resolution: "excluded-enum",
    helpHref: "excluded-url",
    dougFacing: "rendered-prose",
    crewFacing: "rendered-prose",
    followUp: "rendered-prose",
    helpfulContext: "rendered-prose",
    title: "rendered-prose",
    longExplanation: "rendered-prose",
    dougSummary: "rendered-prose",
  };
  const AUDITED_FIELDS = (Object.keys(FIELD_POLICY) as (keyof MessageCatalogEntry)[]).filter(
    (f) => FIELD_POLICY[f] === "rendered-prose",
  );

  it("no rendered-prose field value contains an em dash (U+2014)", () => {
    const violations: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      for (const field of AUDITED_FIELDS) {
        const v = (entry as Record<string, unknown>)[field];
        if (typeof v === "string" && v.includes("—"))
          violations.push(`${code}.${field}: ${v.slice(0, 120)}${v.length > 120 ? "…" : ""}`);
      }
    }
    expect(violations, `em dash in rendered copy:\n${violations.join("\n")}`).toEqual([]);
  });

  it("no rendered-prose field value contains a double hyphen (--)", () => {
    const violations: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      for (const field of AUDITED_FIELDS) {
        const v = (entry as Record<string, unknown>)[field];
        if (typeof v === "string" && v.includes("--"))
          violations.push(`${code}.${field}: ${v.slice(0, 120)}${v.length > 120 ? "…" : ""}`);
      }
    }
    expect(violations, `double hyphen in rendered copy:\n${violations.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the audit — verify RED on em dashes, GREEN on `--`.**

Run: `pnpm exec vitest run tests/messages/_metaCatalogCopyHygiene.test.ts`
Expected: the em-dash test FAILS listing ~179 `CODE.field` violations; the `--` test PASSES (0 today). This proves the audit exercises the real catalog (anti-tautology).

- [ ] **Step 4: Sweep the catalog-only fields (title, longExplanation).**

In `lib/messages/catalog.ts`, replace every `—` inside `title` (5) and `longExplanation` (52) values with the §5 context-appropriate substitute (title dashes → colon; prose → comma/semicolon/period/parens). `dougSummary` is already 0 — nothing to do. No spec edit for these fields.

- [ ] **Step 5: Sweep the coupled fields with the §12.4 lockstep.**

For `dougFacing` (47), `helpfulContext` (69), `crewFacing` (4), `followUp` (2): edit the value in `lib/messages/catalog.ts` AND the matching master-spec §12.4 location:
- `dougFacing`/`crewFacing`/`followUp` → the §12.4 pipe-table cell (cols 3/4/5). Only mid-copy em dashes — leave whole-cell `—` null markers.
- `helpfulContext` → the appendix line under `<!-- §12.4 helpfulContext appendix` (format `CODE: "text"`).

Then regenerate:

Run: `pnpm gen:spec-codes`
This rewrites `lib/messages/__generated__/spec-codes.ts` from the edited §12.4.

- [ ] **Step 6: Verify x1 catalog↔§12.4 parity (fail-loud safety net).**

Run: `pnpm exec vitest run tests/cross-cutting/codes.test.ts`
Expected: PASS. Any `catalog <CODE>.<field> differs from §12.4` failure means a missed spec propagation OR a corrupted null marker — fix the named cell and re-run until green.

- [ ] **Step 7: Update the exact-copy test fixtures broken by the sweep.**

In `tests/messages/fullSweepCopy.test.ts`, update the two `dougFacingSubstring` fixtures to match the swept `dougFacing`:
- `:38` `PICKER_SELECTION_RACE` — `"No action needed — newer selections were left intact"` → the swept punctuation (e.g. `"No action needed: newer selections were left intact"` — match exactly what you wrote in catalog.ts).
- `:220` `PENDING_SNAPSHOT_DELETE_STUCK` — `"is stuck — crew pages are still protected"` → the swept punctuation (e.g. `"is stuck: crew pages are still protected"` — match catalog.ts).

- [ ] **Step 8: Re-run the audit + baseline — verify GREEN / 0.**

Run: `pnpm exec vitest run tests/messages/_metaCatalogCopyHygiene.test.ts`
Expected: both tests PASS. Optionally re-run the Step-1 script; expect `TOTAL 0`.

- [ ] **Step 9: Run the FULL suite + typecheck + lint + format (catch-all for other exact-copy assertions).**

Run: `pnpm test`
Expected: PASS. Any failure is another exact-copy assertion embedding a swept string (per spec §6.1a) — update it to the new punctuation. Repeat until green.

Run: `pnpm typecheck` (proves the `Record<keyof MessageCatalogEntry, …>` exhaustiveness compiles)
Run: `pnpm lint`
Run: `pnpm format:check` (= `prettier --check .`; the master spec is already in `.prettierignore:31`, so this never touches it — a flag on any OTHER file is a real format issue to fix)
Expected: all PASS.

- [ ] **Step 10: Commit.**

```bash
git add lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts \
  docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md \
  tests/messages/_metaCatalogCopyHygiene.test.ts tests/messages/fullSweepCopy.test.ts
git commit --no-verify -m "fix(messages): sweep em dashes from rendered catalog copy (EMDASH-1)

Replace all 179 em dashes in rendered-prose catalog fields (dougFacing 47,
helpfulContext 69, longExplanation 52, title 5, crewFacing 4, followUp 2)
per DESIGN.md §9. Coupled fields ride the §12.4 three-way lockstep (spec
prose + gen:spec-codes + catalog); x1 parity green. New compiler-exhaustive
copy-hygiene audit rejects em dash AND -- across a Record<keyof
MessageCatalogEntry, FieldPolicy>-derived rendered-prose field set, so a
future rendered field fails typecheck until classified. Updated the two
fullSweepCopy dougFacingSubstring fixtures broken by the sweep."
```

The audit test and the sweep land in one commit because the audit is RED until the sweep completes; committing a failing test would break green-main. The RED state was observed in Step 3 (anti-tautology proof).

---

### Task 2: Retire the DEFERRED entry

**Files:**
- Modify: `DEFERRED.md`
- Modify: `DEFERRED-archive.md`

- [ ] **Step 1: Move `ALERT-COPY-EMDASH-1` to the archive.**

Cut the full `### ALERT-COPY-EMDASH-1 …` block from `DEFERRED.md` and paste it into `DEFERRED-archive.md` with a resolution note (`Resolved 2026-07-18 by EMDASH-1 catalog sweep — PR #<n>; audit at tests/messages/_metaCatalogCopyHygiene.test.ts`). Update the "Last reconciled" date in `DEFERRED.md`.

- [ ] **Step 2: Verify DEFERRED.md formatting + commit.**

Run: `pnpm format:check` (= `prettier --check .`; formats DEFERRED.md/DEFERRED-archive.md among all files)
Expected: PASS.

```bash
git add DEFERRED.md DEFERRED-archive.md
git commit --no-verify -m "docs: retire ALERT-COPY-EMDASH-1 to DEFERRED-archive (shipped via EMDASH-1)"
```

---

## Self-Review

**Spec coverage:**
- §2 rendered-field scope (7 fields, 179) → Task 1 Steps 4-5. ✓
- §2.1 type-derived completeness + §6 compiler-exhaustive FIELD_POLICY → Task 1 Step 2. ✓
- §3 §12.4 three-way lockstep + §3.1 null-marker hazard → Task 1 Step 5, Global Constraints. ✓
- §3.2 x1 safety net → Task 1 Step 6. ✓
- §4 catalog-only fields → Task 1 Step 4. ✓
- §5 replacement rules → Global Constraints + Steps 4-5. ✓
- §6 audit (`—` and `--`) → Task 1 Step 2. ✓
- §6.1 RED-before-fix + baseline command → Task 1 Steps 1, 3, 8. ✓
- §6.1a exact-copy test breakage → Task 1 Steps 7, 9. ✓
- §8 gates (full suite, typecheck, lint, format, x1) → Task 1 Steps 6, 8, 9. ✓
- §9 files touched → File Structure + both tasks. ✓
- DEFERRED move → Task 2. ✓

**Placeholder scan:** No TBD/TODO; the two fixture substitutions in Step 7 show example punctuation and instruct "match catalog.ts exactly" (the exact final string depends on the per-occurrence §5 judgment made in Step 5 — this is a deliberate cross-reference, not a placeholder).

**Type consistency:** `FIELD_POLICY`, `AUDITED_FIELDS`, `FieldPolicy` names are consistent across Step 2 and the spec. `MessageCatalogEntry` field set matches `lib/messages/catalog.ts:1-40`.

**Anti-tautology:** the audit's RED state is observed on the real catalog (Step 3) before the fix; the count baseline (Step 1) is derived from the runtime catalog, not hardcoded.
