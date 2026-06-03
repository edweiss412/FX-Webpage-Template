// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const BANNER = "components/admin/AlertBanner.tsx";
const BOUNDARY = "components/admin/AlertBannerRouteBoundary.tsx";
const read = (p: string) => readFileSync(p, "utf8");

describe("AlertBanner structural contracts (RECON-1 §11)", () => {
  test("grid track is the shrinkable+capped form, never grid-cols-[1fr_auto] (F6/F8)", () => {
    const src = read(BANNER);
    expect(src).not.toMatch(/grid-cols-\[1fr_auto\]/);
    expect(src).toMatch(/grid-cols-\[minmax\(0,1fr\)_fit-content\(55%\)\]/);
  });

  test("remount key incorporates pathname AND searchParams AND alertId (F17/F19/F20)", () => {
    const src = read(BOUNDARY);
    expect(src).toMatch(/usePathname\(\)/);
    expect(src).toMatch(/useSearchParams\(\)/);
    // the key template must reference all three; a pathname-only key is forbidden
    expect(src).toMatch(/`\$\{pathname\}\?\$\{search\}:\$\{alertId\}`/);
  });

  test("action form/link is not lexically nested in <summary> (F5)", () => {
    const src = read(BANNER);
    // crude structural guard: no <form or View-show <a between <summary> and </summary>
    const summary = src.slice(src.indexOf("<summary"), src.indexOf("</summary>"));
    expect(summary).not.toMatch(/<form|resolveAdminAlertFormAction|admin-alert-show-link/);
  });
});
