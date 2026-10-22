// Provider-agnostic model factory via the Vercel AI SDK — used by the in-app
// AI features (e.g. page copy rewrite). Swapping providers is one setting.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AiSettings } from "./settings";

export function getModel(settings: AiSettings, apiKey: string): LanguageModel {
  switch (settings.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(settings.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(settings.model);
    case "deepseek":
      return createDeepSeek({ apiKey })(settings.model);
    case "openai":
      return createOpenAI({ apiKey })(settings.model);
    default:
      throw new Error(`Unknown provider: ${(settings as any).provider}`);
  }
}
