# Warning-Card Copy Restore + Trigger Popover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore concise inline guidance to compact warning cards, repoint the `?` popover to new per-code "what triggers this" copy, and fix the trigger to 22px-with-overlay geometry — per spec `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` (Codex APPROVE, R7).

**Architecture:** Five tasks: (1) copy sweep with frozen-fixture meta-test + corpus oracle + §12.4 lockstep; (2) adapter message-slot stack + popover re-point; (3) trigger geometry with browser-red-first TDD; (4) transition audit; (5) close-out gates. Spec §4.2 is the canonical copy table; the meta-test's frozen fixture is its enforcement arm.

**Tech Stack:** Next.js 16 / React, Tailwind v4 tokens, Vitest (+ jsdom), Playwright standalone harness (`tests/e2e/compact-alert-card-layout.spec.ts`, esbuild-CLI-bundled live entry per its header lines 25-37).

## Global Constraints

- Spec is canonical: every copy string comes VERBATIM from spec §4.2. Do not re-author. Any situation requiring NEW copy (e.g. an unregistered corpus code) is a genuine ambiguity: STOP, set the ship-state marker's `blockedOn`, escalate once. Never invent copy.
- §12.4 lockstep: master-spec prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` in the SAME commit; `pnpm test:audit:x1-catalog-parity` green.
- Banned vocabulary + em-dash in the three authored fields per spec §4.1; caps: `helpfulContext` ≤ 300, `triggerContext` ≤ 160.
- Boundary: zero `admin_alerts` codes, zero `dougFacing` edits, zero AttentionBanner copy/content changes (geometry-only exception, spec §9).
- TDD per task; every commit uses `git commit --no-verify`; conventional commits.
- UI diff ⇒ impeccable critique + audit before cross-model review (invariant 8).
- Repo tsconfig: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; run `pnpm typecheck` before each commit.

## Pre-verified facts (pre-draft live-code pass — no execution-time conditionals remain)

- `parseSheet(markdown: string, filename?: string): ParsedSheet` — `lib/parser/index.ts:546`; `ParsedSheet.warnings: ParseWarning[]` — `lib/parser/types.ts:457`.
- Adapter: title chain `PerShowActionableWarnings.tsx:71`, popover context line 72, `CompactAlertHelp` call lines 127-139, tone default line 40.
- `CompactAlertHelp` trigger span: `components/admin/compactAlertHelp.tsx:125-132`; `HoverHelp` custom-trigger button: `components/admin/HoverHelp.tsx:195-201` (44px-box classes at 197); default-trigger overlay pattern at 202-207.
- Real-browser harness: `tests/e2e/_compactAlertCardLiveEntry.tsx` (mounts real `CompactAlertCard` + `CompactAlertHelp`) + `tests/e2e/compact-alert-card-layout.spec.ts` (esbuild CLI bundling around lines 60-80, `esbuild@0.28.0`, Tailwind CLI CSS, node:http server). Run command (spec header lines 34-36): `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/compact-alert-card-layout.spec.ts`.
- `AttentionBanner` (`components/admin/review/AttentionBanner.tsx:91`): props `{ item: AttentionItem, ... }`, imports `usePathname` from `next/navigation` (line 30) and `PerShowAlertResolveButton` (client-only: `useState`/`useRouter`/catalog imports — `PerShowAlertResolveButton.tsx:16-20`, no server-action import). Browser bundling therefore needs ONLY a `next/navigation` stub via esbuild `--alias`.
- AttentionBanner jsdom fixture builder `makeItem(...)` at `tests/components/admin/review/attentionBanner.test.tsx:28-42` — copy its shape into the harness.
<!-- spec-lint: ignore — new test file created by this plan -->
- No existing HoverHelp-dedicated unit suite (grep confirmed) ⇒ Task 3 creates `tests/components/admin/hoverHelpCompactTrigger.test.tsx`.
- Contrast family pattern: `tests/styles/status-token-contrast.test.ts`.
- Corpus: `fixtures/shows/raw/` currently holds exactly 8 `.md` fixtures.
- Unchanged custom-trigger callers to pin: `components/admin/settings/DriveConnectionPanel.tsx:210`, `components/admin/wizard/Step2Verify.tsx:639`.

## Meta-test inventory (writing-plans rule)

<!-- spec-lint: ignore — new test files created by this plan -->
CREATES `tests/messages/_metaWarningCardCopy.test.ts` (+ fixture module `tests/messages/warningCardCopyRegistry.ts`) and a new HoverHelp compact-trigger suite (path in Task 3) (includes the unchanged-caller source pin). EXTENDS `tests/e2e/_compactAlertCardLiveEntry.tsx`, `tests/e2e/compact-alert-card-layout.spec.ts`, `tests/styles/status-token-contrast.test.ts`. No `pg_advisory*` surface; no DB migration.

---

### Task 1: Copy sweep — meta-test, registry fixture, catalog + §12.4 lockstep, AGENTS.md line

**Files:**
<!-- spec-lint: ignore — new test files created by this plan -->
- Create: `tests/messages/warningCardCopyRegistry.ts`, `tests/messages/_metaWarningCardCopy.test.ts`
- Modify: `lib/messages/catalog.ts`; `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 helpfulContext list, region near line 3230: 36 replaced lines + 3 added); `AGENTS.md` (one sentence); this plan (Measured values section)
- Regenerate: `lib/messages/__generated__/spec-codes.ts`

**Interfaces:**
<!-- spec-lint: ignore — new test files created by this plan -->
- Produces: `WARNING_CARD_COPY_CODES`, `EXPECTED_TRIGGER_CONTEXT`, `EXPECTED_TITLE_CHANGES`, `EXPECTED_CORPUS_WARN_CODES`, `EXPECTED_CORPUS_FIXTURES` from `tests/messages/warningCardCopyRegistry.ts`; catalog field `MessageCatalogEntry.triggerContext?: string | null`.
- Consumes: `MESSAGE_CATALOG`, `parseSheet` (`lib/parser/index.ts:546`; import `from "@/lib/parser"` — the barrel is `lib/parser/index.ts` itself), `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:369`).

- [ ] **Step 1: Write the registry fixture.** All 39 codes from spec §3.1; `EXPECTED_TRIGGER_CONTEXT` = spec §4.2 popover column byte-for-byte (all 39); `EXPECTED_TITLE_CHANGES` = `{ FIELD_UNREADABLE: "Phone or email we couldn't use", SECTION_HEADER_NO_FIELDS: "Section with nothing under it", UNKNOWN_SECTION_HEADER: "Section we didn't recognize", TRAVEL_FLIGHT_UNPARSEABLE: "Flight we couldn't read" }`; corpus sets empty with `// measured in Step 3`. Module style mirrors `tests/messages/adminAlertsRegistry.ts`.

```ts
// tests/messages/warningCardCopyRegistry.ts - fixture data for _metaWarningCardCopy.test.ts.
// Nothing in lib/ or components/ imports this module (spec §3.5 registry contract).
export const WARNING_CARD_COPY_CODES: ReadonlySet<string> = new Set([
  /* the 39 codes, spec §3.1 parser list then sync list */
]);
export const EXPECTED_TRIGGER_CONTEXT: Readonly<Record<string, string>> = {
  AGENDA_BLOCK_UNRESOLVED: "Appears when a day in the AGENDA tab has no readable date above it.",
  /* … all 39 rows, spec §4.2 popover column, byte-for-byte … */
};
export const EXPECTED_TITLE_CHANGES: Readonly<Record<string, string>> = { /* the 4 above */ };
export const EXPECTED_CORPUS_WARN_CODES: ReadonlySet<string> = new Set([]); // measured in Step 3
export const EXPECTED_CORPUS_FIXTURES: ReadonlySet<string> = new Set([]); // measured in Step 3
```

- [ ] **Step 2: Write the failing meta-test** (untyped record view so red is behavioral — spec §8.1):

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { parseSheet } from "@/lib/parser";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import {
  WARNING_CARD_COPY_CODES, EXPECTED_TRIGGER_CONTEXT, EXPECTED_TITLE_CHANGES,
  EXPECTED_CORPUS_WARN_CODES, EXPECTED_CORPUS_FIXTURES,
} from "./warningCardCopyRegistry";

const CATALOG = MESSAGE_CATALOG as Record<string, Record<string, unknown>>;
const EM_DASH = String.fromCodePoint(0x2014);
const BANNED = new RegExp(
  String.raw`\b(pars(?:e|er|ed|ing)|token|extractor|positional|canonical(?:ize)?|structured|ingest(?:ion)?|fallback|enum|RPC|payload|metadata|variant|null|(?:un)?parseable)\b` + "|" + EM_DASH,
  "iu",
);
const CORPUS_DIR = "fixtures/shows/raw";

describe("warning-card copy registry (spec 2026-07-20-warning-card-copy-restore §3.5)", () => {
  const codes = [...WARNING_CARD_COPY_CODES].sort();

  it("every registry code: non-empty title, capped helpfulContext, capped triggerContext", () => {
    for (const code of codes) {
      const e = CATALOG[code];
      expect(e, `${code} missing from catalog`).toBeDefined();
      if (!e) continue;
      expect(typeof e.title === "string" && (e.title as string).trim().length > 0, `${code}.title`).toBe(true);
      const hc = e.helpfulContext;
      expect(typeof hc === "string" && hc.trim().length > 0 && hc.length <= 300, `${code}.helpfulContext cap`).toBe(true);
      const tc = e.triggerContext;
      expect(typeof tc === "string" && tc.trim().length > 0 && tc.length <= 160, `${code}.triggerContext cap`).toBe(true);
    }
  });

  it("banned vocabulary + em-dash absent from the three authored fields", () => {
    for (const code of codes) {
      const e = CATALOG[code];
      if (!e) continue;
      for (const field of ["title", "helpfulContext", "triggerContext"] as const) {
        const v = e[field];
        if (typeof v !== "string") continue;
        const m = BANNED.exec(v);
        expect(m, `${code}.${field} banned term ${JSON.stringify(m?.[0])}`).toBeNull();
      }
    }
  });

  it("frozen copy fixture: triggerContext + changed titles match spec §4.2 byte-for-byte", () => {
    for (const code of codes) {
      expect(CATALOG[code]?.triggerContext, `${code}.triggerContext`).toBe(EXPECTED_TRIGGER_CONTEXT[code]);
    }
    for (const [code, title] of Object.entries(EXPECTED_TITLE_CHANGES)) {
      expect(CATALOG[code]?.title, `${code}.title`).toBe(title);
    }
  });

  it("OPERATOR_ACTIONABLE_ANCHORED is a subset of the registry", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      expect(WARNING_CARD_COPY_CODES.has(code), code).toBe(true);
    }
  });

  it("corpus oracle: fixture list + emitted warn-code set frozen; every emitted code registered (spec §3.5.4)", () => {
    const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md")).sort();
    expect(new Set(files)).toEqual(EXPECTED_CORPUS_FIXTURES);
    const emitted = new Set<string>();
    for (const f of files) {
      const parsed = parseSheet(readFileSync(join(CORPUS_DIR, f), "utf8"), f);
      for (const w of parsed.warnings) if (w.severity === "warn") emitted.add(w.code);
    }
    for (const code of emitted) {
      expect(WARNING_CARD_COPY_CODES.has(code), `corpus emitted unregistered warn code ${code}`).toBe(true);
    }
    expect(emitted).toEqual(EXPECTED_CORPUS_WARN_CODES);
  });
});
```

- [ ] **Step 3: Measure and freeze the corpus sets.** Run `npx vitest run tests/messages/_metaWarningCardCopy.test.ts` — the corpus test fails on the empty frozen sets; its `toEqual` diff prints the observed sets. Copy the 8 filenames into `EXPECTED_CORPUS_FIXTURES` and the observed warn-code set into `EXPECTED_CORPUS_WARN_CODES`. Then record both sets in the **Measured values** section at the bottom of THIS plan file and stage the plan edit with the commit (spec §3.5.4 requires them recorded in the plan). If ANY observed code is not in the 39-code registry: STOP — genuine ambiguity (spec §3.1 audit gap requiring new §4.2 copy); set `blockedOn` in the ship-state marker (gitignored .claude directory) and escalate. Do not author copy.

- [ ] **Step 4: Run the meta-test to verify behavioral red.** `npx vitest run tests/messages/_metaWarningCardCopy.test.ts`. Expected FAIL: 39 missing `triggerContext`, 3 null titles, stale `TRAVEL_FLIGHT_UNPARSEABLE` title, over-cap/banned `helpfulContext` rows (AGENDA_PDF_UNREADABLE contains "parse"; TRAVEL_FLIGHT_AMBIGUOUS_TABLE contains "parser"). Corpus test must PASS. Save the failure summary for the commit body.

- [ ] **Step 5: Land the copy lockstep (same commit).**
  1. `lib/messages/catalog.ts` — add after `helpHref` in `MessageCatalogEntry`:
     ```ts
     /**
      * Card-popover "what makes this appear" copy (catalog-internal, not §12.4
      * prose - spec 2026-07-20-warning-card-copy-restore §3.2).
      */
     triggerContext?: string | null;
     ```
     For each of the 39 codes: `helpfulContext` ← spec §4.2 inline column; add `triggerContext` ← popover column; set the 4 changed titles.
  2. Master spec §12.4 helpfulContext list (region near line 3230): replace the 36 registry-code lines with the §4.2 inline column; add three new lines for `FIELD_UNREADABLE`, `SECTION_HEADER_NO_FIELDS`, `UNKNOWN_SECTION_HEADER`. NEVER run prettier on the master spec.
  3. `pnpm gen:spec-codes`; stage the regenerated file.
  4. `AGENTS.md` "§12.4 catalog row edits" bullet — append: `Applies to warning-card codes too: a new warn-severity ParseWarning code also gets a WARNING_CARD_COPY_CODES row + copy per docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md §4.2.`

- [ ] **Step 6: Verify green.** `npx vitest run tests/messages/_metaWarningCardCopy.test.ts` PASS; `pnpm test:audit:x1-catalog-parity` PASS; `npx vitest run tests/messages` PASS; `pnpm typecheck` PASS.

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit --no-verify -m "feat(admin): warning-card copy sweep — condensed helpfulContext + triggerContext for 39 warn codes" \
  -m "Meta-test red run (pre-copy): <paste Step 4 failure summary>" \
  -m "Corpus frozen sets: fixtures=<8 files>; warn codes=<observed set>"
```

---

### Task 2: Adapter — inline guidance line + popover re-point

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx:63-145`
<!-- spec-lint: ignore — new test file created by this plan -->
- Test: `tests/admin/perShowActionableRenderControls.test.tsx` (extend), `tests/admin/perShowActionableTransitions.test.tsx` (NEW), `tests/parser/parseWarningDeepLinkRender.test.tsx` (re-point popover expectations)

**Interfaces:**
- Consumes: `MessageCatalogEntry.triggerContext` (Task 1), `renderEmphasis`, `CompactAlertCard` slots (unchanged), `isMessageCode`/`messageFor` (unchanged).
- Produces: exported pure helper `warningCardCopyFields(entry: { helpfulContext?: string | null; triggerContext?: string | null } | null): { guidance: string | null; trigger: string | null }`; DOM nodes `data-testid="per-show-actionable-title"` and `data-testid="per-show-actionable-guidance"` — Tasks 3-4 rely on both testids.

- [ ] **Step 1: Write failing tests.** In `tests/admin/perShowActionableRenderControls.test.tsx` (reuse its existing warning fixtures; derive all expectations from `MESSAGE_CATALOG`):

```tsx
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { warningCardCopyFields } from "@/components/admin/PerShowActionableWarnings";

describe("warningCardCopyFields guard matrix (spec §5)", () => {
  it.each([
    [null, null, null],
    [{ helpfulContext: null, triggerContext: null }, null, null],
    [{ helpfulContext: "", triggerContext: "" }, null, null],
    [{ helpfulContext: "   ", triggerContext: "   " }, null, null],
    [{}, null, null], // both fields absent
    [{ helpfulContext: "guide", triggerContext: "trig" }, "guide", "trig"],
    [{ helpfulContext: "guide", triggerContext: null }, "guide", null], // variant B: independent
    [{ helpfulContext: "guide" }, "guide", null], // variant B, trigger field absent
    [{ helpfulContext: null, triggerContext: "trig" }, null, "trig"], // variant C: independent
    [{ helpfulContext: "   ", triggerContext: "trig" }, null, "trig"], // whitespace-mixed
  ])("entry %j → guidance %j trigger %j", (entry, guidance, trigger) => {
    expect(warningCardCopyFields(entry as never)).toEqual({ guidance, trigger });
  });
});

it("renders condensed helpfulContext as the guidance line (spec §3.3)", () => {
  render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} />);
  const guidance = screen.getByTestId("per-show-actionable-guidance");
  expect(guidance.textContent).toBe(MESSAGE_CATALOG.UNKNOWN_FIELD.helpfulContext);
  expect(guidance.className).toContain("text-warning-text");
});

it("muted tone guidance carries text-text-subtle", () => {
  render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} tone="muted" />);
  expect(screen.getByTestId("per-show-actionable-guidance").className).toContain("text-text-subtle");
});

it("popover body renders triggerContext, scoped to the -body element, and not helpfulContext", () => {
  render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} />);
  const body = screen.getByTestId(/per-show-actionable-help-.*-body/);
  expect(body.textContent).toContain(MESSAGE_CATALOG.UNKNOWN_FIELD.triggerContext);
  expect(body.textContent).not.toContain(MESSAGE_CATALOG.UNKNOWN_FIELD.helpfulContext);
});

it("unknown code: no guidance node, no trigger, title falls back to human message", () => {
  render(
    <PerShowActionableWarnings
      items={[{ ...unknownFieldWarning, code: "NOT_A_CODE", message: "human text" }]}
      driveFileId={null}
    />,
  );
  expect(screen.queryByTestId("per-show-actionable-guidance")).toBeNull();
  expect(screen.queryByTestId(/per-show-actionable-help-.*-trigger/)).toBeNull();
  expect(screen.getByTestId("per-show-actionable-title").textContent).toBe("human text"); // §5 title fallback
});
```

<!-- spec-lint: ignore — new test file created by this plan -->
Also create `tests/admin/perShowActionableTransitions.test.tsx` (separate file because it MOCKS the catalog lookup module — the main suite must keep the real catalog). It authors, RED-FIRST, the full spec §6 variant/transition matrix:

<!-- spec-lint: ignore — new test file created by this plan -->

```tsx
// tests/admin/perShowActionableTransitions.test.tsx - spec §6 transition inventory pins.
// Mocks @/lib/messages/lookup so variants B (guidance-only) and C (trigger-only) are
// reachable: post-sweep, every real registry code carries BOTH fields, so the two
// independent-condition variants exist only for synthetic entries.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("@/lib/messages/lookup", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/messages/lookup")>();
  const SYNTH: Record<string, { title: string; helpfulContext: string | null; triggerContext: string | null }> = {
    SYN_B: { title: "B title", helpfulContext: "B guidance", triggerContext: null },
    SYN_C: { title: "C title", helpfulContext: null, triggerContext: "C trigger" },
    SYN_D: { title: "D title", helpfulContext: "D guidance", triggerContext: "D trigger" },
  };
  return {
    ...real,
    isMessageCode: (c: string) => c in SYNTH || real.isMessageCode(c),
    messageFor: (c: string) => (c in SYNTH ? { ...real.messageFor("UNKNOWN_FIELD" as never), ...SYNTH[c] } : real.messageFor(c as never)),
  };
});

const warn = (code: string): ParseWarning => ({
  severity: "warn",
  code,
  message: "human text",
  rawSnippet: null,
  blockRef: { kind: "client" },
} as unknown as ParseWarning);

const VARIANTS = {
  A: { code: "SYN_A", guidance: false, trigger: false }, // unknown code
  B: { code: "SYN_B", guidance: true, trigger: false },
  C: { code: "SYN_C", guidance: false, trigger: true },
  D: { code: "SYN_D", guidance: true, trigger: true },
} as const;

function expectVariant(v: keyof typeof VARIANTS) {
  const { guidance, trigger } = VARIANTS[v];
  expect(!!screen.queryByTestId("per-show-actionable-guidance"), `${v} guidance`).toBe(guidance);
  expect(!!screen.queryByTestId(/per-show-actionable-help-.*-trigger/), `${v} trigger`).toBe(trigger);
}

describe("transition inventory (spec §6): every pair instant, both directions", () => {
  const PAIRS: ReadonlyArray<readonly [keyof typeof VARIANTS, keyof typeof VARIANTS]> = [
    ["A", "B"], ["A", "C"], ["A", "D"], ["B", "C"], ["B", "D"], ["C", "D"],
  ];
  it.each(PAIRS)("%s↔%s swaps synchronously with no residue", (x, y) => {
    const { rerender } = render(<PerShowActionableWarnings items={[warn(VARIANTS[x].code)]} driveFileId={null} />);
    expectVariant(x);
    rerender(<PerShowActionableWarnings items={[warn(VARIANTS[y].code)]} driveFileId={null} />);
    expectVariant(y);
    rerender(<PerShowActionableWarnings items={[warn(VARIANTS[x].code)]} driveFileId={null} />);
    expectVariant(x);
  });

  it.each([["D", "B"], ["C", "A"]] as const)(
    "compound %s→%s: open popover unmounts with its trigger (spec §6)",
    async (from, to) => {
      const user = userEvent.setup();
      const { rerender } = render(<PerShowActionableWarnings items={[warn(VARIANTS[from].code)]} driveFileId={null} />);
      await user.click(screen.getByTestId(/per-show-actionable-help-.*-trigger/));
      expect(screen.getByTestId(/per-show-actionable-help-.*-body/).className).not.toContain("hidden");
      rerender(<PerShowActionableWarnings items={[warn(VARIANTS[to].code)]} driveFileId={null} />);
      expect(screen.queryByTestId(/per-show-actionable-help-.*-body/)).toBeNull();
      expect(screen.queryByTestId(/per-show-actionable-help-.*-trigger/)).toBeNull();
    },
  );

  it("adapter source declares no animation wrappers (instant contract)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/admin/PerShowActionableWarnings.tsx", "utf8");
    expect(src).not.toMatch(/AnimatePresence|framer-motion|motion\./);
  });
});
```

These are part of THIS task's red set: against pre-change code the guidance testid does not exist (B/D fail) and the popover carries helpfulContext semantics (C variant renders no trigger only after the re-point). Run red in Step 2, green after Step 3.

In `tests/parser/parseWarningDeepLinkRender.test.tsx`: grep the file for `helpfulContext` and re-point every popover-content assertion to `triggerContext` (keep assertions catalog-derived).

- [ ] **Step 2: Run red.** `npx vitest run tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx` — FAIL: `warningCardCopyFields` not exported; guidance testid absent; popover still helpfulContext; variant B/D transition cases fail on the missing guidance node.

- [ ] **Step 3: Implement.** In `PerShowActionableWarnings.tsx` — add above the component:

```tsx
/** Guard: spec §5 - empty/whitespace/absent copy fields render nothing. */
export function warningCardCopyFields(
  entry: { helpfulContext?: string | null; triggerContext?: string | null } | null,
): { guidance: string | null; trigger: string | null } {
  const pick = (v: string | null | undefined) =>
    typeof v === "string" && v.trim().length > 0 ? v : null;
  return { guidance: pick(entry?.helpfulContext), trigger: pick(entry?.triggerContext) };
}
```

Replace line 72 (`const context = entry?.helpfulContext ?? null;`) with:

```tsx
const { guidance, trigger: context } = warningCardCopyFields(entry);
```

Replace the `message` prop (line 126) with:

```tsx
message={
  <span className="flex min-w-0 flex-col gap-1">
    <span data-testid="per-show-actionable-title" className="text-text-strong">
      {renderEmphasis(title)}
    </span>
    {guidance ? (
      <span
        data-testid="per-show-actionable-guidance"
        className={`text-xs/relaxed font-normal ${tone === "muted" ? "text-text-subtle" : "text-warning-text"}`}
      >
        {renderEmphasis(guidance)}
      </span>
    ) : null}
  </span>
}
```

(`CompactAlertHelp` keeps its `helpfulContext` prop NAME; it now receives `context` = trigger copy. No other adapter change.)

- [ ] **Step 4: Verify green.** `npx vitest run tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/parser/parseWarningDeepLinkRender.test.tsx tests/admin tests/components` PASS; `pnpm typecheck` PASS.

- [ ] **Step 5: Commit.**

```bash
git add components/admin/PerShowActionableWarnings.tsx tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/parser/parseWarningDeepLinkRender.test.tsx
git commit --no-verify -m "feat(admin): inline guidance line on warning cards; popover shows trigger context"
```

---

### Task 3: Trigger geometry — browser-red-first `compactTrigger`

**Files:**
<!-- spec-lint: ignore — new test files created by this plan -->
- Create: `tests/components/admin/hoverHelpCompactTrigger.test.tsx`, `tests/e2e/_nextNavigationStub.ts`
- Modify: `components/admin/HoverHelp.tsx:60-105` and `components/admin/HoverHelp.tsx:194-201`; `components/admin/compactAlertHelp.tsx:104-136`; `tests/e2e/_compactAlertCardLiveEntry.tsx`; `tests/e2e/compact-alert-card-layout.spec.ts`; `tests/styles/status-token-contrast.test.ts`

**Interfaces:**
- Consumes: `data-testid="per-show-actionable-title"` / `-guidance` (Task 2); `makeItem` fixture shape (`tests/components/admin/review/attentionBanner.test.tsx:28-42`, copied); tokens at `app/globals.css:270-286, 320-335`.
- Produces: `HoverHelp` prop `compactTrigger?: boolean` (default false); harness mount containers `data-testid="mount-warning-card"` and `data-testid="mount-attention-banner"`; glyph node `data-testid="compact-help-glyph"`.

<!-- spec-lint: ignore — new test files created by this plan -->

- [ ] **Step 1: Author ALL failing tests first — jsdom.** `tests/components/admin/hoverHelpCompactTrigger.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HoverHelp } from "@/components/admin/HoverHelp";

describe("HoverHelp compactTrigger (spec §3.4)", () => {
  it("custom trigger without compactTrigger keeps the 44px box classes", () => {
    render(<HoverHelp label="Help: x" trigger={<span>badge</span>}>body</HoverHelp>);
    const btn = screen.getByTestId("hover-help-trigger");
    expect(btn.className).toContain("min-h-tap-min");
    expect(btn.className).toContain("min-w-tap-min");
  });

  it("compactTrigger swaps to the 22px box + overlay classes", () => {
    render(<HoverHelp label="Help: x" trigger={<span>?</span>} compactTrigger>body</HoverHelp>);
    const btn = screen.getByTestId("hover-help-trigger");
    expect(btn.className).toContain("size-[22px]");
    expect(btn.className).toContain("before:-inset-[11px]");
    expect(btn.className).not.toContain("min-h-tap-min");
  });
});

describe("unchanged custom-trigger callers never opt in (spec §7 regression pin)", () => {
  it.each([
    "components/admin/settings/DriveConnectionPanel.tsx",
    "components/admin/wizard/Step2Verify.tsx",
  ])("%s renders HoverHelp without compactTrigger", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("<HoverHelp");
    expect(src).not.toContain("compactTrigger");
  });
});
```

- [ ] **Step 2: Author ALL failing tests first — real browser.** Extend `_compactAlertCardLiveEntry.tsx` with two additional mounts (the harness never references `compactTrigger` — the prop stays internal to `CompactAlertHelp` after Step 4, so these fixtures compile against CURRENT code and the assertions run red before any implementation):
  - `<div data-testid="mount-warning-card">` mounting the REAL `PerShowActionableWarnings` with one warning: `{ severity: "warn", code: "UNKNOWN_FIELD", message: "Unrecognized CLIENT row label: 'Stage'", rawSnippet: "Stage | x", blockRef: { kind: "client", name: "Stage" } }` and `driveFileId={null}`.
  - `<div data-testid="mount-attention-banner">` mounting the REAL `AttentionBanner`. Full prop signature (`AttentionBanner.tsx:44-51`): `{ item, slug, now, highlighted, onResolved }`. Exact mount (fixture shape copied from `attentionBanner.test.tsx:28-56`; code = `USE_RAW_DECISION_STALE`, verified the ONLY doug-audience catalog code with non-null `helpfulContext`, so the trigger renders):

```tsx
<AttentionBanner
  item={{
    id: "alert:a1", kind: "alert", tone: "notice", sectionId: "crew", crewKey: null,
    actionable: true, menuTitle: "Use-raw decision stale", menuSubtitle: null,
    alert: {
      alertId: "a1", code: "USE_RAW_DECISION_STALE", template: "A saved use-raw decision went stale.",
      params: {}, action: null, helpHref: null, raisedAt: "2026-07-19T10:00:00Z",
      occurrenceCount: 1, autoClearNote: null, failedKeys: null, dataGaps: null,
    },
  }}
  slug="harness-show"
  now={new Date("2026-07-19T12:00:00Z")}
  highlighted={false}
  onResolved={() => {}}
/>
```

  (If `AttentionItem` gains fields, TypeScript fails the harness build loudly — the fixture is object-literal-typed, not `as`-cast.)
  - Create the stub module (path below):

<!-- spec-lint: ignore — new test files created by this plan -->

    ```ts
    export const usePathname = () => "/admin";
    export const useRouter = () => ({ refresh() {}, push() {} });
    export const useSearchParams = () => new URLSearchParams("");
    ```
    and add `"--alias:next/navigation=" + resolve(REPO_ROOT, "tests/e2e/_nextNavigationStub.ts")` to the esbuild argv in `compact-alert-card-layout.spec.ts` (bundling block around lines 60-80), plus `@source` entries for `components/admin/PerShowActionableWarnings.tsx` and `components/admin/review/AttentionBanner.tsx` in its Tailwind CSS step.

  In `compact-alert-card-layout.spec.ts` add (selectors scoped per mount — never page-global `.first()`):

```ts
for (const mount of ["mount-warning-card", "mount-attention-banner"] as const) {
  test(`compact trigger geometry - ${mount} (spec §3.4/§6/§7)`, async ({ page }) => {
    const scope = page.getByTestId(mount);
    const btn = scope.getByTestId(/-trigger$/);
    const box = (await btn.boundingBox())!;
    expect(Math.abs(box.width - 22)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(box.height - 22)).toBeLessThanOrEqual(TOL);
    const insets = await btn.evaluate((el) => {
      const s = getComputedStyle(el, "::before");
      return [s.top, s.right, s.bottom, s.left];
    });
    expect(insets).toEqual(["-11px", "-11px", "-11px", "-11px"]);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const PROBES: ReadonlyArray<readonly [number, number]> = [
      [-21.5, -21.5], [21.5, -21.5], [-21.5, 21.5], [21.5, 21.5],
    ];
    for (const [dx, dy] of PROBES) {
      const hit = await page.evaluate(
        ([x, y]: readonly [number, number]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("data-testid") ?? null,
        [cx + dx, cy + dy] as const,
      );
      expect(hit, `probe ${dx},${dy}`).toMatch(/-trigger$/);
    }
    const glyph = scope.getByTestId("compact-help-glyph");
    const gbox = (await glyph.boundingBox())!;
    expect(Math.abs(gbox.x + gbox.width / 2 - cx)).toBeLessThanOrEqual(1);
    expect(Math.abs(gbox.y + gbox.height / 2 - cy)).toBeLessThanOrEqual(1);
  });
}

test("trigger top-aligns with the title line WITH guidance rendered (spec §3.4)", async ({ page }) => {
  const scope = page.getByTestId("mount-warning-card");
  await expect(scope.getByTestId("per-show-actionable-guidance")).toBeVisible();
  const btn = (await scope.getByTestId(/-trigger$/).boundingBox())!;
  const title = (await scope.getByTestId("per-show-actionable-title").boundingBox())!;
  expect(Math.abs(btn.y - title.y)).toBeLessThanOrEqual(4);
});
```

- [ ] **Step 3: Run BOTH suites red against current code.**
  - `npx vitest run tests/components/admin/hoverHelpCompactTrigger.test.tsx` — FAIL on the compactTrigger case (prop unknown / classes absent). The no-prop case and both caller pins PASS (they pin current behavior).
  - `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/compact-alert-card-layout.spec.ts` — the new geometry tests FAIL against the shipped 44px box (width 44 ≠ 22, before-pseudo insets not -11px, `compact-help-glyph` missing). Pre-existing tests stay green. This red run proves the assertions catch the original defect — quote its failure lines in the commit body.

- [ ] **Step 4: Implement.**
  - `HoverHelp.tsx`: add prop `compactTrigger = false` with JSDoc `/** 22px visual box + 44px overlay hit area for compact card triggers (spec 2026-07-20-warning-card-copy-restore §3.4). */`. Custom-trigger button className becomes:

```tsx
className={
  compactTrigger
    ? "relative grid size-[22px] shrink-0 cursor-help place-items-center rounded-pill before:absolute before:-inset-[11px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
    : "inline-flex min-h-tap-min min-w-tap-min cursor-help items-center justify-center rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
}
```

  - `compactAlertHelp.tsx`: pass `compactTrigger` on the `HoverHelp` call; replace the trigger span (lines 125-132) so the BUTTON owns the box and the glyph is independently measurable:

```tsx
trigger={
  <span
    aria-hidden="true"
    className="pointer-events-none grid size-full place-items-center rounded-pill border border-warning-text text-xs font-bold text-warning-text transition-colors duration-fast hover:bg-warning-text/10"
  >
    <span data-testid="compact-help-glyph">?</span>
  </span>
}
```

  (Skin span fills the 22px button via `size-full`; the inner glyph span is the measured child, so the §6 centering proof targets the glyph itself, not a full-size wrapper.)

- [ ] **Step 5: Contrast pairs.** Extend `tests/styles/status-token-contrast.test.ts` with two rows in its existing pair-table shape: `["text-subtle", "surface-sunken"]` and `["warning-text", "warning-bg"]`, threshold 4.5, both themes. Expected ratios (spec §7): 6.09 / 6.94 / 8.79 / 9.64.

- [ ] **Step 6: Run everything green.** `npx vitest run tests/components tests/admin tests/styles tests/messages` PASS; `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/compact-alert-card-layout.spec.ts` PASS; `pnpm typecheck` PASS.

- [ ] **Step 7: Commit.**

```bash
git add components/admin/HoverHelp.tsx components/admin/compactAlertHelp.tsx tests/components/admin/hoverHelpCompactTrigger.test.tsx tests/e2e/_compactAlertCardLiveEntry.tsx tests/e2e/_nextNavigationStub.ts tests/e2e/compact-alert-card-layout.spec.ts tests/styles/status-token-contrast.test.ts
git commit --no-verify -m "feat(admin): compact 22px help trigger with overlay hit area; rendered geometry + contrast proofs" \
  -m "Browser red run against shipped 44px box: <paste Step 3 failure lines>"
```

---

### Task 4: Transition audit (spec §6 inventory — mandatory dedicated task; verification-only)

<!-- spec-lint: ignore — new test file created by this plan -->
The transition tests themselves were authored RED-FIRST in Task 2 (`tests/admin/perShowActionableTransitions.test.tsx`) to honor TDD-per-task — this task is the AUDIT: it verifies the shipped suite pins the full inventory and enumerates every conditional block, per the transition-audit rule.

**Inventory → test map (all six pairs + compound, from spec §6):**

| Pair | Treatment | Pinned by |
| --- | --- | --- |
| A↔B, A↔C, A↔D, B↔C, B↔D, C↔D | instant, both directions | `it.each(PAIRS)` round-trip cases |
| D→B compound (popover open, trigger removed) | instant unmount | compound `it.each` case 1 |
| C→A compound (popover open, trigger removed) | instant unmount | compound `it.each` case 2 |
| Popover open/close fade | untouched (`transition-discrete`, `HoverHelp.tsx` body) | source-scan + no HoverHelp body-class edits in the diff |

**Conditional-block enumeration (adapter, post-Task-2):** `guidance ? <span/> : null` (message stack); `context ? <CompactAlertHelp/> : null` (helpTrigger slot); `rowLabel ? detailBand : null`; `href ? footerLeft : null`; `renderItemControls` presence — the first two are the §6 variant axes (tested above); the last three are pre-existing #509 bands, unchanged in this diff. No `AnimatePresence`/ternary-animation wrappers anywhere in the adapter (source-scan test).

- [x] **Step 1: Verify the audit holds.** `npx vitest run tests/admin/perShowActionableTransitions.test.tsx` — PASS (these went red→green inside Task 2; a failure here is a Task 2/3 regression — fix there, not here). Confirm with `git diff origin/main -- components/admin/HoverHelp.tsx` that the popover body classes (fade) are untouched.
- [x] **Step 2: Commit the audit record.** The checked boxes in this plan are the task's tracked deliverable:

```bash
git add docs/superpowers/plans/2026-07-20-warning-card-copy-restore.md
git commit --no-verify -m "docs(plan): transition-audit verification pass (Task 4)"
```

---

### Task 5: Close-out gates

- [ ] Full local gates: `pnpm test` && `pnpm typecheck` && `pnpm lint` && `pnpm format:check` (full suite — scoped runs miss registry suites).
- [ ] Impeccable dual-gate on the UI diff (`/impeccable critique` then `/impeccable audit`, canonical v3 setup). P0/P1 fixed or `DEFERRED.md` entry.
- [ ] **Repair protocol for ANY review-driven code change (impeccable or Codex):** failing test first (extend the owning task's suite), minimal fix, suite green, then its own conventional commit (`fix(admin): <finding>` — one commit per finding batch, `--no-verify`); re-run the relevant gate after the fix lands. `git status --porcelain` MUST be empty before push — nothing reaches push/merge uncommitted.
- [ ] Whole-diff Codex review — ONE brief covering the ENTIRE diff (inlined; the cross-surface `triggerContext` contract between catalog, adapter, and rendered popover must be reviewed together — do not split), REVIEWER ONLY, fresh-eyes, iterate to APPROVE.
- [ ] Push; `gh pr create`; real CI green (`gh pr checks <PR#> --watch`, then confirm `mergeStateStatus` = CLEAN); `gh pr merge --merge`; ff-sync local main; verify `git rev-list --left-right --count main...origin/main` = `0  0`.

---

## Measured values (filled by Task 1 Step 3)

- `EXPECTED_CORPUS_FIXTURES` (measured 2026-07-20, 10 files): 2024-05-east-coast-family-office.md, 2025-03-dci-rpas-central.md, 2025-04-asset-mgmt-cfo-coo.md, 2025-05-redefining-fixed-income-private-credit.md, 2025-06-ria-investment-forum.md, 2025-10-consultants-roundtable.md, 2025-10-fixed-income-trading-summit.md, 2026-03-rpas-central-four-seasons.md, 2026-04-asset-mgmt-cfo-coo-waldorf.md, 2026-05-fintech-forum-cto-summit.md (two more than the spec-time count of 8 — sibling merges added fixtures; oracle freezes what exists)
- `EXPECTED_CORPUS_WARN_CODES` (measured 2026-07-20, 6 codes, all registered): AGENDA_BLOCK_UNRESOLVED, ROOM_HEADER_SPLIT_AMBIGUOUS, SECTION_HEADER_NO_FIELDS, STAGE_WORD_AUTOCORRECTED, UNKNOWN_FIELD, UNKNOWN_SECTION_HEADER

## Self-review notes

- Spec coverage: §3.1/§3.5 → T1; §3.2 → T1 S5; §3.3/§5 → T2 (guard matrix exhaustive via `warningCardCopyFields` unit); §3.4/§6/§7 geometry → T3 with browser red BEFORE implementation (S1-S3 precede S4); §4 → T1; §6 inventory → T4 dedicated task; §8 sequencing honored; AGENTS.md line → T1 S5.4; corpus sets recorded in-plan → T1 S3 + Measured values.
- Anti-tautology: adapter expectations catalog-derived; popover assertions body-scoped; glyph measurement targets the inner glyph span, never the full-size skin wrapper; corpus sets frozen as reviewed fixtures; caller pins are source-scans of the two named files.
- No execution-time conditionals: every file, export, fixture shape, command, and selector pre-verified (Pre-verified facts).
