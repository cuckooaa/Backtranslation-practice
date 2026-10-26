import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.js";

const env = {
  ALLOWED_ORIGINS: JSON.stringify(["http://localhost:3000"]),
  AI_ENABLED: "true",
  DEEPSEEK_API_KEY: "test-key",
  ACCESS_CODE: "test-access-code",
  AI_RATE_LIMITER: { limit: async () => ({ success: true }) }
};

function request({ origin, accessCode = "wrong", body = {} }) {
  return new Request("https://example.workers.dev/analyze", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "X-Backtranslation-Access": accessCode },
    body: JSON.stringify(body)
  });
}

test("rejects requests from an origin not in the exact allow list", async () => {
  const result = await worker.fetch(request({ origin: "https://not-allowed.example" }), env);
  assert.equal(result.status, 403);
  assert.equal((await result.json()).code, "origin_not_allowed");
});

test("rejects an invalid access code before reading material or calling AI", async () => {
  const result = await worker.fetch(request({ origin: "http://localhost:3000" }), env);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).code, "unauthorized");
});

test("streams server-side material feedback as SSE events", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url, options };
    return new Response("data: {\"choices\":[{\"delta\":{\"content\":\"这是一段\"},\"finish_reason\":null}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"测试反馈。\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const result = await worker.fetch(request({
      origin: "http://localhost:3000",
      accessCode: "test-access-code",
      body: { action: "analyze", materialId: "nce3-01", materialVersion: 1, answer: "My short answer." }
    }), env);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("Content-Type"), /text\/event-stream/);
    assert.match(await result.text(), /\"text\":\"这是一段\"/);
    assert.match(await upstreamRequest.options.body, /\"stream\":true/);
    assert.equal(upstreamRequest.url, "https://api.deepseek.com/chat/completions");
    assert.match(upstreamRequest.options.body, /参考英文/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
