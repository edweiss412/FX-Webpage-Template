// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/wizardAutoOpenWidthSuppression.test.tsx
 * (spec 2026-08-29-attention-auto-open-phone-suppression §5)
 *
 * The wizard's mirror of the published surface's suppression. P-1 measured the
 * wizard modal at 375x667, 375x844 and 390x560 and came back POSITIVE at all
 * three -- 36 controls each, five intercepted, every interceptor inside the
 * panel (spec §5.1) -- so the wizard is an instance of the DEFECT and not only
 * of the code shape, and it gets the identical predicate at the identical
 * position.
 *
 * Two things that are NOT copied from the published twin:
 *
 *   - The wizard's predicate counts NEEDS-LOOK items
 *     (`const n = attention.needsLook.length`, Step3ReviewModal.tsx:335), not
 *     the actionable items the published modal uses. A mirrored fixture that
 *     copies the published one drives nothing at all.
 *   - The wizard sets `menuAutoOpened` alongside the one-shot, which becomes
 *     `escTransparentUntilEngaged` and decides whether Escape closes the MENU
 *     or the MODAL. The published surface never passes that prop, so
 *     AC-WIZARD-MIRROR is structurally blind to it and it gets its own id.
 *
 * The ambient `matchMedia` stub (tests/setup.ts:84) answers false for every
 * query, so this file installs a query-aware one for the same reasons the
 * published twin does.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  DFID,
  judgmentWarning,
  renderStep3Modal,
  rerenderStep3Modal,
  sectionData,
  warning,
} from "./__fixtures__/step3ModalHarness";

const MENU = `wizard-step3-card-${DFID}-review-attention-menu`;
const CHIP = `wizard-step3-card-${DFID}-review-chip`;

/** `sm` is 640px (app/globals.css:318); its positive-evidence complement is the
 *  query the predicate must ask. Same spelling as the published surface, and for
 *  the same reason: negating a min-width query inverts the fallback. */
const EXPECTED_QUERY = "(max-width: 639.98px)";

type MediaProbe = { asked: string[]; setWidth: (px: number) => void };

function installQueryAwareMatchMedia(initialWidth: number): MediaProbe {
  let width = initialWidth;
  const asked: string[] = [];
  const answer = (query: string): boolean => {
    const max = /^\(max-width:\s*([\d.]+)px\)$/.exec(query);
    if (max) return width <= Number.parseFloat(max[1]!);
    const min = /^\(min-width:\s*([\d.]+)px\)$/.exec(query);
    if (min) return width >= Number.parseFloat(min[1]!);
    throw new Error(
      `this suite's matchMedia cannot answer ${query}; returning false would be a confident wrong answer`,
    );
  };
  window.matchMedia = ((query: string) => {
    asked.push(query);
    return {
      get matches() {
        return answer(query);
      },
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  return { asked, setWidth: (px) => (width = px) };
}

/** Run real animation frames: the predicate is read inside one, so a flush that
 *  does not reach it observes the pre-reveal state, in which the menu has not
 *  mounted YET for reasons unrelated to suppression. */
async function flushReveal() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** The positive control every negative case is paired with: same fixture, same
 *  flush, a width where the menu MUST open. Its failure means the flush is the
 *  problem and the negative cases prove nothing. */
async function assertRevealWindowElapsed() {
  installQueryAwareMatchMedia(1280);
  renderStep3Modal({ d: needsLookData() });
  await flushReveal();
  expect(
    screen.queryByTestId(MENU),
    "control did not open at 1280, so the flush is too short and the negative cases prove nothing",
  ).not.toBeNull();
  cleanup();
}

/** Two NEEDS-LOOK warnings, which is what the wizard's `n` counts. */
function needsLookData() {
  return sectionData({ warnings: [warning("crew"), warning("venue")] });
}

describe("wizard auto-open width suppression (spec §5)", () => {
  beforeEach(() => {
    (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("AC-WIZARD-MIRROR: a phone-width arrival with needs-look items never mounts the menu", async () => {
    installQueryAwareMatchMedia(375);
    renderStep3Modal({ d: needsLookData() });
    await flushReveal();
    expect(screen.queryByTestId(MENU)).toBeNull();
    cleanup();
    await assertRevealWindowElapsed();
  });

  it("AC-WIZARD-MIRROR: a desktop arrival still auto-opens", async () => {
    const probe = installQueryAwareMatchMedia(1280);
    renderStep3Modal({ d: needsLookData() });
    await waitFor(() => expect(screen.getByTestId(MENU)).toBeInTheDocument());
    expect(probe.asked).toContain(EXPECTED_QUERY);
  });

  it("AC-WIZARD-MIRROR: the boundary is 640, not merely 'some phone width'", async () => {
    installQueryAwareMatchMedia(639);
    renderStep3Modal({ d: needsLookData() });
    await flushReveal();
    expect(screen.queryByTestId(MENU), "639 should suppress").toBeNull();
    cleanup();
    await assertRevealWindowElapsed();

    installQueryAwareMatchMedia(640);
    renderStep3Modal({ d: needsLookData() });
    await waitFor(() => expect(screen.getByTestId(MENU), "640 should open").toBeInTheDocument());
  });

  it("AC-WIZARD-MIRROR: the width is read INSIDE the frame, not when the effect runs", async () => {
    const probe = installQueryAwareMatchMedia(1280);
    renderStep3Modal({ d: needsLookData() });
    probe.setWidth(375);
    await flushReveal();
    expect(
      screen.queryByTestId(MENU),
      "the width was sampled at effect time, not inside the reveal frame",
    ).toBeNull();
  });

  it("AC-WIZARD-MIRROR: suppression CONSUMES, so a later dependency change cannot retro-fire it", async () => {
    // The wizard's effect depends on `n`, the needs-look count. Suppress at a
    // phone width, widen, then change `n`: the reveal must not happen, because
    // the decision was made and consumed on this mount. Catches the same
    // consume-below-the-return mutant the published twin catches.
    const probe = installQueryAwareMatchMedia(375);
    const rendered = renderStep3Modal({ d: needsLookData() });
    await flushReveal();
    expect(screen.queryByTestId(MENU)).toBeNull();

    probe.setWidth(1280);
    const more = sectionData({ warnings: [warning("crew"), warning("venue"), warning("event")] });
    await act(async () => {
      rerenderStep3Modal(rendered, { d: more });
    });
    await flushReveal();

    expect(
      screen.queryByTestId(MENU),
      "a needs-look change after widening retro-fired a reveal the suppression had consumed",
    ).toBeNull();
  });

  it("AC-WIZARD-MIRROR: a cancelled frame leaves the one-shot UNCONSUMED", async () => {
    installQueryAwareMatchMedia(1280);
    const rendered = renderStep3Modal({ d: needsLookData() });
    // Move `n` before the scheduled frame fires, so the effect re-runs and
    // cancels it. Nothing was decided, so the reveal is still owed.
    await act(async () => {
      rerenderStep3Modal(rendered, {
        d: sectionData({ warnings: [warning("crew"), warning("venue"), warning("event")] }),
      });
    });
    await flushReveal();
    expect(
      screen.queryByTestId(MENU),
      "a cancelled frame consumed the one-shot and the reveal was lost",
    ).not.toBeNull();
  });

  it("AC-WIZARD-MIRROR: an empty needs-look arrival does not consume; items arriving later still open it", async () => {
    // The wizard's early return is `n === 0`, its own count. Nothing decided,
    // so nothing consumed.
    // PREMISE FIRST, at a DESKTOP width, because it is the part that can be
    // wrong: if this fixture does not actually reach `n === 0`, the case below
    // exercises the width guard instead of the empty-items guard and proves
    // nothing about consumption. Measured: without this assertion the
    // consume-on-`n === 0` mutant escaped the whole suite.
    // The fixture is JUDGMENT-ONLY, not empty, and that distinction is the
    // whole case. `pillInteractive = !isDirtyRescan && n + m > 0` (:347) returns
    // BEFORE the `n === 0` line, so a fixture with no warnings at all never
    // reaches the guard under test -- measured: with an empty fixture the
    // consume-on-`n === 0` mutant escaped this entire suite. A judgment warning
    // makes the pill interactive while leaving `n` at zero.
    installQueryAwareMatchMedia(1280);
    const rendered = renderStep3Modal({ d: sectionData({ warnings: [judgmentWarning("rooms")] }) });
    await flushReveal();
    expect(
      screen.queryByTestId(MENU),
      "the judgment-only fixture did not reach the n === 0 return",
    ).toBeNull();

    const probe = installQueryAwareMatchMedia(1280);
    await act(async () => {
      rerenderStep3Modal(rendered, { d: needsLookData() });
    });
    await waitFor(() =>
      expect(
        screen.getByTestId(MENU),
        "the empty arrival consumed the one-shot, so later items never revealed",
      ).toBeInTheDocument(),
    );
  });

  it("AC-WIZARD-MIRROR: arrival focus is identical with and without suppression", async () => {
    installQueryAwareMatchMedia(375);
    renderStep3Modal({ d: needsLookData() });
    await flushReveal();
    const suppressed = (document.activeElement as HTMLElement | null)?.dataset?.testid;
    cleanup();

    installQueryAwareMatchMedia(1280);
    renderStep3Modal({ d: needsLookData() });
    await flushReveal();
    const opened = (document.activeElement as HTMLElement | null)?.dataset?.testid;

    expect(suppressed, "suppression moved arrival focus").toBe(opened);
    expect(suppressed, "arrival focus left the dialog entirely").not.toBeUndefined();
  });

  it("AC-WIZARD-ESC-OWNERSHIP: a tap-opened menu on a suppressed arrival claims Escape", async () => {
    // The obligation AC-WIZARD-MIRROR cannot reach, because the published
    // surface has no counterpart to mirror. Under suppression the rAF never
    // runs, so `menuAutoOpened` stays false, `escTransparentUntilEngaged` is
    // false, and `engagedRef` starts TRUE -- the menu the operator opened by
    // tapping owns Escape. An implementation that set `menuAutoOpened` on the
    // suppression path would hand Escape to the MODAL on every phone-opened
    // menu, and nothing else here would notice.
    installQueryAwareMatchMedia(375);
    const { onClose } = renderStep3Modal({ d: needsLookData() });
    await flushReveal();
    expect(screen.queryByTestId(MENU)).toBeNull();

    fireEvent.click(screen.getByTestId(CHIP));
    await waitFor(() => expect(screen.getByTestId(MENU)).toBeInTheDocument());

    fireEvent.keyDown(screen.getByTestId(CHIP), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId(MENU)).toBeNull());
    expect(onClose, "Escape closed the MODAL instead of the menu").not.toHaveBeenCalled();
  });
});
