/**
 * tests/components/admin/showpage/_metaRowWrapperInert.test.ts
 *
 * Structural guard: the Careful row WRAPPERS attach no behavior.
 *
 * Why source-level rather than behavioral. Review walked a behavioral guard
 * through `onClick`, then `onPointerDown`/`onMouseDown`, then `onPointerEnter`/
 * `onPointerOver`, then `onDoubleClick`/`onContextMenu`. Each round added events
 * and the next named more. Finite event sampling cannot prove a handler is
 * ABSENT — there are ~60 React DOM event props.
 *
 * Why an AST rather than a regex. The regex version was broken three ways in one
 * review round, all lexing failures: a `>` inside an attribute value truncated
 * the match (failing CORRECT code), a wrapper written in a COMMENT supplied a
 * decoy match, and a `ref` callback attached a native listener invisibly. A real
 * parse removes the first two by construction and makes the third checkable.
 *
 * The scanner is pure and unit-tested below against the correct shape and every
 * one of those escapes — a guard that silently matches nothing is worse than none.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanRowWrappers, WRAPPER_CLASS_VALUE } from "./_rowWrapperScan";

const FILES = [
  "app/admin/show/[slug]/RotateShareTokenButton.tsx",
  "app/admin/show/[slug]/PickerResetControl.tsx",
] as const;

const CLEAN = `const C = () => <div className="${WRAPPER_CLASS_VALUE}">{rowButton}</div>;`;

describe("the scanner itself", () => {
  it("finds the prescribed wrapper and reports it clean", () => {
    const { found } = scanRowWrappers(CLEAN);
    expect(found).toHaveLength(1);
    expect(found[0]!.offending).toEqual([]);
  });

  it("flags an on* prop", () => {
    const src = `const C = () => <div onDoubleClick={f} className="${WRAPPER_CLASS_VALUE}">x</div>;`;
    expect(scanRowWrappers(src).found[0]!.offending).toEqual(["onDoubleClick"]);
  });

  it("flags a JSX spread", () => {
    const src = `const C = () => <div {...p} className="${WRAPPER_CLASS_VALUE}">x</div>;`;
    expect(scanRowWrappers(src).found[0]!.offending).toEqual(["{...spread}"]);
  });

  it("flags a ref, which can attach a native listener imperatively", () => {
    const src = `const C = () => <div ref={(n) => n?.addEventListener("contextmenu", f)} className="${WRAPPER_CLASS_VALUE}">x</div>;`;
    expect(scanRowWrappers(src).found[0]!.offending).toEqual(["ref"]);
  });

  it("is NOT confused by a '>' inside an attribute value (regex truncated here)", () => {
    const src = `const C = () => <div data-note="width > zero" className="${WRAPPER_CLASS_VALUE}">x</div>;`;
    const { found } = scanRowWrappers(src);
    expect(found).toHaveLength(1);
    expect(found[0]!.offending).toEqual([]);
  });

  it("ignores a wrapper written in a COMMENT, so a decoy cannot mask the real one", () => {
    const src = [
      `// <div className="${WRAPPER_CLASS_VALUE}">`,
      `const C = () => <div {...props} className="${WRAPPER_CLASS_VALUE}">x</div>;`,
    ].join("\n");
    const { found } = scanRowWrappers(src);
    expect(found, "the comment must not contribute a decoy opening").toHaveLength(1);
    expect(found[0]!.offending).toEqual(["{...spread}"]);
  });

  it("does NOT match an assembled class expression - the source-form contract", () => {
    expect(scanRowWrappers(`const C = () => <div className={W.join(" ")}>x</div>;`).found).toEqual(
      [],
    );
  });

  it("FLAGS the assembled spelling, so a dead-branch decoy cannot mask the real wrapper", () => {
    // Without this, `false ? <div className="literal…"/> : <div className={WRAPPER_CLASSES.join(" ")} onDoubleClick={f}/>`
    // reports one CLEAN wrapper while the rendered one is unscanned.
    const src = [
      "const C = () => (false ? (",
      `  <div className="${WRAPPER_CLASS_VALUE}">{b}</div>`,
      ") : (",
      '  <div className={WRAPPER_CLASSES.join(" ")} onDoubleClick={f}>{b}</div>',
      "));",
    ].join("\n");
    const scan = scanRowWrappers(src);
    expect(scan.found).toHaveLength(1);
    expect(scan.found[0]!.offending).toEqual([]);
    expect(scan.assembledClassName, "the assembled decoy must be flagged").toHaveLength(1);
  });

  it("FLAGS addEventListener, which can reach the wrapper indirectly", () => {
    const src = [
      "const C = () => {",
      "  useEffect(() => {",
      "    buttonRef.current?.parentElement?.addEventListener('contextmenu', arm);",
      "  }, []);",
      `  return <div className="${WRAPPER_CLASS_VALUE}"><button ref={buttonRef} /></div>;`,
      "};",
    ].join("\n");
    const scan = scanRowWrappers(src);
    expect(scan.found[0]!.offending, "the opening itself is clean").toEqual([]);
    expect(scan.imperativeListeners, "the indirect attachment must be flagged").toHaveLength(1);
  });
});

describe("Careful row wrappers attach no behavior (spec §4.1, §7.0)", () => {
  for (const file of FILES) {
    it(`${file}: wrapper present, with no on* prop, spread, or ref`, () => {
      const { found, assembledClassName, imperativeListeners } = scanRowWrappers(
        readFileSync(file, "utf8"),
        file,
      );
      // The source-form contract is ENFORCED, not merely relied upon: an
      // assembled className would be invisible to the wrapper scan, so a dead
      // branch could supply a clean literal decoy while the rendered wrapper
      // went unchecked.
      expect(
        assembledClassName,
        `${file}: the wrapper class list must be a literal, never assembled`,
      ).toEqual([]);
      // These components attach every listener through React props, so ANY
      // addEventListener is an imperative attachment - and it can reach the
      // wrapper indirectly via parentElement without touching its opening tag.
      expect(
        imperativeListeners,
        `${file}: must not call addEventListener (React props only)`,
      ).toEqual([]);
      expect(
        found.length,
        `no row wrapper found in ${file}. It must be written with the literal ` +
          `className="${WRAPPER_CLASS_VALUE}" (source-form contract, see _rowWrapperScan.ts).`,
      ).toBeGreaterThan(0);
      for (const w of found) {
        expect(w.offending, `${file}:${w.line} row wrapper must attach no behavior`).toEqual([]);
      }
    });
  }
});
