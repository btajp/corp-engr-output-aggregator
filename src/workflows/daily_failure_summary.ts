import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { DailyFailureSummaryFunctionDefinition } from "../functions/daily_failure_summary.ts";

const DailyFailureSummaryWorkflow = DefineWorkflow({
  callback_id: "daily_failure_summary_workflow",
  title: "Output Aggregator Daily Summary",
  description: "前日分の失敗レコードを alert channel に送る",
  input_parameters: {
    properties: {},
    required: [],
  },
});

DailyFailureSummaryWorkflow.addStep(DailyFailureSummaryFunctionDefinition, {});

export default DailyFailureSummaryWorkflow;
