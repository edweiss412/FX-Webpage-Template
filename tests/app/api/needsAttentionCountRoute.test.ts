// Mobile needs-attention Task 3 (spec §4.2 item 2): GET /api/admin/needs-attention-count.
// Failure modes pinned: (a) ok payload + no-store header so the badge never
// reads a cached count; (b) infra faults map to 503 WITHOUT leaking raw
// catalog codes (invariant 5); (c) AdminInfraError → 503; (d) Next control
// flow (forbidden()/notFound()) propagates instead of being swallowed as 503.
import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET } from "@/app/api/admin/needs-attention-count/route";
import { loadNeedsAttentionCount } from "@/lib/admin/needsAttentionCount";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";

vi.mock("@/lib/auth/requireAdmin", () => {
  class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";

    constructor(message: string) {
      super(message);
      this.name = "AdminInfraError";
    }
  }
  return {
    AdminInfraError,
    requireAdminIdentity: vi.fn(),
  };
});

vi.mock("@/lib/admin/needsAttentionCount", () => ({
  loadNeedsAttentionCount: vi.fn(),
}));

const requireAdminIdentityMock = vi.mocked(requireAdminIdentity);
const loadNeedsAttentionCountMock = vi.mocked(loadNeedsAttentionCount);

describe("GET /api/admin/needs-attention-count", () => {
  beforeEach(() => {
    requireAdminIdentityMock.mockReset();
    loadNeedsAttentionCountMock.mockReset();
    requireAdminIdentityMock.mockResolvedValue({ email: "admin@fxav.test" });
  });

  test("ok → 200 { count } with Cache-Control: no-store", async () => {
    loadNeedsAttentionCountMock.mockResolvedValue({ kind: "ok", count: 5 });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 5 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("helper infra_error → 503 with no raw catalog codes in the body", async () => {
    loadNeedsAttentionCountMock.mockResolvedValue({ kind: "infra_error" });

    const response = await GET();

    expect(response.status).toBe(503);
    // Invariant 5: no raw §12.4 catalog-code shapes (SCREAMING_SNAKE) leak out.
    const bodyText = await response.text();
    expect(bodyText).not.toMatch(/[A-Z_]{6,}/);
  });

  test("requireAdminIdentity throwing AdminInfraError → 503 without touching the helper", async () => {
    requireAdminIdentityMock.mockRejectedValue(new AdminInfraError("forced"));

    const response = await GET();

    expect(response.status).toBe(503);
    const bodyText = await response.text();
    expect(bodyText).not.toMatch(/[A-Z_]{6,}/);
    expect(loadNeedsAttentionCountMock).not.toHaveBeenCalled();
  });

  test("requireAdminIdentity throwing Next control flow propagates (rejects)", async () => {
    // Stand-in for forbidden()/notFound() control-flow errors: a plain Error
    // that is NOT an AdminInfraError must escape the handler for Next to catch.
    const controlFlow = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    requireAdminIdentityMock.mockRejectedValue(controlFlow);

    await expect(GET()).rejects.toBe(controlFlow);
    expect(loadNeedsAttentionCountMock).not.toHaveBeenCalled();
  });
});
