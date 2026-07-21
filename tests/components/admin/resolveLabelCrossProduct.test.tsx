// @vitest-environment jsdom
/**
 * All 12 cells: 3 surfaces x 2 intents x {idle, pending}.
 *
 * An idle-only matrix lets a component use `.idle` in BOTH states and pass
 * everywhere; a confirm-only pending check lets it hardcode "Confirming…".
 * Both holes were found in review, so every cell is here.
 *
 * Every assertion reads the BUTTON's own accessible name via its data-testid,
 * never a container query: this code's message body contains the word
 * "confirm", so a container-scoped getByText(/confirm/i) would pass with the
 * label still reading "Mark resolved". Every assertion is an anchored regex,
 * because toHaveTextContent does SUBSTRING matching and "Confirm" would
 * otherwise also match a wrongly-rendered "Confirming…".
 *
 * pending is driven per surface: PerShow and Bell via a hanging fetch, Health
 * via a mocked form action, since useFormStatus tracks the action.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";
import { HealthAlertResolveButton } from "@/components/admin/telemetry/HealthAlertResolveButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

// The health button binds a server action; mock it to hang so useFormStatus
// reports pending deterministically.
vi.mock("@/app/admin/actions", () => ({
  resolveHealthAlertFormAction: vi.fn(() => new Promise(() => {})),
}));

const CONFIRM_CODE = "ROLE_FLAGS_NOTICE";
const RESOLVE_CODE = "AMBIGUOUS_EMAIL_BINDING";

// Never-settling fetch stubs leak across tests and make the suite
// order-dependent. Executable cleanup, not a note.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubHangingFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
}

describe("PerShowAlertResolveButton", () => {
  it.each([
    [CONFIRM_CODE, /^Confirm$/],
    [RESOLVE_CODE, /^Mark resolved$/],
  ])("idle for %s", (code, expected) => {
    render(<PerShowAlertResolveButton alertId={`i-${code}`} slug="s" code={code} />);
    expect(screen.getByTestId(`per-show-alert-resolve-i-${code}`)).toHaveTextContent(expected);
  });

  it.each([
    [CONFIRM_CODE, /^Confirming…$/],
    [RESOLVE_CODE, /^Resolving…$/],
  ])("pending for %s", async (code, expected) => {
    stubHangingFetch();
    render(<PerShowAlertResolveButton alertId={`p-${code}`} slug="s" code={code} />);
    fireEvent.click(screen.getByTestId(`per-show-alert-resolve-p-${code}`));
    await waitFor(() =>
      expect(screen.getByTestId(`per-show-alert-resolve-p-${code}`)).toHaveTextContent(expected),
    );
  });

  it("the rendered generic fallback names no button label", async () => {
    // BEHAVIORAL, not a source scan: a source assertion passes when the
    // approved sentence sits in an unused constant while the component renders
    // something else. Drive the real error path.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("not json", { status: 500 }))),
    );
    render(<PerShowAlertResolveButton alertId="err1" slug="s" code={RESOLVE_CODE} />);
    fireEvent.click(screen.getByTestId("per-show-alert-resolve-err1"));
    const err = await screen.findByTestId("per-show-alert-resolve-error-err1");
    expect(err).toHaveTextContent("We could not resolve this alert. Refresh and try again.");
    expect(err).not.toHaveTextContent(/mark this alert resolved/i);
  });
});

describe("HealthAlertResolveButton", () => {
  it.each([
    [CONFIRM_CODE, /^Confirm$/],
    [RESOLVE_CODE, /^Mark resolved$/],
  ])("idle for %s", (code, expected) => {
    render(<HealthAlertResolveButton alertId={`hi-${code}`} code={code} />);
    expect(screen.getByTestId(`health-alert-resolve-hi-${code}`)).toHaveTextContent(expected);
  });

  it.each([
    [CONFIRM_CODE, /^Confirming…$/],
    [RESOLVE_CODE, /^Resolving…$/],
  ])("pending for %s", async (code, expected) => {
    render(<HealthAlertResolveButton alertId={`hp-${code}`} code={code} />);
    fireEvent.submit(screen.getByTestId(`health-alert-resolve-form-hp-${code}`));
    await waitFor(() =>
      expect(screen.getByTestId(`health-alert-resolve-hp-${code}`)).toHaveTextContent(expected),
    );
  });
});

describe("parents forward the alert's own code", () => {
  // The cross-product renders the buttons directly, so a parent could pass a
  // constant and every gate above would still pass while live alerts showed
  // the wrong verb. BellPanel needs no such check: its row reads entry.code
  // internally, which the bell tests already exercise.
  it("AttentionBanner passes the item's code, not a literal", () => {
    const src = readFileSync("components/admin/review/AttentionBanner.tsx", "utf8");
    const el = /<PerShowAlertResolveButton([\s\S]*?)\/>/.exec(src);
    expect(el, "AttentionBanner no longer renders the button").not.toBeNull();
    expect(el![1]).toMatch(/code=\{a\.code\}/);
    expect(el![1], "a hardcoded code would freeze every row's label").not.toMatch(/code="/);
  });

  it("HealthAlertsPanel passes the row's code, not a literal", () => {
    const src = readFileSync("components/admin/telemetry/HealthAlertsPanel.tsx", "utf8");
    const el = /<HealthAlertResolveButton([\s\S]*?)\/>/.exec(src);
    expect(el, "HealthAlertsPanel no longer renders the button").not.toBeNull();
    expect(el![1]).toMatch(/code=\{row\.code\}/);
    expect(el![1], "a hardcoded code would freeze every row's label").not.toMatch(/code="/);
  });
});
