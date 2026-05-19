import type { MessageCatalogEntry } from "@/lib/messages/catalog";

export const HELP_HREF_RE = /^\/help\/.+/;

export function predicate(entry: MessageCatalogEntry): boolean {
  return entry.severity !== "info" && entry.dougFacing !== null;
}

export function allM12FieldsNonNull(entry: MessageCatalogEntry): boolean {
  return (
    entry.title !== null &&
    entry.longExplanation !== null &&
    entry.helpHref !== null
  );
}

export function helpHrefShapeOk(href: string | null): boolean {
  if (href === null) return true;
  return HELP_HREF_RE.test(href);
}

export function contractViolations(entry: MessageCatalogEntry): string[] {
  const violations: string[] = [];

  if (predicate(entry)) {
    if (entry.title === null) violations.push("predicate entry: title is null");
    if (entry.longExplanation === null) {
      violations.push("predicate entry: longExplanation is null");
    }
    if (entry.helpHref === null) {
      violations.push("predicate entry: helpHref is null");
    } else if (!helpHrefShapeOk(entry.helpHref)) {
      violations.push(
        `predicate entry: helpHref must match /help/* (got ${JSON.stringify(entry.helpHref)})`,
      );
    }
    return violations;
  }

  if (entry.title !== null) violations.push("non-predicate entry: title must be null");
  if (entry.longExplanation !== null) {
    violations.push("non-predicate entry: longExplanation must be null");
  }
  if (entry.helpHref !== null) {
    violations.push("non-predicate entry: helpHref must be null");
  }

  return violations;
}
