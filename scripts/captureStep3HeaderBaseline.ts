/**
 * scripts/captureStep3HeaderBaseline.ts
 * (modal-header-reconciliation spec §11.2 — Task 1)
 *
 * Committed generator for the Step 3 review-modal HEADER baseline fixture
 * (`tests/components/admin/review/__fixtures__/step3-header-baseline.html`).
 *
 * WHY a committed generator and not `toMatchSnapshot`: the baseline exists to
 * prove that adding the shell's `subHeader` slot leaves Step 3 — the shell's
 * other consumer — byte-identical. A self-updating snapshot format would let a
 * `-u` run silently ABSORB exactly the regression this fixture exists to catch.
 * Regenerating is therefore a deliberate, reviewable act: run this script and
 * commit the diff.
 *
 * WHY the fixture must be captured on the PRE-change tree: a baseline taken
 * after the slot lands proves nothing.
 *
 * Rendering strategy: `renderToStaticMarkup` produces the header's HTML, which
 * is then parsed by jsdom and re-serialized via `.innerHTML`. Going through the
 * DOM serializer (rather than comparing the raw SSR string) is what makes the
 * fixture comparable to the `innerHTML` that the jsdom/RTL client render
 * produces in `reviewModalShell.test.tsx` — the two renderers agree on DOM
 * shape (that IS React's hydration contract) but not on string formatting.
 *
 * Id normalization is MANDATORY and is shared with the consuming test via
 * `tests/helpers/step3HeaderBaseline.ts`: the Step 3 header carries `useId()`
 * output, and adding a conditional branch to the shell can legitimately perturb
 * `useId` values while the header stays structurally identical.
 *
 * Env note: the module graph reachable from `Step3ReviewModal` pulls in server
 * modules that assert on env at IMPORT time (`lib/email/hashForLog.ts`), so
 * `.env.local` is loaded FIRST and every heavy import is dynamic.
 *
 * Usage: pnpm dlx tsx scripts/captureStep3HeaderBaseline.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), false);

// The Step 3 footer mounts `RescanSheetButton`, which calls `useRouter()` — an
// invariant throw outside an App Router tree. The wizard suite handles this with
// `vi.mock("next/navigation")`; outside vitest the equivalent is seeding the
// CJS require cache before the component graph is imported. The router is never
// exercised: nothing in this script clicks, and the footer is not captured.
const req = createRequire(join(process.cwd(), "package.json"));
{
  const navPath = req.resolve("next/navigation");
  req.cache[navPath] = {
    id: navPath,
    filename: navPath,
    loaded: true,
    exports: { useRouter: () => ({ refresh: () => {} }) },
  } as unknown as NodeJS.Module;
}

/** Minimal structural type for the one jsdom entry point used below. The
 *  package ships no types and `@types/jsdom` is not a dependency of this repo;
 *  a narrow local shape is preferable to widening the dependency set for a
 *  single `querySelector` call. */
type JsdomCtor = new (html: string) => { window: { document: Document } };

async function main(): Promise<void> {
  // Loaded via `require` rather than `import`: jsdom ships no type declarations
  // and `@types/jsdom` is not a dependency here, so a typed `import` is a
  // TS7016 error. `require` returns `any`, which the cast then narrows.
  const { JSDOM } = req("jsdom") as { JSDOM: JsdomCtor };
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Step3ReviewModal } = await import("@/components/admin/wizard/Step3ReviewModal");
  const { buildStep3BaselineData, normalizeIds, STEP3_BASELINE_DFID, STEP3_BASELINE_FIXTURE_PATH } =
    await import("@/tests/helpers/step3HeaderBaseline");

  const markup = renderToStaticMarkup(
    createElement(Step3ReviewModal, {
      data: buildStep3BaselineData(),
      checked: false,
      isDirtyRescan: false,
      onRequestSetChecked: async () => true,
      onClose: () => {},
    }),
  );
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`);
  const header = dom.window.document.querySelector(
    `[data-testid="wizard-step3-card-${STEP3_BASELINE_DFID}-review-header"]`,
  );
  if (header === null) {
    throw new Error("Step 3 header not found in the rendered markup — fixture or testid drifted.");
  }
  const out = join(process.cwd(), STEP3_BASELINE_FIXTURE_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${normalizeIds(header.innerHTML)}\n`, "utf8");
  process.stdout.write(`wrote ${STEP3_BASELINE_FIXTURE_PATH}\n`);
}

void main();
