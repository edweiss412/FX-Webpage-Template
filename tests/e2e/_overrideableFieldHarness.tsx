/**
 * tests/e2e/_overrideableFieldHarness.tsx (Task 16, Part A)
 *
 * Renders the REAL <OverrideableField> to static markup for the standalone
 * real-browser layout harness (spec §8.6 dimensional invariant). Precedent for
 * renderToStaticMarkup inside an e2e harness: tests/e2e/_step3ReviewModalHarness.tsx.
 *
 * SIMPLIFICATION vs the modal harness: OverrideableField imports only `useState`
 * (no `useRouter`), so NO AppRouterContext.Provider stub is needed — the element
 * tree is the bare component inside a fixed grid host.
 *
 * §8.6 context: the field sits in FieldRowList's grid row
 * (`grid-cols-[7.5rem_minmax(0,1fr)]`, step3ReviewSections.tsx:289). The value
 * cell (`minmax(0,1fr)`) must contain value + chip + affordance without
 * overflowing. The harness reproduces that grid: a label track (7.5rem) + a
 * `min-w-0` value cell (`data-testid="ovf-host"`) holding an ACTIVE override
 * with a LONG unbreakable value so the value span is maximally wide and the
 * flex-wrap chip is forced below it at narrow widths.
 *
 * Built with React.createElement, NOT JSX: Playwright's test transform rewrites
 * JSX in loaded .tsx into `__pw_type` payloads react-dom/server cannot render,
 * so this file runs via `node_modules/.bin/tsx` in the spec's beforeAll and
 * writes the rendered page as JSON (same mechanism as the modal harness).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OverrideableField } from "@/components/admin/overrides/OverrideableField";

/** A single UNBREAKABLE token (no spaces, no hyphens — hyphens are CSS
 *  soft-break opportunities), ~120 chars, so the value cell is maximally wide
 *  and MUST wrap (min-w-0 + wrap-break-word) rather than force horizontal
 *  scroll. Mirrors the modal harness's LONG_TITLE rationale. */
export const LONG_VALUE =
  "AcmeCapitalGlobalAssetManagementQuarterlyInvestorSummitStrategyOffsiteWaldorfAstoriaGrandBallroomEditionExtendedRoomA1B2C3";

/** The field element tree: the REAL <OverrideableField> in its ACTIVE-override
 *  state (value + "Overridden" chip + Edit/Revert), inside a faithful
 *  FieldRowList grid row. The value cell carries data-testid="ovf-host". */
function harnessElement(): React.ReactElement {
  return React.createElement(
    "div",
    {
      // Reproduce FieldRowList's row: 7.5rem label track + minmax(0,1fr) value
      // track. The value track must be able to shrink below its content
      // (minmax(0,1fr) + min-w-0) for the wrap invariant to hold.
      className: "grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-2",
    },
    React.createElement("span", { className: "text-sm text-text-subtle", key: "label" }, "Venue:"),
    React.createElement(
      "div",
      { "data-testid": "ovf-host", className: "min-w-0", key: "host" },
      React.createElement(OverrideableField, {
        driveFileId: "drive-harness-1",
        domain: "show",
        field: "venue",
        matchKey: "",
        currentValue: LONG_VALUE,
        expectedCurrentValue: LONG_VALUE,
        override: {
          overrideValue: LONG_VALUE,
          sheetValue: "Sheet Arena",
          active: true,
          deactivationCode: null,
          version: 1,
        },
        // Inert — static markup has no JS anyway (react-dom/server).
        onSave: async () => ({ ok: true as const, value: null }),
        disabled: false,
      }),
    ),
  );
}

export function renderHarnessHtml(): string {
  return renderToStaticMarkup(harnessElement());
}

/* Direct-execution entry (Task 16 Part A): Playwright's test transform breaks
 * react-dom/server on any imported JSX, so the layout spec shells out to
 * `node_modules/.bin/tsx` to run THIS file and writes { html }. The
 * `typeof module` guard mirrors _step3ReviewModalHarness.tsx. */
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _overrideableFieldHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(outPath, JSON.stringify({ html: renderHarnessHtml() }));
}
