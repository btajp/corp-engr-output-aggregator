export const SUBMISSION_STATUS = {
  accepted: "accepted",
  completed: "completed",
  slackFailed: "slack_failed",
  notionFailed: "notion_failed",
  rolledBack: "rolled_back",
  validationFailed: "validation_failed",
} as const;

export type SubmissionStatus =
  (typeof SUBMISSION_STATUS)[keyof typeof SUBMISSION_STATUS];
