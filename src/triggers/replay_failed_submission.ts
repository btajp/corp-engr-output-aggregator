import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import ReplayFailedSubmissionWorkflow from "../workflows/replay_failed_submission.ts";

const ReplayFailedSubmissionTrigger: Trigger<
  typeof ReplayFailedSubmissionWorkflow.definition
> = {
  type: TriggerTypes.Shortcut,
  name: "Output Aggregator Replay",
  description: "失敗した submission を再実行する",
  workflow:
    `#/workflows/${ReplayFailedSubmissionWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: TriggerContextData.Shortcut.interactivity,
    },
    user: {
      value: TriggerContextData.Shortcut.user_id,
    },
  },
};

export default ReplayFailedSubmissionTrigger;
