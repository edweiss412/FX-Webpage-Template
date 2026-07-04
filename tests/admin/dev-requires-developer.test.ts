/**
 * tests/admin/dev-requires-developer.test.ts (developer-tier, spec §6 rows 1-3)
 *
 * Proves the /admin/dev surfaces are gated on requireDeveloper (NOT requireAdmin):
 *  - the 3 dev PAGES call `await requireDeveloper()` as their first executable
 *    statement, import it from @/lib/auth/requireDeveloper, and no longer
 *    reference requireAdmin at all (source-scan);
 *  - each of the 6 exported server actions in actions.ts rejects when the
 *    requireDeveloper gate throws (runtime, mocked gate — no DB / HTTP).
 *
 * Fast unit signal; superseded structurally by developerGatingContract (Task 20).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

// The gate sentinel: mocking requireDeveloper to throw this proves each action's
// FIRST statement is the gate (the sentinel propagates before any body runs).
const SENTINEL = new Error("requireDeveloper-sentinel");
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloper: vi.fn(async () => {
    throw SENTINEL;
  }),
}));

const DEV_PAGE_FILES = [
  "app/admin/dev/page.tsx",
  "app/admin/dev/source-link-dim/page.tsx",
  "app/admin/dev/observability-dim/page.tsx",
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("/admin/dev PAGES are developer-gated (source contract)", () => {
  for (const rel of DEV_PAGE_FILES) {
    test(`${rel}: first executable statement is await requireDeveloper(); no requireAdmin`, () => {
      const source = readFileSync(join(process.cwd(), rel), "utf8");

      const stripped = stripComments(source);

      // Imports the developer gate, not the admin gate.
      expect(source, `${rel} must import requireDeveloper`).toMatch(
        /from ["']@\/lib\/auth\/requireDeveloper["']/,
      );
      // requireAdmin is gone from executable code (no import, no call). Checked
      // against comment-stripped source: "requireAdmin is NOT called" is a
      // code-level contract, not a ban on historical prose.
      expect(stripped, `${rel} must not call requireAdmin`).not.toMatch(/\brequireAdmin\b/);
      expect(stripped, `${rel} must not import from requireAdmin`).not.toMatch(
        /lib\/auth\/requireAdmin/,
      );

      // The gate is the FIRST awaited statement (nothing executes before it).
      const firstAwait = stripped.indexOf("await ");
      expect(firstAwait, `${rel} must contain an await`).toBeGreaterThan(-1);
      expect(
        stripped.slice(firstAwait).startsWith("await requireDeveloper()"),
        `${rel}: first await must be requireDeveloper(); got: ${stripped
          .slice(firstAwait, firstAwait + 40)
          .replace(/\s+/g, " ")}`,
      ).toBe(true);
    });
  }
});

describe("/admin/dev server actions are developer-gated (reject when gate throws)", () => {
  test("actions.ts imports requireDeveloper and no longer calls requireAdmin", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/dev/actions.ts"), "utf8");
    const stripped = stripComments(source);
    expect(source).toMatch(/from ["']@\/lib\/auth\/requireDeveloper["']/);
    expect(stripped).not.toMatch(/\brequireAdmin\b/);
    expect(stripped).not.toMatch(/lib\/auth\/requireAdmin/);
  });

  test("each of the 6 exported actions rejects with the gate error", async () => {
    const actions = await import("@/app/admin/dev/actions");
    const callByName: Record<string, () => Promise<unknown>> = {
      parseAndStage: () => actions.parseAndStage("2026-03-rpas-central-four-seasons.md"),
      parseAndStageFormAction: () => actions.parseAndStageFormAction(new FormData()),
      getStagedResult: () => actions.getStagedResult("2026-03-rpas-central-four-seasons.md"),
      resetDevSchema: () => actions.resetDevSchema(),
      resetDevSchemaFormAction: () => actions.resetDevSchemaFormAction(),
      listFixtures: () => actions.listFixtures(),
    };
    for (const [name, call] of Object.entries(callByName)) {
      await expect(call(), `${name} must reject when requireDeveloper throws`).rejects.toBe(
        SENTINEL,
      );
    }
  });
});
