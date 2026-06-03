// @vitest-environment jsdom
/**
 * tests/components/notify-toggles.test.tsx (M12.2 Phase B3 Task 6.2 — spec §7.2/.3/.5)
 *
 * The parameterized NotifyToggle backs both "Alert me about sync problems" and
 * "Daily review digest" Preferences rows.
 *
 * Contract (jsdom — render only; the write path is the action + real-DB RLS test):
 *   - on=true / on=false → reports that state (aria-checked).
 *   - infra_error (degraded) → disabled AND never falsely-ON (aria-checked=false).
 *   - the submit affordance does NOT self-disable synchronously in its own onClick
 *     (React-19 form-action cancel lesson — B1 revoke hang); it disables on pending.
 *   - no em dashes / no raw codes in the rendered copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { NotifyToggle } from "@/components/admin/settings/NotifyToggle";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

const noop = vi.fn(async () => ({ ok: true }) as const);

const SYNC = {
  testId: "alert-on-sync-problems",
  title: "Alert me about sync problems",
  ariaLabel: "Alert me about sync problems",
  description: "Email me when a sheet stops syncing or fails to parse for more than an hour.",
} as const;

const DIGEST = {
  testId: "daily-review-digest",
  title: "Daily review digest",
  ariaLabel: "Daily review digest",
  description:
    "A once-a-day email summarizing sheets that need your review, grouped by show. Nothing waiting means no email.",
} as const;

describe("NotifyToggle — reflects app_settings (Task 6.2)", () => {
  it("renders the ON state when on=true", () => {
    const { getByTestId } = render(
      <NotifyToggle {...SYNC} initial={{ kind: "value", on: true }} action={noop} />,
    );
    const toggle = getByTestId("alert-on-sync-problems-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.hasAttribute("disabled")).toBe(false);
  });

  it("renders the OFF state when on=false", () => {
    const { getByTestId } = render(
      <NotifyToggle {...DIGEST} initial={{ kind: "value", on: false }} action={noop} />,
    );
    const toggle = getByTestId("daily-review-digest-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("renders a disabled degraded control on infra_error (never a silent falsely-ON state)", () => {
    const { getByTestId } = render(
      <NotifyToggle {...SYNC} initial={{ kind: "infra_error" }} action={noop} />,
    );
    const toggle = getByTestId("alert-on-sync-problems-toggle");
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(getByTestId("alert-on-sync-problems-degraded").textContent ?? "").toMatch(
      /couldn|could not|setting/i,
    );
  });

  it("the submit toggle does not synchronously self-disable in its own onClick (React-19 dispatch safety)", () => {
    const { getByTestId } = render(
      <NotifyToggle {...DIGEST} initial={{ kind: "value", on: true }} action={noop} />,
    );
    const onclick = getByTestId("daily-review-digest-toggle").getAttribute("onclick") ?? "";
    expect(onclick).not.toMatch(/disabled\s*=\s*true/i);
  });

  it("renders both rows' copy without em dashes or raw codes", () => {
    for (const props of [SYNC, DIGEST]) {
      const { getByTestId } = render(
        <NotifyToggle {...props} initial={{ kind: "value", on: true }} action={noop} />,
      );
      const row = getByTestId(`${props.testId}-setting-row`);
      const text = row.textContent ?? "";
      expect(text).toContain(props.title);
      expect(text).toContain(props.description);
      expect(text).not.toContain("—"); // em dash
      expect(text).not.toMatch(/\b[A-Z][A-Z0-9_]{4,}\b/); // no SCREAMING_CASE raw codes
      cleanup();
    }
  });
});
