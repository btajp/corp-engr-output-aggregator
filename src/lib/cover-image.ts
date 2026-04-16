import { createOgpProxySignature } from "./ogp-proxy-auth.ts";

const OGP_PROXY_TIMESTAMP_HEADER = "x-bta-ogp-timestamp";
const OGP_PROXY_SIGNATURE_HEADER = "x-bta-ogp-signature";

export async function resolveCoverImage(input: {
  defaultCoverImageUrl: string;
  targetUrl?: string;
  ogpProxyUrl?: string;
  ogpProxySharedSecretActive?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<string> {
  if (
    !input.targetUrl || !input.ogpProxyUrl || !input.ogpProxySharedSecretActive
  ) {
    return input.defaultCoverImageUrl;
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
      return input.defaultCoverImageUrl;
    }

    const payload = await response.json() as { coverImageUrl?: string };
    return payload.coverImageUrl?.trim() || input.defaultCoverImageUrl;
  } catch {
    return input.defaultCoverImageUrl;
  }
}

export const OGP_PROXY_HEADERS = {
  timestamp: OGP_PROXY_TIMESTAMP_HEADER,
  signature: OGP_PROXY_SIGNATURE_HEADER,
};
