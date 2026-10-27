import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenReelClient, OpenReelError } from "./dist/index.js";
test("project creation sends authorization and real route", async () => {
  global.fetch = async (url, opts) => {
    assert.equal(url, "http://local/api/v1/projects");
    assert.equal(opts.headers.Authorization, "Bearer secret");
    assert.equal(JSON.parse(opts.body).title, "Ocean");
    return new Response(JSON.stringify({ id: "1" }));
  };
  assert.equal(
    (
      await new OpenReelClient({
        apiKey: "secret",
        baseUrl: "http://local",
      }).projects.create({ title: "Ocean" })
    ).id,
    "1",
  );
});
test("typed API failures", async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "Denied" } }), {
      status: 403,
    });
  await assert.rejects(
    new OpenReelClient({ apiKey: "x" }).projects.list(),
    OpenReelError,
  );
});
test("polling stops on failure", async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ status: "failed", error: "Bad media" }));
  await assert.rejects(
    new OpenReelClient({ apiKey: "x" }).jobs.waitForCompletion("1"),
    /Bad media/,
  );
});
