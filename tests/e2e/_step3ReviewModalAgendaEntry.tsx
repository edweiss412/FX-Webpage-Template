/**
 * tests/e2e/_step3ReviewModalAgendaEntry.tsx
 *
 * Browser ENTRY for the agenda containment harness: mounts the REAL
 * <Step3ReviewModal> with a NON-EMPTY `agendaBaseline`, so the REAL
 * <AgendaBreakdown> renders inside the REAL modal chrome — the wrapper
 * (`li.flex.min-w-0`, step3ReviewSections.tsx) whose containment
 * step3-review-modal.agenda.spec.ts measures. Spec
 * `docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md` §4.
 *
 * Like _step3ReviewModalLiveEntry.tsx, this file is NEVER imported by a
 * Playwright spec (its test transform rewrites JSX in every spec-imported .tsx
 * into component-testing payloads). The spec bundles it out of process via
 * tests/e2e/_step3ReviewModalBundle.mjs and serves the bundle over node:http.
 *
 * The extract stub is MANDATORY, not optional: a non-empty baseline
 * unconditionally POSTs (the early return in AgendaBreakdown's effect fires only
 * on an EMPTY baseline), and the schedule block reaches `ready` only after a
 * successful response. Without the stub the harness would sit in `loading`
 * forever and every rect would read zero.
 */
import { createRoot } from "react-dom/client";
import { buildSectionData, modalElement } from "./_step3ReviewModalHarness";
import { AGENDA_EXTRACTION } from "./_agendaFixture";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";

/** The note-only baseline the server builds before extraction resolves: a
 *  `block: null` item per agenda PDF. One item is enough — the containment
 *  question is about ONE row absorbing an unbreakable token, not about a list. */
const AGENDA_BASELINE: AdminAgendaItem[] = [
  { label: "Agenda.pdf", badge: null, href: null, block: null },
];

/** What the extract route returns on success: the same item, now carrying the
 *  normalized extraction. `dropped*` are all zero, so no overflow note and no
 *  "Show all" disclosure render — every fixture session paints directly. */
const READY_ITEMS: AdminAgendaItem[] = [
  {
    label: "Agenda.pdf",
    badge: null,
    href: null,
    block: {
      extraction: AGENDA_EXTRACTION,
      droppedSessions: 0,
      droppedDays: 0,
      droppedTracks: 0,
    },
  },
];

/** Intercepts ONLY a POST to the FULLY-FORMED agenda extract route
 *  (`/api/admin/onboarding/extract-agenda/<wizardSessionId>/<driveFileId>`, both
 *  segments non-empty) and answers the deterministic 200 body. Every OTHER
 *  request passes through to the real fetch — in this dev-server-less harness
 *  such a request fails loudly rather than being silently absorbed.
 *
 *  Method and shape are BOTH checked, not just the prefix (whole-diff review):
 *  a prefix-only stub answers `GET` and answers a truncated path with no
 *  driveFileId, so a regression that changed the verb or dropped a segment would
 *  still receive the ready-state payload and the spec would stay green while the
 *  real route was never exercised in that shape. */
const EXTRACT_ROUTE = /^\/api\/admin\/onboarding\/extract-agenda\/[^/?#]+\/[^/?#]+$/;
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? "");
  const method = (
    init?.method ??
    (typeof input === "object" && input !== null && "method" in input ? input.method : "GET")
  ).toUpperCase();
  // Relative or absolute: resolve, then require BOTH our own origin and the
  // exact path shape. Matching the path alone would stub a same-path request to
  // ANY host, so a regression that pointed extraction at another origin would
  // still be answered here and the spec would stay green (whole-diff review R2).
  let sameOrigin = false;
  let path = "";
  try {
    const resolved = new URL(url, window.location.origin);
    // Credentials in the URL are rejected by native fetch before dispatch
    // ("Request cannot be constructed from a URL that includes credentials"), so
    // a stub that answered them would be MORE permissive than the real thing and
    // would mask that failure (whole-diff review R3). `origin` alone does not
    // carry userinfo, hence the explicit check.
    const credentialed = resolved.username !== "" || resolved.password !== "";
    sameOrigin = !credentialed && resolved.origin === window.location.origin;
    path = resolved.pathname;
  } catch {
    sameOrigin = false;
  }
  if (method === "POST" && sameOrigin && EXTRACT_ROUTE.test(path)) {
    return Promise.resolve(
      new Response(JSON.stringify({ items: READY_ITEMS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return realFetch(input as RequestInfo, init);
}) as typeof window.fetch;

function AgendaHarness() {
  return modalElement(buildSectionData({}, {}, AGENDA_BASELINE), {
    onRequestSetChecked: async () => true,
    onClose: () => {},
  });
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("agenda harness page is missing #root");
createRoot(rootEl).render(<AgendaHarness />);
