import { createOgpProxySignature } from "./ogp-proxy-auth.ts";

const OGP_PROXY_TIMESTAMP_HEADER = "x-bta-ogp-timestamp";
const OGP_PROXY_SIGNATURE_HEADER = "x-bta-ogp-signature";

export type OgpPreview = {
  coverImageUrl: string;
  title?: string;
  description?: string;
  siteName?: string;
};

export type FallbackCoverImageInput = {
  ogpProxyUrl?: string;
  title: string;
  url: string;
  comment?: string;
  posterImageUrl?: string;
};

export async function resolveOgpPreview(input: {
  defaultCoverImageUrl: string;
  targetUrl?: string;
  ogpProxyUrl?: string;
  ogpProxySharedSecretActive?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<OgpPreview> {
  if (
    !input.targetUrl || !input.ogpProxyUrl || !input.ogpProxySharedSecretActive
  ) {
    console.warn(
      `OGP proxy skipped targetUrl=${Boolean(input.targetUrl)} ogpProxyUrl=${
        Boolean(input.ogpProxyUrl)
      } sharedSecret=${Boolean(input.ogpProxySharedSecretActive)}`,
    );
    return { coverImageUrl: input.defaultCoverImageUrl };
  }

  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const requestUrl = new URL(input.ogpProxyUrl);
    requestUrl.searchParams.set("url", input.targetUrl);

    const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1000)
      .toString();
    const signature = await createOgpProxySignature({
      secret: input.ogpProxySharedSecretActive,
      timestamp,
      targetUrl: input.targetUrl,
    });

    const response = await fetchImpl(requestUrl, {
      headers: {
        [OGP_PROXY_TIMESTAMP_HEADER]: timestamp,
        [OGP_PROXY_SIGNATURE_HEADER]: signature,
      },
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.warn(
        `OGP proxy responded non-ok status=${response.status} target=${input.targetUrl} body=${
          bodyText.slice(0, 300)
        }`,
      );
      return { coverImageUrl: input.defaultCoverImageUrl };
    }

    const payload = await response.json() as {
      coverImageUrl?: string;
      title?: string;
      description?: string;
      siteName?: string;
    };
    return {
      coverImageUrl: payload.coverImageUrl?.trim() || input.defaultCoverImageUrl,
      title: payload.title?.trim() || undefined,
      description: payload.description?.trim() || undefined,
      siteName: payload.siteName?.trim() || undefined,
    };
  } catch (error) {
    console.warn(
      `OGP proxy fetch threw target=${input.targetUrl} error=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { coverImageUrl: input.defaultCoverImageUrl };
  }
}

export async function resolveCoverImage(input: {
  defaultCoverImageUrl: string;
  targetUrl?: string;
  ogpProxyUrl?: string;
  ogpProxySharedSecretActive?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<string> {
  const preview = await resolveOgpPreview(input);
  return preview.coverImageUrl;
}

export function buildFallbackCoverImageUrl(input: FallbackCoverImageInput) {
  if (!input.ogpProxyUrl) {
    return undefined;
  }

  const fallbackUrl = new URL(input.ogpProxyUrl);
  fallbackUrl.pathname = "/prj-output/fallback-image";
  fallbackUrl.search = "";
  fallbackUrl.searchParams.set("title", input.title);
  fallbackUrl.searchParams.set("url", input.url);

  if (input.comment?.trim()) {
    fallbackUrl.searchParams.set("comment", input.comment.trim());
  }

  if (input.posterImageUrl?.trim()) {
    fallbackUrl.searchParams.set("posterImageUrl", input.posterImageUrl.trim());
  }

  return fallbackUrl.toString();
}

export const OGP_PROXY_HEADERS = {
  timestamp: OGP_PROXY_TIMESTAMP_HEADER,
  signature: OGP_PROXY_SIGNATURE_HEADER,
};
