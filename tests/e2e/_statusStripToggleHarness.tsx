/**
 * tests/e2e/_statusStripToggleHarness.tsx (CASP-2 — spec §8.10)
 *
 * Static real-browser harness for the compact inline PublishedToggle inside the
 * StatusStrip. jsdom computes NO layout, so the mobile strip-height +
 * popover-containment invariants (CASP-2 §7/§8.10) MUST be measured end-to-end.
 * Modelled on _publishedReviewModalHarness.tsx: `tsx` runs this file's main-guard OUT
 * of process (its JSX + the imported real component tree break react-dom/server
 * under Playwright's test transform) and writes the rendered markup as JSON; the
 * spec compiles the token CSS, serves the markup, and measures rects at 390px.
 *
 * States emitted (spec §8.10):
 *   idle      — StatusStrip inline S1 (published, not finalize-owned): no popover.
 *   finalize  — StatusStrip inline S4 (finalizeOwned): the real in-flow finalize CHIP
 *               renders from the prop (no test-only forced-error path).
 *   card      — a strip-width row holding <PublishedToggle variant="card"> — the
 *               pre-CASP-2 baseline, for the compaction delta (height only). It mirrors
 *               the CURRENT strip container classes exactly (modal-header-reconciliation
 *               §6.5, Task 2), so the measured delta is the toggle's own weight and
 *               nothing else.
 *   errorProbe— the REAL <ErrorExplainer> + <HelpAffordance> for the long catalog
 *               row inside the full-width `inset-x-0 break-words` banner box (the
 *               width-governing classes the class-equality unit test pins on the real
 *               popover), so the error CONTENT is measured in-viewport, not just the
 *               finalize proxy.
 *
 * PublishedToggle calls useRouter(), so every render is wrapped in
 * AppRouterContext.Provider with a stub router (else renderToStaticMarkup throws
 * "invariant expected app router to be mounted"), plus ShareTokenProvider (token
 * null → the strip's copy-link is irrelevant to this geometry).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { StatusStrip, type StatusStripProps } from "@/components/admin/showpage/StatusStrip";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";

export const TOGGLE_SLUG = "casp2-toggle-show";

// modal-header-reconciliation §6.5 (Task 2): TOGGLE_TITLE / TOGGLE_LONG_TITLE and the
// `idleLong` / `finalizeLong` states are RETIRED. The strip no longer renders a title,
// so a long title cannot change where the toggle wraps — the long-title states became
// byte-identical to their short twins, i.e. assertions that could no longer fail for the
// reason they existed. No spec assertion consumed them (statusStripToggleLayout.spec.ts
// only ever read idleShort / finalizeShort / cardShort / errorProbe / liveShort).

const LONG_CODE = "PUBLISH_BLOCKED_PENDING_REVIEW"; // the long dougFacing catalog row (worst-case width)

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

const NOOP_OK = async () => ({ ok: true }) as const;

function stripProps(overrides: Partial<StatusStripProps> = {}): StatusStripProps {
  return {
    slug: TOGGLE_SLUG,
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: NOOP_OK,
    isLive: false,
    lastSyncedAt: "2026-05-02T12:00:00.000Z",
    lastCheckedAt: "2026-05-02T12:00:00.000Z",
    lastSyncStatus: "ok",
    now: new Date("2026-05-02T13:00:00.000Z"),
    alertCount: 0,
    ...overrides,
  };
}

/** Wrap any element in the router + share-token context the toggle needs. */
function wrap(node: React.ReactElement): React.ReactElement {
  return React.createElement(
    AppRouterContext.Provider,
    { value: stubRouter },
    // eslint-disable-next-line react/no-children-prop -- ShareTokenProvider types `children` as required; createElement's positional-children overload cannot satisfy it under this tsconfig.
    React.createElement(ShareTokenProvider, {
      initialToken: null,
      initialEpoch: 0,
      children: node,
    }),
  );
}

/** The real admin-layout document-flow shell so the window is the scroll container
 *  and the strip's `sticky top-0` behaves as in-app. */
function shell(inner: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(
      "div",
      {
        "data-testid": "admin-layout",
        className:
          "mx-auto max-w-[1600px] px-page-pad-mobile pt-page-pad-mobile pb-20 sm:px-page-pad-desktop sm:pt-page-pad-desktop min-[720px]:pb-page-pad-desktop",
      },
      inner,
    ),
  );
}

export function idleHtml(): string {
  return shell(wrap(React.createElement(StatusStrip, stripProps())));
}

export function finalizeHtml(): string {
  return shell(wrap(React.createElement(StatusStrip, stripProps({ finalizeOwned: true }))));
}

/** A published + LIVE strip (CASP2-4 item 2): renders the toggle, the control divider,
 *  and the live badge — the geometry that proves the divider separates control from signal
 *  at ≥sm and is `display:none` at 390px. */
export function liveHtml(): string {
  return shell(wrap(React.createElement(StatusStrip, stripProps({ isLive: true }))));
}

/** A strip-width row that swaps the inline toggle for the full card toggle — the
 *  pre-CASP-2 layout, for the compaction height delta. The container class string is
 *  the SAME literal StatusStrip.tsx now renders (modal-header-reconciliation §6.5) and
 *  there is no title node on either side, so the only height difference is the toggle's
 *  own weight (card box vs inline row) — which is precisely what invariant (b) measures. */
export function cardHtml(): string {
  const row = React.createElement(
    "div",
    {
      "data-testid": "show-status-strip",
      className: "flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap",
    },
    React.createElement(
      "div",
      { "data-testid": "strip-publish-toggle", className: "min-w-0 shrink-0" },
      React.createElement(PublishedToggle, {
        slug: TOGGLE_SLUG,
        variant: "card",
        published: true,
        finalizeOwned: false,
        setPublished: NOOP_OK,
      }),
    ),
  );
  return shell(wrap(row));
}

/** The REAL error-popover content in the width-governing box (spec §8.10d). */
export function errorProbeHtml(): string {
  const probe = React.createElement(
    "div",
    {
      "data-testid": "error-content-probe",
      className: "relative",
    },
    React.createElement(
      "div",
      {
        "data-testid": "error-content-probe-box",
        // Full-strip-width banner geometry (CASP2-2): inset-x-0 spans the positioned
        // parent's padding box; break-words caps long tokens vertically. No max-w cap.
        className: "absolute inset-x-0 top-full break-words rounded-sm p-2 text-sm",
      },
      React.createElement(ErrorExplainer, { code: LONG_CODE, surface: "admin" }),
      React.createElement(HelpAffordance, { code: LONG_CODE }),
    ),
  );
  return shell(wrap(probe));
}

/* Direct-execution entry: `tsx` runs THIS file and writes the rendered states as
 * JSON so the layout spec never imports the component tree. */
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _statusStripToggleHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify({
      slug: TOGGLE_SLUG,
      idleShort: idleHtml(),
      finalizeShort: finalizeHtml(),
      cardShort: cardHtml(),
      errorProbe: errorProbeHtml(),
      liveShort: liveHtml(),
    }),
  );
}
