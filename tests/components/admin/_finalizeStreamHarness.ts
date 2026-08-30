/**
 * Shared NDJSON stream harness for the two suites that drive <FinalizeButton>'s
 * progress surfaces: tests/components/admin/FinalizeButton.test.tsx and
 * tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx.
 *
 * Extracted from the FinalizeButton suite (where it was module-local and not
 * exported) because the Step3 suite holds its running state with a
 * never-resolving fetch and therefore receives NO row events at all — its
 * subline never renders, so any assertion about that subline would pass
 * vacuously against an element that is not there.
 *
 * NOTE the filename: no `.test.` segment, so vitest's BASE_INCLUDE
 * (`tests/**\/*.test.ts`, vitest.projects.ts:34) does not collect this as a
 * suite with zero tests. Same convention as tests/onboarding/_finalizeFake.ts.
 *
 * `allBatchesDone()` deliberately did NOT come along: it closes over the
 * FinalizeButton suite's WIZARD_SESSION_ID. Callers build their own terminal body.
 */

/** A stream the test feeds one event at a time so intermediate progress states can be observed. */
export function controllableNdjson() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const enc = new TextEncoder();
  const response = {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => (k.toLowerCase() === "content-type" ? "application/x-ndjson" : null),
    },
    body: stream,
    json: async () => {
      throw new Error("stream response has no json()");
    },
  } as unknown as Response;
  return {
    response,
    push: (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n")),
    close: () => controller.close(),
    error: (err: unknown) => controller.error(err),
  };
}
