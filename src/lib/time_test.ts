import { assertEquals } from "@std/assert";
import { toJstIsoString } from "./time.ts";

Deno.test("toJstIsoString returns a JST-adjusted ISO string", () => {
  assertEquals(
    toJstIsoString(new Date("2026-04-16T03:00:00.000Z")),
    "2026-04-16T12:00:00.000",
  );
});
