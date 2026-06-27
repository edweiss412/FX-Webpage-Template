# Parser typo-tolerance PR-C (ops field-label re-route) — implementation plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit.

**Goal:** Re-route the `ops` (financials) block's field-label resolution through the shipped `resolveAliasScoped`, so a misspelled financial field label (`Invoce`→`Invoice`, `Propsal`→`Proposal`, `Invoce Notes`→`Invoice Notes`) is recovered instead of silently dropped — surfaced as the existing deep-linked `FIELD_LABEL_AUTOCORRECTED`.

**Architecture:** `parseOps` keeps its 5 exact label regexes as the first/primary pass (they match broader spellings than `FIELD_ALIASES`); on a row that matches NO regex, a fuzzy fallback via `resolveAliasScoped(col0, "ops.")` recovers the canonical. Exact ALWAYS beats fuzzy regardless of document order (deferred-commit guard). Reuses `FIELD_LABEL_AUTOCORRECTED` — no new code, no §12.4/pin-test/help change.

**Tech Stack:** TypeScript, Vitest. Pure parser; no DB, no advisory lock, no UI component.

**Spec:** `docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md` §5.3 (Codex-APPROVED 2R). The 6-agent surface map (this milestone) determined ops is the ONLY clean re-route; rooms/transport/client/dates → PR-D, event/diagrams → do-not-fuzz.

## Scope (ops-only — owner-ratified)

PR-C = `ops` only. **DEFERRED to PR-D** (each needs `agg` threaded through sub-parsers + per-surface handling): rooms (separate vocab → local gate over `V4_BARE_LABELS`, 3-layer agg, HIGH value-misroute), transport (already deferred at `typoVocabRegistry.ts:33-35`; agg + stage-subset filter), client (`break` semantics + pruned vocab), dates (`break` + agg + low value). **DO-NOT-FUZZ:** event (separate bare-snake_case vocab consumers read directly; no silent drop today), diagrams (exact `.has()`, low value).

## Global Constraints

- TDD per task; commit per task; `--no-verify`.
- Reuse `gatedVocabCorrect`/`resolveAliasScoped`/`FIELD_LABEL_AUTOCORRECTED` (shipped PR-A/PR-B). **NO new code, no §12.4 lockstep, no pin-test bump, no `_families.ts` change** (FIELD_LABEL_AUTOCORRECTED already in `OPERATOR_ACTIONABLE_ANCHORED` + dispatched).
- **VALUE-guard:** fuzz ONLY `col0` (the label); the value lives in `col1`/`col2` (`ops.ts:72-73`) and never reaches the resolver.
- Run the COMPLETE `pnpm vitest run` before push (the #155 lesson). Env-bound live-infra suites fail locally, pass in CI.

## Meta-test inventory

- **EXTENDS:** `tests/parser/typoVocabCollision.test.ts` (add a DERIVED `opsFieldAlias` fuzzable entry — the meta-test then guards it vs all registered vocabs). No new meta-test; no `OPERATOR_ACTIONABLE_ANCHORED` change (reuses FIELD_LABEL_AUTOCORRECTED).
- Advisory-lock / Supabase: N/A. Invariant 8: N/A (no `app/` change).

## File Structure

- Modify: `lib/parser/blocks/ops.ts` (fuzzy fallback + deferred-commit guard + warn emit + `_agg`→`agg`); `lib/parser/typoVocabRegistry.ts` (derived `opsFieldAlias`).
- Test: `tests/parser/blocks/ops.test.ts`, `tests/parser/typoVocabCollision.test.ts` (logic unchanged — runs over the new entry).

---

## Task 1: ops fuzzy field-label fallback

**Files:** Modify `lib/parser/blocks/ops.ts`; Test `tests/parser/blocks/ops.test.ts`.

**Interfaces:** Consumes `resolveAliasScoped` (`lib/parser/aliases.ts`). `parseOps(markdown, version, agg?)` (the `agg` param is currently `_agg` at `ops.ts:46` but IS passed at `index.ts:391`). The 5 exact regexes `COI_RE/PROPOSAL_RE/PO_RE/INVOICE_RE/INVOICE_NOTES_RE` (`ops.ts:29-33`) + the first-match-wins `seen` Set (`ops.ts:59`) stay.

**Canonical→field map (verified):** `ops.coi`→`coi_status`, `ops.po`→`po`, `ops.proposal`→`proposal`, `ops.invoice`→`invoice`, `ops.invoice_notes`→`invoice_notes`. **minLen-5 coverage (document it):** `COI`(3)/`PO#`(≤4) are below the fuzz floor → exact-only (regexes still cover them); only `Invoice`(7)/`Proposal`(8)/`Invoice Notes`(13) are fuzzable. Mirrors venue's `.filter(a=>a.length>=5)`.

- [ ] **Step 1: Write the failing tests** (in `tests/parser/blocks/ops.test.ts`; mirror its existing `parseOps(md, version)` + `newAggregator()` pattern):

```ts
import { newAggregator } from "@/lib/parser/warnings";

it("recovers a misspelled financial label, emits FIELD_LABEL_AUTOCORRECTED, no silent drop", () => {
  const md = ["| Invoce | INV-123 |", "| Propsal | PROP-9 |"].join("\n");
  const agg = newAggregator();
  const r = parseOps(md, "v4", agg);
  expect(r.invoice).toBe("INV-123"); // recovered (was dropped before)
  expect(r.proposal).toBe("PROP-9");
  const notes = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
  expect(notes).toHaveLength(2);
  expect(notes[0]!.severity).toBe("warn");
  expect(notes[0]!.blockRef).toMatchObject({ kind: "financials" }); // deep-link anchor
});

it("EXACT beats FUZZY regardless of document order (anti-shadow)", () => {
  // a typo'd 'Invoce' EARLIER + the real 'Invoice' LATER → invoice = the REAL value, no spurious warn
  const md = ["| Invoce | TYPO-WRONG |", "| Invoice | REAL-456 |"].join("\n");
  const agg = newAggregator();
  const r = parseOps(md, "v4", agg);
  expect(r.invoice).toBe("REAL-456"); // exact wins even though the typo row came first
  expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
});

it("exact spellings (incl. broader regex-only forms) still route, never flagged", () => {
  const md = ["| COI | Sent |", "| PO# | PO-1 |", "| Invoice Note | n |"].join("\n"); // PO#, singular 'Note'
  const agg = newAggregator();
  const r = parseOps(md, "v4", agg);
  expect(r.coi_status).toBe("Sent");
  expect(r.po).toBe("PO-1");
  expect(r.invoice_notes).toBe("n");
  expect(agg.warnings.find((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toBeUndefined();
});

it("VALUE-guard: a near-miss in the VALUE cell sets no field", () => {
  const md = ["| SomeForeignLabel | Invoce |"].join("\n"); // 'Invoce' is the VALUE, not the label
  const agg = newAggregator();
  const r = parseOps(md, "v4", agg);
  expect(r.invoice).toBeNull();
  expect(agg.warnings.find((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toBeUndefined();
});

it("a below-minLen near-miss of COI/PO is NOT fuzzed", () => {
  const md = ["| CO | x |", "| P0 | y |"].join("\n"); // 2-char near-misses
  const agg = newAggregator();
  const r = parseOps(md, "v4", agg);
  expect(r.coi_status).toBeNull();
  expect(r.po).toBeNull();
  expect(agg.warnings.find((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify fail** — run the WHOLE new block so ALL 5 tests execute (the `-t` filter would skip the exact/below-minLen ones and leave their red-time-PASS claim unverified): `pnpm vitest run tests/parser/blocks/ops.test.ts`. Expected at red time: the **recover** + **anti-shadow** tests FAIL (the label is dropped today); the **exact-spellings**, **VALUE-guard**, and **below-minLen** tests already PASS (current behavior drops the typo and never emits the new code) — confirm those 3 show green in this same run.

- [ ] **Step 3: Implement.** In `ops.ts`: (a) `import { resolveAliasScoped } from "@/lib/parser/aliases";`; (b) rename the param `_agg`→`agg` (`ops.ts:46` — it IS passed at `index.ts:391`); (c) add the canonical→field map + a `fuzzyCandidates` accumulator BEFORE the loop:

```ts
  const CANON_TO_FIELD: Record<string, keyof OpsResult> = {
    "ops.coi": "coi_status",
    "ops.po": "po",
    "ops.proposal": "proposal",
    "ops.invoice": "invoice",
    "ops.invoice_notes": "invoice_notes",
  };
  // First fuzzy candidate per field; committed AFTER the loop only for fields the exact
  // pass never `seen` — so a real exact row anywhere beats a fuzzy near-miss anywhere
  // (parseOps is first-match-wins via `seen`; an inline fuzzy commit would shadow a later exact).
  const fuzzyCandidates: Partial<Record<keyof OpsResult, { rawLabel: string; value: string | null }>> = {};
```

(d) Add a terminal `else` to the if/else-if chain (`ops.ts:80-106`) that records a fuzzy candidate WITHOUT touching `seen`:

```ts
    } else {
      const fuzzy = resolveAliasScoped(col0, "ops.");
      if (fuzzy?.corrected) {
        const field = CANON_TO_FIELD[fuzzy.canonical];
        if (field && fuzzyCandidates[field] === undefined) {
          fuzzyCandidates[field] = { rawLabel: col0, value: val };
        }
      }
    }
```

The candidate carries the canonical (so the message is exact). The accumulator type is `Partial<Record<keyof OpsResult, { rawLabel: string; value: string | null; canonical: string }>>`, and the `else` branch stores `{ rawLabel: col0, value: val, canonical: fuzzy.canonical }`.

(e) After the loop, BEFORE `return`, commit fuzzy candidates for still-unseen fields + emit the warning:

```ts
  for (const key of Object.keys(fuzzyCandidates) as (keyof OpsResult)[]) {
    if (seen.has(key)) continue; // exact (any line) wins over fuzzy (any line)
    const cand = fuzzyCandidates[key]!;
    const v = presence(cand.value ?? "");
    if (key === "coi_status") coi_status = v;
    else if (key === "po") po = v;
    else if (key === "proposal") proposal = v;
    else if (key === "invoice") invoice = v;
    else if (key === "invoice_notes") invoice_notes = v;
    seen.add(key);
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      // internal admin diagnostic (never user-rendered — invariant 5); canonical is the precise id.
      message: `Read likely-misspelled field label '${cand.rawLabel}' as field '${cand.canonical}'`,
      blockRef: { kind: "financials" },
      rawSnippet: cand.rawLabel,
    });
  }
```

(f) **blockRef.kind = "financials"** — a **region-level** anchor (consistent with the other `*_AUTOCORRECTED` codes, which all resolve `region[kind]`, NOT an exact cell). The `financials` region anchor (`buildSheetDeepLink.ts:92-96`) is a `row-label-union` on the CORRECTLY-spelled ops labels (`/^COI$/`,`/^PO\s*#?$/`,`/^Proposal$/`,`/^Invoice/`); a typo'd row (`Invoce`) is NOT in that union, so the deep link lands the operator on the financials **region** (the correct ops rows present), NOT precisely on the misspelled row — and if no correctly-spelled ops row exists, `region["financials"]` may be absent and the warning renders link-less (graceful degrade, the #154 pattern). `"financials"` is a valid `RegionId`; the dispatch resolves `region[kind]` (`showDayTimeAnchors.ts:~141-146`). The Task-1 test asserts the WARNING fires with `blockRef.kind:"financials"` (region-level), not row-precision; a separate dispatch unit (Task 1, optional) can assert `region:{financials:<anchor>}` resolves.

- [ ] **Step 4: Run to verify pass** + `pnpm vitest run tests/parser` (corpus ops parses unchanged — fixtures are correctly spelled, so no fuzzy fires). **Anti-tautology mutation:** temporarily commit the fuzzy candidate INLINE (add to `seen` on the fuzzy hit instead of deferring) and confirm the "EXACT beats FUZZY" test goes RED → revert (proves the deferred-commit guard is load-bearing).
- [ ] **Step 5: Commit** — `feat(parser): fuzzy-recover misspelled ops financial field labels (FIELD_LABEL_AUTOCORRECTED)`

---

## Task 2: Register `opsFieldAlias` in the collision tripwire

**Files:** Modify `lib/parser/typoVocabRegistry.ts`, `tests/parser/typoVocabCollision.test.ts`.

**TDD note:** the collision guard passes by design with or without `opsFieldAlias`, so adding the entry alone is not a red-green (HIGH finding). Step 1 adds a **registration assertion** that FAILS before the registry edit (the entry is absent + the ops fuzz is unguarded), driving Step 2.

- [ ] **Step 1: Write the failing registration test** in `tests/parser/typoVocabCollision.test.ts` (it imports `TYPO_VOCABS`; also import `inScopeAliases`):

```ts
import { inScopeAliases } from "@/lib/parser/aliases";

it("registers the ops field-alias fuzzable vocab (derived, so the collision guard covers ops)", () => {
  const ops = TYPO_VOCABS.find((v) => v.id === "opsFieldAlias");
  expect(ops, "opsFieldAlias must be registered as a fuzzable vocab").toBeDefined();
  expect(ops!.klass).toBe("fuzzable");
  // members must be DERIVED from inScopeAliases("ops.") ≥5 chars (no hand-list drift)
  const expected = inScopeAliases("ops.")
    .filter((a) => a.length >= 5)
    .map((a) => a.toUpperCase())
    .sort();
  expect([...ops!.members].sort()).toEqual(expected);
  expect(expected).toContain("INVOICE"); // sanity: ops.invoice alias is in the fuzzable set
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → the registration test FAILS (`opsFieldAlias` undefined); the existing collision test still passes.

- [ ] **Step 3: Implement.** Add the DERIVED ops fuzzable entry (mirror `VENUE_FIELD_ALIASES` at `typoVocabRegistry.ts:15`, so it can't drift):

```ts
const OPS_FIELD_ALIASES = inScopeAliases("ops.")
  .filter((a) => a.length >= 5)
  .map((a) => a.toUpperCase());
```

then add to `TYPO_VOCABS`: `{ id: "opsFieldAlias", klass: "fuzzable", minLen: 5, members: OPS_FIELD_ALIASES },`.

- [ ] **Step 4: Run + mutation proof.** `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → both tests PASS (registration green; no ops alias within Damerau-1 of any other registered vocab). Then temporarily add a colliding member (e.g. an `INVOICE`-minus-one-edit string) to an `excluded` entry → confirm the collision guard FAILS → revert. If a REAL collision surfaces (an ops alias near a sub-label/role code), fix the registry — never weaken the test.
- [ ] **Step 5: Commit** — `test(parser): register ops field-alias vocab (derived) in the collision tripwire`

---

## Task 3: Full verification

- [ ] **Step 1:** `pnpm typecheck && pnpm eslint lib tests && pnpm format:check` → clean (prettier-fix new files; never the master spec).
- [ ] **Step 2:** `pnpm vitest run` (FULL). Expected: only the 3 env-bound live-infra suites fail locally; `tests/help` + collision meta-test green.
- [ ] **Step 3:** `git diff origin/main --stat -- 'components/**' 'app/**'` → empty (no UI surface; invariant-8 N/A). Commit any fixes.

---

## Self-Review (checklist)

1. **Spec coverage:** §5.3 ops re-route (scoped fuzzy fallback, FIELD_LABEL_AUTOCORRECTED) → Task 1; §3 registry/meta-test extension → Task 2. The other 6 surfaces correctly DEFERRED/do-not-fuzz (owner-ratified). No gaps for the ops-only slice.
2. **Placeholder scan:** every code step has real code.
3. **Type consistency:** `CANON_TO_FIELD: Record<string, keyof OpsResult>`; `fuzzyCandidates` carries `{rawLabel, value, canonical}`; `resolveAliasScoped` `{canonical, corrected}` shape (from PR-B); reuses `FIELD_LABEL_AUTOCORRECTED` (no new code).

## Adversarial review (cross-model)

After self-review, the WHOLE diff goes to Codex `adversarial-review` (reviewer-only). Iterate to APPROVE before merge.
