/**
 * tests/e2e/_pendingDiscardHarness.tsx
 *
 * Real-component mounting harness for the pending-discard fork
 * (spec 2026-07-25-destruct-thumb-order-drift-guard §6.3).
 *
 * WHY THIS EXISTS. The sibling `pendingDiscardReflow.layout.spec.ts` transcribes the
 * component's classes into local constants, and a transcription can satisfy every
 * assertion while the SHIPPED component differs — adversarial review rounds 2 and 3
 * both landed on that. Rendering the real tree removes the gap: what is measured is
 * what ships.
 *
 * This harness renders the REAL `NeedsAttentionInbox` (which renders the REAL
 * `PendingPanelDiscardButtons` inside its real card padding, real action row, and
 * real `Retry now` sibling) via `renderToStaticMarkup`, so every class and every
 * nesting relationship measured downstream comes from the component tree itself.
 *
 * SCOPE, stated honestly: `renderToStaticMarkup` emits markup, not behaviour. This
 * harness proves CLASSES and LAYOUT of the shipped tree. It cannot prove client
 * effects (`useEffect`, `ResizeObserver`, timers) — those stay in the jsdom suite,
 * and the descoped focus transfer (`BL-DESTRUCT-FORK-FOCUS-TRANSFER`) remains
 * unproven by design.
 *
 * `PendingPanelDiscardButtons` calls `useRouter()`, so every render is wrapped in
 * AppRouterContext.Provider with a stub router; without it
 * `renderToStaticMarkup` throws "invariant expected app router to be mounted".
 *
 * Run OUT of process (its JSX + the real component tree break react-dom/server
 * under Playwright's transform):
 *   node_modules/.bin/tsx tests/e2e/_pendingDiscardHarness.tsx <out.json>
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

export const INGESTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

const pendingItem: NeedsAttentionItem = {
  variant: "pending_ingestion",
  key: `pending-${INGESTION_ID}`,
  id: INGESTION_ID,
  driveFileId: "drive-file-harness",
  driveFileName: "II - Riverside Arena - Nov 14.xlsx",
  copy: "We could not read this sheet, so no show was created.",
  activityAt: "2026-07-24T18:00:00.000Z",
};

function wrap(node: React.ReactElement): React.ReactElement {
  return React.createElement(AppRouterContext.Provider, { value: stubRouter }, node);
}

/**
 * The real inbox inside a fixed-width rail. `width` mirrors a live geometry:
 *   320 — the dashboard Needs-attention rail (`min-[1240px]:w-80`)
 *   390 — the mobile Needs-attention page
 *   900 — a full-width card on a mid-size viewport
 * The rail div carries ONLY a width; every other box, padding and class below it
 * comes from the real component tree.
 */
export function railHtml(width: number): string {
  return renderToStaticMarkup(
    React.createElement(
      "div",
      { "data-testid": "rail", style: { width: `${width}px` } },
      wrap(
        React.createElement(NeedsAttentionInbox, {
          items: [pendingItem],
          totalCount: 1,
          renderedCount: 1,
          overflowCount: 0,
          now: new Date("2026-07-25T12:00:00.000Z"),
        }),
      ),
    ),
  );
}

/** The armed skin + label, imported from the component so the harness cannot
 *  drift from it. The component exports these precisely so this harness needs no
 *  transcription — which is what removes the need for a binding meta-test. */
import {
  IGNORE_ARMED_CLASS,
  IGNORE_ARMED_LABEL,
  IGNORE_IDLE_CLASS,
  IGNORE_IDLE_LABEL,
} from "@/components/admin/PendingPanelDiscardButtons";

/** Same tree, with the Ignore button in its armed state, produced by substituting the
 *  component's OWN exported armed class + label into the rendered markup.
 *
 *  SCOPE, corrected after whole-diff review R1 F4: the premise "armed differs only by
 *  class and label" is NO LONGER true — the real armed render also fills the status
 *  region and mounts a consequence paragraph. This panel therefore proves the armed
 *  ROW's token geometry (widths, wrap, box origin), which is what D1/D3/D4 measure and
 *  what the paragraph below the row cannot affect. It does NOT prove the complete armed
 *  tree. If armed-only structure ever lands INSIDE the row, this substitution stops
 *  being representative and the panel must be replaced by a real armed render. */
export function armedHtml(width: number): string {
  const idle = railHtml(width);

  // Target the IGNORE BUTTON specifically rather than relying on position. R7 F3:
  // `IGNORE_IDLE_CLASS` appears twice — Ignore and Defer share the idle skin — and
  // `String.replace` hits the FIRST occurrence. That is Ignore only because Ignore
  // happens to render first; if an identically styled control ever precedes it, the
  // class swap would arm the WRONG element while the label swap still found Ignore,
  // and a whole-document `includes()` check would not notice.
  const openTag = idle.indexOf(`data-testid="admin-pending-ignore-${INGESTION_ID}"`);
  if (openTag === -1) throw new Error("armed substitution: ignore button not found in markup");
  const tagStart = idle.lastIndexOf("<button", openTag);
  const tagEnd = idle.indexOf("</button>", openTag) + "</button>".length;
  const ignoreEl = idle.slice(tagStart, tagEnd);

  const armedEl = ignoreEl
    .replace(IGNORE_IDLE_CLASS, IGNORE_ARMED_CLASS)
    .replace(`>${IGNORE_IDLE_LABEL}<`, `>${IGNORE_ARMED_LABEL}<`);
  if (!armedEl.includes(IGNORE_ARMED_CLASS) || !armedEl.includes(IGNORE_ARMED_LABEL)) {
    throw new Error(
      "armed substitution did not apply inside the Ignore button — the component no " +
        "longer renders through IGNORE_IDLE_CLASS / IGNORE_IDLE_LABEL, so the armed " +
        "panels would be idle markup and D4 would degrade to comparing idle with idle",
    );
  }
  const armed = idle.slice(0, tagStart) + armedEl + idle.slice(tagEnd);
  // Defer must be untouched: it shares the idle skin, so a positional slip would
  // silently restyle it instead.
  if (!armed.includes(`>${"Defer until modified"}<`)) {
    throw new Error("armed substitution disturbed the Defer button");
  }
  return armed;
}

export type HarnessJson = Record<string, string>;

if (process.argv[1] && process.argv[1].endsWith("_pendingDiscardHarness.tsx")) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: tsx _pendingDiscardHarness.tsx <out.json>");
  const states: HarnessJson = {
    rail320: railHtml(320),
    rail320armed: armedHtml(320),
    page390: railHtml(390),
    page390armed: armedHtml(390),
    wide900: railHtml(900),
    wide900armed: armedHtml(900),
  };
  writeFileSync(out, JSON.stringify(states, null, 2));
}
