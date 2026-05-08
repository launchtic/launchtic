// AI assistant settings (BYOK).
//
// Stored in WorkspaceSettings.ai as JSON blob:
//   { provider: "anthropic" | "google", model, apiKeyEnc, enabled }
//
// API key is AES-GCM encrypted at rest using the same crypto helper as SMTP
// passwords / S3 secrets. Never returned to the client in plaintext — only
// presence is exposed (hasApiKey: boolean).
//
// Adding a new provider:
//   1. Append to AiProvider union
//   2. Add entries to AVAILABLE_MODELS with provider tag
//   3. Add factory branch in lib/ai/llm.ts → getModel()

import { db } from "@launchtic/database";
import { encrypt, decrypt } from "../crypto";

export type AiProvider = "anthropic" | "google" | "deepseek";

export type AiSettings = {
  provider: AiProvider;
  model: string;
  apiKeyEnc: string;
  enabled: boolean;
};

export type PublicAiSettings = {
  provider: AiProvider;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
};

// Whitelist — models verified to handle tool calling reliably. Letting users
// pick arbitrary models leads to silent failures (model returns text instead
// of tool_use, assistant appears broken).
export type ModelEntry = {
  id: string;
  label: string;
  provider: AiProvider;
  hint: string;
};

export const AVAILABLE_MODELS: ModelEntry[] = [
  // Anthropic
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Claude Haiku 4.5", hint: "Fast + cheap. Recommended." },
  { id: "claude-sonnet-4-6",         provider: "anthropic", label: "Claude Sonnet 4.6", hint: "Balanced quality + speed." },
  { id: "claude-opus-4-7",           provider: "anthropic", label: "Claude Opus 4.7",   hint: "Most capable. Slower + costly." },
  // Google — Gemini has a generous free tier (15 RPM, 1M tokens/day) for dev.
  { id: "gemini-2.0-flash",          provider: "google",    label: "Gemini 2.0 Flash",  hint: "Free tier · fast · good tool calling." },
  { id: "gemini-2.5-flash",          provider: "google",    label: "Gemini 2.5 Flash",  hint: "Higher quality, free tier." },
  { id: "gemini-2.5-pro",            provider: "google",    label: "Gemini 2.5 Pro",    hint: "Most capable Gemini." },
  // DeepSeek — paid only but ~$0.27/1M cheap. No region restrictions. Good
  // tool-calling on V3 (deepseek-chat). Reasoner skips tools, so we don't list it.
  { id: "deepseek-chat",             provider: "deepseek",  label: "DeepSeek V3 (chat)", hint: "Cheap, no region restrictions, decent tool calling." },
];

export const DEFAULT_PROVIDER: AiProvider = "google";  // Free-tier-friendly default
export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  google:    "gemini-2.0-flash",
  deepseek:  "deepseek-chat",
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
};

export async function getAiSettings(workspaceId: string): Promise<AiSettings | null> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const ai = (settings?.ai as AiSettings | null) ?? null;
  if (!ai?.apiKeyEnc) return null;
  return ai;
}

export async function getPublicAiSettings(workspaceId: string): Promise<PublicAiSettings> {
  const ai = await getAiSettings(workspaceId);
  if (!ai) {
    return {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_PROVIDER],
      enabled: false,
      hasApiKey: false,
    };
  }
  return {
    provider: ai.provider,
    model: ai.model,
    enabled: ai.enabled,
    hasApiKey: true,
  };
}

export async function getDecryptedApiKey(workspaceId: string): Promise<string | null> {
  const ai = await getAiSettings(workspaceId);
  if (!ai?.enabled) return null;
  try {
    return decrypt(ai.apiKeyEnc);
  } catch {
    return null;
  }
}

export async function saveAiSettings(
  workspaceId: string,
  input: { provider: AiProvider; model: string; apiKey?: string; enabled: boolean },
): Promise<PublicAiSettings> {
  const existing = await getAiSettings(workspaceId);

  // Empty apiKey on update = preserve existing. Required on first save OR when
  // changing providers (different APIs, can't reuse the previous key).
  const switchingProvider = existing && existing.provider !== input.provider;

  let apiKeyEnc: string;
  if (input.apiKey && input.apiKey.trim().length > 0) {
    apiKeyEnc = encrypt(input.apiKey.trim());
  } else if (existing?.apiKeyEnc && !switchingProvider) {
    apiKeyEnc = existing.apiKeyEnc;
  } else if (switchingProvider) {
    throw new Error("Provider changed — please re-enter the API key for the new provider.");
  } else {
    throw new Error("API key required");
  }

  const next: AiSettings = {
    provider: input.provider,
    model: input.model,
    apiKeyEnc,
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
