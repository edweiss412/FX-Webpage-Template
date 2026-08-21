/**
 * tests/db/_connectionCensusDispositions.ts
 *
 * The disposition registry for the connection census: one row per REPORTED site, edge or
 * acquisition, keyed on the argument's SOURCE TEXT so a site that moves or is re-spelled
 * REDS as stale rather than going quiet. A key that cannot go stale cannot detect a site
 * that moved under it, which is why the maintenance cost is paid on purpose.
 *
 * There is deliberately NO inline comment exemption. The destructive guard deleted its
 * inline form after it self-exempted by coincidence; the census starts without one, and
 * the channel is cheap enough (one line, one file) that rewording a site out of the
 * classifier's view is never the path of least resistance — and it reds the row as stale
 * rather than going silent.
 */

/** Closed union: a kind outside it is a type error, not a new escape hatch. */
export type DispositionKind = "resolver" | "acquisition" | "channel" | "unclassifiable";

export type DispositionRow = {
  /** Repo-relative path of the file the report lives in. */
  file: string;
  /** The report's key text: the connect argument's source, the acquisition's, or the specifier's. */
  site: string;
  /**
   * The 1-based occurrence ordinal of that exact `site` text among the file's reports, in
   * source order. Defaults to 1. Two identical sites in one file are two DISTINCT keys, so
   * the second is never absorbed by the first's row.
   */
  nth?: number;
  kind: DispositionKind;
  /** Why this report is acceptable — checkable by a reviewer reading the named line. */
  reason: string;
};

export const CONNECTION_CENSUS_DISPOSITIONS: readonly DispositionRow[] = [
  {
    file: "tests/admin/step3StateGallery.test.ts",
    site: "galleryDatabaseUrl()",
    kind: "resolver",
    reason:
      "resolvePsqlTarget with requireLocalSupabase and envVars [DATABASE_URL], no remote opt-in (the resolver is devCaptureStaged.ts galleryDatabaseUrl)",
  },
  {
    file: "tests/e2e/helpers/devCaptureStaged.ts",
    site: "galleryDatabaseUrl(dsn)",
    kind: "resolver",
    reason:
      "resolvePsqlTarget with requireLocalSupabase and envVars [DATABASE_URL], no remote opt-in; the three consumers of this helper inherit `dispositioned` and owe nothing",
  },
  {
    file: "tests/help/render.test.ts",
    site: "pathToFileURL(file).href",
    kind: "unclassifiable",
    reason:
      "non-literal dynamic import of a help page module by computed file URL; the target is under app/help and opens no connection",
  },
  {
    file: "tests/parser/fieldNearMiss.test.ts",
    site: "`../../lib/parser/blocks/${stem}.ts`",
    kind: "unclassifiable",
    reason:
      "template dynamic import of a parser block under lib/parser; parser blocks open no connection",
  },
  {
    file: "tests/e2e/helpers/useServerDirectivePlugin.test.ts",
    site: "pathToFileURL(out).href",
    kind: "unclassifiable",
    reason:
      "non-literal dynamic import of a Vite plugin's build output by computed file URL; the output is a fixture bundle and opens no connection",
  },
];
