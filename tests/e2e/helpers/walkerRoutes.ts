// Runner-neutral route-derivation helpers for the deep-link affordance
// walker (tests/e2e/deep-link-walker.spec.ts). NO @playwright/test import —
// tests/help/walker-routes.test.ts imports this module under Vitest, and a
// transitive @playwright/test import would explode that runner.
import {
  AFFORDANCE_MATRIX,
  DEFERRED_TESTIDS,
  type ConcreteRow,
} from "@/app/help/_affordanceMatrix";

export type WalkerViewport = "mobile" | "desktop";
export type PrepKind = "wizard" | "dashboard" | "none";

export type WalkerFixtures = {
  slug: string;
  crewId: string;
  stagedId: string;
};

// The ONE registration array: every concrete matrix row minus the
// still-deferred testids (M11-G-D-2 / M11-G-D-3 — DEFERRED.md). Both inputs
// come from @/app/help/_affordanceMatrix so the walker cannot drift from the
// canonical matrix.
export const allWalkableRows: ReadonlyArray<ConcreteRow> = AFFORDANCE_MATRIX.filter(
  (row): row is ConcreteRow => row.kind === "concrete" && !DEFERRED_TESTIDS.has(row.testid),
);

// Does this row get walked at the given viewport? Registration always
// includes the row (skip at runtime, never absent), so a desktop-only row
// still shows up — as a skip — in the mobile project's report.
export function walksAt(row: ConcreteRow, vp: WalkerViewport): boolean {
  return row.visibleAt === vp || row.visibleAt === "both";
}

// Pure placeholder substitution ONLY. The matrix's rpas-central-2026 /
// eric-weiss / STAGED_ID_PLACEHOLDER segments are placeholder TOKENS, not
// live identifiers — the spec file resolves real fixture values async and
// passes them in. Non-placeholder routes pass through unchanged (R4 pin).
export function routeForPure(row: ConcreteRow, fixtures: WalkerFixtures): string {
  return row.sourceRoute
    .replace("rpas-central-2026", fixtures.slug)
    .replace("eric-weiss", fixtures.crewId)
    .replace("STAGED_ID_PLACEHOLDER", fixtures.stagedId);
}

// Which admin-state prep a row needs before navigation. Keys on the PARSED
// pathname so /admin?bucket=archived gets dashboard prep like bare /admin
// (R4 row-5 pin); wizard rows key on testid because wizard steps 2-3 also
// live under the /admin pathname.
export function prepKindFor(sourceRoute: string, testid: string): PrepKind {
  if (testid.startsWith("help-affordance--wizard-step")) return "wizard";
  if (new URL(sourceRoute, "http://localhost:3004").pathname === "/admin") return "dashboard";
  return "none";
}
