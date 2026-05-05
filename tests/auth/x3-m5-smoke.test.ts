import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("M5 X.3 auth-chain smoke audit", () => {
  test("does not leave the X.3 placeholder suite skipped", () => {
    const authChainSpec = read("tests/e2e/auth-chain.spec.ts");

    expect(authChainSpec).not.toMatch(/test\.describe\.skip\("X\.3 audit fixtures/);
  });

  test("show page resolves auth chain before protected show data", () => {
    const source = read("app/show/[slug]/page.tsx");

    const resolveViewerCall = source.indexOf("const result = await resolveViewer");
    const getShowForViewerCall = source.indexOf("data = await getShowForViewer");
    expect(resolveViewerCall).toBeGreaterThan(-1);
    expect(getShowForViewerCall).toBeGreaterThan(resolveViewerCall);

    const resolveViewerBody = source.slice(
      source.indexOf("async function resolveViewer"),
      source.indexOf("type PageProps"),
    );
    const adminIndex = resolveViewerBody.indexOf("await isAdminSession");
    const linkIndex = resolveViewerBody.indexOf("await validateLinkSession");
    const googleIndex = resolveViewerBody.indexOf("await validateGoogleSession");
    const fallbackIndex = resolveViewerBody.lastIndexOf("await tryRequireAdmin");
    expect(adminIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeGreaterThan(adminIndex);
    expect(googleIndex).toBeGreaterThan(linkIndex);
    expect(fallbackIndex).toBeGreaterThan(googleIndex);
  });

  test("/me uses validateGoogleIdentity and not the show-bound Google validator", () => {
    const source = read("app/me/page.tsx");

    expect(source).toContain("validateGoogleIdentity");
    expect(source).not.toMatch(/from ["']@\/lib\/auth\/validateGoogleSession["']/);
  });

  test("bootstrap shell remains public-bootstrap and does not import protected data readers", () => {
    const source = read("app/show/[slug]/p/page.tsx");

    expect(source).not.toMatch(/from ["']@\/lib\/auth\/validateLinkSession["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/auth\/validateGoogleSession["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/data\/getShowForViewer["']/);
  });
});
