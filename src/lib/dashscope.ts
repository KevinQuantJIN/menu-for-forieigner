import OpenAI from "openai";
import { buildSystemPrompt } from "./prompt";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export async function* dashscopeStream(images: string[], signal?: AbortSignal): AsyncGenerator<string> {
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: process.env.DASHSCOPE_BASE_URL ?? DEFAULT_BASE_URL,
  });
  const n = images.length;
  const stream = await client.chat.completions.create(
    {
      model: process.env.MENULENS_MODEL ?? "qwen-vl-max",
      stream: true,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            ...images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
            {
              type: "text" as const,
              text:
                n === 1
                  ? "Analyze this menu photo. Output NDJSON dishes in English per the system rules."
                  : `Analyze these ${n} menu photos as one ordered multi-page menu (image 1 first). Output NDJSON dishes in English per the system rules.`,
            },
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
