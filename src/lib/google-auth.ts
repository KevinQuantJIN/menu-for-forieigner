const TOKEN_URL = "https://oauth2.googleapis.com/token";
const VISION_SCOPE = "https://www.googleapis.com/auth/cloud-vision";
const REFRESH_SKEW_MS = 5 * 60_000;

let cachedToken: { value: string; expiresAtMs: number } | null = null;
let refreshInFlight: Promise<string> | null = null;

function resolveEnv(): { project: string; clientEmail: string; privateKey: string } {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? "";
  const clientEmail = process.env.GOOGLE_VISION_CLIENT_EMAIL ?? "";
  const privateKey = process.env.GOOGLE_VISION_PRIVATE_KEY ?? "";
  return { project, clientEmail, privateKey };
}

function validateCredentials(project: string, clientEmail: string, privateKey: string): void {
  if (!project || !clientEmail || !privateKey) {
    throw new ProviderError("google_auth", "missing_credentials", false);
  }
}

function normalizePem(raw: string): string {
  const norm = raw.replace(/\\n/g, "\n");
  if (!norm.includes("-----BEGIN PRIVATE KEY-----") || !norm.includes("-----END PRIVATE KEY-----")) {
    throw new ProviderError("google_auth", "invalid_private_key", false);
  }
  return norm;
}

function pemToDer(pem: string): ArrayBuffer {
  try {
    const stripped = pem
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "");
    const binary = atob(stripped);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    throw new ProviderError("google_auth", "invalid_private_key", false);
  }
}

function base64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export class ProviderError extends Error {
  constructor(
    readonly stage: "google_auth" | "vision" | "gemini" | "parse" | "timeout" | "aborted",
    readonly kind: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(`${stage}:${kind}`);
    this.name = "ProviderError";
  }
}

async function signJwt(
  header: string,
  claims: string,
  privateKey: CryptoKey,
): Promise<string> {
  const toSign = `${base64urlEncode(header)}.${base64urlEncode(claims)}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(toSign),
  );
  const sigStr = String.fromCharCode(...new Uint8Array(sig));
  return `${toSign}.${base64urlEncode(sigStr)}`;
}

async function importPrivateKey(der: ArrayBuffer): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new ProviderError("google_auth", "invalid_private_key", false);
  }
}

async function exchangeToken(jwt: string): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new ProviderError("google_auth", "token_exchange_failed", false);
  }

  if (!res.ok) {
    throw new ProviderError("google_auth", "token_exchange_failed", false, res.status);
  }

  let data: { access_token?: string; expires_in?: number };
  try {
    data = await res.json();
  } catch {
    throw new ProviderError("google_auth", "token_exchange_failed", false);
  }

  const accessToken = data.access_token;
  const expiresIn = data.expires_in;
  if (!accessToken || typeof expiresIn !== "number" || expiresIn <= 0 || !Number.isFinite(expiresIn)) {
    throw new ProviderError("google_auth", "token_exchange_failed", false);
  }

  return { accessToken, expiresIn };
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new ProviderError("aborted", "aborted", false));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new ProviderError("aborted", "aborted", false));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export async function getVisionAccessToken(signal?: AbortSignal): Promise<string> {
  const { project, clientEmail, privateKey: rawKey } = resolveEnv();
  validateCredentials(project, clientEmail, rawKey);

  if (signal?.aborted) {
    throw new ProviderError("aborted", "aborted", false);
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - now > REFRESH_SKEW_MS) {
    return cachedToken.value;
  }

  if (refreshInFlight) {
    return awaitWithAbort(refreshInFlight, signal);
  }

  const holder: { promise: Promise<string> | null } = { promise: null };
  holder.promise = (async () => {
    try {
      const normalizedKey = normalizePem(rawKey);
      const der = pemToDer(normalizedKey);
      const key = await importPrivateKey(der);

      const header = JSON.stringify({ alg: "RS256", typ: "JWT" });
      const iat = Math.floor(Date.now() / 1000);
      const claims = JSON.stringify({
        iss: clientEmail,
        scope: VISION_SCOPE,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      });

      const jwt = await signJwt(header, claims, key);
      const { accessToken, expiresIn } = await exchangeToken(jwt);

      cachedToken = {
        value: accessToken,
        expiresAtMs: Date.now() + expiresIn * 1000,
      };

      return accessToken;
    } finally {
      if (refreshInFlight === holder.promise) {
        refreshInFlight = null;
      }
    }
  })();

  refreshInFlight = holder.promise;
  return awaitWithAbort(holder.promise, signal);
}

export function invalidateVisionAccessToken(rejectedToken: string): void {
  if (cachedToken && cachedToken.value === rejectedToken) {
    cachedToken = null;
  }
}

export function __resetGoogleAuthForTests(): void {
  cachedToken = null;
  refreshInFlight = null;
}
