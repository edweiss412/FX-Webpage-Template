import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readUnresolvedSheets } from "@/app/admin/_unresolvedSheets";

type ManifestRow = { drive_file_id: string; status: string };
type PendingRow = {
  drive_file_id: string;
  last_finalize_failure_code: string | null;
  parse_result: unknown;
};

/**
 * Minimal Supabase client double. The manifest read is `from(...).select(...).eq(...).in(...)`
 * then awaited; the pending read is `from(...).select(...).eq(...).in(...)` then awaited.
 * Both terminal builders are thenable and resolve to `{ data, error }`.
 */
function clientReturning(
  manifestRows: ManifestRow[],
  pendingRows: PendingRow[],
  opts: { manifestError?: { message: string }; pendingError?: { message: string } } = {},
) {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.in = self;
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === "onboarding_scan_manifest") {
        resolve({
          data: opts.manifestError ? null : manifestRows,
          error: opts.manifestError ?? null,
        });
      } else {
        resolve({ data: opts.pendingError ? null : pendingRows, error: opts.pendingError ?? null });
      }
    };
    return chain;
  };
  return { from };
}

const SESSION = "11111111-1111-1111-1111-111111111111";

function mockClient(client: unknown) {
  (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(client);
}

describe("readUnresolvedSheets", () => {
  it("includes a demoted staged+code row, excludes a clean staged row", async () => {
    mockClient(
      clientReturning(
        [
          { drive_file_id: "D_STUCK", status: "staged" },
          { drive_file_id: "D_CLEAN", status: "staged" },
        ],
        [
          {
            drive_file_id: "D_STUCK",
            last_finalize_failure_code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            parse_result: { show: { title: "East Coast" } },
          },
          { drive_file_id: "D_CLEAN", last_finalize_failure_code: null, parse_result: null },
        ],
      ),
    );
    const res = await readUnresolvedSheets(SESSION);
    expect(Array.isArray(res)).toBe(true);
    const rows = res as Extract<typeof res, unknown[]>;
    expect(rows.map((r) => r.driveFileId)).toEqual(["D_STUCK"]);
    expect(rows[0]!.displayName).toBe("East Coast");
    expect(rows[0]!.failureCode).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(rows[0]!.reApplyHref).toBe(`/admin/onboarding/staged/${SESSION}/D_STUCK`);
  });

  it("includes blocking-status rows regardless of failure code", async () => {
    mockClient(
      clientReturning(
        [{ drive_file_id: "D_HARD", status: "hard_failed" }],
        [{ drive_file_id: "D_HARD", last_finalize_failure_code: null, parse_result: null }],
      ),
    );
    const rows = (await readUnresolvedSheets(SESSION)) as {
      driveFileId: string;
      displayName: string;
    }[];
    expect(rows.map((r) => r.driveFileId)).toEqual(["D_HARD"]);
    // no parse_result title → fall back to driveFileId
    expect(rows[0]!.displayName).toBe("D_HARD");
  });

  it("returns an empty array when nothing is unresolved", async () => {
    mockClient(
      clientReturning(
        [{ drive_file_id: "D_CLEAN", status: "staged" }],
        [{ drive_file_id: "D_CLEAN", last_finalize_failure_code: null, parse_result: null }],
      ),
    );
    const res = await readUnresolvedSheets(SESSION);
    expect(res).toEqual([]);
  });

  it("returns infra_error when the manifest read errors", async () => {
    mockClient(clientReturning([], [], { manifestError: { message: "boom" } }));
    const res = await readUnresolvedSheets(SESSION);
    expect(res).toMatchObject({ kind: "infra_error" });
  });

  it("returns infra_error when the pending read errors", async () => {
    mockClient(
      clientReturning([{ drive_file_id: "D_HARD", status: "hard_failed" }], [], {
        pendingError: { message: "pending boom" },
      }),
    );
    const res = await readUnresolvedSheets(SESSION);
    expect(res).toMatchObject({ kind: "infra_error" });
  });

  it("short-circuits to an empty array without a pending read when no manifest rows match", async () => {
    // Empty manifest → no drive ids → no pending read needed; must not error.
    mockClient(clientReturning([], []));
    const res = await readUnresolvedSheets(SESSION);
    expect(res).toEqual([]);
  });
});
