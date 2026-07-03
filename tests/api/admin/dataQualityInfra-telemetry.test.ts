import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { handleIgnore } from "@/app/api/admin/show/[slug]/data-quality/ignore/route";
import { handleUnignore } from "@/app/api/admin/show/[slug]/data-quality/unignore/route";

// S3 (correction) — data-quality ignore/unignore already log SUCCESS (WARNING_IGNORED /
// WARNING_UNIGNORED); only the 500 infra catch was silent. Reuses the existing
// DATA_QUALITY_INFRA_ERROR code inside a log.error span (NOT added to NEW_FORENSIC_CODES).

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

const admin = async () => ({ email: "Admin@Example.com" });
const ctx = (slug = "rpas") => ({ params: Promise.resolve({ slug }) });
const req = () =>
  new Request("http://x", {
    method: "POST",
    body: JSON.stringify({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
  });
const throwingTx = async () => {
  throw new Error("db down");
};

describe("data-quality infra-fault telemetry", () => {
  test("ignore 500 catch → log.error DATA_QUALITY_INFRA_ERROR", async () => {
    const sink = capture();
    const res = await handleIgnore(req(), ctx(), {
      requireAdminIdentity: admin,
      withTx: throwingTx,
    });
    expect(res.status).toBe(500);
    const rec = sink.filter((r) => r.code === "DATA_QUALITY_INFRA_ERROR");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
    expect(rec[0]!.source).toBe("api.admin.data-quality.ignore");
    // success telemetry must NOT fire on an infra fault
    expect(sink.some((r) => r.code === "WARNING_IGNORED")).toBe(false);
  });

  test("unignore 500 catch → log.error DATA_QUALITY_INFRA_ERROR", async () => {
    const sink = capture();
    const res = await handleUnignore(req(), ctx(), {
      requireAdminIdentity: admin,
      withTx: throwingTx,
    });
    expect(res.status).toBe(500);
    const rec = sink.filter((r) => r.code === "DATA_QUALITY_INFRA_ERROR");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
    expect(rec[0]!.source).toBe("api.admin.data-quality.unignore");
    expect(sink.some((r) => r.code === "WARNING_UNIGNORED")).toBe(false);
  });
});
