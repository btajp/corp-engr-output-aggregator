import { assertEquals, assertThrows } from "@std/assert";
import { getConfig } from "./config.ts";

const ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID",
  "OUTPUT_CHANNEL_ID",
  "ALERT_CHANNEL_ID",
  "DEFAULT_COVER_IMAGE_URL",
  "OGP_PROXY_URL",
  "OGP_PROXY_SHARED_SECRET_ACTIVE",
  "OGP_PROXY_SHARED_SECRET_NEXT",
] as const;

function resetEnv() {
  for (const key of ENV_KEYS) {
    Deno.env.delete(key);
  }
}

Deno.test("getConfig reads required and optional values", () => {
  resetEnv();
  Deno.env.set("NOTION_TOKEN", "token");
  Deno.env.set("NOTION_DATABASE_ID", "database");
  Deno.env.set("OUTPUT_CHANNEL_ID", "C123");
  Deno.env.set("ALERT_CHANNEL_ID", "C456");
  Deno.env.set("DEFAULT_COVER_IMAGE_URL", "https://example.com/cover.png");
  Deno.env.set("OGP_PROXY_URL", "https://corp-engr.btajp.run/prj-output/ogp");
  Deno.env.set("OGP_PROXY_SHARED_SECRET_ACTIVE", "active");
  Deno.env.set("OGP_PROXY_SHARED_SECRET_NEXT", "next");

  assertEquals(getConfig(), {
    notionToken: "token",
    notionDatabaseId: "database",
    outputChannelId: "C123",
    alertChannelId: "C456",
    defaultCoverImageUrl: "https://example.com/cover.png",
    ogpProxyUrl: "https://corp-engr.btajp.run/prj-output/ogp",
    ogpProxySharedSecretActive: "active",
    ogpProxySharedSecretNext: "next",
  });
});

Deno.test("getConfig throws when a required value is missing", () => {
  resetEnv();
  Deno.env.set("NOTION_DATABASE_ID", "database");
  Deno.env.set("OUTPUT_CHANNEL_ID", "C123");
  Deno.env.set("ALERT_CHANNEL_ID", "C456");
  Deno.env.set("DEFAULT_COVER_IMAGE_URL", "https://example.com/cover.png");

  assertThrows(() => getConfig(), Error, "NOTION_TOKEN");
});

Deno.test("getConfig treats blank values as missing", () => {
  resetEnv();
  Deno.env.set("NOTION_TOKEN", " ");
  Deno.env.set("NOTION_DATABASE_ID", "database");
  Deno.env.set("OUTPUT_CHANNEL_ID", "C123");
  Deno.env.set("ALERT_CHANNEL_ID", "C456");
  Deno.env.set("DEFAULT_COVER_IMAGE_URL", "https://example.com/cover.png");
  Deno.env.set("OGP_PROXY_URL", " ");
  Deno.env.set("OGP_PROXY_SHARED_SECRET_ACTIVE", " ");
  Deno.env.set("OGP_PROXY_SHARED_SECRET_NEXT", " ");

  assertThrows(() => getConfig(), Error, "NOTION_TOKEN");
});

Deno.test("getConfig returns undefined for blank optional values", () => {
  resetEnv();
  Deno.env.set("NOTION_TOKEN", "token");
  Deno.env.set("NOTION_DATABASE_ID", "database");
  Deno.env.set("OUTPUT_CHANNEL_ID", "C123");
  Deno.env.set("ALERT_CHANNEL_ID", "C456");
  Deno.env.set("DEFAULT_COVER_IMAGE_URL", "https://example.com/cover.png");
  Deno.env.set("OGP_PROXY_URL", " ");
  Deno.env.set("OGP_PROXY_SHARED_SECRET_ACTIVE", " ");
  Deno.env.set("OGP_PROXY_SHARED_SECRET_NEXT", " ");

  const config = getConfig();

  assertEquals(config.ogpProxyUrl, undefined);
  assertEquals(config.ogpProxySharedSecretActive, undefined);
  assertEquals(config.ogpProxySharedSecretNext, undefined);
});
