import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "./index.js";

class MemoryKv {
  constructor() {
    this.values = new Map();
    this.metadata = new Map();
  }

  async get(key, type) {
    if (!this.values.has(key)) return null;
    const value = this.values.get(key);
    return type === "json" ? JSON.parse(value) : value;
  }

  async getWithMetadata(key, type) {
    return {
      value: await this.get(key, type),
      metadata: this.metadata.get(key) || null,
    };
  }

  async put(key, value, options = {}) {
    this.values.set(key, value);
    if (options.metadata) this.metadata.set(key, options.metadata);
  }

  async delete(key) {
    this.values.delete(key);
    this.metadata.delete(key);
  }

  async list({ prefix = "", cursor, limit = 1000 }) {
    const offset = Number(cursor || 0);
    const names = [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .slice(offset, offset + limit);
    const nextOffset = offset + names.length;
    return {
      keys: names.map((name) => ({ name, metadata: this.metadata.get(name) })),
      list_complete: nextOffset >= [...this.values.keys()].filter((key) => key.startsWith(prefix)).length,
      cursor: String(nextOffset),
    };
  }
}

const token = "cw_test_token_1234567890";

function request(path, options = {}) {
  return new globalThis.Request(`https://classworks.test${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-app-token": token,
      ...(options.headers || {}),
    },
  });
}

test("requires a sufficiently long token", async () => {
  const env = { CLASSWORKS_KV: new MemoryKv() };
  const response = await handleRequest(
    new globalThis.Request("https://classworks.test/kv/_info"),
    env,
  );
  assert.equal(response.status, 401);
});

test("stores, reads and lists JSON values", async () => {
  const env = { CLASSWORKS_KV: new MemoryKv() };
  const write = await handleRequest(
    request("/kv/classworks-data-2026-07-28", {
      method: "POST",
      body: JSON.stringify({ homework: { math: "练习册第 12 页" } }),
    }),
    env,
  );
  assert.equal(write.status, 200);

  const read = await handleRequest(
    request("/kv/classworks-data-2026-07-28"),
    env,
  );
  const readBody = await read.json();
  assert.deepEqual(readBody.value, {
    homework: { math: "练习册第 12 页" },
  });
  assert.ok(readBody.metadata.updatedAt);

  const listed = await handleRequest(request("/kv/_keys"), env);
  const listedBody = await listed.json();
  assert.deepEqual(listedBody.keys, ["classworks-data-2026-07-28"]);
  assert.equal(listedBody.total_rows, 1);
});

test("isolates data by capability token", async () => {
  const env = { CLASSWORKS_KV: new MemoryKv() };
  await handleRequest(
    request("/kv/shared", {
      method: "POST",
      body: JSON.stringify({ visible: true }),
    }),
    env,
  );

  const other = await handleRequest(
    new globalThis.Request("https://classworks.test/kv/shared", {
      headers: { "x-app-token": "cw_another_token_1234567890" },
    }),
    env,
  );
  assert.equal(other.status, 404);
});

test("creates token info and cross-device events", async () => {
  const env = { CLASSWORKS_KV: new MemoryKv() };
  const info = await handleRequest(request("/kv/_token"), env);
  const infoBody = await info.json();
  assert.equal(infoBody.deviceType, "classroom");
  assert.equal(infoBody.isReadOnly, false);

  const created = await handleRequest(
    request("/api/events", {
      method: "POST",
      body: JSON.stringify({ type: "chat", content: { text: "收到" } }),
    }),
    env,
  );
  assert.equal(created.status, 201);

  const events = await handleRequest(request("/api/events?since=0"), env);
  const eventsBody = await events.json();
  assert.equal(eventsBody.events.length, 1);
  assert.equal(eventsBody.events[0].content.text, "收到");
});

test("injects the deployed origin into HTML metadata", async () => {
  const env = {
    CLASSWORKS_KV: new MemoryKv(),
    ASSETS: {
      fetch: async () =>
        new globalThis.Response(
          '<link rel="canonical" href="__CLASSWORKS_ORIGIN__/">',
          { headers: { "content-type": "text/html; charset=UTF-8" } },
        ),
    },
  };

  const response = await handleRequest(
    new globalThis.Request("https://board.example/classworks"),
    env,
  );
  assert.equal(
    await response.text(),
    '<link rel="canonical" href="https://board.example/">',
  );
});
