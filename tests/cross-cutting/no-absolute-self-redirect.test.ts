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

/**
 * Scope collisions — the class review found in the first implementation, which
 * keyed one file-global map by name with last-declaration-wins. Both directions
 * are pinned, because a file-global map fails BOTH ways and passing one of these
 * while failing the other would look like a partial fix.
 */
const SCOPE_CASES: Array<[string, string, number]> = [
  [
    "a safe later `url` must not mask an earlier dangerous one",
    `function a(request: NextRequest) {
       const url = new URL(p, request.url);
       return NextResponse.redirect(url);
     }
     function b(request: NextRequest) {
       const url = new URL(request.url);
       return json({ q: url.search });
     }`,
    1,
  ],
  [
    // The two shapes a reviewer's probe used to refute the first scope fix, which
    // recursed into nested blocks and so attributed a block-scoped declaration to
    // the enclosing function.
    "a safe url inside a nested block must not mask the dangerous outer one",
    `function h(request: NextRequest) {
       const url = new URL(p, request.url);
       if (cond) {
         const url = new URL(request.url);
         void url;
       }
       return NextResponse.redirect(url);
     }`,
    1,
  ],
  [
    "a dangerous url inside a nested block must not taint the safe outer redirect",
    `function h(request: NextRequest) {
       const url = "https://fixed.example/next";
       if (cond) {
         const url = new URL(p, request.url);
         void url;
       }
       return NextResponse.redirect(url);
     }`,
    0,
  ],
  [
    "a same-named parameter stops resolution rather than falling through",
    `function outer(request: NextRequest) {
       const url = new URL(p, request.url);
       return inner(url);
     }
     function inner(url: URL) {
       return NextResponse.redirect(url);
     }`,
    0,
  ],
  [
    "request.nextUrl is the same self-origin source as request.url",
    `return NextResponse.redirect(new URL(p, request.nextUrl));`,
    1,
  ],
  [
    "a later dangerous `url` must not taint an earlier safe redirect",
    // Dangerous declaration LAST on purpose: under last-declaration-wins the
    // safe redirect in a() resolves to b()'s initializer and is falsely flagged.
    // With the order reversed this case would pass even on the unsound version,
    // so it would discriminate nothing.
    `function a() {
       const url = "https://fixed.example/next";
       return NextResponse.redirect(url);
     }
     function b(request: NextRequest) {
       const url = new URL(p, request.url);
       return json({ url });
     }`,
    0,
  ],
];

describe("no absolute self-redirect under app/", () => {
  it.each(SCOPE_CASES)("%s", (_label, body, expected) => {
    expect(auditSource("fixture.ts", body)).toHaveLength(expected);
  });

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
