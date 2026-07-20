// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/_rowAssertions.selftest.test.tsx
 *
 * Self-test for the row-assertion helpers (spec §7.0).
 *
 * WHY THIS FILE IS PERMANENT, not a throwaway probe:
 *
 * Across the spec's adversarial-review rounds, FOUR findings were of the class
 * "this assertion would fail the CORRECT implementation" (r6, r17, r18, r21) —
 * strictly worse than admitting a wrong one, because it blocks a good diff.
 * Every one of them survived earlier probing because the probe fixtures were
 * not FAITHFUL: the r21 case (the description-class scan flagging the row icon,
 * which legitimately carries `text-text-subtle`) was invisible to a probe that
 * rendered a bare `<svg />`.
 *
 * So the fixtures below use the REAL lucide icons with the REAL prescribed
 * class strings, and the first describe block asserts that a CORRECT row passes
 * every helper end to end. The second block keeps the escapes failing. A change
 * to the helpers that tightens them into rejecting correct markup fails here,
 * at the helper, instead of surfacing as a mystery red in the row tests.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RefreshCw, RotateCcw } from "lucide-react";
import {
  expectClasses,
  expectNoDescriptionNode,
  expectRowBoundary,
  expectRowText,
  NO_BORDER,
  NO_REST_BACKGROUND,
  WRAPPER_CLASSES,
} from "@/tests/components/admin/showpage/_rowAssertions";

// FAITHFUL fixtures: the REAL lucide icons with the REAL classes the spec
// prescribes. Earlier probes used a bare <svg/> and therefore could not see
// that the icon carries `text-text-subtle`.
const ROW =
  "flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const RESET_ROW = `${ROW} focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent`;
const LC = "text-sm font-medium text-text-strong";
const DC = "text-xs text-text-subtle";
const W = "flex w-full flex-col gap-2";
const RL = "Rotate share link";
const RD = "Old link stops working immediately";
const SL = "Reset everyone's pick";
const SD = "Make everyone pick their name again on their next visit.";

const RotateRow = ({ desc = true }: { desc?: boolean }) => (
  <div className={W}>
    <button
      type="button"
      aria-label={RL}
      {...(desc ? { "aria-describedby": "rd" } : {})}
      className={ROW}
    >
      <RotateCcw aria-hidden="true" size={16} className="shrink-0 text-text-subtle" />
      <span className="flex min-w-0 flex-col">
        <span className={LC}>{RL}</span>
        {desc ? (
          <span id="rd" className={DC}>
            {RD}
          </span>
        ) : null}
      </span>
    </button>
  </div>
);

const ResetRow = () => (
  <div className={W}>
    <button type="button" aria-label={SL} aria-describedby="sd" className={RESET_ROW}>
      <RefreshCw aria-hidden="true" size={16} className="shrink-0 text-text-subtle" />
      <span className="flex min-w-0 flex-col">
        <span className={LC}>{SL}</span>
        <span id="sd" className={DC}>
          {SD}
        </span>
      </span>
    </button>
    <div className="sr-only" role="status" aria-live="polite" />
  </div>
);

describe("round-21: the CORRECT implementation passes end to end", () => {
  afterEach(cleanup);

  it("rotate WITH description passes every assertion", () => {
    const { container } = render(<RotateRow />);
    const btn = container.querySelector("button")!;
    expectClasses(btn, { exactly: ROW.split(" "), forbids: [NO_BORDER, NO_REST_BACKGROUND] });
    expectRowText(btn, container, { label: RL, description: RD });
    expectRowBoundary(btn, { scope: container, descriptionId: "rd", container });
    expectClasses(btn.parentElement!, { exactly: WRAPPER_CLASSES });
  });

  it("rotate WITHOUT description passes the absence guard (icon must not trip it)", () => {
    const { container } = render(<RotateRow desc={false} />);
    const btn = container.querySelector("button")!;
    expectNoDescriptionNode(btn, container, RL);
    expectRowBoundary(btn, { scope: container, descriptionId: null, container });
  });

  it("reset WITH its live region passes every assertion", () => {
    const { container } = render(<ResetRow />);
    const btn = container.querySelector("button")!;
    expectClasses(btn, { exactly: RESET_ROW.split(" "), forbids: [NO_BORDER, NO_REST_BACKGROUND] });
    expectRowText(btn, container, { label: SL, description: SD });
    expectRowBoundary(btn, {
      scope: container,
      descriptionId: "sd",
      container,
      allowLiveRegion: true,
    });
  });
});

describe("round-21: the new escapes still fail", () => {
  afterEach(cleanup);

  it("REJECTS an inaccessible live region", () => {
    const { container } = render(
      <div className={W}>
        <button type="button" aria-label={SL} aria-describedby="sd2" className={RESET_ROW}>
          <RefreshCw size={16} className="shrink-0 text-text-subtle" />
          <span className="flex min-w-0 flex-col">
            <span className={LC}>{SL}</span>
            <span id="sd2" className={DC}>
              {SD}
            </span>
          </span>
        </button>
        <div className="sr-only hidden" role="status" aria-live="polite" aria-hidden="true">
          <button>junk</button>
        </div>
      </div>,
    );
    const btn = container.querySelector("button")!;
    expect(() =>
      expectRowBoundary(btn, {
        scope: container,
        descriptionId: "sd2",
        container,
        allowLiveRegion: true,
      }),
    ).toThrow();
  });

  it("REJECTS a contenteditable wrapper", () => {
    const { container } = render(
      <div className={W} contentEditable suppressContentEditableWarning>
        <button type="button" aria-label={RL} aria-describedby="rd3" className={ROW}>
          <RotateCcw size={16} className="shrink-0 text-text-subtle" />
          <span className="flex min-w-0 flex-col">
            <span className={LC}>{RL}</span>
            <span id="rd3" className={DC}>
              {RD}
            </span>
          </span>
        </button>
      </div>,
    );
    const btn = container.querySelector("button")!;
    expect(() => expectRowBoundary(btn, { scope: container, descriptionId: "rd3" })).toThrow();
  });

  it("still REJECTS a partial-class carrier beside the column (structurally)", () => {
    const { container } = render(
      <div className={W}>
        <button type="button" aria-label={RL} className={ROW}>
          <RotateCcw size={16} className="shrink-0 text-text-subtle" />
          <span className="flex min-w-0 flex-col">
            <span className={LC}>{RL}</span>
          </span>
          <p id="junk" className="text-xs" />
        </button>
      </div>,
    );
    const btn = container.querySelector("button")!;
    expect(() => expectNoDescriptionNode(btn, container, RL)).toThrow();
  });
});
