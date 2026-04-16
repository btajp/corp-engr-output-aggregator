import { assertEquals } from "@std/assert";
import {
  archiveNotionPage,
  createNotionPage,
  createNotionPageWithRetry,
} from "./notion.ts";

Deno.test("createNotionPage uses the existing schema contract", async () => {
  let requestBody: unknown;

  const response = await createNotionPage({
    token: "token",
    databaseId: "database",
    title: "A title",
    url: "https://example.com/post",
    comment: "comment",
    slackName: "okash1n",
    slackTs: "1710000000.000100",
    slackUserId: "U123",
    coverImageUrl: "https://example.com/cover.png",
    userIconUrl: "https://example.com/avatar.png",
    now: new Date("2026-04-16T03:00:00.000Z"),
    fetchImpl: (_url, init) => {
      requestBody = JSON.parse(String((init as RequestInit | undefined)?.body));
      return Promise.resolve(
        new Response('{"id":"page-123"}', { status: 200 }),
      );
    },
  });

  assertEquals(response.pageId, "page-123");
  assertEquals(
    (requestBody as {
      properties: { Title: { title: Array<{ text: { content: string } }> } };
    })
      .properties.Title.title[0].text.content,
    "A title",
  );
  assertEquals(
    (requestBody as { properties: { Date: { date: { time_zone: string } } } })
      .properties.Date.date.time_zone,
    "Asia/Tokyo",
  );
  assertEquals(
    (requestBody as {
      properties: {
        SlackName: { rich_text: Array<{ text: { content: string } }> };
      };
    }).properties.SlackName.rich_text[0].text.content,
    "okash1n",
  );
  assertEquals(
    (requestBody as {
      properties: {
        SlackTs: { rich_text: Array<{ text: { content: string } }> };
      };
    }).properties.SlackTs.rich_text[0].text.content,
    "1710000000.000100",
  );
  assertEquals(
    (requestBody as {
      properties: {
        Description: { rich_text: Array<{ text: { content: string } }> };
      };
    }).properties.Description.rich_text[0].text.content,
    "comment",
  );
  assertEquals(
    (requestBody as { properties: { URL: { url: string } } }).properties.URL
      .url,
    "https://example.com/post",
  );
  assertEquals(
    (requestBody as {
      properties: {
        SlackUserID: { rich_text: Array<{ text: { content: string } }> };
      };
    }).properties.SlackUserID.rich_text[0].text.content,
    "U123",
  );
});

Deno.test("archiveNotionPage archives an existing page", async () => {
  let requestBody: unknown;

  await archiveNotionPage({
    token: "token",
    pageId: "page-123",
    fetchImpl: (_url, init) => {
      requestBody = JSON.parse(String((init as RequestInit | undefined)?.body));
      return Promise.resolve(new Response("{}", { status: 200 }));
    },
  });

  assertEquals((requestBody as { archived: boolean }).archived, true);
});

Deno.test("createNotionPageWithRetry retries once for 429 with Retry-After", async () => {
  let callCount = 0;
  const sleepCalls: number[] = [];

  const response = await createNotionPageWithRetry({
    token: "token",
    databaseId: "database",
    title: "A title",
    url: "https://example.com/post",
    comment: "comment",
    slackName: "okash1n",
    slackTs: "1710000000.000100",
    slackUserId: "U123",
    coverImageUrl: "https://example.com/cover.png",
    fetchImpl: () => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(
            '{"code":"rate_limited","message":"try later"}',
            { status: 429, headers: { "retry-after": "1" } },
          ),
        );
      }
      return Promise.resolve(
        new Response('{"id":"page-123"}', { status: 200 }),
      );
    },
    sleepImpl: (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    },
  });

  assertEquals(response.pageId, "page-123");
  assertEquals(callCount, 2);
  assertEquals(sleepCalls, [1000]);
});
