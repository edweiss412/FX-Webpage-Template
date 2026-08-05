export type FilingSection = {
  stage: string;
  /** The `<n>` in `## <stage> — <n> rounds`, or null when absent/unparseable. */
  declaredRounds: number | null;
  hasExamined: boolean;
  hasDisposition: boolean;
  citedIds: string[];
  /** 1-indexed line of the heading, for a message that names its location. */
  line: number;
};

// `—` (em dash) is the documented separator; `-` and `--` are tolerated so a
// filing is not rejected over a keyboard, which would be prose-quality
// gatekeeping (spec §7.2).
const HEADING = /^##\s+(\S+)\s*(?:—|--|-)\s*(\d+)\s+rounds?\s*$/;
const HEADING_LOOSE = /^##\s+(\S+)\b/;
const DISPOSITIONS = ["Mechanizable", "Judgment", "Infra"] as const;
/**
 * Narrow on purpose (plan R2). DEFERRED entries carry bare SHOUTY ids, and a
 * recognizer wide enough to catch them would classify ordinary prose as a
 * citation. An unrecognized token is not a citation: it is neither checked nor
 * rejected - a conservative under-check, recorded as a documented limit.
 */
const CITED_ID = /\b(?:BL|DEF)-[A-Z0-9][A-Z0-9-]*\b/g;

export function parseFiling(md: string): FilingSection[] {
  const lines = md.split("\n");
  const sections: FilingSection[] = [];
  let current: FilingSection | null = null;
  let body: string[] = [];

  const close = (): void => {
    if (!current) return;
    const text = body.join("\n");
    current.hasExamined = /^\s*\*\*Examined:\*\*/m.test(text);
    current.hasDisposition = DISPOSITIONS.some((d) =>
      new RegExp(`^\\s*\\*\\*${d}:\\*\\*`, "m").test(text),
    );
    current.citedIds = [...new Set(text.match(CITED_ID) ?? [])];
    sections.push(current);
    current = null;
    body = [];
  };

  lines.forEach((line, i) => {
    const strict = HEADING.exec(line);
    const loose = HEADING_LOOSE.exec(line);
    if (strict) {
      close();
      current = {
        stage: strict[1] as string,
        declaredRounds: Number(strict[2]),
        hasExamined: false,
        hasDisposition: false,
        citedIds: [],
        line: i + 1,
      };
    } else if (loose) {
      close();
      current = {
        stage: loose[1] as string,
        declaredRounds: null,
        hasExamined: false,
        hasDisposition: false,
        citedIds: [],
        line: i + 1,
      };
    } else if (current) {
      body.push(line);
    }
  });
  close();
  return sections;
}
