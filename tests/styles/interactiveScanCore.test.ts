import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import {
  FLOOR_COMPONENT_ALLOWLIST,
  allStrings,
  defeaterPresent,
  heightFloorSatisfied,
  scanInteractiveElements,
  themeBlocks,
  type ScanElement,
  type ScanOptions,
} from "./interactiveScanCore";

/**
 * Scratch roots this file creates, removed together in `afterAll`.
 *
 * `afterAll` rather than per-case: vitest runs it even when a case fails, and a
 * cleanup that only runs on success leaks exactly when a suite is being
 * debugged, which is when it runs most. Guard:
 * `tests/mutation/_metaScratchRootCleanup.test.ts`. Row:
 * BL-MUTATION-SCRATCH-FS-EVENT-STORM.
 */
const scratchRoots: string[] = [];
function trackScratch(root: string): string {
  scratchRoots.push(root);
  return root;
}
afterAll(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
  scratchRoots.length = 0;
});

const el = (over: Partial<ScanElement>): ScanElement => ({
  file: "x.tsx",
  line: 1,
  tag: "button",
  paths: [[]],
  unresolved: false,
  hasClassName: true,
  // Default FALSE, deliberately: the allowlist is an identity the scanner
  // resolves from an import, so a unit case has to claim it on purpose.
  allowlisted: false,
  admittedAs: "element",
  ...over,
});

// Fixture harness (plan R2 F3): the resolver is ALSO exercised end-to-end through temp files,
// so a flattening scanner or first-wins lookup cannot stay green on unit cases alone.
function scanFixture(source: string, options?: ScanOptions) {
  return scanFixtureFiles({ "components/Fx.tsx": source }, options);
}

/**
 * The multi-file form. An import hop, a re-export chain and the hop CEILING can
 * only be expressed across real files, and every one of those was a surviving
 * mutant until this existed (2026-08-15 mutation run).
 */
function scanFixtureFiles(files: Record<string, string>, options?: ScanOptions) {
  const dir = trackScratch(mkdtempSync(join(tmpdir(), "scan-fixture-")));
  mkdirSync(join(dir, "components"), { recursive: true });
  mkdirSync(join(dir, "app"), { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return scanInteractiveElements(dir, options);
}

/**
 * The `textEntry` axis (spec §4, §5.3).
 *
 * The DEFAULT case is not decoration: it is the half that proves the flag is
 * what admits these kinds, rather than some unrelated widening. Without it the
 * `textEntry: true` case passes on a scanner that admits text-entry
 * unconditionally, which is the change the four default-reading consumers
 * (spec §7.3 to §7.6) must never see.
 */
describe("ScanOptions.textEntry (spec §4 D1, §5.3)", () => {
  const FIXTURE = `
    export function Fx({ kind }: { kind: string }) {
      return (
        <div>
          <textarea className="ta" />
          <select className="se" />
          <input type="email" className="em" />
          <input type={kind} className="dyn" />
          <input type="checkbox" className="cb" />
          <button className="btn">go</button>
        </div>
      );
    }
  `;
  const kinds = (els: ScanElement[]) => els.map((e) => e.tag).sort();

  it("admits textarea, select and input at ANY type when the flag is on", () => {
    const els = scanFixture(FIXTURE, { textEntry: true });
    expect(kinds(els)).toEqual(["button", "input", "input", "input", "select", "textarea"]);
    // The dynamic type is admitted WITHOUT reading it (§5.3): a `type={expr}`
    // the resolver cannot read is in scope, not demoted out of scope.
    expect(
      allStrings(els.find((e) => e.tag === "input" && allStrings(e).includes("dyn"))!),
    ).toContain("dyn");
  });

  it("admits NONE of them at the default, and still admits checkbox and button", () => {
    expect(kinds(scanFixture(FIXTURE))).toEqual(["button", "input"]);
    expect(kinds(scanFixture(FIXTURE, {}))).toEqual(["button", "input"]);
    expect(kinds(scanFixture(FIXTURE, { textEntry: false }))).toEqual(["button", "input"]);
  });

  it("reads the flag by identity, so a truthy non-true value does not widen", () => {
    // `=== true`, never truthiness (§5.3 guard conditions). A cast is the only
    // way to express the mistake this pins, and the mistake is what a caller
    // threading an untyped config would make.
    const els = scanFixture(FIXTURE, { textEntry: 1 as unknown as boolean });
    expect(kinds(els)).toEqual(["button", "input"]);
  });
});

/**
 * AC-1: with both flags off the cover is what it was.
 *
 * The EXACT comparison against `b30413cf5` is a task-time verification whose
 * transcript is in the commit (plan Task 1): pinned here it would red on every
 * unrelated PR that adds a control, which is why every live premise in this
 * corpus uses a floor rather than an equality. What ships is the structural
 * claim, which survives corpus growth and says the same thing.
 */
describe("AC-1 the default cover is unchanged", () => {
  it("admits no painted child and no text-entry kind over the live corpus", () => {
    const live = scanInteractiveElements(process.cwd());
    premiseHolds("corpus has >=300 in-scope elements", live.length >= 300);
    expect(live.filter((e) => e.tag === "textarea" || e.tag === "select")).toEqual([]);
    // The painted-child half of this claim lands with `admittedAs` in Task 2.
  });

  it("is not vacuous: the same fixture holds one of each kind the default excludes", () => {
    const FIXTURE = `
      export function Fx() {
        return (
          <button className="b">
            <textarea className="ta" />
            <select className="se" />
            <input type="email" className="em" />
          </button>
        );
      }
    `;
    expect(scanFixture(FIXTURE).map((e) => e.tag)).toEqual(["button"]);
    expect(
      scanFixture(FIXTURE, { textEntry: true })
        .map((e) => e.tag)
        .sort(),
    ).toEqual(["button", "input", "select", "textarea"]);
  });
});

/**
 * The `paintedChildren` axis (spec §5, D2).
 *
 * Family B's principle is that paint landing on a child rather than on the
 * interactive element is not a reason to treat it differently, so the child is
 * admitted as its OWN element, anchored on its own opening tag. Both censuses
 * then stay keyed the way they already key.
 */
describe("ScanOptions.paintedChildren (spec §5 D2, §5.3)", () => {
  const ON = { paintedChildren: true } as const;
  const at = (els: ScanElement[], tag: string) => els.filter((e) => e.tag === tag);

  it("admits a className-carrying child of an in-scope element, on its OWN line", () => {
    const els = scanFixture(
      `export function Fx() {
        return (
          <button className="outer">
            <span className="painted" />
          </button>
        );
      }`,
      ON,
    );
    const child = at(els, "span")[0];
    expect(child).toBeDefined();
    expect(allStrings(child!)).toEqual(["painted"]);
    expect(child!.admittedAs).toBe("painted-child");
    // Its own opening tag, not the parent's: the fill census keys on file+line.
    expect(child!.line).toBeGreaterThan(at(els, "button")[0]!.line);
  });

  it("does NOT admit a child without a className", () => {
    const els = scanFixture(
      `export function Fx() {
        return (
          <button className="outer">
            <span />
          </button>
        );
      }`,
      ON,
    );
    expect(at(els, "span")).toEqual([]);
  });

  it("admits a nested in-scope element ONCE, as an element", () => {
    const els = scanFixture(
      `export function Fx() {
        return (
          <button className="outer">
            <button className="inner">x</button>
          </button>
        );
      }`,
      ON,
    );
    expect(at(els, "button").map((e) => e.admittedAs)).toEqual(["element", "element"]);
  });

  it("does NOT admit JSX inside an ATTRIBUTE of an in-scope element (limit L2)", () => {
    const els = scanFixture(
      `export function Fx() {
        return <button className="outer" title={<span className="in-attr" />} />;
      }`,
      ON,
    );
    expect(at(els, "span")).toEqual([]);
  });

  it("does NOT admit a painted element with no in-scope ancestor", () => {
    const els = scanFixture(
      `export function Fx() {
        return (
          <div className="wrap">
            <span className="painted" />
          </div>
        );
      }`,
      ON,
    );
    expect(at(els, "span")).toEqual([]);
  });

  it("admits none of it at the default, which is what the four default consumers read", () => {
    const src = `export function Fx() {
      return (
        <button className="outer">
          <span className="painted" />
        </button>
      );
    }`;
    expect(scanFixture(src).map((e) => e.tag)).toEqual(["button"]);
    expect(scanFixture(src, { paintedChildren: false }).map((e) => e.tag)).toEqual(["button"]);
    expect(
      scanFixture(src, { paintedChildren: 1 as unknown as boolean }).map((e) => e.tag),
    ).toEqual(["button"]);
  });

  it("every element the DEFAULT returns is admittedAs element, over the live corpus", () => {
    const live = scanInteractiveElements(process.cwd());
    premiseHolds("corpus has >=300 in-scope elements", live.length >= 300);
    expect(live.filter((e) => e.admittedAs !== "element")).toEqual([]);
  });
});

/**
 * The two resolution edges beyond ancestry (spec §5.1).
 *
 * Both exist because a live site needed them, and each fixture below is shaped
 * like the site that forced it. The refusals are documented limit L1 and L2
 * asserted rather than described.
 */
describe("ScanOptions.paintedChildren resolution edges (spec §5.1)", () => {
  const ON = { paintedChildren: true } as const;
  const painted = (els: ScanElement[]) => els.filter((e) => e.admittedAs === "painted-child");

  it("edge 1: follows a JSX child that is a bare local identifier (VenueMapTile shape)", () => {
    const els = scanFixture(
      `export function Fx({ href }: { href: string }) {
        const inner = (
          <>
            <span className="directions" />
          </>
        );
        return <a href={href} className="tile">{inner}</a>;
      }`,
      ON,
    );
    expect(painted(els).map((e) => allStrings(e).join(" "))).toEqual(["directions"]);
  });

  it("edge 2: follows a NAMED import one hop, reporting against the callee (CronRunSummaryCard shape)", () => {
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { Card } from "./Card";
          export function Fx() {
            return <div role="button" className="row"><Card /></div>;
          }`,
        "components/Card.tsx": `export function Card() {
            return <div className="card-edge" />;
          }`,
      },
      ON,
    );
    const child = painted(els)[0];
    expect(child).toBeDefined();
    expect(allStrings(child!)).toEqual(["card-edge"]);
    // Against the CALLEE's file, so the row names the file a reader must edit.
    expect(child!.file).toBe("components/Card.tsx");
  });

  it("edge 2: follows a DEFAULT import one hop too", () => {
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import Card from "./Card";
          export function Fx() {
            return <button className="outer"><Card /></button>;
          }`,
        "components/Card.tsx": `export default function Card() {
            return <span className="card-edge" />;
          }`,
      },
      ON,
    );
    expect(painted(els).map((e) => allStrings(e).join(" "))).toEqual(["card-edge"]);
  });

  it("L1: does NOT follow a tag the resolver cannot name", () => {
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { withThing } from "./hoc";
          import { Base } from "./Base";
          const Wrapped = withThing(Base);
          export function Fx() {
            return <button className="outer"><Wrapped /></button>;
          }`,
        "components/hoc.tsx": `export const withThing = (C: unknown) => C;`,
        "components/Base.tsx": `export function Base() {
            return <span className="hoc-painted" />;
          }`,
      },
      ON,
    );
    expect(painted(els).map((e) => allStrings(e).join(" "))).not.toContain("hoc-painted");
  });

  it("does NOT follow a component that is NOT inside an in-scope ancestor", () => {
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { Card } from "./Card";
          export function Fx() {
            return <div className="plain"><Card /></div>;
          }`,
        "components/Card.tsx": `export function Card() {
            return <div className="card-edge" />;
          }`,
      },
      ON,
    );
    expect(painted(els)).toEqual([]);
  });

  it("terminates on a cyclic pair of JSX-valued consts", () => {
    const els = scanFixture(
      `export function Fx() {
        const a = <span className="a">{b}</span>;
        const b = <span className="b">{a}</span>;
        return <button className="outer">{a}</button>;
      }`,
      ON,
    );
    expect(
      painted(els)
        .map((e) => allStrings(e).join(" "))
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("terminates on a component that renders itself", () => {
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { Card } from "./Card";
          export function Fx() {
            return <button className="outer"><Card /></button>;
          }`,
        "components/Card.tsx": `export function Card() {
            return <span className="card-edge"><Card /></span>;
          }`,
      },
      ON,
    );
    expect(painted(els).map((e) => allStrings(e).join(" "))).toEqual(["card-edge"]);
  });

  it("AC-4b: a component invoked from TWO in-scope ancestors contributes its elements once", () => {
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { Card } from "./Card";
          export function Fx() {
            return (
              <div>
                <button className="one"><Card /></button>
                <button className="two"><Card /></button>
              </div>
            );
          }`,
        "components/Card.tsx": `export function Card() {
            return <span className="card-edge" />;
          }`,
      },
      ON,
    );
    expect(painted(els).filter((e) => allStrings(e).includes("card-edge"))).toHaveLength(1);
  });

  it("follows neither edge at the default", () => {
    const files = {
      "components/Fx.tsx": `import { Card } from "./Card";
        export function Fx() {
          const inner = <span className="directions" />;
          return <button className="outer">{inner}<Card /></button>;
        }`,
      "components/Card.tsx": `export function Card() {
          return <span className="card-edge" />;
        }`,
    };
    expect(painted(scanFixtureFiles(files))).toEqual([]);
    expect(scanFixtureFiles(files).map((e) => e.tag)).toEqual(["button"]);
  });
});

/**
 * The mutants the first scored run of this surface left alive.
 *
 * `interactiveScanCore` had never actually been scored before 2026-08-26: its
 * shard aborted on an unrelated red baseline, so the two axes and the two
 * resolution edges shipped with no mutation evidence at all. The run that
 * finally reached it named 20 live sites in that new code. These cases kill the
 * ones that are killable; the rest carry per-mutant `accepted` rows.
 *
 * Each case says which mutant it kills, so a later reader can tell an assertion
 * that earns its place from one that merely passes.
 */
describe("what the first score of this surface found unpinned", () => {
  const ON = { paintedChildren: true } as const;
  const painted = (els: ScanElement[]) => els.filter((e) => e.admittedAs === "painted-child");

  it("follows a component declared in the SAME file (kills visit(local) removal)", () => {
    // The DeveloperToggleButton shape: the paint lives in a sibling component
    // function, not in the button's own JSX. Only the local-declaration branch
    // reaches it, and nothing exercised that branch before.
    const els = scanFixture(
      `function Track() {
        return <span className="tracked" />;
      }
      export function Fx() {
        return <button className="outer"><Track /></button>;
      }`,
      ON,
    );
    expect(painted(els).map((e) => allStrings(e).join(" "))).toEqual(["tracked"]);
  });

  it("does not resolve an unimported tag through an unrelated DEFAULT import (kills the 994 &&/|| flip)", () => {
    // With `||` the default-import scan's condition is true for ANY import
    // (every one has a string-literal specifier), so it resolves the FIRST
    // import regardless of the name being looked up. That is only OBSERVABLE
    // when the wrongly-chosen module happens to declare the tag's name too, so
    // the fixture makes it declare exactly that: `Other.tsx` exports both
    // `Other` and a painting `Card`, and `Card` is never imported.
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import Other from "./Other";
          export function Fx() {
            return <button className="outer"><Card /><Other /></button>;
          }`,
        "components/Other.tsx": `export function Card() {
            return <span className="wrong-module-card" />;
          }
          export default function Other() {
            return <span className="other-paint" />;
          }`,
      },
      ON,
    );
    const found = painted(els)
      .map((e) => allStrings(e).join(" "))
      .sort();
    // `Other` IS imported and resolves. `Card` is not imported at all, so its
    // same-named declaration in the other module must never be reached.
    expect(found).toEqual(["other-paint"]);
  });

  it("follows NOTHING outside a control (kills both `insideInScope > 0` flips on the follow guard)", () => {
    // `lib/` is outside CORPUS_DIRS, so the button below is reachable ONLY by
    // following. The host renders <Card /> at top level, inside no control at
    // all, so the shipped scanner must never reach it: component-following is
    // the mechanism that lets a control account for the paint it OWNS, not a
    // second corpus walk. Both mutations at that guard (`&&`->`||`, `>`->`>=`)
    // make the condition true at top level, and both then admit this button.
    const els = scanFixtureFiles(
      {
        "components/Host.tsx": `import Card from "../lib/Card";
          export function Host() {
            return <div className="page"><Card /></div>;
          }`,
        "lib/Card.tsx": `export default function Card() {
            return <button className="reachable-only-by-following" />;
          }`,
      },
      ON,
    );
    expect(els.map((e) => e.tag)).toEqual([]);
  });

  it("gives a followed component the import-hop budget of ONE hop, not two (kills `hops + 1` -> `+ 2`)", () => {
    // MAX_IMPORT_HOPS is 3, so a control at hops 0 that follows into another
    // module leaves that module 2 hops to resolve a className with. The chain
    // below needs exactly 2. Spending 2 hops on the single follow leaves 1, and
    // the class string silently disappears instead of the scan reporting it.
    const els = scanFixtureFiles(
      {
        "components/Host.tsx": `import Card from "../lib/Card";
          export function Host() {
            return <button className="outer"><Card /></button>;
          }`,
        "lib/Card.tsx": `import { CLS } from "./tok1";
          export default function Card() {
            return <span className={CLS} />;
          }`,
        "lib/tok1.ts": `import { RAW } from "./tok2";
          export const CLS = RAW;`,
        "lib/tok2.ts": `export const RAW = "two-hops-away";`,
      },
      ON,
    );
    const admitted = painted(els);
    expect(admitted).toHaveLength(1);
    const [child] = admitted;
    expect(child, "the followed module's span was not admitted at all").toBeDefined();
    expect((child as ScanElement).unresolved).toBe(false);
    expect(allStrings(child as ScanElement)).toContain("two-hops-away");
  });

  it("RESETS the resolve depth when it follows, rather than carrying one in (kills `depth: 0` -> `1`)", () => {
    // MAX_RESOLVE_DEPTH is 6. The followed module's own const chain is measured
    // from zero because the follow enters a new module, not a deeper expression;
    // starting it at 1 spends a level the followed module is entitled to and the
    // last link of the chain resolves to nothing.
    const chain = Array.from({ length: 6 }, (_, n) =>
      n === 0 ? `const a0 = "chain-end";` : `const a${n} = a${n - 1};`,
    ).join("\n          ");
    const els = scanFixtureFiles(
      {
        "components/Host.tsx": `import Card from "../lib/Card";
          export function Host() {
            return <button className="outer"><Card /></button>;
          }`,
        "lib/Card.tsx": `${chain}
          export default function Card() {
            return <span className={a5} />;
          }`,
      },
      ON,
    );
    const admitted = painted(els);
    expect(admitted).toHaveLength(1);
    const [child] = admitted;
    expect(child, "the followed module's span was not admitted at all").toBeDefined();
    expect(allStrings(child as ScanElement)).toContain("chain-end");
  });

  it("restores the SOURCE FILE after following into another module (kills `sf = heldSf` removal)", () => {
    // `ctx` and `sf` are restored by two separate statements, and dropping only
    // the `sf` one leaves the walk reading the FOLLOWED module's text while it
    // is still walking this one. Every tag name after that point comes from
    // `tagName.getText(sf)`, so it is read out of the wrong file's character
    // offsets: the second control below stops being recognised as a button at
    // all. The first control has to come FIRST for the follow to have happened
    // by the time the second is reached, which is the whole shape of the bug.
    const els = scanFixtureFiles(
      {
        "components/Host.tsx": `import Card from "../lib/Card";
          export function Host() {
            return (
              <div>
                <button className="first-control"><Card /></button>
                <button className="second-control-after-the-follow" />
              </div>
            );
          }`,
        "lib/Card.tsx": `export default function Card() {
            return <span className="followed-paint" />;
          }`,
      },
      ON,
    );
    const seen = els.map((e) => allStrings(e).join(" ")).sort();
    expect(seen).toEqual(["first-control", "followed-paint", "second-control-after-the-follow"]);
  });

  it("terminates on a MUTUAL import cycle (kills followed.add removal on the import path)", () => {
    // A renders B, B renders A. The local-declaration guard cannot catch this:
    // the two names live in different files, so only the import path's own
    // followed-key stops it. Without that add this recurses until the stack
    // gives out.
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { B } from "./B";
          export function Fx() {
            return <button className="outer"><B /></button>;
          }`,
        "components/B.tsx": `import { Fx } from "./Fx";
          export function B() {
            return <span className="b-paint"><Fx /></span>;
          }`,
      },
      ON,
    );
    expect(painted(els).some((e) => allStrings(e).includes("b-paint"))).toBe(true);
  });

  it("stops treating siblings as inside once the in-scope element closes (kills insideInScope-- removal)", () => {
    const els = scanFixture(
      `export function Fx() {
        return (
          <div>
            <button className="outer"><span className="inside" /></button>
            <span className="after" />
          </div>
        );
      }`,
      ON,
    );
    // "after" is a sibling of the button, not a child of it.
    expect(painted(els).map((e) => allStrings(e).join(" "))).toEqual(["inside"]);
  });

  it("does not follow a bare identifier with no in-scope ancestor (kills the >/>= flip on the const guard)", () => {
    const els = scanFixture(
      `export function Fx() {
        const inner = <span className="held" />;
        return <div className="plain">{inner}</div>;
      }`,
      ON,
    );
    expect(painted(els)).toEqual([]);
  });

  it("does not follow a function CALL in a JSX child (kills the isJsxExpression &&/|| flip, and pins limit L2)", () => {
    // `A && B && C` mutated to `A || B && C` follows anything whose `.expression`
    // is an identifier, and a CallExpression's callee is exactly that. The
    // helper below returns JSX, so the mutant would admit its span — which is
    // also the documented limit that a call is not a followed edge.
    const els = scanFixture(
      `function renderIcon() {
        return <span className="called" />;
      }
      export function Fx() {
        return <button className="outer">{renderIcon()}</button>;
      }`,
      ON,
    );
    expect(painted(els).map((e) => allStrings(e).join(" "))).toEqual([]);
  });

  it("reports a followed child against the CALLEE's own line (kills sf = imported.sf removal)", () => {
    // Without the source-file swap the line is computed against the CALLER's
    // text, so the row points at a line in the wrong file. The fixture puts the
    // callee's span far down its own file so a stale `sf` cannot coincide.
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { Card } from "./Card";
          export function Fx() {
            return <div role="button" className="row"><Card /></div>;
          }`,
        "components/Card.tsx": `// 1
          // 2
          // 3
          // 4
          // 5
          // 6
          // 7
          // 8
          export function Card() {
            return <div className="card-edge" />;
          }`,
      },
      ON,
    );
    const child = painted(els).find((e) => allStrings(e).includes("card-edge"));
    expect(child).toBeDefined();
    expect(child!.file).toBe("components/Card.tsx");
    expect(child!.line).toBe(10);
  });

  it("restores the caller's file after a follow (kills sf = heldSf and ctx = heldCtx removal)", () => {
    // An element AFTER the follow, in the caller, must still be attributed to
    // the caller. Without the restore it inherits the callee's file and line.
    const els = scanFixtureFiles(
      {
        "components/Fx.tsx": `import { Card } from "./Card";
          export function Fx() {
            return (
              <button className="outer">
                <Card />
                <span className="later" />
              </button>
            );
          }`,
        "components/Card.tsx": `export function Card() {
            return <div className="card-edge" />;
          }`,
      },
      ON,
    );
    const later = painted(els).find((e) => allStrings(e).includes("later"));
    expect(later).toBeDefined();
    expect(later!.file).toBe("components/Fx.tsx");
  });
});

describe("resolver corpus walk", () => {
  const all = scanInteractiveElements(process.cwd());
  it("covers the live corpus (premise: non-trivial)", () => {
    premiseHolds("corpus has >=300 in-scope elements", all.length >= 300);
  });
  it("resolves same-file helper calls (segClass shape, spec §5.2 rule 6)", () => {
    const seg = all.filter((e) => e.file.endsWith("DashboardBucketSegmentedControl.tsx"));
    premiseHolds("segmented control links found", seg.length >= 2);
    expect(seg.some((e) => allStrings(e).some((str) => /text-text-subtle/.test(str)))).toBe(true);
  });
  it("resolves imported constants one hop (SECONDARY_ACTION_CLASS consumers clear)", () => {
    const re = all.find((e) => e.file.endsWith("RescanSheetButton.tsx"));
    expect(re && heightFloorSatisfied(re)).toBe(true);
  });
  it("marks prop-flow children unresolved (ClaimedRowButton, spec §10)", () => {
    const c = all.find((e) => e.file.endsWith("_ClaimedRowButton.tsx"));
    expect(c?.unresolved).toBe(true);
  });
  it("includes allowlisted component call sites without onClick (RetryWatchButton)", () => {
    expect(
      all.some((e) => e.file.endsWith("RetryWatchButton.tsx") && e.tag === "AccentButton"),
    ).toBe(true);
  });
});

describe("resolver end-to-end fixtures (plan R2 F3, executable, not comments)", () => {
  it("innermost const shadows outer: shadowed under-floor value must NOT clear", () => {
    const els = scanFixture(
      [
        'const k = "min-h-tap-min";',
        "export function C() {",
        '  const k = "min-h-0";',
        "  return <button className={k}>x</button>;",
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });
  it("a ternary emits two paths, not a flattened union", () => {
    const els = scanFixture(
      [
        "export function C({ f }: { f: boolean }) {",
        '  return <button className={f ? "min-h-tap-min" : "px-2"}>x</button>;',
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b?.paths.length).toBe(2);
    expect(b && heightFloorSatisfied(b)).toBe(false); // one floorless path
  });
  // A spread CAN carry or override className, so the default is demotion. But
  // the overwhelmingly common shape in this corpus is a conditional spread of
  // object LITERALS (`{...(external ? { target, rel } : {})}`), whose keys are
  // right there to read: it provably cannot touch className, and demoting it
  // would put a dozen correctly-floored controls into a census that then rots.
  it("a spread of object literals without a className key does not demote", () => {
    const els = scanFixture(
      [
        "export function C({ external }: { external: boolean }) {",
        '  return <button {...(external ? { target: "_blank", rel: "noopener" } : {})} className="min-h-tap-min">x</button>;',
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });
  it.each([
    ["{...rest}", "an identifier the resolver cannot read"],
    ['{...{ [key]: "" }}', "a computed key that could be className"],
    ['{...{ className: "min-h-0" }}', "a literal className the element inherits"],
  ])("a spread of %s demotes", (spread) => {
    const els = scanFixture(
      [
        "export function C({ rest, key }: { rest: object; key: string }) {",
        `  return <button ${spread} className="min-h-tap-min">x</button>;`,
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });
  // ---- resolver BOUNDS (added 2026-08-15 against surviving mutants) ----
  //
  // Each bound below was invisible to this suite: every fixture above sits well
  // inside all three, so the constants could be moved and the comparisons
  // loosened with nothing to notice. A bound is only pinned by a fixture that
  // stands exactly ON it.
  it("resolve depth: 6 nested parens resolve, 7 exhaust the budget", () => {
    const at = (n: number) =>
      scanFixture(
        [
          "export function C() {",
          `  return <button className={${"(".repeat(n)}"min-h-tap-min"${")".repeat(n)}}>x</button>;`,
          "}",
        ].join("\n"),
      ).find((e) => e.tag === "button");
    // Each ParenthesizedExpression costs one level, so the literal at 7 is the
    // first expression past MAX_RESOLVE_DEPTH.
    const six = at(6);
    expect(six?.unresolved).toBe(false);
    expect(six && heightFloorSatisfied(six)).toBe(true);
    const seven = at(7);
    expect(seven?.unresolved).toBe(true);
    expect(seven && heightFloorSatisfied(seven)).toBe(false);
  });

  it("path cap: exactly 64 alternatives survive intact, 65 collapse", () => {
    // 2^6 ternaries = 64 paths, every one floored: the cap is checked BOTH
    // inside `concat`'s inner loop and again in `capped`, so a fixture landing
    // exactly on it pins both comparisons at once.
    const arms = ["a", "b", "c", "d", "e", "f"]
      .map((p) => `${p} ? "min-h-tap-min" : "h-11"`)
      .join(", ");
    const props = "{ a, b, c, d, e, f, g }: Record<string, boolean>";
    const sixtyFour = scanFixture(
      [
        `export function C(${props}) {`,
        `  return <button className={cn(${arms})}>{String(g)}</button>;`,
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(sixtyFour?.paths.length).toBe(64);
    expect(sixtyFour?.unresolved).toBe(false);
    expect(sixtyFour && heightFloorSatisfied(sixtyFour)).toBe(true);

    // One more alternative, via an outer fork, is 65 and must collapse.
    const sixtyFive = scanFixture(
      [
        `export function C(${props}) {`,
        `  return <button className={g ? cn(${arms}) : "min-h-tap-min"}>x</button>;`,
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(sixtyFive?.paths.length).toBe(1);
    expect(sixtyFive?.unresolved).toBe(true);
  });

  it("a collapsed resolution KEEPS its strings, it only stops tracking their structure", () => {
    // `collapse` unions every string it saw into one path. If it returned an
    // empty path instead, the tap guard would still demote (unresolved), but the
    // SUBTLE guard reads the strings — so a policy hit inside a blown-out class
    // string would silently vanish. That is the one consequence of collapsing
    // that is not "demote", and nothing pinned it.
    const arms = ["a", "b", "c", "d", "e", "f", "g"]
      .map((p, i) => (i === 0 ? `${p} ? "text-text-subtle" : "p-1"` : `${p} ? "h-1" : "h-2"`))
      .join(", ");
    const b = scanFixture(
      [
        "export function C({ a, b, c, d, e, f, g }: Record<string, boolean>) {",
        `  return <button className={cn(${arms})}>x</button>;`,
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && allStrings(b)).toContain("text-text-subtle");
  });

  it("import hops: a three-hop re-export chain resolves, a four-hop one does not", () => {
    const chain = (links: number) => {
      const files: Record<string, string> = {
        "components/Fx.tsx": [
          'import { K } from "./a";',
          "export function C() {",
          "  return <button className={K}>x</button>;",
          "}",
        ].join("\n"),
      };
      const names = ["a", "b", "c", "d"].slice(0, links);
      names.forEach((name, i) => {
        const next = names[i + 1];
        files[`components/${name}.tsx`] = next
          ? `export { K } from "./${next}";`
          : 'export const K = "min-h-tap-min";';
      });
      return scanFixtureFiles(files).find((e) => e.tag === "button");
    };
    const three = chain(3);
    expect(three?.unresolved).toBe(false);
    expect(three && heightFloorSatisfied(three)).toBe(true);
    const four = chain(4);
    expect(four?.unresolved).toBe(true);
    expect(four && heightFloorSatisfied(four)).toBe(false);
  });

  // ---- expression forms the corpus happens to use, but no fixture did ----
  it.each([
    ['{"min-h-tap-min" as string}', "an as-expression"],
    ["{A || B}", "a `||` fork of two floored consts"],
    ['{["min-h-tap-min", "px-2"].join(" ")}', "an array .join()"],
  ])("%s resolves rather than demoting (%s)", (expr) => {
    const b = scanFixture(
      [
        'const A = "min-h-tap-min";',
        'const B = "min-h-tap-min";',
        "export function C() {",
        `  return <button className=${expr}>x</button>;`,
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("chained concise arrows resolve to the third level", () => {
    // Each hand-off costs a level, so a 3-deep chain lands the literal exactly
    // at the budget. Two levels cannot see a doubled increment; three can.
    const b = scanFixture(
      [
        'const a = () => "min-h-tap-min";',
        "const b = () => a();",
        "const c = () => b();",
        "export function C() {",
        "  return <button className={c()}>x</button>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("an EMPTY className expression is unresolved, not an empty resolution", () => {
    // `className={}` reaches the else arm that assigns UNRESOLVED. Delete that
    // assignment and the element keeps EMPTY_RESOLUTION, whose floor verdict is
    // ALSO false — so only `.unresolved` can see the difference, and the tap
    // guard's census reason ("unresolvable-dynamic") depends on it.
    const b = scanFixture(
      ["export function C() {", "  return <button className={}>x</button>;", "}"].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
  });

  it("an empty expression in a NON-className attribute does not crash the walk", () => {
    // `role={}` is read by the in-scope predicate. Nothing pinned that the
    // predicate checks for a present expression before touching it.
    expect(
      scanFixture(["export function C() {", "  return <div role={}>x</div>;", "}"].join("\n")),
    ).toEqual([]);
  });

  it("role in a braced string literal is in scope without an onClick", () => {
    const els = scanFixture(
      [
        "export function C() {",
        '  return <div role={"button"} className="min-h-tap-min">x</div>;',
        "}",
      ].join("\n"),
    );
    expect(els.some((e) => e.tag === "div")).toBe(true);
  });

  it("hasClassName reports the attribute's presence, not its content", () => {
    // Written by the scanner, read by no predicate in this module — the census
    // consumes it. Only a direct assertion on scanned output can pin it.
    const els = scanFixture(
      [
        "export function C() {",
        "  return (",
        "    <>",
        '      <button className="min-h-tap-min">a</button>',
        "      <button onClick={() => {}}>b</button>",
        "    </>",
        "  );",
        "}",
      ].join("\n"),
    );
    expect(els.map((e) => e.hasClassName)).toEqual([true, false]);
  });

  // ---- the spread reader, arm by arm ----
  //
  // `spreadCannotCarryClassName` is the one place the scanner CLEARS something
  // it could have feared, so every arm of it is a positive claim. Each case
  // below is a distinct operator or wrapper, because a fixture using `||`
  // cannot see a defect in the `??` arm and vice versa.
  it.each([
    ['({ target: "_blank" } as object)', "an as-wrapped object literal"],
    ['(f && { target: "_blank" })', "a `&&` guard"],
    ['({ target: "_blank" } || { rel: "noopener" })', "a `||` of two literals"],
    ['({ target: "_blank" } ?? { rel: "noopener" })', "a `??` of two literals"],
  ])("a spread of %s is read, not feared (%s)", (spread) => {
    const b = scanFixture(
      [
        "export function C({ f }: { f: boolean }) {",
        `  return <button {...${spread}} className="min-h-tap-min">x</button>;`,
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it.each([
    ['(f ? { target: "_blank" } : rest)', "one safe arm and one unreadable arm"],
    ['(rest ?? { target: "_blank" })', "an unreadable left with a safe right"],
  ])("a spread of %s still demotes (%s)", (spread) => {
    // The mirror of the cases above: EVERY reachable value has to be provably
    // className-free, so a conjunction weakened to a disjunction would clear
    // these — which is a false clear, the only silent direction this scan has.
    const b = scanFixture(
      [
        "export function C({ f, rest }: { f: boolean; rest: object }) {",
        `  return <button {...${spread}} className="min-h-tap-min">x</button>;`,
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  // ---- the cross-module resolver ----
  //
  // Everything here needs more than one file, which is why none of it was
  // covered: the single-file harness could not express an import at all.
  const chainFiles = (leaf: string, links: number): Record<string, string> => {
    const files: Record<string, string> = {
      "components/Fx.tsx": [
        'import { K } from "./a";',
        "export function C() {",
        "  return <button className={K}>x</button>;",
        "}",
      ].join("\n"),
    };
    const names = ["a", "b", "c", "d"].slice(0, links);
    names.forEach((name, i) => {
      const next = names[i + 1];
      files[`components/${name}.tsx`] = next
        ? `export { K } from "./${next}";`
        : `export const K = ${leaf};`;
    });
    return files;
  };

  it("a re-export chain's DEPTH budget is spent per hop, not per hop-pair", () => {
    // A plain-string leaf cannot see a doubled depth increment — it lands on the
    // budget either way. A leaf that is itself an expression pushes its arms one
    // level further, which is where the difference becomes observable.
    const b = scanFixtureFiles(chainFiles('true ? "min-h-tap-min" : "min-h-tap-min"', 3)).find(
      (e) => e.tag === "button",
    );
    expect(b?.unresolved).toBe(false);
    expect(b?.paths.length).toBe(2);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("resolves the REQUESTED export, not the module's first one", () => {
    const b = scanFixtureFiles({
      ...chainFiles('"unused"', 1),
      "components/a.tsx": [
        'export const OTHER = "min-h-0";',
        'export const K = "min-h-tap-min";',
      ].join("\n"),
    }).find((e) => e.tag === "button");
    expect(b && allStrings(b)).toEqual(["min-h-tap-min"]);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("a module's own IMPORT is not a re-export", () => {
    // Both statements carry a module specifier; only one of them re-exports.
    // Reading an import as a re-export invents an export the module never made.
    const b = scanFixtureFiles({
      ...chainFiles('"unused"', 1),
      "components/a.tsx": ['import { K } from "./b";', "export const label = K;"].join("\n"),
      "components/b.tsx": 'export const K = "min-h-tap-min";',
    }).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  it("follows `export * from` (no export clause at all)", () => {
    const b = scanFixtureFiles({
      ...chainFiles('"unused"', 1),
      "components/a.tsx": 'export * from "./b";',
      "components/b.tsx": 'export const K = "min-h-tap-min";',
    }).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("does NOT follow a named re-export that omits the name being resolved", () => {
    const b = scanFixtureFiles({
      ...chainFiles('"unused"', 1),
      "components/a.tsx": 'export { OTHER } from "./b";',
      "components/b.tsx": ['export const K = "min-h-tap-min";', 'export const OTHER = "";'].join(
        "\n",
      ),
    }).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  it("parses each file ONCE per process, by path", () => {
    // The scan runs three times over ~350 files (once per consuming suite), so
    // the parse cache is why that is affordable rather than an optimisation
    // nobody would miss. Within one process a file's parse is therefore FROZEN
    // at first read — a real contract, because every consumer of this module
    // scans a tree that does not change under it, and the alternative (an
    // mtime check) buys nothing any caller needs.
    const dir = trackScratch(mkdtempSync(join(tmpdir(), "scan-fixture-")));
    mkdirSync(join(dir, "components"), { recursive: true });
    mkdirSync(join(dir, "app"), { recursive: true });
    const file = join(dir, "components", "Fx.tsx");
    const at = (cls: string) =>
      `export function C() {\n  return <button className="${cls}">x</button>;\n}`;
    writeFileSync(file, at("min-h-tap-min"));
    expect(allStrings(scanInteractiveElements(dir)[0]!)).toEqual(["min-h-tap-min"]);
    writeFileSync(file, at("min-h-0"));
    expect(allStrings(scanInteractiveElements(dir)[0]!)).toEqual(["min-h-tap-min"]);
  });

  it("a `case` clause is a scope for const lookup", () => {
    const b = scanFixture(
      [
        "export function C({ k }: { k: number }) {",
        "  switch (k) {",
        // NO braces: a braced case body is an ordinary Block, which
        // `statementsOf` already handles, so the case-clause arm stays dark.
        // The binding has to sit in the clause ITSELF to exercise it.
        "    case 1:",
        '      const cls = "min-h-tap-min";',
        "      return <button className={cls}>x</button>;",
        "  }",
        "  return null;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  // ---- the return-union walker (rule 6) ----
  it.each([
    ['const m = (x: string) => { return "min-h-0"; };', "a nested arrow"],
    ['function inner() { return "min-h-0"; }', "a nested function declaration"],
  ])("returns of %s belong to it, not to the helper (%s)", (nested) => {
    const b = scanFixture(
      [
        "export function C() {",
        "  function seg() {",
        `    ${nested}`,
        '    return "min-h-tap-min";',
        "  }",
        "  return <button className={seg()}>x</button>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b && allStrings(b)).toEqual(["min-h-tap-min"]);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("only RETURN statements contribute to a helper's union", () => {
    const b = scanFixture(
      [
        "export function C() {",
        "  function seg() {",
        '    console.log("x");',
        '    return "min-h-tap-min";',
        "  }",
        "  return <button className={seg()}>x</button>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b?.paths.length).toBe(1);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("every return of a helper is an alternative, and the FIRST one is not dropped", () => {
    // `reduce` with no seed never calls back with index 0, so an index test can
    // be wrong in two directions and still union something plausible. Only a
    // helper whose FIRST return is the floorless one shows the difference.
    const b = scanFixture(
      [
        "export function C({ f }: { f: boolean }) {",
        "  function seg() {",
        '    if (f) return "px-2";',
        '    return "min-h-tap-min";',
        "  }",
        "  return <button className={seg()}>x</button>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.paths.length).toBe(2);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  // ---- soundness of what the resolver CLAIMS to have read (R1 F4) ----
  it("a reassignable binding is not read from its initializer", () => {
    // `let cls = floor; if (f) cls = under-floor;` renders the second value on a
    // real path. Tracking assignments is a dataflow problem the scan does not
    // do, so the binding is declined and the site becomes a census row.
    const b = scanFixture(
      [
        "export function C({ f }: { f: boolean }) {",
        '  let cls = "min-h-tap-min";',
        '  if (f) cls = "min-h-0";',
        "  return <button className={cls}>x</button>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  it("a declined local binding does not fall through to an import of the same name", () => {
    // The failure this guards is subtle: treating "found but unreadable" as
    // "not found" sends the lookup to the import table, where an unrelated
    // module's export of that name resolves — and clears.
    const b = scanFixtureFiles({
      "components/Fx.tsx": [
        'import { cls } from "./a";',
        "export function C({ f }: { f: boolean }) {",
        "  // eslint-disable-next-line prefer-const",
        '  let cls = "min-h-0";',
        '  if (f) cls = "min-h-0";',
        "  return <button className={cls}>x</button>;",
        "}",
      ].join("\n"),
      "components/a.tsx": 'export const cls = "min-h-tap-min";',
    }).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  it.each([
    ["    if (f) return;", "a bare return"],
    ["    // no other return", "falling off the end"],
  ])("a helper path that returns NO class is an alternative (%s)", (extra) => {
    const b = scanFixture(
      [
        "export function C({ f }: { f: boolean }) {",
        "  function seg() {",
        extra,
        '    if (f) return "min-h-tap-min";',
        "  }",
        "  return <button className={seg()}>x</button>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  it("a helper whose LAST statement returns a floor still clears", () => {
    // The mirror of the two cases above: the conservative rule must not swallow
    // the ordinary shape, or every helper call lands in the census.
    const b = scanFixture(
      [
        "export function C() {",
        "  function seg() {",
        '    return "min-h-tap-min";',
        "  }",
        "  return <button className={seg()}>x</button>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });

  it("the floor-component allowlist is an IMPORT identity, not a name", () => {
    const local = scanFixture(
      [
        "function AccentButton({ children }: { children?: unknown }) {",
        '  return <button className="min-h-0">{children as never}</button>;',
        "}",
        "export function C() {",
        "  return <AccentButton>x</AccentButton>;",
        "}",
      ].join("\n"),
    ).find((e) => e.tag === "AccentButton");
    expect(local?.allowlisted).toBe(false);
    expect(local && heightFloorSatisfied(local)).toBe(false);
  });

  it("an IMPORTED AccentButton from the wrong module is not the allowlisted one", () => {
    // The local-definition case above never reaches the path comparison — there
    // is no import to resolve. This one imports a real module that resolves,
    // and only the resolved PATH separates it from the canonical component.
    const b = scanFixtureFiles({
      "components/Fx.tsx": [
        'import { AccentButton } from "./Other";',
        "export function C() {",
        "  return <AccentButton>x</AccentButton>;",
        "}",
      ].join("\n"),
      "components/Other.tsx": [
        "export function AccentButton({ children }: { children?: unknown }) {",
        '  return <button className="min-h-0">{children as never}</button>;',
        "}",
      ].join("\n"),
    }).find((e) => e.tag === "AccentButton");
    expect(b?.allowlisted).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });

  it("nested conditional keeps ancestry: inner both-branch floor under a floorless outer arm never clears", () => {
    const els = scanFixture(
      [
        "export function C({ a, b }: { a: boolean; b: boolean }) {",
        '  return <button className={a ? (b ? "min-h-tap-min" : "min-h-tap-min") : ""}>x</button>;',
        "}",
      ].join("\n"),
    );
    const btn = els.find((e) => e.tag === "button");
    expect(btn && heightFloorSatisfied(btn)).toBe(false); // the a-false path has no floor
  });
});

describe("height floor (spec §5.1/§5.2 rules 1-4, 7) and defeaters (rule 8)", () => {
  it.each([
    ["min-h-tap-min", true],
    ["size-tap-min", true],
    ["h-11", true],
    ["min-h-[44px]", true],
    ["h-10", false],
    ["min-w-tap-min", false],
    ["w-11", false],
  ])("single-path floor token %s -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });
  it("floor on every path clears; floor on one of two paths never clears (rules 3-4)", () => {
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min a"], ["min-h-tap-min b"]] }))).toBe(
      true,
    );
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min"], ["px-2"]] }))).toBe(false);
  });
  it("unresolved never clears (rule 2)", () => {
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min"]], unresolved: true }))).toBe(false);
  });
  it("rule 7: allowlisted component clears with no className, but a call-site defeater demotes", () => {
    expect(
      heightFloorSatisfied(
        el({ tag: "AccentButton", allowlisted: true, paths: [[]], hasClassName: false }),
      ),
    ).toBe(true);
    expect(
      heightFloorSatisfied(el({ tag: "AccentButton", allowlisted: true, paths: [["min-h-0!"]] })),
    ).toBe(false);
    expect(
      heightFloorSatisfied(
        el({ tag: "AccentButton", allowlisted: true, paths: [[]], unresolved: true }),
      ),
    ).toBe(false);
    // The TAG alone grants nothing: `allowlisted` is resolved from the import.
    expect(
      heightFloorSatisfied(el({ tag: "AccentButton", paths: [[]], hasClassName: false })),
    ).toBe(false);
  });
  it.each(["min-h-0!", "max-h-10!", "[height:0]!", "[min-height:0]", "sm:min-h-0", "hover:h-4"])(
    "defeater %s demotes even from a minority path",
    (tok) => {
      expect(defeaterPresent(el({ paths: [["min-h-tap-min"], [tok]] }))).toBe(true);
    },
  );
  it("a clean floor string carries no defeater", () => {
    expect(defeaterPresent(el({ paths: [["inline-flex min-h-tap-min px-4"]] }))).toBe(false);
  });

  // A named spacing token is the general case of which `min-h-tap-min` is one
  // instance: the value lives in `app/globals.css`'s `@theme`, so the floor is
  // read from the token surface rather than from a hand-kept list that goes
  // stale the day a token is added.
  it.each([
    ["min-h-confirm-box", true], // --spacing-confirm-box: 60px
    ["min-h-tile-min-h", true], // --spacing-tile-min-h: 96px
    ["min-h-header-link-slot", false], // --spacing-header-link-slot: 30px, under the floor
  ])("named spacing token %s floors -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });
  it("a sub-floor named spacing token is a defeater", () => {
    expect(defeaterPresent(el({ paths: [["min-h-tap-min h-header-link-slot"]] }))).toBe(true);
  });

  // Descendant-scoped and pseudo-element tokens style something OTHER than the
  // element's own box, so they can neither prove nor destroy its height.
  it.each(["[&_svg]:size-4", "[&>svg]:h-3", "before:h-4", "after:min-h-0"])(
    "%s is not an element-level defeater",
    (tok) => {
      expect(defeaterPresent(el({ paths: [[`min-h-tap-min ${tok}`]] }))).toBe(false);
      expect(heightFloorSatisfied(el({ paths: [[`min-h-tap-min ${tok}`]] }))).toBe(true);
    },
  );
  it.each(["[&_svg]:min-h-tap-min", "before:h-tap-min"])(
    "%s alone does not prove the element's own floor",
    (tok) => {
      expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(false);
    },
  );
  // Everything below this comment was written against SURVIVING MUTANTS from the
  // 2026-08-15 source-mutation run: each case names a mutation of
  // `interactiveScanCore.ts` that the suite above could not see. They are boundary
  // and unit-conversion cases, which is exactly the class a hand-written suite
  // misses — the earlier cases all sat comfortably inside their ranges.
  it.each([
    // The rem conversion itself: 2.75rem IS the floor at 16px/rem. Kills the two
    // capture-index mutants (`rem[1]` -> `rem[2]`, which yields NaN) and the
    // 16 -> 17 rate mutant is killed by the pair below.
    ["min-h-[2.75rem]", true],
    // 2.6rem = 41.6px at the real rate and 44.2px at 17px/rem: the ONLY fixture
    // shape that can see the conversion RATE rather than its presence.
    ["min-h-[2.6rem]", false],
  ])("arbitrary rem length %s floors -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });

  it("an over-floor arbitrary height PROPERTY is not a defeater", () => {
    // `px !== null && px < FLOOR_PX` — with the conjunction weakened to `||`,
    // every readable arbitrary height becomes a defeater, including one that
    // clears the floor by more than double.
    expect(defeaterPresent(el({ paths: [["[min-height:100px]"]] }))).toBe(false);
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min [min-height:100px]"]] }))).toBe(true);
  });

  it("an arbitrary height property AT the floor is not a defeater (44 is not under 44)", () => {
    expect(defeaterPresent(el({ paths: [["[min-height:44px]"]] }))).toBe(false);
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min [min-height:44px]"]] }))).toBe(true);
  });

  it("the negative-margin + padding recipe floors, and p-3 is its exact boundary", () => {
    // The recipe had no fixture at all, so four mutations of it survived: the
    // capture index, the NaN it produces, the `>=` boundary and the 3 itself.
    expect(heightFloorSatisfied(el({ paths: [["-my-2 p-3"]] }))).toBe(true);
    expect(heightFloorSatisfied(el({ paths: [["-my-2 p-2"]] }))).toBe(false);
    // Both halves are required — neither alone is the recipe.
    expect(heightFloorSatisfied(el({ paths: [["p-3"]] }))).toBe(false);
    expect(heightFloorSatisfied(el({ paths: [["-my-2"]] }))).toBe(false);
  });

  // The variant-prefix scanner walks bracket depth by hand, and nothing here
  // used a token whose brackets CONTAIN a colon or whose prefix list is longer
  // than one — so every off-by-one in that walk survived.
  it("a bracketed variant whose argument contains a colon still finds the real separator", () => {
    expect(defeaterPresent(el({ paths: [["supports-[display:grid]:min-h-0"]] }))).toBe(true);
    // The separator has to be found in the floor direction too, and a variant
    // token never floors (see the unconditional-height table), so the readable
    // consequence is that the utility is not mistaken for something else: with
    // the bracket walk off by one, `baseToken` returns the WHOLE token and the
    // defeater above disappears.
    expect(defeaterPresent(el({ paths: [["supports-[display:grid]:h-4"]] }))).toBe(true);
  });

  it("a token with TWO variant prefixes classifies on the last one", () => {
    // With one prefix, the slice start never moves, so every single-variant
    // token reads the same however the walk advances. These two need the
    // SECOND prefix read exactly: `before` (pseudo) and `[&_svg]` (descendant).
    expect(heightFloorSatisfied(el({ paths: [["hover:before:h-tap-min"]] }))).toBe(false);
    expect(defeaterPresent(el({ paths: [["min-h-tap-min md:[&_svg]:size-4"]] }))).toBe(false);
  });

  it("an element with NO render alternative never clears (anti-vacuous-truth)", () => {
    // `paths.length > 0 &&` guards `.every()`, which is vacuously true on an
    // empty array. The scanner never emits an empty path set, so this predicate's
    // own API is the only place the guard can be observed — and without the
    // observation, relaxing it to `>= 0` passes every other test in this file.
    expect(heightFloorSatisfied(el({ paths: [] }))).toBe(false);
  });

  it("a sub-floor pseudo height does not complete the expansion recipe", () => {
    // The recipe needs `before:absolute` AND something that actually EXPANDS.
    // `before:h-4` is readable and 16px: the conjunction in `tokenIsFloor`
    // (`px !== null && px >= FLOOR_PX`) is what rejects it.
    expect(heightFloorSatisfied(el({ paths: [["relative before:absolute before:h-4"]] }))).toBe(
      false,
    );
  });

  // ---- the unconditional-height claim (whole-diff review R1, findings 2 and 3) ----
  //
  // The guard's claim is that the element is AT LEAST 44px on EVERY render. Each
  // shape below was cleared by the first shipped grammar and none of them
  // establishes that, which is the only silent direction this scan has.
  it.each([
    // A maximum is not a minimum. `max-h-96` says the box stops at 384px; it
    // says nothing about how short it may be.
    "max-h-96",
    // A floor that only applies in a STATE is not a floor at rest.
    "hover:min-h-tap-min",
    "sm:min-h-tap-min",
    "focus-visible:h-11",
    // A pseudo bleed that only expands HORIZONTALLY cannot prove a height, and
    // this is the shape two live sites actually wear.
    "relative before:absolute before:-inset-x-2",
    // A vertical bleed too small to reach the floor over an unknown-height row.
    "relative before:absolute before:-inset-y-1",
    // Vertical padding that a later utility overrides back down.
    "-my-1 p-3 py-1 text-xs",
  ])("%s does NOT prove the floor", (tok) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(false);
  });

  it.each([
    // The shipped switch recipe: 28 + 2*8 = 44 in the browser, and it still
    // does NOT clear, because `h-7` is a rule-8 defeater and rule 8 is
    // deliberately unconditional. The three switches carry it as a census row
    // whose reason says exactly that (tapTargetCensus.ts, `padding-arithmetic`).
    // Pinned here so the precedence is a decision on the record rather than an
    // accident of evaluation order.
    ["relative h-7 before:absolute before:-inset-y-2", false],
    // Same bleed, no declared height: 20 (assumed single-line row) + 16 = 36.
    ["relative before:absolute before:-inset-y-2", false],
    // A bleed that reaches the floor over the same assumed row: 20 + 2*12 = 44.
    ["relative before:absolute before:-inset-y-3", true],
    ["relative before:absolute before:-inset-3", true],
  ])("%s -> %s (element height + proven vertical bleed)", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });

  it("a self-targeted arbitrary variant is the element's own box, not a descendant's", () => {
    // `[&_svg]` and `[&>svg]` reach a CHILD; `[&:hover]` and `[&.is-open]` are
    // the element itself, so their heights are its heights.
    expect(defeaterPresent(el({ paths: [["min-h-tap-min [&:hover]:h-4"]] }))).toBe(true);
    expect(defeaterPresent(el({ paths: [["min-h-tap-min [&_svg]:h-4"]] }))).toBe(false);
  });

  it("named spacing tokens come from @theme, not from anywhere in the stylesheet", () => {
    // The map is read by regex out of `app/globals.css`. Scoped to the `@theme`
    // block and with comments stripped, a token that Tailwind does not emit
    // cannot make a class clear. `--spacing-header-link-slot` is a real token
    // and stays readable; a name that appears only in prose must not.
    expect(heightFloorSatisfied(el({ paths: [["min-h-tile-min-h"]] }))).toBe(true);
    expect(heightFloorSatisfied(el({ paths: [["min-h-not-a-real-token"]] }))).toBe(false);
  });

  // ---- recipe arithmetic, term by term (2026-08-15 mutation round 2) ----
  //
  // Both recipes add to `ASSUMED_TEXT_ROW_PX` (20) and compare against 44, so
  // every case below is chosen to straddle that boundary: a fixture landing on
  // the same side under both the original and the mutation proves nothing.
  it.each([
    // A conditional padding utility must not feed the recipe: `hover:p-3` is
    // 24px of padding in a state, and 20 + 24 = 44 would clear on it.
    ["-my-2 hover:p-3", false],
    // The 4px scale itself: p-2.5 is 10px a side, 20 + 20 = 40.
    ["-my-2 p-2.5", false],
    // The axis map: `p-3` sets BOTH sides (20 + 24 = 44); a lone `pt-3` leaves
    // the bottom at zero and the recipe reads the smaller side.
    ["-my-2 p-3", true],
    ["-my-2 pt-3", false],
    ["-my-2 pt-3 pb-3", true],
    // `py-3` is the only shape that reaches the axis map's `y` arm: `p-3` short-
    // circuits on the empty-axis test before it.
    ["-my-2 py-3", true],
  ])("negative-margin recipe: %s -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });

  it.each([
    // Horizontal bleed proves no height, at any magnitude.
    ["relative before:absolute before:-inset-x-3", false],
    // The 4px scale on the bleed: 2.5 steps is 10px a side, 20 + 20 = 40.
    ["relative before:absolute before:-inset-y-2.5", false],
    // A pseudo floor token behind a SECOND variant is conditional again. The
    // token has to lead with `before:` — that is the filter the recipe applies
    // before it consults the token at all.
    ["relative before:absolute before:hover:h-tap-min", false],
    // The assumed row height itself. Whole 4px steps cannot see it (20+8N and
    // 21+8N first reach 44 at the same N), so the only fixture that can is one
    // whose bleed lands the sum exactly ON 43: 20 + 2*11.5 = 43, 21 + 23 = 44.
    ["relative before:absolute before:-inset-y-2.875", false],
  ])("pseudo recipe: %s -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });

  it("the pseudo-element expansion recipes DO floor (spec §5.1)", () => {
    // Explicit-height form: a 44px absolutely-positioned pseudo IS the hit area.
    expect(
      heightFloorSatisfied(el({ paths: [["relative before:absolute before:h-tap-min"]] })),
    ).toBe(true);
    // Negative-inset form, at a magnitude that reaches the floor over the
    // assumed single-line row (20 + 2*12). The smaller bleeds are in the table
    // above, where they correctly do NOT clear on their own.
    expect(
      heightFloorSatisfied(el({ paths: [["relative before:absolute before:-inset-y-3"]] })),
    ).toBe(true);
    // A non-expanding pseudo is not a recipe.
    expect(heightFloorSatisfied(el({ paths: [["relative before:absolute before:inset-0"]] }))).toBe(
      false,
    );
  });
});

describe("@theme block extraction (whole-diff R1 F6)", () => {
  // Reached in production only through `spacingTokens()`, which reads the real
  // `app/globals.css` — so the brace scanner's own cases are unreachable from
  // the public predicates, and eight of its mutants survived on that. It is
  // exported for exactly these.
  it("returns EXACTLY the @theme block, nested braces and all", () => {
    // Asserted as an exact string rather than by `toContain`. A brace walk that
    // is off by one, or that stops at the wrong `}`, still contains the tokens
    // a containment check looks for — five mutants survived a containment
    // version of this case by breaking at the nested block's closing brace.
    // The expectation is DERIVED from the input, so it cannot drift.
    const css = [
      ":root { --spacing-outside: 99px; }",
      "@theme { --spacing-inside: 48px;",
      "  @media (min-width: 40rem) { --spacing-nested: 60px; }",
      "}",
      ".after { --spacing-trailing: 12px; }",
    ].join("\n");
    const open = css.indexOf("{", css.indexOf("@theme"));
    const close = css.indexOf("}", css.indexOf("--spacing-nested")) + 2;
    expect(themeBlocks(css)).toBe(css.slice(open, close));
    // and the derivation above really did exclude both neighbours:
    expect(themeBlocks(css)).not.toContain("--spacing-outside");
    expect(themeBlocks(css)).not.toContain("--spacing-trailing");
    expect(themeBlocks(css)).toContain("--spacing-nested");
  });

  it("finds a closing brace at an ODD offset from the opening one", () => {
    // A walk that steps by two visits only even offsets from `{`, so it sails
    // past the matching `}` whenever the block's content has even length — and
    // reads the rest of the stylesheet as theme. Every other case here happens
    // to have even spacing, which is exactly how that mutant survived.
    const css = "@theme {--x:1px;}\n:root{--y:2px;}";
    expect(themeBlocks(css)).toBe("{--x:1px;");
  });

  it("ignores a commented-out @theme, and finds a second real one", () => {
    const css = [
      "/* @theme { --spacing-ghost: 48px; } */",
      "@theme { --spacing-first: 48px; }",
      "@theme { --spacing-second: 52px; }",
    ].join("\n");
    const blocks = themeBlocks(css);
    expect(blocks).not.toContain("--spacing-ghost");
    expect(blocks).toContain("--spacing-first");
    expect(blocks).toContain("--spacing-second");
  });

  it("an unterminated @theme yields the rest of the file, not an empty string", () => {
    // The scanner walks to the matching `}`; with none, `end` runs off the end.
    // Returning nothing there would silently drop every token in a malformed
    // stylesheet, which is a false CLEAR the moment a floor token lives in one.
    expect(themeBlocks("@theme { --spacing-open: 48px;")).toContain("--spacing-open");
  });

  it("a file with no @theme yields nothing", () => {
    expect(themeBlocks(":root { --spacing-x: 48px; }")).toBe("");
  });

  it("a bare `@theme` with no block at all yields nothing", () => {
    // The `indexOf` guard: without it the scan starts at -1 and slices from
    // before the string, and with a real block ahead of it the search re-finds
    // the same `@theme` forever.
    expect(themeBlocks("@theme")).toBe("");
    expect(themeBlocks("@theme { --spacing-real: 48px; }\n@theme")).toContain("--spacing-real");
  });
});

describe("floor-component allowlist companion (spec §5.2 rule 7)", () => {
  it.each(FLOOR_COMPONENT_ALLOWLIST)("$tag base class declaration carries the floor", (row) => {
    // Scoped to the BASE_CLASS declaration, NOT the whole file: a comment elsewhere in the
    // file also contains the token, so a whole-file `toContain` is a false-green mutant
    // (plan R1 F6, probed: AccentButton.tsx line 86 comment vs line 106 live token).
    const src = readFileSync(row.file, "utf8");
    const decl = src.match(/const BASE_CLASS = cn\(([\s\S]*?)\);/);
    expect(decl, `${row.file}: BASE_CLASS declaration not found`).not.toBeNull();
    expect((decl as RegExpMatchArray)[1]).toContain(row.mustContain);
  });
});
