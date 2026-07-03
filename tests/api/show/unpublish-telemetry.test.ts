import { describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

// S1 — public show-unpublish durable telemetry (outcome + infra fault).
// setLogSink capture (see tests/cron/withCronRunSummary.test.ts): logAdminOutcome
// funnels through log.info → the active sink, so one capture path proves BOTH the
// POST-COMMIT outcome and the 503-catch forensic log.error.

const { unpublishMock, revalidateMock } = vi.hoisted(() => ({
  unpublishMock: vi.fn(),
  revalidateMock: vi.fn(),
}));
vi.mock("@/lib/sync/unpublishShow", () => ({ unpublishShowViaEmailedLink: unpublishMock }));
vi.mock("@/lib/data/showCacheTag", () => ({ revalidateShow: revalidateMock }));

async function withCapture(fn: (sink: LogRecord[]) => Promise<void>) {
  vi.resetModules();
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  try {
    await fn(sink);
  } finally {
    log.resetLogSink();
  }
}

function req(qs: string) {
  // The route reads request.nextUrl.searchParams (NextRequest); provide just that shape.
  return { nextUrl: new URL(`http://x/api/show/rpas/unpublish${qs}`) };
}
const ctx = (slug = "rpas") => ({ params: Promise.resolve({ slug }) });

describe("public unpublish telemetry", () => {
  test("committed success → one POST-COMMIT SHOW_UNPUBLISHED_VIA_EMAILED_LINK (showId, no actor)", async () => {
    await withCapture(async (sink) => {
      unpublishMock.mockReset();
      unpublishMock.mockResolvedValue({ outcome: "success", status: 200, showId: "show-1" });
      const { POST } = await import("@/app/api/show/[slug]/unpublish/route");
      const res = await POST(req("?token=t&r=r") as never, ctx() as never);
      expect(res.status).toBe(200);
      const outcomes = sink.filter((s) => s.code === "SHOW_UNPUBLISHED_VIA_EMAILED_LINK");
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.source).toBe("api.show.unpublish");
      expect(outcomes[0]!.showId).toBe("show-1");
      expect(outcomes[0]!.actorHash).toBeNull(); // public leg — no admin identity
    });
  });

  test("infra throw → 503 + one UNPUBLISH_INFRA_FAILED log.error, no outcome", async () => {
    await withCapture(async (sink) => {
      unpublishMock.mockReset();
      unpublishMock.mockRejectedValue(new Error("boom"));
      const { POST } = await import("@/app/api/show/[slug]/unpublish/route");
      const res = await POST(req("?token=t&r=r") as never, ctx() as never);
      expect(res.status).toBe(503);
      const faults = sink.filter((s) => s.code === "UNPUBLISH_INFRA_FAILED");
      expect(faults).toHaveLength(1);
      expect(faults[0]!.level).toBe("error");
      expect(faults[0]!.source).toBe("api.show.unpublish");
      expect(sink.some((s) => s.code === "SHOW_UNPUBLISHED_VIA_EMAILED_LINK")).toBe(false);
    });
  });

  test("expired (400) emits NOTHING (expected outcome, not a fault)", async () => {
    await withCapture(async (sink) => {
      unpublishMock.mockReset();
      unpublishMock.mockResolvedValue({
        outcome: "expired",
        status: 400,
        code: "UNPUBLISH_TOKEN_EXPIRED",
        showId: "show-1",
      });
      const { POST } = await import("@/app/api/show/[slug]/unpublish/route");
      const res = await POST(req("?token=t&r=r") as never, ctx() as never);
      expect(res.status).toBe(400);
      expect(sink).toHaveLength(0);
    });
  });

  test("not_found (404) emits NOTHING", async () => {
    await withCapture(async (sink) => {
      unpublishMock.mockReset();
      unpublishMock.mockResolvedValue({ outcome: "not_found", status: 404 });
      const { POST } = await import("@/app/api/show/[slug]/unpublish/route");
      const res = await POST(req("?token=t&r=r") as never, ctx() as never);
      expect(res.status).toBe(404);
      expect(sink).toHaveLength(0);
    });
  });

  test("missing token/r (404) emits NOTHING (never reaches the consume)", async () => {
    await withCapture(async (sink) => {
      unpublishMock.mockReset();
      const { POST } = await import("@/app/api/show/[slug]/unpublish/route");
      const res = await POST(req("") as never, ctx() as never);
      expect(res.status).toBe(404);
      expect(unpublishMock).not.toHaveBeenCalled();
      expect(sink).toHaveLength(0);
    });
  });
});
