import { assertEquals } from "@std/assert";
import {
  buildFallbackCoverImageUrl,
  OGP_PROXY_HEADERS,
  resolveCoverImage,
  resolveOgpPreview,
} from "./cover-image.ts";

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

Deno.test("resolveOgpPreview returns proxy metadata when available", async () => {
  const preview = await resolveOgpPreview({
    defaultCoverImageUrl: "https://example.com/default.png",
    targetUrl: "https://example.com/post",
    ogpProxyUrl: "https://corp-engr.btajp.run/prj-output/ogp",
    ogpProxySharedSecretActive: "secret",
    fetchImpl: () =>
      Promise.resolve(
        new Response(
          '{"coverImageUrl":"https://example.com/ogp.png","title":"Example title","description":"Example description","siteName":"Example Site"}',
          { status: 200 },
        ),
      ),
  });

  assertEquals(preview.coverImageUrl, "https://example.com/ogp.png");
  assertEquals(preview.title, "Example title");
  assertEquals(preview.description, "Example description");
  assertEquals(preview.siteName, "Example Site");
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

Deno.test("buildFallbackCoverImageUrl derives fallback-image path", () => {
  const url = buildFallbackCoverImageUrl({
    ogpProxyUrl: "https://corp-engr.btajp.run/prj-output/ogp",
    title: "Example title",
    url: "https://example.com/post",
    comment: "hello",
    posterImageUrl: "https://example.com/avatar.png",
  });

  assertEquals(
    url,
    "https://corp-engr.btajp.run/prj-output/fallback-image?title=Example+title&url=https%3A%2F%2Fexample.com%2Fpost&comment=hello&posterImageUrl=https%3A%2F%2Fexample.com%2Favatar.png",
  );
});
