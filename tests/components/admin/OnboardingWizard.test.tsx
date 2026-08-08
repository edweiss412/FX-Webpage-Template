// @vitest-environment jsdom
/**
 * tests/components/admin/OnboardingWizard.test.tsx (M10 §B Task 10.2 / Phase 1)
 *
 * Pins the public contract of <OnboardingWizard>, the server-side wizard
 * shell that picks the current step from `settings` + URL `?step=N` and
 * renders the matching step body plus the wizard chrome (step indicator,
 * Start Over button).
 *
 * Phase 1 only ships Step 1; Step 2 and Step 3 render placeholder bodies
 * so the URL routing transitions exist before the real step components
 * land (Phase 2). When the service-account email cannot be loaded from
 * the environment, the wizard renders the §12.4-cataloged operator-error
 * copy instead of Step 1 — never a raw code (AGENTS.md §1.5).
 *
 * Server Component — tests await the async function and render its JSX
 * output through React Testing Library.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import { startOverServerAction } from "@/lib/onboarding/serverActions";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { premiseHolds } from "@/tests/_shared/premise";

// Step2Verify (rendered when ?step=2) uses useRouter() to call
// router.refresh() on the admin-log-only "superseded" outcome. jsdom
// has no app-router context, so we stub it here at the file level.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "fxav-sync@fxav-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
});

const FRESH_SETTINGS: AppSettingsRow = {
  id: "default",
  watched_folder_id: null,
  watched_folder_name: null,
  watched_folder_set_by_email: null,
  watched_folder_set_at: null,
  active_signing_key_id: "test-key",
  pending_folder_id: null,
  pending_folder_name: null,
  pending_folder_set_by_email: null,
  pending_folder_set_at: null,
  pending_wizard_session_id: null,
  pending_wizard_session_at: null,
  updated_at: new Date().toISOString(),
};

const WIZARD_IN_FLIGHT_SETTINGS: AppSettingsRow = {
  ...FRESH_SETTINGS,
  pending_wizard_session_id: "00000000-0000-0000-0000-000000000001",
  pending_wizard_session_at: new Date().toISOString(),
};

let savedEnv: string | undefined;
let captured: LogRecord[];

const OPERATOR_ERROR_MESSAGE = "service-account credentials unusable; onboarding wizard blocked";

/**
 * The whole-record accept-set (AC-4), scoped to exactly the nine fields
 * `persistAppEvent` writes (lib/log/persist.ts:16) — NOT a shorter local list.
 * Two review rounds each broke a narrower guard: a denylist fell to a parse
 * message relocated into `message`, and a context-only accept-set fell to a
 * fragment placed in `source`, which buildRecord promotes out of context onto
 * the record and which persists as its own app_events column. A guard narrower
 * than the persisted row leaves a channel, every time.
 *
 * `requestId` is null rather than a matcher: the wizard runs outside
 * runWithRequestContext, so buildRecord's ALS fallback yields null. Every field
 * here is a fixed literal by design — an oracle read back from the record would
 * admit a mutant that assigned derived text to it.
 */
function expectedOperatorErrorRecord(reason: string): Record<string, unknown> {
  return {
    level: "error",
    source: "admin.onboardingWizard",
    message: OPERATOR_ERROR_MESSAGE,
    code: "ONBOARDING_OPERATOR_ERROR",
    requestId: null,
    showId: null,
    driveFileId: null,
    actorHash: null,
    context: { reason },
  };
}

/**
 * Cardinality is half the assertion: a `toEqual` on a SELECTED record says
 * nothing about how many were emitted, while AC-3 says "exactly one record".
 */
function expectExactlyOneOperatorErrorRecord(reason: string): void {
  const matched = captured.filter((r) => r.code === "ONBOARDING_OPERATOR_ERROR");
  expect(matched).toHaveLength(1);
  expect(matched[0]!).toEqual(expectedOperatorErrorRecord(reason));
}

beforeEach(() => {
  savedEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
  captured = [];
  setLogSink((record) => {
    captured.push(record);
  });
});

afterEach(() => {
  cleanup();
  resetLogSink();
  if (savedEnv === undefined) {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  } else {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = savedEnv;
  }
});

describe("OnboardingWizard", () => {
  test("renders Step 1 by default when no ?step param is provided", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(getByTestId("wizard-step1")).toBeTruthy();
    expect(getByTestId("wizard-step1-eyebrow").textContent).toContain("Step 1 of 3");
  });

  test("passes the parsed service-account email into Step1Share", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(getByTestId("wizard-step1-service-account-email").textContent).toContain(
      "fxav-sync@fxav-project.iam.gserviceaccount.com",
    );
  });

  test("renders the Start Over form bound to startOverServerAction", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    const form = getByTestId("wizard-start-over-form") as HTMLFormElement;
    // React Server Actions surface as the same function reference passed
    // to the form `action` prop — pin the binding so a regression that
    // swapped in a no-op or the wrong action surfaces immediately.
    // RTL renders the form with a React-managed action; reflect into the
    // attributes that React assigns for inspection.
    // The data attribute is set by the component to make the binding
    // assertable without leaking server-action internals into the DOM.
    expect(form.dataset.action).toBe("startOverServerAction");
    // Sanity: the imported reference is present in the test runtime.
    expect(typeof startOverServerAction).toBe("function");
    // The visible button label.
    expect(getByTestId("wizard-start-over-button").textContent).toContain("Start over");
  });

  test("when ?step=2 is in the URL, renders the real Step2Verify component", async () => {
    const { getByTestId, queryByTestId } = render(
      await OnboardingWizard({
        settings: FRESH_SETTINGS,
        searchParams: { step: "2" },
      }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    // Step2Verify renders the folder URL input + verify-and-scan button.
    expect(getByTestId("wizard-step2-folder-url-input")).toBeTruthy();
    expect(getByTestId("wizard-step2-submit")).toBeTruthy();
  });

  test("when ?step=3 with no pending session, renders the no-session empty state", async () => {
    // FRESH_SETTINGS has pending_wizard_session_id = null — step 3 can't
    // fetch a manifest, so render the explanatory empty state instead of
    // hitting the Supabase fetch.
    const { getByTestId } = render(
      await OnboardingWizard({
        settings: FRESH_SETTINGS,
        searchParams: { step: "3" },
      }),
    );
    expect(getByTestId("wizard-step3-no-session").textContent ?? "").toMatch(
      /Nothing scanned yet/i,
    );
  });

  test("ignores an unknown ?step value and falls back to Step 1", async () => {
    const { getByTestId, queryByTestId } = render(
      await OnboardingWizard({
        settings: FRESH_SETTINGS,
        searchParams: { step: "banana" },
      }),
    );
    expect(getByTestId("wizard-step1")).toBeTruthy();
    expect(queryByTestId("wizard-step2-placeholder")).toBeNull();
  });

  test("renders Step 1 when wizard is mid-flight (pending_wizard_session_id non-null)", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({
        settings: WIZARD_IN_FLIGHT_SETTINGS,
        searchParams: {},
      }),
    );
    expect(getByTestId("wizard-step1")).toBeTruthy();
  });

  test("HIDES Start Over when watched_folder_id is non-null (re-run setup must route through /admin/settings)", async () => {
    // Per spec §9.0: "After onboarding succeeds the [pre-onboarding
    // 'Start over'] affordance disappears — restart goes through
    // `/admin/settings` instead." The destructive
    // startOverServerAction lacks the checkpoint-aware suppression
    // that rerunSetupServerAction has, so post-onboarding restarts
    // MUST flow through Re-run Setup so a stale tab cannot strand
    // published=false finalize rows.
    const reRunSettings: AppSettingsRow = {
      ...WIZARD_IN_FLIGHT_SETTINGS,
      watched_folder_id: "folder-abc",
      watched_folder_name: "Shows 2026",
      watched_folder_set_at: new Date().toISOString(),
    };
    const { queryByTestId, getByTestId } = render(
      await OnboardingWizard({ settings: reRunSettings, searchParams: {} }),
    );
    // Wizard itself still renders (Step 1).
    expect(getByTestId("wizard-step1")).toBeTruthy();
    // But Start Over must be absent.
    expect(queryByTestId("wizard-start-over-form")).toBeNull();
    expect(queryByTestId("wizard-start-over-button")).toBeNull();
  });

  test("HIDES Start Over on operator-error path when watched_folder_id is non-null", async () => {
    // Even when the env is broken, the post-onboarding restart path is
    // /admin/settings Re-run Setup. The unconditional purge form must
    // stay hidden.
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const reRunSettings: AppSettingsRow = {
      ...WIZARD_IN_FLIGHT_SETTINGS,
      watched_folder_id: "folder-abc",
    };
    const { queryByTestId } = render(
      await OnboardingWizard({ settings: reRunSettings, searchParams: {} }),
    );
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
    expect(queryByTestId("wizard-start-over-form")).toBeNull();
    expect(queryByTestId("wizard-start-over-button")).toBeNull();
  });

  test("when GOOGLE_SERVICE_ACCOUNT_JSON is missing, renders cataloged operator-error copy (no raw code)", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const { container, queryByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
    const body = container.textContent ?? "";
    const operatorErrorCopy = MESSAGE_CATALOG.ONBOARDING_OPERATOR_ERROR.dougFacing!;
    expect(body).toContain(operatorErrorCopy);
    // No raw code rendered.
    expect(body).not.toContain("ONBOARDING_OPERATOR_ERROR");
    // Start Over still reachable so the operator has a recovery path
    // even when the env is broken.
    expect(queryByTestId("wizard-start-over-button")).toBeTruthy();
    expectExactlyOneOperatorErrorRecord("env_missing");
  });

  test("when GOOGLE_SERVICE_ACCOUNT_JSON is malformed JSON, renders the same operator-error copy", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{not-valid-json";
    const { container, queryByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
    const body = container.textContent ?? "";
    expect(body).toContain(MESSAGE_CATALOG.ONBOARDING_OPERATOR_ERROR.dougFacing!);
    expectExactlyOneOperatorErrorRecord("json_malformed");
  });

  test("when client_email is missing from the service-account JSON, renders the operator-error copy", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ private_key: "x" });
    const { queryByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
    expectExactlyOneOperatorErrorRecord("client_email_missing");
  });

  /**
   * One case per GUARD CONDITION in readServiceAccountEmail, not merely one per
   * disjunct of the shape check. The three cases above already build three of
   * the eight environments; these five turn the remaining conditions red.
   *
   * Four distinct expected `reason` values across eight environments means a
   * hardcoded `reason` matches at most three cases and fails at least five.
   */
  const RESOLVER_CASES: ReadonlyArray<{
    label: string;
    raw: string;
    reason: string;
    guard: string;
  }> = [
    {
      label: "an EMPTY-STRING env value",
      raw: "",
      reason: "env_missing",
      // A `raw == null` guard would send "" to JSON.parse, which throws — and
      // the failure would be mislabelled json_malformed.
      guard: "!raw (empty-string arm)",
    },
    {
      label: "the JSON literal null",
      raw: "null",
      reason: "json_not_an_object",
      // The shipped resolver's try wraps the property read too, so this parses
      // successfully and then throws a TypeError into the catch. Labelling that
      // json_malformed would assert a parse failure that did not happen.
      guard: "parsed === null",
    },
    {
      label: "a JSON array",
      raw: "[]",
      reason: "json_not_an_object",
      // typeof [] === "object" and [] !== null, so an array escapes a
      // typeof/null test and would land on client_email_missing — asserting an
      // object was supplied and merely lacked a field.
      guard: "Array.isArray(parsed)",
    },
    {
      label: "a JSON number",
      raw: "123",
      reason: "json_not_an_object",
      guard: 'typeof parsed !== "object"',
    },
    {
      label: "an EMPTY client_email",
      raw: JSON.stringify({ client_email: "" }),
      reason: "client_email_missing",
      // The worst row in the table: break this condition and the wizard renders
      // NORMALLY with an empty service-account email, suppressing both the
      // operator-error surface and its telemetry. Every other broken condition
      // merely produces a wrong label; this one produces a silent success on a
      // misconfigured deploy.
      guard: "email.length > 0",
    },
  ];

  for (const { label, raw, reason, guard } of RESOLVER_CASES) {
    test(`when GOOGLE_SERVICE_ACCOUNT_JSON is ${label}, renders the operator error and emits ${reason} (guard: ${guard})`, async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = raw;
      const { queryByTestId } = render(
        await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
      );
      // The refusal surface: the error block AND the shell around it. Returning
      // only OperatorErrorBlock would keep wizard-operator-error present while
      // dropping the shell.
      expect(queryByTestId("wizard-step1")).toBeNull();
      expect(queryByTestId("wizard-operator-error")).toBeTruthy();
      expect(queryByTestId("wizard-start-over-button")).toBeTruthy();
      expectExactlyOneOperatorErrorRecord(reason);
    });
  }

  /**
   * The secrets guard (AC-4). GOOGLE_SERVICE_ACCOUNT_JSON holds a service-account
   * PRIVATE KEY, so the emit carries the reason enum and nothing else derived
   * from it — not the raw value or any part of it, not the parsed object or any
   * field of it, and not the JSON.parse error, whose V8 message embeds a snippet
   * of the offending input.
   *
   * This is a REGRESSION guard with no natural RED, and that is stated rather
   * than glossed: before the emit landed the record array was empty so every
   * negative assertion passed vacuously, and after it landed the shipped emit is
   * already safe so they pass legitimately. Its RED was obtained by MUTATION —
   * four mutants across the persisted row's three leak-channel families, each
   * observed failing in the working tree and reverted, none committed. See the
   * commit message for the four observations and the fixture-contrast run.
   */
  const SENTINEL = "SENTINEL-PRIVATE-KEY-DO-NOT-LOG";

  const SECRET_BEARING_CASES: ReadonlyArray<{ label: string; raw: string; reason: string }> = [
    {
      // The obvious fixture — omit client_email entirely — is VACUOUS for the
      // parsed-field channel: a mutant like `clientEmail: parsed.client_email`
      // sets undefined, the logger drops undefined keys, the context key set
      // stays ["reason"], and the accept-set passes while the mutant is
      // indistinguishable from safe code. The field must be PRESENT and
      // secret-bearing for the guard to have any power over it, and a
      // non-string value is what routes it to client_email_missing while
      // keeping it present.
      label: "well-formed with a PRESENT, non-string, secret-bearing client_email",
      raw: JSON.stringify({ client_email: { secret: SENTINEL }, private_key: "x" }),
      reason: "client_email_missing",
    },
    {
      // Exercises the parse-error path, where the V8 message is the leak vector.
      label: "malformed and secret-bearing",
      raw: `{"private_key": "${SENTINEL}"`,
      reason: "json_malformed",
    },
  ];

  for (const { label, raw, reason } of SECRET_BEARING_CASES) {
    test(`no service-account material reaches the sink — ${label}`, async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = raw;
      const { queryByTestId } = render(
        await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
      );
      expect(queryByTestId("wizard-operator-error")).toBeTruthy();

      // The whole-record accept-set is the guard: any field added, renamed, or
      // populated with derived text fails it — in context, in message, and in
      // every promoted column.
      expectExactlyOneOperatorErrorRecord(reason);

      const matched = captured.filter((r) => r.code === "ONBOARDING_OPERATOR_ERROR");

      // PREMISE 1: the sentinel is in the environment the component reads —
      // otherwise the content backstop below has nothing to find and would pass
      // against a leaking implementation.
      premiseHolds(
        "the sentinel is present in GOOGLE_SERVICE_ACCOUNT_JSON, so a leak would be observable in the captured records",
        (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "").includes(SENTINEL),
      );
      // PREMISE 2: exactly one record was captured. This is the one that
      // matters: without it, a case whose env setup or sink capture silently
      // failed passes by finding nothing in an EMPTY array — the "expected value
      // read from the same degenerate source as the actual" shape.
      premiseHolds(
        "exactly one ONBOARDING_OPERATOR_ERROR record was captured, so the content backstop below is searching a non-empty record",
        matched.length === 1,
      );

      // Backstop only, for a leak arriving through a channel the record shape
      // does not describe.
      const serialized = JSON.stringify(matched);
      expect(serialized).not.toContain(SENTINEL);
      expect(serialized).not.toContain("private_key");
    });
  }
});
