/**
 * tests/admin/embeddedAdminEmails.test.ts
 *
 * Behavioral contract for fetchEmbeddedAdminEmails():
 *   ok          → { kind: 'ok', rows }
 *   AdminEmailsInfraError thrown → { kind: 'infra_error' }
 *   unknown throw → rethrows (programmer bugs / Next control-flow must reach route boundary)
 *
 * not-subject-to-meta: the wrapper has no direct supabase.from await;
 * invariant 9 coverage is provided here instead of infraRegistry.
 */
import { describe, expect, it, vi } from "vitest";
import { AdminEmailsInfraError, type AdminEmailRow } from "@/lib/data/adminEmails";

// Mock listAdminEmails before importing the adapter so vi.mock hoists correctly.
vi.mock("@/lib/data/adminEmails", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/adminEmails")>();
  return {
    ...actual,
    listAdminEmails: vi.fn(),
  };
});

import { fetchEmbeddedAdminEmails } from "@/lib/admin/embeddedAdminEmails";
import { listAdminEmails } from "@/lib/data/adminEmails";

const mockListAdminEmails = vi.mocked(listAdminEmails);

const SAMPLE_ROWS: AdminEmailRow[] = [
  {
    email: "admin@example.com",
    added_by: "setup",
    added_at: "2026-01-01T00:00:00Z",
    revoked_by: null,
    revoked_at: null,
    note: null,
  },
];

describe("fetchEmbeddedAdminEmails", () => {
  it("ok → { kind:'ok', rows }", async () => {
    mockListAdminEmails.mockResolvedValueOnce(SAMPLE_ROWS);

    const result = await fetchEmbeddedAdminEmails();

    expect(result).toEqual({ kind: "ok", rows: SAMPLE_ROWS });
  });

  it("AdminEmailsInfraError thrown → { kind:'infra_error' }", async () => {
    mockListAdminEmails.mockRejectedValueOnce(
      new AdminEmailsInfraError("listAdminEmails: connection refused"),
    );

    const result = await fetchEmbeddedAdminEmails();

    expect(result).toEqual({ kind: "infra_error" });
  });

  it("UNKNOWN throw propagates (NOT swallowed as infra_error)", async () => {
    // programmer bugs / Next control-flow must reach the route boundary
    mockListAdminEmails.mockRejectedValueOnce(new Error("unexpected programmer bug"));

    await expect(fetchEmbeddedAdminEmails()).rejects.toThrow("unexpected programmer bug");
  });
});
