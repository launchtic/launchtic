// AI assistant settings (BYOK).
//
// Stored in WorkspaceSettings.ai as JSON blob:
//   { provider: "anthropic" | "google" | "deepseek" | "openai", model, apiKey, enabled }
//
// API key stored as plaintext — matches the Payment Settings pattern
// (Stripe.secretKey, PayPal.clientSecret are also plaintext). For self-host
// the operator controls the DB; encryption at this layer was security
// theater. If the DB is compromised the encryption key (env-derived) is too.
//
// The model catalog lives in ./models (client-safe, shared with the panel).

import { db } from "@launchtic/database";
import { maskInDemo } from "../demo";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER,
  RETIRED_MODEL_REPLACEMENTS,
  type AiProvider,
} from "./models";

export type { AiProvider } from "./models";

export type AiSettings = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  enabled: boolean;
};

export type PublicAiSettings = {
  provider: AiProvider;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiKey: string;
};

export const PROVIDER_LABELS: Record<AiProvider, { label: string; keyHint: string; consoleUrl: string }> = {
  anthropic: {
    label: "Anthropic Claude",
    keyHint: "sk-ant-...",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  google: {
    label: "Google Gemini (free tier)",
    keyHint: "AIzaSy...",
    consoleUrl: "https://aistudio.google.com/apikey",
  },
  deepseek: {
    label: "DeepSeek",
    keyHint: "sk-...",
    consoleUrl: "https://platform.deepseek.com/api_keys",
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    keyHint: "sk-...",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
};

export async function getAiSettings(workspaceId: string): Promise<AiSettings | null> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const ai = (settings?.ai as AiSettings | null) ?? null;
  if (!ai?.apiKey) return null;
  const replacement = RETIRED_MODEL_REPLACEMENTS[ai.model];
  return replacement ? { ...ai, model: replacement } : ai;
}

export async function getPublicAiSettings(workspaceId: string): Promise<PublicAiSettings> {
  const ai = await getAiSettings(workspaceId);
  if (!ai) {
    return {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_PROVIDER],
      enabled: false,
      hasApiKey: false,
      apiKey: "",
    };
  }
  return {
    provider: ai.provider,
    model: ai.model,
    enabled: ai.enabled,
    hasApiKey: true,
    // Masked in the public demo so visitors (sharing the owner account) can't
    // read the BYOK key. Actual LLM calls use getApiKey() with the real value.
    apiKey: maskInDemo(ai.apiKey),
  };
}

// Returns the raw API key for LLM calls. Null when key is missing or
// assistant is disabled — callers should treat as "AI unavailable".
export async function getApiKey(workspaceId: string): Promise<string | null> {
  const ai = await getAiSettings(workspaceId);
  if (!ai?.enabled) return null;
  return ai.apiKey || null;
}

export async function saveAiSettings(
  workspaceId: string,
  input: { provider: AiProvider; model: string; apiKey?: string; enabled: boolean },
): Promise<PublicAiSettings> {
  const existing = await getAiSettings(workspaceId);

  // Empty apiKey on update = preserve existing. Required on first save OR when
  // changing providers (different APIs, can't reuse the previous key).
  const switchingProvider = existing && existing.provider !== input.provider;

  let apiKey: string;
  if (input.apiKey && input.apiKey.trim().length > 0) {
    apiKey = input.apiKey.trim();
  } else if (existing?.apiKey && !switchingProvider) {
    apiKey = existing.apiKey;
  } else if (switchingProvider) {
    throw new Error("Provider changed — please re-enter the API key for the new provider.");
  } else {
    throw new Error("API key required");
  }

  const next: AiSettings = {
    provider: input.provider,
    model: input.model,
    apiKey,
    enabled: input.enabled,
  };

  await db.workspaceSettings.upsert({
    where: { workspaceId },
    create: { workspaceId, ai: next as any },
    update: { ai: next as any },
  });

  return getPublicAiSettings(workspaceId);
}

export async function deleteAiSettings(workspaceId: string): Promise<void> {
  await db.workspaceSettings.update({
    where: { workspaceId },
    data: { ai: null as any },
  }).catch(() => {});
}
