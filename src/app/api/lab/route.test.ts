import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const image = "data:image/jpeg;base64,AAAA";

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function request(body: unknown, cf = false): Request {
  const req = new Request("http://test/api/lab", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cf ? { "cf-ray": "ray-test", "cf-placement": "local-SHA" } : {}),
    },
    body: JSON.stringify(body),
  });
  if (cf) Object.assign(req, { cf: { colo: "SHA" } });
  return req;
}

const validBody = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  mode: "extract_only",
  images: [image],
  imageNames: ["M001_P01.jpg"],
  temperature: 0,
  maxOutputTokens: 1024,
};

describe("GET /api/lab", () => {
  it("returns provider configuration without secret values", async () => {
    process.env.GOOGLE_API_KEY = "never-return-this-secret";
    const text = await (await GET()).text();
    expect(text).not.toContain("never-return-this-secret");
    expect(JSON.parse(text).providers).toEqual(expect.arrayContaining([expect.objectContaining({ id: "gemini" })]));
  });
});

describe("POST /api/lab", () => {
  it("rejects a model that does not belong to the provider", async () => {
    process.env.OPENAI_API_KEY = "openai-test";
    const res = await POST(request({ ...validBody, provider: "openai" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_model" });
  });

  it("streams meta first and includes Cloudflare runtime metadata", async () => {
    process.env.GOOGLE_API_KEY = "google-test";
    global.fetch = vi.fn(async () =>
      new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"ordinal\\":1,\\"categoryCn\\":null,\\"nameCn\\":\\"米饭\\",\\"price\\":\\"¥2\\",\\"confidence\\":1,\\"sourceText\\":\\"米饭 ¥2\\"}\\n"}]},"finishReason":"STOP"}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as typeof fetch;

    const res = await POST(request(validBody, true));
    const events = (await res.text()).trim().split("\n").map((row) => JSON.parse(row));

    expect(events[0]).toMatchObject({ type: "meta", runtime: "cloudflare", colo: "SHA", rayId: "ray-test" });
    expect(events).toContainEqual(expect.objectContaining({ type: "item", page: 1, ordinal: 1 }));
    expect(events.at(-1)).toMatchObject({ type: "done", total: 1 });
  });
});
