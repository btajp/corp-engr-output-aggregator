import { Manifest } from "deno-slack-sdk/mod.ts";
import SubmissionLogDatastore from "./datastores/submission_log.ts";
import SubmitOutputWorkflow from "./workflows/submit_output.ts";

export default Manifest({
  name: "corp-engr-output-aggregator",
  description:
    "Collect PRJ output submissions from Slack and prepare delivery.",
  icon: "assets/default_new_app_icon.png",
  workflows: [SubmitOutputWorkflow],
  outgoingDomains: [],
  datastores: [SubmissionLogDatastore],
  botScopes: [
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
  ],
});
