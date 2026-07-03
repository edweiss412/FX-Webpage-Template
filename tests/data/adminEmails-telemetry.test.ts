import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

// Audit finding #4 + "missing error serialization" + #20 invariant-9 hardening.
// wrapInfra's ADMIN_EMAILS_INFRA emit bound `err` in the catch but DROPPED it
// from the log fields, so a construction throw / RPC throw / RPC returned-error
// all collapsed to one opaque row. It must now carry a serialized
// context.error + the `label` context, wrapped best-effort (invariant 9).

const state = vi.hoisted(() => ({
  constructThrow: null as Error | null,
  rpcThrow: null as Error | null,
  rpcReturnedError: null as { message: string } | null,
  fromError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.constructThrow) throw state.constructThrow;
    return {
      rpc: async () => {
        if (state.rpcThrow) throw state.rpcThrow;
        return { data: null, error: state.rpcReturnedError };
      },
      from: () => ({
        select: () => ({
          order: () => ({
            order: async () => ({ data: null, error: state.fromError }),
          }),
        }),
      }),
    };
  },
}));

async function withCapture(
  fn: (sink: LogRecord[], mod: typeof import("@/lib/data/adminEmails")) => Promise<void>,
) {
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  const mod = await import("@/lib/data/adminEmails");
  try {
    await fn(sink, mod);
  } finally {
    log.resetLogSink();
  }
}

function lastInfra(sink: LogRecord[]): LogRecord {
  const rec = [...sink]
    .reverse()
    .find(
      (r) =>
        r.level === "error" && r.source === "data/adminEmails" && r.code === "ADMIN_EMAILS_INFRA",
    );
  expect(rec, "no ADMIN_EMAILS_INFRA error emitted").toBeDefined();
  return rec!;
}

beforeEach(() => {
  state.constructThrow = null;
  state.rpcThrow = null;
  state.rpcReturnedError = null;
  state.fromError = null;
});
afterEach(() => vi.clearAllMocks());

describe("adminEmails wrapInfra telemetry (finding #4)", () => {
  test("listAdminEmails construction throw → serialized error + label context", async () => {
    await withCapture(async (sink, { listAdminEmails, AdminEmailsInfraError }) => {
      state.constructThrow = new Error("no SUPABASE_URL");
      await expect(listAdminEmails()).rejects.toBeInstanceOf(AdminEmailsInfraError);
      const rec = lastInfra(sink);
      expect(rec.context.label).toBe("listAdminEmails");
      expect((rec.context.error as { message?: string }).message).toBe("no SUPABASE_URL");
    });
  });

  test("addAdminEmail RPC throw → serialized error captures the thrown message", async () => {
    await withCapture(async (sink, { addAdminEmail, AdminEmailsInfraError }) => {
      state.rpcThrow = new Error("rpc network fault");
      await expect(
        addAdminEmail({ rawEmail: "x@example.com", addedBy: "u1" }),
      ).rejects.toBeInstanceOf(AdminEmailsInfraError);
      const rec = lastInfra(sink);
      expect(rec.context.label).toBe("addAdminEmail");
      // The inner op throws the intentional AdminEmailsInfraError first
      // (`addAdminEmail.rpc: rpc network fault`); wrapInfra re-emits that.
      expect((rec.context.error as { message?: string }).message).toMatch(/rpc network fault/);
    });
  });

  // Anti-constant: two distinct faults → two distinct serialized context.error.
  test("two distinct faults → two distinct serialized context.error (not a constant)", async () => {
    let a: unknown;
    let b: unknown;
    await withCapture(async (sink, { listAdminEmails }) => {
      state.constructThrow = new Error("fault-ALPHA");
      await listAdminEmails().catch(() => {});
      a = lastInfra(sink).context.error;
    });
    state.constructThrow = null;
    await withCapture(async (sink, { listAdminEmails }) => {
      state.fromError = { message: "fault-BRAVO" };
      await listAdminEmails().catch(() => {});
      b = lastInfra(sink).context.error;
    });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect((a as { message?: string }).message).toBe("fault-ALPHA");
    expect((b as { message?: string }).message).toMatch(/fault-BRAVO/);
  });
});
