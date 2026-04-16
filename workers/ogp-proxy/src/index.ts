import { createOgpProxySignature } from "../../../src/lib/ogp-proxy-auth.ts";
import { OGP_PROXY_HEADERS } from "../../../src/lib/cover-image.ts";

type Env = {
  OGP_FETCH_TIMEOUT_MS?: string;
  OGP_MAX_REDIRECTS?: string;
  OGP_MAX_RESPONSE_BYTES?: string;
  OGP_RATE_LIMIT_PER_MINUTE?: string;
  OGP_PROXY_SHARED_SECRET_ACTIVE?: string;
  OGP_PROXY_SHARED_SECRET_NEXT?: string;
};

const REQUEST_TTL_SECONDS = 300;
const DEFAULT_FETCH_TIMEOUT_MS = 3000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
const rateLimitBucket = new Map<string, { count: number; resetAt: number }>();

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  return parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized === "169.254.169.254" ||
    isPrivateIpv4(normalized);
}

function extractOgpImageUrl(html: string, baseUrl: URL) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    try {
      return new URL(match[1], baseUrl).toString();
    } catch {
      continue;
    }
  }

  const iconPatterns = [
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["'][^>]*>/i,
    /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon)["'][^>]*>/i,
    /<link[^>]+rel=(?:shortcut icon|icon)[^>]+href=([^\s>]+)[^>]*>/i,
    /<link[^>]+href=([^\s>]+)[^>]+rel=(?:shortcut icon|icon)[^>]*>/i,
  ];

  for (const pattern of iconPatterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    try {
      return new URL(match[1], baseUrl).toString();
    } catch {
      continue;
    }
  }

  return undefined;
}

async function validateSignature(
  request: Request,
  env: Env,
  targetUrl: string,
) {
  const timestamp = request.headers.get(OGP_PROXY_HEADERS.timestamp);
  const signature = request.headers.get(OGP_PROXY_HEADERS.signature);
  if (!timestamp || !signature) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - Number.parseInt(timestamp, 10));
  if (!Number.isFinite(age) || age > REQUEST_TTL_SECONDS) {
    return false;
  }

  const secrets = [
    env.OGP_PROXY_SHARED_SECRET_ACTIVE,
    env.OGP_PROXY_SHARED_SECRET_NEXT,
  ].filter((value): value is string => Boolean(value));

  for (const secret of secrets) {
    const expected = await createOgpProxySignature({
      secret,
      timestamp,
      targetUrl,
    });
    if (expected === signature) {
      return true;
    }
  }

  return false;
}

function enforceRateLimit(request: Request, env: Env) {
  const limit = readNumber(
    env.OGP_RATE_LIMIT_PER_MINUTE,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
  );
  const key = request.headers.get("cf-connecting-ip") ?? "anonymous";
  const now = Date.now();
  const existing = rateLimitBucket.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitBucket.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  rateLimitBucket.set(key, existing);
  return true;
}

async function fetchHtml(targetUrl: URL, env: Env) {
  const timeoutMs = readNumber(
    env.OGP_FETCH_TIMEOUT_MS,
    DEFAULT_FETCH_TIMEOUT_MS,
  );
  const maxRedirects = readNumber(
    env.OGP_MAX_REDIRECTS,
    DEFAULT_MAX_REDIRECTS,
  );
  const maxResponseBytes = readNumber(
    env.OGP_MAX_RESPONSE_BYTES,
    DEFAULT_MAX_RESPONSE_BYTES,
  );

  let currentUrl = targetUrl;

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "corp-engr-output-aggregator/1.0",
          "accept": "text/html,application/xhtml+xml",
        },
      });

      if (
        response.status >= 300 && response.status < 400 &&
        response.headers.get("location")
      ) {
        const redirectedUrl = new URL(
          response.headers.get("location") as string,
          currentUrl,
        );
        if (!["http:", "https:"].includes(redirectedUrl.protocol)) {
          throw new Error("redirect_protocol_not_allowed");
        }
        if (isBlockedHostname(redirectedUrl.hostname)) {
          throw new Error("redirect_target_blocked");
        }
        currentUrl = redirectedUrl;
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml")
      ) {
        throw new Error("content_type_not_supported");
      }

      const contentLength = Number.parseInt(
        response.headers.get("content-length") ?? "",
        10,
      );
      if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
        throw new Error("response_too_large");
      }

      const html = await response.text();
      if (html.length > maxResponseBytes) {
        throw new Error("response_too_large");
      }

      return { html, finalUrl: currentUrl };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error("too_many_redirects");
}

export async function handleRequest(request: Request, env: Env) {
  const requestUrl = new URL(request.url);
  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (requestUrl.pathname !== "/prj-output/ogp") {
    return json({ error: "not_found" }, 404);
  }

  if (!enforceRateLimit(request, env)) {
    return json({ error: "rate_limited" }, 429);
  }

  const target = requestUrl.searchParams.get("url");
  if (!target) {
    return json({ error: "missing_url" }, 400);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return json({ error: "invalid_url" }, 400);
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return json({ error: "protocol_not_allowed" }, 400);
  }

  if (targetUrl.username || targetUrl.password) {
    return json({ error: "credentials_not_allowed" }, 400);
  }

  if (isBlockedHostname(targetUrl.hostname)) {
    return json({ error: "target_blocked" }, 403);
  }

  const targetUrlString = targetUrl.toString();
  const authorized = await validateSignature(request, env, targetUrlString);
  if (!authorized) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const { html, finalUrl } = await fetchHtml(targetUrl, env);
    const coverImageUrl = extractOgpImageUrl(html, finalUrl);
    if (!coverImageUrl) {
      return json({ error: "og_image_not_found" }, 404);
    }
    return json({ coverImageUrl });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "og_fetch_failed" },
      502,
    );
  }
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
