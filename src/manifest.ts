import { Manifest } from "deno-slack-sdk/mod.ts";
import SubmissionLogDatastore from "./datastores/submission_log.ts";
import DailyFailureSummaryWorkflow from "./workflows/daily_failure_summary.ts";
import SubmitOutputWorkflow from "./workflows/submit_output.ts";
import ReplayFailedSubmissionWorkflow from "./workflows/replay_failed_submission.ts";

export default Manifest({
  name: "Output Aggregator V3",
  description:
    "Collect PRJ output submissions from Slack and prepare delivery.",
  icon: "assets/icon.png",
  workflows: [
    SubmitOutputWorkflow,
    ReplayFailedSubmissionWorkflow,
    DailyFailureSummaryWorkflow,
  ],
  outgoingDomains: ["api.notion.com", "corp-engr.btajp.run"],
  datastores: [SubmissionLogDatastore],
  botScopes: [
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
    "users:read",
  ],
});
