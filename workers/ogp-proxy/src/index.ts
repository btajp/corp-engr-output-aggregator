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
const FETCH_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const rateLimitBucket = new Map<string, { count: number; resetAt: number }>();

function text(body: string, headers: HeadersInit) {
  return new Response(body, { headers });
}

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

function decodeHtmlEntities(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeXml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(text: string, maxChars: number, maxLines: number) {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  const lines: string[] = [];
  let current = "";

  for (const char of chars) {
    if ((current + char).length > maxChars) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines) {
        break;
      }
      continue;
    }
    current += char;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return [];
  }

  if (chars.length > lines.join("").length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].slice(0, Math.max(0, maxChars - 1))}…`;
  }

  return lines;
}

function toBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function buildPosterDataUrl(url: string) {
  try {
    const posterUrl = new URL(url);
    if (!["http:", "https:"].includes(posterUrl.protocol)) {
      return undefined;
    }
    if (isBlockedHostname(posterUrl.hostname)) {
      return undefined;
    }

    const response = await fetch(posterUrl, {
      headers: {
        "user-agent": FETCH_USER_AGENT,
        "accept": "image/*",
      },
    });
    if (!response.ok) {
      return undefined;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return undefined;
    }
    const buffer = await response.arrayBuffer();
    return `data:${contentType};base64,${toBase64(buffer)}`;
  } catch {
    return undefined;
  }
}

async function renderFallbackImage(requestUrl: URL) {
  const title = requestUrl.searchParams.get("title")?.trim() || "Output Aggregator V3";
  const url = requestUrl.searchParams.get("url")?.trim() || "";
  const comment = requestUrl.searchParams.get("comment")?.trim() || "";
  const posterImageUrl = requestUrl.searchParams.get("posterImageUrl")?.trim();
  const posterDataUrl = posterImageUrl
    ? await buildPosterDataUrl(posterImageUrl)
    : undefined;

  const titleLines = wrapText(title, 26, 2);
  const urlLines = wrapText(url, 44, 2);
  const commentLines = wrapText(comment, 34, 4);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2937" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <clipPath id="avatarClip">
      <circle cx="134" cy="148" r="58" />
    </clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" rx="28" />
  <rect x="36" y="36" width="1128" height="558" rx="24" fill="#0f172a" opacity="0.88" stroke="#334155" />
  <text x="88" y="90" fill="#f8fafc" font-size="26" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700">Output Aggregator V3</text>
  <text x="88" y="122" fill="#94a3b8" font-size="18" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif">OGP unavailable fallback card</text>
  <circle cx="134" cy="148" r="58" fill="#334155" />
  ${posterDataUrl ? `<image href="${posterDataUrl}" x="76" y="90" width="116" height="116" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />` : ""}
  <text x="220" y="150" fill="#f8fafc" font-size="36" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700">投稿者アイコン</text>
  <text x="88" y="250" fill="#94a3b8" font-size="20" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700">タイトル</text>
  ${titleLines.map((line, index) => `<text x="88" y="${290 + index * 50}" fill="#f8fafc" font-size="40" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700">${escapeXml(line)}</text>`).join("")}
  <text x="88" y="410" fill="#94a3b8" font-size="20" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700">URL</text>
  ${urlLines.map((line, index) => `<text x="88" y="${448 + index * 30}" fill="#cbd5e1" font-size="22" font-family="'SFMono-Regular', 'Consolas', monospace">${escapeXml(line)}</text>`).join("")}
  <text x="88" y="526" fill="#94a3b8" font-size="20" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700">一言コメント</text>
  <rect x="88" y="544" width="1024" height="34" rx="10" fill="#111827" stroke="#475569" />
  ${commentLines.map((line, index) => `<text x="108" y="${568 + index * 26}" fill="#e2e8f0" font-size="22" font-family="'SFMono-Regular', 'Consolas', monospace">${escapeXml(line)}</text>`).join("")}
</svg>`;

  return text(svg, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=600",
  });
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
      return new URL(decodeHtmlEntities(match[1]), baseUrl).toString();
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
      return new URL(decodeHtmlEntities(match[1]), baseUrl).toString();
    } catch {
      continue;
    }
  }

  return undefined;
}

function extractMetaContent(
  html: string,
  selectors: Array<{ attr: "property" | "name"; value: string }>,
) {
  for (const selector of selectors) {
    const patterns = [
      new RegExp(
        `<meta[^>]+${selector.attr}=["']${selector.value}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+${selector.attr}=["']${selector.value}["'][^>]*>`,
        "i",
      ),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]?.trim()) {
        return decodeHtmlEntities(match[1].trim());
      }
    }
  }

  return undefined;
}

function stripHtml(text: string) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTitle(html: string) {
  const metaTitle = extractMetaContent(html, [
    { attr: "property", value: "og:title" },
    { attr: "name", value: "twitter:title" },
  ]);
  if (metaTitle) {
    return metaTitle;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) {
    return undefined;
  }

  const title = stripHtml(titleMatch[1]);
  return title || undefined;
}

function extractDescription(html: string) {
  return extractMetaContent(html, [
    { attr: "property", value: "og:description" },
    { attr: "name", value: "twitter:description" },
    { attr: "name", value: "description" },
  ]);
}

function extractSiteName(html: string, finalUrl: URL) {
  const siteName = extractMetaContent(html, [
    { attr: "property", value: "og:site_name" },
    { attr: "name", value: "application-name" },
  ]);
  if (siteName) {
    return siteName;
  }

  return finalUrl.hostname.replace(/^www\./, "");
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
          "user-agent": FETCH_USER_AGENT,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "ja,en-US;q=0.9,en;q=0.8",
          "cache-control": "no-cache",
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

  if (requestUrl.pathname === "/prj-output/fallback-image") {
    return await renderFallbackImage(requestUrl);
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
    return json({
      coverImageUrl,
      title: extractTitle(html),
      description: extractDescription(html),
      siteName: extractSiteName(html, finalUrl),
    });
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
