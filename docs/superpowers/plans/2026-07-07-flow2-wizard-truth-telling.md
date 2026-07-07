# Flow 2 Wizard Truth-Telling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Step-3 onboarding review wizard tell the truth about what the parser did and did NOT understand — honest readiness copy (A), synonym re-routing of unrecognized-header flags (B), and a "Content we couldn't read" callout for `raw_unrecognized` (C).

**Architecture:** Three independent units in one PR, TDD + separate commit each. A = copy reframe in `renderSummary` (+ `blockingCount` param). B = a new closed-allowlist synonym resolver in `lib/admin/`, called from `sectionForWarning` only for `UNKNOWN_SECTION_HEADER`. C = pure sanitize/group/cap helpers in `lib/admin/` + a presentational callout in the review modal.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest + Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-07-flow2-wizard-truth-telling.md` (adversarial-review APPROVED, 4 rounds).

## Global Constraints

- **TDD per task:** failing test → run-fail → minimal impl → run-pass → commit. Never impl before its test.
- **Commit per task**, conventional-commits: `feat(admin):` / `test(admin):` / `feat(crew-page):` as scoped; one task per commit, `--no-verify` (shared hooks live in the main checkout).
- **No raw error codes in UI** (invariant 5): Units render prose + sheet content only.
- **Invariant 8 (impeccable dual-gate):** Units A + C touch `components/admin/wizard/**` (UI surface) → `/impeccable critique` AND `/impeccable audit` on the A+C diff BEFORE the whole-diff cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`-deferred. Unit B (`lib/admin/**`) is not a UI surface.
- **Invariant 10:** no mutation surface added (all read/derivation/render) — no registry row needed.
- **No DB / migrations / advisory locks / new §12.4 codes.**
- **Meta-test inventory:** NONE created or extended (spec §5.2). No Supabase call site, tile sentinel, admin alert, lock, email normalization, or mutation surface is touched. `tests/admin/step3SectionStatus.test.ts` and `tests/components/admin/wizard/Step3Review.test.tsx` are extended (they are ordinary tests, not meta-tests).
- **Layout-dimensions task:** N/A — the Unit C callout is flow content (auto height, full width), no fixed-dimension parent (spec §C.6).
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched.
- **The file `components/admin/wizard/Step3Review.tsx` is detected as `data` by `file(1)`** (contains non-UTF8/zero-width bytes). Plain `grep` treats it as binary — use `grep -a`. Edits work normally.

## File Structure

| Path | Responsibility | Unit |
|---|---|---|
| `components/admin/wizard/Step3Review.tsx` (modify `renderSummary`:841, call site :1258) | Honest summary copy + `blockingCount` param | A |
| `tests/components/admin/wizard/Step3Review.test.tsx` (modify) | Summary copy pins incl. blocking/SOME-READY/grammar | A |
| `lib/admin/sectionSynonymGuess.ts` (create) | Closed-allowlist synonym→SectionId resolver | B |
| `lib/admin/step3SectionStatus.ts` (modify `sectionForWarning`:68) | Call resolver for `UNKNOWN_SECTION_HEADER` | B |
| `tests/admin/step3SectionStatus.test.ts` (modify) | Per-seed literals, negative controls, rendered gate, severity gate, parser not-reached | B |
| `lib/admin/rawUnrecognized.ts` (create) | Pure sanitize + group + 50-cap of `raw_unrecognized` | C |
| `tests/admin/rawUnrecognized.test.ts` (create) | Sanitizer/grouping/cap anti-tautology | C |
| `components/admin/wizard/step3ReviewSections.tsx` (modify — add `RawUnrecognizedCallout`) | Escaped-text callout, instant collapse | C |
| `components/admin/wizard/Step3ReviewModal.tsx` (modify) | Render callout from `data.pr.raw_unrecognized` | C |
| `tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx` (create) | Escaping, empty guards, cap, collapse, reset-on-remount | C |

---

## Task 1 (Unit A): Honest readiness copy + `blockingCount`

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (`renderSummary`:841, call site :1258)
- Test: `tests/components/admin/wizard/Step3Review.test.tsx` (:154,163,175,185,195 + new cases)

**Interfaces:**
- Produces: `renderSummary(sheetCount: number, readyCount: number, needsLookCount: number, blockingCount: number)` — internal, composed as HEAD + readiness-clause + ATTENTION-POINTER + TAIL per spec §A.2.

The exact normalized `textContent` each fixture must produce (single-spaced). **Dash-free per DESIGN.md:318 — no em dashes, no `--`; clauses join with periods/commas.**

| Fixture (ready / needsLook / blocking) | Expected textContent |
|---|---|
| 2 / 0 / 0 | `2 sheets parsed from your Drive folder. We didn't spot any issues. Give them a quick look against your sheet before you publish. Nothing publishes until you say so.` |
| 1 / 0 / 0 | `1 sheet parsed from your Drive folder. We didn't spot any issues. Give it a quick look against your sheet before you publish. Nothing publishes until you say so.` |
| 1 / 1 / 0 (MIXED) | `2 sheets parsed from your Drive folder. 1 looks clean, 1 needs a quick look before it goes live. Nothing publishes until you say so.` |
| 0 / 2 / 0 (NEEDSLOOK) | `2 sheets parsed from your Drive folder. 2 need a quick look before they go live. Nothing publishes until you say so.` |
| 1 / 0 / 1 (SOME-READY) | `2 sheets parsed from your Drive folder. 1 looks clean. Give it a quick look before you publish. 1 needs your attention below. Nothing publishes until you say so.` |
| 0 / 0 / 1 (all blocking) | `1 sheet parsed from your Drive folder. 1 needs your attention below.` |

- [ ] **Step 1: Write the failing tests.** Replace the summary assertions at `Step3Review.test.tsx:154,163,175,185,195` with the six rows above, and ADD the SOME-READY (`1/0/1`) and all-blocking (`0/0/1`) cases (they exercise the ATTENTION-POINTER + `looksClean(1)` grammar the round-2 fix added). Build fixtures with the existing helpers: `cleanRow(id,"staged")` → ready; `warnRow(id)` (parseResult warnings `[{code:"FIELD_UNREADABLE",severity:"warn"}]`) → needs-look; `hardFailRow(id)` (status `"hard_failed"`) → blocking. Assert on the normalized `textContent` of the summary element (match the existing query in this file — reuse its normalization helper).

```tsx
// Example new case (SOME-READY): 1 ready + 1 blocking
it("scopes the clean claim and points at blocking rows", () => {
  render(<Step3Review wizardSessionId="w" rows={[cleanRow("a", "staged"), hardFailRow("b")]} />);
  expect(summaryText()).toBe(
    "2 sheets parsed from your Drive folder. 1 looks clean. Give it a quick look before you publish. 1 needs your attention below. Nothing publishes until you say so.",
  );
});
```

- [ ] **Step 2: Run tests, verify they FAIL.**
Run: `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx`
Expected: FAIL — current copy says "ready to publish" / lacks ATTENTION-POINTER; signature lacks `blockingCount`.

- [ ] **Step 3: Rewrite `renderSummary` and its call site.** Replace the function body (`Step3Review.tsx:841-886`) with:

```tsx
function renderSummary(
  sheetCount: number,
  readyCount: number,
  needsLookCount: number,
  blockingCount: number,
) {
  const cleanCount = readyCount + needsLookCount;
  const strong = (s: string) => <b className="font-semibold text-text-strong">{s}</b>;
  const head = (
    <>
      {strong(`${sheetCount} sheet${sheetCount === 1 ? "" : "s"}`)}
      {" parsed from your Drive folder."}
    </>
  );
  const attention =
    blockingCount > 0 ? (
      <span className="text-warning-text">
        {` ${blockingCount} ${blockingCount === 1 ? "needs" : "need"} your attention below.`}
      </span>
    ) : null;

  if (cleanCount === 0 && blockingCount === 0) return head; // all set-aside/skipped
  if (cleanCount === 0) {
    return (
      <>
        {head}
        {attention}
      </>
    ); // all blocking, no tail
  }

  const tail = " Nothing publishes until you say so.";
  const looksClean = (n: number) => (n === 1 ? "1 looks clean" : `${n} look clean`);
  // Capitalized: begins a sentence in the dash-free copy (DESIGN.md:318).
  const giveLook = (n: number) => (n === 1 ? "Give it a quick look" : "Give them a quick look");

  let clause: React.ReactNode;
  if (needsLookCount === 0) {
    clause =
      blockingCount === 0
        ? strong(
            `We didn't spot any issues. ${giveLook(readyCount)} against your sheet before you publish.`,
          )
        : strong(`${looksClean(readyCount)}. ${giveLook(readyCount)} before you publish.`);
  } else {
    const verb = needsLookCount === 1 ? "needs" : "need";
    const pron = needsLookCount === 1 ? "it goes" : "they go";
    const look = (
      <span className="text-warning-text">
        {`${needsLookCount} ${verb} a quick look before ${pron} live.`}
      </span>
    );
    clause =
      readyCount > 0 ? (
        <>
          {strong(looksClean(readyCount))}
          {", "}
          {look}
        </>
      ) : (
        look
      );
  }

  return (
    <>
      {head}{" "}
      {clause}
      {attention}
      {tail}
    </>
  );
}
```

Then update the call site (`Step3Review.tsx:1258`) to pass the existing `blockingCount` local (computed at `:930` as `blockingRows.length`):

```tsx
{renderSummary(sheetCount, readyCount, needsLookCount, blockingCount)}
```

- [ ] **Step 4: Run tests, verify PASS.**
Run: `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx`
Expected: PASS (all six + new cases).

- [ ] **Step 5: Typecheck the file.**
Run: `pnpm exec tsc --noEmit -p tsconfig.json` (or the repo's typecheck script) — confirm `React.ReactNode` / JSX types resolve; `blockingCount` is defined at the call site.

- [ ] **Step 6: Commit.**
```bash
git add components/admin/wizard/Step3Review.tsx tests/components/admin/wizard/Step3Review.test.tsx
git commit --no-verify -m "feat(admin): honest step-3 readiness copy with blocking pointer"
```

---

## Task 2 (Unit B): Synonym re-routing of `UNKNOWN_SECTION_HEADER`

**Files:**
- Create: `lib/admin/sectionSynonymGuess.ts`
- Modify: `lib/admin/step3SectionStatus.ts` (`sectionForWarning`:68-72)
- Test: `tests/admin/step3SectionStatus.test.ts`

**Interfaces:**
- Produces: `guessSectionFromHeader(rawSnippet: string | null | undefined): SectionId | null` and `normalizeHeaderForGuess(raw: string): string`.
- Consumes: `SectionId` (type-only) and `ParseWarning` from existing modules.

- [ ] **Step 1: Write the failing tests** in `tests/admin/step3SectionStatus.test.ts`. Match the existing `warn()` harness style; add an `unknownHeader` builder. Independent hardcoded expected literals per seed (NOT read from the map). Import the real `normalizeSectionHeaders` for the not-reached case.

```ts
import { normalizeSectionHeaders } from "@/lib/parser/sectionHeaderNormalize";

function unknownHeader(rawSnippet: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_SECTION_HEADER",
    message: "Unrecognized section",
    rawSnippet,
    blockRef: { kind: "unknown_section" },
  };
}

describe("Unit B — synonym re-routing", () => {
  // Case 1: per-seed correctness with independent literals
  it.each([
    ["STAFF", "crew"],
    ["PERSONNEL", "crew"],
    ["LODGING", "hotels"],
    ["ACCOMMODATION", "hotels"],
    ["ACCOMMODATIONS", "hotels"],
    ["HOTEL INFO", "hotels"],
    ["LOCATION", "venue"],
    ["VENUE INFO", "venue"],
  ])("routes rename %s → %s", (header, section) => {
    expect(sectionForWarning(unknownHeader(header))).toBe(section);
  });

  // normalization tolerance (case/space/trailing punctuation)
  it("normalizes case, whitespace, trailing punctuation", () => {
    expect(sectionForWarning(unknownHeader("  lodging  "))).toBe("hotels");
    expect(sectionForWarning(unknownHeader("Hotel Info:"))).toBe("hotels");
  });

  // Case 2: negative controls (exact-match, not containment)
  it.each(["SHIPPING", "CATERING", "CLIENT HOTEL INFO", "NO HOTEL INFO", "OLD VENUE INFO"])(
    "does NOT route foreign/contextual header %s",
    (header) => {
      expect(sectionForWarning(unknownHeader(header))).toBeNull();
    },
  );

  // Severity gate (local, not emitter-convention)
  it("does not route a non-warn UNKNOWN_SECTION_HEADER", () => {
    expect(
      sectionForWarning({ ...unknownHeader("LODGING"), severity: "info" }),
    ).toBeNull();
  });

  // Case 3: rendered gate — mapped rename whose section is not rendered → warnings bucket
  it("routes a rename to the warnings bucket when its section is not rendered", () => {
    const rendered = new Set<SectionId>(["crew", "warnings"]); // no hotels
    const map = warningsBySection([unknownHeader("LODGING")], rendered);
    expect(map.has("hotels")).toBe(false);
    expect(map.has("warnings")).toBe(true);
  });

  // Case 4: not-reached-for-typos — parser-generated, exact fixture
  it("a within-tolerance typo autocorrects and never emits UNKNOWN_SECTION_HEADER", () => {
    const md = "| TRANSPORTATON |\n| Driver | Bob |\n";
    const { warnings } = normalizeSectionHeaders(md);
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("SECTION_HEADER_AUTOCORRECTED");
    expect(codes).not.toContain("UNKNOWN_SECTION_HEADER");
    const auto = warnings.find((w) => w.code === "SECTION_HEADER_AUTOCORRECTED");
    expect(auto?.blockRef?.kind).toBe("transportation");
  });
});
```

> **Plan-time verification note (do this in Step 1):** confirm the `normalizeSectionHeaders(md)` return shape (`{ warnings }` vs `{ markdown, warnings }`) and the exact markdown a col-0 header needs (pipe-delimited per `sectionHeaderNormalize.ts:120-135`) by reading the function; adjust the `md` fixture to satisfy `requireFieldBand`/`fieldBand` if the emit path needs a following field row (the `| Driver | Bob |` row is included for that). `TRANSPORTATON` is one deletion from `TRANSPORTATION` → Damerau distance 1 → within `typoGate.ts:21` `maxDistance=1`. If the emit path needs additional structure, adjust the fixture — do NOT weaken the assertion.

- [ ] **Step 2: Run the tests, verify they FAIL.**
Run: `pnpm vitest run tests/admin/step3SectionStatus.test.ts`
Expected: FAIL — `sectionForWarning` returns null for renames (no resolver yet).

- [ ] **Step 3: Create the resolver** `lib/admin/sectionSynonymGuess.ts`:

```ts
import type { SectionId } from "@/lib/admin/step3SectionStatus";

// Closed allowlist: EXACT normalized header → section. Covers renamed/synonym
// section headers the parser's Damerau autocorrect can't catch (synonyms, not
// typos — spec §B.2). Used ONLY to route an UNKNOWN_SECTION_HEADER flag onto the
// section Doug associates it with; never to parse. hotels ≠ rooms (distinct).
const SYNONYM_TO_SECTION: Record<string, SectionId> = {
  STAFF: "crew",
  PERSONNEL: "crew",
  LODGING: "hotels",
  ACCOMMODATION: "hotels",
  ACCOMMODATIONS: "hotels",
  "HOTEL INFO": "hotels",
  LOCATION: "venue",
  "VENUE INFO": "venue",
};

// Uppercase, collapse internal whitespace, trim, strip trailing punctuation.
export function normalizeHeaderForGuess(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,:;!?]+$/, "")
    .trim();
}

// Exact-match only (no containment): a rename IS the whole header.
export function guessSectionFromHeader(
  rawSnippet: string | null | undefined,
): SectionId | null {
  if (!rawSnippet) return null;
  const key = normalizeHeaderForGuess(rawSnippet);
  if (!key) return null;
  return SYNONYM_TO_SECTION[key] ?? null;
}
```

- [ ] **Step 4: Wire into `sectionForWarning`** (`lib/admin/step3SectionStatus.ts:68-72`). Add a value import at the top (`import { guessSectionFromHeader } from "@/lib/admin/sectionSynonymGuess";`) and rewrite:

```ts
export function sectionForWarning(w: ParseWarning): SectionId | null {
  const kind = w.blockRef?.kind;
  const mapped = kind ? (KIND_TO_SECTION[kind] ?? null) : null;
  if (mapped) return mapped;
  // Best-guess ONLY for unrecognized-header warns (synonyms/renames). Local
  // severity+code gate — does not rely on the emitter's convention (spec §B.3).
  if (w.severity === "warn" && w.code === "UNKNOWN_SECTION_HEADER") {
    return guessSectionFromHeader(w.rawSnippet);
  }
  return null;
}
```

> The `SectionId` import in `sectionSynonymGuess.ts` is **type-only** (`import type`), so the value import of `guessSectionFromHeader` into `step3SectionStatus.ts` does not create a runtime import cycle.

- [ ] **Step 5: Run the tests, verify PASS.**
Run: `pnpm vitest run tests/admin/step3SectionStatus.test.ts`
Expected: PASS (all cases incl. negative controls, rendered gate, severity gate, parser not-reached).

- [ ] **Step 6: Typecheck** (`Record<string, SectionId>` enforces every map value is a real section).
Run: the repo typecheck script.

- [ ] **Step 7: Commit.**
```bash
git add lib/admin/sectionSynonymGuess.ts lib/admin/step3SectionStatus.ts tests/admin/step3SectionStatus.test.ts
git commit --no-verify -m "feat(admin): route unrecognized-header flags via section synonym map"
```

---

## Task 3 (Unit C, pure logic): `raw_unrecognized` sanitize + group + cap

**Files:**
- Create: `lib/admin/rawUnrecognized.ts`
- Test: `tests/admin/rawUnrecognized.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeRawUnrecognized(raw: unknown): { block: string; key: string; value: string }[]`
  - `buildRawUnrecognizedView(raw: unknown): { total: number; groups: { block: string; rows: { key: string; value: string }[] }[]; hiddenCount: number }`
  - `RAW_UNRECOGNIZED_CAP = 50`

- [ ] **Step 1: Write the failing tests** `tests/admin/rawUnrecognized.test.ts`. Derive every expectation from the crafted fixture, never hardcode a total the fixture can't reach.

```ts
import {
  sanitizeRawUnrecognized,
  buildRawUnrecognizedView,
  RAW_UNRECOGNIZED_CAP,
} from "@/lib/admin/rawUnrecognized";

describe("sanitizeRawUnrecognized (fail-closed)", () => {
  it("coalesces non-array/null to []", () => {
    expect(sanitizeRawUnrecognized(null)).toEqual([]);
    expect(sanitizeRawUnrecognized(undefined)).toEqual([]);
    expect(sanitizeRawUnrecognized("nope")).toEqual([]);
    expect(sanitizeRawUnrecognized({})).toEqual([]);
  });

  it("drops null/array/primitive/empty-key/non-string-key entries, no coercion", () => {
    const raw = [
      null,
      [1, 2],
      42,
      { block: "hotels", key: "", value: "x" }, // empty key → drop
      { block: "hotels", key: "   ", value: "x" }, // whitespace key → drop
      { block: "hotels", key: 5, value: "x" }, // non-string key → drop
      { block: "hotels", key: "Room Block", value: "Hilton" }, // keep
    ];
    expect(sanitizeRawUnrecognized(raw)).toEqual([
      { block: "hotels", key: "Room Block", value: "Hilton" },
    ]);
  });

  it("falls back block→Other and value→'' for missing/non-string, never 'null'/'[object Object]'", () => {
    const raw = [
      { block: "", key: "K1", value: "V1" },
      { block: 9, key: "K2", value: "V2" },
      { key: "K3", value: null },
      { block: "hotels", key: "K4" },
    ];
    expect(sanitizeRawUnrecognized(raw)).toEqual([
      { block: "Other", key: "K1", value: "V1" },
      { block: "Other", key: "K2", value: "V2" },
      { block: "Other", key: "K3", value: "" },
      { block: "hotels", key: "K4", value: "" },
    ]);
  });
});

describe("buildRawUnrecognizedView (group + cap + order)", () => {
  it("groups by first-appearance in emission order, stable rows", () => {
    const raw = [
      { block: "hotels", key: "a", value: "1" },
      { block: "event", key: "b", value: "2" },
      { block: "hotels", key: "c", value: "3" },
    ];
    const v = buildRawUnrecognizedView(raw);
    expect(v.total).toBe(3);
    expect(v.groups.map((g) => g.block)).toEqual(["hotels", "event"]); // first-appearance
    expect(v.groups[0].rows).toEqual([
      { key: "a", value: "1" },
      { key: "c", value: "3" },
    ]);
    expect(v.hiddenCount).toBe(0);
  });

  it("caps shown rows at 50 while total reflects the true sanitized count", () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({
      block: "b",
      key: `k${i}`,
      value: `v${i}`,
    }));
    const v = buildRawUnrecognizedView(raw);
    expect(v.total).toBe(60);
    const shown = v.groups.reduce((n, g) => n + g.rows.length, 0);
    expect(shown).toBe(RAW_UNRECOGNIZED_CAP);
    expect(v.hiddenCount).toBe(10);
    expect(v.groups[0].rows[0].key).toBe("k0"); // first-50 in emission order
    expect(v.groups[0].rows.at(-1)?.key).toBe("k49");
  });

  it("total 0 when everything is dropped", () => {
    expect(buildRawUnrecognizedView([null, { key: "" }])).toEqual({
      total: 0,
      groups: [],
      hiddenCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL.**
Run: `pnpm vitest run tests/admin/rawUnrecognized.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `lib/admin/rawUnrecognized.ts`:

```ts
export const RAW_UNRECOGNIZED_CAP = 50;

export type RawUnrecognizedEntry = { block: string; key: string; value: string };
export type RawUnrecognizedGroup = {
  block: string;
  rows: { key: string; value: string }[];
};
export type RawUnrecognizedView = {
  total: number;
  groups: RawUnrecognizedGroup[];
  hiddenCount: number;
};

// Fail-closed: persisted jsonb may be null/malformed. Strict typeof checks — no
// string coercion (would render "null"/"[object Object]"/"undefined" noise).
export function sanitizeRawUnrecognized(raw: unknown): RawUnrecognizedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RawUnrecognizedEntry[] = [];
  for (const el of raw) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) continue;
    const r = el as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    if (!key) continue; // unshowable
    const block =
      typeof r.block === "string" && r.block.trim() ? r.block.trim() : "Other";
    const value = typeof r.value === "string" ? r.value : "";
    out.push({ block, key, value });
  }
  return out;
}

export function buildRawUnrecognizedView(raw: unknown): RawUnrecognizedView {
  const entries = sanitizeRawUnrecognized(raw);
  const total = entries.length;
  const shown = entries.slice(0, RAW_UNRECOGNIZED_CAP);
  const groups: RawUnrecognizedGroup[] = [];
  const index = new Map<string, RawUnrecognizedGroup>();
  for (const e of shown) {
    let g = index.get(e.block);
    if (!g) {
      g = { block: e.block, rows: [] };
      index.set(e.block, g);
      groups.push(g); // first-appearance order
    }
    g.rows.push({ key: e.key, value: e.value });
  }
  return { total, groups, hiddenCount: Math.max(0, total - shown.length) };
}
```

> `.trim()` here is in `lib/admin/**` — outside the `no-inline-email-normalization` guard's scan scope (`lib/drive` + `lib/sync` only). No `canonicalize-exempt` comment needed.

- [ ] **Step 4: Run tests, verify PASS.**
Run: `pnpm vitest run tests/admin/rawUnrecognized.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/admin/rawUnrecognized.ts tests/admin/rawUnrecognized.test.ts
git commit --no-verify -m "feat(admin): fail-closed sanitize+group+cap for raw_unrecognized"
```

---

## Task 4 (Unit C, UI): "Content we couldn't read" callout

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (add exported `RawUnrecognizedCallout`)
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (render it from `data.pr.raw_unrecognized`)
- Test: `tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx`

**Interfaces:**
- Consumes: `buildRawUnrecognizedView` (Task 3); `SectionData.pr: ParseResult` (`step3ReviewSections.tsx:2836`).
- Produces: `RawUnrecognizedCallout({ raw }: { raw: unknown })` — renders nothing when the sanitized total is 0.

**Transition inventory (spec §C.5):** two states, collapsed ↔ expanded, **instant** (no `AnimatePresence`, no CSS animation) — matches `ReportIssueSection` (`step3ReviewSections.tsx:3091`, §D2 "instant — deliberate"). Conditional-mount body. Reset-to-collapsed on modal reopen is inherited from the modal remounting (`Step3SheetCard.tsx:566` conditionally mounts `Step3ReviewModal` with no key). Both are asserted in Step 1.

- [ ] **Step 1: Write the failing component tests** `tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { RawUnrecognizedCallout } from "@/components/admin/wizard/step3ReviewSections";

describe("RawUnrecognizedCallout", () => {
  it("renders nothing when there is nothing unreadable", () => {
    const { container: c1 } = render(<RawUnrecognizedCallout raw={[]} />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<RawUnrecognizedCallout raw={null} />);
    expect(c2).toBeEmptyDOMElement();
    const { container: c3 } = render(<RawUnrecognizedCallout raw={[{ key: "" }]} />);
    expect(c3).toBeEmptyDOMElement(); // everything dropped
  });

  it("shows the sanitized count in the header and is collapsed by default", () => {
    render(
      <RawUnrecognizedCallout
        raw={[{ block: "hotels", key: "Room Block", value: "Hilton" }]}
      />,
    );
    expect(screen.getByText(/Content we couldn't read \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText("Room Block")).not.toBeInTheDocument(); // collapsed
  });

  it("expands to grouped rows and renders HTML-like text literally (escaped)", () => {
    const hostile = "<script>alert(1)</script>";
    render(
      <RawUnrecognizedCallout
        raw={[{ block: "hotels", key: "Note", value: hostile }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    // literal text present; no script element injected
    expect(screen.getByText(new RegExp(hostile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders "(blank)" for an empty value", () => {
    render(<RawUnrecognizedCallout raw={[{ block: "b", key: "K", value: "" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    expect(screen.getByText(/K\s*\|\s*\(blank\)/)).toBeInTheDocument();
  });

  it("caps at 50 and shows a '+N more not shown' line", () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({ block: "b", key: `k${i}`, value: "v" }));
    render(<RawUnrecognizedCallout raw={raw} />);
    expect(screen.getByText(/Content we couldn't read \(60\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    expect(screen.getByText("+10 more not shown")).toBeInTheDocument();
  });

  it("resets to collapsed when remounted (modal reopen)", () => {
    const raw = [{ block: "b", key: "K", value: "V" }];
    const { unmount } = render(<RawUnrecognizedCallout raw={raw} />);
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    expect(screen.getByText("K | V")).toBeInTheDocument();
    unmount();
    render(<RawUnrecognizedCallout raw={raw} />); // fresh mount = reopen
    expect(screen.queryByText("K | V")).not.toBeInTheDocument(); // collapsed again
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL.**
Run: `pnpm vitest run tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx`
Expected: FAIL — `RawUnrecognizedCallout` not exported.

- [ ] **Step 3: Implement the component** in `components/admin/wizard/step3ReviewSections.tsx`. Add `import { buildRawUnrecognizedView } from "@/lib/admin/rawUnrecognized";` and `useState` (if not already imported), and export:

```tsx
export function RawUnrecognizedCallout({ raw }: { raw: unknown }) {
  const view = buildRawUnrecognizedView(raw);
  const [expanded, setExpanded] = useState(false); // instant (matches ReportIssueSection §D2)
  if (view.total === 0) return null;
  return (
    <section className="mt-4 rounded-lg border border-warning-border bg-warning-surface p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left font-semibold text-text-strong"
        aria-expanded={expanded}
      >
        <span>{`Content we couldn't read (${view.total})`}</span>
        <span aria-hidden>{expanded ? "–" : "+"}</span>
      </button>
      <p className="mt-1 text-sm text-text-muted">
        These rows were in your sheet but didn&apos;t match anything we know how to read. They
        aren&apos;t published, so check whether they matter.
      </p>
      {expanded ? (
        <div className="mt-2 space-y-3">
          {view.groups.map((g) => (
            <div key={g.block}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {g.block}
              </h4>
              <ul className="mt-1 space-y-0.5">
                {g.rows.map((r, i) => (
                  <li key={i} className="font-mono text-sm text-text-strong">
                    {r.key}
                    {" | "}
                    {r.value === "" ? "(blank)" : r.value}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {view.hiddenCount > 0 ? (
            <p className="text-xs text-text-muted">{`+${view.hiddenCount} more not shown`}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

> All dynamic text (`g.block`, `r.key`, `r.value`) is a React text child → auto-escaped. Do NOT use `dangerouslySetInnerHTML` (spec §C.2). Reuse the existing warning-callout Tailwind tokens actually present in this file — read a sibling callout (e.g. the flag chrome around `step3ReviewSections.tsx:402`/`:2272`) and match its `border`/`bg`/text token names rather than inventing new ones; the classes above are the intended shape, but the exact token names must match what the file already uses.

- [ ] **Step 4: Render it in the modal** `components/admin/wizard/Step3ReviewModal.tsx`. In the modal body (near the `WarningsBreakdown` render, `step3ReviewSections.tsx:2272` is the sibling pattern — place the callout adjacent to the per-section list, after it), add:

```tsx
<RawUnrecognizedCallout raw={data.pr?.raw_unrecognized} />
```

(`data.pr` is `ParseResult` per `SectionData`; `?.` guards a defensively-absent envelope. `raw={undefined}` sanitizes to `[]` → renders nothing.)

- [ ] **Step 5: Run tests, verify PASS.**
Run: `pnpm vitest run tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx`
Expected: PASS (all: empty guards, count, escaping, em-dash, cap, reset-on-remount).

- [ ] **Step 6: Full wizard-suite + typecheck regression** (the modal edit touches a shared render path).
Run: `pnpm vitest run tests/components/admin/wizard/ tests/admin/`
Run: repo typecheck script.
Expected: PASS.

- [ ] **Step 7: Commit.**
```bash
git add components/admin/wizard/step3ReviewSections.tsx components/admin/wizard/Step3ReviewModal.tsx tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx
git commit --no-verify -m "feat(admin): surface raw_unrecognized as a Content-we-couldn't-read callout"
```

---

## Post-implementation gates (before whole-diff cross-model review)

- [ ] **Impeccable dual-gate (invariant 8) on the A+C diff.** Run `/impeccable critique` AND `/impeccable audit` on the `Step3Review.tsx` + `step3ReviewSections.tsx` + `Step3ReviewModal.tsx` changes (with the canonical v3 preflight gates: PRODUCT.md / DESIGN.md / register / preflight signal). HIGH/CRITICAL findings fixed or `DEFERRED.md`-deferred. Record findings + dispositions for the handoff.
- [ ] **Full suite + lint + format + typecheck before push** (scoped gates miss regressions): `pnpm test`, `pnpm exec eslint` on changed files (canonical-Tailwind rule), `pnpm format:check`, repo typecheck. `--no-verify` on commits bypasses the prettier hook — run `format:check` explicitly.
- [ ] **Whole-diff Codex adversarial review** to APPROVE (Stage 4).

## Self-Review (author checklist — completed)

- **Spec coverage:** A → Task 1; B → Task 2; C.1-C.4 → Task 3 (pure) + Task 4 (UI). §C.5 transition + reset → Task 4 Step 1 tests. §C.2 escaping → Task 4 Step 1. All §5.1 invariants → Global Constraints. No spec section unmapped.
- **Placeholder scan:** none — every code step shows real code; the one plan-time verification (Task 2 Step 1 `normalizeSectionHeaders` shape) is a bounded read with a stated fallback, not a TODO.
- **Type consistency:** `guessSectionFromHeader`/`normalizeHeaderForGuess`/`sanitizeRawUnrecognized`/`buildRawUnrecognizedView`/`RawUnrecognizedCallout`/`RAW_UNRECOGNIZED_CAP` names identical across producer + consumer tasks. `renderSummary` 4-arg signature consistent between Task 1 impl and call site.
- **Anti-tautology:** Task 2 uses independent per-seed literals + negative controls + rendered gate + parser-generated not-reached (not a hand-built warning). Task 3 derives every expected from the crafted fixture. Task 4 asserts literal HTML text + `document.querySelector("script") === null` (escaping can't pass by accident).
