# Parser Typo-Tolerance PR-D4 (client field labels + client RegionId) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover misspelled CLIENT-block field labels (the closed-vocab labels the client parser matches by hardcoded string equality) and surface them with a deep-linked `FIELD_LABEL_AUTOCORRECTED` warning, by adding a new `client` RegionId (owner-chosen, precise deep-link).

**Architecture:** `parseClient` → `parseClientV4`/`parseClientV2orV1` extract `client_label`/`client_contact` via hardcoded label matching (no `resolveAlias`). PR-D4 adds a gated fuzzy fallback (the PR-A `gatedVocabCorrect`-over-a-local-vocab pattern) to both, mirroring PR-D1/D3's deferred-commit + sentinel-aware `exactReal` model. The v4 parser's block-stop (a typo currently terminates the whole block) is the load-bearing constraint: the fuzzy decision gates break-vs-continue. The autocorrect warning deep-links via a new `client` RegionId (`header-block` over `/^CLIENT$/i`) — which is the first **warning-anchor-only** region (no crew card renders client data, §30), requiring an explicit no-zombie-region exemption.

**Tech Stack:** TypeScript, Next.js 16 parser modules, Vitest. No DB, no UI, no migrations. (`client_contact` renders nowhere on the crew page per spec §30, so this is UI-free — no impeccable gate.)

> **Design provenance:** stress-tested by a 3-prober design workflow (wf_277784de-ab7) before drafting. The four must-resolve items it surfaced (fuzzy-before-break, no-zombie-region exemption, header-block-not-row-label-union, collision tripwire) are baked in as contracts. Collision check clean by inspection (all client labels Damerau≥4 apart + ≥4 from every other registered vocab), but the tripwire MUST be run after registration (venue/event derived vocabs aren't inspectable).

## Scope

- **In scope (fuzzed):** v4 sub-labels `CLIENT_V4_LABELS = ["contact","contact cell","contact office","contact email"]`; v2 plain labels `CLIENT_V2_LABELS = ["client contact","client phone","client email"]`.
- **Out of scope (documented):** the `CLIENT` org label (block marker, not fuzzed); **v1 merged-cell slash variants** (`Client Contact/Name` etc. — label+value fused in col0, can't be cleanly fuzzed) → DEFER, document as a known limitation; column-splitting.

## Global Constraints

- **TDD per task** (invariant 1). One task per commit.
- **No new error code.** Reuse `FIELD_LABEL_AUTOCORRECTED` (catalog `lib/messages/catalog.ts:1117`, dispatch `lib/drive/showDayTimeAnchors.ts:141`, `_families` `app/help/errors/_families.ts:61`). `blockRef.kind="client"` (lowercase, == the new RegionId key). `KIND_TO_REGION` needs no `client` entry (it's checked first at showDayTimeAnchors.ts:130, but `client` isn't in it → correctly falls to the FIELD_LABEL branch at 136-147). **No §12.4 lockstep.**
- **Single source / no drift:** export `CLIENT_V4_LABELS` + `CLIENT_V2_LABELS` from `client.ts`; the registry imports them (uppercased); registration tests re-derive.
- **Runtime exclude:** the gate `exclude` = `[...KNOWN_SUB_LABELS].map((s) => s.toLowerCase())` (`lib/parser/knownSections.ts:91` — a LIVE reference, not a copy) so a stray `name`/`phone`/`email` row is never fuzzed into a client field. (Harmless to exact labels: `gatedVocabCorrect` is exact-first, typoGate.ts:23-24, before the exclude check.)

## Behavior contract

1. **Fuzzy-before-break (v4, CRITICAL).** In `parseClientV4` the fuzzy correction is evaluated in the unknown-label branch BEFORE the `break` (client.ts:66-76). On a near-miss → record a deferred candidate + `continue` (do NOT break, do NOT terminate the block). On null → the original `break`. (If fuzzy ran after the break, a typo'd known sub-label would drop every following row.)
2. **Merge-into-empty/sentinel; exact-real wins; no clobber (mirror PR-D1/D3, generalized to 2 columns).** Fuzzy candidates are **collected during the loop and applied ONLY AFTER the block is confirmed** (`clientLabel` set — Codex R1 #2: never warn for an unrecognized client block). Each candidate cell is merged into its parsed field **only when the fuzzy cell is real (non-null after normalize) AND the existing value is empty-or-sentinel** (`=== null || shouldHideGenericOptional(...)`). Consequences: an exact REAL value always wins (merge skips it); a sentinel/empty exact is overridden by a real fuzzy (no data loss); **no real value in ANY column is ever clobbered** (Codex R1 #1 — the v4 main/secondary columns merge independently). A `FIELD_LABEL_AUTOCORRECTED` warning fires **only when at least one cell was actually applied** (so an exact-claimed field suppresses the warn). No `claimed` set is needed — the per-cell merge guard IS the exact-wins mechanism.
3. **v4 2-column recovery.** A fuzzy v4 row recovers `col1` (main) and `col2` (secondary) **independently** (each via the merge rule above), routed by the corrected sub-label.
4. **Warning-anchor-only RegionId.** `client` is a RegionId for deep-link resolution only; no crew card renders client data (§30), so it has NO `CARD_REGION_MAP` entry — the no-zombie-region meta-test gets an explicit `WARNING_ANCHOR_ONLY` exemption.

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/parser/typoVocabCollision.test.ts` — adds `clientV4Label` + `clientV2Label` (two derived entries) + registration tests; the standing tripwire guards them.
- **EXTENDS** `tests/components/crew/sourceLinkCoverage.test.tsx` — adds a `WARNING_ANCHOR_ONLY` exemption to assertion (c) (the no-zombie-region parity) since `client` maps to no card.
- **EXTENDS** `tests/sheet-links/allowlistMeta.test.ts` — `REGION_IDS.length` 11 → 12.
- **N/A — declared:** advisory-lock, Supabase call-boundary, admin_alerts, postgrest-dml-lockdown — parser + deep-link-config only, no DB/auth.
- **N/A — no new warn code** → no `x1` lockstep.

## File Structure

- **Modify** `lib/parser/blocks/client.ts` — imports (`gatedVocabCorrect`, `shouldHideGenericOptional`, `KNOWN_SUB_LABELS`); export `CLIENT_V4_LABELS` + `CLIENT_V2_LABELS` + gate opts; thread `agg`; v2 + v4 fuzzy recovery (deferred-commit).
- **Modify** `lib/sheet-links/buildSheetDeepLink.ts` — `REGION_IDS += "client"`; `REGION_ANCHOR_SPEC.client` header-block entry. No `CARD_REGION_MAP` edit.
- **Modify** `lib/parser/typoVocabRegistry.ts` — `clientV4Label` + `clientV2Label` entries.
- **Modify** tests: `tests/parser/blocks/client.test.ts` (fuzzy tests), `tests/parser/typoVocabCollision.test.ts` (registration), `tests/sheet-links/allowlistMeta.test.ts` (12), `tests/components/crew/sourceLinkCoverage.test.tsx` (exemption).

---

## Task 1: agg threading + v2 fuzzy recovery

**Files:** Modify `lib/parser/blocks/client.ts`; Test `tests/parser/blocks/client.test.ts`.

**Interfaces:** Consumes `gatedVocabCorrect` (`lib/parser/typoGate.ts:16`), `shouldHideGenericOptional` (`lib/visibility/emptyState.ts:75`), `KNOWN_SUB_LABELS` (`lib/parser/knownSections.ts:91`), `newAggregator` (`lib/parser/warnings.ts`). Produces `export const CLIENT_V2_LABELS` (+ `CLIENT_V4_LABELS` in Task 2).

- [ ] **Step 1: Write failing v2 tests** — append to `tests/parser/blocks/client.test.ts`. Add `import { newAggregator } from "@/lib/parser/warnings";`. Build minimal v2 client blocks (a leading `| CLIENT | <org> |` row, then label rows). Tests:
  - **recover:** `| CLIENT | Acme |` + `| Client Contct | Bob |` → `client_contact.name === "Bob"`, 1 `FIELD_LABEL_AUTOCORRECTED` warn (`blockRef.kind === "client"`, `rawSnippet === "Client Contct"`).
  - **exact-wins:** `| Client Contact | Alice |` + `| Client Contct | Bob |` → name `"Alice"`, 0 warns.
  - **empty-exact recovers:** `| Client Contact |  |` + `| Client Contct | Dave |` → name `"Dave"`, 1 warn.
  - **org label not fuzzed:** `| Clent | Acme |` (typo of CLIENT) → `client_label === ""` (not recovered as org), 0 warns. (The `CLIENT` org marker is out of scope.)
  - **v1 merged-cell NOT recovered:** `| Client Contct/Grace |` → name not recovered, 0 warns (documented deferral).
  - Use `parseClient(md, "v2", agg)`.

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/blocks/client.test.ts`. The recover + empty-exact tests FAIL (typo dropped today); exact-wins, org-not-fuzzed, merged-cell-not-recovered already PASS.

- [ ] **Step 3: Implement.**
  - 3a. Imports + exported vocab + gate opts (top of client.ts):
```ts
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { KNOWN_SUB_LABELS } from "@/lib/parser/knownSections";

// Closed-vocab client field labels (lowercase) the fuzzy fallback recovers toward. Exported
// so lib/parser/typoVocabRegistry.ts derives the registry entries from this single source.
export const CLIENT_V2_LABELS = ["client contact", "client phone", "client email"] as const;
const CLIENT_GATE_OPTS = {
  minLen: 5,
  tieAbort: true,
  exclude: [...KNOWN_SUB_LABELS].map((s) => s.toLowerCase()),
} as const;
```
  - 3b. Thread `agg`: rename `parseClient`'s `_agg` param to `agg` and forward: `return parseClientV4(rows, agg);` / `return parseClientV2orV1(rows, agg);`. Add `agg?: ParseAggregator` to `parseClientV2orV1`'s signature (client.ts:149).
  - 3c. Add a module-scope merge helper (shared by v2 + v4 — Codex R1 #1): applies a fuzzy cell only when it is real and the existing value is empty-or-sentinel; never clobbers a real value.
```ts
// Merge a fuzzy cell into a parsed field: real fuzzy value fills an empty/sentinel slot only.
// Returns the (possibly updated) value + whether it changed (drives the warn). `normalize` is
// presence for text/phone, canonicalize for email.
function mergeFuzzyCell(
  cur: string | null,
  raw: string,
  normalize: (s: string) => string | null,
): { val: string | null; changed: boolean } {
  const v = normalize(raw);
  if (v !== null && (cur === null || shouldHideGenericOptional(cur))) return { val: v, changed: true };
  return { val: cur, changed: false };
}
```
  - 3d. v2 deferred candidates (collect during loop, single-source vocab). At the top of `parseClientV2orV1` (after the `let contact*` decls) add:
```ts
  const fuzzyCandidates = new Map<"name" | "phone" | "email", { rawLabel: string; value: string }>();
  const V2_LABEL_TO_FIELD: Record<string, "name" | "phone" | "email"> = {
    "client contact": "name",
    "client phone": "phone",
    "client email": "email",
  };
```
  The exact v2 branches (client.ts:175/179/183) are UNCHANGED (no `claimed` tracking — the post-loop merge guards against the already-assigned exact value). After ALL exact + v1-slash checks (just before the loop's closing `}` at client.ts:202), add the fuzzy fallback (last-write-wins on the map):
```ts
    // Fuzzy fallback (PR-D4): a near-miss of a v2 client label is recorded (deferred). The 'CLIENT'
    // org marker and the v1 merged-cell slash variants above are intentionally NOT fuzzed.
    const fuzzy = gatedVocabCorrect(labelLower, [...CLIENT_V2_LABELS], CLIENT_GATE_OPTS);
    if (fuzzy?.corrected) {
      const field = V2_LABEL_TO_FIELD[fuzzy.match];
      if (field && presence(val) !== null) fuzzyCandidates.set(field, { rawLabel: rawLabel.trim(), value: val });
    }
```
  - 3e. Apply candidates **AFTER the `if (!clientLabel) return` guard** (Codex R1 #2 — only for a confirmed client block). Replace `if (!clientLabel) return { client_label: "", client_contact: null };` (client.ts:205) with:
```ts
  if (!clientLabel) return { client_label: "", client_contact: null };

  for (const [field, cand] of fuzzyCandidates) {
    const norm = field === "email" ? canonicalize : presence;
    const cur = field === "name" ? contactName : field === "phone" ? contactPhone : contactEmail;
    const r = mergeFuzzyCell(cur, cand.value, norm);
    if (!r.changed) continue; // exact-claimed (real) — suppress the warn
    if (field === "name") contactName = r.val;
    else if (field === "phone") contactPhone = r.val;
    else contactEmail = r.val;
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      message: `Read likely-misspelled client label '${cand.rawLabel}' as '${fuzzyFieldLabel(field)}'`,
      blockRef: { kind: "client" },
      rawSnippet: cand.rawLabel,
    });
  }
```
  with `function fuzzyFieldLabel(f: "name" | "phone" | "email"): string { return f === "name" ? "client contact" : f === "phone" ? "client phone" : "client email"; }` (module scope). (`canonicalize` returns `null`/empty for `""` — verify; the `presence(val) !== null` recording guard already drops empty raw values.)

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/parser/blocks/client.test.ts` → green. Then `pnpm vitest run tests/parser` → corpus unchanged.

- [ ] **Step 5: Mutation proof** — in `mergeFuzzyCell`, temporarily drop the `(cur === null || shouldHideGenericOptional(cur))` condition (so a real fuzzy always overwrites) → the v2 **exact-wins** test goes RED → revert. (Uses `client contct`, a ≥5-char typo that becomes a real candidate, so the guard is genuinely exercised.)

- [ ] **Step 6: Commit** — `git commit -m "feat(parser): fuzzy v2 client field-label recovery + agg threading"`.

---

## Task 2: v4 fuzzy recovery + block-stop fix

**Files:** Modify `lib/parser/blocks/client.ts`; Test `tests/parser/blocks/client.test.ts`.

- [ ] **Step 1: Write failing v4 tests** — append. Build v4 client blocks (`| CLIENT | <org> |`, a `| | MAIN | SECONDARY |` header row, then sub-label rows with col1=main, col2=secondary). Tests:
  - **block-stop preserved (CRITICAL):** `| Contct Cell | 555-1 | 555-2 |` (typo, Damerau-1 of "contact cell") followed by `| Contact Email | a@x.co | b@x.co |` → the typo recovers (`client_contact.phone === "555-1"`, `secondary.phone === "555-2"`) AND the following `Contact Email` row is STILL parsed (`client_contact.email === "a@x.co"`). 1 warn.
  - **real-unknown still breaks:** `| COORDINATOR | x | |` followed by `| Contact Email | a@x.co | |` → block terminates at COORDINATOR; email NOT parsed (`client_contact.email === null` or contact null). 0 warns.
  - **v4 main+secondary recovery:** a typo'd sub-label recovers BOTH col1 and col2 (assert `secondary` values).
  - **v4 per-column no-clobber (Codex R1 #1):** exact `| Contact Cell |  | 555-2 |` (empty main, real sec) then fuzzy `| Contct Cell | 555-1 |  |` (real main, empty sec) → `client_contact.phone === "555-1"` AND `client_contact.secondary.phone === "555-2"` (NEITHER lost), 1 warn.
  - **v4 unrecognized-block no-warn (Codex R1 #2):** a block with NO `CLIENT` marker (e.g. `| Clent | Acme |` + `| Contct Cell | 555 |  |`) → `client_label === ""`, `client_contact === null`, and **0 warns** (no FIELD_LABEL_AUTOCORRECTED for a non-existent client block).
  - **v4 exact-wins:** exact `Contact Cell` (real) before a `Contct Cell` typo → exact phone kept, 0 warns.
  - **v4 empty/sentinel-exact recovers:** exact `Contact Cell` empty + `Contct Cell` real → fuzzy recovers, 1 warn.
  - **MAIN/SECONDARY header + blank rows untouched:** a block with the header row + a blank-col0 row parses normally, no fuzzy warn.
  - Derive expected values from the fixture's actual main/secondary cells (anti-tautology).

- [ ] **Step 2: Run to verify fail** — the block-stop-preserved + recovery + empty-exact tests FAIL; real-unknown-breaks + exact-wins + header-untouched PASS.

- [ ] **Step 3: Implement `parseClientV4` (client.ts:20-133).**
  - 3a. Signature: `function parseClientV4(rows: string[][], agg?: ParseAggregator): ...`. Export the v4 vocab at module scope (single source — Codex R1 #3; the gate AND the registry both use this exact const, no `V4_LABEL_TO_FIELD`):
```ts
export const CLIENT_V4_LABELS = ["contact", "contact cell", "contact office", "contact email"] as const;
```
  - 3b. After the `let sec*` decls add the deferred candidate map (no `claimed` set — the merge guard handles exact-wins):
```ts
  const fuzzyCandidates = new Map<string, { rawLabel: string; main: string; sec: string }>();
```
  - 3c. In the block-stop branch (client.ts:66-76), replace the inner `break` block with fuzzy-before-break (record + continue; last-write-wins on the map):
```ts
    if (
      !knownClientLabels.has(normalizedLabel) &&
      normalizedLabel !== "main" &&
      normalizedLabel !== "secondary"
    ) {
      if (label.length > 0 && !isMainSecRow(row)) {
        // Fuzzy-before-break (PR-D4 CRITICAL): a typo of a known sub-label must NOT terminate the
        // block. On a near-miss, record a deferred candidate and continue; only a genuine unknown
        // label breaks. The post-loop merge (3e) preserves both columns + exact-real values.
        const fuzzy = gatedVocabCorrect(normalizedLabel, [...CLIENT_V4_LABELS], CLIENT_GATE_OPTS);
        if (fuzzy?.corrected) {
          fuzzyCandidates.set(fuzzy.match, {
            rawLabel: (row[0] ?? "").trim(),
            main: row[1] ?? "",
            sec: row[2] ?? "",
          });
          continue; // recovered — do NOT break, do NOT fall through to exact field-detection
        }
        break; // genuine unknown label — original block-stop
      }
    }
```
  - 3d. The exact field-detection (client.ts:81-101) is UNCHANGED (no `claimed` tracking).
  - 3e. Apply deferred candidates **AFTER the `if (!clientLabel) return` guard** (Codex R1 #2). Replace `if (!clientLabel) return { client_label: "", client_contact: null };` (client.ts:104) with a per-column merge (Codex R1 #1 — main + secondary merge independently; never clobber a real exact value; warn iff a cell changed):
```ts
  if (!clientLabel) return { client_label: "", client_contact: null };

  for (const [sublabel, cand] of fuzzyCandidates) {
    let changed = false;
    const apply = (
      cur: string | null,
      raw: string,
      norm: (s: string) => string | null,
    ): string | null => {
      const r = mergeFuzzyCell(cur, raw, norm);
      if (r.changed) changed = true;
      return r.val;
    };
    if (sublabel === "contact") {
      mainName = apply(mainName, cand.main, presence);
      secName = apply(secName, cand.sec, presence);
    } else if (sublabel === "contact cell") {
      mainPhone = apply(mainPhone, cand.main, presence);
      secPhone = apply(secPhone, cand.sec, presence);
    } else if (sublabel === "contact office") {
      mainOfficePhone = apply(mainOfficePhone, cand.main, presence);
      secOfficePhone = apply(secOfficePhone, cand.sec, presence);
    } else if (sublabel === "contact email") {
      mainEmail = apply(mainEmail, cand.main, canonicalize);
      secEmail = apply(secEmail, cand.sec, canonicalize);
    }
    if (changed) {
      agg?.warnings.push({
        severity: "warn",
        code: "FIELD_LABEL_AUTOCORRECTED",
        message: `Read likely-misspelled client label '${cand.rawLabel}' as '${sublabel}'`,
        blockRef: { kind: "client" },
        rawSnippet: cand.rawLabel,
      });
    }
  }
```

- [ ] **Step 4: Run pass + corpus** — `pnpm vitest run tests/parser/blocks/client.test.ts` then `pnpm vitest run tests/parser` → green/unchanged.

- [ ] **Step 5: Mutation proofs** —
  - Move the fuzzy block to AFTER the `break` (keep the original `break` first) → the **block-stop-preserved** test goes RED → revert. (Proves fuzzy-before-break is load-bearing.)
  - In `mergeFuzzyCell`, drop the `(cur === null || shouldHideGenericOptional(cur))` condition → the **v4 exact-wins** AND **v4 per-column no-clobber** tests go RED → revert. (Proves the merge guard is load-bearing.)

- [ ] **Step 6: Commit** — `git commit -m "feat(parser): fuzzy v4 client field-label recovery (fuzzy-before-break)"`.

---

## Task 3: `client` RegionId + deep-link test gates

**Files:** Modify `lib/sheet-links/buildSheetDeepLink.ts`, `tests/sheet-links/allowlistMeta.test.ts`, `tests/components/crew/sourceLinkCoverage.test.tsx`.

- [ ] **Step 1: Write/adjust the failing gate tests first.**
  - In `tests/sheet-links/allowlistMeta.test.ts:30` change `expect(REGION_IDS.length).toBe(11)` → `toBe(12)` and the title (line 29) `11` → `12`. (This will be RED until Step 2 adds the RegionId — run it to confirm the count assertion drives the change.)
  - In `tests/components/crew/sourceLinkCoverage.test.tsx` assertion (c) (lines 213-220), add the exemption:
```ts
  // `client` is the first WARNING-ANCHOR-ONLY region: it is consumed only by the
  // FIELD_LABEL_AUTOCORRECTED deep-link path (lib/drive/showDayTimeAnchors.ts:146), NOT a crew
  // card — §30 forbids ever rendering client_contact to crew — so it has no CARD_REGION_MAP
  // entry by design. It still must be a real anchorable region (asserted below).
  const WARNING_ANCHOR_ONLY = new Set<string>(["client"]);
  it("(c) every REGION_ID is referenced by ≥1 entry in CARD_REGION_MAP (warning-anchor-only regions exempt)", () => {
    const referenced = new Set(Object.values(CARD_REGION_MAP));
    for (const region of REGION_IDS) {
      if (WARNING_ANCHOR_ONLY.has(region)) continue;
      expect(referenced.has(region), `region "${region}" has no card in CARD_REGION_MAP`).toBe(true);
    }
  });
  it("(c2) warning-anchor-only regions are real anchorable regions", () => {
    for (const region of WARNING_ANCHOR_ONLY) {
      expect(REGION_ANCHOR_SPEC[region as RegionId]).toBeDefined();
    }
    expect(REGION_ANCHOR_SPEC.client.strategy).toBe("header-block");
  });
```
  (import `REGION_ANCHOR_SPEC` + `RegionId` in the test if not already imported.)

- [ ] **Step 2: Add the RegionId.** In `lib/sheet-links/buildSheetDeepLink.ts`: add `"client"` to `REGION_IDS` (→ 12), and add to `REGION_ANCHOR_SPEC` (tsc forces this — `Record<RegionId, …>`):
```ts
  client: {
    tabs: ["INFO"],
    strategy: "header-block",
    header: /^CLIENT$/i,
    terminators: BLOCK_TERMINATORS,
  },
```
  (header-block, NOT row-label-union: the v4 `Contact*` sub-rows would overlap the `contacts` `/^contact\b/i` union. `BLOCK_TERMINATORS` lacks `CLIENT`, so the block spans correctly.) Do NOT add a `CARD_REGION_MAP` entry.

- [ ] **Step 3: Add a REAL-extraction test (Codex R1 #4 — exercise anchor discovery, not a prebuilt anchor).** In `tests/parser/sourceAnchorsCorpus.test.ts`, mirror the existing region assertions (e.g. line 194 `expect(anchors.contacts?.title).toBe("INFO")`): assert `expect(anchors.client?.title).toBe("INFO")` — this runs the real `extractSourceAnchors(buffer, titleToGid)` over an INFO tab containing a `CLIENT` header row (the header-block `/^CLIENT$/i` strategy resolves it). If the corpus INFO fixture lacks a `CLIENT` first-cell row, add one so the assertion exercises discovery (the existing per-anchor allowlist assertion at line ~156 already confirms the title is allowlisted). Confirm it anchors to the **INFO** tab, NOT the legacy non-allowlisted `CLIENT` master-library tab (LEGACY_CLIENT_ROWS, line 72 — produces no anchor because `client` region is `tabs:["INFO"]`). Optionally also add a dispatch test in `tests/drive/showDayTimeAnchors.test.ts` (a `FIELD_LABEL_AUTOCORRECTED` `kind:"client"` warning + a `sources.region.client` anchor → `attachSourceCellAnchors` sets a non-null `sourceCell`).

- [ ] **Step 4: Run** — `pnpm vitest run tests/sheet-links tests/components/crew/sourceLinkCoverage.test.tsx tests/drive/showDayTimeAnchors.test.ts` → green.

- [ ] **Step 5: Commit** — `git commit -m "feat(sheet-links): add client RegionId (warning-anchor-only) for autocorrect deep-links"`.

---

## Task 4: Register `clientV4Label` + `clientV2Label`

- [ ] **Step 1: Failing registration tests** — append to `tests/parser/typoVocabCollision.test.ts` (import `CLIENT_V4_LABELS`, `CLIENT_V2_LABELS` from `@/lib/parser/blocks/client`). Two `describe` blocks asserting each entry exists, `klass === "fuzzable"`, `members` equal the derived uppercased source, all members `length >= 5`. (Mirror the PR-D1/D2/D3 blocks.)
- [ ] **Step 2: Run to verify fail** — registration tests FAIL; the tripwire still PASSES.
- [ ] **Step 3: Register** — in `lib/parser/typoVocabRegistry.ts` import both vocabs and add after `roomV4Label`:
```ts
  { id: "clientV4Label", klass: "fuzzable", minLen: 5, members: CLIENT_V4_LABELS.map((s) => s.toUpperCase()) },
  { id: "clientV2Label", klass: "fuzzable", minLen: 5, members: CLIENT_V2_LABELS.map((s) => s.toUpperCase()) },
```
- [ ] **Step 4: Run + mutation proof** — both registration tests + the collision tripwire PASS (workflow-verified clean; **run it — venue/event derived vocabs make it the gate, not inspection**). If a REAL collision surfaces, resolve it (don't weaken the test). Mutation: add a Damerau-1 neighbor of a client label (e.g. `"CLIENT EMAIK"`) to `sentinels` → tripwire FAILS → revert.
- [ ] **Step 5: Commit** — `git commit -m "test(parser): register clientV4Label + clientV2Label fuzzable vocabs + collision guard"`.

---

## Task 5: Full verification

- [ ] **Step 1:** `pnpm typecheck && pnpm eslint lib tests && pnpm prettier --check <changed files>` → clean.
- [ ] **Step 2:** `pnpm vitest run` (FULL). Expected: only the 3 known env-bound suites fail locally; `tests/parser`, `tests/sheet-links`, `tests/components/crew/sourceLinkCoverage`, `tests/help`, the collision meta-test green.
- [ ] **Step 3:** `git diff --name-only origin/main..HEAD` — no `lib/messages/`, no `docs/superpowers/specs/` (no new code / catalog drift). `lib/sheet-links/buildSheetDeepLink.ts` IS expected (the RegionId).

---

## Self-Review (checklist)

1. **Spec coverage:** §5.3 client surface; the design workflow scoped v4 sub-labels + v2 plain labels, deferred v1 merged-cell. Covered Tasks 1-2.
2. **Four contracts baked in:** fuzzy-before-break (v4, pinned by block-stop-preserved + mutation), exact-real sentinel-aware (pinned by exact-wins/empty-exact + mutation), header-block RegionId (pinned by (c2)), no-zombie exemption (pinned by (c)).
3. **Drift:** vocabs exported once; registry imports; registration tests re-derive.
4. **No new code:** `FIELD_LABEL_AUTOCORRECTED` reused; `client` is a RegionId; Task 5 Step 3 guards catalog drift.
5. **Type consistency:** `blockRef.kind="client"` == RegionId key; `KIND_TO_REGION` unaffected; `REGION_ANCHOR_SPEC: Record<RegionId,…>` exhaustiveness forces the client entry.

## Adversarial review (cross-model)

**Plan review R1 (Codex): CHANGES_REQUESTED → all 4 resolved** — (1 HIGH) v4 two-column overwrite: replaced the wholesale apply + `claimed` set with a per-column `mergeFuzzyCell` that fills a cell only when the fuzzy value is real AND the existing value is empty/sentinel, so neither column's real value is ever clobbered (pinned by the per-column no-clobber test + mutation); (2 HIGH) v2/v4 warning timing: fuzzy candidates are now applied AFTER the `if (!clientLabel) return` guard, so an unrecognized client block emits no warning (pinned by the unrecognized-block no-warn test); (3 MED) single-source vocab: `CLIENT_V4_LABELS` is now exported and used as both the runtime gate vocab and the registry source (no `V4_LABEL_TO_FIELD`/`Object.keys` divergence); (4 MED) real-extraction test: Task 3 asserts `anchors.client?.title === "INFO"` through the real `extractSourceAnchors` path, not a prebuilt anchor.

After implementation, Codex whole-diff review to APPROVE. Do-not-relitigate preempts (design-workflow-verified): (a) **header-block over row-label-union** — the `contacts` `/^contact\b/i` union would overlap the v4 `Contact*` sub-rows; (b) **`client` as warning-anchor-only with no card** — §30 (client_contact rendered nowhere) + the warning-anchor path (showDayTimeAnchors.ts:146); a zombie `CARD_REGION_MAP` entry would be dishonest; (c) **v1 merged-cell deferral** — label/value fusion in col0; (d) **fuzzy-before-break is required** (not optional) — a typo'd known sub-label otherwise terminates the v4 block; (e) the `CLIENT` org label is intentionally not fuzzed; (f) collision is clean (all client labels Damerau≥4 apart + from other vocabs; tripwire run confirms).

## Execution Handoff

Inline execution (TDD per task, commit per task), then whole-diff Codex review → push → real CI green → `gh pr merge --merge` → fast-forward local `main`.
