/**
 * tests/notify/reportProblemLink.test.ts — BL-PUSH-NOTIFICATIONS residual.
 *
 * Every email-body-producing template carries a footer "Report a problem" link,
 * in BOTH channels of `RenderedEmail`: an anchor in `html` and a labeled URL in
 * `text`. The design memo's principle 6 wants a reporting affordance in every
 * push email; the ratified resize ships it as a NAVIGATIONAL entry point (spec
 * §2.2 item 2, §4 limit 6) — no new route, no new form, no `/api/report` change.
 *
 * THE ACCEPT-SET IS RENDER SHAPES × BODY CHANNELS, NOT SOURCE FILES (spec §2.2
 * item 3). Five exported entry points produce SEVEN distinct shapes, because
 * `renderRealtimeProblem` renders three discriminated `kind`s. A per-file sweep
 * would have covered four of the seven.
 *
 * Concrete failure modes these rows catch:
 *   - a batch path shipping without the link while its single-item sibling has
 *     it (the two batch renderers are separate code paths, not wrappers);
 *   - a plaintext body missing what the HTML carries (two independent string
 *     builders per template);
 *   - an off-origin link (href built from the wrong base).
 *
 * ANTI-TAUTOLOGY: every expected href is DERIVED from the fixture's own origin
 * and slug inputs, never written as a literal the implementation also hardcodes.
 */
import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import {
  renderAutoPublishUndo,
  renderAutoPublishUndoBatch,
} from "@/lib/notify/templates/autoPublishUndo";
import {
  renderRealtimeProblem,
  renderRealtimeProblemBatch,
  type RealtimeInput,
} from "@/lib/notify/templates/realtimeProblem";
import { renderDigest } from "@/lib/notify/templates/digest";

const ORIGIN = "https://fxav.example.test";
const SLUG = "asset-mgmt-cfo-coo-waldorf";
const OTHER_SLUG = "second-show-slug";

/** The visible link text, asserted verbatim. No em dash (DESIGN.md §9). */
const LABEL = "Report a problem";

/** Fixture-derived expectations — never a literal the implementation also holds. */
const showScopedHref = (origin: string, slug: string) => `${origin}/admin?show=${slug}`;
const dashboardHref = (origin: string) => `${origin}/admin`;

/**
 * Both channels carry the link. `html` gets an anchor whose visible text is the
 * label and whose href is exact; `text` gets the label and the same URL.
 */
function expectReportLink(rendered: { html: string; text: string }, expectedHref: string): void {
  expect(rendered.html, "html body must carry the Report a problem anchor").toContain(
    `<a href="${expectedHref}">${LABEL}</a>`,
  );
  // Label and URL are asserted as ONE bound value, never independently.
  // Asserting them separately was a real tautology: four shapes (digest,
  // realtime global/ingestion/batch) already carry "Open the dashboard:
  // ${origin}/admin" in their plaintext body, so a `toContain(expectedHref)`
  // row passed on that PRE-EXISTING line even with the report footer reduced to
  // a bare label. Those four tests stayed green against a broken footer.
  expect(rendered.text, "text body must carry the labeled report URL as one footer line").toContain(
    `${LABEL}: ${expectedHref}`,
  );
}

const undoShow = (slug: string, title: string) => ({
  slug,
  showTitle: title,
  showId: `show-${slug}`,
  token: `tok-${slug}`,
  mintId: `mint-${slug}`,
  expiresAt: new Date("2026-04-21T18:00:00Z"),
});

describe("Report a problem link — every render shape, both body channels", () => {
  test("shape 1: renderAutoPublishUndo (single show) links to the show modal", () => {
    const show = undoShow(SLUG, "Waldorf CFO/COO Summit");
    const rendered = renderAutoPublishUndo({
      origin: ORIGIN,
      recipient: "doug@example.test",
      now: new Date("2026-04-21T12:00:00Z"),
      ...show,
    });
    expectReportLink(rendered, showScopedHref(ORIGIN, show.slug));
  });

  test("shape 2: renderAutoPublishUndoBatch (multi-show) links to the dashboard", () => {
    const shows = [undoShow(SLUG, "Waldorf"), undoShow(OTHER_SLUG, "Second Show")];
    // A 1-item batch DELEGATES to renderAutoPublishUndo (autoPublishUndo.ts:101),
    // so a length-1 fixture would exercise the delegate and prove nothing about
    // the true multi-item body this row exists to cover.
    premise("batch fixture reaches the true multi-item body", shows.length, 1);
    const rendered = renderAutoPublishUndoBatch({
      origin: ORIGIN,
      recipient: "doug@example.test",
      now: new Date("2026-04-21T12:00:00Z"),
      shows,
    });
    expectReportLink(rendered, dashboardHref(ORIGIN));
  });

  test("shape 3: renderDigest links to the dashboard", () => {
    const rendered = renderDigest({
      origin: ORIGIN,
      shows: [{ showTitle: "Waldorf", slug: SLUG, items: ["a warning"] }],
    });
    expectReportLink(rendered, dashboardHref(ORIGIN));
  });

  test("shape 4: renderRealtimeProblem kind=show links to the show modal", () => {
    const input: RealtimeInput = {
      kind: "show",
      origin: ORIGIN,
      slug: SLUG,
      showTitle: "Waldorf",
      code: "SYNC_FILE_FAILED",
      contextSheetName: null,
    };
    premiseHolds("this row renders the show kind", input.kind === "show");
    expectReportLink(renderRealtimeProblem(input), showScopedHref(ORIGIN, SLUG));
  });

  test("shape 5: renderRealtimeProblem kind=global links to the dashboard", () => {
    const input: RealtimeInput = { kind: "global", origin: ORIGIN };
    premiseHolds("this row renders the global kind", input.kind === "global");
    expectReportLink(renderRealtimeProblem(input), dashboardHref(ORIGIN));
  });

  test("shape 6: renderRealtimeProblem kind=ingestion links to the dashboard", () => {
    const input: RealtimeInput = {
      kind: "ingestion",
      origin: ORIGIN,
      driveFileName: "II - New Show",
      lastErrorCode: null,
    };
    premiseHolds("this row renders the ingestion kind", input.kind === "ingestion");
    expectReportLink(renderRealtimeProblem(input), dashboardHref(ORIGIN));
  });

  test("shape 7: renderRealtimeProblemBatch (multi-member) links to the dashboard", () => {
    const members: RealtimeInput[] = [
      {
        kind: "show",
        origin: ORIGIN,
        slug: SLUG,
        showTitle: "Waldorf",
        code: "SYNC_FILE_FAILED",
        contextSheetName: null,
      },
      {
        kind: "show",
        origin: ORIGIN,
        slug: OTHER_SLUG,
        showTitle: "Second Show",
        code: "SYNC_FILE_FAILED",
        contextSheetName: null,
      },
    ];
    // Same delegation trap as shape 2 (realtimeProblem.ts:111).
    premise("batch fixture reaches the true multi-member body", members.length, 1);
    expectReportLink(
      renderRealtimeProblemBatch("sync_problems", ORIGIN, members),
      dashboardHref(ORIGIN),
    );
  });

  test("the link is on-origin in every shape (no off-origin report target)", () => {
    const rendered = renderRealtimeProblem({ kind: "global", origin: ORIGIN });
    const hrefs = [...rendered.html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]!);
    premise("the body carries at least one anchor to check", hrefs.length, 0);
    for (const href of hrefs) {
      expect(href.startsWith(ORIGIN), `every anchor stays on-origin: ${href}`).toBe(true);
    }
  });

  test("the new copy carries no em dash (DESIGN.md §9)", () => {
    const rendered = renderRealtimeProblem({ kind: "global", origin: ORIGIN });
    expect(LABEL).not.toContain("—");
    // The label as rendered, not just the constant.
    const idx = rendered.text.indexOf(LABEL);
    premise("the label is present so this assertion discriminates", idx, -1);
  });
});
