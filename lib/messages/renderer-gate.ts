// Phase G.2 render-side gate for M11 help affordances.
//
// Admin contexts may show Learn more links when a catalog entry has helpHref.
// Crew contexts never show those admin help links. Preview-as-crew is the
// important exception: it lives under /admin, but the previewed content renders
// as crew-visible output.

const ADMIN_ROUTE_RE = /^\/admin(?:\/|$)/;
const HELP_ADMIN_ROUTE_RE = /^\/help\/admin(?:\/|$)/;
const PREVIEW_AS_CREW_ROUTE_RE = /^\/admin\/show\/[^/]+\/preview\/[^/]+(?:\/|$)/;

export type AffordanceContext = {
  route: string;
  helpHref: string | null;
};

export function shouldEmitLearnMore(ctx: AffordanceContext): boolean {
  if (!ctx.helpHref) return false;
  if (PREVIEW_AS_CREW_ROUTE_RE.test(ctx.route)) return false;
  return ADMIN_ROUTE_RE.test(ctx.route) || HELP_ADMIN_ROUTE_RE.test(ctx.route);
}
