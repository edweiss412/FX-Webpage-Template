// @vitest-environment jsdom
// tests/components/telemetry/telemetryRetryButton.test.tsx
//
// The retry control on the scheduled-job health fallback (BL-TELEMETRY-FALLBACK-RETRY).
// The page-level proof that a tap re-reads lives in tests/app/admin/telemetryPage.test.tsx;
// this file owns the control's own contract, and case 3 is the reason it exists at all.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { premise } from "../../_shared/premise";
import { stripCommentsForFile } from "../../_shared/stripComments";

const refresh = vi.fn();
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push, replace }),
  useSearchParams: () => new URLSearchParams(""),
}));

import {
  TelemetryRetryButton,
  TELEMETRY_RETRY_TEXT,
  retryAnnouncement,
  retryOutcomeAnnouncement,
  retryLabel,
} from "@/components/admin/telemetry/TelemetryRetryButton";

// One arbitrary site's noun phrase. The per-site wiring is asserted at the page level;
// this file owns the control's contract, which is the same at every site.
const WHAT = "scheduled-job health";
const TEST_ID = "cron-health-retry";
// An arbitrary finite instant for the cases that do not care about the value. The
// outcome cases name their own, because for them the value IS the subject.
const RENDERED_AT = 1_000;
const renderControl = (renderedAt: number = RENDERED_AT) =>
  render(<TelemetryRetryButton what={WHAT} testId={TEST_ID} renderedAt={renderedAt} />);

afterEach(() => {
  cleanup();
  refresh.mockClear();
  push.mockClear();
  replace.mockClear();
});

const statusText = () => screen.getByTestId(`${TEST_ID}-status`).textContent ?? "";

describe("TelemetryRetryButton", () => {
  // Mounted-then-filled. A control that renders its region only once it has something to
  // say passes every other case here and announces nothing in a real browser, because a
  // live region inserted together with its text is not announced.
  test("the status region exists before any click, and is empty", () => {
    renderControl();
    expect(screen.getByTestId(`${TEST_ID}-status`)).toBeInTheDocument();
    expect(statusText()).toBe("");
  });

  test("one activation announces the retry, and the announcement is not empty", () => {
    renderControl();
    fireEvent.click(screen.getByTestId(TEST_ID));
    expect(statusText()).toContain(retryAnnouncement(WHAT));
    // Not decoration. Every string contains the empty string, so with the constant
    // emptied `toContain` passes, and the parity space still separates attempt one from
    // attempt two, so the repeat case passes too. Asserted on the RENDERED text rather
    // than on the constant, so the constant alone cannot satisfy it.
    expect(statusText().trim().length).toBeGreaterThan(0);
  });

  // The case this file exists for. A second failed attempt that re-renders the identical
  // string into the region is SILENT to a screen reader, which is the same silence the
  // ledger row exists to fix. Compared against the captured first value rather than a
  // literal, so the case states the property and not today's encoding of it.
  test("a second activation is distinguishable from the first", () => {
    renderControl();
    fireEvent.click(screen.getByTestId(TEST_ID));
    const first = statusText();
    premise("the first activation announced something", first.length, 0);
    fireEvent.click(screen.getByTestId(TEST_ID));
    const second = statusText();
    expect(second).not.toBe(first);
    expect(second).toContain(retryAnnouncement(WHAT));
  });

  // WCAG 2.5.3, both halves read off the rendered button rather than off the constants,
  // so a label that drifts away from the visible text fails here.
  test("the accessible name contains the visible text", () => {
    renderControl();
    const button = screen.getByTestId(TEST_ID);
    const visible = button.textContent ?? "";
    const accessible = button.getAttribute("aria-label") ?? visible;
    premise("the button renders visible text", visible.trim().length, 0);
    expect(visible.trim()).toBe(TELEMETRY_RETRY_TEXT);
    expect(accessible).toContain(visible.trim());
  });

  test("each activation refreshes exactly once and never navigates", () => {
    renderControl();
    fireEvent.click(screen.getByTestId(TEST_ID));
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId(TEST_ID));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // Every navigation vector a control in this position has. A reload spy is NOT used:
    // jsdom defines location.reload non-writable and non-configurable, so spying throws
    // before it can prove anything, and router.refresh is the only navigation call made.
    const button = screen.getByTestId(TEST_ID);
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toHaveAttribute("href");
  });

  // Case 6, the navigation pin, and it is STATIC for a reason that was probed twice rather
  // than assumed. jsdom does not throw on a real navigation: `location.reload()` and
  // `history.go(0)` both log "Not implemented: navigation to another Document" and return,
  // so `router.refresh(); window.location.reload();` satisfies every behavioural assertion
  // in this file while reloading in a real browser.
  //
  // Stated as a NAMESPACE ban rather than an API list, which is the whole point. Plan round
  // 3 escaped an empty check with `location.reload`; plan round 4 escaped the resulting list
  // with `history.go(0)`, and named `history.back`, `history.forward` and assignments to
  // `location.pathname` / `search` / `hash` / `protocol` / `host` / `hostname` / `port`
  // behind it. A list answers one probe per round forever. There is no fifth namespace a
  // navigation can come from, so banning these four is total.
  //
  // Total over a seventy-line file is a different thing from a recognizer over a corpus.
  // This must not grow into one: if this component ever legitimately needs one of these
  // globals, the answer is an inline exemption carrying its reason, never a longer pattern.
  test("the component reaches for no navigation namespace at all", () => {
    const rel = "components/admin/telemetry/TelemetryRetryButton.tsx";
    const src = stripCommentsForFile(
      readFileSync(join(__dirname, "..", "..", "..", rel), "utf8"),
      rel,
    );
    // Comments are stripped first, so the JSDoc paragraph explaining why there is no reload
    // can neither satisfy this nor trip it.
    premise("the stripped source is still the component", src.length, 200);
    premise("stripping did not remove the implementation", src.split("router.refresh").length, 1);
    for (const ns of ["window", "location", "history", "document"]) {
      expect(new RegExp(`\\b${ns}\\b`).test(src), `${rel} reaches for ${ns}`).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // The outcome half (TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1). A tap records the
  // timestamp it saw; a later render carrying a DIFFERENT one means a server re-read
  // completed and this branch still failed, which is a settled outcome worth saying.
  // Success needs no case here: it unmounts the control with its branch.
  // ---------------------------------------------------------------------------

  const rerenderAt = (view: ReturnType<typeof render>, renderedAt: number) =>
    view.rerender(<TelemetryRetryButton what={WHAT} testId={TEST_ID} renderedAt={renderedAt} />);

  test("a changed timestamp after a tap announces the outcome, once", () => {
    const view = renderControl(1_000);
    fireEvent.click(screen.getByTestId(TEST_ID));
    rerenderAt(view, 2_000);
    expect(statusText()).toContain("Still couldn’t load scheduled-job health");

    // Once: the baseline cleared with the announcement, so a further changed value
    // says nothing new until the next tap.
    const settled = statusText();
    rerenderAt(view, 3_000);
    expect(statusText()).toBe(settled);
  });

  test("a changed timestamp with no tap in flight announces nothing", () => {
    const view = renderControl(1_000);
    rerenderAt(view, 2_000);
    expect(statusText()).toBe("");
  });

  test("an unchanged timestamp after a tap leaves the intent standing", () => {
    const view = renderControl(1_000);
    fireEvent.click(screen.getByTestId(TEST_ID));
    const intent = statusText();
    premise("the tap announced the intent", intent.length, 0);
    rerenderAt(view, 1_000);
    expect(statusText()).toBe(intent);
  });

  // Zero is a valid instant on BOTH sides of the comparison. A truthiness test in
  // place of either finite check compiles, passes every other case here, and
  // silently drops the announcement for an epoch-zero render.
  test("zero is a valid instant at the tap", () => {
    const view = renderControl(0);
    fireEvent.click(screen.getByTestId(TEST_ID));
    rerenderAt(view, 1_000);
    expect(statusText()).toContain(retryOutcomeAnnouncement(WHAT));
  });

  test("zero is a valid instant at the settlement", () => {
    const view = renderControl(1_000);
    fireEvent.click(screen.getByTestId(TEST_ID));
    rerenderAt(view, 0);
    expect(statusText()).toContain(retryOutcomeAnnouncement(WHAT));
  });

  // The whole non-finite domain, not NaN alone: `!Number.isNaN(x)` is strict-clean,
  // passes a NaN-only case, and accepts ±Infinity as a completed server render.
  const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  test("a non-finite timestamp at the tap records no baseline", () => {
    for (const value of NON_FINITE) {
      const view = renderControl(value);
      fireEvent.click(screen.getByTestId(TEST_ID));
      expect(statusText()).toContain(retryAnnouncement(WHAT));
      rerenderAt(view, 5_000);
      expect(statusText(), `${String(value)} recorded a baseline`).not.toContain(
        retryOutcomeAnnouncement(WHAT),
      );
      cleanup();
    }
  });

  test("a non-finite timestamp arriving never settles the outcome", () => {
    for (const value of NON_FINITE) {
      const view = renderControl(1_000);
      fireEvent.click(screen.getByTestId(TEST_ID));
      rerenderAt(view, value);
      expect(statusText(), `${String(value)} settled the outcome`).not.toContain(
        retryOutcomeAnnouncement(WHAT),
      );
      cleanup();
    }
  });

  // The rule is ANY difference, never an ordering test: a server clock correction
  // moves the value backwards and that render still settled a re-read. A fixture
  // that only ever moves forward cannot see `renderedAt > baseline`.
  test("a decreasing timestamp settles the outcome too", () => {
    const view = renderControl(2_000);
    fireEvent.click(screen.getByTestId(TEST_ID));
    rerenderAt(view, 1_000);
    expect(statusText()).toContain(retryOutcomeAnnouncement(WHAT));
  });

  // The property AC-6 actually states, walked rather than predicted. Asserting parity
  // arithmetic about a particular pair is a claim about the implementation and goes
  // stale with it; this reads what rendered. Each step declares whether it should
  // SPEAK, and the two halves are asserted separately: a speaking step must change the
  // region text (an identical re-render is silence to a screen reader), and a silent
  // step must leave it exactly as it was. Recording only the changes would make the
  // first half true by construction.
  test("every announcement in a mixed sequence differs from the one before it", () => {
    const view = renderControl(1_000);
    let previous = statusText();
    const step = (label: string, speaks: boolean, act: () => void) => {
      act();
      const current = statusText();
      if (speaks) {
        expect(current, `${label} repeated its predecessor verbatim`).not.toBe(previous);
      } else {
        expect(current, `${label} spoke when it should have been silent`).toBe(previous);
      }
      previous = current;
    };
    const tap = (label: string) =>
      step(label, true, () => fireEvent.click(screen.getByTestId(TEST_ID)));

    tap("first tap");
    // Two intents in a row carry identical text, so this is the one pair the parity
    // separator alone can distinguish.
    tap("second tap, same text as the first");
    step("the re-read that settled", true, () => rerenderAt(view, 2_000));
    tap("tap after an outcome");
    step("the second re-read that settled", true, () => rerenderAt(view, 3_000));
    // The baseline cleared with the previous announcement, so this one has nothing to
    // report and must not re-speak the outcome.
    step("a further render with no tap in flight", false, () => rerenderAt(view, 4_000));
  });

  // The separator is U+00A0 specifically. An ordinary trailing space is textually
  // distinct too, so an inequality-only check would accept it while abandoning the
  // mechanism the sibling precedent uses (ShowRowActions.tsx:608).
  test("the parity separator is a non-breaking space", () => {
    renderControl();
    fireEvent.click(screen.getByTestId(TEST_ID));
    const first = statusText();
    fireEvent.click(screen.getByTestId(TEST_ID));
    const second = statusText();
    const [plain, suffixed] = first.length <= second.length ? [first, second] : [second, first];
    expect(plain).toBe(retryAnnouncement(WHAT));
    expect(suffixed).toBe(`${retryAnnouncement(WHAT)} `);
  });

  test("the intent and outcome strings differ", () => {
    expect(retryOutcomeAnnouncement(WHAT)).not.toBe(retryAnnouncement(WHAT));
    expect(retryOutcomeAnnouncement(WHAT)).toContain(WHAT);
  });

  // The prop pair exists so a call site cannot spell the label and the announcement
  // differently. Derived from `what` on both sides rather than compared to literals.
  test("the accessible name and the announcement both derive from `what`", () => {
    renderControl();
    expect(screen.getByTestId(TEST_ID)).toHaveAttribute("aria-label", retryLabel(WHAT));
    expect(retryLabel(WHAT)).toContain(WHAT);
    fireEvent.click(screen.getByTestId(TEST_ID));
    expect(statusText()).toContain(WHAT);
  });
});
