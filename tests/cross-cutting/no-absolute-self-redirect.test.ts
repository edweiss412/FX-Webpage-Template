/**
 * tests/cross-cutting/no-absolute-self-redirect.test.ts
 *
 * Bans the self-referential-redirect class under `app/`: a
 * `NextResponse.redirect(new URL(path, request.url))` emits an absolute
 * Location whose host can differ from the one the client typed, which drops
 * host-scoped cookies. Use `hostRelativeRedirect` (lib/http) instead.
 *
 * Three layers, per docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md
 * §3.4: fixtures prove the matcher recognises each shape (a detector that
 * matched nothing would pass the tree walk vacuously), the tree walk proves the
 * tree is clean, and the coverage floor proves the walk actually visited files.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { auditSource } from "./no-absolute-self-redirect-audit";

const ROOT = process.cwd();
const APP = join(ROOT, "app");

/** The canonical fixture set — spec §3.4 is the single source for its shape. */
const POSITIVES: Array<[string, string]> = [
  [
    "inline with request.url",
    `return NextResponse.redirect(new URL(p, request.url), { status: 302 });`,
  ],
  ["inline with req.url", `return NextResponse.redirect(new URL(p, req.url));`],
  [
    "variable-assigned with request.url",
    `const url = new URL(p, request.url);\nreturn NextResponse.redirect(url, { status: 302 });`,
  ],
  [
    "variable-assigned with req.url",
    `const url = new URL(p, req.url);\nreturn NextResponse.redirect(url);`,
  ],
  [
    "alias chain",
    `const a = new URL(p, request.url);\nconst b = a;\nreturn NextResponse.redirect(b);`,
  ],
  ["captured base", `const base = request.url;\nreturn NextResponse.redirect(new URL(p, base));`],
];

const NEGATIVES: Array<[string, string]> = [
  ["externally supplied absolute url", `return NextResponse.redirect(data.url, { status: 302 });`],
  ["absolute string base", `return NextResponse.redirect(new URL(p, "https://fixed.example"));`],
  [
    "two-arg construction never redirected",
    `const redirectTo = new URL("/auth/callback", request.url);\nreturn json({ redirectTo });`,
  ],
  ["one-arg parse form", `const url = new URL(request.url);\nreturn json({ q: url.search });`],
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
  it.each(POSITIVES)("flags %s", (_label, body) => {
    expect(auditSource("fixture.ts", body)).toHaveLength(1);
  });

  it.each(NEGATIVES)("does not flag %s", (_label, body) => {
    expect(auditSource("fixture.ts", body)).toEqual([]);
  });

  it("no file under app/ redirects to a URL built from the request", () => {
    const offenders = walk(APP).flatMap((file) =>
      auditSource(file, readFileSync(file, "utf8")).map(
        (f) => `${relative(ROOT, file)}:${f.line} ${f.text}`,
      ),
    );
    expect(
      offenders,
      "NextResponse.redirect(new URL(..., request.url)) emits an absolute Location whose host " +
        "can differ from the one the client used, dropping host-scoped cookies. Use " +
        "hostRelativeRedirect from lib/http/hostRelativeRedirect.ts instead.",
    ).toEqual([]);
  });

  it("visited enough files that a broken walk cannot pass vacuously", () => {
    expect(walk(APP).length).toBeGreaterThan(50);
  });
});
