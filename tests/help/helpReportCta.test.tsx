// @vitest-environment jsdom
/**
 * tests/help/helpReportCta.test.tsx — 2026-08-09 spec §3 test 2.
 *
 * The CTA at the foot of /help/errors captures the page's URL fragment (the
 * error-code anchor Doug arrived on) as `fieldRef.helpCode`. The load-bearing
 * property is not the capture itself but the BINDING: the modal persists
 * `{idempotencyKey, draft, status}` in sessionStorage scoped by `surfaceId`
 * and reuses the key on resume, so a `surfaceId` that does not co-vary with
 * the hash would let a resumed attempt reuse its key while the spread-at-submit
 * autocapture carries a different code. Every case below names the silent
 * misassociation it catches.
 *
 * The hash is driven with `window.location.hash = ...` + a dispatched
 * HashChangeEvent, which is what the page's own jump-list anchors and
 * RefAnchor links do at runtime.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelpReportCta } from "@/app/help/errors/_components/HelpReportCta";

const CODE_A = "AMBIGUOUS_EMAIL_BINDING";
const CODE_B = "PICKER_SHOW_UNAVAILABLE";
const SCOPE_PREFIX = "fxav-report-attempt-";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
  global.fetch = fetchMock as unknown as typeof fetch;
  sessionStorage.clear();
  setHash("");
});

afterEach(() => {
  cleanup();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

/** Drive the fragment the way the page's own anchors do. */
function setHash(fragment: string): void {
  window.location.hash = fragment;
  fireEvent(window, new HashChangeEvent("hashchange"));
}

function openModal(): void {
  fireEvent.click(screen.getByTestId("report-button-trigger"));
}

function typeDraft(text: string): void {
  fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: text } });
}

async function submit(): Promise<Record<string, unknown>> {
  const before = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByTestId("report-modal-submit"));
  await waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 1));
  const init = fetchMock.mock.calls[before]![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function scope(id: string): string | null {
  return sessionStorage.getItem(`${SCOPE_PREFIX}${id}`);
}

describe("HelpReportCta (spec §2.1, §3 test 2)", () => {
  test("case 1 — hash at mount is captured as fieldRef.helpCode with a null show", async () => {
    setHash(`#${CODE_A}`);
    render(<HelpReportCta />);
    openModal();
    typeDraft("keeps happening");
    const body = await submit();

    expect(body.surface).toBe("help");
    expect(body.show_id).toBeNull();
    expect(body.fieldRef).toEqual({ helpCode: CODE_A });
  });

  test("case 2 — hashless arrival sends NO fieldRef and scopes to help-errors-none", async () => {
    render(<HelpReportCta />);
    openModal();
    typeDraft("no code to report");
    // Read the scope BEFORE submitting: a terminal success clears it.
    expect(scope("help-errors-none")).not.toBeNull();
    const body = await submit();

    // Absent, not `{ helpCode: "" }` — the issue's Field/section ref line must
    // read "Not captured" rather than an empty object.
    expect(body).not.toHaveProperty("fieldRef");
  });

  test("case 3 — a post-mount fragment change submits the NEW code under the NEW scope", async () => {
    setHash(`#${CODE_A}`);
    render(<HelpReportCta />);
    setHash(`#${CODE_B}`);
    openModal();
    typeDraft("still happening");
    // Read the scope BEFORE submitting: a terminal success clears it. A fresh
    // key under B's scope is the binding half of the claim; the helpCode below
    // is the capture half.
    expect(scope(`help-errors-c-${CODE_B}`)).not.toBeNull();
    expect(scope(`help-errors-c-${CODE_A}`)).toBeNull();
    const body = await submit();

    // Catches a mount-only hash reader: it would silently submit CODE_A.
    expect(body.fieldRef).toEqual({ helpCode: CODE_B });
  });

  test("case 4 — a draft composed under one code does not leak into another", () => {
    setHash(`#${CODE_A}`);
    render(<HelpReportCta />);
    openModal();
    typeDraft("draft written about A");
    fireEvent.click(screen.getByTestId("report-modal-close"));

    setHash(`#${CODE_B}`);
    openModal();
    // Catches a stable surfaceId: B's attempt would hydrate A's draft and
    // reuse A's idempotency key while submitting helpCode B.
    expect((screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement).value).toBe("");
  });

  test("case 5 — returning to the original code resumes its draft and its key", async () => {
    setHash(`#${CODE_A}`);
    render(<HelpReportCta />);
    openModal();
    typeDraft("draft written about A");
    const keyA = JSON.parse(scope(`help-errors-c-${CODE_A}`)!).idempotencyKey as string;
    fireEvent.click(screen.getByTestId("report-modal-close"));

    setHash(`#${CODE_B}`);
    openModal();
    fireEvent.click(screen.getByTestId("report-modal-close"));

    setHash(`#${CODE_A}`);
    openModal();
    expect((screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement).value).toBe(
      "draft written about A",
    );
    const body = await submit();
    expect(body.idempotency_key).toBe(keyA);
    expect(body.fieldRef).toEqual({ helpCode: CODE_A });
  });

  test("case 6 — a fragment change WHILE the modal is open remounts instead of re-pointing it", () => {
    setHash(`#${CODE_A}`);
    render(<HelpReportCta />);
    openModal();
    typeDraft("draft written about A");
    const persistedA = scope(`help-errors-c-${CODE_A}`)!;
    const keyA = JSON.parse(persistedA).idempotencyKey as string;

    setHash(`#${CODE_B}`);

    // The key={hash} remount closes the modal. Without it, the open modal
    // keeps A's useState key and draft while surfaceId/autocapture move to B —
    // persisting A's attempt under B's scope and submitting it with helpCode B.
    expect(screen.queryByTestId("report-modal-root")).toBeNull();
    const persistedB = scope(`help-errors-c-${CODE_B}`);
    if (persistedB !== null) {
      expect(persistedB).not.toContain(keyA);
      expect(persistedB).not.toContain("draft written about A");
    }

    openModal();
    expect((screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement).value).toBe("");
    expect(JSON.parse(scope(`help-errors-c-${CODE_B}`)!).idempotencyKey).not.toBe(keyA);
  });

  test("case 7 — a literal #no-code fragment cannot alias the hashless scope", () => {
    render(<HelpReportCta />);
    openModal();
    typeDraft("hashless draft");
    fireEvent.click(screen.getByTestId("report-modal-close"));

    setHash("#no-code");
    openModal();
    // Catches a `${hash || "no-code"}` sentinel interpolation: the literal
    // fragment would land on the hashless attempt's key and draft.
    expect((screen.getByTestId("report-modal-textarea") as HTMLTextAreaElement).value).toBe("");
    expect(scope("help-errors-c-no-code")).not.toBeNull();
    expect(JSON.parse(scope("help-errors-c-no-code")!).idempotencyKey).not.toBe(
      JSON.parse(scope("help-errors-none")!).idempotencyKey,
    );
  });

  test("case 8 — the CTA passes the info-bg ring offset (the Callout background)", () => {
    render(<HelpReportCta />);
    const button = screen.getByTestId("report-button-trigger");
    // Omitting the prop silently selects the accent default ("surface"), which
    // paints a wrong-color gap inside the note Callout's bg-info-bg.
    expect(button.className).toContain("focus-visible:ring-offset-info-bg");
    expect(button.className).not.toContain("focus-visible:ring-offset-surface");
    expect(button.textContent).toBe("Report a recurring error");
  });
});
