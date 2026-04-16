const REQUIRED_ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID",
  "OUTPUT_CHANNEL_ID",
  "ALERT_CHANNEL_ID",
  "DEFAULT_COVER_IMAGE_URL",
] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

export type AppConfig = {
  notionToken: string;
  notionDatabaseId: string;
  outputChannelId: string;
  alertChannelId: string;
  defaultCoverImageUrl: string;
  ogpProxyUrl?: string;
  ogpProxySharedSecretActive?: string;
  ogpProxySharedSecretNext?: string;
};

function readRequiredEnv(key: RequiredEnvKey): string {
  const value = Deno.env.get(key)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readOptionalEnv(key: string): string | undefined {
  const value = Deno.env.get(key)?.trim();
  return value ? value : undefined;
}

export function getConfig(): AppConfig {
  return {
    notionToken: readRequiredEnv("NOTION_TOKEN"),
    notionDatabaseId: readRequiredEnv("NOTION_DATABASE_ID"),
    outputChannelId: readRequiredEnv("OUTPUT_CHANNEL_ID"),
    alertChannelId: readRequiredEnv("ALERT_CHANNEL_ID"),
    defaultCoverImageUrl: readRequiredEnv("DEFAULT_COVER_IMAGE_URL"),
    ogpProxyUrl: readOptionalEnv("OGP_PROXY_URL"),
    ogpProxySharedSecretActive: readOptionalEnv(
      "OGP_PROXY_SHARED_SECRET_ACTIVE",
    ),
    ogpProxySharedSecretNext: readOptionalEnv("OGP_PROXY_SHARED_SECRET_NEXT"),
  };
}
