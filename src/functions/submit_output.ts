import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { resolveCoverImage } from "../lib/cover-image.ts";
import { getConfig } from "../lib/config.ts";
import { sendFailureAlert } from "../lib/alert.ts";
import { archiveNotionPage, createNotionPageWithRetry } from "../lib/notion.ts";
import {
  buildOutputMessage,
  resolveSlackUserProfile,
} from "../lib/slack-message.ts";
import { SUBMISSION_STATUS } from "../lib/submission_status.ts";

const MAX_TITLE_LENGTH = 200;
const MAX_URL_LENGTH = 2_000;
const MAX_COMMENT_LENGTH = 1_500;
const DATASTORE_PUT_ATTEMPTS = 3;

export const SubmitOutputFunctionDefinition = DefineFunction({
  callback_id: "submit_output",
  title: "Store output submission",
  description:
    "Creates an accepted submission record and validates runtime config.",
  source_file: "src/functions/submit_output.ts",
  input_parameters: {
    properties: {
      user: {
        type: Schema.slack.types.user_id,
        description: "The user submitting the output.",
      },
      title: {
        type: Schema.types.string,
        description: "Submission title.",
      },
      url: {
        type: Schema.types.string,
        description: "Submitted URL.",
      },
      comment: {
        type: Schema.types.string,
        description: "Optional comment attached to the submission.",
      },
    },
    required: ["user", "title", "url"],
  },
  output_parameters: {
    properties: {
      submissionId: {
        type: Schema.types.string,
        description: "Accepted submission ID.",
      },
    },
    required: ["submissionId"],
  },
});

function createSubmissionId() {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let time = Date.now();
  let encodedTime = "";

  for (let index = 0; index < 10; index += 1) {
    encodedTime = alphabet[time % 32] + encodedTime;
    time = Math.floor(time / 32);
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  let encodedRandom = "";
  let buffer = 0;
  let bits = 0;

  for (const byte of randomBytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5 && encodedRandom.length < 16) {
      encodedRandom += alphabet[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  while (encodedRandom.length < 16) {
    encodedRandom += alphabet[0];
  }

  return `${encodedTime}${encodedRandom.slice(0, 16)}`;
}

type SubmissionLogItem = {
  submission_id: string;
  requested_at: string;
  requested_by: string;
  title: string;
  url: string;
  comment: string;
  cover_image_url: string;
  slack_status: string;
  slack_ts: string;
  notion_status: string;
  notion_page_id: string;
  error_code: string;
  error_message: string;
};

type SubmitOutputClient = {
  apps: {
    datastore: {
      put(args: {
        datastore: string;
        item: SubmissionLogItem;
      }): Promise<{ ok: boolean; error?: string }>;
    };
  };
  chat: {
    postMessage(args: {
      channel: string;
      text: string;
      blocks: unknown[];
    }): Promise<{ ok: boolean; error?: string; ts?: string }>;
    delete(args: {
      channel: string;
      ts: string;
    }): Promise<{ ok: boolean; error?: string }>;
  };
  users: {
    info(args: { user: string }): Promise<{
      ok: boolean;
      error?: string;
      user?: {
        real_name?: string;
        profile?: {
          display_name?: string;
          real_name?: string;
          image_192?: string;
          image_512?: string;
        };
      };
    }>;
  };
};

type SubmitOutputResult =
  | { outputs: { submissionId: string } }
  | { error: string };

async function notifyFailure(
  client: SubmitOutputClient,
  config: ReturnType<typeof getConfig>,
  input: {
    submissionId: string;
    title: string;
    errorCode: string;
    errorMessage: string;
  },
) {
  try {
    await sendFailureAlert(client, {
      channelId: config.alertChannelId,
      submissionId: input.submissionId,
      title: input.title,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });
  } catch {
    // Alert failure should not hide the original error.
  }
}

async function putSubmission(
  client: SubmitOutputClient,
  item: SubmissionLogItem,
) {
  let lastResponse: { ok: boolean; error?: string } = {
    ok: false,
    error: "datastore_put_unreachable",
  };

  for (let attempt = 0; attempt < DATASTORE_PUT_ATTEMPTS; attempt += 1) {
    lastResponse = await client.apps.datastore.put({
      datastore: "SubmissionLogs",
      item,
    });
    if (lastResponse.ok) {
      return lastResponse;
    }
  }

  return lastResponse;
}

async function rollbackSubmission(
  client: SubmitOutputClient,
  config: ReturnType<typeof getConfig>,
  record: Pick<SubmissionLogItem, "slack_ts" | "notion_page_id">,
) {
  const rollbackErrors: string[] = [];
  let slackRolledBack = false;
  let notionRolledBack = false;

  if (record.notion_page_id) {
    try {
      await archiveNotionPage({
        token: config.notionToken,
        pageId: record.notion_page_id,
      });
      notionRolledBack = true;
    } catch (error) {
      rollbackErrors.push(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (record.slack_ts) {
    try {
      const response = await client.chat.delete({
        channel: config.outputChannelId,
        ts: record.slack_ts,
      });
      if (!response.ok) {
        rollbackErrors.push(response.error ?? "slack_delete_failed");
      } else {
        slackRolledBack = true;
      }
    } catch (error) {
      rollbackErrors.push(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    errors: rollbackErrors,
    slackRolledBack,
    notionRolledBack,
  };
}

async function persistRollbackState(
  client: SubmitOutputClient,
  record: SubmissionLogItem,
  rollback: {
    slackRolledBack: boolean;
    notionRolledBack: boolean;
  },
  errorMessage: string,
) {
  return await putSubmission(client, {
    ...record,
    slack_status: rollback.slackRolledBack
      ? SUBMISSION_STATUS.rolledBack
      : record.slack_status,
    notion_status: rollback.notionRolledBack
      ? SUBMISSION_STATUS.rolledBack
      : record.notion_status,
    error_code: "rolled_back",
    error_message: errorMessage,
  });
}

function validateInputs(inputs: {
  title: string;
  url: string;
  comment?: string;
}): { title: string; url: string; comment: string } | { error: string } {
  const title = inputs.title.trim();
  const url = inputs.url.trim();
  const comment = inputs.comment ?? "";

  if (!title) {
    return { error: "Submission title is required" };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return {
      error: `Submission title must be ${MAX_TITLE_LENGTH} characters or fewer`,
    };
  }

  if (!url) {
    return { error: "Submitted URL is required" };
  }

  if (url.length > MAX_URL_LENGTH) {
    return {
      error: `Submitted URL must be ${MAX_URL_LENGTH} characters or fewer`,
    };
  }

  if (comment.length > MAX_COMMENT_LENGTH) {
    return {
      error:
        `Submission comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
    };
  }

  return {
    title,
    url,
    comment,
  };
}

export async function handleSubmitOutput(
  inputs: {
    user: string;
    title: string;
    url: string;
    comment?: string;
  },
  client: SubmitOutputClient,
): Promise<SubmitOutputResult> {
  const config = getConfig();
  const validatedInputs = validateInputs(inputs);
  if ("error" in validatedInputs) {
    return validatedInputs;
  }

  const submissionId = createSubmissionId();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(validatedInputs.url);
  } catch {
    return { error: "Submitted URL is invalid" };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { error: "Submitted URL must use http or https" };
  }

  const requestedAt = new Date().toISOString();
  const coverImageUrl = await resolveCoverImage({
    defaultCoverImageUrl: config.defaultCoverImageUrl,
    targetUrl: parsedUrl.toString(),
    ogpProxyUrl: config.ogpProxyUrl,
    ogpProxySharedSecretActive: config.ogpProxySharedSecretActive,
  });
  let record: SubmissionLogItem = {
    submission_id: submissionId,
    requested_at: requestedAt,
    requested_by: inputs.user,
    title: validatedInputs.title,
    url: parsedUrl.toString(),
    comment: validatedInputs.comment,
    cover_image_url: coverImageUrl,
    slack_status: SUBMISSION_STATUS.accepted,
    slack_ts: "",
    notion_status: SUBMISSION_STATUS.accepted,
    notion_page_id: "",
    error_code: "",
    error_message: "",
  };

  const initialPutResponse = await putSubmission(client, record);
  if (!initialPutResponse.ok) {
    return {
      error: `Failed to store submission: ${initialPutResponse.error}`,
    };
  }

  const profile = await resolveSlackUserProfile(client, inputs.user).catch(
    (): { displayName: string; imageUrl?: string } => ({
      displayName: inputs.user,
    }),
  );
  const postMessageResponse = await client.chat.postMessage({
    channel: config.outputChannelId,
    ...buildOutputMessage({
      title: validatedInputs.title,
      url: parsedUrl.toString(),
      comment: validatedInputs.comment,
      mention: `<@${inputs.user}>`,
      coverImageUrl,
      outputArchiveUrl: config.outputArchiveUrl,
    }),
  });

  if (!postMessageResponse.ok || !postMessageResponse.ts) {
    record = {
      ...record,
      slack_status: SUBMISSION_STATUS.slackFailed,
      error_code: postMessageResponse.error ?? "slack_post_failed",
      error_message: "Failed to post the submission to Slack",
    };
    const failedPutResponse = await putSubmission(client, record);
    await notifyFailure(client, config, {
      submissionId,
      title: validatedInputs.title,
      errorCode: record.error_code,
      errorMessage: record.error_message,
    });
    if (!failedPutResponse.ok) {
      return {
        error:
          `Failed to post submission and persist failure state: ${failedPutResponse.error}`,
      };
    }
    return {
      error: `Failed to post submission: ${
        postMessageResponse.error ?? "slack_post_failed"
      }`,
    };
  }

  record = {
    ...record,
    slack_ts: postMessageResponse.ts,
  };

  const slackPersistResponse = await putSubmission(client, record);
  if (!slackPersistResponse.ok) {
    const rollback = await rollbackSubmission(client, config, record);
    const rollbackMessage = rollback.errors.length === 0
      ? `Failed to update submission after Slack post: ${slackPersistResponse.error}`
      : `Failed to update submission after Slack post: ${slackPersistResponse.error}; rollback=${
        rollback.errors.join(", ")
      }`;
    const rollbackPersistResponse = await persistRollbackState(
      client,
      record,
      rollback,
      rollbackMessage,
    );
    return {
      error: rollbackPersistResponse.ok
        ? rollbackMessage
        : `${rollbackMessage}; rollback_state=${rollbackPersistResponse.error}`,
    };
  }

  try {
    const notionResponse = await createNotionPageWithRetry({
      token: config.notionToken,
      databaseId: config.notionDatabaseId,
      title: validatedInputs.title,
      url: parsedUrl.toString(),
      comment: validatedInputs.comment,
      slackName: profile.displayName,
      slackTs: postMessageResponse.ts,
      slackUserId: inputs.user,
      coverImageUrl,
      userIconUrl: profile.imageUrl,
    });

    record = {
      ...record,
      slack_status: SUBMISSION_STATUS.completed,
      notion_status: SUBMISSION_STATUS.completed,
      notion_page_id: notionResponse.pageId,
    };
  } catch (error) {
    record = {
      ...record,
      notion_status: SUBMISSION_STATUS.notionFailed,
      error_code: "notion_create_failed",
      error_message: error instanceof Error ? error.message : String(error),
    };
    const failedPutResponse = await putSubmission(client, record);
    await notifyFailure(client, config, {
      submissionId,
      title: validatedInputs.title,
      errorCode: record.error_code,
      errorMessage: record.error_message,
    });
    if (!failedPutResponse.ok) {
      const rollback = await rollbackSubmission(client, config, record);
      const rollbackMessage = rollback.errors.length === 0
        ? `Failed to save submission to Notion and persist failure state: ${failedPutResponse.error}`
        : `Failed to save submission to Notion and persist failure state: ${failedPutResponse.error}; rollback=${
          rollback.errors.join(", ")
        }`;
      const rollbackPersistResponse = await persistRollbackState(
        client,
        record,
        rollback,
        rollbackMessage,
      );
      return {
        error: rollbackPersistResponse.ok
          ? rollbackMessage
          : `${rollbackMessage}; rollback_state=${rollbackPersistResponse.error}`,
      };
    }
    return {
      error: `Failed to save submission to Notion: ${record.error_message}`,
    };
  }

  const completedPutResponse = await putSubmission(client, record);
  if (!completedPutResponse.ok) {
    const rollback = await rollbackSubmission(client, config, record);
    const rollbackMessage = rollback.errors.length === 0
      ? `Failed to mark submission as completed: ${completedPutResponse.error}`
      : `Failed to mark submission as completed: ${completedPutResponse.error}; rollback=${
        rollback.errors.join(", ")
      }`;
    const rollbackPersistResponse = await persistRollbackState(
      client,
      record,
      rollback,
      rollbackMessage,
    );
    return {
      error: rollbackPersistResponse.ok
        ? rollbackMessage
        : `${rollbackMessage}; rollback_state=${rollbackPersistResponse.error}`,
    };
  }

  return {
    outputs: {
      submissionId,
    },
  };
}

export default SlackFunction(
  SubmitOutputFunctionDefinition,
  async ({ inputs, client }) => await handleSubmitOutput(inputs, client),
);
