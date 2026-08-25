/**
 * tests/e2e/_pendingDiscardHarness.tsx
 *
 * Real-component mounting harness for the pending-discard button pair
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
 * effects (`useEffect`, timers) — those stay in the jsdom suite.
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
 *   320 — the dashboard Needs-attention rail. VERIFIED post-gutter: it is the `20rem`
 *         track of `grid-cols-[minmax(0,1fr)_20rem]` on `dashboard-split`
 *         (`components/admin/Dashboard.tsx:632`), and that grid sits INSIDE the padded
 *         layout container — so 320 is the column's own width, gutter already
 *         subtracted. This is why 320 needs no adjustment while the figure below does:
 *         one is a column inside the page, the other IS the page.
 *   358 — the mobile Needs-attention page at a 390px viewport MINUS the admin layout's
 *         16px `px-page-pad-mobile` per side (`app/admin/layout.tsx:191`). An earlier
 *         revision used 390 and so tested a card 32px wider than production, which hid
 *         that the idle pair has ~0.06px of real headroom there (R8 F1).
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
  IgnoreLabelStack,
  DISCARD_RESTING_CLASS,
} from "@/components/admin/PendingPanelDiscardButtons";

/* The label stack rendered by the component itself, in each state. Substituting one for
 * the other is exact — both sides come from the component, so the harness transcribes
 * nothing and cannot drift. R10: the stack is what reserves the width, so swapping it is
 * the whole difference the geometry tests care about. */
const IDLE_STACK = renderToStaticMarkup(<IgnoreLabelStack variant="idle" />);
const ARMED_STACK = renderToStaticMarkup(<IgnoreLabelStack variant="armed" />);
/** Which label variants a rendered stack leaves in the accessibility tree. Every stack
 *  CONTAINS every label — that is the whole point of the reservation — so asking whether
 *  the armed string appears is vacuous (R11 F1). The real question is which variant is
 *  shown, and `aria-hidden` is the marker that answers it in markup. */
function shownVariants(stack: string): string[] {
  return Array.from(stack.matchAll(/<span([^>]*)>/g))
    .map(([, attrs]) => attrs ?? "")
    .filter((attrs) => attrs.includes("data-ignore-label") && !attrs.includes("aria-hidden"))
    .map((attrs) => /data-ignore-label="([^"]+)"/.exec(attrs)?.[1] ?? "?");
}
{
  const idleShown = shownVariants(IDLE_STACK);
  const armedShown = shownVariants(ARMED_STACK);
  if (
    idleShown.join() !== "idle" ||
    armedShown.join() !== "armed" ||
    !ARMED_STACK.includes(IGNORE_ARMED_LABEL)
  ) {
    throw new Error(
      "IgnoreLabelStack must show exactly the requested variant and nothing else — got " +
        `idle=[${idleShown.join()}] armed=[${armedShown.join()}]. If it stops ` +
        "distinguishing the two, substituting one for the other is a no-op and every " +
        "armed panel is silently idle markup.",
    );
  }
}

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
  // `DISCARD_RESTING_CLASS` appears twice — Ignore and Defer share the idle skin — and
  // `String.replace` hits the FIRST occurrence. That is Ignore only because Ignore
  // happens to render first; if an identically styled control ever precedes it, the
  // class swap would arm the WRONG element while the label swap still found Ignore,
  // and a whole-document `includes()` check would not notice.
  const openTag = idle.indexOf(`data-testid="admin-pending-ignore-${INGESTION_ID}"`);
  if (openTag === -1) throw new Error("armed substitution: ignore button not found in markup");
  const tagStart = idle.lastIndexOf("<button", openTag);
  const tagEnd = idle.indexOf("</button>", openTag) + "</button>".length;
  const ignoreEl = idle.slice(tagStart, tagEnd);

  if (!ignoreEl.includes(IDLE_STACK)) {
    throw new Error(
      "armed substitution: the Ignore button does not contain the idle label stack, so " +
        "the component no longer renders through IgnoreLabelStack and the armed panels " +
        "would be idle markup",
    );
  }
  const armedEl = ignoreEl
    .replace(DISCARD_RESTING_CLASS, () => IGNORE_ARMED_CLASS)
    .replace(IDLE_STACK, () => ARMED_STACK);
  if (!armedEl.includes(IGNORE_ARMED_CLASS) || !armedEl.includes(ARMED_STACK)) {
    throw new Error(
      "armed substitution did not apply inside the Ignore button — the component no " +
        "longer renders through DISCARD_RESTING_CLASS / IgnoreLabelStack, so the armed " +
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

/** The class the big-text rails wrap themselves in. Scoped so a big-text panel cannot
 *  leak its font-size into the default-metric panels sharing the document. */
const BIG_TEXT_CLASS = "harness-big-text";

/** Wrap a rail so its Ignore labels render at `px` WITHOUT changing any rem-based
 *  length — the shape of Firefox text-only zoom and of a minimum-font-size setting.
 *
 *  Whole-diff R10 F1: the `min-w-ignore: 10rem` floor this replaced held the
 *  armed==idle width invariant only while every label stayed under it. Enlarge the text
 *  past the floor and the longer idle label escapes while the shorter armed label does
 *  not, so arming shrinks the island again and the R9 wrap transition returns. At 28px
 *  both labels clear the old 160px floor, so this rail FAILS against the floor and
 *  passes against the structural stack — which is what makes it a regression test and
 *  not a restatement. */
export function bigTextHtml(html: string, px: number): string {
  return (
    `<style>.${BIG_TEXT_CLASS} [data-ignore-label]{font-size:${px}px;line-height:1.1}</style>` +
    `<div class="${BIG_TEXT_CLASS}">${html}</div>`
  );
}

export type HarnessJson = Record<string, string>;

if (process.argv[1] && process.argv[1].endsWith("_pendingDiscardHarness.tsx")) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: tsx _pendingDiscardHarness.tsx <out.json>");
  const states: HarnessJson = {
    rail320: railHtml(320),
    rail320armed: armedHtml(320),
    page358: railHtml(358),
    page358armed: armedHtml(358),
    // 440 is the REGRESSION rail. Whole-diff R9 F1: with a shrinking armed label the
    // island un-wrapped from below "Retry now" to beside it here, moving the confirm
    // target dx +107.2px / dy -52px between the two taps. A constant-width Ignore
    // removes the transition; this rail is kept so it cannot come back unnoticed.
    band440: railHtml(440),
    band440armed: armedHtml(440),
    wide900: railHtml(900),
    wide900armed: armedHtml(900),
    // Same 440px regression rail, with the labels enlarged independently of layout
    // lengths. See bigTextHtml: this is the condition a min-width floor cannot survive.
    bigtext440: bigTextHtml(railHtml(440), 28),
    bigtext440armed: bigTextHtml(armedHtml(440), 28),
  };
  writeFileSync(out, JSON.stringify(states, null, 2));
}
