import {
  assertEquals,
  assertExists,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import { stub } from "@std/testing/mock";
import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import SubmitOutputFunction from "./submit_output.ts";
import { SUBMISSION_STATUS } from "../lib/submission_status.ts";

const { createContext } = SlackFunctionTester("submit_output");
const ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID",
  "OUTPUT_CHANNEL_ID",
  "ALERT_CHANNEL_ID",
  "DEFAULT_COVER_IMAGE_URL",
] as const;

function resetEnv() {
  for (const key of ENV_KEYS) {
    Deno.env.delete(key);
  }
}

function setRequiredEnv() {
  resetEnv();
  Deno.env.set("NOTION_TOKEN", "test-notion-token");
  Deno.env.set("NOTION_DATABASE_ID", "test-database-id");
  Deno.env.set("OUTPUT_CHANNEL_ID", "COUTPUT");
  Deno.env.set("ALERT_CHANNEL_ID", "CALERT");
  Deno.env.set(
    "DEFAULT_COVER_IMAGE_URL",
    "https://example.com/default-cover.png",
  );
}

Deno.test("submit_output stores an accepted submission", async () => {
  setRequiredEnv();

  try {
    using _stubFetch = stub(
      globalThis,
      "fetch",
      async (url: string | URL | Request, options?: RequestInit) => {
        const request = url instanceof Request
          ? url
          : new Request(url, options);
        assertEquals(request.method, "POST");
        assertEquals(request.url, "https://slack.com/api/apps.datastore.put");

        const body = await request.formData();
        assertEquals(body.get("datastore"), "SubmissionLogs");

        const item = JSON.parse(String(body.get("item")));
        assertEquals(item.requested_by, "U123");
        assertEquals(item.title, "Weekly note");
        assertEquals(item.url, "https://example.com/post");
        assertEquals(item.comment, "hello");
        assertEquals(
          item.cover_image_url,
          "https://example.com/default-cover.png",
        );
        assertEquals(item.slack_status, SUBMISSION_STATUS.accepted);
        assertEquals(item.notion_status, SUBMISSION_STATUS.accepted);
        assertMatch(item.submission_id, /^[0-9A-Z]{26}$/);

        return new Response('{"ok": true}', { status: 200 });
      },
    );

    const { outputs, error } = await SubmitOutputFunction(
      createContext({
        inputs: {
          user: "U123",
          title: "Weekly note",
          url: "https://example.com/post",
          comment: "hello",
        },
      }),
    );

    assertEquals(error, undefined);
    assertExists(outputs?.submissionId);
    assertMatch(outputs.submissionId, /^[0-9A-Z]{26}$/);
  } finally {
    resetEnv();
  }
});

Deno.test("submit_output surfaces datastore errors", async () => {
  setRequiredEnv();

  try {
    using _stubFetch = stub(
      globalThis,
      "fetch",
      async () =>
        await Promise.resolve(
          new Response('{"ok": false, "error": "datastore_error"}', {
            status: 200,
          }),
        ),
    );

    const { outputs, error } = await SubmitOutputFunction(
      createContext({
        inputs: {
          user: "U123",
          title: "Weekly note",
          url: "https://example.com/post",
          comment: "",
        },
      }),
    );

    assertEquals(outputs, undefined);
    assertExists(error);
    assertStringIncludes(error, "datastore_error");
  } finally {
    resetEnv();
  }
});

Deno.test("submit_output rejects an invalid URL", async () => {
  setRequiredEnv();

  try {
    const { outputs, error } = await SubmitOutputFunction(
      createContext({
        inputs: {
          user: "U123",
          title: "Weekly note",
          url: "not-a-url",
          comment: "",
        },
      }),
    );

    assertEquals(outputs, undefined);
    assertEquals(error, "Submitted URL is invalid");
  } finally {
    resetEnv();
  }
});

Deno.test("submit_output rejects a non-http URL", async () => {
  setRequiredEnv();

  try {
    const { outputs, error } = await SubmitOutputFunction(
      createContext({
        inputs: {
          user: "U123",
          title: "Weekly note",
          url: "javascript:alert('xss')",
          comment: "",
        },
      }),
    );

    assertEquals(outputs, undefined);
    assertEquals(error, "Submitted URL must use http or https");
  } finally {
    resetEnv();
  }
});

Deno.test("submit_output stores an empty comment when omitted", async () => {
  setRequiredEnv();

  try {
    using _stubFetch = stub(
      globalThis,
      "fetch",
      async (url: string | URL | Request, options?: RequestInit) => {
        const request = url instanceof Request
          ? url
          : new Request(url, options);
        const body = await request.formData();
        const item = JSON.parse(String(body.get("item")));
        assertEquals(item.comment, "");
        return new Response('{"ok": true}', { status: 200 });
      },
    );

    const { outputs, error } = await SubmitOutputFunction(
      createContext({
        inputs: {
          user: "U123",
          title: "Weekly note",
          url: "https://example.com/post",
        },
      }),
    );

    assertEquals(error, undefined);
    assertExists(outputs?.submissionId);
  } finally {
    resetEnv();
  }
});
