/**
 * Probe 1 (spec §2): do the four residual classes escape the SYNTACTIC guard?
 *
 * Run: pnpm exec tsx tests/cross-cutting/redirect-guard-probes/probe1-residual-escapes.mjs
 *
 * HISTORICAL PIN: run at origin/main 0fb6f9efb (pre-rewrite), every class printed
 * `0 findings (ESCAPES this guard)` — the escape evidence that motivated the
 * type-aware rewrite. The post-rewrite verdicts (each class CAUGHT) are pinned by
 * the test file's R20-R23 fixtures, not by this probe: the re-export case needs a
 * sibling fixture module the test harness provides.
 */
import { auditSource } from "../no-absolute-self-redirect-audit";

const RESIDUALS = [
  [
    "helper-return",
    `import { NextResponse } from "next/server";
function pick() { return NextResponse.redirect; }
export function GET(request: Request) {
  return pick()(new URL("/x", request.url));
}`,
  ],
  [
    "class-field",
    `import { NextResponse } from "next/server";
class R { go = NextResponse.redirect; }
export function GET(request: Request) {
  return new R().go(new URL("/x", request.url));
}`,
  ],
  [
    "re-export (importing side)",
    `import { Redirector } from "./helper";
export function GET(request: Request) {
  return Redirector.redirect(new URL("/x", request.url));
}`,
  ],
  [
    "dynamic dispatch",
    `import { NextResponse } from "next/server";
const table = { go: NextResponse.redirect };
export function GET(request: Request) {
  const k = "go" as const;
  return table[k](new URL("/x", request.url));
}`,
  ],
];

for (const [label, body] of RESIDUALS) {
  const findings = auditSource("app/__audit_fixture__/route.ts", body);
  console.log(
    `${label}: ${findings.length} findings ${findings.length === 0 ? "(ESCAPES this guard)" : "(caught)"}`,
  );
  for (const f of findings) console.log(`   -> line ${f.line}: ${f.text}`);
}
