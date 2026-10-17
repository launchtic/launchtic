// Model catalog for the AI assistant (BYOK). Client-safe — no DB imports — so
// the settings panel and the server share one list.
//
// Whitelist: models verified to handle tool calling + structured output
// reliably. Letting users pick arbitrary models leads to silent failures
// (model returns text instead of a tool call, assistant appears broken).
//
// Adding a new provider:
//   1. Append to AiProvider union
//   2. Add entries to AVAILABLE_MODELS with provider tag
//   3. Add factory branch in lib/ai/llm.ts → getModel()

export type AiProvider = "anthropic" | "google" | "deepseek" | "openai";

export type ModelEntry = {
  id: string;
  label: string;
  provider: AiProvider;
  hint: string;
};

export const AVAILABLE_MODELS: ModelEntry[] = [
  // Anthropic
  { id: "claude-haiku-5-5",  provider: "anthropic", label: "Claude Haiku 5.5",  hint: "Fast + very cheap. Recommended." },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", hint: "Balanced quality + speed." },
  { id: "claude-opus-5-5",   provider: "anthropic", label: "Claude Opus 5.5",   hint: "Most capable Opus. Slower + costlier." },
  { id: "claude-fable-5-1",  provider: "anthropic", label: "Claude Fable 5.1",  hint: "Anthropic's most capable. Slowest + most expensive." },
  // Google
  { id: "gemini-3.5-flash-lite", provider: "google", label: "Gemini 3.5 Flash-Lite", hint: "Fast + cheap. Recommended." },
  { id: "gemini-3.8-flash",      provider: "google", label: "Gemini 3.8 Flash",      hint: "Most intelligent Flash model." },
  { id: "gemini-4-argon",        provider: "google", label: "Gemini 4 Argon",        hint: "Flagship reasoning model. Slower + costlier." },
  // DeepSeek
  { id: "deepseek-v4-flash", provider: "deepseek", label: "DeepSeek V4 Flash", hint: "Cheapest. No region restrictions. Recommended." },
  { id: "deepseek-v4-pro",   provider: "deepseek", label: "DeepSeek V4 Pro",   hint: "Stronger reasoning, still low cost." },
  // OpenAI
  { id: "gpt-6-luna",    provider: "openai", label: "GPT-6 Luna",    hint: "Fast + cheap. Recommended." },
  { id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", hint: "Balanced quality + speed." },
  { id: "gpt-6-sol",     provider: "openai", label: "GPT-6 Sol",     hint: "Most capable GPT. Slower + costlier." },
  { id: "gpt-4o-mini",   provider: "openai", label: "GPT-4o mini",   hint: "Legacy — OpenAI retires it Jan 14, 2027." },
  { id: "gpt-4o",        provider: "openai", label: "GPT-4o",        hint: "Legacy — OpenAI retires it Jan 14, 2027." },
];

export const DEFAULT_PROVIDER: AiProvider = "google";
export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  anthropic: "claude-haiku-5-5",
  google:    "gemini-3.5-flash-lite",
  deepseek:  "deepseek-v4-flash",
  openai:    "gpt-6-luna",
};

// Saved models the provider has shut down or announced for shutdown, mapped
// to their successor so existing workspaces keep working without a re-save.
// Models that still work are left alone — switching them silently would
// change what the operator pays.
export const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  "gemini-2.0-flash":      "gemini-3.5-flash-lite",
  "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
  "deepseek-chat":         "deepseek-v4-flash",
  "deepseek-reasoner":     "deepseek-v4-flash",
};
