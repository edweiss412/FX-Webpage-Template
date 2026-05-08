/**
 * app/admin/dev/page.tsx (M3 Task 3.1)
 *
 * The /admin/dev panel. Server Component — requireAdmin() runs as the very
 * first line per AGENTS.md §1.6 and spec §7.3. The panel is intentionally
 * the smallest viable surface for the §15 demo flow:
 *   - Fixture picker (select from fixtures/shows/raw/*.md)
 *   - "Parse and stage" button → calls parseAndStage server action
 *   - Parse panel rendering parse_outcome, triggered MIs, parse_warnings,
 *     raw_unrecognized chunks (each with a "Report this" button), and the
 *     enrichment summary (reel pin, linked-folder count, embedded-image count)
 *   - Reset button → calls resetDevSchema server action
 *
 * Per the handoff §5 exemption, MI codes are surfaced raw on this admin
 * surface — the no-raw-codes invariant exists to protect end-user crew
 * pages, which M3 doesn't touch. The dev panel intentionally surfaces raw MI
 * codes per §15 demo wording.
 *
 * UI is functional, not styled — M4 owns DESIGN.md and tile chrome. The
 * panel uses semantic HTML + minimal Tailwind utility classes for layout.
 *
 * PERF: a `?fixture=...` page load triggers public.is_admin() three times —
 * once at page render (requireAdmin call below), once inside listFixtures()
 * (its requireAdmin call), and once inside getStagedResult() (its requireAdmin
 * call). The form-submission POST adds one more (parseAndStageFormAction's
 * gate, plus the inner parseAndStage's gate = 2 per submit). Accepted as
 * defense-in-depth per AGENTS.md §1.6: every Server Action MUST gate
 * independently of its caller, since X.3's chain audit catches missing gates
 * as a CI failure. Acceptable cost on a low-volume admin surface; M5 can
 * revisit (e.g. a request-scoped admin cache or a cookie-bound server-context
 * value) when admin volume grows.
 */
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  getStagedResult,
  listFixtures,
  parseAndStageFormAction,
  resetDevSchemaFormAction,
  type ParseAndStageResult,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Page reads `?fixture=` and renders the previously-staged result for that
 * fixture from dev.pending_syncs / dev.pending_ingestions via getStagedResult
 * (a SELECT). The page NEVER invokes parseAndStage from the render path —
 * the parsing pipeline only fires from the POST Server Action submitted by
 * <form action={parseAndStageFormAction}>. This makes GET /admin/dev?fixture=...
 * a safe, side-effect-free request per HTTP semantics, fixing Codex Round 1
 * Finding 2 (browser prefetch / reload / cross-site link could otherwise
 * trigger Phase-1 writes).
 */
export default async function AdminDevPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  // FIRST LINE — admin-only gate (404 if build-time flag off, 403 if not admin).
  await requireAdmin();

  const params = await searchParams;
  const fixtures = await listFixtures();
  const selected = params.fixture ?? "";

  // Read-only SELECT — never invokes the parse pipeline. If the user just
  // submitted the form, parseAndStageFormAction has already redirected here
  // with ?fixture=<filename>; getStagedResult reads the row that just landed.
  let result: ParseAndStageResult | null = null;
  let lookupError: string | null = null;
  if (selected) {
    try {
      result = await getStagedResult(selected);
    } catch (err) {
      lookupError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">/admin/dev — fixture upload-test</h1>
      <p className="mb-4 text-gray-700">
        Real Phase-1 write-through against the <code>dev.*</code> schema. Pick a fixture and stage
        it; rows land in <code>dev.pending_syncs</code> / <code>dev.pending_ingestions</code>.
        Production tables in <code>public.*</code> are never touched.
      </p>

      <FixturePickerForm fixtures={fixtures} selected={selected} />
      <ResetForm />

      {lookupError ? (
        <section className="mt-6 border-2 border-red-500 p-3" data-testid="action-error">
          <h2 className="font-bold text-red-700">getStagedResult error</h2>
          <pre className="whitespace-pre-wrap">{lookupError}</pre>
        </section>
      ) : null}

      {selected && !result && !lookupError ? (
        <section className="mt-6 border border-yellow-500 p-3" data-testid="no-staged-result">
          <p>
            No staged result for <code>{selected}</code> in <code>dev.*</code>. Submit the form
            above to parse and stage it.
          </p>
        </section>
      ) : null}

      {result ? <ParsePanel result={result} /> : null}
    </main>
  );
}

function FixturePickerForm({ fixtures, selected }: { fixtures: string[]; selected: string }) {
  // POST-only Server Action submission. The form has no method=... attribute
  // because Next.js's <form action={ServerAction}> always submits as POST.
  // GET requests to /admin/dev?fixture=... are now safe (read-only via
  // getStagedResult); the parsing pipeline can only fire from this form.
  return (
    <form action={parseAndStageFormAction} className="flex gap-3 items-end mb-3">
      <label className="flex flex-col">
        <span className="text-xs text-gray-600 mb-1">Fixture</span>
        <select
          name="fixture"
          defaultValue={selected}
          data-testid="fixture-picker"
          className="border px-2 py-1 min-w-[24rem]"
        >
          <option value="">— select a fixture —</option>
          {fixtures.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        data-testid="parse-and-stage"
        className="border px-3 py-1 bg-blue-600 text-white"
      >
        Parse and stage
      </button>
    </form>
  );
}

function ResetForm() {
  return (
    <form action={resetDevSchemaFormAction} className="mb-6">
      <button
        type="submit"
        data-testid="reset-dev-schema"
        className="border px-3 py-1 bg-yellow-600 text-white"
      >
        Reset dev schema (TRUNCATE dev.* CASCADE)
      </button>
    </form>
  );
}

function ParsePanel({ result }: { result: ParseAndStageResult }) {
  return (
    <section className="border-2 border-gray-700 p-4" data-testid="parse-panel">
      <h2 className="font-bold text-lg mb-2">Parse panel</h2>

      <dl className="grid grid-cols-[12rem_1fr] gap-y-1 mb-4">
        <dt>Filename:</dt>
        <dd>{result.filename}</dd>
        <dt>Drive file ID (synthetic):</dt>
        <dd>
          <code>{result.driveFileId}</code>
        </dd>
        <dt>Outcome:</dt>
        <dd data-testid="parse-outcome" className="font-bold">
          {outcomeLabel(result.outcome)}
        </dd>
        <dt>Staging row:</dt>
        <dd data-testid="staging-row">
          {result.staging ? `${result.staging.kind} (id=${result.staging.id})` : "— none —"}
        </dd>
      </dl>

      <EnrichmentSummary result={result} />
      <TriggeredItems result={result} />
      <HardFailCodes result={result} />
      <ParseWarnings result={result} />
      <RawUnrecognized result={result} />
    </section>
  );
}

function outcomeLabel(outcome: ParseAndStageResult["outcome"]): string {
  if (outcome === "hard_fail") return "hard fail";
  if (outcome === "stage") return "stage";
  return "auto-apply";
}

function EnrichmentSummary({ result }: { result: ParseAndStageResult }) {
  return (
    <section className="border-l-4 border-blue-400 pl-3 mb-3" data-testid="enrichment-summary">
      <h3 className="font-bold">Enrichment summary</h3>
      <p className="text-xs text-gray-600" data-testid="enrichment-mock-marker">
        Drive client: <code>{result.mockMarker}</code> (mockDriveClient)
      </p>
      <ul className="ml-4 list-disc">
        <li data-testid="enriched-reel-pin">
          Reel pin:{" "}
          {result.enrichment.reelPin
            ? `${result.enrichment.reelPin.driveFileId} @ rev ${result.enrichment.reelPin.headRevisionId}`
            : "— no reel URL parsed (parser found no Drive link) —"}
        </li>
        <li data-testid="enriched-linked-folder-items">
          Linked-folder items: {result.enrichment.linkedFolderItemCount}
        </li>
        <li data-testid="enriched-embedded-images">
          Embedded images: {result.enrichment.embeddedImageCount} (M3 always 0; M7 wires real
          Sheets-API capture)
        </li>
      </ul>
    </section>
  );
}

function TriggeredItems({ result }: { result: ParseAndStageResult }) {
  return (
    <section className="mb-3" data-testid="triggered-items">
      <h3 className="font-bold">Triggered review items ({result.triggeredItems.length})</h3>
      {result.triggeredItems.length === 0 ? (
        <p className="text-xs text-gray-600">— none —</p>
      ) : (
        <ul className="ml-4 list-disc">
          {result.triggeredItems.map((item) => (
            <li key={item.id} data-testid="triggered-mi">
              <code>{item.invariant}</code> — id <code>{item.id}</code>
              {item.details ? (
                <pre className="text-xs whitespace-pre-wrap ml-4">
                  {JSON.stringify(item.details, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HardFailCodes({ result }: { result: ParseAndStageResult }) {
  if (result.hardFailCodes.length === 0) return null;
  return (
    <section className="mb-3 border-l-4 border-red-500 pl-3">
      <h3 className="font-bold text-red-700">Hard-fail codes</h3>
      <ul className="ml-4 list-disc">
        {result.hardFailCodes.map((code) => (
          <li key={code} data-testid="hard-fail-code">
            <code>{code}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ParseWarnings({ result }: { result: ParseAndStageResult }) {
  return (
    <section className="mb-3" data-testid="parse-warnings">
      <h3 className="font-bold">Parse warnings ({result.parseWarnings.length})</h3>
      {result.parseWarnings.length === 0 ? (
        <p className="text-xs text-gray-600">— none —</p>
      ) : (
        <ul className="ml-4 list-disc">
          {result.parseWarnings.map((w, idx) => (
            <li key={`${w.code}-${idx}`} data-testid="parse-warning-item">
              <span className="font-bold">{w.severity}</span>: <code>{w.code}</code> — {w.message}
              {w.rawSnippet ? (
                <pre className="text-xs whitespace-pre-wrap ml-4">{w.rawSnippet}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RawUnrecognized({ result }: { result: ParseAndStageResult }) {
  return (
    <section className="mb-3" data-testid="raw-unrecognized">
      <h3 className="font-bold">Raw unrecognized chunks ({result.rawUnrecognized.length})</h3>
      {result.rawUnrecognized.length === 0 ? (
        <p className="text-xs text-gray-600">— none —</p>
      ) : (
        <ul className="ml-4 list-disc">
          {result.rawUnrecognized.map((chunk, idx) => (
            <li key={`${chunk.block}-${chunk.key}-${idx}`} data-testid="raw-unrecognized-item">
              <span className="font-bold">{chunk.block}</span> / <code>{chunk.key}</code>:{" "}
              <pre className="text-xs whitespace-pre-wrap ml-4 inline">{chunk.value}</pre>
              <ReportSnippetButton snippet={`${chunk.block}/${chunk.key}: ${chunk.value}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportSnippetButton({ snippet }: { snippet: string }) {
  // M8 wires the actual /api/report endpoint. For M3 we render the button
  // and pre-fill the snippet so the §15 demo flow works; the endpoint is a
  // placeholder until M8 lands.
  return (
    <form action="/api/report" method="post" className="inline ml-2">
      <input type="hidden" name="snippet" value={snippet} />
      <input type="hidden" name="source" value="admin-dev/raw-unrecognized" />
      {/* TODO(M8): wire to /api/report once endpoint exists; the form action
          above is a placeholder destination. The DOM and pre-fill MUST stay
          for the §15 demo flow + Playwright test that asserts the button
          renders with [data-testid=report-snippet-button]. */}
      <button
        type="submit"
        data-testid="report-snippet-button"
        className="text-xs underline text-blue-700"
      >
        Report this
      </button>
    </form>
  );
}
