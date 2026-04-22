type AlertClient = {
  chat: {
    postMessage(args: {
      channel: string;
      text: string;
      blocks: unknown[];
    }): Promise<{ ok: boolean; error?: string }>;
  };
};

export async function sendFailureAlert(
  client: AlertClient,
  input: {
    channelId: string;
    submissionId: string;
    userId: string;
    title: string;
    errorCode: string;
    errorMessage: string;
  },
) {
  return await client.chat.postMessage({
    channel: input.channelId,
    text: `submission_id=${input.submissionId} failed`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*投稿処理で失敗が発生しました*\n*投稿者*: <@${input.userId}>\n*submission_id*: \`${input.submissionId}\`\n*title*: ${input.title}\n*error_code*: \`${input.errorCode}\`\n*error_message*: ${input.errorMessage}`,
        },
      },
    ],
  });
}

export async function sendDailyFailureSummary(
  client: AlertClient,
  input: {
    channelId: string;
    summaryDateLabel: string;
    totalFailures: number;
    slackFailures: number;
    notionFailures: number;
    validationFailures: number;
    rolledBackCount: number;
    lines: string[];
  },
) {
  const details = input.lines.length > 0
    ? input.lines.join("\n")
    : "失敗レコードはありませんでした。";

  return await client.chat.postMessage({
    channel: input.channelId,
    text:
      `daily failure summary ${input.summaryDateLabel}: ${input.totalFailures}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Daily failure summary*\n*対象日*: ${input.summaryDateLabel}\n*失敗件数*: ${input.totalFailures}\n*Slack失敗*: ${input.slackFailures}\n*Notion失敗*: ${input.notionFailures}\n*Validation失敗*: ${input.validationFailures}\n*Rollback*: ${input.rolledBackCount}\n\n${details}`,
        },
      },
    ],
  });
}
