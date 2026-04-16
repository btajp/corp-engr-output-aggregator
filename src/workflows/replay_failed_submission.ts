import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ReplaySubmissionFunctionDefinition } from "../functions/replay_submission.ts";

const ReplayFailedSubmissionWorkflow = DefineWorkflow({
  callback_id: "replay_failed_submission_workflow",
  title: "Output Aggregator Replay",
  description: "Replays a failed submission by submission_id.",
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

const form = ReplayFailedSubmissionWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Output Aggregator Replay",
    interactivity: ReplayFailedSubmissionWorkflow.inputs.interactivity,
    submit_label: "Replay",
    fields: {
      elements: [
        {
          name: "submissionId",
          title: "Submission ID",
          type: Schema.types.string,
        },
      ],
      required: ["submissionId"],
    },
  },
);

ReplayFailedSubmissionWorkflow.addStep(ReplaySubmissionFunctionDefinition, {
  user: ReplayFailedSubmissionWorkflow.inputs.user,
  submissionId: form.outputs.fields.submissionId,
});

export default ReplayFailedSubmissionWorkflow;
