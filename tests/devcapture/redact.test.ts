import { describe, expect, it } from "vitest";
import { redactTelemetry } from "@/lib/devcapture/redact";

const HEX64 = "a".repeat(32) + "b".repeat(32);
const HEX40 = "0123456789abcdef0123456789abcdef01234567";
const HEX32 = "c".repeat(32);
const HEX31 = "d".repeat(31);
const JWT = "eyJabc._payload-x.sig_y";

describe("redactTelemetry", () => {
  it("redacts emails, >=32-hex runs, and JWT shapes in nested string values", () => {
    const out = redactTelemetry({
      meta: { url: "https://x.test/admin" },
      clientSnapshot: {
        data: { deep: [{ note: `mail me at crew.member+1@example.co.uk today` }] },
        token: HEX64,
        boundary: HEX32,
        under: HEX31,
        jwt: `prefix ${JWT} suffix`,
      },
      server: {},
    }) as Record<string, never> & { clientSnapshot: Record<string, unknown> };
    const snap = out.clientSnapshot;
    expect(JSON.stringify(snap)).not.toContain("@example");
    expect(JSON.stringify(snap)).toContain("[email redacted]");
    expect(snap["token"]).toBe("[redacted]");
    expect(snap["boundary"]).toBe("[redacted]");
    expect(snap["under"]).toBe(HEX31);
    expect(snap["jwt"]).toBe("prefix [redacted] suffix");
  });

  it("applies rules in spec order (email, hex, JWT) on overlapping shapes", () => {
    // A JWT whose middle segment is a 32-hex run: hex rule (2) fires inside it
    // before the JWT rule (3) sees the whole; the final string must contain no
    // hex run and no JWT shape either way - order pinned by exact output.
    const overlap = `eyJhead.${"a".repeat(32)}.tail0`;
    const out = redactTelemetry({ meta: {}, clientSnapshot: { overlap }, server: {} }) as {
      clientSnapshot: { overlap: string };
    };
    expect(out.clientSnapshot.overlap).toBe("eyJhead.[redacted].tail0");
  });

  it("applies the same rules to keys; legit identifiers survive", () => {
    const out = redactTelemetry({
      meta: {},
      clientSnapshot: {
        lastFinalizeFailureCodeUnrecognized: "ok",
        [HEX64]: "hexkey",
        ["contact: a@b.io"]: "emailkey",
      },
      server: {},
    }) as { clientSnapshot: Record<string, string> };
    expect(out.clientSnapshot["lastFinalizeFailureCodeUnrecognized"]).toBe("ok");
    expect(Object.keys(out.clientSnapshot)).not.toContain(HEX64);
    expect(Object.keys(out.clientSnapshot).some((k) => k.includes("@"))).toBe(false);
  });

  it("shape-gates the commitSha exemption at BOTH paths", () => {
    const out = redactTelemetry({
      meta: { commitSha: HEX40 },
      clientSnapshot: {},
      server: { commitSha: HEX40 },
    }) as { meta: { commitSha: string }; server: { commitSha: string } };
    expect(out.meta.commitSha).toBe(HEX40);
    expect(out.server.commitSha).toBe(HEX40);
    const planted = redactTelemetry({
      meta: { commitSha: HEX64 },
      clientSnapshot: {},
      server: { commitSha: HEX64 },
    }) as { meta: { commitSha: string }; server: { commitSha: string } };
    expect(planted.meta.commitSha).toBe("[redacted]");
    expect(planted.server.commitSha).toBe("[redacted]");
  });
});
