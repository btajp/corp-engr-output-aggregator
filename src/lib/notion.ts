import { toJstIsoString } from "./time.ts";

const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_RICH_TEXT_LENGTH = 2_000;
const MAX_SYNC_RETRY_AFTER_SECONDS = 3;

export class NotionRequestError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    retryAfterSeconds?: number;
  }) {
    super(`${input.code}: ${input.message}`);
    this.name = "NotionRequestError";
    this.code = input.code;
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

export type CreateNotionPageInput = {
  token: string;
  databaseId: string;
  title: string;
  url: string;
  comment: string;
  slackName: string;
  slackTs: string;
  slackUserId: string;
  coverImageUrl: string;
  userIconUrl?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitText(text: string) {
  if (!text) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += MAX_RICH_TEXT_LENGTH) {
    chunks.push(text.slice(index, index + MAX_RICH_TEXT_LENGTH));
  }
  return chunks;
}

function createRichText(text: string) {
  return splitText(text).map((chunk) => ({
    type: "text",
    text: {
      content: chunk,
    },
  }));
}

export async function createNotionPage(input: CreateNotionPageInput) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${NOTION_API_BASE_URL}/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      parent: {
        database_id: input.databaseId,
      },
      ...(input.userIconUrl
        ? {
          icon: {
            type: "external",
            external: {
              url: input.userIconUrl,
            },
          },
        }
        : {}),
      cover: {
        type: "external",
        external: {
          url: input.coverImageUrl,
        },
      },
      properties: {
        Title: {
          title: createRichText(input.title),
        },
        Date: {
          date: {
            start: toJstIsoString(input.now),
            time_zone: "Asia/Tokyo",
          },
        },
        SlackName: {
          rich_text: createRichText(input.slackName),
        },
        SlackTs: {
          rich_text: createRichText(input.slackTs),
        },
        Description: {
          rich_text: createRichText(input.comment),
        },
        URL: {
          url: input.url,
        },
        SlackUserID: {
          rich_text: createRichText(input.slackUserId),
        },
      },
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json.message ?? response.statusText;
    const code = json.code ?? "notion_request_failed";
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10)
      : undefined;
    throw new NotionRequestError({
      code,
      message,
      status: response.status,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : undefined,
    });
  }

  if (!json.id) {
    throw new Error("notion_response_invalid: Missing page ID");
  }

  return {
    pageId: String(json.id),
  };
}

export async function createNotionPageWithRetry(
  input: CreateNotionPageInput & {
    sleepImpl?: typeof sleep;
  },
) {
  const sleepImpl = input.sleepImpl ?? sleep;

  try {
    return await createNotionPage(input);
  } catch (error) {
    if (!(error instanceof NotionRequestError)) {
      throw error;
    }

    const shouldRetry = error.status === 429 || error.status >= 500;
    const retryAfterSeconds = error.retryAfterSeconds ?? 0;
    if (!shouldRetry || retryAfterSeconds > MAX_SYNC_RETRY_AFTER_SECONDS) {
      throw error;
    }

    if (retryAfterSeconds > 0) {
      await sleepImpl(retryAfterSeconds * 1000);
    }

    return await createNotionPage(input);
  }
}

export async function archiveNotionPage(input: {
  token: string;
  pageId: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${NOTION_API_BASE_URL}/pages/${input.pageId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({
        archived: true,
      }),
    },
  );

  if (!response.ok) {
    let message = response.statusText;
    try {
      const json = await response.json();
      message = json.message ?? message;
    } catch {
      // keep statusText
    }
    throw new Error(`notion_archive_failed: ${message}`);
  }
}
