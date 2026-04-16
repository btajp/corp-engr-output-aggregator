import { assertEquals, assertMatch } from "@std/assert";
import { handleDailyFailureSummary } from "./daily_failure_summary.ts";
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

Deno.test("handleDailyFailureSummary sends a compact summary", async () => {
  setRequiredEnv();
  const postedMessages: Array<Record<string, unknown>> = [];
  const result = await handleDailyFailureSummary(
    {
      apps: {
        datastore: {
          query: () =>
            Promise.resolve({
              ok: true,
              items: [
                {
                  submission_id: "01AAA",
                  requested_at: "2026-04-16T00:30:00.000Z",
                  title: "Slack failed item",
                  slack_status: SUBMISSION_STATUS.slackFailed,
                  notion_status: SUBMISSION_STATUS.accepted,
                  error_code: "channel_not_found",
                },
                {
                  submission_id: "01BBB",
                  requested_at: "2026-04-16T00:20:00.000Z",
                  title: "Completed item",
                  slack_status: SUBMISSION_STATUS.completed,
                  notion_status: SUBMISSION_STATUS.completed,
                  error_code: "",
                },
              ],
              response_metadata: {},
            }),
        },
      },
      chat: {
        postMessage: (payload) => {
          postedMessages.push(payload as Record<string, unknown>);
          return Promise.resolve({ ok: true });
        },
      },
    },
    new Date("2026-04-16T12:00:00.000Z"),
  );

  if (!("outputs" in result)) {
    throw new Error(result.error);
  }

  assertEquals(result.outputs?.failureCount, 1);
  assertEquals(postedMessages.length, 1);
  assertEquals(postedMessages[0].channel, "CALERT");
  assertMatch(
    String(postedMessages[0].text),
    /daily failure summary 2026-04-16: 1/,
  );
  resetEnv();
});
