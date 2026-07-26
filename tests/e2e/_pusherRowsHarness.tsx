/**
 * Static markup harness for the three childless-`flex-1` pusher rows
 * (tests/e2e/pusher-alignment.layout.spec.ts).
 *
 * WHY A SUBPROCESS, not an import: Playwright's test transform rewrites JSX in every
 * `.tsx` it loads — this file AND the imported component tree — into its
 * component-testing payload, which `react-dom/server` cannot render. So the spec
 * shells out to `node_modules/.bin/tsx` to run THIS file directly and reads the
 * rendered markup back as JSON. Same contract as
 * tests/e2e/_step3ReviewModalHarness.tsx, whose header documents the trap.
 *
 * SEAMS, both required and both non-obvious:
 *
 *  - `BellActionRow` is mounted rather than `<BellPanel>`, because server-rendering
 *    the panel yields only its initial loading state, so neither `isAutoResolving`
 *    branch is emitted. Both branches are rendered here.
 *  - `AdminNav` calls `usePathname()`, which reads **`PathnameContext`** — NOT
 *    `AppRouterContext`. With no provider it returns null and `isNavItemActive()`
 *    calls `pathname.startsWith(...)`, so the render throws before producing a row.
 *    Plan review round 4 corrected an earlier attempt that reached for
 *    `AppRouterContext` (the seam the modal harness uses, for `useRouter()`).
 *
 * `OnboardingTopBar` needs no seam.
 *
 * Env: `HASH_FOR_LOG_PEPPER` and `JWT_SIGNING_SECRET` must be set or the import graph
 * throws at load (lib/email/hashForLog.ts). The spec supplies deterministic test
 * values in the subprocess env.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { BellActionRow } from "@/components/admin/BellPanel";
import { AdminNav } from "@/components/admin/nav/AdminNav";
import { OnboardingTopBar } from "@/components/admin/nav/OnboardingTopBar";
import type { BellEntry } from "@/lib/admin/bellFeed";

const HARNESS_EMAIL = "owner@example.com";

function bellEntry(isAutoResolving: boolean): BellEntry {
  return {
    alertId: isAutoResolving ? "auto-1" : "manual-1",
    code: "SOME_CODE",
    isHealth: false,
    isAutoResolving,
    autoResolveNote: "Clearing itself shortly.",
    actions: [],
  } as unknown as BellEntry;
}

/** Both trailing branches, because §3.2 puts `ml-auto` on each and a test that
 *  exercised only one could pass while the other kept its spacer. */
function bellRows(): { auto: string; manual: string } {
  const render = (isAuto: boolean) =>
    renderToStaticMarkup(<BellActionRow entry={bellEntry(isAuto)} onRefetch={() => {}} />);
  return { auto: render(true), manual: render(false) };
}

function adminNav(): string {
  return renderToStaticMarkup(
    <PathnameContext.Provider value="/admin">
      <AdminNav email={HARNESS_EMAIL} bellCount={{ kind: "ok", count: 3 }} />
    </PathnameContext.Provider>,
  );
}

function onboardingTopBar(): string {
  return renderToStaticMarkup(<OnboardingTopBar email={HARNESS_EMAIL} />);
}

export function buildPusherRows(): {
  bellAuto: string;
  bellManual: string;
  adminNav: string;
  onboardingTopBar: string;
} {
  const bell = bellRows();
  return {
    bellAuto: bell.auto,
    bellManual: bell.manual,
    adminNav: adminNav(),
    onboardingTopBar: onboardingTopBar(),
  };
}

/* Direct-execution entry. The `typeof module` guard matches the sibling harness:
 * under an esbuild browser bundle `require` compiles to a shim but a bare `module`
 * would be a ReferenceError. */
if (typeof module !== "undefined" && require.main === module) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: tsx _pusherRowsHarness.tsx <out.json>");
  writeFileSync(out, JSON.stringify(buildPusherRows()), "utf8");
}
