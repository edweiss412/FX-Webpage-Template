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
2. **Exact-real wins; sentinel-aware (mirror PR-D1/D3).** An exact sub-label claims its field only with a real (non-null, non-sentinel via `shouldHideGenericOptional`) value. Empty/sentinel exact does not claim → a real fuzzy still recovers. Fuzzy candidates are applied post-loop only for unclaimed fields, last-write-wins.
3. **v4 2-column recovery.** A fuzzy v4 row recovers BOTH `col1` (main) and `col2` (secondary), routed by the corrected sub-label.
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
  - 3c. v2 deferred-commit. At the top of `parseClientV2orV1` (after the `let contact*` decls) add:
```ts
  const claimed = new Set<"name" | "phone" | "email">();
  const fuzzyCandidates = new Map<"name" | "phone" | "email", { rawLabel: string; value: string }>();
  const V2_LABEL_TO_FIELD: Record<string, "name" | "phone" | "email"> = {
    "client contact": "name",
    "client phone": "phone",
    "client email": "email",
  };
```
  In each exact v2 branch (client.ts:175/179/183), after the assignment, claim the field when the value is real, e.g. for `client contact`:
```ts
    if (labelLower === "client contact") {
      contactName = presence(val);
      if (contactName !== null && !shouldHideGenericOptional(contactName)) claimed.add("name");
      continue;
    }
```
  (similarly `claimed.add("phone")` / `claimed.add("email")` in their branches; for email use the canonicalized value for the real-check).
  After ALL exact + v1-slash checks (i.e. just before the loop's closing `}` at client.ts:202), add the fuzzy fallback:
```ts
    // Fuzzy fallback (PR-D4): a near-miss of a v2 client label is recovered (deferred). The
    // 'CLIENT' org marker and the v1 merged-cell slash variants above are intentionally NOT fuzzed.
    const fuzzy = gatedVocabCorrect(labelLower, [...CLIENT_V2_LABELS], CLIENT_GATE_OPTS);
    if (fuzzy?.corrected && val !== "") {
      const field = V2_LABEL_TO_FIELD[fuzzy.match];
      if (field) {
        const prev = fuzzyCandidates.get(field);
        const prevIsReal = prev !== undefined && !shouldHideGenericOptional(prev.value);
        if (!(shouldHideGenericOptional(val) && prevIsReal)) {
          fuzzyCandidates.set(field, { rawLabel: rawLabel.trim(), value: val });
        }
      }
    }
```
  After the loop (before the `if (!clientLabel)` return at client.ts:205), apply candidates:
```ts
  for (const [field, cand] of fuzzyCandidates) {
    if (claimed.has(field)) continue;
    if (field === "name") contactName = presence(cand.value);
    else if (field === "phone") contactPhone = presence(cand.value);
    else if (field === "email") contactEmail = canonicalize(cand.value);
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      message: `Read likely-misspelled client label '${cand.rawLabel}' as '${fuzzyFieldLabel(field)}'`,
      blockRef: { kind: "client" },
      rawSnippet: cand.rawLabel,
    });
  }
```
  with a small helper (module scope): `function fuzzyFieldLabel(f: "name" | "phone" | "email"): string { return f === "name" ? "client contact" : f === "phone" ? "client phone" : "client email"; }`.

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/parser/blocks/client.test.ts` → green. Then `pnpm vitest run tests/parser` → corpus unchanged.

- [ ] **Step 5: Mutation proof** — temporarily delete the post-loop `if (claimed.has(field)) continue;` → the v2 exact-wins test goes RED → revert. (Use a ≥5-char typo that becomes a real candidate, e.g. `client contct`, so the guard is genuinely exercised.)

- [ ] **Step 6: Commit** — `git commit -m "feat(parser): fuzzy v2 client field-label recovery + agg threading"`.

---

## Task 2: v4 fuzzy recovery + block-stop fix

**Files:** Modify `lib/parser/blocks/client.ts`; Test `tests/parser/blocks/client.test.ts`.

- [ ] **Step 1: Write failing v4 tests** — append. Build v4 client blocks (`| CLIENT | <org> |`, a `| | MAIN | SECONDARY |` header row, then sub-label rows with col1=main, col2=secondary). Tests:
  - **block-stop preserved (CRITICAL):** `| Contct Cell | 555-1 | 555-2 |` (typo, Damerau-1 of "contact cell") followed by `| Contact Email | a@x.co | b@x.co |` → the typo recovers (`client_contact.phone === "555-1"`, `secondary.phone === "555-2"`) AND the following `Contact Email` row is STILL parsed (`client_contact.email === "a@x.co"`). 1 warn.
  - **real-unknown still breaks:** `| COORDINATOR | x | |` followed by `| Contact Email | a@x.co | |` → block terminates at COORDINATOR; email NOT parsed (`client_contact.email === null` or contact null). 0 warns.
  - **v4 main+secondary recovery:** a typo'd sub-label recovers BOTH col1 and col2 (assert `secondary` values).
  - **v4 exact-wins:** exact `Contact Cell` (real) before a `Contct Cell` typo → exact phone kept, 0 warns.
  - **v4 empty/sentinel-exact recovers:** exact `Contact Cell` empty + `Contct Cell` real → fuzzy recovers, 1 warn.
  - **MAIN/SECONDARY header + blank rows untouched:** a block with the header row + a blank-col0 row parses normally, no fuzzy warn.
  - Derive expected values from the fixture's actual main/secondary cells (anti-tautology).

- [ ] **Step 2: Run to verify fail** — the block-stop-preserved + recovery + empty-exact tests FAIL; real-unknown-breaks + exact-wins + header-untouched PASS.

- [ ] **Step 3: Implement `parseClientV4` (client.ts:20-133).**
  - 3a. Signature: `function parseClientV4(rows: string[][], agg?: ParseAggregator): ...`.
  - 3b. After the `let sec*` decls add deferred state + the v4 map:
```ts
  const claimed = new Set<keyof typeof V4_LABEL_TO_FIELD | string>();
  const fuzzyCandidates = new Map<string, { rawLabel: string; main: string; sec: string }>();
  const V4_LABEL_TO_FIELD = {
    contact: "contact",
    "contact cell": "contact cell",
    "contact office": "contact office",
    "contact email": "contact email",
  } as const;
```
  - 3c. In the block-stop branch (client.ts:66-76), replace the inner `break` block with a fuzzy-before-break:
```ts
    if (
      !knownClientLabels.has(normalizedLabel) &&
      normalizedLabel !== "main" &&
      normalizedLabel !== "secondary"
    ) {
      if (label.length > 0 && !isMainSecRow(row)) {
        // Fuzzy-before-break (PR-D4 CRITICAL): a typo of a known sub-label must NOT terminate
        // the block. On a near-miss, record a deferred candidate and continue; only a genuine
        // unknown label breaks.
        const fuzzy = gatedVocabCorrect(normalizedLabel, Object.keys(V4_LABEL_TO_FIELD), CLIENT_GATE_OPTS);
        if (fuzzy?.corrected) {
          const main = row[1] ?? "";
          const sec = row[2] ?? "";
          const prev = fuzzyCandidates.get(fuzzy.match);
          const prevIsReal = prev !== undefined && presence(prev.main) !== null && !shouldHideGenericOptional(presence(prev.main) ?? "");
          const curRealEmpty = presence(main) === null || shouldHideGenericOptional(presence(main) ?? "");
          if (!(curRealEmpty && prevIsReal)) {
            fuzzyCandidates.set(fuzzy.match, { rawLabel: (row[0] ?? "").trim(), main, sec });
          }
          continue; // recovered — do NOT break, do NOT fall through to exact field-detection
        }
        break; // genuine unknown label — original block-stop
      }
    }
```
  - 3d. In the exact field-detection (client.ts:81-101), claim a field when its value is real. After each assignment add the claim, e.g.:
```ts
    if (normalizedLabel === "contact cell") {
      mainPhone = presence(row[1] ?? "");
      secPhone = presence(row[2] ?? "");
      if (mainPhone !== null && !shouldHideGenericOptional(mainPhone)) claimed.add("contact cell");
    } else if (normalizedLabel === "contact office") { /* …claimed.add("contact office") */ }
      else if (normalizedLabel === "contact email") { /* …claimed.add("contact email") */ }
```
  and for the `contact` (name) branch (client.ts:84-87): `if (mainName !== null && !shouldHideGenericOptional(mainName)) claimed.add("contact");`.
  - 3e. After the loop (before the `if (!clientLabel)` return at client.ts:104), apply deferred candidates:
```ts
  for (const [sublabel, cand] of fuzzyCandidates) {
    if (claimed.has(sublabel)) continue;
    if (sublabel === "contact") { mainName = presence(cand.main); secName = presence(cand.sec); }
    else if (sublabel === "contact cell") { mainPhone = presence(cand.main); secPhone = presence(cand.sec); }
    else if (sublabel === "contact office") { mainOfficePhone = presence(cand.main); secOfficePhone = presence(cand.sec); }
    else if (sublabel === "contact email") { mainEmail = canonicalize(cand.main); secEmail = canonicalize(cand.sec); }
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      message: `Read likely-misspelled client label '${cand.rawLabel}' as '${sublabel}'`,
      blockRef: { kind: "client" },
      rawSnippet: cand.rawLabel,
    });
  }
```

- [ ] **Step 4: Run pass + corpus** — `pnpm vitest run tests/parser/blocks/client.test.ts` then `pnpm vitest run tests/parser` → green/unchanged.

- [ ] **Step 5: Mutation proofs** —
  - Move the fuzzy block to AFTER the `break` (i.e. keep the original `break` first) → the **block-stop-preserved** test goes RED → revert. (Proves fuzzy-before-break is load-bearing.)
  - Delete the post-loop `if (claimed.has(sublabel)) continue;` → the **v4 exact-wins** test goes RED → revert.

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

- [ ] **Step 3: Add a deep-link resolution test** (to `tests/parser/blocks/client.test.ts` or `tests/drive/showDayTimeAnchors.test.ts`): a `FIELD_LABEL_AUTOCORRECTED` warning with `blockRef.kind="client"` + a `sources.region.client` anchor → `attachSourceCellAnchors` sets `sourceCell` (non-null) for it. (Mirror an existing `showDayTimeAnchors.test.ts` region-dispatch case.)

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

After implementation, Codex whole-diff review to APPROVE. Do-not-relitigate preempts (design-workflow-verified): (a) **header-block over row-label-union** — the `contacts` `/^contact\b/i` union would overlap the v4 `Contact*` sub-rows; (b) **`client` as warning-anchor-only with no card** — §30 (client_contact rendered nowhere) + the warning-anchor path (showDayTimeAnchors.ts:146); a zombie `CARD_REGION_MAP` entry would be dishonest; (c) **v1 merged-cell deferral** — label/value fusion in col0; (d) **fuzzy-before-break is required** (not optional) — a typo'd known sub-label otherwise terminates the v4 block; (e) the `CLIENT` org label is intentionally not fuzzed; (f) collision is clean (all client labels Damerau≥4 apart + from other vocabs; tripwire run confirms).

## Execution Handoff

Inline execution (TDD per task, commit per task), then whole-diff Codex review → push → real CI green → `gh pr merge --merge` → fast-forward local `main`.
