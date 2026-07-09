import OpenAI from "openai";
import type { Lang } from "./contract";
import { buildSystemPrompt } from "./prompt";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export async function* dashscopeStream(image: string, lang: Lang, signal?: AbortSignal): AsyncGenerator<string> {
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: process.env.DASHSCOPE_BASE_URL ?? DEFAULT_BASE_URL,
  });
  const stream = await client.chat.completions.create(
    {
      model: process.env.MENULENS_MODEL ?? "qwen-vl-max",
      stream: true,
      messages: [
        { role: "system", content: buildSystemPrompt(lang) },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            { type: "text", text: "Analyze this menu photo." },
          ],
        },
      ],
    },
    { signal },
  );
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content ?? "";
  }
}
