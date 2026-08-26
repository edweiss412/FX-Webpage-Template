// @vitest-environment node
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
import { Node, Project, ScriptTarget, SyntaxKind } from "ts-morph";
import {
  ACCEPTED_FORMS,
  attributeCanRender,
  classifyExpression,
  infraPredicateNames,
  scanCandidates,
  scanRoots,
  scannedFiles,
} from "./_renderFaultScan";
import { stripCommentsForFile } from "../_shared/stripComments";

// One scan for the file: the walk is over every .ts/.tsx under the derived
// roots and is the expensive part.
const CANDIDATES = scanCandidates();
const ACCEPTED = CANDIDATES.filter((c) => c.form !== "unknown");
const RESIDUE = CANDIDATES.filter((c) => c.form === "unknown");

/**
 * Fault branches whose guard matches NONE of the six accepted forms.
 *
 * Reported by name rather than silently dropped, which is the accept-set
 * discipline's own test: a recognizer that enumerates known forms is a
 * denylist, and the honest response to an unrecognized form is to name it.
 * Layer 0 and layer 2 are what actually cover these; layer 1 does not pretend
 * to. A new unknown form fails this test rather than passing unnoticed --
 * WHEN the guard is an if-statement, a switch case or a catch. On a ternary it
 * does not: that arm has no residue fallback, so an unclassifiable guard is
 * dropped in silence. The qualifier is here rather than omitted because the
 * unqualified sentence is what made two Dashboard entries look flag-shaped when
 * they are not. See BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY.
 */
const REPORTED_RESIDUE: Record<string, string> = {
  "app/admin/layout.tsx:83":
    "instanceof on an error class, not a kind comparison. The admin shell's failure screen — layer 0 catches it, because the capture selector disappears with the shell.",
  "app/admin/wizard/preview/[stagedId]/page.tsx:126":
    "a kind comparison against decode_error, not infra_error. Renders the same marked FailureSurface, so the DOM carries the marker even though the guard is outside the accept-set.",
  "components/admin/UseRawControl.tsx:433":
    "a string-state comparison against legacy-unavailable. Not reachable from any manifest entry.",
  "components/admin/wizard/step3ReviewSections.tsx:3755":
    "a bare boolean named `failed`, one hop from no resolvable infra source.",
  "components/tiles/OpeningReelVideo.tsx:33":
    "a media-element error flag, not a data-loading fault. Different fault domain from the one this instrument measures.",
};

/**
 * Shape-4 residue: the branch ASSIGNS a flag and a later return renders it.
 *
 * Invisible to the scanner, but for TWO different reasons, and the distinction
 * is load-bearing because only one of them is "by construction".
 *
 * Genuinely flag-shaped (the three telemetry/layout entries): the guard site
 * returns no JSX at all, so it is not a candidate under any arm, and tracing
 * the flag to the JSX that consumes it is dataflow this arc does not carry.
 *
 * Dropped by a scanner ASYMMETRY (the two Dashboard entries): those guards sit
 * on a ternary whose `whenTrue` IS the JSX, so they are exactly the shape the
 * scanner claims to reach. `scanCandidates` gives its `IfStatement` arm a
 * vocabulary fallback that reports an unclassifiable guard as `unknown`
 * residue, and gives its `ConditionalExpression` arm no fallback at all
 * (`_renderFaultScan.ts:754`). Probed on the live tree: 719 ternaries under the
 * derived roots return JSX, 79 of them on a fault-vocabulary guard, and the
 * unclassifiable ones are dropped in silence rather than reported. Tracked as
 * BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY. Tracing a flag to the JSX that consumes it is dataflow
 * analysis this arc does not carry (spec §4.2), so the registry is the honest
 * substitute: each flag named, with the capture output it can reach.
 *
 * Two entries are marked BY HAND. The scanner cannot enforce them and never
 * will under this design, but the flag was right there at authoring time and
 * the strip would otherwise encode "Unavailable" with nothing refusing.
 */
const FLAG_RESIDUE: Record<string, string> = {
  "components/admin/Dashboard.tsx:ignoredDegraded":
    "reaches dashboard-overview: adds a notice and removes warning badges. NOT flag-shaped, despite living in this registry — Dashboard.tsx:858 is a ternary whose whenTrue is the JSX. It is dropped by the ConditionalExpression arm's missing residue fallback, not by shape.",
  "components/admin/Dashboard.tsx:dataGapsDegraded":
    "reaches dashboard-overview: a shows_internal read failure removes data-quality badges. Dashboard.tsx:674, same ternary shape and the same asymmetry, not the flag shape this registry is named for.",
  "components/admin/telemetry/TelemetryOverviewStrip.tsx:SystemHealthCard.unavailable":
    "reaches no manifest capture today (/admin/dev/telemetry is unrouted), but renders Unavailable / Health check failed. MARKED BY HAND via the renderFault prop.",
  "components/admin/telemetry/TelemetryOverviewStrip.tsx:EventsCard.isInfra":
    "same surface, renders Unavailable. MARKED BY HAND via the renderFault prop.",
  "components/admin/IgnoredSheetsDisclosure.tsx:degraded":
    'reaches dashboard-overview and IS captured: Dashboard derives `degraded` from `ignoredResult.kind === "infra_error"` (Dashboard.tsx:489) and passes it here, where a `degraded ?` ternary renders a visible Couldn\'t-load chip on /admin. MARKED BY HAND via data-render-fault. Not scanner-reachable because the guard is a bare prop, so classifyExpression returns null and the ConditionalExpression arm drops it. Found by whole-diff review r1, which is the point worth recording: the residue registry named the ASSIGNMENT site in Dashboard and missed that the RENDER lives in another component.',
  "components/admin/OnboardingWizard.tsx:OperatorErrorBlock":
    "reaches dashboard-overview and IS captured: OnboardingWizard.tsx:818 renders it from the FALSE arm of `service.ok ? healthy : <OperatorErrorBlock />`, and it paints a Setup-is-paused section on /admin. MARKED BY HAND at the component, which renders the fault unconditionally, so the marker always reaches the DOM and the capture refuses. Not scanner-reachable for a DIFFERENT reason from the others: the ternary arm inspects only `whenTrue`, so a fault in the false arm is invisible to it whatever its guard looks like. Found by whole-diff review r4b; the blind spot is declared here rather than widened into the recognizer.",
  "app/admin/layout.tsx:inOnboarding":
    "assigns a routing flag and returns no JSX from that branch; fails open by design.",
};

// ---- Ternary-arm decline, pinned (BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY) ----
//
// The ConditionalExpression arm keeps its bare `continue`. Everything below
// exists so that decision stays TRUE rather than merely written down: the
// numbers the arm's comment declares are re-derived and compared, the trigger
// that would re-open the decline is computed, and the sites the decline is
// about are pinned individually.
const FAULT_VOCABULARY = /error|fail|infra|degrad|unavailable|corrupt/i;

/** The four ternary sites the residue registry declares. */
const REGISTERED_TERNARIES: readonly (readonly [string, number])[] = [
  ["components/admin/Dashboard.tsx", 674],
  ["components/admin/Dashboard.tsx", 858],
  ["components/admin/IgnoredSheetsDisclosure.tsx", 79],
  ["components/admin/OnboardingWizard.tsx", 803],
];

function containsJsx(node: Node | undefined): boolean {
  if (node === undefined) return false;
  if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node) || Node.isJsxFragment(node)) {
    return true;
  }
  return Boolean(
    node.getFirstDescendant(
      (d) => Node.isJsxElement(d) || Node.isJsxSelfClosingElement(d) || Node.isJsxFragment(d),
    ),
  );
}

const TERNARY_PROJECT = new Project({
  compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
  skipAddingFilesFromTsConfig: true,
});
TERNARY_PROJECT.addSourceFilesAtPaths(scannedFiles());

const CANDIDATE_KEYS = new Set(CANDIDATES.map((c) => `${c.file}:${c.line}`));

type TernaryRow = { file: string; line: number; client: boolean; registered: boolean };

const TERNARY_SURVEY: { jsxTernaries: number; unclassifiedVocab: TernaryRow[] } = (() => {
  let jsxTernaries = 0;
  const unclassifiedVocab: TernaryRow[] = [];
  for (const path of scannedFiles()) {
    const source = TERNARY_PROJECT.getSourceFileOrThrow(path);
    const file = relative(process.cwd(), path);
    const raw = readFileSync(path, "utf8");
    const client = /^["']use client["'][ \t]*(?:;|$|\r?\n)/.test(
      stripCommentsForFile(raw, path).trimStart(),
    );
    for (const conditional of source.getDescendantsOfKind(SyntaxKind.ConditionalExpression)) {
      if (!containsJsx(conditional.getWhenTrue())) continue;
      jsxTernaries++;
      const line = conditional.getStartLineNumber();
      if (CANDIDATE_KEYS.has(`${file}:${line}`)) continue;
      if (!FAULT_VOCABULARY.test(conditional.getCondition().getText())) continue;
      const registered = REGISTERED_TERNARIES.some(([f, l]) => f === file && l === line);
      unclassifiedVocab.push({ file, line, client, registered });
    }
  }
  return { jsxTernaries, unclassifiedVocab };
})();

const UNREGISTERED_SERVER = TERNARY_SURVEY.unclassifiedVocab.filter(
  (row) => !row.client && !row.registered,
);

describe("the ConditionalExpression arm's decline is pinned, not just written down", () => {
  it("the numbers the arm declares equal the numbers the tree computes", () => {
    // NOT "the comment exists". Both figures are re-derived and compared, so a
    // comment edited without a re-probe fails. The previous figures (714 and 91)
    // went stale in eight days, which is the concrete failure this catches.
    const armSource = readFileSync(join(process.cwd(), "tests/help/_renderFaultScan.ts"), "utf8");
    const declared = armSource.match(
      /Probed:\s*(\d+)\s+such ternaries under the derived roots,\s*(\d+)\s+on a/,
    );
    expect(declared, "the arm must declare both figures in a parseable form").not.toBeNull();
    expect(Number(declared![1])).toBe(TERNARY_SURVEY.jsxTernaries);
    expect(Number(declared![2])).toBe(TERNARY_SURVEY.unclassifiedVocab.length);
  });

  it("the re-file trigger has not tripped: at most 7 unregistered server-side sites", () => {
    // The computable set with NO unstated exclusion. An earlier draft set this at
    // 3, which discounted four emptiness checks by a rule the assertion never
    // applied and was tripped the moment it was written.
    //
    // DOCUMENTED LIMIT: a bound on a COUNT does not pin site identity. Swapping a
    // registered site for a new one leaves the count at 7 and passes. That is
    // deliberate -- this asks one question, has the unreached server-side
    // population GROWN, and a count is the right instrument. Site identity is
    // pinned in the residue registry, for the entries that carry a declared cause.
    expect(
      UNREGISTERED_SERVER.length,
      UNREGISTERED_SERVER.map((r) => `${r.file}:${r.line}`).join("\n"),
    ).toBeLessThanOrEqual(7);
  });

  it("the arm still does not reach the sites the decline is about", () => {
    // Asserted POSITIVELY per site. "No unknown candidate originates from a
    // ternary" is green in BOTH directions of the growth it claims to forbid: if
    // classifyExpression learns to recognise one of these guards, the site
    // becomes an ACCEPTED candidate rather than an unknown one, and the weaker
    // assertion never notices.
    for (const [file, line] of REGISTERED_TERNARIES) {
      const source = TERNARY_PROJECT.getSourceFileOrThrow(join(process.cwd(), file));
      const conditional = source
        .getDescendantsOfKind(SyntaxKind.ConditionalExpression)
        .find((c) => c.getStartLineNumber() === line);
      expect(conditional, `${file}:${line} must still be a ternary`).toBeDefined();
      expect(
        classifyExpression(conditional!.getCondition(), infraPredicateNames(source)),
        `${file}:${line} became classifiable — classifyExpression grew, which the decline forbids`,
      ).toBeNull();
      expect(
        CANDIDATE_KEYS.has(`${file}:${line}`),
        `${file}:${line} became a candidate — the arm reached it`,
      ).toBe(false);
    }
  });
});

describe("the scanner's population is pinned against resolver drift", () => {
  it("scanCandidates reports exactly 35 candidates", () => {
    // Pinned HERE rather than in the server-time guard's suite, which needs the
    // same fact but would pay a second full project scan for it (measured: the
    // duplicate scan blew a 30s test timeout). CANDIDATES is already computed
    // once at module scope in this file.
    //
    // What this catches: `resolveSpecifier` gained two directory-index forms so
    // the server-time guard could derive its population correctly, and that
    // resolver is also how this scanner makes its two cross-file hops. Index
    // resolution can only ADD resolutions, so a moved count means the scanner
    // had been silently missing a predicate -- worth failing over either way.
    expect(CANDIDATES.length).toBe(35);
  });
});

describe("the flag-shaped residue is named, since no scan can reach it", () => {
  it("gives every registered flag a reason naming what it reaches", () => {
    expect(Object.keys(FLAG_RESIDUE).length).toBeGreaterThan(0);
    for (const [site, reason] of Object.entries(FLAG_RESIDUE)) {
      expect(reason.length, `${site} needs a reason`).toBeGreaterThan(20);
      expect(site, `${site} must name a file and a flag`).toContain(":");
    }
  });

  it("every entry CLAIMING a hand-marking really carries one", () => {
    // DERIVED from the declarations, not a written-down list. The previous
    // version named "the two hand-marked flags" and read one file, so when a
    // THIRD hand-marked site was added by a review repair the registry kept
    // claiming a marker nothing checked -- deleting that marker would have left
    // the scan at 35 candidates, 30 accepted, five residues, all green.
    //
    // The declaration is now the trigger: say "MARKED BY HAND" in an entry's
    // reason and this case reads that entry's file and demands the attribute.
    // A new hand-marked site is covered the moment it is declared, and a
    // declaration whose marker was removed fails here rather than lying.
    const claimed = Object.entries(FLAG_RESIDUE).filter(([, reason]) =>
      reason.includes("MARKED BY HAND"),
    );
    premise("some flag-residue entry claims a hand-marking", claimed.length, 0);

    for (const [site] of claimed) {
      const file = site.slice(0, site.lastIndexOf(":"));
      const flag = site.slice(site.lastIndexOf(":") + 1);
      // The flag's own identifier, so `SystemHealthCard.unavailable` looks for
      // `unavailable`. Two entries can name the SAME file, which is why a
      // file-scoped check is not enough: TelemetryOverviewStrip declares two
      // and carries four marker occurrences, so deleting one of the two left a
      // surviving mutant under the previous version of this case.
      const identifier = flag.slice(flag.lastIndexOf(".") + 1);
      // Comment lines are dropped BEFORE matching. A commented-out marker is
      // exactly the state this case exists to catch -- someone disabling the
      // attribute while the declaration still claims it -- and a line regex
      // counted it as proof the marker was there.
      const isComment = (line: string): boolean => /^\s*(?:\/\/|\*|\/\*|\{\s*\/\*)/.test(line);
      const lines = readFileSync(join(process.cwd(), file), "utf8")
        .split("\n")
        .map((line) => (isComment(line) ? "" : line));
      // Marker presence is decided STRUCTURALLY, by the scanner's own predicate,
      // reduced to the line numbers these text shapes work in.
      //
      // All three shapes below used to ask a regex, `/(?:data-render-fault|
      // renderFault)\s*=/`. That matches the SPELLING, not the guarantee, so
      // `data-render-fault={undefined}` satisfied every one of them -- React
      // omits an attribute whose value is `undefined`, so the DOM receives no
      // marker at all. Round 6 replaced each of the four hand markers with that
      // form and this assertion still passed, on all four. A guard that accepts
      // the degraded form of the very thing it certifies is not a guard.
      //
      // Round 5's sabotage only ever DELETED markers, which the regex did catch.
      // Degradation is the case it never tried.
      //
      // The predicate is `attributeCanRender`, NOT `attributeAlwaysPresent`. A
      // hand-marked fault site is conditional by design -- `{isInfra ?
      // "telemetry-events" : undefined}` must not mark a healthy render -- so
      // demanding "always" fails correct code, as it did on
      // TelemetryOverviewStrip.tsx:252 when this repair first used it. The
      // probe's actual content is that a marker which can NEVER render passed.
      const markerLines = ((): Set<number> => {
        const project = new Project({
          compilerOptions: { target: ScriptTarget.Latest, jsx: 4 },
          skipAddingFilesFromTsConfig: true,
        });
        const source = project.addSourceFileAtPath(join(process.cwd(), file));
        const found = new Set<number>();
        const elements = [
          ...source.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
          ...source.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
        ];
        for (const element of elements) {
          if (!attributeCanRender(element)) continue;
          for (const attribute of element.getAttributes()) {
            if (!Node.isJsxAttribute(attribute)) continue;
            const attributeName = attribute.getNameNode().getText();
            if (attributeName !== "data-render-fault" && attributeName !== "renderFault") continue;
            found.add(attribute.getStartLineNumber() - 1);
          }
        }
        return found;
      })();
      const named = new RegExp(`\\b${identifier}\\b`);

      // TWO shapes, both real, and the check names them rather than accepting
      // any marker anywhere near the flag. A generous proximity window let a
      // NEIGHBOURING site's marker satisfy this one: TelemetryOverviewStrip
      // declares two residues and carries four other marker occurrences, so
      // deleting one of the two still passed.
      //
      //   A. the marker expression names the flag, on its own line:
      //        renderFault={unavailable ? "telemetry-system-health" : undefined}
      //   B. the flag opens a ternary and the marker sits inside that branch:
      //        {degraded ? (  ...  data-render-fault="dashboard-ignored-sheets"
      const sameLine = lines.some((line, i) => markerLines.has(i) && named.test(line));

      // C. the entry names a COMPONENT and the marker lives in its body:
      //      export function OperatorErrorBlock() { ... data-render-fault=... }
      //    Scanned from the declaration to the next top-level one, so a marker
      //    belonging to a LATER component cannot satisfy this entry.
      const declared = lines.findIndex((line) =>
        new RegExp(`(?:function|const)\\s+${identifier}\\b`).test(line),
      );
      const declaresMarker =
        declared !== -1 &&
        (() => {
          const rest = lines.slice(declared + 1);
          const nextTop = rest.findIndex((line) =>
            /^(?:export\s+)?(?:function|const)\s+\w/.test(line),
          );
          const bodyEnd = nextTop === -1 ? lines.length : declared + 1 + nextTop;
          for (let i = declared + 1; i < bodyEnd; i += 1) if (markerLines.has(i)) return true;
          return false;
        })();
      const GUARD_WINDOW = 15;
      const guardsBranch = lines.some((line, i) => {
        if (!new RegExp(`\\b${identifier}\\s*\\?`).test(line)) return false;
        for (let k = i; k < Math.min(i + GUARD_WINDOW, lines.length); k += 1)
          if (markerLines.has(k)) return true;
        return false;
      });

      expect(
        sameLine || guardsBranch || declaresMarker,
        `${site} declares MARKED BY HAND but no marker in ${file} is tied to \`${identifier}\`: ` +
          `no marker line names it, no \`${identifier} ?\` branch opens one within ${GUARD_WINDOW} lines, ` +
          `and no \`${identifier}\` declaration carries one in its body`,
      ).toBe(true);
    }
  });
});

describe("the population is DERIVED from the manifest, not written down", () => {
  it("scans components plus the manifest's own app segments", () => {
    expect(scanRoots()).toEqual(["app/admin", "components"]);
  });

  it("finds a non-trivial population, so a silently empty scan cannot pass", () => {
    // Every assertion in this file is vacuously true over an empty set. This is
    // the premise they discriminate under, stated executably. It goes through
    // the shared helper so a premise failure reads as one -- "the scan found
    // nothing" is a different fact from "a branch is unmarked", and an
    // ordinary expect() reports them in the same voice.
    premise("the derived scan reaches accepted fault branches", ACCEPTED.length, 20);
    premise(
      "those branches span more than one file",
      new Set(ACCEPTED.map((c) => c.file)).size,
      10,
    );
  });

  /**
   * A form in the accept-set that no live branch exercises is a rule nothing
   * tests. Each such form is DECLARED with why it is unreachable today, so the
   * gap is visible rather than inferred from a passing suite.
   */
  const UNEXERCISED: Record<string, string> = {
    "switch-case":
      "the live switch on a result kind is app/show/[slug]/[shareToken]/page.tsx:220, under app/show. No manifest entry routes there today, so app/show is not a derived root and the branch is outside the scan. It becomes exercised the day a crew-show entry is added — which is the point of deriving roots rather than listing them. Consequence worth naming, since it is an asymmetry a reader will otherwise read as an oversight: components/auth/TerminalFailure.tsx carries no marker, while components/crew/SectionTileError.tsx does. Both live under a derived root, but the marker belongs to a GUARD, and SectionTileError has ten guarded call sites inside the scan while TerminalFailure's only guard is that unreachable switch. Marking the component anyway would assert a fault the scan cannot corroborate. The same crew-show manifest entry re-arms both.",
  };

  it("exercises every accepted guard form, or declares why it cannot", () => {
    const seen = new Set(ACCEPTED.map((c) => c.form));
    for (const form of ACCEPTED_FORMS) {
      if (seen.has(form)) continue;
      expect(
        UNEXERCISED[form],
        `the ${form} form is accepted but no live branch exercises it, and it is not declared unexercised`,
      ).toBeTruthy();
    }
  });

  it("does not declare a form unexercised while a live branch exercises it", () => {
    // The stale-declaration direction: a form that BECOMES reachable must lose
    // its excuse, or the excuse outlives the gap it described.
    const seen = new Set(ACCEPTED.map((c) => c.form));
    for (const form of Object.keys(UNEXERCISED)) {
      expect(seen, `${form} is exercised now; drop its UNEXERCISED entry`).not.toContain(form);
    }
  });
});

describe("every JSX-returning fault branch carries the marker", () => {
  it("leaves none unmarked", () => {
    const unmarked = ACCEPTED.filter((c) => !c.marked).map(
      (c) => `${c.file}:${c.line} (${c.form})`,
    );
    expect(unmarked).toEqual([]);
  });
});

describe("the residue is reported by name, never silently dropped", () => {
  it("pins every unrecognized form with a reason", () => {
    const found = RESIDUE.map((c) => `${c.file}:${c.line}`).sort();
    expect(found).toEqual(Object.keys(REPORTED_RESIDUE).sort());
  });

  it("gives each residue member a non-empty reason", () => {
    for (const [site, reason] of Object.entries(REPORTED_RESIDUE)) {
      expect(reason.length, `${site} needs a reason`).toBeGreaterThan(20);
    }
  });
});
