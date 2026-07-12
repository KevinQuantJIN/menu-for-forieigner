import type {
  LabCatalog,
  LabInputCapability,
  LabModelSpec,
  LabProviderId,
  LabProviderInfo,
  LabTransportId,
} from "./types";

const ALL_MODES = ["full_dish", "extract_only"] as const;

type ProviderDefinition = {
  id: LabProviderId;
  label: string;
  capability: LabInputCapability;
};

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    capability: "vision",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen",
    capability: "vision",
  },
  {
    id: "doubao",
    label: "Volcengine Doubao",
    capability: "vision",
  },
  {
    id: "openai",
    label: "OpenAI",
    capability: "vision",
  },
  {
    id: "minimax",
    label: "MiniMax",
    capability: "vision",
  },
  {
    id: "stepfun",
    label: "StepFun",
    capability: "vision",
  },
  {
    id: "glm",
    label: "Zhipu GLM",
    capability: "vision",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    capability: "text",
  },
];

function environmentConfigured(name: string): boolean {
  if (name === "GOOGLE_API_KEY|GEMINI_API_KEY") {
    return Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
  }
  return Boolean(process.env[name]);
}

function providerCatalog(models: LabModelSpec[]): LabProviderInfo[] {
  return PROVIDER_DEFINITIONS.map((provider) => {
    const providerModels = models.filter((model) => model.provider === provider.id);
    const configured = providerModels.some((model) => model.configured);
    return {
      id: provider.id,
      label: provider.label,
      capability: provider.capability,
      configured,
      missingEnvironment: configured
        ? []
        : Array.from(
            new Set(providerModels.flatMap((model) => model.missingEnvironment)),
          ),
    };
  });
}

type ModelDefinition = Omit<LabModelSpec, "configured" | "missingEnvironment"> & {
  requiredEnvironment: string[];
};

function modelDefinitions(): ModelDefinition[] {
  const models: ModelDefinition[] = [
    {
      provider: "gemini",
      transport: "gemini",
      transportLabel: "Google direct",
      model: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash · thinking off",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["GOOGLE_API_KEY|GEMINI_API_KEY"],
    },
    {
      provider: "gemini",
      transport: "gemini",
      transportLabel: "Google direct",
      model: "gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash-Lite",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["GOOGLE_API_KEY|GEMINI_API_KEY"],
    },
    {
      provider: "qwen",
      transport: "dashscope-beijing",
      transportLabel: "DashScope Beijing",
      model: process.env.DASHSCOPE_MODEL || "qwen3.6-flash",
      label: "Qwen 3.6 Flash · Beijing",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["DASHSCOPE_API_KEY"],
    },
    {
      provider: "qwen",
      transport: "dashscope-singapore",
      transportLabel: "DashScope Singapore",
      model: process.env.DASHSCOPE_INTL_MODEL || "qwen3.6-flash",
      label: "Qwen 3.6 Flash · Singapore",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["DASHSCOPE_INTL_API_KEY"],
    },
    {
      provider: "qwen",
      transport: "dashscope-virginia",
      transportLabel: "DashScope Virginia",
      model: process.env.DASHSCOPE_US_MODEL || "qwen3.6-flash",
      label: "Qwen 3.6 Flash · Virginia",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["DASHSCOPE_US_API_KEY"],
    },
    {
      provider: "qwen",
      transport: "openrouter",
      transportLabel: "OpenRouter",
      model: process.env.OPENROUTER_QWEN_MODEL || "qwen/qwen3.6-flash",
      label: "Qwen 3.6 Flash · OpenRouter",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["OPENROUTER_API_KEY"],
    },
    {
      provider: "openai",
      transport: "openrouter",
      transportLabel: "OpenRouter",
      model: process.env.OPENROUTER_OPENAI_MODEL || "openai/gpt-5.4-mini",
      label: "GPT-5.4 mini · OpenRouter",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["OPENROUTER_API_KEY"],
    },
    {
      provider: "minimax",
      transport: "minimax",
      transportLabel: "MiniMax direct",
      model: process.env.MINIMAX_MODEL || "MiniMax-M3",
      label: "MiniMax M3 · thinking off",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["MINIMAX_API_KEY"],
    },
    {
      provider: "minimax",
      transport: "openrouter",
      transportLabel: "OpenRouter",
      model: process.env.OPENROUTER_MINIMAX_MODEL || "minimax/minimax-m3",
      label: "MiniMax M3 · OpenRouter",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["OPENROUTER_API_KEY"],
    },
    {
      provider: "stepfun",
      transport: "stepfun",
      transportLabel: "StepFun direct",
      model: process.env.STEPFUN_MODEL || "step-1o-turbo-vision",
      label: "Step-1o Turbo Vision",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["STEPFUN_API_KEY"],
    },
    {
      provider: "stepfun",
      transport: "openrouter",
      transportLabel: "OpenRouter",
      model: process.env.OPENROUTER_STEPFUN_MODEL || "stepfun/step-3.7-flash",
      label: "Step 3.7 Flash · OpenRouter",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["OPENROUTER_API_KEY"],
    },
    {
      provider: "glm",
      transport: "openrouter",
      transportLabel: "OpenRouter",
      model: process.env.OPENROUTER_GLM_MODEL || "z-ai/glm-5v-turbo",
      label: "GLM-5V Turbo · OpenRouter",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["OPENROUTER_API_KEY"],
    },
    {
      provider: "doubao",
      transport: "ark",
      transportLabel: "Volcengine Ark",
      model: process.env.DOUBAO_MODEL || "doubao-seed-2-0-lite-260428",
      label: "Doubao Seed 2.0 Lite · configured endpoint",
      modes: [...ALL_MODES],
      snapshot: false,
      requiredEnvironment: ["ARK_API_KEY", "ARK_BASE_URL", "DOUBAO_MODEL"],
    },
    {
      provider: "deepseek",
      transport: "openrouter",
      transportLabel: "OpenRouter",
      model:
        process.env.OPENROUTER_DEEPSEEK_MODEL || "deepseek/deepseek-v4-flash",
      label: "DeepSeek V4 Flash · OpenRouter · text-only",
      modes: [],
      snapshot: false,
      requiredEnvironment: ["OPENROUTER_API_KEY"],
    },
    {
      provider: "deepseek",
      transport: "openrouter",
      transportLabel: "OpenRouter",
      model: "deepseek/deepseek-v4-pro",
      label: "DeepSeek V4 Pro · OpenRouter · text-only",
      modes: [],
      snapshot: false,
      requiredEnvironment: ["OPENROUTER_API_KEY"],
    },
  ];

  return models;
}

export function getLabCatalog(): LabCatalog {
  const models = modelDefinitions().map(({ requiredEnvironment, ...model }) => {
    const missingEnvironment = requiredEnvironment.filter(
      (name) => !environmentConfigured(name),
    );
    return {
      ...model,
      configured: missingEnvironment.length === 0,
      missingEnvironment,
    };
  });
  return {
    providers: providerCatalog(models),
    models,
  };
}

export function getLabModel(
  provider: LabProviderId,
  model: string,
  transport?: LabTransportId,
): LabModelSpec | undefined {
  return getLabCatalog().models.find(
    (candidate) =>
      candidate.provider === provider &&
      candidate.model === model &&
      (transport === undefined || candidate.transport === transport),
  );
}
