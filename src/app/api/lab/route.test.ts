import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const image = "data:image/jpeg;base64,AAAA";

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

beforeEach(() => {
  delete process.env.LAB_ACCESS_TOKEN;
});

function request(body: unknown, cf = false, attachCf = true, token?: string): Request {
  const req = new Request("http://test/api/lab", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cf ? { "cf-ray": "ray-test", "cf-placement": "local-SHA" } : {}),
    },
    body: JSON.stringify(body),
  });
  if (cf && attachCf) Object.assign(req, { cf: { colo: "SHA" } });
  return req;
}

const validBody = {
  provider: "gemini",
  transport: "gemini",
  model: "gemini-2.5-flash",
  mode: "extract_only",
  images: [image],
  imageNames: ["M001_P01.jpg"],
  temperature: 0,
  maxOutputTokens: 1024,
};

describe("GET /api/lab", () => {
  it("returns all eight providers without secret values", async () => {
    process.env.GOOGLE_API_KEY = "never-return-this-secret";
    const text = await (await GET()).text();
    expect(text).not.toContain("never-return-this-secret");
    const payload = JSON.parse(text);
    expect(payload.providers.map((provider: { id: string }) => provider.id)).toEqual([
      "gemini",
      "qwen",
      "doubao",
      "openai",
      "minimax",
      "stepfun",
      "glm",
      "deepseek",
    ]);
  });

  it("marks DeepSeek as text-only and ineligible for image modes", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const payload = await (await GET()).json();

    expect(
      payload.providers.find((provider: { id: string }) => provider.id === "deepseek"),
    ).toMatchObject({
      capability: "text",
      configured: false,
      missingEnvironment: ["OPENROUTER_API_KEY"],
    });
    expect(
      payload.modelCatalog.filter(
        (model: { provider: string }) => model.provider === "deepseek",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: "deepseek/deepseek-v4-flash",
          modes: [],
        }),
        expect.objectContaining({
          model: "deepseek/deepseek-v4-pro",
          modes: [],
        }),
      ]),
    );
  });

  it("configures all four OpenRouter vendors from one key", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    const payload = await (await GET()).json();

    for (const id of ["openai", "qwen", "glm", "deepseek"]) {
      expect(
        payload.providers.find((provider: { id: string }) => provider.id === id),
      ).toMatchObject({ configured: true, missingEnvironment: [] });
    }
    expect(payload.modelCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "openai",
          model: "openai/gpt-5.4-mini",
        }),
        expect.objectContaining({
          provider: "qwen",
          model: "qwen/qwen3.6-flash",
        }),
        expect.objectContaining({
          provider: "glm",
          model: "z-ai/glm-5v-turbo",
        }),
      ]),
    );
  });

  it("exposes independently configured direct and OpenRouter transports", async () => {
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_INTL_API_KEY;
    delete process.env.DASHSCOPE_US_API_KEY;
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    process.env.MINIMAX_API_KEY = "minimax-test";
    process.env.STEPFUN_API_KEY = "stepfun-test";
    process.env.ARK_API_KEY = "ark-test";
    process.env.ARK_BASE_URL = "https://ark.example/v3";
    process.env.DOUBAO_MODEL = "doubao-test";
    const payload = await (await GET()).json();
    const routes = (provider: string) =>
      payload.modelCatalog
        .filter((model: { provider: string }) => model.provider === provider)
        .map((model: { transport: string }) => model.transport);

    expect(routes("qwen")).toEqual([
      "dashscope-beijing",
      "dashscope-singapore",
      "dashscope-virginia",
      "openrouter",
    ]);
    expect(routes("minimax")).toEqual(["minimax", "openrouter"]);
    expect(routes("stepfun")).toEqual(["stepfun", "openrouter"]);
    expect(routes("doubao")).toEqual(["ark"]);
    expect(routes("glm")).toEqual(["openrouter"]);
    expect(
      payload.modelCatalog.find(
        (model: { provider: string; transport: string }) =>
          model.provider === "qwen" && model.transport === "dashscope-beijing",
      ),
    ).toMatchObject({
      configured: false,
      missingEnvironment: ["DASHSCOPE_API_KEY"],
    });
  });

  it("keeps the Doubao Ark route visible when its endpoint is not configured", async () => {
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_BASE_URL;
    delete process.env.DOUBAO_MODEL;

    const payload = await (await GET()).json();
    expect(
      payload.modelCatalog.find(
        (model: { provider: string; transport: string }) =>
          model.provider === "doubao" && model.transport === "ark",
      ),
    ).toMatchObject({
      configured: false,
      missingEnvironment: ["ARK_API_KEY", "ARK_BASE_URL", "DOUBAO_MODEL"],
    });
  });
});

describe("POST /api/lab", () => {
  it("requires transport instead of silently selecting the first matching route", async () => {
    process.env.GOOGLE_API_KEY = "google-test";
    const { transport: _transport, ...body } = validBody;

    const res = await POST(request(body));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_transport" });
  });

  it("protects configured provider credentials with the Lab access token", async () => {
    process.env.LAB_ACCESS_TOKEN = "lab-secret";

    const missing = await POST(request({}));
    const accepted = await POST(request({}, false, true, "lab-secret"));

    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ code: "unauthorized" });
    expect(accepted.status).toBe(400);
    expect(await accepted.json()).toMatchObject({ code: "invalid_transport" });
  });

  it("fails closed on Cloudflare when the Lab access token is not configured", async () => {
    delete process.env.LAB_ACCESS_TOKEN;

    const res = await POST(request({}, true));

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "lab_access_not_configured" });
  });

  it("rejects a model and transport mismatch", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    process.env.DASHSCOPE_API_KEY = "dashscope-test";
    const res = await POST(
      request({
        ...validBody,
        provider: "qwen",
        transport: "dashscope-beijing",
        model: "qwen/qwen3.6-flash",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_model" });
  });

  it("rejects DeepSeek image runs as a capability mismatch", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    const res = await POST(
      request({
        ...validBody,
        provider: "deepseek",
        transport: "openrouter",
        model: "deepseek/deepseek-v4-flash",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "unsupported_input_capability",
      message: expect.stringContaining("shared OCR"),
    });
  });

  it("rejects a model that does not belong to the provider", async () => {
    process.env.OPENAI_API_KEY = "openai-test";
    const res = await POST(request({ ...validBody, provider: "openai" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_model" });
  });

  it("streams meta first and includes Cloudflare runtime metadata", async () => {
    process.env.LAB_ACCESS_TOKEN = "lab-secret";
    process.env.GOOGLE_API_KEY = "google-test";
    global.fetch = vi.fn(async () =>
      new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"ordinal\\":1,\\"categoryCn\\":null,\\"nameCn\\":\\"米饭\\",\\"price\\":\\"¥2\\",\\"confidence\\":1,\\"sourceText\\":\\"米饭 ¥2\\"}\\n"}]},"finishReason":"STOP"}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as typeof fetch;

    const res = await POST(request(validBody, true, true, "lab-secret"));
    const events = (await res.text()).trim().split("\n").map((row) => JSON.parse(row));

    expect(events[0]).toMatchObject({ type: "meta", runtime: "cloudflare", colo: "SHA", rayId: "ray-test" });
    expect(events).toContainEqual(expect.objectContaining({ type: "item", page: 1, ordinal: 1 }));
    expect(events.at(-1)).toMatchObject({ type: "done", total: 1 });
  });

  it("recognizes a Cloudflare request even when OpenNext does not attach req.cf", async () => {
    process.env.LAB_ACCESS_TOKEN = "lab-secret";
    process.env.GOOGLE_API_KEY = "google-test";
    global.fetch = vi.fn(async () =>
      new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"ordinal\\":1,\\"categoryCn\\":null,\\"nameCn\\":\\"米饭\\",\\"price\\":\\"¥2\\",\\"confidence\\":1,\\"sourceText\\":\\"米饭 ¥2\\"}\\n"}]},"finishReason":"STOP"}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as typeof fetch;

    const res = await POST(request(validBody, true, false, "lab-secret"));
    const events = (await res.text()).trim().split("\n").map((row) => JSON.parse(row));

    expect(events[0]).toMatchObject({
      type: "meta",
      runtime: "cloudflare",
      rayId: "ray-test",
    });
  });
});
