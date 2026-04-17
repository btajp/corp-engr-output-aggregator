import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SubmitOutputFunctionDefinition } from "../functions/submit_output.ts";

const SubmitOutputWorkflow = DefineWorkflow({
  callback_id: "submit_output_workflow",
  title: "Output Aggregator V3",
  description:
    "Collects a title, URL, and comment for a PRJ output submission.",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
      user: {
        type: Schema.slack.types.user_id,
      },
      channelId: {
        type: Schema.slack.types.channel_id,
      },
    },
    required: ["interactivity", "user", "channelId"],
  },
});

const form = SubmitOutputWorkflow.addStep(Schema.slack.functions.OpenForm, {
  title: "Output Aggregator V3",
  interactivity: SubmitOutputWorkflow.inputs.interactivity,
  submit_label: "Submit",
  fields: {
    elements: [
      {
        name: "title",
        title: "Title",
        type: Schema.types.string,
      },
      {
        name: "url",
        title: "URL",
        type: Schema.types.string,
      },
      {
        name: "comment",
        title: "Comment",
        type: Schema.types.string,
        long: true,
      },
    ],
    required: ["title", "url"],
  },
});

SubmitOutputWorkflow.addStep(SubmitOutputFunctionDefinition, {
  user: SubmitOutputWorkflow.inputs.user,
  channelId: SubmitOutputWorkflow.inputs.channelId,
  title: form.outputs.fields.title,
  url: form.outputs.fields.url,
  comment: form.outputs.fields.comment,
});

export default SubmitOutputWorkflow;
