import {
  handleWizardPendingIngestionAction,
  type WizardPendingIngestionRouteDeps,
} from "../retry/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function handleWizardPendingIngestionPermanentIgnore(
  _request: Request,
  context: RouteContext,
  routeDeps: WizardPendingIngestionRouteDeps = {},
): Promise<Response> {
  return await handleWizardPendingIngestionAction(context, routeDeps, "permanent_ignore");
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardPendingIngestionPermanentIgnore(request, context);
}
