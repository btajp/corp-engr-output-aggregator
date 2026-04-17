import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import SubmitOutputWorkflow from "../workflows/submit_output.ts";

const SubmitOutputTestLinkTrigger: Trigger<
  typeof SubmitOutputWorkflow.definition
> = {
  type: TriggerTypes.Shortcut,
  name: "Output Aggregator V3 Test",
  description: "アウトプットを投稿する (test-output)",
  workflow: `#/workflows/${SubmitOutputWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: TriggerContextData.Shortcut.interactivity,
    },
    user: {
      value: TriggerContextData.Shortcut.user_id,
    },
    channelId: {
      value: "C0AT62PR96Z",
    },
  },
};

export default SubmitOutputTestLinkTrigger;
