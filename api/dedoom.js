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
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_TEXT_CHARS * 2) throw new FetchError("That text is too long.", 413);
  }
  return JSON.parse(raw || "{}");
}

// GET  /api/dedoom?url=<article>&mode=auto|claude|rules  (cacheable)
// POST /api/dedoom  { "text": "...", "mode": "..." }      (pasted text)
export default async function handler(req, res, deps = {}) {
  const fetchArticleImpl = deps.fetchArticle ?? fetchArticle;
  const dedoomImpl = deps.dedoomArticle ?? dedoomArticle;
  try {
    const params = new URL(req.url, "http://localhost").searchParams;
    if (req.method === "GET") {
      const url = params.get("url");
      const mode = MODES.has(params.get("mode")) ? params.get("mode") : "auto";
      if (!url) return send(res, 400, { error: "Add a link to an article." });
      const article = await fetchArticleImpl(url.trim());
      const result = await dedoomImpl(article, { mode });
      // Let the CDN reuse a rewrite for a day, so popular links cost one call.
      return send(res, 200, result, {
        "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
      });
    }
    if (req.method === "POST") {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        if (err instanceof FetchError) throw err;
        return send(res, 400, { error: "The request body wasn't valid JSON." });
      }
      const text = typeof body?.text === "string" ? body.text : "";
      const mode = MODES.has(body?.mode) ? body.mode : "auto";
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
