import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../../../../lib/api";

const schema = z.object({ secretKey: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { secretKey } = schema.parse(await req.json());

    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message ?? "Invalid secret key";
      return err(msg, 400);
    }

    return ok({
      id:          data.id,
      name:        data.settings?.dashboard?.display_name ?? data.display_name ?? null,
      email:       data.email ?? null,
      country:     data.country ?? null,
      chargesEnabled: data.charges_enabled ?? false,
    });
  } catch (error) {
    return handleError(error);
  }
}
