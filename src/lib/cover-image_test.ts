import { assertEquals } from "@std/assert";
import { OGP_PROXY_HEADERS, resolveCoverImage } from "./cover-image.ts";

Deno.test("resolveCoverImage returns default when proxy is not configured", async () => {
  const result = await resolveCoverImage({
    defaultCoverImageUrl: "https://example.com/default.png",
    targetUrl: "https://example.com/post",
  });

  assertEquals(result, "https://example.com/default.png");
});

Deno.test("resolveCoverImage returns proxy result when available", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];

  const result = await resolveCoverImage({
    defaultCoverImageUrl: "https://example.com/default.png",
    targetUrl: "https://example.com/post",
    ogpProxyUrl: "https://corp-engr.btajp.run/prj-output/ogp",
    ogpProxySharedSecretActive: "secret",
    now: new Date("2026-04-16T00:00:00Z"),
    fetchImpl: (input, init) => {
      const request = new Request(input, init);
      requests.push({ url: request.url, headers: request.headers });
      return Promise.resolve(
        new Response('{"coverImageUrl":"https://example.com/ogp.png"}', {
          status: 200,
        }),
      );
    },
  });

  assertEquals(result, "https://example.com/ogp.png");
  assertEquals(
    new URL(requests[0].url).searchParams.get("url"),
    "https://example.com/post",
  );
  assertEquals(
    Boolean(requests[0].headers.get(OGP_PROXY_HEADERS.timestamp)),
    true,
  );
  assertEquals(
    Boolean(requests[0].headers.get(OGP_PROXY_HEADERS.signature)),
    true,
  );
});

Deno.test("resolveCoverImage falls back when proxy returns an error", async () => {
  const result = await resolveCoverImage({
    defaultCoverImageUrl: "https://example.com/default.png",
    targetUrl: "https://example.com/post",
    ogpProxyUrl: "https://corp-engr.btajp.run/prj-output/ogp",
    ogpProxySharedSecretActive: "secret",
    fetchImpl: () => Promise.resolve(new Response("{}", { status: 500 })),
  });

  assertEquals(result, "https://example.com/default.png");
});
