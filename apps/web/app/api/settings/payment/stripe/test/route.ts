import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../../lib/api";
import { requireAccess } from "../../../../../../lib/permissions";

const schema = z.object({ secretKey: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:payment:read");
    if (!r.ok) return r.response;

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
