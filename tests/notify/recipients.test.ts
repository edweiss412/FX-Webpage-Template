import { describe, expect, test, vi } from "vitest";
import { activeRecipients } from "@/lib/notify/recipients";

/**
 * Fake service-role client whose `.from("admin_emails").select("email").is("revoked_at", null)`
 * chain resolves to the given `{ data, error }`. The `.is(..., null)` filter is server-side,
 * so the fake returns only the rows the DB would (active-only).
 */
function fakeClient(result: { data: unknown; error: unknown }) {
  const is = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ is }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, is };
}

describe("activeRecipients", () => {
  test("returns only active recipients, canonicalized", async () => {
    // The DB already filtered revoked rows via .is("revoked_at", null); the active
    // row's email is returned mixed-case and must come back canonicalized.
    const { client, from, select, is } = fakeClient({
      data: [{ email: "Doug@FXAV.app" }],
      error: null,
    });
    const result = await activeRecipients(client);
    expect(result).toEqual({ kind: "ok", recipients: ["doug@fxav.app"] });
    // Negative-regression: reads admin_emails via the injected service-role client
    // (NOT listAdminEmails), filtering on revoked_at IS NULL.
    expect(from).toHaveBeenCalledWith("admin_emails");
    expect(select).toHaveBeenCalledWith("email");
    expect(is).toHaveBeenCalledWith("revoked_at", null);
  });

  test("drops non-canonicalizable emails", async () => {
    const { client } = fakeClient({ data: [{ email: "  " }, { email: "ok@x.com" }], error: null });
    expect(await activeRecipients(client)).toEqual({ kind: "ok", recipients: ["ok@x.com"] });
  });

  test("a returned DB error → infra_error (never throws, never a silent skip)", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    expect(await activeRecipients(client)).toEqual({ kind: "infra_error" });
  });

  test("a thrown DB fault → infra_error", async () => {
    const from = vi.fn(() => {
      throw new Error("network down");
    });
    expect(await activeRecipients({ from } as never)).toEqual({ kind: "infra_error" });
  });
});
