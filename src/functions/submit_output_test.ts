import { assertEquals, assertExists, assertMatch } from "@std/assert";
import { stub } from "@std/testing/mock";
import { handleSubmitOutput } from "./submit_output.ts";
import { SUBMISSION_STATUS } from "../lib/submission_status.ts";

const ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID",
  "OUTPUT_CHANNEL_ID",
  "ALERT_CHANNEL_ID",
  "DEFAULT_COVER_IMAGE_URL",
] as const;

function resetEnv() {
  for (const key of ENV_KEYS) {
    Deno.env.delete(key);
  }
}

function setRequiredEnv() {
  resetEnv();
  Deno.env.set("NOTION_TOKEN", "test-notion-token");
  Deno.env.set("NOTION_DATABASE_ID", "test-database-id");
  Deno.env.set("OUTPUT_CHANNEL_ID", "COUTPUT");
  Deno.env.set("ALERT_CHANNEL_ID", "CALERT");
  Deno.env.set(
    "DEFAULT_COVER_IMAGE_URL",
    "https://example.com/default-cover.png",
  );
}

function createClient(options?: {
  postMessageOk?: boolean;
  postMessageError?: string;
  usersInfoThrows?: boolean;
  datastoreFailureCalls?: number[];
}) {
  const datastoreItems: Array<Record<string, string>> = [];
  const postedMessages: Array<Record<string, unknown>> = [];
  const deletedMessages: Array<Record<string, unknown>> = [];
  let datastoreCallCount = 0;

  return {
    client: {
      apps: {
        datastore: {
          put: (
            { item }: { datastore: string; item: Record<string, string> },
          ) => {
            datastoreCallCount += 1;
            datastoreItems.push(structuredClone(item));
            if (options?.datastoreFailureCalls?.includes(datastoreCallCount)) {
              return Promise.resolve({ ok: false, error: "datastore_error" });
            }
            return Promise.resolve({ ok: true });
          },
        },
      },
      users: {
        info: () => {
          if (options?.usersInfoThrows) {
            return Promise.reject(new Error("users_info_unavailable"));
          }

          return Promise.resolve({
            ok: true,
            user: {
              profile: {
                display_name: "okash1n",
                image_512: "https://example.com/avatar.png",
              },
            },
          });
        },
      },
      chat: {
        postMessage: (payload: Record<string, unknown>) => {
          postedMessages.push(payload);
          if (options?.postMessageOk === false) {
            return Promise.resolve({
              ok: false,
              error: options.postMessageError ?? "channel_not_found",
            });
          }

          return Promise.resolve({ ok: true, ts: "1710000000.000100" });
        },
        delete: (payload: Record<string, unknown>) => {
          deletedMessages.push(payload);
          return Promise.resolve({ ok: true });
        },
      },
    },
    datastoreItems,
    postedMessages,
    deletedMessages,
  };
}

function expectError(
  result: Awaited<ReturnType<typeof handleSubmitOutput>>,
): string {
  if (!("error" in result)) {
    throw new Error("Expected an error result");
  }

  return result.error;
}

function expectSuccess(
  result: Awaited<ReturnType<typeof handleSubmitOutput>>,
): { submissionId: string } {
  if (!("outputs" in result)) {
    throw new Error(`Expected success but received error: ${result.error}`);
  }

  return result.outputs;
}

Deno.test("handleSubmitOutput stores a completed submission", async () => {
  setRequiredEnv();
  const { client, datastoreItems, postedMessages } = createClient();
  const notionRequests: unknown[] = [];

  using _stubFetch = stub(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(input, init);
      notionRequests.push(await request.json());
      return new Response('{"id":"page-123"}', { status: 200 });
    },
  );

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "https://example.com/post",
        comment: "hello",
      },
      client,
    );

    const outputs = expectSuccess(result);
    assertExists(outputs.submissionId);
    assertMatch(outputs.submissionId, /^[0-9A-Z]{26}$/);
    assertEquals(datastoreItems.length, 3);
    assertEquals(datastoreItems[0].slack_status, SUBMISSION_STATUS.accepted);
    assertEquals(datastoreItems[1].slack_status, SUBMISSION_STATUS.accepted);
    assertEquals(datastoreItems[1].slack_ts, "1710000000.000100");
    assertEquals(datastoreItems[2].notion_status, SUBMISSION_STATUS.completed);
    assertEquals(datastoreItems[2].notion_page_id, "page-123");
    assertEquals(postedMessages.length, 1);
    assertEquals(postedMessages[0].channel, "COUTPUT");
    assertEquals(notionRequests.length, 1);
    assertEquals(
      (notionRequests[0] as { properties: { URL: { url: string } } }).properties
        .URL.url,
      "https://example.com/post",
    );
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput marks Slack failures in Datastore", async () => {
  setRequiredEnv();
  const { client, datastoreItems, postedMessages } = createClient({
    postMessageOk: false,
    postMessageError: "channel_not_found",
  });

  using _stubFetch = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response('{"id":"page-123"}', { status: 200 })),
  );

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "https://example.com/post",
        comment: "hello",
      },
      client,
    );

    assertEquals(
      expectError(result),
      "Failed to post submission: channel_not_found",
    );
    assertEquals(datastoreItems.length, 2);
    assertEquals(datastoreItems[1].slack_status, SUBMISSION_STATUS.slackFailed);
    assertEquals(postedMessages.length, 2);
    assertEquals(postedMessages[1].channel, "CALERT");
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput marks Notion failures in Datastore", async () => {
  setRequiredEnv();
  const { client, datastoreItems, postedMessages } = createClient();

  using _stubFetch = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response(
          '{"code":"validation_error","message":"Database schema mismatch"}',
          { status: 400 },
        ),
      ),
  );

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "https://example.com/post",
        comment: "hello",
      },
      client,
    );

    assertEquals(
      expectError(result),
      "Failed to save submission to Notion: validation_error: Database schema mismatch",
    );
    assertEquals(datastoreItems.length, 3);
    assertEquals(
      datastoreItems[2].notion_status,
      SUBMISSION_STATUS.notionFailed,
    );
    assertEquals(datastoreItems[2].slack_ts, "1710000000.000100");
    assertEquals(postedMessages.length, 2);
    assertEquals(postedMessages[1].channel, "CALERT");
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput falls back when users.info throws", async () => {
  setRequiredEnv();
  const { client } = createClient({
    usersInfoThrows: true,
  });
  const notionRequests: unknown[] = [];

  using _stubFetch = stub(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(input, init);
      notionRequests.push(await request.json());
      return new Response('{"id":"page-123"}', { status: 200 });
    },
  );

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "https://example.com/post",
      },
      client,
    );

    expectSuccess(result);
    assertEquals(
      (notionRequests[0] as {
        properties: {
          SlackName: { rich_text: Array<{ text: { content: string } }> };
        };
      })
        .properties.SlackName.rich_text[0].text.content,
      "U123",
    );
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput rolls back when final datastore update fails", async () => {
  setRequiredEnv();
  const { client, datastoreItems, deletedMessages } = createClient({
    datastoreFailureCalls: [3, 4, 5],
  });
  const notionRequests: Array<{ url: string; method: string }> = [];

  using _stubFetch = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(input, init);
      notionRequests.push({ url: request.url, method: request.method });
      return Promise.resolve(
        new Response('{"id":"page-123"}', { status: 200 }),
      );
    },
  );

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "https://example.com/post",
      },
      client,
    );

    assertEquals(
      expectError(result),
      "Failed to mark submission as completed: datastore_error",
    );
    assertEquals(
      datastoreItems.at(-1)?.slack_status,
      SUBMISSION_STATUS.rolledBack,
    );
    assertEquals(
      datastoreItems.at(-1)?.notion_status,
      SUBMISSION_STATUS.rolledBack,
    );
    assertEquals(deletedMessages.length, 1);
    assertEquals(deletedMessages[0].ts, "1710000000.000100");
    assertEquals(notionRequests.length, 2);
    assertEquals(notionRequests[1].method, "PATCH");
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput rejects an invalid URL", async () => {
  setRequiredEnv();
  const { client } = createClient();

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "not-a-url",
      },
      client,
    );

    assertEquals(expectError(result), "Submitted URL is invalid");
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput rejects a non-http URL", async () => {
  setRequiredEnv();
  const { client } = createClient();

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "javascript:alert('xss')",
      },
      client,
    );

    assertEquals(
      expectError(result),
      "Submitted URL must use http or https",
    );
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput rejects a blank title", async () => {
  setRequiredEnv();
  const { client } = createClient();

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "   ",
        url: "https://example.com/post",
      },
      client,
    );

    assertEquals(expectError(result), "Submission title is required");
  } finally {
    resetEnv();
  }
});

Deno.test("handleSubmitOutput rejects an oversized comment", async () => {
  setRequiredEnv();
  const { client } = createClient();

  try {
    const result = await handleSubmitOutput(
      {
        user: "U123",
        title: "Weekly note",
        url: "https://example.com/post",
        comment: "a".repeat(1_501),
      },
      client,
    );

    assertEquals(
      expectError(result),
      "Submission comment must be 1500 characters or fewer",
    );
  } finally {
    resetEnv();
  }
});
