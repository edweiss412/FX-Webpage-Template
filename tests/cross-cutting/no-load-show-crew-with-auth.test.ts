import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const FILES = [
  "app/admin/show/[slug]/page.tsx",
  "components/admin/PerShowCrewSection.tsx",
  "tests/components/PerShowCrewSection.test.tsx",
];

describe("post-pivot admin crew loader", () => {
  test.each(FILES)("%s no longer depends on loadShowCrewWithAuth", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/loadShowCrewWithAuth/);
    expect(source).not.toMatch(/CrewRowForLinkPanel/);
    expect(source).not.toMatch(/current_token_version|max_issued_version|revoked_below_version|authMissing/);
  });
});
