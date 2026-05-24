import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const AUDIT_FILES = [
  "lib/audit/authChain.ts",
  "lib/audit/authPrimitives.ts",
  "lib/audit/trustDomains.ts",
  "lib/audit/noGlobalCursor.ts",
];

describe("audit helpers after picker pivot", () => {
  test.each(AUDIT_FILES)("%s no longer carries signed-link auth assumptions", (file) => {
    const source = readFileSync(file, "utf8");

    expect(source).not.toMatch(/validateLinkSession/);
    expect(source).not.toMatch(/validateCrewAssetSession/);
    expect(source).not.toMatch(/resolveShowViewer/);
    expect(source).not.toMatch(/crew_member_auth/);
    expect(source).not.toMatch(/link_sessions/);
    expect(source).not.toMatch(/bootstrap_nonces/);
    expect(source).not.toMatch(/app\/api\/auth\/redeem-link/);
    expect(source).not.toMatch(/app\/show\/\[slug\]\/p\//);
    expect(source).not.toMatch(/public-bootstrap/);
  });
});
