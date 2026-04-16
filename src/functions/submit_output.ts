import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import type SubmissionLogDatastore from "../datastores/submission_log.ts";
import { getConfig } from "../lib/config.ts";
import { SUBMISSION_STATUS } from "../lib/submission_status.ts";

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

export default SlackFunction(
  SubmitOutputFunctionDefinition,
  async ({ inputs, client }) => {
    const config = getConfig();
    const submissionId = createSubmissionId();
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(inputs.url);
    } catch {
      return { error: "Submitted URL is invalid" };
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { error: "Submitted URL must use http or https" };
    }

    const putResponse = await client.apps.datastore.put<
      typeof SubmissionLogDatastore.definition
    >({
      datastore: "SubmissionLogs",
      item: {
        submission_id: submissionId,
        requested_at: new Date().toISOString(),
        requested_by: inputs.user,
        title: inputs.title,
        url: parsedUrl.toString(),
        comment: inputs.comment ?? "",
        cover_image_url: config.defaultCoverImageUrl,
        slack_status: SUBMISSION_STATUS.accepted,
        slack_ts: "",
        notion_status: SUBMISSION_STATUS.accepted,
        notion_page_id: "",
        error_code: "",
        error_message: "",
      },
    });

    if (!putResponse.ok) {
      return {
        error: `Failed to store submission: ${putResponse.error}`,
      };
    }

    return {
      outputs: {
        submissionId,
      },
    };
  },
);
