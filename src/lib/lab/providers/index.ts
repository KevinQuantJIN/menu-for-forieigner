import type { LabProviderEvent, LabProviderId, LabRequest } from "../types";
import { geminiAdapter } from "./gemini";
import { createOpenAICompatibleAdapter } from "./openai-compatible";
import { openaiAdapter } from "./openai";

export interface LabProviderAdapter {
  id: LabProviderId;
  streamPage(args: {
    request: LabRequest;
    image: string;
    page: number;
    prompt: string;
  }): AsyncIterable<LabProviderEvent>;
}

export function getProviderAdapter(provider: LabProviderId): LabProviderAdapter {
  if (provider === "gemini") return geminiAdapter;
  if (provider === "openai") return openaiAdapter;
  if (provider === "qwen" || provider === "doubao") {
    return createOpenAICompatibleAdapter(provider);
  }
  throw new Error("invalid_provider");
}
