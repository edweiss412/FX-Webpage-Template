import { relative } from "node:path";

import type { Page } from "@playwright/test";
import {
  JsxAttribute,
  Node,
  Project,
  SyntaxKind,
  type SourceFile,
  type StringLiteral,
} from "ts-morph";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import { RETIRED_CODES, SPEC_CODES } from "@/lib/messages/__generated__/spec-codes";

export const USER_VISIBLE_ATTRS = [
  "aria-label",
  "title",
  "alt",
  "placeholder",
  "value",
  "aria-description",
  "aria-roledescription",
] as const;

const CATALOG_ROUTER_FUNCTIONS = new Set([
  "messageFor",
  "getDougFacing",
  "getCrewFacing",
  "lookupHelpfulContext",
  "setError",
  "setErrorCode",
]);
const CATALOG_ROUTER_COMPONENTS = new Set(["ErrorExplainer", "HelpAffordance"]);

export type ForbiddenCodeProvenance = {
  code: string;
  sources: string[];
};

export type ForbiddenCodeIndex = Map<string, ForbiddenCodeProvenance>;

export type RawCodeViolation = {
  kind: "jsx-text" | "jsx-attribute" | "jsx-expression";
  code: string;
  file: string;
  line: number;
  detail: string;
  sources: string[];
};

export type RuntimeRawCodeLeak = {
  phase: "textContent" | "attribute" | "live-dom-property";
  code: string;
  kind: string;
  value: string;
  sources: string[];
};

export function buildForbiddenCodeIndex(options: { runtimeSubstringMinLength?: number } = {}) {
  const index: ForbiddenCodeIndex = new Map();
  const add = (code: string, source: string) => {
    if (
      options.runtimeSubstringMinLength !== undefined &&
      code.length < options.runtimeSubstringMinLength
    ) {
      return;
    }
    const existing = index.get(code) ?? { code, sources: [] };
    if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.sources.sort();
    index.set(code, existing);
  };

  for (const code of Object.keys(SPEC_CODES)) add(code, "catalog");
  for (const code of Object.keys(RETIRED_CODES)) add(code, "retired");
  for (const [code, payload] of Object.entries(INTERNAL_CODE_ENUMS)) {
    for (const source of payload.source.split(",")) add(code, source);
  }
  return index;
}

export function formatRawCodeViolation(violation: RawCodeViolation): string {
  return `${violation.file}:${violation.line} [${violation.kind}] leaked ${violation.code} from ${violation.sources.join("+")}: ${violation.detail}`;
}

export function formatRuntimeLeak(leak: RuntimeRawCodeLeak): string {
  return `[${leak.phase}:${leak.kind}] leaked ${leak.code} from ${leak.sources.join("+")}: ${leak.value.slice(0, 120)}`;
}

function defaultUiSourceFiles(): string[] {
  return walkSourceFiles(["app", "components"])
    .filter((path) => path.endsWith(".tsx"))
    .filter((path) => !path.startsWith("app/api/"));
}

function tagNameForAttribute(attr: JsxAttribute): string | null {
  const element = attr.getFirstAncestor(
    (ancestor) => Node.isJsxOpeningElement(ancestor) || Node.isJsxSelfClosingElement(ancestor),
  );
  if (element && (Node.isJsxOpeningElement(element) || Node.isJsxSelfClosingElement(element))) {
    return element.getTagNameNode().getText();
  }
  return null;
}

function isRouterComponentCodeAttribute(attr: JsxAttribute): boolean {
  return (
    attr.getNameNode().getText() === "code" &&
    CATALOG_ROUTER_COMPONENTS.has(tagNameForAttribute(attr) ?? "")
  );
}

function firstForbiddenInValue(
  value: string,
  index: ForbiddenCodeIndex,
  mode: "substring" | "exact-short-substring-long" = "substring",
) {
  const trimmed = value.trim();
  for (const entry of index.values()) {
    if (mode === "exact-short-substring-long" && entry.code.length < 4) {
      if (trimmed === entry.code) return entry;
      continue;
    }
    if (value.includes(entry.code)) return entry;
  }
  return null;
}

function pushViolation(
  violations: RawCodeViolation[],
  kind: RawCodeViolation["kind"],
  sourceFile: SourceFile,
  node: Node,
  value: string,
  entry: ForbiddenCodeProvenance,
): void {
  violations.push({
    kind,
    code: entry.code,
    file: relative(process.cwd(), sourceFile.getFilePath()),
    line: node.getStartLineNumber(),
    detail: value,
    sources: entry.sources,
  });
}

function isFirstArgumentOfRouterCall(lit: StringLiteral): boolean {
  const call = lit.getFirstAncestor((ancestor) => Node.isCallExpression(ancestor));
  if (!call || !Node.isCallExpression(call)) return false;
  const firstArg = call.getArguments()[0];
  if (!firstArg) return false;
  if (firstArg !== lit && !lit.getAncestors().includes(firstArg)) return false;
  const expression = call.getExpression();
  const functionName = Node.isIdentifier(expression)
    ? expression.getText()
    : Node.isPropertyAccessExpression(expression)
      ? expression.getName()
      : null;
  return functionName !== null && CATALOG_ROUTER_FUNCTIONS.has(functionName);
}

function isInAllowedCatalogRouterPosition(lit: StringLiteral): boolean {
  if (isFirstArgumentOfRouterCall(lit)) return true;
  const parent = lit.getParent();
  if (
    Node.isBinaryExpression(parent) &&
    ["===", "!==", "==", "!="].includes(parent.getOperatorToken().getText())
  ) {
    return true;
  }
  const attr = lit.getFirstAncestor((ancestor) => Node.isJsxAttribute(ancestor));
  return attr ? isRouterComponentCodeAttribute(attr) : false;
}

function auditJsxAttribute(
  attr: JsxAttribute,
  sourceFile: SourceFile,
  index: ForbiddenCodeIndex,
  violations: RawCodeViolation[],
): void {
  const attrName = attr.getNameNode().getText();
  if (attrName === "data-testid" || isRouterComponentCodeAttribute(attr)) return;

  const initializer = attr.getInitializer();
  if (!initializer) return;

  if (Node.isStringLiteral(initializer)) {
    const value = initializer.getLiteralValue();
    const entry = firstForbiddenInValue(value, index, "exact-short-substring-long");
    if (entry) pushViolation(violations, "jsx-attribute", sourceFile, attr, value, entry);
    return;
  }

  for (const lit of initializer.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    if (isInAllowedCatalogRouterPosition(lit)) continue;
    const value = lit.getLiteralValue();
    const entry = firstForbiddenInValue(value, index, "exact-short-substring-long");
    if (entry) pushViolation(violations, "jsx-attribute", sourceFile, lit, value, entry);
  }
  for (const lit of initializer.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    const value = lit.getLiteralText();
    const entry = firstForbiddenInValue(value, index, "substring");
    if (entry) pushViolation(violations, "jsx-attribute", sourceFile, lit, value, entry);
  }
}

function auditJsxExpression(
  expression: Node,
  sourceFile: SourceFile,
  index: ForbiddenCodeIndex,
  violations: RawCodeViolation[],
): void {
  if (expression.getFirstAncestor((ancestor) => Node.isJsxAttribute(ancestor))) return;
  for (const lit of expression.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    if (lit.getFirstAncestor((ancestor) => Node.isJsxAttribute(ancestor))) continue;
    if (isInAllowedCatalogRouterPosition(lit)) continue;
    const value = lit.getLiteralValue();
    const entry = firstForbiddenInValue(value, index, "exact-short-substring-long");
    if (entry) pushViolation(violations, "jsx-expression", sourceFile, lit, value, entry);
  }
  for (const lit of expression.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    const value = lit.getLiteralText();
    const entry = firstForbiddenInValue(value, index, "substring");
    if (entry) pushViolation(violations, "jsx-expression", sourceFile, lit, value, entry);
  }
}

export function auditNoRawCodesInSourceFiles(
  paths: readonly string[] | undefined = undefined,
  index: ForbiddenCodeIndex = buildForbiddenCodeIndex(),
): RawCodeViolation[] {
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
    skipAddingFilesFromTsConfig: true,
  });
  const files = paths ?? defaultUiSourceFiles();
  for (const file of files) project.addSourceFileAtPath(file);

  const violations: RawCodeViolation[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    for (const text of sourceFile.getDescendantsOfKind(SyntaxKind.JsxText)) {
      const value = text.getText();
      const entry = firstForbiddenInValue(value, index, "exact-short-substring-long");
      if (entry) pushViolation(violations, "jsx-text", sourceFile, text, value, entry);
    }
    for (const attr of sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      auditJsxAttribute(attr, sourceFile, index, violations);
    }
    for (const expression of sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression)) {
      auditJsxExpression(expression, sourceFile, index, violations);
    }
  }
  return violations;
}

export function discoverStaticAppRoutePaths(): string[] {
  return walkSourceFiles(["app"])
    .filter((path) => path.endsWith("/page.tsx"))
    .filter((path) => !path.startsWith("app/api/"))
    .filter((path) => !path.startsWith("app/admin/dev/"))
    .filter((path) => !path.includes("["))
    .map((path) => {
      const route = path.replace(/^app/, "").replace(/\/page\.tsx$/, "");
      return route === "" ? "/" : route;
    })
    .sort();
}

export async function collectRawCodeLeaksInPage(
  page: Page,
  index: ForbiddenCodeIndex,
): Promise<RuntimeRawCodeLeak[]> {
  const codes = [...index.values()];
  return page.evaluate(
    ({ codeEntries, attrs }) => {
      type Leak = {
        phase: "textContent" | "attribute" | "live-dom-property";
        code: string;
        kind: string;
        value: string;
        sources: string[];
      };
      const leaks: Leak[] = [];
      const check = (
        phase: Leak["phase"],
        kind: string,
        value: string | null | undefined,
      ) => {
        if (!value) return;
        for (const entry of codeEntries) {
          if (value.includes(entry.code)) {
            leaks.push({ phase, kind, value, code: entry.code, sources: entry.sources });
          }
        }
      };
      const walk = (root: Element | ShadowRoot) => {
        const children = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
        for (const node of children) {
          check("textContent", node.tagName.toLowerCase(), node.textContent ?? "");
          for (const attr of attrs) check("attribute", `@${attr}`, node.getAttribute(attr));
          if (node instanceof HTMLInputElement) check("live-dom-property", "input.value", node.value);
          if (node instanceof HTMLTextAreaElement)
            check("live-dom-property", "textarea.value", node.value);
          if (node instanceof HTMLSelectElement) {
            const selected = node.selectedOptions[0];
            check("live-dom-property", "select.selectedOptions[0].text", selected?.text);
            check("live-dom-property", "select.selectedOptions[0].value", selected?.value);
          }
          if ((node as HTMLElement).isContentEditable) {
            check("live-dom-property", "contenteditable.textContent", node.textContent ?? "");
          }
          if (node.shadowRoot) walk(node.shadowRoot);
        }
      };
      if (document.body) walk(document.body);
      return leaks;
    },
    { codeEntries: codes, attrs: USER_VISIBLE_ATTRS },
  );
}
