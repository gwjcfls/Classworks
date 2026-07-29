const API_PREFIXES = ["/kv/", "/api/", "/apps/"];
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_KEYS_PER_NAMESPACE = 10_000;
const EVENT_TTL_SECONDS = 24 * 60 * 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization,Content-Type,X-App-Token,X-Site-Key",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200, extraHeaders = {}) {
  return globalThis.Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function error(message, status = 400, code = "BAD_REQUEST") {
  return json(
    {
      success: false,
      message,
      error: { code, message },
    },
    status,
  );
}

function requestToken(request, url) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token =
    request.headers.get("x-app-token") ||
    bearer ||
    request.headers.get("x-site-key") ||
    url.searchParams.get("token") ||
    "";

  return token.trim();
}

function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function isValidToken(token) {
  return token.length >= 16 && token.length <= 512 && !hasControlCharacters(token);
}

async function sha256(value) {
  const bytes = new globalThis.TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function requestContext(request, env) {
  const url = new URL(request.url);
  const token = requestToken(request, url);
  if (!isValidToken(token)) {
    return {
      response: error(
        "请提供至少 16 个字符的 Classworks 云端 Token",
        401,
        "UNAUTHORIZED",
      ),
    };
  }

  const namespace = (await sha256(token)).slice(0, 40);
  return {
    url,
    token,
    namespace,
    dataPrefix: `namespace:${namespace}:data:`,
    eventPrefix: `namespace:${namespace}:event:`,
    metaKey: `namespace:${namespace}:meta`,
    kv: env.CLASSWORKS_KV,
  };
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new globalThis.Response("请求体过大", { status: 413 });
  }

  const text = await request.text();
  if (new globalThis.TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new globalThis.Response("请求体过大", { status: 413 });
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new globalThis.Response("JSON 格式无效", { status: 400 });
  }
}

async function getMeta(ctx) {
  const stored = await ctx.kv.get(ctx.metaKey, "json");
  if (stored) return stored;

  const now = new Date().toISOString();
  const meta = {
    name: "Classworks 云端作业板",
    note: "教室大屏",
    deviceType: "classroom",
    createdAt: now,
    updatedAt: now,
  };
  await ctx.kv.put(ctx.metaKey, JSON.stringify(meta));
  return meta;
}

function namespaceInfo(ctx, meta) {
  const shortId = ctx.namespace.slice(0, 12);
  return {
    name: meta.name || "Classworks 云端作业板",
    hasAccount: true,
    storage: "Cloudflare Workers KV",
    device: {
      id: shortId,
      uuid: shortId,
      name: meta.note || "教室大屏",
      namespace: shortId,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
    account: {
      id: "self-hosted",
      name: "Cloudflare 自托管空间",
      avatarUrl: "",
      deviceName: meta.note || "教室大屏",
    },
  };
}

function tokenInfo(ctx, meta) {
  const shortId = ctx.namespace.slice(0, 12);
  return {
    deviceType: meta.deviceType || "classroom",
    isReadOnly: false,
    note: meta.note || "教室大屏",
    device: {
      id: shortId,
      name: meta.note || "教室大屏",
      namespace: shortId,
    },
  };
}

async function listAllKeys(kv, prefix) {
  const keys = [];
  let cursor;

  do {
    const page = await kv.list({
      prefix,
      cursor,
      limit: 1000,
    });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && keys.length < MAX_KEYS_PER_NAMESPACE);

  return keys;
}

function safeDataKey(pathname) {
  const raw = pathname.slice("/kv/".length);
  let key;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (!key || key.startsWith("_") || key.length > 512 || hasControlCharacters(key)) {
    return null;
  }
  return key;
}

async function writeEvent(ctx, type, content, request) {
  const timestampMs = Date.now();
  const eventId = `${timestampMs.toString().padStart(13, "0")}-${globalThis.crypto.randomUUID()}`;
  const event = {
    eventId,
    type,
    content,
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    senderId:
      request.headers.get("x-device-id") || ctx.namespace.slice(0, 12),
    senderInfo: {
      deviceType: "classroom",
      deviceName: "Classworks Worker",
      isReadOnly: false,
    },
  };

  await ctx.kv.put(`${ctx.eventPrefix}${eventId}`, JSON.stringify(event), {
    expirationTtl: EVENT_TTL_SECONDS,
  });
  return event;
}

async function handleInfo(request, ctx) {
  const meta = await getMeta(ctx);
  if (request.method === "GET" || request.method === "HEAD") {
    return json(namespaceInfo(ctx, meta));
  }

  if (request.method !== "PUT") {
    return error("不支持的请求方法", 405, "METHOD_NOT_ALLOWED");
  }

  const payload = (await readJson(request)) || {};
  const now = new Date().toISOString();
  const updated = {
    ...meta,
    name:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 100)
        : meta.name,
    note:
      typeof payload.note === "string" && payload.note.trim()
        ? payload.note.trim().slice(0, 100)
        : payload.device?.name?.trim().slice(0, 100) || meta.note,
    updatedAt: now,
  };

  await ctx.kv.put(ctx.metaKey, JSON.stringify(updated));
  return json(namespaceInfo(ctx, updated));
}

async function handleTokenInfo(ctx) {
  const meta = await getMeta(ctx);
  return json(tokenInfo(ctx, meta));
}

async function handleKeyList(ctx) {
  const { searchParams } = ctx.url;
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 1000);
  const skip = Math.max(Number(searchParams.get("skip")) || 0, 0);
  const sortDir = searchParams.get("sortDir") === "desc" ? "desc" : "asc";

  const listed = await listAllKeys(ctx.kv, ctx.dataPrefix);
  let keys = listed.map((item) => item.name.slice(ctx.dataPrefix.length));
  keys.sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (sortDir === "desc") keys.reverse();

  const page = keys.slice(skip, skip + limit);
  return json({
    keys: page,
    total_rows: keys.length,
    current_page: {
      limit,
      skip,
      count: page.length,
    },
    load_more:
      skip + limit < keys.length
        ? `/kv/_keys?sortDir=${sortDir}&limit=${limit}&skip=${skip + limit}`
        : null,
  });
}

async function handleBatchImport(request, ctx) {
  if (request.method !== "POST") {
    return error("不支持的请求方法", 405, "METHOD_NOT_ALLOWED");
  }

  const payload = await readJson(request);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return error("批量导入数据必须是键值对象", 400, "INVALID_BATCH");
  }

  const entries = Object.entries(payload).slice(0, 500);
  await Promise.all(
    entries.map(async ([key, value]) => {
      if (!key || key.startsWith("_") || key.length > 512) return;
      await ctx.kv.put(`${ctx.dataPrefix}${key}`, JSON.stringify(value), {
        metadata: { updatedAt: new Date().toISOString() },
      });
    }),
  );

  await writeEvent(
    ctx,
    "kv-key-changed",
    {
      action: "upsert",
      batch: entries.map(([key]) => key),
      updatedAt: new Date().toISOString(),
    },
    request,
  );

  return json({
    code: 200,
    message: "导入成功",
    data: {
      imported: entries.length,
      failed: [],
    },
  });
}

async function handleData(request, ctx) {
  const key = safeDataKey(ctx.url.pathname);
  if (!key) return error("KV 键名无效", 400, "INVALID_KEY");

  const storageKey = `${ctx.dataPrefix}${key}`;
  if (request.method === "GET" || request.method === "HEAD") {
    const result = await ctx.kv.getWithMetadata(storageKey, "json");
    if (result.value === null) {
      return error("数据不存在", 404, "NOT_FOUND");
    }
    return json({ value: result.value, metadata: result.metadata || null });
  }

  if (request.method === "POST" || request.method === "PUT") {
    const value = await readJson(request);
    const updatedAt = new Date().toISOString();
    const existed = (await ctx.kv.get(storageKey)) !== null;
    await ctx.kv.put(storageKey, JSON.stringify(value), {
      metadata: { updatedAt },
    });
    await writeEvent(
      ctx,
      "kv-key-changed",
      {
        key,
        action: "upsert",
        created: !existed,
        updatedAt,
      },
      request,
    );
    return json({ success: true, key, updatedAt });
  }

  if (request.method === "DELETE") {
    const deletedAt = new Date().toISOString();
    await ctx.kv.delete(storageKey);
    await writeEvent(
      ctx,
      "kv-key-changed",
      { key, action: "delete", deletedAt },
      request,
    );
    return json({ success: true, key, deletedAt });
  }

  return error("不支持的请求方法", 405, "METHOD_NOT_ALLOWED");
}

async function handleEvents(request, ctx) {
  if (request.method === "POST") {
    const payload = (await readJson(request)) || {};
    const allowedTypes = new Set([
      "chat",
      "kv-key-changed",
      "urgent-notice",
      "notification",
    ]);
    if (!allowedTypes.has(payload.type)) {
      return error("事件类型无效", 400, "INVALID_EVENT");
    }
    return json(await writeEvent(ctx, payload.type, payload.content || {}, request), 201);
  }

  if (request.method !== "GET") {
    return error("不支持的请求方法", 405, "METHOD_NOT_ALLOWED");
  }

  const since = Math.max(Number(ctx.url.searchParams.get("since")) || 0, 0);
  const listed = await listAllKeys(ctx.kv, ctx.eventPrefix);
  const candidateNames = listed
    .map((item) => item.name)
    .filter((name) => Number(name.slice(ctx.eventPrefix.length, ctx.eventPrefix.length + 13)) > since)
    .slice(-50);
  const values = await Promise.all(
    candidateNames.map((name) => ctx.kv.get(name, "json")),
  );
  const events = values
    .filter(Boolean)
    .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

  return json({
    events,
    cursor: Math.max(Date.now(), ...events.map((event) => event.timestampMs || 0)),
  });
}

async function handleSetName(request, ctx, type) {
  if (request.method !== "POST") {
    return error("不支持的请求方法", 405, "METHOD_NOT_ALLOWED");
  }

  const payload = (await readJson(request)) || {};
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 100) : "";
  if (!name) return error("名称不能为空", 400, "INVALID_NAME");

  const meta = await getMeta(ctx);
  const updated = {
    ...meta,
    note: name,
    deviceType: type,
    updatedAt: new Date().toISOString(),
  };
  await ctx.kv.put(ctx.metaKey, JSON.stringify(updated));
  return json({ success: true, token: tokenInfo(ctx, updated) });
}

async function handleApiRequest(request, env) {
  if (!env.CLASSWORKS_KV) {
    return error("Cloudflare KV 绑定 CLASSWORKS_KV 未配置", 500, "KV_NOT_CONFIGURED");
  }

  const context = await requestContext(request, env);
  if (context.response) return context.response;

  const { url } = context;
  if (url.pathname === "/kv/_info") return handleInfo(request, context);
  if (url.pathname === "/kv/_token") return handleTokenInfo(context);
  if (url.pathname === "/kv/_keys") return handleKeyList(context);
  if (url.pathname === "/kv/_batchimport") return handleBatchImport(request, context);
  if (url.pathname === "/api/events") return handleEvents(request, context);
  if (/^\/apps\/tokens\/[^/]+\/set-student-name$/.test(url.pathname)) {
    return handleSetName(request, context, "student");
  }
  if (/^\/apps\/tokens\/[^/]+\/set-teacher-name$/.test(url.pathname)) {
    return handleSetName(request, context, "teacher");
  }
  if (url.pathname.startsWith("/kv/")) return handleData(request, context);

  return error("接口不存在", 404, "NOT_FOUND");
}

async function serveAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const origin = new URL(request.url).origin;
  const headers = new globalThis.Headers(response.headers);
  headers.delete("content-length");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  const html = (await response.text()).replaceAll(
    "__CLASSWORKS_ORIGIN__",
    origin,
  );
  return new globalThis.Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new globalThis.Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  if (API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    try {
      return await handleApiRequest(request, env);
    } catch (caught) {
      if (caught instanceof globalThis.Response) {
        return error(
          await caught.text(),
          caught.status,
          caught.status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
        );
      }
      console.error("Classworks Worker error", caught);
      return error("服务器内部错误", 500, "INTERNAL_ERROR");
    }
  }

  return serveAsset(request, env);
}

export default {
  fetch: handleRequest,
};
