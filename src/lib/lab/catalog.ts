import type { LabCatalog, LabModelSpec, LabProviderId } from "./types";

const ALL_MODES = ["full_dish", "extract_only"] as const;

function configuredProviders(): Record<LabProviderId, boolean> {
  return {
    gemini: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
    qwen: Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL),
    openai: Boolean(process.env.OPENAI_API_KEY),
    doubao: Boolean(
      process.env.ARK_API_KEY && process.env.ARK_BASE_URL && process.env.DOUBAO_MODEL,
    ),
  };
}

function modelDefinitions(): Omit<LabModelSpec, "configured">[] {
  const models: Omit<LabModelSpec, "configured">[] = [
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash · thinking off",
      modes: [...ALL_MODES],
      snapshot: false,
    },
    {
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash-Lite",
      modes: [...ALL_MODES],
      snapshot: false,
    },
    {
      provider: "qwen",
      model: "qwen3.6-flash-2026-04-16",
      label: "Qwen 3.6 Flash · 2026-04-16",
      modes: [...ALL_MODES],
      snapshot: true,
    },
    {
      provider: "qwen",
      model: "qwen3.7-plus-2026-05-26",
      label: "Qwen 3.7 Plus · 2026-05-26",
      modes: [...ALL_MODES],
      snapshot: true,
    },
    {
      provider: "qwen",
      model: "qwen-vl-ocr",
      label: "Qwen VL OCR",
      modes: ["extract_only"],
      snapshot: false,
    },
    {
      provider: "openai",
      model: "gpt-5.4-mini-2026-03-17",
      label: "GPT-5.4 mini · reasoning none",
      modes: [...ALL_MODES],
      snapshot: true,
    },
  ];

  if (process.env.DOUBAO_MODEL) {
    models.push({
      provider: "doubao",
      model: process.env.DOUBAO_MODEL,
      label: "Doubao Seed 2.0 Lite · configured endpoint",
      modes: [...ALL_MODES],
      snapshot: false,
    });
  }

  return models;
}

export function getLabCatalog(): LabCatalog {
  const configured = configuredProviders();
  return {
    providers: [
      { id: "gemini", label: "Google Gemini", configured: configured.gemini },
      { id: "qwen", label: "Alibaba Qwen", configured: configured.qwen },
      { id: "doubao", label: "Volcengine Doubao", configured: configured.doubao },
      { id: "openai", label: "OpenAI", configured: configured.openai },
    ],
    models: modelDefinitions().map((model) => ({
      ...model,
      configured: configured[model.provider],
    })),
  };
}

export function getLabModel(
  provider: LabProviderId,
  model: string,
): LabModelSpec | undefined {
  return getLabCatalog().models.find(
    (candidate) => candidate.provider === provider && candidate.model === model,
  );
}
