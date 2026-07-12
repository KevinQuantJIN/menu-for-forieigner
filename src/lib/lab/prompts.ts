import { buildSystemPrompt } from "@/lib/prompt";
import type { LabMode } from "./types";

export interface LabPrompt {
  systemPrompt: string;
  userPrompt: string;
}

const EXTRACT_SYSTEM_PROMPT = `Read one Chinese restaurant menu image page.
Do not translate, explain, enrich, or infer ingredients.
Output one compact JSON object per line (NDJSON), in visual order.
Output only readable menu items; never invent missing text.
Each line must use exactly these keys:
{"ordinal":integer,"categoryCn":string|null,"nameCn":string,"price":string|null,"confidence":number,"sourceText":string}
Copy nameCn and price exactly as printed. confidence is 0 to 1. sourceText is the visible menu line.`;

export function getLabPrompt(mode: LabMode): LabPrompt {
  if (mode === "extract_only") {
    return {
      systemPrompt: EXTRACT_SYSTEM_PROMPT,
      userPrompt: "Extract every readable dish on this page as NDJSON. Output no other text.",
    };
  }
  return {
    systemPrompt: buildSystemPrompt(),
    userPrompt:
      "Analyze this single menu photo page. Output every readable dish as NDJSON in English per the system rules.",
  };
}
