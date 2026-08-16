# Probe record — timing-scan binding resolution (2026-08-16)

Probes behind `docs/superpowers/specs/ci/2026-08-16-timing-scan-binding-resolution-design.md` (`BL-TIMING-SCAN-NAME-VS-BINDING`, arc branch `fix/timing-scan-scope-resolution`).

All seven are READ-ONLY. Each imports a copy of the scanner as it stands on `origin/fix/scanner-scope-totality` (PR #827, unmerged when these ran):

```
git show origin/fix/scanner-scope-totality:scripts/scan-interaction-timings.ts > probe/scanner-landed.ts
pnpm exec tsx probe/<name>.ts
```

P5 writes a constructed universe under `mkdtempSync(tmpdir())` and scans that root; nothing else touches the filesystem. The scripts lived in `probe/` on the arc branch and are reproduced here in full rather than committed, so this record is the reviewable artifact.

## P1 — what the global name filter suppresses today

### Script — `probe/p1-resolution-census.ts`

```ts
/**
 * PROBE P1 — census of the global-name resolution filter in the LANDED scanner
 * (probe/scanner-landed.ts == origin/fix/scanner-scope-totality version).
 *
 * Read-only. Answers:
 *   A. every unclassified site the global name filter SUPPRESSES today, by kind
 *   B. for each, whether the covered binding of that name is in the SAME file,
 *      imported into it, or neither (a pure cross-file spelling coincidence)
 *   C. covered names that occur in more than one file (collision census)
 *   D. every timer-delay identifier site in the universe, resolved or not
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { scanTimingSites, universeFiles, type TimingSite } from "./scanner-landed";

const ROOT = process.cwd();

type Raw = { site: TimingSite; source: string };

const files = universeFiles(ROOT);
const raw: Raw[] = [];
const sourceByFile = new Map<string, string>();
for (const file of files) {
  let source: string;
  try {
    source = readFileSync(join(ROOT, file), "utf8");
  } catch {
    continue;
  }
  sourceByFile.set(file, source);
  for (const site of scanTimingSites(source, file)) raw.push({ site, source });
}

const named = raw.filter((r) => r.site.kind === "named-constant");
const coveredNames = new Set(named.map((r) => r.site.name as string));

// ---- C. collision census -------------------------------------------------
const filesByName = new Map<string, Set<string>>();
for (const r of named) {
  const n = r.site.name as string;
  if (!filesByName.has(n)) filesByName.set(n, new Set());
  filesByName.get(n)!.add(r.site.file);
}
const collisions = [...filesByName.entries()].filter(([, fs]) => fs.size > 1);

// ---- A/B. suppressed population -----------------------------------------
/** Does `file` declare a binding/import named `name` anywhere at all? */
function declaresOrImports(file: string, name: string): "declares" | "imports" | "no" {
  const source = sourceByFile.get(file);
  if (source === undefined) return "no";
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: "declares" | "imports" | "no" = "no";
  const visit = (node: ts.Node): void => {
    if (found !== "no") return;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) if (el.name.text === name) found = "imports";
      }
      if (clause?.name?.text === name) found = "imports";
      if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name)
        found = "imports";
    }
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = "declares";
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const suppressed = raw
  .map((r) => r.site)
  .filter((s) => s.kind === "unclassified" && s.name !== null && coveredNames.has(s.name));

// ---- D. timer-delay identifier sites -------------------------------------
const timerIdentifierSites: {
  file: string;
  line: number;
  name: string;
  suppressed: boolean;
  where: string;
}[] = [];
for (const [file, source] of sourceByFile) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isTimer =
        (ts.isIdentifier(callee) &&
          (callee.text === "setTimeout" || callee.text === "setInterval")) ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.name) &&
          (callee.name.text === "setTimeout" || callee.name.text === "setInterval"));
      const delay = node.arguments[1];
      if (isTimer && delay !== undefined && ts.isIdentifier(delay)) {
        timerIdentifierSites.push({
          file,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          name: delay.text,
          suppressed: coveredNames.has(delay.text),
          where: declaresOrImports(file, delay.text),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

console.log(`files scanned: ${files.length}`);
console.log(`raw sites: ${raw.length}  named-constants: ${named.length}  covered names: ${coveredNames.size}`);

console.log(`\n== C. covered names declared in MORE THAN ONE file (${collisions.length}) ==`);
for (const [name, fs] of collisions) console.log(`  ${name}: ${[...fs].join(", ")}`);

console.log(`\n== A/B. unclassified sites SUPPRESSED by the global name filter (${suppressed.length}) ==`);
for (const s of suppressed) {
  console.log(
    `  ${s.file}:${s.line} kind=${s.kind} name=${s.name} key=${s.propertyKey ?? "-"} binding-in-file=${declaresOrImports(s.file, s.name as string)}`,
  );
}

console.log(`\n== D. timer delays written as a bare identifier (${timerIdentifierSites.length}) ==`);
for (const t of timerIdentifierSites) {
  console.log(
    `  ${t.file}:${t.line} ${t.name} suppressed=${t.suppressed} name-visible-in-file=${t.where}`,
  );
}
```

### Transcript

```
files scanned: 311
raw sites: 76  named-constants: 24  covered names: 23

== C. covered names declared in MORE THAN ONE file (1) ==
  SUCCESS_DISMISS_MS: app/admin/show/[slug]/PickerResetControl.tsx, app/admin/show/[slug]/ResetPickerEpochButton.tsx

== A/B. unclassified sites SUPPRESSED by the global name filter (35) ==
  app/admin/settings/admins/RevokeRowButton.tsx:168 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  app/admin/settings/admins/RevokeRowButton.tsx:188 kind=unclassified name=WATCHDOG_MS key=- binding-in-file=declares
  app/admin/show/[slug]/PickerResetControl.tsx:124 kind=unclassified name=SUCCESS_DISMISS_MS key=- binding-in-file=declares
  app/admin/show/[slug]/PickerResetControl.tsx:147 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  app/admin/show/[slug]/ResetPickerEpochButton.tsx:121 kind=unclassified name=SUCCESS_DISMISS_MS key=- binding-in-file=declares
  app/admin/show/[slug]/ResetPickerEpochButton.tsx:133 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  app/admin/show/[slug]/RotateShareTokenButton.tsx:166 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  app/admin/show/[slug]/ShareLinkCopyButton.tsx:113 kind=unclassified name=COPY_FEEDBACK_RESET_MS key=- binding-in-file=imports
  app/help/_components/RefAnchor.tsx:101 kind=unclassified name=CLEAR_AFTER_MS key=- binding-in-file=declares
  app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:118 kind=unclassified name=PENDING_TIMEOUT_MS key=- binding-in-file=declares
  components/admin/AdminAnnounceProvider.tsx:51 kind=unclassified name=ANNOUNCE_LOG_TTL_MS key=ttlMs binding-in-file=imports
  components/admin/ArchiveShowButton.tsx:161 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  components/admin/BlockedRowResolver.tsx:207 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  components/admin/BulkIgnoreControls.tsx:92 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  components/admin/HoverHelp.tsx:186 kind=unclassified name=CLOSE_DELAY_MS key=- binding-in-file=declares
  components/admin/PendingPanelDiscardButtons.tsx:154 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  components/admin/StagedReviewCard.tsx:259 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  components/admin/dev/DevCaptureControl.tsx:129 kind=unclassified name=ERROR_AUTO_CLEAR_MS key=- binding-in-file=declares
  components/admin/review/ReviewModalShell.tsx:505 kind=unclassified name=DURATION_NORMAL_FALLBACK_MS key=- binding-in-file=declares
  components/admin/review/ReviewModalShell.tsx:528 kind=unclassified name=DURATION_FAST_FALLBACK_MS key=- binding-in-file=declares
  components/admin/review/ShowReviewSurface.tsx:449 kind=unclassified name=NAV_SCROLL_SETTLE_TIMEOUT_MS key=- binding-in-file=declares
  components/admin/review/ShowReviewSurface.tsx:531 kind=unclassified name=WARNING_HIGHLIGHT_MS key=- binding-in-file=imports
  components/admin/review/ShowReviewSurface.tsx:581 kind=unclassified name=WARNING_HIGHLIGHT_MS key=- binding-in-file=imports
  components/admin/review/ShowReviewSurface.tsx:662 kind=unclassified name=NAV_SCROLL_SETTLE_TIMEOUT_MS key=- binding-in-file=declares
  components/admin/showpage/PublishedReviewModal.tsx:570 kind=unclassified name=SECTION_FRESHNESS_FLASH_MS key=- binding-in-file=imports
  components/admin/showpage/ShareHub.tsx:227 kind=unclassified name=BUSY_GATE_MAX_MS key=- binding-in-file=declares
  components/admin/showpage/ShareHub.tsx:496 kind=unclassified name=SHARE_LINK_FLASH_MS key=- binding-in-file=declares
  components/admin/telemetry/AutoRefreshControl.tsx:40 kind=unclassified name=AUTO_REFRESH_MS key=- binding-in-file=declares
  components/admin/wizard/CrewRowActions.tsx:191 kind=unclassified name=ARM_REVERT_MS key=- binding-in-file=imports
  components/admin/wizard/Step1Share.tsx:69 kind=unclassified name=WIZARD_COPY_FEEDBACK_RESET_MS key=- binding-in-file=declares
  components/crew/primitives/CopyFactValue.tsx:330 kind=unclassified name=ANNOUNCE_LOG_TTL_MS key=ttlMs binding-in-file=imports
  components/crew/primitives/CopyFactValue.tsx:444 kind=unclassified name=COPY_FEEDBACK_RESET_MS key=- binding-in-file=imports
  components/diagrams/GalleryLightbox.tsx:1013 kind=unclassified name=DEMOTE_CHIP_VISIBLE_MS key=- binding-in-file=declares
  components/realtime/ShowRealtimeBridge.tsx:279 kind=unclassified name=DEBOUNCE_MS key=- binding-in-file=declares
  components/shared/ReportModal.tsx:363 kind=unclassified name=submitTimeoutMs key=- binding-in-file=declares

== D. timer delays written as a bare identifier (36) ==
  app/admin/settings/admins/RevokeRowButton.tsx:168 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  app/admin/settings/admins/RevokeRowButton.tsx:188 WATCHDOG_MS suppressed=true name-visible-in-file=declares
  app/admin/show/[slug]/PickerResetControl.tsx:124 SUCCESS_DISMISS_MS suppressed=true name-visible-in-file=declares
  app/admin/show/[slug]/PickerResetControl.tsx:147 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  app/admin/show/[slug]/ResetPickerEpochButton.tsx:121 SUCCESS_DISMISS_MS suppressed=true name-visible-in-file=declares
  app/admin/show/[slug]/ResetPickerEpochButton.tsx:133 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  app/admin/show/[slug]/RotateShareTokenButton.tsx:166 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  app/admin/show/[slug]/ShareLinkCopyButton.tsx:113 COPY_FEEDBACK_RESET_MS suppressed=true name-visible-in-file=imports
  app/help/_components/RefAnchor.tsx:101 CLEAR_AFTER_MS suppressed=true name-visible-in-file=declares
  app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:118 PENDING_TIMEOUT_MS suppressed=true name-visible-in-file=declares
  components/admin/ArchiveShowButton.tsx:161 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  components/admin/BlockedRowResolver.tsx:207 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  components/admin/BulkIgnoreControls.tsx:92 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  components/admin/HoverHelp.tsx:186 CLOSE_DELAY_MS suppressed=true name-visible-in-file=declares
  components/admin/PendingPanelDiscardButtons.tsx:154 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  components/admin/StagedReviewCard.tsx:259 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  components/admin/announceLog.tsx:97 ttlMs suppressed=false name-visible-in-file=declares
  components/admin/dev/DevCaptureControl.tsx:129 ERROR_AUTO_CLEAR_MS suppressed=true name-visible-in-file=declares
  components/admin/review/ReviewModalShell.tsx:505 DURATION_NORMAL_FALLBACK_MS suppressed=true name-visible-in-file=declares
  components/admin/review/ReviewModalShell.tsx:528 DURATION_FAST_FALLBACK_MS suppressed=true name-visible-in-file=declares
  components/admin/review/ShowReviewSurface.tsx:449 NAV_SCROLL_SETTLE_TIMEOUT_MS suppressed=true name-visible-in-file=declares
  components/admin/review/ShowReviewSurface.tsx:531 WARNING_HIGHLIGHT_MS suppressed=true name-visible-in-file=imports
  components/admin/review/ShowReviewSurface.tsx:581 WARNING_HIGHLIGHT_MS suppressed=true name-visible-in-file=imports
  components/admin/review/ShowReviewSurface.tsx:662 NAV_SCROLL_SETTLE_TIMEOUT_MS suppressed=true name-visible-in-file=declares
  components/admin/showpage/PublishedReviewModal.tsx:570 SECTION_FRESHNESS_FLASH_MS suppressed=true name-visible-in-file=imports
  components/admin/showpage/ShareHub.tsx:227 BUSY_GATE_MAX_MS suppressed=true name-visible-in-file=declares
  components/admin/showpage/ShareHub.tsx:496 SHARE_LINK_FLASH_MS suppressed=true name-visible-in-file=declares
  components/admin/telemetry/AutoRefreshControl.tsx:40 AUTO_REFRESH_MS suppressed=true name-visible-in-file=declares
  components/admin/wizard/CrewRowActions.tsx:191 ARM_REVERT_MS suppressed=true name-visible-in-file=imports
  components/admin/wizard/Step1Share.tsx:69 WIZARD_COPY_FEEDBACK_RESET_MS suppressed=true name-visible-in-file=declares
  components/admin/wizard/step3ReviewSections.tsx:3253 ms suppressed=false name-visible-in-file=declares
  components/crew/primitives/CopyFactValue.tsx:444 COPY_FEEDBACK_RESET_MS suppressed=true name-visible-in-file=imports
  components/diagrams/GalleryLightbox.tsx:1013 DEMOTE_CHIP_VISIBLE_MS suppressed=true name-visible-in-file=declares
  components/realtime/ShowRealtimeBridge.tsx:279 DEBOUNCE_MS suppressed=true name-visible-in-file=declares
  components/realtime/ShowRealtimeBridge.tsx:634 delay suppressed=false name-visible-in-file=declares
  components/shared/ReportModal.tsx:363 submitTimeoutMs suppressed=true name-visible-in-file=declares
```

## P2 — of the suppressed sites, which are cross-file, and do their specifiers resolve

### Script — `probe/p2-import-specifiers.ts`

```ts
/**
 * PROBE P2 — for every suppressed site whose name is IMPORTED, what specifier is
 * it imported from, and does that specifier resolve to the file that declares the
 * covered named-constant? Measures whether module-resolving the import is cheap
 * (all specifiers relative / `@/`) or open-ended (barrels, re-exports, aliases).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

import { scanTimingSites, universeFiles, type TimingSite } from "./scanner-landed";

const ROOT = process.cwd();
const files = universeFiles(ROOT);
const raw: TimingSite[] = [];
const sourceByFile = new Map<string, string>();
for (const file of files) {
  let source: string;
  try {
    source = readFileSync(join(ROOT, file), "utf8");
  } catch {
    continue;
  }
  sourceByFile.set(file, source);
  raw.push(...scanTimingSites(source, file));
}
const namedByName = new Map<string, string[]>();
for (const s of raw.filter((x) => x.kind === "named-constant")) {
  const list = namedByName.get(s.name as string) ?? [];
  list.push(s.file);
  namedByName.set(s.name as string, list);
}
const covered = new Set(namedByName.keys());

/** import { NAME } / { X as NAME } / default / * as NAME → specifier + imported name */
type ImportInfo = { specifier: string; imported: string; form: string };
function importOf(file: string, name: string): ImportInfo | null {
  const source = sourceByFile.get(file);
  if (source === undefined) return null;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hit: ImportInfo | null = null;
  const visit = (node: ts.Node): void => {
    if (hit !== null) return;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (el.name.text === name) {
            hit = {
              specifier: spec,
              imported: el.propertyName?.text ?? el.name.text,
              form: el.propertyName ? "aliased-named" : "named",
            };
          }
        }
      }
      if (clause?.name?.text === name) hit = { specifier: spec, imported: "default", form: "default" };
      if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name)
        hit = { specifier: spec, imported: "*", form: "namespace" };
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hit;
}

/** `@/x` → <root>/x, `./x` → relative; try .ts/.tsx/index.*; null when unresolvable. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(ROOT, dirname(fromFile), spec);
  else return null;
  for (const cand of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(cand)) return relative(ROOT, cand).split("\\").join("/");
  }
  return null;
}

const suppressed = raw.filter(
  (s) => s.kind === "unclassified" && s.name !== null && covered.has(s.name),
);
let sameFile = 0;
let importedResolved = 0;
let importedUnresolved = 0;
let neither = 0;
console.log(`suppressed sites: ${suppressed.length}`);
for (const s of suppressed) {
  const name = s.name as string;
  const declFiles = namedByName.get(name) ?? [];
  if (declFiles.includes(s.file)) {
    sameFile += 1;
    continue;
  }
  const imp = importOf(s.file, name);
  if (imp === null) {
    neither += 1;
    console.log(`  NEITHER  ${s.file}:${s.line} ${name} (declared in ${declFiles.join(",")})`);
    continue;
  }
  const target = resolveSpecifier(s.file, imp.specifier);
  const ok = target !== null && declFiles.includes(target);
  if (ok) importedResolved += 1;
  else importedUnresolved += 1;
  console.log(
    `  ${ok ? "IMPORT-OK" : "IMPORT-??"} ${s.file}:${s.line} ${name} from "${imp.specifier}" (${imp.form}) → ${target ?? "unresolved"} ; declared in ${declFiles.join(",")}`,
  );
}
console.log(
  `\nsame-file=${sameFile} import-resolves-to-declaring-file=${importedResolved} import-does-not=${importedUnresolved} no-import-no-decl=${neither}`,
);
```

### Transcript

```
suppressed sites: 35
  IMPORT-OK app/admin/settings/admins/RevokeRowButton.tsx:168 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK app/admin/show/[slug]/PickerResetControl.tsx:147 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK app/admin/show/[slug]/ResetPickerEpochButton.tsx:133 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK app/admin/show/[slug]/RotateShareTokenButton.tsx:166 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK app/admin/show/[slug]/ShareLinkCopyButton.tsx:113 COPY_FEEDBACK_RESET_MS from "@/lib/ui/copyFeedback" (named) → lib/ui/copyFeedback.ts ; declared in lib/ui/copyFeedback.ts
  IMPORT-OK components/admin/AdminAnnounceProvider.tsx:51 ANNOUNCE_LOG_TTL_MS from "@/components/admin/announceLog" (named) → components/admin/announceLog.tsx ; declared in components/admin/announceLog.tsx
  IMPORT-OK components/admin/ArchiveShowButton.tsx:161 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK components/admin/BlockedRowResolver.tsx:207 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK components/admin/BulkIgnoreControls.tsx:92 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK components/admin/PendingPanelDiscardButtons.tsx:154 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK components/admin/StagedReviewCard.tsx:259 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK components/admin/review/ShowReviewSurface.tsx:531 WARNING_HIGHLIGHT_MS from "@/components/admin/wizard/Step3ReviewModal" (named) → components/admin/wizard/Step3ReviewModal.tsx ; declared in components/admin/wizard/Step3ReviewModal.tsx
  IMPORT-OK components/admin/review/ShowReviewSurface.tsx:581 WARNING_HIGHLIGHT_MS from "@/components/admin/wizard/Step3ReviewModal" (named) → components/admin/wizard/Step3ReviewModal.tsx ; declared in components/admin/wizard/Step3ReviewModal.tsx
  IMPORT-OK components/admin/showpage/PublishedReviewModal.tsx:570 SECTION_FRESHNESS_FLASH_MS from "@/components/admin/review/sectionFreshness" (named) → components/admin/review/sectionFreshness.ts ; declared in components/admin/review/sectionFreshness.ts
  IMPORT-OK components/admin/wizard/CrewRowActions.tsx:191 ARM_REVERT_MS from "@/lib/admin/destructiveConfirm" (named) → lib/admin/destructiveConfirm.ts ; declared in lib/admin/destructiveConfirm.ts
  IMPORT-OK components/crew/primitives/CopyFactValue.tsx:330 ANNOUNCE_LOG_TTL_MS from "@/components/admin/announceLog" (named) → components/admin/announceLog.tsx ; declared in components/admin/announceLog.tsx
  IMPORT-OK components/crew/primitives/CopyFactValue.tsx:444 COPY_FEEDBACK_RESET_MS from "@/lib/ui/copyFeedback" (named) → lib/ui/copyFeedback.ts ; declared in lib/ui/copyFeedback.ts

same-file=18 import-resolves-to-declaring-file=17 import-does-not=0 no-import-no-decl=0
```

## P3 — does the TypeScript checker reproduce the same answer, and what does it cost

### Script — `probe/p3-checker-cost.ts`

```ts
/**
 * PROBE P3 — cost + correctness of resolving identifiers with the TypeScript
 * CHECKER versus the current name-set filter.
 *
 * Measures: (a) current whole-universe scan wall time, (b) ts.createProgram over
 * the universe roots, (c) whether checker.getSymbolAtLocation resolves each of
 * the 35 suppressed sites to the declaration that produced its covered
 * named-constant site.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import { scanRepo, scanTimingSites, universeFiles, type TimingSite } from "./scanner-landed";

const ROOT = process.cwd();
const posix = (p: string) => p.split("\\").join("/");

const t0 = Date.now();
const result = scanRepo(ROOT);
const scanMs = Date.now() - t0;
console.log(
  `current scanRepo: ${scanMs}ms  files=${result.filesScanned} sites=${result.sites.length} unclassified=${result.unclassified.length}`,
);

const files = universeFiles(ROOT);
const raw: TimingSite[] = [];
for (const file of files) {
  try {
    raw.push(...scanTimingSites(readFileSync(join(ROOT, file), "utf8"), file));
  } catch {
    /* unreadable */
  }
}
/** (file, line) of every named-constant declaration — binding identity, not spelling. */
const namedDecl = new Set(
  raw.filter((s) => s.kind === "named-constant").map((s) => `${s.file}:${s.line}`),
);
const coveredNames = new Set(raw.filter((s) => s.kind === "named-constant").map((s) => s.name));

const tsconfig = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, ROOT);
const t1 = Date.now();
const program = ts.createProgram(
  files.map((f) => join(ROOT, f)),
  { ...parsed.options, noEmit: true },
);
const checker = program.getTypeChecker();
const programMs = Date.now() - t1;
console.log(`ts.createProgram over ${files.length} roots: ${programMs}ms`);

// Resolve every bare-identifier timer delay through the checker.
const t2 = Date.now();
let resolvedToNamed = 0;
let resolvedElsewhere = 0;
let unresolved = 0;
const rows: string[] = [];
for (const file of files) {
  const sf = program.getSourceFile(join(ROOT, file));
  if (sf === undefined) continue;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isTimer =
        (ts.isIdentifier(callee) &&
          (callee.text === "setTimeout" || callee.text === "setInterval")) ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.name) &&
          (callee.name.text === "setTimeout" || callee.name.text === "setInterval"));
      const delay = node.arguments[1];
      if (isTimer && delay !== undefined && ts.isIdentifier(delay)) {
        let symbol = checker.getSymbolAtLocation(delay);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
          try {
            symbol = checker.getAliasedSymbol(symbol);
          } catch {
            /* not an alias after all */
          }
        }
        const decl = symbol?.declarations?.[0];
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (decl === undefined) {
          unresolved += 1;
          rows.push(`  UNRESOLVED ${file}:${line} ${delay.text}`);
          return;
        }
        const declSf = decl.getSourceFile();
        const declName = ts.isVariableDeclaration(decl) && decl.name ? decl.name : decl;
        const declLine =
          declSf.getLineAndCharacterOfPosition(declName.getStart(declSf)).line + 1;
        const key = `${posix(relative(ROOT, declSf.fileName))}:${declLine}`;
        if (namedDecl.has(key)) {
          resolvedToNamed += 1;
        } else {
          resolvedElsewhere += 1;
          rows.push(
            `  NOT-A-COVERED-BINDING ${file}:${line} ${delay.text} → ${key} (name in covered set: ${coveredNames.has(delay.text)})`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const resolveMs = Date.now() - t2;
console.log(
  `checker resolution of every bare-identifier delay: ${resolveMs}ms  → covered-binding=${resolvedToNamed} other-binding=${resolvedElsewhere} unresolved=${unresolved}`,
);
for (const r of rows) console.log(r);
console.log(`\nTOTAL checker path: ${programMs + resolveMs}ms vs current ${scanMs}ms`);
```

### Transcript

```
current scanRepo: 277ms  files=311 sites=41 unclassified=0
ts.createProgram over 311 roots: 6846ms
checker resolution of every bare-identifier delay: 22ms  → covered-binding=33 other-binding=3 unresolved=0
  NOT-A-COVERED-BINDING components/admin/announceLog.tsx:97 ttlMs → components/admin/announceLog.tsx:70 (name in covered set: false)
  NOT-A-COVERED-BINDING components/admin/wizard/step3ReviewSections.tsx:3253 ms → components/admin/wizard/step3ReviewSections.tsx:3247 (name in covered set: false)
  NOT-A-COVERED-BINDING components/realtime/ShowRealtimeBridge.tsx:634 delay → components/realtime/ShowRealtimeBridge.tsx:625 (name in covered set: false)

TOTAL checker path: 6868ms vs current 277ms
```

## P4 — can the program be made cheap without changing the answer

### Script — `probe/p4-program-variants.ts`

```ts
/**
 * PROBE P4 — is the checker cheap without lib/type loading, and does it still
 * resolve every bare-identifier delay to the same declaration?
 *
 * Variants: full tsconfig options / noLib / noLib+types:[] / noLib+noResolve.
 * Correctness column is the same 36-site population P3 measured.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import { scanTimingSites, universeFiles, type TimingSite } from "./scanner-landed";

const ROOT = process.cwd();
const posix = (p: string) => p.split("\\").join("/");
const files = universeFiles(ROOT);
const raw: TimingSite[] = [];
for (const file of files) {
  try {
    raw.push(...scanTimingSites(readFileSync(join(ROOT, file), "utf8"), file));
  } catch {
    /* unreadable */
  }
}
const namedDecl = new Set(
  raw.filter((s) => s.kind === "named-constant").map((s) => `${s.file}:${s.line}`),
);

const tsconfig = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
const base = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, ROOT).options;

function run(label: string, options: ts.CompilerOptions): void {
  const t = Date.now();
  const program = ts.createProgram(
    files.map((f) => join(ROOT, f)),
    { ...options, noEmit: true },
  );
  const checker = program.getTypeChecker();
  const createMs = Date.now() - t;
  const t2 = Date.now();
  let covered = 0;
  let other = 0;
  let unresolved = 0;
  for (const file of files) {
    const sf = program.getSourceFile(join(ROOT, file));
    if (sf === undefined) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isTimer =
          (ts.isIdentifier(callee) &&
            (callee.text === "setTimeout" || callee.text === "setInterval")) ||
          (ts.isPropertyAccessExpression(callee) &&
            ts.isIdentifier(callee.name) &&
            (callee.name.text === "setTimeout" || callee.name.text === "setInterval"));
        const delay = node.arguments[1];
        if (isTimer && delay !== undefined && ts.isIdentifier(delay)) {
          let symbol = checker.getSymbolAtLocation(delay);
          if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
            try {
              symbol = checker.getAliasedSymbol(symbol);
            } catch {
              /* not an alias */
            }
          }
          const decl = symbol?.declarations?.[0];
          if (decl === undefined) unresolved += 1;
          else {
            const declSf = decl.getSourceFile();
            const nameNode = ts.isVariableDeclaration(decl) && decl.name ? decl.name : decl;
            const declLine =
              declSf.getLineAndCharacterOfPosition(nameNode.getStart(declSf)).line + 1;
            if (namedDecl.has(`${posix(relative(ROOT, declSf.fileName))}:${declLine}`)) covered += 1;
            else other += 1;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  console.log(
    `${label.padEnd(28)} create=${String(createMs).padStart(6)}ms resolve=${String(Date.now() - t2).padStart(4)}ms  covered=${covered} other=${other} unresolved=${unresolved} sourceFiles=${program.getSourceFiles().length}`,
  );
}

run("full tsconfig", base);
run("noLib", { ...base, noLib: true });
run("noLib + types:[]", { ...base, noLib: true, types: [] });
run("noLib types:[] skipLibCheck", { ...base, noLib: true, types: [], skipLibCheck: true });
run("noResolve + noLib", { ...base, noLib: true, types: [], noResolve: true });
```

### Transcript

```
full tsconfig                create=  6634ms resolve=  23ms  covered=33 other=3 unresolved=0 sourceFiles=3210
noLib                        create=  8020ms resolve=  31ms  covered=33 other=3 unresolved=0 sourceFiles=3128
noLib + types:[]             create=  6581ms resolve=  20ms  covered=33 other=3 unresolved=0 sourceFiles=3121
noLib types:[] skipLibCheck  create=  6339ms resolve=  19ms  covered=33 other=3 unresolved=0 sourceFiles=3121
noResolve + noLib            create=   211ms resolve=  17ms  covered=33 other=3 unresolved=0 sourceFiles=311
```

## P5 — nine constructed shapes, landed scanner vs binding-identity prototype

### Script — `probe/p5-shadow-matrix.ts`

```ts
/**
 * PROBE P5 — (a) honest cost of the noResolve/noLib program in a fresh process,
 * (b) a constructed universe exercising the shadow shapes, scanned by the LANDED
 * scanner (name-set filter) and by a PROTOTYPE binding-identity resolver.
 *
 * The prototype is throwaway: it exists to show the mechanism resolves what the
 * name set resolves and reports what the name set hides.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";

import { scanRepo, scanTimingSites, universeFiles, type TimingSite } from "./scanner-landed";

const posix = (p: string) => p.split("\\").join("/");

// ── (a) honest program cost, fresh process, winning variant first ──────────
const ROOT = process.cwd();
{
  const files = universeFiles(ROOT).map((f) => join(ROOT, f));
  const t = Date.now();
  const program = ts.createProgram(files, {
    noEmit: true,
    noResolve: true,
    noLib: true,
    types: [],
    allowJs: false,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    baseUrl: ROOT,
    paths: { "@/*": ["./*"] },
  });
  program.getTypeChecker();
  console.log(
    `[cost] fresh-process createProgram(noResolve,noLib,types:[]) over ${files.length} roots: ${Date.now() - t}ms  sourceFiles=${program.getSourceFiles().length}`,
  );
}

// ── (b) constructed universe ───────────────────────────────────────────────
const root = mkdtempSync(join(tmpdir(), "timing-shadow-"));
mkdirSync(join(root, "components", "x"), { recursive: true });
mkdirSync(join(root, "lib", "ui"), { recursive: true });

const write = (rel: string, body: string) => writeFileSync(join(root, rel), body, "utf8");

// The covered binding, in a scanned file (stands in for lib/ui/copyFeedback.ts).
write(
  "components/x/copyFeedback.ts",
  `export const COPY_FEEDBACK_RESET_MS = 1600;\nexport const OTHER_DELAY_MS = 900;\n`,
);
// A barrel re-export, to see whether a re-export chain resolves or reports.
write("components/x/barrel.ts", `export { COPY_FEEDBACK_RESET_MS } from "./copyFeedback";\n`);

// a. module-level local shadow, no import — the filed case.
write(
  "components/x/ShadowModuleLevel.tsx",
  `declare function readDelayFromRuntimeConfig(): number;\n` +
    `const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();\n` +
    `export function A(fn: () => void) { setTimeout(fn, COPY_FEEDBACK_RESET_MS); }\n`,
);
// b. inner-scope shadow while the module imports the real binding.
write(
  "components/x/ShadowInner.tsx",
  `import { COPY_FEEDBACK_RESET_MS } from "./copyFeedback";\n` +
    `declare function readDelayFromRuntimeConfig(): number;\n` +
    `export function B(fn: () => void) {\n` +
    `  const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();\n` +
    `  setTimeout(fn, COPY_FEEDBACK_RESET_MS);\n` +
    `}\n` +
    `export function B2(fn: () => void) { setTimeout(fn, COPY_FEEDBACK_RESET_MS); }\n`,
);
// c. legit same-file covered constant.
write(
  "components/x/LegitLocal.tsx",
  `const CLOSE_DELAY_MS = 220;\nexport function C(fn: () => void) { setTimeout(fn, CLOSE_DELAY_MS); }\n`,
);
// d. legit cross-file import.
write(
  "components/x/LegitImport.tsx",
  `import { COPY_FEEDBACK_RESET_MS } from "./copyFeedback";\n` +
    `export function D(fn: () => void) { setTimeout(fn, COPY_FEEDBACK_RESET_MS); }\n`,
);
// e. aliased import.
write(
  "components/x/AliasImport.tsx",
  `import { OTHER_DELAY_MS as localAliasMs } from "./copyFeedback";\n` +
    `export function E(fn: () => void) { setTimeout(fn, localAliasMs); }\n`,
);
// f. re-export chain through a barrel.
write(
  "components/x/BarrelImport.tsx",
  `import { COPY_FEEDBACK_RESET_MS } from "./barrel";\n` +
    `export function F(fn: () => void) { setTimeout(fn, COPY_FEEDBACK_RESET_MS); }\n`,
);
// g. parameter shadow.
write(
  "components/x/ParamShadow.tsx",
  `import { COPY_FEEDBACK_RESET_MS } from "./copyFeedback";\n` +
    `export function G(fn: () => void, COPY_FEEDBACK_RESET_MS: number) { setTimeout(fn, COPY_FEEDBACK_RESET_MS); }\n`,
);
// h. a timing-named PROPERTY whose value is a shadowed identifier.
write(
  "components/x/PropShadow.tsx",
  `declare function readDelayFromRuntimeConfig(): number;\n` +
    `const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();\n` +
    `export const opts = { ttlMs: COPY_FEEDBACK_RESET_MS };\n`,
);

// ---- landed behaviour -----------------------------------------------------
const landed = scanRepo(root);
console.log(`\n[landed] sites=${landed.sites.length} unclassified=${landed.unclassified.length}`);
for (const s of landed.sites) {
  console.log(`  ${s.file}:${s.line} ${s.kind} name=${s.name} key=${s.propertyKey ?? "-"}`);
}
console.log(
  `[landed] the shadow sites appear above? ${landed.sites.some((s) => s.file.includes("Shadow")) ? "YES" : "NO — silently dropped"}`,
);

// ---- prototype: binding identity via the checker --------------------------
const files = universeFiles(root);
const raw: { site: TimingSite; identifierPos: number | null }[] = [];
for (const file of files) {
  let source: string;
  try {
    source = readFileSync(join(root, file), "utf8");
  } catch {
    continue;
  }
  // Re-derive identifier positions: re-parse and note the delay/value identifier
  // for each unclassified site the landed per-file scan produced.
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const posByLineName = new Map<string, number>();
  const collect = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const key = `${line}::${node.text}`;
      if (!posByLineName.has(key)) posByLineName.set(key, node.getStart(sf));
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);
  for (const site of scanTimingSites(source, file)) {
    const key = `${site.line}::${site.name ?? ""}`;
    raw.push({ site, identifierPos: posByLineName.get(key) ?? null });
  }
}
const namedDeclKeys = new Set(
  raw.filter((r) => r.site.kind === "named-constant").map((r) => `${r.site.file}:${r.site.line}`),
);
const program = ts.createProgram(
  files.map((f) => join(root, f)),
  {
    noEmit: true,
    noResolve: true,
    noLib: true,
    types: [],
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
  },
);
const checker = program.getTypeChecker();

function declarationKeyAt(file: string, pos: number): string | null {
  const sf = program.getSourceFile(join(root, file));
  if (sf === undefined) return null;
  const find = (node: ts.Node): ts.Identifier | null => {
    if (node.getStart(sf) === pos && ts.isIdentifier(node)) return node;
    for (const child of node.getChildren(sf)) {
      if (child.getStart(sf) <= pos && pos < child.getEnd()) {
        const hit = find(child);
        if (hit) return hit;
      }
    }
    return null;
  };
  const id = find(sf);
  if (id === null) return null;
  let symbol = checker.getSymbolAtLocation(id);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    try {
      symbol = checker.getAliasedSymbol(symbol);
    } catch {
      /* leave the alias */
    }
  }
  const decl = symbol?.declarations?.[0];
  if (decl === undefined) return null;
  const declSf = decl.getSourceFile();
  const nameNode = ts.isVariableDeclaration(decl) && decl.name ? decl.name : decl;
  const line = declSf.getLineAndCharacterOfPosition(nameNode.getStart(declSf)).line + 1;
  return `${posix(relative(root, declSf.fileName))}:${line}`;
}

console.log(`\n[prototype] binding-identity resolution of every unclassified site`);
for (const { site, identifierPos } of raw) {
  if (site.kind !== "unclassified") continue;
  const key = identifierPos === null ? null : declarationKeyAt(site.file, identifierPos);
  const covered = key !== null && namedDeclKeys.has(key);
  console.log(
    `  ${site.file}:${site.line} name=${site.name} key=${site.propertyKey ?? "-"} → decl=${key ?? "unresolved"} ⇒ ${covered ? "resolved (suppressed)" : "UNCLASSIFIED (reported)"}`,
  );
}
```

### Transcript

```
[cost] fresh-process createProgram(noResolve,noLib,types:[]) over 311 roots: 369ms  sourceFiles=311

[landed] sites=4 unclassified=1
  components/x/AliasImport.tsx:2 unclassified name=localAliasMs key=-
  components/x/LegitLocal.tsx:1 named-constant name=CLOSE_DELAY_MS key=-
  components/x/copyFeedback.ts:1 named-constant name=COPY_FEEDBACK_RESET_MS key=-
  components/x/copyFeedback.ts:2 named-constant name=OTHER_DELAY_MS key=-
[landed] the shadow sites appear above? NO — silently dropped

[prototype] binding-identity resolution of every unclassified site
  components/x/AliasImport.tsx:2 name=localAliasMs key=- → decl=components/x/copyFeedback.ts:2 ⇒ resolved (suppressed)
  components/x/BarrelImport.tsx:2 name=COPY_FEEDBACK_RESET_MS key=- → decl=components/x/copyFeedback.ts:1 ⇒ resolved (suppressed)
  components/x/LegitImport.tsx:2 name=COPY_FEEDBACK_RESET_MS key=- → decl=components/x/copyFeedback.ts:1 ⇒ resolved (suppressed)
  components/x/LegitLocal.tsx:2 name=CLOSE_DELAY_MS key=- → decl=components/x/LegitLocal.tsx:1 ⇒ resolved (suppressed)
  components/x/ParamShadow.tsx:2 name=COPY_FEEDBACK_RESET_MS key=- → decl=components/x/ParamShadow.tsx:2 ⇒ UNCLASSIFIED (reported)
  components/x/PropShadow.tsx:3 name=COPY_FEEDBACK_RESET_MS key=ttlMs → decl=components/x/PropShadow.tsx:2 ⇒ UNCLASSIFIED (reported)
  components/x/ShadowInner.tsx:5 name=COPY_FEEDBACK_RESET_MS key=- → decl=components/x/ShadowInner.tsx:4 ⇒ UNCLASSIFIED (reported)
  components/x/ShadowInner.tsx:7 name=COPY_FEEDBACK_RESET_MS key=- → decl=components/x/copyFeedback.ts:1 ⇒ resolved (suppressed)
  components/x/ShadowModuleLevel.tsx:3 name=COPY_FEEDBACK_RESET_MS key=- → decl=components/x/ShadowModuleLevel.tsx:2 ⇒ UNCLASSIFIED (reported)
```

## P6 — repeated program cost inside one process, and the per-file alternative

### Script — `probe/p6-repeat-cost.ts`

```ts
/**
 * PROBE P6 — repeated cost of the resolution program inside one process (the
 * suites call scanRepo up to 7 times), and the per-file-program alternative.
 */
import { join } from "node:path";
import ts from "typescript";

import { universeFiles } from "./scanner-landed";

const ROOT = process.cwd();
const files = universeFiles(ROOT).map((f) => join(ROOT, f));
const tsconfig = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
const base = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, ROOT).options;
const options: ts.CompilerOptions = {
  ...base,
  noEmit: true,
  noResolve: true,
  noLib: true,
  types: [],
};

const times: number[] = [];
for (let i = 0; i < 7; i += 1) {
  const t = Date.now();
  const program = ts.createProgram(files, options);
  program.getTypeChecker();
  // touch every source file so binding actually happens
  let n = 0;
  for (const f of files) if (program.getSourceFile(f) !== undefined) n += 1;
  times.push(Date.now() - t);
}
console.log(`whole-universe program × 7: ${times.join("ms, ")}ms  (total ${times.reduce((a, b) => a + b, 0)}ms)`);

// Per-file program cost, for the ~24 files that hold an unresolved identifier.
const sample = files.slice(0, 24);
const t2 = Date.now();
for (const f of sample) {
  const p = ts.createProgram([f], options);
  p.getTypeChecker();
  p.getSourceFile(f);
}
console.log(`single-file programs × ${sample.length}: ${Date.now() - t2}ms total`);
```

### Transcript

```
whole-universe program × 7: 367ms, 214ms, 176ms, 177ms, 182ms, 193ms, 167ms  (total 1476ms)
single-file programs × 24: 34ms total
```

## P7 — the pinned option set on the live tree: zero delta?

### Script — `probe/p7-final-options.ts`

```ts
/**
 * PROBE P7 — the EXACT compiler options the spec pins, on the live tree:
 * does every one of the 35 name-suppressed sites resolve to the declaration of
 * its covered named-constant (zero live delta), and what does it cost?
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import { scanTimingSites, universeFiles, type TimingSite } from "./scanner-landed";

const ROOT = process.cwd();
const posix = (p: string) => p.split("\\").join("/");

const RESOLVER_OPTIONS: ts.CompilerOptions = {
  noEmit: true,
  noResolve: true,
  noLib: true,
  types: [],
  allowJs: false,
  target: ts.ScriptTarget.Latest,
  jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: ROOT,
  paths: { "@/*": ["./*"] },
};

const files = universeFiles(ROOT);
const raw: TimingSite[] = [];
const sources = new Map<string, string>();
for (const file of files) {
  try {
    const src = readFileSync(join(ROOT, file), "utf8");
    sources.set(file, src);
    raw.push(...scanTimingSites(src, file));
  } catch {
    /* unreadable */
  }
}
const namedDeclKeys = new Set(
  raw.filter((s) => s.kind === "named-constant").map((s) => `${s.file}:${s.line}`),
);
const coveredNames = new Set(raw.filter((s) => s.kind === "named-constant").map((s) => s.name));

const t = Date.now();
const program = ts.createProgram(
  files.map((f) => join(ROOT, f)),
  RESOLVER_OPTIONS,
);
const checker = program.getTypeChecker();
console.log(`program: ${Date.now() - t}ms  sourceFiles=${program.getSourceFiles().length}`);

/** Every bare identifier that is a timer delay or a timing-property value. */
type Ref = { file: string; line: number; text: string; id: ts.Identifier; kind: string };
const refs: Ref[] = [];
for (const file of files) {
  const sf = program.getSourceFile(join(ROOT, file));
  if (sf === undefined) continue;
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isTimer =
        (ts.isIdentifier(callee) &&
          (callee.text === "setTimeout" || callee.text === "setInterval")) ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.name) &&
          (callee.name.text === "setTimeout" || callee.name.text === "setInterval"));
      const delay = node.arguments[1];
      if (isTimer && delay !== undefined && ts.isIdentifier(delay))
        refs.push({ file, line: lineOf(node), text: delay.text, id: delay, kind: "delay" });
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.initializer)) {
      refs.push({
        file,
        line: lineOf(node),
        text: node.initializer.text,
        id: node.initializer,
        kind: "property",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

let coveredHit = 0;
let other = 0;
let unresolved = 0;
const mismatches: string[] = [];
for (const ref of refs) {
  let symbol = checker.getSymbolAtLocation(ref.id);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    try {
      symbol = checker.getAliasedSymbol(symbol);
    } catch {
      /* keep the alias */
    }
  }
  const decls = symbol?.declarations ?? [];
  const nameWasCovered = coveredNames.has(ref.text);
  if (decls.length !== 1) {
    if (nameWasCovered) mismatches.push(`  DECLS=${decls.length} ${ref.file}:${ref.line} ${ref.text}`);
    if (decls.length === 0) unresolved += 1;
    else other += 1;
    continue;
  }
  const decl = decls[0]!;
  const declSf = decl.getSourceFile();
  const nameNode = ts.isVariableDeclaration(decl) && decl.name ? decl.name : decl;
  const key = `${posix(relative(ROOT, declSf.fileName))}:${declSf.getLineAndCharacterOfPosition(nameNode.getStart(declSf)).line + 1}`;
  const isCovered = namedDeclKeys.has(key);
  if (isCovered) coveredHit += 1;
  else other += 1;
  if (isCovered !== nameWasCovered) {
    mismatches.push(
      `  DELTA ${ref.kind} ${ref.file}:${ref.line} ${ref.text}: name-filter=${nameWasCovered} binding=${isCovered} decl=${key}`,
    );
  }
}
console.log(
  `refs=${refs.length} resolved-to-covered-declaration=${coveredHit} other-binding=${other} unresolved=${unresolved}`,
);
console.log(`deltas vs the name filter (${mismatches.length}):`);
for (const m of mismatches) console.log(m);
```

### Transcript

```
program: 269ms  sourceFiles=311
refs=367 resolved-to-covered-declaration=35 other-binding=292 unresolved=40
deltas vs the name filter (0):
```

## P8 — module-graph and declaration-merging shapes under the pinned options

Run after the first seven, to settle the resolution shapes the spec asserts in §2.2 and §4 rather than reasoning about them: an `export *` re-export, a type-only import beside a value import, a namespace member assigned to a local, and a DECLARATION MERGE (one symbol, several declarations).

### Script — `probe/p8-export-star.ts`

```ts
/** P8 — export *, type-only import, and a const shadowed by a later re-declaration,
 *  under the pinned RESOLVER_OPTIONS. Does resolution stay conservative? */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "p8-"));
mkdirSync(join(root, "components", "x"), { recursive: true });
const w = (rel: string, body: string) => writeFileSync(join(root, rel), body, "utf8");
w("components/x/consts.ts", `export const COPY_FEEDBACK_RESET_MS = 1600;\n`);
w("components/x/star.ts", `export * from "./consts";\n`);
w("components/x/StarImport.tsx", `import { COPY_FEEDBACK_RESET_MS } from "./star";\nexport function A(fn:()=>void){ setTimeout(fn, COPY_FEEDBACK_RESET_MS); }\n`);
w("components/x/TypeOnly.tsx", `import type { Foo } from "./consts";\nimport { COPY_FEEDBACK_RESET_MS } from "./consts";\nexport function B(fn:()=>void){ setTimeout(fn, COPY_FEEDBACK_RESET_MS); }\nexport type Bar = Foo;\n`);
w("components/x/NamespaceUse.tsx", `import * as C from "./consts";\nconst DELAY_MS = C.COPY_FEEDBACK_RESET_MS;\nexport function D(fn:()=>void){ setTimeout(fn, DELAY_MS); }\n`);
w("components/x/MergedDecl.tsx", `export const TTL_MS = 500;\nexport type TTL_MS = number;\nexport function E(fn:()=>void){ setTimeout(fn, TTL_MS); }\n`);

const files = [
  "components/x/consts.ts","components/x/star.ts","components/x/StarImport.tsx",
  "components/x/TypeOnly.tsx","components/x/NamespaceUse.tsx","components/x/MergedDecl.tsx",
];
const program = ts.createProgram(files.map((f) => join(root, f)), {
  noEmit: true, noResolve: true, noLib: true, types: [], allowJs: false,
  target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: root, paths: { "@/*": ["./*"] },
});
const checker = program.getTypeChecker();
for (const file of files) {
  const sf = program.getSourceFile(join(root, file));
  if (!sf) { console.log(`${file}: NOT IN PROGRAM`); continue; }
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "setTimeout") {
      const d = node.arguments[1];
      if (d && ts.isIdentifier(d)) {
        let s = checker.getSymbolAtLocation(d);
        const aliased = !!(s && s.flags & ts.SymbolFlags.Alias);
        if (aliased) { try { s = checker.getAliasedSymbol(s!); } catch { /* keep */ } }
        const decls = s?.declarations ?? [];
        console.log(`${file} ${d.text}: alias=${aliased} decls=${decls.length} → ` +
          decls.map((dd) => {
            const dsf = dd.getSourceFile();
            const nn = ts.isVariableDeclaration(dd) && dd.name ? dd.name : dd;
            return `${relative(root, dsf.fileName)}:${dsf.getLineAndCharacterOfPosition(nn.getStart(dsf)).line + 1}[${ts.SyntaxKind[dd.kind]}]`;
          }).join(", ") || "none");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
```

### Transcript

```
components/x/StarImport.tsx COPY_FEEDBACK_RESET_MS: alias=true decls=1 → components/x/consts.ts:1[VariableDeclaration]
components/x/TypeOnly.tsx COPY_FEEDBACK_RESET_MS: alias=true decls=1 → components/x/consts.ts:1[VariableDeclaration]
components/x/NamespaceUse.tsx DELAY_MS: alias=false decls=1 → components/x/NamespaceUse.tsx:2[VariableDeclaration]
components/x/MergedDecl.tsx TTL_MS: alias=false decls=2 → components/x/MergedDecl.tsx:1[VariableDeclaration], components/x/MergedDecl.tsx:2[TypeAliasDeclaration]
```

### What it settles

- `export *` resolves through to the declaring file, so a barrel is not a documented limit under these options.
- A type-only import beside a value import does not disturb the value resolution.
- A namespace member assigned to a local (`const DELAY_MS = C.COPY_FEEDBACK_RESET_MS`) resolves to that LOCAL binding, which is not a covered row, so the site REPORTS. Conservative and correct: the local is an indirection the scan cannot value.
- **A declaration merge yields ONE symbol with TWO declarations** — a `VariableDeclaration` (the covered numeric constant) and a `TypeAliasDeclaration`. That is the direct evidence for §2.2's SOME-declaration rule: an exactly-one-declaration rule would report a covered constant as unclassified on this ordinary shape.
## P9 — a reassigned `let` is valued by its initializer (the VALUATION axis, not this arcs)

Asked because the strongest possible finding against a resolution repair is a site that resolves correctly and is then valued wrongly. It is pre-existing form-2 behaviour, unchanged by this arc, and recorded so nobody has to re-derive it.

### Script — `probe/p9-let-reassign.ts`

```ts
/** P9 — does a `let` binding with a literal initializer that is later REASSIGNED
 *  become a covered named-constant, and does a delay referencing it suppress?
 *  Valuation axis, not resolution: measured to disposition it honestly. */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanRepo } from "/Users/ericweiss/FX-worktrees/timing-scan-scope-resolution/probe-scanner-landed";

const root = mkdtempSync(join(tmpdir(), "p9-"));
mkdirSync(join(root, "components", "x"), { recursive: true });
writeFileSync(
  join(root, "components/x/LetReassign.tsx"),
  `declare function readConfig(): number;\n` +
    `let RETRY_MS = 100;\n` +
    `export function init() { RETRY_MS = readConfig(); }\n` +
    `export function A(fn: () => void) { setTimeout(fn, RETRY_MS); }\n`,
  "utf8",
);
const r = scanRepo(root);
console.log("sites:", JSON.stringify(r.sites, null, 1));
console.log("unclassified:", JSON.stringify(r.unclassified));
```

### Transcript

```
sites: [
 {
  "file": "components/x/LetReassign.tsx",
  "line": 2,
  "kind": "named-constant",
  "name": "RETRY_MS",
  "value": 100
 }
]
unclassified: []

$ rg -n '^\s*let\s+[A-Za-z_]*([Mm]s|MS|[Dd]elay|[Dd]uration|[Tt]imeout|[Ss]econds)\s*=\s*-?[0-9]' app components lib/ui lib/admin --glob '!app/api/**'
(no matches — zero live instances on this tree)
```

### What it settles

- A `let` binding whose initializer is a numeric literal is a `named-constant` valued at that literal, and a later reassignment is not tracked; a delay referencing it resolves to that binding and is suppressed. The resolution is CORRECT (it is that binding); the VALUE §5.5 would carry is the initializer.
- Live instances of the shape on this tree: **zero** (the `rg` above). So the arc ships with no live row affected, and the limit is recorded in the spec §4 plus a ledger row rather than fixed here — valuation is a different axis from resolution, and widening this arc into it is exactly the ratchet the round-economy rules forbid.
## P10 — a line-keyed declaration set ALIASES two bindings declared on one line

Run against the spec draft itself, hostile posture: the draft keyed the covered-declaration set by file plus LINE, and a key that can alias is not an identity. This probe is the counter-example, and it changed the design — §2.2 now keys on the declaration name node's START OFFSET.

### Script — `probe/p10-same-line-key.ts`

```ts
/** P10 — does a `${file}:${line}` declaration key ALIAS two bindings declared on
 *  one line? If so, a reference to the non-timing one resolves to a key the
 *  covered set holds, and the site is suppressed — a binding resolving to a
 *  DIFFERENT binding's row, which is the exact class the arc exists to close. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";

import {
  scanTimingSites,
  universeFiles,
  type TimingSite,
} from "/Users/ericweiss/FX-worktrees/timing-scan-scope-resolution/probe-scanner-landed";

const root = mkdtempSync(join(tmpdir(), "p10-"));
mkdirSync(join(root, "components", "x"), { recursive: true });
writeFileSync(
  join(root, "components/x/SameLine.tsx"),
  `declare function readConfig(): number;\n` +
    `const CLOSE_DELAY_MS = 220, other = readConfig();\n` +
    `export function A(fn: () => void) { setTimeout(fn, other); }\n`,
  "utf8",
);

const files = universeFiles(root).filter((f) => existsSync(join(root, f)));
const raw: TimingSite[] = [];
for (const f of files) raw.push(...scanTimingSites(readFileSync(join(root, f), "utf8"), f));
const lineKeys = new Set(
  raw.filter((s) => s.kind === "named-constant").map((s) => `${s.file}:${s.line}`),
);
console.log("named-constant line keys:", [...lineKeys]);

const program = ts.createProgram(
  files.map((f) => join(root, f)),
  {
    noEmit: true, noResolve: true, noLib: true, types: [], allowJs: false,
    target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root, paths: { "@/*": ["./*"] },
  },
);
const checker = program.getTypeChecker();
for (const f of files) {
  const sf = program.getSourceFile(join(root, f));
  if (!sf) continue;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "setTimeout"
    ) {
      const d = node.arguments[1];
      if (d && ts.isIdentifier(d)) {
        const sym = checker.getSymbolAtLocation(d);
        for (const decl of sym?.declarations ?? []) {
          const dsf = decl.getSourceFile();
          const nameNode = ts.isVariableDeclaration(decl) && decl.name ? decl.name : decl;
          const line = dsf.getLineAndCharacterOfPosition(nameNode.getStart(dsf)).line + 1;
          const key = `${relative(root, dsf.fileName)}:${line}`;
          console.log(
            `delay ${d.text} → decl ${key} (start offset ${nameNode.getStart(dsf)}) ; line key in covered set: ${lineKeys.has(key)}`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
```

### Transcript

```
named-constant line keys: [ 'components/x/SameLine.tsx:2' ]
delay other → decl components/x/SameLine.tsx:2 (start offset 67) ; line key in covered set: true
```

### What it settles

- `const CLOSE_DELAY_MS = 220, other = readConfig();` puts two bindings on one line. `other` is not a timing name and produces no site of its own, but its declaration shares the covered constant's LINE.
- Under a line-keyed rule, `setTimeout(fn, other)` resolves to that line, the key is in the covered set, and the site is SUPPRESSED — one binding wearing another binding's coverage, which is the exact class this arc exists to close, reintroduced by the repair.
- Under today's name filter that same site is correctly reported, so the line-keyed draft would have been a REGRESSION rather than merely a weaker fix.
- The start offsets differ (the covered name at 6, `other` at 67), so keying on the declaration name node's start offset is the identity the rule needs, at the same cost and with no ambiguity.
## P11 — a program root that does not exist (every synthetic-root test hits this)

`scanRepo` builds its file list with `universeFiles`, which APPENDS the `EXPLICIT_INCLUDES` paths unconditionally. Under the live repo they exist; under the fixture-tree tests, which scan a `mkdtempSync` root, they do not — so every one of those tests would pass two nonexistent paths to `ts.createProgram`. Asked before the implementer discovers it.

### Script — `probe/p11-missing-roots.ts`

```ts
/** P11 — scanRepo passes universeFiles(root), which APPENDS the EXPLICIT_INCLUDES
 *  paths whether or not they exist. In a synthetic-root test they do not.
 *  Does ts.createProgram tolerate missing roots, and at what cost? */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "p11-"));
mkdirSync(join(root, "components", "x"), { recursive: true });
writeFileSync(
  join(root, "components/x/A.tsx"),
  "const CLOSE_DELAY_MS = 220;\nexport function A(fn: () => void) { setTimeout(fn, CLOSE_DELAY_MS); }\n",
  "utf8",
);
const roots = [
  join(root, "components/x/A.tsx"),
  join(root, "lib/admin/destructiveConfirm.ts"), // does not exist here
  join(root, "lib/ui/copyFeedback.ts"), // does not exist here
];
const t = Date.now();
let threw: string | null = null;
let program: ts.Program | null = null;
try {
  program = ts.createProgram(roots, {
    noEmit: true, noResolve: true, noLib: true, types: [], allowJs: false,
    target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root, paths: { "@/*": ["./*"] },
  });
  program.getTypeChecker();
} catch (e) {
  threw = e instanceof Error ? e.message : String(e);
}
console.log(`threw: ${threw ?? "no"} ; ms=${Date.now() - t}`);
if (program) {
  console.log(`sourceFiles in program: ${program.getSourceFiles().length}`);
  console.log(`missing root resolves to a SourceFile? ${program.getSourceFile(roots[1]!) !== undefined}`);
  console.log(`present root resolves? ${program.getSourceFile(roots[0]!) !== undefined}`);
  const diags = program.getGlobalDiagnostics().length + program.getOptionsDiagnostics().length;
  console.log(`global+options diagnostics (ignored by the design): ${diags}`);
}
```

### Transcript

```
threw: no ; ms=10
sourceFiles in program: 1
missing root resolves to a SourceFile? false
present root resolves? true
global+options diagnostics (ignored by the design): 10
```

### What it settles

- `ts.createProgram` does NOT throw on a missing root: it records a diagnostic and the program simply lacks that source file. The design reads no diagnostics, so the ten reported here are inert.
- The fixture-tree suite therefore needs no special handling, and the cost of a synthetic universe is ~10 ms rather than the live tree's ~250 ms.
- Failure direction if a real universe file goes missing: no source file, so no reference in it is resolved and nothing is suppressed on its behalf — the conservative direction, matching §2.5.
## P12 — the shorthand property needs a different checker call (round-1 finding, re-probed here)

Round 1's discipline reviewer found that `{ duration }` does not resolve through `getSymbolAtLocation`. Re-run independently rather than taken on assertion, because §2.3 now specifies an API on the strength of it.

### Script — `probe/p12-shorthand.ts`

```ts
/** P12 — confirm the shorthand claim: getSymbolAtLocation on `{ duration }`
 *  returns the PROPERTY's symbol; getShorthandAssignmentValueSymbol returns the
 *  value binding. If true, deleting the name filter without the second call
 *  turns a resolving shorthand into a permanent residual. */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "p12-"));
mkdirSync(join(root, "components", "x"), { recursive: true });
const f = "components/x/Shorthand.tsx";
writeFileSync(
  join(root, f),
  "const duration = 0.22;\nexport const motion = { duration };\n",
  "utf8",
);
const program = ts.createProgram([join(root, f)], {
  noEmit: true, noResolve: true, noLib: true, types: [], allowJs: false,
  target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: root, paths: { "@/*": ["./*"] },
});
const checker = program.getTypeChecker();
const sf = program.getSourceFile(join(root, f))!;
const show = (label: string, sym: ts.Symbol | undefined) => {
  const d = sym?.declarations ?? [];
  console.log(
    `${label}: ${d.map((x) => `${relative(root, x.getSourceFile().fileName)}:${x.getSourceFile().getLineAndCharacterOfPosition(x.getStart(x.getSourceFile())).line + 1}[${ts.SyntaxKind[x.kind]}]`).join(", ") || "none"}`,
  );
};
const visit = (node: ts.Node): void => {
  if (ts.isShorthandPropertyAssignment(node)) {
    show("getSymbolAtLocation(name)          ", checker.getSymbolAtLocation(node.name));
    show("getShorthandAssignmentValueSymbol  ", checker.getShorthandAssignmentValueSymbol(node));
  }
  ts.forEachChild(node, visit);
};
visit(sf);
```

### Transcript

```
getSymbolAtLocation(name)          : components/x/Shorthand.tsx:2[ShorthandPropertyAssignment]
getShorthandAssignmentValueSymbol  : components/x/Shorthand.tsx:1[VariableDeclaration]
```

### What it settles

- `getSymbolAtLocation(node.name)` on a `ShorthandPropertyAssignment` returns the PROPERTY's own symbol, declared at the property itself — never a covered key, so the site would report forever.
- `getShorthandAssignmentValueSymbol(node)` returns the value binding (`VariableDeclaration` at line 1), which is the declaration the covered set holds.
- The 2026-08-15 arc made shorthand an unclassified-producing form and leaned on the covered-names filter to auto-resolve it. Deleting that filter without this call converts a resolving shorthand into a permanent residual — conservative in direction, but a live-adjacent regression: `components/crew/CrewSectionTransition.tsx` carries a `{ duration }` one rename from the shape.
## P13 — form 2d position identity

The scanner pushes form 2d (a string-literal-named class property) with its LINE taken from the property node, while the resolver reads the declaration NAME. If those two disagree the covered key never matches and a covered constant reports.

### Script — `probe/p13-form2d.ts`

```ts
/** P13 — for form 2d (`class C { "ttlMs" = 17000 }`), does
 *  ts.getNameOfDeclaration return the string-literal NAME node? The scanner
 *  records that site's LINE from the property node, so declPos must come from
 *  the name on both sides or the key never matches. */
import ts from "typescript";
const src = `export class C {\n  "ttlMs" = 17000;\n  plainMs = 200;\n}\n`;
const sf = ts.createSourceFile("C.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const visit = (node: ts.Node): void => {
  if (ts.isPropertyDeclaration(node)) {
    const name = ts.getNameOfDeclaration(node);
    console.log(
      `property ${node.name.getText(sf)}: node.start=${node.getStart(sf)} nameOfDeclaration=${name ? ts.SyntaxKind[name.kind] : "undefined"} name.start=${name ? name.getStart(sf) : "-"}`,
    );
  }
  ts.forEachChild(node, visit);
};
visit(sf);
```

### Transcript

```
property "ttlMs": node.start=19 nameOfDeclaration=StringLiteral name.start=19
property plainMs: node.start=38 nameOfDeclaration=Identifier name.start=38
```

### What it settles

- `ts.getNameOfDeclaration` returns the STRING LITERAL for form 2d, and its start equals the property node start here — but only because the property carries no modifier or decorator. `static "ttlMs" = 17000` moves the node start and leaves the name start where it is.
- So `declPos` is recorded from the NAME node on every form, and the resolver reads `getNameOfDeclaration(decl) ?? decl`. Agreement by coincidence in a fixture is what this probe exists to refuse.
- Class members are reached by member access, which this arc does not resolve (§4 item 4), so no live site depends on it today; the key still has to be right where it is defined.
