import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/page.js";
import { FetchError } from "../lib/fetch-article.js";
import { DOOM_STORIES } from "../public/curated-articles.js";

async function request(url, { method = "GET", dest = "iframe", fetchHtml, rateLimit } = {}) {
  const res = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(body) { this.body = body; },
  };
  await handler({ method, url: "/api/page" + (url === null ? "" : "?url=" + encodeURIComponent(url)), headers: { "sec-fetch-dest": dest } }, res, {
    fetchHtml: fetchHtml ?? (async (finalUrl) => ({ html: "<html><body><h1>The AI is misaligned</h1></body></html>", finalUrl, contentType: "text/html" })),
    rateLimit: rateLimit ?? (() => ({ allowed: true })),
  });
  return res;
}

test("every curated article is eligible for shared caching with safe HTML and disclosure variants", async () => {
  assert.equal(DOOM_STORIES.length, new Set(DOOM_STORIES).size);
  for (const url of DOOM_STORIES) {
    const res = await request(url);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["vary"], "Sec-Fetch-Dest");
    assert.equal(res.headers["cache-control"], "public, max-age=300");
    assert.equal(res.headers["cdn-cache-control"], "no-store");
    assert.equal(res.headers["vercel-cdn-cache-control"], "public, s-maxage=86400, stale-while-revalidate=86400");
    assert.match(res.headers["content-security-policy"], /frame-ancestors 'self'/);
    assert.match(res.body, /<mark /);
  }
});

test("only exact curated URLs qualify, not neighboring pages or query variants", async () => {
  for (const url of ["https://example.com/article", DOOM_STORIES[0] + "?private=1", DOOM_STORIES[0] + "extra", "https://techcrunch.com/"]) {
    const res = await request(url);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "private, max-age=300");
    assert.equal(res.headers["vercel-cdn-cache-control"], undefined);
    assert.equal(res.headers["vary"], "Sec-Fetch-Dest");
  }
});

test("direct visits cannot reuse framed HTML and redirect without fetching", async () => {
  const res = await request(DOOM_STORIES[0], { dest: "document", fetchHtml() { throw new Error("must not fetch"); } });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, "/?url=" + encodeURIComponent(DOOM_STORIES[0]));
  assert.equal(res.headers.vary, "Sec-Fetch-Dest");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["vercel-cdn-cache-control"], undefined);
});

test("curated fetch failures, rate limits, invalid requests and methods never enter shared cache", async () => {
  for (const [url, options, status] of [
    [DOOM_STORIES[0], { fetchHtml() { throw new FetchError("Publisher unavailable", 502); } }, 502],
    [DOOM_STORIES[0], { fetchHtml() { throw new FetchError("Not found", 404); } }, 404],
    [DOOM_STORIES[0], { rateLimit: () => ({ allowed: false, retryAfter: 60 }) }, 429],
    [DOOM_STORIES[0], { method: "POST" }, 405],
    [null, {}, 400],
  ]) {
    const res = await request(url, options);
    assert.equal(res.statusCode, status);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers["vercel-cdn-cache-control"], undefined);
  }
});
