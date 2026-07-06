# PR-D5 — Diagrams folder-link typo recovery (composition-layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the DIagrams Drive-folder link (`ParsedSheet.diagrams.linkedFolder`) when the **DIagrams label is misspelled**, by deriving it in the composition layer from the value that PR-D1's typo-tolerant `parseEventDetails` already recovered into `eventDetails["diagrams"]` — instead of adding a new fuzzy match site.

**Architecture:** `parseDiagrams(markdown)` stays a **pure exact-label markdown extractor (signature and behavior unchanged)**. Its inner folder-URL extraction is refactored into an exported pure helper `extractLinkedFolder(value)`. In `lib/parser/index.ts`, *after* `parseDiagrams` runs, if `linkedFolder` is still `null` AND `eventDetails["diagrams"]` holds a Drive-folder URL, recover `linkedFolder` from that value via the same helper. This **mirrors the existing precedent at `index.ts:402`** — `extractOpeningReel(eventDetails["opening_reel"] ?? null)` already derives a sibling EVENT-DETAILS field's URL in the composition layer, so `opening_reel` already inherits PR-D1's typo recovery for free. PR-D5 brings `diagrams` to parity with that pattern.

**Why no new fuzzy site / no new warn:** A misspelled DIagrams label is fuzzy-matched, recovered into `eventDetails["diagrams"]`, **and warned** (`FIELD_LABEL_AUTOCORRECTED`, `blockRef.kind:"details"`) by `parseEventDetails` today — PR-D1, `lib/parser/blocks/event.ts:215`. Event's fuzzable vocab `EVENT_LABEL_VOCAB` is a **superset** of the single diagrams label: it includes `"DIAGRAMS"` and `"DIAGRAMS LINK"` (event.ts:71-72) because they are `CANONICAL_KEY_MAP` keys ≥5 chars, whereas the diagrams field's only label is `"DIAGRAMS"` (`FIELD_ALIASES["details.diagrams"]` = `["DIagrams","Diagrams","DIAGRAMS"]`, `lib/parser/aliases.ts:51`, all collapsing to one). Therefore any typo that *would* fuzzy-match the diagrams label is *already* recovered + warned by the event parser. Emitting a second warn here would duplicate the operator-actionable warning for one cell. Deriving `linkedFolder` from the already-recovered value adds **zero** new warnings, **zero** new fuzzy vocab, and rides the recovery the milestone already shipped + registered (`eventFieldAlias` in `lib/parser/typoVocabRegistry.ts`).

## Global Constraints

- **TDD per task.** Failing test → minimal implementation → passing test → commit. (AGENTS.md invariant 1.)
- **Commit per task**, conventional-commits: `<type>(<scope>): <summary>`. Scope: `parser`. (AGENTS.md invariant 6.)
- **No new error codes.** Reuses the already-shipped `FIELD_LABEL_AUTOCORRECTED` emitted by `parseEventDetails`; PR-D5 emits **no** warnings of its own, so **no §12.4 catalog / `gen:spec-codes` / 6-surface lockstep is required.**
- **Pure parser.** `parseDiagrams` and `extractLinkedFolder` make no Drive/Sheets/fetch calls (diagrams.ts:4).
- **`parseDiagrams` public signature is unchanged** — `parseDiagrams(markdown: string)`. No `agg` threading. The recovery + its warning live in `parseEventDetails`; the wiring lives in `index.ts`.
- **Additive-only fallback.** The new `index.ts` branch fires **only when `linkedFolder === null`**, so the exact-label path (the only path real sheets exercise) is byte-for-byte unchanged.

---

## File Structure

- `lib/parser/diagrams.ts` — **Modify.** Extract the inline folder-URL match logic (current lines ~52-68) into an exported pure helper `extractLinkedFolder(value: string)`; `parseDiagrams` calls it. No behavior change.
- `lib/parser/index.ts` — **Modify** (~line 399). Make `linkedFolder` reassignable and add the `null`-guarded fallback deriving it from `eventDetails["diagrams"]`.
- `tests/parser/diagrams.test.ts` — **Modify.** Add unit tests for `extractLinkedFolder`.
- `tests/parser/diagramsLabelRecovery.test.ts` — **Create.** Integration test through `parseSheet`: typo'd DIagrams label → `linkedFolder` recovered + exactly one `FIELD_LABEL_AUTOCORRECTED` warning + `event_details.diagrams` populated; plus exact-label control and below-minLen control.

---

### Task 1: Extract `extractLinkedFolder` helper (behavior-preserving refactor)

**Files:**
- Modify: `lib/parser/diagrams.ts`
- Test: `tests/parser/diagrams.test.ts`

**Interfaces:**
- Produces: `export function extractLinkedFolder(value: string): { driveFolderId: string; driveFolderUrl: string } | null` — returns the Drive folder ref if `value` contains a `/folders/<id>` URL (group 0 = full matched URL, group 1 = folder id), else `null`. Pure; no side effects.
- Consumes: nothing new. `parseDiagrams` is re-pointed at this helper.

- [ ] **Step 1: Write the failing test**

Append to `tests/parser/diagrams.test.ts` (import `extractLinkedFolder` alongside `parseDiagrams`):

```ts
describe("extractLinkedFolder", () => {
  it("returns folder ref when value contains a Drive folders URL", () => {
    expect(
      extractLinkedFolder("https://drive.google.com/drive/folders/ABC123def/view"),
    ).toEqual({
      driveFolderId: "ABC123def",
      driveFolderUrl: "https://drive.google.com/drive/folders/ABC123def/view",
    });
  });

  it("returns folder ref when the URL is embedded in longer text", () => {
    const r = extractLinkedFolder("LINK: https://drive.google.com/drive/folders/embed99?usp=sharing");
    expect(r?.driveFolderId).toBe("embed99");
  });

  it("returns null when value has no folder URL (placeholder / file URL)", () => {
    expect(extractLinkedFolder("LINK")).toBeNull();
    expect(extractLinkedFolder("")).toBeNull();
    expect(extractLinkedFolder("https://drive.google.com/file/d/FILEID/view")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/diagrams.test.ts -t "extractLinkedFolder"`
Expected: FAIL — `extractLinkedFolder is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

In `lib/parser/diagrams.ts`, add the exported helper and re-point `parseDiagrams` at it (the `FOLDER_URL_RE` and `TABLE_ROW_RE` constants stay where they are):

```ts
/**
 * Extract a Drive folder reference from a single cell value.
 * Returns `{ driveFolderId, driveFolderUrl }` if a `/folders/<id>` URL is present, else null.
 * Pure — shared by parseDiagrams (exact-label path) and the index.ts misspelled-label fallback.
 */
export function extractLinkedFolder(
  value: string,
): { driveFolderId: string; driveFolderUrl: string } | null {
  const folderMatch = value.match(FOLDER_URL_RE);
  if (!folderMatch || !folderMatch[1]) return null;
  return { driveFolderId: folderMatch[1], driveFolderUrl: folderMatch[0] };
}
```

Then replace the inner body of the `parseDiagrams` loop (the part after the DIAGRAMS_LABELS match) so it delegates to the helper:

```ts
    // Found the DIagrams row — check the value cell for a folder URL
    const linked = extractLinkedFolder(rowMatch[2] ?? "");
    if (!linked) {
      // Cell exists but contains no folder URL (e.g. placeholder "LINK")
      break;
    }
    return {
      linkedFolder: linked,
      embeddedImages: [] as never[],
      linkedFolderItems: [] as never[],
    };
```

- [ ] **Step 4: Run tests to verify they pass (helper + all existing diagrams tests unchanged)**

Run: `pnpm vitest run tests/parser/diagrams.test.ts`
Expected: PASS — new `extractLinkedFolder` block green AND every pre-existing `parseDiagrams` test still green (behavior-preserving refactor).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/diagrams.ts tests/parser/diagrams.test.ts
git commit -m "refactor(parser): extract reusable extractLinkedFolder helper from parseDiagrams"
```

---

### Task 2: Recover `linkedFolder` from the typo-recovered `eventDetails["diagrams"]` value

**Files:**
- Modify: `lib/parser/index.ts` (~line 399, the `parseDiagrams` destructure)
- Test: `tests/parser/diagramsLabelRecovery.test.ts` (Create)

**Interfaces:**
- Consumes: `extractLinkedFolder` (Task 1); `eventDetails` (`Record<string,string>`, already in scope at index.ts:390 as `const eventDetails = parseEventDetails(markdown, version, agg)`); `parseSheet(markdown, filename?)` (index.ts:321).
- Produces: no new exports. `ParsedSheet.diagrams.linkedFolder` is now non-null when the DIagrams label was misspelled but the cell held a folder URL.

- [ ] **Step 1: Write the failing test**

Create `tests/parser/diagramsLabelRecovery.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser/index";

// Minimal v4 EVENT DETAILS block: header row + one [label, value] row.
// (Same builder shape as tests/parser/blocks/event.test.ts:145.)
const sheet = (label: string, value: string) =>
  `| EVENT DETAILS | |\n| ${label} | ${value} |\n`;

const FOLDER_URL = "https://drive.google.com/drive/folders/RECOVERED123/view";

describe("PR-D5 — diagrams folder link recovers on a misspelled DIagrams label", () => {
  it("misspelled label → linkedFolder recovered, exactly one FIELD_LABEL_AUTOCORRECTED warn, event_details populated", () => {
    // "Diagrms" is Damerau-1 of "DIAGRAMS" (single deletion) and ≥5 chars → fuzzy-recovers.
    const r = parseSheet(sheet("Diagrms", FOLDER_URL));

    // (a) the folder-pins feature recovers the folder id from the typo-recovered value
    expect(r.diagrams.linkedFolder?.driveFolderId).toBe("RECOVERED123");

    // (b) NO double-warn: only parseEventDetails warns this cell — exactly one actionable autocorrect
    const autocorrects = r.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(autocorrects.length).toBe(1);
    expect(autocorrects[0]?.blockRef?.kind).toBe("details");

    // (c) the sibling text field was recovered too (the source of the fallback)
    expect(r.event_details.diagrams).toContain("RECOVERED123");
  });

  it("exact label → linkedFolder via parseDiagrams (fallback not needed), no autocorrect warn", () => {
    const r = parseSheet(sheet("Diagrams", FOLDER_URL));
    expect(r.diagrams.linkedFolder?.driveFolderId).toBe("RECOVERED123");
    expect(r.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED").length).toBe(0);
  });

  it("too-short typo (< minLen) → no fuzzy recovery → linkedFolder stays null", () => {
    // "Dgms" (4 chars) is below the gate's minLen:5 → event parser does not recover it,
    // so eventDetails.diagrams is empty and the fallback has nothing to derive from.
    const r = parseSheet(sheet("Dgms", FOLDER_URL));
    expect(r.diagrams.linkedFolder).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/diagramsLabelRecovery.test.ts`
Expected: FAIL — the first test's `driveFolderId` is `undefined` (fallback not yet wired); the exact-label and too-short controls already pass.

- [ ] **Step 3: Write minimal implementation**

In `lib/parser/index.ts`, replace the `parseDiagrams` destructure (currently the single line `const { linkedFolder, embeddedImages, linkedFolderItems } = parseDiagrams(markdown);`) with the form below — one `parseDiagrams` call, `linkedFolder` made reassignable, and the additive `null`-guarded fallback. Also add `extractLinkedFolder` to the existing import from `./diagrams`:

```ts
  // parseDiagrams is a pure exact-label extractor. If the DIagrams label was misspelled,
  // its exact scan misses — but parseEventDetails (typo-tolerant, PR-D1) already recovered the
  // cell value into eventDetails.diagrams AND warned (FIELD_LABEL_AUTOCORRECTED). Recover the
  // folder link from that value (mirrors extractOpeningReel(eventDetails["opening_reel"]) above).
  const diag = parseDiagrams(markdown);
  const { embeddedImages, linkedFolderItems } = diag;
  let linkedFolder = diag.linkedFolder;
  if (linkedFolder === null) {
    linkedFolder = extractLinkedFolder(eventDetails["diagrams"] ?? "");
  }
```

Import update at the top of `index.ts` (find the existing `from "./diagrams"` import and add the helper):

```ts
import { parseDiagrams, extractLinkedFolder } from "./diagrams";
```

(If `parseDiagrams` is imported on its own line, add `extractLinkedFolder` to the same named-import list.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/diagramsLabelRecovery.test.ts tests/parser/diagrams.test.ts tests/parser/parseSheet.test.ts`
Expected: PASS — all three controls green, and the pre-existing `parseSheet` / `diagrams` suites unaffected (additive `null`-guarded branch).

- [ ] **Step 5: Negative-regression proof (the fallback is load-bearing)**

Temporarily neutralize the fallback — change `if (linkedFolder === null)` to `if (false)` (or comment the `extractLinkedFolder` line) — and re-run:

Run: `pnpm vitest run tests/parser/diagramsLabelRecovery.test.ts`
Expected: the **misspelled-label** test goes RED (`driveFolderId` undefined) while the **exact-label** and **too-short** controls stay GREEN. This proves the test fails for the right reason and isn't tautological. Then restore the real condition and re-run — back to PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/parser/index.ts tests/parser/diagramsLabelRecovery.test.ts
git commit -m "feat(parser): recover diagrams folder link on a misspelled DIagrams label"
```

---

### Task 3: Self-review

- [ ] Re-read the spec rationale ("Why no new fuzzy site / no new warn"). Confirm: no `agg` threaded into `parseDiagrams`; no new error code; no `typoVocabRegistry.ts` / collision-tripwire change (no new fuzzy vocab introduced).
- [ ] Confirm `parseDiagrams`'s public signature is unchanged and all its existing tests pass untouched.
- [ ] Confirm the fallback fires only when `linkedFolder === null` (exact path unchanged).
- [ ] Run the full parser suite + typecheck: `pnpm vitest run tests/parser/ && pnpm tsc --noEmit` (expect green; env-bound suites outside `tests/parser/` are out of scope).
- [ ] Grep for accidental double-emit: `rg "FIELD_LABEL_AUTOCORRECTED" lib/parser/diagrams.ts lib/parser/index.ts` → expect **no matches** (PR-D5 emits none).

### Task 4: Adversarial review (cross-model)

- [ ] After self-review, run Codex `adversarial-review` on the whole diff (REVIEWER ONLY brief; distinct verdict marker; `< /dev/null`; background). Iterate to APPROVE. Preempt likely relitigation in the brief: (1) "silent recovery" — it is NOT silent; the autocorrect is surfaced by `parseEventDetails` (event.ts:215), proven by the integration test's single-warn assertion + the vocab-superset relationship (event.ts:71-72 ⊇ aliases.ts:51); (2) "parseDiagrams should fuzz its own label" — deliberately rejected to keep `parseDiagrams` pure and avoid a duplicate operator-actionable warning; the composition-layer derivation mirrors the shipped `extractOpeningReel(eventDetails["opening_reel"])` precedent at index.ts:402.

### Task 5: Execution handoff

- [ ] Push, real CI green, `gh pr merge --merge`, fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` == `0  0`, clean up the worktree, update memory.

---

## Self-Review (plan author)

**Spec coverage:** The single behavior — recover `linkedFolder` on a misspelled DIagrams label without a new warn — is covered by Task 1 (helper) + Task 2 (fallback + integration proof). ✅

**Placeholder scan:** No TBD/TODO; every code step shows concrete code. ✅

**Type consistency:** `extractLinkedFolder(value: string): { driveFolderId; driveFolderUrl } | null` is defined in Task 1 and consumed in Task 2 with the same name/shape; `eventDetails` is `Record<string,string>` (index.ts:390) so `eventDetails["diagrams"] ?? ""` is `string`. `linkedFolder` reassigned from `null` to the same union type. ✅

**Anti-tautology:** Task 2 Step 5 mutates the implementation (`if (false)`) and asserts the misspelled test goes RED while controls stay GREEN — proves the test isn't self-satisfying. Expected values derive from the fixture's folder id (`RECOVERED123`), not hardcoded magic. ✅

**Concrete failure mode each test catches:** (a) misspelled-label test — catches `linkedFolder` dropped when the DIagrams label is typo'd (the data loss this PR fixes); (b) single-warn assertion — catches a regression that double-warns the cell; (c) exact-label control — catches the fallback accidentally altering the exact path; (d) too-short control — catches over-correction of sub-minLen tokens. ✅
