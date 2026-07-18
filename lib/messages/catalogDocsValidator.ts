import type { MessageCatalogEntry } from "@/lib/messages/catalog";

export const HELP_HREF_RE = /^\/help\/.+/;

export function predicate(entry: MessageCatalogEntry): boolean {
  // Full-sweep copy plan (Task 6): the blanket `severity !== "info"`
  // exclusion is dropped — severity:"info" admin_alerts codes (e.g.
  // ROLE_FLAGS_NOTICE, SHOW_FIRST_PUBLISHED) now ship the full predicate
  // shape (title/longExplanation/helpHref) and belong on /help/errors like
  // any other Doug-facing code. `audience` is set ONLY on codes used as an
  // admin_alerts code (see the field's doc comment above `MessageCatalogEntry`
  // in ./catalog.ts) — using it here (rather than severity) keeps
  // non-admin-alert severity:"info" copy (e.g. SHEET_PROCESS_FAILED, the
  // mi11_pending_* held-change confirmations, SHOW_ARCHIVED_BY_ADMIN and
  // its siblings) correctly non-predicate: those remain inline
  // helpfulContext-only toasts, never help-page rows.
  return entry.dougFacing !== null && (entry.severity !== "info" || entry.audience !== undefined);
}

export function allM12FieldsNonNull(entry: MessageCatalogEntry): boolean {
  return entry.title !== null && entry.longExplanation !== null && entry.helpHref !== null;
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
