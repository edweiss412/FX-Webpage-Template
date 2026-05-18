import {
  handleWizardPendingIngestionAction,
  type WizardPendingIngestionRouteDeps,
} from "../retry/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function handleWizardPendingIngestionDeferUntilModified(
  _request: Request,
  context: RouteContext,
  routeDeps: WizardPendingIngestionRouteDeps = {},
): Promise<Response> {
  return await handleWizardPendingIngestionAction(context, routeDeps, "defer_until_modified");
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardPendingIngestionDeferUntilModified(request, context);
}
