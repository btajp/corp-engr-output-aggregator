export const SUBMISSION_STATUS = {
  accepted: "accepted",
} as const;

export type SubmissionStatus =
  (typeof SUBMISSION_STATUS)[keyof typeof SUBMISSION_STATUS];
