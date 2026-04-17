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
  posterImageUrl?: string;
  coverImageUrl?: string;
  outputArchiveUrl: string;
  ogpTitle?: string;
  ogpDescription?: string;
  ogpSiteName?: string;
};

function truncate(text: string, maxLength: number) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function normalizeForComparison(text: string) {
  return text
    .toLowerCase()
    .replaceAll(/https?:\/\/\S+/g, " ")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function shouldOmitDescription(title: string, description?: string) {
  if (!description) {
    return true;
  }

  const normalizedTitle = normalizeForComparison(title);
  const normalizedDescription = normalizeForComparison(description);
  if (!normalizedTitle || !normalizedDescription) {
    return false;
  }

  return normalizedTitle.includes(normalizedDescription) ||
    normalizedDescription.includes(normalizedTitle);
}

export function buildOutputMessage(input: OutputMessageInput) {
  const cardTitle = truncate(input.ogpTitle?.trim() || input.title, 160);
  const rawDescription = input.ogpDescription?.trim();
  const cardDescription = rawDescription && !shouldOmitDescription(cardTitle, rawDescription)
    ? truncate(rawDescription, 280)
    : undefined;
  const cardSiteName = input.ogpSiteName?.trim();

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*新しいアウトプットが投稿されたよ*",
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*タイトル:*\n${escapeMrkdwn(input.title)}`,
        },
        {
          type: "mrkdwn",
          text: `*投稿者:*\n${input.mention}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*URL:*\n${escapeMrkdwn(input.url)}`,
      },
    },
    ...(input.comment
      ? [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*一言コメント*\n\`\`\`\n${
              escapeMrkdwn(input.comment)
            }\n\`\`\``,
          },
          ...(input.posterImageUrl
            ? {
              accessory: {
                type: "image",
                image_url: input.posterImageUrl,
                alt_text: "投稿者アイコン",
              },
            }
            : {}),
        },
      ]
      : []),
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          cardSiteName ? `*${escapeMrkdwn(cardSiteName)}*` : undefined,
          `*${escapeMrkdwn(cardTitle)}*`,
          cardDescription ? escapeMrkdwn(cardDescription) : undefined,
        ].filter(Boolean).join("\n"),
      },
    },
    ...(input.coverImageUrl
      ? [{
        type: "image",
        image_url: input.coverImageUrl,
        alt_text: cardTitle,
      }]
      : []),
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*過去の投稿は* <${input.outputArchiveUrl}|こちら>`,
      },
    },
  ];

  return {
    text: `新しいアウトプットが投稿されたよ: ${input.title}`,
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
