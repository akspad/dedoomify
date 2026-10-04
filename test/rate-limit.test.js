import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../lib/rate-limit.js";
import page from "../api/page.js";
import dedoom from "../api/dedoom.js";
import image from "../api/image.js";

function res() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
}
const req = (ip = "198.51.100.1") => ({ socket: { remoteAddress: ip } });

test("fixed quota blocks before expensive work, expires and isolates clients", () => {
  let time = 0;
  const limit = createRateLimiter({ vercel: false, limit: 2, now: () => time });
  assert.ok(limit(req()).allowed);
  assert.ok(limit(req()).allowed);
  assert.deepEqual(limit(req()), { allowed: false, retryAfter: 60 });
  assert.ok(limit(req("198.51.100.2")).allowed);
  time = 59_001;
  assert.deepEqual(limit(req()), { allowed: false, retryAfter: 1 });
  time = 60_000;
  assert.ok(limit(req()).allowed);
});

test("untrusted forwarded headers and IPv4-mapped addresses cannot reset quotas", () => {
  const limit = createRateLimiter({ vercel: false, limit: 1 });
  assert.ok(limit({ ...req(), headers: { "x-forwarded-for": "1.1.1.1" } }).allowed);
  assert.ok(!limit({ ...req(), headers: { "x-forwarded-for": "2.2.2.2", "x-real-ip": "3.3.3.3" } }).allowed);
  assert.ok(!limit(req("::ffff:198.51.100.1")).allowed);
});

test("bounded counters refuse new keys without evicting active quotas", () => {
  const limit = createRateLimiter({ vercel: false, limit: 1, maxKeys: 2 });
  assert.ok(limit(req()).allowed);
  assert.ok(limit(req("198.51.100.2")).allowed);
  assert.ok(!limit(req("198.51.100.3")).allowed);
  assert.ok(!limit(req()).allowed);
});

test("page and reader fetches share an injected article quota and return uncached 429", async () => {
  const rateLimit = createRateLimiter({ vercel: false, limit: 1 });
  let calls = 0;
  const first = res();
  await page({ ...req(), method: "GET", url: "/api/page?url=https://example.com/" }, first, {
    rateLimit,
    fetchHtml: async () => { calls++; return { html: "<html><body>AI is misaligned.</body></html>", finalUrl: "https://example.com/", contentType: "text/html" }; },
  });
  assert.equal(first.statusCode, 200);
  for (const endpoint of [page, dedoom]) {
    const response = res();
    await endpoint({ ...req(), method: "GET", url: "/api/page?url=https://example.com/" }, response, { rateLimit, fetchHtml: () => { calls++; }, fetchArticle: () => { calls++; } });
    assert.equal(response.statusCode, 429);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["retry-after"], "60");
  }
  assert.equal(calls, 1);
});

test("pasted text and image requests are throttled before model or fetch work", async () => {
  let called = false;
  const rateLimit = () => ({ allowed: false, retryAfter: 7 });
  for (const [endpoint, request, deps] of [
    [dedoom, { method: "POST", url: "/api/dedoom", body: { text: "AI is misaligned.", mode: "claude" } }, { dedoomArticle: () => { called = true; } }],
    [image, { method: "GET", url: "/api/image?url=https://example.com/x.png" }, { fetchImage: () => { called = true; } }],
  ]) {
    const response = res();
    await endpoint(request, response, { ...deps, rateLimit });
    assert.equal(response.statusCode, 429);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["retry-after"], "7");
  }
  assert.equal(called, false);
});

test("cheap page redirects and invalid methods do not consume the fetch quota", async () => {
  const rateLimit = () => { throw new Error("must not consume"); };
  const response = res();
  await page({ method: "GET", url: "/api/page?url=https://example.com", headers: { "sec-fetch-dest": "document" } }, response, { rateLimit });
  assert.equal(response.statusCode, 302);
  await page({ method: "DELETE", url: "/api/page" }, response, { rateLimit });
  assert.equal(response.statusCode, 405);
});


test("Vercel mode uses only the platform-overwritten client header", () => {
  const limit = createRateLimiter({ vercel: true, limit: 1 });
  const request = { ...req(), headers: { "x-forwarded-for": "198.51.100.7" } };
  assert.ok(limit(request).allowed);
  assert.ok(!limit({ ...request, socket: { remoteAddress: "1.1.1.1" } }).allowed);
  assert.ok(limit({ ...request, headers: { "x-forwarded-for": "198.51.100.8" } }).allowed);
  assert.ok(limit({ headers: { "x-forwarded-for": "invalid" } }).allowed);
  assert.ok(!limit({ headers: { "x-forwarded-for": ["198.51.100.9"] } }).allowed);
});
