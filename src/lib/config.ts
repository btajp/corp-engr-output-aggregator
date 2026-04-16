const REQUIRED_ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID",
  "OUTPUT_CHANNEL_ID",
  "ALERT_CHANNEL_ID",
  "DEFAULT_COVER_IMAGE_URL",
] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];
type EnvSource = {
  [key: string]: string | undefined;
};

export type AppConfig = {
  notionToken: string;
  notionDatabaseId: string;
  outputChannelId: string;
  alertChannelId: string;
  defaultCoverImageUrl: string;
  outputArchiveUrl: string;
  replayAllowedUserIds: string[];
  ogpProxyUrl?: string;
  ogpProxySharedSecretActive?: string;
  ogpProxySharedSecretNext?: string;
};

function readRequiredEnv(key: RequiredEnvKey, env?: EnvSource): string {
  const value = (env ? env[key] : Deno.env.get(key))?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readOptionalEnv(key: string, env?: EnvSource): string | undefined {
  const value = (env ? env[key] : Deno.env.get(key))?.trim();
  return value ? value : undefined;
}

function readOptionalListEnv(key: string, env?: EnvSource): string[] {
  const value = readOptionalEnv(key, env);
  if (!value) {
    return [];
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function getConfig(env?: EnvSource): AppConfig {
  return {
    notionToken: readRequiredEnv("NOTION_TOKEN", env),
    notionDatabaseId: readRequiredEnv("NOTION_DATABASE_ID", env),
    outputChannelId: readRequiredEnv("OUTPUT_CHANNEL_ID", env),
    alertChannelId: readRequiredEnv("ALERT_CHANNEL_ID", env),
    defaultCoverImageUrl: readRequiredEnv("DEFAULT_COVER_IMAGE_URL", env),
    outputArchiveUrl: readOptionalEnv("OUTPUT_ARCHIVE_URL", env) ??
      "https://corp-engr-outputs.notion.site/",
    replayAllowedUserIds: readOptionalListEnv("REPLAY_ALLOWED_USER_IDS", env),
    ogpProxyUrl: readOptionalEnv("OGP_PROXY_URL", env),
    ogpProxySharedSecretActive: readOptionalEnv(
      "OGP_PROXY_SHARED_SECRET_ACTIVE",
      env,
    ),
    ogpProxySharedSecretNext: readOptionalEnv(
      "OGP_PROXY_SHARED_SECRET_NEXT",
      env,
    ),
  };
}
