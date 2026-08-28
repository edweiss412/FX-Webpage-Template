// @vitest-environment jsdom
/**
 * tests/components/a11y/newTabAnnouncementBehavior.test.tsx
 *
 * Behavioral coverage for spec 2026-07-25-newtab-announcement-family §7. The
 * structural guard (tests/styles/_metaNewTabAnnouncement.test.ts) proves an
 * announcement is PRESENT on every external anchor; these tests prove the
 * resulting accessible NAME is right, which no static check can do.
 *
 * Two things carry the weight here:
 *
 * 1. **The Group C negative cases.** Those four anchors are internal fragment
 *    or route links when `action.external` is false. An unconditional hint would
 *    announce a new tab on a same-page jump -- a false statement aimed at
 *    exactly the users who cannot see that it did not happen. These are the
 *    tests that catch the most likely wrong implementation.
 * 2. **Anchored name equality.** Assertions are anchored at both ends, because a
 *    substring match would happily pass "Open in Sheet(opens in a new tab)" --
 *    the missing-separator bug that already shipped undetected once in this
 *    codebase (see §3.1 and the regression pin in newTabHint.test.tsx).
 *
 * Group A/B anchors whose render fixtures already live in a dedicated suite are
 * asserted there rather than duplicated here (SourceLink,
 * PublishedReviewModal, Step3ReviewModal, step3ReviewSections, VenueMapTile).
 *
 * This file owns AttentionBanner's footer action, BellPanel's action cell, and
 * HealthAlertsPanel's row action. AttentionMenu left the family when upstream
 * turned it into a jump-only index. The remaining per-anchor names are carried
 * structurally by the AST guard, which R2 judged sufficient once corrected.
 */
import "@testing-library/jest-dom/vitest";

import { parse, scanSource, type Scan } from "@/tests/styles/_newTabScan";

import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JSX } from "react";

import { afterEach, describe, expect, test, vi } from "vitest";

import { BellActionRow } from "@/components/admin/BellPanel";
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import { HealthAlertRowItem } from "@/components/admin/telemetry/HealthAlertsPanel";
import {
  ModalSectionChrome,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import type { AttentionItem } from "@/lib/admin/attentionItems";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

const NOW = new Date("2026-07-19T12:00:00Z");

/** Minimal alert item carrying an action link, mirroring attentionBanner.test.tsx. */
function alertItem(
  action: { label: string; href: string; external: boolean } | null,
): AttentionItem {
  return {
    id: "alert:a1",
    kind: "alert",
    tone: "notice",
    sectionId: "crew",
    crewKey: null,
    actionable: true,
    menuTitle: "Role flags changed",
    menuSubtitle: "Crew · John Redcorn",
    alert: {
      alertId: "a1",
      code: "TEST_FAKE_CODE_FOR_BANNER",
      template: null,
      params: {},
      action,
      helpHref: null,
      raisedAt: NOW.toISOString(),
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
  } as AttentionItem;
}

afterEach(cleanup);

describe("Group C: the announcement is gated on action.external", () => {
  test("external action announces the new tab, anchored", () => {
    const { container } = render(
      <AttentionBanner
        item={alertItem({ label: "Open in Sheet", href: "https://x.example/s", external: true })}
        slug="demo"
        now={NOW}
        highlighted={false}
        onResolved={() => {}}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="attention-banner-action-a1"]',
    )!;
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute("target", "_blank");
    // Anchored: a substring match would pass the missing-separator bug.
    expect(link).toHaveAccessibleName("Open in Sheet (opens in a new tab)");
  });

  test("INTERNAL action must not claim to open a new tab", () => {
    // The highest-value test in this diff. external:false actions are same-app
    // links -- fragments like #share-access, or a route like /admin/onboarding.
    const { container } = render(
      <AttentionBanner
        item={alertItem({
          label: "Review sharing",
          href: "/admin?show=demo#share-access",
          external: false,
        })}
        slug="demo"
        now={NOW}
        highlighted={false}
        onResolved={() => {}}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="attention-banner-action-a1"]',
    )!;
    expect(link).toBeTruthy();
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveAccessibleName("Review sharing");
    // Belt and braces: the phrase must not appear anywhere in the subtree,
    // hidden or otherwise, so a future refactor cannot reintroduce it silently.
    expect(link.textContent ?? "").not.toContain("opens in a new tab");
  });

  test("no action link at all when the alert carries none", () => {
    const { container } = render(
      <AttentionBanner
        item={alertItem(null)}
        slug="demo"
        now={NOW}
        highlighted={false}
        onResolved={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="attention-banner-action-a1"]')).toBeNull();
    expect(container.textContent ?? "").not.toContain("opens in a new tab");
  });
});

// ── R2 HIGH 6: the three test blocks the whole-diff review judged load-bearing ──
// It explicitly judged the other 14 per-anchor assertions ritual once the scanner
// was corrected, and named these three as the ones carrying real risk: the two
// panels the AST rule cannot prove announce correctly at runtime, and the exact
// empty-interpolation outputs.

describe("BellPanel action anchors", () => {
  const entry = (external: boolean) =>
    ({
      alertId: "b1",
      code: "TEST_FAKE_CODE_FOR_BANNER",
      showId: null,
      slug: "demo",
      state: "active" as const,
      activityAt: NOW.toISOString(),
      resolvedAt: null,
      occurrences: 1,
      unread: false,
      context: null,
      actions: [
        {
          href: external ? "https://x.example/s" : "/admin?show=demo#share-access",
          label: "Open in Sheet",
          external,
        },
      ],
    }) as unknown as Parameters<typeof BellActionRow>[0]["entry"];

  test("external action announces the new tab", () => {
    const { container } = render(<BellActionRow entry={entry(true)} onRefetch={() => {}} />);
    const link = container.querySelector<HTMLAnchorElement>('[data-testid="bell-action-b1-0"]')!;
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAccessibleName("Open in Sheet (opens in a new tab)");
  });

  test("INTERNAL action does not claim to open a new tab", () => {
    const { container } = render(<BellActionRow entry={entry(false)} onRefetch={() => {}} />);
    const link = container.querySelector<HTMLAnchorElement>('[data-testid="bell-action-b1-0"]')!;
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveAccessibleName("Open in Sheet");
    expect(link.textContent ?? "").not.toContain("opens in a new tab");
  });
});

describe("HealthAlertsPanel action anchors", () => {
  // SHEET_UNAVAILABLE maps to the openSheet builder, which needs
  // context.drive_file_id (NOT sheet_url) -- lib/adminAlerts/alertActions.ts:78.
  // Getting that wrong is exactly why this test asserts the anchor EXISTS: the
  // first draft guarded the assertion behind an `if` and passed vacuously while
  // the action never resolved.
  const row = (over: Record<string, unknown>) =>
    ({
      id: "h1",
      code: "SHEET_UNAVAILABLE",
      show_id: null,
      slug: "demo",
      context: {},
      occurrence_count: 1,
      raised_at: NOW.toISOString(),
      identityText: null,
      ...over,
    }) as unknown as Parameters<typeof HealthAlertRowItem>[0]["row"];

  test("external action announces the new tab", () => {
    const { container } = render(
      <HealthAlertRowItem
        row={row({ context: { drive_file_id: "drive-abc-123" } })}
        weight="degraded"
        now={NOW}
      />,
    );
    // Asserted to EXIST, not guarded behind an if: a conditional assertion here
    // would pass vacuously whenever the action failed to resolve.
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="health-alert-action-h1"]',
    );
    expect(link, "the external action anchor must render").not.toBeNull();
    expect(link!).toHaveAttribute("target", "_blank");
    // EXACT, not `.toContain("opens in a new tab")`. Containment passes when the
    // label is gone entirely (name == "(opens in a new tab)") or when the
    // separator is gone ("Open in Sheet(opens in a new tab)") -- the two failures
    // most likely to reach a user, both of which leave the announcement present.
    expect(link!).toHaveAccessibleName("Open in Sheet (opens in a new tab)");
  });

  test("a resolving INTERNAL action renders an anchor that does NOT announce", () => {
    // The unresolved-action case below cannot see the dangerous direction: with no
    // anchor at all, an unconditionally-rendered hint would still pass. This case
    // renders a REAL same-tab action (WIZARD_SESSION_SUPERSEDED_RACE always
    // resolves and is `external: false`), so the anchor exists and its name must
    // stay clean.
    const { container } = render(
      <HealthAlertRowItem
        row={row({ code: "WIZARD_SESSION_SUPERSEDED_RACE" })}
        weight="degraded"
        now={NOW}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="health-alert-action-h1"]',
    );
    expect(link, "the internal action anchor must render").not.toBeNull();
    expect(link!).not.toHaveAttribute("target", "_blank");
    expect(link!).toHaveAccessibleName("Go to setup wizard");
  });

  test("no action resolves without its context field, and nothing claims a new tab", () => {
    const { container } = render(
      <HealthAlertRowItem row={row({ context: {} })} weight="degraded" now={NOW} />,
    );
    expect(container.querySelector('[data-testid="health-alert-action-h1"]')).toBeNull();
    expect(container.textContent ?? "").not.toContain("opens in a new tab");
  });
});

describe("the section-chrome sheet link renders its real fallback for an empty label", () => {
  // R5 BLOCKING 4: this seam had NO rendering coverage — the probe below covers the
  // two modal labels, but the chrome label reaches its anchor through an exported
  // context, so the real component can and must be rendered.
  const chrome = (label: string): Step3SectionChrome =>
    ({
      Icon: (() => null) as never,
      label,
      flagged: false,
      dfid: "drive-abc-123",
      sectionId: "crew",
      sheetUrl: "https://docs.google.com/spreadsheets/d/drive-abc-123/edit",
    }) as unknown as Step3SectionChrome;

  test("empty label keeps the destination clause, with no dangling connective", () => {
    const { container } = render(
      <ModalSectionChrome chrome={chrome("")} count={null}>
        <span>body</span>
      </ModalSectionChrome>,
    );
    const link = container.querySelector<HTMLAnchorElement>('a[data-testid$="-sheetlink"]');
    expect(link, "the sheet link must render").not.toBeNull();
    // Phrasing is the ONE canonical form all sheet links share (sheet-icon-link
    // spec §3, closing item 4's three-phrasings drift): with no visible words,
    // WCAG 2.5.3 label-in-name does not constrain the label, and it names the
    // destination app like its modal-title siblings always did.
    expect(link!).toHaveAccessibleName(
      "Open the source sheet in Google Sheets (opens in a new tab)",
    );
  });

  test("a real label interpolates and keeps the suffix", () => {
    const { container } = render(
      <ModalSectionChrome chrome={chrome("Crew")} count={null}>
        <span>body</span>
      </ModalSectionChrome>,
    );
    expect(
      container.querySelector<HTMLAnchorElement>('a[data-testid$="-sheetlink"]')!,
    ).toHaveAccessibleName("Open the source sheet for Crew in Google Sheets (opens in a new tab)");
  });
});

// The empty-interpolation fallbacks used to be asserted here against a local
// `ModalSheetLinkProbe` that re-implemented the two modals' aria-label expression.
// A reviewer called that out and was right: re-implementing the expression tests the
// re-implementation, and the probe's expectations turned out to be WRONG about both
// real components. Each substitutes a fallback title BEFORE the label expression runs
// -- Step3ReviewModal takes a filename-derived title, PublishedReviewModal takes the
// slug -- so an empty title interpolates that substitute rather than reaching the
// generic arm the probe asserted. None of the wiring that produces those substitutes
// existed in the probe, so nothing could have caught it here.
//
// The assertions now live with the components that actually render them:
//   tests/components/admin/wizard/Step3ReviewModal.test.tsx  ("sheet deep-link accessible name")
//   tests/components/admin/showpage/publishedReviewModal.test.tsx
// Both use the real render harness, so the substitution is exercised rather than assumed.
describe("what the harness itself does and does not model (R23/R24)", () => {
  // MEASURED, and pinned so it cannot drift silently. The static guard treats several shapes
  // as hiding; this records which of them THIS harness agrees about. The disagreements are
  // expected -- jsdom performs no rendering -- and the point of pinning them is that the
  // guard's extra strictness is a deliberate, documented gap rather than a bug someone
  // "fixes" later by relaxing the guard to match the harness.
  const Hint = (): React.ReactElement => <span className="sr-only">(opens in a new tab)</span>;

  test("agrees that aria-hidden, <template> and {true} remove content from the name", () => {
    const cases: [string, () => React.ReactElement, string][] = [
      [
        "aria-hidden label",
        () => (
          <a href="x" target="_blank">
            <span aria-hidden="true">Go</span> <Hint />
          </a>
        ),
        "(opens in a new tab)",
      ],
      [
        "template label",
        () => (
          <a href="x" target="_blank">
            <template>Go</template> <Hint />
          </a>
        ),
        "(opens in a new tab)",
      ],
      [
        "{true} contributes nothing, {0} does",
        () => (
          <a href="x" target="_blank">
            {0} <Hint />
          </a>
        ),
        "0 (opens in a new tab)",
      ],
      [
        "visible label",
        () => (
          <a href="x" target="_blank">
            <span>Go</span> <Hint />
          </a>
        ),
        "Go (opens in a new tab)",
      ],
    ];
    for (const [label, jsx, expected] of cases) {
      const { container, unmount } = render(jsx());
      expect(container.querySelector("a"), label).toHaveAccessibleName(expected);
      unmount();
    }
  });

  test("the PREMISE of the casing rule: React normalises attribute-name case", () => {
    // The entire behavioural casing sweep rests on this, and it was asserted only in spec prose
    // until now. If React DROPPED a non-lowercase attribute instead of normalising it, then
    // `TARGET="_blank"` would not open a tab, `ARIA-HIDDEN` would not hide, and the casing rule
    // would be guarding nothing. Measured, it normalises:
    //
    //   TARGET="_blank"      -> target="_blank"       the tab really opens
    //   ARIA-HIDDEN="true"   -> aria-hidden="true"    the hint really is hidden
    //
    // Two rounds of this PR were spent on claims about behaviour that turned out to be wrong
    // (a hand-curated "from the spec" tag list, and `<title>` being impossible inside an anchor),
    // so the load-bearing premises are measured rather than argued.
    const upperTarget = { href: "x", TARGET: "_blank" } as unknown as Record<string, never>;
    const { container: c1, unmount: u1 } = render(<a {...upperTarget}>Go</a>);
    expect(c1.querySelector("a")?.getAttribute("target"), "TARGET normalises to target").toBe(
      "_blank",
    );
    u1();

    const upperAriaHidden = { "ARIA-HIDDEN": "true" } as unknown as Record<string, never>;
    const { container: c2, unmount: u2 } = render(
      <a href="x" target="_blank">
        Go{" "}
        <span {...upperAriaHidden}>
          <Hint />
        </span>
      </a>,
    );
    expect(
      c2.querySelector("a"),
      "ARIA-HIDDEN really hides, so the announcement is lost",
    ).toHaveAccessibleName("Go");
    u2();
  });

  test("R31 premises: which attribute VALUES React omits, and the two <title> namespaces", () => {
    // Every rule R31 changed rests on a fact about React or AccName rather than about the AST, so
    // each one is measured here and the scanner cites this test. Four of the eight R31 findings
    // were the guard disagreeing with runtime in the SAFE-LOOKING direction -- reporting valid
    // markup -- which is how a guard earns the exemptions that eventually hollow it out.
    // Each case wraps the hint in a span carrying one attribute VALUE the scanner used to read as
    // hiding. `never` casts throughout: these are values React's types reject and runtime accepts,
    // which is exactly the gap the guard has to model.
    const asProps = (p: Record<string, unknown>): Record<string, never> =>
      p as Record<string, never>;
    const visible: Array<[string, Record<string, never>]> = [
      // React OMITS a falsy attribute value entirely, so the announcement is fully visible.
      ["hidden={undefined}", asProps({ hidden: undefined })],
      ["hidden={null}", asProps({ hidden: null })],
      ["hidden={0}", asProps({ hidden: 0 })],
      ['hidden={""}', asProps({ hidden: "" })],
      ["popover={false}", asProps({ popover: false })],
      ["popover={undefined}", asProps({ popover: undefined })],
      ["inert={undefined}", asProps({ inert: undefined })],
      ["aria-hidden={undefined}", asProps({ "aria-hidden": undefined })],
      ["aria-hidden={null}", asProps({ "aria-hidden": null })],
      // NOT omitted -- React renders aria-hidden="0" -- but ARIA hides only on "true", so the
      // element stays in the name. This is why aria-hidden keeps its own branch in the scanner.
      ["aria-hidden={0}", asProps({ "aria-hidden": 0 })],
    ];
    for (const [label, props] of visible) {
      const { container, unmount } = render(
        <a href="x" target="_blank">
          Go{" "}
          <span {...props}>
            <Hint />
          </span>
        </a>,
      );
      expect(
        container.querySelector("a"),
        `${label}: the attribute is omitted or does not hide, so the announcement is in the name`,
      ).toHaveAccessibleName("Go (opens in a new tab)");
      unmount();
    }

    // R32: `popover` is an ENUMERATED attribute, not a boolean one. React PRESERVES every string and
    // number -- empty string included -- and each of those starts the element hidden; it OMITS the
    // booleans, and bare `<span popover>` IS `popover={true}`. Reading it as boolean was wrong in
    // both directions at once.
    for (const [label, props, expected] of [
      ["popover=''", { popover: "" }, "Go"],
      ["popover={0}", { popover: 0 }, "Go"],
      ["popover={1}", { popover: 1 }, "Go"],
      ['popover="auto"', { popover: "auto" }, "Go"],
      ['popover="bogus"', { popover: "bogus" }, "Go"],
      ["popover={true}", { popover: true }, "Go (opens in a new tab)"],
      ["bare popover", { popover: true }, "Go (opens in a new tab)"],
    ] as [string, Record<string, unknown>, string][]) {
      const { container, unmount } = render(
        <a href="x" target="_blank">
          Go{" "}
          <span {...(props as Record<string, never>)}>
            <Hint />
          </span>
        </a>,
      );
      expect(container.querySelector("a"), label).toHaveAccessibleName(expected);
      unmount();
    }

    // R32: the three falsy values that are not plain literals. React omits the attribute for each.
    for (const [label, props] of [
      ["hidden={-0}", { hidden: -0 }],
      ["hidden={NaN}", { hidden: NaN }],
      ["hidden={0n}", { hidden: BigInt(0) }],
      ["inert={-0}", { inert: -0 }],
      ["inert={NaN}", { inert: NaN }],
      ["inert={0n}", { inert: BigInt(0) }],
    ] as [string, Record<string, unknown>][]) {
      const { container, unmount } = render(
        <a href="x" target="_blank">
          Go{" "}
          <span {...(props as Record<string, never>)}>
            <Hint />
          </span>
        </a>,
      );
      expect(container.querySelector("a"), label).toHaveAccessibleName("Go (opens in a new tab)");
      unmount();
    }

    // R32: a template SUBSTITUTION reaches the DOM, so the value has to be evaluated, not matched.
    for (const [label, value, expected] of [
      ["`${true}`", `${true}`, "Go"],
      ['`tr${"ue"}`', `tr${"ue"}`, "Go"],
      ["`true${false}`", `true${false}`, "Go (opens in a new tab)"],
    ] as [string, string, string][]) {
      const { container, unmount } = render(
        <a href="x" target="_blank">
          Go{" "}
          <span aria-hidden={value as "true" | "false"}>
            <Hint />
          </span>
        </a>,
      );
      expect(container.querySelector("a"), `aria-hidden={${label}}`).toHaveAccessibleName(expected);
      unmount();
    }

    // R32: style values behind a literal conditional or a template still reach the DOM. The COMMA
    // case `display: (0, "none")` is pinned in the scanner suite instead of here: it is a
    // source-level shape, and tsc rejects a bare comma expression outright (TS2695), so it cannot be
    // written in this file. What it relies on is JS evaluation order, not React behaviour.
    for (const [label, style] of [
      ["literal conditional", { display: true ? "none" : "block" } as const],
      ["template", { visibility: `hid${"den"}` as "hidden" }],
    ] as [string, React.CSSProperties][]) {
      const { container, unmount } = render(
        <a href="x" target="_blank">
          <span style={style}>Go</span> <Hint />
        </a>,
      );
      expect(container.querySelector("a"), `style ${label}`).toHaveAccessibleName(
        "(opens in a new tab)",
      );
      unmount();
    }

    // `visibility: collapse` is a FOURTH stricter-than-harness case, alongside `noscript`, `inert`
    // and the aria-hidden case-fold. Per CSS, `collapse` on a non-table element is treated as
    // `hidden`, so a real browser removes the subtree from the accessibility tree. Measured here,
    // dom-accessibility-api special-cases the inline `visibility:hidden` string and does NOT
    // recognise `collapse`, so the harness still sees the text. The scanner follows the browser.
    const collapse = render(
      <a href="x" target="_blank">
        <span style={{ visibility: "collapse" }}>Go</span> <Hint />
      </a>,
    );
    expect(
      collapse.container.querySelector("a"),
      "harness does NOT model visibility:collapse -- the scanner is deliberately stricter",
    ).toHaveAccessibleName("Go (opens in a new tab)");
    collapse.unmount();

    const hiddenVis = render(
      <a href="x" target="_blank">
        <span style={{ visibility: "hidden" }}>Go</span> <Hint />
      </a>,
    );
    expect(
      hiddenVis.container.querySelector("a"),
      "the harness DOES model visibility:hidden, which is why the two disagree",
    ).toHaveAccessibleName("(opens in a new tab)");
    hiddenVis.unmount();

    // The aria-hidden VALUE table. Both installed AccName versions agree, and only the EXACT,
    // untrimmed, lowercase "true" hides. The scanner folds case and trims, so it is deliberately
    // STRICTER than this harness on "TRUE" / " true " -- browsers may fold an enumerated ARIA value
    // where dom-accessibility-api does not, and a silently unannounced link costs more than a
    // reported valid one. Both sides of that divergence are pinned: this test measures the harness,
    // and the scanner suite asserts the guard reports the folded spellings.
    for (const [value, expected] of [
      ["true", "Go"],
      ["TRUE", "Go (opens in a new tab)"],
      ["True", "Go (opens in a new tab)"],
      [" true ", "Go (opens in a new tab)"],
      ["false", "Go (opens in a new tab)"],
      ["FALSE", "Go (opens in a new tab)"],
    ] as [string, string][]) {
      const { container, unmount } = render(
        <a href="x" target="_blank">
          Go{" "}
          <span aria-hidden={value as "true" | "false"}>
            <Hint />
          </span>
        </a>,
      );
      expect(container.querySelector("a"), `aria-hidden="${value}"`).toHaveAccessibleName(expected);
      unmount();
    }

    // `<title>` is TWO elements, and the namespace decides. React hoists the HTML one out of the
    // anchor; the SVG one stays put and NAMES the graphic.
    const svgTitle = render(
      <a href="x" target="_blank">
        <svg>
          <title>Go</title>
        </svg>{" "}
        <Hint />
      </a>,
    );
    expect(
      svgTitle.container.querySelector("a"),
      "an SVG <title> renders in place and names the link",
    ).toHaveAccessibleName("Go (opens in a new tab)");
    svgTitle.unmount();

    // ...and ONLY as the svg's DIRECT child. Per SVG-AAM an <svg> is named by its own direct-child
    // <title>; a deeper one names its nearest graphics container instead, which is not the anchor's
    // name. Treating any <svg> ancestor as enough was a fail-OPEN hole in the first R31 fix.
    const deepTitle = render(
      <a href="x" target="_blank">
        <svg>
          <g>
            <title>Go</title>
          </g>
        </svg>{" "}
        <Hint />
      </a>,
    );
    expect(
      deepTitle.container.querySelector("a"),
      "an SVG <title> under a <g> names the group, not the link",
    ).toHaveAccessibleName("(opens in a new tab)");
    deepTitle.unmount();

    // Inside a <foreignObject> the content is HTML again, so React hoists the title away.
    const foTitle = render(
      <a href="x" target="_blank">
        <svg>
          <foreignObject>
            <title>Go</title>
          </foreignObject>
        </svg>{" "}
        <Hint />
      </a>,
    );
    expect(
      foTitle.container.querySelector("a"),
      "a <title> inside foreignObject is hoisted out and names nothing",
    ).toHaveAccessibleName("(opens in a new tab)");
    foTitle.unmount();

    // An expression container holding JSX renders byte-identically to the same element written as a
    // direct child -- the premise for inspecting it instead of treating it as opaque.
    const direct = renderToStaticMarkup(
      <a href="x" target="_blank">
        <span aria-hidden="true">Go</span> <Hint />
      </a>,
    );
    const wrapped = renderToStaticMarkup(
      <a href="x" target="_blank">
        {<span aria-hidden="true">Go</span>} <Hint />
      </a>,
    );
    expect(wrapped, "{<el/>} and <el/> render the same HTML").toBe(direct);

    // aria-labelledby OUTRANKS aria-label -- and falls back to it when the reference dangles, so
    // identical source has two possible names and the guard cannot decide either.
    const target = document.createElement("span");
    target.id = "r31-target";
    target.textContent = "Go";
    document.body.appendChild(target);
    const both = render(
      <a href="x" target="_blank" aria-label="Go (opens in a new tab)" aria-labelledby="r31-target">
        Go
      </a>,
    );
    expect(
      both.container.querySelector("a"),
      "a resolvable aria-labelledby wins, and the announcement in aria-label is never read",
    ).toHaveAccessibleName("Go");
    both.unmount();
    target.remove();

    const dangling = render(
      <a href="x" target="_blank" aria-label="Go (opens in a new tab)" aria-labelledby="r31-absent">
        Go
      </a>,
    );
    expect(
      dangling.container.querySelector("a"),
      "a dangling aria-labelledby falls back to aria-label, so BOTH outcomes are reachable",
    ).toHaveAccessibleName("Go (opens in a new tab)");
    dangling.unmount();
  });

  test("the hidden / aria-hidden VALUE rules, measured -- note the asymmetry", () => {
    // These rules date from R1 HIGH 4 and R2 HIGH 4 and were justified in prose for 25 rounds
    // without ever being measured. They are all correct, and the ASYMMETRY is the point:
    // `aria-hidden="false"` is VISIBLE, but `hidden="false"` HIDES, because a non-empty string
    // is truthy for a native boolean attribute and React renders `hidden=""`. Anyone
    // "simplifying" these two to one rule reintroduces a real defect, so the measurement is
    // pinned rather than left as a comment.
    const cases: [string, () => React.ReactElement, string][] = [
      [
        'aria-hidden="true" hides',
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <span aria-hidden="true">
              <Hint />
            </span>
          </a>
        ),
        "Go",
      ],
      [
        'aria-hidden="false" is VISIBLE',
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <span aria-hidden="false">
              <Hint />
            </span>
          </a>
        ),
        "Go (opens in a new tab)",
      ],
      [
        "bare hidden hides",
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <span hidden>
              <Hint />
            </span>
          </a>
        ),
        "Go",
      ],
      [
        "hidden={false} is VISIBLE",
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <span hidden={false}>
              <Hint />
            </span>
          </a>
        ),
        "Go (opens in a new tab)",
      ],
      [
        'hidden={"false"} HIDES -- the asymmetry',
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <span hidden={"false" as unknown as boolean}>
              <Hint />
            </span>
          </a>
        ),
        "Go",
      ],
      [
        "inline display:none hides",
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <span style={{ display: "none" }}>
              <Hint />
            </span>
          </a>
        ),
        "Go",
      ],
    ];
    for (const [label, jsx, expected] of cases) {
      const { container, unmount } = render(jsx());
      expect(container.querySelector("a"), label).toHaveAccessibleName(expected);
      unmount();
    }
  });

  test("void metadata elements THROW on children, so they can never carry a label", () => {
    // Measured, and it retires a guess. The non-rendered tag set excludes `link`, `meta`, `base`
    // and `area` — earlier justified as "cannot meaningfully occur inside an anchor", which is the
    // same hand-waving that got `<title>` wrong. The real reason is stronger: React refuses to
    // render them with children at all, so none can ever hold a text label.
    for (const tag of ["link", "meta", "base", "area"]) {
      const El = tag as unknown as React.ElementType;
      expect(
        () =>
          renderToStaticMarkup(
            <a href="x" target="_blank">
              <El>Go</El> <Hint />
            </a>,
          ),
        `${tag} must refuse children`,
      ).toThrow(/self-closing/);
    }
    // And `<title>` really is hoisted OUT of the anchor, which is why it IS in the set.
    const hoisted = renderToStaticMarkup(
      <a href="x" target="_blank">
        <title>Go</title> <Hint />
      </a>,
    );
    expect(hoisted.startsWith("<title>Go</title><a"), "title is hoisted out of the anchor").toBe(
      true,
    );
  });

  test("does NOT model inert or a closed <details>, so only the static guard catches those", () => {
    // The HTML Standard says inert subtrees are not exposed to accessibility APIs and closed
    // details content is not shown; real browsers honour both. This harness does not, so a
    // toHaveAccessibleName assertion CANNOT catch either regression. If one of these ever
    // starts failing, the harness gained the capability -- delete the case and rely on it.
    const notModelled: [string, () => React.ReactElement][] = [
      [
        "inert wrapper",
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <span inert>
              <Hint />
            </span>
          </a>
        ),
      ],
      [
        "closed details",
        () => (
          <a href="x" target="_blank">
            Go{" "}
            <details>
              <Hint />
            </details>
          </a>
        ),
      ],
    ];
    for (const [label, jsx] of notModelled) {
      const { container, unmount } = render(jsx());
      expect(
        container.querySelector("a"),
        `${label}: harness still includes the hint`,
      ).toHaveAccessibleName("Go (opens in a new tab)");
      unmount();
    }
  });
});

/**
 * THE ATTRIBUTE-KIND AGREEMENT MATRIX.
 *
 * Every round from R31 to R34 produced at least one finding of the same shape: a value classified
 * by the wrong attribute KIND, or by spelling rather than by what React does with it. Each was fixed
 * one case at a time, and each fix was verified against a hand-written fixture that encoded my
 * belief about the runtime.
 *
 * This closes the class instead. For each (attribute, value) pair it renders the markup, computes
 * the real accessible name, scans the equivalent source, and asserts the two AGREE: the scanner
 * reports exactly when the announcement is absent from the name. Nothing here encodes a belief --
 * the expectation comes from the render.
 *
 * The four documented stricter-than-harness divergences (§6.4) are the only exemptions, listed
 * explicitly with the reason, because for those the harness is the thing that is wrong.
 */
describe("scanner and runtime agree, per attribute kind", () => {
  const PHRASE_TEXT = "(opens in a new tab)";
  const HintSpan = (): JSX.Element => <span className="sr-only">{PHRASE_TEXT}</span>;

  type Case = {
    readonly attr: string; // source spelling, e.g. `hidden={0}`
    readonly props: Record<string, unknown>; // the same value at runtime
    readonly divergence?: string; // a documented stricter-than-harness case
  };

  const CASES: readonly Case[] = [
    // boolean DOM attributes: React coerces, so every falsy value is dropped
    { attr: "hidden", props: { hidden: true } },
    { attr: "hidden={true}", props: { hidden: true } },
    { attr: "hidden={false}", props: { hidden: false } },
    { attr: "hidden={0}", props: { hidden: 0 } },
    { attr: 'hidden={""}', props: { hidden: "" } },
    { attr: "hidden={null}", props: { hidden: null } },
    { attr: "hidden={undefined}", props: { hidden: undefined } },
    { attr: 'hidden="false"', props: { hidden: "false" } },
    { attr: "hidden={-0}", props: { hidden: -0 } },
    { attr: "hidden={NaN}", props: { hidden: NaN } },
    // enumerated: React drops BOTH booleans, keeps every string and number
    { attr: "popover", props: { popover: true } },
    { attr: "popover={true}", props: { popover: true } },
    { attr: "popover={false}", props: { popover: false } },
    { attr: 'popover=""', props: { popover: "" } },
    { attr: "popover={0}", props: { popover: 0 } },
    { attr: 'popover="auto"', props: { popover: "auto" } },
    { attr: 'popover="bogus"', props: { popover: "bogus" } },
    { attr: "popover={null}", props: { popover: null } },
    // ARIA string: stringified, and only the exact "true" hides
    { attr: "aria-hidden", props: { "aria-hidden": true } },
    { attr: 'aria-hidden="true"', props: { "aria-hidden": "true" } },
    { attr: 'aria-hidden="false"', props: { "aria-hidden": "false" } },
    { attr: "aria-hidden={true}", props: { "aria-hidden": true } },
    { attr: "aria-hidden={false}", props: { "aria-hidden": false } },
    { attr: "aria-hidden={0}", props: { "aria-hidden": 0 } },
    { attr: "aria-hidden={null}", props: { "aria-hidden": null } },
    { attr: "aria-hidden={undefined}", props: { "aria-hidden": undefined } },
    {
      attr: 'aria-hidden="TRUE"',
      props: { "aria-hidden": "TRUE" },
      divergence: "the case-fold is deliberately stricter than the harness (§6.4)",
    },
    // inert: the harness does not model it at all
    {
      attr: "inert",
      props: { inert: true },
      divergence: "the harness does not model `inert` (§6.4)",
    },
    { attr: "inert={false}", props: { inert: false } },
    { attr: "inert={undefined}", props: { inert: undefined } },
    // INLINE STYLE is modelled by the harness, so these are real agreement checks.
    { attr: 'style={{display: "none"}}', props: { style: { display: "none" } } },
    { attr: 'style={{display: "NONE"}}', props: { style: { display: "NONE" } } },
    { attr: 'style={{visibility: "hidden"}}', props: { style: { visibility: "hidden" } } },
    { attr: 'style={{display: "block"}}', props: { style: { display: "block" } } },
    {
      attr: 'style={{backfaceVisibility: "hidden"}}',
      props: { style: { backfaceVisibility: "hidden" } },
    },
    { attr: 'style={{DISPLAY: "NONE"}}', props: { style: { DISPLAY: "NONE" } } },
    {
      attr: 'style={{visibility: "collapse"}}',
      props: { style: { visibility: "collapse" } },
      divergence: "the harness does not model `visibility: collapse` (§6.4)",
    },
    // A hiding CLASS is the fifth divergence: jsdom loads no CSS, so the harness cannot see it.
    {
      attr: 'className="hidden"',
      props: { className: "hidden" },
      divergence: "jsdom applies no CSS, so class-based hiding is invisible to the harness (§6.4)",
    },
    {
      attr: 'className="invisible"',
      props: { className: "invisible" },
      divergence: "jsdom applies no CSS, so class-based hiding is invisible to the harness (§6.4)",
    },
    // ...but a class that does NOT hide must still be accepted, and that IS checkable.
    { attr: 'className="overflow-hidden"', props: { className: "overflow-hidden" } },
    { attr: 'className="sr-only"', props: { className: "sr-only" } },
    // COMPOSED values -- the class every finding from R33 and R34 came from. The source spelling and
    // its evaluated runtime value are supplied together, so the matrix checks the scanner's static
    // reasoning against what React actually receives.
    { attr: "hidden={true && 1}", props: { hidden: true && 1 } },
    { attr: "hidden={false || 0}", props: { hidden: false || 0 } },
    // `null ?? 0` evaluates to 0; written as the value because tsc rejects the literal form (TS2871).
    { attr: "hidden={null ?? 0}", props: { hidden: 0 } },
    { attr: "hidden={true ? 0 : 1}", props: { hidden: true ? 0 : 1 } },
    { attr: "hidden={void 0}", props: { hidden: void 0 } },
    { attr: "hidden={-0}", props: { hidden: -0 } },
    { attr: "hidden={0n}", props: { hidden: BigInt(0) } },
    { attr: 'popover={false && "auto"}', props: { popover: false && "auto" } },
    { attr: 'popover={true || "auto"}', props: { popover: true || "auto" } },
    { attr: 'popover={null ?? "auto"}', props: { popover: "auto" } },
    { attr: "aria-hidden={`${true}`}", props: { "aria-hidden": `${true}` } },
    { attr: "aria-hidden={`true${false}`}", props: { "aria-hidden": `true${false}` } },
    { attr: "aria-hidden={typeof x}", props: { "aria-hidden": typeof undefined } },
    { attr: "aria-hidden={/re/}", props: { "aria-hidden": /re/ } },
    { attr: "aria-hidden={[]}", props: { "aria-hidden": [] } },
    { attr: 'aria-hidden={flag ? "false" : "false"}', props: { "aria-hidden": "false" } },
    { attr: 'style={{display: (0, "none")}}', props: { style: { display: "none" } } },
    { attr: 'style={{display: true ? "none" : "block"}}', props: { style: { display: "none" } } },
    {
      attr: 'style={{display: "none", ...(true ? {display: "block"} : {})}}',
      props: { style: { display: "block" } },
    },
    // TRUTHY OBJECTS across kinds. The same value expression gets OPPOSITE verdicts depending on the
    // attribute: `[]` is a truthy object, so a BOOLEAN attribute keeps it and hides, while
    // `String([])` is "" which is not "true", so ARIA does not hide. That divergence is the exact
    // confusion that produced a finding in four consecutive rounds, so both sides are pinned here.
    { attr: "hidden={[]}", props: { hidden: [] } },
    { attr: "hidden={{}}", props: { hidden: {} } },
    { attr: "hidden={~0}", props: { hidden: ~0 } },
    { attr: "hidden={Infinity}", props: { hidden: Infinity } },
    {
      attr: "inert={[]}",
      props: { inert: [] },
      divergence: "the harness does not model `inert` (§6.4), whatever its value",
    },
    { attr: "popover={[]}", props: { popover: [] } },
    { attr: "popover={~0}", props: { popover: ~0 } },
    { attr: "aria-hidden={[]}", props: { "aria-hidden": [] } },
    { attr: "aria-hidden={~0}", props: { "aria-hidden": ~0 } },
    { attr: 'aria-hidden={["true"]}', props: { "aria-hidden": ["true"] } },
  ];

  for (const c of CASES) {
    test(`${c.attr}`, () => {
      const { container, unmount } = render(
        <a href="x" target="_blank">
          Go{" "}
          <span {...(c.props as Record<string, never>)}>
            <HintSpan />
          </span>
        </a>,
      );
      const el = container.querySelector("a")!;

      const sc: Scan = { anchors: 0, violations: [] };
      const src =
        'import { NewTabHint } from "@/components/shared/NewTabHint";\n' +
        `const A = () => <a href="x" target="_blank">Go <span ${c.attr}><NewTabHint /></span></a>;`;
      scanSource(parse("/matrix.tsx", src), "/matrix.tsx", sc);
      const reported = sc.violations.length > 0;
      expect(sc.anchors, "the matrix fixture must discover its anchor").toBe(1);

      // The expectation comes from the RENDER, via jest-dom's matcher -- which computes the real
      // accessible name with the same library the rest of this suite measures against. The scanner's
      // verdict only chooses the DIRECTION; if the two disagree, this fails. Deriving `announced`
      // from textContent plus a hand-written hidden check would re-encode the very assumptions the
      // matrix exists to test.
      const carriesPhrase = new RegExp(PHRASE_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (c.divergence !== undefined) {
        // The harness cannot see what the browser does here, so the scanner is deliberately the
        // stricter of the two and the runtime check does not apply.
        expect(reported, `${c.attr}: ${c.divergence}`).toBe(true);
        unmount();
        return;
      }
      if (reported) {
        expect(
          el,
          `${c.attr}: scanner reports, so the name must LACK the announcement`,
        ).not.toHaveAccessibleName(carriesPhrase);
      } else {
        expect(
          el,
          `${c.attr}: scanner accepts, so the name must CARRY the announcement`,
        ).toHaveAccessibleName(carriesPhrase);
      }
      unmount();
    });
  }
});

// spec 2026-07-31-judgment-chip-newtab-suffix-design.md §3 — the three
// interpolated labels never stack the appended suffix. Exact computed-name
// assertions (not getAttribute) so an aria-labelledby regression is caught.
import { SheetIconLink } from "@/components/admin/SheetIconLink";
import { DiagramTile } from "@/components/admin/wizard/step3ReviewSections";
import { SheetTitleLink } from "@/components/admin/wizard/Step3SheetCard";

describe("interpolated labels never stack the appended suffix (spec 2026-07-31 §3)", () => {
  test("SheetIconLink: trailing occurrence in the subject dedupes to one", () => {
    const { getByRole } = render(
      <SheetIconLink
        href="https://x"
        subjectLabel="Summit (opens in a new tab)"
        testId="t1"
        ringOffset="bg"
      />,
    );
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet for Summit in Google Sheets (opens in a new tab)",
    );
  });

  test("SheetIconLink: mid-string occurrence is preserved, exactly two total", () => {
    const { getByRole } = render(
      <SheetIconLink
        href="https://x"
        subjectLabel="Summit (opens in a new tab) Tour"
        testId="t2"
        ringOffset="bg"
      />,
    );
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet for Summit (opens in a new tab) Tour in Google Sheets (opens in a new tab)",
    );
  });

  test("DiagramTile: alt ending in the phrase announces it once", () => {
    const { getByRole } = render(
      <DiagramTile
        href="https://x/img"
        sourceKey="diagram-t3"
        loader={() => "https://x/img"}
        sizes="100px"
        alt="Stage plot (opens in a new tab)"
        testId="t3"
        hasPreviewSource={true}
      />,
    );
    expect(getByRole("link")).toHaveAccessibleName("Stage plot (opens in a new tab)");
  });

  test("SheetTitleLink: title ending in the phrase announces it once", () => {
    const { getByRole } = render(
      <SheetTitleLink dfid="d1" title="II - Summit (opens in a new tab)" />,
    );
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet for II - Summit in Google Sheets (opens in a new tab)",
    );
  });

  test("SheetTitleLink: title that strips to empty takes the no-subject fallback", () => {
    const { getByRole } = render(<SheetTitleLink dfid="d1" title="(opens in a new tab)" />);
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet in Google Sheets (opens in a new tab)",
    );
  });
});
