// GET /api/ai/availability
//
// Lightweight "is AI configured & enabled in this workspace" probe for the
// AssistantWidget. Returns only 2 booleans — no provider name, no model,
// no key. Gated by `ai:use` (the same perm as the widget itself), so a
// member who's allowed to USE AI doesn't need `settings:ai:read` (which
// is the admin-level perm for seeing the actual config + API key).
//
// Why this exists as a separate route:
//   /api/ai/settings is the admin endpoint — it returns the full config
//   (including the API key for the settings form) and is gated by
//   `settings:ai:read`. Reusing it from the widget meant ai:use-only users
//   got 403 even though the widget only needs the boolean availability
//   signal. Splitting capability-probe from config-read keeps the
//   permissions honest.

import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getAiSettings } from "../../../../lib/ai/settings";

export async function GET() {
  try {
    const r = await requireAccess("ai:use");
    if (!r.ok) return r.response;
    const ai = await getAiSettings(r.workspaceId);
    return ok({
      hasApiKey: !!ai,           // getAiSettings returns null when key absent
      enabled:   !!ai?.enabled,
    });
  } catch (error) {
    return handleError(error);
  }
}
