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
  retryLabel,
} from "@/components/admin/telemetry/TelemetryRetryButton";

// One arbitrary site's noun phrase. The per-site wiring is asserted at the page level;
// this file owns the control's contract, which is the same at every site.
const WHAT = "scheduled-job health";
const TEST_ID = "cron-health-retry";
const renderControl = () => render(<TelemetryRetryButton what={WHAT} testId={TEST_ID} />);

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
