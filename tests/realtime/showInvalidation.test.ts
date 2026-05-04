/**
 * tests/realtime/showInvalidation.test.ts (M4 Task 4.16 lib)
 *
 * Asserts lib/realtime/showInvalidation.ts wraps a single
 * supabase.rpc('publish_show_invalidation', { p_show_id }) call inside the
 * supplied transaction client and surfaces any RPC error.
 *
 * The application helper exists for write paths that mutate public.shows
 * (M6 Phase-2 commits) where the M2 statement-level triggers do NOT auto-
 * publish. The bytes the SQL function emits are identical to what the
 * triggers emit; this test only asserts the application contract.
 */
import { describe, expect, test, vi } from "vitest";
import { publishShowInvalidation } from "@/lib/realtime/showInvalidation";

function makeClientThatReturns(error: { message: string } | null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: vi.fn(async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: null, error };
    }),
  };
  return { client, calls };
}

describe("publishShowInvalidation", () => {
  test("calls rpc('publish_show_invalidation', { p_show_id }) with the supplied UUID", async () => {
    const { client, calls } = makeClientThatReturns(null);
    await publishShowInvalidation(
      client as unknown as Parameters<typeof publishShowInvalidation>[0],
      "00000000-0000-0000-0000-000000000abc",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("publish_show_invalidation");
    expect(calls[0]?.args).toEqual({
      p_show_id: "00000000-0000-0000-0000-000000000abc",
    });
  });

  test("throws an Error (not a silent return) when rpc reports an error", async () => {
    const { client } = makeClientThatReturns({ message: "permission denied" });
    await expect(
      publishShowInvalidation(
        client as unknown as Parameters<typeof publishShowInvalidation>[0],
        "00000000-0000-0000-0000-000000000xyz",
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
