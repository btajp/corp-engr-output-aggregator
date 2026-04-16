import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import { SCHEDULE_FREQUENCY } from "deno-slack-api/typed-method-types/workflows/triggers/scheduled.ts";
import DailyFailureSummaryWorkflow from "../workflows/daily_failure_summary.ts";

const DailyFailureSummaryTrigger: Trigger<
  typeof DailyFailureSummaryWorkflow.definition
> = {
  type: TriggerTypes.Scheduled,
  name: "Output Aggregator Daily Summary",
  description: "前日分の失敗サマリを毎朝送る",
  workflow: `#/workflows/${DailyFailureSummaryWorkflow.definition.callback_id}`,
  inputs: {},
  schedule: {
    start_time: "2026-04-17T00:00:00Z",
    timezone: "Asia/Tokyo",
    frequency: {
      type: SCHEDULE_FREQUENCY.Daily,
      repeats_every: 1,
    },
  },
};

export default DailyFailureSummaryTrigger;
