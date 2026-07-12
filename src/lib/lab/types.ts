import type { Dish } from "@/lib/contract";

export const LAB_PROVIDER_IDS = [
  "gemini",
  "qwen",
  "doubao",
  "openai",
  "minimax",
  "stepfun",
  "glm",
  "deepseek",
] as const;
export type LabProviderId = (typeof LAB_PROVIDER_IDS)[number];
export const LAB_TRANSPORT_IDS = [
  "gemini",
  "dashscope-beijing",
  "dashscope-singapore",
  "dashscope-virginia",
  "ark",
  "minimax",
  "stepfun",
  "openrouter",
] as const;
export type LabTransportId = (typeof LAB_TRANSPORT_IDS)[number];
export type LabInputCapability = "vision" | "text";
export type LabMode = "full_dish" | "extract_only";

export interface ObservedMenuItem {
  page: number;
  ordinal: number;
  categoryCn: string | null;
  nameCn: string;
  price: string | null;
  confidence: number;
  sourceText: string;
}

export interface LabProviderInfo {
  id: LabProviderId;
  label: string;
  configured: boolean;
  capability: LabInputCapability;
  missingEnvironment: string[];
}

export interface LabModelSpec {
  provider: LabProviderId;
  transport: LabTransportId;
  transportLabel: string;
  model: string;
  label: string;
  configured: boolean;
  missingEnvironment: string[];
  modes: LabMode[];
  snapshot: boolean;
}

export interface LabCatalog {
  providers: LabProviderInfo[];
  models: LabModelSpec[];
}

export interface LabRequest {
  provider: LabProviderId;
  transport: LabTransportId;
  model: string;
  mode: LabMode;
  images: string[];
  imageNames: string[];
  systemPrompt?: string;
  userPrompt?: string;
  temperature: number;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export type LabProviderEvent =
  | { type: "headers"; requestId?: string; ms: number }
  | { type: "text"; text: string; ms: number }
  | {
      type: "usage";
      inputTokens?: number;
      outputTokens?: number;
      thinkingTokens?: number;
    }
  | { type: "finish"; reason?: string };

export type LabItem = Dish | ObservedMenuItem;

export interface GoldDishRow {
  menuId: string;
  imageFile: string;
  dishOrder: number;
  nameCn: string;
  price: string;
  note: string;
}

export interface PredictionRow {
  page: number;
  ordinal: number;
  nameCn: string;
  price: string | null;
}

export interface LabScore {
  goldCount: number;
  predictionCount: number;
  matchedNames: number;
  missedCount: number;
  hallucinationCount: number;
  nameRecall: number;
  namePrecision: number;
  priceCompared: number;
  priceMatched: number;
  priceExact: number;
  misses: GoldDishRow[];
  extras: PredictionRow[];
}

export type LabStreamEvent =
  | {
      type: "meta";
      provider: LabProviderId;
      transport: LabTransportId;
      model: string;
      mode: LabMode;
      imageCount: number;
      startedAt: number;
      runtime: "local" | "cloudflare";
      colo: string | null;
      rayId: string | null;
      placement: string | null;
    }
  | { type: "page_started"; page: number; imageName: string; ms: number }
  | { type: "provider_headers"; page: number; ms: number; requestId?: string }
  | { type: "chunk"; page: number; text: string; ms: number }
  | {
      type: "item";
      page: number;
      ordinal: number;
      data: LabItem;
      raw: Record<string, unknown>;
      ms: number;
    }
  | { type: "page_done"; page: number; total: number; ms: number; finishReason?: string }
  | {
      type: "usage";
      page: number;
      inputTokens?: number;
      outputTokens?: number;
      thinkingTokens?: number;
    }
  | { type: "error"; code: string; page?: number; message: string; ms: number }
  | {
      type: "done";
      total: number;
      firstItemMs: number | null;
      totalMs: number;
      partial: boolean;
      pageTotals: Record<number, number>;
    };
