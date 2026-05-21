import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { render, sampleVars } from "@launchtic/email";
import { renderEmailContent, shouldShowLaunchticBadge } from "@launchtic/email/server";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const [template, workspace] = await Promise.all([
      db.emailTemplate.findFirst({ where: { id, workspaceId } }),
      db.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, organization: { select: { plan: true, licenseExpiresAt: true } } },
      }),
    ]);
    if (!template) return err("Template not found", 404);

    const workspaceName = workspace?.name ?? "Your Workspace";
    const vars = { ...sampleVars(), workspace: { name: workspaceName } };
    const subject = render(template.subject, vars);
    const html = await renderEmailContent(template.htmlBody, vars, {
      appendPoweredByBadge: shouldShowLaunchticBadge(
        workspace?.organization?.plan,
        workspace?.organization?.licenseExpiresAt,
      ),
    });

    return ok({ subject, html });
  } catch (error) {
    return handleError(error);
  }
}
