/**
 * tests/cross-cutting/no-absolute-self-redirect.test.ts
 *
 * `NextResponse.redirect(...)` is banned under `app/` except for allow-listed
 * external targets. It emits an absolute `Location`, and when that URL is built
 * from `request.url` the host is whatever Next reports rather than what the client
 * typed — which drops host-scoped cookies and silently unauthenticates the next
 * request. `hostRelativeRedirect` (lib/http) is the replacement.
 *
 * Default-deny on the CALL, not analysis of its argument: three earlier rounds of
 * argument-shape matching were each defeated by another spelling (the audit
 * module's header lists them). Keying on the call is bounded — there is one way to
 * write it — so a reintroduced host flip cannot hide behind an expression form.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditSource,
  EXTERNAL_REDIRECT_ALLOWLIST,
  unallowedRedirects,
} from "./no-absolute-self-redirect-audit";

const ROOT = process.cwd();
const APP = join(ROOT, "app");

/**
 * Spellings that all recreate the host flip. Each defeated a previous
 * argument-shape matcher; under default-deny they are flagged identically,
 * because the guard never inspects the argument.
 */
const FLAGGED_SPELLINGS: Array<[string, string]> = [
  ["inline new URL", `return NextResponse.redirect(new URL(p, request.url));`],
  ["req.url spelling", `return NextResponse.redirect(new URL(p, req.url));`],
  ["variable-assigned", `const url = new URL(p, request.url);\nreturn NextResponse.redirect(url);`],
  [
    "alias chain",
    `const a = new URL(p, request.url);\nconst b = a;\nreturn NextResponse.redirect(b);`,
  ],
  ["captured base", `const base = request.url;\nreturn NextResponse.redirect(new URL(p, base));`],
  ["type-asserted", `return NextResponse.redirect(new URL(p, request.url) as URL);`],
  ["oddly named request param", `return NextResponse.redirect(new URL(p, nextRequest.url));`],
  ["destructured url", `const { url } = request;\nreturn NextResponse.redirect(new URL(p, url));`],
  ["bare nextUrl", `return NextResponse.redirect(request.nextUrl);`],
  [
    "cloned nextUrl with a mutated pathname",
    `const u = request.nextUrl.clone();\nu.pathname = p;\nreturn NextResponse.redirect(u);`,
  ],
  [
    // Receiver spellings review used to bypass a literal `NextResponse.redirect`
    // text match. Each recreates the host flip.
    "aliased import",
    `import { NextResponse as NR } from "next/server";\nreturn NR.redirect(new URL(p, request.url));`,
  ],
  ["element access", `return NextResponse["redirect"](new URL(p, request.url));`],
  ["parenthesized receiver", `return (NextResponse).redirect(new URL(p, request.url));`],
  [
    "destructured method",
    `const { redirect } = NextResponse;\nreturn redirect(new URL(p, request.url));`,
  ],
  [
    "declared inside a nested block",
    `if (cond) {\n  const url = new URL(p, request.url);\n  return NextResponse.redirect(url);\n}`,
  ],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("no absolute self-redirect under app/", () => {
  it.each(FLAGGED_SPELLINGS)("flags %s", (_label, body) => {
    expect(auditSource("fixture.ts", body)).toHaveLength(1);
  });

  it("does not flag hostRelativeRedirect, the sanctioned replacement", () => {
    expect(auditSource("fixture.ts", `return hostRelativeRedirect(p, 302);`)).toEqual([]);
  });

  it("every NextResponse.redirect under app/ is allow-listed with a reason", () => {
    const offenders = walk(APP).flatMap((file) => {
      const rel = relative(ROOT, file);
      return unallowedRedirects(rel, readFileSync(file, "utf8")).map(
        (f) => `${rel}:${f.line} ${f.text}`,
      );
    });
    expect(
      offenders,
      "NextResponse.redirect emits an ABSOLUTE Location; built from the request it can flip the " +
        "host and drop host-scoped cookies. Use hostRelativeRedirect from " +
        "lib/http/hostRelativeRedirect.ts, or — only for a genuinely external target — add a " +
        "reasoned row to EXTERNAL_REDIRECT_ALLOWLIST.",
    ).toEqual([]);
  });

  it("the allow-list carries no stale rows", () => {
    // A moved or deleted call must re-surface for review rather than leaving a row
    // that silently exempts whatever now occupies that line.
    const live = new Set(
      walk(APP).flatMap((file) => {
        const rel = relative(ROOT, file);
        return auditSource(rel, readFileSync(file, "utf8")).map((f) => `${rel}:${f.line}`);
      }),
    );
    const stale = Object.keys(EXTERNAL_REDIRECT_ALLOWLIST).filter((k) => !live.has(k));
    expect(stale, "allow-list rows pointing at no NextResponse.redirect call").toEqual([]);
  });

  it("every allow-list row states a reason", () => {
    for (const [site, reason] of Object.entries(EXTERNAL_REDIRECT_ALLOWLIST)) {
      expect(reason.length, `${site} has no reason`).toBeGreaterThan(20);
    }
  });

  it("visited enough files that a broken walk cannot pass vacuously", () => {
    expect(walk(APP).length).toBeGreaterThan(50);
  });
});
