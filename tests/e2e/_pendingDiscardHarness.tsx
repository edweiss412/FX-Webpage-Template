/**
 * tests/e2e/_pendingDiscardHarness.tsx
 *
 * Real-component mounting harness for the pending-discard fork
 * (spec 2026-07-25-destruct-thumb-order-drift-guard §6.3).
 *
 * WHY THIS EXISTS. The sibling `pendingDiscardReflow.layout.spec.ts` transcribes
 * the component's classes into local string constants. Adversarial review rounds
 * 2 and 3 both landed on the same defect in that approach: a transcription can
 * satisfy every assertion while the SHIPPED component differs. The concrete case
 * is `w-full` on the `@container` root — load-bearing, because
 * `container-type: inline-size` collapses a shrink-to-fit flex item to 0px — yet
 * a transcribed panel supplies `w-full` from the harness, independently of the
 * component. Production could drop it and the whole suite would stay green.
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
          overflowCount: 0,
          now: new Date("2026-07-25T12:00:00.000Z"),
        }),
      ),
    ),
  );
}

export type HarnessJson = Record<string, string>;

if (process.argv[1] && process.argv[1].endsWith("_pendingDiscardHarness.tsx")) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: tsx _pendingDiscardHarness.tsx <out.json>");
  const states: HarnessJson = {
    rail320: railHtml(320),
    page390: railHtml(390),
    wide900: railHtml(900),
  };
  writeFileSync(out, JSON.stringify(states, null, 2));
}
