import { assertEquals } from "@std/assert";
import { handleRequest } from "./index.ts";
import { createOgpProxySignature } from "../../../src/lib/ogp-proxy-auth.ts";
import { OGP_PROXY_HEADERS } from "../../../src/lib/cover-image.ts";

const env = {
  OGP_PROXY_SHARED_SECRET_ACTIVE: "secret",
  OGP_FETCH_TIMEOUT_MS: "1000",
  OGP_MAX_REDIRECTS: "1",
  OGP_MAX_RESPONSE_BYTES: "10000",
  OGP_RATE_LIMIT_PER_MINUTE: "100",
};

async function createSignedRequest(url: string) {
  const targetUrl = "https://example.com/post";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createOgpProxySignature({
    secret: "secret",
    timestamp,
    targetUrl,
  });

  const requestUrl = new URL(url);
  requestUrl.searchParams.set("url", targetUrl);

  return new Request(requestUrl, {
    headers: {
      [OGP_PROXY_HEADERS.timestamp]: timestamp,
      [OGP_PROXY_HEADERS.signature]: signature,
      "cf-connecting-ip": "203.0.113.1",
    },
  });
}

Deno.test("handleRequest returns 404 for other paths", async () => {
  const response = await handleRequest(
    new Request("https://corp-engr.btajp.run/unknown"),
    env,
  );

  assertEquals(response.status, 404);
});

Deno.test("handleRequest returns og:image when the page includes it", async () => {
  const request = await createSignedRequest(
    "https://corp-engr.btajp.run/prj-output/ogp",
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        '<html><head><meta property="og:image" content="https://example.com/ogp.png"><meta property="og:title" content="Example Post"><meta property="og:description" content="Preview body"><meta property="og:site_name" content="Example Site"></head></html>',
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );

  try {
    const response = await handleRequest(request, env);
    assertEquals(response.status, 200);
    const payload = await response.json() as {
      coverImageUrl: string;
      title: string;
      description: string;
      siteName: string;
    };
    assertEquals(payload.coverImageUrl, "https://example.com/ogp.png");
    assertEquals(payload.title, "Example Post");
    assertEquals(payload.description, "Preview body");
    assertEquals(payload.siteName, "Example Site");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleRequest decodes html entities in og:image urls", async () => {
  const targetUrl = "https://example.com/post";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createOgpProxySignature({
    secret: "secret",
    timestamp,
    targetUrl,
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const request = input instanceof Request ? input : new Request(input);
    if (request.url.startsWith("https://example.com/post")) {
      return Promise.resolve(
        new Response(
          '<html><head><meta property="og:image" content="https://cdn.example.com/og.png?ixlib=rb-4.0.0&amp;w=1200&amp;fm=jpg"></head></html>',
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${request.url}`));
  }) as typeof fetch;

  try {
    const request = new Request(
      `https://corp-engr.btajp.run/prj-output/ogp?url=${encodeURIComponent(targetUrl)}`,
      {
        headers: {
          [OGP_PROXY_HEADERS.timestamp]: timestamp,
          [OGP_PROXY_HEADERS.signature]: signature,
        },
      },
    );

    const response = await handleRequest(request, {
      OGP_PROXY_SHARED_SECRET_ACTIVE: "secret",
    });
    const payload = await response.json() as { coverImageUrl: string };
    assertEquals(
      payload.coverImageUrl,
      "https://cdn.example.com/og.png?ixlib=rb-4.0.0&w=1200&fm=jpg",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleRequest falls back to icon links when og:image is absent", async () => {
  const request = await createSignedRequest(
    "https://corp-engr.btajp.run/prj-output/ogp",
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        '<html><head><link rel="icon" href="/favicon.ico"></head></html>',
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );

  try {
    const response = await handleRequest(request, env);
    assertEquals(response.status, 200);
    const payload = await response.json() as { coverImageUrl: string };
    assertEquals(payload.coverImageUrl, "https://example.com/favicon.ico");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleRequest blocks localhost targets", async () => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const targetUrl = "http://localhost:3000/private";
  const signature = await createOgpProxySignature({
    secret: "secret",
    timestamp,
    targetUrl,
  });

  const request = new Request(
    `https://corp-engr.btajp.run/prj-output/ogp?url=${
      encodeURIComponent(targetUrl)
    }`,
    {
      headers: {
        [OGP_PROXY_HEADERS.timestamp]: timestamp,
        [OGP_PROXY_HEADERS.signature]: signature,
        "cf-connecting-ip": "203.0.113.2",
      },
    },
  );

  const response = await handleRequest(request, env);
  assertEquals(response.status, 403);
});

Deno.test("handleRequest renders fallback image svg", async () => {
  const response = await handleRequest(
    new Request(
      "https://corp-engr.btajp.run/prj-output/fallback-image?title=Example%20Title&url=https%3A%2F%2Fexample.com&comment=hello",
    ),
    {},
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("content-type"),
    "image/svg+xml; charset=utf-8",
  );
  const body = await response.text();
  assertEquals(body.includes("Example Title"), true);
  assertEquals(body.includes("https://example.com"), true);
});
