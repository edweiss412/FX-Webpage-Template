// review/data.jsx — mock fixture (page-shell grounding excerpt).
// Documents the exact happy-path counts + the summary-line copy the header composes.
// The full fixture (crew, rooms, hotels, transport, pack list, warnings) lives in the
// design project and feeds the already-shipped modal; only the shape + counts + copy
// matter for the page-shell feature.

const OPERATOR = { name: "Dana Whitfield", initials: "DW", role: "Owner · FXAV" };

// ── Section model — status: "clean" | "review" (has a warning/data gap). ──
const SECTIONS = [
  { id: "venue",    label: "Venue & location", group: "The show",  count: 5,  status: "clean" },
  { id: "event",    label: "Event details",    group: "The show",  count: 4,  status: "clean" },
  { id: "crew",     label: "Crew",             group: "People",    count: 12, status: "clean" },
  { id: "contacts", label: "Contacts",         group: "People",    count: 4,  status: "review" },
  { id: "schedule", label: "Crew schedule",    group: "Schedule",  count: 4,  status: "review" },
  { id: "agenda",   label: "Agenda",           group: "Schedule",  count: 3,  status: "clean" },
  { id: "hotels",   label: "Hotels",           group: "Logistics", count: 2,  status: "clean" },
  { id: "transport",label: "Transport",        group: "Logistics", count: 7,  status: "clean" },
  { id: "rooms",    label: "Rooms & scope",    group: "Gear",      count: 3,  status: "clean" },
  { id: "packlist", label: "Pack list",        group: "Gear",      count: 6,  status: "clean" },
  { id: "billing",  label: "Billing & docs",   group: "Money",     count: 4,  status: "review" },
];

// The header summary copy (page shell). Composed from real counts in the real code:
//   "<b>3 sheets</b> parsed from your Drive folder. <b>2 are ready</b> to publish —
//    <span class=rev>1 needs a quick look</span> before it goes live.
//    Nothing publishes until you say so."
// flaggedCount for a single sheet's StarCard chip = number of "review"-status sections
// for THAT sheet (mock: 3 → "3 need a look"). In real code this maps to the sheet's
// parse data-quality warning count.

const TOTALS = (() => {
  const review = SECTIONS.filter((s) => s.status === "review").length;
  return { review, clean: SECTIONS.length - review, sections: SECTIONS.length };
})();

window.ReviewData = { OPERATOR, SECTIONS, TOTALS };
