import { assertEquals, assertExists } from "@std/assert";
import { stub } from "@std/testing/mock";
import { handleReplaySubmission } from "./replay_submission.ts";
import { SUBMISSION_STATUS } from "../lib/submission_status.ts";

const ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID",
  "OUTPUT_CHANNEL_ID",
  "ALERT_CHANNEL_ID",
  "DEFAULT_COVER_IMAGE_URL",
  "REPLAY_ALLOWED_USER_IDS",
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
  Deno.env.set("REPLAY_ALLOWED_USER_IDS", "UADMIN");
}

function createClient(recordOverrides?: Partial<Record<string, string>>) {
  const storedItems: Array<Record<string, string>> = [];
  const postedMessages: Array<Record<string, unknown>> = [];
  const baseRecord: Record<string, string> = {
    submission_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    requested_at: new Date().toISOString(),
    requested_by: "U123",
    title: "Weekly note",
    url: "https://example.com/post",
    comment: "hello",
    cover_image_url: "https://example.com/default-cover.png",
    slack_status: SUBMISSION_STATUS.slackFailed,
    slack_ts: "",
    notion_status: SUBMISSION_STATUS.accepted,
    notion_page_id: "",
    error_code: "slack_post_failed",
    error_message: "Failed previously",
    ...recordOverrides,
  };

  return {
    client: {
      apps: {
        datastore: {
          get: () =>
            Promise.resolve({ ok: true, item: structuredClone(baseRecord) }),
          put: (
            { item }: { datastore: string; item: Record<string, string> },
          ) => {
            storedItems.push(structuredClone(item));
            return Promise.resolve({ ok: true });
          },
        },
      },
      chat: {
        postMessage: (payload: Record<string, unknown>) => {
          postedMessages.push(payload);
          return Promise.resolve({ ok: true, ts: "1710000000.000100" });
        },
      },
      users: {
        info: () =>
          Promise.resolve({
            ok: true,
            user: {
              profile: {
                display_name: "okash1n",
                image_512: "https://example.com/avatar.png",
              },
            },
          }),
      },
    },
    storedItems,
    postedMessages,
  };
}

Deno.test("handleReplaySubmission replays Slack and Notion for slack_failed", async () => {
  setRequiredEnv();
  const { client, storedItems, postedMessages } = createClient();

  using _stubFetch = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response('{"id":"page-123"}', { status: 200 })),
  );

  try {
    const result = await handleReplaySubmission(
      { user: "UADMIN", submissionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      client,
    );

    if (!("outputs" in result)) {
      throw new Error(result.error);
    }
    assertExists(result.outputs?.submissionId);
    assertEquals(postedMessages.length, 1);
    assertEquals(storedItems.at(-1)?.slack_status, SUBMISSION_STATUS.completed);
    assertEquals(
      storedItems.at(-1)?.notion_status,
      SUBMISSION_STATUS.completed,
    );
  } finally {
    resetEnv();
  }
});

Deno.test("handleReplaySubmission only retries Notion for notion_failed", async () => {
  setRequiredEnv();
  const { client, storedItems, postedMessages } = createClient({
    slack_status: SUBMISSION_STATUS.completed,
    slack_ts: "1710000000.000100",
    notion_status: SUBMISSION_STATUS.notionFailed,
    notion_page_id: "",
  });

  using _stubFetch = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response('{"id":"page-123"}', { status: 200 })),
  );

  try {
    const result = await handleReplaySubmission(
      { user: "UADMIN", submissionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      client,
    );

    if (!("outputs" in result)) {
      throw new Error(result.error);
    }
    assertEquals(postedMessages.length, 0);
    assertEquals(
      storedItems.at(-1)?.notion_status,
      SUBMISSION_STATUS.completed,
    );
  } finally {
    resetEnv();
  }
});

Deno.test("handleReplaySubmission rejects unauthorized users", async () => {
  setRequiredEnv();
  const { client } = createClient();

  const result = await handleReplaySubmission(
    { user: "UNAUTHORIZED", submissionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
    client,
  );

  if (!("error" in result)) {
    throw new Error("Expected unauthorized replay to fail");
  }
  assertEquals(result.error, "You are not allowed to replay submissions");
  resetEnv();
});

Deno.test("handleReplaySubmission is idempotent after a completed replay", async () => {
  setRequiredEnv();
  const { client, postedMessages } = createClient({
    slack_status: SUBMISSION_STATUS.completed,
    slack_ts: "1710000000.000100",
    notion_status: SUBMISSION_STATUS.completed,
    notion_page_id: "page-123",
  });

  const result = await handleReplaySubmission(
    { user: "UADMIN", submissionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
    client,
  );

  if (!("outputs" in result)) {
    throw new Error(result.error);
  }
  assertEquals(postedMessages.length, 0);
  resetEnv();
});
