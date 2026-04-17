import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

const SubmissionLogDatastore = DefineDatastore({
  name: "SubmissionLogs",
  primary_key: "submission_id",
  attributes: {
    submission_id: { type: Schema.types.string },
    requested_at: { type: Schema.types.string },
    requested_by: { type: Schema.types.string },
    output_channel_id: { type: Schema.types.string },
    title: { type: Schema.types.string },
    url: { type: Schema.types.string },
    comment: { type: Schema.types.string },
    cover_image_url: { type: Schema.types.string },
    slack_status: { type: Schema.types.string },
    slack_ts: { type: Schema.types.string },
    notion_status: { type: Schema.types.string },
    notion_page_id: { type: Schema.types.string },
    error_code: { type: Schema.types.string },
    error_message: { type: Schema.types.string },
  },
});

export default SubmissionLogDatastore;
