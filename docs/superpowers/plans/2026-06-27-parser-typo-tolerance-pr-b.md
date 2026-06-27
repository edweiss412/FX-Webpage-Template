# Parser typo-tolerance PR-B (P2 — field-alias chokepoint, venue-first slice) — implementation plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an opt-in **scoped** fuzzy fallback to the field-alias resolver and wire it into the venue parser, so a misspelled venue field label (e.g. `Venue Adress`) is recovered to its canonical instead of firing `UNKNOWN_FIELD` — surfaced as a deep-linked `FIELD_LABEL_AUTOCORRECTED` (preserving venue's current operator visibility, not a silent downgrade).

**Architecture:** `resolveAliasScoped(label, scopePrefix)` resolves ONLY to canonicals under `scopePrefix`, scoped on BOTH the exact path (an out-of-scope exact alias → `null`, never borrows another block's canonical — the spec-R1 HIGH fix) and the fuzzy path (`gatedVocabCorrect` over only the in-scope aliases, `minLen:5` + `tieAbort` + exclusions). The existing global `resolveAlias`/`resolveAliasFull` stay **exact and unchanged**.

**Tech Stack:** TypeScript, Vitest. Pure parser; no DB, no advisory lock, no UI component.

**Spec:** `docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md` §5 (Codex-APPROVED 2R). Spec wins on conflict.

## Scope (venue-first slice — owner-ratified)

PR-B ships the `resolveAliasScoped` mechanism + `FIELD_LABEL_AUTOCORRECTED` + **venue integration only**. **DEFERRED to PR-C:** re-routing the hand-maintained local alias maps (ops / rooms / transport `V2_SCHEDULE_LABELS` / client / dates-v1 / diagrams / event `CANONICAL_KEY_MAP`) through `resolveAliasScoped`. The mechanism shipped here is exactly what PR-C inherits.

## Global Constraints

- TDD per task; commit per task; conventional commits; `--no-verify`.
- `resolveAlias`/`resolveAliasFull` (`aliases.ts:162,173`) stay **exact + global, UNCHANGED** (honor `TYPO_ALIASES` → info `TYPO_NORMALIZED`; `detectVersion` (`schema.ts:107`) + the venue valCanon value-guard depend on this). Fuzz is the SEPARATE opt-in `resolveAliasScoped`.
- The gate (`gatedVocabCorrect`, shipped PR-A `lib/parser/typoGate.ts`): exact-first → exclude → `minLen:5` → Damerau≤1 → `tieAbort`.
- 1 new warn code `FIELD_LABEL_AUTOCORRECTED` via the #155 6-surface lockstep: `catalog.ts` + master-spec §12.4 + `gen:spec-codes` + `OPERATOR_ACTIONABLE_ANCHORED` (17→18) + `app/help/errors/_families.ts` prefix (`FIELD`→syncing-sheets) + `showDayTimeAnchors` dispatch (region branch). NEVER prettier the master spec.
- Run the COMPLETE `pnpm vitest run` before push (the #155 lesson). Env-bound live-infra suites (test-auth-gate Layer-2, pg-cron-coverage, email-canonicalization live audit) fail locally, pass in CI.

## Meta-test inventory

- **EXTENDS:** `tests/parser/typoVocabCollision.test.ts` (add the venue field-alias vocab as a `fuzzable` entry — the meta-test then guards it vs all registered) + the `OPERATOR_ACTIONABLE_ANCHORED` pin-tests (17→18).
- Advisory-lock / Supabase: N/A (pure parser). Invariant 8: N/A (`_families.ts` data prefix-map only).

## File Structure

- Modify: `lib/parser/aliases.ts` (add `resolveAliasScoped`), `lib/parser/blocks/venue.ts` (fuzzy fallback + emit), `lib/parser/typoVocabRegistry.ts` (venue field-alias fuzzable entry), `lib/parser/dataGaps.ts` (set), `lib/messages/catalog.ts` + `docs/.../2026-04-30-fxav-crew-pages-v1.md` (§12.4) + generated, `app/help/errors/_families.ts`, `lib/drive/showDayTimeAnchors.ts` (dispatch).
- Test: `tests/parser/aliasesScoped.test.ts` (new), `tests/parser/blocks/venue.test.ts`, `tests/parser/typoVocabCollision.test.ts`, the pin-test files.

---

## Task 1: `resolveAliasScoped` (scoped exact + fuzzy)

**Files:** Modify `lib/parser/aliases.ts`; Test `tests/parser/aliasesScoped.test.ts` (new).

**Interfaces:** Produces `resolveAliasScoped(label: string, scopePrefix: string): { canonical: string; corrected: boolean } | null`. Consumes `gatedVocabCorrect` (`lib/parser/typoGate.ts`), `REVERSE_MAP` (`aliases.ts:149`), `KNOWN_SUB_LABELS` (`knownSections.ts:91`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveAliasScoped } from "@/lib/parser/aliases";

describe("resolveAliasScoped", () => {
  it("exact in-scope alias → corrected:false", () => {
    // 'Venue Address' is an exact alias of venue.address
    expect(resolveAliasScoped("Venue Address", "venue.")).toEqual({ canonical: "venue.address", corrected: false });
  });
  it("exact OUT-of-scope alias → null (never borrows another block's canonical)", () => {
    // 'Client Contact' is an exact alias of client.contact — NOT a venue field
    expect(resolveAliasScoped("Client Contact", "venue.")).toBeNull();
  });
  it("fuzzy in-scope near-miss → corrected:true", () => {
    // 'Venue Adress' (deletion) is Damerau 1 from the in-scope alias 'Venue Address'
    expect(resolveAliasScoped("Venue Adress", "venue.")).toEqual({ canonical: "venue.address", corrected: true });
  });
  it("a short (<5) near-miss is NOT fuzzed (minLen)", () => {
    expect(resolveAliasScoped("Note", "venue.")).toBeNull(); // too short to fuzz
  });
  it("an unrelated label → null", () => {
    expect(resolveAliasScoped("Completely Unrelated Thing", "venue.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/aliasesScoped.test.ts` → FAIL (export not found).

- [ ] **Step 3: Implement** (append to `aliases.ts`, after `resolveAliasFull`):

```ts
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { KNOWN_SUB_LABELS } from "@/lib/parser/knownSections";

/**
 * Resolve a label to a canonical UNDER scopePrefix only, scoped on BOTH paths
 * (spec §5.1): an out-of-scope exact alias returns null (never borrows another
 * block's canonical); a near-miss of an in-scope alias is fuzzy-corrected via the
 * gate (minLen 5, tie-abort, sub-label exclusion). `resolveAlias` stays untouched.
 */
export function resolveAliasScoped(
  label: string,
  scopePrefix: string,
): { canonical: string; corrected: boolean } | null {
  const lower = label.trim().toLowerCase();
  // (1) exact: any exact alias is handled here — in-scope returns it, out-of-scope returns null.
  const exact = REVERSE_MAP.get(lower);
  if (exact !== undefined) {
    return exact.startsWith(scopePrefix) ? { canonical: exact, corrected: false } : null;
  }
  // (2) fuzzy over ONLY the in-scope aliases. (Reached only when `label` is not an exact
  // alias of any block, so the exclude just guards the sub-labels.)
  const inScopeAliases = [...REVERSE_MAP.entries()]
    .filter(([, canon]) => canon.startsWith(scopePrefix))
    .map(([alias]) => alias);
  const fix = gatedVocabCorrect(lower, inScopeAliases, {
    minLen: 5,
    tieAbort: true,
    exclude: [...KNOWN_SUB_LABELS].map((s) => s.toLowerCase()),
  });
  if (!fix?.corrected) return null;
  const canonical = REVERSE_MAP.get(fix.match);
  return canonical ? { canonical, corrected: true } : null;
}
```

- [ ] **Step 4: Run to verify pass** + `pnpm vitest run tests/parser` (aliases used widely) → PASS.
- [ ] **Step 5: Commit** — `feat(parser): add resolveAliasScoped (scoped exact+fuzzy field-alias resolver)`

---

## Task 2: Mint `FIELD_LABEL_AUTOCORRECTED` (§12.4 lockstep + dispatch)

**Files:** Modify `docs/.../2026-04-30-fxav-crew-pages-v1.md` (§12.4 table + YAML), `lib/messages/catalog.ts`, regen `lib/messages/__generated__/*`, `lib/parser/dataGaps.ts`, `app/help/errors/_families.ts`, `lib/drive/showDayTimeAnchors.ts`, the 2 pin tests.

- [ ] **Step 1:** Add the §12.4 master-spec table row (after `SECTION_HEADER_AUTOCORRECTED`):

```markdown
| `FIELD_LABEL_AUTOCORRECTED` | a block field label was misspelled and we auto-corrected it | "We read a likely-misspelled field label on _<sheet-name>_ (for example 'Venue Adress' as 'Venue Address') and used the corrected field. If it was intentional, update the sheet." | — | Doug → optional fix |
```

- [ ] **Step 2:** Add the §12.4 YAML appendix entry:

```yaml
FIELD_LABEL_AUTOCORRECTED: "A field label on this sheet looked misspelled (e.g. 'Venue Adress'), so we read it as the closest real field ('Venue Address') and used that. If it was intentional, update the sheet."
```

- [ ] **Step 3:** Add the `catalog.ts` row (after `SECTION_HEADER_AUTOCORRECTED`, dougFacing/helpfulContext byte-identical to §12.4):

```ts
  FIELD_LABEL_AUTOCORRECTED: {
    code: "FIELD_LABEL_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled field label on _<sheet-name>_ (for example 'Venue Adress' as 'Venue Address') and used the corrected field. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A field label on this sheet looked misspelled (e.g. 'Venue Adress'), so we read it as the closest real field ('Venue Address') and used that. If it was intentional, update the sheet.",
    title: "Auto-corrected a field label",
    longExplanation:
      "A field label on a sheet looked misspelled, so we read it as the closest real field and used that — the value is recovered into the right field instead of being dropped. If it was intentional, update the sheet.",
    helpHref: "/help/errors#FIELD_LABEL_AUTOCORRECTED",
  },
```

- [ ] **Step 4:** Add `"FIELD_LABEL_AUTOCORRECTED"` to `OPERATOR_ACTIONABLE_ANCHORED` (`dataGaps.ts`, 17→18).
- [ ] **Step 5:** Map the `FIELD` prefix in `app/help/errors/_families.ts` — add `"FIELD"` to the `syncing-sheets` family prefixes.
- [ ] **Step 5b:** Dispatch wiring in `lib/drive/showDayTimeAnchors.ts` — add `FIELD_LABEL_AUTOCORRECTED` to the region branch condition (alongside `FIELD_UNREADABLE`/`UNKNOWN_FIELD`/`COLUMN_HEADER_AUTOCORRECTED`/`SECTION_HEADER_AUTOCORRECTED`); it carries `blockRef:{kind:"venue"}` → `region["venue"]`. Add a dispatch test mirroring the others.
- [ ] **Step 6:** Regen + bump pin tests (17→18): `pnpm gen:spec-codes && pnpm gen:internal-code-enums`; add `FIELD_LABEL_AUTOCORRECTED` to `tests/parser/operatorActionableWarnings.test.ts` (sorted: after `FIELD_UNREADABLE`? — note alpha: `FIELD_LABEL_AUTOCORRECTED` < `FIELD_UNREADABLE`, so it goes BEFORE) and `tests/drive/showDayTimeAnchors.test.ts`. Run `pnpm vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts tests/cross-cutting/no-raw-codes.test.ts tests/help/errors-grouping.test.tsx tests/parser/operatorActionableWarnings.test.ts tests/drive/showDayTimeAnchors.test.ts` → PASS.
- [ ] **Step 7: Commit** — `feat(messages): add FIELD_LABEL_AUTOCORRECTED code + deep-link dispatch (§12.4 lockstep)`

---

## Task 3: Venue integration (fuzzy fallback + `FIELD_LABEL_AUTOCORRECTED`)

**Files:** Modify `lib/parser/blocks/venue.ts` (`:100` + the `UNKNOWN_FIELD` branch ~`:267`); Test `tests/parser/blocks/venue.test.ts`.

**Interfaces:** Consumes `resolveAliasScoped` (Task 1), `FIELD_LABEL_AUTOCORRECTED` (Task 2). The venue loop computes `col0Canon` and branches on it for field assignment; `UNKNOWN_FIELD` fires only when `col0Canon === null`.

- [ ] **Step 1: Write the failing test** — a venue block with a typo'd field label (`Venue Adress`) → the address value is recovered into `venue.address` (or the row is no longer `UNKNOWN_FIELD`), AND one `FIELD_LABEL_AUTOCORRECTED` (warn), AND **zero** `UNKNOWN_FIELD` (the no-downgrade guarantee). Also: a CORRECTLY-spelled venue label fires no `FIELD_LABEL_AUTOCORRECTED`. Generator: each `unambiguousTypos(alias, inScopeVenueAliases, {minLen:5})` of a venue alias (≥5 chars) recovers. Negative: an out-of-scope exact alias (`Client Contact`) in a venue row is NOT recovered (still `UNKNOWN_FIELD`).

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement.** In `venue.ts`, right after `const col0Canon = col0Full?.canonical ?? null;` (`:101`), add the scoped fuzzy fallback (mutate to a `let` + a flag):

```ts
    let col0CanonResolved = col0Full?.canonical ?? null;
    let fieldLabelCorrectedTo: string | null = null;
    if (col0CanonResolved === null && col0.trim() !== "") {
      const fuzzy = resolveAliasScoped(col0, "venue.");
      if (fuzzy?.corrected) {
        col0CanonResolved = fuzzy.canonical;
        fieldLabelCorrectedTo = fuzzy.canonical;
      }
    }
```

Replace downstream uses of `col0Canon` with `col0CanonResolved` (so the recovered canonical drives field assignment AND `UNKNOWN_FIELD` is skipped because `col0CanonResolved !== null`). Emit the warning inside the venue-scope guard (mirror the `TYPO_NORMALIZED` emit at `:118`):

```ts
    if (fieldLabelCorrectedTo && agg && inVenueFieldScope) {
      agg.warnings.push({
        severity: "warn",
        code: "FIELD_LABEL_AUTOCORRECTED",
        message: `Read likely-misspelled field label '${col0.trim()}' as '${fieldLabelCorrectedTo}'`,
        blockRef: { kind: "venue" },
        rawSnippet: col0.trim(),
      });
    }
```

(Keep the existing `col0Canon` name if cleaner by reassigning it to a `let`; the load-bearing change is the fuzzy fallback before the `UNKNOWN_FIELD === null` check.)

- [ ] **Step 4: Run to verify pass** + full `pnpm vitest run tests/parser` (corpus venue parses unchanged — fixtures are correctly spelled, so no fuzzy fires on them). **Negative-regression:** the valCanon value-guard (`:217,226`) still uses the exact `resolveAlias` (unchanged) — confirm a venue VALUE that looks like a label is not mis-recovered.
- [ ] **Step 5: Commit** — `feat(parser): recover misspelled venue field labels via resolveAliasScoped (FIELD_LABEL_AUTOCORRECTED)`

---

## Task 4: Registry extension + collision meta-test (venue field-alias vocab)

**Files:** Modify `lib/parser/typoVocabRegistry.ts`; `tests/parser/typoVocabCollision.test.ts` (unchanged logic — just runs over the new entry).

- [ ] **Step 1:** Add the venue field-alias vocab as a `fuzzable` registry entry (the in-scope venue aliases that are ≥5 chars — the fuzzable set), `minLen: 5`:

```ts
  { id: "venueFieldAlias", klass: "fuzzable", minLen: 5, members: [
    "VENUE NAME", "VENUE ADDRESS", "LOADING DOCK", "GOOGLE LINK", "VENUE NOTES",
    "IN HOUSE AV", "HOTEL RESERVATIONS", "VENUE CONTACT INFO",
  ] },
```

(Use the actual venue.* alias strings from `FIELD_ALIASES` — uppercase, ≥5 chars. The collision meta-test then asserts none sits within Damerau-1 of any other registered vocab member.)

- [ ] **Step 2: Run + mutation proof.** `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → PASS. If a real distance-1 collision surfaces (e.g. two venue aliases one edit apart, or a venue alias near a sub-label), the meta-test fails — FIX the registry/exclusion or drop the colliding member from the fuzzable set (never weaken the test). Then temporarily add a colliding member → confirm FAIL → revert (the load-bearing proof).
- [ ] **Step 3: Commit** — `test(parser): register venue field-alias vocab in the collision tripwire`

---

## Task 5: Full verification

- [ ] **Step 1:** `pnpm typecheck && pnpm eslint lib tests && pnpm format:check` → clean (prettier-fix new files; never the master spec).
- [ ] **Step 2:** `pnpm vitest run` (FULL). Expected: only the 3 env-bound live-infra suites fail locally; `tests/help` + collision meta-test green.
- [ ] **Step 3:** `git diff origin/main --stat -- 'components/**' 'app/**'` → only `app/help/errors/_families.ts` (invariant-8 N/A). Commit fixes.

---

## Self-Review (checklist)

1. **Spec coverage:** §5.1 `resolveAliasScoped` (scoped exact+fuzzy) → Task 1; §5.2 venue-first + `FIELD_LABEL_AUTOCORRECTED` → Tasks 2,3; §3 registry/meta-test extension → Task 4. §5.3 re-routing the 7 local maps → **deferred to PR-C** (owner-ratified scope). No gaps for the venue-first slice.
2. **Placeholder scan:** every code step has real code; the catalog row repeats the full copy.
3. **Type consistency:** `resolveAliasScoped` `{canonical, corrected}` shape consistent (Tasks 1,3); pin-test 17→18 (Task 2); `FIELD_LABEL_AUTOCORRECTED` string consistent (Tasks 2,3); the venue `col0CanonResolved` reassignment is internally consistent.

## Adversarial review (cross-model)

After self-review, the WHOLE diff goes to Codex `adversarial-review` (reviewer-only). Iterate to APPROVE before merge.
