import { articleLimit } from "../lib/rate-limit.js";
import { fetchArticle, textToArticle, FetchError } from "../lib/fetch-article.js";
import { dedoomArticle } from "../lib/dedoom.js";

const MAX_TEXT_CHARS = 100_000;
const MODES = new Set(["auto", "claude", "rules"]);

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    // JSON can encode each UTF-16 code unit as six ASCII bytes (\uXXXX).
    if (bytes > MAX_TEXT_CHARS * 6 + 1024) throw new FetchError("That text is too long.", 413);
    chunks.push(buffer);
  }
  // Decode after joining bytes: a UTF-8 character may cross network chunks.
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  return JSON.parse(raw || "{}");
}

// GET  /api/dedoom?url=<article>&mode=rules|claude  (cacheable; rules by default)
// POST /api/dedoom  { "text": "...", "mode": "..." }      (pasted text)
export default async function handler(req, res, deps = {}) {
  const fetchArticleImpl = deps.fetchArticle ?? fetchArticle;
  const dedoomImpl = deps.dedoomArticle ?? dedoomArticle;
  try {
    const params = new URL(req.url, "http://localhost").searchParams;
    if (req.method === "GET") {
      const url = params.get("url");
      const mode = MODES.has(params.get("mode")) ? params.get("mode") : "rules";
      if (!url) return send(res, 400, { error: "Add a link to an article." });
      const limit = (deps.rateLimit ?? articleLimit)(req);
      if (!limit.allowed) return send(res, 429, { error: "Too many articles. Please try again in a minute." }, { "retry-after": String(limit.retryAfter), "cache-control": "no-store" });
      const article = await fetchArticleImpl(url.trim());
      const result = await dedoomImpl(article, { mode });
      // Let the CDN reuse a rewrite for a day, so popular links cost one call.
      return send(res, 200, result, {
        "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
      });
    }
    if (req.method === "POST") {
      const limit = (deps.rateLimit ?? articleLimit)(req);
      if (!limit.allowed) return send(res, 429, { error: "Too many requests. Please try again in a minute." }, { "retry-after": String(limit.retryAfter), "cache-control": "no-store" });
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        if (err instanceof FetchError) throw err;
        return send(res, 400, { error: "The request body wasn't valid JSON." });
      }
      const text = typeof body?.text === "string" ? body.text : "";
      const mode = MODES.has(body?.mode) ? body.mode : "rules";
      if (!text.trim()) return send(res, 400, { error: "Paste some text to de-doom." });
      if (text.length > MAX_TEXT_CHARS) return send(res, 413, { error: "That text is too long." });
      const result = await dedoomImpl(textToArticle(text), { mode });
      return send(res, 200, result, { "cache-control": "no-store" });
    }
    res.setHeader("allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed." });
  } catch (err) {
    if (err instanceof FetchError) return send(res, err.status, { error: err.message });
    console.error(err);
    return send(res, 500, { error: "Something went wrong on our side." });
  }
}
