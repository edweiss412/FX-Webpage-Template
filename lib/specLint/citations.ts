import { classifyIntent, relocationHints } from "./citationIntent";
import type { DocModel, InlineSpan } from "./parse";
import type { FileResolver, Finding } from "./types";

export type SpanClass =
  | { kind: "prose" }
  | { kind: "malformed"; reason: string }
  | { kind: "citation"; path: string; bare: boolean; start?: number; end?: number }; // start absent = path-only

const PATH_SAFE = /^[A-Za-z0-9_.,()[\]:/\\-]+$/;
const DRIVE_SHAPE = /^[A-Za-z]:[/\\]/;
const LINE_COORDS = /^([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;
const BARE_EXT_ALLOWLIST =
  /^[^/:]+\.(ts|tsx|js|jsx|mjs|cjs|mdx|md|sql|sh|css|json|yml|yaml|toml|html)$/;

/** Spec §4 path rule: no leading `/`, no backslash, no `.`/`..` segment (split on `/`). */
function pathRuleOk(p: string): boolean {
  if (p === "" || p.startsWith("/") || p.includes("\\")) return false;
  return p.split("/").every((seg) => seg !== "." && seg !== "..");
}

function dottedFinalSegment(s: string): boolean {
  const segs = s.split(/[/\\]/);
  const last = segs[segs.length - 1] ?? "";
  return last.includes(".") && last !== "." && last !== "..";
}

export function classifySpan(content: string): SpanClass {
  if (/\s/.test(content) || content.includes("`")) return { kind: "prose" };
  if (/[*{$]/.test(content)) return { kind: "prose" };

  // Backslash / drive branch (ordered before the colon and path-only forms).
  if (content.includes("\\") || DRIVE_SHAPE.test(content)) {
    const pathSafe = PATH_SAFE.test(content);
    const intent = content.includes(":") || dottedFinalSegment(content);
    if (pathSafe && intent) return { kind: "malformed", reason: "windows-style path" };
    return { kind: "prose" };
  }

  const colonIdx = content.indexOf(":");
  if (colonIdx >= 0) {
    const prefix = content.slice(0, colonIdx);
    const suffix = content.slice(colonIdx + 1);
    const prefixQualifies =
      ((prefix.includes(".") || prefix.includes("/")) && !/^\d+$/.test(prefix)) ||
      prefix === "" ||
      /^[A-Za-z]$/.test(prefix);
    if (!prefixQualifies) return { kind: "prose" };
    if (prefix === "") return { kind: "malformed", reason: "empty path" };
    if (/^[A-Za-z]$/.test(prefix)) return { kind: "malformed", reason: "drive-relative path" };
    const coords = LINE_COORDS.exec(suffix);
    if (!coords) return { kind: "malformed", reason: "invalid line coordinates" };
    if (!pathRuleOk(prefix)) return { kind: "malformed", reason: "illegal path" };
    const start = Number(coords[1]);
    const bare = !prefix.includes("/");
    if (coords[2] !== undefined) {
      return { kind: "citation", path: prefix, bare, start, end: Number(coords[2]) };
    }
    return { kind: "citation", path: prefix, bare, start };
  }

  // path-only, slashed
  if (content.includes("/")) {
    if (!dottedFinalSegment(content)) return { kind: "prose" };
    if (!pathRuleOk(content)) return { kind: "malformed", reason: "illegal path" };
    return { kind: "citation", path: content, bare: false };
  }

  // path-only, bare
  if (BARE_EXT_ALLOWLIST.test(content)) {
    return { kind: "citation", path: content, bare: true };
  }
  return { kind: "prose" };
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$.]*$/;
const CITED_LINE_CAP = 160;
/** Relocation hints per finding (spec §3.4). */
const RELOCATION_CAP = 3;
const NO_RELOCATION = "none of the doc's other cited files";

const basename = (p: string): string => p.split("/").pop() ?? p;

function fail(code: string, span: InlineSpan, message: string, detail?: string): Finding {
  const f: Finding = {
    check: "citations",
    code,
    severity: "fail",
    docLine: span.line,
    column: span.column,
    message,
  };
  if (detail !== undefined) f.detail = detail;
  return f;
}

/**
 * A citation admitted to the intent pass (spec §3.1): resolved, readable,
 * in-range, non-inverted, and sharing its doc line with at least one prose
 * identifier. Classification is DEFERRED to a second pass, because relocation
 * hints range over the document's full resolved set — including files cited
 * only LATER than the citation being classified.
 */
interface PendingIntent {
  span: InlineSpan;
  resolved: string;
  start: number;
  end: number;
  lines: string[];
  ids: string[];
}

export function checkCitations(
  model: DocModel,
  resolver: FileResolver,
  excludedSpans: ReadonlySet<string> = new Set<string>(),
): { findings: Finding[]; resolvedPaths: string[]; candidateSpans: InlineSpan[] } {
  const tracked = resolver.listTrackedFiles();
  const trackedSet = new Set(tracked);
  const byBasename = new Map<string, string[]>();
  for (const p of tracked) {
    const b = basename(p);
    const list = byBasename.get(b);
    if (list) list.push(p);
    else byBasename.set(b, [p]);
  }

  const findings: Finding[] = [];
  const resolvedPaths: string[] = [];
  const candidateSpans: InlineSpan[] = [];
  // in doc order: each citation that resolved to exactly one tracked path
  const anchors: { basename: string; path: string }[] = [];
  const pending: PendingIntent[] = [];

  // One read per distinct path for the whole document: the cited-line checks
  // and the relocation search share it, so a file cited twice — or cited and
  // then searched as a peer — never costs a second read (spec §3.4).
  const fileMemo = new Map<string, string[] | null>();
  const readLines = (path: string): string[] | null => {
    if (!fileMemo.has(path)) fileMemo.set(path, resolver.readFileLines(path));
    return fileMemo.get(path)!;
  };

  for (const span of model.spans) {
    // Span-exact exclusion (spec §5): a `red-target=` capture is a citation the
    // red-contract module validates itself. Skipped BEFORE classification, so
    // it is never a candidate, never resolves, never anchors, never relocates.
    if (excludedSpans.has(`${span.line}:${span.column}`)) continue;
    const cls = classifySpan(span.content);
    if (cls.kind === "prose") continue;
    candidateSpans.push(span);
    if (cls.kind === "malformed") {
      findings.push(
        fail("CITATION_MALFORMED", span, `malformed citation \`${span.content}\` (${cls.reason})`),
      );
      continue;
    }

    // Resolve to a determinate tracked path (or emit a hard finding).
    let resolved: string | null = null;
    if (!cls.bare) {
      if (trackedSet.has(cls.path)) resolved = cls.path;
      else {
        findings.push(fail("CITATION_FILE_MISSING", span, `cited file not tracked: ${cls.path}`));
        continue;
      }
    } else {
      const anchor = [...anchors].reverse().find((a) => a.basename === cls.path);
      const matches = byBasename.get(cls.path) ?? [];
      if (cls.start !== undefined) {
        // line-bearing shorthand: anchor first, then unique basename
        if (anchor) resolved = anchor.path;
        else if (matches.length === 1) resolved = matches[0]!;
        else if (matches.length === 0) {
          findings.push(fail("CITATION_FILE_MISSING", span, `cited file not tracked: ${cls.path}`));
          continue;
        } else {
          findings.push(
            fail(
              "CITATION_AMBIGUOUS",
              span,
              `bare citation ${cls.path} matches multiple tracked files`,
              `candidates: ${matches.join(", ")}`,
            ),
          );
          continue;
        }
      } else {
        // path-only bare: existence proof only
        if (matches.length === 0) {
          findings.push(fail("CITATION_FILE_MISSING", span, `cited file not tracked: ${cls.path}`));
          continue;
        }
        if (matches.length === 1) resolved = matches[0]!;
        // >1 matches: existence proven, path indeterminate — no finding, no resolvedPaths entry
      }
    }

    if (resolved === null) continue;
    resolvedPaths.push(resolved);
    anchors.push({ basename: basename(resolved), path: resolved });

    if (cls.start === undefined) continue;
    // Line checks (spec §4 rule 4) — resolution above is never undone by these.
    const lines = readLines(resolved);
    let hard = false;
    if (lines === null) {
      findings.push(
        fail("CITATION_UNREADABLE", span, `cited file unreadable or a symlink: ${resolved}`),
      );
      hard = true;
    } else {
      const len = lines.length;
      const end = cls.end ?? cls.start;
      if (cls.start > len || end > len) {
        findings.push(
          fail(
            "CITATION_LINE_OUT_OF_RANGE",
            span,
            `cited line beyond EOF in ${resolved}`,
            `file has ${len} lines`,
          ),
        );
        hard = true;
      }
      if (cls.end !== undefined && cls.end < cls.start) {
        findings.push(
          fail("CITATION_RANGE_INVERTED", span, `inverted range in \`${span.content}\``),
        );
        hard = true;
      }
      if (!hard) {
        // Intent classification (advisory) — only with zero hard findings, and
        // only once `resolvedPaths` is complete, so the pass below is deferred.
        const identifiers = model.spans.filter(
          (s) =>
            s.line === span.line &&
            s !== span &&
            IDENTIFIER.test(s.content) &&
            classifySpan(s.content).kind === "prose",
        );
        if (identifiers.length > 0) {
          pending.push({
            span,
            resolved,
            start: cls.start,
            end,
            lines,
            ids: identifiers.map((s) => s.content),
          });
        }
      }
    }
  }

  // ---- pass 2: tier classification and relocation (spec §3.3-§3.5) --------
  const uniqueResolved = [...new Set(resolvedPaths)];
  for (const p of pending) {
    const { tier, enclosing } = classifyIntent(p.lines, p.start, p.end, p.ids);
    if (tier === "clean") continue;
    const enclosingText = enclosing ?? "(none)";
    if (tier === "unmatched") {
      findings.push({
        check: "citations",
        code: "CITATION_SYMBOL_UNMATCHED",
        severity: "advisory",
        docLine: p.span.line,
        column: p.span.column,
        message: `no same-line identifier found near ${p.span.content}`,
        detail: `cited line: ${(p.lines[p.start - 1] ?? "").trim().slice(0, CITED_LINE_CAP)} · enclosing: ${enclosingText}`,
      });
      continue;
    }
    const peers = uniqueResolved
      .filter((path) => path !== p.resolved)
      .map((path) => ({ path, lines: readLines(path) }));
    const hints = relocationHints(p.ids, peers, RELOCATION_CAP);
    findings.push({
      check: "citations",
      code: "CITATION_SYMBOL_ABSENT",
      severity: "advisory",
      docLine: p.span.line,
      column: p.span.column,
      message: `same-line identifiers absent from ${p.resolved}`,
      detail: `enclosing: ${enclosingText} · identifiers: ${p.ids.join(", ")} · found in: ${
        hints.length > 0 ? hints.join(", ") : NO_RELOCATION
      }`,
    });
  }

  return { findings, resolvedPaths, candidateSpans };
}
