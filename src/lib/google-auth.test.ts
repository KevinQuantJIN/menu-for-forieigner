import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  ProviderError,
  __resetGoogleAuthForTests,
  getVisionAccessToken,
  invalidateVisionAccessToken,
} from "./google-auth";

let testKey: CryptoKey;
let testPem: string;

beforeEach(async () => {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_VISION_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  testKey = keyPair.privateKey;
  const exported = await crypto.subtle.exportKey("pkcs8", testKey);
  const pemBody = btoa(String.fromCharCode(...new Uint8Array(exported)));
  testPem = `-----BEGIN PRIVATE KEY-----\n${pemBody.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  process.env.GOOGLE_VISION_PRIVATE_KEY = testPem;
  __resetGoogleAuthForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  __resetGoogleAuthForTests();
});

describe("getVisionAccessToken", () => {
  it("1. generates RS256 JWT with correct claims", async () => {
    const fetchCalls: Request[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      fetchCalls.push(new Request(input, init));
      return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
    });

    const token = await getVisionAccessToken();
    expect(token).toBe("tok-1");
    expect(fetchCalls).toHaveLength(1);

    const bodyText = await fetchCalls[0].text();
    const params = new URLSearchParams(bodyText);
    const assertion = params.get("assertion");
    expect(assertion).toBeTruthy();

    const parts = assertion!.split(".");
    expect(parts).toHaveLength(3);

    const headerStr = atob(parts[0]);
    const header = JSON.parse(headerStr);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    const claimsStr = atob(parts[1]);
    const claims = JSON.parse(claimsStr);
    expect(claims.iss).toBe("test@test-project.iam.gserviceaccount.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/cloud-vision");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.iat).toBeGreaterThan(0);
    expect(claims.exp).toBe(claims.iat + 3600);
  });

  it("2. accepts PEM with real newlines", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-nl", expires_in: 3600 }), { status: 200 }),
    );
    const token = await getVisionAccessToken();
    expect(token).toBe("tok-nl");
  });

  it("3. accepts PEM with escaped \\\\n", async () => {
    process.env.GOOGLE_VISION_PRIVATE_KEY = testPem.replace(/\n/g, "\\n");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-esc", expires_in: 3600 }), { status: 200 }),
    );
    const token = await getVisionAccessToken();
    expect(token).toBe("tok-esc");
  });

  it("4. rejects missing credentials without exposing values", async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    await expect(getVisionAccessToken()).rejects.toThrow(ProviderError);
    try {
      await getVisionAccessToken();
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      const pe = e as ProviderError;
      expect(pe.stage).toBe("google_auth");
      expect(pe.kind).toBe("missing_credentials");
      expect(pe.message).not.toContain("test@test-project");
    }
  });

  it("5. rejects malformed key with sanitized error", async () => {
    process.env.GOOGLE_VISION_PRIVATE_KEY = "not-a-real-key";
    await expect(getVisionAccessToken()).rejects.toThrow(ProviderError);
    try {
      await getVisionAccessToken();
    } catch (e) {
      const pe = e as ProviderError;
      expect(pe.kind).toBe("invalid_private_key");
      expect(pe.message).not.toContain("not-a-real-key");
    }
  });

  it("5b. sanitizes malformed base64 inside a PKCS#8 envelope", async () => {
    process.env.GOOGLE_VISION_PRIVATE_KEY =
      "-----BEGIN PRIVATE KEY-----\n%%%not-base64%%%\n-----END PRIVATE KEY-----";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getVisionAccessToken()).rejects.toMatchObject({
      stage: "google_auth",
      kind: "invalid_private_key",
      retryable: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("6. parses token response and expiry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-exp", expires_in: 1800 }), { status: 200 }),
    );
    const token = await getVisionAccessToken();
    expect(token).toBe("tok-exp");
  });

  it("7. reuses cached token with more than five minutes remaining", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-cached", expires_in: 3600 }), { status: 200 }),
    );
    const t1 = await getVisionAccessToken();
    const t2 = await getVisionAccessToken();
    expect(t1).toBe("tok-cached");
    expect(t2).toBe("tok-cached");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("8. refreshes token inside the five-minute window", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-old", expires_in: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-new", expires_in: 3600 }), { status: 200 }));

    const t1 = await getVisionAccessToken();
    expect(t1).toBe("tok-old");
    await new Promise((r) => setTimeout(r, 100));
    const t2 = await getVisionAccessToken();
    expect(t2).toBe("tok-new");
  });

  it("9. four simultaneous cold calls perform exactly one token fetch", async () => {
    __resetGoogleAuthForTests();
    let fetchCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ access_token: `tok-concurrent`, expires_in: 3600 }), { status: 200 });
    });

    const results = await Promise.all([
      getVisionAccessToken(),
      getVisionAccessToken(),
      getVisionAccessToken(),
      getVisionAccessToken(),
    ]);
    expect(fetchCount).toBe(1);
    for (const r of results) expect(r).toBe("tok-concurrent");
  });

  it("10. failed refresh clears in-flight promise so next call can retry", async () => {
    __resetGoogleAuthForTests();
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-retry", expires_in: 3600 }), { status: 200 }));

    await expect(getVisionAccessToken()).rejects.toThrow();
    const t2 = await getVisionAccessToken();
    expect(t2).toBe("tok-retry");
  });

  it("11. compare-and-clear invalidation does not delete a newer cached token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-first", expires_in: 3600 }), { status: 200 }),
    );
    const t1 = await getVisionAccessToken();
    expect(t1).toBe("tok-first");

    invalidateVisionAccessToken("tok-old-different");
    const t2 = await getVisionAccessToken();
    expect(t2).toBe("tok-first");
  });

  it("12. token endpoint non-2xx and malformed success body are sanitized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );
    await expect(getVisionAccessToken()).rejects.toThrow(ProviderError);
    try {
      await getVisionAccessToken();
    } catch (e) {
      const pe = e as ProviderError;
      expect(pe.stage).toBe("google_auth");
      expect(pe.kind).toBe("token_exchange_failed");
      expect(pe.message).not.toContain("Internal Server Error");
    }

    __resetGoogleAuthForTests();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json at all", { status: 200 }),
    );
    await expect(getVisionAccessToken()).rejects.toThrow(ProviderError);
  });

  it("13. aborting the first caller does not cancel a shared refresh", async () => {
    let resolveFetch!: (value: Response) => void;
    let fetchStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      fetchStarted = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise<Response>((resolve, reject) => {
        resolveFetch = resolve;
        fetchStarted();
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      }),
    );
    const firstController = new AbortController();
    const first = getVisionAccessToken(firstController.signal);
    await started;
    const second = getVisionAccessToken();

    firstController.abort();
    await expect(first).rejects.toMatchObject({ stage: "aborted" });
    resolveFetch(new Response(JSON.stringify({ access_token: "tok-shared", expires_in: 3600 }), { status: 200 }));
    await expect(second).resolves.toBe("tok-shared");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("14. a later caller can abort only its own wait", async () => {
    let resolveFetch!: (value: Response) => void;
    let fetchStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      fetchStarted = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
        fetchStarted();
      }),
    );
    const first = getVisionAccessToken();
    await started;
    const secondController = new AbortController();
    const second = getVisionAccessToken(secondController.signal);

    secondController.abort();
    resolveFetch(new Response(JSON.stringify({ access_token: "tok-first", expires_in: 3600 }), { status: 200 }));
    await expect(second).rejects.toMatchObject({ stage: "aborted" });
    await expect(first).resolves.toBe("tok-first");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
