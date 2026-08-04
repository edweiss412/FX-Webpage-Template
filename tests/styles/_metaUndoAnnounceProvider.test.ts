// tests/styles/_metaUndoAnnounceProvider.test.ts
//
// Structural guard for the undo announce channel (spec §5).
//
// Why a guard at all: UndoAnnounceContext's default is a no-op, so a button
// mounted outside a provider does not crash — it goes SILENT. Silence is the
// exact defect this feature fixes, which makes it the one failure mode that can
// ship without anyone noticing.
//
// Four assertions, each with its OWN planted violation. An earlier draft shipped
// a widened guard whose mutant covered only one of its two detection branches,
// so a guard that silently ignored the other would still have passed. The
// planted cases below are asserted against the same matcher functions the real
// scan uses, so the mutants cannot drift away from the implementation.
//
// A1 and A3 are deliberately shallow counting / line-order checks over one known
// file rather than a JSX parse. A guard that needs a real parser to state its
// invariant is one nobody can trust; the runtime proof is the Playwright
// assertion in published-review-modal.crew-actions.spec.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { walk, stripCommentsForFile } from "./_classScanUtils";

const ROOT = join(__dirname, "..", "..");
const LAYOUT = join(ROOT, "app", "admin", "layout.tsx");
const PROVIDER_MODULE = join(ROOT, "components", "admin", "AdminAnnounceProvider.tsx");

const read = (p: string) => stripCommentsForFile(readFileSync(p, "utf8"), p);

/** Files that can render an announcing surface. app/api/** is excluded: route
 *  handlers render no JSX. */
function scannedFiles(): string[] {
  return [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))].filter(
    (p) => !p.includes(join("app", "api")),
  );
}

// ── matchers, shared by the real scan and by every planted violation ──────────

/** A1: at least as many provider wrappers as returns, and at least one. */
export function a1Ok(src: string): boolean {
  const wrappers = (src.match(/<AdminAnnounceProvider/g) ?? []).length;
  const returns = (src.match(/return \(/g) ?? []).length;
  return wrappers >= returns && wrappers >= 1;
}

/** A2: a channel may be mounted by the admin layout or by a modal shell (a file
 *  that also renders role="dialog"). Stated as a RULE, not a two-file allowlist,
 *  so adding a channel to a future aria-modal surface — the correct fix for that
 *  surface — passes, while a channel on an ordinary surface fails. */
export function a2Ok(src: string, isLayout: boolean): boolean {
  if (!/<AdminAnnounceProvider/.test(src)) return true;
  return isLayout || /role="dialog"/.test(src);
}

/** A3: the provider must never be a DESCENDANT of a [data-inert-root] element.
 *  Inside one, ReviewModalShell's aria-hidden sweep removes the region from the
 *  accessibility tree while a modal is open, killing every feed announcement.
 *  Line order is a sound proxy here: the provider is the outermost element of
 *  each return, so it must appear BEFORE that return's inert-root attribute. */
export function a3Ok(src: string): boolean {
  const lines = src.split("\n");
  const providers: number[] = [];
  const inertRoots: number[] = [];
  lines.forEach((l, i) => {
    if (l.includes("<AdminAnnounceProvider")) providers.push(i);
    if (l.includes("data-inert-root")) inertRoots.push(i);
  });
  if (providers.length === 0 || inertRoots.length === 0) return true;
  // EVERY inert root must be preceded by a provider that is still "open" for it,
  // i.e. each inert root has strictly more providers before it than the count of
  // inert roots already seen. Comparing only the FIRST of each passed a layout
  // whose second or third return nested its provider inside the inert div — the
  // live-traffic branches, and exactly the regression A3 exists to catch.
  // Two clauses, because one is not enough. (1) Every inert root must have more
  // providers before it than inert roots before it. (2) The LAST provider must
  // still precede the LAST inert root — clause 1 alone passes a layout whose
  // final return nested its provider inside the inert div, since the earlier
  // returns' providers keep the running count satisfied. Clause 2 is what
  // catches the live-traffic branch, and a first-vs-first comparison caught
  // neither.
  const everyRootCovered = inertRoots.every(
    (rootLine, seen) => providers.filter((p) => p < rootLine).length > seen,
  );
  const lastProviderPrecedesLastRoot =
    providers[providers.length - 1]! < inertRoots[inertRoots.length - 1]!;
  return everyRootCovered && lastProviderPrecedesLastRoot;
}

/** A4: every DIRECT renderer of the button lives under the admin tree. The
 *  transitive case is explicitly NOT guarded (spec §5): ancestry is a runtime
 *  property and this reads source. */
export function a4Ok(path: string, src: string): boolean {
  if (!/<UndoChangeButton/.test(src)) return true;
  return path.includes(join("app", "admin")) || path.includes(join("components", "admin"));
}

describe("META undo announce channel (spec §5)", () => {
  it("A1: every layout return is wrapped in AdminAnnounceProvider", () => {
    expect(a1Ok(read(LAYOUT))).toBe(true);
  });

  it("A1 planted violation: a layout with one wrapper deleted FAILS", () => {
    const stripped = read(LAYOUT).replace("<AdminAnnounceProvider", "<div");
    expect(a1Ok(stripped)).toBe(false);
  });

  it("A2: the channel is mounted only by the layout or a modal shell", () => {
    const bad = scannedFiles().filter((p) => {
      const src = read(p);
      return !a2Ok(src, p === LAYOUT);
    });
    expect(bad, "AdminAnnounceProvider on a non-dialog, non-layout surface").toEqual([]);
  });

  it("A2 planted violation: a channel on an ordinary surface FAILS", () => {
    const planted = `export function Ordinary() {
      return <AdminAnnounceProvider testId="x" label="y">{null}</AdminAnnounceProvider>;
    }`;
    expect(a2Ok(planted, false)).toBe(false);
    // ...and the same source in a dialog-bearing file is allowed.
    expect(a2Ok(planted + '\n<div role="dialog" />', false)).toBe(true);
  });

  it("A2: nothing outside the provider module touches the context directly", () => {
    const bad = scannedFiles().filter(
      (p) => p !== PROVIDER_MODULE && /<UndoAnnounceContext\.Provider/.test(read(p)),
    );
    expect(bad, "a second provider would shadow the sanctioned channels").toEqual([]);
  });

  it("A2 planted violation: a second raw context provider FAILS", () => {
    // The header promises a planted violation per assertion; this half of A2 had
    // none. A raw <UndoAnnounceContext.Provider> anywhere outside the provider
    // module shadows both sanctioned channels with a shorter-lived one.
    const planted =
      "export const X = () => <UndoAnnounceContext.Provider value={v}>{c}</UndoAnnounceContext.Provider>;";
    const detects = (src: string) => /<UndoAnnounceContext\.Provider/.test(src);
    expect(detects(planted)).toBe(true);
    expect(detects('export const Y = () => <AdminAnnounceProvider testId="a" label="b" />;')).toBe(
      false,
    );
  });

  it("A3: the provider is never inside a [data-inert-root] subtree", () => {
    expect(a3Ok(read(LAYOUT))).toBe(true);
  });

  it("A3 planted violation: the THIRD return nesting its provider inside FAILS", () => {
    // The realistic regression, and the one a first-vs-first comparison missed:
    // returns 1 and 2 stay correct while return 3 nests. Built from the real
    // layout source so the mutant cannot drift from the file it guards.
    const real = read(LAYOUT);
    const lines = real.split("\n");
    const providerLines = lines.flatMap((l, i) =>
      l.includes("<AdminAnnounceProvider") ? [i] : [],
    );
    const lastProvider = providerLines[providerLines.length - 1]!;
    const inertAfter = lines.findIndex((l, i) => i > lastProvider && l.includes("data-inert-root"));
    expect(inertAfter, "layout still has an inert root after its last provider").toBeGreaterThan(
      -1,
    );
    // Swap them: the provider now sits INSIDE that return's inert-root element.
    const mutated = [...lines];
    const [providerLine] = mutated.splice(lastProvider, 1);
    mutated.splice(inertAfter, 0, providerLine!);
    expect(a3Ok(mutated.join("\n"))).toBe(false);
  });

  it("A3 planted violation: a single-return nesting FAILS", () => {
    const planted = [
      "return (",
      '  <div data-inert-root="">',
      '    <AdminAnnounceProvider testId="x" label="y">',
      "      {children}",
      "    </AdminAnnounceProvider>",
      "  </div>",
      ");",
    ].join("\n");
    expect(a3Ok(planted)).toBe(false);
  });

  it("A4: every direct UndoChangeButton renderer lives under the admin tree", () => {
    const bad = scannedFiles().filter((p) => !a4Ok(p, read(p)));
    expect(bad, "an UndoChangeButton outside app/admin or components/admin").toEqual([]);
  });

  it("A4 planted violation: a renderer outside the admin tree FAILS", () => {
    const planted = 'export const X = () => <UndoChangeButton changeLogId="1" />;';
    expect(a4Ok(join(ROOT, "components", "shared", "X.tsx"), planted)).toBe(false);
    expect(a4Ok(join(ROOT, "components", "admin", "X.tsx"), planted)).toBe(true);
  });

  it("the two sanctioned mount sites are the ones actually shipping", () => {
    // Not an allowlist assertion (A2 owns the rule) — a census, so a reviewer can
    // see at a glance which surfaces own a channel today.
    const mounts = scannedFiles()
      .filter((p) => /<AdminAnnounceProvider/.test(read(p)))
      .map((p) => p.slice(ROOT.length + 1))
      .sort();
    expect(mounts).toEqual([
      join("app", "admin", "layout.tsx"),
      join("components", "admin", "review", "ReviewModalShell.tsx"),
    ]);
  });
});
