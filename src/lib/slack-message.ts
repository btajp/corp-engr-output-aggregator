function escapeMrkdwn(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    ">",
    "&gt;",
  );
}

export type OutputMessageInput = {
  title: string;
  url: string;
  comment: string;
  mention: string;
  coverImageUrl: string;
};

export function buildOutputMessage(input: OutputMessageInput) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "新しいアウトプットが投稿されたよ",
        emoji: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*タイトル*\n<${input.url}|${
          escapeMrkdwn(input.title)
        }>\n\n*投稿者*\n${input.mention}`,
      },
      accessory: {
        type: "image",
        image_url: input.coverImageUrl,
        alt_text: input.title,
      },
    },
    ...(input.comment
      ? [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*一言コメント*\n>${
              escapeMrkdwn(input.comment).replaceAll("\n", "\n>")
            }`,
          },
        },
      ]
      : []),
  ];

  return {
    text: `${input.title} ${input.url}`,
    blocks,
  };
}

export type SlackUserProfile = {
  displayName: string;
  imageUrl?: string;
};

type SlackUserInfoClient = {
  users: {
    info(args: { user: string }): Promise<{
      ok: boolean;
      error?: string;
      user?: {
        real_name?: string;
        profile?: {
          display_name?: string;
          real_name?: string;
          image_192?: string;
          image_512?: string;
        };
      };
    }>;
  };
};

export async function resolveSlackUserProfile(
  client: SlackUserInfoClient,
  userId: string,
): Promise<SlackUserProfile> {
  const response = await client.users.info({ user: userId });
  if (!response.ok) {
    return { displayName: userId };
  }

  const displayName = response.user?.profile?.display_name?.trim() ||
    response.user?.profile?.real_name?.trim() ||
    response.user?.real_name?.trim() ||
    userId;

  return {
    displayName,
    imageUrl: response.user?.profile?.image_512 ??
      response.user?.profile?.image_192,
  };
}
