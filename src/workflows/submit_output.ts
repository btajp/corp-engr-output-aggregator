import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SubmitOutputFunctionDefinition } from "../functions/submit_output.ts";

const SubmitOutputWorkflow = DefineWorkflow({
  callback_id: "submit_output_workflow",
  title: "Submit PRJ output",
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
    },
    required: ["interactivity", "user"],
  },
});

const form = SubmitOutputWorkflow.addStep(Schema.slack.functions.OpenForm, {
  title: "Submit PRJ output",
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
  title: form.outputs.fields.title,
  url: form.outputs.fields.url,
  comment: form.outputs.fields.comment,
});

export default SubmitOutputWorkflow;
