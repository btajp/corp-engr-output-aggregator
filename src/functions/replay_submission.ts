import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { getConfig } from "../lib/config.ts";
import {
  resolveOgpPreview,
} from "../lib/cover-image.ts";
import {
  buildOutputMessage,
  resolveSlackUserProfile,
  type SlackUserProfile,
} from "../lib/slack-message.ts";
import { createNotionPageWithRetry } from "../lib/notion.ts";
import { SUBMISSION_STATUS } from "../lib/submission_status.ts";
import { sendFailureAlert } from "../lib/alert.ts";

const TEST_OUTPUT_CHANNEL_ID = "C0AT62PR96Z";

export const ReplaySubmissionFunctionDefinition = DefineFunction({
  callback_id: "replay_submission",
  title: "Replay failed submission",
  description: "Replays a failed submission from the datastore.",
  source_file: "src/functions/replay_submission.ts",
  input_parameters: {
    properties: {
      user: {
        type: Schema.slack.types.user_id,
      },
      submissionId: {
        type: Schema.types.string,
      },
    },
    required: ["user", "submissionId"],
  },
  output_parameters: {
    properties: {
      submissionId: {
        type: Schema.types.string,
      },
    },
    required: ["submissionId"],
  },
});

type ReplayClient = {
  apps: {
    datastore: {
      get(args: { datastore: string; id: string }): Promise<{
        ok: boolean;
        error?: string;
        item?: Record<string, string>;
      }>;
      put(args: { datastore: string; item: Record<string, string> }): Promise<{
        ok: boolean;
        error?: string;
      }>;
    };
  };
  chat: {
    postMessage(args: {
      channel: string;
      text: string;
      blocks: unknown[];
      unfurl_links?: boolean;
      unfurl_media?: boolean;
    }): Promise<{ ok: boolean; error?: string; ts?: string }>;
  };
  users: {
    info(args: { user: string }): Promise<{
      ok: boolean;
      user?: {
        profile?: {
          display_name?: string;
          real_name?: string;
          image_512?: string;
          image_192?: string;
        };
        real_name?: string;
      };
    }>;
  };
};

function canReplay(userId: string, allowedUserIds: string[]) {
  return allowedUserIds.includes(userId);
}

function shouldSkipNotion(channelId: string | undefined) {
  return channelId === TEST_OUTPUT_CHANNEL_ID;
}

export async function handleReplaySubmission(
  inputs: { user: string; submissionId: string },
  client: ReplayClient,
  env?: Record<string, string>,
) {
  const config = getConfig(env);
  if (!canReplay(inputs.user, config.replayAllowedUserIds)) {
    return { error: "You are not allowed to replay submissions" };
  }

  const getResponse = await client.apps.datastore.get({
    datastore: "SubmissionLogs",
    id: inputs.submissionId,
  });
  if (!getResponse.ok || !getResponse.item) {
    return {
      error: `Failed to load submission: ${getResponse.error ?? "not_found"}`,
    };
  }

  const record = structuredClone(getResponse.item);
  const outputChannelId = record.output_channel_id || config.outputChannelId;
  const shouldReplaySlack = !record.slack_ts ||
    record.slack_status === SUBMISSION_STATUS.slackFailed ||
    record.slack_status === SUBMISSION_STATUS.rolledBack;
  const shouldReplayNotion = !shouldSkipNotion(outputChannelId) &&
    (!record.notion_page_id ||
      record.notion_status === SUBMISSION_STATUS.notionFailed ||
      record.notion_status === SUBMISSION_STATUS.rolledBack);

  if (!shouldReplaySlack && !shouldReplayNotion) {
    return { outputs: { submissionId: inputs.submissionId } };
  }

  const profile: SlackUserProfile = await resolveSlackUserProfile(
    client,
    record.requested_by,
  ).catch(() => ({ displayName: record.requested_by, imageUrl: undefined }));

  if (shouldReplaySlack) {
    const ogpPreview = await resolveOgpPreview({
      defaultCoverImageUrl: config.defaultCoverImageUrl,
      targetUrl: record.url,
      ogpProxyUrl: config.ogpProxyUrl,
      ogpProxySharedSecretActive: config.ogpProxySharedSecretActive,
    });
    const coverImageUrl = ogpPreview.coverImageUrl;
    const slackCoverImageUrl = coverImageUrl === config.defaultCoverImageUrl
      ? undefined
      : coverImageUrl;
    const slackResponse = await client.chat.postMessage({
      channel: outputChannelId,
      unfurl_links: false,
      unfurl_media: false,
      ...buildOutputMessage({
        title: record.title,
        url: record.url,
        comment: record.comment,
        mention: `<@${record.requested_by}>`,
        posterImageUrl: profile.imageUrl,
        coverImageUrl: slackCoverImageUrl,
        outputArchiveUrl: config.outputArchiveUrl,
        ogpTitle: ogpPreview.title,
        ogpDescription: ogpPreview.description,
        ogpSiteName: ogpPreview.siteName,
      }),
    });

    if (!slackResponse.ok || !slackResponse.ts) {
      await sendFailureAlert(client, {
        channelId: config.alertChannelId,
        submissionId: record.submission_id,
        userId: record.requested_by,
        title: record.title,
        errorCode: slackResponse.error ?? "slack_replay_failed",
        errorMessage: "Replay failed while posting to Slack",
      });
      return {
        error: `Replay failed while posting to Slack: ${
          slackResponse.error ?? "unknown_error"
        }`,
      };
    }

    record.slack_ts = slackResponse.ts;
    record.slack_status = SUBMISSION_STATUS.completed;
    record.cover_image_url = coverImageUrl;
    record.output_channel_id = outputChannelId;
  }

  if (shouldSkipNotion(outputChannelId)) {
    record.notion_status = SUBMISSION_STATUS.completed;
    record.notion_page_id = "";
  }

  if (shouldReplayNotion) {
    try {
      const notionResponse = await createNotionPageWithRetry({
        token: config.notionToken,
        databaseId: config.notionDatabaseId,
        title: record.title,
        url: record.url,
        comment: record.comment,
        slackName: profile.displayName,
        slackTs: record.slack_ts,
        slackUserId: record.requested_by,
        coverImageUrl: record.cover_image_url,
        userIconUrl: profile.imageUrl,
      });
      record.notion_page_id = notionResponse.pageId;
      record.notion_status = SUBMISSION_STATUS.completed;
    } catch (error) {
      record.notion_status = SUBMISSION_STATUS.notionFailed;
      record.error_code = "notion_replay_failed";
      record.error_message = error instanceof Error
        ? error.message
        : String(error);
      await client.apps.datastore.put({
        datastore: "SubmissionLogs",
        item: record,
      });
      await sendFailureAlert(client, {
        channelId: config.alertChannelId,
        submissionId: record.submission_id,
        userId: record.requested_by,
        title: record.title,
        errorCode: record.error_code,
        errorMessage: record.error_message,
      });
      return {
        error: `Replay failed while saving to Notion: ${record.error_message}`,
      };
    }
  }

  record.error_code = "";
  record.error_message = "";

  const putResponse = await client.apps.datastore.put({
    datastore: "SubmissionLogs",
    item: record,
  });
  if (!putResponse.ok) {
    return {
      error: `Failed to persist replay result: ${putResponse.error}`,
    };
  }

  return {
    outputs: {
      submissionId: inputs.submissionId,
    },
  };
}

export default SlackFunction(
  ReplaySubmissionFunctionDefinition,
  async ({ inputs, client, env }) =>
    await handleReplaySubmission(inputs, client, env),
);
