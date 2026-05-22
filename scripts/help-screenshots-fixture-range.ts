import { readFileSync } from "node:fs";

export type FixtureDateRange = {
  earliest: Date;
  latest: Date;
};

const ISO_DATE_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
const US_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;

function dateAtUtcMidnight(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function extractInfoSection(src: string): string {
  const match = src.match(/##[^\n]*\bINFO\b[\s\S]*?(?=\n##\s|\n$)/i);
  return match?.[0] ?? src;
}

function extractDatesSection(info: string): string {
  const lines = info.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === "DATES" || /^\|\s*DATES\s*\|/i.test(trimmed);
  });
  if (startIndex === -1) {
    return info;
  }

  const startLine = (lines[startIndex] ?? "").trim();
  if (startLine.startsWith("|")) {
    const tableLines: string[] = [];
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (tableLines.length > 0 && line.trim() === "") {
        break;
      }
      if (!line.trim().startsWith("|")) {
        break;
      }
      tableLines.push(line);
    }
    return tableLines.join("\n");
  }

  const sectionLines: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (
      index > startIndex &&
      /^(CREW|HOTEL|TRANSPORTATION|DRESS|DOCUMENT FOLDER LINK|AGENDA LINK|EVENT DETAILS)\b/i.test(
        line.trim(),
      )
    ) {
      break;
    }
    sectionLines.push(line);
  }
  return sectionLines.join("\n");
}

function parseYear(rawYear: string): number {
  return rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
}

function collectDates(src: string): Date[] {
  const dates: Date[] = [];

  for (const match of src.matchAll(ISO_DATE_RE)) {
    const year = match[1];
    const month = match[2];
    const day = match[3];
    if (!year || !month || !day) continue;
    const date = dateAtUtcMidnight(Number(year), Number(month), Number(day));
    if (date) dates.push(date);
  }

  for (const match of src.matchAll(US_DATE_RE)) {
    const month = match[1];
    const day = match[2];
    const year = match[3];
    if (!month || !day || !year) continue;
    const date = dateAtUtcMidnight(parseYear(year), Number(month), Number(day));
    if (date) dates.push(date);
  }

  return dates;
}

export function parseFixtureDateRange(src: string): FixtureDateRange {
  const info = extractInfoSection(src);
  const datesSection = extractDatesSection(info);
  const dates = collectDates(datesSection).sort((a, b) => a.getTime() - b.getTime());

  const earliest = dates[0];
  const latest = dates[dates.length - 1];

  if (!earliest || !latest) {
    throw new Error("No INFO-tab DATES rows found in fixture source");
  }

  return {
    earliest,
    latest,
  };
}

export function parseFixtureDateRangeFromPath(path: string): FixtureDateRange {
  return parseFixtureDateRange(readFileSync(path, "utf8"));
}
