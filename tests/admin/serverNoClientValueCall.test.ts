/**
 * tests/admin/serverNoClientValueCall.test.ts
 *
 * Structural guard against the SSR-throw bug class that shipped the per-show
 * admin page's error boundary to every admin (P0, e2e recon): a Server
 * Component under `app/admin/show/**` that IMPORTS a non-component export from a
 * `"use client"` module and then CALLS it. React Server Components treat every
 * export of a `"use client"` module as an opaque client reference — you may
 * render a client COMPONENT as JSX (`<Client />`), but invoking a client export
 * as a function (`clientFn(...)`) throws at request-time SSR:
 *   "Attempted to call step3Sections() from the server but step3Sections is on
 *    the client."
 * `pnpm build` does NOT catch it (the check fires on SSR invocation, not build),
 * and jsdom suites render client trees where the call is legal — so only a real
 * SSR request surfaced it. This filesystem walk fails-by-default: a NEW server
 * file added to the tree that calls a client import trips it with no allowlist.
 *
 * Precision: it flags a call `name(` of a value binding imported (non-`type`)
 * from a resolved `"use client"` module. Rendering the binding as JSX (`<Name`)
 * is NOT a call and is intentionally allowed — that is the supported RSC pattern
 * (the loader renders `<PublishedReviewModal />` from a client module, which is
 * fine; it must not CALL a client function).
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const AUDIT_ROOT = "app/admin/show";
// admin-show-modal Task 7: the per-show page body moved into the ShowReviewModal
// server loader at app/admin/_showReviewModal.tsx — OUTSIDE the walked root, so
// it is appended explicitly (a hardcoded `app/admin/show` walk alone would
// silently drop the moved server surface from coverage).
const EXTRA_AUDIT_FILES = ["app/admin/_showReviewModal.tsx"];

function walk(relDir: string): string[] {
  return readdirSync(join(ROOT, relDir))
    .flatMap((entry) => {
      const rel = `${relDir}/${entry}`;
      const abs = join(ROOT, rel);
      if (statSync(abs).isDirectory()) return walk(rel);
      return /\.(ts|tsx)$/.test(entry) ? [rel] : [];
    })
    .sort();
}

/** Strip block + line comments so a doc-comment mentioning a call never trips. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/[^\n]*/, ""))
    .join("\n");
}

/** True when the module's first meaningful token is a `"use client"` directive. */
function isUseClientModule(abs: string): boolean {
  try {
    return /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(readFileSync(abs, "utf8"));
  } catch {
    return false;
  }
}

/** Resolve a `@/`-alias or relative import spec to an on-disk source file. */
function resolveModule(fromAbs: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromAbs), spec);
  else return null; // bare package import — never a local "use client" module
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

const IMPORT_RE =
  /import\s+(type\s+)?(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g;

/** Value bindings (default + named, skipping `type` specifiers) of one import. */
function valueBindings(defaultName: string | undefined, named: string | undefined): string[] {
  const out: string[] = [];
  if (defaultName) out.push(defaultName);
  if (named) {
    for (const raw of named.split(",")) {
      const part = raw.trim();
      if (!part || /^type\s/.test(part)) continue;
      const local = part
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local) out.push(local);
    }
  }
  return out;
}

function offendersIn(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (isUseClientModule(abs)) return []; // client file may call client exports
  const src = readFileSync(abs, "utf8");
  const code = stripComments(src);
  const offenders: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    if (m[1]) continue; // `import type ...`
    const spec = m[4];
    if (!spec) continue;
    const target = resolveModule(abs, spec);
    if (!target || !isUseClientModule(target)) continue;
    for (const binding of valueBindings(m[2], m[3])) {
      const callRe = new RegExp(`\\b${binding.replace(/\$/g, "\\$")}\\s*\\(`);
      if (callRe.test(code)) offenders.push(`${binding} (from "${spec}")`);
    }
  }
  return offenders;
}

describe("server files under app/admin/show never CALL a use-client import", () => {
  const files = [...walk(AUDIT_ROOT), ...EXTRA_AUDIT_FILES];

  test("the audit tree is non-empty (walk resolves)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const rel of files) {
    test(`${rel}`, () => {
      const offenders = offendersIn(rel);
      expect(
        offenders,
        `${rel} is a Server Component that CALLS ${offenders.join(", ")} imported from a ` +
          `"use client" module. That throws at SSR ("Attempted to call … from the server"). ` +
          `Move the pure logic into a non-"use client" module and import it from there, or ` +
          `render the client export as JSX instead of calling it.`,
      ).toEqual([]);
    });
  }

  // Negative control: the detector fires on a synthetic offender + is silent on
  // a JSX render of the same client import (the supported RSC pattern).
  test("control: detects a call but not a JSX render of a client import", () => {
    const clientMod = resolveModule(
      join(ROOT, "app/admin/_showReviewModal.tsx"),
      "@/components/admin/wizard/step3ReviewSections",
    );
    expect(clientMod).not.toBeNull();
    expect(isUseClientModule(clientMod as string)).toBe(true);

    const callSrc = stripComments(
      `import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";\n` +
        `const ids = step3Sections(data);`,
    );
    expect(/\bstep3Sections\s*\(/.test(callSrc)).toBe(true);

    const renderSrc = stripComments(
      `import { PublishedReviewModal } from "@/components/admin/showpage/PublishedReviewModal";\n` +
        `return <PublishedReviewModal data={data} />;`,
    );
    expect(/\bPublishedReviewModal\s*\(/.test(renderSrc)).toBe(false);
  });
});
