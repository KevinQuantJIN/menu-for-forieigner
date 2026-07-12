import type { LabProviderEvent, LabProviderId, LabRequest } from "../types";
import { geminiAdapter } from "./gemini";
import { createOpenAICompatibleAdapter } from "./openai-compatible";

export interface LabProviderAdapter {
  id: LabProviderId;
  streamPage(args: {
    request: LabRequest;
    image: string;
    page: number;
    prompt: string;
  }): AsyncIterable<LabProviderEvent>;
}

export function getProviderAdapter(
  request: Pick<LabRequest, "provider" | "transport">,
): LabProviderAdapter {
  const { provider, transport } = request;
  if (provider === "gemini" && transport === "gemini") return geminiAdapter;
  if (
    provider === "openai" ||
    provider === "qwen" ||
    provider === "doubao" ||
    provider === "minimax" ||
    provider === "stepfun" ||
    provider === "glm"
  ) {
    return createOpenAICompatibleAdapter(provider, transport);
  }
  throw new Error("invalid_provider");
}
