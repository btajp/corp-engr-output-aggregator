import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { getConfig } from "../lib/config.ts";
import { sendDailyFailureSummary } from "../lib/alert.ts";
import { SUBMISSION_STATUS } from "../lib/submission_status.ts";

const PAGE_LIMIT = 100;

export const DailyFailureSummaryFunctionDefinition = DefineFunction({
  callback_id: "daily_failure_summary",
  title: "Send daily failure summary",
  description:
    "Sends a daily summary of failed submissions to the alert channel.",
  source_file: "src/functions/daily_failure_summary.ts",
  input_parameters: {
    properties: {},
    required: [],
  },
  output_parameters: {
    properties: {
      failureCount: {
        type: Schema.types.integer,
      },
    },
    required: ["failureCount"],
  },
});

type SubmissionLogItem = {
  submission_id: string;
  requested_at: string;
  title: string;
  slack_status: string;
  notion_status: string;
  error_code: string;
};

type DailySummaryClient = {
  apps: {
    datastore: {
      query(args: {
        datastore: string;
        limit: number;
        cursor?: string;
      }): Promise<{
        ok: boolean;
        error?: string;
        items?: Array<Record<string, unknown>>;
        response_metadata?: {
          next_cursor?: string;
        };
      }>;
    };
  };
  chat: {
    postMessage(args: {
      channel: string;
      text: string;
      blocks: unknown[];
    }): Promise<{ ok: boolean; error?: string }>;
  };
};

function isFailureRecord(item: SubmissionLogItem) {
  return item.slack_status === SUBMISSION_STATUS.slackFailed ||
    item.notion_status === SUBMISSION_STATUS.notionFailed ||
    item.slack_status === SUBMISSION_STATUS.rolledBack ||
    item.notion_status === SUBMISSION_STATUS.rolledBack ||
    item.slack_status === SUBMISSION_STATUS.validationFailed ||
    item.notion_status === SUBMISSION_STATUS.validationFailed;
}

function summarizeStatus(item: SubmissionLogItem) {
  if (
    item.slack_status === SUBMISSION_STATUS.validationFailed ||
    item.notion_status === SUBMISSION_STATUS.validationFailed
  ) {
    return "validation_failed";
  }
  if (item.slack_status === SUBMISSION_STATUS.slackFailed) {
    return "slack_failed";
  }
  if (item.notion_status === SUBMISSION_STATUS.notionFailed) {
    return "notion_failed";
  }
  if (
    item.slack_status === SUBMISSION_STATUS.rolledBack ||
    item.notion_status === SUBMISSION_STATUS.rolledBack
  ) {
    return "rolled_back";
  }
  return "unknown";
}

function normalizeItem(
  item: Record<string, unknown>,
): SubmissionLogItem | undefined {
  const submissionId = typeof item.submission_id === "string"
    ? item.submission_id
    : undefined;
  const requestedAt = typeof item.requested_at === "string"
    ? item.requested_at
    : undefined;
  const title = typeof item.title === "string" ? item.title : undefined;
  const slackStatus = typeof item.slack_status === "string"
    ? item.slack_status
    : undefined;
  const notionStatus = typeof item.notion_status === "string"
    ? item.notion_status
    : undefined;

  if (
    !submissionId || !requestedAt || !title || !slackStatus || !notionStatus
  ) {
    return undefined;
  }

  return {
    submission_id: submissionId,
    requested_at: requestedAt,
    title,
    slack_status: slackStatus,
    notion_status: notionStatus,
    error_code: typeof item.error_code === "string" ? item.error_code : "",
  };
}

async function collectFailureItems(client: DailySummaryClient, since: string) {
  const items: SubmissionLogItem[] = [];
  let cursor: string | undefined;

  while (true) {
    const response = await client.apps.datastore.query({
      datastore: "SubmissionLogs",
      limit: PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    });

    if (!response.ok) {
      throw new Error(response.error ?? "datastore_query_failed");
    }

    for (const rawItem of response.items ?? []) {
      const item = normalizeItem(rawItem);
      if (item && item.requested_at >= since && isFailureRecord(item)) {
        items.push(item);
      }
    }

    cursor = response.response_metadata?.next_cursor;
    if (!cursor) {
      return items;
    }
  }
}

export async function handleDailyFailureSummary(
  client: DailySummaryClient,
  now = new Date(),
  env?: Record<string, string>,
) {
  const config = getConfig(env);
  const sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString();
  const items = await collectFailureItems(client, since);
  const latestItems = items
    .sort((left, right) => right.requested_at.localeCompare(left.requested_at))
    .slice(0, 10);

  const slackFailures =
    items.filter((item) => item.slack_status === SUBMISSION_STATUS.slackFailed)
      .length;
  const notionFailures =
    items.filter((item) =>
      item.notion_status === SUBMISSION_STATUS.notionFailed
    ).length;
  const validationFailures =
    items.filter((item) =>
      item.slack_status === SUBMISSION_STATUS.validationFailed ||
      item.notion_status === SUBMISSION_STATUS.validationFailed
    ).length;
  const rolledBackCount =
    items.filter((item) =>
      item.slack_status === SUBMISSION_STATUS.rolledBack ||
      item.notion_status === SUBMISSION_STATUS.rolledBack
    ).length;

  const response = await sendDailyFailureSummary(client, {
    channelId: config.alertChannelId,
    summaryDateLabel: now.toISOString().slice(0, 10),
    totalFailures: items.length,
    slackFailures,
    notionFailures,
    validationFailures,
    rolledBackCount,
    lines: latestItems.map((item) =>
      `- \`${item.submission_id}\` ${summarizeStatus(item)} ${item.title} (${
        item.error_code || "no_error_code"
      })`
    ),
  });

  if (!response.ok) {
    return { error: `Failed to send daily summary: ${response.error}` };
  }

  return {
    outputs: {
      failureCount: items.length,
    },
  };
}

export default SlackFunction(
  DailyFailureSummaryFunctionDefinition,
  async ({ client, env }) =>
    await handleDailyFailureSummary(client, new Date(), env),
);
