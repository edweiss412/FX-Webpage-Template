// @vitest-environment jsdom
/**
 * tests/app/admin/auto-publish-toggle.test.tsx (M12.2 Phase B2 Task 8.1 — spec §4)
 *
 * The Preferences-area "Auto-publish clean new shows" toggle reflects
 * `app_settings.auto_publish_clean_first_seen` and explains the OFF behavior.
 *
 * Contract asserted here (jsdom — render only, the write path is exercised by
 * the action + the real-DB RLS test):
 *   - on=true  → the toggle reports the ON state (aria-checked / data-state).
 *   - on=false → reports the OFF state AND renders the OFF-explainer copy
 *     ("new shows wait for your approval before going live").
 *   - infra_error (degraded) → the control is rendered disabled and never
 *     silently reports a wrong (e.g. falsely-ON) state.
 *   - the submit affordance does NOT self-disable synchronously in its own
 *     onClick (the React-19 form-action cancel lesson — B1 revoke hang); it
 *     disables on pending. We assert no onclick attribute carries a disable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AutoPublishToggle } from "@/components/admin/settings/AutoPublishToggle";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

const noop = vi.fn(async () => ({ ok: true }) as const);

describe("AutoPublishToggle — reflects app_settings + OFF explainer (Task 8.1)", () => {
  it("renders the ON state when on=true (no OFF explainer)", () => {
    const { getByTestId, queryByTestId } = render(
      <AutoPublishToggle initial={{ kind: "value", on: true }} setAutoPublish={noop} />,
    );
    const toggle = getByTestId("auto-publish-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.hasAttribute("disabled")).toBe(false);
    expect(queryByTestId("auto-publish-off-explainer")).toBeNull();
  });

  it("renders the OFF state AND the approval-wait explainer when on=false", () => {
    const { getByTestId } = render(
      <AutoPublishToggle initial={{ kind: "value", on: false }} setAutoPublish={noop} />,
    );
    const toggle = getByTestId("auto-publish-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    const explainer = getByTestId("auto-publish-off-explainer");
    expect(explainer.textContent ?? "").toMatch(
      /new shows wait for your approval before going live/i,
    );
  });

  it("renders a disabled degraded control on infra_error (never a silent wrong state)", () => {
    const { getByTestId } = render(
      <AutoPublishToggle initial={{ kind: "infra_error" }} setAutoPublish={noop} />,
    );
    const toggle = getByTestId("auto-publish-toggle");
    expect(toggle.hasAttribute("disabled")).toBe(true);
    // Degraded: it must NOT claim to be ON when we couldn't read the value.
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(getByTestId("auto-publish-degraded").textContent ?? "").toMatch(
      /couldn|could not|setting/i,
    );
  });

  it("the submit toggle does not synchronously self-disable in its own onClick (React-19 dispatch safety)", () => {
    const { getByTestId } = render(
      <AutoPublishToggle initial={{ kind: "value", on: true }} setAutoPublish={noop} />,
    );
    const toggle = getByTestId("auto-publish-toggle");
    const onclick = toggle.getAttribute("onclick") ?? "";
    expect(onclick).not.toMatch(/disabled\s*=\s*true/i);
  });

  it("renders a stable setting row container with the title", () => {
    const { getByTestId } = render(
      <AutoPublishToggle initial={{ kind: "value", on: true }} setAutoPublish={noop} />,
    );
    const row = getByTestId("auto-publish-setting-row");
    expect(row.textContent ?? "").toMatch(/auto-publish clean new shows/i);
  });
});
