/**
 * Static-analysis regression for the §7.4 identity-only mock contract on
 * /show/[slug] (Task 4.2 layout shell, plan lines 178-179).
 *
 * Plan preamble line 179 (verbatim): "?role= is ignored even if present
 * — a regression test asserts ?role=lead cannot unlock financials when the
 * bound crew row's role_flags don't include LEAD."
 *
 * The full Playwright role-spoof e2e is Task 4.8's job (it needs
 * FinancialsTile to actually probe the financials surface). This test is
 * the COMPILE-TIME FORM of the same contract: the source of
 * app/show/[slug]/[shareToken]/page.tsx must NEVER read `searchParams.role` (or any
 * bracket-form equivalent). A future refactor that introduces such a read
 * — even unintentionally — fails this test before it can ship.
 *
 * Patterns checked (all should be ABSENT from the page source):
 *   - searchParams.role           direct property
 *   - searchParams?.role          optional-chained property
 *   - searchParams['role']        single-quoted bracket
 *   - searchParams["role"]        double-quoted bracket
 *
 * Same approach used by tests/data/getShowForViewer.test.ts:160-167 for the
 * caller-supplied role_flags / viewerRole signature ban.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("/show/[slug] page source — identity-only mock contract", () => {
  test("static-analysis: page source NEVER reads searchParams.role (plan §preamble)", () => {
    const src = readFileSync(path.resolve(__dirname, "../../app/show/[slug]/[shareToken]/page.tsx"), "utf8");
    expect(
      src,
      "searchParams.role must not be referenced — only ?crew and ?as are read",
    ).not.toMatch(/searchParams\s*\.\s*role\b/);
    expect(src).not.toMatch(/searchParams\s*\?\.\s*role\b/);
    expect(src).not.toMatch(/searchParams\s*\[\s*['"]role['"]\s*\]/);
  });

  test("static-analysis: getShowForViewer blocks unpublished shows for non-admin viewers", () => {
    const src = readFileSync(path.resolve(__dirname, "../../lib/data/getShowForViewer.ts"), "utf8");

    expect(src).toMatch(/published/);
    expect(src).toMatch(/!isAdmin[\s\S]{0,160}published/);
    expect(src).toMatch(/PICKER_CREW_MEMBER_WRONG_SHOW/);
  });
});
