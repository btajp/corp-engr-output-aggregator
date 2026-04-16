import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import SubmitOutputWorkflow from "../workflows/submit_output.ts";

const SubmitOutputLinkTrigger: Trigger<typeof SubmitOutputWorkflow.definition> =
  {
    type: TriggerTypes.Shortcut,
    name: "Submit PRJ output",
    description: "Opens the PRJ output submission form.",
    workflow: `#/workflows/${SubmitOutputWorkflow.definition.callback_id}`,
    inputs: {
      interactivity: {
        value: TriggerContextData.Shortcut.interactivity,
      },
      user: {
        value: TriggerContextData.Shortcut.user_id,
      },
    },
  };

export default SubmitOutputLinkTrigger;
