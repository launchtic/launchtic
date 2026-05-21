import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../../lib/api";
import { requireAccess } from "../../../../../../lib/permissions";

const schema = z.object({
  clientId:     z.string().min(1),
  clientSecret: z.string().min(1),
  mode:         z.enum(["sandbox", "live"]).default("sandbox"),
});

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:payment:read");
    if (!r.ok) return r.response;

    const { clientId, clientSecret, mode } = schema.parse(await req.json());

    const base = mode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method:  "POST",
      headers: {
        Authorization:  `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      const msg = tokenData?.error_description ?? "Invalid credentials";
      return err(msg, 400);
    }

    return ok({ appId: tokenData.app_id ?? null, scope: tokenData.scope ?? null });
  } catch (error) {
    return handleError(error);
  }
}
